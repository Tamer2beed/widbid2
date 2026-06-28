/* ════════════════════════════════════════
   WidBid — ui.js
   التحكم بالواجهة: قوائم، إيموجي، صور، توست
════════════════════════════════════════ */

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

/* ── القائمة الجانبية ── */
function openSideMenu() {
  document.getElementById('sideMenu')?.classList.add('open');
  document.getElementById('overlay')?.classList.add('show');
  /* عبّئ بيانات الملف الشخصي */
  const uname = localStorage.getItem('username') || '—';
  const rank  = parseInt(localStorage.getItem('rank')) || 100;
  const el = document.getElementById('smUsername');
  if (el) el.textContent = uname;
  const rl = document.getElementById('smRankLabel');
  if (rl) rl.textContent = rankLabel(rank);
  const av = document.getElementById('smAvatar');
  if (av) av.src = `/avatars/${localStorage.getItem('avatar') || 'av1.svg'}`;
  /* أظهر قسم إدارة الغرفة للمشرفين فقط */
  const adminSection = document.getElementById('adminMenuSection');
  if (adminSection) adminSection.style.display = rank >= 500 ? 'block' : 'none';
}
function closeSideMenu() {
  document.getElementById('sideMenu')?.classList.remove('open');
  document.getElementById('overlay')?.classList.remove('show');
}
function closeAll() {
  closeSideMenu();
  closeStatusMenu();
  document.getElementById('emojiPanel')?.classList.remove('show');
  document.getElementById('imagePicker')?.classList.remove('show');
}

function rankLabel(rank) {
  if (rank >= 1200) return 'Super Owner';
  if (rank >= 1100) return 'Owner';
  if (rank >= 1000) return 'Super Root';
  if (rank >= 900)  return 'Root';
  if (rank >= 800)  return 'Super Master';
  if (rank >= 700)  return 'Master';
  if (rank >= 600)  return 'Super Admin';
  if (rank >= 500)  return 'Admin';
  if (rank >= 200)  return 'Member';
  return 'زائر';
}

/* ── قائمة الحالة ── */
function openStatusMenu() {
  document.getElementById('statusOverlay')?.classList.add('show');
  document.getElementById('statusPopup')?.classList.add('show');
}
function closeStatusMenu() {
  document.getElementById('statusOverlay')?.classList.remove('show');
  document.getElementById('statusPopup')?.classList.remove('show');
}
function setStatus(status, icon, label) {
  socket.emit('setStatus', {
    room_id : localStorage.getItem('room_id'),
    username: localStorage.getItem('username'),
    status,
  });
  closeStatusMenu();
  closeSideMenu();
  showToast(`${icon} الحالة: ${label}`);
}

/* ── الأعضاء ── */
let membersVisible = false;
function toggleMembers() {
  membersVisible = !membersVisible;
  document.getElementById('chatLayer')?.classList.toggle('shifted', membersVisible);
}

function setHandBadge(targetUsername, show) {
  const items = document.querySelectorAll('.member-item');
  items.forEach(item => {
    if (item.dataset.username === targetUsername) {
      let badge = item.querySelector('.hand-badge');
      if (show && !badge) {
        badge = document.createElement('span');
        badge.className = 'hand-badge';
        badge.textContent = '🖐️';
        item.appendChild(badge);
      } else if (!show && badge) {
        badge.remove();
      }
    }
  });
}

/* ── مفضلة الغرفة ── */
function toggleFavorite() {
  const room_id = localStorage.getItem('room_id');
  const favs = JSON.parse(localStorage.getItem('favRooms') || '[]');
  const idx = favs.indexOf(room_id);
  const favText = document.getElementById('favText');
  if (idx >= 0) {
    favs.splice(idx, 1);
    if (favText) favText.textContent = 'إضافة للمفضلة';
    showToast('☆ أُزيلت من المفضلة');
  } else {
    favs.push(room_id);
    if (favText) favText.textContent = 'إزالة من المفضلة';
    showToast('⭐ أُضيفت للمفضلة');
  }
  localStorage.setItem('favRooms', JSON.stringify(favs));
  closeSideMenu();
}

/* ── مسح الدردشة محلياً ── */
function clearLocalChat() {
  if (!confirm('مسح الدردشة من شاشتك فقط؟')) return;
  document.getElementById('messages').innerHTML = '';
  showToast('🧹 تم مسح الدردشة محلياً');
}

