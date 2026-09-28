# Protokol Uji Keamanan Manual — FormScoring Engine

Dijalankan **manusia**, terhadap **deployment Apps Script yang sesungguhnya**. Bukan pengganti uji otomatis, melainkan pelengkapnya.

**Spec:** [specs/2026-09-27-formscoring-engine-design.md](specs/2026-09-27-formscoring-engine-design.md) — §9.2, §11.3, §13 butir 3
**Rencana asal:** [plans/2026-09-28-store-dan-peran.md](plans/2026-09-28-store-dan-peran.md) — K5, K6, C3, C4

---

## 0. Apa yang protokol ini buktikan, dan apa yang tidak

`apps-script/uji/keamanan.test.ts` memanggil `doPost` secara langsung di dalam `node:vm` dan membuktikan **kebijakannya**: urutan pemeriksaan, kode penolakan, pengabaian identitas dari muatan, normalisasi email. Itu sudah lulus otomatis pada setiap `npm test`.

Yang **tidak** dibuktikan uji itu, karena `node:vm` tidak tahu apa pun tentang Google:

| Pertanyaan | Hanya terjawab di Google |
| --- | --- |
| Siapa yang sebenarnya dikembalikan `Session.getActiveUser().getEmail()` pada tiap mode deployment | ya |
| Apakah Spreadsheet Ruang Kerja benar-benar tidak dibagikan | ya |
| Apakah `SpreadsheetApp.flush()` benar-benar diperlukan sebelum `releaseLock` | ya |
| Apakah Sheets menafsirkan teks berawalan `+`, `-`, `@` sebagai rumus | ya |
| Apakah permintaan lintas situs dapat membawa kuki Google ke `/exec` | ya |

Sampai protokol ini dijalankan dan tabel bukti di §8 terisi, **§13 butir 3 tetap dicatat belum terbukti untuk sistem terpasangnya** (K6). Mengaku lulus lebih awal adalah cacat yang sama yang sudah berkali-kali tertangkap di proyek ini.

---

## 1. Prasyarat

Siapkan seluruhnya sebelum langkah pertama. Protokol ini tidak boleh dijalankan sambil menebak.

1. **Spreadsheet Ruang Kerja** berisi kelima sheet menurut §6.1–§6.5. Bila belum ada, jalankan aksi `siapkanRuangKerja` lebih dulu (lihat §4 untuk cara mengirim permintaan).
2. **Proyek Apps Script terikat** pada Spreadsheet itu, berisi `apps-script/Kode.gs` apa adanya, sudah di-deploy sebagai **Web App**. Catat URL `/exec`-nya.
3. **Akun Google kedua** yang **bukan pemilik skrip** dan **tidak** punya akses apa pun ke Spreadsheet Ruang Kerja. Akun inilah yang memerankan penilai dan orang luar; tanpa akun kedua, seluruh protokol ini hanya menguji pemiliknya sendiri dan tidak membuktikan apa pun.
4. **Tiga baris pada sheet `Sesi`**, diisi dengan tangan oleh pemilik:

   | `sesi_id` | `status` | `penilai` | `admin` |
   | --- | --- | --- | --- |
   | `UJI-JALAN` | `berjalan` | *email akun kedua* | *email pemilik* |
   | `UJI-FINAL` | `final` | *email akun kedua* | *email pemilik* |
   | `UJI-LUAR` | `berjalan` | *(kosong)* | *email pemilik* |

   Kolom `proyek_id`, `nama`, `skema_id`, dan `mode` boleh diisi apa saja; kebijakan izin tidak membacanya.

5. **Satu `responden_id` yang sah** untuk uji tulis. Boleh nilai hash apa pun sepanjang konsisten, misalnya `0a1b2c3d4e5f6071`.

> **Catatan penting.** Sheet `Penilaian` bersifat **append-only** dan backend tidak punya aksi hapus. Setiap baris yang ditulis protokol ini akan **tinggal permanen**. Jalankan protokol pada Spreadsheet Ruang Kerja **khusus uji**, bukan pada ruang kerja yang memuat data penelitian sungguhan.

---

## 2. Setelan deployment — **belum diputuskan**, justru inilah yang dibuktikan

