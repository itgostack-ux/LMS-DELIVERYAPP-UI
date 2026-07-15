import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, forkJoin, of } from 'rxjs';

import { LogisticsService } from '../../services/logistics-service';
import { UserDataService } from '../../service/user-data-service';
import {
  DeliveryLifecycle,
  DeliveryOrderTransaction,
  TransferManifest,
  TransferManifestResponse,
  User
} from '../../services/models/common-master-model';
import { AuthService } from '../../service/auth';

/**
 * The API returns ONE ROW PER ITEM (IMEI / item code). Several rows share the same
 * transitID. The driver works on TRANSITS, so every row in the UI is a TRANSIT and
 * every action fans out to all item rows behind it.
 *
 * TWO VIEWS, driven by the active status tab:
 *
 *   PICKUP  (next step is NOT the final step)
 *     Manifest -> Destination -> Transit -> ONE common Pickup button per manifest
 *     (multi-select only, no per-row button)
 *
 *   DELIVERY (next step IS the final step)
 *     Destination -> Manifest -> Transit -> common Deliver button per destination
 *     (plus a per-transit Deliver button, so a location can be delivered one transit
 *      at a time)
 */
/**
 * One row per ITEM CODE inside a transit. The API sends one row per IMEI with
 * transferQty often 0, so an IMEI counts as one unit and the units are rolled up
 * here. IMEI itself is not shown to the driver.
 */
interface ItemLine {
  itemCode: string;
  itemName: string;
  qty: number;
  lifecycleCode: string;
  lifecycleName: string;
}

interface TransitGroup {
  transitKey: string;              // manifestNo::transitID
  transitID: number;

  manifestId: number;
  manifestNo: string;

  deliveryNoteNo: string;
  companyId: number;
  companyName: string;

  sourceLocationId: number;
  sourceLocationName: string;
  destinationLocationId: number;
  destinationLocationName: string;

  vehicleNo: string;
  transferModeName: string;
  assignedUserName: string;

  itemCount: number;               // distinct item codes
  totalQty: number;                // units (one IMEI = one unit)

  // Effective status = the LEAST advanced item row in the transit.
  lifecycleCode: string;
  lifecycleName: string;
  mixed: boolean;                  // item rows disagree (legacy data)

  itemLines: ItemLine[];           // what the driver sees when a transit is expanded
  orders: TransferManifestResponse[];
  expanded: boolean;
}

/** Destination block inside a manifest card (PICKUP view). */
interface DestBlock {
  destKey: string;
  destinationLocationId: number;
  destinationLocationName: string;
  transits: TransitGroup[];
}

/** Manifest card (PICKUP view). */
interface ManifestGroup {
  manifestId: number;
  manifestNo: string;

  sourceLocationName: string;
  transferModeName: string;
  vehicleNo: string;
  assignedUserName: string;

  transits: TransitGroup[];
  destBlocks: DestBlock[];

  expanded: boolean;
}

/** Manifest block inside a destination card (DELIVERY view). */
interface ManifestBlock {
  manifestId: number;
  manifestNo: string;
  vehicleNo: string;
  transferModeName: string;
  sourceLocationName: string;
  transits: TransitGroup[];
}

/** Destination card (DELIVERY view). */
interface DeliveryGroup {
  destKey: string;
  destinationLocationId: number;
  destinationLocationName: string;

  transits: TransitGroup[];
  manifestBlocks: ManifestBlock[];

  expanded: boolean;
}

interface StatusBreakdown {
  code: string;
  name: string;
  color: string;
  count: number;                   // TRANSIT count
}

type ViewMode = 'pickup' | 'delivery' | 'readonly';

@Component({
  selector: 'app-driver-console',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './driver-console.html',
  styleUrl: './driver-console.css',
})
export class DriverConsole implements OnInit {

  // ===== Logged-in driver =====
  driverId = 0;
  driverName = '';

  // ===== Filters =====
  locationFilter = '';
  statusFilter = '';                 // set to the first tab once lifecycles load

  locationList: string[] = [];

  // ===== Lifecycle masters =====
  allLifecycles: DeliveryLifecycle[] = [];    // full workflow
  roleLifecycles: DeliveryLifecycle[] = [];   // what this role may set

  // ===== Data =====
  deliveryOrders: TransferManifestResponse[] = [];
  allTransits: TransitGroup[] = [];           // every transit assigned to this driver

  pickupGroups: ManifestGroup[] = [];         // Manifest -> Destination -> Transit
  deliveryGroups: DeliveryGroup[] = [];       // Destination -> Manifest -> Transit

  loading = false;
  saving = false;
  savingTransitKey: string | null = null;
  errorMessage = '';

  // ===== Selection: keyed on TRANSIT, never on an item row =====
  selectedTransitKeys = new Set<string>();

  private expandedManifestNos = new Set<string>();
  private expandedDestKeys = new Set<string>();
  private expandedTransitKeys = new Set<string>();

  // ===== OTP modal state (final lifecycle step) =====
  showOtpModal = false;
  otpInput = '';
  otpError = '';
  otpSent = false;
  sendingOtp = false;
  generatedOtp = '';

  users: User[] = [];
  filteredUsers: User[] = [];
  receiverSearch = '';

