/* =====================================================================
   pegawai/shell.js — Kerangka aplikasi pegawai: bilah atas, navigasi
   bawah (Beranda, Riwayat, Pengajuan, Profil), router halaman lazy.
   ===================================================================== */
import { pasangRouter, prefetchRute } from '../core/router.js';
import { ic, idle } from '../core/util.js';
import { segarkan, dengar, perbaruiProfilSesi } from './data.js';

const MENU = [
  ['/beranda', 'home', 'Beranda'], ['/riwayat', 'calendar_month', 'Riwayat'],
  ['/pengajuan', 'assignment', 'Pengajuan'], ['/profil', 'person', 'Profil']
];

export function mulaiPegawai(root, sesiData) {
  document.body.className = 'mode-pegawai';
  root.innerHTML = `
  <div class="m-app">
    <header class="m-top">
      <span class="logo">${ic('fingerprint')}</span>
      <div><b id="m-judul">Beranda</b><small>Presensi Pegawai</small></div>
      <div class="aksi">
        <a class="ibtn" href="#/pengajuan" aria-label="Notifikasi pengajuan">${ic('notifications')}<span class="pip" id="m-pip" hidden></span></a>
        <a class="ibtn solid" href="#/profil" aria-label="Profil">${ic('person', 'fill')}</a>
      </div>
    </header>
    <main id="m-view" aria-live="polite"></main>
    <nav class="m-nav" aria-label="Navigasi utama">
      ${MENU.map(m => `<a href="#${m[0]}" data-r="${m[0]}">${ic(m[1])}<span>${m[2]}</span>${m[0] === '/pengajuan' ? '<span class="count" id="m-bdg" hidden></span>' : ''}</a>`).join('')}
    </nav>
  </div>`;
  const nav = root.querySelectorAll('.m-nav a');
  nav.forEach(a => {
    const r = a.dataset.r;
    a.addEventListener('pointerenter', () => prefetchRute(r));
    a.addEventListener('touchstart', () => prefetchRute(r), { passive: true });
  });
  pasangRouter({
    el: root.querySelector('#m-view'), awal: '/beranda',
    routes: {
      '/beranda': () => import('./beranda.js'),
      '/riwayat': () => import('./riwayat.js'),
      '/pengajuan': () => import('./pengajuan.js'),
      '/profil': () => import('./profil.js')
    },
    onNavigasi: jalur => {
      nav.forEach(a => a.classList.toggle('on', a.dataset.r === jalur));
      const m = MENU.find(x => x[0] === jalur);
      root.querySelector('#m-judul').textContent = m ? m[2] : 'Presensi';
    }
  });
  dengar(d => {
    const n = (d.badge && d.badge.pengajuan) || 0;
    const b = root.querySelector('#m-bdg'); if (b) { b.hidden = !n; b.textContent = n; }
    const p = root.querySelector('#m-pip'); if (p) p.hidden = !n;
    perbaruiProfilSesi();
  });
  segarkan();
  // Pra-muat halaman lain & mesin wajah saat senggang → navigasi & kamera terasa instan
  idle(() => { MENU.forEach(m => prefetchRute(m[0])); import('./presensi.js').then(m => m.pramuatMesin && m.pramuatMesin()).catch(() => {}); });
}