/* ── تبليغ ── */
function reportRoom() {
  if (!confirm('تبليغ عن هذه الغرفة؟')) return;
  socket.emit('reportRoom', {
    room_id: localStorage.getItem('room_id'),
    by: localStorage.getItem('username'),
  });
  closeSideMenu();
  showToast('🚨 تم إرسال التبليغ');
}

/* ── خروج من الغرفة ── */
function leaveRoom() {
  window.location.href = '/rooms.html';
}

/* ── إيموجي ── */
const EMOJI_TABS = [
  ['❤️','💕','💖','💗','💓','💞','💘','💝','😍','🥰'],
  ['😊','😄','😃','😁','😆','😅','😂','🤣','😉','😇'],
  ['🎉','🎊','🎈','🎁','🏆','🥇','👏','🙌','✨','🌟'],
  ['🌿','🌸','🌺','🌻','🌹','🍀','🌴','🌵','🌷','🌼'],
];
let currentEmojiTab = 0;
function toggleEmoji() {
  const panel = document.getElementById('emojiPanel');
  const isShowing = panel?.classList.toggle('show');
  if (isShowing) renderEmojiGrid();
  document.getElementById('imagePicker')?.classList.remove('show');
}
function switchEmojiTab(i) {
  currentEmojiTab = i;
  document.querySelectorAll('.emoji-tab').forEach((t, idx) => t.classList.toggle('active', idx === i));
  renderEmojiGrid();
}
function renderEmojiGrid() {
  const grid = document.getElementById('emojiGrid');
  if (!grid) return;
  grid.innerHTML = EMOJI_TABS[currentEmojiTab]
    .map(e => `<span class="emoji-item" onclick="insertEmoji('${e}')">${e}</span>`).join('');
}
function insertEmoji(e) {
  const input = document.getElementById('msgInput');
  if (input) { input.value += e; input.focus(); }
}
function sendQuick(emoji) {
  const input = document.getElementById('msgInput');
  if (input) { input.value = emoji; sendMessage(); }
}

/* ── صور ── */
function toggleImagePicker() {
  const panel = document.getElementById('imagePicker');
  panel?.classList.toggle('show');
  document.getElementById('emojiPanel')?.classList.remove('show');
}
function pickImage(source) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  if (source === 'camera') inp.capture = 'environment';
  inp.onchange = () => {
    const file = inp.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      socket.emit('sendImage', {
        room_id : localStorage.getItem('room_id'),
        username: localStorage.getItem('username'),
        rank    : parseInt(localStorage.getItem('rank')) || 100,
        image   : reader.result,
        caption : '',
      });
    };
    reader.readAsDataURL(file);
  };
  inp.click();
  document.getElementById('imagePicker')?.classList.remove('show');
}

/* ── Toast ── */
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

/* ── Socket events متعلقة بالواجهة ── */
document.addEventListener('socketReady', () => {
  socket.on('raiseHand', (d) => {
    setHandBadge(d.username, true);
    showToast(`✋ ${d.username} رفع يده`);
  });

  socket.on('speakerState', (data) => {
    /* [FIX] اليد 🖐️ تظهر فقط لمن هو فعلاً في طابور الانتظار (queue)،
       وتُحدَّث لكل المستخدمين في الغرفة (لا لنفسي فقط)، بناءً على الحالة
       الحقيقية القادمة من السيرفر — لا إظهار تخميني فوري قبل معرفة النتيجة */
    const queueNames = new Set((data.queue || []).map(u => u.username));
    document.querySelectorAll('.member-item').forEach(item => {
      setHandBadge(item.dataset.username, queueNames.has(item.dataset.username));
    });
  });

  socket.on('userMuted', (d) => showToast(`🔇 تم كتم ${d.username}`));
  socket.on('userUnmuted', (d) => showToast(`🔊 تم فك كتم ${d.username}`));
  socket.on('userKicked', (d) => showToast(`🚪 تم طرد ${d.username}`));
  socket.on('announcement', (d) => showToast(`📢 ${d.text}`));
  socket.on('youAreWarned', (d) => alert(`⚠️ تحذير من ${d.by}:\n${d.reason}`));
});
