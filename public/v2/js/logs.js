let visitLogs = [];
let logoutLogs = [];
let loginLogsFilter = 'all';

const countryPool = ['ليبيا','مصر','السعودية','قطر','الإمارات','اليمن','تونس','الجزائر','المغرب','الأردن'];
const BAN_DEFAULT_HOURS = 24;

const ROLE_LABELS = { member: 'عضو', admin: 'مشرف', super_admin: 'مشرف عام', master: 'مالك' };
const ROLE_COLORS = { member: '#9ca3af', admin: '#3b82f6', super_admin: '#22c55e', master: '#dc2626' };

let promoteTargetLogId = null;
let promoteSelectedRole = null;
let pendingConfirmAction = null;
let tempBanTargetLogId = null;

/* [PHASE 1] هذي دوال توليد بيانات مؤقتة (placeholder) فقط للعرض البصري —
   السيرفر الحقيقي (WidBid) عنده IP وبصمة جهاز حقيقيين لكل مستخدم
   (last_login_ip, last_login_mac بجدول users + جداول ip_bans/device_bans).
   عند الربط الحقيقي: مرّر هذي القيم كاملة من بيانات تسجيل الدخول الحقيقية
   بدل توليدها عشوائياً هنا. */
function randomIp() {
    return `${Math.floor(Math.random()*223)+1}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
}
function randomFingerprint() { return 'FP-' + Math.random().toString(36).substring(2, 8).toUpperCase(); }
function logSafe(str) { return (typeof sanitize === 'function') ? sanitize(str) : String(str); }

function getUserRole(user) {
    if (!user) return 'member';
    return user.role || (user.isOwner ? 'admin' : 'member');
}

function saveLogsToStorage() { try { localStorage.setItem('visitLogs', JSON.stringify(visitLogs)); } catch (e) {} }
function loadLogsFromStorage() { try { const s = localStorage.getItem('visitLogs'); visitLogs = s ? JSON.parse(s) : []; } catch (e) { visitLogs = []; } }
function saveLogoutLogsToStorage() { try { localStorage.setItem('logoutLogs', JSON.stringify(logoutLogs)); } catch (e) {} }
function loadLogoutLogsFromStorage() { try { const s = localStorage.getItem('logoutLogs'); logoutLogs = s ? JSON.parse(s) : []; } catch (e) { logoutLogs = []; } }
function getBanCounts() { try { return JSON.parse(localStorage.getItem('banCounts') || '{}'); } catch (e) { return {}; } }
function incrementBanCount(userId) {
    const counts = getBanCounts();
    counts[userId] = (counts[userId] || 0) + 1;
    localStorage.setItem('banCounts', JSON.stringify(counts));
}

function recordLogin(user) {
    visitLogs.forEach(l => { if (l.userId === user.id && l.status === 'online') l.status = 'offline'; });
    const now = new Date();
    const entry = {
        id: 'log_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        userId: user.id, name: user.name,
        country: user.id === 'me' ? 'جهازك (محلي)' : countryPool[Math.floor(Math.random() * countryPool.length)],
        ip: user.id === 'me' ? '—' : randomIp(),
        fingerprint: user.id === 'me' ? 'FP-ME-DEVICE' : randomFingerprint(),
        loginDate: now.toLocaleDateString('ar-EG'),
        loginTime: now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        status: 'online', ts: Date.now()
    };
    visitLogs.unshift(entry);
    saveLogsToStorage();
    renderLoginLogs();
}

function recordLogout(userId) {
    const loginEntry = visitLogs.find(l => l.userId === userId && l.status === 'online');
    if (!loginEntry) return;
    loginEntry.status = 'offline';
    saveLogsToStorage();
    const now = new Date();
    const entry = {
        id: 'logout_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        userId, name: loginEntry.name, country: loginEntry.country, ip: loginEntry.ip, fingerprint: loginEntry.fingerprint,
        logoutDate: now.toLocaleDateString('ar-EG'),
        logoutTime: now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        ts: Date.now()
    };
    logoutLogs.unshift(entry);
    saveLogoutLogsToStorage();
    renderLoginLogs();
    renderLogoutLogs();
}

function purgeOldEntries(list, days) {
    if (!days || days <= 0) return list;
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    return list.filter(e => (e.ts || 0) >= cutoff);
}
function applyAutoClearSettings() {
    try {
        const loginDays = parseInt(localStorage.getItem('loginLogAutoClearDays') || '0', 10);
        const logoutDays = parseInt(localStorage.getItem('logoutLogAutoClearDays') || '0', 10);
        if (loginDays > 0) { visitLogs = purgeOldEntries(visitLogs, loginDays); saveLogsToStorage(); }
        if (logoutDays > 0) { logoutLogs = purgeOldEntries(logoutLogs, logoutDays); saveLogoutLogsToStorage(); }
    } catch (err) { console.error('فشل تطبيق المسح التلقائي:', err); }
}

function getRoomStats() {
    const online = visitLogs.filter(l => l.status === 'online').length;
    const totalVisitors = visitLogs.length;
    return { online, totalVisitors };
}

function formatRemainingTime(ms) {
    if (ms <= 0) return 'انتهى';
    const totalMinutes = Math.floor(ms / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    let parts = [];
    if (days > 0) parts.push(`${days} يوم`);
    if (hours > 0) parts.push(`${hours} ساعة`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes} دقيقة`);
    return parts.join(' ');
}

