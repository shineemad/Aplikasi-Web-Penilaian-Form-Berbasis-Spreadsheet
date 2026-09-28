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
var NAMA_SHEET_PENILAIAN = 'Penilaian';

/** Tanpa keempatnya, kebijakan izin tidak punya dasar untuk memutuskan apa pun. */
var KOLOM_SESI_WAJIB = ['sesi_id', 'status', 'penilai', 'admin'];

/**
 * Spec §6.3. Urutannya di sini tidak menentukan apa pun: baris ditulis dengan
 * menempatkan tiap nilai pada kolom yang kepalanya bernama sama, karena menulis
 * larik berurutan ke sheet yang kolomnya ditukar tetap berhasil — angkanya
 * hanya mendarat di kolom yang keliru, dan tidak ada yang akan menyadarinya.
 */
var KOLOM_PENILAIAN_WAJIB = [
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
 * Menunggu tanpa batas membekukan penilai lain sampai Apps Script sendiri
 * menyerah; lebih baik menolak dengan pesan yang menyuruh mencoba lagi.
 */
var BATAS_KUNCI_MS = 10000;

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
  var pemanggil = emailPemanggil_();
  var keputusan = putuskanIzin_(pemanggil, permintaan.aksi, sesi);
  if (keputusan.izin !== true) {
    return balas_({ ok: false, kode: keputusan.kode, pesan: keputusan.pesan });
  }

  // sesiId yang diteruskan adalah bentuk kanonik hasil cariSesi_, bukan teks
  // mentah pemanggil, supaya aksi menulis ke sesi yang barusan diizinkan.
  // `oleh` dirapikan dengan cara yang sama dengan daftar peran pada sheet Sesi;
  // jejak audit yang menyimpan " PENILAI@Kampus.id " tidak akan pernah cocok
  // dengan daftar itu saat direkap kembali.
  return balas_(
    jalankanAksi_({
      aksi: permintaan.aksi,
      sesiId: sesi.sesiId,
      oleh: rapikanKecil_(pemanggil),
      muatan: permintaan.muatan,
    }),
  );
}

/**
 * Titik sambung untuk aksi yang belum dibangun.
 *
 * Selama handler-nya belum ada, jawaban yang benar adalah GAGAL. Store membuang
 * perintah dari antrean begitu melihat `ok:true` (Batasan Global 18), jadi
 * sukses palsu di sini berarti penilaian hilang tanpa seorang pun tahu.
 */
