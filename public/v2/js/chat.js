const memberColors = ['#1f2937','#2563eb','#dc2626','#16a34a','#9333ea','#ea580c','#0891b2','#be123c'];

const ME_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%239333ea'/%3E%3Ccircle cx='50' cy='38' r='18' fill='white'/%3E%3Cellipse cx='50' cy='90' rx='32' ry='28' fill='white'/%3E%3C/svg%3E";
const ME_USER = {
    id: 'me', name: 'أنا', avatar: ME_AVATAR,
    status: localStorage.getItem('myStatus') || 'متواجد الآن',
    statusColor: localStorage.getItem('myStatusColor') || '#22c55e',
    isOwner: false, color: '#9333ea'
};

/* [PHASE 1] القائمة كانت مليانة مستخدمين وهميين (صور Unsplash، أسماء عشوائية).
   الآن فاضية إلا من المستخدم الحالي — ستُملأ لاحقاً ببيانات حقيقية من
   حدث Socket.io المسمّى 'onlineUsers' وقت الربط الفعلي بالسيرفر. */
let mockUsersList = [
    ME_USER
];

const newNamesPool = ["المهندس أحمد","نجمة طرابلس","الصقر الليبي","بنغازي العز","صقر الجنوب","ريما","عابر سبيل"];
const newAvatarsPool = ["https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150","https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150","https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=150","https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150"];
const newStatusesPool = ["منورين يا غوالي","يسعد مساكم جميعاً","مرحبتين بالجميع","برنس في حالي","بأخلاقي أرتقي"];
const mockPhrases = ["السلام عليكم ورحمة الله، مساكم الله بالخير يا جماعة منورين","مرحبتين بيك، كيف حالكم وحال أهلنا في ليبيا؟","أهلاً وسهلاً بالجميع، يسعدنا تواجدكم معنا في الروم اليوم","روم متميز كالعادة، ترحيب حار بكل الحضور منورين جداً","منورين يا غوالي، إن شاء الله ديمة ملتمين على الخير والود","يا مرحب بكل الأعضاء الجدد، نورتوا الجلسة الليبية","شن الجو اليوم يا شباب؟ إن شاء الله الكل بخير ومبسوطين","منور يا عباصم الروم منور بأهله وناسه دايماً"];

