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

/* ── تبديل قائمة الأعضاء ───────────────── */
function toggleMembers() {
  document.getElementById('membersPanel').classList.toggle('open');
}

/* ── منطقة المقاعد الصوتية (WEVO Style) ── */
const MAX_SEATS = 8;
let seatsData   = Array(MAX_SEATS).fill(null); // null = فارغ

function renderSeats(users) {
  const row = document.getElementById('seatsRow');
  if (!row) return;

  // ملء المقاعد بالمستخدمين المتواجدين (أعلى رتبة أولاً)
  const sorted = [...users]
    .filter(u => typeof u === 'object')
    .sort((a, b) => (b.rank||100) - (a.rank||100))
    .slice(0, MAX_SEATS);

  // أكمل بمقاعد فارغة
  while (sorted.length < MAX_SEATS) sorted.push(null);

  row.innerHTML = sorted.map((u, i) => {
    if (!u) return `
      <div class="seat" onclick="claimSeat(${i})">
        <div class="seat-avatar">
          <span class="seat-num">${i + 1}</span>
        </div>
        <div class="seat-name empty">فارغ</div>
      </div>`;
    const color = getRankColor(u.rank || 100);
    const init  = getInitial(u.username);
    const micCls = u.micOn ? 'mic-on' : '';
    return `
      <div class="seat" onclick="clickSeat('${u.username}',${u.rank||100})">
        <div class="seat-avatar taken ${micCls}" style="border-color:${color}">
          <span style="font-size:18px;font-weight:700;color:${color}">${init}</span>
          <span class="seat-num">${i + 1}</span>
        </div>
        <div class="seat-name">${u.username}</div>
      </div>`;
  }).join('');
}

function claimSeat(idx) {
  showToast('🎤 اضغط على المايك للتحدث');
}
function clickSeat(name, rank) {
  if (typeof showMemberMenu === 'function') showMemberMenu(name, rank);
}

// ربط المقاعد بقائمة الأعضاء
const _origRenderMembers = renderMembers;
window.renderMembers = function(users) {
  _origRenderMembers(users);
  renderSeats(users);
};

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
