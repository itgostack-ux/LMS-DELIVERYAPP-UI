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

// One card PER MANIFEST (regardless of status). Orders under a manifest can
// each sit at a different lifecycle status - each order shows its own
// status + its own "Mark <NextStatus>" action. The manifest's own lifecycle
// row is only advanced once ALL orders under it share the same status.
interface ManifestGroup {

  // Representative manifestId (first order's) - kept for display/back-compat
  // only. Orders inside a group can legitimately carry DIFFERENT manifestId
  // values while sharing the same manifestNo, so never assume this is the
  // only manifest row backing the card - see updateOrders().
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

  // Manifest-level view: card starts collapsed; clicking the header
  // expands it and shows the related orders.
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

  otpSent = false;
  sendingOtp = false;

  deliveryLifecycles: DeliveryLifecycle[] = [];

  manifestGroups: ManifestGroup[] = [];

  // ===== Status tab filter ('ALL' or a lifecycle statusCode) =====
  statusFilter = 'ALL';

  loading = false;
  saving = false;

  errorMessage = '';
  receiverSearch = '';

  filteredUsers: User[] = [];


  // ===== OTP modal state (final "Delivered" step) =====
  showOtpModal = false;
  otpInput = '';
  otpError = '';

  users: User[] = [];

  selectedReceiverName = '';
  selectedReceiverEmail = '';

