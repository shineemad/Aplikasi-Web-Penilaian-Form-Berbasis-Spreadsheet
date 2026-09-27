import { describe, expect, it } from 'vitest';
import { idResponden, normalisasiEmail, normalisasiTeks } from './normalisasi';
import { hashPalsu } from './__fixtures__/hash';

describe('normalisasiTeks', () => {
  it('menyamakan huruf besar-kecil', () => {
    expect(normalisasiTeks('Strongly Agree')).toBe('strongly agree');
    expect(normalisasiTeks('Strongly agree')).toBe('strongly agree');
  });

  it('membuang spasi tepi', () => {
    expect(normalisasiTeks('  Agree  ')).toBe('agree');
  });

  it('merapatkan spasi ganda', () => {
    expect(normalisasiTeks('Sangat   Setuju')).toBe('sangat setuju');
  });

  it('membuang tab dan baris baru', () => {
    expect(normalisasiTeks('\tSetuju\n')).toBe('setuju');
  });

  it('mengembalikan teks kosong untuk masukan berisi spasi saja', () => {
    expect(normalisasiTeks('   ')).toBe('');
  });
});

describe('normalisasiEmail', () => {
  it('menyamakan huruf besar-kecil dan membuang spasi tepi', () => {
    expect(normalisasiEmail(' Budi@Example.COM ')).toBe('budi@example.com');
  });
});

describe('idResponden', () => {
  it('menghasilkan id yang sama untuk email yang hanya beda huruf besar-kecil', () => {
    expect(idResponden('Budi@Example.com', hashPalsu)).toBe(
      idResponden('budi@example.com', hashPalsu),
    );
  });

  it('menghasilkan id yang sama untuk email yang hanya beda spasi tepi', () => {
    expect(idResponden('  budi@example.com  ', hashPalsu)).toBe(
      idResponden('budi@example.com', hashPalsu),
    );
  });

  it('menghasilkan id berbeda untuk email berbeda', () => {
    expect(idResponden('budi@example.com', hashPalsu)).not.toBe(
      idResponden('siti@example.com', hashPalsu),
    );
  });

  it('memotong hash menjadi 16 karakter', () => {
    expect(idResponden('budi@example.com', hashPalsu)).toHaveLength(16);
  });
});
