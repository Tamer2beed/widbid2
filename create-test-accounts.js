/* ════════════════════════════════════════
   WidBid — create-test-accounts.js
   ينشئ 12 حساب اختبار حقيقي بقاعدة البيانات — واحد لكل رتبة
   بالضبط (100→1200)، بكلمة مرور موحدة، عشان تقدر تسجّل دخول
   فعلي (بتبويب "عضو مميز") من أي متصفح/تبويب وتختبر عليهم
   كل الإجراءات الحقيقية (كتم، طرد، تجميد، تحذير، ترقية...)
   — بعكس البوتات اللي ما عندها اتصال Socket.io حقيقي.

   شغّل مرة واحدة (أو أعد تشغيله وقت ما تبي يرجع يصفّرهم):
   node create-test-accounts.js
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

const TEST_ACCOUNTS = [
  { username: 'Test_Guest',       rank: 100  },
  { username: 'Test_Member',      rank: 200  },
  { username: 'Test_Protected',   rank: 300  },
  { username: 'Test_Royal',       rank: 400  },
  { username: 'Test_Admin',       rank: 500  },
  { username: 'Test_SuperAdmin',  rank: 600  },
  { username: 'Test_Master',      rank: 700  },
  { username: 'Test_SuperMaster', rank: 800  },
  { username: 'Test_Root',        rank: 900  },
  { username: 'Test_SuperRoot',   rank: 1000 },
  { username: 'Test_Owner',       rank: 1100 },
  { username: 'Test_SuperOwner',  rank: 1200 },
];

(async () => {
  let conn;
  try {
    conn = await mysql.createConnection(DB);
    console.log('✅ اتصال بقاعدة البيانات\n');

    const hash = await bcrypt.hash(TEST_PASS, 10);
    process.stdout.write('⏳ إنشاء 12 حساب اختبار حقيقي (بوت واحد بديل لكل رتبة، لكن قابل لتسجيل الدخول)... ');

    for (const acc of TEST_ACCOUNTS) {
      const email = `${acc.username.toLowerCase()}@widbid.com`;
      await conn.query('DELETE FROM users WHERE username = ? OR email = ?', [acc.username, email]);
      await conn.query(
        `INSERT INTO users (username, email, password_hash, rank, avatar, country, is_active)
         VALUES (?, ?, ?, ?, 'av1.svg', 'العراق', 1)`,
        [acc.username, email, hash, acc.rank]
      );
    }
    console.log('✅\n');

    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   🎉 12 حساب اختبار حقيقي جاهز للدخول الفعلي    ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║  كلمة المرور لكل الحسابات: 123456                 ║');
    console.log('║  تسجّل الدخول من تبويب "عضو مميز" فقط              ║');
    console.log('║  (اسم المستخدم أو البريد + كلمة المرور الحقيقية)   ║');
    console.log('╠══════════════════════════════════════════════════╣');
    TEST_ACCOUNTS.forEach(a => {
      console.log(`║  ${a.username.padEnd(22)} rank=${String(a.rank).padEnd(4)}         ║`);
    });
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('\nℹ️  هذي حسابات حقيقية 100% (اتصال Socket.io فعلي) — تقدر');
    console.log('   تفتح كل وحد بتبويب متصفح منفصل وتختبر عليه كل الإجراءات');
    console.log('   الإدارية (كتم/طرد/تجميد/تحذير/ترقية) بشكل كامل.');

  } catch (err) {
    console.error('\n❌ خطأ:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
})();
