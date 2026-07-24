/* device-binding.js — بصمة جهاز بسيطة (مولّدة محلياً ومحفوظة بشكل دائم) + ربط حسابات لأجهزة محددة (حتى 3). */

function getDeviceFingerprint() {
    try {
        let fp = localStorage.getItem('deviceFingerprint');
        if (fp) return fp;
        const raw = [
            navigator.userAgent, navigator.language, screen.width, screen.height,
            screen.colorDepth, new Date().getTimezoneOffset(), Math.random().toString(36)
        ].join('|');
        fp = 'DEV-' + Array.from(raw).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0).toString(36).toUpperCase().replace('-', '');
        localStorage.setItem('deviceFingerprint', fp);
        return fp;
    } catch (e) { return 'DEV-UNKNOWN'; }
}

function isAccountBindingEnabled(account) {
    return !!(account && Array.isArray(account.boundDevices) && account.boundDevices.length > 0);
}

function isCurrentDeviceBound(account) {
    if (!isAccountBindingEnabled(account)) return true; // لا يوجد قيد = مسموح من أي جهاز
    return account.boundDevices.includes(getDeviceFingerprint());
}

function bindCurrentDeviceToAccount(accountId) {
    const account = adminAccounts.find(a => a.id === accountId);
    if (!account) return;
    if (account.role === 'super_master') { if (typeof showNotification === 'function') showNotification('⛔ لا يمكن ربط حساب Super Master بجهاز', 'leave'); return; }
    if (!Array.isArray(account.boundDevices)) account.boundDevices = [];
    const fp = getDeviceFingerprint();
    if (account.boundDevices.includes(fp)) { if (typeof showNotification === 'function') showNotification('هذا الجهاز مربوط بالفعل بهذا الحساب', 'leave'); return; }
    if (account.boundDevices.length >= 3) { if (typeof showNotification === 'function') showNotification('⛔ وصلت للحد الأقصى (3 أجهزة) لهذا الحساب', 'leave'); return; }
    account.boundDevices.push(fp);
    saveAdminAccounts();
    if (typeof logAdminActivity === 'function') logAdminActivity(`ربط جهاز جديد بحساب ${account.name}`);
    if (typeof showNotification === 'function') showNotification(`🔗 تم ربط هذا الجهاز بحساب ${account.name} (${account.boundDevices.length}/3)`, 'join');
    if (typeof renderAdminAccounts === 'function') renderAdminAccounts();
}

function unbindDeviceFromAccount(accountId, deviceFp) {
    const account = adminAccounts.find(a => a.id === accountId);
    if (!account || !Array.isArray(account.boundDevices)) return;
    account.boundDevices = account.boundDevices.filter(d => d !== deviceFp);
    saveAdminAccounts();
    if (typeof logAdminActivity === 'function') logAdminActivity(`فك ربط جهاز من حساب ${account.name}`);
    if (typeof showNotification === 'function') showNotification('🔓 تم فك ربط الجهاز', 'leave');
    openDeviceBindModal(accountId);
    if (typeof renderAdminAccounts === 'function') renderAdminAccounts();
}

function openDeviceBindModal(accountId) {
    const account = adminAccounts.find(a => a.id === accountId);
    if (!account) return;
    const titleEl = document.getElementById('deviceBindTitle');
    if (titleEl) titleEl.textContent = `ربط الجهاز — ${account.name}`;
    const currentFp = getDeviceFingerprint();
    const devices = Array.isArray(account.boundDevices) ? account.boundDevices : [];
    const listEl = document.getElementById('deviceBindList');
    if (listEl) {
        if (devices.length === 0) {
            listEl.innerHTML = '<div class="text-center text-white/40 text-xs py-4">لا توجد أجهزة مربوطة — الدخول متاح من أي جهاز حالياً</div>';
        } else {
            listEl.innerHTML = devices.map((d, i) => `
                <div class="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-3 mb-2">
                    <span class="text-white text-xs">جهاز ${i + 1} ${d === currentFp ? '<span class="text-green-400">(هذا الجهاز)</span>' : ''}</span>
                    <button class="device-unbind-btn text-red-400 text-xs" data-account-id="${accountId}" data-fp="${d}"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            `).join('');
        }
    }
    const countEl = document.getElementById('deviceBindCount');
    if (countEl) countEl.textContent = `${devices.length}/3`;
    const addBtn = document.getElementById('deviceBindAddCurrentBtn');
    if (addBtn) {
        addBtn.classList.toggle('hidden', devices.includes(currentFp) || devices.length >= 3);
        addBtn.dataset.accountId = accountId;
    }
    document.getElementById('deviceBindModal')?.classList.remove('hidden');
}
