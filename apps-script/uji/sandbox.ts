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
  return muatSumber(bacaSumberKode(), global, 'Kode.gs');
}

/**
 * Menjalankan sumber apa pun di konteks baru. Dipakai `muatKode` maupun sensor
 * global, yang harus bisa menjalankan potongan bentuk pengelakan tanpa
 * menyentuh berkas yang di-deploy.
 */
export function muatSumber(
  sumber: string,
  global: Record<string, unknown>,
  namaBerkas: string,
): Record<string, unknown> {
  // createContext mengontekstualkan objek ini di tempat, sehingga fungsi yang
  // dideklarasikan Kode.gs muncul sebagai medan pada objek yang sama.
  const konteks: Record<string, unknown> = { ...global, console };
  vm.createContext(konteks);
  vm.runInContext(sumber, konteks, { filename: namaBerkas });
  return konteks;
}

/**
 * Nama yang bertipe fungsi **menurut konteks itu sendiri**.
 *
 * Dinilai di dalam konteks, bukan lewat enumerasi properti, karena `let`,
 * `const`, dan `class` tingkat atas tidak pernah menjadi properti objek global
 * — tetapi tetap terlihat oleh berkas lain pada proyek Apps Script yang sama.
 * Enumerasi properti saja akan melewatkan ketiganya.
 */
export function namaBertipeFungsi(konteks: Record<string, unknown>, nama: string[]): string[] {
  if (nama.length === 0) return [];
  const ungkapan = nama.map((satu) => `typeof ${satu} === 'function'`).join(',');
  const jawaban = vm.runInContext(`[${ungkapan}]`, konteks, {
    filename: 'sensor-global',
  }) as unknown[];
  return nama.filter((_, i) => jawaban[i] === true);
}
