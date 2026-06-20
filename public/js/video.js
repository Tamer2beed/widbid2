/* ════════════════════════════════════════
   WidBid — video.js
   واجهة البث المباشر (UI فقط — Phase 21 = WebRTC)
════════════════════════════════════════ */

/* ══ الحالة ══ */
const videoState = {
  isBroadcasting : false,   /* أنا أبث الآن؟ */
  isWatching     : false,   /* أنا أشاهد بثاً؟ */
  broadcasterName: '',      /* اسم المُذيع الحالي */
  currentSize    : 'sm',    /* sm | md | lg */
  pendingViewer  : null,    /* طلب مشاهدة معلّق */
  dragOffX       : 0,
  dragOffY       : 0,
};

const SIZES = {
  sm: { w: 160, label: 'صغير' },
  md: { w: 240, label: 'وسط'  },
  lg: { w: 320, label: 'كبير' },
};

/* ══ 1. بدء البث (المُذيع) ══ */
function startBroadcast() {
  if (videoState.isBroadcasting) {
    showToast('⚠️ أنت تبث بالفعل');
    return;
  }
  videoState.isBroadcasting  = true;
  videoState.broadcasterName = localStorage.getItem('username') || 'أنت';

  /* إشعار السيرفر — Phase 21: يُضاف WebRTC offer هنا */
  if (typeof socket !== 'undefined') {
    socket.emit('startBroadcast', {
      room_id : localStorage.getItem('room_id'),
      username: videoState.broadcasterName,
    });
  }

  _openVideoWindow(videoState.broadcasterName, true);
  showToast('🔴 بدأ البث المباشر');
}

/* ══ 2. إيقاف البث ══ */
function stopBroadcast() {
  if (!videoState.isBroadcasting) return;
  videoState.isBroadcasting = false;

  if (typeof socket !== 'undefined') {
    socket.emit('stopBroadcast', { room_id: localStorage.getItem('room_id') });
  }
  closeVideoWindow();
  showToast('⏹️ انتهى البث');
}

/* ══ 3. طلب مشاهدة بث (من المشاهد) ══ */
function requestWatchBroadcast(broadcasterName) {
  if (videoState.isWatching) {
    showToast('⚠️ أنت تشاهد بثاً بالفعل');
    return;
  }

  /* أظهر نافذة تأكيد للمشاهد */
  const overlay = document.getElementById('videoRequestOverlay');
  document.getElementById('vreqBroadcasterName').textContent = broadcasterName;
  document.getElementById('vreqViewerName').textContent =
    localStorage.getItem('username') || 'مستخدم';
  videoState.broadcasterName = broadcasterName;
  overlay.style.display = 'flex';
}

/* ══ 4. ردّ المشاهد على نافذة التأكيد ══ */
function respondToRequest(accepted) {
  document.getElementById('videoRequestOverlay').style.display = 'none';
  if (!accepted) return;

  /* أرسل الطلب للمُذيع عبر السيرفر */
  if (typeof socket !== 'undefined') {
    socket.emit('requestWatch', {
      room_id    : localStorage.getItem('room_id'),
      broadcaster: videoState.broadcasterName,
      viewer     : localStorage.getItem('username'),
    });
  }
  showToast('⏳ في انتظار موافقة المُذيع...');
}

/* ══ 5. المُذيع يستقبل طلب مشاهدة ══ */
function showBroadcastRequest(viewerName) {
  videoState.pendingViewer = viewerName;
  const toast = document.getElementById('broadcastReqToast');
  document.getElementById('broadcastReqText').textContent =
    `📹 ${viewerName} يريد مشاهدة بثك`;
  toast.style.display = 'flex';

  /* يختفي تلقائياً بعد 15 ثانية */
  clearTimeout(videoState._reqTimer);
  videoState._reqTimer = setTimeout(() => {
    toast.style.display = 'none';
    videoState.pendingViewer = null;
  }, 15000);
}

/* ══ 6. المُذيع يرد على الطلب ══ */
function answerBroadcastReq(accepted) {
  document.getElementById('broadcastReqToast').style.display = 'none';
  clearTimeout(videoState._reqTimer);

  if (typeof socket !== 'undefined') {
    socket.emit('broadcastAnswer', {
      room_id : localStorage.getItem('room_id'),
      viewer  : videoState.pendingViewer,
      accepted,
    });
  }
  videoState.pendingViewer = null;
  showToast(accepted ? '✅ قبلت المشاهد' : '❌ رفضت الطلب');
}

/* ══ 7. المشاهد يستقبل الرد ══ */
function onBroadcastAccepted(broadcasterName) {
  videoState.isWatching = true;
  _openVideoWindow(broadcasterName, false);
  showToast(`✅ قُبلت — تشاهد بث ${broadcasterName}`);
}
function onBroadcastRejected() {
  showToast('❌ رفض المُذيع طلب المشاهدة');
}

