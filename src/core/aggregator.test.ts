import { describe, expect, it } from 'vitest';
import {
  hitungIndeksDimensi,
  hitungIndeksKeseluruhan,
  hitungNilaiResponden,
} from './aggregator';
import type { Aturan, JawabanResponden, Skema } from './tipe';

const LIKERT: Aturan = {
  jenis: 'peta-opsi',
  skorMaks: 5,
  peta: {
    'strongly disagree': 1,
    disagree: 2,
    neutral: 3,
    agree: 4,
    'strongly agree': 5,
  },
};

function skemaLikert(perlakuanKosong: 'abaikan' | 'nol'): Skema {
  return {
    skemaId: 'uji',
    perlakuanKosong,
    butir: [
      { kolomAsal: 'q1', label: 'Butir 1', dimensi: 'kemudahan', aturan: LIKERT, bobot: 1 },
      { kolomAsal: 'q2', label: 'Butir 2', dimensi: 'kemudahan', aturan: LIKERT, bobot: 1 },
      { kolomAsal: 'q3', label: 'Butir 3', dimensi: 'kepuasan', aturan: LIKERT, bobot: 1 },
    ],
  };
}

function responden(id: string, jawaban: Record<string, string>): JawabanResponden {
  return { id, email: `${id}@example.com`, nama: null, jawaban };
}

const MANUAL_10: Aturan = { jenis: 'manual', min: 0, maks: 10 };
const RUBRIK_1_5: Aturan = { jenis: 'manual', min: 1, maks: 5 };
// Satu-satunya opsi bernilai 2,5 supaya ketiga kemungkinan penanganan nilai di
// luar rentang menghasilkan angka yang berbeda: 50, 75, dan 95.
const PECAHAN: Aturan = { jenis: 'peta-opsi', skorMaks: 5, peta: { tengah: 2.5 } };

function skemaDuaButir(
  aturanEsai: Aturan,
  aturanQ1: Aturan = LIKERT,
  perlakuanKosong: 'abaikan' | 'nol' = 'abaikan',
): Skema {
  return {
    skemaId: 'campuran',
    perlakuanKosong,
    butir: [
      { kolomAsal: 'q1', label: 'Butir 1', dimensi: 'otomatis', aturan: aturanQ1, bobot: 1 },
      { kolomAsal: 'Esai', label: 'Esai', dimensi: 'esai', aturan: aturanEsai, bobot: 1 },
    ],
  };
}

