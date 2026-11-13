/* =====================================================================
   pegawai/profil.js — Profil (PRD 7.3): data diri, status wajah,
   perangkat terdaftar, persetujuan biometrik, jadwal, unduh rekap,
   daftar wajah dengan kode admin, FAQ & privasi, keluar.
   ===================================================================== */
import { esc, ic, avatar, badge, tgl, modal, sibuk, toast, galat, jamTitik } from '../core/util.js';
import { api, LS } from '../core/api.js';
import { dengar, segarkan, boot } from './data.js';
import { keluar } from '../auth.js';

const HARI = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
function rentangHari(h) {
  if (!h || !h.length) return '-';
  const s = h.slice().sort();
  const urut = s.every((x, i) => !i || x === s[i - 1] + 1);
  return urut && s.length > 2 ? `${HARI[s[0]]} – ${HARI[s[s.length - 1]]}` : s.map(x => HARI[x]).join(', ');
}

export async function render(el) {
  const gambar = d => {
    if (!d || !d.profil) { el.innerHTML = '<div class="pf-hero" style="height:240px"></div>'; return; }
    const p = d.profil, h = d.hariIni, pr = d.perangkat || {}, ses = LS.get('pp_sesi') || {};
    const wajahOk = p.status_wajah === 'TERDAFTAR';
    el.innerHTML = `
      <section class="pf-hero">${avatar(p.nama, 'xl')}<h1 class="h-lg">${esc(p.nama)}</h1>
        <div class="nip">NIP ${esc(p.nip || '-')}</div><div style="color:#C7D2FE">${esc(p.jabatan || '')}${p.unit ? ' · ' + esc(p.unit) : ''}</div></section>
      <div class="m-wrap">
        <div class="m-card" style="margin-top:-44px;position:relative">
          <div class="row between"><h2 class="h-sm muted">Status keamanan & perangkat</h2><i class="dot" style="background:${wajahOk && pr.terdaftar ? 'var(--ok)' : 'var(--wait)'}"></i></div>
          <div class="pf-item"><span class="bulat" style="color:${wajahOk ? 'var(--ok)' : 'var(--wait)'}">${ic('face')}</span><div class="grow"><b>Wajah ${wajahOk ? 'terdaftar' : 'belum terdaftar'}</b><small>${wajahOk ? 'Template terenkripsi tersimpan di server' : 'Hubungi admin atau gunakan kode pendaftaran'}</small></div>${badge(p.status_wajah)}</div>
          <div class="pf-item"><span class="bulat" style="color:${pr.terdaftar ? 'var(--primary)' : 'var(--bad)'}">${ic('smartphone')}</span><div class="grow"><b>Perangkat ${pr.terdaftar ? 'terikat' : pr.kosong ? 'belum terikat' : 'lain'}</b><small>${esc(pr.info || 'Perangkat terikat otomatis saat presensi pertama')}${pr.id ? ' · ' + esc(pr.id) : ''}</small></div>
            <span class="badge ${pr.terdaftar ? 'b-info' : pr.kosong ? 'b-neutral' : 'b-bad'}">${pr.terdaftar ? 'Perangkat ini' : pr.kosong ? '–' : 'Bukan ini'}</span></div>
          <div class="pf-item"><span class="bulat" style="color:var(--duty)">${ic('verified_user')}</span><div class="grow"><b>Persetujuan biometrik</b><small>Sesuai UU PDP No. 27/2022 · <a href="javascript:void 0" data-privasi>lihat kebijakan</a></small></div></div>
          ${!wajahOk ? `<button class="btn block mt-12" id="pf-daftar">${ic('add_reaction')} Daftarkan wajah dengan kode admin</button>` : ''}
        </div>
        <div class="m-card mt-16">
          <h2 class="h-sm muted">Jadwal kerja & ketentuan</h2>
          <div class="pf-item"><span class="bulat" style="color:var(--primary)">${ic('schedule')}</span><div><small>Hari & jam presensi</small><b>${esc(rentangHari(h && h.jadwal.hari))} · ${jamTitik(h && h.jadwal.masuk)} – ${jamTitik(h && h.jadwal.pulang)} ${esc(h ? h.zona : '')}</b><small>Toleransi terlambat ${h ? h.jadwal.toleransi : 0} menit</small></div></div>
          <div class="pf-item"><span class="bulat" style="color:var(--ok)">${ic('location_on')}</span><div><small>Batas geofencing</small><b>${h && h.lokasi ? esc(h.lokasi.nama) + ' (radius ' + h.lokasi.radius + ' m)' : 'Belum diatur'}</b></div></div>
        </div>
        <div class="m-card mt-16 pf-menu">
          <a href="#/riwayat">${'<span class="bulat" style="background:var(--duty-tint);color:var(--duty)">' + ic('download') + '</span>'}<div class="grow"><b>Unduh rekap presensi pribadi (PDF)</b><br><small class="muted">Buka Riwayat lalu tekan tombol unduh</small></div>${ic('chevron_right')}</a>
          <button data-faq>${'<span class="bulat" style="background:var(--leave-tint);color:var(--leave)">' + ic('help') + '</span>'}<div class="grow"><b>Panduan & pertanyaan umum</b></div>${ic('chevron_right')}</button>
          <button data-privasi>${'<span class="bulat" style="background:var(--primary-tint);color:var(--primary)">' + ic('shield') + '</span>'}<div class="grow"><b>Kebijakan privasi & perlindungan data</b></div>${ic('chevron_right')}</button>
          ${d.peran && d.peran.admin ? `<button data-admin>${'<span class="bulat" style="background:#E0E7FF;color:#3730A3">' + ic('admin_panel_settings') + '</span>'}<div class="grow"><b>Buka panel admin</b></div>${ic('chevron_right')}</button>` : ''}
        </div>
        <button class="btn block mt-16" style="background:var(--bad-tint);color:var(--bad);min-height:54px" id="pf-keluar">${ic('logout')} Keluar dari akun</button>
        <div class="center tiny faint mt-16">Presensi Pegawai PWA v${esc(d.versi || '1.0.0')} · ${esc(d.instansi || '')}<br>Sesi berlaku sampai ${ses.exp ? tgl(new Date(ses.exp).toISOString()) : '-'}</div>
      </div>`;
    el.querySelectorAll('[data-privasi]').forEach(b => b.onclick = privasi);
    el.querySelector('[data-faq]').onclick = faq;
    const ad = el.querySelector('[data-admin]'); if (ad) ad.onclick = () => import('../app.js').then(m => m.gantiMode('admin'));
    el.querySelector('#pf-keluar').onclick = async () => { const k = el.querySelector('#pf-keluar'); await sibuk(k, () => keluar(false)); };
    const df = el.querySelector('#pf-daftar'); if (df) df.onclick = () => daftarKode(p);
  };
  const lepas = dengar(gambar);
  if (!boot()) gambar(null);
  segarkan();
  return lepas;
}

