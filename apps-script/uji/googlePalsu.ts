/**
 * Global Google palsu untuk menjalankan apps-script/Kode.gs di dalam node:vm.
 *
 * Bukan tiruan lengkap Apps Script — hanya permukaan yang benar-benar dipakai
 * Kode.gs, ditambah satu penjaga yang Google sendiri tidak punya: sheet
 * Penilaian menolak setiap operasi selain appendRow (Batasan Global 17).
 */

const NAMA_PENILAIAN = 'Penilaian';

export interface RangePalsu {
  getValues(): unknown[][];
  getValue(): unknown;
  setValues(nilai: unknown[][]): void;
  setValue(nilai: unknown): void;
  clear(): void;
}

export interface SheetPalsu {
  getName(): string;
  getDataRange(): RangePalsu;
  getRange(baris: number, kolom: number, jumlahBaris?: number, jumlahKolom?: number): RangePalsu;
  appendRow(baris: unknown[]): void;
  getLastRow(): number;
  deleteRow(baris: number): void;
  clear(): void;
}

export interface PenggunaPalsu {
  getEmail(): string;
}

export interface SpreadsheetPalsu {
  getSheetByName(nama: string): SheetPalsu | null;
  insertSheet(nama: string): SheetPalsu;
  getSheets(): SheetPalsu[];
  /** Google mengembalikan null untuk berkas di Shared Drive, dan melempar bila tidak berhak. */
  getOwner(): PenggunaPalsu | null;
}

/**
 * Permukaan `SpreadsheetApp` yang dipakai Kode.gs.
 *
 * `flush` ada di sini karena Apps Script menunda penulisan: tanpa memanggilnya,
 * baris yang baru ditambahkan bisa belum terlihat oleh eksekusi berikutnya,
 * sehingga nomor penilaian berikutnya dihitung dari kisi yang belum lengkap.
 */
export interface SpreadsheetAppPalsu {
  getActive(): SpreadsheetPalsu;
  flush(): void;
}

/**
 * Sel yang isinya ditafsirkan Sheets sebagai rumus, bukan sebagai teks.
 *
 * Dimodelkan sebagai objek tersendiri supaya kebocorannya terlihat: sel yang
 * menyimpan `{ rumus: '=Sesi!H2' }` jelas bukan catatan yang diketik penilai,
 * sedangkan teks '=Sesi!H2' yang tersimpan apa adanya tidak bisa dibedakan.
 */
export interface RumusPalsu {
  rumus: string;
}

export function adalahRumus(sel: unknown): sel is RumusPalsu {
  return typeof sel === 'object' && sel !== null && typeof (sel as RumusPalsu).rumus === 'string';
}

export interface OpsiSpreadsheet {
  /**
   * Bawaannya null — ruang kerja tanpa pemilik yang tercatat, seperti berkas
   * di Shared Drive. Bawaan yang gagal menutup membuat uji yang lupa menyetel
   * pemilik menjadi merah, bukan hijau karena alasan yang keliru.
   */
  pemilik?: string | null;
  /** Google melempar bila skrip tidak berhak membaca pemilik berkas. */
  pemilikMelempar?: boolean;
}

export interface LockPalsu {
  waitLock(batasMs: number): void;
  releaseLock(): void;
  hasLock(): boolean;
  /** Hanya pengambilan yang berhasil; waitLock yang melempar tidak menambahnya. */
  jumlahAmbil: number;
  jumlahLepas: number;
}

export interface LockServicePalsu {
  getScriptLock(): LockPalsu;
  /** Lock yang sama yang dikembalikan getScriptLock, supaya uji bisa memeriksanya. */
  lock: LockPalsu;
}

/**
 * Kunci skrip Apps Script berlaku untuk seluruh proyek, bukan per eksekusi.
 * Dua eksekusi bersamaan memegang objek `Lock` yang berbeda tetapi memperebutkan
 * kunci yang sama; keadaan itulah yang dititipkan di sini. Tanpa keadaan
 * bersama, permintaan kedua yang menyela tetap mendapat kunci dan §13 butir 4
 * tidak pernah benar-benar diuji.
 */
