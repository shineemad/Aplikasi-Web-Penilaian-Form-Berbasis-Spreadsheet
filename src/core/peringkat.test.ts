import { describe, expect, it } from 'vitest';
import { urutkanPeringkat } from './peringkat';
import type { BandingWaktu, BarisPeringkat } from './peringkat';

/** Pembanding uji: cap waktu ditulis sebagai angka agar urutannya jelas terbaca. */
const bandingAngka: BandingWaktu = (a, b) => Number(a) - Number(b);

function baris(
  isi: { id: string; nilai: number | null; terjawab?: number; waktu?: string }[],
): BarisPeringkat[] {
  return isi.map((satu) => ({
    respondenId: satu.id,
    nilai: satu.nilai,
    jumlahTerjawab: satu.terjawab === undefined ? 0 : satu.terjawab,
    waktuKirim: satu.waktu === undefined ? null : satu.waktu,
  }));
}

describe('urutkanPeringkat', () => {
  it('mengurutkan dari nilai tertinggi', () => {
    const hasil = urutkanPeringkat(
      baris([
        { id: 'b', nilai: 70 },
        { id: 'a', nilai: 90 },
        { id: 'c', nilai: 80 },
      ]),
      bandingAngka,
    );
    expect(hasil.map((h) => h.respondenId)).toEqual(['a', 'c', 'b']);
    expect(hasil.map((h) => h.peringkat)).toEqual([1, 2, 3]);
  });

  it('memenangkan butir terjawab lebih banyak saat nilai seri', () => {
    const hasil = urutkanPeringkat(
      baris([
        { id: 'sedikit', nilai: 80, terjawab: 10 },
        { id: 'banyak', nilai: 80, terjawab: 18 },
      ]),
      bandingAngka,
    );
    expect(hasil[0]?.respondenId).toBe('banyak');
  });

  it('memenangkan cap waktu lebih awal saat nilai dan butir terjawab seri', () => {
    const hasil = urutkanPeringkat(
      baris([
        { id: 'telat', nilai: 80, terjawab: 10, waktu: '200' },
        { id: 'awal', nilai: 80, terjawab: 10, waktu: '100' },
      ]),
      bandingAngka,
    );
    expect(hasil[0]?.respondenId).toBe('awal');
  });

  it('menaruh yang tidak punya cap waktu di belakang yang punya', () => {
    const hasil = urutkanPeringkat(
      baris([
        { id: 'tanpa', nilai: 80, terjawab: 10 },
        { id: 'punya', nilai: 80, terjawab: 10, waktu: '999' },
      ]),
      bandingAngka,
    );
    expect(hasil[0]?.respondenId).toBe('punya');
  });

  it('memberi nomor peringkat yang sama bila seluruh kuncinya sama', () => {
    const hasil = urutkanPeringkat(
      baris([
        { id: 'a', nilai: 80, terjawab: 10, waktu: '100' },
        { id: 'b', nilai: 80, terjawab: 10, waktu: '100' },
        { id: 'c', nilai: 70, terjawab: 10, waktu: '100' },
      ]),
      bandingAngka,
    );
    expect(hasil.map((h) => h.peringkat)).toEqual([1, 1, 3]);
  });

  it('tidak memberi peringkat kepada responden bernilai null', () => {
    // Tidak menjawab apa pun bukan sama dengan menjawab dan bernilai terendah.
    const hasil = urutkanPeringkat(
      baris([
        { id: 'kosong', nilai: null },
        { id: 'ada', nilai: 40 },
      ]),
      bandingAngka,
    );
    expect(hasil[0]?.respondenId).toBe('ada');
    expect(hasil[0]?.peringkat).toBe(1);
    expect(hasil[1]?.respondenId).toBe('kosong');
    expect(hasil[1]?.peringkat).toBe(null);
  });

  it('tidak mengubah larik masukan', () => {
    const masukan = baris([
      { id: 'b', nilai: 70 },
      { id: 'a', nilai: 90 },
    ]);
    urutkanPeringkat(masukan, bandingAngka);
    expect(masukan.map((m) => m.respondenId)).toEqual(['b', 'a']);
  });

  it('mengembalikan larik kosong untuk masukan kosong', () => {
    expect(urutkanPeringkat([], bandingAngka)).toHaveLength(0);
  });

  it('memberi peringkat null kepada semua bila tidak ada satu pun nilai', () => {
    const hasil = urutkanPeringkat(baris([{ id: 'a', nilai: null }]), bandingAngka);
    expect(hasil[0]?.peringkat).toBe(null);
  });
});
