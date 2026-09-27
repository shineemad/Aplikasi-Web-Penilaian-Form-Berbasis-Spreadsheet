# Rencana Implementasi — Inti Perhitungan FormScoring

> **Untuk pekerja agentik:** SUB-SKILL WAJIB: pakai `subagent-driven-development` (disarankan) atau `executing-plans` untuk mengerjakan rencana ini tugas demi tugas. Langkah memakai sintaks checkbox (`- [ ]`) untuk penanda kemajuan.

**Tujuan:** Membangun `src/core/` — normalisasi, scorer, aggregator, dan merger — sebagai pustaka fungsi murni yang teruji penuh, sehingga seluruh perhitungan nilai dapat dibuktikan benar tanpa browser, tanpa jaringan, dan tanpa Google.

**Arsitektur:** Empat modul berlapis. `normalisasi` tidak bergantung pada apa pun. `scorer` memakai `normalisasi`. `aggregator` memakai `scorer`. `merger` bekerja di atas keluaran `aggregator`. Tidak satu pun mengimpor dari luar `src/core/`; segala sesuatu yang berasal dari dunia luar — termasuk fungsi hash — masuk sebagai argumen.

**Tech Stack:** TypeScript (mode `strict` + `noUncheckedIndexedAccess`), Vitest. Tidak ada React, tidak ada SheetJS, tidak ada Apps Script pada rencana ini.

**Spec:** [docs/superpowers/specs/2026-09-27-formscoring-engine-design.md](../specs/2026-09-27-formscoring-engine-design.md)

## Batasan Global

Berlaku untuk **setiap** tugas di rencana ini. Diambil kata per kata dari spec dan `.github/copilot-instructions.md`.

1. **Berkas di `src/core/` dilarang mengimpor apa pun dari luar `src/core/`.** Termasuk React, API browser, `google.script`, jaringan, `new Date`, `Date.now`, dan `Math.random`. Tugas 2 menegakkan ini secara otomatis.
2. **Dilarang menulis `?? 0` atau `|| 0` di dalam `src/core/`.** Bila butuh nilai awal akumulator, tulis pemeriksaan `=== undefined` secara eksplisit. Tugas 2 menegakkan ini secara otomatis.
3. **Kosong bukan nol.** Jawaban kosong menghasilkan status `kosong`, tidak pernah angka 0.
4. **Opsi tak dikenal menghasilkan peringatan, bukan angka.** Tidak pernah menebak.
5. **Normalisasi sebelum mencocokkan:** buang spasi tepi → rapatkan spasi ganda → huruf kecil.
6. **Istilah domain memakai Bahasa Indonesia** dan tidak diterjemahkan: `Proyek`, `Sesi`, `Responden`, `Skema`, `Penilaian`, `nilai`, `bobot`, `selisih`, `dimensi`. Komentar dan pesan commit juga Bahasa Indonesia.
7. **Tulis uji lebih dulu.** Setiap tugas: uji gagal → implementasi minimal → uji lulus → commit.

## Struktur Berkas

| Berkas | Tanggung jawab tunggal |
| --- | --- |
| `package.json`, `tsconfig.json`, `vitest.config.ts` | Konfigurasi proyek |
| `src/core/tipe.ts` | Seluruh tipe bersama. Tidak ada logika. |
| `src/core/normalisasi.ts` | Merapikan teks, email, dan membentuk id responden |
| `src/core/scorer.ts` | Satu jawaban + satu aturan → satu hasil |
| `src/core/aggregator.ts` | Kumpulan skor → nilai per responden dan indeks per dimensi |
| `src/core/kategori.ts` | Indeks → nama kategori (Sangat Baik, Baik, dan seterusnya) |
| `src/core/merger.ts` | Beberapa sesi → tabel gabungan melebar + ringkasan proyek |
| `src/core/*.test.ts` | Uji, berdampingan dengan berkas yang diujinya |
| `src/core/__fixtures__/postTest.ts` | Replika data nyata Post-Test beserta kejanggalannya |

---

### Tugas 1: Kerangka proyek dan modul normalisasi

**Berkas:**
- Buat: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Buat: `src/core/tipe.ts`
- Buat: `src/core/normalisasi.ts`
- Uji: `src/core/normalisasi.test.ts`

**Antarmuka:**
- Memakai: —
- Menghasilkan: `normalisasiTeks(teks: string): string`, `normalisasiEmail(email: string): string`, `idResponden(email: string, hash: FungsiHash): string`, dan tipe `FungsiHash = (teks: string) => string`.

> **Peringatan keras:** JANGAN jalankan `npm create vite@latest .` di folder ini. Folder sudah berisi PRD, `docs/`, `.github/`, dan `.git`. Vite akan menawarkan menghapus isi folder, dan menerimanya akan menghancurkan spec serta riwayat git. Buat berkas konfigurasi dengan tangan seperti langkah-langkah di bawah. React baru ditambahkan pada Rencana 2.

- [ ] **Langkah 1: Buat `package.json`**

```json
{
  "name": "formscoring-engine",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Langkah 2: Pasang perkakas pengembangan**

```bash
npm install -D typescript vitest @types/node
```

Biarkan npm yang menuliskan nomor versinya. Jangan mengetik versi dengan tangan.

- [ ] **Langkah 3: Buat `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

`noUncheckedIndexedAccess` sengaja dinyalakan. Dengan ini `jawaban["Kolom X"]` bertipe `string | undefined`, sehingga kolom yang tidak ada wajib ditangani dan tidak bisa lolos diam-diam.

`esModuleInterop` diperlukan karena penjaga kemurnian pada Tugas 2 memakai `import path from 'node:path'`, dan modul itu dideklarasikan dengan `export =`. Tanpa opsi ini, `npm run typecheck` akan gagal di Tugas 2.

- [ ] **Langkah 4: Buat `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Langkah 5: Buat `.gitignore`**

```gitignore
node_modules/
dist/
coverage/
*.local
.DS_Store
```

- [ ] **Langkah 6: Tulis uji yang gagal**

Buat `src/core/normalisasi.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { idResponden, normalisasiEmail, normalisasiTeks } from './normalisasi';

// Hash palsu yang deterministik: cukup untuk menguji perilaku idResponden
// tanpa menyeret ketergantungan kriptografi ke dalam core.
const hashPalsu = (teks: string): string =>
  [...teks].map((huruf) => huruf.charCodeAt(0).toString(16)).join('').padEnd(64, '0');

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
```

- [ ] **Langkah 7: Jalankan uji dan pastikan gagal**

```bash
npm test
```

Diharapkan: GAGAL dengan pesan bahwa modul `./normalisasi` tidak ditemukan.

- [ ] **Langkah 8: Buat `src/core/tipe.ts`**

```ts
/** Fungsi hash disuntikkan dari luar agar core tetap murni. */
export type FungsiHash = (teks: string) => string;
```

- [ ] **Langkah 9: Buat `src/core/normalisasi.ts`**

```ts
import type { FungsiHash } from './tipe';