Bagian ini adalah bagian paling berbahaya dari seluruh protokol, dan sengaja **tidak** meresepkan satu mode. Koreksi **C4** pada rencana store-dan-peran mencatat bahwa §9.2 menuntut dua hal yang jarang bisa berlaku bersamaan, dan pilihan mode inilah yang menentukan mana di antara keduanya yang patah.

### 2.1 Dua mode dan akibatnya

Pada dialog **Deploy → New deployment → Web app**, Apps Script menanyakan dua hal terpisah: **"Execute as"** (Jalankan sebagai) dan **"Who has access"** (Siapa yang punya akses).

| Mode "Jalankan sebagai" | Yang diharapkan dikembalikan `Session.getActiveUser().getEmail()` | Akibat pada §9.2 |
| --- | --- | --- |
| **Pengguna yang mengakses** | Email pemanggil | **§9.2 patah.** Skrip menyentuh Spreadsheet dengan izin pemanggil, sehingga Spreadsheet **harus** dibagikan kepada setiap penilai — tepat yang §9.2 larang. Pemeriksaan §3 di bawah pasti gagal |
| **Saya (pemilik skrip)** | Email pemanggil **hanya** bila ia berada di domain Google Workspace yang sama dengan pemilik; untuk akun gmail pribadi diharapkan **string kosong** | §9.2 berlaku apa adanya, tetapi setiap penilai di luar domain terkunci sebagai `TANPA_IDENTITAS` |

Kolom tengah ditulis **"yang diharapkan"**, bukan "yang terjadi". Itulah yang diukur §2.3. Jangan menyalin isinya ke tabel bukti tanpa menjalankan sondenya.

### 2.2 Peringatan akses anonim

Pada **"Siapa yang punya akses"**, memilih **"Siapa saja"** (Anyone, tanpa syarat akun Google) membuat `Session.getActiveUser().getEmail()` mengembalikan **string kosong untuk semua orang**, apa pun mode "Jalankan sebagai"-nya. Bila itu terjadi, seluruh penegakan peran runtuh: tidak ada identitas yang bisa dicocokkan dengan daftar pada sheet `Sesi`.

Backend **menolaknya dengan kode tersendiri**, `TANPA_IDENTITAS`, bukan dengan `ORANG_TIDAK_DIKENAL` (K5). Bedanya bukan kosmetik: bila salah setel jatuh ke kode penolakan peran biasa, ia akan terbaca sebagai "orang ini memang tidak terdaftar" dan tidak pernah tertangkap.

**Protokol harus memastikan kode itulah yang muncul** — lihat sonde A2 di §2.3.

### 2.3 Sonde identitas — inilah yang menjawab C4

Tiga sonde, dijalankan sebelum apa pun yang lain. Cara mengirimnya ada di §4.

| Kode | Akun | Badan permintaan | Yang dibaca dari balasan |
| --- | --- | --- | --- |
| **A1** | Akun kedua | `{"aksi":"bacaRekap","sesiId":"UJI-LUAR","muatan":{}}` | Kode kesalahannya |
| **A2** | Tanpa identitas (kirim **tanpa** header `Authorization`) | sama seperti A1 | Kode kesalahannya |
| **A3** | Pemilik skrip | `{"aksi":"bacaRekap","sesiId":"UJI-JALAN","muatan":{}}` | Kode kesalahannya |

Cara membaca hasilnya:

- **A1 menjawab `ORANG_TIDAK_DIKENAL`** → Google **mengirimkan** identitas akun kedua. Pesan penolakannya berbunyi `Email <x> tidak terdaftar sebagai admin maupun penilai pada sesi "UJI-LUAR"`. **Salin `<x>` apa adanya ke tabel bukti** — itulah jawaban empiris atas pertanyaan "siapa yang sebenarnya dikembalikan `getActiveUser()`", dan itu yang dilaporkan ke pengguna untuk memutuskan C4.
- **A1 menjawab `TANPA_IDENTITAS`** → Google **tidak** mengirimkan identitas pada setelan ini. Mode "Jalankan sebagai: Saya" dengan akun di luar domain adalah penyebab yang paling mungkin, tetapi **jangan mencatatnya sebagai sebab tanpa menguji setelan yang lain**. Ulangi A1 pada setelan alternatif dan catat kedua hasilnya.
- **A2 wajib menjawab `TANPA_IDENTITAS`.** Kode lain apa pun di sini adalah temuan serius dan harus dilaporkan sebelum protokol dilanjutkan.
- **A3 diharapkan menjawab `AKSI_BELUM_DIBANGUN`** — lihat §5; itu berarti izin **lolos**.

