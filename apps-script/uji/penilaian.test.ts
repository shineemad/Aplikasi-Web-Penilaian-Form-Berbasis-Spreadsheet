import { describe, expect, it } from 'vitest';
import {
  buatContentServicePalsu,
  buatLockServicePalsu,
  buatSessionPalsu,
  buatSpreadsheetPalsu,
  sheetWajib,
  type KeluaranTeksPalsu,
  type LockServicePalsu,
  type SheetPalsu,
  type SpreadsheetPalsu,
} from './googlePalsu';
import { muatKode } from './sandbox';

/**
 * Tugas 3 — penulisan ke sheet `Penilaian`.
 *
 * Seluruh uji di sini memanggil `doPost` sungguhan pada `Kode.gs` yang
 * di-deploy (Batasan Global 20), jadi yang dibuktikan adalah jawaban backend
 * beserta baris yang benar-benar mendarat di sheet — bukan niat kodenya.
 *
 * Tiga hal yang paling mudah tampak benar padahal salah dijaga ketat di sini:
 * `oleh` yang diambil dari muatan (Batasan Global 15), `penilaian_id` yang
 * memakai cap waktu alih-alih nomor urut (koreksi C2), dan penulisan yang
 * terjadi di luar `LockService` (Batasan Global 19).
 */

const NAMA_PENILAIAN = 'Penilaian';

const KEPALA_SESI: unknown[] = [
  'sesi_id',
  'proyek_id',
  'nama',
  'skema_id',
  'mode',
  'status',
  'penilai',
  'admin',
];

const KEPALA_PENILAIAN: unknown[] = [
  'penilaian_id',
  'sesi_id',
  'responden_id',
  'kriteria',
  'nilai',
  'catatan',
  'oleh',
  'pada',
];

const PENILAI_BAWAAN = 'penilai1@kampus.id, penilai2@kampus.id, Penilai@Kampus.id ';

const MUATAN_BAWAAN: Record<string, unknown> = {
  respondenId: 'a1',
  kriteria: 'K1',
  nilai: 80,
};

interface Balasan {
  ok: boolean;
  kode: string;
  pesan: string;
  sesiId?: string;
  penilaianId?: number;
  oleh?: string;
  pada?: string;
}

interface BarisPenilaian {
  penilaianId: unknown;
  sesiId: unknown;
  respondenId: unknown;
  kriteria: unknown;
  nilai: unknown;
  catatan: unknown;
  oleh: unknown;
  pada: unknown;
}

interface OpsiRuangKerja {
  status?: string;
  /** Isi sheet Penilaian apa adanya; bawaannya hanya kepala kolom. */
  penilaian?: unknown[][];
}

function buatRuangKerja(opsi: OpsiRuangKerja = {}): SpreadsheetPalsu {
  return buatSpreadsheetPalsu({
    Sesi: [
      KEPALA_SESI,
      [
        'S1',
        'P1',
        'Post-Test',
        'SK1',
        'indeks',
        opsi.status === undefined ? 'berjalan' : opsi.status,
        PENILAI_BAWAAN,
        'admin@kampus.id',
      ],
    ],
    Penilaian: opsi.penilaian === undefined ? [KEPALA_PENILAIAN] : opsi.penilaian,
  });
}

interface OpsiSimpan {
  email?: string;
  sesiIdDikirim?: unknown;
  muatan?: unknown;
  /** Ruang kerja yang sama dipakai ulang untuk membuktikan penambahan baris. */
  ss?: SpreadsheetPalsu;
  lockService?: LockServicePalsu;
}

interface HasilSimpan {
  balasan: Balasan;
  ss: SpreadsheetPalsu;
  lockService: LockServicePalsu;
}

