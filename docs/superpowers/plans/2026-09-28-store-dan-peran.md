# Rencana Implementasi — Store, Apps Script, dan Peran

> **Untuk pekerja agentik:** SUB-SKILL WAJIB: pakai `subagent-driven-development` (disarankan) atau `executing-plans` untuk mengerjakan rencana ini tugas demi tugas. Langkah memakai sintaks checkbox (`- [ ]`) untuk penanda kemajuan.

**Tujuan:** Membangun modul **Store** dan backend **Apps Script** yang spec §5.2 syaratkan, beserta penegakan peran di sisi server (§9.2) dan finalisasi sesi. Setelah rencana ini, kriteria penerimaan §13 butir 4 (dua penilai dari perangkat berbeda tanpa data hilang) terpenuhi, dan butir 3 (uji keamanan §11.3) terbukti untuk seluruh kebijakannya — tetapi **belum** untuk deployment Google yang sesungguhnya. Batas itu dijelaskan di bawah dan tidak boleh dikaburkan.

**Arsitektur:** Kebijakan izin hidup di **satu tempat saja**, yaitu berkas `apps-script/Kode.gs` yang benar-benar di-deploy. Berkas itu diuji **di dalam proses** dengan `node:vm` dan global Google palsu, sehingga uji keamanan memanggil `doPost` secara langsung — bukan memeriksa tombol. Tidak ada bundler, tidak ada salinan, sehingga tidak ada celah bagi kebijakan yang diuji untuk melenceng dari kebijakan yang berjalan. Di sisi klien, `src/io/store.ts` memakai transport yang **disuntikkan**, sehingga rencana ini netral terhadap pilihan hosting.

**Tech Stack:** TypeScript (`strict` + `noUncheckedIndexedAccess`), Vitest, `node:vm` (bawaan Node), Google Apps Script (V8), Google Sheets.

**Spec:** [docs/superpowers/specs/2026-09-27-formscoring-engine-design.md](../specs/2026-09-27-formscoring-engine-design.md)

**Rencana sebelumnya:** [inti-perhitungan](2026-09-27-inti-perhitungan.md), [berkas-ke-nilai](2026-09-27-berkas-ke-nilai.md), [pemetaan-kolom](2026-09-27-pemetaan-kolom.md), [reporter](2026-09-28-reporter.md) — keempatnya selesai dan tergabung, 391 uji lulus.

---

## Keputusan yang diambil tanpa pengguna

Pengguna tidak tersedia saat rencana ini disusun dan meminta agar keputusan diambil sendiri. Enam keputusan di bawah **mengubah bentuk sistem**, jadi semuanya ditulis terbuka agar dapat dibantah saat ditinjau, bukan dikubur di dalam kode.

### K1 — Kebijakan izin hanya ada di `apps-script/Kode.gs`, tidak di `src/core/`

Menaruh salinan kebijakan di `src/core/izin.ts` akan tampak rapi dan mudah diuji. Justru itu bahayanya: begitu kebijakan tersedia di frontend, frontend akan memakainya, dan orang akan berhenti membedakan "tombol disembunyikan" dari "permintaan ditolak". Aturan 5 repo menuntut yang kedua.

Frontend **tidak perlu tahu kebijakannya**. Ia cukup mengirim permintaan dan menangani penolakan. Bila ia ingin menyembunyikan tombol demi kenyamanan, itu keputusan tampilan yang tidak boleh menjadi satu-satunya penjaga.

### K2 — `Kode.gs` diuji di dalam proses dengan `node:vm` dan global Google palsu

`.gs` hanyalah JavaScript. Uji membaca **berkas yang sama persis** yang nanti ditempelkan ke editor Apps Script, menjalankannya di dalam `vm.createContext` berisi `Session`, `SpreadsheetApp`, `LockService`, dan `ContentService` palsu, lalu memanggil `doPost` langsung.

Keuntungannya berlapis: §11.3 menuntut "memanggil endpoint secara langsung" dan ini benar-benar memanggilnya; tidak ada dependensi baru (`node:vm` bawaan Node); dan **tidak ada salinan yang bisa basi**, tidak seperti pendekatan bundler atau tulis-ulang.

Yang **tidak** dibuktikan cara ini: perilaku Google yang sesungguhnya — siapa yang dikembalikan `Session.getActiveUser()` pada tiap mode deployment, dan apakah Spreadsheet benar-benar tidak dibagikan. Itu urusan Tugas 7 dan tetap terbuka sampai dijalankan manusia.

### K3 — Transport `Store` disuntikkan, hosting belum diputuskan

`src/io/store.ts` menerima fungsi pengirim sebagai argumen, persis seperti `importerTautan.ts` menerima `FungsiAmbil`. Dengan begitu Store dapat diuji tanpa jaringan, dan pilihan `google.script.run` versus `fetch` dapat ditunda ke Rencana UI tanpa menahan rencana ini.

### K4 — Pertentangan §5.3 dengan §9.2 diangkat, bukan diputuskan diam-diam

Lihat bagian "Koreksi terhadap spec" di bawah. Rencana ini **tidak** menyelesaikannya, karena tidak perlu: K3 membuat rencana ini netral. Tetapi Rencana UI tidak bisa dimulai sebelum pertentangan itu diputuskan pengguna.

### K5 — Email kosong adalah penolakan, bukan ketidaktahuan

Bila Web App dideploy dengan akses "Siapa saja, bahkan anonim", `Session.getActiveUser().getEmail()` mengembalikan string kosong. Kalau kebijakan hanya bertanya "apakah email ada di daftar?", string kosong akan jatuh ke cabang "bukan admin" dan sistem akan terasa aman padahal seluruh penjaganya bergantung pada satu setelan deployment yang mudah salah.

Email kosong ditolak **dengan kode kesalahan tersendiri** (`TANPA_IDENTITAS`), agar salah setel terlihat sebagai salah setel, bukan sebagai penolakan peran biasa.

### K6 — §13 butir 3 dicatat belum terbukti seutuhnya

