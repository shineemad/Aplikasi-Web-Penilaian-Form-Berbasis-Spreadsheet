import { hitungNilaiResponden } from './aggregator';
import { hitungKelengkapan } from './kelengkapan';
import type { NilaiSesi } from './merger';
import type { JawabanResponden, Skema } from './tipe';

export interface MetaSesi {
  sesiId: string;
  namaSesi: string;
}

/** Responden beserta kolom identitas tambahan yang ikut dibawa ke tabel gabungan. */
export interface RespondenSesi extends JawabanResponden {
  meta: Record<string, string>;
}

export function bangunNilaiSesi(
  meta: MetaSesi,
  responden: RespondenSesi[],
  skema: Skema,
): NilaiSesi {
  const nilai = new Map<string, number | null>();
  const identitas = new Map<
    string,
    { email: string; nama: string | null; meta: Record<string, string> }
  >();
  const kurang = new Map<string, number>();
  const peringatan = new Map<string, string[]>();

  for (const satu of responden) {
    const hasil = hitungNilaiResponden(satu, skema);
    nilai.set(satu.id, hasil.nilai);
    identitas.set(satu.id, { email: satu.email, nama: satu.nama, meta: satu.meta });

    const kelengkapan = hitungKelengkapan(satu, skema);
    if (kelengkapan.status === 'kurang') kurang.set(satu.id, kelengkapan.jumlahKosong);
    else if (kelengkapan.status === 'kosong') {
      kurang.set(satu.id, jumlahKolomDiminta(skema));
    } else kurang.delete(satu.id);

    if (hasil.peringatan.length > 0) peringatan.set(satu.id, hasil.peringatan);
    else peringatan.delete(satu.id);
  }

  return {
    sesiId: meta.sesiId,
    namaSesi: meta.namaSesi,
    skemaId: skema.skemaId,
    nilai,
    identitas,
    kurang,
    peringatan,
  };
}

function jumlahKolomDiminta(skema: Skema): number {
  let jumlah = 0;
  for (const butir of skema.butir) {
    if (butir.aturan.jenis === 'peta-opsi' || butir.aturan.jenis === 'kunci-jawaban') jumlah += 1;
  }
  return jumlah;
}
