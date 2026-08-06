'use strict';
/* ════════════════════════════════════════════════════════
   WidBid — server/bots.js
   [S18] إعادة بناء كاملة — بوتات "الرتب الثابتة" بدل النظام
   العشوائي القديم (دخول/خروج/تجوّل بين الغرف بأسماء عشوائية مربكة).

   الميزات الجديدة:
   ✅ 12 بوت بالضبط — بوت واحد فقط لكل رتبة من رتب السلّم (100→1200)
   ✅ اسم البوت = اسم رتبته حرفياً (Guest, Member, Admin, ...) —
      تمييز فوري بالعين المجردة أثناء اختبار الصلاحيات
   ✅ ثابتون بالغرفة نهائياً بعد الدخول — لا خروج عشوائي إطلاقاً
   ✅ يُعمَّر كل غرفة نشطة تلقائياً عند إقلاع السيرفر، وأي غرفة
      جديدة تُكتشف لاحقاً (كل 5 دقائق) تُعمَّر بنفس الـ 12 بوت
   ✅ نشاط خفيف مستمر (رسائل / مايك / رفع يد) حسب طابع كل رتبة
   ✅ يظهر في قائمة الأعضاء عبر getBotUsers()
   ✅ لا يحتاج socket.io-client — يعمل داخل نفس العملية
════════════════════════════════════════════════════════ */

/* ══ سجل البوتات في الغرف ══
   roomId (String) → Map(username → botData)               */
const BOT_REGISTRY = new Map();

let _io         = null; // io instance من index.js
let _db         = null; // db pool من index.js
let _buildUsers = null; // buildOnlineUsers callback من index.js
let _roomIds    = [];   // قائمة معرفات الغرف النشطة

/* ══════════════════════════════════════════
   بوتات الرتب الثابتة — بوت واحد فقط لكل رتبة،
   الاسم = اسم الرتبة نفسها (مطابق للسلّم الرسمي 100→1200)
══════════════════════════════════════════ */
const RANK_BOTS = [
  { username: 'Guest',       rank: 100,  avatar: 'av3.svg', country: 'العراق',   behavior: 'lurker'  },
  { username: 'Member',      rank: 200,  avatar: 'av2.svg', country: 'السعودية', behavior: 'chatter' },
  { username: 'Protected',   rank: 300,  avatar: 'av5.svg', country: 'الإمارات', behavior: 'chatter' },
  { username: 'Royal',       rank: 400,  avatar: 'av7.svg', country: 'السعودية', behavior: 'active'  },
  { username: 'Admin',       rank: 500,  avatar: 'av4.svg', country: 'العراق',   behavior: 'active'  },
  { username: 'SuperAdmin',  rank: 600,  avatar: 'av1.svg', country: 'مصر',      behavior: 'active'  },
  { username: 'Master🤖',     rank: 700,  avatar: 'av8.svg', country: 'لبنان',    behavior: 'speaker' },
  { username: 'SuperMaster', rank: 800,  avatar: 'av2.svg', country: 'السعودية', behavior: 'speaker' },
  { username: 'Root',        rank: 900,  avatar: 'av3.svg', country: 'العراق',   behavior: 'speaker' },
  { username: 'SuperRoot',   rank: 1000, avatar: 'av5.svg', country: 'العراق',   behavior: 'vip'     },
  { username: 'Owner',       rank: 1100, avatar: 'av7.svg', country: 'العراق',   behavior: 'vip'     },
  { username: 'SuperOwner',  rank: 1200, avatar: 'av8.svg', country: 'العراق',   behavior: 'vip'     },
];

