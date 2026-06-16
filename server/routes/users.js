/* ════════════════════════════════════════
   WidBid — routes/users.js
   إدارة المستخدمين
════════════════════════════════════════ */
const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const bcrypt   = require('bcryptjs');
const { verifyToken, isSuperOwner, checkBanned } = require('../middleware');

/* ── GET /api/users/me — بياناتي ─────── */
router.get('/me', verifyToken, checkBanned, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, username, email, rank, points,
              avatar, country, is_active, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'مستخدم غير موجود' });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

/* ── GET /api/users/:id — ملف مستخدم ── */
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, username, rank, avatar, country,
              points, created_at
       FROM users WHERE id = ? AND is_active = 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'مستخدم غير موجود' });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

/* ── GET /api/users/search/:q — بحث ─── */
router.get('/search/:q', verifyToken, async (req, res) => {
  try {
    const q = `%${req.params.q}%`;
    const [rows] = await db.query(
      `SELECT id, username, rank, avatar
       FROM users
       WHERE username LIKE ? AND is_active = 1
       LIMIT 20`,
      [q]
    );
    res.json({ success: true, users: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

/* ── PUT /api/users/update — تحديث ملفي */
router.put('/update', verifyToken, async (req, res) => {
  const { avatar, country, email } = req.body;
  try {
    await db.query(
      `UPDATE users SET
        avatar  = COALESCE(?, avatar),
        country = COALESCE(?, country),
        email   = COALESCE(?, email)
       WHERE id = ?`,
      [avatar, country, email, req.user.id]
    );
    res.json({ success: true, message: 'تم التحديث' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

/* ── PUT /api/users/password — تغيير كلمة المرور */
router.put('/password', verifyToken, async (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) {
    return res.status(400).json({ success: false, message: 'البيانات ناقصة' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ success: false, message: 'كلمة المرور قصيرة جداً' });
  }
  try {
    const [rows] = await db.query(
      'SELECT password_hash FROM users WHERE id = ?', [req.user.id]
    );
    const valid = await bcrypt.compare(old_password, rows[0]?.password_hash || '');
    if (!valid) return res.status(401).json({ success: false, message: 'كلمة المرور القديمة خاطئة' });

    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    res.json({ success: true, message: 'تم تغيير كلمة المرور' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

/* ── POST /api/users/ban — حظر مستخدم (Super Owner) */
router.post('/ban', verifyToken, isSuperOwner, async (req, res) => {
  const { target_id, reason } = req.body;
  try {
    await db.query(
      'UPDATE users SET is_banned = 1, is_active = 0 WHERE id = ?', [target_id]
    );
    await db.query(
      'INSERT INTO admin_actions_log (actor_id, actor_name, action, target_name, detail) VALUES (?,?,?,?,?)',
      [req.user.id, req.user.username, 'ban_user', target_id, reason || 'Permanent Ban']
    );
    res.json({ success: true, message: 'تم حظر المستخدم' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

/* ── POST /api/users/unban — رفع الحظر */
router.post('/unban', verifyToken, isSuperOwner, async (req, res) => {
  const { target_id } = req.body;
  try {
    await db.query(
      'UPDATE users SET is_banned = 0, is_active = 1 WHERE id = ?', [target_id]
    );
    res.json({ success: true, message: 'تم رفع الحظر' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

/* ── GET /api/users/all/list — كل المستخدمين (Super Owner) */
router.get('/all/list', verifyToken, isSuperOwner, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, username, email, rank, points,
              is_active, is_banned, created_at
       FROM users
       ORDER BY rank DESC, created_at DESC
       LIMIT 100`
    );
    res.json({ success: true, users: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

module.exports = router;
