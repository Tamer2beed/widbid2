const mysql  = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:             process.env.DB_HOST     || 'localhost',
  user:             process.env.DB_USER     || 'root',
  password:         process.env.DB_PASSWORD || '',
  database:         process.env.DB_NAME     || 'widbid',
  port:             process.env.DB_PORT     || 3306,
  waitForConnections: true,
  connectionLimit:  10,
  queueLimit:       0,
  charset:          'utf8mb4',
});

// اختبار الاتصال عند البدء — مع إعادة محاولة تلقائية (يحل سباق التوقيت
// المعتاد بالترموكس: Node.js يقلع أسرع من اكتمال جاهزية MariaDB أحياناً)
function testDbConnection(attempt = 1) {
  pool.getConnection()
    .then(conn => {
      console.log('✅ قاعدة البيانات متصلة');
      conn.release();
    })
    .catch(err => {
      if (attempt < 5) {
        console.log(`⏳ قاعدة البيانات مو جاهزة بعد (محاولة ${attempt}/5) — إعادة محاولة خلال ثانيتين...`);
        setTimeout(() => testDbConnection(attempt + 1), 2000);
      } else {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
      }
    });
}
testDbConnection();

module.exports = pool;