  // Pending Delivery Details - now always exactly ONE order being advanced.
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
      // Lifecycles first, then manifests — status ordering/colors and the
      // "next step" logic all come from the lifecycle master.
      this.loadDeliveryLifecycles(true);
    }
    else {
      this.errorMessage = 'No logged-in driver found. Please log in again.';
    }

  }

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
            }
            else {
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
      }
      else {
        this.loadAssignedManifests();
      }
    }
  }

  // The backend endpoint returns ALL manifest-order rows (no driver filter),
  // so we filter client-side to this driver's rows. ALL statuses are kept —
  // including DELIVERED — so the driver sees every manifest at manifest
  // level; each order's own action button only appears where a next step
  // exists for THAT order.
  loadAssignedManifests(): void {

    this.loading = true;
    this.errorMessage = '';

    this.logisticsService.getManifestOrders().subscribe({

      next: (rows: TransferManifestResponse[]) => {

        const mine = rows.filter(r => r.assignedUserId === this.driverId);

        this.manifestGroups = this.groupByManifest(mine);

        // If the selected tab no longer has any orders, fall back to All
        if (
          this.statusFilter !== 'ALL' &&
          !this.manifestGroups.some(g =>
            g.orders.some(o => o.lifecycleCode === this.statusFilter)
          )
        ) {
          this.statusFilter = 'ALL';
        }

        this.loading = false;

      },

      error: (err: any) => {
        console.error('Failed to load assigned manifests:', err);
        this.manifestGroups = [];
        this.loading = false;
        this.errorMessage = 'Failed to load assigned orders. Please try again.';
      }

    });

  }

  // Group by manifestNo (NOT manifestId) - a manifest is a single card no
  // matter how many different statuses its orders currently sit at, and
  // regardless of whether the backend happens to have split it across
  // multiple manifestId rows that share the same manifestNo. Newest first.
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
          // Representative id only - see interface comment above.
          manifestId: first.manifestId,
          manifestNo,
          sourceLocationName: first.sourceLocationName,
          transferModeName: first.transferModeName,
          vehicleNo: first.vehicleNo,
          assignedUserName: first.assignedUserName,

          // Carry the receiver + OTP already stored on the manifest so the
          // final save doesn't overwrite them with blanks.
          receiverUserId: first.receiverUserId ?? 0,
          receiverUserName: first.receiverUserName ?? '',
          otp: first.otp ?? '',

          orders,
          expanded: false

        };

      })
      // Actionable manifests (at least one order with a next step) first,
      // then by highest manifestId among their orders, descending.
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

  private manifestHasAnyNextStatus(group: ManifestGroup): boolean {
    return group.orders.some(o => this.hasNextStatus(o.lifecycleCode));
  }

  // ===== Status tab filter =====

  // One tab per lifecycle status that actually has orders under it, in
  // lifecycle sequence order, each with its ORDER count (not manifest count).
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

  // Manifests shown under the currently selected tab - a manifest is shown
  // if ANY of its orders are at that status.
  get visibleGroups(): ManifestGroup[] {
    if (this.statusFilter === 'ALL') {
      return this.manifestGroups;
    }
    return this.manifestGroups.filter(
      g => g.orders.some(o => o.lifecycleCode === this.statusFilter)
    );
  }

  setStatusFilter(code: string): void {
    this.statusFilter = code;
  }

  // Chips shown in the manifest header, e.g. "2 Picked Up · 1 Pickup Assigned"
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

  // One action button per CURRENT status present in the manifest (usually
  // just one, when every order is at the same step) - clicking it advances
  // every order at that status together, instead of one button per order.
  actionableStatusGroups(
    group: ManifestGroup
  ): { code: string; name: string; nextName: string; count: number }[] {

    const counts = new Map<string, number>();

    for (const o of group.orders) {
      if (this.hasNextStatus(o.lifecycleCode)) {
        counts.set(o.lifecycleCode, (counts.get(o.lifecycleCode) ?? 0) + 1);
      }
    }

    return [...counts.entries()].map(([code, count]) => ({
      code,
      name: this.findLifecycle(code)?.statusName ?? code,
      nextName: this.getNextStatusName(code),
      count
    }));

  }

  // ===== Manifest-level expand / collapse =====
  // Clicking the manifest header loads (shows) that manifest's orders.
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

  // Final step = a lifecycle with no nextStatusCode (DELIVERED)
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

  // ===== Advance ALL orders at a given status, together =====
  // One button per manifest-per-status (see actionableStatusGroups above).
  // PICKUP_ASSIGNED -> PICKED_UP updates immediately.
  // PICKED_UP -> DELIVERED (final step) opens the OTP popup first.
  // The manifest's own lifecycle row only moves forward once every order
  // under it shares this same current status (see updateOrders below).

  processStatusGroup(group: ManifestGroup, statusCode: string): void {

    const ordersAtStatus = group.orders.filter(o => o.lifecycleCode === statusCode);

    if (ordersAtStatus.length === 0) {
      return;
    }

    const nextLifecycle = this.nextLifecycleOf(statusCode);

    if (!nextLifecycle) {
      alert('Next lifecycle step not found.');
      return;
    }

    // Final Step (Delivered)
    if (this.isFinalStep(nextLifecycle)) {

      this.pendingGroup = group;
      this.pendingOrders = ordersAtStatus;
      this.pendingLifecycle = nextLifecycle;

      this.otpInput = '';
      this.otpError = '';

      this.selectedReceiverId = 0;
      this.selectedReceiverName = '';
      this.selectedReceiverEmail = '';
      this.receiverSearch = '';
      this.otpSent = false;
      this.generatedOtp = '';

      // Load users first
      this.logisticsService.getUsers().subscribe({

        next: (res) => {

          this.users = res.sort((a, b) =>
            (a.fullName || '')
              .trim()
              .toLowerCase()
              .localeCompare(
                (b.fullName || '')
                  .trim()
                  .toLowerCase()
              )
          );

          // Populate the dropdown list — it binds to filteredUsers.
          this.filteredUsers = [...this.users];

          // Open popup after users are loaded
          this.showOtpModal = true;

        },

        error: (err) => {

          console.error('Failed to load users', err);

          alert('Unable to load receiver users.');

        }

      });

      return;

    }

    // Other lifecycle updates - fires immediately for every order at this status.
    this.updateOrders(group, ordersAtStatus, nextLifecycle);

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

    // OTP set on the group by sendOtp(); generatedOtp is the fallback.
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
  // Posts one DeliveryOrderTransaction per order being advanced (normally
  // just one, since each order now has its own action button), and — only
  // when every order under the manifest currently shares the SAME status as
  // the one(s) being advanced — also updates the TransferManifest row(s) to
  // the new lifecycle so both tables stay in sync. A manifest CARD can be
  // backed by more than one manifestId row (they share a manifestNo), so we
  // update every distinct manifestId found in the group, not just one.
  // If other orders under the manifest are still sitting at an earlier
  // status, the manifest-level row(s) are left untouched.

  private updateOrders(
    group: ManifestGroup,
    ordersToAdvance: TransferManifestResponse[],
    nextLifecycle: DeliveryLifecycle
  ): void {

    this.saving = true;

    const isFinal = this.isFinalStep(nextLifecycle);

    const requests: Observable<any>[] = ordersToAdvance.map(order =>
      this.logisticsService.saveDeliveryOrderTransaction(
        this.buildTransactionRequest(order, nextLifecycle, isFinal)
      )
    );

    // Only bump the manifest's own status when ALL its orders are currently
    // at the same status as the order(s) being advanced; a partial
    // advance would otherwise push the manifest ahead of orders still
    // waiting at an earlier step.
    const currentStatusCode = ordersToAdvance[0].lifecycleCode;
    const allOrdersAtSameStatus = group.orders.every(
      o => o.lifecycleCode === currentStatusCode
    );

    if (allOrdersAtSameStatus) {

      // One saveTransferManifest call per distinct manifestId row that
      // backs this card.
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
        this.clearPending();
        alert(`${ordersToAdvance.length} order(s) marked as ${nextLifecycle.statusName}.`);
        this.loadAssignedManifests();
      },

      error: (err: any) => {
        this.saving = false;
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

  // TransferManifestResponse uses raw Date|null and a string transitID
  // (straight off the API), while DeliveryOrderTransaction expects ISO
  // date strings and a numeric transitID — convert between them here.
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

      // Lifecycle -> next step (Picked Up / Delivered)
      lifecycleId: nextLifecycle.lifecycleId,
      lifecycleSequenceNo: nextLifecycle.sequenceNo,
      lifecycleCode: nextLifecycle.statusCode,
      lifecycleName: nextLifecycle.statusName,

      transferModeId: order.transferModeId ?? 0,
      transferModeName: order.transferModeName ?? '',

      // Pickup assignment carries over unchanged
      assignedUserId: order.assignedUserId ?? 0,
      assignedUserName: order.assignedUserName ?? '',

      courierId: order.courierId ?? 0,
      courierName: order.courierName ?? '',
      awbBillNo: order.awbBillNo ?? '',

      vehicleNo: order.vehicleNo ?? '',
      otherPartyName: order.otherPartyName ?? '',

      // On final delivery, stamp the inward details with the driver + now
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

      // The manifest-order row doesn't carry original createdBy/createdDate,
      // so fall back to the driver making this update. Swap these for real
      // audit fields if your API returns them on this endpoint.
      createdBy: order.assignedUserId ?? this.driverId,
      createdByName: order.assignedUserName ?? this.driverName,
      createdDate: now,

      modifiedBy: this.driverId,
      modifiedByName: this.driverName,
      modifiedDate: now

    };

  }

  // `forOrder` pins WHICH manifestId row this save targets - a card can be
  // backed by several manifestId rows sharing one manifestNo, so the caller
  // passes the specific order whose manifestId should be updated.
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

      // Read receiver + OTP from the GROUP (set by sendOtp), not from the
      // stale order row — otherwise the final Delivered save overwrites
      // ReceiverUserId/ReceiverUserName/OTP with 0 / '' in the database.
      receiverUserId: group.receiverUserId ?? forOrder.receiverUserId ?? 0,
      receiverUserName: group.receiverUserName ?? forOrder.receiverUserName ?? '',

      otp: group.otp ?? forOrder.otp ?? '',

      lifecycleId: nextLifecycle.lifecycleId,
      lifecycleSequenceNo: nextLifecycle.sequenceNo,
      lifecycleCode: nextLifecycle.statusCode,
      lifecycleName: nextLifecycle.statusName,

      manifestDate: forOrder.manifestDate ?? new Date(),
      status: nextLifecycle.statusName

    };

  }

  loadUsers(): void {

    this.logisticsService.getUsers().subscribe({

      next: (res) => {

        this.users = res.sort((a, b) =>
          (a.fullName || '')
            .trim()
            .toLowerCase()
            .localeCompare(
              (b.fullName || '')
                .trim()
                .toLowerCase()
            )
        );

        this.filteredUsers = [...this.users];

      },

      error: (err) => {

        console.error(err);

      }

    });

  }

  receiverChanged(): void {

    const receiver = this.users.find(
      x => x.userId == this.selectedReceiverId
    );

    if (!receiver) {
      this.selectedReceiverName = '';
      this.selectedReceiverEmail = '';
      return;
    }

    this.selectedReceiverName = receiver.fullName;
    this.selectedReceiverEmail = receiver.emailId;

  }

  sendOtp(): void {

    if (this.selectedReceiverId === 0) {

      alert('Please select Receiver.');

      return;

    }

    const receiver = this.users.find(
      x => x.userId === this.selectedReceiverId
    );

    if (!receiver) {

      alert('Receiver not found.');

      return;

    }

    if (!receiver.emailId) {

      alert('Receiver email is not available.');

      return;

    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save locally
    this.generatedOtp = otp;

    // Update pending manifest (used by confirmOtp + buildManifestRequest)
    this.pendingGroup.receiverUserId = receiver.userId;
    this.pendingGroup.receiverUserName = receiver.fullName;
    this.pendingGroup.otp = otp;

    // At "send OTP" time the order is NOT delivered yet — save the
    // receiver + OTP against the CURRENT order's lifecycle (e.g. Picked
    // Up), and only move to Delivered after the OTP is verified in
    // confirmOtp().
    const currentStatusCode = this.pendingOrders[0]?.lifecycleCode;
    const currentLifecycle =
      (currentStatusCode ? this.findLifecycle(currentStatusCode) : undefined)
      ?? this.pendingLifecycle;

    this.sendingOtp = true;

    // Save OTP & Receiver against the SPECIFIC order/manifestId being
    // delivered - not group.manifestId, since a card can be backed by more
    // than one manifestId row sharing the same manifestNo.
    const pendingOrder = this.pendingOrders[0];

    this.logisticsService.saveTransferManifest({

      manifestId: pendingOrder.manifestId,

      manifestNo: this.pendingGroup.manifestNo,

      transferOrderId: pendingOrder.transferOrderId,

      assignedUserId: pendingOrder.assignedUserId,

      assignedUserName: pendingOrder.assignedUserName,

      receiverUserId: receiver.userId,

      receiverUserName: receiver.fullName,

      otp: otp,

      lifecycleId: currentLifecycle.lifecycleId,

      lifecycleSequenceNo: currentLifecycle.sequenceNo,

      lifecycleCode: currentLifecycle.statusCode,

      lifecycleName: currentLifecycle.statusName,

      manifestDate: new Date(),

      status: currentLifecycle.statusName

    }).subscribe({

      next: () => {

        const body = `
        Dear <b>${receiver.fullName}</b>,<br><br>

        Your Delivery Verification OTP is:

        <h2 style="color:#2563EB">${otp}</h2>

        <table cellpadding="5">

            <tr>

                <td><b>Manifest No</b></td>

                <td>${this.pendingGroup.manifestNo}</td>

            </tr>

            <tr>

                <td><b>Driver</b></td>

                <td>${this.driverName}</td>

            </tr>

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

          emailAddress: receiver.emailId,

          isGofix: false,

          projectName: 'Logistics Management System'

        }).subscribe({

          next: () => {

            this.sendingOtp = false;

            alert('OTP sent successfully.');

            this.otpSent = true;
            this.otpError = '';

          },

          error: () => {

            this.sendingOtp = false;

            alert('Failed to send OTP email.');

          }

        });

      },

      error: () => {

        this.sendingOtp = false;

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