import { describe, expect, it } from "vitest";
import { bangunRancangan, finalkanSkema } from "./rancanganSkema";
import type { RancanganSkema } from "./rancanganSkema";

const HEADER = ["Timestamp", "Email Address", "Name", "Age", "q1", "q11"];

function baris(): Record<string, string>[] {
  const likert = [
    "Strongly disagree",
    "Disagree",
    "Neutral",
    "Agree",
    "Strongly agree",
  ];
  return likert.map((opsi, i) => ({
    Timestamp: `1/${i + 1}/2026 08:00:00`,
    "Email Address": `peserta${i}@example.com`,
    Name: i === 0 ? "" : `Peserta ${i}`,
    Age: String(18 + i),
    q1: opsi,
    q11: i % 2 === 0 ? "Yes" : "Maybe",
  }));
}

function butirDari(rancangan: RancanganSkema, kolomAsal: string) {
  return rancangan.butir.find((b) => b.kolomAsal === kolomAsal);
}

describe("bangunRancangan", () => {
  it("menaikkan kolom berskala dikenal menjadi pertanyaan", () => {
    const rancangan = bangunRancangan("s1", HEADER, baris());
    const q1 = rancangan.butir.find((b) => b.kolomAsal === "q1");
    expect(q1?.aturan).not.toBe(null);
    expect(rancangan.peran.kolom.find((k) => k.header === "q1")?.peran).toBe(
      "pertanyaan",
    );
  });

  it("membiarkan kolom Yes/No/Maybe belum diputuskan", () => {
    const rancangan = bangunRancangan("s1", HEADER, baris());
    const q11 = butirDari(rancangan, "q11");
    expect(q11?.aturan).toBe(null);
    expect(q11?.contohNilai.length).toBeGreaterThan(0);
    expect(rancangan.peran.kolom.find((k) => k.header === "q11")?.peran).toBe(
      "belum-diputuskan",
    );
  });

  it("tidak membuat butir untuk kolom identitas", () => {
    const rancangan = bangunRancangan("s1", HEADER, baris());
    expect(butirDari(rancangan, "Email Address")).toBeUndefined();
    expect(butirDari(rancangan, "Timestamp")).toBeUndefined();
    expect(butirDari(rancangan, "Name")).toBeUndefined();
  });

  it("membuat butir untuk kolom bukan identitas yang belum diputuskan", () => {
    const rancangan = bangunRancangan("s1", HEADER, baris());
    expect(butirDari(rancangan, "Age")).toBeDefined();
  });

  it("tidak memilih perlakuan kosong sendiri", () => {
    // Abaikan dan nol sama-sama sah tetapi menghasilkan angka berbeda (spec 7.2 butir 3).
    expect(bangunRancangan("s1", HEADER, baris()).perlakuanKosong).toBe(null);
  });

  it("memberi dimensi kosong dan bobot satu sebagai titik awal", () => {
    const q1 = butirDari(bangunRancangan("s1", HEADER, baris()), "q1");
    expect(q1?.dimensi).toBe("");
    expect(q1?.bobot).toBe(1);
  });

  it("memakai header asli sebagai label awal", () => {
    expect(butirDari(bangunRancangan("s1", HEADER, baris()), "q1")?.label).toBe(
      "q1",
    );
  });

  it("membawa skemaId apa adanya", () => {
    expect(bangunRancangan("skemaA", HEADER, baris()).skemaId).toBe("skemaA");
  });
});

function rancanganSiap(): RancanganSkema {
  const rancangan = bangunRancangan("s1", HEADER, baris());
  rancangan.perlakuanKosong = "abaikan";

  for (const kolom of rancangan.peran.kolom) {
    if (kolom.peran === "belum-diputuskan")
      kolom.peran = kolom.header === "Age" ? "meta" : "pertanyaan";
  }
  for (const butir of rancangan.butir) {
    butir.dimensi = "kemudahan";
    if (butir.aturan === null) butir.aturan = { jenis: "abaikan" };
  }
  return rancangan;
}