> **C4 tidak diputuskan di sini.** Protokol ini hanya menghasilkan angka dan kode yang dilaporkan ke pengguna. Pertanyaan yang harus dijawab pengguna setelah tabel bukti terisi: apakah institusi punya Google Workspace, dan apakah **seluruh** penilai serta pengamat punya akun di domain itu? Bila tidak — klausul §9.2 yang mana yang ditulis ulang, sumber identitasnya atau larangan berbagi Spreadsheet?

---

## 3. Pemeriksaan §9.2 yang tidak bisa diotomatiskan

§9.2 menyatakan: **Spreadsheet Ruang Kerja tidak dibagikan kepada penilai maupun pengamat.** Tidak ada uji otomatis yang bisa memeriksa ini — setelannya hidup di Google Drive, bukan di dalam kode.

Konsekuensinya keras: **bila Spreadsheet dibagikan, seluruh pengaturan peran menjadi hiasan belaka.** Penilai yang punya akses Editor ke Spreadsheet dapat mengubah kolom `nilai`, menghapus baris `Penilaian`, mengubah kolom `status`, dan menambahkan emailnya sendiri ke kolom `admin` — seluruhnya tanpa menyentuh Web App dan tanpa satu pun pemeriksaan di `Kode.gs` ikut berjalan. Akses Viewer pun sudah membatalkan §9.3, karena ia memperlihatkan kolom `email` dan `nama` seluruh responden.

**Langkahnya, dijalankan pemilik:**

1. Buka Spreadsheet Ruang Kerja.
2. Klik tombol **Bagikan** di kanan atas.
3. Pada daftar **"Orang yang memiliki akses"**, yang boleh terlihat **hanya**: pemilik, dan email yang memang terdaftar sebagai **admin**. Satu pun email penilai atau pengamat di daftar ini = **GAGAL**.
4. Pada bagian **"Akses umum"**, setelannya harus **"Dibatasi"** (Restricted). Pilihan **"Siapa saja yang memiliki link"** = **GAGAL**, apa pun perannya.
5. Buka **File → Bagikan → Publikasikan ke web**. Harus dalam keadaan **belum dipublikasikan**. Spreadsheet Ruang Kerja yang dipublikasikan membocorkan seluruh isinya tanpa perlu akun sama sekali. (Yang boleh dipublikasikan adalah spreadsheet **sumber impor**, bukan Ruang Kerja — dua berkas yang berbeda.)
6. Buka **Ekstensi → Apps Script**, lalu **Bagikan** pada proyek skripnya. Daftarnya harus sama dengan langkah 3. Akses Editor ke proyek skrip berarti kebijakan izin dapat disunting oleh yang bersangkutan.

**Catat hasilnya apa adanya di tabel bukti sebagai baris B1–B4.** Bila langkah 3 gagal **karena** mode deployment "Pengguna yang mengakses" mengharuskannya, itu bukan kesalahan pelaksana protokol — itu **tepat pertentangan C4**, dan harus dicatat begitu, bukan diperbaiki diam-diam dengan mencabut akses lalu membuat penilai tidak bisa bekerja.

---

## 4. Cara mengirim permintaan sebagai akun tertentu

Backend **tidak punya `doGet`**. Membuka URL `/exec` di bilah alamat peramban hanya menghasilkan galat Apps Script, dan itu **bukan** kegagalan keamanan. Seluruh uji di bawah harus dikirim sebagai **POST** berisi JSON.

Pakai URL **`/exec`** (versi yang di-deploy), **bukan `/dev`**. URL `/dev` hanya dapat diakses pemilik skrip, sehingga memakainya membuat akun kedua tidak pernah benar-benar diuji.