function jalankanAksi_(perintah) {
  if (perintah.aksi === 'simpanPenilaian') return simpanPenilaian_(perintah);

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
 * Satu-satunya jalur tulis ke sheet `Penilaian` (Batasan Global 17: append-only).
 *
 * Kunci diambil lebih dulu dan dilepas di `finally`, termasuk saat penulisan
 * melempar: kunci yang tergantung membekukan seluruh sistem sampai batas
 * waktunya habis, dan jalur gagal justru yang paling sering melupakannya
 * (Batasan Global 19). Kegagalan mengambil kunci menghasilkan penolakan, bukan
 * penulisan di luar kunci — dua penilai yang menulis bersamaan tanpa kunci akan
 * memperoleh `penilaian_id` yang sama dan salah satunya menghilang.
 */
function simpanPenilaian_(perintah) {
  var isi = bacaMuatanPenilaian_(perintah.muatan);
  if (isi.sah !== true) return tolakMuatan_(isi.pesan);

  var kunci = LockService.getScriptLock();
  try {
    kunci.waitLock(BATAS_KUNCI_MS);
  } catch (galat) {
    return {
      ok: false,
      kode: 'SEDANG_SIBUK',
      sesiId: perintah.sesiId,
      pesan:
        'Penilai lain sedang menulis ke sesi "' +
        perintah.sesiId +
        '" dan gilirannya belum selesai, jadi tidak ada yang disimpan. Coba lagi sebentar; ' +
        'jangan tandai penilaian ini tersimpan.',
    };
  }

  try {
    return tulisPenilaian_(perintah, isi);
  } catch (galat) {
    // Error yang lolos dari doPost membuat Apps Script mengirim halaman HTML
    // yang tidak bisa dibaca klien, sehingga kegagalannya menjadi kegagalan diam.
    return {
      ok: false,
      kode: 'GAGAL_MENULIS',
      sesiId: perintah.sesiId,
      pesan:
        'Baris penilaian gagal ditulis ke sheet Penilaian: ' +
        String(galat) +
        '. Tidak ada yang tersimpan, jadi kirim ulang setelah sebabnya diperbaiki.',
    };
  } finally {
    kunci.releaseLock();
  }
}

/** Dipanggil hanya dari dalam kunci; memanggilnya dari tempat lain memutus C2. */
function tulisPenilaian_(perintah, isi) {
  var berkas = SpreadsheetApp.getActive();
  var sheet =
    berkas === null || berkas === undefined ? null : berkas.getSheetByName(NAMA_SHEET_PENILAIAN);
  if (sheet === null || sheet === undefined) {
    return {
      ok: false,
      kode: 'PENILAIAN_TIDAK_ADA',
      sesiId: perintah.sesiId,
      pesan:
        'Sheet Penilaian tidak ada pada Spreadsheet Ruang Kerja, jadi tidak ada tempat menyimpan ' +
        'nilai. Jalankan penyiapan ruang kerja lebih dulu, lalu kirim ulang penilaian ini.',
    };
  }

  var kisi = sheet.getDataRange().getValues();
  var kepala = kisi.length === 0 ? [] : kisi[0];
  var posisi = {};
  for (var k = 0; k < KOLOM_PENILAIAN_WAJIB.length; k += 1) {
    var nama = KOLOM_PENILAIAN_WAJIB[k];
    var ditemukan = semuaKolom_(kepala, nama);
    if (ditemukan.length !== 1) {
      return {
        ok: false,
        kode: 'PENILAIAN_CACAT',
        sesiId: perintah.sesiId,
        pesan:
          'Sheet Penilaian tidak bisa ditulisi: kolom "' +
          nama +
          '" ' +
          (ditemukan.length === 0 ? 'tidak ada' : 'muncul ' + ditemukan.length + ' kali') +
          '. Menebak kolomnya berarti nilai mendarat di kolom yang keliru tanpa ada yang tahu, ' +
          'jadi tidak ada yang ditulis. Perbaiki kepala kolom sheet Penilaian lebih dulu.',
      };
    }
    posisi[nama] = ditemukan[0];
  }

  var nomor = nomorPenilaianBerikutnya_(kisi, posisi['penilaian_id']);
  var pada = new Date().toISOString();

  var baris = [];
  for (var i = 0; i < kepala.length; i += 1) baris.push('');
  baris[posisi['penilaian_id']] = nomor;
  baris[posisi['sesi_id']] = perintah.sesiId;
  baris[posisi['responden_id']] = isi.respondenId;
  baris[posisi['kriteria']] = isi.kriteria;
  baris[posisi['nilai']] = isi.nilai;
  baris[posisi['catatan']] = isi.catatan;
  baris[posisi['oleh']] = perintah.oleh;
  baris[posisi['pada']] = pada;
  sheet.appendRow(baris);

  return {
    ok: true,
    kode: 'TERSIMPAN',
    sesiId: perintah.sesiId,
    penilaianId: nomor,
    oleh: perintah.oleh,
    pada: pada,
    pesan:
      'Penilaian tersimpan sebagai baris baru bernomor ' +
      nomor +
      ' pada sheet Penilaian; baris sebelumnya tidak diubah.',
  };
}

/**
 * Nomor urut diberikan server di dalam kunci (koreksi C2).
 *
 * Cap waktu tidak dipakai: dua penilai yang menulis dalam detik yang sama
 * menghasilkan cap identik, sehingga "baris terakhir yang berlaku" menjadi
 * bergantung pada urutan pembacaan. Jumlah baris juga tidak dipakai, karena
 * sheet yang pernah disunting tangan bisa menghasilkan nomor yang sudah ada.
 */
function nomorPenilaianBerikutnya_(kisi, kolom) {
  var terbesar = 0;
  for (var b = 1; b < kisi.length; b += 1) {
    var sel = kisi[b][kolom];
    var angka = typeof sel === 'number' ? sel : Number(rapikanTeks_(sel));
    if (isFinite(angka) && angka > terbesar) terbesar = angka;
  }
  return Math.floor(terbesar) + 1;
}

/**
 * Muatan datang dari luar, jadi bentuknya diperiksa sebelum apa pun ditulis.
 *
 * `nilai` sengaja hanya menerima angka. Sheets memaksa "80" menjadi 80 dan ""
 * menjadi sel kosong, sehingga teks yang lolos di sini akan tampak wajar di
 * layar — termasuk angka yang tidak pernah diketik penilai, tercatat atas
 * namanya. Baris tanpa nilai maupun catatan juga ditolak: ia hanya menambah
 * riwayat tanpa mengubah apa pun, sementara balasan sukses membuat penilai
 * mengira pekerjaannya tersimpan.
 */
function bacaMuatanPenilaian_(muatan) {
  if (muatan === null || typeof muatan !== 'object') {
    return {
      sah: false,
      pesan:
        'Medan "muatan" harus berupa objek yang memuat respondenId, kriteria, dan salah satu dari ' +
        'nilai atau catatan.',
    };
  }

  var respondenId = rapikanTeks_(muatan.respondenId);
  if (typeof muatan.respondenId !== 'string' || respondenId === '') {
    return {
      sah: false,
      pesan:
        'Medan "respondenId" harus berupa teks yang tidak kosong. Tanpa itu, nilai ini tidak bisa ' +
        'dikaitkan dengan siapa pun saat direkap.',
    };
  }

  var kriteria = rapikanTeks_(muatan.kriteria);
  if (typeof muatan.kriteria !== 'string' || kriteria === '') {
    return {
      sah: false,
      pesan:
        'Medan "kriteria" harus berupa teks yang tidak kosong, yaitu nama kolom asal atau nama ' +
        'kriteria manual yang sedang dinilai.',
    };
  }

  var nilai = '';
  if (muatan.nilai !== null && muatan.nilai !== undefined) {
    if (typeof muatan.nilai !== 'number' || !isFinite(muatan.nilai)) {
      return {
        sah: false,
        pesan:
          'Medan "nilai" harus berupa angka, atau dihilangkan sama sekali bila baris ini hanya ' +
          'berisi catatan. Teks seperti "80" dan "" ditolak supaya sel kosong tidak pernah ' +
          'berubah menjadi 0.',
      };
    }
    nilai = muatan.nilai;
  }

  var catatan = '';
  if (muatan.catatan !== null && muatan.catatan !== undefined) {
    if (typeof muatan.catatan !== 'string') {
      return { sah: false, pesan: 'Medan "catatan" harus berupa teks bila diisi.' };
    }
    // Hanya spasi tepi yang dibuang; catatan adalah teks bebas, jadi spasi dan
    // baris baru di dalamnya memang ditulis penilai dengan sengaja.
    catatan = muatan.catatan.trim();
  }

  if (nilai === '' && catatan === '') {
    return {
      sah: false,
      pesan:
        'Permintaan tidak memuat nilai maupun catatan, jadi tidak ada yang bisa disimpan. ' +
        'Isi salah satunya lebih dulu.',
    };
  }

  return {
    sah: true,
    respondenId: respondenId,
    kriteria: kriteria,
    nilai: nilai,
    catatan: catatan,
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