describe("finalkanSkema menolak rancangan yang belum diputuskan", () => {
  it("menghasilkan Skema bila seluruhnya sudah diputuskan", () => {
    const hasil = finalkanSkema(rancanganSiap());
    expect(hasil.status).toBe("siap");
    if (hasil.status !== "siap") return;
    expect(hasil.skema.skemaId).toBe("s1");
    expect(hasil.skema.perlakuanKosong).toBe("abaikan");
    expect(hasil.skema.butir.map((b) => b.kolomAsal)).toEqual(["q1", "q11"]);
  });

  it("menolak bila perlakuan kosong belum dipilih", () => {
    const rancangan = rancanganSiap();
    rancangan.perlakuanKosong = null;
    const hasil = finalkanSkema(rancangan);
    expect(hasil.status).toBe("belum-lengkap");
    if (hasil.status !== "belum-lengkap") return;
    expect(hasil.masalah.map((m) => m.jenis)).toContain(
      "perlakuan-kosong-belum-dipilih",
    );
  });

  it("menolak bila masih ada aturan yang kosong", () => {
    const rancangan = rancanganSiap();
    const q11 = rancangan.butir.find((b) => b.kolomAsal === "q11");
    if (q11 !== undefined) q11.aturan = null;
    const hasil = finalkanSkema(rancangan);
    expect(hasil.status).toBe("belum-lengkap");
    if (hasil.status !== "belum-lengkap") return;
    expect(hasil.masalah.map((m) => m.jenis)).toContain(
      "aturan-belum-diputuskan",
    );
  });

  it("menolak bila masih ada dimensi yang kosong", () => {
    const rancangan = rancanganSiap();
    const q1 = rancangan.butir.find((b) => b.kolomAsal === "q1");
    if (q1 !== undefined) q1.dimensi = "";
    const hasil = finalkanSkema(rancangan);
    if (hasil.status !== "belum-lengkap")
      throw new Error("seharusnya belum lengkap");
    expect(hasil.masalah.map((m) => m.jenis)).toContain("dimensi-kosong");
  });

  it("menolak bila masih ada kolom tanpa peran", () => {
    const rancangan = rancanganSiap();
    const age = rancangan.peran.kolom.find((k) => k.header === "Age");
    if (age !== undefined) age.peran = "belum-diputuskan";
    const hasil = finalkanSkema(rancangan);
    if (hasil.status !== "belum-lengkap")
      throw new Error("seharusnya belum lengkap");
    expect(hasil.masalah.map((m) => m.jenis)).toContain(
      "peran-belum-diputuskan",
    );
  });

  it("menolak bila tidak ada kolom email sama sekali", () => {
    const rancangan = bangunRancangan(
      "s1",
      ["q1"],
      [{ q1: "Agree" }, { q1: "Neutral" }],
    );
    rancangan.perlakuanKosong = "abaikan";
    for (const kolom of rancangan.peran.kolom) kolom.peran = "pertanyaan";
    for (const butir of rancangan.butir) {
      butir.dimensi = "d";
      if (butir.aturan === null) butir.aturan = { jenis: "abaikan" };
    }
    const hasil = finalkanSkema(rancangan);
    if (hasil.status !== "belum-lengkap")
      throw new Error("seharusnya belum lengkap");
    expect(hasil.masalah.map((m) => m.jenis)).toContain("tanpa-kolom-email");
  });

  it("menolak bila peran identitasnya masih rancu", () => {
    const rancangan = bangunRancangan(
      "s1",
      ["Email Address", "Email Orang Tua", "q1"],
      [
        {
          "Email Address": "a@x.com",
          "Email Orang Tua": "b@x.com",
          q1: "Agree",
        },
      ],
    );
    rancangan.perlakuanKosong = "abaikan";
    const hasil = finalkanSkema(rancangan);
    if (hasil.status !== "belum-lengkap")
      throw new Error("seharusnya belum lengkap");
    expect(hasil.masalah.map((m) => m.jenis)).toContain("peran-rancu");
  });

  it("melaporkan seluruh masalah sekaligus, bukan berhenti di yang pertama", () => {
    const rancangan = bangunRancangan("s1", HEADER, baris());
    const hasil = finalkanSkema(rancangan);
    if (hasil.status !== "belum-lengkap")
      throw new Error("seharusnya belum lengkap");
    expect(hasil.masalah.length).toBeGreaterThanOrEqual(3);
  });

  it("tidak menjadikan kolom bermeta sebagai butir skema", () => {
    const hasil = finalkanSkema(rancanganSiap());
    if (hasil.status !== "siap") throw new Error("seharusnya siap");
    expect(hasil.skema.butir.map((b) => b.kolomAsal)).not.toContain("Age");
  });
});

