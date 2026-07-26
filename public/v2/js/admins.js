/* admins.js — إدارة المشرفين: مطابقة أسماء غير حساسة لحالة الأحرف، ألوان ثابتة بلا تعارض. */

let adminAccounts = [];
const ADMIN_ROLE_ORDER = ['member', 'admin', 'super_admin', 'master'];
const ADMIN_ROLE_LABELS = { member: 'Member', admin: 'Admin', super_admin: 'Super Admin', master: 'Master', super_master: 'Super Master' };
const ADMIN_ROLE_COLORS = { member: '#f472b6', admin: '#3b82f6', super_admin: '#22c55e', master: '#dc2626' };
const SUPER_MASTER_COLOR = '#ef4444';
const SUPER_MASTER_GLOW = 'text-shadow:0 0 6px #ef4444,0 0 14px #ef4444,0 0 22px #ef4444;';
const RESERVED_MASTER_NAME = 'master';

let newAdminSelectedRole = null;
let changePasswordTargetId = null;

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

const ADMIN_SCHEMA_VERSION = 2;
function checkAdminSchemaVersion() {
    try {
        const v = parseInt(localStorage.getItem('adminSchemaVersion') || '0', 10);
        if (v !== ADMIN_SCHEMA_VERSION) {
            localStorage.removeItem('adminAccounts');
            localStorage.setItem('adminSchemaVersion', String(ADMIN_SCHEMA_VERSION));
        }
    } catch (e) {}
}
function loadAdminAccounts() { checkAdminSchemaVersion(); try { const s = localStorage.getItem('adminAccounts'); adminAccounts = s ? JSON.parse(s) : []; } catch (e) { adminAccounts = []; } }
function saveAdminAccounts() { try { localStorage.setItem('adminAccounts', JSON.stringify(adminAccounts)); } catch (e) {} }
function findAccountByName(name) { return adminAccounts.find(a => a.name.toLowerCase() === String(name).toLowerCase()); }

async function ensureSuperMasterAccount() {
    loadAdminAccounts();
    if (adminAccounts.some(a => a.role === 'super_master')) return;
    const hash = await hashPassword('123456');
    adminAccounts.push({
        id: 'super_master_fixed', name: RESERVED_MASTER_NAME, role: 'super_master',
        namePasswordHash: hash, roomPasswordHash: hash, mustChangePassword: true, createdAt: Date.now()
    });
    saveAdminAccounts();
}

async function initAdminAccounts() {
    await ensureSuperMasterAccount();
    renderAdminAccounts();
}

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

function openAddAdminModal() {
    const nameInput = document.getElementById('newAdminNameInput');
    const pwInput = document.getElementById('newAdminPasswordInput');
    if (nameInput) nameInput.value = '';
    if (pwInput) pwInput.value = '';
    document.querySelectorAll('.new-admin-role-option').forEach(el => el.classList.remove('selected'));
    const myIdx = getCurrentUserRoleIndex();
    document.querySelectorAll('.new-admin-role-option').forEach(opt => {
        const roleIdx = ADMIN_ROLE_ORDER.indexOf(opt.dataset.role);
        const hide = isCurrentUserSuperMaster() ? false : (roleIdx >= myIdx);
        opt.classList.toggle('hidden', hide);
    });
    newAdminSelectedRole = null;
    document.getElementById('addAdminModal')?.classList.remove('hidden');
}

function updateAddAdminPasswordFields() {}

async function submitAddAdmin() {
    const name = document.getElementById('newAdminNameInput')?.value.trim();
    const pw = document.getElementById('newAdminPasswordInput')?.value.trim();

    if (!name) { if (typeof showNotification === 'function') showNotification('يرجى إدخال الاسم', 'leave'); return; }
    if (name.toLowerCase() === RESERVED_MASTER_NAME) { if (typeof showNotification === 'function') showNotification('⛔ هذا الاسم محجوز للنظام', 'leave'); return; }
    if (!newAdminSelectedRole) { if (typeof showNotification === 'function') showNotification('يرجى اختيار الرتبة', 'leave'); return; }
    if (newAdminSelectedRole === 'master' && !isCurrentUserSuperMaster()) { if (typeof showNotification === 'function') showNotification('⛔ لا تملك صلاحية إنشاء رتبة Master', 'leave'); return; }
    if (!isCurrentUserSuperMaster() && ADMIN_ROLE_ORDER.indexOf(newAdminSelectedRole) >= getCurrentUserRoleIndex()) { if (typeof showNotification === 'function') showNotification('⛔ لا يمكنك إنشاء حساب برتبة مساوية أو أعلى من رتبتك', 'leave'); return; }
    if (findAccountByName(name)) { if (typeof showNotification === 'function') showNotification('هذا الاسم مستخدم بالفعل', 'leave'); return; }
    if (!pw) { if (typeof showNotification === 'function') showNotification('يرجى إدخال كلمة المرور', 'leave'); return; }

    const hash = await hashPassword(pw);
    const data = { id: 'admin_' + Date.now(), name, role: newAdminSelectedRole, passwordHash: hash, mustChangePassword: true, createdAt: Date.now() };
    finalizeAddAdmin(data);
}

function finalizeAddAdmin(data) {
    adminAccounts.push(data);
    saveAdminAccounts();
    renderAdminAccounts();
    document.getElementById('addAdminModal')?.classList.add('hidden');
    if (typeof showNotification === 'function') showNotification(`✅ تم إضافة ${data.name} — سيُطالَب بتغيير كلمة المرور عند أول دخول`, 'join');
}

function openChangePasswordModal(id) {
    const admin = adminAccounts.find(a => a.id === id);
    if (!admin || admin.role === 'super_master') return;
    if (typeof canActOnAccount === 'function' && !canActOnAccount(admin)) { if (typeof showNotification === 'function') showNotification('⛔ لا تملك صلاحية تغيير كلمة مرور هذا الحساب', 'leave'); return; }
    changePasswordTargetId = id;
    const subtitle = document.getElementById('changePasswordSubtitle');
    if (subtitle) subtitle.textContent = `كلمة مرور جديدة لـ ${admin.name}`;
    const pwInput = document.getElementById('newPasswordInput');
    if (pwInput) pwInput.value = '';
    document.getElementById('changePasswordModal')?.classList.remove('hidden');
}

async function submitChangePassword() {
    const newPw = document.getElementById('newPasswordInput')?.value.trim();
    if (!newPw) { if (typeof showNotification === 'function') showNotification('يرجى إدخال كلمة مرور جديدة', 'leave'); return; }
    const admin = adminAccounts.find(a => a.id === changePasswordTargetId);
    if (!admin) return;
    admin.passwordHash = await hashPassword(newPw);
    saveAdminAccounts();
    document.getElementById('changePasswordModal')?.classList.add('hidden');
    if (typeof showNotification === 'function') showNotification(`🔑 تم تغيير كلمة مرور ${admin.name}`, 'join');
    if (typeof logAdminActivity === 'function') logAdminActivity(`تغيير كلمة مرور ${admin.name}`);
}

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
