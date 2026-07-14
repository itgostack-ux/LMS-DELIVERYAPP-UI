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
 * The API returns ONE ROW PER ITEM (IMEI / item code). Several rows can share the
 * same transitID. The driver works on TRANSITS, not items, so every row in the UI
 * below is a TRANSIT and every action fans out to all item rows behind it.
 */
interface TransitGroup {
  transitKey: string;          // manifestNo::transitID  (stable id for selection)
  transitID: number;
  manifestNo: string;

  deliveryNoteNo: string;
  companyId: number;
  companyName: string;

  sourceLocationId: number;
  sourceLocationName: string;
  destinationLocationId: number;
  destinationLocationName: string;

  itemCount: number;
  totalQty: number;

  // Effective status = the LEAST advanced item row in the transit.
  lifecycleCode: string;
  lifecycleName: string;
  mixed: boolean;              // true if item rows disagree (legacy data)

  orders: TransferManifestResponse[];   // item rows behind this transit
  expanded: boolean;                    // item detail open?
}

interface DestinationGroup {
  destinationLocationId: number;
  destinationLocationName: string;
  transits: TransitGroup[];
}

interface ManifestGroup {
  manifestId: number;          // display only
  manifestNo: string;

  sourceLocationName: string;
  transferModeName: string;
  vehicleNo: string;
  assignedUserName: string;

  transits: TransitGroup[];
  destinationGroups: DestinationGroup[];

  expanded: boolean;
}

interface StatusBreakdown {
  code: string;
  name: string;
  color: string;
  count: number;               // TRANSIT count, not item count
}

@Component({
  selector: 'app-driver-console',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './driver-console.html',
  styleUrl: './driver-console.css',
})
export class DriverConsole implements OnInit {

  // ===== Logged-in driver =====
  driverId = 0;
  driverName = '';

  // ===== Filters =====
  locationFilter = '';
  statusFilter = 'ALL';

  locationList: string[] = [];
  deliveryLifecycles: DeliveryLifecycle[] = [];

  deliveryOrders: TransferManifestResponse[] = [];
  manifestGroups: ManifestGroup[] = [];
  filteredManifestGroups: ManifestGroup[] = [];

  loading = false;
  saving = false;
  savingTransitKey: string | null = null;

  errorMessage = '';

  // ===== Selection: keyed on TRANSIT, never on an item row =====
  selectedTransitKeys = new Set<string>();

  private expandedManifestNos = new Set<string>();
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

  // Receiver / OTP recorded PER TRANSIT, so a manifest can be delivered in parts.
  private otpByTransitKey = new Map<string, string>();
  private receiverByTransitKey = new Map<string, { id: number; name: string }>();

  // Pending delivery details for the OTP flow.
  private pendingGroup!: ManifestGroup;
  private pendingTransits: TransitGroup[] = [];
  private pendingLifecycle!: DeliveryLifecycle;

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

  // ===== Lifecycle master load =====

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

