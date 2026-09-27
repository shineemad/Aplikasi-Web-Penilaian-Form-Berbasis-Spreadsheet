import { normalisasiEmail } from './normalisasi';

export interface BarisMentah {
  /** Nomor baris pada berkas asal, dihitung dari 1, untuk ditunjukkan ke admin. */
  nomorBaris: number;
  email: string;
}

export interface KonflikEmail {
  /** Bentuk ternormalisasi, karena itulah yang menentukan identitas. */
  email: string;
  jumlah: number;
  nomorBaris: number[];
}

export function deteksiEmailKembar(baris: BarisMentah[]): KonflikEmail[] {
  const perEmail = new Map<string, number[]>();

  for (const satu of baris) {
    const email = normalisasiEmail(satu.email);
    if (email === '') continue;

    const sudah = perEmail.get(email);
    if (sudah === undefined) perEmail.set(email, [satu.nomorBaris]);
    else sudah.push(satu.nomorBaris);
  }

  const konflik: KonflikEmail[] = [];
  for (const [email, nomorBaris] of perEmail) {
    if (nomorBaris.length < 2) continue;
    konflik.push({ email, jumlah: nomorBaris.length, nomorBaris });
  }

  return konflik.sort((a, b) => {
    if (b.jumlah !== a.jumlah) return b.jumlah - a.jumlah;
    return a.email.localeCompare(b.email);
  });
}

/**
 * Nomor baris yang emailnya kosong. Baris seperti ini semuanya mendapat id yang
 * sama, jadi tanpa laporan ini orang-orang berbeda tergabung diam-diam.
 */
export function deteksiEmailKosong(baris: BarisMentah[]): number[] {
  const nomor: number[] = [];
  for (const satu of baris) {
    if (normalisasiEmail(satu.email) === '') nomor.push(satu.nomorBaris);
  }
  return nomor;
}
