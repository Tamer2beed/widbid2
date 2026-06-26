/* ════════════════════════════════════════
   WidBid — ui.js
   قائمة الأعضاء + الأدوات البصرية + القوائم
════════════════════════════════════════ */

/* ── قائمة الأعضاء ─────────────────────── */
socket.on('onlineUsers', (users) => {
  renderMembers(users);
  const el = document.getElementById('statOnline');
  if (el) el.textContent = users.length;
});

socket.on('micOn',  (d) => updateMemberMic(d.username, true));
socket.on('micOff', (d) => updateMemberMic(d.username, false));
socket.on('statusChanged', (d) => updateMemberStatusDot(d.username, d.status));

/* ══ خريطة رموز الحالات ══ */
const STATUS_EMOJI = {
  available : '🟢',
  away      : '⏰',
  busy      : '🔴',
  phone     : '📞',
  food      : '🍴',
  pray      : '🕌',
  sleep     : '💤',
  car       : '🚗',
};

/* ══ لون إطار الأفاتار حسب الرتبة ══ */
const RANK_BORDER_COLOR = {
  100  : '#9E9E9E',
  200  : '#4CAF50',
  300  : '#2196F3',
  400  : '#9C27B0',
  500  : '#FF5722',
  600  : '#F44336',
  700  : '#FF9800',
  800  : '#FFC107',
  900  : '#00BCD4',
  1000 : '#00BCD4',
  1100 : '#E91E63',
  1200 : '#E91E63',
};
function getRankBorder(rank) {
  const steps = [1200,1100,1000,900,800,700,600,500,400,300,200,100];
  for (const s of steps) { if (rank >= s) return RANK_BORDER_COLOR[s]; }
  return '#9E9E9E';
}

/* ══ src الأفاتار ══ */
function getAvatarSrc(avatar) {
  if (!avatar) return '/avatars/av1.svg';
  if (avatar.startsWith('data:image')) return avatar;
  if (avatar.endsWith('.svg'))         return '/avatars/' + avatar;
  return '/avatars/av1.svg';
}

function renderMembers(users) {
  const list = document.getElementById('membersList');
  list.innerHTML = '';

  const sorted = [...users].sort((a, b) => {
    const ra = typeof a === 'object' ? (a.rank||100) : 100;
    const rb = typeof b === 'object' ? (b.rank||100) : 100;
    return rb - ra;
  });

  sorted.forEach(u => {
    const name    = typeof u === 'string' ? u : u.username;
    const rank    = typeof u === 'object' ? (u.rank||100)       : 100;
    const status  = typeof u === 'object' ? (u.status||'available') : 'available';
    const avatar  = typeof u === 'object' ? (u.avatar||'av1.svg')   : 'av1.svg';
    const isMuted = typeof u === 'object' ? (u.isMuted||false)      : false;
    const color   = getRankColor(rank);
    const isMe    = name === username;

    const item = document.createElement('div');
    item.className        = 'member-item';
    item.dataset.username = name;
    item.dataset.rank     = rank;

    /* ── صورة الأفاتار مع إطار الرتبة ── */
    const avatarWrap = document.createElement('div');
    avatarWrap.className        = 'member-avatar-wrap';
    avatarWrap.style.borderColor = getRankBorder(rank);
    avatarWrap.style.opacity     = isMuted ? '0.55' : '1';

    const avatarImg = document.createElement('img');
    avatarImg.className = 'member-avatar-img';
    avatarImg.src       = getAvatarSrc(avatar);
    avatarImg.alt       = name;
    avatarImg.onerror   = () => { avatarImg.src = '/avatars/av1.svg'; };
    avatarWrap.appendChild(avatarImg);

    /* badge الحالة — زاوية سفلى يسار */
    const sBadge = document.createElement('span');
    sBadge.className         = 'avatar-status-badge';
    sBadge.textContent       = STATUS_EMOJI[status] || '🟢';
    sBadge.dataset.statusBadge = name;
    avatarWrap.appendChild(sBadge);

    /* mic dot */
    const micDot = document.createElement('span');
    micDot.className = 'mic-active';
    avatarWrap.appendChild(micDot);

    item.appendChild(avatarWrap);

    /* ── معلومات ── */
    const info = document.createElement('div');
    info.className = 'member-info';

    const nm = document.createElement('div');
    nm.className   = 'member-name';
    nm.style.color = color;
    nm.textContent = name + (isMe ? ' (أنا)' : '') + (isMuted ? ' 🔇' : '');

    const badge = document.createElement('span');
    badge.className    = 'member-badge';
    badge.style.cssText = `background:${color}22;color:${color}`;
    badge.textContent  = getRankBadge(rank);

    info.appendChild(nm);
    info.appendChild(badge);
    item.appendChild(info);

    item.addEventListener('click', () => {
      if (typeof showMemberMenu === 'function') showMemberMenu(name, rank);
    });

    list.appendChild(item);
  });
}