function simpan(opsi: OpsiSimpan = {}): HasilSimpan {
  const ss = opsi.ss === undefined ? buatRuangKerja() : opsi.ss;
  const lockService = opsi.lockService === undefined ? buatLockServicePalsu() : opsi.lockService;
  const konteks = muatKode({
    Session: buatSessionPalsu(opsi.email === undefined ? 'penilai1@kampus.id' : opsi.email),
    SpreadsheetApp: { getActive: () => ss },
    LockService: lockService,
    ContentService: buatContentServicePalsu(),
  });
  const doPost = konteks.doPost;
  if (typeof doPost !== 'function') throw new Error('Kode.gs tidak mengekspos doPost.');
  const keluaran = (doPost as (e: unknown) => KeluaranTeksPalsu)({
    postData: {
      contents: JSON.stringify({
        aksi: 'simpanPenilaian',
        sesiId: opsi.sesiIdDikirim === undefined ? 'S1' : opsi.sesiIdDikirim,
        muatan: opsi.muatan === undefined ? MUATAN_BAWAAN : opsi.muatan,
      }),
    },
  });
  return { balasan: JSON.parse(keluaran.getContent()) as Balasan, ss, lockService };
}

/** Dibaca lewat kepala kolom, bukan lewat indeks tetap, supaya uji kolom yang ditukar tetap sahih. */
function barisPenilaian(ss: SpreadsheetPalsu): BarisPenilaian[] {
  const kisi = sheetWajib(ss, NAMA_PENILAIAN).getDataRange().getValues();
  const kepala = kisi[0];
  if (kepala === undefined) return [];
  const ambil = (baris: unknown[], nama: string): unknown => {
    const indeks = kepala.indexOf(nama);
    return indeks < 0 ? undefined : baris[indeks];
  };
  return kisi.slice(1).map((baris) => ({
    penilaianId: ambil(baris, 'penilaian_id'),
    sesiId: ambil(baris, 'sesi_id'),
    respondenId: ambil(baris, 'responden_id'),
    kriteria: ambil(baris, 'kriteria'),
    nilai: ambil(baris, 'nilai'),
    catatan: ambil(baris, 'catatan'),
    oleh: ambil(baris, 'oleh'),
    pada: ambil(baris, 'pada'),
  }));
}

/**
 * Membungkus `appendRow` pada sheet Penilaian supaya uji bisa mengamati — atau
 * menggagalkan — penulisan tepat saat terjadi. Tanpa ini, "penulisan terjadi di
 * dalam kunci" hanya bisa dipercaya, tidak dibuktikan.
 */
function awasiPenulisan(
  ss: SpreadsheetPalsu,
  pengawas: (baris: unknown[]) => void,
): SpreadsheetPalsu {
  return {
    ...ss,
    getSheetByName: (nama) => {
      const sheet = ss.getSheetByName(nama);
      if (sheet === null || nama !== NAMA_PENILAIAN) return sheet;
      const dibungkus: SheetPalsu = {
        ...sheet,
        appendRow: (baris) => {
          pengawas(baris);
          sheet.appendRow(baris);
        },
      };
      return dibungkus;
    },
  };
}

describe('append-only: menambah baris, tidak pernah menimpa', () => {
  it('menyimpan dua nilai untuk pasangan responden dan kriteria yang sama', () => {
    const ss = buatRuangKerja();
    simpan({ ss, muatan: { respondenId: 'a1', kriteria: 'K1', nilai: 70 } });
    simpan({ ss, muatan: { respondenId: 'a1', kriteria: 'K1', nilai: 85 } });
    expect(barisPenilaian(ss).map((baris) => baris.nilai)).toEqual([70, 85]);
  });

  it('menjawab ok hanya setelah barisnya benar-benar tertulis', () => {
    // Batasan Global 18 dibaca dari sisi server: Store membuang perintah dari
    // antrean begitu melihat ok:true, jadi ok:true tanpa baris berarti
    // penilaian hilang tanpa seorang pun tahu.
    const { balasan, ss } = simpan();
    expect(balasan.ok).toBe(true);
    expect(barisPenilaian(ss)).toHaveLength(1);
  });
});

