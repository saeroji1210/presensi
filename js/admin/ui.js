/* =====================================================================
   admin/ui.js — Komponen bersama panel admin: kepala halaman, tabel
   (urut, cari, halaman), grafik Chart.js, peta Leaflet, ekspor Excel/PDF,
   pemilih banyak pegawai.
   ===================================================================== */
import { esc, ic, LIB, angka, rupiah, persen, tgl, badge, desimal, debounce, avatar, toast } from '../core/util.js';

export const pgHead = (judul, sub, kontrol = '') => `<div class="pg-head"><div><h1>${esc(judul)}</h1><div class="sub">${sub}</div></div><div class="kontrol no-print">${kontrol}</div></div>`;

export function opsiBulan(pilih, n = 13) {
  const out = [], d = new Date();
  for (let i = 0; i < n; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const v = x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0');
    out.push(`<option value="${v}" ${v === pilih ? 'selected' : ''}>${['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][x.getMonth()]} ${x.getFullYear()}</option>`);
  }
  return out.join('');
}
export const bulanIni = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
export const opsi = (list, pilih, semua) => (semua ? `<option value="">${esc(semua)}</option>` : '') + list.map(x => {
  const [v, l] = Array.isArray(x) ? x : [x, x];
  return `<option value="${esc(v)}" ${String(v) === String(pilih) ? 'selected' : ''}>${esc(l)}</option>`;
}).join('');

/* ----------------------------- Format sel ----------------------------- */
export function fmtSel(v, tipe) {
  if (v === null || v === undefined || v === '') return '<span class="faint">–</span>';
  switch (tipe) {
    case 'tgl': return esc(tgl(v));
    case 'dt': return esc(String(v).slice(0, 16).replace('T', ' '));
    case 'n': return esc(typeof v === 'number' ? desimal(v, 2) : v);
    case 'rp': return esc(rupiah(v));
    case 'pct': return esc(persen(v));
    case 'status': return badge(v);
    default: return esc(v);
  }
}
export function nilaiEkspor(v, tipe) {
  if (v === null || v === undefined) return '';
  if (tipe === 'status') return String(v).replace(/_/g, ' ');
  return v;
}

/* ----------------------------- Tabel ----------------------------- */
/**
 * Tabel dengan urut & halaman (di klien). kolom: [{k,label,tipe,render(row),kelas,lebar,urut:false}]
 */
