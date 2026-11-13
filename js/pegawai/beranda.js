/* =====================================================================
   pegawai/beranda.js — Beranda pegawai (PRD 7.3): sapaan, jam server
   berjalan, status lokasi, tab Harian|Dinas, tombol MASUK/PULANG,
   garis waktu hari ini, statistik mini bulan ini.
   ===================================================================== */
import { esc, ic, avatar, tglPanjang, jamTitik, jarakTeks, desimal, badge, tgl, toast } from '../core/util.js';
import { jamServer, LS, DEMO } from '../core/api.js';
import { dengar, segarkan, ubahLokal, boot } from './data.js';
import { sampelGps, nilaiTarget, izinLokasi } from '../gps.js';

let tab = LS.get('pp_tab') || 'HARIAN';
let gpsStatus = { st: 'idle' };

const menit = hhmm => { const m = String(hhmm || '').match(/^(\d{1,2})[:.](\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
function jamLokal(tz) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return f.format(jamServer()).replace(/^24/, '00');
}
function salam(tz) {
  const h = Number(jamLokal(tz).slice(0, 2));
  return h < 11 ? 'Selamat pagi,' : h < 15 ? 'Selamat siang,' : h < 18 ? 'Selamat sore,' : 'Selamat malam,';
}

export async function render(el) {
  let d = boot();
  let tikJam = null, aktif = true;

  const gambar = () => {
    if (!aktif) return;
    d = boot();
    if (!d) { el.innerHTML = `<div class="hero" style="height:260px"></div><div class="m-wrap"><div class="panel">${'<div class="sk" style="height:56px;margin:12px 0"></div>'.repeat(4)}</div></div>`; return; }
    if (!d.hariIni) { el.innerHTML = `<div class="m-wrap mt-24"><div class="note warn">${ic('info')}<div>Akun ini bukan akun pegawai. Gunakan panel admin.</div></div></div>`; return; }
    const h = d.hariIni, p = d.profil;
    const adaDinas = h.dinas && h.dinas.length;
    if (!adaDinas) tab = 'HARIAN';
    const dinas = adaDinas ? h.dinas[0] : null;
    const ctx = konteks(h, dinas);
    el.innerHTML = `
      <section class="hero">
        <div class="salam">${avatar(p.nama, 'lg')}<div><small>${salam(h.tz)}</small><b>${esc(p.nama)}</b></div></div>
        <div class="tgl">${ic('event')} ${esc(tglPanjang(h.tanggal))}</div>
        <div class="jam-besar tnum" id="jam" aria-live="off">${jamTitik(jamLokal(h.tz).slice(0, 5))}<small>.${jamLokal(h.tz).slice(6, 8)}</small></div>
        <div class="jam-ket"><span><i class="dot"></i>${esc(h.zona)} · waktu server</span></div>
      </section>
      <div class="m-wrap">
        <div class="panel">
          ${adaDinas ? `<div class="m-seg" role="tablist">
            <button class="${tab === 'HARIAN' ? 'on' : ''}" data-tab="HARIAN" role="tab">${ic('schedule')} Harian</button>
            <button class="${tab === 'DINAS' ? 'on' : ''}" data-tab="DINAS" role="tab">${ic('work')} Dinas${tab !== 'DINAS' ? '<i class="pip"></i>' : ''}</button></div>` :
            `<div class="row between"><span class="h-sm muted">${ic('apartment', 'sm')} Presensi harian</span><span class="badge b-info">${esc(h.jadwal.nama || 'Jadwal')}</span></div>`}
          ${tab === 'DINAS' && dinas ? `<div class="note mt-12" style="background:var(--duty-tint);color:var(--duty-dark)">${ic('flight_takeoff')}<div><b>${esc(dinas.tujuan)}</b><br>
            ${esc(tgl(dinas.mulai))} – ${esc(tgl(dinas.selesai))} · ${esc(dinas.no_surat)} · ${esc(dinas.zona)}${dinas.hariUjung ? '<br><small>Hari berangkat/pulang: boleh presensi di kantor atau di titik tujuan.</small>' : ''}</div></div>` : ''}
          <div id="lok">${kartuLokasi(ctx)}</div>
          ${tombol(h, ctx, p)}
          ${catatan(h, ctx, p)}
        </div>
        <div class="m-card aktivitas mt-16">
          <div class="row between"><h2 class="h-sm muted">Aktivitas hari ini</h2><a href="#/riwayat" class="small semi">Lihat riwayat</a></div>
          ${garisWaktu(ctx)}
        </div>
        <div class="mini-stat">
          <div><span class="bulat" style="background:var(--ok-tint);color:var(--ok)">${ic('how_to_reg')}</span><b>${d.statBulan ? d.statBulan.hadir : 0} Hari</b><small>Hadir</small></div>
          <div><span class="bulat" style="background:var(--late-tint);color:var(--late)">${ic('timer_off')}</span><b style="color:var(--late-dark)">${d.statBulan ? d.statBulan.terlambat : 0}x</b><small>Terlambat</small></div>
          <div><span class="bulat" style="background:var(--leave-tint);color:var(--leave)">${ic('medical_services')}</span><b>${d.statBulan ? (d.statBulan.izin + d.statBulan.sakit + d.statBulan.cuti) : 0}</b><small>Izin/Sakit/Cuti</small></div>
        </div>
      </div>`;
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; LS.set('pp_tab', tab); gpsStatus = { st: 'idle' }; gambar(); cekLokasi(); });
    el.querySelectorAll('[data-absen]').forEach(b => b.onclick = () => tekan(b.dataset.absen, ctx));
    const ul = el.querySelector('[data-ulang-gps]'); if (ul) ul.onclick = () => cekLokasi(true);
  };

  function konteks(h, dinas) {
    if (tab === 'DINAS' && dinas) {
      return {
        jenis: 'DINAS', idRef: dinas.id, zona: dinas.zona, presensi: dinas.presensi || [],
        target: dinas.titik.concat(dinas.hariUjung && h.lokasi ? [{ nama: h.lokasi.nama, lat: h.lokasi.lat, lng: h.lokasi.lng, radius: h.lokasi.radius }] : []),
        jadwal: { masuk: dinas.jam_masuk, pulang: dinas.jam_pulang, buka: h.jadwal.buka, batasMasuk: h.jadwal.batasMasuk, batasPulang: h.jadwal.batasPulang }
      };
    }
    return {
      jenis: 'HARIAN', idRef: h.lokasi && h.lokasi.id, zona: h.zona, presensi: h.presensi || [],
      target: h.lokasi ? [{ nama: h.lokasi.nama, lat: h.lokasi.lat, lng: h.lokasi.lng, radius: h.lokasi.radius }] : [],
      jadwal: h.jadwal
    };
  }

  function kartuLokasi(ctx) {
    const s = gpsStatus;
    if (!ctx.target.length) return `<div class="lokasi bad"><div class="baris1"><span class="bulat">${ic('location_off')}</span>Lokasi kantor belum diatur admin</div></div>`;
    if (s.st === 'idle' || s.st === 'cari') return `<div class="lokasi"><div class="baris1"><span class="bulat" style="background:#94A3B8">${ic('my_location')}</span>Mencari sinyal GPS…<span class="spin" style="margin-left:auto;width:20px;height:20px"></span></div><div class="baris2"><span>${s.n ? s.n + ' titik terkumpul' : 'Mengumpulkan 3–5 titik'}</span></div></div>`;
    if (s.st === 'galat') return `<div class="lokasi bad"><div class="baris1"><span class="bulat">${ic('location_off')}</span><span>${esc(s.pesan)}</span><button class="ulang" data-ulang-gps aria-label="Ulangi">${ic('refresh')}</button></div></div>`;
    const v = s.nilai, lemah = v.akurasi > ((d.setting && Number(d.setting.AKURASI_GPS_MAKS)) || 50);
    const kelas = !v.dalam ? 'bad' : lemah ? 'wait' : 'ok';
    return `<div class="lokasi ${kelas}"><div class="baris1"><span class="bulat">${ic(v.dalam ? 'location_on' : 'wrong_location', 'fill')}</span>
      <span>${v.dalam ? 'Dalam radius' : 'Di luar radius'} · ${esc(jarakTeks(v.jarak))} dari ${esc(v.t.nama)}</span>
      <button class="ulang" data-ulang-gps aria-label="Perbarui lokasi">${ic('refresh')}</button></div>
      <div class="baris2"><span>Akurasi GPS ±${Math.round(v.akurasi)} m ${lemah ? '(lemah — coba dekat jendela)' : '(baik)'}</span><span>${s.n} titik</span></div></div>`;
  }

  function tombol(h, ctx, p) {
    const now = menit(jamLokal(h.tz));
    const list = ctx.presensi.filter(x => x.status !== 'DITOLAK');
    const masuk = list.find(x => x.tipe === 'MASUK');
    const pulang = list.filter(x => x.tipe === 'PULANG').pop();
    const wajahOk = p.status_wajah === 'TERDAFTAR';
    let mState = 'masuk', mSub = 'Ketuk presensi', pState = 'pulang', pSub = 'Ketuk presensi';
    if (h.izin) { mState = pState = 'kunci'; mSub = pSub = 'Hari ini ' + h.izin.jenis.toLowerCase(); }
    else if (!wajahOk) { mState = pState = 'kunci'; mSub = pSub = 'Wajah belum terdaftar'; }
    else {
      if (masuk) { mState = 'selesai'; mSub = 'Masuk ' + jamTitik(masuk.jam); }
      else if (now < menit(ctx.jadwal.buka || '05:30')) { mState = 'kunci'; mSub = 'Dibuka ' + jamTitik(ctx.jadwal.buka); }
      else if (now > menit(ctx.jadwal.batasMasuk || '12:00')) { mState = 'kunci'; mSub = 'Ditutup ' + jamTitik(ctx.jadwal.batasMasuk); }
      if (!masuk && now < menit(ctx.jadwal.pulang)) { pState = 'kunci'; pSub = 'Terkunci'; }
      else if (now > menit(ctx.jadwal.batasPulang || '23:59')) { pState = 'kunci'; pSub = 'Ditutup'; }
      else if (pulang) pSub = 'Pulang ' + jamTitik(pulang.jam) + ' · perbarui';
    }
    const btn = (jenis, st, sub, ikonAktif) => `<div>
      <button class="absen ${st}" ${st === 'kunci' || st === 'selesai' ? 'disabled aria-disabled="true"' : ''} data-absen="${jenis}">
        ${ic(st === 'kunci' ? 'lock_clock' : st === 'selesai' ? 'task_alt' : ikonAktif)}${jenis}<small>${esc(sub)}</small></button>
      <div class="absen-ket">${jenis === 'MASUK' ? 'Jadwal ' + jamTitik(ctx.jadwal.masuk) : 'Pulang ' + jamTitik(ctx.jadwal.pulang)} ${esc(ctx.zona)}</div></div>`;
    return `<div class="tombol-absen">${btn('MASUK', mState, mSub, 'login')}${btn('PULANG', pState, pSub, 'logout')}</div>`;
  }

  function catatan(h, ctx, p) {
    if (p.status_wajah !== 'TERDAFTAR') return `<div class="note warn mt-12">${ic('face')}<div>Wajah Anda belum terdaftar. Temui admin kepegawaian, atau minta <b>kode pendaftaran</b> lalu buka Profil → Daftarkan wajah.</div></div>`;
    if (h.izin) return `<div class="note mt-12" style="background:var(--leave-tint);color:var(--leave-dark)">${ic('event_available')}<div>Pengajuan <b>${esc(h.izin.jenis.toLowerCase())}</b> Anda disetujui untuk ${esc(tgl(h.izin.mulai))}${h.izin.selesai !== h.izin.mulai ? ' – ' + esc(tgl(h.izin.selesai)) : ''}.</div></div>`;
    if (h.jenisHari.jenis === 'LIBUR' && ctx.jenis === 'HARIAN') return `<div class="note mt-12">${ic('weekend')}<div>Hari ini <b>${esc(h.jenisHari.ket || 'libur')}</b>. Presensi hanya diperlukan bila ada Surat Perintah Lembur.</div></div>`;
    if (d.perangkat && !d.perangkat.terdaftar && !d.perangkat.kosong) return `<div class="note bad mt-12">${ic('phonelink_lock')}<div>Perangkat ini bukan perangkat terdaftar Anda. Presensi hanya bisa dari ${esc(d.perangkat.info || 'perangkat terdaftar')}.</div></div>`;
    return `<div class="note late mt-12">${ic('warning')}<div>Pastikan GPS aktif & izin kamera diberikan. Presensi di luar radius akan ditolak; jam dicatat dari server.</div></div>`;
  }

  function garisWaktu(ctx) {
    const list = ctx.presensi.slice().sort((a, b) => a.jam < b.jam ? -1 : 1);
    const warna = { VALID: ['var(--ok-tint)', 'var(--ok)'], PERLU_DITINJAU: ['var(--wait-tint)', 'var(--wait)'], DITOLAK: ['var(--bad-tint)', 'var(--bad)'] };
    const item = x => {
      const w = warna[x.status] || ['#F1F5F9', '#94A3B8'];
      const tel = x.tipe === 'MASUK' && x.status !== 'DITOLAK' ? (menit(x.jam) - menit(ctx.jadwal.masuk) > (boot().hariIni.jadwal.toleransi || 0) && ctx.jenis === 'HARIAN' ? `Terlambat ${menit(x.jam) - menit(ctx.jadwal.masuk)} mnt` : 'Tepat waktu') : '';
      return `<li><span class="tl-ic" style="background:${w[0]};color:${w[1]}">${ic(x.status === 'DITOLAK' ? 'cancel' : x.status === 'VALID' ? 'check_circle' : 'pending')}</span>
        <div class="grow"><div class="row between"><b>${x.tipe === 'MASUK' ? 'Masuk' : 'Pulang'}: ${jamTitik(x.jam)} ${esc(ctx.zona)}</b>${badge(x.status)}</div>
        <small>${x.jarak !== undefined ? esc(jarakTeks(x.jarak)) + ' · ' : ''}Skor wajah ${desimal(x.skor, 2)}${tel ? ' · ' + tel : ''}${x.flag && x.status !== 'VALID' ? ' · ' + esc(x.flag.replace(/_/g, ' ').toLowerCase()) : ''}</small></div></li>`;
    };
    const valid = list.filter(x => x.status !== 'DITOLAK');
    const masuk = valid.find(x => x.tipe === 'MASUK'), pulang = valid.find(x => x.tipe === 'PULANG');
    let html = list.map(item).join('');
    if (masuk && !pulang) html += `<li><span class="tl-ic" style="background:#EEF2FF;color:#94A3B8">${ic('schedule')}</span><div class="grow"><div class="row between"><b>Pulang: belum presensi</b>${badge('MENUNGGU')}</div><small>Batas presensi pulang ${jamTitik(ctx.jadwal.pulang)} – ${jamTitik(ctx.jadwal.batasPulang)} ${esc(ctx.zona)}</small></div></li>`;
    if (!list.length) html = `<li><span class="tl-ic" style="background:#EEF2FF;color:#94A3B8">${ic('hourglass_empty')}</span><div><b>Belum ada presensi hari ini</b><small>Tekan tombol MASUK saat tiba di lokasi.</small></div></li>`;
    return `<ul class="tl">${html}</ul>`;
  }

  async function cekLokasi(paksa) {
    const b = boot();
    if (!b || !b.hariIni) return;
    const h = b.hariIni;
    let ctx = konteks(h, h.dinas && h.dinas[0]);
    if (!ctx.target.length) return;
    if (!paksa && gpsStatus.st === 'cari') return;
    gpsStatus = { st: 'cari', n: 0 };
    const st = await izinLokasi();
    if (st === 'denied') { gpsStatus = { st: 'galat', pesan: 'Izin lokasi ditolak. Aktifkan di pengaturan browser.' }; perbaruiLokasi(ctx); return; }
    gpsStatus = { st: 'cari', n: 0 }; perbaruiLokasi(ctx);
    try {
      const s = await sampelGps({ durasi: 9000, onUpdate: x => { gpsStatus.n = x.length; perbaruiLokasi(ctx); } });
      let nilai = nilaiTarget(s, ctx.target);
      if (DEMO && nilai && !nilai.dalam && ctx.jenis === 'HARIAN') {
        // Mode demo: pindahkan titik kantor contoh ke dekat posisi Anda agar alur presensi bisa dicoba
        const { demoGeser } = await import('../demo.js');
        if (demoGeser(s)) { await segarkan(); const b2 = boot(); ctx = konteks(b2.hariIni, b2.hariIni.dinas && b2.hariIni.dinas[0]); nilai = nilaiTarget(s, ctx.target); }
      }
      gpsStatus = { st: 'ok', nilai, n: s.length };
    } catch (e) { gpsStatus = { st: 'galat', pesan: e.message }; }
    perbaruiLokasi(ctx);
  }
  function perbaruiLokasi(ctx) { const l = el.querySelector('#lok'); if (l) { l.innerHTML = kartuLokasi(ctx); const ul = l.querySelector('[data-ulang-gps]'); if (ul) ul.onclick = () => cekLokasi(true); } }

  async function tekan(tipe, ctx) {
    const b = boot();
    const { jalankanPresensi } = await import('./presensi.js');
    let vektorDemo;
    if (window.__DEMO_VEKTOR__) vektorDemo = window.__DEMO_VEKTOR__;
    const r = await jalankanPresensi({
      jenis: ctx.jenis, tipe, idRef: ctx.idRef, target: ctx.target, vektorDemo,
      akurasiMaks: Number((b.setting || {}).AKURASI_GPS_MAKS) || 50
    });
    if (!r) return;
    ubahLokal(data => {
      const p = { id: r.id || String(Date.now()), tipe: r.tipe, jenis: r.jenis || ctx.jenis, jam: r.jam, status: r.status, jarak: r.jarak, skor: r.skor, flag: (r.flags || []).join(',') };
      if (ctx.jenis === 'DINAS' && data.hariIni.dinas[0]) data.hariIni.dinas[0].presensi.push(p);
      else data.hariIni.presensi.push(p);
      if (r.status !== 'DITOLAK') { if (r.tipe === 'MASUK') data.hariIni.masuk = p; else data.hariIni.pulang = p; }
    });
    segarkan();
    if (r.status === 'VALID') toast(`Presensi ${r.tipe.toLowerCase()} ${String(r.jam).slice(0, 5).replace(':', '.')} tercatat.`, 'ok');
  }

  // Cek lokasi otomatis begitu data boot tersedia (dari cache atau server)
  const lepas = dengar(() => { gambar(); if (gpsStatus.st === 'idle') cekLokasi(); });
  if (!d) gambar();
  segarkan();
  tikJam = setInterval(() => {
    const j = el.querySelector('#jam'), b = boot();
    if (j && b && b.hariIni) { const t = jamLokal(b.hariIni.tz); j.innerHTML = `${jamTitik(t.slice(0, 5))}<small>.${t.slice(6, 8)}</small>`; }
  }, 1000);
  const vis = () => { if (document.visibilityState === 'visible') { segarkan(); } };
  document.addEventListener('visibilitychange', vis);
  return () => { aktif = false; lepas(); clearInterval(tikJam); document.removeEventListener('visibilitychange', vis); };
}
