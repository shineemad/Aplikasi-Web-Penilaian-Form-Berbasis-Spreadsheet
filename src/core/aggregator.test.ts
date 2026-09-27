import { describe, expect, it } from 'vitest';
import {
  hitungIndeksDimensi,
  hitungIndeksKeseluruhan,
  hitungNilaiResponden,
} from './aggregator';
import type { Aturan, JawabanResponden, Skema } from './tipe';

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

function skemaLikert(perlakuanKosong: 'abaikan' | 'nol'): Skema {
  return {
    skemaId: 'uji',
    perlakuanKosong,
    butir: [
      { kolomAsal: 'q1', label: 'Butir 1', dimensi: 'kemudahan', aturan: LIKERT, bobot: 1 },
      { kolomAsal: 'q2', label: 'Butir 2', dimensi: 'kemudahan', aturan: LIKERT, bobot: 1 },
      { kolomAsal: 'q3', label: 'Butir 3', dimensi: 'kepuasan', aturan: LIKERT, bobot: 1 },
    ],
  };
}

function responden(id: string, jawaban: Record<string, string>): JawabanResponden {
  return { id, email: `${id}@example.com`, nama: null, jawaban };
}

describe('hitungNilaiResponden', () => {
  it('memberi 100 bila seluruh butir bernilai maksimum', () => {
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Strongly agree', q2: 'Strongly agree', q3: 'Strongly agree' }),
      skemaLikert('abaikan'),
    );
    expect(hasil.nilai).toBeCloseTo(100, 10);
    expect(hasil.butirTerhitung).toBe(3);
  });

  it('memberi 20 bila seluruh butir bernilai minimum — bukan 0', () => {
    // Batas bawah skala Likert adalah 1 dari 5, yaitu 20 persen.
    const hasil = hitungNilaiResponden(
      responden('a', {
        q1: 'Strongly disagree',
        q2: 'Strongly disagree',
        q3: 'Strongly disagree',
      }),
      skemaLikert('abaikan'),
    );
    expect(hasil.nilai).toBeCloseTo(20, 10);
  });

  it('mengeluarkan butir kosong dari perhitungan bila perlakuannya abaikan', () => {
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Strongly agree', q2: '', q3: 'Strongly agree' }),
      skemaLikert('abaikan'),
    );
    expect(hasil.nilai).toBeCloseTo(100, 10);
    expect(hasil.butirTerhitung).toBe(2);
    expect(hasil.butirKosong).toBe(1);
  });

  it('menghitung butir kosong sebagai nol bila perlakuannya nol', () => {
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Strongly agree', q2: '', q3: 'Strongly agree' }),
      skemaLikert('nol'),
    );
    // (1 + 0 + 1) / 3 x 100
    expect(hasil.nilai).toBeCloseTo(66.667, 3);
  });

  it('mengembalikan nilai null bila tidak ada satu pun butir yang bisa dihitung', () => {
    const hasil = hitungNilaiResponden(
      responden('a', { q1: '', q2: '', q3: '' }),
      skemaLikert('abaikan'),
    );
    expect(hasil.nilai).toBe(null);
    expect(hasil.butirKosong).toBe(3);
  });

  it('mencatat peringatan dan tidak memasukkan butirnya ke perhitungan', () => {
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Strongly agree', q2: 'Maybe', q3: 'Strongly agree' }),
      skemaLikert('abaikan'),
    );
    expect(hasil.peringatan).toHaveLength(1);
    expect(hasil.peringatan.join(' ')).toContain('Butir 2');
    expect(hasil.nilai).toBeCloseTo(100, 10);
    expect(hasil.butirTerhitung).toBe(2);
  });

  it('menghasilkan nilai yang sama untuk bobot 2:3:5 dan 20:30:50', () => {
    const jawaban = { q1: 'Agree', q2: 'Neutral', q3: 'Strongly agree' };
    const dasar = skemaLikert('abaikan');
    const kecil: Skema = {
      ...dasar,
      butir: dasar.butir.map((b, i) => ({ ...b, bobot: [2, 3, 5][i] as number })),
    };
    const besar: Skema = {
      ...dasar,
      butir: dasar.butir.map((b, i) => ({ ...b, bobot: [20, 30, 50][i] as number })),
    };
    const nilaiKecil = hitungNilaiResponden(responden('a', jawaban), kecil).nilai;
    const nilaiBesar = hitungNilaiResponden(responden('a', jawaban), besar).nilai;
    expect(nilaiKecil).not.toBe(null);
    expect(Number(nilaiKecil)).toBeCloseTo(Number(nilaiBesar), 10);
  });

  it('mengabaikan kolom yang aturannya abaikan', () => {
    const dasar = skemaLikert('abaikan');
    const skema: Skema = {
      ...dasar,
      butir: [
        ...dasar.butir,
        {
          kolomAsal: 'catatan',
          label: 'Catatan',
          dimensi: 'lain',
          aturan: { jenis: 'abaikan' },
          bobot: 1,
        },
      ],
    };
    const hasil = hitungNilaiResponden(
      responden('a', {
        q1: 'Strongly agree',
        q2: 'Strongly agree',
        q3: 'Strongly agree',
        catatan: 'bagus sekali',
      }),
      skema,
    );
    expect(hasil.nilai).toBeCloseTo(100, 10);
    expect(hasil.butirTerhitung).toBe(3);
  });
});

