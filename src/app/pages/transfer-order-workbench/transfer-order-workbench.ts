import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LogisticsService } from '../../services/logistics-service';
import {
  Company,
  Location,
  LocationType

} from '../../services/models/common-master-model';

import {
  DeliveryLifecycle
} from '../../services/models/common-master-model';

export class TransferStockLogDetail {

  transitID!: number;
  transferOutDate!: Date;
  transferOutTime!: Date;
  sourceBranch!: string;
  deliveryNoteNo!: string;
  itemName!: string;
  itemCode!: string;
  imei!: string;
  transferredOutBy!: string;
  transferStatus!: string;
  transferQty!: number;
  destinationBranch!: string;
  transferInTime!: Date;
  inwardDoneBy!: string;
  transferDuration!: string;

  logisticsStatus: string = '';
  lifecycleId: number = 10;

  selected: boolean = false;

  deliveryLifecycles: DeliveryLifecycle[] = [];

  currentLifecycle?: DeliveryLifecycle;


}
@Component({
  selector: 'app-transfer-order-workbench',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './transfer-order-workbench.html',
  styleUrls: ['./transfer-order-workbench.css']
})
export class TransferOrderWorkbench implements OnInit {

  // ===== Master data =====
  companies: Company[] = [];
  locationTypes: LocationType[] = [];
  locations: Location[] = [];

  // ===== In-memory caches (avoid repeat API calls) =====
  private locationTypeCache = new Map<number, LocationType[]>();          // key: compId
  private locationCache = new Map<string, Location[]>();                  // key: compId-locationTypeId

  // ===== Filter selections =====
  selectedCompanyId = 0;
  selectedLocationTypeId = 0;
  selectedLocationId = 0;

  transferLogs: TransferStockLogDetail[] = [];

  loading = false;

  selectAll = false;
  selected?: boolean;

  validationMessage = '';

  fromDate = this.today();
  toDate = this.today();

  // ===== Pagination state =====
  currentPage = 1;
  pageSize = 10;
  deliveryLifecycles: DeliveryLifecycle[] = [];

  constructor(private logisticsService: LogisticsService) { }

  ngOnInit(): void {
    this.loadCompanies();

    this.loadDeliveryLifecycles();
  }

  private today(): string {
    return new Date().toISOString().split('T')[0];
  }


loadDeliveryLifecycles(): void {

  this.logisticsService.getDeliveryLifecycles().subscribe({

    next: (res) => {

      this.deliveryLifecycles = res
        .filter(x => x.isActive)
        .sort((a, b) => a.sequenceNo - b.sequenceNo);

    },

    error: err => console.log(err)

  });

}
  // ===== Master data loading =====

  loadCompanies(): void {
    this.logisticsService.getCompanies().subscribe({
      next: (res) => {
        this.companies = res;

        // Auto-select if there is only one company — saves a click
        if (res.length === 1) {
          this.selectedCompanyId = res[0].compId;
          this.onCompanyChange();
        }
      },
      error: (err) => console.error('Failed to load companies:', err)
    });
  }

  onCompanyChange(): void {

    this.locationTypes = [];
    this.locations = [];
    this.selectedLocationTypeId = 0;
    this.selectedLocationId = 0;
    this.validationMessage = '';

    if (this.selectedCompanyId == 0) {
      return;
    }

    // Serve from cache instantly if we already fetched this company
    const cached = this.locationTypeCache.get(this.selectedCompanyId);
    if (cached) {
      this.locationTypes = cached;
      return;
    }

    this.logisticsService
      .getLocationTypes(this.selectedCompanyId)
      .subscribe({
        next: (res) => {
          this.locationTypeCache.set(this.selectedCompanyId, res);
          this.locationTypes = res;
        },
        error: (err) => console.error('Failed to load location types:', err)
      });
  }



  toggleSelectAll() {
    this.pagedLogs.forEach(x => x.selected = this.selectAll);
  }
  onLocationTypeChange(): void {

    this.locations = [];
    this.selectedLocationId = 0;

    if (this.selectedLocationTypeId == 0) {
      return;
    }

    const key = `${this.selectedCompanyId}-${this.selectedLocationTypeId}`;

    const cached = this.locationCache.get(key);
    if (cached) {
      this.locations = cached;
      return;
    }

    this.logisticsService
      .getLocations(
        this.selectedCompanyId,
        this.selectedLocationTypeId
      )
      .subscribe({
        next: (res) => {
          this.locationCache.set(key, res);
          this.locations = res;
        },
        error: (err) => console.error('Failed to load locations:', err)
      });
  }
  
  loadTransferLogs(): void {

    if (this.selectedCompanyId == 0) {
      this.validationMessage = 'Please select a company before searching.';
      return;
    }

    this.validationMessage = '';
    this.loading = true;

    this.logisticsService
      .getTransferStockLogDetail(
        this.selectedCompanyId,
        this.fromDate,
        this.toDate
      )
      .subscribe({

        next: (response: any) => {

          let data: any[] = [];

          if (Array.isArray(response)) {
            data = response;
          }
          else if (response?.data) {
            data = response.data;
          }

          this.transferLogs = data
            .map(item => ({

              ...item,

              selected: false,

              logisticsStatus:
                item.transferStatus?.trim() === 'In Transit'
                  ? 'Open'
                  : ''

            }))
            .sort((a, b) => {

              const aTransit = a.transferStatus?.trim() === 'In Transit';
              const bTransit = b.transferStatus?.trim() === 'In Transit';

              if (aTransit && !bTransit) return -1;
              if (!aTransit && bTransit) return 1;

              return 0;

            });

          this.currentPage = 1;
          this.loading = false;

        },
        error: (error) => {

          console.error(error);

          this.transferLogs = [];

          this.currentPage = 1;

          this.loading = false;

        }

      });

  }

  // ===== Pagination: computed getters =====

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.transferLogs.length / this.pageSize));
  }

  get startIndex(): number {
    return (this.currentPage - 1) * this.pageSize;
  }

  get endIndex(): number {
    return Math.min(this.startIndex + Number(this.pageSize), this.transferLogs.length);
  }

  get pagedLogs(): TransferStockLogDetail[] {
    return this.transferLogs.slice(this.startIndex, this.endIndex);
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

  // ===== Pagination: methods =====

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) {
      return;
    }
    this.currentPage = page;
  }

  onPageSizeChange(): void {
    this.pageSize = Number(this.pageSize);
    this.currentPage = 1;
  }

  trackByTransitId(index: number, item: TransferStockLogDetail): number {
    return item.transitID;
  }
  get selectedOrders() {
    return this.transferLogs.filter(x => x.selected);
  }

  get selectedCount() {
    return this.selectedOrders.length;
  }
}