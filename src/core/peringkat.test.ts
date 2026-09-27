import { describe, expect, it } from "vitest";
import { hitungNilaiResponden } from "./aggregator";
import { urutkanPeringkat } from "./peringkat";
import type { BandingWaktu, BarisPeringkat } from "./peringkat";
import type { Skema } from "./tipe";

/** Pembanding uji: cap waktu ditulis sebagai angka agar urutannya jelas terbaca. */
const bandingAngka: BandingWaktu = (a, b) => Number(a) - Number(b);

function baris(
  isi: {
    id: string;
    nilai: number | null;
    terjawab?: number;
    waktu?: string;
  }[],
): BarisPeringkat[] {
  return isi.map((satu) => ({
    respondenId: satu.id,
    nilai: satu.nilai,
    jumlahTerjawab: satu.terjawab === undefined ? 0 : satu.terjawab,
    waktuKirim: satu.waktu === undefined ? null : satu.waktu,
  }));
}

describe("urutkanPeringkat", () => {
  it("mengurutkan dari nilai tertinggi", () => {
    const hasil = urutkanPeringkat(
      baris([
        { id: "b", nilai: 70 },
        { id: "a", nilai: 90 },
        { id: "c", nilai: 80 },
      ]),
      bandingAngka,
    );
    expect(hasil.map((h) => h.respondenId)).toEqual(["a", "c", "b"]);
    expect(hasil.map((h) => h.peringkat)).toEqual([1, 2, 3]);
  });

  it("memenangkan butir terjawab lebih banyak saat nilai seri", () => {
    const hasil = urutkanPeringkat(
      baris([
        { id: "sedikit", nilai: 80, terjawab: 10 },
        { id: "banyak", nilai: 80, terjawab: 18 },
      ]),
      bandingAngka,
    );
    expect(hasil[0]?.respondenId).toBe("banyak");
  });

  it("memenangkan cap waktu lebih awal saat nilai dan butir terjawab seri", () => {
    const hasil = urutkanPeringkat(
      baris([
        { id: "telat", nilai: 80, terjawab: 10, waktu: "200" },
        { id: "awal", nilai: 80, terjawab: 10, waktu: "100" },
      ]),
      bandingAngka,
    );
    expect(hasil[0]?.respondenId).toBe("awal");
  });

  it("menaruh yang tidak punya cap waktu di belakang yang punya", () => {
    const hasil = urutkanPeringkat(
      baris([
        { id: "tanpa", nilai: 80, terjawab: 10 },
        { id: "punya", nilai: 80, terjawab: 10, waktu: "999" },
      ]),
      bandingAngka,
    );
    expect(hasil[0]?.respondenId).toBe("punya");
  });

  it("memberi nomor peringkat yang sama bila seluruh kuncinya sama", () => {
    const hasil = urutkanPeringkat(
      baris([
        { id: "a", nilai: 80, terjawab: 10, waktu: "100" },
        { id: "b", nilai: 80, terjawab: 10, waktu: "100" },
        { id: "c", nilai: 70, terjawab: 10, waktu: "100" },
      ]),
      bandingAngka,
    );
    expect(hasil.map((h) => h.peringkat)).toEqual([1, 1, 3]);
  });

  it("memberi nomor yang sama kepada tiga yang seri lalu melompat ke empat", () => {
    const hasil = urutkanPeringkat(
      baris([
        { id: "d", nilai: 70, terjawab: 10, waktu: "100" },
        { id: "a", nilai: 80, terjawab: 10, waktu: "100" },
        { id: "b", nilai: 80, terjawab: 10, waktu: "100" },
        { id: "c", nilai: 80, terjawab: 10, waktu: "100" },
      ]),
      bandingAngka,
    );
    expect(hasil.map((h) => h.peringkat)).toEqual([1, 1, 1, 4]);
    expect(hasil[3]?.respondenId).toBe("d");
  });

  it("tidak memberi peringkat kepada responden bernilai null", () => {
    // Tidak menjawab apa pun bukan sama dengan menjawab dan bernilai terendah.
    const hasil = urutkanPeringkat(
      baris([
        { id: "kosong", nilai: null },
        { id: "ada", nilai: 40 },
      ]),
      bandingAngka,
    );
    expect(hasil[0]?.respondenId).toBe("ada");
    expect(hasil[0]?.peringkat).toBe(1);
    expect(hasil[1]?.respondenId).toBe("kosong");
    expect(hasil[1]?.peringkat).toBe(null);
  });

  it("tidak mengubah larik masukan", () => {
    const masukan = baris([
      { id: "b", nilai: 70 },
      { id: "a", nilai: 90 },
    ]);
    urutkanPeringkat(masukan, bandingAngka);
    expect(masukan.map((m) => m.respondenId)).toEqual(["b", "a"]);
  });

  it("mengembalikan larik kosong untuk masukan kosong", () => {
    expect(urutkanPeringkat([], bandingAngka)).toHaveLength(0);
  });

  it("memberi peringkat null kepada semua bila tidak ada satu pun nilai", () => {
    const hasil = urutkanPeringkat(
      baris([{ id: "a", nilai: null }]),
      bandingAngka,
    );
    expect(hasil[0]?.peringkat).toBe(null);
  });
});

