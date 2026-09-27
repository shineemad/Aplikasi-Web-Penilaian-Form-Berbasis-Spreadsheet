# Rencana Implementasi — Pemetaan Kolom

> **Untuk pekerja agentik:** SUB-SKILL WAJIB: pakai `subagent-driven-development` (disarankan) atau `executing-plans` untuk mengerjakan rencana ini tugas demi tugas. Langkah memakai sintaks checkbox (`- [ ]`) untuk penanda kemajuan.

**Tujuan:** Membangun Column Mapper yang spec §5.2 syaratkan — satu-satunya modul yang hilang antara berkas terimpor dan mesin hitung. Setelah rencana ini, sebuah `.xlsx` nyata dapat diubah menjadi `Skema` dan daftar `RespondenSesi` tanpa satu baris kode uji pun; hari ini pekerjaan itu hanya hidup sebagai `keResponden` di dalam `src/io/alurLengkap.test.ts`.

**Arsitektur:** Spec §5.2 menandai ketergantungan Column Mapper sebagai "—". Karena itu seluruh penebakan peran kolom dan usulan aturan skor masuk `src/core/` dan tetap murni. Hanya penguraian cap waktu yang tinggal di `src/io/`, karena format tanggal adalah urusan data nyata, bukan urusan perhitungan. Tidak ada React, tidak ada layar, tidak ada Apps Script pada rencana ini.

**Tech Stack:** TypeScript (`strict` + `noUncheckedIndexedAccess`), Vitest.

**Spec:** [docs/superpowers/specs/2026-09-27-formscoring-engine-design.md](../specs/2026-09-27-formscoring-engine-design.md)

**Rencana sebelumnya:** [2026-09-27-inti-perhitungan.md](2026-09-27-inti-perhitungan.md) dan [2026-09-27-berkas-ke-nilai.md](2026-09-27-berkas-ke-nilai.md) — keduanya selesai, 190 uji lulus.

## Batasan Global

Berlaku untuk **setiap** tugas. Sepuluh yang pertama diwarisi dari dua rencana sebelumnya dan masih ditegakkan otomatis oleh `src/core/kemurnian.test.ts`.

1. **Berkas di `src/core/` dilarang mengimpor apa pun dari luar `src/core/`.** Termasuk React, API browser, `google.script`, jaringan, `new Date`, `Date.now`, `Math.random`. Ini juga berarti **SheetJS tidak boleh masuk `core`**.
2. **Dilarang menulis `?? 0` atau `|| 0` di dalam `src/core/`.** Pakai pemeriksaan `=== undefined` eksplisit.
3. **Kosong bukan nol.** Jawaban kosong menghasilkan status `kosong`, tidak pernah angka 0.
4. **Opsi tak dikenal menghasilkan peringatan, bukan angka.** Tidak pernah menebak.
5. **Normalisasi sebelum mencocokkan:** buang spasi tepi → rapatkan spasi ganda → huruf kecil. Termasuk email sebelum di-hash.
6. **Istilah domain memakai Bahasa Indonesia.** Komentar dan pesan commit juga.
7. **Tulis uji lebih dulu.**
8. **`core` tidak membulatkan.** Assertion pada nilai/indeks/selisih memakai `toBeCloseTo`. Pencacah bilangan bulat dan `null` tetap `toBe`.
9. **`src/io/` boleh mengimpor pustaka luar, tetapi tidak boleh menghitung nilai.** Aritmetika penilaian hanya terjadi di `core`.
10. **Pesan error yang menghadap pengguna harus mengajari, bukan sekadar melapor.** "Gagal memuat" dilarang; sebutkan apa yang salah dan langkah perbaikannya.

Empat berikut lahir dari rencana ini.

11. **Column Mapper tinggal di `core` dan menerima bentuk data biasa.** Tanda tangannya memakai `string[]` dan `Record<string, string>[]`, **bukan** `BarisImpor`/`HasilImpor` dari `src/io/tipe.ts`. Bentuknya memang identik, tetapi mengimpornya akan melanggar Batasan 1 dan menggagalkan `kemurnian.test.ts`. Lapisan `io` yang menyerahkan datanya, bukan `core` yang menjangkaunya.
12. **Sistem tidak pernah mengusulkan `kunci-jawaban`.** Sistem tidak punya cara mengetahui jawaban mana yang benar; menebaknya berarti mengarang kunci. Aturan itu selalu berasal dari admin.
13. **`Skema` hanya boleh lahir dari rancangan yang sudah diputuskan seluruhnya.** Ini menegakkan §7.2 butir 2 secara struktural: selama masih ada kolom tanpa keputusan, tipe `Skema` tidak pernah terbentuk — bukan sekadar tombol simpan yang dinonaktifkan.
14. **Penguraian tanggal hanya terjadi di `io`.** `core` menerima pembanding waktu sebagai argumen, persis pola `FungsiHash` pada Rencana 1 dan `FungsiAmbil` pada Rencana 2.

## Koreksi terhadap spec

Dua hal diputuskan di sini, dan spec akan disunting agar cocok.

**§5.2 menulis keluaran Column Mapper adalah "Skema (peran kolom + aturan skor)".** Dibaca bersama §6.2, keduanya tidak bisa jadi satu: tabel `Skema` hanya punya `kolom_asal`, `label`, `dimensi`, `aturan`, `parameter`, `skor_maks`, dan `bobot`. Tidak ada tempat untuk menyatakan "kolom ini adalah Email".

**Keputusan:** Column Mapper menghasilkan **dua** benda — `PetaPeran` (kolom mana Email, Nama, cap waktu, meta) dan `Skema` (bagaimana kolom pertanyaan dinilai). Keduanya diturunkan dari kumpulan header yang sama dan dapat dipakai ulang persis ketika kumpulan header itu berulang, sehingga keduanya disimpan di bawah satu `skema_id`. Penyimpanannya sendiri milik rencana Store; rencana ini hanya mendefinisikan tipenya di memori.

**§7.2 butir 3 menyebut perlakuan jawaban kosong "harus menjadi keputusan sadar",** tetapi §6.2 tidak menyediakan kolomnya dan tipe `Skema` yang sudah ada memberi `perlakuanKosong` nilai wajib. Rancangan yang belum diputuskan karena itu tidak punya cara menyatakan "admin belum memilih".

**Keputusan:** `RancanganSkema.perlakuanKosong` bertipe `PerlakuanKosong | null`, dan `null` menghalangi finalisasi. `Skema` yang sudah jadi tetap wajib mengisinya. Dengan begitu tidak ada nilai bawaan diam-diam yang menentukan angka akhir.

## Struktur Berkas

| Berkas | Tanggung jawab tunggal |
| --- | --- |
| `src/core/peranKolom.ts` | Daftar header → peran identitas tiap kolom + daftar yang rancu |
| `src/core/usulAturan.ts` | Kumpulan nilai satu kolom → usulan `Aturan`, atau pernyataan tidak yakin |
| `src/core/rancanganSkema.ts` | Header + baris → rancangan; rancangan lengkap → `Skema` |
| `src/core/bangunResponden.ts` | Baris impor + `PetaPeran` + `Skema` → `RespondenSesi[]` + cap waktu |
| `src/core/peringkat.ts` | Nilai + butir terjawab + cap waktu → urutan peringkat (§8.1) |
| `src/io/waktu.ts` | Cap waktu Google Forms → pembanding urutan; deteksi format |
| `src/*/*.test.ts` | Uji, berdampingan |

Aturan ketergantungan tidak berubah: `io` boleh memanggil `core`; `core` tidak memanggil siapa pun.

---

### Tugas 1: `tebakPeranKolom`

**Berkas:**
- Buat: `src/core/peranKolom.ts`
- Uji: `src/core/peranKolom.test.ts`

**Antarmuka:**
- Memakai: `normalisasiTeks` dari `./normalisasi`
- Menghasilkan: `tebakPeranKolom(header: string[]): PetaPeran`; tipe `Peran`, `KolomBerperan`, dan `PetaPeran` diekspor dari `peranKolom.ts`

Ini menebak **hanya** peran identitas — Email, Nama, cap waktu — karena hanya itu yang dapat disimpulkan dari nama header saja. Membedakan kolom meta (`Age`, `Gender`) dari kolom pertanyaan mustahil tanpa melihat isinya, jadi sisanya ditandai `belum-diputuskan` dan diserahkan ke Tugas 3.

Bila ada dua kolom yang sama-sama tampak seperti Email, fungsi ini **tidak memilih**. Ia melaporkan keduanya sebagai rancu. Memilih sendiri berarti menebak kunci identitas — kesalahan yang menjalar ke setiap sesi dan setiap penggabungan.

- [ ] **Langkah 1: Tulis uji yang gagal**

Buat `src/core/peranKolom.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { tebakPeranKolom } from './peranKolom';
import type { Peran } from './peranKolom';

function peranDari(header: string[]): Record<string, Peran> {
  const hasil: Record<string, Peran> = {};
  for (const kolom of tebakPeranKolom(header).kolom) hasil[kolom.header] = kolom.peran;
  return hasil;
}

describe('tebakPeranKolom mengenali kolom identitas', () => {
  it('mengenali header Google Forms berbahasa Inggris', () => {
    const peran = peranDari(['Timestamp', 'Email Address', 'Name', 'Age', 'q1']);
    expect(peran['Timestamp']).toBe('waktu');
    expect(peran['Email Address']).toBe('email');
    expect(peran['Name']).toBe('nama');
  });

  it('mengenali header berbahasa Indonesia', () => {
    const peran = peranDari(['Cap Waktu', 'Alamat Email', 'Nama Lengkap']);
    expect(peran['Cap Waktu']).toBe('waktu');
    expect(peran['Alamat Email']).toBe('email');
    expect(peran['Nama Lengkap']).toBe('nama');
  });

  it('tidak peduli huruf besar-kecil maupun spasi berlebih', () => {
    const peran = peranDari(['  EMAIL   address  ']);
    expect(peran['  EMAIL   address  ']).toBe('email');
  });

  it('menandai kolom selain identitas sebagai belum diputuskan', () => {
    const peran = peranDari(['Email Address', 'Age', 'Gender', 'q1']);
    expect(peran['Age']).toBe('belum-diputuskan');
    expect(peran['Gender']).toBe('belum-diputuskan');
    expect(peran['q1']).toBe('belum-diputuskan');
  });

  it('menyertakan alasan untuk setiap peran yang ditebak', () => {
    const peta = tebakPeranKolom(['Email Address']);
    expect(peta.kolom[0]?.alasan).not.toBe('');
  });
});

describe('tebakPeranKolom menolak menebak saat rancu', () => {
  it('tidak memilih sendiri bila ada dua calon kolom email', () => {
    const peta = tebakPeranKolom(['Email Address', 'Email Orang Tua']);
    expect(peta.kolom[0]?.peran).toBe('belum-diputuskan');
    expect(peta.kolom[1]?.peran).toBe('belum-diputuskan');

    const rancu = peta.rancu.find((r) => r.peran === 'email');
    expect(rancu?.calon).toEqual(['Email Address', 'Email Orang Tua']);
  });

  it('melaporkan kerancuan nama tanpa mengganggu email', () => {
    const peta = tebakPeranKolom(['Email Address', 'Name', 'Nama']);
    const peran = peranDari(['Email Address', 'Name', 'Nama']);
    expect(peran['Email Address']).toBe('email');
    expect(peta.rancu.map((r) => r.peran)).toEqual(['nama']);
  });

  it('tidak melaporkan kerancuan bila memang tidak ada calon', () => {
    expect(tebakPeranKolom(['q1', 'q2']).rancu).toHaveLength(0);
  });
});

describe('tebakPeranKolom tidak tertipu teks pertanyaan', () => {
  it('tidak menganggap pertanyaan panjang sebagai kolom email', () => {
    // Header pertanyaan Google Forms sering berupa kalimat penuh. Tanpa pagar
    // panjang, kalimat yang kebetulan memuat kata "email" akan dikira kunci identitas.
    const panjang = 'I would like the team to email me the results of this study later';
    expect(peranDari([panjang, 'Email Address'])[panjang]).toBe('belum-diputuskan');
  });

  it('mencocokkan nama secara persis, bukan sekadar mengandung', () => {
    const header = 'Name of the application you used most often';
    expect(peranDari([header])[header]).toBe('belum-diputuskan');
  });

  it('mengembalikan peta kosong untuk header kosong', () => {
    const peta = tebakPeranKolom([]);
    expect(peta.kolom).toHaveLength(0);
    expect(peta.rancu).toHaveLength(0);
  });
});
```