Empat kasus §11.3 akan terbukti terhadap kebijakan. Dua di antaranya — "email di luar daftar" dan sebagian "penulisan ke sesi final" — baru terbukti **sepenuhnya** setelah dijalankan terhadap deployment sungguhan dari akun Google kedua. Sampai itu terjadi, rencana ini dan spec menyebutnya belum terbukti. Mengaku lulus lebih awal adalah cacat yang sama yang sudah tiga kali tertangkap di proyek ini.

---

## Batasan Global

Berlaku untuk **setiap** tugas. Empat belas yang pertama diwarisi dari rencana sebelumnya dan sebagian masih ditegakkan otomatis oleh `src/core/kemurnian.test.ts` serta `src/io/penulisEkspor.test.ts`.

1. **Berkas di `src/core/` dilarang mengimpor apa pun dari luar `src/core/`.** Termasuk React, API browser, `google.script`, jaringan, `new Date`, `Date.now`, `Math.random`.
2. **Dilarang menulis `?? 0` atau `|| 0` di dalam `src/core/`.** Pakai pemeriksaan `=== undefined` eksplisit.
3. **Kosong bukan nol.**
4. **Opsi tak dikenal menghasilkan peringatan, bukan angka.**
5. **Normalisasi sebelum mencocokkan:** buang spasi tepi → rapatkan spasi ganda → huruf kecil. **Berlaku juga untuk email sebelum dicocokkan dengan daftar peran.**
6. **Istilah domain memakai Bahasa Indonesia.** Komentar dan pesan commit juga.
7. **Tulis uji lebih dulu.**
8. **`core` tidak membulatkan** kecuali untuk penyajian.
9. **`src/io/` boleh mengimpor pustaka luar, tetapi tidak boleh menghitung nilai maupun memformat angka.**
10. **Pesan error yang menghadap pengguna harus mengajari, bukan sekadar melapor.**
11. **Satu model tampilan, dua penulis.**
12. **Kategori dihitung dari angka yang ditampilkan.**
13. **Waktu disuntikkan sebagai argumen.** Uji tidak boleh bergantung pada jam mesin.
14. **Mode anonim membuang kolom, bukan mengosongkannya.**

Enam berikut lahir dari rencana ini.

15. **Identitas hanya berasal dari server.** `Session.getActiveUser().getEmail()` adalah satu-satunya sumber. Bila muatan permintaan memuat medan bernama `email`, `oleh`, `peran`, atau sejenisnya, medan itu **diabaikan sepenuhnya** — tidak dibaca, tidak dicatat, tidak dipakai membandingkan apa pun. Uji harus membuktikannya dengan mengirim email palsu yang berbeda dari email sesi.
16. **Email kosong ditolak dengan kode tersendiri.** Lihat K5.
17. **`Penilaian` append-only.** Dilarang memanggil `setValue`, `setValues`, `deleteRow`, atau `clear` pada sheet `Penilaian`. Hanya `appendRow`.
18. **Tidak mengaku tersimpan sebelum server membenarkan.** Status tetap `belum-tersimpan` sampai balasan bertanda sukses diterima. Kegagalan jaringan, balasan cacat, dan balasan `ok:false` semuanya mempertahankan status itu.
19. **Setiap jalur tulis dibungkus `LockService`,** dan kunci dilepas pada jalur gagal maupun berhasil.
20. **Berkas yang diuji adalah berkas yang di-deploy.** Dilarang menyalin logika `Kode.gs` ke modul lain, dan dilarang menulis ulang kebijakannya di dalam uji. Uji memuat `Kode.gs` apa adanya.

---

## Koreksi terhadap spec

Lima hal dicatat di sini. Dua yang pertama menuntut suntingan spec; tiga sisanya menuntut keputusan pengguna — C3 sebelum Rencana UI dimulai, C4 dan C5 sebelum Tugas 7 dapat dinyatakan lulus.

### C1 — "Baris terakhir yang berlaku" tidak bisa dibaca harfiah

§6.3 menyatakan nilai yang berlaku adalah **baris terakhir** untuk pasangan (`responden_id`, `kriteria`). Tabel yang sama juga menyatakan `nilai` boleh **kosong bila hanya catatan**.

Dibaca harfiah, keduanya bertabrakan: penilai yang menambahkan catatan pada kriteria yang sudah bernilai 80 akan **menghapus angka 80 itu**, karena baris terakhir nilainya kosong. Tidak ada yang akan menyadarinya — angkanya hilang diam-diam, persis kelas kegagalan yang paling dijaga proyek ini.

**Keputusan:** `nilai` dan `catatan` diselesaikan **terpisah**.

- nilai yang berlaku = baris terakhir yang `nilai`-nya **tidak** kosong
- catatan yang berlaku = baris terakhir yang `catatan`-nya **tidak** kosong

Sebuah baris boleh mengisi salah satu, atau keduanya. Catatan bersifat menambah keterangan, bukan menarik angka.

**Akibat yang harus dicatat jujur:** dengan aturan ini, angka yang sudah pernah diisi **tidak bisa dikosongkan kembali**. §6.3 mengaku "pembatalan menjadi mungkin"; yang benar-benar mungkin adalah **mengoreksi** angka dengan angka lain. Pengosongan kembali menuntut penanda pembatalan eksplisit, dan itu **ditunda** — lihat daftar di akhir rencana.

### C2 — Urutan "terakhir" ditentukan `penilaian_id`, bukan `pada`

§6.3 tidak menyebut apa yang menentukan urutan. Memakai cap waktu `pada` tampak wajar tetapi salah: dua penilai yang menulis dalam detik yang sama menghasilkan cap waktu identik, sehingga "yang terakhir" menjadi bergantung pada urutan pembacaan — tidak ditentukan.

**Keputusan:** urutan ditentukan `penilaian_id`, yaitu nomor urut yang diberikan **server di dalam `LockService`**. Dengan begitu urutannya total dan tidak pernah seri. `pada` tetap dicatat untuk jejak audit, tetapi tidak pernah dipakai mengurutkan.

### C3 — §5.3 dan §9.2 tidak bisa berlaku bersamaan (butuh keputusan pengguna)

§5.3 menempatkan frontend sebagai situs statis di Vercel atau Netlify. §9.2 menuntut identitas diambil dari `Session.getActiveUser().getEmail()`.

