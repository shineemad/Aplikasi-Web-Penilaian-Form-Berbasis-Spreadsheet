# Rencana Implementasi — Dari Berkas Mentah ke Nilai

> **Untuk pekerja agentik:** SUB-SKILL WAJIB: pakai `subagent-driven-development` (disarankan) atau `executing-plans` untuk mengerjakan rencana ini tugas demi tugas. Langkah memakai sintaks checkbox (`- [ ]`) untuk penanda kemajuan.

**Tujuan:** Melengkapi `src/core/` dengan fungsi-fungsi yang spec syaratkan tetapi Rencana 1 belum punya, lalu menambah `src/io/` yang mengubah berkas atau tautan spreadsheet menjadi baris siap skor. Hasil akhirnya: sebuah berkas `.xlsx` nyata dapat diubah menjadi rekap bernilai lengkap dengan peringatan, status kelengkapan, dan deteksi email kembar — seluruhnya dapat diuji tanpa browser.

**Arsitektur:** `core` tetap murni dan tidak mengimpor apa pun dari luar dirinya. `io` boleh memanggil `core` dan boleh memakai pustaka luar (SheetJS, `fetch`). Tidak ada React, tidak ada layar, tidak ada Apps Script pada rencana ini.

**Tech Stack:** TypeScript (`strict` + `noUncheckedIndexedAccess`), Vitest, SheetJS (`xlsx`).

**Spec:** [docs/superpowers/specs/2026-09-27-formscoring-engine-design.md](../specs/2026-09-27-formscoring-engine-design.md)

**Rencana sebelumnya:** [2026-09-27-inti-perhitungan.md](2026-09-27-inti-perhitungan.md) — selesai, 93 uji lulus.

## Batasan Global

Berlaku untuk **setiap** tugas. Delapan pertama diwarisi dari Rencana 1 dan masih ditegakkan otomatis oleh `src/core/kemurnian.test.ts`.

1. **Berkas di `src/core/` dilarang mengimpor apa pun dari luar `src/core/`.** Termasuk React, API browser, `google.script`, jaringan, `new Date`, `Date.now`, `Math.random`. Ini juga berarti **SheetJS tidak boleh masuk `core`**.
2. **Dilarang menulis `?? 0` atau `|| 0` di dalam `src/core/`.** Pakai pemeriksaan `=== undefined` eksplisit.
3. **Kosong bukan nol.** Jawaban kosong menghasilkan status `kosong`, tidak pernah angka 0.
4. **Opsi tak dikenal menghasilkan peringatan, bukan angka.** Tidak pernah menebak.
5. **Normalisasi sebelum mencocokkan:** buang spasi tepi → rapatkan spasi ganda → huruf kecil. Termasuk email sebelum di-hash.
6. **Istilah domain memakai Bahasa Indonesia.** Komentar dan pesan commit juga.
7. **Tulis uji lebih dulu.**
8. **`core` tidak membulatkan.** Assertion pada nilai/indeks/selisih memakai `toBeCloseTo`. Pencacah bilangan bulat dan `null` tetap `toBe`.
9. **`src/io/` boleh mengimpor pustaka luar, tetapi tidak boleh menghitung nilai.** Aritmetika penilaian hanya terjadi di `core`. `io` mengubah bentuk data, tidak pernah memutuskan angka.
10. **Pesan error yang menghadap pengguna harus mengajari, bukan sekadar melapor.** "Gagal memuat" dilarang; sebutkan apa yang salah dan langkah perbaikannya.

## Koreksi terhadap spec

Satu ambiguitas spec diputuskan di sini, dan spec akan disunting agar cocok.

**§6.1 `status_kelengkapan`** menulis bahwa kelengkapan dihitung "terhadap kolom yang aturannya bukan `abaikan`". Dibaca harfiah, kolom bertipe `manual` ikut dihitung — padahal kolom `manual` memang tidak pernah diisi responden (nilainya diketik penilai). Akibatnya setiap responden akan selalu berstatus `kurang`, dan penanda itu kehilangan arti.

**Keputusan:** kelengkapan dihitung hanya terhadap kolom yang **diisi responden**, yaitu beraturan `peta-opsi` atau `kunci-jawaban`. Kolom `manual` dan `abaikan` dikeluarkan.

## Struktur Berkas

| Berkas | Tanggung jawab tunggal |
| --- | --- |
| `src/core/periksaSkema.ts` | Skema + data → daftar masalah + boleh disimpan atau tidak |
| `src/core/kelengkapan.ts` | Satu responden + skema → lengkap / kurang N / kosong |
| `src/core/duplikat.ts` | Kumpulan baris → daftar email yang muncul lebih dari sekali |
| `src/core/sesi.ts` | Baris + skema + identitas sesi → `NilaiSesi` siap digabung |
| `src/io/importerBerkas.ts` | `ArrayBuffer` berkas → header + baris mentah |
| `src/io/importerTautan.ts` | URL published CSV → header + baris mentah |
| `src/io/tipe.ts` | Tipe bersama lapisan `io` |
| `src/io/*.test.ts` | Uji, berdampingan |

---

### Tugas 1: `periksaSkema`

**Berkas:**
- Buat: `src/core/periksaSkema.ts`
- Uji: `src/core/periksaSkema.test.ts`

**Antarmuka:**
- Memakai: `normalisasiTeks` dari `./normalisasi`, `skorMaksAturan` dari `./scorer`, tipe `Skema` dan `JawabanResponden` dari `./tipe`
- Menghasilkan: `periksaSkema(skema: Skema, baris: JawabanResponden[]): HasilPeriksaSkema`, tipe `MasalahSkema` dan `HasilPeriksaSkema` diekspor dari `periksaSkema.ts`

Ini memenuhi §7.2 butir 2 spec, yang sampai sekarang tidak punya pemilik: opsi tak dikenal harus dikumpulkan per kolom beserta jumlah barisnya, dan skema tidak boleh bisa disimpan selama masih ada yang belum diputuskan admin. Tugas ini juga menutup lubang yang ditemukan tinjauan akhir Rencana 1 — skema dengan `skorMaks: 0` yang melahirkan `NaN`.

- [ ] **Langkah 1: Tulis uji yang gagal**

