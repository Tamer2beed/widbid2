/* WidBid — migrate-immunity.js
   إضافة أعمدة نظام الحصانة (Immunity Logic) لجدول users:
   - parent_id : من أنشأ هذا الحساب (لتطبيق Lineage Immunity)
   - is_royal  : علامة الحصانة الملكية (Royal Immunity)
   شغّل مرة واحدة: node migrate-immunity.js */
require('dotenv').config();
const mysql = require('mysql2/promise');

const DB = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'widbid',
  port: parseInt(process.env.DB_PORT) || 3306,
};

(async () => {
  const conn = await mysql.createConnection(DB);
  console.log('✅ اتصال بقاعدة البيانات\n');

  const steps = [
    { name: 'إضافة parent_id (حصانة خط النسب)',
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_id INT DEFAULT NULL
            COMMENT 'من أنشأ هذا الحساب — لتطبيق Lineage Immunity'` },
    { name: 'إضافة is_royal (الحصانة الملكية)',
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_royal TINYINT(1) DEFAULT 0
            COMMENT 'حساب محمي من الطرد/الكتم — تنبيه فوري عند أي محاولة'` },
    { name: 'فهرس parent_id',
      sql: `ALTER TABLE users ADD INDEX IF NOT EXISTS idx_parent_id (parent_id)` },
  ];

  for (const s of steps) {
    process.stdout.write(`⏳ ${s.name}... `);
    try {
      await conn.query(s.sql);
      console.log('✅');
    } catch (e) {
      // بعض إصدارات MySQL القديمة ما تدعم IF NOT EXISTS مع ADD COLUMN/INDEX
      if (e.message.includes('Duplicate column') || e.message.includes('Duplicate key')) {
        console.log('⏭️  موجود مسبقاً');
      } else {
        throw e;
      }
    }
  }

  console.log('\n🎉 Migration نظام الحصانة مكتملة!');
  await conn.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
