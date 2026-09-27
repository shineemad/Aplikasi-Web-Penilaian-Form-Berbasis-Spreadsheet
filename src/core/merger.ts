export interface NilaiSesi {
  sesiId: string;
  namaSesi: string;
  skemaId: string;
  /** respondenId -> nilai akhir sesi itu */
  nilai: Map<string, number | null>;
  /** respondenId -> identitas sebagaimana tercatat di sesi itu */
  identitas: Map<string, { email: string; nama: string | null; meta: Record<string, string> }>;
  /** respondenId -> jumlah kolom kosong. Tidak ada entri berarti lengkap. */
  kurang: Map<string, number>;
  /** respondenId -> peringatan yang muncul saat menilainya. */
  peringatan: Map<string, string[]>;
}

export interface Pembanding {
  awal: string;
  akhir: string;
}

export interface BarisGabungan {
  id: string;
  email: string;
  nama: string | null;
  meta: Record<string, string>;
  /** sesiId -> nilai, atau null bila tidak ikut */
  nilaiPerSesi: Record<string, number | null>;
  /** sesiId -> penanda keikutsertaan */
  statusPerSesi: Record<string, 'ikut' | 'tidak ikut' | `ikut:kurang ${number}`>;
  /** null bila pembanding tidak ditetapkan atau salah satu nilainya tidak ada */
  selisih: number | null;
  /** 'lengkap' atau 'sebagian:<nama sesi yang diikuti, dipisah koma>' */
  statusGabungan: string;
}

export interface HasilGabungan {
  baris: BarisGabungan[];
  urutanSesi: { sesiId: string; namaSesi: string }[];
  peringatan: string[];
}

export interface RingkasanProyek {
  perSesi: {
    sesiId: string;
    namaSesi: string;
    jumlahResponden: number;
    rataNilai: number | null;
  }[];
  jumlahLengkap: number;
  jumlahTidakLengkap: number;
  /** Dihitung HANYA dari responden berstatus lengkap. */
  rataSelisih: number | null;
}

export function gabungkanSesi(
  daftarSesi: NilaiSesi[],
  pembanding?: Pembanding,
): HasilGabungan {
  const peringatan: string[] = [];

  if (pembanding !== undefined) {
    const awal = daftarSesi.find((s) => s.sesiId === pembanding.awal);
    const akhir = daftarSesi.find((s) => s.sesiId === pembanding.akhir);

    if (awal === undefined || akhir === undefined) {
      peringatan.push(
        'Pasangan pembanding menunjuk sesi yang tidak ada di proyek ini. Kolom selisih tidak akan terisi.',
      );
    } else if (pembanding.awal === pembanding.akhir) {
      peringatan.push(
        'Pasangan pembanding menunjuk sesi yang sama, sehingga seluruh selisih bernilai nol. Angka nol di sini bukan tanda tidak ada perubahan.',
      );
    } else if (awal.skemaId !== akhir.skemaId) {
      peringatan.push(
        `Sesi "${awal.namaSesi}" dan "${akhir.namaSesi}" memakai skema berbeda. ` +
          'Selisihnya tetap bisa dihitung, tetapi belum tentu bermakna. Periksa sebelum mengekspor.',
      );
    }
  }

  const semuaId: string[] = [];
  for (const s of daftarSesi) {
    for (const id of s.nilai.keys()) {
      if (!semuaId.includes(id)) semuaId.push(id);
    }
  }

  const baris = semuaId.map((id) => {
    const nilaiPerSesi: Record<string, number | null> = {};
    const statusPerSesi: Record<string, 'ikut' | 'tidak ikut' | `ikut:kurang ${number}`> = {};
    const sesiDiikuti: string[] = [];

    let email = '';
    let nama: string | null = null;
    let meta: Record<string, string> = {};
    let identitasTerisi = false;

    for (const s of daftarSesi) {
      const ikut = s.nilai.has(id);

      if (!ikut) {
        statusPerSesi[s.sesiId] = 'tidak ikut';
        nilaiPerSesi[s.sesiId] = null;
        continue;
      }

      sesiDiikuti.push(s.namaSesi);
      const nilai = s.nilai.get(id);
      nilaiPerSesi[s.sesiId] = nilai === undefined ? null : nilai;

      const jumlahKurang = s.kurang.get(id);
      statusPerSesi[s.sesiId] =
        jumlahKurang === undefined ? 'ikut' : `ikut:kurang ${jumlahKurang}`;

      if (!identitasTerisi) {
        const data = s.identitas.get(id);
        if (data !== undefined) {
          email = data.email;
          nama = data.nama;
          meta = data.meta;
          identitasTerisi = true;
        }
      }
    }

    const lengkap = sesiDiikuti.length === daftarSesi.length;
    const statusGabungan = lengkap ? 'lengkap' : `sebagian:${sesiDiikuti.join(',')}`;

    let selisih: number | null = null;
    if (pembanding !== undefined) {
      const awal = nilaiPerSesi[pembanding.awal];
      const akhir = nilaiPerSesi[pembanding.akhir];
      if (awal !== null && awal !== undefined && akhir !== null && akhir !== undefined) {
        selisih = akhir - awal;
      }
    }

    return { id, email, nama, meta, nilaiPerSesi, statusPerSesi, selisih, statusGabungan };
  });

  return {
    baris,
    urutanSesi: daftarSesi.map((s) => ({ sesiId: s.sesiId, namaSesi: s.namaSesi })),
    peringatan,
  };
}

export function ringkasProyek(
  hasil: HasilGabungan,
  daftarSesi: NilaiSesi[],
): RingkasanProyek {
  const perSesi = daftarSesi.map((s) => {
    const angka: number[] = [];
    for (const nilai of s.nilai.values()) {
      if (nilai !== null) angka.push(nilai);
    }
    const jumlah = angka.reduce((a, b) => a + b, 0);
    return {
      sesiId: s.sesiId,
      namaSesi: s.namaSesi,
      jumlahResponden: s.nilai.size,
      rataNilai: angka.length === 0 ? null : jumlah / angka.length,
    };
  });

  const lengkap = hasil.baris.filter((b) => b.statusGabungan === 'lengkap');
  const selisihLengkap: number[] = [];
  for (const b of lengkap) {
    if (b.selisih !== null) selisihLengkap.push(b.selisih);
  }
  const jumlahSelisih = selisihLengkap.reduce((a, b) => a + b, 0);

  return {
    perSesi,
    jumlahLengkap: lengkap.length,
    jumlahTidakLengkap: hasil.baris.length - lengkap.length,
    rataSelisih: selisihLengkap.length === 0 ? null : jumlahSelisih / selisihLengkap.length,
  };
}
