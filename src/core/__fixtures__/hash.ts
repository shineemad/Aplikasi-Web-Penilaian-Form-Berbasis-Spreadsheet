/**
 * Hash palsu yang deterministik untuk keperluan uji. Bukan kriptografi.
 * Tujuannya hanya menyebar masukan yang mirip ke keluaran yang berbeda,
 * agar 500 email berurutan tetap menghasilkan 500 id yang berbeda.
 */
export function hashPalsu(teks: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < teks.length; i += 1) {
    const kode = teks.charCodeAt(i);
    a = Math.imul(a ^ kode, 0x01000193) >>> 0;
    b = Math.imul(b + kode * (i + 1), 0x85ebca6b) >>> 0;
  }
  return (
    a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
  ).padEnd(64, '0');
}