Buat `src/core/periksaSkema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { periksaSkema } from './periksaSkema';
import type { Aturan, JawabanResponden, Skema } from './tipe';

const LIKERT: Aturan = {
  jenis: 'peta-opsi',
  skorMaks: 5,
  peta: { 'strongly disagree': 1, disagree: 2, neutral: 3, agree: 4, 'strongly agree': 5 },
};

function skema(butir: Skema['butir']): Skema {
  return { skemaId: 'uji', perlakuanKosong: 'abaikan', butir };
}

function baris(jawaban: Record<string, string>[]): JawabanResponden[] {
  return jawaban.map((j, i) => ({
    id: `r${i}`,
    email: `r${i}@example.com`,
    nama: null,
    jawaban: j,
  }));
}

const BUTIR_LIKERT = {
  kolomAsal: 'q1',
  label: 'Butir 1',
  dimensi: 'kemudahan',
  aturan: LIKERT,
  bobot: 1,
};

describe('periksaSkema tanpa masalah', () => {
  it('mengizinkan penyimpanan bila seluruh jawaban dikenali', () => {
    const hasil = periksaSkema(
      skema([BUTIR_LIKERT]),
      baris([{ q1: 'Agree' }, { q1: 'Strongly Agree' }, { q1: '' }]),
    );
    expect(hasil.masalah).toHaveLength(0);
    expect(hasil.bolehDisimpan).toBe(true);
  });

  it('tidak menganggap jawaban kosong sebagai opsi tak dikenal', () => {
    const hasil = periksaSkema(skema([BUTIR_LIKERT]), baris([{ q1: '' }, { q1: '   ' }]));
    expect(hasil.masalah).toHaveLength(0);
  });
});

describe('periksaSkema menemukan opsi tak dikenal', () => {
  it('mengumpulkan opsi tak dikenal beserta jumlah barisnya', () => {
    const hasil = periksaSkema(
      skema([BUTIR_LIKERT]),
      baris([{ q1: 'Yes' }, { q1: 'Maybe' }, { q1: 'Maybe' }, { q1: 'Agree' }]),
    );

    expect(hasil.bolehDisimpan).toBe(false);
    expect(hasil.masalah).toHaveLength(1);

    const masalah = hasil.masalah[0];
    expect(masalah?.jenis).toBe('opsi-tak-dikenal');
    if (masalah?.jenis === 'opsi-tak-dikenal') {
      expect(masalah.kolomAsal).toBe('q1');
      expect(masalah.opsi).toEqual([
        { teks: 'Maybe', jumlahBaris: 2 },
        { teks: 'Yes', jumlahBaris: 1 },
      ]);
    }
  });

  it('menggabungkan opsi yang hanya beda huruf besar-kecil menjadi satu', () => {
    const hasil = periksaSkema(
      skema([BUTIR_LIKERT]),
      baris([{ q1: 'Maybe' }, { q1: 'maybe' }, { q1: '  MAYBE  ' }]),
    );
    const masalah = hasil.masalah[0];
    if (masalah?.jenis === 'opsi-tak-dikenal') {
      expect(masalah.opsi).toHaveLength(1);
      expect(masalah.opsi[0]?.jumlahBaris).toBe(3);
    }
  });

  it('tidak melaporkan apa pun untuk kolom yang diabaikan', () => {
    const hasil = periksaSkema(
      skema([{ ...BUTIR_LIKERT, aturan: { jenis: 'abaikan' } }]),
      baris([{ q1: 'apa pun' }]),
    );
    expect(hasil.masalah).toHaveLength(0);
    expect(hasil.bolehDisimpan).toBe(true);
  });
});

describe('periksaSkema menolak skema yang cacat', () => {
  it('menolak skorMaks nol', () => {
    const rusak: Aturan = { jenis: 'peta-opsi', skorMaks: 0, peta: { ya: 1 } };
    const hasil = periksaSkema(skema([{ ...BUTIR_LIKERT, aturan: rusak }]), baris([{ q1: 'ya' }]));
    expect(hasil.bolehDisimpan).toBe(false);
    expect(hasil.masalah.map((m) => m.jenis)).toContain('skor-maks-tidak-sah');
  });

  it('menolak bobot nol atau negatif', () => {
    const hasil = periksaSkema(
      skema([{ ...BUTIR_LIKERT, bobot: 0 }]),
      baris([{ q1: 'Agree' }]),
    );
    expect(hasil.bolehDisimpan).toBe(false);
    expect(hasil.masalah.map((m) => m.jenis)).toContain('bobot-tidak-positif');
  });

  it('menolak dua kunci peta yang ternormalisasi sama', () => {
    const rancu: Aturan = {
      jenis: 'peta-opsi',
      skorMaks: 5,
      peta: { 'Strongly Agree': 5, 'strongly agree': 4 },
    };
    const hasil = periksaSkema(
      skema([{ ...BUTIR_LIKERT, aturan: rancu }]),
      baris([{ q1: 'Strongly Agree' }]),
    );
    expect(hasil.bolehDisimpan).toBe(false);
    const masalah = hasil.masalah.find((m) => m.jenis === 'kunci-peta-kembar');
    expect(masalah).toBeDefined();
    if (masalah?.jenis === 'kunci-peta-kembar') {
      expect(masalah.ternormalisasi).toBe('strongly agree');
      expect(masalah.kunciAsli).toHaveLength(2);
    }
  });

  it('menolak skema yang menunjuk kolom yang tidak ada di data', () => {
    const hasil = periksaSkema(
      skema([{ ...BUTIR_LIKERT, kolomAsal: 'q99' }]),
      baris([{ q1: 'Agree' }]),
    );
    expect(hasil.bolehDisimpan).toBe(false);
    expect(hasil.masalah.map((m) => m.jenis)).toContain('kolom-tidak-ada');
  });

  it('melaporkan seluruh masalah sekaligus, bukan berhenti di yang pertama', () => {
    const hasil = periksaSkema(
      skema([
        { ...BUTIR_LIKERT, bobot: 0 },
        { ...BUTIR_LIKERT, kolomAsal: 'q2', label: 'Butir 2' },
      ]),
      baris([{ q1: 'Agree', q2: 'Maybe' }]),
    );
    expect(hasil.masalah.length).toBeGreaterThanOrEqual(2);
  });
});

describe('periksaSkema dengan data kosong', () => {
  it('tetap memeriksa kecacatan skema meski belum ada baris', () => {
    const rusak: Aturan = { jenis: 'peta-opsi', skorMaks: 0, peta: { ya: 1 } };
    const hasil = periksaSkema(skema([{ ...BUTIR_LIKERT, aturan: rusak }]), []);
    expect(hasil.bolehDisimpan).toBe(false);
  });

  it('tidak melaporkan kolom-tidak-ada bila belum ada baris sama sekali', () => {
    const hasil = periksaSkema(skema([BUTIR_LIKERT]), []);
    expect(hasil.masalah.map((m) => m.jenis)).not.toContain('kolom-tidak-ada');
  });
});
```

- [ ] **Langkah 2: Jalankan uji dan pastikan gagal**

```bash
npm test
```

Diharapkan: GAGAL dengan pesan bahwa modul `./periksaSkema` tidak ditemukan.

- [ ] **Langkah 3: Tulis implementasi minimal**

Buat `src/core/periksaSkema.ts`:

```ts
import { normalisasiTeks } from './normalisasi';
import { skorMaksAturan } from './scorer';
import type { JawabanResponden, Skema } from './tipe';

export type MasalahSkema =
  | {
      jenis: 'opsi-tak-dikenal';
      kolomAsal: string;
      label: string;
      /** Diurutkan dari yang paling sering muncul. */
      opsi: { teks: string; jumlahBaris: number }[];
    }
  | { jenis: 'skor-maks-tidak-sah'; kolomAsal: string; label: string; skorMaks: number | null }
  | { jenis: 'bobot-tidak-positif'; kolomAsal: string; label: string; bobot: number }
  | {
      jenis: 'kunci-peta-kembar';
      kolomAsal: string;
      label: string;
      ternormalisasi: string;
      kunciAsli: string[];
    }
  | { jenis: 'kolom-tidak-ada'; kolomAsal: string; label: string };

export interface HasilPeriksaSkema {
  masalah: MasalahSkema[];
  /** Salah selama masih ada satu masalah pun. Tidak ada masalah yang boleh diabaikan. */
  bolehDisimpan: boolean;
}

export function periksaSkema(skema: Skema, baris: JawabanResponden[]): HasilPeriksaSkema {
  const masalah: MasalahSkema[] = [];

  const kolomTersedia = new Set<string>();
  for (const responden of baris) {
    for (const kolom of Object.keys(responden.jawaban)) kolomTersedia.add(kolom);
  }

  for (const butir of skema.butir) {
    if (butir.aturan.jenis === 'abaikan') continue;

    const { kolomAsal, label } = butir;

    if (butir.bobot <= 0 || !Number.isFinite(butir.bobot)) {
      masalah.push({ jenis: 'bobot-tidak-positif', kolomAsal, label, bobot: butir.bobot });
    }

    const skorMaks = skorMaksAturan(butir.aturan);
    if (skorMaks === null || !Number.isFinite(skorMaks) || skorMaks <= 0) {
      masalah.push({ jenis: 'skor-maks-tidak-sah', kolomAsal, label, skorMaks });
    }

    if (butir.aturan.jenis === 'peta-opsi') {
      const kunciPerBentuk = new Map<string, string[]>();
      for (const kunci of Object.keys(butir.aturan.peta)) {
        const bentuk = normalisasiTeks(kunci);
        const sudah = kunciPerBentuk.get(bentuk);
        if (sudah === undefined) kunciPerBentuk.set(bentuk, [kunci]);
        else sudah.push(kunci);
      }
      for (const [ternormalisasi, kunciAsli] of kunciPerBentuk) {
        if (kunciAsli.length > 1) {
          masalah.push({ jenis: 'kunci-peta-kembar', kolomAsal, label, ternormalisasi, kunciAsli });
        }
      }
    }

    if (baris.length > 0 && !kolomTersedia.has(kolomAsal)) {
      masalah.push({ jenis: 'kolom-tidak-ada', kolomAsal, label });
      continue;
    }

    if (butir.aturan.jenis !== 'peta-opsi' && butir.aturan.jenis !== 'kunci-jawaban') continue;

    const dikenal = new Set<string>();
    if (butir.aturan.jenis === 'peta-opsi') {
      for (const kunci of Object.keys(butir.aturan.peta)) dikenal.add(normalisasiTeks(kunci));
    } else {
      dikenal.add(normalisasiTeks(butir.aturan.kunci));
    }

    const takDikenal = new Map<string, { teks: string; jumlahBaris: number }>();
    for (const responden of baris) {
      const jawaban = responden.jawaban[kolomAsal];
      if (jawaban === undefined) continue;

      const bentuk = normalisasiTeks(jawaban);
      if (bentuk === '') continue;
      if (dikenal.has(bentuk)) continue;
      if (butir.aturan.jenis === 'kunci-jawaban') continue;

      const sudah = takDikenal.get(bentuk);
      if (sudah === undefined) takDikenal.set(bentuk, { teks: jawaban.trim(), jumlahBaris: 1 });
      else sudah.jumlahBaris += 1;
    }

    if (takDikenal.size > 0) {
      const opsi = [...takDikenal.values()].sort((a, b) => {
        if (b.jumlahBaris !== a.jumlahBaris) return b.jumlahBaris - a.jumlahBaris;
        return a.teks.localeCompare(b.teks);
      });
      masalah.push({ jenis: 'opsi-tak-dikenal', kolomAsal, label, opsi });
    }
  }

  return { masalah, bolehDisimpan: masalah.length === 0 };
}
```

