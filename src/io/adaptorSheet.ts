import type { Kelengkapan } from '../core/kelengkapan';
import { normalisasiTeks } from '../core/normalisasi';
import type { BarisPenilaian } from '../core/penilaian';
import type { Aturan } from '../core/tipe';

/**
 * Satu-satunya penerjemah baris sheet menjadi tipe domain (Batasan Global 23).
 *
 * Masukannya adalah hasil `getValues()` apa adanya, **termasuk baris kepala**.
 * Sheets tidak menyerahkan data sebagaimana ditulis: sel kosong kembali sebagai
 * `''` dan bukan `null`, kolom berformat teks mengembalikan `'5'` sementara
 * kolom biasa mengembalikan `5`, sel bertanggal kembali sebagai `Date`, dan
 * baris yang lebih pendek daripada kepala menyisakan `undefined`. Membiarkan
 * modul lain menebak-nebak semua itu berarti tebakannya berbeda-beda, dan
 * perbedaannya hanya terlihat sebagai angka yang salah.
 *
 * Dua fungsi sengaja berhenti setengah jalan karena spec belum menetapkan
 * bentuknya, dan menebak di sini akan menanam asumsi yang sulit dicabut:
 * `bacaRespondenTetap` tidak membaca kolom `jawaban_*` maupun `meta_*`, dan
 * `bacaSkemaMentah` tidak menafsirkan `parameter` menjadi `Aturan`.
 */
export interface MasalahBaris {
  /** Nomor baris di Spreadsheet, dihitung dari 1; baris kepala adalah baris 1. */
  nomorBaris: number;
  /** `kepala` berarti seluruh sheet tidak terbaca; `baris` hanya satu baris. */
  jenis: 'kepala' | 'baris';
  pesan: string;
}

/** Baris cacat ditandai, bukan dibuang (Batasan Global 24). */
export interface HasilAdaptor<T> {
  baris: T[];
  masalah: MasalahBaris[];
}

export interface BarisSesi {
  sesiId: string;
  proyekId: string;
  nama: string;
  skemaId: string;
  mode: 'peringkat' | 'indeks';
  status: 'draft' | 'berjalan' | 'final';
  penilai: string[];
  admin: string[];
}

export interface BarisProyek {
  proyekId: string;
  nama: string;
  sesiUrut: string[];
  /** `null` bila kosong; kolom selisih lalu tidak dibuat sama sekali (§6.5). */
  sesiAwal: string | null;
  sesiAkhir: string | null;
  dibuatPada: string;
}

/**
 * Kolom tetap sheet `Responden` (§6.1). Kolom `jawaban_*` dan `meta_*` tidak
 * ikut dibaca: §6.1 hanya menyebut "satu kolom per pertanyaan" tanpa menetapkan
 * bagaimana nama kolom asli berubah menjadi akhiran, sehingga pemetaannya
 * kembali ke `kolom_asal` hanya bisa ditebak — dan tebakan yang meleset membuat
 * jawaban hilang tanpa peringatan.
 */
export interface BarisRespondenTetap {
  sesiId: string;
  id: string;
  email: string;
  nama: string | null;
  kelengkapan: Kelengkapan;
  diimporPada: string;
}

/**
 * Baris sheet `Skema` yang tipe selnya sudah dibereskan tetapi `parameter`-nya
 * belum ditafsirkan menjadi `Aturan`. Penafsiran itu menunggu dua hal yang
 * belum ditetapkan spec: di mana `perlakuanKosong` disimpan, dan apa arti
 * `skor_maks` bagi aturan yang tipenya tidak punya medan untuk menampungnya.
 */
export interface BarisSkemaMentah {
  skemaId: string;
  kolomAsal: string;
  label: string;
  dimensi: string;
  jenisAturan: Aturan['jenis'];
  /** Hasil `JSON.parse`; `null` bila selnya kosong. */
  parameter: unknown;
  skorMaks: number | null;
  bobot: number;
}

type Terjemahan<T> = { ok: true; baris: T } | { ok: false; pesan: string };

type AmbilSel = (nama: string) => unknown;

