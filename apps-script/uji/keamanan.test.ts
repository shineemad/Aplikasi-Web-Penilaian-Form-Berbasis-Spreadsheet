import { describe, expect, it } from 'vitest';
import {
  buatContentServicePalsu,
  buatLockServicePalsu,
  buatSessionPalsu,
  buatSpreadsheetPalsu,
  type KeluaranTeksPalsu,
  type SpreadsheetPalsu,
} from './googlePalsu';
import { muatKode } from './sandbox';

/**
 * Spec §11.3 — uji keamanan yang memanggil endpoint secara langsung.
 *
 * Spec menutup §11.3 dengan "memeriksa bahwa tombolnya tersembunyi di layar
 * tidak membuktikan apa pun". Karena itu setiap uji di berkas ini merakit
 * global Google palsu, memuat Kode.gs yang sama persis dengan yang di-deploy,
 * lalu memanggil doPost sungguhan. Tidak ada satu pun kebijakan yang ditulis
 * ulang di sini (Batasan Global 20) — yang diperiksa adalah jawaban backend.
 */

interface Balasan {
  ok: boolean;
  kode: string;
  pesan: string;
}

interface BarisSesi {
  sesiId: string;
  status: string;
  admin: string[];
  penilai: string[];
}

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

/**
 * Daftar penilai bawaan sengaja berhuruf besar dan berspasi tepi. Aturan 4 repo
 * menuntut email dinormalisasi sebelum dicocokkan; tanpa fixture yang janggal,
 * implementasi yang membandingkan mentah-mentah akan tetap hijau.
 */
const PENILAI_BAWAAN = 'Penilai@Kampus.id ';

function barisDari(sesi: BarisSesi): unknown[][] {
  return [
    KEPALA_SESI,
    [
      sesi.sesiId,
      'P1',
      'Post-Test',
      'SK1',
      'indeks',
      sesi.status,
      sesi.penilai.join(', '),
      sesi.admin.join(', '),
    ],
  ];
}

interface OpsiPanggil {
  email: string;
  aksi: string;
  muatan?: Record<string, unknown>;
  sesi?: Partial<BarisSesi>;
  /** sesi_id yang DIKIRIM pemanggil; bawaannya sama dengan yang ada di sheet. */
  sesiIdDikirim?: string;
}

function panggil(opsi: OpsiPanggil): { balasan: Balasan; ss: SpreadsheetPalsu } {
  const sesi: BarisSesi = {
    sesiId: 'S1',
    status: 'berjalan',
    admin: ['admin@kampus.id'],
    penilai: [PENILAI_BAWAAN],
    ...opsi.sesi,
  };
  const ss = buatSpreadsheetPalsu({ Sesi: barisDari(sesi), Penilaian: [KEPALA_PENILAIAN] });
  const konteks = muatKode({
    Session: buatSessionPalsu(opsi.email),
    SpreadsheetApp: { getActive: () => ss },
    LockService: buatLockServicePalsu(),
    ContentService: buatContentServicePalsu(),
  });
  const doPost = konteks.doPost;
  if (typeof doPost !== 'function') throw new Error('Kode.gs tidak mengekspos doPost.');
  const keluaran = (doPost as (e: unknown) => KeluaranTeksPalsu)({
    postData: {
      contents: JSON.stringify({
        aksi: opsi.aksi,
        sesiId: opsi.sesiIdDikirim === undefined ? sesi.sesiId : opsi.sesiIdDikirim,
        muatan: opsi.muatan === undefined ? {} : opsi.muatan,
      }),
    },
  });
  return { balasan: JSON.parse(keluaran.getContent()) as Balasan, ss };
}

describe('spec §11.3 — empat kasus uji keamanan', () => {
  it('menolak penilai yang mengirim permintaan ubah skema', () => {
    const { balasan } = panggil({ email: 'penilai@kampus.id', aksi: 'ubahSkema' });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('BUKAN_ADMIN');
    // Batasan Global 10: pesan harus menyebut peran yang kurang dan peran yang
    // dipunyai, supaya penilai tahu harus meminta apa kepada siapa.
    expect(balasan.pesan).toMatch(/admin/i);
    expect(balasan.pesan).toMatch(/penilai/i);
  });

  it('menolak penilai yang mengirim permintaan ubah bobot', () => {
    const { balasan } = panggil({ email: 'penilai@kampus.id', aksi: 'ubahBobot' });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('BUKAN_ADMIN');
    expect(balasan.pesan).toMatch(/ubahBobot/);
  });

  it('menolak penulisan ke sesi berstatus final, admin sekalipun', () => {
    const { balasan } = panggil({
      email: 'admin@kampus.id',
      aksi: 'simpanPenilaian',
      sesi: { status: 'final' },
    });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('SESI_FINAL');
    expect(balasan.pesan).toMatch(/final/i);
  });

  it('menolak email di luar daftar', () => {
    const { balasan } = panggil({ email: 'orangluar@gmail.com', aksi: 'bacaRekap' });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('ORANG_TIDAK_DIKENAL');
    // Akun Google ganda adalah sebab paling umum kasus ini; pesannya harus
    // menyebut email yang sedang dipakai supaya orangnya sadar salah akun.
    expect(balasan.pesan).toContain('orangluar@gmail.com');
  });
});

