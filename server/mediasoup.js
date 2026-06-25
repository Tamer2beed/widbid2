// server/mediasoup.js
// [SKILL-AUDIO][server/mediasoup.js:1] — Worker + Router + Transport factory
// المشكلة التي يحلها: إنشاء SFU كامل لبث الصوت عبر Mediasoup
// تاريخ: 2026-06-25

const mediasoup = require('mediasoup');

/* ══ إعدادات الصوت ══ */
const MEDIA_CODECS = [
  {
    kind      : 'audio',
    mimeType  : 'audio/opus',
    clockRate : 48000,
    channels  : 2,
  }
];

/* ══ إعدادات الشبكة ══
   announcedIp = null يعني "استخدم IP الاتصال الفعلي"
   مناسب لشبكة WiFi المحلية (Termux).
   للإنترنت العام: غيّر null لـ IP هاتفك العام */
const LISTEN_IPS = [
  { ip: '0.0.0.0', announcedIp: null }
];

/* ══ إعدادات WebRtcTransport ══ */
const TRANSPORT_OPTIONS = {
  listenIps              : LISTEN_IPS,
  enableUdp              : true,
  enableTcp              : true,
  preferUdp              : true,
  initialAvailableOutgoingBitrate: 800000,
};

let worker = null;

/* الغرف: Map<roomId, { router, producers: Map, consumerTransports: Map, sendTransports: Map }> */
const sfuRooms = new Map();

/* ══ تهيئة Worker ══ */
async function initWorker() {
  worker = await mediasoup.createWorker({
    rtcMinPort : 40000,
    rtcMaxPort : 49999,
    logLevel   : 'warn',
  });

  worker.on('died', (error) => {
    console.error('❌ Mediasoup Worker مات — سيُعاد تشغيله:', error);
    setTimeout(() => initWorker(), 2000);
  });

  console.log('🎙️ Mediasoup Worker جاهز (PID:', worker.pid, ')');
}

/* ══ إنشاء غرفة SFU (أو إعادة الموجودة) ══ */
async function getOrCreateRoom(roomId) {
  if (sfuRooms.has(roomId)) {
    return sfuRooms.get(roomId);
  }

  if (!worker) throw new Error('Mediasoup Worker غير جاهز');

  const router = await worker.createRouter({ mediaCodecs: MEDIA_CODECS });

  const room = {
    router,
    producers       : new Map(), /* producerId → { producer, username } */
    sendTransports  : new Map(), /* transportId → transport */
    recvTransports  : new Map(), /* transportId → transport */
  };

  sfuRooms.set(roomId, room);
  console.log(`🏠 SFU Room أُنشئت: ${roomId}`);
  return room;
}

/* ══ إنشاء WebRtcTransport ══ */
async function createTransport(router) {
  const transport = await router.createWebRtcTransport(TRANSPORT_OPTIONS);

  transport.on('dtlsstatechange', (state) => {
    if (state === 'closed') transport.close();
  });

  return transport;
}

/* ══ تنظيف الغرفة عند فراغها ══ */
function cleanupRoom(roomId) {
  const room = sfuRooms.get(roomId);
  if (!room) return;
  if (room.producers.size === 0 && room.sendTransports.size === 0) {
    room.router.close();
    sfuRooms.delete(roomId);
    console.log(`🗑️ SFU Room حُذفت: ${roomId}`);
  }
}

module.exports = { initWorker, getOrCreateRoom, createTransport, sfuRooms, cleanupRoom };
