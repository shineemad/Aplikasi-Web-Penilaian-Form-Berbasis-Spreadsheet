import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { skorJawaban } from '../core/scorer';
import { bacaBerkas } from './importerBerkas';
import { bukuKerjaXlsx as bukuKerja } from './__fixtures__/bukuKerja';

function csv(teks: string): ArrayBuffer {
  return new TextEncoder().encode(teks).buffer as ArrayBuffer;
}

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

describe('bacaBerkas — isi csv tidak boleh berubah', () => {
  it('mempertahankan huruf non-ASCII pada nama', () => {
    const hasil = bacaBerkas(csv('Email,Name\na@x.com,Peña\nb@x.com,Ñoño Müller\n'), 'data.csv');
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');
    expect(hasil.baris[0]?.Name).toBe('Peña');
    expect(hasil.baris[1]?.Name).toBe('Ñoño Müller');
  });

  it('mempertahankan jawaban berhuruf Arab apa adanya', () => {
    const hasil = bacaBerkas(csv('Email,q1\na@x.com,بَاب\n'), 'data.csv');
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');
    expect(hasil.baris[0]?.q1).toBe('بَاب');
  });

  it('tidak menyulap jawaban yang mirip tanggal atau angka', () => {
    const hasil = bacaBerkas(csv('Email,q1,q2,q3\na@x.com,1/2,3-4,007\n'), 'data.csv');
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');
    expect(hasil.baris[0]?.q1).toBe('1/2');
    expect(hasil.baris[0]?.q2).toBe('3-4');
    expect(hasil.baris[0]?.q3).toBe('007');
  });

  it('membuang BOM di awal berkas sehingga nama kolom pertama tetap bersih', () => {
    const hasil = bacaBerkas(csv('\ufeffEmail,q1\na@x.com,x\n'), 'data.csv');
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');
    expect(hasil.header).toEqual(['Email', 'q1']);
  });

  it('menolak csv yang bukan UTF-8 alih-alih menebak hurufnya', () => {
    // "Peña" dalam Windows-1252: ñ = 0xF1, bukan urutan UTF-8 yang sah.
    const byte = new Uint8Array([...new TextEncoder().encode('Email,Name\na@x.com,Pe'), 0xf1, 0x61, 0x0a]);
    const hasil = bacaBerkas(byte.buffer, 'data.csv');
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') {
      expect(hasil.pesan).toContain('data.csv');
      expect(hasil.pesan).toContain('UTF-8');
    }
  });

  it('menilai benar jawaban berhuruf non-ASCII yang cocok dengan kunci jawaban', () => {
    const hasil = bacaBerkas(csv('Email,q1,q2\na@x.com,بَاب,Peña\n'), 'data.csv');
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');

    const q1 = skorJawaban(hasil.baris[0]?.q1, { jenis: 'kunci-jawaban', kunci: 'بَاب' });
    const q2 = skorJawaban(hasil.baris[0]?.q2, { jenis: 'kunci-jawaban', kunci: 'peña' });
    expect(q1).toEqual({ status: 'terhitung', skor: 1 });
    expect(q2).toEqual({ status: 'terhitung', skor: 1 });
  });
});

describe('bacaBerkas — nomor baris asal', () => {
  it('menunjuk baris yang benar meski ada baris kosong di tengah csv', () => {
    const hasil = bacaBerkas(csv('Email,q1\na@x.com,x\n\nb@x.com,y\n,\nc@x.com,z\n'), 'data.csv');
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');
    expect(hasil.baris.map((b) => b.Email)).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
    expect(hasil.nomorBaris).toEqual([2, 4, 6]);
  });

  it('menunjuk baris yang benar meski ada baris kosong di tengah xlsx', () => {
    const lembar = XLSX.utils.aoa_to_sheet([['Email', 'q1'], ['a@x.com', 'x'], [], ['b@x.com', 'y']]);
    const buku = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(buku, lembar, 'Sheet1');
    const isi = XLSX.write(buku, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const hasil = bacaBerkas(isi, 'data.xlsx');
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');
    expect(hasil.baris.map((b) => b.Email)).toEqual(['a@x.com', 'b@x.com']);
    expect(hasil.nomorBaris).toEqual([2, 4]);
  });

  it('memperhitungkan baris kosong di atas baris nama kolom', () => {
    const hasil = bacaBerkas(csv('\n\nEmail,q1\na@x.com,x\n'), 'data.csv');
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');
    expect(hasil.header).toEqual(['Email', 'q1']);
    expect(hasil.nomorBaris).toEqual([4]);
  });
});

describe('bacaBerkas — nama kolom yang berbahaya', () => {
  it('menyimpan kolom bernama __proto__, constructor, dan toString sebagai teks biasa', () => {
    const hasil = bacaBerkas(csv('Email,__proto__,constructor,toString\na@x.com,satu,dua,tiga\n'), 'data.csv');
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');

    const baris = hasil.baris[0];
    if (baris === undefined) throw new Error('baris seharusnya ada');
    expect(Object.keys(baris)).toEqual(['Email', '__proto__', 'constructor', 'toString']);
    expect(baris['__proto__']).toBe('satu');
    expect(baris['constructor']).toBe('dua');
    expect(baris['toString']).toBe('tiga');
  });

  it('tidak memberi nilai warisan untuk kolom yang tidak ada', () => {
    const hasil = bacaBerkas(csv('Email\na@x.com\n'), 'data.csv');
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');
    expect(hasil.baris[0]?.['constructor']).toBe(undefined);
  });
});