export interface KeadaanKunci {
  dipegang: LockPalsu | null;
}

export function buatKeadaanKunci(): KeadaanKunci {
  return { dipegang: null };
}

export interface OpsiLock {
  /** Meniru Google saat batas waktu habis: waitLock melempar, bukan mengembalikan false. */
  batasWaktuHabis?: boolean;
  /** Keadaan kunci yang dibagi beberapa eksekusi; tanpa ini tiap lock berdiri sendiri. */
  bersama?: KeadaanKunci;
  /**
   * Dijalankan sekali di dalam `waitLock`, SEBELUM kunci diambil, untuk
   * menyisipkan permintaan lain persis saat pemanggil ini sedang menunggu
   * giliran. Itulah satu-satunya cara menyimulasikan balapan sungguhan pada
   * runtime yang berjalan satu utas.
   */
  sela?: () => void;
  /** Jurnal bersama, untuk membuktikan urutan flush terhadap releaseLock. */
  jejak?: string[];
}

export interface SessionPalsu {
  getActiveUser(): { getEmail(): string };
}

export interface KeluaranTeksPalsu {
  setMimeType(mime: string): KeluaranTeksPalsu;
  getContent(): string;
  getMimeType(): string;
}

export interface ContentServicePalsu {
  MimeType: { JSON: string; TEXT: string };
  createTextOutput(teks: string): KeluaranTeksPalsu;
}

function selDari(baris: unknown[] | undefined, indeks: number): unknown {
  if (baris === undefined) return '';
  const sel = baris[indeks];
  return sel === undefined ? '' : sel;
}

// Sengaja lebih sempit daripada Number(): Sheets tidak memperlakukan "0x10",
// "Infinity", atau "1_000" sebagai angka.
const POLA_ANGKA = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Sheets memaksa tipe sel seperti saat manusia mengetiknya, bukan menyimpan apa
 * adanya. Tiga tafsir yang berlaku, berurutan:
 *
 * 1. apostrof di depan berarti "simpan sisanya apa adanya sebagai teks";
 *    apostrofnya sendiri tidak ikut tersimpan dan tidak muncul di getValues;
 * 2. tanda sama dengan di depan menjadikan selnya rumus, bukan teks;
 * 3. sisanya yang berbentuk angka menjadi angka — termasuk "0012345678901234"
 *    yang menjadi 12345678901234 dan "12e4567890123456" yang menjadi Infinity.
 *
 * Awalan `+`, `-`, dan `@` sengaja TIDAK ditafsirkan di sini: belum terbukti
 * bagaimana Sheets memperlakukannya, dan menebaknya berarti menguji tebakan.
 */
function selSepertiSheets(nilai: unknown): unknown {
  if (nilai === null || nilai === undefined) return '';
  if (typeof nilai !== 'string') return nilai;
  if (nilai.charAt(0) === "'") return nilai.slice(1);
  if (nilai.charAt(0) === '=') return { rumus: nilai };
  const rapat = nilai.trim();
  return POLA_ANGKA.test(rapat) ? Number(rapat) : nilai;
}

function wajibIndeks(nilai: unknown, nama: string): number {
  if (typeof nilai !== 'number' || !Number.isInteger(nilai) || nilai < 1) {
    throw new Error(
      `getRange menerima ${nama} = ${String(nilai)}. Palsu ini hanya menerima bilangan bulat >= 1; ` +
        'notasi A1 seperti "B2" tidak didukung, dan menerimanya diam-diam akan membuang penulisan.',
    );
  }
  return nilai;
}

