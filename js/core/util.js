/* =====================================================================
   util.js — utilitas UI: escape, format id-ID, ikon, badge status,
   toast, modal, konfirmasi, pemuat skrip CDN (lazy), berkas → base64
   ===================================================================== */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Escape HTML — semua data dari server ditampilkan lewat fungsi ini (cegah XSS). */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const ic = (nama, kelas = '') => `<span class="ic ${kelas}" aria-hidden="true">${nama}</span>`;

/* ----------------------------- Format id-ID ----------------------------- */
const fmtAngka = new Intl.NumberFormat('id-ID');
export const angka = n => fmtAngka.format(Number(n) || 0);
export const desimal = (n, d = 1) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(Number(n) || 0);
export const persen = (n, d = 1) => (n === null || n === undefined || n === '') ? '–' : desimal(n, d) + '%';
export const rupiah = n => 'Rp ' + fmtAngka.format(Math.round(Number(n) || 0));
export const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function tglPanjang(t) { // "Jumat, 13 November 2026"
  if (!t) return '';
  const d = new Date(String(t).slice(0, 10) + 'T12:00:00Z');
  return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function tgl(t) { // "13 Nov 2026"
  if (!t) return '–';
  const s = String(t).slice(0, 10);
  return `${Number(s.slice(8, 10))} ${BLN[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
}
export function tglPendek(t) { const s = String(t || '').slice(0, 10); return s ? `${Number(s.slice(8, 10))} ${BLN[Number(s.slice(5, 7)) - 1]}` : ''; }
export function bulanNama(ym) { return ym ? `${BULAN[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : ''; }
export function jamTitik(j) { return String(j || '').slice(0, 5).replace(':', '.'); } // 07.12
export function waktuRelatif(iso) {
  if (!iso) return '';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'baru saja';
  if (s < 3600) return Math.floor(s / 60) + ' menit lalu';
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
  if (s < 172800) return 'kemarin';
  return Math.floor(s / 86400) + ' hari lalu';
}
export function tglJamIso(iso, tz = 'Asia/Jakarta') {
  if (!iso) return '–';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('id-ID', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(d) + ' · ' +
      new Intl.DateTimeFormat('id-ID', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(':', '.') + ' WIB';
  } catch { return iso; }
}
export function menitKeTeks(m) {
  m = Math.round(Number(m) || 0);
  if (!m) return '0 mnt';
  const j = Math.floor(m / 60), s = m % 60;
  return (j ? j + ' jam ' : '') + (s ? s + ' mnt' : '').trim();
}
export function jarakTeks(m) {
  if (m === null || m === undefined || m === '') return '–';
  return m >= 1000 ? desimal(m / 1000, 1) + ' km' : Math.round(m) + ' m';
}
export function inisial(nama) {
  return String(nama || '?').replace(/[^A-Za-z\s]/g, ' ').trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?';
}
export const avatar = (nama, kelas = '') => `<span class="av ${kelas}" title="${esc(nama)}">${esc(inisial(nama))}</span>`;
export function hariIniLokal(tz = 'Asia/Jakarta', d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/* ----------------------------- Status → warna + ikon + label ----------------------------- */
export const STATUS = {
  HADIR: ['b-ok', 'check_circle', 'Hadir'], VALID: ['b-ok', 'verified', 'Valid'], DISETUJUI: ['b-ok', 'check_circle', 'Disetujui'],
  TERLAMBAT: ['b-late', 'schedule', 'Terlambat'], TIDAK_PRESENSI_PULANG: ['b-late', 'logout', 'Tidak Presensi Pulang'],
  TIDAK_PRESENSI_MASUK: ['b-late', 'login', 'Tidak Presensi Masuk'],
  DINAS: ['b-duty', 'flight_takeoff', 'Dinas'], DINAS_TANPA_PRESENSI: ['b-wait', 'flight_takeoff', 'Dinas Tanpa Presensi'],
  IZIN: ['b-leave', 'event_note', 'Izin'], SAKIT: ['b-leave', 'medical_services', 'Sakit'], CUTI: ['b-leave', 'beach_access', 'Cuti'],
  ALPA: ['b-bad', 'cancel', 'Alpa'], DITOLAK: ['b-bad', 'cancel', 'Ditolak'], BELUM_PRESENSI: ['b-bad', 'person_off', 'Belum Presensi'],
  PERLU_DITINJAU: ['b-wait', 'pending', 'Perlu Ditinjau'], MENUNGGU: ['b-wait', 'hourglass_top', 'Menunggu'],
  LIBUR: ['b-neutral', 'weekend', 'Libur'], NONAKTIF: ['b-neutral', 'block', 'Nonaktif'], DIBATALKAN: ['b-neutral', 'undo', 'Dibatalkan'],
  KEDALUWARSA: ['b-neutral', 'timer_off', 'Kedaluwarsa'], AKTIF: ['b-ok', 'check_circle', 'Aktif'], TERJADWAL: ['b-info', 'event', 'Terjadwal'],
  SELESAI: ['b-neutral', 'task_alt', 'Selesai'], BLOKIR: ['b-bad', 'block', 'Blokir'], TERDAFTAR: ['b-ok', 'face', 'Terdaftar'],
  BELUM: ['b-wait', 'face', 'Belum'], DIHAPUS: ['b-neutral', 'face', 'Dihapus'], HARIAN: ['b-info', 'apartment', 'Harian'],
  KOREKSI_PRESENSI: ['b-info', 'edit_calendar', 'Koreksi Presensi']
};
export const WARNA = { HADIR: '#16A34A', VALID: '#16A34A', TERLAMBAT: '#EA580C', DINAS: '#7C3AED', IZIN: '#0891B2', SAKIT: '#0891B2', CUTI: '#0891B2', ALPA: '#DC2626', DITOLAK: '#DC2626', BELUM: '#DC2626', BELUM_PRESENSI: '#DC2626', PERLU_DITINJAU: '#D97706', MENUNGGU: '#D97706', LIBUR: '#94A3B8', TIDAK_PRESENSI_PULANG: '#EA580C', TIDAK_PRESENSI_MASUK: '#EA580C', DINAS_TANPA_PRESENSI: '#D97706' };
export function badge(status, labelKustom) {
  const s = STATUS[status] || ['b-neutral', 'info', status || '–'];
  return `<span class="badge ${s[0]}">${ic(s[1])}${esc(labelKustom || s[2])}</span>`;
}
export const labelStatus = s => (STATUS[s] || [0, 0, s])[2];

/* ----------------------------- Toast ----------------------------- */
export function toast(pesan, jenis = 'ok', ms = 3600) {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const ikon = { ok: 'check_circle', bad: 'error', warn: 'warning', info: 'info' }[jenis] || 'info';
  const el = document.createElement('div');
  el.className = 'toast ' + jenis;
  el.innerHTML = ic(ikon) + `<div>${esc(pesan)}</div>`;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, ms);
}
export const galat = e => toast((e && (e.msg || e.message)) || 'Terjadi kesalahan.', 'bad', 5200);

/* ----------------------------- Modal ----------------------------- */
export function modal({ judul = '', sub = '', isi = '', kaki = '', ukuran = '', tutupLuar = true, onTutup } = {}) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${ukuran}" role="dialog" aria-modal="true" aria-label="${esc(judul)}">
    <div class="modal-h"><div><h2 class="h-lg">${esc(judul)}</h2>${sub ? `<div class="muted small mt-8">${sub}</div>` : ''}</div>
    <button class="btn icon ghost" data-tutup aria-label="Tutup">${ic('close')}</button></div>
    <div class="modal-b">${isi}</div>${kaki ? `<div class="modal-f">${kaki}</div>` : ''}</div>`;
  const tutup = () => { ov.remove(); document.removeEventListener('keydown', esc_); onTutup && onTutup(); };
  const esc_ = e => { if (e.key === 'Escape') tutup(); };
  ov.addEventListener('click', e => { if ((tutupLuar && e.target === ov) || e.target.closest('[data-tutup]')) tutup(); });
  document.addEventListener('keydown', esc_);
  document.body.appendChild(ov);
  const f = ov.querySelector('input, select, textarea');
  if (f) setTimeout(() => f.focus(), 50);
  return { el: ov.querySelector('.modal'), ov, tutup };
}

export function konfirmasi({ judul = 'Konfirmasi', pesan = '', ya = 'Ya', tidak = 'Batal', bahaya = false, input = null }) {
  return new Promise(res => {
    const m = modal({
      judul, isi: `<p class="muted" style="margin:0 0 12px">${pesan}</p>${input ? `<div class="field"><label>${esc(input.label)}</label><textarea class="input" id="kf-in" placeholder="${esc(input.placeholder || '')}" maxlength="500"></textarea></div>` : ''}`,
      kaki: `<button class="btn ghost" data-tutup>${esc(tidak)}</button><button class="btn ${bahaya ? 'red' : ''}" id="kf-ya">${esc(ya)}</button>`,
      onTutup: () => res(null)
    });
    m.el.querySelector('#kf-ya').onclick = () => {
      const v = input ? m.el.querySelector('#kf-in').value.trim() : true;
      if (input && input.wajib && !v) { m.el.querySelector('#kf-in').classList.add('err'); return; }
      m.ov.remove(); res(v === '' ? true : v);
    };
  });
}

/** Tombol sibuk: tampilkan spinner selama promise berjalan. */
export async function sibuk(btn, fn) {
  if (!btn) return fn();
  const asli = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin w"></span>' + (btn.dataset.sibuk ? esc(btn.dataset.sibuk) : '');
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = asli; }
}

export function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export const idle = fn => (window.requestIdleCallback || (f => setTimeout(f, 300)))(fn);

/* ----------------------------- Pemuat skrip/CSS CDN (lazy, sekali) ----------------------------- */
const _muat = {};
export function muatSkrip(urls, cekGlobal) {
  urls = Array.isArray(urls) ? urls : [urls];
  const key = urls.join('|');
  if (_muat[key]) return _muat[key];
  _muat[key] = (async () => {
    if (cekGlobal && window[cekGlobal]) return window[cekGlobal];
    let err;
    for (const u of urls) {
      try {
        await new Promise((ok, gagal) => {
          const s = document.createElement('script');
          s.src = u; s.async = true; s.crossOrigin = 'anonymous';
          s.onload = ok; s.onerror = () => { s.remove(); gagal(new Error('Gagal memuat ' + u)); };
          document.head.appendChild(s);
        });
        return cekGlobal ? window[cekGlobal] : true;
      } catch (e) { err = e; }
    }
    delete _muat[key];
    throw err;
  })();
  return _muat[key];
}
export function muatCss(url) {
  if (document.querySelector(`link[href="${url}"]`)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = url; l.crossOrigin = 'anonymous';
  document.head.appendChild(l);
}
export const LIB = {
  chart: () => muatSkrip(['https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js', 'https://unpkg.com/chart.js@4.4.1/dist/chart.umd.min.js'], 'Chart'),
  leaflet: async () => { muatCss('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'); return muatSkrip(['https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'], 'L'); },
  xlsx: () => muatSkrip(['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', 'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'], 'XLSX'),
  pdf: async () => {
    await muatSkrip(['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js'], 'jspdf');
    await muatSkrip(['https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js', 'https://unpkg.com/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js']);
    return window.jspdf;
  }
};

/* ----------------------------- Berkas ----------------------------- */
export function bacaBerkas(file) {
  return new Promise((ok, gagal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = gagal; r.readAsDataURL(file); });
}
/** Gambar dikompres (maks sisi `maks` px, JPEG). PDF dikirim apa adanya. Batas 5 MB. */
export async function siapkanUnggahan(file, maks = 1600) {
  const MAX = 5 * 1024 * 1024;
  if (!/^(image\/(jpeg|png)|application\/pdf)$/.test(file.type)) throw new Error('Hanya JPG, PNG, atau PDF.');
  if (file.type === 'application/pdf') {
    if (file.size > MAX) throw new Error('Ukuran PDF maksimal 5 MB.');
    return { nama: file.name, mime: file.type, b64: await bacaBerkas(file), ukuran: file.size };
  }
  const url = await bacaBerkas(file);
  const img = await new Promise((ok, gagal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = gagal; i.src = url; });
  const s = Math.min(1, maks / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const b64 = c.toDataURL('image/jpeg', 0.82);
  const ukuran = Math.round(b64.length * 0.75);
  if (ukuran > MAX) throw new Error('Gambar terlalu besar setelah dikompres.');
  return { nama: file.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', b64, ukuran };
}
export const ukuranTeks = b => b > 1048576 ? desimal(b / 1048576, 1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
export function unduhDataUrl(dataUrl, nama) {
  const a = document.createElement('a'); a.href = dataUrl; a.download = nama; document.body.appendChild(a); a.click(); a.remove();
}
export function unduhTeks(teks, nama, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['﻿' + teks], { type: mime }));
  unduhDataUrl(url, nama); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Sparkline SVG kecil (tanpa pustaka). */
export function sparkline(nilai, warna) {
  const v = (nilai || []).map(x => x === null ? null : Number(x));
  const ada = v.filter(x => x !== null);
  if (ada.length < 2) return '<span class="faint">–</span>';
  const min = Math.min(...ada), max = Math.max(...ada), w = 88, h = 26, r = (max - min) || 1;
  const pts = v.map((x, i) => x === null ? null : [i * (w / (v.length - 1)), h - 3 - ((x - min) / r) * (h - 6)]).filter(Boolean);
  const naik = ada[ada.length - 1] >= ada[0];
  const c = warna || (naik ? '#16A34A' : '#DC2626');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Tren ${naik ? 'naik' : 'turun'}"><polyline fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${pts.map(p => p.join(',')).join(' ')}"/></svg>`;
}

/** Ring skor SVG. */
export function ringSkor(skor, warna, label = 'SKOR MIRIP') {
  const r = 52, k = 2 * Math.PI * r, p = Math.max(0, Math.min(1, Number(skor) || 0));
  return `<div class="ring"><svg width="120" height="120"><circle cx="60" cy="60" r="${r}" fill="none" stroke="#EEF1F7" stroke-width="10"/>
  <circle cx="60" cy="60" r="${r}" fill="none" stroke="${warna}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${k * p} ${k}"/></svg>
  <div class="isi"><b>${desimal(skor, 2)}</b><small>${esc(label)}</small></div></div>`;
}

export const kosong = (pesan, ikon = 'inbox') => `<div class="empty">${ic(ikon)}${esc(pesan)}</div>`;
export const skeleton = (n = 4, h = 18) => Array.from({ length: n }, () => `<div class="sk" style="height:${h}px;margin:10px 0"></div>`).join('');

export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371008.8, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
