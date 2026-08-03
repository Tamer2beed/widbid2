/* admins.js — إدارة المشرفين: مطابقة أسماء غير حساسة لحالة الأحرف، ألوان ثابتة بلا تعارض. */

const ADMIN_ROLE_ORDER = ['member', 'admin', 'super_admin', 'master'];
const ADMIN_ROLE_LABELS = { member: 'Member', admin: 'Admin', super_admin: 'Super Admin', master: 'Master', super_master: 'Super Master' };
const ADMIN_ROLE_COLORS = { member: '#f472b6', admin: '#3b82f6', super_admin: '#22c55e', master: '#dc2626' };
const SUPER_MASTER_COLOR = '#ef4444';
const SUPER_MASTER_GLOW = 'text-shadow:0 0 6px #ef4444,0 0 14px #ef4444,0 0 22px #ef4444;';

function admSafe(str) { return (typeof sanitize === 'function') ? sanitize(str) : String(str); }
/* [PHASE 3] استبدال بالكامل — الرتب الحقيقية (100→1200) بدل النظام
   المحلي الوهمي (member/admin/super_admin/master). rankGuard بالسيرفر
   هو الحكم الحقيقي دائماً؛ هذي الفحوصات هنا للواجهة فقط (إخفاء الأزرار). */
function getCurrentUserRank() { return (typeof ME_USER !== 'undefined' && ME_USER.rank) || 100; }
function canManageAdmins() { return getCurrentUserRank() >= 700; } /* Master فما فوق يقدر يفتح اللوحة */
function canActOnMember(targetRank) { return canManageAdmins() && getCurrentUserRank() > targetRank; }
/* [توافق] دوال قديمة لسا مستخدمة بملفات ثانية (app.js, logs.js, members.js)
   — نعيد تعريفها بمنطق الرتب الحقيقية بدل حذفها لتجنب كسر تلك المراجع.
   ⚠️ ملاحظة: getCurrentUserRoleIndex() ترجع الآن الرتبة الرقمية الحقيقية
   (100-1200) بدل فهرس 0-3 القديم — فلتر رتب "تمديد الحظر" بـ logs.js
   قد يحتاج مراجعة لاحقة لأنه يقارنها مع ADMIN_ROLE_ORDER.indexOf() القديم. */
function getCurrentUserRoleIndex() { return getCurrentUserRank(); }
function isCurrentUserSuperMaster() { return getCurrentUserRank() >= 800; } /* SuperMaster الحقيقي */
function canAccessMasterOnlyFeatures() { return getCurrentUserRank() >= 700; }

function getAdminBadgeColor(admin) {
    if (admin.role === 'super_master') return SUPER_MASTER_COLOR;
    return ADMIN_ROLE_COLORS[admin.role] || '#9ca3af';
}
function getRoleDisplayColor(role) {
    if (!role) return null;
    if (role === 'super_master') return SUPER_MASTER_COLOR;
    return ADMIN_ROLE_COLORS[role] || null;
}
function getRoleNameStyle(role) {
    const color = getRoleDisplayColor(role);
    if (!color) return '';
    return `color:${color};`;
}
function canAccessMasterOnlyFeatures() { return getCurrentUserRoleIndex() >= ADMIN_ROLE_ORDER.indexOf('master'); }

const WB_RANK_LADDER = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200];

/* [PHASE 3] تعرض الآن الأعضاء الحقيقيين المتواجدين فعلياً بالغرفة
   (نفس بيانات mockUsersList المحدَّثة عبر onlineUsers الحقيقي)،
   مع أزرار ترقية/تخفيض/طرد/تجميد حقيقية — بدل حسابات adminAccounts الوهمية. */