  selectedReceiverId = 0;
  selectedReceiverName = '';
  selectedReceiverEmail = '';

  // Receiver / OTP recorded PER TRANSIT, so a destination can be delivered in parts.
  private otpByTransitKey = new Map<string, string>();
  private receiverByTransitKey = new Map<string, { id: number; name: string }>();

  // Pending delivery details for the OTP flow.
  private pendingTransits: TransitGroup[] = [];
  private pendingLifecycle!: DeliveryLifecycle;
  pendingDestinationName = '';

  constructor(
    private logisticsService: LogisticsService,
    private userDataService: UserDataService,
    private authservice: AuthService,
  ) {
    const user = this.userDataService.getUser();
    if (user) {
      this.driverId = user.userId;
      this.driverName = user.userName;
    }
  }

  ngOnInit(): void {
    if (this.driverId !== 0) {
      this.loadDeliveryLifecycles(true);
    } else {
      this.errorMessage = 'No logged-in driver found. Please log in again.';
    }
  }

  // ==========================================================================
  // Masters
  // ==========================================================================

  private loadDeliveryLifecycles(loadManifestsAfter: boolean): void {

    const userId = this.userDataService.getUserId();
    if (userId === 0) {
      this.errorMessage = 'Invalid user. Please log in again.';
      return;
    }

    this.loading = true;

    this.logisticsService.getRoleslifecycle(userId).subscribe({

      next: (roles) => {

        if (!roles || roles.length === 0) {
          this.loading = false;
          this.errorMessage = 'No role mapped for this user.';
          return;
        }

        const roleId = roles[0].roleID;

        this.logisticsService.getDeliveryLifecycles().subscribe({

          next: (allLifeCycles) => {

            this.allLifecycles = allLifeCycles
              .filter(x => x.isActive)
              .sort((a, b) => a.sequenceNo - b.sequenceNo);

            this.logisticsService.getRoleBasedLifecycles(roleId).subscribe({

              next: (roleLifeCycles) => {

                this.roleLifecycles = roleLifeCycles
                  .filter(x => x.isActive)
                  .sort((a, b) => a.sequenceNo - b.sequenceNo);

                if (loadManifestsAfter) {
                  this.loadAssignedManifests();
                } else {
                  this.loading = false;
                }
              },

              error: (err: any) => {
                console.error('Failed to load role lifecycles:', err);
                this.loading = false;
                this.errorMessage = 'Failed to load role lifecycles.';
              }
            });
          },

          error: (err: any) => {
            console.error('Failed to load lifecycle master:', err);
            this.loading = false;
            this.errorMessage = 'Failed to load lifecycle master.';
          }
        });
      },

      error: (err: any) => {
        console.error('Failed to load user roles:', err);
        this.loading = false;
        this.errorMessage = 'Failed to load user roles.';
      }
    });
  }

  refresh(): void {
    if (this.driverId === 0) {
      return;
    }
    if (this.allLifecycles.length === 0) {
      this.loadDeliveryLifecycles(true);
    } else {
      this.loadAssignedManifests();
    }
  }

  // ==========================================================================
  // Load + build
  // ==========================================================================

  loadAssignedManifests(): void {

    this.loading = true;
    this.errorMessage = '';

    const userId = this.userDataService.getUserId();
    if (userId === 0) {
      this.loading = false;
      this.errorMessage = 'Invalid user. Please log in again.';
      return;
    }

    this.logisticsService.getManifestOrders().subscribe({

      next: (rows: TransferManifestResponse[]) => {

        this.selectedTransitKeys.clear();

        this.deliveryOrders = rows.filter(x => x.assignedUserId === userId);

        this.locationList = [
          ...new Set(this.deliveryOrders.map(x => x.sourceLocationName).filter(x => !!x))
        ].sort();

        this.allTransits = this.buildTransits(this.deliveryOrders);

        this.ensureStatusFilter();
        this.applyFilters();

        this.loading = false;
      },

      error: (err) => {
        console.error(err);
        this.deliveryOrders = [];
        this.allTransits = [];
        this.pickupGroups = [];
        this.deliveryGroups = [];
        this.loading = false;
        this.errorMessage = 'Failed to load assigned manifests.';
      }
    });
  }

  /** Collapse item rows into TRANSITS (manifestNo + transitID). */
  private buildTransits(rows: TransferManifestResponse[]): TransitGroup[] {

    const map = new Map<string, TransferManifestResponse[]>();

    for (const row of rows) {
      const manifestNo = row.manifestNo || `#${row.manifestId}`;
      const key = `${manifestNo}::${Number(row.transitID) || 0}`;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }

    return [...map.entries()]
      .map(([transitKey, orders]) => {

        const base = this.leastAdvancedOrder(orders);
        const codes = new Set(orders.map(o => o.lifecycleCode));
        const itemLines = this.buildItemLines(orders);

        return {
          transitKey,
          transitID: Number(base.transitID) || 0,

          manifestId: base.manifestId,
          manifestNo: base.manifestNo || `#${base.manifestId}`,

          deliveryNoteNo: base.deliveryNoteNo ?? '',
          companyId: base.companyId ?? 0,
          companyName: base.companyName ?? '',

          sourceLocationId: base.sourceLocationId,
          sourceLocationName: base.sourceLocationName ?? '',
          destinationLocationId: base.destinationLocationId ?? 0,
          destinationLocationName: base.destinationLocationName ?? '—',

          vehicleNo: base.vehicleNo ?? '',
          transferModeName: base.transferModeName ?? '',
          assignedUserName: base.assignedUserName ?? '',

          itemCount: itemLines.length,
          totalQty: itemLines.reduce((sum, l) => sum + l.qty, 0),

          lifecycleCode: base.lifecycleCode,
          lifecycleName:
            this.findLifecycle(base.lifecycleCode)?.statusName ?? base.lifecycleName,
          mixed: codes.size > 1,

          itemLines,
          orders,
          expanded: this.expandedTransitKeys.has(transitKey)
        } as TransitGroup;
      })
      .sort((a, b) => a.transitID - b.transitID);
  }