describe('penilaian_id — nomor urut server, bukan cap waktu (koreksi C2)', () => {
  it('mulai dari 1 pada sheet yang baru berisi kepala kolom', () => {
    // Nilai persisnya sengaja dipatok. Cap waktu juga menaik, jadi uji yang
    // hanya memeriksa "menaik" tetap hijau saat penomorannya diganti jam.
    const ss = buatRuangKerja();
    simpan({ ss });
    simpan({ ss });
    simpan({ ss });
    expect(barisPenilaian(ss).map((baris) => baris.penilaianId)).toEqual([1, 2, 3]);
  });

  it('melanjutkan dari nomor terbesar yang ada, bukan dari jumlah baris', () => {
    // Nomornya sengaja tidak urut dan berlubang. Implementasi yang memakai
    // getLastRow lolos pada sheet yang rapi lalu memberi nomor kembar di sini.
    const ss = buatRuangKerja({
      penilaian: [
        KEPALA_PENILAIAN,
        [5, 'S1', 'a1', 'K1', 70, '', 'penilai1@kampus.id', '2026-01-01T00:00:00.000Z'],
        [2, 'S1', 'a2', 'K1', 60, '', 'penilai1@kampus.id', '2026-01-01T00:00:00.000Z'],
      ],
    });
    const { balasan } = simpan({ ss });
    expect(balasan.penilaianId).toBe(6);
    expect(barisPenilaian(ss).map((baris) => baris.penilaianId)).toEqual([5, 2, 6]);
  });

  it('tidak pernah kembar walau dua penilai menulis berurutan tanpa jeda', () => {
    const ss = buatRuangKerja();
    simpan({ ss, email: 'penilai1@kampus.id' });
    simpan({ ss, email: 'penilai2@kampus.id' });
    const nomor = barisPenilaian(ss).map((baris) => baris.penilaianId);
    expect(new Set(nomor).size).toBe(nomor.length);
    expect(nomor).toEqual([1, 2]);
  });
});

describe('identitas hanya berasal dari server (Batasan Global 15)', () => {
  it('mengambil kolom oleh dari sesi Google, bukan dari muatan', () => {
    const { ss } = simpan({
      email: 'penilai1@kampus.id',
      muatan: {
        ...MUATAN_BAWAAN,
        oleh: 'palsu@x.com',
        email: 'admin@kampus.id',
        peran: 'admin',
      },
    });
    expect(barisPenilaian(ss)[0]?.oleh).toBe('penilai1@kampus.id');
  });

  it('menulis oleh dalam bentuk kanonik, bukan apa adanya dari Google', () => {
    // Aturan 4 repo. Jejak audit yang menyimpan " PENILAI@Kampus.id " tidak
    // akan pernah cocok dengan daftar penilai saat direkap kembali.
    const { ss } = simpan({ email: ' PENILAI@Kampus.id ' });
    expect(barisPenilaian(ss)[0]?.oleh).toBe('penilai@kampus.id');
  });

  it('mengembalikan oleh pada balasan supaya klien tidak menebaknya sendiri', () => {
    const { balasan } = simpan({ email: 'penilai2@kampus.id' });
    expect(balasan.oleh).toBe('penilai2@kampus.id');
  });
});

describe('sesi_id yang ditulis berasal dari kebijakan, bukan dari pemanggil', () => {
  it('menulis bentuk kanonik walau pemanggil mengirim spasi tepi', () => {
    // Memeriksa izin terhadap satu sesi lalu menulis ke sesi lain adalah cacat
    // yang sudah diantisipasi Tugas 2; di sinilah akibatnya akan terlihat.
    const { ss } = simpan({ sesiIdDikirim: '  S1 ' });
    expect(barisPenilaian(ss)[0]?.sesiId).toBe('S1');
  });
});