const KOLOM_PENILAIAN = [
  'penilaian_id',
  'sesi_id',
  'responden_id',
  'kriteria',
  'nilai',
  'catatan',
  'oleh',
  'pada',
];
const KOLOM_SESI = [
  'sesi_id',
  'proyek_id',
  'nama',
  'skema_id',
  'mode',
  'status',
  'penilai',
  'admin',
];
const KOLOM_PROYEK = ['proyek_id', 'nama', 'sesi_urut', 'sesi_awal', 'sesi_akhir', 'dibuat_pada'];
const KOLOM_RESPONDEN = ['sesi_id', 'id', 'email', 'nama', 'status_kelengkapan', 'diimpor_pada'];
const KOLOM_SKEMA = [
  'skema_id',
  'kolom_asal',
  'label',
  'dimensi',
  'aturan',
  'parameter',
  'skor_maks',
  'bobot',
];

export function bacaPenilaian(kisi: unknown[][]): HasilAdaptor<BarisPenilaian> {
  return bacaSheet(kisi, 'Penilaian', KOLOM_PENILAIAN, (ambil) => {
    const penilaianId = angkaSel(ambil('penilaian_id'));
    if (penilaianId === null || penilaianId === BUKAN_ANGKA) {
      return tolak(
        keluhanTipe(
          'penilaian_id',
          ambil('penilaian_id'),
          'kolom itu adalah nomor urut yang menentukan nilai mana yang berlaku',
        ),
      );
    }

    const sesiId = rapikan(ambil('sesi_id'));
    if (sesiId === '') {
      return tolak(keluhanKosong('sesi_id', 'sehingga baris ini tidak dimiliki sesi mana pun.'));
    }

    const respondenId = rapikan(ambil('responden_id'));
    if (respondenId === '') {
      return tolak(
        keluhanKosong('responden_id', 'sehingga nilainya tidak bisa dikaitkan dengan siapa pun.'),
      );
    }

    // Hanya spasi tepi yang dibuang. `kriteria` adalah nama kolom asal, dan
    // importer menyimpan nama kolom dengan trim() saja: merapatkan spasi ganda
    // di sini membuatnya tidak pernah cocok lagi dengan `kolom_asal`.
    const kriteria = pangkas(ambil('kriteria'));
    if (kriteria === '') {
      return tolak(
        keluhanKosong('kriteria', 'sehingga tidak diketahui butir mana yang sedang dinilai.'),
      );
    }

    const nilai = angkaSel(ambil('nilai'));
    if (nilai === BUKAN_ANGKA) {
      return tolak(
        keluhanTipe(
          'nilai',
          ambil('nilai'),
          'kolom itu hanya boleh berisi angka, atau dikosongkan bila barisnya memang hanya catatan',
        ),
      );
    }

    // Identitas hanya berasal dari server (Batasan Global 15). Baris tanpa
    // penulis membuat koreksi tidak punya penanggung jawab, padahal justru
    // itulah yang membuat jejak audit berguna.
    const oleh = rapikanKecil(ambil('oleh'));
    if (oleh === '') {
      return tolak(keluhanKosong('oleh', 'sehingga tidak diketahui siapa yang menilainya.'));
    }

    const catatan = pangkas(ambil('catatan'));
    return terima<BarisPenilaian>({
      penilaianId,
      sesiId,
      respondenId,
      kriteria,
      nilai,
      catatan: catatan === '' ? null : catatan,
      oleh,
      pada: pangkas(ambil('pada')),
    });
  });
}

export function bacaSesi(kisi: unknown[][]): HasilAdaptor<BarisSesi> {
  return bacaSheet(kisi, 'Sesi', KOLOM_SESI, (ambil) => {
    // Huruf besar-kecil pada sesi_id sengaja dipertahankan: perilakunya belum
    // diputuskan, dan menyeragamkannya di sini memutuskannya diam-diam.
    const sesiId = rapikan(ambil('sesi_id'));
    if (sesiId === '') {
      return tolak(keluhanKosong('sesi_id', 'sehingga sesi ini tidak punya pengenal.'));
    }

    const proyekId = rapikan(ambil('proyek_id'));
    if (proyekId === '') {
      return tolak(
        keluhanKosong(
          'proyek_id',
          'sehingga sesi ini tidak masuk tabel gabungan proyek mana pun tanpa ada yang menyadarinya.',
        ),
      );
    }

    const skemaId = rapikan(ambil('skema_id'));
    if (skemaId === '') {
      return tolak(
        keluhanKosong('skema_id', 'sehingga tidak diketahui aturan penilaian mana yang dipakai.'),
      );
    }

    const mode = rapikanKecil(ambil('mode'));
    if (!adalahMode(mode)) {
      return tolak(
        keluhanTipe('mode', ambil('mode'), 'spec §6.4 hanya mengenal peringkat dan indeks'),
      );
    }

    const status = rapikanKecil(ambil('status'));
    if (!adalahStatus(status)) {
      return tolak(
        keluhanTipe(
          'status',
          ambil('status'),
          'spec §6.4 hanya mengenal draft, berjalan, dan final',
        ),
      );
    }

    // `nama` hanya label tampilan. Membuang sesinya karena labelnya kosong
    // justru menghilangkan seluruh nilai sesi itu dari rekap.
    return terima<BarisSesi>({
      sesiId,
      proyekId,
      nama: pangkas(ambil('nama')),
      skemaId,
      mode,
      status,
      penilai: pecahDaftar(ambil('penilai'), normalisasiTeks),
      admin: pecahDaftar(ambil('admin'), normalisasiTeks),
    });
  });
}

