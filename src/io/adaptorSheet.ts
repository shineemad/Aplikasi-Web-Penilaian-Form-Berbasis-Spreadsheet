import type { Kelengkapan } from '../core/kelengkapan';
import { normalisasiTeks } from '../core/normalisasi';
import type { BarisPenilaian } from '../core/penilaian';
import { skorMaksAturan } from '../core/scorer';
import type { RespondenSesi } from '../core/sesi';
import type { Aturan, ButirSkema, PerlakuanKosong, Skema } from '../core/tipe';

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
 */
export interface MasalahBaris {
  /** Nomor baris di Spreadsheet, dihitung dari 1; baris kepala adalah baris 1. */
  nomorBaris: number;
  /**
   * `kepala` berarti seluruh sheet tidak terbaca; `baris` berarti barisnya
   * tidak ikut dibaca; `peringatan` berarti barisnya **tetap** dibaca tetapi
   * ada yang perlu diperiksa admin. Membedakan ketiganya penting karena
   * "dibuang" dan "dipakai tetapi mencurigakan" menuntut tindakan berbeda.
   */
  jenis: 'kepala' | 'baris' | 'peringatan';
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
 * Satu baris sheet `Responden` (§6.1). Sengaja memperluas `RespondenSesi`
 * alih-alih menyalin medannya: perluasan membuat typecheck menolak begitu core
 * mengubah bentuk responden, sedangkan salinan akan diam-diam menyimpang.
 *
 * Kolom `jawaban_*` dan `meta_*` dibaca dengan membuang awalannya dan memangkas
 * spasi tepi saja (koreksi D7), karena pembalikan itu fungsi identitas terhadap
 * cara importer menuliskannya — slug maupun nomor urut tidak bisa dibalik,
 * sehingga pencocokan kembali ke `kolom_asal` akan gagal tanpa jejak.
 */
export interface BarisResponden extends RespondenSesi {
  sesiId: string;
  kelengkapan: Kelengkapan;
  diimporPada: string;
}

/**
 * Baris sheet `Skema` yang tipe selnya sudah dibereskan tetapi `parameter`-nya
 * belum ditafsirkan menjadi `Aturan`. Bentuk antara ini tidak diekspor: hanya
 * `bacaSkema` yang boleh menyimpulkan sebuah `Skema`, karena kesimpulannya
 * menuntut seluruh baris milik satu `skema_id` dibaca sekaligus.
 */
interface BarisSkemaMentah {
  nomorBaris: number;
  skemaId: string;
  kolomAsal: string;
  label: string;
  dimensi: string;
  jenisAturan: Aturan['jenis'];
  /** Hasil `JSON.parse`; `null` bila selnya kosong. */
  parameter: unknown;
  skorMaks: number | null;
  bobot: number;
  /** Apa adanya dari sel, dinormalkan; `''` berarti admin belum memutuskan. */
  perlakuanKosong: string;
}

/** Baris `Skema` yang tidak terbaca tetapi masih diketahui milik skema mana. */
interface BarisSkemaCacat {
  nomorBaris: number;
  skemaId: string;
  pesan: string;
}

type SatuBarisSkema = { utuh: true; isi: BarisSkemaMentah } | { utuh: false; isi: BarisSkemaCacat };

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
  'perlakuan_kosong',
];

const AWALAN_JAWABAN = 'jawaban_';
const AWALAN_META = 'meta_';

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

export function bacaResponden(kisi: unknown[][]): HasilAdaptor<BarisResponden> {
  const dinamis = pindaiKolomDinamis(kisi[0]);
  if (dinamis.masalah !== null) return { baris: [], masalah: [dinamis.masalah] };

  return bacaSheet(kisi, 'Responden', KOLOM_RESPONDEN, (ambil, _nomorBaris, isi) => {
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
    return terima<BarisResponden>({
      sesiId,
      id,
      email,
      nama: nama === '' ? null : nama,
      kelengkapan,
      diimporPada: pangkas(ambil('diimpor_pada')),
      jawaban: petikKolomDinamis(dinamis.jawaban, isi),
      meta: petikKolomDinamis(dinamis.meta, isi),
    });
  });
}

/**
 * Satu `Skema` per `skema_id`, dalam urutan kemunculannya di sheet.
 *
 * Skema hanya dihasilkan bila **seluruh** barisnya terbaca dan `perlakuan_kosong`
 * seluruh barisnya sepakat. Menghasilkan skema yang sebagian butirnya hilang
 * berarti rata-rata terbobot dihitung atas separuh instrumen lalu dicetak
 * sebagai nilai responden — persis cacat yang rencana ini perbaiki.
 */
