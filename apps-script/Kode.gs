/**
 * Backend FormScoring Engine — berkas yang benar-benar di-deploy ke Apps Script.
 *
 * Apps Script memuat berkas ini sebagai skrip global, jadi DILARANG memakai
 * sintaks modul. Uji memuat berkas yang sama persis (Batasan Global 20) dan
 * memeriksanya sebagai teks, supaya sebabnya tersebut: impor statis hanya
 * menghasilkan SyntaxError yang tidak menyinggung Apps Script, sedangkan impor
 * dinamis justru lulus di sandbox lalu gagal di Google.
 *
 * Kebijakan izin hidup di sini dan hanya di sini (K1). Frontend tidak perlu
 * tahu isinya; ia cukup mengirim permintaan dan menangani penolakan.
 *
 * Akhiran garis bawah menandai fungsi yang tidak dipanggil dari luar berkas ini.
 */

/**
 * Tabel peran spec §9.1, diterjemahkan menjadi syarat per aksi.
 *
 * `pengamat` belum muncul di sini karena sheet `Sesi` (spec §6.4) hanya punya
 * kolom `penilai` dan `admin` — peran itu belum punya tempat penyimpanan.
 */
var SYARAT_AKSI = {
  bacaRekap: { peran: ['admin', 'penilai'], menulis: false },
  simpanPenilaian: { peran: ['admin', 'penilai'], menulis: true },
  ubahSkema: { peran: ['admin'], menulis: true },
  ubahBobot: { peran: ['admin'], menulis: true },
};

var NAMA_SHEET_SESI = 'Sesi';

/** Tanpa keempatnya, kebijakan izin tidak punya dasar untuk memutuskan apa pun. */
var KOLOM_SESI_WAJIB = ['sesi_id', 'status', 'penilai', 'admin'];

/** Titik masuk tunggal untuk seluruh permintaan dari frontend. */
function doPost(e) {
  var permintaan = bacaPermintaan_(e);
  if (permintaan === null) {
    return balas_({
      ok: false,
      kode: 'MUATAN_TIDAK_SAH',
      pesan:
        'Badan permintaan harus berupa JSON yang memuat medan "aksi" bertipe teks. ' +
        'Periksa apa yang dikirim frontend sebelum mengulang.',
    });
  }

  // Identitas diambil dari sesi Google, bukan dari permintaan (Batasan Global 15).
  var keputusan = putuskanIzin_(emailPemanggil_(), permintaan.aksi, cariSesi_(permintaan.sesiId));
  if (keputusan.izin !== true) {
    return balas_({ ok: false, kode: keputusan.kode, pesan: keputusan.pesan });
  }

  return balas_({
    ok: true,
    kode: 'IZIN_DIBERIKAN',
    pesan:
      'Izin diberikan, tetapi aksi "' +
      permintaan.aksi +
      '" belum dibangun: tidak ada yang dibaca maupun ditulis.',
  });
}

/**
 * Satu-satunya tempat tabel peran §9.1 diputuskan.
 *
 * Urutan pemeriksaannya disengaja, bukan mengikuti uji mana yang kebetulan
 * merah lebih dulu:
 *
 * 1. identitas kosong — supaya deployment anonim terlihat sebagai salah setel,
 *    bukan sebagai penolakan peran biasa (K5);
 * 2. sesi ada — daftar perannya melekat pada baris sesi, jadi tanpa sesi tidak
 *    ada yang bisa ditimbang;
 * 3. orang dikenal — sebelum aksi, supaya orang luar tidak dapat menebak daftar
 *    aksi backend dengan membandingkan kode penolakan;
 * 4. peran cukup — sebelum status sesi, supaya penilai yang menyentuh skema
 *    diberi tahu alasan yang sebenarnya, bukan alasan yang kebetulan lebih dulu
 *    menghalangi;
 * 5. status sesi — hanya untuk aksi yang menulis; sesi final tetap terbaca.
 */
function putuskanIzin_(emailSesi, aksi, sesi) {
  var pemanggil = rapikanKecil_(emailSesi);
  if (pemanggil === '') {
    return tolak_(
      'TANPA_IDENTITAS',
      'Google tidak mengirimkan identitas pemanggil. Web App ini harus dideploy dengan ' +
        '"Jalankan sebagai: Pengguna yang mengakses" dan akses "Siapa saja dengan Akun Google". ' +
        'Akses anonim membuat identitas kosong dan seluruh pemeriksaan peran runtuh.',
    );
  }

  if (sesi.ada !== true) {
    return tolak_(
      'SESI_TIDAK_ADA',
      'Sesi "' +
        sesi.sesiId +
        '" tidak ditemukan. Periksa sesiId yang dikirim, dan pastikan sheet Sesi ada beserta ' +
        'kolom sesi_id, status, penilai, dan admin.',
    );
  }

  var peran = peranDalamSesi_(pemanggil, sesi);
  if (peran.length === 0) {
    return tolak_(
      'ORANG_TIDAK_DIKENAL',
      'Email ' +
        pemanggil +
        ' tidak terdaftar sebagai admin maupun penilai pada sesi "' +
        sesi.sesiId +
        '". Pastikan Anda masuk dengan akun yang benar, lalu minta admin sesi menambahkan email ini.',
    );
  }

  if (!punyaSyarat_(aksi)) {
    return tolak_(
      'AKSI_TIDAK_DIKENAL',
      'Aksi "' +
        aksi +
        '" tidak dikenal backend. Periksa ejaannya, atau perbarui backend bila aksi ini memang baru.',
    );
  }
  var syarat = SYARAT_AKSI[aksi];

  if (!cukupPeran_(peran, syarat.peran)) {
    return tolak_(
      'BUKAN_ADMIN',
      'Aksi "' +
        aksi +
        '" hanya boleh dilakukan ' +
        gabungPeran_(syarat.peran) +
        ' sesi. Email ' +
        pemanggil +
        ' terdaftar sebagai ' +
        gabungPeran_(peran) +
        ', yang tidak mencakup aksi ini. Mintalah admin sesi yang melakukannya.',
    );
  }

  if (syarat.menulis === true && sesi.status === 'final') {
    return tolak_(
      'SESI_FINAL',
      'Sesi "' +
        sesi.sesiId +
        '" sudah final, jadi tidak menerima penulisan apa pun — termasuk dari admin. ' +
        'Kembalikan statusnya ke "berjalan" lebih dulu bila memang masih perlu diubah.',
    );
  }

  return { izin: true };
}

