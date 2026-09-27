import { describe, expect, it } from 'vitest';
import { gabungkanSesi, ringkasProyek } from './merger';
import type { NilaiSesi } from './merger';

function sesi(
  sesiId: string,
  namaSesi: string,
  skemaId: string,
  isi: Record<string, { nilai: number | null; email: string; nama: string | null }>,
): NilaiSesi {
  const nilai = new Map<string, number | null>();
  const identitas = new Map<string, { email: string; nama: string | null }>();
  for (const [id, data] of Object.entries(isi)) {
    nilai.set(id, data.nilai);
    identitas.set(id, { email: data.email, nama: data.nama });
  }
  return { sesiId, namaSesi, skemaId, nilai, identitas };
}

const PRE = sesi('s1', 'Pre-Test', 'skemaA', {
  budi: { nilai: 40, email: 'budi@example.com', nama: 'Budi' },
  siti: { nilai: 60, email: 'siti@example.com', nama: null },
});

const POST = sesi('s2', 'Post-Test', 'skemaA', {
  budi: { nilai: 80, email: 'budi@example.com', nama: 'Budi' },
  andi: { nilai: 70, email: 'andi@example.com', nama: 'Andi' },
});

const PEMBANDING = { awal: 's1', akhir: 's2' };

describe('gabungkanSesi', () => {
  it('menghitung selisih untuk responden yang ikut kedua sesi', () => {
    const { baris } = gabungkanSesi([PRE, POST], PEMBANDING);
    const budi = baris.find((b) => b.id === 'budi');
    expect(budi?.statusGabungan).toBe('lengkap');
    expect(budi?.selisih).toBe(40);
    expect(budi?.nilaiPerSesi['s1']).toBe(40);
    expect(budi?.nilaiPerSesi['s2']).toBe(80);
  });

  it('tetap memunculkan responden yang hanya ikut satu sesi', () => {
    const { baris } = gabungkanSesi([PRE, POST], PEMBANDING);
    expect(baris.map((b) => b.id).sort()).toEqual(['andi', 'budi', 'siti']);
  });

  it('mengosongkan nilai sesi yang tidak diikuti — bukan mengisinya nol', () => {
    const { baris } = gabungkanSesi([PRE, POST], PEMBANDING);
    const andi = baris.find((b) => b.id === 'andi');
    expect(andi?.nilaiPerSesi['s1']).toBe(null);
    expect(andi?.nilaiPerSesi['s1']).not.toBe(0);
    expect(andi?.statusPerSesi['s1']).toBe('tidak ikut');
    expect(andi?.statusPerSesi['s2']).toBe('ikut');
  });

  it('menandai responden yang hanya ikut sebagian sesi', () => {
    const { baris } = gabungkanSesi([PRE, POST], PEMBANDING);
    expect(baris.find((b) => b.id === 'andi')?.statusGabungan).toBe('sebagian:Post-Test');
    expect(baris.find((b) => b.id === 'siti')?.statusGabungan).toBe('sebagian:Pre-Test');
  });

  it('mengosongkan selisih bila salah satu nilai pembanding tidak ada', () => {
    const { baris } = gabungkanSesi([PRE, POST], PEMBANDING);
    expect(baris.find((b) => b.id === 'andi')?.selisih).toBe(null);
    expect(baris.find((b) => b.id === 'siti')?.selisih).toBe(null);
  });

  it('mengambil identitas dari sesi paling awal yang memuat orang tersebut', () => {
    const { baris } = gabungkanSesi([PRE, POST], PEMBANDING);
    expect(baris.find((b) => b.id === 'siti')?.nama).toBe(null);
    expect(baris.find((b) => b.id === 'budi')?.email).toBe('budi@example.com');
  });

  it('tetap membentuk tabel tanpa kolom selisih bila pembanding tidak ditetapkan', () => {
    const { baris } = gabungkanSesi([PRE, POST]);
    expect(baris).toHaveLength(3);
    for (const b of baris) {
      expect(b.selisih).toBe(null);
    }
  });

  it('memperingatkan bila dua sesi pembanding memakai skema berbeda', () => {
    const postLain = { ...POST, skemaId: 'skemaB' };
    const { peringatan } = gabungkanSesi([PRE, postLain], PEMBANDING);
    expect(peringatan).toHaveLength(1);
    expect(peringatan.join(' ')).toContain('skema');
  });

  it('tidak memperingatkan bila kedua sesi pembanding memakai skema sama', () => {
    const { peringatan } = gabungkanSesi([PRE, POST], PEMBANDING);
    expect(peringatan).toHaveLength(0);
  });

  it('mempertahankan urutan sesi pada kolom', () => {
    const TENGAH = sesi('s3', 'Tes Tengah', 'skemaA', {
      budi: { nilai: 60, email: 'budi@example.com', nama: 'Budi' },
    });
    const { urutanSesi } = gabungkanSesi([PRE, TENGAH, POST], PEMBANDING);
    expect(urutanSesi.map((s) => s.sesiId)).toEqual(['s1', 's3', 's2']);
  });
});

describe('ringkasProyek', () => {
  it('menghitung rata-rata selisih hanya dari responden berstatus lengkap', () => {
    const hasil = gabungkanSesi([PRE, POST], PEMBANDING);
    const ringkasan = ringkasProyek(hasil, [PRE, POST]);
    // Hanya Budi yang lengkap, selisihnya 40.
    expect(ringkasan.jumlahLengkap).toBe(1);
    expect(ringkasan.rataSelisih).toBe(40);
  });

  it('menghitung rata-rata nilai per sesi', () => {
    const hasil = gabungkanSesi([PRE, POST], PEMBANDING);
    const ringkasan = ringkasProyek(hasil, [PRE, POST]);
    expect(ringkasan.perSesi[0]?.rataNilai).toBe(50);
    expect(ringkasan.perSesi[0]?.jumlahResponden).toBe(2);
    expect(ringkasan.perSesi[1]?.rataNilai).toBe(75);
  });

  it('mengembalikan rataSelisih null bila tidak ada responden lengkap', () => {
    const postKosong = sesi('s2', 'Post-Test', 'skemaA', {});
    const hasil = gabungkanSesi([PRE, postKosong], PEMBANDING);
    const ringkasan = ringkasProyek(hasil, [PRE, postKosong]);
    expect(ringkasan.jumlahLengkap).toBe(0);
    expect(ringkasan.rataSelisih).toBe(null);
  });

  it('melaporkan jumlah responden yang tidak berpasangan', () => {
    const hasil = gabungkanSesi([PRE, POST], PEMBANDING);
    const ringkasan = ringkasProyek(hasil, [PRE, POST]);
    expect(ringkasan.jumlahTidakLengkap).toBe(2);
  });
});
