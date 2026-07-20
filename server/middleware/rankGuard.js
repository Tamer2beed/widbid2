/* ════════════════════════════════════════════════
   WidBid — server/middleware/rankGuard.js
   نظام موحّد للتحقق من الصلاحيات على أحداث Socket.io
   يطبّق: Weight Matrix + Lineage Immunity + Royal Immunity
   (راجع Qwen_markdown.md — القسم 19: مصفوفة الصلاحيات ونظام الحصانة)
════════════════════════════════════════════════ */
const db = require('../db');

/* ── هرم الرتب (نفس الترقيم المعتمد بالمشروع) ───────
   Guest(100) < Member(200) < Protected(300) < Royal(400)
   < Admin(500) < SuperAdmin(600) < Master(700) < SuperMaster(800)
   < Root(900) < SuperRoot(1000) < Owner(1100) < SuperOwner(1200) */
const RANKS = {
  GUEST: 100, MEMBER: 200, PROTECTED: 300, ROYAL: 400,
  ADMIN: 500, SUPER_ADMIN: 600, MASTER: 700, SUPER_MASTER: 800,
  ROOT: 900, SUPER_ROOT: 1000, OWNER: 1100, SUPER_OWNER: 1200,
};

/* ══════════════════════════════════════════════
   1) القراءة الآمنة من DB — لا نثق أبداً برتبة من الـ client
══════════════════════════════════════════════ */
async function getUserRank(userId) {
  if (!userId) return RANKS.GUEST;
  try {
    const [rows] = await db.query('SELECT rank FROM users WHERE id = ?', [userId]);
    return rows.length ? (rows[0].rank || RANKS.GUEST) : RANKS.GUEST;
  } catch { return RANKS.GUEST; }
}

/* بيانات الحصانة: من أنشأ الحساب (parent_id) + هل هو محمي ملكياً (is_royal) */
async function getImmunityData(userId) {
  if (!userId) return { parent_id: null, is_royal: false };
  try {
    const [rows] = await db.query(
      'SELECT parent_id, is_royal FROM users WHERE id = ?', [userId]
    );
    if (!rows.length) return { parent_id: null, is_royal: false };
    return { parent_id: rows[0].parent_id, is_royal: !!rows[0].is_royal };
  } catch { return { parent_id: null, is_royal: false }; }
}

/* ══════════════════════════════════════════════
   2) فحص الوزن الأساسي (Weight Matrix)
   الفاعل يجب أن يملك رتبة >= الحد الأدنى المطلوب للإجراء
   وأن تكون رتبته أعلى صراحة من رتبة الهدف
══════════════════════════════════════════════ */
function weightCheck(actorRank, targetRank, minActorRank = RANKS.ADMIN) {
  return (actorRank || 0) >= minActorRank && (actorRank || 0) > (targetRank || 0);
}

/* فحص بدون هدف (إجراءات عامة: تغيير ثيم، حظر IP، إعلان...) */
function requireMinRank(actorRank, minRank) {
  return (actorRank || 0) >= minRank;
}

/* ══════════════════════════════════════════════
   3) الفحص الكامل مع الحصانة — يُستخدم لأي إجراء له "هدف"
   (كتم / طرد / حظر / تخفيض / تحذير ...)
   actor  = { id, rank }
   target = { id, rank }
   يرجع: { allowed, reason, alertOwner }
══════════════════════════════════════════════ */
async function canActOn(actor, target, minActorRank = RANKS.ADMIN) {
  if (!actor || !target) return { allowed: false, reason: 'missing_data' };

  // أ) فحص الوزن الأساسي
  if (!weightCheck(actor.rank, target.rank, minActorRank)) {
    return { allowed: false, reason: 'insufficient_rank' };
  }

  // ب) الحصانة الملكية — أولوية قصوى، لا يُطرد ولا يُكتم أياً كانت الرتبة
  const targetImmunity = await getImmunityData(target.id);
  if (targetImmunity.is_royal) {
    return { allowed: false, reason: 'royal_immunity', alertOwner: true };
  }

  // ج) حصانة خط النسب — "الابن" لا يعاقب "الأب" الذي أنشأ حسابه
  const actorImmunity = await getImmunityData(actor.id);
  if (actorImmunity.parent_id && String(actorImmunity.parent_id) === String(target.id)) {
    return { allowed: false, reason: 'lineage_immunity' };
  }

  return { allowed: true, reason: null };
}

/* ══════════════════════════════════════════════
   4) حماية تعيين الرتب — لا يجوز منح رتبة >= رتبة الفاعل نفسه
   (يمنع Master من ترقية أحد إلى SuperOwner مثلاً)
══════════════════════════════════════════════ */
async function canAssignRank(actor, target, newRank, minActorRank = RANKS.MASTER) {
  const base = await canActOn(actor, target, minActorRank);
  if (!base.allowed) return base;
  if ((newRank || 0) >= actor.rank) {
    return { allowed: false, reason: 'cannot_grant_equal_or_higher_rank' };
  }
  return { allowed: true, reason: null };
}

module.exports = {
  RANKS,
  getUserRank,
  getImmunityData,
  weightCheck,
  requireMinRank,
  canActOn,
  canAssignRank,
};
