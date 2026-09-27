import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { pastikanTabelSah } from '../core/tabelTampil';
import type { TabelTampil } from '../core/tabelTampil';
import { rencanakanHalaman } from '../core/tataLetak';
import type { MuatKolom } from '../core/tataLetak';

export interface KepalaLaporan {
  judul: string;
  /** Tanggal yang DILAPORKAN (proyek/sesi ini tentang kapan) — beda dari dibuatPada. */
  tanggal: string;
  jumlahResponden: number;
  /** Disuntikkan supaya uji tidak bergantung pada jam mesin yang menjalankannya. */
  dibuatPada: string;
  statusSesi: string;
}

export interface InfoPdf {
  berkas: Uint8Array;
  jumlahHalaman: number;
  orientasiPerTabel: ('potret' | 'lanskap')[];
  jumlahPotonganPerTabel: number[];
  /** Bentuk fisik tiap halaman, dibaca dari dokumen sungguhan, bukan dari rencana. */
  bentukHalaman: ('potret' | 'lanskap')[];
}

/** Perkiraan jumlah kolom yang muat, dipakai tataLetak untuk memutuskan orientasi. */
const MUAT: MuatKolom = { potret: 6, lanskap: 10 };

function orientasiJsPdf(orientasi: 'potret' | 'lanskap'): 'portrait' | 'landscape' {
  return orientasi === 'lanskap' ? 'landscape' : 'portrait';
}

/** Melempar alih-alih mengosongkan: sel yang hilang harus terlihat, bukan tersamar. */
function ambilSel(deret: string[], indeks: number, keterangan: string): string {
  const isi = deret[indeks];
  if (isi === undefined) {
    throw new Error(
      `${keterangan} meminta kolom ke-${indeks}, padahal hanya ada ${deret.length} sel di sana. ` +
        'Ini berarti rencana halaman dan bentuk tabel tidak lagi sejalan; jangan tulis PDF ' +
        'dengan sel kosong sebagai gantinya, karena sel kosong terbaca sebagai nilai nol.',
    );
  }
  return isi;
}

export function tulisPdf(tabel: TabelTampil[], kepala: KepalaLaporan): Uint8Array;
export function tulisPdf(
  tabel: TabelTampil[],
  kepala: KepalaLaporan,
  opsi: { kembalikanInfo: true },
): InfoPdf;
export function tulisPdf(
  tabel: TabelTampil[],
  kepala: KepalaLaporan,
  opsi?: { kembalikanInfo: true },
): Uint8Array | InfoPdf {
  if (tabel.length === 0) {
    throw new Error(
      'tulisPdf dipanggil tanpa satu tabel pun untuk ditulis, sehingga berkasnya hanya akan berisi ' +
        'kepala laporan dan catatan kaki — laporan yang tampak sah lengkap dengan jumlah responden, ' +
        'padahal tidak memuat satu baris data pun. Sertakan minimal satu TabelTampil sebelum ' +
        'memanggil tulisPdf. Tabel yang tidak punya baris tetap sah: itulah cara menyatakan sesi ' +
        'yang memang belum diisi siapa pun.',
    );
  }

  for (const satu of tabel) pastikanTabelSah(satu);

  const rencanaPerTabel = tabel.map((satu) =>
    rencanakanHalaman(satu.kolom.length, satu.kolomIdentitas, MUAT),
  );

  // Halaman pertama memakai orientasi tabel pertama; setiap tabel berikutnya bisa
  // punya orientasinya sendiri (lihat penambahan halaman di bawah).
  const rencanaPertama = rencanaPerTabel[0];
  const orientasiAwal = rencanaPertama === undefined ? 'potret' : rencanaPertama.orientasi;
  const doc = new jsPDF({ orientation: orientasiJsPdf(orientasiAwal), unit: 'pt' });

  doc.setFontSize(14);
  doc.text(kepala.judul, 40, 40);
  doc.setFontSize(10);
  doc.text(`Tanggal: ${kepala.tanggal}    Jumlah responden: ${kepala.jumlahResponden}`, 40, 58);

  let mulaiY = 80;

  for (let i = 0; i < tabel.length; i += 1) {
    const satu = tabel[i];
    const rencana = rencanaPerTabel[i];
    if (satu === undefined || rencana === undefined) continue;
    const orientasiHalaman = orientasiJsPdf(rencana.orientasi);

    for (const potongan of rencana.potongan) {
      autoTable(doc, {
        startY: mulaiY,
        head: [potongan.map((k) => ambilSel(satu.kolom, k, `Kepala tabel "${satu.judul}"`))],
        body: satu.baris.map((baris, n) =>
          potongan.map((k) => ambilSel(baris, k, `Baris ke-${n} tabel "${satu.judul}"`)),
        ),
        styles: { fontSize: 8 },
        // Kepala tabel diulang di tiap halaman supaya tabel panjang tetap terbaca.
        showHead: 'everyPage',
        margin: { top: 40, bottom: 40 },
      });
      mulaiY = 40;
      if (potongan !== rencana.potongan[rencana.potongan.length - 1]) {
        doc.addPage(undefined, orientasiHalaman);
      }
    }

    // Halaman awal tabel berikutnya memakai orientasi tabel BERIKUTNYA, bukan tabel ini.
    const rencanaBerikutnya = rencanaPerTabel[i + 1];
    if (rencanaBerikutnya !== undefined) {
      doc.addPage(undefined, orientasiJsPdf(rencanaBerikutnya.orientasi));
      mulaiY = 40;
    }
  }

  const jumlahHalaman = doc.getNumberOfPages();
  const bentukHalaman: ('potret' | 'lanskap')[] = [];
  for (let h = 1; h <= jumlahHalaman; h += 1) {
    doc.setPage(h);
    bentukHalaman.push(
      doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight() ? 'lanskap' : 'potret',
    );
    doc.setFontSize(8);
    doc.text(
      `Dibuat ${kepala.dibuatPada} — status sesi: ${kepala.statusSesi} — halaman ${h}/${jumlahHalaman}`,
      40,
      doc.internal.pageSize.getHeight() - 20,
    );
  }

  const berkas = new Uint8Array(doc.output('arraybuffer'));
  if (opsi?.kembalikanInfo !== true) return berkas;

  return {
    berkas,
    jumlahHalaman,
    orientasiPerTabel: rencanaPerTabel.map((r) => r.orientasi),
    jumlahPotonganPerTabel: rencanaPerTabel.map((r) => r.potongan.length),
    bentukHalaman,
  };
}
