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
 * Ini kelalaian spec yang menunggu keputusan pengguna, bukan kelalaian di sini;
 * lihat koreksi C5 pada rencana store-dan-peran.
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

/**
 * Daftar izin, bukan daftar larangan.
 *
 * Spec §6.4 hanya mengenal tiga status dan hanya dua di antaranya boleh
 * ditulisi. Menolak `final` saja membuat "Selesai", "finalized", dan kolom
 * status yang kosong semuanya lolos sebagai sesi yang masih terbuka.
 */
var STATUS_BOLEH_DITULIS = ['draft', 'berjalan'];

/** Titik masuk tunggal untuk seluruh permintaan dari frontend. */
function doPost(e) {
  var permintaan = bacaPermintaan_(e);
  if (permintaan === null) {
    return balas_(
      tolakMuatan_(
        'Badan permintaan harus berupa JSON yang memuat medan "aksi" bertipe teks. ' +
          'Periksa apa yang dikirim frontend sebelum mengulang.',
      ),
    );
  }

  // Larik dan angka lolos rapikanTeks_ menjadi teks yang tampak masuk akal,
  // sehingga izin bisa diperiksa terhadap satu sesi lalu ditulis ke sesi lain.
  if (typeof permintaan.sesiId !== 'string') {
    return balas_(
      tolakMuatan_(
        'Medan "sesiId" harus berupa teks. Larik seperti ["S1"] dan angka seperti 1 ditolak ' +
          'supaya izin dan penulisan tidak pernah menunjuk sesi yang berbeda.',
      ),
    );
  }

  var sesi = cariSesi_(permintaan.sesiId);

  // Identitas diambil dari sesi Google, bukan dari permintaan (Batasan Global 15).
  var keputusan = putuskanIzin_(emailPemanggil_(), permintaan.aksi, sesi);
  if (keputusan.izin !== true) {
    return balas_({ ok: false, kode: keputusan.kode, pesan: keputusan.pesan });
  }

  // sesiId yang diteruskan adalah bentuk kanonik hasil cariSesi_, bukan teks
  // mentah pemanggil, supaya aksi menulis ke sesi yang barusan diizinkan.
  return balas_(
    jalankanAksi_({ aksi: permintaan.aksi, sesiId: sesi.sesiId, muatan: permintaan.muatan }),
  );
}

/**
 * Titik sambung untuk Tugas 3 dan seterusnya.
 *
 * Selama handler-nya belum ada, jawaban yang benar adalah GAGAL. Store membuang
 * perintah dari antrean begitu melihat `ok:true` (Batasan Global 18), jadi
 * sukses palsu di sini berarti penilaian hilang tanpa seorang pun tahu.
 */
function jalankanAksi_(perintah) {
  return {
    ok: false,
    kode: 'AKSI_BELUM_DIBANGUN',
    sesiId: perintah.sesiId,
    pesan:
      'Kebijakan izin meloloskan aksi "' +
      perintah.aksi +
      '" pada sesi "' +
      perintah.sesiId +
      '", tetapi backend belum punya penanganannya: tidak ada yang dibaca maupun ditulis. ' +
      'Jangan menandai perintah ini tersimpan; kirim ulang setelah backend diperbarui.',
  };
}

/**
 * Satu-satunya tempat tabel peran §9.1 diputuskan.
 *
 * Urutan pemeriksaannya disengaja, bukan mengikuti uji mana yang kebetulan
 * merah lebih dulu:
 *
 * 1. identitas kosong — supaya deployment anonim terlihat sebagai salah setel,
 *    bukan sebagai penolakan peran biasa (K5);
 * 2. sheet Sesi cacat — daftar peran dibaca dari sheet itu, jadi selama
 *    bentuknya tidak bisa dipercaya tidak ada satu pun jawaban yang bisa
 *    dipercaya, termasuk "orang ini bukan siapa-siapa";
 * 3. sesi ada — daftar perannya melekat pada baris sesi, jadi tanpa sesi tidak
 *    ada yang bisa ditimbang;
 * 4. orang dikenal — sebelum aksi, supaya orang luar tidak dapat menebak daftar
 *    aksi backend dengan membandingkan kode penolakan;
 * 5. peran cukup — sebelum status sesi, supaya penilai yang menyentuh skema
 *    diberi tahu alasan yang sebenarnya, bukan alasan yang kebetulan lebih dulu
 *    menghalangi;
 * 6. status sesi — hanya untuk aksi yang menulis; sesi final tetap terbaca.
 */
