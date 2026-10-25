import { describe, expect, it } from 'vitest';
import {
  buatContentServicePalsu,
  buatLockServicePalsu,
  buatSessionPalsu,
  buatSpreadsheetAppPalsu,
  buatSpreadsheetPalsu,
  sheetWajib,
  type KeluaranTeksPalsu,
  type SpreadsheetPalsu,
} from '../../apps-script/uji/googlePalsu';
import { muatKode } from '../../apps-script/uji/sandbox';
import { bacaPenilaian, bacaProyek, bacaResponden, bacaSesi, bacaSkema } from './adaptorSheet';

/**
 * Kepala kolom yang ditulis `Kode.gs` adalah kepala kolom yang dibaca adaptor.
 *
 * `adaptorSheet.test.ts` menyalin kelima daftar kolom dengan catatan "disalin
 * dari KEPALA_RUANG_KERJA", tetapi salinan tidak membuktikan apa pun: mengubah
 * satu nama kolom di adaptor **dan** di salinan ujinya membuat seluruh suite
 * tetap hijau, padahal adaptor lalu menolak setiap sheet yang benar-benar
 * dibuat penyiapan. Uji ini menutup celah itu dengan menjalankan penyiapan
 * sungguhan lewat `doPost` lalu menyuapkan kisi hasilnya ke pembaca yang
 * bersangkutan (Batasan Global 20: yang diuji adalah berkas yang di-deploy).
 *
 * Yang diperiksa hanya masalah berjenis `kepala`. Sheet yang baru disiapkan
 * memang belum punya baris data, jadi masalah per baris mustahil muncul — dan
 * `kepala` tepat berarti "adaptor menolak seluruh sheet ini".
 */

const PEMILIK = 'pemilik@kampus.id';

const PEMBACA: Record<string, (kisi: unknown[][]) => { masalah: { jenis: string }[] }> = {
  Proyek: bacaProyek,
  Sesi: bacaSesi,
  Responden: bacaResponden,
  Skema: bacaSkema,
  Penilaian: bacaPenilaian,
};

interface Balasan {
  ok: boolean;
  kode: string;
  pesan: string;
}

function siapkanRuangKerja(): { balasan: Balasan; ss: SpreadsheetPalsu } {
  const ss = buatSpreadsheetPalsu({}, { pemilik: PEMILIK });
  const konteks = muatKode({
    Session: buatSessionPalsu(PEMILIK),
    SpreadsheetApp: buatSpreadsheetAppPalsu(ss),
    LockService: buatLockServicePalsu(),
    ContentService: buatContentServicePalsu(),
  });

  const doPost = konteks.doPost;
  if (typeof doPost !== 'function') throw new Error('Kode.gs tidak mengekspos doPost.');

  const keluaran = (doPost as (e: unknown) => KeluaranTeksPalsu)({
    postData: { contents: JSON.stringify({ aksi: 'siapkanRuangKerja' }) },
  });
  return { balasan: JSON.parse(keluaran.getContent()) as Balasan, ss };
}

function kisiSheet(ss: SpreadsheetPalsu, nama: string): unknown[][] {
  return sheetWajib(ss, nama).getDataRange().getValues();
}

describe('kepala yang ditulis penyiapan terbaca oleh adaptor', () => {
  it('menyiapkan ruang kerja sungguhan lewat doPost', () => {
    const { balasan, ss } = siapkanRuangKerja();

    expect(balasan.ok).toBe(true);
    expect(
      ss
        .getSheets()
        .map((satu) => satu.getName())
        .sort(),
    ).toEqual(Object.keys(PEMBACA).slice().sort());
  });

  for (const [nama, baca] of Object.entries(PEMBACA)) {
    it(`membaca sheet ${nama} yang baru disiapkan tanpa menolak kepalanya`, () => {
      const { ss } = siapkanRuangKerja();
      const kisi = kisiSheet(ss, nama);

      // Penjaga agar ujinya tidak lulus karena kisinya kosong: penyiapan wajib
      // sudah menulis satu baris kepala sebelum adaptor diminta membacanya.
      expect(kisi).toHaveLength(1);
      expect((kisi[0] ?? []).length).toBeGreaterThan(0);

      const hasil = baca(kisi);
      expect(hasil.masalah.filter((satu) => satu.jenis === 'kepala')).toEqual([]);
      expect(hasil.masalah).toEqual([]);
    });
  }

  it('menjadi merah bila satu nama kolom saja berbeda', () => {
    // Bukti bahwa uji di atas menggigit. Tanpa kontrol ini, pembaca yang tidak
    // pernah mengeluh akan membuat seluruh berkas ini tampak berguna padahal
    // tidak memeriksa apa pun.
    const { ss } = siapkanRuangKerja();

    for (const nama of Object.keys(PEMBACA)) {
      const kisi = kisiSheet(ss, nama);
      const kepala = [...(kisi[0] ?? [])];
      kepala[0] = `${String(kepala[0])}_x`;

      const baca = PEMBACA[nama];
      if (baca === undefined) throw new Error(`Tidak ada pembaca untuk sheet ${nama}.`);
      const hasil = baca([kepala]);

      expect(
        hasil.masalah.filter((satu) => satu.jenis === 'kepala'),
        `${nama} tidak mengeluh walau kolom pertamanya diganti nama`,
      ).toHaveLength(1);
    }
  });
});
