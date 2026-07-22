/* ════════════════════════════════════════════════
   WidBid — server/qa-bot.js  (v2)
   بوت اختبار شامل (Socket.io) — يجرب أحداث السيرفر بسيناريوهات
   "المفروض تنجح" و"المفروض تُرفض" حسب نظام الصلاحيات (rankGuard)،
   ويكتب تقرير مفصّل بملف JSON + ملف Markdown مقروء.

   v2: الاختبارات "المدمّرة" (طرد/تجميد/حظر) تستخدم حسابات هدف
   مستقلة بدل مشاركة حسابات الرتب — لأن الطرد/التجميد يخرج الهدف
   من الغرفة نهائياً، فيكسر أي اختبار لاحق يحتاج نفس الهدف.

   الاستخدام:
     node server/qa-bot.js
     node server/qa-bot.js --url http://192.168.1.244:3000
   ════════════════════════════════════════════════ */
'use strict';
require('dotenv').config();
const { io } = require('socket.io-client');
const db = require('./db');
const fs = require('fs');
const path = require('path');

/* ── إعدادات عامة ───────────────────────────────── */
const args = process.argv.slice(2);
const urlArgIdx = args.indexOf('--url');
const SERVER_URL = urlArgIdx !== -1 ? args[urlArgIdx + 1] : (process.env.QA_SERVER_URL || 'http://localhost:3000');
const EVENT_TIMEOUT_MS = 3000;
const QA_ROOM_NAME = 'QA_TEST_ROOM';

const TEST_RANKS = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200];
const RANK_NAMES = {
  100: 'Guest', 200: 'Member', 300: 'Protected', 400: 'Royal',
  500: 'Admin', 600: 'SuperAdmin', 700: 'Master', 800: 'SuperMaster',
  900: 'Root', 1000: 'SuperRoot', 1100: 'Owner', 1200: 'SuperOwner',
};

/* حسابات هدف مستقلة (مرة استخدام واحدة لكل اختبار مدمّر) */
const DISPOSABLE_TARGETS = [
  { key: 'kickTarget',   rank: 500 },
  { key: 'freezeTarget', rank: 200 },
  { key: 'banIPTarget',  rank: 500 },
];

const results = [];
let qaRoomId = null;
const users = {};          // { [rankOrKey]: {id, username} }
const sockets = {};        // { [rankOrKey]: socket }

/* ══════════════════════════════════════════════
   1) تجهيز الحسابات والغرفة
══════════════════════════════════════════════ */
async function ensureUser(username, rank) {
  const [rows] = await db.query('SELECT id, username, rank FROM users WHERE username = ?', [username]);
  if (rows.length) {
    if (rows[0].rank !== rank) await db.query('UPDATE users SET rank = ? WHERE id = ?', [rank, rows[0].id]);
    return { id: rows[0].id, username };
  }
  const [res] = await db.query(
    'INSERT INTO users (username, email, password_hash, rank, is_active) VALUES (?,?,?,?,1)',
    [username, `${username}@qa.local`, 'qa-bot-no-login', rank]
  );
  return { id: res.insertId, username };
}

async function ensureTestRoom() {
  const [rows] = await db.query('SELECT id FROM rooms WHERE name = ?', [QA_ROOM_NAME]);
  if (rows.length) return rows[0].id;
  const ownerRow = users[1100] || users[1200];
  const [res] = await db.query(
    'INSERT INTO rooms (name, token, type, owner_id, welcome_message, max_capacity) VALUES (?,?,?,?,?,?)',
    [QA_ROOM_NAME, 'QA-TESTROOM-' + Date.now(), 'private', ownerRow ? ownerRow.id : null, 'غرفة اختبار آلية — لا تُستخدم للدردشة الحقيقية', 500]
  );
  return res.insertId;
}

/* ══════════════════════════════════════════════
   2) اتصال Socket.io
══════════════════════════════════════════════ */
function connectSocket(user) {
  return new Promise((resolve, reject) => {
    const sock = io(SERVER_URL, { transports: ['websocket'], reconnection: false, timeout: 5000 });
    const timer = setTimeout(() => reject(new Error(`timeout الاتصال (${user.username})`)), 6000);
    sock.on('connect', () => {
      clearTimeout(timer);
      sock.emit('joinRoom', { room_id: qaRoomId, username: user.username, user_id: user.id });
      resolve(sock);
    });
    sock.on('connect_error', (e) => { clearTimeout(timer); reject(e); });
  });
}