function renderAdminAccounts() {
    const listEl = document.getElementById('adminAccountsList');
    if (!listEl) return;
    const members = (typeof mockUsersList !== 'undefined' ? mockUsersList : []);
    if (members.length === 0) {
        listEl.innerHTML = '<div class="text-center text-white/30 text-xs py-6">لا يوجد أعضاء متواجدون حالياً</div>';
        return;
    }
    listEl.innerHTML = members.map(m => {
        const rank = m.rank || 100;
        const color = (typeof WB_RANK_COLORS !== 'undefined' && WB_RANK_COLORS[rank]) || m.color || '#9ca3af';
        const rankName = (typeof WB_RANK_NAMES !== 'undefined' && WB_RANK_NAMES[rank]) || '—';
        const isSelf = m.id === 'me';
        const canAct = !isSelf && (typeof canActOnMember === 'function' ? canActOnMember(rank) : false);
        const ladderIdx = WB_RANK_LADDER.indexOf(rank);
        const myRank = typeof getCurrentUserRank === 'function' ? getCurrentUserRank() : 100;
        const nextRank = ladderIdx > -1 && ladderIdx < WB_RANK_LADDER.length - 1 ? WB_RANK_LADDER[ladderIdx + 1] : null;
        const canPromote = canAct && nextRank !== null && nextRank < myRank;
        const canDemote = canAct && ladderIdx > 0;
        const safeName = typeof admSafe === 'function' ? admSafe(m.name) : m.name;
        return `
        <div class="bg-white/5 border border-white/10 rounded-2xl p-3 space-y-2">
            <button class="admin-name-toggle w-full flex items-center justify-between" data-id="${safeName}">
                <span class="font-bold text-sm" style="color:${color};">${safeName}${isSelf ? ' (أنت)' : ''}</span>
                <span class="text-[9px] px-2 py-0.5 rounded-full" style="background:${color}22;color:${color};">${rankName}</span>
            </button>
            ${canAct ? `<div id="admin-actions-${safeName}" class="hidden flex flex-wrap gap-2 pt-1">
                ${canPromote ? `<button class="admin-acc-promote-btn text-[10px] px-2 py-1 rounded-lg bg-cyan-600/80 text-white" data-id="${safeName}" data-rank="${rank}">▲ ترقية</button>` : ''}
                ${canDemote ? `<button class="admin-acc-demote-btn text-[10px] px-2 py-1 rounded-lg bg-amber-600/80 text-white" data-id="${safeName}" data-rank="${rank}">▼ تخفيض</button>` : ''}
                <button class="admin-acc-freeze-btn text-[10px] px-2 py-1 rounded-lg bg-blue-600/80 text-white" data-id="${safeName}">🧊 تجميد</button>
                <button class="admin-acc-delete-btn text-[10px] px-2 py-1 rounded-lg bg-red-600/80 text-white" data-id="${safeName}">🚪 طرد</button>
            </div>` : ''}
        </div>`;
    }).join('');
}

function _wbEmitAdminAction(event, target) {
    if (typeof wbSocket === 'undefined' || !wbSocket || !wbSocket.connected) {
        if (typeof showNotification === 'function') showNotification('⚠️ لا يوجد اتصال حقيقي بالسيرفر', 'leave');
        return;
    }
    wbSocket.emit(event, { room_id: wbRoomId, target, by: wbUsername });
}

/* ترقية حقيقية عبر assignRole — السيرفر (rankGuard) هو الحكم النهائي دائماً */
function realPromoteUser(username, currentRank) {
    const ladderIdx = WB_RANK_LADDER.indexOf(currentRank);
    const nextRank = ladderIdx > -1 && ladderIdx < WB_RANK_LADDER.length - 1 ? WB_RANK_LADDER[ladderIdx + 1] : null;
    if (nextRank === null) return;
    if (typeof wbSocket === 'undefined' || !wbSocket || !wbSocket.connected) { if (typeof showNotification === 'function') showNotification('⚠️ لا يوجد اتصال حقيقي بالسيرفر', 'leave'); return; }
    wbSocket.emit('assignRole', { room_id: wbRoomId, target: username, new_rank: nextRank, by: wbUsername });
}

/* تخفيض حقيقي عبر assignRole */
function realDemoteUser(username, currentRank) {
    const ladderIdx = WB_RANK_LADDER.indexOf(currentRank);
    if (ladderIdx <= 0) return;
    const prevRank = WB_RANK_LADDER[ladderIdx - 1];
    if (typeof wbSocket === 'undefined' || !wbSocket || !wbSocket.connected) { if (typeof showNotification === 'function') showNotification('⚠️ لا يوجد اتصال حقيقي بالسيرفر', 'leave'); return; }
    wbSocket.emit('assignRole', { room_id: wbRoomId, target: username, new_rank: prevRank, by: wbUsername });
}

