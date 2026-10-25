import { describe, expect, it } from 'vitest';
import type { RespondenSesi } from '../core/sesi';
import type { Aturan, Skema } from '../core/tipe';
import {
  bacaPenilaian,
  bacaProyek,
  bacaResponden,
  bacaSesi,
  bacaSkema,
  tulisParameter,
} from './adaptorSheet';

// Kepala kolom disalin dari KEPALA_RUANG_KERJA di apps-script/Kode.gs, bukan
// dari ingatan: satu nama yang salah eja membuat adaptor membaca kolom yang
// keliru dan kegagalannya diam.
const KEPALA_PENILAIAN = [
  'penilaian_id',
  'sesi_id',
  'responden_id',
  'kriteria',
  'nilai',
  'catatan',
  'oleh',
  'pada',
];
const KEPALA_SESI = [
  'sesi_id',
  'proyek_id',
  'nama',
  'skema_id',
  'mode',
  'status',
  'penilai',
  'admin',
];
const KEPALA_RESPONDEN = ['sesi_id', 'id', 'email', 'nama', 'status_kelengkapan', 'diimpor_pada'];
const KEPALA_SKEMA = [
  'skema_id',
  'kolom_asal',
  'label',
  'dimensi',
  'aturan',
  'parameter',
  'skor_maks',
  'bobot',
  'perlakuan_kosong',
];
const KEPALA_PROYEK = ['proyek_id', 'nama', 'sesi_urut', 'sesi_awal', 'sesi_akhir', 'dibuat_pada'];