/* ══════════════════════════════════════════════
   3) تشغيل اختبار واحد
══════════════════════════════════════════════ */
async function runTest(test) {
  const actorSock = sockets[test.actorKey];
  if (!actorSock) {
    results.push({ ...baseResult(test), status: 'SKIP', note: 'لا يوجد socket لهذا الفاعل' });
    return;
  }

  const payload = test.payload({ qaRoomId, users });
  let outcome = null;
  let detail = '';

  await new Promise((resolve) => {
    let settled = false;
    const cleanupFns = [];
    const finish = (o, d) => {
      if (settled) return;
      settled = true; outcome = o; detail = d;
      cleanupFns.forEach((fn) => fn());
      resolve();
    };

    const onError = (msg) => finish('denied', typeof msg === 'string' ? msg : JSON.stringify(msg));
    actorSock.once('error', onError);
    cleanupFns.push(() => actorSock.off('error', onError));

    (test.successEvents || []).forEach((evName) => {
      const handler = () => finish('allowed', `event:${evName}`);
      actorSock.once(evName, handler);
      cleanupFns.push(() => actorSock.off(evName, handler));
    });

    const timer = setTimeout(() => finish('timeout', 'لا رد خلال المهلة'), EVENT_TIMEOUT_MS);
    cleanupFns.push(() => clearTimeout(timer));

    actorSock.emit(test.event, payload);
  });

  const passed =
    (test.expect === 'allow' && outcome === 'allowed') ||
    (test.expect === 'deny' && outcome === 'denied') ||
    (test.expect === 'allow_or_noop' && outcome !== 'denied');

  results.push({ ...baseResult(test), status: passed ? 'PASS' : 'FAIL', outcome, detail });
}

function baseResult(test) {
  return {
    name: test.name,
    description: test.description,
    event: test.event,
    actor: `${RANK_NAMES[test.actorRank] || test.actorKey} (${test.actorRank || ''})`,
    expected: test.expect,
  };
}

