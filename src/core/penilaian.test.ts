import { describe, expect, it } from 'vitest';
import { cariYatim, kunciPenilaian, nilaiBerlaku } from './penilaian';
import type { BarisPenilaian } from './penilaian';

/**
 * Seluruh medan BarisPenilaian wajib, tetapi sebagian besar uji hanya peduli
 * pada dua atau tiga di antaranya. Pembantu ini mengisi sisanya supaya yang
 * sedang dibuktikan tidak tenggelam di antara medan yang tidak relevan.
 */
function barisUji(sebagian: Partial<BarisPenilaian>): BarisPenilaian {
  return {
    penilaianId: 1,
    sesiId: 'S1',
    respondenId: 'a1',
    kriteria: 'K1',
    nilai: null,
    catatan: null,
    oleh: 'penilai@kampus.id',
    pada: '2026-01-01T00:00:00Z',
    ...sebagian,
  };
}

describe('kunciPenilaian', () => {
  it('memuat sesi, responden, dan kriteria dalam satu teks', () => {
    expect(kunciPenilaian('S1', 'a1', 'K1')).toBe('S1|a1|K1');
  });
});

describe('nilaiBerlaku', () => {
  it('memakai baris terakhir untuk pasangan yang sama', () => {
    const hasil = nilaiBerlaku([
      barisUji({ penilaianId: 1, nilai: 70 }),
      barisUji({ penilaianId: 2, nilai: 85 }),
    ]);
    expect(hasil.get('S1|a1|K1')?.nilai).toBe(85);
  });

  it('memisahkan sesi yang berbeda untuk responden dan kriteria yang sama', () => {
    // Koreksi C7. Kunci tanpa sesiId membuat nilai Post-Test menimpa nilai
    // Pre-Test, sehingga seluruh kolom selisih menjadi kosong tanpa ada yang
    // menyadarinya — kegagalan yang paling mahal untuk ditemukan belakangan.
    const hasil = nilaiBerlaku([
      barisUji({ penilaianId: 1, sesiId: 'pre', nilai: 40 }),
      barisUji({ penilaianId: 2, sesiId: 'post', nilai: 80 }),
    ]);
    expect(hasil.size).toBe(2);
    expect(hasil.get(kunciPenilaian('pre', 'a1', 'K1'))?.nilai).toBe(40);
    expect(hasil.get(kunciPenilaian('post', 'a1', 'K1'))?.nilai).toBe(80);
  });

  it('memisahkan responden dan kriteria yang berbeda', () => {
    const hasil = nilaiBerlaku([
      barisUji({ penilaianId: 1, respondenId: 'a1', kriteria: 'K1', nilai: 10 }),
      barisUji({ penilaianId: 2, respondenId: 'a1', kriteria: 'K2', nilai: 20 }),
      barisUji({ penilaianId: 3, respondenId: 'a2', kriteria: 'K1', nilai: 30 }),
    ]);
    expect(hasil.size).toBe(3);
    expect(hasil.get(kunciPenilaian('S1', 'a1', 'K1'))?.nilai).toBe(10);
    expect(hasil.get(kunciPenilaian('S1', 'a1', 'K2'))?.nilai).toBe(20);
    expect(hasil.get(kunciPenilaian('S1', 'a2', 'K1'))?.nilai).toBe(30);
  });

  it('catatan tidak menghapus nilai yang sudah ada', () => {
    // Koreksi C1. Dibaca harfiah, spec membuat catatan menelan angkanya.
    const hasil = nilaiBerlaku([
      barisUji({ penilaianId: 1, nilai: 80 }),
      barisUji({ penilaianId: 2, catatan: 'perlu ditinjau' }),
    ]);
    const satu = hasil.get('S1|a1|K1');
    expect(satu?.nilai).toBe(80);
    expect(satu?.catatan).toBe('perlu ditinjau');
  });

  it('nilai baru tidak menghapus catatan yang sudah ada', () => {
    const hasil = nilaiBerlaku([
      barisUji({ penilaianId: 1, catatan: 'perlu ditinjau' }),
      barisUji({ penilaianId: 2, nilai: 90 }),
    ]);
    const satu = hasil.get('S1|a1|K1');
    expect(satu?.nilai).toBe(90);
    expect(satu?.catatan).toBe('perlu ditinjau');
  });

  it('catatan yang hanya berisi spasi tidak menghapus catatan sebelumnya', () => {
    const hasil = nilaiBerlaku([
      barisUji({ penilaianId: 1, catatan: 'perlu ditinjau' }),
      barisUji({ penilaianId: 2, catatan: '   ' }),
      barisUji({ penilaianId: 3, catatan: '' }),
    ]);
    expect(hasil.get('S1|a1|K1')?.catatan).toBe('perlu ditinjau');
  });

  it('membedakan belum pernah dinilai dari pernah dinilai nol', () => {
    // Aturan 2 repo, di lapisan yang paling mudah melanggarnya.
    expect(nilaiBerlaku([]).get('S1|a1|K1')).toBeUndefined();
    const nol = nilaiBerlaku([barisUji({ penilaianId: 1, nilai: 0 })]);
    expect(nol.get('S1|a1|K1')?.nilai).toBe(0);
  });

  it('nilai nol menimpa nilai sebelumnya seperti angka lain', () => {
    const hasil = nilaiBerlaku([
      barisUji({ penilaianId: 1, nilai: 75 }),
      barisUji({ penilaianId: 2, nilai: 0 }),
    ]);
    expect(hasil.get('S1|a1|K1')?.nilai).toBe(0);
  });

  it('mengurutkan berdasarkan penilaian_id, bukan cap waktu', () => {
    // Koreksi C2. Cap waktu sengaja dibuat identik dan urutan lariknya dibalik,
    // sehingga implementasi yang menyortir cap waktu tidak punya tempat
    // bersembunyi.
    const hasil = nilaiBerlaku([
      barisUji({ penilaianId: 2, nilai: 85, pada: '2026-01-01T00:00:00Z' }),
      barisUji({ penilaianId: 1, nilai: 70, pada: '2026-01-01T00:00:00Z' }),
    ]);
    expect(hasil.get('S1|a1|K1')?.nilai).toBe(85);
  });

  it('mengabaikan cap waktu yang lebih baru pada penilaian_id yang lebih kecil', () => {
    const hasil = nilaiBerlaku([
      barisUji({ penilaianId: 2, nilai: 85, pada: '2026-01-01T00:00:00Z' }),
      barisUji({ penilaianId: 1, nilai: 70, pada: '2026-12-31T23:59:59Z' }),
    ]);
    expect(hasil.get('S1|a1|K1')?.nilai).toBe(85);
  });

  it('mencatat asal nilai dan asal catatan secara terpisah', () => {
    // Nilai dan catatan diselesaikan terpisah (C1), jadi keduanya bisa berasal
    // dari penilai yang berbeda. Satu medan `oleh` akan menyalahkan orang.
    const hasil = nilaiBerlaku([
      barisUji({ penilaianId: 1, nilai: 80, oleh: 'ani@kampus.id', pada: '2026-01-01T00:00:00Z' }),
      barisUji({
        penilaianId: 2,
        catatan: 'perlu ditinjau',
        oleh: 'budi@kampus.id',
        pada: '2026-02-02T00:00:00Z',
      }),
    ]);
    const satu = hasil.get('S1|a1|K1');
    expect(satu?.nilaiDari).toEqual({
      penilaianId: 1,
      oleh: 'ani@kampus.id',
      pada: '2026-01-01T00:00:00Z',
    });
    expect(satu?.catatanDari).toEqual({
      penilaianId: 2,
      oleh: 'budi@kampus.id',
      pada: '2026-02-02T00:00:00Z',
    });
  });

  it('membiarkan asal kosong untuk medan yang belum pernah diisi', () => {
    const hasil = nilaiBerlaku([barisUji({ penilaianId: 1, catatan: 'baru dicatat' })]);
    const satu = hasil.get('S1|a1|K1');
    expect(satu?.nilai).toBeNull();
    expect(satu?.nilaiDari).toBeNull();
    expect(satu?.catatanDari?.penilaianId).toBe(1);
  });

  it('tetap membuat entri untuk baris tanpa nilai maupun catatan', () => {
    // Barisnya ada di sheet Penilaian, jadi ia tidak boleh lenyap dari hasil.
    const hasil = nilaiBerlaku([barisUji({ penilaianId: 1 })]);
    const satu = hasil.get('S1|a1|K1');
    expect(satu).toBeDefined();
    expect(satu?.nilai).toBeNull();
    expect(satu?.catatan).toBeNull();
  });

  it('membawa sesi, responden, dan kriteria di dalam hasil', () => {
    // Supaya pemakai tidak pernah perlu mengurai kembali teks kuncinya.
    const hasil = nilaiBerlaku([
      barisUji({ penilaianId: 1, sesiId: 'pre', respondenId: 'a9', kriteria: 'K7', nilai: 50 }),
    ]);
    const satu = hasil.get(kunciPenilaian('pre', 'a9', 'K7'));
    expect(satu?.sesiId).toBe('pre');
    expect(satu?.respondenId).toBe('a9');
    expect(satu?.kriteria).toBe('K7');
  });

  it('tidak menjatuhkan baris yang respondennya tidak dikenal', () => {
    // Koreksi C7: server tidak memeriksa respondenId terhadap sheet Responden,
    // jadi baris yatim sampai ke sini. Menghilangkannya melanggar tuntutan
    // "baris ditandai, bukan dihilangkan".
    const hasil = nilaiBerlaku([
      barisUji({ penilaianId: 1, respondenId: 'a1', nilai: 70 }),
      barisUji({ penilaianId: 2, respondenId: 'salah-ketik', nilai: 90 }),
    ]);
    expect(hasil.size).toBe(2);
    expect(hasil.get(kunciPenilaian('S1', 'salah-ketik', 'K1'))?.nilai).toBe(90);
  });
});

describe('cariYatim', () => {
  const hasil = nilaiBerlaku([
    barisUji({ penilaianId: 1, respondenId: 'a1', nilai: 70 }),
    barisUji({ penilaianId: 2, respondenId: 'salah-ketik', kriteria: 'K2', nilai: 90 }),
  ]);

  it('menandai entri yang respondennya tidak ada di daftar', () => {
    const yatim = cariYatim(hasil, ['a1', 'a2']);
    expect(yatim).toHaveLength(1);
    expect(yatim[0]?.respondenId).toBe('salah-ketik');
    expect(yatim[0]?.kriteria).toBe('K2');
  });

  it('tidak menandai apa pun ketika seluruh responden dikenal', () => {
    expect(cariYatim(hasil, ['a1', 'salah-ketik'])).toHaveLength(0);
  });

  it('menandai semuanya ketika daftar responden kosong', () => {
    expect(cariYatim(hasil, [])).toHaveLength(2);
  });
});