/* طرد حقيقي عبر kickUser */
function realKickUser(username) { _wbEmitAdminAction('kickUser', username); }

/* تجميد حقيقي عبر freezeUser */
function realFreezeUser(username) { _wbEmitAdminAction('freezeUser', username); }

/* ---------- سجل التغييرات: يسجّل كل إجراء إداري باسم المنفّذ والتاريخ والوقت ---------- */
function loadActivityLog() { try { const s = localStorage.getItem('activityLog'); return s ? JSON.parse(s) : []; } catch (e) { return []; } }
function saveActivityLogList(list) { try { localStorage.setItem('activityLog', JSON.stringify(list)); } catch (e) {} }

function logAdminActivity(actionText) {
    const list = loadActivityLog();
    const now = new Date();
    const adminName = (typeof ME_USER !== 'undefined' && ME_USER.hasAccount) ? ME_USER.name : 'غير معروف';
    list.unshift({
        id: 'act_' + Date.now(),
        admin: adminName,
        action: actionText,
        date: now.toLocaleDateString('ar-EG'),
        time: now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    });
    if (list.length > 300) list.length = 300;
    saveActivityLogList(list);
    renderActivityLog();
}

function renderActivityLog() {
    const listEl = document.getElementById('activityLogList');
    if (!listEl) return;
    const list = loadActivityLog();
    if (list.length === 0) {
        listEl.innerHTML = '<div class="text-center text-white/30 text-xs py-6">لا توجد إجراءات مسجّلة بعد</div>';
        return;
    }
    listEl.innerHTML = list.map(e => `
        <div class="bg-white/5 border border-white/10 rounded-2xl p-3 space-y-1">
            <div class="flex items-center justify-between">
                <span class="font-bold text-white text-sm">${admSafe(e.admin)}</span>
                <span class="text-white/40 text-[10px]"><i class="fa-regular fa-calendar ml-1"></i>${admSafe(e.date)} — ${admSafe(e.time)}</span>
            </div>
            <div class="text-white/60 text-xs">${admSafe(e.action)}</div>
        </div>
    `).join('');
}

function clearActivityLog() {
    saveActivityLogList([]);
    renderActivityLog();
    if (typeof showNotification === 'function') showNotification('🗑️ تم مسح سجل التغييرات', 'leave');
}

/* ══════════════════════════════════════════
   [S18-5] إضافة عضو حقيقي جديد — تسجيل فعلي عبر
   /api/auth/register ثم ترقية فعلية عبر assignRole
   (بدل النافذة الوهمية القديمة المحذوفة).
══════════════════════════════════════════ */
let newAdminSelectedOption = null; /* { rank, label, color, customColor } */

/* [S18-7] بعض الرتب لها قائمة "قابل للإضافة" مقيّدة صراحة بدل
   "كل رتبة أقل من رتبتي" العامة — حسب طلب تامر لرتبة Super Master
   تحديداً: أربع رتب فقط، وMaster له نسختان لونيتان منفصلتان فعلياً
   (يُحفظان بعمود custom_color، مو مجرد شكل واجهة). */
const RESTRICTED_ADDABLE_RANKS = {
    800: [ /* Super Master */
        { rank: 200, label: 'Member',            color: '#E6E6FA' },
        { rank: 500, label: 'Admin',              color: '#1565C0' },
        { rank: 600, label: 'Super Admin',        color: '#2E7D32' },
        { rank: 700, label: 'Master (أحمر)',      color: '#D32F2F', customColor: '#D32F2F' },
        { rank: 700, label: 'Master (وردي)',      color: '#EC4899', customColor: '#EC4899' },
    ],
};

function getAddableRankOptions() {
    const myRank = getCurrentUserRank();
    if (RESTRICTED_ADDABLE_RANKS[myRank]) return RESTRICTED_ADDABLE_RANKS[myRank];
    /* الافتراضي لبقية الرتب: كل رتبة أقل من رتبتي بلون رتبتها الحقيقي */
    return WB_RANK_LADDER.filter(r => r < myRank).map(r => ({
        rank: r,
        label: (typeof WB_RANK_NAMES !== 'undefined' && WB_RANK_NAMES[r]) || String(r),
        color: (typeof WB_RANK_COLORS !== 'undefined' && WB_RANK_COLORS[r]) || '#9ca3af',
    }));
}

