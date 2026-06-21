/* ════════════════════════════════════════
   WidBid — banner.js
   نظام بانر الغرفة (صورة موبايل + ديسكتوب)
   المشرف (500+) يرفع ويحذف
   يُحفظ في قاعدة البيانات عبر Socket.io
════════════════════════════════════════ */

const BannerSystem = (() => {

  const MAX_MOBILE  = 500  * 1024;   /* 500 KB */
  const MAX_DESKTOP = 1024 * 1024;   /* 1 MB   */

  let pendingMobile  = null;   /* base64 */
  let pendingDesktop = null;   /* base64 */

  /* ══ فتح / إغلاق المحرر ══ */
  function openBannerEditor() {
    const rank = parseInt(localStorage.getItem('rank') || '0');
    if (rank < 500) { showToast('⛔ للمشرفين فقط'); return; }
    document.getElementById('bannerEditorOverlay').style.display = 'flex';
    pendingMobile  = null;
    pendingDesktop = null;
  }

  function closeBannerEditor() {
    document.getElementById('bannerEditorOverlay').style.display = 'none';
    /* إعادة تعيين الـ previews */
    ['Mobile','Desktop'].forEach(t => {
      const wrap = document.getElementById(`banner${t}Preview`);
      if (wrap) wrap.innerHTML =
        `<div class="banner-preview-placeholder">${t==='Mobile'?'360 × 120':'1200 × 180'}</div>`;
      const input = document.getElementById(`banner${t}File`);
      if (input) input.value = '';
    });
  }

  /* ══ معاينة الصورة المختارة ══ */
  function previewBanner(type, input) {
    const file = input.files[0];
    if (!file) return;

    const maxSize = type === 'mobile' ? MAX_MOBILE : MAX_DESKTOP;
    if (file.size > maxSize) {
      showToast(`⚠️ الصورة كبيرة — الحد ${type==='mobile'?'500KB':'1MB'}`);
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      const base64 = e.target.result;
      const T = type === 'mobile' ? 'Mobile' : 'Desktop';
      const wrap = document.getElementById(`banner${T}Preview`);
      if (wrap) {
        wrap.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`;
      }
      if (type === 'mobile')  pendingMobile  = base64;
      else                    pendingDesktop = base64;
    };
    reader.readAsDataURL(file);
  }

  /* ══ ضغط الصورة قبل الإرسال ══ */
  async function compressImage(base64, maxWidth, quality = 0.82) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ratio  = Math.min(1, maxWidth / img.width);
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(base64);
      img.src = base64;
    });
  }

  /* ══ حفظ البانر ══ */
  async function saveBanner() {
    if (!pendingMobile && !pendingDesktop) {
      showToast('⚠️ اختر صورة واحدة على الأقل');
      return;
    }

    showToast('⏳ جاري الضغط والحفظ...');

    /* اضغط الصور قبل الإرسال */
    const mobile  = pendingMobile  ? await compressImage(pendingMobile,  360, 0.80) : null;
    const desktop = pendingDesktop ? await compressImage(pendingDesktop, 1200, 0.82) : null;

    console.log('saveBanner: sending', {
      mobileSize : mobile?.length  || 0,
      desktopSize: desktop?.length || 0,
      roomId,
    });

    socket.emit('setBanner', { room_id: roomId, mobile, desktop });
    closeBannerEditor();
  }

  /* ══ حذف البانر ══ */
  function removeBanner() {
    if (!confirm('حذف بانر الغرفة؟')) return;
    socket.emit('setBanner', { room_id: roomId, mobile: null, desktop: null });
    closeBannerEditor();
  }

  /* ══ تطبيق البانر على الواجهة ══ */
  function applyBanner(data) {
    const mobile  = document.getElementById('bannerMobile');
    const desktop = document.getElementById('bannerDesktop');
    const banner  = document.getElementById('roomBanner');

    if (data?.mobile) {
      mobile.src = data.mobile;
      mobile.style.display = '';
    } else {
      mobile.style.display = 'none';
    }

    if (data?.desktop) {
      desktop.src = data.desktop;
      desktop.style.display = '';
    } else {
      desktop.style.display = 'none';
    }

    /* إذا لا يوجد بانر → اللون الافتراضي */
    if (!data?.mobile && !data?.desktop) {
      if (banner) banner.style.background = '';
    }
  }

  /* ══ Socket Events ══ */
  function bindSocketEvents() {
    if (typeof socket === 'undefined') return;

    /* استقبال البانر عند الدخول للغرفة */
    socket.on('roomBanner', (data) => {
      applyBanner(data);
    });

    /* تحديث البانر (للجميع في الغرفة) */
    socket.on('bannerUpdated', (data) => {
      applyBanner(data);
      showToast(data?.mobile || data?.desktop ? '🖼️ تم تحديث بانر الغرفة' : '🗑️ تم حذف البانر');
    });

    /* خطأ في الحفظ */
    socket.on('bannerError', (data) => {
      showToast('❌ خطأ في الحفظ: ' + (data?.message || 'حاول مرة أخرى'));
    });
  }

  /* ══ إظهار زر التعديل للمشرفين ══ */
  function initAdminUI() {
    /* userRank معرّف في core.js ويكون جاهزاً بعد socketReady */
    const rank = parseInt(localStorage.getItem('rank') || '0');
    if (rank >= 500) {
      const btn = document.getElementById('bannerEditBtn');
      if (btn) btn.style.display = 'inline';
    }
  }

  /* ══ INIT ══ */
  document.addEventListener('socketReady', () => {
    bindSocketEvents();
    initAdminUI();
  });

  return { openBannerEditor, closeBannerEditor, previewBanner, saveBanner, removeBanner };

})();

window.BannerSystem = BannerSystem;

/* دوال عامة تستدعيها الـ HTML */
function openBannerEditor()           { BannerSystem.openBannerEditor(); }
function closeBannerEditor()          { BannerSystem.closeBannerEditor(); }
function previewBanner(type, input)   { BannerSystem.previewBanner(type, input); }
function saveBanner()                 { BannerSystem.saveBanner(); }
function removeBanner()               { BannerSystem.removeBanner(); }