Keduanya tidak dapat berjalan bersama. Permintaan lintas asal dari Vercel ke URL `/exec` Apps Script tidak membawa sesi Google pemanggil dengan cara yang membuat `getActiveUser()` mengembalikan emailnya; yang terjadi adalah pengalihan ke halaman login, yang mematahkan `fetch`. Menurunkan akses deployment menjadi anonim memang membuat `fetch` berhasil — dan sekaligus **membuat `getActiveUser()` mengembalikan string kosong**, sehingga seluruh penegakan peran runtuh (lihat K5).

Dua jalan keluar:

| Jalan | Akibat |
| --- | --- |
| **A. Sajikan UI dari Apps Script** (`HtmlService` + `google.script.run`) | §9.2 berlaku apa adanya, tanpa CORS dan tanpa OAuth yang perlu dibangun. Biaya tetap Rp 0 (§13 butir 10). Kerugiannya URL `/exec` yang jelek dan build Vite harus dipadatkan menjadi satu berkas HTML. **Ini yang saya sarankan.** |
| **B. Tetap di Vercel + Google Identity Services** | §5.3 berlaku apa adanya, tetapi `getActiveUser()` tidak dipakai sama sekali; identitas berasal dari ID token yang harus diverifikasi sendiri di Apps Script. Lebih banyak kode, lebih banyak permukaan serang, dan §9.2 harus ditulis ulang. |

**Rencana ini tidak memilih.** K3 membuatnya tidak perlu memilih. Tetapi **Rencana UI tidak boleh dimulai sebelum pengguna memutuskan**, karena pilihan ini menentukan bentuk seluruh lapisan transport.

### C4 — §9.2 menuntut dua hal yang jarang bisa berlaku bersamaan (butuh keputusan pengguna)

§9.2 menuntut dua hal sekaligus:

1. identitas diambil dari `Session.getActiveUser().getEmail()`;
2. **Spreadsheet Ruang Kerja tidak dibagikan kepada penilai maupun pengamat.**

Mode deployment Apps Script menentukan keduanya, dan tidak ada satu mode pun yang memenuhi keduanya tanpa syarat tambahan:

| Mode | Akibat pada butir 1 | Akibat pada butir 2 |
| --- | --- | --- |
| **Jalankan sebagai: Pengguna yang mengakses** | `getActiveUser()` berisi email pemanggil | **Patah.** Skrip menyentuh Spreadsheet dengan izin pemanggil, jadi Spreadsheet **harus** dibagikan kepada setiap penilai — tepat anti-pola yang §9.2 larang |
| **Jalankan sebagai: Saya (pemilik)** | Berisi email **hanya** bila pemanggil berada di domain Google Workspace yang sama dengan pemilik skrip; untuk akun gmail pribadi hasilnya string kosong | Berlaku apa adanya |

Jadi §9.2 hanya utuh bila **ketiganya** benar: mode "Jalankan sebagai: Saya", akses dibatasi ke domain Workspace institusi, dan **setiap** penilai serta pengamat punya akun di domain itu. Bila ada satu penilai yang memakai gmail pribadi, seluruh permintaannya jatuh ke `TANPA_IDENTITAS` dan sistem terkunci untuknya.

Pertentangan ini **tidak** diselesaikan di sini, dan pesan error pun tidak boleh meresepkan salah satu mode — pesan `TANPA_IDENTITAS` sempat menyuruh pembacanya memilih "Pengguna yang mengakses", yang berarti menuntun orang mematahkan §9.2 sambil mengira sedang memperbaikinya.

Yang harus diputuskan pengguna:

- Apakah institusi punya Google Workspace, dan apakah **seluruh** penilai serta pengamat punya akun di domain itu?
- Bila tidak: klausul §9.2 yang mana yang ditulis ulang — sumber identitasnya, atau larangan berbagi Spreadsheet?

Perhatikan ini **tidak** selesai dengan memilih jalan A pada C3. Menyajikan UI dari Apps Script menyelesaikan soal transport, bukan soal mode deployment.

**Tidak terbuktikan di sandbox.** `node:vm` tidak tahu apa yang Google kembalikan pada tiap mode. Ini harus dibuktikan pada deployment sungguhan dari akun kedua (Tugas 7), dan sampai itu terjadi §13 butir 3 tetap dicatat belum terbukti (K6).

### C5 — peran `pengamat` tidak punya tempat penyimpanan (butuh keputusan pengguna)

§9.1 menyebut tiga peran: Admin, Penilai, dan **Pengamat** yang boleh membaca rekap dan tidak boleh menulis apa pun. §9.3 memperkuatnya dengan menuntut rekap untuk pengamat memakai `id`, bukan email.

Tetapi §6.4 hanya memberi sheet `Sesi` dua kolom peran: `penilai` dan `admin`. Tidak ada tempat menuliskan siapa pengamatnya.

Akibatnya bukan sekadar fitur yang hilang, melainkan tekanan ke arah yang salah: pengamat selalu ditolak sebagai `ORANG_TIDAK_DIKENAL`, dan admin yang ingin memberi akses baca hanya punya satu jalan yang tersedia — menambahkan orang itu ke kolom `penilai`. Itu sama dengan memberinya hak **tulis** ke `Penilaian`. Peran yang tidak punya tempat penyimpanan tidak menjadi tidak ada; ia menjadi peran yang lebih tinggi.

Dua jalan keluar, keduanya menyunting spec:

| Jalan | Akibat |
| --- | --- |
| **A. Tambah kolom `pengamat` pada §6.4** | §9.1 dan §9.3 berlaku apa adanya. `KOLOM_SESI_WAJIB` bertambah satu, dan seluruh sheet `Sesi` yang sudah ada harus ditambahi kolom itu — tanpa itu, kebijakan menolak seluruh sesi lama sebagai `SESI_CACAT`. |
| **B. Buang `pengamat` dari V1** | §9.1 dan §9.3 ditulis ulang. Jujur terhadap yang benar-benar dibangun, tetapi permintaan "boleh lihat rekapnya saja" tidak punya jawaban selain memberi hak tulis. |

