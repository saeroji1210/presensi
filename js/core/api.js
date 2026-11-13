/* =====================================================================
   api.js — Klien REST ke Google Apps Script (pola gas-pro-api + gas-scale-turbo)
   - POST text/plain (tanpa preflight CORS), respons JSON
   - Dedup permintaan baca yang sama selagi berjalan (in-flight)
   - Cache SWR: tampil instan dari memori/localStorage, segarkan di latar
   - Coba ulang dengan jeda acak (maks 3x) untuk galat jaringan/server sibuk
   - Jam server: selisih jam ponsel vs server disimpan untuk jam berjalan
   ===================================================================== */
import { idle } from './util.js';

const CFG = window.APP_CONFIG || {};
const qs = new URLSearchParams(location.search);
export const DEMO = qs.has('demo') || !CFG.GAS_URL || /XXXX|PASTE|ISI_URL/i.test(CFG.GAS_URL);

const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* penuh/privat */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* abaikan */ } }
};
export { LS };

export function deviceId() {
  let d = LS.get('pp_dv');
  if (!d) {
    d = (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''));
    LS.set('pp_dv', d);
  }
  return d;
}
export function infoPerangkat() {
  const ua = navigator.userAgent;
  const m = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/) || ua.match(/(iPhone|iPad)/);
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : 'Lainnya';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  return ((m ? m[1].trim() + ' · ' : '') + os + ' · ' + br).slice(0, 120);
}

/* ----------------------------- Sesi ----------------------------- */
export const sesi = {
  get data() { return LS.get('pp_sesi'); },
  get token() { const s = LS.get('pp_sesi'); return s && s.exp > Date.now() ? s.token : ''; },
  simpan(d) { LS.set('pp_sesi', d); },
  hapus() {
    LS.del('pp_sesi');
    Object.keys(localStorage).filter(k => k.startsWith('pp_c_')).forEach(k => LS.del(k));
    mem.clear();
  }
};
let onHabis = () => {};
export function setOnSesiHabis(fn) { onHabis = fn; }

/* ----------------------------- Jam server ----------------------------- */
let offset = LS.get('pp_off') || 0;
export const jamServer = () => new Date(Date.now() + offset);
function catatJam(srv, rtt) {
  if (!srv) return;
  offset = srv + rtt / 2 - Date.now();
  LS.set('pp_off', offset);
}

/* ----------------------------- Galat ----------------------------- */
export class ApiError extends Error {
  constructor(o) { super(o.msg || o.code || 'Galat'); this.code = o.code; this.msg = o.msg; this.data = o.data; }
}
const SESI_HABIS = ['UNAUTHENTICATED', 'SESI_KEDALUWARSA', 'SESI_DICABUT'];

/* ----------------------------- Inti ----------------------------- */
const inflight = new Map();
const mem = new Map();
const BACA = /^(boot|jam|ping|auth\.config|riwayat\.|pengajuan\.list|rekap\.|admin\.(dashboard|badge|presensi\.hariIni|presensi\.detail|tinjauan\.list|pegawai\.list|dinas\.list|pengajuan\.list|lembur\.list|berkas\.lihat|ref\.list|pengaturan\.get|laporan$|audit\.list))/;
const tidur = ms => new Promise(r => setTimeout(r, ms));

export async function api(a, d = {}, opt = {}) {
  const baca = BACA.test(a);
  const key = a + '|' + JSON.stringify(d);
  if (baca && inflight.has(key)) return inflight.get(key);
  const p = kirim(a, d, { retries: baca ? 3 : 0, ...opt });
  if (baca) { inflight.set(key, p); p.then(() => inflight.delete(key), () => inflight.delete(key)); }
  else p.then(() => invalidasi(opt.invalidasi), () => {});
  return p;
}