export function bacaProyek(kisi: unknown[][]): HasilAdaptor<BarisProyek> {
  return bacaSheet(kisi, 'Proyek', KOLOM_PROYEK, (ambil) => {
    const proyekId = rapikan(ambil('proyek_id'));
    if (proyekId === '') {
      return tolak(keluhanKosong('proyek_id', 'sehingga proyek ini tidak punya pengenal.'));
    }

    const sesiAwal = rapikan(ambil('sesi_awal'));
    const sesiAkhir = rapikan(ambil('sesi_akhir'));
    return terima<BarisProyek>({
      proyekId,
      nama: pangkas(ambil('nama')),
      sesiUrut: pecahDaftar(ambil('sesi_urut'), rapikanTeks),
      sesiAwal: sesiAwal === '' ? null : sesiAwal,
      sesiAkhir: sesiAkhir === '' ? null : sesiAkhir,
      dibuatPada: pangkas(ambil('dibuat_pada')),
    });
  });
}

export function bacaRespondenTetap(kisi: unknown[][]): HasilAdaptor<BarisRespondenTetap> {
  return bacaSheet(kisi, 'Responden', KOLOM_RESPONDEN, (ambil) => {
    const sesiId = rapikan(ambil('sesi_id'));
    if (sesiId === '') {
      return tolak(keluhanKosong('sesi_id', 'sehingga baris ini tidak dimiliki sesi mana pun.'));
    }

    const id = rapikan(ambil('id'));
    if (id === '') {
      return tolak(
        keluhanKosong('id', 'sehingga nilai responden ini tidak bisa dicocokkan dengan siapa pun.'),
      );
    }

    const email = rapikanKecil(ambil('email'));
    if (email === '') {
      return tolak(keluhanKosong('email', 'padahal email adalah kunci identitas responden.'));
    }

    const kelengkapan = bacaKelengkapan(ambil('status_kelengkapan'));
    if (kelengkapan === null) {
      return tolak(
        keluhanTipe(
          'status_kelengkapan',
          ambil('status_kelengkapan'),
          'spec §6.1 hanya mengenal lengkap, kosong, dan kurang:N dengan N minimal 1',
        ),
      );
    }

    const nama = pangkas(ambil('nama'));
    return terima<BarisRespondenTetap>({
      sesiId,
      id,
      email,
      nama: nama === '' ? null : nama,
      kelengkapan,
      diimporPada: pangkas(ambil('diimpor_pada')),
    });
  });
}

export function bacaSkemaMentah(kisi: unknown[][]): HasilAdaptor<BarisSkemaMentah> {
  return bacaSheet(kisi, 'Skema', KOLOM_SKEMA, (ambil) => {
    const skemaId = rapikan(ambil('skema_id'));
    if (skemaId === '') {
      return tolak(keluhanKosong('skema_id', 'sehingga butir ini tidak dimiliki skema mana pun.'));
    }

    const kolomAsal = pangkas(ambil('kolom_asal'));
    if (kolomAsal === '') {
      return tolak(
        keluhanKosong('kolom_asal', 'sehingga butir ini tidak menunjuk kolom jawaban mana pun.'),
      );
    }

    const jenisAturan = rapikanKecil(ambil('aturan'));
    if (!adalahJenisAturan(jenisAturan)) {
      return tolak(
        keluhanTipe(
          'aturan',
          ambil('aturan'),
          'spec §7.1 hanya mengenal peta-opsi, kunci-jawaban, manual, dan abaikan',
        ),
      );
    }

    const mentah = pangkas(ambil('parameter'));
    let parameter: unknown = null;
    if (mentah !== '') {
      try {
        parameter = JSON.parse(mentah);
      } catch {
        return tolak(
          keluhanTipe(
            'parameter',
            ambil('parameter'),
            'kolom itu harus berupa JSON, misalnya {"strongly agree":5} atau {"min":0,"maks":100}',
          ),
        );
      }
    }

    const skorMaks = angkaSel(ambil('skor_maks'));
    if (skorMaks === BUKAN_ANGKA) {
      return tolak(keluhanTipe('skor_maks', ambil('skor_maks'), 'kolom itu harus berupa angka'));
    }

    const bobot = angkaSel(ambil('bobot'));
    if (bobot === null || bobot === BUKAN_ANGKA) {
      return tolak(
        keluhanTipe(
          'bobot',
          ambil('bobot'),
          'kolom itu harus berupa angka — mengisinya sendiri dengan 1 mengubah hasil perhitungan tanpa sepengetahuan admin',
        ),
      );
    }

    return terima<BarisSkemaMentah>({
      skemaId,
      kolomAsal,
      label: pangkas(ambil('label')),
      dimensi: pangkas(ambil('dimensi')),
      jenisAturan,
      parameter,
      skorMaks,
      bobot,
    });
  });
}

