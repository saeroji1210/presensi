/* =====================================================================
   auth.js — Halaman masuk & alur SSO lewat proyek "SSO Bridge"
   (tanpa OAuth Client ID / Google Cloud Console).
   1) Klik "Masuk dengan Google" → buka BRIDGE_URL?s=<state>&r=<url ini>
   2) Bridge membaca email akun Google → kembali ke sini dengan #sso=<token>
   3) Token ditukar ke API (auth.tukar) → token sesi 7 hari terikat perangkat
   ===================================================================== */
import { api, sesi, deviceId, infoPerangkat, LS, DEMO } from './core/api.js';
import { esc, ic, modal, sibuk, toast } from './core/util.js';

const GOOGLE = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

async function konfigurasi() {
  const c = LS.get('pp_cfg');
  if (c && Date.now() - c.t < 6 * 3600e3 && c.data.bridgeUrl) return c.data;
  const data = await api('auth.config');
  LS.set('pp_cfg', { t: Date.now(), data });
  return data;
}

export function renderLogin(root, { pesan = '', jenis = 'bad', onMasuk } = {}) {
  document.body.className = 'mode-login';
  const cfgLokal = (LS.get('pp_cfg') || {}).data || {};
  const instansi = cfgLokal.instansi || (window.APP_CONFIG || {}).NAMA_INSTANSI || 'Nama Instansi';
  root.innerHTML = `
  <main class="login">
    <section class="login-hero">
      <div class="row gap-12">
        <span class="logo">${ic('fingerprint')}</span>
        <div style="text-align:left"><div class="h-sm" style="color:#fff">PRESENSI PEGAWAI</div><div style="color:#93C5FD;font-weight:600" id="lg-inst">${esc(instansi)}</div></div>
      </div>
      <div class="phone-art" aria-hidden="true"><div class="oval"><div class="scan"></div></div>
        <div class="chip"><span class="badge b-ok">${ic('verified_user', 'fill')}</span><div><b>Biometrik anti-pemalsuan</b><div class="tiny muted">Uji kehidupan aktif</div></div></div></div>
      <div>
        <div class="row" style="color:#93C5FD;font-weight:600;letter-spacing:.12em;font-size:12px">${ic('verified', 'sm')} SISTEM PRESENSI TERINTEGRASI</div>
        <h1 class="mt-12">Hadir tepat,<br>tercatat akurat.</h1>
        <p class="lead">Presensi digital dengan verifikasi wajah, uji kehidupan, dan validasi GPS berlapis untuk instansi Anda.</p>
      </div>
      <div class="col gap-16 fitur-list">
        <div class="fitur">${ic('face')}<div><b>Verifikasi Wajah & Uji Kehidupan</b><span>Tantangan acak dari server (kedip, tengok, senyum) dan foto audit.</span></div></div>
        <div class="fitur">${ic('location_on')}<div><b>Lokasi Tervalidasi Berlapis</b><span>Multi-sampel GPS, radius dihitung ulang di server, deteksi pola lokasi palsu.</span></div></div>
        <div class="fitur">${ic('monitoring')}<div><b>Laporan & Lembur Otomatis</b><span>Rekap harian, lembur hanya bila disetujui, ekspor Excel & PDF.</span></div></div>
      </div>
      <div class="row between kaki-hero" style="margin-top:auto;color:#A5B4FC;font-size:12px;border-top:1px solid rgba(255,255,255,.1);padding-top:16px">
        <span>PWA · Google Apps Script</span><span id="lg-versi">Versi 1.0</span>
      </div>
    </section>
    <section class="login-side">
      <div class="card login-card">
        <div class="h-sm muted">SINGLE SIGN-ON INSTANSI</div>
        <h2 class="h-lg mt-8" style="text-transform:none;letter-spacing:.01em;font-size:24px">Selamat Datang</h2>
        <p class="muted" style="margin:6px 0 20px;font-size:15px">Masuk dengan akun Google yang terdaftar di bagian kepegawaian.</p>
        ${DEMO ? `
          <div class="note warn mb-12">${ic('science')}<div><b>Mode demo.</b> URL API belum diisi di <code>js/config.js</code>. Data di bawah ini contoh dan tidak disimpan.</div></div>
          <div class="col gap-12">
            <button class="btn-google btn" data-demo="pegawai">${ic('badge')} Masuk sebagai Pegawai (demo)</button>
            <button class="btn-google btn" data-demo="admin">${ic('admin_panel_settings')} Masuk sebagai Admin (demo)</button>
          </div>` : `
          <button class="btn btn-google" id="btn-google" data-sibuk=" Menghubungkan…">${GOOGLE} Masuk dengan Google</button>`}
        <div class="note mt-16">${ic('smartphone')}<div><b>Aktivasi perangkat terikat</b><br>Perangkat ini otomatis didaftarkan atas nama Anda saat login pertama. Ganti HP? Hubungi admin kepegawaian.</div></div>
        <div id="lg-pesan" class="mt-12">${pesan ? `<div class="note ${jenis}">${ic(jenis === 'bad' ? 'error' : jenis === 'warn' ? 'hourglass_top' : 'info')}<div>${esc(pesan)}</div></div>` : ''}</div>
        <div class="center mt-16"><button class="btn link small" id="btn-darurat">Akses darurat admin</button></div>
        <hr class="divider">
        <div class="center tiny faint">${ic('lock', 'sm')} Template wajah dienkripsi AES-256 · Data dilindungi sesuai UU PDP No. 27/2022</div>
      </div>
    </section>
  </main>`;

  const kotak = root.querySelector('#lg-pesan');
  const tampil = (t, j = 'bad') => { kotak.innerHTML = `<div class="note ${j}">${ic(j === 'bad' ? 'error' : 'info')}<div>${esc(t)}</div></div>`; };

  konfigurasi().then(c => {
    const el = root.querySelector('#lg-inst'); if (el && c.instansi) el.textContent = c.instansi;
    const v = root.querySelector('#lg-versi'); if (v && c.versi) v.textContent = 'Versi ' + c.versi;
  }).catch(() => {});

  const g = root.querySelector('#btn-google');
  if (g) g.onclick = () => sibuk(g, async () => {
    try {
      const c = await konfigurasi();
      if (!c.bridgeUrl) { tampil('SSO belum dikonfigurasi. Admin perlu mengisi BRIDGE_URL di Script Properties API.'); return; }
      const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
      LS.set('pp_state', { s: state, t: Date.now() });
      const kembali = location.origin + location.pathname;
      location.href = c.bridgeUrl + (c.bridgeUrl.includes('?') ? '&' : '?') + 's=' + state + '&r=' + encodeURIComponent(kembali);
      await new Promise(r => setTimeout(r, 8000));
    } catch (e) { tampil(e.msg || e.message); }
  });

  root.querySelectorAll('[data-demo]').forEach(b => b.onclick = () => sibuk(b, async () => {
    LS.set('pp_demo_peran', b.dataset.demo);
    const r = await api('auth.tukar', { sso: 'demo', dv: deviceId(), info: infoPerangkat() });
    sesi.simpan(r);
    LS.set('pp_mode', b.dataset.demo);
    onMasuk && onMasuk();
  }));

  root.querySelector('#btn-darurat').onclick = () => aksesDarurat(onMasuk);
}