describe('hitungNilaiResponden', () => {
  it('memberi 100 bila seluruh butir bernilai maksimum', () => {
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Strongly agree', q2: 'Strongly agree', q3: 'Strongly agree' }),
      skemaLikert('abaikan'),
    );
    expect(hasil.nilai).toBeCloseTo(100, 10);
    expect(hasil.butirTerhitung).toBe(3);
  });

  it('memberi 20 bila seluruh butir bernilai minimum — bukan 0', () => {
    // Batas bawah skala Likert adalah 1 dari 5, yaitu 20 persen.
    const hasil = hitungNilaiResponden(
      responden('a', {
        q1: 'Strongly disagree',
        q2: 'Strongly disagree',
        q3: 'Strongly disagree',
      }),
      skemaLikert('abaikan'),
    );
    expect(hasil.nilai).toBeCloseTo(20, 10);
  });

  it('mengeluarkan butir kosong dari perhitungan bila perlakuannya abaikan', () => {
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Strongly agree', q2: '', q3: 'Strongly agree' }),
      skemaLikert('abaikan'),
    );
    expect(hasil.nilai).toBeCloseTo(100, 10);
    expect(hasil.butirTerhitung).toBe(2);
    expect(hasil.butirKosong).toBe(1);
  });

  it('menghitung butir kosong sebagai nol bila perlakuannya nol', () => {
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Strongly agree', q2: '', q3: 'Strongly agree' }),
      skemaLikert('nol'),
    );
    // (1 + 0 + 1) / 3 x 100
    expect(hasil.nilai).toBeCloseTo(66.667, 3);
  });

  it('mengembalikan nilai null bila tidak ada satu pun butir yang bisa dihitung', () => {
    const hasil = hitungNilaiResponden(
      responden('a', { q1: '', q2: '', q3: '' }),
      skemaLikert('abaikan'),
    );
    expect(hasil.nilai).toBe(null);
    expect(hasil.butirKosong).toBe(3);
  });

  it('mencatat peringatan dan tidak memasukkan butirnya ke perhitungan', () => {
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Strongly agree', q2: 'Maybe', q3: 'Strongly agree' }),
      skemaLikert('abaikan'),
    );
    expect(hasil.peringatan).toHaveLength(1);
    expect(hasil.peringatan.join(' ')).toContain('Butir 2');
    expect(hasil.nilai).toBeCloseTo(100, 10);
    expect(hasil.butirTerhitung).toBe(2);
  });

  it('menghasilkan nilai yang sama untuk bobot 2:3:5 dan 20:30:50', () => {
    const jawaban = { q1: 'Agree', q2: 'Neutral', q3: 'Strongly agree' };
    const dasar = skemaLikert('abaikan');
    const kecil: Skema = {
      ...dasar,
      butir: dasar.butir.map((b, i) => ({ ...b, bobot: [2, 3, 5][i] as number })),
    };
    const besar: Skema = {
      ...dasar,
      butir: dasar.butir.map((b, i) => ({ ...b, bobot: [20, 30, 50][i] as number })),
    };
    const nilaiKecil = hitungNilaiResponden(responden('a', jawaban), kecil).nilai;
    const nilaiBesar = hitungNilaiResponden(responden('a', jawaban), besar).nilai;
    expect(nilaiKecil).not.toBe(null);
    expect(Number(nilaiKecil)).toBeCloseTo(Number(nilaiBesar), 10);
    // 0,2x0,8 + 0,3x0,6 + 0,5x1 = 0,84. Tanpa bobot hasilnya 80, jadi uji ini
    // menangkap implementasi yang mengabaikan bobot.
    expect(Number(nilaiKecil)).toBeCloseTo(84, 10);
  });

  it('mengabaikan kolom yang aturannya abaikan', () => {
    const dasar = skemaLikert('abaikan');
    const skema: Skema = {
      ...dasar,
      butir: [
        ...dasar.butir,
        {
          kolomAsal: 'catatan',
          label: 'Catatan',
          dimensi: 'lain',
          aturan: { jenis: 'abaikan' },
          bobot: 1,
        },
      ],
    };
    const hasil = hitungNilaiResponden(
      responden('a', {
        q1: 'Strongly agree',
        q2: 'Strongly agree',
        q3: 'Strongly agree',
        catatan: 'bagus sekali',
      }),
      skema,
    );
    expect(hasil.nilai).toBeCloseTo(100, 10);
    expect(hasil.butirTerhitung).toBe(3);
  });
});