describe('tiga jebakan yang tidak disebut §11.3', () => {
  it('menolak identitas kosong dengan kode tersendiri', () => {
    // Deployment "siapa saja, bahkan anonim" membuat getActiveUser() kosong.
    // Bila ini jatuh ke ORANG_TIDAK_DIKENAL, salah setel deployment akan
    // tersamar sebagai penolakan peran biasa dan tidak pernah tertangkap (K5).
    const { balasan } = panggil({ email: '', aksi: 'bacaRekap' });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('TANPA_IDENTITAS');
    expect(balasan.pesan).toMatch(/anonim/i);
  });

  it('mengabaikan email yang dikirim frontend saat muatan mengaku admin', () => {
    // Batasan Global 15. Muatan mengaku admin; sesi bilang penilai.
    const { balasan } = panggil({
      email: 'penilai@kampus.id',
      aksi: 'ubahSkema',
      muatan: { email: 'admin@kampus.id', oleh: 'admin@kampus.id', peran: 'admin' },
    });
    expect(balasan.kode).toBe('BUKAN_ADMIN');
  });

  it('mengabaikan email yang dikirim frontend saat muatan mengaku orang luar', () => {
    // Arah sebaliknya. Tanpa uji ini, implementasi yang memakai muatan sebagai
    // penyaring tambahan tetap hijau pada uji di atas — ia hanya lebih galak.
    const { balasan } = panggil({
      email: 'admin@kampus.id',
      aksi: 'ubahSkema',
      muatan: { email: 'orangluar@gmail.com', oleh: '', peran: 'pengamat' },
    });
    expect(balasan.ok).toBe(true);
  });

  it('mencocokkan email tanpa memedulikan huruf besar-kecil dan spasi tepi', () => {
    // Aturan 4 repo. Daftar penilai memuat "Penilai@Kampus.id "; sesi Google
    // mengirim "penilai@kampus.id". Keduanya orang yang sama.
    const { balasan } = panggil({ email: 'penilai@kampus.id', aksi: 'simpanPenilaian' });
    expect(balasan.ok).toBe(true);
  });

  it('menormalkan email dari sesi Google, bukan hanya email dari sheet', () => {
    // Arah sebaliknya dari uji di atas. Implementasi yang hanya merapikan isi
    // sheet akan lolos di sana dan gagal di sini.
    const { balasan } = panggil({ email: ' ADMIN@Kampus.id ', aksi: 'ubahSkema' });
    expect(balasan.ok).toBe(true);
  });
});

describe('urutan pemeriksaan izin', () => {
  it('menilai identitas kosong lebih dulu daripada keberadaan sesi', () => {
    // Salah setel deployment tidak boleh tersamar sebagai sesiId yang keliru.
    const { balasan } = panggil({ email: '', aksi: 'bacaRekap', sesiIdDikirim: 'S9' });
    expect(balasan.kode).toBe('TANPA_IDENTITAS');
  });

  it('menolak sesi yang tidak ada sebelum menimbang peran', () => {
    const { balasan } = panggil({ email: 'admin@kampus.id', aksi: 'ubahSkema', sesiIdDikirim: 'S9' });
    expect(balasan.kode).toBe('SESI_TIDAK_ADA');
    expect(balasan.pesan).toContain('S9');
  });

  it('menilai orang tak dikenal lebih dulu daripada aksi tak dikenal', () => {
    // Kalau urutannya terbalik, orang luar bisa menebak daftar aksi backend
    // dengan membandingkan AKSI_TIDAK_DIKENAL dan penolakan lain.
    const { balasan } = panggil({ email: 'orangluar@gmail.com', aksi: 'mengacakNilai' });
    expect(balasan.kode).toBe('ORANG_TIDAK_DIKENAL');
  });

  it('menilai peran lebih dulu daripada status sesi', () => {
    // Penilai yang menyentuh skema tetap ditolak karena perannya, bukan karena
    // sesinya kebetulan final. Alasan yang diberikan harus alasan yang benar.
    const { balasan } = panggil({
      email: 'penilai@kampus.id',
      aksi: 'ubahSkema',
      sesi: { status: 'final' },
    });
    expect(balasan.kode).toBe('BUKAN_ADMIN');
  });
});

