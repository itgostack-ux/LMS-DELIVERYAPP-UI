import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LogisticsService } from '../../services/logistics-service';
import { Courier } from '../../services/models/common-master-model';

@Component({
  selector: 'app-courier-master',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl: './courier-master.html',
  styleUrl: './courier-master.css'
})
export class CourierMaster implements OnInit {

  couriers: Courier[] = [];
  pagedCouriers: Courier[] = [];

  isLoading = false;

  currentPage = 1;
  pageSize = 10;
  totalPages = 0;

  constructor(
    private logisticsService: LogisticsService
  ) { }

  ngOnInit(): void {
    this.loadCouriers();
  }

  loadCouriers(): void {

    this.isLoading = true;

    this.logisticsService.getCouriers().subscribe({

      next: (res) => {

        this.couriers = res.sort((a, b) => a.courierId - b.courierId);

        this.totalPages = Math.ceil(this.couriers.length / this.pageSize);

        this.setPage(1);

        this.isLoading = false;

      },

      error: (err) => {

        console.log(err);

        this.isLoading = false;

      }

    });

  }

  setPage(page: number): void {

    if (page < 1 || page > this.totalPages)
      return;

    this.currentPage = page;

    const start = (page - 1) * this.pageSize;
    const end = start + this.pageSize;

    this.pagedCouriers = this.couriers.slice(start, end);

  }

  previousPage(): void {
    this.setPage(this.currentPage - 1);
  }

  nextPage(): void {
    this.setPage(this.currentPage + 1);
  }

}