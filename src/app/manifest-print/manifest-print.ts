import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { QRCodeComponent } from 'angularx-qrcode';

import { LogisticsService } from '../services/logistics-service';
import { TransferManifestResponse } from '../services/models/common-master-model';



@Component({
  selector: 'app-manifest-print',
  standalone: true,
  imports: [
    CommonModule,
    QRCodeComponent
  ],
  templateUrl: './manifest-print.html',
  styleUrls: ['./manifest-print.css']
})
export class ManifestPrintComponent implements OnInit {

  manifestId = 0;

  manifestOrders: TransferManifestResponse[] = [];

  manifest!: TransferManifestResponse;

  qrValue = '';

  constructor(
    private route: ActivatedRoute,
    private logisticsService: LogisticsService
  ) { }

  ngOnInit(): void {

    this.manifestId = Number(
      this.route.snapshot.paramMap.get('id')
    );

    this.loadManifest();

  }

  loadManifest() {

    this.logisticsService.getManifestOrders()
      .subscribe(res => {

        this.manifestOrders =
          res.filter(x => x.manifestId == this.manifestId);

        if (this.manifestOrders.length > 0) {

          this.manifest = this.manifestOrders[0];

          this.qrValue = JSON.stringify({

            ManifestId: this.manifest.manifestId,

            ManifestNo: this.manifest.manifestNo

          });

          setTimeout(() => {

            window.print();

          }, 500);

        }

      });

  }

}