  /** One IMEI row = one unit, unless the API actually sent a quantity. */
  private unitsOf(order: TransferManifestResponse): number {
    const qty = Number(order.transferQty);
    return qty > 0 ? qty : 1;
  }

  /** Roll the IMEI rows up into ONE ROW PER ITEM CODE, with the units counted. */
  private buildItemLines(orders: TransferManifestResponse[]): ItemLine[] {

    const map = new Map<string, ItemLine>();

    for (const order of orders) {

      const itemCode = order.itemCode ?? '';
      const itemName = order.itemName ?? '';
      const key = `${itemCode}|${itemName}`;

      const existing = map.get(key);

      if (existing) {
        existing.qty += this.unitsOf(order);

        // Keep the least advanced status of the item code.
        if (this.sequenceOf(order.lifecycleCode) < this.sequenceOf(existing.lifecycleCode)) {
          existing.lifecycleCode = order.lifecycleCode;
          existing.lifecycleName =
            this.findLifecycle(order.lifecycleCode)?.statusName ?? order.lifecycleName;
        }
      } else {
        map.set(key, {
          itemCode,
          itemName,
          qty: this.unitsOf(order),
          lifecycleCode: order.lifecycleCode,
          lifecycleName:
            this.findLifecycle(order.lifecycleCode)?.statusName ?? order.lifecycleName
        });
      }
    }

    return [...map.values()].sort((a, b) => a.itemCode.localeCompare(b.itemCode));
  }

  /** The item row that is furthest behind — it drives the transit's status. */
  private leastAdvancedOrder(orders: TransferManifestResponse[]): TransferManifestResponse {
    return orders.reduce((slowest, current) =>
      this.sequenceOf(current.lifecycleCode) < this.sequenceOf(slowest.lifecycleCode)
        ? current
        : slowest
    );
  }

  private sequenceOf(statusCode: string): number {
    return this.findLifecycle(statusCode)?.sequenceNo ?? Number.MAX_SAFE_INTEGER;
  }

  // ==========================================================================
  // Filters + tabs
  // ==========================================================================

  /** Transits left after the location filter (drives the tab counts). */
  private get locationTransits(): TransitGroup[] {
    if (!this.locationFilter) {
      return this.allTransits;
    }
    return this.allTransits.filter(t => t.sourceLocationName === this.locationFilter);
  }

  private ensureStatusFilter(): void {
    const tabs = this.statusTabs;
    if (tabs.length === 0) {
      return;
    }
    if (this.statusFilter && tabs.some(t => t.code === this.statusFilter)) {
      return;
    }
    this.statusFilter = (tabs.find(t => t.count > 0) ?? tabs[0]).code;
  }

  applyFilters(): void {

    const transits = this.locationTransits
      .filter(t => !this.statusFilter || t.lifecycleCode === this.statusFilter);

    this.pickupGroups = this.groupByManifest(transits);
    this.deliveryGroups = this.groupByDestination(transits);
  }

  setStatusFilter(code: string): void {
    if (this.statusFilter === code) {
      return;
    }
    this.statusFilter = code;
    this.selectedTransitKeys.clear();   // never carry a selection across statuses
    this.applyFilters();
  }

  onLocationChange(): void {
    this.selectedTransitKeys.clear();
    this.ensureStatusFilter();
    this.applyFilters();
  }

  /** One tab per lifecycle status (Open / Pickup Ready are not driver states). */
  get statusTabs(): { code: string; name: string; count: number }[] {

    const counts = new Map<string, number>();
    for (const t of this.locationTransits) {
      counts.set(t.lifecycleCode, (counts.get(t.lifecycleCode) ?? 0) + 1);
    }

    return this.allLifecycles
      .filter(l =>
        l.isActive &&
        l.statusName !== 'Open' &&
        l.statusName !== 'Pickup Ready'
      )
      .sort((a, b) => a.sequenceNo - b.sequenceNo)
      .map(l => ({
        code: l.statusCode,
        name: l.statusName,
        count: counts.get(l.statusCode) ?? 0
      }));
  }

  /**
   * The whole layout hangs off the active tab:
   *   next step exists and is NOT final  -> pickup  (Manifest -> Destination -> Transit)
   *   next step exists and IS final      -> delivery(Destination -> Manifest -> Transit)
   *   no next step (Delivered)           -> read only
   */
  get viewMode(): ViewMode {
    const next = this.nextLifecycleOf(this.statusFilter);
    if (!next || !this.roleCanSet(next)) {
      return 'readonly';
    }
    return this.isFinalStep(next) ? 'delivery' : 'pickup';
  }