Kolom beraturan `kunci-jawaban` sengaja tidak melaporkan opsi tak dikenal: jawaban yang tidak sama dengan kunci memang artinya salah, bukan artinya tidak dikenali.

- [ ] **Langkah 4: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, seluruh uji lama (93) plus 12 uji baru.

- [ ] **Langkah 5: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

Diharapkan: tanpa keluaran, keluar dengan kode 0.

- [ ] **Langkah 6: Commit**

```bash
git add src/core/periksaSkema.ts src/core/periksaSkema.test.ts
git commit -m "feat(core): periksaSkema mengumpulkan opsi tak dikenal dan menolak skema cacat"
```

---

### Tugas 2: `hitungKelengkapan`

**Berkas:**
- Buat: `src/core/kelengkapan.ts`
- Uji: `src/core/kelengkapan.test.ts`

**Antarmuka:**
- Memakai: `normalisasiTeks` dari `./normalisasi`, tipe `Skema` dan `JawabanResponden` dari `./tipe`
- Menghasilkan: `hitungKelengkapan(responden: JawabanResponden, skema: Skema): Kelengkapan`, tipe `Kelengkapan` diekspor dari `kelengkapan.ts`

Memenuhi §6.1 spec. Baca kembali bagian "Koreksi terhadap spec" di atas: kelengkapan dihitung hanya terhadap kolom yang diisi responden, yaitu `peta-opsi` dan `kunci-jawaban`.

- [ ] **Langkah 1: Tulis uji yang gagal**

Buat `src/core/kelengkapan.test.ts`:

```ts
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
```

- [ ] **Langkah 2: Jalankan uji dan pastikan gagal**

```bash
npm test
```

Diharapkan: GAGAL dengan pesan bahwa modul `./kelengkapan` tidak ditemukan.

- [ ] **Langkah 3: Tulis implementasi minimal**

Buat `src/core/kelengkapan.ts`:

```ts
import { normalisasiTeks } from './normalisasi';
import type { JawabanResponden, Skema } from './tipe';

export type Kelengkapan =
  | { status: 'lengkap' }
  | { status: 'kurang'; jumlahKosong: number }
  | { status: 'kosong' };

export function hitungKelengkapan(
  responden: JawabanResponden,
  skema: Skema,
): Kelengkapan {
  let diminta = 0;
  let kosong = 0;

  for (const butir of skema.butir) {
    if (butir.aturan.jenis !== 'peta-opsi' && butir.aturan.jenis !== 'kunci-jawaban') continue;

    diminta += 1;
    const jawaban = responden.jawaban[butir.kolomAsal];
    if (jawaban === undefined || normalisasiTeks(jawaban) === '') kosong += 1;
  }

  if (diminta === 0) return { status: 'lengkap' };
  if (kosong === 0) return { status: 'lengkap' };
  if (kosong === diminta) return { status: 'kosong' };
  return { status: 'kurang', jumlahKosong: kosong };
}
```

- [ ] **Langkah 4: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, seluruh uji sebelumnya plus 9 uji baru.

- [ ] **Langkah 5: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

Diharapkan: tanpa keluaran, keluar dengan kode 0.

- [ ] **Langkah 6: Commit**

```bash
git add src/core/kelengkapan.ts src/core/kelengkapan.test.ts
git commit -m "feat(core): status kelengkapan per responden"
```

---

### Tugas 3: `deteksiEmailKembar`

**Berkas:**
- Buat: `src/core/duplikat.ts`
- Uji: `src/core/duplikat.test.ts`

**Antarmuka:**
- Memakai: `normalisasiEmail` dari `./normalisasi`
- Menghasilkan: `deteksiEmailKembar(baris: BarisMentah[]): KonflikEmail[]`, tipe `BarisMentah` dan `KonflikEmail` diekspor dari `duplikat.ts`

Memenuhi §10 dan §11.2 spec. Google Forms dapat menerima jawaban berulang dari orang yang sama, dan spec melarang sistem memilih sendiri mana yang dipakai. Fungsi ini bekerja pada baris **mentah** — sebelum `bangunNilaiSesi` memadatkannya — karena setelah dipadatkan, baris kembar sudah saling menimpa dan tidak bisa dideteksi lagi.

- [ ] **Langkah 1: Tulis uji yang gagal**

Buat `src/core/duplikat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deteksiEmailKembar } from './duplikat';
import type { BarisMentah } from './duplikat';

function baris(daftarEmail: string[]): BarisMentah[] {
  return daftarEmail.map((email, i) => ({ nomorBaris: i + 1, email }));
}

describe('deteksiEmailKembar', () => {
  it('tidak melaporkan apa pun bila seluruh email berbeda', () => {
    expect(deteksiEmailKembar(baris(['a@x.com', 'b@x.com']))).toHaveLength(0);
  });

  it('melaporkan email yang muncul dua kali beserta nomor barisnya', () => {
    const hasil = deteksiEmailKembar(baris(['a@x.com', 'b@x.com', 'a@x.com']));
    expect(hasil).toHaveLength(1);
    expect(hasil[0]?.email).toBe('a@x.com');
    expect(hasil[0]?.jumlah).toBe(2);
    expect(hasil[0]?.nomorBaris).toEqual([1, 3]);
  });

  it('menganggap email yang hanya beda huruf besar-kecil sebagai orang yang sama', () => {
    const hasil = deteksiEmailKembar(baris(['Budi@Example.com', 'budi@example.com']));
    expect(hasil).toHaveLength(1);
    expect(hasil[0]?.jumlah).toBe(2);
  });

  it('menganggap email yang hanya beda spasi tepi sebagai orang yang sama', () => {
    const hasil = deteksiEmailKembar(baris(['  a@x.com', 'a@x.com  ']));
    expect(hasil[0]?.jumlah).toBe(2);
  });

  it('memakai bentuk ternormalisasi sebagai email yang dilaporkan', () => {
    const hasil = deteksiEmailKembar(baris(['Budi@Example.COM', 'budi@example.com']));
    expect(hasil[0]?.email).toBe('budi@example.com');
  });

  it('melaporkan lebih dari satu konflik sekaligus', () => {
    const hasil = deteksiEmailKembar(baris(['a@x.com', 'b@x.com', 'a@x.com', 'b@x.com']));
    expect(hasil).toHaveLength(2);
  });

  it('mengurutkan konflik dari yang paling banyak muncul', () => {
    const hasil = deteksiEmailKembar(baris(['a@x.com', 'b@x.com', 'b@x.com', 'b@x.com', 'a@x.com']));
    expect(hasil[0]?.email).toBe('b@x.com');
    expect(hasil[0]?.jumlah).toBe(3);
  });

  it('mengabaikan baris yang emailnya kosong', () => {
    expect(deteksiEmailKembar(baris(['', '   ', '']))).toHaveLength(0);
  });

  it('mengembalikan daftar kosong untuk masukan kosong', () => {
    expect(deteksiEmailKembar([])).toHaveLength(0);
  });
});
```

- [ ] **Langkah 2: Jalankan uji dan pastikan gagal**

```bash
npm test
```

