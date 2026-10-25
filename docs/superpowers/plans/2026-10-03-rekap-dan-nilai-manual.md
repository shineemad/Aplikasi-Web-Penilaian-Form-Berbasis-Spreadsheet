# Rencana Implementasi — Rekap dan Nilai Manual

> **Untuk pekerja agentik:** SUB-SKILL WAJIB: pakai `subagent-driven-development` (disarankan) atau `executing-plans` untuk mengerjakan rencana ini tugas demi tugas. Langkah memakai sintaks checkbox (`- [ ]`) untuk penanda kemajuan.

**Tujuan:** Membuat nilai manual benar-benar masuk perhitungan, dan menutup sambungan yang masih putus antara baris sheet dan nilai per sesi. Dua hal itu digabung karena yang kedua tidak ada gunanya tanpa yang pertama: membaca `Penilaian` dari sheet tidak berarti apa-apa bila isinya tetap diabaikan agregator.

**Cacat yang rencana ini perbaiki — ini bug angka, bukan fitur yang kurang.**

`skorMaksAturan` mengembalikan `maks` untuk aturan `manual`, sehingga butir itu lolos pemeriksaan `skorMaks === null`. Tetapi `skorJawaban` mengembalikan `{status:'butuh-manual'}`, dan [aggregator.ts](../../../src/core/aggregator.ts) menanganinya dengan `continue` — **sebelum** `totalBobot += butir.bobot`.

Akibatnya bobot butir manual ikut hilang dari penyebut. Skema yang separuh butirnya manual menghasilkan rata-rata terbobot **atas separuh instrumen saja**, dicetak sebagai nilai responden, tanpa satu pun peringatan. Angkanya tampak wajar. Itu kegagalan paling berbahaya menurut instruksi repo, dan ia ada di jalur nilai sekarang.

**Arsitektur:** Nilai manual masuk lewat satu pintu — argumen tambahan pada perhitungan core, bukan sumber data baru di dalamnya. `core` tetap tidak tahu apa itu sheet. `src/io/adaptorSheet.ts` menjadi satu-satunya tempat yang menerjemahkan baris sheet (snake_case, sel kosong `''`, tipe campuran hasil pemaksaan Sheets) menjadi tipe domain. Uji kontrak melintasi `doPost` → `getValues` → adaptor → `nilaiBerlaku` → `bangunNilaiSesi` → `TabelTampil`, karena justru ketiadaan uji semacam itu yang membiarkan empat cacat lolos 657 uji pada rencana sebelumnya.

**Tech Stack:** TypeScript (`strict` + `noUncheckedIndexedAccess`), Vitest, `node:vm`, Google Apps Script (V8), Google Sheets.

**Spec:** [docs/superpowers/specs/2026-09-27-formscoring-engine-design.md](../specs/2026-09-27-formscoring-engine-design.md)

**Rencana sebelumnya:** [inti-perhitungan](2026-09-27-inti-perhitungan.md), [berkas-ke-nilai](2026-09-27-berkas-ke-nilai.md), [pemetaan-kolom](2026-09-27-pemetaan-kolom.md), [reporter](2026-09-28-reporter.md), [store-dan-peran](2026-09-28-store-dan-peran.md) — kelimanya selesai dan tergabung, 677 uji lulus.

---

## Batasan Global

Berlaku untuk **setiap** tugas. Dua puluh yang pertama diwarisi dan sebagian ditegakkan otomatis oleh `src/core/kemurnian.test.ts`, `src/io/penulisEkspor.test.ts`, dan sensor di `apps-script/uji/`.

1. **Berkas di `src/core/` dilarang mengimpor apa pun dari luar `src/core/`.**
2. **Dilarang `?? 0` atau `|| 0` di `src/core/`.** Pakai `=== undefined` eksplisit.
3. **Kosong bukan nol.**
4. **Opsi tak dikenal menghasilkan peringatan, bukan angka.**
5. **Normalisasi sebelum mencocokkan:** buang spasi tepi → rapatkan spasi ganda → huruf kecil. Berlaku juga untuk email.
6. **Istilah domain memakai Bahasa Indonesia.**
7. **Tulis uji lebih dulu.**
8. **`core` tidak membulatkan** kecuali untuk penyajian.
9. **`src/io/` tidak boleh menghitung nilai maupun memformat angka.**
10. **Pesan error yang menghadap pengguna harus mengajari.**
11. **Satu model tampilan, dua penulis.**
12. **Kategori dihitung dari angka yang ditampilkan.**
13. **Waktu disuntikkan sebagai argumen.**
14. **Mode anonim membuang kolom, bukan mengosongkannya.**
15. **Identitas hanya berasal dari server.** Medan `email`/`oleh`/`peran` dari muatan diabaikan sepenuhnya.
16. **Email kosong ditolak dengan kode tersendiri.**
17. **`Penilaian` append-only.** Hanya `appendRow`.
18. **Tidak mengaku tersimpan sebelum server membenarkan.**
19. **Setiap jalur tulis dibungkus `LockService`,** dan kunci dilepas pada jalur gagal maupun berhasil.
20. **Berkas yang diuji adalah berkas yang di-deploy.** Dilarang menyalin logika `Kode.gs` ke modul lain.