### Cara yang disarankan: proyek Apps Script kedua sebagai klien

Dijalankan **dari akun kedua**. Ini satu-satunya cara yang tersedia hari ini untuk mengirim POST yang membawa identitas akun tertentu tanpa menambahkan `doGet` ke `Kode.gs` (dan menambahkan `doGet` adalah perubahan kode yang berada di luar cakupan protokol ini).

1. Akun kedua membuka [script.google.com](https://script.google.com) → **New project**.
2. Tempelkan:

   ```js
   function uji() {
     var url = 'https://script.google.com/macros/s/XXXXX/exec';
     var badan = { aksi: 'bacaRekap', sesiId: 'UJI-LUAR', muatan: {} };
     var res = UrlFetchApp.fetch(url, {
       method: 'post',
       contentType: 'application/json',
       payload: JSON.stringify(badan),
       headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
       muteHttpExceptions: true,
     });
     Logger.log(res.getResponseCode() + ' ' + res.getContentText());
   }
   ```

3. Jalankan, setujui permintaan izin, lalu salin isi **Execution log** apa adanya ke tabel bukti.

**Tiga gejala yang harus dikenali, jangan ditebak:**

| Gejala | Artinya |
| --- | --- |
| Balasan berupa **HTML**, bukan JSON | Permintaan tidak pernah sampai ke `doPost`; Google mengalihkannya ke halaman masuk. Identitas tidak terkirim — **bukan** bukti kebijakan menolak |
| Kode HTTP **401** atau **403** | Sama: yang menolak adalah Google, bukan `Kode.gs`. Biasanya perlu menambahkan `oauthScopes` pada `appsscript.json` klien, minimal `script.external_request` dan `userinfo.email`. **Catat apa yang akhirnya berhasil** — berkas ini tidak boleh menebaknya untuk Anda |
| Balasan JSON bermedan `ok` dan `kode` | Permintaan sampai ke `doPost`. Hanya balasan bentuk inilah yang sah dipakai sebagai bukti |

Menghilangkan baris `headers` mengirim permintaan **tanpa identitas**; itulah yang dipakai sonde A2.

---

## 5. Kontrol positif — dijalankan **sebelum** empat uji penolakan

Empat penolakan tidak membuktikan apa pun bila deployment-nya menolak segala sesuatu. Deployment yang salah URL, salah versi, atau salah sesi juga menghasilkan empat penolakan yang tampak meyakinkan. Karena itu dua langkah berikut wajib lulus lebih dulu.

| Kode | Akun | Badan permintaan | Balasan yang diharapkan |
| --- | --- | --- | --- |
| **C1** | Pemilik (admin `UJI-JALAN`) | `{"aksi":"bacaRekap","sesiId":"UJI-JALAN","muatan":{}}` | `ok:false`, `kode:"AKSI_BELUM_DIBANGUN"` |
| **C2** | Akun kedua (penilai `UJI-JALAN`) | `{"aksi":"simpanPenilaian","sesiId":"UJI-JALAN","muatan":{"respondenId":"0a1b2c3d4e5f6071","kriteria":"q1","nilai":4}}` | `ok:true`, `kode:"TERSIMPAN"`, memuat `penilaianId` |

**C1 sengaja berbalas `ok:false`.** `bacaRekap` memang belum punya penanganan di backend; yang dibuktikan C1 adalah bahwa permintaannya **melewati seluruh kebijakan izin** dan berhenti di titik sambung. Kode `AKSI_BELUM_DIBANGUN` hanya dapat dicapai setelah identitas terbaca, sesi ditemukan, orangnya dikenal, dan perannya cukup. Bila C1 menjawab `TANPA_IDENTITAS`, `SESI_TIDAK_ADA`, atau `SESI_CACAT`, **hentikan protokol dan perbaiki prasyaratnya** — empat uji di §6 tidak akan berarti apa-apa.

**Setelah C2, buka sheet `Penilaian` dan periksa dengan mata:**

- barisnya benar-benar bertambah, dan baris sebelumnya tidak berubah;
- kolom `oleh` berisi **email akun kedua**, bukan apa pun yang dikirim frontend;
- kolom `responden_id` berbunyi `0a1b2c3d4e5f6071` sebagai **teks**, bukan berubah menjadi angka;
- kolom `nilai` berisi `4`.

---

## 6. Empat uji §11.3 terhadap deployment sungguhan

Kode kesalahan di bawah diambil dari `apps-script/Kode.gs` apa adanya. Bila balasannya memuat kode lain, itu temuan yang harus dicatat — **jangan** disesuaikan supaya cocok.

### D1 — Penilai mengirim permintaan ubah skema

- **Akun:** akun kedua (terdaftar sebagai `penilai` pada `UJI-JALAN`)
- **Badan:** `{"aksi":"ubahSkema","sesiId":"UJI-JALAN","muatan":{"email":"<email pemilik>","oleh":"<email pemilik>","peran":"admin"}}`
- **Diharapkan:** `ok:false`, `kode:"BUKAN_ADMIN"`

Medan `email`, `oleh`, dan `peran` di dalam muatan sengaja mengaku sebagai admin. Balasan `BUKAN_ADMIN` membuktikan Batasan Global 15 berlaku pada sistem terpasang: identitas hanya berasal dari server, dan apa pun yang dikirim frontend diabaikan. Balasan `AKSI_BELUM_DIBANGUN` di sini berarti muatan **berhasil** menaikkan peran — **kegagalan keamanan yang harus segera dilaporkan.**

### D2 — Penilai mengirim permintaan ubah bobot

- **Akun:** akun kedua
- **Badan:** `{"aksi":"ubahBobot","sesiId":"UJI-JALAN","muatan":{}}`
- **Diharapkan:** `ok:false`, `kode:"BUKAN_ADMIN"`

### D3 — Penulisan ke sesi berstatus final

- **Akun:** **pemilik**, yaitu `admin` pada sesi itu. Menguji dengan penilai tidak membuktikan apa pun: ia akan ditolak karena perannya, bukan karena sesinya final.
- **Badan:** `{"aksi":"simpanPenilaian","sesiId":"UJI-FINAL","muatan":{"respondenId":"0a1b2c3d4e5f6071","kriteria":"q1","nilai":4}}`
- **Diharapkan:** `ok:false`, `kode:"SESI_FINAL"`
- **Sesudahnya:** buka sheet `Penilaian` dan pastikan **tidak ada baris baru**. Balasan penolakan yang disertai baris yang terlanjur mendarat adalah kegagalan, bukan kelulusan.

Ulangi sekali lagi dengan `{"aksi":"finalkanSesi","sesiId":"UJI-FINAL","muatan":{}}` dari akun pemilik; diharapkan `SESI_FINAL` juga. Finalisasi kedua sengaja ditolak, bukan dijawab sukses.

### D4 — Email di luar daftar mengakses Web App

- **Akun:** akun kedua (**tidak** terdaftar pada `UJI-LUAR`)
- **Badan:** `{"aksi":"bacaRekap","sesiId":"UJI-LUAR","muatan":{}}`
- **Diharapkan:** `ok:false`, `kode:"ORANG_TIDAK_DIKENAL"`

Ini sonde A1 yang sama, dicatat ulang sebagai uji §11.3. Bila balasannya `TANPA_IDENTITAS`, uji ini **belum lulus**: yang terbukti bukan "orang di luar daftar ditolak", melainkan "tidak ada seorang pun yang dikenali". Bedanya menentukan, dan keduanya tidak boleh dicatat sebagai hal yang sama.

---

## 7. Tiga hal yang hanya bisa dibuktikan di Google

Ketiganya **dicatat selama pelaksanaan**, bukan disimpulkan sesudahnya.

### E1 — Apakah teks berawalan `+`, `-`, dan `@` dievaluasi Sheets sebagai rumus

Yang sudah pasti: teks berawalan `=` menjadi rumus. Yang **belum** diketahui: apakah `+`, `-`, dan `@` diperlakukan sama oleh `appendRow`, sebagaimana Sheets memperlakukannya saat manusia mengetiknya.

Perlindungannya sudah terpasang — `selTeks_` menambahkan apostrof di depan setiap sel teks — jadi yang diukur di sini ada dua, dan keduanya tentang **apakah perlindungan itu bekerja**, bukan apakah ia perlu dipasang.

**Langkah (tidak merusak apa pun):** dari akun kedua, kirim empat `simpanPenilaian` ke `UJI-JALAN`, masing-masing dengan `kriteria` berbeda dan `catatan` berisi salah satu dari `=1+1`, `+1`, `-1`, `@SUM(A1)`. Lalu:

1. Buka sheet `Penilaian` dan lihat kolom `catatan` keempat baris itu. **Yang terlihat harus teks apa adanya**, bukan angka `2`, bukan `#NAME?`, bukan sel kosong.
2. Klik satu selnya dan lihat bilah rumus. Apostrofnya boleh terlihat di sana; yang tidak boleh adalah tanda `=` di awal.
3. Catat apakah `getValues()` mengembalikan teks aslinya **tanpa** apostrof. Ini klaim yang ditulis di komentar `selTeks_` dan baru dimodelkan oleh Google palsu — belum pernah diperiksa terhadap Sheets sungguhan.

Pertanyaan turunan "apakah perlindungan itu memang perlu untuk `+`, `-`, dan `@`" hanya terjawab dengan mencabut apostrofnya. Itu **perubahan kode** dan hanya boleh dicoba pada **salinan** Spreadsheet beserta salinan skripnya, tidak pernah pada yang dipakai.

### E2 — Apakah `SpreadsheetApp.flush()` benar-benar diperlukan sebelum `releaseLock`

Alasan pemasangannya: Apps Script menunda penulisan sampai eksekusi selesai, sehingga baris yang baru di-`appendRow` bisa belum terlihat saat kunci dilepas. Eksekusi berikutnya lalu membaca kisi tanpa baris itu dan memberi `penilaian_id` yang **kembar** — tepat kegagalan yang kuncinya ada untuk mencegah. Nomor kembar merusak koreksi **C2**: urutan "baris terakhir yang berlaku" ditentukan `penilaian_id`, dan dua baris bernomor sama membuat "yang terakhir" tidak tertentu.

**Langkah:** dua orang, dua perangkat, dua akun, mengirim `simpanPenilaian` ke `UJI-JALAN` **sedekat mungkin secara waktu** (hitung mundur bersama). Ulangi lima kali. Lalu periksa kolom `penilaian_id`:

- jumlah baris bertambah persis sepuluh;
- tidak ada satu pun nomor yang muncul dua kali;
- tidak ada nomor yang terlewat.

Ini sekaligus bukti lapangan untuk **§13 butir 4** (dua penilai dari perangkat berbeda tanpa data hilang).

Yang **tidak** dibuktikan langkah ini: bahwa `flush()` yang membuatnya berhasil. Untuk itu `flush()` harus dicabut dan percobaan diulang — sekali lagi, hanya pada **salinan**. Bila percobaan salinan tidak dijalankan, catat E2 sebagai **"perilaku dengan `flush` terbukti baik; keperluan `flush` belum diuji"**, bukan sebagai lulus penuh.

### E3 — Apakah permintaan lintas situs dapat membawa kuki Google ke `/exec`

Hasilnya bergantung pada keputusan **C3** (jalan A: UI disajikan dari Apps Script; jalan B: UI di Vercel dengan Google Identity Services), dan pertanyaannya berbeda pada tiap jalan:

- **Jalan A** — pertanyaannya: dapatkah halaman milik pihak ketiga membuat peramban korban mengirim POST ke `/exec` **dengan kuki Google korban ikut terbawa**, sehingga penilaian tertulis atas namanya tanpa ia sadari?
- **Jalan B** — `getActiveUser()` tidak dipakai sama sekali, identitas berasal dari ID token di badan permintaan. Kuki menjadi tidak relevan, tetapi verifikasi token menjadi permukaan serang baru yang protokol ini **belum** mencakupnya.

**Langkah untuk jalan A**, dijalankan dari peramban yang sedang masuk sebagai akun kedua:

1. Buka halaman pada **asal yang berbeda** — berkas `file://` lokal sudah cukup, dan justru lebih mendekati kasus nyata.
2. Di konsol, kirim:

   ```js
   fetch('https://script.google.com/macros/s/XXXXX/exec', {
     method: 'POST',
     mode: 'no-cors',
     credentials: 'include',
     headers: { 'Content-Type': 'text/plain' },
     body: JSON.stringify({ aksi: 'simpanPenilaian', sesiId: 'UJI-JALAN',
       muatan: { respondenId: '0a1b2c3d4e5f6071', kriteria: 'csrf-e3', nilai: 1 } }),
   });
   ```

3. **Balasannya sengaja tidak bisa dibaca** (`no-cors` menghasilkan respons buram). Itu bukan hasilnya. **Hasilnya ada di sheet `Penilaian`:** bila muncul baris ber-`kriteria` `csrf-e3`, permintaan lintas situs **berhasil menulis** — temuan CSRF yang harus dilaporkan sebelum sistem dipakai. Bila tidak ada baris, catat juga galat yang muncul di konsol apa adanya.

`Content-Type: text/plain` dipakai dengan sengaja: itulah tipe yang tidak memicu permintaan preflight, sehingga inilah bentuk serangan yang paling mungkin berhasil. Menguji dengan `application/json` dapat menghasilkan "gagal" yang menenangkan tetapi tidak membuktikan apa-apa.

Baris `csrf-e3` yang terlanjur tertulis **tidak dapat dihapus lewat backend** (append-only). Inilah alasan §1 menuntut Spreadsheet khusus uji.

---

## 8. Tabel bukti

Diisi **saat menjalankan**, bukan sesudahnya. Kolom "Balasan apa adanya" disalin utuh dari log atau layar — tanpa diringkas, tanpa diterjemahkan, tanpa dirapikan. Balasan yang sudah dirapikan tidak bisa lagi dipakai membedakan `TANPA_IDENTITAS` dari `ORANG_TIDAK_DIKENAL`, dan justru itu yang paling menentukan di sini.

| Kode | Tanggal | Akun yang menjalankan | Langkah | Balasan apa adanya | Lulus / Gagal |
| --- | --- | --- | --- | --- | --- |
| A1 | | | Sonde identitas akun kedua | | |
| A2 | | | Sonde tanpa `Authorization` | | |
| A3 | | | Sonde identitas pemilik | | |
| B1 | | | Daftar "Orang yang memiliki akses" | | |
| B2 | | | Setelan "Akses umum" | | |
| B3 | | | Publikasikan ke web | | |
| B4 | | | Berbagi proyek Apps Script | | |
| C1 | | | Kontrol positif baca | | |
| C2 | | | Kontrol positif tulis | | |
| D1 | | | §11.3 — penilai ubah skema | | |
| D2 | | | §11.3 — penilai ubah bobot | | |
| D3 | | | §11.3 — tulis ke sesi final | | |
| D4 | | | §11.3 — email di luar daftar | | |
| E1 | | | Awalan `=`, `+`, `-`, `@` | | |
| E2 | | | `penilaian_id` pada tulis bersamaan | | |
| E3 | | | Permintaan lintas situs | | |

**Setelan deployment yang berlaku saat tabel ini diisi** — wajib dicatat, karena tanpanya seluruh baris di atas kehilangan artinya:

- Jalankan sebagai: ______________________
- Siapa yang punya akses: ______________________
- Email yang dikembalikan `getActiveUser()` menurut A1: ______________________
- Domain Google Workspace (bila ada): ______________________

---

## 9. Setelah protokol dijalankan

1. **Laporkan tabel §8 ke pengguna** beserta empat isian setelan deployment. Itulah bahan untuk memutuskan **C4**; jangan diputuskan oleh pelaksana protokol.
2. **Baru setelah A1–A3, B1–B4, C1–C2, dan D1–D4 seluruhnya lulus**, §13 butir 3 boleh diubah dari "terbukti untuk kebijakannya" menjadi terbukti untuk sistem terpasangnya. Satu baris gagal berarti belum.
3. **E1–E3 dilaporkan apa adanya**, termasuk yang berstatus belum diuji. Bagian yang menunggu percobaan pada salinan tetap ditulis menunggu, bukan dibiarkan kosong — kolom kosong terbaca sebagai lulus oleh pembaca berikutnya.
