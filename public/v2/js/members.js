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
        releaseSpeaker();
    } else if (typeof micQueue !== 'undefined') {
        micQueue = micQueue.filter(u => String(u.id) !== String(uid));
        if (typeof renderSpeakerWidget === 'function') renderSpeakerWidget();
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
    const user = (typeof mockUsersList !== 'undefined') ? mockUsersList.find(u => String(u.id) === String(contextMenuTargetUserId)) : null;
    if (user && typeof grantOpenMic === 'function') grantOpenMic(user);
    closeMemberContextMenu();
}

function adminClearQueueExceptTarget() {
    const uid = contextMenuTargetUserId;
    if (typeof micQueue !== 'undefined') {
        micQueue = micQueue.filter(u => String(u.id) === String(uid));
        if (typeof renderSpeakerWidget === 'function') renderSpeakerWidget();
    }
    closeMemberContextMenu();
    if (typeof showNotification === 'function') showNotification('🧹 تم سحب البقية من طابور السبيكر', 'leave');
}
