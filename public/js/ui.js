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

function renderMembers(users) {
  const list = document.getElementById('membersList');
  list.innerHTML = '';

  // ترتيب حسب الرتبة (الأعلى أولاً)
  const sorted = [...users].sort((a, b) => {
    const ra = typeof a === 'object' ? (a.rank||100) : 100;
    const rb = typeof b === 'object' ? (b.rank||100) : 100;
    return rb - ra;
  });

  sorted.forEach(u => {
    const name    = typeof u === 'string' ? u : u.username;
    const rank    = typeof u === 'object' ? (u.rank||100)   : 100;
    const status  = typeof u === 'object' ? (u.status||'available') : 'available';
    const isMuted = typeof u === 'object' ? (u.isMuted||false) : false;
    const color   = getRankColor(rank);
    const isMe    = name === username;

    const item = document.createElement('div');
    item.className = 'member-item';
    item.dataset.username = name;
    item.dataset.rank = rank;

    // أفاتار
    const av = document.createElement('div');
    av.className = 'member-avatar';
    av.style.borderColor = color;
    av.style.opacity = isMuted ? '0.5' : '1';
    av.textContent = getInitial(name);

    const statusDot = document.createElement('span');
    statusDot.className = `member-status-dot status-${status}`;
    const micDot = document.createElement('span');
    micDot.className = 'mic-active';
    av.appendChild(statusDot);
    av.appendChild(micDot);

    // معلومات
    const info = document.createElement('div');
    info.className = 'member-info';

    const nm = document.createElement('div');
    nm.className = 'member-name';
    nm.style.color = color;
    nm.textContent = name + (isMe ? ' (أنا)' : '') + (isMuted ? ' 🔇' : '');

    const badge = document.createElement('span');
    badge.className = 'member-badge';
    badge.style.cssText = `background:${color}22;color:${color}`;
    badge.textContent = getRankBadge(rank);

    info.appendChild(nm);
    info.appendChild(badge);
    item.appendChild(av);
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
  const dot = item.querySelector('.member-status-dot');
  if (!dot) return;
  dot.className = `member-status-dot status-${status}`;
}

/* ══ MEMBERS PANEL — فتح/إغلاق (نظام الطبقتين) ══ */
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

/* ══ SWIPE — تتبع الإصبع لحظة بلحظة + snap للأقرب ══ */
(function initSwipe() {
  const OPEN_PX   = () => window.innerWidth * 0.70;  /* 70% عرض الشاشة */
  const MIN_DRAG  = 8;    /* بكسل قبل اعتباره سحباً */
  const SNAP_THR  = 0.35; /* إذا تجاوز 35% يُفتح، وإلا يُغلق */

  let startX = 0, startY = 0, curX = 0;
  let isDragging = false, isOpen = false, verticalLock = false;

  function getLayer() { return document.getElementById('chatLayer'); }

  document.addEventListener('touchstart', e => {
    startX = curX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isDragging   = false;
    verticalLock = false;
    const l = getLayer();
    isOpen = l?.classList.contains('open') || false;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    const x  = e.touches[0].clientX;
    const dx = x - startX;
    const dy = Math.abs(e.touches[0].clientY - startY);
    curX = x;

    /* تحديد اتجاه السحب أول مرة */
    if (!isDragging && !verticalLock) {
      if (dy > Math.abs(dx) + 5) { verticalLock = true; return; }
      if (Math.abs(dx) > MIN_DRAG) isDragging = true;
    }
    if (!isDragging || verticalLock) return;

    const l = getLayer();
    if (!l) return;
    l.classList.add('dragging');

    /* حساب الإزاحة الحالية */
    const base    = isOpen ? OPEN_PX() : 0;
    const newTx   = Math.max(0, Math.min(OPEN_PX(), base + dx));
    l.style.transform = `translateX(${newTx}px)`;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!isDragging) { isDragging = false; return; }
    isDragging = false;

    const l = getLayer();
    if (!l) return;

    const base  = isOpen ? OPEN_PX() : 0;
    const dx    = curX - startX;
    const newTx = Math.max(0, Math.min(OPEN_PX(), base + dx));
    const ratio = newTx / OPEN_PX();

    /* snap: إذا تجاوز 35% → افتح، وإلا أغلق */
    l.style.transform = '';
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
  const color  = getRankColor(user?.rank || 100);
  const initials = getInitial(user?.username || '?');
  const style  = `--rank-color:${color}`;
  if (user?.avatar_url) {
    return `<div class="msg-avatar-sm" style="${style}">
              <img src="${user.avatar_url}" alt="${initials}" onerror="this.parentElement.innerHTML='${initials}'">
            </div>`;
  }
  return `<div class="msg-avatar-sm" style="${style}">${initials}</div>`;
}

/* ── المايك ─────────────────────────────── */
let micOn = false;
function toggleMic() {
  micOn = !micOn;
  const btn    = document.getElementById('micTbBtn');
  const icon   = document.getElementById('micIcon');
  const status = document.getElementById('micStatus');
  if (micOn) {
    btn.classList.add('active'); btn.textContent = '🎙️';
    icon.textContent = '🎙️'; status.textContent = 'يتحدث';
    socket.emit('micOn', { room_id: roomId, username });
  } else {
    btn.classList.remove('active'); btn.textContent = '🎤';
    icon.textContent = '🔊'; status.textContent = 'Mic Free';
    socket.emit('micOff', { room_id: roomId, username });
  }
}

/* ── رفع اليد ───────────────────────────── */
function sendRaiseHand() {
  socket.emit('raiseHand', { room_id: roomId, username });
  addSystem('🖐️ أنت تطلب الكلام');
  showToast('تم إرسال طلب الكلام');
}
socket.on('raiseHand', (d) => {
  if (d.username !== username) addSystem(`🖐️ ${d.username} يطلب الكلام`);
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

function closeAll() {
  document.getElementById('sideMenu').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
  document.getElementById('statusPopup').classList.remove('open');
  closeEmoji();
  document.getElementById('imagePicker').classList.remove('open');
  const adminSheet = document.getElementById('adminSheet');
  if (adminSheet) adminSheet.classList.remove('open');
}

/* ── قائمة الحالات ──────────────────────── */
function openStatusMenu() {
  document.getElementById('sideMenu').classList.remove('open');
  document.getElementById('statusPopup').classList.toggle('open');
}

function setStatus(key, icon, label) {
  socket.emit('setStatus', { room_id: roomId, username, status: key });
  document.getElementById('statusPopup').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
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