export function tabel(wadah, { kolom, baris, per = 25, kosong = 'Tidak ada data.', onKlik, pilih, footer, rapat }) {
  let hal = 1, urut = null, arah = 1;
  const gambar = () => {
    let data = baris.slice();
    if (urut) data.sort((a, b) => { const x = a[urut], y = b[urut]; return (x > y ? 1 : x < y ? -1 : 0) * arah; });
    const total = data.length, maksHal = Math.max(1, Math.ceil(total / per));
    if (hal > maksHal) hal = maksHal;
    const isi = data.slice((hal - 1) * per, hal * per);
    wadah.innerHTML = `<div class="tbl-wrap"><table class="tbl ${rapat ? 'rapat' : ''}"><thead><tr>${kolom.map(k => `<th class="${k.urut === false ? '' : 'sortable'} ${['n', 'rp', 'pct'].includes(k.tipe) ? 'num' : ''}" data-k="${k.k}" style="${k.lebar ? 'width:' + k.lebar : ''}">${esc(k.label)}${urut === k.k ? (arah > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${isi.length ? isi.map((r, i) => `<tr class="${onKlik ? 'clickable' : ''} ${pilih && pilih(r) ? 'sel' : ''}" data-i="${(hal - 1) * per + i}">${kolom.map(k => `<td class="${['n', 'rp', 'pct'].includes(k.tipe) ? 'num' : ''} ${k.kelas || ''}">${k.render ? k.render(r) : fmtSel(r[k.k], k.tipe)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${kolom.length}">${'<div class="empty"><span class="ic">inbox</span>' + esc(kosong) + '</div>'}</td></tr>`}</tbody>
      ${footer ? `<tfoot>${footer(data)}</tfoot>` : ''}</table>
      ${total > per ? `<div class="pager"><span>Menampilkan <b>${(hal - 1) * per + 1}–${Math.min(total, hal * per)}</b> dari <b>${angka(total)}</b></span><div class="hal">${halaman(hal, maksHal)}</div></div>` :
        total ? `<div class="pager"><span>Menampilkan <b>${angka(total)}</b> baris</span></div>` : ''}</div>`;
    wadah.querySelectorAll('th.sortable').forEach(th => th.onclick = () => { const k = th.dataset.k; if (urut === k) arah = -arah; else { urut = k; arah = 1; } gambar(); });
    wadah.querySelectorAll('[data-hal]').forEach(b => b.onclick = () => { hal = +b.dataset.hal; gambar(); });
    if (onKlik) wadah.querySelectorAll('tbody tr[data-i]').forEach(tr => tr.onclick = e => { if (e.target.closest('button,a,input,select')) return; onKlik(data[+tr.dataset.i], tr); });
  };
  const halaman = (h, m) => {
    const nomor = new Set([1, m, h - 1, h, h + 1].filter(x => x >= 1 && x <= m));
    let prev = 0, out = `<button data-hal="${Math.max(1, h - 1)}" aria-label="Sebelumnya">‹</button>`;
    [...nomor].sort((a, b) => a - b).forEach(n => { if (n - prev > 1) out += '<button disabled>…</button>'; out += `<button class="${n === h ? 'on' : ''}" data-hal="${n}">${n}</button>`; prev = n; });
    return out + `<button data-hal="${Math.min(m, h + 1)}" aria-label="Berikutnya">›</button>`;
  };
  gambar();
  return { perbarui(b) { baris = b; gambar(); }, gambar };
}

/* ----------------------------- Grafik ----------------------------- */
const grafik = new WeakMap();
export async function chart(kanvas, cfg) {
  if (!kanvas) return null;
  let Chart;
  try { Chart = await LIB.chart(); } catch { kanvas.parentElement.innerHTML = '<div class="empty small">Grafik gagal dimuat (offline).</div>'; return null; }
  if (!kanvas.isConnected) return null;
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  Chart.defaults.color = '#64748B';
  Chart.defaults.borderColor = '#EEF1F7';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  const lama = grafik.get(kanvas);
  if (lama) { lama.data = cfg.data; lama.options = cfg.options || lama.options; lama.update('none'); return lama; }
  const c = new Chart(kanvas, Object.assign({ options: {} }, cfg));
  grafik.set(kanvas, c);
  return c;
}
/** Plugin teks di tengah donat. */
export const teksTengah = (atas, bawah) => ({
  id: 'teksTengah',
  afterDraw(c) {
    const { ctx, chartArea: a } = c; if (!a) return;
    const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2;
    ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#0F172A';
    ctx.font = '700 26px Inter'; ctx.fillText(atas, x, y + 4);
    ctx.font = '600 11px Inter'; ctx.fillStyle = '#64748B'; ctx.fillText(bawah, x, y + 22); ctx.restore();
  }
});

/* ----------------------------- Peta ----------------------------- */
export async function peta(el, { lat = -6.2, lng = 106.82, zoom = 16 } = {}) {
  const L = await LIB.leaflet();
  if (!el.isConnected) return null;
  const m = L.map(el, { zoomControl: true, attributionControl: true }).setView([lat, lng], zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
  setTimeout(() => m.invalidateSize(), 120);
  return { L, m };
}
export const ikonTitik = (L, warna = '#2563EB') => L.divIcon({ className: '', html: `<div style="width:18px;height:18px;border-radius:50%;background:${warna};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });

/* ----------------------------- Ekspor ----------------------------- */
export async function eksporExcel(judul, kolom, baris, namaFile, info = []) {
  const XLSX = await LIB.xlsx();
  const aoa = [[judul], ...info.map(x => [x]), [], kolom.map(k => k.label), ...baris.map(r => kolom.map(k => nilaiEkspor(r[k.k], k.tipe)))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = kolom.map(k => ({ wch: Math.min(40, Math.max(10, String(k.label).length + 2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, namaFile.replace(/[^\w.-]+/g, '_') + '.xlsx');
}

export async function eksporPdf(judul, sub, kolom, baris, namaFile, kanvasGrafik = []) {
  const { jsPDF } = await LIB.pdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.width;
  doc.setFillColor(11, 20, 55); doc.rect(0, 0, W, 54, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(judul.toUpperCase(), 32, 30);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(sub, 32, 45);
  let y = 70;
  const gr = kanvasGrafik.filter(c => c && c.width);
  if (gr.length) {
    const lebar = (W - 64 - (gr.length - 1) * 16) / gr.length;
    gr.forEach((c, i) => {
      const h = lebar * c.height / c.width;
      doc.addImage(c.toDataURL('image/png', 1), 'PNG', 32 + i * (lebar + 16), y, lebar, Math.min(h, 190));
    });
    y += 200;
  }
  doc.setTextColor(15, 23, 42);
  doc.autoTable({
    startY: y, head: [kolom.map(k => k.label)], body: baris.map(r => kolom.map(k => {
      const v = nilaiEkspor(r[k.k], k.tipe);
      return k.tipe === 'rp' ? rupiah(v) : k.tipe === 'pct' ? persen(v) : k.tipe === 'tgl' ? tgl(v) : v;
    })),
    styles: { fontSize: 7.5, cellPadding: 4 }, headStyles: { fillColor: [15, 27, 76], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] }, margin: { left: 32, right: 32 },
    didDrawPage: () => { doc.setFontSize(8); doc.setTextColor(148, 163, 184); doc.text('Sistem Presensi Pegawai · dicetak ' + new Date().toLocaleString('id-ID'), 32, doc.internal.pageSize.height - 16); }
  });
  doc.save(namaFile.replace(/[^\w.-]+/g, '_') + '.pdf');
}

/* ----------------------------- Pilih banyak pegawai ----------------------------- */
export function pilihPegawai(wadah, daftar, terpilih = [], onUbah) {
  let pilih = new Set(terpilih), q = '';
  const gambar = () => {
    const sel = daftar.filter(p => pilih.has(p.id));
    wadah.innerHTML = `<div class="multi"><div class="chiplist">${sel.map(p => `<span class="chip">${esc(p.nama)}<button type="button" data-x="${p.id}" aria-label="Hapus">${ic('close', 'sm')}</button></span>`).join('')}</div>
      <div class="input-ic">${ic('person_add')}<input class="input" placeholder="+ Tambah pegawai (cari nama/NIP/unit)…" value="${esc(q)}"></div><div class="dd" hidden></div></div>`;
    const inp = wadah.querySelector('input'), dd = wadah.querySelector('.dd');
    const isiDd = () => {
      const s = q.toLowerCase();
      const hasil = daftar.filter(p => !pilih.has(p.id) && (!s || (p.nama + ' ' + p.nip + ' ' + p.unit).toLowerCase().includes(s))).slice(0, 30);
      dd.innerHTML = hasil.length ? hasil.map(p => `<button type="button" data-a="${p.id}">${avatar(p.nama)}<span><b>${esc(p.nama)}</b><br><small class="muted">${esc(p.nip || '')} · ${esc(p.unit || '')}</small></span></button>`).join('') : '<div class="p-16 muted small">Tidak ditemukan.</div>';
      dd.querySelectorAll('[data-a]').forEach(b => b.onmousedown = e => { e.preventDefault(); pilih.add(b.dataset.a); q = ''; onUbah && onUbah([...pilih]); gambar(); wadah.querySelector('input').focus(); });
    };
    inp.onfocus = () => { dd.hidden = false; isiDd(); };
    inp.onblur = () => setTimeout(() => { dd.hidden = true; }, 150);
    inp.oninput = debounce(() => { q = inp.value; isiDd(); }, 120);
    wadah.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { pilih.delete(b.dataset.x); onUbah && onUbah([...pilih]); gambar(); });
  };
  gambar();
  return { nilai: () => [...pilih], set(v) { pilih = new Set(v); gambar(); } };
}

export function salinTeks(t) { navigator.clipboard && navigator.clipboard.writeText(t).then(() => toast('Disalin.', 'ok')); }

/* ----------------------------- Pratinjau berkas Drive (lewat API) ----------------------------- */
import { api } from '../core/api.js';
import { modal, galat, ukuranTeks } from '../core/util.js';
export async function pratinjauBerkas(id, judul = 'Berkas') {
  const m = modal({ judul, ukuran: 'lg', isi: '<div class="sk" style="height:420px"></div>' });
  try {
    const f = await api('admin.berkas.lihat', { id, penuh: true });
    const bin = atob(f.dataUrl.split(',')[1]), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([u8], { type: f.mime }));
    m.el.querySelector('.modal-b').innerHTML = `<div class="row between mb-12"><span class="small muted">${esc(f.nama)} · ${ukuranTeks(f.ukuran)}</span><a class="btn sm ghost" href="${url}" download="${esc(f.nama)}">${ic('download', 'sm')} Unduh</a></div>
      ${f.mime === 'application/pdf' ? `<iframe src="${url}" title="${esc(f.nama)}" style="width:100%;height:65vh;border:1px solid var(--line);border-radius:12px"></iframe>` : `<img src="${url}" alt="${esc(f.nama)}" style="max-width:100%;border-radius:12px;margin:auto">`}`;
  } catch (e) { m.tutup(); galat(e); }
}