  get hasRows(): boolean {
    return this.viewMode === 'delivery'
      ? this.deliveryGroups.length > 0
      : this.pickupGroups.length > 0;
  }

  get activeStatusName(): string {
    return this.findLifecycle(this.statusFilter)?.statusName ?? 'this status';
  }

  get nextStepName(): string {
    return this.getNextStatusName(this.statusFilter);
  }

  // ==========================================================================
  // Grouping
  // ==========================================================================

  /** PICKUP: Manifest -> Destination -> Transit */
  private groupByManifest(transits: TransitGroup[]): ManifestGroup[] {

    const map = new Map<string, TransitGroup[]>();

    for (const t of transits) {
      const list = map.get(t.manifestNo) ?? [];
      list.push(t);
      map.set(t.manifestNo, list);
    }

    return [...map.entries()]
      .map(([manifestNo, list]) => {
        const first = list[0];
        return {
          manifestId: first.manifestId,
          manifestNo,
          sourceLocationName: first.sourceLocationName,
          transferModeName: first.transferModeName,
          vehicleNo: first.vehicleNo,
          assignedUserName: first.assignedUserName,
          transits: list,
          destBlocks: this.buildDestBlocks(list),
          expanded: this.expandedManifestNos.has(manifestNo)
        } as ManifestGroup;
      })
      .sort((a, b) => b.manifestNo.localeCompare(a.manifestNo));
  }

  private buildDestBlocks(transits: TransitGroup[]): DestBlock[] {

    const map = new Map<string, DestBlock>();

    for (const t of transits) {
      const destKey = `${t.destinationLocationId}|${t.destinationLocationName}`;
      const existing = map.get(destKey);
      if (existing) {
        existing.transits.push(t);
      } else {
        map.set(destKey, {
          destKey,
          destinationLocationId: t.destinationLocationId,
          destinationLocationName: t.destinationLocationName,
          transits: [t]
        });
      }
    }

    return [...map.values()]
      .sort((a, b) => a.destinationLocationName.localeCompare(b.destinationLocationName));
  }

  /** DELIVERY: Destination -> Manifest -> Transit */
  private groupByDestination(transits: TransitGroup[]): DeliveryGroup[] {

    const map = new Map<string, DeliveryGroup>();

    for (const t of transits) {
      const destKey = `${t.destinationLocationId}|${t.destinationLocationName}`;
      const existing = map.get(destKey);
      if (existing) {
        existing.transits.push(t);
      } else {
        map.set(destKey, {
          destKey,
          destinationLocationId: t.destinationLocationId,
          destinationLocationName: t.destinationLocationName,
          transits: [t],
          manifestBlocks: [],
          expanded: this.expandedDestKeys.has(destKey)
        });
      }
    }

    const groups = [...map.values()];

    for (const group of groups) {
      group.manifestBlocks = this.buildManifestBlocks(group.transits);
    }

    return groups.sort((a, b) =>
      a.destinationLocationName.localeCompare(b.destinationLocationName)
    );
  }

  private buildManifestBlocks(transits: TransitGroup[]): ManifestBlock[] {

    const map = new Map<string, ManifestBlock>();

    for (const t of transits) {
      const existing = map.get(t.manifestNo);
      if (existing) {
        existing.transits.push(t);
      } else {
        map.set(t.manifestNo, {
          manifestId: t.manifestId,
          manifestNo: t.manifestNo,
          vehicleNo: t.vehicleNo,
          transferModeName: t.transferModeName,
          sourceLocationName: t.sourceLocationName,
          transits: [t]
        });
      }
    }

    return [...map.values()].sort((a, b) => b.manifestNo.localeCompare(a.manifestNo));
  }

  // ==========================================================================
  // Header chips
  // ==========================================================================

  statusBreakdown(transits: TransitGroup[]): StatusBreakdown[] {
    const counts = new Map<string, number>();
    for (const t of transits) {
      counts.set(t.lifecycleCode, (counts.get(t.lifecycleCode) ?? 0) + 1);
    }
    return [...counts.entries()].map(([code, count]) => ({
      code,
      name: this.findLifecycle(code)?.statusName ?? code,
      color: this.getStatusColor(code),
      count
    }));
  }

  // ==========================================================================
  // Selection (transit level)
  // ==========================================================================

  isTransitCheckable(transit: TransitGroup): boolean {
    return this.hasNextStatus(transit.lifecycleCode);
  }

  isChecked(transit: TransitGroup): boolean {
    return this.selectedTransitKeys.has(transit.transitKey);
  }

  toggleTransit(transit: TransitGroup): void {
    if (!this.isTransitCheckable(transit)) {
      return;
    }
    if (this.selectedTransitKeys.has(transit.transitKey)) {
      this.selectedTransitKeys.delete(transit.transitKey);
    } else {
      this.selectedTransitKeys.add(transit.transitKey);
    }
  }

  checkableOf(transits: TransitGroup[]): TransitGroup[] {
    return transits.filter(t => this.isTransitCheckable(t));
  }

  checkedOf(transits: TransitGroup[]): TransitGroup[] {
    return transits.filter(t => this.isChecked(t));
  }

