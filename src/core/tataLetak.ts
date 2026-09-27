export interface MuatKolom {
  potret: number;
  lanskap: number;
}

export interface RencanaHalaman {
  orientasi: 'potret' | 'lanskap';
  /** Tiap potongan berisi indeks kolom yang dicetak, kolom identitas selalu di depan. */
  potongan: number[][];
}

export function rencanakanHalaman(
  jumlahKolom: number,
  kolomIdentitas: number,
  muat: MuatKolom,
): RencanaHalaman {
  if (jumlahKolom === 0) return { orientasi: 'potret', potongan: [] };

  const semua = Array.from({ length: jumlahKolom }, (_, i) => i);

  if (jumlahKolom <= muat.potret) return { orientasi: 'potret', potongan: [semua] };
  if (jumlahKolom <= muat.lanskap) return { orientasi: 'lanskap', potongan: [semua] };

  const ruangData = muat.lanskap - kolomIdentitas;
  if (ruangData < 1) {
    throw new Error(
      `Kolom identitas (${kolomIdentitas}) memenuhi halaman lanskap yang hanya memuat ` +
        `${muat.lanskap} kolom, sehingga tabel tidak dapat dipecah. Kurangi kolom identitas ` +
        'atau perbesar halaman.',
    );
  }

  const identitas = semua.slice(0, kolomIdentitas);
  const data = semua.slice(kolomIdentitas);
  const potongan: number[][] = [];

  for (let i = 0; i < data.length; i += ruangData) {
    potongan.push([...identitas, ...data.slice(i, i + ruangData)]);
  }

  return { orientasi: 'lanskap', potongan };
}