/* ══════════════════════════════════════════
   قاموس الرسائل العربية
══════════════════════════════════════════ */
const MSG = {
  general: [
    'أهلاً وسهلاً بالجميع 👋',
    'السلام عليكم ورحمة الله وبركاته',
    'كيف حال الجميع اليوم؟ 😊',
    'الله يحيّيكم يا أهل الغرفة',
    'غرفة رائعة ومميزة 🌟',
    'يسعد مساكم يا ناس',
    'تحياتي للجميع ❤️',
    'نورتوا الغرفة بوجودكم',
    'أجواء حلوة هنا 🌹',
    'ماشالله ع الغرفة',
    'شباب كيف عساكم؟',
    'الله يبارك فيكم يا أهل الخير',
    'وحشتكم والله 💙',
    'الجو حلو هنا ما شاء الله',
    'أتمنى للجميع يوم سعيد ومبارك',
    'ربي يوفق الجميع ويسعدكم',
    'يلا نحكي شوي، إيه الأخبار؟',
    'الله يعطيكم العافية جميعاً',
    'شكراً على الاستقبال الحلو 💫',
    'مبسوط بينكم والله 😍',
    'هالغرفة دايماً نشطة 🔥',
    'شو عندكم اليوم يا جماعة؟',
    'والله أحلى ناس هنا ❤️',
    'ربي لا يحرمنا منكم',
    'بيّض الله وجوهكم يا أهل الخير',
    'هي أجمل غرفة بالمنصة 🎊',
    'تسلم يدك يا صاحبي',
    'كلامكم حلو وروحكم أحلى',
    'ولا يهمكم كلنا إخوان هنا',
    'الله الله ع هالأجواء 🌙',
    'الحمد لله على كل شيء',
    'يا رب تكون بخير يا جماعة',
    'وش الجديد عندكم اليوم؟',
    'خير إن شاء الله على الجميع',
    'مش قادر أقاوم هالغرفة 😁',
    'روحكم حلوة والله',
    'الله يسعدكم كلكم 💛',
    'أكرمكم الله ووسّع عليكم',
    'يلا نضحك شوي، هيّا 😂',
    'الوقت يمشي بسرعة هنا',
  ],
  join: [
    'وصلت يا شباب، كيف الجميع؟ 👋',
    'السلام عليكم، أنا هنا معكم',
    'أهلاً بالجميع، سعيد بوجودي بينكم 😊',
    'حياكم الله، وصلت بخير',
    'مرحبا مرحبا، شو الأخبار؟',
    'أهلين، كيفكم يا ناس؟',
    'السلام عليكم ورحمة الله',
  ],
  mic: [
    'يلا آخذ الميك وأحكيكم شي 🎤',
    'لو سمحتم بدي أقول كلمة',
    'معكم لحظة بسيطة أسمعوني',
    'شكراً على الميك، بحكيكم بسرعة',
    'والله يسعدكم، كلمة وأنهي 🙏',
    'أخذت الميك وأبدأ بسم الله',
    'بدي أشارككم رأيي لو تكرمتم',
  ],
};

/* ══════════════════════════════════════════
   دوال مساعدة
══════════════════════════════════════════ */
const rnd   = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
const delay = ms => new Promise(r => setTimeout(r, ms));

/* ── تحديث الغرف من DB ── */
async function refreshRooms() {
  try {
    const [rows] = await _db.query('SELECT id FROM rooms WHERE is_active = 1 LIMIT 100');
    _roomIds = rows.map(r => String(r.id));
  } catch (_) {}
}

/* ── تحديث onlineUsers في الغرفة ── */
async function _pushOnlineList(roomId) {
  if (!_buildUsers) return;
  try {
    const users = await _buildUsers(String(roomId));
    _io.to(String(roomId)).emit('onlineUsers', users);
  } catch (_) {}
}

/* ══════════════════════════════════════════
   API عام: getBotUsers (يُستدعى من index.js)
   يُضاف إلى نتيجة buildOnlineUsers
══════════════════════════════════════════ */
function getBotUsers(roomId) {
  const reg = BOT_REGISTRY.get(String(roomId));
  if (!reg || reg.size === 0) return [];
  return Array.from(reg.values()).map(b => ({
    username: b.username,
    rank:     b.rank,
    status:   'available',
    isMuted:  !!b.isMuted,
    isBot:    true,
  }));
}

