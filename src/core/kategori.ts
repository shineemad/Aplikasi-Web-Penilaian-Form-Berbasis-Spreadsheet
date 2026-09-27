export interface Kategori {
  /** Batas bawah inklusif, dalam persen. */
  batasBawah: number;
  nama: string;
}

export const KATEGORI_BAWAAN: Kategori[] = [
  { batasBawah: 81, nama: 'Sangat Baik' },
  { batasBawah: 61, nama: 'Baik' },
  { batasBawah: 41, nama: 'Cukup' },
  { batasBawah: 21, nama: 'Kurang' },
  { batasBawah: 0, nama: 'Sangat Kurang' },
];

/** Menyerap galat pecahan IEEE-754 agar nilai yang tepat di batas tidak jatuh ke kategori di bawahnya. */
const TOLERANSI = 1e-9;

export function kategoriIndeks(
  indeks: number | null,
  kategori: Kategori[] = KATEGORI_BAWAAN,
): string | null {
  if (indeks === null) return null;

  const menurun = [...kategori].sort((a, b) => b.batasBawah - a.batasBawah);
  for (const satuan of menurun) {
    if (indeks >= satuan.batasBawah - TOLERANSI) return satuan.nama;
  }
  return null;
}
