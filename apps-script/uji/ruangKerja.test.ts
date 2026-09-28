import { describe, expect, it } from 'vitest';
import {
  buatContentServicePalsu,
  buatLockServicePalsu,
  buatSessionPalsu,
  buatSpreadsheetAppPalsu,
  buatSpreadsheetPalsu,
  sheetWajib,
  type KeluaranTeksPalsu,
  type LockServicePalsu,
  type SheetPalsu,
  type SpreadsheetPalsu,
} from './googlePalsu';
import { muatKode } from './sandbox';

/**
 * Tugas 4 — penyiapan Spreadsheet Ruang Kerja yang idempoten.
 *
 * Seperti berkas uji lain di folder ini, seluruh uji memanggil `doPost`
 * sungguhan pada `Kode.gs` yang di-deploy (Batasan Global 20). Penyiapan pun
 * ditegakkan di server: ia menyentuh kelima sheet, jadi menjadikannya aksi
 * tanpa pemeriksaan peran berarti siapa pun yang bisa mencapai Web App dapat
 * mengubah bentuk ruang kerja orang lain.
 *
 * Tiga hal yang paling mudah tampak benar padahal salah dijaga ketat di sini:
 * `insertSheet` yang dipanggil tanpa syarat (Google melempar bila namanya sudah
 * ada), deteksi sheet kosong lewat panjang kisi (sheet kosong mengembalikan
 * `[['']]`, bukan larik kosong), dan kepala kolom yang ditulis dari ingatan
 * alih-alih dari spec §6.1–§6.5.
 */

const LIMA_SHEET = ['Penilaian', 'Proyek', 'Responden', 'Sesi', 'Skema'];

/** Persis spec §6.1–§6.5. Salah eja satu nama membuat seluruh sistem salah kolom. */
const KEPALA_MENURUT_SPEC: Record<string, string[]> = {
  Proyek: ['proyek_id', 'nama', 'sesi_urut', 'sesi_awal', 'sesi_akhir', 'dibuat_pada'],
  Sesi: ['sesi_id', 'proyek_id', 'nama', 'skema_id', 'mode', 'status', 'penilai', 'admin'],
  Responden: ['sesi_id', 'id', 'email', 'nama', 'status_kelengkapan', 'diimpor_pada'],
  Skema: [
    'skema_id',
    'kolom_asal',
    'label',
    'dimensi',
    'aturan',
    'parameter',
    'skor_maks',
    'bobot',
  ],
  Penilaian: [
    'penilaian_id',
    'sesi_id',
    'responden_id',
    'kriteria',
    'nilai',
    'catatan',
    'oleh',
    'pada',
  ],
};

const PEMILIK = 'pemilik@kampus.id';

const KISI_SESI: unknown[][] = [
  KEPALA_MENURUT_SPEC.Sesi as unknown[],
  ['S1', 'P1', 'Post-Test', 'SK1', 'indeks', 'berjalan', 'penilai@kampus.id', 'admin@kampus.id'],
];

interface Balasan {
  ok: boolean;
  kode: string;
  pesan: string;
  dibuat?: string[];
  dilengkapi?: string[];
  dilewati?: string[];
  peringatan?: string[];
}

interface OpsiSiapkan {
  email?: string;
  ss?: SpreadsheetPalsu;
  lockService?: LockServicePalsu;
  /** Badan permintaan apa adanya; bawaannya hanya medan aksi. */
  badan?: unknown;
}

interface HasilSiapkan {
  balasan: Balasan;
  ss: SpreadsheetPalsu;
  lockService: LockServicePalsu;
}

function siapkan(opsi: OpsiSiapkan = {}): HasilSiapkan {
  const ss = opsi.ss === undefined ? buatSpreadsheetPalsu({}, { pemilik: PEMILIK }) : opsi.ss;
  const lockService = opsi.lockService === undefined ? buatLockServicePalsu() : opsi.lockService;
  const konteks = muatKode({
    Session: buatSessionPalsu(opsi.email === undefined ? PEMILIK : opsi.email),
    SpreadsheetApp: buatSpreadsheetAppPalsu(ss),
    LockService: lockService,
    ContentService: buatContentServicePalsu(),
  });
  const doPost = konteks.doPost;
  if (typeof doPost !== 'function') throw new Error('Kode.gs tidak mengekspos doPost.');
  const keluaran = (doPost as (e: unknown) => KeluaranTeksPalsu)({
    postData: {
      contents: JSON.stringify(
        opsi.badan === undefined ? { aksi: 'siapkanRuangKerja' } : opsi.badan,
      ),
    },
  });
  return { balasan: JSON.parse(keluaran.getContent()) as Balasan, ss, lockService };
}

