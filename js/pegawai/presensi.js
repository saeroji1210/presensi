/* =====================================================================
   pegawai/presensi.js — Orkestrasi satu kali presensi (PRD 5.3):
   GPS multi-sampel → presensi.mulai (nonce + tantangan) → kamera & uji
   kehidupan → presensi.kirim → layar hasil (jam server, status, jarak).
   ===================================================================== */
import { api, DEMO, infoPerangkat } from '../core/api.js';
import { esc, ic, modal, jarakTeks, desimal, tglPanjang, badge } from '../core/util.js';
import { sampelGps, sampelTerakhir, nilaiTarget, terbaik } from '../gps.js';
import { muatMesin } from '../face/engine.js';
import { kameraPresensi } from '../face/kamera.js';

export function pramuatMesin() { muatMesin().catch(() => {}); }

function layarProses(teks) {
  const el = document.createElement('div');
  el.className = 'layar-proses';
  el.innerHTML = `<div class="spin"></div><b style="font-size:17px">${esc(teks)}</b><small class="muted">Jangan tutup aplikasi.</small>`;
  document.body.appendChild(el);
  return { teks: t => { el.querySelector('b').textContent = t; }, tutup: () => el.remove() };
}

function pilihan({ judul, pesan, ikon = 'warning', tombol }) {
  return new Promise(res => {
    const m = modal({
      judul, isi: `<div class="note warn">${ic(ikon)}<div>${pesan}</div></div>`,
      kaki: tombol.map((t, i) => `<button class="btn ${t.kelas || ''}" data-i="${i}">${esc(t.label)}</button>`).join(''),
      onTutup: () => res(null)
    });
    m.el.querySelectorAll('[data-i]').forEach(b => { b.onclick = () => { m.ov.remove(); res(tombol[+b.dataset.i].nilai); }; });
  });
}

/**
 * @param {object} o jenis HARIAN|DINAS, tipe MASUK|PULANG, idRef, target[], akurasiMaks, vektorDemo
 * @returns hasil server atau null bila dibatalkan
 */
export async function jalankanPresensi(o) {
  // 1) Lokasi
  let sampel = sampelTerakhir(45000);
  for (;;) {
    if (!sampel) {
      const lp = layarProses('Mengambil lokasi GPS (3–5 titik)…');
      try { sampel = await sampelGps({ durasi: 10000 }); } catch (e) { lp.tutup(); await pilihan({ judul: 'Lokasi tidak tersedia', pesan: esc(e.message), ikon: 'location_off', tombol: [{ label: 'Tutup', nilai: 0 }] }); return null; }
      lp.tutup();
    }
    const n = nilaiTarget(sampel, o.target);
    const acc = terbaik(sampel).acc;
    if (n && !n.dalam) {
      const p = await pilihan({
        judul: 'Di luar radius', ikon: 'wrong_location',
        pesan: `Posisi Anda <b>${esc(jarakTeks(n.jarak))}</b> dari ${esc(n.t.nama)} (radius ${n.t.radius} m). Presensi di luar radius akan <b>ditolak</b> server dan tetap tercatat.`,
        tombol: [{ label: 'Batal', kelas: 'ghost', nilai: 0 }, { label: 'Ambil ulang lokasi', kelas: 'ghost', nilai: 1 }, { label: 'Tetap kirim', kelas: 'red', nilai: 2 }]
      });
      if (!p) return null;
      if (p === 1) { sampel = null; continue; }
    } else if (acc > (o.akurasiMaks || 50)) {
      const p = await pilihan({
        judul: 'Sinyal GPS lemah', ikon: 'signal_cellular_alt_1_bar',
        pesan: `Akurasi GPS ±${Math.round(acc)} m (batas ${o.akurasiMaks || 50} m). Coba dekat jendela atau di luar ruangan. Bila dilanjutkan, presensi masuk antrean tinjauan admin.`,
        tombol: [{ label: 'Ambil ulang', kelas: 'ghost', nilai: 1 }, { label: 'Lanjutkan', nilai: 2 }]
      });
      if (!p) return null;
      if (p === 1) { sampel = null; continue; }
    }
    break;
  }

  // 2) Nonce + tantangan dari server (paralel memanaskan model)
  const lp = layarProses('Menyiapkan verifikasi…');
  let n;
  try {
    [n] = await Promise.all([api('presensi.mulai', { jenis: o.jenis, tipe: o.tipe, id_ref: o.idRef, info: infoPerangkat() }), muatMesin().catch(() => null)]);
    n._t = Date.now();
  } catch (e) {
    lp.tutup();
    const koreksi = ['WAJAH_TERKUNCI', 'DI_LUAR_JENDELA'].includes(e.code);
    const p = await pilihan({ judul: 'Presensi belum bisa dilakukan', pesan: esc(e.msg || e.message), ikon: 'block', tombol: koreksi ? [{ label: 'Tutup', kelas: 'ghost', nilai: 1 }, { label: 'Ajukan Koreksi', nilai: 2 }] : [{ label: 'Tutup', nilai: 1 }] });
    if (p === 2) location.hash = '/pengajuan?jenis=KOREKSI_PRESENSI';
    return null;
  }
  lp.tutup();

  // 3) Kamera & uji kehidupan
  let hasil;
  const judul = `Verifikasi Wajah · ${o.tipe === 'MASUK' ? 'Masuk' : 'Pulang'}`;
  for (;;) {
    try {
      hasil = await kameraPresensi({ judul, tantangan: n.tantangan, lokasiOk: (nilaiTarget(sampel, o.target) || {}).dalam !== false, vektorDemo: o.vektorDemo });
      break;
    } catch (e) {
      if (e.kode === 'ULANG') continue;
      return null;
    }
  }

  // 4) Kirim (coba ulang aman: nonce sekali pakai mencegah dobel)
  const kirim = layarProses('Memverifikasi wajah & lokasi di server…');
  let r;
  try {
    r = await api('presensi.kirim', { nonce: n.nonce, gps: sampel, vektor: hasil.vektor, liveness: hasil.liveness, foto: hasil.foto }, { retries: 2, timeout: 40000 });
  } catch (e) {
    if (e.code === 'NONCE_TIDAK_VALID' || e.code === 'JARINGAN') {
      // mungkin sudah tercatat tetapi respons hilang → cek dari server
      try {
        const b = await api('boot', {});
        const list = o.jenis === 'DINAS' ? ((b.hariIni.dinas[0] || {}).presensi || []) : b.hariIni.presensi;
        const p = list.filter(x => x.tipe === o.tipe).pop();
        if (p && Date.now() - n._t < 300000) r = { status: p.status, tipe: p.tipe, jam: p.jam, tanggal: b.hariIni.tanggal, zona: b.hariIni.zona, jarak: p.jarak, lokasi: '', skor: p.skor, flags: [], alasan: '' };
      } catch { /* abaikan */ }
    }
    if (!r) { kirim.tutup(); await pilihan({ judul: 'Gagal mengirim', pesan: esc(e.msg || e.message), ikon: 'cloud_off', tombol: [{ label: 'Tutup', nilai: 1 }] }); return null; }
  }
  kirim.tutup();
  await layarHasil(r);
  return r;
}

