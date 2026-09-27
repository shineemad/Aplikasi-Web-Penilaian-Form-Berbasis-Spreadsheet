import { describe, expect, it } from 'vitest';
import { KATEGORI_BAWAAN, kategoriIndeks } from './kategori';
import type { Kategori } from './kategori';

describe('kategoriIndeks dengan kategori bawaan', () => {
  it('memberi Sangat Baik untuk 100', () => {
    expect(kategoriIndeks(100)).toBe('Sangat Baik');
  });

  it('memperlakukan batas bawah sebagai inklusif', () => {
    expect(kategoriIndeks(81)).toBe('Sangat Baik');
    expect(kategoriIndeks(61)).toBe('Baik');
    expect(kategoriIndeks(41)).toBe('Cukup');
    expect(kategoriIndeks(21)).toBe('Kurang');
  });

  it('memberi kategori di bawahnya untuk angka tepat di bawah batas', () => {
    expect(kategoriIndeks(80.9)).toBe('Baik');
    expect(kategoriIndeks(60.9)).toBe('Cukup');
  });

  it('memperlakukan angka yang hanya meleset karena galat pecahan sebagai berada di batas', () => {
    // hitungNilaiResponden menghasilkan 60.999999999999986 untuk nilai yang
    // secara matematis tepat 61. Tanpa toleransi, itu jatuh ke kategori di bawahnya.
    expect(kategoriIndeks(60.999999999999986)).toBe('Baik');
    expect(kategoriIndeks(80.99999999999999)).toBe('Sangat Baik');
  });

  it('tetap menolak angka yang benar-benar di bawah batas', () => {
    expect(kategoriIndeks(60.9)).toBe('Cukup');
    expect(kategoriIndeks(80.9)).toBe('Baik');
  });

  it('memberi Sangat Kurang untuk batas bawah skala Likert', () => {
    // Seluruh butir dijawab minimum menghasilkan 20 persen, bukan 0 persen.
    expect(kategoriIndeks(20)).toBe('Sangat Kurang');
    expect(kategoriIndeks(0)).toBe('Sangat Kurang');
  });

  it('mengembalikan null untuk indeks null', () => {
    expect(kategoriIndeks(null)).toBe(null);
  });
});

describe('kategoriIndeks dengan kategori pilihan admin', () => {
  const kustom: Kategori[] = [
    { batasBawah: 0, nama: 'Perlu Perbaikan' },
    { batasBawah: 50, nama: 'Memadai' },
    { batasBawah: 90, nama: 'Unggul' },
  ];

  it('memakai daftar yang diberikan, bukan bawaan', () => {
    expect(kategoriIndeks(95, kustom)).toBe('Unggul');
    expect(kategoriIndeks(50, kustom)).toBe('Memadai');
    expect(kategoriIndeks(10, kustom)).toBe('Perlu Perbaikan');
  });

  it('tidak bergantung pada urutan daftar yang diberikan', () => {
    const acak: Kategori[] = [kustom[1], kustom[2], kustom[0]].filter(
      (k): k is Kategori => k !== undefined,
    );
    expect(kategoriIndeks(95, acak)).toBe('Unggul');
    expect(kategoriIndeks(10, acak)).toBe('Perlu Perbaikan');
  });

  it('tidak mengubah daftar yang diberikan', () => {
    const salinan = [...kustom];
    kategoriIndeks(95, kustom);
    expect(kustom).toEqual(salinan);
  });
});

describe('KATEGORI_BAWAAN', () => {
  it('memuat lima kategori sesuai spec', () => {
    expect(KATEGORI_BAWAAN.map((k) => k.nama)).toEqual([
      'Sangat Baik',
      'Baik',
      'Cukup',
      'Kurang',
      'Sangat Kurang',
    ]);
  });
});
