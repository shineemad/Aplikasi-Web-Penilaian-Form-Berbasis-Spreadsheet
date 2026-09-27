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