- [ ] **Langkah 2: Jalankan uji dan pastikan gagal**

```bash
npm test
```

Diharapkan: GAGAL dengan pesan bahwa modul `./peranKolom` tidak ditemukan.

- [ ] **Langkah 3: Tulis implementasi minimal**

Buat `src/core/peranKolom.ts`:

```ts
import { normalisasiTeks } from './normalisasi';

export type Peran = 'email' | 'nama' | 'waktu' | 'meta' | 'pertanyaan' | 'belum-diputuskan';

export interface KolomBerperan {
  header: string;
  peran: Peran;
  /** Mengapa peran ini dipilih, untuk ditampilkan ke admin. */
  alasan: string;
}

export type PeranIdentitas = 'email' | 'nama' | 'waktu';

export interface PetaPeran {
  kolom: KolomBerperan[];
  /** Peran yang punya lebih dari satu calon. Admin harus memilih; sistem tidak. */
  rancu: { peran: PeranIdentitas; calon: string[] }[];
}

/**
 * Header pertanyaan Google Forms kerap berupa kalimat penuh. Pagar panjang ini
 * mencegah kalimat yang kebetulan memuat kata "email" dikira kunci identitas.
 */
const PANJANG_MAKS_IDENTITAS = 30;

const MENGANDUNG: Record<PeranIdentitas, string[]> = {
  email: ['email', 'surel'],
  waktu: ['timestamp', 'cap waktu', 'stempel waktu'],
  nama: [],
};

const PERSIS: Record<PeranIdentitas, string[]> = {
  email: [],
  waktu: [],
  nama: ['name', 'nama', 'full name', 'nama lengkap'],
};

const URUTAN: PeranIdentitas[] = ['email', 'nama', 'waktu'];

function calonUntuk(peran: PeranIdentitas, header: string[]): string[] {
  const calon: string[] = [];

  for (const asli of header) {
    const bentuk = normalisasiTeks(asli);
    if (bentuk.length > PANJANG_MAKS_IDENTITAS) continue;

    const persis = PERSIS[peran];
    const mengandung = MENGANDUNG[peran];

    if (persis.includes(bentuk)) calon.push(asli);
    else if (mengandung.some((kata) => bentuk.includes(kata))) calon.push(asli);
  }

  return calon;
}

export function tebakPeranKolom(header: string[]): PetaPeran {
  const terpilih = new Map<string, KolomBerperan>();
  const rancu: { peran: PeranIdentitas; calon: string[] }[] = [];

  for (const peran of URUTAN) {
    const calon = calonUntuk(peran, header);
    if (calon.length === 0) continue;

    if (calon.length > 1) {
      rancu.push({ peran, calon });
      continue;
    }

    const satu = calon[0];
    if (satu === undefined) continue;
    terpilih.set(satu, {
      header: satu,
      peran,
      alasan: `Nama kolom "${satu}" cocok dengan pola kolom ${peran}.`,
    });
  }

  const kolom = header.map((asli) => {
    const sudah = terpilih.get(asli);
    if (sudah !== undefined) return sudah;
    return {
      header: asli,
      peran: 'belum-diputuskan' as const,
      alasan: 'Peran kolom ini tidak dapat disimpulkan dari nama header saja.',
    };
  });

  return { kolom, rancu };
}
```

Kolom yang masuk daftar `rancu` sengaja tidak diberi peran sama sekali. Ia tetap `belum-diputuskan`, sehingga finalisasi pada Tugas 3 akan menolaknya selama admin belum memilih.

- [ ] **Langkah 4: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, seluruh uji sebelumnya plus 11 uji baru.

- [ ] **Langkah 5: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

Diharapkan: tanpa keluaran, keluar dengan kode 0.

- [ ] **Langkah 6: Commit**

```bash
git add src/core/peranKolom.ts src/core/peranKolom.test.ts
git commit -m "feat(core): tebak peran kolom identitas dan laporkan yang rancu"
```

---

### Tugas 2: `usulkanAturan`

**Berkas:**
- Buat: `src/core/usulAturan.ts`
- Uji: `src/core/usulAturan.test.ts`

**Antarmuka:**
- Memakai: `normalisasiTeks` dari `./normalisasi`, tipe `Aturan` dari `./tipe`
- Menghasilkan: `usulkanAturan(nilai: string[]): UsulAturan`; tipe `UsulAturan` diekspor dari `usulAturan.ts`

Ini memenuhi setengah kedua dari §5.2: melihat isi satu kolom lalu mengusulkan aturan skornya. Dua hal yang **tidak** dilakukannya sama pentingnya dengan yang dilakukan.

Pertama, ia tidak pernah mengusulkan `kunci-jawaban` (Batasan Global 12). Kedua, `skorMaks` diambil dari skala yang dikenali, **bukan** dari jumlah opsi yang kebetulan muncul di data. Bila sebuah kolom hanya memuat empat dari lima nilai Likert, skor maksimumnya tetap 5. Mengambilnya dari data akan menaikkan seluruh nilai kolom itu diam-diam.

Butir 11 pada instrumen nyata — Yes/No/Maybe di tengah 19 butir Likert — adalah kasus uji utama tugas ini. Ia wajib menghasilkan "tidak yakin", bukan tebakan.

- [ ] **Langkah 1: Tulis uji yang gagal**

Buat `src/core/usulAturan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { usulkanAturan } from './usulAturan';

const LIKERT_INGGRIS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];

describe('usulkanAturan mengenali skala yang dikenal', () => {
  it('mengusulkan peta-opsi untuk Likert 5 poin berbahasa Inggris', () => {
    const usul = usulkanAturan(LIKERT_INGGRIS);
    expect(usul.status).toBe('usul');
    if (usul.status !== 'usul') return;
    expect(usul.aturan.jenis).toBe('peta-opsi');
    if (usul.aturan.jenis !== 'peta-opsi') return;
    expect(usul.aturan.skorMaks).toBe(5);
    expect(usul.aturan.peta['strongly agree']).toBe(5);
    expect(usul.aturan.peta['strongly disagree']).toBe(1);
  });

  it('mengusulkan peta-opsi untuk Likert 5 poin berbahasa Indonesia', () => {
    const usul = usulkanAturan(['Sangat tidak setuju', 'Netral', 'Setuju', 'Sangat setuju']);
    expect(usul.status).toBe('usul');
    if (usul.status !== 'usul') return;
    if (usul.aturan.jenis !== 'peta-opsi') return;
    expect(usul.aturan.peta['sangat setuju']).toBe(5);
  });

  it('menyatukan opsi yang hanya beda huruf besar-kecil', () => {
    // Dua butir pada instrumen nyata menulis "Strongly Agree" berhuruf A besar.
    const usul = usulkanAturan(['Strongly Agree', 'Strongly agree', 'Agree', 'Neutral']);
    expect(usul.status).toBe('usul');
  });

  it('memakai skor maksimum skala, bukan jumlah opsi yang kebetulan muncul', () => {
    // Bila skorMaks diambil dari data, kolom ini akan bernilai 100 untuk "Agree".
    const usul = usulkanAturan(['Agree', 'Neutral', 'Disagree']);
    expect(usul.status).toBe('usul');
    if (usul.status !== 'usul') return;
    if (usul.aturan.jenis !== 'peta-opsi') return;
    expect(usul.aturan.skorMaks).toBe(5);
    expect(Object.keys(usul.aturan.peta)).toHaveLength(5);
  });

  it('mengabaikan jawaban kosong saat mencocokkan skala', () => {
    const usul = usulkanAturan(['Agree', '', '   ', 'Neutral', 'Disagree']);
    expect(usul.status).toBe('usul');
  });

  it('menyebut nama skala pada alasannya', () => {
    const usul = usulkanAturan(LIKERT_INGGRIS);
    expect(usul.alasan.toLowerCase()).toContain('likert');
  });
});

describe('usulkanAturan berisik saat ragu', () => {
  it('tidak menebak untuk kolom Yes/No/Maybe', () => {
    // Butir 11 instrumen nyata. Memaksanya masuk skala Likert akan mengarang angka.
    const usul = usulkanAturan(['Yes', 'No', 'Maybe', 'Yes', 'Maybe']);
    expect(usul.status).toBe('tidak-yakin');
    if (usul.status !== 'tidak-yakin') return;
    expect(usul.contohNilai).toContain('Yes');
  });

  it('menolak skala Likert yang tercampur satu opsi asing', () => {
    const usul = usulkanAturan(['Agree', 'Neutral', 'Disagree', 'Maybe']);
    expect(usul.status).toBe('tidak-yakin');
  });

  it('tidak menebak bila hanya ada dua opsi berbeda', () => {
    const usul = usulkanAturan(['Agree', 'Disagree', 'Agree']);
    expect(usul.status).toBe('tidak-yakin');
  });

  it('menyarankan abaikan untuk kolom berisi teks bebas', () => {
    const jawaban = Array.from(
      { length: 25 },
      (_, i) => `Menurut saya aplikasinya cukup membantu untuk keperluan nomor ${i}`,
    );
    const usul = usulkanAturan(jawaban);
    expect(usul.status).toBe('tidak-yakin');
    if (usul.status !== 'tidak-yakin') return;
    expect(usul.alasan).toContain('abaikan');
  });

  it('tidak menebak untuk kolom yang seluruhnya kosong', () => {
    expect(usulkanAturan(['', '  ', '']).status).toBe('tidak-yakin');
  });

  it('tidak menebak untuk kolom tanpa satu nilai pun', () => {
    expect(usulkanAturan([]).status).toBe('tidak-yakin');
  });

  it('tidak pernah mengusulkan kunci-jawaban', () => {
    // Sistem tidak punya cara tahu jawaban mana yang benar. Aturan itu milik admin.
    const usul = usulkanAturan(['A', 'B', 'C', 'D', 'B', 'A']);
    expect(usul.status).toBe('tidak-yakin');
  });

  it('membatasi contoh nilai pada lima yang paling sering muncul', () => {
    const usul = usulkanAturan(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    if (usul.status !== 'tidak-yakin') throw new Error('seharusnya tidak yakin');
    expect(usul.contohNilai.length).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Langkah 2: Jalankan uji dan pastikan gagal**

```bash
npm test
```

Diharapkan: GAGAL dengan pesan bahwa modul `./usulAturan` tidak ditemukan.

- [ ] **Langkah 3: Tulis implementasi minimal**

Buat `src/core/usulAturan.ts`:

```ts
import { normalisasiTeks } from './normalisasi';
import type { Aturan } from './tipe';

