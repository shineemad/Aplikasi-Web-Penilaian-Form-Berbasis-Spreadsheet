import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { bacaBerkas } from './importerBerkas';
import { bukuKerjaXlsx as bukuKerja } from './__fixtures__/bukuKerja';

describe('bacaBerkas', () => {
  it('membaca header dan baris dari xlsx', () => {
    const isi = bukuKerja([
      ['Email', 'Name', 'q1'],
      ['a@x.com', 'Ani', 'Agree'],
      ['b@x.com', '', 'Neutral'],
    ]);
    const hasil = bacaBerkas(isi, 'data.xlsx');

    expect(hasil.status).toBe('berhasil');
    if (hasil.status !== 'berhasil') return;
    expect(hasil.header).toEqual(['Email', 'Name', 'q1']);
    expect(hasil.baris).toHaveLength(2);
    expect(hasil.baris[0]).toEqual({ Email: 'a@x.com', Name: 'Ani', q1: 'Agree' });
  });

  it('mengisi sel kosong dengan teks kosong, bukan undefined', () => {
    const isi = bukuKerja([
      ['Email', 'Name'],
      ['a@x.com', ''],
    ]);
    const hasil = bacaBerkas(isi, 'data.xlsx');
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');
    expect(hasil.baris[0]?.Name).toBe('');
  });

  it('mempertahankan angka sebagai teks apa adanya', () => {
    const isi = bukuKerja([
      ['Email', 'Age'],
      ['a@x.com', '20'],
    ]);
    const hasil = bacaBerkas(isi, 'data.xlsx');
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');
    expect(hasil.baris[0]?.Age).toBe('20');
  });

  it('menolak berkas tanpa baris data', () => {
    const hasil = bacaBerkas(bukuKerja([['Email', 'Name']]), 'data.xlsx');
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') expect(hasil.pesan).toContain('tidak berisi satu baris data pun');
  });

  it('menolak berkas yang seluruhnya kosong', () => {
    const hasil = bacaBerkas(bukuKerja([]), 'data.xlsx');
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') {
      expect(hasil.pesan).toContain('data.xlsx');
      expect(hasil.pesan).toContain('lembar pertamanya kosong');
      expect(hasil.pesan).not.toContain('tidak dapat dibaca sebagai spreadsheet');
      expect(hasil.pesan).not.toContain('Format yang didukung');
    }
  });

  it('menolak header yang kosong dengan menyebut kolom keberapa', () => {
    const isi = bukuKerja([
      ['Email', '', 'q1'],
      ['a@x.com', 'x', 'Agree'],
    ]);
    const hasil = bacaBerkas(isi, 'data.xlsx');
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') {
      expect(hasil.pesan).toContain('kolom ke-2');
    }
  });

  it('menolak header kembar dengan menyebut namanya', () => {
    const isi = bukuKerja([
      ['Email', 'q1', 'q1'],
      ['a@x.com', 'Agree', 'Neutral'],
    ]);
    const hasil = bacaBerkas(isi, 'data.xlsx');
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') {
      expect(hasil.pesan).toContain('q1');
      expect(hasil.pesan).toContain('kembar');
    }
  });

  it('menolak berkas yang bukan spreadsheet dengan pesan yang mengajari', () => {
    const sampah = new TextEncoder().encode('ini bukan spreadsheet sama sekali').buffer;
    const hasil = bacaBerkas(sampah, 'catatan.txt');
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') {
      expect(hasil.pesan).toContain('catatan.txt');
      expect(hasil.pesan.toLowerCase()).toContain('.xlsx');
    }
  });

  it('membaca header dan baris dari csv', () => {
    const teks = 'Email,Name,q1\na@x.com,Ani,Agree\nb@x.com,Budi,Neutral\n';
    const isi = new TextEncoder().encode(teks).buffer;
    const hasil = bacaBerkas(isi, 'sesuatu.csv');

    expect(hasil.status).toBe('berhasil');
    if (hasil.status !== 'berhasil') return;
    expect(hasil.header).toEqual(['Email', 'Name', 'q1']);
    expect(hasil.baris).toHaveLength(2);
    expect(hasil.baris[0]).toEqual({ Email: 'a@x.com', Name: 'Ani', q1: 'Agree' });
  });

  it('membaca lembar pertama bila buku kerja punya beberapa lembar', () => {
    const lembar1 = XLSX.utils.aoa_to_sheet([
      ['Email'],
      ['a@x.com'],
    ]);
    const lembar2 = XLSX.utils.aoa_to_sheet([
      ['Lain'],
      ['abaikan'],
    ]);
    const buku = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(buku, lembar1, 'Utama');
    XLSX.utils.book_append_sheet(buku, lembar2, 'Cadangan');
    const isi = XLSX.write(buku, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const hasil = bacaBerkas(isi, 'dua-lembar.xlsx');
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');
    expect(hasil.header).toEqual(['Email']);
  });
});