function daftarKode(p) {
  const m = modal({
    judul: 'Kode pendaftaran wajah', sub: 'Minta admin kepegawaian membuat kode (berlaku 15 menit), lalu lakukan pendaftaran di ponsel ini bersama admin.',
    isi: `<div class="field"><label>Kode 6 karakter</label><input class="input" id="kd" maxlength="6" autocomplete="one-time-code" style="font-size:22px;letter-spacing:.3em;text-transform:uppercase;text-align:center"></div>`,
    kaki: `<button class="btn ghost" data-tutup>Batal</button><button class="btn" id="kd-ok">Lanjut</button>`
  });
  m.el.querySelector('#kd-ok').onclick = async () => {
    const kode = m.el.querySelector('#kd').value.trim().toUpperCase();
    if (kode.length !== 6) { toast('Kode harus 6 karakter.', 'warn'); return; }
    m.tutup();
    const { bukaPendaftaran } = await import('../face/pendaftaran.js');
    bukaPendaftaran({
      pegawai: p, mode: 'mandiri',
      kirim: async vektor => { await api('wajah.daftarMandiri', { kode, vektor, persetujuan: true }, { invalidasi: ['boot'] }); toast('Wajah berhasil didaftarkan.', 'ok'); segarkan(); }
    });
  };
}

function faq() {
  const qa = [
    ['Kenapa presensi saya ditolak "di luar radius"?', 'Jarak dihitung ulang di server dari titik GPS terbaik Anda. Pastikan GPS aktif, tunggu status "Dalam radius", lalu tekan tombol. Di dalam gedung, dekati jendela.'],
    ['Wajah tidak cocok padahal saya sendiri?', 'Pastikan cahaya dari depan, lepas masker/topi, dan hadap lurus saat foto diambil. Setelah 3 kali gagal dalam 10 menit, ajukan Koreksi Presensi. Admin juga bisa mendaftarkan ulang wajah Anda.'],
    ['Saya ganti HP / data browser terhapus', 'Login di perangkat baru akan berstatus "menunggu persetujuan". Hubungi admin kepegawaian untuk menyetujui atau mereset perangkat.'],
    ['Lupa presensi pulang?', 'Ajukan Koreksi Presensi (menu Pengajuan → Koreksi) dengan jam sebenarnya dan bukti, paling lambat 30 hari.'],
    ['Apakah lembur otomatis dihitung?', 'Tidak. Kelebihan jam hanya dihitung lembur bila ada Surat Perintah Lembur atau pengajuan lembur yang disetujui admin.'],
    ['Jam di aplikasi beda dengan jam HP?', 'Aplikasi selalu memakai jam server sehingga mengubah jam HP tidak berpengaruh.']
  ];
  modal({ judul: 'Panduan & FAQ', isi: qa.map(([q, a]) => `<details style="border-bottom:1px solid var(--line);padding:12px 0"><summary style="font-weight:600;cursor:pointer">${esc(q)}</summary><p class="muted" style="margin:8px 0 0">${esc(a)}</p></details>`).join('') });
}

function privasi() {
  modal({
    judul: 'Kebijakan privasi & perlindungan data', isi: `<div class="col gap-12 muted" style="font-size:14px">
    <p style="margin:0"><b>Data yang dikumpulkan:</b> vektor angka wajah (template), titik GPS saat presensi, satu foto audit terkompresi per presensi, identitas perangkat, serta berkas bukti pengajuan.</p>
    <p style="margin:0"><b>Penyimpanan:</b> Google Sheets & Drive milik akun pengelola instansi, tidak dibagikan publik. Template wajah dienkripsi AES-256 di berkas terpisah yang hanya dapat dibuka pemilik skrip.</p>
    <p style="margin:0"><b>Retensi:</b> foto presensi valid 90 hari, foto yang ditandai/ditinjau 1 tahun, template wajah dihapus paling lambat 30 hari setelah status pegawai nonaktif.</p>
    <p style="margin:0"><b>Dasar hukum:</b> persetujuan tertulis pegawai sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi. Anda dapat meminta penghapusan atau pendaftaran ulang melalui admin kepegawaian.</p></div>`
  });
}