Diharapkan: GAGAL dengan pesan bahwa modul `./duplikat` tidak ditemukan.

- [ ] **Langkah 3: Tulis implementasi minimal**

Buat `src/core/duplikat.ts`:

```ts
import { normalisasiEmail } from './normalisasi';

export interface BarisMentah {
  /** Nomor baris pada berkas asal, dihitung dari 1, untuk ditunjukkan ke admin. */
  nomorBaris: number;
  email: string;
}

export interface KonflikEmail {
  /** Bentuk ternormalisasi, karena itulah yang menentukan identitas. */
  email: string;
  jumlah: number;
  nomorBaris: number[];
}

export function deteksiEmailKembar(baris: BarisMentah[]): KonflikEmail[] {
  const perEmail = new Map<string, number[]>();

  for (const satu of baris) {
    const email = normalisasiEmail(satu.email);
    if (email === '') continue;

    const sudah = perEmail.get(email);
    if (sudah === undefined) perEmail.set(email, [satu.nomorBaris]);
    else sudah.push(satu.nomorBaris);
  }

  const konflik: KonflikEmail[] = [];
  for (const [email, nomorBaris] of perEmail) {
    if (nomorBaris.length < 2) continue;
    konflik.push({ email, jumlah: nomorBaris.length, nomorBaris });
  }

  return konflik.sort((a, b) => {
    if (b.jumlah !== a.jumlah) return b.jumlah - a.jumlah;
    return a.email.localeCompare(b.email);
  });
}
```

- [ ] **Langkah 4: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, seluruh uji sebelumnya plus 9 uji baru.

- [ ] **Langkah 5: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

Diharapkan: tanpa keluaran, keluar dengan kode 0.

- [ ] **Langkah 6: Commit**

```bash
git add src/core/duplikat.ts src/core/duplikat.test.ts
git commit -m "feat(core): deteksi email responden yang muncul lebih dari sekali"
```

---

### Tugas 4: `bangunNilaiSesi` dan pelebaran tipe merger

**Berkas:**
- Buat: `src/core/sesi.ts`
- Uji: `src/core/sesi.test.ts`
- Ubah: `src/core/merger.ts`
- Ubah: `src/core/merger.test.ts`

**Antarmuka:**
- Memakai: `hitungNilaiResponden` dari `./aggregator`, `hitungKelengkapan` dari `./kelengkapan`, tipe `NilaiSesi` dari `./merger`, tipe `Skema` dan `JawabanResponden` dari `./tipe`
- Menghasilkan: `bangunNilaiSesi(meta, responden, skema): NilaiSesi`, tipe `MetaSesi` dan `RespondenSesi` diekspor dari `sesi.ts`. `NilaiSesi` dan `BarisGabungan` di `merger.ts` dilebarkan.

Ini menutup temuan I4 tinjauan akhir Rencana 1, yang dicatat sebagai Ruling 6: sampai sekarang pemanggil membangun `Map` `NilaiSesi` dengan tangan, sehingga kelengkapan dan peringatan hilang di perjalanan, dan `statusPerSesi` tidak bisa menyatakan `ikut:kurang N` yang §8.4 syaratkan. Tugas ini sengaja dikerjakan sebelum ada apa pun yang memakai tipe itu, supaya pelebarannya tidak menjadi perubahan yang memutus.

**Perubahan tipe yang dilakukan pada `merger.ts`:**

```ts
export interface NilaiSesi {
  sesiId: string;
  namaSesi: string;
  skemaId: string;
  nilai: Map<string, number | null>;
  identitas: Map<string, { email: string; nama: string | null; meta: Record<string, string> }>;
  /** respondenId -> jumlah kolom kosong. Tidak ada entri berarti lengkap. */
  kurang: Map<string, number>;
  /** respondenId -> peringatan yang muncul saat menilainya. */
  peringatan: Map<string, string[]>;
}
```

dan pada `BarisGabungan`:

```ts
  meta: Record<string, string>;
  statusPerSesi: Record<string, 'ikut' | 'tidak ikut' | `ikut:kurang ${number}`>;
```

- [ ] **Langkah 1: Lebarkan tipe di `src/core/merger.ts`**

Ubah `NilaiSesi` dan `BarisGabungan` persis seperti blok di atas. Di dalam `gabungkanSesi`, ubah pengisian identitas dan status:

```ts
      sesiDiikuti.push(s.namaSesi);
      const nilai = s.nilai.get(id);
      nilaiPerSesi[s.sesiId] = nilai === undefined ? null : nilai;

      const jumlahKurang = s.kurang.get(id);
      statusPerSesi[s.sesiId] =
        jumlahKurang === undefined ? 'ikut' : `ikut:kurang ${jumlahKurang}`;

      if (!identitasTerisi) {
        const data = s.identitas.get(id);
        if (data !== undefined) {
          email = data.email;
          nama = data.nama;
          meta = data.meta;
          identitasTerisi = true;
        }
      }
```

Deklarasikan `let meta: Record<string, string> = {};` bersama `email` dan `nama`, dan sertakan `meta` pada objek baris yang dikembalikan. Baris `statusPerSesi[s.sesiId] = ikut ? 'ikut' : 'tidak ikut';` yang lama dipecah: yang `tidak ikut` tetap di cabang `if (!ikut)`.

- [ ] **Langkah 2: Sesuaikan `src/core/merger.test.ts`**

Pembantu `sesi()` di berkas uji itu membangun `NilaiSesi` dengan tangan. Tambahkan dua `Map` baru dan `meta` kosong:

```ts
function sesi(
  sesiId: string,
  namaSesi: string,
  skemaId: string,
  isi: Record<
    string,
    { nilai: number | null; email: string; nama: string | null; kurang?: number }
  >,
): NilaiSesi {
  const nilai = new Map<string, number | null>();
  const identitas = new Map<
    string,
    { email: string; nama: string | null; meta: Record<string, string> }
  >();
  const kurang = new Map<string, number>();
  const peringatan = new Map<string, string[]>();

  for (const [id, data] of Object.entries(isi)) {
    nilai.set(id, data.nilai);
    identitas.set(id, { email: data.email, nama: data.nama, meta: {} });
    if (data.kurang !== undefined) kurang.set(id, data.kurang);
  }
  return { sesiId, namaSesi, skemaId, nilai, identitas, kurang, peringatan };
}
```

Tambahkan satu uji baru di blok `describe('gabungkanSesi', ...)`:

```ts
  it('menyatakan berapa kolom yang kurang pada sesi yang diikuti', () => {
    const preKurang = sesi('s1', 'Pre-Test', 'skemaA', {
      budi: { nilai: 40, email: 'budi@example.com', nama: 'Budi', kurang: 3 },
    });
    const postBudi = sesi('s2', 'Post-Test', 'skemaA', {
      budi: { nilai: 80, email: 'budi@example.com', nama: 'Budi' },
    });
    const { baris } = gabungkanSesi([preKurang, postBudi], PEMBANDING);
    expect(baris[0]?.statusPerSesi['s1']).toBe('ikut:kurang 3');
    expect(baris[0]?.statusPerSesi['s2']).toBe('ikut');
    expect(baris[0]?.statusGabungan).toBe('lengkap');
  });
```

- [ ] **Langkah 3: Jalankan uji dan pastikan lulus kembali**

```bash
npm test
```

Diharapkan: LULUS. Bila `src/core/integrasi.test.ts` gagal karena membangun `NilaiSesi` dengan tangan, tambahkan `kurang: new Map()`, `peringatan: new Map()`, dan `meta: {}` pada objek identitasnya. Jangan mengubah nilai atau assertion apa pun di sana.

- [ ] **Langkah 4: Commit pelebaran tipe**

```bash
git add src/core/merger.ts src/core/merger.test.ts src/core/integrasi.test.ts
git commit -m "feat(core): NilaiSesi membawa kelengkapan, peringatan, dan meta responden"
```

- [ ] **Langkah 5: Tulis uji `bangunNilaiSesi` yang gagal**

Buat `src/core/sesi.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
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
  });
});
```

- [ ] **Langkah 6: Jalankan uji dan pastikan gagal**

```bash
npm test
```

Diharapkan: GAGAL dengan pesan bahwa modul `./sesi` tidak ditemukan.

- [ ] **Langkah 7: Tulis implementasi minimal**

Buat `src/core/sesi.ts`:

```ts
import { hitungNilaiResponden } from './aggregator';
import { hitungKelengkapan } from './kelengkapan';
import type { NilaiSesi } from './merger';
import type { JawabanResponden, Skema } from './tipe';

export interface MetaSesi {
  sesiId: string;
  namaSesi: string;
}

/** Responden beserta kolom identitas tambahan yang ikut dibawa ke tabel gabungan. */
export interface RespondenSesi extends JawabanResponden {
  meta: Record<string, string>;
}

export function bangunNilaiSesi(
  meta: MetaSesi,
  responden: RespondenSesi[],
  skema: Skema,
): NilaiSesi {
  const nilai = new Map<string, number | null>();
  const identitas = new Map<
    string,
    { email: string; nama: string | null; meta: Record<string, string> }
  >();
  const kurang = new Map<string, number>();
  const peringatan = new Map<string, string[]>();

  for (const satu of responden) {
    const hasil = hitungNilaiResponden(satu, skema);
    nilai.set(satu.id, hasil.nilai);
    identitas.set(satu.id, { email: satu.email, nama: satu.nama, meta: satu.meta });

    const kelengkapan = hitungKelengkapan(satu, skema);
    if (kelengkapan.status === 'kurang') kurang.set(satu.id, kelengkapan.jumlahKosong);
    else if (kelengkapan.status === 'kosong') {
      kurang.set(satu.id, jumlahKolomDiminta(skema));
    } else kurang.delete(satu.id);

    if (hasil.peringatan.length > 0) peringatan.set(satu.id, hasil.peringatan);
    else peringatan.delete(satu.id);
  }

  return {
    sesiId: meta.sesiId,
    namaSesi: meta.namaSesi,
    skemaId: skema.skemaId,
    nilai,
    identitas,
    kurang,
    peringatan,
  };
}

function jumlahKolomDiminta(skema: Skema): number {
  let jumlah = 0;
  for (const butir of skema.butir) {
    if (butir.aturan.jenis === 'peta-opsi' || butir.aturan.jenis === 'kunci-jawaban') jumlah += 1;
  }
  return jumlah;
}
```

`delete` dipanggil pada baris yang lengkap supaya pemadatan id kembar tidak meninggalkan sisa dari baris sebelumnya.

- [ ] **Langkah 8: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, seluruh uji sebelumnya plus 9 uji baru.

- [ ] **Langkah 9: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

Diharapkan: tanpa keluaran, keluar dengan kode 0.

- [ ] **Langkah 10: Commit**

```bash
git add src/core/sesi.ts src/core/sesi.test.ts
git commit -m "feat(core): bangunNilaiSesi menyatukan nilai, kelengkapan, dan peringatan"
```

---

### Tugas 5: Importer berkas

**Berkas:**
- Buat: `src/io/tipe.ts`
- Buat: `src/io/__fixtures__/bukuKerja.ts`
- Buat: `src/io/importerBerkas.ts`
- Uji: `src/io/importerBerkas.test.ts`
- Ubah: `package.json` (tambah `xlsx`)
- Ubah: `vitest.config.ts` (sertakan `src/io`)

**Antarmuka:**
- Memakai: SheetJS
- Menghasilkan: `bacaBerkas(isi: ArrayBuffer, namaBerkas: string): HasilImpor`, tipe `HasilImpor` dan `GagalImpor` diekspor dari `src/io/tipe.ts`

`vitest.config.ts` saat ini hanya menyertakan `src/**/*.test.ts`, yang sudah mencakup `src/io`. Periksa dan biarkan apa adanya bila memang sudah begitu.

- [ ] **Langkah 1: Pasang SheetJS**

```bash
npm install xlsx
```

Biarkan npm yang menuliskan versinya.

- [ ] **Langkah 2: Buat `src/io/tipe.ts`**

```ts
/** Satu baris apa adanya dari spreadsheet: nama kolom -> teks. */
export type BarisImpor = Record<string, string>;

export interface HasilImpor {
  status: 'berhasil';
  header: string[];
  baris: BarisImpor[];
}

export interface GagalImpor {
  status: 'gagal';
  /** Pesan untuk pengguna. Wajib menyebut langkah perbaikan, bukan hanya keluhan. */
  pesan: string;
}

export type Impor = HasilImpor | GagalImpor;
```

- [ ] **Langkah 3: Buat fixture buku kerja**

Buat `src/io/__fixtures__/bukuKerja.ts`:

```ts
import * as XLSX from 'xlsx';

/** Membangun buku kerja .xlsx di memori, untuk diumpankan ke importer. */
export function bukuKerjaXlsx(data: string[][]): ArrayBuffer {
  const lembar = XLSX.utils.aoa_to_sheet(data);
  const buku = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(buku, lembar, 'Sheet1');
  return XLSX.write(buku, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
```

- [ ] **Langkah 4: Tulis uji yang gagal**

Buat `src/io/importerBerkas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { bacaBerkas } from './importerBerkas';
import { bukuKerjaXlsx as bukuKerja } from './__fixtures__/bukuKerja';

describe('bacaBerkas', () => {
  it('membaca header dan baris dari xlsx', () => {
    const isi = bukuKerja([
      ['Email', 'Name', 'q1'],
      ['a@x.com', 'Ani', 'Agree'],
      ['b@x.com', '', 'Neutral'],
    ]);
    const hasil = bacaBerkas(isi, 'data.xlsx');

    expect(hasil.status).toBe('berhasil');
    if (hasil.status !== 'berhasil') return;
    expect(hasil.header).toEqual(['Email', 'Name', 'q1']);
    expect(hasil.baris).toHaveLength(2);
    expect(hasil.baris[0]).toEqual({ Email: 'a@x.com', Name: 'Ani', q1: 'Agree' });
  });

  it('mengisi sel kosong dengan teks kosong, bukan undefined', () => {
    const isi = bukuKerja([
      ['Email', 'Name'],
      ['a@x.com', ''],
    ]);
    const hasil = bacaBerkas(isi, 'data.xlsx');
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');
    expect(hasil.baris[0]?.Name).toBe('');
  });

  it('mempertahankan angka sebagai teks apa adanya', () => {
    const isi = bukuKerja([
      ['Email', 'Age'],
      ['a@x.com', '20'],
    ]);
    const hasil = bacaBerkas(isi, 'data.xlsx');
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');
    expect(hasil.baris[0]?.Age).toBe('20');
  });

  it('menolak berkas tanpa baris data', () => {
    const hasil = bacaBerkas(bukuKerja([['Email', 'Name']]), 'data.xlsx');
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') expect(hasil.pesan).toContain('tidak berisi satu baris data pun');
  });

  it('menolak berkas yang seluruhnya kosong', () => {
    const hasil = bacaBerkas(bukuKerja([]), 'data.xlsx');
    expect(hasil.status).toBe('gagal');
  });

  it('menolak header yang kosong dengan menyebut kolom keberapa', () => {
    const isi = bukuKerja([
      ['Email', '', 'q1'],
      ['a@x.com', 'x', 'Agree'],
    ]);
    const hasil = bacaBerkas(isi, 'data.xlsx');
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') {
      expect(hasil.pesan).toContain('kolom ke-2');
    }
  });

  it('menolak header kembar dengan menyebut namanya', () => {
    const isi = bukuKerja([
      ['Email', 'q1', 'q1'],
      ['a@x.com', 'Agree', 'Neutral'],
    ]);
    const hasil = bacaBerkas(isi, 'data.xlsx');
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') {
      expect(hasil.pesan).toContain('q1');
      expect(hasil.pesan).toContain('kembar');
    }
  });

  it('menolak berkas yang bukan spreadsheet dengan pesan yang mengajari', () => {
    const sampah = new TextEncoder().encode('ini bukan spreadsheet sama sekali').buffer;
    const hasil = bacaBerkas(sampah, 'catatan.txt');
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') {
      expect(hasil.pesan).toContain('catatan.txt');
      expect(hasil.pesan.toLowerCase()).toContain('.xlsx');
    }
  });

  it('membaca lembar pertama bila buku kerja punya beberapa lembar', () => {
    const lembar1 = XLSX.utils.aoa_to_sheet([
      ['Email'],
      ['a@x.com'],
    ]);
    const lembar2 = XLSX.utils.aoa_to_sheet([
      ['Lain'],
      ['abaikan'],
    ]);
    const buku = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(buku, lembar1, 'Utama');
    XLSX.utils.book_append_sheet(buku, lembar2, 'Cadangan');
    const isi = XLSX.write(buku, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const hasil = bacaBerkas(isi, 'dua-lembar.xlsx');
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');
    expect(hasil.header).toEqual(['Email']);
  });
});
```

