/* rooms.js — صفحة اختيار الغرف بعد الخروج، مصنّفة حسب الدولة ومرتّبة تنازلياً بعدد الزوار. */

const FEATURED_ROOMS = [
    { name: 'الجلسة الليبية', users: 705 }
];

const COUNTRY_ROOMS_DATA = [
    { country: 'العراق', users: 902, rooms: [{ name: 'بغداد', users: 320 }, { name: 'البصرة', users: 180 }, { name: 'أربيل', users: 402 }] },
    { country: 'سوريا', users: 774, rooms: [{ name: 'دمشق', users: 400 }, { name: 'حلب', users: 374 }] },
    { country: 'الأردن', users: 224, rooms: [{ name: 'عمّان', users: 224 }] },
    { country: 'لبنان', users: 114, rooms: [{ name: 'بيروت', users: 114 }] },
    { country: 'فلسطين', users: 101, rooms: [{ name: 'غزة', users: 60 }, { name: 'القدس', users: 41 }] },
    { country: 'السعودية', users: 86, rooms: [{ name: 'الرياض', users: 86 }] },
    { country: 'اليمن', users: 49, rooms: [{ name: 'صنعاء', users: 49 }] },
    { country: 'مصر', users: 35, rooms: [{ name: 'القاهرة', users: 35 }] },
    { country: 'الجزائر', users: 26, rooms: [{ name: 'الجزائر العاصمة', users: 26 }] }
];

let expandedCountry = null;

function renderRoomsScreen() {
    const listEl = document.getElementById('roomsList');
    if (!listEl) return;

    const sortedCountries = [...COUNTRY_ROOMS_DATA].sort((a, b) => b.users - a.users);

    let html = `<div class="text-white/40 text-[11px] font-bold px-2 mb-1">الغرف المميزة</div>`;
    html += FEATURED_ROOMS.map(r => `
        <button class="room-select-btn w-full flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-2" data-room="${r.name}">
            <span class="text-white text-sm font-bold"><i class="fa-solid fa-star text-amber-400 ml-2"></i>${r.name}</span>
            <span class="text-white/40 text-xs">${r.users} مستخدم</span>
        </button>
    `).join('');

    html += `<div class="text-white/40 text-[11px] font-bold px-2 mt-3 mb-1">حسب الدولة</div>`;
    html += sortedCountries.map(c => {
        const isOpen = expandedCountry === c.country;
        return `
        <div class="mb-2">
            <button class="country-toggle-btn w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10" data-country="${c.country}">
                <span class="text-white text-sm font-bold">${c.country}</span>
                <span class="flex items-center gap-2 text-white/40 text-xs">${c.users} مستخدم <i class="fa-solid fa-chevron-${isOpen ? 'up' : 'down'}"></i></span>
            </button>
            ${isOpen ? `<div class="pl-3 pr-1 pt-2 space-y-2">${c.rooms.map(r => `
                <button class="room-select-btn w-full flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/10" data-room="${r.name}">
                    <span class="text-white/90 text-xs">${r.name}</span>
                    <span class="text-white/30 text-[11px]">${r.users}</span>
                </button>
            `).join('')}</div>` : ''}
        </div>`;
    }).join('');

    listEl.innerHTML = html;
}

function toggleCountry(country) {
    expandedCountry = expandedCountry === country ? null : country;
    renderRoomsScreen();
}

function selectRoom(roomName) {
    document.getElementById('roomsScreen')?.classList.add('hidden');
    document.getElementById('loginScreen')?.classList.remove('hidden');
    if (typeof showNotification === 'function') showNotification(`🚪 اخترت غرفة: ${roomName}`, 'join');
}

function openRoomsScreen() {
    expandedCountry = null;
    renderRoomsScreen();
    document.getElementById('roomsScreen')?.classList.remove('hidden');
}