function checkBanExpirations() {
    let changed = false;
    visitLogs.forEach(l => {
        if (l.status === 'banned' && l.banType === 'temp' && l.banExpiresAt && l.banExpiresAt <= Date.now()) {
            l.status = 'offline'; l.banExpiresAt = null; changed = true;
        }
    });
    if (changed) { saveLogsToStorage(); renderLoginLogs(); }
    renderBannedList();
}

function initLoginLogs() {
    try {
        loadLogsFromStorage();
        loadLogoutLogsFromStorage();
        applyAutoClearSettings();

        const bannedIds = visitLogs.filter(l => l.status === 'banned').map(l => l.userId);
        if (bannedIds.length && typeof mockUsersList !== 'undefined') {
            mockUsersList = mockUsersList.filter(u => !bannedIds.includes(u.id));
        }
        if (typeof mockUsersList !== 'undefined') {
            mockUsersList.forEach(u => recordLogin(u));
        }

        const loginSelect = document.getElementById('loginAutoClearSelect');
        if (loginSelect) loginSelect.value = localStorage.getItem('loginLogAutoClearDays') || '0';
        const logoutSelect = document.getElementById('logoutAutoClearSelect');
        if (logoutSelect) logoutSelect.value = localStorage.getItem('logoutLogAutoClearDays') || '0';

        loginSelect?.addEventListener('change', (e) => {
            localStorage.setItem('loginLogAutoClearDays', e.target.value);
            applyAutoClearSettings(); renderLoginLogs();
        });
        logoutSelect?.addEventListener('change', (e) => {
            localStorage.setItem('logoutLogAutoClearDays', e.target.value);
            applyAutoClearSettings(); renderLogoutLogs();
        });

        renderLoginLogs();
        renderLogoutLogs();
        renderBannedList();

        setInterval(() => { applyAutoClearSettings(); renderLoginLogs(); renderLogoutLogs(); }, 10 * 60 * 1000);
        setInterval(checkBanExpirations, 60 * 1000);
    } catch (err) {
        console.error('فشل تهيئة السجلات (initLoginLogs):', err);
    }
}

