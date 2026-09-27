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
  return Math.round(nilai * faktor) / faktor;
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
