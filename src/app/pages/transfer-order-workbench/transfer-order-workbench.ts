import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, from, of, Observable } from 'rxjs';
import { concatMap, toArray } from 'rxjs/operators';

import { LogisticsService } from '../../services/logistics-service';
import {
  Company,
  Location,
  LocationType,
  DeliveryLifecycle,
  DeliveryOrderTransaction,
  TransferStockLogDetail,
  TransferMode,
  User,
  Courier,
  TransferManifest
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

  transferModes: TransferMode[] = [];
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

  // Selected transfer mode (id + code drive the modal panels)
  pickupTransferModeId = 0;
  pickupLoadMode = '';          // 'DIRECT' | 'COURIER' | 'OTHERS'

  // Direct fields
  pickupDriverId = 0;

  // Common field: used by both DIRECT and OTHERS
  pickupVehicleNo = '';

  // Courier fields
  pickupCourierId = 0;
  pickupAwbNo = '';

  // Others fields
  pickupOtherPartyName = '';
  pickupTransportType = '';

  pickupRemarks = '';

  users: User[] = [];
  couriers: Courier[] = [];

  // SequenceNo at which pickup assignment happens (PICKUP_ASSIGNED) —
  // this is also the step where manifests get created, grouped by
  // source location. Kept as one constant so both places that need it
  // (processSelectedOrders + isManifestNext) stay in sync.
  private readonly PICKUP_ASSIGNED_SEQUENCE_NO = 3;

  constructor(private logisticsService: LogisticsService) { }

  ngOnInit(): void {

    this.loadCompanies();
    this.loadDeliveryLifecycles();
    this.loadTransferModes();
    this.loadUsers();
    this.loadCouriers();

    // Default until transfer modes load
    this.pickupLoadMode = 'DIRECT';
    this.pickupTransferModeId = 1;

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

  setTransferMode(mode: TransferMode): void {

    this.pickupTransferModeId = mode.transferModeId;
    this.pickupLoadMode = mode.transferModeCode;
    this.pickupValidationMessage = '';

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

  loadUsers(): void {
    this.logisticsService.getUsers().subscribe({
      next: (res: any) => {
        this.users = res;
      },
      error: err => console.error('Users API Error', err)
    });
  }

  loadTransferModes(): void {
    this.logisticsService.getTransferModes().subscribe({
      next: (res) => {

        const order: Record<string, number> = {
          DIRECT: 1,
          COURIER: 2,
          OTHERS: 3
        };

        this.transferModes = res.sort(
          (a, b) =>
            (order[a.transferModeCode] ?? 99) -
            (order[b.transferModeCode] ?? 99)
        );

        const direct = this.transferModes.find(
          x => x.transferModeCode === 'DIRECT'
        );

        if (direct) {
          this.setTransferMode(direct);
        }

      },
      error: err => console.error(err)
    });
  }

  loadCouriers(): void {
    this.logisticsService.getCouriers().subscribe({
      next: (res: any) => {
        this.couriers = res;
      },
      error: err => console.error(err)
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
              transferOutById: item.transferOutByUserId,
              transferOutByName: item.transferredOutBy,

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

              assignedUserId: item.pickupDriverId ?? 0,
              assignedUserName: item.fullName ?? '',

              courierId: item.courierId ?? 0,
              courierName: item.courierName ?? '',

              awbBillNo: item.awbBillNo ?? '',

              // Vehicle / Other party details (common fields)
              vehicleNo: item.vehicleNo ?? '',
              otherPartyName: item.otherPartyName ?? '',
              otherPartyType: item.otherPartyType ?? '',

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

  // ===== Manifest grouping info (for the action toolbar hint) =====

  // Number of distinct source locations among the selected orders.
  // Moving to Pickup Assigned creates one manifest per source location.
  get selectedSourceLocationCount(): number {

    const ids = new Set(
      this.selectedOrders.map(x => x.sourceLocationId)
    );

    return ids.size;

  }

  // True when the NEXT lifecycle step (by sequenceNo) is Pickup Assigned —
  // that's the step where manifest(s) get created, grouped by source location.
  get isManifestNext(): boolean {

    const current = this.deliveryLifecycles.find(
      x => x.statusName === this.selectedStatus
    );

    if (!current) {
      return false;
    }

    const next = this.deliveryLifecycles.find(
      x => x.statusCode === current.nextStatusCode
    );

    return next?.sequenceNo === this.PICKUP_ASSIGNED_SEQUENCE_NO;

  }

  private buildRequest(
    order: TransferStockLogDetail,
    nextLifecycle: DeliveryLifecycle,
    extra: Partial<DeliveryOrderTransaction> = {}
  ): DeliveryOrderTransaction {

    return {

      transferOrderId: order.transferOrderId ?? 0,

      transitID: order.transitID,
      deliveryNoteNo: order.deliveryNoteNo ?? '',

      transferOutDate: order.transferOutDate,
      transferOutTime: order.transferOutTime,

      sourceLocationId: order.sourceLocationId,
      sourceLocationName: order.sourceLocationName ?? '',

      destinationLocationId: order.destinationLocationId,
      destinationLocationName: order.destinationLocationName ?? '',

      itemCode: order.itemCode ?? '',
      itemName: order.itemName ?? '',
      imei: order.imei ?? '',

      transferQty: order.transferQty ?? 0,

      // Lifecycle
      lifecycleId: nextLifecycle.lifecycleId,
      lifecycleSequenceNo: nextLifecycle.sequenceNo,
      lifecycleCode: nextLifecycle.statusCode,
      lifecycleName: nextLifecycle.statusName,

      // Transfer Mode
      transferModeId: extra.transferModeId ?? order.transferModeId ?? 0,
      transferModeName: extra.transferModeName ?? order.transferModeName ?? '',

      // Original Transfer Out Details (Never Change)
      transferOutById: order.transferOutById,
      transferOutByName: order.transferOutByName,

      // Driver Assignment (DIRECT)
      assignedUserId: extra.assignedUserId ?? order.assignedUserId ?? 0,
      assignedUserName: extra.assignedUserName ?? order.assignedUserName ?? '',

      // Courier Assignment (COURIER)
      courierId: extra.courierId ?? order.courierId ?? 0,
      courierName: extra.courierName ?? order.courierName ?? '',

      awbBillNo: extra.awbBillNo ?? order.awbBillNo ?? '',

      // Vehicle No — common parameter, used by both DIRECT and OTHERS
      vehicleNo: extra.vehicleNo ?? order.vehicleNo ?? '',

      // Other Party (OTHERS)
      otherPartyName: extra.otherPartyName ?? order.otherPartyName ?? '',
      otherPartyType: extra.otherPartyType ?? order.otherPartyType ?? '',

      transferInTime: order.transferInTime,

      inwardDoneById: order.inwardDoneById ?? 0,
      inwardDoneByName: order.inwardDoneByName ?? '',

      transferDuration: order.transferDuration ?? '',

      remarks: extra.remarks ?? order.remarks ?? '',

      isActive: true,

      createdBy: order.createdBy,
      createdByName: order.createdByName,
      createdDate: order.createdDate,

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

    // Moving into "Pickup Assigned" (sequenceNo 3) needs Direct/Courier/Other
    // details first — open the popup instead of saving right away. This is
    // also the step where manifest(s) get created, one per source location.
    if (nextLifecycle.sequenceNo === this.PICKUP_ASSIGNED_SEQUENCE_NO) {
      this.pendingNextLifecycle = nextLifecycle;
      this.openPickupAssignModal();
      return;
    }

    // Any other transition (Open -> Pickup Ready, Picked Up -> Delivered,
    // etc.) is a plain status update — no manifest involved.
    this.saveWithLifecycle(nextLifecycle);

  }

  // ===== Manifest creation (grouped by source location) =====

  private buildManifest(
    order: TransferStockLogDetail,
    nextLifecycle: DeliveryLifecycle,
    manifestNo: string,
    extra: Partial<DeliveryOrderTransaction> = {}
  ): TransferManifest {

    return {

      manifestId: 0,

      // '' = backend generates a new manifest number for this group;
      // non-empty = reuse the number already generated for this group
      manifestNo: manifestNo,

      transferOrderId: order.transferOrderId ?? 0,

      // Driver/Courier assignment from the Pickup Assignment modal,
      // falling back to whatever is already on the order
      assignedUserId: extra.assignedUserId ?? order.assignedUserId ?? 0,
      assignedUserName: extra.assignedUserName ?? order.assignedUserName ?? '',

      receiverUserId: 0,
      receiverUserName: '',

      otp: '',

      // Lifecycle -> Pickup Assigned
      lifecycleId: nextLifecycle.lifecycleId,
      lifecycleSequenceNo: nextLifecycle.sequenceNo,
      lifecycleCode: nextLifecycle.statusCode,
      lifecycleName: nextLifecycle.statusName,

      manifestDate: new Date(),
      status: nextLifecycle.statusName

    };
  }

  // Saves ONE source-location group:
  //   - first order goes with blank ManifestNo -> backend generates a new number
  //   - remaining orders in the same group reuse that generated number
  private saveManifestGroup(
    orders: TransferStockLogDetail[],
    nextLifecycle: DeliveryLifecycle,
    extra: Partial<DeliveryOrderTransaction> = {}
  ): Observable<any> {

    const [first, ...rest] = orders;

    return this.logisticsService
      .saveTransferManifest(this.buildManifest(first, nextLifecycle, '', extra))
      .pipe(
        concatMap((res: any) => {

          // Adjust this extraction to match your API's actual response shape
          const manifestNo: string =
            res?.manifestNo ??
            res?.data?.manifestNo ??
            res?.ManifestNo ??
            '';

          console.log(
            `Manifest ${manifestNo} created for source location ` +
            `${first.sourceLocationId} (${first.sourceLocationName})`
          );

          if (rest.length === 0) {
            return of([res]);
          }

          // Remaining orders from the SAME source location
          // save in parallel against the SAME manifest number
          return forkJoin(
            rest.map(o =>
              this.logisticsService.saveTransferManifest(
                this.buildManifest(o, nextLifecycle, manifestNo, extra)
              )
            )
          );

        })
      );

  }

  // Groups the selected orders by sourceLocationId and creates ONE manifest
  // per group, sequentially (concatMap) so every group gets its own
  // manifest number from the backend without numbers mixing between
  // locations.
  private createManifestsBySourceLocation(
    orders: TransferStockLogDetail[],
    nextLifecycle: DeliveryLifecycle,
    extra: Partial<DeliveryOrderTransaction> = {}
  ): Observable<TransferStockLogDetail[][]> {

    const groups = new Map<number, TransferStockLogDetail[]>();

    for (const order of orders) {
      const list = groups.get(order.sourceLocationId) ?? [];
      list.push(order);
      groups.set(order.sourceLocationId, list);
    }

    const groupList = [...groups.values()];

    return from(groupList).pipe(
      concatMap(groupOrders =>
        this.saveManifestGroup(groupOrders, nextLifecycle, extra).pipe(
          concatMap(() => of(groupOrders))
        )
      ),
      toArray()
    );

  }

  // ===== Combined save: updates each order's own status/assignment
  // (DeliveryOrderTransaction table) AND creates the manifest(s), one per
  // source location (TransferManifest table). Used for the Pickup Assigned
  // step, where both things need to happen together. =====
  private saveWithLifecycleAndManifest(
    nextLifecycle: DeliveryLifecycle,
    extra: Partial<DeliveryOrderTransaction> = {}
  ): void {

    const ordersToSave = [...this.selectedOrders];

    this.saving = true;

    // Step 1: update each order's own status + assignment
    const dotRequests = ordersToSave.map(order =>
      this.logisticsService.saveDeliveryOrderTransaction(
        this.buildRequest(order, nextLifecycle, extra)
      )
    );

    forkJoin(dotRequests).pipe(

      // Step 2: create manifests, one per source location group
      concatMap(() =>
        this.createManifestsBySourceLocation(ordersToSave, nextLifecycle, extra)
      )

    ).subscribe({

      next: (groups) => {
        this.saving = false;

        alert(
          `Status updated to ${nextLifecycle.statusName}. ` +
          `${groups.length} manifest(s) created for ${groups.length} source location(s).`
        );

        this.clearSelection();
        this.loadTransferLogs();
      },

      error: (err) => {
        this.saving = false;
        console.error('Save failed:', err);

        if (err?.error?.errors) {
          console.error('Validation errors:', err.error.errors);
        }

        alert('Failed to update status or create manifest(s). Check the console / Network tab for details.');

        this.loadTransferLogs();
      }

    });

  }

  private saveWithLifecycle(
    nextLifecycle: DeliveryLifecycle,
    extra: Partial<DeliveryOrderTransaction> = {}
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

    this.showPickupModal = true;

    this.pickupValidationMessage = '';

    // Reset all modal fields
    this.pickupDriverId = 0;
    this.pickupCourierId = 0;
    this.pickupVehicleNo = '';
    this.pickupAwbNo = '';
    this.pickupOtherPartyName = '';
    this.pickupTransportType = '';
    this.pickupRemarks = '';

    const direct = this.transferModes.find(x => x.transferModeCode === 'DIRECT');

    if (direct) {
      this.setTransferMode(direct);
    }

  }

  closePickupModal(): void {
    this.showPickupModal = false;
    this.pendingNextLifecycle = undefined;
  }

  confirmPickupAssignment(): void {

    this.pickupValidationMessage = '';

    // ===== Validation (per transfer mode) =====

    if (this.pickupLoadMode === 'DIRECT') {

      if (!this.pickupDriverId) {
        this.pickupValidationMessage = 'Please select the driver.';
        return;
      }

    }
    else if (this.pickupLoadMode === 'COURIER') {

      if (!this.pickupCourierId) {
        this.pickupValidationMessage = 'Please select the courier.';
        return;
      }

      if (!this.pickupAwbNo || this.pickupAwbNo.trim() === '') {
        this.pickupValidationMessage = 'Please enter the AWB Bill Number.';
        return;
      }

    }
    else if (this.pickupLoadMode === 'OTHERS') {

      if (!this.pickupOtherPartyName || this.pickupOtherPartyName.trim() === '') {
        this.pickupValidationMessage = 'Please enter the Other Party Name.';
        return;
      }

      if (!this.pickupTransportType) {
        this.pickupValidationMessage = 'Please select transport type.';
        return;
      }

    }

    if (!this.pendingNextLifecycle) {
      this.showPickupModal = false;
      return;
    }

    // ===== Build the extra payload =====

    const selectedMode = this.transferModes.find(
      x => x.transferModeId === this.pickupTransferModeId
    );

    const extra: Partial<DeliveryOrderTransaction> = {
      transferModeId: this.pickupTransferModeId,
      transferModeName: selectedMode?.transferModeName ?? this.pickupLoadMode
    };

    if (this.pickupLoadMode === 'DIRECT') {

      const driver = this.users.find(u => u.userId === this.pickupDriverId);

      extra.assignedUserId = this.pickupDriverId;
      extra.assignedUserName = driver?.fullName ?? '';

      // Vehicle No goes in the common vehicleNo parameter
      extra.vehicleNo = this.pickupVehicleNo.trim();

    }
    else if (this.pickupLoadMode === 'COURIER') {

      const courier = this.couriers.find(c => c.courierId === this.pickupCourierId);

      extra.courierId = this.pickupCourierId;
      extra.courierName = courier?.courierName ?? '';
      extra.awbBillNo = this.pickupAwbNo.trim();
      extra.remarks = this.pickupRemarks.trim();

    }
    else if (this.pickupLoadMode === 'OTHERS') {

      extra.otherPartyName = this.pickupOtherPartyName.trim();
      extra.otherPartyType = this.pickupTransportType;

      // Same common vehicleNo parameter as DIRECT
      extra.vehicleNo = this.pickupVehicleNo.trim();

    }

    const nextLifecycle = this.pendingNextLifecycle;

    this.showPickupModal = false;
    this.pendingNextLifecycle = undefined;

    // Updates order status/assignment AND creates the per-source-location
    // manifest(s) in one combined save.
    this.saveWithLifecycleAndManifest(nextLifecycle, extra);

  }

  getLifecycleColor(status: string): string {

    const lifecycle = this.deliveryLifecycles.find(
      x => x.statusName === status
    );

    return lifecycle?.colorCode ?? '#6B7280';
  }
}