import { describe, expect, it } from 'vitest';
import { periksaSkema } from './periksaSkema';
import type { Aturan, JawabanResponden, Skema } from './tipe';

const LIKERT: Aturan = {
  jenis: 'peta-opsi',
  skorMaks: 5,
  peta: { 'strongly disagree': 1, disagree: 2, neutral: 3, agree: 4, 'strongly agree': 5 },
};

function skema(butir: Skema['butir']): Skema {
  return { skemaId: 'uji', perlakuanKosong: 'abaikan', butir };
}

function baris(jawaban: Record<string, string>[]): JawabanResponden[] {
  return jawaban.map((j, i) => ({
    id: `r${i}`,
    email: `r${i}@example.com`,
    nama: null,
    jawaban: j,
  }));
}

const BUTIR_LIKERT = {
  kolomAsal: 'q1',
  label: 'Butir 1',
  dimensi: 'kemudahan',
  aturan: LIKERT,
  bobot: 1,
};

describe('periksaSkema tanpa masalah', () => {
  it('mengizinkan penyimpanan bila seluruh jawaban dikenali', () => {
    const hasil = periksaSkema(
      skema([BUTIR_LIKERT]),
      baris([{ q1: 'Agree' }, { q1: 'Strongly Agree' }, { q1: '' }]),
    );
    expect(hasil.masalah).toHaveLength(0);
    expect(hasil.bolehDisimpan).toBe(true);
  });

  it('tidak menganggap jawaban kosong sebagai opsi tak dikenal', () => {
    const hasil = periksaSkema(skema([BUTIR_LIKERT]), baris([{ q1: '' }, { q1: '   ' }]));
    expect(hasil.masalah).toHaveLength(0);
  });
});

describe('periksaSkema menemukan opsi tak dikenal', () => {
  it('mengumpulkan opsi tak dikenal beserta jumlah barisnya', () => {
    const hasil = periksaSkema(
      skema([BUTIR_LIKERT]),
      baris([{ q1: 'Yes' }, { q1: 'Maybe' }, { q1: 'Maybe' }, { q1: 'Agree' }]),
    );

    expect(hasil.bolehDisimpan).toBe(false);
    expect(hasil.masalah).toHaveLength(1);

    const masalah = hasil.masalah[0];
    expect(masalah?.jenis).toBe('opsi-tak-dikenal');
    if (masalah?.jenis === 'opsi-tak-dikenal') {
      expect(masalah.kolomAsal).toBe('q1');
      expect(masalah.opsi).toEqual([
        { teks: 'Maybe', jumlahBaris: 2 },
        { teks: 'Yes', jumlahBaris: 1 },
      ]);
    }
  });

  it('menggabungkan opsi yang hanya beda huruf besar-kecil menjadi satu', () => {
    const hasil = periksaSkema(
      skema([BUTIR_LIKERT]),
      baris([{ q1: 'Maybe' }, { q1: 'maybe' }, { q1: '  MAYBE  ' }]),
    );
    const masalah = hasil.masalah[0];
    if (masalah?.jenis === 'opsi-tak-dikenal') {
      expect(masalah.opsi).toHaveLength(1);
      expect(masalah.opsi[0]?.jumlahBaris).toBe(3);
    }
  });

  it('tidak melaporkan apa pun untuk kolom yang diabaikan', () => {
    const hasil = periksaSkema(
      skema([{ ...BUTIR_LIKERT, aturan: { jenis: 'abaikan' } }]),
      baris([{ q1: 'apa pun' }]),
    );
    expect(hasil.masalah).toHaveLength(0);
    expect(hasil.bolehDisimpan).toBe(true);
  });
});

