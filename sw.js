/* =====================================================================
   Service worker — cache aset aplikasi & model AI (bukan respons API).
   - Aset aplikasi: stale-while-revalidate (instan, diperbarui di latar)
   - CDN berversi & model wajah: cache-first (diunduh sekali)
   - Google Apps Script (API) & SSO: selalu jaringan, tidak pernah di-cache
   Naikkan VERSI setiap rilis agar cache lama dibersihkan.
   ===================================================================== */
const VERSI = 'presensi-v1.0.0';
const ASET = `${VERSI}-aset`;
const MODEL = 'presensi-model-v1';
const INTI = [
  './', './index.html', './manifest.webmanifest', './css/base.css', './css/pegawai.css', './css/admin.css',
  './js/config.js', './js/app.js', './js/auth.js', './js/gps.js', './js/core/api.js', './js/core/util.js', './js/core/router.js',
  './js/pegawai/shell.js', './js/pegawai/data.js', './js/pegawai/beranda.js', './js/pegawai/riwayat.js',
  './js/pegawai/pengajuan.js', './js/pegawai/profil.js', './js/pegawai/presensi.js',
  './js/face/engine.js', './js/face/kamera.js', './js/face/pendaftaran.js',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(ASET).then(c => c.addAll(INTI)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== ASET && k !== MODEL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const API = /script\.google\.com|script\.googleusercontent\.com|accounts\.google\.com/;
const MODEL_URL = /storage\.googleapis\.com\/mediapipe-models|@mediapipe\/tasks-vision|face-api|\/model\/|\.onnx$|\.task$|onnxruntime-web/;
const CDN = /cdn\.jsdelivr\.net|unpkg\.com|fonts\.(googleapis|gstatic)\.com/;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  if (API.test(url)) return; // API & SSO tidak pernah di-cache
  if (MODEL_URL.test(url) || (CDN.test(url) && /@\d/.test(url)) || /fonts\.gstatic\.com/.test(url)) {
    e.respondWith(cacheDulu(req, MODEL));
    return;
  }
  if (CDN.test(url)) { e.respondWith(segarDiLatar(req, ASET)); return; }
  if (new URL(url).origin === self.location.origin) {
    if (/\/js\/config\.js$/.test(url)) { e.respondWith(jaringanDulu(req, ASET)); return; }
    e.respondWith(segarDiLatar(req, ASET));
  }
});

async function cacheDulu(req, nama) {
  const c = await caches.open(nama);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
  return res;
}

async function segarDiLatar(req, nama) {
  const c = await caches.open(nama);
  const hit = await c.match(req, { ignoreSearch: req.mode === 'navigate' });
  const jaringan = fetch(req).then(res => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
  if (hit) return hit;
  const res = await jaringan;
  if (res) return res;
  if (req.mode === 'navigate') return c.match('./index.html');
  return new Response('', { status: 504 });
}

async function jaringanDulu(req, nama) {
  const c = await caches.open(nama);
  try { const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res; }
  catch { return (await c.match(req)) || new Response('', { status: 504 }); }
}
