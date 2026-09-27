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

/**
 * Daftar IZIN, bukan daftar larangan.
 *
 * Versi sebelumnya menyebut tiga modul core yang dilarang. Yang lolos:
 * `../core/merger` — tempat selisih dihitung, justru modul paling berbahaya —
 * lalu `../core/scorer`, `../core/peringkat`, varian berakhiran `.js` atau
 * `.ts`, dan berkas pembantu baru mana pun di `src/io/`. Menambal satu per satu
 * hanya mengejar kebocoran yang kebetulan sudah terpikirkan. Daftar izin
 * menutup seluruh kelasnya sekaligus: modul baru harus ditimbang lebih dulu dan
 * dimasukkan dengan sadar, bukan diterima karena tidak ada yang melarangnya.
 */
const MODUL_DIIZINKAN = [
  'xlsx',
  'jspdf',
  'jspdf-autotable',
  '../core/tabelTampil',
  '../core/tataLetak',
];

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
  // Dua bentuk penguraian yang tidak menyebut nama fungsi apa pun, sehingga
  // ketiga pola di atas melewatkannya. Unary plus dikenali dari apa yang ada
  // di depannya: sesudah `=` `(` `,` `[` `:` `=>` atau `return`, sebuah `+`
  // tidak mungkin penjumlahan.
  {
    pola: /(?:[=(,:[>]|\breturn\b)\s*\+\s*[\w$(]/,
    alasan: 'unary plus mengurai teks menjadi angka — penulis hanya menyalin teks',
  },
  {
    pola: /\*\s*1\b|\b1\s*\*(?![/*])/,
    alasan: 'perkalian dengan 1 mengurai teks menjadi angka — penulis hanya menyalin teks',
  },
  // Backreference agar ketiga jenis kutip tertangkap. Pengisi yang dihitung
  // sebagai pengosongan: string kosong, spasi saja, dan tanda kosong \u2014
  // ketiganya membuat sel yang HILANG tidak lagi terbedakan dari sel yang
  // memang tidak bernilai. Pengisi bermakna seperti 'Tanpa Judul' tetap sah.
  {
    pola: /\?\?\s*(['"`])[\s\u2014]*\1/,
    alasan: 'sel yang hilang harus melempar, bukan dikosongkan diam-diam',
  },
  {
    pola: /\|\|\s*(['"`])[\s\u2014]*\1/,
    alasan: 'sel yang hilang harus melempar, bukan dikosongkan diam-diam',
  },
  // Postfix `!` selalu menempel pada ujung ekspresi tanpa spasi, sedangkan
  // negasi dan `!==` tidak pernah berbentuk begitu.
  {
    pola: /[)\]\w$]!(?!=)/,
    alasan: 'non-null assertion menelan sel yang hilang, padahal sel itu harus melempar',
  },
];

function spesifierDari(isi: string): string[] {
  return POLA_SPESIFIER.flatMap((pola) =>
    [...isi.matchAll(pola)].map((cocok) => {
      const nilai = cocok[1];
      return nilai === undefined ? '' : nilai;
    }),
  );
}

/** Spesifier yang membuat sensor MERAH: apa pun yang tidak disebut daftar izin. */
function diluarIzin(isi: string): string[] {
  return spesifierDari(isi).filter((satu) => !MODUL_DIIZINKAN.includes(satu));
}

describe('penulis ekspor tidak memformat angka', () => {
  it('menemukan kedua berkas penulis untuk diperiksa', () => {
    for (const berkas of PENULIS) {
      expect(() => readFileSync(berkas, 'utf8'), `${berkas} tidak ada`).not.toThrow();
    }
  });

  it('tidak memakai konstruksi yang memformat, mengurai, atau mengosongkan', () => {
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

  it('tidak mengimpor apa pun di luar daftar izin', () => {
    for (const berkas of PENULIS) {
      const isi = readFileSync(berkas, 'utf8');
      expect(
        diluarIzin(isi),
        `${path.relative(process.cwd(), berkas)} mengimpor modul di luar daftar izin — angka yang ` +
          'sudah jadi datang lewat TabelTampil, penulis tidak boleh menempuh jalan lain. Bila ' +
          'modul itu memang perlu, tambahkan ke MODUL_DIIZINKAN dengan sadar.',
      ).toEqual([]);
    }
  });
});

describe('pola penjaga itu sendiri', () => {
  const kena = (isi: string): boolean => TERLARANG.some(({ pola }) => pola.test(isi));

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

  it('menangkap penguraian angka lewat fungsi', () => {
    expect(kena("const a = parseFloat('40,0');")).toBe(true);
    expect(kena("const a = parseInt('40', 10);")).toBe(true);
    expect(kena('const a = Number(sel);')).toBe(true);
  });

  it('menangkap penguraian angka lewat operator, yang tidak menyebut nama fungsi apa pun', () => {
    expect(kena('const a = +sel;')).toBe(true);
    expect(kena('doc.text(+sel, 40, 40);')).toBe(true);
    expect(kena('return +sel;')).toBe(true);
    expect(kena('const deret = [+sel];')).toBe(true);
    expect(kena('const opsi = { startY: +sel };')).toBe(true);
    // Badan arrow function sempat lolos: `=>` berakhir dengan `>`, bukan `=`.
    expect(kena('const angka = (sel: string) => +sel;')).toBe(true);
    expect(kena('const a = sel * 1;')).toBe(true);
    expect(kena('const a = 1 * sel;')).toBe(true);
  });

  it('menangkap pengosongan diam pada ketiga jenis kutip dan ketiga jenis pengisi', () => {
    expect(kena("const a = baris[k] ?? '';")).toBe(true);
    expect(kena('const a = baris[k] ?? "";')).toBe(true);
    expect(kena('const a = baris[k] ?? ``;')).toBe(true);
    expect(kena("const a = baris[k] || '';")).toBe(true);
    // Pengisi selain string kosong berakibat sama: sel yang HILANG berubah
    // menjadi sel yang tampak memang tidak bernilai.
    expect(kena("const a = baris[k] ?? '\u2014';")).toBe(true);
    expect(kena("const a = baris[k] ?? ' ';")).toBe(true);
    expect(kena('const a = baris[k] || "\u2014";')).toBe(true);
  });

  it('menangkap non-null assertion pada pengambilan sel', () => {
    expect(kena('const sel = baris[k]!;')).toBe(true);
    expect(kena('const sel = deret[indeks]!;')).toBe(true);
    expect(kena('potongan.map((k) => satu.kolom[k]!)')).toBe(true);
    expect(kena('const sel = peta.get(k)!;')).toBe(true);
    expect(kena('const panjang = sel!.length;')).toBe(true);
  });

  it('tidak menangkap bentuk sah yang mirip', () => {
    // Math.sign dan Math.abs sah: keduanya tidak membulatkan apa pun.
    expect(kena('const a = Math.sign(x) * Math.abs(y);')).toBe(false);
    // getNumberOfPages bukan pemanggilan Number().
    expect(kena('const n = doc.getNumberOfPages();')).toBe(false);
    // Fallback ke teks bermakna bukan pengosongan diam.
    expect(kena("const a = judul ?? 'Tanpa Judul';")).toBe(false);
    // Penjumlahan dan perangkaian teks tetap boleh.
    expect(kena('const a = awal + akhir;')).toBe(false);
    expect(kena("const pesan = 'awal ' + 'akhir';")).toBe(false);
    expect(kena('for (let n = 1; n <= 20; n += 1) header.push(n);')).toBe(false);
    // Perbandingan dan negasi bukan non-null assertion.
    expect(kena('if (satu !== undefined) return satu;')).toBe(false);
    expect(kena('if (isi!==undefined) return isi;')).toBe(false);
    expect(kena('if (!ada) return null;')).toBe(false);
    expect(kena('return !ada;')).toBe(false);
    // Logical OR biasa bukan pengosongan.
    expect(kena('if (satu === undefined || rencana === undefined) continue;')).toBe(false);
  });

  it('menolak impor di luar daftar izin, termasuk lima bentuk yang dulu lolos', () => {
    expect(diluarIzin("import { hitungSelisih } from '../core/merger';")).toEqual([
      '../core/merger',
    ]);
    expect(diluarIzin("import { skorButir } from '../core/scorer';")).toEqual(['../core/scorer']);
    expect(diluarIzin("import { urutkan } from '../core/peringkat';")).toEqual([
      '../core/peringkat',
    ]);
    expect(diluarIzin("import { formatAngka } from '../core/penyajian.js';")).toEqual([
      '../core/penyajian.js',
    ]);
    expect(diluarIzin("import { bantu } from './bantuAngka';")).toEqual(['./bantuAngka']);
  });

  it('menolak ketiga bentuk impor, bukan hanya yang berpengikat', () => {
    expect(diluarIzin("import type { Kategori } from '../core/kategori';")).toEqual([
      '../core/kategori',
    ]);
    expect(diluarIzin("export { bulatkan } from '../core/penyajian';")).toEqual([
      '../core/penyajian',
    ]);
    expect(diluarIzin("import './efekSamping';")).toEqual(['./efekSamping']);
    expect(diluarIzin("const m = await import('../core/aggregator');")).toEqual([
      '../core/aggregator',
    ]);
  });

  it('membiarkan kelima modul yang memang dibutuhkan penulis', () => {
    const sah =
      "import * as XLSX from 'xlsx';\n" +
      "import { jsPDF } from 'jspdf';\n" +
      "import autoTable from 'jspdf-autotable';\n" +
      "import { pastikanTabelSah } from '../core/tabelTampil';\n" +
      "import type { TabelTampil } from '../core/tabelTampil';\n" +
      "import { rencanakanHalaman } from '../core/tataLetak';\n" +
      "import type { MuatKolom } from '../core/tataLetak';\n";
    // Jumlahnya ikut diperiksa supaya daftar izin tidak terbukti "bersih"
    // hanya karena pembaca spesifier gagal membaca satu baris pun.
    expect(spesifierDari(sah)).toHaveLength(7);
    expect(diluarIzin(sah)).toEqual([]);
  });
});
