import { describe, expect, it } from 'vitest';
import {
  buatContentServicePalsu,
  buatLockServicePalsu,
  buatSessionPalsu,
  buatSpreadsheetAppPalsu,
  buatSpreadsheetPalsu,
  sheetWajib,
  type KeluaranTeksPalsu,
  type SpreadsheetPalsu,
} from '../../apps-script/uji/googlePalsu';
import { muatKode } from '../../apps-script/uji/sandbox';
import { gabungkanSesi, type HasilGabungan, type NilaiSesi, type Pembanding } from '../core/merger';
import { nilaiBerlaku, type BarisPenilaian, type HasilBerlaku } from '../core/penilaian';
import { periksaSkema, type HasilPeriksaSkema } from '../core/periksaSkema';
import { TANDA_KOSONG } from '../core/penyajian';
import { bangunNilaiSesi, type MetaSesi } from '../core/sesi';
import { bangunTabelGabungan, type TabelTampil } from '../core/tabelTampil';
import type { Skema } from '../core/tipe';
import {
  bacaPenilaian,
  bacaProyek,
  bacaResponden,
  bacaSesi,
  bacaSkema,
  type BarisResponden,
  type MasalahBaris,
} from './adaptorSheet';
import { nilaiManualUntukSesi } from './nilaiManual';

/**
 * Tugas 4 — uji kontrak dari `doPost` sampai `TabelTampil`.
 *
 * Empat cacat pernah lolos 657 uji semata-mata karena tak satu pun uji
 * melintasi lebih dari satu modul: tiap modul hijau sendiri-sendiri sementara
 * rantainya putus di tengah. Berkas ini menutup celah itu dengan menjalankan
 * seluruh rantai tanpa memotong jalan:
 *
 * 1. `doPost` sungguhan pada `Kode.gs` yang di-deploy menulis baris `Penilaian`
 * 2. `doPost` sungguhan membacanya kembali lewat aksi `bacaRekap`
 * 3. `bacaResponden` / `bacaSkema` / `bacaPenilaian` menerjemahkan kisinya
 * 4. `nilaiBerlaku` menentukan nilai mana yang berlaku
 * 5. `nilaiManualUntukSesi` menjembatani kuncinya ke bentuk yang dituntut core
 * 6. `bangunNilaiSesi` menghitung, `gabungkanSesi` + `bangunTabelGabungan` menampilkan
 *
 * Tidak ada satu pun `Skema`, `Responden`, atau `BarisPenilaian` yang disusun
 * tangan di sini. Semuanya melewati sheet, karena justru di sambungan-sambungan
 * itulah kerusakan yang dicari bersembunyi.
 */

const PENILAI = 'penilai@kampus.id';
const ADMIN = 'admin@kampus.id';
const DIIMPOR = '2026-09-01T00:00:00.000Z';

/**
 * Nama kolom berspasi ganda. Header Google Form memang sering begitu, dan
 * importer hanya memangkas spasi tepinya — sehingga `kolom_asal` pada sheet
 * `Skema` dan `kriteria` pada sheet `Penilaian` wajib tetap berspasi ganda di
 * sepanjang rantai. Merapatkannya di mana pun memutus pencocokan tanpa jejak.
 */
const KOLOM_BERSPASI = 'Butir  A';
const KOLOM_ESAI = 'Esai';

/** Hash heksadesimal yang memuat huruf; Sheets menyimpannya sebagai teks. */
const ID_ANI = 'a1b2c3d4e5f60718';
/** Hash yang seluruhnya angka, dengan nol di depan yang mudah dimakan Sheets. */
const ID_BUDI = '0012345678901234';
const ID_CITRA = 'c3d4e5f607182939';
const ID_DEWI = 'd4e5f60718293a4b';
const ID_EKA = 'e5f60718293a4b5c';

const KEPALA_PROYEK: unknown[] = [
  'proyek_id',
  'nama',
  'sesi_urut',
  'sesi_awal',
  'sesi_akhir',
  'dibuat_pada',
];

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
  `jawaban_${KOLOM_BERSPASI}`,
  'meta_Prodi',
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

const BARIS_PROYEK: unknown[] = ['P1', 'Evaluasi Pelatihan', 'S1,S2', 'S1', 'S2', DIIMPOR];

/** Proyek tanpa pasangan pembanding: §6.5 menuntut kolom selisih tidak dibuat. */
const BARIS_PROYEK_SATU_SESI: unknown[] = ['P1', 'Evaluasi Pelatihan', 'S1', '', '', DIIMPOR];

const BARIS_S1: unknown[] = ['S1', 'P1', 'Pre-Test', 'SK1', 'indeks', 'berjalan', PENILAI, ADMIN];
const BARIS_S2: unknown[] = ['S2', 'P1', 'Post-Test', 'SK1', 'indeks', 'berjalan', PENILAI, ADMIN];

