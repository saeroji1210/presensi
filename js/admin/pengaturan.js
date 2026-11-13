/* =====================================================================
   admin/pengaturan.js — Pengaturan (PRD 5.13): aturan presensi, verifikasi
   wajah (ambang kosinus), lokasi & GPS, lembur & tarif, notifikasi email,
   retensi data, keamanan & sesi. Bilah simpan menempel menghitung perubahan.
   Rahasia TIDAK pernah tampil: hanya status "tersimpan" (Script Properties).
   ===================================================================== */
import { api, swr } from '../core/api.js';
import { esc, ic, galat, toast, sibuk, rupiah, tgl, konfirmasi, desimal, hariIniLokal, modal } from '../core/util.js';
import { pgHead } from './ui.js';

const GRUP = [
  ['aturan', 'rule', 'Aturan presensi', ['TOLERANSI_MENIT', 'BATAS_PRESENSI_MASUK', 'MAKS_PERCOBAAN', 'NAMA_INSTANSI', 'ALAMAT_INSTANSI', 'MOTIVASI']],
  ['wajah', 'face', 'Verifikasi wajah', ['AMBANG_WAJAH_VALID', 'AMBANG_WAJAH_ABU', 'MAKS_GAGAL_WAJAH', 'WAJIB_LIVENESS_PASIF', 'AMBANG_LIVENESS_PASIF']],
  ['gps', 'location_on', 'Lokasi & GPS', ['AKURASI_GPS_MAKS', 'KECEPATAN_MAKS_KMJ']],
  ['lembur', 'payments', 'Lembur & tarif', ['PEMBULATAN_LEMBUR_MENIT', 'BATAS_SUSULAN_HARI']],
  ['notif', 'mail', 'Notifikasi email', ['EMAIL_RINGKASAN_ADMIN', 'EMAIL_REKAP_BULANAN']],
  ['retensi', 'auto_delete', 'Retensi data', ['RETENSI_FOTO_VALID_HARI', 'RETENSI_FOTO_DITANDAI_HARI', 'SAKIT_MIN_HARI_SURAT']],
  ['keamanan', 'shield_lock', 'Keamanan & sesi', []]
];
const LABEL = {
  TOLERANSI_MENIT: ['Toleransi keterlambatan bawaan', 'Dipakai untuk jadwal baru. Toleransi per jadwal diatur di Lokasi & Jadwal.', 'menit'],
  BATAS_PRESENSI_MASUK: ['Penutupan presensi masuk', 'Tombol MASUK tidak aktif setelah jam ini (waktu lokal lokasi).', ''],
  MAKS_PERCOBAAN: ['Batas percobaan presensi', 'Per pegawai per 10 menit (pembatas percobaan).', 'kali'],
  NAMA_INSTANSI: ['Nama instansi', 'Ditampilkan di aplikasi, email, dan kop PDF.', ''], ALAMAT_INSTANSI: ['Alamat instansi', 'Baris kedua kop PDF resmi.', ''],
  MOTIVASI: ['Kalimat motivasi', 'Kartu motivasi di sidebar admin.', ''],
  AMBANG_WAJAH_VALID: ['Ambang skor wajah VALID', 'Kemiripan kosinus ≥ nilai ini = cocok. Kalibrasi saat pilot.', ''],
  AMBANG_WAJAH_ABU: ['Ambang area abu-abu', 'Skor antara nilai ini dan ambang valid = Perlu Ditinjau; di bawahnya Ditolak.', ''],
  MAKS_GAGAL_WAJAH: ['Batas wajah tidak cocok', 'Dalam 10 menit; setelahnya pegawai diarahkan ke Koreksi Presensi.', 'kali'],
  WAJIB_LIVENESS_PASIF: ['Wajibkan uji kehidupan pasif', 'Aktifkan hanya bila model MiniFASNetV2 sudah dipasang di frontend.', ''],
  AMBANG_LIVENESS_PASIF: ['Ambang uji kehidupan pasif', 'Skor 0–1; di bawahnya presensi masuk tinjauan.', ''],
  AKURASI_GPS_MAKS: ['Ambang akurasi GPS maksimum', 'Akurasi lebih buruk dari ini → pegawai diminta ulang; bila tetap → Perlu Ditinjau.', 'meter'],
  KECEPATAN_MAKS_KMJ: ['Batas perpindahan mustahil', 'Kecepatan tersirat antar presensi tanpa penugasan dinas.', 'km/jam'],
  PEMBULATAN_LEMBUR_MENIT: ['Pembulatan jam lembur', 'Dibulatkan ke bawah per N menit. Contoh 30: 1 jam 42 mnt → 1 jam 30 mnt.', 'menit'],
  BATAS_SUSULAN_HARI: ['Persetujuan lembur susulan', 'Paling lambat H+N; lewat batas otomatis Kedaluwarsa.', 'hari'],
  EMAIL_RINGKASAN_ADMIN: ['Ringkasan harian pukul 10.00', 'Belum presensi, perlu ditinjau, pengajuan menunggu.', ''],
  EMAIL_REKAP_BULANAN: ['Rekap bulanan PDF tanggal 1', 'PDF resmi berkop dikirim ke semua admin.', ''],
  RETENSI_FOTO_VALID_HARI: ['Retensi foto presensi valid', 'Dihapus otomatis oleh trigger mingguan.', 'hari'],
  RETENSI_FOTO_DITANDAI_HARI: ['Retensi foto bertanda/ditinjau', 'Untuk audit; semua foto dihapus setelah batas ini.', 'hari'],
  SAKIT_MIN_HARI_SURAT: ['Sakit wajib surat dokter mulai', 'Jumlah hari sakit minimal yang wajib melampirkan surat dokter.', 'hari']
};