/* ══════════════════════════════════════════════
   4) مصفوفة الاختبارات
══════════════════════════════════════════════ */
function buildTestMatrix() {
  const T = [];

  T.push({
    name: 'sendMessage_guest',
    description: 'زائر يرسل رسالة عادية',
    event: 'sendMessage', actorKey: 100, actorRank: 100, expect: 'allow_or_noop',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, user_id: users[100].id, message: 'رسالة اختبار QA', username: users[100].username }),
  });

  T.push({
    name: 'muteUser_admin_on_member_allow',
    description: 'Admin (500) يكتم Member (200) — يجب أن ينجح',
    event: 'muteUser', actorKey: 500, actorRank: 500, expect: 'allow_or_noop',
    successEvents: ['userMuted'],
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[200].username, by: users[500].username }),
  });
  T.push({
    name: 'muteUser_member_on_admin_deny',
    description: 'Member (200) يحاول يكتم Admin (500) — يجب أن يُرفض',
    event: 'muteUser', actorKey: 200, actorRank: 200, expect: 'deny',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[500].username, by: users[200].username }),
  });

  T.push({
    name: 'kickUser_master_on_disposable_allow',
    description: 'Master (700) يطرد حساب هدف مستقل (500) — يجب أن ينجح',
    event: 'kickUser', actorKey: 700, actorRank: 700, expect: 'allow_or_noop',
    successEvents: ['userKicked'],
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users.kickTarget.username, by: users[700].username }),
  });
  T.push({
    name: 'kickUser_admin_on_master_deny',
    description: 'Admin (500) يحاول يطرد Master (700) — يجب أن يُرفض',
    event: 'kickUser', actorKey: 500, actorRank: 500, expect: 'deny',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[700].username, by: users[500].username }),
  });

  T.push({
    name: 'assignRole_master_grant_below_own_allow',
    description: 'Master (700) يرقّي Guest لرتبة أقل من رتبته (Admin=500) — يجب أن ينجح',
    event: 'assignRole', actorKey: 700, actorRank: 700, expect: 'allow_or_noop',
    successEvents: ['roleAssigned'],
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[100].username, new_rank: 500, by: users[700].username }),
  });
  T.push({
    name: 'assignRole_master_grant_superowner_deny',
    description: '🚨 Master (700) يحاول يرقّي أحد لـ SuperOwner (1200) — يجب أن يُرفض قطعياً',
    event: 'assignRole', actorKey: 700, actorRank: 700, expect: 'deny',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[200].username, new_rank: 1200, by: users[700].username }),
  });
  T.push({
    name: 'assignRole_admin_grant_role_deny',
    description: 'Admin (500) يحاول يستخدم assignRole (أقل من الحد الأدنى 700) — يجب أن يُرفض',
    event: 'assignRole', actorKey: 500, actorRank: 500, expect: 'deny',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[100].username, new_rank: 300, by: users[500].username }),
  });

  T.push({
    name: 'warnUser_superadmin_on_admin_allow',
    description: 'SuperAdmin (600) يحذّر Admin (500) — يجب أن ينجح',
    event: 'warnUser', actorKey: 600, actorRank: 600, expect: 'allow_or_noop',
    successEvents: ['userWarned'],
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[500].username, reason: 'اختبار QA', by: users[600].username }),
  });
  T.push({
    name: 'warnUser_admin_on_superadmin_deny',
    description: 'Admin (500) يحاول يحذّر SuperAdmin (600) — يجب أن يُرفض (الآن السيرفر يرسل خطأ صريح)',
    event: 'warnUser', actorKey: 500, actorRank: 500, expect: 'deny',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[600].username, reason: 'اختبار QA', by: users[500].username }),
  });

  T.push({
    name: 'banIP_master_on_disposable_allow',
    description: 'Master (700) يحظر IP حساب هدف مستقل (500) — يجب أن ينجح',
    event: 'banIP', actorKey: 700, actorRank: 700, expect: 'allow_or_noop',
    successEvents: ['ipBanned'],
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users.banIPTarget.username, by: users[700].username }),
  });
  T.push({
    name: 'banIP_admin_deny_insufficient_rank',
    description: 'Admin (500) يحاول يستخدم banIP (أقل من الحد الأدنى 700) — يجب أن يُرفض (الآن السيرفر يرسل خطأ صريح)',
    event: 'banIP', actorKey: 500, actorRank: 500, expect: 'deny',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[200].username, by: users[500].username }),
  });

  T.push({
    name: 'freezeUser_admin_on_disposable_allow',
    description: 'Admin (500) يجمّد حساب هدف مستقل (200) — يجب أن ينجح',
    event: 'freezeUser', actorKey: 500, actorRank: 500, expect: 'allow_or_noop',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users.freezeTarget.username, by: users[500].username }),
  });
  T.push({
    name: 'freezeUser_member_on_admin_deny',
    description: 'Member (200) يحاول يجمّد Admin (500) — يجب أن يُرفض',
    event: 'freezeUser', actorKey: 200, actorRank: 200, expect: 'deny',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[500].username, by: users[200].username }),
  });

  /* setTheme يحتاج Root (900) فعلياً بالسيرفر — مو Master */
  T.push({
    name: 'setTheme_root_allow',
    description: 'Root (900) يغيّر ثيم الغرفة لقيمة صحيحة (ocean) — يجب أن ينجح',
    event: 'setTheme', actorKey: 900, actorRank: 900, expect: 'allow_or_noop',
    successEvents: ['themeChanged'],
    payload: ({ qaRoomId }) => ({ room_id: qaRoomId, theme: 'ocean' }),
  });
  T.push({
    name: 'setTheme_master_deny',
    description: 'Master (700) يحاول يغيّر الثيم (أقل من الحد الأدنى الفعلي 900) — يجب أن يُرفض',
    event: 'setTheme', actorKey: 700, actorRank: 700, expect: 'deny',
    payload: ({ qaRoomId }) => ({ room_id: qaRoomId, theme: 'ocean' }),
  });
  T.push({
    name: 'setTheme_guest_deny',
    description: 'زائر يحاول يغيّر ثيم الغرفة — يجب أن يُرفض',
    event: 'setTheme', actorKey: 100, actorRank: 100, expect: 'deny',
    payload: ({ qaRoomId }) => ({ room_id: qaRoomId, theme: 'ocean' }),
  });

  return T;
}

