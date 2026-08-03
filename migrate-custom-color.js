/* ════════════════════════════════════════
   WidBid — migrate-custom-color.js  [S18-6]
   يضيف عمود custom_color لجدول users — يسمح لبعض الحسابات
   (مثل Master بنسختيه أحمر/وردي) بلون اسم مخصص يتجاوز لون
   الرتبة الافتراضي.
   شغّل مرة واحدة: node migrate-custom-color.js
════════════════════════════════════════ */
require('dotenv').config();
const mysql = require('mysql2/promise');

const DB = {
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASS     || process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'widbid',
  port:     parseInt(process.env.DB_PORT) || 3306,
};

(async () => {
  let conn;
  try {
    conn = await mysql.createConnection(DB);
    console.log('✅ اتصال بقاعدة البيانات\n');

    const [cols] = await conn.query(`SHOW COLUMNS FROM users LIKE 'custom_color'`);
    if (cols.length) {
      console.log('ℹ️ العمود custom_color موجود مسبقاً — لا حاجة للهجرة');
    } else {
      await conn.query(`ALTER TABLE users ADD COLUMN custom_color VARCHAR(20) NULL AFTER rank`);
      console.log('✅ تمت إضافة عمود custom_color لجدول users');
    }
  } catch (err) {
    console.error('❌ خطأ:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
})();
