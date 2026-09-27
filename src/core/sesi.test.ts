import { describe, expect, it } from 'vitest';
import { hashPalsu } from './__fixtures__/hash';
import { idResponden } from './normalisasi';
import { bangunNilaiSesi } from './sesi';
import type { Aturan, ButirSkema, JawabanResponden, Skema } from './tipe';

const LIKERT: Aturan = {
  jenis: 'peta-opsi',
  skorMaks: 5,
  peta: { agree: 4, neutral: 3, 'strongly agree': 5 },
};

function butir(kolomAsal: string): ButirSkema {
  return { kolomAsal, label: kolomAsal, dimensi: 'd', aturan: LIKERT, bobot: 1 };
}

const SKEMA: Skema = {
  skemaId: 'skemaA',
  perlakuanKosong: 'abaikan',
  butir: [butir('q1'), butir('q2')],
};

const META = { sesiId: 's1', namaSesi: 'Pre-Test' };

function responden(
  id: string,
  jawaban: Record<string, string>,
  meta: Record<string, string> = {},
): JawabanResponden & { meta: Record<string, string> } {
  return { id, email: `${id}@example.com`, nama: null, jawaban, meta };
}

describe('bangunNilaiSesi', () => {
  it('memakai skemaId dari skema yang diberikan', () => {
    const sesi = bangunNilaiSesi(META, [responden('a', { q1: 'Agree', q2: 'Agree' })], SKEMA);
    expect(sesi.sesiId).toBe('s1');
    expect(sesi.namaSesi).toBe('Pre-Test');
    expect(sesi.skemaId).toBe('skemaA');
  });

  it('menghitung nilai memakai aggregator', () => {
    const sesi = bangunNilaiSesi(
      META,
      [responden('a', { q1: 'Strongly agree', q2: 'Strongly agree' })],
      SKEMA,
    );
    expect(Number(sesi.nilai.get('a'))).toBeCloseTo(100, 10);
  });

  it('mencatat jumlah kolom kurang, dan tidak mencatat apa pun bila lengkap', () => {
    const sesi = bangunNilaiSesi(
      META,
      [responden('a', { q1: 'Agree', q2: '' }), responden('b', { q1: 'Agree', q2: 'Agree' })],
      SKEMA,
    );
    expect(sesi.kurang.get('a')).toBe(1);
    expect(sesi.kurang.has('b')).toBe(false);
  });

  it('tetap memasukkan responden yang seluruh jawabannya kosong', () => {
    const sesi = bangunNilaiSesi(META, [responden('a', { q1: '', q2: '' })], SKEMA);
    expect(sesi.nilai.has('a')).toBe(true);
    expect(sesi.nilai.get('a')).toBe(null);
    expect(sesi.kurang.get('a')).toBe(2);
  });

  it('membawa peringatan opsi tak dikenal ke dalam sesi', () => {
    const sesi = bangunNilaiSesi(META, [responden('a', { q1: 'Maybe', q2: 'Agree' })], SKEMA);
    const peringatan = sesi.peringatan.get('a');
    expect(peringatan).toBeDefined();
    expect(peringatan?.join(' ')).toContain('q1');
  });

  it('tidak mencatat entri peringatan untuk responden yang bersih', () => {
    const sesi = bangunNilaiSesi(META, [responden('a', { q1: 'Agree', q2: 'Agree' })], SKEMA);
    expect(sesi.peringatan.has('a')).toBe(false);
  });

  it('membawa identitas beserta kolom meta', () => {
    const sesi = bangunNilaiSesi(
      META,
      [responden('a', { q1: 'Agree', q2: 'Agree' }, { Gender: 'female', Age: '20' })],
      SKEMA,
    );
    const identitas = sesi.identitas.get('a');
    expect(identitas?.email).toBe('a@example.com');
    expect(identitas?.meta).toEqual({ Gender: 'female', Age: '20' });
  });

  it('memakai baris terakhir bila id yang sama muncul dua kali', () => {
    // Pemadatan ini disengaja dan terdokumentasi. Deteksi kembarnya milik
    // deteksiEmailKembar, yang dijalankan pada baris mentah sebelum tahap ini.
    const sesi = bangunNilaiSesi(
      META,
      [
        responden('a', { q1: 'Neutral', q2: 'Neutral' }),
        responden('a', { q1: 'Strongly agree', q2: 'Strongly agree' }),
      ],
      SKEMA,
    );
    expect(sesi.nilai.size).toBe(1);
    expect(Number(sesi.nilai.get('a'))).toBeCloseTo(100, 10);
  });

  it('menghasilkan sesi kosong untuk daftar responden kosong', () => {
    const sesi = bangunNilaiSesi(META, [], SKEMA);
    expect(sesi.nilai.size).toBe(0);
    expect(sesi.identitas.size).toBe(0);
    expect(sesi.dipadatkan.size).toBe(0);
  });

  it('mencatat id yang dipadatkan beserta jumlah baris asalnya', () => {
    const sesi = bangunNilaiSesi(
      META,
      [
        responden('a', { q1: 'Neutral', q2: 'Neutral' }),
        responden('b', { q1: 'Agree', q2: 'Agree' }),
        responden('a', { q1: 'Agree', q2: 'Agree' }),
        responden('a', { q1: 'Strongly agree', q2: 'Strongly agree' }),
      ],
      SKEMA,
    );
    expect(sesi.dipadatkan.get('a')).toBe(3);
    expect(sesi.dipadatkan.has('b')).toBe(false);
  });

  it('tidak mencatat pemadatan bila setiap id muncul sekali', () => {
    const sesi = bangunNilaiSesi(
      META,
      [responden('a', { q1: 'Agree', q2: 'Agree' }), responden('b', { q1: 'Agree', q2: 'Agree' })],
      SKEMA,
    );
    expect(sesi.dipadatkan.size).toBe(0);
  });

  it('membuat pemadatan baris-baris tanpa email terlihat', () => {
    const idKosong = idResponden('', hashPalsu);
    const ani = { ...responden(idKosong, { q1: 'Agree', q2: 'Agree' }), email: '', nama: 'Ani' };
    const budi = { ...responden(idKosong, { q1: 'Neutral', q2: 'Neutral' }), email: '  ', nama: 'Budi' };
    expect(idResponden('  ', hashPalsu)).toBe(idKosong);

    const sesi = bangunNilaiSesi(META, [ani, budi], SKEMA);
    expect(sesi.nilai.size).toBe(1);
    expect(sesi.dipadatkan.get(idKosong)).toBe(2);
  });
});
