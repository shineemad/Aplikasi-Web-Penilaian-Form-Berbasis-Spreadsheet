export interface Perintah {
  aksi: string;
  sesiId: string;
  muatan: unknown;
}

export type SifatKegagalan = 'sementara' | 'permanen';

export interface Kegagalan {
  /** `permanen` berarti muatan yang sama tidak akan pernah diterima tanpa campur tangan manusia. */
  sifat: SifatKegagalan;
  kode: string;
  pesan: string;
}

export interface PerintahTertunda {
  /** Nomor urut lokal, dipakai membedakan dua perintah yang isinya sama persis. */
  nomor: number;
  perintah: Perintah;
  /** Hanya ada satu status: perintah yang sudah dibenarkan server keluar dari antrean. */
  status: 'belum-tersimpan';
  percobaan: number;
  kegagalan: Kegagalan | null;
}

/** Disuntikkan dari luar (K3) supaya Store netral terhadap pilihan hosting. */
export type FungsiKirim = (perintah: Perintah) => Promise<unknown>;

export interface OpsiStore {
  kirim: FungsiKirim;
  muatTertunda?: () => PerintahTertunda[];
  simpanTertunda?: (daftar: PerintahTertunda[]) => void;
}

export interface RingkasanKirim {
  terkirim: number;
  tertundaSementara: number;
  ditolakPermanen: number;
  /** true bila pengiriman lain sedang berjalan, sehingga panggilan ini tidak melakukan apa-apa. */
  dilewati: boolean;
}

export interface Store {
  antre: (perintah: Perintah) => PerintahTertunda;
  kirimTertunda: () => Promise<RingkasanKirim>;
  daftarTertunda: () => PerintahTertunda[];
}

/**
 * Kode yang tidak akan pernah berhasil bila muatan yang sama dikirim ulang.
 *
 * Daftarnya sengaja pendek dan tertutup: kode di luar daftar ini dianggap
 * sementara, karena menyerah pada kode yang belum dikenal berarti diam-diam
 * membuang penilaian yang sebenarnya masih bisa tersimpan. Kebalikannya —
 * mencoba ulang selamanya — hanya menumpuk antrean tanpa pernah berhasil.
 */
export const KODE_PERMANEN = [
  'MUATAN_TIDAK_SAH',
  'AKSI_TIDAK_DIKENAL',
  'TANPA_IDENTITAS',
  'ORANG_TIDAK_DIKENAL',
  'BUKAN_ADMIN',
  'SESI_FINAL',
  'SESI_TIDAK_ADA',
  'SESI_CACAT',
  'PEMILIK_TIDAK_DIKETAHUI',
  'PENILAIAN_TIDAK_ADA',
  'PENILAIAN_CACAT',
];

/**
 * Kode `ok:false` dari `Kode.gs` yang sengaja dibiarkan **sementara**.
 *
 * Daftar ini tidak dipakai `bacaBalasan` dan tidak mengubah perilaku apa pun:
 * kode di luar `KODE_PERMANEN` sudah dianggap sementara tanpa perlu terdaftar.
 * Gunanya satu — membuat kode kesalahan baru di `Kode.gs` merahkan uji
 * tertutup, sehingga klasifikasinya diputuskan seseorang, bukan diwarisi dari
 * cabang `else`. Isinya hanya kode yang benar-benar terbit dari `Kode.gs`;
 * kode yang lahir di Store sendiri (`BALASAN_CACAT`, `JARINGAN`, `TANPA_KODE`)
 * tidak termasuk.
 */
export const KODE_SEMENTARA = [
  'AKSI_BELUM_DIBANGUN',
  'SEDANG_SIBUK',
  'GAGAL_MENULIS',
  'GAGAL_MENYIAPKAN',
];

const PESAN_BALASAN_CACAT =
  'Server menjawab tanpa medan "ok" bertipe boolean, jadi tidak ada cara tahu apakah penilaian ' +
  'benar-benar tersimpan. Perintah ini ditahan dan akan dikirim ulang. Bila terus berulang, ' +
  'periksa apakah URL backend menunjuk deployment Apps Script yang benar dan bukan halaman login.';

type Periksa =
  | { sukses: true }
  | { sukses: false; kode: string; pesan: string; sifat: SifatKegagalan };

function bacaBalasan(balasan: unknown): Periksa {
  if (typeof balasan !== 'object' || balasan === null || Array.isArray(balasan)) {
    return { sukses: false, kode: 'BALASAN_CACAT', pesan: PESAN_BALASAN_CACAT, sifat: 'sementara' };
  }

  const isi = balasan as { ok?: unknown; kode?: unknown; pesan?: unknown };
  if (typeof isi.ok !== 'boolean') {
    return { sukses: false, kode: 'BALASAN_CACAT', pesan: PESAN_BALASAN_CACAT, sifat: 'sementara' };
  }
  if (isi.ok === true) return { sukses: true };

  const kode = typeof isi.kode === 'string' && isi.kode !== '' ? isi.kode : 'TANPA_KODE';
  const pesan =
    typeof isi.pesan === 'string' && isi.pesan !== ''
      ? isi.pesan
      : `Server menolak perintah ini dengan kode ${kode} tanpa menyertakan penjelasan.`;
  return {
    sukses: false,
    kode,
    pesan,
    sifat: KODE_PERMANEN.includes(kode) ? 'permanen' : 'sementara',
  };
}

