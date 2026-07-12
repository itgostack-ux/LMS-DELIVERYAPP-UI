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
import { UserDataService } from '../../service/user-data-service';

interface GroupedTransferLog {

  transitID: number;
  transferOrderId: number;
  deliveryNoteNo: string;

  transferOutDate: any;
  transferOutTime: any;

  sourceLocationId: number;
  sourceBranch: string;
  sourceLocationName: string;

  destinationLocationId: number;
  destinationBranch: string;
  destinationLocationName: string;

  itemCode: string;
  itemName: string;

  companyId: number;
  companyName: string;

  // ===== Aggregated quantities (frontend-only) =====
  transferQty: number;   // total IMEI records in the group
  acceptedQty: number;   // count with transferStatus === 'Received'
  pendingQty: number;    // count with transferStatus === 'In Transit'

  // Overall status pill for the group
  transferStatus: string;

  // Representative logistics (lifecycle) status for the whole group.
  // Blank => not part of the workflow / not selectable, same rule as before.
  logisticsStatus: string;

  transferModeId: number;
  transferModeName: string;

  assignedUserId: number;
  assignedUserName: string;

  courierId: number;
  courierName: string;
  awbBillNo: string;
  vehicleNo: string;

  transferOutById: number;
  transferOutByName: string;

  transferInTime: any;
  inwardDoneById: number;
  inwardDoneByName: string;

  transferDuration: string;

  pickupManifestNo: string;

  selected: boolean;

  // The raw, per-IMEI backend records that make up this TransitID.
  // This is what gets expanded back out and sent to the backend on save.
  items: TransferStockLogDetail[];
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

  // Client-side grid filter: '' = All Statuses
  selectedLifecycleStatus = '';

  transferModes: TransferMode[] = [];


  loggedInUserId = 0;
  loggedInUserName = '';

  // Raw, per-IMEI backend records — exactly what the API returns.
  // Never grouped, never mutated with computed quantities.
  transferLogs: TransferStockLogDetail[] = [];

  // Frontend-only grouping of transferLogs, one row per TransitID.
  // This is what the grid, sorting, pagination and selection operate on.
  groupedLogs: GroupedTransferLog[] = [];

  loading = false;
  saving = false;

  selectAll = false;

  validationMessage = '';

  fromDate = this.today();
  toDate = this.today();

  // ===== Pagination state =====
  currentPage = 1;
  pageSize = 10;

  // ===== Sorting state (operates on the GROUPED rows) =====
  // '' = no column sort -> keep the default load order
  // (workflow rows first, then by transitID)
  sortColumn: keyof GroupedTransferLog | '' = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  // Columns that must be compared as dates / numbers instead of strings
  private readonly DATE_COLUMNS = new Set<string>([
    'transferOutDate',
    'transferOutTime',
    'transferInTime'
  ]);

  private readonly NUMBER_COLUMNS = new Set<string>([
    'transitID',
    'transferQty',
    'acceptedQty',
    'pendingQty'
  ]);

  deliveryLifecycles: DeliveryLifecycle[] = [];

  // ===== Row expansion: shows the raw per-IMEI records under a group =====
  private expandedGroups = new Set<number>();

  toggleGroupExpand(transitID: number): void {
    if (this.expandedGroups.has(transitID)) this.expandedGroups.delete(transitID);
    else this.expandedGroups.add(transitID);
  }

  isGroupExpanded(transitID: number): boolean {
    return this.expandedGroups.has(transitID);
  }

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
  manifestNo: string = '';

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

  constructor(
    private logisticsService: LogisticsService,
    private userDataService: UserDataService
  ) { }

  ngOnInit(): void {
    this.loggedInUserId = this.userDataService.getUserId();
    this.loggedInUserName = this.userDataService.getUserName(); // if available
    this.loadCompanies();
    this.loadDeliveryLifecycles();
    this.loadTransferModes();
    this.loadUsers();
    this.loadCouriers();

    this.pickupLoadMode = 'DIRECT';
    this.pickupTransferModeId = 1;

  }

  private today(): string {
    return new Date().toISOString().split('T')[0];
  }