export type UsulAturan =
  | { status: 'usul'; aturan: Aturan; alasan: string }
  | { status: 'tidak-yakin'; alasan: string; contohNilai: string[] };

interface SkalaDikenal {
  nama: string;
  skorMaks: number;
  peta: Record<string, number>;
}

const SKALA: SkalaDikenal[] = [
  {
    nama: 'Likert persetujuan 5 poin (Inggris)',
    skorMaks: 5,
    peta: {
      'strongly disagree': 1,
      disagree: 2,
      neutral: 3,
      agree: 4,
      'strongly agree': 5,
    },
  },
  {
    nama: 'Likert persetujuan 5 poin (Indonesia)',
    skorMaks: 5,
    peta: {
      'sangat tidak setuju': 1,
      'tidak setuju': 2,
      netral: 3,
      setuju: 4,
      'sangat setuju': 5,
    },
  },
];

/** Di bawah ini tidak ada cukup ragam untuk membedakan skala dari sekadar pilihan bebas. */
const MIN_OPSI_BERBEDA = 3;
const MAKS_OPSI_SEBELUM_TEKS_BEBAS = 20;
const PANJANG_RATA_TEKS_BEBAS = 40;
const MAKS_CONTOH = 5;

export function usulkanAturan(nilai: string[]): UsulAturan {
  const jumlahPerBentuk = new Map<string, { teks: string; jumlah: number }>();
  let totalPanjang = 0;
  let totalTerisi = 0;

  for (const satu of nilai) {
    const bentuk = normalisasiTeks(satu);
    if (bentuk === '') continue;

    totalTerisi += 1;
    totalPanjang += bentuk.length;

    const sudah = jumlahPerBentuk.get(bentuk);
    if (sudah === undefined) jumlahPerBentuk.set(bentuk, { teks: satu.trim(), jumlah: 1 });
    else sudah.jumlah += 1;
  }

  if (totalTerisi === 0) {
    return {
      status: 'tidak-yakin',
      alasan: 'Kolom ini tidak berisi satu jawaban pun, sehingga aturannya tidak dapat ditebak.',
      contohNilai: [],
    };
  }

  const contohNilai = [...jumlahPerBentuk.values()]
    .sort((a, b) => {
      if (b.jumlah !== a.jumlah) return b.jumlah - a.jumlah;
      return a.teks.localeCompare(b.teks);
    })
    .slice(0, MAKS_CONTOH)
    .map((satu) => satu.teks);

  const bentukTerlihat = [...jumlahPerBentuk.keys()];

  if (
    bentukTerlihat.length > MAKS_OPSI_SEBELUM_TEKS_BEBAS ||
    totalPanjang / totalTerisi > PANJANG_RATA_TEKS_BEBAS
  ) {
    return {
      status: 'tidak-yakin',
      alasan:
        'Isi kolom ini tampak berupa teks bebas, bukan pilihan. ' +
        'Bila memang jawaban terbuka, pilih aturan abaikan agar tidak ikut perhitungan.',
      contohNilai,
    };
  }

  if (bentukTerlihat.length < MIN_OPSI_BERBEDA) {
    return {
      status: 'tidak-yakin',
      alasan:
        `Kolom ini hanya memuat ${bentukTerlihat.length} jawaban berbeda, ` +
        'terlalu sedikit untuk mengenali skalanya. Tentukan aturannya sendiri.',
      contohNilai,
    };
  }

  for (const skala of SKALA) {
    const semuaDikenal = bentukTerlihat.every((bentuk) => skala.peta[bentuk] !== undefined);
    if (!semuaDikenal) continue;

    return {
      status: 'usul',
      aturan: { jenis: 'peta-opsi', peta: skala.peta, skorMaks: skala.skorMaks },
      alasan:
        `Seluruh jawaban pada kolom ini termasuk ${skala.nama}. ` +
        `Skor maksimum tetap ${skala.skorMaks} meski tidak semua opsinya muncul di data.`,
    };
  }

  return {
    status: 'tidak-yakin',
    alasan:
      'Jawaban pada kolom ini tidak cocok dengan skala mana pun yang dikenali. ' +
      'Susun petanya sendiri, atau pilih aturan abaikan.',
    contohNilai,
  };
}
```

`peta` yang dikembalikan adalah objek yang sama dengan konstanta `SKALA`. Ini disengaja dan aman: seluruh jalur yang membacanya — `scorer.ts`, `periksaSkema.ts` — hanya membaca, tidak pernah menulis.

- [ ] **Langkah 4: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, seluruh uji sebelumnya plus 14 uji baru.

- [ ] **Langkah 5: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

- [ ] **Langkah 6: Commit**

```bash
git add src/core/usulAturan.ts src/core/usulAturan.test.ts
git commit -m "feat(core): usulkan aturan skor dari isi kolom, berisik saat ragu"
```

---

### Tugas 3: `bangunRancangan` dan `finalkanSkema`

**Berkas:**
- Buat: `src/core/rancanganSkema.ts`
- Uji: `src/core/rancanganSkema.test.ts`

**Antarmuka:**
- Memakai: `tebakPeranKolom` dan tipe `PetaPeran`, `Peran` dari `./peranKolom`; `usulkanAturan` dari `./usulAturan`; tipe `Aturan`, `ButirSkema`, `PerlakuanKosong`, `Skema` dari `./tipe`
- Menghasilkan: `bangunRancangan(skemaId, header, baris): RancanganSkema` dan `finalkanSkema(rancangan): HasilFinalisasi`; tipe `ButirRancangan`, `RancanganSkema`, `MasalahRancangan`, `HasilFinalisasi` diekspor dari `rancanganSkema.ts`

Inilah tempat Batasan Global 13 ditegakkan. `finalkanSkema` adalah satu-satunya jalan lahirnya sebuah `Skema` dari data impor, dan ia menolak selama masih ada satu keputusan pun yang menggantung. Layar pemetaan nanti tidak perlu menegakkan apa pun sendiri — tipe yang menegakkannya.

Perhatikan pembagian kerja dengan `periksaSkema` dari Rencana 2: `finalkanSkema` menjawab "apakah admin sudah memutuskan semuanya", sedangkan `periksaSkema` menjawab "apakah keputusan itu cocok dengan data yang ada". Keduanya dijalankan berurutan, dan keduanya harus lulus.

- [ ] **Langkah 1: Tulis uji yang gagal**

Buat `src/core/rancanganSkema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bangunRancangan, finalkanSkema } from './rancanganSkema';
import type { RancanganSkema } from './rancanganSkema';

const HEADER = ['Timestamp', 'Email Address', 'Name', 'Age', 'q1', 'q11'];

function baris(): Record<string, string>[] {
  const likert = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
  return likert.map((opsi, i) => ({
    Timestamp: `1/${i + 1}/2026 08:00:00`,
    'Email Address': `peserta${i}@example.com`,
    Name: i === 0 ? '' : `Peserta ${i}`,
    Age: String(18 + i),
    q1: opsi,
    q11: i % 2 === 0 ? 'Yes' : 'Maybe',
  }));
}

function butirDari(rancangan: RancanganSkema, kolomAsal: string) {
  return rancangan.butir.find((b) => b.kolomAsal === kolomAsal);
}

describe('bangunRancangan', () => {
  it('menaikkan kolom berskala dikenal menjadi pertanyaan', () => {
    const rancangan = bangunRancangan('s1', HEADER, baris());
    const q1 = rancangan.butir.find((b) => b.kolomAsal === 'q1');
    expect(q1?.aturan).not.toBe(null);
    expect(rancangan.peran.kolom.find((k) => k.header === 'q1')?.peran).toBe('pertanyaan');
  });

  it('membiarkan kolom Yes/No/Maybe belum diputuskan', () => {
    const rancangan = bangunRancangan('s1', HEADER, baris());
    const q11 = butirDari(rancangan, 'q11');
    expect(q11?.aturan).toBe(null);
    expect(q11?.contohNilai.length).toBeGreaterThan(0);
    expect(rancangan.peran.kolom.find((k) => k.header === 'q11')?.peran).toBe('belum-diputuskan');
  });

  it('tidak membuat butir untuk kolom identitas', () => {
    const rancangan = bangunRancangan('s1', HEADER, baris());
    expect(butirDari(rancangan, 'Email Address')).toBeUndefined();
    expect(butirDari(rancangan, 'Timestamp')).toBeUndefined();
    expect(butirDari(rancangan, 'Name')).toBeUndefined();
  });

  it('membuat butir untuk kolom bukan identitas yang belum diputuskan', () => {
    const rancangan = bangunRancangan('s1', HEADER, baris());
    expect(butirDari(rancangan, 'Age')).toBeDefined();
  });

  it('tidak memilih perlakuan kosong sendiri', () => {
    // Abaikan dan nol sama-sama sah tetapi menghasilkan angka berbeda (spec 7.2 butir 3).
    expect(bangunRancangan('s1', HEADER, baris()).perlakuanKosong).toBe(null);
  });

  it('memberi dimensi kosong dan bobot satu sebagai titik awal', () => {
    const q1 = butirDari(bangunRancangan('s1', HEADER, baris()), 'q1');
    expect(q1?.dimensi).toBe('');
    expect(q1?.bobot).toBe(1);
  });

  it('memakai header asli sebagai label awal', () => {
    expect(butirDari(bangunRancangan('s1', HEADER, baris()), 'q1')?.label).toBe('q1');
  });

  it('membawa skemaId apa adanya', () => {
    expect(bangunRancangan('skemaA', HEADER, baris()).skemaId).toBe('skemaA');
  });
});

function rancanganSiap(): RancanganSkema {
  const rancangan = bangunRancangan('s1', HEADER, baris());
  rancangan.perlakuanKosong = 'abaikan';

  for (const kolom of rancangan.peran.kolom) {
    if (kolom.peran === 'belum-diputuskan') kolom.peran = kolom.header === 'Age' ? 'meta' : 'pertanyaan';
  }
  for (const butir of rancangan.butir) {
    butir.dimensi = 'kemudahan';
    if (butir.aturan === null) butir.aturan = { jenis: 'abaikan' };
  }
  return rancangan;
}

