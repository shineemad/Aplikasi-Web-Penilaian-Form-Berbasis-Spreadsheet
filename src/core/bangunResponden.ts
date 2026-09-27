import { idResponden, normalisasiEmail } from './normalisasi';
import type { PetaPeran } from './peranKolom';
import type { RespondenSesi } from './sesi';
import type { FungsiHash, Skema } from './tipe';

export interface HasilPemetaan {
  responden: RespondenSesi[];
  /**
   * Cap waktu mentah per baris, sejajar dengan `responden`, untuk pemecah seri
   * peringkat (spec 8.1). Per baris, bukan per id: baris beremail kosong dan
   * email kembar berbagi id. `null` bila tidak ada kolom cap waktu atau isinya kosong.
   */
  waktuKirim: (string | null)[];
  /** Nomor baris asal yang emailnya kosong. Barisnya tetap dikembalikan, tidak dibuang. */
  barisTanpaEmail: number[];
  /** Benar bila peta peran tidak memuat satu pun kolom email. */
  tanpaKolomEmail: boolean;
}

export function bangunResponden(
  baris: Record<string, string>[],
  nomorBaris: number[],
  peran: PetaPeran,
  skema: Skema,
  hash: FungsiHash,
): HasilPemetaan {
  if (baris.length !== nomorBaris.length) {
    throw new Error(
      `baris (${baris.length} baris) dan nomorBaris (${nomorBaris.length} baris) harus sama panjang: keduanya larik sejajar, panjang yang berbeda berarti pemanggil salah memasangkannya.`,
    );
  }

  let kolomEmail: string | undefined;
  let kolomNama: string | undefined;
  let kolomWaktu: string | undefined;
  const kolomMeta: string[] = [];

  for (const kolom of peran.kolom) {
    if (kolom.peran === 'email') kolomEmail = kolom.header;
    else if (kolom.peran === 'nama') kolomNama = kolom.header;
    else if (kolom.peran === 'waktu') kolomWaktu = kolom.header;
    else if (kolom.peran === 'meta') kolomMeta.push(kolom.header);
  }

  if (kolomEmail === undefined) {
    return { responden: [], waktuKirim: [], barisTanpaEmail: [], tanpaKolomEmail: true };
  }

  const kolomJawaban = skema.butir.map((butir) => butir.kolomAsal);
  const responden: RespondenSesi[] = [];
  const waktuKirim: (string | null)[] = [];
  const barisTanpaEmail: number[] = [];

  for (let i = 0; i < baris.length; i += 1) {
    const satu = baris[i];
    if (satu === undefined) continue;

    const emailMentah = satu[kolomEmail];
    const email = normalisasiEmail(emailMentah === undefined ? '' : emailMentah);

    if (email === '') {
      // nomorBaris[i] tidak pernah undefined di sini karena panjang keduanya
      // sudah diperiksa sama di atas; pagar ini hanya untuk noUncheckedIndexedAccess.
      const nomor = nomorBaris[i];
      if (nomor !== undefined) barisTanpaEmail.push(nomor);
    }

    const id = idResponden(email, hash);

    let nama: string | null = null;
    if (kolomNama !== undefined) {
      const isi = satu[kolomNama];
      if (isi !== undefined && isi.trim() !== '') nama = isi.trim();
    }

    const meta: Record<string, string> = {};
    for (const kolom of kolomMeta) {
      const isi = satu[kolom];
      if (isi !== undefined) meta[kolom] = isi;
    }

    const jawaban: Record<string, string> = {};
    for (const kolom of kolomJawaban) {
      const isi = satu[kolom];
      if (isi !== undefined) jawaban[kolom] = isi;
    }

    let waktu: string | null = null;
    if (kolomWaktu !== undefined) {
      const isi = satu[kolomWaktu];
      if (isi !== undefined && isi.trim() !== '') waktu = isi.trim();
    }

    responden.push({ id, email, nama, jawaban, meta });
    waktuKirim.push(waktu);
  }

  return { responden, waktuKirim, barisTanpaEmail, tanpaKolomEmail: false };
}
