import { kategoriIndeks } from './kategori';
import type { Kategori } from './kategori';

/** Dipakai untuk nilai yang tidak ada. Tidak pernah dipakai untuk nol. */
export const TANDA_KOSONG = '—';

export interface OpsiAngka {
  desimal: number;
  kategori?: Kategori[];
}

function bulatkan(nilai: number, desimal: number): number {
  const faktor = 10 ** desimal;
  // Simetris terhadap nol, bukan Math.round biasa. Math.round membulatkan seri
  // ke arah +∞, sehingga selisih -6,25 tercetak "-6,2" sementara Excel
  // ROUND(-6,25;1) memberi -6,3 — dua angka berbeda untuk data yang sama.
  // Minus-nol tidak perlu dijaga di sini: toFixed mencetak -0 sebagai "0,0",
  // dan kategoriIndeks membandingkan -0 sama dengan 0.
  return (Math.sign(nilai) * Math.round(Math.abs(nilai) * faktor)) / faktor;
}

export function formatAngka(nilai: number | null, opsi: OpsiAngka): string {
  if (nilai === null) return TANDA_KOSONG;
  return bulatkan(nilai, opsi.desimal).toFixed(opsi.desimal).replace('.', ',');
}

/** Kategori diambil dari angka yang DITAMPILKAN, supaya label dan angka tidak pernah bertentangan. */
export function kategoriTampil(nilai: number | null, opsi: OpsiAngka): string {
  if (nilai === null) return TANDA_KOSONG;

  const tampil = bulatkan(nilai, opsi.desimal);
  const nama = kategoriIndeks(tampil, opsi.kategori);
  return nama === null ? TANDA_KOSONG : nama;
}