describe('bacaPenilaian', () => {
  it('menerjemahkan kepala snake_case menjadi medan camelCase', () => {
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [1, 'pre', 'a1b2c3d4e5f60718', 'Esai', 80, 'rapi', 'guru@sekolah.id', '2026-10-01T00:00:00Z'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris).toEqual([
      {
        penilaianId: 1,
        sesiId: 'pre',
        respondenId: 'a1b2c3d4e5f60718',
        kriteria: 'Esai',
        nilai: 80,
        catatan: 'rapi',
        oleh: 'guru@sekolah.id',
        pada: '2026-10-01T00:00:00Z',
      },
    ]);
  });

  it('menerjemahkan sel kosong menjadi null, bukan string kosong', () => {
    // Batasan Global 3. Baris catatan-saja punya sel nilai '' di Sheets.
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [1, 'pre', 'r1', 'Esai', '', 'perlu diperiksa', 'guru@sekolah.id', '2026-10-01'],
    ]);

    expect(hasil.baris[0]?.nilai).toBeNull();
    expect(hasil.baris[0]?.nilai).not.toBe('');
  });

  it('membedakan nilai nol dari nilai kosong', () => {
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [1, 'pre', 'r1', 'Esai', 0, '', 'guru@sekolah.id', '2026-10-01'],
    ]);

    expect(hasil.baris[0]?.nilai).toBe(0);
    expect(hasil.baris[0]?.catatan).toBeNull();
  });

  it('menerima penilaian_id dan nilai bertipe teks maupun angka', () => {
    // Kolom yang diformat teks oleh admin mengembalikan '5', bukan 5.
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [5, 'pre', 'r1', 'Esai', 80, '', 'guru@sekolah.id', '2026-10-01'],
      ['6', 'pre', 'r2', 'Esai', '75', '', 'guru@sekolah.id', '2026-10-01'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris.map((satu) => satu.penilaianId)).toEqual([5, 6]);
    expect(hasil.baris.map((satu) => satu.nilai)).toEqual([80, 75]);
  });

  it('menandai baris yang penilaian_id-nya tidak bisa dibaca, tidak membuangnya', () => {
    // Batasan Global 24. Nomor barisnya ikut dilaporkan agar admin bisa membukanya.
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [1, 'pre', 'r1', 'Esai', 80, '', 'guru@sekolah.id', '2026-10-01'],
      ['satu', 'pre', 'r2', 'Esai', 75, '', 'guru@sekolah.id', '2026-10-01'],
    ]);

    expect(hasil.baris).toHaveLength(1);
    expect(hasil.masalah).toHaveLength(1);
    expect(hasil.masalah[0]?.nomorBaris).toBe(3);
    expect(hasil.masalah[0]?.jenis).toBe('baris');
    expect(hasil.masalah[0]?.pesan).toMatch(/penilaian_id/);
  });

  it('menandai baris yang nilainya bukan angka, bukan menganggapnya kosong', () => {
    // Menganggapnya kosong membuat nilai yang salah ketik hilang tanpa jejak.
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [1, 'pre', 'r1', 'Esai', 'tinggi', '', 'guru@sekolah.id', '2026-10-01'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.nomorBaris).toBe(2);
    expect(hasil.masalah[0]?.pesan).toMatch(/nilai/);
  });

  it('menandai baris yang kolom wajibnya kosong', () => {
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [1, 'pre', '', 'Esai', 80, '', 'guru@sekolah.id', '2026-10-01'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/responden_id/);
  });

  it('menolak sheet yang kepalanya kurang satu kolom wajib', () => {
    const kepala = KEPALA_PENILAIAN.filter((nama) => nama !== 'oleh');
    const hasil = bacaPenilaian([kepala, [1, 'pre', 'r1', 'Esai', 80, '', '2026-10-01']]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah).toHaveLength(1);
    expect(hasil.masalah[0]?.nomorBaris).toBe(1);
    expect(hasil.masalah[0]?.jenis).toBe('kepala');
    expect(hasil.masalah[0]?.pesan).toMatch(/oleh/);
  });

  it('menolak sheet yang punya dua kolom bernama sama', () => {
    // Admin melihat satu kolom sementara adaptor membaca kolom lainnya.
    const hasil = bacaPenilaian([
      [...KEPALA_PENILAIAN, 'nilai'],
      [1, 'pre', 'r1', 'Esai', 80, '', 'guru@sekolah.id', '2026-10-01', 90],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.jenis).toBe('kepala');
    expect(hasil.masalah[0]?.pesan).toMatch(/nilai/);
  });

  it('tidak bergantung pada urutan kolom', () => {
    const terbalik = bacaPenilaian([
      ['pada', 'oleh', 'catatan', 'nilai', 'kriteria', 'responden_id', 'sesi_id', 'penilaian_id'],
      ['2026-10-01', 'guru@sekolah.id', 'rapi', 80, 'Esai', 'r1', 'pre', 1],
    ]);
    const urut = bacaPenilaian([
      KEPALA_PENILAIAN,
      [1, 'pre', 'r1', 'Esai', 80, 'rapi', 'guru@sekolah.id', '2026-10-01'],
    ]);

    expect(terbalik.masalah).toEqual([]);
    expect(terbalik.baris).toEqual(urut.baris);
  });

  it('mengabaikan baris yang seluruh selnya kosong', () => {
    // Baris sisa di bawah tabel; Sheets mengembalikannya sebagai sel ''.
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [1, 'pre', 'r1', 'Esai', 80, '', 'guru@sekolah.id', '2026-10-01'],
      ['', '', '', '', '', '', '', ''],
      [],
    ]);

    expect(hasil.baris).toHaveLength(1);
    expect(hasil.masalah).toEqual([]);
  });

  it('menerima kepala berspasi tepi dan beda huruf besar-kecil', () => {
    const hasil = bacaPenilaian([
      [' Penilaian_ID ', 'SESI_ID', 'responden_id', 'Kriteria', 'NILAI', 'catatan', 'Oleh', 'pada'],
      [1, 'pre', 'r1', 'Esai', 80, '', 'guru@sekolah.id', '2026-10-01'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.penilaianId).toBe(1);
  });

  it('memperlakukan sel yang tidak ada sebagai kosong', () => {
    // Baris yang lebih pendek daripada kepala mengembalikan undefined.
    const hasil = bacaPenilaian([
      ['penilaian_id', 'sesi_id', 'responden_id', 'kriteria', 'nilai', 'oleh', 'pada', 'catatan'],
      [1, 'pre', 'r1', 'Esai', 80, 'guru@sekolah.id', '2026-10-01'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.catatan).toBeNull();
  });

  it('memangkas spasi tepi tanpa merapatkan spasi ganda pada kriteria', () => {
    // `kolom_asal` dari importer hanya dipangkas spasi tepinya, dan Kode.gs
    // menulis `kriteria` dengan trim() saja karena alasan yang sama.
    // Merapatkan di sini membuat kriteria tidak pernah cocok lagi.
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [1, ' pre ', ' r1 ', ' Q1  Saya puas ', 80, ' rapi ', ' GURU@sekolah.id ', '2026-10-01'],
    ]);

    expect(hasil.baris[0]?.kriteria).toBe('Q1  Saya puas');
    expect(hasil.baris[0]?.respondenId).toBe('r1');
    expect(hasil.baris[0]?.sesiId).toBe('pre');
    expect(hasil.baris[0]?.catatan).toBe('rapi');
  });

  it('menormalkan email penilai, karena aturan 5 berlaku untuk email', () => {
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [1, 'pre', 'r1', 'Esai', 80, '', ' GURU@Sekolah.id ', '2026-10-01'],
    ]);

    expect(hasil.baris[0]?.oleh).toBe('guru@sekolah.id');
  });

  it('menerima cap waktu bertipe Date dari sel berformat tanggal', () => {
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [1, 'pre', 'r1', 'Esai', 80, '', 'guru@sekolah.id', new Date('2026-10-01T03:04:05.000Z')],
    ]);

    expect(hasil.baris[0]?.pada).toBe('2026-10-01T03:04:05.000Z');
  });

  it('menerima sheet yang baru berisi kepala sebagai daftar kosong, bukan masalah', () => {
    const hasil = bacaPenilaian([KEPALA_PENILAIAN]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah).toEqual([]);
  });

  it('menolak sheet kosong dengan pesan yang menyuruh menyiapkan ruang kerja', () => {
    // getDataRange() pada sheet kosong mengembalikan [['']], bukan [].
    const hasil = bacaPenilaian([['']]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah).toHaveLength(1);
    expect(hasil.masalah[0]?.jenis).toBe('kepala');
    expect(hasil.masalah[0]?.pesan).toMatch(/penyiapan ruang kerja/i);
  });

  it('menandai baris tanpa oleh, karena koreksi tanpa penanggung jawab mematikan jejak audit', () => {
    // Batasan Global 15. Tanpa uji ini, membuang pemeriksaannya tetap hijau.
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [1, 'pre', 'r1', 'Esai', 80, '', '', '2026-10-01'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah).toHaveLength(1);
    expect(hasil.masalah[0]?.nomorBaris).toBe(2);
    expect(hasil.masalah[0]?.pesan).toMatch(/oleh/);
  });

  it('menandai baris tanpa sesi_id, yang tidak dimiliki sesi mana pun', () => {
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [1, '', 'r1', 'Esai', 80, '', 'guru@sekolah.id', '2026-10-01'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/sesi_id/);
  });

  it('menandai baris tanpa kriteria, yang tidak menunjuk butir mana pun', () => {
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [1, 'pre', 'r1', '', 80, '', 'guru@sekolah.id', '2026-10-01'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/kriteria/);
  });

  it('menandai penilaian_id yang kosong, karena kosong bukan nomor urut', () => {
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      ['', 'pre', 'r1', 'Esai', 80, '', 'guru@sekolah.id', '2026-10-01'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/penilaian_id/);
  });

  it('membaca nilai yang ditulis sebagai teks "0" sebagai angka nol, bukan kosong', () => {
    // Kolom berformat teks mengembalikan '0'. Memperlakukannya sebagai kosong
    // menghapus nilai nol yang memang diberikan penilai.
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      ['1', 'pre', 'r1', 'Esai', '0', '', 'guru@sekolah.id', '2026-10-01'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.nilai).toBe(0);
    expect(hasil.baris[0]?.nilai).not.toBeNull();
  });

  it('menolak Infinity dan 0x10 sebagai nilai, karena Sheets pun bukan Number()', () => {
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [1, 'pre', 'r1', 'Esai', 'Infinity', '', 'guru@sekolah.id', '2026-10-01'],
      [2, 'pre', 'r1', 'Esai', '0x10', '', 'guru@sekolah.id', '2026-10-01'],
      [3, 'pre', 'r1', 'Esai', Number.POSITIVE_INFINITY, '', 'guru@sekolah.id', '2026-10-01'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah.map((satu) => satu.nomorBaris)).toEqual([2, 3, 4]);
  });

  it('menandai penilaian_id kembar dan menyebut baris pasangannya', () => {
    // C2 mengurutkan nilai berlaku menurut penilaian_id. Dua baris bernomor
    // sama membuat yang menang ditentukan urutan baris, bukan oleh siapa pun.
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [7, 'pre', 'r1', 'Esai', 80, '', 'guru@sekolah.id', '2026-10-01'],
      [8, 'pre', 'r1', 'Esai', 85, '', 'guru@sekolah.id', '2026-10-02'],
      [7, 'pre', 'r1', 'Esai', 90, '', 'guru@sekolah.id', '2026-10-03'],
    ]);

    expect(hasil.baris.map((satu) => satu.penilaianId)).toEqual([8]);
    expect(hasil.masalah.map((satu) => satu.nomorBaris)).toEqual([2, 4]);
    expect(hasil.masalah[0]?.jenis).toBe('baris');
    expect(hasil.masalah[0]?.pesan).toMatch(/baris 4/);
    expect(hasil.masalah[1]?.pesan).toMatch(/baris 2/);
  });

  it('menganggap penilaian_id bertipe teks dan angka sebagai nomor yang sama', () => {
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [7, 'pre', 'r1', 'Esai', 80, '', 'guru@sekolah.id', '2026-10-01'],
      ['7', 'pre', 'r1', 'Esai', 90, '', 'guru@sekolah.id', '2026-10-02'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah).toHaveLength(2);
  });

  it('menandai responden_id yang sudah dipaksa Sheets menjadi angka', () => {
    // Hash 16 heksadesimal selalu teks. Sel yang kembali sebagai angka berarti
    // nol di depannya sudah hilang dan digit belakangnya sudah dibulatkan.
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [1, 'pre', 9999999999999999, 'Esai', 80, '', 'guru@sekolah.id', '2026-10-01'],
      [2, 'pre', Number.POSITIVE_INFINITY, 'Esai', 80, '', 'guru@sekolah.id', '2026-10-01'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah).toHaveLength(2);
    expect(hasil.masalah[0]?.pesan).toMatch(/responden_id/);
    expect(hasil.masalah[0]?.pesan).toMatch(/apostrof/);
    expect(hasil.masalah[1]?.pesan).toMatch(/Infinity/);
  });

  it('tidak mengeluhkan responden_id berupa hash yang benar-benar teks', () => {
    const hasil = bacaPenilaian([
      KEPALA_PENILAIAN,
      [1, 'pre', '0012345678901234', 'Esai', 80, '', 'guru@sekolah.id', '2026-10-01'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.respondenId).toBe('0012345678901234');
  });
});

