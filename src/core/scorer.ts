import { normalisasiTeks } from './normalisasi';
import type { Aturan, HasilSkor } from './tipe';

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

export function skorJawaban(
  jawaban: string | null | undefined,
  aturan: Aturan,
): HasilSkor {
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