describe('finalkanSkema menolak rancangan yang belum diputuskan', () => {
  it('menghasilkan Skema bila seluruhnya sudah diputuskan', () => {
    const hasil = finalkanSkema(rancanganSiap());
    expect(hasil.status).toBe('siap');
    if (hasil.status !== 'siap') return;
    expect(hasil.skema.skemaId).toBe('s1');
    expect(hasil.skema.perlakuanKosong).toBe('abaikan');
    expect(hasil.skema.butir.map((b) => b.kolomAsal)).toEqual(['q1', 'q11']);
  });

  it('menolak bila perlakuan kosong belum dipilih', () => {
    const rancangan = rancanganSiap();
    rancangan.perlakuanKosong = null;
    const hasil = finalkanSkema(rancangan);
    expect(hasil.status).toBe('belum-lengkap');
    if (hasil.status !== 'belum-lengkap') return;
    expect(hasil.masalah.map((m) => m.jenis)).toContain('perlakuan-kosong-belum-dipilih');
  });

  it('menolak bila masih ada aturan yang kosong', () => {
    const rancangan = rancanganSiap();
    const q11 = rancangan.butir.find((b) => b.kolomAsal === 'q11');
    if (q11 !== undefined) q11.aturan = null;
    const hasil = finalkanSkema(rancangan);
    expect(hasil.status).toBe('belum-lengkap');
    if (hasil.status !== 'belum-lengkap') return;
    expect(hasil.masalah.map((m) => m.jenis)).toContain('aturan-belum-diputuskan');
  });

  it('menolak bila masih ada dimensi yang kosong', () => {
    const rancangan = rancanganSiap();
    const q1 = rancangan.butir.find((b) => b.kolomAsal === 'q1');
    if (q1 !== undefined) q1.dimensi = '';
    const hasil = finalkanSkema(rancangan);
    if (hasil.status !== 'belum-lengkap') throw new Error('seharusnya belum lengkap');
    expect(hasil.masalah.map((m) => m.jenis)).toContain('dimensi-kosong');
  });

  it('menolak bila masih ada kolom tanpa peran', () => {
    const rancangan = rancanganSiap();
    const age = rancangan.peran.kolom.find((k) => k.header === 'Age');
    if (age !== undefined) age.peran = 'belum-diputuskan';
    const hasil = finalkanSkema(rancangan);
    if (hasil.status !== 'belum-lengkap') throw new Error('seharusnya belum lengkap');
    expect(hasil.masalah.map((m) => m.jenis)).toContain('peran-belum-diputuskan');
  });

  it('menolak bila tidak ada kolom email sama sekali', () => {
    const rancangan = bangunRancangan('s1', ['q1'], [{ q1: 'Agree' }, { q1: 'Neutral' }]);
    rancangan.perlakuanKosong = 'abaikan';
    for (const kolom of rancangan.peran.kolom) kolom.peran = 'pertanyaan';
    for (const butir of rancangan.butir) {
      butir.dimensi = 'd';
      if (butir.aturan === null) butir.aturan = { jenis: 'abaikan' };
    }
    const hasil = finalkanSkema(rancangan);
    if (hasil.status !== 'belum-lengkap') throw new Error('seharusnya belum lengkap');
    expect(hasil.masalah.map((m) => m.jenis)).toContain('tanpa-kolom-email');
  });

  it('menolak bila peran identitasnya masih rancu', () => {
    const rancangan = bangunRancangan(
      's1',
      ['Email Address', 'Email Orang Tua', 'q1'],
      [{ 'Email Address': 'a@x.com', 'Email Orang Tua': 'b@x.com', q1: 'Agree' }],
    );
    rancangan.perlakuanKosong = 'abaikan';
    const hasil = finalkanSkema(rancangan);
    if (hasil.status !== 'belum-lengkap') throw new Error('seharusnya belum lengkap');
    expect(hasil.masalah.map((m) => m.jenis)).toContain('peran-rancu');
  });

  it('melaporkan seluruh masalah sekaligus, bukan berhenti di yang pertama', () => {
    const rancangan = bangunRancangan('s1', HEADER, baris());
    const hasil = finalkanSkema(rancangan);
    if (hasil.status !== 'belum-lengkap') throw new Error('seharusnya belum lengkap');
    expect(hasil.masalah.length).toBeGreaterThanOrEqual(3);
  });

  it('tidak menjadikan kolom bermeta sebagai butir skema', () => {
    const hasil = finalkanSkema(rancanganSiap());
    if (hasil.status !== 'siap') throw new Error('seharusnya siap');
    expect(hasil.skema.butir.map((b) => b.kolomAsal)).not.toContain('Age');
  });
});
```

- [ ] **Langkah 2: Jalankan uji dan pastikan gagal**

```bash
npm test
```

Diharapkan: GAGAL dengan pesan bahwa modul `./rancanganSkema` tidak ditemukan.

- [ ] **Langkah 3: Tulis implementasi minimal**

Buat `src/core/rancanganSkema.ts`:

```ts
import { tebakPeranKolom } from './peranKolom';
import type { PetaPeran } from './peranKolom';
import { usulkanAturan } from './usulAturan';
import type { Aturan, ButirSkema, PerlakuanKosong, Skema } from './tipe';

export interface ButirRancangan {
  kolomAsal: string;
  label: string;
  /** Kosong sampai admin mengelompokkannya. Finalisasi menolak yang masih kosong. */
  dimensi: string;
  /** `null` berarti belum diputuskan — bukan berarti abaikan. */
  aturan: Aturan | null;
  bobot: number;
  /** Mengapa aturan ini diusulkan, atau mengapa sistem tidak yakin. */
  alasan: string;
  contohNilai: string[];
}

export interface RancanganSkema {
  skemaId: string;
  /** `null` sampai admin memilih. Abaikan dan nol menghasilkan angka berbeda. */
  perlakuanKosong: PerlakuanKosong | null;
  peran: PetaPeran;
  butir: ButirRancangan[];
}

export type MasalahRancangan =
  | { jenis: 'tanpa-kolom-email' }
  | { jenis: 'peran-rancu'; peran: string; calon: string[] }
  | { jenis: 'peran-belum-diputuskan'; header: string }
  | { jenis: 'aturan-belum-diputuskan'; kolomAsal: string }
  | { jenis: 'dimensi-kosong'; kolomAsal: string }
  | { jenis: 'perlakuan-kosong-belum-dipilih' };

export type HasilFinalisasi =
  | { status: 'siap'; skema: Skema }
  | { status: 'belum-lengkap'; masalah: MasalahRancangan[] };

const PERAN_IDENTITAS = ['email', 'nama', 'waktu'];

export function bangunRancangan(
  skemaId: string,
  header: string[],
  baris: Record<string, string>[],
): RancanganSkema {
  const peran = tebakPeranKolom(header);
  const butir: ButirRancangan[] = [];

  for (const kolom of peran.kolom) {
    if (PERAN_IDENTITAS.includes(kolom.peran)) continue;

    const nilai: string[] = [];
    for (const satu of baris) {
      const isi = satu[kolom.header];
      if (isi !== undefined) nilai.push(isi);
    }

    const usul = usulkanAturan(nilai);

    if (usul.status === 'usul') {
      kolom.peran = 'pertanyaan';
      butir.push({
        kolomAsal: kolom.header,
        label: kolom.header,
        dimensi: '',
        aturan: usul.aturan,
        bobot: 1,
        alasan: usul.alasan,
        contohNilai: [],
      });
      continue;
    }

    butir.push({
      kolomAsal: kolom.header,
      label: kolom.header,
      dimensi: '',
      aturan: null,
      bobot: 1,
      alasan: usul.alasan,
      contohNilai: usul.contohNilai,
    });
  }

  return { skemaId, perlakuanKosong: null, peran, butir };
}

export function finalkanSkema(rancangan: RancanganSkema): HasilFinalisasi {
  const masalah: MasalahRancangan[] = [];

  for (const rancu of rancangan.peran.rancu) {
    masalah.push({ jenis: 'peran-rancu', peran: rancu.peran, calon: rancu.calon });
  }

  let adaEmail = false;
  const peranPerHeader = new Map<string, string>();

  for (const kolom of rancangan.peran.kolom) {
    peranPerHeader.set(kolom.header, kolom.peran);
    if (kolom.peran === 'email') adaEmail = true;
    if (kolom.peran === 'belum-diputuskan') {
      masalah.push({ jenis: 'peran-belum-diputuskan', header: kolom.header });
    }
  }

  if (!adaEmail) masalah.push({ jenis: 'tanpa-kolom-email' });
  if (rancangan.perlakuanKosong === null) {
    masalah.push({ jenis: 'perlakuan-kosong-belum-dipilih' });
  }

  const butirSkema: ButirSkema[] = [];

  for (const butir of rancangan.butir) {
    if (peranPerHeader.get(butir.kolomAsal) !== 'pertanyaan') continue;

    if (butir.aturan === null) {
      masalah.push({ jenis: 'aturan-belum-diputuskan', kolomAsal: butir.kolomAsal });
      continue;
    }
    if (butir.dimensi === '') {
      masalah.push({ jenis: 'dimensi-kosong', kolomAsal: butir.kolomAsal });
      continue;
    }

    butirSkema.push({
      kolomAsal: butir.kolomAsal,
      label: butir.label,
      dimensi: butir.dimensi,
      aturan: butir.aturan,
      bobot: butir.bobot,
    });
  }

  if (masalah.length > 0) return { status: 'belum-lengkap', masalah };

  const perlakuanKosong = rancangan.perlakuanKosong;
  if (perlakuanKosong === null) {
    return { status: 'belum-lengkap', masalah: [{ jenis: 'perlakuan-kosong-belum-dipilih' }] };
  }

  return {
    status: 'siap',
    skema: { skemaId: rancangan.skemaId, perlakuanKosong, butir: butirSkema },
  };
}
```

Pemeriksaan `perlakuanKosong === null` yang kedua terlihat berlebihan tetapi diperlukan: TypeScript tidak membawa penyempitan tipe dari cabang `masalah.push` di atas. Menuliskannya ulang lebih jujur daripada memakai penegasan tipe.

- [ ] **Langkah 4: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, seluruh uji sebelumnya plus 18 uji baru.

- [ ] **Langkah 5: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

- [ ] **Langkah 6: Commit**

```bash
git add src/core/rancanganSkema.ts src/core/rancanganSkema.test.ts
git commit -m "feat(core): rancangan skema dan finalisasi yang menolak keputusan menggantung"
```

---

### Tugas 4: `bangunResponden`

**Berkas:**
- Buat: `src/core/bangunResponden.ts`
- Uji: `src/core/bangunResponden.test.ts`

**Antarmuka:**
- Memakai: `idResponden` dan `normalisasiEmail` dari `./normalisasi`; tipe `PetaPeran` dari `./peranKolom`; tipe `RespondenSesi` dari `./sesi`; tipe `FungsiHash` dan `Skema` dari `./tipe`
- Menghasilkan: `bangunResponden(baris, nomorBaris, peran, skema, hash): HasilPemetaan`; tipe `HasilPemetaan` diekspor dari `bangunResponden.ts`

Ini menggantikan `keResponden` yang selama ini hanya hidup di dalam `src/io/alurLengkap.test.ts`. Tugas 7 akan menghapus salinan uji itu dan memanggil fungsi ini.

Dua hal yang wajib tidak dilakukannya: membuang baris beremail kosong, dan menganggap kolom yang tidak dikenal sebagai jawaban. Baris tanpa email dikembalikan sebagai daftar nomor baris agar admin dapat menindaknya — tinjauan akhir Rencana 2 menemukan bahwa seluruh baris semacam itu memadat menjadi satu orang karena hash dari teks kosong selalu sama.

- [ ] **Langkah 1: Tulis uji yang gagal**

Buat `src/core/bangunResponden.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bangunResponden } from './bangunResponden';
import { hashPalsu } from './__fixtures__/hash';
import { tebakPeranKolom } from './peranKolom';
import type { PetaPeran } from './peranKolom';
import type { Skema } from './tipe';

