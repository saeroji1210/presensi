/* =====================================================================
   admin/tinjauan.js — Antrean tinjauan presensi mencurigakan (PRD 5.7):
   daftar kiri (cari & filter tanda risiko), detail kanan: foto presensi vs
   foto referensi (presensi valid terakhir), ring skor, uji kehidupan, peta
   & tabel sampel GPS, penjelasan tanda, riwayat 7 hari, Setujui/Tolak.
   ===================================================================== */
import { api, swr, invalidasi } from '../core/api.js';
import { esc, ic, avatar, badge, jamTitik, jarakTeks, desimal, tgl, tglPanjang, galat, toast, ringSkor, debounce, sibuk, HARI, labelStatus } from '../core/util.js';
import { pgHead, opsi } from './ui.js';
import { petaAudit, tabelSampel, kartuFlag } from './detail.js';
import { perbaruiBadge } from './shell.js';

const FLAG = [['GPS_STATIS', 'GPS statis'], ['POLA_BERULANG', 'Koordinat berulang'], ['LOMPATAN_LOKASI', 'Lompatan lokasi'], ['AKURASI_RENDAH', 'Akurasi rendah'], ['SKOR_ABU', 'Skor wajah abu-abu'], ['PERANGKAT_GANDA', 'Perangkat ganda'], ['LIVENESS_PASIF_RENDAH', 'Liveness pasif rendah']];

