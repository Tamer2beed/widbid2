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
    if ((userRank || 0) < 500) { showToast('⛔ للمشرفين فقط'); return; }
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

  /* ══ حفظ البانر ══ */
  function saveBanner() {
    if (!pendingMobile && !pendingDesktop) {
      showToast('⚠️ اختر صورة واحدة على الأقل');
      return;
    }
    socket.emit('setBanner', {
      room_id : roomId,
      mobile  : pendingMobile  || null,
      desktop : pendingDesktop || null,
    });
    showToast('⏳ جاري الحفظ...');
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
  }

  /* ══ إظهار زر التعديل للمشرفين ══ */
  function initAdminUI() {
    if ((userRank || 0) >= 500) {
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
