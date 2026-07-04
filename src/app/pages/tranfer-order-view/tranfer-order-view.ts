import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LogisticsService } from '../../services/logistics-service';
import {
  DeliveryLifecycle,
  DeliveryOrderTransaction
} from '../../services/models/common-master-model';

@Component({
  selector: 'app-tranfer-order-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './tranfer-order-view.html',
  styleUrls: ['./tranfer-order-view.css']
})
export class TranferOrderView implements OnInit {

  // ===== Data =====
  orders: DeliveryOrderTransaction[] = [];
  deliveryLifecycles: DeliveryLifecycle[] = [];

  loading = false;

  // ===== Filter selections =====
  selectedSourceId = 0;
  selectedDestinationId = 0;
  selectedLifecycleCode = '';
  searchText = '';

  // ===== Filter dropdown options (built from loaded data) =====
  sourceLocations: { id: number; name: string }[] = [];
  destinationLocations: { id: number; name: string }[] = [];

  // ===== Expanded tracking row =====
  expandedOrderId: number | null = null;

  // ===== Pagination state =====
  currentPage = 1;
  pageSize = 10;

  constructor(private logisticsService: LogisticsService) { }

  ngOnInit(): void {
    this.loadDeliveryLifecycles();
    this.loadOrders();
  }

  // ===== Data loading =====

  loadDeliveryLifecycles(): void {
    this.logisticsService.getDeliveryLifecycles().subscribe({
      next: (res) => {
        this.deliveryLifecycles = res
          .filter(x => x.isActive)
          .sort((a, b) => a.sequenceNo - b.sequenceNo);
      },
      error: err => console.error('Failed to load delivery lifecycles:', err)
    });
  }

  loadOrders(): void {

    this.loading = true;

    this.logisticsService.getDeliveryOrderTransactions().subscribe({

      next: (res) => {

        this.orders = (res ?? []).sort((a, b) => {
          // Latest activity first
          const aDate = a.modifiedDate ?? a.createdDate ?? '';
          const bDate = b.modifiedDate ?? b.createdDate ?? '';
          return bDate.localeCompare(aDate);
        });

        this.buildFilterOptions();

        this.currentPage = 1;
        this.loading = false;

      },

      error: (err) => {
        console.error('Failed to load delivery order transactions:', err);
        this.orders = [];
        this.loading = false;
      }

    });

  }

  // Distinct source / destination locations from the loaded data
  private buildFilterOptions(): void {

    const sourceMap = new Map<number, string>();
    const destMap = new Map<number, string>();

    for (const o of this.orders) {

      if (o.sourceLocationId && !sourceMap.has(o.sourceLocationId)) {
        sourceMap.set(o.sourceLocationId, o.sourceLocationName ?? '');
      }

      if (o.destinationLocationId && !destMap.has(o.destinationLocationId)) {
        destMap.set(o.destinationLocationId, o.destinationLocationName ?? '');
      }

    }

    this.sourceLocations = Array.from(sourceMap, ([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    this.destinationLocations = Array.from(destMap, ([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

  }

  // ===== Filtering =====

  get filteredOrders(): DeliveryOrderTransaction[] {

    const search = this.searchText.trim().toLowerCase();

    return this.orders.filter(o => {

      if (this.selectedSourceId !== 0 &&
          o.sourceLocationId !== this.selectedSourceId) {
        return false;
      }

      if (this.selectedDestinationId !== 0 &&
          o.destinationLocationId !== this.selectedDestinationId) {
        return false;
      }

      if (this.selectedLifecycleCode !== '' &&
          o.lifecycleCode !== this.selectedLifecycleCode) {
        return false;
      }

      if (search) {
        const haystack = [
          o.transitID?.toString(),
          o.deliveryNoteNo,
          o.imei,
          o.itemName,
          o.itemCode,
          o.awbBillNo
        ].join(' ').toLowerCase();

        if (!haystack.includes(search)) {
          return false;
        }
      }

      return true;

    });

  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.expandedOrderId = null;
  }

  clearFilters(): void {
    this.selectedSourceId = 0;
    this.selectedDestinationId = 0;
    this.selectedLifecycleCode = '';
    this.searchText = '';
    this.onFilterChange();
  }

  get hasActiveFilters(): boolean {
    return this.selectedSourceId !== 0
      || this.selectedDestinationId !== 0
      || this.selectedLifecycleCode !== ''
      || this.searchText.trim() !== '';
  }

  // ===== Tracking timeline =====

  toggleTrack(order: DeliveryOrderTransaction): void {
    this.expandedOrderId =
      this.expandedOrderId === order.transferOrderId
        ? null
        : (order.transferOrderId ?? null);
  }

  isExpanded(order: DeliveryOrderTransaction): boolean {
    return this.expandedOrderId === order.transferOrderId;
  }

  // Stage state for the timeline: 'done' | 'current' | 'pending'
  stageState(order: DeliveryOrderTransaction, stage: DeliveryLifecycle): string {

    if (stage.sequenceNo < order.lifecycleSequenceNo) {
      return 'done';
    }

    if (stage.sequenceNo === order.lifecycleSequenceNo) {
      return 'current';
    }

    return 'pending';

  }

  // % of the lifecycle completed — drives the progress bar
  progressPercent(order: DeliveryOrderTransaction): number {

    if (this.deliveryLifecycles.length <= 1) {
      return 0;
    }

    const maxSeq = this.deliveryLifecycles[this.deliveryLifecycles.length - 1].sequenceNo;
    const minSeq = this.deliveryLifecycles[0].sequenceNo;

    const pct = ((order.lifecycleSequenceNo - minSeq) / (maxSeq - minSeq)) * 100;

    return Math.max(0, Math.min(100, Math.round(pct)));

  }

  // Badge class per status code
  statusClass(code: string): string {
    switch (code) {
      case 'DELIVERED':
      case 'RECEIVED':
        return 'lc-delivered';
      case 'IN_TRANSIT':
      case 'PICKED_UP':
        return 'lc-transit';
      case 'PICKUP_ASSIGNED':
      case 'PICKUP_READY':
        return 'lc-ready';
      default:
        return 'lc-open';
    }
  }

  // ===== Pagination =====

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredOrders.length / this.pageSize));
  }

  get startIndex(): number {
    return (this.currentPage - 1) * this.pageSize;
  }

  get endIndex(): number {
    return Math.min(this.startIndex + Number(this.pageSize), this.filteredOrders.length);
  }

  get pagedOrders(): DeliveryOrderTransaction[] {
    return this.filteredOrders.slice(this.startIndex, this.endIndex);
  }

  get visiblePages(): number[] {
    const total = this.totalPages;
    const maxButtons = 5;

    let start = Math.max(1, this.currentPage - 2);
    const end = Math.min(total, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);

    const pages: number[] = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) {
      return;
    }
    this.currentPage = page;
    this.expandedOrderId = null;
  }

  onPageSizeChange(): void {
    this.pageSize = Number(this.pageSize);
    this.currentPage = 1;
  }

  trackByOrderId(index: number, item: DeliveryOrderTransaction): number {
    return item.transferOrderId ?? item.transitID;
  }
}