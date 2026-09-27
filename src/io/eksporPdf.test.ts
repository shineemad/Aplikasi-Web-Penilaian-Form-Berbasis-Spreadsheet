import { describe, expect, it } from 'vitest';
import type { TabelTampil } from '../core/tabelTampil';
import { tulisPdf } from './eksporPdf';

const KEPALA = {
  judul: 'Literasi Qur\'ani Ateneo de Davao 2026',
  // Tanggal = TENTANG kapan laporan ini (kepala), beda dari dibuatPada = KAPAN
  // berkas dibuat (catatan kaki). Sengaja dibuat berbeda tanggal di sini.
  tanggal: '27/09/2026',
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

  it('menampilkan tanggal pada kepala laporan, bukan hanya di catatan kaki', () => {
    // Temuan 1: tanggal pada §12.2 adalah tanggal laporan ini TENTANG apa,
    // beda dari dibuatPada (kapan berkas dibuat) yang sudah ada di catatan kaki.
    // Diperiksa lewat isi mentah berkas: jsPDF tidak mengompresi stream teks
    // secara default, jadi teks kepala tercetak apa adanya di dalam byte-nya.
    const isi = tulisPdf([tabelSempit(3)], KEPALA);
    const teks = new TextDecoder('latin1').decode(isi);
    expect(teks).toContain(KEPALA.tanggal);
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

  it('mempertahankan orientasi masing-masing tabel saat dicampur dalam satu berkas', () => {
    // Temuan 2: sebelumnya seluruh dokumen memakai satu orientasi agregat
    // (`some(...) === 'lanskap'`), sehingga tabel potret ikut tercetak di
    // halaman berbentuk lanskap. Di sini satu tabel lebar (-> lanskap) dan
    // satu tabel sempit (-> potret) digabung dalam satu pemanggilan; bentuk
    // halaman fisik yang sesungguhnya (bukan sekadar rencana) harus berbeda.
    const lebar = tabelLebar(8);
    const sempit = tabelSempit(3);
    const { orientasiPerTabel, bentukHalaman } = tulisPdf([lebar, sempit], KEPALA, {
      kembalikanInfo: true,
    });

    expect(orientasiPerTabel[0]).toBe('lanskap');
    expect(orientasiPerTabel[1]).toBe('potret');
    expect(bentukHalaman).toContain('lanskap');
    expect(bentukHalaman).toContain('potret');
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
    // Bedakan dari uji di bawah: tabel yang ADA tetapi belum berisi baris itu
    // sah — begitulah sesi yang belum diisi siapa pun tampak. Yang ditolak
    // adalah tidak adanya tabel sama sekali.
    expect(() => tulisPdf([tabelSempit(0)], KEPALA)).not.toThrow();
  });

  it('menolak dipanggil tanpa satu tabel pun', () => {
    // Sebelumnya tulisPdf([]) menghasilkan berkas sah berisi kepala laporan
    // "Jumlah responden: 500" tanpa satu baris data — laporan yang tampak
    // benar padahal kosong. tulisExcel sudah menolak; PDF menyusul.
    expect(() => tulisPdf([], KEPALA)).toThrow('tanpa satu tabel pun');
    expect(() => tulisPdf([], KEPALA)).toThrow('Tabel yang tidak punya baris tetap sah');
    expect(() => tulisPdf([], KEPALA, { kembalikanInfo: true })).toThrow('tanpa satu tabel pun');
  });
});