Empat berikut lahir dari rencana ini.

21. **Butir yang menunggu penilaian manual tidak boleh hilang diam-diam.** Ia wajib muncul sebagai hitungan tersendiri pada hasil, terpisah dari butir kosong. "Belum dinilai orang" dan "tidak dijawab responden" adalah dua hal berbeda, persis seperti `null` dan `0`.
22. **Nilai manual di luar rentang menghasilkan peringatan, bukan angka yang dijepit.** Menjepit nilai 7 menjadi 5 pada rubrik 1–5 menghasilkan angka yang terlihat sah dan salah.
23. **Adaptor adalah satu-satunya penerjemah baris sheet.** Tidak ada modul lain yang boleh membaca medan snake_case atau menebak tipe sel. Bila sebuah modul perlu mengurai sel, uraiannya salah tempat.
24. **Baris sheet yang cacat ditandai, bukan dibuang.** Instruksi repo: "spec menuntut baris ditandai, bukan dihilangkan." Adaptor mengembalikan baris yang sah **dan** daftar baris bermasalah beserta nomor barisnya.

---

## Koreksi terhadap spec

Lima hal diputuskan di sini; semuanya menuntut suntingan spec pada Tugas 5. D4 dan D5 ditambahkan setelah tinjauan Tugas 1 — keduanya menyelesaikan hal yang baru terlihat ketika kodenya ada.

### D1 — Butir manual tanpa nilai: ditandai, bukan dilewati

§7.1 memberi aturan `manual` tanpa menyatakan apa yang terjadi bila penilai belum mengisinya. Perilaku sekarang — melewatinya beserta bobotnya — adalah jawaban yang paling berbahaya dari tiga kemungkinan, karena ia satu-satunya yang tidak meninggalkan jejak.

**Keputusan:** butir manual tanpa nilai dihitung sebagai `butirMenunggu`, dikeluarkan dari pembilang **dan** penyebut (seperti `perlakuanKosong: 'abaikan'`), tetapi **jumlahnya dilaporkan**. Responden yang punya butir menunggu mendapat penanda status tersendiri, sehingga tabel rekap dapat menampilkan "menunggu 3 butir" alih-alih angka yang seolah lengkap.

Penyebut tetap dikecilkan karena alternatifnya lebih buruk: menghitungnya sebagai nol akan menghukum responden atas pekerjaan penilai yang belum selesai, dan itu melanggar aturan 2 repo dalam bentuk yang paling halus.

### D2 — Nilai manual boleh mengoreksi skor otomatis, dan koreksinya harus terlihat

§5.1 langkah 5 menyebut input manual sebagai "pengecualian, bukan pekerjaan utama", tetapi tidak melarang penilai menulis nilai untuk kolom yang beraturan `peta-opsi` atau `kunci-jawaban`. Server pun menerimanya hari ini (lihat C7 pada rencana sebelumnya).

**Keputusan:** baris `Penilaian` untuk kolom yang **bukan** `manual` **menimpa** skor otomatisnya, dan hasilnya membawa catatan bahwa butir itu dikoreksi beserta siapa yang mengoreksi.

Alasannya ada di §6.3 sendiri: jejak audit dibuat supaya "perbedaan pendapat antar penilai terlihat alih-alih tersembunyi". Menolak koreksi berarti skor otomatis yang salah — misalnya akibat opsi yang terpetakan keliru — tidak akan pernah bisa dibetulkan tanpa menyunting sheet dengan tangan, yang justru memotong seluruh jejak audit.

Yang **tidak** diputuskan di sini: apakah server harus menolak koreksi pada sesi tertentu. Itu C7, dan masih menunggu pengguna.

