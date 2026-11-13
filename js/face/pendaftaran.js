/* =====================================================================
   face/pendaftaran.js — Pendaftaran wajah 5 sampel (PRD 5.2):
   Persetujuan → Ambil Sampel (depan, sedikit kiri, sedikit kanan,
   dengan/tanpa kacamata) → Pemeriksaan Kualitas → Selesai.
   Yang dikirim ke server hanya vektor angka; foto sampel tidak disimpan.
   ===================================================================== */
import { esc, ic, modal, avatar, sibuk, toast, siapkanUnggahan, desimal } from '../core/util.js';
import { muatMesin, mesinSimulasi, ambilBingkai, kualitas } from './engine.js';
import { mulaiKamera } from './kamera.js';
import { DEMO } from '../core/api.js';

function pose(kacamata) {
  return [
    { k: 'DEPAN', label: 'Pose 1: Hadap depan', cek: a => Math.abs(a.yaw) < 0.07 },
    { k: 'KIRI', label: 'Pose 2: Hadapkan wajah sedikit ke kiri', cek: a => a.yaw > 0.08 && a.yaw < 0.32 },
    { k: 'KANAN', label: 'Pose 3: Hadapkan wajah sedikit ke kanan', cek: a => a.yaw < -0.08 && a.yaw > -0.32 },
    kacamata ? { k: 'KACAMATA', label: 'Pose 4: Hadap depan memakai kacamata', cek: a => Math.abs(a.yaw) < 0.08, jeda: 'Pakai kacamata Anda' }
      : { k: 'DEPAN2', label: 'Pose 4: Hadap depan, sedikit lebih dekat', cek: a => Math.abs(a.yaw) < 0.08 && a.kotak.w > 0.3 },
    kacamata ? { k: 'TANPA', label: 'Pose 5: Hadap depan tanpa kacamata', cek: a => Math.abs(a.yaw) < 0.08, jeda: 'Lepas kacamata Anda' }
      : { k: 'DEPAN3', label: 'Pose 5: Hadap depan, dagu sedikit terangkat', cek: a => Math.abs(a.yaw) < 0.08 }
  ];
}

const kos = (a, b) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return s / (Math.sqrt(na * nb) || 1); };

/**
 * @param {object} o pegawai {id,nama,nip,unit,jabatan}, mode 'admin'|'mandiri', kirim(vektor[], persetujuan, berkas) → Promise
 */
