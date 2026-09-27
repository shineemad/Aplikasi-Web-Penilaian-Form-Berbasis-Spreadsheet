import * as XLSX from 'xlsx';
import type { BarisImpor, Impor } from './tipe';

const EKSTENSI_DIDUKUNG = ['.xlsx', '.xls', '.csv'];

/** Pesan yang bergantung pada asal data, supaya pengguna tautan tidak diajari soal berkas. */
export interface PesanSumber {
  bukanSpreadsheet: string;
  lembarKosong: string;
  tanpaBarisData: string;
  /** Penutup langkah perbaikan, mis. "lalu unggah ulang". */
  ulangi: string;
}

function pesanBerkas(namaBerkas: string): PesanSumber {
  return {
    bukanSpreadsheet:
      `Berkas "${namaBerkas}" tidak dapat dibaca sebagai spreadsheet. ` +
      'Format yang didukung adalah .xlsx, .xls, dan .csv. ' +
      'Bila berkasnya dari Google Sheets, unduh dulu lewat File → Unduh → Microsoft Excel (.xlsx).',
    // Berkas terbaca sah sebagai spreadsheet, hanya lembar pertamanya kosong —
    // beda dari kasus "bukan spreadsheet", jadi pesannya pun harus beda.
    lembarKosong:
      `Berkas "${namaBerkas}" berhasil dibaca tetapi lembar pertamanya kosong sama sekali. ` +
      'Isi baris pertama dengan nama kolom, lalu unggah ulang.',
    tanpaBarisData:
      `Berkas "${namaBerkas}" hanya berisi baris nama kolom dan tidak berisi satu baris data pun. ` +
      'Periksa apakah berkas yang terunggah sudah yang benar.',
    ulangi: 'lalu unggah ulang',
  };
}

export function bacaBerkas(isi: ArrayBuffer, namaBerkas: string): Impor {
  // SheetJS memperlakukan teks biasa sebagai CSV yang sah, jadi berkas yang
  // jelas-jelas bukan spreadsheet harus ditolak di sini, bukan lewat parser.
  const ekstensi = namaBerkas.slice(namaBerkas.lastIndexOf('.')).toLowerCase();
  const pesan = pesanBerkas(namaBerkas);
  if (!EKSTENSI_DIDUKUNG.includes(ekstensi)) return gagal(pesan.bukanSpreadsheet);

  if (ekstensi === '.csv') {
    // SheetJS membaca byte CSV sebagai Latin-1, jadi "Peña" menjadi "PeÃ±a".
    // Byte yang bukan UTF-8 ditolak, bukan ditebak hurufnya.
    let teks: string;
    try {
      teks = new TextDecoder('utf-8', { fatal: true }).decode(isi);
    } catch {
      return gagal(
        `Berkas "${namaBerkas}" bukan CSV berkode UTF-8, sehingga huruf seperti ñ, é, atau huruf Arab ` +
          'tidak dapat dibaca dengan pasti. Di Excel, simpan ulang lewat Simpan Sebagai → ' +
          '"CSV UTF-8 (Comma delimited)", atau unggah berkas .xlsx-nya langsung.',
      );
    }
    return bacaTeksCsv(teks, pesan);
  }

  let buku: XLSX.WorkBook;
  try {
    buku = XLSX.read(isi, { type: 'array' });
  } catch {
    return gagal(pesan.bukanSpreadsheet);
  }
  return susunImpor(buku, pesan);
}

/** Membaca teks CSV yang sudah terurai, tanpa mengubah satu huruf pun isinya. */
export function bacaTeksCsv(teks: string, pesan: PesanSumber): Impor {
  let buku: XLSX.WorkBook;
  try {
    // raw: true mencegah "1/2" disulap jadi tanggal dan "007" jadi angka.
    buku = XLSX.read(teks, { type: 'string', raw: true });
  } catch {
    return gagal(pesan.bukanSpreadsheet);
  }
  return susunImpor(buku, pesan);
}

function susunImpor(buku: XLSX.WorkBook, pesan: PesanSumber): Impor {
  const namaLembar = buku.SheetNames[0];
  if (namaLembar === undefined) return gagal(pesan.bukanSpreadsheet);
  const lembar = buku.Sheets[namaLembar];
  if (lembar === undefined) return gagal(pesan.bukanSpreadsheet);

  let matriks: string[][];
  let barisAwal = 0;
  try {
    // Baris kosong ikut dibaca supaya nomor baris asal tetap bisa dihitung.
    matriks = XLSX.utils.sheet_to_json<string[]>(lembar, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: true,
    });
    const rentang = lembar['!ref'];
    if (rentang !== undefined) barisAwal = XLSX.utils.decode_range(rentang).s.r;
  } catch {
    return gagal(pesan.bukanSpreadsheet);
  }

  const indeksHeader = matriks.findIndex((isiBaris) => !barisKosong(isiBaris));
  const barisHeader = matriks[indeksHeader];
  if (indeksHeader === -1 || barisHeader === undefined) return gagal(pesan.lembarKosong);

  const header = barisHeader.map((sel) => String(sel).trim());

  for (let i = 0; i < header.length; i += 1) {
    if (header[i] === '') {
      return gagal(
        `Baris pertama pada kolom ke-${i + 1} kosong, padahal baris pertama dipakai sebagai nama kolom. ` +
          `Beri nama kolom itu, atau hapus kolomnya, ${pesan.ulangi}.`,
      );
    }
  }

  const terlihat = new Set<string>();
  for (const nama of header) {
    if (terlihat.has(nama)) {
      return gagal(
        `Nama kolom "${nama}" kembar. Setiap kolom harus punya nama yang berbeda, ` +
          'karena nama kolom dipakai untuk memasangkan jawaban dengan aturan penilaian. ' +
          `Ubah salah satunya, ${pesan.ulangi}.`,
      );
    }
    terlihat.add(nama);
  }

  const baris: BarisImpor[] = [];
  const nomorBaris: number[] = [];
  for (let i = indeksHeader + 1; i < matriks.length; i += 1) {
    const isiBaris = matriks[i];
    if (isiBaris === undefined || barisKosong(isiBaris)) continue;

    // Nama kolom berasal dari pengguna: "__proto__" atau "constructor" tidak
    // boleh menyentuh prototipe objek.
    const satu: BarisImpor = Object.create(null) as BarisImpor;
    for (let k = 0; k < header.length; k += 1) {
      const nama = header[k];
      if (nama === undefined) continue;
      const sel = isiBaris[k];
      satu[nama] = sel === undefined ? '' : String(sel);
    }
    baris.push(satu);
    nomorBaris.push(barisAwal + i + 1);
  }

  if (baris.length === 0) return gagal(pesan.tanpaBarisData);

  return { status: 'berhasil', header, baris, nomorBaris };
}

function barisKosong(isiBaris: string[]): boolean {
  return isiBaris.every((sel) => String(sel) === '');
}

function gagal(pesan: string): Impor {
  return { status: 'gagal', pesan };
}
