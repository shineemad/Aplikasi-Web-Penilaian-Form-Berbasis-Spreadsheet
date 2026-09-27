import * as XLSX from 'xlsx';
import type { BarisImpor, Impor } from './tipe';

const EKSTENSI_DIDUKUNG = ['.xlsx', '.xls', '.csv'];

export function bacaBerkas(isi: ArrayBuffer, namaBerkas: string): Impor {
  // SheetJS memperlakukan teks biasa sebagai CSV yang sah, jadi berkas yang
  // jelas-jelas bukan spreadsheet harus ditolak di sini, bukan lewat parser.
  const ekstensi = namaBerkas.slice(namaBerkas.lastIndexOf('.')).toLowerCase();
  if (!EKSTENSI_DIDUKUNG.includes(ekstensi)) return gagalBukanSpreadsheet(namaBerkas);

  let matriks: string[][];

  try {
    const buku = XLSX.read(isi, { type: 'array' });
    const namaLembar = buku.SheetNames[0];
    if (namaLembar === undefined) return gagalBukanSpreadsheet(namaBerkas);

    const lembar = buku.Sheets[namaLembar];
    if (lembar === undefined) return gagalBukanSpreadsheet(namaBerkas);

    matriks = XLSX.utils.sheet_to_json<string[]>(lembar, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });
  } catch {
    return gagalBukanSpreadsheet(namaBerkas);
  }

  const barisHeader = matriks[0];
  if (barisHeader === undefined || barisHeader.length === 0) {
    return gagalBukanSpreadsheet(namaBerkas);
  }

  const header = barisHeader.map((sel) => String(sel).trim());

  for (let i = 0; i < header.length; i += 1) {
    if (header[i] === '') {
      return {
        status: 'gagal',
        pesan:
          `Baris pertama pada kolom ke-${i + 1} kosong, padahal baris pertama dipakai sebagai nama kolom. ` +
          'Beri nama kolom itu, atau hapus kolomnya, lalu unggah ulang.',
      };
    }
  }

  const terlihat = new Set<string>();
  for (const nama of header) {
    if (terlihat.has(nama)) {
      return {
        status: 'gagal',
        pesan:
          `Nama kolom "${nama}" kembar. Setiap kolom harus punya nama yang berbeda, ` +
          'karena nama kolom dipakai untuk memasangkan jawaban dengan aturan penilaian. ' +
          'Ubah salah satunya, lalu unggah ulang.',
      };
    }
    terlihat.add(nama);
  }

  const baris: BarisImpor[] = [];
  for (let i = 1; i < matriks.length; i += 1) {
    const isiBaris = matriks[i];
    if (isiBaris === undefined) continue;

    const satu: BarisImpor = {};
    for (let k = 0; k < header.length; k += 1) {
      const nama = header[k];
      if (nama === undefined) continue;
      const sel = isiBaris[k];
      satu[nama] = sel === undefined ? '' : String(sel);
    }
    baris.push(satu);
  }

  if (baris.length === 0) {
    return {
      status: 'gagal',
      pesan:
        `Berkas "${namaBerkas}" hanya berisi baris nama kolom dan tidak berisi satu baris data pun. ` +
        'Periksa apakah berkas yang terunggah sudah yang benar.',
    };
  }

  return { status: 'berhasil', header, baris };
}

function gagalBukanSpreadsheet(namaBerkas: string): Impor {
  return {
    status: 'gagal',
    pesan:
      `Berkas "${namaBerkas}" tidak dapat dibaca sebagai spreadsheet. ` +
      'Format yang didukung adalah .xlsx, .xls, dan .csv. ' +
      'Bila berkasnya dari Google Sheets, unduh dulu lewat File → Unduh → Microsoft Excel (.xlsx).',
  };
}
