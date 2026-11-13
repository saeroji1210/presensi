/* =====================================================================
   admin/lokasi.js — Lokasi & Jadwal (PRD 4.2, 7.2): titik kantor dengan
   peta Leaflet (klik untuk menaruh titik, geser radius), jadwal kerja
   (multi pola), dan hari libur nasional/cuti bersama/instansi.
   ===================================================================== */
import { api, swr } from '../core/api.js';
import { esc, ic, badge, tgl, tglPanjang, galat, toast, sibuk, konfirmasi, jamTitik, desimal } from '../core/util.js';
import { pgHead, opsi, peta, ikonTitik } from './ui.js';

const ZONA = [['Asia/Jakarta', 'WIB (Waktu Indonesia Barat · UTC+7)'], ['Asia/Makassar', 'WITA (Waktu Indonesia Tengah · UTC+8)'], ['Asia/Jayapura', 'WIT (Waktu Indonesia Timur · UTC+9)']];
const HR = ['', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

export async function render(el) {
  let tab = 'lokasi', ref = null, pilih = null, petaObj = null, lap = [], tahun = String(new Date().getFullYear());
  el.innerHTML = `${pgHead('Lokasi & jadwal kerja', 'Konfigurasi radius geofence kantor, pola jam kerja pegawai, dan hari libur resmi instansi.')}
    <div class="tabs mb-16" id="lk-tabs"></div><div id="lk-isi">${'<div class="sk" style="height:300px;border-radius:16px"></div>'}</div>`;
  const $ = s => el.querySelector(s);

  function tabs() {
    $('#lk-tabs').innerHTML = [['lokasi', 'pin_drop', 'Lokasi kantor', ref.lokasi.length], ['jadwal', 'schedule', 'Jadwal kerja', ref.jadwal.length], ['libur', 'event_busy', 'Hari libur', ref.libur.length]]
      .map(([k, i, l, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-t="${k}">${ic(i, 'sm')} ${l} <span class="count">${n}</span></button>`).join('');
    $('#lk-tabs').querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; pilih = null; gambar(); });
  }
  function gambar() { tabs(); if (tab === 'lokasi') lokasi(); else if (tab === 'jadwal') jadwal(); else libur(); }

  /* ------------------------------ Lokasi ------------------------------ */
  function lokasi() {
    if (!pilih) pilih = ref.lokasi[0] ? { ...ref.lokasi[0] } : baru();
    $('#lk-isi').innerHTML = `<div class="g-1-2"><div>
      <div class="row between mb-12"><b class="row">${ic('domain')} Daftar titik kantor (${ref.lokasi.length})</b><button class="btn sm" id="lk-baru">${ic('add_location_alt', 'sm')} Tambah titik</button></div>
      <div class="q-list">${ref.lokasi.map(l => `<button class="q-item ${pilih.id === l.id ? 'on' : ''}" data-l="${l.id}"><div class="row between"><b>${esc(l.nama)}</b>${badge(l.aktif ? 'AKTIF' : 'NONAKTIF')}</div>
        <div class="small muted mt-8">${esc(l.alamat || '')}</div><div class="row between small mt-8"><span>${ic('radar', 'sm')} Radius <b>${l.radius} m</b> · ${esc(ZONA.find(z => z[0] === l.tz)[1].slice(0, 4))}</span><span class="muted" style="font-family:ui-monospace,monospace">${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}</span></div>
        <div class="tiny muted mt-8">${ref.jumlahPegawaiLokasi[l.id] || 0} pegawai aktif</div></button>`).join('')}</div>
      <div class="note mt-12">${ic('info')}<div>Pegawai di luar radius akan ditolak dan diarahkan mengajukan koreksi presensi berbukti. Radius gedung umumnya 100 m; kawasan terbuka hingga 500 m.</div></div></div>
      <section class="card p-20"><div class="row between"><div><b class="row">${ic('my_location')} Konfigurasi radius & peta</b><div class="small muted">${pilih.id ? 'ID: ' + esc(pilih.id) : 'Titik baru'}</div></div><span class="badge b-info">Radius ${pilih.radius} m</span></div>
        <div class="peta tinggi mt-12" id="lk-peta"></div><div class="tiny muted mt-8">Klik peta untuk memindah titik nol presensi. Peta: © OpenStreetMap.</div>
        <div class="grid-2 mt-16"><div class="field"><label>Nama titik lokasi *</label><input class="input" id="lf-nama" value="${esc(pilih.nama)}" maxlength="120"></div>
          <div class="grid-2"><div class="field"><label>Lintang *</label><input class="input" id="lf-lat" value="${pilih.lat}" inputmode="decimal"></div><div class="field"><label>Bujur *</label><input class="input" id="lf-lng" value="${pilih.lng}" inputmode="decimal"></div></div></div>
        <div class="grid-2 mt-12"><div class="field"><label>Alamat lengkap</label><input class="input" id="lf-alamat" value="${esc(pilih.alamat || '')}" maxlength="250"></div>
          <div class="field"><label>Zona waktu operasional *</label><select class="input" id="lf-tz">${opsi(ZONA, pilih.tz)}</select></div></div>
        <div class="field mt-16"><div class="row between"><label>Radius geofencing presensi (50–500 m; maks 2.000 m lewat isian)</label><b id="lf-rv">${pilih.radius} m</b></div>
          <input type="range" min="50" max="500" step="10" id="lf-rad" value="${Math.min(500, pilih.radius)}"><div class="row between tiny muted"><span>Minimal 50 m</span><span>Gedung 100 m</span><span>Kampus 250 m</span><span>Terbuka 500 m</span></div></div>
        <div class="row between mt-16 wrap"><label class="row">${'<span class="switch"><input type="checkbox" id="lf-aktif" ' + (pilih.aktif ? 'checked' : '') + '><span></span></span>'}<span><b>Titik aktif</b><div class="small muted">Pegawai dapat mencatat kehadiran di lokasi ini.</div></span></label>
          <button class="btn ghost" id="lf-gps">${ic('near_me', 'sm')} Gunakan lokasi saya</button></div>
        <div class="row mt-16" style="justify-content:flex-end"><button class="btn ghost" id="lf-batal">Batalkan</button><button class="btn" id="lf-simpan" data-sibuk=" Menyimpan…">${ic('save', 'sm')} Simpan pengaturan lokasi</button></div></section></div>`;
    $('#lk-baru').onclick = () => { pilih = baru(); lokasi(); };
    el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { pilih = { ...ref.lokasi.find(l => l.id === b.dataset.l) }; lokasi(); });
    const sinkron = () => { pilih.lat = +$('#lf-lat').value; pilih.lng = +$('#lf-lng').value; gambarPeta(true); };
    $('#lf-lat').onchange = sinkron; $('#lf-lng').onchange = sinkron;
    $('#lf-rad').oninput = e => { pilih.radius = +e.target.value; $('#lf-rv').textContent = pilih.radius + ' m'; gambarPeta(); };
    $('#lf-batal').onclick = () => { pilih = null; lokasi(); };
    $('#lf-gps').onclick = e => sibuk(e.currentTarget, () => new Promise(r => navigator.geolocation.getCurrentPosition(p => { setTitik(p.coords.latitude, p.coords.longitude, true); toast(`Lokasi diambil (akurasi ±${Math.round(p.coords.accuracy)} m).`, 'ok'); r(); }, er => { toast(er.message, 'bad'); r(); }, { enableHighAccuracy: true, timeout: 15000 })));
    $('#lf-simpan').onclick = e => sibuk(e.currentTarget, simpanLokasi);
    petaObj = null; lap = [];
    peta($('#lk-peta'), { lat: pilih.lat, lng: pilih.lng, zoom: 17 }).then(r => { if (!r) return; petaObj = r; r.m.on('click', ev => setTitik(ev.latlng.lat, ev.latlng.lng)); gambarPeta(); }).catch(() => { $('#lk-peta').innerHTML = '<div class="empty small">Peta gagal dimuat. Isi lintang/bujur secara manual.</div>'; });
  }
  const baru = () => ({ id: '', nama: '', alamat: '', lat: ref.lokasi[0] ? ref.lokasi[0].lat : -6.175392, lng: ref.lokasi[0] ? ref.lokasi[0].lng : 106.827153, radius: 100, tz: 'Asia/Jakarta', aktif: true });
  function setTitik(lat, lng, pusatkan) { pilih.lat = +lat.toFixed(7); pilih.lng = +lng.toFixed(7); $('#lf-lat').value = pilih.lat; $('#lf-lng').value = pilih.lng; gambarPeta(pusatkan); }
  function gambarPeta(pusatkan) {
    if (!petaObj) return;
    const { L, m } = petaObj;
    lap.forEach(x => m.removeLayer(x));
    lap = [L.circle([pilih.lat, pilih.lng], { radius: pilih.radius, color: '#2563EB', weight: 2, fillOpacity: 0.1 }).addTo(m),
      L.marker([pilih.lat, pilih.lng], { icon: ikonTitik(L) }).addTo(m).bindTooltip('Titik nol presensi', { permanent: true, direction: 'top', offset: [0, -10] })];
    if (pusatkan) m.setView([pilih.lat, pilih.lng], 17);
  }
  async function simpanLokasi() {
    const d = { id_lokasi: pilih.id, nama: $('#lf-nama').value.trim(), alamat: $('#lf-alamat').value.trim(), lat: $('#lf-lat').value, lng: $('#lf-lng').value, radius_m: pilih.radius, zona_waktu: $('#lf-tz').value, aktif: $('#lf-aktif').checked };
    if (!d.nama) return toast('Nama titik wajib diisi.', 'warn');
    try { const r = await api('admin.lokasi.simpan', d, { invalidasi: ['admin.ref', 'admin.pegawai', 'boot'] }); toast('Lokasi disimpan.', 'ok'); pilih = null; await muat(true); pilih = { ...ref.lokasi.find(l => l.id === r.id) }; lokasi(); } catch (e) { galat(e); }
  }

  /* ------------------------------ Jadwal ------------------------------ */
  function jadwal() {
    const j = pilih || ref.jadwal[0] || { id: '', nama: '', hari: [1, 2, 3, 4, 5], masuk: '07:30', pulang: '16:00', toleransi: 15, buka: '05:30', batasPulang: '23:59' };
    pilih = j;
    $('#lk-isi').innerHTML = `<div class="g-1-2"><div><div class="row between mb-12"><b>${ic('schedule')} Pola jam kerja</b><button class="btn sm" id="jd-baru">${ic('add', 'sm')} Tambah jadwal</button></div>
      <div class="q-list">${ref.jadwal.map(x => `<button class="q-item ${x.id === j.id ? 'on' : ''}" data-j="${x.id}"><b>${esc(x.nama)}</b><div class="small muted mt-8">${x.hari.map(h => HR[h]).join(', ')} · ${jamTitik(x.masuk)}–${jamTitik(x.pulang)} · toleransi ${x.toleransi} mnt</div></button>`).join('')}</div></div>
      <section class="card p-20"><b>${j.id ? 'Ubah jadwal' : 'Jadwal baru'}</b>
        <div class="field mt-12"><label>Nama jadwal *</label><input class="input" id="jf-nama" value="${esc(j.nama)}" maxlength="80"></div>
        <div class="field mt-12"><label>Hari kerja</label><div class="row wrap">${[1, 2, 3, 4, 5, 6, 7].map(h => `<label class="check" style="align-items:center"><input type="checkbox" data-h="${h}" ${j.hari.includes(h) ? 'checked' : ''}>${HR[h]}</label>`).join('')}</div></div>
        <div class="grid-3 mt-12"><div class="field"><label>Jam masuk</label><input type="time" class="input" id="jf-m" value="${j.masuk}"></div><div class="field"><label>Jam pulang</label><input type="time" class="input" id="jf-p" value="${j.pulang}"></div><div class="field"><label>Toleransi (menit)</label><input type="number" class="input" id="jf-t" value="${j.toleransi}" min="0" max="120"></div></div>
        <div class="grid-2 mt-12"><div class="field"><label>Presensi masuk dibuka</label><input type="time" class="input" id="jf-b" value="${j.buka}"></div><div class="field"><label>Batas presensi pulang</label><input type="time" class="input" id="jf-bp" value="${j.batasPulang}"></div></div>
        <div class="note mt-12">${ic('info')}<div>Batas penutupan tombol MASUK diatur di Pengaturan → Aturan presensi (bawaan 12.00). Keterlambatan dihitung dari jam masuk bila melewati toleransi.</div></div>
        <div class="row mt-16" style="justify-content:flex-end"><button class="btn" id="jf-simpan" data-sibuk=" Menyimpan…">${ic('save', 'sm')} Simpan jadwal</button></div></section></div>`;
    $('#jd-baru').onclick = () => { pilih = { id: '', nama: '', hari: [1, 2, 3, 4, 5], masuk: '07:30', pulang: '16:00', toleransi: 15, buka: '05:30', batasPulang: '23:59' }; jadwal(); };
    el.querySelectorAll('[data-j]').forEach(b => b.onclick = () => { pilih = ref.jadwal.find(x => x.id === b.dataset.j); jadwal(); });
    $('#jf-simpan').onclick = e => sibuk(e.currentTarget, async () => {
      const d = { id_jadwal: j.id, nama: $('#jf-nama').value, hari_kerja: [...el.querySelectorAll('[data-h]:checked')].map(x => +x.dataset.h), jam_masuk: $('#jf-m').value, jam_pulang: $('#jf-p').value, toleransi_menit: $('#jf-t').value, buka_presensi_masuk: $('#jf-b').value, batas_presensi_pulang: $('#jf-bp').value };
      try { const r = await api('admin.jadwal.simpan', d, { invalidasi: ['admin.ref', 'boot'] }); toast('Jadwal disimpan.', 'ok'); await muat(true); pilih = ref.jadwal.find(x => x.id === r.id); jadwal(); } catch (err) { galat(err); }
    });
  }

  /* ------------------------------ Hari libur ------------------------------ */
  function libur() {
    const tahunList = [...new Set(ref.libur.map(l => l.tanggal.slice(0, 4)).concat([tahun]))].sort();
    const l = ref.libur.filter(x => x.tanggal.startsWith(tahun));
    $('#lk-isi').innerHTML = `<div class="g-2-1"><section class="card"><div class="card-h"><b>${ic('event_busy')} Hari libur ${tahun} (${l.length})</b><select class="input" id="lb-th" style="width:auto">${opsi(tahunList, tahun)}</select></div>
      <div class="card-b" style="padding-top:8px"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Jenis</th><th></th></tr></thead><tbody>
      ${l.map(x => `<tr><td class="nowrap"><b>${esc(tglPanjang(x.tanggal))}</b></td><td>${esc(x.keterangan)}</td><td><span class="badge ${x.jenis === 'nasional' ? 'b-bad' : x.jenis === 'cuti bersama' ? 'b-wait' : 'b-info'}">${esc(x.jenis)}</span></td><td><button class="btn icon sm ghost" data-hapus="${x.tanggal}" aria-label="Hapus">${ic('delete')}</button></td></tr>`).join('') || '<tr><td colspan="4"><div class="empty">Belum ada hari libur.</div></td></tr>'}</tbody></table></div></div></section>
      <section class="card p-20"><b>${ic('add_circle')} Tambah / ubah hari libur</b>
        <div class="field mt-12"><label>Tanggal</label><input type="date" class="input" id="hl-t"></div>
        <div class="field mt-12"><label>Keterangan</label><input class="input" id="hl-k" maxlength="150" placeholder="Contoh: HUT Instansi"></div>
        <div class="field mt-12"><label>Jenis</label><select class="input" id="hl-j">${opsi([['nasional', 'Libur nasional'], ['cuti bersama', 'Cuti bersama'], ['instansi', 'Libur instansi']], 'instansi')}</select></div>
        <button class="btn block mt-16" id="hl-ok" data-sibuk=" Menyimpan…">${ic('save', 'sm')} Simpan</button>
        <div class="note mt-12">${ic('info')}<div>Data awal memuat libur nasional & cuti bersama 2026–2027 sesuai SKB 3 Menteri. Hari libur tidak dihitung alpa.</div></div></section></div>`;
    $('#lb-th').onchange = e => { tahun = e.target.value; libur(); };
    el.querySelectorAll('[data-hapus]').forEach(b => b.onclick = async () => {
      if (!await konfirmasi({ judul: 'Hapus hari libur?', pesan: esc(tglPanjang(b.dataset.hapus)), ya: 'Hapus', bahaya: true })) return;
      try { await api('admin.libur.hapus', { tanggal: b.dataset.hapus }, { invalidasi: ['admin.ref'] }); ref.libur = ref.libur.filter(x => x.tanggal !== b.dataset.hapus); libur(); tabs(); } catch (e) { galat(e); }
    });
    $('#hl-ok').onclick = e => sibuk(e.currentTarget, async () => {
      const d = { tanggal: $('#hl-t').value, keterangan: $('#hl-k').value, jenis: $('#hl-j').value };
      try { await api('admin.libur.simpan', d, { invalidasi: ['admin.ref'] }); toast('Hari libur disimpan.', 'ok'); await muat(true); tahun = d.tanggal.slice(0, 4); libur(); } catch (err) { galat(err); }
    });
  }

  function muat(segar) {
    return new Promise(res => swr('admin.ref.list', {}, d => { ref = d; if (!segar) gambar(); res(); }, { onError: e => { galat(e); res(); } }));
  }
  await muat();
}
