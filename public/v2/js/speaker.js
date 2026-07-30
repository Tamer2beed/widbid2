const MIC_DEFAULT_SECONDS = 60;

let speakerState = { user: null, mode: null, secondsLeft: 0, timerId: null };
let micQueue = [];

function formatMicTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function safeSanitize(str) { return (typeof sanitize === 'function') ? sanitize(str) : String(str); }

function renderSpeakerWidget() {
    const nameEl = document.getElementById('speakerName');
    const timerEl = document.getElementById('speakerTimer');
    const iconEl = document.getElementById('speakerIcon');
    const widget = document.getElementById('speakerWidget');
    const queueCountEl = document.getElementById('speakerQueueCount');
    if (!nameEl || !timerEl || !iconEl || !widget) return;

    if (!speakerState.user) {
        nameEl.textContent = 'فري مايك';
        timerEl.textContent = 'بانتظار من يطلب';
        widget.classList.remove('speaker-active');
        iconEl.classList.remove('text-red-400', 'text-amber-400', 'animate-pulse');
        iconEl.classList.add('text-white/60');
    } else {
        nameEl.textContent = safeSanitize(speakerState.user.name);
        widget.classList.add('speaker-active');
        iconEl.classList.remove('text-white/60');
        if (speakerState.mode === 'open') {
            timerEl.textContent = 'وقت مفتوح';
            iconEl.classList.add('text-amber-300');
            iconEl.classList.remove('text-red-400', 'animate-pulse');
        } else {
            timerEl.textContent = formatMicTime(speakerState.secondsLeft);
            iconEl.classList.add('text-red-300', 'animate-pulse');
            iconEl.classList.remove('text-amber-300');
        }
    }

    if (queueCountEl) {
        if (micQueue.length > 0) {
            queueCountEl.textContent = micQueue.length;
            queueCountEl.classList.remove('hidden');
        } else {
            queueCountEl.classList.add('hidden');
        }
    }

    renderMicButtonState();
    if (typeof renderOnlineUsers === 'function') renderOnlineUsers();
}

function renderMicButtonState() {
    const micBtn = document.getElementById('micRequestBtn');
    const badge = document.getElementById('micQueueBadge');
    if (!micBtn) return;
    micBtn.classList.remove('bg-purple-50', 'text-purple-600', 'bg-red-500', 'text-white', 'bg-amber-400');
    const iAmSpeaking = speakerState.user && speakerState.user.id === ME_USER.id;
    const myQueueIndex = micQueue.findIndex(u => u.id === ME_USER.id);

    if (iAmSpeaking) {
        micBtn.classList.add('bg-red-500', 'text-white');
        micBtn.title = 'اضغط لإنهاء دورك في السبيكر';
        if (badge) badge.classList.add('hidden');
    } else if (myQueueIndex > -1) {
        micBtn.classList.add('bg-amber-400', 'text-white');
        micBtn.title = 'أنت بالطابور - اضغط للإلغاء';
        if (badge) { badge.textContent = myQueueIndex + 1; badge.classList.remove('hidden'); }
    } else {
        micBtn.classList.add('bg-purple-50', 'text-purple-600');
        micBtn.title = 'اطلب السبيكر';
        if (badge) badge.classList.add('hidden');
    }
}

function clearSpeakerTimer() {
    if (speakerState.timerId) { clearInterval(speakerState.timerId); speakerState.timerId = null; }
}

/* [PHASE 3] استبدال كامل — الحالة الآن تُملأ حصراً من بث speakerState
   الحقيقي القادم من السيرفر (rooms[room_id].current/.queue بالضبط)،
   بدل محاكاة محلية. لا يوجد "مايك مفتوح بلا وقت" بالسيرفر الحقيقي —
   كل سبيكر عنده وقت محدد قابل للتمديد (speakerExtend) أو الإنهاء
   (speakerRevoke) من طرف مشرف، أو الإنهاء الذاتي (speakerDone). */

function _wbAdaptSpeakerUser(u) {
    if (!u) return null;
    const rank = u.rank || 100;
    return {
        id: u.username, name: u.username,
        color: (typeof WB_RANK_COLORS !== 'undefined' && WB_RANK_COLORS[rank]) || '#9ca3af',
        rank,
    };
}

/* يُستدعى من socket-bridge.js عند كل بث speakerState حقيقي */
function wbApplySpeakerState(data) {
    clearSpeakerTimer();
    if (data.current) {
        speakerState.user = _wbAdaptSpeakerUser(data.current);
        speakerState.mode = 'timed';
        speakerState.secondsLeft = Math.max(0, Math.round((data.current.endsAt - Date.now()) / 1000));
        speakerState.timerId = setInterval(() => {
            speakerState.secondsLeft--;
            if (speakerState.secondsLeft <= 0) { clearSpeakerTimer(); }
            renderSpeakerWidget();
        }, 1000);
    } else {
        speakerState.user = null;
        speakerState.mode = null;
        speakerState.secondsLeft = 0;
    }
    micQueue = (data.queue || []).map(_wbAdaptSpeakerUser);
    renderSpeakerWidget();
}

