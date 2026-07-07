import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QRCodeComponent } from 'angularx-qrcode';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { LogisticsService } from '../../services/logistics-service';
import { TransferManifestResponse } from '../../services/models/common-master-model';
@Component({
  selector: 'app-manifest-print',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    QRCodeComponent
  ],
  templateUrl: './manifest-print.html',
  styleUrls: ['./manifest-print.css']
})
export class ManifestPrintComponent implements OnInit {

  constructor(
    private logisticsService: LogisticsService
  ) { }

  manifestList: TransferManifestResponse[] = [];

  manifestOrders: TransferManifestResponse[] = [];

  manifest!: TransferManifestResponse;

  selectedManifestId = 0;

  qrValue = '';

  ngOnInit(): void {

    this.loadManifestList();

  }

  loadManifestList(): void {

    this.logisticsService.getManifestOrders().subscribe({

      next: (res) => {

        this.manifestList = res;

      },

      error: (err) => {

        console.error(err);

      }

    });

  }

  loadManifest(): void {

    this.manifestOrders = this.manifestList.filter(
      x => x.manifestId == this.selectedManifestId
    );

    if (this.manifestOrders.length == 0) {

      this.qrValue = '';

      return;

    }

    this.manifest = this.manifestOrders[0];

    this.qrValue = JSON.stringify({

      ManifestId: this.manifest.manifestId,

      ManifestNo: this.manifest.manifestNo

    });

  }

  printManifest(): void {

    window.print();

  }

  downloadPdf(): void {

  const content = document.getElementById('manifest-content');

  if (!content) {
    return;
  }

  html2canvas(content, {
    scale: 2
  }).then(canvas => {

    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF('p', 'mm', 'a4');

    const pdfWidth = 210;
    const pdfHeight = 297;

    const imgWidth = pdfWidth;
    const imgHeight = canvas.height * imgWidth / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(
      imgData,
      'PNG',
      0,
      position,
      imgWidth,
      imgHeight
    );

    heightLeft -= pdfHeight;

    while (heightLeft > 0) {

      position = heightLeft - imgHeight;

      pdf.addPage();

      pdf.addImage(
        imgData,
        'PNG',
        0,
        position,
        imgWidth,
        imgHeight
      );

      heightLeft -= pdfHeight;
    }

    pdf.save(this.manifest.manifestNo + '.pdf');

  });

}
printQRCode(): void {

  const qrSection = document.getElementById('qr-print');

  if (!qrSection) {
    return;
  }

  const printWindow = window.open('', '_blank', 'width=800,height=600');

  if (!printWindow) {
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>Print QR</title>
        <style>
          body{
            font-family:Arial;
            text-align:center;
            margin-top:40px;
          }

          h2{
            margin-bottom:10px;
          }

          .manifest{
            font-size:18px;
            font-weight:bold;
            margin-bottom:20px;
          }
        </style>
      </head>

      <body>

        <h2>GoFix Delivery</h2>

        <div class="manifest">
          ${this.manifest.manifestNo}
        </div>

        ${qrSection.innerHTML}

      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {

    printWindow.print();

    printWindow.close();

  }, 500);

}

downloadQRCode(): void {

  const qrSection = document.getElementById('qr-section');

  if (!qrSection) {
    alert('QR Section not found.');
    return;
  }

  // Canvas
  const canvas = qrSection.querySelector('canvas') as HTMLCanvasElement;

  if (canvas) {

    const link = document.createElement('a');

    link.download = `${this.manifest.manifestNo}-QR.png`;

    link.href = canvas.toDataURL('image/png');

    link.click();

    return;
  }

  // Image
  const img = qrSection.querySelector('img') as HTMLImageElement;

  if (img) {

    const link = document.createElement('a');

    link.download = `${this.manifest.manifestNo}-QR.png`;

    link.href = img.src;

    link.click();

    return;
  }

  // SVG
  const svg = qrSection.querySelector('svg');

  if (svg) {

    const serializer = new XMLSerializer();

    const svgString = serializer.serializeToString(svg);

    const blob = new Blob([svgString], {
      type: 'image/svg+xml;charset=utf-8'
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');

    link.href = url;

    link.download = `${this.manifest.manifestNo}-QR.svg`;

    link.click();

    URL.revokeObjectURL(url);

    return;
  }

  alert('QR Code not found.');

}
}