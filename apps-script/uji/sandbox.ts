import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/**
 * Pemuat Kode.gs untuk uji.
 *
 * Berkas yang dimuat adalah berkas yang di-deploy, bukan salinannya
 * (Batasan Global 20). Karena itu jalur berkasnya hanya ditulis sekali di sini
 * dan dipakai bersama oleh pemuat maupun pemeriksa teks.
 */
const BERKAS_KODE = new URL('../Kode.gs', import.meta.url);

export function bacaSumberKode(): string {
  return readFileSync(BERKAS_KODE, 'utf8');
}

export function muatKode(global: Record<string, unknown>): Record<string, unknown> {
  // createContext mengontekstualkan objek ini di tempat, sehingga fungsi yang
  // dideklarasikan Kode.gs muncul sebagai medan pada objek yang sama.
  const konteks: Record<string, unknown> = { ...global, console };
  vm.createContext(konteks);
  vm.runInContext(bacaSumberKode(), konteks, { filename: 'Kode.gs' });
  return konteks;
}