  checkedCount(transits: TransitGroup[]): number {
    return this.checkedOf(transits).length;
  }

  allChecked(transits: TransitGroup[]): boolean {
    const checkable = this.checkableOf(transits);
    return checkable.length > 0 && checkable.every(t => this.isChecked(t));
  }

  toggleAll(transits: TransitGroup[], checked: boolean): void {
    for (const t of this.checkableOf(transits)) {
      if (checked) {
        this.selectedTransitKeys.add(t.transitKey);
      } else {
        this.selectedTransitKeys.delete(t.transitKey);
      }
    }
  }

  hasActionable(transits: TransitGroup[]): boolean {
    return transits.some(t => this.isTransitCheckable(t));
  }

  // ==========================================================================
  // Expand / collapse
  // ==========================================================================

  toggleManifest(group: ManifestGroup): void {
    group.expanded = !group.expanded;
    if (group.expanded) {
      this.expandedManifestNos.add(group.manifestNo);
    } else {
      this.expandedManifestNos.delete(group.manifestNo);
    }
  }

  toggleDestination(group: DeliveryGroup): void {
    group.expanded = !group.expanded;
    if (group.expanded) {
      this.expandedDestKeys.add(group.destKey);
    } else {
      this.expandedDestKeys.delete(group.destKey);
    }
  }

  toggleTransitItems(transit: TransitGroup, event?: Event): void {
    event?.stopPropagation();
    transit.expanded = !transit.expanded;
    if (transit.expanded) {
      this.expandedTransitKeys.add(transit.transitKey);
    } else {
      this.expandedTransitKeys.delete(transit.transitKey);
    }
  }

  // ==========================================================================
  // Lifecycle helpers
  // ==========================================================================

  private findLifecycle(statusCode: string): DeliveryLifecycle | undefined {
    return this.allLifecycles.find(x => x.statusCode === statusCode);
  }

  private nextLifecycleOf(currentStatusCode: string): DeliveryLifecycle | undefined {
    const current = this.findLifecycle(currentStatusCode);
    if (!current?.nextStatusCode) {
      return undefined;
    }
    return this.findLifecycle(current.nextStatusCode);
  }

  private isFinalStep(lifecycle: DeliveryLifecycle): boolean {
    return !lifecycle.nextStatusCode;
  }

  private roleCanSet(lifecycle: DeliveryLifecycle): boolean {
    return this.roleLifecycles.some(x => x.statusCode === lifecycle.statusCode);
  }

  getNextStatusName(currentStatusCode: string): string {
    return this.nextLifecycleOf(currentStatusCode)?.statusName ?? 'No Next Status';
  }

  hasNextStatus(currentStatusCode: string): boolean {
    const next = this.nextLifecycleOf(currentStatusCode);
    return !!next && this.roleCanSet(next);
  }

  getStatusColor(statusCode: string): string {
    return this.findLifecycle(statusCode)?.colorCode || '#6B7280';
  }

  /** Next step shared by a selection; null (with an alert) if the selection is mixed. */
  private nextForSelection(transits: TransitGroup[]): DeliveryLifecycle | null {

    if (transits.length === 0) {
      alert('Select at least one transit.');
      return null;
    }

    const statuses = [...new Set(transits.map(t => t.lifecycleCode))];
    if (statuses.length > 1) {
      alert('Select transits that are at the same status.');
      return null;
    }

    const next = this.nextLifecycleOf(statuses[0]);
    if (!next) {
      alert('Next lifecycle step not found.');
      return null;
    }
    if (!this.roleCanSet(next)) {
      alert('Your role cannot move these transits to ' + next.statusName + '.');
      return null;
    }

    return next;
  }

  // ==========================================================================
  // PICKUP — ONE common button for everything ticked (across all manifests)
  // ==========================================================================

  /** Every ticked transit currently on screen. */
  get selectedTransits(): TransitGroup[] {
    return this.pickupGroups
      .flatMap(g => g.transits)
      .filter(t => this.selectedTransitKeys.has(t.transitKey));
  }

  get selectedCount(): number {
    return this.selectedTransits.length;
  }

  /** Bar shows as soon as at least ONE transit is ticked. */
  get showPickupBar(): boolean {
    return this.viewMode === 'pickup' && this.selectedCount > 0;
  }

  get selectedManifestCount(): number {
    return new Set(this.selectedTransits.map(t => t.manifestNo)).size;
  }

  pickupActionLabel(): string {
    const selected = this.selectedTransits;
    if (selected.length === 0) {
      return this.nextStepName;
    }
    return this.getNextStatusName(selected[0].lifecycleCode);
  }

  clearSelection(): void {
    this.selectedTransitKeys.clear();
  }

  /** Common Pickup button: advances every ticked transit, whatever manifest it is on. */
  pickupSelected(): void {

    const checked = this.selectedTransits;
    if (checked.length === 0) {
      alert('Tick the transits you picked up.');
      return;
    }

    const next = this.nextForSelection(checked);
    if (!next) {
      return;
    }

    if (this.isFinalStep(next)) {
      // Defensive: a final step must go through the delivery view / OTP.
      this.openDeliveryOtpModal(checked, next);
      return;
    }

    this.updateTransits(checked, next);
  }