function buatSheetPalsu(nama: string, isiAwal: unknown[][]): SheetPalsu {
  const kisi: unknown[][] = isiAwal.map((baris) => [...baris]);
  const appendOnly = nama === NAMA_PENILAIAN;

  const jagaTimpa = (operasi: string): void => {
    if (!appendOnly) return;
    throw new Error(
      `Sheet ${nama} bersifat append-only: ${operasi} dilarang, hanya appendRow yang diizinkan.`,
    );
  };

  // Sheets sungguhan memperluas kisinya sendiri saat sel di luar isi ditulis.
  const luaskan = (baris: number, kolom: number): void => {
    while (kisi.length < baris) kisi.push([]);
    for (const satu of kisi) {
      while (satu.length < kolom) satu.push('');
    }
  };

  const tulisSel = (baris: number, kolom: number, nilai: unknown): void => {
    luaskan(baris, kolom);
    const target = kisi[baris - 1];
    if (target !== undefined) target[kolom - 1] = nilai;
  };

  const buatRange = (
    barisAwal: number,
    kolomAwal: number,
    jumlahBaris: number,
    jumlahKolom: number,
  ): RangePalsu => ({
    getValues: () => {
      const hasil: unknown[][] = [];
      for (let i = 0; i < jumlahBaris; i += 1) {
        const baris = kisi[barisAwal - 1 + i];
        const potong: unknown[] = [];
        for (let j = 0; j < jumlahKolom; j += 1) potong.push(selDari(baris, kolomAwal - 1 + j));
        hasil.push(potong);
      }
      return hasil;
    },
    getValue: () => selDari(kisi[barisAwal - 1], kolomAwal - 1),
    setValue: (nilai) => {
      jagaTimpa('setValue');
      tulisSel(barisAwal, kolomAwal, nilai);
    },
    setValues: (nilai) => {
      jagaTimpa('setValues');
      for (let i = 0; i < nilai.length; i += 1) {
        const baris = nilai[i];
        if (baris === undefined) continue;
        for (let j = 0; j < baris.length; j += 1) tulisSel(barisAwal + i, kolomAwal + j, baris[j]);
      }
    },
    clear: () => {
      jagaTimpa('clear');
      for (let i = 0; i < jumlahBaris; i += 1) {
        for (let j = 0; j < jumlahKolom; j += 1) tulisSel(barisAwal + i, kolomAwal + j, '');
      }
    },
  });

  const lebarKisi = (): number => kisi.reduce((lebar, baris) => Math.max(lebar, baris.length), 0);

  return {
    getName: () => nama,
    // Sheet Google selalu punya minimal satu sel, jadi sheet kosong pun
    // menghasilkan [['']]. Mengembalikan [] membuat penyiapan kepala kolom yang
    // bersyarat panjang-nol tampak jalan padahal tidak pernah menulis apa pun.
    getDataRange: () => buatRange(1, 1, Math.max(1, kisi.length), Math.max(1, lebarKisi())),
    getRange: (baris, kolom, jumlahBaris, jumlahKolom) =>
      buatRange(
        wajibIndeks(baris, 'baris'),
        wajibIndeks(kolom, 'kolom'),
        jumlahBaris === undefined ? 1 : jumlahBaris,
        jumlahKolom === undefined ? 1 : jumlahKolom,
      ),
    appendRow: (baris) => {
      kisi.push(baris.map(selSepertiSheets));
    },
    getLastRow: () => kisi.length,
    deleteRow: (baris) => {
      jagaTimpa('deleteRow');
      kisi.splice(baris - 1, 1);
    },
    clear: () => {
      jagaTimpa('clear');
      kisi.length = 0;
    },
  };
}

export function buatSpreadsheetPalsu(
  isiAwal: Record<string, unknown[][]>,
  opsi: OpsiSpreadsheet = {},
): SpreadsheetPalsu {
  const daftar: SheetPalsu[] = Object.entries(isiAwal).map(([nama, isi]) =>
    buatSheetPalsu(nama, isi),
  );
  const pemilik = opsi.pemilik === undefined ? null : opsi.pemilik;
  return {
    getOwner: () => {
      if (opsi.pemilikMelempar === true) {
        throw new Error('Skrip tidak berhak membaca pemilik berkas ini.');
      }
      return pemilik === null ? null : { getEmail: () => pemilik };
    },
    getSheetByName: (nama) => {
      const ketemu = daftar.find((satu) => satu.getName() === nama);
      return ketemu === undefined ? null : ketemu;
    },
    insertSheet: (nama) => {
      if (daftar.some((satu) => satu.getName() === nama)) {
        throw new Error(
          `Sheet bernama "${nama}" sudah ada; Google menolak insertSheet yang kembar. ` +
            'Periksa keberadaannya dengan getSheetByName sebelum membuat.',
        );
      }
      const baru = buatSheetPalsu(nama, []);
      daftar.push(baru);
      return baru;
    },
    getSheets: () => [...daftar],
  };
}

