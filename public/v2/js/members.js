/* members.js — قائمة إجراءات الضغط على عضو (بالمتواجدين أو داخل رسالة بالدردشة)،
   مع قائمة فرعية لخيارات المشرف (Admin فما فوق) على من يستخدم السبيكر حالياً. */

let contextMenuTargetUserId = null;
let contextMenuTargetMsgId = null;

function getIgnoredUserIds() { try { return JSON.parse(localStorage.getItem('ignoredUserIds') || '[]'); } catch (e) { return []; } }
function saveIgnoredUserIds(list) { try { localStorage.setItem('ignoredUserIds', JSON.stringify(list)); } catch (e) {} }
function isUserIgnored(userId) { return getIgnoredUserIds().map(String).includes(String(userId)); }

function isCurrentUserAdminOrAbove() {
    return typeof getCurrentUserRoleIndex === 'function' &&
        typeof ADMIN_ROLE_ORDER !== 'undefined' &&
        getCurrentUserRoleIndex() >= ADMIN_ROLE_ORDER.indexOf('admin');
}

function positionContextPanel(triggerEl) {
    const panel = document.querySelector('#memberContextModal .member-context-panel');
    if (!panel) return;
    if (!triggerEl) { panel.style.top = '70px'; panel.style.left = '10px'; panel.style.right = 'auto'; panel.style.bottom = 'auto'; return; }
    const rect = triggerEl.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const panelWidth = Math.min(270, vw - 16);
    let left = rect.right - panelWidth;
    if (left < 8) left = 8;
    if (left + panelWidth > vw - 8) left = vw - panelWidth - 8;

    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;

    panel.style.position = 'fixed';
    panel.style.left = left + 'px';
    panel.style.width = panelWidth + 'px';
    panel.style.right = 'auto';

    if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
        panel.style.top = (rect.bottom + 6) + 'px';
        panel.style.bottom = 'auto';
        panel.style.maxHeight = Math.max(150, spaceBelow - 16) + 'px';
    } else {
        panel.style.bottom = (vh - rect.top + 6) + 'px';
        panel.style.top = 'auto';
        panel.style.maxHeight = Math.max(150, spaceAbove - 16) + 'px';
    }
    panel.style.overflowY = 'auto';
}

function openMemberContextMenu(userId, msgId, triggerEl) {
    if (String(userId) === 'me') return;
    const user = (typeof mockUsersList !== 'undefined') ? mockUsersList.find(u => String(u.id) === String(userId)) : null;
    if (!user) return;
    contextMenuTargetUserId = userId;
    contextMenuTargetMsgId = msgId || null;

    const nameEl = document.getElementById('memberContextName');
    if (nameEl) nameEl.textContent = user.name;

    document.getElementById('memberContextMainPanel')?.classList.remove('hidden');
    document.getElementById('memberContextAdminPanel')?.classList.add('hidden');

    const ignoreBtn = document.getElementById('memberContextIgnoreBtn');
    if (ignoreBtn) ignoreBtn.innerHTML = isUserIgnored(userId)
        ? '<i class="fa-solid fa-volume-high ml-2"></i> إلغاء التجاهل'
        : '<i class="fa-solid fa-volume-xmark ml-2"></i> تجاهل';

    const hasMsg = !!contextMenuTargetMsgId;
    document.getElementById('memberContextClearMsgBtn')?.classList.toggle('hidden', !hasMsg);
    document.getElementById('memberContextClearMsgAllBtn')?.classList.toggle('hidden', !(hasMsg && isCurrentUserAdminOrAbove()));

    document.getElementById('memberContextAdminEntryBtn')?.classList.toggle('hidden', !isCurrentUserAdminOrAbove());

    /* [كتم/تحذير] فحص رتبة حقيقي مستقل (بدل الفهرس القديم المعطوب أعلاه):
       كتم يتطلب Admin(500)+، تحذير يتطلب Super Admin(600)+، وبكل الحالتين
       لازم رتبة المنفّذ أعلى فعلياً من رتبة الهدف. rankGuard بالسيرفر هو
       الحكم النهائي دائماً — هذا فقط لإخفاء/إظهار الأزرار بالواجهة. */
    const myRealRank = typeof getCurrentUserRank === 'function' ? getCurrentUserRank() : 100;
    const targetRealRank = user.rank || 100;
    const canMuteTarget = myRealRank >= 500 && myRealRank > targetRealRank;
    const canWarnTarget = myRealRank >= 600 && myRealRank > targetRealRank;
    const muteBtn = document.getElementById('memberContextMuteBtn');
    if (muteBtn) {
        muteBtn.classList.toggle('hidden', !canMuteTarget);
        muteBtn.innerHTML = user.isMuted
            ? '<i class="fa-solid fa-comment ml-2"></i> فك كتم الكتابة'
            : '<i class="fa-solid fa-comment-slash ml-2"></i> كتم الكتابة';
    }
    document.getElementById('memberContextWarnBtn')?.classList.toggle('hidden', !canWarnTarget);

    /* [حظر IP/الجهاز] Master(700)+ لحظر IP، SuperMaster(800)+ لحظر الجهاز —
       يعتمدان على Socket.io حقيقي فيعملان فقط على حساب حقيقي متصل، مو بوت
       (البوت ما عنده IP أو جهاز فعلي أصلاً). */
    const canBanIP     = myRealRank >= 700 && myRealRank > targetRealRank && !user.isBot;
    const canBanDevice = myRealRank >= 800 && myRealRank > targetRealRank && !user.isBot;
    document.getElementById('memberContextBanIPBtn')?.classList.toggle('hidden', !canBanIP);
    document.getElementById('memberContextBanDeviceBtn')?.classList.toggle('hidden', !canBanDevice);

    /* [S18-17] "تحدث مشترك" — Super Admin(600)+، ويظهر فقط لو الهدف
       موجود فعلياً بطابور المايك الحالي (micQueue من speaker.js) */
    const isInMicQueue = typeof micQueue !== 'undefined' && micQueue.some(u => u.id === user.name);
    const canCoSpeak = myRealRank >= 600 && isInMicQueue;
    document.getElementById('memberContextCoSpeakBtn')?.classList.toggle('hidden', !canCoSpeak);

    positionContextPanel(triggerEl);
    showMemberContextModalAnimated();
}

