export interface BarisPenilaian {
  penilaianId: number;
  sesiId: string;
  respondenId: string;
  kriteria: string;
  nilai: number | null;
  catatan: string | null;
  oleh: string;
  pada: string;
}

/** Siapa menulisnya dan kapan. Nilai dan catatan bisa berasal dari baris berbeda (C1). */
export interface AsalBaris {
  penilaianId: number;
  oleh: string;
  pada: string;
}

export interface HasilBerlaku {
  sesiId: string;
  respondenId: string;
  kriteria: string;
  nilai: number | null;
  catatan: string | null;
  /** null berarti pasangan ini belum pernah diberi angka — berbeda dari diberi angka nol. */
  nilaiDari: AsalBaris | null;
  /** null berarti pasangan ini belum pernah diberi catatan. */
  catatanDari: AsalBaris | null;
}

/**
 * Pasangan yang menentukan nilai berlaku memuat `sesiId`, bukan hanya
 * (`responden_id`, `kriteria`) seperti §6.3. Tanpa `sesiId`, nilai Post-Test
 * menimpa nilai Pre-Test dan seluruh kolom selisih menjadi kosong diam-diam.
 */
export function kunciPenilaian(sesiId: string, respondenId: string, kriteria: string): string {
  return `${sesiId}|${respondenId}|${kriteria}`;
}

function adaIsinya(catatan: string | null): catatan is string {
  return catatan !== null && catatan.trim() !== '';
}

function lebihBaru(asal: AsalBaris | null, penilaianId: number): boolean {
  return asal === null || penilaianId > asal.penilaianId;
}

/**
 * Nilai dan catatan yang berlaku dari baris `Penilaian` yang append-only.
 *
 * Keduanya diselesaikan **terpisah** (C1): catatan menambah keterangan, bukan
 * menarik angka. Urutan ditentukan `penilaianId` yang diberikan server di dalam
 * kunci (C2); `pada` tidak pernah dipakai mengurutkan karena dua penilai pada
 * detik yang sama menghasilkan cap waktu yang identik.
 *
 * Tidak ada baris yang dijatuhkan, termasuk baris yatim — lihat `cariYatim`.
 */
export function nilaiBerlaku(baris: BarisPenilaian[]): Map<string, HasilBerlaku> {
  const hasil = new Map<string, HasilBerlaku>();

  for (const satu of baris) {
    const kunci = kunciPenilaian(satu.sesiId, satu.respondenId, satu.kriteria);
    let entri = hasil.get(kunci);
    if (entri === undefined) {
      entri = {
        sesiId: satu.sesiId,
        respondenId: satu.respondenId,
        kriteria: satu.kriteria,
        nilai: null,
        catatan: null,
        nilaiDari: null,
        catatanDari: null,
      };
      hasil.set(kunci, entri);
    }

    // penilaianId kembar tidak mungkin muncul dari server: nomornya diberikan
    // di dalam LockService. Bila tetap muncul, yang pertama dibaca menang.
    const asal: AsalBaris = { penilaianId: satu.penilaianId, oleh: satu.oleh, pada: satu.pada };

    if (satu.nilai !== null && lebihBaru(entri.nilaiDari, satu.penilaianId)) {
      entri.nilai = satu.nilai;
      entri.nilaiDari = asal;
    }

    if (adaIsinya(satu.catatan) && lebihBaru(entri.catatanDari, satu.penilaianId)) {
      entri.catatan = satu.catatan;
      entri.catatanDari = asal;
    }
  }

  return hasil;
}

/**
 * Entri yang respondennya tidak ada di daftar mana pun (C7).
 *
 * Dipisahkan dari `nilaiBerlaku` karena fungsi itu hanya menerima baris
 * `Penilaian` dan memang tidak punya cara tahu responden mana yang sah.
 * Memisahkannya juga membuat penandaan menjadi langkah yang sengaja dipanggil,
 * bukan efek samping yang mudah terlewat.
 */
export function cariYatim(
  hasil: Map<string, HasilBerlaku>,
  idDikenal: Iterable<string>,
): HasilBerlaku[] {
  const dikenal = new Set(idDikenal);
  const yatim: HasilBerlaku[] = [];
  for (const entri of hasil.values()) {
    if (!dikenal.has(entri.respondenId)) yatim.push(entri);
  }
  return yatim;
}
