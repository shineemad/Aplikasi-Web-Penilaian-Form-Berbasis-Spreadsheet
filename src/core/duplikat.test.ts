import { describe, expect, it } from 'vitest';
import { deteksiEmailKembar } from './duplikat';
import type { BarisMentah } from './duplikat';

function baris(daftarEmail: string[]): BarisMentah[] {
  return daftarEmail.map((email, i) => ({ nomorBaris: i + 1, email }));
}

describe('deteksiEmailKembar', () => {
  it('tidak melaporkan apa pun bila seluruh email berbeda', () => {
    expect(deteksiEmailKembar(baris(['a@x.com', 'b@x.com']))).toHaveLength(0);
  });

  it('melaporkan email yang muncul dua kali beserta nomor barisnya', () => {
    const hasil = deteksiEmailKembar(baris(['a@x.com', 'b@x.com', 'a@x.com']));
    expect(hasil).toHaveLength(1);
    expect(hasil[0]?.email).toBe('a@x.com');
    expect(hasil[0]?.jumlah).toBe(2);
    expect(hasil[0]?.nomorBaris).toEqual([1, 3]);
  });

  it('menganggap email yang hanya beda huruf besar-kecil sebagai orang yang sama', () => {
    const hasil = deteksiEmailKembar(baris(['Budi@Example.com', 'budi@example.com']));
    expect(hasil).toHaveLength(1);
    expect(hasil[0]?.jumlah).toBe(2);
  });

  it('menganggap email yang hanya beda spasi tepi sebagai orang yang sama', () => {
    const hasil = deteksiEmailKembar(baris(['  a@x.com', 'a@x.com  ']));
    expect(hasil[0]?.jumlah).toBe(2);
  });

  it('memakai bentuk ternormalisasi sebagai email yang dilaporkan', () => {
    const hasil = deteksiEmailKembar(baris(['Budi@Example.COM', 'budi@example.com']));
    expect(hasil[0]?.email).toBe('budi@example.com');
  });

  it('melaporkan lebih dari satu konflik sekaligus', () => {
    const hasil = deteksiEmailKembar(baris(['a@x.com', 'b@x.com', 'a@x.com', 'b@x.com']));
    expect(hasil).toHaveLength(2);
  });

  it('mengurutkan konflik dari yang paling banyak muncul', () => {
    const hasil = deteksiEmailKembar(baris(['a@x.com', 'b@x.com', 'b@x.com', 'b@x.com', 'a@x.com']));
    expect(hasil[0]?.email).toBe('b@x.com');
    expect(hasil[0]?.jumlah).toBe(3);
  });

  it('mengabaikan baris yang emailnya kosong', () => {
    expect(deteksiEmailKembar(baris(['', '   ', '']))).toHaveLength(0);
  });

  it('mengembalikan daftar kosong untuk masukan kosong', () => {
    expect(deteksiEmailKembar([])).toHaveLength(0);
  });
});