describe('hitungIndeksDimensi', () => {
  it('memberi 100 persen bila seluruh jawaban maksimum', () => {
    const hasil = hitungIndeksDimensi(
      [
        responden('a', { q1: 'Strongly agree', q2: 'Strongly agree', q3: 'Strongly agree' }),
        responden('b', { q1: 'Strongly agree', q2: 'Strongly agree', q3: 'Strongly agree' }),
      ],
      skemaLikert('abaikan'),
    );
    expect(hasil.map((d) => d.dimensi)).toEqual(['kemudahan', 'kepuasan']);
    expect(hasil[0]?.indeks).toBeCloseTo(100, 10);
    expect(hasil[0]?.pasanganDihitung).toBe(4);
  });

  it('memberi 20 persen bila seluruh jawaban minimum', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: 'Strongly disagree', q2: 'Strongly disagree', q3: 'Strongly disagree' })],
      skemaLikert('abaikan'),
    );
    expect(hasil[0]?.indeks).toBeCloseTo(20, 10);
  });

  it('mengecilkan penyebut saat jawaban kosong diabaikan', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: 'Strongly agree', q2: '', q3: 'Strongly agree' })],
      skemaLikert('abaikan'),
    );
    expect(hasil[0]?.indeks).toBeCloseTo(100, 10);
    expect(hasil[0]?.pasanganDihitung).toBe(1);
  });

  it('menurunkan indeks saat jawaban kosong dihitung nol', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: 'Strongly agree', q2: '', q3: 'Strongly agree' })],
      skemaLikert('nol'),
    );
    // (5 + 0) / (5 + 5) x 100
    expect(hasil[0]?.indeks).toBeCloseTo(50, 10);
    expect(hasil[0]?.pasanganDihitung).toBe(2);
  });

  it('mengeluarkan butir berperingatan dari pembilang dan penyebut', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: 'Strongly agree', q2: 'Maybe', q3: 'Strongly agree' })],
      skemaLikert('nol'),
    );
    expect(hasil[0]?.indeks).toBeCloseTo(100, 10);
    expect(hasil[0]?.pasanganDihitung).toBe(1);
  });

  it('mengembalikan indeks null bila dimensi tidak punya pasangan terhitung', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: '', q2: '', q3: 'Strongly agree' })],
      skemaLikert('abaikan'),
    );
    expect(hasil[0]?.indeks).toBe(null);
    expect(hasil[1]?.indeks).toBeCloseTo(100, 10);
  });
});

describe('hitungIndeksKeseluruhan', () => {
  it('merata-ratakan dimensi dengan bobot butirnya', () => {
    const skema = skemaLikert('abaikan');
    // kemudahan (bobot total 2) = 100, kepuasan (bobot total 1) = 20
    const hasil = hitungIndeksKeseluruhan(
      [
        { dimensi: 'kemudahan', indeks: 100, pasanganDihitung: 2 },
        { dimensi: 'kepuasan', indeks: 20, pasanganDihitung: 1 },
      ],
      skema,
    );
    expect(hasil).toBeCloseTo(73.333, 3);
  });

  it('melewati dimensi yang indeksnya null', () => {
    const skema = skemaLikert('abaikan');
    const hasil = hitungIndeksKeseluruhan(
      [
        { dimensi: 'kemudahan', indeks: null, pasanganDihitung: 0 },
        { dimensi: 'kepuasan', indeks: 80, pasanganDihitung: 1 },
      ],
      skema,
    );
    expect(hasil).toBeCloseTo(80, 10);
  });

  it('mengembalikan null bila seluruh dimensi kosong', () => {
    const skema = skemaLikert('abaikan');
    const hasil = hitungIndeksKeseluruhan(
      [
        { dimensi: 'kemudahan', indeks: null, pasanganDihitung: 0 },
        { dimensi: 'kepuasan', indeks: null, pasanganDihitung: 0 },
      ],
      skema,
    );
    expect(hasil).toBe(null);
  });
});
