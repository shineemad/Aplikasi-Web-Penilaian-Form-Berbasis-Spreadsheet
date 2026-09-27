import { describe, expect, it } from 'vitest';
import { hitungKelengkapan } from './kelengkapan';
import type { Aturan, ButirSkema, JawabanResponden, Skema } from './tipe';

const LIKERT: Aturan = {
  jenis: 'peta-opsi',
  skorMaks: 5,
  peta: { agree: 4, neutral: 3 },
};

function butir(kolomAsal: string, aturan: Aturan): ButirSkema {
  return { kolomAsal, label: kolomAsal, dimensi: 'd', aturan, bobot: 1 };
}

function skema(daftar: ButirSkema[]): Skema {
  return { skemaId: 'uji', perlakuanKosong: 'abaikan', butir: daftar };
}

function responden(jawaban: Record<string, string>): JawabanResponden {
  return { id: 'a', email: 'a@example.com', nama: null, jawaban };
}

const TIGA_LIKERT = skema([butir('q1', LIKERT), butir('q2', LIKERT), butir('q3', LIKERT)]);

describe('hitungKelengkapan', () => {
  it('menyebut lengkap bila seluruh kolom terisi', () => {
    expect(
      hitungKelengkapan(responden({ q1: 'Agree', q2: 'Neutral', q3: 'Agree' }), TIGA_LIKERT),
    ).toEqual({ status: 'lengkap' });
  });

  it('menghitung berapa kolom yang kosong', () => {
    expect(hitungKelengkapan(responden({ q1: 'Agree', q2: '', q3: '' }), TIGA_LIKERT)).toEqual({
      status: 'kurang',
      jumlahKosong: 2,
    });
  });

  it('menyebut kosong bila seluruh kolom kosong', () => {
    expect(hitungKelengkapan(responden({ q1: '', q2: '', q3: '' }), TIGA_LIKERT)).toEqual({
      status: 'kosong',
    });
  });

  it('memperlakukan kolom yang tidak ada sama dengan kolom kosong', () => {
    expect(hitungKelengkapan(responden({ q1: 'Agree' }), TIGA_LIKERT)).toEqual({
      status: 'kurang',
      jumlahKosong: 2,
    });
  });

  it('memperlakukan spasi saja sebagai kosong', () => {
    expect(
      hitungKelengkapan(responden({ q1: '   ', q2: 'Agree', q3: 'Agree' }), TIGA_LIKERT),
    ).toEqual({ status: 'kurang', jumlahKosong: 1 });
  });

  it('mengeluarkan kolom abaikan dari perhitungan', () => {
    const dengan = skema([butir('q1', LIKERT), butir('catatan', { jenis: 'abaikan' })]);
    expect(hitungKelengkapan(responden({ q1: 'Agree' }), dengan)).toEqual({ status: 'lengkap' });
  });

  it('mengeluarkan kolom manual dari perhitungan', () => {
    // Kolom manual diisi penilai, bukan responden. Menghitungnya akan membuat
    // setiap orang selalu berstatus kurang, sehingga penandanya kehilangan arti.
    const dengan = skema([
      butir('q1', LIKERT),
      butir('wawancara', { jenis: 'manual', min: 0, maks: 100 }),
    ]);
    expect(hitungKelengkapan(responden({ q1: 'Agree' }), dengan)).toEqual({ status: 'lengkap' });
  });

  it('menyebut lengkap bila skema tidak punya kolom yang diisi responden', () => {
    const hanyaManual = skema([butir('wawancara', { jenis: 'manual', min: 0, maks: 100 })]);
    expect(hitungKelengkapan(responden({}), hanyaManual)).toEqual({ status: 'lengkap' });
  });

  it('tidak peduli apakah jawabannya dikenali peta', () => {
    // Kelengkapan hanya soal terisi atau tidak. Opsi tak dikenal urusan periksaSkema.
    expect(
      hitungKelengkapan(responden({ q1: 'Maybe', q2: 'Maybe', q3: 'Maybe' }), TIGA_LIKERT),
    ).toEqual({ status: 'lengkap' });
  });
});
