/* =====================================================================
   admin/pengajuan.js — Disposisi pengajuan izin/sakit/cuti/koreksi
   (PRD 5.8): tab status, filter jenis, antrean kiri, detail kanan dengan
   bukti dukung (pratinjau/unduh), catatan, Setujui/Tolak (bukan milik sendiri).
   ===================================================================== */
import { api, swr } from '../core/api.js';
import { esc, ic, avatar, badge, tgl, tglJamIso, waktuRelatif, galat, toast, debounce, sibuk, jamTitik } from '../core/util.js';
import { pgHead, opsi, pratinjauBerkas } from './ui.js';
import { perbaruiBadge, prosesNotif } from './shell.js';

const LBL = { IZIN: 'Izin', SAKIT: 'Sakit', CUTI: 'Cuti', KOREKSI_PRESENSI: 'Koreksi Presensi' };

export async function render(el, prm) {
  let status = 'MENUNGGU', jenis = '', q = '', data = null, pilihId = null;
  el.innerHTML = `${pgHead('Pengajuan pegawai', 'Persetujuan izin, sakit, cuti, dan koreksi presensi secara terpusat.', `<div class="input-ic" style="min-width:260px">${ic('search')}<input class="input" id="pa-q" placeholder="Cari NIP, nama, atau alasan…"></div>`)}
    <div class="row between mb-12 wrap"><div class="tabs" id="pa-tabs"></div><select class="input" id="pa-jenis" style="width:auto">${opsi(Object.entries(LBL), '', 'Semua jenis pengajuan')}</select></div>
    <div class="g-1-2"><div class="q-list" id="pa-list">${'<div class="sk" style="height:120px;border-radius:14px"></div>'.repeat(3)}</div><section class="card p-20" id="pa-detail"><div class="empty">${ic('assignment')}Pilih pengajuan untuk diproses.</div></section></div>`;
  const $ = s => el.querySelector(s);
  $('#pa-q').oninput = debounce(e => { q = e.target.value; muat(); }, 300);
  $('#pa-jenis').onchange = e => { jenis = e.target.value; muat(); };

  function gambarList() {
    const h = data.hitung;
    $('#pa-tabs').innerHTML = [['MENUNGGU', 'Menunggu'], ['DISETUJUI', 'Disetujui'], ['DITOLAK', 'Ditolak'], ['SEMUA', 'Semua']].map(([k, l]) => `<button class="tab ${status === k ? 'on' : ''}" data-s="${k}">${l} <span class="count">${h[k] || 0}</span></button>`).join('');
    $('#pa-tabs').querySelectorAll('[data-s]').forEach(b => b.onclick = () => { status = b.dataset.s; pilihId = null; muat(); });
    $('#pa-list').innerHTML = data.list.length ? data.list.map(x => `<button class="q-item ${x.id === pilihId ? 'on' : ''}" data-id="${x.id}">
      <div class="row between"><div class="row">${avatar(x.pegawai ? x.pegawai.nama : '?')}<div><b>${esc(x.pegawai ? x.pegawai.nama : '-')}</b><div class="small muted">NIP ${esc(x.pegawai ? x.pegawai.nip : '-')} · ${esc(x.pegawai ? x.pegawai.unit : '')}</div></div></div>
      <span class="badge ${x.jenis === 'KOREKSI_PRESENSI' ? 'b-info' : 'b-leave'}">${esc(LBL[x.jenis])}</span></div>
      <div class="small mt-8 ellipsis">${esc(String(x.alasan).replace(/^\[KOREKSI[^\]]*\]\s*/, ''))}</div>
      <div class="row between small mt-8"><span class="muted">${ic('event', 'sm')} ${esc(tgl(x.mulai))}${x.selesai !== x.mulai ? ' – ' + esc(tgl(x.selesai)) : ''} (${x.hari} hari)</span><span class="muted">${x.bukti.length ? ic('attach_file', 'sm') : ''} ${esc(waktuRelatif(x.diajukan))}</span></div>
      ${status === 'SEMUA' ? `<div class="mt-8">${badge(x.status)}</div>` : ''}</button>`).join('') : `<div class="card empty">${ic('inbox')}Tidak ada pengajuan.</div>`;
    $('#pa-list').querySelectorAll('[data-id]').forEach(b => b.onclick = () => buka(b.dataset.id));
  }

  function buka(id) {
    pilihId = id; gambarList();
    const x = data.list.find(z => z.id === id);
    const diri = x.id_pegawai === data.idSaya;
    const box = $('#pa-detail');
    const k = x.koreksi;
    box.innerHTML = `
      <div class="row between wrap" style="align-items:flex-start"><div class="row gap-12">${avatar(x.pegawai.nama, 'lg')}<div><b style="font-size:17px">${esc(x.pegawai.nama)}</b>
        <div class="small muted">NIP ${esc(x.pegawai.nip)} · Unit ${esc(x.pegawai.unit)}${x.pegawai.jabatan ? ' · ' + esc(x.pegawai.jabatan) : ''}</div></div></div>${badge(x.status)}</div>
      <hr class="divider">
      <div class="kv" style="grid-template-columns:repeat(2,1fr)">
        <div><small>Jenis pengajuan</small><b>${esc(LBL[x.jenis])}</b></div>
        <div><small>Periode / durasi</small><b>${esc(tgl(x.mulai))}${x.selesai !== x.mulai ? ' – ' + esc(tgl(x.selesai)) : ''} · ${x.hari} hari</b></div>
        <div><small>Waktu pengajuan</small><b>${esc(tglJamIso(x.diajukan))}</b></div>
        <div><small>Bukti dukung</small><b>${x.bukti.length ? x.bukti.length + ' berkas' : '<span style="color:var(--wait-dark)">Tidak ada</span>'}</b></div>
      </div>
      <div class="mt-16"><small class="lbl">ALASAN PENGAJUAN</small><p style="margin:6px 0 0;font-size:15px">“${esc(String(x.alasan).replace(/^\[KOREKSI[^\]]*\]\s*/, ''))}”</p></div>
      ${k ? `<div class="card p-16 mt-16" style="background:#F8FAFF"><b class="small">${ic('edit_calendar', 'sm')} Detail koreksi</b><div class="grid-3 mt-8">
        <div class="field"><label>Presensi</label><select class="input" id="pk-tipe" ${x.status !== 'MENUNGGU' ? 'disabled' : ''}>${opsi([['MASUK', 'Masuk'], ['PULANG', 'Pulang']], k.tipe)}</select></div>
        <div class="field"><label>Jam sebenarnya</label><input type="time" class="input" id="pk-jam" value="${esc(k.jam)}" ${x.status !== 'MENUNGGU' ? 'disabled' : ''}></div>
        <div class="field"><label>Jenis</label><input class="input" value="${esc(k.jenis === 'DINAS' ? 'Dinas' : 'Harian')}" disabled></div></div>
        <div class="small muted mt-8">Saat disetujui, sistem menambah baris presensi VALID bertanda "KOREKSI" (riwayat lama tidak ditimpa) lalu menghitung ulang rekap.</div></div>` : ''}
      <div class="mt-16"><div class="row between"><small class="lbl">BERKAS BUKTI DUKUNG (${x.bukti.length})</small></div>
        ${x.bukti.map((b, i) => `<div class="up-file" style="background:#F8FAFC;border:1px solid var(--line)"><span class="ic lg" style="color:var(--bad)">description</span><div class="grow"><b class="small">Bukti ${i + 1}</b><div class="tiny muted">Tersimpan privat di Google Drive</div></div>
          <button class="btn sm ghost" data-lihat="${esc(b)}">${ic('visibility', 'sm')} Pratinjau</button></div>`).join('') || '<div class="small muted mt-8">Tidak ada berkas.</div>'}</div>
      ${x.status !== 'MENUNGGU' ? `<div class="note ${x.status === 'DISETUJUI' ? 'ok' : 'bad'} mt-16">${ic('info')}<div>Diproses oleh <b>${esc(x.diproses_oleh || '-')}</b> · ${esc(tglJamIso(x.diproses_pada))}${x.catatan ? '<br>Catatan: ' + esc(x.catatan) : ''}</div></div>` :
        diri ? `<div class="note warn mt-16">${ic('block')}<div>Ini pengajuan Anda sendiri. Harus diproses admin lain.</div></div>` : `
      <div class="field mt-16"><label>Catatan admin verifikator <span class="faint">(wajib saat menolak · maks 500 karakter)</span></label><textarea class="input" id="pa-cat" maxlength="500" placeholder="Tuliskan catatan disposisi persetujuan atau alasan penolakan…"></textarea></div>
      <div class="row between mt-12 wrap"><span class="small muted">${ic('shield', 'sm')} Aksi disposisi tercatat permanen pada log audit & dikirim ke email pegawai.</span>
        <div class="row"><button class="btn red" id="pa-tolak" data-sibuk=" Menolak…">${ic('cancel')} Tolak</button><button class="btn green" id="pa-ok" data-sibuk=" Menyetujui…">${ic('check_circle')} Setujui</button></div></div>`}`;
    box.querySelectorAll('[data-lihat]').forEach(b => b.onclick = () => pratinjauBerkas(b.dataset.lihat, 'Bukti dukung · ' + x.pegawai.nama));
    if (x.status !== 'MENUNGGU' || diri) return;
    const putus = (keputusan, btn) => {
      const catatan = $('#pa-cat').value.trim();
      if (keputusan === 'DITOLAK' && !catatan) { $('#pa-cat').classList.add('err'); toast('Catatan wajib diisi saat menolak.', 'warn'); return; }
      const d = { id, keputusan, catatan };
      if (k) d.koreksi = { tipe: $('#pk-tipe').value, jam: $('#pk-jam').value };
      sibuk(btn, async () => {
        try {
          await api('admin.pengajuan.putus', d, { invalidasi: ['admin.pengajuan', 'admin.dashboard', 'admin.badge', 'admin.laporan'] });
          toast(keputusan === 'DISETUJUI' ? 'Pengajuan disetujui.' : 'Pengajuan ditolak.', 'ok');
          prosesNotif(); perbaruiBadge();
          const i = data.list.findIndex(z => z.id === id);
          data.list.splice(i, 1); data.hitung.MENUNGGU = Math.max(0, data.hitung.MENUNGGU - 1); data.hitung[keputusan]++;
          const nx = data.list[i] || data.list[i - 1];
          if (nx) buka(nx.id); else { pilihId = null; gambarList(); box.innerHTML = `<div class="empty">${ic('task_alt')}Semua pengajuan sudah diproses.</div>`; }
        } catch (e) { galat(e); }
      });
    };
    $('#pa-ok').onclick = e => putus('DISETUJUI', e.currentTarget);
    $('#pa-tolak').onclick = e => putus('DITOLAK', e.currentTarget);
  }

  function muat() {
    swr('admin.pengajuan.list', { status, jenis, q }, d => {
      data = d; gambarList();
      if (pilihId && d.list.find(x => x.id === pilihId)) buka(pilihId);
      else if (!pilihId && d.list.length && window.innerWidth > 1180) buka(d.list[0].id);
    }, { onError: e => galat(e) });
  }
  muat();
}
