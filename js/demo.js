/* =====================================================================
   demo.js — MODE DEMO: server tiruan di browser (aktif bila GAS_URL di
   js/config.js belum diisi, atau URL diberi ?demo). Bentuk respons sama
   dengan backend GAS sehingga seluruh UI bisa dicoba tanpa server.
   Data hanya di memori/localStorage perangkat ini — bukan data nyata.
   ===================================================================== */
import { ApiError, LS } from './core/api.js';

const tidur = ms => new Promise(r => setTimeout(r, ms));
function acak(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const TZ = 'Asia/Jakarta';
const tglJkt = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const jamJkt = (d = new Date()) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d).replace(/^24/, '00');
const tambah = (t, n) => { const d = new Date(t + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hariIso = t => { const d = new Date(t + 'T12:00:00Z').getUTCDay(); return d === 0 ? 7 : d; };
const menit = j => { const m = String(j || '').match(/^(\d+):(\d+)/); return m ? +m[1] * 60 + +m[2] : null; };
const jj = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const hav = (a, b, c, d) => { const R = 6371008.8, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

const UNIT = ['Tata Usaha', 'Keuangan', 'Akademik', 'Kepegawaian', 'Umum & Perlengkapan', 'Perpustakaan'];
const NAMA = [['Admin Kepegawaian', 'Kepegawaian', 'Analis SDM', 'ADMIN,PEGAWAI'], ['Siti Rahmawati', 'Keuangan', 'Bendahara Pengeluaran'], ['Budi Santoso', 'Tata Usaha', 'Analis Kepegawaian'],
  ['Hendra Gunawan', 'Tata Usaha', 'Pranata Komputer'], ['Dewi Anggraini', 'Akademik', 'Pengelola Akademik'], ['Ahmad Fauzi', 'Umum & Perlengkapan', 'Pengadministrasi'],
  ['Rian Pratama', 'Keuangan', 'Verifikator Anggaran'], ['Agus Prasetyo', 'Kepegawaian', 'Staf Kepegawaian'], ['Rina Marlina', 'Umum & Perlengkapan', 'Pengelola BMN'],
  ['Doni Kurniawan', 'Tata Usaha', 'Pengelola IT'], ['Nurul Hidayah', 'Perpustakaan', 'Pustakawan'], ['Bambang Wijaya', 'Kepegawaian', 'Arsiparis'],
  ['Ratna Sari', 'Akademik', 'Pengelola Data'], ['Dimas Wicaksono', 'Umum & Perlengkapan', 'Pengemudi'], ['Agus Setyawan', 'Akademik', 'Analis Akademik'],
  ['Siti Nurhaliza', 'Umum & Perlengkapan', 'Caraka'], ['Fajar Nugroho', 'Keuangan', 'Bendahara Penerimaan'], ['Lestari Wulandari', 'Perpustakaan', 'Pustakawan'],
  ['Yusuf Hidayat', 'Tata Usaha', 'Sekretaris'], ['Maya Kartika', 'Akademik', 'Pengelola Akademik'], ['Teguh Santoso', 'Keuangan', 'Analis Keuangan'],
  ['Indah Permata', 'Kepegawaian', 'Pengolah Data'], ['Rudi Hartono', 'Umum & Perlengkapan', 'Teknisi'], ['Wulan Sari', 'Perpustakaan', 'Pustakawan'],
  ['Eko Saputra', 'Tata Usaha', 'Pengadministrasi'], ['Putri Ayu', 'Keuangan', 'Staf Keuangan']];

let DB = null;
function bangun() {
  const r = acak(20261113);
  const hari = tglJkt();
  const pusat = LS.get('pp_demo_pos') || { lat: -7.050412, lng: 110.409123 };
  const pegawai = NAMA.map((n, i) => ({
    id: 'P' + String(i).padStart(2, '0'), nama: n[0], unit: n[1], jabatan: n[2], peran: n[3] || 'PEGAWAI', status_aktif: 'AKTIF',
    nip: '19' + (80 + Math.floor(r() * 18)) + String(1 + Math.floor(r() * 12)).padStart(2, '0') + String(1 + Math.floor(r() * 28)).padStart(2, '0') + '20' + (10 + Math.floor(r() * 10)) + '0' + (1 + Math.floor(r() * 2)) + '1' + String(i).padStart(3, '0'),
    email: n[0].toLowerCase().replace(/[^a-z]+/g, '.') + '@instansi.go.id', no_hp: '0812' + Math.floor(10000000 + r() * 89999999),
    kategori_lembur: ['Golongan IV', 'Golongan III', 'Golongan II', 'Non-PNS'][Math.floor(r() * 4)], id_jadwal: 'JDW-REGULER', id_lokasi_utama: i % 9 === 4 ? 'LOK-DIKLAT' : 'LOK-PUSAT',
    status_wajah: i === 13 ? 'BELUM' : 'TERDAFTAR', perangkat: i === 13 ? '' : ['Samsung Galaxy A54', 'Redmi Note 12', 'iPhone 13', 'OPPO A78', 'vivo Y36'][i % 5] + ' · Android · Chrome', perangkat_id: 'a1b2••••••' + i, tgl_bind: '2026-11-02'
  }));
  const lokasi = [
    { id: 'LOK-PUSAT', nama: 'Kantor Pusat Instansi', alamat: 'Jl. Contoh No. 1 (koordinat demo)', lat: pusat.lat, lng: pusat.lng, radius: 100, tz: TZ, aktif: true },
    { id: 'LOK-DIKLAT', nama: 'Kampus Balai Diklat', alamat: 'Jl. Raya Sekaran, Gunungpati, Semarang', lat: -7.050412, lng: 110.409123, radius: 150, tz: TZ, aktif: true },
    { id: 'LOK-SBY', nama: 'Kantor Wilayah II Surabaya', alamat: 'Jl. Pemuda No. 45, Surabaya', lat: -7.26541, lng: 112.75124, radius: 80, tz: TZ, aktif: false }];
  const jadwal = [{ id: 'JDW-REGULER', nama: 'Reguler Senin–Jumat', hari: [1, 2, 3, 4, 5], masuk: '07:30', pulang: '16:00', toleransi: 15, buka: '05:30', batasPulang: '23:59' },
    { id: 'JDW-6HARI', nama: 'Enam Hari Senin–Sabtu', hari: [1, 2, 3, 4, 5, 6], masuk: '07:30', pulang: '14:30', toleransi: 15, buka: '05:30', batasPulang: '23:59' }];
  const libur = [['2026-11-27', 'Contoh: HUT Instansi', 'instansi'], ['2026-12-24', 'Cuti Bersama Kelahiran Yesus Kristus', 'cuti bersama'], ['2026-12-25', 'Kelahiran Yesus Kristus', 'nasional'], ['2027-01-01', 'Tahun Baru 2027 Masehi', 'nasional'], ['2027-01-05', 'Isra Mikraj Nabi Muhammad SAW', 'nasional']].map(x => ({ tanggal: x[0], keterangan: x[1], jenis: x[2] }));
  const tarif = [{ kategori: 'Golongan IV', tarif: 30000, maks: 4, mulai: '2026-01-01' }, { kategori: 'Golongan III', tarif: 25000, maks: 4, mulai: '2026-01-01' }, { kategori: 'Golongan II', tarif: 22000, maks: 4, mulai: '2026-01-01' }, { kategori: 'Non-PNS', tarif: 20000, maks: 3, mulai: '2026-01-01' }];
  // Rekap bulan berjalan sampai kemarin
  const ym = hari.slice(0, 7), rekap = [];
  for (let t = ym + '-01'; t < hari; t = tambah(t, 1)) {
    const kerja = hariIso(t) <= 5 && !libur.find(l => l.tanggal === t);
    pegawai.forEach((p, i) => {
      if (!kerja) { rekap.push({ tanggal: t, id_pegawai: p.id, jenis_hari: 'LIBUR', status_hari: 'LIBUR' }); return; }
      const x = r();
      let st = 'HADIR', jm = 420 + Math.floor(r() * 28), jp = 960 + Math.floor(r() * 50);
      if (x > 0.9) { st = 'TERLAMBAT'; jm = 466 + Math.floor(r() * 40); } else if (x > 0.875) st = 'IZIN'; else if (x > 0.86) st = 'SAKIT'; else if (x > 0.85) st = 'DINAS'; else if (x > 0.845) st = 'ALPA';
      const ada = ['HADIR', 'TERLAMBAT', 'DINAS'].includes(st);
      const lembur = ada && r() > 0.86;
      if (lembur) jp = 960 + 90 + Math.floor(r() * 120);
      const kel = ada ? Math.max(0, jp - 960) : 0, dih = lembur ? Math.floor(Math.min(kel, 120) / 30) * 30 : 0;
      rekap.push({ tanggal: t, id_pegawai: p.id, jenis_hari: 'KERJA', status_hari: st, jam_masuk: ada ? jj(jm) : '', jam_pulang: ada ? jj(jp) : '', durasi_kerja_menit: ada ? jp - jm : 0,
        terlambat_menit: st === 'TERLAMBAT' ? jm - 450 : 0, pulang_cepat_menit: 0, kelebihan_menit: kel, lembur_dihitung_menit: dih, nominal_lembur: Math.round(dih / 60 * (tarif.find(z => z.kategori === p.kategori_lembur) || { tarif: 25000 }).tarif), lembur });
    });
  }
  // Presensi hari ini
  const kerjaIni = hariIso(hari) <= 5;
  const presensi = [];
  const now = menit(jamJkt());
  pegawai.forEach((p, i) => {
    if (!kerjaIni || i === 1 || i === 13 || i % 7 === 6) return; // Siti (P01) dibiarkan belum presensi untuk dicoba
    const jm = 410 + Math.floor(r() * (i % 5 === 0 ? 75 : 40));
    if (jm > now) return;
    const status = [3, 8, 14].includes(i) ? 'PERLU_DITINJAU' : 'VALID';
    const flag = i === 3 ? 'GPS_STATIS,SKOR_ABU' : i === 8 ? 'AKURASI_RENDAH' : i === 14 ? 'LOMPATAN_LOKASI' : '';
    presensi.push({ id: uuid(), id_pegawai: p.id, tanggal: hari, tipe: 'MASUK', jenis: [4, 12].includes(i) ? 'DINAS' : 'HARIAN', jam: jj(jm) + ':' + String(Math.floor(r() * 60)).padStart(2, '0'), status,
      jarak: Math.round(10 + r() * 70), akurasi: i === 8 ? 65 : Math.round(6 + r() * 14), skor: i === 3 ? 0.76 : +(0.84 + r() * 0.12).toFixed(3), flag, lokasi: [4, 12].includes(i) ? 'Aston Balikpapan' : 'Kantor Pusat Instansi', ditolak: i === 10 });
    if (i === 10) presensi.push({ id: uuid(), id_pegawai: p.id, tanggal: hari, tipe: 'MASUK', jenis: 'HARIAN', jam: jj(jm - 3) + ':10', status: 'DITOLAK', jarak: 1420, akurasi: 9, skor: 0.9, flag: 'DI_LUAR_RADIUS', lokasi: 'Kantor Pusat Instansi' });
  });
  const pengajuan = [
    ['P09', 'SAKIT', tambah(hari, -1), hari, 'Demam tinggi dan flu berat sesuai rujukan dokter RSUD, dianjurkan istirahat 2 hari.', 'MENUNGGU', 1],
    ['P10', 'CUTI', tambah(hari, 3), tambah(hari, 5), 'Cuti tahunan untuk acara keluarga di luar kota.', 'MENUNGGU', 0],
    ['P11', 'KOREKSI_PRESENSI', tambah(hari, -2), tambah(hari, -2), '[KOREKSI PULANG 16:05 HARIAN] Lupa presensi pulang karena gangguan jaringan di lobi.', 'MENUNGGU', 1],
    ['P12', 'IZIN', tambah(hari, 1), tambah(hari, 1), 'Urusan keluarga mendesak (pendampingan orang tua ke rumah sakit).', 'MENUNGGU', 1],
    ['P01', 'CUTI', tambah(hari, 7), tambah(hari, 9), 'Cuti tahunan.', 'DISETUJUI', 0],
    ['P01', 'KOREKSI_PRESENSI', tambah(hari, -3), tambah(hari, -3), '[KOREKSI MASUK 07:20 HARIAN] GPS bermasalah saat presensi pagi.', 'DITOLAK', 1],
    ['P05', 'SAKIT', tambah(hari, -6), tambah(hari, -5), 'Sakit gigi.', 'DISETUJUI', 1]
  ].map((x, i) => ({ id: 'PJ' + i, id_pegawai: x[0], jenis: x[1], mulai: x[2], selesai: x[3], alasan: x[4], status: x[5], bukti: x[6] ? ['demo-bukti-' + i] : [], diajukan: new Date(Date.now() - (i + 1) * 5400e3).toISOString(),
    diproses_oleh: x[5] !== 'MENUNGGU' ? 'admin.kepegawaian@instansi.go.id' : '', diproses_pada: x[5] !== 'MENUNGGU' ? new Date(Date.now() - 86400e3).toISOString() : '', catatan: x[5] === 'DITOLAK' ? 'GPS berada di luar toleransi titik kantor (850 m).' : x[5] === 'DISETUJUI' ? 'Dokumen valid.' : '' }));
  const lemburList = [['P03', hari, '16:00', '19:00', 'Pemeliharaan server aplikasi', 'MENUNGGU', 'PEGAWAI'], ['P06', hari, '16:00', '18:00', 'Rekonsiliasi kas', 'MENUNGGU', 'PEGAWAI'], ['P02', tambah(hari, -1), '16:00', '18:30', 'Penyusunan laporan bulanan', 'MENUNGGU', 'PEGAWAI']]
    .map((x, i) => ({ id: 'LB' + i, id_pegawai: x[0], tanggal: x[1], mulai: x[2], selesai: x[3], rencanaJam: (menit(x[3]) - menit(x[2])) / 60, uraian: x[4], status: x[5], sumber: x[6], durasi: null, diajukan: new Date().toISOString() }));
  rekap.filter(x => x.lembur).forEach((x, i) => lemburList.push({ id: 'LBS' + i, id_pegawai: x.id_pegawai, tanggal: x.tanggal, mulai: '16:00', selesai: '18:00', rencanaJam: 2, durasi: 2, uraian: 'Penyelesaian tugas mendesak', status: 'DISETUJUI', sumber: i % 2 ? 'PEGAWAI' : 'ADMIN', disetujui_oleh: 'admin.kepegawaian@instansi.go.id', file: i % 2 ? '' : 'demo-spl' }));
  const dinas = [
    { no_surat: 'ST/082/KEP/XI/2026', tujuan: 'Workshop SPBE Nasional', titik: [{ nama: 'Aston Balikpapan Grand Ballroom', lat: -1.2694, lng: 116.8312, radius: 100 }], tz: 'Asia/Makassar', mulai: tambah(hari, -1), selesai: tambah(hari, 1), peg: ['P04', 'P12'] },
    { no_surat: 'ST/079/KEP/XI/2026', tujuan: 'Audit Keuangan Kanwil Semarang', titik: [{ nama: 'Kanwil Jawa Tengah', lat: -6.9932, lng: 110.4203, radius: 150 }], tz: TZ, mulai: tambah(hari, -2), selesai: tambah(hari, 0), peg: ['P06'] },
    { no_surat: 'ST/085/KEP/XI/2026', tujuan: 'Rakor Kepegawaian DIY', titik: [{ nama: 'Hotel Tentrem Malioboro', lat: -7.7807, lng: 110.3672, radius: 100 }], tz: TZ, mulai: tambah(hari, 4), selesai: tambah(hari, 6), peg: ['P07', 'P11', 'P21'] },
    { no_surat: 'ST/071/KEP/X/2026', tujuan: 'Sosialisasi Regulasi Bandung', titik: [{ nama: 'Aula Balai Diklat Bandung', lat: -6.9175, lng: 107.6191, radius: 120 }], tz: TZ, mulai: tambah(hari, -20), selesai: tambah(hari, -18), peg: ['P15'] }];
  const audit = [];
  const aksi = [['SETUJUI', 'Pengajuan'], ['RESET_PERANGKAT', 'Pegawai'], ['UBAH_DATA', 'LokasiKantor'], ['TOLAK', 'Pengajuan'], ['UBAH_PENGATURAN', 'Pengaturan'], ['DAFTAR_WAJAH', 'Pegawai'], ['BUAT_SPL', 'Lembur'], ['BUAT_PENUGASAN', 'PenugasanDinas']];
  for (let i = 0; i < 48; i++) {
    const [a, e] = aksi[i % aksi.length];
    audit.push({ waktu: new Date(Date.now() - i * 3.7 * 3600e3).toISOString(), aktor: i % 11 === 10 ? 'SYSTEM' : 'admin.kepegawaian@instansi.go.id', aksi: a, entitas: e, id: e === 'Pegawai' ? pegawai[(i % 20) + 2].id : 'ID-' + (1000 + i),
      target: e === 'Pegawai' ? pegawai[(i % 20) + 2].nama : '', lama: a === 'UBAH_PENGATURAN' ? '{"nilai":"0.70"}' : a === 'UBAH_DATA' ? '{"radius_m":80}' : a === 'SETUJUI' || a === 'TOLAK' ? '{"status":"MENUNGGU","diproses_oleh":""}' : a === 'RESET_PERANGKAT' ? '{"device_id":"550e••••••000","device_info":"Galaxy A54"}' : '',
      baru: a === 'UBAH_PENGATURAN' ? '{"nilai":"0.80"}' : a === 'UBAH_DATA' ? '{"radius_m":100}' : a === 'SETUJUI' ? '{"status":"DISETUJUI","diproses_oleh":"admin.kepegawaian@instansi.go.id","catatan_admin":"Surat dokter valid"}' : a === 'TOLAK' ? '{"status":"DITOLAK","catatan_admin":"Bukti tidak sesuai"}' : a === 'RESET_PERANGKAT' ? '{"device_id":"","alasan":"Ganti HP"}' : '{"jumlah_sampel":5}', no: 14829 - i });
  }
  const pengaturan = [['NAMA_INSTANSI', 'Instansi Contoh (Demo)'], ['ALAMAT_INSTANSI', 'Jl. Contoh No. 1'], ['MOTIVASI', 'Disiplin hari ini, prestasi esok hari'], ['TOLERANSI_MENIT', '15'], ['BATAS_PRESENSI_MASUK', '12:00'],
    ['AKURASI_GPS_MAKS', '50'], ['AMBANG_WAJAH_VALID', '0.80'], ['AMBANG_WAJAH_ABU', '0.72'], ['MAKS_GAGAL_WAJAH', '3'], ['MAKS_PERCOBAAN', '5'], ['KECEPATAN_MAKS_KMJ', '300'],
    ['PEMBULATAN_LEMBUR_MENIT', '30'], ['BATAS_SUSULAN_HARI', '1'], ['SAKIT_MIN_HARI_SURAT', '1'], ['RETENSI_FOTO_VALID_HARI', '90'], ['RETENSI_FOTO_DITANDAI_HARI', '365'],
    ['WAJIB_LIVENESS_PASIF', 'false'], ['AMBANG_LIVENESS_PASIF', '0.50'], ['EMAIL_RINGKASAN_ADMIN', 'true'], ['EMAIL_REKAP_BULANAN', 'true']];
  return { hari, pegawai, lokasi, jadwal, libur, tarif, rekap, presensi, pengajuan, lembur: lemburList, dinas, audit, pengaturan: Object.fromEntries(pengaturan), permintaan: [{ id: 'RQ1', id_pegawai: 'P17', info: 'iPhone 15 · iOS · Safari', diminta: new Date(Date.now() - 3600e3).toISOString() }] };
}
const db = () => DB || (DB = bangun());
const P = id => db().pegawai.find(p => p.id === id) || {};
const info = id => { const p = P(id); return { id, nama: p.nama, nip: p.nip, unit: p.unit, jabatan: p.jabatan, perangkat: p.perangkat }; };
const saya = () => LS.get('pp_demo_peran') === 'admin' ? 'P00' : 'P01';

/** Geser titik kantor demo ke posisi perangkat agar uji presensi berhasil. */
export function demoGeser(sampel) {
  const s = sampel.slice().sort((a, b) => a.acc - b.acc)[0];
  const l = db().lokasi[0];
  if (hav(s.lat, s.lng, l.lat, l.lng) < l.radius) return false;
  l.lat = s.lat + 0.00025; l.lng = s.lng + 0.0002;
  LS.set('pp_demo_pos', { lat: l.lat, lng: l.lng });
  return true;
}

function statusLangsung(p) {
  const d = db(), list = d.presensi.filter(x => x.id_pegawai === p.id && x.status !== 'DITOLAK').sort((a, b) => a.jam < b.jam ? -1 : 1);
  const m = list.find(x => x.tipe === 'MASUK'), pl = list.filter(x => x.tipe === 'PULANG').pop();
  const iz = d.pengajuan.find(x => x.id_pegawai === p.id && x.status === 'DISETUJUI' && x.jenis !== 'KOREKSI_PRESENSI' && x.mulai <= d.hari && d.hari <= x.selesai);
  const dn = d.dinas.find(g => g.peg.includes(p.id) && g.mulai <= d.hari && d.hari <= g.selesai);
  const kerja = hariIso(d.hari) <= 5;
  let st, tel = 0;
  if (iz) st = iz.jenis; else if (dn) st = m ? 'DINAS' : 'DINAS_TANPA_PRESENSI';
  else if (m) { tel = menit(m.jam) - 450; st = tel > 15 && kerja ? 'TERLAMBAT' : (kerja ? 'HADIR' : 'LIBUR'); if (st !== 'TERLAMBAT') tel = 0; }
  else st = kerja ? 'BELUM_PRESENSI' : 'LIBUR';
  return { tanggal: d.hari, id_pegawai: p.id, status_hari: st, jenis_hari: kerja ? 'KERJA' : 'LIBUR', jam_masuk: m ? m.jam.slice(0, 5) : '', jam_pulang: pl ? pl.jam.slice(0, 5) : '', terlambat_menit: tel, masuk: m, pulang: pl, langsung: true };
}
function stat(rows) {
  const s = { hadir: 0, terlambat: 0, menitTerlambat: 0, dinas: 0, izin: 0, sakit: 0, cuti: 0, alpa: 0, hariKerja: 0, tepat: 0 };
  rows.forEach(r => {
    if (r.jenis_hari === 'KERJA') s.hariKerja++;
    if (['HADIR', 'TERLAMBAT', 'TIDAK_PRESENSI_PULANG'].includes(r.status_hari)) s.hadir++;
    if (r.terlambat_menit > 0) { s.terlambat++; s.menitTerlambat += r.terlambat_menit; } else if (r.status_hari === 'HADIR') s.tepat++;
    if (/^DINAS/.test(r.status_hari)) s.dinas++;
    if (r.status_hari === 'IZIN') s.izin++; if (r.status_hari === 'SAKIT') s.sakit++; if (r.status_hari === 'CUTI') s.cuti++; if (r.status_hari === 'ALPA') s.alpa++;
  });
  const w = s.hariKerja - s.izin - s.sakit - s.cuti;
  s.persen = w > 0 ? Math.min(100, Math.round((s.hadir + s.dinas) / w * 1000) / 10) : 100;
  return s;
}
const ringkas = x => ({ id: x.id, id_pegawai: x.id_pegawai, tanggal: x.tanggal, jam: x.jam, zona: 'WIB', tipe: x.tipe, jenis: x.jenis, status: x.status, jarak: x.jarak, akurasi: x.akurasi, skor: x.skor, lokasi: x.lokasi, kodeFlag: x.flag ? x.flag.split(',') : [], flags: x.flag ? x.flag.split(',').map(f => ({ GPS_STATIS: 'GPS statis', SKOR_ABU: 'Skor wajah area abu-abu', AKURASI_RENDAH: 'Akurasi GPS rendah', LOMPATAN_LOKASI: 'Lompatan lokasi', DI_LUAR_RADIUS: 'Di luar radius' }[f] || f)) : [], catatan: '' });
const fotoDemo = (warna) => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 320, 240); gr.addColorStop(0, '#1E3A8A'); gr.addColorStop(1, warna); g.fillStyle = gr; g.fillRect(0, 0, 320, 240); g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(160, 110, 52, 66, 0, 0, Math.PI * 2); g.fill(); g.fillRect(90, 180, 140, 60); g.fillStyle = '#fff'; g.font = '600 12px Inter, sans-serif'; g.fillText('FOTO DEMO', 120, 20); return c.toDataURL('image/jpeg', .7); };

function boot() {
  const d = db(), sp = saya(), p = P(sp), admin = sp === 'P00';
  const lok = d.lokasi.find(l => l.id === p.id_lokasi_utama);
  const live = statusLangsung(p);
  const izin = d.pengajuan.find(x => x.id_pegawai === sp && x.status === 'DISETUJUI' && x.jenis !== 'KOREKSI_PRESENSI' && x.mulai <= d.hari && d.hari <= x.selesai);
  const dn = d.dinas.filter(g => g.peg.includes(sp) && g.mulai <= d.hari && d.hari <= g.selesai);
  const list = d.presensi.filter(x => x.id_pegawai === sp).map(x => ({ id: x.id, tipe: x.tipe, jenis: x.jenis, jam: x.jam, status: x.status, jarak: x.jarak, skor: x.skor, flag: x.flag }));
  return {
    srv: Date.now(), versi: '1.0.0-demo', peran: { admin, pegawai: true }, instansi: d.pengaturan.NAMA_INSTANSI, motivasi: d.pengaturan.MOTIVASI,
    setting: { AKURASI_GPS_MAKS: d.pengaturan.AKURASI_GPS_MAKS, NAMA_INSTANSI: d.pengaturan.NAMA_INSTANSI },
    profil: { id: p.id, nama: p.nama, nip: p.nip, email: p.email, jabatan: p.jabatan, unit: p.unit, no_hp: p.no_hp, status_wajah: p.status_wajah },
    perangkat: { terdaftar: true, kosong: false, info: p.perangkat, tgl: p.tgl_bind, id: p.perangkat_id },
    hariIni: {
      tanggal: d.hari, tz: TZ, zona: 'WIB', jenisHari: { jenis: hariIso(d.hari) <= 5 ? 'KERJA' : 'LIBUR', ket: hariIso(d.hari) <= 5 ? '' : 'Akhir pekan' },
      jadwal: { ...d.jadwal[0], batasMasuk: d.pengaturan.BATAS_PRESENSI_MASUK }, lokasi: lok,
      dinas: dn.map(g => ({ id: 'T-' + g.no_surat, no_surat: g.no_surat, tujuan: g.tujuan, titik: g.titik, mulai: g.mulai, selesai: g.selesai, zona: g.tz === TZ ? 'WIB' : 'WITA', tz: g.tz, tanggal: d.hari, jam_masuk: '07:30', jam_pulang: '16:00', hariUjung: d.hari === g.mulai || d.hari === g.selesai, presensi: list.filter(x => x.jenis === 'DINAS') })),
      presensi: list.filter(x => x.jenis === 'HARIAN'), masuk: live.masuk || null, pulang: live.pulang || null, izin: izin ? { jenis: izin.jenis, mulai: izin.mulai, selesai: izin.selesai } : null
    },
    statBulan: stat(d.rekap.filter(r => r.id_pegawai === sp).concat(live.status_hari !== 'BELUM_PRESENSI' ? [live] : [])),
    badge: { pengajuan: d.pengajuan.filter(x => x.id_pegawai === sp && x.status === 'MENUNGGU').length },
    badgeAdmin: admin ? badgeAdmin() : undefined
  };
}
const badgeAdmin = () => { const d = db(); return { tinjauan: d.presensi.filter(x => x.status === 'PERLU_DITINJAU').length, pengajuan: d.pengajuan.filter(x => x.status === 'MENUNGGU').length, lembur: d.lembur.filter(x => x.status === 'MENUNGGU').length, perangkat: d.permintaan.length }; };

function dashboard(q) {
  const d = db(), peg = d.pegawai.filter(p => !q.unit || p.unit === q.unit);
  const live = peg.map(statusLangsung);
  const k = { total: peg.length, tepat: 0, terlambat: 0, dinas: 0, izin: 0, belum: 0, libur: 0 };
  live.forEach(s => { const t = s.status_hari; if (t === 'HADIR') k.tepat++; else if (t === 'TERLAMBAT') k.terlambat++; else if (/^DINAS/.test(t)) k.dinas++; else if (/^(IZIN|SAKIT|CUTI)$/.test(t)) k.izin++; else if (t === 'BELUM_PRESENSI') k.belum++; else k.libur++; });
  const kem = d.rekap.filter(r => r.tanggal === tambah(d.hari, -1) && peg.find(p => p.id === r.id_pegawai));
  const rk = d.rekap.filter(r => peg.find(p => p.id === r.id_pegawai)).concat(live.filter(s => s.status_hari !== 'BELUM_PRESENSI'));
  const tabelUnit = [...new Set(peg.map(p => p.unit))].sort().map(u => {
    const rows = rk.filter(r => P(r.id_pegawai).unit === u), s = stat(rows);
    const masuk = rows.map(r => menit(r.jam_masuk)).filter(x => x !== null && x > 0);
    return { unit: u, pegawai: peg.filter(p => p.unit === u).length, rataMasuk: masuk.length ? jj(Math.round(masuk.reduce((a, b) => a + b, 0) / masuk.length)) : '-', persen: s.persen, terlambat: s.terlambat,
      lembur: rows.reduce((a, r) => a + (r.lembur_dihitung_menit || 0), 0) / 60, tidakDihitung: rows.reduce((a, r) => a + (r.lembur_dihitung_menit ? 0 : r.kelebihan_menit || 0), 0) / 60,
      tren: Array.from({ length: 7 }, (_, i) => { const t = tambah(d.hari, i - 6), rr = rows.filter(r => r.tanggal === t && r.jenis_hari === 'KERJA'); return rr.length ? stat(rr).persen : null; }) };
  });
  const disiplin = peg.map(p => { const rows = rk.filter(r => r.id_pegawai === p.id), s = stat(rows), w = s.hariKerja - s.izin - s.sakit - s.cuti - s.dinas; return { id: p.id, nama: p.nama, unit: p.unit, skor: w > 0 ? Math.round(s.tepat / w * 1000) / 10 : 0, rata: '07:2' + (p.id.charCodeAt(2) % 10) }; }).sort((a, b) => b.skor - a.skor).slice(0, 5);
  const lemburUnit = {};
  d.lembur.filter(l => l.status === 'DISETUJUI').forEach(l => { const u = P(l.id_pegawai).unit; lemburUnit[u] = (lemburUnit[u] || 0) + l.durasi; });
  const tren30 = Array.from({ length: 30 }, (_, i) => { const t = tambah(d.hari, i - 29), rr = d.rekap.filter(r => r.tanggal === t && r.terlambat_menit > 0); return { tanggal: t, telat: rr.length, menit: rr.reduce((a, r) => a + r.terlambat_menit, 0) }; });
  return { periode: q.periode || d.hari.slice(0, 7), unit: q.unit || '', hariIni: d.hari, diperbarui: jamJkt(), kpi: k,
    kemarin: { tepat: kem.filter(r => r.status_hari === 'HADIR').length, terlambat: kem.filter(r => r.terlambat_menit > 0).length, dinas: kem.filter(r => r.status_hari === 'DINAS').length, izin: kem.filter(r => /^(IZIN|SAKIT|CUTI)$/.test(r.status_hari)).length },
    komposisi: { HADIR: k.tepat, TERLAMBAT: k.terlambat, DINAS: k.dinas, IZIN: k.izin, BELUM: k.belum }, tabelUnit, disiplin, lemburUnit, tren30, kepatuhan: stat(rk).persen,
    tinjauan: badgeAdmin().tinjauan, semuaUnit: UNIT.slice().sort(), units: UNIT };
}

function laporan(q) {
  const d = db(), dash = dashboard({});
  const lolos = id => { const p = P(id); return (!q.unit || p.unit === q.unit) && (!q.q || (p.nama + p.nip).toLowerCase().includes(String(q.q).toLowerCase())); };
  const kol = a => a.map(k => ({ k: k[0], label: k[1], tipe: k[2] || '' }));
  let out;
  if (q.jenis === 'bulanan') {
    out = { judul: 'Rekap Bulanan per Pegawai', kolom: kol([['nip', 'NIP'], ['nama', 'Nama'], ['unit', 'Unit'], ['hadir', 'Hadir', 'n'], ['terlambat', 'Terlambat (x)', 'n'], ['menitTerlambat', 'Total Terlambat (mnt)', 'n'], ['izin', 'Izin', 'n'], ['sakit', 'Sakit', 'n'], ['cuti', 'Cuti', 'n'], ['dinas', 'Dinas', 'n'], ['alpa', 'Alpa', 'n'], ['persen', '% Kehadiran', 'pct'], ['lemburJam', 'Lembur (jam)', 'n'], ['nominal', 'Nominal (Rp)', 'rp']]),
      baris: d.pegawai.filter(p => lolos(p.id)).map(p => { const rows = d.rekap.filter(r => r.id_pegawai === p.id), s = stat(rows); return { nip: p.nip, nama: p.nama, unit: p.unit, ...s, lemburJam: rows.reduce((a, r) => a + (r.lembur_dihitung_menit || 0), 0) / 60, nominal: rows.reduce((a, r) => a + (r.nominal_lembur || 0), 0) }; }), hariKerja: 21 };
  } else if (q.jenis === 'lembur') {
    out = { judul: 'Laporan Lembur & Nominal', kolom: kol([['tanggal', 'Tanggal', 'tgl'], ['nip', 'NIP'], ['nama', 'Nama'], ['unit', 'Unit'], ['disetujui', 'Disetujui (jam)', 'n'], ['kelebihan', 'Kelebihan (mnt)', 'n'], ['dihitung', 'Dihitung (mnt)', 'n'], ['nominal', 'Nominal (Rp)', 'rp'], ['ket', 'Keterangan']]),
      baris: d.rekap.filter(r => r.kelebihan_menit > 0 && lolos(r.id_pegawai)).map(r => ({ tanggal: r.tanggal, nip: P(r.id_pegawai).nip, nama: P(r.id_pegawai).nama, unit: P(r.id_pegawai).unit, disetujui: r.lembur ? 2 : '', kelebihan: r.kelebihan_menit, dihitung: r.lembur_dihitung_menit, nominal: r.nominal_lembur, ket: r.lembur ? 'Dihitung' : 'Tidak dihitung lembur' })) };
    out.ringkasan = { nominal: out.baris.reduce((a, r) => a + r.nominal, 0), jamDihitung: out.baris.reduce((a, r) => a + r.dihitung, 0) / 60 };
  } else if (q.jenis === 'dinas') {
    out = { judul: 'Laporan Perjalanan Dinas', kolom: kol([['no_surat', 'No. Surat'], ['tujuan', 'Tujuan'], ['mulai', 'Mulai', 'tgl'], ['selesai', 'Selesai', 'tgl'], ['nama', 'Nama'], ['unit', 'Unit'], ['status', 'Status']]),
      baris: d.dinas.flatMap(g => g.peg.filter(lolos).map(id => ({ no_surat: g.no_surat, tujuan: g.tujuan, mulai: g.mulai, selesai: g.selesai, nama: P(id).nama, unit: P(id).unit, status: g.selesai < d.hari ? 'SELESAI' : g.mulai > d.hari ? 'TERJADWAL' : 'AKTIF' }))) };
  } else if (q.jenis === 'pengajuan') {
    out = { judul: 'Laporan Pengajuan Izin/Sakit/Cuti/Koreksi', kolom: kol([['diajukan', 'Diajukan', 'dt'], ['nama', 'Nama'], ['unit', 'Unit'], ['jenis', 'Jenis'], ['mulai', 'Mulai', 'tgl'], ['selesai', 'Selesai', 'tgl'], ['alasan', 'Alasan'], ['status', 'Status', 'status']]),
      baris: d.pengajuan.filter(x => lolos(x.id_pegawai) && (!q.status || x.status === q.status)).map(x => ({ ...x, nama: P(x.id_pegawai).nama, unit: P(x.id_pegawai).unit, alasan: x.alasan.replace(/^\[[^\]]+\]\s*/, '') })) };
  } else if (q.jenis === 'bermasalah') {
    out = { judul: 'Laporan Presensi Bermasalah', kolom: kol([['tanggal', 'Tanggal', 'tgl'], ['jam', 'Jam'], ['nama', 'Nama'], ['unit', 'Unit'], ['tipe', 'Tipe'], ['status', 'Status', 'status'], ['flags', 'Tanda Risiko'], ['jarak', 'Jarak (m)', 'n'], ['skor', 'Skor', 'n']]),
      baris: d.presensi.filter(x => (x.status !== 'VALID' || x.flag) && lolos(x.id_pegawai)).map(x => ({ ...x, nama: P(x.id_pegawai).nama, unit: P(x.id_pegawai).unit, flags: ringkas(x).flags.join(', ') })) };
  } else {
    const live = d.pegawai.map(statusLangsung);
    out = { judul: 'Rekap Presensi Harian', kolom: kol([['tanggal', 'Tanggal', 'tgl'], ['nip', 'NIP'], ['nama', 'Nama'], ['unit', 'Unit'], ['status', 'Status', 'status'], ['masuk', 'Masuk'], ['pulang', 'Pulang'], ['terlambat', 'Terlambat (mnt)', 'n'], ['kelebihan', 'Kelebihan (mnt)', 'n'], ['lembur', 'Lembur (mnt)', 'n']]),
      baris: d.rekap.concat(live).filter(r => r.status_hari !== 'LIBUR' && lolos(r.id_pegawai) && (!q.status || r.status_hari === q.status)).map(r => ({ tanggal: r.tanggal, nip: P(r.id_pegawai).nip, nama: P(r.id_pegawai).nama, unit: P(r.id_pegawai).unit, status: r.status_hari, masuk: r.jam_masuk, pulang: r.jam_pulang, terlambat: r.terlambat_menit || 0, kelebihan: r.kelebihan_menit || 0, lembur: r.lembur_dihitung_menit || 0 })).sort((a, b) => a.tanggal < b.tanggal ? 1 : -1) };
  }
  return { ...out, jenis: q.jenis, instansi: d.pengaturan.NAMA_INSTANSI, dibuat: new Date().toLocaleString('id-ID'), grafik: q.grafik ? { tren30: dash.tren30, tabelUnit: dash.tabelUnit } : undefined };
}