### D3 — Nilai manual divalidasi terhadap `min` dan `maks` di core, bukan di server

Aturan `manual` membawa `min` dan `maks`. Nilai di luar rentang itu menghasilkan **peringatan** dan butirnya dikeluarkan dari perhitungan — tidak dijepit, tidak dibulatkan (Batasan Global 22).

Validasinya di core, bukan di `Kode.gs`, karena server tidak membaca `Skema` saat menulis (C7) dan memaksanya membaca berarti dua sheet tambahan dibuka di dalam kunci pada operasi tersering. Core sudah memegang `Skema` saat merekap, jadi di situlah tempat termurah dan paling teruji.

### D4 — Atribusi koreksi tidak masuk agregator

D2 menuntut hasil membawa catatan bahwa sebuah butir dikoreksi "beserta siapa yang mengoreksi". Antarmuka yang ditetapkan Tugas 1 bertentangan dengan itu: `nilaiManual` berbentuk `Map<kolomAsal, number>`, dan angka tidak bisa membawa `oleh`.

**Keputusan:** `oleh` **tidak** masuk ke agregator. Core cukup mencatat **kolom mana** yang dikoreksi — `butirDikoreksi` pada `HasilNilaiResponden`, `dikoreksi` pada `NilaiSesi`.

Atribusinya sudah ada dan sudah teruji di tempat lain: `HasilBerlaku.nilaiDari.oleh` di [penilaian.ts](../../../src/core/penilaian.ts), yang dibangun dari jejak audit append-only sheet `Penilaian` (§6.3). Memaksa `oleh` ikut masuk agregator akan menduplikasi sumber kebenaran itu, dan duplikat yang bisa berbeda isinya lebih buruk daripada satu sumber yang harus digabung. Penggabungan dilakukan di lapisan pelaporan, yang memang memegang `HasilBerlaku` dan `NilaiSesi` sekaligus.

Akibatnya bagi Tugas 2: adaptor membangun `Map<kolomAsal, number>` dari nilai berlaku, dan membawa `oleh` lewat jalurnya sendiri — bukan dengan memperkaya nilai manual menjadi objek.

### D5 — Indeks dimensi merata-ratakan rasio, bukan menjumlahkan skor mentah

Rumus §8.2 menuliskan penyebut sebagai $|T_d| \cdot s^{\max}$, yaitu satu $s^{\max}$ untuk seluruh dimensi. Rumus itu ditulis untuk survei Likert yang seluruh butirnya berskala sama, dan menjadi ambigu begitu D1 memasukkan butir `manual` ke perhitungan: satu dimensi kini bisa memuat butir Likert 1..5 dan esai 0..100 sekaligus.

Menerjemahkannya secara harfiah menjadi $\sum s / \sum s^{\max}$ membobot tiap pasangan dengan skor maksimumnya sendiri. Satu esai 0..100 lalu menenggelamkan dua puluh butir Likert yang sedimensi dengannya: empat butir Likert bernilai 5/5 ditambah satu esai bernilai 50/100 menghasilkan indeks 58,3 sementara nilai respondennya 90.

**Keputusan:** indeks mengakumulasi **rasio** $s_{r,k}/s^{\max}_k$ per pasangan lalu membaginya dengan $|T_d|$. Untuk dimensi berskala seragam hasilnya identik dengan rumus §8.2, dan untuk skala campuran ia memenuhi kalimat §8.2 sendiri: "Bila seluruh bobot butir sama, hasilnya setara dengan rata-rata sederhana seluruh butir."

Turunannya pada indeks keseluruhan: bobot sebuah dimensi adalah jumlah bobot butir yang **benar-benar menyumbang pasangan**, bukan seluruh bobot butirnya pada `Skema`. Memakai bobot skema membuat butir yang masih menunggu penilaian menggelembungkan dimensinya — bentuk cermin dari bug penyebut yang rencana ini perbaiki, dan butir menunggu adalah keadaan normal selama penilaian berjalan.

---

## Struktur Berkas

| Berkas | Tanggung jawab tunggal |
| --- | --- |
| `src/core/aggregator.ts` | **diubah** — menerima nilai manual; melaporkan butir menunggu dan butir dikoreksi |
| `src/core/sesi.ts` | **diubah** — meneruskan nilai manual ke agregator |
| `src/io/adaptorSheet.ts` | **baru** — baris sheet → tipe domain, satu-satunya penerjemah |
| `apps-script/Kode.gs` | **diubah** — aksi `bacaRekap` |
| `src/io/rekapLengkap.test.ts` | **baru** — uji kontrak melintasi backend, adaptor, dan core |

