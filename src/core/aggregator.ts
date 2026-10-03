import { rentangNilaiManual, skorJawaban, skorMaksAturan } from './scorer';
import type {
  ButirSkema,
  JawabanResponden,
  NilaiManualResponden,
  NilaiManualSesi,
  Skema,
} from './tipe';

export interface HasilNilaiResponden {
  respondenId: string;
  /** Skala 0–100. `null` bila tidak ada satu pun butir yang dapat dihitung. */
  nilai: number | null;
  butirTerhitung: number;
  butirKosong: number;
  /**
   * Butir manual yang penilainya belum mengisi nilai. Dikeluarkan dari pembilang
   * dan penyebut, tetapi dihitung di sini supaya tidak hilang tanpa jejak.
   */
  butirMenunggu: number;
  /** kolomAsal butir yang skor otomatisnya ditimpa nilai dari penilai. */
  butirDikoreksi: string[];
  peringatan: string[];
}

export interface HasilIndeksDimensi {
  dimensi: string;
  /** Persentase 0–100. `null` bila tidak ada pasangan yang dihitung. */
  indeks: number | null;
  /** Jumlah pasangan (responden, butir) yang benar-benar masuk perhitungan. */
  pasanganDihitung: number;
}

/** Hasil pemeriksaan satu nilai manual terhadap rentang butirnya. */
type PeriksaManual =
  | { status: 'tidak ada' }
  | { status: 'sah'; nilai: number; koreksi: boolean }
  | { status: 'di luar rentang'; pesan: string };

function periksaNilaiManual(
  butir: ButirSkema,
  nilaiManual: NilaiManualResponden | undefined,
): PeriksaManual {
  const nilai = nilaiManual === undefined ? undefined : nilaiManual.get(butir.kolomAsal);
  if (nilai === undefined) return { status: 'tidak ada' };

  const rentang = rentangNilaiManual(butir.aturan);
  if (rentang === null) {
    return {
      status: 'di luar rentang',
      pesan: `${butir.label}: ada nilai ${nilai} dari penilai, tetapi kolom ini ditandai abaikan sehingga nilainya tidak dipakai.`,
    };
  }
  if (!Number.isFinite(nilai) || nilai < rentang.min || nilai > rentang.maks) {
    return {
      status: 'di luar rentang',
      pesan: `${butir.label}: nilai ${nilai} di luar rentang ${rentang.min}–${rentang.maks}, butir ini dikeluarkan dari perhitungan. Betulkan nilainya, jangan dibulatkan.`,
    };
  }
  return { status: 'sah', nilai, koreksi: butir.aturan.jenis !== 'manual' };
}

export function hitungNilaiResponden(
  responden: JawabanResponden,
  skema: Skema,
  nilaiManual?: NilaiManualResponden,
): HasilNilaiResponden {
  let totalBobot = 0;
  let totalTerbobot = 0;
  let butirTerhitung = 0;
  let butirKosong = 0;
  let butirMenunggu = 0;
  const butirDikoreksi: string[] = [];
  const peringatan: string[] = [];

  for (const butir of skema.butir) {
    const manual = periksaNilaiManual(butir, nilaiManual);
    if (manual.status === 'di luar rentang') {
      peringatan.push(manual.pesan);
      continue;
    }

    const skorMaks = skorMaksAturan(butir.aturan);
    if (skorMaks === null) continue;
    if (!Number.isFinite(skorMaks) || skorMaks <= 0) {
      peringatan.push(
        `${butir.label}: skor maksimum tidak sah (${skorMaks}), butir ini dikeluarkan dari perhitungan.`,
      );
      continue;
    }

    if (manual.status === 'sah') {
      if (manual.koreksi) butirDikoreksi.push(butir.kolomAsal);
      butirTerhitung += 1;
      totalBobot += butir.bobot;
      totalTerbobot += butir.bobot * (manual.nilai / skorMaks);
      continue;
    }

    const hasil = skorJawaban(responden.jawaban[butir.kolomAsal], butir.aturan);

    if (hasil.status === 'peringatan') {
      peringatan.push(`${butir.label}: ${hasil.pesan}`);
      continue;
    }
    // Butir manual yang belum dinilai dikeluarkan dari kedua sisi pecahan tanpa
    // memedulikan perlakuanKosong: yang belum bekerja adalah penilai.
    if (hasil.status === 'butuh-manual') {
      butirMenunggu += 1;
      continue;
    }
    if (hasil.status === 'diabaikan') continue;

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
  return {
    respondenId: responden.id,
    nilai,
    butirTerhitung,
    butirKosong,
    butirMenunggu,
    butirDikoreksi,
    peringatan,
  };
}

interface Akumulasi {
  jumlahSkor: number;
  jumlahMaks: number;
  pasangan: number;
}

export function hitungIndeksDimensi(
  semuaResponden: JawabanResponden[],
  skema: Skema,
  nilaiManual?: NilaiManualSesi,
): HasilIndeksDimensi[] {
  const urutanDimensi: string[] = [];
  const akumulasi = new Map<string, Akumulasi>();

  for (const butir of skema.butir) {
    const skorMaks = skorMaksAturan(butir.aturan);
    if (skorMaks === null) continue;
    if (!Number.isFinite(skorMaks) || skorMaks <= 0) continue;

    if (!akumulasi.has(butir.dimensi)) {
      urutanDimensi.push(butir.dimensi);
      akumulasi.set(butir.dimensi, { jumlahSkor: 0, jumlahMaks: 0, pasangan: 0 });
    }
    const agg = akumulasi.get(butir.dimensi);
    if (agg === undefined) continue;

    for (const responden of semuaResponden) {
      const manual = periksaNilaiManual(
        butir,
        nilaiManual === undefined ? undefined : nilaiManual.get(responden.id),
      );
      if (manual.status === 'di luar rentang') continue;
      if (manual.status === 'sah') {
        agg.jumlahSkor += manual.nilai;
        agg.jumlahMaks += skorMaks;
        agg.pasangan += 1;
        continue;
      }

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
    if (butir.aturan.jenis === 'abaikan') continue;
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