/* ══ 8. فتح نافذة البث ══ */
function _openVideoWindow(name, isMine) {
  const win = document.getElementById('videoWindow');
  document.getElementById('videoBroadcasterName').textContent =
    `📹 ${isMine ? 'بثك المباشر' : name}`;

  win.className = `video-window sz-${videoState.currentSize}`;
  win.style.display = 'block';

  /* Phase 21: هنا يُضاف stream من WebRTC
     const video = win.querySelector('video');
     video.srcObject = stream; */
}

/* ══ 9. إغلاق نافذة البث ══ */
function closeVideoWindow() {
  document.getElementById('videoWindow').style.display = 'none';
  if (videoState.isBroadcasting) stopBroadcast();
  videoState.isWatching = false;
}

/* ══ 10. تغيير الحجم ══ */
function setVideoSize(size) {
  videoState.currentSize = size;
  const win = document.getElementById('videoWindow');
  win.className = `video-window sz-${size}`;
  document.querySelectorAll('.size-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.size === size);
  });
}
function cycleVideoSize() {
  const order = ['sm', 'md', 'lg'];
  const next  = order[(order.indexOf(videoState.currentSize) + 1) % 3];
  setVideoSize(next);
}

/* ══ 11. سحب النافذة ══ */
(function initVideoDrag() {
  const bar = document.getElementById('videoTitlebar');
  if (!bar) return;

  bar.addEventListener('touchstart', e => {
    const win  = document.getElementById('videoWindow');
    const rect = win.getBoundingClientRect();
    videoState.dragOffX = e.touches[0].clientX - rect.left;
    videoState.dragOffY = e.touches[0].clientY - rect.top;
    win.style.transition = 'none';
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!e.target.closest('#videoTitlebar')) return;
    const win = document.getElementById('videoWindow');
    if (win.style.display === 'none') return;
    const x = e.touches[0].clientX - videoState.dragOffX;
    const y = e.touches[0].clientY - videoState.dragOffY;
    /* منع الخروج من الشاشة */
    const maxX = window.innerWidth  - win.offsetWidth;
    const maxY = window.innerHeight - win.offsetHeight;
    win.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    win.style.top  = Math.max(0, Math.min(y, maxY)) + 'px';
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!e.target.closest('#videoTitlebar')) return;
    const win = document.getElementById('videoWindow');
    win.style.transition = '';
  });
})();

/* ══ 12. Socket.io events (تُربط بـ core.js) ══ */
function bindVideoSocketEvents() {
  if (typeof socket === 'undefined') return;

  /* شخص آخر بدأ البث في الغرفة */
  socket.on('broadcastStarted', data => {
    const name = data.username;
    /* أضف رمز الكاميرا في قائمة الأعضاء */
    _addCamBadge(name);
    showToast(`📹 ${name} بدأ البث المباشر`);
  });

  /* البث انتهى */
  socket.on('broadcastStopped', data => {
    _removeCamBadge(data.username);
    if (videoState.isWatching &&
        videoState.broadcasterName === data.username) {
      closeVideoWindow();
      showToast('⏹️ انتهى البث المباشر');
    }
  });

  /* المُذيع يستقبل طلب مشاهدة */
  socket.on('watchRequest', data => {
    if (videoState.isBroadcasting) showBroadcastRequest(data.viewer);
  });

  /* المشاهد يستقبل الرد */
  socket.on('watchAccepted', data => onBroadcastAccepted(data.broadcaster));
  socket.on('watchRejected', ()   => onBroadcastRejected());
}

/* ══ رمز الكاميرا في قائمة الأعضاء ══ */
function _addCamBadge(username) {
  const items = document.querySelectorAll('.member-item');
  items.forEach(el => {
    if (el.dataset.username === username && !el.querySelector('.cam-badge')) {
      const badge = document.createElement('span');
      badge.className   = 'cam-badge';
      badge.textContent = '📹';
      badge.title       = 'يبث مباشر';
      badge.onclick     = (e) => {
        e.stopPropagation();
        requestWatchBroadcast(username);
      };
      el.querySelector('.member-name')?.prepend(badge);
    }
  });
}
function _removeCamBadge(username) {
  document.querySelectorAll('.member-item').forEach(el => {
    if (el.dataset.username === username)
      el.querySelector('.cam-badge')?.remove();
  });
}

/* ══ زر البث في القائمة الجانبية (يُضاف ديناميكياً) ══ */
function addBroadcastMenuItem() {
  const menu = document.getElementById('sideMenu');
  if (!menu || menu.querySelector('#broadcastMenuItem')) return;
  const item = document.createElement('div');
  item.id = 'broadcastMenuItem';
  item.className = 'side-menu-item';
  item.innerHTML = `<span class="item-icon">📹</span><span>بث مباشر</span>`;
  item.onclick = () => {
    closeSideMenu?.();
    videoState.isBroadcasting ? stopBroadcast() : startBroadcast();
  };
  /* أضفه قبل زر الخروج */
  const danger = menu.querySelector('.danger');
  menu.insertBefore(item, danger);
}

/* ══ INIT ══ */
document.addEventListener('DOMContentLoaded', () => {
  bindVideoSocketEvents();
  addBroadcastMenuItem();
});