Aturan ketergantungan tidak berubah: `io` boleh memanggil `core`; `core` tidak memanggil siapa pun; `apps-script/` berdiri sendiri.

---

### Tugas 1: Nilai manual masuk perhitungan

**Berkas:**
- Ubah: `src/core/aggregator.ts`, `src/core/sesi.ts`
- Uji: `src/core/aggregator.test.ts`, `src/core/sesi.test.ts`

**Antarmuka:** `hitungNilaiResponden(responden, skema, nilaiManual?)` dengan `nilaiManual: Map<string, number>` berkunci `kolomAsal`. Hasilnya bertambah tiga medan: `butirMenunggu`, `butirDikoreksi`, dan peringatan rentang yang masuk ke `peringatan` yang sudah ada.

Argumennya **opsional** agar 677 uji yang ada tidak perlu disentuh massal — tetapi perhatikan jebakannya: argumen opsional membuat pemanggil yang lupa meneruskannya tetap lulus typecheck dan menghasilkan angka yang salah diam-diam. Karena itu Langkah 4 menuntut uji yang memastikan `bangunNilaiSesi` benar-benar meneruskannya.

- [ ] **Langkah 1: Tulis uji yang gagal — bug penyebut**

```ts
it('tidak membuang bobot butir manual dari penyebut', () => {
  // Cacat yang rencana ini perbaiki. Skema: satu butir peta-opsi (bobot 1,
  // skorMaks 5) dan satu butir manual (bobot 1, maks 10). Responden menjawab
  // opsi bernilai 5 dan penilai memberi 5 dari 10.
  // Benar: (1*(5/5) + 1*(5/10)) / 2 * 100 = 75
  // Perilaku lama: butir manual hilang beserta bobotnya -> 100.
  const hasil = hitungNilaiResponden(responden, skema, new Map([['Esai', 5]]));
  expect(hasil.nilai).toBe(75);
});

it('tanpa nilai manual, butir manual tidak diam-diam menaikkan nilai', () => {
  const hasil = hitungNilaiResponden(responden, skema);
  expect(hasil.nilai).toBe(100);        // penyebut memang mengecil (D1)
  expect(hasil.butirMenunggu).toBe(1);  // tetapi jejaknya ada
});
```

Uji kedua itu yang paling penting: ia mengunci bahwa angka 100 **boleh** muncul, asalkan tidak pernah muncul sendirian tanpa penanda.

- [ ] **Langkah 2: Tulis uji yang gagal — D2 dan D3**

```ts
it('nilai manual mengoreksi skor otomatis dan koreksinya tercatat', () => { /* D2 */ });

it('nilai manual di luar rentang menghasilkan peringatan, bukan dijepit', () => {
  // Angka dipilih supaya ketiga kemungkinan menghasilkan hasil BERBEDA.
  // Skema: butir Likert (bobot 1, skorMaks 5) dijawab bernilai 2,5 -> 50%;
  // butir manual rubrik 1..5 (bobot 1) diisi penilai dengan 7.
  //   benar, butir dikeluarkan   -> 50
  //   salah, dijepit ke maks 5   -> 75
  //   salah, dipakai mentah 7/5  -> 95
  // Menulis `not.toBe(100)` TIDAK membedakan apa pun di sini, karena 100
  // justru hasil yang sah pada skenario lain.
  const hasil = hitungNilaiResponden(responden, skema, new Map([['Esai', 7]]));
  expect(hasil.nilai).toBe(50);
  expect(hasil.peringatan.join(' ')).toMatch(/rentang/i);
});

it('membedakan butir menunggu dari butir kosong', () => {
  // Responden tidak menjawab satu butir Likert DAN ada satu butir manual
  // yang belum dinilai. Keduanya tidak boleh menjadi satu angka.
  expect(hasil.butirKosong).toBe(1);
  expect(hasil.butirMenunggu).toBe(1);
});
```

- [ ] **Langkah 3: Terapkan di `aggregator.ts`**

