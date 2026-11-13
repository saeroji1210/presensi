/* =====================================================================
   admin/ringkasan.js — Dashboard (PRD 5.11 & 7.2): 6 kartu KPI, donat
   status, batang % per unit, 5 pegawai paling disiplin, tabel rekap per
   unit dengan sparkline, donat lembur per unit, antrean tinjauan.
   Satu panggilan API (di-cache server 90 dtk) + SWR di klien.
   ===================================================================== */
import { swr } from '../core/api.js';
import { esc, ic, angka, persen, tglPanjang, desimal, sparkline, galat } from '../core/util.js';
import { pgHead, opsiBulan, bulanIni, opsi, chart, teksTengah, eksporExcel } from './ui.js';

const WARNA_STATUS = ['#16A34A', '#EA580C', '#7C3AED', '#0891B2', '#DC2626'];
const PALET = ['#2563EB', '#7C3AED', '#0891B2', '#16A34A', '#EA580C', '#D97706', '#DB2777', '#475569'];

export async function render(el) {
  let periode = bulanIni(), unit = '', data = null, tm = null;

  const kartu = (kls, ikon, label, nilai, sub) => `<div class="kpi ${kls}"><div class="atas"><span class="ikon">${ic(ikon, 'fill')}</span><span class="lbl">${label}</span></div>
    <div class="nilai">${nilai}</div><div class="banding">${sub}</div></div>`;
  const banding = (kini, lalu, naikBaik = true) => {
    if (lalu === undefined || lalu === null) return '';
    const d = kini - lalu;
    if (!d) return `${ic('remove', 'sm')} sama dengan kemarin`;
    const baik = (d > 0) === naikBaik;
    return `<span title="${baik ? 'Membaik' : 'Memburuk'} dibanding kemarin">${ic(d > 0 ? 'trending_up' : 'trending_down', 'sm')} ${d > 0 ? '+' : ''}${d} vs kemarin</span>`;
  };

  function gambar(d) {
    data = d;
    const k = d.kpi;
    el.innerHTML = `${pgHead('Ringkasan', `Kehadiran sekilas · ${esc(tglPanjang(d.hariIni))}`, `
        <label class="ctrl"><small>Periode</small><select id="r-per">${opsiBulan(periode)}</select></label>
        <label class="ctrl"><small>Unit kerja</small><select id="r-unit">${opsi(d.semuaUnit || [], unit, 'Semua unit')}</select></label>
        <button class="btn violet" id="r-cetak" title="Cetak">${ic('print')} Cetak</button>`)}
      <div class="kpi-grid">
        ${kartu('k-info', 'groups', 'Total pegawai', angka(k.total), `${(d.semuaUnit || []).length} unit kerja`)}
        ${kartu('k-ok', 'check_circle', 'Hadir tepat waktu', angka(k.tepat), banding(k.tepat, d.kemarin.tepat))}
        ${kartu('k-late', 'schedule', 'Terlambat', angka(k.terlambat), banding(k.terlambat, d.kemarin.terlambat, false))}
        ${kartu('k-duty', 'flight_takeoff', 'Dinas luar', angka(k.dinas), banding(k.dinas, d.kemarin.dinas))}
        ${kartu('k-leave', 'event_note', 'Izin / Sakit / Cuti', angka(k.izin), banding(k.izin, d.kemarin.izin))}
        ${kartu('k-bad', 'person_off', 'Belum presensi', angka(k.belum), k.libur ? `${k.libur} sedang libur` : 'hari ini')}
      </div>
      <div class="g-3">
        <section class="card"><div class="card-h"><h2 class="h-sm">Ringkasan status kehadiran</h2><span class="badge b-info">Hari ini</span></div>
          <div class="card-b"><div class="donut-wrap"><div class="chart-box sm"><canvas id="c-status" aria-label="Donat status kehadiran"></canvas></div><div class="leg-list" id="leg-status"></div></div>
          <hr class="divider"><div class="row between"><span class="muted">Tingkat kepatuhan bulan ini</span><b style="font-size:18px">${persen(d.kepatuhan)}</b></div></div></section>
        <section class="card"><div class="card-h"><div><h2 class="h-sm">Persentase kehadiran per unit</h2><div class="small muted">Hadir + dinas ÷ hari kerja wajib</div></div><span class="badge b-neutral">Target 85%</span></div>
          <div class="card-b"><div class="chart-box"><canvas id="c-unit" aria-label="Batang persentase kehadiran per unit"></canvas></div>
          <div class="row between small mt-8"><span class="muted">${d.tabelUnit.filter(u => u.persen >= 85).length} dari ${d.tabelUnit.length} unit memenuhi target</span></div></div></section>
        <section class="card"><div class="card-h"><h2 class="h-sm row">${ic('emoji_events', 'fill')} Paling disiplin</h2><span class="badge b-wait">Top 5</span></div>
          <div class="card-b">${d.disiplin.length ? d.disiplin.map((p, i) => `<div class="rank"><span class="no ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</span><div><b>${esc(p.nama)}</b><small>${esc(p.unit || '')} · rata-rata ${esc(String(p.rata).replace(':', '.'))}</small></div><span class="skor">${persen(p.skor)}</span></div>`).join('') : '<div class="empty small">Belum ada data bulan ini.</div>'}</div></section>
      </div>
      <div class="g-2-1">
        <section class="card"><div class="card-h"><div><h2 class="h-sm">Rekapitulasi kehadiran per unit kerja</h2><div class="small muted">${esc(d.periode)}</div></div>
          <button class="btn ghost sm no-print" id="r-xls">${ic('download', 'sm')} Ekspor XLS</button></div>
          <div class="card-b" style="padding:12px 0 0"><div class="tbl-wrap" style="border:0;border-radius:0 0 16px 16px"><table class="tbl rapat"><thead><tr><th>Unit kerja</th><th class="num">Pegawai</th><th class="num">Rata-rata masuk</th><th class="num">% Hadir</th><th class="num">Terlambat</th><th class="num">Lembur</th><th>Tren</th></tr></thead>
          <tbody>${d.tabelUnit.map((u, i) => `<tr><td><span class="row"><i class="dot" style="background:${PALET[i % PALET.length]}"></i><b>${esc(u.unit)}</b></span></td><td class="num">${u.pegawai} org</td><td class="num">${esc(String(u.rataMasuk).replace(':', '.'))}</td>
            <td class="num"><b style="color:${u.persen >= 85 ? 'var(--ok-dark)' : 'var(--late-dark)'}">${persen(u.persen)}</b></td><td class="num">${u.terlambat}</td><td class="num">${desimal(u.lembur, 1)} jam</td><td>${sparkline(u.tren)}</td></tr>`).join('') || '<tr><td colspan="7"><div class="empty">Belum ada data.</div></td></tr>'}</tbody>
          <tfoot><tr><td>Total ${d.tabelUnit.length} unit</td><td class="num">${angka(k.total)}</td><td></td><td class="num">${persen(d.kepatuhan)}</td><td class="num">${d.tabelUnit.reduce((a, u) => a + u.terlambat, 0)}</td><td class="num">${desimal(d.tabelUnit.reduce((a, u) => a + u.lembur, 0), 1)} jam</td><td></td></tr></tfoot></table></div></div></section>
        <div class="col gap-16">
          <section class="card"><div class="card-h"><h2 class="h-sm row">${ic('more_time')} Lembur disetujui</h2><span class="small muted">Bulan ini</span></div>
            <div class="card-b"><div class="donut-wrap" style="grid-template-columns:140px 1fr"><div class="chart-box sm" style="height:140px"><canvas id="c-lembur"></canvas></div><div class="leg-list" id="leg-lembur"></div></div></div></section>
          <section class="antre"><div class="row gap-12"><span class="ic xl" style="color:var(--wait)">warning</span><div><div class="h-sm" style="color:var(--wait-dark)">Antrean tinjauan presensi</div>
            <div class="small" style="color:var(--wait-dark)">Presensi dengan tanda risiko (GPS, skor wajah area abu-abu, perangkat) menunggu keputusan admin.</div></div></div>
            <div class="row between mt-12"><b class="besar">${angka(d.tinjauan)}</b><a class="btn" href="#/tinjauan" style="background:var(--wait)">Tinjau sekarang ${ic('arrow_forward', 'sm')}</a></div></section>
        </div>
      </div>
      <div class="muted small center mt-24">Data diperbarui pukul ${esc(String(d.diperbarui).replace(/:/g, '.'))} WIB${d.cache ? ' (cache server)' : ''} · Sumber: Sistem Presensi Pegawai</div>`;

    el.querySelector('#r-per').onchange = e => { periode = e.target.value; muat(); };
    el.querySelector('#r-unit').onchange = e => { unit = e.target.value; muat(); };
    el.querySelector('#r-cetak').onclick = () => window.print();
    el.querySelector('#r-xls').onclick = () => eksporExcel('Rekap kehadiran per unit ' + d.periode,
      [{ k: 'unit', label: 'Unit' }, { k: 'pegawai', label: 'Pegawai' }, { k: 'rataMasuk', label: 'Rata-rata masuk' }, { k: 'persen', label: '% Hadir' }, { k: 'terlambat', label: 'Terlambat' }, { k: 'lembur', label: 'Lembur (jam)' }],
      d.tabelUnit, 'Rekap_Unit_' + d.periode).catch(galat);

    const komp = d.komposisi, labels = ['Hadir tepat', 'Terlambat', 'Dinas luar', 'Izin/Cuti', 'Belum masuk'];
    const nilai = [komp.HADIR, komp.TERLAMBAT, komp.DINAS, komp.IZIN, komp.BELUM];
    const tot = nilai.reduce((a, b) => a + b, 0) || 1;
    el.querySelector('#leg-status').innerHTML = labels.map((l, i) => `<div><i class="dot" style="background:${WARNA_STATUS[i]}"></i><span>${l}</span><b>${nilai[i]} <span class="faint">(${desimal(nilai[i] / tot * 100, 1)}%)</span></b></div>`).join('');
    chart(el.querySelector('#c-status'), {
      type: 'doughnut', data: { labels, datasets: [{ data: nilai, backgroundColor: WARNA_STATUS, borderWidth: 2, borderColor: '#fff' }] },
      options: { cutout: '70%', plugins: { legend: { display: false } }, maintainAspectRatio: false, animation: { duration: 400 } }, plugins: [teksTengah(angka(k.total), 'TOTAL')]
    });
    chart(el.querySelector('#c-unit'), {
      type: 'bar', data: { labels: d.tabelUnit.map(u => u.unit), datasets: [{ label: '% hadir', data: d.tabelUnit.map(u => u.persen), backgroundColor: '#2563EB', borderRadius: 8, maxBarThickness: 42 }] },
      options: {
        maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => persen(c.raw) } } },
        scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } }, x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 30 } } }, animation: { duration: 400 }
      },
      plugins: [{ id: 'target', afterDraw(c) { const y = c.scales.y.getPixelForValue(85), a = c.chartArea; const x = c.ctx; x.save(); x.setLineDash([5, 5]); x.strokeStyle = '#94A3B8'; x.beginPath(); x.moveTo(a.left, y); x.lineTo(a.right, y); x.stroke(); x.restore(); } }]
    });
    const lu = Object.entries(d.lemburUnit || {});
    const totL = lu.reduce((a, [, v]) => a + v, 0);
    el.querySelector('#leg-lembur').innerHTML = lu.length ? lu.map(([u, v], i) => `<div><i class="dot" style="background:${PALET[i % PALET.length]}"></i><span class="ellipsis">${esc(u)}</span><b>${desimal(v, 1)} j</b></div>`).join('') : '<span class="muted small">Belum ada lembur disetujui.</span>';
    chart(el.querySelector('#c-lembur'), {
      type: 'doughnut', data: { labels: lu.map(x => x[0]), datasets: [{ data: lu.length ? lu.map(x => x[1]) : [1], backgroundColor: lu.length ? lu.map((_, i) => PALET[i % PALET.length]) : ['#EEF1F7'], borderWidth: 2, borderColor: '#fff' }] },
      options: { cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: !!lu.length } }, maintainAspectRatio: false }, plugins: [teksTengah(desimal(totL, 0) + 'j', 'TOTAL')]
    });
  }

  function muat() {
    if (!data) el.innerHTML = pgHead('Ringkasan', 'Memuat…') + `<div class="kpi-grid">${'<div class="sk" style="height:124px;border-radius:18px"></div>'.repeat(6)}</div><div class="g-3">${'<div class="sk" style="height:320px;border-radius:16px"></div>'.repeat(3)}</div>`;
    return swr('admin.dashboard', { periode, unit }, gambar, { onError: (e, adaCache) => { if (!adaCache) el.innerHTML = pgHead('Ringkasan', '') + `<div class="note bad">${ic('error')}<div>${esc(e.msg || e.message)}</div></div>`; else galat(e); } });
  }
  muat();
  tm = setInterval(() => { if (document.visibilityState === 'visible') muat(); }, 120000);
  return () => clearInterval(tm);
}
