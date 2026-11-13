/* =====================================================================
   admin/shell.js — Kerangka panel admin (PRD 7.2): sidebar navy dengan
   menu berikon, item aktif pil biru, kartu motivasi, bilah atas, lencana
   jumlah antrean (Tinjauan, Pengajuan, Lembur, Perangkat).
   ===================================================================== */
import { pasangRouter, prefetchRute } from '../core/router.js';
import { esc, ic, avatar, idle } from '../core/util.js';
import { api, swr, prefetch, LS } from '../core/api.js';
import { keluar } from '../auth.js';

export const MENU = [
  ['/ringkasan', 'space_dashboard', 'Ringkasan'], ['/presensi', 'fingerprint', 'Presensi'], ['/tinjauan', 'fact_check', 'Tinjauan', 'tinjauan'],
  ['/pegawai', 'badge', 'Pegawai', 'perangkat'], ['/dinas', 'luggage', 'Penugasan Dinas'], ['/pengajuan', 'assignment_ind', 'Pengajuan', 'pengajuan'],
  ['/lembur', 'more_time', 'Lembur', 'lembur'], ['/lokasi', 'pin_drop', 'Lokasi & Jadwal'], ['/laporan', 'bar_chart', 'Laporan'],
  ['/pengaturan', 'tune', 'Pengaturan'], ['/audit', 'policy', 'Log Audit']
];
const MODUL = {
  '/ringkasan': () => import('./ringkasan.js'), '/presensi': () => import('./presensi.js'), '/tinjauan': () => import('./tinjauan.js'),
  '/pegawai': () => import('./pegawai.js'), '/dinas': () => import('./dinas.js'), '/pengajuan': () => import('./pengajuan.js'),
  '/lembur': () => import('./lembur.js'), '/lokasi': () => import('./lokasi.js'), '/laporan': () => import('./laporan.js'),
  '/pengaturan': () => import('./pengaturan.js'), '/audit': () => import('./audit.js')
};

let badge = {};
const dengarBadge = new Set();
export function perbaruiBadge() {
  return api('admin.badge', {}).then(b => { badge = b; dengarBadge.forEach(f => f(b)); return b; }).catch(() => badge);
}
export const ambilBadge = () => badge;

export function mulaiAdmin(root, s) {
  document.body.className = 'mode-admin';
  const p = s.profil || {};
  root.innerHTML = `
  <div class="a-app" id="a-app">
    <aside class="sidebar" aria-label="Menu admin">
      <div class="sb-brand"><span class="logo">${ic('fingerprint')}</span><div><b>PRESENSI<br>PEGAWAI</b><small id="sb-inst">${esc((LS.get('pp_cfg') || { data: {} }).data.instansi || 'Panel Admin')}</small></div></div>
      <nav class="sb-nav">${MENU.map(m => `<a href="#${m[0]}" data-r="${m[0]}">${ic(m[1])}<span>${m[2]}</span>${m[3] ? `<span class="count" data-b="${m[3]}" hidden></span>` : ''}</a>`).join('')}</nav>
      <div class="sb-motiv">${ic('emoji_events', 'fill')}<p id="sb-motiv">“Disiplin hari ini, prestasi esok hari.”</p></div>
      <div class="sb-user">${avatar(p.nama)}<div style="min-width:0"><b class="ellipsis" style="max-width:140px">${esc(p.nama || p.email)}</b><small>${s.peran && s.peran.darurat ? 'Akses darurat' : 'Admin Kepegawaian'}</small></div>
        <button id="sb-keluar" aria-label="Keluar" title="Keluar">${ic('logout')}</button></div>
    </aside>
    <div class="a-main">
      <header class="topbar">
        <button class="btn icon ghost hamb" id="tb-hamb" aria-label="Buka menu">${ic('menu')}</button>
        <span class="sistem">${ic('verified_user', 'fill')}<span class="teks">SISTEM MONITORING PRESENSI AKTIF</span></span>
        <div class="kanan">
          ${s.peran && s.peran.pegawai ? `<button class="btn ghost sm" id="tb-pegawai">${ic('smartphone', 'sm')} Mode pegawai</button>` : ''}
          <a class="btn icon ghost" href="#/tinjauan" aria-label="Antrean tinjauan" style="position:relative">${ic('notifications')}<span class="count red" id="tb-bell" hidden style="position:absolute;top:-6px;right:-6px"></span></a>
          ${avatar(p.nama)}
        </div>
      </header>
      <main class="a-page" id="a-view"></main>
      <footer class="a-foot" id="a-foot">Sumber: Sistem Presensi Pegawai</footer>
    </div>
  </div>`;
  const app = root.querySelector('#a-app');
  const links = root.querySelectorAll('.sb-nav a');
  links.forEach(a => {
    a.addEventListener('pointerenter', () => prefetchRute(a.dataset.r));
    a.addEventListener('click', () => app.classList.remove('laci'));
  });
  root.querySelector('#tb-hamb').onclick = () => app.classList.toggle('laci');
  app.addEventListener('click', e => { if (app.classList.contains('laci') && !e.target.closest('.sidebar') && !e.target.closest('#tb-hamb')) app.classList.remove('laci'); });
  root.querySelector('#sb-keluar').onclick = () => keluar(false);
  const tp = root.querySelector('#tb-pegawai'); if (tp) tp.onclick = () => import('../app.js').then(m => m.gantiMode('pegawai'));

  const tampilBadge = b => {
    root.querySelectorAll('[data-b]').forEach(el => { const n = b[el.dataset.b] || 0; el.hidden = !n; el.textContent = n; el.classList.toggle('red', el.dataset.b === 'tinjauan' && n > 0); });
    const tot = (b.tinjauan || 0) + (b.pengajuan || 0);
    const bell = root.querySelector('#tb-bell'); bell.hidden = !tot; bell.textContent = tot;
  };
  dengarBadge.add(tampilBadge);

  pasangRouter({
    el: root.querySelector('#a-view'), awal: '/ringkasan', routes: MODUL,
    onNavigasi: j => links.forEach(a => a.classList.toggle('on', a.dataset.r === j))
  });

  // Boot admin: badge + motivasi; lalu pra-muat menu & data yang sering dibuka
  swr('boot', {}, d => {
    if (d.motivasi) root.querySelector('#sb-motiv').textContent = '“' + d.motivasi + '”';
    if (d.instansi) root.querySelector('#sb-inst').textContent = d.instansi;
    if (d.badgeAdmin) { badge = d.badgeAdmin; tampilBadge(badge); }
  }, { onError: () => {} });
  idle(() => {
    Object.keys(MODUL).forEach(prefetchRute);
    prefetch('admin.ref.list', {});
    prefetch('admin.pegawai.list', {});
  });
  const t = setInterval(() => { if (document.visibilityState === 'visible') perbaruiBadge(); }, 60000);
  window.addEventListener('beforeunload', () => clearInterval(t));
}

/** Kirim antrean email di latar setelah aksi admin (tidak menahan UI). */
export function prosesNotif() { setTimeout(() => api('admin.notif.proses', {}).catch(() => {}), 1200); }