describe('bacaSesi', () => {
  it('memecah daftar penilai dan admin seperti yang dilakukan server', () => {
    const hasil = bacaSesi([
      KEPALA_SESI,
      ['pre', 'p1', 'Pre-Test', 's1', 'indeks', 'berjalan', 'A@x.id, b@x.id;\nc@x.id', 'ADM@x.id'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.penilai).toEqual(['a@x.id', 'b@x.id', 'c@x.id']);
    expect(hasil.baris[0]?.admin).toEqual(['adm@x.id']);
  });

  it('menerima sel penilai yang kosong sebagai daftar kosong, bukan masalah', () => {
    // Sesi draft yang penilainya belum ditetapkan adalah keadaan yang sah.
    const hasil = bacaSesi([
      KEPALA_SESI,
      ['pre', 'p1', 'Pre-Test', 's1', 'indeks', 'draft', '', ' , ; '],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.penilai).toEqual([]);
    expect(hasil.baris[0]?.admin).toEqual([]);
  });

  it('menerima status dan mode beda huruf besar-kecil', () => {
    const hasil = bacaSesi([
      KEPALA_SESI,
      ['pre', 'p1', 'Pre-Test', 's1', ' Indeks ', ' FINAL ', 'a@x.id', 'b@x.id'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.status).toBe('final');
    expect(hasil.baris[0]?.mode).toBe('indeks');
  });

  it('menandai status di luar ketiga yang sah, tidak menebaknya', () => {
    const hasil = bacaSesi([
      KEPALA_SESI,
      ['pre', 'p1', 'Pre-Test', 's1', 'indeks', 'selesai', 'a@x.id', 'b@x.id'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.nomorBaris).toBe(2);
    expect(hasil.masalah[0]?.pesan).toMatch(/draft/);
    expect(hasil.masalah[0]?.pesan).toMatch(/berjalan/);
    expect(hasil.masalah[0]?.pesan).toMatch(/final/);
  });

  it('menandai mode di luar kedua yang sah', () => {
    const hasil = bacaSesi([
      KEPALA_SESI,
      ['pre', 'p1', 'Pre-Test', 's1', 'rata-rata', 'berjalan', 'a@x.id', 'b@x.id'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/peringkat/);
    expect(hasil.masalah[0]?.pesan).toMatch(/indeks/);
  });

  it('tidak memaksa sesi_id menjadi huruf kecil', () => {
    // Kepekaan huruf pada sesi_id belum diputuskan; memaksanya di sini
    // memutuskannya diam-diam. Server pun hanya merapikan spasinya.
    const hasil = bacaSesi([
      KEPALA_SESI,
      [' Pre-Test ', 'P1', 'Pre-Test', 'S1', 'indeks', 'berjalan', 'a@x.id', 'b@x.id'],
    ]);

    expect(hasil.baris[0]?.sesiId).toBe('Pre-Test');
    expect(hasil.baris[0]?.proyekId).toBe('P1');
    expect(hasil.baris[0]?.skemaId).toBe('S1');
  });

  it('menerima nama sesi yang kosong tanpa membuang barisnya', () => {
    // Label kosong tidak pernah menghasilkan angka yang salah; membuang
    // sesinya karena itu justru menghilangkan seluruh nilainya dari rekap.
    const hasil = bacaSesi([
      KEPALA_SESI,
      ['pre', 'p1', '', 's1', 'indeks', 'berjalan', 'a@x.id', 'b@x.id'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.nama).toBe('');
  });

  it('menandai baris yang proyek_id atau skema_id-nya kosong', () => {
    const hasil = bacaSesi([
      KEPALA_SESI,
      ['pre', '', 'Pre-Test', 's1', 'indeks', 'berjalan', 'a@x.id', 'b@x.id'],
      ['post', 'p1', 'Post-Test', '', 'indeks', 'berjalan', 'a@x.id', 'b@x.id'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah.map((satu) => satu.nomorBaris)).toEqual([2, 3]);
    expect(hasil.masalah[0]?.pesan).toMatch(/proyek_id/);
    expect(hasil.masalah[1]?.pesan).toMatch(/skema_id/);
  });

  it('tidak bergantung pada urutan kolom', () => {
    const terbalik = bacaSesi([
      ['admin', 'penilai', 'status', 'mode', 'skema_id', 'nama', 'proyek_id', 'sesi_id'],
      ['b@x.id', 'a@x.id', 'berjalan', 'indeks', 's1', 'Pre-Test', 'p1', 'pre'],
    ]);
    const urut = bacaSesi([
      KEPALA_SESI,
      ['pre', 'p1', 'Pre-Test', 's1', 'indeks', 'berjalan', 'a@x.id', 'b@x.id'],
    ]);

    expect(terbalik.baris).toEqual(urut.baris);
  });

  it('menandai sesi_id kembar, seperti cariSesi_ di Kode.gs menyebutnya SESI_CACAT', () => {
    // Satu final dan satu berjalan: memilih salah satunya menentukan apakah
    // sesi itu masih boleh ditulisi, dan pilihannya hanya urutan baris.
    const hasil = bacaSesi([
      KEPALA_SESI,
      ['pre', 'p1', 'Pre-Test', 's1', 'indeks', 'final', 'a@x.id', 'b@x.id'],
      ['pre', 'p1', 'Pre-Test', 's1', 'indeks', 'berjalan', 'a@x.id', 'b@x.id'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah.map((satu) => satu.nomorBaris)).toEqual([2, 3]);
    expect(hasil.masalah[0]?.jenis).toBe('baris');
    expect(hasil.masalah[0]?.pesan).toMatch(/sesi_id/);
    expect(hasil.masalah[0]?.pesan).toMatch(/baris 3/);
  });

  it('tidak menganggap sesi_id beda huruf besar-kecil sebagai kembar', () => {
    // Kepekaan hurufnya belum diputuskan (Tugas 5 Langkah 3); menyeragamkannya
    // di pendeteksi kembar berarti memutuskannya diam-diam.
    const hasil = bacaSesi([
      KEPALA_SESI,
      ['pre', 'p1', 'Pre-Test', 's1', 'indeks', 'berjalan', 'a@x.id', 'b@x.id'],
      ['PRE', 'p1', 'Pre-Test', 's1', 'indeks', 'berjalan', 'a@x.id', 'b@x.id'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris.map((satu) => satu.sesiId)).toEqual(['pre', 'PRE']);
  });
});

describe('bacaProyek', () => {
  it('memecah sesi_urut menjadi larik dan mempertahankan urutannya', () => {
    const hasil = bacaProyek([
      KEPALA_PROYEK,
      ['p1', 'Literasi 2026', 'post; pre', 'pre', 'post', '2026-01-02T00:00:00Z'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.sesiUrut).toEqual(['post', 'pre']);
    expect(hasil.baris[0]?.sesiAwal).toBe('pre');
    expect(hasil.baris[0]?.sesiAkhir).toBe('post');
  });

  it('menerjemahkan sesi_awal dan sesi_akhir yang kosong menjadi null', () => {
    // §6.5 menyebutnya boleh kosong; kolom selisih lalu tidak dibuat.
    const hasil = bacaProyek([
      KEPALA_PROYEK,
      ['p1', 'Literasi 2026', 'pre, post', '', '', '2026-01-02'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.sesiAwal).toBeNull();
    expect(hasil.baris[0]?.sesiAkhir).toBeNull();
  });

  it('menerima proyek yang belum punya sesi sebagai larik kosong', () => {
    const hasil = bacaProyek([KEPALA_PROYEK, ['p1', 'Literasi 2026', '', '', '', '2026-01-02']]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.sesiUrut).toEqual([]);
  });

  it('menandai baris yang proyek_id-nya kosong', () => {
    const hasil = bacaProyek([
      KEPALA_PROYEK,
      ['', 'Literasi 2026', 'pre, post', 'pre', 'post', '2026-01-02'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.nomorBaris).toBe(2);
    expect(hasil.masalah[0]?.pesan).toMatch(/proyek_id/);
  });

  it('menerima cap waktu bertipe Date', () => {
    const hasil = bacaProyek([
      KEPALA_PROYEK,
      ['p1', 'Literasi 2026', 'pre', '', '', new Date('2026-01-02T00:00:00.000Z')],
    ]);

    expect(hasil.baris[0]?.dibuatPada).toBe('2026-01-02T00:00:00.000Z');
  });

  it('menandai proyek_id kembar, karena urutan sesinya lalu tidak tentu', () => {
    const hasil = bacaProyek([
      KEPALA_PROYEK,
      ['p1', 'Literasi 2026', 'pre, post', 'pre', 'post', '2026-01-02'],
      ['p1', 'Literasi 2026', 'post', 'post', '', '2026-01-03'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah.map((satu) => satu.nomorBaris)).toEqual([2, 3]);
    expect(hasil.masalah[0]?.pesan).toMatch(/proyek_id/);
  });
});

describe('bacaResponden', () => {
  it('membaca kolom tetap Responden dan menormalkan emailnya', () => {
    const hasil = bacaResponden([
      KEPALA_RESPONDEN,
      ['pre', 'a1b2c3d4e5f60718', ' Budi@Sekolah.id ', 'Budi', 'lengkap', '2026-01-02'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris).toEqual([
      {
        sesiId: 'pre',
        id: 'a1b2c3d4e5f60718',
        email: 'budi@sekolah.id',
        nama: 'Budi',
        kelengkapan: { status: 'lengkap' },
        diimporPada: '2026-01-02',
        jawaban: {},
        meta: {},
      },
    ]);
  });

  it('menerjemahkan nama kosong menjadi null, karena §6.1 membolehkannya', () => {
    const hasil = bacaResponden([
      KEPALA_RESPONDEN,
      ['pre', 'r1', 'budi@sekolah.id', '', 'kosong', '2026-01-02'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.nama).toBeNull();
    expect(hasil.baris[0]?.kelengkapan).toEqual({ status: 'kosong' });
  });

  it('mengurai status_kelengkapan kurang:N menjadi angka', () => {
    const hasil = bacaResponden([
      KEPALA_RESPONDEN,
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'kurang:3', '2026-01-02'],
    ]);

    expect(hasil.baris[0]?.kelengkapan).toEqual({ status: 'kurang', jumlahKosong: 3 });
  });

  it('menandai status_kelengkapan yang tidak dikenal', () => {
    const hasil = bacaResponden([
      KEPALA_RESPONDEN,
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'separuh', '2026-01-02'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/status_kelengkapan/);
  });

  it('menandai baris yang id atau email-nya kosong', () => {
    const hasil = bacaResponden([
      KEPALA_RESPONDEN,
      ['pre', '', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/\bid\b/);
  });

  it('membuang awalan jawaban_ dan meta_ lalu memangkas spasi tepinya saja', () => {
    // Koreksi D7. Pembalikannya wajib fungsi identitas: slug tidak bisa
    // dibalik, dan spasi ganda di tengah header memang ada pada form nyata.
    const hasil = bacaResponden([
      [...KEPALA_RESPONDEN, ' meta_Umur ', 'jawaban_Q1  Saya puas '],
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02', '20', 'Strongly Agree'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.meta).toEqual({ Umur: '20' });
    expect(hasil.baris[0]?.jawaban).toEqual({ 'Q1  Saya puas': 'Strongly Agree' });
  });

  it('memakai kunci jawaban yang sama persis dengan kolom_asal pada Skema', () => {
    // Satu-satunya hal yang membuat D7 berguna. Pencocokan keduanya memakai
    // pangkas spasi tepi saja; merapatkan salah satunya memutus sambungan ini
    // tanpa satu pun angka berubah tampak.
    const header = 'Q1  Saya puas dengan layanan ini?';
    const responden = bacaResponden([
      [...KEPALA_RESPONDEN, `jawaban_${header}`],
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02', 'setuju'],
    ]);
    const skema = bacaSkema([
      KEPALA_SKEMA,
      [
        's1',
        header,
        'Kepuasan',
        'layanan',
        'peta-opsi',
        '{"peta":{"setuju":4},"skorMaks":5}',
        5,
        1,
        'abaikan',
      ],
    ]);

    const kolomAsal = skema.baris[0]?.butir[0]?.kolomAsal ?? '';
    expect(kolomAsal).toBe(header);
    expect(responden.baris[0]?.jawaban[kolomAsal]).toBe('setuju');
  });

  it('mempertahankan jawaban kosong sebagai string kosong, bukan menghilangkan kolomnya', () => {
    // Kolom yang seluruh barisnya kosong akan terbaca "tidak ada" oleh
    // periksaSkema bila dibuang, lalu admin diminta memperbaiki kolom yang ada.
    const hasil = bacaResponden([
      [...KEPALA_RESPONDEN, 'jawaban_Q1'],
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'kosong', '2026-01-02', ''],
    ]);

    expect(hasil.baris[0]?.jawaban).toEqual({ Q1: '' });
    expect(Object.keys(hasil.baris[0]?.jawaban ?? {})).toEqual(['Q1']);
  });

  it('menerjemahkan jawaban bertipe angka menjadi teks', () => {
    const hasil = bacaResponden([
      [...KEPALA_RESPONDEN, 'jawaban_Usia'],
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02', 17],
    ]);

    expect(hasil.baris[0]?.jawaban).toEqual({ Usia: '17' });
  });

  it('menandai kepala jawaban_ yang sisanya kosong, tidak mengabaikannya', () => {
    const hasil = bacaResponden([
      [...KEPALA_RESPONDEN, 'jawaban_  '],
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02', 'Agree'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah).toHaveLength(1);
    expect(hasil.masalah[0]?.jenis).toBe('kepala');
    expect(hasil.masalah[0]?.pesan).toMatch(/jawaban_/);
  });

  it('menolak dua kolom dinamis yang bentrok setelah dipangkas, tidak menimpa diam-diam', () => {
    const hasil = bacaResponden([
      [...KEPALA_RESPONDEN, 'jawaban_Q1', 'jawaban_Q1 '],
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02', 'Agree', 'Disagree'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.jenis).toBe('kepala');
    expect(hasil.masalah[0]?.pesan).toMatch(/jawaban_Q1/);
  });

  it('tidak menganggap jawaban_Q1 dan meta_Q1 saling bentrok', () => {
    const hasil = bacaResponden([
      [...KEPALA_RESPONDEN, 'jawaban_Q1', 'meta_Q1'],
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02', 'Agree', 'kelas A'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.jawaban).toEqual({ Q1: 'Agree' });
    expect(hasil.baris[0]?.meta).toEqual({ Q1: 'kelas A' });
  });

  it('mengenali awalan yang ditulis dengan huruf besar, lalu menandai bentroknya', () => {
    // Awalan yang ditulis tangan dengan huruf besar tidak boleh membuat satu
    // kolom jawaban hilang diam-diam; tetapi dua bentuk yang sama setelah
    // awalannya dibuang tetap bentrok.
    const terbaca = bacaResponden([
      [...KEPALA_RESPONDEN, 'Meta_Umur'],
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02', '20'],
    ]);
    expect(terbaca.baris[0]?.meta).toEqual({ Umur: '20' });

    const bentrok = bacaResponden([
      [...KEPALA_RESPONDEN, 'meta_Umur', 'Meta_Umur'],
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02', '20', '21'],
    ]);
    expect(bentrok.baris).toEqual([]);
    expect(bentrok.masalah[0]?.jenis).toBe('kepala');
  });

  it('menghasilkan baris yang langsung berlaku sebagai RespondenSesi', () => {
    // Bukti pada waktu typecheck: bentuk yang dipakai bangunNilaiSesi.
    const hasil = bacaResponden([
      [...KEPALA_RESPONDEN, 'jawaban_Q1'],
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02', 'Agree'],
    ]);

    const responden: RespondenSesi[] = hasil.baris;
    expect(responden[0]?.jawaban).toEqual({ Q1: 'Agree' });
  });

  it('menandai baris tanpa sesi_id maupun tanpa email', () => {
    const hasil = bacaResponden([
      KEPALA_RESPONDEN,
      ['', 'r1', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02'],
      ['pre', 'r2', '', 'Siti', 'lengkap', '2026-01-02'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah.map((satu) => satu.nomorBaris)).toEqual([2, 3]);
    expect(hasil.masalah[0]?.pesan).toMatch(/sesi_id/);
    expect(hasil.masalah[1]?.pesan).toMatch(/email/);
  });

  it('menolak kurang:0 tetapi menerima LENGKAP berhuruf besar', () => {
    // §6.1 menuntut N minimal 1: "kurang 0 butir" adalah lengkap yang ditulis
    // dengan cara yang menyesatkan, bukan keadaan tersendiri.
    const nol = bacaResponden([
      KEPALA_RESPONDEN,
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'kurang:0', '2026-01-02'],
    ]);
    expect(nol.baris).toEqual([]);
    expect(nol.masalah[0]?.pesan).toMatch(/status_kelengkapan/);

    const besar = bacaResponden([
      KEPALA_RESPONDEN,
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'LENGKAP', '2026-01-02'],
    ]);
    expect(besar.masalah).toEqual([]);
    expect(besar.baris[0]?.kelengkapan).toEqual({ status: 'lengkap' });
  });

  it('memangkas sisa nama setelah awalan, bukan hanya awalannya', () => {
    const hasil = bacaResponden([
      [...KEPALA_RESPONDEN, 'jawaban_  Q1', 'meta_\tUmur '],
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02', 'Agree', '20'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.jawaban).toEqual({ Q1: 'Agree' });
    expect(hasil.baris[0]?.meta).toEqual({ Umur: '20' });
  });

  it('menandai id yang sudah dipaksa Sheets menjadi angka', () => {
    const hasil = bacaResponden([
      KEPALA_RESPONDEN,
      ['pre', 12345678901234, 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah).toHaveLength(1);
    expect(hasil.masalah[0]?.jenis).toBe('baris');
    expect(hasil.masalah[0]?.pesan).toMatch(/apostrof/);
  });

  it('memperingatkan kolom tanpa awalan, yang jawabannya hilang tanpa jejak', () => {
    // Respons Form yang ditempel apa adanya: kepalanya "Q1 Saya puas", bukan
    // "jawaban_Q1 Saya puas". Tanpa peringatan ini `jawaban` menjadi {} dan
    // dengan perlakuan_kosong "nol" seluruh nilai menjadi 0.
    const hasil = bacaResponden([
      [...KEPALA_RESPONDEN, 'Q1 Saya puas', 'Timestamp'],
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02', 'Agree', '2026-01-01'],
    ]);

    expect(hasil.baris).toHaveLength(1);
    expect(hasil.baris[0]?.jawaban).toEqual({});
    expect(hasil.masalah).toHaveLength(1);
    expect(hasil.masalah[0]?.nomorBaris).toBe(1);
    expect(hasil.masalah[0]?.jenis).toBe('peringatan');
    expect(hasil.masalah[0]?.pesan).toMatch(/"Q1 Saya puas", "Timestamp"/);
  });

  it('tidak memperingatkan kolom tetap §6.1 sebagai kolom tanpa awalan', () => {
    const hasil = bacaResponden([
      [...KEPALA_RESPONDEN, 'jawaban_Q1'],
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02', 'Agree'],
    ]);

    expect(hasil.masalah).toEqual([]);
  });

  it('tidak menandai id responden yang kembar, karena sesi.ts sudah menandainya', () => {
    // `dipadatkan` di core melaporkannya beserta jumlah barisnya; menandainya
    // di sini juga berarti admin memperbaiki keluhan yang sama di dua tempat.
    const hasil = bacaResponden([
      KEPALA_RESPONDEN,
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02'],
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-03'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris).toHaveLength(2);
  });
});

describe('bacaSkema', () => {
  it('menafsirkan parameter peta-opsi menjadi Aturan beserta perlakuanKosong', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      [
        's1',
        'Q1  Saya puas',
        'Kepuasan',
        'kemudahan',
        'peta-opsi',
        '{"peta":{"agree":4,"strongly agree":5},"skorMaks":5}',
        5,
        1,
        'abaikan',
      ],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris).toEqual<Skema[]>([
      {
        skemaId: 's1',
        perlakuanKosong: 'abaikan',
        butir: [
          {
            kolomAsal: 'Q1  Saya puas',
            label: 'Kepuasan',
            dimensi: 'kemudahan',
            aturan: { jenis: 'peta-opsi', peta: { agree: 4, 'strongly agree': 5 }, skorMaks: 5 },
            bobot: 1,
          },
        ],
      },
    ]);
  });

  it('menafsirkan kunci-jawaban, manual, dan abaikan menurut §7.1', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Soal 1', 'Soal 1', 'pengetahuan', 'kunci-jawaban', '{"benar":"B"}', 1, 1, 'nol'],
      ['s1', 'Esai', 'Esai', 'penalaran', 'manual', '{"min":0,"maks":100}', 100, 2, 'nol'],
      ['s1', 'Saran', 'Saran', 'lain', 'abaikan', '', '', 1, 'nol'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.perlakuanKosong).toBe('nol');
    expect(hasil.baris[0]?.butir.map((satu) => satu.aturan)).toEqual([
      { jenis: 'kunci-jawaban', kunci: 'B' },
      { jenis: 'manual', min: 0, maks: 100 },
      { jenis: 'abaikan' },
    ]);
  });

  it('mengelompokkan baris menjadi satu Skema per skema_id, menurut urutan sheet', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['post', 'Q2', 'Q2', 'd', 'manual', '{"min":0,"maks":10}', '', 1, 'nol'],
      ['pre', 'Q1', 'Q1', 'd', 'manual', '{"min":0,"maks":10}', '', 1, 'abaikan'],
      ['post', 'Q3', 'Q3', 'd', 'manual', '{"min":0,"maks":10}', '', 1, 'nol'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris.map((satu) => satu.skemaId)).toEqual(['post', 'pre']);
    expect(hasil.baris[0]?.butir).toHaveLength(2);
    expect(hasil.baris[1]?.butir).toHaveLength(1);
  });

  it('menandai perselisihan perlakuan_kosong, tidak mengambil baris pertama', () => {
    // Koreksi D6. Nilainya terulang tiap baris, jadi dua baris bisa berselisih;
    // memilih yang pertama berarti separuh skema dinilai dengan aturan yang
    // tidak pernah dipilih siapa pun.
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Q1', 'd', 'manual', '{"min":0,"maks":10}', '', 1, 'abaikan'],
      ['s1', 'Q2', 'Q2', 'd', 'manual', '{"min":0,"maks":10}', '', 1, 'nol'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah).toHaveLength(2);
    expect(hasil.masalah[0]?.nomorBaris).toBe(3);
    expect(hasil.masalah[0]?.pesan).toMatch(/abaikan/);
    expect(hasil.masalah[0]?.pesan).toMatch(/nol/);
    expect(hasil.masalah[0]?.pesan).toMatch(/baris 2/);
    expect(hasil.masalah[1]?.pesan).toMatch(/Skema "s1" \(baris 2–3\) tidak dihasilkan/);
  });

  it('menandai perlakuan_kosong yang masih kosong, karena §7.2 butir 3 menuntut keputusan', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Q1', 'd', 'manual', '{"min":0,"maks":10}', '', 1, ''],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/perlakuan_kosong/);
    expect(hasil.masalah[0]?.pesan).toMatch(/§7\.2/);
  });

  it('menandai perlakuan_kosong di luar abaikan dan nol, tidak menebaknya', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Q1', 'd', 'manual', '{"min":0,"maks":10}', '', 1, 'kosongkan'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/kosongkan/);
  });

  it('menerima perlakuan_kosong yang berbeda huruf besar-kecil sebagai nilai yang sama', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Q1', 'd', 'manual', '{"min":0,"maks":10}', '', 1, 'Abaikan'],
      ['s1', 'Q2', 'Q2', 'd', 'manual', '{"min":0,"maks":10}', '', 1, ' abaikan '],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.perlakuanKosong).toBe('abaikan');
  });

  it('menandai skor_maks yang berselisih dengan parameter, tetapi tetap memakai parameter', () => {
    // Koreksi D8. Angkanya tidak salah — yang salah adalah keyakinan pembaca
    // sheet pada angka yang tidak dipakai menghitung apa pun.
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Q1', 'd', 'peta-opsi', '{"peta":{"agree":4},"skorMaks":4}', 5, 1, 'abaikan'],
    ]);

    expect(hasil.baris).toHaveLength(1);
    expect(hasil.baris[0]?.butir[0]?.aturan).toEqual({
      jenis: 'peta-opsi',
      peta: { agree: 4 },
      skorMaks: 4,
    });
    expect(hasil.masalah).toHaveLength(1);
    expect(hasil.masalah[0]?.jenis).toBe('peringatan');
    expect(hasil.masalah[0]?.nomorBaris).toBe(2);
    expect(hasil.masalah[0]?.pesan).toMatch(/skor_maks/);
  });

  it('menandai skor_maks yang berselisih pada kunci-jawaban dan manual', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Soal', 'Soal', 'd', 'kunci-jawaban', '{"benar":"B"}', 4, 1, 'nol'],
      ['s1', 'Esai', 'Esai', 'd', 'manual', '{"min":0,"maks":100}', 10, 1, 'nol'],
    ]);

    expect(hasil.baris).toHaveLength(1);
    expect(hasil.masalah.map((satu) => satu.nomorBaris)).toEqual([2, 3]);
    expect(hasil.masalah.every((satu) => satu.jenis === 'peringatan')).toBe(true);
  });

  it('menandai skor_maks yang terisi pada aturan abaikan', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Saran', 'Saran', 'lain', 'abaikan', '', 5, 1, 'nol'],
    ]);

    expect(hasil.baris).toHaveLength(1);
    expect(hasil.masalah[0]?.jenis).toBe('peringatan');
    expect(hasil.masalah[0]?.pesan).toMatch(/abaikan/);
  });

  it('tidak menganggap skor_maks yang kosong sebagai perselisihan', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      [
        's1',
        'Q1',
        'Q1',
        'd',
        'peta-opsi',
        '{"peta":{"agree":4,"strongly agree":5},"skorMaks":5}',
        '',
        1,
        'nol',
      ],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.butir[0]?.aturan).toEqual({
      jenis: 'peta-opsi',
      peta: { agree: 4, 'strongly agree': 5 },
      skorMaks: 5,
    });
  });

  it('menandai parameter yang bukan JSON sah tanpa melempar', () => {
    const bacaan = () =>
      bacaSkema([
        KEPALA_SKEMA,
        ['s1', 'Q1', 'Q1', 'd', 'peta-opsi', '{peta:{agree:4}}', 5, 1, 'nol'],
      ]);

    expect(bacaan).not.toThrow();
    const hasil = bacaan();
    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/parameter/);
  });

  it('menandai parameter yang bukan objek, termasuk larik dan angka', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Q1', 'd', 'peta-opsi', '[1,2,3]', '', 1, 'nol'],
      ['s1', 'Q2', 'Q2', 'd', 'manual', '7', '', 1, 'nol'],
      ['s1', 'Q3', 'Q3', 'd', 'kunci-jawaban', 'null', '', 1, 'nol'],
    ]);

    expect(hasil.baris).toEqual([]);
    // Tiga baris cacat, lalu satu ringkasan setingkat skema di baris pertamanya.
    expect(hasil.masalah.map((satu) => satu.nomorBaris)).toEqual([2, 3, 4, 2]);
    expect(hasil.masalah[3]?.pesan).toMatch(/tidak dihasilkan karena baris 2, 3, 4/);
  });

  it('menandai parameter yang bentuknya milik aturan lain', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Q1', 'd', 'peta-opsi', '{"min":0,"maks":100}', '', 1, 'nol'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/peta/);
  });

  it('menandai parameter kosong pada aturan yang membutuhkannya', () => {
    const hasil = bacaSkema([KEPALA_SKEMA, ['s1', 'Q1', 'Q1', 'd', 'manual', '', 100, 1, 'nol']]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/parameter/);
  });

  it('menerima peta opsi yang bernilai nol maupun negatif', () => {
    // Skala yang menghukum jawaban menyesatkan adalah rancangan yang sah.
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      [
        's1',
        'Q1',
        'Q1',
        'd',
        'peta-opsi',
        '{"peta":{"salah":-1,"tidak tahu":0,"benar":1},"skorMaks":1}',
        1,
        1,
        'nol',
      ],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.butir[0]?.aturan).toEqual({
      jenis: 'peta-opsi',
      peta: { salah: -1, 'tidak tahu': 0, benar: 1 },
      skorMaks: 1,
    });
  });

  it('menandai nilai peta yang bukan angka', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Q1', 'd', 'peta-opsi', '{"peta":{"agree":"4"},"skorMaks":5}', '', 1, 'nol'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/agree/);
  });

  it('menandai kunci jawaban yang kosong, yang akan membuat semua orang bernilai nol', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Soal', 'Soal', 'd', 'kunci-jawaban', '{"benar":"  "}', 1, 1, 'nol'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/benar/);
  });

  it('menandai rentang manual yang min-nya melampaui maks', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Esai', 'Esai', 'd', 'manual', '{"min":100,"maks":0}', '', 1, 'nol'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/min 100/);
  });

  it('menandai aturan di luar keempat yang sah', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Kepuasan', 'kemudahan', 'rata-rata', '{}', 5, 1, 'nol'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/peta-opsi/);
  });

  it('menandai bobot yang bukan angka, bukan menggantinya dengan satu', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      [
        's1',
        'Q1',
        'Kepuasan',
        'd',
        'peta-opsi',
        '{"peta":{"agree":4},"skorMaks":5}',
        5,
        'satu',
        'nol',
      ],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/bobot/);
  });

  it('menandai bobot yang kosong, karena kosong bukan bobot nol', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Kepuasan', 'd', 'peta-opsi', '{"peta":{"agree":4},"skorMaks":5}', 5, '', 'nol'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/bobot/);
  });

  it('menerima bobot dan skor_maks bertipe teks', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      [
        's1',
        'Q1',
        'Kepuasan',
        'd',
        'peta-opsi',
        '{"peta":{"agree":4,"strongly agree":5},"skorMaks":5}',
        '5',
        '0.5',
        'nol',
      ],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.butir[0]?.bobot).toBe(0.5);
  });

  it('tidak menghasilkan Skema yang salah satu butirnya gagal dibaca', () => {
    // Rata-rata terbobot atas separuh instrumen adalah cacat yang rencana ini
    // perbaiki; menghasilkan skema tanpa butir yang gagal mengulanginya.
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Q1', 'd', 'peta-opsi', '{"peta":{"agree":4},"skorMaks":5}', 5, 1, 'nol'],
      ['s1', 'Q2', 'Q2', 'd', 'peta-opsi', 'bukan json', 5, 1, 'nol'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.nomorBaris).toBe(3);
  });

  it('tidak menjatuhkan skema lain gara-gara satu skema cacat', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['rusak', 'Q1', 'Q1', 'd', 'peta-opsi', 'bukan json', '', 1, 'nol'],
      ['utuh', 'Q1', 'Q1', 'd', 'manual', '{"min":0,"maks":10}', '', 1, 'nol'],
    ]);

    expect(hasil.baris.map((satu) => satu.skemaId)).toEqual(['utuh']);
    expect(hasil.masalah).toHaveLength(2);
    expect(hasil.masalah.every((satu) => satu.skemaId === 'rusak')).toBe(true);
  });

  it('menandai baris yang skema_id-nya kosong tanpa menjatuhkan skema mana pun', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['', 'Q1', 'Q1', 'd', 'manual', '{"min":0,"maks":10}', '', 1, 'nol'],
      ['s1', 'Q2', 'Q2', 'd', 'manual', '{"min":0,"maks":10}', '', 1, 'nol'],
    ]);

    expect(hasil.baris.map((satu) => satu.skemaId)).toEqual(['s1']);
    expect(hasil.masalah[0]?.nomorBaris).toBe(2);
    expect(hasil.masalah[0]?.pesan).toMatch(/skema_id/);
  });

  it('menandai kolom_asal kembar dalam satu skema, karena bobotnya terhitung dua kali', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1 ', 'Q1', 'd', 'manual', '{"min":0,"maks":10}', '', 1, 'nol'],
      ['s1', ' Q1', 'Q1 lagi', 'd', 'manual', '{"min":0,"maks":10}', '', 1, 'nol'],
    ]);

    expect(hasil.baris[0]?.butir).toHaveLength(2);
    expect(hasil.masalah).toHaveLength(1);
    expect(hasil.masalah[0]?.jenis).toBe('peringatan');
    expect(hasil.masalah[0]?.nomorBaris).toBe(3);
  });

  it('menolak sheet Skema yang kepalanya kurang kolom perlakuan_kosong', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA.filter((nama) => nama !== 'perlakuan_kosong'),
      ['s1', 'Q1', 'Q1', 'd', 'manual', '{"min":0,"maks":10}', '', 1],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.jenis).toBe('kepala');
    expect(hasil.masalah[0]?.pesan).toMatch(/perlakuan_kosong/);
  });

  it('tidak bergantung pada urutan kolom', () => {
    const hasil = bacaSkema([
      [
        'bobot',
        'perlakuan_kosong',
        'aturan',
        'skema_id',
        'parameter',
        'kolom_asal',
        'label',
        'dimensi',
        'skor_maks',
      ],
      [1, 'nol', 'manual', 's1', '{"min":0,"maks":10}', 'Esai', 'Esai', 'd', 10],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.butir[0]).toEqual({
      kolomAsal: 'Esai',
      label: 'Esai',
      dimensi: 'd',
      aturan: { jenis: 'manual', min: 0, maks: 10 },
      bobot: 1,
    });
  });

  it('menandai kolom_asal yang kosong, yang tidak menunjuk kolom jawaban mana pun', () => {
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', '', 'Kepuasan', 'd', 'manual', '{"min":0,"maks":10}', '', 1, 'nol'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.nomorBaris).toBe(2);
    expect(hasil.masalah[0]?.pesan).toMatch(/kolom_asal/);
    expect(hasil.masalah[0]?.skemaId).toBe('s1');
  });

  it('membedakan skor_maks bernilai nol dari skor_maks yang kosong', () => {
    // Nol adalah angka yang ditulis admin dan berselisih dengan parameter;
    // kosong adalah angka yang belum ditulis. Menyamakannya mendiamkan D8.
    // Peta sengaja mencapai skorMaks supaya peringatan "opsi tertinggi di bawah
    // skor maksimum" tidak ikut menyala dan mengaburkan yang sedang diuji.
    const nol = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Q1', 'd', 'peta-opsi', '{"peta":{"agree":5},"skorMaks":5}', 0, 1, 'nol'],
    ]);
    expect(nol.baris).toHaveLength(1);
    expect(nol.masalah).toHaveLength(1);
    expect(nol.masalah[0]?.jenis).toBe('peringatan');
    expect(nol.masalah[0]?.pesan).toMatch(/skor_maks/);

    const kosong = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Q1', 'd', 'peta-opsi', '{"peta":{"agree":5},"skorMaks":5}', '', 1, 'nol'],
    ]);
    expect(kosong.masalah).toEqual([]);
  });

  it('menolak peta-opsi tanpa skorMaks, tidak menurunkannya dari nilai tertinggi peta', () => {
    // usulAturan.ts menolak menurunkan skorMaks dari data justru karena skala
    // yang sengaja tidak penuh adalah rancangan yang sah. Menurunkannya di
    // sini membuat setiap responden tampak mencapai nilai penuh.
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Q1', 'd', 'peta-opsi', '{"peta":{"agree":4,"setuju":3}}', '', 1, 'nol'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/skorMaks/);
  });

  it('menolak skorMaks dan bobot yang bukan angka menurut Sheets', () => {
    // Number('0x10') bernilai 16 dan Number('Infinity') tak terhingga; Sheets
    // tidak memperlakukan keduanya sebagai angka, dan menerimanya di sini
    // membuat penyebut nilai menjadi sesuatu yang tidak pernah diketik siapa pun.
    const skorMaks = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Q1', 'd', 'peta-opsi', '{"peta":{"agree":4},"skorMaks":"0x10"}', '', 1, 'nol'],
    ]);
    expect(skorMaks.baris).toEqual([]);
    expect(skorMaks.masalah[0]?.pesan).toMatch(/skorMaks/);

    const bobot = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Q1', 'd', 'manual', '{"min":0,"maks":10}', '', '0x10', 'nol'],
      ['s2', 'Q1', 'Q1', 'd', 'manual', '{"min":0,"maks":10}', '', 'Infinity', 'nol'],
    ]);
    expect(bobot.baris).toEqual([]);
    expect(bobot.masalah.map((satu) => satu.nomorBaris)).toEqual([2, 2, 3, 3]);
    expect(bobot.masalah[0]?.pesan).toMatch(/bobot/);
    expect(bobot.masalah[2]?.pesan).toMatch(/bobot/);
  });

  it('menolak skor_maks bertuliskan Infinity sebagai pembanding, tanpa menjatuhkan butirnya', () => {
    // Petanya mencapai skorMaks supaya yang tersisa hanya keluhan tentang sel
    // pembandingnya sendiri.
    const hasil = bacaSkema([
      KEPALA_SKEMA,
      [
        's1',
        'Q1',
        'Q1',
        'd',
        'peta-opsi',
        '{"peta":{"agree":5},"skorMaks":5}',
        'Infinity',
        1,
        'nol',
      ],
    ]);

    expect(hasil.baris).toHaveLength(1);
    expect(hasil.masalah).toHaveLength(1);
    expect(hasil.masalah[0]?.jenis).toBe('peringatan');
    expect(hasil.masalah[0]?.pesan).toMatch(/Infinity/);
  });
});

