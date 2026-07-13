  import { Component, OnInit } from '@angular/core';
  import { CommonModule } from '@angular/common';
  import { FormsModule } from '@angular/forms';
  import jsPDF from 'jspdf';

  import { LogisticsService } from '../../services/logistics-service';
  import { UserDataService } from '../../service/user-data-service';
  import { DeliveryOrderTimeline } from '../../services/models/common-master-model';

  interface StatCard {
    label: string;
    value: number | string;
    color: string;
    icon: string;
  }

  /** One lifecycle status shown as a column in the details matrix (ordered by sequenceNo). */
  export interface StatusColumn {
    code: string;
    name: string;
    color: string;
    seq: number;
  }

  /** A single status cell for one IMEI (who did it + when). */
  export interface StatusCell {
    state: 'done' | 'current' | 'pending';
    reached: boolean;
    orderStatus: string;          // Completed | Current | Pending
    startTime?: Date;
    endTime?: Date;
    durationMinutes?: number;
    personName: string;           // which person handled this status
  }

  /** One IMEI (= one transferOrderId) inside a transit. Qty is always 1 per IMEI. */
  export interface ImeiDetail {
    transferOrderId: number;
    itemCode: string;
    itemName: string;
    imei: string;
    qty: number;
    currentCode: string;
    currentName: string;
    currentColor: string;
    cells: { [statusCode: string]: StatusCell };
  }

  /** One status summarised at the transit (order) level: when + who. */
  export interface TransitStatusPoint {
    code: string;
    name: string;
    color: string;
    state: 'done' | 'current' | 'pending';
    reached: boolean;
    startTime?: Date;
    endTime?: Date;
    durationMinutes?: number;
    personName: string;
    doneCount: number;    // how many IMEIs have reached this status
    totalCount: number;   // total IMEIs in the transit
  }

  /** One order-level row = one transitID group. */
  export interface TransitGroup {
    transitID: string;
    transferOrderId: number;
    deliveryNoteNo: string;

    companyId: number;
    companyName: string;

    sourceLocationName: string;
    destinationLocationName: string;

    transferModeName: string;
    assignedUserName: string;

    courierName: string;
    awbBillNo: string;
    vehicleNo: string;

    lifecycleName: string;        // current (least-progressed) stage across the IMEIs
    transferStatus: string;       // In Transit | Delivered

    transferOutTime?: Date;
    transferInTime?: Date;
    transferDuration?: string;

    totalItems: number;           // number of IMEIs
    totalQty: number;             // each IMEI = 1 qty
    acceptedQty: number;          // IMEIs whose Delivered stage is reached
    pendingQty: number;           // remaining IMEIs

    timeline: TransitStatusPoint[]; // order-level status timeline (time + who)
    details: ImeiDetail[];
  }

  @Component({
    selector: 'app-track-order-level',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './track-order-level.html',
    styleUrl: './track-order-level.css',
  })
  export class TrackOrderLevel implements OnInit {

    userId = 0;
    userName = '';

    fromDate = '';
  toDate = '';

    rows: DeliveryOrderTimeline[] = [];

    // Derived
    statusColumns: StatusColumn[] = [];   // shared header for the details matrix
    groupedLogs: TransitGroup[] = [];

    // Selected transit for the popup
    selectedTransit: TransitGroup | null = null;

    // Filters
    searchText = '';
    statusFilter = 'ALL';
    companyFilter = 'ALL';
    sourceFilter = 'ALL';
    destinationFilter = 'ALL';

    loading = false;
    errorMessage = '';

    constructor(
      private logisticsService: LogisticsService,
      private userDataService: UserDataService,
    ) {
      const user = this.userDataService.getUser();
      if (user) {
        this.userId = user.userId;
        this.userName = user.userName;
      }
    }

    ngOnInit(): void {
      this.loadReport();
    }

    // ============================================================
    //  Load
    // ============================================================

    loadReport(): void {
      this.loading = true;
      this.errorMessage = '';

      this.logisticsService.getDeliveryOrderTimeline().subscribe({
        next: (data) => {
          this.rows = data ?? [];
          this.statusColumns = this.buildStatusColumns(this.rows);
          this.groupedLogs = this.buildGroupedLogs(this.rows);
          this.loading = false;
        },
        error: (err: any) => {
          console.error('Failed to load Transit Tracker:', err);
          this.rows = [];
          this.groupedLogs = [];
          this.statusColumns = [];
          this.loading = false;
          this.errorMessage = 'Failed to load report. Please try again.';
        },
      });
    }

    // ============================================================
    //  Lifecycle status columns (ordered by sequenceNo)
    // ============================================================

    private buildStatusColumns(logs: DeliveryOrderTimeline[]): StatusColumn[] {
      const map = new Map<string, StatusColumn>();
      for (const r of logs) {
        if (!r.statusCode) continue;
        const ex = map.get(r.statusCode);
        if (!ex) {
          map.set(r.statusCode, {
            code: r.statusCode,
            name: r.statusName ?? r.statusCode,
            color: r.colorCode || '#64748b',
            seq: r.sequenceNo ?? 9999,
          });
        } else {
          ex.seq = Math.min(ex.seq, r.sequenceNo ?? ex.seq);
        }
      }
      return [...map.values()].sort((a, b) => a.seq - b.seq);
    }

    // ============================================================
    //  Build transit groups -> IMEI details -> status cells
    // ============================================================

    private buildGroupedLogs(logs: DeliveryOrderTimeline[]): TransitGroup[] {

      // transit -> (imei/transferOrderId -> its status rows)
      const transitMap = new Map<string, {
        header: DeliveryOrderTimeline;
        imeiMap: Map<string, DeliveryOrderTimeline[]>;
      }>();

      for (const log of logs) {
        const tKey = String(log.transitID ?? 'NA');
        let t = transitMap.get(tKey);
        if (!t) {
          t = { header: log, imeiMap: new Map() };
          transitMap.set(tKey, t);
        }
        const iKey = String(log.transferOrderId ?? log.imei ?? 'NA');
        const arr = t.imeiMap.get(iKey);
        if (arr) arr.push(log);
        else t.imeiMap.set(iKey, [log]);
      }

      const stages = this.statusColumns;
      const groups: TransitGroup[] = [];

      for (const [tKey, t] of transitMap) {
        const h = t.header;
        const details: ImeiDetail[] = [];

        let acceptedQty = 0;
        let pendingQty = 0;

        let minStageIdx = Number.POSITIVE_INFINITY;
        let minStageName = '';

        for (const [, statuses] of t.imeiMap) {
          statuses.sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0));

          const meta = statuses[0];
          const qty = 1; // each IMEI counts as one qty

          // Genuine current status for this IMEI.
          const current = this.pickCurrentRow(statuses);
          const currentSeq = current.sequenceNo ?? 0;

          // Build a cell per status (done / current / pending).
          const cells: { [k: string]: StatusCell } = {};
          for (const s of statuses) {
            const seq = s.sequenceNo ?? 0;
            let state: 'done' | 'current' | 'pending';
            if (seq < currentSeq) state = 'done';
            else if (seq === currentSeq) state = 'current';
            else state = 'pending';

            cells[s.statusCode] = {
              state,
              reached: state !== 'pending',
              orderStatus:
                state === 'current' ? 'Current' :
                  state === 'done' ? 'Completed' : 'Pending',
              startTime:
                s.orderStatusStartTime ??
                (s.statusCode === 'OPEN' ? s.createdDate : undefined),
              endTime: s.orderStatusEndTime,
              durationMinutes: s.orderDurationMinutes ?? undefined,
              personName:
                s.orderChangedByName ||
                s.orderCreatedByName ||
                s.createdByName ||
                s.transferOutByName ||
                s.assignedByName ||
                '',
            };
          }

          // Accepted = its Delivered stage has been reached.
          const deliveredReached = statuses.some(
            s => s.statusCode === 'DELIVERED' && (cells[s.statusCode]?.reached)
          );
          if (deliveredReached) acceptedQty += qty;
          else pendingQty += qty;

          const currentIdx = stages.findIndex(x => x.code === current.statusCode);
          if (currentIdx >= 0 && currentIdx < minStageIdx) {
            minStageIdx = currentIdx;
            minStageName = current.statusName ?? current.statusCode ?? '';
          }

          details.push({
            transferOrderId: meta.transferOrderId ?? 0,
            itemCode: meta.itemCode ?? '',
            itemName: meta.itemName ?? '',
            imei: meta.imei ?? '',
            qty,
            currentCode: current.statusCode ?? '',
            currentName: current.statusName ?? current.statusCode ?? '',
            currentColor: current.colorCode || '#64748b',
            cells,
          });
        }

        // Keep IMEI rows in a stable order.
        details.sort((a, b) => a.transferOrderId - b.transferOrderId);

        const totalItems = details.length;
        const totalQty = details.reduce((s, d) => s + d.qty, 0);
        const allDelivered = totalQty > 0 && acceptedQty === totalQty;

        // Order-level timeline: for each status, when it was reached + who + how many IMEIs.
        const timeline: TransitStatusPoint[] = stages.map(stage => {
          let doneCount = 0;
          let currentCount = 0;
          let startTime: Date | undefined;
          let endTime: Date | undefined;
          let personName = '';

          for (const d of details) {
            const c = d.cells[stage.code];
            if (!c || !c.reached) continue;

            if (c.state === 'current') currentCount++;
            else doneCount++;

            if (c.startTime) {
              const ts = new Date(c.startTime).getTime();
              if (!startTime || ts < new Date(startTime).getTime()) startTime = c.startTime;
            }
            if (c.endTime) {
              const te = new Date(c.endTime).getTime();
              if (!endTime || te > new Date(endTime).getTime()) endTime = c.endTime;
            }
            if (!personName && c.personName) personName = c.personName;
          }

          const reachedCount = doneCount + currentCount;
          const state: 'done' | 'current' | 'pending' =
            reachedCount === 0 ? 'pending' : (currentCount > 0 ? 'current' : 'done');

          let durationMinutes: number | undefined;
          if (startTime && endTime) {
            const mins = Math.round(
              (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000
            );
            if (!isNaN(mins) && mins >= 0) durationMinutes = mins;
          }

          return {
            code: stage.code,
            name: stage.name,
            color: stage.color,
            state,
            reached: reachedCount > 0,
            startTime,
            endTime,
            durationMinutes,
            personName,
            doneCount: reachedCount,
            totalCount: details.length,
          };
        });

        groups.push({
          transitID: tKey,
          transferOrderId: h.transferOrderId ?? 0,
          deliveryNoteNo: h.deliveryNoteNo ?? '',

          companyId: h.companyId ?? 0,
          companyName: h.companyName ?? '',

          sourceLocationName: h.sourceLocationName ?? '',
          destinationLocationName: h.destinationLocationName ?? '',

          transferModeName: h.transferModeName ?? '',
          assignedUserName: h.assignedUserName ?? '',

          courierName: h.courierName ?? '',
          awbBillNo: h.awbBillNo ?? '',
          vehicleNo: h.vehicleNo ?? '',

          lifecycleName: minStageName || (h.statusName ?? ''),
          transferStatus: allDelivered ? 'Delivered' : 'In Transit',

          transferOutTime: h.transferOutTime,
          transferInTime: h.transferInTime,
          transferDuration: this.calcDuration(h.transferOutTime, h.transferInTime),

          totalItems,
          totalQty,
          acceptedQty,
          pendingQty,

          timeline,
          details,
        });
      }

      return groups.sort((a, b) => a.transitID.localeCompare(b.transitID));
    }

    /** A status row counts as reached if it started or is flagged completed/current. */
    private isReached(r: DeliveryOrderTimeline): boolean {
      const os = (r.orderStatus ?? '').trim().toLowerCase();
      return !!r.orderStatusStartTime || os === 'completed' || os === 'current';
    }

    /** The genuine current status for one IMEI. */
    private pickCurrentRow(hist: DeliveryOrderTimeline[]): DeliveryOrderTimeline {
      const explicit = hist.find(r => (r.orderStatus ?? '').trim().toLowerCase() === 'current');
      if (explicit) return explicit;

      const reached = hist.filter(r => this.isReached(r));
      if (reached.length) return reached[reached.length - 1];

      return hist[0] ?? hist[hist.length - 1];
    }

    private calcDuration(out?: Date, inn?: Date): string {
      if (!out || !inn) return '-';
      const ms = new Date(inn).getTime() - new Date(out).getTime();
      if (isNaN(ms) || ms < 0) return '-';
      const mins = Math.round(ms / 60000);
      if (mins < 60) return `${mins} Min`;
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h}h ${m}m`;
    }

    // ============================================================
    //  Filters
    // ============================================================

    get statusOptions(): { code: string; name: string }[] {
      return this.statusColumns.map(s => ({ code: s.code, name: s.name }));
    }

    get companyOptions(): string[] { return this.distinct(r => r.companyName); }
    get sourceOptions(): string[] { return this.distinct(r => r.sourceLocationName); }
    get destinationOptions(): string[] { return this.distinct(r => r.destinationLocationName); }

    private distinct(pick: (r: DeliveryOrderTimeline) => string | undefined | null): string[] {
      const set = new Set<string>();
      for (const r of this.rows) {
        const v = (pick(r) ?? '').trim();
        if (v) set.add(v);
      }
      return [...set].sort((a, b) => a.localeCompare(b));
    }

  clearFilters(): void {
    this.searchText = '';
    this.statusFilter = 'ALL';
    this.companyFilter = 'ALL';
    this.sourceFilter = 'ALL';
    this.destinationFilter = 'ALL';
    this.fromDate = '';
    this.toDate = '';
  }
  get hasActiveFilters(): boolean {
    return this.searchText.trim() !== '' ||
      this.statusFilter !== 'ALL' ||
      this.companyFilter !== 'ALL' ||
      this.sourceFilter !== 'ALL' ||
      this.destinationFilter !== 'ALL' ||
      this.fromDate !== '' ||
      this.toDate !== '';
  }
    /** Single source of truth for the table, stat cards and exports. */
  get filteredGroups(): TransitGroup[] {

    const search = this.searchText.trim().toLowerCase();

    return this.groupedLogs.filter(g => {

      // Company
      if (this.companyFilter !== 'ALL' && g.companyName !== this.companyFilter) {
        return false;
      }

      // Source
      if (this.sourceFilter !== 'ALL' && g.sourceLocationName !== this.sourceFilter) {
        return false;
      }

      // Destination
      if (this.destinationFilter !== 'ALL' && g.destinationLocationName !== this.destinationFilter) {
        return false;
      }

      // Transfer Out Date Filter
      if (this.fromDate || this.toDate) {

        if (!g.transferOutTime) {
          return false;
        }

        const transferDate = new Date(g.transferOutTime);

        if (this.fromDate) {
          const from = new Date(this.fromDate);
          from.setHours(0, 0, 0, 0);

          if (transferDate < from) {
            return false;
          }
        }

        if (this.toDate) {
          const to = new Date(this.toDate);
          to.setHours(23, 59, 59, 999);

          if (transferDate > to) {
            return false;
          }
        }
      }

      // Current Status
      if (this.statusFilter !== 'ALL') {

        const match = g.details.some(d => d.currentCode === this.statusFilter);

        if (!match) {
          return false;
        }
      }

      // Search
      if (search) {

        const haystack = [
          g.transitID,
          g.transferOrderId,
          g.deliveryNoteNo,
          g.companyName,
          g.sourceLocationName,
          g.destinationLocationName,
          g.assignedUserName,
          g.courierName,
          g.vehicleNo,
          g.lifecycleName,
          ...g.details.map(d => `${d.itemCode} ${d.itemName} ${d.imei}`)
        ]
        .map(v => String(v ?? '').toLowerCase())
        .join(' ');

        if (!haystack.includes(search)) {
          return false;
        }
      }

      return true;

    });

  }

    // ============================================================
    //  Stat cards
    // ============================================================

    get statCards(): StatCard[] {

      const groups = this.filteredGroups;

      const totalTransit = groups.length;

      const totalOrders = groups.reduce((sum, g) => sum + g.details.length, 0);

      let open = 0;
      let pickupReady = 0;
      let pickupAssigned = 0;
      let pickedUp = 0;
      let delivered = 0;

      groups.forEach(group => {
        group.details.forEach(item => {
          switch (item.currentCode) {
            case 'OPEN':
              open++;
              break;
            case 'PICKUP_READY':
              pickupReady++;
              break;
            case 'PICKUP_ASSIGNED':
              pickupAssigned++;
              break;
            case 'PICKED_UP':
              pickedUp++;
              break;
            case 'DELIVERED':
              delivered++;
              break;
          }
        });
      });

      return [
        {
          label: 'Total Orders',
          value: totalOrders,
          color: '#0F766E',
          icon: 'fa-solid fa-boxes-stacked'
        },
        {
          label: 'Open',
          value: open,
          color: '#6B7280',
          icon: 'fa-solid fa-folder-open'
        },
        {
          label: 'Pickup Ready',
          value: pickupReady,
          color: '#F59E0B',
          icon: 'fa-solid fa-box'
        },
        {
          label: 'Pickup Assigned',
          value: pickupAssigned,
          color: '#2563EB',
          icon: 'fa-solid fa-user-check'
        },
        {
          label: 'Picked Up',
          value: pickedUp,
          color: '#7C3AED',
          icon: 'fa-solid fa-truck-fast'
        },
        {
          label: 'Delivered',
          value: delivered,
          color: '#16A34A',
          icon: 'fa-solid fa-circle-check'
        }
      ];
    }
    get totalQty(): number {
      return this.filteredGroups.reduce((s, g) => s + g.totalQty, 0);
    }

    // ============================================================
    //  Popup
    // ============================================================

    openTransit(group: TransitGroup): void {
      this.selectedTransit = group;
    }

    closeTransit(): void {
      this.selectedTransit = null;
    }

    // ============================================================
    //  Export – Excel (one row per IMEI, one column per status person)
    // ============================================================

    exportToExcel(): void {

      const stages = this.statusColumns;

      const formatDate = (d?: Date): string => {
        if (!d) return '';

        const date = new Date(d);

        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
      };

      const formatTime = (d?: Date): string => {
        if (!d) return '';

        const date = new Date(d);

        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        const ampm = hours >= 12 ? 'PM' : 'AM';

        hours = hours % 12;
        hours = hours ? hours : 12; // 0 becomes 12

        return `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
      };

      const headers = [
        'S.No',
        'Transit ID',
        'Transfer Order',
        'Delivery Note',
        'Company',
        'Source',
        'Destination',
        'Transfer Mode',
        'Assigned User',
        'Courier',
        'Vehicle',
        'Lifecycle',
        'Status',
        'Total Items',
        'Total Qty',
        'Accepted Qty',
        'Pending Qty',
        'Transfer Out Date',
        'Transfer Out Time',
        'Transfer In Date',
        'Transfer In Time',
        'Duration',

        ...stages.flatMap(s => [
          `${s.name} User`,
          `${s.name} Start Date`,
          `${s.name} Start Time`,
          `${s.name} End Date`,
          `${s.name} End Time`
        ])
      ];

      const dataRows: any[][] = this.filteredGroups.map((g, i) => {

        const base = [
          i + 1,
          g.transitID,
          g.transferOrderId,
          g.deliveryNoteNo,
          g.companyName,
          g.sourceLocationName,
          g.destinationLocationName,
          g.transferModeName,
          g.assignedUserName,
          g.courierName,
          g.vehicleNo,
          g.lifecycleName,
          g.transferStatus,
          g.totalItems,
          g.totalQty,
          g.acceptedQty,
          g.pendingQty,
          formatDate(g.transferOutTime),
          formatTime(g.transferOutTime),
          formatDate(g.transferInTime),
          formatTime(g.transferInTime),
          g.transferDuration
        ];

        const statusCells = stages.flatMap(stage => {

          const p = g.timeline.find(x => x.code === stage.code);

          return [
            p?.personName ?? '',
            formatDate(p?.startTime),
            formatTime(p?.startTime),
            formatDate(p?.endTime),
            formatTime(p?.endTime)
          ];

        });

        return [...base, ...statusCells];

      });


      const csv = [headers, ...dataRows]
        .map(row =>
          row
            .map(value => `"${String(value ?? '').replace(/"/g, '""')}"`)
            .join(',')
        )
        .join('\n');

      const blob = new Blob(
        ['\uFEFF' + csv],
        { type: 'text/csv;charset=utf-8;' }
      );

      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `order-level-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();

      URL.revokeObjectURL(url);
    }
    // ============================================================
    //  Export – PDF (transit-level summary)
    // ============================================================

    exportToPdf(): void {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      const headers = ['#', 'Transit ID', 'Delivery Note', 'Company', 'Source', 'Destination', 'Items', 'Qty', 'Accepted', 'Pending', 'Status'];
      const colWidths = [8, 24, 40, 40, 38, 38, 16, 14, 20, 18, 24];
      const rowH = 7.5;
      const startX = 8;
      let y = 28;

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Order Level Report - Delivery Order Tracker', startX, 14);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Generated: ${new Date().toLocaleString()}   |   Transits: ${this.filteredGroups.length}   |   Total Qty: ${this.totalQty}`,
        startX, 21
      );
      doc.setTextColor(0, 0, 0);

      doc.setFillColor(37, 99, 235);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      let x = startX;
      headers.forEach((h, i) => {
        doc.rect(x, y, colWidths[i], rowH, 'F');
        doc.text(h, x + 2, y + 5);
        x += colWidths[i];
      });
      y += rowH;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);

      this.filteredGroups.forEach((g, idx) => {
        if (y > 195) { doc.addPage(); y = 15; }
        const row = [
          (idx + 1).toString(), g.transitID, g.deliveryNoteNo, g.companyName,
          g.sourceLocationName, g.destinationLocationName,
          String(g.totalItems), String(g.totalQty), String(g.acceptedQty), String(g.pendingQty),
          g.transferStatus,
        ];
        const fill = idx % 2 === 0 ? [248, 250, 252] as const : [255, 255, 255] as const;
        doc.setTextColor(30, 41, 59);
        x = startX;
        row.forEach((cell, i) => {
          doc.setFillColor(fill[0], fill[1], fill[2]);
          doc.setDrawColor(226, 232, 240);
          doc.rect(x, y, colWidths[i], rowH, 'FD');
          const clipped = doc.splitTextToSize(cell ?? '', colWidths[i] - 3)[0] ?? '';
          doc.text(clipped, x + 2, y + 4.8);
          x += colWidths[i];
        });
        y += rowH;
      });

      if (y > 190) { doc.addPage(); y = 15; }
      doc.setFillColor(241, 245, 249);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(15, 23, 42);
      x = startX;
      const totals = new Array(headers.length).fill('');
      totals[0] = 'Total';
      totals[7] = this.totalQty.toString();
      totals.forEach((cell, i) => {
        doc.rect(x, y, colWidths[i], rowH, 'F');
        doc.text(cell, x + 2, y + 5);
        x += colWidths[i];
      });

      doc.save(`order-level-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    }
  }