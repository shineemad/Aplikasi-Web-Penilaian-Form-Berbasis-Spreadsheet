import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { TabelTampil } from '../core/tabelTampil';
import { tulisExcel } from './eksporExcel';

function tabel(ubah: Partial<TabelTampil> = {}): TabelTampil {
  return {
    judul: 'Rekap Gabungan',
    kolom: ['ID', 'Email', 'Pre-Test', 'Selisih'],
    baris: [
      ['id1', 'a@x.com', '40,0', '40,0'],
      ['id2', 'b@x.com', '—', '—'],
    ],
    kolomIdentitas: 2,
    ...ubah,
  };
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

describe('tulisExcel', () => {
  it('menulis header dan baris persis seperti modelnya', () => {
    const satu = tabel();
    const matriks = bacaLembar(tulisExcel([satu]), 'Rekap Gabungan');

    expect(matriks[0]).toEqual(satu.kolom);
    expect(matriks[1]).toEqual(satu.baris[0]);
    expect(matriks[2]).toEqual(satu.baris[1]);
  });

  it('mempertahankan tanda kosong apa adanya, tidak mengubahnya menjadi nol', () => {
    const matriks = bacaLembar(tulisExcel([tabel()]), 'Rekap Gabungan');
    expect(matriks[2]?.[2]).toBe('—');
  });

  it('mempertahankan koma desimal, tidak menafsirkannya sebagai angka', () => {
    // Bila sel ditulis sebagai angka, Excel akan memformat ulang sesuai lokal
    // mesin pembuka dan angkanya bisa berbeda dari yang tampil di layar.
    const matriks = bacaLembar(tulisExcel([tabel()]), 'Rekap Gabungan');
    expect(matriks[1]?.[2]).toBe('40,0');
  });

  it('menulis setiap tabel sebagai lembar tersendiri bernama judulnya', () => {
    const isi = tulisExcel([
      tabel(),
      tabel({ judul: 'Ringkasan Dimensi', kolom: ['Dimensi', 'Indeks'], baris: [['kemudahan', '81,0']] }),
    ]);
    const buku = XLSX.read(isi, { type: 'array' });
    expect(buku.SheetNames).toEqual(['Rekap Gabungan', 'Ringkasan Dimensi']);
  });

  it('menulis tabel tanpa baris data tanpa error', () => {
    const matriks = bacaLembar(tulisExcel([tabel({ baris: [] })]), 'Rekap Gabungan');
    expect(matriks[0]).toEqual(['ID', 'Email', 'Pre-Test', 'Selisih']);
  });

  it('menulis 500 baris tanpa kehilangan satu pun', () => {
    const banyak = Array.from({ length: 500 }, (_, i) => [`id${i}`, `p${i}@x.com`, '40,0', '—']);
    const matriks = bacaLembar(tulisExcel([tabel({ baris: banyak })]), 'Rekap Gabungan');
    expect(matriks).toHaveLength(501);
    expect(matriks[500]?.[0]).toBe('id499');
  });

  it('memotong judul lebih dari 31 karakter menjadi tepat 31, dan lembarnya bisa dibaca dengan nama terpotong', () => {
    const judulPanjang = 'Rekap Gabungan Sesi Pre-Test dan Post-Test Lengkap';
    expect(judulPanjang.length).toBeGreaterThan(31);
    const namaTerpotong = judulPanjang.slice(0, 31);
    expect(namaTerpotong).toHaveLength(31);

    const matriks = bacaLembar(tulisExcel([tabel({ judul: judulPanjang })]), namaTerpotong);
    expect(matriks[0]).toEqual(['ID', 'Email', 'Pre-Test', 'Selisih']);
  });

  it('menolak dua tabel dengan judul sama persis, dan pesannya menyebut judul serta cara memperbaikinya', () => {
    expect(() => tulisExcel([tabel(), tabel()])).toThrow('Rekap Gabungan');
    expect(() => tulisExcel([tabel(), tabel()])).toThrow('judul yang berbeda');
  });

  it('menolak dua judul panjang berbeda yang bertabrakan hanya setelah dipotong 31 karakter', () => {
    const awal31 = 'Rekap Gabungan Sesi Pre Post Te';
    const judulA = `${awal31} Bagian Satu`;
    const judulB = `${awal31} Bagian Dua`;
    expect(judulA.slice(0, 31)).toBe(judulB.slice(0, 31));

    expect(() => tulisExcel([tabel({ judul: judulA }), tabel({ judul: judulB })])).toThrow(judulB);
    expect(() => tulisExcel([tabel({ judul: judulA }), tabel({ judul: judulB })])).toThrow(
      'dipotong maksimal 31 karakter',
    );
  });

  it('menolak larik tabel kosong, dan pesannya menyebutkan tidak ada tabel untuk ditulis', () => {
    expect(() => tulisExcel([])).toThrow('tanpa satu tabel pun');
  });
});
