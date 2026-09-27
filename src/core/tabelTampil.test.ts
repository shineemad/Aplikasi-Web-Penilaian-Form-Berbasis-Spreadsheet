import { describe, expect, it } from 'vitest';
import type { HasilIndeksDimensi } from './aggregator';
import type { BarisGabungan, HasilGabungan } from './merger';
import { TANDA_KOSONG } from './penyajian';
import { bangunTabelGabungan, bangunTabelRingkasan } from './tabelTampil';

function baris(ubah: Partial<BarisGabungan>): BarisGabungan {
  return {
    id: 'id1',
    email: 'a@x.com',
    nama: 'Ani',
    meta: { Gender: 'female' },
    nilaiPerSesi: { s1: 40, s2: 80 },
    statusPerSesi: { s1: 'ikut', s2: 'ikut' },
    peringatanPerSesi: { s1: [], s2: [] },
    selisih: 40,
    statusGabungan: 'lengkap',
    ...ubah,
  };
}

function hasil(daftar: BarisGabungan[]): HasilGabungan {
  return {
    baris: daftar,
    urutanSesi: [
      { sesiId: 's1', namaSesi: 'Pre-Test' },
      { sesiId: 's2', namaSesi: 'Post-Test' },
    ],
    peringatan: [],
  };
}

const OPSI = { desimal: 1, anonim: false, adaPembanding: true };

describe('bangunTabelGabungan', () => {
  it('menyusun kolom identitas, sesi, selisih, lalu status', () => {
    const tabel = bangunTabelGabungan(hasil([baris({})]), OPSI);
    expect(tabel.kolom).toEqual([
      'ID',
      'Email',
      'Nama',
      'Gender',
      'Pre-Test',
      'Status Pre-Test',
      'Post-Test',
      'Status Post-Test',
      'Selisih',
      'Status Gabungan',
    ]);
  });

  it('mengisi sel dengan teks yang sudah diformat', () => {
    const tabel = bangunTabelGabungan(hasil([baris({})]), OPSI);
    expect(tabel.baris[0]).toEqual([
      'id1',
      'a@x.com',
      'Ani',
      'female',
      '40,0',
      'ikut',
      '80,0',
      'ikut',
      '40,0',
      'lengkap',
    ]);
  });

  it('menampilkan nilai yang tidak ada sebagai tanda kosong, bukan nol', () => {
    const tabel = bangunTabelGabungan(
      hasil([
        baris({
          nilaiPerSesi: { s1: 40, s2: null },
          statusPerSesi: { s1: 'ikut', s2: 'tidak ikut' },
          selisih: null,
          statusGabungan: 'sebagian:Pre-Test',
        }),
      ]),
      OPSI,
    );
    expect(tabel.baris[0]?.[6]).toBe(TANDA_KOSONG);
    expect(tabel.baris[0]?.[8]).toBe(TANDA_KOSONG);
    // Sengaja TIDAK memakai pemeriksaan substring '0,0' pada seluruh baris:
    // angka yang sah seperti "40,0" memuat substring itu, sehingga pemeriksaan
    // semacam itu mustahil lolos. Assertion per sel di atas sudah lebih kuat.
  });

  it('menampilkan nama yang kosong sebagai tanda kosong', () => {
    const tabel = bangunTabelGabungan(hasil([baris({ nama: null })]), OPSI);
    expect(tabel.baris[0]?.[2]).toBe(TANDA_KOSONG);
  });

  it('membuang kolom email dan nama pada mode anonim', () => {
    // Kolom yang ada tetapi kosong tetap membocorkan bahwa kolom itu pernah ada.
    const tabel = bangunTabelGabungan(hasil([baris({})]), { ...OPSI, anonim: true });
    expect(tabel.kolom).not.toContain('Email');
    expect(tabel.kolom).not.toContain('Nama');
    expect(tabel.kolom[0]).toBe('ID');
    expect(tabel.baris[0]?.join(' ')).not.toContain('a@x.com');
    expect(tabel.baris[0]?.join(' ')).not.toContain('Ani');
  });

  it('tidak membuat kolom selisih bila pembanding tidak ditetapkan', () => {
    const tabel = bangunTabelGabungan(hasil([baris({ selisih: null })]), {
      ...OPSI,
      adaPembanding: false,
    });
    expect(tabel.kolom).not.toContain('Selisih');
  });

  it('menggabungkan kolom meta dari seluruh baris dan mengurutkannya', () => {
    const tabel = bangunTabelGabungan(
      hasil([baris({ meta: { Gender: 'female' } }), baris({ id: 'id2', meta: { Age: '20' } })]),
      OPSI,
    );
    expect(tabel.kolom.slice(3, 5)).toEqual(['Age', 'Gender']);
    expect(tabel.baris[0]?.[3]).toBe(TANDA_KOSONG);
    expect(tabel.baris[0]?.[4]).toBe('female');
  });

  it('menandai berapa kolom identitas yang harus diulang saat tabel dipecah', () => {
    expect(bangunTabelGabungan(hasil([baris({})]), OPSI).kolomIdentitas).toBe(3);
    expect(
      bangunTabelGabungan(hasil([baris({})]), { ...OPSI, anonim: true }).kolomIdentitas,
    ).toBe(1);
  });

  it('melebar seiring bertambahnya sesi', () => {
    const tigaSesi: HasilGabungan = {
      baris: [
        baris({
          nilaiPerSesi: { s1: 40, s2: 60, s3: 80 },
          statusPerSesi: { s1: 'ikut', s2: 'ikut', s3: 'ikut' },
          peringatanPerSesi: { s1: [], s2: [], s3: [] },
        }),
      ],
      urutanSesi: [
        { sesiId: 's1', namaSesi: 'Tes 1' },
        { sesiId: 's2', namaSesi: 'Tes 2' },
        { sesiId: 's3', namaSesi: 'Tes 3' },
      ],
      peringatan: [],
    };
    expect(bangunTabelGabungan(tigaSesi, OPSI).kolom).toHaveLength(12);
  });
});

describe('bangunTabelRingkasan', () => {
  const dimensi: HasilIndeksDimensi[] = [
    { dimensi: 'kemudahan', indeks: 80.996, pasanganDihitung: 100 },
    { dimensi: 'kepuasan', indeks: null, pasanganDihitung: 0 },
  ];

  it('memuat kolom dimensi, indeks, kategori, dan jumlah pasangan', () => {
    const tabel = bangunTabelRingkasan(dimensi, 80.996, { desimal: 1 });
    expect(tabel.kolom).toEqual(['Dimensi', 'Indeks', 'Kategori', 'Pasangan Dihitung']);
  });

  it('mengkategorikan dari angka yang ditampilkan', () => {
    const tabel = bangunTabelRingkasan(dimensi, null, { desimal: 1 });
    expect(tabel.baris[0]).toEqual(['kemudahan', '81,0', 'Sangat Baik', '100']);
  });

  it('menampilkan dimensi tanpa data sebagai tanda kosong', () => {
    const tabel = bangunTabelRingkasan(dimensi, null, { desimal: 1 });
    expect(tabel.baris[1]).toEqual(['kepuasan', TANDA_KOSONG, TANDA_KOSONG, '0']);
  });

  it('menambahkan baris keseluruhan di akhir', () => {
    const tabel = bangunTabelRingkasan(dimensi, 70, { desimal: 1 });
    expect(tabel.baris[tabel.baris.length - 1]).toEqual([
      'Keseluruhan',
      '70,0',
      'Baik',
      TANDA_KOSONG,
    ]);
  });
});
