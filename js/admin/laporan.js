/* =====================================================================
   admin/laporan.js — Modul laporan (PRD 5.11): 6 laporan bertabel, filter
   (periode/rentang, unit, jenis presensi, status, cari), grafik tren
   keterlambatan 30 hari & jam lembur per unit, unduh Excel (SheetJS),
   PDF tabel + grafik (jsPDF AutoTable), dan PDF resmi berkop dari server.
   ===================================================================== */
import { api, swr, ambil } from '../core/api.js';
import { esc, ic, galat, toast, sibuk, tgl, angka, rupiah, desimal, unduhDataUrl, bulanNama, debounce } from '../core/util.js';
import { pgHead, opsi, opsiBulan, bulanIni, tabel, chart, eksporExcel, eksporPdf } from './ui.js';

const JENIS = [['harian', 'Rekap harian'], ['bulanan', 'Rekap bulanan pegawai'], ['lembur', 'Lembur & nominal'], ['dinas', 'Perjalanan dinas'], ['pengajuan', 'Pengajuan'], ['bermasalah', 'Presensi bermasalah']];
const STATUS = {
  harian: [['HADIR', 'Hadir'], ['TERLAMBAT', 'Terlambat'], ['TIDAK_PRESENSI_PULANG', 'Tidak presensi pulang'], ['DINAS', 'Dinas'], ['IZIN', 'Izin'], ['SAKIT', 'Sakit'], ['CUTI', 'Cuti'], ['ALPA', 'Alpa'], ['LIBUR', 'Libur']],
  pengajuan: [['MENUNGGU', 'Menunggu'], ['DISETUJUI', 'Disetujui'], ['DITOLAK', 'Ditolak']],
  bermasalah: [['PERLU_DITINJAU', 'Perlu ditinjau'], ['DITOLAK', 'Ditolak'], ['VALID', 'Valid (bertanda)']]
};

