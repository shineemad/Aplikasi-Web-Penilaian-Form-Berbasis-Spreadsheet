import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { hitungIndeksDimensi, hitungIndeksKeseluruhan } from '../core/aggregator';
import { bangunResponden } from '../core/bangunResponden';
import { hashPalsu } from '../core/__fixtures__/hash';
import { gabungkanSesi } from '../core/merger';
import { bangunRancangan, finalkanSkema } from '../core/rancanganSkema';
import type { RancanganSkema } from '../core/rancanganSkema';
import { bangunNilaiSesi } from '../core/sesi';
import { bangunTabelGabungan, bangunTabelRingkasan } from '../core/tabelTampil';
import { TANDA_KOSONG } from '../core/penyajian';
import { tulisExcel } from './eksporExcel';
import { tulisPdf } from './eksporPdf';
import { bacaBerkas } from './importerBerkas';
import { bukuKerjaPostTest } from './__fixtures__/bukuKerja';

const OPSI = { desimal: 1, anonim: false, adaPembanding: false };

function putuskan(rancangan: RancanganSkema): RancanganSkema {
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

function siapkan(jumlahBaris: number) {
  const impor = bacaBerkas(bukuKerjaPostTest(jumlahBaris), 'post-test.xlsx');
  if (impor.status !== 'berhasil') throw new Error('impor seharusnya berhasil');

  const rancangan = putuskan(bangunRancangan('skemaA', impor.header, impor.baris));
  const final = finalkanSkema(rancangan);
  if (final.status !== 'siap') throw new Error('skema seharusnya siap');

  const petaan = bangunResponden(
    impor.baris,
    impor.nomorBaris,
    rancangan.peran,
    final.skema,
    hashPalsu,
  );
  const sesi = bangunNilaiSesi({ sesiId: 's1', namaSesi: 'Post-Test' }, petaan.responden, final.skema);
  return { gabungan: gabungkanSesi([sesi]), responden: petaan.responden, skema: final.skema };
}

function bacaLembar(isi: ArrayBuffer, nama: string): string[][] {
  const buku = XLSX.read(isi, { type: 'array' });
  const lembar = buku.Sheets[nama];
  if (lembar === undefined) throw new Error(`lembar "${nama}" tidak ada`);
  return XLSX.utils.sheet_to_json<string[]>(lembar, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });
}

describe('ekspor dari berkas nyata', () => {
  it('menghasilkan angka Excel yang identik dengan model tampilan', () => {
    // Kriteria penerimaan 13 butir 5, dibuktikan sel demi sel.
    const { gabungan } = siapkan(30);
    const tabel = bangunTabelGabungan(gabungan, OPSI);
    const matriks = bacaLembar(tulisExcel([tabel]), tabel.judul);

    expect(matriks[0]).toEqual(tabel.kolom);
    expect(matriks).toHaveLength(tabel.baris.length + 1);
    for (let i = 0; i < tabel.baris.length; i += 1) {
      expect(matriks[i + 1]).toEqual(tabel.baris[i]);
    }
  });

  it('tidak memuat email maupun nama pada mode anonim', () => {
    // Kriteria penerimaan 13 butir 6.
    const { gabungan } = siapkan(30);
    const tabel = bangunTabelGabungan(gabungan, { ...OPSI, anonim: true });
    const matriks = bacaLembar(tulisExcel([tabel]), tabel.judul);
    const seluruhTeks = matriks.map((baris) => baris.join(' ')).join(' ');

    expect(seluruhTeks).not.toContain('@');
    expect(seluruhTeks).not.toContain('Peserta');
    expect(matriks[0]).toContain('ID');
  });

  it('mempertahankan tanda kosong sampai ke berkas', () => {
    const { gabungan } = siapkan(30);
    const pertama = gabungan.baris[0];
    if (pertama === undefined) throw new Error('rekap seharusnya berisi baris');

    const kosong = { ...gabungan, baris: [{ ...pertama, nilaiPerSesi: { s1: null } }] };
    const tabel = bangunTabelGabungan(kosong, OPSI);
    const matriks = bacaLembar(tulisExcel([tabel]), tabel.judul);

    // Diperiksa pada sel yang tepat, bukan lewat substring: angka sah seperti
    // "40,0" memuat "0,0", sehingga pemeriksaan substring menyesatkan.
    const header = matriks[0];
    if (header === undefined) throw new Error('lembar seharusnya punya baris header');
    const kolomNilai = header.indexOf('Post-Test');
    expect(kolomNilai).toBeGreaterThan(-1);
    expect(matriks[1]?.[kolomNilai]).toBe(TANDA_KOSONG);
  });

  it('menulis rekap 500 baris ke Excel dan PDF tanpa error', () => {
    const { gabungan, responden, skema } = siapkan(500);
    const tabel = bangunTabelGabungan(gabungan, OPSI);

    const dimensi = hitungIndeksDimensi(responden, skema);
    const ringkasan = bangunTabelRingkasan(dimensi, hitungIndeksKeseluruhan(dimensi, skema), {
      desimal: 1,
    });

    const matriks = bacaLembar(tulisExcel([tabel, ringkasan]), tabel.judul);
    expect(matriks).toHaveLength(501);

    const { jumlahHalaman } = tulisPdf([tabel, ringkasan], {
      judul: 'Post-Test',
      tanggal: '27/09/2026',
      jumlahResponden: gabungan.baris.length,
      dibuatPada: '28/09/2026 10:00',
      statusSesi: 'final',
    }, { kembalikanInfo: true });
    expect(jumlahHalaman).toBeGreaterThan(1);
  });
});
