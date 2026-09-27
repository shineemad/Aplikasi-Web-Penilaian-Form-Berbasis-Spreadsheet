import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { hitungIndeksDimensi, hitungIndeksKeseluruhan } from '../core/aggregator';
import { bangunResponden } from '../core/bangunResponden';
import { hashPalsu } from '../core/__fixtures__/hash';
import { gabungkanSesi } from '../core/merger';
import type { MetaSesi } from '../core/sesi';
import { bangunRancangan, finalkanSkema } from '../core/rancanganSkema';
import type { RancanganSkema } from '../core/rancanganSkema';
import { bangunNilaiSesi } from '../core/sesi';
import { bangunTabelGabungan, bangunTabelRingkasan } from '../core/tabelTampil';
import type { Aturan } from '../core/tipe';
import { TANDA_KOSONG } from '../core/penyajian';
import { tulisExcel } from './eksporExcel';
import { tulisPdf } from './eksporPdf';
import { bacaBerkas } from './importerBerkas';
import { bukuKerjaPostTest, bukuKerjaXlsx } from './__fixtures__/bukuKerja';
import { hitungToken, tokenTeksPdf } from './__fixtures__/pdfTeks';

const OPSI = { desimal: 1, anonim: false, adaPembanding: false };

const KEPALA = {
  judul: 'Post-Test',
  tanggal: '27/09/2026',
  jumlahResponden: 0,
  dibuatPada: '28/09/2026 10:00',
  statusSesi: 'final',
};

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

interface PesertaPembanding {
  email: string;
  /** Kosong berarti responden tanpa nama — kolom Name memang opsional. */
  nama: string;
  /** Satu tingkat untuk seluruh 20 butir, supaya nilainya mudah ditelusuri tangan. */
  tingkat: string;
}

/**
 * Berkas tanpa kolom meta, supaya tabel dua sesi berpembanding tetap muat
 * pada satu potongan halaman. Begitu tabelnya terpecah, kolom identitas
 * diulang di tiap potongan dan jumlah kemunculan tidak lagi bisa dibandingkan
 * lurus dengan model tampilan.
 */
function bukuKerjaTanpaMeta(peserta: PesertaPembanding[]): ArrayBuffer {
  const header = ['Email', 'Name'];
  for (let n = 1; n <= 20; n += 1) header.push(`q${n}`);

  const data = [header];
  for (const satu of peserta) {
    const baris = [satu.email, satu.nama];
    for (let n = 1; n <= 20; n += 1) baris.push(satu.tingkat);
    data.push(baris);
  }
  return bukuKerjaXlsx(data);
}

function sesiTanpaMeta(meta: MetaSesi, peserta: PesertaPembanding[]) {
  const impor = bacaBerkas(bukuKerjaTanpaMeta(peserta), `${meta.sesiId}.xlsx`);
  if (impor.status !== 'berhasil') throw new Error('impor seharusnya berhasil');

  const rancangan = bangunRancangan('skemaLikert', impor.header, impor.baris);
  rancangan.perlakuanKosong = 'abaikan';
  for (const kolom of rancangan.peran.kolom) {
    if (kolom.peran === 'belum-diputuskan') kolom.peran = 'pertanyaan';
  }
  for (const butir of rancangan.butir) {
    butir.dimensi = 'kemudahan';
    butir.aturan = LIKERT;
  }

  const final = finalkanSkema(rancangan);
  if (final.status !== 'siap') throw new Error('skema seharusnya siap');

  const petaan = bangunResponden(
    impor.baris,
    impor.nomorBaris,
    rancangan.peran,
    final.skema,
    hashPalsu,
  );
  return bangunNilaiSesi(meta, petaan.responden, final.skema);
}

/**
 * Pre-Test dan Post-Test atas kelompok yang tidak sepenuhnya sama: Dina hanya
 * ikut yang awal, Eka hanya yang akhir. Keduanya menghasilkan nilai dan selisih
 * kosong — justru sel-sel itulah yang paling mudah hilang di perjalanan ke PDF.
 */