`hitungIndeksDimensi` ikut berubah — indeks per dimensi memakai penyebut yang sama. Karena ia menerima **banyak** responden, nilai manualnya berbentuk `Map<respondenId, Map<kolomAsal, number>>`, berbeda dari `hitungNilaiResponden` yang menerima satu responden sehingga cukup `Map<kolomAsal, number>`. Perbedaan bentuk ini mudah tertukar; beri nama tipe yang berbeda supaya typecheck yang menangkapnya, bukan uji.

Dimensi yang seluruh butirnya menunggu harus menghasilkan indeks `null`, bukan 0 (aturan 2).

- [ ] **Langkah 4: Sambungkan `bangunNilaiSesi` dan buktikan sambungannya**

`bangunNilaiSesi(meta, responden, skema, nilaiManual?)`. `nilaiManual` di sini berkunci `respondenId`, berisi `Map<kolomAsal, number>`.

Wajib ada uji yang **merah bila argumennya tidak diteruskan** — bukan sekadar uji yang lulus ketika diteruskan.

- [ ] **Langkah 5: Jalankan uji, pastikan `kemurnian.test.ts` tetap hijau, commit**

`fix(core): nilai manual masuk perhitungan dan butir menunggu tidak lagi hilang`

---

### Tugas 2: Adaptor baris sheet → tipe domain

**Berkas:**
- Buat: `src/io/adaptorSheet.ts`
- Uji: `src/io/adaptorSheet.test.ts`

Ini sambungan yang tinjauan akhir rencana sebelumnya sebut "putus di tengah". Kelima sheet punya kepala snake_case; tipe domain memakai camelCase; sel kosong di Sheets adalah `''`, bukan `null`; dan Sheets memaksa tipe sel.

**Antarmuka:** satu fungsi per sheet — `bacaPenilaian`, `bacaResponden`, `bacaSkema`, `bacaSesi`, `bacaProyek`. Masing-masing menerima `unknown[][]` (hasil `getValues()`, **termasuk baris kepala**) dan mengembalikan `{ baris: T[]; masalah: MasalahBaris[] }`.

- [ ] **Langkah 1: Tulis uji yang gagal — kenyataan sheet, bukan contoh rapi**

```ts
it('menerjemahkan sel kosong menjadi null, bukan string kosong', () => {
  // Batasan Global 3. Baris catatan-saja punya sel nilai '' di Sheets.
  expect(hasil.baris[0]?.nilai).toBeNull();
  expect(hasil.baris[0]?.nilai).not.toBe('');
});

it('menerima penilaian_id bertipe teks maupun angka', () => {
  // Kolom yang diformat teks oleh admin mengembalikan '5', bukan 5.
});

it('menandai baris yang penilaian_id-nya tidak bisa dibaca, tidak membuangnya', () => {
  // Batasan Global 24. Nomor barisnya ikut dilaporkan agar admin bisa membukanya.
  expect(hasil.baris).toHaveLength(1);
  expect(hasil.masalah[0]?.nomorBaris).toBe(3);
});

it('menolak sheet yang kepalanya kurang satu kolom wajib', () => { /* pesan menyebut kolom mana */ });
it('tidak bergantung pada urutan kolom', () => { /* kolom ditukar -> hasil sama */ });
it('mengabaikan baris yang seluruh selnya kosong', () => { /* baris sisa di bawah tabel */ });
it('menerima kepala berspasi tepi dan beda huruf besar-kecil', () => { /* aturan 5 */ });
```

- [ ] **Langkah 2: Terapkan**

Satu pembaca kepala bersama; jangan menyalin logika pencarian kolom lima kali.

- [ ] **Langkah 3: Jalankan uji, commit**

`feat(io): adaptor baris sheet ke tipe domain`

---

### Tugas 3: Aksi `bacaRekap`

**Berkas:**
- Ubah: `apps-script/Kode.gs`
- Uji: `apps-script/uji/rekap.test.ts`

Kebijakan izinnya sudah ada (`bacaRekap`: admin dan penilai, tidak menulis). Yang dibangun hanya pembacaannya.

- [ ] **Langkah 1: Tulis uji yang gagal**

Balasan memuat baris mentah ketiga sheet untuk satu `sesiId`: `Responden`, `Skema` (untuk `skema_id` milik sesi itu), dan `Penilaian`. **Mentah** — `Kode.gs` tidak menghitung apa pun; itu tugas core.

