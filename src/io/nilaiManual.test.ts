import { describe, expect, it } from 'vitest';
import { nilaiBerlaku, type BarisPenilaian } from '../core/penilaian';
import { nilaiManualUntukSesi } from './nilaiManual';

/**
 * Penjembatan `nilaiBerlaku` -> `bangunNilaiSesi`.
 *
 * Sengaja dibangun dari keluaran `nilaiBerlaku` yang sungguhan, bukan dari
 * `HasilBerlaku` yang disusun tangan: yang diuji adalah sambungannya, dan
 * sambungan yang diuji terhadap bentuk buatan sendiri akan tetap hijau ketika
 * bentuk yang sebenarnya berubah.
 */

function baris(ubah: Partial<BarisPenilaian>): BarisPenilaian {
  return {
    penilaianId: 1,
    sesiId: 'S1',
    respondenId: 'a1',
    kriteria: 'Esai',
    nilai: 5,
    catatan: null,
    oleh: 'penilai@kampus.id',
    pada: '2026-10-02T00:00:00.000Z',
    ...ubah,
  };
}

describe('nilaiManualUntukSesi', () => {
  it('menyerahkan nilai berlaku sebagai peta berkunci respondenId lalu kolomAsal', () => {
    const peta = nilaiManualUntukSesi(
      nilaiBerlaku([
        baris({ penilaianId: 1, respondenId: 'a1', kriteria: 'Esai', nilai: 5 }),
        baris({ penilaianId: 2, respondenId: 'b1', kriteria: 'Lisan', nilai: 8 }),
      ]),
      'S1',
    );

    expect(peta.get('a1')?.get('Esai')).toBe(5);
    expect(peta.get('b1')?.get('Lisan')).toBe(8);
  });

  it('hanya mengambil sesi yang diminta, walau respondennya sama', () => {
    // Satu proyek, dua sesi, skema yang sama: pasangan (responden, kriteria)
    // yang sama memang muncul dua kali dengan angka berbeda. Tanpa penyaringan
    // ini, kolom selisih memuat dua salinan angka yang sama dan peningkatan
    // seluruh peserta tercetak nol.
    const berlaku = nilaiBerlaku([
      baris({ penilaianId: 1, sesiId: 'S1', nilai: 5 }),
      baris({ penilaianId: 2, sesiId: 'S2', nilai: 9 }),
    ]);

    expect(nilaiManualUntukSesi(berlaku, 'S1').get('a1')?.get('Esai')).toBe(5);
    expect(nilaiManualUntukSesi(berlaku, 'S2').get('a1')?.get('Esai')).toBe(9);
  });

  it('tidak memuat sesi yang tidak ada di antara baris mana pun', () => {
    const peta = nilaiManualUntukSesi(nilaiBerlaku([baris({ sesiId: 'S1' })]), 'S9');
    expect(peta.size).toBe(0);
  });

  it('tidak memasukkan baris catatan-saja sebagai nol', () => {
    // Aturan 2. Nol adalah nilai manual yang sah, jadi kekeliruan ini tidak
    // menghasilkan satu pun angka yang tampak ganjil: butir yang seharusnya
    // menunggu penilai justru terhitung sebagai nilai terendah.
    const peta = nilaiManualUntukSesi(
      nilaiBerlaku([baris({ penilaianId: 1, nilai: null, catatan: 'Jawabannya belum lengkap.' })]),
      'S1',
    );

    expect(peta.get('a1')).toBeUndefined();
    expect(peta.get('a1')?.get('Esai')).not.toBe(0);
  });

  it('mempertahankan angka nol yang memang ditulis penilai', () => {
    const peta = nilaiManualUntukSesi(nilaiBerlaku([baris({ nilai: 0 })]), 'S1');

    expect(peta.get('a1')?.has('Esai')).toBe(true);
    expect(peta.get('a1')?.get('Esai')).toBe(0);
  });

  it('memakai angka yang ditulis belakangan, bukan yang pertama', () => {
    const peta = nilaiManualUntukSesi(
      nilaiBerlaku([
        baris({ penilaianId: 1, nilai: 2 }),
        baris({ penilaianId: 2, nilai: 8 }),
        baris({ penilaianId: 3, nilai: null, catatan: 'Sudah dikoreksi.' }),
      ]),
      'S1',
    );

    expect(peta.get('a1')?.get('Esai')).toBe(8);
  });

  it('mempertahankan spasi ganda pada kriteria', () => {
    // `kolom_asal` pada sheet Skema dan `kriteria` pada sheet Penilaian
    // sama-sama hanya dipangkas spasi tepinya. Merapatkan salah satunya di
    // mana pun di sepanjang rantai memutus pencocokan tanpa jejak.
    const peta = nilaiManualUntukSesi(
      nilaiBerlaku([baris({ kriteria: 'Butir  A', nilai: 1 })]),
      'S1',
    );

    expect([...(peta.get('a1') ?? new Map<string, number>()).keys()]).toEqual(['Butir  A']);
  });

  it('menyatukan beberapa kriteria milik satu responden', () => {
    const peta = nilaiManualUntukSesi(
      nilaiBerlaku([
        baris({ penilaianId: 1, kriteria: 'Esai', nilai: 5 }),
        baris({ penilaianId: 2, kriteria: 'Lisan', nilai: 7 }),
      ]),
      'S1',
    );

    expect([...(peta.get('a1') ?? new Map<string, number>())]).toEqual([
      ['Esai', 5],
      ['Lisan', 7],
    ]);
  });
});
