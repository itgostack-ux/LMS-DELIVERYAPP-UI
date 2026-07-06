import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
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

// One status pill in the lifecycle breakdown strip
interface StatusCount {
  code: string;
  name: string;
  color: string;
  count: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
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

  // KPI tiles for the current role
  statCards: StatCard[] = [];

  // Lifecycle status breakdown (built dynamically from the lifecycle master,
  // so a new status added in the DB shows up here automatically)
  statusCounts: StatusCount[] = [];

  // Latest manifests table (driver sees only their own)
  recentManifests: TransferManifestResponse[] = [];

  private lifecycles: DeliveryLifecycle[] = [];

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

  // ===== Load role, then all dashboard data in parallel =====

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

    const isAdmin = this.roleName === 'Logistics Admin';

    forkJoin({

      lifecycles: this.logisticsService.getDeliveryLifecycles(),

      manifests: this.logisticsService.getManifestOrders(),

      companies: isAdmin
        ? this.logisticsService.getCompanies()
        : this.logisticsService.getUsers(), // placeholder stream, ignored for non-admin

      users: this.logisticsService.getUsers()

    }).subscribe({

      next: ({ lifecycles, manifests, companies, users }) => {

        this.lifecycles = (lifecycles ?? []).sort(
          (a, b) => a.sequenceNo - b.sequenceNo
        );

        // Delivery Executive only sees their own manifests
        const rows = this.roleName === 'Delivery Executive'
          ? manifests.filter(r => r.assignedUserId === this.userId)
          : manifests;

        this.buildStatusCounts(rows);
        this.buildStatCards(rows, companies?.length ?? 0, users?.length ?? 0);
        this.buildRecentManifests(rows);

        this.loading = false;

      },

      error: (err) => {
        console.error('Failed to load dashboard data:', err);
        this.loading = false;
        this.errorMessage = 'Failed to load dashboard data. Please try again.';
      }

    });

  }

  // ===== Counting helpers =====

  // Distinct manifest numbers under a given status
  private manifestCount(rows: TransferManifestResponse[], statusCode: string): number {
    const set = new Set(
      rows
        .filter(r => r.lifecycleCode === statusCode)
        .map(r => (r.manifestNo || `#${r.manifestId}`).trim())
    );
    return set.size;
  }

  // Order-level count for a status
  private orderCount(rows: TransferManifestResponse[], statusCode: string): number {
    return rows.filter(r => r.lifecycleCode === statusCode).length;
  }

  private isFinalCode(code: string): boolean {
    const lc = this.lifecycles.find(l => l.statusCode === code);
    return !!lc && !lc.nextStatusCode;
  }

  // One pill per lifecycle status, in sequence order, with live order counts
  private buildStatusCounts(rows: TransferManifestResponse[]): void {

    this.statusCounts = this.lifecycles.map(l => ({
      code: l.statusCode,
      name: l.statusName,
      color: l.colorCode || '#6B7280',
      count: this.orderCount(rows, l.statusCode)
    }));

  }

  private buildStatCards(
    rows: TransferManifestResponse[],
    companyCount: number,
    userCount: number
  ): void {

    const deliveredOrders = rows.filter(r => this.isFinalCode(r.lifecycleCode)).length;
    const pendingOrders = rows.length - deliveredOrders;

    const assignedManifests = new Set(
      rows
        .filter(r => !this.isFinalCode(r.lifecycleCode))
        .map(r => (r.manifestNo || `#${r.manifestId}`).trim())
    ).size;

    if (this.roleName === 'Logistics Admin') {

      this.statCards = [
        { label: 'Total Companies', value: companyCount, icon: 'fa-solid fa-building', color: '#2563eb', route: '/master-management' },
        { label: 'Total Users', value: userCount, icon: 'fa-solid fa-users', color: '#7c3aed', route: '/administration' },
        { label: 'Pending Orders', value: pendingOrders, icon: 'fa-solid fa-truck-fast', color: '#f59e0b', route: '/operations' },
        { label: 'Delivered', value: deliveredOrders, icon: 'fa-solid fa-circle-check', color: '#16a34a', route: '/track-orders' }
      ];

    }
    else if (this.roleName === 'Logistics Manager') {

      this.statCards = [
        { label: 'Pickup Assigned', value: this.orderCount(rows, 'PICKUP_ASSIGNED'), icon: 'fa-solid fa-user-check', color: '#2563eb', route: '/operations' },
        { label: 'Picked Up', value: this.orderCount(rows, 'PICKED_UP'), icon: 'fa-solid fa-box', color: '#f59e0b', route: '/operations' },
        { label: 'Delivered', value: deliveredOrders, icon: 'fa-solid fa-circle-check', color: '#16a34a', route: '/track-orders' },
        { label: 'Pending Orders', value: pendingOrders, icon: 'fa-solid fa-clock', color: '#dc2626', route: '/operations' }
      ];

    }
    else if (this.roleName === 'Delivery Executive') {

      this.statCards = [
        { label: 'Assigned Manifests', value: assignedManifests, icon: 'fa-solid fa-clipboard-list', color: '#2563eb', route: '/driver-console' },
        { label: 'Picked Up', value: this.orderCount(rows, 'PICKED_UP'), icon: 'fa-solid fa-box', color: '#f59e0b', route: '/driver-console' },
        { label: 'Delivered', value: deliveredOrders, icon: 'fa-solid fa-circle-check', color: '#16a34a', route: '/track-orders' },
        { label: 'Pending Orders', value: pendingOrders, icon: 'fa-solid fa-clock', color: '#dc2626', route: '/driver-console' }
      ];

    }
    else {

      // Unknown role — show a generic overview instead of a blank page
      this.statCards = [
        { label: 'Total Orders', value: rows.length, icon: 'fa-solid fa-boxes-stacked', color: '#2563eb' },
        { label: 'Pending Orders', value: pendingOrders, icon: 'fa-solid fa-clock', color: '#f59e0b' },
        { label: 'Delivered', value: deliveredOrders, icon: 'fa-solid fa-circle-check', color: '#16a34a' }
      ];

    }

  }

  // Latest 5 manifests (distinct manifest numbers, newest date first)
  private buildRecentManifests(rows: TransferManifestResponse[]): void {

    const seen = new Set<string>();
    const distinct: TransferManifestResponse[] = [];

    const sorted = [...rows].sort((a, b) => {
      const da = a.manifestDate ? new Date(a.manifestDate).getTime() : 0;
      const db = b.manifestDate ? new Date(b.manifestDate).getTime() : 0;
      return db - da;
    });

    for (const row of sorted) {
      const no = (row.manifestNo || `#${row.manifestId}`).trim();
      if (seen.has(no)) {
        continue;
      }
      seen.add(no);
      distinct.push(row);
      if (distinct.length === 5) {
        break;
      }
    }

    this.recentManifests = distinct;

  }

  getStatusColor(statusCode: string): string {
    return this.lifecycles.find(l => l.statusCode === statusCode)?.colorCode || '#6B7280';
  }

}