describe('hitungNilaiResponden dengan nilai manual', () => {
  it('tidak membuang bobot butir manual dari penyebut', () => {
    // Cacat yang rencana ini perbaiki. Butir peta-opsi dijawab bernilai 5 dari
    // 5, butir manual diberi 5 dari 10.
    // Benar: (1x(5/5) + 1x(5/10)) / 2 x 100 = 75
    // Perilaku lama: butir manual hilang beserta bobotnya -> 100.
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Strongly agree' }),
      skemaDuaButir(MANUAL_10),
      new Map([['Esai', 5]]),
    );
    expect(hasil.nilai).toBe(75);
    expect(hasil.butirTerhitung).toBe(2);
    expect(hasil.butirMenunggu).toBe(0);
  });

  it('tanpa nilai manual, butir manual tidak diam-diam menaikkan nilai', () => {
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Strongly agree' }),
      skemaDuaButir(MANUAL_10),
    );
    expect(hasil.nilai).toBe(100); // penyebut memang mengecil (D1)
    expect(hasil.butirMenunggu).toBe(1); // tetapi jejaknya ada
    expect(hasil.butirTerhitung).toBe(1);
  });

  it('mengembalikan nilai null bila seluruh butirnya menunggu penilaian', () => {
    // Aturan 2: belum dinilai bukan nol.
    const hasil = hitungNilaiResponden(
      responden('a', {}),
      skemaDuaButir(MANUAL_10, RUBRIK_1_5),
    );
    expect(hasil.nilai).toBe(null);
    expect(hasil.butirMenunggu).toBe(2);
  });

  it('tetap menunggu meski perlakuan kosong adalah nol', () => {
    // Butir menunggu dikeluarkan dari penyebut tanpa memedulikan perlakuanKosong,
    // karena yang belum bekerja adalah penilai, bukan responden.
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Strongly agree' }),
      skemaDuaButir(MANUAL_10, LIKERT, 'nol'),
    );
    expect(hasil.nilai).toBe(100);
    expect(hasil.butirMenunggu).toBe(1);
  });

  it('membedakan butir menunggu dari butir kosong', () => {
    // "Belum dinilai orang" dan "tidak dijawab responden" tidak boleh menjadi
    // satu angka.
    const skema: Skema = {
      skemaId: 'campuran',
      perlakuanKosong: 'abaikan',
      butir: [
        { kolomAsal: 'q1', label: 'Butir 1', dimensi: 'd', aturan: LIKERT, bobot: 1 },
        { kolomAsal: 'q2', label: 'Butir 2', dimensi: 'd', aturan: LIKERT, bobot: 1 },
        { kolomAsal: 'Esai', label: 'Esai', dimensi: 'e', aturan: MANUAL_10, bobot: 1 },
      ],
    };
    const hasil = hitungNilaiResponden(responden('a', { q1: 'Agree', q2: '' }), skema);
    expect(hasil.butirKosong).toBe(1);
    expect(hasil.butirMenunggu).toBe(1);
    expect(hasil.butirTerhitung).toBe(1);
  });

  it('nilai manual mengoreksi skor otomatis dan koreksinya tercatat', () => {
    // D2. Tanpa koreksi, 'Disagree' bernilai 2 dari 5 -> 40.
    const skema = skemaDuaButir({ jenis: 'abaikan' });
    const tanpa = hitungNilaiResponden(responden('a', { q1: 'Disagree' }), skema);
    expect(tanpa.nilai).toBe(40);

    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Disagree' }),
      skema,
      new Map([['q1', 5]]),
    );
    expect(hasil.nilai).toBe(100);
    expect(hasil.butirDikoreksi).toEqual(['q1']);
    expect(hasil.butirMenunggu).toBe(0);
  });

  it('koreksi memperbaiki opsi tak dikenal, bukan menambah peringatan', () => {
    // Alasan D2: skor otomatis yang salah akibat opsi terpetakan keliru harus
    // bisa dibetulkan tanpa menyunting sheet dengan tangan.
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Maybe' }),
      skemaDuaButir({ jenis: 'abaikan' }),
      new Map([['q1', 4]]),
    );
    expect(hasil.peringatan).toEqual([]);
    expect(hasil.nilai).toBe(80);
    expect(hasil.butirDikoreksi).toEqual(['q1']);
  });

  it('tidak menandai butir manual sebagai dikoreksi', () => {
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Strongly agree' }),
      skemaDuaButir(MANUAL_10),
      new Map([['Esai', 5]]),
    );
    expect(hasil.butirDikoreksi).toEqual([]);
  });

  it('nilai manual di luar rentang menghasilkan peringatan, bukan dijepit', () => {
    // Angka dipilih supaya ketiga kemungkinan menghasilkan hasil BERBEDA.
    //   benar, butir dikeluarkan   -> 50
    //   salah, dijepit ke maks 5   -> 75
    //   salah, dipakai mentah 7/5  -> 95
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'tengah' }),
      skemaDuaButir(RUBRIK_1_5, PECAHAN),
      new Map([['Esai', 7]]),
    );
    expect(hasil.nilai).toBe(50);
    expect(hasil.peringatan.join(' ')).toMatch(/rentang/i);
    expect(hasil.butirTerhitung).toBe(1);
  });

  it('menolak nilai manual di bawah batas bawah', () => {
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'tengah' }),
      skemaDuaButir(RUBRIK_1_5, PECAHAN),
      new Map([['Esai', 0]]),
    );
    expect(hasil.nilai).toBe(50);
    expect(hasil.peringatan.join(' ')).toMatch(/rentang/i);
  });

  it('menerima nilai manual tepat di batas', () => {
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Strongly agree' }),
      skemaDuaButir(MANUAL_10),
      new Map([['Esai', 10]]),
    );
    expect(hasil.nilai).toBe(100);
    expect(hasil.peringatan).toEqual([]);
  });

  it('menolak koreksi yang melampaui skor maksimum butir otomatisnya', () => {
    // Koreksi bernilai 99 pada butir berskala 1..5 akan menghasilkan 1980 persen
    // bila dipakai mentah.
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Disagree' }),
      skemaDuaButir({ jenis: 'abaikan' }),
      new Map([['q1', 99]]),
    );
    expect(hasil.nilai).toBe(null);
    expect(hasil.peringatan.join(' ')).toMatch(/rentang/i);
    expect(hasil.butirDikoreksi).toEqual([]);
  });

  it('memperingatkan nilai manual pada kolom yang ditandai abaikan', () => {
    // Nilai yang tidak terpakai tidak boleh hilang tanpa jejak.
    const hasil = hitungNilaiResponden(
      responden('a', { q1: 'Strongly agree' }),
      skemaDuaButir({ jenis: 'abaikan' }),
      new Map([['Esai', 5]]),
    );
    expect(hasil.nilai).toBe(100);
    expect(hasil.peringatan.join(' ')).toContain('Esai');
    expect(hasil.peringatan.join(' ')).toMatch(/abaikan/i);
  });
});