function namaSheet(ss: SpreadsheetPalsu): string[] {
  return ss
    .getSheets()
    .map((satu) => satu.getName())
    .sort();
}

function kepalaSheet(ss: SpreadsheetPalsu, nama: string): unknown[] {
  const baris = sheetWajib(ss, nama).getDataRange().getValues()[0];
  return baris === undefined ? [] : baris;
}

/**
 * Seluruh isi tiap sheet, untuk dibandingkan sebelum dan sesudah penyiapan.
 *
 * Menghitung jumlah barisnya saja meloloskan penimpaan: kepala kolom yang
 * ditulis ulang menggeser posisi kolom `status`, sehingga kebijakan izin
 * membaca kolom yang keliru — dan sheet-nya tetap berjumlah baris yang sama.
 */
function isiSeluruhSheet(ss: SpreadsheetPalsu): Record<string, unknown[][]> {
  const hasil: Record<string, unknown[][]> = {};
  for (const sheet of ss.getSheets()) hasil[sheet.getName()] = sheet.getDataRange().getValues();
  return hasil;
}

/**
 * Membungkus spreadsheet supaya uji dapat melihat apakah kunci masih dipegang
 * pada detik sheet benar-benar dibuat. Menghitung ambil dan lepas saja tidak
 * cukup: memindahkan pembuatan sheet ke luar kunci tetap menghasilkan 1 dan 1.
 */
function catatKunci(
  ss: SpreadsheetPalsu,
  lockService: LockServicePalsu,
  jejak: boolean[],
): SpreadsheetPalsu {
  return {
    getOwner: () => ss.getOwner(),
    getSheetByName: (nama) => ss.getSheetByName(nama),
    getSheets: () => ss.getSheets(),
    insertSheet: (nama): SheetPalsu => {
      jejak.push(lockService.lock.hasLock());
      return ss.insertSheet(nama);
    },
  };
}

describe('penyiapan membuat kelima sheet beserta kepalanya', () => {
  it('membuat lima sheet bila belum ada satu pun', () => {
    const { balasan, ss } = siapkan();
    expect(balasan.ok).toBe(true);
    expect(namaSheet(ss)).toEqual(LIMA_SHEET);
    expect((balasan.dibuat ?? []).slice().sort()).toEqual(LIMA_SHEET);
  });

  for (const nama of LIMA_SHEET) {
    it(`menulis kepala kolom sheet ${nama} persis seperti spec §6.1–§6.5`, () => {
      // Kepala yang salah eja membuat seluruh sistem membaca kolom keliru, dan
      // kegagalannya diam: angkanya mendarat di tempat lain, bukan hilang.
      const { ss } = siapkan();
      expect(kepalaSheet(ss, nama)).toEqual(KEPALA_MENURUT_SPEC[nama]);
    });
  }

  it('menaruh kepala kolom pada baris pertama, bukan baris kedua', () => {
    // Sheet Google yang baru dibuat kosong; appendRow yang salah hitung
    // meninggalkan baris 1 kosong dan seluruh pembacaan kepala meleset.
    const { ss } = siapkan();
    expect(sheetWajib(ss, 'Sesi').getLastRow()).toBe(1);
  });
});

