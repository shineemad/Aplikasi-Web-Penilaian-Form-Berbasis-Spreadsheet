import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR_CORE = path.resolve(process.cwd(), 'src/core');

function diDalamCore(berkas: string, spesifier: string): boolean {
  if (!spesifier.startsWith('.')) return false;
  return path.resolve(path.dirname(berkas), spesifier).startsWith(DIR_CORE);
}

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

// Empat bentuk yang sama-sama membawa ketergantungan masuk. Bentuk yang tidak
// tertangkap di sini adalah lubang pada penjaga, bukan kode yang sah.
const POLA_SPESIFIER: RegExp[] = [
  /^\s*(?:import|export)\s[^'"]*from\s*['"]([^'"]+)['"]/gm,
  /^\s*import\s*['"]([^'"]+)['"]/gm,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const TERLARANG: { pola: RegExp; alasan: string }[] = [
  { pola: /\bnew Date\b/, alasan: 'tanggal sekarang membuat hasil tidak dapat diulang' },
  { pola: /\bDate\.now\b/, alasan: 'tanggal sekarang membuat hasil tidak dapat diulang' },
  { pola: /\bMath\.random\b/, alasan: 'angka acak membuat hasil tidak dapat diulang' },
  { pola: /\bfetch\s*\(/, alasan: 'core tidak boleh menyentuh jaringan' },
  { pola: /\bwindow\./, alasan: 'core tidak boleh menyentuh API browser' },
  { pola: /\bdocument\./, alasan: 'core tidak boleh menyentuh API browser' },
  { pola: /google\.script/, alasan: 'core tidak boleh menyentuh Apps Script' },
  // (?![\w.]) menahan pola ini agar hanya mengenai angka nol yang berdiri sendiri,
  // bukan 0.5, 0x1, atau 0n.
  { pola: /\?\?\s*0(?![\w.])/, alasan: 'menyamakan "tidak menjawab" dengan "menjawab nol"' },
  { pola: /\|\|\s*0(?![\w.])/, alasan: 'menyamakan "tidak menjawab" dengan "menjawab nol"' },
];

describe('kemurnian src/core', () => {
  const daftar = berkasSumber(DIR_CORE);

  it('menemukan setidaknya satu berkas sumber untuk diperiksa', () => {
    expect(daftar.length).toBeGreaterThan(0);
  });

  it('tidak mengimpor apa pun dari luar core', () => {
    for (const berkas of daftar) {
      const isi = readFileSync(berkas, 'utf8');
      for (const pola of POLA_SPESIFIER) {
        for (const cocok of isi.matchAll(pola)) {
          const spesifier = cocok[1];
          expect(
            spesifier !== undefined && diDalamCore(berkas, spesifier),
            `${path.relative(process.cwd(), berkas)} mengimpor "${spesifier}" dari luar core`,
          ).toBe(true);
        }
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

describe('pola penjaga itu sendiri', () => {
  const kenaTerlarang = (isi: string): boolean =>
    TERLARANG.some(({ pola }) => pola.test(isi));

  const spesifierDari = (isi: string): string[] =>
    POLA_SPESIFIER.flatMap((pola) =>
      [...isi.matchAll(pola)].map((cocok) => {
        const nilai = cocok[1];
        return nilai === undefined ? '' : nilai;
      }),
    );

  it('menangkap fallback nol', () => {
    expect(kenaTerlarang('const a = nilai ?? 0;')).toBe(true);
    expect(kenaTerlarang('const a = nilai || 0;')).toBe(true);
  });

  it('tidak menangkap angka lain yang kebetulan diawali nol', () => {
    expect(kenaTerlarang('const a = bobot ?? 0.5;')).toBe(false);
    expect(kenaTerlarang('const a = bobot ?? 0x1;')).toBe(false);
  });

  it('menangkap spesifier dari impor biasa dan impor tipe', () => {
    expect(spesifierDari("import { a } from 'paket-luar';")).toContain('paket-luar');
    expect(spesifierDari("import type { X } from './tipe';")).toContain('./tipe');
  });

  it('menangkap spesifier dari re-export', () => {
    expect(spesifierDari("export { z } from 'zod';")).toContain('zod');
    expect(spesifierDari("export * from 'paket-luar';")).toContain('paket-luar');
  });

  it('menangkap spesifier dari impor efek samping dan impor dinamis', () => {
    expect(spesifierDari("import 'efek-samping';")).toContain('efek-samping');
    expect(spesifierDari("const m = await import('date-fns');")).toContain('date-fns');
  });

  it('menolak impor relatif yang keluar dari core', () => {
    const berkas = path.join(DIR_CORE, 'scorer.ts');
    expect(diDalamCore(berkas, './tipe')).toBe(true);
    expect(diDalamCore(berkas, './__fixtures__/postTest')).toBe(true);
    expect(diDalamCore(berkas, '../io/store')).toBe(false);
    expect(diDalamCore(berkas, 'vitest')).toBe(false);
  });
});