  /** Row button: advances THIS transit only, no ticking needed. */
  pickupSingleTransit(transit: TransitGroup, event?: Event): void {

    event?.stopPropagation();

    const next = this.nextLifecycleOf(transit.lifecycleCode);
    if (!next || !this.roleCanSet(next)) {
      alert('Next lifecycle step not found.');
      return;
    }

    if (this.isFinalStep(next)) {
      this.openDeliveryOtpModal([transit], next);
      return;
    }

    this.updateTransits([transit], next);
  }

  // ==========================================================================
  // DELIVERY — common button per destination + per-transit button
  // ==========================================================================

  deliverActionLabel(group: DeliveryGroup): string {
    const basis = this.checkedOf(group.transits).length > 0
      ? this.checkedOf(group.transits)
      : this.checkableOf(group.transits);
    if (basis.length === 0) {
      return 'Update';
    }
    return this.getNextStatusName(basis[0].lifecycleCode);
  }

  /** Common Deliver button for ONE destination (all ticked transits of that location). */
  deliverSelected(group: DeliveryGroup): void {

    const checked = this.checkedOf(group.transits);
    if (checked.length === 0) {
      alert('Select the transits you are delivering at ' + group.destinationLocationName + '.');
      return;
    }

    const next = this.nextForSelection(checked);
    if (!next) {
      return;
    }

    this.pendingDestinationName = group.destinationLocationName;

    if (this.isFinalStep(next)) {
      this.openDeliveryOtpModal(checked, next);
      return;
    }

    this.updateTransits(checked, next);
  }

  /** Per-transit Deliver button — one transit of a location at a time. */
  deliverSingleTransit(transit: TransitGroup): void {

    const next = this.nextLifecycleOf(transit.lifecycleCode);
    if (!next || !this.roleCanSet(next)) {
      alert('Next lifecycle step not found.');
      return;
    }

    this.pendingDestinationName = transit.destinationLocationName;

    if (this.isFinalStep(next)) {
      this.openDeliveryOtpModal([transit], next);
      return;
    }

    this.updateTransits([transit], next);
  }

  // ==========================================================================
  // Save: one transaction + one manifest row per ITEM of each TRANSIT
  // ==========================================================================

  private updateTransits(
    transitsToAdvance: TransitGroup[],
    nextLifecycle: DeliveryLifecycle
  ): void {

    const isFinal = this.isFinalStep(nextLifecycle);
    const requests: Observable<any>[] = [];

    for (const transit of transitsToAdvance) {
      for (const order of transit.orders) {

        // Never pull an item row backwards (guards legacy mixed data).
        if (this.sequenceOf(order.lifecycleCode) >= nextLifecycle.sequenceNo) {
          continue;
        }

        requests.push(
          this.logisticsService.saveDeliveryOrderTransaction(
            this.buildTransactionRequest(order, nextLifecycle, isFinal)
          )
        );

        requests.push(
          this.logisticsService.saveTransferManifest(
            this.buildManifestRequest(transit, order, nextLifecycle)
          )
        );
      }
    }

    if (requests.length === 0) {
      alert('These transits are already at this status.');
      return;
    }

    this.saving = true;
    this.savingTransitKey =
      transitsToAdvance.length === 1 ? transitsToAdvance[0].transitKey : null;

    forkJoin(requests).subscribe({
      next: () => {
        this.saving = false;
        this.savingTransitKey = null;
        this.clearPending();

        const ids = transitsToAdvance.map(t => t.transitID).join(', ');
        alert(`Transit ${ids} marked as ${nextLifecycle.statusName}.`);

        this.selectedTransitKeys.clear();
        this.loadAssignedManifests();
      },
      error: (err: any) => {
        this.saving = false;
        this.savingTransitKey = null;
        this.clearPending();
        console.error('Failed to update transits:', err);
        if (err?.error?.errors) {
          console.error('Validation errors:', err.error.errors);
        }
        alert('Update failed. Nothing was changed for some transits — try again.');
        this.loadAssignedManifests();
      }
    });
  }

  private clearPending(): void {
    this.pendingTransits = [];
    this.pendingDestinationName = '';
  }

  private toIsoString(value: Date | string | null | undefined): string {
    if (!value) {
      return '';
    }
    const date = value instanceof Date ? value : new Date(value);
    return isNaN(date.getTime()) ? '' : date.toISOString();
  }

