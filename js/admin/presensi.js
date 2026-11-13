/* =====================================================================
   admin/presensi.js — Presensi Hari Ini: penghitung, filter (cari, jenis,
   unit, status, tanggal), tabel langsung (diperbarui 30 dtk), panel detail
   kanan (foto audit, peta, jarak, akurasi, perangkat, skor, uji kehidupan).
   ===================================================================== */
import { swr, api } from '../core/api.js';
import { esc, ic, avatar, badge, jamTitik, jarakTeks, desimal, galat, debounce, unduhDataUrl, hariIniLokal } from '../core/util.js';
import { pgHead, opsi, tabel, eksporExcel } from './ui.js';
import { petaAudit, tabelSampel, kartuFlag } from './detail.js';

export async function render(el) {
  let tanggal = hariIniLokal(), jenis = '', unit = '', status = '', q = '', data = null, pilih = null, tm = null, tbl = null;

  el.innerHTML = `${pgHead('Presensi hari ini', '<span id="ph-upd">Memuat…</span>', `<button class="btn ghost" id="ph-xls">${ic('download')} Ekspor data</button><a class="btn ghost" href="#/pengaturan">${ic('schedule')} Jendela presensi</a>`)}
    <div class="kpi-lite" id="ph-kpi">${'<div class="sk" style="height:76px;border-radius:16px"></div>'.repeat(4)}</div>
    <div class="card p-16 mb-16 no-print"><div class="toolbar" style="margin:0">
      <div class="input-ic cari">${ic('search')}<input class="input" id="ph-q" placeholder="Cari nama atau NIP pegawai…"></div>
      <div class="seg" id="ph-jenis"></div>
      <select class="input" id="ph-unit"><option value="">Semua unit kerja</option></select>
      <select class="input" id="ph-status">${opsi([['HADIR', 'Hadir'], ['TERLAMBAT', 'Terlambat'], ['BELUM_PRESENSI', 'Belum presensi'], ['DINAS', 'Dinas'], ['IZIN', 'Izin'], ['SAKIT', 'Sakit'], ['CUTI', 'Cuti']], '', 'Semua status')}</select>
      <input type="date" class="input" id="ph-tgl" value="${tanggal}" max="${tanggal}">
      <button class="btn ghost" id="ph-muat">${ic('refresh')} Muat ulang</button></div></div>
    <div class="g-2-1"><div id="ph-tabel"></div><aside class="card detail p-16" id="ph-detail"><div class="empty">${ic('touch_app')}Pilih baris untuk melihat detail presensi, foto audit, dan peta.</div></aside></div>`;

  const $ = s => el.querySelector(s);
  $('#ph-q').oninput = debounce(e => { q = e.target.value.toLowerCase(); gambarTabel(); }, 150);
  $('#ph-unit').onchange = e => { unit = e.target.value; gambarTabel(); };
  $('#ph-status').onchange = e => { status = e.target.value; gambarTabel(); };
  $('#ph-tgl').onchange = e => { tanggal = e.target.value; data = null; muat(); };
  $('#ph-muat').onclick = () => muat();
  $('#ph-xls').onclick = () => eksporExcel('Presensi ' + tanggal, [{ k: 'nip', label: 'NIP' }, { k: 'nama', label: 'Nama' }, { k: 'unit', label: 'Unit' }, { k: 'jenis', label: 'Jenis' }, { k: 'jm', label: 'Masuk' }, { k: 'jp', label: 'Pulang' }, { k: 'status', label: 'Status', tipe: 'status' }, { k: 'jarakM', label: 'Jarak masuk (m)' }, { k: 'skorM', label: 'Skor wajah' }],
    saring().map(r => ({ ...r, jm: r.masuk ? r.masuk.jam : '', jp: r.pulang ? r.pulang.jam : '', jarakM: r.masuk ? r.masuk.jarak : '', skorM: r.masuk ? r.masuk.skor : '' })), 'Presensi_' + tanggal).catch(galat);

  const saring = () => (data ? data.list : []).filter(r =>
    (!q || (r.nama + ' ' + r.nip).toLowerCase().includes(q)) && (!jenis || r.jenis === jenis) && (!unit || r.unit === unit) && (!status || r.status === status));

  function gambarRingkas(d) {
    const h = d.hitung;
    $('#ph-upd').innerHTML = `${ic('sync', 'sm')} Langsung · diperbarui ${esc(String(d.diperbarui).replace(/:/g, '.'))} WIB`;
    $('#ph-kpi').innerHTML = [['login', 'Masuk', h.masuk, 'var(--ok)', 'var(--ok-tint)'], ['logout', 'Pulang', h.pulang, 'var(--primary)', 'var(--primary-tint)'],
      ['pending_actions', 'Perlu ditinjau', h.ditinjau, 'var(--wait)', 'var(--wait-tint)'], ['cancel', 'Percobaan ditolak', h.ditolak, 'var(--bad)', 'var(--bad-tint)']]
      .map(([i, l, n, c, bg]) => `<div class="kl"><span class="bulat" style="background:${bg};color:${c}">${ic(i)}</span><div><b>${n}</b><small>${l}</small></div></div>`).join('');
    const harian = d.list.filter(r => r.jenis === 'HARIAN').length, dinas = d.list.filter(r => r.jenis === 'DINAS').length;
    $('#ph-jenis').innerHTML = [['', 'Semua (' + d.list.length + ')'], ['HARIAN', 'Harian (' + harian + ')'], ['DINAS', 'Dinas (' + dinas + ')']].map(([v, l]) => `<button class="${jenis === v ? 'on' : ''}" data-j="${v}">${l}</button>`).join('');
    $('#ph-jenis').querySelectorAll('[data-j]').forEach(b => b.onclick = () => { jenis = b.dataset.j; gambarRingkas(d); gambarTabel(); });
    const units = [...new Set(d.list.map(r => r.unit).filter(Boolean))].sort();
    const su = $('#ph-unit'); const v = su.value; su.innerHTML = opsi(units, v, 'Semua unit kerja');
  }

  const sel = p => p ? `<div class="nowrap"><b class="tnum">${jamTitik(p.jam)}</b> <span title="${esc(p.status)}">${ic(p.status === 'VALID' ? 'check_circle' : 'pending', 'sm fill')}</span></div>` : '<span class="faint">—</span>';
  function gambarTabel() {
    const baris = saring();
    const kolom = [
      { k: 'nama', label: 'Pegawai', render: r => `<div class="row" style="min-width:210px">${avatar(r.nama)}<div style="min-width:0"><div class="nm ellipsis" style="max-width:190px">${esc(r.nama)}</div><div class="sub">NIP ${esc(r.nip || '-')}</div></div></div>` },
      { k: 'unit', label: 'Unit' },
      { k: 'jenis', label: 'Jenis', render: r => `<span class="badge ${r.jenis === 'DINAS' ? 'b-duty' : 'b-info'}">${r.jenis === 'DINAS' ? 'Dinas' : 'Harian'}</span>` },
      { k: 'masukJam', label: 'Masuk', render: r => `<span style="color:${r.terlambat > 0 ? 'var(--late)' : 'inherit'}">${sel(r.masuk)}</span>` },
      { k: 'pulangJam', label: 'Pulang', render: r => sel(r.pulang) },
      { k: 'lokasi', label: 'Lokasi', render: r => r.masuk ? `<div class="ellipsis" style="max-width:140px" title="${esc(r.masuk.lokasi)}">${esc(r.masuk.lokasi)}</div><div class="sub" style="color:${r.masuk.jarak > 150 ? 'var(--bad)' : ''}">${esc(jarakTeks(r.masuk.jarak))}</div>` : '<span class="faint">—</span>' },
      { k: 'skor', label: 'Skor', tipe: 'n', render: r => r.masuk ? desimal(r.masuk.skor, 2) : '–' },
      { k: 'status', label: 'Status', render: r => badge(r.status || 'BELUM_PRESENSI', r.status === 'TERLAMBAT' ? `Terlambat ${r.terlambat} mnt` : undefined) + (r.ditolak ? ` <span class="badge b-bad" title="Percobaan ditolak">${r.ditolak}×</span>` : '') }
    ];
    baris.forEach(r => { r.masukJam = r.masuk ? r.masuk.jam : 'zz'; r.pulangJam = r.pulang ? r.pulang.jam : 'zz'; r.skor = r.masuk ? r.masuk.skor : -1; });
    if (tbl) tbl.perbarui(baris);
    else tbl = tabel($('#ph-tabel'), { kolom, baris, per: 20, kosong: 'Tidak ada pegawai sesuai filter.', onKlik: r => bukaDetail(r), pilih: r => pilih && r.id === pilih.id });
  }

  async function bukaDetail(r) {
    pilih = r; tbl && tbl.gambar();
    const p = r.masuk || r.pulang;
    const box = $('#ph-detail');
    if (!p) { box.innerHTML = `<div class="row">${avatar(r.nama, 'lg')}<div><b>${esc(r.nama)}</b><div class="muted small">${esc(r.unit)}</div></div></div><hr class="divider">${badge(r.status || 'BELUM_PRESENSI')}<p class="muted">Belum ada presensi valid pada tanggal ini.</p>`; return; }
    box.innerHTML = '<div class="sk" style="height:260px"></div><div class="sk" style="height:200px;margin-top:12px"></div>';
    try {
      const pilihTipe = r.masuk && r.pulang ? [r.masuk, r.pulang] : [p];
      let aktifId = p.id;
      const tampil = async id => {
        const x = await api('admin.presensi.detail', { id, tanggal: data.tanggal, referensi: false });
        if (pilih !== r) return;
        box.innerHTML = `<div class="row between"><div><b style="font-size:16px">Detail presensi ${x.tipe === 'MASUK' ? 'masuk' : 'pulang'}</b><div class="muted small">${esc(x.pegawai.nama)} · ${esc(x.pegawai.jabatan || x.pegawai.unit)}</div></div><button class="btn icon ghost sm" id="dt-x">${ic('close')}</button></div>
          ${pilihTipe.length > 1 ? `<div class="seg mt-12">${pilihTipe.map(t => `<button class="${t.id === id ? 'on' : ''}" data-t="${t.id}">${t.tipe === 'MASUK' ? 'Masuk' : 'Pulang'} ${jamTitik(t.jam)}</button>`).join('')}</div>` : ''}
          <div class="foto-box mt-12">${x.foto ? `<img src="${x.foto}" alt="Foto audit presensi">` : `${ic('no_photography', 'xl')}`}<span class="tag">${esc(x.jenis)} · ${esc(String(x.jam).replace(/:/g, '.'))} ${esc(x.zona)}</span></div>
          <div class="row between mt-16"><b class="small">Verifikasi geofence</b>${badge(x.jarak !== null && x.target[0] && x.jarak <= x.target[0].radius ? 'VALID' : 'DITOLAK', x.jarak !== null && x.target[0] ? (x.jarak <= x.target[0].radius ? 'Dalam radius' : 'Di luar radius') + ` (${x.target[0].radius} m)` : 'Tanpa GPS')}</div>
          <div class="peta mt-8" id="dt-peta"></div>
          <div class="kv mt-16"><div><small>Waktu server</small><b>${esc(String(x.jam).replace(/:/g, '.'))} ${esc(x.zona)}</b></div><div><small>Akurasi GPS</small><b>${x.akurasi !== null ? '±' + Math.round(x.akurasi) + ' m' : '–'}</b></div>
            <div><small>Jarak ke titik acuan</small><b>${esc(jarakTeks(x.jarak))}</b></div><div><small>Perangkat</small><b>${x.perangkatCocok ? esc(x.pegawai.perangkat || 'Terdaftar') : '<span style="color:var(--bad)">Tidak cocok</span>'}</b></div>
            <div><small>Skor wajah</small><b>${desimal(x.skor, 2)} <span class="faint">(min ${desimal(x.ambang.valid, 2)})</span></b></div><div><small>Uji kehidupan</small><b>${x.liveness.l ? ic('check', 'sm') + ' Lulus' : 'Gagal'}${x.liveness.p !== null && x.liveness.p !== undefined ? ' · pasif ' + desimal(x.liveness.p, 2) : ''}</b></div></div>
          <div class="note ${x.status === 'VALID' ? 'ok' : x.status === 'DITOLAK' ? 'bad' : 'warn'} mt-16">${ic(x.status === 'VALID' ? 'verified' : 'info')}<div><b>${esc(x.status.replace('_', ' '))}</b>${x.flags.length ? '<br>' + esc(x.flags.join(', ')) : ''}${x.catatan ? '<br><small>' + esc(x.catatan) + '</small>' : ''}</div></div>
          ${kartuFlag(x.kodeFlag)}
          <details class="mt-12"><summary class="small semi">Sampel GPS (${x.sampel.length})</summary><div class="mt-8">${tabelSampel(x)}</div></details>
          <div class="row mt-16">${x.foto ? `<button class="btn ghost grow" id="dt-foto">${ic('download')} Unduh foto</button>` : ''}${x.status === 'PERLU_DITINJAU' ? `<a class="btn grow" href="#/tinjauan">${ic('fact_check')} Tinjau</a>` : ''}</div>`;
        $('#dt-x').onclick = () => { pilih = null; tbl.gambar(); box.innerHTML = `<div class="empty">${ic('touch_app')}Pilih baris untuk melihat detail.</div>`; };
        box.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { aktifId = b.dataset.t; tampil(aktifId); });
        const f = $('#dt-foto'); if (f) f.onclick = () => unduhDataUrl(x.foto, `presensi_${x.pegawai.nip || ''}_${x.tanggal}_${x.tipe}.jpg`);
        petaAudit($('#dt-peta'), x);
      };
      await tampil(aktifId);
    } catch (e) { box.innerHTML = `<div class="note bad">${ic('error')}<div>${esc(e.msg || e.message)}</div></div>`; }
  }

  function muat() {
    return swr('admin.presensi.hariIni', { tanggal }, d => { data = d; gambarRingkas(d); gambarTabel(); }, { onError: e => galat(e) });
  }
  muat();
  tm = setInterval(() => { if (document.visibilityState === 'visible' && tanggal === hariIniLokal()) muat(); }, 30000);
  return () => clearInterval(tm);
}
