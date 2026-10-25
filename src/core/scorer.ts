import { normalisasiTeks } from './normalisasi';
import type { Aturan, HasilSkor } from './tipe';

/**
 * `Record` mewarisi Object.prototype, sehingga `jawaban['toString']` milik
 * responden yang tidak mengisinya mengembalikan fungsi bawaan — dan setiap
 * pemanggil lalu melempar `TypeError` alih-alih membaca sel kosong. `kolom_asal`
 * diketik admin ke dalam sheet, jadi nama yang kebetulan bentrok adalah
 * masukan yang wajar, bukan keadaan mustahil.
 */
export function jawabanKolom(
  jawaban: Record<string, string>,
  kolomAsal: string,
): string | undefined {
  return Object.hasOwn(jawaban, kolomAsal) ? jawaban[kolomAsal] : undefined;
}

export function skorMaksAturan(aturan: Aturan): number | null {
  switch (aturan.jenis) {
    case 'peta-opsi':
      return aturan.skorMaks;
    case 'kunci-jawaban':
      return 1;
    case 'manual':
      return aturan.maks;
    case 'abaikan':
      return null;
  }
}

/**
 * Rentang nilai manual yang sah bagi sebuah aturan. `null` berarti butirnya
 * memang tidak dinilai, sehingga nilai manual untuknya tidak punya arti.
 */
export function rentangNilaiManual(aturan: Aturan): { min: number; maks: number } | null {
  switch (aturan.jenis) {
    case 'manual':
      return { min: aturan.min, maks: aturan.maks };
    // Lantainya skor terendah yang bisa dihasilkan petanya, bukan nol: pada
    // skala 1..5 angka 0 bukan koreksi melainkan kekeliruan.
    case 'peta-opsi':
      return { min: Math.min(...Object.values(aturan.peta)), maks: aturan.skorMaks };
    case 'kunci-jawaban':
      return { min: 0, maks: 1 };
    case 'abaikan':
      return null;
  }
}

export function skorJawaban(jawaban: string | null | undefined, aturan: Aturan): HasilSkor {
  if (aturan.jenis === 'abaikan') return { status: 'diabaikan' };
  if (aturan.jenis === 'manual') return { status: 'butuh-manual' };

  if (jawaban === null || jawaban === undefined) return { status: 'kosong' };

  const bersih = normalisasiTeks(jawaban);
  if (bersih === '') return { status: 'kosong' };

  if (aturan.jenis === 'kunci-jawaban') {
    return { status: 'terhitung', skor: bersih === normalisasiTeks(aturan.kunci) ? 1 : 0 };
  }

  for (const [opsi, skor] of Object.entries(aturan.peta)) {
    if (normalisasiTeks(opsi) === bersih) {
      return { status: 'terhitung', skor };
    }
  }

  return {
    status: 'peringatan',
    opsiTakDikenal: jawaban.trim(),
    pesan: `Opsi "${jawaban.trim()}" tidak ada di peta skala. Lengkapi petanya, atau tandai kolom ini untuk diabaikan.`,
  };
}
