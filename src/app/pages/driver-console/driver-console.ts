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
  // Display key only. Orders inside a group can carry DIFFERENT manifestId
  // values while sharing the same manifestNo. Every action below is keyed on
  // the ORDER (transferOrderId) + that order's own manifestId.
  manifestId: number;
  manifestNo: string;

  sourceLocationName: string;
  transferModeName: string;
  vehicleNo: string;
  assignedUserName: string;

  orders: TransferManifestResponse[];
  destinationGroups: DestinationGroup[];

  expanded: boolean;
}

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
  savingOrderId: number | null = null;

  errorMessage = '';

  // ===== Transit-level selection (keyed on transferOrderId) =====
  selectedOrderIds = new Set<number>();

  // Expanded cards survive re-filtering.
  private expandedManifestNos = new Set<string>();

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

  // Receiver / OTP recorded PER ORDER, so a manifest can be delivered in parts.
  private otpByOrderId = new Map<number, string>();
  private receiverByOrderId = new Map<number, { id: number; name: string }>();

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

  loadAssignedManifests(): void {

    this.loading = true;
    this.errorMessage = '';

    const userId = this.userDataService.getUserId();
    if (userId === 0) {
      this.loading = false;
      this.errorMessage = 'Invalid user. Please login again.';
      return;
    }

    this.logisticsService.getManifestOrders().subscribe({

      next: (rows: TransferManifestResponse[]) => {

        this.selectedOrderIds.clear();

        this.deliveryOrders = rows.filter(x => x.assignedUserId === userId);

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
        this.errorMessage = 'Failed to load assigned manifests.';
      }

    });

  }

  // Group by manifestNo (display only) -> bucket each manifest's orders by destination.
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
          orders,
          destinationGroups: this.groupByDestination(orders),
          expanded: this.expandedManifestNos.has(manifestNo)
        } as ManifestGroup;
      })
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

  // ===== Filters (status filter now works at ORDER level) =====

  get visibleGroups(): ManifestGroup[] {
    return this.filteredManifestGroups;
  }

  applyGroupFilters(): void {

    const result: ManifestGroup[] = [];

    for (const group of this.manifestGroups) {

      if (this.locationFilter && group.sourceLocationName !== this.locationFilter) {
        continue;
      }

      const orders = this.statusFilter === 'ALL'
        ? group.orders
        : group.orders.filter(o => o.lifecycleCode === this.statusFilter);

      if (orders.length === 0) {
        continue;
      }

      result.push({
        ...group,
        orders,
        destinationGroups: this.groupByDestination(orders),
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

  get totalOrderCount(): number {
    return this.manifestGroups.reduce((sum, g) => sum + g.orders.length, 0);
  }

  // One tab per lifecycle status that has orders under it, with its ORDER count.
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

  // ===== Header chips =====

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

  // ===== Transit-level checkbox selection =====

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

  // Button label = next step of the ticked transits.
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
    if (group.expanded) {
      this.expandedManifestNos.add(group.manifestNo);
    } else {
      this.expandedManifestNos.delete(group.manifestNo);
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

  // ===== Advance action: ORDER LEVEL =====
  // Acts ONLY on the ticked transits of this destination. Nothing else in the
  // manifest is touched.
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

  // Single-row quick action (optional button in the row).
  processSingleOrder(group: ManifestGroup, order: TransferManifestResponse): void {

    const nextLifecycle = this.nextLifecycleOf(order.lifecycleCode);
    if (!nextLifecycle) {
      alert('Next lifecycle step not found.');
      return;
    }

    if (this.isFinalStep(nextLifecycle)) {
      this.openDeliveryOtpModal(group, [order], nextLifecycle);
      return;
    }

    this.updateOrders(group, [order], nextLifecycle);
  }

  // ===== Save: one transaction + one manifest row PER ORDER =====
  private updateOrders(
    group: ManifestGroup,
    ordersToAdvance: TransferManifestResponse[],
    nextLifecycle: DeliveryLifecycle
  ): void {

    this.saving = true;
    this.savingOrderId =
      ordersToAdvance.length === 1 ? ordersToAdvance[0].transferOrderId : null;

    const isFinal = this.isFinalStep(nextLifecycle);

    const requests: Observable<any>[] = [];

    for (const order of ordersToAdvance) {

      // 1) Transit / order transaction - keyed on transferOrderId.
      requests.push(
        this.logisticsService.saveDeliveryOrderTransaction(
          this.buildTransactionRequest(order, nextLifecycle, isFinal)
        )
      );

      // 2) Manifest row for THAT order only (its own manifestId +
      //    transferOrderId). No waiting for the rest of the manifest.
      requests.push(
        this.logisticsService.saveTransferManifest(
          this.buildManifestRequest(group, order, nextLifecycle)
        )
      );

    }

    forkJoin(requests).subscribe({
      next: () => {
        this.saving = false;
        this.savingOrderId = null;
        this.clearPending();
        const ids = ordersToAdvance.map(o => o.transitID).join(', ');
        alert(`Transit ${ids} marked as ${nextLifecycle.statusName}.`);
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
        alert('Failed to update one or more transits. Please try again.');
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

  // Manifest row for ONE order. Receiver / OTP come from the per-order maps
  // so a partially delivered manifest keeps correct data per transit.
  private buildManifestRequest(
    group: ManifestGroup,
    forOrder: TransferManifestResponse,
    nextLifecycle: DeliveryLifecycle
  ): TransferManifest {

    const receiver = this.receiverByOrderId.get(forOrder.transferOrderId);
    const otp = this.otpByOrderId.get(forOrder.transferOrderId);

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

  // ===== OTP flow (final step, still scoped to the ticked transits) =====

  get pendingTransitIds(): string {
    return this.pendingOrders.map(o => o.transitID).join(', ');
  }

  get pendingOrderCount(): number {
    return this.pendingOrders.length;
  }

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

    this.logisticsService
      .getReceiverUsers(order.companyId, order.destinationLocationId)
      .subscribe({
        next: (res: any[]) => {

          this.users = res
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

  // OTP is stamped on EACH selected transit's manifest row.
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

    const currentStatusCode = this.pendingOrders[0]?.lifecycleCode;
    const currentLifecycle =
      (currentStatusCode ? this.findLifecycle(currentStatusCode) : undefined)
      ?? this.pendingLifecycle;

    this.sendingOtp = true;

    // Remember receiver + OTP per order, then persist one manifest row per order
    // at its CURRENT status (status only moves on Verify & Deliver).
    const requests: Observable<any>[] = this.pendingOrders.map(order => {

      this.otpByOrderId.set(order.transferOrderId, otp);
      this.receiverByOrderId.set(order.transferOrderId, {
        id: receiver.userId,
        name: receiver.fullName
      });

      return this.logisticsService.saveTransferManifest(
        this.buildManifestRequest(this.pendingGroup, order, currentLifecycle)
      );
    });

    forkJoin(requests).subscribe({
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

    if (!this.pendingGroup || !this.pendingLifecycle || this.pendingOrders.length === 0) {
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

    const expected = (this.generatedOtp || '').trim();
    if (!expected || entered !== expected) {
      this.otpError = 'Invalid OTP. Please check with the receiver and try again.';
      return;
    }

    this.otpError = '';
    this.showOtpModal = false;

    this.updateOrders(this.pendingGroup, this.pendingOrders, this.pendingLifecycle);
  }

  cancelOtp(): void {
    this.showOtpModal = false;
    this.otpInput = '';
    this.otpError = '';
    this.otpSent = false;
    this.receiverSearch = '';
    this.pendingOrders = [];
  }

}