function siapkanPembanding() {
  const awal = sesiTanpaMeta({ sesiId: 'pre', namaSesi: 'Pre-Test' }, [
    { email: 'ani@example.com', nama: 'Ani', tingkat: 'Neutral' },
    { email: 'budi@example.com', nama: 'Budi', tingkat: 'Agree' },
    { email: 'citra@example.com', nama: 'Citra', tingkat: 'Disagree' },
    { email: 'dina@example.com', nama: '', tingkat: 'Agree' },
  ]);
  const akhir = sesiTanpaMeta({ sesiId: 'post', namaSesi: 'Post-Test' }, [
    { email: 'ani@example.com', nama: 'Ani', tingkat: 'Agree' },
    { email: 'budi@example.com', nama: 'Budi', tingkat: 'Strongly agree' },
    { email: 'citra@example.com', nama: 'Citra', tingkat: 'Neutral' },
    { email: 'eka@example.com', nama: 'Eka', tingkat: 'Neutral' },
  ]);

  return gabungkanSesi([awal, akhir], { awal: 'pre', akhir: 'post' });
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

  it('menghasilkan angka PDF yang identik dengan model tampilan', () => {
    // Kriteria penerimaan 13 butir 5, separuh PDF. Diperiksa lewat token teks
    // yang benar-benar tercetak: autotable menulis tiap sel sebagai satu token
    // `(isi) Tj` tersendiri, sehingga yang dibandingkan adalah JUMLAH
    // KEMUNCULAN, bukan sekadar keberadaan. Pemeriksaan keberadaan tetap hijau
    // walau ada baris yang hilang, terdobel, atau tercetak di kolom lain.
    const gabungan = siapkanPembanding();
    const tabel = bangunTabelGabungan(gabungan, { ...OPSI, adaPembanding: true });

    const { berkas, jumlahPotonganPerTabel } = tulisPdf(
      [tabel],
      { ...KEPALA, jumlahResponden: gabungan.baris.length },
      { kembalikanInfo: true },
    );
    // Wajib satu potongan: bila tabel terpecah, kolom identitas diulang di tiap
    // potongan dan jumlah kemunculan tidak lagi sebanding dengan model.
    expect(jumlahPotonganPerTabel[0]).toBe(1);

    const token = tokenTeksPdf(berkas);

    const kolomAngka = [...gabungan.urutanSesi.map((s) => s.namaSesi), 'Selisih'].map((nama) => {
      const k = tabel.kolom.indexOf(nama);
      if (k === -1) throw new Error(`model tampilan tidak punya kolom "${nama}"`);
      return k;
    });

    // Baris yang nilai atau selisihnya kosong harus ada: itulah sel yang paling
    // mudah berubah menjadi string kosong tanpa ketahuan.
    const barisBerkosong = tabel.baris.filter((baris) =>
      kolomAngka.some((k) => baris[k] === TANDA_KOSONG),
    );
    expect(barisBerkosong.length).toBeGreaterThan(0);

    const diharapkan = new Map<string, number>();
    for (const baris of tabel.baris) {
      for (const k of kolomAngka) {
        const sel = baris[k];
        if (sel === undefined) throw new Error('model tampilan kehilangan sel');
        if (sel === TANDA_KOSONG) continue;
        const sebelumnya = diharapkan.get(sel);
        diharapkan.set(sel, sebelumnya === undefined ? 1 : sebelumnya + 1);
      }
    }
    // Sebagian angka sengaja berulang antar baris; tanpa itu jumlah kemunculan
    // tidak membedakan apa pun dari sekadar keberadaan.
    expect(diharapkan.size).toBeGreaterThanOrEqual(3);
    expect([...diharapkan.values()].some((jumlah) => jumlah > 1)).toBe(true);

    for (const [nilai, jumlah] of diharapkan) {
      expect(hitungToken(token, nilai), `jumlah kemunculan "${nilai}"`).toBe(jumlah);
    }

    // Tanda kosong dihitung atas SELURUH model, termasuk kolom Nama yang kosong.
    const jumlahKosong = tabel.baris.flat().filter((sel) => sel === TANDA_KOSONG).length;
    expect(jumlahKosong).toBeGreaterThan(0);
    expect(hitungToken(token, TANDA_KOSONG), 'jumlah sel kosong').toBe(jumlahKosong);

    // Jumlah yang cocok belum membuktikan sel berada di kolom yang benar.
    // Id responden unik, jadi tiap baris dapat ditemukan lalu dibandingkan utuh.
    for (const baris of tabel.baris) {
      const id = baris[0];
      if (id === undefined) throw new Error('baris model tampilan tanpa id');
      const mulai = token.indexOf(id);
      expect(mulai, `id "${id}" tidak tercetak`).toBeGreaterThan(-1);
      expect(token.slice(mulai, mulai + tabel.kolom.length)).toEqual(baris);
    }
  });

  it('tidak memuat email maupun nama pada mode anonim', () => {
    // Kriteria penerimaan 13 butir 6, pada kedua berkas ekspor. Sebelumnya
    // hanya berkas Excel yang dibaca, sehingga kebocoran di PDF — termasuk
    // yang masuk lewat kepala laporan atau catatan kaki — tidak tertangkap.
    const { gabungan } = siapkan(30);
    const tabel = bangunTabelGabungan(gabungan, { ...OPSI, anonim: true });

    // Nama diambil dari data uji itu sendiri. Memeriksa string tetap seperti
    // 'Peserta' membuat uji ini lulus hanya karena pola fixture kebetulan
    // begitu, dan diam-diam berhenti menguji apa pun bila fixture berubah.
    const nama = gabungan.baris
      .map((baris) => baris.nama)
      .filter((satu): satu is string => satu !== null && satu !== '');
    expect(nama.length).toBeGreaterThan(0);
    const kumpulanNama = new Set(nama);

    const matriks = bacaLembar(tulisExcel([tabel]), tabel.judul);
    const seluruhTeks = matriks.map((baris) => baris.join(' ')).join(' ');

    expect(seluruhTeks).not.toContain('@');
    for (const satu of nama) expect(seluruhTeks).not.toContain(satu);
    expect(matriks[0]).toContain('ID');
    expect(matriks[0]).not.toContain('Email');
    expect(matriks[0]).not.toContain('Nama');

    const token = tokenTeksPdf(
      tulisPdf([tabel], { ...KEPALA, jumlahResponden: gabungan.baris.length }),
    );
    expect(token.filter((satu) => satu.includes('@'))).toEqual([]);
    expect(token.filter((satu) => kumpulanNama.has(satu))).toEqual([]);
    expect(token).toContain('ID');
    expect(token).not.toContain('Email');
    expect(token).not.toContain('Nama');
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

    const { jumlahHalaman } = tulisPdf(
      [tabel, ringkasan],
      { ...KEPALA, jumlahResponden: gabungan.baris.length },
      { kembalikanInfo: true },
    );
    expect(jumlahHalaman).toBeGreaterThan(1);
  });
});
