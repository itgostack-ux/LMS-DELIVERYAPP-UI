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

// One card per manifest + current status, holding all the orders under it.
// (Same manifest can appear twice if its orders are at different statuses.)
interface ManifestGroup {

  manifestId: number;

  manifestNo: string;

  sourceLocationName: string;

  transferModeName: string;

  vehicleNo: string;

  assignedUserName: string;

  lifecycleCode: string;

  lifecycleName: string;

  receiverUserId?: number;

  receiverUserName?: string;

  otp?: string;

  orders: TransferManifestResponse[];

  selectAll: boolean;

  // Manifest-level view: card starts collapsed; clicking the header
  // expands it and shows the related orders.
  expanded: boolean;

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

  // Pending Delivery Details
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
  // level; the action button only appears where a next step exists.
  loadAssignedManifests(): void {

    this.loading = true;
    this.errorMessage = '';

    this.logisticsService.getManifestOrders().subscribe({

      next: (rows: TransferManifestResponse[]) => {

        const mine = rows
          .filter(r => r.assignedUserId === this.driverId)
          .map(r => ({ ...r, selected: false }));

        this.manifestGroups = this.groupByManifest(mine);

        // If the selected tab no longer has any manifests, fall back to All
        if (
          this.statusFilter !== 'ALL' &&
          !this.manifestGroups.some(g => g.lifecycleCode === this.statusFilter)
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

  // Group by manifest + current status so a manifest whose orders sit at
  // two different steps renders as two independent cards. Newest first.
  private groupByManifest(rows: TransferManifestResponse[]): ManifestGroup[] {

    const map = new Map<string, TransferManifestResponse[]>();

    for (const row of rows) {
      const key = `${row.manifestId}_${row.lifecycleCode}`;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }

    return [...map.entries()]
      .map(([key, orders]) => {

        const first = orders[0];

        return {
          key,
          manifestId: first.manifestId,
          manifestNo: first.manifestNo || `#${first.manifestId}`,
          sourceLocationName: first.sourceLocationName,
          transferModeName: first.transferModeName,
          vehicleNo: first.vehicleNo,
          assignedUserName: first.assignedUserName,
          lifecycleCode: first.lifecycleCode,
          lifecycleName: first.lifecycleName,

          // Carry the receiver + OTP already stored on the manifest so the
          // final save doesn't overwrite them with blanks.
          receiverUserId: first.receiverUserId ?? 0,
          receiverUserName: first.receiverUserName ?? '',
          otp: first.otp ?? '',

          orders,
          selectAll: false,
          expanded: false

        };

      })
      // Actionable manifests first, then by manifestId descending
      .sort((a, b) => {
        const aAct = this.hasNextStatus(a.lifecycleCode) ? 0 : 1;
        const bAct = this.hasNextStatus(b.lifecycleCode) ? 0 : 1;
        if (aAct !== bAct) {
          return aAct - bAct;
        }
        return b.manifestId - a.manifestId;
      });

  }

  // ===== Status tab filter =====

  // One tab per lifecycle status that actually has manifests, in
  // lifecycle sequence order, each with its manifest count.
  get statusTabs(): { code: string; name: string; count: number }[] {

    const counts = new Map<string, number>();

    for (const g of this.manifestGroups) {
      counts.set(g.lifecycleCode, (counts.get(g.lifecycleCode) ?? 0) + 1);
    }

    return this.deliveryLifecycles
      .filter(l => counts.has(l.statusCode))
      .map(l => ({
        code: l.statusCode,
        name: l.statusName,
        count: counts.get(l.statusCode) ?? 0
      }));

  }

  // Manifests shown under the currently selected tab
  get visibleGroups(): ManifestGroup[] {
    if (this.statusFilter === 'ALL') {
      return this.manifestGroups;
    }
    return this.manifestGroups.filter(
      g => g.lifecycleCode === this.statusFilter
    );
  }

  setStatusFilter(code: string): void {
    this.statusFilter = code;
  }

  // ===== Manifest-level expand / collapse =====
  // Clicking the manifest header loads (shows) that manifest's orders.
  toggleGroup(group: ManifestGroup): void {
    group.expanded = !group.expanded;
  }

  toggleSelectAll(group: ManifestGroup): void {
    group.orders.forEach(o => o.selected = group.selectAll);
  }

  selectedOrdersIn(group: ManifestGroup): TransferManifestResponse[] {
    return group.orders.filter(o => !!o.selected);
  }

  hasSelection(group: ManifestGroup): boolean {
    return this.selectedOrdersIn(group).length > 0;
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

  // ===== Advance to next status =====
  // PICKUP_ASSIGNED -> PICKED_UP updates immediately.
  // PICKED_UP -> DELIVERED (final step) opens the OTP popup first.

  processManifest(group: ManifestGroup): void {

    const selected = this.selectedOrdersIn(group);

    if (selected.length === 0) {
      alert('Please select at least one order to update.');
      return;
    }

    const nextLifecycle = this.nextLifecycleOf(group.lifecycleCode);

    if (!nextLifecycle) {
      alert('Next lifecycle step not found.');
      return;
    }

    // Final Step (Delivered)
    if (this.isFinalStep(nextLifecycle)) {

      this.pendingGroup = group;
      this.pendingOrders = selected;
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

    // Other lifecycle updates
    this.updateOrders(group, selected, nextLifecycle);

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
  // Posts one DeliveryOrderTransaction per selected order, and — when the
  // whole manifest is being moved — also updates the TransferManifest row
  // to the new lifecycle so both tables stay in sync.

  private updateOrders(
    group: ManifestGroup,
    selected: TransferManifestResponse[],
    nextLifecycle: DeliveryLifecycle
  ): void {

    this.saving = true;

    const isFinal = this.isFinalStep(nextLifecycle);

    const requests: Observable<any>[] = selected.map(order =>
      this.logisticsService.saveDeliveryOrderTransaction(
        this.buildTransactionRequest(order, nextLifecycle, isFinal)
      )
    );

    // Only bump the manifest's own status when ALL its orders move together;
    // a partial selection would otherwise push the manifest ahead of the
    // orders still waiting.
    if (selected.length === group.orders.length) {
      requests.push(
        this.logisticsService.saveTransferManifest(
          this.buildManifestRequest(group, nextLifecycle)
        )
      );
    }

    forkJoin(requests).subscribe({

      next: () => {
        this.saving = false;
        this.clearPending();
        alert(`${selected.length} order(s) marked as ${nextLifecycle.statusName}.`);
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

  private buildManifestRequest(
    group: ManifestGroup,
    nextLifecycle: DeliveryLifecycle
  ): TransferManifest {

    const first = group.orders[0];

    return {

      manifestId: group.manifestId,
      manifestNo: group.manifestNo,
      transferOrderId: first.transferOrderId,

      assignedUserId: first.assignedUserId ?? this.driverId,
      assignedUserName: first.assignedUserName ?? this.driverName,

      // Read receiver + OTP from the GROUP (set by sendOtp), not from the
      // stale order row — otherwise the final Delivered save overwrites
      // ReceiverUserId/ReceiverUserName/OTP with 0 / '' in the database.
      receiverUserId: group.receiverUserId ?? first.receiverUserId ?? 0,
      receiverUserName: group.receiverUserName ?? first.receiverUserName ?? '',

      otp: group.otp ?? first.otp ?? '',

      lifecycleId: nextLifecycle.lifecycleId,
      lifecycleSequenceNo: nextLifecycle.sequenceNo,
      lifecycleCode: nextLifecycle.statusCode,
      lifecycleName: nextLifecycle.statusName,

      manifestDate: first.manifestDate ?? new Date(),
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

    // At "send OTP" time the manifest is NOT delivered yet — save the
    // receiver + OTP against the CURRENT lifecycle (e.g. Picked Up), and
    // only move to Delivered after the OTP is verified in confirmOtp().
    const currentLifecycle =
      this.findLifecycle(this.pendingGroup.lifecycleCode) ?? this.pendingLifecycle;

    this.sendingOtp = true;

    // Save OTP & Receiver in backend
    this.logisticsService.saveTransferManifest({

      manifestId: this.pendingGroup.manifestId,

      manifestNo: this.pendingGroup.manifestNo,

      transferOrderId: this.pendingGroup.orders[0].transferOrderId,

      assignedUserId: this.pendingGroup.orders[0].assignedUserId,

      assignedUserName: this.pendingGroup.orders[0].assignedUserName,

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