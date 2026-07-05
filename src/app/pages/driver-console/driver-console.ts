import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { LogisticsService } from '../../services/logistics-service';
import { UserDataService } from '../../service/user-data-service';
import {
  DeliveryLifecycle,
  DeliveryOrderTransaction,
  TransferManifestResponse
} from '../../services/models/common-master-model';

// One card per manifest, holding all the orders under it.
interface ManifestGroup {
  manifestId: number;
  manifestNo: string;
  sourceLocationName: string;
  transferModeName: string;
  vehicleNo: string;
  assignedUserName: string;
  orders: TransferManifestResponse[];
  selectAll: boolean;
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
  // Pulled from UserDataService, same as Header does — no manual
  // driver picker anymore.
  driverId = 0;
  driverName = '';

  deliveryLifecycles: DeliveryLifecycle[] = [];

  manifestGroups: ManifestGroup[] = [];

  loading = false;
  saving = false;

  errorMessage = '';

  constructor(
    private logisticsService: LogisticsService,
    private userDataService: UserDataService
  ) {

    const user = this.userDataService.getUser();

    if (user) {
      this.driverId = user.userId;
      this.driverName = user.userName;
    }

  }

  ngOnInit(): void {

    this.loadDeliveryLifecycles();

    if (this.driverId !== 0) {
      this.loadAssignedManifests();
    }
    else {
      this.errorMessage = 'No logged-in driver found. Please log in again.';
    }

  }

  
private loadDeliveryLifecycles(): void {

  const userId = this.userDataService.getUserId();

  if (userId === 0) {

    console.error('Invalid User Id');

    return;

  }

  this.logisticsService.getRoleslifecycle(userId).subscribe({

    next: (roles) => {

      if (!roles || roles.length === 0) {

        console.error('No role mapped for this user.');

        return;

      }

      const roleId = roles[0].roleID;

      console.log('User Id :', userId);
      console.log('Role Id :', roleId);
      console.log('Role Name :', roles[0].roleName);

      this.logisticsService.getRoleBasedLifecycles(roleId).subscribe({

        next: (lifecycles) => {

          this.deliveryLifecycles = lifecycles.sort(
            (a, b) => a.sequenceNo - b.sequenceNo
          );

          console.log('Role Based Lifecycles :', this.deliveryLifecycles);

        },

        error: (err: any) => {

          console.error('Failed to load role-based lifecycles:', err);

        }

      });

    },

    error: (err: any) => {

      console.error('Failed to load user roles:', err);

    }

  });

}

  refresh(): void {
    if (this.driverId !== 0) {
      this.loadAssignedManifests();
    }
  }

  // The backend endpoint returns ALL manifest-order rows (no driver filter),
  // so we filter to this driver's pending pickups client-side using the
  // logged-in userId.
  loadAssignedManifests(): void {

    this.loading = true;
    this.errorMessage = '';

    this.logisticsService.getManifestOrders().subscribe({

      next: (rows: TransferManifestResponse[]) => {

        const pending = rows
          .filter(r =>
            r.assignedUserId === this.driverId &&
            r.lifecycleCode === 'PICKUP_ASSIGNED'
          )
          .map(r => ({ ...r, selected: false }));

        this.manifestGroups = this.groupByManifest(pending);
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

  private groupByManifest(rows: TransferManifestResponse[]): ManifestGroup[] {

    const map = new Map<number, TransferManifestResponse[]>();

    for (const row of rows) {
      const list = map.get(row.manifestId) ?? [];
      list.push(row);
      map.set(row.manifestId, list);
    }

    return [...map.entries()].map(([manifestId, orders]) => {

      const first = orders[0];

      return {
        manifestId,
        manifestNo: first.manifestNo || `#${manifestId}`,
        sourceLocationName: first.sourceLocationName,
        transferModeName: first.transferModeName,
        vehicleNo: first.vehicleNo,
        assignedUserName: first.assignedUserName,
        orders,
        selectAll: false
      };

    });

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

  // ===== Mark Picked Up =====

  markPickedUp(group: ManifestGroup): void {

    const selected = this.selectedOrdersIn(group);

    if (selected.length === 0) {
      alert('Please select at least one order to mark as Picked Up.');
      return;
    }

    const current = this.deliveryLifecycles.find(
      x => x.statusCode === 'PICKUP_ASSIGNED'
    );

    const nextLifecycle = this.deliveryLifecycles.find(
      x => x.statusCode === current?.nextStatusCode
    );

    if (!nextLifecycle) {
      alert('Picked Up lifecycle step not found.');
      return;
    }

    this.saving = true;

    const requests = selected.map(order =>
      this.logisticsService.saveDeliveryOrderTransaction(
        this.buildPickedUpRequest(order, nextLifecycle)
      )
    );

    forkJoin(requests).subscribe({

      next: () => {
        this.saving = false;
        alert(`${selected.length} order(s) marked as ${nextLifecycle.statusName}.`);
        this.loadAssignedManifests();
      },

      error: (err: any) => {
        this.saving = false;
        console.error('Failed to mark picked up:', err);

        if (err?.error?.errors) {
          console.error('Validation errors:', err.error.errors);
        }

        alert('Failed to update one or more orders. Please try again.');
        this.loadAssignedManifests();
      }

    });

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

  private buildPickedUpRequest(
    order: TransferManifestResponse,
    nextLifecycle: DeliveryLifecycle
  ): DeliveryOrderTransaction {

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

      // Lifecycle -> Picked Up
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

      transferInTime: this.toIsoString(order.transferInTime) || undefined,

      inwardDoneById: order.inwardDoneById ?? 0,
      inwardDoneByName: order.inwardDoneByName ?? '',

      transferDuration: order.transferDuration ?? '',

      remarks: order.remarks ?? '',

      isActive: true,

      // The manifest-order row doesn't carry original createdBy/createdDate,
      // so fall back to the driver making this update. Swap these for real
      // audit fields if your API returns them on this endpoint.
      createdBy: order.assignedUserId ?? this.driverId,
      createdByName: order.assignedUserName ?? this.driverName,
      createdDate: new Date().toISOString(),

      modifiedBy: this.driverId,
      modifiedByName: this.driverName,
      modifiedDate: new Date().toISOString()

    };

  }

  getNextStatusName(currentStatusCode: string): string {

  const current = this.deliveryLifecycles.find(
    x => x.statusCode === currentStatusCode
  );

  if (!current?.nextStatusCode) {
    return 'No Next Status';
  }

  const next = this.deliveryLifecycles.find(
    x => x.statusCode === current.nextStatusCode
  );

  return next?.statusName ?? 'No Next Status';

}

hasNextStatus(currentStatusCode: string): boolean {

  const current = this.deliveryLifecycles.find(
    x => x.statusCode === currentStatusCode
  );

  return !!current?.nextStatusCode;

}

processManifest(group: ManifestGroup): void {
    // Move your current markPickedUp() code here
}

}