/* ── [S18] دعم إجراءات الإدارة على البوتات (كتم/فك كتم) ──
   البوتات ليس لها Socket.io حقيقي، فأي إجراء إداري يدوّر على
   اتصال حقيقي (زي muteUser بـ index.js) ما يلقاها ويرفض بـ
   "المستخدم غير موجود". هذي الدالتين تسمحان لـ index.js يتحقق
   من وجود بوت بهذا الاسم بالغرفة ويغيّر حالة كتمه مباشرة بالسجل. */
function getBotInRoom(roomId, username) {
  const reg = BOT_REGISTRY.get(String(roomId));
  if (!reg) return null;
  return reg.get(username) || null;
}
function setBotMuted(roomId, username, muted) {
  const reg = BOT_REGISTRY.get(String(roomId));
  if (!reg || !reg.has(username)) return false;
  reg.get(username).isMuted = !!muted;
  return true;
}

/* [S18-3] تجميد بوت — علم داخلي فقط (بوت ما له جلسة حقيقية يقفلها) */
function setBotFrozen(roomId, username, frozen) {
  const reg = BOT_REGISTRY.get(String(roomId));
  if (!reg || !reg.has(username)) return false;
  reg.get(username).isFrozen = !!frozen;
  return true;
}

/* [S18-3] طرد بوت — يشيله من الغرفة فوراً (يرجع تلقائياً خلال
   ≤5 دقائق عبر ensureBotsEverywhere الدوري — نفس منطق "لو رجع
   إنسان حقيقي ممكن يرجع البوت" المتوقع من مستخدم حقيقي مطرود). */
function kickBotFromRoom(roomId, username) {
  roomId = String(roomId);
  const reg = BOT_REGISTRY.get(roomId);
  if (!reg || !reg.has(username)) return false;
  reg.delete(username);
  _io.to(roomId).emit('userLeft', { username });
  _pushOnlineList(roomId);
  console.log(`🤖 [Bot-Kicked] ${username} ← غرفة ${roomId} (رح يرجع تلقائياً خلال ≤5 دقائق)`);
  return true;
}

/* ══════════════════════════════════════════
   أحداث الغرفة
══════════════════════════════════════════ */

function botJoin(bot, roomId) {
  roomId = String(roomId);
  if (!BOT_REGISTRY.has(roomId)) BOT_REGISTRY.set(roomId, new Map());
  BOT_REGISTRY.get(roomId).set(bot.username, {
    username: bot.username,
    rank:     bot.rank,
    avatar:   bot.avatar,
    isMuted:  false,
  });
  _io.to(roomId).emit('userJoined', { username: bot.username, rank: bot.rank });
  _pushOnlineList(roomId);
  console.log(`🤖 [Bot+] ${bot.username} (${bot.rank}) → غرفة ${roomId}`);
}

function botLeave(bot, roomId) {
  roomId = String(roomId);
  const reg = BOT_REGISTRY.get(roomId);
  if (reg) {
    reg.delete(bot.username);
    if (reg.size === 0) BOT_REGISTRY.delete(roomId);
  }
  _io.to(roomId).emit('userLeft', { username: bot.username });
  _pushOnlineList(roomId);
  console.log(`🤖 [Bot-] ${bot.username} ← غرفة ${roomId}`);
}

function botSendMessage(bot, roomId, msgPool) {
  const msg = pick(msgPool || MSG.general);
  _io.to(String(roomId)).emit('newMessage', {
    id:      null,
    username: bot.username,
    message:  msg,
    rank:     bot.rank,
    avatar:   bot.avatar || 'av1.svg',
    room_id:  String(roomId),
    time:     new Date().toISOString(),
    isBot:    true,
  });
}

