/* rooms.js — [S18] إعادة بناء كاملة — قائمة غرف حقيقية 100% من
   /api/rooms/categories/all و /api/rooms/by-category/:id و /api/rooms
   (بدل البيانات الوهمية الثابتة COUNTRY_ROOMS_DATA السابقة). */

let expandedCategoryId  = null;
let allCategories       = [];
let categoryRoomsCache  = {};   // catId → rooms[]
let roomsSearchQuery    = '';
let allRoomsFlatCache   = null; // للبحث الشامل (يُحمّل مرة عند أول بحث)

async function fetchCategories() {
    try {
        const res = await fetch('/api/rooms/categories/all');
        const data = await res.json();
        if (data.success) allCategories = data.categories || [];
    } catch (err) {
        console.error('[rooms] فشل جلب التصنيفات:', err);
    }
}

async function fetchRoomsForCategory(catId) {
    if (categoryRoomsCache[catId]) return categoryRoomsCache[catId];
    try {
        const res = await fetch(`/api/rooms/by-category/${encodeURIComponent(catId)}`);
        const data = await res.json();
        if (data.success) { categoryRoomsCache[catId] = data.rooms || []; return categoryRoomsCache[catId]; }
    } catch (err) {
        console.error('[rooms] فشل جلب غرف التصنيف:', err);
    }
    return [];
}

async function fetchAllRoomsFlat() {
    if (allRoomsFlatCache) return allRoomsFlatCache;
    try {
        const res = await fetch('/api/rooms');
        const data = await res.json();
        if (data.success) { allRoomsFlatCache = data.rooms || []; return allRoomsFlatCache; }
    } catch (err) {
        console.error('[rooms] فشل جلب كل الغرف للبحث:', err);
    }
    return [];
}

function renderRoomCard(room) {
    const locked = room.is_locked ? '<i class="fa-solid fa-lock text-white/30 text-[10px] ml-1"></i>' : '';
    const cap = room.max_capacity ? `${room.member_count || 0} / ${room.max_capacity}` : `${room.member_count || 0}`;
    return `
        <button class="room-select-btn w-full flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/10 mb-2" data-room-id="${room.id}">
            <span class="text-white/90 text-xs">${locked}${sanitize(room.name)}</span>
            <span class="text-white/30 text-[11px]">${sanitize(String(cap))}</span>
        </button>`;
}

function renderTotalsBar() {
    const bar = document.getElementById('roomsTotalsBar');
    if (!bar) return;
    const totalUsers = allCategories.reduce((s, c) => s + (Number(c.user_count) || 0), 0);
    const totalRooms = allCategories.reduce((s, c) => s + (Number(c.room_count) || 0), 0);
    bar.textContent = `👥 ${totalUsers} مستخدم  ·  💬 ${totalRooms} غرفة`;
}

async function loadAndRenderCategoryRooms(catId) {
    const container = document.getElementById(`cat-rooms-${catId}`);
    if (!container) return;
    container.innerHTML = '<div class="text-white/30 text-[10px] text-center py-2">جاري التحميل...</div>';
    const rooms = await fetchRoomsForCategory(catId);
    if (!rooms.length) {
        container.innerHTML = '<div class="text-white/30 text-[10px] text-center py-2">لا توجد غرف بهذا التصنيف حالياً</div>';
        return;
    }
    container.innerHTML = rooms.map(renderRoomCard).join('');
}

async function renderSearchResults() {
    const listEl = document.getElementById('roomsList');
    if (!listEl) return;
    listEl.innerHTML = '<div class="text-center text-white/40 text-xs py-10">جاري البحث...</div>';
    const rooms = await fetchAllRoomsFlat();
    const q = roomsSearchQuery.trim().toLowerCase();
    const filtered = rooms.filter(r => String(r.id) === q || (r.name || '').toLowerCase().includes(q));
    if (!filtered.length) {
        listEl.innerHTML = '<div class="text-center text-white/40 text-xs py-10">ما فيه نتائج مطابقة</div>';
        return;
    }
    listEl.innerHTML = `<div class="text-white/40 text-[11px] font-bold px-2 mb-2">نتائج البحث (${filtered.length})</div>` + filtered.map(renderRoomCard).join('');
}

function renderRoomsScreen() {
    const listEl = document.getElementById('roomsList');
    if (!listEl) return;

    if (roomsSearchQuery.trim()) { renderSearchResults(); return; }

    if (!allCategories.length) {
        listEl.innerHTML = '<div class="text-center text-white/40 text-xs py-10">جاري تحميل الغرف...</div>';
        return;
    }

    let html = '';
    allCategories.forEach(cat => {
        const isOpen = expandedCategoryId === cat.id;
        html += `
        <div class="mb-2">
            <button class="category-toggle-btn w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10" data-cat-id="${cat.id}">
                <span class="text-white text-sm font-bold">${sanitize(cat.icon || '')} ${sanitize(cat.name)}</span>
                <span class="flex items-center gap-2 text-white/40 text-xs">${cat.user_count || 0} مستخدم · ${cat.room_count || 0} غرفة <i class="fa-solid fa-chevron-${isOpen ? 'up' : 'down'}"></i></span>
            </button>
            <div class="pl-3 pr-1 pt-2 space-y-2 ${isOpen ? '' : 'hidden'}" id="cat-rooms-${cat.id}"></div>
        </div>`;
    });
    listEl.innerHTML = html;

    if (expandedCategoryId) loadAndRenderCategoryRooms(expandedCategoryId);
    renderTotalsBar();
}

function toggleCategory(catId) {
    expandedCategoryId = expandedCategoryId === catId ? null : catId;
    renderRoomsScreen();
}

/* اختيار غرفة = تنقّل حقيقي كامل لنفس الصفحة برقم الغرفة الجديد
   (معمارية v2 كلها مبنية على ?room_id= بالرابط) */
function selectRoom(roomId) {
    if (!roomId) return;
    window.location.href = window.location.pathname + '?room_id=' + encodeURIComponent(roomId);
}

function onRoomsSearchInput(value) {
    roomsSearchQuery = value || '';
    renderRoomsScreen();
}

async function openRoomsScreen() {
    expandedCategoryId = null;
    roomsSearchQuery = '';
    const searchInput = document.getElementById('roomsSearchInput');
    if (searchInput) searchInput.value = '';
    document.getElementById('roomsScreen')?.classList.remove('hidden');
    renderRoomsScreen();
    await fetchCategories();
    renderRoomsScreen();
}
