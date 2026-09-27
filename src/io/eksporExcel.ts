import * as XLSX from 'xlsx';
import type { TabelTampil } from '../core/tabelTampil';

/** Batas nama lembar pada format .xlsx. */
const PANJANG_MAKS_NAMA = 31;

export function tulisExcel(tabel: TabelTampil[]): ArrayBuffer {
  if (tabel.length === 0) {
    throw new Error(
      'tulisExcel dipanggil tanpa satu tabel pun untuk ditulis, padahal berkas Excel harus berisi ' +
        'minimal satu lembar. Sertakan minimal satu TabelTampil sebelum memanggil tulisExcel.',
    );
  }

  const buku = XLSX.utils.book_new();
  const namaTerpakai = new Set<string>();

  for (const satu of tabel) {
    // Seluruh sel ditulis sebagai teks apa adanya: memformat di sini akan
    // membuat angka berkas berbeda dari angka layar.
    const namaLembar = satu.judul.slice(0, PANJANG_MAKS_NAMA);
    if (namaTerpakai.has(namaLembar)) {
      throw new Error(
        `Judul tabel "${satu.judul}" menghasilkan nama lembar "${namaLembar}" yang sudah dipakai tabel ` +
          `lain (nama lembar Excel dipotong maksimal ${PANJANG_MAKS_NAMA} karakter, sehingga dua judul ` +
          'yang berbeda pun bisa bertabrakan setelah dipotong). Beri judul yang berbeda pada tabel ini, ' +
          'lalu tulis ulang.',
      );
    }
    namaTerpakai.add(namaLembar);

    const matriks = [satu.kolom, ...satu.baris];
    const lembar = XLSX.utils.aoa_to_sheet(matriks);
    XLSX.utils.book_append_sheet(buku, lembar, namaLembar);
  }

  return XLSX.write(buku, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