describe('kosong bukan nol (aturan 2 repo)', () => {
  it('menyimpan nilai kosong sebagai kosong saat barisnya hanya berisi catatan', () => {
    // Spec §6.3 mengizinkan baris tanpa nilai. Yang dilarang adalah mengubah
    // "tidak dinilai" menjadi "dinilai nol".
    const { ss } = simpan({
      muatan: { respondenId: 'a1', kriteria: 'K1', catatan: 'perlu ditinjau ulang' },
    });
    const baris = barisPenilaian(ss)[0];
    expect(baris?.nilai).toBe('');
    expect(baris?.nilai).not.toBe(0);
    expect(baris?.catatan).toBe('perlu ditinjau ulang');
  });

  it('menyimpan nilai nol sebagai nol, bukan sebagai kosong', () => {
    const { ss } = simpan({ muatan: { respondenId: 'a1', kriteria: 'K1', nilai: 0 } });
    expect(barisPenilaian(ss)[0]?.nilai).toBe(0);
  });

  it('menyimpan catatan kosong sebagai kosong saat barisnya hanya berisi nilai', () => {
    const { ss } = simpan();
    expect(barisPenilaian(ss)[0]?.catatan).toBe('');
  });

  for (const nilai of ['80', '', ' ', true, [80], { nilai: 80 }]) {
    it(`menolak nilai bertipe ${JSON.stringify(nilai)} alih-alih menebak angkanya`, () => {
      // Sheets memaksa "80" menjadi 80 dan "" menjadi sel kosong; keduanya
      // terlihat wajar. Menebak di sini berarti angka yang tidak pernah
      // diketik penilai masuk ke jejak audit atas namanya.
      const { balasan, ss } = simpan({
        muatan: { respondenId: 'a1', kriteria: 'K1', nilai },
      });
      expect(balasan.ok).toBe(false);
      expect(balasan.kode).toBe('MUATAN_TIDAK_SAH');
      expect(balasan.pesan).toMatch(/nilai/i);
      expect(barisPenilaian(ss)).toHaveLength(0);
    });
  }

  it('memperlakukan nilai null sebagai tidak diisi, bukan sebagai nol', () => {
    const { balasan, ss } = simpan({
      muatan: { respondenId: 'a1', kriteria: 'K1', nilai: null, catatan: 'menunggu berkas' },
    });
    expect(balasan.ok).toBe(true);
    expect(barisPenilaian(ss)[0]?.nilai).toBe('');
  });
});

describe('muatan yang tidak bisa disimpan ditolak, bukan ditambal', () => {
  it('menolak baris yang tidak memuat nilai maupun catatan', () => {
    // Baris kosong hanya menambah riwayat tanpa mengubah apa pun, sementara
    // balasan ok:true membuat penilai mengira pekerjaannya tersimpan.
    const { balasan, ss } = simpan({ muatan: { respondenId: 'a1', kriteria: 'K1' } });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('MUATAN_TIDAK_SAH');
    expect(balasan.pesan).toMatch(/catatan/i);
    expect(barisPenilaian(ss)).toHaveLength(0);
  });

  for (const respondenId of ['', '   ', 1, null, ['a1']]) {
    it(`menolak respondenId bertipe ${JSON.stringify(respondenId)}`, () => {
      const { balasan, ss } = simpan({
        muatan: { respondenId, kriteria: 'K1', nilai: 80 },
      });
      expect(balasan.kode).toBe('MUATAN_TIDAK_SAH');
      expect(balasan.pesan).toMatch(/respondenId/);
      expect(barisPenilaian(ss)).toHaveLength(0);
    });
  }

  for (const kriteria of ['', '   ', 2, null]) {
    it(`menolak kriteria bertipe ${JSON.stringify(kriteria)}`, () => {
      const { balasan, ss } = simpan({
        muatan: { respondenId: 'a1', kriteria, nilai: 80 },
      });
      expect(balasan.kode).toBe('MUATAN_TIDAK_SAH');
      expect(balasan.pesan).toMatch(/kriteria/);
      expect(barisPenilaian(ss)).toHaveLength(0);
    });
  }

  it('menolak muatan yang bukan objek', () => {
    const { balasan, ss } = simpan({ muatan: 'a1|K1|80' });
    expect(balasan.kode).toBe('MUATAN_TIDAK_SAH');
    expect(barisPenilaian(ss)).toHaveLength(0);
  });

  it('merapikan spasi pada respondenId dan kriteria sebelum menyimpannya', () => {
    // Aturan 4 repo. "K 1" dan "K  1" yang tersimpan apa adanya menjadi dua
    // kriteria berbeda saat direkap, dan tidak ada yang akan menyadarinya.
    const { ss } = simpan({
      muatan: { respondenId: ' a1 ', kriteria: 'Kriteria  Utama ', nilai: 80 },
    });
    const baris = barisPenilaian(ss)[0];
    expect(baris?.respondenId).toBe('a1');
    expect(baris?.kriteria).toBe('Kriteria Utama');
  });
});