function updateMemberMic(name, on) {
  const item = document.querySelector(`.member-item[data-username="${name}"]`);
  if (!item) return;
  item.querySelector('.mic-active')?.classList.toggle('on', on);
}

function updateMemberStatusDot(name, status) {
  const item = document.querySelector(`.member-item[data-username="${name}"]`);
  if (!item) return;
  /* badge زاوية الصورة */
  const badge = item.querySelector('[data-status-badge]');
  if (badge) badge.textContent = STATUS_EMOJI[status] || '🟢';
}

/* ══ MEMBERS PANEL — فتح/إغلاق (نظام الطبقتين RTL) ══ */
function toggleMembers(forceState) {
  const layer  = document.getElementById('chatLayer');
  const isOpen = layer.classList.contains('open');
  const open   = forceState !== undefined ? forceState : !isOpen;
  layer.classList.remove('dragging');
  layer.style.transform = '';
  layer.classList.toggle('open', open);
  if (open) {
    layer.addEventListener('click', _closeOnClick);
  } else {
    layer.removeEventListener('click', _closeOnClick);
  }
  const count = document.getElementById('membersCount');
  if (count) count.textContent =
    `(${document.querySelectorAll('.member-item').length})`;
}
function _closeOnClick() { toggleMembers(false); }

/* ══ SWIPE RTL — السحب يساراً يكشف الأعضاء في اليمين ══ */
(function initSwipe() {
  const OPEN_PX  = () => window.innerWidth * 0.70;
  const MIN_DRAG = 8;
  const SNAP_THR = 0.35;

  let startX = 0, startY = 0, curX = 0;
  let isDragging = false, isOpen = false, verticalLock = false;

  function getLayer() { return document.getElementById('chatLayer'); }

  document.addEventListener('touchstart', e => {
    startX = curX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isDragging   = false;
    verticalLock = false;
    isOpen = getLayer()?.classList.contains('open') || false;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    const x  = e.touches[0].clientX;
    const dx = x - startX;   /* يسار = سالب */
    const dy = Math.abs(e.touches[0].clientY - startY);
    curX = x;

    if (!isDragging && !verticalLock) {
      if (dy > Math.abs(dx) + 5) { verticalLock = true; return; }
      if (Math.abs(dx) > MIN_DRAG) isDragging = true;
    }
    if (!isDragging || verticalLock) return;

    const l = getLayer();
    if (!l) return;
    l.classList.add('dragging');

    /* الإزاحة: مفتوح = -OPEN_PX، مغلق = 0 */
    const base  = isOpen ? -OPEN_PX() : 0;
    const newTx = Math.max(-OPEN_PX(), Math.min(0, base + dx));
    l.style.transform = `translateX(${newTx}px)`;
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;

    const l = getLayer();
    if (!l) return;

    const base  = isOpen ? -OPEN_PX() : 0;
    const dx    = curX - startX;
    const newTx = Math.max(-OPEN_PX(), Math.min(0, base + dx));
    const ratio = Math.abs(newTx) / OPEN_PX();

    l.style.transform = '';
    /* ratio > SNAP_THR → افتح (الدردشة انزلقت أكثر من 35%) */
    toggleMembers(ratio >= SNAP_THR);
  }, { passive: true });
})();

