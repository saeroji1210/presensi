/* =====================================================================
   face/kamera.js — Layar kamera presensi (PRD 5.3 langkah 4, UI 7.3):
   layar penuh, panduan oval, spanduk tantangan + progres, foto otomatis.
   Urutan tantangan berasal dari server (nonce) dan dikirim balik apa adanya.
   ===================================================================== */
import { ic, esc } from '../core/util.js';
import { muatMesin, mesinSimulasi, ambilBingkai, kompresFoto, kualitas } from './engine.js';
import { DEMO } from '../core/api.js';

const TEKS = {
  KEDIP: ['visibility', 'Kedipkan mata Anda'],
  TENGOK_KIRI: ['arrow_back', 'Tengok perlahan ke kiri'],
  TENGOK_KANAN: ['arrow_forward', 'Tengok perlahan ke kanan'],
  SENYUM: ['mood', 'Tersenyumlah'],
  HADAP: ['center_focus_strong', 'Hadap lurus ke kamera'],
  POSISI: ['face', 'Posisikan wajah di dalam oval']
};

export async function mulaiKamera(video) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw Object.assign(new Error('Browser tidak mendukung kamera. Gunakan Chrome/Safari terbaru.'), { kode: 'KAMERA' });
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  } catch (e) {
    const pesan = e.name === 'NotAllowedError' ? 'Izin kamera ditolak. Izinkan kamera untuk situs ini di pengaturan browser, lalu coba lagi.'
      : e.name === 'NotFoundError' ? 'Kamera tidak ditemukan di perangkat ini.' : 'Kamera tidak bisa dibuka: ' + e.message;
    throw Object.assign(new Error(pesan), { kode: 'KAMERA' });
  }
  video.srcObject = stream;
  video.setAttribute('playsinline', ''); video.muted = true;
  await video.play().catch(() => {});
  await new Promise(r => { if (video.videoWidth) r(); else video.onloadedmetadata = () => r(); setTimeout(r, 3000); });
  return () => stream.getTracks().forEach(t => t.stop());
}

async function siapkanMesin(muat, vektorDemo) {
  try { return await muat(); }
  catch (e) {
    if (DEMO) return mesinSimulasi(vektorDemo);
    throw Object.assign(new Error('Model wajah gagal dimuat. Periksa koneksi internet lalu coba lagi.'), { kode: 'MODEL' });
  }
}

/**
 * Jalankan kamera presensi.
 * @returns Promise<{vektor, liveness:{urutan,lulus,durasi,frame,pasif}, foto}>
 */