describe('LockService membungkus setiap jalur tulis (Batasan Global 19)', () => {
  it('melepas kunci setelah penulisan berhasil', () => {
    const { lockService } = simpan();
    expect({ ambil: lockService.lock.jumlahAmbil, lepas: lockService.lock.jumlahLepas }).toEqual({
      ambil: 1,
      lepas: 1,
    });
  });

  it('melepas kunci walau penulisan gagal setelah kunci terambil', () => {
    // Kunci yang tidak dilepas membekukan seluruh sistem sampai batas waktunya
    // habis, dan jalur gagal justru yang paling sering melupakannya.
    const lockService = buatLockServicePalsu();
    const ss = awasiPenulisan(buatRuangKerja(), () => {
      throw new Error('Kuota Sheets habis.');
    });
    const { balasan } = simpan({ ss, lockService });
    expect(balasan.ok).toBe(false);
    expect(lockService.lock.jumlahAmbil).toBe(1);
    expect(lockService.lock.jumlahLepas).toBe(1);
  });

  it('menjawab JSON yang bisa dibaca saat penulisan melempar, bukan melempar keluar', () => {
    // Error yang lolos dari doPost membuat Apps Script mengirim halaman HTML.
    // Klien tidak bisa membacanya, jadi kegagalannya menjadi kegagalan diam.
    const ss = awasiPenulisan(buatRuangKerja(), () => {
      throw new Error('Kuota Sheets habis.');
    });
    const { balasan } = simpan({ ss });
    expect(balasan.kode).toBe('GAGAL_MENULIS');
    expect(balasan.pesan).toMatch(/tersimpan/i);
  });

  it('menolak dengan pesan yang mengajari bila kunci tidak bisa diambil', () => {
    // waitLock yang melempar tidak pernah menambah jumlahAmbil, jadi yang
    // diperiksa di sini adalah: permintaan ditolak dan tidak ada yang tertulis.
    const lockService = buatLockServicePalsu({ batasWaktuHabis: true });
    const { balasan, ss } = simpan({ lockService });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('SEDANG_SIBUK');
    expect(balasan.pesan).toMatch(/coba lagi/i);
    expect(lockService.lock.jumlahAmbil).toBe(0);
    expect(barisPenilaian(ss)).toHaveLength(0);
  });

  it('menulis baris justru saat kunci sedang dipegang, bukan sebelum atau sesudahnya', () => {
    // Menghitung ambil dan lepas saja tidak membuktikan urutannya: penulisan
    // yang dipindah ke setelah releaseLock menghasilkan hitungan yang sama.
    const lockService = buatLockServicePalsu();
    const jejak: boolean[] = [];
    const ss = awasiPenulisan(buatRuangKerja(), () => {
      jejak.push(lockService.lock.hasLock());
    });
    simpan({ ss, lockService });
    expect(jejak).toEqual([true]);
  });
});

describe('sheet Penilaian yang cacat menolak, bukan menulis ke kolom yang keliru', () => {
  it('menempatkan nilai mengikuti kepala kolom walau urutannya ditukar', () => {
    // Menulis larik berurutan tetap ok:true pada sheet yang kolomnya ditukar —
    // nilai mendarat di kolom catatan dan tidak ada yang merah.
    const ss = buatRuangKerja({
      penilaian: [
        ['pada', 'oleh', 'catatan', 'nilai', 'kriteria', 'responden_id', 'sesi_id', 'penilaian_id'],
      ],
    });
    simpan({ ss });
    const baris = barisPenilaian(ss)[0];
    expect(baris).toMatchObject({
      penilaianId: 1,
      sesiId: 'S1',
      respondenId: 'a1',
      kriteria: 'K1',
      nilai: 80,
      oleh: 'penilai1@kampus.id',
    });
  });

  it('menolak bila kolom wajib hilang dari sheet Penilaian', () => {
    // Hanya satu kolom yang dihilangkan, dan justru kolom terakhir yang
    // diperiksa: fixture yang menghilangkan beberapa kolom sekaligus hanya
    // membuktikan kolom pertama yang diperiksa, bukan seluruhnya.
    const lockService = buatLockServicePalsu();
    const ss = buatRuangKerja({
      penilaian: [KEPALA_PENILAIAN.filter((nama) => nama !== 'oleh')],
    });
    const { balasan } = simpan({ ss, lockService });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('PENILAIAN_CACAT');
    expect(balasan.pesan).toMatch(/kolom "oleh"/i);
    // Penolakan pun harus melepas kunci.
    expect(lockService.lock.jumlahLepas).toBe(1);
  });

  it('menolak bila sheet Penilaian punya dua kolom bernama nilai', () => {
    const ss = buatRuangKerja({
      penilaian: [[...KEPALA_PENILAIAN, 'nilai']],
    });
    const { balasan } = simpan({ ss });
    expect(balasan.kode).toBe('PENILAIAN_CACAT');
    expect(balasan.pesan).toMatch(/kolom "nilai"/i);
  });

  it('menolak bila sheet Penilaian belum ada sama sekali', () => {
    const ss = buatSpreadsheetPalsu({
      Sesi: [
        KEPALA_SESI,
        ['S1', 'P1', 'Post-Test', 'SK1', 'indeks', 'berjalan', PENILAI_BAWAAN, 'admin@kampus.id'],
      ],
    });
    const { balasan } = simpan({ ss });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('PENILAIAN_TIDAK_ADA');
  });
});