function bacaSheet<T>(
  kisi: unknown[][],
  namaSheet: string,
  kolomWajib: string[],
  bangun: (ambil: AmbilSel) => Terjemahan<T>,
): HasilAdaptor<T> {
  const kepala = bacaKepala(kisi, namaSheet, kolomWajib);
  if (kepala.masalah !== null) return { baris: [], masalah: [kepala.masalah] };

  const baris: T[] = [];
  const masalah: MasalahBaris[] = [];

  for (let i = 1; i < kisi.length; i += 1) {
    const isi = kisi[i];
    // Baris sisa di bawah tabel; Sheets tetap mengembalikannya sebagai sel ''.
    if (isi === undefined || barisKosong(isi)) continue;

    const ambil: AmbilSel = (nama) => {
      const kolom = kepala.peta.get(nama);
      return kolom === undefined ? '' : isi[kolom];
    };

    const hasil = bangun(ambil);
    if (hasil.ok) baris.push(hasil.baris);
    else masalah.push({ nomorBaris: i + 1, jenis: 'baris', pesan: hasil.pesan });
  }

  return { baris, masalah };
}

/**
 * Kolom dicari berdasarkan namanya, bukan posisinya: sheet yang kolomnya
 * ditukar admin tetap terbaca benar, dan dua kolom bernama sama ditolak karena
 * admin akan melihat satu kolom sementara adaptor membaca kolom lainnya.
 */
function bacaKepala(
  kisi: unknown[][],
  namaSheet: string,
  kolomWajib: string[],
): { peta: Map<string, number>; masalah: MasalahBaris | null } {
  const kosong = new Map<string, number>();
  const barisKepala = kisi[0];

  if (barisKepala === undefined || barisKosong(barisKepala)) {
    return {
      peta: kosong,
      masalah: masalahKepala(
        `Sheet ${namaSheet} masih kosong — baris nama kolomnya pun belum ada. ` +
          'Jalankan penyiapan ruang kerja lebih dulu, lalu buka lagi rekap ini.',
      ),
    };
  }

  const terlihat = new Map<string, { kolom: number; jumlah: number }>();
  for (let i = 0; i < barisKepala.length; i += 1) {
    const nama = rapikanKecil(barisKepala[i]);
    if (nama === '') continue;
    const sudah = terlihat.get(nama);
    if (sudah === undefined) terlihat.set(nama, { kolom: i, jumlah: 1 });
    else sudah.jumlah += 1;
  }

  const peta = new Map<string, number>();
  for (const nama of kolomWajib) {
    const ditemukan = terlihat.get(nama);
    if (ditemukan === undefined) {
      return {
        peta: kosong,
        masalah: masalahKepala(
          `Sheet ${namaSheet} tidak punya kolom "${nama}". Menebak kolomnya berarti nilai dibaca ` +
            'dari kolom yang keliru tanpa ada yang tahu, jadi tidak ada satu baris pun yang dibaca. ' +
            'Perbaiki baris pertama sheet itu lebih dulu.',
        ),
      };
    }
    if (ditemukan.jumlah > 1) {
      return {
        peta: kosong,
        masalah: masalahKepala(
          `Sheet ${namaSheet} punya ${ditemukan.jumlah} kolom bernama "${nama}". ` +
            'Admin akan melihat satu kolom sementara adaptor membaca kolom lainnya, jadi tidak ada ' +
            'satu baris pun yang dibaca. Beri nama berbeda pada salah satunya.',
        ),
      };
    }
    peta.set(nama, ditemukan.kolom);
  }

  return { peta, masalah: null };
}

