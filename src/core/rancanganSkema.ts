import { tebakPeranKolom } from './peranKolom';
import type { PetaPeran } from './peranKolom';
import { usulkanAturan } from './usulAturan';
import type { Aturan, ButirSkema, PerlakuanKosong, Skema } from './tipe';

export interface ButirRancangan {
  kolomAsal: string;
  label: string;
  /** Kosong sampai admin mengelompokkannya. Finalisasi menolak yang masih kosong. */
  dimensi: string;
  /** `null` berarti belum diputuskan — bukan berarti abaikan. */
  aturan: Aturan | null;
  bobot: number;
  /** Mengapa aturan ini diusulkan, atau mengapa sistem tidak yakin. */
  alasan: string;
  contohNilai: string[];
}

export interface RancanganSkema {
  skemaId: string;
  /** `null` sampai admin memilih. Abaikan dan nol menghasilkan angka berbeda. */
  perlakuanKosong: PerlakuanKosong | null;
  peran: PetaPeran;
  butir: ButirRancangan[];
}

export type MasalahRancangan =
  | { jenis: 'tanpa-kolom-email' }
  | { jenis: 'peran-rancu'; peran: string; calon: string[] }
  | { jenis: 'peran-belum-diputuskan'; header: string }
  | { jenis: 'aturan-belum-diputuskan'; kolomAsal: string }
  | { jenis: 'dimensi-kosong'; kolomAsal: string }
  | { jenis: 'perlakuan-kosong-belum-dipilih' };

export type HasilFinalisasi =
  | { status: 'siap'; skema: Skema }
  | { status: 'belum-lengkap'; masalah: MasalahRancangan[] };

const PERAN_IDENTITAS = ['email', 'nama', 'waktu'];

export function bangunRancangan(
  skemaId: string,
  header: string[],
  baris: Record<string, string>[],
): RancanganSkema {
  const peran = tebakPeranKolom(header);
  const butir: ButirRancangan[] = [];

  for (const kolom of peran.kolom) {
    if (PERAN_IDENTITAS.includes(kolom.peran)) continue;

    const nilai: string[] = [];
    for (const satu of baris) {
      const isi = satu[kolom.header];
      if (isi !== undefined) nilai.push(isi);
    }

    const usul = usulkanAturan(nilai);

    if (usul.status === 'usul') {
      kolom.peran = 'pertanyaan';
      butir.push({
        kolomAsal: kolom.header,
        label: kolom.header,
        dimensi: '',
        aturan: usul.aturan,
        bobot: 1,
        alasan: usul.alasan,
        contohNilai: [],
      });
      continue;
    }

    butir.push({
      kolomAsal: kolom.header,
      label: kolom.header,
      dimensi: '',
      aturan: null,
      bobot: 1,
      alasan: usul.alasan,
      contohNilai: usul.contohNilai,
    });
  }

  return { skemaId, perlakuanKosong: null, peran, butir };
}

export function finalkanSkema(rancangan: RancanganSkema): HasilFinalisasi {
  const masalah: MasalahRancangan[] = [];

  for (const rancu of rancangan.peran.rancu) {
    masalah.push({ jenis: 'peran-rancu', peran: rancu.peran, calon: rancu.calon });
  }

  let adaEmail = false;
  const peranPerHeader = new Map<string, string>();

  for (const kolom of rancangan.peran.kolom) {
    peranPerHeader.set(kolom.header, kolom.peran);
    if (kolom.peran === 'email') adaEmail = true;
    if (kolom.peran === 'belum-diputuskan') {
      masalah.push({ jenis: 'peran-belum-diputuskan', header: kolom.header });
    }
  }

  if (!adaEmail) masalah.push({ jenis: 'tanpa-kolom-email' });
  if (rancangan.perlakuanKosong === null) {
    masalah.push({ jenis: 'perlakuan-kosong-belum-dipilih' });
  }

  const butirSkema: ButirSkema[] = [];

  for (const butir of rancangan.butir) {
    if (peranPerHeader.get(butir.kolomAsal) !== 'pertanyaan') continue;

    if (butir.aturan === null) {
      masalah.push({ jenis: 'aturan-belum-diputuskan', kolomAsal: butir.kolomAsal });
      continue;
    }
    if (butir.dimensi === '') {
      masalah.push({ jenis: 'dimensi-kosong', kolomAsal: butir.kolomAsal });
      continue;
    }

    butirSkema.push({
      kolomAsal: butir.kolomAsal,
      label: butir.label,
      dimensi: butir.dimensi,
      aturan: butir.aturan,
      bobot: butir.bobot,
    });
  }

  if (masalah.length > 0) return { status: 'belum-lengkap', masalah };

  const perlakuanKosong = rancangan.perlakuanKosong;
  // Terlihat berlebihan tetapi bukan: TypeScript tidak menyempitkan tipe dari cabang masalah.push di atas.
  if (perlakuanKosong === null) {
    return { status: 'belum-lengkap', masalah: [{ jenis: 'perlakuan-kosong-belum-dipilih' }] };
  }

  return {
    status: 'siap',
    skema: { skemaId: rancangan.skemaId, perlakuanKosong, butir: butirSkema },
  };
}
