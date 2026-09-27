import type { HasilIndeksDimensi } from './aggregator';
import type { Kategori } from './kategori';
import type { HasilGabungan } from './merger';
import { formatAngka, kategoriTampil, TANDA_KOSONG } from './penyajian';

export interface TabelTampil {
  judul: string;
  kolom: string[];
  /** Seluruh sel sudah berupa teks siap tampil. Penulis ekspor hanya menyalinnya. */
  baris: string[][];
  /** Jumlah kolom paling kiri yang diulang pada tiap potongan saat tabel dipecah. */
  kolomIdentitas: number;
}

export interface OpsiTabel {
  desimal: number;
  anonim: boolean;
  /** Ditetapkan pemanggil, tidak ditebak dari data: selisih kosong bisa berarti dua hal. */
  adaPembanding: boolean;
  kategori?: Kategori[];
}

function kunciMeta(hasil: HasilGabungan): string[] {
  const kunci = new Set<string>();
  for (const satu of hasil.baris) {
    for (const nama of Object.keys(satu.meta)) kunci.add(nama);
  }
  return [...kunci].sort();
}

export function bangunTabelGabungan(hasil: HasilGabungan, opsi: OpsiTabel): TabelTampil {
  const meta = kunciMeta(hasil);

  const kolomIdentitas = opsi.anonim ? 1 : 3;
  const kolom = opsi.anonim ? ['ID'] : ['ID', 'Email', 'Nama'];
  kolom.push(...meta);

  for (const sesi of hasil.urutanSesi) {
    kolom.push(sesi.namaSesi, `Status ${sesi.namaSesi}`);
  }
  if (opsi.adaPembanding) kolom.push('Selisih');
  kolom.push('Status Gabungan');

  const baris = hasil.baris.map((satu) => {
    const sel: string[] = opsi.anonim
      ? [satu.id]
      : [satu.id, satu.email, satu.nama === null ? TANDA_KOSONG : satu.nama];

    for (const nama of meta) {
      const isi = satu.meta[nama];
      sel.push(isi === undefined ? TANDA_KOSONG : isi);
    }

    for (const sesi of hasil.urutanSesi) {
      const nilai = satu.nilaiPerSesi[sesi.sesiId];
      sel.push(formatAngka(nilai === undefined ? null : nilai, opsi));

      const status = satu.statusPerSesi[sesi.sesiId];
      sel.push(status === undefined ? TANDA_KOSONG : status);
    }

    if (opsi.adaPembanding) sel.push(formatAngka(satu.selisih, opsi));
    sel.push(satu.statusGabungan);
    return sel;
  });

  return { judul: 'Rekap Gabungan', kolom, baris, kolomIdentitas };
}

export function bangunTabelRingkasan(
  dimensi: HasilIndeksDimensi[],
  keseluruhan: number | null,
  opsi: { desimal: number; kategori?: Kategori[] },
): TabelTampil {
  const baris = dimensi.map((satu) => [
    satu.dimensi,
    formatAngka(satu.indeks, opsi),
    kategoriTampil(satu.indeks, opsi),
    String(satu.pasanganDihitung),
  ]);

  baris.push([
    'Keseluruhan',
    formatAngka(keseluruhan, opsi),
    kategoriTampil(keseluruhan, opsi),
    TANDA_KOSONG,
  ]);

  return {
    judul: 'Ringkasan Dimensi',
    kolom: ['Dimensi', 'Indeks', 'Kategori', 'Pasangan Dihitung'],
    baris,
    kolomIdentitas: 1,
  };
}
