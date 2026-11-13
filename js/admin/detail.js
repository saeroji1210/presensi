/* =====================================================================
   admin/detail.js — Peta audit GPS (titik acuan + radius + sampel) dan
   potongan tampilan detail presensi yang dipakai halaman Presensi & Tinjauan.
   ===================================================================== */
import { esc, ic, desimal, jarakTeks } from '../core/util.js';
import { peta, ikonTitik } from './ui.js';

export async function petaAudit(el, x) {
  if (!el) return;
  const pusat = x.lat !== null && x.lat !== undefined ? [x.lat, x.lng] : x.target[0] ? [x.target[0].lat, x.target[0].lng] : [-6.2, 106.8];
  let r;
  try { r = await peta(el, { lat: pusat[0], lng: pusat[1], zoom: 17 }); } catch { el.innerHTML = '<div class="empty small">Peta gagal dimuat.</div>'; return; }
  if (!r) return;
  const { L, m } = r;
  const batas = [];
  (x.target || []).forEach(t => {
    L.circle([t.lat, t.lng], { radius: t.radius, color: '#2563EB', weight: 2, fillOpacity: 0.08 }).addTo(m).bindTooltip(`${t.nama} · radius ${t.radius} m`);
    L.marker([t.lat, t.lng], { icon: ikonTitik(L, '#2563EB') }).addTo(m);
    batas.push([t.lat, t.lng]);
  });
  (x.sampel || []).forEach((s, i) => { L.circleMarker([s[0], s[1]], { radius: 4, color: '#D97706', weight: 1, fillOpacity: 0.8 }).addTo(m).bindTooltip(`Sampel ${i + 1} · ±${s[2]} m`); batas.push([s[0], s[1]]); });
  if (x.lat !== null && x.lat !== undefined) {
    L.marker([x.lat, x.lng], { icon: ikonTitik(L, x.status === 'DITOLAK' ? '#DC2626' : x.status === 'VALID' ? '#16A34A' : '#D97706') }).addTo(m)
      .bindTooltip(`Titik presensi · ${jarakTeks(x.jarak)} dari acuan`, { permanent: false });
    if (x.akurasi) L.circle([x.lat, x.lng], { radius: x.akurasi, color: '#D97706', weight: 1, dashArray: '4 4', fillOpacity: 0.05 }).addTo(m);
    batas.push([x.lat, x.lng]);
  }
  if (batas.length > 1) m.fitBounds(batas, { padding: [30, 30], maxZoom: 18 });
}

export function tabelSampel(x) {
  if (!x.sampel || !x.sampel.length) return '<div class="muted small">Tidak ada sampel GPS (mis. presensi hasil koreksi).</div>';
  return `<div class="tbl-wrap" style="max-height:220px"><table class="tbl" style="font-size:12px"><thead><tr><th>#</th><th>Detik</th><th>Lintang, bujur</th><th class="num">Akurasi</th></tr></thead><tbody>
    ${x.sampel.map((s, i) => `<tr style="height:auto"><td style="height:auto;padding:6px 10px">${i + 1}</td><td style="height:auto;padding:6px 10px">+${desimal(s[3], 1)}</td><td style="height:auto;padding:6px 10px;font-family:ui-monospace,monospace">${s[0].toFixed(6)}, ${s[1].toFixed(6)}</td><td class="num" style="height:auto;padding:6px 10px">±${s[2]} m</td></tr>`).join('')}</tbody></table></div>
    <div class="row between small mt-8"><span class="muted">Simpangan baku: <b>${x.sdMeter !== undefined ? desimal(x.sdMeter, 2) + ' m' : '–'}</b>${x.sdMeter === 0 ? ' <span class="badge b-wait">identik</span>' : ''}</span><span class="muted">${x.sampel.length} sampel</span></div>`;
}

const PENJELASAN = {
  GPS_STATIS: ['location_disabled', 'Indikasi GPS palsu / statis', 'Beberapa sampel GPS berurutan identik persis (6 desimal & akurasi sama) tanpa fluktuasi alami satelit.'],
  POLA_BERULANG: ['repeat', 'Koordinat berulang', 'Koordinat sama persis sampai 6 desimal dengan presensi di hari lain — pola khas lokasi tiruan.'],
  LOMPATAN_LOKASI: ['speed', 'Perpindahan mustahil', 'Kecepatan tersirat dari presensi sebelumnya melebihi batas tanpa penugasan dinas.'],
  AKURASI_RENDAH: ['gps_not_fixed', 'Akurasi GPS rendah', 'Akurasi terbaik melebihi ambang. Bisa karena di dalam gedung atau sinyal lemah.'],
  SKOR_ABU: ['face', 'Skor wajah area abu-abu', 'Kemiripan wajah berada di antara ambang tolak dan ambang valid. Bandingkan foto presensi dengan referensi.'],
  PERANGKAT_GANDA: ['devices', 'Perangkat dipakai >1 pegawai', 'ID perangkat ini juga terikat pada pegawai lain — indikasi titip presensi.'],
  LIVENESS_PASIF_RENDAH: ['no_photography', 'Uji kehidupan pasif rendah', 'Model anti-pemalsuan menilai gambar mirip foto cetak/layar.'],
  LIVENESS_PASIF_TIDAK_ADA: ['help', 'Uji kehidupan pasif tidak tersedia', 'Perangkat tidak mengirim skor uji kehidupan pasif.']
};
export function kartuFlag(kode) {
  return (kode || []).filter(k => PENJELASAN[k]).map(k => {
    const p = PENJELASAN[k];
    return `<div class="note warn" style="margin-top:8px">${ic(p[0])}<div><b>${esc(p[1])}</b><br>${esc(p[2])}</div></div>`;
  }).join('');
}
