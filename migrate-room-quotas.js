/* ════════════════════════════════════════
   WidBid — migrate-room-quotas.js  [S18-8]
   ينشئ جدول room_rank_quotas — حدود إنشاء المشرفين لكل غرفة
   (Master/Super Admin/Admin) — Member دائماً بلا حد.
   القيم الافتراضية لكل غرفة: Master=10, Super Admin=15, Admin=20
   شغّل مرة واحدة: node migrate-room-quotas.js
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

const DEFAULT_QUOTAS = [
  { rank_value: 700, max_count: 10 }, // Master
  { rank_value: 600, max_count: 15 }, // Super Admin
  { rank_value: 500, max_count: 20 }, // Admin
];

(async () => {
  let conn;
  try {
    conn = await mysql.createConnection(DB);
    console.log('✅ اتصال بقاعدة البيانات\n');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS room_rank_quotas (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        room_id       INT NOT NULL,
        rank_value    INT NOT NULL,
        max_count     INT NOT NULL,
        current_count INT NOT NULL DEFAULT 0,
        updated_by    INT DEFAULT NULL,
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_room_rank (room_id, rank_value)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ جدول room_rank_quotas جاهز');

    /* بذر القيم الافتراضية لكل الغرف النشطة الحالية اللي ما عندها حدود بعد */
    const [rooms] = await conn.query('SELECT id FROM rooms WHERE is_active = 1');
    let seeded = 0;
    for (const room of rooms) {
      for (const q of DEFAULT_QUOTAS) {
        const [existing] = await conn.query(
          'SELECT id FROM room_rank_quotas WHERE room_id = ? AND rank_value = ?',
          [room.id, q.rank_value]
        );
        if (existing.length) continue;

        /* current_count = عدد الحسابات الحقيقية اللي فعلاً بهالرتبة حالياً
           (تقريب معقول بدل الصفر — الرتبة عالمية بالنظام الحالي، فهذا
           أقرب قيمة ابتدائية منطقية بدل تجاهل من هم موجودين فعلاً) */
        const [[{ cnt }]] = await conn.query(
          'SELECT COUNT(*) AS cnt FROM users WHERE rank = ?', [q.rank_value]
        );
        await conn.query(
          'INSERT INTO room_rank_quotas (room_id, rank_value, max_count, current_count) VALUES (?,?,?,?)',
          [room.id, q.rank_value, q.max_count, Math.min(cnt, q.max_count)]
        );
        seeded++;
      }
    }
    console.log(`✅ تم بذر ${seeded} سجل حدود افتراضية لـ ${rooms.length} غرفة نشطة`);
    console.log('\nالحدود الافتراضية: Master=10 | Super Admin=15 | Admin=20 | Member=بلا حد');

  } catch (err) {
    console.error('❌ خطأ:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
})();
