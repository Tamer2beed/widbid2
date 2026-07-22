/* ════════════════════════════════════════════════
   WidBid — server/qa-bot.js
   بوت اختبار شامل (Socket.io) — يجرب أحداث السيرفر بسيناريوهات
   "المفروض تنجح" و"المفروض تُرفض" حسب نظام الصلاحيات (rankGuard)،
   ويكتب تقرير مفصّل بملف JSON + ملف Markdown مقروء.

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
const EVENT_TIMEOUT_MS = 3000;   // أقصى وقت ننتظر فيه رد الحدث
const QA_ROOM_NAME = 'QA_TEST_ROOM';

/* رتب الاختبار — حساب واحد ثابت لكل رتبة */
const TEST_RANKS = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200];
const RANK_NAMES = {
  100: 'Guest', 200: 'Member', 300: 'Protected', 400: 'Royal',
  500: 'Admin', 600: 'SuperAdmin', 700: 'Master', 800: 'SuperMaster',
  900: 'Root', 1000: 'SuperRoot', 1100: 'Owner', 1200: 'SuperOwner',
};

const results = [];      // كل نتائج الاختبار
let qaRoomId = null;     // يُملأ بعد إنشاء/جلب غرفة الاختبار
const users = {};        // { rank: {id, username} }
const sockets = {};      // { rank: socketInstance }