describe('cakupan penolakan sesi final', () => {
  it('tetap mengizinkan pembacaan rekap pada sesi final', () => {
    // Spec §10 menolak *penulisan* ke sesi final. Menolak pembacaan juga akan
    // membuat sesi yang selesai mustahil dilaporkan.
    const { balasan } = panggil({
      email: 'penilai@kampus.id',
      aksi: 'bacaRekap',
      sesi: { status: 'final' },
    });
    expect(balasan.ok).toBe(true);
  });

  it('menolak ubah skema pada sesi final walau pemanggilnya admin', () => {
    const { balasan } = panggil({
      email: 'admin@kampus.id',
      aksi: 'ubahSkema',
      sesi: { status: 'final' },
    });
    expect(balasan.kode).toBe('SESI_FINAL');
  });
});

describe('tabel peran §9.1 diterjemahkan apa adanya', () => {
  it('mengizinkan admin menulis Penilaian pada sesi berjalan', () => {
    // Kolom "Tidak boleh" untuk Admin di §9.1 kosong; admin tidak dikecualikan
    // dari penulisan Penilaian.
    const { balasan } = panggil({ email: 'admin@kampus.id', aksi: 'simpanPenilaian' });
    expect(balasan.ok).toBe(true);
  });

  it('mengizinkan penilai membaca rekap', () => {
    const { balasan } = panggil({ email: 'penilai@kampus.id', aksi: 'bacaRekap' });
    expect(balasan.ok).toBe(true);
  });

  it('mengenali orang yang terdaftar di dua daftar sekaligus sebagai admin', () => {
    const { balasan } = panggil({
      email: 'ketua@kampus.id',
      aksi: 'ubahBobot',
      sesi: { admin: ['ketua@kampus.id'], penilai: ['ketua@kampus.id'] },
    });
    expect(balasan.ok).toBe(true);
  });

  it('memisahkan beberapa email dalam satu sel daftar peran', () => {
    // Spec §6.4 menyimpan daftar email dalam satu sel. Implementasi yang
    // membandingkan seluruh isi sel akan mengunci semua orang kecuali yang
    // kebetulan sendirian.
    const { balasan } = panggil({
      email: 'penilai2@kampus.id',
      aksi: 'simpanPenilaian',
      sesi: { penilai: ['penilai1@kampus.id', 'penilai2@kampus.id'] },
    });
    expect(balasan.ok).toBe(true);
  });
});

describe('aksi sebagai kunci yang dikendalikan pemanggil', () => {
  // Nama aksi datang dari luar. Pencarian pada objek biasa akan menemukan
  // anggota warisan Object.prototype dan menganggapnya aksi yang sah.
  for (const aksi of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    it(`memperlakukan "${aksi}" sebagai aksi tak dikenal`, () => {
      const { balasan } = panggil({ email: 'admin@kampus.id', aksi });
      expect(balasan.ok).toBe(false);
      expect(balasan.kode).toBe('AKSI_TIDAK_DIKENAL');
    });
  }
});

describe('sheet Sesi yang cacat gagal menutup, bukan membuka', () => {
  it('menolak bila sheet Sesi belum ada sama sekali', () => {
    const ss = buatSpreadsheetPalsu({ Penilaian: [KEPALA_PENILAIAN] });
    const konteks = muatKode({
      Session: buatSessionPalsu('admin@kampus.id'),
      SpreadsheetApp: { getActive: () => ss },
      LockService: buatLockServicePalsu(),
      ContentService: buatContentServicePalsu(),
    });
    const doPost = konteks.doPost as (e: unknown) => KeluaranTeksPalsu;
    const keluaran = doPost({
      postData: { contents: JSON.stringify({ aksi: 'ubahSkema', sesiId: 'S1', muatan: {} }) },
    });
    expect((JSON.parse(keluaran.getContent()) as Balasan).kode).toBe('SESI_TIDAK_ADA');
  });

  it('menolak bila kolom admin hilang dari sheet Sesi', () => {
    // Kolom peran yang hilang tidak boleh berarti "tidak ada yang dilarang".
    const ss = buatSpreadsheetPalsu({
      Sesi: [
        ['sesi_id', 'status', 'penilai'],
        ['S1', 'berjalan', 'admin@kampus.id'],
      ],
    });
    const konteks = muatKode({
      Session: buatSessionPalsu('admin@kampus.id'),
      SpreadsheetApp: { getActive: () => ss },
      LockService: buatLockServicePalsu(),
      ContentService: buatContentServicePalsu(),
    });
    const doPost = konteks.doPost as (e: unknown) => KeluaranTeksPalsu;
    const keluaran = doPost({
      postData: { contents: JSON.stringify({ aksi: 'ubahSkema', sesiId: 'S1', muatan: {} }) },
    });
    const balasan = JSON.parse(keluaran.getContent()) as Balasan;
    expect(balasan.ok).toBe(false);
    expect(balasan.pesan).toMatch(/kolom/i);
  });
});