const SKEMA: Skema = {
  skemaId: 's1',
  perlakuanKosong: 'abaikan',
  butir: [
    {
      kolomAsal: 'q1',
      label: 'q1',
      dimensi: 'd',
      aturan: { jenis: 'peta-opsi', peta: { agree: 4, neutral: 3 }, skorMaks: 5 },
      bobot: 1,
    },
  ],
};

function peran(header: string[]): PetaPeran {
  const peta = tebakPeranKolom(header);
  for (const kolom of peta.kolom) {
    if (kolom.peran === 'belum-diputuskan') {
      kolom.peran = kolom.header === 'q1' ? 'pertanyaan' : 'meta';
    }
  }
  return peta;
}

const HEADER = ['Timestamp', 'Email Address', 'Name', 'Age', 'q1'];

function baris(isi: Partial<Record<string, string>>[]): Record<string, string>[] {
  return isi.map((satu) => {
    const lengkap: Record<string, string> = {};
    for (const kolom of HEADER) {
      const nilai = satu[kolom];
      lengkap[kolom] = nilai === undefined ? '' : nilai;
    }
    return lengkap;
  });
}

describe('bangunResponden', () => {
  it('memakai email sebagai kunci identitas', () => {
    const hasil = bangunResponden(
      baris([{ 'Email Address': 'Ani@Example.COM', Name: 'Ani', q1: 'Agree' }]),
      [2],
      peran(HEADER),
      SKEMA,
      hashPalsu,
    );
    expect(hasil.responden[0]?.email).toBe('ani@example.com');
    expect(hasil.responden[0]?.id).toBe(hashPalsu('ani@example.com').slice(0, 16));
  });

  it('memperlakukan nama kosong sebagai null, bukan teks kosong', () => {
    const hasil = bangunResponden(
      baris([{ 'Email Address': 'a@x.com', Name: '', q1: 'Agree' }]),
      [2],
      peran(HEADER),
      SKEMA,
      hashPalsu,
    );
    expect(hasil.responden[0]?.nama).toBe(null);
  });

  it('hanya mengambil kolom berperan meta sebagai meta', () => {
    const hasil = bangunResponden(
      baris([{ 'Email Address': 'a@x.com', Age: '20', q1: 'Agree' }]),
      [2],
      peran(HEADER),
      SKEMA,
      hashPalsu,
    );
    expect(hasil.responden[0]?.meta).toEqual({ Age: '20' });
  });

  it('hanya mengambil kolom yang ada di skema sebagai jawaban', () => {
    const hasil = bangunResponden(
      baris([{ 'Email Address': 'a@x.com', Age: '20', q1: 'Agree' }]),
      [2],
      peran(HEADER),
      SKEMA,
      hashPalsu,
    );
    const satu = hasil.responden[0];
    expect(satu).toBeDefined();
    expect(Object.keys(satu === undefined ? {} : satu.jawaban)).toEqual(['q1']);
  });

  it('membawa cap waktu terpisah dari meta', () => {
    const hasil = bangunResponden(
      baris([{ 'Email Address': 'a@x.com', Timestamp: '3/4/2026 08:00:00', q1: 'Agree' }]),
      [2],
      peran(HEADER),
      SKEMA,
      hashPalsu,
    );
    const id = hashPalsu('a@x.com').slice(0, 16);
    expect(hasil.waktuKirim.get(id)).toBe('3/4/2026 08:00:00');
    expect(hasil.responden[0]?.meta['Timestamp']).toBeUndefined();
  });

  it('bekerja tanpa kolom cap waktu sama sekali', () => {
    const tanpaWaktu = ['Email Address', 'q1'];
    const hasil = bangunResponden(
      [{ 'Email Address': 'a@x.com', q1: 'Agree' }],
      [2],
      peran(tanpaWaktu),
      SKEMA,
      hashPalsu,
    );
    expect(hasil.responden).toHaveLength(1);
    expect(hasil.waktuKirim.size).toBe(0);
  });
});

describe('bangunResponden tidak menyembunyikan baris bermasalah', () => {
  it('melaporkan nomor baris yang emailnya kosong', () => {
    // Hash dari teks kosong selalu sama, sehingga seluruh baris semacam ini
    // akan memadat menjadi satu orang bila dibiarkan lewat diam-diam.
    const hasil = bangunResponden(
      baris([
        { 'Email Address': 'a@x.com', q1: 'Agree' },
        { 'Email Address': '', q1: 'Neutral' },
        { 'Email Address': '   ', q1: 'Agree' },
      ]),
      [2, 3, 4],
      peran(HEADER),
      SKEMA,
      hashPalsu,
    );
    expect(hasil.barisTanpaEmail).toEqual([3, 4]);
  });

  it('tetap mengembalikan baris beremail kosong, tidak membuangnya', () => {
    const hasil = bangunResponden(
      baris([{ 'Email Address': '', q1: 'Agree' }]),
      [2],
      peran(HEADER),
      SKEMA,
      hashPalsu,
    );
    expect(hasil.responden).toHaveLength(1);
  });

  it('melaporkan bila tidak ada kolom email pada peta peran', () => {
    const tanpaEmail = tebakPeranKolom(['q1']);
    for (const kolom of tanpaEmail.kolom) kolom.peran = 'pertanyaan';
    const hasil = bangunResponden([{ q1: 'Agree' }], [2], tanpaEmail, SKEMA, hashPalsu);
    expect(hasil.responden).toHaveLength(0);
    expect(hasil.tanpaKolomEmail).toBe(true);
  });

  it('mengembalikan daftar kosong untuk masukan kosong', () => {
    const hasil = bangunResponden([], [], peran(HEADER), SKEMA, hashPalsu);
    expect(hasil.responden).toHaveLength(0);
    expect(hasil.barisTanpaEmail).toHaveLength(0);
    expect(hasil.tanpaKolomEmail).toBe(false);
  });
});
```

- [ ] **Langkah 2: Jalankan uji dan pastikan gagal**

```bash
npm test
```

Diharapkan: GAGAL dengan pesan bahwa modul `./bangunResponden` tidak ditemukan.

- [ ] **Langkah 3: Tulis implementasi minimal**

Buat `src/core/bangunResponden.ts`:

```ts
import { idResponden, normalisasiEmail } from './normalisasi';
import type { PetaPeran } from './peranKolom';
import type { RespondenSesi } from './sesi';
import type { FungsiHash, Skema } from './tipe';

export interface HasilPemetaan {
  responden: RespondenSesi[];
  /** respondenId -> cap waktu mentah, untuk pemecah seri peringkat (spec 8.1). */
  waktuKirim: Map<string, string>;
  /** Nomor baris asal yang emailnya kosong. Barisnya tetap dikembalikan, tidak dibuang. */
  barisTanpaEmail: number[];
  /** Benar bila peta peran tidak memuat satu pun kolom email. */
  tanpaKolomEmail: boolean;
}

export function bangunResponden(
  baris: Record<string, string>[],
  nomorBaris: number[],
  peran: PetaPeran,
  skema: Skema,
  hash: FungsiHash,
): HasilPemetaan {
  let kolomEmail: string | undefined;
  let kolomNama: string | undefined;
  let kolomWaktu: string | undefined;
  const kolomMeta: string[] = [];

  for (const kolom of peran.kolom) {
    if (kolom.peran === 'email') kolomEmail = kolom.header;
    else if (kolom.peran === 'nama') kolomNama = kolom.header;
    else if (kolom.peran === 'waktu') kolomWaktu = kolom.header;
    else if (kolom.peran === 'meta') kolomMeta.push(kolom.header);
  }

  if (kolomEmail === undefined) {
    return { responden: [], waktuKirim: new Map(), barisTanpaEmail: [], tanpaKolomEmail: true };
  }

  const kolomJawaban = skema.butir.map((butir) => butir.kolomAsal);
  const responden: RespondenSesi[] = [];
  const waktuKirim = new Map<string, string>();
  const barisTanpaEmail: number[] = [];

  for (let i = 0; i < baris.length; i += 1) {
    const satu = baris[i];
    if (satu === undefined) continue;

    const emailMentah = satu[kolomEmail];
    const email = normalisasiEmail(emailMentah === undefined ? '' : emailMentah);

    if (email === '') {
      const nomor = nomorBaris[i];
      if (nomor !== undefined) barisTanpaEmail.push(nomor);
    }

    const id = idResponden(email, hash);

    let nama: string | null = null;
    if (kolomNama !== undefined) {
      const isi = satu[kolomNama];
      if (isi !== undefined && isi.trim() !== '') nama = isi.trim();
    }

    const meta: Record<string, string> = {};
    for (const kolom of kolomMeta) {
      const isi = satu[kolom];
      if (isi !== undefined) meta[kolom] = isi;
    }

    const jawaban: Record<string, string> = {};
    for (const kolom of kolomJawaban) {
      const isi = satu[kolom];
      if (isi !== undefined) jawaban[kolom] = isi;
    }

    if (kolomWaktu !== undefined) {
      const isi = satu[kolomWaktu];
      if (isi !== undefined && isi.trim() !== '') waktuKirim.set(id, isi.trim());
    }

    responden.push({ id, email, nama, jawaban, meta });
  }

  return { responden, waktuKirim, barisTanpaEmail, tanpaKolomEmail: false };
}
```

- [ ] **Langkah 4: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, seluruh uji sebelumnya plus 10 uji baru.

- [ ] **Langkah 5: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

- [ ] **Langkah 6: Commit**

```bash
git add src/core/bangunResponden.ts src/core/bangunResponden.test.ts
git commit -m "feat(core): baris impor menjadi RespondenSesi tanpa menyembunyikan baris bermasalah"
```

---

### Tugas 5: `urutkanPeringkat`

**Berkas:**
- Buat: `src/core/peringkat.ts`
- Uji: `src/core/peringkat.test.ts`

**Antarmuka:**
- Memakai: —
- Menghasilkan: `urutkanPeringkat(baris: BarisPeringkat[], bandingWaktu: BandingWaktu): BarisTerperingkat[]`; tipe `BandingWaktu`, `BarisPeringkat`, `BarisTerperingkat` diekspor dari `peringkat.ts`

Ini menutup §8.1 yang sampai sekarang belum punya pemilik: *"nilai menurun; bila seri, jumlah butir terjawab lebih banyak menang; bila masih seri, cap waktu pengiriman lebih awal menang."* Rencana 2 menundanya karena cap waktu belum pernah diimpor; Tugas 4 baru saja memetakannya.

Pembanding waktu disuntikkan sebagai argumen (Batasan Global 14). `core` tidak boleh menyentuh `Date`, dan format tanggal Google Forms berbeda-beda menurut lokal akun — itu pengetahuan tentang data nyata, yang tempatnya di `io`.

Dua keputusan yang perlu dinyatakan terang-terangan karena spec tidak menyebutnya. Responden bernilai `null` tidak diberi peringkat sama sekali; memberinya peringkat terakhir berarti menyamakan "tidak menjawab apa pun" dengan "menjawab tetapi nilainya paling rendah". Dan bila dua orang sama persis pada ketiga kunci, keduanya berbagi nomor peringkat yang sama, lalu nomor berikutnya melompat — peringkat kompetisi baku.

- [ ] **Langkah 1: Tulis uji yang gagal**

Buat `src/core/peringkat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { urutkanPeringkat } from './peringkat';
import type { BandingWaktu, BarisPeringkat } from './peringkat';