export async function render(el) {
  let grup = 'aturan', data = null, ref = null, ubah = {};
  el.innerHTML = `${pgHead('Pengaturan sistem & aturan presensi', 'Konfigurasi parameter verifikasi biometrik, ambang geofencing GPS, toleransi kerja, dan tarif lembur.')}
    <div class="set-layout"><nav class="card set-menu" id="st-menu"></nav><div id="st-isi">${'<div class="sk" style="height:300px;border-radius:16px"></div>'}</div></div>`;
  const $ = s => el.querySelector(s);
  const nilai = k => ubah[k] !== undefined ? ubah[k] : (data.list.find(x => x.kunci === k) || {}).nilai;

  function menu() {
    $('#st-menu').innerHTML = `<div class="h-sm muted" style="padding:6px 12px 10px">Menu pengaturan</div>` + GRUP.map(([k, i, l]) => `<button class="${grup === k ? 'on' : ''}" data-g="${k}">${ic(i)} ${l}</button>`).join('') +
      `<hr class="divider"><div class="small muted" style="padding:0 12px">Versi aplikasi <b>${esc(data.sistem.versi)}</b></div>`;
    $('#st-menu').querySelectorAll('[data-g]').forEach(b => b.onclick = () => { grup = b.dataset.g; gambar(); });
  }

  function input(k) {
    const v = data.list.find(x => x.kunci === k), val = nilai(k), vd = v.validator || {};
    if (vd.tipe === 'bool') return `<label class="switch"><input type="checkbox" data-k="${k}" ${String(val) === 'true' ? 'checked' : ''}><span></span></label>`;
    if (k === 'AMBANG_WAJAH_VALID' || k === 'AMBANG_WAJAH_ABU' || k === 'AMBANG_LIVENESS_PASIF') return `<div class="row"><input type="range" data-k="${k}" min="${vd.min}" max="${vd.maks}" step="0.01" value="${val}"><b style="min-width:44px" data-v="${k}">${desimal(val, 2)}</b></div>`;
    if (k === 'AKURASI_GPS_MAKS') return `<div><div class="row"><input type="range" data-k="${k}" min="10" max="150" step="5" value="${val}"><b style="min-width:60px" data-v="${k}">${val} m</b></div><div class="row between tiny muted"><span>Presisi tinggi</span><span>Standar kantor</span><span>Gedung tinggi</span></div></div>`;
    return `<div class="row"><input class="input" data-k="${k}" type="${vd.tipe === 'angka' ? 'number' : vd.tipe === 'jam' ? 'time' : 'text'}" value="${esc(val)}" ${vd.min !== undefined ? `min="${vd.min}" max="${vd.maks}"` : ''} ${vd.tipe === 'teks' ? `maxlength="${vd.maks}"` : ''} style="max-width:${vd.tipe === 'teks' ? '100%' : '140px'}">${LABEL[k] && LABEL[k][2] ? `<span class="muted small">${LABEL[k][2]}</span>` : ''}</div>`;
  }

  function gambar() {
    menu();
    const g = GRUP.find(x => x[0] === grup);
    let isi = '';
    if (grup === 'wajah') {
      const va = +nilai('AMBANG_WAJAH_VALID'), ab = +nilai('AMBANG_WAJAH_ABU');
      isi += `<div class="note mb-16">${ic('insights')}<div><b>Peta skor saat ini:</b> &lt; ${desimal(ab, 2)} ditolak · ${desimal(ab, 2)}–${desimal(va, 2)} ditinjau manual · ≥ ${desimal(va, 2)} valid otomatis. Model: <code>${esc(data.sistem.versiModelWajah)}</code> (vektor 128-D, kemiripan kosinus di server). Kalibrasi memakai data pilot (PRD Tahap 4).</div></div>`;
    }
    isi += g[3].map(k => `<div class="set-row"><div><b>${esc((LABEL[k] || [k])[0])}</b><small>${esc((LABEL[k] || ['', data.list.find(x => x.kunci === k).keterangan])[1])}</small></div><div>${input(k)}</div></div>`).join('');
    if (grup === 'lembur') isi += tarifHtml();
    if (grup === 'keamanan') isi = keamananHtml();
    if (grup === 'notif') isi += `<div class="set-row"><div><b>Antrean email</b><small>Email dikirim lewat antrean (trigger 10 menit) agar aksi admin tidak tertahan.</small></div><div><button class="btn ghost" id="st-notif" data-sibuk=" Mengirim…">${ic('send', 'sm')} Proses antrean sekarang</button></div></div>`;
    $('#st-isi').innerHTML = `<section class="card p-24"><div class="row between"><div><h2 class="h-sm row">${ic(g[1])} ${esc(g[2])}</h2><div class="small muted">Perubahan berlaku segera & tercatat di log audit.</div></div></div><div class="mt-8">${isi}</div></section>
      <div class="savebar" id="st-bar" ${Object.keys(ubah).length ? '' : 'hidden'}><span class="grow">Ada <b id="st-n">${Object.keys(ubah).length}</b> perubahan pengaturan yang belum disimpan.</span><button class="btn ghost" id="st-batal">Batalkan</button><button class="btn" id="st-simpan" data-sibuk=" Menyimpan…">${ic('save', 'sm')} Simpan perubahan</button></div>`;
    el.querySelectorAll('[data-k]').forEach(i => i.oninput = i.onchange = () => {
      const k = i.dataset.k, v = i.type === 'checkbox' ? String(i.checked) : i.value;
      const asli = String(data.list.find(x => x.kunci === k).nilai);
      if (String(v) === asli) delete ubah[k]; else ubah[k] = v;
      const tv = el.querySelector(`[data-v="${k}"]`); if (tv) tv.textContent = k === 'AKURASI_GPS_MAKS' ? v + ' m' : desimal(v, 2);
      $('#st-bar').hidden = !Object.keys(ubah).length; $('#st-n').textContent = Object.keys(ubah).length;
    });
    const sb = $('#st-batal'); if (sb) sb.onclick = () => { ubah = {}; gambar(); };
    const ss = $('#st-simpan'); if (ss) ss.onclick = e => sibuk(e.currentTarget, simpan);
    const nt = $('#st-notif'); if (nt) nt.onclick = e => sibuk(e.currentTarget, async () => { try { const r = await api('admin.notif.proses', {}); toast(`${r.terkirim || 0} email terkirim${r.sibuk ? ' (proses lain sedang berjalan)' : ''}.`, 'ok'); } catch (err) { galat(err); } });
    pasangTarif(); pasangKeamanan();
  }

  function tarifHtml() {
    const t = (ref && ref.tarif) || [];
    return `<div class="mt-16"><div class="row between"><div><b>Kategori & tarif lembur pegawai</b><div class="small muted">Nominal = jam lembur dihitung × tarif per jam sesuai kategori pegawai (berlaku mulai tanggal tertentu).</div></div><span class="badge b-info">${t.length} aturan</span></div>
      <div class="tbl-wrap mt-12"><table class="tbl"><thead><tr><th>Kategori</th><th class="num">Tarif per jam</th><th class="num">Maks jam/hari</th><th>Berlaku mulai</th><th></th></tr></thead><tbody>
      ${t.map((x, i) => `<tr><td><b>${esc(x.kategori)}</b></td><td class="num">${x.tarif ? rupiah(x.tarif) : '<span style="color:var(--bad)">Belum diisi</span>'} / jam</td><td class="num">${desimal(x.maks, 1)} jam</td><td>${esc(tgl(x.mulai))}</td>
        <td class="nowrap"><button class="btn icon sm ghost" data-te="${i}" aria-label="Ubah">${ic('edit')}</button><button class="btn icon sm ghost" data-th="${i}" aria-label="Hapus">${ic('delete')}</button></td></tr>`).join('')}</tbody></table></div>
      <button class="btn ghost block mt-12" id="tf-baru">${ic('add_circle', 'sm')} Tambah kategori tarif</button></div>`;
  }
  function pasangTarif() {
    const t = (ref && ref.tarif) || [];
    const form = x => {
      const m = modal({
        judul: x ? 'Ubah tarif lembur' : 'Tambah kategori tarif', isi: `<div class="col gap-12"><div class="field"><label>Kategori</label><input class="input" id="tf-k" value="${esc(x ? x.kategori : '')}" placeholder="Golongan III (PNS)"></div>
          <div class="grid-2"><div class="field"><label>Tarif per jam (Rp)</label><input class="input" type="number" id="tf-t" value="${x ? x.tarif : ''}" min="0"></div><div class="field"><label>Maks jam per hari</label><input class="input" type="number" step="0.5" id="tf-m" value="${x ? x.maks : 4}"></div></div>
          <div class="field"><label>Berlaku mulai</label><input class="input" type="date" id="tf-d" value="${x ? x.mulai : hariIniLokal()}"></div></div>`,
        kaki: `<button class="btn ghost" data-tutup>Batal</button><button class="btn" id="tf-ok" data-sibuk=" Menyimpan…">Simpan</button>`
      });
      m.el.querySelector('#tf-ok').onclick = e => sibuk(e.currentTarget, async () => {
        const v = id => m.el.querySelector(id).value;
        try { await api('admin.tarif.simpan', { kategori: v('#tf-k'), tarif_per_jam: v('#tf-t'), maks_jam_per_hari: v('#tf-m'), berlaku_mulai: v('#tf-d'), lama: x ? { kategori: x.kategori, mulai: x.mulai } : null }, { invalidasi: ['admin.ref'] }); m.tutup(); toast('Tarif disimpan.', 'ok'); await muatRef(); gambar(); } catch (err) { galat(err); }
      });
    };
    const b = $('#tf-baru'); if (b) b.onclick = () => form(null);
    el.querySelectorAll('[data-te]').forEach(x => x.onclick = () => form(t[+x.dataset.te]));
    el.querySelectorAll('[data-th]').forEach(x => x.onclick = async () => {
      const r = t[+x.dataset.th];
      if (!await konfirmasi({ judul: 'Hapus tarif?', pesan: esc(r.kategori + ' · berlaku ' + tgl(r.mulai)), ya: 'Hapus', bahaya: true })) return;
      try { await api('admin.tarif.hapus', { kategori: r.kategori, mulai: r.mulai }, { invalidasi: ['admin.ref'] }); await muatRef(); gambar(); } catch (err) { galat(err); }
    });
  }

  function keamananHtml() {
    const s = data.sistem;
    const baris = (l, v, k) => `<div class="set-row"><div><b>${l}</b><small>${k}</small></div><div>${v}</div></div>`;
    return baris('Mode akses login', `<span class="badge b-info">${esc(s.modeAkses)}</span>`, 'WHITELIST: hanya email di sheet Pegawai. Diubah lewat Script Properties MODE_AKSES.') +
      baris('Domain diizinkan', esc(s.domainIzin || '—'), 'Script Properties DOMAIN_IZIN (mode INSTITUSI/CAMPURAN).') +
      baris('Admin utama', esc(s.adminEmails.join(', ') || '—'), 'Script Properties ADMIN_EMAILS — selalu admin walau tidak ada di sheet.') +
      baris('URL SSO Bridge', s.bridgeUrl ? `<span class="small" style="word-break:break-all">${esc(s.bridgeUrl)}</span>` : '<span class="badge b-bad">Belum diisi</span>', 'Script Properties BRIDGE_URL — proyek GAS terpisah (Execute as: user accessing).') +
      baris('Masa berlaku sesi', `${s.sesiHari} hari, terikat perangkat`, 'Token HMAC-SHA256; dicabut otomatis saat reset perangkat / status nonaktif.') +
      baris('Rahasia tersimpan', Object.entries(s.rahasia).map(([k, v]) => `<div class="row small">${ic(v ? 'check_circle' : 'cancel', 'sm')} <code>${k}</code> ${v ? 'tersimpan' : '<b style="color:var(--bad)">belum ada</b>'}</div>`).join(''), 'Nilai rahasia tidak pernah dikirim ke browser (Script Properties).') +
      baris('Hitung ulang rekap', `<div class="row wrap"><input type="date" class="input" id="rk-d" style="width:auto"><input type="date" class="input" id="rk-s" style="width:auto"><button class="btn ghost" id="rk-go" data-sibuk=" Menghitung…">${ic('calculate', 'sm')} Hitung</button></div>`, 'Maks 62 hari. Dipakai setelah mengubah jadwal, libur, atau tarif untuk tanggal lampau.');
  }
  function pasangKeamanan() {
    const b = $('#rk-go'); if (!b) return;
    b.onclick = e => sibuk(e.currentTarget, async () => {
      const d = $('#rk-d').value, s = $('#rk-s').value || d;
      if (!d) return toast('Isi tanggal mulai.', 'warn');
      try { const r = await api('admin.rekap.hitung', { dari: d, sampai: s }, { timeout: 120000, invalidasi: ['admin.dashboard', 'admin.laporan', 'riwayat'] }); toast(`Rekap dihitung ulang: ${r.baris} baris.`, 'ok'); } catch (err) { galat(err); }
    });
  }

  async function simpan() {
    try {
      const r = await api('admin.pengaturan.simpan', { nilai: ubah }, { invalidasi: ['admin.pengaturan', 'boot'] });
      toast(`${r.berubah} pengaturan disimpan.`, 'ok'); ubah = {};
      await new Promise(res => swr('admin.pengaturan.get', {}, d => { data = d; res(); }, { onError: () => res() }));
      gambar();
    } catch (e) { galat(e); }
  }
  const muatRef = () => new Promise(res => swr('admin.ref.list', {}, d => { ref = d; res(); }, { onError: () => res() }));
  muatRef().then(() => data && gambar());
  swr('admin.pengaturan.get', {}, d => { data = d; gambar(); }, { onError: e => galat(e) });
}
