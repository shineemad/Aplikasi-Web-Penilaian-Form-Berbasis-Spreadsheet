import { describe, expect, it } from 'vitest';
import { hitungIndeksDimensi } from '../core/aggregator';
import { bangunResponden } from '../core/bangunResponden';
import { deteksiEmailKembar } from '../core/duplikat';
import type { BarisMentah } from '../core/duplikat';
import { hashPalsu } from '../core/__fixtures__/hash';
import { gabungkanSesi, ringkasProyek } from '../core/merger';
import { idResponden } from '../core/normalisasi';
import { periksaSkema } from '../core/periksaSkema';
import { bangunRancangan, finalkanSkema } from '../core/rancanganSkema';
import { bangunNilaiSesi } from '../core/sesi';
import type { Aturan } from '../core/tipe';
import { bacaBerkas } from './importerBerkas';
import { bukuKerjaPostTest, bukuKerjaSesi } from './__fixtures__/bukuKerja';
import type { HasilImpor, Impor } from './tipe';

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

function petakan(impor: HasilImpor) {
  const rancangan = bangunRancangan('skemaPostTest', impor.header, impor.baris);
  rancangan.perlakuanKosong = 'abaikan';

  for (const kolom of rancangan.peran.kolom) {
    if (kolom.peran !== 'belum-diputuskan') continue;
    kolom.peran = kolom.header.startsWith('q') ? 'pertanyaan' : 'meta';
  }
  for (const butir of rancangan.butir) {
    butir.dimensi = dimensiButir(butir.kolomAsal);
    // Usulan kosong untuk q11 (Yes/No/Maybe) dan, pada sesi kecil, untuk kolom
    // yang tidak memuat kelima opsi. Keputusan yang ditiru di sini sama dengan
    // skemaPostTest lama: perlakukan sebagai Likert 5 poin, supaya periksaSkema
    // tetap melaporkan "Maybe" sebagai opsi tak dikenal.
    if (butir.aturan === null) butir.aturan = LIKERT;
  }

  const final = finalkanSkema(rancangan);
  if (final.status !== 'siap') throw new Error('skema seharusnya siap');

  const petaan = bangunResponden(impor.baris, impor.nomorBaris, rancangan.peran, final.skema, hashPalsu);
  return { skema: final.skema, responden: petaan.responden, petaan };
}

function dimensiButir(kolomAsal: string): string {
  const nomor = Number(kolomAsal.replace('q', ''));
  let batas = 0;
  for (const { dimensi, jumlah } of DIMENSI) {
    batas += jumlah;
    if (nomor <= batas) return dimensi;
  }
  return 'lainnya';
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

    const { skema, responden } = petakan(impor);
    const idUnik = new Set(responden.map((r) => r.id));
    expect(idUnik.size).toBe(500);

    const sesi = bangunNilaiSesi({ sesiId: 's1', namaSesi: 'Post-Test' }, responden, skema);
    expect(sesi.nilai.size).toBe(500);
    // Hanya baris ber-"Maybe" (i % 3 === 0, i = 0..498) yang boleh berperingatan:
    // floor(499 / 3) + 1 = 167. Ragam huruf besar-kecil dan spasi tidak boleh menambahnya.
    expect(sesi.peringatan.size).toBe(167);
  });

  it('menahan penyimpanan skema karena butir Yes/No/Maybe belum diputuskan', () => {
    const impor = bacaBerkas(bukuKerjaPostTest(30), 'post-test.xlsx');
    if (impor.status !== 'berhasil') throw new Error('impor seharusnya berhasil');

    const { skema, responden } = petakan(impor);
    const hasil = periksaSkema(skema, responden);
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

    const { skema, responden } = petakan(impor);
    const sesi = bangunNilaiSesi({ sesiId: 's1', namaSesi: 'Post-Test' }, responden, skema);
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

    const { skema: skemaPre, responden: respondenPre } = petakan(imporPre);
    const pre = bangunNilaiSesi({ sesiId: 's1', namaSesi: 'Pre-Test' }, respondenPre, skemaPre);
    const { skema: skemaPost, responden: respondenPost } = petakan(imporPost);
    const post = bangunNilaiSesi({ sesiId: 's2', namaSesi: 'Post-Test' }, respondenPost, skemaPost);

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
    const peserta = { email: 'dewi@example.com', nama: 'Dewi', tingkat: 'Agree' as const };
    const { skema: skemaPre, responden: respondenPre } = petakan(
      berhasil(bacaBerkas(bukuKerjaSesi([peserta], 'xlsx'), 'pre.xlsx')),
    );
    const pre = bangunNilaiSesi({ sesiId: 's1', namaSesi: 'Pre-Test' }, respondenPre, skemaPre);
    const { skema: skemaPost, responden: respondenPost } = petakan(
      berhasil(bacaBerkas(bukuKerjaSesi([{ ...peserta, ganti: { q11: 'Maybe' } }], 'csv'), 'post.csv')),
    );
    const post = bangunNilaiSesi({ sesiId: 's2', namaSesi: 'Post-Test' }, respondenPost, skemaPost);

    const [dewi] = gabungkanSesi([pre, post], { awal: 's1', akhir: 's2' }).baris;
    expect(dewi?.statusGabungan).toBe('lengkap');
    expect(dewi?.peringatanPerSesi['s1']).toEqual([]);
    expect(dewi?.peringatanPerSesi['s2']).toHaveLength(1);
    // Label kini berasal dari header kolom asli ('q11'), seperti yang admin lihat di berkasnya sendiri.
    expect(dewi?.peringatanPerSesi['s2']?.join(' ')).toContain('q11');
  });

  it('menandai orang-orang tanpa email di kedua sesi dengan nomor baris aslinya', () => {
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

    const { skema: skemaPre, responden: respondenPre, petaan: petaanPre } = petakan(imporPre);
    const pre = bangunNilaiSesi({ sesiId: 's1', namaSesi: 'Pre-Test' }, respondenPre, skemaPre);
    const { skema: skemaPost, responden: respondenPost, petaan: petaanPost } = petakan(imporPost);
    const post = bangunNilaiSesi({ sesiId: 's2', namaSesi: 'Post-Test' }, respondenPost, skemaPost);
    gabungkanSesi([pre, post], { awal: 's1', akhir: 's2' });

    // Fajar, Gita, dan Hana berbagi satu id. Sinyalnya harus ada, dan menunjuk baris yang benar.
    expect(petaanPre.barisTanpaEmail).toEqual([3]);
    expect(petaanPost.barisTanpaEmail).toEqual([4, 5]);
    expect(post.dipadatkan.get(idResponden('', hashPalsu))).toBe(2);
  });

  it('menghasilkan indeks untuk kelima dimensi', () => {
    const impor = bacaBerkas(bukuKerjaPostTest(20), 'post-test.xlsx');
    if (impor.status !== 'berhasil') throw new Error('impor seharusnya berhasil');

    const { skema, responden } = petakan(impor);
    const dimensi = hitungIndeksDimensi(responden, skema);
    expect(dimensi).toHaveLength(5);
    for (const d of dimensi) {
      expect(d.indeks).not.toBe(null);
    }
  });
});
