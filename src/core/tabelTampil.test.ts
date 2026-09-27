import { describe, expect, it } from 'vitest';
import type { HasilIndeksDimensi } from './aggregator';
import type { BarisGabungan, HasilGabungan } from './merger';
import { TANDA_KOSONG } from './penyajian';
import { bangunTabelGabungan, bangunTabelRingkasan, pastikanTabelSah } from './tabelTampil';
import type { TabelTampil } from './tabelTampil';

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

  it('menampilkan selisih negatif dengan pembulatan yang menjauhi nol', () => {
    // Peserta yang turun nilainya: tes 16 soal, 8 benar lalu 7 benar.
    // Selisihnya -6,25 persen dan harus tercetak -6,3 seperti di Excel,
    // bukan -6,2 seperti yang dihasilkan Math.round biasa.
    const tabel = bangunTabelGabungan(
      hasil([baris({ nilaiPerSesi: { s1: 50, s2: 43.75 }, selisih: -6.25 })]),
      OPSI,
    );
    expect(tabel.baris[0]?.[4]).toBe('50,0');
    expect(tabel.baris[0]?.[6]).toBe('43,8');
    expect(tabel.baris[0]?.[8]).toBe('-6,3');
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

describe('pastikanTabelSah', () => {
  const sah: TabelTampil = {
    judul: 'Rekap Gabungan',
    kolom: ['ID', 'Nilai'],
    baris: [['id1', '40,0']],
    kolomIdentitas: 1,
  };

  it('meloloskan tabel yang barisnya sepanjang kolom', () => {
    expect(() => pastikanTabelSah(sah)).not.toThrow();
  });

  it('meloloskan tabel tanpa baris data', () => {
    // Sesi yang belum diisi siapa pun memang menghasilkan tabel tanpa baris.
    expect(() => pastikanTabelSah({ ...sah, baris: [] })).not.toThrow();
  });

  it('menolak tabel tanpa kolom', () => {
    expect(() => pastikanTabelSah({ ...sah, kolom: [], baris: [], kolomIdentitas: 0 })).toThrow(
      /tidak punya satu kolom pun/,
    );
  });

  it('menolak baris yang kurang sel dan menyebut indeks barisnya', () => {
    const tabel = { ...sah, baris: [['id1', '40,0'], ['id2']] };
    expect(() => pastikanTabelSah(tabel)).toThrow(/Baris ke-1/);
  });

  it('menolak baris yang kelebihan sel', () => {
    const tabel = { ...sah, baris: [['id1', '40,0', 'nyasar']] };
    expect(() => pastikanTabelSah(tabel)).toThrow(/Baris ke-0/);
  });

  it('menolak kolomIdentitas di luar rentang atau bukan bilangan bulat', () => {
    expect(() => pastikanTabelSah({ ...sah, kolomIdentitas: -1 })).toThrow(/kolomIdentitas/);
    expect(() => pastikanTabelSah({ ...sah, kolomIdentitas: 3 })).toThrow(/kolomIdentitas/);
    expect(() => pastikanTabelSah({ ...sah, kolomIdentitas: 1.5 })).toThrow(/kolomIdentitas/);
  });

  it('menerima kolomIdentitas nol dan sepanjang kolom', () => {
    expect(() => pastikanTabelSah({ ...sah, kolomIdentitas: 0 })).not.toThrow();
    expect(() => pastikanTabelSah({ ...sah, kolomIdentitas: 2 })).not.toThrow();
  });
});

describe('bentuk tabel dari pembangun sesungguhnya', () => {
  // Penjaga hanya berguna bila pembangunnya memang selalu lolos. Seluruh varian
  // diperiksa di sini supaya Excel dan PDF tidak pernah punya kesempatan berbeda.
  const daftar: [string, TabelTampil][] = [
    ['gabungan biasa', bangunTabelGabungan(hasil([baris({})]), OPSI)],
    ['gabungan anonim', bangunTabelGabungan(hasil([baris({})]), { ...OPSI, anonim: true })],
    [
      'gabungan tanpa pembanding',
      bangunTabelGabungan(hasil([baris({})]), { ...OPSI, adaPembanding: false }),
    ],
    [
      'gabungan anonim tanpa pembanding',
      bangunTabelGabungan(hasil([baris({})]), { ...OPSI, anonim: true, adaPembanding: false }),
    ],
    [
      'gabungan dengan meta yang tidak merata dan nilai kosong',
      bangunTabelGabungan(
        hasil([
          baris({ meta: { Gender: 'female' } }),
          baris({
            id: 'id2',
            nama: null,
            meta: { Age: '20' },
            nilaiPerSesi: { s1: 40 },
            statusPerSesi: { s1: 'ikut' },
            selisih: null,
          }),
        ]),
        OPSI,
      ),
    ],
    ['gabungan tanpa baris', bangunTabelGabungan(hasil([]), OPSI)],
    [
      'ringkasan dimensi',
      bangunTabelRingkasan(
        [{ dimensi: 'kemudahan', indeks: 80.996, pasanganDihitung: 100 }],
        70,
        { desimal: 1 },
      ),
    ],
  ];

  for (const [nama, tabel] of daftar) {
    it(`menghasilkan baris sepanjang kolom pada ${nama}`, () => {
      expect(tabel.kolom.length).toBeGreaterThan(0);
      for (const satu of tabel.baris) expect(satu).toHaveLength(tabel.kolom.length);
      expect(() => pastikanTabelSah(tabel)).not.toThrow();
    });
  }
});
