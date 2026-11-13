/* =====================================================================
   pegawai/data.js — Penyimpanan data "boot" bersama untuk semua halaman
   pegawai (SWR: tampil instan dari cache, segarkan di latar).
   ===================================================================== */
import { swr, cache, api, LS } from '../core/api.js';

let data = (cache('boot', {}) || {}).data || null;
const pendengar = new Set();

export const boot = () => data;
export function dengar(fn) { pendengar.add(fn); if (data) fn(data, { cache: true }); return () => pendengar.delete(fn); }
function siar(meta) { pendengar.forEach(fn => { try { fn(data, meta); } catch (e) { console.error(e); } }); }

let berjalan = null;
export function segarkan() {
  if (berjalan) return berjalan;
  berjalan = swr('boot', {}, (d, meta) => { data = d; siar(meta); }, { onError: () => {} })
    .finally(() => { berjalan = null; });
  return berjalan;
}

/** Perbarui lokal (optimistis) lalu segarkan dari server. */
export function ubahLokal(fn) {
  if (!data) return;
  fn(data);
  siar({ lokal: true });
}

export async function bootSegar() { data = await api('boot', {}); siar({}); return data; }

export function perbaruiProfilSesi() {
  const s = LS.get('pp_sesi');
  if (s && data && data.profil) { s.profil = Object.assign(s.profil || {}, data.profil); s.peran = data.peran || s.peran; LS.set('pp_sesi', s); }
}
