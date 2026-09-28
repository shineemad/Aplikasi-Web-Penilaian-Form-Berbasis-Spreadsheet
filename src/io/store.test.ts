import { describe, expect, it, vi } from 'vitest';
import { buatStore } from './store';
import type { Perintah, PerintahTertunda } from './store';

function perintahUji(sebagian: Partial<Perintah> = {}): Perintah {
  return { aksi: 'simpanPenilaian', sesiId: 'S1', muatan: { respondenId: 'a1' }, ...sebagian };
}

const SUKSES = { ok: true, kode: 'TERSIMPAN' };

function tertunda(): { muat: () => PerintahTertunda[]; simpan: (d: PerintahTertunda[]) => void } {
  let isi: PerintahTertunda[] = [];
  return {
    muat: () => isi,
    simpan: (daftar) => {
      isi = daftar;
    },
  };
}

describe('buatStore — sebelum ada balasan', () => {
  it('menandai perintah sebagai belum tersimpan dan belum mengirim apa pun', () => {
    const kirim = vi.fn(async () => SUKSES);
    const store = buatStore({ kirim });

    store.antre(perintahUji());

    expect(kirim).not.toHaveBeenCalled();
    const daftar = store.daftarTertunda();
    expect(daftar).toHaveLength(1);
    expect(daftar[0]?.status).toBe('belum-tersimpan');
    expect(daftar[0]?.percobaan).toBe(0);
    expect(daftar[0]?.kegagalan).toBeNull();
  });

  it('memberi nomor urut yang berbeda untuk perintah yang isinya sama', () => {
    const store = buatStore({ kirim: async () => SUKSES });
    store.antre(perintahUji());
    store.antre(perintahUji());
    expect(store.daftarTertunda().map((satu) => satu.nomor)).toEqual([1, 2]);
  });
});

describe('buatStore — hanya ok:true yang membuang dari antrean', () => {
  it('membuang dari antrean setelah ok:true', async () => {
    const store = buatStore({ kirim: async () => SUKSES });
    store.antre(perintahUji());

    const ringkasan = await store.kirimTertunda();

    expect(ringkasan.terkirim).toBe(1);
    expect(store.daftarTertunda()).toHaveLength(0);
  });

  it('tetap belum tersimpan bila server menjawab ok:false', async () => {
    const store = buatStore({
      kirim: async () => ({ ok: false, kode: 'SEDANG_SIBUK', pesan: 'coba lagi' }),
    });
    store.antre(perintahUji());

    await store.kirimTertunda();

    const daftar = store.daftarTertunda();
    expect(daftar).toHaveLength(1);
    expect(daftar[0]?.status).toBe('belum-tersimpan');
    expect(daftar[0]?.kegagalan?.kode).toBe('SEDANG_SIBUK');
  });

  it('tetap belum tersimpan bila jaringan melempar', async () => {
    const store = buatStore({
      kirim: () => {
        throw new Error('jaringan putus');
      },
    });
    store.antre(perintahUji());

    await store.kirimTertunda();

    const daftar = store.daftarTertunda();
    expect(daftar).toHaveLength(1);
    expect(daftar[0]?.kegagalan?.sifat).toBe('sementara');
    expect(daftar[0]?.kegagalan?.pesan).toContain('jaringan putus');
  });

  it('tetap belum tersimpan bila balasan cacat', async () => {
    // Balasan tanpa medan ok. Menganggapnya sukses adalah cara paling halus
    // kehilangan data penilaian: layar bilang tersimpan, server tidak pernah
    // menerima apa pun.
    const store = buatStore({ kirim: async () => ({ hasil: 'mungkin' }) });
    store.antre(perintahUji());

    await store.kirimTertunda();

    expect(store.daftarTertunda()).toHaveLength(1);
    expect(store.daftarTertunda()[0]?.kegagalan?.kode).toBe('BALASAN_CACAT');
  });

  it.each([
    ['null', null],
    ['teks', 'ok'],
    ['angka', 1],
    ['larik', []],
  ])('menganggap balasan berupa %s sebagai cacat', async (_nama, balasan) => {
    const store = buatStore({ kirim: async () => balasan });
    store.antre(perintahUji());

    await store.kirimTertunda();

    expect(store.daftarTertunda()).toHaveLength(1);
  });

  it.each([
    ['teks "true"', 'true'],
    ['angka 1', 1],
  ])('tidak menghitung ok bertipe %s sebagai sukses', async (_nama, ok) => {
    const store = buatStore({ kirim: async () => ({ ok }) });
    store.antre(perintahUji());

    await store.kirimTertunda();

    expect(store.daftarTertunda()).toHaveLength(1);
  });
});

