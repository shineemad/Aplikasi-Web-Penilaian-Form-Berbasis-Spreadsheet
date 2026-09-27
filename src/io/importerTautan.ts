import { bacaBerkas } from './importerBerkas';
import type { Impor } from './tipe';

export interface BalasanAmbil {
  ok: boolean;
  status: number;
  teks: () => Promise<string>;
}

/** Disuntikkan dari luar supaya uji tidak pernah menyentuh jaringan sungguhan. */
export type FungsiAmbil = (url: string) => Promise<BalasanAmbil>;

const PETUNJUK_PUBLIKASI =
  'Buka spreadsheet-nya, lalu pilih File → Bagikan → Publikasikan ke web, ' +
  'pilih format CSV, dan salin tautan yang muncul di sana. ' +
  'Tautan "siapa saja yang memiliki link" tidak cukup — browser akan menolaknya.';

export async function bacaTautan(url: string, ambil: FungsiAmbil): Promise<Impor> {
  let alamat: URL;
  try {
    alamat = new URL(url);
  } catch {
    return { status: 'gagal', pesan: `"${url}" bukan tautan yang sah. Tempelkan alamat lengkapnya, termasuk https://.` };
  }

  if (alamat.protocol !== 'http:' && alamat.protocol !== 'https:') {
    return { status: 'gagal', pesan: 'Tautan harus diawali http:// atau https://.' };
  }

  if (alamat.hostname === 'docs.google.com' && !alamat.pathname.includes('/pub')) {
    return {
      status: 'gagal',
      pesan: `Tautan ini adalah tautan edit Google Sheets, bukan tautan publikasi. ${PETUNJUK_PUBLIKASI}`,
    };
  }

  let teks: string;
  try {
    const balasan = await ambil(url);
    if (!balasan.ok) {
      return {
        status: 'gagal',
        pesan:
          `Server menolak permintaan dengan kode ${balasan.status}. ` +
          `Bila ini spreadsheet Google: ${PETUNJUK_PUBLIKASI}`,
      };
    }
    teks = await balasan.teks();
  } catch {
    return {
      status: 'gagal',
      pesan: `Tautan tidak dapat diambil oleh browser. ${PETUNJUK_PUBLIKASI}`,
    };
  }

  const bersih = teks.trim();
  if (bersih === '') {
    return { status: 'gagal', pesan: 'Tautan berhasil dibuka tetapi isinya kosong. Periksa apakah lembarnya memang berisi data.' };
  }

  if (bersih.startsWith('<')) {
    return {
      status: 'gagal',
      pesan: `Tautan ini mengembalikan halaman web, bukan data CSV. ${PETUNJUK_PUBLIKASI}`,
    };
  }

  return bacaBerkas(new TextEncoder().encode(teks).buffer as ArrayBuffer, 'data-dari-tautan.csv');
}
