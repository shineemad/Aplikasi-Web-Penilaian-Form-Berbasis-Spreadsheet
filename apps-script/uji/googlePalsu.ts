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

export interface SpreadsheetPalsu {
  getSheetByName(nama: string): SheetPalsu | null;
  insertSheet(nama: string): SheetPalsu;
  getSheets(): SheetPalsu[];
}

export interface LockPalsu {
  waitLock(batasMs: number): void;
  releaseLock(): void;
  hasLock(): boolean;
  jumlahAmbil: number;
  jumlahLepas: number;
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
    getDataRange: () => buatRange(1, 1, kisi.length, lebarKisi()),
    getRange: (baris, kolom, jumlahBaris, jumlahKolom) =>
      buatRange(baris, kolom, jumlahBaris === undefined ? 1 : jumlahBaris, jumlahKolom === undefined ? 1 : jumlahKolom),
    appendRow: (baris) => {
      kisi.push([...baris]);
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

export function buatSpreadsheetPalsu(isiAwal: Record<string, unknown[][]>): SpreadsheetPalsu {
  const daftar: SheetPalsu[] = Object.entries(isiAwal).map(([nama, isi]) =>
    buatSheetPalsu(nama, isi),
  );
  return {
    getSheetByName: (nama) => {
      const ketemu = daftar.find((satu) => satu.getName() === nama);
      return ketemu === undefined ? null : ketemu;
    },
    insertSheet: (nama) => {
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

export function buatLockPalsu(): LockPalsu {
  const lock: LockPalsu = {
    jumlahAmbil: 0,
    jumlahLepas: 0,
    waitLock: () => {
      lock.jumlahAmbil += 1;
    },
    releaseLock: () => {
      lock.jumlahLepas += 1;
    },
    hasLock: () => lock.jumlahAmbil > lock.jumlahLepas,
  };
  return lock;
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
