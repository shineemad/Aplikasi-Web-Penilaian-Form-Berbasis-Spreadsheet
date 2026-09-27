import { describe, expect, it } from 'vitest';
import { hitungIndeksDimensi } from '../core/aggregator';
import { deteksiEmailKembar, deteksiEmailKosong } from '../core/duplikat';
import type { BarisMentah } from '../core/duplikat';
import { hashPalsu } from '../core/__fixtures__/hash';
import { gabungkanSesi, ringkasProyek } from '../core/merger';
import { idResponden } from '../core/normalisasi';
import { periksaSkema } from '../core/periksaSkema';
import { bangunNilaiSesi } from '../core/sesi';
import type { RespondenSesi } from '../core/sesi';
import type { Aturan, ButirSkema, Skema } from '../core/tipe';
import { bacaBerkas } from './importerBerkas';
import { bukuKerjaPostTest, bukuKerjaSesi } from './__fixtures__/bukuKerja';
import type { BarisImpor, HasilImpor, Impor } from './tipe';

// Kunci ditulis satu bentuk saja; berkasnya memuat "Strongly Agree", "strongly  agree",
// "AGREE", " neutral", dan seterusnya. Semuanya harus cocok lewat normalisasi.
const LIKERT: Aturan = {
  jenis: 'peta-opsi',
  skorMaks: 5,
  peta: {
    'Strongly disagree': 1,
    Disagree: 2,
    Neutral: 3,
    Agree: 4,
    'Strongly agree': 5,
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

function berhasil(impor: Impor): HasilImpor {
  if (impor.status !== 'berhasil') throw new Error(`impor seharusnya berhasil: ${impor.pesan}`);
  return impor;
}

function keBarisMentah(impor: HasilImpor): BarisMentah[] {
  return impor.baris.map((satu, i) => {
    const nomorBaris = impor.nomorBaris[i];
    if (nomorBaris === undefined) throw new Error('nomor baris asal seharusnya ada');
    return { nomorBaris, email: satu['Email'] === undefined ? '' : satu['Email'] };
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
    // Hanya baris ber-"Maybe" (i % 3 === 0, i = 0..498) yang boleh berperingatan:
    // floor(499 / 3) + 1 = 167. Ragam huruf besar-kecil dan spasi tidak boleh menambahnya.
    expect(sesi.peringatan.size).toBe(167);
  });

  it('menahan penyimpanan skema karena butir Yes/No/Maybe belum diputuskan', () => {
    const impor = bacaBerkas(bukuKerjaPostTest(30), 'post-test.xlsx');
    if (impor.status !== 'berhasil') throw new Error('impor seharusnya berhasil');

    const hasil = periksaSkema(skemaPostTest(), keResponden(impor.baris));
    expect(hasil.bolehDisimpan).toBe(false);
    // Satu-satunya masalah adalah q11; ragam penulisan butir lain cocok lewat normalisasi.
    expect(hasil.masalah).toHaveLength(1);

    const masalah = hasil.masalah.find((m) => m.jenis === 'opsi-tak-dikenal');
    expect(masalah).toBeDefined();
    if (masalah?.jenis === 'opsi-tak-dikenal') {
      expect(masalah.kolomAsal).toBe('q11');
      expect(masalah.opsi[0]?.teks).toBe('Maybe');
      // i % 3 === 0 untuk i = 0..29: 0, 3, ..., 27 = 10 baris.
      expect(masalah.opsi[0]?.jumlahBaris).toBe(10);
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
    const impor = berhasil(bacaBerkas(bukuKerjaPostTest(5), 'post-test.xlsx'));

    const mentah = keBarisMentah(impor);
    expect(mentah.map((m) => m.nomorBaris)).toEqual([2, 3, 4, 5, 6]);
    expect(deteksiEmailKembar(mentah)).toHaveLength(0);

    mentah.push({ nomorBaris: 7, email: 'PESERTA0@EXAMPLE.COM' });
    const konflik = deteksiEmailKembar(mentah);
    expect(konflik).toHaveLength(1);
    expect(konflik[0]?.jumlah).toBe(2);
    expect(konflik[0]?.nomorBaris).toEqual([2, 7]);
  });

  it('menggabungkan dua sesi dan hanya merata-ratakan selisih peserta lengkap', () => {
    const skema = skemaPostTest();

    // Nilai = tingkat / 5 × 100 karena seluruh butir dijawab setingkat.
    const imporPre = berhasil(
      bacaBerkas(
        bukuKerjaSesi(
          [
            { email: 'budi@example.com', nama: 'Budi', tingkat: 'Disagree' }, //         40
            { email: 'Siti@Example.com', nama: 'Siti', tingkat: 'Neutral' }, //          60
            { email: 'andi@example.com', nama: '', tingkat: 'Strongly disagree' }, //    20, hanya Pre
            { email: 'dewi@example.com', nama: 'Dewi', tingkat: 'Agree' }, //            80
          ],
          'xlsx',
        ),
        'pre.xlsx',
      ),
    );
    const imporPost = berhasil(
      bacaBerkas(
        bukuKerjaSesi(
          [
            { email: 'BUDI@Example.com', nama: 'Budi', tingkat: 'Strongly agree' }, //  100
            { email: ' siti@example.com', nama: 'Siti', tingkat: 'Agree' }, //           80
            null,
            // Butir 11 tak dikenal dan diabaikan; 19 butir Agree tetap 80.
            { email: 'dewi@example.com', nama: 'Dewi', tingkat: 'Agree', ganti: { q11: 'Maybe' } },
            { email: 'eko@example.com', nama: 'Eko', tingkat: 'Neutral' }, //            60, hanya Post
          ],
          'csv',
        ),
        'post.csv',
      ),
    );
    expect(imporPost.nomorBaris).toEqual([2, 3, 5, 6]);

    const pre = bangunNilaiSesi({ sesiId: 's1', namaSesi: 'Pre-Test' }, keResponden(imporPre.baris), skema);
    const post = bangunNilaiSesi({ sesiId: 's2', namaSesi: 'Post-Test' }, keResponden(imporPost.baris), skema);

    const hasil = gabungkanSesi([pre, post], { awal: 's1', akhir: 's2' });
    // Budi, Siti, Andi, Dewi, Eko. Tujuh baris berarti email beda huruf gagal dipasangkan.
    expect(hasil.baris).toHaveLength(5);

    const cari = (email: string) => hasil.baris.find((b) => b.id === idResponden(email, hashPalsu));
    expect(cari('budi@example.com')?.statusGabungan).toBe('lengkap');
    expect(Number(cari('budi@example.com')?.selisih)).toBeCloseTo(60, 8);
    expect(cari('siti@example.com')?.statusGabungan).toBe('lengkap');
    expect(Number(cari('siti@example.com')?.selisih)).toBeCloseTo(20, 8);
    expect(Number(cari('dewi@example.com')?.selisih)).toBeCloseTo(0, 8);

    const eko = cari('eko@example.com');
    expect(eko?.statusGabungan).toBe('sebagian:Post-Test');
    expect(eko?.nilaiPerSesi['s1']).toBe(null);
    expect(eko?.selisih).toBe(null);
    expect(cari('andi@example.com')?.statusGabungan).toBe('sebagian:Pre-Test');
    expect(cari('andi@example.com')?.selisih).toBe(null);

    const ringkasan = ringkasProyek(hasil, [pre, post]);
    expect(ringkasan.jumlahLengkap).toBe(3);
    expect(ringkasan.jumlahTidakLengkap).toBe(2);
    // (60 + 20 + 0) / 3. Bila Andi atau Eko ikut terhitung, angkanya berubah.
    expect(Number(ringkasan.rataSelisih)).toBeCloseTo(80 / 3, 8);
    // Pre: (40 + 60 + 20 + 80) / 4 = 50. Post: (100 + 80 + 80 + 60) / 4 = 80.
    expect(Number(ringkasan.perSesi[0]?.rataNilai)).toBeCloseTo(50, 8);
    expect(Number(ringkasan.perSesi[1]?.rataNilai)).toBeCloseTo(80, 8);
  });

  it('membawa peringatan Post-Test sampai ke baris gabungan', () => {
    const skema = skemaPostTest();
    const peserta = { email: 'dewi@example.com', nama: 'Dewi', tingkat: 'Agree' as const };
    const pre = bangunNilaiSesi(
      { sesiId: 's1', namaSesi: 'Pre-Test' },
      keResponden(berhasil(bacaBerkas(bukuKerjaSesi([peserta], 'xlsx'), 'pre.xlsx')).baris),
      skema,
    );
    const post = bangunNilaiSesi(
      { sesiId: 's2', namaSesi: 'Post-Test' },
      keResponden(
        berhasil(bacaBerkas(bukuKerjaSesi([{ ...peserta, ganti: { q11: 'Maybe' } }], 'csv'), 'post.csv')).baris,
      ),
      skema,
    );

    const [dewi] = gabungkanSesi([pre, post], { awal: 's1', akhir: 's2' }).baris;
    expect(dewi?.statusGabungan).toBe('lengkap');
    expect(dewi?.peringatanPerSesi['s1']).toEqual([]);
    expect(dewi?.peringatanPerSesi['s2']).toHaveLength(1);
    expect(dewi?.peringatanPerSesi['s2']?.join(' ')).toContain('Butir 11');
  });

  it('menandai orang-orang tanpa email di kedua sesi dengan nomor baris aslinya', () => {
    const skema = skemaPostTest();
    const imporPre = berhasil(
      bacaBerkas(
        bukuKerjaSesi(
          [
            { email: 'a@example.com', nama: 'A', tingkat: 'Agree' },
            { email: '', nama: 'Fajar', tingkat: 'Strongly disagree' },
          ],
          'xlsx',
        ),
        'pre.xlsx',
      ),
    );
    const imporPost = berhasil(
      bacaBerkas(
        bukuKerjaSesi(
          [
            { email: 'a@example.com', nama: 'A', tingkat: 'Agree' },
            null,
            { email: '', nama: 'Gita', tingkat: 'Strongly agree' },
            { email: '   ', nama: 'Hana', tingkat: 'Neutral' },
          ],
          'csv',
        ),
        'post.csv',
      ),
    );

    const pre = bangunNilaiSesi({ sesiId: 's1', namaSesi: 'Pre-Test' }, keResponden(imporPre.baris), skema);
    const post = bangunNilaiSesi({ sesiId: 's2', namaSesi: 'Post-Test' }, keResponden(imporPost.baris), skema);
    gabungkanSesi([pre, post], { awal: 's1', akhir: 's2' });

    // Fajar, Gita, dan Hana berbagi satu id. Sinyalnya harus ada, dan menunjuk baris yang benar.
    expect(deteksiEmailKosong(keBarisMentah(imporPre))).toEqual([3]);
    expect(deteksiEmailKosong(keBarisMentah(imporPost))).toEqual([4, 5]);
    expect(post.dipadatkan.get(idResponden('', hashPalsu))).toBe(2);
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
