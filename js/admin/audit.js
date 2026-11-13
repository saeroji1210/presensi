/* =====================================================================
   admin/audit.js — Log audit (PRD 5.13): hanya-lihat. Filter (cari,
   rentang tanggal, aktor, aksi, entitas), halaman server-side, pemeriksa
   beda nilai (data lama vs data baru), ekspor CSV.
   ===================================================================== */
import { api, swr } from '../core/api.js';
import { esc, ic, galat, tglJamIso, debounce, unduhTeks, angka, sibuk, avatar } from '../core/util.js';
import { pgHead, opsi } from './ui.js';

const WARNA = { SETUJUI: 'b-ok', TOLAK: 'b-bad', RESET_PERANGKAT: 'b-wait', UBAH_DATA: 'b-info', UBAH_PENGATURAN: 'b-duty', DAFTAR_WAJAH: 'b-ok', HAPUS_WAJAH: 'b-bad', LOGIN_DARURAT: 'b-wait', LOGIN_DARURAT_GAGAL: 'b-bad', PERANGKAT_GANDA: 'b-bad' };

export async function render(el) {
  let f = { q: '', dari: '', sampai: '', aktor: '', aksi: '', entitas: '', halaman: 1, per: 20 }, data = null, buka = null;
  el.innerHTML = `${pgHead('Log audit & keamanan sistem', 'Rekam jejak aktivitas administratif, perubahan konfigurasi, persetujuan, dan integritas data.', `<div class="ctrl"><small>Total log</small><b id="au-total">–</b></div><button class="btn ghost" id="au-csv" data-sibuk=" Menyiapkan…">${ic('download')} Ekspor CSV</button>`)}
    <div class="note mb-16">${ic('lock')}<div><b>Log hanya-tambah.</b> Aplikasi tidak menyediakan fungsi untuk mengubah atau menghapus log. Nilai rahasia (token, sandi, vektor wajah) otomatis disamarkan sebelum dicatat. Perlindungan penuh juga bergantung pada pembatasan akses editor spreadsheet master.</div></div>
    <div class="card p-16 mb-16"><div class="toolbar" style="margin:0">
      <div class="input-ic cari">${ic('search')}<input class="input" id="au-q" placeholder="Cari ID entitas, aktor, atau rincian…"></div>
      <input type="date" class="input" id="au-dari"><input type="date" class="input" id="au-sampai">
      <select class="input" id="au-aktor"></select><select class="input" id="au-aksi"></select><select class="input" id="au-ent"></select>
      <button class="btn link" id="au-reset">Reset semua filter</button></div></div>
    <div id="au-list">${'<div class="sk" style="height:56px;margin:8px 0"></div>'.repeat(6)}</div>`;
  const $ = s => el.querySelector(s);
  $('#au-q').oninput = debounce(e => { f.q = e.target.value; f.halaman = 1; muat(); }, 300);
  [['#au-dari', 'dari'], ['#au-sampai', 'sampai'], ['#au-aktor', 'aktor'], ['#au-aksi', 'aksi'], ['#au-ent', 'entitas']].forEach(([s, k]) => { $(s).onchange = e => { f[k] = e.target.value; f.halaman = 1; muat(); }; });
  $('#au-reset').onclick = () => { f = { ...f, q: '', dari: '', sampai: '', aktor: '', aksi: '', entitas: '', halaman: 1 }; el.querySelectorAll('#au-q,#au-dari,#au-sampai').forEach(x => x.value = ''); muat(); };
  $('#au-csv').onclick = e => sibuk(e.currentTarget, async () => {
    try {
      const semua = await api('admin.audit.list', { ...f, halaman: 1, per: 100 });
      let rows = semua.list, h = 2;
      while (rows.length < semua.cocok && h <= 50) { const r = await api('admin.audit.list', { ...f, halaman: h++, per: 100 }); rows = rows.concat(r.list); }
      const csv = [['waktu', 'aktor', 'aksi', 'entitas', 'id_entitas', 'target', 'data_lama', 'data_baru']].concat(rows.map(r => [r.waktu, r.aktor, r.aksi, r.entitas, r.id, r.target, r.lama, r.baru]))
        .map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
      unduhTeks(csv, 'Log_Audit.csv');
    } catch (err) { galat(err); }
  });

  function beda(lama, baru) {
    let a = {}, b = {};
    try { a = lama ? JSON.parse(lama) : {}; } catch { a = { nilai: lama }; }
    try { b = baru ? JSON.parse(baru) : {}; } catch { b = { nilai: baru }; }
    const kunci = [...new Set(Object.keys(a || {}).concat(Object.keys(b || {})))];
    const v = x => x === null || x === undefined ? 'null' : typeof x === 'object' ? JSON.stringify(x) : String(x);
    const baris = (o, k) => `<div class="baris ${v((a || {})[k]) !== v((b || {})[k]) ? 'beda' : ''}"><span>${esc(k)}:</span><span>${esc(v((o || {})[k]))}</span></div>`;
    return `<div class="diff mt-12"><div class="lama"><div class="row between mb-8"><b>${ic('remove_circle', 'sm')} DATA LAMA (SEBELUM)</b></div>${lama ? kunci.map(k => baris(a, k)).join('') : '<span class="muted">— (data baru)</span>'}</div>
      <div class="baru"><div class="row between mb-8"><b>${ic('add_circle', 'sm')} DATA BARU (SESUDAH)</b></div>${baru ? kunci.map(k => baris(b, k)).join('') : '<span class="muted">— (dihapus)</span>'}</div></div>`;
  }

  function gambar() {
    $('#au-total').textContent = angka(data.total) + ' event';
    $('#au-aktor').innerHTML = opsi(data.opsi.aktor, f.aktor, 'Semua aktor');
    $('#au-aksi').innerHTML = opsi(data.opsi.aksi, f.aksi, 'Semua aksi');
    $('#au-ent').innerHTML = opsi(data.opsi.entitas, f.entitas, 'Semua entitas');
    const maks = Math.max(1, Math.ceil(data.cocok / f.per));
    $('#au-list').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Waktu</th><th>Aktor</th><th>Kategori aksi</th><th>Entitas sasaran</th><th>Ringkasan</th><th></th></tr></thead><tbody>
      ${data.list.map((r, i) => `<tr class="clickable" data-i="${i}"><td class="nowrap"><div class="small"><b>${esc(tglJamIso(r.waktu))}</b></div><div class="sub">#${r.no}</div></td>
        <td><div class="row">${avatar(r.aktor)}<div><div class="nm" style="font-size:13px">${esc(String(r.aktor).split('@')[0])}</div><div class="sub">${esc(r.aktor.includes('@') ? r.aktor.split('@')[1] : r.aktor)}</div></div></div></td>
        <td><span class="badge ${WARNA[r.aksi] || 'b-neutral'}">${esc(r.aksi.replace(/_/g, ' ').toLowerCase())}</span></td>
        <td><b>${esc(r.entitas)}</b><div class="sub" style="font-family:ui-monospace,monospace">${esc(String(r.id).slice(0, 18))}</div></td>
        <td style="max-width:360px"><div class="small">${esc(r.target || '')}</div><div class="sub ellipsis" style="max-width:360px">${esc(ringkas(r))}</div></td>
        <td>${ic(buka === i ? 'expand_less' : 'expand_more')}</td></tr>
        ${buka === i ? `<tr><td colspan="6" style="height:auto;background:#FBFCFE"><div class="row between small"><span>${ic('compare_arrows', 'sm')} Perbandingan nilai kolom · tabel <code>${esc(r.entitas)}</code> · ID <code>${esc(r.id)}</code></span></div>${beda(r.lama, r.baru)}</td></tr>` : ''}`).join('') || '<tr><td colspan="6"><div class="empty">Tidak ada log sesuai filter.</div></td></tr>'}</tbody></table>
      <div class="pager"><span>Menampilkan ${data.list.length ? (f.halaman - 1) * f.per + 1 : 0}–${(f.halaman - 1) * f.per + data.list.length} dari <b>${angka(data.cocok)}</b> aktivitas${data.catatan ? ' · ' + esc(data.catatan) : ''}</span>
        <div class="hal"><button data-h="${Math.max(1, f.halaman - 1)}">‹</button><button class="on">${f.halaman}</button><span class="small muted" style="align-self:center;padding:0 6px">dari ${maks}</span><button data-h="${Math.min(maks, f.halaman + 1)}">›</button></div></div></div>`;
    $('#au-list').querySelectorAll('tr[data-i]').forEach(tr => tr.onclick = () => { buka = buka === +tr.dataset.i ? null : +tr.dataset.i; gambar(); });
    $('#au-list').querySelectorAll('[data-h]').forEach(b => b.onclick = () => { f.halaman = +b.dataset.h; buka = null; muat(); });
  }
  function ringkas(r) {
    try { const b = JSON.parse(r.baru || '{}'); return Object.entries(b).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · '); } catch { return r.baru || ''; }
  }
  function muat() { swr('admin.audit.list', f, d => { data = d; gambar(); }, { onError: e => galat(e) }); }
  muat();
}
