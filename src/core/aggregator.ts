import { jawabanKolom, rentangNilaiManual, skorJawaban, skorMaksAturan } from './scorer';
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
  /** Jumlah pasangan (responden, butir) yang masih menunggu nilai dari penilai. */
  pasanganMenunggu: number;
  /**
   * Jumlah bobot butir yang menyumbang setidaknya satu pasangan terhitung.
   * Butir yang masih menunggu tidak ikut, supaya bobotnya tidak menggelembungkan
   * dimensi ini pada indeks keseluruhan.
   */
  bobotDihitung: number;
  /** Peringatan tingkat dimensi. Pesan yang sama hanya muncul sekali. */
  peringatan: string[];
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

    const hasil = skorJawaban(jawabanKolom(responden.jawaban, butir.kolomAsal), butir.aturan);

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
  /** Jumlah rasio skor/skorMaks, bukan jumlah skor mentah. */
  jumlahRasio: number;
  pasangan: number;
  pasanganMenunggu: number;
  bobotDihitung: number;
  peringatan: Set<string>;
}

function manualResponden(
  nilaiManual: NilaiManualSesi | undefined,
  respondenId: string,
): NilaiManualResponden | undefined {
  return nilaiManual === undefined ? undefined : nilaiManual.get(respondenId);
}

export function hitungIndeksDimensi(
  semuaResponden: JawabanResponden[],
  skema: Skema,
  nilaiManual?: NilaiManualSesi,
): HasilIndeksDimensi[] {
  // Map menjaga urutan kemunculan dimensi, jadi tidak perlu daftar terpisah.
  const akumulasi = new Map<string, Akumulasi>();

  const akuDimensi = (dimensi: string): Akumulasi => {
    const ada = akumulasi.get(dimensi);
    if (ada !== undefined) return ada;
    const baru: Akumulasi = {
      jumlahRasio: 0,
      pasangan: 0,
      pasanganMenunggu: 0,
      bobotDihitung: 0,
      peringatan: new Set<string>(),
    };
    akumulasi.set(dimensi, baru);
    return baru;
  };

  for (const butir of skema.butir) {
    const skorMaks = skorMaksAturan(butir.aturan);

    if (skorMaks === null) {
      // Kolom abaikan tidak punya indeks, tetapi nilai manual yang terlanjur
      // ditulis untuknya tidak boleh hilang tanpa peringatan.
      for (const responden of semuaResponden) {
        const manual = periksaNilaiManual(butir, manualResponden(nilaiManual, responden.id));
        if (manual.status === 'di luar rentang')
          akuDimensi(butir.dimensi).peringatan.add(manual.pesan);
      }
      continue;
    }
    if (!Number.isFinite(skorMaks) || skorMaks <= 0) continue;

    const agg = akuDimensi(butir.dimensi);
    let pasanganButir = 0;

    for (const responden of semuaResponden) {
      const manual = periksaNilaiManual(butir, manualResponden(nilaiManual, responden.id));
      if (manual.status === 'di luar rentang') {
        agg.peringatan.add(manual.pesan);
        continue;
      }
      if (manual.status === 'sah') {
        agg.jumlahRasio += manual.nilai / skorMaks;
        agg.pasangan += 1;
        pasanganButir += 1;
        continue;
      }

      const hasil = skorJawaban(jawabanKolom(responden.jawaban, butir.kolomAsal), butir.aturan);

      if (hasil.status === 'terhitung') {
        agg.jumlahRasio += hasil.skor / skorMaks;
        agg.pasangan += 1;
        pasanganButir += 1;
        continue;
      }
      if (hasil.status === 'butuh-manual') {
        agg.pasanganMenunggu += 1;
        continue;
      }
      if (hasil.status === 'peringatan') {
        agg.peringatan.add(`${butir.label}: ${hasil.pesan}`);
        continue;
      }
      if (hasil.status === 'kosong' && skema.perlakuanKosong === 'nol') {
        agg.pasangan += 1;
        pasanganButir += 1;
      }
    }

    if (pasanganButir > 0) agg.bobotDihitung += butir.bobot;
  }

  return [...akumulasi].map(([dimensi, agg]) => ({
    dimensi,
    // Rasio dirata-ratakan per pasangan, bukan dijumlahkan lalu dibagi jumlah
    // skor maksimum: kalau tidak, satu esai 0..100 membobot dirinya sendiri jauh
    // lebih berat daripada belasan butir Likert yang sedimensi dengannya.
    indeks: agg.pasangan === 0 ? null : (agg.jumlahRasio / agg.pasangan) * 100,
    pasanganDihitung: agg.pasangan,
    pasanganMenunggu: agg.pasanganMenunggu,
    bobotDihitung: agg.bobotDihitung,
    peringatan: [...agg.peringatan],
  }));
}

export function hitungIndeksKeseluruhan(
  hasilDimensi: HasilIndeksDimensi[],
  skema: Skema,
): number | null {
  const dimensiSkema = new Set<string>();
  for (const butir of skema.butir) {
    if (butir.aturan.jenis === 'abaikan') continue;
    dimensiSkema.add(butir.dimensi);
  }

  let totalBobot = 0;
  let total = 0;
  for (const hasil of hasilDimensi) {
    if (hasil.indeks === null) continue;
    if (!dimensiSkema.has(hasil.dimensi)) continue;
    // Bobot yang dipakai adalah bobot butir yang benar-benar menyumbang, bukan
    // seluruh bobot dimensi pada skema: butir yang masih menunggu penilaian
    // jangan sampai menggelembungkan dimensinya.
    totalBobot += hasil.bobotDihitung;
    total += hasil.bobotDihitung * hasil.indeks;
  }

  return totalBobot === 0 ? null : total / totalBobot;
}