export function normalisasiTeks(teks: string): string {
  return teks.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalisasiEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function idResponden(email: string, hash: FungsiHash): string {
  return hash(normalisasiEmail(email)).slice(0, 16);
}
```

- [ ] **Langkah 10: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, 10 uji.

- [ ] **Langkah 11: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

Diharapkan: tanpa keluaran, keluar dengan kode 0.

- [ ] **Langkah 12: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/core/tipe.ts src/core/normalisasi.ts src/core/normalisasi.test.ts
git commit -m "feat(core): kerangka proyek dan modul normalisasi"
```

---

### Tugas 2: Penjaga kemurnian `core`

**Berkas:**
- Uji: `src/core/kemurnian.test.ts`

**Antarmuka:**
- Memakai: berkas apa pun di `src/core/`
- Menghasilkan: — (hanya penjaga; tidak ada yang mengimpornya)

Tugas ini dikerjakan lebih awal, sebelum modul perhitungan ditulis, supaya setiap tugas berikutnya langsung dijaga. Tanpa penjaga otomatis, satu `import` yang lolos akan menggugurkan seluruh klaim akurasi tanpa ada yang sadar sampai berbulan-bulan kemudian.

- [ ] **Langkah 1: Tulis uji penjaga**

Buat `src/core/kemurnian.test.ts`:

```ts
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
            spesifier?.startsWith('.'),
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
});
```

- [ ] **Langkah 2: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS. Penjaga ini lulus sejak awal karena `normalisasi.ts` dan `tipe.ts` memang sudah bersih.

- [ ] **Langkah 3: Buktikan penjaganya benar-benar menangkap pelanggaran**

Tambahkan baris ini sementara di bagian atas `src/core/normalisasi.ts`:

```ts
const waktu = Date.now();
```

Jalankan `npm test`. Diharapkan: GAGAL dengan pesan `normalisasi.ts memakai /\bDate\.now\b/ — tanggal sekarang membuat hasil tidak dapat diulang`.

Uji yang tidak pernah terlihat gagal bukan uji. Langkah ini membuktikan penjaganya hidup.

- [ ] **Langkah 4: Hapus lagi baris pelanggaran itu**

Hapus `const waktu = Date.now();` dari `src/core/normalisasi.ts`, lalu jalankan `npm test`. Diharapkan: LULUS kembali.

- [ ] **Langkah 5: Commit**

```bash
git add src/core/kemurnian.test.ts
git commit -m "test(core): penjaga otomatis kemurnian modul inti"
```

---

### Tugas 3: Scorer

**Berkas:**
- Ubah: `src/core/tipe.ts`
- Buat: `src/core/scorer.ts`
- Uji: `src/core/scorer.test.ts`

**Antarmuka:**
- Memakai: `normalisasiTeks` dari Tugas 1
- Menghasilkan: `skorJawaban(jawaban: string | null | undefined, aturan: Aturan): HasilSkor` dan `skorMaksAturan(aturan: Aturan): number | null`. Tipe `Aturan`, `HasilSkor`, `PerlakuanKosong`, `ButirSkema`, `Skema`, `JawabanResponden` didefinisikan di `tipe.ts`.

- [ ] **Langkah 1: Tambahkan tipe ke `src/core/tipe.ts`**

Tambahkan di bawah `FungsiHash` yang sudah ada:

```ts
export type Aturan =
  | { jenis: 'peta-opsi'; peta: Record<string, number>; skorMaks: number }
  | { jenis: 'kunci-jawaban'; kunci: string }
  | { jenis: 'manual'; min: number; maks: number }
  | { jenis: 'abaikan' };

export type HasilSkor =
  | { status: 'terhitung'; skor: number }
  | { status: 'kosong' }
  | { status: 'diabaikan' }
  | { status: 'butuh-manual' }
  | { status: 'peringatan'; pesan: string; opsiTakDikenal: string };

export type PerlakuanKosong = 'abaikan' | 'nol';

export interface ButirSkema {
  kolomAsal: string;
  label: string;
  dimensi: string;
  aturan: Aturan;
  bobot: number;
}

export interface Skema {
  skemaId: string;
  butir: ButirSkema[];
  perlakuanKosong: PerlakuanKosong;
}

export interface JawabanResponden {
  id: string;
  email: string;
  nama: string | null;
  /** kolomAsal -> jawaban mentah, apa adanya dari spreadsheet */
  jawaban: Record<string, string>;
}
```

`HasilSkor` sengaja dibuat sebagai union bertanda. Pemanggil dipaksa memikirkan kelima kemungkinan, sehingga "kosong" tidak mungkin tanpa sengaja diperlakukan sama dengan "terhitung skor 0".

- [ ] **Langkah 2: Tulis uji yang gagal**

Buat `src/core/scorer.test.ts`:

```ts
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
```

- [ ] **Langkah 3: Jalankan uji dan pastikan gagal**

```bash
npm test
```

Diharapkan: GAGAL dengan pesan bahwa modul `./scorer` tidak ditemukan.

- [ ] **Langkah 4: Tulis implementasi minimal**

Buat `src/core/scorer.ts`:

```ts
import { normalisasiTeks } from './normalisasi';
import type { Aturan, HasilSkor } from './tipe';

export function skorMaksAturan(aturan: Aturan): number | null {
  switch (aturan.jenis) {
    case 'peta-opsi':
      return aturan.skorMaks;
    case 'kunci-jawaban':
      return 1;
    case 'manual':
      return aturan.maks;
    case 'abaikan':
      return null;
  }
}

export function skorJawaban(
  jawaban: string | null | undefined,
  aturan: Aturan,
): HasilSkor {
  if (aturan.jenis === 'abaikan') return { status: 'diabaikan' };
  if (aturan.jenis === 'manual') return { status: 'butuh-manual' };

  if (jawaban === null || jawaban === undefined) return { status: 'kosong' };

  const bersih = normalisasiTeks(jawaban);
  if (bersih === '') return { status: 'kosong' };

  if (aturan.jenis === 'kunci-jawaban') {
    return { status: 'terhitung', skor: bersih === normalisasiTeks(aturan.kunci) ? 1 : 0 };
  }

  for (const [opsi, skor] of Object.entries(aturan.peta)) {
    if (normalisasiTeks(opsi) === bersih) {
      return { status: 'terhitung', skor };
    }
  }

  return {
    status: 'peringatan',
    opsiTakDikenal: jawaban.trim(),
    pesan: `Opsi "${jawaban.trim()}" tidak ada di peta skala. Lengkapi petanya, atau tandai kolom ini untuk diabaikan.`,
  };
}
```

Kunci peta dinormalisasi saat pencocokan, bukan saat penyimpanan. Ini menambah sedikit kerja tetapi menutup satu kelas kesalahan: skema yang disimpan dengan kunci berhuruf besar tidak akan gagal diam-diam.

- [ ] **Langkah 5: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, seluruh uji scorer dan uji sebelumnya.

- [ ] **Langkah 6: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

Diharapkan: tanpa keluaran, keluar dengan kode 0.

- [ ] **Langkah 7: Commit**

```bash
git add src/core/tipe.ts src/core/scorer.ts src/core/scorer.test.ts
git commit -m "feat(core): scorer dengan normalisasi dan peringatan opsi tak dikenal"
```

---

### Tugas 4: Aggregator

**Berkas:**
- Buat: `src/core/aggregator.ts`
- Uji: `src/core/aggregator.test.ts`

**Antarmuka:**
- Memakai: `skorJawaban`, `skorMaksAturan` dari Tugas 3; tipe `Skema`, `JawabanResponden`
- Menghasilkan:
  - `hitungNilaiResponden(responden: JawabanResponden, skema: Skema): HasilNilaiResponden`
  - `hitungIndeksDimensi(semuaResponden: JawabanResponden[], skema: Skema): HasilIndeksDimensi[]`
  - `hitungIndeksKeseluruhan(hasilDimensi: HasilIndeksDimensi[], skema: Skema): number | null`
  - Antarmuka `HasilNilaiResponden` dan `HasilIndeksDimensi` diekspor dari `aggregator.ts`.

- [ ] **Langkah 1: Tulis uji yang gagal**

Buat `src/core/aggregator.test.ts`:

```ts
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
    expect(hasil.nilai).toBe(100);
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
    expect(hasil.nilai).toBe(20);
  });

  it('mengeluarkan butir kosong dari perhitungan bila perlakuannya abaikan', () => {
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Strongly agree', q2: '', q3: 'Strongly agree' }),
      skemaLikert('abaikan'),
    );
    expect(hasil.nilai).toBe(100);
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
    expect(hasil.nilai).toBe(100);
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
    expect(hitungNilaiResponden(responden('a', jawaban), kecil).nilai).toBe(
      hitungNilaiResponden(responden('a', jawaban), besar).nilai,
    );
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
    expect(hasil.nilai).toBe(100);
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
    expect(hasil[0]?.indeks).toBe(100);
    expect(hasil[0]?.pasanganDihitung).toBe(4);
  });

  it('memberi 20 persen bila seluruh jawaban minimum', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: 'Strongly disagree', q2: 'Strongly disagree', q3: 'Strongly disagree' })],
      skemaLikert('abaikan'),
    );
    expect(hasil[0]?.indeks).toBe(20);
  });

  it('mengecilkan penyebut saat jawaban kosong diabaikan', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: 'Strongly agree', q2: '', q3: 'Strongly agree' })],
      skemaLikert('abaikan'),
    );
    expect(hasil[0]?.indeks).toBe(100);
    expect(hasil[0]?.pasanganDihitung).toBe(1);
  });

  it('menurunkan indeks saat jawaban kosong dihitung nol', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: 'Strongly agree', q2: '', q3: 'Strongly agree' })],
      skemaLikert('nol'),
    );
    // (5 + 0) / (5 + 5) x 100
    expect(hasil[0]?.indeks).toBe(50);
    expect(hasil[0]?.pasanganDihitung).toBe(2);
  });

  it('mengeluarkan butir berperingatan dari pembilang dan penyebut', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: 'Strongly agree', q2: 'Maybe', q3: 'Strongly agree' })],
      skemaLikert('nol'),
    );
    expect(hasil[0]?.indeks).toBe(100);
    expect(hasil[0]?.pasanganDihitung).toBe(1);
  });

  it('mengembalikan indeks null bila dimensi tidak punya pasangan terhitung', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: '', q2: '', q3: 'Strongly agree' })],
      skemaLikert('abaikan'),
    );
    expect(hasil[0]?.indeks).toBe(null);
    expect(hasil[1]?.indeks).toBe(100);
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
    expect(hasil).toBe(80);
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
```

- [ ] **Langkah 2: Jalankan uji dan pastikan gagal**

```bash
npm test
```

Diharapkan: GAGAL dengan pesan bahwa modul `./aggregator` tidak ditemukan.

- [ ] **Langkah 3: Tulis implementasi minimal**

Buat `src/core/aggregator.ts`:

```ts
import { skorJawaban, skorMaksAturan } from './scorer';
import type { JawabanResponden, Skema } from './tipe';

export interface HasilNilaiResponden {
  respondenId: string;
  /** Skala 0–100. `null` bila tidak ada satu pun butir yang dapat dihitung. */
  nilai: number | null;
  butirTerhitung: number;
  butirKosong: number;
  peringatan: string[];
}

export interface HasilIndeksDimensi {
  dimensi: string;
  /** Persentase 0–100. `null` bila tidak ada pasangan yang dihitung. */
  indeks: number | null;
  /** Jumlah pasangan (responden, butir) yang benar-benar masuk perhitungan. */
  pasanganDihitung: number;
}

export function hitungNilaiResponden(
  responden: JawabanResponden,
  skema: Skema,
): HasilNilaiResponden {
  let totalBobot = 0;
  let totalTerbobot = 0;
  let butirTerhitung = 0;
  let butirKosong = 0;
  const peringatan: string[] = [];

  for (const butir of skema.butir) {
    const skorMaks = skorMaksAturan(butir.aturan);
    if (skorMaks === null) continue;

    const hasil = skorJawaban(responden.jawaban[butir.kolomAsal], butir.aturan);

    if (hasil.status === 'peringatan') {
      peringatan.push(`${butir.label}: ${hasil.pesan}`);
      continue;
    }
    if (hasil.status === 'butuh-manual' || hasil.status === 'diabaikan') continue;

    if (hasil.status === 'kosong') {
      butirKosong += 1;
      if (skema.perlakuanKosong === 'abaikan') continue;
      totalBobot += butir.bobot;
      continue;
    }

    butirTerhitung += 1;
    totalBobot += butir.bobot;
    totalTerbobot += butir.bobot * (hasil.skor / skorMaks);
  }

  const nilai = totalBobot === 0 ? null : (totalTerbobot / totalBobot) * 100;
  return { respondenId: responden.id, nilai, butirTerhitung, butirKosong, peringatan };
}

interface Akumulasi {
  jumlahSkor: number;
  jumlahMaks: number;
  pasangan: number;
}

export function hitungIndeksDimensi(
  semuaResponden: JawabanResponden[],
  skema: Skema,
): HasilIndeksDimensi[] {
  const urutanDimensi: string[] = [];
  const akumulasi = new Map<string, Akumulasi>();

  for (const butir of skema.butir) {
    const skorMaks = skorMaksAturan(butir.aturan);
    if (skorMaks === null) continue;
    if (butir.aturan.jenis === 'manual') continue;

    if (!akumulasi.has(butir.dimensi)) {
      urutanDimensi.push(butir.dimensi);
      akumulasi.set(butir.dimensi, { jumlahSkor: 0, jumlahMaks: 0, pasangan: 0 });
    }
    const agg = akumulasi.get(butir.dimensi);
    if (agg === undefined) continue;

    for (const responden of semuaResponden) {
      const hasil = skorJawaban(responden.jawaban[butir.kolomAsal], butir.aturan);

      if (hasil.status === 'terhitung') {
        agg.jumlahSkor += hasil.skor;
        agg.jumlahMaks += skorMaks;
        agg.pasangan += 1;
        continue;
      }
      if (hasil.status === 'kosong' && skema.perlakuanKosong === 'nol') {
        agg.jumlahMaks += skorMaks;
        agg.pasangan += 1;
      }
    }
  }

  return urutanDimensi.map((dimensi) => {
    const agg = akumulasi.get(dimensi);
    if (agg === undefined || agg.jumlahMaks === 0) {
      return { dimensi, indeks: null, pasanganDihitung: 0 };
    }
    return {
      dimensi,
      indeks: (agg.jumlahSkor / agg.jumlahMaks) * 100,
      pasanganDihitung: agg.pasangan,
    };
  });
}

export function hitungIndeksKeseluruhan(
  hasilDimensi: HasilIndeksDimensi[],
  skema: Skema,
): number | null {
  const bobotDimensi = new Map<string, number>();
  for (const butir of skema.butir) {
    if (butir.aturan.jenis === 'abaikan' || butir.aturan.jenis === 'manual') continue;
    const sekarang = bobotDimensi.get(butir.dimensi);
    bobotDimensi.set(butir.dimensi, (sekarang === undefined ? 0 : sekarang) + butir.bobot);
  }

  let totalBobot = 0;
  let total = 0;
  for (const hasil of hasilDimensi) {
    if (hasil.indeks === null) continue;
    const bobot = bobotDimensi.get(hasil.dimensi);
    if (bobot === undefined) continue;
    totalBobot += bobot;
    total += bobot * hasil.indeks;
  }

  return totalBobot === 0 ? null : total / totalBobot;
}
```

Penyebut indeks ditulis sebagai `jumlahMaks`, yaitu penjumlahan skor maksimum dari pasangan yang benar-benar dihitung. Bentuk ini setara dengan $|T_d| \cdot s^{\max}$ pada spec ketika seluruh butir sedimensi punya skor maksimum sama, tetapi tetap benar ketika tidak.

- [ ] **Langkah 4: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, seluruh uji aggregator dan uji sebelumnya.

- [ ] **Langkah 5: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

Diharapkan: tanpa keluaran, keluar dengan kode 0.

- [ ] **Langkah 6: Commit**

```bash
git add src/core/aggregator.ts src/core/aggregator.test.ts
git commit -m "feat(core): aggregator nilai responden dan indeks per dimensi"
```

---

### Tugas 5: Merger

**Berkas:**
- Buat: `src/core/merger.ts`
- Uji: `src/core/merger.test.ts`

**Antarmuka:**
- Memakai: — (bekerja di atas nilai yang sudah dihitung Tugas 4, diterima sebagai argumen)
- Menghasilkan:
  - `gabungkanSesi(daftarSesi: NilaiSesi[], pembanding?: Pembanding): HasilGabungan`
  - `ringkasProyek(hasil: HasilGabungan, daftarSesi: NilaiSesi[]): RingkasanProyek`
  - Antarmuka `NilaiSesi`, `Pembanding`, `BarisGabungan`, `HasilGabungan`, `RingkasanProyek` diekspor dari `merger.ts`.

- [ ] **Langkah 1: Tulis uji yang gagal**

Buat `src/core/merger.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { gabungkanSesi, ringkasProyek } from './merger';
import type { NilaiSesi } from './merger';

function sesi(
  sesiId: string,
  namaSesi: string,
  skemaId: string,
  isi: Record<string, { nilai: number | null; email: string; nama: string | null }>,
): NilaiSesi {
  const nilai = new Map<string, number | null>();
  const identitas = new Map<string, { email: string; nama: string | null }>();
  for (const [id, data] of Object.entries(isi)) {
    nilai.set(id, data.nilai);
    identitas.set(id, { email: data.email, nama: data.nama });
  }
  return { sesiId, namaSesi, skemaId, nilai, identitas };
}

const PRE = sesi('s1', 'Pre-Test', 'skemaA', {
  budi: { nilai: 40, email: 'budi@example.com', nama: 'Budi' },
  siti: { nilai: 60, email: 'siti@example.com', nama: null },
});

const POST = sesi('s2', 'Post-Test', 'skemaA', {
  budi: { nilai: 80, email: 'budi@example.com', nama: 'Budi' },
  andi: { nilai: 70, email: 'andi@example.com', nama: 'Andi' },
});

const PEMBANDING = { awal: 's1', akhir: 's2' };

describe('gabungkanSesi', () => {
  it('menghitung selisih untuk responden yang ikut kedua sesi', () => {
    const { baris } = gabungkanSesi([PRE, POST], PEMBANDING);
    const budi = baris.find((b) => b.id === 'budi');
    expect(budi?.statusGabungan).toBe('lengkap');
    expect(budi?.selisih).toBe(40);
    expect(budi?.nilaiPerSesi['s1']).toBe(40);
    expect(budi?.nilaiPerSesi['s2']).toBe(80);
  });

  it('tetap memunculkan responden yang hanya ikut satu sesi', () => {
    const { baris } = gabungkanSesi([PRE, POST], PEMBANDING);
    expect(baris.map((b) => b.id).sort()).toEqual(['andi', 'budi', 'siti']);
  });

  it('mengosongkan nilai sesi yang tidak diikuti — bukan mengisinya nol', () => {
    const { baris } = gabungkanSesi([PRE, POST], PEMBANDING);
    const andi = baris.find((b) => b.id === 'andi');
    expect(andi?.nilaiPerSesi['s1']).toBe(null);
    expect(andi?.nilaiPerSesi['s1']).not.toBe(0);
    expect(andi?.statusPerSesi['s1']).toBe('tidak ikut');
    expect(andi?.statusPerSesi['s2']).toBe('ikut');
  });

  it('menandai responden yang hanya ikut sebagian sesi', () => {
    const { baris } = gabungkanSesi([PRE, POST], PEMBANDING);
    expect(baris.find((b) => b.id === 'andi')?.statusGabungan).toBe('sebagian:Post-Test');
    expect(baris.find((b) => b.id === 'siti')?.statusGabungan).toBe('sebagian:Pre-Test');
  });

  it('mengosongkan selisih bila salah satu nilai pembanding tidak ada', () => {
    const { baris } = gabungkanSesi([PRE, POST], PEMBANDING);
    expect(baris.find((b) => b.id === 'andi')?.selisih).toBe(null);
    expect(baris.find((b) => b.id === 'siti')?.selisih).toBe(null);
  });

  it('mengambil identitas dari sesi paling awal yang memuat orang tersebut', () => {
    const { baris } = gabungkanSesi([PRE, POST], PEMBANDING);
    expect(baris.find((b) => b.id === 'siti')?.nama).toBe(null);
    expect(baris.find((b) => b.id === 'budi')?.email).toBe('budi@example.com');
  });

  it('tetap membentuk tabel tanpa kolom selisih bila pembanding tidak ditetapkan', () => {
    const { baris } = gabungkanSesi([PRE, POST]);
    expect(baris).toHaveLength(3);
    for (const b of baris) {
      expect(b.selisih).toBe(null);
    }
  });

  it('memperingatkan bila dua sesi pembanding memakai skema berbeda', () => {
    const postLain = { ...POST, skemaId: 'skemaB' };
    const { peringatan } = gabungkanSesi([PRE, postLain], PEMBANDING);
    expect(peringatan).toHaveLength(1);
    expect(peringatan.join(' ')).toContain('skema');
  });

  it('tidak memperingatkan bila kedua sesi pembanding memakai skema sama', () => {
    const { peringatan } = gabungkanSesi([PRE, POST], PEMBANDING);
    expect(peringatan).toHaveLength(0);
  });

  it('mempertahankan urutan sesi pada kolom', () => {
    const TENGAH = sesi('s3', 'Tes Tengah', 'skemaA', {
      budi: { nilai: 60, email: 'budi@example.com', nama: 'Budi' },
    });
    const { urutanSesi } = gabungkanSesi([PRE, TENGAH, POST], PEMBANDING);
    expect(urutanSesi.map((s) => s.sesiId)).toEqual(['s1', 's3', 's2']);
  });
});

describe('ringkasProyek', () => {
  it('menghitung rata-rata selisih hanya dari responden berstatus lengkap', () => {
    const hasil = gabungkanSesi([PRE, POST], PEMBANDING);
    const ringkasan = ringkasProyek(hasil, [PRE, POST]);
    // Hanya Budi yang lengkap, selisihnya 40.
    expect(ringkasan.jumlahLengkap).toBe(1);
    expect(ringkasan.rataSelisih).toBe(40);
  });

  it('menghitung rata-rata nilai per sesi', () => {
    const hasil = gabungkanSesi([PRE, POST], PEMBANDING);
    const ringkasan = ringkasProyek(hasil, [PRE, POST]);
    expect(ringkasan.perSesi[0]?.rataNilai).toBe(50);
    expect(ringkasan.perSesi[0]?.jumlahResponden).toBe(2);
    expect(ringkasan.perSesi[1]?.rataNilai).toBe(75);
  });

  it('mengembalikan rataSelisih null bila tidak ada responden lengkap', () => {
    const postKosong = sesi('s2', 'Post-Test', 'skemaA', {});
    const hasil = gabungkanSesi([PRE, postKosong], PEMBANDING);
    const ringkasan = ringkasProyek(hasil, [PRE, postKosong]);
    expect(ringkasan.jumlahLengkap).toBe(0);
    expect(ringkasan.rataSelisih).toBe(null);
  });

  it('melaporkan jumlah responden yang tidak berpasangan', () => {
    const hasil = gabungkanSesi([PRE, POST], PEMBANDING);
    const ringkasan = ringkasProyek(hasil, [PRE, POST]);
    expect(ringkasan.jumlahTidakLengkap).toBe(2);
  });
});
```

- [ ] **Langkah 2: Jalankan uji dan pastikan gagal**

```bash
npm test
```

Diharapkan: GAGAL dengan pesan bahwa modul `./merger` tidak ditemukan.

- [ ] **Langkah 3: Tulis implementasi minimal**

Buat `src/core/merger.ts`:

```ts
export interface NilaiSesi {
  sesiId: string;
  namaSesi: string;
  skemaId: string;
  /** respondenId -> nilai akhir sesi itu */
  nilai: Map<string, number | null>;
  /** respondenId -> identitas sebagaimana tercatat di sesi itu */
  identitas: Map<string, { email: string; nama: string | null }>;
}

export interface Pembanding {
  awal: string;
  akhir: string;
}

export interface BarisGabungan {
  id: string;
  email: string;
  nama: string | null;
  /** sesiId -> nilai, atau null bila tidak ikut */
  nilaiPerSesi: Record<string, number | null>;
  /** sesiId -> penanda keikutsertaan */
  statusPerSesi: Record<string, 'ikut' | 'tidak ikut'>;
  /** null bila pembanding tidak ditetapkan atau salah satu nilainya tidak ada */
  selisih: number | null;
  /** 'lengkap' atau 'sebagian:<nama sesi yang diikuti, dipisah koma>' */
  statusGabungan: string;
}

export interface HasilGabungan {
  baris: BarisGabungan[];
  urutanSesi: { sesiId: string; namaSesi: string }[];
  peringatan: string[];
}

export interface RingkasanProyek {
  perSesi: {
    sesiId: string;
    namaSesi: string;
    jumlahResponden: number;
    rataNilai: number | null;
  }[];
  jumlahLengkap: number;
  jumlahTidakLengkap: number;
  /** Dihitung HANYA dari responden berstatus lengkap. */
  rataSelisih: number | null;
}

export function gabungkanSesi(
  daftarSesi: NilaiSesi[],
  pembanding?: Pembanding,
): HasilGabungan {
  const peringatan: string[] = [];

  if (pembanding !== undefined) {
    const awal = daftarSesi.find((s) => s.sesiId === pembanding.awal);
    const akhir = daftarSesi.find((s) => s.sesiId === pembanding.akhir);
    if (awal !== undefined && akhir !== undefined && awal.skemaId !== akhir.skemaId) {
      peringatan.push(
        `Sesi "${awal.namaSesi}" dan "${akhir.namaSesi}" memakai skema berbeda. ` +
          'Selisihnya tetap bisa dihitung, tetapi belum tentu bermakna. Periksa sebelum mengekspor.',
      );
    }
  }

  const semuaId: string[] = [];
  for (const s of daftarSesi) {
    for (const id of s.nilai.keys()) {
      if (!semuaId.includes(id)) semuaId.push(id);
    }
  }

  const baris = semuaId.map((id) => {
    const nilaiPerSesi: Record<string, number | null> = {};
    const statusPerSesi: Record<string, 'ikut' | 'tidak ikut'> = {};
    const sesiDiikuti: string[] = [];

    let email = '';
    let nama: string | null = null;
    let identitasTerisi = false;

    for (const s of daftarSesi) {
      const ikut = s.nilai.has(id);
      statusPerSesi[s.sesiId] = ikut ? 'ikut' : 'tidak ikut';

      if (!ikut) {
        nilaiPerSesi[s.sesiId] = null;
        continue;
      }

      sesiDiikuti.push(s.namaSesi);
      const nilai = s.nilai.get(id);
      nilaiPerSesi[s.sesiId] = nilai === undefined ? null : nilai;

      if (!identitasTerisi) {
        const data = s.identitas.get(id);
        if (data !== undefined) {
          email = data.email;
          nama = data.nama;
          identitasTerisi = true;
        }
      }
    }

    const lengkap = sesiDiikuti.length === daftarSesi.length;
    const statusGabungan = lengkap ? 'lengkap' : `sebagian:${sesiDiikuti.join(',')}`;

    let selisih: number | null = null;
    if (pembanding !== undefined) {
      const awal = nilaiPerSesi[pembanding.awal];
      const akhir = nilaiPerSesi[pembanding.akhir];
      if (awal !== null && awal !== undefined && akhir !== null && akhir !== undefined) {
        selisih = akhir - awal;
      }
    }

    return { id, email, nama, nilaiPerSesi, statusPerSesi, selisih, statusGabungan };
  });

  return {
    baris,
    urutanSesi: daftarSesi.map((s) => ({ sesiId: s.sesiId, namaSesi: s.namaSesi })),
    peringatan,
  };
}

export function ringkasProyek(
  hasil: HasilGabungan,
  daftarSesi: NilaiSesi[],
): RingkasanProyek {
  const perSesi = daftarSesi.map((s) => {
    const angka: number[] = [];
    for (const nilai of s.nilai.values()) {
      if (nilai !== null) angka.push(nilai);
    }
    const jumlah = angka.reduce((a, b) => a + b, 0);
    return {
      sesiId: s.sesiId,
      namaSesi: s.namaSesi,
      jumlahResponden: s.nilai.size,
      rataNilai: angka.length === 0 ? null : jumlah / angka.length,
    };
  });

  const lengkap = hasil.baris.filter((b) => b.statusGabungan === 'lengkap');
  const selisihLengkap: number[] = [];
  for (const b of lengkap) {
    if (b.selisih !== null) selisihLengkap.push(b.selisih);
  }
  const jumlahSelisih = selisihLengkap.reduce((a, b) => a + b, 0);

  return {
    perSesi,
    jumlahLengkap: lengkap.length,
    jumlahTidakLengkap: hasil.baris.length - lengkap.length,
    rataSelisih: selisihLengkap.length === 0 ? null : jumlahSelisih / selisihLengkap.length,
  };
}
```

`rataSelisih` sengaja hanya menyaring baris berstatus `lengkap`. Memasukkan peserta yang hanya mengikuti satu tes akan menghasilkan angka peningkatan yang menyesatkan, dan itu persis jenis kesalahan yang paling sulit terdeteksi karena hasilnya tetap terlihat masuk akal.

- [ ] **Langkah 4: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, seluruh uji merger dan uji sebelumnya.

- [ ] **Langkah 5: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

Diharapkan: tanpa keluaran, keluar dengan kode 0.

- [ ] **Langkah 6: Commit**

```bash
git add src/core/merger.ts src/core/merger.test.ts
git commit -m "feat(core): merger lintas sesi dengan penandaan dan ringkasan proyek"
```

---

### Tugas 6: Kategori interpretasi

**Berkas:**
- Buat: `src/core/kategori.ts`
- Uji: `src/core/kategori.test.ts`

**Antarmuka:**
- Memakai: —
- Menghasilkan: `kategoriIndeks(indeks: number | null, kategori?: Kategori[]): string | null`, konstanta `KATEGORI_BAWAAN`, dan antarmuka `Kategori` — semuanya diekspor dari `kategori.ts`.

Ini memenuhi §8.3 spec. Penetapan kategori adalah perhitungan murni, jadi tempatnya di `core`, bukan di lapisan tampilan. Menaruhnya di tampilan akan membuat berkas ekspor dan layar berpotensi menampilkan kategori berbeda untuk angka yang sama.

- [ ] **Langkah 1: Tulis uji yang gagal**

Buat `src/core/kategori.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { KATEGORI_BAWAAN, kategoriIndeks } from './kategori';
import type { Kategori } from './kategori';

describe('kategoriIndeks dengan kategori bawaan', () => {
  it('memberi Sangat Baik untuk 100', () => {
    expect(kategoriIndeks(100)).toBe('Sangat Baik');
  });

  it('memperlakukan batas bawah sebagai inklusif', () => {
    expect(kategoriIndeks(81)).toBe('Sangat Baik');
    expect(kategoriIndeks(61)).toBe('Baik');
    expect(kategoriIndeks(41)).toBe('Cukup');
    expect(kategoriIndeks(21)).toBe('Kurang');
  });

  it('memberi kategori di bawahnya untuk angka tepat di bawah batas', () => {
    expect(kategoriIndeks(80.9)).toBe('Baik');
    expect(kategoriIndeks(60.9)).toBe('Cukup');
  });

  it('memberi Sangat Kurang untuk batas bawah skala Likert', () => {
    // Seluruh butir dijawab minimum menghasilkan 20 persen, bukan 0 persen.
    expect(kategoriIndeks(20)).toBe('Sangat Kurang');
    expect(kategoriIndeks(0)).toBe('Sangat Kurang');
  });

  it('mengembalikan null untuk indeks null', () => {
    expect(kategoriIndeks(null)).toBe(null);
  });
});

describe('kategoriIndeks dengan kategori pilihan admin', () => {
  const kustom: Kategori[] = [
    { batasBawah: 0, nama: 'Perlu Perbaikan' },
    { batasBawah: 50, nama: 'Memadai' },
    { batasBawah: 90, nama: 'Unggul' },
  ];

  it('memakai daftar yang diberikan, bukan bawaan', () => {
    expect(kategoriIndeks(95, kustom)).toBe('Unggul');
    expect(kategoriIndeks(50, kustom)).toBe('Memadai');
    expect(kategoriIndeks(10, kustom)).toBe('Perlu Perbaikan');
  });

  it('tidak bergantung pada urutan daftar yang diberikan', () => {
    const acak: Kategori[] = [kustom[1], kustom[2], kustom[0]].filter(
      (k): k is Kategori => k !== undefined,
    );
    expect(kategoriIndeks(95, acak)).toBe('Unggul');
    expect(kategoriIndeks(10, acak)).toBe('Perlu Perbaikan');
  });

  it('tidak mengubah daftar yang diberikan', () => {
    const salinan = [...kustom];
    kategoriIndeks(95, kustom);
    expect(kustom).toEqual(salinan);
  });
});

describe('KATEGORI_BAWAAN', () => {
  it('memuat lima kategori sesuai spec', () => {
    expect(KATEGORI_BAWAAN.map((k) => k.nama)).toEqual([
      'Sangat Baik',
      'Baik',
      'Cukup',
      'Kurang',
      'Sangat Kurang',
    ]);
  });
});
```

- [ ] **Langkah 2: Jalankan uji dan pastikan gagal**

```bash
npm test
```

Diharapkan: GAGAL dengan pesan bahwa modul `./kategori` tidak ditemukan.

- [ ] **Langkah 3: Tulis implementasi minimal**

Buat `src/core/kategori.ts`:

```ts
export interface Kategori {
  /** Batas bawah inklusif, dalam persen. */
  batasBawah: number;
  nama: string;
}

export const KATEGORI_BAWAAN: Kategori[] = [
  { batasBawah: 81, nama: 'Sangat Baik' },
  { batasBawah: 61, nama: 'Baik' },
  { batasBawah: 41, nama: 'Cukup' },
  { batasBawah: 21, nama: 'Kurang' },
  { batasBawah: 0, nama: 'Sangat Kurang' },
];

export function kategoriIndeks(
  indeks: number | null,
  kategori: Kategori[] = KATEGORI_BAWAAN,
): string | null {
  if (indeks === null) return null;

  const menurun = [...kategori].sort((a, b) => b.batasBawah - a.batasBawah);
  for (const satuan of menurun) {
    if (indeks >= satuan.batasBawah) return satuan.nama;
  }
  return null;
}
```

Daftar disalin sebelum diurutkan (`[...kategori]`) supaya pemanggil tidak kaget karena daftarnya berubah urutan di tempat.

- [ ] **Langkah 4: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, seluruh uji kategori dan uji sebelumnya.

- [ ] **Langkah 5: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

Diharapkan: tanpa keluaran, keluar dengan kode 0.

- [ ] **Langkah 6: Commit**

```bash
git add src/core/kategori.ts src/core/kategori.test.ts
git commit -m "feat(core): kategori interpretasi indeks"
```

---

### Tugas 7: Uji integrasi dengan data nyata Post-Test

**Berkas:**
- Buat: `src/core/__fixtures__/postTest.ts`
- Uji: `src/core/integrasi.test.ts`

**Antarmuka:**
- Memakai: seluruh keluaran Tugas 1 sampai 5
- Menghasilkan: — (uji ujung ke ujung; tidak ada yang mengimpornya)

Tugas-tugas sebelumnya menguji setiap modul dengan contoh yang rapi. Tugas ini menyatukannya memakai replika instrumen sungguhan, lengkap dengan tiga kejanggalan yang ditemukan saat perancangan: penulisan `"Strongly Agree"` yang tidak konsisten, butir Yes/No/Maybe di tengah skema Likert, dan kolom nama yang boleh kosong.

- [ ] **Langkah 1: Buat fixture**

Buat `src/core/__fixtures__/postTest.ts`:

```ts
import type { Aturan, ButirSkema, Skema } from '../tipe';

export const LIKERT_5: Aturan = {
  jenis: 'peta-opsi',
  skorMaks: 5,
  peta: {
    'Strongly disagree': 1,
    Disagree: 2,
    Neutral: 3,
    Agree: 4,
    // Kunci sengaja ditulis dengan A besar, seperti pada instrumen asli,
    // untuk membuktikan pencocokan tidak bergantung pada huruf besar-kecil.
    'Strongly Agree': 5,
  },
};

const DIMENSI: { dimensi: string; jumlah: number }[] = [
  { dimensi: 'kebermanfaatan', jumlah: 5 },
  { dimensi: 'kemudahan', jumlah: 5 },
  { dimensi: 'dayaTarik', jumlah: 4 },
  { dimensi: 'relevansi', jumlah: 3 },
  { dimensi: 'kepuasan', jumlah: 3 },
];

function bangunButir(): ButirSkema[] {
  const butir: ButirSkema[] = [];
  let nomor = 1;
  for (const { dimensi, jumlah } of DIMENSI) {
    for (let i = 0; i < jumlah; i += 1) {
      butir.push({
        kolomAsal: `q${nomor}`,
        label: `Butir ${nomor}`,
        dimensi,
        aturan: LIKERT_5,
        bobot: 1,
      });
      nomor += 1;
    }
  }
  return butir;
}

/** Skema 20 butir sesuai instrumen Post-Test "Sahabat Hijaiyah". */
export function skemaPostTest(perlakuanKosong: 'abaikan' | 'nol'): Skema {
  return { skemaId: 'postTest', perlakuanKosong, butir: bangunButir() };
}

/** Jawaban seragam untuk seluruh 20 butir. */
export function jawabanSeragam(opsi: string): Record<string, string> {
  const jawaban: Record<string, string> = {};
  for (let nomor = 1; nomor <= 20; nomor += 1) {
    jawaban[`q${nomor}`] = opsi;
  }
  return jawaban;
}
```

- [ ] **Langkah 2: Tulis uji integrasi**

Buat `src/core/integrasi.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  hitungIndeksDimensi,
  hitungIndeksKeseluruhan,
  hitungNilaiResponden,
} from './aggregator';
import { gabungkanSesi, ringkasProyek } from './merger';
import type { NilaiSesi } from './merger';
import { idResponden } from './normalisasi';
import { jawabanSeragam, skemaPostTest } from './__fixtures__/postTest';
import type { JawabanResponden } from './tipe';

const hashPalsu = (teks: string): string =>
  [...teks].map((huruf) => huruf.charCodeAt(0).toString(16)).join('').padEnd(64, '0');

function buatResponden(email: string, nama: string | null, jawaban: Record<string, string>): JawabanResponden {
  return { id: idResponden(email, hashPalsu), email, nama, jawaban };
}

describe('instrumen Post-Test nyata', () => {
  it('memberi nilai 100 untuk responden yang menjawab "Strongly Agree" di semua butir', () => {
    const responden = buatResponden('budi@example.com', 'Budi', jawabanSeragam('Strongly Agree'));
    const hasil = hitungNilaiResponden(responden, skemaPostTest('abaikan'));
    expect(hasil.nilai).toBe(100);
    expect(hasil.butirTerhitung).toBe(20);
    expect(hasil.peringatan).toHaveLength(0);
  });

  it('memberi nilai sama untuk "Strongly agree" dan "Strongly Agree"', () => {
    const skema = skemaPostTest('abaikan');
    const besar = buatResponden('a@example.com', 'A', jawabanSeragam('Strongly Agree'));
    const kecil = buatResponden('b@example.com', 'B', jawabanSeragam('Strongly agree'));
    expect(hitungNilaiResponden(besar, skema).nilai).toBe(
      hitungNilaiResponden(kecil, skema).nilai,
    );
  });

  it('memberi 20 bukan 0 untuk responden yang menjawab minimum di semua butir', () => {
    const responden = buatResponden('c@example.com', 'C', jawabanSeragam('Strongly disagree'));
    expect(hitungNilaiResponden(responden, skemaPostTest('abaikan')).nilai).toBe(20);
  });

  it('memunculkan peringatan untuk butir Yes/No/Maybe dan tidak memberinya angka', () => {
    const jawaban = jawabanSeragam('Agree');
    jawaban['q11'] = 'Maybe';
    const responden = buatResponden('d@example.com', 'D', jawaban);
    const hasil = hitungNilaiResponden(responden, skemaPostTest('abaikan'));

    expect(hasil.peringatan).toHaveLength(1);
    expect(hasil.peringatan.join(' ')).toContain('Butir 11');
    expect(hasil.butirTerhitung).toBe(19);
    // 19 butir bernilai 4 dari 5 = 80 persen. Butir ke-11 tidak menyeret nilai ke bawah.
    expect(hasil.nilai).toBe(80);
  });

  it('tetap memproses responden yang namanya kosong', () => {
    const responden = buatResponden('e@example.com', null, jawabanSeragam('Agree'));
    const hasil = hitungNilaiResponden(responden, skemaPostTest('abaikan'));
    expect(responden.nama).toBe(null);
    expect(hasil.nilai).toBe(80);
  });

  it('memberi indeks 100 persen di seluruh lima dimensi bila semua menjawab maksimum', () => {
    const semua = [
      buatResponden('f@example.com', 'F', jawabanSeragam('Strongly Agree')),
      buatResponden('g@example.com', null, jawabanSeragam('Strongly Agree')),
    ];
    const skema = skemaPostTest('abaikan');
    const dimensi = hitungIndeksDimensi(semua, skema);

    expect(dimensi.map((d) => d.dimensi)).toEqual([
      'kebermanfaatan',
      'kemudahan',
      'dayaTarik',
      'relevansi',
      'kepuasan',
    ]);
    for (const d of dimensi) {
      expect(d.indeks).toBe(100);
    }
    expect(hitungIndeksKeseluruhan(dimensi, skema)).toBe(100);
  });

  it('menyelesaikan 500 responden tanpa error', () => {
    const skema = skemaPostTest('abaikan');
    const semua: JawabanResponden[] = [];
    const opsi = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];
    for (let i = 0; i < 500; i += 1) {
      const pilihan = opsi[i % opsi.length];
      semua.push(
        buatResponden(`peserta${i}@example.com`, i % 7 === 0 ? null : `Peserta ${i}`, jawabanSeragam(pilihan === undefined ? 'Agree' : pilihan)),
      );
    }

    const nilai = semua.map((r) => hitungNilaiResponden(r, skema));
    expect(nilai).toHaveLength(500);
    for (const n of nilai) {
      expect(n.nilai).not.toBe(null);
    }
    expect(hitungIndeksDimensi(semua, skema)).toHaveLength(5);
  });
});

describe('penggabungan Pre-Test dan Post-Test', () => {
  it('mengenali orang yang sama meski emailnya beda huruf besar-kecil antar sesi', () => {
    const skema = skemaPostTest('abaikan');

    const diPre = buatResponden('Budi@Example.COM', 'Budi', jawabanSeragam('Neutral'));
    const diPost = buatResponden('budi@example.com', 'Budi', jawabanSeragam('Strongly Agree'));
    expect(diPre.id).toBe(diPost.id);

    const pre: NilaiSesi = {
      sesiId: 's1',
      namaSesi: 'Pre-Test',
      skemaId: skema.skemaId,
      nilai: new Map([[diPre.id, hitungNilaiResponden(diPre, skema).nilai]]),
      identitas: new Map([[diPre.id, { email: diPre.email, nama: diPre.nama }]]),
    };
    const post: NilaiSesi = {
      sesiId: 's2',
      namaSesi: 'Post-Test',
      skemaId: skema.skemaId,
      nilai: new Map([[diPost.id, hitungNilaiResponden(diPost, skema).nilai]]),
      identitas: new Map([[diPost.id, { email: diPost.email, nama: diPost.nama }]]),
    };

    const hasil = gabungkanSesi([pre, post], { awal: 's1', akhir: 's2' });
    expect(hasil.baris).toHaveLength(1);
    expect(hasil.baris[0]?.statusGabungan).toBe('lengkap');
    // Neutral = 3/5 = 60, Strongly Agree = 5/5 = 100
    expect(hasil.baris[0]?.selisih).toBe(40);
  });

  it('tidak membuang peserta yang hanya ikut Post-Test dan tidak menghitungnya sebagai nol', () => {
    const skema = skemaPostTest('abaikan');
    const budi = buatResponden('budi@example.com', 'Budi', jawabanSeragam('Agree'));
    const andi = buatResponden('andi@example.com', 'Andi', jawabanSeragam('Agree'));

    const pre: NilaiSesi = {
      sesiId: 's1',
      namaSesi: 'Pre-Test',
      skemaId: skema.skemaId,
      nilai: new Map([[budi.id, 40]]),
      identitas: new Map([[budi.id, { email: budi.email, nama: budi.nama }]]),
    };
    const post: NilaiSesi = {
      sesiId: 's2',
      namaSesi: 'Post-Test',
      skemaId: skema.skemaId,
      nilai: new Map([
        [budi.id, 80],
        [andi.id, 90],
      ]),
      identitas: new Map([
        [budi.id, { email: budi.email, nama: budi.nama }],
        [andi.id, { email: andi.email, nama: andi.nama }],
      ]),
    };

    const hasil = gabungkanSesi([pre, post], { awal: 's1', akhir: 's2' });
    const barisAndi = hasil.baris.find((b) => b.id === andi.id);

    expect(barisAndi).toBeDefined();
    expect(barisAndi?.nilaiPerSesi['s1']).toBe(null);
    expect(barisAndi?.nilaiPerSesi['s1']).not.toBe(0);
    expect(barisAndi?.selisih).toBe(null);
    expect(barisAndi?.statusGabungan).toBe('sebagian:Post-Test');

    const ringkasan = ringkasProyek(hasil, [pre, post]);
    // Rata-rata selisih hanya dari Budi yang lengkap, bukan dicampur dengan Andi.
    expect(ringkasan.rataSelisih).toBe(40);
    expect(ringkasan.jumlahTidakLengkap).toBe(1);
  });
});
```

- [ ] **Langkah 3: Buktikan uji integrasi benar-benar bisa gagal**

Seluruh modul inti sudah ada, jadi uji ini tidak punya fase merah yang alami. Buktikan ia hidup dengan merusak satu aturan untuk sementara.

Ubah `src/core/normalisasi.ts`, hilangkan `.toLowerCase()`:

```ts
export function normalisasiTeks(teks: string): string {
  return teks.trim().replace(/\s+/g, ' ');
}
```

Jalankan `npm test`. Diharapkan: GAGAL, termasuk pada uji `memberi nilai sama untuk "Strongly agree" dan "Strongly Agree"`. Inilah kegagalan nyata yang dialami instrumen Post-Test bila normalisasi dilewatkan.

Kembalikan `.toLowerCase()` seperti semula, lalu jalankan `npm test` lagi. Diharapkan: LULUS.

- [ ] **Langkah 4: Jalankan seluruh uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, seluruh berkas uji.

- [ ] **Langkah 5: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

Diharapkan: tanpa keluaran, keluar dengan kode 0.

- [ ] **Langkah 6: Commit**

```bash
git add src/core/__fixtures__/postTest.ts src/core/integrasi.test.ts
git commit -m "test(core): uji integrasi memakai replika instrumen Post-Test nyata"
```

---

## Kriteria Selesai Rencana Ini

Jalankan perintahnya, lihat keluarannya, baru menyatakan beres.

- [ ] `npm test` lulus — tempelkan ringkasan jumlah uji yang lulus
- [ ] `npm run typecheck` bersih, keluar dengan kode 0
- [ ] Uji kemurnian pada Tugas 2 terbukti bisa gagal (Langkah 3 Tugas 2 sudah dijalankan dan dilihat gagal)
- [ ] Uji integrasi pada Tugas 7 terbukti bisa gagal (Langkah 3 Tugas 7 sudah dijalankan dan dilihat gagal)
- [ ] Tidak ada `?? 0` maupun `|| 0` di seluruh `src/core/`
- [ ] Seluruh tujuh tugas ter-commit terpisah

Setelah rencana ini selesai, lanjut ke Rencana 2 (aplikasi browser: importer, pemetaan kolom, rekap, ekspor Excel dan PDF).