export function bacaSkema(kisi: unknown[][]): HasilAdaptor<Skema> {
  const mentah = bacaSkemaMentah(kisi);
  if (mentah.masalah.some((satu) => satu.jenis === 'kepala')) {
    return { baris: [], masalah: mentah.masalah };
  }

  const masalah = [...mentah.masalah];
  const perSkema = new Map<string, SatuBarisSkema[]>();
  for (const satu of mentah.baris) {
    const sudah = perSkema.get(satu.isi.skemaId);
    if (sudah === undefined) perSkema.set(satu.isi.skemaId, [satu]);
    else sudah.push(satu);
  }

  const baris: Skema[] = [];
  for (const [skemaId, kelompok] of perSkema) {
    let utuh = true;
    const butir: ButirSkema[] = [];
    const kolomTerlihat = new Map<string, number>();

    for (const satu of kelompok) {
      if (!satu.utuh) {
        masalah.push({ nomorBaris: satu.isi.nomorBaris, jenis: 'baris', pesan: satu.isi.pesan });
        utuh = false;
        continue;
      }

      const tafsir = tafsirkanAturan(satu.isi.jenisAturan, satu.isi.parameter);
      if (!tafsir.ok) {
        masalah.push({ nomorBaris: satu.isi.nomorBaris, jenis: 'baris', pesan: tafsir.pesan });
        utuh = false;
        continue;
      }

      const bentrok = kolomTerlihat.get(satu.isi.kolomAsal);
      if (bentrok === undefined) kolomTerlihat.set(satu.isi.kolomAsal, satu.isi.nomorBaris);
      else {
        masalah.push({
          nomorBaris: satu.isi.nomorBaris,
          jenis: 'peringatan',
          pesan:
            `Kolom asal "${satu.isi.kolomAsal}" sudah dipakai baris ${bentrok} pada skema ` +
            `"${skemaId}". Keduanya tetap dihitung, sehingga kolom itu menyumbang bobot dua kali ` +
            'tanpa pernah dipilih demikian. Hapus salah satunya di Spreadsheet.',
        });
      }

      const peringatanSkorMaks = bandingkanSkorMaks(satu.isi, tafsir.aturan);
      if (peringatanSkorMaks !== null) masalah.push(peringatanSkorMaks);

      butir.push({
        kolomAsal: satu.isi.kolomAsal,
        label: satu.isi.label,
        dimensi: satu.isi.dimensi,
        aturan: tafsir.aturan,
        bobot: satu.isi.bobot,
      });
    }

    const putusan = putuskanPerlakuanKosong(skemaId, kelompok);
    if (putusan !== null && !putusan.ok) {
      masalah.push(putusan.masalah);
      utuh = false;
    }

    if (utuh && putusan !== null && putusan.ok) {
      baris.push({ skemaId, butir, perlakuanKosong: putusan.nilai });
    }
  }

  return { baris, masalah };
}

function bacaSkemaMentah(kisi: unknown[][]): HasilAdaptor<SatuBarisSkema> {
  return bacaSheet(kisi, 'Skema', KOLOM_SKEMA, (ambil, nomorBaris) => {
    // Dibaca paling dulu: baris yang tidak diketahui miliknya skema mana tidak
    // bisa menjatuhkan skema mana pun, jadi ia hanya bisa dilaporkan sendirian.
    const skemaId = rapikan(ambil('skema_id'));
    if (skemaId === '') {
      return tolak(keluhanKosong('skema_id', 'sehingga butir ini tidak dimiliki skema mana pun.'));
    }

    const cacat = (pesan: string): Terjemahan<SatuBarisSkema> =>
      terima<SatuBarisSkema>({ utuh: false, isi: { nomorBaris, skemaId, pesan } });

    const kolomAsal = pangkas(ambil('kolom_asal'));
    if (kolomAsal === '') {
      return cacat(
        keluhanKosong('kolom_asal', 'sehingga butir ini tidak menunjuk kolom jawaban mana pun.'),
      );
    }

    const jenisAturan = rapikanKecil(ambil('aturan'));
    if (!adalahJenisAturan(jenisAturan)) {
      return cacat(
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
        return cacat(
          keluhanTipe(
            'parameter',
            ambil('parameter'),
            'kolom itu harus berupa JSON, misalnya {"peta":{"agree":4},"skorMaks":5} atau {"min":0,"maks":100}',
          ),
        );
      }
    }

    const skorMaks = angkaSel(ambil('skor_maks'));
    if (skorMaks === BUKAN_ANGKA) {
      return cacat(keluhanTipe('skor_maks', ambil('skor_maks'), 'kolom itu harus berupa angka'));
    }

    const bobot = angkaSel(ambil('bobot'));
    if (bobot === null || bobot === BUKAN_ANGKA) {
      return cacat(
        keluhanTipe(
          'bobot',
          ambil('bobot'),
          'kolom itu harus berupa angka — mengisinya sendiri dengan 1 mengubah hasil perhitungan tanpa sepengetahuan admin',
        ),
      );
    }

    return terima<SatuBarisSkema>({
      utuh: true,
      isi: {
        nomorBaris,
        skemaId,
        kolomAsal,
        label: pangkas(ambil('label')),
        dimensi: pangkas(ambil('dimensi')),
        jenisAturan,
        parameter,
        skorMaks,
        bobot,
        perlakuanKosong: rapikanKecil(ambil('perlakuan_kosong')),
      },
    });
  });
}

