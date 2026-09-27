import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { TabelTampil } from '../core/tabelTampil';
import { rencanakanHalaman } from '../core/tataLetak';
import type { MuatKolom } from '../core/tataLetak';

export interface KepalaLaporan {
  judul: string;
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
}

/** Perkiraan jumlah kolom yang muat, dipakai tataLetak untuk memutuskan orientasi. */
const MUAT: MuatKolom = { potret: 6, lanskap: 10 };

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
  const rencanaPerTabel = tabel.map((satu) =>
    rencanakanHalaman(satu.kolom.length, satu.kolomIdentitas, MUAT),
  );

  const adaLanskap = rencanaPerTabel.some((r) => r.orientasi === 'lanskap');
  const doc = new jsPDF({ orientation: adaLanskap ? 'landscape' : 'portrait', unit: 'pt' });

  doc.setFontSize(14);
  doc.text(kepala.judul, 40, 40);
  doc.setFontSize(10);
  doc.text(`Jumlah responden: ${kepala.jumlahResponden}`, 40, 58);

  let mulaiY = 80;

  for (let i = 0; i < tabel.length; i += 1) {
    const satu = tabel[i];
    const rencana = rencanaPerTabel[i];
    if (satu === undefined || rencana === undefined) continue;

    for (const potongan of rencana.potongan) {
      autoTable(doc, {
        startY: mulaiY,
        head: [potongan.map((k) => satu.kolom[k] ?? '')],
        body: satu.baris.map((baris) => potongan.map((k) => baris[k] ?? '')),
        styles: { fontSize: 8 },
        // Kepala tabel diulang di tiap halaman supaya tabel panjang tetap terbaca.
        showHead: 'everyPage',
        margin: { top: 40, bottom: 40 },
      });
      mulaiY = 40;
      if (potongan !== rencana.potongan[rencana.potongan.length - 1]) doc.addPage();
    }

    if (i < tabel.length - 1) {
      doc.addPage();
      mulaiY = 40;
    }
  }

  const jumlahHalaman = doc.getNumberOfPages();
  for (let h = 1; h <= jumlahHalaman; h += 1) {
    doc.setPage(h);
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
  };
}