function masalahKepala(pesan: string): MasalahBaris {
  return { nomorBaris: 1, jenis: 'kepala', pesan };
}

function terima<T>(baris: T): Terjemahan<T> {
  return { ok: true, baris };
}

function tolak<T>(pesan: string): Terjemahan<T> {
  return { ok: false, pesan };
}

function keluhanKosong(kolom: string, akibat: string): string {
  return (
    `Kolom "${kolom}" kosong, ${akibat} Baris ini tidak ikut dibaca sampai selnya diisi ` +
    'di Spreadsheet.'
  );
}

function keluhanTipe(kolom: string, sel: unknown, diharapkan: string): string {
  const isi = pangkas(sel);
  return (
    `Kolom "${kolom}" berisi ${isi === '' ? 'sel kosong' : `"${isi}"`}, padahal ${diharapkan}. ` +
    'Baris ini tidak ikut dibaca sampai selnya diperbaiki di Spreadsheet.'
  );
}

const BUKAN_ANGKA = Symbol('sel berisi sesuatu yang bukan angka');

// Sengaja lebih sempit daripada Number(): Sheets tidak memperlakukan "0x10",
// "Infinity", atau "1_000" sebagai angka, dan Number('') yang menghasilkan 0
// akan mengubah sel kosong menjadi nilai nol (aturan 2).
const POLA_ANGKA = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** `null` berarti selnya kosong — berbeda dari berisi angka nol. */
function angkaSel(sel: unknown): number | null | typeof BUKAN_ANGKA {
  if (typeof sel === 'number') return Number.isFinite(sel) ? sel : BUKAN_ANGKA;
  const teks = pangkas(sel);
  if (teks === '') return null;
  if (!POLA_ANGKA.test(teks)) return BUKAN_ANGKA;
  const angka = Number(teks);
  return Number.isFinite(angka) ? angka : BUKAN_ANGKA;
}

/** Sel bertanggal kembali sebagai Date; ISO adalah bentuk yang ditulis server. */
function teksSel(sel: unknown): string {
  if (sel === null || sel === undefined) return '';
  if (sel instanceof Date) return sel.toISOString();
  return String(sel);
}

function pangkas(sel: unknown): string {
  return teksSel(sel).trim();
}

function rapikanTeks(teks: string): string {
  return teks.trim().replace(/\s+/g, ' ');
}

function rapikan(sel: unknown): string {
  return rapikanTeks(teksSel(sel));
}

function rapikanKecil(sel: unknown): string {
  return normalisasiTeks(teksSel(sel));
}

function barisKosong(isi: unknown[]): boolean {
  return isi.every((sel) => pangkas(sel) === '');
}

/** Satu sel memuat beberapa nilai, dipisah seperti yang dilakukan server. */
function pecahDaftar(sel: unknown, rapikanSatu: (teks: string) => string): string[] {
  const hasil: string[] = [];
  for (const potongan of teksSel(sel).split(/[,;\n]/)) {
    const satu = rapikanSatu(potongan);
    if (satu !== '') hasil.push(satu);
  }
  return hasil;
}

function adalahMode(teks: string): teks is BarisSesi['mode'] {
  return teks === 'peringkat' || teks === 'indeks';
}

function adalahStatus(teks: string): teks is BarisSesi['status'] {
  return teks === 'draft' || teks === 'berjalan' || teks === 'final';
}

function adalahJenisAturan(teks: string): teks is Aturan['jenis'] {
  return (
    teks === 'peta-opsi' || teks === 'kunci-jawaban' || teks === 'manual' || teks === 'abaikan'
  );
}

const POLA_KURANG = /^kurang:([1-9]\d*)$/;

/** `null` berarti isinya di luar ketiga bentuk §6.1, bukan berarti lengkap. */
function bacaKelengkapan(sel: unknown): Kelengkapan | null {
  const teks = rapikanKecil(sel);
  if (teks === 'lengkap') return { status: 'lengkap' };
  if (teks === 'kosong') return { status: 'kosong' };

  const cocok = POLA_KURANG.exec(teks);
  const jumlah = cocok === null ? null : cocok[1];
  if (jumlah === undefined || jumlah === null) return null;
  return { status: 'kurang', jumlahKosong: Number(jumlah) };
}