**Rencana ini tidak memilih.** Sampai diputuskan, `SYARAT_AKSI` di `Kode.gs` sengaja tidak menyebut `pengamat` sama sekali, dan alasannya ditulis di berkas itu supaya tidak terbaca sebagai kelalaian.

### C6 — siapa yang boleh menyiapkan ruang kerja (diputuskan, dengan syarat)

Spec tidak menjawabnya. §9.1 tidak menyebut penyiapan sebagai aksi, dan §6.4 hanya menyimpan admin **per sesi** — bukan admin ruang kerja. Lingkarannya nyata: penyiapan membuat sheet `Sesi`, sedangkan daftar admin dibaca **dari** sheet itu. Aturan yang hanya bertanya "apakah dia admin?" membuat penyiapan pertama mustahil; aturan yang menyerah membuat siapa pun bisa menyiapkan ruang kerja orang lain.

**Keputusan:** boleh menyiapkan = **pemilik Spreadsheet** (`getOwner()`) **∪** setiap email pada kolom `admin` sheet `Sesi`. Pemilik dipakai karena ia satu-satunya identitas yang sudah ada sebelum data apa pun ada. Bila pemilik tidak terbaca **dan** belum ada admin, permintaan ditolak dengan `PEMILIK_TIDAK_DIKETAHUI` — gagal menutup, bukan membuka.

**Syarat yang membuat keputusan ini sah:** perluasan ke "admin sesi mana pun" hanya benar selama **penyiapan bersifat aditif** — ia boleh membuat sheet yang belum ada dan menambah kepala kolom yang hilang, tetapi tidak boleh menimpa isi yang sudah ada. Begitu penyiapan bisa menimpa, admin sesi mana pun dapat merusak sesi milik orang lain. Syarat ini ditegakkan uji yang membandingkan **isi** sheet sebelum dan sesudah, bukan sekadar jumlah barisnya.

**C6 bergantung pada C4.** Pada mode "Jalankan sebagai: Pengguna yang mengakses", `getOwner()` menuntut pemanggil punya akses ke Spreadsheet — persis yang §9.2 larang. Aturan ini hanya utuh pada mode "Jalankan sebagai: Saya". Jadi C6 ikut menunggu jawaban atas C4.

### C7 — server tidak memeriksa isi penilaian terhadap data lain (butuh keputusan pengguna)

Backend menerima `simpanPenilaian` tanpa memeriksa tiga hal:

- `nilai` tidak diuji terhadap rentang pada `Skema` (`skor_maks`, atau rentang manual di `parameter`)
- `respondenId` tidak diperiksa keberadaannya di sheet `Responden`
- `kriteria` tidak diperiksa keberadaannya di sheet `Skema`

Akibatnya satu salah ketik menghasilkan **baris yatim** yang tetap dijawab tersimpan. Aturan 3 repo menuntut berisik saat ragu, dan ini diam.

Yang menahan keputusan ini bukan kesulitan teknis melainkan biayanya: memeriksa ketiganya berarti membaca dua sheet tambahan **di dalam kunci** pada setiap penulisan, sehingga penulisan menjadi lebih lambat justru pada operasi yang paling sering dilakukan penilai. Ada pula pertanyaan urutan: penilaian manual kadang ditulis untuk kriteria yang memang belum ada di `Skema` (§7.1 aturan `manual`).

**Rencana ini tidak memilih.** Tetapi **Tugas 5 harus tahu cara memperlakukan baris yatim**, karena `nilaiBerlaku` akan menemuinya: baris dengan `respondenId` yang tidak ada di daftar responden mana pun. Menjatuhkannya diam-diam melanggar instruksi repo ("spec menuntut baris ditandai, bukan dihilangkan").

**Catatan kunci untuk Tugas 5.** §6.3 menyebut nilai yang berlaku ditentukan pasangan (`responden_id`, `kriteria`), sedangkan `.github/copilot-instructions.md` menyebut (`sesi_id`, `responden_id`, `kriteria`). Yang benar adalah yang memuat `sesi_id`: tanpa itu, nilai seorang responden pada Pre-Test akan ditimpa nilainya pada Post-Test, dan seluruh kolom `selisih` menjadi kosong tanpa ada yang menyadarinya. Spec §6.3 disunting di Tugas 7.

---

## Struktur Berkas

| Berkas | Tanggung jawab tunggal |
| --- | --- |
| `apps-script/Kode.gs` | Backend yang di-deploy: routing, kebijakan izin, tulis append-only, finalisasi |
| `apps-script/uji/sandbox.ts` | Memuat `Kode.gs` ke `node:vm` dengan global Google palsu |
| `apps-script/uji/googlePalsu.ts` | `Session`, `SpreadsheetApp`, `LockService`, `ContentService` palsu berbasis larik |
| `apps-script/uji/keamanan.test.ts` | §11.3 — memanggil `doPost` langsung |
| `apps-script/uji/penilaian.test.ts` | Append-only, `LockService`, dua penulis bersamaan |
| `apps-script/uji/ruangKerja.test.ts` | Pembuatan lima sheet yang idempoten |
| `src/core/penilaian.ts` | Baris `Penilaian` → nilai dan catatan yang berlaku (murni) |
| `src/io/store.ts` | Satu-satunya tempat memanggil backend; menahan yang belum tersimpan |
| `docs/superpowers/protokol-keamanan.md` | Protokol uji manual terhadap deployment sungguhan |

Aturan ketergantungan tidak berubah: `io` boleh memanggil `core`; `core` tidak memanggil siapa pun. `apps-script/` berdiri sendiri dan **tidak** mengimpor apa pun dari `src/`.

---

### Tugas 1: Fondasi backend dan sandbox uji

**Berkas:**
- Buat: `apps-script/Kode.gs`, `apps-script/uji/googlePalsu.ts`, `apps-script/uji/sandbox.ts`
- Uji: `apps-script/uji/sandbox.test.ts`
- Ubah: `vitest.config.ts`, `tsconfig.json`

Tugas ini tidak menghasilkan fitur; ia menghasilkan **kemampuan membuktikan**. Tanpa sandbox yang benar, enam tugas berikutnya hanya bisa diklaim, tidak dibuktikan. Karena itu ia dikerjakan lebih dulu dan digerbangi tersendiri.

