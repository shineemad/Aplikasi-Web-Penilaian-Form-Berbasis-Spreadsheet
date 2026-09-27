import { idResponden, normalisasiEmail } from './normalisasi';
import type { PetaPeran } from './peranKolom';
import type { RespondenSesi } from './sesi';
import type { FungsiHash, Skema } from './tipe';

export interface HasilPemetaan {
  responden: RespondenSesi[];
  /** respondenId -> cap waktu mentah, untuk pemecah seri peringkat (spec 8.1). */
  waktuKirim: Map<string, string>;
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
    return { responden: [], waktuKirim: new Map(), barisTanpaEmail: [], tanpaKolomEmail: true };
  }

  const kolomJawaban = skema.butir.map((butir) => butir.kolomAsal);
  const responden: RespondenSesi[] = [];
  const waktuKirim = new Map<string, string>();
  const barisTanpaEmail: number[] = [];

  for (let i = 0; i < baris.length; i += 1) {
    const satu = baris[i];
    if (satu === undefined) continue;

    const emailMentah = satu[kolomEmail];
    const email = normalisasiEmail(emailMentah === undefined ? '' : emailMentah);

    if (email === '') {
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

    if (kolomWaktu !== undefined) {
      const isi = satu[kolomWaktu];
      if (isi !== undefined && isi.trim() !== '') waktuKirim.set(id, isi.trim());
    }

    responden.push({ id, email, nama, jawaban, meta });
  }

  return { responden, waktuKirim, barisTanpaEmail, tanpaKolomEmail: false };
}
