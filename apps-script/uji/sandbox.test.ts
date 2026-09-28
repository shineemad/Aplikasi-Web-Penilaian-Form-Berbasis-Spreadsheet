import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buatContentServicePalsu,
  buatLockPalsu,
  buatLockServicePalsu,
  buatSessionPalsu,
  buatSpreadsheetPalsu,
  sheetWajib,
  type KeluaranTeksPalsu,
  type SheetPalsu,
  type SpreadsheetPalsu,
} from './googlePalsu';
import { bacaSumberKode, muatKode } from './sandbox';

interface Balasan {
  ok: boolean;
  kode: string;
  pesan: string;
}

/**
 * Kolom peran ikut dilengkapi karena Tugas 2 memeriksa izin sebelum aksi:
 * pemanggil yang tidak terdaftar akan ditolak sebagai orang tak dikenal dan
 * tidak pernah sampai ke pemeriksaan aksi.
 */
const SESI_BAWAAN: unknown[][] = [
  ['sesi_id', 'proyek_id', 'nama', 'skema_id', 'mode', 'status', 'penilai', 'admin'],
  ['S1', 'P1', 'Post-Test', 'SK1', 'indeks', 'berjalan', 'penilai@kampus.id', 'admin@kampus.id'],
];

const KEPALA_PENILAIAN: unknown[] = [
  'penilaian_id',
  'sesi_id',
  'responden_id',
  'kriteria',
  'nilai',
];

function indeksKolom(kisi: unknown[][], nama: string): number {
  const kepala = kisi[0];
  const indeks = kepala === undefined ? -1 : kepala.indexOf(nama);
  if (indeks < 0) throw new Error(`Kolom ${nama} tidak ada pada fixture.`);
  return indeks + 1;
}

/** Kode.gs berjalan tanpa tipe, jadi argumen apa pun bisa sampai ke getRange. */
const getRangeTanpaTipe = (sheet: SheetPalsu): ((baris: unknown, kolom?: unknown) => unknown) =>
  sheet.getRange as unknown as (baris: unknown, kolom?: unknown) => unknown;

/**
 * Apps Script memuat berkas sebagai skrip global. Pola tunggal `^\s*(import|export)\s`
 * melewatkan bentuk tanpa spasi seperti `import{a}from'x'` — bentuk yang lolos di
 * sini adalah lubang pada penjaga, bukan kode yang sah.
 */