- [ ] **Langkah 5: Jalankan uji dan pastikan gagal**

```bash
npm test
```

Diharapkan: GAGAL dengan pesan bahwa modul `./importerBerkas` tidak ditemukan.

- [ ] **Langkah 6: Tulis implementasi minimal**

Buat `src/io/importerBerkas.ts`:

```ts
import * as XLSX from 'xlsx';
import type { BarisImpor, Impor } from './tipe';

const EKSTENSI_DIDUKUNG = ['.xlsx', '.xls', '.csv'];

export function bacaBerkas(isi: ArrayBuffer, namaBerkas: string): Impor {
  // SheetJS memperlakukan teks biasa sebagai CSV yang sah, jadi berkas yang
  // jelas-jelas bukan spreadsheet harus ditolak di sini, bukan lewat parser.
  const ekstensi = namaBerkas.slice(namaBerkas.lastIndexOf('.')).toLowerCase();
  if (!EKSTENSI_DIDUKUNG.includes(ekstensi)) return gagalBukanSpreadsheet(namaBerkas);

  let matriks: string[][];

  try {
    const buku = XLSX.read(isi, { type: 'array' });
    const namaLembar = buku.SheetNames[0];
    if (namaLembar === undefined) return gagalBukanSpreadsheet(namaBerkas);

    const lembar = buku.Sheets[namaLembar];
    if (lembar === undefined) return gagalBukanSpreadsheet(namaBerkas);

    matriks = XLSX.utils.sheet_to_json<string[]>(lembar, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });
  } catch {
    return gagalBukanSpreadsheet(namaBerkas);
  }

  const barisHeader = matriks[0];
  if (barisHeader === undefined || barisHeader.length === 0) {
    return gagalBukanSpreadsheet(namaBerkas);
  }

  const header = barisHeader.map((sel) => String(sel).trim());

  for (let i = 0; i < header.length; i += 1) {
    if (header[i] === '') {
      return {
        status: 'gagal',
        pesan:
          `Baris pertama pada kolom ke-${i + 1} kosong, padahal baris pertama dipakai sebagai nama kolom. ` +
          'Beri nama kolom itu, atau hapus kolomnya, lalu unggah ulang.',
      };
    }
  }

  const terlihat = new Set<string>();
  for (const nama of header) {
    if (terlihat.has(nama)) {
      return {
        status: 'gagal',
        pesan:
          `Nama kolom "${nama}" kembar. Setiap kolom harus punya nama yang berbeda, ` +
          'karena nama kolom dipakai untuk memasangkan jawaban dengan aturan penilaian. ' +
          'Ubah salah satunya, lalu unggah ulang.',
      };
    }
    terlihat.add(nama);
  }

  const baris: BarisImpor[] = [];
  for (let i = 1; i < matriks.length; i += 1) {
    const isiBaris = matriks[i];
    if (isiBaris === undefined) continue;

    const satu: BarisImpor = {};
    for (let k = 0; k < header.length; k += 1) {
      const nama = header[k];
      if (nama === undefined) continue;
      const sel = isiBaris[k];
      satu[nama] = sel === undefined ? '' : String(sel);
    }
    baris.push(satu);
  }

  if (baris.length === 0) {
    return {
      status: 'gagal',
      pesan:
        `Berkas "${namaBerkas}" hanya berisi baris nama kolom dan tidak berisi satu baris data pun. ` +
        'Periksa apakah berkas yang terunggah sudah yang benar.',
    };
  }

  return { status: 'berhasil', header, baris };
}

function gagalBukanSpreadsheet(namaBerkas: string): Impor {
  return {
    status: 'gagal',
    pesan:
      `Berkas "${namaBerkas}" tidak dapat dibaca sebagai spreadsheet. ` +
      'Format yang didukung adalah .xlsx, .xls, dan .csv. ' +
      'Bila berkasnya dari Google Sheets, unduh dulu lewat File → Unduh → Microsoft Excel (.xlsx).',
  };
}
```

- [ ] **Langkah 7: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, seluruh uji sebelumnya plus 9 uji baru.

- [ ] **Langkah 8: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

Diharapkan: tanpa keluaran, keluar dengan kode 0. Bila `tsconfig.json` masih `"include": ["src"]`, `src/io` sudah ikut terperiksa.

- [ ] **Langkah 9: Commit**

```bash
git add package.json package-lock.json src/io/tipe.ts src/io/__fixtures__/bukuKerja.ts src/io/importerBerkas.ts src/io/importerBerkas.test.ts
git commit -m "feat(io): importer berkas xlsx, xls, dan csv"
```

---

### Tugas 6: Importer tautan published CSV

**Berkas:**
- Buat: `src/io/importerTautan.ts`
- Uji: `src/io/importerTautan.test.ts`

**Antarmuka:**
- Memakai: `bacaBerkas` dari `./importerBerkas`, tipe dari `./tipe`
- Menghasilkan: `bacaTautan(url: string, ambil: FungsiAmbil): Promise<Impor>`, tipe `FungsiAmbil` diekspor dari `importerTautan.ts`

Fungsi pengambil jaringan disuntikkan sebagai argumen, sama seperti `FungsiHash` di Rencana 1. Alasannya sama: ujinya tidak boleh menyentuh jaringan sungguhan. Ini juga membuat lapisan `io` tetap dapat diuji tanpa browser.

Spec §10 menuntut pesan yang mengajari untuk kasus tautan ditolak, karena kebanyakan orang mengira "siapa saja yang memiliki link" sudah berarti publik — padahal browser akan menolaknya. Menyalahartikan ini adalah kegagalan impor yang paling sering terjadi.

- [ ] **Langkah 1: Tulis uji yang gagal**

Buat `src/io/importerTautan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bacaTautan } from './importerTautan';
import type { FungsiAmbil } from './importerTautan';

const CSV = 'Email,Name,q1\na@x.com,Ani,Agree\nb@x.com,,Neutral\n';

function ambilBerhasil(teks: string): FungsiAmbil {
  return async () => ({ ok: true, status: 200, teks: async () => teks });
}

const ambilGagal = (status: number): FungsiAmbil =>
  async () => ({ ok: false, status, teks: async () => '' });

const ambilMelempar: FungsiAmbil = async () => {
  throw new TypeError('Failed to fetch');
};

describe('bacaTautan', () => {
  it('membaca CSV yang berhasil diambil', async () => {
    const hasil = await bacaTautan('https://contoh/pub?output=csv', ambilBerhasil(CSV));
    expect(hasil.status).toBe('berhasil');
    if (hasil.status !== 'berhasil') return;
    expect(hasil.header).toEqual(['Email', 'Name', 'q1']);
    expect(hasil.baris).toHaveLength(2);
  });

  it('menolak URL yang bukan http atau https', async () => {
    const hasil = await bacaTautan('ftp://contoh/data.csv', ambilBerhasil(CSV));
    expect(hasil.status).toBe('gagal');
  });

  it('menolak teks yang sama sekali bukan URL', async () => {
    const hasil = await bacaTautan('bukan url', ambilBerhasil(CSV));
    expect(hasil.status).toBe('gagal');
  });

  it('mengajari cara mempublikasikan saat tautan Google Sheets belum dipublikasikan', async () => {
    const hasil = await bacaTautan(
      'https://docs.google.com/spreadsheets/d/abc/edit',
      ambilBerhasil(CSV),
    );
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') {
      expect(hasil.pesan).toContain('Publikasikan ke web');
      expect(hasil.pesan).toContain('CSV');
    }
  });

  it('menerima tautan Google Sheets yang sudah dipublikasikan', async () => {
    const hasil = await bacaTautan(
      'https://docs.google.com/spreadsheets/d/e/abc/pub?output=csv',
      ambilBerhasil(CSV),
    );
    expect(hasil.status).toBe('berhasil');
  });

  it('mengajari saat jaringan menolak permintaan', async () => {
    const hasil = await bacaTautan('https://contoh/pub?output=csv', ambilMelempar);
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') {
      expect(hasil.pesan).toContain('Publikasikan ke web');
    }
  });

  it('menyebut kode status saat server menolak', async () => {
    const hasil = await bacaTautan('https://contoh/pub?output=csv', ambilGagal(404));
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') expect(hasil.pesan).toContain('404');
  });

  it('menolak balasan yang ternyata halaman HTML, bukan CSV', async () => {
    const html = '<!DOCTYPE html><html><body>Sign in</body></html>';
    const hasil = await bacaTautan('https://contoh/pub?output=csv', ambilBerhasil(html));
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') {
      expect(hasil.pesan).toContain('halaman web');
    }
  });

  it('menolak balasan kosong', async () => {
    const hasil = await bacaTautan('https://contoh/pub?output=csv', ambilBerhasil(''));
    expect(hasil.status).toBe('gagal');
  });
});
```

