import { skorJawaban, skorMaksAturan } from './scorer';
import type { JawabanResponden, Skema } from './tipe';

export interface HasilNilaiResponden {
  respondenId: string;
  /** Skala 0–100. `null` bila tidak ada satu pun butir yang dapat dihitung. */
  nilai: number | null;
  butirTerhitung: number;
  butirKosong: number;
  peringatan: string[];
}

export interface HasilIndeksDimensi {
  dimensi: string;
  /** Persentase 0–100. `null` bila tidak ada pasangan yang dihitung. */
  indeks: number | null;
  /** Jumlah pasangan (responden, butir) yang benar-benar masuk perhitungan. */
  pasanganDihitung: number;
}

export function hitungNilaiResponden(
  responden: JawabanResponden,
  skema: Skema,
): HasilNilaiResponden {
  let totalBobot = 0;
  let totalTerbobot = 0;
  let butirTerhitung = 0;
  let butirKosong = 0;
  const peringatan: string[] = [];

  for (const butir of skema.butir) {
    const skorMaks = skorMaksAturan(butir.aturan);
    if (skorMaks === null) continue;

    const hasil = skorJawaban(responden.jawaban[butir.kolomAsal], butir.aturan);

    if (hasil.status === 'peringatan') {
      peringatan.push(`${butir.label}: ${hasil.pesan}`);
      continue;
    }
    if (hasil.status === 'butuh-manual' || hasil.status === 'diabaikan') continue;

    if (hasil.status === 'kosong') {
      butirKosong += 1;
      if (skema.perlakuanKosong === 'abaikan') continue;
      totalBobot += butir.bobot;
      continue;
    }

    butirTerhitung += 1;
    totalBobot += butir.bobot;
    totalTerbobot += butir.bobot * (hasil.skor / skorMaks);
  }

  const nilai = totalBobot === 0 ? null : (totalTerbobot / totalBobot) * 100;
  return { respondenId: responden.id, nilai, butirTerhitung, butirKosong, peringatan };
}

interface Akumulasi {
  jumlahSkor: number;
  jumlahMaks: number;
  pasangan: number;
}

export function hitungIndeksDimensi(
  semuaResponden: JawabanResponden[],
  skema: Skema,
): HasilIndeksDimensi[] {
  const urutanDimensi: string[] = [];
  const akumulasi = new Map<string, Akumulasi>();

  for (const butir of skema.butir) {
    const skorMaks = skorMaksAturan(butir.aturan);
    if (skorMaks === null) continue;
    if (butir.aturan.jenis === 'manual') continue;

    if (!akumulasi.has(butir.dimensi)) {
      urutanDimensi.push(butir.dimensi);
      akumulasi.set(butir.dimensi, { jumlahSkor: 0, jumlahMaks: 0, pasangan: 0 });
    }
    const agg = akumulasi.get(butir.dimensi);
    if (agg === undefined) continue;

    for (const responden of semuaResponden) {
      const hasil = skorJawaban(responden.jawaban[butir.kolomAsal], butir.aturan);

      if (hasil.status === 'terhitung') {
        agg.jumlahSkor += hasil.skor;
        agg.jumlahMaks += skorMaks;
        agg.pasangan += 1;
        continue;
      }
      if (hasil.status === 'kosong' && skema.perlakuanKosong === 'nol') {
        agg.jumlahMaks += skorMaks;
        agg.pasangan += 1;
      }
    }
  }

  return urutanDimensi.map((dimensi) => {
    const agg = akumulasi.get(dimensi);
    if (agg === undefined || agg.jumlahMaks === 0) {
      return { dimensi, indeks: null, pasanganDihitung: 0 };
    }
    return {
      dimensi,
      indeks: (agg.jumlahSkor / agg.jumlahMaks) * 100,
      pasanganDihitung: agg.pasangan,
    };
  });
}

export function hitungIndeksKeseluruhan(
  hasilDimensi: HasilIndeksDimensi[],
  skema: Skema,
): number | null {
  const bobotDimensi = new Map<string, number>();
  for (const butir of skema.butir) {
    if (butir.aturan.jenis === 'abaikan' || butir.aturan.jenis === 'manual') continue;
    const sekarang = bobotDimensi.get(butir.dimensi);
    bobotDimensi.set(butir.dimensi, (sekarang === undefined ? 0 : sekarang) + butir.bobot);
  }

  let totalBobot = 0;
  let total = 0;
  for (const hasil of hasilDimensi) {
    if (hasil.indeks === null) continue;
    const bobot = bobotDimensi.get(hasil.dimensi);
    if (bobot === undefined) continue;
    totalBobot += bobot;
    total += bobot * hasil.indeks;
  }

  return totalBobot === 0 ? null : total / totalBobot;
}
