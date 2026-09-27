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

  it('membulatkan setengah menjauhi nol, bukan ke arah plus tak hingga', () => {
    // Math.round membulatkan seri selalu ke atas, sehingga -6,25 menjadi -6,2.
    // Excel memberi ROUND(-6,25;1) = -6,3. Angka -6,25 bukan contoh buatan:
    // itu selisih nyata pada tes 16 soal, 8 benar di Pre-Test dan 7 di Post-Test.
    expect(formatAngka(-6.25, { desimal: 1 })).toBe('-6,3');
    expect(formatAngka(6.25, { desimal: 1 })).toBe('6,3');
    expect(formatAngka(-1.25, { desimal: 1 })).toBe('-1,3');
    expect(formatAngka(-3.75, { desimal: 1 })).toBe('-3,8');
  });

  it('tidak mencetak minus di depan nol', () => {
    // -0,04 dibulatkan menjadi -0 di dalam, tetapi pembaca laporan tidak pernah
    // boleh melihat "-0,0": minus di situ menyiratkan penurunan yang tidak ada.
    expect(formatAngka(-0.04, { desimal: 1 })).toBe('0,0');
    expect(formatAngka(-0.04, { desimal: 1 })).not.toBe('-0,0');
  });

  it('tetap mencetak minus bila pembulatan benar-benar menjauhi nol', () => {
    // Berpasangan dengan uji di atas: jaga minus-nol tidak boleh berubah
    // menjadi membuang minus pada angka negatif yang sesungguhnya kecil.
    expect(formatAngka(-0.05, { desimal: 1 })).toBe('-0,1');
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