const H = {
  'auth.config': () => ({ bridgeUrl: '', namaApp: 'Presensi Pegawai', instansi: db().pengaturan.NAMA_INSTANSI, versi: '1.0.0-demo' }),
  'auth.tukar': () => { const a = LS.get('pp_demo_peran') === 'admin', p = P(a ? 'P00' : 'P01'); return { token: 'demo', exp: Date.now() + 7 * 864e5, profil: { id: p.id, nama: p.nama, nip: p.nip, email: p.email, jabatan: p.jabatan, unit: p.unit, status_wajah: p.status_wajah }, peran: { admin: a, pegawai: true }, perangkat: { terdaftar: true } }; },
  'auth.darurat': () => { throw new ApiError({ code: 'LOGIN_GAGAL', msg: 'Akses darurat tidak tersedia di mode demo.' }); },
  'auth.keluar': () => ({ keluar: true }),
  boot,
  'presensi.mulai': d => {
    const b = boot();
    const sudah = (d.jenis === 'DINAS' ? (b.hariIni.dinas[0] || {}).presensi || [] : b.hariIni.presensi).find(x => x.tipe === 'MASUK' && x.status !== 'DITOLAK');
    if (d.tipe === 'MASUK' && sudah) throw new ApiError({ code: 'DI_LUAR_JENDELA', msg: 'Anda sudah presensi masuk pukul ' + sudah.jam.slice(0, 5) + '.' });
    const t = ['KEDIP', 'TENGOK_KIRI', 'TENGOK_KANAN', 'SENYUM'].sort(() => Math.random() - 0.5).slice(0, 2);
    LS.set('pp_demo_nonce', { n: 'demo-' + Date.now(), t, jenis: d.jenis, tipe: d.tipe });
    return { nonce: LS.get('pp_demo_nonce').n, tantangan: t, berlaku: 120, akurasiMaks: 50 };
  },
  'presensi.kirim': d => {
    const n = LS.get('pp_demo_nonce');
    if (!n || n.n !== d.nonce) throw new ApiError({ code: 'NONCE_TIDAK_VALID', msg: 'Sesi presensi kedaluwarsa.' });
    LS.del('pp_demo_nonce');
    const b = boot(), s = (d.gps || []).slice().sort((a, x) => a.acc - x.acc)[0];
    const tgt = n.jenis === 'DINAS' ? b.hariIni.dinas[0].titik[0] : b.hariIni.lokasi;
    const jarak = s ? Math.round(hav(s.lat, s.lng, tgt.lat, tgt.lng)) : 999999;
    const status = jarak > tgt.radius ? 'DITOLAK' : (s && s.acc > 50 ? 'PERLU_DITINJAU' : 'VALID');
    const jam = jamJkt(), skor = +(0.86 + Math.random() * 0.1).toFixed(3);
    db().presensi.push({ id: uuid(), id_pegawai: saya(), tanggal: db().hari, tipe: n.tipe, jenis: n.jenis, jam, status, jarak, akurasi: s ? Math.round(s.acc) : null, skor, flag: status === 'DITOLAK' ? 'DI_LUAR_RADIUS' : status === 'PERLU_DITINJAU' ? 'AKURASI_RENDAH' : '', lokasi: tgt.nama });
    return { id: uuid(), status, tipe: n.tipe, jenis: n.jenis, jam, tanggal: db().hari, zona: 'WIB', jarak, lokasi: tgt.nama, skor, flags: status === 'DITOLAK' ? ['Di luar radius'] : status === 'PERLU_DITINJAU' ? ['Akurasi GPS rendah'] : [], alasan: status === 'DITOLAK' ? `Di luar radius: ${jarak} m dari ${tgt.nama}` : '', sisaCoba: 3 };
  },
  'riwayat.bulan': d => {
    const db_ = db(), sp = saya(), ym = d.bulan || db_.hari.slice(0, 7);
    const akhir = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
    const live = statusLangsung(P(sp));
    const hari = Array.from({ length: akhir }, (_, i) => { const t = ym + '-' + String(i + 1).padStart(2, '0'); const r = db_.rekap.find(x => x.tanggal === t && x.id_pegawai === sp); if (t === db_.hari) return live; return r || { tanggal: t, status_hari: t > db_.hari ? '' : (hariIso(t) > 5 ? 'LIBUR' : ''), jenis_hari: hariIso(t) > 5 ? 'LIBUR' : 'KERJA', ket: hariIso(t) > 5 ? 'Akhir pekan' : '' }; });
    return { bulan: ym, hariIni: db_.hari, zona: 'WIB', hari, dinas: [], stat: stat(hari.filter(h => h.status_hari && h.status_hari !== 'BELUM_PRESENSI')), jadwal: db_.jadwal[0] };
  },
  'riwayat.hari': d => db().presensi.filter(x => x.id_pegawai === saya() && x.tanggal === d.tanggal).map(ringkas).concat(d.tanggal !== db().hari ? [{ tipe: 'MASUK', jam: '07:21:10', zona: 'WIB', lokasi: 'Kantor Pusat Instansi', jarak: 34, akurasi: 11, skor: 0.92, status: 'VALID', flags: [] }, { tipe: 'PULANG', jam: '16:04:33', zona: 'WIB', lokasi: 'Kantor Pusat Instansi', jarak: 28, akurasi: 9, skor: 0.9, status: 'VALID', flags: [] }] : []),
  'rekap.pribadi': d => ({ ...H['riwayat.bulan'](d), profil: P(saya()), instansi: db().pengaturan.NAMA_INSTANSI }),
  'pengajuan.list': () => ({ pengajuan: db().pengajuan.filter(x => x.id_pegawai === saya()).map(x => ({ ...x, hari: Math.round((new Date(x.selesai) - new Date(x.mulai)) / 864e5) + 1, koreksi: (x.alasan.match(/^\[KOREKSI (\w+) ([\d:]+) (\w+)\]/) || []).length ? { tipe: RegExp.$1, jam: RegExp.$2, jenis: RegExp.$3 } : null })), lembur: db().lembur.filter(x => x.id_pegawai === saya()), aturan: { sakitMinHari: 1 } }),
  'pengajuan.buat': d => { const x = { id: 'PJ' + Date.now(), id_pegawai: saya(), jenis: d.jenis, mulai: d.tgl_mulai, selesai: d.tgl_selesai || d.tgl_mulai, alasan: (d.koreksi ? `[KOREKSI ${d.koreksi.tipe} ${d.koreksi.jam} ${d.koreksi.jenis}] ` : '') + d.alasan, status: 'MENUNGGU', bukti: (d.berkas || []).map((_, i) => 'demo-' + i), diajukan: new Date().toISOString() }; db().pengajuan.unshift(x); return { ...x, hari: 1 }; },
  'pengajuan.batal': d => { const x = db().pengajuan.find(p => p.id === d.id); if (x) x.status = 'DIBATALKAN'; return { ok: true }; },
  'lembur.ajukan': d => { const x = { id: 'LB' + Date.now(), id_pegawai: saya(), tanggal: db().hari, mulai: d.jam_mulai, selesai: d.jam_selesai, rencanaJam: (menit(d.jam_selesai) - menit(d.jam_mulai)) / 60, durasi: null, uraian: d.uraian, status: 'MENUNGGU', sumber: 'PEGAWAI', diajukan: new Date().toISOString() }; db().lembur.unshift(x); return x; },
  'wajah.daftarMandiri': () => { P(saya()).status_wajah = 'TERDAFTAR'; return { ok: true }; },
  'admin.badge': badgeAdmin,
  'admin.dashboard': dashboard,
  'admin.presensi.hariIni': q => {
    const d = db(), list = d.pegawai.map(p => { const s = statusLangsung(p), all = d.presensi.filter(x => x.id_pegawai === p.id); const m = all.find(x => x.tipe === 'MASUK' && x.status !== 'DITOLAK'); return { id: p.id, nama: p.nama, nip: p.nip, unit: p.unit, jabatan: p.jabatan, jenis: m ? m.jenis : (/^DINAS/.test(s.status_hari) ? 'DINAS' : 'HARIAN'), status: s.status_hari, terlambat: s.terlambat_menit, masuk: m ? ringkas(m) : null, pulang: s.pulang ? ringkas(s.pulang) : null, percobaan: all.length, ditolak: all.filter(x => x.status === 'DITOLAK').length }; });
    return { tanggal: q.tanggal || d.hari, list, hitung: { masuk: list.filter(x => x.masuk).length, pulang: list.filter(x => x.pulang).length, ditinjau: d.presensi.filter(x => x.status === 'PERLU_DITINJAU').length, ditolak: d.presensi.filter(x => x.status === 'DITOLAK').length }, diperbarui: jamJkt() };
  },
  'admin.presensi.detail': q => {
    const d = db(), x = d.presensi.find(z => z.id === q.id) || d.presensi[0], lok = d.lokasi[0];
    const statis = x.flag.includes('GPS_STATIS');
    const sampel = Array.from({ length: 5 }, (_, i) => [+(lok.lat + 0.0002 + (statis ? 0 : Math.sin(i) * 0.00004)).toFixed(6), +(lok.lng + 0.0001 + (statis ? 0 : Math.cos(i) * 0.00004)).toFixed(6), x.akurasi || 12, i * 2]);
    return { ...ringkas(x), pegawai: info(x.id_pegawai), lat: sampel[0][0], lng: sampel[0][1], sampel, sdMeter: statis ? 0 : 3.4, liveness: { u: ['KEDIP', 'TENGOK_KIRI'], l: true, p: null, d: 5200 }, perangkatCocok: true, target: [{ nama: lok.nama, lat: lok.lat, lng: lok.lng, radius: lok.radius }],
      foto: fotoDemo('#7C3AED'), fotoRef: fotoDemo('#16A34A'), fotoRefInfo: { tanggal: tambah(d.hari, -1), jam: '07:22', skor: 0.93 },
      riwayat7: Array.from({ length: 7 }, (_, i) => { const t = tambah(x.tanggal, i - 6), r = d.rekap.find(z => z.tanggal === t && z.id_pegawai === x.id_pegawai); return { tanggal: t, status: t === x.tanggal ? x.status : r ? r.status_hari : '', jam: t === x.tanggal ? x.jam.slice(0, 5) : r ? r.jam_masuk : '' }; }),
      kepatuhanBulan: 94.2, ambang: { valid: 0.8, abu: 0.72, akurasi: 50 }, id_pegawai: x.id_pegawai };
  },
  'admin.tinjauan.list': () => ({ list: db().presensi.filter(x => x.status === 'PERLU_DITINJAU').map(x => ({ ...ringkas(x), pegawai: info(x.id_pegawai) })), idSaya: 'P00' }),
  'admin.tinjauan.putus': q => { const x = db().presensi.find(z => z.id === q.id); x.status = q.keputusan; return { ok: true, status: q.keputusan }; },
  'admin.pegawai.list': () => { const d = db(); return { list: d.pegawai.map(p => ({ ...p })), permintaan: d.permintaan.map(r => ({ ...r, nama: P(r.id_pegawai).nama, nip: P(r.id_pegawai).nip, unit: P(r.id_pegawai).unit, lama: P(r.id_pegawai).perangkat })), idSaya: 'P00', ref: { unit: UNIT.slice().sort(), kategori: d.tarif.map(t => t.kategori), lokasi: d.lokasi, jadwal: d.jadwal } }; },
  'admin.pegawai.simpan': q => { const d = db(); if (q.id) Object.assign(P(q.id), q); else d.pegawai.push({ ...q, id: 'P' + d.pegawai.length, status_wajah: 'BELUM', perangkat: '' }); return { ok: true, id: q.id || 'P' + (d.pegawai.length - 1) }; },
  'admin.pegawai.status': q => { P(q.id).status_aktif = q.status; return { ok: true }; },
  'admin.pegawai.impor': q => ({ tambah: q.baris.length, ubah: 0, lewati: 0, galat: [], dryRun: q.dryRun !== false }),
  'admin.migrasi.pindai': () => ({ tambah: 12, ubah: 3, lewati: 1, galat: [], kolomTerbaca: ['nip', 'nama', 'email', 'unit'], dryRun: true }),
  'admin.migrasi.impor': () => ({ tambah: 12, ubah: 3, lewati: 1, galat: [], kolomTerbaca: ['nip', 'nama', 'email', 'unit'], dryRun: false }),
  'admin.perangkat.reset': q => { P(q.id_pegawai).perangkat = ''; return { ok: true }; },
  'admin.perangkat.putus': q => { db().permintaan = db().permintaan.filter(r => r.id !== q.id); return { ok: true }; },
  'admin.wajah.daftar': q => { P(q.id_pegawai).status_wajah = 'TERDAFTAR'; return { ok: true, jumlah: q.vektor.length }; },
  'admin.wajah.hapus': q => { P(q.id_pegawai).status_wajah = 'BELUM'; return { ok: true }; },
  'admin.wajah.kode': q => ({ kode: 'K7M2QX', berlakuMenit: 15, nama: P(q.id_pegawai).nama }),
  'admin.dinas.list': () => { const d = db(); const list = d.dinas.map(g => ({ kunci: g.no_surat, no_surat: g.no_surat, tujuan: g.tujuan, titik: g.titik, zona: g.tz === TZ ? 'WIB' : 'WITA', mulai: g.mulai, selesai: g.selesai, status: g.dibatalkan ? 'DIBATALKAN' : g.selesai < d.hari ? 'SELESAI' : g.mulai > d.hari ? 'TERJADWAL' : 'AKTIF', file: 'demo-st', pegawai: g.peg.map(id => ({ id, nama: P(id).nama, nip: P(id).nip, unit: P(id).unit })), bukti: g.mulai < d.hari ? { hari: 2, ada: 2, persen: 100 } : null })); const h = { AKTIF: 0, TERJADWAL: 0, SELESAI: 0, DIBATALKAN: 0, SEMUA: list.length }; list.forEach(g => h[g.status]++); return { hitung: h, list, titikAktif: list.filter(g => g.status === 'AKTIF').reduce((a, g) => a + g.titik.length, 0) }; },
  'admin.dinas.simpan': q => { db().dinas.unshift({ no_surat: q.no_surat, tujuan: q.tujuan, titik: q.titik, tz: q.zona_waktu, mulai: q.tgl_mulai, selesai: q.tgl_selesai, peg: q.pegawai }); return { ok: true, jumlah: q.pegawai.length }; },
  'admin.dinas.batal': q => { const g = db().dinas.find(x => x.no_surat === q.kunci); if (g) g.dibatalkan = true; return { ok: true }; },
  'admin.pengajuan.list': q => { const d = db(); const all = d.pengajuan.map(x => ({ ...x, pegawai: info(x.id_pegawai), hari: Math.round((new Date(x.selesai) - new Date(x.mulai)) / 864e5) + 1, koreksi: /^\[KOREKSI (\w+) ([\d:]+) (\w+)\]/.test(x.alasan) ? { tipe: RegExp.$1, jam: RegExp.$2, jenis: RegExp.$3 } : null })); const h = { MENUNGGU: 0, DISETUJUI: 0, DITOLAK: 0, SEMUA: all.length }; all.forEach(x => { if (h[x.status] !== undefined) h[x.status]++; }); return { hitung: h, list: all.filter(x => (q.status === 'SEMUA' || x.status === (q.status || 'MENUNGGU')) && (!q.jenis || x.jenis === q.jenis) && (!q.q || (x.pegawai.nama + x.alasan).toLowerCase().includes(q.q.toLowerCase()))), idSaya: 'P00' }; },
  'admin.pengajuan.putus': q => { const x = db().pengajuan.find(p => p.id === q.id); x.status = q.keputusan; x.catatan = q.catatan; x.diproses_oleh = 'admin.kepegawaian@instansi.go.id'; x.diproses_pada = new Date().toISOString(); return { ok: true, status: q.keputusan }; },
  'admin.lembur.list': q => {
    const d = db(), lol = id => (!q.unit || P(id).unit === q.unit) && (!q.q || P(id).nama.toLowerCase().includes(String(q.q).toLowerCase()));
    const menunggu = d.lembur.filter(x => x.status === 'MENUNGGU' && lol(x.id_pegawai)).map(x => ({ ...x, pegawai: info(x.id_pegawai), batas: tambah(x.tanggal, 1) }));
    const disetujui = d.lembur.filter(x => x.status === 'DISETUJUI' && lol(x.id_pegawai)).map(x => ({ ...x, pegawai: info(x.id_pegawai) }));
    const realisasi = d.rekap.filter(r => r.kelebihan_menit > 0 && lol(r.id_pegawai)).map(r => ({ tanggal: r.tanggal, id_pegawai: r.id_pegawai, pegawai: info(r.id_pegawai), disetujui: r.lembur ? 2 : null, kelebihan: r.kelebihan_menit, dihitung: r.lembur_dihitung_menit, nominal: r.nominal_lembur, sumber: r.lembur ? 'ADMIN' : 'MANDIRI' })).sort((a, b) => a.tanggal < b.tanggal ? 1 : -1);
    return { bulan: q.bulan, kpi: { jamDisetujui: disetujui.reduce((a, x) => a + x.durasi, 0), jamDihitung: realisasi.reduce((a, x) => a + x.dihitung, 0) / 60, jamTidakDihitung: realisasi.filter(x => x.disetujui === null).reduce((a, x) => a + x.kelebihan, 0) / 60, nominal: realisasi.reduce((a, x) => a + x.nominal, 0), pegawaiSPL: new Set(disetujui.map(x => x.id_pegawai)).size }, menunggu, disetujui, realisasi, pembulatan: 30, idSaya: 'P00' };
  },
  'admin.lembur.putus': q => { const x = db().lembur.find(l => l.id === q.id); x.status = q.keputusan; x.durasi = q.keputusan === 'DISETUJUI' ? +q.durasi_jam : null; x.disetujui_oleh = 'admin.kepegawaian@instansi.go.id'; return { ok: true }; },
  'admin.lembur.spl': q => { q.pegawai.forEach(id => db().lembur.unshift({ id: 'LBS' + Date.now() + id, id_pegawai: id, tanggal: q.tanggal, mulai: q.jam_mulai, selesai: q.jam_selesai, rencanaJam: 2, durasi: +q.durasi_jam || (menit(q.jam_selesai) - menit(q.jam_mulai)) / 60, uraian: q.uraian, status: 'DISETUJUI', sumber: 'ADMIN', disetujui_oleh: 'admin.kepegawaian@instansi.go.id' })); return { ok: true, jumlah: q.pegawai.length }; },
  'admin.berkas.lihat': q => ({ id: q.id, nama: 'contoh-bukti.jpg', mime: 'image/jpeg', ukuran: 42000, dataUrl: fotoDemo('#0891B2') }),
  'admin.ref.list': () => { const d = db(), j = {}; d.pegawai.forEach(p => { j[p.id_lokasi_utama] = (j[p.id_lokasi_utama] || 0) + 1; }); return { unit: UNIT.slice().sort(), kategori: d.tarif.map(t => t.kategori), lokasi: d.lokasi, jadwal: d.jadwal, libur: d.libur, tarif: d.tarif, jumlahPegawaiLokasi: j }; },
  'admin.lokasi.simpan': q => { const d = db(); const l = { id: q.id_lokasi || 'LOK-' + Date.now(), nama: q.nama, alamat: q.alamat, lat: +q.lat, lng: +q.lng, radius: +q.radius_m, tz: q.zona_waktu, aktif: q.aktif }; const i = d.lokasi.findIndex(x => x.id === l.id); if (i > -1) d.lokasi[i] = l; else d.lokasi.push(l); return { ok: true, id: l.id }; },
  'admin.jadwal.simpan': q => { const d = db(); const j = { id: q.id_jadwal || 'JDW-' + Date.now(), nama: q.nama, hari: q.hari_kerja, masuk: q.jam_masuk, pulang: q.jam_pulang, toleransi: +q.toleransi_menit, buka: q.buka_presensi_masuk, batasPulang: q.batas_presensi_pulang }; const i = d.jadwal.findIndex(x => x.id === j.id); if (i > -1) d.jadwal[i] = j; else d.jadwal.push(j); return { ok: true, id: j.id }; },
  'admin.libur.simpan': q => { const d = db(); d.libur = d.libur.filter(x => x.tanggal !== q.tanggal).concat([q]).sort((a, b) => a.tanggal < b.tanggal ? -1 : 1); return { ok: true }; },
  'admin.libur.hapus': q => { db().libur = db().libur.filter(x => x.tanggal !== q.tanggal); return { ok: true }; },
  'admin.tarif.simpan': q => { const d = db(); d.tarif = d.tarif.filter(t => !(q.lama && t.kategori === q.lama.kategori && t.mulai === q.lama.mulai)).concat([{ kategori: q.kategori, tarif: +q.tarif_per_jam, maks: +q.maks_jam_per_hari, mulai: q.berlaku_mulai }]); return { ok: true }; },
  'admin.tarif.hapus': q => { db().tarif = db().tarif.filter(t => !(t.kategori === q.kategori && t.mulai === q.mulai)); return { ok: true }; },
  'admin.pengaturan.get': () => { const s = db().pengaturan; const V = { teks: ['NAMA_INSTANSI', 'ALAMAT_INSTANSI', 'MOTIVASI'], jam: ['BATAS_PRESENSI_MASUK'], bool: ['WAJIB_LIVENESS_PASIF', 'EMAIL_RINGKASAN_ADMIN', 'EMAIL_REKAP_BULANAN'] };
    const vd = k => V.teks.includes(k) ? { tipe: 'teks', maks: 200 } : V.jam.includes(k) ? { tipe: 'jam' } : V.bool.includes(k) ? { tipe: 'bool' } : /AMBANG/.test(k) ? { tipe: 'angka', min: 0.2, maks: 0.99 } : { tipe: 'angka', min: 0, maks: 3650 };
    return { list: Object.entries(s).map(([k, v]) => ({ kunci: k, nilai: v, keterangan: '', validator: vd(k) })), sistem: { versi: '1.0.0-demo', modeAkses: 'WHITELIST', domainIzin: 'instansi.go.id', adminEmails: ['admin.kepegawaian@instansi.go.id'], bridgeUrl: '', frontendUrls: '', rahasia: { SESSION_SECRET: true, BRIDGE_SECRET: true, BIO_AES_KEY: true, BIO_MAC_KEY: true, EMERGENCY_PASS_HASH: true }, sesiHari: 7, versiModelWajah: 'faceapi-resnet128-v1' } }; },
  'admin.pengaturan.simpan': q => { Object.assign(db().pengaturan, q.nilai); return { ok: true, berubah: Object.keys(q.nilai).length }; },
  'admin.laporan': laporan,
  'admin.laporan.pdfResmi': () => { throw new ApiError({ code: 'DEMO', msg: 'PDF resmi berkop dibuat oleh server Apps Script (tidak tersedia di mode demo). Gunakan "Unduh PDF".' }); },
  'admin.rekap.hitung': q => ({ baris: 25, dari: q.dari, sampai: q.sampai }),
  'admin.audit.list': q => {
    const d = db(), f = d.audit.filter(r => (!q.q || JSON.stringify(r).toLowerCase().includes(q.q.toLowerCase())) && (!q.aksi || r.aksi === q.aksi) && (!q.aktor || r.aktor === q.aktor) && (!q.entitas || r.entitas === q.entitas));
    const per = q.per || 20, hal = q.halaman || 1;
    return { total: 14829, cocok: f.length, halaman: hal, per, list: f.slice((hal - 1) * per, hal * per), opsi: { aktor: [...new Set(d.audit.map(r => r.aktor))], aksi: [...new Set(d.audit.map(r => r.aksi))], entitas: [...new Set(d.audit.map(r => r.entitas))] }, catatan: '' };
  },
  'admin.notif.proses': () => ({ terkirim: 0 }),
  batch: q => q.calls.map(c => { try { return { ok: true, data: H[c.a](c.d || {}) }; } catch (e) { return { ok: false, code: e.code, msg: e.msg }; } })
};

export async function demoApi(a, d) {
  await tidur(a.startsWith('admin.') ? 160 : 120);
  const fn = H[a];
  if (!fn) throw new ApiError({ code: 'AKSI_TIDAK_DIKENAL', msg: 'Aksi demo tidak tersedia: ' + a });
  return JSON.parse(JSON.stringify(fn(d || {})));
}
