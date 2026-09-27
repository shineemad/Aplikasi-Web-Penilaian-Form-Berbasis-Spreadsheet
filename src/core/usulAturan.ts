import { normalisasiTeks } from './normalisasi';
import type { Aturan } from './tipe';

export type UsulAturan =
  | { status: 'usul'; aturan: Aturan; alasan: string }
  | { status: 'tidak-yakin'; alasan: string; contohNilai: string[] };

interface SkalaDikenal {
  nama: string;
  skorMaks: number;
  peta: Record<string, number>;
}

const SKALA: SkalaDikenal[] = [
  {
    nama: 'Likert persetujuan 5 poin (Inggris)',
    skorMaks: 5,
    peta: {
      'strongly disagree': 1,
      disagree: 2,
      neutral: 3,
      agree: 4,
      'strongly agree': 5,
    },
  },
  {
    nama: 'Likert persetujuan 5 poin (Indonesia)',
    skorMaks: 5,
    peta: {
      'sangat tidak setuju': 1,
      'tidak setuju': 2,
      netral: 3,
      setuju: 4,
      'sangat setuju': 5,
    },
  },
];

/** Di bawah ini tidak ada cukup ragam untuk membedakan skala dari sekadar pilihan bebas. */
const MIN_OPSI_BERBEDA = 3;
const MAKS_OPSI_SEBELUM_TEKS_BEBAS = 20;
const PANJANG_RATA_TEKS_BEBAS = 40;
const MAKS_CONTOH = 5;

export function usulkanAturan(nilai: string[]): UsulAturan {
  const jumlahPerBentuk = new Map<string, { teks: string; jumlah: number }>();
  let totalPanjang = 0;
  let totalTerisi = 0;

  for (const satu of nilai) {
    const bentuk = normalisasiTeks(satu);
    if (bentuk === '') continue;

    totalTerisi += 1;
    totalPanjang += bentuk.length;

    const sudah = jumlahPerBentuk.get(bentuk);
    if (sudah === undefined) jumlahPerBentuk.set(bentuk, { teks: satu.trim(), jumlah: 1 });
    else sudah.jumlah += 1;
  }

  if (totalTerisi === 0) {
    return {
      status: 'tidak-yakin',
      alasan:
        'Kolom ini tidak berisi satu jawaban pun, sehingga aturannya tidak dapat ditebak. ' +
        'Periksa apakah berkas yang diunggah sudah benar; bila kolom ini memang tidak dipakai, ' +
        'pilih aturan abaikan atau jadikan kolom meta.',
      contohNilai: [],
    };
  }

  const contohNilai = [...jumlahPerBentuk.values()]
    .sort((a, b) => {
      if (b.jumlah !== a.jumlah) return b.jumlah - a.jumlah;
      return a.teks.localeCompare(b.teks);
    })
    .slice(0, MAKS_CONTOH)
    .map((satu) => satu.teks);

  const bentukTerlihat = [...jumlahPerBentuk.keys()];

  if (
    bentukTerlihat.length > MAKS_OPSI_SEBELUM_TEKS_BEBAS ||
    totalPanjang / totalTerisi > PANJANG_RATA_TEKS_BEBAS
  ) {
    return {
      status: 'tidak-yakin',
      alasan:
        'Isi kolom ini tampak berupa teks bebas, bukan pilihan. ' +
        'Bila memang jawaban terbuka, pilih aturan abaikan agar tidak ikut perhitungan.',
      contohNilai,
    };
  }

  if (bentukTerlihat.length < MIN_OPSI_BERBEDA) {
    return {
      status: 'tidak-yakin',
      alasan:
        `Kolom ini hanya memuat ${bentukTerlihat.length} jawaban berbeda, ` +
        'terlalu sedikit untuk mengenali skalanya. Tentukan aturannya sendiri.',
      contohNilai,
    };
  }

  for (const skala of SKALA) {
    const semuaDikenal = bentukTerlihat.every((bentuk) => Object.hasOwn(skala.peta, bentuk));
    if (!semuaDikenal) continue;

    // skorMaks tidak pernah diturunkan dari data, jadi skala yang tidak lengkap
    // tidak bisa dibedakan dari skala yang lebih pendek. Admin yang memutuskan.
    const hilang = Object.keys(skala.peta).filter((opsi) => !bentukTerlihat.includes(opsi));
    if (hilang.length > 0) {
      return {
        status: 'tidak-yakin',
        alasan:
          `Seluruh jawaban pada kolom ini termasuk ${skala.nama}, tetapi opsi ` +
          `${hilang.map((opsi) => `"${opsi}"`).join(', ')} tidak pernah dipilih. ` +
          `Data tidak dapat membedakan skala ${skala.skorMaks} poin yang sebagian opsinya ` +
          `tidak terpakai dari skala ${bentukTerlihat.length} poin sungguhan, padahal nilainya berbeda. ` +
          `Periksa formulir aslinya: bila memang ${skala.skorMaks} opsi, pakai peta ${skala.skorMaks} poin; ` +
          'bila tidak, susun petanya sendiri.',
        contohNilai,
      };
    }

    return {
      status: 'usul',
      aturan: { jenis: 'peta-opsi', peta: { ...skala.peta }, skorMaks: skala.skorMaks },
      alasan: `Seluruh ${skala.skorMaks} opsi ${skala.nama} muncul pada kolom ini.`,
    };
  }

  return {
    status: 'tidak-yakin',
    alasan:
      'Jawaban pada kolom ini tidak cocok dengan skala mana pun yang dikenali. ' +
      'Susun petanya sendiri, atau pilih aturan abaikan.',
    contohNilai,
  };
}
