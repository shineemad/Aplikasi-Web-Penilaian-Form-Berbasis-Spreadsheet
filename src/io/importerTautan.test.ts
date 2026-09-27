import { describe, expect, it } from 'vitest';
import { bacaTautan } from './importerTautan';
import type { FungsiAmbil } from './importerTautan';

const CSV = 'Email,Name,q1\na@x.com,Ani,Agree\nb@x.com,,Neutral\n';

function ambilBerhasil(teks: string): FungsiAmbil {
  return async () => ({ ok: true, status: 200, teks: async () => teks });
}

const ambilGagal = (status: number): FungsiAmbil =>
  async () => ({ ok: false, status, teks: async () => '' });

const ambilMelempar: FungsiAmbil = async () => {
  throw new TypeError('Failed to fetch');
};

describe('bacaTautan', () => {
  it('membaca CSV yang berhasil diambil', async () => {
    const hasil = await bacaTautan('https://contoh/pub?output=csv', ambilBerhasil(CSV));
    expect(hasil.status).toBe('berhasil');
    if (hasil.status !== 'berhasil') return;
    expect(hasil.header).toEqual(['Email', 'Name', 'q1']);
    expect(hasil.baris).toHaveLength(2);
  });

  it('menolak URL yang bukan http atau https', async () => {
    const hasil = await bacaTautan('ftp://contoh/data.csv', ambilBerhasil(CSV));
    expect(hasil.status).toBe('gagal');
  });

  it('menolak teks yang sama sekali bukan URL', async () => {
    const hasil = await bacaTautan('bukan url', ambilBerhasil(CSV));
    expect(hasil.status).toBe('gagal');
  });

  it('mengajari cara mempublikasikan saat tautan Google Sheets belum dipublikasikan', async () => {
    const hasil = await bacaTautan(
      'https://docs.google.com/spreadsheets/d/abc/edit',
      ambilBerhasil(CSV),
    );
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') {
      expect(hasil.pesan).toContain('Publikasikan ke web');
      expect(hasil.pesan).toContain('CSV');
    }
  });

  it('menerima tautan Google Sheets yang sudah dipublikasikan', async () => {
    const hasil = await bacaTautan(
      'https://docs.google.com/spreadsheets/d/e/abc/pub?output=csv',
      ambilBerhasil(CSV),
    );
    expect(hasil.status).toBe('berhasil');
  });

  it('mengajari saat jaringan menolak permintaan', async () => {
    const hasil = await bacaTautan('https://contoh/pub?output=csv', ambilMelempar);
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') {
      expect(hasil.pesan).toContain('Publikasikan ke web');
    }
  });

  it('menyebut kode status saat server menolak', async () => {
    const hasil = await bacaTautan('https://contoh/pub?output=csv', ambilGagal(404));
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') expect(hasil.pesan).toContain('404');
  });

  it('menolak balasan yang ternyata halaman HTML, bukan CSV', async () => {
    const html = '<!DOCTYPE html><html><body>Sign in</body></html>';
    const hasil = await bacaTautan('https://contoh/pub?output=csv', ambilBerhasil(html));
    expect(hasil.status).toBe('gagal');
    if (hasil.status === 'gagal') {
      expect(hasil.pesan).toContain('halaman web');
    }
  });

  it('menolak balasan kosong', async () => {
    const hasil = await bacaTautan('https://contoh/pub?output=csv', ambilBerhasil(''));
    expect(hasil.status).toBe('gagal');
  });
});

describe('bacaTautan — isi tidak boleh berubah', () => {
  it('mempertahankan huruf non-ASCII dan jawaban berhuruf Arab', async () => {
    const teks = 'Email,Name,q1\na@x.com,Peña,بَاب\n';
    const hasil = await bacaTautan('https://contoh/pub?output=csv', ambilBerhasil(teks));
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');
    expect(hasil.baris[0]?.Name).toBe('Peña');
    expect(hasil.baris[0]?.q1).toBe('بَاب');
  });

  it('tidak menyulap jawaban yang mirip tanggal', async () => {
    const teks = 'Email,q1,q2\na@x.com,1/2,3-4\n';
    const hasil = await bacaTautan('https://contoh/pub?output=csv', ambilBerhasil(teks));
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');
    expect(hasil.baris[0]?.q1).toBe('1/2');
    expect(hasil.baris[0]?.q2).toBe('3-4');
  });

  it('mengembalikan nomor baris asal', async () => {
    const teks = 'Email,q1\na@x.com,x\n\nb@x.com,y\n';
    const hasil = await bacaTautan('https://contoh/pub?output=csv', ambilBerhasil(teks));
    if (hasil.status !== 'berhasil') throw new Error('seharusnya berhasil');
    expect(hasil.nomorBaris).toEqual([2, 4]);
  });
});

describe('bacaTautan — pesan berbicara tentang tautan, bukan berkas', () => {
  const URL_SAH = 'https://contoh/pub?output=csv';

  function pesanDari(hasil: Awaited<ReturnType<typeof bacaTautan>>): string {
    if (hasil.status !== 'gagal') throw new Error('seharusnya gagal');
    return hasil.pesan;
  }

  function tanpaBahasaBerkas(pesan: string): void {
    expect(pesan).not.toContain('data-dari-tautan');
    expect(pesan).not.toContain('.xlsx');
    expect(pesan.toLowerCase()).not.toContain('berkas');
    expect(pesan.toLowerCase()).not.toContain('unggah');
    expect(pesan.toLowerCase()).toContain('tautan');
  }

  it('saat lembarnya hanya berisi nama kolom', async () => {
    const pesan = pesanDari(await bacaTautan(URL_SAH, ambilBerhasil('Email,Name\n')));
    tanpaBahasaBerkas(pesan);
    expect(pesan).toContain('tidak berisi satu baris data pun');
  });

  it('saat nama kolomnya kembar', async () => {
    const pesan = pesanDari(await bacaTautan(URL_SAH, ambilBerhasil('Email,q1,q1\na@x.com,x,y\n')));
    tanpaBahasaBerkas(pesan);
    expect(pesan).toContain('kembar');
  });

  it('saat ada nama kolom yang kosong', async () => {
    const pesan = pesanDari(await bacaTautan(URL_SAH, ambilBerhasil('Email,,q1\na@x.com,x,y\n')));
    tanpaBahasaBerkas(pesan);
    expect(pesan).toContain('kolom ke-2');
  });

  it('saat lembarnya tidak berisi satu sel pun', async () => {
    const pesan = pesanDari(await bacaTautan(URL_SAH, ambilBerhasil(',,,\n,,\n')));
    tanpaBahasaBerkas(pesan);
  });
});
