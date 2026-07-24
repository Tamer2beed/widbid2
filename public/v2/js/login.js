/* login.js — تسجيل الدخول: حفظ متعدد الحسابات (اسم + كلمة مرور مشفّرة + صورة) لكل عضو على حدة. */

const AVATAR_PLACEHOLDER_COLORS = ['#9333ea','#2563eb','#16a34a','#dc2626','#ea580c','#0891b2','#db2777','#4f46e5','#65a30d','#0d9488'];
function buildPlaceholderAvatar(color) {
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='${encodeURIComponent(color)}'/%3E%3Ccircle cx='50' cy='38' r='18' fill='white'/%3E%3Cellipse cx='50' cy='90' rx='32' ry='28' fill='white'/%3E%3C/svg%3E`;
}
const AVATAR_OPTIONS = AVATAR_PLACEHOLDER_COLORS.map(buildPlaceholderAvatar);

let selectedLoginAvatar = AVATAR_OPTIONS[0];
let currentLoginTab = 'guest';
let loggedInAccountId = null;

function renderAvatarGrid() {
    const grid = document.getElementById('avatarGrid');
    if (!grid) return;
    grid.innerHTML = AVATAR_OPTIONS.map((src) => `
        <button class="avatar-option-btn rounded-2xl overflow-hidden border-2 w-14 h-14 ${src === selectedLoginAvatar ? 'border-purple-500' : 'border-transparent'}" data-avatar-src="${src}">
            <img src="${src}" class="w-full h-full object-cover">
        </button>
    `).join('');
}

function selectLoginAvatar(src) {
    selectedLoginAvatar = src;
    const preview = document.getElementById('loginAvatarPreview');
    if (preview) preview.src = src;
    renderAvatarGrid();
}

/* [PHASE 1] handleCustomAvatarUpload() حُذفت — كانت تسمح برفع صورة حرة
   عبر FileReader، والسيرفر الحقيقي ما يدعم هذا (16 أفاتار جاهزة فقط). */

function updateRegisteredPasswordFields() {
    if (currentLoginTab !== 'registered') return;
    const name = (document.getElementById('loginUsernameInput')?.value || '').trim().toLowerCase();
    const namePwInput = document.getElementById('loginNamePasswordInput');
    if (name === 'master') namePwInput?.classList.remove('hidden');
    else namePwInput?.classList.add('hidden');
}

function switchLoginTab(tab) {
    currentLoginTab = tab;
    document.querySelectorAll('.login-tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    const namePwInput = document.getElementById('loginNamePasswordInput');
    const roomPwInput = document.getElementById('loginRoomPasswordInput');
    if (tab === 'guest') {
        namePwInput?.classList.add('hidden');
        roomPwInput?.classList.add('hidden');
    } else if (tab === 'member') {
        namePwInput?.classList.add('hidden');
        roomPwInput?.classList.remove('hidden');
        if (roomPwInput) roomPwInput.placeholder = 'كلمة المرور';
    } else if (tab === 'registered') {
        roomPwInput?.classList.remove('hidden');
        if (roomPwInput) roomPwInput.placeholder = 'كلمة المرور';
        updateRegisteredPasswordFields();
    }
}

/* ---------- حفظ متعدد الحسابات: { "الاسم(بأحرف صغيرة)": {name, avatar, tab, roomHash, nameHash} } ---------- */
function loadSavedAccountsMap() {
    try { return JSON.parse(localStorage.getItem('savedLoginAccounts') || '{}'); } catch (e) { return {}; }
}
function saveSavedAccountsMap(map) {
    try { localStorage.setItem('savedLoginAccounts', JSON.stringify(map)); } catch (e) {}
}

function saveLoginCredentials(name, roomHash, nameHash) {
    try {
        const remember = document.getElementById('rememberLoginCheckbox')?.checked;
        const map = loadSavedAccountsMap();
        const key = name.toLowerCase();
        if (!remember) { delete map[key]; saveSavedAccountsMap(map); localStorage.setItem('lastLoginAccountKey', ''); return; }
        map[key] = { name, avatar: selectedLoginAvatar, tab: currentLoginTab, roomHash: roomHash || null, nameHash: nameHash || null };
        saveSavedAccountsMap(map);
        localStorage.setItem('lastLoginAccountKey', key);
    } catch (e) {}
}

function clearSavedLoginCredentials(name) {
    try {
        const map = loadSavedAccountsMap();
        delete map[name.toLowerCase()];
        saveSavedAccountsMap(map);
    } catch (e) {}
}

async function tryAutoLogin() {
    const map = loadSavedAccountsMap();
    const lastKey = localStorage.getItem('lastLoginAccountKey');
    const saved = lastKey ? map[lastKey] : null;
    if (!saved || !saved.name) return false;

    switchLoginTab(saved.tab || 'guest');
    const ui = document.getElementById('loginUsernameInput');
    if (ui) ui.value = saved.name;
    if (saved.avatar) selectLoginAvatar(saved.avatar);
    const rememberBox = document.getElementById('rememberLoginCheckbox');
    if (rememberBox) rememberBox.checked = true;
    updateRegisteredPasswordFields();

    if (saved.tab === 'guest') {
        if (saved.name.toLowerCase() === 'master') return false;
        if (typeof findAccountByName === 'function' && findAccountByName(saved.name)) return false;
        finishLogin(saved.name, 'member', false, null, false, true);
        return true;
    }

    if (typeof adminAccounts === 'undefined' || typeof findAccountByName !== 'function') return false;
    const account = findAccountByName(saved.name);
    if (!account || account.mustChangePassword) return false;

    if (saved.tab === 'member' && account.role !== 'super_master' && saved.roomHash) {
        if (saved.roomHash === account.passwordHash) {
            finishLogin(saved.name, account.role, account.role !== 'member', account.id, true, true);
            return true;
        }
    }
    if (saved.tab === 'registered' && saved.name.toLowerCase() === 'master' && account.role === 'super_master' && saved.roomHash && saved.nameHash) {
        if (saved.roomHash === account.roomPasswordHash && saved.nameHash === account.namePasswordHash) {
            finishLogin(saved.name, account.role, true, account.id, true, true);
            return true;
        }
    }
    clearSavedLoginCredentials(saved.name);
    return false;
}

/* اختيار حساب محفوظ آخر من زر "حساباتي المحفوظة" */
function renderSavedAccountsList() {
    const listEl = document.getElementById('savedAccountsList');
    if (!listEl) return;
    const map = loadSavedAccountsMap();
    const keys = Object.keys(map);
    if (keys.length === 0) {
        listEl.innerHTML = '<div class="text-center text-white/40 text-xs py-6">لا توجد حسابات محفوظة</div>';
        return;
    }
    listEl.innerHTML = keys.map(key => {
        const acc = map[key];
        return `<button class="saved-account-item w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 mb-2" data-key="${key}">
            <img src="${acc.avatar}" class="w-10 h-10 rounded-xl object-cover border-2 border-purple-400 shrink-0">
            <span class="text-white text-sm font-bold flex-1 text-right">${acc.name}</span>
            <button class="saved-account-remove text-red-400 text-xs px-2" data-key="${key}"><i class="fa-solid fa-trash-can"></i></button>
        </button>`;
    }).join('');
}

function openSavedAccountsModal() {
    renderSavedAccountsList();
    document.getElementById('savedAccountsModal')?.classList.remove('hidden');
}

function selectSavedAccount(key) {
    const map = loadSavedAccountsMap();
    const acc = map[key];
    if (!acc) return;
    localStorage.setItem('lastLoginAccountKey', key);
    document.getElementById('savedAccountsModal')?.classList.add('hidden');
    tryAutoLogin();
}

function removeSavedAccount(key) {
    const map = loadSavedAccountsMap();
    delete map[key];
    saveSavedAccountsMap(map);
    if (localStorage.getItem('lastLoginAccountKey') === key) localStorage.setItem('lastLoginAccountKey', '');
    renderSavedAccountsList();
}

async function attemptLogin() {
    const name = document.getElementById('loginUsernameInput')?.value.trim();
    if (!name) { if (typeof showNotification === 'function') showNotification('يرجى إدخال اسم المستخدم', 'leave'); return; }

    if (currentLoginTab === 'guest') {
        if (name.toLowerCase() === 'master') { if (typeof showNotification === 'function') showNotification('⛔ هذا الاسم محجوز للنظام', 'leave'); return; }
        if (typeof findAccountByName === 'function' && findAccountByName(name)) { if (typeof showNotification === 'function') showNotification('⛔ هذا الاسم محجوز لعضو مسجّل — استخدم تبويب عضو أو عضو مميز', 'leave'); return; }
        saveLoginCredentials(name, null, null);
        finishLogin(name, 'member', false, null, false);
        return;
    }

    if (typeof adminAccounts === 'undefined' || typeof findAccountByName !== 'function') {
        if (typeof showNotification === 'function') showNotification('النظام غير جاهز بعد، حاول مجدداً', 'leave');
        return;
    }
    const account = findAccountByName(name);

    if (currentLoginTab === 'member') {
        const pw = document.getElementById('loginRoomPasswordInput')?.value.trim();
        if (!pw) { if (typeof showNotification === 'function') showNotification('يرجى إدخال كلمة المرور', 'leave'); return; }
        if (!account || account.role === 'super_master') { if (typeof showNotification === 'function') showNotification('اسم المستخدم غير موجود — إذا كان "master" استخدم تبويب عضو مميز', 'leave'); return; }
        const hash = await hashPassword(pw);
        if (hash !== account.passwordHash) { if (typeof showNotification === 'function') showNotification('كلمة المرور غير صحيحة', 'leave'); return; }
        if (typeof isCurrentDeviceBound === 'function' && !isCurrentDeviceBound(account)) { if (typeof showNotification === 'function') showNotification('⛔ هذا الحساب مربوط بأجهزة أخرى، لا يمكن الدخول من هذا الجهاز', 'leave'); return; }
        if (account.mustChangePassword) { openForcedSingleChange(account, name); return; }
        saveLoginCredentials(name, hash, null);
        finishLogin(name, account.role, account.role !== 'member', account.id, true);
        return;
    }

    if (currentLoginTab === 'registered') {
        if (name.toLowerCase() === 'master') {
            const namePw = document.getElementById('loginNamePasswordInput')?.value.trim();
            const roomPw = document.getElementById('loginRoomPasswordInput')?.value.trim();
            if (!namePw || !roomPw) { if (typeof showNotification === 'function') showNotification('يرجى إدخال كلمتي المرور', 'leave'); return; }
            if (!account || account.role !== 'super_master') { if (typeof showNotification === 'function') showNotification('بيانات الدخول غير صحيحة', 'leave'); return; }
            const nameHash = await hashPassword(namePw);
            const roomHash = await hashPassword(roomPw);
            if (nameHash !== account.namePasswordHash || roomHash !== account.roomPasswordHash) { if (typeof showNotification === 'function') showNotification('بيانات الدخول غير صحيحة', 'leave'); return; }
            if (typeof isCurrentDeviceBound === 'function' && !isCurrentDeviceBound(account)) { if (typeof showNotification === 'function') showNotification('⛔ هذا الحساب مربوط بأجهزة أخرى، لا يمكن الدخول من هذا الجهاز', 'leave'); return; }
            if (account.mustChangePassword) {
                loggedInAccountId = account.id;
                document.getElementById('forcedChangeSubtitle').textContent = `مرحباً ${name} — يجب تعيين كلمتي مرور جديدتين ومختلفتين قبل المتابعة`;
                document.getElementById('forcedNewNamePassword').value = '';
                document.getElementById('forcedNewRoomPassword').value = '';
                window.__pendingLoginDisplayName = name;
                document.getElementById('forcedPasswordChangeModal')?.classList.remove('hidden');
                return;
            }
            saveLoginCredentials(name, roomHash, nameHash);
            finishLogin(name, account.role, true, account.id, true);
            return;
        }
        if (typeof showNotification === 'function') showNotification('تبويب "عضو مميز" مخصص فقط للاسم المحجوز master — استخدم تبويب "عضو" لبقية الحسابات', 'leave');
        return;
    }
}

function openForcedSingleChange(account, displayName) {
    loggedInAccountId = account.id;
    window.__pendingLoginDisplayName = displayName;
    document.getElementById('forcedSingleChangeSubtitle').textContent = `مرحباً ${displayName} — يجب تعيين كلمة مرور جديدة قبل المتابعة`;
    document.getElementById('forcedSingleNewPassword').value = '';
    document.getElementById('forcedSinglePasswordChangeModal')?.classList.remove('hidden');
}

async function submitForcedSinglePasswordChange() {
    const newPw = document.getElementById('forcedSingleNewPassword')?.value.trim();
    if (!newPw) { if (typeof showNotification === 'function') showNotification('يرجى إدخال كلمة مرور جديدة', 'leave'); return; }
    const account = adminAccounts.find(a => a.id === loggedInAccountId);
    if (!account) return;
    const hash = await hashPassword(newPw);
    account.passwordHash = hash;
    account.mustChangePassword = false;
    saveAdminAccounts();
    document.getElementById('forcedSinglePasswordChangeModal')?.classList.add('hidden');
    const displayName = window.__pendingLoginDisplayName || account.name;
    saveLoginCredentials(displayName, hash, null);
    finishLogin(displayName, account.role, account.role !== 'member', account.id, true);
    if (typeof showNotification === 'function') showNotification('✅ تم تحديث كلمة المرور بنجاح', 'join');
}

async function submitForcedPasswordChange() {
    const newNamePw = document.getElementById('forcedNewNamePassword')?.value.trim();
    const newRoomPw = document.getElementById('forcedNewRoomPassword')?.value.trim();
    if (!newNamePw || !newRoomPw) { if (typeof showNotification === 'function') showNotification('يرجى تعبئة الحقلين', 'leave'); return; }
    if (newNamePw === newRoomPw) { if (typeof showNotification === 'function') showNotification('يجب أن تختلف كلمتا المرور عن بعضهما', 'leave'); return; }
    const account = adminAccounts.find(a => a.id === loggedInAccountId);
    if (!account) return;
    const nameHash = await hashPassword(newNamePw);
    const roomHash = await hashPassword(newRoomPw);
    account.namePasswordHash = nameHash;
    account.roomPasswordHash = roomHash;
    account.mustChangePassword = false;
    saveAdminAccounts();
    document.getElementById('forcedPasswordChangeModal')?.classList.add('hidden');
    const displayName = window.__pendingLoginDisplayName || account.name;
    saveLoginCredentials(displayName, roomHash, nameHash);
    finishLogin(displayName, account.role, true, account.id, true);
    if (typeof showNotification === 'function') showNotification('✅ تم تحديث كلمتي المرور بنجاح', 'join');
}

function finishLogin(name, role, isOwner, accountId, hasAccount, skipNotification) {
    if (typeof ME_USER !== 'undefined') {
        ME_USER.name = name;
        ME_USER.avatar = selectedLoginAvatar;
        ME_USER.role = role;
        ME_USER.isOwner = !!isOwner;
        ME_USER.accountId = accountId || null;
        ME_USER.hasAccount = !!hasAccount;
    }
    document.getElementById('loginScreen')?.classList.add('hidden');
    if (typeof renderOnlineUsers === 'function') renderOnlineUsers();
    if (typeof showNotification === 'function') showNotification(skipNotification ? `👋 مرحباً بعودتك ${name}` : `👋 أهلاً بك ${name}`, 'join');
}

async function initLoginScreen() {
    try {
        selectLoginAvatar(AVATAR_OPTIONS[0]);
        switchLoginTab('guest');
        renderAvatarGrid();
        // [PHASE 1] عنصر customAvatarInput أُزيل من index.html — رفع صور حر غير مدعوم بالسيرفر الحقيقي.
        document.getElementById('loginUsernameInput')?.addEventListener('input', updateRegisteredPasswordFields);
        await tryAutoLogin();
    } catch (err) {
        console.error('فشل تهيئة شاشة الدخول (initLoginScreen):', err);
    }
}
