import { describe, expect, it } from 'vitest';
import { hitungNilaiResponden } from '../core/aggregator';
import { bangunResponden } from '../core/bangunResponden';
import { hashPalsu } from '../core/__fixtures__/hash';
import { urutkanPeringkat } from '../core/peringkat';
import { bangunRancangan, finalkanSkema } from '../core/rancanganSkema';
import type { RancanganSkema } from '../core/rancanganSkema';
import { bangunNilaiSesi } from '../core/sesi';
import { bacaBerkas } from './importerBerkas';
import { bukuKerjaPostTest, bukuKerjaSesi } from './__fixtures__/bukuKerja';
import { buatBandingWaktu, tebakFormatTanggal } from './waktu';

function imporPostTest(jumlahBaris: number) {
  const impor = bacaBerkas(bukuKerjaPostTest(jumlahBaris), 'post-test.xlsx');
  if (impor.status !== 'berhasil') throw new Error('impor seharusnya berhasil');
  return impor;
}

/** Mewakili keputusan admin pada layar pemetaan. */
function putuskanSemuanya(rancangan: RancanganSkema): RancanganSkema {
  rancangan.perlakuanKosong = 'abaikan';

  for (const kolom of rancangan.peran.kolom) {
    if (kolom.peran !== 'belum-diputuskan') continue;
    kolom.peran = kolom.header.startsWith('q') ? 'pertanyaan' : 'meta';
  }

  for (const butir of rancangan.butir) {
    butir.dimensi = 'kemudahan';
    if (butir.aturan === null) butir.aturan = { jenis: 'abaikan' };
  }

  return rancangan;
}

/**
 * Satu rancangan dipakai untuk menurunkan skema DAN peta peran. Membangunnya
 * dua kali akan memakai dua objek berbeda dan menyembunyikan ketidakcocokan.
 */
function petakanSemuanya(impor: {
  header: string[];
  baris: Record<string, string>[];
  nomorBaris: number[];
}) {
  const rancangan = putuskanSemuanya(bangunRancangan('skemaA', impor.header, impor.baris));
  const final = finalkanSkema(rancangan);
  if (final.status !== 'siap') throw new Error('skema seharusnya siap');

  const petaan = bangunResponden(
    impor.baris,
    impor.nomorBaris,
    rancangan.peran,
    final.skema,
    hashPalsu,
  );
  return { skema: final.skema, petaan };
}

describe('pemetaan kolom dari berkas nyata', () => {
  it('menaikkan kolom Likert menjadi pertanyaan dan menahan butir Yes/No/Maybe', () => {
    const impor = imporPostTest(30);
    const rancangan = bangunRancangan('skemaA', impor.header, impor.baris);

    const q1 = rancangan.butir.find((b) => b.kolomAsal === 'q1');
    expect(q1?.aturan).not.toBe(null);

    const q11 = rancangan.butir.find((b) => b.kolomAsal === 'q11');
    expect(q11?.aturan).toBe(null);
    expect(q11?.contohNilai.join(' ')).toContain('Maybe');
  });

  it('tidak menebak skala pada sesi kecil yang tidak memuat kelima opsi', () => {
    // Tiga peserta hanya memakai tiga tingkat; skala 5 poin dan 3 poin sama-sama mungkin.
    const impor = bacaBerkas(
      bukuKerjaSesi(
        [
          { email: 'a@example.com', nama: 'A', tingkat: 'Disagree' },
          { email: 'b@example.com', nama: 'B', tingkat: 'Neutral' },
          { email: 'c@example.com', nama: 'C', tingkat: 'Agree' },
        ],
        'xlsx',
      ),
      'kecil.xlsx',
    );
    if (impor.status !== 'berhasil') throw new Error('impor seharusnya berhasil');
    const rancangan = bangunRancangan('skemaA', impor.header, impor.baris);

    const q1 = rancangan.butir.find((b) => b.kolomAsal === 'q1');
    expect(q1?.aturan).toBe(null);
    expect(q1?.alasan).toContain('5 poin');
    expect(q1?.contohNilai).toHaveLength(3);
    expect(rancangan.peran.kolom.find((k) => k.header === 'q1')?.peran).toBe('belum-diputuskan');
  });

  it('mengenali Email dan Name tanpa diberi tahu', () => {
    const impor = imporPostTest(5);
    const rancangan = bangunRancangan('skemaA', impor.header, impor.baris);
    const peran = new Map(rancangan.peran.kolom.map((k) => [k.header, k.peran]));

    expect(peran.get('Email')).toBe('email');
    expect(peran.get('Name')).toBe('nama');
  });

  it('menolak finalisasi selama butir Yes/No/Maybe belum diputuskan', () => {
    const impor = imporPostTest(30);
    const rancangan = bangunRancangan('skemaA', impor.header, impor.baris);
    rancangan.perlakuanKosong = 'abaikan';
    for (const butir of rancangan.butir) butir.dimensi = 'kemudahan';

    const hasil = finalkanSkema(rancangan);
    expect(hasil.status).toBe('belum-lengkap');
    if (hasil.status !== 'belum-lengkap') return;
    expect(hasil.masalah.map((m) => m.jenis)).toContain('peran-belum-diputuskan');
  });

  it('menghasilkan Skema setelah seluruh keputusan diambil', () => {
    const impor = imporPostTest(30);
    const hasil = finalkanSkema(putuskanSemuanya(bangunRancangan('skemaA', impor.header, impor.baris)));

    expect(hasil.status).toBe('siap');
    if (hasil.status !== 'siap') return;
    expect(hasil.skema.butir).toHaveLength(20);
    expect(hasil.skema.perlakuanKosong).toBe('abaikan');
  });
});

