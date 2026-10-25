import { describe, expect, it } from 'vitest';
import {
  buatContentServicePalsu,
  buatLockServicePalsu,
  buatSessionPalsu,
  buatSpreadsheetAppPalsu,
  buatSpreadsheetPalsu,
  sheetWajib,
  type KeluaranTeksPalsu,
  type LockServicePalsu,
  type SpreadsheetPalsu,
} from './googlePalsu';
import { muatKode } from './sandbox';
import { bacaPenilaian, bacaResponden, bacaSkema } from '../../src/io/adaptorSheet';

/**
 * Tugas 3 — aksi `bacaRekap`.
 *
 * Seperti berkas uji lain di folder ini, seluruh uji memanggil `doPost`
 * sungguhan pada `Kode.gs` yang di-deploy (Batasan Global 20).
 *
 * Yang dibaca adalah baris **mentah** ketiga sheet: `Kode.gs` tidak menghitung
 * apa pun dan tidak merapikan satu sel pun. Dua hal yang paling mudah tampak
 * benar padahal salah dijaga ketat di sini: baris milik sesi lain yang ikut
 * terbawa — sheet `Responden` memuat email seluruh sesi, jadi kebocorannya
 * sekaligus kebocoran data pribadi (§9.3) — dan sel yang dirapikan di jalan,
 * yang membuat `kolom_asal` berspasi ganda tidak pernah cocok lagi dengan
 * kriteria pada `Penilaian`.
 */

const KEPALA_SESI: unknown[] = [
  'sesi_id',
  'proyek_id',
  'nama',
  'skema_id',
  'mode',
  'status',
  'penilai',
  'admin',
];

const KEPALA_RESPONDEN: unknown[] = [
  'sesi_id',
  'id',
  'email',
  'nama',
  'status_kelengkapan',
  'diimpor_pada',
];