  private buildTransactionRequest(
    order: TransferManifestResponse,
    nextLifecycle: DeliveryLifecycle,
    isFinal: boolean
  ): DeliveryOrderTransaction {

    const now = new Date().toISOString();

    return {
      transferOrderId: order.transferOrderId,

      transitID: Number(order.transitID) || 0,
      deliveryNoteNo: order.deliveryNoteNo ?? '',

      transferOutDate: this.toIsoString(order.transferOutDate),
      transferOutTime: this.toIsoString(order.transferOutTime),

      sourceLocationId: order.sourceLocationId,
      sourceLocationName: order.sourceLocationName ?? '',

      destinationLocationId: order.destinationLocationId,
      destinationLocationName: order.destinationLocationName ?? '',

      itemCode: order.itemCode ?? '',
      itemName: order.itemName ?? '',
      imei: order.imei ?? '',

      transferQty: order.transferQty ?? 0,

      lifecycleId: nextLifecycle.lifecycleId,
      lifecycleSequenceNo: nextLifecycle.sequenceNo,
      lifecycleCode: nextLifecycle.statusCode,
      lifecycleName: nextLifecycle.statusName,

      transferModeId: order.transferModeId ?? 0,
      transferModeName: order.transferModeName ?? '',

      assignedUserId: order.assignedUserId ?? 0,
      assignedUserName: order.assignedUserName ?? '',

      courierId: order.courierId ?? 0,
      courierName: order.courierName ?? '',
      awbBillNo: order.awbBillNo ?? '',

      vehicleNo: order.vehicleNo ?? '',
      otherPartyName: order.otherPartyName ?? '',
      otherPartyType: order.otherPartyType ?? '',

      companyId: order.companyId ?? 0,
      companyName: order.companyName ?? '',

      pickupManifestId: order.pickupManifestId ?? undefined,
      pickupManifestNo: order.pickupManifestNo ?? '',

      locationTypeId: order.locationTypeId ?? 0,
      locationTypeName: order.locationTypeName ?? '',

      sourceLocationTypeId: order.sourceLocationTypeId ?? 0,
      sourceLocationTypeName: order.sourceLocationTypeName ?? '',

      destinationLocationTypeId: order.destinationLocationTypeId ?? 0,
      destinationLocationTypeName: order.destinationLocationTypeName ?? '',

      transferInTime: isFinal
        ? now
        : (this.toIsoString(order.transferInTime) || undefined),

      inwardDoneById: isFinal ? this.driverId : (order.inwardDoneById ?? 0),
      inwardDoneByName: isFinal ? this.driverName : (order.inwardDoneByName ?? ''),

      transferDuration: order.transferDuration ?? '',
      remarks: order.remarks ?? '',

      isActive: true,

      createdBy: order.createdBy ?? this.driverId,
      createdByName: order.createdByName ?? this.driverName,
      createdDate: order.createdDate ? this.toIsoString(order.createdDate) : now,

      modifiedBy: this.driverId,
      modifiedByName: this.driverName,
      modifiedDate: now
    };
  }

  /** Manifest row for one item row; receiver / OTP come from the TRANSIT maps. */
  private buildManifestRequest(
    transit: TransitGroup,
    forOrder: TransferManifestResponse,
    nextLifecycle: DeliveryLifecycle
  ): TransferManifest {

    const receiver = this.receiverByTransitKey.get(transit.transitKey);
    const otp = this.otpByTransitKey.get(transit.transitKey);

    return {
      manifestId: forOrder.manifestId,
      manifestNo: transit.manifestNo,
      transferOrderId: forOrder.transferOrderId,

      assignedUserId: forOrder.assignedUserId ?? this.driverId,
      assignedUserName: forOrder.assignedUserName ?? this.driverName,

      receiverUserId: receiver?.id ?? forOrder.receiverUserId ?? 0,
      receiverUserName: receiver?.name ?? forOrder.receiverUserName ?? '',

      otp: otp ?? forOrder.otp ?? '',

      lifecycleId: nextLifecycle.lifecycleId,
      lifecycleSequenceNo: nextLifecycle.sequenceNo,
      lifecycleCode: nextLifecycle.statusCode,
      lifecycleName: nextLifecycle.statusName,

      manifestDate: forOrder.manifestDate ?? new Date(),
      status: nextLifecycle.statusName,

      createdBy: forOrder.createdBy ?? this.driverId,
      createdByName: forOrder.createdByName ?? this.driverName,
      createdDate: forOrder.createdDate ?? new Date(),

      modifiedBy: this.driverId,
      modifiedByName: this.driverName,
      modifiedDate: new Date(),

      assignedById: this.driverId,
      assignedByName: this.driverName,
      assignedDate: new Date()
    };
  }

  // ==========================================================================
  // OTP flow (final step, scoped to the ticked transits of ONE destination)
  // ==========================================================================

  get pendingTransitIds(): string {
    return this.pendingTransits.map(t => t.transitID).join(', ');
  }

  get pendingTransitCount(): number {
    return this.pendingTransits.length;
  }

  get pendingItemCount(): number {
    return this.pendingTransits.reduce((sum, t) => sum + t.itemCount, 0);
  }

  get pendingManifestNos(): string {
    return [...new Set(this.pendingTransits.map(t => t.manifestNo))].join(', ');
  }

  private openDeliveryOtpModal(
    transits: TransitGroup[],
    nextLifecycle: DeliveryLifecycle
  ): void {

    // A delivery is location based: one receiver signs for one destination.
    const destinations = [...new Set(transits.map(t => t.destinationLocationId))];
    if (destinations.length > 1) {
      alert('Select transits going to the same destination.');
      return;
    }

    this.pendingTransits = transits;
    this.pendingLifecycle = nextLifecycle;
    this.pendingDestinationName = transits[0].destinationLocationName;

    this.otpInput = '';
    this.otpError = '';
    this.selectedReceiverId = 0;
    this.selectedReceiverName = '';
    this.selectedReceiverEmail = '';
    this.receiverSearch = '';
    this.otpSent = false;
    this.generatedOtp = '';

    const first = transits[0];

    this.logisticsService
      .getReceiverUsers(first.companyId, first.destinationLocationId)
      .subscribe({
        next: (res: any[]) => {

          this.users = (res ?? [])
            .map((x: any) => ({
              userId: x.userId,
              fullName: x.fullName,
              loginName: x.loginName ?? '',
              emailId: x.emailId ?? '',
              mobileNo: x.mobileNo ?? ''
            }))
            .sort((a: any, b: any) => a.fullName.localeCompare(b.fullName));

          this.filteredUsers = [...this.users];
          this.showOtpModal = true;
        },
        error: (err) => {
          console.error('Receiver Users API Error:', err);
          alert('Receiver list could not be loaded for this location.');
        }
      });
  }