describe('hitungIndeksDimensi', () => {
  it('memberi 100 persen bila seluruh jawaban maksimum', () => {
    const hasil = hitungIndeksDimensi(
      [
        responden('a', { q1: 'Strongly agree', q2: 'Strongly agree', q3: 'Strongly agree' }),
        responden('b', { q1: 'Strongly agree', q2: 'Strongly agree', q3: 'Strongly agree' }),
      ],
      skemaLikert('abaikan'),
    );
    expect(hasil.map((d) => d.dimensi)).toEqual(['kemudahan', 'kepuasan']);
    expect(hasil[0]?.indeks).toBeCloseTo(100, 10);
    expect(hasil[0]?.pasanganDihitung).toBe(4);
  });

  it('memberi 20 persen bila seluruh jawaban minimum', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: 'Strongly disagree', q2: 'Strongly disagree', q3: 'Strongly disagree' })],
      skemaLikert('abaikan'),
    );
    expect(hasil[0]?.indeks).toBeCloseTo(20, 10);
  });

  it('mengecilkan penyebut saat jawaban kosong diabaikan', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: 'Strongly agree', q2: '', q3: 'Strongly agree' })],
      skemaLikert('abaikan'),
    );
    expect(hasil[0]?.indeks).toBeCloseTo(100, 10);
    expect(hasil[0]?.pasanganDihitung).toBe(1);
  });

  it('menurunkan indeks saat jawaban kosong dihitung nol', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: 'Strongly agree', q2: '', q3: 'Strongly agree' })],
      skemaLikert('nol'),
    );
    // (5 + 0) / (5 + 5) x 100
    expect(hasil[0]?.indeks).toBeCloseTo(50, 10);
    expect(hasil[0]?.pasanganDihitung).toBe(2);
  });

  it('mengeluarkan butir berperingatan dari pembilang dan penyebut', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: 'Strongly agree', q2: 'Maybe', q3: 'Strongly agree' })],
      skemaLikert('nol'),
    );
    expect(hasil[0]?.indeks).toBeCloseTo(100, 10);
    expect(hasil[0]?.pasanganDihitung).toBe(1);
  });

  it('mengembalikan indeks null bila dimensi tidak punya pasangan terhitung', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: '', q2: '', q3: 'Strongly agree' })],
      skemaLikert('abaikan'),
    );
    expect(hasil[0]?.indeks).toBe(null);
    expect(hasil[1]?.indeks).toBeCloseTo(100, 10);
  });

  it('memasukkan nilai manual ke indeks dimensinya', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: 'Strongly agree' }), responden('b', { q1: 'Strongly agree' })],
      skemaDuaButir(MANUAL_10),
      new Map([
        ['a', new Map([['Esai', 5]])],
        ['b', new Map([['Esai', 10]])],
      ]),
    );
    const esai = hasil.find((d) => d.dimensi === 'esai');
    // (5 + 10) / (10 + 10) x 100
    expect(esai?.indeks).toBeCloseTo(75, 10);
    expect(esai?.pasanganDihitung).toBe(2);
  });

  it('memberi indeks null pada dimensi yang seluruh butirnya menunggu', () => {
    // Aturan 2: belum dinilai bukan nol. Dimensinya tetap muncul agar
    // ketiadaannya terlihat.
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: 'Strongly agree' })],
      skemaDuaButir(MANUAL_10, LIKERT, 'nol'),
    );
    const esai = hasil.find((d) => d.dimensi === 'esai');
    expect(esai).toBeDefined();
    expect(esai?.indeks).toBe(null);
    expect(esai?.pasanganDihitung).toBe(0);
  });

  it('mengeluarkan nilai manual di luar rentang dari indeks', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', {}), responden('b', {})],
      skemaDuaButir(MANUAL_10),
      new Map([
        ['a', new Map([['Esai', 4]])],
        ['b', new Map([['Esai', 99]])],
      ]),
    );
    const esai = hasil.find((d) => d.dimensi === 'esai');
    expect(esai?.indeks).toBeCloseTo(40, 10);
    expect(esai?.pasanganDihitung).toBe(1);
  });

  it('memakai koreksi, bukan skor otomatisnya, pada indeks', () => {
    const hasil = hitungIndeksDimensi(
      [responden('a', { q1: 'Disagree' })],
      skemaDuaButir({ jenis: 'abaikan' }),
      new Map([['a', new Map([['q1', 5]])]]),
    );
    const otomatis = hasil.find((d) => d.dimensi === 'otomatis');
    expect(otomatis?.indeks).toBeCloseTo(100, 10);
    expect(otomatis?.pasanganDihitung).toBe(1);
  });

  it('hanya memakai nilai manual milik responden yang bersangkutan', () => {
    // Peta berkunci respondenId mudah tertukar dengan peta berkunci kolomAsal;
    // uji ini mengunci bahwa nilai milik 'a' tidak bocor ke 'b'.
    const hasil = hitungIndeksDimensi(
      [responden('a', {}), responden('b', {})],
      skemaDuaButir(MANUAL_10),
      new Map([['a', new Map([['Esai', 10]])]]),
    );
    const esai = hasil.find((d) => d.dimensi === 'esai');
    expect(esai?.indeks).toBeCloseTo(100, 10);
    expect(esai?.pasanganDihitung).toBe(1);
  });
});

