/* =====================================================================
   KONFIGURASI FRONTEND — satu-satunya berkas yang perlu Anda ubah.
   Hanya berisi URL publik (bukan rahasia). Semua rahasia ada di
   Script Properties proyek Apps Script (lihat docs/PANDUAN-DEPLOY.md).
   ===================================================================== */
window.APP_CONFIG = {
  // URL Web App API (Deploy → Web app → URL yang berakhiran /exec)
  // Biarkan berisi XXXX untuk mencoba MODE DEMO (data contoh, tanpa server).
  GAS_URL: 'https://script.google.com/macros/s/AKfycbzPtQyMwnOUOjeBaR2b1r7igNIFzaAc6RyHS-ofgNlt_qn13hA0QbuZMNVwQ24bCxoo/exec',

  // Opsional: nama instansi untuk layar login sebelum terhubung ke server
  NAMA_INSTANSI: 'Nama Instansi',

  // Opsional: folder model face-api yang di-host sendiri (mis. 'models/faceapi/').
  // Kosongkan untuk memakai CDN jsDelivr.
  FACE_MODEL_URL: '',

  // Opsional: model ONNX MiniFASNetV2 untuk uji kehidupan pasif (lihat docs/MODEL-WAJAH.md).
  // Contoh: 'models/minifasnet_v2.onnx'. Kosongkan bila belum tersedia.
  PASIF_MODEL: ''
};
