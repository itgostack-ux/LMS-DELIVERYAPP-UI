import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { LogisticsService } from '../../services/logistics-service';
import { UserDataService } from '../../service/user-data-service';
import {
  DeliveryLifecycle,
  TransferManifestResponse
} from '../../services/models/common-master-model';

// One KPI tile on the dashboard
interface StatCard {
  label: string;
  value: number;
  icon: string;       // font-awesome class
  color: string;      // accent color (left border + icon)
  route?: string;     // optional click-through
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {

  userId = 0;
  userName = '';
  roleName = '';

  loading = false;
  errorMessage = '';

  today = new Date();

  // KPI tiles for the current role (one card per lifecycle status)
  statCards: StatCard[] = [];

  // ===== Filters (built from the loaded rows, same for all roles) =====
  companies: { id: number; name: string }[] = [];
  locations: { id: number; name: string }[] = [];      // source locations
  locationTypes: { id: number; name: string }[] = [];

  selectedCompanyId = 0;
  selectedLocationId = 0;
  selectedLocationTypeId = 0;

  private lifecycles: DeliveryLifecycle[] = [];

  // Raw (role-scoped) rows kept so filters re-run without re-fetching
  private allRows: TransferManifestResponse[] = [];

  constructor(
    private logisticsService: LogisticsService,
    private userDataService: UserDataService,
    private router: Router,
  ) {

    const user = this.userDataService.getUser();

    if (user) {
      this.userId = user.userId;
      this.userName = user.userName;
    }

  }

  ngOnInit(): void {

    if (this.userId === 0) {
      this.errorMessage = 'No logged-in user found. Please log in again.';
      return;
    }

    this.loadDashboard();

  }

  refresh(): void {
    if (this.userId !== 0) {
      this.loadDashboard();
    }
  }

  goTo(route?: string): void {
    if (route) {
      this.router.navigate([route]);
    }
  }

  // ===== Load role, then manifests + lifecycles in parallel =====

  private loadDashboard(): void {

    this.loading = true;
    this.errorMessage = '';

    this.logisticsService.getRoleslifecycle(this.userId).subscribe({

      next: (roles) => {

        if (!roles || roles.length === 0) {
          this.loading = false;
          this.errorMessage = 'No role mapped for this user.';
          return;
        }

        this.roleName = roles[0].roleName;

        this.loadCounts();

      },

      error: (err) => {
        console.error('Failed to load user role:', err);
        this.loading = false;
        this.errorMessage = 'Failed to load user role. Please try again.';
      }

    });

  }

  private loadCounts(): void {

    forkJoin({
      manifests: this.logisticsService.getManifestOrders(),
      lifecycles: this.logisticsService.getDeliveryLifecycles()
    }).subscribe({

      next: ({ manifests, lifecycles }) => {

        this.lifecycles = (lifecycles ?? []).sort(
          (a, b) => a.sequenceNo - b.sequenceNo
        );

        // Delivery Executive only sees rows where they are the assigned user
        // (logged-in userId === row.assignedUserId).
        const scoped = this.roleName === 'Delivery Executive'
          ? (manifests ?? []).filter(r => r.assignedUserId === this.userId)
          : (manifests ?? []);

        this.allRows = scoped;

        this.buildFilterOptions(scoped);
        this.applyFilters();   // builds cards from the filtered rows

        this.loading = false;

      },

      error: (err) => {
        console.error('Failed to load dashboard data:', err);
        this.loading = false;
        this.errorMessage = 'Failed to load dashboard data. Please try again.';
      }

    });

  }

  // ===== Filters =====

  // Distinct company / location / location-type options present in the data.
  // "Location" here is the SOURCE location — swap sourceLocationId/Name for
  // destinationLocationId/Name below if you want to filter by destination.
  private buildFilterOptions(rows: TransferManifestResponse[]): void {

    const companyMap = new Map<number, string>();
    const locationMap = new Map<number, string>();
    const locTypeMap = new Map<number, string>();

    for (const r of rows) {

      if (r.companyId) {
        companyMap.set(r.companyId, r.companyName || `Company ${r.companyId}`);
      }

      if (r.sourceLocationId) {
        locationMap.set(
          r.sourceLocationId,
          r.sourceLocationName || `Location ${r.sourceLocationId}`
        );
      }

      if (r.locationTypeId) {
        locTypeMap.set(r.locationTypeId, r.locationTypeName || `Type ${r.locationTypeId}`);
      }

    }

    this.companies = [...companyMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    this.locations = [...locationMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    this.locationTypes = [...locTypeMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

  }

  // Re-runs whenever any filter dropdown changes
  applyFilters(): void {

    let rows = this.allRows;

    if (this.selectedCompanyId !== 0) {
      rows = rows.filter(r => r.companyId === this.selectedCompanyId);
    }

    if (this.selectedLocationId !== 0) {
      rows = rows.filter(r => r.sourceLocationId === this.selectedLocationId);
    }

    if (this.selectedLocationTypeId !== 0) {
      rows = rows.filter(r => r.locationTypeId === this.selectedLocationTypeId);
    }

    this.buildStatCards(rows);

  }

  // ===== Counting helpers =====

  // Order-level count for a status
  private orderCount(rows: TransferManifestResponse[], statusCode: string): number {
    return rows.filter(r => r.lifecycleCode === statusCode).length;
  }

  // One KPI card per lifecycle status, in sequence order, using each status's
  // own color from the master — a new status added in the DB appears
  // automatically. Same set of cards for every role.
  private buildStatCards(rows: TransferManifestResponse[]): void {

    const icons: Record<string, string> = {
      OPEN: 'fa-solid fa-folder-open',
      PICKUP_READY: 'fa-solid fa-box-open',
      PICKUP_ASSIGNED: 'fa-solid fa-user-check',
      PICKED_UP: 'fa-solid fa-box',
      DELIVERED: 'fa-solid fa-circle-check'
    };

    const route = this.roleName === 'Delivery Executive'
      ? '/driver-console'
      : (this.roleName === 'Logistics Manager' || this.roleName === 'Logistics Admin')
        ? '/operations'
        : undefined;

    this.statCards = this.lifecycles.map(l => ({
      label: l.statusName,
      value: this.orderCount(rows, l.statusCode),
      icon: icons[l.statusCode] || 'fa-solid fa-circle-dot',
      color: l.colorCode || '#2563eb',
      route
    }));

  }

  getStatusColor(statusCode: string): string {
    return this.lifecycles.find(l => l.statusCode === statusCode)?.colorCode || '#6B7280';
  }

}