async function kirim(a, d, opt) {
  if (DEMO) {
    const { demoApi } = await import('../demo.js');
    try { return await demoApi(a, d); }
    catch (e) { if (e instanceof ApiError && SESI_HABIS.includes(e.code)) onHabis(e); throw e; }
  }
  const body = JSON.stringify({ a, t: sesi.token, dv: deviceId(), d });
  let n = 0;
  for (;;) {
    const t0 = performance.now();
    let j;
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), opt.timeout || 45000);
      const res = await fetch(CFG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, signal: ctl.signal, redirect: 'follow', cache: 'no-store' });
      clearTimeout(to);
      j = await res.json();
    } catch (e) {
      if (n < opt.retries) { n++; await tidur(400 * 2 ** n * (0.6 + Math.random() * 0.8)); continue; }
      throw new ApiError({ code: 'JARINGAN', msg: navigator.onLine ? 'Server tidak merespons. Coba lagi sebentar lagi.' : 'Anda sedang offline. Periksa koneksi internet.' });
    }
    catatJam(j.srv, performance.now() - t0);
    if (j.ok) return j.data;
    if ((j.code === 'SERVER_SIBUK' || j.code === 'GALAT_SERVER') && n < Math.max(opt.retries, j.code === 'SERVER_SIBUK' ? 3 : 0)) {
      n++; await tidur(500 * 2 ** n * (0.6 + Math.random() * 0.8)); continue;
    }
    const err = new ApiError(j);
    if (SESI_HABIS.includes(j.code)) onHabis(err);
    throw err;
  }
}

/** Beberapa panggilan baca dalam satu eksekusi server. */
export async function batch(calls) {
  const hasil = await api('batch', { calls });
  return hasil.map(h => { if (!h.ok) throw new ApiError(h); return h.data; });
}

/* ----------------------------- Cache SWR ----------------------------- */
const SIMPAN_LS = /^(boot|riwayat\.bulan|pengajuan\.list|admin\.(dashboard|badge|pegawai\.list|ref\.list|dinas\.list|pengaturan\.get))/;
const kunci = (a, d) => 'pp_c_' + a + '|' + JSON.stringify(d || {});

export function cache(a, d) {
  const k = kunci(a, d);
  return mem.get(k) || (SIMPAN_LS.test(a) ? LS.get(k) : null);
}
function simpanCache(a, d, data) {
  const k = kunci(a, d), v = { t: Date.now(), s: JSON.stringify(data), data };
  mem.set(k, v);
  if (SIMPAN_LS.test(a)) idle(() => LS.set(k, { t: v.t, s: v.s, data }));
  return v;
}

/**
 * Stale-while-revalidate: panggil onData segera dari cache (bila ada), lalu
 * ambil data segar; onData dipanggil lagi hanya bila datanya berubah.
 */
export function swr(a, d, onData, { ttl = 0, onError } = {}) {
  const c = cache(a, d);
  if (c) onData(c.data, { cache: true, umur: Date.now() - c.t });
  if (c && Date.now() - c.t < ttl) return Promise.resolve(c.data);
  return api(a, d).then(data => {
    const lama = c ? c.s : null;
    const baru = simpanCache(a, d, data);
    if (baru.s !== lama) onData(data, { cache: false });
    return data;
  }).catch(e => { if (onError) onError(e, !!c); else if (!c) throw e; });
}

/** Ambil (dengan cache memori TTL) tanpa callback. */
export async function ambil(a, d, ttl = 30000) {
  const c = cache(a, d);
  if (c && Date.now() - c.t < ttl) return c.data;
  const data = await api(a, d);
  simpanCache(a, d, data);
  return data;
}

/** Hapus cache berawalan tertentu (setelah aksi tulis). */
export function invalidasi(awalan) {
  if (!awalan) return;
  const list = Array.isArray(awalan) ? awalan : [awalan];
  const cocok = k => list.some(p => k.startsWith('pp_c_' + p));
  [...mem.keys()].filter(cocok).forEach(k => mem.delete(k));
  try { Object.keys(localStorage).filter(cocok).forEach(k => localStorage.removeItem(k)); } catch { /* abaikan */ }
}

/** Prefetch diam-diam (mengisi cache untuk navigasi instan). */
export function prefetch(a, d) {
  if (cache(a, d)) return;
  idle(() => api(a, d).then(data => simpanCache(a, d, data)).catch(() => {}));
}
