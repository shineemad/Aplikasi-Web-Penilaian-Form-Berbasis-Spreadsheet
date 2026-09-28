import { describe, expect, it } from 'vitest';
import { KODE_PERMANEN, KODE_SEMENTARA } from '../../src/io/store';
import { bacaSumberKode } from './sandbox';

/**
 * Uji tertutup atas klasifikasi kode kesalahan.
 *
 * `Kode.gs` menerbitkan kodenya, `src/io/store.ts` memutuskan apakah perintah
 * yang ditolak dengan kode itu masih boleh dikirim ulang. Keputusannya berat ke
 * dua arah: salah menandai permanen berarti penilaian yang sebenarnya masih
 * bisa tersimpan berhenti dicoba, dan salah menandai sementara berarti
 * penolakan yang tidak akan pernah berubah dikirim ulang selamanya.
 *
 * Sebelum uji ini, hanya tiga dari sebelas kode permanen yang dipancang, dan
 * kode baru di `Kode.gs` mewarisi klasifikasi "sementara" dari cabang `else`
 * tanpa seorang pun memutuskannya. Di sini daftarnya dicocokkan **dua arah**
 * dengan berkas yang di-deploy, jadi kode baru merahkan uji sampai ia
 * ditempatkan dengan sengaja.
 */

/** Diambil dari sisi `kode:` pada literal objek, termasuk bentuk ternary. */
const POLA_MEDAN_KODE = /\bkode:\s*([^\n]*)/g;

/** Argumen pertama penolakan izin, baik satu baris maupun terpotong baris. */
const POLA_PENOLAKAN = /\btolak_\(\s*'([A-Z][A-Z_]{2,})'/g;

const POLA_LITERAL = /'([A-Z][A-Z_]{2,})'/g;

/**
 * Kode yang menyertai `ok:true`. Store tidak pernah mengklasifikasikannya —
 * balasan sukses membuang perintah dari antrean sebelum kodenya dibaca. Bila
 * salah satunya berubah menjadi penolakan, ia harus dipindahkan ke salah satu
 * daftar di `store.ts`, dan uji ini akan merah sampai itu dilakukan.
 */
const KODE_SUKSES = ['TERSIMPAN', 'DIFINALKAN', 'SIAP', 'SIAP_DENGAN_PERINGATAN'];

function kodeDalamSumber(sumber: string): Set<string> {
  const hasil = new Set<string>();
  for (const baris of sumber.matchAll(POLA_MEDAN_KODE)) {
    const ekspresi = baris[1];
    if (ekspresi === undefined) continue;
    for (const literal of ekspresi.matchAll(POLA_LITERAL)) {
      const kode = literal[1];
      if (kode !== undefined) hasil.add(kode);
    }
  }
  for (const cocok of sumber.matchAll(POLA_PENOLAKAN)) {
    const kode = cocok[1];
    if (kode !== undefined) hasil.add(kode);
  }
  return hasil;
}

describe('klasifikasi kode kesalahan Kode.gs', () => {
  const semua = kodeDalamSumber(bacaSumberKode());

  it('menemukan seluruh kode sukses yang dipancang', () => {
    // Penjaga bagi pengekstraknya sendiri: pola yang berhenti cocok akan
    // membuat himpunan kosong lolos sebagai "tidak ada kode yang belum
    // diklasifikasikan".
    for (const kode of KODE_SUKSES) expect(semua).toContain(kode);
  });

  it('mengklasifikasikan setiap kode penolakan, tanpa sisa dan tanpa kelebihan', () => {
    const gagal = [...semua].filter((kode) => !KODE_SUKSES.includes(kode)).sort();
    const terklasifikasi = [...KODE_PERMANEN, ...KODE_SEMENTARA].sort();
    expect(gagal).toEqual(terklasifikasi);
  });

  it('tidak menempatkan satu kode pada dua daftar sekaligus', () => {
    const berganda = KODE_PERMANEN.filter((kode) => KODE_SEMENTARA.includes(kode));
    expect(berganda).toEqual([]);
  });
});