/** getSheetByName mengembalikan null seperti API Google; ini mengubahnya jadi kesalahan yang jelas. */
export function sheetWajib(ss: SpreadsheetPalsu, nama: string): SheetPalsu {
  const sheet = ss.getSheetByName(nama);
  if (sheet === null) throw new Error(`Sheet ${nama} tidak ada pada spreadsheet palsu.`);
  return sheet;
}

export function buatLockPalsu(opsi: OpsiLock = {}): LockPalsu {
  const bersama = opsi.bersama === undefined ? buatKeadaanKunci() : opsi.bersama;
  let selaTerpakai = false;
  const lock: LockPalsu = {
    jumlahAmbil: 0,
    jumlahLepas: 0,
    waitLock: (batasMs) => {
      if (opsi.batasWaktuHabis === true) {
        throw new Error(`Tidak bisa mengambil kunci setelah ${String(batasMs)} ms.`);
      }
      // Kait dijalankan sebelum kunci diambil, karena itulah posisi pemanggil
      // yang sedang menunggu: permintaan penyela masih bisa masuk dan selesai.
      if (opsi.sela !== undefined && !selaTerpakai) {
        selaTerpakai = true;
        opsi.sela();
      }
      if (bersama.dipegang !== null && bersama.dipegang !== lock) {
        throw new Error(
          `Tidak bisa mengambil kunci setelah ${String(batasMs)} ms: ` +
            'eksekusi lain sedang memegang kunci skrip.',
        );
      }
      bersama.dipegang = lock;
      lock.jumlahAmbil += 1;
      if (opsi.jejak !== undefined) opsi.jejak.push('ambil');
    },
    releaseLock: () => {
      if (bersama.dipegang === lock) bersama.dipegang = null;
      lock.jumlahLepas += 1;
      if (opsi.jejak !== undefined) opsi.jejak.push('lepas');
    },
    hasLock: () => bersama.dipegang === lock,
  };
  return lock;
}

/**
 * Menyuntikkan `getScriptLock: buatLockPalsu` memberi lock baru tiap pemanggilan,
 * sehingga uji tidak pernah memegang lock yang benar-benar dipakai Kode.gs dan
 * Batasan Global 19 menjadi mustahil dibuktikan. Ini menutup satu lock saja.
 */
export function buatLockServicePalsu(opsi: OpsiLock = {}): LockServicePalsu {
  const lock = buatLockPalsu(opsi);
  return { lock, getScriptLock: () => lock };
}

/**
 * Menyuntikkan `{ getActive: () => ss }` apa adanya membuat `SpreadsheetApp.flush()`
 * melempar TypeError yang tertangkap Kode.gs sebagai kegagalan menulis biasa,
 * sehingga hilangnya flush terbaca sebagai bug lain. Jalur ini menyediakannya,
 * dan `jejak` yang sama dengan jurnal kunci membuat urutannya bisa diperiksa.
 */
export function buatSpreadsheetAppPalsu(
  ss: SpreadsheetPalsu,
  jejak?: string[],
): SpreadsheetAppPalsu {
  return {
    getActive: () => ss,
    flush: () => {
      if (jejak !== undefined) jejak.push('flush');
    },
  };
}

export function buatSessionPalsu(email: string): SessionPalsu {
  return { getActiveUser: () => ({ getEmail: () => email }) };
}

export function buatContentServicePalsu(): ContentServicePalsu {
  return {
    MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
    createTextOutput: (teks) => {
      let mime = 'text/plain';
      const keluaran: KeluaranTeksPalsu = {
        setMimeType: (baru) => {
          mime = baru;
          return keluaran;
        },
        getContent: () => teks,
        getMimeType: () => mime,
      };
      return keluaran;
    },
  };
}
