/* =====================================================================
   pegawai/riwayat.js — Riwayat presensi (PRD 7.3): kalender bulanan
   dengan titik warna per status, statistik mini, daftar harian + detail,
   unduh rekap pribadi PDF.
   ===================================================================== */
import { swr, api } from '../core/api.js';
import { esc, ic, badge, tglPanjang, jamTitik, desimal, jarakTeks, bulanNama, WARNA, persen, galat, LIB, sibuk, menitKeTeks, labelStatus } from '../core/util.js';
import { boot } from './data.js';

const HD = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const BORDER = { HADIR: 'var(--ok)', TERLAMBAT: 'var(--late)', DINAS: 'var(--duty)', IZIN: 'var(--leave)', SAKIT: 'var(--leave)', CUTI: 'var(--leave)', ALPA: 'var(--bad)', TIDAK_PRESENSI_PULANG: 'var(--late)' };

export async function render(el) {
  const b = boot();
  let bulan = (b && b.hariIni ? b.hariIni.tanggal : new Date().toISOString()).slice(0, 7);
  let data = null, pilih = null;

  const geser = n => { let y = +bulan.slice(0, 4), m = +bulan.slice(5, 7) + n; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } bulan = y + '-' + String(m).padStart(2, '0'); muat(); };

  function gambar() {
    const d = data;
    el.innerHTML = `
      <div class="rw-head">
        <div><h1 class="h-lg">Riwayat Presensi</h1><div class="muted small">Rekap kehadiran bulanan</div></div>
        <div class="row"><div class="bulan-nav"><button data-geser="-1" aria-label="Bulan sebelumnya">${ic('chevron_left')}</button><span>${esc(bulanNama(bulan).replace(/^(\w{3})\w*/, '$1'))}</span><button data-geser="1" aria-label="Bulan berikutnya">${ic('chevron_right')}</button></div>
        <button class="ibtn" style="background:var(--duty-tint);color:var(--duty)" id="rw-pdf" aria-label="Unduh rekap PDF">${ic('download')}</button></div>
      </div>
      ${!d ? `<div class="m-wrap">${'<div class="sk" style="height:80px;margin:12px 0"></div>'.repeat(4)}</div>` : `
      <div class="stat4">
        <div style="background:var(--ok-tint);color:var(--ok-dark)"><small>Hadir</small><b>${d.stat.hadir}</b><span>Hari</span></div>
        <div style="background:var(--late-tint);color:var(--late-dark)"><small>Telat</small><b>${d.stat.terlambat}</b><span>Hari</span></div>
        <div style="background:var(--duty-tint);color:var(--duty-dark)"><small>Dinas</small><b>${d.stat.dinas}</b><span>Hari</span></div>
        <div style="background:var(--leave-tint);color:var(--leave-dark)"><small>Izin</small><b>${d.stat.izin + d.stat.sakit + d.stat.cuti}</b><span>Hari</span></div>
      </div>
      <div class="m-wrap">
        <div class="m-card">
          <div class="row between mb-12"><b class="row">${ic('calendar_month')} Kalender aktivitas</b><span class="badge b-ok">Kehadiran ${persen(d.stat.persen, 0)}</span></div>
          <div class="kal">${HD.map(x => `<div class="hd">${x}</div>`).join('')}${kalender(d)}</div>
          <hr class="divider">
          <div class="legend"><span><i class="dot" style="background:#16A34A"></i>Hadir</span><span><i class="dot" style="background:#EA580C"></i>Terlambat</span><span><i class="dot" style="background:#7C3AED"></i>Dinas</span><span><i class="dot" style="background:#0891B2"></i>Izin/Cuti</span><span><i class="dot" style="background:#DC2626"></i>Alpa</span><span><i class="dot" style="background:#94A3B8"></i>Libur</span></div>
        </div>
        <div class="m-sec"><h2>Daftar riwayat harian</h2><span class="small muted">${esc(d.zona)}</span></div>
        <div id="rw-list">${daftar(d)}</div>
        <div class="note mt-16">${ic('help')}<div><b>Ada selisih jam kerja?</b> Ajukan koreksi presensi melalui menu Pengajuan (maksimal 30 hari ke belakang).</div></div>
      </div>`}`;
    el.querySelectorAll('[data-geser]').forEach(x => x.onclick = () => geser(+x.dataset.geser));
    el.querySelectorAll('[data-tgl]').forEach(x => x.onclick = () => { pilih = x.dataset.tgl; const c = el.querySelector(`[data-kartu="${pilih}"]`); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); bukaDetail(c, pilih); } });
    el.querySelectorAll('[data-detail]').forEach(x => x.onclick = () => bukaDetail(x.closest('[data-kartu]'), x.dataset.detail));
    const pdf = el.querySelector('#rw-pdf');
    pdf.onclick = () => sibuk(pdf, unduhPdf);
  }

  function kalender(d) {
    const pertama = new Date(bulan + '-01T12:00:00Z').getUTCDay();
    const geserAwal = (pertama + 6) % 7;
    let html = '';
    for (let i = 0; i < geserAwal; i++) html += '<span class="tg luar"></span>';
    d.hari.forEach(h => {
      const n = +h.tanggal.slice(8, 10);
      const st = h.status_hari;
      const warna = WARNA[st] || (st === 'DINAS_TANPA_PRESENSI' ? '#D97706' : null);
      const kls = [h.tanggal === d.hariIni ? 'hariini' : '', h.jenis_hari === 'LIBUR' && !h.jam_masuk ? 'libur' : '', h.tanggal === pilih ? 'pilih' : ''].join(' ');
      html += `<button class="tg ${kls}" data-tgl="${h.tanggal}" aria-label="${esc(tglPanjang(h.tanggal))}: ${esc(st || 'tidak ada data')}">${n}${warna && st !== 'LIBUR' ? `<i class="dot" style="background:${warna}"></i>` : '<i class="dot" style="background:transparent"></i>'}</button>`;
    });
    return html;
  }

  function daftar(d) {
    const ada = d.hari.filter(h => h.status_hari && h.status_hari !== 'LIBUR' && h.tanggal <= d.hariIni).reverse();
    if (!ada.length) return `<div class="m-card empty">${ic('event_busy')}Belum ada riwayat presensi bulan ini.</div>`;
    return ada.map(h => {
      const st = h.status_hari;
      const tel = Number(h.terlambat_menit) > 0 ? `Terlambat ${h.terlambat_menit} mnt` : '';
      return `<div class="hari-card" data-kartu="${h.tanggal}" style="border-left-color:${BORDER[st] || 'var(--neutral)'}">
        <div class="row between"><b>${esc(tglPanjang(h.tanggal))}</b>${badge(st, tel || undefined)}</div>
        ${h.jam_masuk || h.jam_pulang ? `<div class="waktu">
          <div><small>${ic('login', 'sm')} Masuk</small><b style="color:${Number(h.terlambat_menit) > 0 ? 'var(--late)' : 'inherit'}">${h.jam_masuk ? jamTitik(h.jam_masuk) : '–'}</b></div>
          <div><small>${ic('logout', 'sm')} Pulang</small><b>${h.jam_pulang ? jamTitik(h.jam_pulang) : '–'}</b></div>
          <div class="right">${Number(h.lembur_dihitung_menit) > 0 ? `<span class="badge b-duty">+${menitKeTeks(h.lembur_dihitung_menit)}</span>` : Number(h.kelebihan_menit) > 0 ? `<span class="badge b-neutral" title="Tidak dihitung lembur">+${menitKeTeks(h.kelebihan_menit)}</span>` : ''}</div></div>` : `<div class="muted small mt-8">${esc(h.ket || '')}</div>`}
        <div class="row between small"><span class="muted">${h.langsung ? 'Hari ini (belum direkap)' : esc(h.ket || (h.jenis_hari === 'KERJA' ? 'Hari kerja' : 'Hari libur'))}</span>
          ${h.jam_masuk || h.jam_pulang ? `<button class="btn link small" data-detail="${h.tanggal}">Detail ${ic('chevron_right', 'sm')}</button>` : ''}</div>
        <div class="dtl"></div></div>`;
    }).join('');
  }

  async function bukaDetail(kartu, t) {
    if (!kartu) return;
    const box = kartu.querySelector('.dtl');
    if (box.innerHTML) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="sk" style="height:40px;margin-top:8px"></div>';
    try {
      const rows = await api('riwayat.hari', { tanggal: t });
      box.innerHTML = rows.length ? rows.map(r => `<div class="row between" style="padding:8px 0;border-top:1px solid var(--line-2);font-size:13px;gap:10px">
        <div><b>${r.tipe === 'MASUK' ? 'Masuk' : 'Pulang'} ${jamTitik(r.jam)} ${esc(r.zona)}</b><div class="muted">${esc(r.lokasi)} · ${esc(jarakTeks(r.jarak))} · skor ${desimal(r.skor, 2)}${r.akurasi ? ' · ±' + Math.round(r.akurasi) + ' m' : ''}</div>
        ${r.flags.length ? `<div class="small" style="color:var(--wait-dark)">${esc(r.flags.join(', '))}</div>` : ''}</div>${badge(r.status)}</div>`).join('') : '<div class="muted small">Tidak ada detail.</div>';
    } catch (e) { box.innerHTML = ''; galat(e); }
  }

  async function unduhPdf() {
    try {
      const [r, lib] = await Promise.all([api('rekap.pribadi', { bulan }), LIB.pdf()]);
      const { jsPDF } = lib;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
      doc.text('REKAP PRESENSI PRIBADI', 40, 50);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.text(`${r.instansi || ''}`, 40, 66);
      doc.text(`Nama: ${r.profil.nama}   NIP: ${r.profil.nip || '-'}   Unit: ${r.profil.unit || '-'}`, 40, 84);
      doc.text(`Periode: ${bulanNama(bulan)}   Kehadiran: ${persen(r.stat.persen)}   Hadir ${r.stat.hadir} · Terlambat ${r.stat.terlambat} · Dinas ${r.stat.dinas} · Izin/Sakit/Cuti ${r.stat.izin + r.stat.sakit + r.stat.cuti} · Alpa ${r.stat.alpa}`, 40, 98);
      doc.autoTable({
        startY: 112, headStyles: { fillColor: [15, 27, 76] }, styles: { fontSize: 8.5 },
        head: [['Tanggal', 'Status', 'Masuk', 'Pulang', 'Terlambat (mnt)', 'Lembur dihitung (mnt)', 'Keterangan']],
        body: r.hari.filter(h => h.tanggal <= r.hariIni).map(h => [tglPanjang(h.tanggal), h.status_hari ? labelStatus(h.status_hari) : '-', h.jam_masuk || '-', h.jam_pulang || '-', h.terlambat_menit || 0, h.lembur_dihitung_menit || 0, h.ket || ''])
      });
      doc.setFontSize(8); doc.text('Dibuat dari Sistem Presensi Pegawai · ' + new Date().toLocaleString('id-ID'), 40, doc.internal.pageSize.height - 24);
      doc.save(`Rekap_Presensi_${bulan}.pdf`);
    } catch (e) { galat(e); }
  }

  function muat() {
    data = null; gambar();
    swr('riwayat.bulan', { bulan }, d => { data = d; gambar(); }, { onError: e => galat(e) });
  }
  muat();
}
