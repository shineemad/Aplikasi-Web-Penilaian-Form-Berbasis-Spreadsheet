/** Satu baris apa adanya dari spreadsheet: nama kolom -> teks. */
export type BarisImpor = Record<string, string>;

export interface HasilImpor {
  status: 'berhasil';
  header: string[];
  baris: BarisImpor[];
}

export interface GagalImpor {
  status: 'gagal';
  /** Pesan untuk pengguna. Wajib menyebut langkah perbaikan, bukan hanya keluhan. */
  pesan: string;
}

export type Impor = HasilImpor | GagalImpor;