  loadDeliveryLifecycles(): void {

    const userId = this.userDataService.getUserId();

    console.log('Logged In UserId :', userId);

    if (userId === 0) {
      console.error('User Id not found');
      return;
    }

    this.logisticsService.getRoleslifecycle(userId).subscribe({

      next: (roles) => {

        console.log('User Roles Response :', roles);

        if (!roles || roles.length === 0) {
          console.error('No role mapped for this user.');
          return;
        }

        const roleId = roles[0].roleID;

        console.log('Selected Role Id :', roleId);
        console.log('Selected Role Name :', roles[0].roleName);

        this.logisticsService.getRoleBasedLifecycles(roleId).subscribe({

          next: (lifecycles) => {

            console.log('Role Based Lifecycles :', lifecycles);

            this.deliveryLifecycles = lifecycles
              .filter(x => x.isActive)
              .sort((a, b) => a.sequenceNo - b.sequenceNo);

            console.log('Filtered Lifecycles :', this.deliveryLifecycles);

          },

          error: (err) => {
            console.error('Failed to load lifecycles', err);
          }

        });

      },

      error: (err) => {
        console.error('Failed to load user roles', err);
      }

    });

  }

  setTransferMode(mode: TransferMode): void {

    this.pickupTransferModeId = mode.transferModeId;
    this.pickupLoadMode = mode.transferModeCode;
    this.pickupValidationMessage = '';

  }


  loadNextManifestNo(): void {

    this.logisticsService.getNextManifestNo().subscribe({

      next: (res) => {

        this.manifestNo = res;

        console.log('Next Manifest No:', this.manifestNo);

      },

      error: (err) => {

        console.error('Failed to load Manifest No', err);

      }

    });

  }

