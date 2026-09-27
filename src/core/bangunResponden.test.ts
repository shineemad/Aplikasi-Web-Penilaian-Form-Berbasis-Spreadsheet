import { describe, expect, it } from "vitest";
import { bangunResponden } from "./bangunResponden";
import { hashPalsu } from "./__fixtures__/hash";
import { tebakPeranKolom } from "./peranKolom";
import type { PetaPeran } from "./peranKolom";
import type { Skema } from "./tipe";

const SKEMA: Skema = {
  skemaId: "s1",
  perlakuanKosong: "abaikan",
  butir: [
    {
      kolomAsal: "q1",
      label: "q1",
      dimensi: "d",
      aturan: {
        jenis: "peta-opsi",
        peta: { agree: 4, neutral: 3 },
        skorMaks: 5,
      },
      bobot: 1,
    },
  ],
};

function peran(header: string[]): PetaPeran {
  const peta = tebakPeranKolom(header);
  for (const kolom of peta.kolom) {
    if (kolom.peran === "belum-diputuskan") {
      kolom.peran = kolom.header === "q1" ? "pertanyaan" : "meta";
    }
  }
  return peta;
}

const HEADER = ["Timestamp", "Email Address", "Name", "Age", "q1"];

function baris(
  isi: Partial<Record<string, string>>[],
): Record<string, string>[] {
  return isi.map((satu) => {
    const lengkap: Record<string, string> = {};
    for (const kolom of HEADER) {
      const nilai = satu[kolom];
      lengkap[kolom] = nilai === undefined ? "" : nilai;
    }
    return lengkap;
  });
}

describe("bangunResponden", () => {
  it("memakai email sebagai kunci identitas", () => {
    const hasil = bangunResponden(
      baris([{ "Email Address": "Ani@Example.COM", Name: "Ani", q1: "Agree" }]),
      [2],
      peran(HEADER),
      SKEMA,
      hashPalsu,
    );
    expect(hasil.responden[0]?.email).toBe("ani@example.com");
    expect(hasil.responden[0]?.id).toBe(
      hashPalsu("ani@example.com").slice(0, 16),
    );
  });

  it("memperlakukan nama kosong sebagai null, bukan teks kosong", () => {
    const hasil = bangunResponden(
      baris([{ "Email Address": "a@x.com", Name: "", q1: "Agree" }]),
      [2],
      peran(HEADER),
      SKEMA,
      hashPalsu,
    );
    expect(hasil.responden[0]?.nama).toBe(null);
  });

  it("hanya mengambil kolom berperan meta sebagai meta", () => {
    const hasil = bangunResponden(
      baris([{ "Email Address": "a@x.com", Age: "20", q1: "Agree" }]),
      [2],
      peran(HEADER),
      SKEMA,
      hashPalsu,
    );
    expect(hasil.responden[0]?.meta).toEqual({ Age: "20" });
  });

  it("hanya mengambil kolom yang ada di skema sebagai jawaban", () => {
    const hasil = bangunResponden(
      baris([{ "Email Address": "a@x.com", Age: "20", q1: "Agree" }]),
      [2],
      peran(HEADER),
      SKEMA,
      hashPalsu,
    );
    const satu = hasil.responden[0];
    expect(satu).toBeDefined();
    expect(Object.keys(satu === undefined ? {} : satu.jawaban)).toEqual(["q1"]);
  });

  it("membawa cap waktu terpisah dari meta", () => {
    const hasil = bangunResponden(
      baris([
        {
          "Email Address": "a@x.com",
          Timestamp: "3/4/2026 08:00:00",
          q1: "Agree",
        },
      ]),
      [2],
      peran(HEADER),
      SKEMA,
      hashPalsu,
    );
    expect(hasil.waktuKirim[0]).toBe("3/4/2026 08:00:00");
    expect(hasil.responden[0]?.meta["Timestamp"]).toBeUndefined();
  });

  it("menjaga cap waktu tiap baris beremail kosong, tidak saling menimpa", () => {
    // Baris beremail kosong berbagi satu id. Cap waktu yang dikunci per id
    // hanya menyisakan yang terakhir.
    const hasil = bangunResponden(
      baris([
        { "Email Address": "", Timestamp: "3/4/2026 08:00:00", q1: "Agree" },
        { "Email Address": "", Timestamp: "3/4/2026 09:00:00", q1: "Neutral" },
      ]),
      [2, 3],
      peran(HEADER),
      SKEMA,
      hashPalsu,
    );
    expect(hasil.responden[0]?.id).toBe(hasil.responden[1]?.id);
    expect(hasil.waktuKirim).toEqual([
      "3/4/2026 08:00:00",
      "3/4/2026 09:00:00",
    ]);
  });

  it("menjaga cap waktu tiap kiriman dari email yang sama", () => {
    const hasil = bangunResponden(
      baris([
        {
          "Email Address": "a@x.com",
          Timestamp: "3/4/2026 08:00:00",
          q1: "Agree",
        },
        {
          "Email Address": "A@x.com",
          Timestamp: "5/4/2026 08:00:00",
          q1: "Neutral",
        },
      ]),
      [2, 3],
      peran(HEADER),
      SKEMA,
      hashPalsu,
    );
    expect(hasil.waktuKirim).toEqual([
      "3/4/2026 08:00:00",
      "5/4/2026 08:00:00",
    ]);
  });

  it("mencatat null untuk baris yang cap waktunya kosong", () => {
    const hasil = bangunResponden(
      baris([{ "Email Address": "a@x.com", Timestamp: "  ", q1: "Agree" }]),
      [2],
      peran(HEADER),
      SKEMA,
      hashPalsu,
    );
    expect(hasil.waktuKirim).toEqual([null]);
  });

  it("bekerja tanpa kolom cap waktu sama sekali", () => {
    const tanpaWaktu = ["Email Address", "q1"];
    const hasil = bangunResponden(
      [{ "Email Address": "a@x.com", q1: "Agree" }],
      [2],
      peran(tanpaWaktu),
      SKEMA,
      hashPalsu,
    );
    expect(hasil.responden).toHaveLength(1);
    expect(hasil.waktuKirim).toEqual([null]);
  });
});

