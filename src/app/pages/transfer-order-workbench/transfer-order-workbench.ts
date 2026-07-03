import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { LogisticsService } from '../../services/logistics-service';
import {
  Company,
  Location,
  LocationType,
  DeliveryLifecycle,
  DeliveryOrderTransaction,
  TransferStockLogDetail,

} from '../../services/models/common-master-model';

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
  saving = false;

  selectAll = false;

  validationMessage = '';

  fromDate = this.today();
  toDate = this.today();

  // ===== Pagination state =====
  currentPage = 1;
  pageSize = 10;

  deliveryLifecycles: DeliveryLifecycle[] = [];

  // ===== Pickup Assignment modal state =====
  showPickupModal = false;
  pickupValidationMessage = '';
  private pendingNextLifecycle: DeliveryLifecycle | undefined;

  pickupLoadMode: 'Direct' | 'Courier' = 'Direct';

  // Direct fields
  pickupDriverName = '';
  pickupVehicleInfo = '';

  // Courier fields
  pickupCourierName = '';
  pickupAwbNo = '';

  pickupRemarks = '';

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
      error: err => console.error('Failed to load delivery lifecycles:', err)
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

  // ===== Selection =====

  // Only rows with a logistics status (In Transit) are selectable;
  // Received rows have blank status and are excluded from the workflow.
  toggleSelectAll(): void {
    this.pagedLogs
      .filter(x => !!x.logisticsStatus)
      .forEach(x => x.selected = this.selectAll);
  }

  // ===== Load grid =====

  loadTransferLogs(): void {

    if (this.selectedCompanyId === 0) {
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
            .map((item: any): TransferStockLogDetail => ({

              transferOrderId: item.transferOrderId ?? 0,

              transitID: item.transitID,
              deliveryNoteNo: item.deliveryNoteNo ?? '',

              transferOutDate: item.transferOutDate,
              transferOutTime: item.transferOutTime,

              sourceLocationId: item.sourceLocationId ?? 0,
              sourceLocationName: item.sourceLocationName ?? item.sourceBranch ?? '',
              sourceBranch: item.sourceBranch ?? '',

              destinationLocationId: item.destinationLocationId ?? 0,
              destinationLocationName: item.destinationLocationName ?? item.destinationBranch ?? '',
              destinationBranch: item.destinationBranch ?? '',

              itemCode: item.itemCode ?? '',
              itemName: item.itemName ?? '',
              imei: item.imei ?? '',

              transferQty: item.transferQty ?? 0,

              transferStatus: item.transferStatus ?? '',

              // SP returns TransferOutByUserId / TransferredOutBy —
              // map them onto the DeliveryOrderTransaction field names
              transferOutById: item.transferOutById ?? item.transferOutByUserId ?? 0,
              transferOutByName: item.transferOutByName ?? item.transferredOutBy ?? '',

              transferInTime: item.transferInTime ?? undefined,

              inwardDoneById: item.inwardDoneById ?? item.inwardDoneByUserId ?? 0,
              inwardDoneByName: item.inwardDoneByName ?? item.inwardDoneBy ?? '',

              transferDuration: item.transferDuration ?? '',

              // Lifecycle comes straight from the SP (#DOT join)
              lifecycleId: item.lifecycleId ?? 10,
              lifecycleSequenceNo: item.lifecycleSequenceNo ?? 1,
              lifecycleCode: item.lifecycleCode ?? 'OPEN',
              lifecycleName: item.lifecycleName ?? 'Open',

              transferModeId: item.transferModeId ?? 0,
              transferModeName: item.transferModeName ?? '',

              assignedUserId: item.assignedUserId ?? 0,
              assignedUserName: item.assignedUserName ?? '',

              courierId: item.courierId ?? 0,
              courierName: item.courierName ?? '',

              awbBillNo: item.awbBillNo ?? '',

              remarks: item.remarks ?? '',

              isActive: item.isActive ?? true,

              createdBy: item.createdBy ?? 1,
              createdByName: item.createdByName ?? '',
              createdDate: item.createdDate || new Date().toISOString(),

              modifiedBy: item.modifiedBy ?? 0,
              modifiedByName: item.modifiedByName ?? '',
              modifiedDate: item.modifiedDate ?? undefined,

              // ===== UI =====
              // Straight from the API — the SP decides:
              //   Received                        -> ''   (blank, not selectable)
              //   In Transit + lifecycle row      -> stage name
              //   In Transit + no lifecycle row   -> 'Open'
              logisticsStatus: item.logisticsStatus ?? '',

              selected: false,

              deliveryLifecycles: [],
              currentLifecycle: undefined

            }))
            .sort((a, b) => {

              // Workflow rows (with a logistics status) first
              const aActive = !!a.logisticsStatus;
              const bActive = !!b.logisticsStatus;

              if (aActive && !bActive) return -1;
              if (!aActive && bActive) return 1;

              return a.transitID - b.transitID;

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

  // ===== Selection getters =====

  get selectedOrders(): TransferStockLogDetail[] {
    return this.transferLogs.filter(x => x.selected);
  }

  get selectedCount(): number {
    return this.selectedOrders.length;
  }

  get selectedStatus(): string {

    if (this.selectedOrders.length === 0) {
      return '';
    }

    return this.selectedOrders[0].logisticsStatus;

  }

  get isSameStatus(): boolean {

    if (this.selectedOrders.length <= 1) {
      return true;
    }

    const status = this.selectedOrders[0].logisticsStatus;

    return this.selectedOrders.every(x => x.logisticsStatus === status);

  }

  get actionButtonText(): string {

    if (!this.selectedStatus) {
      return '';
    }

    const current = this.deliveryLifecycles.find(
      x => x.statusName === this.selectedStatus
    );

    if (!current || !current.nextStatusCode) {
      return '';
    }

    const next = this.deliveryLifecycles.find(
      x => x.statusCode === current.nextStatusCode
    );

    return next ? next.statusName : '';

  }

  // ===== Save flow =====

  /**
   * Builds a clean, backend-safe payload. Field names in
   * TransferStockLogDetail now match DeliveryOrderTransaction,
   * so the mapping is direct. Every field gets an explicit value —
   * nothing goes out as undefined (HttpClient drops undefined keys)
   * and no DateTime field is ever sent as ''.
   *
   * `extra` lets a caller (e.g. the Pickup Assignment modal) override
   * specific fields — such as transferModeName, assignedUserName,
   * courierName, awbBillNo, remarks — that aren't already sitting on
   * the row before this transition.
   */
  private buildRequest(
    order: TransferStockLogDetail,
    nextLifecycle: DeliveryLifecycle,
    extra: Partial<TransferStockLogDetail> = {}
  ): DeliveryOrderTransaction {

    return {

      // Existing lifecycle record id (0 = first action on this item)
      transferOrderId: order.transferOrderId ?? 0,

      transitID: order.transitID,
      deliveryNoteNo: order.deliveryNoteNo ?? '',

      transferOutDate: order.transferOutDate,
      transferOutTime: order.transferOutTime,

      sourceLocationId: order.sourceLocationId ?? 0,
      sourceLocationName: order.sourceLocationName ?? '',

      destinationLocationId: order.destinationLocationId ?? 0,
      destinationLocationName: order.destinationLocationName ?? '',

      itemCode: order.itemCode ?? '',
      itemName: order.itemName ?? '',
      imei: order.imei ?? '',

      transferQty: order.transferQty ?? 0,

      lifecycleId: nextLifecycle.lifecycleId,
      lifecycleSequenceNo: nextLifecycle.sequenceNo,
      lifecycleCode: nextLifecycle.statusCode,
      lifecycleName: nextLifecycle.statusName,

      transferModeId: extra.transferModeId ?? order.transferModeId ?? 0,
      transferModeName: extra.transferModeName ?? order.transferModeName ?? '',

      transferOutById: order.transferOutById ?? 0,
      transferOutByName: order.transferOutByName ?? '',

      assignedUserId: extra.assignedUserId ?? order.assignedUserId ?? 0,
      assignedUserName: extra.assignedUserName ?? order.assignedUserName ?? '',

      courierId: extra.courierId ?? order.courierId ?? 0,
      courierName: extra.courierName ?? order.courierName ?? '',

      awbBillNo: extra.awbBillNo ?? order.awbBillNo ?? '',

      transferInTime: order.transferInTime ?? undefined,

      inwardDoneById: order.inwardDoneById ?? 0,
      inwardDoneByName: order.inwardDoneByName ?? '',

      transferDuration: order.transferDuration ?? '',

      remarks: extra.remarks ?? order.remarks ?? '',

      isActive: true,

      createdBy: order.createdBy || 1,
      createdByName: order.createdByName || '',
      createdDate: order.createdDate || new Date().toISOString(),

      // TODO: replace with the logged-in user once auth is wired up
      modifiedBy: 1,
      modifiedByName: 'Admin',
      modifiedDate: new Date().toISOString()

    };

  }

  processSelectedOrders(): void {

    if (this.selectedOrders.length === 0) {
      alert('Please select at least one order.');
      return;
    }

    if (!this.isSameStatus) {
      alert('Please select orders with the same Logistics Status.');
      return;
    }

    const currentLifecycle = this.deliveryLifecycles.find(
      x => x.statusName === this.selectedStatus
    );

    if (!currentLifecycle) {
      alert('Current lifecycle not found.');
      return;
    }

    const nextLifecycle = this.deliveryLifecycles.find(
      x => x.statusCode === currentLifecycle.nextStatusCode
    );

    if (!nextLifecycle) {
      alert('Next lifecycle not found.');
      return;
    }

    // Moving INTO "Pickup Assigned" needs Direct/Courier details first —
    // open the popup instead of saving right away.
    if (nextLifecycle.statusCode === 'PICKUP_ASSIGNED') {
      this.pendingNextLifecycle = nextLifecycle;
      this.openPickupAssignModal();
      return;
    }

    this.saveWithLifecycle(nextLifecycle);

  }

  private saveWithLifecycle(
    nextLifecycle: DeliveryLifecycle,
    extra: Partial<TransferStockLogDetail> = {}
  ): void {

    const requests = this.selectedOrders.map(order => {
      const payload = this.buildRequest(order, nextLifecycle, extra);
      console.log('Sending payload:', payload);
      return this.logisticsService.saveDeliveryOrderTransaction(payload);
    });

    this.saving = true;

    // Wait for ALL saves to complete before alerting and reloading —
    // otherwise the grid refreshes with stale data.
    forkJoin(requests).subscribe({

      next: (results) => {
        console.log('All saved:', results);
        this.saving = false;

        alert(`Status updated to ${nextLifecycle.statusName}`);

        this.clearSelection();
        this.loadTransferLogs();
      },

      error: (err) => {
        this.saving = false;
        console.error('Save failed:', err);

        if (err?.error?.errors) {
          console.error('Validation errors:', err.error.errors);
        }

        alert('Failed to update one or more orders. Check the console / Network tab for details.');

        this.loadTransferLogs();
      }

    });

  }

  clearSelection(): void {

    this.selectAll = false;

    this.transferLogs.forEach(x => x.selected = false);

  }

  // ===== Pickup Assignment modal =====

  openPickupAssignModal(): void {
    this.pickupLoadMode = 'Direct';
    this.pickupDriverName = '';
    this.pickupVehicleInfo = '';
    this.pickupCourierName = '';
    this.pickupAwbNo = '';
    this.pickupRemarks = '';
    this.pickupValidationMessage = '';
    this.showPickupModal = true;
  }

  closePickupModal(): void {
    this.showPickupModal = false;
    this.pendingNextLifecycle = undefined;
  }

  setLoadMode(mode: 'Direct' | 'Courier'): void {
    this.pickupLoadMode = mode;
    this.pickupValidationMessage = '';
  }

  confirmPickupAssignment(): void {

    this.pickupValidationMessage = '';

    if (this.pickupLoadMode === 'Direct') {
      if (!this.pickupDriverName.trim()) {
        this.pickupValidationMessage = 'Please select a driver.';
        return;
      }
    } else {
      if (!this.pickupCourierName.trim()) {
        this.pickupValidationMessage = 'Please enter the courier name.';
        return;
      }
      if (!this.pickupAwbNo.trim()) {
        this.pickupValidationMessage = 'Please enter the AWB / Bill No.';
        return;
      }
    }

    if (!this.pendingNextLifecycle) {
      this.showPickupModal = false;
      return;
    }

    const extra: Partial<TransferStockLogDetail> = {
      transferModeId: this.pickupLoadMode === 'Direct' ? 1 : 2,
      transferModeName: this.pickupLoadMode
    };

    if (this.pickupLoadMode === 'Direct') {
      extra.assignedUserName = this.pickupDriverName.trim();
      extra.assignedUserId = 0;
      extra.remarks = this.pickupVehicleInfo.trim();
    } else {
      extra.courierName = this.pickupCourierName.trim();
      extra.courierId = 0;
      extra.awbBillNo = this.pickupAwbNo.trim();
      extra.remarks = this.pickupRemarks.trim();
    }

    const nextLifecycle = this.pendingNextLifecycle;

    this.showPickupModal = false;
    this.pendingNextLifecycle = undefined;

    this.saveWithLifecycle(nextLifecycle, extra);

  }
}