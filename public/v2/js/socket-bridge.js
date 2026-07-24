/* ════════════════════════════════════════════════
   js/socket-bridge.js — الجسر الحقيقي بين واجهة widgemi وسيرفر WidBid
   [PHASE 2] أول خطوة ربط حقيقي: دخول الغرفة + رسائل + قائمة متواجدين حقيقية.
   يتطلب: <script src="/socket.io/socket.io.js"></script> قبل هذا الملف،
   ويتطلب هذا الملف نفسه يُخدَّم من نفس سيرفر WidBid (مو ملف محلي منفصل)
   عشان socket.io يلقى نقطة الاتصال تلقائياً.
   ════════════════════════════════════════════════ */
'use strict';

/* ── خرائط الرتب (نفس القيم المعتمدة بالسيرفر الحقيقي rankGuard.js) ── */
const WB_RANK_COLORS = {
  100: '#95A5A6', 200: '#3498DB', 300: '#9B59B6', 400: '#F1C40F',
  500: '#E67E22', 600: '#E74C3C', 700: '#1ABC9C', 800: '#2ECC71',
  900: '#D35400', 1000: '#C0392B', 1100: '#8E44AD', 1200: '#F0A500',
};
const WB_RANK_NAMES = {
  100: 'زائر', 200: 'عضو', 300: 'محمي', 400: 'ملكي',
  500: 'مشرف', 600: 'مشرف عام', 700: 'ماستر', 800: 'سوبر ماستر',
  900: 'روت', 1000: 'سوبر روت', 1100: 'أونر', 1200: 'سوبر أونر',
};

let wbSocket = null;
let wbRoomId = null;
let wbUsername = null;

/* ── تحويل شكل بيانات السيرفر لشكل widgemi (mockUsersList) ──
   السيرفر يرسل: {username, rank, status, isMuted}
   widgemi يتوقع: {id, name, avatar, status, isOwner, color, rank} */
function wbAdaptUser(serverUser, isMe) {
  const rank = serverUser.rank || 100;
  return {
    id: isMe ? 'me' : serverUser.username,
    name: serverUser.username,
    avatar: isMe ? (typeof ME_AVATAR !== 'undefined' ? ME_AVATAR : '') : `/avatars/av${(rank % 16) + 1}.svg`,
    status: serverUser.status === 'available' ? 'متواجد الآن' : (serverUser.status || ''),
    isOwner: rank >= 900,
    color: WB_RANK_COLORS[rank] || '#6b7280',
    rank,
    rankName: WB_RANK_NAMES[rank] || '—',
    isMuted: !!serverUser.isMuted,
  };
}

/* ── تحويل رسالة السيرفر (newMessage) لعنصر واجهة عبر منطق sendMockMessage الأصلي ── */
function wbRenderIncomingMessage(payload) {
  const fakeUser = {
    id: payload.username === wbUsername ? 'me' : payload.username,
    name: payload.username,
    avatar: payload.avatar ? `/avatars/${payload.avatar}` : '/avatars/av1.svg',
    color: WB_RANK_COLORS[payload.rank] || '#374151',
  };
  /* نعيد استخدام دالة الرسم الأصلية من chat.js — منطقها سليم وجاهز،
     فقط نمرر لها بيانات حقيقية بدل النص العشوائي */
  if (typeof sendMockMessage === 'function') {
    wbInjectRealMessageOnce(fakeUser, payload.message, payload.time);
  }
}

/* نسخة معدّلة من منطق sendMockMessage تقبل نص حقيقي بدل توليد عشوائي —
   بدون تعديل الدالة الأصلية بـ chat.js حتى لا نكسر أي استدعاء قديم لها. */