/**
 * Dua butir berbobot sama: satu dijawab responden, satu diisi penilai.
 * Bentuk itu dipilih supaya setiap angka di bawah berbeda untuk setiap cara
 * rantainya bisa putus — bukan sekadar "tidak sama dengan 100".
 */
const SKEMA_BUTIR_A: unknown[] = [
  'SK1',
  KOLOM_BERSPASI,
  'Butir A',
  'kemudahan',
  'peta-opsi',
  '{"peta":{"Ya":1,"Tidak":0},"skorMaks":1}',
  1,
  1,
  'abaikan',
];

const SKEMA_ESAI: unknown[] = [
  'SK1',
  KOLOM_ESAI,
  'Esai bebas',
  'kemudahan',
  'manual',
  '{"min":0,"maks":10}',
  10,
  1,
  'abaikan',
];

const RESPONDEN: unknown[][] = [
  ['S1', ID_ANI, 'ani@kampus.id', 'Ani', 'lengkap', DIIMPOR, 'Ya', 'Statistika'],
  ['S1', ID_BUDI, 'budi@kampus.id', 'Budi', 'lengkap', DIIMPOR, 'Ya', 'Statistika'],
  ['S1', ID_CITRA, 'citra@kampus.id', 'Citra', 'lengkap', DIIMPOR, 'Ya', 'Biologi'],
  ['S1', ID_DEWI, 'dewi@kampus.id', 'Dewi', 'kosong', DIIMPOR, '', 'Biologi'],
  ['S1', ID_EKA, 'eka@kampus.id', 'Eka', 'lengkap', DIIMPOR, 'Ya', 'Statistika'],
  ['S2', ID_ANI, 'ani@kampus.id', 'Ani', 'lengkap', DIIMPOR, 'Ya', 'Statistika'],
];

interface Tulisan {
  sesiId: string;
  respondenId: string;
  kriteria: string;
  nilai?: number;
  catatan?: string;
}

/**
 * Urutan penulisan menentukan `penilaian_id`, dan `penilaian_id` menentukan
 * nilai mana yang berlaku (C2). Karena itu daftarnya ditulis berurutan dan
 * tidak boleh diacak: baris 4 harus mengoreksi baris 3, bukan sebaliknya.
 */
const TULISAN: Tulisan[] = [
  { sesiId: 'S1', respondenId: ID_ANI, kriteria: KOLOM_ESAI, nilai: 5 },
  // Catatan susulan tanpa angka (C1). Nilainya 5 harus bertahan.
  { sesiId: 'S1', respondenId: ID_ANI, kriteria: KOLOM_ESAI, catatan: 'Argumennya runtut.' },
  { sesiId: 'S1', respondenId: ID_BUDI, kriteria: KOLOM_ESAI, nilai: 2 },
  // Koreksi yang ditulis belakangan (C2). Yang berlaku 8, bukan 2.
  { sesiId: 'S1', respondenId: ID_BUDI, kriteria: KOLOM_ESAI, nilai: 8 },
  { sesiId: 'S2', respondenId: ID_ANI, kriteria: KOLOM_ESAI, nilai: 6 },
  // Di luar rentang 0–10 (Batasan Global 22): butirnya dikeluarkan, tidak dijepit.
  { sesiId: 'S1', respondenId: ID_CITRA, kriteria: KOLOM_ESAI, nilai: 70 },
  // Koreksi terhadap skor otomatis pada kolom berspasi ganda (D2 + cacat B4).
  { sesiId: 'S1', respondenId: ID_BUDI, kriteria: KOLOM_BERSPASI, nilai: 0 },
  // Dua catatan yang TIDAK pernah didahului angka. Bentuk inilah yang membuat
  // kekeliruan "catatan-saja dibaca sebagai nol" terlihat sampai ke tabel:
  // pada Ani angka 5 menutupinya, di sini tidak ada yang menutupi. Penilai yang
  // sekadar menitip keterangan tidak boleh menjatuhkan butirnya menjadi 0.
  { sesiId: 'S1', respondenId: ID_EKA, kriteria: KOLOM_ESAI, catatan: 'Berkasnya belum diunggah.' },
  { sesiId: 'S1', respondenId: ID_DEWI, kriteria: KOLOM_ESAI, catatan: 'Peserta tidak hadir.' },
];

interface Balasan {
  ok: boolean;
  kode: string;
  pesan: string;
  sesiId?: string;
  skemaId?: string;
  penilaianId?: number;
  responden?: unknown[][];
  skema?: unknown[][];
  penilaian?: unknown[][];
  peringatan?: string[];
}

interface OpsiRuangKerja {
  proyek?: unknown[][];
  sesi?: unknown[][];
  responden?: unknown[][];
  skema?: unknown[][];
}

