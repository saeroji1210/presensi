/* =====================================================================
   admin/dinas.js — Penugasan dinas luar kota (PRD 5.4 & 7.2): tab status,
   daftar surat tugas (pegawai, periode, bukti presensi), formulir buat
   penugasan: pegawai banyak, zona waktu, jam opsional, banyak titik di peta
   Leaflet (klik peta untuk menaruh titik, atur radius), unggah surat tugas.
   ===================================================================== */
import { api, swr, ambil, invalidasi } from '../core/api.js';
import { esc, ic, avatar, badge, tgl, galat, toast, sibuk, konfirmasi, siapkanUnggahan, ukuranTeks, hariIniLokal, desimal } from '../core/util.js';
import { pgHead, opsi, peta, ikonTitik, pilihPegawai, eksporExcel, pratinjauBerkas } from './ui.js';
import { prosesNotif } from './shell.js';

const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function periodeSingkat(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  if (a === b) return `${d1} ${BLN[m1 - 1]} ${y1}`;
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${BLN[m1 - 1]} ${y1}`;
  return `${d1} ${BLN[m1 - 1]} – ${d2} ${BLN[m2 - 1]} ${y2}`;
}

export async function render(el) {
  let data = null, st = 'AKTIF', titik = [], berkas = null, pp = null, petaObj = null, lapisan = [];
  const hari = hariIniLokal();
  el.innerHTML = `${pgHead('Penugasan dinas', 'Kelola surat tugas dinas luar kota dan titik geofence presensi tujuan.', `<button class="btn ghost" id="ds-xls">${ic('download')} Ekspor laporan dinas</button>`)}
    <div class="g-2-1"><div><div class="row between mb-12 wrap"><div class="tabs" id="ds-tabs"></div><span class="small muted" id="ds-ket"></span></div><div id="ds-list">${'<div class="sk" style="height:84px;margin:8px 0;border-radius:14px"></div>'.repeat(4)}</div>
      <div class="note mt-16" style="background:var(--duty-tint);color:var(--duty-dark)">${ic('verified_user')}<div><b>Validasi biometrik dinas luar</b><br>Presensi dinas tetap wajib verifikasi wajah, uji kehidupan & geotagging di radius titik tujuan. Keterlambatan tidak dihitung; zona waktu mengikuti lokasi tujuan.</div></div></div>
    <section class="card p-20" id="ds-form"></section></div>`;
  const $ = s => el.querySelector(s);
  $('#ds-xls').onclick = () => data && eksporExcel('Laporan perjalanan dinas', [{ k: 'no_surat', label: 'No. surat' }, { k: 'tujuan', label: 'Tujuan' }, { k: 'mulai', label: 'Mulai', tipe: 'tgl' }, { k: 'selesai', label: 'Selesai', tipe: 'tgl' }, { k: 'peg', label: 'Pegawai' }, { k: 'titikN', label: 'Titik' }, { k: 'status', label: 'Status' }, { k: 'bukti', label: 'Bukti presensi (%)' }],
    data.list.map(g => ({ ...g, peg: g.pegawai.map(p => p.nama).join('; '), titikN: g.titik.map(t => t.nama).join('; '), bukti: g.bukti && g.bukti.persen !== null ? g.bukti.persen : '' })), 'Laporan_Dinas').catch(galat);

  function gambarList() {
    const h = data.hitung;
    $('#ds-tabs').innerHTML = [['AKTIF', 'Aktif'], ['TERJADWAL', 'Terjadwal'], ['SELESAI', 'Selesai'], ['SEMUA', 'Semua']].map(([k, l]) => `<button class="tab ${st === k ? 'on' : ''}" data-st="${k}">${l} <span class="count">${h[k] || 0}</span></button>`).join('');
    $('#ds-tabs').querySelectorAll('[data-st]').forEach(b => b.onclick = () => { st = b.dataset.st; gambarList(); });
    $('#ds-ket').textContent = `${h.AKTIF || 0} penugasan berjalan di ${data.titikAktif} titik koordinat`;
    const l = data.list.filter(g => st === 'SEMUA' || g.status === st);
    $('#ds-list').innerHTML = l.length ? `<div class="tbl-wrap"><table class="tbl rapat"><thead><tr><th>No. surat</th><th>Tujuan & kegiatan</th><th>Pegawai</th><th>Periode</th><th>Bukti</th><th>Status</th><th></th></tr></thead><tbody>
      ${l.map(g => `<tr><td><div class="nm" style="font-family:ui-monospace,monospace;font-size:12px">${esc(g.no_surat)}</div><div class="sub">${esc(g.zona)}</div></td>
        <td><b>${esc(g.tujuan)}</b><div class="sub">${ic('location_on', 'sm')} ${esc(g.titik.map(t => t.nama).join(', '))}</div></td>
        <td><div class="avs" title="${esc(g.pegawai.map(p => p.nama).join(', '))}">${g.pegawai.slice(0, 4).map(p => avatar(p.nama)).join('')}${g.pegawai.length > 4 ? `<span class="av">+${g.pegawai.length - 4}</span>` : ''}</div></td>
        <td class="nowrap"><div>${esc(periodeSingkat(g.mulai, g.selesai))}</div><div class="sub">${g.status === 'AKTIF' ? (g.selesai === hari ? 'Berakhir hari ini' : 'Sedang berjalan') : g.status === 'TERJADWAL' ? 'Dalam ' + Math.round((new Date(g.mulai) - new Date(hari)) / 864e5) + ' hari' : ''}</div></td>
        <td>${g.bukti && g.bukti.persen !== null ? `<b style="color:${g.bukti.persen >= 100 ? 'var(--ok-dark)' : 'var(--wait-dark)'}">${g.bukti.persen}%</b><div class="sub">${g.bukti.ada}/${g.bukti.hari} hari</div>` : '<span class="faint">–</span>'}</td>
        <td>${badge(g.status)}</td>
        <td class="nowrap">${g.file ? `<button class="btn icon sm ghost" data-surat="${g.file}" title="Lihat surat tugas">${ic('description')}</button>` : ''}${g.status === 'AKTIF' || g.status === 'TERJADWAL' ? `<button class="btn icon sm ghost" data-batal="${esc(g.kunci)}" title="Batalkan">${ic('cancel')}</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="card empty">${ic('luggage')}Tidak ada penugasan.</div>`;
    $('#ds-list').querySelectorAll('[data-batal]').forEach(b => b.onclick = () => batal(b.dataset.batal));
    $('#ds-list').querySelectorAll('[data-surat]').forEach(b => b.onclick = () => lihatBerkas(b.dataset.surat));
  }

  const lihatBerkas = id => pratinjauBerkas(id, 'Surat tugas');

  async function batal(kunci) {
    const alasan = await konfirmasi({ judul: 'Batalkan penugasan?', pesan: 'Tab Dinas pegawai akan hilang mulai sekarang.', ya: 'Batalkan penugasan', bahaya: true, input: { label: 'Alasan', wajib: true } });
    if (!alasan) return;
    try { await api('admin.dinas.batal', { kunci, alasan }, { invalidasi: ['admin.dinas'] }); toast('Penugasan dibatalkan.', 'ok'); muat(); } catch (e) { galat(e); }
  }

  async function gambarForm() {
    const f = $('#ds-form');
    f.innerHTML = `<div class="row between"><h2 class="h-sm row">${ic('add_task')} Buat penugasan dinas</h2><span class="badge b-neutral">Draf baru</span></div>
      <p class="small muted">Penerbitan surat tugas & penentuan koordinat presensi.</p>
      <div class="col gap-12">
        <div class="field"><label>Nomor surat tugas *</label><div class="input-ic">${ic('tag')}<input class="input" id="df-no" placeholder="ST/089/KEP/XI/2026" maxlength="80"></div></div>
        <div class="field"><label>Tujuan & kegiatan *</label><input class="input" id="df-tujuan" placeholder="Workshop SPBE Nasional, Surabaya" maxlength="200"></div>
        <div class="field"><label>Pegawai ditugaskan *</label><div id="df-peg"></div></div>
        <div class="grid-2"><div class="field"><label>Tanggal mulai *</label><input type="date" class="input" id="df-mulai" value="${hari}"></div><div class="field"><label>Tanggal selesai *</label><input type="date" class="input" id="df-selesai" value="${hari}"></div></div>
        <div class="field"><label>Zona waktu lokasi tujuan *</label><select class="input" id="df-tz">${opsi([['Asia/Jakarta', 'WIB (UTC+7)'], ['Asia/Makassar', 'WITA (UTC+8)'], ['Asia/Jayapura', 'WIT (UTC+9)']], 'Asia/Jakarta')}</select></div>
        <div class="grid-2"><div class="field"><label>Jam masuk (opsional)</label><input type="time" class="input" id="df-jm"></div><div class="field"><label>Jam pulang (opsional)</label><input type="time" class="input" id="df-jp"></div></div>
        <div class="tiny muted" style="margin-top:-6px">Kosongkan jam untuk memakai jadwal kantor pegawai.</div>
        <div class="field"><div class="row between"><label>${ic('location_on', 'sm')} Titik tujuan presensi (geofence)</label><span class="small muted" id="df-nt">${titik.length} titik</span></div>
          <div class="input-ic">${ic('travel_explore')}<input class="input" id="df-cari" placeholder="Cari tempat (OpenStreetMap) lalu tekan Enter…"></div>
          <div class="peta mt-8" id="df-peta" style="height:240px"></div><div class="tiny muted mt-8">Klik peta untuk menambah titik. Seret penanda untuk menggeser.</div>
          <div id="df-titik"></div></div>
        <div class="field"><label>Unggah surat tugas (PDF/JPG, maks 5 MB)</label>
          <div class="row"><label class="btn ghost sm">${ic('upload_file', 'sm')} Pilih berkas<input type="file" hidden id="df-file" accept="application/pdf,image/jpeg,image/png"></label><span class="small muted" id="df-fn">${berkas ? esc(berkas.nama) + ' · ' + ukuranTeks(berkas.ukuran) : 'Belum ada berkas'}</span></div></div>
        <div class="row" style="justify-content:flex-end"><button class="btn ghost" id="df-reset">Batal</button><button class="btn" id="df-simpan" data-sibuk=" Menyimpan…">${ic('send', 'sm')} Simpan penugasan</button></div>
      </div>`;
    const daftarPeg = await ambil('admin.pegawai.list', {}, 60000).catch(() => ({ list: [] }));
    pp = pilihPegawai($('#df-peg'), daftarPeg.list.filter(p => p.status_aktif === 'AKTIF'), []);
    $('#df-file').onchange = async e => { try { berkas = await siapkanUnggahan(e.target.files[0]); $('#df-fn').textContent = berkas.nama + ' · ' + ukuranTeks(berkas.ukuran); } catch (err) { toast(err.message, 'bad'); } };
    $('#df-reset').onclick = () => { titik = []; berkas = null; gambarForm(); };
    $('#df-simpan').onclick = e => sibuk(e.currentTarget, simpan);
    $('#df-cari').onkeydown = async e => {
      if (e.key !== 'Enter') return; e.preventDefault();
      try {
        const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=id&q=' + encodeURIComponent(e.target.value), { headers: { 'Accept-Language': 'id' } }).then(x => x.json());
        if (r[0] && petaObj) { petaObj.m.setView([+r[0].lat, +r[0].lon], 17); tambahTitik(+r[0].lat, +r[0].lon, e.target.value.split(',')[0]); } else toast('Tempat tidak ditemukan.', 'warn');
      } catch { toast('Pencarian tempat gagal.', 'warn'); }
    };
    const ref = await ambil('admin.ref.list', {}, 60000).catch(() => ({ lokasi: [] }));
    const awal = ref.lokasi[0] || { lat: -6.2, lng: 106.82 };
    petaObj = await peta($('#df-peta'), { lat: awal.lat, lng: awal.lng, zoom: 13 }).catch(() => null);
    if (petaObj) petaObj.m.on('click', ev => tambahTitik(ev.latlng.lat, ev.latlng.lng));
    gambarTitik();
  }

  function tambahTitik(lat, lng, nama) {
    titik.push({ nama: nama || 'Titik ' + (titik.length + 1), lat: +lat.toFixed(7), lng: +lng.toFixed(7), radius: 100 });
    gambarTitik();
  }
  function gambarTitik() {
    const box = $('#df-titik'); if (!box) return;
    $('#df-nt').textContent = titik.length + ' titik';
    box.innerHTML = titik.map((t, i) => `<div class="card p-16 mt-8"><div class="row between"><div class="row grow"><span class="count">${i + 1}</span><input class="input" data-nm="${i}" value="${esc(t.nama)}" maxlength="120" style="min-height:38px"></div><button class="btn icon sm ghost" data-del="${i}" aria-label="Hapus">${ic('delete')}</button></div>
      <div class="row between small mt-8"><span class="muted" style="font-family:ui-monospace,monospace">${t.lat.toFixed(6)}, ${t.lng.toFixed(6)}</span><b>Radius ${t.radius} m</b></div>
      <input type="range" min="30" max="1000" step="10" value="${t.radius}" data-rad="${i}" aria-label="Radius"></div>`).join('') || '<div class="small muted mt-8">Belum ada titik. Klik peta atau cari tempat.</div>';
    box.querySelectorAll('[data-nm]').forEach(x => x.oninput = () => { titik[+x.dataset.nm].nama = x.value; });
    box.querySelectorAll('[data-del]').forEach(x => x.onclick = () => { titik.splice(+x.dataset.del, 1); gambarTitik(); });
    box.querySelectorAll('[data-rad]').forEach(x => x.oninput = () => { titik[+x.dataset.rad].radius = +x.value; x.previousElementSibling.querySelector('b').textContent = 'Radius ' + x.value + ' m'; gambarPeta(); });
    gambarPeta();
  }
  function gambarPeta() {
    if (!petaObj) return;
    const { L, m } = petaObj;
    lapisan.forEach(l => m.removeLayer(l)); lapisan = [];
    titik.forEach((t, i) => {
      const mk = L.marker([t.lat, t.lng], { draggable: true, icon: ikonTitik(L, '#7C3AED') }).addTo(m).bindTooltip(`${i + 1}. ${t.nama}`);
      mk.on('dragend', () => { const p = mk.getLatLng(); t.lat = +p.lat.toFixed(7); t.lng = +p.lng.toFixed(7); gambarTitik(); });
      lapisan.push(mk, L.circle([t.lat, t.lng], { radius: t.radius, color: '#7C3AED', weight: 2, fillOpacity: 0.1 }).addTo(m));
    });
  }

  async function simpan() {
    const v = id => $(id).value.trim();
    const d = { no_surat: v('#df-no'), tujuan: v('#df-tujuan'), pegawai: pp.nilai(), tgl_mulai: v('#df-mulai'), tgl_selesai: v('#df-selesai'), zona_waktu: v('#df-tz'), jam_masuk: v('#df-jm'), jam_pulang: v('#df-jp'), titik, berkas: berkas ? { nama: berkas.nama, b64: berkas.b64 } : null };
    if (!d.no_surat || !d.tujuan) return toast('Nomor surat & tujuan wajib diisi.', 'warn');
    if (!d.pegawai.length) return toast('Pilih minimal satu pegawai.', 'warn');
    if (!titik.length) return toast('Tambahkan minimal satu titik tujuan di peta.', 'warn');
    try {
      const r = await api('admin.dinas.simpan', d, { invalidasi: ['admin.dinas', 'admin.dashboard'] });
      toast(`Penugasan disimpan untuk ${r.jumlah} pegawai. Email notifikasi dikirim.`, 'ok');
      prosesNotif(); titik = []; berkas = null; gambarForm(); muat();
    } catch (e) { galat(e); }
  }

  function muat() { swr('admin.dinas.list', {}, d => { data = d; gambarList(); }, { onError: e => galat(e) }); }
  muat();
  gambarForm();
}