function closeMemberContextMenu() {
    const modal = document.getElementById('memberContextModal');
    if (!modal) return;
    modal.classList.remove('panel-visible');
    setTimeout(() => modal.classList.add('hidden'), 220);
}
function showMemberContextModalAnimated() {
    const modal = document.getElementById('memberContextModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('panel-visible')));
}

function openMemberProfile(userId) {
    const user = (typeof mockUsersList !== 'undefined') ? mockUsersList.find(u => String(u.id) === String(userId)) : null;
    if (!user) return;
    closeMemberContextMenu();
    const avatarEl = document.getElementById('profileAvatar');
    if (avatarEl) avatarEl.src = user.avatar;
    const nameEl = document.getElementById('profileName');
    if (nameEl) nameEl.textContent = user.name;
    const statusEl = document.getElementById('profileStatus');
    if (statusEl) statusEl.textContent = user.status || '';
    const roleEl = document.getElementById('profileRoleBadge');
    if (roleEl) {
        const roleColor = (typeof getRoleDisplayColor === 'function') ? getRoleDisplayColor(user.role) : null;
        if (roleColor && user.isOwner && typeof ADMIN_ROLE_LABELS !== 'undefined') {
            roleEl.style.display = 'inline-block';
            roleEl.style.background = roleColor + '30';
            roleEl.style.color = roleColor;
            roleEl.textContent = ADMIN_ROLE_LABELS[user.role] || '';
        } else {
            roleEl.style.display = 'none';
        }
    }
    document.getElementById('memberProfileModal')?.classList.remove('hidden');
}

function toggleIgnoreMember() {
    if (!contextMenuTargetUserId) return;
    let list = getIgnoredUserIds();
    const idStr = String(contextMenuTargetUserId);
    const user = (typeof mockUsersList !== 'undefined') ? mockUsersList.find(u => String(u.id) === idStr) : null;
    if (list.map(String).includes(idStr)) {
        list = list.filter(x => String(x) !== idStr);
        if (typeof showNotification === 'function') showNotification(`🔊 تم إلغاء تجاهل ${user ? user.name : 'العضو'}`, 'join');
    } else {
        list.push(contextMenuTargetUserId);
        if (typeof showNotification === 'function') showNotification(`🔇 تم تجاهل ${user ? user.name : 'العضو'} - لن تظهر رسائله لك`, 'leave');
    }
    saveIgnoredUserIds(list);
    closeMemberContextMenu();
    if (typeof renderOnlineUsers === 'function') renderOnlineUsers();
}

function reportMember() {
    closeMemberContextMenu();
    if (typeof showNotification === 'function') showNotification('🚩 تم إرسال البلاغ، شكراً لك', 'leave');
}

function startPrivateChatPlaceholder() {
    const targetId = contextMenuTargetUserId;
    closeMemberContextMenu();
    if (typeof openPmConversation === 'function' && targetId) openPmConversation(targetId);
}

function mentionTargetInInput() {
    const user = (typeof mockUsersList !== 'undefined') ? mockUsersList.find(u => String(u.id) === String(contextMenuTargetUserId)) : null;
    if (!user) return;
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.value = (chatInput.value ? chatInput.value.trim() + ' ' : '') + '@' + user.name + ' ';
        chatInput.focus();
    }
    closeMemberContextMenu();
}