describe('hitungIndeksKeseluruhan', () => {
  it('merata-ratakan dimensi dengan bobot butirnya', () => {
    const skema = skemaLikert('abaikan');
    // kemudahan (bobot total 2) = 100, kepuasan (bobot total 1) = 20
    const hasil = hitungIndeksKeseluruhan(
      [
        { dimensi: 'kemudahan', indeks: 100, pasanganDihitung: 2 },
        { dimensi: 'kepuasan', indeks: 20, pasanganDihitung: 1 },
      ],
      skema,
    );
    expect(hasil).toBeCloseTo(73.333, 3);
  });

  it('melewati dimensi yang indeksnya null', () => {
    const skema = skemaLikert('abaikan');
    const hasil = hitungIndeksKeseluruhan(
      [
        { dimensi: 'kemudahan', indeks: null, pasanganDihitung: 0 },
        { dimensi: 'kepuasan', indeks: 80, pasanganDihitung: 1 },
      ],
      skema,
    );
    expect(hasil).toBeCloseTo(80, 10);
  });

  it('mengembalikan null bila seluruh dimensi kosong', () => {
    const skema = skemaLikert('abaikan');
    const hasil = hitungIndeksKeseluruhan(
      [
        { dimensi: 'kemudahan', indeks: null, pasanganDihitung: 0 },
        { dimensi: 'kepuasan', indeks: null, pasanganDihitung: 0 },
      ],
      skema,
    );
    expect(hasil).toBe(null);
  });

  it('ikut membobot dimensi yang butirnya dinilai manual', () => {
    // Bila bobot butir manual tidak dihitung, dimensi 'esai' hilang dari
    // indeks keseluruhan dan hasilnya menjadi 100 tanpa jejak.
    const hasil = hitungIndeksKeseluruhan(
      [
        { dimensi: 'otomatis', indeks: 100, pasanganDihitung: 1 },
        { dimensi: 'esai', indeks: 50, pasanganDihitung: 1 },
      ],
      skemaDuaButir(MANUAL_10),
    );
    expect(hasil).toBeCloseTo(75, 10);
  });
});