function buatRuangKerja(opsi: OpsiRuangKerja = {}): SpreadsheetPalsu {
  return buatSpreadsheetPalsu({
    Proyek: opsi.proyek === undefined ? [KEPALA_PROYEK, BARIS_PROYEK] : opsi.proyek,
    Sesi: opsi.sesi === undefined ? [KEPALA_SESI, BARIS_S1, BARIS_S2] : opsi.sesi,
    Responden: opsi.responden === undefined ? [KEPALA_RESPONDEN, ...RESPONDEN] : opsi.responden,
    Skema: opsi.skema === undefined ? [KEPALA_SKEMA, SKEMA_BUTIR_A, SKEMA_ESAI] : opsi.skema,
    // Kosong selain kepala: setiap baris di bawah ini ditulis backend sungguhan.
    Penilaian: [KEPALA_PENILAIAN],
  });
}

function panggilDoPost(ss: SpreadsheetPalsu, email: string, muatan: unknown): Balasan {
  const konteks = muatKode({
    Session: buatSessionPalsu(email),
    SpreadsheetApp: buatSpreadsheetAppPalsu(ss),
    LockService: buatLockServicePalsu(),
    ContentService: buatContentServicePalsu(),
  });

  const doPost = konteks.doPost;
  if (typeof doPost !== 'function') throw new Error('Kode.gs tidak mengekspos doPost.');

  const keluaran = (doPost as (e: unknown) => KeluaranTeksPalsu)({
    postData: { contents: JSON.stringify(muatan) },
  });
  return JSON.parse(keluaran.getContent()) as Balasan;
}

/**
 * Penolakan backend dihentikan di sini, bukan dibiarkan muncul sebagai angka
 * yang salah tiga langkah kemudian. Pesan `Kode.gs` memang ditulis untuk
 * mengajari (Batasan Global 10), jadi ia diteruskan apa adanya.
 */
function tulisPenilaian(ss: SpreadsheetPalsu, daftar: Tulisan[]): Balasan[] {
  return daftar.map((satu) => {
    const muatan: Record<string, unknown> = {
      respondenId: satu.respondenId,
      kriteria: satu.kriteria,
    };
    if (satu.nilai !== undefined) muatan['nilai'] = satu.nilai;
    if (satu.catatan !== undefined) muatan['catatan'] = satu.catatan;

    const balasan = panggilDoPost(ss, PENILAI, {
      aksi: 'simpanPenilaian',
      sesiId: satu.sesiId,
      muatan,
    });
    if (!balasan.ok) {
      throw new Error(
        `Backend menolak penilaian ${satu.respondenId}/${satu.kriteria} pada ${satu.sesiId} ` +
          `dengan kode ${balasan.kode}: ${balasan.pesan}`,
      );
    }
    return balasan;
  });
}

function kisiSheet(ss: SpreadsheetPalsu, nama: string): unknown[][] {
  return sheetWajib(ss, nama).getDataRange().getValues();
}

function kisiWajib(balasan: Balasan, medan: 'responden' | 'skema' | 'penilaian'): unknown[][] {
  const kisi = balasan[medan];
  if (kisi === undefined) {
    throw new Error(`Balasan bacaRekap tidak memuat kisi "${medan}": ${JSON.stringify(balasan)}`);
  }
  return kisi;
}

interface SesiRakit {
  meta: MetaSesi;
  responden: BarisResponden[];
  skema: Skema;
  /** `periksaSkema` dijalankan dengan responden sungguhan, bukan daftar kosong. */
  periksa: HasilPeriksaSkema;
  masalah: MasalahBaris[];
  peringatanBackend: string[];
}

interface Rakitan {
  tulisan: Balasan[];
  perSesi: SesiRakit[];
  berlaku: Map<string, HasilBerlaku>;
  nilaiSesi: NilaiSesi[];
  gabungan: HasilGabungan;
  tabel: TabelTampil;
}

function sesiRakit(sesi: SesiRakit[], sesiId: string): SesiRakit {
  const ketemu = sesi.find((satu) => satu.meta.sesiId === sesiId);
  if (ketemu === undefined) throw new Error(`Rakitan tidak memuat sesi "${sesiId}".`);
  return ketemu;
}

function nilaiSesiWajib(daftar: NilaiSesi[], sesiId: string): NilaiSesi {
  const ketemu = daftar.find((satu) => satu.sesiId === sesiId);
  if (ketemu === undefined) throw new Error(`Rakitan tidak memuat NilaiSesi "${sesiId}".`);
  return ketemu;
}

function skemaTunggal(daftar: Skema[], skemaId: string, sesiId: string): Skema {
  const cocok = daftar.filter((satu) => satu.skemaId === skemaId);
  const [pertama] = cocok;
  if (cocok.length !== 1 || pertama === undefined) {
    throw new Error(
      `Rekap sesi "${sesiId}" menghasilkan ${cocok.length} skema bernama "${skemaId}", ` +
        'padahal satu sesi memakai tepat satu skema.',
    );
  }
  return pertama;
}

