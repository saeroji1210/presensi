/* =====================================================================
   gps.js — Ambil 3–5 titik GPS dalam ±10 detik (PRD 5.3 langkah 2).
   GPS asli berfluktuasi sedikit; server memeriksa pola statis/berulang.
   ===================================================================== */
import { haversine } from './core/util.js';

let terakhir = null; // { waktu, sampel }

export function izinLokasi() {
  if (!navigator.permissions) return Promise.resolve('prompt');
  return navigator.permissions.query({ name: 'geolocation' }).then(r => r.state).catch(() => 'prompt');
}

/**
 * @param {object} o durasi (ms), maks (jumlah sampel), onUpdate(sampel[])
 * @returns Promise<Array<{lat,lng,acc,t}>>
 */
export function sampelGps({ durasi = 10000, maks = 5, akurasiBaik = 25, onUpdate } = {}) {
  return new Promise((ok, gagal) => {
    if (!('geolocation' in navigator)) return gagal(Object.assign(new Error('Perangkat tidak mendukung GPS.'), { kode: 'TIDAK_DIDUKUNG' }));
    const sampel = [];
    let selesai = false, id = null;
    const akhiri = () => {
      if (selesai) return;
      selesai = true;
      if (id !== null) navigator.geolocation.clearWatch(id);
      clearTimeout(tm);
      if (sampel.length) { terakhir = { waktu: Date.now(), sampel: sampel.slice() }; ok(sampel); }
      else gagal(Object.assign(new Error('Sinyal GPS tidak ditemukan. Coba dekat jendela atau di luar ruangan.'), { kode: 'TIMEOUT' }));
    };
    const tm = setTimeout(akhiri, durasi);
    id = navigator.geolocation.watchPosition(pos => {
      const c = pos.coords;
      sampel.push({ lat: c.latitude, lng: c.longitude, acc: c.accuracy, t: pos.timestamp || Date.now() });
      onUpdate && onUpdate(sampel.slice());
      const best = Math.min(...sampel.map(s => s.acc));
      if (sampel.length >= maks || (sampel.length >= 3 && best <= akurasiBaik && Date.now() - sampel[0].t > 4000)) akhiri();
    }, err => {
      if (err.code === 1) { selesai = true; clearTimeout(tm); if (id !== null) navigator.geolocation.clearWatch(id); gagal(Object.assign(new Error('Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini di pengaturan browser.'), { kode: 'DITOLAK' })); }
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: durasi });
  });
}

/** Sampel terakhir bila masih segar (dipakai ulang saat tombol ditekan). */
export function sampelTerakhir(maksUmur = 45000) {
  return terakhir && Date.now() - terakhir.waktu < maksUmur ? terakhir.sampel : null;
}

export const terbaik = sampel => sampel.slice().sort((a, b) => a.acc - b.acc)[0];

/** Titik target terdekat (relatif terhadap radius) untuk tampilan status. */
export function nilaiTarget(sampel, target) {
  const b = terbaik(sampel);
  let pilih = null;
  (target || []).forEach(t => {
    const d = haversine(b.lat, b.lng, t.lat, t.lng);
    if (!pilih || d - t.radius < pilih.jarak - pilih.t.radius) pilih = { t, jarak: d };
  });
  return pilih ? { ...pilih, dalam: pilih.jarak <= pilih.t.radius, akurasi: b.acc } : null;
}