function openAddAdminModal() {
    const nameInput = document.getElementById('newAdminNameInput');
    const pwInput = document.getElementById('newAdminPasswordInput');
    if (nameInput) nameInput.value = '';
    if (pwInput) pwInput.value = '';

    const options = getAddableRankOptions();
    newAdminSelectedOption = options[0] || null;

    const container = document.getElementById('newAdminRankOptions');
    if (container) {
        container.innerHTML = options.map((opt, idx) => `
            <button class="new-admin-rank-opt p-2 rounded-lg border-2 text-[11px] font-bold transition-colors"
                data-idx="${idx}"
                style="${idx === 0 ? `border-color:${opt.color};background:${opt.color}22;color:${opt.color};` : `border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:${opt.color};`}">
                ${opt.label}
            </button>
        `).join('');
        container.dataset.options = JSON.stringify(options);
    }
    document.getElementById('addAdminModal')?.classList.remove('hidden');
}

function selectNewAdminRank(idx) {
    const container = document.getElementById('newAdminRankOptions');
    if (!container) return;
    const options = JSON.parse(container.dataset.options || '[]');
    newAdminSelectedOption = options[idx];
    if (!newAdminSelectedOption) return;

    container.querySelectorAll('.new-admin-rank-opt').forEach(btn => {
        const isSel = parseInt(btn.dataset.idx, 10) === idx;
        const opt = options[parseInt(btn.dataset.idx, 10)];
        btn.style.borderColor = isSel ? opt.color : 'rgba(255,255,255,0.1)';
        btn.style.background = isSel ? `${opt.color}22` : 'rgba(255,255,255,0.05)';
        btn.style.color = opt.color;
    });
}

async function submitAddAdmin() {
    const name = document.getElementById('newAdminNameInput')?.value.trim();
    const pw = document.getElementById('newAdminPasswordInput')?.value.trim();

    if (!name || name.length < 3) { if (typeof showNotification === 'function') showNotification('يرجى إدخال اسم مستخدم صحيح (3 أحرف على الأقل)', 'leave'); return; }
    if (!pw || pw.length < 6) { if (typeof showNotification === 'function') showNotification('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'leave'); return; }
    if (!newAdminSelectedOption) { if (typeof showNotification === 'function') showNotification('يرجى اختيار الرتبة', 'leave'); return; }
    if (newAdminSelectedOption.rank >= getCurrentUserRank()) { if (typeof showNotification === 'function') showNotification('⛔ لا يمكنك منح رتبة مساوية أو أعلى من رتبتك', 'leave'); return; }

    try {
        const email = `${name.toLowerCase().replace(/[^a-z0-9_]/g, '')}_${Date.now()}@widbid.com`;
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: name, email, password: pw })
        });
        const data = await res.json();
        if (!data.success) {
            if (typeof showNotification === 'function') showNotification(`⛔ ${data.message || 'فشل إنشاء الحساب'}`, 'leave');
            return;
        }

        if (typeof wbSocket !== 'undefined' && wbSocket && wbSocket.connected) {
            wbSocket.emit('assignRole', {
                room_id: wbRoomId, target: name, new_rank: newAdminSelectedOption.rank,
                custom_color: newAdminSelectedOption.customColor || null, by: wbUsername
            });
        }

        document.getElementById('addAdminModal')?.classList.add('hidden');
        if (typeof showNotification === 'function') showNotification(`✅ تم إنشاء حساب "${name}" فعلياً — يقدر يسجّل دخول الآن بكلمة المرور اللي حطيتها`, 'join');
        if (typeof logAdminActivity === 'function') logAdminActivity(`إنشاء عضو جديد: ${name}`);
    } catch (err) {
        console.error('[submitAddAdmin]', err);
        if (typeof showNotification === 'function') showNotification('⚠️ فشل الاتصال بالسيرفر', 'leave');
    }
}
