/* =====================================================================
   pegawai/pengajuan.js — Izin, Sakit, Cuti, Koreksi Presensi & Lembur
   (PRD 5.8, 5.9, UI 7.3). Bukti dari kamera atau berkas JPG/PNG/PDF ≤ 5 MB.
   ===================================================================== */
import { swr, api, invalidasi } from '../core/api.js';
import { esc, ic, badge, tgl, waktuRelatif, galat, toast, sibuk, siapkanUnggahan, ukuranTeks, konfirmasi, jamTitik, hariIniLokal } from '../core/util.js';
import { boot, segarkan } from './data.js';
import { params } from '../core/router.js';

const JENIS = [['IZIN', 'Izin'], ['SAKIT', 'Sakit'], ['CUTI', 'Cuti'], ['KOREKSI_PRESENSI', 'Koreksi']];
const LBL = { IZIN: 'Izin', SAKIT: 'Sakit', CUTI: 'Cuti', KOREKSI_PRESENSI: 'Koreksi Presensi' };

export async function render(el) {
  const pr = params();
  let tab = pr.tab === 'lembur' ? 'lembur' : 'izin';
  let data = null, berkas = [], jenis = pr.jenis && LBL[pr.jenis] ? pr.jenis : 'IZIN', formBuka = !!pr.jenis;
  const b = boot();
  const hariIni = b && b.hariIni ? b.hariIni.tanggal : hariIniLokal();

  function gambar() {
    const d = data;
    const menunggu = d ? d.pengajuan.filter(x => x.status === 'MENUNGGU').length : 0;
    el.innerHTML = `<div class="m-wrap" style="padding-top:16px">
      <div class="m-card row gap-12">
        <span class="bulat" style="width:48px;height:48px;border-radius:50%;background:var(--primary-tint);color:var(--primary);display:inline-flex;align-items:center;justify-content:center">${ic('pending_actions')}</span>
        <div class="grow"><div class="muted small">Pengajuan menunggu persetujuan</div><b style="font-size:20px" id="pj-n">${d ? menunggu : '–'} berkas</b></div>
        <span class="badge ${menunggu ? 'b-wait' : 'b-ok'}">${menunggu ? 'Diproses admin' : 'Tidak ada antrean'}</span>
      </div>
      <div class="m-seg mt-16"><button class="${tab === 'izin' ? 'on' : ''}" data-tab="izin">${ic('event_note')} Izin & Sakit</button><button class="${tab === 'lembur' ? 'on' : ''}" data-tab="lembur">${ic('more_time')} Lembur</button></div>
      <div class="m-sec"><h2>${tab === 'izin' ? 'Daftar pengajuan terkini' : 'Pengajuan lembur'}</h2><span class="small muted">${hariIni.slice(0, 4)}</span></div>
      <div id="pj-list">${!d ? '<div class="sk" style="height:90px"></div><div class="sk" style="height:90px;margin-top:12px"></div>' : tab === 'izin' ? daftarIzin(d) : daftarLembur(d)}</div>
      <div class="lembar" id="pj-form">${tab === 'izin' ? formIzin() : formLembur()}</div>
    </div>`;
    el.querySelectorAll('[data-tab]').forEach(x => x.onclick = () => { tab = x.dataset.tab; berkas = []; gambar(); });
    el.querySelectorAll('[data-batal]').forEach(x => x.onclick = () => batal(x.dataset.batal));
    pasangForm();
  }

  function daftarIzin(d) {
    if (!d.pengajuan.length) return `<div class="m-card empty">${ic('inventory_2')}Belum ada pengajuan.</div>`;
    return d.pengajuan.slice(0, 30).map(x => `<div class="pj-card">
      <div class="row between"><div class="row"><span class="badge ${x.jenis === 'KOREKSI_PRESENSI' ? 'b-info' : 'b-leave'}">${esc(LBL[x.jenis])}</span><b>${esc(tgl(x.mulai))}${x.selesai !== x.mulai ? ' – ' + esc(tgl(x.selesai)) : ''}</b></div>${badge(x.status)}</div>
      <div class="small muted mt-8">${x.hari} hari · ${x.bukti.length ? ic('attach_file', 'sm') + ' ' + x.bukti.length + ' bukti' : 'tanpa bukti'}${x.koreksi ? ` · ${x.koreksi.tipe.toLowerCase()} ${jamTitik(x.koreksi.jam)}` : ''}</div>
      <div class="small mt-8">${esc(String(x.alasan).replace(/^\[KOREKSI[^\]]*\]\s*/, ''))}</div>
      ${x.status === 'DITOLAK' && x.catatan ? `<div class="note bad mt-8">${ic('error')}<div>Alasan: ${esc(x.catatan)}</div></div>` : ''}
      ${x.status === 'DISETUJUI' && x.catatan ? `<div class="small mt-8" style="color:var(--ok-dark)">${ic('check', 'sm')} ${esc(x.catatan)}</div>` : ''}
      <div class="row between small mt-8"><span class="faint">${ic('schedule', 'sm')} Diajukan ${esc(waktuRelatif(x.diajukan))}</span>
      ${x.status === 'MENUNGGU' ? `<button class="btn link small" data-batal="${x.id}">Batalkan</button>` : x.diproses_oleh ? `<span class="faint">oleh ${esc(String(x.diproses_oleh).split('@')[0])}</span>` : ''}</div></div>`).join('');
  }

  function daftarLembur(d) {
    if (!d.lembur.length) return `<div class="m-card empty">${ic('more_time')}Belum ada pengajuan lembur.</div>`;
    return d.lembur.slice(0, 30).map(x => `<div class="pj-card">
      <div class="row between"><b>${esc(tgl(x.tanggal))}</b>${badge(x.status)}</div>
      <div class="small muted mt-8">Rencana ${jamTitik(x.mulai)}–${jamTitik(x.selesai)} (${String(x.rencanaJam).replace('.', ',')} jam)${x.durasi !== null ? ` · disetujui <b>${String(x.durasi).replace('.', ',')} jam</b>` : ''} · ${x.sumber === 'ADMIN' ? 'SPL admin' : 'pengajuan sendiri'}</div>
      <div class="small mt-8">${esc(x.uraian)}</div>
      ${x.catatan ? `<div class="small mt-8 muted">${ic('info', 'sm')} ${esc(x.catatan)}</div>` : ''}</div>`).join('');
  }

  function formIzin() {
    const kor = jenis === 'KOREKSI_PRESENSI';
    return `<div class="gagang"></div>
      <button class="row between w-full" data-lipat style="border:0;background:none;padding:4px 0;text-align:left">
        <span class="row gap-12"><span class="bulat" style="width:42px;height:42px;border-radius:12px;background:var(--primary-tint);color:var(--primary);display:inline-flex;align-items:center;justify-content:center">${ic('edit_note')}</span>
        <span><b style="font-size:16px">Formulir pengajuan</b><br><small class="muted">Izin, sakit, cuti, atau koreksi presensi</small></span></span>${ic(formBuka ? 'expand_less' : 'expand_more')}</button>
      <div ${formBuka ? '' : 'hidden'} class="col gap-12 mt-12">
        <div class="field"><label>Pilih kategori</label><div class="chips">${JENIS.map(j => `<button type="button" class="${jenis === j[0] ? 'on' : ''}" data-jenis="${j[0]}">${j[1]}</button>`).join('')}</div></div>
        ${kor ? `<div class="grid-2"><div class="field"><label>Tanggal</label><input type="date" class="input" id="f-mulai" max="${hariIni}" value="${hariIni}"></div>
          <div class="field"><label>Presensi yang dikoreksi</label><select class="input" id="f-ktipe"><option value="MASUK">Masuk</option><option value="PULANG">Pulang</option></select></div></div>
          <div class="grid-2"><div class="field"><label>Jam sebenarnya</label><input type="time" class="input" id="f-kjam" value="16:00"></div>
          <div class="field"><label>Jenis</label><select class="input" id="f-kjenis"><option value="HARIAN">Harian</option><option value="DINAS">Dinas</option></select></div></div>` :
          `<div class="grid-2"><div class="field"><label>Mulai</label><input type="date" class="input" id="f-mulai" value="${hariIni}"></div>
          <div class="field"><label>Selesai</label><input type="date" class="input" id="f-selesai" value="${hariIni}"></div></div>`}
        <div class="field"><label>Alasan pengajuan</label><textarea class="input" id="f-alasan" maxlength="500" placeholder="${kor ? 'Contoh: lupa presensi pulang karena rapat sampai malam' : 'Jelaskan alasan ' + LBL[jenis].toLowerCase() + '…'}"></textarea></div>
        <div class="field"><label>Bukti dukung (JPG/PNG/PDF, maks 5 MB) ${jenis === 'SAKIT' ? '· surat dokter' : jenis === 'CUTI' ? '· opsional' : '· wajib'}</label>
          <div class="up-box"><span class="ic lg" style="color:var(--primary)">upload_file</span><div class="grow small muted">Ambil foto atau pilih berkas</div>
            <label class="btn soft sm">${ic('photo_camera', 'sm')} Kamera<input type="file" accept="image/*" capture="environment" hidden data-up></label>
            <label class="btn ghost sm">${ic('folder_open', 'sm')} Berkas<input type="file" accept="image/jpeg,image/png,application/pdf" hidden data-up multiple></label></div>
          <div id="f-berkas">${berkasHtml()}</div></div>
        <button class="btn block pill" id="f-kirim" style="min-height:52px;font-size:16px" data-sibuk=" Mengirim…">${ic('send')} Kirim pengajuan</button>
      </div>`;
  }

  function formLembur() {
    const j = b && b.hariIni ? b.hariIni.jadwal : { pulang: '16:00' };
    return `<div class="gagang"></div>
      <div class="row gap-12"><span class="bulat" style="width:42px;height:42px;border-radius:12px;background:var(--duty-tint);color:var(--duty);display:inline-flex;align-items:center;justify-content:center">${ic('more_time')}</span>
      <div><b style="font-size:16px">Ajukan lembur hari ini</b><br><small class="muted">Kirim sebelum jam pulang (${jamTitik(j.pulang)}). Hanya lembur yang disetujui admin yang dihitung.</small></div></div>
      <div class="col gap-12 mt-12">
        <div class="grid-2"><div class="field"><label>Mulai</label><input type="time" class="input" id="l-mulai" value="${j.pulang}"></div>
        <div class="field"><label>Selesai</label><input type="time" class="input" id="l-selesai" value="${String((+j.pulang.slice(0, 2) + 2) % 24).padStart(2, '0') + j.pulang.slice(2)}"></div></div>
        <div class="field"><label>Uraian tugas</label><textarea class="input" id="l-uraian" maxlength="500" placeholder="Pekerjaan yang diselesaikan saat lembur"></textarea></div>
        <button class="btn block pill violet" id="l-kirim" style="min-height:52px;font-size:16px" data-sibuk=" Mengirim…">${ic('send')} Kirim pengajuan lembur</button>
      </div>`;
  }

  const berkasHtml = () => berkas.map((f, i) => `<div class="up-file"><span class="ic lg" style="color:var(--leave)">${f.mime === 'application/pdf' ? 'picture_as_pdf' : 'image'}</span>
    <div class="grow"><b class="small ellipsis" style="display:block">${esc(f.nama)}</b><small class="muted">${ukuranTeks(f.ukuran)} · siap dilampirkan</small></div>
    <span class="badge b-ok">${ic('check')}</span><button class="ibtn" data-hapus="${i}" aria-label="Hapus">${ic('close')}</button></div>`).join('');

  function pasangForm() {
    const lip = el.querySelector('[data-lipat]');
    if (lip) lip.onclick = () => { formBuka = !formBuka; gambar(); };
    el.querySelectorAll('[data-jenis]').forEach(x => x.onclick = () => { jenis = x.dataset.jenis; gambar(); });
    el.querySelectorAll('[data-up]').forEach(inp => inp.onchange = async () => {
      for (const f of Array.from(inp.files || [])) {
        if (berkas.length >= 3) { toast('Maksimal 3 berkas.', 'warn'); break; }
        try { berkas.push(await siapkanUnggahan(f)); } catch (e) { toast(e.message, 'bad'); }
      }
      inp.value = '';
      el.querySelector('#f-berkas').innerHTML = berkasHtml(); pasangHapus();
    });
    pasangHapus();
    const k = el.querySelector('#f-kirim');
    if (k) k.onclick = () => sibuk(k, kirimIzin);
    const l = el.querySelector('#l-kirim');
    if (l) l.onclick = () => sibuk(l, kirimLembur);
  }
  function pasangHapus() { el.querySelectorAll('[data-hapus]').forEach(x => x.onclick = () => { berkas.splice(+x.dataset.hapus, 1); el.querySelector('#f-berkas').innerHTML = berkasHtml(); pasangHapus(); }); }

  async function kirimIzin() {
    const v = id => (el.querySelector(id) || {}).value;
    const d = { jenis, tgl_mulai: v('#f-mulai'), tgl_selesai: v('#f-selesai') || v('#f-mulai'), alasan: v('#f-alasan'), berkas: berkas.map(f => ({ nama: f.nama, b64: f.b64 })) };
    if (jenis === 'KOREKSI_PRESENSI') d.koreksi = { tipe: v('#f-ktipe'), jam: v('#f-kjam'), jenis: v('#f-kjenis') };
    if (!String(d.alasan || '').trim()) { toast('Alasan wajib diisi.', 'warn'); return; }
    try {
      const r = await api('pengajuan.buat', d, { invalidasi: ['pengajuan.list', 'boot'] });
      data && data.pengajuan.unshift(r);
      berkas = []; formBuka = false;
      toast('Pengajuan terkirim. Anda akan menerima email setelah diproses.', 'ok');
      gambar(); segarkan(); muat();
    } catch (e) { galat(e); }
  }

  async function kirimLembur() {
    const v = id => el.querySelector(id).value;
    try {
      const r = await api('lembur.ajukan', { jam_mulai: v('#l-mulai'), jam_selesai: v('#l-selesai'), uraian: v('#l-uraian') }, { invalidasi: ['pengajuan.list'] });
      data && data.lembur.unshift(r);
      toast('Pengajuan lembur terkirim.', 'ok'); gambar(); muat();
    } catch (e) { galat(e); }
  }

  async function batal(id) {
    if (!await konfirmasi({ judul: 'Batalkan pengajuan?', pesan: 'Pengajuan yang dibatalkan tidak bisa dipulihkan.', ya: 'Batalkan', bahaya: true })) return;
    try {
      await api('pengajuan.batal', { id }, { invalidasi: ['pengajuan.list', 'boot'] });
      const x = data.pengajuan.find(p => p.id === id); if (x) x.status = 'DIBATALKAN';
      gambar(); segarkan();
    } catch (e) { galat(e); }
  }

  // Pembaruan dari server hanya mengganti daftar (isian formulir yang sedang diketik tidak hilang)
  function muat() {
    swr('pengajuan.list', {}, d => {
      data = d;
      const L = el.querySelector('#pj-list');
      if (!L) return gambar();
      L.innerHTML = tab === 'izin' ? daftarIzin(d) : daftarLembur(d);
      const n = el.querySelector('#pj-n'); if (n) n.textContent = d.pengajuan.filter(x => x.status === 'MENUNGGU').length + ' berkas';
      el.querySelectorAll('[data-batal]').forEach(x => x.onclick = () => batal(x.dataset.batal));
    }, { onError: e => galat(e) });
  }
  gambar();
  muat();
}