/* الزر الرئيسي: يقرر تلقائياً هل يطلب / يلغي الطلب / ينهي دوره — حسب حالتي الحقيقية */
function requestMic(user) {
    if (typeof wbSocket === 'undefined' || !wbSocket || !wbSocket.connected) {
        if (typeof showNotification === 'function') showNotification('⚠️ لا يوجد اتصال حقيقي بالسيرفر', 'leave');
        return;
    }
    const iAmSpeaking = speakerState.user && speakerState.user.id === wbUsername;
    const iAmQueued = micQueue.findIndex(u => u.id === wbUsername) > -1;
    if (iAmSpeaking) {
        wbSocket.emit('speakerDone', { room_id: wbRoomId, username: wbUsername });
    } else if (iAmQueued) {
        wbSocket.emit('speakerLeaveQueue', { room_id: wbRoomId, username: wbUsername });
    } else {
        wbSocket.emit('speakerRequest', { room_id: wbRoomId, username: wbUsername, rank: getCurrentUserRank() });
    }
}

/* إجراءات إدارية حقيقية — كلها تتطلب رتبة 500+ (السيرفر هو الحكم الحقيقي) */
function releaseSpeaker() { /* إنهاء المتحدث الحالي إدارياً */
    if (typeof wbSocket !== 'undefined' && wbSocket?.connected) wbSocket.emit('speakerRevoke', { room_id: wbRoomId });
}
function extendMicTime(seconds) {
    if (typeof wbSocket !== 'undefined' && wbSocket?.connected) wbSocket.emit('speakerExtend', { room_id: wbRoomId, seconds });
}
function skipQueueFirst() {
    if (typeof wbSocket !== 'undefined' && wbSocket?.connected) wbSocket.emit('speakerSkip', { room_id: wbRoomId });
}
function giveSpeakerTo(targetUsername) {
    if (typeof wbSocket !== 'undefined' && wbSocket?.connected) wbSocket.emit('speakerGiveTo', { room_id: wbRoomId, target: targetUsername });
}
/* [ملاحظة] grantOpenMic() حُذفت — "مايك بلا وقت" غير مدعوم بالسيرفر الحقيقي. */

function getUserMicBadgeHtml(userId) {
    if (speakerState.user && speakerState.user.id === userId) {
        return '<span class="text-red-500 text-xs bg-red-50 p-1 rounded-md animate-pulse"><i class="fa-solid fa-microphone"></i></span>';
    }
    const qIdx = micQueue.findIndex(u => u.id === userId);
    if (qIdx > -1) {
        return `<span class="text-amber-500 text-xs bg-amber-50 p-1 rounded-md relative"><i class="fa-solid fa-hand"></i><span class="absolute -top-1 -left-1 bg-amber-600 text-white text-[8px] rounded-full w-3 h-3 flex items-center justify-center">${qIdx + 1}</span></span>`;
    }
    return '';
}

/* [PHASE 1 — STUB] كانت تطلب مايك عشوائي كل 18 ثانية من مستخدم وهمي.
   طلبات المايك الحقيقية تصل عبر Socket.io (حدث speakerRequest بالسيرفر
   الحقيقي). أُبقيت فارغة بنفس التوقيع لعدم كسر أي استدعاء قديم. */
function simulateMicRequest() {
    // TODO(ربط حقيقي): يُستبدل بمستمع socket.on('speakerState', ...) بدل الاستدعاء اليدوي.
}

function toggleSpeakerAdminMenu() {
    const menu = document.getElementById('speakerAdminMenu');
    if (menu) menu.classList.toggle('show');
}

function initSpeakerFeature() {
    try {
        renderSpeakerWidget();

        const micBtn = document.getElementById('micRequestBtn');
        if (micBtn) micBtn.addEventListener('click', () => requestMic(ME_USER));

        const widget = document.getElementById('speakerWidget');
        if (widget) widget.addEventListener('click', (e) => { e.stopPropagation(); toggleSpeakerAdminMenu(); });

        const grantOpenBtn = document.getElementById('speakerGrantOpenBtn');
        if (grantOpenBtn) grantOpenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            /* [PHASE 3] "مايك بلا وقت" غير مدعوم — أعدنا توظيف الزر
               ليكون "تخطي للمتحدث التالي بالطابور" (speakerSkip الحقيقي). */
            if (typeof skipQueueFirst === 'function') skipQueueFirst();
            document.getElementById('speakerAdminMenu')?.classList.remove('show');
        });

        const extendBtn = document.getElementById('speakerExtendBtn');
        if (extendBtn) extendBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            extendMicTime(30);
            document.getElementById('speakerAdminMenu')?.classList.remove('show');
        });

        const endBtn = document.getElementById('speakerEndBtn');
        if (endBtn) endBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            releaseSpeaker();
            document.getElementById('speakerAdminMenu')?.classList.remove('show');
        });

        document.addEventListener('click', (e) => {
            const menu = document.getElementById('speakerAdminMenu');
            if (menu && menu.classList.contains('show') && !e.target.closest('#speakerWidget')) {
                menu.classList.remove('show');
            }
        });

        // [PHASE 1] أُزيل setInterval(simulateMicRequest, 18000) — الدالة صارت خاملة.
    } catch (err) {
        console.error('فشل تهيئة ميزة السبيكر (initSpeakerFeature):', err);
    }
}