const KEPALA_SKEMA: unknown[] = [
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

const KEPALA_PENILAIAN: unknown[] = [
  'penilaian_id',
  'sesi_id',
  'responden_id',
  'kriteria',
  'nilai',
  'catatan',
  'oleh',
  'pada',
];

/**
 * Kolom asal sengaja berspasi ganda. Importer hanya memangkas spasi tepi, jadi
 * header seperti ini memang sampai ke sheet apa adanya; backend yang ikut
 * merapatkan spasi akan memutus pencocokannya dengan `kriteria` (cacat B4).
 */
const KOLOM_BERSPASI = 'Butir  A';

const PETA_YA_TIDAK = '{"peta":{"Ya":1,"Tidak":0},"skorMaks":1}';

/** Hash heksadesimal yang memuat huruf; Sheets menyimpannya sebagai teks. */
const ID_ANI = 'a1b2c3d4e5f60718';

/**
 * Hash yang seluruhnya angka, pada kolom yang diformat teks. Sheets akan
 * memaksanya menjadi 12345678901234 bila nol di depannya tidak dipertahankan,
 * sehingga baris ini mustahil dicocokkan kembali dengan respondennya.
 */
const ID_BUDI = '0012345678901234';

const PENILAI_BAWAAN = 'Penilai@Kampus.id ';

const BARIS_S1: unknown[] = [
  'S1',
  'P1',
  'Post-Test',
  'SK1',
  'indeks',
  'berjalan',
  PENILAI_BAWAAN,
  'admin@kampus.id',
];

const BARIS_S2: unknown[] = [
  'S2',
  'P1',
  'Pre-Test',
  'SK2',
  'indeks',
  'berjalan',
  PENILAI_BAWAAN,
  'admin@kampus.id',
];

const RESPONDEN_S1_ANI: unknown[] = [
  'S1',
  ID_ANI,
  'ani@kampus.id',
  'Ani',
  'lengkap',
  '2026-10-01T00:00:00.000Z',
];

const RESPONDEN_S1_BUDI: unknown[] = [
  'S1',
  ID_BUDI,
  'budi@kampus.id',
  'Budi',
  'kurang:2',
  '2026-10-01T00:00:00.000Z',
];

const RESPONDEN_S2_ANI: unknown[] = [
  'S2',
  ID_ANI,
  'ani@kampus.id',
  'Ani',
  'lengkap',
  '2026-09-01T00:00:00.000Z',
];

const SKEMA_SK1_A: unknown[] = [
  'SK1',
  KOLOM_BERSPASI,
  'Butir A',
  'kemudahan',
  'peta-opsi',
  PETA_YA_TIDAK,
  1,
  1,
  'abaikan',
];

const SKEMA_SK1_B: unknown[] = [
  'SK1',
  'Butir B',
  'Butir B',
  'manfaat',
  'peta-opsi',
  PETA_YA_TIDAK,
  1,
  1,
  'abaikan',
];

const SKEMA_SK2_C: unknown[] = [
  'SK2',
  'Butir C',
  'Butir C',
  'kemudahan',
  'peta-opsi',
  PETA_YA_TIDAK,
  1,
  1,
  'abaikan',
];

const PENILAIAN_S1: unknown[] = [
  1,
  'S1',
  ID_ANI,
  KOLOM_BERSPASI,
  1,
  '',
  'penilai@kampus.id',
  '2026-10-02T00:00:00.000Z',
];

const PENILAIAN_S2: unknown[] = [
  2,
  'S2',
  ID_ANI,
  'Butir C',
  0,
  'ragu',
  'penilai@kampus.id',
  '2026-09-02T00:00:00.000Z',
];

interface BalasanRekap {
  ok: boolean;
  kode: string;
  pesan: string;
  sesiId?: string;
  skemaId?: string;
  responden?: unknown[][];
  skema?: unknown[][];
  penilaian?: unknown[][];
  peringatan?: string[];
}

interface OpsiRuangKerja {
  sesi?: unknown[][];
  responden?: unknown[][];
  skema?: unknown[][];
  penilaian?: unknown[][];
  /** Sheet yang sengaja tidak dibuat, meniru ruang kerja yang belum disiapkan. */
  tanpaSheet?: string[];
}

function buatRuangKerja(opsi: OpsiRuangKerja = {}): SpreadsheetPalsu {
  const isi: Record<string, unknown[][]> = {
    Sesi: opsi.sesi === undefined ? [KEPALA_SESI, BARIS_S1, BARIS_S2] : opsi.sesi,
    Responden:
      opsi.responden === undefined
        ? [KEPALA_RESPONDEN, RESPONDEN_S1_ANI, RESPONDEN_S2_ANI, RESPONDEN_S1_BUDI]
        : opsi.responden,
    Skema:
      opsi.skema === undefined ? [KEPALA_SKEMA, SKEMA_SK1_A, SKEMA_SK2_C, SKEMA_SK1_B] : opsi.skema,
    Penilaian:
      opsi.penilaian === undefined
        ? [KEPALA_PENILAIAN, PENILAIAN_S1, PENILAIAN_S2]
        : opsi.penilaian,
  };
  if (opsi.tanpaSheet !== undefined) {
    for (const nama of opsi.tanpaSheet) delete isi[nama];
  }
  return buatSpreadsheetPalsu(isi);
}

interface OpsiRekap {
  email?: string;
  sesiId?: unknown;
  aksi?: string;
  ss?: SpreadsheetPalsu;
  lockService?: LockServicePalsu;
}

interface HasilRekap {
  balasan: BalasanRekap;
  ss: SpreadsheetPalsu;
  lockService: LockServicePalsu;
}

function panggilRekap(opsi: OpsiRekap = {}): HasilRekap {
  const ss = opsi.ss === undefined ? buatRuangKerja() : opsi.ss;
  const lockService = opsi.lockService === undefined ? buatLockServicePalsu() : opsi.lockService;
  const konteks = muatKode({
    Session: buatSessionPalsu(opsi.email === undefined ? 'penilai@kampus.id' : opsi.email),
    SpreadsheetApp: buatSpreadsheetAppPalsu(ss),
    LockService: lockService,
    ContentService: buatContentServicePalsu(),
  });
  const doPost = konteks.doPost;
  if (typeof doPost !== 'function') throw new Error('Kode.gs tidak mengekspos doPost.');
  const keluaran = (doPost as (e: unknown) => KeluaranTeksPalsu)({
    postData: {
      contents: JSON.stringify({
        aksi: opsi.aksi === undefined ? 'bacaRekap' : opsi.aksi,
        sesiId: opsi.sesiId === undefined ? 'S1' : opsi.sesiId,
        muatan: {},
      }),
    },
  });
  return { balasan: JSON.parse(keluaran.getContent()) as BalasanRekap, ss, lockService };
}

type MedanKisi = 'responden' | 'skema' | 'penilaian';

/** Mengubah medan yang hilang menjadi kegagalan yang menyebut balasannya. */
function kisiWajib(balasan: BalasanRekap, medan: MedanKisi): unknown[][] {
  const kisi = balasan[medan];
  if (kisi === undefined) {
    throw new Error(`Balasan tidak memuat kisi "${medan}": ${JSON.stringify(balasan)}`);
  }
  return kisi;
}

/** Baris data saja; baris kepala dibuktikan terpisah supaya tidak ikut tersamar. */
function barisData(kisi: unknown[][]): unknown[][] {
  return kisi.slice(1);
}

/** Dibaca lewat kepala kolom, supaya uji tetap sahih bila urutan kolom berubah. */
function selKisi(kisi: unknown[][], indeksBaris: number, namaKolom: string): unknown {
  const kepala = kisi[0];
  if (kepala === undefined) throw new Error('Kisi tidak punya baris kepala.');
  const kolom = kepala.indexOf(namaKolom);
  if (kolom < 0) throw new Error(`Kolom ${namaKolom} tidak ada pada kisi.`);
  const baris = kisi[indeksBaris];
  if (baris === undefined) throw new Error(`Baris ${String(indeksBaris)} tidak ada pada kisi.`);
  return baris[kolom];
}

function kolomDari(kisi: unknown[][], namaKolom: string): unknown[] {
  return barisData(kisi).map((_, i) => selKisi(kisi, i + 1, namaKolom));
}

function gabungPeringatan(balasan: BalasanRekap): string {
  return balasan.peringatan === undefined ? '' : balasan.peringatan.join(' | ');
}

describe('bacaRekap hanya menyerahkan baris milik sesi yang diminta', () => {
  it('menyaring Responden menurut sesi_id', () => {
    // Sheet Responden memuat email seluruh sesi. Baris sesi lain yang ikut
    // terbawa bukan sekadar angka yang salah, melainkan data pribadi peserta
    // yang tidak pernah diminta (§9.3).
    const { balasan } = panggilRekap();
    expect(balasan.ok).toBe(true);
    const responden = kisiWajib(balasan, 'responden');
    expect(kolomDari(responden, 'sesi_id')).toEqual(['S1', 'S1']);
    expect(kolomDari(responden, 'email')).toEqual(['ani@kampus.id', 'budi@kampus.id']);
  });

  it('menyaring Penilaian menurut sesi_id', () => {
    const { balasan } = panggilRekap();
    const penilaian = kisiWajib(balasan, 'penilaian');
    expect(kolomDari(penilaian, 'sesi_id')).toEqual(['S1']);
    expect(kolomDari(penilaian, 'penilaian_id')).toEqual([1]);
  });

  it('mengembalikan Skema milik skema_id sesi itu, bukan seluruh sheet', () => {
    // Skema sesi lain yang ikut terbawa membuat butir yang tidak pernah
    // ditanyakan menyumbang bobot, dan nilainya tetap tampak wajar.
    const { balasan } = panggilRekap();
    const skema = kisiWajib(balasan, 'skema');
    expect(kolomDari(skema, 'skema_id')).toEqual(['SK1', 'SK1']);
    expect(kolomDari(skema, 'kolom_asal')).toEqual([KOLOM_BERSPASI, 'Butir B']);
    expect(balasan.skemaId).toBe('SK1');
  });

  it('membaca sesi kedua tanpa membawa baris sesi pertama', () => {
    // Arah sebaliknya. Tanpa ini, implementasi yang mengembalikan baris
    // pertama saja akan tetap hijau pada ketiga uji di atas.
    const { balasan } = panggilRekap({ sesiId: 'S2' });
    expect(balasan.ok).toBe(true);
    expect(kolomDari(kisiWajib(balasan, 'responden'), 'sesi_id')).toEqual(['S2']);
    expect(kolomDari(kisiWajib(balasan, 'penilaian'), 'sesi_id')).toEqual(['S2']);
    expect(kolomDari(kisiWajib(balasan, 'skema'), 'skema_id')).toEqual(['SK2']);
  });
});

describe('baris kepala ikut diserahkan', () => {
  // Adaptor menerima kisi lengkap termasuk kepalanya dan mencari kolomnya dari
  // situ. Kisi tanpa kepala membuat baris pertama dibaca sebagai nama kolom,
  // sehingga satu responden hilang dan seluruh kolom salah tafsir.
  for (const [medan, kepala] of [
    ['responden', KEPALA_RESPONDEN],
    ['skema', KEPALA_SKEMA],
    ['penilaian', KEPALA_PENILAIAN],
  ] as [MedanKisi, unknown[]][]) {
    it(`menyertakan kepala kolom sheet ${medan} apa adanya`, () => {
      const { balasan } = panggilRekap();
      expect(kisiWajib(balasan, medan)[0]).toEqual(kepala);
    });
  }
});

describe('isi sel diserahkan apa adanya', () => {
  it('tidak merapatkan spasi ganda pada kriteria maupun kolom_asal', () => {
    // Importer hanya memangkas spasi tepi. Backend yang merapatkan spasi di
    // sini membuat kriteria tidak pernah cocok lagi dengan kolom_asal, dan
    // nilainya hilang dari perhitungan tanpa satu pun peringatan.
    const { balasan } = panggilRekap();
    expect(selKisi(kisiWajib(balasan, 'penilaian'), 1, 'kriteria')).toBe(KOLOM_BERSPASI);
    expect(selKisi(kisiWajib(balasan, 'skema'), 1, 'kolom_asal')).toBe(KOLOM_BERSPASI);
  });

  it('tidak mengubah tipe sel maupun menambah awalan apostrof', () => {
    // Pemaksaan tipe Sheets dan awalan apostrof sudah ditangani adaptor.
    // Backend yang ikut merapikan membuat keduanya saling menimpa.
    const { balasan } = panggilRekap();
    const penilaian = kisiWajib(balasan, 'penilaian');
    expect(selKisi(penilaian, 1, 'nilai')).toBe(1);
    expect(selKisi(penilaian, 1, 'penilaian_id')).toBe(1);
    expect(selKisi(kisiWajib(balasan, 'responden'), 2, 'id')).toBe(ID_BUDI);
  });

  it('tidak menyembunyikan sel kosong', () => {
    // Sel catatan yang kosong adalah `''` di Sheets. Menggantinya dengan null
    // atau membuangnya membuat adaptor melihat baris yang lebih pendek
    // daripada kepalanya.
    const { balasan } = panggilRekap();
    expect(selKisi(kisiWajib(balasan, 'penilaian'), 1, 'catatan')).toBe('');
  });
});

describe('sesi final tetap boleh dibaca', () => {
  it('mengembalikan rekap sesi yang berstatus final', () => {
    // Spec §10 menolak *penulisan* ke sesi final. Sesi yang sudah selesai
    // justru yang paling sering dilaporkan.
    const sesiFinal = [...BARIS_S1];
    sesiFinal[5] = 'final';
    const { balasan } = panggilRekap({ ss: buatRuangKerja({ sesi: [KEPALA_SESI, sesiFinal] }) });
    expect(balasan.ok).toBe(true);
    expect(balasan.kode).toBe('REKAP');
    expect(barisData(kisiWajib(balasan, 'responden'))).toHaveLength(2);
    expect(barisData(kisiWajib(balasan, 'penilaian'))).toHaveLength(1);
  });

  it('mengembalikan rekap tepat setelah finalisasi, dalam satu rangkaian', () => {
    // Fixture berstatus final tidak membuktikan bahwa finalisasi sungguhan
    // membiarkan pembacaan tetap jalan.
    const ss = buatRuangKerja();
    const { balasan: difinalkan } = panggilRekap({
      email: 'admin@kampus.id',
      aksi: 'finalkanSesi',
      ss,
    });
    expect(difinalkan.kode).toBe('DIFINALKAN');
    const { balasan } = panggilRekap({ ss });
    expect(balasan.ok).toBe(true);
    expect(barisData(kisiWajib(balasan, 'responden'))).toHaveLength(2);
  });
});

describe('daftar kosong bukan kegagalan', () => {
  it('mengembalikan Penilaian kosong tanpa error bila penilai belum bekerja', () => {
    // Keadaan normal sebelum penilaian dimulai, bukan kesalahan. Peringatan
    // pun tidak diterbitkan: ia akan muncul pada setiap sesi yang baru dibuka.
    const { balasan } = panggilRekap({
      ss: buatRuangKerja({ penilaian: [KEPALA_PENILAIAN] }),
    });
    expect(balasan.ok).toBe(true);
    expect(barisData(kisiWajib(balasan, 'penilaian'))).toEqual([]);
    expect(kisiWajib(balasan, 'penilaian')[0]).toEqual(KEPALA_PENILAIAN);
    expect(gabungPeringatan(balasan)).not.toMatch(/penilaian/i);
  });

  it('memperingatkan bila sesi ini belum punya satu responden pun', () => {
    // Nol responden berarti impor belum pernah dijalankan untuk sesi ini.
    // Rekap kosong yang diam akan terbaca sebagai "tidak ada yang mengisi".
    const { balasan } = panggilRekap({
      ss: buatRuangKerja({ responden: [KEPALA_RESPONDEN, RESPONDEN_S2_ANI] }),
    });
    expect(balasan.ok).toBe(true);
    expect(barisData(kisiWajib(balasan, 'responden'))).toEqual([]);
    expect(gabungPeringatan(balasan)).toMatch(/responden/i);
  });
});

describe('skema yang tidak ditemukan dibedakan dari sheet yang masih kosong', () => {
  it('menyebut skema_id yang tidak ada di antara baris yang memang ada', () => {
    const { balasan } = panggilRekap({
      ss: buatRuangKerja({ skema: [KEPALA_SKEMA, SKEMA_SK2_C] }),
    });
    expect(balasan.ok).toBe(true);
    expect(barisData(kisiWajib(balasan, 'skema'))).toEqual([]);
    expect(gabungPeringatan(balasan)).toMatch(/"SK1"/);
    expect(gabungPeringatan(balasan)).toMatch(/1 baris/);
  });

  it('menyebut sheet Skema yang belum berisi satu baris pun', () => {
    // Dua keadaan yang menuntut tindakan berbeda: memperbaiki satu baris sesi
    // yang salah tulis, atau menyusun skemanya dari awal. Pesan yang sama
    // untuk keduanya membuat admin mencari di tempat yang keliru.
    const { balasan } = panggilRekap({ ss: buatRuangKerja({ skema: [KEPALA_SKEMA] }) });
    expect(balasan.ok).toBe(true);
    expect(barisData(kisiWajib(balasan, 'skema'))).toEqual([]);
    expect(gabungPeringatan(balasan)).toMatch(/belum berisi satu baris pun/i);
    expect(gabungPeringatan(balasan)).not.toMatch(/1 baris/);
  });

  it('tidak menyapu baris ber-skema_id kosong saat sesi belum menunjuk skema', () => {
    // Menyaring dengan kunci kosong membuat setiap baris yang skema_id-nya
    // juga kosong ikut terbawa, lalu dihitung sebagai butir sesi ini.
    const sesiTanpaSkema = [...BARIS_S1];
    sesiTanpaSkema[3] = '';
    const skemaYatim = [...SKEMA_SK1_A];
    skemaYatim[0] = '';
    const { balasan } = panggilRekap({
      ss: buatRuangKerja({
        sesi: [KEPALA_SESI, sesiTanpaSkema],
        skema: [KEPALA_SKEMA, skemaYatim],
      }),
    });
    expect(balasan.ok).toBe(true);
    expect(balasan.skemaId).toBe('');
    expect(barisData(kisiWajib(balasan, 'skema'))).toEqual([]);
    expect(gabungPeringatan(balasan)).toMatch(/skema_id/i);
  });
});

describe('kolom dinamis jawaban_* dan meta_*', () => {
  it('menyerahkan kolom dinamis apa adanya bila sudah ditulis impor', () => {
    const kepala = [...KEPALA_RESPONDEN, `jawaban_${KOLOM_BERSPASI}`, 'meta_Age'];
    const { balasan } = panggilRekap({
      ss: buatRuangKerja({
        responden: [kepala, [...RESPONDEN_S1_ANI, 'Ya', 21], [...RESPONDEN_S2_ANI, 'Tidak', 21]],
      }),
    });
    expect(balasan.ok).toBe(true);
    const responden = kisiWajib(balasan, 'responden');
    expect(responden[0]).toEqual(kepala);
    expect(selKisi(responden, 1, `jawaban_${KOLOM_BERSPASI}`)).toBe('Ya');
    expect(selKisi(responden, 1, 'meta_Age')).toBe(21);
  });

  it('tidak melempar bila sheet Responden baru punya kolom tetapnya', () => {
    // Impor belum dibangun, jadi inilah bentuk sheet Responden hari ini:
    // kepala tetap hasil penyiapan, tanpa satu pun kolom jawaban.
    const { balasan } = panggilRekap();
    expect(balasan.ok).toBe(true);
    expect(kisiWajib(balasan, 'responden')[0]).toEqual(KEPALA_RESPONDEN);
  });
});

describe('keluarannya bisa dicerna adaptor apa adanya', () => {
  it('terbaca tanpa satu pun masalah oleh ketiga pembaca sheet', () => {
    // Kontrak antara backend dan adaptor. Tanpa uji ini, bentuk yang salah
    // baru ketahuan di lapisan pelaporan, jauh dari sebabnya.
    const { balasan } = panggilRekap();
    const responden = bacaResponden(kisiWajib(balasan, 'responden'));
    const skema = bacaSkema(kisiWajib(balasan, 'skema'));
    const penilaian = bacaPenilaian(kisiWajib(balasan, 'penilaian'));

    expect(responden.masalah).toEqual([]);
    expect(skema.masalah).toEqual([]);
    expect(penilaian.masalah).toEqual([]);

    expect(responden.baris.map((satu) => satu.id)).toEqual([ID_ANI, ID_BUDI]);
    expect(skema.baris).toHaveLength(1);
    expect(skema.baris[0]?.butir.map((satu) => satu.kolomAsal)).toEqual([
      KOLOM_BERSPASI,
      'Butir B',
    ]);
    expect(penilaian.baris.map((satu) => satu.kriteria)).toEqual([KOLOM_BERSPASI]);
  });
});

describe('kebijakan izin tetap berlaku untuk pembacaan', () => {
  it('menolak pembacaan oleh orang di luar daftar tanpa membocorkan satu baris pun', () => {
    const { balasan } = panggilRekap({ email: 'orangluar@gmail.com' });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('ORANG_TIDAK_DIKENAL');
    expect(balasan.responden).toBeUndefined();
    expect(balasan.penilaian).toBeUndefined();
    expect(balasan.skema).toBeUndefined();
  });

  it('menolak pembacaan tanpa identitas', () => {
    const { balasan } = panggilRekap({ email: '' });
    expect(balasan.kode).toBe('TANPA_IDENTITAS');
    expect(balasan.responden).toBeUndefined();
  });

  it('mengizinkan admin membaca rekap', () => {
    const { balasan } = panggilRekap({ email: 'admin@kampus.id' });
    expect(balasan.ok).toBe(true);
    expect(balasan.kode).toBe('REKAP');
  });

  it('menolak sesi yang tidak ada', () => {
    const { balasan } = panggilRekap({ sesiId: 'S9' });
    expect(balasan.kode).toBe('SESI_TIDAK_ADA');
    expect(balasan.responden).toBeUndefined();
  });

  it('menolak sesi_id yang muncul pada dua baris lewat jalur cariSesi_ yang sama', () => {
    // Mencari sesinya sendiri akan mengambil baris pertama dan membaca rekap
    // dengan skema_id yang belum tentu dipilih siapa pun.
    const kembar = [...BARIS_S1];
    kembar[3] = 'SK2';
    const { balasan } = panggilRekap({
      ss: buatRuangKerja({ sesi: [KEPALA_SESI, BARIS_S1, kembar] }),
    });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('SESI_CACAT');
    expect(balasan.skema).toBeUndefined();
  });
});

describe('pembacaan tidak menulis dan tidak menghalangi penulis', () => {
  it('tidak menambah satu baris pun ke sheet Penilaian', () => {
    const { ss } = panggilRekap();
    expect(sheetWajib(ss, 'Penilaian').getLastRow()).toBe(3);
  });

  it('tidak mengambil kunci skrip', () => {
    // Batasan Global 19 mengikat jalur TULIS. Mengunci pembacaan membuat satu
    // rekap 500 responden membekukan seluruh penilai yang sedang bekerja.
    const { lockService } = panggilRekap();
    expect(lockService.lock.jumlahAmbil).toBe(0);
  });
});

describe('ruang kerja yang rusak ditolak, bukan dijawab dengan daftar kosong', () => {
  for (const nama of ['Responden', 'Skema', 'Penilaian']) {
    it(`menolak bila sheet ${nama} tidak ada sama sekali`, () => {
      // Sheet yang hilang bukan "nol baris". Menjawabnya dengan daftar kosong
      // menghasilkan laporan yang mengaku tidak ada peserta, tidak ada butir,
      // atau tidak ada penilaian — ketiganya tampak wajar dan ketiganya bohong.
      const { balasan } = panggilRekap({ ss: buatRuangKerja({ tanpaSheet: [nama] }) });
      expect(balasan.ok).toBe(false);
      expect(balasan.kode).toBe('RUANG_KERJA_TIDAK_LENGKAP');
      expect(balasan.pesan).toContain(nama);
      expect(balasan.responden).toBeUndefined();
      expect(balasan.skema).toBeUndefined();
      expect(balasan.penilaian).toBeUndefined();
    });
  }

  it('menyebut seluruh sheet yang hilang sekaligus', () => {
    const { balasan } = panggilRekap({
      ss: buatRuangKerja({ tanpaSheet: ['Responden', 'Skema'] }),
    });
    expect(balasan.pesan).toContain('Responden');
    expect(balasan.pesan).toContain('Skema');
  });

  it('menolak bila kolom sesi_id sheet Responden tidak ada', () => {
    const kepalaRusak = [...KEPALA_RESPONDEN];
    kepalaRusak[0] = 'sesi';
    const { balasan } = panggilRekap({
      ss: buatRuangKerja({ responden: [kepalaRusak, RESPONDEN_S1_ANI] }),
    });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('REKAP_CACAT');
    expect(balasan.pesan).toContain('Responden');
    expect(balasan.pesan).toContain('sesi_id');
    expect(balasan.responden).toBeUndefined();
  });

  it('menolak bila kolom sesi_id sheet Penilaian muncul dua kali', () => {
    // Kolom kembar berarti yang terlihat admin belum tentu yang dibaca
    // backend; menebak salah satunya menyeret baris sesi lain ke dalam rekap.
    const kepalaKembar = [...KEPALA_PENILAIAN, 'sesi_id'];
    const { balasan } = panggilRekap({
      ss: buatRuangKerja({ penilaian: [kepalaKembar, [...PENILAIAN_S1, 'S2']] }),
    });
    expect(balasan.kode).toBe('REKAP_CACAT');
    expect(balasan.pesan).toContain('Penilaian');
    expect(balasan.pesan).toMatch(/2 kali/);
  });

  it('menolak bila kolom skema_id sheet Skema tidak ada', () => {
    const kepalaRusak = [...KEPALA_SKEMA];
    kepalaRusak[0] = 'skema';
    const { balasan } = panggilRekap({
      ss: buatRuangKerja({ skema: [kepalaRusak, SKEMA_SK1_A] }),
    });
    expect(balasan.kode).toBe('REKAP_CACAT');
    expect(balasan.pesan).toContain('Skema');
  });

  it('menolak bila kolom skema_id sheet Sesi muncul dua kali', () => {
    // Kolom skema_id tidak termasuk kolom wajib `cariSesi_`, jadi sheet ini
    // tetap sah untuk menimbang izin — tetapi rekapnya tidak bisa dibaca
    // tanpa menebak skema mana yang berlaku.
    const kepalaKembar = [...KEPALA_SESI, 'skema_id'];
    const { balasan } = panggilRekap({
      ss: buatRuangKerja({ sesi: [kepalaKembar, [...BARIS_S1, 'SK2']] }),
    });
    expect(balasan.kode).toBe('REKAP_CACAT');
    expect(balasan.pesan).toContain('skema_id');
    expect(balasan.skema).toBeUndefined();
  });

  it('menolak sheet Responden yang sama sekali kosong', () => {
    // Sheet kosong mengembalikan [['']] dari getDataRange, bukan larik kosong.
    // Tanpa penjaga kepala, kisi itu lolos sebagai "nol baris data".
    const { balasan } = panggilRekap({ ss: buatRuangKerja({ responden: [] }) });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('REKAP_CACAT');
  });
});