/* ══════════════════════════════════════════════
   1) تجهيز حسابات الاختبار + غرفة الاختبار بقاعدة البيانات
══════════════════════════════════════════════ */
async function ensureTestUser(rank) {
  const username = `qa_test_${rank}`;
  const [rows] = await db.query('SELECT id, username, rank FROM users WHERE username = ?', [username]);
  if (rows.length) {
    // تأكد الرتبة محدّثة لو تغيّرت يدوياً
    if (rows[0].rank !== rank) {
      await db.query('UPDATE users SET rank = ? WHERE id = ?', [rank, rows[0].id]);
    }
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
   2) اتصال Socket.io لكل رتبة اختبار
══════════════════════════════════════════════ */
function connectSocket(rank) {
  return new Promise((resolve, reject) => {
    const sock = io(SERVER_URL, { transports: ['websocket'], reconnection: false, timeout: 5000 });
    const timer = setTimeout(() => reject(new Error(`timeout الاتصال (${RANK_NAMES[rank]})`)), 6000);
    sock.on('connect', () => {
      clearTimeout(timer);
      sock.emit('joinRoom', { room_id: qaRoomId, username: users[rank].username, user_id: users[rank].id });
      resolve(sock);
    });
    sock.on('connect_error', (e) => { clearTimeout(timer); reject(e); });
  });
}

/* ══════════════════════════════════════════════
   3) دالة تشغيل اختبار حدث واحد
   test = {
     name, description, event, actorRank,
     payload: (ctx) => object,
     expect: 'allow' | 'deny',
     successEvents: [اسم حدث ينتظره عند النجاح],   (اختياري)
     minActorRank                                    (اختياري، للتوثيق فقط)
   }
══════════════════════════════════════════════ */
async function runTest(test) {
  const actorSock = sockets[test.actorRank];
  if (!actorSock) {
    results.push({ ...baseResult(test), status: 'SKIP', note: 'لا يوجد socket لهذي الرتبة' });
    return;
  }

  const payload = test.payload({ qaRoomId, users });
  let outcome = null; // 'allowed' | 'denied' | 'timeout'
  let detail = '';

  await new Promise((resolve) => {
    let settled = false;
    const finish = (o, d) => { if (settled) return; settled = true; outcome = o; detail = d; resolve(); };

    const onError = (msg) => finish('denied', typeof msg === 'string' ? msg : JSON.stringify(msg));
    actorSock.once('error', onError);

    const successListeners = (test.successEvents || []).map((evName) => {
      const handler = (data) => finish('allowed', `event:${evName}`);
      actorSock.once(evName, handler);
      return { evName, handler };
    });

    const timer = setTimeout(() => finish('timeout', 'لا رد خلال المهلة (لا نجاح ولا رفض صريح)'), EVENT_TIMEOUT_MS);

    actorSock.emit(test.event, payload);

    // تنظيف المستمعين بعد الحسم
    const cleanup = () => {
      actorSock.off('error', onError);
      successListeners.forEach(({ evName, handler }) => actorSock.off(evName, handler));
      clearTimeout(timer);
    };
    const originalResolve = resolve;
    resolve = () => { cleanup(); originalResolve(); }; // eslint-disable-line no-param-reassign
  });

  const passed =
    (test.expect === 'allow' && outcome === 'allowed') ||
    (test.expect === 'deny' && outcome === 'denied') ||
    (test.expect === 'allow_or_noop' && outcome !== 'denied'); // لأحداث بلا رد صريح عند النجاح

  results.push({
    ...baseResult(test),
    status: passed ? 'PASS' : 'FAIL',
    outcome, detail,
  });
}

function baseResult(test) {
  return {
    name: test.name,
    description: test.description,
    event: test.event,
    actor: `${RANK_NAMES[test.actorRank]} (${test.actorRank})`,
    expected: test.expect,
  };
}

/* ══════════════════════════════════════════════
   4) مصفوفة الاختبارات
   ملاحظة: هذي مجموعة أساسية تغطي أحداث الصلاحيات الحرجة
   (S15). يمكن إضافة المزيد بنفس النمط بسهولة.
══════════════════════════════════════════════ */
function buildTestMatrix() {
  const T = [];

  /* ── إرسال رسالة: أي رتبة تقدر ─── */
  T.push({
    name: 'sendMessage_guest',
    description: 'زائر يرسل رسالة عادية',
    event: 'sendMessage', actorRank: 100, expect: 'allow_or_noop',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, user_id: users[100].id, message: 'رسالة اختبار QA', username: users[100].username }),
  });

  /* ── muteUser: يحتاج رتبة 500+ وتفوق الهدف ─── */
  T.push({
    name: 'muteUser_admin_on_member_allow',
    description: 'Admin (500) يكتم Member (200) — يجب أن ينجح',
    event: 'muteUser', actorRank: 500, expect: 'allow_or_noop',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[200].username, by: users[500].username }),
  });
  T.push({
    name: 'muteUser_member_on_admin_deny',
    description: 'Member (200) يحاول يكتم Admin (500) — يجب أن يُرفض',
    event: 'muteUser', actorRank: 200, expect: 'deny',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[500].username, by: users[200].username }),
  });

  /* ── kickUser: نفس منطق muteUser ─── */
  T.push({
    name: 'kickUser_master_on_admin_allow',
    description: 'Master (700) يطرد Admin (500) — يجب أن ينجح',
    event: 'kickUser', actorRank: 700, expect: 'allow_or_noop',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[500].username, by: users[700].username }),
  });
  T.push({
    name: 'kickUser_admin_on_master_deny',
    description: 'Admin (500) يحاول يطرد Master (700) — يجب أن يُرفض',
    event: 'kickUser', actorRank: 500, expect: 'deny',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[700].username, by: users[500].username }),
  });

  /* ── assignRole: أخطر ثغرة تم اكتشافها بـ S15 ─── */
  T.push({
    name: 'assignRole_master_grant_below_own_allow',
    description: 'Master (700) يرقّي Guest لرتبة أقل من رتبته (Admin=500) — يجب أن ينجح',
    event: 'assignRole', actorRank: 700, expect: 'allow_or_noop',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[100].username, new_rank: 500, by: users[700].username }),
  });
  T.push({
    name: 'assignRole_master_grant_superowner_deny',
    description: '🚨 Master (700) يحاول يرقّي أحد لـ SuperOwner (1200) — يجب أن يُرفض قطعياً',
    event: 'assignRole', actorRank: 700, expect: 'deny',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[200].username, new_rank: 1200, by: users[700].username }),
  });
  T.push({
    name: 'assignRole_admin_grant_role_deny',
    description: 'Admin (500) يحاول يستخدم assignRole أصلاً (أقل من الحد الأدنى 700) — يجب أن يُرفض',
    event: 'assignRole', actorRank: 500, expect: 'deny',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[100].username, new_rank: 300, by: users[500].username }),
  });

  /* ── warnUser ─── */
  T.push({
    name: 'warnUser_superadmin_on_admin_allow',
    description: 'SuperAdmin (600) يحذّر Admin (500) — يجب أن ينجح',
    event: 'warnUser', actorRank: 600, expect: 'allow_or_noop',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[500].username, reason: 'اختبار QA', by: users[600].username }),
  });
  T.push({
    name: 'warnUser_admin_on_superadmin_deny',
    description: 'Admin (500) يحاول يحذّر SuperAdmin (600) — يجب أن يُرفض',
    event: 'warnUser', actorRank: 500, expect: 'deny',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[600].username, reason: 'اختبار QA', by: users[500].username }),
  });

  /* ── banIP ─── */
  T.push({
    name: 'banIP_master_on_admin_allow',
    description: 'Master (700) يحظر IP خاص بـ Admin (500) — يجب أن ينجح',
    event: 'banIP', actorRank: 700, expect: 'allow_or_noop',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[500].username, by: users[700].username }),
  });
  T.push({
    name: 'banIP_admin_deny_insufficient_rank',
    description: 'Admin (500) يحاول يستخدم banIP (أقل من الحد الأدنى 700) — يجب أن يُرفض',
    event: 'banIP', actorRank: 500, expect: 'deny',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[200].username, by: users[500].username }),
  });

  /* ── freezeUser ─── */
  T.push({
    name: 'freezeUser_admin_on_member_allow',
    description: 'Admin (500) يجمّد Member (200) — يجب أن ينجح',
    event: 'freezeUser', actorRank: 500, expect: 'allow_or_noop',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[200].username, by: users[500].username }),
  });
  T.push({
    name: 'freezeUser_member_on_admin_deny',
    description: 'Member (200) يحاول يجمّد Admin (500) — يجب أن يُرفض',
    event: 'freezeUser', actorRank: 200, expect: 'deny',
    payload: ({ qaRoomId, users }) => ({ room_id: qaRoomId, target: users[500].username, by: users[200].username }),
  });

  /* ── إجراءات جماعية (بلا هدف فردي) — تحقق حد أدنى فقط ─── */
  T.push({
    name: 'setTheme_master_allow',
    description: 'Master (700) يغيّر ثيم الغرفة — يجب أن ينجح',
    event: 'setTheme', actorRank: 700, expect: 'allow_or_noop',
    payload: ({ qaRoomId }) => ({ room_id: qaRoomId, theme: 'sea' }),
  });
  T.push({
    name: 'setTheme_guest_deny',
    description: 'زائر يحاول يغيّر ثيم الغرفة — يجب أن يُرفض',
    event: 'setTheme', actorRank: 100, expect: 'deny',
    payload: ({ qaRoomId }) => ({ room_id: qaRoomId, theme: 'sea' }),
  });

  return T;
}

