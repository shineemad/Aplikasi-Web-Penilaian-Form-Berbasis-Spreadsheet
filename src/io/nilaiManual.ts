import type { HasilBerlaku } from '../core/penilaian';
import type { NilaiManualSesi } from '../core/tipe';

/**
 * Jembatan antara dua bentuk yang sebelumnya tidak pernah bertemu.
 *
 * `nilaiBerlaku` menghasilkan `Map<"sesiId|respondenId|kriteria", HasilBerlaku>`
 * — satu entri per pasangan, berkunci datar — sementara `bangunNilaiSesi`
 * menuntut `Map<respondenId, Map<kolomAsal, number>>` untuk **satu** sesi saja.
 * Tanpa penerjemah di antaranya, kedua sisi rantai hijau sendiri-sendiri
 * sementara nilai yang ditulis penilai tidak pernah sampai ke perhitungan.
 *
 * Tempatnya di `io`, bukan `core`: bentuk berkunci datar itu lahir dari sheet
 * `Penilaian` yang append-only, dan `core` tidak perlu tahu satu pun hal
 * tentang sheet (Batasan Global 1 dan 23).
 */
export function nilaiManualUntukSesi(
  berlaku: ReadonlyMap<string, HasilBerlaku>,
  sesiId: string,
): NilaiManualSesi {
  const hasil = new Map<string, Map<string, number>>();

  for (const entri of berlaku.values()) {
    // Satu proyek memuat beberapa sesi dengan skema yang sama, dan nilai
    // Post-Test untuk responden yang sama menempati kriteria yang sama pula.
    // Menyaringnya di sini adalah satu-satunya hal yang membuat kolom selisih
    // berisi dua angka berbeda alih-alih dua salinan angka yang terakhir.
    if (entri.sesiId !== sesiId) continue;

    // Baris catatan-saja berakhir sebagai `nilai: null` (C1). Memasukkannya
    // sebagai 0 berarti penilai yang hanya menambah keterangan menghapus
    // seluruh angka butir itu — aturan 2 dalam bentuk yang paling halus,
    // karena 0 adalah nilai manual yang sah sehingga tidak ada yang mengeluh.
    if (entri.nilai === null) continue;

    let milik = hasil.get(entri.respondenId);
    if (milik === undefined) {
      milik = new Map<string, number>();
      hasil.set(entri.respondenId, milik);
    }

    // `kriteria` dipakai apa adanya sebagai `kolomAsal`. Keduanya dipangkas
    // spasi tepinya saja — di `Kode.gs` maupun di adaptor — justru supaya
    // "Butir  A" berspasi ganda tetap bertemu dengan butir yang sama.
    milik.set(entri.kriteria, entri.nilai);
  }

  return hasil;
}