/* ══════════════════════════════════════════════
   5) التشغيل الرئيسي
══════════════════════════════════════════════ */
async function main() {
  console.log(`🤖 QA Bot v2 — الاتصال بـ ${SERVER_URL}`);

  console.log('⏳ تجهيز حسابات الرتب...');
  for (const rank of TEST_RANKS) {
    users[rank] = await ensureUser(`qa_test_${rank}`, rank);
  }
  console.log('⏳ تجهيز حسابات الأهداف المستقلة (Disposable Targets)...');
  for (const d of DISPOSABLE_TARGETS) {
    users[d.key] = await ensureUser(`qa_disposable_${d.key}_${Date.now()}`.slice(0, 45), d.rank);
  }
  console.log(`✅ ${TEST_RANKS.length + DISPOSABLE_TARGETS.length} حساب اختبار جاهز`);

  console.log('⏳ تجهيز غرفة الاختبار...');
  qaRoomId = await ensureTestRoom();
  console.log(`✅ غرفة الاختبار: #${qaRoomId}`);

  console.log('⏳ فتح اتصالات Socket.io...');
  for (const rank of TEST_RANKS) {
    try { sockets[rank] = await connectSocket(users[rank]); }
    catch (e) { console.error(`❌ فشل اتصال ${RANK_NAMES[rank]}:`, e.message); }
  }
  for (const d of DISPOSABLE_TARGETS) {
    try { sockets[d.key] = await connectSocket(users[d.key]); }
    catch (e) { console.error(`❌ فشل اتصال ${d.key}:`, e.message); }
  }
  await new Promise((r) => setTimeout(r, 800));

  const matrix = buildTestMatrix();
  console.log(`⏳ تشغيل ${matrix.length} اختبار...`);
  for (const test of matrix) {
    process.stdout.write(`  ${test.name}... `);
    await runTest(test);
    const last = results[results.length - 1];
    console.log(last.status === 'PASS' ? '✅' : last.status === 'SKIP' ? '⏭️' : '❌');
  }

  Object.values(sockets).forEach((s) => s && s.disconnect());

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(__dirname, '..', 'qa-reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, `qa-report-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ server: SERVER_URL, ranAt: new Date().toISOString(), results }, null, 2), 'utf-8');

  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const skipCount = results.filter((r) => r.status === 'SKIP').length;

  let md = `# تقرير QA — WidBid (v2)\n\n`;
  md += `**التاريخ:** ${new Date().toLocaleString('ar')}\n`;
  md += `**السيرفر:** ${SERVER_URL}\n\n`;
  md += `## الملخص\n- ✅ نجح: ${passCount}\n- ❌ فشل: ${failCount}\n- ⏭️ تخطّي: ${skipCount}\n- **الإجمالي:** ${results.length}\n\n`;

  if (failCount > 0) {
    md += `## ❌ الاختبارات الفاشلة (تحتاج مراجعة فورية)\n\n`;
    results.filter((r) => r.status === 'FAIL').forEach((r) => {
      md += `### ${r.name}\n- **الوصف:** ${r.description}\n- **الحدث:** \`${r.event}\` | **الفاعل:** ${r.actor}\n- **المتوقع:** ${r.expected} | **الفعلي:** ${r.outcome}\n- **التفاصيل:** ${r.detail}\n\n`;
    });
  }

  md += `## ✅ كل النتائج\n\n| الاختبار | الحدث | الفاعل | المتوقع | الفعلي | الحالة |\n|---|---|---|---|---|---|\n`;
  results.forEach((r) => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'SKIP' ? '⏭️' : '❌';
    md += `| ${r.name} | ${r.event} | ${r.actor} | ${r.expected} | ${r.outcome || '-'} | ${icon} |\n`;
  });

  const mdPath = path.join(outDir, `qa-report-${stamp}.md`);
  fs.writeFileSync(mdPath, md, 'utf-8');

  console.log(`\n📊 النتيجة: ✅ ${passCount} نجح | ❌ ${failCount} فشل | ⏭️ ${skipCount} تخطّي`);
  console.log(`📄 التقرير: ${mdPath}`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('❌ خطأ عام بالبوت:', e);
  process.exit(2);
});
