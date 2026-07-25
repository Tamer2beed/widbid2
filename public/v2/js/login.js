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
    const mainInput = document.getElementById('loginUsernameInput');
    if (tab === 'guest') {
        namePwInput?.classList.add('hidden');
        roomPwInput?.classList.add('hidden');
        if (mainInput) mainInput.placeholder = 'اسم المستخدم';
    } else if (tab === 'member') {
        namePwInput?.classList.add('hidden');
        roomPwInput?.classList.remove('hidden');
        if (roomPwInput) roomPwInput.placeholder = 'كلمة مرور الغرفة (اختياري)';
        if (mainInput) mainInput.placeholder = 'البريد الإلكتروني';
    } else if (tab === 'registered') {
        roomPwInput?.classList.remove('hidden');
        if (roomPwInput) roomPwInput.placeholder = 'كلمة المرور';
        if (mainInput) mainInput.placeholder = 'البريد الإلكتروني';
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

/* [PHASE 3 — STUB] كانت تسجّل الدخول تلقائياً بمقارنة كلمات مرور مشفّرة
   محلياً مقابل نظام adminAccounts الوهمي. الدخول التلقائي الحقيقي يحتاج
   تخزين JWT + التحقق منه عبر GET /api/auth/verify — ميزة لاحقة منفصلة.
   حالياً: نعطّلها لتجنب أي محاولة دخول تلقائي على بيانات وهمية. */
async function tryAutoLogin() {
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

/* [PHASE 3] إعادة كتابة كاملة — تتصل الآن بمسارات المصادقة الحقيقية
   بدل نظام adminAccounts المحلي الوهمي (الوظائف القديمة أُبقيت أسفل
   الملف كمرجع خامل، غير مستدعاة من هنا). */
async function attemptLogin() {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room_id');
    if (!roomId) {
        if (typeof showNotification === 'function') showNotification('⚠️ لا يوجد رقم غرفة بالرابط (?room_id=...)', 'leave');
        return;
    }
    const mainValue = document.getElementById('loginUsernameInput')?.value.trim();
    if (!mainValue) {
        if (typeof showNotification === 'function') showNotification(currentLoginTab === 'guest' ? 'يرجى إدخال اسم المستخدم' : 'يرجى إدخال البريد الإلكتروني', 'leave');
        return;
    }

    try {
        let res, data;
        if (currentLoginTab === 'guest') {
            res = await fetch('/api/auth/guest', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: mainValue, room_id: roomId }),
            });
            data = await res.json();
            if (!data.success) { if (typeof showNotification === 'function') showNotification(data.message || 'فشل الدخول', 'leave'); return; }
            finishLoginReal(data.user.username, data.user.rank, data.user.id, data.token, roomId, data.user.avatar);
            return;
        }

        const pw = document.getElementById('loginRoomPasswordInput')?.value.trim();
        if (currentLoginTab === 'registered') {
            if (!pw) { if (typeof showNotification === 'function') showNotification('يرجى إدخال كلمة المرور', 'leave'); return; }
            res = await fetch('/api/auth/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: mainValue, password: pw }),
            });
        } else { /* member */
            res = await fetch('/api/auth/room-entry', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: mainValue, room_id: roomId, room_password: pw || '' }),
            });
        }
        data = await res.json();
        if (!data.success) { if (typeof showNotification === 'function') showNotification(data.message || 'بيانات الدخول غير صحيحة', 'leave'); return; }
        finishLoginReal(data.username, data.rank, data.user_id, data.token, roomId, data.avatar);
    } catch (err) {
        console.error('[login] فشل الاتصال بالسيرفر:', err);
        if (typeof showNotification === 'function') showNotification('⚠️ تعذّر الاتصال بالسيرفر', 'leave');
    }
}

/* تسجيل دخول ناجح حقيقي — يحفظ التوكن ويبدأ الاتصال الفعلي بـ Socket.io */
function finishLoginReal(username, rank, userId, token, roomId, avatar) {
    if (typeof ME_USER !== 'undefined') {
        ME_USER.name = username;
        ME_USER.id = 'me';
        if (avatar) ME_USER.avatar = avatar.startsWith('http') || avatar.startsWith('data:') ? avatar : `/avatars/${avatar}`;
    }
    try { localStorage.setItem('widbid_jwt', token); } catch (e) {}
    document.getElementById('loginScreen')?.classList.add('hidden');
    if (typeof wbConnect === 'function') {
        wbConnect(roomId, username, userId || null);
    } else {
        console.error('[login] wbConnect غير معرّفة — تأكد socket-bridge.js محمّل قبل login.js');
    }
    if (typeof showNotification === 'function') showNotification(`👋 أهلاً بك ${username}`, 'join');
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
        const autoLoggedIn = await tryAutoLogin();
        /* [PHASE 3] ما فيه دخول تلقائي حقيقي بعد (tryAutoLogin معطّلة عمداً) —
           نظهر شاشة الدخول دائماً لحد ما نبني نظام تحقق جلسة حقيقي (JWT
           محفوظ + GET /api/auth/verify). */
        if (!autoLoggedIn) {
            document.getElementById('loginScreen')?.classList.remove('hidden');
        }
    } catch (err) {
        console.error('فشل تهيئة شاشة الدخول (initLoginScreen):', err);
    }
}