function botActivateMic(bot, roomId, state) {
  roomId = String(roomId);
  if (state.isMicOn) return;

  // رسالة قبل طلب الميك
  botSendMessage(bot, roomId, MSG.mic);

  // تأخير صغير ثم تشغيل المايك
  setTimeout(() => {
    state.isMicOn = true;
    _io.to(roomId).emit('micOn', { username: bot.username });

    // مدة الكلام: 15 - 40 ثانية
    const talkMs = rnd(15000, 40000);
    setTimeout(() => {
      state.isMicOn = false;
      _io.to(roomId).emit('micOff', { username: bot.username });
    }, talkMs);
  }, rnd(2000, 7000));
}

function botRaiseHand(bot, roomId) {
  _io.to(String(roomId)).emit('raiseHand', { username: bot.username });
}

/* ══════════════════════════════════════════
   [S18] نشاط بوت دائم داخل غرفة واحدة — بدون خروج إطلاقاً.
   يُستدعى مرة واحدة فقط بعد الدخول، ويجدول نفسه للأبد
   (فترات أطول من النظام القديم لأنها أصبحت مستمرة/دائمة
   لا مرتبطة بزيارة قصيرة).
══════════════════════════════════════════ */
function _startPermanentActivity(bot, roomId) {
  const state = { isMicOn: false };

  const schedMsg = () => {
    const minWait = bot.behavior === 'lurker' ? 240000 : bot.behavior === 'vip' ? 60000 : 90000;
    const maxWait = bot.behavior === 'lurker' ? 600000 : bot.behavior === 'chatter' ? 240000 : 360000;
    setTimeout(() => { botSendMessage(bot, roomId); schedMsg(); }, rnd(minWait, maxWait));
  };

  const schedMic = () => {
    if (!['active', 'speaker', 'vip'].includes(bot.behavior)) return;
    const wait = bot.behavior === 'vip' ? rnd(120000, 300000) : rnd(180000, 420000);
    setTimeout(() => { botActivateMic(bot, roomId, state); schedMic(); }, wait);
  };

  const schedHand = () => {
    if (bot.behavior === 'lurker') return;
    setTimeout(() => { botRaiseHand(bot, roomId); schedHand(); }, rnd(240000, 600000));
  };

  if (bot.behavior !== 'lurker') schedMsg();
  schedMic();
  schedHand();
}

/* ── تعمير غرفة واحدة بكل الـ 12 بوت (لو مو موجودين فيها أصلاً) ── */
function populateRoomWithRankBots(roomId) {
  roomId = String(roomId);
  const reg = BOT_REGISTRY.get(roomId);
  RANK_BOTS.forEach(bot => {
    if (reg && reg.has(bot.username)) return; // موجود مسبقاً — لا تكرار
    botJoin(bot, roomId);
    _startPermanentActivity(bot, roomId);
  });
}

/* ── تعمير كل الغرف النشطة (تُستدعى عند الإقلاع، وكل 5 دقائق لاكتشاف غرف جديدة) ── */
async function ensureBotsEverywhere() {
  await refreshRooms();
  _roomIds.forEach(populateRoomWithRankBots);
}

/* ══════════════════════════════════════════
   التهيئة الرئيسية — تُستدعى من index.js
══════════════════════════════════════════ */
function initBots(io, db, buildOnlineUsers) {
  _io         = io;
  _db         = db;
  _buildUsers = buildOnlineUsers;

  ensureBotsEverywhere().then(() => {
    console.log(`\n🤖 تعمير ${_roomIds.length} غرفة نشطة بـ ${RANK_BOTS.length} بوت-رتبة ثابت لكل غرفة (بدون خروج)`);
  });

  // اكتشاف أي غرفة جديدة نشطة كل 5 دقائق وتعميرها تلقائياً
  setInterval(ensureBotsEverywhere, 5 * 60 * 1000);
}

module.exports = { initBots, getBotUsers, getBotInRoom, setBotMuted, setBotFrozen, kickBotFromRoom };
