import * as XLSX from 'xlsx';

/** Membangun buku kerja .xlsx di memori, untuk diumpankan ke importer. */
export function bukuKerjaXlsx(data: string[][]): ArrayBuffer {
  const lembar = XLSX.utils.aoa_to_sheet(data);
  const buku = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(buku, lembar, 'Sheet1');
  return XLSX.write(buku, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
