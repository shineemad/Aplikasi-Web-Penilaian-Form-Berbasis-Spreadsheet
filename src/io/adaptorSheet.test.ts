import { describe, expect, it } from 'vitest';
import {
  bacaPenilaian,
  bacaProyek,
  bacaRespondenTetap,
  bacaSesi,
  bacaSkemaMentah,
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
});

describe('bacaRespondenTetap', () => {
  it('membaca kolom tetap Responden dan menormalkan emailnya', () => {
    const hasil = bacaRespondenTetap([
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
      },
    ]);
  });

  it('menerjemahkan nama kosong menjadi null, karena §6.1 membolehkannya', () => {
    const hasil = bacaRespondenTetap([
      KEPALA_RESPONDEN,
      ['pre', 'r1', 'budi@sekolah.id', '', 'kosong', '2026-01-02'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.nama).toBeNull();
    expect(hasil.baris[0]?.kelengkapan).toEqual({ status: 'kosong' });
  });

  it('mengurai status_kelengkapan kurang:N menjadi angka', () => {
    const hasil = bacaRespondenTetap([
      KEPALA_RESPONDEN,
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'kurang:3', '2026-01-02'],
    ]);

    expect(hasil.baris[0]?.kelengkapan).toEqual({ status: 'kurang', jumlahKosong: 3 });
  });

  it('menandai status_kelengkapan yang tidak dikenal', () => {
    const hasil = bacaRespondenTetap([
      KEPALA_RESPONDEN,
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'separuh', '2026-01-02'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/status_kelengkapan/);
  });

  it('menandai baris yang id atau email-nya kosong', () => {
    const hasil = bacaRespondenTetap([
      KEPALA_RESPONDEN,
      ['pre', '', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/\bid\b/);
  });

  it('tidak melempar pada kolom jawaban_* dan meta_* yang belum berbentuk tetap', () => {
    // Kolom dinamis sengaja TIDAK dibaca di sini: bentuk `jawaban_<apa>`
    // belum ditetapkan spec, sehingga memetakannya kembali ke `kolom_asal`
    // hanya bisa ditebak. Lihat laporan celah.
    const hasil = bacaRespondenTetap([
      [...KEPALA_RESPONDEN, 'meta_Age', 'jawaban_Q1'],
      ['pre', 'r1', 'budi@sekolah.id', 'Budi', 'lengkap', '2026-01-02', '20', 'Agree'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris).toHaveLength(1);
  });
});

describe('bacaSkemaMentah', () => {
  it('membaca baris Skema tanpa menafsirkan parameter menjadi Aturan', () => {
    const hasil = bacaSkemaMentah([
      KEPALA_SKEMA,
      ['s1', 'Q1  Saya puas', 'Kepuasan', 'kemudahan', 'peta-opsi', '{"agree":4}', 5, 1],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris).toEqual([
      {
        skemaId: 's1',
        kolomAsal: 'Q1  Saya puas',
        label: 'Kepuasan',
        dimensi: 'kemudahan',
        jenisAturan: 'peta-opsi',
        parameter: { agree: 4 },
        skorMaks: 5,
        bobot: 1,
      },
    ]);
  });

  it('menerjemahkan parameter dan skor_maks yang kosong menjadi null', () => {
    const hasil = bacaSkemaMentah([
      KEPALA_SKEMA,
      ['s1', 'Catatan', 'Catatan', 'lain', 'abaikan', '', '', 1],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.parameter).toBeNull();
    expect(hasil.baris[0]?.skorMaks).toBeNull();
  });

  it('menandai parameter yang bukan JSON sah', () => {
    const hasil = bacaSkemaMentah([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Kepuasan', 'kemudahan', 'peta-opsi', '{agree:4}', 5, 1],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/parameter/);
  });

  it('menandai aturan di luar keempat yang sah', () => {
    const hasil = bacaSkemaMentah([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Kepuasan', 'kemudahan', 'rata-rata', '{}', 5, 1],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/peta-opsi/);
  });

  it('menandai bobot yang bukan angka, bukan menggantinya dengan satu', () => {
    const hasil = bacaSkemaMentah([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Kepuasan', 'kemudahan', 'peta-opsi', '{"agree":4}', 5, 'satu'],
    ]);

    expect(hasil.baris).toEqual([]);
    expect(hasil.masalah[0]?.pesan).toMatch(/bobot/);
  });

  it('menerima bobot dan skor_maks bertipe teks', () => {
    const hasil = bacaSkemaMentah([
      KEPALA_SKEMA,
      ['s1', 'Q1', 'Kepuasan', 'kemudahan', 'peta-opsi', '{"agree":4}', '5', '0.5'],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.baris[0]?.skorMaks).toBe(5);
    expect(hasil.baris[0]?.bobot).toBe(0.5);
  });
});
