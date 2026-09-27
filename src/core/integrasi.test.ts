import { describe, expect, it } from 'vitest';
import {
  hitungIndeksDimensi,
  hitungIndeksKeseluruhan,
  hitungNilaiResponden,
} from './aggregator';
import { gabungkanSesi, ringkasProyek } from './merger';
import type { NilaiSesi } from './merger';
import { idResponden } from './normalisasi';
import { jawabanSeragam, skemaPostTest } from './__fixtures__/postTest';
import { hashPalsu } from './__fixtures__/hash';
import type { JawabanResponden } from './tipe';

function buatResponden(email: string, nama: string | null, jawaban: Record<string, string>): JawabanResponden {
  return { id: idResponden(email, hashPalsu), email, nama, jawaban };
}

describe('instrumen Post-Test nyata', () => {
  it('memberi nilai 100 untuk responden yang menjawab "Strongly Agree" di semua butir', () => {
    const responden = buatResponden('budi@example.com', 'Budi', jawabanSeragam('Strongly Agree'));
    const hasil = hitungNilaiResponden(responden, skemaPostTest('abaikan'));
    expect(hasil.nilai).toBeCloseTo(100, 10);
    expect(hasil.butirTerhitung).toBe(20);
    expect(hasil.peringatan).toHaveLength(0);
  });

  it('memberi nilai sama untuk "Strongly agree" dan "Strongly Agree"', () => {
    const skema = skemaPostTest('abaikan');
    const besar = buatResponden('a@example.com', 'A', jawabanSeragam('Strongly Agree'));
    const kecil = buatResponden('b@example.com', 'B', jawabanSeragam('Strongly agree'));
    const nilaiBesar = hitungNilaiResponden(besar, skema).nilai;
    const nilaiKecil = hitungNilaiResponden(kecil, skema).nilai;
    expect(nilaiBesar).not.toBe(null);
    expect(Number(nilaiBesar)).toBeCloseTo(Number(nilaiKecil), 10);
  });

  it('memberi 20 bukan 0 untuk responden yang menjawab minimum di semua butir', () => {
    const responden = buatResponden('c@example.com', 'C', jawabanSeragam('Strongly disagree'));
    expect(hitungNilaiResponden(responden, skemaPostTest('abaikan')).nilai).toBeCloseTo(20, 10);
  });

  it('memunculkan peringatan untuk butir Yes/No/Maybe dan tidak memberinya angka', () => {
    const jawaban = jawabanSeragam('Agree');
    jawaban['q11'] = 'Maybe';
    const responden = buatResponden('d@example.com', 'D', jawaban);
    const hasil = hitungNilaiResponden(responden, skemaPostTest('abaikan'));

    expect(hasil.peringatan).toHaveLength(1);
    expect(hasil.peringatan.join(' ')).toContain('Butir 11');
    expect(hasil.butirTerhitung).toBe(19);
    // 19 butir bernilai 4 dari 5 = 80 persen. Butir ke-11 tidak menyeret nilai ke bawah.
    expect(hasil.nilai).toBeCloseTo(80, 10);
  });

  it('tetap memproses responden yang namanya kosong', () => {
    const responden = buatResponden('e@example.com', null, jawabanSeragam('Agree'));
    const hasil = hitungNilaiResponden(responden, skemaPostTest('abaikan'));
    expect(responden.nama).toBe(null);
    expect(hasil.nilai).toBeCloseTo(80, 10);
  });

  it('memberi indeks 100 persen di seluruh lima dimensi bila semua menjawab maksimum', () => {
    const semua = [
      buatResponden('f@example.com', 'F', jawabanSeragam('Strongly Agree')),
      buatResponden('g@example.com', null, jawabanSeragam('Strongly Agree')),
    ];
    const skema = skemaPostTest('abaikan');
    const dimensi = hitungIndeksDimensi(semua, skema);

    expect(dimensi.map((d) => d.dimensi)).toEqual([
      'kebermanfaatan',
      'kemudahan',
      'dayaTarik',
      'relevansi',
      'kepuasan',
    ]);
    for (const d of dimensi) {
      expect(d.indeks).toBeCloseTo(100, 10);
    }
    expect(Number(hitungIndeksKeseluruhan(dimensi, skema))).toBeCloseTo(100, 10);
  });

  it('menyelesaikan 500 responden tanpa error', () => {
    const skema = skemaPostTest('abaikan');
    const semua: JawabanResponden[] = [];
    const opsi = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];
    for (let i = 0; i < 500; i += 1) {
      const pilihan = opsi[i % opsi.length];
      semua.push(
        buatResponden(`peserta${i}@example.com`, i % 7 === 0 ? null : `Peserta ${i}`, jawabanSeragam(pilihan === undefined ? 'Agree' : pilihan)),
      );
    }

    const idUnik = new Set(semua.map((r) => r.id));
    expect(idUnik.size).toBe(500);

    const nilai = semua.map((r) => hitungNilaiResponden(r, skema));
    expect(nilai).toHaveLength(500);
    for (const n of nilai) {
      expect(n.nilai).not.toBe(null);
    }
    expect(hitungIndeksDimensi(semua, skema)).toHaveLength(5);
  });
});