describe("finalkanSkema memeriksa peran sebagaimana adanya sekarang", () => {
  function rancanganDuaEmail(): RancanganSkema {
    const rancangan = bangunRancangan(
      "s1",
      ["Email Address", "Email Orang Tua", "q1"],
      [
        {
          "Email Address": "a@x.com",
          "Email Orang Tua": "b@x.com",
          q1: "Agree",
        },
      ],
    );
    rancangan.perlakuanKosong = "abaikan";
    for (const butir of rancangan.butir) {
      butir.dimensi = "d";
      if (butir.aturan === null) butir.aturan = { jenis: "abaikan" };
    }
    return rancangan;
  }

  it("menolak dua kolom email meski daftar rancu sudah dikosongkan", () => {
    // Mengosongkan rancu adalah langkah wajar di layar; itu tidak boleh membuka
    // jalan bagi bangunResponden untuk diam-diam memakai kolom email terakhir.
    const rancangan = rancanganDuaEmail();
    rancangan.peran.rancu = [];
    for (const kolom of rancangan.peran.kolom) {
      kolom.peran = kolom.header === "q1" ? "pertanyaan" : "email";
    }

    const hasil = finalkanSkema(rancangan);
    if (hasil.status !== "belum-lengkap")
      throw new Error("seharusnya belum lengkap");
    expect(hasil.masalah).toContainEqual({
      jenis: "peran-ganda",
      peran: "email",
      header: ["Email Address", "Email Orang Tua"],
    });
  });

  it("menolak lebih dari satu kolom nama atau cap waktu, sekaligus", () => {
    const rancangan = rancanganSiap();
    for (const kolom of rancangan.peran.kolom) {
      if (kolom.header === "Age") kolom.peran = "nama";
      if (kolom.header === "q11") kolom.peran = "waktu";
    }

    const hasil = finalkanSkema(rancangan);
    if (hasil.status !== "belum-lengkap")
      throw new Error("seharusnya belum lengkap");
    expect(hasil.masalah).toContainEqual({
      jenis: "peran-ganda",
      peran: "nama",
      header: ["Name", "Age"],
    });
    expect(hasil.masalah).toContainEqual({
      jenis: "peran-ganda",
      peran: "waktu",
      header: ["Timestamp", "q11"],
    });
  });

  it("menolak kolom pertanyaan yang tidak punya butir", () => {
    // Kolom identitas tidak dibuatkan butir. Bila admin mengubahnya menjadi
    // pertanyaan, kolom itu akan hilang dari Skema tanpa pesan apa pun.
    const rancangan = rancanganSiap();
    const nama = rancangan.peran.kolom.find((k) => k.header === "Name");
    if (nama !== undefined) nama.peran = "pertanyaan";

    const hasil = finalkanSkema(rancangan);
    if (hasil.status !== "belum-lengkap")
      throw new Error("seharusnya belum lengkap");
    expect(hasil.masalah).toContainEqual({
      jenis: "pertanyaan-tanpa-butir",
      header: "Name",
    });
  });

  it("tetap menerima tepat satu email dan tanpa kolom nama maupun cap waktu", () => {
    const rancangan = rancanganSiap();
    for (const kolom of rancangan.peran.kolom) {
      if (kolom.header === "Name" || kolom.header === "Timestamp")
        kolom.peran = "meta";
    }
    expect(finalkanSkema(rancangan).status).toBe("siap");
  });
});