describe('periksaSkema menolak skema yang cacat', () => {
  it('menolak skorMaks nol', () => {
    const rusak: Aturan = { jenis: 'peta-opsi', skorMaks: 0, peta: { ya: 1 } };
    const hasil = periksaSkema(skema([{ ...BUTIR_LIKERT, aturan: rusak }]), baris([{ q1: 'ya' }]));
    expect(hasil.bolehDisimpan).toBe(false);
    expect(hasil.masalah.map((m) => m.jenis)).toContain('skor-maks-tidak-sah');
  });

  it('menolak bobot nol atau negatif', () => {
    const hasil = periksaSkema(skema([{ ...BUTIR_LIKERT, bobot: 0 }]), baris([{ q1: 'Agree' }]));
    expect(hasil.bolehDisimpan).toBe(false);
    expect(hasil.masalah.map((m) => m.jenis)).toContain('bobot-tidak-positif');
  });

  it('menolak dua kunci peta yang ternormalisasi sama', () => {
    const rancu: Aturan = {
      jenis: 'peta-opsi',
      skorMaks: 5,
      peta: { 'Strongly Agree': 5, 'strongly agree': 4 },
    };
    const hasil = periksaSkema(
      skema([{ ...BUTIR_LIKERT, aturan: rancu }]),
      baris([{ q1: 'Strongly Agree' }]),
    );
    expect(hasil.bolehDisimpan).toBe(false);
    const masalah = hasil.masalah.find((m) => m.jenis === 'kunci-peta-kembar');
    expect(masalah).toBeDefined();
    if (masalah?.jenis === 'kunci-peta-kembar') {
      expect(masalah.ternormalisasi).toBe('strongly agree');
      expect(masalah.kunciAsli).toHaveLength(2);
    }
  });

  it('menolak skema yang menunjuk kolom yang tidak ada di data', () => {
    const hasil = periksaSkema(
      skema([{ ...BUTIR_LIKERT, kolomAsal: 'q99' }]),
      baris([{ q1: 'Agree' }]),
    );
    expect(hasil.bolehDisimpan).toBe(false);
    expect(hasil.masalah.map((m) => m.jenis)).toContain('kolom-tidak-ada');
  });

  it('tidak menolak kriteria manual yang memang tidak ada di data', () => {
    // Kolom manual diisi penilai, bukan responden, jadi ia tidak punya padanan
    // di spreadsheet. Menandainya sebagai kolom-tidak-ada akan membuat setiap
    // skema yang mencampur kriteria manual selamanya tidak bisa disimpan.
    const hasil = periksaSkema(
      skema([
        BUTIR_LIKERT,
        {
          kolomAsal: 'wawancara',
          label: 'Wawancara',
          dimensi: 'lisan',
          aturan: { jenis: 'manual', min: 0, maks: 100 },
          bobot: 2,
        },
      ]),
      baris([{ q1: 'Agree' }]),
    );
    expect(hasil.masalah).toHaveLength(0);
    expect(hasil.bolehDisimpan).toBe(true);
  });

  it('tidak melaporkan opsi tak dikenal untuk kolom berkunci jawaban', () => {
    // Jawaban yang tidak sama dengan kunci berarti salah, bukan berarti tak dikenali.
    const hasil = periksaSkema(
      skema([{ ...BUTIR_LIKERT, aturan: { jenis: 'kunci-jawaban', kunci: 'B' } }]),
      baris([{ q1: 'C' }, { q1: 'D' }]),
    );
    expect(hasil.masalah).toHaveLength(0);
    expect(hasil.bolehDisimpan).toBe(true);
  });

  it('melaporkan seluruh masalah sekaligus, bukan berhenti di yang pertama', () => {
    const hasil = periksaSkema(
      skema([
        { ...BUTIR_LIKERT, bobot: 0 },
        { ...BUTIR_LIKERT, kolomAsal: 'q2', label: 'Butir 2' },
      ]),
      baris([{ q1: 'Agree', q2: 'Maybe' }]),
    );
    expect(hasil.masalah.length).toBeGreaterThanOrEqual(2);
  });
});