/** Satu-satunya sumber identitas (spec §9.2). Muatan permintaan tidak pernah dilihat. */
function emailPemanggil_() {
  var pengguna = Session.getActiveUser();
  if (pengguna === null || pengguna === undefined) return '';
  return pengguna.getEmail();
}

/**
 * Hasilnya selalu berupa objek bertanda `ada`, bukan null, supaya penolakan
 * tetap bisa menyebut sesi mana yang diminta.
 *
 * Sheet Sesi yang hilang dan kolom wajib yang kurang sama-sama menghasilkan
 * `ada: false`: kolom peran yang hilang tidak boleh berarti "tidak ada yang
 * dilarang".
 */
function cariSesi_(sesiId) {
  var kunci = rapikanTeks_(sesiId);
  var kosong = { ada: false, sesiId: kunci, status: '', penilai: [], admin: [] };
  if (kunci === '') return kosong;

  var berkas = SpreadsheetApp.getActive();
  var sheet =
    berkas === null || berkas === undefined ? null : berkas.getSheetByName(NAMA_SHEET_SESI);
  if (sheet === null || sheet === undefined) return kosong;

  var kisi = sheet.getDataRange().getValues();
  var kepala = kisi.length === 0 ? [] : kisi[0];
  var posisi = {};
  for (var k = 0; k < KOLOM_SESI_WAJIB.length; k += 1) {
    var kolom = cariKolom_(kepala, KOLOM_SESI_WAJIB[k]);
    if (kolom < 0) return kosong;
    posisi[KOLOM_SESI_WAJIB[k]] = kolom;
  }

  for (var b = 1; b < kisi.length; b += 1) {
    var baris = kisi[b];
    if (rapikanTeks_(baris[posisi['sesi_id']]) !== kunci) continue;
    return {
      ada: true,
      sesiId: kunci,
      status: rapikanKecil_(baris[posisi['status']]),
      penilai: daftarEmail_(baris[posisi['penilai']]),
      admin: daftarEmail_(baris[posisi['admin']]),
    };
  }
  return kosong;
}

function cariKolom_(kepala, nama) {
  for (var i = 0; i < kepala.length; i += 1) {
    if (rapikanKecil_(kepala[i]) === nama) return i;
  }
  return -1;
}

function peranDalamSesi_(email, sesi) {
  var peran = [];
  if (adaDalam_(sesi.admin, email)) peran.push('admin');
  if (adaDalam_(sesi.penilai, email)) peran.push('penilai');
  return peran;
}

function adaDalam_(daftar, nilai) {
  for (var i = 0; i < daftar.length; i += 1) {
    if (daftar[i] === nilai) return true;
  }
  return false;
}

function cukupPeran_(dipunyai, diizinkan) {
  for (var i = 0; i < dipunyai.length; i += 1) {
    if (adaDalam_(diizinkan, dipunyai[i])) return true;
  }
  return false;
}

function gabungPeran_(peran) {
  return peran.join(' atau ');
}

/**
 * Nama aksi datang dari luar, jadi pencarian langsung pada objek akan menemukan
 * anggota warisan Object.prototype seperti "constructor" dan memperlakukannya
 * sebagai aksi yang sah.
 */
function punyaSyarat_(aksi) {
  return Object.prototype.hasOwnProperty.call(SYARAT_AKSI, aksi);
}

/** Satu sel sheet Sesi memuat beberapa email (spec §6.4). */
function daftarEmail_(sel) {
  if (sel === null || sel === undefined) return [];
  var potongan = String(sel).split(/[,;\n]/);
  var hasil = [];
  for (var i = 0; i < potongan.length; i += 1) {
    var satu = rapikanKecil_(potongan[i]);
    if (satu !== '') hasil.push(satu);
  }
  return hasil;
}

/**
 * Aturan 4 repo: buang spasi tepi, rapatkan spasi ganda, huruf kecil. Dipakai
 * untuk email, status, dan nama kolom — ketiganya dicocokkan tanpa memedulikan
 * huruf besar-kecil.
 */
function rapikanKecil_(nilai) {
  return rapikanTeks_(nilai).toLowerCase();
}

function rapikanTeks_(nilai) {
  if (nilai === null || nilai === undefined) return '';
  return String(nilai).trim().replace(/\s+/g, ' ');
}

function tolak_(kode, pesan) {
  return { izin: false, kode: kode, pesan: pesan };
}

function bacaPermintaan_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') return null;
  var muatan;
  try {
    muatan = JSON.parse(e.postData.contents);
  } catch (galat) {
    return null;
  }
  if (!muatan || typeof muatan.aksi !== 'string' || muatan.aksi === '') return null;
  return muatan;
}

function balas_(isi) {
  return ContentService.createTextOutput(JSON.stringify(isi)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