```ts
it('hanya mengembalikan baris milik sesi yang diminta', () => { /* dua sesi di sheet */ });
it('mengembalikan Skema milik skema_id sesi itu, bukan seluruh sheet', () => { /* ... */ });
it('menolak pembacaan oleh orang di luar daftar', () => { /* kebijakan sudah ada, pancang di sini */ });
it('mengembalikan rekap sesi final', () => {
  // Sesi final menolak TULIS, bukan BACA. Sesi yang sudah selesai justru
  // yang paling sering dilaporkan.
});
it('mengembalikan daftar kosong, bukan error, bila belum ada Penilaian', () => { /* ... */ });
```

Perhatikan: sheet `Responden` yang dibuat penyiapan ruang kerja hanya punya kepala tetap (`sesi_id`, `id`, `email`, `nama`, `status_kelengkapan`, `diimpor_pada`). Kolom `jawaban_*` dan `meta_*` baru ada setelah impor menulisnya — dan **impor belum dibangun**. `bacaRekap` harus mengembalikan kolom dinamis apa adanya bila ada, dan tidak melempar bila belum ada.

- [ ] **Langkah 2: Terapkan, jalankan, commit**

`feat(apps-script): aksi bacaRekap`

---

### Tugas 4: Uji kontrak lintas modul

**Berkas:**
- Buat: `src/io/rekapLengkap.test.ts`

**Ini tugas terpenting dalam rencana ini.** Pada rencana sebelumnya, empat cacat lolos 657 uji semata-mata karena tidak ada satu pun uji yang melintasi lebih dari satu modul. Uji per modul semuanya hijau sementara rantainya putus.

Rangkaian yang diuji, tanpa memotong jalan:

1. `doPost` sungguhan di sandbox `node:vm` menulis beberapa `Penilaian` — termasuk koreksi, baris catatan-saja, dan nilai di luar rentang
2. baris dibaca kembali lewat `getValues()` palsu
3. `adaptorSheet.bacaPenilaian` menerjemahkannya
4. `nilaiBerlaku` menentukan yang berlaku
5. `bangunNilaiSesi` menghitung dengan nilai manual itu
6. `bangunTabelGabungan` menghasilkan `TabelTampil`

```ts
it('nilai manual yang ditulis penilai muncul di tabel rekap', () => { /* rantai penuh */ });
it('catatan susulan tidak menghapus angka yang sudah ditulis', () => { /* C1, lintas modul */ });
it('koreksi yang ditulis belakangan yang berlaku, bukan yang pertama', () => { /* C2 */ });
it('butir yang menunggu penilaian tidak menjadi nol di tabel', () => {
  // Hati-hati: responden yang sebagian butirnya menunggu TETAP punya nilai
  // (dihitung dari butir yang sudah ada), jadi selnya bukan tanda kosong.
  // Yang wajib tanda kosong adalah responden yang SELURUH butirnya menunggu
  // — di situ `nilai` bernilai null, dan `0,0` berarti angka yang dikarang.
  expect(selNilai(barisSemuaMenunggu)).toBe(TANDA_KOSONG);
  expect(selNilai(barisSemuaMenunggu)).not.toBe('0,0');
});
it('kriteria berspasi ganda tetap cocok dengan kolom_asal', () => {
  // Cacat B4 rencana sebelumnya. Importer memakai trim; bila Kode.gs
  // merapatkan spasi ganda, baris ini tidak akan pernah cocok lagi.
});
```

- [ ] **Langkah 1: Tulis ujinya. Langkah 2: Perbaiki apa pun yang ia temukan. Langkah 3: Commit**

`test(io): uji kontrak dari doPost sampai tabel rekap`

Bila uji ini menemukan ketidakcocokan antara yang ditulis backend dan yang dibaca adaptor, **itu temuan, bukan gangguan** — catat di laporan, jangan tambal diam-diam.

---

### Tugas 5: Utang yang jatuh tempo dan suntingan spec

**Berkas:**
- Ubah: `apps-script/uji/sandbox.test.ts`, `src/core/penilaian.ts`, spec

Tiga utang dari rencana sebelumnya yang kini menghalangi, dan suntingan spec untuk D1–D3.

- [ ] **Langkah 1: Sensor `globalYangTerbuka` yang tidak bisa dielakkan**

Sensor tekstual sekarang dapat dielakkan **enam cara** — fungsi tingkat atas berindentasi, alias `var buka = putuskanIzin_;`, dua deklarator dalam satu `var`, IIFE yang mengembalikan fungsi, komentar di depan `function`, dan `globalThis.x = …`. Ganti dengan **enumerasi properti fungsi pada konteks vm** dikurangi global yang disuntikkan. Buktikan keenam bentuk itu kini merah.

