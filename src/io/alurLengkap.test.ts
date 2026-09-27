import { describe, expect, it } from 'vitest';
import { hitungIndeksDimensi } from '../core/aggregator';
import { deteksiEmailKembar } from '../core/duplikat';
import { hashPalsu } from '../core/__fixtures__/hash';
import { gabungkanSesi, ringkasProyek } from '../core/merger';
import { idResponden } from '../core/normalisasi';
import { periksaSkema } from '../core/periksaSkema';
import { bangunNilaiSesi } from '../core/sesi';
import type { RespondenSesi } from '../core/sesi';
import type { Aturan, ButirSkema, Skema } from '../core/tipe';
import { bacaBerkas } from './importerBerkas';
import { bukuKerjaPostTest } from './__fixtures__/bukuKerja';
import type { BarisImpor } from './tipe';

const LIKERT: Aturan = {
  jenis: 'peta-opsi',
  skorMaks: 5,
  peta: {
    'Strongly disagree': 1,
    Disagree: 2,
    Neutral: 3,
    Agree: 4,
    'Strongly Agree': 5,
  },
};

const DIMENSI = [
  { dimensi: 'kebermanfaatan', jumlah: 5 },
  { dimensi: 'kemudahan', jumlah: 5 },
  { dimensi: 'dayaTarik', jumlah: 4 },
  { dimensi: 'relevansi', jumlah: 3 },
  { dimensi: 'kepuasan', jumlah: 3 },
];

function skemaPostTest(): Skema {
  const butir: ButirSkema[] = [];
  let nomor = 1;
  for (const { dimensi, jumlah } of DIMENSI) {
    for (let i = 0; i < jumlah; i += 1) {
      butir.push({ kolomAsal: `q${nomor}`, label: `Butir ${nomor}`, dimensi, aturan: LIKERT, bobot: 1 });
      nomor += 1;
    }
  }
  return { skemaId: 'postTest', perlakuanKosong: 'abaikan', butir };
}

const KOLOM_META = ['Age', 'Gender'];

function keResponden(baris: BarisImpor[]): RespondenSesi[] {
  return baris.map((satu) => {
    const email = satu['Email'] === undefined ? '' : satu['Email'];
    const nama = satu['Name'] === undefined || satu['Name'] === '' ? null : satu['Name'];
    const meta: Record<string, string> = {};
    for (const kolom of KOLOM_META) {
      const nilai = satu[kolom];
      if (nilai !== undefined) meta[kolom] = nilai;
    }
    const jawaban: Record<string, string> = {};
    for (const [kolom, nilai] of Object.entries(satu)) {
      if (kolom === 'Email' || kolom === 'Name' || KOLOM_META.includes(kolom)) continue;
      jawaban[kolom] = nilai;
    }
    return { id: idResponden(email, hashPalsu), email, nama, jawaban, meta };
  });
}

describe('alur berkas ke nilai', () => {
  it('membaca 500 baris dan menilainya tanpa error', () => {
    const impor = bacaBerkas(bukuKerjaPostTest(500), 'post-test.xlsx');
    expect(impor.status).toBe('berhasil');
    if (impor.status !== 'berhasil') return;

    expect(impor.baris).toHaveLength(500);

    const responden = keResponden(impor.baris);
    const idUnik = new Set(responden.map((r) => r.id));
    expect(idUnik.size).toBe(500);

    const sesi = bangunNilaiSesi({ sesiId: 's1', namaSesi: 'Post-Test' }, responden, skemaPostTest());
    expect(sesi.nilai.size).toBe(500);
  });

  it('menahan penyimpanan skema karena butir Yes/No/Maybe belum diputuskan', () => {
    const impor = bacaBerkas(bukuKerjaPostTest(30), 'post-test.xlsx');
    if (impor.status !== 'berhasil') throw new Error('impor seharusnya berhasil');

    const hasil = periksaSkema(skemaPostTest(), keResponden(impor.baris));
    expect(hasil.bolehDisimpan).toBe(false);

    const masalah = hasil.masalah.find((m) => m.jenis === 'opsi-tak-dikenal');
    expect(masalah).toBeDefined();
    if (masalah?.jenis === 'opsi-tak-dikenal') {
      expect(masalah.kolomAsal).toBe('q11');
      expect(masalah.opsi[0]?.teks).toBe('Maybe');
    }
  });

  it('membawa kolom meta dan nama kosong sampai ke tabel gabungan', () => {
    const impor = bacaBerkas(bukuKerjaPostTest(10), 'post-test.xlsx');
    if (impor.status !== 'berhasil') throw new Error('impor seharusnya berhasil');

    const responden = keResponden(impor.baris);
    const sesi = bangunNilaiSesi({ sesiId: 's1', namaSesi: 'Post-Test' }, responden, skemaPostTest());
    const { baris } = gabungkanSesi([sesi]);

    expect(baris).toHaveLength(10);
    const tanpaNama = baris.filter((b) => b.nama === null);
    expect(tanpaNama.length).toBeGreaterThan(0);
    expect(baris[0]?.meta['Gender']).toBeDefined();
  });

  it('menemukan email kembar pada baris mentah', () => {
    const impor = bacaBerkas(bukuKerjaPostTest(5), 'post-test.xlsx');
    if (impor.status !== 'berhasil') throw new Error('impor seharusnya berhasil');

    const mentah = impor.baris.map((satu, i) => ({
      nomorBaris: i + 2,
      email: satu['Email'] === undefined ? '' : satu['Email'],
    }));
    expect(deteksiEmailKembar(mentah)).toHaveLength(0);

    mentah.push({ nomorBaris: 7, email: 'PESERTA0@EXAMPLE.COM' });
    const konflik = deteksiEmailKembar(mentah);
    expect(konflik).toHaveLength(1);
    expect(konflik[0]?.jumlah).toBe(2);
  });

  it('menggabungkan dua sesi dan hanya merata-ratakan selisih peserta lengkap', () => {
    const skema = skemaPostTest();

    const imporPre = bacaBerkas(bukuKerjaPostTest(10), 'pre.xlsx');
    const imporPost = bacaBerkas(bukuKerjaPostTest(6), 'post.xlsx');
    if (imporPre.status !== 'berhasil' || imporPost.status !== 'berhasil') {
      throw new Error('impor seharusnya berhasil');
    }

    const pre = bangunNilaiSesi({ sesiId: 's1', namaSesi: 'Pre-Test' }, keResponden(imporPre.baris), skema);
    const post = bangunNilaiSesi({ sesiId: 's2', namaSesi: 'Post-Test' }, keResponden(imporPost.baris), skema);

    const hasil = gabungkanSesi([pre, post], { awal: 's1', akhir: 's2' });
    expect(hasil.baris).toHaveLength(10);

    const ringkasan = ringkasProyek(hasil, [pre, post]);
    expect(ringkasan.jumlahLengkap).toBe(6);
    expect(ringkasan.jumlahTidakLengkap).toBe(4);
  });

  it('menghasilkan indeks untuk kelima dimensi', () => {
    const impor = bacaBerkas(bukuKerjaPostTest(20), 'post-test.xlsx');
    if (impor.status !== 'berhasil') throw new Error('impor seharusnya berhasil');

    const dimensi = hitungIndeksDimensi(keResponden(impor.baris), skemaPostTest());
    expect(dimensi).toHaveLength(5);
    for (const d of dimensi) {
      expect(d.indeks).not.toBe(null);
    }
  });
});
