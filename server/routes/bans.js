/* ════════════════════════════════════════
   WidBid — routes/bans.js  [S18-2]
   عرض وإلغاء الحظورات الحقيقية (ip_bans / device_bans)
   — بديل حقيقي لقائمة "المحظورين" الوهمية اللي كانت
   بـ localStorage فقط بواجهة v2 (logs.js).
════════════════════════════════════════ */
const express = require('express');
const router  = express.Router();
const db      = require('../db');

/* ── GET /api/bans/:room_id — كل الحظورات النشطة لغرفة معيّنة
   (يشمل الحظر العام room_id IS NULL) ── */
router.get('/:room_id', async (req, res) => {
  try {
    const roomId = req.params.room_id;
    const [ipRows] = await db.query(
      `SELECT id, 'ip' AS type, ip_address AS target, banned_by, reason, expires_at, created_at
       FROM ip_bans
       WHERE (room_id = ? OR room_id IS NULL)
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC`,
      [roomId]
    );
    const [devRows] = await db.query(
      `SELECT id, 'device' AS type, username AS target, banned_by, NULL AS reason, expires_at, created_at
       FROM device_bans
       WHERE (room_id = ? OR room_id IS NULL)
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC`,
      [roomId]
    );
    res.json({ success: true, bans: [...ipRows, ...devRows] });
  } catch (err) {
    console.error('GET /bans/:room_id:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

/* ── DELETE /api/bans/:type/:id — إلغاء حظر (ip أو device) ── */
router.delete('/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  const table = type === 'device' ? 'device_bans' : 'ip_bans';
  try {
    await db.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
    res.json({ success: true, message: 'تم إلغاء الحظر' });
  } catch (err) {
    console.error('DELETE /bans:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

module.exports = router;
