/* =====================================================================
   admin/pegawai.js — Data pegawai: daftar & filter, tambah/ubah, status,
   persetujuan & reset perangkat, pendaftaran wajah (5 sampel) atau kode
   pendaftaran mandiri, impor Excel & migrasi dari spreadsheet lama.
   ===================================================================== */
import { api, swr, invalidasi } from '../core/api.js';
import { esc, ic, avatar, badge, tgl, galat, toast, debounce, modal, konfirmasi, sibuk, LIB, waktuRelatif, unduhDataUrl } from '../core/util.js';
import { pgHead, opsi, tabel, eksporExcel } from './ui.js';
import { perbaruiBadge } from './shell.js';

export async function render(el) {
  let data = null, q = '', unit = '', status = 'AKTIF', wajah = '', tbl = null;
  el.innerHTML = `${pgHead('Data pegawai', 'Kelola pegawai, perangkat terikat, dan pendaftaran wajah.', `
      <button class="btn ghost" id="pg-impor">${ic('upload_file')} Impor Excel</button>
      <button class="btn ghost" id="pg-xls">${ic('download')} Ekspor</button>
      <button class="btn" id="pg-tambah">${ic('person_add')} Tambah pegawai</button>`)}
    <div id="pg-minta"></div>
    <div class="card p-16 mb-16"><div class="toolbar" style="margin:0">
      <div class="input-ic cari">${ic('search')}<input class="input" id="pg-q" placeholder="Cari nama, NIP, email…"></div>
      <select class="input" id="pg-unit"><option value="">Semua unit</option></select>
      <select class="input" id="pg-st">${opsi([['AKTIF', 'Aktif'], ['NONAKTIF', 'Nonaktif'], ['MENUNGGU', 'Menunggu'], ['BLOKIR', 'Blokir']], 'AKTIF', 'Semua status')}</select>
      <select class="input" id="pg-wj">${opsi([['TERDAFTAR', 'Wajah terdaftar'], ['BELUM', 'Wajah belum terdaftar']], '', 'Semua status wajah')}</select>
      <span class="grow"></span><span class="small muted" id="pg-n"></span></div></div>
    <div id="pg-tabel">${'<div class="sk" style="height:56px;margin:8px 0"></div>'.repeat(6)}</div>`;
  const $ = s => el.querySelector(s);
  $('#pg-q').oninput = debounce(e => { q = e.target.value.toLowerCase(); gambar(); }, 150);
  $('#pg-unit').onchange = e => { unit = e.target.value; gambar(); };
  $('#pg-st').onchange = e => { status = e.target.value; gambar(); };
  $('#pg-wj').onchange = e => { wajah = e.target.value; gambar(); };
  $('#pg-tambah').onclick = () => form(null);
  $('#pg-impor').onclick = () => impor();
  $('#pg-xls').onclick = () => data && eksporExcel('Data pegawai', [{ k: 'nip', label: 'NIP' }, { k: 'nama', label: 'Nama' }, { k: 'email', label: 'Email' }, { k: 'no_hp', label: 'No HP' }, { k: 'jabatan', label: 'Jabatan' }, { k: 'unit', label: 'Unit' }, { k: 'kategori_lembur', label: 'Kategori lembur' }, { k: 'peran', label: 'Peran' }, { k: 'status_aktif', label: 'Status' }, { k: 'status_wajah', label: 'Wajah' }, { k: 'perangkat', label: 'Perangkat' }], saring(), 'Data_Pegawai').catch(galat);

  const saring = () => (data ? data.list : []).filter(p => (!q || (p.nama + ' ' + p.nip + ' ' + p.email).toLowerCase().includes(q)) && (!unit || p.unit === unit) && (!status || p.status_aktif === status) && (!wajah || (wajah === 'BELUM' ? p.status_wajah !== 'TERDAFTAR' : p.status_wajah === wajah)));
  const namaRef = (list, id, kunci = 'nama') => { const x = (list || []).find(r => r.id === id); return x ? x[kunci] : '–'; };

  function gambar() {
    if (!data) return;
    const l = saring();
    $('#pg-n').textContent = `${l.length} dari ${data.list.length} pegawai`;
    const su = $('#pg-unit'), v = su.value; su.innerHTML = opsi(data.ref.unit, v, 'Semua unit');
    $('#pg-minta').innerHTML = data.permintaan.length ? `<div class="card p-16 mb-16" style="border-color:#FDE68A;background:#FFFBEB"><div class="row between"><b class="row">${ic('phonelink_setup')} Permintaan perangkat baru (${data.permintaan.length})</b><span class="small muted">Pegawai login dari HP lain</span></div>
      ${data.permintaan.map(r => `<div class="row between mt-12 wrap" style="gap:10px"><div class="row">${avatar(r.nama)}<div><b>${esc(r.nama)}</b><div class="small muted">${esc(r.unit || '')} · lama: ${esc(r.lama || '–')} → baru: <b>${esc(r.info || 'perangkat baru')}</b> · ${esc(waktuRelatif(r.diminta))}</div></div></div>
      ${r.id_pegawai === data.idSaya ? '<span class="small muted">Milik Anda — diproses admin lain</span>' : `<div class="row"><button class="btn sm ghost" data-pr="${r.id}" data-k="DITOLAK">Tolak</button><button class="btn sm green" data-pr="${r.id}" data-k="DISETUJUI">${ic('check', 'sm')} Setujui</button></div>`}</div>`).join('')}</div>` : '';
    $('#pg-minta').querySelectorAll('[data-pr]').forEach(b => b.onclick = () => sibuk(b, async () => {
      try { await api('admin.perangkat.putus', { id: b.dataset.pr, keputusan: b.dataset.k }, { invalidasi: ['admin.pegawai', 'admin.badge'] }); toast('Permintaan perangkat diproses.', 'ok'); perbaruiBadge(); muat(); } catch (e) { galat(e); }
    }));
    const kolom = [
      { k: 'nama', label: 'Pegawai', render: p => `<div class="row">${avatar(p.nama)}<div><div class="nm">${esc(p.nama)}</div><div class="sub">${esc(p.nip || '-')} · ${esc(p.email)}</div></div></div>` },
      { k: 'unit', label: 'Unit / jabatan', render: p => `<div>${esc(p.unit || '-')}</div><div class="sub">${esc(p.jabatan || '')}</div>` },
      { k: 'id_jadwal', label: 'Jadwal & lokasi', render: p => `<div>${esc(namaRef(data.ref.jadwal, p.id_jadwal))}</div><div class="sub">${esc(namaRef(data.ref.lokasi, p.id_lokasi_utama))}</div>` },
      { k: 'status_wajah', label: 'Wajah', render: p => badge(p.status_wajah) },
      { k: 'perangkat', label: 'Perangkat', render: p => p.perangkat ? `<div class="small">${esc(p.perangkat)}</div><div class="sub">${esc(p.perangkat_id)} · ${esc(tgl(p.tgl_bind))}</div>` : '<span class="faint small">Belum terikat</span>' },
      { k: 'peran', label: 'Peran', render: p => `<span class="badge ${/ADMIN/.test(p.peran) ? 'b-duty' : 'b-neutral'}">${esc(String(p.peran).replace(',', ' + ').toLowerCase())}</span>` },
      { k: 'status_aktif', label: 'Status', render: p => badge(p.status_aktif) },
      { k: 'aksi', label: '', urut: false, render: p => `<div class="row nowrap"><button class="btn icon sm ghost" data-a="wajah" data-id="${p.id}" title="Daftarkan wajah">${ic('add_reaction')}</button><button class="btn icon sm ghost" data-a="edit" data-id="${p.id}" title="Ubah">${ic('edit')}</button><button class="btn icon sm ghost" data-a="menu" data-id="${p.id}" title="Lainnya">${ic('more_vert')}</button></div>` }
    ];
    if (tbl) tbl.perbarui(l); else tbl = tabel($('#pg-tabel'), { kolom, baris: l, per: 25, kosong: 'Tidak ada pegawai sesuai filter.' });
    $('#pg-tabel').onclick = e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const p = data.list.find(x => x.id === b.dataset.id);
      if (b.dataset.a === 'edit') form(p); else if (b.dataset.a === 'wajah') daftarWajah(p); else menu(p);
    };
  }

  function form(p) {
    const r = data.ref, baru = !p;
    p = p || { peran: 'PEGAWAI', status_aktif: 'AKTIF', id_jadwal: (r.jadwal[0] || {}).id, id_lokasi_utama: (r.lokasi[0] || {}).id };
    const diri = p.id && p.id === data.idSaya;
    const m = modal({
      judul: baru ? 'Tambah pegawai' : 'Ubah data pegawai', sub: 'Email menjadi kunci login Google. Pastikan email sesuai akun Google pegawai.', ukuran: 'lg',
      isi: `<form id="f" class="col gap-12" autocomplete="off">
        <div class="grid-2"><div class="field"><label>NIP *</label><input class="input" name="nip" value="${esc(p.nip || '')}" required maxlength="30" inputmode="numeric"></div>
        <div class="field"><label>Nama lengkap *</label><input class="input" name="nama" value="${esc(p.nama || '')}" required maxlength="120"></div></div>
        <div class="grid-2"><div class="field"><label>Email akun Google *</label><input class="input" type="email" name="email" value="${esc(p.email || '')}" required></div>
        <div class="field"><label>No. HP</label><input class="input" name="no_hp" value="${esc(p.no_hp || '')}" inputmode="tel" maxlength="20"></div></div>
        <div class="grid-2"><div class="field"><label>Unit kerja *</label><input class="input" name="unit" list="dl-unit" value="${esc(p.unit || '')}" required maxlength="80"><datalist id="dl-unit">${r.unit.map(u => `<option value="${esc(u)}">`).join('')}</datalist></div>
        <div class="field"><label>Jabatan</label><input class="input" name="jabatan" value="${esc(p.jabatan || '')}" maxlength="120"></div></div>
        <div class="grid-3"><div class="field"><label>Jadwal kerja</label><select class="input" name="id_jadwal">${opsi(r.jadwal.map(j => [j.id, j.nama]), p.id_jadwal)}</select></div>
        <div class="field"><label>Lokasi kantor utama</label><select class="input" name="id_lokasi_utama">${opsi(r.lokasi.map(l => [l.id, l.nama]), p.id_lokasi_utama)}</select></div>
        <div class="field"><label>Kategori lembur</label><select class="input" name="kategori_lembur">${opsi(r.kategori, p.kategori_lembur, '— pilih —')}</select></div></div>
        <div class="grid-2"><div class="field"><label>Peran</label><select class="input" name="peran" ${diri ? 'disabled' : ''}>${opsi([['PEGAWAI', 'Pegawai'], ['ADMIN,PEGAWAI', 'Admin + Pegawai'], ['ADMIN', 'Admin saja']], p.peran)}</select></div>
        <div class="field"><label>Status</label><select class="input" name="status_aktif" ${diri ? 'disabled' : ''}>${opsi([['AKTIF', 'Aktif'], ['NONAKTIF', 'Nonaktif'], ['MENUNGGU', 'Menunggu'], ['BLOKIR', 'Blokir']], p.status_aktif)}</select></div></div>
        ${diri ? `<div class="note warn">${ic('info')}<div>Anda tidak dapat mengubah peran/status akun sendiri.</div></div>` : ''}</form>`,
      kaki: `<button class="btn ghost" data-tutup>Batal</button><button class="btn" id="f-ok" data-sibuk=" Menyimpan…">${ic('save', 'sm')} Simpan</button>`
    });
    m.el.querySelector('#f-ok').onclick = e => sibuk(e.currentTarget, async () => {
      const f = m.el.querySelector('#f');
      if (!f.reportValidity()) return;
      const d = Object.fromEntries(new FormData(f));
      if (diri) { d.peran = p.peran; d.status_aktif = p.status_aktif; }
      d.id = p.id;
      try {
        await api('admin.pegawai.simpan', d, { invalidasi: ['admin.pegawai', 'admin.ref', 'admin.dashboard'] });
        m.tutup(); toast(baru ? 'Pegawai ditambahkan. Lanjutkan pendaftaran wajah.' : 'Data pegawai disimpan.', 'ok'); muat();
      } catch (err) { galat(err); }
    });
  }

  function menu(p) {
    const diri = p.id === data.idSaya;
    const m = modal({
      judul: p.nama, sub: `${esc(p.nip || '')} · ${esc(p.unit || '')}`,
      isi: `<div class="col gap-8">
        <button class="btn ghost" data-m="kode">${ic('pin')} Buat kode pendaftaran wajah (pegawai daftar di HP-nya)</button>
        ${p.status_wajah === 'TERDAFTAR' ? `<button class="btn ghost" data-m="hapuswajah">${ic('face_retouching_off')} Hapus template wajah</button>` : ''}
        <button class="btn ghost" data-m="reset" ${diri || !p.perangkat ? 'disabled' : ''}>${ic('phonelink_erase')} Reset perangkat terikat${diri ? ' (milik sendiri)' : ''}</button>
        ${p.status_aktif === 'AKTIF' ? `<button class="btn ghost" data-m="nonaktif" ${diri ? 'disabled' : ''} style="color:var(--bad)">${ic('person_off')} Nonaktifkan pegawai</button>` : `<button class="btn ghost" data-m="aktif" ${diri ? 'disabled' : ''}>${ic('person_check')} Aktifkan kembali</button>`}
      </div>`
    });
    m.el.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => {
      const a = b.dataset.m; m.tutup();
      try {
        if (a === 'kode') {
          const r = await api('admin.wajah.kode', { id_pegawai: p.id });
          modal({ judul: 'Kode pendaftaran wajah', isi: `<div class="center"><div style="font-family:var(--font-h);font-size:44px;letter-spacing:.3em;font-weight:700">${esc(r.kode)}</div>
            <p class="muted">Untuk <b>${esc(r.nama)}</b>. Berlaku ${r.berlakuMenit} menit & sekali pakai.<br>Pegawai membuka <b>Profil → Daftarkan wajah dengan kode admin</b>. Dampingi pegawai selama proses.</p></div>` });
        } else if (a === 'reset') {
          const alasan = await konfirmasi({ judul: 'Reset perangkat?', pesan: `Perangkat <b>${esc(p.perangkat)}</b> dilepas dan semua sesi ${esc(p.nama)} dicabut. Login berikutnya akan mengikat perangkat baru.`, ya: 'Reset', bahaya: true, input: { label: 'Alasan (dicatat di log audit)', placeholder: 'Contoh: ganti HP, data browser terhapus', wajib: true } });
          if (!alasan) return;
          await api('admin.perangkat.reset', { id_pegawai: p.id, alasan }, { invalidasi: ['admin.pegawai'] }); toast('Perangkat direset.', 'ok'); muat();
        } else if (a === 'hapuswajah') {
          if (!await konfirmasi({ judul: 'Hapus template wajah?', pesan: 'Pegawai tidak bisa presensi sampai didaftarkan ulang.', ya: 'Hapus', bahaya: true })) return;
          await api('admin.wajah.hapus', { id_pegawai: p.id }, { invalidasi: ['admin.pegawai'] }); toast('Template wajah dihapus.', 'ok'); muat();
        } else {
          const st = a === 'nonaktif' ? 'NONAKTIF' : 'AKTIF';
          if (!await konfirmasi({ judul: st === 'NONAKTIF' ? 'Nonaktifkan pegawai?' : 'Aktifkan pegawai?', pesan: st === 'NONAKTIF' ? 'Sesi dicabut dan template wajah dihapus otomatis oleh pemeliharaan mingguan (≤ 30 hari).' : 'Pegawai dapat login kembali.', ya: 'Lanjutkan', bahaya: st === 'NONAKTIF' })) return;
          await api('admin.pegawai.status', { id: p.id, status: st }, { invalidasi: ['admin.pegawai', 'admin.dashboard'] }); toast('Status diperbarui.', 'ok'); muat();
        }
      } catch (e) { galat(e); }
    });
  }

  async function daftarWajah(p) {
    const { bukaPendaftaran } = await import('../face/pendaftaran.js');
    bukaPendaftaran({
      pegawai: p, mode: 'admin',
      kirim: async (vektor, persetujuan, berkas) => {
        await api('admin.wajah.daftar', { id_pegawai: p.id, vektor, persetujuan, berkas: berkas ? { nama: berkas.nama, b64: berkas.b64 } : null }, { invalidasi: ['admin.pegawai'] });
        toast('Template wajah ' + p.nama + ' tersimpan.', 'ok'); muat();
      }
    });
  }

  function impor() {
    let baris = [];
    const m = modal({
      judul: 'Impor & migrasi data pegawai', ukuran: 'lg',
      sub: 'Kolom dikenali dari NAMA header (nip, nama, email, no hp, jabatan, unit, golongan/kategori lembur, lokasi, jadwal). Upsert berkunci email: aman diulang, tidak menggandakan data.',
      isi: `<div class="tabs mb-16"><button class="tab on" data-t="xls">${ic('table')} Dari Excel/CSV</button><button class="tab" data-t="ss">${ic('swap_horiz')} Dari spreadsheet lama</button></div>
        <div data-p="xls"><div class="up-box">${ic('upload_file', 'lg')}<div class="grow small muted">Pilih berkas .xlsx / .xls / .csv (baris pertama = header)</div>
          <button class="btn ghost sm" id="im-tpl">${ic('download', 'sm')} Templat</button><label class="btn sm">Pilih berkas<input type="file" hidden id="im-file" accept=".xlsx,.xls,.csv"></label></div><div id="im-prev" class="mt-12"></div></div>
        <div data-p="ss" hidden><div class="field"><label>URL atau ID spreadsheet lama</label><input class="input" id="im-src" placeholder="https://docs.google.com/spreadsheets/d/…"></div>
          <div class="field mt-8"><label>Nama sheet</label><input class="input" id="im-sheet" value="Pegawai"></div>
          <div class="note mt-12">${ic('info')}<div>Spreadsheet lama hanya <b>dibaca</b>, tidak diubah. Harus bisa dibuka oleh akun pemilik skrip.</div></div></div>
        <div id="im-hasil" class="mt-12"></div>`,
      kaki: `<button class="btn ghost" data-tutup>Tutup</button><button class="btn ghost" id="im-pindai" data-sibuk=" Memindai…">${ic('search', 'sm')} Pindai (uji coba)</button><button class="btn" id="im-go" data-sibuk=" Mengimpor…">${ic('download_done', 'sm')} Impor sekarang</button>`
    });
    let mode = 'xls';
    m.el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { mode = b.dataset.t; m.el.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === b)); m.el.querySelectorAll('[data-p]').forEach(x => x.hidden = x.dataset.p !== mode); });
    m.el.querySelector('#im-tpl').onclick = async () => {
      const XLSX = await LIB.xlsx();
      const ws = XLSX.utils.aoa_to_sheet([['nip', 'nama', 'email', 'no_hp', 'jabatan', 'unit', 'kategori_lembur', 'lokasi', 'jadwal'], ["'198804122011012001", 'Siti Rahmawati', 'siti@instansi.go.id', '081234567890', 'Bendahara', 'Keuangan', 'Golongan III', '', '']]);
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Pegawai'); XLSX.writeFile(wb, 'Templat_Impor_Pegawai.xlsx');
    };
    m.el.querySelector('#im-file').onchange = async e => {
      try {
        const XLSX = await LIB.xlsx();
        const wb = XLSX.read(await e.target.files[0].arrayBuffer(), { type: 'array' });
        baris = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
        const k = Object.keys(baris[0] || {});
        m.el.querySelector('#im-prev').innerHTML = `<div class="small muted mb-8">${baris.length} baris · kolom: ${esc(k.join(', '))}</div><div class="tbl-wrap" style="max-height:220px"><table class="tbl"><thead><tr>${k.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${baris.slice(0, 8).map(r => `<tr>${k.map(x => `<td>${esc(r[x])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      } catch (err) { galat(err); }
    };
    const jalan = async (dry, btn) => sibuk(btn, async () => {
      try {
        const r = mode === 'xls'
          ? (baris.length ? await api('admin.pegawai.impor', { baris, dryRun: dry }) : (toast('Pilih berkas terlebih dahulu.', 'warn'), null))
          : await api(dry ? 'admin.migrasi.pindai' : 'admin.migrasi.impor', { sumber: m.el.querySelector('#im-src').value, sheet: m.el.querySelector('#im-sheet').value });
        if (!r) return;
        m.el.querySelector('#im-hasil').innerHTML = `<div class="note ${dry ? '' : 'ok'}">${ic(dry ? 'search' : 'task_alt')}<div><b>${dry ? 'Hasil pindai (belum ditulis)' : 'Impor selesai'}</b>: ${r.tambah} baru, ${r.ubah} diperbarui, ${r.lewati} dilewati.
          ${r.kolomTerbaca ? '<br>Kolom terbaca: ' + esc(r.kolomTerbaca.join(', ')) : ''}${r.galat && r.galat.length ? '<br><small>' + esc(r.galat.join(' · ')) + '</small>' : ''}</div></div>`;
        if (!dry) { invalidasi(['admin.pegawai', 'admin.ref']); muat(); }
      } catch (e) { galat(e); }
    });
    m.el.querySelector('#im-pindai').onclick = e => jalan(true, e.currentTarget);
    m.el.querySelector('#im-go').onclick = e => jalan(false, e.currentTarget);
  }

  function muat() { swr('admin.pegawai.list', {}, d => { data = d; gambar(); }, { onError: e => galat(e) }); }
  muat();
}
