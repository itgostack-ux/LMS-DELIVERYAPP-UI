import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LogisticsService } from '../../services/logistics-service';
import {
  DeliveryLifecycle,
  TransferManifestResponse
} from '../../services/models/common-master-model';

// One row per manifestNo — every record sharing that manifest number
// (including duplicates with different manifestId) is nested inside `orders`
export interface ManifestGroup {
  manifestNo: string;
  manifestIds: number[]; // all manifestId values folded into this group

  assignedUserId: number;
  assignedUserName: string;

  receiverUserId: number;
  receiverUserName: string;

  otp: string;

  lifecycleId: number;
  lifecycleSequenceNo: number;
  lifecycleCode: string;
  lifecycleName: string;

  manifestDate: Date | null;
  status: string;

  sourceLocationId: number;
  sourceLocationName: string;

  destinationLocationId: number;
  destinationLocationName: string;

  transferModeId: number;
  transferModeName: string;

  courierId: number | null;
  courierName: string;

  awbBillNo: string;

  transferOutDate: Date | null;
  transferOutTime: Date | null;
  transferInTime: Date | null;

  inwardDoneById: number | null;
  inwardDoneByName: string;

  transferDuration: string;
  remarks: string;

  vehicleNo: string;
  otherPartyName: string;

  companyId: number;
  companyName: string;

  locationTypeId: number;
  locationTypeName: string;

  pickupManifestId: number | null;
  pickupManifestNo: string;

  selected?: boolean;