function renderLoginLogs() {
    const listEl = document.getElementById('loginLogsList');
    const stats = getRoomStats();
    const onlineEl = document.getElementById('logsOnlineCount');
    const totalEl = document.getElementById('logsTotalCount');
    if (onlineEl) onlineEl.textContent = stats.online;
    if (totalEl) totalEl.textContent = stats.totalVisitors;

    const showAllBtn = document.getElementById('loginShowAllBtn');
    if (showAllBtn) showAllBtn.classList.toggle('hidden', loginLogsFilter !== 'online');
    if (!listEl) return;

    const displayLogs = loginLogsFilter === 'online' ? visitLogs.filter(l => l.status === 'online') : visitLogs;

    if (displayLogs.length === 0) {
        listEl.innerHTML = `<div class="text-center text-white/30 text-xs py-6">${loginLogsFilter === 'online' ? 'لا يوجد متصلون حالياً' : 'لا توجد سجلات بعد'}</div>`;
        return;
    }

    listEl.innerHTML = displayLogs.map(log => {
        let statusLabel, statusClasses;
        if (log.status === 'online') { statusLabel = 'متصل'; statusClasses = 'bg-green-500/20 text-green-400'; }
        else if (log.status === 'banned') { statusLabel = 'محظور'; statusClasses = 'bg-red-500/20 text-red-400'; }
        else { statusLabel = 'غير متصل'; statusClasses = 'bg-gray-500/20 text-gray-300'; }

        let actionsHtml = '';
        if (log.status === 'online') {
            actionsHtml = `
                <button class="log-ban-temp-btn text-[10px] px-2 py-1 rounded-lg bg-amber-500/80 text-white" data-logid="${log.id}">حظر مؤقت</button>
                <button class="log-ban-perm-btn text-[10px] px-2 py-1 rounded-lg bg-red-600/80 text-white" data-logid="${log.id}">حظر دائم</button>
                <button class="log-kick-btn text-[10px] px-2 py-1 rounded-lg bg-purple-600/80 text-white" data-logid="${log.id}">طرد</button>
            `;
        } else if (log.status === 'offline') {
            actionsHtml = `
                <button class="log-ban-temp-btn text-[10px] px-2 py-1 rounded-lg bg-amber-500/80 text-white" data-logid="${log.id}">حظر مؤقت</button>
                <button class="log-ban-perm-btn text-[10px] px-2 py-1 rounded-lg bg-red-600/80 text-white" data-logid="${log.id}">حظر دائم</button>
            `;
        } else if (log.status === 'banned') {
            actionsHtml = `<button class="log-unban-btn text-[10px] px-2 py-1 rounded-lg bg-green-600/80 text-white" data-logid="${log.id}">فك الحظر</button>`;
        }

        return `
            <div class="bg-white/5 border border-white/10 rounded-2xl p-3 space-y-2">
                <div class="flex items-center justify-between">
                    <span class="font-bold text-white text-sm">${logSafe(log.name)}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full ${statusClasses}">${statusLabel}</span>
                </div>
                <div class="flex flex-wrap gap-x-3 gap-y-1 text-white/50 text-[11px]">
                    <span><i class="fa-regular fa-calendar ml-1"></i>${logSafe(log.loginDate)}</span>
                    <span><i class="fa-regular fa-clock ml-1"></i>${logSafe(log.loginTime)}</span>
                    <span><i class="fa-solid fa-earth-africa ml-1"></i>${logSafe(log.country)}</span>
                </div>
                <div class="flex flex-wrap gap-x-3 gap-y-1 text-white/35 text-[10px]">
                    <span>IP: ${logSafe(log.ip)}</span>
                    <span>بصمة: ${logSafe(log.fingerprint)}</span>
                </div>
                <div class="flex flex-wrap gap-2 pt-1">${actionsHtml}</div>
            </div>
        `;
    }).join('');
}

function filterLoginLogsOnline() { loginLogsFilter = 'online'; renderLoginLogs(); }
function resetLoginLogsFilter() { loginLogsFilter = 'all'; renderLoginLogs(); }

function renderLogoutLogs() {
    const listEl = document.getElementById('logoutLogsList');
    const stats = getRoomStats();
    const onlineEl = document.getElementById('logoutOnlineCount');
    const totalEl = document.getElementById('logoutTotalCount');
    if (onlineEl) onlineEl.textContent = stats.online;
    if (totalEl) totalEl.textContent = stats.totalVisitors;
    if (!listEl) return;

    if (logoutLogs.length === 0) {
        listEl.innerHTML = '<div class="text-center text-white/30 text-xs py-6">لا توجد سجلات خروج بعد</div>';
        return;
    }
    listEl.innerHTML = logoutLogs.map(log => `
        <div class="bg-white/5 border border-white/10 rounded-2xl p-3 space-y-2">
            <div class="flex items-center justify-between">
                <span class="font-bold text-white text-sm">${logSafe(log.name)}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300">خرج</span>
            </div>
            <div class="flex flex-wrap gap-x-3 gap-y-1 text-white/50 text-[11px]">
                <span><i class="fa-regular fa-calendar ml-1"></i>${logSafe(log.logoutDate)}</span>
                <span><i class="fa-regular fa-clock ml-1"></i>${logSafe(log.logoutTime)}</span>
                <span><i class="fa-solid fa-earth-africa ml-1"></i>${logSafe(log.country)}</span>
            </div>
            <div class="flex flex-wrap gap-x-3 gap-y-1 text-white/35 text-[10px]">
                <span>IP: ${logSafe(log.ip)}</span>
                <span>بصمة: ${logSafe(log.fingerprint)}</span>
            </div>
        </div>
    `).join('');
}