/* ══ RANK COLOR HELPER ══ */
function getRankColor(rank) {
  const map = {
    100:'#95A5A6', 200:'#3498DB', 300:'#9B59B6', 400:'#F1C40F',
    500:'#E67E22', 600:'#E74C3C', 700:'#1ABC9C', 800:'#2ECC71',
    900:'#D35400', 1000:'#C0392B', 1100:'#8E44AD', 1200:'#F0A500'
  };
  return map[rank] || '#95A5A6';
}

/* ══ AVATAR BUILDER للرسائل ══ */
function buildMsgAvatar(user) {
  const color  = getRankBorder ? getRankBorder(user?.rank || 100) : getRankColor(user?.rank || 100);
  const av     = user?.avatar || 'av1.svg';
  const src    = av.startsWith('data:image') ? av : '/avatars/' + av;
  return `<div class="msg-avatar-sm" style="border-color:${color}">
            <img src="${src}" alt="${user?.username||'?'}" onerror="this.src='/avatars/av1.svg'">
          </div>`;
}

/* ── المايك ─────────────────────────────── */
let micOn = false;
function toggleMic() {
  /* زر المايك الأسفل = طلب/إنهاء السبيكر عبر نظام الطابور */
  if (typeof SpeakerSystem !== 'undefined') {
    const spkState = SpeakerSystem.getState?.();
    if (spkState?.isSpeaking) {
      SpeakerSystem.doneSpeaking();
    } else if (spkState?.inQueue) {
      SpeakerSystem.leaveQueue();
    } else {
      SpeakerSystem.requestSpeaker();
    }
  }
}

/* ── رفع اليد / طلب السبيكر ─────────────── */
function sendRaiseHand() {
  /* اضغط المايك مباشرة بدلاً من رفع يد منفصلة */
  if (typeof SpeakerSystem !== 'undefined') {
    SpeakerSystem.requestSpeaker();
  } else {
    socket.emit('raiseHand', { room_id: roomId, username });
    showToast('🖐️ تم إرسال طلب الكلام');
  }
}

/* ── إضافة/إزالة رمز 🖐️ في قائمة الأعضاء ── */
function setHandBadge(targetUsername, show) {
  const items = document.querySelectorAll('.member-item');
  items.forEach(el => {
    if (el.dataset.username !== targetUsername) return;
    const existing = el.querySelector('.hand-badge');
    if (show && !existing) {
      const badge = document.createElement('span');
      badge.className   = 'hand-badge';
      badge.textContent = '🖐️';
      badge.style.cssText = 'font-size:14px;margin-right:4px;animation:handPulse 1s infinite';
      el.querySelector('.member-name')?.prepend(badge);
    } else if (!show && existing) {
      existing.remove();
    }
  });
}

/* pulse animation للـ hand badge */
if (!document.getElementById('handBadgeStyle')) {
  const s = document.createElement('style');
  s.id = 'handBadgeStyle';
  s.textContent = `@keyframes handPulse{0%,100%{opacity:1}50%{opacity:.3}}`;
  document.head.appendChild(s);
}

socket.on('raiseHand', (d) => {
  setHandBadge(d.username, true);
  /* إشعار خفيف فقط للمشرفين */
  if ((userRank || 0) >= 500 && d.username !== username) {
    showToast(`🖐️ ${d.username} يطلب الكلام`);
  }
});

/* عند حصول شخص على السبيكر — أزل رمز يده */
socket.on('speakerState', (data) => {
  if (data.current) setHandBadge(data.current.username, false);
});

/* ── الردود السريعة ─────────────────────── */
function sendQuick(emoji) {
  socket.emit('sendMessage', {
    room_id: roomId, user_id: userId,
    username, message: emoji, rank: userRank
  });
}

