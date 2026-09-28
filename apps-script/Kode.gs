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
  finalkanSesi: { peran: ['admin'], menulis: true },
};

/**
 * Penyiapan ruang kerja sengaja TIDAK ada di SYARAT_AKSI.
 *
 * Seluruh aksi di sana diputuskan `putuskanIzin_`, yang menimbang daftar peran
 * pada baris sesi. Penyiapan justru dijalankan saat sheet `Sesi` belum ada,
 * sehingga menyaringnya lewat jalur itu membuatnya mustahil dipakai pertama
 * kali. Wewenangnya diputuskan terpisah oleh `wewenangPenyiapan_`.
 */
var AKSI_PENYIAPAN = 'siapkanRuangKerja';

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
 * Kelima sheet Spreadsheet Ruang Kerja beserta kepala kolomnya, persis seperti
 * spec §6.1–§6.5. Nama kolom diambil dari spec dan bukan dari ingatan: satu
 * kolom yang salah eja membuat seluruh sistem membaca kolom yang keliru, dan
 * kegagalannya diam — angkanya mendarat di tempat lain, bukan hilang.
 *
 * Kolom `meta_*` dan `jawaban_*` pada Responden tidak ada di sini karena
 * namanya baru diketahui saat berkas diimpor; penyiapan hanya menyediakan
 * kolom tetapnya. Kolom `pengamat` juga tidak ada: §6.4 belum punya kolom itu,
 * dan menambahkannya sendiri berarti memutuskan koreksi C5 diam-diam.
 */