/* مسح رسالة محددة (لي فقط، أو "للجميع" — بدون خادم مركزي هذا يمسحها محلياً عندك فقط بالنموذج التجريبي) */
function clearMessageForMe() {
    if (contextMenuTargetMsgId) { document.getElementById(contextMenuTargetMsgId)?.remove(); }
    closeMemberContextMenu();
}
function clearMessageForEveryone() {
    if (contextMenuTargetMsgId) { document.getElementById(contextMenuTargetMsgId)?.remove(); }
    closeMemberContextMenu();
    if (typeof showNotification === 'function') showNotification('🗑️ تم مسح الرسالة (لا يوجد خادم مركزي بهذا النموذج، فالمسح محلي فقط)', 'leave');
}

/* ---------- قائمة خيارات المشرف الفرعية (Admin فما فوق) ---------- */
function openAdminSubPanel() {
    document.getElementById('memberContextMainPanel')?.classList.add('hidden');
    document.getElementById('memberContextAdminPanel')?.classList.remove('hidden');
}
function backToMemberMainPanel() {
    document.getElementById('memberContextAdminPanel')?.classList.add('hidden');
    document.getElementById('memberContextMainPanel')?.classList.remove('hidden');
}

function adminKickFromMicTarget() {
    const uid = contextMenuTargetUserId;
    if (typeof speakerState !== 'undefined' && speakerState.user && String(speakerState.user.id) === String(uid) && typeof releaseSpeaker === 'function') {
        releaseSpeaker(); /* [حقيقي] ينهي المتحدث الحالي فعلياً عبر speakerRevoke */
    } else if (typeof skipQueueFirst === 'function') {
        /* [ملاحظة] السيرفر الحقيقي يدعم بس تخطي أول شخص بالطابور —
           لو الهدف مو أول واحد، هذا أقرب إجراء حقيقي متاح. */
        skipQueueFirst();
    }
    closeMemberContextMenu();
}

function adminExtendMicTarget() {
    const uid = contextMenuTargetUserId;
    if (typeof speakerState !== 'undefined' && speakerState.user && String(speakerState.user.id) === String(uid) && typeof extendMicTime === 'function') {
        extendMicTime(30);
        if (typeof showNotification === 'function') showNotification('⏱️ تم تمديد وقت التكلم 30 ثانية', 'join');
    } else if (typeof showNotification === 'function') {
        showNotification('هذا العضو ليس على السبيكر حالياً', 'leave');
    }
    closeMemberContextMenu();
}

function adminGrantOpenMicTarget() {
    /* [PHASE 3] "مايك بلا وقت" غير مدعوم بالسيرفر الحقيقي — أعدنا توظيف
       هذا الزر ليعطي المايك مباشرة للعضو المستهدف عبر speakerGiveTo
       الحقيقي (يتخطى الطابور، بنفس مدة المتحدث الافتراضية). */
    const user = (typeof mockUsersList !== 'undefined') ? mockUsersList.find(u => String(u.id) === String(contextMenuTargetUserId)) : null;
    if (user && typeof giveSpeakerTo === 'function') giveSpeakerTo(user.id);
    closeMemberContextMenu();
}

function adminClearQueueExceptTarget() {
    /* [PHASE 3] لا يوجد بالسيرفر الحقيقي حدث "امسح الطابور إلا شخص واحد"
       — أقرب إجراء حقيقي متاح هو speakerSkip (تخطي أول واحد بالطابور)
       بشكل متكرر يدوياً، أو تركه معطّلاً لحد ما نضيف الحدث بالسيرفر. */
    if (typeof showNotification === 'function') showNotification('ℹ️ هذا الإجراء غير مدعوم بالسيرفر الحقيقي حالياً', 'leave');
    closeMemberContextMenu();
}