describe('penyiapan bersifat idempoten', () => {
  it('tidak melempar saat dijalankan dua kali', () => {
    // insertSheet tanpa syarat melempar di Google: "sheet bernama X sudah ada".
    const { ss } = siapkan();
    const { balasan } = siapkan({ ss });
    expect(balasan.ok).toBe(true);
    expect(namaSheet(ss)).toEqual(LIMA_SHEET);
  });

  it('tidak menyentuh sheet yang sudah ada isinya', () => {
    const ss = buatSpreadsheetPalsu(
      { Penilaian: [KEPALA_MENURUT_SPEC.Penilaian as unknown[], [1, 'S1', 'a1', 'K1', 80]] },
      { pemilik: PEMILIK },
    );
    siapkan({ ss });
    const sebelum = isiSeluruhSheet(ss).Penilaian;
    const { balasan } = siapkan({ ss });
    expect(isiSeluruhSheet(ss).Penilaian).toEqual(sebelum);
    expect(balasan.dilewati).toContain('Penilaian');
    expect(balasan.dibuat).toEqual([]);
  });

  it('tidak mengubah satu sel pun pada ruang kerja yang kelima sheetnya sudah berisi', () => {
    // Uji yang hanya menghitung baris meloloskan penimpaan kepala kolom.
    // Bandingkan isinya: kepala `Sesi` yang ditulis ulang menggeser kolom
    // status, dan seluruh kebijakan izin ikut salah baca tanpa satu pun
    // uji izin menjadi merah.
    const ss = buatSpreadsheetPalsu(
      {
        Proyek: [
          KEPALA_MENURUT_SPEC.Proyek as unknown[],
          ['P1', 'Kelas A', 1, '2026-01-01', '2026-02-01', '2026-01-01'],
        ],
        Sesi: KISI_SESI,
        Responden: [
          KEPALA_MENURUT_SPEC.Responden as unknown[],
          ['S1', 'a1', 'ani@kampus.id', 'Ani', 'lengkap', '2026-01-01'],
        ],
        Skema: [
          KEPALA_MENURUT_SPEC.Skema as unknown[],
          ['SK1', 'q1', 'Butir 1', 'Dimensi A', 'likert', '', 4, 1],
        ],
        Penilaian: [
          KEPALA_MENURUT_SPEC.Penilaian as unknown[],
          [1, 'S1', 'a1', 'K1', 80, '', 'penilai@kampus.id', '2026-01-01T00:00:00.000Z'],
        ],
      },
      { pemilik: PEMILIK },
    );
    const sebelum = isiSeluruhSheet(ss);
    const { balasan } = siapkan({ ss });
    expect(balasan.ok).toBe(true);
    expect(isiSeluruhSheet(ss)).toEqual(sebelum);
    expect(balasan.dibuat).toEqual([]);
    expect(balasan.dilengkapi).toEqual([]);
    expect((balasan.dilewati ?? []).slice().sort()).toEqual(LIMA_SHEET);
  });

  it('melengkapi kepala pada sheet yang sudah ada tetapi masih kosong', () => {
    // Sheet kosong mengembalikan [['']], bukan []. Deteksi lewat panjang kisi
    // menganggapnya berisi dan kepala kolomnya tidak pernah ditulis.
    const ss = buatSpreadsheetPalsu({ Skema: [] }, { pemilik: PEMILIK });
    expect(sheetWajib(ss, 'Skema').getDataRange().getValues()).toHaveLength(1);
    const { balasan } = siapkan({ ss });
    expect(balasan.dilengkapi).toContain('Skema');
    expect(kepalaSheet(ss, 'Skema')).toEqual(KEPALA_MENURUT_SPEC.Skema);
  });
});

describe('penyiapan berisik saat ragu, bukan menebak', () => {
  it('memperingatkan sheet lama yang kekurangan kolom wajib', () => {
    // Aturan 3 repo. Sheet berisi data tidak boleh disentuh, tetapi diam saja
    // berarti kolom yang hilang baru ketahuan saat penulisan pertama gagal.
    const ss = buatSpreadsheetPalsu(
      { Sesi: [['sesi_id', 'status', 'penilai'], ['S1', 'berjalan', 'penilai@kampus.id']] },
      { pemilik: PEMILIK },
    );
    const sebelum = isiSeluruhSheet(ss).Sesi;
    const { balasan } = siapkan({ ss });
    expect(balasan.ok).toBe(true);
    expect(balasan.kode).toBe('SIAP_DENGAN_PERINGATAN');
    expect((balasan.peringatan ?? []).join(' ')).toMatch(/admin/);
    // Sheet yang kurang kolom justru yang paling menggoda untuk "diperbaiki"
    // dengan menulis ulang kepalanya; itu menggeser seluruh datanya.
    expect(isiSeluruhSheet(ss).Sesi).toEqual(sebelum);
  });

  it('tidak memperingati apa pun bila kelima sheet lengkap', () => {
    const { ss } = siapkan();
    const { balasan } = siapkan({ ss });
    expect(balasan.kode).toBe('SIAP');
    expect(balasan.peringatan).toEqual([]);
  });
});