Titik yang mudah salah: `Kode.gs` **tidak boleh** memakai `import`/`export` apa pun. Apps Script memuat berkas sebagai skrip global. Bila `Kode.gs` memakai modul, ia akan lulus di sandbox tetapi gagal di Google — kebalikan dari yang kita inginkan.

- [ ] **Langkah 1: Perluas cakupan uji dan typecheck**

`vitest.config.ts` — tambahkan pola `apps-script`:

```ts
include: ['src/**/*.test.ts', 'apps-script/**/*.test.ts'],
```

`tsconfig.json` — `"include": ["src", "apps-script"]`.

Jalankan `npm test` dan `npm run typecheck`; keduanya harus tetap hijau (391 uji) sebelum berkas baru ditambahkan. Ini memastikan perubahan konfigurasi sendiri tidak merusak apa pun.

- [ ] **Langkah 2: Tulis global Google palsu**

`apps-script/uji/googlePalsu.ts` menyediakan:

- `buatSpreadsheetPalsu(isiAwal: Record<string, unknown[][]>)` → objek dengan `getSheetByName`, `insertSheet`, `getSheets`. Tiap sheet punya `getDataRange().getValues()`, `getRange(baris, kolom)`, `appendRow`, `getLastRow`, `getName`.
- `buatLockPalsu()` → mencatat berapa kali `waitLock` dan `releaseLock` dipanggil, sehingga uji dapat membuktikan kunci selalu dilepas. `buatLockServicePalsu()` membungkus **satu** lock dan mengembalikannya pada setiap `getScriptLock`, supaya uji memegang lock yang benar-benar dipakai `Kode.gs`; menyuntikkan `getScriptLock: buatLockPalsu` memberi objek baru tiap pemanggilan dan membuat Batasan Global 19 mustahil dibuktikan.
- `buatSessionPalsu(email: string)`.
- `ContentService` palsu yang menyimpan teks dan MIME agar uji dapat membaca balasan.

Sheet palsu **wajib menolak** `setValue`, `setValues`, `deleteRow`, dan `clear` pada sheet bernama `Penilaian` dengan melempar error yang jelas. Ini menjadikan Batasan Global 17 sesuatu yang **tidak bisa dilanggar tanpa membuat uji merah**, bukan sekadar niat baik.

`getRange` ada justru agar penolakan itu dapat dibuktikan: tanpanya, uji tidak punya cara memanggil `setValue` sama sekali.

- [ ] **Langkah 3: Tulis pemuat sandbox**

`apps-script/uji/sandbox.ts`:

```ts
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function muatKode(global: Record<string, unknown>): Record<string, unknown> {
  const sumber = readFileSync(new URL('../Kode.gs', import.meta.url), 'utf8');
  const konteks = vm.createContext({ ...global, console });
  vm.runInContext(sumber, konteks, { filename: 'Kode.gs' });
  return konteks;
}
```

- [ ] **Langkah 4: Tulis uji yang gagal**

`apps-script/uji/sandbox.test.ts` membuktikan tiga hal sekaligus, dan yang ketiga adalah uji-terhadap-penjaganya sendiri:

```ts
it('memuat Kode.gs dan mengekspos doPost sebagai fungsi', () => { /* ... */ });

it('menolak Kode.gs yang memakai sintaks modul', () => {
  // Apps Script memuat berkas sebagai skrip global; `import` akan lulus di
  // sandbox tetapi gagal di Google. Diperiksa sebagai teks, bukan dijalankan.
  const sumber = readFileSync(new URL('../Kode.gs', import.meta.url), 'utf8');
  expect(sumber).not.toMatch(/^\s*(import|export)\s/m);
});

it('sheet Penilaian palsu melempar bila ada yang mencoba menimpa baris', () => {
  const ss = buatSpreadsheetPalsu({ Penilaian: [['penilaian_id']] });
  expect(() => ss.getSheetByName('Penilaian').getRange(1, 1).setValue('x')).toThrow(/append-only/i);
});
```

- [ ] **Langkah 5: Tulis `Kode.gs` seminimal mungkin agar uji lulus**

Hanya `doPost` yang mengembalikan penolakan untuk aksi tak dikenal. Belum ada kebijakan, belum ada tulis.

- [ ] **Langkah 6: Jalankan uji, pastikan hijau, lalu commit**

`test(apps-script): sandbox yang memuat Kode.gs dengan global Google palsu`

---

### Tugas 2: Kebijakan izin

**Berkas:**
- Ubah: `apps-script/Kode.gs`
- Uji: `apps-script/uji/keamanan.test.ts`

Ini inti rencana. Seluruh §11.3 dibuktikan di sini dengan memanggil `doPost` langsung.

Tabel peran §9.1 diterjemahkan menjadi satu fungsi `putuskanIzin_(emailSesi, aksi, sesi)` yang mengembalikan `{izin:true}` atau `{izin:false, kode, pesan}`. Kode kesalahan yang dipakai: `TANPA_IDENTITAS`, `ORANG_TIDAK_DIKENAL`, `BUKAN_ADMIN`, `SESI_FINAL`, `SESI_TIDAK_ADA`, `MUATAN_TIDAK_SAH`.

Namanya `ORANG_TIDAK_DIKENAL`, bukan `TIDAK_DIKENAL`, karena `TIDAK_DIKENAL` adalah substring dari `AKSI_TIDAK_DIKENAL`: satu `kode.includes('TIDAK_DIKENAL')` di frontend akan menyamakan "Anda bukan siapa-siapa di sesi ini" dengan "aksi ini tidak ada".

**Helper `panggil` yang dipakai seluruh uji di bawah** dibuat lebih dulu di berkas uji ini. Ia merakit sandbox, menyiapkan sheet `Sesi` berisi satu sesi bawaan, lalu memanggil `doPost` sungguhan:

```ts
function panggil(opsi: {
  email: string;
  aksi: string;
  muatan?: Record<string, unknown>;
  sesi?: Partial<BarisSesi>;
}) {
  const sesi = { sesiId: 'S1', status: 'berjalan', admin: ['admin@kampus.id'],
                 penilai: ['Penilai@Kampus.id '], ...opsi.sesi };
  const ss = buatSpreadsheetPalsu({ Sesi: barisDari(sesi), Penilaian: [KEPALA_PENILAIAN] });
  const konteks = muatKode({
    Session: buatSessionPalsu(opsi.email),
    SpreadsheetApp: { getActive: () => ss },
    LockService: buatLockServicePalsu(),
    ContentService: buatContentServicePalsu(),
  });
  const keluaran = (konteks.doPost as Function)({
    postData: { contents: JSON.stringify({ aksi: opsi.aksi, sesiId: sesi.sesiId, muatan: opsi.muatan ?? {} }) },
  });
  return { balasan: JSON.parse(keluaran.getContent()), ss };
}
```

Perhatikan daftar penilai bawaan sengaja ditulis `'Penilai@Kampus.id '` — berhuruf besar dan berspasi tepi. Uji normalisasi di Langkah 2 bergantung padanya.

- [ ] **Langkah 1: Tulis uji yang gagal — empat kasus §11.3**

```ts
it('menolak penilai yang mengirim permintaan ubah skema', () => {
  const { balasan } = panggil({ email: 'penilai@kampus.id', aksi: 'ubahSkema' });
  expect(balasan.ok).toBe(false);
  expect(balasan.kode).toBe('BUKAN_ADMIN');
});

it('menolak penilai yang mengirim permintaan ubah bobot', () => { /* sama, aksi ubahBobot */ });

it('menolak penulisan ke sesi berstatus final', () => {
  const { balasan } = panggil({
    email: 'admin@kampus.id',           // admin sekalipun ditolak
    aksi: 'simpanPenilaian',
    sesi: { status: 'final' },
  });
  expect(balasan.kode).toBe('SESI_FINAL');
});

it('menolak email di luar daftar', () => {
  const { balasan } = panggil({ email: 'orangluar@gmail.com', aksi: 'bacaRekap' });
  expect(balasan.kode).toBe('ORANG_TIDAK_DIKENAL');
});
```

- [ ] **Langkah 2: Tulis uji yang gagal — tiga jebakan yang tidak disebut §11.3**

Ketiganya adalah cara sistem ini bisa tampak aman padahal tidak:

```ts
it('menolak identitas kosong dengan kode tersendiri', () => {
  // Deployment "siapa saja, bahkan anonim" membuat getActiveUser() kosong.
  // Bila ini jatuh ke ORANG_TIDAK_DIKENAL, salah setel deployment akan tersamar
  // sebagai penolakan peran biasa dan tidak pernah tertangkap.
  const { balasan } = panggil({ email: '', aksi: 'bacaRekap' });
  expect(balasan.kode).toBe('TANPA_IDENTITAS');
});

it('mengabaikan email yang dikirim frontend', () => {
  // Batasan Global 15. Muatan mengaku admin; sesi bilang penilai.
  const { balasan } = panggil({
    email: 'penilai@kampus.id',
    aksi: 'ubahSkema',
    muatan: { email: 'admin@kampus.id', oleh: 'admin@kampus.id', peran: 'admin' },
  });
  expect(balasan.kode).toBe('BUKAN_ADMIN');
});

it('mencocokkan email tanpa memedulikan huruf besar-kecil dan spasi tepi', () => {
  // Aturan 4 repo. Daftar penilai memuat "Penilai@Kampus.id "; sesi mengirim
  // "penilai@kampus.id". Keduanya orang yang sama.
  const { balasan } = panggil({ email: 'penilai@kampus.id', aksi: 'simpanPenilaian' });
  expect(balasan.ok).toBe(true);
});
```

- [ ] **Langkah 3: Terapkan `putuskanIzin_` di `Kode.gs`**

Urutan pemeriksaan penting dan harus sesuai uji: identitas kosong → sesi ada → orang dikenal → peran cukup → status sesi.

- [ ] **Langkah 4: Jalankan uji, pastikan hijau, lalu commit**

`feat(apps-script): kebijakan izin yang ditegakkan di server`

---

### Tugas 3: Tulis `Penilaian` append-only

**Berkas:**
- Ubah: `apps-script/Kode.gs`
- Uji: `apps-script/uji/penilaian.test.ts`

- [ ] **Langkah 1: Tulis uji yang gagal**

```ts
it('menambah baris, tidak menimpa baris lama', () => {
  simpan({ respondenId: 'a1', kriteria: 'K1', nilai: 70 });
  simpan({ respondenId: 'a1', kriteria: 'K1', nilai: 85 });
  expect(barisPenilaian()).toHaveLength(2);
});

it('memberi penilaian_id yang menaik dan tidak pernah kembar', () => { /* ... */ });

it('mengambil kolom oleh dari sesi Google, bukan dari muatan', () => {
  simpan({ email: 'penilai@kampus.id', muatan: { oleh: 'palsu@x.com' } });
  expect(barisPenilaian()[0].oleh).toBe('penilai@kampus.id');
});

it('melepas kunci walau penulisan gagal setelah kunci terambil', () => {
  // LockService yang tidak dilepas akan membekukan seluruh sistem sampai
  // batas waktunya habis. Jalur gagal justru yang paling sering lupa.
  const lockService = buatLockServicePalsu();
  simpanYangGagal(lockService);
  expect(lockService.lock.jumlahAmbil).toBe(1);
  expect(lockService.lock.jumlahLepas).toBe(1);
});

it('menolak dengan pesan yang mengajari bila kunci tidak bisa diambil', () => {
  // JANGAN menulis `jumlahLepas === jumlahAmbil` di sini. `waitLock` yang
  // melempar tidak pernah menambah `jumlahAmbil`, sehingga implementasi yang
  // BENAR (melepas di `finally`) menghasilkan 1 lepas atas 0 ambil dan uji
  // seperti itu justru merah. Yang diperiksa: permintaan ditolak, bukan
  // dianggap tersimpan.
  const lockService = buatLockServicePalsu({ gagalkanWaitLock: true });
  const { balasan } = simpan({ lockService });
  expect(balasan.ok).toBe(false);
  expect(lockService.lock.jumlahAmbil).toBe(0);
  expect(barisPenilaian()).toHaveLength(0);
});

it('dua penulis bersamaan sama-sama tersimpan', () => {
  // Kriteria penerimaan 13 butir 4.
  simpan({ email: 'penilai1@kampus.id', respondenId: 'a1', kriteria: 'K1', nilai: 70 });
  simpan({ email: 'penilai2@kampus.id', respondenId: 'a1', kriteria: 'K1', nilai: 90 });
  const baris = barisPenilaian();
  expect(baris).toHaveLength(2);
  expect(baris.map((b) => b.oleh)).toEqual(['penilai1@kampus.id', 'penilai2@kampus.id']);
});
```

