/* =====================================================================
   app.js — Titik masuk PWA: service worker, status online, SSO kembali,
   lalu memilih tampilan Pegawai (ponsel) atau Admin (desktop).
   ===================================================================== */
import { sesi, setOnSesiHabis, LS, DEMO } from './core/api.js';
import { toast, esc } from './core/util.js';
import { renderLogin, tukarSso } from './auth.js';

const root = document.getElementById('app');
let aktif = false;

function daftarSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Versi baru tersedia. Muat ulang untuk memperbarui.', 'info', 8000);
      });
    });
  }).catch(() => {});
}

function pantauOnline() {
  const bar = () => {
    let el = document.getElementById('offline');
    if (navigator.onLine) { el && el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'offline'; el.textContent = 'Anda sedang offline — data ditampilkan dari cache.'; document.body.prepend(el); }
  };
  window.addEventListener('online', bar); window.addEventListener('offline', bar); bar();
}

function tampilLogin(pesan, jenis) {
  aktif = false;
  renderLogin(root, { pesan, jenis, onMasuk: masukAplikasi });
}

export async function masukAplikasi() {
  const s = sesi.data;
  if (!s || !sesi.token) return tampilLogin();
  aktif = true;
  const peran = s.peran || {};
  let mode = LS.get('pp_mode');
  if (!mode) mode = (peran.admin && (!peran.pegawai || window.innerWidth >= 960)) ? 'admin' : 'pegawai';
  if (mode === 'admin' && !peran.admin) mode = 'pegawai';
  if (mode === 'pegawai' && !peran.pegawai) mode = 'admin';
  try {
    if (mode === 'admin') (await import('./admin/shell.js')).mulaiAdmin(root, s);
    else (await import('./pegawai/shell.js')).mulaiPegawai(root, s);
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="splash"><span class="logo"><span class="ic">wifi_off</span></span><div>Aplikasi gagal dimuat.</div><button class="btn" onclick="location.reload()">Muat ulang</button><small style="opacity:.6">${esc(e.message)}</small></div>`;
  }
}

/** Ganti tampilan admin ⇄ pegawai (untuk admin yang juga pegawai). */
export function gantiMode(mode) {
  LS.set('pp_mode', mode);
  location.hash = '';
  location.reload();
}

async function mulai() {
  daftarSW();
  pantauOnline();
  setOnSesiHabis(e => { sesi.hapus(); tampilLogin(e.msg || 'Sesi berakhir. Silakan masuk kembali.', 'warn'); });

  // Masuk di tab/jendela lain (mis. Custom Tab dari PWA terpasang) → ikut masuk di sini
  window.addEventListener('storage', e => { if (e.key === 'pp_sesi' && e.newValue && !aktif) masukAplikasi(); });

  const m = location.hash.match(/[#&]sso=([^&]+)/);
  if (m && !DEMO) {
    history.replaceState(null, '', location.pathname + location.search);
    root.innerHTML = `<div class="splash"><span class="logo"><span class="ic">fingerprint</span></span><div class="spin w"></div><div>Memverifikasi akun & perangkat…</div></div>`;
    try { await tukarSso(decodeURIComponent(m[1])); }
    catch (e) { return tampilLogin(e.msg || e.message, e.code === 'PERANGKAT_MENUNGGU' || e.code === 'PENDING_APPROVAL' ? 'warn' : 'bad'); }
  }
  if (!sesi.token) return tampilLogin();
  masukAplikasi();
}

mulai();