/**
 * Rantai rekap yang sesungguhnya, dirakit sekali di satu tempat.
 *
 * Baris `Penilaian` seluruh sesi digabung **sebelum** `nilaiBerlaku` dipanggil,
 * persis seperti rekap setingkat proyek. Memanggilnya sekali per sesi akan
 * menyembunyikan seluruh gunanya `sesiId` di dalam kunci: setiap pemanggilan
 * lalu hanya melihat satu sesi, sehingga nilai Post-Test tidak punya kesempatan
 * menimpa nilai Pre-Test dan kekeliruan itu tidak akan pernah terlihat.
 */
function rakitRekap(ss: SpreadsheetPalsu): Rakitan {
  const proyek = bacaProyek(kisiSheet(ss, 'Proyek'));
  const sesi = bacaSesi(kisiSheet(ss, 'Sesi'));
  expect(sesi.masalah, 'sheet Sesi fixture ini tidak boleh bermasalah').toEqual([]);

  const perSesi: SesiRakit[] = [];
  const semuaPenilaian: BarisPenilaian[] = [];

  for (const satu of sesi.baris) {
    const balasan = panggilDoPost(ss, ADMIN, {
      aksi: 'bacaRekap',
      sesiId: satu.sesiId,
      muatan: {},
    });
    if (!balasan.ok) {
      throw new Error(`bacaRekap "${satu.sesiId}" ditolak ${balasan.kode}: ${balasan.pesan}`);
    }

    const responden = bacaResponden(kisiWajib(balasan, 'responden'));
    const skema = bacaSkema(kisiWajib(balasan, 'skema'));
    const penilaian = bacaPenilaian(kisiWajib(balasan, 'penilaian'));
    semuaPenilaian.push(...penilaian.baris);

    const dipakai = skemaTunggal(skema.baris, satu.skemaId, satu.sesiId);
    perSesi.push({
      meta: { sesiId: satu.sesiId, namaSesi: satu.nama },
      responden: responden.baris,
      skema: dipakai,
      // Titipan tinjauan Tugas 2: `bacaSkema` memanggil `periksaSkema` dengan
      // daftar responden KOSONG, sehingga `kolom-tidak-ada` mustahil muncul di
      // sana. Jalur rekap wajib menjalankannya ulang dengan responden yang
      // sebenarnya; tanpa itu, butir yang kolomnya salah eja terhitung kosong
      // dan nilainya naik tanpa satu pun peringatan.
      periksa: periksaSkema(dipakai, responden.baris),
      masalah: [...responden.masalah, ...skema.masalah, ...penilaian.masalah],
      peringatanBackend: balasan.peringatan === undefined ? [] : balasan.peringatan,
    });
  }

  const berlaku = nilaiBerlaku(semuaPenilaian);
  const nilaiSesi = perSesi.map((satu) =>
    bangunNilaiSesi(
      satu.meta,
      satu.responden,
      satu.skema,
      nilaiManualUntukSesi(berlaku, satu.meta.sesiId),
    ),
  );

  const pembanding = pembandingProyek(proyek.baris[0]);
  const gabungan = gabungkanSesi(nilaiSesi, pembanding);
  const tabel = bangunTabelGabungan(gabungan, {
    desimal: 1,
    anonim: false,
    adaPembanding: pembanding !== undefined,
  });

  return { tulisan: [], perSesi, berlaku, nilaiSesi, gabungan, tabel };
}

/** §6.5: tanpa pasangan pembanding, kolom selisih tidak dibuat sama sekali. */
function pembandingProyek(
  baris: { sesiAwal: string | null; sesiAkhir: string | null } | undefined,
): Pembanding | undefined {
  if (baris === undefined || baris.sesiAwal === null || baris.sesiAkhir === null) return undefined;
  return { awal: baris.sesiAwal, akhir: baris.sesiAkhir };
}

/**
 * Rantai bawaan dijalankan sekali lalu dipakai bersama. Ia memuat sembilan
 * panggilan `doPost` sungguhan — tujuh penulisan dan dua pembacaan — dan
 * mengulangnya per uji hanya menambah waktu tanpa menambah satu pun bukti,
 * karena tak satu uji pun mengubah ruang kerjanya.
 */
let bawaan: Rakitan | null = null;

function rekapBawaan(): Rakitan {
  if (bawaan === null) {
    const ss = buatRuangKerja();
    const tulisan = tulisPenilaian(ss, TULISAN);
    bawaan = { ...rakitRekap(ss), tulisan };
  }
  return bawaan;
}

function barisTabel(tabel: TabelTampil, id: string): string[] {
  const kolomId = tabel.kolom.indexOf('ID');
  const ketemu = tabel.baris.find((satu) => satu[kolomId] === id);
  if (ketemu === undefined) {
    throw new Error(`Tabel "${tabel.judul}" tidak memuat responden "${id}".`);
  }
  return ketemu;
}

