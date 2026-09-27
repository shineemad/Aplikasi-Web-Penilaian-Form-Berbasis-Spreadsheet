import { describe, expect, it } from 'vitest';
import { buatBandingWaktu, tebakFormatTanggal } from './waktu';

describe('tebakFormatTanggal', () => {
  it('menyimpulkan DMY bila ada komponen pertama di atas 12', () => {
    const hasil = tebakFormatTanggal(['3/4/2026 08:00:00', '25/4/2026 09:00:00']);
    expect(hasil.status).toBe('yakin');
    if (hasil.status !== 'yakin') return;
    expect(hasil.format).toBe('DMY');
  });

  it('menyimpulkan MDY bila ada komponen kedua di atas 12', () => {
    const hasil = tebakFormatTanggal(['3/4/2026 08:00:00', '4/25/2026 09:00:00']);
    expect(hasil.status).toBe('yakin');
    if (hasil.status !== 'yakin') return;
    expect(hasil.format).toBe('MDY');
  });

  it('mengaku tidak tahu bila seluruh komponen di bawah 13', () => {
    // 3/4/2026 sah dibaca sebagai 3 April maupun 4 Maret. Menebaknya akan
    // mengacak urutan peringkat tanpa ada yang menyadarinya.
    const hasil = tebakFormatTanggal(['3/4/2026 08:00:00', '5/6/2026 09:00:00']);
    expect(hasil.status).toBe('rancu');
    if (hasil.status !== 'rancu') return;
    expect(hasil.alasan.toLowerCase()).toContain('pilih');
  });

  it('mengaku tidak tahu bila buktinya saling bertentangan', () => {
    const hasil = tebakFormatTanggal(['25/4/2026 08:00:00', '4/25/2026 09:00:00']);
    expect(hasil.status).toBe('rancu');
  });

  it('mengabaikan nilai yang bukan cap waktu sama sekali', () => {
    const hasil = tebakFormatTanggal(['', 'bukan tanggal', '25/4/2026 08:00:00']);
    expect(hasil.status).toBe('yakin');
    if (hasil.status !== 'yakin') return;
    expect(hasil.format).toBe('DMY');
  });

  it('mengaku tidak tahu untuk daftar kosong', () => {
    expect(tebakFormatTanggal([]).status).toBe('rancu');
  });

  it('tidak menyuruh memilih format bila tidak ada satu pun cap waktu yang terbaca', () => {
    // Memilih format di sini tidak menolong: setelahnya seluruh cap waktu tetap
    // tak terbaca dan semuanya jadi seri.
    const hasil = tebakFormatTanggal(['bukan tanggal', '', '3/4/2026 9:00:00 PM']);
    expect(hasil.status).toBe('rancu');
    expect(hasil.alasan.toLowerCase()).toContain('tidak ada satu pun');
    expect(hasil.alasan).not.toContain('12 ke bawah');
    expect(hasil.alasan).not.toContain('Pilih sendiri format');
  });

  it('memakai pesan "12 ke bawah" hanya bila memang ada tanggal yang terbaca', () => {
    const hasil = tebakFormatTanggal(['3/4/2026 08:00:00']);
    expect(hasil.alasan).toContain('12 ke bawah');
  });
});

describe('buatBandingWaktu', () => {
  const bandingDMY = buatBandingWaktu('DMY');

  it('mengurutkan dua tanggal pada bulan yang sama', () => {
    expect(bandingDMY('3/4/2026 08:00:00', '4/4/2026 08:00:00')).toBeLessThan(0);
  });

  it('mengurutkan lintas bulan dan lintas tahun', () => {
    expect(bandingDMY('31/12/2025 23:59:59', '1/1/2026 00:00:00')).toBeLessThan(0);
  });

  it('mengurutkan berdasarkan jam bila tanggalnya sama', () => {
    expect(bandingDMY('3/4/2026 08:00:00', '3/4/2026 09:30:00')).toBeLessThan(0);
  });

  it('menganggap dua cap waktu yang identik sebagai seri', () => {
    expect(bandingDMY('3/4/2026 08:00:00', '3/4/2026 08:00:00')).toBe(0);
  });

  it('membaca hari dan bulan sesuai format yang dipilih', () => {
    const bandingMDY = buatBandingWaktu('MDY');

    // "3/4" lawan "4/3", dua cap waktu yang sama persis kecuali urutan komponennya.
    // Pada DMY: 3 April lawan 4 Maret, jadi yang pertama LEBIH AKHIR.
    // Pada MDY: 4 Maret lawan 3 April, jadi yang pertama LEBIH AWAL.
    // Inilah tepatnya kekacauan yang terjadi bila formatnya ditebak asal.
    expect(bandingDMY('3/4/2026 08:00:00', '4/3/2026 08:00:00')).toBeGreaterThan(0);
    expect(bandingMDY('3/4/2026 08:00:00', '4/3/2026 08:00:00')).toBeLessThan(0);
  });

  it('menaruh cap waktu yang tidak terbaca di belakang yang terbaca', () => {
    expect(bandingDMY('bukan tanggal', '3/4/2026 08:00:00')).toBeGreaterThan(0);
    expect(bandingDMY('3/4/2026 08:00:00', 'bukan tanggal')).toBeLessThan(0);
  });

  it('menerima cap waktu tanpa detik', () => {
    expect(bandingDMY('3/4/2026 08:00', '3/4/2026 09:00')).toBeLessThan(0);
  });

  it('tidak membaca jam 9 malam sebagai jam 9 pagi', () => {
    // Sisa " PM" yang diabaikan diam-diam akan menaruh kiriman sore sebelum kiriman pagi.
    expect(bandingDMY('3/4/2026 10:00:00', '3/4/2026 9:00:00 PM')).toBeLessThan(0);
    expect(bandingDMY('3/4/2026 9:00:00 PM', 'bukan tanggal')).toBe(0);
  });
});
