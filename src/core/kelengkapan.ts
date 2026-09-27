import { normalisasiTeks } from './normalisasi';
import type { ButirSkema, JawabanResponden, Skema } from './tipe';

export type Kelengkapan =
  | { status: 'lengkap' }
  | { status: 'kurang'; jumlahKosong: number }
  | { status: 'kosong' };

/** Satu-satunya definisi kolom mana yang diperhitungkan dalam kelengkapan. */
export function diisiResponden(butir: ButirSkema): boolean {
  return butir.aturan.jenis === 'peta-opsi' || butir.aturan.jenis === 'kunci-jawaban';
}

export function hitungKelengkapan(
  responden: JawabanResponden,
  skema: Skema,
): Kelengkapan {
  let diminta = 0;
  let kosong = 0;

  for (const butir of skema.butir) {
    if (!diisiResponden(butir)) continue;

    diminta += 1;
    const jawaban = responden.jawaban[butir.kolomAsal];
    if (jawaban === undefined || normalisasiTeks(jawaban) === '') kosong += 1;
  }

  if (diminta === 0) return { status: 'lengkap' };
  if (kosong === 0) return { status: 'lengkap' };
  if (kosong === diminta) return { status: 'kosong' };
  return { status: 'kurang', jumlahKosong: kosong };
}