/** Pembanding uji: cap waktu ditulis sebagai angka agar urutannya jelas terbaca. */
const bandingAngka: BandingWaktu = (a, b) => Number(a) - Number(b);

function baris(
  isi: { id: string; nilai: number | null; terjawab?: number; waktu?: string }[],
): BarisPeringkat[] {
  return isi.map((satu) => ({
    respondenId: satu.id,
    nilai: satu.nilai,
    jumlahTerjawab: satu.terjawab === undefined ? 0 : satu.terjawab,
    waktuKirim: satu.waktu === undefined ? null : satu.waktu,
  }));
}

describe('urutkanPeringkat', () => {
  it('mengurutkan dari nilai tertinggi', () => {
    const hasil = urutkanPeringkat(
      baris([
        { id: 'b', nilai: 70 },
        { id: 'a', nilai: 90 },
        { id: 'c', nilai: 80 },
      ]),
      bandingAngka,
    );
    expect(hasil.map((h) => h.respondenId)).toEqual(['a', 'c', 'b']);
    expect(hasil.map((h) => h.peringkat)).toEqual([1, 2, 3]);
  });

  it('memenangkan butir terjawab lebih banyak saat nilai seri', () => {
    const hasil = urutkanPeringkat(
      baris([
        { id: 'sedikit', nilai: 80, terjawab: 10 },
        { id: 'banyak', nilai: 80, terjawab: 18 },
      ]),
      bandingAngka,
    );
    expect(hasil[0]?.respondenId).toBe('banyak');
  });

  it('memenangkan cap waktu lebih awal saat nilai dan butir terjawab seri', () => {
    const hasil = urutkanPeringkat(
      baris([
        { id: 'telat', nilai: 80, terjawab: 10, waktu: '200' },
        { id: 'awal', nilai: 80, terjawab: 10, waktu: '100' },
      ]),
      bandingAngka,
    );
    expect(hasil[0]?.respondenId).toBe('awal');
  });

  it('menaruh yang tidak punya cap waktu di belakang yang punya', () => {
    const hasil = urutkanPeringkat(
      baris([
        { id: 'tanpa', nilai: 80, terjawab: 10 },
        { id: 'punya', nilai: 80, terjawab: 10, waktu: '999' },
      ]),
      bandingAngka,
    );
    expect(hasil[0]?.respondenId).toBe('punya');
  });

  it('memberi nomor peringkat yang sama bila seluruh kuncinya sama', () => {
    const hasil = urutkanPeringkat(
      baris([
        { id: 'a', nilai: 80, terjawab: 10, waktu: '100' },
        { id: 'b', nilai: 80, terjawab: 10, waktu: '100' },
        { id: 'c', nilai: 70, terjawab: 10, waktu: '100' },
      ]),
      bandingAngka,
    );
    expect(hasil.map((h) => h.peringkat)).toEqual([1, 1, 3]);
  });

  it('tidak memberi peringkat kepada responden bernilai null', () => {
    // Tidak menjawab apa pun bukan sama dengan menjawab dan bernilai terendah.
    const hasil = urutkanPeringkat(
      baris([
        { id: 'kosong', nilai: null },
        { id: 'ada', nilai: 40 },
      ]),
      bandingAngka,
    );
    expect(hasil[0]?.respondenId).toBe('ada');
    expect(hasil[0]?.peringkat).toBe(1);
    expect(hasil[1]?.respondenId).toBe('kosong');
    expect(hasil[1]?.peringkat).toBe(null);
  });

  it('tidak mengubah larik masukan', () => {
    const masukan = baris([
      { id: 'b', nilai: 70 },
      { id: 'a', nilai: 90 },
    ]);
    urutkanPeringkat(masukan, bandingAngka);
    expect(masukan.map((m) => m.respondenId)).toEqual(['b', 'a']);
  });

  it('mengembalikan larik kosong untuk masukan kosong', () => {
    expect(urutkanPeringkat([], bandingAngka)).toHaveLength(0);
  });

  it('memberi peringkat null kepada semua bila tidak ada satu pun nilai', () => {
    const hasil = urutkanPeringkat(baris([{ id: 'a', nilai: null }]), bandingAngka);
    expect(hasil[0]?.peringkat).toBe(null);
  });
});
```

- [ ] **Langkah 2: Jalankan uji dan pastikan gagal**

```bash
npm test
```

Diharapkan: GAGAL dengan pesan bahwa modul `./peringkat` tidak ditemukan.

- [ ] **Langkah 3: Tulis implementasi minimal**

Buat `src/core/peringkat.ts`:

```ts
/** Disuntikkan dari luar: format cap waktu adalah urusan data nyata, bukan perhitungan. */
export type BandingWaktu = (a: string, b: string) => number;

export interface BarisPeringkat {
  respondenId: string;
  nilai: number | null;
  jumlahTerjawab: number;
  waktuKirim: string | null;
}

export interface BarisTerperingkat extends BarisPeringkat {
  /** `null` bila nilainya null — tidak menjawab bukan berarti peringkat terakhir. */
  peringkat: number | null;
}

function banding(a: BarisPeringkat, b: BarisPeringkat, bandingWaktu: BandingWaktu): number {
  if (a.nilai === null && b.nilai === null) return 0;
  if (a.nilai === null) return 1;
  if (b.nilai === null) return -1;

  if (a.nilai !== b.nilai) return b.nilai - a.nilai;
  if (a.jumlahTerjawab !== b.jumlahTerjawab) return b.jumlahTerjawab - a.jumlahTerjawab;

  if (a.waktuKirim === null && b.waktuKirim === null) return 0;
  if (a.waktuKirim === null) return 1;
  if (b.waktuKirim === null) return -1;

  return bandingWaktu(a.waktuKirim, b.waktuKirim);
}

