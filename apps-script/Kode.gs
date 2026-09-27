/**
 * Backend FormScoring Engine — berkas yang benar-benar di-deploy ke Apps Script.
 *
 * Apps Script memuat berkas ini sebagai skrip global, jadi DILARANG memakai
 * sintaks modul. Uji memuat berkas yang sama persis (Batasan Global 20), jadi
 * sintaks modul akan lulus di sandbox tetapi gagal di Google.
 *
 * Akhiran garis bawah menandai fungsi yang tidak dipanggil dari luar berkas ini.
 */

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
  return balas_({
    ok: false,
    kode: 'AKSI_TIDAK_DIKENAL',
    pesan:
      'Aksi "' +
      permintaan.aksi +
      '" tidak dikenal backend. Periksa ejaannya, atau perbarui backend bila aksi ini memang baru.',
  });
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