function selTabel(tabel: TabelTampil, id: string, namaKolom: string): string {
  const kolom = tabel.kolom.indexOf(namaKolom);
  if (kolom < 0) {
    throw new Error(
      `Tabel "${tabel.judul}" tidak punya kolom "${namaKolom}". Yang ada: ${tabel.kolom.join(', ')}.`,
    );
  }
  const sel = barisTabel(tabel, id)[kolom];
  if (sel === undefined) {
    throw new Error(`Sel "${namaKolom}" responden "${id}" tidak ada pada tabel.`);
  }
  return sel;
}

describe('rantai doPost sampai tabel rekap', () => {
  it('menerima seluruh penulisan dan menomorinya berurutan', () => {
    // Penjaga: bila backend menolak salah satunya, seluruh angka di bawah
    // berubah karena alasan yang tidak ada hubungannya dengan perhitungan.
    const { tulisan } = rekapBawaan();

    expect(tulisan.map((satu) => satu.kode)).toEqual(Array(TULISAN.length).fill('TERSIMPAN'));
    expect(tulisan.map((satu) => satu.penilaianId)).toEqual(TULISAN.map((_, urutan) => urutan + 1));
  });

  it('melewati adaptor tanpa satu baris pun bermasalah', () => {
    const { perSesi } = rekapBawaan();

    for (const satu of perSesi) {
      expect(satu.masalah, `sesi ${satu.meta.sesiId}`).toEqual([]);
      expect(satu.peringatanBackend, `sesi ${satu.meta.sesiId}`).toEqual([]);
      expect(satu.periksa.masalah, `sesi ${satu.meta.sesiId}`).toEqual([]);
    }
  });

  it('nilai manual yang ditulis penilai muncul di tabel rekap', () => {
    // Ani menjawab "Ya" (1 dari 1) dan penilai memberi 5 dari 10 untuk esainya:
    //   (1*(1/1) + 1*(5/10)) / 2 * 100 = 75
    // Bila nilai manualnya tidak pernah sampai ke perhitungan, esainya menjadi
    // butir menunggu dan penyebutnya mengecil menjadi satu butir -> 100.
    const { tabel, nilaiSesi } = rekapBawaan();

    expect(selTabel(tabel, ID_ANI, 'Pre-Test')).toBe('75,0');
    expect(nilaiSesiWajib(nilaiSesi, 'S1').nilai.get(ID_ANI)).toBe(75);
  });

  it('catatan susulan tidak menghapus angka yang sudah ditulis', () => {
    // C1 dibuktikan lintas modul: `Kode.gs` menulis sel nilai kosong untuk baris
    // catatan-saja, `bacaPenilaian` menerjemahkannya menjadi null, `nilaiBerlaku`
    // menyelesaikan nilai dan catatan secara terpisah, dan penjembatan menolak
    // memasukkan null sebagai nol. Patahnya satu saja mengubah 75 menjadi 100
    // (angka hilang) atau 50 (angka berubah menjadi nol).
    const { tabel, berlaku } = rekapBawaan();
    const entri = berlaku.get(`S1|${ID_ANI}|${KOLOM_ESAI}`);

    expect(entri?.nilai).toBe(5);
    expect(entri?.catatan).toBe('Argumennya runtut.');
    expect(entri?.nilaiDari?.penilaianId).toBe(1);
    expect(entri?.catatanDari?.penilaianId).toBe(2);
    expect(selTabel(tabel, ID_ANI, 'Pre-Test')).toBe('75,0');
    expect(selTabel(tabel, ID_ANI, 'Pre-Test')).not.toBe('100,0');
  });

  it('koreksi yang ditulis belakangan yang berlaku, bukan yang pertama', () => {
    // C2. Budi dinilai 2 lalu dikoreksi menjadi 8, dan skor otomatis butir
    // pertamanya dikoreksi menjadi 0:
    //   (1*(0/1) + 1*(8/10)) / 2 * 100 = 40
    // Bila yang pertama menang: (0 + 0,2) / 2 * 100 = 20.
    const { tabel, berlaku, nilaiSesi } = rekapBawaan();

    expect(berlaku.get(`S1|${ID_BUDI}|${KOLOM_ESAI}`)?.nilai).toBe(8);
    expect(selTabel(tabel, ID_BUDI, 'Pre-Test')).toBe('40,0');
    expect(selTabel(tabel, ID_BUDI, 'Pre-Test')).not.toBe('20,0');
    expect(nilaiSesiWajib(nilaiSesi, 'S1').dikoreksi.get(ID_BUDI)).toEqual([KOLOM_BERSPASI]);
  });

  it('kriteria berspasi ganda tetap cocok dengan kolom_asal', () => {
    // Cacat B4. `Kode.gs` memangkas spasi tepi saja (D7); merapatkan spasi di
    // mana pun di sepanjang rantai membuat kriteria "Butir  A" menjadi
    // "Butir A", yang tidak cocok dengan satu butir pun. Koreksinya lalu
    // diabaikan diam-diam dan Budi bernilai (1 + 0,8) / 2 * 100 = 90.
    const { berlaku, tabel, perSesi } = rekapBawaan();

    expect([...berlaku.keys()]).toContain(`S1|${ID_BUDI}|${KOLOM_BERSPASI}`);
    expect(sesiRakit(perSesi, 'S1').skema.butir.map((satu) => satu.kolomAsal)).toContain(
      KOLOM_BERSPASI,
    );
    expect(selTabel(tabel, ID_BUDI, 'Pre-Test')).not.toBe('90,0');
    expect(selTabel(tabel, ID_BUDI, 'Pre-Test')).toBe('40,0');
  });

  it('nilai manual di luar rentang menghasilkan peringatan, bukan angka yang dijepit', () => {
    // Citra diberi 70 pada rubrik 0–10. Butirnya dikeluarkan sehingga nilainya
    // 100 dari butir yang tersisa; dijepit ke 10 juga menghasilkan 100, jadi
    // angkanya tidak membedakan apa pun — peringatannya yang membedakan.
    const { gabungan, nilaiSesi } = rekapBawaan();
    const baris = gabungan.baris.find((satu) => satu.id === ID_CITRA);

    expect(nilaiSesiWajib(nilaiSesi, 'S1').peringatan.get(ID_CITRA)?.join(' ')).toMatch(/rentang/i);
    expect(baris?.peringatanPerSesi['S1']?.join(' ')).toMatch(/70/);
  });

  it('butir yang menunggu penilaian tidak menjadi nol di tabel', () => {
    // Dua keadaan yang mudah tertukar. Eka sudah menjawab butir otomatisnya dan
    // hanya esainya yang menunggu, jadi ia TETAP punya nilai — selnya bukan
    // tanda kosong. Dewi tidak menjawab apa pun dan esainya belum dinilai,
    // sehingga tidak ada satu butir pun yang terhitung: di situ "0,0" berarti
    // angka yang dikarang.
    //
    // Keduanya sudah menerima catatan dari penilai tanpa satu angka pun, yaitu
    // bentuk yang paling mudah terbaca sebagai nol di sepanjang rantai: sel
    // nilai yang kosong di Sheets, `null` di adaptor, dan tidak boleh menjadi
    // anggota peta nilai manual sama sekali.
    const { tabel, berlaku, nilaiSesi } = rekapBawaan();
    const s1 = nilaiSesiWajib(nilaiSesi, 'S1');

    expect(berlaku.get(`S1|${ID_EKA}|${KOLOM_ESAI}`)?.nilai).toBeNull();
    expect(berlaku.get(`S1|${ID_EKA}|${KOLOM_ESAI}`)?.catatan).toBe('Berkasnya belum diunggah.');
    expect(s1.menunggu.get(ID_EKA)).toBe(1);
    expect(selTabel(tabel, ID_EKA, 'Pre-Test')).toBe('100,0');
    expect(selTabel(tabel, ID_EKA, 'Pre-Test')).not.toBe('50,0');
    expect(selTabel(tabel, ID_EKA, 'Pre-Test')).not.toBe(TANDA_KOSONG);

    expect(berlaku.get(`S1|${ID_DEWI}|${KOLOM_ESAI}`)?.nilai).toBeNull();
    expect(s1.menunggu.get(ID_DEWI)).toBe(1);
    expect(s1.nilai.get(ID_DEWI)).toBeNull();
    expect(selTabel(tabel, ID_DEWI, 'Pre-Test')).toBe(TANDA_KOSONG);
    expect(selTabel(tabel, ID_DEWI, 'Pre-Test')).not.toBe('0,0');
    expect(selTabel(tabel, ID_DEWI, 'Status Pre-Test')).toBe('ikut:kurang 1');
  });

  it('memisahkan nilai dua sesi untuk responden yang sama', () => {
    // Satu proyek, dua sesi, skema yang sama. Kunci nilai berlaku memuat
    // `sesiId` justru untuk ini: tanpa itu baris Post-Test menimpa baris
    // Pre-Test, Ani Pre-Test menjadi 80, Post-Test kehilangan nilai manualnya
    // sehingga menjadi 100, dan kolom selisih memuat angka yang tidak pernah
    // terjadi.
    const { tabel, nilaiSesi } = rekapBawaan();

    expect(nilaiSesiWajib(nilaiSesi, 'S2').nilai.get(ID_ANI)).toBe(80);
    expect(selTabel(tabel, ID_ANI, 'Pre-Test')).toBe('75,0');
    expect(selTabel(tabel, ID_ANI, 'Post-Test')).toBe('80,0');
    expect(selTabel(tabel, ID_ANI, 'Selisih')).toBe('5,0');
    expect(nilaiSesiWajib(nilaiSesi, 'S2').menunggu.get(ID_ANI)).toBeUndefined();
  });

  it('membawa identitas dan kolom meta sampai ke tabel', () => {
    // Pengenal yang seluruhnya angka dengan nol di depan adalah bentuk yang
    // paling mudah dirusak Sheets. Bila ia rusak, barisnya tidak hilang —
    // ia muncul sebagai responden yang tidak dikenal siapa pun.
    const { tabel } = rekapBawaan();

    expect(selTabel(tabel, ID_BUDI, 'Email')).toBe('budi@kampus.id');
    expect(selTabel(tabel, ID_BUDI, 'Nama')).toBe('Budi');
    expect(selTabel(tabel, ID_BUDI, 'Prodi')).toBe('Statistika');
    expect(selTabel(tabel, ID_ANI, 'Status Gabungan')).toBe('lengkap');
    expect(selTabel(tabel, ID_BUDI, 'Status Gabungan')).toBe('sebagian:Pre-Test');
    expect(selTabel(tabel, ID_BUDI, 'Selisih')).toBe(TANDA_KOSONG);
  });
});

