import { describe, expect, it } from 'vitest';
import { rencanakanHalaman } from './tataLetak';

const MUAT = { potret: 8, lanskap: 12 };

describe('rencanakanHalaman', () => {
  it('memakai potret bila seluruh kolom muat', () => {
    const rencana = rencanakanHalaman(5, 3, MUAT);
    expect(rencana.orientasi).toBe('potret');
    expect(rencana.potongan).toEqual([[0, 1, 2, 3, 4]]);
  });

  it('memakai potret tepat pada batas muatnya', () => {
    expect(rencanakanHalaman(8, 3, MUAT).orientasi).toBe('potret');
  });

  it('beralih ke lanskap bila potret tidak cukup', () => {
    const rencana = rencanakanHalaman(10, 3, MUAT);
    expect(rencana.orientasi).toBe('lanskap');
    expect(rencana.potongan).toHaveLength(1);
  });

  it('memecah kolom bila lanskap pun tidak cukup', () => {
    const rencana = rencanakanHalaman(20, 2, MUAT);
    expect(rencana.orientasi).toBe('lanskap');
    expect(rencana.potongan.length).toBeGreaterThan(1);
  });

  it('mengulang kolom identitas di setiap potongan', () => {
    // Tanpa ini, halaman lanjutan hanya berisi angka tanpa ada yang tahu milik siapa.
    const rencana = rencanakanHalaman(20, 2, MUAT);
    for (const potongan of rencana.potongan) {
      expect(potongan[0]).toBe(0);
      expect(potongan[1]).toBe(1);
    }
  });

  it('memunculkan setiap kolom tepat satu kali di luar kolom identitas', () => {
    const rencana = rencanakanHalaman(20, 2, MUAT);
    const bukanIdentitas: number[] = [];
    for (const potongan of rencana.potongan) {
      bukanIdentitas.push(...potongan.filter((i) => i >= 2));
    }
    expect([...bukanIdentitas].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 2),
    );
  });

  it('tidak pernah membuat potongan yang melebihi muat lanskap', () => {
    for (const potongan of rencanakanHalaman(40, 3, MUAT).potongan) {
      expect(potongan.length).toBeLessThanOrEqual(MUAT.lanskap);
    }
  });

  it('menolak konfigurasi yang tidak menyisakan ruang bagi kolom data', () => {
    // Bila identitas sudah memenuhi halaman, memecah tabel tidak akan pernah selesai.
    expect(() => rencanakanHalaman(20, 12, MUAT)).toThrow(/identitas/i);
  });

  it('menangani tabel tanpa kolom sama sekali', () => {
    expect(rencanakanHalaman(0, 0, MUAT).potongan).toEqual([]);
  });
});
