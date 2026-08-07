/* pm.js — [S18-26] نظام الرسائل الخاصة الحقيقي 100% — يستبدل النظام
   الوهمي القديم (localStorage بالكامل، صفر اتصال حقيقي). الآن كل رسالة
   تُخزَّن بقاعدة البيانات وتوصل فوراً عبر Socket.io الحقيقي، بما فيها
   لحظات وصولها لمستخدم بمتصفح/جهاز مختلف تماماً. */

let pmConversationsList = [];  // [{contact, lastMessage, lastFromMe, lastAt, unread}]
let pmCurrentMessages = [];    // رسائل المحادثة المفتوحة حالياً
let currentPmUserId = null;    // اسم المستخدم (username) للمحادثة المفتوحة

function getTotalUnreadPm() {
    return pmConversationsList.reduce((sum, c) => sum + (c.unread || 0), 0);
}

function updatePmBadge() {
    const badge = document.getElementById('pmUnreadBadge');
    if (!badge) return;
    const total = getTotalUnreadPm();
    if (total > 0) { badge.textContent = total > 99 ? '99+' : total; badge.classList.remove('hidden'); }
    else { badge.classList.add('hidden'); }
}

function pmSafe(str) { return (typeof sanitize === 'function') ? sanitize(str) : String(str); }

function pmFormatTime(iso) {
    try { return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
}

/* يعيد بيانات عرض جهة الاتصال (اسم/صورة/لون) اعتماداً على القائمة الحية
   الحقيقية لو متواجد الآن، وإلا صورة افتراضية عامة (ما نعرف شكله لو غادر) */
function getPmContactDisplay(username) {
    const live = (typeof mockUsersList !== 'undefined') ? mockUsersList.find(u => u.name === username) : null;
    if (live) return { name: live.name, avatar: live.avatar, online: true };
    return { name: username, avatar: '/avatars/av1.svg', online: false };
}

/* ---------- قائمة المحادثات (حقيقية من السيرفر) ---------- */
function openPmListModal() {
    document.getElementById('sideMenu')?.classList.remove('active');
    document.getElementById('onlineUsersPanel')?.classList.remove('active');
    document.getElementById('pmListItems').innerHTML = '<div class="text-center text-gray-400 text-xs py-10">جاري التحميل...</div>';
    document.getElementById('pmListModal')?.classList.remove('hidden');
    if (typeof wbSocket !== 'undefined' && wbSocket?.connected) {
        wbSocket.emit('getPrivateConversationsList');
    }
}

function renderPmList() {
    const listEl = document.getElementById('pmListItems');
    if (!listEl) return;
    if (pmConversationsList.length === 0) {
        listEl.innerHTML = '<div class="text-center text-gray-400 text-xs py-10">لا توجد محادثات خاصة بعد<br>ابدأ محادثة من الضغط على أي عضو</div>';
        return;
    }
    listEl.innerHTML = pmConversationsList.map(c => {
        const info = getPmContactDisplay(c.contact);
        return `
        <div class="pm-swipe-wrapper relative overflow-hidden rounded-xl mb-2">
            <div class="absolute inset-0 flex items-center justify-between px-4 text-white text-xs font-bold" style="background:linear-gradient(to left, #ef4444 50%, #f59e0b 50%);">
                <span>حذف</span><span>غير مقروءة</span>
            </div>
            <button class="pm-open-conv-btn relative w-full flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl" data-user-id="${pmSafe(c.contact)}" style="touch-action: pan-y;">
                <img src="${pmSafe(info.avatar)}" class="w-11 h-11 rounded-xl object-cover border-2 ${info.online ? 'border-purple-200' : 'border-gray-200 opacity-60'} shrink-0">
                <div class="flex-1 text-right overflow-hidden">
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-gray-800 text-sm truncate">${pmSafe(info.name)}</span>
                        ${c.unread > 0 ? `<span class="bg-red-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center shrink-0">${c.unread > 9 ? '9+' : c.unread}</span>` : ''}
                    </div>
                    <span class="text-gray-400 text-[11px] truncate block">${c.lastFromMe ? 'أنت: ' : ''}${pmSafe(c.lastMessage)}</span>
                </div>
            </button>
        </div>`;
    }).join('');
    attachPmSwipeHandlers();
}

function attachPmSwipeHandlers() {
    document.querySelectorAll('.pm-open-conv-btn').forEach(item => {
        let startX = 0, currentX = 0, isSwiping = false, moved = false;
        item.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX; currentX = startX; isSwiping = true; moved = false;
            item.style.transition = 'none';
        }, { passive: true });
        item.addEventListener('touchmove', e => {
            if (!isSwiping) return;
            currentX = e.touches[0].clientX;
            const diff = currentX - startX;
            if (Math.abs(diff) > 8) moved = true;
            item.style.transform = `translateX(${diff}px)`;
        }, { passive: true });
        item.addEventListener('touchend', () => {
            if (!isSwiping) return;
            isSwiping = false;
            const diff = currentX - startX;
            item.style.transition = 'transform 0.25s ease';
            const uid = item.dataset.userId;
            if (moved && diff < -70) {
                item.style.transform = 'translateX(-100%)';
                setTimeout(() => deletePmConversation(uid), 180);
            } else {
                item.style.transform = 'translateX(0)';
            }
        });
    });
}

