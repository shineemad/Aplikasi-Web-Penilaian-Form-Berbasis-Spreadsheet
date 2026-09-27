import type { BandingWaktu } from '../core/peringkat';

export type FormatTanggal = 'DMY' | 'MDY';

export type HasilTebakFormat =
  | { status: 'yakin'; format: FormatTanggal; alasan: string }
  | { status: 'rancu'; alasan: string };

interface Bagian {
  pertama: number;
  kedua: number;
  tahun: number;
  jam: number;
  menit: number;
  detik: number;
}

// Berjangkar di kedua ujung: sisa seperti " PM" yang diabaikan akan membaca 21:00 sebagai 09:00.
const POLA = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

function uraikan(capWaktu: string): Bagian | null {
  const cocok = POLA.exec(capWaktu.trim());
  if (cocok === null) return null;

  const [, pertama, kedua, tahun, jam, menit, detik] = cocok;
  if (
    pertama === undefined ||
    kedua === undefined ||
    tahun === undefined ||
    jam === undefined ||
    menit === undefined
  ) {
    return null;
  }

  return {
    pertama: Number(pertama),
    kedua: Number(kedua),
    tahun: Number(tahun),
    jam: Number(jam),
    menit: Number(menit),
    detik: detik === undefined ? 0 : Number(detik),
  };
}

const PETUNJUK =
  'Pilih sendiri format tanggalnya pada layar pemetaan. ' +
  'Salah memilih akan mengubah urutan peringkat tanpa pesan error apa pun.';

export function tebakFormatTanggal(capWaktu: string[]): HasilTebakFormat {
  let buktiDMY = false;
  let buktiMDY = false;
  let adaTerbaca = false;

  for (const satu of capWaktu) {
    const bagian = uraikan(satu);
    if (bagian === null) continue;

    adaTerbaca = true;
    if (bagian.pertama > 12) buktiDMY = true;
    if (bagian.kedua > 12) buktiMDY = true;
  }

  if (!adaTerbaca) {
    return {
      status: 'rancu',
      alasan:
        'Tidak ada satu pun isi kolom ini yang terbaca sebagai cap waktu ' +
        '(bentuk yang dikenali: 25/4/2026 08:00:00, tanpa AM/PM), jadi memilih format ' +
        'tanggal tidak akan menolong. Periksa apakah kolom ini memang kolom cap waktu; ' +
        'bila bukan, ubah perannya. Selama belum terbaca, seri peringkat tidak dipecah ' +
        'berdasarkan waktu kirim.',
    };
  }

  if (buktiDMY && buktiMDY) {
    return {
      status: 'rancu',
      alasan:
        'Kolom cap waktu memuat baris yang hanya masuk akal sebagai hari/bulan ' +
        `dan baris lain yang hanya masuk akal sebagai bulan/hari. ${PETUNJUK}`,
    };
  }

  if (buktiDMY) {
    return {
      status: 'yakin',
      format: 'DMY',
      alasan: 'Ada baris yang komponen pertamanya di atas 12, jadi urutannya hari/bulan/tahun.',
    };
  }

  if (buktiMDY) {
    return {
      status: 'yakin',
      format: 'MDY',
      alasan: 'Ada baris yang komponen keduanya di atas 12, jadi urutannya bulan/hari/tahun.',
    };
  }

  return {
    status: 'rancu',
    alasan:
      'Seluruh tanggal pada kolom ini bernilai 12 ke bawah, sehingga hari dan bulan ' +
      `tidak dapat dibedakan. ${PETUNJUK}`,
  };
}

/** Cap waktu tak terbaca diberi kunci terbesar agar selalu jatuh di belakang. */
const KUNCI_TAK_TERBACA = Number.MAX_SAFE_INTEGER;

function kunciUrut(capWaktu: string, format: FormatTanggal): number {
  const bagian = uraikan(capWaktu);
  if (bagian === null) return KUNCI_TAK_TERBACA;

  const hari = format === 'DMY' ? bagian.pertama : bagian.kedua;
  const bulan = format === 'DMY' ? bagian.kedua : bagian.pertama;

  return (
    bagian.tahun * 10000000000 +
    bulan * 100000000 +
    hari * 1000000 +
    bagian.jam * 10000 +
    bagian.menit * 100 +
    bagian.detik
  );
}

export function buatBandingWaktu(format: FormatTanggal): BandingWaktu {
  return (a, b) => kunciUrut(a, format) - kunciUrut(b, format);
}
