import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Uji 500 baris dan tiga sesi wajib ada (instruksi repo), dan uji itu berat:
    // saat mesin lengang selesai ~450 ms, tetapi saat mesin sibuk pernah terukur
    // 19,8 detik — melampaui batas bawaan 5 detik. Batasnya dinaikkan supaya
    // uji yang merah berarti kode yang salah, bukan mesin yang sedang padat.
    testTimeout: 30_000,
    maxWorkers: 4,
  },
});