function renderBannedList() {
    const listEl = document.getElementById('bannedList');
    const totalEl = document.getElementById('bannedTotalCount');
    const repeatEl = document.getElementById('bannedRepeatCount');

    const bannedEntries = visitLogs.filter(l => l.status === 'banned');
    if (totalEl) totalEl.textContent = bannedEntries.length;
    if (repeatEl) {
        const counts = getBanCounts();
        repeatEl.textContent = Object.values(counts).filter(c => c > 1).length;
    }
    if (!listEl) return;

    if (bannedEntries.length === 0) {
        listEl.innerHTML = '<div class="text-center text-white/30 text-xs py-6">لا يوجد محظورون حالياً</div>';
        return;
    }

    const counts = getBanCounts();
    listEl.innerHTML = bannedEntries.map(log => {
        const isTemp = log.banType === 'temp';
        let timeInfo = 'حظر دائم';
        if (isTemp && log.banExpiresAt) {
            const remaining = log.banExpiresAt - Date.now();
            timeInfo = remaining > 0 ? `الوقت المتبقي: ${formatRemainingTime(remaining)}` : 'على وشك الانتهاء';
        }
        const timesBanned = counts[log.userId] || 1;
        return `
            <div class="bg-white/5 border border-white/10 rounded-2xl p-3 space-y-2">
                <div class="flex items-center justify-between">
                    <span class="font-bold text-white text-sm">${logSafe(log.name)}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full ${isTemp ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-400'}">${isTemp ? 'مؤقت' : 'دائم'}</span>
                </div>
                <div class="text-white/50 text-[11px]"><i class="fa-regular fa-clock ml-1"></i>${timeInfo}</div>
                ${timesBanned > 1 ? `<div class="text-amber-400 text-[10px]"><i class="fa-solid fa-triangle-exclamation ml-1"></i>حُظر ${timesBanned} مرات سابقاً</div>` : ''}
                <div class="flex flex-wrap gap-2 pt-1">
                    <button class="ban-unban-btn text-[10px] px-2 py-1 rounded-lg bg-green-600/80 text-white" data-logid="${log.id}">فك الحظر</button>
                    ${isTemp ? `<button class="ban-extend-btn text-[10px] px-2 py-1 rounded-lg bg-blue-600/80 text-white" data-logid="${log.id}">تمديد 24 ساعة</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function openRepeatBannedModal() {
    const counts = getBanCounts();
    const listEl = document.getElementById('repeatBannedList');
    if (!listEl) return;
    const repeatUserIds = Object.keys(counts).filter(id => counts[id] > 1);
    if (repeatUserIds.length === 0) {
        listEl.innerHTML = '<div class="text-center text-white/30 text-xs py-6">لا يوجد أحد بعد</div>';
    } else {
        listEl.innerHTML = repeatUserIds.map(uid => {
            const entry = visitLogs.find(l => String(l.userId) === String(uid));
            const name = entry ? entry.name : uid;
            return `<div class="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                <span class="text-white text-sm font-bold">${logSafe(name)}</span>
                <span class="text-amber-400 text-xs">${counts[uid]} مرات</span>
            </div>`;
        }).join('');
    }
    document.getElementById('repeatBannedModal')?.classList.remove('hidden');
}

function openPromoteModal(logId) {
    if (typeof canManageAdmins === 'function' && !canManageAdmins()) {
        if (typeof showNotification === 'function') showNotification('⛔ لا تملك صلاحية الترقية', 'leave');
        return;
    }
    const log = visitLogs.find(l => l.id === logId);
    if (!log) return;
    promoteTargetLogId = logId;
    promoteSelectedRole = null;

    const user = (typeof mockUsersList !== 'undefined') ? mockUsersList.find(u => u.id === log.userId) : null;
    const currentRole = getUserRole(user);
    const subtitle = document.getElementById('promoteModalSubtitle');
    if (subtitle) subtitle.textContent = `${log.name} — الرتبة الحالية: ${ROLE_LABELS[currentRole]}`;

    const isAlreadyAdmin = currentRole !== 'member';
    document.getElementById('promotePasswordContainer')?.classList.toggle('hidden', isAlreadyAdmin);
    const pwInput = document.getElementById('promotePasswordInput');
    if (pwInput) pwInput.value = '';

    const myIdx = (typeof getCurrentUserRoleIndex === 'function') ? getCurrentUserRoleIndex() : 99;
    const isSuperM = typeof isCurrentUserSuperMaster === 'function' && isCurrentUserSuperMaster();
    let options = Object.keys(ROLE_LABELS).filter(r => r !== currentRole);
    if (!isSuperM && typeof ADMIN_ROLE_ORDER !== 'undefined') {
        options = options.filter(r => ADMIN_ROLE_ORDER.indexOf(r) < myIdx);
    }
    const optionsEl = document.getElementById('promoteRoleOptions');
    if (optionsEl) {
        optionsEl.innerHTML = options.map(r => `
            <button class="promote-role-option w-full text-right p-3 rounded-xl border border-white/10 bg-white/5 text-white text-sm flex items-center justify-between" data-role="${r}">
                <span>${ROLE_LABELS[r]}</span>
                <span class="w-3 h-3 rounded-full" style="background:${ROLE_COLORS[r]}"></span>
            </button>
        `).join('');
    }
    document.getElementById('promoteModal')?.classList.remove('hidden');
}

function confirmPromote() {
    if (!promoteTargetLogId || !promoteSelectedRole) {
        if (typeof showNotification === 'function') showNotification('يرجى اختيار رتبة أولاً', 'leave');
        return;
    }
    const log = visitLogs.find(l => l.id === promoteTargetLogId);
    if (!log || typeof mockUsersList === 'undefined') return;
    const user = mockUsersList.find(u => u.id === log.userId);
    if (!user) { if (typeof showNotification === 'function') showNotification('العضو غير متصل حالياً', 'leave'); return; }

    const currentRole = getUserRole(user);
    if (currentRole === 'member') {
        const pw = document.getElementById('promotePasswordInput')?.value.trim();
        if (!pw) { if (typeof showNotification === 'function') showNotification('يرجى إدخال كلمة مرور للمشرف الجديد', 'leave'); return; }
        user.password = pw;
    }
    user.role = promoteSelectedRole;
    user.isOwner = promoteSelectedRole !== 'member';
    if (typeof renderOnlineUsers === 'function') renderOnlineUsers();
    document.getElementById('promoteModal')?.classList.add('hidden');
    if (typeof showNotification === 'function') showNotification(`⭐ تم تعيين ${log.name} كـ ${ROLE_LABELS[promoteSelectedRole]}`, 'join');
}

function openConfirmModal(title, message, confirmLabel, confirmColorClass, onConfirm) {
    const titleEl = document.getElementById('confirmModalTitle');
    const msgEl = document.getElementById('confirmModalMessage');
    const btn = document.getElementById('confirmModalConfirmBtn');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (btn) { btn.textContent = confirmLabel; btn.className = `flex-1 rounded-xl p-3 text-sm font-bold text-white ${confirmColorClass}`; }
    pendingConfirmAction = onConfirm;
    document.getElementById('confirmActionModal')?.classList.remove('hidden');
}

function openTempBanModal(logId) {
    const log = visitLogs.find(l => l.id === logId);
    tempBanTargetLogId = logId;
    const subtitle = document.getElementById('tempBanModalSubtitle');
    if (subtitle) subtitle.textContent = log ? `تحديد مدة حظر ${log.name}` : '';
    const d = document.getElementById('tempBanDays'), h = document.getElementById('tempBanHours'), m = document.getElementById('tempBanMinutes');
    if (d) d.value = 1; if (h) h.value = 0; if (m) m.value = 0;
    document.getElementById('tempBanModal')?.classList.remove('hidden');
}

function confirmTempBan() {
    const days = parseInt(document.getElementById('tempBanDays')?.value) || 0;
    const hours = parseInt(document.getElementById('tempBanHours')?.value) || 0;
    const minutes = parseInt(document.getElementById('tempBanMinutes')?.value) || 0;
    const totalMs = (days * 86400 + hours * 3600 + minutes * 60) * 1000;
    if (totalMs <= 0) { if (typeof showNotification === 'function') showNotification('يرجى تحديد مدة أكبر من صفر', 'leave'); return; }
    banUserFromLog(tempBanTargetLogId, 'temp', totalMs);
    document.getElementById('tempBanModal')?.classList.add('hidden');
}

function kickUserFromLog(logId) {
    const log = visitLogs.find(l => l.id === logId);
    if (!log || log.status !== 'online') return;
    if (typeof mockUsersList !== 'undefined') mockUsersList = mockUsersList.filter(u => u.id !== log.userId);
    recordLogout(log.userId);
    if (typeof renderOnlineUsers === 'function') renderOnlineUsers();
    if (typeof showNotification === 'function') showNotification(`👢 تم طرد ${log.name}`, 'leave');
    if (typeof logAdminActivity === 'function') logAdminActivity(`طرد ${log.name}`);
}

function banUserFromLog(logId, banType, durationMs) {
    const log = visitLogs.find(l => l.id === logId);
    if (!log) return;
    if (typeof mockUsersList !== 'undefined') mockUsersList = mockUsersList.filter(u => u.id !== log.userId);
    if (log.status === 'online') recordLogout(log.userId);
    log.status = 'banned';
    log.banType = banType;
    log.banExpiresAt = banType === 'temp' ? (Date.now() + (durationMs || BAN_DEFAULT_HOURS * 60 * 60 * 1000)) : null;
    incrementBanCount(log.userId);
    saveLogsToStorage();
    renderLoginLogs();
    renderBannedList();
    if (typeof renderOnlineUsers === 'function') renderOnlineUsers();
    if (typeof showNotification === 'function') showNotification(`🚫 تم حظر ${log.name} (${banType === 'temp' ? 'مؤقت' : 'دائم'})`, 'leave');
    if (typeof logAdminActivity === 'function') logAdminActivity(`حظر ${log.name} (${banType === 'temp' ? 'مؤقت' : 'دائم'})`);
}

function unbanUserFromLog(logId) {
    const log = visitLogs.find(l => l.id === logId);
    if (!log) return;
    log.status = 'offline';
    log.banExpiresAt = null;
    saveLogsToStorage();
    renderLoginLogs();
    renderBannedList();
    if (typeof showNotification === 'function') showNotification(`✅ تم فك الحظر عن ${log.name}`, 'join');
    if (typeof logAdminActivity === 'function') logAdminActivity(`فك الحظر عن ${log.name}`);
}

function extendBanFromList(logId) {
    const log = visitLogs.find(l => l.id === logId);
    if (!log || log.status !== 'banned' || log.banType !== 'temp') return;
    const base = (log.banExpiresAt && log.banExpiresAt > Date.now()) ? log.banExpiresAt : Date.now();
    log.banExpiresAt = base + 24 * 60 * 60 * 1000;
    saveLogsToStorage();
    renderBannedList();
    renderLoginLogs();
    if (typeof showNotification === 'function') showNotification(`⏱️ تم تمديد حظر ${log.name} 24 ساعة إضافية`, 'join');
    if (typeof logAdminActivity === 'function') logAdminActivity(`تمديد حظر ${log.name} 24 ساعة`);
}

function clearAllLoginLogs() {
    visitLogs = [];
    saveLogsToStorage();
    renderLoginLogs();
    renderBannedList();
    if (typeof showNotification === 'function') showNotification('🗑️ تم مسح سجل الدخول بالكامل', 'leave');
}
function clearAllLogoutLogs() {
    logoutLogs = [];
    saveLogoutLogsToStorage();
    renderLogoutLogs();
    if (typeof showNotification === 'function') showNotification('🗑️ تم مسح سجل الخروج بالكامل', 'leave');
}
