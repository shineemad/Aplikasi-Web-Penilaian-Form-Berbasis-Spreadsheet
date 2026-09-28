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

export interface OpsiLock {
  /** Meniru Google saat batas waktu habis: waitLock melempar, bukan mengembalikan false. */
  batasWaktuHabis?: boolean;
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

/** Sheets memaksa tipe sel seperti saat manusia mengetiknya, bukan menyimpan apa adanya. */
function selSepertiSheets(nilai: unknown): unknown {
  if (nilai === null || nilai === undefined) return '';
  if (typeof nilai !== 'string') return nilai;
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
  const lock: LockPalsu = {
    jumlahAmbil: 0,
    jumlahLepas: 0,
    waitLock: (batasMs) => {
      if (opsi.batasWaktuHabis === true) {
        throw new Error(`Tidak bisa mengambil kunci setelah ${String(batasMs)} ms.`);
      }
      lock.jumlahAmbil += 1;
    },
    releaseLock: () => {
      lock.jumlahLepas += 1;
    },
    hasLock: () => lock.jumlahAmbil > lock.jumlahLepas,
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