- [ ] **Langkah 2: Terapkan, jalankan, commit**

`feat(apps-script): tulis Penilaian secara append-only di dalam kunci`

---

### Tugas 4: Finalisasi sesi dan penyiapan ruang kerja

**Berkas:**
- Ubah: `apps-script/Kode.gs`
- Uji: `apps-script/uji/ruangKerja.test.ts`, tambahan pada `keamanan.test.ts`

Dua hal kecil yang digabung karena keduanya menyentuh sheet `Sesi` dan sama-sama hanya boleh dilakukan admin.

- [ ] **Langkah 1: Tulis uji yang gagal**

```ts
it('hanya admin yang boleh memfinalkan sesi', () => { /* penilai -> BUKAN_ADMIN */ });

it('menolak seluruh penulisan setelah sesi final', () => { /* ... */ });

it('membuat lima sheet beserta kepalanya bila belum ada', () => {
  const ss = buatSpreadsheetPalsu({});
  siapkan(ss);
  expect(ss.getSheets().map((s) => s.getName()).sort())
    .toEqual(['Penilaian', 'Proyek', 'Responden', 'Sesi', 'Skema']);
});

it('tidak menyentuh sheet yang sudah ada isinya', () => {
  // Idempoten. Penyiapan yang dijalankan dua kali tidak boleh menghapus data.
  const ss = buatSpreadsheetPalsu({ Penilaian: [['penilaian_id'], ['1']] });
  siapkan(ss);
  siapkan(ss);
  expect(ss.getSheetByName('Penilaian').getDataRange().getValues()).toHaveLength(2);
});
```

- [ ] **Langkah 2: Terapkan, jalankan, commit**

`feat(apps-script): finalisasi sesi dan penyiapan ruang kerja yang idempoten`

---

### Tugas 5: `src/core/penilaian.ts` — nilai dan catatan yang berlaku

**Berkas:**
- Buat: `src/core/penilaian.ts`
- Uji: `src/core/penilaian.test.ts`

Fungsi murni. Di sinilah keputusan C1 dan C2 hidup.

**Antarmuka:** `nilaiBerlaku(baris: BarisPenilaian[]): Map<string, HasilBerlaku>` dengan kunci `` `${respondenId}|${kriteria}` `` dan `HasilBerlaku` berisi `nilai: number | null`, `catatan: string | null`, `oleh`, `pada`.

`BarisPenilaian` memuat `penilaianId`, `respondenId`, `kriteria`, `nilai: number | null`, `catatan: string | null`, `oleh: string`, dan `pada: string`. Seluruh medan **wajib** — larik uji di bawah ditulis ringkas demi keterbacaan, tetapi berkas uji yang sesungguhnya harus melengkapi `oleh` dan `pada`. Pakai satu fungsi pembantu `barisUji(sebagian)` yang mengisi medan sisanya dengan nilai bawaan, supaya uji tidak dipenuhi medan yang tidak relevan dengan yang sedang dibuktikan.

- [ ] **Langkah 1: Tulis uji yang gagal**

```ts
it('memakai baris terakhir untuk pasangan yang sama', () => { /* 70 lalu 85 -> 85 */ });

it('catatan tidak menghapus nilai yang sudah ada', () => {
  // Koreksi C1. Dibaca harfiah, spec membuat catatan menelan angkanya.
  const hasil = nilaiBerlaku([
    { penilaianId: 1, respondenId: 'a1', kriteria: 'K1', nilai: 80, catatan: null },
    { penilaianId: 2, respondenId: 'a1', kriteria: 'K1', nilai: null, catatan: 'perlu ditinjau' },
  ]);
  const satu = hasil.get('a1|K1');
  expect(satu?.nilai).toBe(80);
  expect(satu?.catatan).toBe('perlu ditinjau');
});

it('membedakan belum pernah dinilai dari pernah dinilai nol', () => {
  // Aturan 2 repo, di lapisan yang paling mudah melanggarnya.
  expect(nilaiBerlaku([]).get('a1|K1')).toBeUndefined();
  const nol = nilaiBerlaku([{ penilaianId: 1, respondenId: 'a1', kriteria: 'K1', nilai: 0, catatan: null }]);
  expect(nol.get('a1|K1')?.nilai).toBe(0);
});

it('mengurutkan berdasarkan penilaian_id, bukan cap waktu', () => {
  // Koreksi C2. Cap waktu sengaja dibuat identik dan terbalik urutannya.
  const hasil = nilaiBerlaku([
    { penilaianId: 2, respondenId: 'a1', kriteria: 'K1', nilai: 85, catatan: null, pada: '2026-01-01T00:00:00Z' },
    { penilaianId: 1, respondenId: 'a1', kriteria: 'K1', nilai: 70, catatan: null, pada: '2026-01-01T00:00:00Z' },
  ]);
  expect(hasil.get('a1|K1')?.nilai).toBe(85);
});

it('memisahkan responden dan kriteria yang berbeda', () => { /* ... */ });
```

- [ ] **Langkah 2: Terapkan, jalankan, pastikan `kemurnian.test.ts` tetap hijau, commit**

`feat(core): nilai dan catatan yang berlaku dari Penilaian append-only`

---

### Tugas 6: `src/io/store.ts`

**Berkas:**
- Buat: `src/io/store.ts`
- Uji: `src/io/store.test.ts`