function putuskanIzin_(emailSesi, aksi, sesi) {
  var pemanggil = rapikanKecil_(emailSesi);
  if (pemanggil === '') {
    return tolak_(
      'TANPA_IDENTITAS',
      'Google tidak mengirimkan identitas pemanggil, jadi tidak ada yang bisa dicocokkan dengan ' +
        'daftar peran pada sheet Sesi. Akses anonim dan akun di luar domain yang diizinkan ' +
        'sama-sama menghasilkan email kosong, sehingga mode deployment tidak boleh ditebak dari ' +
        'pesan ini. Ikuti protokol keamanan proyek untuk menentukan dan membuktikan setelannya.',
    );
  }

  if (sesi.cacat !== '') {
    return tolak_(
      'SESI_CACAT',
      'Sheet Sesi tidak bisa dipercaya: ' +
        sesi.cacat +
        '. Selama bentuknya begini, daftar peran tidak punya arti, jadi permintaan ditolak ' +
        'alih-alih ditebak. Perbaiki sheet Sesi lebih dulu.',
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

  if (syarat.menulis === true) {
    if (sesi.status === 'final') {
      return tolak_(
        'SESI_FINAL',
        'Sesi "' +
          sesi.sesiId +
          '" sudah final, jadi tidak menerima penulisan apa pun — termasuk dari admin. ' +
          'Kembalikan statusnya ke "berjalan" lebih dulu bila memang masih perlu diubah.',
      );
    }
    if (!adaDalam_(STATUS_BOLEH_DITULIS, sesi.status)) {
      return tolak_(
        'SESI_CACAT',
        'Sesi "' +
          sesi.sesiId +
          '" berstatus ' +
          (sesi.status === '' ? 'kosong' : '"' + sesi.status + '"') +
          ', bukan salah satu dari draft, berjalan, atau final. Karena tidak ada cara tahu apakah ' +
          'sesi ini sudah ditutup, penulisan ditolak. Perbaiki kolom status pada sheet Sesi.',
      );
    }
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
 * Hasilnya selalu berupa objek bertanda `ada` dan `cacat`, bukan null, supaya
 * penolakan tetap bisa menyebut sesi mana yang diminta.
 *
 * Kolom wajib yang hilang, kolom kepala yang kembar, dan `sesi_id` yang muncul
 * pada lebih dari satu baris sama-sama menghasilkan `cacat`: ketiganya membuat
 * daftar peran tidak punya arti, dan menebak baris pertama berarti membuka
 * sesi final hanya karena ada baris kedua yang lebih tua.
 */
function cariSesi_(sesiId) {
  var kunci = rapikanTeks_(sesiId);
  var kosong = { ada: false, cacat: '', sesiId: kunci, status: '', penilai: [], admin: [] };
  if (kunci === '') return kosong;

  var berkas = SpreadsheetApp.getActive();
  var sheet =
    berkas === null || berkas === undefined ? null : berkas.getSheetByName(NAMA_SHEET_SESI);
  if (sheet === null || sheet === undefined) return kosong;

  var kisi = sheet.getDataRange().getValues();
  var kepala = kisi.length === 0 ? [] : kisi[0];
  var posisi = {};
  for (var k = 0; k < KOLOM_SESI_WAJIB.length; k += 1) {
    var nama = KOLOM_SESI_WAJIB[k];
    var ditemukan = semuaKolom_(kepala, nama);
    if (ditemukan.length === 0) {
      return cacatSesi_(kunci, 'kolom "' + nama + '" tidak ada');
    }
    if (ditemukan.length > 1) {
      return cacatSesi_(kunci, 'kolom "' + nama + '" muncul ' + ditemukan.length + ' kali');
    }
    posisi[nama] = ditemukan[0];
  }

  var ketemu = null;
  for (var b = 1; b < kisi.length; b += 1) {
    var baris = kisi[b];
    if (rapikanTeks_(baris[posisi['sesi_id']]) !== kunci) continue;
    if (ketemu !== null) {
      return cacatSesi_(kunci, 'sesi_id "' + kunci + '" muncul pada lebih dari satu baris');
    }
    ketemu = {
      ada: true,
      cacat: '',
      sesiId: kunci,
      status: rapikanKecil_(baris[posisi['status']]),
      penilai: daftarEmail_(baris[posisi['penilai']]),
      admin: daftarEmail_(baris[posisi['admin']]),
    };
  }
  return ketemu === null ? kosong : ketemu;
}

function cacatSesi_(sesiId, alasan) {
  return { ada: false, cacat: alasan, sesiId: sesiId, status: '', penilai: [], admin: [] };
}

/**
 * Mengembalikan seluruh posisi, bukan yang pertama: dua kolom bernama sama
 * berarti admin melihat satu kolom sementara backend membaca kolom lainnya.
 */
function semuaKolom_(kepala, nama) {
  var hasil = [];
  for (var i = 0; i < kepala.length; i += 1) {
    if (rapikanKecil_(kepala[i]) === nama) hasil.push(i);
  }
  return hasil;
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

function tolakMuatan_(pesan) {
  return { ok: false, kode: 'MUATAN_TIDAK_SAH', pesan: pesan };
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
