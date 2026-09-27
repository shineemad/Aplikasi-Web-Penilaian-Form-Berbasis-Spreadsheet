import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Batasan Global 11: penulis ekspor menyalin teks yang sudah jadi dan tidak
// pernah memformat angka. Sebelumnya batasan itu hanya pernah diperiksa sekali
// lewat grep manual, sehingga pelanggaran berikutnya akan lolos diam-diam.

const DIR_IO = path.resolve(process.cwd(), 'src/io');
const PENULIS = ['eksporExcel.ts', 'eksporPdf.ts'].map((nama) => path.join(DIR_IO, nama));

// Bentuk yang sama-sama membawa ketergantungan masuk, disalin dari
// src/core/kemurnian.test.ts supaya kedua penjaga menutup lubang yang sama.
const POLA_SPESIFIER: RegExp[] = [
  /^\s*(?:import|export)\s[^'"]*from\s*['"]([^'"]+)['"]/gm,
  /^\s*import\s*['"]([^'"]+)['"]/gm,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** Modul core yang memutuskan angka. Penulis ekspor tidak boleh menyentuhnya. */
const MODUL_TERLARANG = ['../core/penyajian', '../core/kategori', '../core/aggregator'];

const TERLARANG: { pola: RegExp; alasan: string }[] = [
  { pola: /\btoFixed\s*\(/, alasan: 'pembulatan hanya boleh terjadi di core/penyajian' },
  { pola: /\btoPrecision\s*\(/, alasan: 'pembulatan hanya boleh terjadi di core/penyajian' },
  { pola: /\btoLocaleString\s*\(/, alasan: 'pemisah desimal ditentukan core, bukan lokal mesin' },
  { pola: /\bIntl\./, alasan: 'pemisah desimal ditentukan core, bukan lokal mesin' },
  {
    pola: /\bMath\.(?:round|floor|ceil|trunc)\b/,
    alasan: 'membulatkan di sini membuat angka berkas berbeda dari angka layar',
  },
  { pola: /\bparseFloat\s*\(/, alasan: 'penulis menyalin teks, tidak mengurai angka darinya' },
  { pola: /\bparseInt\s*\(/, alasan: 'penulis menyalin teks, tidak mengurai angka darinya' },
  { pola: /\bNumber\s*\(/, alasan: 'penulis menyalin teks, tidak mengurai angka darinya' },
  // Backreference agar ketiga jenis kutip tertangkap, dan hanya yang benar-benar kosong.
  { pola: /\?\?\s*(['"`])\1/, alasan: 'sel yang hilang harus melempar, bukan dikosongkan diam-diam' },
  { pola: /\|\|\s*(['"`])\1/, alasan: 'sel yang hilang harus melempar, bukan dikosongkan diam-diam' },
];

describe('penulis ekspor tidak memformat angka', () => {
  it('menemukan kedua berkas penulis untuk diperiksa', () => {
    for (const berkas of PENULIS) {
      expect(() => readFileSync(berkas, 'utf8'), `${berkas} tidak ada`).not.toThrow();
    }
  });

  it('tidak memakai konstruksi yang memformat atau mengosongkan', () => {
    for (const berkas of PENULIS) {
      const isi = readFileSync(berkas, 'utf8');
      for (const { pola, alasan } of TERLARANG) {
        expect(
          pola.test(isi),
          `${path.relative(process.cwd(), berkas)} memakai ${pola} — ${alasan}`,
        ).toBe(false);
      }
    }
  });

  it('tidak mengimpor modul core yang memutuskan angka', () => {
    for (const berkas of PENULIS) {
      const isi = readFileSync(berkas, 'utf8');
      for (const pola of POLA_SPESIFIER) {
        for (const cocok of isi.matchAll(pola)) {
          const spesifier = cocok[1];
          expect(
            spesifier !== undefined && MODUL_TERLARANG.includes(spesifier),
            `${path.relative(process.cwd(), berkas)} mengimpor "${spesifier}" — angka yang sudah ` +
              'jadi datang lewat TabelTampil, penulis tidak boleh menghitungnya sendiri',
          ).toBe(false);
        }
      }
    }
  });
});

describe('pola penjaga itu sendiri', () => {
  const kena = (isi: string): boolean => TERLARANG.some(({ pola }) => pola.test(isi));

  const spesifierDari = (isi: string): string[] =>
    POLA_SPESIFIER.flatMap((pola) =>
      [...isi.matchAll(pola)].map((cocok) => {
        const nilai = cocok[1];
        return nilai === undefined ? '' : nilai;
      }),
    );

  it('menangkap pemformatan angka', () => {
    expect(kena('const t = nilai.toFixed(1);')).toBe(true);
    expect(kena('const t = nilai.toPrecision(3);')).toBe(true);
    expect(kena("const t = nilai.toLocaleString('id-ID');")).toBe(true);
    expect(kena("const f = new Intl.NumberFormat('id-ID');")).toBe(true);
  });

  it('menangkap keempat bentuk pembulatan Math', () => {
    expect(kena('const a = Math.round(x);')).toBe(true);
    expect(kena('const a = Math.floor(x);')).toBe(true);
    expect(kena('const a = Math.ceil(x);')).toBe(true);
    expect(kena('const a = Math.trunc(x);')).toBe(true);
  });

  it('menangkap penguraian teks kembali menjadi angka', () => {
    expect(kena("const a = parseFloat('40,0');")).toBe(true);
    expect(kena("const a = parseInt('40', 10);")).toBe(true);
    expect(kena("const a = Number(sel);")).toBe(true);
  });

  it('menangkap pengosongan diam pada ketiga jenis kutip', () => {
    expect(kena("const a = baris[k] ?? '';")).toBe(true);
    expect(kena('const a = baris[k] ?? "";')).toBe(true);
    expect(kena('const a = baris[k] ?? ``;')).toBe(true);
    expect(kena("const a = baris[k] || '';")).toBe(true);
  });

  it('tidak menangkap nama yang kebetulan memuat kata terlarang', () => {
    // Math.sign dan Math.abs sah: keduanya tidak membulatkan apa pun.
    expect(kena('const a = Math.sign(x) * Math.abs(y);')).toBe(false);
    // getNumberOfPages bukan pemanggilan Number().
    expect(kena('const n = doc.getNumberOfPages();')).toBe(false);
    // Fallback ke teks yang BUKAN string kosong bukan pengosongan diam.
    expect(kena("const a = judul ?? 'Tanpa Judul';")).toBe(false);
  });

  it('mengenali impor modul core yang terlarang', () => {
    expect(spesifierDari("import { formatAngka } from '../core/penyajian';")).toContain(
      '../core/penyajian',
    );
    expect(spesifierDari("import type { Kategori } from '../core/kategori';")).toContain(
      '../core/kategori',
    );
    expect(spesifierDari("const m = await import('../core/aggregator');")).toContain(
      '../core/aggregator',
    );
  });

  it('membiarkan impor yang memang dibutuhkan penulis', () => {
    const sah = spesifierDari(
      "import * as XLSX from 'xlsx';\nimport { pastikanTabelSah } from '../core/tabelTampil';\n",
    );
    expect(sah.some((s) => MODUL_TERLARANG.includes(s))).toBe(false);
  });
});