  receiverChanged(): void {

    const receiver = this.users.find(x => x.userId === this.selectedReceiverId);
    if (!receiver) {
      this.selectedReceiverName = '';
      this.selectedReceiverEmail = '';
      return;
    }

    this.selectedReceiverName = receiver.fullName;
    this.selectedReceiverEmail = receiver.emailId ?? '';

    if (!this.selectedReceiverEmail) {
      this.logisticsService.getUsers().subscribe({
        next: (users: User[]) => {
          const user = users.find(x => x.userId === this.selectedReceiverId);
          this.selectedReceiverEmail = user?.emailId ?? '';
        },
        error: (err) => console.error('Failed to load user email', err)
      });
    }
  }

  filterUsers(): void {
    const search = this.receiverSearch.trim().toLowerCase();
    if (!search) {
      this.filteredUsers = [...this.users];
      return;
    }
    this.filteredUsers = this.users.filter(x =>
      (x.fullName || '').toLowerCase().includes(search)
    );
  }

  /** OTP is stamped on every item row of each selected TRANSIT. */
  sendOtp(): void {

    if (this.selectedReceiverId === 0) {
      alert('Select the receiver first.');
      return;
    }

    const receiver = this.users.find(x => x.userId === this.selectedReceiverId);
    if (!receiver) {
      alert('Receiver not found.');
      return;
    }

    if (!this.selectedReceiverEmail) {
      alert('This receiver has no email address on file.');
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    this.generatedOtp = otp;
    this.sendingOtp = true;

    // Store receiver + OTP per transit, then persist the manifest rows at their
    // CURRENT status (status only moves on Verify & Deliver).
    const requests: Observable<any>[] = [];

    for (const transit of this.pendingTransits) {

      this.otpByTransitKey.set(transit.transitKey, otp);
      this.receiverByTransitKey.set(transit.transitKey, {
        id: receiver.userId,
        name: receiver.fullName
      });

      for (const order of transit.orders) {
        const currentLifecycle =
          this.findLifecycle(order.lifecycleCode) ?? this.pendingLifecycle;

        requests.push(
          this.logisticsService.saveTransferManifest(
            this.buildManifestRequest(transit, order, currentLifecycle)
          )
        );
      }
    }

    forkJoin(requests.length ? requests : [of(null)]).subscribe({
      next: () => {

        const body = `
      Dear <b>${receiver.fullName}</b>,<br><br>
      Your Delivery Verification OTP is:
      <h2 style="color:#2563EB">${otp}</h2>
      <table cellpadding="5">
        <tr><td><b>Destination</b></td><td>${this.pendingDestinationName}</td></tr>
        <tr><td><b>Manifest No</b></td><td>${this.pendingManifestNos}</td></tr>
        <tr><td><b>Transit ID(s)</b></td><td>${this.pendingTransitIds}</td></tr>
        <tr><td><b>Driver</b></td><td>${this.driverName}</td></tr>
      </table>
      <br>
      Share this OTP with the delivery executive to complete your delivery.
      <br><br>
      Regards,<br>
      Logistics Management System
      `;

        this.authservice.sendMail({
          subject: 'Delivery Verification OTP',
          message: body,
          emailAddress: this.selectedReceiverEmail,
          isGofix: false,
          projectName: 'Logistics Management System'
        }).subscribe({
          next: () => {
            this.sendingOtp = false;
            this.otpSent = true;
            this.otpError = '';
            alert('OTP sent.');
          },
          error: (err) => {
            this.sendingOtp = false;
            console.error(err);
            alert('The OTP email did not go out. Try again.');
          }
        });
      },
      error: (err) => {
        this.sendingOtp = false;
        console.error(err);
        alert('The OTP could not be saved. Try again.');
      }
    });
  }

  confirmOtp(): void {

    if (!this.pendingLifecycle || this.pendingTransits.length === 0) {
      this.cancelOtp();
      return;
    }

    if (!this.otpSent) {
      this.otpError = 'Send the OTP to the receiver first.';
      return;
    }

    const entered = this.otpInput.trim();
    if (!entered) {
      this.otpError = 'Enter the OTP.';
      return;
    }

    const expected = (this.generatedOtp || '').trim();
    if (!expected || entered !== expected) {
      this.otpError = 'That OTP does not match. Check with the receiver and try again.';
      return;
    }

    this.otpError = '';
    this.showOtpModal = false;

    this.updateTransits(this.pendingTransits, this.pendingLifecycle);
  }

  cancelOtp(): void {
    this.showOtpModal = false;
    this.otpInput = '';
    this.otpError = '';
    this.otpSent = false;
    this.receiverSearch = '';
    this.clearPending();
  }
}