        this.logisticsService.getRoleBasedLifecycles(roleId).subscribe({
          next: (lifecycles) => {
            this.deliveryLifecycles = lifecycles.sort(
              (a, b) => a.sequenceNo - b.sequenceNo
            );
            if (loadManifestsAfter) {
              this.loadAssignedManifests();
            } else {
              this.loading = false;
            }
          },
          error: (err: any) => {
            console.error('Failed to load role-based lifecycles:', err);
            this.loading = false;
            this.errorMessage = 'Failed to load lifecycle steps. Please try again.';
          }
        });

      },
      error: (err: any) => {
        console.error('Failed to load user roles:', err);
        this.loading = false;
        this.errorMessage = 'Failed to load user roles. Please try again.';
      }
    });

  }

  refresh(): void {
    if (this.driverId === 0) {
      return;
    }
    if (this.deliveryLifecycles.length === 0) {
      this.loadDeliveryLifecycles(true);
    } else {
      this.loadAssignedManifests();
    }
  }

  // ===== Manifest load =====

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
          ...new Set(
            this.deliveryOrders
              .map(x => x.sourceLocationName)
              .filter(x => !!x)
          )
        ].sort();

        this.manifestGroups = this.groupByManifest(this.deliveryOrders);
        this.applyGroupFilters();

        this.loading = false;
      },

      error: (err) => {
        console.error(err);
        this.deliveryOrders = [];
        this.manifestGroups = [];
        this.filteredManifestGroups = [];
        this.loading = false;
        this.errorMessage = 'Failed to load assigned manifests.';
      }

    });

  }

  // manifestNo -> transitID -> item rows
  private groupByManifest(rows: TransferManifestResponse[]): ManifestGroup[] {

    const map = new Map<string, TransferManifestResponse[]>();

    for (const row of rows) {
      const key = row.manifestNo || `#${row.manifestId}`;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }

    return [...map.entries()]
      .map(([manifestNo, orders]) => {

        const first = orders[0];
        const transits = this.buildTransits(manifestNo, orders);

        return {
          manifestId: first.manifestId,
          manifestNo,
          sourceLocationName: first.sourceLocationName,
          transferModeName: first.transferModeName,
          vehicleNo: first.vehicleNo,
          assignedUserName: first.assignedUserName,
          transits,
          destinationGroups: this.groupByDestination(transits),
          expanded: this.expandedManifestNos.has(manifestNo)
        } as ManifestGroup;

      })
      .sort((a, b) => {
        const aAct = this.manifestHasAnyActionable(a) ? 0 : 1;
        const bAct = this.manifestHasAnyActionable(b) ? 0 : 1;
        if (aAct !== bAct) {
          return aAct - bAct;
        }
        return b.manifestNo.localeCompare(a.manifestNo);
      });

  }

  /** Collapse the item rows of one manifest into TRANSITS. */
  private buildTransits(
    manifestNo: string,
    rows: TransferManifestResponse[]
  ): TransitGroup[] {

    const map = new Map<number, TransferManifestResponse[]>();

    for (const row of rows) {
      const id = Number(row.transitID) || 0;
      const list = map.get(id) ?? [];
      list.push(row);
      map.set(id, list);
    }

    return [...map.entries()]
      .map(([transitID, orders]) => {

        const base = this.leastAdvancedOrder(orders);
        const codes = new Set(orders.map(o => o.lifecycleCode));
        const transitKey = `${manifestNo}::${transitID}`;

        return {
          transitKey,
          transitID,
          manifestNo,

          deliveryNoteNo: base.deliveryNoteNo ?? '',
          companyId: base.companyId ?? 0,
          companyName: base.companyName ?? '',

          sourceLocationId: base.sourceLocationId,
          sourceLocationName: base.sourceLocationName ?? '',
          destinationLocationId: base.destinationLocationId ?? 0,
          destinationLocationName: base.destinationLocationName ?? '—',

          itemCount: orders.length,
          totalQty: orders.reduce((sum, o) => sum + (o.transferQty ?? 0), 0),

          lifecycleCode: base.lifecycleCode,
          lifecycleName:
            this.findLifecycle(base.lifecycleCode)?.statusName ?? base.lifecycleName,
          mixed: codes.size > 1,

          orders,
          expanded: this.expandedTransitKeys.has(transitKey)
        } as TransitGroup;

      })
      .sort((a, b) => a.transitID - b.transitID);

  }

  private groupByDestination(transits: TransitGroup[]): DestinationGroup[] {

    const map = new Map<string, DestinationGroup>();

    for (const transit of transits) {
      const key = `${transit.destinationLocationId}|${transit.destinationLocationName}`;
      const existing = map.get(key);
      if (existing) {
        existing.transits.push(transit);
      } else {
        map.set(key, {
          destinationLocationId: transit.destinationLocationId,
          destinationLocationName: transit.destinationLocationName,
          transits: [transit]
        });
      }
    }

    return [...map.values()].sort((a, b) =>
      a.destinationLocationName.localeCompare(b.destinationLocationName)
    );

  }

  /** The item row that is furthest behind — it drives the transit's status. */
  private leastAdvancedOrder(
    orders: TransferManifestResponse[]
  ): TransferManifestResponse {
    return orders.reduce((slowest, current) =>
      this.sequenceOf(current.lifecycleCode) < this.sequenceOf(slowest.lifecycleCode)
        ? current
        : slowest
    );
  }

  private sequenceOf(statusCode: string): number {
    return this.findLifecycle(statusCode)?.sequenceNo ?? Number.MAX_SAFE_INTEGER;
  }

  // ===== Filters (status filter works at TRANSIT level) =====

  get visibleGroups(): ManifestGroup[] {
    return this.filteredManifestGroups;
  }

  applyGroupFilters(): void {

    const result: ManifestGroup[] = [];

    for (const group of this.manifestGroups) {

      if (this.locationFilter && group.sourceLocationName !== this.locationFilter) {
        continue;
      }

      const transits = this.statusFilter === 'ALL'
        ? group.transits
        : group.transits.filter(t => t.lifecycleCode === this.statusFilter);

      if (transits.length === 0) {
        continue;
      }

      result.push({
        ...group,
        transits,
        destinationGroups: this.groupByDestination(transits),
        expanded: this.expandedManifestNos.has(group.manifestNo)
      });

    }

    this.filteredManifestGroups = result;
  }

  applyFilters(): void {
    this.applyGroupFilters();
  }

  setStatusFilter(code: string): void {
    this.statusFilter = code;
    this.applyGroupFilters();
  }

  get totalTransitCount(): number {
    return this.manifestGroups.reduce((sum, g) => sum + g.transits.length, 0);
  }

  /** One tab per lifecycle status that has transits under it. */
  get statusTabs(): { code: string; name: string; count: number }[] {

    const counts = new Map<string, number>();
    for (const g of this.manifestGroups) {
      for (const t of g.transits) {
        counts.set(t.lifecycleCode, (counts.get(t.lifecycleCode) ?? 0) + 1);
      }
    }

    return this.deliveryLifecycles
      .filter(l => counts.has(l.statusCode))
      .map(l => ({
        code: l.statusCode,
        name: l.statusName,
        count: counts.get(l.statusCode) ?? 0
      }));

  }

  // ===== Header chips (transit counts) =====

  statusBreakdown(group: ManifestGroup): StatusBreakdown[] {
    const counts = new Map<string, number>();
    for (const t of group.transits) {
      counts.set(t.lifecycleCode, (counts.get(t.lifecycleCode) ?? 0) + 1);
    }
    return [...counts.entries()].map(([code, count]) => ({
      code,
      name: this.findLifecycle(code)?.statusName ?? code,
      color: this.getStatusColor(code),
      count
    }));
  }

  // ===== Transit selection =====

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

  private checkableTransits(dest: DestinationGroup): TransitGroup[] {
    return dest.transits.filter(t => this.isTransitCheckable(t));
  }

  allCheckedInDest(dest: DestinationGroup): boolean {
    const checkable = this.checkableTransits(dest);
    return checkable.length > 0 && checkable.every(t => this.isChecked(t));
  }

  toggleAllInDest(dest: DestinationGroup, checked: boolean): void {
    for (const t of this.checkableTransits(dest)) {
      if (checked) {
        this.selectedTransitKeys.add(t.transitKey);
      } else {
        this.selectedTransitKeys.delete(t.transitKey);
      }
    }
  }

  checkedTransitsInDest(dest: DestinationGroup): TransitGroup[] {
    return dest.transits.filter(t => this.isChecked(t));
  }

  checkedCountInDest(dest: DestinationGroup): number {
    return this.checkedTransitsInDest(dest).length;
  }

  destHasActionable(dest: DestinationGroup): boolean {
    return dest.transits.some(t => this.isTransitCheckable(t));
  }

  /** Button label = next step of the ticked transits. */
  destActionLabel(dest: DestinationGroup): string {
    const checked = this.checkedTransitsInDest(dest);
    const basis = checked.length > 0 ? checked : this.checkableTransits(dest);
    if (basis.length === 0) {
      return 'Mark';
    }
    return this.getNextStatusName(basis[0].lifecycleCode);
  }

  manifestHasAnyActionable(group: ManifestGroup): boolean {
    return group.transits.some(t => this.isTransitCheckable(t));
  }

  // ===== Expand / collapse =====

  toggleGroup(group: ManifestGroup): void {
    group.expanded = !group.expanded;
    if (group.expanded) {
      this.expandedManifestNos.add(group.manifestNo);
    } else {
      this.expandedManifestNos.delete(group.manifestNo);
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

  // ===== Lifecycle helpers =====

  private findLifecycle(statusCode: string): DeliveryLifecycle | undefined {
    return this.deliveryLifecycles.find(x => x.statusCode === statusCode);
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

  getNextStatusName(currentStatusCode: string): string {
    return this.nextLifecycleOf(currentStatusCode)?.statusName ?? 'No Next Status';
  }

  hasNextStatus(currentStatusCode: string): boolean {
    return !!this.findLifecycle(currentStatusCode)?.nextStatusCode;
  }

  getStatusColor(statusCode: string): string {
    return this.findLifecycle(statusCode)?.colorCode || '#6B7280';
  }

  // ===== Advance action: TRANSIT LEVEL =====

  processCheckedTransits(group: ManifestGroup, dest: DestinationGroup): void {

    const checked = this.checkedTransitsInDest(dest);
    if (checked.length === 0) {
      alert('Please select at least one transit.');
      return;
    }

    const statuses = new Set(checked.map(t => t.lifecycleCode));
    if (statuses.size > 1) {
      alert('Please select transits that are at the same status.');
      return;
    }

    const nextLifecycle = this.nextLifecycleOf([...statuses][0]);
    if (!nextLifecycle) {
      alert('Next lifecycle step not found.');
      return;
    }

    if (this.isFinalStep(nextLifecycle)) {
      this.openDeliveryOtpModal(group, checked, nextLifecycle);
      return;
    }

    this.updateTransits(group, checked, nextLifecycle);
  }

  /** Row button: advances THIS transit (and every item row inside it). */
  processSingleTransit(group: ManifestGroup, transit: TransitGroup): void {

    const nextLifecycle = this.nextLifecycleOf(transit.lifecycleCode);
    if (!nextLifecycle) {
      alert('Next lifecycle step not found.');
      return;
    }

    if (this.isFinalStep(nextLifecycle)) {
      this.openDeliveryOtpModal(group, [transit], nextLifecycle);
      return;
    }

    this.updateTransits(group, [transit], nextLifecycle);
  }

  // ===== Save: one transaction + one manifest row per ITEM of each TRANSIT =====
  private updateTransits(
    group: ManifestGroup,
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
            this.buildManifestRequest(group, transit, order, nextLifecycle)
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
        alert('Failed to update one or more transits. Please try again.');
        this.loadAssignedManifests();
      }
    });

  }

  private clearPending(): void {
    this.pendingTransits = [];
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

      inwardDoneById: isFinal
        ? this.driverId
        : (order.inwardDoneById ?? 0),

      inwardDoneByName: isFinal
        ? this.driverName
        : (order.inwardDoneByName ?? ''),

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
    group: ManifestGroup,
    transit: TransitGroup,
    forOrder: TransferManifestResponse,
    nextLifecycle: DeliveryLifecycle
  ): TransferManifest {

    const receiver = this.receiverByTransitKey.get(transit.transitKey);
    const otp = this.otpByTransitKey.get(transit.transitKey);

    return {
      manifestId: forOrder.manifestId,
      manifestNo: group.manifestNo,
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

  // ===== OTP flow (final step, scoped to the ticked transits) =====

  get pendingTransitIds(): string {
    return this.pendingTransits.map(t => t.transitID).join(', ');
  }

  get pendingTransitCount(): number {
    return this.pendingTransits.length;
  }

  get pendingItemCount(): number {
    return this.pendingTransits.reduce((sum, t) => sum + t.itemCount, 0);
  }

  private openDeliveryOtpModal(
    group: ManifestGroup,
    transits: TransitGroup[],
    nextLifecycle: DeliveryLifecycle
  ): void {

    this.pendingGroup = group;
    this.pendingTransits = transits;
    this.pendingLifecycle = nextLifecycle;

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
          alert('Unable to load receiver users.');
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
      alert('Please select Receiver.');
      return;
    }

    const receiver = this.users.find(x => x.userId === this.selectedReceiverId);
    if (!receiver) {
      alert('Receiver not found.');
      return;
    }

    if (!this.selectedReceiverEmail) {
      alert('Receiver email is not available.');
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    this.generatedOtp = otp;

    this.sendingOtp = true;

    // Remember receiver + OTP per transit, then persist the manifest rows at their
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
            this.buildManifestRequest(this.pendingGroup, transit, order, currentLifecycle)
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
        <tr><td><b>Manifest No</b></td><td>${this.pendingGroup.manifestNo}</td></tr>
        <tr><td><b>Transit ID(s)</b></td><td>${this.pendingTransitIds}</td></tr>
        <tr><td><b>Driver</b></td><td>${this.driverName}</td></tr>
      </table>
      <br>
      Please share this OTP with the delivery executive to complete your delivery.
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
            alert('OTP sent successfully.');
          },
          error: (err) => {
            this.sendingOtp = false;
            console.error(err);
            alert('Failed to send OTP email.');
          }
        });

      },
      error: (err) => {
        this.sendingOtp = false;
        console.error(err);
        alert('Failed to save OTP.');
      }
    });

  }

  confirmOtp(): void {

    if (!this.pendingGroup || !this.pendingLifecycle || this.pendingTransits.length === 0) {
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
      this.otpError = 'Invalid OTP. Check with the receiver and try again.';
      return;
    }

    this.otpError = '';
    this.showOtpModal = false;

    this.updateTransits(this.pendingGroup, this.pendingTransits, this.pendingLifecycle);
  }

  cancelOtp(): void {
    this.showOtpModal = false;
    this.otpInput = '';
    this.otpError = '';
    this.otpSent = false;
    this.receiverSearch = '';
    this.pendingTransits = [];
  }

}