function sanitize(str) { return String(str).replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

let messageRegistry = {};

function getUserSortPriority(userId, originalIndex) {
    try {
        if (typeof speakerState !== 'undefined' && speakerState.user && speakerState.user.id === userId) return -1;
        if (typeof micQueue !== 'undefined') {
            const qIdx = micQueue.findIndex(q => q.id === userId);
            if (qIdx > -1) return qIdx;
        }
    } catch (err) { console.error('خطأ في حساب ترتيب الطابور:', err); }
    return 1000 + originalIndex;
}

function renderOnlineUsers() {
    const container = document.getElementById("onlineUsersList");
    if (!container) return;
    container.innerHTML = "";

    const sortedUsers = mockUsersList
        .map((user, idx) => ({ user, priority: getUserSortPriority(user.id, idx) }))
        .sort((a, b) => a.priority - b.priority)
        .map(entry => entry.user);

    sortedUsers.forEach(user => {
        const micBadge = (typeof getUserMicBadgeHtml === 'function') ? getUserMicBadgeHtml(user.id) : '';
        const isMe = user.id === 'me';
        const dotColor = isMe ? (user.statusColor || '#22c55e') : '#22c55e';
        const item = document.createElement('div');
        const ignored = (!isMe && typeof isUserIgnored === 'function' && isUserIgnored(user.id));
        item.className = `flex items-center justify-between p-2 rounded-xl border shadow-sm user-card-item ${!isMe ? 'cursor-pointer' : ''} ${isMe ? 'bg-purple-50 border-purple-300 ring-1 ring-purple-300' : 'bg-gray-50 border-gray-100'} ${ignored ? 'opacity-50' : ''}`;
        item.dataset.userId = user.id;
        const roleStyle = (isMe && user.hasAccount && typeof getRoleNameStyle === 'function') ? getRoleNameStyle(user.role) : '';
        const nameStyle = roleStyle ? ` style="${roleStyle}"` : '';
        const glowClass = (isMe && user.hasAccount && user.role === 'super_master') ? ' super-master-glow' : '';
        const nameLabel = isMe ? `<span class="font-bold${glowClass}"${nameStyle}>${sanitize(user.name)}</span> <span class="text-purple-500 text-[9px] font-normal">(أنت)</span>` : `<span${nameStyle}>${sanitize(user.name)}</span>`;
        item.innerHTML = `<div class="flex items-center gap-3"><div class="relative"><img src="${sanitize(user.avatar)}" class="w-11 h-11 rounded-xl object-cover border-2 ${isMe ? 'border-purple-400' : 'border-amber-400'}"><div class="absolute bottom-[-2px] left-[-2px] w-3 h-3 rounded-full border-2 border-white" style="background:${sanitize(dotColor)};"></div></div><div class="flex flex-col text-left max-w-[140px]"><span class="font-bold text-gray-800 text-xs truncate">${nameLabel}</span><span class="text-[10px] text-gray-400 truncate">${sanitize(user.status)}</span></div></div><div class="flex items-center gap-1.5">${micBadge}${user.isOwner?'<span class="text-amber-500 text-xs bg-amber-50 p-1 rounded-md"><i class="fa-solid fa-crown"></i></span>':''}</div>`;
        container.appendChild(item);
    });
}

/* [PHASE 1] هذي الدالة صارت خاملة (ما فيه شي يستدعيها عشوائياً بعد الآن)،
   لكن منطق رسمها بالـ DOM سليم ومفيد — تُستخدم كمرجع جاهز عند الربط الحقيقي:
   خُد نفس منطق بناء الفقاعة هنا، واستبدل `mockPhrases[...]` ببيانات الرسالة
   الحقيقية القادمة من حدث socket.on('sendMessage', ...). */
function sendMockMessage(user) {
    if (typeof isUserIgnored === 'function' && isUserIgnored(user.id)) return;
    const msgList = document.getElementById('messagesList');
    const chatCont = document.getElementById('chatContainer');
    if (!msgList || !chatCont) return;
    const phrase = mockPhrases[Math.floor(Math.random() * mockPhrases.length)];
    const time = new Date().toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit' });
    const msgId = 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const safePhrase = sanitize(phrase);
    const bodyHtml = (typeof linkifyMentions === 'function') ? linkifyMentions(safePhrase, msgId) : safePhrase;
    const div = document.createElement('div');
    div.id = msgId;
    div.className = "flex items-start max-w-[85%] self-start gap-2";
    div.innerHTML = `<div class="message-user-trigger w-9 h-9 rounded-xl bg-purple-500 overflow-hidden shadow-md border-2 border-white shrink-0 cursor-pointer" data-user-id="${user.id}"><img src="${sanitize(user.avatar)}" class="w-full h-full object-cover"></div><div class="bg-white rounded-2xl shadow-sm border border-purple-100 p-3 w-full"><div class="flex justify-between items-center mb-1 gap-4"><span class="font-bold text-purple-900 text-xs message-user-trigger cursor-pointer" data-user-id="${user.id}">${sanitize(user.name)}</span><span class="text-[9px] text-gray-400">${sanitize(time)}</span></div><p class="chat-msg-text leading-relaxed break-words message-text-trigger cursor-pointer" data-msg-id="${msgId}" style="color:${sanitize(user.color)};">${bodyHtml}</p></div>`;

    const wasNearBottom = (chatCont.scrollHeight - chatCont.scrollTop - chatCont.clientHeight) < 40;
    msgList.appendChild(div);
    applyUserInterfaceSettings();
    if (wasNearBottom) {
        chatCont.scrollTop = chatCont.scrollHeight;
    } else if (typeof unseenMessageCount !== 'undefined') {
        unseenMessageCount++;
    }
    if (typeof checkScrollToBottomVisibility === 'function') checkScrollToBottomVisibility();
}

/* [PHASE 1 — STUB] كانت تضيف مستخدم وهمي عشوائي كل 15 ثانية.
   الدخول الحقيقي للمستخدمين يصل الآن عبر حدث Socket.io الحقيقي — لا حاجة
   لهذي الدالة، أُبقيت فارغة بنفس التوقيع لعدم كسر أي استدعاء قديم لها. */
function simulateUserJoin() {
    // TODO(ربط حقيقي): يُستبدل بمستمع socket.on('userJoined', ...) بدل الاستدعاء اليدوي.
}

/* [PHASE 1 — STUB] كانت تطرد مستخدم وهمي عشوائي كل 25 ثانية.
   الخروج الحقيقي يصل عبر Socket.io الحقيقي. أُبقيت فارغة بنفس التوقيع. */
function simulateUserLeave() {
    // TODO(ربط حقيقي): يُستبدل بمستمع socket.on('userLeft', ...) بدل الاستدعاء اليدوي.
}

/* [PHASE 1] كانت تشغّل 3 مؤقتات دائمة (رسائل عشوائية كل 6 ثواني + دخول/خروج
   وهمي). أُبقيت فقط على الرسم الأولي — الربط الحقيقي لاحقاً سيستبدل هذي
   الدالة بالكامل بمستمعات Socket.io حقيقية (onlineUsers, sendMessage...). */
function startSimulation() {
    renderOnlineUsers();
    // TODO(ربط حقيقي): socket.on('onlineUsers', users => { mockUsersList = users; renderOnlineUsers(); })
    // TODO(ربط حقيقي): socket.on('sendMessage', msg => { /* استخدم منطق sendMockMessage كمرجع للعرض */ })
}