describe('penggabungan Pre-Test dan Post-Test', () => {
  it('mengenali orang yang sama meski emailnya beda huruf besar-kecil antar sesi', () => {
    const skema = skemaPostTest('abaikan');

    const diPre = buatResponden('Budi@Example.COM', 'Budi', jawabanSeragam('Neutral'));
    const diPost = buatResponden('budi@example.com', 'Budi', jawabanSeragam('Strongly Agree'));
    expect(diPre.id).toBe(diPost.id);

    const pre: NilaiSesi = {
      sesiId: 's1',
      namaSesi: 'Pre-Test',
      skemaId: skema.skemaId,
      nilai: new Map([[diPre.id, hitungNilaiResponden(diPre, skema).nilai]]),
      identitas: new Map([[diPre.id, { email: diPre.email, nama: diPre.nama }]]),
    };
    const post: NilaiSesi = {
      sesiId: 's2',
      namaSesi: 'Post-Test',
      skemaId: skema.skemaId,
      nilai: new Map([[diPost.id, hitungNilaiResponden(diPost, skema).nilai]]),
      identitas: new Map([[diPost.id, { email: diPost.email, nama: diPost.nama }]]),
    };

    const hasil = gabungkanSesi([pre, post], { awal: 's1', akhir: 's2' });
    expect(hasil.baris).toHaveLength(1);
    expect(hasil.baris[0]?.statusGabungan).toBe('lengkap');
    // Neutral = 3/5 = 60, Strongly Agree = 5/5 = 100
    expect(hasil.baris[0]?.selisih).not.toBe(null);
    expect(Number(hasil.baris[0]?.selisih)).toBeCloseTo(40, 8);
  });

  it('tidak membuang peserta yang hanya ikut Post-Test dan tidak menghitungnya sebagai nol', () => {
    const skema = skemaPostTest('abaikan');
    const budi = buatResponden('budi@example.com', 'Budi', jawabanSeragam('Agree'));
    const andi = buatResponden('andi@example.com', 'Andi', jawabanSeragam('Agree'));

    const pre: NilaiSesi = {
      sesiId: 's1',
      namaSesi: 'Pre-Test',
      skemaId: skema.skemaId,
      nilai: new Map([[budi.id, 40]]),
      identitas: new Map([[budi.id, { email: budi.email, nama: budi.nama }]]),
    };
    const post: NilaiSesi = {
      sesiId: 's2',
      namaSesi: 'Post-Test',
      skemaId: skema.skemaId,
      nilai: new Map([
        [budi.id, 80],
        [andi.id, 90],
      ]),
      identitas: new Map([
        [budi.id, { email: budi.email, nama: budi.nama }],
        [andi.id, { email: andi.email, nama: andi.nama }],
      ]),
    };

    const hasil = gabungkanSesi([pre, post], { awal: 's1', akhir: 's2' });
    const barisAndi = hasil.baris.find((b) => b.id === andi.id);

    expect(barisAndi).toBeDefined();
    expect(barisAndi?.nilaiPerSesi['s1']).toBe(null);
    expect(barisAndi?.nilaiPerSesi['s1']).not.toBe(0);
    expect(barisAndi?.selisih).toBe(null);
    expect(barisAndi?.statusGabungan).toBe('sebagian:Post-Test');

    const ringkasan = ringkasProyek(hasil, [pre, post]);
    // Rata-rata selisih hanya dari Budi yang lengkap, bukan dicampur dengan Andi.
    expect(ringkasan.rataSelisih).toBeCloseTo(40, 10);
    expect(ringkasan.jumlahTidakLengkap).toBe(1);
  });
});