Satu-satunya tempat yang memanggil backend. Batasan Global 18 adalah alasan keberadaan berkas ini.

**Antarmuka:** `buatStore({ kirim, muatTertunda, simpanTertunda })`. `kirim` adalah `FungsiKirim` yang disuntikkan (K3) dan **wajib**. `muatTertunda` dan `simpanTertunda` mewakili penyimpanan lokal dan **opsional** — bila tidak diberikan, Store memakai penyimpanan dalam memori, sehingga uji cukup menyuntikkan `kirim` saja. Menghasilkan `antre(perintah)`, `kirimTertunda()`, `daftarTertunda()`.

- [ ] **Langkah 1: Tulis uji yang gagal**

```ts
it('menandai perintah sebagai belum tersimpan sampai server membenarkan', () => { /* ... */ });

it('tetap belum tersimpan bila server menjawab ok:false', async () => { /* ... */ });

it('tetap belum tersimpan bila jaringan melempar', async () => {
  const store = buatStore({ kirim: () => { throw new Error('jaringan putus'); } });
  store.antre(perintah);
  await store.kirimTertunda();
  expect(store.daftarTertunda()).toHaveLength(1);
});

it('tetap belum tersimpan bila balasan cacat', async () => {
  // Balasan tanpa medan ok. Menganggapnya sukses adalah cara paling halus
  // kehilangan data penilaian: layar bilang tersimpan, server tidak pernah
  // menerima apa pun.
  const store = buatStore({ kirim: async () => ({ hasil: 'mungkin' }) });
  store.antre(perintah);
  await store.kirimTertunda();
  expect(store.daftarTertunda()).toHaveLength(1);
});

it('membuang dari antrean hanya setelah ok:true', async () => { /* ... */ });

it('mempertahankan urutan antrean saat sebagian gagal', async () => { /* ... */ });
```

- [ ] **Langkah 2: Terapkan, jalankan, commit**

`feat(io): store yang menahan perintah sampai server membenarkan`

---

### Tugas 7: Protokol uji keamanan manual dan pelurusan dokumen

**Berkas:**
- Buat: `docs/superpowers/protokol-keamanan.md`
- Ubah: `docs/superpowers/specs/2026-09-27-formscoring-engine-design.md` (§6.3, §9.2)

Tugas ini tidak menambah kode. Ia mencegah klaim yang lebih besar daripada buktinya.

- [ ] **Langkah 1: Tulis protokol**

Protokol memuat, dalam urutan yang dapat diikuti tanpa menebak:

1. **Setelan deployment yang benar** — "Jalankan sebagai: Pengguna yang mengakses", "Siapa yang punya akses: siapa saja dengan Akun Google" (atau dibatasi domain). Sertakan peringatan bahwa memilih anonim membuat `getActiveUser()` kosong dan seluruh penegakan peran runtuh.
2. **Pemeriksaan §9.2 yang tidak bisa diotomatiskan:** Spreadsheet Ruang Kerja **tidak** dibagikan kepada penilai maupun pengamat. Langkahnya: buka menu Bagikan, pastikan hanya admin yang terdaftar. Bila Spreadsheet dibagikan, seluruh pengaturan peran menjadi hiasan.
3. **Empat uji §11.3 terhadap deployment sungguhan,** masing-masing dengan akun yang menjalankan, langkah persis, dan balasan yang diharapkan — termasuk kode kesalahannya.
4. **Tempat mencatat bukti** — tanggal, akun, dan balasan apa adanya.

- [ ] **Langkah 2: Sunting spec**

- §6.3: tambahkan catatan koreksi C1 dan C2 dengan gaya yang sudah dipakai §5.2 dan §6.1.
- §9.2: tambahkan peringatan mode deployment dari K5.

- [ ] **Langkah 3: Commit**

`docs: protokol uji keamanan manual dan koreksi §6.3 serta §9.2`

---

## Kriteria Selesai Rencana Ini

Jalankan perintahnya, lihat keluarannya, baru menyatakan beres.

- [ ] `npm test` lulus **5 kali berturut-turut** — tempelkan kelima ringkasannya
- [ ] `npm run typecheck` bersih, keluar dengan kode 0
- [ ] `src/core/kemurnian.test.ts` dan `src/io/penulisEkspor.test.ts` masih lulus
- [ ] `apps-script/Kode.gs` tidak memuat `import` maupun `export` — dijaga uji, bukan diperiksa mata
- [ ] Seluruh uji keamanan memanggil `doPost`; tidak satu pun memeriksa tampilan
- [ ] Uji membuktikan email dari muatan diabaikan, dan email kosong ditolak dengan kode tersendiri
- [ ] Sheet `Penilaian` palsu melempar bila ada yang mencoba menimpa atau menghapus baris
- [ ] `docs/superpowers/protokol-keamanan.md` ada dan dapat diikuti tanpa menebak
- [ ] Ketujuh tugas ter-commit terpisah

## Yang masih ditunda setelah rencana ini

| Hal | Alasan |
| --- | --- |
| **§13 butir 3 terhadap deployment sungguhan** | Menuntut akun Google kedua dan deployment; protokolnya ada, pelaksanaannya menunggu pengguna. Sampai itu, butir 3 terbukti untuk **kebijakannya**, bukan untuk sistem terpasangnya |
| **Pembatalan nilai menjadi kosong kembali** | Lihat C1. Menuntut penanda pembatalan eksplisit; mengosongkan lewat baris bernilai kosong bertabrakan dengan catatan |
| **Keputusan hosting (C3)** | Menghalangi Rencana UI, bukan rencana ini |
| **`peringatanPerSesi` yang hilang di hilir** | Diwarisi dari Rencana 4; menuntut keputusan kosakata status di §8.4 |
| **Sheet "Ringkasan proyek" (§8.4)** | Diwarisi dari Rencana 4; `ringkasProyek` ada di core tetapi tidak pernah sampai ke berkas ekspor |
| **Penugasan penilai per kelompok** | §12.3; struktur data sudah menampung, antarmukanya ditunda |
| **Kerentanan `xlsx@0.18.5`** | Dua peringatan tingkat tinggi; versi tertambal hanya ada di cdn.sheetjs.com |