export function bukaPendaftaran(o) {
  const p = o.pegawai;
  let langkah = 1, kacamata = false, setuju = false, berkas = null, sampel = [], ulangIdx = null;
  let henti = null, raf = 0;
  const m = modal({ judul: 'Pendaftaran biometrik wajah', sub: 'MODUL VERIFIKASI · uji kualitas otomatis · 5 sampel', ukuran: 'lg', tutupLuar: false, onTutup: () => matikan() });
  const body = m.el.querySelector('.modal-b');
  const matikan = () => { cancelAnimationFrame(raf); if (henti) { henti(); henti = null; } };

  const stepper = () => `<div class="steps">${['Persetujuan', 'Ambil Sampel', 'Pemeriksaan Kualitas', 'Selesai'].map((t, i) => {
    const n = i + 1, kls = n < langkah ? 'ok' : n === langkah ? 'on' : '';
    return `${i ? '<span class="garis"></span>' : ''}<span class="st ${kls}"><i>${n < langkah ? ic('check', 'sm') : n}</i>${t}</span>`;
  }).join('')}</div>`;
  const kartuPegawai = () => `<div class="card p-16 row gap-12">${avatar(p.nama, 'lg')}<div><b style="font-size:16px">${esc(p.nama)}</b> ${ic('verified', 'sm')}<div class="small muted">NIP ${esc(p.nip || '-')}</div><div class="small muted">${esc(p.unit || '')}${p.jabatan ? ' · ' + esc(p.jabatan) : ''}</div></div></div>`;

  function gambar() {
    matikan();
    if (langkah === 1) {
      body.innerHTML = stepper() + `<div class="g-2">${kartuPegawai()}<div class="note">${ic('privacy_tip')}<div>Data biometrik termasuk <b>data pribadi spesifik</b> (UU No. 27/2022). Yang disimpan hanya <b>vektor angka terenkripsi AES-256</b>, bukan foto. Template dihapus paling lambat 30 hari setelah pegawai nonaktif.</div></div></div>
        <div class="col gap-12 mt-16">
          <label class="check"><input type="checkbox" id="pd-setuju" ${setuju ? 'checked' : ''}><span><b>${o.mode === 'admin' ? 'Pegawai menyetujui' : 'Saya menyetujui'}</b> pemrosesan data biometrik wajah untuk keperluan presensi. Waktu persetujuan dicatat.</span></label>
          <label class="check"><input type="checkbox" id="pd-kaca" ${kacamata ? 'checked' : ''}><span>Pegawai <b>berkacamata</b> (ambil sampel dengan & tanpa kacamata)</span></label>
          ${o.mode === 'admin' ? `<div class="field"><label>Formulir persetujuan bertanda tangan (opsional, PDF/JPG)</label>
            <div class="row"><label class="btn ghost sm">${ic('upload_file', 'sm')} Pilih berkas<input type="file" hidden id="pd-file" accept="application/pdf,image/jpeg,image/png"></label><span class="small muted" id="pd-fnama">${berkas ? esc(berkas.nama) : 'Belum ada berkas'}</span></div></div>` : ''}
          <div class="note warn">${ic('tips_and_updates')}<div>Tips: ruangan cukup terang, cahaya dari depan (bukan dari belakang), tanpa masker/topi, ekspresi netral.</div></div>
        </div>
        <div class="row mt-16" style="justify-content:flex-end"><button class="btn ghost" data-tutup>Batal</button><button class="btn" id="pd-lanjut">Mulai ambil sampel ${ic('arrow_forward', 'sm')}</button></div>`;
      body.querySelector('#pd-setuju').onchange = e => { setuju = e.target.checked; };
      body.querySelector('#pd-kaca').onchange = e => { kacamata = e.target.checked; };
      const f = body.querySelector('#pd-file');
      if (f) f.onchange = async () => { try { berkas = await siapkanUnggahan(f.files[0]); body.querySelector('#pd-fnama').textContent = berkas.nama; } catch (e) { toast(e.message, 'bad'); } };
      body.querySelector('#pd-lanjut').onclick = () => {
        if (!setuju) { toast('Persetujuan biometrik wajib dicentang.', 'warn'); return; }
        langkah = 2; sampel = []; gambar();
      };
      return;
    }
    if (langkah === 2) return langkahKamera();
    if (langkah === 3) return langkahKualitas();
    body.innerHTML = stepper() + `<div class="empty">${ic('task_alt')}<b style="font-size:18px;color:var(--text)">Pendaftaran wajah berhasil</b><p>${esc(p.nama)} sekarang dapat melakukan presensi dengan verifikasi wajah.</p><button class="btn" data-tutup>Selesai</button></div>`;
  }

  function langkahKamera() {
    const daftar = pose(kacamata);
    const target = ulangIdx !== null ? [ulangIdx] : daftar.map((_, i) => i).filter(i => !sampel[i]);
    body.innerHTML = stepper() + `<div class="g-2-1" style="grid-template-columns:minmax(0,1.5fr) minmax(240px,1fr)">
      <div class="enroll-cam"><video playsinline muted></video><div class="oval"></div><div class="pose" id="pd-pose">Menyiapkan kamera…</div></div>
      <div class="col gap-12">${kartuPegawai()}
        <div class="row between"><span class="h-sm">Kemajuan sampel</span><b class="small" id="pd-prog">${sampel.filter(Boolean).length} dari 5 sampel</b></div>
        <div class="thumbs">${daftar.map((d, i) => `<div class="th ${sampel[i] ? 'ok' : ''} ${i === target[0] ? 'on' : ''}" id="pd-th-${i}">${sampel[i] ? `<img src="${sampel[i].thumb}" alt="">` : i + 1}</div>`).join('')}</div>
        <div class="col gap-4 small" id="pd-cek"></div>
        <div class="note" id="pd-pesan">${ic('info')}<div>Ikuti instruksi di atas video. Foto diambil otomatis bila pose & kualitas sesuai.</div></div>
      </div></div>`;
    const video = body.querySelector('video'), oval = body.querySelector('.oval');
    const set = (id, h) => { const e = body.querySelector(id); if (e) e.innerHTML = h; };
    (async () => {
      try {
        henti = await mulaiKamera(video);
        let mesin;
        try { mesin = await muatMesin(); } catch (e) { if (DEMO) mesin = mesinSimulasi(); else throw new Error('Model wajah gagal dimuat. Periksa koneksi lalu coba lagi.'); }
        let idx = 0, tahan = 0, sibukAmbil = false, jedaSampai = 0, frame = 0;
        const mulaiPose = () => {
          const ps = daftar[target[idx]];
          set('#pd-pose', esc(ps.label.toUpperCase()));
          if (ps.jeda) { jedaSampai = performance.now() + 3500; set('#pd-pesan', ic('schedule') + `<div><b>${esc(ps.jeda)}</b> — pengambilan dimulai dalam 3 detik.</div>`); }
          if (mesin.setTahap) mesin.setTahap(ps.k === 'KIRI' ? 'TENGOK_KIRI' : ps.k === 'KANAN' ? 'TENGOK_KANAN' : 'tengah');
        };
        mulaiPose();
        const loop = async () => {
          raf = requestAnimationFrame(loop);
          if (sibukAmbil || ++frame % 3) return;
          if (performance.now() < jedaSampai) return;
          const a = mesin.deteksi(video);
          const ps = daftar[target[idx]];
          const q = a.wajah === 1 && !mesin.simulasi ? kualitas(video, a.kotak) : { cukupTerang: true, cukupTajam: true, terang: 128, tajam: 200 };
          const ok1 = a.wajah === 1, okPose = ok1 && ps.cek(a), okQ = q.cukupTerang && q.cukupTajam;
          set('#pd-cek', [[ok1, a.wajah > 1 ? 'Lebih dari satu wajah' : 'Satu wajah terdeteksi'], [ok1 && okQ ? true : ok1 ? false : null, `Cahaya ${Math.round(q.terang)} · ketajaman ${Math.round(q.tajam)}`], [okPose, 'Pose sesuai instruksi']]
            .map(([v, t]) => `<span class="row" style="color:${v ? 'var(--ok-dark)' : v === false ? 'var(--bad-dark)' : 'var(--text-3)'}">${ic(v ? 'check_circle' : v === false ? 'cancel' : 'radio_button_unchecked', 'sm')} ${esc(t)}</span>`).join(''));
          oval.className = 'oval ' + (okPose && okQ ? 'ok' : '');
          if (!(okPose && okQ)) { tahan = 0; return; }
          if (++tahan < 5) return;
          sibukAmbil = true;
          const kanvas = ambilBingkai(video);
          const v = await mesin.vektor(kanvas);
          if (!v) { sibukAmbil = false; tahan = 0; set('#pd-pesan', ic('error') + '<div>Wajah belum terbaca jelas, tahan posisi…</div>'); return; }
          const th = document.createElement('canvas'); th.width = 120; th.height = 120;
          const s = Math.min(kanvas.width, kanvas.height);
          th.getContext('2d').drawImage(kanvas, (kanvas.width - s) / 2, (kanvas.height - s) / 2, s, s, 0, 0, 120, 120);
          sampel[target[idx]] = { vektor: v, thumb: th.toDataURL('image/jpeg', 0.7), q, pose: ps.k };
          const thEl = body.querySelector('#pd-th-' + target[idx]);
          if (thEl) { thEl.className = 'th ok'; thEl.innerHTML = `<img src="${sampel[target[idx]].thumb}" alt="">`; }
          set('#pd-prog', `${sampel.filter(Boolean).length} dari 5 sampel (${sampel.filter(Boolean).length * 20}%)`);
          if (navigator.vibrate) navigator.vibrate(40);
          idx++; tahan = 0;
          if (idx >= target.length) { matikan(); ulangIdx = null; langkah = 3; setTimeout(gambar, 300); return; }
          const nx = body.querySelector('#pd-th-' + target[idx]); if (nx) nx.classList.add('on');
          setTimeout(() => { sibukAmbil = false; jedaSampai = performance.now() + 900; mulaiPose(); }, 400);
        };
        loop();
      } catch (e) {
        set('#pd-pesan', ic('error') + `<div>${esc(e.message)}</div>`);
        body.querySelector('#pd-pesan').className = 'note bad';
      }
    })();
  }

  function langkahKualitas() {
    const v = sampel.map(s => s.vektor);
    const rata = v[0].map((_, i) => v.reduce((a, x) => a + x[i], 0) / v.length);
    const daftar = pose(kacamata);
    const baris = sampel.map((s, i) => {
      const k = kos(s.vektor, rata), ok = k >= 0.8 && s.q.cukupTerang && s.q.cukupTajam;
      s.ok = ok;
      return `<tr><td><img src="${s.thumb}" style="width:44px;height:44px;border-radius:10px;transform:scaleX(-1)" alt=""></td><td><b>${esc(daftar[i].label)}</b></td>
        <td class="num">${Math.round(s.q.terang)}</td><td class="num">${Math.round(s.q.tajam)}</td><td class="num">${desimal(k, 3)}</td>
        <td>${ok ? '<span class="badge b-ok">' + ic('check') + 'Baik</span>' : `<button class="btn sm ghost" data-ulang="${i}">${ic('refresh', 'sm')} Ulangi</button>`}</td></tr>`;
    }).join('');
    const semuaOk = sampel.every(s => s.ok);
    body.innerHTML = stepper() + `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Pose</th><th class="num">Cahaya</th><th class="num">Ketajaman</th><th class="num">Konsistensi</th><th>Hasil</th></tr></thead><tbody>${baris}</tbody></table></div>
      <div class="note ${semuaOk ? 'ok' : 'warn'} mt-12">${ic(semuaOk ? 'verified' : 'warning')}<div>${semuaOk ? 'Semua sampel lolos pemeriksaan kualitas otomatis.' : 'Ada sampel yang kurang baik. Ulangi sampel tersebut agar pengenalan wajah akurat.'} Server juga memeriksa konsistensi & kemiripan dengan wajah pegawai lain.</div></div>
      <div class="row mt-16" style="justify-content:flex-end"><button class="btn ghost" id="pd-ulang-semua">Ulangi semua</button><button class="btn green" id="pd-simpan" data-sibuk=" Menyimpan…" ${semuaOk ? '' : 'disabled'}>${ic('save', 'sm')} Simpan template wajah</button></div>`;
    body.querySelectorAll('[data-ulang]').forEach(b => b.onclick = () => { const i = +b.dataset.ulang; sampel[i] = null; ulangIdx = i; langkah = 2; gambar(); });
    body.querySelector('#pd-ulang-semua').onclick = () => { sampel = []; ulangIdx = null; langkah = 2; gambar(); };
    const s = body.querySelector('#pd-simpan');
    s.onclick = () => sibuk(s, async () => {
      try { await o.kirim(sampel.map(x => x.vektor), true, berkas); langkah = 4; gambar(); }
      catch (e) { toast(e.msg || e.message, 'bad', 6000); }
    });
  }

  gambar();
  return m;
}
