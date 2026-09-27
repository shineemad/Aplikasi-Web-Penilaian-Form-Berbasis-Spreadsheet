/** Disuntikkan dari luar: format cap waktu adalah urusan data nyata, bukan perhitungan. */
export type BandingWaktu = (a: string, b: string) => number;

export interface BarisPeringkat {
  respondenId: string;
  nilai: number | null;
  jumlahTerjawab: number;
  waktuKirim: string | null;
}

export interface BarisTerperingkat extends BarisPeringkat {
  /** `null` bila nilainya null — tidak menjawab bukan berarti peringkat terakhir. */
  peringkat: number | null;
}

function banding(a: BarisPeringkat, b: BarisPeringkat, bandingWaktu: BandingWaktu): number {
  if (a.nilai === null && b.nilai === null) return 0;
  if (a.nilai === null) return 1;
  if (b.nilai === null) return -1;

  if (a.nilai !== b.nilai) return b.nilai - a.nilai;
  if (a.jumlahTerjawab !== b.jumlahTerjawab) return b.jumlahTerjawab - a.jumlahTerjawab;

  if (a.waktuKirim === null && b.waktuKirim === null) return 0;
  if (a.waktuKirim === null) return 1;
  if (b.waktuKirim === null) return -1;

  return bandingWaktu(a.waktuKirim, b.waktuKirim);
}

export function urutkanPeringkat(
  baris: BarisPeringkat[],
  bandingWaktu: BandingWaktu,
): BarisTerperingkat[] {
  const terurut = [...baris].sort((a, b) => banding(a, b, bandingWaktu));
  const hasil: BarisTerperingkat[] = [];

  let peringkatTerakhir = 0;
  let sudahDiberi = 0;

  for (const satu of terurut) {
    if (satu.nilai === null) {
      hasil.push({ ...satu, peringkat: null });
      continue;
    }

    sudahDiberi += 1;
    const sebelumnya = hasil[hasil.length - 1];

    if (sebelumnya !== undefined && banding(sebelumnya, satu, bandingWaktu) === 0) {
      hasil.push({ ...satu, peringkat: peringkatTerakhir });
      continue;
    }

    peringkatTerakhir = sudahDiberi;
    hasil.push({ ...satu, peringkat: peringkatTerakhir });
  }

  return hasil;
}
