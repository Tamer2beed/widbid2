/* ════════════════════════════════════════
   WidBid — routes/auth.js
   تسجيل الدخول والخروج والتسجيل
════════════════════════════════════════ */
const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../db');
const { verifyToken } = require('../middleware');
const { addPoints, POINTS_PER_LOGIN } = require('./points');

const JWT_SECRET  = process.env.JWT_SECRET  || 'widbid_secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

/* ── POST /api/auth/register — تسجيل ── */
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة' });
  }
  if (username.trim().length < 3) {
    return res.status(400).json({ success: false, message: 'الاسم قصير جداً (3 أحرف على الأقل)' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'كلمة المرور قصيرة جداً (6 أحرف)' });
  }

  try {
    // فحص التكرار
    const [existing] = await db.query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username.trim(), email.trim()]
    );
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'الاسم أو البريد مستخدم مسبقاً' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      `INSERT INTO users (username, email, password_hash, rank, points, is_active)
       VALUES (?, ?, ?, 100, 0, 1)`,
      [username.trim(), email.trim().toLowerCase(), hash]
    );

    // نقاط الترحيب
    await addPoints(result.insertId, 20, 'مكافأة التسجيل');

    res.status(201).json({
      success:  true,
      message:  'تم إنشاء الحساب بنجاح',
      user_id:  result.insertId,
    });
  } catch (err) {
    console.error('POST /auth/register:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

/* ── POST /api/auth/login — دخول ─────── */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'أدخل الإيميل أو اسم المستخدم وكلمة المرور' });
  }

  try {
    const [rows] = await db.query(
      `SELECT id, username, email, password_hash, rank,
              points, avatar, is_active, is_banned
       FROM users WHERE email = ? OR username = ?`,
      [email.trim().toLowerCase(), email.trim()]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'الإيميل أو اسم المستخدم غير موجود' });
    }

    const user = rows[0];

    if (user.is_banned) {
      return res.status(403).json({ success: false, message: 'تم حظر هذا الحساب' });
    }
    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'الحساب غير نشط' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Wrong password' });
    }

    // تحديث آخر دخول
    await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    // نقاط تسجيل الدخول اليومية
    const [[lastLogin]] = await db.query(
      'SELECT DATE(last_login) as login_date FROM users WHERE id = ?', [user.id]
    );
    const today = new Date().toISOString().split('T')[0];
    if (lastLogin?.login_date?.toISOString().split('T')[0] !== today) {
      await addPoints(user.id, POINTS_PER_LOGIN, 'نقاط تسجيل الدخول اليومي');
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      success:  true,
      token,
      user_id:  user.id,
      username: user.username,
      rank:     user.rank || 100,
      points:   user.points || 0,
      avatar:   user.avatar || '😀',
    });
  } catch (err) {
    console.error('POST /auth/login:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

/* ── POST /api/auth/guest — دخول كزائر */
router.post('/guest', async (req, res) => {
  const { username, avatar, country } = req.body;
  if (!username?.trim()) {
    return res.status(400).json({ success: false, message: 'الاسم مطلوب' });
  }
  // زائر لا يُسجَّل في DB — فقط token مؤقت
  const guestToken = `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  res.json({
    success:  true,
    token:    guestToken,
    user_id:  0,
    username: username.trim(),
    rank:     100,
    avatar:   avatar || '😀',
    country:  country || '',
  });
});

/* ── POST /api/auth/logout — خروج ────── */
router.post('/logout', verifyToken, async (req, res) => {
  // مستقبلاً: إضافة token blacklist
  res.json({ success: true, message: 'تم تسجيل الخروج' });
});

/* ── GET /api/auth/me — alias لـ verify (يُستخدم في صفحة الدخول) */
router.get('/me', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, rank, avatar, is_active, is_banned FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length || !rows[0].is_active || rows[0].is_banned) {
      return res.status(401).json({ success: false });
    }
    res.json({ success: true, user: rows[0] });
  } catch {
    res.status(500).json({ success: false });
  }
});

/* ── GET /api/auth/verify — التحقق من Token */
router.get('/verify', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, rank, points, avatar, is_active, is_banned FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length || !rows[0].is_active || rows[0].is_banned) {
      return res.status(401).json({ success: false, message: 'الحساب غير صالح' });
    }
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

/* ── POST /api/auth/refresh — تجديد Token */
router.post('/refresh', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, rank FROM users WHERE id = ? AND is_active = 1',
      [req.user.id]
    );
    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'غير مصرح' });
    }
    const token = jwt.sign(
      { id: rows[0].id, username: rows[0].username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});


/* ══════════════════════════════════════════════
   [GUEST] دخول كزائر — بدون حساب
   POST /api/auth/guest
   body: { username, room_id }
   يُنشئ token مؤقت برتبة Guest(100)
══════════════════════════════════════════════ */
router.post('/guest', async (req, res) => {
  const { username, room_id } = req.body;

  if (!username || username.trim().length < 2) {
    return res.status(400).json({ success: false, message: 'الاسم قصير جداً (2 أحرف على الأقل)' });
  }
  if (username.trim().length > 20) {
    return res.status(400).json({ success: false, message: 'الاسم طويل جداً (20 حرفاً كحد أقصى)' });
  }

  const cleanName = username.trim();

  try {
    /* تحقق من أن الاسم غير محجوز بحساب حقيقي */
    const [existing] = await db.query(
      'SELECT id, rank FROM users WHERE username = ? AND password_hash IS NOT NULL',
      [cleanName]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: '⛔ هذا الاسم محجوز — استخدم تبويب عضو وأدخل كلمة المرور',
      });
    }

    /* أنشئ token مؤقت بدون حفظ في DB */
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: 0, username: cleanName, rank: 100, isGuest: true },
      process.env.JWT_SECRET || 'widbid_secret',
      { expiresIn: '12h' }
    );

    res.json({
      success: true,
      token,
      user: { id: 0, username: cleanName, rank: 100, avatar: 'av1.svg', isGuest: true },
    });

  } catch (err) {
    console.error('guest login:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

module.exports = router;