describe('penyiapan hanya boleh pemilik ruang kerja atau admin', () => {
  it('mengizinkan pemilik Spreadsheet saat belum ada sheet Sesi sama sekali', () => {
    // Lingkaran wewenang: penyiapan membuat sheet Sesi, sedangkan daftar admin
    // dibaca dari sheet itu. Pemilik berkas adalah satu-satunya identitas yang
    // ada sebelum data apa pun ada.
    const { balasan } = siapkan({ email: PEMILIK });
    expect(balasan.ok).toBe(true);
  });

  it('mengizinkan admin yang terdaftar pada sheet Sesi walau bukan pemilik', () => {
    const ss = buatSpreadsheetPalsu({ Sesi: KISI_SESI }, { pemilik: PEMILIK });
    const { balasan } = siapkan({ ss, email: 'admin@kampus.id' });
    expect(balasan.ok).toBe(true);
  });

  it('menolak penilai yang terdaftar pada sheet Sesi', () => {
    const ss = buatSpreadsheetPalsu({ Sesi: KISI_SESI }, { pemilik: PEMILIK });
    const { balasan } = siapkan({ ss, email: 'penilai@kampus.id' });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('BUKAN_ADMIN');
    expect(namaSheet(ss)).toEqual(['Sesi']);
  });

  it('menolak orang di luar daftar mana pun', () => {
    const ss = buatSpreadsheetPalsu({ Sesi: KISI_SESI }, { pemilik: PEMILIK });
    const { balasan } = siapkan({ ss, email: 'orangluar@gmail.com' });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('BUKAN_ADMIN');
  });

  it('menolak orang luar walau ruang kerja masih kosong', () => {
    // Tanpa uji ini, jalan pintas "ruang kerja kosong berarti bebas" tetap
    // hijau di seluruh uji lain.
    const { balasan, ss } = siapkan({ email: 'orangluar@gmail.com' });
    expect(balasan.ok).toBe(false);
    expect(namaSheet(ss)).toEqual([]);
  });

  it('mencocokkan email pemilik tanpa memedulikan huruf besar-kecil dan spasi tepi', () => {
    const ss = buatSpreadsheetPalsu({}, { pemilik: ' Pemilik@Kampus.id ' });
    const { balasan } = siapkan({ ss, email: 'pemilik@kampus.id' });
    expect(balasan.ok).toBe(true);
  });

  it('menolak identitas kosong dengan kode tersendiri', () => {
    const { balasan, ss } = siapkan({ email: '' });
    expect(balasan.kode).toBe('TANPA_IDENTITAS');
    expect(namaSheet(ss)).toEqual([]);
  });

  it('mengabaikan email yang dikirim frontend', () => {
    // Batasan Global 15. Muatan mengaku pemilik; sesi Google bilang orang luar.
    const { balasan } = siapkan({
      email: 'orangluar@gmail.com',
      badan: {
        aksi: 'siapkanRuangKerja',
        email: PEMILIK,
        oleh: PEMILIK,
        peran: 'admin',
        muatan: { email: PEMILIK },
      },
    });
    expect(balasan.kode).toBe('BUKAN_ADMIN');
  });
});