type Tafsir = { ok: true; aturan: Aturan } | { ok: false; pesan: string };

/**
 * `parameter` adalah satu-satunya sumber kebenaran bentuk aturan (koreksi D8).
 *
 * Tak satu pun cabang menebak: parameter yang kosong, cacat, bukan objek, atau
 * berbentuk milik aturan lain selalu dilaporkan. Menebak di sini menghasilkan
 * skema yang tampak lengkap padahal sebagian butirnya dinilai dengan aturan
 * yang tidak pernah dipilih siapa pun.
 */
function tafsirkanAturan(jenis: Aturan['jenis'], parameter: unknown): Tafsir {
  // `abaikan` tidak punya parameter sama sekali (§7.1), sehingga sisa isi sel
  // tidak dapat mengubah satu angka pun. Menolak barisnya justru akan membuang
  // butirnya dari skema, dan itu yang benar-benar menggeser hasil.
  if (jenis === 'abaikan') return { ok: true, aturan: { jenis: 'abaikan' } };

  const isi = objekJson(parameter);
  if (isi === null) {
    return gagalParameter(jenis, 'isinya bukan objek JSON');
  }

  if (jenis === 'peta-opsi') {
    const peta = objekJson(isi['peta']);
    if (peta === null) return gagalParameter(jenis, 'medan "peta" tidak ada atau bukan objek');

    const pasangan: [string, number][] = [];
    for (const [opsi, skor] of Object.entries(peta)) {
      // Nol dan negatif sengaja diterima: skala yang memberi nilai negatif pada
      // jawaban menyesatkan adalah rancangan yang sah, bukan kekeliruan.
      if (typeof skor !== 'number' || !Number.isFinite(skor)) {
        return gagalParameter(jenis, `opsi "${opsi}" tidak bernilai angka`);
      }
      pasangan.push([opsi, skor]);
    }
    if (pasangan.length === 0) {
      return gagalParameter(jenis, 'petanya tidak memuat satu opsi pun');
    }

    const skorMaks = isi['skorMaks'];
    if (typeof skorMaks !== 'number' || !Number.isFinite(skorMaks)) {
      return gagalParameter(jenis, 'medan "skorMaks" tidak ada atau bukan angka');
    }

    return {
      ok: true,
      aturan: { jenis: 'peta-opsi', peta: Object.fromEntries(pasangan), skorMaks },
    };
  }

  if (jenis === 'kunci-jawaban') {
    const benar = isi['benar'];
    if (typeof benar !== 'string' || normalisasiTeks(benar) === '') {
      return gagalParameter(jenis, 'medan "benar" tidak ada, bukan teks, atau kosong');
    }
    return { ok: true, aturan: { jenis: 'kunci-jawaban', kunci: benar } };
  }

  const min = isi['min'];
  const maks = isi['maks'];
  if (typeof min !== 'number' || !Number.isFinite(min)) {
    return gagalParameter(jenis, 'medan "min" tidak ada atau bukan angka');
  }
  if (typeof maks !== 'number' || !Number.isFinite(maks)) {
    return gagalParameter(jenis, 'medan "maks" tidak ada atau bukan angka');
  }
  if (min > maks) {
    return gagalParameter(jenis, `min ${min} lebih besar daripada maks ${maks}`);
  }
  return { ok: true, aturan: { jenis: 'manual', min, maks } };
}

const CONTOH_PARAMETER: Record<Exclude<Aturan['jenis'], 'abaikan'>, string> = {
  'peta-opsi': '{"peta":{"tidak setuju":2,"setuju":4},"skorMaks":5}',
  'kunci-jawaban': '{"benar":"B"}',
  manual: '{"min":0,"maks":100}',
};