describe('spec §11.2 dan §13 butir 4 — dua penilai dari perangkat berbeda', () => {
  it('menyimpan kedua baris, yang terakhir berlaku', () => {
    const ss = buatRuangKerja();
    simpan({ ss, email: 'penilai1@kampus.id', muatan: { respondenId: 'a1', kriteria: 'K1', nilai: 70 } });
    simpan({ ss, email: 'penilai2@kampus.id', muatan: { respondenId: 'a1', kriteria: 'K1', nilai: 90 } });
    const baris = barisPenilaian(ss);
    expect(baris).toHaveLength(2);
    expect(baris.map((satu) => satu.oleh)).toEqual(['penilai1@kampus.id', 'penilai2@kampus.id']);
    // Urutan berlakunya ditentukan penilaian_id (C2), jadi nomornya harus naik.
    expect(baris.map((satu) => satu.penilaianId)).toEqual([1, 2]);
  });

  it('tidak menghapus pekerjaan penilai lain pada kriteria yang berbeda', () => {
    const ss = buatRuangKerja();
    simpan({ ss, email: 'penilai1@kampus.id', muatan: { respondenId: 'a1', kriteria: 'K1', nilai: 70 } });
    simpan({ ss, email: 'penilai2@kampus.id', muatan: { respondenId: 'a1', kriteria: 'K2', nilai: 90 } });
    expect(barisPenilaian(ss).map((satu) => satu.kriteria)).toEqual(['K1', 'K2']);
  });
});

describe('jejak audit', () => {
  it('mencatat cap waktu dalam bentuk yang bisa diurutkan manusia maupun mesin', () => {
    // `pada` hanya untuk jejak audit; urutan "yang terakhir berlaku" memakai
    // penilaian_id (C2). Karena itu yang diperiksa bentuknya, bukan nilainya.
    const { balasan, ss } = simpan();
    expect(barisPenilaian(ss)[0]?.pada).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(balasan.pada).toBe(barisPenilaian(ss)[0]?.pada);
  });

  it('tidak menulis apa pun ke sheet Sesi', () => {
    // Sheet Sesi memuat daftar peran. Penulisan penilaian yang menyentuhnya
    // berarti penilai bisa mengubah izinnya sendiri.
    const ss = buatRuangKerja();
    const sebelum = JSON.stringify(sheetWajib(ss, 'Sesi').getDataRange().getValues());
    simpan({ ss });
    expect(JSON.stringify(sheetWajib(ss, 'Sesi').getDataRange().getValues())).toBe(sebelum);
  });
});

describe('izin yang ditolak tidak menyisakan baris', () => {
  for (const kasus of [
    { nama: 'orang di luar daftar', email: 'orangluar@gmail.com', status: 'berjalan' },
    { nama: 'identitas kosong', email: '', status: 'berjalan' },
    { nama: 'sesi yang sudah final', email: 'penilai1@kampus.id', status: 'final' },
  ]) {
    it(`menolak ${kasus.nama} tanpa menulis ke Penilaian`, () => {
      const lockService = buatLockServicePalsu();
      const ss = buatRuangKerja({ status: kasus.status });
      const { balasan } = simpan({ ss, email: kasus.email, lockService });
      expect(balasan.ok).toBe(false);
      expect(barisPenilaian(ss)).toHaveLength(0);
      // Kunci tidak boleh diambil sama sekali bila izinnya ditolak: pemanggil
      // yang tidak berhak tidak boleh bisa menahan penilai yang berhak.
      expect(lockService.lock.jumlahAmbil).toBe(0);
    });
  }
});
