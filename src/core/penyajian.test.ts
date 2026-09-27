import { describe, expect, it } from 'vitest';
import { formatAngka, kategoriTampil, TANDA_KOSONG } from './penyajian';

describe('formatAngka', () => {
  it('membulatkan ke jumlah desimal yang diminta', () => {
    expect(formatAngka(61.052631, { desimal: 1 })).toBe('61,1');
    expect(formatAngka(61.052631, { desimal: 2 })).toBe('61,05');
  });

  it('memakai koma sebagai pemisah desimal', () => {
    expect(formatAngka(80, { desimal: 1 })).toBe('80,0');
  });

  it('menampilkan nol sebagai angka, bukan tanda kosong', () => {
    // Nol adalah nilai sungguhan: orang yang menjawab dan skornya nol.
    expect(formatAngka(0, { desimal: 1 })).toBe('0,0');
  });

  it('menampilkan null sebagai tanda kosong', () => {
    expect(formatAngka(null, { desimal: 1 })).toBe(TANDA_KOSONG);
    expect(formatAngka(null, { desimal: 1 })).not.toBe('0,0');
  });

  it('membulatkan setengah ke atas', () => {
    expect(formatAngka(80.95, { desimal: 1 })).toBe('81,0');
  });

  it('menampilkan bilangan bulat tanpa desimal bila diminta nol desimal', () => {
    expect(formatAngka(80.6, { desimal: 0 })).toBe('81');
  });

  it('tidak memakai pemisah ribuan', () => {
    expect(formatAngka(1234.5, { desimal: 1 })).toBe('1234,5');
  });
});

describe('kategoriTampil', () => {
  it('memakai angka yang sudah dibulatkan, bukan angka mentah', () => {
    // 80,996 tercetak sebagai "81,0". Mengkategorikan angka mentahnya akan
    // menghasilkan baris bertuliskan 81,0 tetapi berlabel Baik.
    expect(kategoriTampil(80.996, { desimal: 1 })).toBe('Sangat Baik');
  });

  it('tidak menaikkan kategori bila pembulatan tidak mencapai batas', () => {
    expect(kategoriTampil(80.94, { desimal: 1 })).toBe('Baik');
  });

  it('mengembalikan tanda kosong untuk null', () => {
    expect(kategoriTampil(null, { desimal: 1 })).toBe(TANDA_KOSONG);
  });

  it('mengkategorikan nol sebagai kategori terendah, bukan kosong', () => {
    expect(kategoriTampil(0, { desimal: 1 })).toBe('Sangat Kurang');
  });

  it('menghormati daftar kategori yang diatur admin', () => {
    const sendiri = [
      { batasBawah: 50, nama: 'Lulus' },
      { batasBawah: 0, nama: 'Belum Lulus' },
    ];
    expect(kategoriTampil(49.96, { desimal: 1, kategori: sendiri })).toBe('Lulus');
    expect(kategoriTampil(49.94, { desimal: 1, kategori: sendiri })).toBe('Belum Lulus');
  });
});