export function urutkanPeringkat(
  baris: BarisPeringkat[],
  bandingWaktu: BandingWaktu,
): BarisTerperingkat[] {
  const terurut = [...baris].sort((a, b) => banding(a, b, bandingWaktu));
  const hasil: BarisTerperingkat[] = [];

  let peringkatTerakhir = 0;
  let sudahDiberi = 0;

  for (const satu of terurut) {
    if (satu.nilai === null) {
      hasil.push({ ...satu, peringkat: null });
      continue;
    }

    sudahDiberi += 1;
    const sebelumnya = hasil[hasil.length - 1];

    if (sebelumnya !== undefined && banding(sebelumnya, satu, bandingWaktu) === 0) {
      hasil.push({ ...satu, peringkat: peringkatTerakhir });
      continue;
    }

    peringkatTerakhir = sudahDiberi;
    hasil.push({ ...satu, peringkat: peringkatTerakhir });
  }

  return hasil;
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

- [ ] **Langkah 6: Commit**

```bash
git add src/core/peringkat.ts src/core/peringkat.test.ts
git commit -m "feat(core): urutan peringkat dengan pemecah seri sesuai spec 8.1"
```

---

### Tugas 6: Pembanding cap waktu Google Forms

**Berkas:**
- Buat: `src/io/waktu.ts`
- Uji: `src/io/waktu.test.ts`

**Antarmuka:**
- Memakai: tipe `BandingWaktu` dari `../core/peringkat`
- Menghasilkan: `tebakFormatTanggal(capWaktu: string[]): HasilTebakFormat` dan `buatBandingWaktu(format: FormatTanggal): BandingWaktu`; tipe `FormatTanggal` dan `HasilTebakFormat` diekspor dari `waktu.ts`

Google Forms menuliskan cap waktu menurut lokal pemilik form. `3/4/2026` berarti 3 April bagi sebagian akun dan 4 Maret bagi sebagian lain, dan tidak ada apa pun di dalam berkasnya yang menyatakan mana yang dimaksud.

Menebaknya berarti mengacak urutan peringkat secara diam-diam. Karena itu fungsi ini menyimpulkan format dari bukti — sebuah komponen bernilai di atas 12 hanya mungkin berarti tanggal — dan bila tidak ada bukti sama sekali, ia berkata tidak tahu dan meminta admin memilih.

Penguraiannya sengaja tidak memakai `Date`. Menyusun angka `yyyymmddhhmmss` cukup untuk mengurutkan, dan hasilnya tidak bergantung pada zona waktu maupun lokal mesin yang menjalankannya.

- [ ] **Langkah 1: Tulis uji yang gagal**

Buat `src/io/waktu.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buatBandingWaktu, tebakFormatTanggal } from './waktu';

describe('tebakFormatTanggal', () => {
  it('menyimpulkan DMY bila ada komponen pertama di atas 12', () => {
    const hasil = tebakFormatTanggal(['3/4/2026 08:00:00', '25/4/2026 09:00:00']);
    expect(hasil.status).toBe('yakin');
    if (hasil.status !== 'yakin') return;
    expect(hasil.format).toBe('DMY');
  });

  it('menyimpulkan MDY bila ada komponen kedua di atas 12', () => {
    const hasil = tebakFormatTanggal(['3/4/2026 08:00:00', '4/25/2026 09:00:00']);
    expect(hasil.status).toBe('yakin');
    if (hasil.status !== 'yakin') return;
    expect(hasil.format).toBe('MDY');
  });

  it('mengaku tidak tahu bila seluruh komponen di bawah 13', () => {
    // 3/4/2026 sah dibaca sebagai 3 April maupun 4 Maret. Menebaknya akan
    // mengacak urutan peringkat tanpa ada yang menyadarinya.
    const hasil = tebakFormatTanggal(['3/4/2026 08:00:00', '5/6/2026 09:00:00']);
    expect(hasil.status).toBe('rancu');
    if (hasil.status !== 'rancu') return;
    expect(hasil.alasan.toLowerCase()).toContain('pilih');
  });

  it('mengaku tidak tahu bila buktinya saling bertentangan', () => {
    const hasil = tebakFormatTanggal(['25/4/2026 08:00:00', '4/25/2026 09:00:00']);
    expect(hasil.status).toBe('rancu');
  });

  it('mengabaikan nilai yang bukan cap waktu sama sekali', () => {
    const hasil = tebakFormatTanggal(['', 'bukan tanggal', '25/4/2026 08:00:00']);
    expect(hasil.status).toBe('yakin');
    if (hasil.status !== 'yakin') return;
    expect(hasil.format).toBe('DMY');
  });

  it('mengaku tidak tahu untuk daftar kosong', () => {
    expect(tebakFormatTanggal([]).status).toBe('rancu');
  });
});

describe('buatBandingWaktu', () => {
  const bandingDMY = buatBandingWaktu('DMY');

  it('mengurutkan dua tanggal pada bulan yang sama', () => {
    expect(bandingDMY('3/4/2026 08:00:00', '4/4/2026 08:00:00')).toBeLessThan(0);
  });

  it('mengurutkan lintas bulan dan lintas tahun', () => {
    expect(bandingDMY('31/12/2025 23:59:59', '1/1/2026 00:00:00')).toBeLessThan(0);
  });

  it('mengurutkan berdasarkan jam bila tanggalnya sama', () => {
    expect(bandingDMY('3/4/2026 08:00:00', '3/4/2026 09:30:00')).toBeLessThan(0);
  });

  it('menganggap dua cap waktu yang identik sebagai seri', () => {
    expect(bandingDMY('3/4/2026 08:00:00', '3/4/2026 08:00:00')).toBe(0);
  });

  it('membaca hari dan bulan sesuai format yang dipilih', () => {
    const bandingMDY = buatBandingWaktu('MDY');

    // "3/4" lawan "4/3", dua cap waktu yang sama persis kecuali urutan komponennya.
    // Pada DMY: 3 April lawan 4 Maret, jadi yang pertama LEBIH AKHIR.
    // Pada MDY: 4 Maret lawan 3 April, jadi yang pertama LEBIH AWAL.
    // Inilah tepatnya kekacauan yang terjadi bila formatnya ditebak asal.
    expect(bandingDMY('3/4/2026 08:00:00', '4/3/2026 08:00:00')).toBeGreaterThan(0);
    expect(bandingMDY('3/4/2026 08:00:00', '4/3/2026 08:00:00')).toBeLessThan(0);
  });

  it('menaruh cap waktu yang tidak terbaca di belakang yang terbaca', () => {
    expect(bandingDMY('bukan tanggal', '3/4/2026 08:00:00')).toBeGreaterThan(0);
    expect(bandingDMY('3/4/2026 08:00:00', 'bukan tanggal')).toBeLessThan(0);
  });

  it('menerima cap waktu tanpa detik', () => {
    expect(bandingDMY('3/4/2026 08:00', '3/4/2026 09:00')).toBeLessThan(0);
  });
});
```

- [ ] **Langkah 2: Jalankan uji dan pastikan gagal**

```bash
npm test
```

Diharapkan: GAGAL dengan pesan bahwa modul `./waktu` tidak ditemukan.

- [ ] **Langkah 3: Tulis implementasi minimal**

Buat `src/io/waktu.ts`:

```ts
import type { BandingWaktu } from '../core/peringkat';

export type FormatTanggal = 'DMY' | 'MDY';

export type HasilTebakFormat =
  | { status: 'yakin'; format: FormatTanggal; alasan: string }
  | { status: 'rancu'; alasan: string };

interface Bagian {
  pertama: number;
  kedua: number;
  tahun: number;
  jam: number;
  menit: number;
  detik: number;
}

const POLA = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?/;

function uraikan(capWaktu: string): Bagian | null {
  const cocok = POLA.exec(capWaktu.trim());
  if (cocok === null) return null;

  const [, pertama, kedua, tahun, jam, menit, detik] = cocok;
  if (
    pertama === undefined ||
    kedua === undefined ||
    tahun === undefined ||
    jam === undefined ||
    menit === undefined
  ) {
    return null;
  }

  return {
    pertama: Number(pertama),
    kedua: Number(kedua),
    tahun: Number(tahun),
    jam: Number(jam),
    menit: Number(menit),
    detik: detik === undefined ? 0 : Number(detik),
  };
}

const PETUNJUK =
  'Pilih sendiri format tanggalnya pada layar pemetaan. ' +
  'Salah memilih akan mengubah urutan peringkat tanpa pesan error apa pun.';

export function tebakFormatTanggal(capWaktu: string[]): HasilTebakFormat {
  let buktiDMY = false;
  let buktiMDY = false;

  for (const satu of capWaktu) {
    const bagian = uraikan(satu);
    if (bagian === null) continue;

    if (bagian.pertama > 12) buktiDMY = true;
    if (bagian.kedua > 12) buktiMDY = true;
  }

  if (buktiDMY && buktiMDY) {
    return {
      status: 'rancu',
      alasan:
        'Kolom cap waktu memuat baris yang hanya masuk akal sebagai hari/bulan ' +
        `dan baris lain yang hanya masuk akal sebagai bulan/hari. ${PETUNJUK}`,
    };
  }

  if (buktiDMY) {
    return {
      status: 'yakin',
      format: 'DMY',
      alasan: 'Ada baris yang komponen pertamanya di atas 12, jadi urutannya hari/bulan/tahun.',
    };
  }

  if (buktiMDY) {
    return {
      status: 'yakin',
      format: 'MDY',
      alasan: 'Ada baris yang komponen keduanya di atas 12, jadi urutannya bulan/hari/tahun.',
    };
  }

  return {
    status: 'rancu',
    alasan:
      'Seluruh tanggal pada kolom ini bernilai 12 ke bawah, sehingga hari dan bulan ' +
      `tidak dapat dibedakan. ${PETUNJUK}`,
  };
}

/** Cap waktu tak terbaca diberi kunci terbesar agar selalu jatuh di belakang. */
const KUNCI_TAK_TERBACA = Number.MAX_SAFE_INTEGER;

function kunciUrut(capWaktu: string, format: FormatTanggal): number {
  const bagian = uraikan(capWaktu);
  if (bagian === null) return KUNCI_TAK_TERBACA;

  const hari = format === 'DMY' ? bagian.pertama : bagian.kedua;
  const bulan = format === 'DMY' ? bagian.kedua : bagian.pertama;

  return (
    bagian.tahun * 10000000000 +
    bulan * 100000000 +
    hari * 1000000 +
    bagian.jam * 10000 +
    bagian.menit * 100 +
    bagian.detik
  );
}

export function buatBandingWaktu(format: FormatTanggal): BandingWaktu {
  return (a, b) => kunciUrut(a, format) - kunciUrut(b, format);
}
```

- [ ] **Langkah 4: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Diharapkan: LULUS, seluruh uji sebelumnya plus 14 uji baru.

- [ ] **Langkah 5: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

- [ ] **Langkah 6: Commit**

```bash
git add src/io/waktu.ts src/io/waktu.test.ts
git commit -m "feat(io): pembanding cap waktu Forms dan deteksi format tanggal"
```

---

### Tugas 7: Uji integrasi pemetaan, dan membuang salinan uji

**Berkas:**
- Uji: `src/io/pemetaanLengkap.test.ts`
- Ubah: `src/io/alurLengkap.test.ts`

**Antarmuka:**
- Memakai: seluruh keluaran Tugas 1 sampai 6, ditambah `bacaBerkas` dari `./importerBerkas`, `bukuKerjaPostTest` dari `./__fixtures__/bukuKerja`, `bangunNilaiSesi` dari `../core/sesi`, `hitungNilaiResponden` dari `../core/aggregator`, `hashPalsu` dari `../core/__fixtures__/hash`
- Menghasilkan: — (uji ujung ke ujung)

Tugas ini membuktikan bahwa rencana ini benar-benar menutup lubangnya: sebuah berkas `.xlsx` menjadi `Skema` dan `RespondenSesi[]` **tanpa satu baris kode uji pun yang ikut menghitung**.

Langkah 4 adalah bagian yang paling mudah dilewati dan paling penting. `src/io/alurLengkap.test.ts` masih memuat pembantu `keResponden` — pemetaan kolom versi uji yang justru menjadi alasan rencana ini ada. Selama ia masih di sana, uji integrasi lama membuktikan sesuatu yang berbeda dari yang akan dijalankan aplikasi.

- [ ] **Langkah 1: Tulis uji integrasi**

Buat `src/io/pemetaanLengkap.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hitungNilaiResponden } from '../core/aggregator';
import { bangunResponden } from '../core/bangunResponden';
import { hashPalsu } from '../core/__fixtures__/hash';
import { urutkanPeringkat } from '../core/peringkat';
import { bangunRancangan, finalkanSkema } from '../core/rancanganSkema';
import type { RancanganSkema } from '../core/rancanganSkema';
import { bangunNilaiSesi } from '../core/sesi';
import { bacaBerkas } from './importerBerkas';
import { bukuKerjaPostTest } from './__fixtures__/bukuKerja';
import { buatBandingWaktu, tebakFormatTanggal } from './waktu';

function imporPostTest(jumlahBaris: number) {
  const impor = bacaBerkas(bukuKerjaPostTest(jumlahBaris), 'post-test.xlsx');
  if (impor.status !== 'berhasil') throw new Error('impor seharusnya berhasil');
  return impor;
}

/** Mewakili keputusan admin pada layar pemetaan. */
function putuskanSemuanya(rancangan: RancanganSkema): RancanganSkema {
  rancangan.perlakuanKosong = 'abaikan';

  for (const kolom of rancangan.peran.kolom) {
    if (kolom.peran !== 'belum-diputuskan') continue;
    kolom.peran = kolom.header.startsWith('q') ? 'pertanyaan' : 'meta';
  }

  for (const butir of rancangan.butir) {
    butir.dimensi = 'kemudahan';
    if (butir.aturan === null) butir.aturan = { jenis: 'abaikan' };
  }

  return rancangan;
}

/**
 * Satu rancangan dipakai untuk menurunkan skema DAN peta peran. Membangunnya
 * dua kali akan memakai dua objek berbeda dan menyembunyikan ketidakcocokan.
 */
function petakanSemuanya(impor: {
  header: string[];
  baris: Record<string, string>[];
  nomorBaris: number[];
}) {
  const rancangan = putuskanSemuanya(bangunRancangan('skemaA', impor.header, impor.baris));
  const final = finalkanSkema(rancangan);
  if (final.status !== 'siap') throw new Error('skema seharusnya siap');

  const petaan = bangunResponden(
    impor.baris,
    impor.nomorBaris,
    rancangan.peran,
    final.skema,
    hashPalsu,
  );
  return { skema: final.skema, petaan };
}

describe('pemetaan kolom dari berkas nyata', () => {
  it('menaikkan kolom Likert menjadi pertanyaan dan menahan butir Yes/No/Maybe', () => {
    const impor = imporPostTest(30);
    const rancangan = bangunRancangan('skemaA', impor.header, impor.baris);

    const q1 = rancangan.butir.find((b) => b.kolomAsal === 'q1');
    expect(q1?.aturan).not.toBe(null);

    const q11 = rancangan.butir.find((b) => b.kolomAsal === 'q11');
    expect(q11?.aturan).toBe(null);
    expect(q11?.contohNilai.join(' ')).toContain('Maybe');
  });

  it('mengenali Email dan Name tanpa diberi tahu', () => {
    const impor = imporPostTest(5);
    const rancangan = bangunRancangan('skemaA', impor.header, impor.baris);
    const peran = new Map(rancangan.peran.kolom.map((k) => [k.header, k.peran]));

    expect(peran.get('Email')).toBe('email');
    expect(peran.get('Name')).toBe('nama');
  });

  it('menolak finalisasi selama butir Yes/No/Maybe belum diputuskan', () => {
    const impor = imporPostTest(30);
    const rancangan = bangunRancangan('skemaA', impor.header, impor.baris);
    rancangan.perlakuanKosong = 'abaikan';
    for (const butir of rancangan.butir) butir.dimensi = 'kemudahan';

    const hasil = finalkanSkema(rancangan);
    expect(hasil.status).toBe('belum-lengkap');
    if (hasil.status !== 'belum-lengkap') return;
    expect(hasil.masalah.map((m) => m.jenis)).toContain('peran-belum-diputuskan');
  });

  it('menghasilkan Skema setelah seluruh keputusan diambil', () => {
    const impor = imporPostTest(30);
    const hasil = finalkanSkema(putuskanSemuanya(bangunRancangan('skemaA', impor.header, impor.baris)));

    expect(hasil.status).toBe('siap');
    if (hasil.status !== 'siap') return;
    expect(hasil.skema.butir).toHaveLength(20);
    expect(hasil.skema.perlakuanKosong).toBe('abaikan');
  });
});

describe('dari berkas ke nilai tanpa kode uji yang ikut memetakan', () => {
  it('menilai 500 baris lewat jalur pemetaan sungguhan', () => {
    const impor = imporPostTest(500);
    const { skema, petaan } = petakanSemuanya(impor);

    expect(petaan.tanpaKolomEmail).toBe(false);
    expect(petaan.responden).toHaveLength(500);
    expect(petaan.barisTanpaEmail).toHaveLength(0);

    const sesi = bangunNilaiSesi({ sesiId: 's1', namaSesi: 'Post-Test' }, petaan.responden, skema);
    expect(sesi.nilai.size).toBe(500);
  });

  it('memisahkan kolom meta dari kolom jawaban', () => {
    const { petaan } = petakanSemuanya(imporPostTest(10));

    const satu = petaan.responden[0];
    expect(satu?.meta['Gender']).toBeDefined();
    expect(satu?.meta['Age']).toBeDefined();
    expect(satu?.jawaban['Gender']).toBeUndefined();
    expect(satu?.jawaban['q1']).toBeDefined();
  });

  it('tidak mencatat cap waktu bila berkasnya memang tidak punya kolom itu', () => {
    // Fixture Post-Test tidak memuat kolom Timestamp. Peta peran harus
    // menerimanya tanpa mengarang cap waktu dari kolom lain.
    const { petaan } = petakanSemuanya(imporPostTest(10));
    expect(petaan.waktuKirim.size).toBe(0);
  });
});

describe('peringkat memakai cap waktu yang baru terpetakan', () => {
  it('mengurutkan dengan pemecah seri dari cap waktu berkas', () => {
    const capWaktu = ['25/4/2026 08:00:00', '25/4/2026 09:00:00', '26/4/2026 08:00:00'];
    const format = tebakFormatTanggal(capWaktu);
    expect(format.status).toBe('yakin');
    if (format.status !== 'yakin') return;

    const banding = buatBandingWaktu(format.format);
    const hasil = urutkanPeringkat(
      [
        { respondenId: 'telat', nilai: 80, jumlahTerjawab: 20, waktuKirim: capWaktu[1] ?? null },
        { respondenId: 'awal', nilai: 80, jumlahTerjawab: 20, waktuKirim: capWaktu[0] ?? null },
        { respondenId: 'tertinggi', nilai: 95, jumlahTerjawab: 20, waktuKirim: capWaktu[2] ?? null },
      ],
      banding,
    );

    expect(hasil.map((h) => h.respondenId)).toEqual(['tertinggi', 'awal', 'telat']);
  });

  it('memberi peringkat dari nilai sesi yang benar-benar dihitung', () => {
    const { skema, petaan } = petakanSemuanya(imporPostTest(20));

    const baris = petaan.responden.map((satu) => {
      const nilai = hitungNilaiResponden(satu, skema);
      return {
        respondenId: satu.id,
        nilai: nilai.nilai,
        jumlahTerjawab: nilai.butirTerhitung,
        waktuKirim: null,
      };
    });

    const hasil = urutkanPeringkat(baris, () => 0);
    expect(hasil).toHaveLength(20);
    expect(hasil[0]?.peringkat).toBe(1);
    for (const satu of hasil) expect(satu.peringkat).not.toBe(null);
  });
});
```

- [ ] **Langkah 2: Jalankan uji dan pastikan lulus**

```bash
npm test
```

Bila uji `mengenali Email dan Name tanpa diberi tahu` gagal, periksa header yang dihasilkan `bukuKerjaPostTest` di `src/io/__fixtures__/bukuKerja.ts` dan sesuaikan **uji**, bukan `peranKolom.ts` — fixture itu memakai header `Email` dan `Name` apa adanya.

Bila uji `menghasilkan Skema setelah seluruh keputusan diambil` melaporkan jumlah butir selain 20, hitung ulang dari definisi fixture-nya dan perbaiki angkanya di uji; jangan menyalin apa pun yang kebetulan dikeluarkan kode.

- [ ] **Langkah 3: Commit uji integrasi**

```bash
git add src/io/pemetaanLengkap.test.ts
git commit -m "test(io): pemetaan kolom dari berkas nyata sampai peringkat"
```

- [ ] **Langkah 4: Buang pembantu `keResponden` dari uji lama**

Buka `src/io/alurLengkap.test.ts`. Hapus fungsi `keResponden` beserta konstanta `KOLOM_META` yang hanya dipakainya, lalu ganti setiap pemanggilan `keResponden(impor.baris)` dengan jalur sungguhan.

Tambahkan pembantu berikut di dekat puncak berkas, setelah blok `import`:

```ts
function petakan(impor: { header: string[]; baris: Record<string, string>[]; nomorBaris: number[] }) {
  const rancangan = bangunRancangan('skemaPostTest', impor.header, impor.baris);
  rancangan.perlakuanKosong = 'abaikan';

  for (const kolom of rancangan.peran.kolom) {
    if (kolom.peran !== 'belum-diputuskan') continue;
    kolom.peran = kolom.header.startsWith('q') ? 'pertanyaan' : 'meta';
  }
  for (const butir of rancangan.butir) {
    butir.dimensi = dimensiButir(butir.kolomAsal);
    if (butir.aturan === null) butir.aturan = { jenis: 'abaikan' };
  }

  const final = finalkanSkema(rancangan);
  if (final.status !== 'siap') throw new Error('skema seharusnya siap');

  const petaan = bangunResponden(impor.baris, impor.nomorBaris, rancangan.peran, final.skema, hashPalsu);
  return { skema: final.skema, responden: petaan.responden, petaan };
}
```

`dimensiButir` dibaca dari tabel `DIMENSI` yang sudah ada di berkas itu, sehingga pengelompokannya tidak ditulis dua kali:

```ts
function dimensiButir(kolomAsal: string): string {
  const nomor = Number(kolomAsal.replace('q', ''));
  let batas = 0;
  for (const { dimensi, jumlah } of DIMENSI) {
    batas += jumlah;
    if (nomor <= batas) return dimensi;
  }
  return 'lainnya';
}
```

Tambahkan impor yang diperlukan dari `../core/rancanganSkema` dan `../core/bangunResponden`.

**Jangan mengubah satu pun assertion di berkas itu.** Nilainya harus tetap sama persis. Penggantian ini aman menurut pembacaan kode: `skorJawaban` menormalisasi kedua sisi (`normalisasiTeks(opsi) === bersih` pada `src/core/scorer.ts`), sehingga peta berhuruf kapital milik `skemaPostTest` dan peta ternormalisasi milik `usulkanAturan` menghasilkan skor yang sama. Bila ternyata ada angka yang berubah, artinya jalur pemetaan sungguhan berbeda dari pemetaan versi uji — itu temuan yang wajib dilaporkan, bukan angka yang boleh disesuaikan.

- [ ] **Langkah 5: Jalankan uji dan pastikan lulus tanpa satu angka pun berubah**

```bash
npm test
```

Diharapkan: LULUS. Bila ada assertion yang gagal, hentikan pekerjaan dan laporkan angka lama dan angka barunya.

- [ ] **Langkah 6: Jalankan pemeriksaan tipe**

```bash
npm run typecheck
```

- [ ] **Langkah 7: Commit**

```bash
git add src/io/alurLengkap.test.ts
git commit -m "test(io): uji integrasi memakai pemetaan kolom sungguhan"
```

---

## Kriteria Selesai Rencana Ini

Jalankan perintahnya, lihat keluarannya, baru menyatakan beres.

- [ ] `npm test` lulus — tempelkan ringkasan jumlah uji yang lulus
- [ ] `npm run typecheck` bersih, keluar dengan kode 0
- [ ] `src/core/kemurnian.test.ts` masih lulus — tidak ada berkas `core` yang mengimpor `src/io/` maupun menyentuh `Date`
- [ ] Tidak ada lagi fungsi pemetaan kolom di dalam berkas uji mana pun; `grep -rn "keResponden" src/` tidak menghasilkan apa-apa
- [ ] Berkas `.xlsx` 500 baris melewati `bangunRancangan` → `finalkanSkema` → `bangunResponden` → `bangunNilaiSesi` tanpa error
- [ ] `finalkanSkema` terbukti menolak rancangan yang masih memuat butir Yes/No/Maybe
- [ ] Seluruh tujuh tugas ter-commit terpisah

## Yang masih ditunda setelah rencana ini

| Butir spec | Menunggu apa |
| --- | --- |
| §5.2 Reporter — ekspor Excel dan PDF | Rencana berikutnya; masukannya `HasilGabungan` yang sudah ada |
| §6.3 penimpaan nilai manual, §9 peran | Butuh Store dan Apps Script |
| §12.1 penyimpanan skema untuk dipakai ulang | `RancanganSkema` dan `PetaPeran` sudah berbentuk data murni; tinggal disimpan |
| Layar pemetaan | Rencana UI; seluruh logikanya sudah ada dan teruji setelah rencana ini |
| Skala selain Likert 5 poin | Ditambahkan ke tabel `SKALA` saat instrumen nyata menuntutnya, bukan sebelum |
| §12.3 N-Gain ternormalisasi | Keputusan pemilik proyek; tarik ke V1 bila laporan penelitian memerlukannya |