export async function render(el) {
  let jenis = 'bulanan', bulan = bulanIni(), dari = '', sampai = '', unit = '', status = '', jp = '', q = '', data = null, grafikData = null, grafikKunci = '';
  el.innerHTML = `${pgHead('Modul audit & analitik', 'Laporan kepegawaian & presensi: rekapitulasi berkala, tren kedisiplinan, kalkulasi lembur, dan ekspor dokumen resmi.')}
    <div class="tabs mb-16" id="lp-tabs"></div>
    <div class="card p-16 mb-16"><div class="toolbar" style="margin:0">
      <label class="ctrl"><small>Periode</small><select id="lp-bln">${opsiBulan(bulan, 24)}</select></label>
      <label class="ctrl" style="min-width:auto"><small>Atau rentang</small><span class="row gap-4"><input type="date" id="lp-dari"><span>–</span><input type="date" id="lp-sampai"></span></label>
      <label class="ctrl"><small>Unit</small><select id="lp-unit"><option value="">Semua unit</option></select></label>
      <label class="ctrl"><small>Jenis presensi</small><select id="lp-jp">${opsi([['HARIAN', 'Harian'], ['DINAS', 'Dinas']], '', 'Harian & dinas')}</select></label>
      <label class="ctrl"><small>Status</small><select id="lp-st"></select></label>
      <div class="input-ic cari">${ic('search')}<input class="input" id="lp-q" placeholder="Cari nama atau NIP…"></div>
    </div><div class="row wrap mt-12" style="justify-content:flex-end">
      <button class="btn ghost" id="lp-reset">Reset filter</button>
      <button class="btn ghost" id="lp-xls" data-sibuk=" Menyiapkan…">${ic('table_view')} Unduh Excel (.xlsx)</button>
      <button class="btn violet" id="lp-pdf" data-sibuk=" Menyiapkan…">${ic('picture_as_pdf')} Unduh PDF</button>
      <button class="btn violet" id="lp-resmi" data-sibuk=" Membuat PDF resmi…">${ic('workspace_premium')} PDF resmi bulanan</button></div></div>
    <div class="g-2 mb-16">
      <section class="card"><div class="card-h"><div><h2 class="h-sm">Tren keterlambatan 30 hari</h2><div class="small muted" id="g1-ket">Jumlah pegawai terlambat per hari</div></div>${ic('schedule')}</div><div class="card-b"><div class="chart-box"><canvas id="g-tren"></canvas></div></div></section>
      <section class="card"><div class="card-h"><div><h2 class="h-sm">Jam lembur per unit</h2><div class="small muted">Dihitung (SPL disetujui) vs tidak dihitung (tanpa SPL)</div></div>${ic('bar_chart')}</div><div class="card-b"><div class="chart-box"><canvas id="g-lembur"></canvas></div></div></section>
    </div>
    <section class="card"><div class="card-h"><div><h2 class="h-sm" id="lp-judul">Laporan</h2><div class="small muted" id="lp-sub"></div></div><span id="lp-ring" class="small"></span></div><div class="card-b" id="lp-tabel">${'<div class="sk" style="height:48px;margin:8px 0"></div>'.repeat(6)}</div></section>`;
  const $ = s => el.querySelector(s);
  const tabs = () => {
    $('#lp-tabs').innerHTML = JENIS.map(([k, l]) => `<button class="tab ${jenis === k ? 'on' : ''}" data-j="${k}">${l}</button>`).join('');
    $('#lp-tabs').querySelectorAll('[data-j]').forEach(b => b.onclick = () => { jenis = b.dataset.j; status = ''; tabs(); muat(); });
    $('#lp-st').innerHTML = opsi(STATUS[jenis] || [], status, 'Semua status');
    $('#lp-st').disabled = !STATUS[jenis];
    $('#lp-jp').disabled = jenis !== 'harian';
  };
  tabs();
  $('#lp-bln').onchange = e => { bulan = e.target.value; dari = sampai = ''; $('#lp-dari').value = $('#lp-sampai').value = ''; muat(); };
  $('#lp-dari').onchange = e => { dari = e.target.value; if (sampai) muat(); };
  $('#lp-sampai').onchange = e => { sampai = e.target.value; if (dari) muat(); };
  $('#lp-unit').onchange = e => { unit = e.target.value; muat(); };
  $('#lp-st').onchange = e => { status = e.target.value; muat(); };
  $('#lp-jp').onchange = e => { jp = e.target.value; muat(); };
  $('#lp-q').oninput = debounce(e => { q = e.target.value; muat(); }, 350);
  $('#lp-reset').onclick = () => { unit = status = jp = q = dari = sampai = ''; bulan = bulanIni(); el.querySelectorAll('#lp-q,#lp-dari,#lp-sampai').forEach(x => x.value = ''); $('#lp-bln').value = bulan; $('#lp-unit').value = ''; $('#lp-jp').value = ''; tabs(); muat(); };
  const sub = () => `${dari && sampai ? tgl(dari) + ' – ' + tgl(sampai) : bulanNama(bulan)} · ${unit || 'Semua unit'}`;
  $('#lp-xls').onclick = e => sibuk(e.currentTarget, () => data && eksporExcel(data.judul, data.kolom, data.baris, data.judul + '_' + (dari || bulan), [data.instansi + ' · ' + sub(), 'Dibuat ' + data.dibuat]).catch(galat));
  $('#lp-pdf').onclick = e => sibuk(e.currentTarget, () => data && eksporPdf(data.judul, `${data.instansi} · ${sub()} · dibuat ${data.dibuat}`, data.kolom, data.baris, data.judul + '_' + (dari || bulan), [$('#g-tren'), $('#g-lembur')]).catch(galat));
  $('#lp-resmi').onclick = e => sibuk(e.currentTarget, async () => {
    try { const r = await api('admin.laporan.pdfResmi', { bulan, unit }, { timeout: 90000 }); unduhDataUrl(r.dataUrl, r.nama); toast('PDF resmi dibuat & tersimpan di folder Laporan PDF.', 'ok'); } catch (err) { galat(err); }
  });

  function gambar(d) {
    data = d;
    $('#lp-judul').textContent = d.judul;
    $('#lp-sub').textContent = `${sub()} · ${angka(d.baris.length)} baris`;
    const r = d.ringkasan;
    $('#lp-ring').innerHTML = r && r.nominal !== undefined ? `Total nominal <b>${rupiah(r.nominal)}</b> · dihitung ${desimal(r.jamDihitung, 1)} jam` : d.hariKerja ? `${d.hariKerja} hari kerja` : '';
    tabel($('#lp-tabel'), { kolom: d.kolom, baris: d.baris, per: 25, kosong: 'Tidak ada data sesuai filter.', rapat: true });
    if (d.grafik) grafikData = d.grafik;
    if (grafikData) gambarGrafik(grafikData);
  }
  function gambarGrafik(g) {
    chart($('#g-tren'), {
      type: 'line', data: { labels: g.tren30.map(x => tgl(x.tanggal).slice(0, 6)), datasets: [{ label: 'Pegawai terlambat', data: g.tren30.map(x => x.telat), borderColor: '#EA580C', backgroundColor: 'rgba(234,88,12,.12)', fill: true, tension: .35, pointRadius: 2 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: c => g.tren30[c.dataIndex].menit + ' menit total' } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } } } }
    });
    const totT = g.tren30.reduce((a, x) => a + x.telat, 0), puncak = g.tren30.reduce((m, x) => x.telat > m.telat ? x : m, g.tren30[0] || { telat: 0 });
    $('#g1-ket').innerHTML = `Rata-rata ${desimal(totT / Math.max(1, g.tren30.length), 1)} pegawai/hari${puncak && puncak.telat ? ` · ${ic('warning', 'sm')} puncak ${esc(tgl(puncak.tanggal))} (${puncak.telat})` : ''}`;
    chart($('#g-lembur'), {
      type: 'bar', data: { labels: g.tabelUnit.map(u => u.unit), datasets: [
        { label: 'Dihitung (SPL disetujui)', data: g.tabelUnit.map(u => u.lembur), backgroundColor: '#2563EB', borderRadius: 6, stack: 's' },
        { label: 'Tidak dihitung (tanpa SPL)', data: g.tabelUnit.map(u => u.tidakDihitung), backgroundColor: '#CBD5E1', borderRadius: 6, stack: 's' }] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${desimal(c.raw, 1)} jam` } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { callback: v => v + ' j' } } } }
    });
  }

  function muat() {
    const gk = (dari && sampai ? sampai : bulan).slice(0, 7) + '|' + unit;
    const d = { jenis, unit, status, jenisPresensi: jp, q, grafik: gk !== grafikKunci };
    if (dari && sampai) { d.dari = dari; d.sampai = sampai; } else d.bulan = bulan;
    if (d.grafik) grafikKunci = gk;
    $('#lp-tabel').innerHTML = '<div class="sk" style="height:48px;margin:8px 0"></div>'.repeat(5);
    swr('admin.laporan', d, gambar, { onError: e => { $('#lp-tabel').innerHTML = `<div class="note bad">${ic('error')}<div>${esc(e.msg || e.message)}</div></div>`; } });
  }
  ambil('admin.ref.list', {}, 300000).then(r => { $('#lp-unit').innerHTML = opsi(r.unit, unit, 'Semua unit'); }).catch(() => {});
  muat();
}