const POLA_MODUL: RegExp[] = [
  /^\s*import\s*['"{*]/m,
  /^\s*import\s+[\w$]/m,
  /^\s*export\s*[{*]/m,
  /^\s*export\s+[\w$]/m,
  /\bimport\s*\(/,
];

const memakaiSintaksModul = (sumber: string): boolean =>
  POLA_MODUL.some((pola) => pola.test(sumber));

const DIR_UJI = path.resolve(process.cwd(), 'apps-script/uji');

/**
 * Akhiran garis bawah adalah konvensi fungsi privat `Kode.gs`. Berkas uji yang
 * mendeklarasikannya berarti menyalin kebijakan keluar dari berkas yang
 * di-deploy (Batasan Global 20) — tanpa sensor ini, larangan itu hanya adat.
 */
const POLA_FUNGSI_PRIVAT: RegExp[] = [
  /^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*[\w$]*_\s*\(/m,
  /^\s*(?:export\s+)?(?:const|let|var)\s+[\w$]*_\s*=\s*(?:async\s*)?(?:function\b|\(|[\w$]+\s*=>)/m,
  /^\s*(?:async\s+)?[\w$]*_\s*\([^)]*\)\s*\{/m,
];

const mendeklarasiFungsiPrivat = (isi: string): boolean =>
  POLA_FUNGSI_PRIVAT.some((pola) => pola.test(isi));

/**
 * Apps Script mengekspos setiap pengikatan global sebagai sesuatu yang bisa
 * dipanggil dari luar berkas; akhiran garis bawah adalah satu-satunya cara
 * menyembunyikannya. Akhiran itu penjaga keamanan, bukan adat: satu fungsi
 * tanpa garis bawah berarti satu bagian kebijakan yang bisa dipanggil langsung,
 * melewati seluruh pemeriksaan peran di `doPost`.
 *
 * Hanya pengikatan di kolom pertama yang dihitung, karena hanya itu yang
 * benar-benar menjadi global di Apps Script.
 */
const TITIK_MASUK_GOOGLE = ['doPost', 'doGet'];

const POLA_GLOBAL: RegExp[] = [
  /^function\s*\*?\s*([\w$]+)\s*\(/gm,
  /^(?:var|let|const)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)/gm,
];

const globalYangTerbuka = (sumber: string): string[] => {
  const hasil: string[] = [];
  for (const pola of POLA_GLOBAL) {
    for (const cocok of sumber.matchAll(pola)) {
      const nama = cocok[1];
      if (nama === undefined || nama.endsWith('_')) continue;
      if (TITIK_MASUK_GOOGLE.includes(nama)) continue;
      hasil.push(nama);
    }
  }
  return hasil;
};

function muatDenganGooglePalsu(): Record<string, unknown> {
  const ss = buatSpreadsheetPalsu({ Sesi: SESI_BAWAAN, Penilaian: [KEPALA_PENILAIAN] });
  return muatKode({
    Session: buatSessionPalsu('admin@kampus.id'),
    SpreadsheetApp: { getActive: () => ss },
    LockService: buatLockServicePalsu(),
    ContentService: buatContentServicePalsu(),
  });
}

function ambilDoPost(konteks: Record<string, unknown>): (e: unknown) => KeluaranTeksPalsu {
  const doPost = konteks.doPost;
  if (typeof doPost !== 'function') throw new Error('Kode.gs tidak mengekspos doPost.');
  return doPost as (e: unknown) => KeluaranTeksPalsu;
}

function panggilDoPost(konteks: Record<string, unknown>, muatan: unknown): Balasan {
  const keluaran = ambilDoPost(konteks)({ postData: { contents: JSON.stringify(muatan) } });
  return JSON.parse(keluaran.getContent()) as Balasan;
}

describe('sandbox yang memuat Kode.gs', () => {
  it('memuat Kode.gs dan mengekspos doPost sebagai fungsi', () => {
    expect(typeof muatDenganGooglePalsu().doPost).toBe('function');
  });

  it('menolak Kode.gs yang memakai sintaks modul', () => {
    // `import`/`export` statis justru melempar SyntaxError di vm.runInContext.
    // Penjaga teks ini ada supaya sebabnya tersebut, menggantikan SyntaxError
    // yang tidak menyinggung Apps Script sama sekali — dan supaya `import()`
    // dinamis, satu-satunya bentuk yang benar-benar lulus di sandbox tetapi
    // gagal di Google, ikut tertangkap.
    expect(memakaiSintaksModul(bacaSumberKode())).toBe(false);
  });

  it('mengembalikan penolakan yang bisa dibaca untuk aksi tak dikenal', () => {
    const balasan = panggilDoPost(muatDenganGooglePalsu(), {
      aksi: 'mengacakNilai',
      sesiId: 'S1',
      muatan: {},
    });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('AKSI_TIDAK_DIKENAL');
  });

  it('menolak muatan yang bukan JSON tanpa melempar keluar dari doPost', () => {
    const keluaran = ambilDoPost(muatDenganGooglePalsu())({
      postData: { contents: 'bukan json' },
    });
    expect((JSON.parse(keluaran.getContent()) as Balasan).kode).toBe('MUATAN_TIDAK_SAH');
  });

  it('menandai balasan sebagai JSON', () => {
    const keluaran = ambilDoPost(muatDenganGooglePalsu())({
      postData: { contents: JSON.stringify({ aksi: 'apa pun' }) },
    });
    expect(keluaran.getMimeType()).toBe('application/json');
  });
});

describe('penjaga append-only pada sheet Penilaian palsu', () => {
  const buat = (): SpreadsheetPalsu =>
    buatSpreadsheetPalsu({ Penilaian: [['penilaian_id']], Sesi: SESI_BAWAAN });

  it('melempar bila ada yang mencoba menimpa baris', () => {
    const penilaian = sheetWajib(buat(), 'Penilaian');
    expect(() => penilaian.getRange(1, 1).setValue('x')).toThrow(/append-only/i);
  });

  it('melempar juga pada setValues, deleteRow, dan clear', () => {
    // Batasan Global 17 menyebut empat operasi. Menjaga satu saja meninggalkan
    // tiga jalan lain untuk menghapus nilai tanpa membuat uji merah.
    const ss = buat();
    expect(() => sheetWajib(ss, 'Penilaian').getRange(1, 1).setValues([['x']])).toThrow(/append-only/i);
    expect(() => sheetWajib(ss, 'Penilaian').getRange(1, 1).clear()).toThrow(/append-only/i);
    expect(() => sheetWajib(ss, 'Penilaian').deleteRow(1)).toThrow(/append-only/i);
    expect(() => sheetWajib(ss, 'Penilaian').clear()).toThrow(/append-only/i);
  });

  it('tetap mengizinkan appendRow', () => {
    const penilaian = sheetWajib(buat(), 'Penilaian');
    penilaian.appendRow(['1']);
    expect(penilaian.getLastRow()).toBe(2);
  });

  it('tidak menghalangi sheet lain, supaya finalisasi Sesi tetap mungkin', () => {
    // Penjaga yang menolak semua sheet membuat Tugas 4 mustahil, dan
    // kegagalannya baru terlihat dua tugas kemudian.
    const sesi = sheetWajib(buat(), 'Sesi');
    const kolom = indeksKolom(SESI_BAWAAN, 'status');
    sesi.getRange(2, kolom).setValue('final');
    expect(sesi.getDataRange().getValues()[1]?.[kolom - 1]).toBe('final');
  });
});

describe('spreadsheet palsu mengikuti bentuk API Google', () => {
  it('mengembalikan null untuk sheet yang belum ada', () => {
    // Kode.gs membedakan "belum ada" dari "sudah ada" lewat null ini; palsu yang
    // selalu mengembalikan objek akan membuat penyiapan ruang kerja tampak jalan.
    const ss = buatSpreadsheetPalsu({});
    expect(ss.getSheetByName('Sesi')).toBeNull();
    ss.insertSheet('Sesi');
    expect(ss.getSheets().map((satu) => satu.getName())).toEqual(['Sesi']);
  });

  it('mengembalikan [[\'\']] untuk sheet kosong, bukan larik kosong', () => {
    // Sheet Google selalu punya minimal satu sel. Palsu yang mengembalikan []
    // membuat `if (getDataRange().getValues().length === 0) appendRow(KEPALA)`
    // hijau di sini padahal kepala kolom tidak pernah ditulis di Google.
    const sheet = buatSpreadsheetPalsu({}).insertSheet('Sesi');
    expect(sheet.getDataRange().getValues()).toEqual([['']]);
    expect(sheet.getLastRow()).toBe(0);
  });

  it('menolak insertSheet dengan nama yang sudah ada', () => {
    // Google melempar. Palsu yang diam membuat penyiapan tak-idempoten lulus
    // uji Tugas 4 lalu melempar di produksi.
    const ss = buatSpreadsheetPalsu({ Sesi: SESI_BAWAAN });
    expect(() => ss.insertSheet('Sesi')).toThrow(/sudah ada/i);
  });

  it('melempar bila getRange diberi notasi A1 alih-alih angka', () => {
    // Kode.gs berjalan tanpa tipe, jadi getRange('B2') benar-benar mungkin —
    // dan dulu penulisannya hilang tanpa satu pun error.
    const sesi = sheetWajib(buatSpreadsheetPalsu({ Sesi: SESI_BAWAAN }), 'Sesi');
    expect(() => getRangeTanpaTipe(sesi)('B2')).toThrow(/bilangan bulat/i);
    expect(() => getRangeTanpaTipe(sesi)(0, 1)).toThrow(/bilangan bulat/i);
    expect(() => getRangeTanpaTipe(sesi)(1.5, 1)).toThrow(/bilangan bulat/i);
  });

  it('memaksa tipe sel seperti Sheets saat appendRow', () => {
    // Aturan 2 repo bersandar pada beda antara kosong dan nol, dan C2 menuntut
    // penilaian_id numerik. Menyimpan '3' sebagai teks memutus keduanya.
    const sheet = buatSpreadsheetPalsu({}).insertSheet('Penilaian');
    sheet.appendRow(['3', ' 80 ', '1e3', null, undefined, '', 'K1', '0x10']);
    expect(sheet.getDataRange().getValues()[0]).toEqual([
      3,
      80,
      1000,
      '',
      '',
      '',
      'K1',
      '0x10',
    ]);
  });

  it('tidak membagikan larik dengan pemanggilnya', () => {
    const isiAwal = [['penilaian_id']];
    const penilaian = sheetWajib(buatSpreadsheetPalsu({ Penilaian: isiAwal }), 'Penilaian');
    penilaian.appendRow(['1']);
    expect(isiAwal).toHaveLength(1);
  });
});

describe('lock palsu mencatat pengambilan dan pelepasan', () => {
  it('menghitung waitLock dan releaseLock secara terpisah', () => {
    const lock = buatLockPalsu();
    lock.waitLock(10_000);
    expect(lock.hasLock()).toBe(true);
    lock.releaseLock();
    expect({ ambil: lock.jumlahAmbil, lepas: lock.jumlahLepas }).toEqual({ ambil: 1, lepas: 1 });
    expect(lock.hasLock()).toBe(false);
  });

  it('mengembalikan lock yang sama setiap getScriptLock dipanggil', () => {
    // Menyuntikkan `getScriptLock: buatLockPalsu` memberi objek baru tiap
    // pemanggilan, sehingga uji tidak pernah memegang lock yang dipakai Kode.gs
    // dan Batasan Global 19 tidak akan pernah bisa dibuktikan.
    const layanan = buatLockServicePalsu();
    expect(layanan.getScriptLock()).toBe(layanan.getScriptLock());
    layanan.getScriptLock().waitLock(10_000);
    layanan.getScriptLock().releaseLock();
    expect({ ambil: layanan.lock.jumlahAmbil, lepas: layanan.lock.jumlahLepas }).toEqual({
      ambil: 1,
      lepas: 1,
    });
  });

  it('bisa dibuat melempar saat batas waktu habis', () => {
    // Google melempar, tidak mengembalikan false. Kode.gs harus menanganinya.
    const layanan = buatLockServicePalsu({ batasWaktuHabis: true });
    expect(() => layanan.getScriptLock().waitLock(10_000)).toThrow(/kunci/i);
    expect(layanan.lock.jumlahAmbil).toBe(0);
  });
});

describe('pola penjaga sintaks modul itu sendiri', () => {
  it('menangkap impor dan ekspor yang memakai spasi', () => {
    expect(memakaiSintaksModul("import { a } from 'x';")).toBe(true);
    expect(memakaiSintaksModul("import a from 'x';")).toBe(true);
    expect(memakaiSintaksModul('export function doPost() {}')).toBe(true);
    expect(memakaiSintaksModul('export default doPost;')).toBe(true);
  });

  it('menangkap bentuk rapat tanpa spasi yang dilewatkan pola tunggal', () => {
    expect(memakaiSintaksModul("import{a}from'x';")).toBe(true);
    expect(memakaiSintaksModul("import*as a from'x';")).toBe(true);
    expect(memakaiSintaksModul("import'efek-samping';")).toBe(true);
    expect(memakaiSintaksModul('export{doPost};')).toBe(true);
    expect(memakaiSintaksModul("export*from'x';")).toBe(true);
    expect(memakaiSintaksModul("const m = import('x');")).toBe(true);
  });

  it('tidak menangkap JavaScript biasa yang sah di Apps Script', () => {
    expect(memakaiSintaksModul('function doPost(e) { return balas_(e); }')).toBe(false);
    expect(memakaiSintaksModul('var importir = "nama kolom";')).toBe(false);
    expect(memakaiSintaksModul('// berkas ini tidak boleh memakai sintaks modul')).toBe(false);
  });
});

describe('Batasan Global 20 — kebijakan tidak boleh disalin ke berkas uji', () => {
  const daftar = readdirSync(DIR_UJI).filter((nama) => nama.endsWith('.ts'));

  it('menemukan setidaknya satu berkas untuk diperiksa', () => {
    expect(daftar.length).toBeGreaterThan(0);
  });

  it('tidak ada berkas uji yang mendeklarasikan fungsi berakhiran garis bawah', () => {
    for (const nama of daftar) {
      expect(
        mendeklarasiFungsiPrivat(readFileSync(path.join(DIR_UJI, nama), 'utf8')),
        `${nama} mendeklarasikan fungsi berakhiran garis bawah; kebijakan Kode.gs hanya boleh hidup di Kode.gs`,
      ).toBe(false);
    }
  });
});

describe('sensor fungsi privat itu sendiri', () => {
  it('menangkap deklarasi fungsi, pengikatan arrow, dan metode ringkas', () => {
    expect(mendeklarasiFungsiPrivat('function putuskanIzin_(email) {}')).toBe(true);
    expect(mendeklarasiFungsiPrivat('export function balas_(isi) {}')).toBe(true);
    expect(mendeklarasiFungsiPrivat('  const putuskanIzin_ = (email) => true;')).toBe(true);
    expect(mendeklarasiFungsiPrivat('var balas_ = function (isi) {};')).toBe(true);
    expect(mendeklarasiFungsiPrivat('  putuskanIzin_(email, aksi) {')).toBe(true);
  });

  it('tidak menangkap pemanggilan maupun nama tanpa garis bawah', () => {
    expect(mendeklarasiFungsiPrivat('const hasil = putuskanIzin_(email);')).toBe(false);
    expect(mendeklarasiFungsiPrivat('return balas_({ ok: false });')).toBe(false);
    expect(mendeklarasiFungsiPrivat('function panggil(opsi) {}')).toBe(false);
  });
});

describe('Kode.gs tidak boleh mengekspos apa pun selain titik masuk Google', () => {
  it('menyembunyikan seluruh fungsi global di balik akhiran garis bawah', () => {
    // Fungsi global tanpa garis bawah muncul di daftar "Jalankan fungsi" editor
    // Apps Script dan dapat dipicu lewat pemicu, jadi ia melewati doPost dan
    // seluruh kebijakan izin yang ada di dalamnya.
    expect(globalYangTerbuka(bacaSumberKode())).toEqual([]);
  });
});

describe('sensor fungsi global itu sendiri', () => {
  it('menangkap deklarasi dan pengikatan tingkat atas tanpa garis bawah', () => {
    expect(globalYangTerbuka('function simpanPenilaian(e) {}')).toEqual(['simpanPenilaian']);
    expect(globalYangTerbuka('var siapkan = function () {};')).toEqual(['siapkan']);
    expect(globalYangTerbuka('const siapkan = () => {};')).toEqual(['siapkan']);
    expect(globalYangTerbuka('let siapkan = async (e) => {};')).toEqual(['siapkan']);
  });

  it('melewatkan titik masuk Google, nama bergaris bawah, dan fungsi bersarang', () => {
    expect(globalYangTerbuka('function doPost(e) {}')).toEqual([]);
    expect(globalYangTerbuka('function doGet(e) {}')).toEqual([]);
    expect(globalYangTerbuka('function putuskanIzin_(e) {}')).toEqual([]);
    expect(globalYangTerbuka('  function dalam(e) {}')).toEqual([]);
  });

  it('tidak menganggap tetapan data sebagai fungsi', () => {
    expect(globalYangTerbuka("var NAMA_SHEET_SESI = 'Sesi';")).toEqual([]);
    expect(globalYangTerbuka('var SYARAT_AKSI = { bacaRekap: {} };')).toEqual([]);
    expect(globalYangTerbuka("var KOLOM_SESI_WAJIB = ['sesi_id'];")).toEqual([]);
  });
});
