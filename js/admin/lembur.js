/* =====================================================================
   admin/lembur.js — Lembur (PRD 5.9): KPI (jam disetujui, dihitung,
   kelebihan tidak dihitung, total nominal), kebijakan perhitungan,
   tab Pengajuan / Disetujui & SPL / Realisasi & Nominal, buat SPL,
   persetujuan dengan durasi, ekspor Excel untuk bagian keuangan.
   ===================================================================== */
import { api, swr, ambil } from '../core/api.js';
import { esc, ic, avatar, badge, tgl, galat, toast, sibuk, rupiah, desimal, menitKeTeks, jamTitik, hariIniLokal, siapkanUnggahan, modal, konfirmasi, debounce } from '../core/util.js';
import { pgHead, opsi, opsiBulan, bulanIni, tabel, eksporExcel, pilihPegawai, pratinjauBerkas } from './ui.js';
import { perbaruiBadge, prosesNotif } from './shell.js';

export async function render(el) {
  let bulan = bulanIni(), unit = '', q = '', tab = 'pengajuan', data = null, tbl = null;
  el.innerHTML = `${pgHead('Lembur pegawai', 'Monitoring jam lembur aktual, persetujuan SPL, dan kalkulasi nominal.', `
      <label class="ctrl"><small>Periode</small><select id="lb-bln">${opsiBulan(bulan)}</select></label>
      <label class="ctrl"><small>Unit</small><select id="lb-unit"><option value="">Semua unit</option></select></label>
      <button class="btn violet" id="lb-spl">${ic('add_circle')} Buat Surat Perintah Lembur</button>`)}
    <div class="kpi-lite" id="lb-kpi">${'<div class="sk" style="height:84px;border-radius:16px"></div>'.repeat(4)}</div>
    <div class="note mb-16">${ic('info')}<div><b>Kebijakan perhitungan lembur:</b> lembur hanya dihitung bila disetujui admin. Jam dihitung = nilai terkecil antara kelebihan jam aktual (jam pulang valid − jam pulang jadwal) dan durasi disetujui, dibulatkan ke bawah per <b id="lb-bul">30</b> menit, dibatasi maksimal jam per hari sesuai kategori. Datang lebih awal tidak dihitung. Tanpa persetujuan: tercatat "Tidak dihitung lembur", Rp0.</div></div>
    <div class="row between mb-12 wrap"><div class="tabs" id="lb-tabs"></div>
      <div class="row"><div class="input-ic">${ic('search')}<input class="input" id="lb-q" placeholder="Cari pegawai / NIP…" style="min-height:40px"></div><button class="btn ghost" id="lb-xls">${ic('download')} Ekspor Excel</button></div></div>
    <div id="lb-tabel"></div>`;
  const $ = s => el.querySelector(s);
  $('#lb-bln').onchange = e => { bulan = e.target.value; muat(); };
  $('#lb-unit').onchange = e => { unit = e.target.value; muat(); };
  $('#lb-q').oninput = debounce(e => { q = e.target.value; muat(); }, 300);
  $('#lb-spl').onclick = () => formSpl();
  $('#lb-xls').onclick = () => ekspor();

  const pegCol = { k: 'nama', label: 'Pegawai', render: r => `<div class="row">${avatar(r.pegawai.nama)}<div><div class="nm">${esc(r.pegawai.nama)}</div><div class="sub">${esc(r.pegawai.jabatan || '')} · ${esc(r.pegawai.unit || '')}</div></div></div>` };
  function gambar() {
    const k = data.kpi;
    $('#lb-bul').textContent = data.pembulatan;
    $('#lb-kpi').innerHTML = [['verified', 'Jam disetujui', desimal(k.jamDisetujui, 1) + ' jam', `${k.pegawaiSPL} pegawai ber-SPL`, 'var(--ok)', 'var(--ok-tint)'],
      ['calculate', 'Jam dihitung', desimal(k.jamDihitung, 1) + ' jam', 'Tervalidasi aturan jam', 'var(--primary)', 'var(--primary-tint)'],
      ['hourglass_disabled', 'Kelebihan tidak dihitung', desimal(k.jamTidakDihitung, 1) + ' jam', 'Bekerja melebihi jam tanpa SPL', 'var(--late)', 'var(--late-tint)'],
      ['payments', 'Total nominal', rupiah(k.nominal), 'Siap ekspor ke keuangan', 'var(--accent)', 'var(--duty-tint)']]
      .map(([i, l, n, s, c, bg]) => `<div class="kl"><span class="bulat" style="background:${bg};color:${c}">${ic(i)}</span><div><small class="h-sm" style="font-size:11px">${l}</small><b style="font-size:22px">${n}</b><small>${s}</small></div></div>`).join('');
    $('#lb-tabs').innerHTML = [['pengajuan', 'Pengajuan lembur', data.menunggu.length], ['disetujui', 'Disetujui & SPL', data.disetujui.length], ['realisasi', 'Realisasi & nominal', data.realisasi.length]]
      .map(([v, l, n]) => `<button class="tab ${tab === v ? 'on' : ''}" data-t="${v}">${l} <span class="count">${n}</span></button>`).join('');
    $('#lb-tabs').querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; tbl = null; gambar(); });
    let kolom, baris;
    if (tab === 'pengajuan') {
      baris = data.menunggu;
      kolom = [{ k: 'tanggal', label: 'Tanggal', tipe: 'tgl' }, pegCol,
        { k: 'mulai', label: 'Rencana', render: r => `${jamTitik(r.mulai)}–${jamTitik(r.selesai)}<div class="sub">${desimal(r.rencanaJam, 2)} jam</div>` },
        { k: 'uraian', label: 'Uraian tugas', render: r => `<div style="max-width:280px">${esc(r.uraian)}</div>` },
        { k: 'batas', label: 'Batas setuju', render: r => `<span style="color:${r.batas < hariIniLokal() ? 'var(--bad)' : ''}">${esc(tgl(r.batas))}</span>` },
        { k: 'aksi', label: '', urut: false, render: r => r.id_pegawai === data.idSaya ? '<span class="small muted">Milik Anda</span>' : `<div class="row nowrap"><button class="btn sm ghost" data-tolak="${r.id}">Tolak</button><button class="btn sm green" data-setuju="${r.id}">${ic('check', 'sm')} Setujui</button></div>` }];
    } else if (tab === 'disetujui') {
      baris = data.disetujui;
      kolom = [{ k: 'tanggal', label: 'Tanggal', tipe: 'tgl' }, pegCol,
        { k: 'mulai', label: 'Jam', render: r => `${jamTitik(r.mulai)}–${jamTitik(r.selesai)}` }, { k: 'durasi', label: 'Disetujui (jam)', tipe: 'n' },
        { k: 'sumber', label: 'Sumber', render: r => `<span class="badge ${r.sumber === 'ADMIN' ? 'b-duty' : 'b-info'}">${r.sumber === 'ADMIN' ? 'SPL admin' : 'Pengajuan pegawai'}</span>` },
        { k: 'disetujui_oleh', label: 'Disetujui oleh', render: r => `<span class="small">${esc(String(r.disetujui_oleh || '').split('@')[0])}</span>` },
        { k: 'file', label: 'SPL', urut: false, render: r => r.file ? `<button class="btn icon sm ghost" data-spl="${r.file}">${ic('description')}</button>` : '' }];
    } else {
      baris = data.realisasi;
      kolom = [{ k: 'tanggal', label: 'Tanggal', tipe: 'tgl' }, pegCol,
        { k: 'disetujui', label: 'Disetujui (SPL)', render: r => r.disetujui === null ? '<span class="faint">— tanpa SPL</span>' : desimal(r.disetujui, 2) + ' jam' },
        { k: 'kelebihan', label: 'Kelebihan aktual', render: r => menitKeTeks(r.kelebihan) },
        { k: 'dihitung', label: 'Dihitung', render: r => r.dihitung ? `<b>${menitKeTeks(r.dihitung)}</b> ${ic('verified', 'sm')}` + (r.disetujui !== null && r.dihitung < r.kelebihan ? `<div class="tiny muted">pembulatan ${data.pembulatan} mnt / batas</div>` : '') : '<b>0 jam</b>' },
        { k: 'nominal', label: 'Nominal', tipe: 'rp' },
        { k: 'sumber', label: 'Keterangan', render: r => r.disetujui === null ? '<span class="badge b-neutral">Tidak dihitung lembur</span>' : `<span class="badge ${r.sumber === 'ADMIN' ? 'b-duty' : 'b-info'}">${r.sumber === 'ADMIN' ? 'SPL admin' : 'Pengajuan pegawai'}</span>` }];
    }
    tbl = tabel($('#lb-tabel'), {
      kolom, baris, per: 20, kosong: 'Tidak ada data lembur pada periode ini.',
      footer: tab === 'realisasi' ? rows => `<tr><td colspan="5">Akumulasi ${rows.length} catatan</td><td class="num">${rupiah(rows.reduce((a, r) => a + r.nominal, 0))}</td><td></td></tr>` : null
    });
    $('#lb-tabel').onclick = e => {
      const s = e.target.closest('[data-setuju]'), t = e.target.closest('[data-tolak]'), f = e.target.closest('[data-spl]');
      if (s) putus(s.dataset.setuju, 'DISETUJUI'); else if (t) putus(t.dataset.tolak, 'DITOLAK'); else if (f) pratinjauBerkas(f.dataset.spl, 'Surat Perintah Lembur');
    };
  }

  async function putus(id, keputusan) {
    const r = data.menunggu.find(x => x.id === id);
    let d = { id, keputusan };
    if (keputusan === 'DITOLAK') {
      const c = await konfirmasi({ judul: 'Tolak lembur?', pesan: `${esc(r.pegawai.nama)} · ${esc(tgl(r.tanggal))}`, ya: 'Tolak', bahaya: true, input: { label: 'Alasan penolakan', wajib: true } });
      if (!c) return; d.catatan = c;
    } else {
      const m = modal({
        judul: 'Setujui lembur', sub: `${esc(r.pegawai.nama)} · ${esc(tgl(r.tanggal))} · rencana ${jamTitik(r.mulai)}–${jamTitik(r.selesai)}`,
        isi: `<div class="field"><label>Durasi disetujui (jam)</label><input class="input" type="number" id="ld" min="0.25" max="24" step="0.25" value="${r.rencanaJam}"></div>
          <div class="field mt-12"><label>Catatan (opsional)</label><input class="input" id="lc" maxlength="300"></div>
          ${r.tanggal < hariIniLokal() ? `<div class="note warn mt-12">${ic('history')}<div>Persetujuan susulan (H+${Math.round((new Date(hariIniLokal()) - new Date(r.tanggal)) / 864e5)}). Tercatat di log audit dan rekap tanggal tersebut dihitung ulang.</div></div>` : ''}`,
        kaki: `<button class="btn ghost" data-tutup>Batal</button><button class="btn green" id="lok">Setujui</button>`
      });
      d = await new Promise(res => { m.el.querySelector('#lok').onclick = () => { const v = { id, keputusan, durasi_jam: m.el.querySelector('#ld').value, catatan: m.el.querySelector('#lc').value }; m.tutup(); res(v); }; });
    }
    try {
      await api('admin.lembur.putus', d, { invalidasi: ['admin.lembur', 'admin.badge', 'admin.dashboard'] });
      toast(keputusan === 'DISETUJUI' ? 'Lembur disetujui.' : 'Lembur ditolak.', 'ok'); prosesNotif(); perbaruiBadge(); muat();
    } catch (e) { galat(e); muat(); }
  }

  async function formSpl() {
    const hari = hariIniLokal();
    let berkas = null;
    const m = modal({
      judul: 'Buat Surat Perintah Lembur', sub: 'SPL dari admin langsung berstatus disetujui. Admin tidak dapat membuat SPL untuk dirinya sendiri.', ukuran: 'lg',
      isi: `<div class="col gap-12"><div class="field"><label>Pegawai *</label><div id="spl-peg"></div></div>
        <div class="grid-3"><div class="field"><label>Tanggal *</label><input type="date" class="input" id="spl-tgl" value="${hari}"></div>
          <div class="field"><label>Jam mulai *</label><input type="time" class="input" id="spl-m" value="16:00"></div><div class="field"><label>Jam selesai *</label><input type="time" class="input" id="spl-s" value="18:00"></div></div>
        <div class="field"><label>Durasi disetujui (jam) <span class="faint">— kosongkan = selisih jam</span></label><input type="number" class="input" id="spl-d" min="0.5" max="24" step="0.5"></div>
        <div class="field"><label>Uraian tugas *</label><textarea class="input" id="spl-u" maxlength="500"></textarea></div>
        <div class="field"><label>Unggah SPL bertanda tangan (PDF/JPG, opsional)</label><div class="row"><label class="btn ghost sm">${ic('upload_file', 'sm')} Pilih berkas<input type="file" hidden id="spl-f" accept="application/pdf,image/jpeg,image/png"></label><span class="small muted" id="spl-fn">Belum ada berkas</span></div></div></div>`,
      kaki: `<button class="btn ghost" data-tutup>Batal</button><button class="btn violet" id="spl-ok" data-sibuk=" Menyimpan…">${ic('send', 'sm')} Terbitkan SPL</button>`
    });
    const daftar = await ambil('admin.pegawai.list', {}, 60000).catch(() => ({ list: [], idSaya: '' }));
    const pp = pilihPegawai(m.el.querySelector('#spl-peg'), daftar.list.filter(p => p.status_aktif === 'AKTIF' && p.id !== daftar.idSaya), []);
    m.el.querySelector('#spl-f').onchange = async e => { try { berkas = await siapkanUnggahan(e.target.files[0]); m.el.querySelector('#spl-fn').textContent = berkas.nama; } catch (err) { toast(err.message, 'bad'); } };
    m.el.querySelector('#spl-ok').onclick = e => sibuk(e.currentTarget, async () => {
      const v = id => m.el.querySelector(id).value;
      if (!pp.nilai().length || !v('#spl-u').trim()) return toast('Pilih pegawai dan isi uraian tugas.', 'warn');
      try {
        const r = await api('admin.lembur.spl', { pegawai: pp.nilai(), tanggal: v('#spl-tgl'), jam_mulai: v('#spl-m'), jam_selesai: v('#spl-s'), durasi_jam: v('#spl-d'), uraian: v('#spl-u'), berkas: berkas ? { nama: berkas.nama, b64: berkas.b64 } : null }, { invalidasi: ['admin.lembur', 'admin.dashboard'] });
        m.tutup(); toast(`SPL diterbitkan untuk ${r.jumlah} pegawai.`, 'ok'); prosesNotif(); tab = 'disetujui'; muat();
      } catch (err) { galat(err); }
    });
  }

  function ekspor() {
    if (!data) return;
    const baris = data.realisasi.map(r => ({ tanggal: r.tanggal, nip: r.pegawai.nip, nama: r.pegawai.nama, unit: r.pegawai.unit, disetujui: r.disetujui === null ? '' : r.disetujui, kelebihan: r.kelebihan, dihitung: r.dihitung, jam: desimal(r.dihitung / 60, 2), nominal: r.nominal, ket: r.disetujui === null ? 'Tidak dihitung lembur' : (r.sumber === 'ADMIN' ? 'SPL admin' : 'Pengajuan pegawai') }));
    eksporExcel('Realisasi lembur & nominal ' + bulan, [{ k: 'tanggal', label: 'Tanggal' }, { k: 'nip', label: 'NIP' }, { k: 'nama', label: 'Nama' }, { k: 'unit', label: 'Unit' }, { k: 'disetujui', label: 'Disetujui (jam)' }, { k: 'kelebihan', label: 'Kelebihan (mnt)' }, { k: 'dihitung', label: 'Dihitung (mnt)' }, { k: 'jam', label: 'Dihitung (jam)' }, { k: 'nominal', label: 'Nominal (Rp)' }, { k: 'ket', label: 'Keterangan' }],
      baris, 'Lembur_' + bulan, ['Total nominal: ' + rupiah(data.kpi.nominal)]).catch(galat);
  }

  function muat() {
    swr('admin.lembur.list', { bulan, unit, q }, d => {
      data = d; gambar();
      ambil('admin.ref.list', {}, 300000).then(r => { const s = $('#lb-unit'); if (s && s.options.length <= 1) s.innerHTML = opsi(r.unit, unit, 'Semua unit'); }).catch(() => {});
    }, { onError: e => galat(e) });
  }
  muat();
}
