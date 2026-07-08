import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import jsPDF from 'jspdf';

import { LogisticsService } from '../../services/logistics-service';
import { UserDataService } from '../../service/user-data-service';
import { DeliveryLifecycle, TransferManifestResponse } from '../../services/models/common-master-model';

interface StatCard {
  label: string;
  value: number | string;
  color: string;
  icon: string;
}

// Flat report - one row per manifest order. No manifest grouping / no details.
// Columns: Transit ID, Source Location, Destination Location, Qty, Status,
// Assigned User Name.
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

  // Lifecycle master (for color codes)
  private lifecycles: DeliveryLifecycle[] = [];

  // Summary stat cards
  statCards: StatCard[] = [];

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

    forkJoin({
      manifests: this.logisticsService.getManifestOrders(),
      lifecycles: this.logisticsService.getDeliveryLifecycles()
    }).subscribe({

      next: ({ manifests, lifecycles }) => {

        this.lifecycles = (lifecycles ?? []).sort((a, b) => a.sequenceNo - b.sequenceNo);
        this.rows = [...manifests];
        this.buildStatCards();
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

  private isFinalCode(code: string): boolean {
    const lc = this.lifecycles.find(l => l.statusCode === code);
    return !!lc && !lc.nextStatusCode;
  }

  private buildStatCards(): void {
    const total = this.rows.length;
    const delivered = this.rows.filter(r => this.isFinalCode(r.lifecycleCode)).length;
    const pending = total - delivered;
    const totalQtyAll = this.rows.reduce((s, r) => s + (r.transferQty ?? 0), 0);
    const distinctManifests = new Set(this.rows.map(r => r.manifestNo || `#${r.manifestId}`)).size;

    this.statCards = [
      { label: 'Total Orders',      value: total,             color: '#2563eb', icon: 'fa-solid fa-boxes-stacked' },
      { label: 'Manifests',         value: distinctManifests, color: '#7c3aed', icon: 'fa-solid fa-clipboard-list' },
      { label: 'Pending',           value: pending,           color: '#f59e0b', icon: 'fa-solid fa-clock' },
      { label: 'Delivered',         value: delivered,         color: '#16a34a', icon: 'fa-solid fa-circle-check' },
      { label: 'Total Qty',         value: totalQtyAll,       color: '#0891b2', icon: 'fa-solid fa-cubes' },
    ];
  }

  getStatusColor(statusCode: string): string {
    const lc = this.lifecycles.find(l => l.statusCode === statusCode);
    return lc?.colorCode || '#6B7280';
  }

  clearFilters(): void {
    this.searchText = '';
    this.statusFilter = 'ALL';
    this.sourceFilter = 'ALL';
    this.destinationFilter = 'ALL';
  }

  // ===== Export =====

  exportToExcel(): void {

    const headers = [
      'S.No', 'Manifest No', 'Transit ID', 'Source Location',
      'Destination Location', 'Assigned User', 'Status', 'Qty'
    ];

    const dataRows = this.filteredRows.map((r, i) => [
      i + 1,
      r.manifestNo ?? '',
      r.transitID ?? '',
      r.sourceLocationName ?? '',
      r.destinationLocationName ?? '',
      r.assignedUserName ?? '',
      r.lifecycleName ?? r.lifecycleCode ?? '',
      r.transferQty ?? 0
    ]);

    const totalRow = ['', '', '', '', '', '', 'Total', this.totalQty];

    const csv = [headers, ...dataRows, totalRow]
      .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `driver-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

  }

  exportToPdf(): void {

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const headers = ['#', 'Manifest No', 'Transit ID', 'Source Location', 'Destination Location', 'Assigned User', 'Status', 'Qty'];
    const colWidths = [10, 38, 22, 42, 42, 38, 32, 14];
    const rowH = 8;
    const startX = 8;
    let y = 28;

    // Title
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Driver Report', startX, 14);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Generated: ${new Date().toLocaleString()}   |   Records: ${this.filteredRows.length}   |   Total Qty: ${this.totalQty}`,
      startX, 21
    );
    doc.setTextColor(0, 0, 0);

    // Header row
    doc.setFillColor(37, 99, 235);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    let x = startX;
    headers.forEach((h, i) => {
      doc.rect(x, y, colWidths[i], rowH, 'F');
      doc.text(h, x + 2, y + 5.2);
      x += colWidths[i];
    });
    y += rowH;

    // Data rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);

    this.filteredRows.forEach((r, idx) => {

      if (y > 195) {
        doc.addPage();
        y = 15;
      }

      const row = [
        (idx + 1).toString(),
        r.manifestNo ?? '',
        (r.transitID ?? '').toString(),
        r.sourceLocationName ?? '',
        r.destinationLocationName ?? '',
        r.assignedUserName ?? '',
        r.lifecycleName ?? r.lifecycleCode ?? '',
        (r.transferQty ?? 0).toString()
      ];

      const fill = idx % 2 === 0 ? [248, 250, 252] as const : [255, 255, 255] as const;
      doc.setTextColor(30, 41, 59);
      x = startX;

      row.forEach((cell, i) => {
        doc.setFillColor(fill[0], fill[1], fill[2]);
        doc.setDrawColor(226, 232, 240);
        doc.rect(x, y, colWidths[i], rowH, 'FD');
        const clipped = doc.splitTextToSize(cell, colWidths[i] - 3)[0];
        doc.text(clipped, x + 2, y + 5.2);
        x += colWidths[i];
      });

      y += rowH;

    });

    // Total footer row
    if (y > 195) { doc.addPage(); y = 15; }
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(238, 242, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setTextColor(30, 27, 138);
    x = startX;
    const totalCells = ['', '', '', '', '', '', 'Total', this.totalQty.toString()];
    totalCells.forEach((cell, i) => {
      doc.rect(x, y, colWidths[i], rowH, 'FD');
      doc.text(cell, x + 2, y + 5.2);
      x += colWidths[i];
    });

    doc.save(`driver-report-${new Date().toISOString().slice(0, 10)}.pdf`);

  }

}