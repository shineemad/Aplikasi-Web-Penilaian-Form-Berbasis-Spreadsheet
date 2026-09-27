import type { FungsiHash } from './tipe';

export function normalisasiTeks(teks: string): string {
  return teks.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalisasiEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function idResponden(email: string, hash: FungsiHash): string {
  return hash(normalisasiEmail(email)).slice(0, 16);
}
