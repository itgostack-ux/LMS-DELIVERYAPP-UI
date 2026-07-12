import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, forkJoin } from 'rxjs';

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

interface DestinationGroup {
  destinationLocationId: number;
  destinationLocationName: string;
  orders: TransferManifestResponse[];
}

interface ManifestGroup {

  // Representative manifestId (first order's) - display/back-compat only.
  // Orders inside a group can carry DIFFERENT manifestId values while
  // sharing the same manifestNo, so never assume this is the only manifest
  // row backing the card - see updateOrders().
  manifestId: number;

  manifestNo: string;

  sourceLocationName: string;
  transferModeName: string;
  vehicleNo: string;
  assignedUserName: string;

  receiverUserId?: number;
  receiverUserName?: string;
  otp?: string;

  orders: TransferManifestResponse[];

  // Orders bucketed by destination for the card body.
  destinationGroups: DestinationGroup[];

  // Card starts collapsed; clicking the header expands it.
  expanded: boolean;

}

// Small summary chip shown in the manifest header, e.g. "3 Picked Up".
interface StatusBreakdown {
  code: string;
  name: string;
  color: string;
  count: number;
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
  generatedOtp = '';

  selectedReceiverId = 0;
  locationFilter = '';
  statusFilter = 'ALL';

  locationList: string[] = [];
  deliveryLifecycles: DeliveryLifecycle[] = [];

  deliveryOrders: TransferManifestResponse[] = [];
  manifestGroups: ManifestGroup[] = [];
  filteredManifestGroups: ManifestGroup[] = [];

  loading = false;
  saving = false;

  // Only the order currently being saved gets its button disabled.
  savingOrderId: number | null = null;

  // Transit rows the driver has ticked (keyed on transferOrderId). One
  // "Mark <Next>" button per destination acts on the ticked rows in THAT
  // destination only - so a delivery is always for the same location.
  selectedOrderIds = new Set<number>();

  errorMessage = '';

  // ===== OTP modal state (final "Delivered" step) =====
  showOtpModal = false;
  otpInput = '';
  otpError = '';
  otpSent = false;
  sendingOtp = false;

  users: User[] = [];
  filteredUsers: User[] = [];
  receiverSearch = '';

  selectedReceiverName = '';
  selectedReceiverEmail = '';