describe('periksaSkema pada jalur rekap melihat kolom yang tidak ada', () => {
  /**
   * Titipan dari tinjauan Tugas 2, dibuktikan di rantai yang sesungguhnya.
   *
   * `kolom_asal` ditulis "q1" sementara kepala kolom Responden berbunyi
   * "jawaban_Q1". Pencocokan jawaban peka huruf besar-kecil, jadi butir itu
   * terbaca kosong — dan dengan `perlakuan_kosong: "abaikan"` ia menghilang
   * dari pembilang maupun penyebut. Yang tersisa hanyalah butir kedua, yang
   * dijawab benar, sehingga respondennya bernilai 100 tanpa satu peringatan pun.
   */
  const KEPALA_BEDA_HURUF: unknown[] = [
    'sesi_id',
    'id',
    'email',
    'nama',
    'status_kelengkapan',
    'diimpor_pada',
    'jawaban_Q1',
    'jawaban_q2',
  ];

  const PETA_YA_TIDAK = '{"peta":{"Ya":1,"Tidak":0},"skorMaks":1}';

  function ruangKerjaBedaHuruf(): SpreadsheetPalsu {
    return buatRuangKerja({
      proyek: [KEPALA_PROYEK, BARIS_PROYEK_SATU_SESI],
      sesi: [KEPALA_SESI, BARIS_S1],
      responden: [
        KEPALA_BEDA_HURUF,
        ['S1', ID_ANI, 'ani@kampus.id', 'Ani', 'lengkap', DIIMPOR, 'Ya', 'Ya'],
      ],
      skema: [
        KEPALA_SKEMA,
        ['SK1', 'q1', 'Pertanyaan 1', 'kemudahan', 'peta-opsi', PETA_YA_TIDAK, 1, 1, 'abaikan'],
        ['SK1', 'q2', 'Pertanyaan 2', 'kemudahan', 'peta-opsi', PETA_YA_TIDAK, 1, 1, 'abaikan'],
      ],
    });
  }

  it('bacaSkema sendirian tidak bisa melihatnya', () => {
    // Bukan keluhan terhadap `bacaSkema`: ia memang hanya memegang sheet Skema,
    // dan kolom yang ada atau tidak ada hanya terlihat dari sheet Responden.
    // Justru karena itu pemanggilnya yang wajib memeriksanya lagi.
    const rakitan = rakitRekap(ruangKerjaBedaHuruf());
    const s1 = sesiRakit(rakitan.perSesi, 'S1');

    expect(s1.masalah).toEqual([]);
    expect(s1.skema.butir.map((satu) => satu.kolomAsal)).toEqual(['q1', 'q2']);
  });

  it('periksaSkema dengan responden sungguhan melaporkan kolom-tidak-ada', () => {
    const rakitan = rakitRekap(ruangKerjaBedaHuruf());
    const s1 = sesiRakit(rakitan.perSesi, 'S1');

    expect(s1.periksa.masalah.map((satu) => satu.jenis)).toEqual(['kolom-tidak-ada']);
    expect(s1.periksa.masalah.map((satu) => satu.kolomAsal)).toEqual(['q1']);
    expect(s1.periksa.bolehDisimpan).toBe(false);
  });

  it('angka yang dihasilkan tampak sempurna justru karena setengah butir hilang', () => {
    // Inilah sebabnya pemeriksaannya tidak boleh dilewati: tanpa `periksaSkema`,
    // satu-satunya jejak kerusakan ini adalah nilai 100 yang tampak wajar.
    const rakitan = rakitRekap(ruangKerjaBedaHuruf());
    const s1 = nilaiSesiWajib(rakitan.nilaiSesi, 'S1');

    expect(s1.nilai.get(ID_ANI)).toBe(100);
    expect(s1.peringatan.get(ID_ANI)).toBeUndefined();
    expect(selTabel(rakitan.tabel, ID_ANI, 'Pre-Test')).toBe('100,0');
    // Proyek tanpa pasangan pembanding: kolom selisih tidak dibuat (§6.5).
    expect(rakitan.tabel.kolom).not.toContain('Selisih');
  });
});