/* ══════════════════════════════════════════════
   5) تشغيل كل الاختبارات + كتابة التقرير
══════════════════════════════════════════════ */
async function main() {
  console.log(`🤖 QA Bot — الاتصال بـ ${SERVER_URL}`);

  console.log('⏳ تجهيز حسابات الاختبار...');
  for (const rank of TEST_RANKS) {
    users[rank] = await ensureTestUser(rank);
  }
  console.log(`✅ ${TEST_RANKS.length} حساب اختبار جاهز`);

  console.log('⏳ تجهيز غرفة الاختبار...');
  qaRoomId = await ensureTestRoom();
  console.log(`✅ غرفة الاختبار: #${qaRoomId}`);

  console.log('⏳ فتح اتصالات Socket.io لكل رتبة...');
  for (const rank of TEST_RANKS) {
    try {
      sockets[rank] = await connectSocket(rank);
    } catch (e) {
      console.error(`❌ فشل اتصال ${RANK_NAMES[rank]}:`, e.message);
    }
  }
  await new Promise((r) => setTimeout(r, 500)); // انتظار استقرار joinRoom

  const matrix = buildTestMatrix();
  console.log(`⏳ تشغيل ${matrix.length} اختبار...`);
  for (const test of matrix) {
    process.stdout.write(`  ${test.name}... `);
    await runTest(test);
    const last = results[results.length - 1];
    console.log(last.status === 'PASS' ? '✅' : last.status === 'SKIP' ? '⏭️' : '❌');
  }

  /* إغلاق كل الاتصالات */
  Object.values(sockets).forEach((s) => s && s.disconnect());

  /* كتابة التقارير */
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(__dirname, '..', 'qa-reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, `qa-report-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ server: SERVER_URL, ranAt: new Date().toISOString(), results }, null, 2), 'utf-8');

  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const skipCount = results.filter((r) => r.status === 'SKIP').length;

  let md = `# تقرير QA — WidBid\n\n`;
  md += `**التاريخ:** ${new Date().toLocaleString('ar')}\n`;
  md += `**السيرفر:** ${SERVER_URL}\n\n`;
  md += `## الملخص\n`;
  md += `- ✅ نجح: ${passCount}\n- ❌ فشل: ${failCount}\n- ⏭️ تخطّي: ${skipCount}\n- **الإجمالي:** ${results.length}\n\n`;

  if (failCount > 0) {
    md += `## ❌ الاختبارات الفاشلة (تحتاج مراجعة فورية)\n\n`;
    results.filter((r) => r.status === 'FAIL').forEach((r) => {
      md += `### ${r.name}\n`;
      md += `- **الوصف:** ${r.description}\n`;
      md += `- **الحدث:** \`${r.event}\` | **الفاعل:** ${r.actor}\n`;
      md += `- **المتوقع:** ${r.expected} | **الفعلي:** ${r.outcome}\n`;
      md += `- **التفاصيل:** ${r.detail}\n\n`;
    });
  }

  md += `## ✅ كل النتائج بالتفصيل\n\n`;
  md += `| الاختبار | الحدث | الفاعل | المتوقع | الفعلي | الحالة |\n`;
  md += `|---|---|---|---|---|---|\n`;
  results.forEach((r) => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'SKIP' ? '⏭️' : '❌';
    md += `| ${r.name} | ${r.event} | ${r.actor} | ${r.expected} | ${r.outcome || '-'} | ${icon} |\n`;
  });

  const mdPath = path.join(outDir, `qa-report-${stamp}.md`);
  fs.writeFileSync(mdPath, md, 'utf-8');

  console.log(`\n📊 النتيجة: ✅ ${passCount} نجح | ❌ ${failCount} فشل | ⏭️ ${skipCount} تخطّي`);
  console.log(`📄 التقرير: ${mdPath}`);
  console.log(`📄 JSON خام: ${jsonPath}`);

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('❌ خطأ عام بالبوت:', e);
  process.exit(2);
});