describe("bangunResponden tidak menyembunyikan baris bermasalah", () => {
  it("melaporkan nomor baris yang emailnya kosong", () => {
    // Hash dari teks kosong selalu sama, sehingga seluruh baris semacam ini
    // akan memadat menjadi satu orang bila dibiarkan lewat diam-diam.
    const hasil = bangunResponden(
      baris([
        { "Email Address": "a@x.com", q1: "Agree" },
        { "Email Address": "", q1: "Neutral" },
        { "Email Address": "   ", q1: "Agree" },
      ]),
      [2, 3, 4],
      peran(HEADER),
      SKEMA,
      hashPalsu,
    );
    expect(hasil.barisTanpaEmail).toEqual([3, 4]);
    // Baris kedua dan ketiga menghasilkan idResponden yang SAMA (hash teks kosong
    // konstan), tetapi keduanya tetap harus muncul sebagai dua orang terpisah —
    // bukan memadat menjadi satu, persis cacat historis yang fungsi ini cegah.
    expect(hasil.responden).toHaveLength(3);
  });

  it("tetap mengembalikan baris beremail kosong, tidak membuangnya", () => {
    const hasil = bangunResponden(
      baris([{ "Email Address": "", q1: "Agree" }]),
      [2],
      peran(HEADER),
      SKEMA,
      hashPalsu,
    );
    expect(hasil.responden).toHaveLength(1);
  });

  it("melaporkan bila tidak ada kolom email pada peta peran", () => {
    const tanpaEmail = tebakPeranKolom(["q1"]);
    for (const kolom of tanpaEmail.kolom) kolom.peran = "pertanyaan";
    const hasil = bangunResponden(
      [{ q1: "Agree" }],
      [2],
      tanpaEmail,
      SKEMA,
      hashPalsu,
    );
    expect(hasil.responden).toHaveLength(0);
    expect(hasil.tanpaKolomEmail).toBe(true);
  });

  it("mengembalikan daftar kosong untuk masukan kosong", () => {
    const hasil = bangunResponden([], [], peran(HEADER), SKEMA, hashPalsu);
    expect(hasil.responden).toHaveLength(0);
    expect(hasil.barisTanpaEmail).toHaveLength(0);
    expect(hasil.tanpaKolomEmail).toBe(false);
  });

  it("menolak bila panjang baris dan nomorBaris tidak sama", () => {
    // baris dan nomorBaris adalah larik sejajar (kontrak pemanggil); bila
    // panjangnya berbeda, penanda baris-tanpa-email bisa hilang diam-diam.
    expect(() =>
      bangunResponden(
        baris([{ "Email Address": "a@x.com", q1: "Agree" }]),
        [2, 3],
        peran(HEADER),
        SKEMA,
        hashPalsu,
      ),
    ).toThrow("baris (1 baris) dan nomorBaris (2 baris) harus sama panjang");
  });
});