- [ ] **Langkah 2: Jalankan uji dan pastikan gagal**

```bash
npm test
```

Diharapkan: GAGAL dengan pesan bahwa modul `./importerTautan` tidak ditemukan.

- [ ] **Langkah 3: Tulis implementasi minimal**

Buat `src/io/importerTautan.ts`:

```ts
import { bacaBerkas } from './importerBerkas';
import type { Impor } from './tipe';

export interface BalasanAmbil {
  ok: boolean;
  status: number;
  teks: () => Promise<string>;
}

/** Disuntikkan dari luar supaya uji tidak pernah menyentuh jaringan sungguhan. */
export type FungsiAmbil = (url: string) => Promise<BalasanAmbil>;

const PETUNJUK_PUBLIKASI =
  'Buka spreadsheet-nya, lalu pilih File → Bagikan → Publikasikan ke web, ' +
  'pilih format CSV, dan salin tautan yang muncul di sana. ' +
  'Tautan "siapa saja yang memiliki link" tidak cukup — browser akan menolaknya.';

export async function bacaTautan(url: string, ambil: FungsiAmbil): Promise<Impor> {
  let alamat: URL;
  try {
    alamat = new URL(url);
  } catch {
    return { status: 'gagal', pesan: `"${url}" bukan tautan yang sah. Tempelkan alamat lengkapnya, termasuk https://.` };
  }

  if (alamat.protocol !== 'http:' && alamat.protocol !== 'https:') {
    return { status: 'gagal', pesan: 'Tautan harus diawali http:// atau https://.' };
  }

  if (alamat.hostname === 'docs.google.com' && !alamat.pathname.includes('/pub')) {
    return {
      status: 'gagal',
      pesan: `Tautan ini adalah tautan edit Google Sheets, bukan tautan publikasi. ${PETUNJUK_PUBLIKASI}`,
    };
  }

  let teks: string;
  try {
    const balasan = await ambil(url);
    if (!balasan.ok) {
      return {
        status: 'gagal',
        pesan:
          `Server menolak permintaan dengan kode ${balasan.status}. ` +
          `Bila ini spreadsheet Google: ${PETUNJUK_PUBLIKASI}`,
      };
    }
    teks = await balasan.teks();
  } catch {
    return {
      status: 'gagal',
      pesan: `Tautan tidak dapat diambil oleh browser. ${PETUNJUK_PUBLIKASI}`,
    };
  }

  const bersih = teks.trim();
  if (bersih === '') {
    return { status: 'gagal', pesan: 'Tautan berhasil dibuka tetapi isinya kosong. Periksa apakah lembarnya memang berisi data.' };
  }

  if (bersih.startsWith('<')) {
    return {
      status: 'gagal',
      pesan: `Tautan ini mengembalikan halaman web, bukan data CSV. ${PETUNJUK_PUBLIKASI}`,
    };
  }

  return bacaBerkas(new TextEncoder().encode(teks).buffer as ArrayBuffer, 'data-dari-tautan.csv');
}
```

SheetJS membaca CSV dari `ArrayBuffer` dengan jalur yang sama seperti `.xlsx`, jadi seluruh pemeriksaan header pada Tugas 5 otomatis berlaku juga di sini.

- [ ] **Langkah 4: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, seluruh uji sebelumnya plus 9 uji baru.

- [ ] **Langkah 5: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

Diharapkan: tanpa keluaran, keluar dengan kode 0.

- [ ] **Langkah 6: Commit**

```bash
git add src/io/importerTautan.ts src/io/importerTautan.test.ts
git commit -m "feat(io): importer tautan published CSV dengan pesan yang mengajari"
```

---

### Tugas 7: Uji integrasi berkas ke nilai

**Berkas:**
- Ubah: `src/io/__fixtures__/bukuKerja.ts`
- Uji: `src/io/alurLengkap.test.ts`

**Antarmuka:**
- Memakai: seluruh keluaran Tugas 1 sampai 6
- Menghasilkan: — (uji ujung ke ujung)

Tugas-tugas sebelumnya menguji setiap potongan sendiri-sendiri. Tugas ini menjalankan seluruh jalur pada replika instrumen Post-Test nyata: sebuah buku kerja `.xlsx` dibangun di dalam uji, dibaca oleh importer, diperiksa skemanya, dinilai, lalu digabung — persis seperti yang akan dilakukan aplikasi nanti.

- [ ] **Langkah 1: Tambahkan pembangun Post-Test ke fixture yang sudah ada**

Tambahkan ke `src/io/__fixtures__/bukuKerja.ts`, di bawah `bukuKerjaXlsx` yang dibuat Tugas 5:

```ts
const OPSI = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];

/**
 * Replika instrumen Post-Test: Email wajib, Name opsional, dua kolom meta,
 * lalu 20 butir. Butir ke-11 sengaja diisi Yes/No/Maybe pada sebagian baris,
 * seperti pada form aslinya.
 */
export function bukuKerjaPostTest(jumlahBaris: number): ArrayBuffer {
  const header = ['Email', 'Name', 'Age', 'Gender'];
  for (let n = 1; n <= 20; n += 1) header.push(`q${n}`);

  const data: string[][] = [header];
  for (let i = 0; i < jumlahBaris; i += 1) {
    const baris = [
      `peserta${i}@example.com`,
      i % 7 === 0 ? '' : `Peserta ${i}`,
      String(18 + (i % 5)),
      i % 2 === 0 ? 'female' : 'male',
    ];
    for (let n = 1; n <= 20; n += 1) {
      const pilihan = OPSI[(i + n) % OPSI.length];
      baris.push(n === 11 && i % 3 === 0 ? 'Maybe' : pilihan === undefined ? 'Agree' : pilihan);
    }
    data.push(baris);
  }
  return bukuKerjaXlsx(data);
}
```

- [ ] **Langkah 2: Tulis uji integrasi**

Buat `src/io/alurLengkap.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hitungIndeksDimensi } from '../core/aggregator';
import { deteksiEmailKembar } from '../core/duplikat';
import { hashPalsu } from '../core/__fixtures__/hash';
import { gabungkanSesi, ringkasProyek } from '../core/merger';
import { idResponden } from '../core/normalisasi';
import { periksaSkema } from '../core/periksaSkema';
import { bangunNilaiSesi } from '../core/sesi';
import type { RespondenSesi } from '../core/sesi';
import type { Aturan, ButirSkema, Skema } from '../core/tipe';
import { bacaBerkas } from './importerBerkas';
import { bukuKerjaPostTest } from './__fixtures__/bukuKerja';
import type { BarisImpor } from './tipe';

const LIKERT: Aturan = {
  jenis: 'peta-opsi',
  skorMaks: 5,
  peta: {
    'Strongly disagree': 1,
    Disagree: 2,
    Neutral: 3,
    Agree: 4,
    'Strongly Agree': 5,
  },
};

const DIMENSI = [
  { dimensi: 'kebermanfaatan', jumlah: 5 },
  { dimensi: 'kemudahan', jumlah: 5 },
  { dimensi: 'dayaTarik', jumlah: 4 },
  { dimensi: 'relevansi', jumlah: 3 },
  { dimensi: 'kepuasan', jumlah: 3 },
];

function skemaPostTest(): Skema {
  const butir: ButirSkema[] = [];
  let nomor = 1;
  for (const { dimensi, jumlah } of DIMENSI) {
    for (let i = 0; i < jumlah; i += 1) {
      butir.push({ kolomAsal: `q${nomor}`, label: `Butir ${nomor}`, dimensi, aturan: LIKERT, bobot: 1 });
      nomor += 1;
    }
  }
  return { skemaId: 'postTest', perlakuanKosong: 'abaikan', butir };
}