const TEKS_SKOR = [
  "",
  "strongly disagree",
  "disagree",
  "neutral",
  "agree",
  "strongly agree",
];

const SKEMA_EMPAT_BUTIR: Skema = {
  skemaId: "s",
  perlakuanKosong: "abaikan",
  butir: ["q1", "q2", "q3", "q4"].map((kolomAsal) => ({
    kolomAsal,
    label: kolomAsal,
    dimensi: "d",
    aturan: {
      jenis: "peta-opsi" as const,
      skorMaks: 5,
      peta: {
        "strongly disagree": 1,
        disagree: 2,
        neutral: 3,
        agree: 4,
        "strongly agree": 5,
      },
    },
    bobot: 1,
  })),
};

/** Nilai sungguhan dari aggregator; `null` pada daftar skor berarti butir itu dikosongkan. */
function barisDariSkor(id: string, skor: (number | null)[]): BarisPeringkat {
  const jawaban: Record<string, string> = {};
  skor.forEach((satu, i) => {
    const teks = satu === null ? "" : TEKS_SKOR[satu];
    jawaban[`q${i + 1}`] = teks === undefined ? "" : teks;
  });
  const hasil = hitungNilaiResponden(
    { id, email: `${id}@x.com`, nama: null, jawaban },
    SKEMA_EMPAT_BUTIR,
  );
  return {
    respondenId: id,
    nilai: hasil.nilai,
    jumlahTerjawab: hasil.butirTerhitung,
    waktuKirim: null,
  };
}

describe("urutkanPeringkat pada nilai yang dijumlah dengan pecahan", () => {
  it("menganggap seri dua nilai yang sama secara matematis meski beda di bit terakhir", () => {
    // (5+1+3)/15 dan (2+4+3)/15 sama-sama 60, tetapi penjumlahan per butir
    // menghasilkan 60 dan 60.00000000000001.
    const a = barisDariSkor("a", [5, 1, 3, null]);
    const b = barisDariSkor("b", [2, 4, 3, null]);
    expect(a.nilai).toBeCloseTo(60, 8);
    expect(b.nilai).toBeCloseTo(60, 8);
    expect(a.nilai === b.nilai).toBe(false);

    const hasil = urutkanPeringkat([a, b], bandingAngka);
    expect(hasil.map((h) => h.peringkat)).toEqual([1, 1]);
  });

  it("membiarkan butir terjawab memutuskan seri, bukan derau pembulatan", () => {
    // 'lebihBanyak' menjawab empat butir tetapi nilainya kebetulan 60 persis;
    // 'lebihSedikit' menjawab tiga butir dan nilainya 60.00000000000001.
    const lebihBanyak = barisDariSkor("lebihBanyak", [5, 1, 3, 3]);
    const lebihSedikit = barisDariSkor("lebihSedikit", [2, 4, 3, null]);
    expect(lebihBanyak.jumlahTerjawab).toBe(4);
    expect(lebihSedikit.jumlahTerjawab).toBe(3);
    expect(
      lebihSedikit.nilai !== null &&
        lebihBanyak.nilai !== null &&
        lebihSedikit.nilai > lebihBanyak.nilai,
    ).toBe(true);

    const hasil = urutkanPeringkat([lebihSedikit, lebihBanyak], bandingAngka);
    expect(hasil.map((h) => h.respondenId)).toEqual([
      "lebihBanyak",
      "lebihSedikit",
    ]);
    expect(hasil.map((h) => h.peringkat)).toEqual([1, 2]);
  });

  it("tetap membedakan nilai yang selisihnya nyata", () => {
    const hasil = urutkanPeringkat(
      baris([
        { id: "rendah", nilai: 60, terjawab: 10 },
        { id: "tinggi", nilai: 60.001, terjawab: 1 },
      ]),
      bandingAngka,
    );
    expect(hasil.map((h) => h.respondenId)).toEqual(["tinggi", "rendah"]);
  });
});
