import { describe, expect, it } from 'vitest';
import type { TabelTampil } from '../core/tabelTampil';
import { tulisPdf } from './eksporPdf';

const KEPALA = {
  judul: 'Literasi Qur\'ani Ateneo de Davao 2026',
  jumlahResponden: 2,
  dibuatPada: '28/09/2026 10:00',
  statusSesi: 'final',
};

function tabelSempit(jumlahBaris: number): TabelTampil {
  return {
    judul: 'Rekap Gabungan',
    kolom: ['ID', 'Email', 'Pre-Test', 'Selisih'],
    baris: Array.from({ length: jumlahBaris }, (_, i) => [`id${i}`, `p${i}@x.com`, '40,0', '—']),
    kolomIdentitas: 2,
  };
}

function tabelLebar(jumlahSesi: number): TabelTampil {
  const kolom = ['ID', 'Email', 'Nama'];
  for (let n = 1; n <= jumlahSesi; n += 1) kolom.push(`Tes ${n}`, `Status Tes ${n}`);
  kolom.push('Selisih', 'Status Gabungan');

  return {
    judul: 'Rekap Gabungan',
    kolom,
    baris: [kolom.map((_, i) => (i < 3 ? `x${i}` : '40,0'))],
    kolomIdentitas: 3,
  };
}

function awalanPdf(isi: Uint8Array): string {
  return new TextDecoder().decode(isi.slice(0, 5));
}

describe('tulisPdf', () => {
  it('menghasilkan berkas PDF yang sah', () => {
    const isi = tulisPdf([tabelSempit(3)], KEPALA);
    expect(awalanPdf(isi)).toBe('%PDF-');
    expect(isi.byteLength).toBeGreaterThan(0);
  });

  it('memecah 500 baris ke banyak halaman', () => {
    // Tabel panjang. Diuji sejak awal, bukan menjelang akhir.
    const { berkas, jumlahHalaman } = tulisPdf([tabelSempit(500)], KEPALA, { kembalikanInfo: true });
    expect(awalanPdf(berkas)).toBe('%PDF-');
    expect(jumlahHalaman).toBeGreaterThan(1);
  });

  it('memakai potret untuk tabel yang sempit', () => {
    const { orientasiPerTabel } = tulisPdf([tabelSempit(3)], KEPALA, { kembalikanInfo: true });
    expect(orientasiPerTabel[0]).toBe('potret');
  });

  it('beralih ke lanskap dan memecah kolom untuk tabel tiga sesi', () => {
    // Tabel lebar. Masalah yang berbeda dari tabel panjang.
    // Turunannya: 3 identitas + 3 sesi x 2 kolom + Selisih + Status = 11 kolom.
    // Lanskap memuat 10, identitas 3 diulang, jadi ruang data 7 untuk 8 kolom data
    // -> 2 potongan. Angka ini dinyatakan, bukan dibiarkan kebetulan lolos.
    const { orientasiPerTabel, jumlahPotonganPerTabel } = tulisPdf([tabelLebar(3)], KEPALA, {
      kembalikanInfo: true,
    });
    expect(orientasiPerTabel[0]).toBe('lanskap');
    expect(jumlahPotonganPerTabel[0]).toBe(2);
  });

  it('memecah kolom untuk tabel yang sangat lebar', () => {
    const { jumlahPotonganPerTabel } = tulisPdf([tabelLebar(8)], KEPALA, { kembalikanInfo: true });
    expect(jumlahPotonganPerTabel[0]).toBeGreaterThan(1);
  });

  it('menulis beberapa tabel dalam satu berkas', () => {
    const ringkasan: TabelTampil = {
      judul: 'Ringkasan Dimensi',
      kolom: ['Dimensi', 'Indeks', 'Kategori', 'Pasangan Dihitung'],
      baris: [['kemudahan', '81,0', 'Sangat Baik', '100']],
      kolomIdentitas: 1,
    };
    const { jumlahHalaman } = tulisPdf([tabelSempit(3), ringkasan], KEPALA, {
      kembalikanInfo: true,
    });
    expect(jumlahHalaman).toBeGreaterThanOrEqual(2);
  });

  it('menghasilkan berkas berukuran sama untuk masukan yang sama', () => {
    // Waktu pembuatan disuntikkan, jadi tidak ada sumber ketidaktentuan dari kode kita.
    // jsPDF menyematkan cap waktu pembuatannya sendiri, sehingga byte-nya tidak
    // dibandingkan utuh; ukuran yang stabil sudah cukup menandai tidak ada keacakan.
    const a = tulisPdf([tabelSempit(3)], KEPALA);
    const b = tulisPdf([tabelSempit(3)], KEPALA);
    expect(a.byteLength).toBe(b.byteLength);
  });

  it('menulis tabel tanpa baris data tanpa error', () => {
    expect(() => tulisPdf([tabelSempit(0)], KEPALA)).not.toThrow();
  });
});