var KEPALA_RUANG_KERJA = [
  {
    nama: 'Proyek',
    kepala: ['proyek_id', 'nama', 'sesi_urut', 'sesi_awal', 'sesi_akhir', 'dibuat_pada'],
  },
  {
    nama: NAMA_SHEET_SESI,
    kepala: ['sesi_id', 'proyek_id', 'nama', 'skema_id', 'mode', 'status', 'penilai', 'admin'],
  },
  {
    nama: 'Responden',
    kepala: ['sesi_id', 'id', 'email', 'nama', 'status_kelengkapan', 'diimpor_pada'],
  },
  {
    nama: 'Skema',
    kepala: [
      'skema_id',
      'kolom_asal',
      'label',
      'dimensi',
      'aturan',
      'parameter',
      'skor_maks',
      'bobot',
    ],
  },
  { nama: NAMA_SHEET_PENILAIAN, kepala: KOLOM_PENILAIAN_WAJIB },
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

var STATUS_FINAL = 'final';

/**
 * Dipakai dua jalur wewenang yang berbeda, jadi disatukan di sini: penyiapan
 * ruang kerja tidak melewati `putuskanIzin_`, dan salah setel deployment harus
 * terbaca sama di kedua jalur.
 *
 * Pesan ini DILARANG meresepkan mode deployment. Menyuruh pembacanya memilih
 * "Pengguna yang mengakses" berarti menuntunnya membagikan Spreadsheet kepada
 * setiap penilai, tepat yang §9.2 larang.
 */
var PESAN_TANPA_IDENTITAS =
  'Google tidak mengirimkan identitas pemanggil, jadi tidak ada yang bisa dicocokkan dengan ' +
  'daftar peran pada sheet Sesi. Akses anonim dan akun di luar domain yang diizinkan ' +
  'sama-sama menghasilkan email kosong, sehingga mode deployment tidak boleh ditebak dari ' +
  'pesan ini. Ikuti protokol keamanan proyek untuk menentukan dan membuktikan setelannya.';

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

  // Penyiapan dijawab sebelum sesiId ditimbang. Ia justru dijalankan ketika
  // sheet Sesi belum ada sama sekali, jadi mensyaratkan sesi yang sah di sini
  // membuat ruang kerja baru mustahil disiapkan.
  if (permintaan.aksi === AKSI_PENYIAPAN) {
    return balas_(siapkanRuangKerja_(emailPemanggil_()));
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
  if (perintah.aksi === 'finalkanSesi') return finalkanSesi_(perintah);

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
 * Finalisasi menutup sesi dengan menulis `final` ke kolom status sheet `Sesi`.
 *
 * Sengaja TIDAK dibuat idempoten-sukses: memfinalkan sesi yang sudah final
 * ditolak sebagai `SESI_FINAL`, sama seperti penulisan lain. Begitu satu aksi
 * menulis dikecualikan dari aturan "sesi final menolak semuanya", pengecualian
 * itulah lubangnya — dan balasan sukses atas sesi yang tidak berubah membuat
 * layar melaporkan perubahan yang tidak pernah terjadi.
 */
function finalkanSesi_(perintah) {
  var kunci = LockService.getScriptLock();
  try {
    kunci.waitLock(BATAS_KUNCI_MS);
  } catch (galat) {
    return {
      ok: false,
      kode: 'SEDANG_SIBUK',
      sesiId: perintah.sesiId,
      pesan:
        'Ruang kerja sedang ditulisi permintaan lain, jadi sesi "' +
        perintah.sesiId +
        '" belum difinalkan. Coba lagi sebentar, lalu periksa kolom status pada sheet Sesi ' +
        'sebelum mengumumkan sesi ini ditutup.',
    };
  }

  try {
    return tulisStatusFinal_(perintah);
  } catch (galat) {
    return {
      ok: false,
      kode: 'GAGAL_MENULIS',
      sesiId: perintah.sesiId,
      pesan:
        'Status sesi gagal ditulis ke sheet Sesi: ' +
        String(galat) +
        '. Sesi "' +
        perintah.sesiId +
        '" masih terbuka dan tetap menerima penilaian, jadi kirim ulang setelah sebabnya diperbaiki.',
    };
  } finally {
    kunci.releaseLock();
  }
}

/**
 * Dipanggil hanya dari dalam kunci.
 *
 * Sesi dibaca ULANG di sini alih-alih memakai hasil pemeriksaan izin: di antara
 * keputusan izin dan penulisan ini, permintaan lain bisa saja sudah memfinalkan
 * sesi yang sama, dan yang kedua akan menimpanya tanpa ada yang tahu.
 */
function tulisStatusFinal_(perintah) {
  var sesi = cariSesi_(perintah.sesiId);
  if (sesi.cacat !== '') {
    return {
      ok: false,
      kode: 'SESI_CACAT',
      sesiId: perintah.sesiId,
      pesan:
        'Sheet Sesi tidak bisa dipercaya: ' +
        sesi.cacat +
        '. Tidak ada baris yang difinalkan. Perbaiki sheet Sesi lebih dulu.',
    };
  }

  if (sesi.ada !== true) {
    return {
      ok: false,
      kode: 'SESI_TIDAK_ADA',
      sesiId: perintah.sesiId,
      pesan: 'Sesi "' + perintah.sesiId + '" sudah tidak ada saat gilirannya tiba, jadi tidak ada yang difinalkan.',
    };
  }

  if (sesi.status === STATUS_FINAL) {
    return {
      ok: false,
      kode: 'SESI_FINAL',
      sesiId: sesi.sesiId,
      pesan:
        'Sesi "' +
        sesi.sesiId +
        '" sudah final, jadi tidak ada yang diubah. Kembalikan statusnya ke "berjalan" lewat ' +
        'sheet Sesi bila memang masih perlu dinilai.',
    };
  }

  if (!adaDalam_(STATUS_BOLEH_DITULIS, sesi.status)) {
    return {
      ok: false,
      kode: 'SESI_CACAT',
      sesiId: sesi.sesiId,
      pesan:
        'Sesi "' +
        sesi.sesiId +
        '" berstatus ' +
        (sesi.status === '' ? 'kosong' : '"' + sesi.status + '"') +
        ', bukan draft maupun berjalan. Karena tidak ada cara tahu apa yang sedang ditimpa, ' +
        'statusnya dibiarkan apa adanya. Perbaiki kolom status pada sheet Sesi.',
    };
  }

  SpreadsheetApp.getActive()
    .getSheetByName(NAMA_SHEET_SESI)
    .getRange(sesi.baris, sesi.kolomStatus)
    .setValue(STATUS_FINAL);

  return {
    ok: true,
    kode: 'DIFINALKAN',
    sesiId: sesi.sesiId,
    status: STATUS_FINAL,
    pesan:
      'Sesi "' +
      sesi.sesiId +
      '" difinalkan. Sejak sekarang seluruh penulisan ke sesi ini ditolak, termasuk dari admin; ' +
      'rekapnya tetap bisa dibaca.',
  };
}

/**
 * Menyiapkan kelima sheet Ruang Kerja, idempoten dan tanpa menyentuh data lama.
 *
 * Wewenangnya diputuskan di sini, bukan oleh `putuskanIzin_`, karena penyiapan
 * melingkar: ia membuat sheet `Sesi`, sedangkan daftar admin dibaca DARI sheet
 * itu. Lihat `wewenangPenyiapan_` untuk cara lingkaran itu diputus dan untuk
 * bagian yang masih menunggu keputusan pengguna.
 */
function siapkanRuangKerja_(emailSesi) {
  var pemanggil = rapikanKecil_(emailSesi);
  if (pemanggil === '') {
    return { ok: false, kode: 'TANPA_IDENTITAS', pesan: PESAN_TANPA_IDENTITAS };
  }

  var berkas = SpreadsheetApp.getActive();
  var berwenang = wewenangPenyiapan_(berkas);
  if (berwenang.length === 0) {
    return {
      ok: false,
      kode: 'PEMILIK_TIDAK_DIKETAHUI',
      pesan:
        'Spreadsheet ini tidak punya pemilik yang bisa dibaca skrip, dan sheet Sesi belum memuat ' +
        'satu pun admin yang bisa dipercaya. Karena tidak ada satu pun identitas yang berwenang, ' +
        'penyiapan ditolak alih-alih dibuka untuk siapa saja. Pindahkan Spreadsheet ke Drive ' +
        'pribadi pemiliknya, atau buat sheet Sesi dengan tangan dan isi kolom admin lebih dulu.',
    };
  }

  if (!adaDalam_(berwenang, pemanggil)) {
    return {
      ok: false,
      kode: 'BUKAN_ADMIN',
      pesan:
        'Penyiapan ruang kerja hanya boleh dilakukan pemilik Spreadsheet Ruang Kerja atau orang ' +
        'yang terdaftar pada kolom admin sheet Sesi. Email ' +
        pemanggil +
        ' bukan keduanya. Mintalah salah satu dari mereka yang menjalankannya.',
    };
  }

  var kunci = LockService.getScriptLock();
  try {
    kunci.waitLock(BATAS_KUNCI_MS);
  } catch (galat) {
    return {
      ok: false,
      kode: 'SEDANG_SIBUK',
      pesan:
        'Ruang kerja sedang ditulisi permintaan lain, jadi tidak ada sheet yang dibuat. ' +
        'Coba lagi sebentar.',
    };
  }

  try {
    return bangunRuangKerja_(berkas);
  } catch (galat) {
    return {
      ok: false,
      kode: 'GAGAL_MENYIAPKAN',
      pesan:
        'Penyiapan berhenti di tengah jalan: ' +
        String(galat) +
        '. Sebagian sheet mungkin sudah terbuat; jalankan lagi setelah sebabnya diperbaiki, ' +
        'karena penyiapan aman diulang.',
    };
  } finally {
    kunci.releaseLock();
  }
}

/**
 * Siapa yang boleh menyiapkan ruang kerja: pemilik Spreadsheet, ditambah setiap
 * email pada kolom `admin` sheet `Sesi`.
 *
 * Pemilik dipakai karena ia satu-satunya identitas yang ada SEBELUM data apa
 * pun ada — tanpanya ruang kerja baru mustahil disiapkan pertama kali. Daftar
 * admin ditambahkan supaya penyiapan tetap dapat diulang oleh orang yang memang
 * mengelola ruang kerja itu, bukan hanya oleh pemilik berkasnya.
 *
 * Spec tidak mengatur ini: §9.1 tidak menyebut penyiapan sebagai aksi, dan §6.4
 * hanya menyimpan admin PER SESI, bukan admin ruang kerja. Aturan di sini adalah
 * keputusan sendiri yang butuh dibenarkan pengguna; lihat koreksi C6 pada
 * rencana store-dan-peran.
 */
function wewenangPenyiapan_(berkas) {
  var daftar = [];
  if (berkas === null || berkas === undefined) return daftar;

  var pemilik = '';
  try {
    var orang = berkas.getOwner();
    if (orang !== null && orang !== undefined) pemilik = rapikanKecil_(orang.getEmail());
  } catch (galat) {
    // Berkas di Shared Drive tidak punya pemilik, dan skrip bisa saja tidak
    // berhak membacanya. Keduanya berarti "tidak tahu", bukan "boleh siapa saja".
    pemilik = '';
  }
  if (pemilik !== '') daftar.push(pemilik);

  var admin = adminRuangKerja_(berkas);
  for (var i = 0; i < admin.length; i += 1) {
    if (!adaDalam_(daftar, admin[i])) daftar.push(admin[i]);
  }
  return daftar;
}

/** Gabungan kolom `admin` seluruh baris sheet `Sesi`; kosong bila tidak bisa dipercaya. */
function adminRuangKerja_(berkas) {
  var sheet = berkas.getSheetByName(NAMA_SHEET_SESI);
  if (sheet === null || sheet === undefined) return [];

  var kisi = sheet.getDataRange().getValues();
  var kepala = kisi.length === 0 ? [] : kisi[0];
  var ditemukan = semuaKolom_(kepala, 'admin');
  // Kolom admin yang hilang atau kembar berarti daftar yang tampak di layar
  // belum tentu daftar yang dibaca backend. Menebak salah satunya membuka
  // penyiapan untuk orang yang tidak pernah dituliskan siapa pun.
  if (ditemukan.length !== 1) return [];

  var hasil = [];
  for (var b = 1; b < kisi.length; b += 1) {
    var satuBaris = daftarEmail_(kisi[b][ditemukan[0]]);
    for (var i = 0; i < satuBaris.length; i += 1) {
      if (!adaDalam_(hasil, satuBaris[i])) hasil.push(satuBaris[i]);
    }
  }
  return hasil;
}

/** Dipanggil hanya dari dalam kunci. Sheet yang sudah berisi data tidak pernah disentuh. */
function bangunRuangKerja_(berkas) {
  var dibuat = [];
  var dilengkapi = [];
  var dilewati = [];
  var peringatan = [];

  for (var i = 0; i < KEPALA_RUANG_KERJA.length; i += 1) {
    var rencana = KEPALA_RUANG_KERJA[i];
    var sheet = berkas.getSheetByName(rencana.nama);

    // Memanggil insertSheet tanpa memeriksa lebih dulu akan melempar pada
    // penyiapan kedua: Google menolak nama sheet yang kembar.
    if (sheet === null || sheet === undefined) {
      berkas.insertSheet(rencana.nama).appendRow(rencana.kepala);
      dibuat.push(rencana.nama);
      continue;
    }

    // getLastRow, bukan panjang getDataRange().getValues(): sheet kosong punya
    // satu sel kosong, sehingga kisinya panjang 1 dan pemeriksaan panjang-nol
    // menganggapnya berisi. Kepala kolomnya tidak akan pernah ditulis.
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(rencana.kepala);
      dilengkapi.push(rencana.nama);
      continue;
    }

    dilewati.push(rencana.nama);
    var kurang = kolomYangKurang_(sheet, rencana.kepala);
    if (kurang.length > 0) {
      peringatan.push(
        'Sheet ' +
          rencana.nama +
          ' sudah berisi data, jadi tidak disentuh, tetapi kolom ' +
          kurang.join(', ') +
          ' tidak ada padanya. Tambahkan kolom itu dengan tangan; selama belum ada, sheet ini ' +
          'ditolak saat dibaca maupun ditulisi.',
      );
    }
  }

  return {
    ok: true,
    kode: peringatan.length === 0 ? 'SIAP' : 'SIAP_DENGAN_PERINGATAN',
    dibuat: dibuat,
    dilengkapi: dilengkapi,
    dilewati: dilewati,
    peringatan: peringatan,
    pesan:
      'Sheet yang dibuat: ' +
      ringkasDaftar_(dibuat) +
      '. Dilengkapi kepala kolomnya: ' +
      ringkasDaftar_(dilengkapi) +
      '. Dilewati karena sudah berisi data: ' +
      ringkasDaftar_(dilewati) +
      '.',
  };
}

/** Kolom wajib yang tidak ada, atau yang muncul lebih dari sekali pada kepala sheet. */
function kolomYangKurang_(sheet, kepalaWajib) {
  var kisi = sheet.getDataRange().getValues();
  var kepala = kisi.length === 0 ? [] : kisi[0];
  var kurang = [];
  for (var i = 0; i < kepalaWajib.length; i += 1) {
    if (semuaKolom_(kepala, kepalaWajib[i]).length !== 1) kurang.push(kepalaWajib[i]);
  }
  return kurang;
}

function ringkasDaftar_(daftar) {
  return daftar.length === 0 ? 'tidak ada' : daftar.join(', ');
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
    return tolak_('TANPA_IDENTITAS', PESAN_TANPA_IDENTITAS);
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
    if (sesi.status === STATUS_FINAL) {
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
  var kosong = {
    ada: false,
    cacat: '',
    sesiId: kunci,
    status: '',
    penilai: [],
    admin: [],
    baris: 0,
    kolomStatus: 0,
  };
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
      // Satu-satunya tempat posisi sel status ditentukan. Finalisasi memakainya
      // apa adanya; mencarinya ulang dengan cara lain membuka kemungkinan izin
      // diperiksa pada satu baris lalu status ditulis ke baris yang lain.
      baris: b + 1,
      kolomStatus: posisi['status'] + 1,
    };
  }
  return ketemu === null ? kosong : ketemu;
}

function cacatSesi_(sesiId, alasan) {
  return {
    ada: false,
    cacat: alasan,
    sesiId: sesiId,
    status: '',
    penilai: [],
    admin: [],
    baris: 0,
    kolomStatus: 0,
  };
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
