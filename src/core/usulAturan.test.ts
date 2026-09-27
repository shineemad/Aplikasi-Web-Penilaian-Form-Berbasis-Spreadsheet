import { describe, expect, it } from 'vitest';
import { usulkanAturan } from './usulAturan';

const LIKERT_INGGRIS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];

describe('usulkanAturan mengenali skala yang dikenal', () => {
  it('mengusulkan peta-opsi untuk Likert 5 poin berbahasa Inggris', () => {
    const usul = usulkanAturan(LIKERT_INGGRIS);
    expect(usul.status).toBe('usul');
    if (usul.status !== 'usul') return;
    expect(usul.aturan.jenis).toBe('peta-opsi');
    if (usul.aturan.jenis !== 'peta-opsi') return;
    expect(usul.aturan.skorMaks).toBe(5);
    expect(usul.aturan.peta['strongly agree']).toBe(5);
    expect(usul.aturan.peta['strongly disagree']).toBe(1);
  });

  it('mengusulkan peta-opsi untuk Likert 5 poin berbahasa Indonesia', () => {
    const usul = usulkanAturan(['Sangat tidak setuju', 'Netral', 'Setuju', 'Sangat setuju']);
    expect(usul.status).toBe('usul');
    if (usul.status !== 'usul') return;
    if (usul.aturan.jenis !== 'peta-opsi') return;
    expect(usul.aturan.peta['sangat setuju']).toBe(5);
  });

  it('menyatukan opsi yang hanya beda huruf besar-kecil', () => {
    // Dua butir pada instrumen nyata menulis "Strongly Agree" berhuruf A besar.
    const usul = usulkanAturan(['Strongly Agree', 'Strongly agree', 'Agree', 'Neutral']);
    expect(usul.status).toBe('usul');
  });

  it('memakai skor maksimum skala, bukan jumlah opsi yang kebetulan muncul', () => {
    // Bila skorMaks diambil dari data, kolom ini akan bernilai 100 untuk "Agree".
    const usul = usulkanAturan(['Agree', 'Neutral', 'Disagree']);
    expect(usul.status).toBe('usul');
    if (usul.status !== 'usul') return;
    if (usul.aturan.jenis !== 'peta-opsi') return;
    expect(usul.aturan.skorMaks).toBe(5);
    expect(Object.keys(usul.aturan.peta)).toHaveLength(5);
  });

  it('mengabaikan jawaban kosong saat mencocokkan skala', () => {
    const usul = usulkanAturan(['Agree', '', '   ', 'Neutral', 'Disagree']);
    expect(usul.status).toBe('usul');
  });

  it('menyebut nama skala pada alasannya', () => {
    const usul = usulkanAturan(LIKERT_INGGRIS);
    expect(usul.alasan.toLowerCase()).toContain('likert');
  });
});

describe('usulkanAturan berisik saat ragu', () => {
  it('tidak menebak untuk kolom Yes/No/Maybe', () => {
    // Butir 11 instrumen nyata. Memaksanya masuk skala Likert akan mengarang angka.
    const usul = usulkanAturan(['Yes', 'No', 'Maybe', 'Yes', 'Maybe']);
    expect(usul.status).toBe('tidak-yakin');
    if (usul.status !== 'tidak-yakin') return;
    expect(usul.contohNilai).toContain('Yes');
  });

  it('menolak skala Likert yang tercampur satu opsi asing', () => {
    const usul = usulkanAturan(['Agree', 'Neutral', 'Disagree', 'Maybe']);
    expect(usul.status).toBe('tidak-yakin');
  });

  it('tidak menebak bila hanya ada dua opsi berbeda', () => {
    const usul = usulkanAturan(['Agree', 'Disagree', 'Agree']);
    expect(usul.status).toBe('tidak-yakin');
  });

  it('menyarankan abaikan untuk kolom berisi teks bebas', () => {
    const jawaban = Array.from(
      { length: 25 },
      (_, i) => `Menurut saya aplikasinya cukup membantu untuk keperluan nomor ${i}`,
    );
    const usul = usulkanAturan(jawaban);
    expect(usul.status).toBe('tidak-yakin');
    if (usul.status !== 'tidak-yakin') return;
    expect(usul.alasan).toContain('abaikan');
  });

  it('tidak menebak untuk kolom yang seluruhnya kosong', () => {
    expect(usulkanAturan(['', '  ', '']).status).toBe('tidak-yakin');
  });

  it('tidak menebak untuk kolom tanpa satu nilai pun', () => {
    expect(usulkanAturan([]).status).toBe('tidak-yakin');
  });

  it('tidak pernah mengusulkan kunci-jawaban', () => {
    // Sistem tidak punya cara tahu jawaban mana yang benar. Aturan itu milik admin.
    const usul = usulkanAturan(['A', 'B', 'C', 'D', 'B', 'A']);
    expect(usul.status).toBe('tidak-yakin');
  });

  it('membatasi contoh nilai pada lima yang paling sering muncul', () => {
    const usul = usulkanAturan(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    if (usul.status !== 'tidak-yakin') throw new Error('seharusnya tidak yakin');
    expect(usul.contohNilai.length).toBeLessThanOrEqual(5);
  });

  it('mendeteksi teks bebas berdasarkan jumlah opsi saja (> 20, panjang rata-rata pendek)', () => {
    // Uji isolasi: banyak opsi berbeda (21), panjang rata-rata rendah (~1 karakter).
    // Memastikan kondisi pertama OR (`bentukTerlihat.length > MAKS_OPSI_SEBELUM_TEKS_BEBAS`) bekerja sendiri.
    // Pesan "tampak berupa teks bebas" hanya muncul di cabang teks bebas.
    const jawaban: string[] = [];
    for (let i = 0; i < 21; i++) {
      jawaban.push(String.fromCharCode(97 + i)); // 'a' through 'u'
    }
    const usul = usulkanAturan(jawaban);
    expect(usul.status).toBe('tidak-yakin');
    if (usul.status !== 'tidak-yakin') return;
    expect(usul.alasan).toContain('tampak berupa teks bebas');
  });

  it('mendeteksi teks bebas berdasarkan panjang rata-rata saja (< 20 opsi, rata-rata > 40 char)', () => {
    // Uji isolasi: sedikit opsi berbeda (3), panjang rata-rata tinggi (~65 karakter).
    // Memastikan kondisi kedua OR (`totalPanjang / totalTerisi > PANJANG_RATA_TEKS_BEBAS`) bekerja sendiri.
    // Pesan "tampak berupa teks bebas" hanya muncul di cabang teks bebas, membedakannya dari
    // cabang "terlalu sedikit opsi" atau "tidak cocok skala mana pun".
    const jawaban = [
      'Ini adalah kalimat pertama yang cukup panjang untuk menguji kondisi rata-rata karakter',
      'Ini adalah kalimat kedua yang juga sangat panjang untuk menguji kondisi pemisahan',
      'Ini adalah kalimat ketiga sama panjangnya untuk memastikan rata-rata di atas empat puluh karakter',
    ];
    const usul = usulkanAturan(jawaban);
    expect(usul.status).toBe('tidak-yakin');
    if (usul.status !== 'tidak-yakin') return;
    expect(usul.alasan).toContain('tampak berupa teks bebas');
  });
});
