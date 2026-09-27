import { describe, expect, it } from 'vitest';
import {
  buatContentServicePalsu,
  buatLockPalsu,
  buatSessionPalsu,
  buatSpreadsheetPalsu,
  sheetWajib,
  type KeluaranTeksPalsu,
  type SpreadsheetPalsu,
} from './googlePalsu';
import { bacaSumberKode, muatKode } from './sandbox';

interface Balasan {
  ok: boolean;
  kode: string;
  pesan: string;
}

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

function muatDenganGooglePalsu(): Record<string, unknown> {
  const ss = buatSpreadsheetPalsu({
    Sesi: [['sesi_id', 'status'], ['S1', 'berjalan']],
    Penilaian: [['penilaian_id', 'sesi_id', 'responden_id', 'kriteria', 'nilai']],
  });
  return muatKode({
    Session: buatSessionPalsu('admin@kampus.id'),
    SpreadsheetApp: { getActive: () => ss },
    LockService: { getScriptLock: buatLockPalsu },
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
    // `import` akan lulus di sandbox tetapi gagal di Google. Diperiksa sebagai
    // teks, bukan dijalankan.
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
    buatSpreadsheetPalsu({
      Penilaian: [['penilaian_id']],
      Sesi: [['sesi_id', 'status'], ['S1', 'berjalan']],
    });

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
    sesi.getRange(2, 2).setValue('final');
    expect(sesi.getDataRange().getValues()[1]?.[1]).toBe('final');
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
