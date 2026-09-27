import * as XLSX from 'xlsx';
import type { TabelTampil } from '../core/tabelTampil';

/** Batas nama lembar pada format .xlsx. */
const PANJANG_MAKS_NAMA = 31;

export function tulisExcel(tabel: TabelTampil[]): ArrayBuffer {
  const buku = XLSX.utils.book_new();

  for (const satu of tabel) {
    // Seluruh sel ditulis sebagai teks apa adanya: memformat di sini akan
    // membuat angka berkas berbeda dari angka layar.
    const matriks = [satu.kolom, ...satu.baris];
    const lembar = XLSX.utils.aoa_to_sheet(matriks);
    XLSX.utils.book_append_sheet(buku, lembar, satu.judul.slice(0, PANJANG_MAKS_NAMA));
  }

  return XLSX.write(buku, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