function gagalParameter(jenis: Aturan['jenis'], sebab: string): Tafsir {
  const contoh = jenis === 'abaikan' ? '' : CONTOH_PARAMETER[jenis];
  return {
    ok: false,
    pesan:
      `Kolom "parameter" tidak dapat dibaca sebagai aturan ${jenis}: ${sebab}. ` +
      `Bentuk yang diharapkan: ${contoh}. Seluruh skema ini tidak ikut dihitung sampai selnya ` +
      'diperbaiki, karena menghitung tanpa butir ini berarti merata-ratakan separuh instrumen.',
  };
}

/**
 * `skor_maks` hanya bacaan manusia; `parameter` yang berwenang (koreksi D8).
 * Barisnya tetap dipakai — yang berbahaya bukan angkanya, melainkan keyakinan
 * pembaca pada angka yang tidak dipakai menghitung apa pun.
 */
function bandingkanSkorMaks(isi: BarisSkemaMentah, aturan: Aturan): MasalahBaris | null {
  // Sel kosong bukan nilai yang berselisih, melainkan nilai yang belum ditulis.
  if (isi.skorMaks === null) return null;

  const turunan = skorMaksAturan(aturan);
  if (turunan === isi.skorMaks) return null;

  const penjelasan =
    turunan === null
      ? `aturan ${isi.jenisAturan} tidak punya skor maksimum sama sekali`
      : `parameter-nya berarti ${turunan}`;
  return {
    nomorBaris: isi.nomorBaris,
    jenis: 'peringatan',
    pesan:
      `Kolom "skor_maks" berisi ${isi.skorMaks} untuk "${isi.kolomAsal}", padahal ${penjelasan}. ` +
      'Perhitungan memakai parameter, jadi angkanya tidak salah — tetapi siapa pun yang membaca ' +
      'sheet akan yakin pada angka yang tidak dipakai. Samakan keduanya di Spreadsheet.',
  };
}

type PutusanKosong = { ok: true; nilai: PerlakuanKosong } | { ok: false; masalah: MasalahBaris };

const PERLAKUAN_SAH: PerlakuanKosong[] = ['abaikan', 'nol'];

/**
 * `perlakuan_kosong` terulang di setiap baris milik satu `skema_id`, sehingga
 * dua baris bisa berselisih (koreksi D6). Mengambil baris pertama berarti
 * separuh skema dinilai dengan aturan yang tidak pernah dipilih siapa pun.
 *
 * `null` berarti kelompok ini tidak punya satu baris pun yang terbaca, sehingga
 * tidak ada yang bisa diperselisihkan dan melaporkannya hanya menggandakan
 * keluhan yang sudah dicatat per baris.
 */
function putuskanPerlakuanKosong(
  skemaId: string,
  kelompok: SatuBarisSkema[],
): PutusanKosong | null {
  let pertama: BarisSkemaMentah | undefined;

  for (const satu of kelompok) {
    if (!satu.utuh) continue;
    if (pertama === undefined) {
      pertama = satu.isi;
      continue;
    }
    if (satu.isi.perlakuanKosong === pertama.perlakuanKosong) continue;

    return {
      ok: false,
      masalah: {
        nomorBaris: satu.isi.nomorBaris,
        jenis: 'baris',
        pesan:
          `Kolom "perlakuan_kosong" skema "${skemaId}" berselisih: baris ${pertama.nomorBaris} ` +
          `berisi ${sebutIsi(pertama.perlakuanKosong)} sementara baris ${satu.isi.nomorBaris} ` +
          `berisi ${sebutIsi(satu.isi.perlakuanKosong)}. Nilainya wajib sama di seluruh baris satu ` +
          'skema; memilih salah satunya di sini berarti separuh butir dinilai dengan aturan yang ' +
          'tidak pernah dipilih. Samakan keduanya di Spreadsheet.',
      },
    };
  }

  if (pertama === undefined) return null;

  if (pertama.perlakuanKosong === '') {
    return {
      ok: false,
      masalah: {
        nomorBaris: pertama.nomorBaris,
        jenis: 'baris',
        pesan:
          `Kolom "perlakuan_kosong" skema "${skemaId}" masih kosong. Jawaban kosong boleh ` +
          'dikeluarkan dari rata-rata ("abaikan") atau dihitung sebagai nol ("nol"); keduanya sah ' +
          'dan menghasilkan angka yang berbeda, sehingga §7.2 butir 3 menuntut admin memilihnya. ' +
          'Skema ini tidak dipakai menghitung sampai pilihannya ditulis.',
      },
    };
  }

  if (!adalahPerlakuanKosong(pertama.perlakuanKosong)) {
    return {
      ok: false,
      masalah: {
        nomorBaris: pertama.nomorBaris,
        jenis: 'baris',
        pesan:
          `Kolom "perlakuan_kosong" skema "${skemaId}" berisi ` +
          `${sebutIsi(pertama.perlakuanKosong)}, padahal hanya "abaikan" dan "nol" yang dikenal. ` +
          'Skema ini tidak dipakai menghitung sampai selnya diperbaiki di Spreadsheet.',
      },
    };
  }

  return { ok: true, nilai: pertama.perlakuanKosong };
}

