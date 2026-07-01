import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LogisticsService } from '../../services/logistics-service';
import { DeliveryLifecycle } from '../../services/models/common-master-model';

@Component({
  selector: 'app-delivery-lifecycle-master',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './delivery-lifecycle-master.html',
  styleUrl: './delivery-lifecycle-master.css'
})
export class DeliveryLifecycleMaster implements OnInit {

  deliveryLifecycles: DeliveryLifecycle[] = [];
  pagedDeliveryLifecycles: DeliveryLifecycle[] = [];

  lifecycle: DeliveryLifecycle = this.resetModel();

  isLoading = false;

  isEdit = false;

  currentPage = 1;
  pageSize = 10;
  totalPages = 0;

  constructor(
    private logisticsService: LogisticsService
  ) { }

  ngOnInit(): void {

    this.loadDeliveryLifecycles();

  }

  resetModel(): DeliveryLifecycle {

    return {

      lifecycleId: 0,
      sequenceNo: 0,
      statusCode: '',
      statusName: '',
      nextStatusCode: '',
      colorCode: '#6B7280',
      description: '',
      isActive: true,
      createdBy: '',
      createdDate: new Date(),
      modifiedBy: '',
      modifiedDate: new Date()

    };

  }

  loadDeliveryLifecycles(): void {

    this.isLoading = true;

    this.logisticsService.getDeliveryLifecycles().subscribe({

      next: (res) => {

        this.deliveryLifecycles =
          res.sort((a, b) => a.sequenceNo - b.sequenceNo);

        this.totalPages =
          Math.ceil(this.deliveryLifecycles.length / this.pageSize);

        this.setPage(1);

        this.isLoading = false;

      },

      error: err => {

        console.log(err);

        this.isLoading = false;

      }

    });

  }

  saveLifecycle() {

    if (!this.lifecycle.statusCode ||
        !this.lifecycle.statusName) {

      alert("Status Code and Status Name are required.");

      return;

    }

    this.logisticsService
      .saveDeliveryLifecycle(this.lifecycle)
      .subscribe({

        next: (res: any) => {

          alert(res.message);

          this.cancel();

          this.loadDeliveryLifecycles();

        },

        error: err => console.log(err)

      });

  }

  editLifecycle(item: DeliveryLifecycle) {

    this.isEdit = true;

    this.lifecycle = { ...item };

  }

  deleteLifecycle(item: DeliveryLifecycle) {

    if (!confirm("Delete this Lifecycle?"))
      return;

    item.isActive = false;

    this.logisticsService
      .saveDeliveryLifecycle(item)
      .subscribe({

        next: (res: any) => {

          alert(res.message);

          this.loadDeliveryLifecycles();

        },

        error: err => console.log(err)

      });

  }

  cancel() {

    this.lifecycle = this.resetModel();

    this.isEdit = false;

  }

  setPage(page: number) {

    if (page < 1 || page > this.totalPages)
      return;

    this.currentPage = page;

    const start = (page - 1) * this.pageSize;

    this.pagedDeliveryLifecycles =
      this.deliveryLifecycles.slice(start, start + this.pageSize);

  }

  previousPage() {

    this.setPage(this.currentPage - 1);

  }

  nextPage() {

    this.setPage(this.currentPage + 1);

  }

}