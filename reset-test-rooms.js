/* ════════════════════════════════════════
   WidBid — reset-test-rooms.js
   يمسح كل الغرف الحالية (والرسائل ونسب الإشراف المرتبطة بها)
   ويُنشئ 3 غرف اختبار نظيفة فقط + حساب Super Master (رتبة 800)
   مربوط بالثلاث غرف — مخصص لجلسات الاختبار بواجهة v2.

   ⚠️  يحذف كل الغرف الموجودة بالكامل (بما فيها أي غرف قديمة/وهمية
       من seed.js أو غرفة الاختبار v2 رقم 135 السابقة). لا يحذف
       حسابات المستخدمين غير حساب SuperMaster_TEST نفسه (يُعاد إنشاؤه
       لو كان موجوداً مسبقاً).

   شغّل مرة واحدة: node reset-test-rooms.js
════════════════════════════════════════ */
require('dotenv').config();
const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const DB = {
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASS     || process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'widbid',
  port:     parseInt(process.env.DB_PORT) || 3306,
};

const TEST_PASS = '123456';
const SM_USERNAME = 'SuperMaster_TEST';
const SM_EMAIL    = 'master@widbid.com';

const TEST_ROOMS = [
  { name: 'غرفة الاختبار 1', theme: 'candy',   welcome: 'مرحباً بكم في غرفة الاختبار 1 🌟' },
  { name: 'غرفة الاختبار 2', theme: 'ocean',   welcome: 'مرحباً بكم في غرفة الاختبار 2 🌊' },
  { name: 'غرفة الاختبار 3', theme: 'default', welcome: 'مرحباً بكم في غرفة الاختبار 3 💬' },
];

(async () => {
  let conn;
  try {
    conn = await mysql.createConnection(DB);
    console.log('✅ اتصال بقاعدة البيانات\n');

    /* ══ 1. مسح كل الغرف الحالية بالكامل ══ */
    process.stdout.write('⏳ حذف كل الغرف الحالية (رسائل + إشراف + الغرف نفسها)... ');
    await conn.query('DELETE FROM messages');
    await conn.query('DELETE FROM room_masters');
    await conn.query('DELETE FROM rooms');
    await conn.query('ALTER TABLE rooms AUTO_INCREMENT = 1');
    console.log('✅');

    /* ══ 2. إنشاء/تحديث حساب Super Master التجريبي ══ */
    process.stdout.write('⏳ إنشاء حساب Super Master التجريبي (رتبة 800)... ');
    const hash = await bcrypt.hash(TEST_PASS, 10);
    await conn.query('DELETE FROM users WHERE username = ? OR email = ?', [SM_USERNAME, SM_EMAIL]);
    const [smResult] = await conn.query(
      `INSERT INTO users (username, email, password_hash, rank, avatar, country, is_active)
       VALUES (?, ?, ?, 800, 'av2.svg', 'العراق', 1)`,
      [SM_USERNAME, SM_EMAIL, hash]
    );
    const smId = smResult.insertId;
    console.log('✅');

    /* ══ 2.5 حساب "Master" الافتراضي المحجوز (سوبر ماستر/123456) —
       نفس الحساب يتكرر ربطه بكل غرفة جديدة (مطابق لمسار /api/rooms/create) ══ */
    process.stdout.write('⏳ إنشاء/تحديث حساب Master الافتراضي (رتبة 800)... ');
    await conn.query('DELETE FROM users WHERE username = ? OR email = ?', ['Master', 'default_master@widbid.com']);
    const [masterResult] = await conn.query(
      `INSERT INTO users (username, email, password_hash, rank, avatar, is_active)
       VALUES ('Master', 'default_master@widbid.com', ?, 800, 'av1.svg', 1)`,
      [hash]
    );
    const masterId = masterResult.insertId;
    console.log('✅');

    /* ══ 3. إنشاء الغرف الثلاث + ربط Super Master وMaster الافتراضي عليها ══ */
    process.stdout.write('⏳ إنشاء 3 غرف اختبار وربطها بالحسابين... ');
    const roomIds = [];
    for (const room of TEST_ROOMS) {
      const token = `WB-TEST-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const [r] = await conn.query(
        `INSERT INTO rooms (name, token, type, owner_id, theme, welcome_message, max_capacity, category_id, is_active)
         VALUES (?, ?, 'public', ?, ?, ?, 200, 17, 1)`,
        [room.name, token, smId, room.theme, room.welcome]
      );
      roomIds.push(r.insertId);
      await conn.query(
        'INSERT INTO room_masters (room_id, user_id) VALUES (?, ?), (?, ?)',
        [r.insertId, smId, r.insertId, masterId]
      );
      await conn.query(
        `INSERT INTO messages (room_id, sender_id, content, type) VALUES (?, ?, ?, 'system')`,
        [r.insertId, smId, room.welcome]
      );
    }
    console.log('✅');

    /* ══ 4. ملخص ══ */
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║        🎉 إعادة تهيئة الغرف مكتملة بنجاح       ║');
    console.log('╠════════════════════════════════════════════════╣');
    TEST_ROOMS.forEach((room, i) => {
      const line = `  ${room.name}  →  room_id = ${roomIds[i]}`;
      console.log(`║${line.padEnd(50)}║`);
    });
    console.log('╠════════════════════════════════════════════════╣');
    console.log(`║  👤 اسم المستخدم: ${SM_USERNAME.padEnd(28)}║`);
    console.log(`║  📧 البريد الإلكتروني: ${SM_EMAIL.padEnd(23)}║`);
    console.log(`║  🔑 كلمة المرور: ${TEST_PASS.padEnd(30)}║`);
    console.log('╠════════════════════════════════════════════════╣');
    console.log('║  حساب "Master" الافتراضي (سوبر ماستر بكل غرفة):  ║');
    console.log('║  👤 اسم المستخدم: Master                          ║');
    console.log('║  🔑 كلمة المرور: 123456                           ║');
    console.log('╠════════════════════════════════════════════════╣');
    console.log('║  طريقة الدخول بالواجهة:                          ║');
    console.log('║  تبويب "عضو مميز" ← اسم المستخدم أو البريد        ║');
    console.log('║  + كلمة المرور (يتحقق منها السيرفر فعلياً الآن)    ║');
    console.log('╠════════════════════════════════════════════════╣');
    console.log('║  روابط الاختبار المباشرة (واجهة v2):            ║');
    roomIds.forEach(id => {
      console.log(`║  http://192.168.1.244:3000/v2/index.html?room_id=${id}`.padEnd(51) + '║');
    });
    console.log('╚════════════════════════════════════════════════╝');

  } catch (err) {
    console.error('\n❌ خطأ:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
})();