/* ── القائمة الجانبية ───────────────────── */
function openSideMenu() {
  document.getElementById('sideMenu').classList.add('open');
  document.getElementById('overlay').classList.add('show');
  const clearBtn = document.getElementById('clearTextBtn');
  if (clearBtn) clearBtn.style.display = userRank >= 500 ? 'flex' : 'none';
}

function closeSideMenu() {
  document.getElementById('sideMenu').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

function openSettings() {
  closeSideMenu();
  /* حدّث بيانات الشاشة قبل الفتح */
  const uname = localStorage.getItem('username') || '—';
  document.getElementById('settingsUsername').textContent  = uname;
  document.getElementById('settingsAvatarImg').src =
    getAvatarSrc(window._myAvatar || 'av1.svg');

  /* زر تغيير الصورة — يفتح picker مباشرة */
  document.getElementById('settingsChangeAvatar').onclick = () => {
    closeSettings();
    openAvatarPicker();
  };

  document.getElementById('settingsPanel').classList.add('show');
  document.getElementById('settingsOverlay').classList.add('show');
}

function closeSettings() {
  document.getElementById('settingsPanel')?.classList.remove('show');
  document.getElementById('settingsOverlay')?.classList.remove('show');
}

function closeAll() {
  closeSideMenu();
  closeStatusMenu();
  closeEmoji();
  document.getElementById('imagePicker').classList.remove('open');
  const adminSheet = document.getElementById('adminSheet');
  if (adminSheet) adminSheet.classList.remove('open');
}

/* ── قائمة الحالات ──────────────────────── */
function openStatusMenu() {
  closeSideMenu();
  const dropdown = document.getElementById('statusPopup');
  const overlay  = document.getElementById('statusOverlay');
  dropdown.classList.add('show');
  overlay.classList.add('show');
}

function closeStatusMenu() {
  document.getElementById('statusPopup')?.classList.remove('show');
  document.getElementById('statusOverlay')?.classList.remove('show');
}

function setStatus(key, icon, label) {
  socket.emit('setStatus', { room_id: roomId, username, status: key });
  closeStatusMenu();
  /* حدّث رمز المستخدم الحالي فوراً بدون انتظار السيرفر */
  updateMemberStatusDot(username, key);
  showToast(`${icon} الحالة: ${label}`);
}

/* ── الإيموجي ───────────────────────────── */
const EMOJIS = [
  ['❤️','💔','💕','💞','💓','💗','💘','💝','💖','🤍','💛','💚','💙','💜','🖤','🤎','❣️','💟','🌹','🌷','🌸','🌺','💐','🎁','🎂','🎊','🎉','🥂','✨','⭐','🌟','💫'],
  ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','😉','😌','😍','🥰','😘','😋','😛','😝','😜','😎','🤩','🥳','😏','😒','😔','😢','😭','😤','😠','🤔','🤗'],
  ['🎉','🎊','🎈','🎁','🎀','🏆','🥇','🎯','🎲','🎮','🕹️','👾','🎱','🏓','🎾','⚽','🏀','🎸','🎵','🎶','🎤','🎧','📱','💻','🖥️','🚀','✈️','🌍','🌈','☀️','🌙','⭐'],
  ['🌿','🌱','🌲','🌳','🌴','🌵','🎋','🍀','☘️','🍃','🍂','🍁','🌺','🌸','🌼','🌻','🌞','⭐','💫','✨','🌙','☀️','🌊','🏔️','🗻','🌋','🏖️','🏜️','🌅','🌄','🌃','🌆'],
];

let emojiTabIdx = 0;

function switchEmojiTab(idx) {
  emojiTabIdx = idx;
  document.querySelectorAll('.emoji-tab').forEach((t, i) =>
    t.classList.toggle('active', i === idx)
  );
  renderEmojis();
}

function renderEmojis() {
  const grid = document.getElementById('emojiGrid');
  grid.innerHTML = '';
  EMOJIS[emojiTabIdx].forEach(e => {
    const span = document.createElement('span');
    span.className = 'emoji-item';
    span.textContent = e;
    span.onclick = () => {
      document.getElementById('msgInput').value += e;
      document.getElementById('msgInput').focus();
    };
    grid.appendChild(span);
  });
}
renderEmojis();

function toggleEmoji() {
  const p = document.getElementById('emojiPanel');
  p.classList.toggle('open');
  if (!p.classList.contains('open'))
    document.getElementById('msgInput').focus();
}
function closeEmoji() {
  document.getElementById('emojiPanel').classList.remove('open');
}

/* ── منتقي الصورة ───────────────────────── */
function toggleImagePicker() {
  const p = document.getElementById('imagePicker');
  p.classList.toggle('open');
  document.getElementById('overlay').classList.toggle('show', p.classList.contains('open'));
}
function pickImage(src) {
  showToast(`📷 إرسال صورة (${src === 'gallery' ? 'المعرض' : 'الكاميرا'}) — قريباً`);
  toggleImagePicker();
}
function toggleVideo() {
  showToast('🎥 الكاميرا — قريباً في مرحلة WebRTC');
  toggleImagePicker();
}

/* ── المفضلة ────────────────────────────── */
let isFav = false;
function toggleFavorite() {
  isFav = !isFav;
  document.getElementById('favText').textContent =
    isFav ? 'حذف من المفضلة' : 'إضافة للمفضلة';
  showToast(isFav ? '⭐ أُضيفت للمفضلة' : 'حُذفت من المفضلة');
}

/* ── تبليغ ──────────────────────────────── */
function reportRoom() {
  closeAll();
  if (confirm('هل تريد التبليغ عن هذه الغرفة؟')) {
    socket.emit('reportRoom', { room_id: roomId, by: username });
    showToast('✅ تم إرسال البلاغ');
  }
}

/* ── الخروج ─────────────────────────────── */
function leaveRoom() {
  socket.emit('leaveRoom', { room_id: roomId, username });
  window.location.href = '/rooms.html';
}

/* ── الرسالة الخاصة ─────────────────────── */
function openPrivateChat(name) {
  showToast(`💬 رسالة خاصة لـ ${name} — قريباً`);
}

/* ════════════════════════════════════════
   قائمة سياق الرسالة (نقرة واحدة)
════════════════════════════════════════ */

function initMessageContextMenu() {
  const style = document.createElement('style');
  style.textContent = `
  .ctx-menu {
    position: fixed; z-index: 250;
    background: #1a1a2e; border-radius: 12px;
    overflow: hidden; min-width: 180px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    animation: ctxIn .15s ease;
  }
  @keyframes ctxIn { from{opacity:0;transform:scale(.9)} to{opacity:1;transform:scale(1)} }
  .ctx-item {
    padding: 13px 18px; font-size: 14px; font-weight: 600;
    color: #fff; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,.08);
    display: flex; align-items: center; gap: 10px;
  }
  .ctx-item:last-child { border-bottom: none; }
  .ctx-item:active { background: rgba(255,255,255,.1); }
  .ctx-item.danger { color: #E74C3C; }
  .ctx-overlay { position: fixed; inset: 0; z-index: 249; }
  `;
  document.head.appendChild(style);

  /* نقرة واحدة على الرسالة */
  document.getElementById('messages')?.addEventListener('click', e => {
    const bubble = e.target.closest('.msg-bubble');
    if (!bubble) return;
    e.stopPropagation();
    const row    = bubble.closest('.msg-row');
    const text   = bubble.querySelector('.msg-text')?.textContent || '';
    const msgId  = row?.dataset.msgId || null;
    showMessageMenu(e.clientX, e.clientY, text, msgId);
  });
}

function showMessageMenu(x, y, text, msgId) {
  closeCtxMenu();
  const rank = parseInt(localStorage.getItem('rank') || '0');

  const items = [
    {
      icon: '📋', label: 'نسخ',
      fn: () => { navigator.clipboard?.writeText(text); showToast('✅ تم النسخ'); }
    },
    {
      icon: '↩️', label: 'ردّ',
      fn: () => {
        const inp = document.getElementById('msgInput');
        if (inp) { inp.value = `«${text.slice(0,30)}» `; inp.focus(); }
      }
    },
    {
      icon: '🚨', label: 'تبليغ عن الرسالة',
      fn: () => { socket.emit('reportMessage', { room_id: roomId, msg_id: msgId, by: username }); showToast('✅ تم إرسال البلاغ'); }
    },
  ];

  /* مسح الشات للجميع — للمشرف فقط */
  if (rank >= 500) {
    items.push({
      icon: '🗑️', label: 'مسح الشات للجميع', danger: true,
      fn: () => {
        if (confirm('مسح جميع رسائل الشات للجميع؟')) {
          socket.emit('clearRoomChat', { room_id: roomId, by: username });
        }
      }
    });
  }

  _showCtxMenu(x, y, items);
}

/* ════════════════════════════════════════
   قائمة سياق العضو (ضغط على اسمه)
════════════════════════════════════════ */

function showMemberMenu(targetUsername, targetRank) {
  /* موضع وسط الشاشة */
  const x = window.innerWidth  / 2;
  const y = window.innerHeight / 2;

  const rank = parseInt(localStorage.getItem('rank') || '0');
  const self = targetUsername === username;

  const items = [];

  if (!self) {
    items.push({
      icon: '💬', label: 'محادثة خاصة',
      fn: () => showToast('💬 الخاص — قريباً')
    });
    items.push({
      icon: '@', label: `@${targetUsername}`,
      fn: () => {
        const inp = document.getElementById('msgInput');
        if (inp) { inp.value = `@${targetUsername} `; inp.focus(); }
      }
    });
    items.push({
      icon: '🚫', label: 'تجاهل',
      fn: () => { socket.emit('ignoreUser', { target: targetUsername }); showToast(`🚫 تم تجاهل ${targetUsername}`); }
    });
    items.push({
      icon: '🚨', label: 'تبليغ',
      fn: () => { socket.emit('reportUser', { target: targetUsername, room_id: roomId }); showToast('✅ تم إرسال البلاغ'); }
    });
  }

  /* أدوات المشرف */
  if (!self && rank >= 500 && rank > targetRank) {
    items.push({ icon: '🔇', label: 'كتم', danger: false,
      fn: () => { socket.emit('muteUser',    { room_id: roomId, target: targetUsername, by: username }); showToast(`🔇 تم كتم ${targetUsername}`); }
    });
    items.push({ icon: '👢', label: 'طرد',  danger: true,
      fn: () => { if(confirm(`طرد ${targetUsername}؟`)) socket.emit('kickUser', { room_id: roomId, target: targetUsername, by: username }); }
    });
  }

  if (items.length) _showCtxMenu(x, y, items);
}

/* ══ بناء وعرض القائمة ══ */
function _showCtxMenu(x, y, items) {
  closeCtxMenu();

  const overlay = document.createElement('div');
  overlay.className = 'ctx-overlay';
  overlay.onclick = closeCtxMenu;

  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.id = 'ctxMenu';

  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'ctx-item' + (item.danger ? ' danger' : '');
    el.innerHTML = `<span>${item.icon}</span><span>${item.label}</span>`;
    el.onclick = () => { closeCtxMenu(); item.fn(); };
    menu.appendChild(el);
  });

  /* ضبط الموضع داخل الشاشة */
  document.body.appendChild(overlay);
  document.body.appendChild(menu);

  const mw = 180, mh = items.length * 46;
  let left = Math.min(x, window.innerWidth  - mw - 8);
  let top  = Math.min(y, window.innerHeight - mh - 8);
  left = Math.max(8, left);
  top  = Math.max(8, top);

  menu.style.left = left + 'px';
  menu.style.top  = top  + 'px';
}

function closeCtxMenu() {
  document.getElementById('ctxMenu')?.remove();
  document.querySelector('.ctx-overlay')?.remove();
}

/* ══ INIT ══ */
document.addEventListener('DOMContentLoaded', initMessageContextMenu);