export function kameraPresensi({ judul = 'Verifikasi Wajah', tantangan = [], lokasiOk = true, vektorDemo }) {
  return new Promise((selesai, batal) => {
    const el = document.createElement('div');
    el.className = 'cam';
    el.innerHTML = `
      <video playsinline muted></video><div class="redup"></div><div class="oval"></div>
      <div class="atas">
        <button class="ibtn" data-x aria-label="Batal">${ic('arrow_back')}</button>
        <div class="judul"><b>${esc(judul)}</b><small id="cm-lang">Menyiapkan…</small></div>
        <button class="ibtn" data-terang aria-label="Layar terang">${ic('light_mode')}</button>
      </div>
      <div class="center"><div class="instruksi" id="cm-ins">${ic('face')}<span>Posisikan wajah di dalam oval</span></div></div>
      <div class="progres"><div class="ket"><span>Progres uji kehidupan</span><b id="cm-pct">0%</b></div><div class="bar"><i id="cm-bar" style="width:0"></i></div></div>
      <div class="bawah">
        <div class="chips-st"><span data-c="wajah">${ic('face', 'sm')} Wajah</span><span data-c="cahaya">${ic('light_mode', 'sm')} Pencahayaan</span><span data-c="lokasi" class="${lokasiOk ? 'ok' : 'bad'}">${ic(lokasiOk ? 'check' : 'close', 'sm')} Lokasi</span></div>
        <div class="pesan" id="cm-psn">Kamera otomatis mengambil foto saat tantangan terpenuhi.</div>
        <div class="kecil">${ic('shield', 'sm')} Tantangan acak dari server mencegah foto/video rekaman</div>
        <div class="kecil">${ic('lock', 'sm')} Yang dikirim: vektor angka wajah + 1 foto audit terkompresi</div>
      </div>
      <div class="muat" id="cm-muat"><div class="spin w"></div><b>Menyiapkan kamera & model wajah…</b><small class="faint">Pertama kali ±10–20 detik, berikutnya instan (tersimpan di perangkat).</small></div>`;
    document.body.appendChild(el);
    const video = el.querySelector('video'), oval = el.querySelector('.oval');
    const $ = s => el.querySelector(s);
    let henti = null, mati = false, raf = 0;
    const tutup = () => { mati = true; cancelAnimationFrame(raf); henti && henti(); el.remove(); };
    el.querySelector('[data-x]').onclick = () => { tutup(); batal(Object.assign(new Error('Dibatalkan'), { kode: 'BATAL' })); };
    el.querySelector('[data-terang]').onclick = () => el.classList.toggle('terang');
    const chip = (k, ok) => { const c = el.querySelector(`[data-c="${k}"]`); c.classList.toggle('ok', ok === true); c.classList.toggle('bad', ok === false); };
    const instruksi = (k, extra) => { const t = TEKS[k] || TEKS.POSISI; $('#cm-ins').innerHTML = ic(t[0]) + `<span>${esc(extra || t[1])}</span>`; };
    const pesan = t => { $('#cm-psn').textContent = t; };
    const total = tantangan.length + 1;
    const progres = (n) => { const p = Math.round(n / total * 100); $('#cm-pct').textContent = p + '%'; $('#cm-bar').style.width = p + '%'; };

    (async () => {
      try {
        henti = await mulaiKamera(video);
        const mesin = await siapkanMesin(muatMesin, vektorDemo);
        if (mati) return;
        $('#cm-muat').remove();
        const t0 = performance.now();
        let fase = 'POSISI', i = 0, tahan = 0, frame = 0, hilangSejak = 0, mulaiTantangan = 0, kedipTertutup = false, kedipTerbuka = false;
        let terakhirCahaya = 0, ambil = false, salahArah = 0;
        const ganti = f => { fase = f; tahan = 0; kedipTertutup = false; kedipTerbuka = false; salahArah = 0; mulaiTantangan = performance.now(); mesin.setTahap && mesin.setTahap(f); };
        $('#cm-lang').textContent = tantangan.length ? `● Tantangan 1 dari ${tantangan.length}` : '● Verifikasi';
        mesin.setTahap && mesin.setTahap('tengah');

        const langkah = async () => {
          if (mati) return;
          raf = requestAnimationFrame(langkah);
          frame++;
          if (frame % 2 || ambil) return; // ± 30 fps → 15 deteksi/detik
          const a = mesin.deteksi(video);
          const now = performance.now();
          if (now - terakhirCahaya > 700 && !mesin.simulasi) {
            terakhirCahaya = now;
            const q = kualitas(video, a.kotak);
            chip('cahaya', q.cukupTerang);
            if (!q.cukupTerang) pesan(q.terang <= 55 ? 'Terlalu gelap. Tekan ikon matahari atau pindah ke tempat lebih terang.' : 'Terlalu silau. Hindari cahaya langsung dari belakang.');
          } else if (mesin.simulasi) chip('cahaya', true);

          if (a.wajah !== 1) {
            chip('wajah', false); oval.className = 'oval bad';
            if (!hilangSejak) hilangSejak = now;
            if (a.wajah > 1) pesan('Terdeteksi lebih dari satu wajah. Pastikan hanya Anda di depan kamera.');
            else if (now - hilangSejak > 1500) { pesan('Wajah tidak terlihat. Posisikan wajah di dalam oval.'); if (fase !== 'POSISI' && fase !== 'HADAP') { tahan = 0; kedipTertutup = false; } }
            return;
          }
          hilangSejak = 0;
          chip('wajah', true);
          const k = a.kotak, cx = k.x + k.w / 2, cy = k.y + k.h / 2;
          const pas = cx > 0.28 && cx < 0.72 && cy > 0.2 && cy < 0.72 && k.w > 0.22 && k.w < 0.85;
          oval.className = 'oval ' + (pas ? 'ok' : '');
          if (!pas) { pesan(k.w <= 0.22 ? 'Dekatkan wajah ke kamera.' : k.w >= 0.85 ? 'Jauhkan sedikit wajah dari kamera.' : 'Posisikan wajah di tengah oval.'); return; }

          if (fase === 'POSISI') {
            instruksi('POSISI'); pesan('Tahan posisi…');
            if (++tahan > 8) { if (tantangan.length) { ganti(tantangan[0]); instruksi(tantangan[0]); } else ganti('HADAP'); }
            return;
          }
          if (fase !== 'HADAP') {
            let lolos = false;
            if (fase === 'KEDIP') {
              if (a.kedip < 0.3) { if (kedipTertutup) lolos = true; else kedipTerbuka = true; }
              if (a.kedip > 0.5 && kedipTerbuka) kedipTertutup = true;
              pesan(kedipTertutup ? 'Buka mata kembali…' : 'Kedipkan kedua mata dengan jelas.');
            } else if (fase === 'TENGOK_KIRI' || fase === 'TENGOK_KANAN') {
              const arah = fase === 'TENGOK_KIRI' ? 1 : -1;
              if (a.yaw * arah > 0.13) { if (++tahan >= 3) lolos = true; }
              else { tahan = 0; if (a.yaw * arah < -0.18 && ++salahArah > 6) pesan(fase === 'TENGOK_KIRI' ? 'Arah terbalik — tengok ke KIRI Anda.' : 'Arah terbalik — tengok ke KANAN Anda.'); else pesan('Putar kepala perlahan, lalu kembali ke depan.'); }
            } else if (fase === 'SENYUM') {
              if (a.senyum > 0.55) { if (++tahan >= 3) lolos = true; } else { tahan = 0; pesan('Tersenyum lebar sampai terlihat gigi.'); }
            }
            if (now - mulaiTantangan > 15000) { pesan('Tantangan belum terdeteksi. Ikuti instruksi di atas.'); mulaiTantangan = now; }
            if (lolos) {
              i++;
              progres(i);
              if (navigator.vibrate) navigator.vibrate(40);
              if (i < tantangan.length) { $('#cm-lang').textContent = `● Tantangan ${i + 1} dari ${tantangan.length}`; ganti(tantangan[i]); instruksi(tantangan[i]); }
              else { $('#cm-lang').textContent = '● Mengambil foto'; ganti('HADAP'); instruksi('HADAP'); }
            }
            return;
          }
          // HADAP: wajah lurus & mata terbuka → ambil bingkai terbaik
          if (Math.abs(a.yaw) < 0.08 && a.kedip < 0.35) {
            if (++tahan < 4) { pesan('Tahan…'); return; }
            ambil = true;
            pesan('Memproses wajah…');
            const kanvas = ambilBingkai(video);
            let vektor = null;
            for (let coba = 0; coba < 4 && !vektor; coba++) {
              vektor = await mesin.vektor(coba === 0 ? kanvas : ambilBingkai(video));
            }
            if (!vektor) { ambil = false; tahan = 0; pesan('Wajah belum terbaca jelas. Hadap lurus & pastikan cukup terang.'); return; }
            const skorPasif = await mesin.pasif(kanvas, a.kotak);
            progres(total);
            const hasil = {
              vektor,
              liveness: { urutan: tantangan.slice(), lulus: i === tantangan.length, durasi: Math.round(performance.now() - t0), frame, pasif: skorPasif },
              foto: kompresFoto(kanvas)
            };
            tutup();
            selesai(hasil);
          } else { tahan = 0; pesan('Hadap lurus ke kamera dengan mata terbuka.'); }
        };
        langkah();
      } catch (e) {
        if (mati) return;
        const m = $('#cm-muat') || el.appendChild(Object.assign(document.createElement('div'), { className: 'muat' }));
        m.innerHTML = `<span class="ic xl" style="color:#F87171">no_photography</span><b>${esc(e.message)}</b>
          <div class="row"><button class="btn ghost" data-tutup2>Tutup</button><button class="btn" data-ulang>Coba lagi</button></div>`;
        m.querySelector('[data-tutup2]').onclick = () => { tutup(); batal(e); };
        m.querySelector('[data-ulang]').onclick = () => { tutup(); batal(Object.assign(new Error('ULANG'), { kode: 'ULANG' })); };
      }
    })();
  });
}
