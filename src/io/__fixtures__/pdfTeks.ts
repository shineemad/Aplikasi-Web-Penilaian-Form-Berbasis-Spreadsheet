/**
 * Menarik kembali teks yang benar-benar tercetak di dalam berkas PDF.
 *
 * Tiga fakta yang sudah diperiksa langsung pada keluaran jsPDF 4 + autotable 5,
 * bukan disimpulkan dari dokumentasi:
 *
 * 1. Stream teks tidak dikompresi, sehingga isinya terbaca dari byte mentah.
 * 2. Tiap sel tabel menjadi satu token `(isi) Tj` tersendiri — inilah yang
 *    membuat jumlah kemunculan sel dapat dihitung, bukan sekadar keberadaannya.
 * 3. Penyandiannya WinAnsi, yang sama dengan windows-1252, dan tanda pisah `—`
 *    tersimpan sebagai byte tunggal 0x97. Karena itu berkasnya WAJIB dibaca
 *    dengan dekoder windows-1252: `Buffer.toString('latin1')` memakai
 *    ISO-8859-1 sejati dan mengubah byte itu menjadi U+0097, sehingga sel
 *    kosong tidak lagi cocok dengan TANDA_KOSONG yang model tampilan maksud.
 *    (`new TextDecoder('latin1')` kebetulan ikut benar — WHATWG menjadikan
 *    "latin1" alias windows-1252 — tetapi namanya menyesatkan pembaca, jadi
 *    yang dipakai di sini nama sebenarnya.)
 */
const DEKODER = new TextDecoder('windows-1252');

function byteKeTeks(kode: number): string {
  return DEKODER.decode(Uint8Array.of(kode));
}

function buangEscape(mentah: string): string {
  return mentah.replace(/\\(n|r|t|b|f|\(|\)|\\|[0-7]{1,3})/g, (_cocok, isi: string) => {
    switch (isi) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case '(':
        return '(';
      case ')':
        return ')';
      case '\\':
        return '\\';
      default:
        // Escape oktal menyebut nomor BYTE, jadi ia harus lewat tabel yang sama
        // dengan byte mentah — bukan langsung menjadi titik kode Unicode.
        return byteKeTeks(Number.parseInt(isi, 8));
    }
  });
}

/**
 * Seluruh byte berkas sebagai teks, termasuk bagian yang tidak pernah tercetak
 * sebagai token `Tj`. Kamus metadata dokumen (`/Author`, `/Title`, `/Subject`)
 * ada di antaranya: `doc.setProperties({ author: 'bocor@example.com' })`
 * menaruh email itu di berkas tanpa menghasilkan satu token pun, sehingga
 * pemeriksaan yang hanya membaca token tetap hijau meski berkasnya bocor.
 */
export function teksMentahPdf(berkas: Uint8Array): string {
  return DEKODER.decode(berkas);
}

export function tokenTeksPdf(berkas: Uint8Array): string[] {
  const isi = DEKODER.decode(berkas);
  const token: string[] = [];

  for (const cocok of isi.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
    const mentah = cocok[1];
    if (mentah === undefined) continue;
    token.push(buangEscape(mentah));
  }

  return token;
}

/** Dipakai uji yang membandingkan jumlah kemunculan, bukan sekadar keberadaan. */
export function hitungToken(token: string[], dicari: string): number {
  return token.filter((satu) => satu === dicari).length;
}