const KOLOM_META = ['Age', 'Gender'];

function keResponden(baris: BarisImpor[]): RespondenSesi[] {
  return baris.map((satu) => {
    const email = satu['Email'] === undefined ? '' : satu['Email'];
    const nama = satu['Name'] === undefined || satu['Name'] === '' ? null : satu['Name'];
    const meta: Record<string, string> = {};
    for (const kolom of KOLOM_META) {
      const nilai = satu[kolom];
      if (nilai !== undefined) meta[kolom] = nilai;
    }
    const jawaban: Record<string, string> = {};
    for (const [kolom, nilai] of Object.entries(satu)) {
      if (kolom === 'Email' || kolom === 'Name' || KOLOM_META.includes(kolom)) continue;
      jawaban[kolom] = nilai;
    }
    return { id: idResponden(email, hashPalsu), email, nama, jawaban, meta };
  });
}

describe('alur berkas ke nilai', () => {
  it('membaca 500 baris dan menilainya tanpa error', () => {
    const impor = bacaBerkas(bukuKerjaPostTest(500), 'post-test.xlsx');
    expect(impor.status).toBe('berhasil');
    if (impor.status !== 'berhasil') return;

    expect(impor.baris).toHaveLength(500);

    const responden = keResponden(impor.baris);
    const idUnik = new Set(responden.map((r) => r.id));
    expect(idUnik.size).toBe(500);

    const sesi = bangunNilaiSesi({ sesiId: 's1', namaSesi: 'Post-Test' }, responden, skemaPostTest());
    expect(sesi.nilai.size).toBe(500);
  });

  it('menahan penyimpanan skema karena butir Yes/No/Maybe belum diputuskan', () => {
    const impor = bacaBerkas(bukuKerjaPostTest(30), 'post-test.xlsx');
    if (impor.status !== 'berhasil') throw new Error('impor seharusnya berhasil');

    const hasil = periksaSkema(skemaPostTest(), keResponden(impor.baris));
    expect(hasil.bolehDisimpan).toBe(false);

    const masalah = hasil.masalah.find((m) => m.jenis === 'opsi-tak-dikenal');
    expect(masalah).toBeDefined();
    if (masalah?.jenis === 'opsi-tak-dikenal') {
      expect(masalah.kolomAsal).toBe('q11');
      expect(masalah.opsi[0]?.teks).toBe('Maybe');
    }
  });

  it('membawa kolom meta dan nama kosong sampai ke tabel gabungan', () => {
    const impor = bacaBerkas(bukuKerjaPostTest(10), 'post-test.xlsx');
    if (impor.status !== 'berhasil') throw new Error('impor seharusnya berhasil');

    const responden = keResponden(impor.baris);
    const sesi = bangunNilaiSesi({ sesiId: 's1', namaSesi: 'Post-Test' }, responden, skemaPostTest());
    const { baris } = gabungkanSesi([sesi]);

    expect(baris).toHaveLength(10);
    const tanpaNama = baris.filter((b) => b.nama === null);
    expect(tanpaNama.length).toBeGreaterThan(0);
    expect(baris[0]?.meta['Gender']).toBeDefined();
  });

  it('menemukan email kembar pada baris mentah', () => {
    const impor = bacaBerkas(bukuKerjaPostTest(5), 'post-test.xlsx');
    if (impor.status !== 'berhasil') throw new Error('impor seharusnya berhasil');

    const mentah = impor.baris.map((satu, i) => ({
      nomorBaris: i + 2,
      email: satu['Email'] === undefined ? '' : satu['Email'],
    }));
    expect(deteksiEmailKembar(mentah)).toHaveLength(0);

    mentah.push({ nomorBaris: 7, email: 'PESERTA0@EXAMPLE.COM' });
    const konflik = deteksiEmailKembar(mentah);
    expect(konflik).toHaveLength(1);
    expect(konflik[0]?.jumlah).toBe(2);
  });

  it('menggabungkan dua sesi dan hanya merata-ratakan selisih peserta lengkap', () => {
    const skema = skemaPostTest();

    const imporPre = bacaBerkas(bukuKerjaPostTest(10), 'pre.xlsx');
    const imporPost = bacaBerkas(bukuKerjaPostTest(6), 'post.xlsx');
    if (imporPre.status !== 'berhasil' || imporPost.status !== 'berhasil') {
      throw new Error('impor seharusnya berhasil');
    }

    const pre = bangunNilaiSesi({ sesiId: 's1', namaSesi: 'Pre-Test' }, keResponden(imporPre.baris), skema);
    const post = bangunNilaiSesi({ sesiId: 's2', namaSesi: 'Post-Test' }, keResponden(imporPost.baris), skema);

    const hasil = gabungkanSesi([pre, post], { awal: 's1', akhir: 's2' });
    expect(hasil.baris).toHaveLength(10);

    const ringkasan = ringkasProyek(hasil, [pre, post]);
    expect(ringkasan.jumlahLengkap).toBe(6);
    expect(ringkasan.jumlahTidakLengkap).toBe(4);
  });

  it('menghasilkan indeks untuk kelima dimensi', () => {
    const impor = bacaBerkas(bukuKerjaPostTest(20), 'post-test.xlsx');
    if (impor.status !== 'berhasil') throw new Error('impor seharusnya berhasil');

    const dimensi = hitungIndeksDimensi(keResponden(impor.baris), skemaPostTest());
    expect(dimensi).toHaveLength(5);
    for (const d of dimensi) {
      expect(d.indeks).not.toBe(null);
    }
  });
});
```

- [ ] **Langkah 3: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, seluruh uji sebelumnya plus 6 uji baru.

- [ ] **Langkah 4: Buktikan uji integrasi benar-benar bisa gagal**

Seluruh modul sudah ada, jadi uji ini tidak punya fase merah alami. Buktikan ia hidup dengan merusak satu aturan sementara.

Pada `src/core/periksaSkema.ts`, ubah baris terakhir menjadi:

```ts
  return { masalah, bolehDisimpan: true };
```

Jalankan `npm test`. Diharapkan: GAGAL pada uji `menahan penyimpanan skema karena butir Yes/No/Maybe belum diputuskan`. Inilah tepatnya kegagalan yang akan terjadi di dunia nyata bila §7.2 butir 2 tidak ditegakkan — admin menyimpan skema yang masih memuat opsi tak dikenal.

Kembalikan `bolehDisimpan: masalah.length === 0`, lalu jalankan `npm test` lagi. Diharapkan: LULUS.

- [ ] **Langkah 5: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

Diharapkan: tanpa keluaran, keluar dengan kode 0.

- [ ] **Langkah 6: Commit**

```bash
git add src/io/__fixtures__/bukuKerja.ts src/io/alurLengkap.test.ts
git commit -m "test(io): uji integrasi dari berkas xlsx sampai tabel gabungan"
```
---

## Kriteria Selesai Rencana Ini

Jalankan perintahnya, lihat keluarannya, baru menyatakan beres.

- [ ] `npm test` lulus — tempelkan ringkasan jumlah uji yang lulus
- [ ] `npm run typecheck` bersih, keluar dengan kode 0
- [ ] `src/core/kemurnian.test.ts` masih lulus — `core` tidak mengimpor SheetJS maupun apa pun dari `src/io/`
- [ ] Uji integrasi Tugas 7 terbukti bisa gagal (Langkah 4 sudah dijalankan dan dilihat gagal)
- [ ] Berkas `.xlsx` 500 baris terbaca dan ternilai tanpa error
- [ ] Seluruh tujuh tugas ter-commit terpisah

## Yang masih ditunda setelah rencana ini

| Butir spec | Menunggu apa |
| --- | --- |
| §8.1 urutan peringkat (nilai → butir terjawab → cap waktu) | Cap waktu pengiriman belum ada di data; importer harus memetakannya lebih dulu |
| §2 #3 dan §6.3 penimpaan nilai manual | Butuh tempat penyimpanan nilai manual — Rencana 4 |
| §12.1 ekspor Excel dan PDF | Rencana 3 |
| §9 peran dan penegakannya | Rencana 4 |
| Pembulatan penyajian + kategori dari angka yang ditampilkan (Ruling 8) | Rencana 3, milik Reporter |
