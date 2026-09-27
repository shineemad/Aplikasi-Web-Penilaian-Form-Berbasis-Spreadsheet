import { describe, expect, it } from 'vitest';
import { hitungNilaiResponden } from '../core/aggregator';
import { bangunResponden } from '../core/bangunResponden';
import { hashPalsu } from '../core/__fixtures__/hash';
import { urutkanPeringkat } from '../core/peringkat';
import { bangunRancangan, finalkanSkema } from '../core/rancanganSkema';
import type { RancanganSkema } from '../core/rancanganSkema';
import { bangunNilaiSesi } from '../core/sesi';
import { bacaBerkas } from './importerBerkas';
import { bukuKerjaPostTest } from './__fixtures__/bukuKerja';
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

    const sesi = bangunNilaiSesi({ sesiId: 's1', namaSesi: 'Post-Test' }, petaan.responden, skema);
    expect(sesi.nilai.size).toBe(500);
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
    expect(petaan.waktuKirim.size).toBe(0);
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
  });
});
