import { normalisasiTeks } from './normalisasi';
import type { JawabanResponden, Skema } from './tipe';

export type Kelengkapan =
  | { status: 'lengkap' }
  | { status: 'kurang'; jumlahKosong: number }
  | { status: 'kosong' };

export function hitungKelengkapan(
  responden: JawabanResponden,
  skema: Skema,
): Kelengkapan {
  let diminta = 0;
  let kosong = 0;

  for (const butir of skema.butir) {
    if (butir.aturan.jenis !== 'peta-opsi' && butir.aturan.jenis !== 'kunci-jawaban') continue;

    diminta += 1;
    const jawaban = responden.jawaban[butir.kolomAsal];
    if (jawaban === undefined || normalisasiTeks(jawaban) === '') kosong += 1;
  }

  if (diminta === 0) return { status: 'lengkap' };
  if (kosong === 0) return { status: 'lengkap' };
  if (kosong === diminta) return { status: 'kosong' };
  return { status: 'kurang', jumlahKosong: kosong };
}