describe('ruang kerja tanpa pemilik yang bisa dibaca', () => {
  it('menolak bila pemilik tidak diketahui dan belum ada admin', () => {
    // Berkas di Shared Drive tidak punya pemilik. Menebak "berarti siapa saja
    // boleh" membuka penyiapan untuk semua orang yang bisa mencapai Web App.
    const ss = buatSpreadsheetPalsu({}, { pemilik: null });
    const { balasan } = siapkan({ ss, email: 'siapa@kampus.id' });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('PEMILIK_TIDAK_DIKETAHUI');
    expect(balasan.pesan).toMatch(/admin/i);
    expect(namaSheet(ss)).toEqual([]);
  });

  it('tidak melempar keluar doPost bila getOwner ditolak Google', () => {
    // Error yang lolos dari doPost membuat Apps Script mengirim halaman HTML
    // yang tidak bisa dibaca klien; kegagalannya menjadi kegagalan diam.
    const ss = buatSpreadsheetPalsu({}, { pemilikMelempar: true });
    const { balasan } = siapkan({ ss, email: 'siapa@kampus.id' });
    expect(balasan.kode).toBe('PEMILIK_TIDAK_DIKETAHUI');
  });

  it('tetap mengizinkan admin sheet Sesi walau pemilik tidak bisa dibaca', () => {
    const ss = buatSpreadsheetPalsu({ Sesi: KISI_SESI }, { pemilikMelempar: true });
    const { balasan } = siapkan({ ss, email: 'admin@kampus.id' });
    expect(balasan.ok).toBe(true);
  });

  it('mengabaikan kolom admin yang kembar alih-alih memakai yang pertama', () => {
    // Admin melihat kolom yang satu, backend membaca kolom yang lain. Selama
    // bentuknya begitu, daftar admin tidak punya arti.
    const ss = buatSpreadsheetPalsu(
      {
        Sesi: [
          ['sesi_id', 'status', 'penilai', 'admin', 'admin'],
          ['S1', 'berjalan', 'penilai@kampus.id', 'admin@kampus.id', 'lain@kampus.id'],
        ],
      },
      { pemilik: null },
    );
    const { balasan } = siapkan({ ss, email: 'admin@kampus.id' });
    expect(balasan.kode).toBe('PEMILIK_TIDAK_DIKETAHUI');
  });
});

describe('penyiapan tidak bergantung pada sesi mana pun', () => {
  it('berhasil tanpa medan sesiId sama sekali', () => {
    // Penyiapan justru dijalankan saat sheet Sesi belum ada. Mensyaratkan
    // sesiId membuatnya mustahil dipakai pertama kali.
    const { balasan } = siapkan({ badan: { aksi: 'siapkanRuangKerja' } });
    expect(balasan.ok).toBe(true);
  });

  it('berhasil walau sesiId yang dikirim bukan teks', () => {
    const { balasan } = siapkan({ badan: { aksi: 'siapkanRuangKerja', sesiId: ['S1'] } });
    expect(balasan.ok).toBe(true);
  });
});

describe('penyiapan menulis di dalam kunci', () => {
  it('mengambil dan melepas kunci tepat sekali', () => {
    const { lockService } = siapkan();
    expect({
      ambil: lockService.lock.jumlahAmbil,
      lepas: lockService.lock.jumlahLepas,
    }).toEqual({ ambil: 1, lepas: 1 });
  });

  it('masih memegang kunci pada detik sheet dibuat', () => {
    const lockService = buatLockServicePalsu();
    const jejak: boolean[] = [];
    const ss = catatKunci(buatSpreadsheetPalsu({}, { pemilik: PEMILIK }), lockService, jejak);
    siapkan({ ss, lockService });
    expect(jejak).toHaveLength(5);
    expect(jejak.every((dipegang) => dipegang)).toBe(true);
  });

  it('menolak tanpa membuat sheet apa pun bila kunci tidak bisa diambil', () => {
    const lockService = buatLockServicePalsu({ batasWaktuHabis: true });
    const { balasan, ss } = siapkan({ lockService });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('SEDANG_SIBUK');
    expect(namaSheet(ss)).toEqual([]);
    expect(lockService.lock.jumlahAmbil).toBe(0);
  });

  it('melepas kunci walau pembuatan sheet melempar di tengah jalan', () => {
    const lockService = buatLockServicePalsu();
    const asli = buatSpreadsheetPalsu({}, { pemilik: PEMILIK });
    const ss: SpreadsheetPalsu = {
      getOwner: () => asli.getOwner(),
      getSheetByName: (nama) => asli.getSheetByName(nama),
      getSheets: () => asli.getSheets(),
      insertSheet: () => {
        throw new Error('kuota sheet habis');
      },
    };
    const { balasan } = siapkan({ ss, lockService });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('GAGAL_MENYIAPKAN');
    expect(lockService.lock.jumlahLepas).toBe(1);
  });
});