function pesanGalat(galat: unknown): string {
  const inti = galat instanceof Error ? galat.message : String(galat);
  return `Perintah tidak sampai ke server: ${inti}. Perintah ditahan dan akan dikirim ulang.`;
}

export function buatStore(opsi: OpsiStore): Store {
  const adaMuat = opsi.muatTertunda !== undefined;
  const adaSimpan = opsi.simpanTertunda !== undefined;
  if (adaMuat !== adaSimpan) {
    throw new Error(
      'muatTertunda dan simpanTertunda harus diberikan bersama-sama. Menyuntikkan salah satunya ' +
        'membuat antrean dibaca dari satu tempat dan ditulis ke tempat lain, sehingga perintah ' +
        'tampak tertunda padahal tidak pernah bertahan.',
    );
  }

  let memori: PerintahTertunda[] = [];
  const muat = opsi.muatTertunda ?? ((): PerintahTertunda[] => memori);
  const simpan =
    opsi.simpanTertunda ??
    ((daftar: PerintahTertunda[]): void => {
      memori = daftar;
    });

  // Dua pengiriman yang tumpang tindih menghasilkan dua baris Penilaian untuk
  // satu perintah, dan append-only membuatnya tidak bisa dihapus lagi.
  let sedangMengirim = false;

  function antre(perintah: Perintah): PerintahTertunda {
    const daftar = muat();
    let tertinggi = 0;
    for (const satu of daftar) if (satu.nomor > tertinggi) tertinggi = satu.nomor;

    const baru: PerintahTertunda = {
      nomor: tertinggi + 1,
      perintah,
      status: 'belum-tersimpan',
      percobaan: 0,
      kegagalan: null,
    };
    simpan([...daftar, baru]);
    return baru;
  }

  async function kirimTertunda(): Promise<RingkasanKirim> {
    if (sedangMengirim) {
      return { terkirim: 0, tertundaSementara: 0, ditolakPermanen: 0, dilewati: true };
    }
    sedangMengirim = true;

    try {
      // Potret diambil sekali. Antrean yang sama dibaca lagi di akhir untuk
      // menemukan perintah yang diantre selagi pengiriman ini berjalan.
      const potret = muat();
      const nomorPotret = new Set(potret.map((satu) => satu.nomor));
      const tersisa: PerintahTertunda[] = [];
      let terkirim = 0;
      let ditolakPermanen = 0;

      for (let i = 0; i < potret.length; i += 1) {
        const satu = potret[i];
        if (satu === undefined) continue;

        if (satu.kegagalan !== null && satu.kegagalan.sifat === 'permanen') {
          tersisa.push(satu);
          ditolakPermanen += 1;
          continue;
        }

        let hasil: Periksa;
        try {
          hasil = bacaBalasan(await opsi.kirim(satu.perintah));
        } catch (galat) {
          hasil = {
            sukses: false,
            kode: 'JARINGAN',
            pesan: pesanGalat(galat),
            sifat: 'sementara',
          };
        }

        if (hasil.sukses) {
          terkirim += 1;
          continue;
        }

        tersisa.push({
          ...satu,
          percobaan: satu.percobaan + 1,
          kegagalan: { sifat: hasil.sifat, kode: hasil.kode, pesan: hasil.pesan },
        });

        if (hasil.sifat === 'permanen') {
          ditolakPermanen += 1;
          continue;
        }

        // Kegagalan sementara menghentikan pengiriman di sini. Perintah ini akan
        // dicoba ulang, dan `Penilaian` membuat baris yang tiba belakangan
        // menang (C2): meneruskan antrean berarti koreksi yang sudah terkirim
        // ditimpa angka lama yang baru berhasil pada percobaan berikutnya.
        // Penolakan permanen tidak menghentikan apa pun — perintahnya tidak akan
        // pernah terkirim, jadi ia tidak bisa mendarat sesudah penggantinya.
        for (let j = i + 1; j < potret.length; j += 1) {
          const belumDicoba = potret[j];
          if (belumDicoba === undefined) continue;
          tersisa.push(belumDicoba);
          if (belumDicoba.kegagalan !== null && belumDicoba.kegagalan.sifat === 'permanen') {
            ditolakPermanen += 1;
          }
        }
        break;
      }

      // Menulis `tersisa` apa adanya akan menghapus perintah yang masuk lewat
      // `antre()` selagi `await` di atas berjalan — penilai yang mengetik saat
      // pengiriman berlangsung kehilangan angkanya tanpa satu pun tanda
      // (aturan 7, Batasan Global 18).
      const disisipkan = muat().filter((satu) => !nomorPotret.has(satu.nomor));
      simpan([...tersisa, ...disisipkan]);

      // Ringkasan menghitung potret saja, sehingga
      // terkirim + tertundaSementara + ditolakPermanen selalu sama dengan
      // panjang potret. Perintah yang disisipkan belum pernah dicoba pada
      // putaran ini; jumlah antrean sebenarnya dibaca lewat `daftarTertunda`.
      return {
        terkirim,
        tertundaSementara: tersisa.length - ditolakPermanen,
        ditolakPermanen,
        dilewati: false,
      };
    } finally {
      sedangMengirim = false;
    }
  }

  return {
    antre,
    kirimTertunda,
    daftarTertunda: (): PerintahTertunda[] => [...muat()],
  };
}
