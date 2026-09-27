import { normalisasiTeks } from './normalisasi';

export type Peran = 'email' | 'nama' | 'waktu' | 'meta' | 'pertanyaan' | 'belum-diputuskan';

export interface KolomBerperan {
  header: string;
  peran: Peran;
  /** Mengapa peran ini dipilih, untuk ditampilkan ke admin. */
  alasan: string;
}

export type PeranIdentitas = 'email' | 'nama' | 'waktu';

export interface PetaPeran {
  kolom: KolomBerperan[];
  /** Peran yang punya lebih dari satu calon. Admin harus memilih; sistem tidak. */
  rancu: { peran: PeranIdentitas; calon: string[] }[];
}

/**
 * Header pertanyaan Google Forms kerap berupa kalimat penuh. Pagar panjang ini
 * mencegah kalimat yang kebetulan memuat kata "email" dikira kunci identitas.
 */
const PANJANG_MAKS_IDENTITAS = 30;

const MENGANDUNG: Record<PeranIdentitas, string[]> = {
  email: ['email', 'surel'],
  waktu: ['timestamp', 'cap waktu', 'stempel waktu'],
  nama: [],
};

const PERSIS: Record<PeranIdentitas, string[]> = {
  email: [],
  waktu: [],
  nama: ['name', 'nama', 'full name', 'nama lengkap'],
};

const URUTAN: PeranIdentitas[] = ['email', 'nama', 'waktu'];

function calonUntuk(peran: PeranIdentitas, header: string[]): string[] {
  const calon: string[] = [];

  for (const asli of header) {
    const bentuk = normalisasiTeks(asli);
    if (bentuk.length > PANJANG_MAKS_IDENTITAS) continue;

    const persis = PERSIS[peran];
    const mengandung = MENGANDUNG[peran];

    if (persis.includes(bentuk)) calon.push(asli);
    else if (mengandung.some((kata) => bentuk.includes(kata))) calon.push(asli);
  }

  return calon;
}

export function tebakPeranKolom(header: string[]): PetaPeran {
  const terpilih = new Map<string, KolomBerperan>();
  const rancu: { peran: PeranIdentitas; calon: string[] }[] = [];

  for (const peran of URUTAN) {
    const calon = calonUntuk(peran, header);
    if (calon.length === 0) continue;

    if (calon.length > 1) {
      rancu.push({ peran, calon });
      continue;
    }

    const satu = calon[0];
    if (satu === undefined) continue;
    terpilih.set(satu, {
      header: satu,
      peran,
      alasan: `Nama kolom "${satu}" cocok dengan pola kolom ${peran}.`,
    });
  }

  const kolom = header.map((asli) => {
    const sudah = terpilih.get(asli);
    if (sudah !== undefined) return sudah;
    return {
      header: asli,
      peran: 'belum-diputuskan' as const,
      alasan: 'Peran kolom ini tidak dapat disimpulkan dari nama header saja.',
    };
  });

  return { kolom, rancu };
}