function layarHasil(r) {
  return new Promise(res => {
    const gaya = {
      VALID: ['#16A34A', 'check', r.tipe === 'MASUK' ? 'Presensi masuk berhasil' : 'Presensi pulang berhasil'],
      PERLU_DITINJAU: ['#D97706', 'pending', 'Tercatat · perlu ditinjau admin'],
      DITOLAK: ['#DC2626', 'close', 'Presensi ditolak']
    }[r.status] || ['#64748B', 'info', r.status];
    const el = document.createElement('div');
    el.className = 'hasil';
    el.innerHTML = `
      <div class="lingkar" style="background:${gaya[0]};box-shadow:0 0 0 14px ${gaya[0]}22">${ic(gaya[1])}</div>
      <h1 class="h-lg">${esc(gaya[2])}</h1>
      <div class="jam">${esc(String(r.jam || '').replace(/:/g, '.'))} <small style="font-size:18px;opacity:.6">${esc(r.zona || '')}</small></div>
      <div class="muted">${esc(tglPanjang(r.tanggal))} · jam server</div>
      <div class="rinci">
        <div><span class="muted">Status</span>${badge(r.status)}</div>
        <div><span class="muted">Lokasi</span><b>${esc(r.lokasi || '–')}</b></div>
        <div><span class="muted">Jarak</span><b>${esc(jarakTeks(r.jarak))}</b></div>
        <div><span class="muted">Skor wajah</span><b>${desimal(r.skor, 2)}</b></div>
        ${r.flags && r.flags.length ? `<div><span class="muted">Catatan</span><b style="text-align:right">${esc(r.flags.join(', '))}</b></div>` : ''}
      </div>
      ${r.alasan ? `<div class="note ${r.status === 'DITOLAK' ? 'bad' : 'warn'}" style="max-width:360px;margin-bottom:16px;text-align:left">${ic('info')}<div>${esc(r.alasan)}</div></div>` : ''}
      ${r.status === 'DITOLAK' && r.sisaCoba !== undefined ? `<div class="muted small mb-12">Sisa percobaan wajah: ${r.sisaCoba} dari 3 (10 menit)</div>` : ''}
      <div class="row" style="width:min(360px,100%)">
        ${r.status === 'DITOLAK' ? `<a class="btn ghost grow" href="#/pengajuan?jenis=KOREKSI_PRESENSI" data-ok>Ajukan Koreksi</a>` : ''}
        <button class="btn grow" data-ok style="min-height:52px">Selesai</button>
      </div>`;
    document.body.appendChild(el);
    if (navigator.vibrate) navigator.vibrate(r.status === 'VALID' ? [60] : [80, 60, 80]);
    el.querySelectorAll('[data-ok]').forEach(b => { b.onclick = () => { el.remove(); res(); }; });
  });
}
