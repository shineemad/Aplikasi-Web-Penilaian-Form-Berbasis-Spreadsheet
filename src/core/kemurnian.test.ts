import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR_CORE = path.resolve(process.cwd(), 'src/core');

function berkasSumber(dir: string): string[] {
  const hasil: string[] = [];
  for (const entri of readdirSync(dir)) {
    const penuh = path.join(dir, entri);
    if (statSync(penuh).isDirectory()) {
      hasil.push(...berkasSumber(penuh));
      continue;
    }
    if (!entri.endsWith('.ts')) continue;
    if (entri.endsWith('.test.ts')) continue;
    if (penuh.includes('__fixtures__')) continue;
    hasil.push(penuh);
  }
  return hasil;
}

const POLA_IMPOR = /^\s*import\s[^'"]*['"]([^'"]+)['"]/gm;

const TERLARANG: { pola: RegExp; alasan: string }[] = [
  { pola: /\bnew Date\b/, alasan: 'tanggal sekarang membuat hasil tidak dapat diulang' },
  { pola: /\bDate\.now\b/, alasan: 'tanggal sekarang membuat hasil tidak dapat diulang' },
  { pola: /\bMath\.random\b/, alasan: 'angka acak membuat hasil tidak dapat diulang' },
  { pola: /\bfetch\s*\(/, alasan: 'core tidak boleh menyentuh jaringan' },
  { pola: /\bwindow\./, alasan: 'core tidak boleh menyentuh API browser' },
  { pola: /\bdocument\./, alasan: 'core tidak boleh menyentuh API browser' },
  { pola: /google\.script/, alasan: 'core tidak boleh menyentuh Apps Script' },
  { pola: /\?\?\s*0\b/, alasan: 'menyamakan "tidak menjawab" dengan "menjawab nol"' },
  { pola: /\|\|\s*0\b/, alasan: 'menyamakan "tidak menjawab" dengan "menjawab nol"' },
];

describe('kemurnian src/core', () => {
  const daftar = berkasSumber(DIR_CORE);

  it('menemukan setidaknya satu berkas sumber untuk diperiksa', () => {
    expect(daftar.length).toBeGreaterThan(0);
  });

  it('tidak mengimpor apa pun dari luar core', () => {
    for (const berkas of daftar) {
      const isi = readFileSync(berkas, 'utf8');
      for (const cocok of isi.matchAll(POLA_IMPOR)) {
        const spesifier = cocok[1];
        expect(
          spesifier?.startsWith('.'),
          `${path.relative(process.cwd(), berkas)} mengimpor "${spesifier}" dari luar core`,
        ).toBe(true);
      }
    }
  });

  it('tidak memakai konstruksi yang dilarang', () => {
    for (const berkas of daftar) {
      const isi = readFileSync(berkas, 'utf8');
      for (const { pola, alasan } of TERLARANG) {
        expect(
          pola.test(isi),
          `${path.relative(process.cwd(), berkas)} memakai ${pola} — ${alasan}`,
        ).toBe(false);
      }
    }
  });
});
