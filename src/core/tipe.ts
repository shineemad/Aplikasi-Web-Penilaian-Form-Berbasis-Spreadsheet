/** Fungsi hash disuntikkan dari luar agar core tetap murni. */
export type FungsiHash = (teks: string) => string;

export type Aturan =
  | { jenis: 'peta-opsi'; peta: Record<string, number>; skorMaks: number }
  | { jenis: 'kunci-jawaban'; kunci: string }
  | { jenis: 'manual'; min: number; maks: number }
  | { jenis: 'abaikan' };

export type HasilSkor =
  | { status: 'terhitung'; skor: number }
  | { status: 'kosong' }
  | { status: 'diabaikan' }
  | { status: 'butuh-manual' }
  | { status: 'peringatan'; pesan: string; opsiTakDikenal: string };

export type PerlakuanKosong = 'abaikan' | 'nol';

export interface ButirSkema {
  kolomAsal: string;
  label: string;
  dimensi: string;
  aturan: Aturan;
  bobot: number;
}

export interface Skema {
  skemaId: string;
  butir: ButirSkema[];
  perlakuanKosong: PerlakuanKosong;
}

export interface JawabanResponden {
  id: string;
  email: string;
  nama: string | null;
  /** kolomAsal -> jawaban mentah, apa adanya dari spreadsheet */
  jawaban: Record<string, string>;
}
