import { normalisasiTeks } from './normalisasi';
import { skorMaksAturan } from './scorer';
import type { JawabanResponden, Skema } from './tipe';

export type MasalahSkema =
  | {
      jenis: 'opsi-tak-dikenal';
      kolomAsal: string;
      label: string;
      /** Diurutkan dari yang paling sering muncul. */
      opsi: { teks: string; jumlahBaris: number }[];
    }
  | { jenis: 'skor-maks-tidak-sah'; kolomAsal: string; label: string; skorMaks: number | null }
  | { jenis: 'bobot-tidak-positif'; kolomAsal: string; label: string; bobot: number }
  | {
      jenis: 'kunci-peta-kembar';
      kolomAsal: string;
      label: string;
      ternormalisasi: string;
      kunciAsli: string[];
    }
  | { jenis: 'kolom-tidak-ada'; kolomAsal: string; label: string };

export interface HasilPeriksaSkema {
  masalah: MasalahSkema[];
  /** Salah selama masih ada satu masalah pun. Tidak ada masalah yang boleh diabaikan. */
  bolehDisimpan: boolean;
}

export function periksaSkema(skema: Skema, baris: JawabanResponden[]): HasilPeriksaSkema {
  const masalah: MasalahSkema[] = [];

  const kolomTersedia = new Set<string>();
  for (const responden of baris) {
    for (const kolom of Object.keys(responden.jawaban)) kolomTersedia.add(kolom);
  }

  for (const butir of skema.butir) {
    if (butir.aturan.jenis === 'abaikan') continue;

    const { kolomAsal, label } = butir;

    if (butir.bobot <= 0 || !Number.isFinite(butir.bobot)) {
      masalah.push({ jenis: 'bobot-tidak-positif', kolomAsal, label, bobot: butir.bobot });
    }

    const skorMaks = skorMaksAturan(butir.aturan);
    if (skorMaks === null || !Number.isFinite(skorMaks) || skorMaks <= 0) {
      masalah.push({ jenis: 'skor-maks-tidak-sah', kolomAsal, label, skorMaks });
    }

    if (butir.aturan.jenis === 'peta-opsi') {
      const kunciPerBentuk = new Map<string, string[]>();
      for (const kunci of Object.keys(butir.aturan.peta)) {
        const bentuk = normalisasiTeks(kunci);
        const sudah = kunciPerBentuk.get(bentuk);
        if (sudah === undefined) kunciPerBentuk.set(bentuk, [kunci]);
        else sudah.push(kunci);
      }
      for (const [ternormalisasi, kunciAsli] of kunciPerBentuk) {
        if (kunciAsli.length > 1) {
          masalah.push({ jenis: 'kunci-peta-kembar', kolomAsal, label, ternormalisasi, kunciAsli });
        }
      }
    }

    if (butir.aturan.jenis !== 'peta-opsi' && butir.aturan.jenis !== 'kunci-jawaban') continue;

    // Pemeriksaan ini hanya berlaku bagi kolom yang diisi responden. Kolom manual
    // memang tidak punya padanan di data impor karena nilainya diketik penilai.
    if (baris.length > 0 && !kolomTersedia.has(kolomAsal)) {
      masalah.push({ jenis: 'kolom-tidak-ada', kolomAsal, label });
      continue;
    }

    const dikenal = new Set<string>();
    if (butir.aturan.jenis === 'peta-opsi') {
      for (const kunci of Object.keys(butir.aturan.peta)) dikenal.add(normalisasiTeks(kunci));
    } else {
      dikenal.add(normalisasiTeks(butir.aturan.kunci));
    }

    const takDikenal = new Map<string, { teks: string; jumlahBaris: number }>();
    for (const responden of baris) {
      const jawaban = responden.jawaban[kolomAsal];
      if (jawaban === undefined) continue;

      const bentuk = normalisasiTeks(jawaban);
      if (bentuk === '') continue;
      if (dikenal.has(bentuk)) continue;
      if (butir.aturan.jenis === 'kunci-jawaban') continue;

      const sudah = takDikenal.get(bentuk);
      if (sudah === undefined) takDikenal.set(bentuk, { teks: jawaban.trim(), jumlahBaris: 1 });
      else sudah.jumlahBaris += 1;
    }

    if (takDikenal.size > 0) {
      const opsi = [...takDikenal.values()].sort((a, b) => {
        if (b.jumlahBaris !== a.jumlahBaris) return b.jumlahBaris - a.jumlahBaris;
        return a.teks.localeCompare(b.teks);
      });
      masalah.push({ jenis: 'opsi-tak-dikenal', kolomAsal, label, opsi });
    }
  }

  return { masalah, bolehDisimpan: masalah.length === 0 };
}
