import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LogisticsService } from '../../services/logistics-service';
import { UserDataService } from '../../service/user-data-service';
import { TransferManifestResponse } from '../../services/models/common-master-model';

// Flat report - one row per manifest order. No manifest grouping / no details.
// Columns: Transit ID, Source Location, Destination Location, Qty,
// Assigned User Name (+ Status, so the status filter is meaningful).
// Filters: Order Status, Source Location, Destination Location, plus a
// free-text search.
@Component({
  selector: 'app-driver-report',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './driver-report.html',
  styleUrl: './driver-report.css',
})
export class DriverReport implements OnInit {

  driverId = 0;
  driverName = '';

  // All manifest-order rows (raw from API)
  rows: TransferManifestResponse[] = [];

  // ===== Filters =====
  searchText = '';
  statusFilter = 'ALL';        // lifecycleCode or 'ALL'
  sourceFilter = 'ALL';        // sourceLocationName or 'ALL'
  destinationFilter = 'ALL';   // destinationLocationName or 'ALL'

  loading = false;
  errorMessage = '';

  constructor(
    private logisticsService: LogisticsService,
    private userDataService: UserDataService,
  ) {

    const user = this.userDataService.getUser();

    if (user) {
      this.driverId = user.userId;
      this.driverName = user.userName;
    }

  }

  ngOnInit(): void {
    this.loadReport();
  }

  refresh(): void {
    this.loadReport();
  }

  loadReport(): void {

    this.loading = true;
    this.errorMessage = '';

    this.logisticsService.getManifestOrders().subscribe({

      next: (rows: TransferManifestResponse[]) => {

        // NOTE: this report shows ALL drivers' orders. To restrict it to
        // the logged-in driver only, add:
        //   .filter(r => r.assignedUserId === this.driverId)
        this.rows = [...rows];

        this.loading = false;

      },

      error: (err: any) => {
        console.error('Failed to load manifest order report:', err);
        this.rows = [];
        this.loading = false;
        this.errorMessage = 'Failed to load report. Please try again.';
      }

    });

  }

  // ===== Distinct filter option lists (built from the loaded data) =====

  // Status options - keep code (for filtering) + name (for display)
  get statusOptions(): { code: string; name: string }[] {
    const map = new Map<string, string>();
    for (const r of this.rows) {
      if (r.lifecycleCode) {
        map.set(r.lifecycleCode, r.lifecycleName ?? r.lifecycleCode);
      }
    }
    return [...map.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get sourceOptions(): string[] {
    return this.distinctValues(r => r.sourceLocationName);
  }

  get destinationOptions(): string[] {
    return this.distinctValues(r => r.destinationLocationName);
  }

  private distinctValues(
    pick: (r: TransferManifestResponse) => string | undefined | null
  ): string[] {
    const set = new Set<string>();
    for (const r of this.rows) {
      const val = (pick(r) ?? '').trim();
      if (val) {
        set.add(val);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  // ===== Combined filtering =====

  get filteredRows(): TransferManifestResponse[] {

    const search = this.searchText.trim().toLowerCase();

    return this.rows.filter(r => {

      if (this.statusFilter !== 'ALL' && r.lifecycleCode !== this.statusFilter) {
        return false;
      }

      if (
        this.sourceFilter !== 'ALL' &&
        (r.sourceLocationName ?? '') !== this.sourceFilter
      ) {
        return false;
      }

      if (
        this.destinationFilter !== 'ALL' &&
        (r.destinationLocationName ?? '') !== this.destinationFilter
      ) {
        return false;
      }

      if (search) {
        const haystack = [
          r.manifestNo,
          r.transitID,
          r.sourceLocationName,
          r.destinationLocationName,
          r.assignedUserName
        ]
          .map(v => (v ?? '').toString().toLowerCase())
          .join(' ');

        if (!haystack.includes(search)) {
          return false;
        }
      }

      return true;

    });

  }

  get totalQty(): number {
    return this.filteredRows.reduce(
      (sum, r) => sum + (r.transferQty ?? 0), 0
    );
  }

  getStatusColor(statusCode: string): string {
    const row = this.rows.find(r => r.lifecycleCode === statusCode);
    return row?.lifecycleCode || '#6B7280';
  }

  clearFilters(): void {
    this.searchText = '';
    this.statusFilter = 'ALL';
    this.sourceFilter = 'ALL';
    this.destinationFilter = 'ALL';
  }

}