describe('tulisParameter', () => {
  // Tanpa penulis, bentuk sel `parameter` hanya didefinisikan oleh pengurainya,
  // dan setiap modul yang kelak menulis Skema ke sheet harus menebaknya.
  const SEMUA_ATURAN: Aturan[] = [
    { jenis: 'peta-opsi', peta: { agree: 4, 'strongly agree': 5 }, skorMaks: 5 },
    { jenis: 'kunci-jawaban', kunci: 'B' },
    { jenis: 'manual', min: 0, maks: 100 },
    { jenis: 'abaikan' },
  ];

  function barisSkema(aturan: Aturan): unknown[] {
    return ['s1', 'Q1', 'Kepuasan', 'd', aturan.jenis, tulisParameter(aturan), '', 1, 'nol'];
  }

  for (const aturan of SEMUA_ATURAN) {
    it(`bolak-balik tanpa berubah untuk aturan ${aturan.jenis}`, () => {
      const hasil = bacaSkema([KEPALA_SKEMA, barisSkema(aturan)]);

      expect(hasil.masalah).toEqual([]);
      expect(hasil.baris[0]?.butir[0]?.aturan).toEqual(aturan);
    });
  }

  it('menulis kunci-jawaban sebagai "benar", bukan "kunci" seperti tipe core', () => {
    // Jebakan yang membuat JSON.stringify(aturan) tampak cukup: §7.1 memakai
    // "benar", sehingga skema yang ditulis begitu batal SELURUHNYA saat dibaca
    // lagi — dan baru terlihat pada rekap berikutnya.
    const aturan: Aturan = { jenis: 'kunci-jawaban', kunci: 'B' };
    expect(tulisParameter(aturan)).toBe('{"benar":"B"}');

    const naif = bacaSkema([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Q1', 'd', 'kunci-jawaban', JSON.stringify(aturan), '', 1, 'nol'],
    ]);
    expect(naif.baris).toEqual([]);
    expect(naif.masalah[0]?.pesan).toMatch(/benar/);
  });

  it('menulis sel kosong untuk abaikan, karena §7.1 tidak memberinya parameter', () => {
    expect(tulisParameter({ jenis: 'abaikan' })).toBe('');
  });
});
