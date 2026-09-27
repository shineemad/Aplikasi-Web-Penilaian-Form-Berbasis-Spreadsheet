import { describe, expect, it } from 'vitest';
import { skorJawaban, skorMaksAturan } from './scorer';
import type { Aturan } from './tipe';

const LIKERT: Aturan = {
  jenis: 'peta-opsi',
  skorMaks: 5,
  peta: {
    'strongly disagree': 1,
    disagree: 2,
    neutral: 3,
    agree: 4,
    'strongly agree': 5,
  },
};

describe('skorJawaban dengan peta-opsi', () => {
  it('mencocokkan opsi meski huruf besar-kecilnya berbeda', () => {
    // Dua butir pada instrumen Post-Test nyata menulis "Strongly Agree"
    // dengan A besar, sisanya "Strongly agree".
    expect(skorJawaban('Strongly Agree', LIKERT)).toEqual({ status: 'terhitung', skor: 5 });
    expect(skorJawaban('Strongly agree', LIKERT)).toEqual({ status: 'terhitung', skor: 5 });
  });

  it('mencocokkan opsi yang berspasi tepi', () => {
    expect(skorJawaban('  Agree  ', LIKERT)).toEqual({ status: 'terhitung', skor: 4 });
  });

  it('mencocokkan meski kunci peta ditulis dengan huruf besar', () => {
    const petaBerhurufBesar: Aturan = {
      jenis: 'peta-opsi',
      skorMaks: 5,
      peta: { 'Strongly Agree': 5 },
    };
    expect(skorJawaban('strongly agree', petaBerhurufBesar)).toEqual({
      status: 'terhitung',
      skor: 5,
    });
  });

  it('mengembalikan peringatan untuk opsi tak dikenal, bukan angka', () => {
    // Butir 11 instrumen nyata memakai Yes/No/Maybe pada skema Likert.
    const hasil = skorJawaban('Maybe', LIKERT);
    expect(hasil.status).toBe('peringatan');
    if (hasil.status === 'peringatan') {
      expect(hasil.opsiTakDikenal).toBe('Maybe');
      expect(hasil.pesan).toContain('Maybe');
    }
  });

  it('tidak pernah mengembalikan skor 0 untuk opsi tak dikenal', () => {
    expect(skorJawaban('Maybe', LIKERT)).not.toEqual({ status: 'terhitung', skor: 0 });
  });
});

describe('skorJawaban dengan jawaban kosong', () => {
  it('memperlakukan teks kosong sebagai kosong, bukan nol', () => {
    expect(skorJawaban('', LIKERT)).toEqual({ status: 'kosong' });
  });

  it('memperlakukan null sebagai kosong', () => {
    expect(skorJawaban(null, LIKERT)).toEqual({ status: 'kosong' });
  });

  it('memperlakukan undefined sebagai kosong', () => {
    expect(skorJawaban(undefined, LIKERT)).toEqual({ status: 'kosong' });
  });

  it('memperlakukan spasi saja sebagai kosong', () => {
    expect(skorJawaban('   ', LIKERT)).toEqual({ status: 'kosong' });
  });
});

describe('skorJawaban dengan kunci-jawaban', () => {
  const kunci: Aturan = { jenis: 'kunci-jawaban', kunci: 'B' };

  it('memberi 1 untuk jawaban benar tanpa memedulikan huruf besar-kecil', () => {
    expect(skorJawaban('b', kunci)).toEqual({ status: 'terhitung', skor: 1 });
    expect(skorJawaban('B', kunci)).toEqual({ status: 'terhitung', skor: 1 });
  });

  it('memberi 0 untuk jawaban salah', () => {
    expect(skorJawaban('C', kunci)).toEqual({ status: 'terhitung', skor: 0 });
  });

  it('tetap membedakan salah dari kosong', () => {
    expect(skorJawaban('', kunci)).toEqual({ status: 'kosong' });
  });
});

describe('skorJawaban dengan aturan lain', () => {
  it('menandai kolom manual sebagai butuh-manual', () => {
    expect(skorJawaban('apa pun', { jenis: 'manual', min: 0, maks: 100 })).toEqual({
      status: 'butuh-manual',
    });
  });

  it('menandai kolom abaikan sebagai diabaikan', () => {
    expect(skorJawaban('apa pun', { jenis: 'abaikan' })).toEqual({ status: 'diabaikan' });
  });

  it('mengabaikan kolom abaikan meski jawabannya kosong', () => {
    expect(skorJawaban('', { jenis: 'abaikan' })).toEqual({ status: 'diabaikan' });
  });
});

describe('skorMaksAturan', () => {
  it('mengembalikan skorMaks untuk peta-opsi', () => {
    expect(skorMaksAturan(LIKERT)).toBe(5);
  });

  it('mengembalikan 1 untuk kunci-jawaban', () => {
    expect(skorMaksAturan({ jenis: 'kunci-jawaban', kunci: 'B' })).toBe(1);
  });

  it('mengembalikan batas atas untuk manual', () => {
    expect(skorMaksAturan({ jenis: 'manual', min: 0, maks: 100 })).toBe(100);
  });

  it('mengembalikan null untuk abaikan', () => {
    expect(skorMaksAturan({ jenis: 'abaikan' })).toBe(null);
  });
});