describe('buatStore — kegagalan sementara dicoba ulang', () => {
  it('tidak membuang perintah pada AKSI_BELUM_DIBANGUN dan mengirimnya lagi', async () => {
    // Backend menjawab begini selama handler-nya belum ada. Perintahnya sah;
    // yang belum ada hanyalah penanganannya.
    const kirim = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, kode: 'AKSI_BELUM_DIBANGUN', pesan: 'belum ada' })
      .mockResolvedValueOnce(SUKSES);
    const store = buatStore({ kirim });
    store.antre(perintahUji());

    await store.kirimTertunda();
    expect(store.daftarTertunda()).toHaveLength(1);

    await store.kirimTertunda();
    expect(store.daftarTertunda()).toHaveLength(0);
    expect(kirim).toHaveBeenCalledTimes(2);
  });

  it('memperlakukan kode yang tidak dikenal sebagai sementara', async () => {
    // Gagal ke arah mencoba lagi: menyerah pada kode baru berarti diam-diam
    // membuang penilaian yang sebenarnya masih bisa tersimpan.
    const store = buatStore({ kirim: async () => ({ ok: false, kode: 'KODE_MASA_DEPAN' }) });
    store.antre(perintahUji());

    await store.kirimTertunda();

    expect(store.daftarTertunda()[0]?.kegagalan?.sifat).toBe('sementara');
  });

  it('menghitung percobaan setiap kali perintah dikirim', async () => {
    const store = buatStore({ kirim: async () => ({ ok: false, kode: 'SEDANG_SIBUK' }) });
    store.antre(perintahUji());

    await store.kirimTertunda();
    await store.kirimTertunda();

    expect(store.daftarTertunda()[0]?.percobaan).toBe(2);
  });
});

describe('buatStore — kegagalan permanen berhenti dicoba ulang', () => {
  it.each(['SESI_FINAL', 'BUKAN_ADMIN', 'MUATAN_TIDAK_SAH'])(
    'berhenti mengirim ulang setelah %s tetapi tidak membuangnya',
    async (kode) => {
      const kirim = vi.fn(async () => ({ ok: false, kode, pesan: 'ditolak' }));
      const store = buatStore({ kirim });
      store.antre(perintahUji());

      await store.kirimTertunda();
      await store.kirimTertunda();

      expect(kirim).toHaveBeenCalledTimes(1);
      const daftar = store.daftarTertunda();
      expect(daftar).toHaveLength(1);
      expect(daftar[0]?.status).toBe('belum-tersimpan');
      expect(daftar[0]?.kegagalan?.sifat).toBe('permanen');
    },
  );

  it('tetap mengirim perintah lain meski satu ditolak permanen', async () => {
    const kirim = vi.fn(async (perintah: Perintah) =>
      perintah.sesiId === 'final' ? { ok: false, kode: 'SESI_FINAL' } : SUKSES,
    );
    const store = buatStore({ kirim });
    store.antre(perintahUji({ sesiId: 'final' }));
    store.antre(perintahUji({ sesiId: 'S2' }));

    const ringkasan = await store.kirimTertunda();

    expect(ringkasan.terkirim).toBe(1);
    expect(ringkasan.ditolakPermanen).toBe(1);
    expect(store.daftarTertunda()).toHaveLength(1);
  });
});