describe('dari berkas ke nilai tanpa kode uji yang ikut memetakan', () => {
  it('menilai 500 baris lewat jalur pemetaan sungguhan', () => {
    const impor = imporPostTest(500);
    const { skema, petaan } = petakanSemuanya(impor);

    expect(petaan.tanpaKolomEmail).toBe(false);
    expect(petaan.responden).toHaveLength(500);
    expect(petaan.barisTanpaEmail).toHaveLength(0);

    // peserta0 (baris pertama, i=0) menjawab TINGKAT[(i+n)%5] untuk tiap q1..q20
    // kecuali q11 (sebagian baris diisi "Maybe" sehingga aturannya jadi abaikan,
    // bukan Likert). Skor mentah 19 butir yang tersisa (Strongly disagree=1 ...
    // Strongly agree=5) berjumlah 58 dari skor maksimum 5 per butir, sehingga
    // nilai = (58/5) / 19 x 100 = 1160/19.
    const peserta0 = petaan.responden[0];
    if (peserta0 === undefined) throw new Error('baris pertama seharusnya ada');
    const nilaiPeserta0 = hitungNilaiResponden(peserta0, skema);
    expect(nilaiPeserta0.butirTerhitung).toBe(19);
    expect(nilaiPeserta0.nilai).not.toBe(null);
    expect(nilaiPeserta0.nilai).toBeCloseTo(1160 / 19, 8);

    const sesi = bangunNilaiSesi({ sesiId: 's1', namaSesi: 'Post-Test' }, petaan.responden, skema);
    expect(sesi.nilai.size).toBe(500);

    // q11 beraturan abaikan tidak pernah menghasilkan peringatan (skorMaksAturan
    // mengembalikan null untuknya sebelum jawabannya sempat diperiksa), dan
    // seluruh butir lain selalu diisi varian penulisan yang dikenali skalanya —
    // jadi tidak ada satu pun dari 500 responden yang membawa peringatan.
    expect(sesi.peringatan.size).toBe(0);
  });

  it('memisahkan kolom meta dari kolom jawaban', () => {
    const { petaan } = petakanSemuanya(imporPostTest(10));

    const satu = petaan.responden[0];
    expect(satu?.meta['Gender']).toBeDefined();
    expect(satu?.meta['Age']).toBeDefined();
    expect(satu?.jawaban['Gender']).toBeUndefined();
    expect(satu?.jawaban['q1']).toBeDefined();
  });

  it('tidak mencatat cap waktu bila berkasnya memang tidak punya kolom itu', () => {
    // Fixture Post-Test tidak memuat kolom Timestamp. Peta peran harus
    // menerimanya tanpa mengarang cap waktu dari kolom lain.
    const { petaan } = petakanSemuanya(imporPostTest(10));
    expect(petaan.waktuKirim).toHaveLength(10);
    expect(petaan.waktuKirim.every((satu) => satu === null)).toBe(true);
  });
});

describe('peringkat memakai cap waktu yang baru terpetakan', () => {
  it('mengurutkan dengan pemecah seri dari cap waktu berkas', () => {
    const capWaktu = ['25/4/2026 08:00:00', '25/4/2026 09:00:00', '26/4/2026 08:00:00'];
    const format = tebakFormatTanggal(capWaktu);
    expect(format.status).toBe('yakin');
    if (format.status !== 'yakin') return;

    const banding = buatBandingWaktu(format.format);
    const hasil = urutkanPeringkat(
      [
        { respondenId: 'telat', nilai: 80, jumlahTerjawab: 20, waktuKirim: capWaktu[1] ?? null },
        { respondenId: 'awal', nilai: 80, jumlahTerjawab: 20, waktuKirim: capWaktu[0] ?? null },
        { respondenId: 'tertinggi', nilai: 95, jumlahTerjawab: 20, waktuKirim: capWaktu[2] ?? null },
      ],
      banding,
    );

    expect(hasil.map((h) => h.respondenId)).toEqual(['tertinggi', 'awal', 'telat']);
  });

  it('memberi peringkat dari nilai sesi yang benar-benar dihitung', () => {
    const { skema, petaan } = petakanSemuanya(imporPostTest(20));

    const baris = petaan.responden.map((satu) => {
      const nilai = hitungNilaiResponden(satu, skema);
      return {
        respondenId: satu.id,
        nilai: nilai.nilai,
        jumlahTerjawab: nilai.butirTerhitung,
        waktuKirim: null,
      };
    });

    const hasil = urutkanPeringkat(baris, () => 0);
    expect(hasil).toHaveLength(20);
    expect(hasil[0]?.peringkat).toBe(1);
    for (const satu of hasil) expect(satu.peringkat).not.toBe(null);

    // Bukan cuma "tidak ada peringkat null": urutannya harus benar-benar
    // mengikuti nilai yang dihitung. Tiap baris tidak boleh lebih besar dari
    // baris sebelumnya (non-increasing), dan baris berperingkat 1 harus
    // benar-benar memegang nilai tertinggi yang muncul di data — diturunkan
    // dari hasilnya sendiri saat dijalankan, bukan angka fixture yang di-hardcode.
    const nilaiTerurut: number[] = [];
    for (const satu of hasil) {
      expect(satu.nilai).not.toBe(null);
      if (satu.nilai !== null) nilaiTerurut.push(satu.nilai);
    }
    for (let i = 0; i + 1 < nilaiTerurut.length; i += 1) {
      const sekarang = nilaiTerurut[i];
      const berikut = nilaiTerurut[i + 1];
      if (sekarang === undefined || berikut === undefined) continue;
      expect(sekarang).toBeGreaterThanOrEqual(berikut);
    }
    expect(hasil[0]?.nilai).toBeCloseTo(Math.max(...nilaiTerurut), 8);
  });
});
