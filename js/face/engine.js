/* =====================================================================
   face/engine.js — Mesin wajah di browser (PRD 5.5)
   - MediaPipe Face Landmarker: deteksi wajah + uji kehidupan aktif
     (kedip, tengok kiri/kanan, senyum) lewat blendshape & landmark
   - face-api (vladmandic, ResNet-34 → vektor 128-D): vektor wajah yang
     dicocokkan di SERVER dengan kemiripan kosinus
   - Opsional: MiniFASNetV2 (ONNX Runtime Web) untuk uji kehidupan pasif,
     aktif bila APP_CONFIG.PASIF_MODEL diisi (lihat docs/MODEL-WAJAH.md)
   Model diunduh sekali lalu disimpan di cache perangkat oleh service worker.
   ===================================================================== */
import { muatSkrip } from '../core/util.js';

const CFG = window.APP_CONFIG || {};
const MP_VER = '0.10.3';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}`;
const MP_MODEL = CFG.MP_MODEL_URL || 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const FA_SCRIPT = ['https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js', 'https://cdn.jsdelivr.net/gh/vladmandic/face-api@1.7.12/dist/face-api.js'];
const FA_MODEL = [CFG.FACE_MODEL_URL, 'https://cdn.jsdelivr.net/gh/vladmandic/face-api@1.7.12/model/', 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/'].filter(Boolean);
const ORT = ['https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/ort.min.js'];
export const VERSI_MODEL = 'faceapi-resnet128-v1';

let mesin = null;

async function muatMediapipe() {
  let V = null, err;
  for (const f of ['/vision_bundle.mjs', '/vision_bundle.js', '']) {
    try {
      const mod = await import(/* @vite-ignore */ MP_BASE + f);
      V = mod.FaceLandmarker ? mod : (mod.default && mod.default.FaceLandmarker ? mod.default : null);
      if (V) break;
    } catch (e) { err = e; }
  }
  if (!V) throw err || new Error('MediaPipe tidak termuat');
  const files = await V.FilesetResolver.forVisionTasks(MP_BASE + '/wasm');
  const opsi = delegate => ({
    baseOptions: { modelAssetPath: MP_MODEL, delegate }, runningMode: 'VIDEO', numFaces: 2,
    outputFaceBlendshapes: true, minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5
  });
  try { return await V.FaceLandmarker.createFromOptions(files, opsi('GPU')); }
  catch { return await V.FaceLandmarker.createFromOptions(files, opsi('CPU')); }
}

async function muatFaceApi() {
  const faceapi = await muatSkrip(FA_SCRIPT, 'faceapi');
  try { await faceapi.tf.setBackend('webgl'); } catch { /* fallback otomatis */ }
  await faceapi.tf.ready();
  let err;
  for (const u of FA_MODEL) {
    try {
      if (!faceapi.nets.tinyFaceDetector.isLoaded) await faceapi.nets.tinyFaceDetector.loadFromUri(u);
      if (!faceapi.nets.faceLandmark68Net.isLoaded) await faceapi.nets.faceLandmark68Net.loadFromUri(u);
      if (!faceapi.nets.faceRecognitionNet.isLoaded) await faceapi.nets.faceRecognitionNet.loadFromUri(u);
      return faceapi;
    } catch (e) { err = e; }
  }
  throw err || new Error('Model face-api tidak termuat');
}

async function muatPasif() {
  if (!CFG.PASIF_MODEL) return null;
  try {
    const ort = await muatSkrip(ORT, 'ort');
    return await ort.InferenceSession.create(CFG.PASIF_MODEL, { executionProviders: ['wasm'] });
  } catch (e) { console.warn('Model uji kehidupan pasif tidak dimuat:', e); return null; }
}

/** Analisis hasil MediaPipe → besaran yang dipakai tantangan. Koordinat = bingkai video asli (tidak dicerminkan). */
export function analisa(res) {
  const n = res && res.faceLandmarks ? res.faceLandmarks.length : 0;
  if (!n) return { wajah: 0 };
  const lm = res.faceLandmarks[0];
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of lm) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  const bs = {};
  ((res.faceBlendshapes && res.faceBlendshapes[0] && res.faceBlendshapes[0].categories) || []).forEach(c => { bs[c.categoryName] = c.score; });
  const hidung = lm[1], pipiA = lm[234], pipiB = lm[454];
  const tengah = (pipiA.x + pipiB.x) / 2, lebar = Math.abs(pipiB.x - pipiA.x) || 1e-6;
  return {
    wajah: n, kotak: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    // yaw > 0 : pengguna menengok ke KIRI-nya (hidung bergeser ke kanan bingkai asli)
    yaw: (hidung.x - tengah) / lebar,
    kedip: ((bs.eyeBlinkLeft || 0) + (bs.eyeBlinkRight || 0)) / 2,
    senyum: ((bs.mouthSmileLeft || 0) + (bs.mouthSmileRight || 0)) / 2
  };
}

/** Kecerahan rata-rata (0–255) & ketajaman (varian Laplacian) area wajah. */
export function kualitas(sumber, kotak) {
  const c = document.createElement('canvas');
  const W = 96, H = 96;
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const sw = sumber.videoWidth || sumber.width, sh = sumber.videoHeight || sumber.height;
  const k = kotak || { x: 0.25, y: 0.2, w: 0.5, h: 0.6 };
  ctx.drawImage(sumber, k.x * sw, k.y * sh, k.w * sw, k.h * sh, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const g = new Float32Array(W * H);
  let jum = 0;
  for (let i = 0; i < W * H; i++) { g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; jum += g[i]; }
  const terang = jum / (W * H);
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - W] - g[i + W];
    s += l; s2 += l * l; n++;
  }
  const tajam = s2 / n - (s / n) ** 2;
  return { terang, tajam, cukupTerang: terang > 55 && terang < 215, cukupTajam: tajam > 60 };
}

/** Ambil bingkai video ke kanvas (resolusi asli, tidak dicerminkan). */
export function ambilBingkai(video) {
  const c = document.createElement('canvas');
  c.width = video.videoWidth; c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0);
  return c;
}

/** JPEG terkompresi: sisi terpanjang maks 640 px, target ±40 KB (PRD 6). */
export function kompresFoto(kanvas, maks = 640, targetKB = 42) {
  const s = Math.min(1, maks / Math.max(kanvas.width, kanvas.height));
  const c = document.createElement('canvas');
  c.width = Math.round(kanvas.width * s); c.height = Math.round(kanvas.height * s);
  c.getContext('2d').drawImage(kanvas, 0, 0, c.width, c.height);
  let q = 0.72, url = c.toDataURL('image/jpeg', q);
  while (url.length * 0.75 > targetKB * 1024 && q > 0.36) { q -= 0.08; url = c.toDataURL('image/jpeg', q); }
  return url;
}

/** Muat semua model sekali (dipanggil saat idle agar kamera instan). */
export function muatMesin() {
  if (mesin) return mesin;
  mesin = (async () => {
    const [lm, fa, pasif] = await Promise.all([muatMediapipe(), muatFaceApi(), muatPasif()]);
    let tsAkhir = 0;
    return {
      simulasi: false,
      deteksi(video) {
        let ts = performance.now();
        if (ts <= tsAkhir) ts = tsAkhir + 1;
        tsAkhir = ts;
        return analisa(lm.detectForVideo(video, ts));
      },
      async vektor(kanvas) {
        const det = await fa.detectSingleFace(kanvas, new fa.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
          .withFaceLandmarks().withFaceDescriptor();
        return det ? Array.from(det.descriptor, x => Math.round(x * 1e5) / 1e5) : null;
      },
      async pasif(kanvas, kotak) {
        if (!pasif) return null;
        try { return await skorPasif(pasif, kanvas, kotak); } catch (e) { console.warn(e); return null; }
      },
      adaPasif: !!pasif
    };
  })();
  mesin.catch(() => { mesin = null; });
  return mesin;
}

/** MiniFASNetV2: crop wajah skala 2,7 → 80×80 BGR (CHW), softmax[1] = skor wajah asli. */
async function skorPasif(sesi, kanvas, kotak) {
  const ort = window.ort;
  const W = kanvas.width, H = kanvas.height;
  const cx = (kotak.x + kotak.w / 2) * W, cy = (kotak.y + kotak.h / 2) * H;
  const sisi = Math.min(Math.max(kotak.w * W, kotak.h * H) * 2.7, W, H);
  const c = document.createElement('canvas'); c.width = 80; c.height = 80;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(kanvas, Math.max(0, cx - sisi / 2), Math.max(0, cy - sisi / 2), sisi, sisi, 0, 0, 80, 80);
  const d = ctx.getImageData(0, 0, 80, 80).data, n = 80 * 80, arr = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { arr[i] = d[i * 4 + 2]; arr[n + i] = d[i * 4 + 1]; arr[2 * n + i] = d[i * 4]; }
  const nama = sesi.inputNames[0];
  const out = await sesi.run({ [nama]: new ort.Tensor('float32', arr, [1, 3, 80, 80]) });
  const v = Array.from(out[sesi.outputNames[0]].data);
  const mx = Math.max(...v), e = v.map(x => Math.exp(x - mx)), s = e.reduce((a, b) => a + b, 0);
  return Math.round((e[1] / s) * 1000) / 1000;
}

/** Mesin tiruan untuk mode demo/pengujian tanpa CDN (tidak dipakai di produksi). */
export function mesinSimulasi(vektorDemo) {
  let t0 = performance.now(), tahap = 'tengah';
  return {
    simulasi: true, adaPasif: false,
    setTahap(t) { tahap = t; t0 = performance.now(); },
    deteksi() {
      const dt = (performance.now() - t0) / 1000;
      const dasar = { wajah: 1, kotak: { x: 0.33, y: 0.22, w: 0.34, h: 0.5 }, yaw: 0, kedip: 0.05, senyum: 0.05 };
      if (tahap === 'KEDIP') dasar.kedip = dt > 0.6 && dt < 0.9 ? 0.85 : 0.05;
      if (tahap === 'TENGOK_KIRI') dasar.yaw = Math.min(0.25, dt * 0.3);
      if (tahap === 'TENGOK_KANAN') dasar.yaw = -Math.min(0.25, dt * 0.3);
      if (tahap === 'SENYUM') dasar.senyum = Math.min(0.9, dt * 0.9);
      return dasar;
    },
    async vektor() { return vektorDemo ? vektorDemo() : Array.from({ length: 128 }, (_, i) => Math.round(Math.sin(i * 1.7) * 1e4) / 1e4); },
    async pasif() { return null; }
  };
}
