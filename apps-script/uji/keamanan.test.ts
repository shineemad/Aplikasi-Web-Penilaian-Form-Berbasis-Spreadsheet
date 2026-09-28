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
  /** Hanya ada pada balasan yang sudah melewati kebijakan izin. */
  sesiId?: string;
}

interface BarisSesi {
  sesiId: string;
  status: string;
  admin: string[];
  penilai: string[];
  /** Isi sel kolom `penilai` apa adanya, untuk menguji pemisah daftar. */
  selPenilai?: string;
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

const SESI_BAWAAN: BarisSesi = {
  sesiId: 'S1',
  status: 'berjalan',
  admin: ['admin@kampus.id'],
  penilai: [PENILAI_BAWAAN],
};

function barisSesi(sesi: BarisSesi): unknown[] {
  return [
    sesi.sesiId,
    'P1',
    'Post-Test',
    'SK1',
    'indeks',
    sesi.status,
    sesi.selPenilai === undefined ? sesi.penilai.join(', ') : sesi.selPenilai,
    sesi.admin.join(', '),
  ];
}

function kisiDari(daftar: BarisSesi[]): unknown[][] {
  const hasil: unknown[][] = [KEPALA_SESI];
  for (const satu of daftar) hasil.push(barisSesi(satu));
  return hasil;
}

function kirim(opsi: { email: string; kisiSesi: unknown[][]; badan: unknown }): {
  balasan: Balasan;
  ss: SpreadsheetPalsu;
} {
  const ss = buatSpreadsheetPalsu({ Sesi: opsi.kisiSesi, Penilaian: [KEPALA_PENILAIAN] });
  const konteks = muatKode({
    Session: buatSessionPalsu(opsi.email),
    SpreadsheetApp: { getActive: () => ss },
    LockService: buatLockServicePalsu(),
    ContentService: buatContentServicePalsu(),
  });
  const doPost = konteks.doPost;
  if (typeof doPost !== 'function') throw new Error('Kode.gs tidak mengekspos doPost.');
  const keluaran = (doPost as (e: unknown) => KeluaranTeksPalsu)({
    postData: { contents: JSON.stringify(opsi.badan) },
  });
  return { balasan: JSON.parse(keluaran.getContent()) as Balasan, ss };
}

interface OpsiPanggil {
  email: string;
  aksi: string;
  muatan?: Record<string, unknown>;
  sesi?: Partial<BarisSesi>;
  /** sesi_id yang DIKIRIM pemanggil; bawaannya sama dengan yang ada di sheet. */
  sesiIdDikirim?: unknown;
  /** Kisi sheet Sesi apa adanya; menggantikan `sesi` bila diisi. */
  kisiSesi?: unknown[][];
}

function panggil(opsi: OpsiPanggil): { balasan: Balasan; ss: SpreadsheetPalsu } {
  const sesi: BarisSesi = { ...SESI_BAWAAN, ...opsi.sesi };
  return kirim({
    email: opsi.email,
    kisiSesi: opsi.kisiSesi === undefined ? kisiDari([sesi]) : opsi.kisiSesi,
    badan: {
      aksi: opsi.aksi,
      sesiId: opsi.sesiIdDikirim === undefined ? sesi.sesiId : opsi.sesiIdDikirim,
      muatan: opsi.muatan === undefined ? {} : opsi.muatan,
    },
  });
}

/**
 * Badan permintaan apa adanya, tanpa bentuk {aksi, sesiId, muatan} yang dikunci
 * `panggil`. Tanpa jalur ini, medan identitas di TINGKAT ATAS badan permintaan
 * mustahil diuji — padahal di situlah `permintaan.email` akan hidup bila
 * seseorang menuliskannya.
 */
function panggilBadan(opsi: { email: string; badan: unknown; sesi?: Partial<BarisSesi> }): {
  balasan: Balasan;
  ss: SpreadsheetPalsu;
} {
  const sesi: BarisSesi = { ...SESI_BAWAAN, ...opsi.sesi };
  return kirim({ email: opsi.email, kisiSesi: kisiDari([sesi]), badan: opsi.badan });
}

describe('spec §11.3 — empat kasus uji keamanan', () => {
  it('menolak penilai yang mengirim permintaan ubah skema', () => {
    const { balasan } = panggil({ email: 'penilai@kampus.id', aksi: 'ubahSkema' });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('BUKAN_ADMIN');
    // Batasan Global 10: pesan harus menyebut peran yang dibutuhkan DAN peran
    // yang dipegang. `toMatch(/penilai/i)` saja terpenuhi oleh alamat email
    // penilai@kampus.id yang memang tercetak di pesan, jadi tidak membuktikan
    // apa pun tentang perannya.
    expect(balasan.pesan).toMatch(/hanya boleh dilakukan admin\b/i);
    expect(balasan.pesan).toMatch(/terdaftar sebagai penilai\b/i);
  });

  it('menolak penilai yang mengirim permintaan ubah bobot', () => {
    const { balasan } = panggil({ email: 'penilai@kampus.id', aksi: 'ubahBobot' });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('BUKAN_ADMIN');
    expect(balasan.pesan).toMatch(/ubahBobot/);
    expect(balasan.pesan).toMatch(/hanya boleh dilakukan admin\b/i);
    expect(balasan.pesan).toMatch(/terdaftar sebagai penilai\b/i);
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

describe('izin yang lolos bukan berarti aksi terjadi', () => {
  it('menolak aksi yang belum dibangun alih-alih menjawab sukses', () => {
    // Store membuang perintah dari antrean begitu melihat ok:true (Batasan
    // Global 18). Selama handler-nya belum ada, ok:true berarti penilaian
    // hilang diam-diam — kebalikan dari aturan 7 repo. Tugas 3 harus mengubah
    // uji ini secara sadar, bukan menemukannya sudah hijau.
    const { balasan } = panggil({ email: 'admin@kampus.id', aksi: 'simpanPenilaian' });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('AKSI_BELUM_DIBANGUN');
    expect(balasan.pesan).toMatch(/belum/i);
  });

  it('meneruskan sesiId dalam bentuk kanonik, bukan teks mentah pemanggil', () => {
    // Kebijakan izin memakai bentuk yang sudah dirapikan. Bila yang diteruskan
    // ke handler adalah teks mentah, Tugas 3 bisa memeriksa izin pada satu sesi
    // lalu menulis ke sesi lain.
    const { balasan } = panggil({
      email: 'admin@kampus.id',
      aksi: 'simpanPenilaian',
      sesiIdDikirim: '  S1 ',
    });
    expect(balasan.kode).toBe('AKSI_BELUM_DIBANGUN');
    expect(balasan.sesiId).toBe('S1');
  });
});

describe('bentuk permintaan yang tidak sah ditolak sebelum apa pun ditimbang', () => {
  for (const sesiIdDikirim of [['S1'], 1, null, { sesiId: 'S1' }, true]) {
    it(`menolak sesiId bertipe ${JSON.stringify(sesiIdDikirim)}`, () => {
      const { balasan } = panggil({ email: 'admin@kampus.id', aksi: 'bacaRekap', sesiIdDikirim });
      expect(balasan.ok).toBe(false);
      expect(balasan.kode).toBe('MUATAN_TIDAK_SAH');
      expect(balasan.pesan).toMatch(/sesiId/);
    });
  }

  it('menolak permintaan tanpa medan sesiId sama sekali', () => {
    const { balasan } = panggilBadan({
      email: 'admin@kampus.id',
      badan: { aksi: 'bacaRekap', muatan: {} },
    });
    expect(balasan.kode).toBe('MUATAN_TIDAK_SAH');
  });

  it('tetap menerima sesiId berspasi tepi, karena itu teks yang sah', () => {
    const { balasan } = panggil({
      email: 'admin@kampus.id',
      aksi: 'bacaRekap',
      sesiIdDikirim: ' S1 ',
    });
    expect(balasan.kode).toBe('AKSI_BELUM_DIBANGUN');
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

  it('tidak meresepkan mode deployment lewat pesan error', () => {
    // §9.2 menuntut Spreadsheet TIDAK dibagikan kepada penilai, sedangkan
    // "Jalankan sebagai: Pengguna yang mengakses" justru mengharuskannya.
    // Pesan yang meresepkan salah satunya menuntun pembacanya mematahkan §9.2.
    const { balasan } = panggil({ email: '', aksi: 'bacaRekap' });
    expect(balasan.pesan).not.toMatch(/jalankan sebagai/i);
    expect(balasan.pesan).toMatch(/protokol keamanan/i);
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
    expect(balasan.kode).toBe('AKSI_BELUM_DIBANGUN');
  });

  it('mengabaikan medan identitas di tingkat atas badan permintaan yang mengaku admin', () => {
    // Dua uji di atas hanya menyentuh `muatan`. Medan bernama sama di TINGKAT
    // ATAS adalah tempat yang paling mudah dibaca `permintaan.email`, dan
    // selama helper uji mengunci bentuk badan, lubang itu mustahil terlihat.
    const { balasan } = panggilBadan({
      email: 'penilai@kampus.id',
      badan: {
        aksi: 'ubahSkema',
        sesiId: 'S1',
        email: 'admin@kampus.id',
        oleh: 'admin@kampus.id',
        peran: 'admin',
        muatan: {},
      },
    });
    expect(balasan.kode).toBe('BUKAN_ADMIN');
  });

  it('mengabaikan medan identitas di tingkat atas badan permintaan yang mengaku orang luar', () => {
    const { balasan } = panggilBadan({
      email: 'admin@kampus.id',
      badan: {
        aksi: 'ubahSkema',
        sesiId: 'S1',
        email: 'orangluar@gmail.com',
        oleh: '',
        peran: 'pengamat',
        muatan: {},
      },
    });
    expect(balasan.kode).toBe('AKSI_BELUM_DIBANGUN');
  });

  it('mencocokkan email tanpa memedulikan huruf besar-kecil dan spasi tepi', () => {
    // Aturan 4 repo. Daftar penilai memuat "Penilai@Kampus.id "; sesi Google
    // mengirim "penilai@kampus.id". Keduanya orang yang sama.
    const { balasan } = panggil({ email: 'penilai@kampus.id', aksi: 'simpanPenilaian' });
    expect(balasan.kode).toBe('AKSI_BELUM_DIBANGUN');
  });

  it('menormalkan email dari sesi Google, bukan hanya email dari sheet', () => {
    // Arah sebaliknya dari uji di atas. Implementasi yang hanya merapikan isi
    // sheet akan lolos di sana dan gagal di sini.
    const { balasan } = panggil({ email: ' ADMIN@Kampus.id ', aksi: 'ubahSkema' });
    expect(balasan.kode).toBe('AKSI_BELUM_DIBANGUN');
  });
});

describe('email dicocokkan persis, bukan sebagai potongan teks', () => {
  it('menolak pemilik email yang menjadi potongan email penilai terdaftar', () => {
    // Pencocokan dengan indexOf membuat siapa pun yang punya akun Google biasa
    // cukup memilih alamat yang kebetulan menjadi potongan alamat penilai.
    const { balasan } = panggil({
      email: 'penilai@gmail.com',
      aksi: 'simpanPenilaian',
      sesi: { penilai: ['budi.penilai@gmail.com'] },
    });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('ORANG_TIDAK_DIKENAL');
  });

  it('menolak pemilik email yang justru memuat email penilai terdaftar', () => {
    // Arah sebaliknya: implementasi yang menulis `email.indexOf(terdaftar)`
    // lolos uji di atas dan gagal di sini.
    const { balasan } = panggil({
      email: 'budi.penilai@gmail.com',
      aksi: 'simpanPenilaian',
      sesi: { penilai: ['penilai@gmail.com'] },
    });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('ORANG_TIDAK_DIKENAL');
  });

  it('menolak admin yang emailnya hanya ditambahi akhiran', () => {
    const { balasan } = panggil({
      email: 'admin@kampus.id.penyerang.test',
      aksi: 'ubahSkema',
      sesi: { admin: ['admin@kampus.id'] },
    });
    expect(balasan.kode).toBe('ORANG_TIDAK_DIKENAL');
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
    expect(balasan.kode).toBe('AKSI_BELUM_DIBANGUN');
  });

  it('menolak ubah skema pada sesi final walau pemanggilnya admin', () => {
    const { balasan } = panggil({
      email: 'admin@kampus.id',
      aksi: 'ubahSkema',
      sesi: { status: 'final' },
    });
    expect(balasan.kode).toBe('SESI_FINAL');
  });

  it('menolak ubah bobot pada sesi final walau pemanggilnya admin', () => {
    // Tidak satu pun uji sebelumnya menyentuh ubahBobot pada sesi final,
    // sehingga menghapus tanda menulis dari aksi ini tidak membuat apa pun
    // merah.
    const { balasan } = panggil({
      email: 'admin@kampus.id',
      aksi: 'ubahBobot',
      sesi: { status: 'final' },
    });
    expect(balasan.kode).toBe('SESI_FINAL');
  });

  it('menolak penulisan pada status "Final" yang ditulis berhuruf besar', () => {
    // Admin mengetik status dengan tangan. Perbandingan yang tidak menormalkan
    // huruf membuat satu huruf kapital membuka kembali sesi yang sudah ditutup.
    const { balasan } = panggil({
      email: 'admin@kampus.id',
      aksi: 'simpanPenilaian',
      sesi: { status: 'Final' },
    });
    expect(balasan.kode).toBe('SESI_FINAL');
  });
});

describe('status sesi memakai daftar izin, bukan daftar larangan', () => {
  it('mengizinkan penulisan pada sesi berstatus draft', () => {
    const { balasan } = panggil({
      email: 'admin@kampus.id',
      aksi: 'simpanPenilaian',
      sesi: { status: 'draft' },
    });
    expect(balasan.kode).toBe('AKSI_BELUM_DIBANGUN');
  });

  for (const status of ['Selesai', '', 'final.', 'finalized', 'ditutup']) {
    it(`menolak penulisan pada status tak dikenal ${JSON.stringify(status)}`, () => {
      // Daftar larangan `status === 'final'` meloloskan semuanya. §6.4 hanya
      // mengenal draft, berjalan, dan final; sisanya berarti tidak ada cara
      // tahu apakah sesi ini masih terbuka.
      const { balasan } = panggil({
        email: 'admin@kampus.id',
        aksi: 'simpanPenilaian',
        sesi: { status },
      });
      expect(balasan.ok).toBe(false);
      expect(balasan.kode).toBe('SESI_CACAT');
      expect(balasan.pesan).toMatch(/status/i);
    });
  }

  it('tetap mengizinkan pembacaan pada status tak dikenal', () => {
    // Ketiga status yang sah sama-sama boleh dibaca, jadi status yang tidak
    // dikenal tidak menimbulkan keraguan apa pun tentang pembacaan. Menolaknya
    // di sini hanya kebisingan yang tidak berakar pada keraguan.
    const { balasan } = panggil({
      email: 'admin@kampus.id',
      aksi: 'bacaRekap',
      sesi: { status: 'Selesai' },
    });
    expect(balasan.kode).toBe('AKSI_BELUM_DIBANGUN');
  });
});

describe('tabel peran §9.1 diterjemahkan apa adanya', () => {
  it('mengizinkan admin menulis Penilaian pada sesi berjalan', () => {
    // Kolom "Tidak boleh" untuk Admin di §9.1 kosong; admin tidak dikecualikan
    // dari penulisan Penilaian.
    const { balasan } = panggil({ email: 'admin@kampus.id', aksi: 'simpanPenilaian' });
    expect(balasan.kode).toBe('AKSI_BELUM_DIBANGUN');
  });

  it('mengizinkan penilai membaca rekap', () => {
    const { balasan } = panggil({ email: 'penilai@kampus.id', aksi: 'bacaRekap' });
    expect(balasan.kode).toBe('AKSI_BELUM_DIBANGUN');
  });

  it('mengenali orang yang terdaftar di dua daftar sekaligus sebagai admin', () => {
    const { balasan } = panggil({
      email: 'ketua@kampus.id',
      aksi: 'ubahBobot',
      sesi: { admin: ['ketua@kampus.id'], penilai: ['ketua@kampus.id'] },
    });
    expect(balasan.kode).toBe('AKSI_BELUM_DIBANGUN');
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
    expect(balasan.kode).toBe('AKSI_BELUM_DIBANGUN');
  });

  it('memisahkan daftar yang memakai titik koma', () => {
    const { balasan } = panggil({
      email: 'penilai2@kampus.id',
      aksi: 'simpanPenilaian',
      sesi: { selPenilai: 'penilai1@kampus.id; penilai2@kampus.id' },
    });
    expect(balasan.kode).toBe('AKSI_BELUM_DIBANGUN');
  });

  it('memisahkan daftar yang memakai baris baru dalam satu sel', () => {
    // Alt+Enter di Sheets menghasilkan bentuk ini, dan itulah cara paling
    // alami mengetik daftar penilai yang panjang.
    const { balasan } = panggil({
      email: 'penilai2@kampus.id',
      aksi: 'simpanPenilaian',
      sesi: { selPenilai: 'penilai1@kampus.id\npenilai2@kampus.id' },
    });
    expect(balasan.kode).toBe('AKSI_BELUM_DIBANGUN');
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
    // Ruang kerja yang belum disiapkan memang belum punya sesi apa pun; itu
    // keadaan yang berbeda dari sheet yang ada tetapi bentuknya rusak.
    expect((JSON.parse(keluaran.getContent()) as Balasan).kode).toBe('SESI_TIDAK_ADA');
  });

  it('menolak bila kolom admin hilang dari sheet Sesi', () => {
    // Kolom peran yang hilang tidak boleh berarti "tidak ada yang dilarang".
    // Kodenya harus tersendiri: pesan SESI_TIDAK_ADA pun menyebut kata "kolom",
    // sehingga `toMatch(/kolom/i)` saja tidak membuktikan apa-apa.
    const { balasan } = panggil({
      email: 'admin@kampus.id',
      aksi: 'ubahSkema',
      kisiSesi: [
        ['sesi_id', 'status', 'penilai'],
        ['S1', 'berjalan', 'admin@kampus.id'],
      ],
    });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('SESI_CACAT');
    expect(balasan.pesan).toMatch(/kolom "admin"/i);
  });

  it('menolak bila kolom status hilang dari sheet Sesi', () => {
    // Tanpa kolom status, tidak ada cara tahu apakah sesi sudah final.
    const { balasan } = panggil({
      email: 'admin@kampus.id',
      aksi: 'simpanPenilaian',
      kisiSesi: [
        ['sesi_id', 'penilai', 'admin'],
        ['S1', 'penilai@kampus.id', 'admin@kampus.id'],
      ],
    });
    expect(balasan.kode).toBe('SESI_CACAT');
    expect(balasan.pesan).toMatch(/kolom "status"/i);
  });

  it('menolak bila sheet Sesi punya dua kolom bernama admin', () => {
    // Admin melihat kolom yang satu, backend membaca kolom yang lain. Memakai
    // yang pertama diam-diam berarti daftar yang tampak di layar bukan daftar
    // yang benar-benar menentukan izin.
    const { balasan } = panggil({
      email: 'admin@kampus.id',
      aksi: 'ubahSkema',
      kisiSesi: [
        ['sesi_id', 'status', 'penilai', 'admin', 'admin'],
        ['S1', 'berjalan', 'penilai@kampus.id', 'admin@kampus.id', 'lain@kampus.id'],
      ],
    });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('SESI_CACAT');
    expect(balasan.pesan).toMatch(/kolom "admin"/i);
  });

  it('menolak bila satu sesi_id muncul pada dua baris', () => {
    // Memakai baris pertama membuat sesi final bisa ditulisi hanya karena ada
    // baris kedua — atau sebaliknya, tergantung urutan pengetikan admin.
    const { balasan } = panggil({
      email: 'admin@kampus.id',
      aksi: 'simpanPenilaian',
      kisiSesi: kisiDari([SESI_BAWAAN, { ...SESI_BAWAAN, status: 'final' }]),
    });
    expect(balasan.ok).toBe(false);
    expect(balasan.kode).toBe('SESI_CACAT');
    expect(balasan.pesan).toMatch(/lebih dari satu baris/i);
  });

  it('menolak sesi_id kembar bahkan untuk pembacaan', () => {
    // Berbeda dari status yang tak dikenal: di sini daftar perannya sendiri
    // yang tidak bisa dipercaya, jadi tidak ada jawaban yang aman.
    const { balasan } = panggil({
      email: 'admin@kampus.id',
      aksi: 'bacaRekap',
      kisiSesi: kisiDari([SESI_BAWAAN, { ...SESI_BAWAAN, admin: ['lain@kampus.id'] }]),
    });
    expect(balasan.kode).toBe('SESI_CACAT');
  });
});
