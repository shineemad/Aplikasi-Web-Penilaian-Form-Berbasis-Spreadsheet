import * as XLSX from "xlsx";

/** Membangun buku kerja .xlsx di memori, untuk diumpankan ke importer. */
export function bukuKerjaXlsx(data: string[][]): ArrayBuffer {
  const lembar = XLSX.utils.aoa_to_sheet(data);
  const buku = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(buku, lembar, "Sheet1");
  return XLSX.write(buku, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const TINGKAT = [
  "Strongly disagree",
  "Disagree",
  "Neutral",
  "Agree",
  "Strongly agree",
] as const;
export type Tingkat = (typeof TINGKAT)[number];

/**
 * Ragam penulisan tiap opsi seperti pada instrumen asli: "Strongly Agree" dan
 * "Strongly agree" muncul bersamaan, begitu pula spasi ganda dan spasi tepi.
 */
const RAGAM: Record<Tingkat, [string, string, string]> = {
  "Strongly disagree": [
    "Strongly disagree",
    "Strongly Disagree",
    " strongly  disagree ",
  ],
  Disagree: ["Disagree", "disagree", "Disagree "],
  Neutral: ["Neutral", "NEUTRAL", " neutral"],
  Agree: ["Agree", "agree", "AGREE"],
  "Strongly agree": ["Strongly Agree", "Strongly agree", "strongly  agree"],
};

/** Teks opsi untuk butir ke-n, dengan penulisan yang berganti-ganti antar butir. */
function tulisOpsi(tingkat: Tingkat, n: number): string {
  const teks = RAGAM[tingkat][n % 3];
  return teks === undefined ? tingkat : teks;
}

function headerPostTest(): string[] {
  const header = ["Email", "Name", "Age", "Gender"];
  for (let n = 1; n <= 20; n += 1) header.push(`q${n}`);
  return header;
}

/**
 * Replika instrumen Post-Test: Email wajib, Name opsional, dua kolom meta,
 * lalu 20 butir. Butir ke-11 sengaja diisi Yes/No/Maybe pada sebagian baris,
 * seperti pada form aslinya.
 */
export function bukuKerjaPostTest(jumlahBaris: number): ArrayBuffer {
  const data: string[][] = [headerPostTest()];
  for (let i = 0; i < jumlahBaris; i += 1) {
    const baris = [
      `peserta${i}@example.com`,
      i % 7 === 0 ? "" : `Peserta ${i}`,
      String(18 + (i % 5)),
      i % 2 === 0 ? "female" : "male",
    ];
    for (let n = 1; n <= 20; n += 1) {
      const tingkat = TINGKAT[(i + n) % TINGKAT.length];
      baris.push(
        n === 11 && i % 3 === 0
          ? "Maybe"
          : tulisOpsi(tingkat === undefined ? "Agree" : tingkat, n),
      );
    }
    data.push(baris);
  }
  return bukuKerjaXlsx(data);
}

export interface PesertaFixture {
  email: string;
  nama: string;
  /** Tingkat yang sama untuk seluruh 20 butir, supaya nilainya mudah dihitung tangan. */
  tingkat: Tingkat;
  /** Jawaban yang menggantikan tingkat pada butir tertentu, mis. { q11: 'Maybe' }. */
  ganti?: Record<string, string>;
  /** Isi kolom Timestamp. Kolom itu hanya ada bila sedikitnya satu peserta mengisinya. */
  waktu?: string;
}

/**
 * Satu sesi berisi peserta pilihan. `null` menjadi baris kosong, untuk menguji
 * bahwa nomor baris asal tidak bergeser.
 */
export function bukuKerjaSesi(
  peserta: (PesertaFixture | null)[],
  format: "xlsx" | "csv",
): ArrayBuffer {
  // Google Forms menaruh Timestamp sebagai kolom pertama.
  const denganWaktu = peserta.some(
    (satu) => satu !== null && satu.waktu !== undefined,
  );
  const data: string[][] = [
    denganWaktu ? ["Timestamp", ...headerPostTest()] : headerPostTest(),
  ];
  for (const satu of peserta) {
    if (satu === null) {
      data.push([]);
      continue;
    }
    const baris = [satu.email, satu.nama, "20", "female"];
    if (denganWaktu) baris.unshift(satu.waktu === undefined ? "" : satu.waktu);
    for (let n = 1; n <= 20; n += 1) {
      const pengganti = satu.ganti?.[`q${n}`];
      baris.push(
        pengganti === undefined ? tulisOpsi(satu.tingkat, n) : pengganti,
      );
    }
    data.push(baris);
  }

  if (format === "xlsx") return bukuKerjaXlsx(data);
  const teks = data.map((baris) => baris.join(",")).join("\n") + "\n";
  return new TextEncoder().encode(teks).buffer as ArrayBuffer;
}
