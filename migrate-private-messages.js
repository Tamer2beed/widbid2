/* ════════════════════════════════════════
   WidBid — migrate-private-messages.js  [S18-26]
   ينشئ جدول الرسائل الخاصة الحقيقي (private_messages) —
   يستبدل نظام localStorage الوهمي بالكامل بواجهة v2.
   شغّل مرة واحدة: node migrate-private-messages.js
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

    await conn.query(`
      CREATE TABLE IF NOT EXISTS private_messages (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        sender_id      INT NULL,
        sender_name    VARCHAR(50) NOT NULL,
        recipient_name VARCHAR(50) NOT NULL,
        message        TEXT NOT NULL,
        is_read        TINYINT(1) NOT NULL DEFAULT 0,
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pair (sender_name, recipient_name),
        INDEX idx_recipient_unread (recipient_name, is_read)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ جدول private_messages جاهز');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS pm_deleted_marks (
        username           VARCHAR(50) NOT NULL,
        contact             VARCHAR(50) NOT NULL,
        deleted_before_id   INT NOT NULL DEFAULT 0,
        PRIMARY KEY (username, contact)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ جدول pm_deleted_marks جاهز — حذف محادثة صار طرف واحد بس (مو الاثنين)');

  } catch (err) {
    console.error('❌ خطأ:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
})();
