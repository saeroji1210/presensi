/* =====================================================================
   router.js — Router hash ringan dengan modul halaman lazy (import()).
   Modul halaman: export async function render(el, params) → fungsi bersih-bersih (opsional)
   Pratinjau: prefetchRute() memuat modul saat kursor/jempol mendekati menu.
   ===================================================================== */
let rute = {}, wadah = null, bersih = null, bawaan = '', onPindah = () => {}, token = 0;
const cacheModul = {};

export function pasangRouter({ routes, el, awal, onNavigasi }) {
  rute = routes; wadah = el; bawaan = awal; onPindah = onNavigasi || (() => {});
  window.onhashchange = jalan;
  jalan();
}

export function lepasRouter() { window.onhashchange = null; if (bersih) { try { bersih(); } catch { /* abaikan */ } bersih = null; } }

export function params() {
  const h = location.hash.slice(1);
  const i = h.indexOf('?');
  return Object.fromEntries(new URLSearchParams(i > -1 ? h.slice(i + 1) : ''));
}
export function jalurSaatIni() { const h = location.hash.slice(1) || bawaan; return h.split('?')[0]; }

export function pergi(jalur) { if (location.hash !== '#' + jalur) location.hash = jalur; else jalan(); }

function muat(jalur) {
  const loader = rute[jalur];
  if (!loader) return null;
  return cacheModul[jalur] || (cacheModul[jalur] = loader().catch(e => { delete cacheModul[jalur]; throw e; }));
}
export function prefetchRute(jalur) { try { muat(jalur); } catch { /* abaikan */ } }

async function jalan() {
  const jalur = jalurSaatIni();
  if (!rute[jalur]) { location.replace('#' + bawaan); return; }
  const saya = ++token;
  onPindah(jalur);
  if (bersih) { try { bersih(); } catch { /* abaikan */ } bersih = null; }
  let mod;
  try { mod = await muat(jalur); }
  catch (e) {
    wadah.innerHTML = `<div class="empty"><span class="ic">wifi_off</span>Halaman gagal dimuat. Periksa koneksi lalu <a href="javascript:location.reload()">muat ulang</a>.</div>`;
    return;
  }
  if (saya !== token) return;
  // Wadah baru per halaman: callback async halaman lama menulis ke elemen yang sudah terlepas.
  const el = document.createElement('div');
  el.className = 'halaman';
  wadah.replaceChildren(el);
  window.scrollTo(0, 0);
  try { const b = await mod.render(el, params()); if (saya === token) bersih = b || null; else if (b) b(); }
  catch (e) {
    console.error(e);
    el.innerHTML = `<div class="empty"><span class="ic">error</span>${String(e.msg || e.message || e).replace(/</g, '&lt;')}</div>`;
  }
}
