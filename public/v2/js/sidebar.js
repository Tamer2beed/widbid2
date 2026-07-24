/* sidebar.js — سحب لوحة المتواجدين بالإصبع (أفقياً فقط)، مع السماح بالتمرير العمودي الطبيعي داخل القائمة. */
let isPanelOpen = false;

function toggleOnlinePanel() {
    const panel = document.getElementById('onlineUsersPanel');
    if (!panel) return;
    const opening = !panel.classList.contains('active');
    if (opening) {
        document.getElementById('sideMenu')?.classList.remove('active');
    }
    panel.classList.toggle('active');
    isPanelOpen = panel.classList.contains('active');
    panel.style.transform = isPanelOpen ? "translateX(0%)" : "translateX(-100%)";
}

function initSidebarTouchEvents() {
    let startX = 0, startY = 0, currentX = 0, isDragging = false, dragDirection = null; // 'horizontal' | 'vertical' | null
    const panel = document.getElementById('onlineUsersPanel');
    if (!panel) return;
    const panelWidth = window.innerWidth * 0.75, touchStartArea = 38, threshold = 0.2, directionLockPx = 10;

    function isInsideHeaderOrFooter(target) { return !!(target.closest('#mainHeader') || target.closest('footer') || target.closest('#footer-component')); }

    function handleStart(clientX, clientY, target) {
        if (isPanelOpen) { if (!target.closest('#onlineUsersPanel')) return; }
        else { if (clientX > touchStartArea) return; if (target && isInsideHeaderOrFooter(target)) return; }
        startX = clientX; startY = clientY; isDragging = true; dragDirection = null;
        panel.style.transition = 'none';
    }

    function handleMove(clientX, clientY, evt) {
        if (!isDragging) return;
        currentX = clientX;

        if (dragDirection === null) {
            const dx = clientX - startX;
            const dy = clientY - startY;
            const absDx = Math.abs(dx), absDy = Math.abs(dy);
            if (absDx < 3 && absDy < 3) return; // منطقة انتظار دقيقة جداً (3px) لتصفية الرجفة الطبيعية
            dragDirection = absDx > absDy * 1.3 ? 'horizontal' : 'vertical'; // ترجيح للعمودي إلا إذا كانت الحركة أفقية بوضوح
            if (dragDirection === 'vertical') {
                // تمرير عمودي عادي: نلغي وضع السحب فوراً ونترك المتصفح يتصرف طبيعياً
                isDragging = false;
                panel.style.transition = '';
                return;
            }
            if (!isPanelOpen) panel.classList.add('active');
            document.getElementById('sideMenu')?.classList.remove('active');
        }

        if (dragDirection !== 'horizontal') return;
        if (evt && evt.cancelable) evt.preventDefault();

        if (!isPanelOpen) {
            let diff = Math.min(Math.max(currentX - startX, 0), panelWidth);
            panel.style.transform = `translateX(${-panelWidth + diff}px)`;
        } else {
            let diff = Math.min(Math.max(startX - currentX, 0), panelWidth);
            panel.style.transform = `translateX(${-diff}px)`;
        }
    }

    function handleEnd() {
        if (!isDragging || dragDirection !== 'horizontal') { isDragging = false; dragDirection = null; return; }
        isDragging = false; panel.style.transition = 'transform 0.3s ease-out';
        if (!isPanelOpen) {
            if ((currentX - startX) > (panelWidth * threshold)) {
                panel.style.transform = "translateX(0%)"; panel.classList.add('active'); isPanelOpen = true;
            } else { panel.style.transform = "translateX(-100%)"; panel.classList.remove('active'); }
        } else {
            if ((startX - currentX) > (panelWidth * threshold)) {
                panel.style.transform = "translateX(-100%)"; panel.classList.remove('active'); isPanelOpen = false;
            } else { panel.style.transform = "translateX(0%)"; }
        }
        dragDirection = null;
    }

    document.addEventListener('touchstart', e => {
        if (e.touches.length === 1) {
            const t = e.touches[0], target = e.target;
            if (isPanelOpen) { if (target.closest('#onlineUsersPanel')) handleStart(t.clientX, t.clientY, target); }
            else { if (t.clientX <= touchStartArea && !isInsideHeaderOrFooter(target)) handleStart(t.clientX, t.clientY, target); }
        }
    }, { passive: true });

    document.addEventListener('touchmove', e => {
        if (isDragging) handleMove(e.touches[0].clientX, e.touches[0].clientY, e);
    }, { passive: false });

    document.addEventListener('touchend', handleEnd);
    document.addEventListener('mousedown', e => handleStart(e.clientX, e.clientY, e.target));
    document.addEventListener('mousemove', e => { if (isDragging) handleMove(e.clientX, e.clientY, e); });
    document.addEventListener('mouseup', handleEnd);
}
