import { describe, expect, it } from 'vitest';
import { tebakPeranKolom } from './peranKolom';
import type { Peran } from './peranKolom';

function peranDari(header: string[]): Record<string, Peran> {
  const hasil: Record<string, Peran> = {};
  for (const kolom of tebakPeranKolom(header).kolom) hasil[kolom.header] = kolom.peran;
  return hasil;
}

describe('tebakPeranKolom mengenali kolom identitas', () => {
  it('mengenali header Google Forms berbahasa Inggris', () => {
    const peran = peranDari(['Timestamp', 'Email Address', 'Name', 'Age', 'q1']);
    expect(peran['Timestamp']).toBe('waktu');
    expect(peran['Email Address']).toBe('email');
    expect(peran['Name']).toBe('nama');
  });

  it('mengenali header berbahasa Indonesia', () => {
    const peran = peranDari(['Cap Waktu', 'Alamat Email', 'Nama Lengkap']);
    expect(peran['Cap Waktu']).toBe('waktu');
    expect(peran['Alamat Email']).toBe('email');
    expect(peran['Nama Lengkap']).toBe('nama');
  });

  it('tidak peduli huruf besar-kecil maupun spasi berlebih', () => {
    const peran = peranDari(['  EMAIL   address  ']);
    expect(peran['  EMAIL   address  ']).toBe('email');
  });

  it('menandai kolom selain identitas sebagai belum diputuskan', () => {
    const peran = peranDari(['Email Address', 'Age', 'Gender', 'q1']);
    expect(peran['Age']).toBe('belum-diputuskan');
    expect(peran['Gender']).toBe('belum-diputuskan');
    expect(peran['q1']).toBe('belum-diputuskan');
  });

  it('menyertakan alasan untuk setiap peran yang ditebak', () => {
    const peta = tebakPeranKolom(['Email Address']);
    expect(peta.kolom[0]?.alasan).not.toBe('');
  });
});

describe('tebakPeranKolom menolak menebak saat rancu', () => {
  it('tidak memilih sendiri bila ada dua calon kolom email', () => {
    const peta = tebakPeranKolom(['Email Address', 'Email Orang Tua']);
    expect(peta.kolom[0]?.peran).toBe('belum-diputuskan');
    expect(peta.kolom[1]?.peran).toBe('belum-diputuskan');

    const rancu = peta.rancu.find((r) => r.peran === 'email');
    expect(rancu?.calon).toEqual(['Email Address', 'Email Orang Tua']);
  });

  it('melaporkan kerancuan nama tanpa mengganggu email', () => {
    const peta = tebakPeranKolom(['Email Address', 'Name', 'Nama']);
    const peran = peranDari(['Email Address', 'Name', 'Nama']);
    expect(peran['Email Address']).toBe('email');
    expect(peta.rancu.map((r) => r.peran)).toEqual(['nama']);
  });

  it('tidak melaporkan kerancuan bila memang tidak ada calon', () => {
    expect(tebakPeranKolom(['q1', 'q2']).rancu).toHaveLength(0);
  });
});

describe('tebakPeranKolom tidak tertipu teks pertanyaan', () => {
  it('tidak menganggap pertanyaan panjang sebagai kolom email', () => {
    // Header pertanyaan Google Forms sering berupa kalimat penuh. Tanpa pagar
    // panjang, kalimat yang kebetulan memuat kata "email" akan dikira kunci identitas.
    const panjang = 'I would like the team to email me the results of this study later';
    expect(peranDari([panjang, 'Email Address'])[panjang]).toBe('belum-diputuskan');
  });

  it('mencocokkan nama secara persis, bukan sekadar mengandung', () => {
    const header = 'Your Name';
    expect(peranDari([header])[header]).toBe('belum-diputuskan');
  });

  it('mengembalikan peta kosong untuk header kosong', () => {
    const peta = tebakPeranKolom([]);
    expect(peta.kolom).toHaveLength(0);
    expect(peta.rancu).toHaveLength(0);
  });
});

describe('tebakPeranKolom menolak tabrakan lintas peran', () => {
  it('menandai header yang jadi calon dua peran sekaligus sebagai belum diputuskan', () => {
    const peta = tebakPeranKolom(['Timestamp Email']);
    expect(peta.kolom[0]?.peran).toBe('belum-diputuskan');

    const rancuEmail = peta.rancu.find((r) => r.peran === 'email');
    const rancuWaktu = peta.rancu.find((r) => r.peran === 'waktu');
    expect(rancuEmail?.calon).toEqual(['Timestamp Email']);
    expect(rancuWaktu?.calon).toEqual(['Timestamp Email']);
  });

  it('tidak mengganggu kolom lain yang tidak ikut bertabrakan', () => {
    const peran = peranDari(['Timestamp Email', 'Nama Lengkap']);
    expect(peran['Nama Lengkap']).toBe('nama');
  });

  it('tidak pernah menghasilkan keluaran yang saling bertentangan', () => {
    const header = ['Email Address', 'Email Orang Tua', 'Timestamp Email'];
    const peta = tebakPeranKolom(header);
    const peran = peranDari(header);

    for (const entri of peta.rancu) {
      for (const calon of entri.calon) {
        expect(peran[calon]).toBe('belum-diputuskan');
      }
    }
  });
});