function deletePmConversation(username) {
    if (typeof wbSocket !== 'undefined' && wbSocket?.connected) {
        wbSocket.emit('deletePrivateConversation', { withUser: username });
    }
    pmConversationsList = pmConversationsList.filter(c => c.contact !== username);
    updatePmBadge();
    renderPmList();
    if (typeof showNotification === 'function') showNotification('🗑️ تم حذف المحادثة', 'leave');
}

/* ---------- نافذة محادثة فردية (حقيقية) ---------- */
function openPmConversation(username) {
    const info = getPmContactDisplay(username);
    currentPmUserId = username;
    document.getElementById('pmListModal')?.classList.add('hidden');

    const nameEl = document.getElementById('pmConvName');
    if (nameEl) nameEl.textContent = info.name;
    const avatarEl = document.getElementById('pmConvAvatar');
    if (avatarEl) avatarEl.src = info.avatar;

    document.getElementById('pmConvBody').innerHTML = '<div class="text-center text-gray-400 text-xs py-10">جاري التحميل...</div>';
    document.getElementById('pmConversationModal')?.classList.remove('hidden');

    if (typeof wbSocket !== 'undefined' && wbSocket?.connected) {
        wbSocket.emit('getPrivateConversation', { withUser: username });
    } else if (typeof showNotification === 'function') {
        showNotification('⚠️ لا يوجد اتصال حقيقي بالسيرفر', 'leave');
    }
}

function renderPmConversation() {
    const bodyEl = document.getElementById('pmConvBody');
    if (!bodyEl) return;
    if (pmCurrentMessages.length === 0) {
        bodyEl.innerHTML = '<div class="text-center text-gray-400 text-xs py-10">ابدأ المحادثة الآن</div>';
    } else {
        bodyEl.innerHTML = pmCurrentMessages.map(m => {
            const mine = m.sender === wbUsername;
            return `
            <div class="flex ${mine ? 'justify-end' : 'justify-start'} mb-2">
                <div class="max-w-[75%] px-3 py-2 rounded-2xl text-sm ${mine ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-800'}">
                    ${pmSafe(m.message)}
                    <div class="text-[9px] mt-1 opacity-60">${pmFormatTime(m.created_at)}</div>
                </div>
            </div>`;
        }).join('');
    }
    bodyEl.scrollTop = bodyEl.scrollHeight;
}

function sendPmMessage() {
    const input = document.getElementById('pmConvInput');
    if (!input || !currentPmUserId) return;
    const text = input.value.trim();
    if (!text) return;
    if (typeof wbSocket === 'undefined' || !wbSocket?.connected) {
        if (typeof showNotification === 'function') showNotification('⚠️ لا يوجد اتصال حقيقي بالسيرفر', 'leave');
        return;
    }
    wbSocket.emit('sendPrivateMessage', { recipient: currentPmUserId, message: text });
    input.value = '';
}

/* ---------- استقبال حقيقي حي (يُستدعى من socket-bridge.js) ---------- */
function wbHandleIncomingPm(payload) {
    const otherUser = payload.sender === wbUsername ? payload.recipient : payload.sender;
    const isOpenNow = currentPmUserId === otherUser
        && !document.getElementById('pmConversationModal')?.classList.contains('hidden');

    if (isOpenNow) {
        pmCurrentMessages.push(payload);
        renderPmConversation();
    } else if (payload.sender !== wbUsername) {
        if (typeof showNotification === 'function') {
            const info = getPmContactDisplay(payload.sender);
            showNotification(`💬 رسالة خاصة جديدة من ${info.name}`, 'join');
        }
    }
    /* حدّث قائمة المحادثات بالخلفية دايماً (تظهر صحيحة لما تُفتح لاحقاً) */
    if (typeof wbSocket !== 'undefined' && wbSocket?.connected) {
        wbSocket.emit('getPrivateConversationsList');
    }
}

function wbHandlePmConversationLoaded(data) {
    if (data.withUser !== currentPmUserId) return;
    pmCurrentMessages = data.messages || [];
    renderPmConversation();
}

function wbHandlePmListLoaded(list) {
    pmConversationsList = list || [];
    updatePmBadge();
    const modalOpen = !document.getElementById('pmListModal')?.classList.contains('hidden');
    if (modalOpen) renderPmList();
}

function backToPmList() {
    document.getElementById('pmConversationModal')?.classList.add('hidden');
    currentPmUserId = null;
    openPmListModal();
}

function closePmConversation() {
    document.getElementById('pmConversationModal')?.classList.add('hidden');
    currentPmUserId = null;
}

function initPmSystem() {
    updatePmBadge();
    /* نجلب قائمة المحادثات فور توفر اتصال حقيقي (تحدّث البادج بهدوء) */
    if (typeof wbSocket !== 'undefined' && wbSocket?.connected) {
        wbSocket.emit('getPrivateConversationsList');
    }
}