- [ ] **Langkah 2: `cariYatim` juga mendeteksi kriteria yatim**

Sekarang ia hanya memeriksa `respondenId`. Kriteria yang tidak ada di `Skema` mana pun sama-sama menghasilkan baris yang tidak bisa direkap — dan setelah D2, kriteria yatim berarti koreksi yang tidak pernah diterapkan ke butir mana pun.

- [ ] **Langkah 3: Putuskan kepekaan huruf pada `sesi_id`**

Mutasi K9 (pencocokan `sesi_id` tanpa peduli huruf besar-kecil) lolos seluruh suite, artinya perilakunya tidak ditentukan. Putuskan, buat ujinya, dan tulis alasannya. Pertimbangkan bahwa `sesi_id` diketik admin ke dalam sheet dengan tangan.

- [ ] **Langkah 4: Sunting spec**

Pakai gaya catatan koreksi §5.2/§6.1.
- **§7.1** — aturan `manual`: butir tanpa nilai ditandai sebagai menunggu, dikeluarkan dari pembilang dan penyebut, jumlahnya dilaporkan (D1). Nilai di luar `min`/`maks` menghasilkan peringatan, tidak dijepit (D3).
- **§6.3** — baris `Penilaian` untuk kolom non-`manual` berlaku sebagai koreksi yang menimpa skor otomatis, dan koreksinya tercatat (D2).
- **§8.1 dan §8.2** — penyebut: butir menunggu dikeluarkan, dan responden yang punya butir menunggu wajib dapat dikenali.

- [ ] **Langkah 5: Commit**

`fix(apps-script): sensor global yang tidak bisa dielakkan` dan `docs: koreksi §7.1, §6.3, dan §8 untuk nilai manual`

---

## Kriteria Selesai Rencana Ini

Jalankan perintahnya, lihat keluarannya, baru menyatakan beres.

- [ ] `npm test` lulus **5 kali berturut-turut** — tempelkan kelima ringkasannya
- [ ] `npm run typecheck` bersih, keluar dengan kode 0
- [ ] `src/core/kemurnian.test.ts`, `src/io/penulisEkspor.test.ts`, dan seluruh sensor `apps-script/uji/` tetap hijau
- [ ] Ada uji yang **merah** bila `bangunNilaiSesi` lupa meneruskan nilai manual
- [ ] Uji kontrak melintasi `doPost` → adaptor → `nilaiBerlaku` → `bangunNilaiSesi` → `TabelTampil` tanpa memotong jalan
- [ ] Keenam bentuk pengelakan sensor global terbukti merah
- [ ] Kelima tugas ter-commit terpisah

## Yang masih ditunda setelah rencana ini

| Hal | Alasan |
| --- | --- |
| **Impor menulis `Responden` dan `Skema` ke sheet** | Belum ada aksi `simpanResponden`, `ubahSkema`, `ubahBobot`, maupun `buatSesi`. Tanpa itu, rekap hanya bisa membaca sheet yang diisi tangan — jalur bacanya terbukti, isinya belum. Ini rencana berikutnya yang paling masuk akal |
| **C3 — hosting** | Memblokir Rencana UI, bukan rencana ini |
| **C4 dan C6 — mode deployment dan wewenang penyiapan** | Menunggu protokol keamanan dijalankan dengan akun kedua |
| **C7 — pemeriksaan isi penilaian di server** | D3 memindahkan validasi rentang ke core, sehingga C7 kini hanya menyisakan pemeriksaan keberadaan `respondenId` dan `kriteria` |
| **§13 butir 3 dan 4 terhadap sistem terpasang** | Menunggu protokol dijalankan |
| **Perintah permanen tidak punya jalan kembali di Store** | Tidak ada `ulangi` maupun `buang`; aman dari kehilangan, tetapi bisa tertahan selamanya. Rencana UI |
| **Dua tab menghasilkan baris kembar** | Butuh kunci idempoten dan suntingan §6.3. Rencana UI |
| **`peringatanPerSesi` hilang di hilir** | Diwarisi Rencana 4; butuh keputusan kosakata status di §8.4 |
| **Sheet "Ringkasan proyek" (§8.4)** | Diwarisi Rencana 4 |
| **Kerentanan `xlsx@0.18.5`** | Dua peringatan tingkat tinggi |