describe('buatStore — urutan antrean', () => {
  it('mempertahankan urutan antrean saat sebagian gagal', async () => {
    const store = buatStore({
      kirim: async (perintah: Perintah) =>
        perintah.sesiId === 'S2' ? SUKSES : { ok: false, kode: 'SEDANG_SIBUK' },
    });
    store.antre(perintahUji({ sesiId: 'S1' }));
    store.antre(perintahUji({ sesiId: 'S2' }));
    store.antre(perintahUji({ sesiId: 'S3' }));

    await store.kirimTertunda();

    expect(store.daftarTertunda().map((satu) => satu.perintah.sesiId)).toEqual(['S1', 'S3']);
  });

  it('mengirim dalam urutan antre', async () => {
    const urutan: string[] = [];
    const store = buatStore({
      kirim: async (perintah: Perintah) => {
        urutan.push(perintah.sesiId);
        return SUKSES;
      },
    });
    store.antre(perintahUji({ sesiId: 'S1' }));
    store.antre(perintahUji({ sesiId: 'S2' }));

    await store.kirimTertunda();

    expect(urutan).toEqual(['S1', 'S2']);
  });

  it('menempatkan perintah baru di belakang yang gagal', async () => {
    const store = buatStore({ kirim: async () => ({ ok: false, kode: 'SEDANG_SIBUK' }) });
    store.antre(perintahUji({ sesiId: 'S1' }));
    await store.kirimTertunda();
    store.antre(perintahUji({ sesiId: 'S2' }));

    expect(store.daftarTertunda().map((satu) => satu.perintah.sesiId)).toEqual(['S1', 'S2']);
  });

  it('tidak mengirim dua kali ketika kirimTertunda dipanggil bersamaan', async () => {
    // Dua pengiriman yang tumpang tindih menghasilkan dua baris Penilaian untuk
    // satu penilaian, dan append-only membuatnya tidak bisa dihapus lagi.
    let lepaskan = (): void => {};
    const menunggu = new Promise<void>((selesai) => {
      lepaskan = selesai;
    });
    const kirim = vi.fn(async () => {
      await menunggu;
      return SUKSES;
    });
    const store = buatStore({ kirim });
    store.antre(perintahUji());

    const pertama = store.kirimTertunda();
    const kedua = await store.kirimTertunda();
    expect(kedua.dilewati).toBe(true);

    lepaskan();
    await pertama;
    expect(kirim).toHaveBeenCalledTimes(1);
  });
});

describe('buatStore — penyimpanan yang disuntikkan', () => {
  it('memakai penyimpanan luar ketika diberikan', async () => {
    const luar = tertunda();
    const store = buatStore({
      kirim: async () => ({ ok: false, kode: 'SEDANG_SIBUK' }),
      muatTertunda: luar.muat,
      simpanTertunda: luar.simpan,
    });
    store.antre(perintahUji());
    await store.kirimTertunda();

    expect(luar.muat()).toHaveLength(1);
  });

  it('memulihkan antrean dari penyimpanan luar pada store yang baru dibuat', async () => {
    const luar = tertunda();
    const pertama = buatStore({
      kirim: async () => ({ ok: false, kode: 'SEDANG_SIBUK' }),
      muatTertunda: luar.muat,
      simpanTertunda: luar.simpan,
    });
    pertama.antre(perintahUji({ sesiId: 'S1' }));
    await pertama.kirimTertunda();

    const kedua = buatStore({
      kirim: async () => SUKSES,
      muatTertunda: luar.muat,
      simpanTertunda: luar.simpan,
    });
    kedua.antre(perintahUji({ sesiId: 'S2' }));

    expect(kedua.daftarTertunda().map((satu) => satu.nomor)).toEqual([1, 2]);
    await kedua.kirimTertunda();
    expect(kedua.daftarTertunda()).toHaveLength(0);
  });

  it('menolak penyimpanan yang hanya separuh disuntikkan', () => {
    // Membaca dari memori tetapi menulis ke luar (atau sebaliknya) membuat
    // antrean tampak bekerja padahal tidak pernah bertahan.
    expect(() => buatStore({ kirim: async () => SUKSES, muatTertunda: tertunda().muat })).toThrow(
      /muatTertunda dan simpanTertunda/,
    );
  });

  it('tidak membiarkan pemanggil mengubah antrean lewat daftarTertunda', () => {
    const store = buatStore({ kirim: async () => SUKSES });
    store.antre(perintahUji());

    store.daftarTertunda().pop();

    expect(store.daftarTertunda()).toHaveLength(1);
  });
});