function adalahPerlakuanKosong(teks: string): teks is PerlakuanKosong {
  return PERLAKUAN_SAH.some((sah) => sah === teks);
}

function sebutIsi(teks: string): string {
  return teks === '' ? 'sel kosong' : `"${teks}"`;
}

/**
 * Kolom `jawaban_*` dan `meta_*` dipetakan dari kepala, bukan dari `Skema`:
 * kolom yang tidak dikenal skema mana pun tetap harus terbaca agar `periksaSkema`
 * dapat melihat bahwa kolomnya memang ada.
 */
function pindaiKolomDinamis(barisKepala: unknown[] | undefined): {
  jawaban: Map<string, number>;
  meta: Map<string, number>;
  masalah: MasalahBaris | null;
} {
  const jawaban = new Map<string, number>();
  const meta = new Map<string, number>();
  // Sheet kosong dibiarkan untuk `bacaKepala`, yang pesannya sudah mengajari.
  if (barisKepala === undefined) return { jawaban, meta, masalah: null };

  for (let i = 0; i < barisKepala.length; i += 1) {
    const asli = pangkas(barisKepala[i]);
    const kecil = asli.toLowerCase();

    let peta: Map<string, number>;
    let awalan: string;
    if (kecil.startsWith(AWALAN_JAWABAN)) {
      peta = jawaban;
      awalan = AWALAN_JAWABAN;
    } else if (kecil.startsWith(AWALAN_META)) {
      peta = meta;
      awalan = AWALAN_META;
    } else continue;

    const nama = asli.slice(awalan.length).trim();
    if (nama === '') {
      return {
        jawaban,
        meta,
        masalah: masalahKepala(
          `Sheet Responden punya kolom "${asli}" yang tidak menyebut nama pertanyaannya. ` +
            'Isinya tidak akan pernah cocok dengan satu pun `kolom_asal` di Skema, sehingga ' +
            'jawabannya hilang dari perhitungan tanpa jejak. Tidak ada satu baris pun yang ' +
            'dibaca sampai kepala kolom itu dilengkapi.',
        ),
      };
    }

    const bentrok = peta.get(nama);
    if (bentrok !== undefined) {
      return {
        jawaban,
        meta,
        masalah: masalahKepala(
          `Sheet Responden punya dua kolom "${awalan}${nama}" — kolom ke-${bentrok + 1} dan ` +
            `kolom ke-${i + 1}. Salah satunya akan menimpa yang lain tanpa ada yang tahu jawaban ` +
            'mana yang terbaca, jadi tidak ada satu baris pun yang dibaca. Beri nama berbeda ' +
            'pada salah satunya.',
        ),
      };
    }

    peta.set(nama, i);
  }

  return { jawaban, meta, masalah: null };
}

/**
 * Sel kosong tetap masuk sebagai `''`, tidak dihilangkan: kolom yang seluruh
 * barisnya kosong akan terbaca "tidak ada" oleh `periksaSkema` bila dibuang,
 * dan admin lalu diminta memperbaiki kolom yang sebenarnya ada.
 */
function petikKolomDinamis(peta: Map<string, number>, isi: unknown[]): Record<string, string> {
  const pasangan: [string, string][] = [];
  for (const [nama, kolom] of peta) pasangan.push([nama, teksSel(isi[kolom])]);
  return Object.fromEntries(pasangan);
}

function objekJson(nilai: unknown): Record<string, unknown> | null {
  if (typeof nilai !== 'object' || nilai === null || Array.isArray(nilai)) return null;
  return nilai as Record<string, unknown>;
}

function bacaSheet<T>(
  kisi: unknown[][],
  namaSheet: string,
  kolomWajib: string[],
  bangun: (ambil: AmbilSel, nomorBaris: number, isi: unknown[]) => Terjemahan<T>,
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

    const hasil = bangun(ambil, i + 1, isi);
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