  // Line items belonging to this manifest number (deduped by transitID)
  orders: TransferManifestResponse[];
}

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
  manifestGroups: ManifestGroup[] = [];
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

  // ===== Expanded tracking row (keyed by manifestNo) =====
  expandedManifestNo: string | null = null;

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

    this.logisticsService.getManifestOrders().subscribe({

      next: (res) => {

        this.manifestGroups = this.groupByManifestNo(res ?? [])
          .sort((a, b) => {
            // Latest manifest activity first
            const aDate = (a.manifestDate ?? a.transferOutDate ?? '').toString();
            const bDate = (b.manifestDate ?? b.transferOutDate ?? '').toString();
            return bDate.localeCompare(aDate);
          });

        this.buildFilterOptions();

        this.currentPage = 1;
        this.loading = false;

      },

      error: (err) => {
        console.error('Failed to load manifest orders:', err);
        this.manifestGroups = [];
        this.loading = false;
      }

    });

  }

  // Collapse every row sharing the same manifestNo into a single group,
  // regardless of manifestId — dedupe line items by transitID within the group.
  private groupByManifestNo(rows: TransferManifestResponse[]): ManifestGroup[] {

    const map = new Map<string, ManifestGroup>();

    for (const r of rows) {

      const key = r.manifestNo ?? `__no_manifest_${r.manifestId}`;

      let group = map.get(key);

      if (!group) {

        group = {
          manifestNo: r.manifestNo,
          manifestIds: [],

          assignedUserId: r.assignedUserId,
          assignedUserName: r.assignedUserName,

          receiverUserId: r.receiverUserId,
          receiverUserName: r.receiverUserName,

          otp: r.otp,

          lifecycleId: r.lifecycleId,
          lifecycleSequenceNo: r.lifecycleSequenceNo,
          lifecycleCode: r.lifecycleCode,
          lifecycleName: r.lifecycleName,

          manifestDate: r.manifestDate,
          status: r.status,

          sourceLocationId: r.sourceLocationId,
          sourceLocationName: r.sourceLocationName,

          destinationLocationId: r.destinationLocationId,
          destinationLocationName: r.destinationLocationName,

          transferModeId: r.transferModeId,
          transferModeName: r.transferModeName,

          courierId: r.courierId,
          courierName: r.courierName,

          awbBillNo: r.awbBillNo,

          transferOutDate: r.transferOutDate,
          transferOutTime: r.transferOutTime,
          transferInTime: r.transferInTime,

          inwardDoneById: r.inwardDoneById,
          inwardDoneByName: r.inwardDoneByName,

          transferDuration: r.transferDuration,
          remarks: r.remarks,

          vehicleNo: r.vehicleNo,
          otherPartyName: r.otherPartyName,

          companyId: r.companyId,
          companyName: r.companyName,

          locationTypeId: r.locationTypeId,
          locationTypeName: r.locationTypeName,

          pickupManifestId: r.pickupManifestId,
          pickupManifestNo: r.pickupManifestNo,

          selected: false,

          orders: []
        };

        map.set(key, group);

      }

      if (!group.manifestIds.includes(r.manifestId)) {
        group.manifestIds.push(r.manifestId);
      }

      // Prefer the most "advanced" lifecycle across duplicate rows for this manifest
      if (r.lifecycleSequenceNo > group.lifecycleSequenceNo) {
        group.lifecycleSequenceNo = r.lifecycleSequenceNo;
        group.lifecycleCode = r.lifecycleCode;
        group.lifecycleName = r.lifecycleName;
      }

      // Avoid duplicate line items (same transitID appearing twice)
      const alreadyHasItem = group.orders.some(o => o.transitID === r.transitID);
      if (!alreadyHasItem) {
        group.orders.push(r);
      }

    }

    return Array.from(map.values());

  }

  // Distinct source / destination locations from the loaded data
  private buildFilterOptions(): void {

    const sourceMap = new Map<number, string>();
    const destMap = new Map<number, string>();

    for (const g of this.manifestGroups) {

      if (g.sourceLocationId && !sourceMap.has(g.sourceLocationId)) {
        sourceMap.set(g.sourceLocationId, g.sourceLocationName ?? '');
      }

      if (g.destinationLocationId && !destMap.has(g.destinationLocationId)) {
        destMap.set(g.destinationLocationId, g.destinationLocationName ?? '');
      }

    }

    this.sourceLocations = Array.from(sourceMap, ([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    this.destinationLocations = Array.from(destMap, ([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

  }

  // ===== Filtering =====

  get filteredGroups(): ManifestGroup[] {

    const search = this.searchText.trim().toLowerCase();

    return this.manifestGroups.filter(g => {

      if (this.selectedSourceId !== 0 &&
          g.sourceLocationId !== this.selectedSourceId) {
        return false;
      }

      if (this.selectedDestinationId !== 0 &&
          g.destinationLocationId !== this.selectedDestinationId) {
        return false;
      }

      if (this.selectedLifecycleCode !== '' &&
          g.lifecycleCode !== this.selectedLifecycleCode) {
        return false;
      }

      if (search) {

        const manifestHaystack = [
          g.manifestNo,
          g.otp,
          g.pickupManifestNo,
          g.awbBillNo
        ].join(' ').toLowerCase();

        const itemsMatch = g.orders.some(o => [
          o.transitID?.toString(),
          o.deliveryNoteNo,
          o.imei,
          o.itemName,
          o.itemCode
        ].join(' ').toLowerCase().includes(search));

        if (!manifestHaystack.includes(search) && !itemsMatch) {
          return false;
        }

      }

      return true;

    });

  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.expandedManifestNo = null;
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

  // ===== Row selection (bulk actions) =====

  toggleRowSelection(group: ManifestGroup, event: Event): void {
    event.stopPropagation();
    group.selected = !group.selected;
  }

  get selectedCount(): number {
    return this.manifestGroups.filter(g => g.selected).length;
  }

  get isAllPagedSelected(): boolean {
    return this.pagedGroups.length > 0 && this.pagedGroups.every(g => g.selected);
  }

  toggleSelectAllOnPage(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.pagedGroups.forEach(g => g.selected = checked);
  }

  clearSelection(): void {
    this.manifestGroups.forEach(g => g.selected = false);
  }

  // ===== Tracking timeline =====

  toggleTrack(group: ManifestGroup): void {
    this.expandedManifestNo =
      this.expandedManifestNo === group.manifestNo
        ? null
        : group.manifestNo;
  }

  isExpanded(group: ManifestGroup): boolean {
    return this.expandedManifestNo === group.manifestNo;
  }

  // Stage state for the timeline: 'done' | 'current' | 'pending'
  stageState(group: ManifestGroup, stage: DeliveryLifecycle): string {

    if (stage.sequenceNo < group.lifecycleSequenceNo) {
      return 'done';
    }

    if (stage.sequenceNo === group.lifecycleSequenceNo) {
      return 'current';
    }

    return 'pending';

  }

  // % of the lifecycle completed — drives the progress bar
  progressPercent(group: ManifestGroup): number {

    if (this.deliveryLifecycles.length <= 1) {
      return 0;
    }

    const maxSeq = this.deliveryLifecycles[this.deliveryLifecycles.length - 1].sequenceNo;
    const minSeq = this.deliveryLifecycles[0].sequenceNo;

    const pct = ((group.lifecycleSequenceNo - minSeq) / (maxSeq - minSeq)) * 100;

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
    return Math.max(1, Math.ceil(this.filteredGroups.length / this.pageSize));
  }

  get startIndex(): number {
    return (this.currentPage - 1) * this.pageSize;
  }

  get endIndex(): number {
    return Math.min(this.startIndex + Number(this.pageSize), this.filteredGroups.length);
  }

  get pagedGroups(): ManifestGroup[] {
    return this.filteredGroups.slice(this.startIndex, this.endIndex);
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
    this.expandedManifestNo = null;
  }

  onPageSizeChange(): void {
    this.pageSize = Number(this.pageSize);
    this.currentPage = 1;
  }

  trackByManifestNo(index: number, item: ManifestGroup): string {
    return item.manifestNo;
  }

  trackByTransitId(index: number, item: TransferManifestResponse): string {
    return item.transitID ?? index.toString();
  }
}