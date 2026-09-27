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

/**
 * Menolak tabel yang barisnya tidak sepanjang kolomnya. Tanpa penjaga ini Excel
 * dan PDF bisa mencetak isi berbeda dari tabel yang sama: baris kurang sel
 * membuat Excel mengosongkan sel sementara PDF menebaknya, dan baris lebih sel
 * membuat Excel menambah kolom tanpa judul sementara PDF membuangnya diam-diam.
 */
export function pastikanTabelSah(tabel: TabelTampil): void {
  const jumlahKolom = tabel.kolom.length;

  if (jumlahKolom === 0) {
    throw new Error(
      `Tabel "${tabel.judul}" tidak punya satu kolom pun, padahal tabel tanpa kolom tidak bisa ` +
        'dicetak ke Excel maupun PDF. Bangun tabelnya lewat bangunTabelGabungan atau ' +
        'bangunTabelRingkasan, jangan menyusun objek TabelTampil sendiri.',
    );
  }

  for (let i = 0; i < tabel.baris.length; i += 1) {
    const baris = tabel.baris[i];
    if (baris === undefined || baris.length === jumlahKolom) continue;
    throw new Error(
      `Baris ke-${i} pada tabel "${tabel.judul}" berisi ${baris === undefined ? 0 : baris.length} ` +
        `sel, padahal tabelnya punya ${jumlahKolom} kolom. Setiap baris harus sepanjang kolom: ` +
        'bila tidak, Excel dan PDF akan mencetak isi yang berbeda untuk tabel yang sama. ' +
        'Pakai TANDA_KOSONG untuk sel yang memang tidak ada isinya, jangan menghilangkan selnya.',
    );
  }

  const { kolomIdentitas } = tabel;
  if (!Number.isInteger(kolomIdentitas) || kolomIdentitas < 0 || kolomIdentitas > jumlahKolom) {
    throw new Error(
      `kolomIdentitas tabel "${tabel.judul}" bernilai ${kolomIdentitas}, padahal ia harus bilangan ` +
        `bulat antara 0 dan ${jumlahKolom} (jumlah kolom tabel ini). Nilai itu menentukan berapa ` +
        'kolom terdepan yang diulang pada tiap potongan saat tabel dipecah di PDF.',
    );
  }
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