describe('periksaSkema membandingkan peta dengan skorMaks', () => {
  it('menolak opsi yang bernilai lebih besar daripada skorMaks', () => {
    // Skala 1..5 yang satu opsinya bernilai 7 menghasilkan rasio 140%, dan
    // nilai responden lalu melampaui 100 tanpa satu pun peringatan.
    const melampaui: Aturan = { jenis: 'peta-opsi', skorMaks: 5, peta: { disagree: 1, agree: 7 } };
    const hasil = periksaSkema(
      skema([{ ...BUTIR_LIKERT, aturan: melampaui }]),
      baris([{ q1: 'agree' }]),
    );

    expect(hasil.bolehDisimpan).toBe(false);
    const masalah = hasil.masalah.find((m) => m.jenis === 'skor-peta-melampaui-maks');
    expect(masalah).toBeDefined();
    if (masalah?.jenis === 'skor-peta-melampaui-maks') {
      expect(masalah.skorMaks).toBe(5);
      expect(masalah.opsi).toEqual([{ teks: 'agree', skor: 7 }]);
    }
  });

  it('menyebut setiap opsi yang melampaui, bukan hanya yang pertama', () => {
    const melampaui: Aturan = {
      jenis: 'peta-opsi',
      skorMaks: 3,
      peta: { a: 1, b: 9, c: 4 },
    };
    const hasil = periksaSkema(skema([{ ...BUTIR_LIKERT, aturan: melampaui }]), []);

    const masalah = hasil.masalah.find((m) => m.jenis === 'skor-peta-melampaui-maks');
    if (masalah?.jenis !== 'skor-peta-melampaui-maks') throw new Error('masalah tidak ditemukan');
    expect(masalah.opsi).toEqual([
      { teks: 'b', skor: 9 },
      { teks: 'c', skor: 4 },
    ]);
  });

  it('menerima opsi yang tepat sama dengan skorMaks', () => {
    const hasil = periksaSkema(skema([BUTIR_LIKERT]), []);
    expect(hasil.masalah).toHaveLength(0);
    expect(hasil.peringatan).toHaveLength(0);
  });

  it('hanya memperingatkan bila opsi tertinggi belum mencapai skorMaks', () => {
    // Skala yang sengaja tidak penuh itu sah — lihat fixture PECAHAN di
    // aggregator.test.ts — jadi ia tidak boleh menghalangi penyimpanan.
    const separuh: Aturan = { jenis: 'peta-opsi', skorMaks: 5, peta: { tengah: 2.5 } };
    const hasil = periksaSkema(skema([{ ...BUTIR_LIKERT, aturan: separuh }]), []);

    expect(hasil.masalah).toHaveLength(0);
    expect(hasil.bolehDisimpan).toBe(true);
    expect(hasil.peringatan).toEqual([
      {
        jenis: 'peta-tidak-mencapai-maks',
        kolomAsal: 'q1',
        label: 'Butir 1',
        skorMaks: 5,
        tertinggi: 2.5,
      },
    ]);
  });

  it('tidak memperingatkan dua kali untuk peta yang juga melampaui', () => {
    const melampaui: Aturan = { jenis: 'peta-opsi', skorMaks: 5, peta: { a: 7 } };
    const hasil = periksaSkema(skema([{ ...BUTIR_LIKERT, aturan: melampaui }]), []);
    expect(hasil.peringatan).toHaveLength(0);
  });

  it('tidak memeriksa peta pada butir yang diabaikan', () => {
    const hasil = periksaSkema(
      skema([{ ...BUTIR_LIKERT, aturan: { jenis: 'abaikan' } }]),
      baris([{ q1: 'apa saja' }]),
    );
    expect(hasil.masalah).toHaveLength(0);
    expect(hasil.peringatan).toHaveLength(0);
  });
});

describe('periksaSkema dan kolom bernama seperti properti Object', () => {
  it('tidak melempar saat sebagian responden tidak punya kolom bernama toString', () => {
    // `Record` mewarisi Object.prototype, sehingga jawaban['toString'] milik
    // responden yang tidak mengisinya adalah fungsi bawaan. Tanpa penjaga,
    // normalisasiTeks melempar TypeError dan seluruh rekap gagal karena satu
    // nama kolom yang kebetulan bentrok.
    const hasil = periksaSkema(
      skema([{ ...BUTIR_LIKERT, kolomAsal: 'toString' }]),
      baris([{ toString: 'Agree' }, { q1: 'Agree' }]),
    );

    expect(hasil.masalah).toHaveLength(0);
    expect(hasil.bolehDisimpan).toBe(true);
  });

  it('tetap melaporkan opsi tak dikenal pada kolom bernama constructor', () => {
    const hasil = periksaSkema(
      skema([{ ...BUTIR_LIKERT, kolomAsal: 'constructor' }]),
      baris([{ constructor: 'Mungkin' }, { q1: 'Agree' }]),
    );

    const masalah = hasil.masalah.find((m) => m.jenis === 'opsi-tak-dikenal');
    if (masalah?.jenis !== 'opsi-tak-dikenal') throw new Error('masalah tidak ditemukan');
    expect(masalah.opsi).toEqual([{ teks: 'Mungkin', jumlahBaris: 1 }]);
  });
});

describe('periksaSkema dengan data kosong', () => {
  it('tetap memeriksa kecacatan skema meski belum ada baris', () => {
    const rusak: Aturan = { jenis: 'peta-opsi', skorMaks: 0, peta: { ya: 1 } };
    const hasil = periksaSkema(skema([{ ...BUTIR_LIKERT, aturan: rusak }]), []);
    expect(hasil.bolehDisimpan).toBe(false);
  });

  it('tidak melaporkan kolom-tidak-ada bila belum ada baris sama sekali', () => {
    const hasil = periksaSkema(skema([BUTIR_LIKERT]), []);
    expect(hasil.masalah.map((m) => m.jenis)).not.toContain('kolom-tidak-ada');
  });
});