function wbInjectRealMessageOnce(user, text, isoTime) {
  if (typeof isUserIgnored === 'function' && isUserIgnored(user.id)) return;
  const msgList = document.getElementById('messagesList');
  const chatCont = document.getElementById('chatContainer');
  if (!msgList || !chatCont) return;
  const time = isoTime
    ? new Date(isoTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const msgId = 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const safeText = (typeof sanitize === 'function') ? sanitize(text) : String(text);
  const bodyHtml = (typeof linkifyMentions === 'function') ? linkifyMentions(safeText, msgId) : safeText;
  const isMe = user.id === 'me';
  const div = document.createElement('div');
  div.id = msgId;
  div.className = `flex items-start max-w-[85%] gap-2 ${isMe ? 'self-end flex-row-reverse' : 'self-start'}`;
  div.innerHTML = `<div class="message-user-trigger w-9 h-9 rounded-xl bg-purple-500 overflow-hidden shadow-md border-2 border-white shrink-0 cursor-pointer" data-user-id="${user.id}"><img src="${user.avatar}" class="w-full h-full object-cover"></div><div class="bg-white rounded-2xl shadow-sm border border-purple-100 p-3 w-full"><div class="flex justify-between items-center mb-1 gap-4"><span class="font-bold text-purple-900 text-xs message-user-trigger cursor-pointer" data-user-id="${user.id}">${(typeof sanitize === 'function') ? sanitize(user.name) : user.name}</span><span class="text-[9px] text-gray-400">${time}</span></div><p class="chat-msg-text leading-relaxed break-words message-text-trigger cursor-pointer" data-msg-id="${msgId}" style="color:${user.color};">${bodyHtml}</p></div>`;

  const wasNearBottom = (chatCont.scrollHeight - chatCont.scrollTop - chatCont.clientHeight) < 40;
  msgList.appendChild(div);
  if (typeof applyUserInterfaceSettings === 'function') applyUserInterfaceSettings();
  if (wasNearBottom) chatCont.scrollTop = chatCont.scrollHeight;
  else if (typeof unseenMessageCount !== 'undefined') unseenMessageCount++;
  if (typeof checkScrollToBottomVisibility === 'function') checkScrollToBottomVisibility();
}

/* ── الاتصال الفعلي ── */
function wbConnect(roomId, username, userId) {
  if (typeof io === 'undefined') {
    console.error('[socket-bridge] مكتبة socket.io-client غير محمّلة — أضف <script src="/socket.io/socket.io.js"> قبل هذا الملف');
    return;
  }
  wbRoomId = roomId;
  wbUsername = username;
  wbSocket = io();

  wbSocket.on('connect', () => {
    console.log('[socket-bridge] ✅ متصل بالسيرفر الحقيقي');
    wbSocket.emit('joinRoom', { room_id: roomId, username, user_id: userId || null });
  });

  wbSocket.on('connect_error', (err) => {
    console.error('[socket-bridge] ❌ فشل الاتصال:', err.message);
    if (typeof showNotification === 'function') showNotification('⚠️ تعذّر الاتصال بالسيرفر', 'leave');
  });

  /* سجل الرسائل السابقة عند الدخول */
  wbSocket.on('messageHistory', (messages) => {
    const msgList = document.getElementById('messagesList');
    if (msgList) msgList.innerHTML = '';
    messages.forEach((m) => {
      wbRenderIncomingMessage({
        username: m.username, message: m.content, rank: m.rank,
        time: m.created_at, avatar: null,
      });
    });
  });

  /* رسالة جديدة لحظياً */
  wbSocket.on('newMessage', (payload) => wbRenderIncomingMessage(payload));

  /* قائمة المتواجدين الحقيقية — تستبدل mockUsersList بالكامل */
  wbSocket.on('onlineUsers', (users) => {
    if (typeof mockUsersList === 'undefined') return;
    /* [FIX] كنا نحتفظ بهوية "أنا" الوهمية القديمة (ME_USER) بدل الاسم
       الحقيقي المتصل فيه — الآن نبني "أنا" من بيانات السيرفر الحقيقية
       (لو موجودة بالقائمة)، وإلا نرجع للهوية الافتراضية كخيار احتياطي. */
    const meFromServer = users.find((u) => u.username === username);
    const me = meFromServer
      ? wbAdaptUser(meFromServer, true)
      : (mockUsersList.find((u) => u.id === 'me') || (typeof ME_USER !== 'undefined' ? ME_USER : null));
    const adapted = users
      .filter((u) => u.username !== username)
      .map((u) => wbAdaptUser(u, false));
    mockUsersList = me ? [me, ...adapted] : adapted;
    if (typeof renderOnlineUsers === 'function') renderOnlineUsers();
  });

  /* دخول/خروج مستخدم — إشعار بسيط (القائمة نفسها تتحدث عبر onlineUsers) */
  wbSocket.on('userJoined', (data) => {
    if (typeof showNotification === 'function' && data.username !== username) {
      showNotification(`${data.username} دخل الغرفة`, 'join');
    }
  });

  /* أخطاء السيرفر (رفض صلاحية، كتم، إلخ) */
  wbSocket.on('error', (msg) => {
    if (typeof showNotification === 'function') showNotification('⚠️ ' + msg, 'leave');
    else console.warn('[socket-bridge] خطأ من السيرفر:', msg);
  });
}

/* ── إرسال رسالة حقيقية (تُستدعى بدل منطق sendMessage المحلي بـ app.js) ── */
function wbSendMessage(text) {
  if (!wbSocket || !wbRoomId) { console.warn('[socket-bridge] لا يوجد اتصال نشط'); return; }
  if (!text || !text.trim()) return;
  wbSocket.emit('sendMessage', {
    room_id: wbRoomId,
    user_id: null, // TODO: يُملأ برقم user_id الحقيقي بعد ربط تسجيل الدخول (المرحلة القادمة)
    username: wbUsername,
    message: text.trim(),
  });
}

/* ── نقطة البداية — يقرأ room_id من رابط الصفحة كخطوة مبدئية مؤقتة
   (?room_id=134) لحد ما يُربط تسجيل الدخول الحقيقي بالكامل. ── */
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room_id');
  const username = params.get('username') || (typeof ME_USER !== 'undefined' ? ME_USER.name : null);
  if (roomId && username && username !== 'أنا') {
    wbConnect(roomId, username, params.get('user_id'));
  } else {
    console.log('[socket-bridge] بانتظار معاملات الاتصال — أضف ?room_id=134&username=اسمك بالرابط للاختبار');
  }
});
