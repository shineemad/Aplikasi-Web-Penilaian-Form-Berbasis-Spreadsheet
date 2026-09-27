# Instruksi Agen — FormScoring Engine

Spesifikasi lengkap: [docs/superpowers/specs/2026-09-27-formscoring-engine-design.md](../docs/superpowers/specs/2026-09-27-formscoring-engine-design.md). **Baca dulu sebelum menulis kode.** Bila permintaan pengguna bertentangan dengan spec, sebutkan pertentangannya — jangan diam-diam memilih salah satu.

## Bahasa

- **Istilah domain memakai Bahasa Indonesia** dan tidak diterjemahkan: `Proyek`, `Sesi`, `Responden`, `Skema`, `Penilaian`, `nilai`, `bobot`, `selisih`, `dimensi`, `peringkat`, `indeks`. Ini bahasa yang dipakai pengguna sistem, jadi dipakai juga di kode, nama berkas, dan nama kolom sheet.
- Kata teknis umum tetap Inggris: `parse`, `render`, `hash`, `merge`, `fetch`.
- Teks antarmuka, pesan error, komentar, dan pesan commit: Bahasa Indonesia.

## Tujuh aturan yang tidak boleh dilanggar

Ketujuhnya lahir dari kejanggalan nyata pada data yang akan diolah. Melanggarnya menghasilkan angka yang tampak wajar padahal salah — kegagalan paling berbahaya pada aplikasi penilaian.

### 1. Inti perhitungan wajib murni

Berkas di `src/core/` **dilarang** mengimpor React, API browser, `google.script`, jaringan, tanggal sekarang, atau angka acak. Semua data masuk lewat argumen.

Alasannya bukan kerapian: seluruh klaim "akurat 100%" bersandar pada kemampuan menguji berkas-berkas ini tanpa browser dan tanpa Google. Begitu satu `import` dari luar masuk, klaim itu gugur.

### 2. Kosong bukan nol

`null` dan `0` adalah dua hal berbeda. **Jangan pernah menulis `?? 0` atau `|| 0`** pada jawaban, skor, atau nilai gabungan.

Responden yang tidak menjawab bukan responden yang menjawab salah. Peserta yang tidak hadir di Pre-Test bukan peserta yang nilainya nol.

### 3. Berisik saat ragu

Opsi yang tidak ada di peta skala → kembalikan **peringatan**, bukan angka. Jangan pernah menebak. Skema tidak boleh bisa disimpan selama masih ada kolom yang belum diputuskan admin.

### 4. Normalisasi sebelum mencocokkan

Urutannya: buang spasi tepi → rapatkan spasi ganda → huruf kecil. Berlaku untuk pencocokan opsi, kunci jawaban, **dan email sebelum di-hash**.

Data nyata memuat `"Strongly Agree"` dan `"Strongly agree"` dalam satu instrumen. Tanpa langkah ini, dua butir menghasilkan nilai kosong tanpa ada yang sadar.

### 5. Peran ditegakkan di server

Setiap endpoint tulis di Apps Script memeriksa `Session.getActiveUser().getEmail()` terhadap daftar pada sheet `Sesi`, tanpa memedulikan apa yang dikirim frontend.

Menyembunyikan tombol bukan keamanan. Uji keamanan harus memanggil endpoint langsung; memeriksa tombolnya tersembunyi tidak membuktikan apa pun.

### 6. `Penilaian` bersifat append-only

Tidak ada operasi ubah atau hapus baris. Nilai baru menambah baris; yang berlaku adalah baris terakhir untuk pasangan (`sesi_id`, `responden_id`, `kriteria`).

### 7. Jangan mengaku tersimpan sebelum server membenarkan

Input ditahan di penyimpanan lokal, statusnya "belum tersimpan" sampai ada balasan sukses dari Apps Script. Kegagalan simpan yang diam adalah cara paling umum data penilaian hilang.

## Struktur berkas

```
src/
  core/              # MURNI — tanpa ketergantungan apa pun
    normalisasi.ts   # trim, rapatkan spasi, lowercase, hash email
    scorer.ts        # jawaban + aturan -> angka | null | peringatan
    aggregator.ts    # skor -> nilai per responden, indeks per dimensi
    merger.ts        # beberapa sesi -> tabel gabungan melebar
    tipe.ts
  io/
    importer.ts      # SheetJS + fetch published CSV
    store.ts         # satu-satunya tempat memanggil Apps Script
    eksporExcel.ts
    eksporPdf.ts
  ui/
apps-script/
  Kode.gs            # backend; seluruh pemeriksaan peran ada di sini
```

Aturan ketergantungan: `ui` boleh memanggil `io` dan `core`; `io` boleh memanggil `core`; **`core` tidak memanggil siapa pun.**

## Cara bekerja

- **Tulis uji lebih dulu** untuk semua yang ada di `src/core/`. Di situlah letak kebenaran perhitungan.
- Berkas uji wajib memakai kejanggalan dari data nyata, bukan contoh yang rapi: `"Strongly Agree"` berhuruf besar, opsi Yes/No/Maybe pada skema Likert, nama kosong, email kembar, email beda huruf besar-kecil antar sesi, dan peserta yang hanya ikut satu dari dua tes.
- Uji ekspor PDF pada 500 baris dan minimal tiga sesi sejak awal, bukan menjelang akhir. Tabel lebar dan tabel panjang adalah dua masalah berbeda.

```powershell
npm run dev        # jalankan lokal
npm test           # Vitest
npm run typecheck  # wajib bersih sebelum commit
npm run build
```

## Anti-pola yang sudah terbukti menggigit proyek ini

| Jangan | Karena |
| --- | --- |
| `nilai ?? 0` | Menyamakan "tidak menjawab" dengan "menjawab nol" |
| Mencocokkan opsi tanpa normalisasi | Dua butir pada instrumen nyata langsung gagal diam-diam |
| Memakai nama sebagai kunci responden | Kolom Name opsional; banyak baris tidak punya nama |
| Membagikan Spreadsheet Ruang Kerja ke penilai | Seluruh pengaturan peran jadi hiasan |
| Penyebut indeks $n_r \times n_k$ | Salah begitu ada data tidak lengkap; pakai jumlah pasangan yang benar-benar dihitung |
| Rata-rata selisih dari semua orang | Peserta yang hanya ikut satu tes membuat angka peningkatan menyesatkan; hanya yang berstatus `lengkap` |
| Membuang baris yang tidak lengkap | Spec menuntut baris ditandai, bukan dihilangkan |
| Mengirim jawaban responden ke layanan AI | Melanggar informed consent yang sudah dijanjikan ke peserta |

## Sebelum menyatakan selesai

Jalankan perintahnya, lihat keluarannya, baru mengaku beres. Klaim tanpa bukti tidak diterima.

- [ ] `npm test` lulus — tempelkan ringkasan hasilnya
- [ ] `npm run typecheck` bersih
- [ ] Tidak ada `import` dari luar `core` di dalam `src/core/`
- [ ] Tidak ada `?? 0` atau `|| 0` pada jalur nilai
- [ ] Uji keamanan memanggil endpoint langsung, bukan memeriksa tampilan
