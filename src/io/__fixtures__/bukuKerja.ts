import * as XLSX from 'xlsx';

/** Membangun buku kerja .xlsx di memori, untuk diumpankan ke importer. */
export function bukuKerjaXlsx(data: string[][]): ArrayBuffer {
  const lembar = XLSX.utils.aoa_to_sheet(data);
  const buku = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(buku, lembar, 'Sheet1');
  return XLSX.write(buku, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

const OPSI = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];

/**
 * Replika instrumen Post-Test: Email wajib, Name opsional, dua kolom meta,
 * lalu 20 butir. Butir ke-11 sengaja diisi Yes/No/Maybe pada sebagian baris,
 * seperti pada form aslinya.
 */
export function bukuKerjaPostTest(jumlahBaris: number): ArrayBuffer {
  const header = ['Email', 'Name', 'Age', 'Gender'];
  for (let n = 1; n <= 20; n += 1) header.push(`q${n}`);

  const data: string[][] = [header];
  for (let i = 0; i < jumlahBaris; i += 1) {
    const baris = [
      `peserta${i}@example.com`,
      i % 7 === 0 ? '' : `Peserta ${i}`,
      String(18 + (i % 5)),
      i % 2 === 0 ? 'female' : 'male',
    ];
    for (let n = 1; n <= 20; n += 1) {
      const pilihan = OPSI[(i + n) % OPSI.length];
      baris.push(n === 11 && i % 3 === 0 ? 'Maybe' : pilihan === undefined ? 'Agree' : pilihan);
    }
    data.push(baris);
  }
  return bukuKerjaXlsx(data);
}
