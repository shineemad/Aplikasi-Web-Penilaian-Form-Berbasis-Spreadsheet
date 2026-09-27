import type { Aturan, ButirSkema, Skema } from '../tipe';

export const LIKERT_5: Aturan = {
  jenis: 'peta-opsi',
  skorMaks: 5,
  peta: {
    'Strongly disagree': 1,
    Disagree: 2,
    Neutral: 3,
    Agree: 4,
    // Kunci sengaja ditulis dengan A besar, seperti pada instrumen asli,
    // untuk membuktikan pencocokan tidak bergantung pada huruf besar-kecil.
    'Strongly Agree': 5,
  },
};

const DIMENSI: { dimensi: string; jumlah: number }[] = [
  { dimensi: 'kebermanfaatan', jumlah: 5 },
  { dimensi: 'kemudahan', jumlah: 5 },
  { dimensi: 'dayaTarik', jumlah: 4 },
  { dimensi: 'relevansi', jumlah: 3 },
  { dimensi: 'kepuasan', jumlah: 3 },
];

function bangunButir(): ButirSkema[] {
  const butir: ButirSkema[] = [];
  let nomor = 1;
  for (const { dimensi, jumlah } of DIMENSI) {
    for (let i = 0; i < jumlah; i += 1) {
      butir.push({
        kolomAsal: `q${nomor}`,
        label: `Butir ${nomor}`,
        dimensi,
        aturan: LIKERT_5,
        bobot: 1,
      });
      nomor += 1;
    }
  }
  return butir;
}

/** Skema 20 butir sesuai instrumen Post-Test "Sahabat Hijaiyah". */
export function skemaPostTest(perlakuanKosong: 'abaikan' | 'nol'): Skema {
  return { skemaId: 'postTest', perlakuanKosong, butir: bangunButir() };
}

/** Jawaban seragam untuk seluruh 20 butir. */
export function jawabanSeragam(opsi: string): Record<string, string> {
  const jawaban: Record<string, string> = {};
  for (let nomor = 1; nomor <= 20; nomor += 1) {
    jawaban[`q${nomor}`] = opsi;
  }
  return jawaban;
}