  // ===== Master data loading =====
  loadCompanies(): void {

    const userId = this.userDataService.getUserId();

    if (userId === 0) {
      console.error('Invalid User Id');
      return;
    }

    this.logisticsService.getUserCompanies(userId).subscribe({


      next: (res) => {

        this.companies = res;

        // Auto-select if only one company is available
        if (this.companies.length === 1) {

          this.selectedCompanyId = this.companies[0].compId;
          this.onCompanyChange();

        }

      },

      error: (err) => {

        console.error('Failed to load user companies:', err);

      }

    });

  }
  loadUsers(): void {

    this.logisticsService.getCompanyUserLifecycleAccess().subscribe({

      next: (res: any[]) => {

        this.users = res
          .filter(x =>
            x.isActive &&
            x.roleName === 'Delivery Executive'
          )
          .map(x => ({
            userId: x.userId,
            fullName: x.userName,
            loginName: x.loginName ?? '',
            emailId: x.emailId ?? '',
            mobileNo: x.mobileNo ?? ''
          }));

        console.log('Delivery Executives:', this.users);

      },

      error: err => {
        console.error('Failed to load Delivery Executives', err);
      }

    });

  } loadTransferModes(): void {
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
  // Operates on the GROUPED rows currently on the page.
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

          // Raw, per-IMEI records — exactly as the backend returns them.
          // No grouping, no computed quantities happen here.
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
              sourceLocationTypeId: item.sourceLocationTypeId ?? item.locationTypeId ?? 0,
              sourceLocationTypeName: item.sourceLocationTypeName ?? item.locationTypeName ?? '',

              destinationLocationId: item.destinationLocationId ?? 0,
              destinationLocationName: item.destinationLocationName ?? item.destinationBranch ?? '',
              destinationBranch: item.destinationBranch ?? '',
              destinationLocationTypeId: item.destinationLocationTypeId ?? item.locationTypeId ?? 0,
              destinationLocationTypeName: item.destinationLocationTypeName ?? item.locationTypeName ?? '',

              itemCode: item.itemCode ?? '',
              itemName: item.itemName ?? '',
              imei: item.imei ?? '',

              transferQty: item.transferQty ?? 1,

              transferStatus: item.transferStatus ?? '',

              // JSON API uses transferOutByUserId/transferredOutBy;
              // SP uses transferOutById/transferOutByName — handle both
              transferOutById: item.transferOutById ?? item.transferOutByUserId,
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

              assignedUserId: item.assignedUserId ?? item.pickupDriverId ?? 0,
              assignedUserName: item.assignedUserName ?? item.fullName ?? '',

              courierId: item.courierId ?? 0,
              courierName: item.courierName ?? '',

              awbBillNo: item.awbBillNo ?? '',

              // Vehicle / Other party details (common fields)
              vehicleNo: item.vehicleNo ?? '',
              otherPartyName: item.otherPartyName ?? '',
              otherPartyType: item.otherPartyType ?? '',

              remarks: item.remarks ?? '',

              isActive: item.isActive ?? true,

              createdBy: item.createdBy || this.loggedInUserId,
              createdByName: item.createdByName || this.loggedInUserName,

              createdDate: item.createdDate || new Date().toISOString(),

              modifiedBy: this.loggedInUserId ?? 0,
              modifiedByName: this.loggedInUserName ?? '',
              modifiedDate: item.modifiedDate ?? undefined,


              logisticsStatus: item.logisticsStatus ?? '',

              companyId: item.companyId ?? 0,
              companyName: item.companyName ?? '',

              locationTypeId: item.locationTypeId ?? 0,
              locationTypeName: item.locationTypeName ?? '',

              pickupManifestId: item.pickupManifestId ?? 0,
              pickupManifestNo: item.pickupManifestNo ?? '',

              selected: false,

              deliveryLifecycles: [],
              currentLifecycle: undefined,
              acceptedQty: 0,
              pendingQty: 0
            }));

          // Frontend-only grouping by TransitID, purely for display.
          this.groupedLogs = this.buildGroupedLogs(this.transferLogs);

          this.currentPage = 1;
          this.loading = false;

        },

        error: (error) => {

          console.error(error);

          this.transferLogs = [];
          this.groupedLogs = [];
          this.currentPage = 1;
          this.loading = false;

        }

      });

  }

  // ============================================================
  //  Grouping: raw per-IMEI records -> one row per TransitID
  // ============================================================

  private buildGroupedLogs(rows: TransferStockLogDetail[]): GroupedTransferLog[] {

    const map = new Map<number, TransferStockLogDetail[]>();

    for (const r of rows) {
      const list = map.get(r.transitID) ?? [];
      list.push(r);
      map.set(r.transitID, list);
    }

    const groups: GroupedTransferLog[] = [];

    for (const [transitID, items] of map) {

      const first = items[0];

      const acceptedQty = items.filter(
        x => (x.transferStatus ?? '').trim() === 'Received'
      ).length;

      const pendingQty = items.filter(
        x => (x.transferStatus ?? '').trim() === 'In Transit'
      ).length;

      const transferQty = items.length; // 1 IMEI = 1 Qty

      // Representative logistics status for the whole TransitID group.
      // Rows in the same workflow group share the same lifecycle status;
      // fall back to the first row that actually has one.
      const withStatus = items.find(x => !!x.logisticsStatus);
      const logisticsStatus = withStatus?.logisticsStatus ?? '';

      let transferStatus: string;
      if (acceptedQty === transferQty) transferStatus = 'Received';
      else if (acceptedQty === 0) transferStatus = 'In Transit';
      else transferStatus = `Partial (${acceptedQty}/${transferQty})`;

      groups.push({
        transitID,
        transferOrderId: first.transferOrderId ?? 0,
        deliveryNoteNo: first.deliveryNoteNo ?? '',

        transferOutDate: first.transferOutDate,
        transferOutTime: first.transferOutTime,

        sourceLocationId: first.sourceLocationId ?? 0,
        sourceBranch: first.sourceBranch || first.sourceLocationName || '',
        sourceLocationName: first.sourceLocationName ?? '',

        destinationLocationId: first.destinationLocationId ?? 0,
        destinationBranch: first.destinationBranch || first.destinationLocationName || '',
        destinationLocationName: first.destinationLocationName ?? '',

        itemCode: first.itemCode ?? '',
        itemName: first.itemName ?? '',

        companyId: first.companyId ?? 0,
        companyName: first.companyName ?? '',

        transferQty,
        acceptedQty,
        pendingQty,
        transferStatus,
        logisticsStatus,

        transferModeId: first.transferModeId ?? 0,
        transferModeName: first.transferModeName ?? '',

        assignedUserId: first.assignedUserId ?? 0,
        assignedUserName: first.assignedUserName ?? '',

        courierId: first.courierId ?? 0,
        courierName: first.courierName ?? '',
        awbBillNo: first.awbBillNo ?? '',
        vehicleNo: first.vehicleNo ?? '',

        transferOutById: first.transferOutById ?? 0,
        transferOutByName: first.transferOutByName ?? '',

        transferInTime: first.transferInTime,
        inwardDoneById: first.inwardDoneById ?? 0,
        inwardDoneByName: first.inwardDoneByName ?? '',

        transferDuration: first.transferDuration ?? '',

        pickupManifestNo: first.pickupManifestNo ?? '',

        selected: false,
        items
      });
    }

    // Workflow groups (with a logistics status) first, then by transitID —
    // same default ordering as before, just applied at the group level.
    return groups.sort((a, b) => {

      const aActive = !!a.logisticsStatus;
      const bActive = !!b.logisticsStatus;

      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;

      return a.transitID - b.transitID;

    });
  }

  // ===== Logistics Status filter =====

  // Distinct non-blank statuses present in the loaded grid,
  // ordered by their lifecycle sequenceNo when known.
  get lifecycleStatusOptions(): string[] {

    const distinct = new Set<string>();

    for (const item of this.groupedLogs) {
      if (item.logisticsStatus) {
        distinct.add(item.logisticsStatus);
      }
    }

    const seq = (status: string): number => {
      const lc = this.deliveryLifecycles.find(x => x.statusName === status);
      return lc ? lc.sequenceNo : 999;
    };

    return [...distinct].sort(
      (a, b) => seq(a) - seq(b) || a.localeCompare(b)
    );

  }

  onStatusFilterChange(): void {

    this.currentPage = 1;

    // Hidden rows must not stay silently selected,
    // so any status filter change clears the selection.
    this.clearSelection();

  }

  // Grouped rows after the client-side Logistics Status filter is applied
  get filteredGroups(): GroupedTransferLog[] {

    if (!this.selectedLifecycleStatus) {
      return this.groupedLogs;
    }

    return this.groupedLogs.filter(
      x => x.logisticsStatus === this.selectedLifecycleStatus
    );

  }

  // ===== Column sorting (operates on grouped rows) =====

  sortBy(column: keyof GroupedTransferLog): void {

    if (this.sortColumn === column) {
      // Same column: toggle asc -> desc -> off (back to default order)
      if (this.sortDirection === 'asc') {
        this.sortDirection = 'desc';
      } else {
        this.sortColumn = '';
        this.sortDirection = 'asc';
      }
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.currentPage = 1;

  }

  sortIcon(column: keyof GroupedTransferLog): string {

    if (this.sortColumn !== column) {
      return '⇅';
    }

    return this.sortDirection === 'asc' ? '▲' : '▼';

  }

  private compareValues(
    a: GroupedTransferLog,
    b: GroupedTransferLog,
    column: keyof GroupedTransferLog
  ): number {

    const rawA = a[column];
    const rawB = b[column];

    const emptyA = rawA === null || rawA === undefined || rawA === '';
    const emptyB = rawB === null || rawB === undefined || rawB === '';

    // Empty values always sink to the bottom, in both directions
    if (emptyA && emptyB) return 0;
    if (emptyA) return this.sortDirection === 'asc' ? 1 : -1;
    if (emptyB) return this.sortDirection === 'asc' ? -1 : 1;

    if (this.NUMBER_COLUMNS.has(column as string)) {
      return Number(rawA) - Number(rawB);
    }

    if (this.DATE_COLUMNS.has(column as string)) {

      const timeA = new Date(rawA as any).getTime();
      const timeB = new Date(rawB as any).getTime();

      const validA = !isNaN(timeA);
      const validB = !isNaN(timeB);

      if (validA && validB) return timeA - timeB;
      if (validA) return -1;
      if (validB) return 1;
      return 0;

    }

    return String(rawA).localeCompare(String(rawB), undefined, {
      numeric: true,
      sensitivity: 'base'
    });

  }

  // Filtered groups with the active column sort applied.
  // With no sort column, the default load order is kept
  // (workflow rows first, then by transitID).
  get sortedGroups(): GroupedTransferLog[] {

    const rows = this.filteredGroups;

    if (!this.sortColumn) {
      return rows;
    }

    const column = this.sortColumn;
    const dir = this.sortDirection === 'asc' ? 1 : -1;

    return [...rows].sort(
      (a, b) => this.compareValues(a, b, column) * dir
    );

  }

  // ===== Pagination: computed getters (operate on grouped rows) =====

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredGroups.length / this.pageSize));
  }

  get startIndex(): number {
    return (this.currentPage - 1) * this.pageSize;
  }

  get endIndex(): number {
    return Math.min(this.startIndex + Number(this.pageSize), this.filteredGroups.length);
  }

  get pagedLogs(): GroupedTransferLog[] {
    return this.sortedGroups.slice(this.startIndex, this.endIndex);
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

  trackByTransitId(index: number, item: GroupedTransferLog): number {
    return item.transitID;
  }

  trackByRawRow(index: number, item: TransferStockLogDetail): string {
    return `${item.transitID}-${item.imei || index}`;
  }

  // ===== Selection getters =====

  // Grouped rows the user has checked.
  get selectedGroups(): GroupedTransferLog[] {
    return this.groupedLogs.filter(x => x.selected);
  }

  // The RAW per-IMEI records underneath every checked group, flattened.
  // This — not the grouped rows — is what gets sent to the backend,
  // record by record, exactly as the requirement specifies.
  get selectedOrders(): TransferStockLogDetail[] {
    return this.selectedGroups.flatMap(g => g.items);
  }

  get selectedCount(): number {
    return this.selectedGroups.length;
  }

  // Total raw/IMEI-level records underneath the selected groups —
  // shown alongside selectedCount so the user knows how many individual
  // backend records will actually be updated.
  get selectedItemCount(): number {
    return this.selectedOrders.length;
  }

  get selectedStatus(): string {

    if (this.selectedGroups.length === 0) {
      return '';
    }

    return this.selectedGroups[0].logisticsStatus;

  }

  get isSameStatus(): boolean {

    if (this.selectedGroups.length <= 1) {
      return true;
    }

    const status = this.selectedGroups[0].logisticsStatus;

    return this.selectedGroups.every(x => x.logisticsStatus === status);

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

  // Number of distinct source locations among the selected orders
  // (based on the underlying raw records, since that's what gets saved).
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

  const selectedCompany = this.companies.find(
    c => c.compId === this.selectedCompanyId
  );

  const companyId =
    order.companyId && order.companyId > 0
      ? order.companyId
      : this.selectedCompanyId;

  const companyName =
    order.companyName && order.companyName.trim() !== ''
      ? order.companyName
      : (selectedCompany?.compName ?? '');

  console.log('==============================');
  console.log('BUILD REQUEST');
  console.log('Selected CompanyId :', this.selectedCompanyId);
  console.log('Order CompanyId    :', order.companyId);
  console.log('Final CompanyId    :', companyId);
  console.log('Selected Company   :', selectedCompany?.compName);
  console.log('Order CompanyName  :', order.companyName);
  console.log('Final CompanyName  :', companyName);
  console.log('==============================');

  return {

    // Company
    companyId: companyId,
    companyName: companyName,

    transferOrderId: order.transferOrderId ?? 0,

    transitID: order.transitID,
    deliveryNoteNo: order.deliveryNoteNo ?? '',

    transferOutDate: order.transferOutDate,
    transferOutTime: order.transferOutTime,

    sourceLocationId: order.sourceLocationId,
    sourceLocationName: order.sourceLocationName ?? '',
    sourceLocationTypeId:
      order.sourceLocationTypeId ||
      order.locationTypeId ||
      this.selectedLocationTypeId ||
      0,
    sourceLocationTypeName:
      order.sourceLocationTypeName ||
      order.locationTypeName ||
      '',

    destinationLocationId: order.destinationLocationId,
    destinationLocationName: order.destinationLocationName ?? '',
    destinationLocationTypeId:
      order.destinationLocationTypeId ||
      order.locationTypeId ||
      this.selectedLocationTypeId ||
      0,
    destinationLocationTypeName:
      order.destinationLocationTypeName ||
      order.locationTypeName ||
      '',

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

    // Transfer Out
    transferOutById: order.transferOutById,
    transferOutByName: order.transferOutByName,

    // Assigned User
    assignedUserId: extra.assignedUserId ?? order.assignedUserId ?? 0,
    assignedUserName: extra.assignedUserName ?? order.assignedUserName ?? '',

    // Assigned By
    assignedById: this.loggedInUserId,
    assignedByName: this.loggedInUserName,
    assignedDate: new Date().toISOString(),

    // Courier
    courierId: extra.courierId ?? order.courierId ?? 0,
    courierName: extra.courierName ?? order.courierName ?? '',
    awbBillNo: extra.awbBillNo ?? order.awbBillNo ?? '',

    // Vehicle
    vehicleNo: extra.vehicleNo ?? order.vehicleNo ?? '',

    // Others
    otherPartyName: extra.otherPartyName ?? order.otherPartyName ?? '',
    otherPartyType: extra.otherPartyType ?? order.otherPartyType ?? '',

    transferInTime: order.transferInTime,

    inwardDoneById: order.inwardDoneById ?? 0,
    inwardDoneByName: order.inwardDoneByName ?? '',

    transferDuration: order.transferDuration ?? '',
    remarks: extra.remarks ?? order.remarks ?? '',

    isActive: true,

    // Audit
    createdBy: order.createdBy || this.loggedInUserId,
    createdByName: order.createdByName || this.loggedInUserName,
    createdDate: order.createdDate,

    modifiedBy: this.loggedInUserId,
    modifiedByName: this.loggedInUserName,
    modifiedDate: new Date().toISOString(),

    pickupManifestId: order.pickupManifestId,
    pickupManifestNo: order.pickupManifestNo,

    locationTypeId: order.locationTypeId,
    locationTypeName: order.locationTypeName
  };
}
canSelect(group: GroupedTransferLog): boolean {

  const allowedStatuses = [
    'Open',
    'Pickup Ready',
    'Pickup Assigned'
  ];

  return allowedStatuses.includes(
    (group.logisticsStatus ?? '').trim()
  );
}
processSelectedOrders(): void {

  // ==========================================
  // Step 1 : Check Selection
  // ==========================================
  if (this.selectedGroups.length === 0) {

    alert('Please select at least one order.');
    return;

  }

  // Allow only these statuses on this page
  const allowedStatuses = [
    'Open',
    'Pickup Ready',
  ];

  const invalidSelection = this.selectedGroups.some(
    x => !allowedStatuses.includes((x.logisticsStatus ?? '').trim())
  );

  if (invalidSelection) {

    alert('Only Open, Pickup Ready and Pickup Assigned orders can be processed from this page.');
    return;

  }

  // ==========================================
  // Step 2 : Check Same Logistics Status
  // ==========================================
  if (!this.isSameStatus) {

    alert('Please select orders with the same Logistics Status.');
    return;

  }

  // ==========================================
  // Step 3 : Find Current Lifecycle
  // ==========================================
  const currentLifecycle = this.deliveryLifecycles.find(
    x => x.statusName === this.selectedStatus
  );

  if (!currentLifecycle) {

    alert('Current lifecycle not found.');
    return;

  }

  // ==========================================
  // Step 4 : Check Next Status Configured
  // ==========================================
  if (
    !currentLifecycle.nextStatusCode ||
    currentLifecycle.nextStatusCode.trim() === ''
  ) {

    alert(`No next status is configured for '${currentLifecycle.statusName}'.`);
    return;

  }

  // ==========================================
  // Step 5 : Find Next Lifecycle
  // ==========================================
  const nextLifecycle = this.deliveryLifecycles.find(
    x => x.statusCode === currentLifecycle.nextStatusCode
  );

  if (!nextLifecycle) {

    alert(`Next lifecycle '${currentLifecycle.nextStatusCode}' is not available for your role.`);
    return;

  }

  // ==========================================
  // Step 6 : Pickup Assignment Required
  // ==========================================
  if (nextLifecycle.sequenceNo === this.PICKUP_ASSIGNED_SEQUENCE_NO) {

    this.pendingNextLifecycle = nextLifecycle;
    this.openPickupAssignModal();
    return;

  }

  // ==========================================
  // Step 7 : Normal Status Update
  // ==========================================
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

    manifestNo: manifestNo,

    transferOrderId: order.transferOrderId ?? 0,

    assignedUserId: extra.assignedUserId ?? order.assignedUserId ?? 0,
    assignedUserName: extra.assignedUserName ?? order.assignedUserName ?? '',

    receiverUserId: 0,
    receiverUserName: '',

    otp: '',

    lifecycleId: nextLifecycle.lifecycleId,
    lifecycleSequenceNo: nextLifecycle.sequenceNo,
    lifecycleCode: nextLifecycle.statusCode,
    lifecycleName: nextLifecycle.statusName,

    manifestDate: new Date(),
    status: nextLifecycle.statusName,

    // Audit
    createdBy: this.loggedInUserId,
    createdByName: this.loggedInUserName,
    createdDate: new Date(),

    modifiedBy: this.loggedInUserId,
    modifiedByName: this.loggedInUserName,
    modifiedDate: new Date(),

    assignedById: this.loggedInUserId,
    assignedByName: this.loggedInUserName,
    assignedDate: new Date()
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

    return this.logisticsService.getNextManifestNo().pipe(

      concatMap((manifestNo: string) => {

        console.log('Manifest No:', manifestNo);

        return forkJoin(

          orders.map(order =>

            this.logisticsService.saveTransferManifest(

              this.buildManifest(
                order,
                nextLifecycle,
                manifestNo,
                extra
              )

            )

          )

        );

      })

    );

  }

  // Groups the selected RAW records by sourceLocationId and creates ONE
  // manifest per group, sequentially (concatMap) so every group gets its
  // own manifest number from the backend without numbers mixing between
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

  // ===== Combined save: updates each RAW order's own status/assignment
  // (DeliveryOrderTransaction table) AND creates the manifest(s), one per
  // source location (TransferManifest table). Used for the Pickup Assigned
  // step, where both things need to happen together.
  //
  // this.selectedOrders is already the flattened, raw per-IMEI record list
  // (expanded from whichever grouped rows the user checked) — every one of
  // those raw records is sent to the backend individually. =====
  private saveWithLifecycleAndManifest(
    nextLifecycle: DeliveryLifecycle,
    extra: Partial<DeliveryOrderTransaction> = {}
  ): void {

    const ordersToSave = [...this.selectedOrders];

    this.saving = true;

    // Step 1: update each raw order's own status + assignment
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
          `Status updated to ${nextLifecycle.statusName} for ${ordersToSave.length} record(s). ` +
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

  // Sends each RAW record under the selected TransitID group(s) individually
  // to the backend — the grouped row itself is never sent.
  private saveWithLifecycle(
    nextLifecycle: DeliveryLifecycle,
    extra: Partial<DeliveryOrderTransaction> = {}
  ): void {

    const ordersToSave = [...this.selectedOrders];

    const requests = ordersToSave.map(order => {
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

        alert(`Status updated to ${nextLifecycle.statusName} for ${ordersToSave.length} record(s)`);

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

    this.groupedLogs.forEach(x => x.selected = false);

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

    // Updates every raw order's status/assignment AND creates the
    // per-source-location manifest(s) in one combined save.
    this.saveWithLifecycleAndManifest(nextLifecycle, extra);

  }

  getLifecycleColor(status: string): string {

    const lifecycle = this.deliveryLifecycles.find(
      x => x.statusName === status
    );

    return lifecycle?.colorCode ?? '#6B7280';
  }
}