  // Pending delivery details for the OTP flow.
  private pendingGroup!: ManifestGroup;
  private pendingOrders: TransferManifestResponse[] = [];
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
      console.error('Invalid User Id');
      return;
    }

    this.loading = true;

    this.logisticsService.getRoleslifecycle(userId).subscribe({
      next: (roles) => {

        if (!roles || roles.length === 0) {
          console.error('No role mapped for this user.');
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
    if (this.driverId !== 0) {
      if (this.deliveryLifecycles.length === 0) {
        this.loadDeliveryLifecycles(true);
      } else {
        this.loadAssignedManifests();
      }
    }
  }

  // ===== Manifest load =====
  // Backend returns ALL manifest-order rows; filter client-side to this
  // driver. All statuses kept so every manifest is visible; per-order
  // buttons only appear where a next step exists for THAT order.
  loadAssignedManifests(): void {

  this.loading = true;
  this.errorMessage = '';

  this.logisticsService.getManifestOrders().subscribe({
    next: (rows: TransferManifestResponse[]) => {

      this.selectedOrderIds.clear();

      // Load all manifests (no driver filter)
      this.deliveryOrders = rows;

      this.locationList = [
        ...new Set(
          this.deliveryOrders
            .map(x => x.sourceLocationName)
            .filter(x => x)
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
      this.errorMessage = 'Failed to load assigned orders.';
    }
  });

}

  // Group by manifestNo -> then bucket each manifest's orders by destination.
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
        return {
          manifestId: first.manifestId,
          manifestNo,
          sourceLocationName: first.sourceLocationName,
          transferModeName: first.transferModeName,
          vehicleNo: first.vehicleNo,
          assignedUserName: first.assignedUserName,
          receiverUserId: first.receiverUserId ?? 0,
          receiverUserName: first.receiverUserName ?? '',
          otp: first.otp ?? '',
          orders,
          destinationGroups: this.groupByDestination(orders),
          expanded: false
        } as ManifestGroup;
      })
      // Actionable manifests first, then newest by highest manifestId.
      .sort((a, b) => {
        const aAct = this.manifestHasAnyNextStatus(a) ? 0 : 1;
        const bAct = this.manifestHasAnyNextStatus(b) ? 0 : 1;
        if (aAct !== bAct) {
          return aAct - bAct;
        }
        const aMax = Math.max(...a.orders.map(o => o.manifestId));
        const bMax = Math.max(...b.orders.map(o => o.manifestId));
        return bMax - aMax;
      });

  }

  private groupByDestination(rows: TransferManifestResponse[]): DestinationGroup[] {

    const map = new Map<string, DestinationGroup>();

    for (const row of rows) {
      const id = row.destinationLocationId ?? 0;
      const name = row.destinationLocationName ?? '—';
      const key = `${id}|${name}`;

      const existing = map.get(key);
      if (existing) {
        existing.orders.push(row);
      } else {
        map.set(key, {
          destinationLocationId: id,
          destinationLocationName: name,
          orders: [row]
        });
      }
    }

    return [...map.values()].sort((a, b) =>
      a.destinationLocationName.localeCompare(b.destinationLocationName)
    );

  }

  private manifestHasAnyNextStatus(group: ManifestGroup): boolean {
    return group.orders.some(o => this.hasNextStatus(o.lifecycleCode));
  }

  // ===== Filters =====

  get visibleGroups(): ManifestGroup[] {
    return this.filteredManifestGroups;
  }

  applyGroupFilters(): void {
    this.filteredManifestGroups = this.manifestGroups.filter(group => {
      const locationMatch =
        !this.locationFilter || group.sourceLocationName === this.locationFilter;
      const statusMatch =
        this.statusFilter === 'ALL' ||
        group.orders.some(o => o.lifecycleCode === this.statusFilter);
      return locationMatch && statusMatch;
    });
  }

  applyFilters(): void {
    this.applyGroupFilters();
  }

  setStatusFilter(code: string): void {
    this.statusFilter = code;
    this.applyGroupFilters();
  }

  // One tab per lifecycle status that has orders under it, in sequence
  // order, each with its ORDER count.
  get statusTabs(): { code: string; name: string; count: number }[] {

    const counts = new Map<string, number>();
    for (const g of this.manifestGroups) {
      for (const o of g.orders) {
        counts.set(o.lifecycleCode, (counts.get(o.lifecycleCode) ?? 0) + 1);
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

  // ===== Header chips / status helpers =====

  statusBreakdown(group: ManifestGroup): StatusBreakdown[] {
    const counts = new Map<string, number>();
    for (const o of group.orders) {
      counts.set(o.lifecycleCode, (counts.get(o.lifecycleCode) ?? 0) + 1);
    }
    return [...counts.entries()].map(([code, count]) => ({
      code,
      name: this.findLifecycle(code)?.statusName ?? code,
      color: this.getStatusColor(code),
      count
    }));
  }

  // ===== Per-transit checkbox selection (scoped to a destination) =====

  // A row is tickable only while it still has a next step.
  isOrderCheckable(order: TransferManifestResponse): boolean {
    return this.hasNextStatus(order.lifecycleCode);
  }

  isChecked(order: TransferManifestResponse): boolean {
    return this.selectedOrderIds.has(order.transferOrderId);
  }

  toggleOrder(order: TransferManifestResponse): void {
    if (!this.isOrderCheckable(order)) {
      return;
    }
    if (this.selectedOrderIds.has(order.transferOrderId)) {
      this.selectedOrderIds.delete(order.transferOrderId);
    } else {
      this.selectedOrderIds.add(order.transferOrderId);
    }
  }

  // Header "select all" for one destination - only its actionable rows.
  private checkableOrders(dest: DestinationGroup): TransferManifestResponse[] {
    return dest.orders.filter(o => this.isOrderCheckable(o));
  }

  allCheckedInDest(dest: DestinationGroup): boolean {
    const checkable = this.checkableOrders(dest);
    return checkable.length > 0 && checkable.every(o => this.isChecked(o));
  }

  toggleAllInDest(dest: DestinationGroup, checked: boolean): void {
    for (const o of this.checkableOrders(dest)) {
      if (checked) {
        this.selectedOrderIds.add(o.transferOrderId);
      } else {
        this.selectedOrderIds.delete(o.transferOrderId);
      }
    }
  }

  checkedOrdersInDest(dest: DestinationGroup): TransferManifestResponse[] {
    return dest.orders.filter(o => this.isChecked(o));
  }

  checkedCountInDest(dest: DestinationGroup): number {
    return this.checkedOrdersInDest(dest).length;
  }

  destHasActionable(dest: DestinationGroup): boolean {
    return dest.orders.some(o => this.isOrderCheckable(o));
  }

  // Button label: the next step of the ticked rows. Falls back to the next
  // step of the destination's first actionable row when nothing is ticked.
  destActionLabel(dest: DestinationGroup): string {
    const checked = this.checkedOrdersInDest(dest);
    const basis = checked.length > 0 ? checked : this.checkableOrders(dest);
    if (basis.length === 0) {
      return 'Mark';
    }
    return this.getNextStatusName(basis[0].lifecycleCode);
  }

  manifestHasAnyActionable(group: ManifestGroup): boolean {
    return this.manifestHasAnyNextStatus(group);
  }

  // ===== Expand / collapse =====
  toggleGroup(group: ManifestGroup): void {
    group.expanded = !group.expanded;
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

  // ===== Advance actions (all keyed on the order / transit) =====

  // ONE button per destination: advance the ticked transits in THIS
  // destination (same location). All ticked rows must share the same
  // current status so a single next step applies to them together.
  processCheckedOrders(group: ManifestGroup, dest: DestinationGroup): void {

    const checked = this.checkedOrdersInDest(dest);
    if (checked.length === 0) {
      alert('Please select at least one transit.');
      return;
    }

    const statuses = new Set(checked.map(o => o.lifecycleCode));
    if (statuses.size > 1) {
      alert('Please select transits that are at the same status.');
      return;
    }

    const statusCode = [...statuses][0];
    const nextLifecycle = this.nextLifecycleOf(statusCode);
    if (!nextLifecycle) {
      alert('Next lifecycle step not found.');
      return;
    }

    if (this.isFinalStep(nextLifecycle)) {
      this.openDeliveryOtpModal(group, checked, nextLifecycle);
      return;
    }

    this.updateOrders(group, checked, nextLifecycle);
  }

  // Shared OTP modal setup for the final (Delivered) step.
  private openDeliveryOtpModal(
    group: ManifestGroup,
    orders: TransferManifestResponse[],
    nextLifecycle: DeliveryLifecycle
  ): void {

    this.pendingGroup = group;
    this.pendingOrders = orders;
    this.pendingLifecycle = nextLifecycle;

    this.otpInput = '';
    this.otpError = '';
    this.selectedReceiverId = 0;
    this.selectedReceiverName = '';
    this.selectedReceiverEmail = '';
    this.receiverSearch = '';
    this.otpSent = false;
    this.generatedOtp = '';

    const order = orders[0];

    console.log('==============================');
    console.log('Opening OTP Modal');
    console.log('Company Id :', order.companyId);
    console.log('Destination Location Id :', order.destinationLocationId);
    console.log('Destination Location :', order.destinationLocationName);
    console.log('==============================');

    this.logisticsService
      .getReceiverUsers(
        order.companyId,
        order.destinationLocationId
      )
      .subscribe({
        next: (res: any[]) => {

          console.log('Receiver Users API Response:', res);

          this.users = res
            .map((x: any) => ({
              userId: x.userId,
              fullName: x.fullName,
              loginName: x.loginName ?? '',
              emailId: x.emailId ?? '',
              mobileNo: x.mobileNo ?? ''
            }))
            .sort((a: any, b: any) =>
              a.fullName.localeCompare(b.fullName)
            );

          console.log('Mapped Users:', this.users);

          this.filteredUsers = [...this.users];

          console.log('Filtered Users:', this.filteredUsers);

          this.showOtpModal = true;
        },
        error: (err) => {
          console.error('Receiver Users API Error:', err);
          alert('Unable to load receiver users.');
        }
      });
  }
  // ===== OTP modal actions =====

  confirmOtp(): void {

    if (!this.pendingGroup || !this.pendingLifecycle) {
      this.cancelOtp();
      return;
    }

    if (!this.otpSent) {
      this.otpError = 'Please send the OTP to the receiver first.';
      return;
    }

    const entered = this.otpInput.trim();
    if (!entered) {
      this.otpError = 'Please enter the OTP.';
      return;
    }

    const expected = (this.pendingGroup.otp || this.generatedOtp || '').trim();
    if (!expected || entered !== expected) {
      this.otpError = 'Invalid OTP. Please check with the receiver and try again.';
      return;
    }

    this.otpError = '';
    this.showOtpModal = false;

    this.updateOrders(
      this.pendingGroup,
      this.pendingOrders,
      this.pendingLifecycle
    );

  }

  cancelOtp(): void {
    this.showOtpModal = false;
    this.otpInput = '';
    this.otpError = '';
    this.otpSent = false;
    this.receiverSearch = '';
    this.pendingOrders = [];
  }

  // ===== Save =====
  // One DeliveryOrderTransaction per order being advanced (keyed on the
  // order). The manifest row(s) are only bumped once EVERY order under the
  // manifest has reached the next status - checked AFTER this advance so a
  // partial per-transit mark never pushes the manifest ahead of orders
  // still waiting. A card can be backed by several manifestId rows sharing
  // one manifestNo, so every distinct manifestId is updated.
  private updateOrders(
    group: ManifestGroup,
    ordersToAdvance: TransferManifestResponse[],
    nextLifecycle: DeliveryLifecycle
  ): void {

    this.saving = true;
    this.savingOrderId =
      ordersToAdvance.length === 1 ? ordersToAdvance[0].transferOrderId : null;

    const isFinal = this.isFinalStep(nextLifecycle);

    const requests: Observable<any>[] = ordersToAdvance.map(order =>
      this.logisticsService.saveDeliveryOrderTransaction(
        this.buildTransactionRequest(order, nextLifecycle, isFinal)
      )
    );

    // Would every order in the manifest be at nextLifecycle AFTER this save?
    const advancedIds = new Set(ordersToAdvance.map(o => o.transferOrderId));
    const allAtNextAfterAdvance = group.orders.every(o =>
      advancedIds.has(o.transferOrderId) ||
      o.lifecycleCode === nextLifecycle.statusCode
    );

    if (allAtNextAfterAdvance) {
      const seenManifestIds = new Set<number>();
      for (const order of group.orders) {
        if (seenManifestIds.has(order.manifestId)) {
          continue;
        }
        seenManifestIds.add(order.manifestId);
        requests.push(
          this.logisticsService.saveTransferManifest(
            this.buildManifestRequest(group, order, nextLifecycle)
          )
        );
      }
    }

    forkJoin(requests).subscribe({
      next: () => {
        this.saving = false;
        this.savingOrderId = null;
        this.clearPending();
        alert(`${ordersToAdvance.length} order(s) marked as ${nextLifecycle.statusName}.`);
        this.loadAssignedManifests();
      },
      error: (err: any) => {
        this.saving = false;
        this.savingOrderId = null;
        this.clearPending();
        console.error('Failed to update orders:', err);
        if (err?.error?.errors) {
          console.error('Validation errors:', err.error.errors);
        }
        alert('Failed to update one or more orders. Please try again.');
        this.loadAssignedManifests();
      }
    });

  }

  private clearPending(): void {
    this.pendingOrders = [];
  }

  private toIsoString(value: Date | null | undefined): string {
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

    console.log('===== Save Delivery Transaction =====');
    console.log('TransferOrderId:', order.transferOrderId);
    console.log('CompanyId:', order.companyId);
    console.log('CompanyName:', order.companyName);

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

      // Lifecycle
      lifecycleId: nextLifecycle.lifecycleId,
      lifecycleSequenceNo: nextLifecycle.sequenceNo,
      lifecycleCode: nextLifecycle.statusCode,
      lifecycleName: nextLifecycle.statusName,

      // Transfer Mode
      transferModeId: order.transferModeId ?? 0,
      transferModeName: order.transferModeName ?? '',

      // Assigned User
      assignedUserId: order.assignedUserId ?? 0,
      assignedUserName: order.assignedUserName ?? '',

      // Courier
      courierId: order.courierId ?? 0,
      courierName: order.courierName ?? '',
      awbBillNo: order.awbBillNo ?? '',

      // Vehicle / Other
      vehicleNo: order.vehicleNo ?? '',
      otherPartyName: order.otherPartyName ?? '',
      otherPartyType: order.otherPartyType ?? '',

      // Company
      companyId: order.companyId ?? 0,
      companyName: order.companyName ?? '',

      pickupManifestId: order.pickupManifestId ?? undefined,
      pickupManifestNo: order.pickupManifestNo ?? '',
      // Location Type
      locationTypeId: order.locationTypeId ?? 0,
      locationTypeName: order.locationTypeName ?? '',

      sourceLocationTypeId: order.sourceLocationTypeId ?? 0,
      sourceLocationTypeName: order.sourceLocationTypeName ?? '',

      destinationLocationTypeId: order.destinationLocationTypeId ?? 0,
      destinationLocationTypeName: order.destinationLocationTypeName ?? '',

      // Delivery
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

      // Audit
      createdBy: order.createdBy ?? this.driverId,
      createdByName: order.createdByName ?? this.driverName,
      createdDate: order.createdDate
        ? this.toIsoString(order.createdDate)
        : now,

      modifiedBy: this.driverId,
      modifiedByName: this.driverName,
      modifiedDate: now
    };
  }

  private buildManifestRequest(
    group: ManifestGroup,
    forOrder: TransferManifestResponse,
    nextLifecycle: DeliveryLifecycle
  ): TransferManifest {

    return {
      manifestId: forOrder.manifestId,
      manifestNo: group.manifestNo,
      transferOrderId: forOrder.transferOrderId,

      assignedUserId: forOrder.assignedUserId ?? this.driverId,
      assignedUserName: forOrder.assignedUserName ?? this.driverName,

      receiverUserId: group.receiverUserId ?? forOrder.receiverUserId ?? 0,
      receiverUserName: group.receiverUserName ?? forOrder.receiverUserName ?? '',

      otp: group.otp ?? forOrder.otp ?? '',

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

  // ===== Receiver / OTP send =====

  receiverChanged(): void {

    const receiver = this.users.find(x => x.userId === this.selectedReceiverId);
    if (!receiver) {
      this.selectedReceiverName = '';
      this.selectedReceiverEmail = '';
      return;
    }

    this.selectedReceiverName = receiver.fullName;

    this.logisticsService.getUsers().subscribe({
      next: (users: User[]) => {
        const user = users.find(x => x.userId === this.selectedReceiverId);
        this.selectedReceiverEmail = user?.emailId ?? '';
      },
      error: (err) => {
        console.error('Failed to load user email', err);
      }
    });

  }

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

    this.pendingGroup.receiverUserId = receiver.userId;
    this.pendingGroup.receiverUserName = receiver.fullName;
    this.pendingGroup.otp = otp;

    const currentStatusCode = this.pendingOrders[0]?.lifecycleCode;
    const currentLifecycle =
      (currentStatusCode ? this.findLifecycle(currentStatusCode) : undefined)
      ?? this.pendingLifecycle;

    this.sendingOtp = true;
    const pendingOrder = this.pendingOrders[0];

    this.logisticsService.saveTransferManifest({
      manifestId: pendingOrder.manifestId,
      manifestNo: this.pendingGroup.manifestNo,
      transferOrderId: pendingOrder.transferOrderId,

      assignedUserId: pendingOrder.assignedUserId ?? this.driverId,
      assignedUserName: pendingOrder.assignedUserName ?? this.driverName,

      receiverUserId: receiver.userId,
      receiverUserName: receiver.fullName,
      otp: otp,

      lifecycleId: currentLifecycle.lifecycleId,
      lifecycleSequenceNo: currentLifecycle.sequenceNo,
      lifecycleCode: currentLifecycle.statusCode,
      lifecycleName: currentLifecycle.statusName,

      manifestDate: new Date(),
      status: currentLifecycle.statusName,

      createdBy: this.driverId,
      createdByName: this.driverName,
      createdDate: new Date(),

      modifiedBy: this.driverId,
      modifiedByName: this.driverName,
      modifiedDate: new Date(),

      assignedById: this.driverId,
      assignedByName: this.driverName,
      assignedDate: new Date()
    }).subscribe({
      next: () => {

        const body = `
      Dear <b>${receiver.fullName}</b>,<br><br>
      Your Delivery Verification OTP is:
      <h2 style="color:#2563EB">${otp}</h2>
      <table cellpadding="5">
        <tr><td><b>Manifest No</b></td><td>${this.pendingGroup.manifestNo}</td></tr>
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

}