describe('skema yang terbelah dua ejaan tidak hilang tanpa suara', () => {
  /**
   * Sesi menunjuk `SK1`; butir pertamanya tertulis di bawah `SK1` dan butir
   * esainya di bawah `sk1`. Karena `bacaRekap_` menyaring dengan pencocokan
   * persis (D9, §6.4), baris `sk1` **tidak pernah sampai ke adaptor** — jadi
   * peringatan beda ejaan di `bacaSkema` mustahil menyala di jalur yang
   * sesungguhnya. Satu-satunya lapisan yang masih melihat kedua ejaan
   * bersamaan adalah backend, dan di situlah peringatannya wajib lahir.
   *
   * Angkanya dipilih supaya kerusakannya punya bentuk: Ani menjawab "Ya"
   * (1/1) dan esainya dinilai 0 (0/10), sehingga skema utuh bernilai 50 dan
   * skema yang terbelah bernilai 100 — tampak sempurna justru karena separuh
   * instrumennya hilang.
   */
  const SKEMA_ESAI_EJAAN_LAIN: unknown[] = ['sk1', ...SKEMA_ESAI.slice(1)];

  const ANI_SAJA: unknown[][] = [
    ['S1', ID_ANI, 'ani@kampus.id', 'Ani', 'lengkap', DIIMPOR, 'Ya', 'Statistika'],
  ];

  const ESAI_NOL: Tulisan[] = [
    { sesiId: 'S1', respondenId: ID_ANI, kriteria: KOLOM_ESAI, nilai: 0 },
  ];

  function rakitSkema(barisEsai: unknown[]): Rakitan {
    const ss = buatRuangKerja({
      proyek: [KEPALA_PROYEK, BARIS_PROYEK_SATU_SESI],
      sesi: [KEPALA_SESI, BARIS_S1],
      responden: [KEPALA_RESPONDEN, ...ANI_SAJA],
      skema: [KEPALA_SKEMA, SKEMA_BUTIR_A, barisEsai],
    });
    tulisPenilaian(ss, ESAI_NOL);
    return rakitRekap(ss);
  }

  it('skema yang ejaannya seragam menghasilkan kedua butirnya', () => {
    // Pembanding. Tanpa baris ini, angka 100 di bawah tidak punya arti apa pun.
    const s1 = sesiRakit(rakitSkema(SKEMA_ESAI).perSesi, 'S1');

    expect(s1.skema.butir.map((satu) => satu.kolomAsal)).toEqual([KOLOM_BERSPASI, KOLOM_ESAI]);
    expect(nilaiSesiWajib(rakitSkema(SKEMA_ESAI).nilaiSesi, 'S1').nilai.get(ID_ANI)).toBe(50);
  });

  it('ejaan kedua membuat butir esainya tidak pernah sampai ke adaptor', () => {
    const rakitan = rakitSkema(SKEMA_ESAI_EJAAN_LAIN);
    const s1 = sesiRakit(rakitan.perSesi, 'S1');

    expect(s1.skema.butir.map((satu) => satu.kolomAsal)).toEqual([KOLOM_BERSPASI]);
    // Bukan keluhan terhadap adaptor: baris "sk1" memang tidak pernah
    // diserahkan kepadanya, jadi ia tidak punya apa pun untuk dibandingkan.
    expect(s1.masalah).toEqual([]);
  });

  it('nilainya tampak sempurna justru karena separuh instrumennya hilang', () => {
    const rakitan = rakitSkema(SKEMA_ESAI_EJAAN_LAIN);

    expect(nilaiSesiWajib(rakitan.nilaiSesi, 'S1').nilai.get(ID_ANI)).toBe(100);
    expect(selTabel(rakitan.tabel, ID_ANI, 'Pre-Test')).toBe('100,0');
  });

  it('backend memperingatkannya dengan menyebut kedua ejaannya', () => {
    // Inilah satu-satunya jejak kerusakan di atas. Tanpa peringatan ini,
    // angka 100 adalah seluruh yang dilihat siapa pun.
    const s1 = sesiRakit(rakitSkema(SKEMA_ESAI_EJAAN_LAIN).perSesi, 'S1');
    const pesan = s1.peringatanBackend.join(' | ');

    expect(pesan).toContain('"sk1"');
    expect(pesan).toContain('"SK1"');
    expect(pesan).toMatch(/separuh instrumen/i);
  });

  it('tidak memperingatkan apa pun bila ejaannya seragam', () => {
    const s1 = sesiRakit(rakitSkema(SKEMA_ESAI).perSesi, 'S1');
    expect(s1.peringatanBackend).toEqual([]);
  });
});