export async function render(el) {
  let list = null, pilihId = null, q = '', flag = '', idSaya = '';
  el.innerHTML = `${pgHead('Tinjauan presensi', '<span id="tj-n">Antrean verifikasi manual untuk presensi bertanda risiko biometrik & GPS.</span>')}
    <div class="g-1-2"><div><div class="card p-16 mb-12"><div class="input-ic">${ic('search')}<input class="input" id="tj-q" placeholder="Cari pegawai, NIP, atau unit…"></div>
      <select class="input mt-8" id="tj-f">${opsi(FLAG, '', 'Semua tanda risiko')}</select></div><div class="q-list" id="tj-list">${'<div class="sk" style="height:110px;border-radius:14px"></div>'.repeat(3)}</div></div>
      <section class="card p-20" id="tj-detail"><div class="empty">${ic('fact_check')}Pilih presensi di antrean untuk ditinjau.</div></section></div>`;
  const $ = s => el.querySelector(s);
  $('#tj-q').oninput = debounce(e => { q = e.target.value.toLowerCase(); gambarList(); }, 150);
  $('#tj-f').onchange = e => { flag = e.target.value; gambarList(); };

  const saring = () => (list || []).filter(x => (!q || (x.pegawai.nama + ' ' + x.pegawai.nip + ' ' + x.pegawai.unit).toLowerCase().includes(q)) && (!flag || x.kodeFlag.includes(flag)));
  function gambarList() {
    const l = saring();
    $('#tj-n').innerHTML = `<b>${list ? list.length : 0}</b> antrean perlu tindakan · presensi tetap tercatat sampai diputuskan`;
    $('#tj-list').innerHTML = l.length ? l.map(x => `<button class="q-item ${x.id === pilihId ? 'on' : ''}" data-id="${x.id}">
      <div class="row between"><div class="row">${avatar(x.pegawai.nama)}<div><b>${esc(x.pegawai.nama)}</b><div class="small muted">NIP ${esc(x.pegawai.nip)}</div></div></div>
      <div class="right"><b class="tnum">${jamTitik(x.jam)}</b><div class="small muted">${esc(tgl(x.tanggal))}</div></div></div>
      <div class="row between small mt-8"><span class="muted">Unit: <b>${esc(x.pegawai.unit)}</b> · ${x.jenis === 'DINAS' ? 'Dinas' : 'Harian'} · ${x.tipe === 'MASUK' ? 'Masuk' : 'Pulang'}</span><span>Skor <b>${desimal(x.skor, 2)}</b></span></div>
      <div class="flags">${x.flags.map(f => `<span class="badge b-wait">${esc(f)}</span>`).join('')}</div></button>`).join('')
      : `<div class="card empty">${ic('task_alt')}${list ? 'Tidak ada presensi yang perlu ditinjau. 🎉' : 'Memuat…'}</div>`;
    $('#tj-list').querySelectorAll('[data-id]').forEach(b => b.onclick = () => buka(b.dataset.id));
  }

  async function buka(id) {
    pilihId = id; gambarList();
    const item = list.find(x => x.id === id);
    const box = $('#tj-detail');
    box.innerHTML = '<div class="sk" style="height:90px"></div><div class="sk" style="height:300px;margin-top:12px"></div>';
    let x;
    try { x = await api('admin.presensi.detail', { id, tanggal: item.tanggal }); } catch (e) { box.innerHTML = `<div class="note bad">${ic('error')}<div>${esc(e.msg || e.message)}</div></div>`; return; }
    if (pilihId !== id) return;
    const warnaSkor = x.skor >= x.ambang.valid ? '#16A34A' : x.skor >= x.ambang.abu ? '#EA580C' : '#DC2626';
    const lv = x.liveness || {};
    const diriSendiri = idSaya && x.id_pegawai === idSaya;
    box.innerHTML = `
      <div class="row between" style="align-items:flex-start;flex-wrap:wrap">
        <div class="row gap-12">${avatar(x.pegawai.nama, 'lg')}<div><div class="row"><b style="font-size:17px">${esc(x.pegawai.nama)}</b><span class="badge b-wait">Perlu ditinjau manual</span></div>
          <div class="small muted">NIP ${esc(x.pegawai.nip)} · ${esc(x.pegawai.jabatan || '-')} · ${esc(x.pegawai.unit)}</div></div></div>
        <div class="right"><small class="muted">WAKTU PRESENSI</small><div><b style="font-size:18px">${esc(String(x.jam).replace(/:/g, '.'))} ${esc(x.zona)}</b></div><div class="small">${esc(tglPanjang(x.tanggal))}</div></div>
      </div>
      <hr class="divider">
      <h3 class="h-sm">Verifikasi biometrik wajah</h3>
      <div class="g-3 mt-12" style="grid-template-columns:1fr auto 1fr;align-items:center;margin-bottom:0">
        <div><div class="small muted mb-8">${ic('photo_camera', 'sm')} Foto presensi (${esc(String(x.jam).slice(0, 5).replace(':', '.'))})</div><div class="foto-box">${x.foto ? `<img src="${x.foto}" alt="Foto presensi">` : ic('no_photography', 'xl')}</div></div>
        <div class="center">${ringSkor(x.skor, warnaSkor)}<div class="small mt-8"><b style="color:${warnaSkor}">${x.skor >= x.ambang.valid ? 'Di atas ambang' : x.skor >= x.ambang.abu ? 'Area abu-abu' : 'Di bawah ambang'}</b></div><div class="tiny muted">Valid ≥ ${desimal(x.ambang.valid, 2)} · abu ≥ ${desimal(x.ambang.abu, 2)}</div></div>
        <div><div class="small muted mb-8">${ic('verified', 'sm')} Foto referensi ${x.fotoRefInfo ? '(' + esc(tgl(x.fotoRefInfo.tanggal)) + ', valid)' : ''}</div><div class="foto-box">${x.fotoRef ? `<img src="${x.fotoRef}" alt="Foto referensi">` : `<div class="center small p-16">${ic('image_not_supported', 'xl')}<br>Belum ada presensi valid 7 hari terakhir</div>`}</div></div>
      </div>
      <div class="row wrap gap-16 mt-12 small">
        <span class="row">${ic(lv.l ? 'check_circle' : 'cancel', 'sm')} Uji kehidupan aktif: <b>${lv.l ? 'LULUS' : 'GAGAL'}</b> (${esc((lv.u || []).map(t => t.replace('_', ' ').toLowerCase()).join(' → '))})</span>
        <span class="row">${ic('visibility', 'sm')} Uji pasif: <b>${lv.p !== null && lv.p !== undefined ? desimal(lv.p, 2) : 'tidak tersedia'}</b></span>
        <span class="row">${ic('smartphone', 'sm')} Perangkat: <b style="color:${x.perangkatCocok ? 'inherit' : 'var(--bad)'}">${x.perangkatCocok ? 'terdaftar' : 'tidak cocok'}</b></span>
        <span class="row">${ic('timer', 'sm')} Durasi: <b>${desimal((lv.d || 0) / 1000, 1)} dtk</b></span>
      </div>
      <hr class="divider">
      <div class="row between"><div><h3 class="h-sm">Audit geofence & telemetri GPS</h3><div class="small muted">${esc(x.lokasi)} · ${esc(jarakTeks(x.jarak))} dari titik acuan</div></div>
        <span class="badge ${x.akurasi > x.ambang.akurasi ? 'b-wait' : 'b-ok'}">Akurasi ±${x.akurasi !== null ? Math.round(x.akurasi) : '–'} m (toleransi ±${x.ambang.akurasi} m)</span></div>
      <div class="g-2 mt-12"><div class="peta tinggi" id="tj-peta"></div><div>${tabelSampel(x)}</div></div>
      ${kartuFlag(x.kodeFlag)}
      <hr class="divider">
      <div class="row between"><h3 class="h-sm">Riwayat disiplin 7 hari</h3><span class="small">Kepatuhan bulan berjalan: <b>${desimal(x.kepatuhanBulan, 1)}%</b></span></div>
      <div class="row gap-4 mt-8" style="overflow-x:auto">${x.riwayat7.map(h => { const d = new Date(h.tanggal + 'T12:00:00Z'); const ini = h.tanggal === x.tanggal; return `<div class="center" style="flex:1;min-width:76px;padding:10px 4px;border-radius:12px;${ini ? 'border:2px solid var(--primary);background:#EFF6FF' : 'background:#F8FAFC'}">
        <div class="small semi">${HARI[d.getUTCDay()].slice(0, 3)}, ${d.getUTCDate()}</div><div class="tnum semi mt-8">${h.jam ? jamTitik(h.jam) : '–'}</div><div class="tiny muted">${esc(h.status ? labelStatus(h.status) : '–')}</div></div>`; }).join('')}</div>
      <hr class="divider">
      ${diriSendiri ? `<div class="note warn">${ic('block')}<div>Ini presensi Anda sendiri. Tinjauan harus dilakukan admin lain.</div></div>` : `
      <div class="field"><label>Catatan admin verifikator <span class="faint">(wajib bila menolak)</span></label>
        <textarea class="input" id="tj-cat" maxlength="400" placeholder="Contoh: biometrik terverifikasi manual melalui video call internal; GPS divalidasi fisik oleh atasan."></textarea></div>
      <div class="row between mt-12 wrap"><span class="small muted">${ic('info', 'sm')} Keputusan tercatat permanen di log audit.</span>
        <div class="row"><button class="btn ghost" id="tj-lewat">Lewati</button><button class="btn red" id="tj-tolak" data-sibuk=" Menolak…">${ic('close')} Tolak presensi</button><button class="btn green" id="tj-ok" data-sibuk=" Menyetujui…">${ic('check')} Setujui presensi</button></div></div>`}`;
    petaAudit($('#tj-peta'), x);
    if (diriSendiri) return;
    $('#tj-lewat').onclick = () => { const l = saring(); const i = l.findIndex(z => z.id === id); if (l[i + 1]) buka(l[i + 1].id); };
    const putus = async (keputusan, btn) => {
      const catatan = $('#tj-cat').value.trim();
      if (keputusan === 'DITOLAK' && !catatan) { $('#tj-cat').classList.add('err'); toast('Catatan wajib diisi saat menolak.', 'warn'); return; }
      await sibuk(btn, async () => {
        try {
          await api('admin.tinjauan.putus', { id, tanggal: x.tanggal, keputusan, catatan }, { invalidasi: ['admin.tinjauan', 'admin.dashboard', 'admin.presensi', 'admin.badge'] });
          const l = saring(); const i = l.findIndex(z => z.id === id);
          list = list.filter(z => z.id !== id); // optimistis
          toast(keputusan === 'VALID' ? 'Presensi disetujui.' : 'Presensi ditolak.', 'ok');
          perbaruiBadge();
          const nx = l[i + 1] || l[i - 1];
          if (nx && nx.id !== id) buka(nx.id); else { pilihId = null; gambarList(); box.innerHTML = `<div class="empty">${ic('task_alt')}Antrean selesai.</div>`; }
        } catch (e) { galat(e); }
      });
    };
    $('#tj-ok').onclick = e => putus('VALID', e.currentTarget);
    $('#tj-tolak').onclick = e => putus('DITOLAK', e.currentTarget);
  }

  swr('admin.tinjauan.list', {}, d => {
    list = d.list; idSaya = d.idSaya; gambarList();
    if (!pilihId && list.length && window.innerWidth > 1180) buka(list[0].id);
  }, { onError: e => galat(e) });
}