/** Tukar token SSO dari hash URL. */
export async function tukarSso(token) {
  const st = LS.get('pp_state');
  LS.del('pp_state');
  const r = await api('auth.tukar', { sso: token, state: st && Date.now() - st.t < 15 * 60e3 ? st.s : '', dv: deviceId(), info: infoPerangkat() });
  sesi.simpan(r);
  return r;
}

function aksesDarurat(onMasuk) {
  const m = modal({
    judul: 'Akses darurat admin',
    sub: 'Hanya untuk keadaan SSO bermasalah. Sandi dibuat saat setup (lihat Execution log Apps Script). 5x salah = terkunci 15 menit.',
    isi: `<div class="col gap-12"><div class="field"><label>Username</label><input class="input" id="dr-u" autocomplete="username" value="darurat"></div>
      <div class="field"><label>Sandi</label><input class="input" id="dr-p" type="password" autocomplete="current-password"></div><div id="dr-e"></div></div>`,
    kaki: `<button class="btn ghost" data-tutup>Batal</button><button class="btn" id="dr-ok">Masuk</button>`
  });
  const ok = m.el.querySelector('#dr-ok');
  ok.onclick = () => sibuk(ok, async () => {
    try {
      const r = await api('auth.darurat', { user: m.el.querySelector('#dr-u').value, pass: m.el.querySelector('#dr-p').value, dv: deviceId() });
      sesi.simpan(r); LS.set('pp_mode', 'admin'); m.tutup(); toast('Masuk dengan akses darurat (berlaku 12 jam).', 'warn'); onMasuk && onMasuk();
    } catch (e) { m.el.querySelector('#dr-e').innerHTML = `<div class="note bad">${ic('error')}<div>${esc(e.msg || e.message)}</div></div>`; }
  });
}

export async function keluar(semua = false) {
  try { await api('auth.keluar', { semua }); } catch { /* tetap keluar */ }
  sesi.hapus();
  LS.del('pp_mode');
  location.hash = '';
  location.reload();
}