/* ---------- كتم / فك كتم الكتابة (حقيقي عبر muteUser/unmuteUser) ---------- */
function adminMuteToggleTarget() {
    const user = (typeof mockUsersList !== 'undefined') ? mockUsersList.find(u => String(u.id) === String(contextMenuTargetUserId)) : null;
    closeMemberContextMenu();
    if (!user) return;
    if (typeof wbSocket === 'undefined' || !wbSocket || !wbSocket.connected) {
        if (typeof showNotification === 'function') showNotification('⚠️ لا يوجد اتصال حقيقي بالسيرفر', 'leave');
        return;
    }
    const event = user.isMuted ? 'unmuteUser' : 'muteUser';
    wbSocket.emit(event, { room_id: wbRoomId, target: user.name, by: wbUsername });
    /* [ملاحظة] لا نعدّل user.isMuted محلياً هنا — السيرفر يرد بحدث onlineUsers
       محدَّث فوراً بعد تنفيذ الإجراء فعلياً (بما فيه رفض الحصانة إن وُجد)،
       فنتجنب أي تناقض بين ما تظهره الواجهة وما وافق عليه السيرفر فعلياً. */
}

/* ---------- تحذير رسمي (حقيقي عبر warnUser) ---------- */
let warnUserTargetName = null;
function openWarnUserModal() {
    const user = (typeof mockUsersList !== 'undefined') ? mockUsersList.find(u => String(u.id) === String(contextMenuTargetUserId)) : null;
    closeMemberContextMenu();
    if (!user) return;
    warnUserTargetName = user.name;
    const subtitle = document.getElementById('warnUserModalSubtitle');
    if (subtitle) subtitle.textContent = `سبب تحذير ${user.name}`;
    const reasonInput = document.getElementById('warnReasonInput');
    if (reasonInput) reasonInput.value = '';
    document.getElementById('warnUserModal')?.classList.remove('hidden');
}
function confirmWarnUser() {
    const reason = document.getElementById('warnReasonInput')?.value.trim();
    if (!reason) { if (typeof showNotification === 'function') showNotification('يرجى كتابة سبب التحذير', 'leave'); return; }
    document.getElementById('warnUserModal')?.classList.add('hidden');
    if (!warnUserTargetName) return;
    if (typeof wbSocket === 'undefined' || !wbSocket || !wbSocket.connected) {
        if (typeof showNotification === 'function') showNotification('⚠️ لا يوجد اتصال حقيقي بالسيرفر', 'leave');
        return;
    }
    wbSocket.emit('warnUser', { room_id: wbRoomId, target: warnUserTargetName, reason, by: wbUsername });
    warnUserTargetName = null;
}

/* ---------- حظر IP (24 ساعة) — حقيقي عبر banIP (Master 700+) ---------- */
function adminBanIP() {
    const user = (typeof mockUsersList !== 'undefined') ? mockUsersList.find(u => String(u.id) === String(contextMenuTargetUserId)) : null;
    closeMemberContextMenu();
    if (!user || user.isBot) return;
    if (typeof wbSocket === 'undefined' || !wbSocket || !wbSocket.connected) {
        if (typeof showNotification === 'function') showNotification('⚠️ لا يوجد اتصال حقيقي بالسيرفر', 'leave');
        return;
    }
    wbSocket.emit('banIP', { room_id: wbRoomId, target: user.name, by: wbUsername });
}

/* ---------- حظر الجهاز — حقيقي عبر banDevice (Super Master 800+) ---------- */
function adminBanDevice() {
    const user = (typeof mockUsersList !== 'undefined') ? mockUsersList.find(u => String(u.id) === String(contextMenuTargetUserId)) : null;
    closeMemberContextMenu();
    if (!user || user.isBot) return;
    if (typeof wbSocket === 'undefined' || !wbSocket || !wbSocket.connected) {
        if (typeof showNotification === 'function') showNotification('⚠️ لا يوجد اتصال حقيقي بالسيرفر', 'leave');
        return;
    }
    wbSocket.emit('banDevice', { room_id: wbRoomId, target: user.name, by: wbUsername });
}

/* ---------- تحدث مشترك (حقيقي عبر speakerAddCoSpeaker) ---------- */
function adminAddCoSpeaker() {
    const user = (typeof mockUsersList !== 'undefined') ? mockUsersList.find(u => String(u.id) === String(contextMenuTargetUserId)) : null;
    closeMemberContextMenu();
    if (!user) return;
    if (typeof wbSocket === 'undefined' || !wbSocket || !wbSocket.connected) {
        if (typeof showNotification === 'function') showNotification('⚠️ لا يوجد اتصال حقيقي بالسيرفر', 'leave');
        return;
    }
    wbSocket.emit('speakerAddCoSpeaker', { room_id: wbRoomId, target: user.name, by: wbUsername });
}
