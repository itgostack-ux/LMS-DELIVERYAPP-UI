import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';

import { LogisticsService } from '../../services/logistics-service';
import { UserDataService } from '../../service/user-data-service';
import { DeliveryLifecycle, DeliveryOrderTimeline } from '../../services/models/common-master-model';

interface StatCard {
  label: string;
  value: number | string;
  color: string;
  icon: string;
}

/** One ordered step in the delivery lifecycle (derived from data or lifecycle master). */
interface LifecycleStage {
  code: string;
  name: string;
  color: string;
  order: number;
}

/** One logical order rolled-up from its many timeline rows. */
interface OrderCard {
  key: string;
  orderId: any;
  transitID: any;
  companyName: string;
  itemName: string;
  itemCode: string;
  qty: number;
  source: string;
  destination: string;
  assignedUser: string;
  manifestNo: string;
  currentCode: string;
  currentName: string;
  color: string;
  currentStart?: Date;
  currentEnd?: Date;
  totalDuration: number;
  stageIndex: number;
  history: DeliveryOrderTimeline[];
}

interface StageCellData {
  code: string;
  name: string;
  color: string;
  time: Date | null;
  status: 'completed' | 'current' | 'pending';
}

interface ManifestGroup {
  manifestNo: string;

  manifestDate: Date | null;

  manifestStatus: string;

  companyName: string;

  assignedUser: string;
  receiverUser: string;

  sources: string;
  destinations: string;

  transferModeName: string;

  orders: OrderCard[];

  totalQty: number;
  delivered: number;
  progress: number;

  stageData: StageCellData[];
}

@Component({
  selector: 'app-track-manifest-level',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './track-manifest-level.html',
  styleUrl: './track-manifest-level.css',
})
export class TrackManifestLevel implements OnInit {

  userId = 0;
  userName = '';

  rows: DeliveryOrderTimeline[] = [];
  lifecycles: DeliveryLifecycle[] = [];

  // Derived (computed once per load)
  lifecycleStages: LifecycleStage[] = [];
  orderCards: OrderCard[] = [];
  statCards: StatCard[] = [];

  // Filters
  searchText = '';
  manifestStatusFilter = 'ALL';
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

  refresh(): void {
    this.loadReport();
  }

  loadReport(): void {
    this.loading = true;
    this.errorMessage = '';

    this.logisticsService.getDeliveryOrderTimeline().subscribe({
      next: (data) => {
        this.rows = data ?? [];
        this.lifecycleStages = this.buildLifecycleOrder();
        this.orderCards = this.buildOrderCards();
        this.buildStatCards();
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Failed to load manifest-level tracker:', err);
        this.rows = [];
        this.orderCards = [];
        this.lifecycleStages = [];
        this.loading = false;
        this.errorMessage = 'Failed to load report. Please try again.';
      }
    });
  }

  // ============================================================
  //  Lifecycle order derivation
  // ============================================================

  private colorForStatus(code: string): string {
    const r = this.rows.find(x => x.statusCode === code && x.colorCode);
    if (r?.colorCode) return r.colorCode;
    const palette = ['#2563eb', '#7c3aed', '#f59e0b', '#0891b2', '#db2777', '#16a34a', '#dc2626', '#4f46e5'];
    let h = 0;
    for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }

  private buildLifecycleOrder(): LifecycleStage[] {
    // 1) If a lifecycle master is provided, walk the statusCode -> nextStatusCode chain.
    if (this.lifecycles?.length) {
      const byCode = new Map(this.lifecycles.map(l => [l.statusCode, l]));
      const nextCodes = new Set(
        this.lifecycles.map(l => l.nextStatusCode).filter(Boolean) as string[]
      );
      const head = this.lifecycles.find(l => !nextCodes.has(l.statusCode)) ?? this.lifecycles[0];

      const ordered: DeliveryLifecycle[] = [];
      const seen = new Set<string>();
      let cur: DeliveryLifecycle | undefined = head;
      while (cur && !seen.has(cur.statusCode)) {
        seen.add(cur.statusCode);
        ordered.push(cur);
        cur = cur.nextStatusCode ? byCode.get(cur.nextStatusCode) : undefined;
      }
      for (const l of this.lifecycles) if (!seen.has(l.statusCode)) ordered.push(l);

      return ordered.map((l, i) => ({
        code: l.statusCode,
        name: (l as any).statusName ?? l.statusCode,
        color: this.colorForStatus(l.statusCode),
        order: i,
      }));
    }

    // 2) Otherwise derive the order from the timeline using the smallest sequenceNo per status.
    const info = new Map<string, { name: string; color: string; minSeq: number }>();
    for (const r of this.rows) {
      if (!r.statusCode) continue;
      const seq = r.sequenceNo ?? 9999;
      const ex = info.get(r.statusCode);
      if (!ex) {
        info.set(r.statusCode, {
          name: r.statusName ?? r.statusCode,
          color: r.colorCode || '#64748b',
          minSeq: seq,
        });
      } else {
        ex.minSeq = Math.min(ex.minSeq, seq);
      }
    }
    return [...info.entries()]
      .sort((a, b) => a[1].minSeq - b[1].minSeq)
      .map(([code, v], i) => ({ code, name: v.name, color: v.color, order: i }));
  }

  private stageIndexOf(code: string): number {
    const s = this.lifecycleStages.find(x => x.code === code);
    return s ? s.order : -1;
  }

  // ============================================================
  //  Roll up timeline rows -> one card per order
  // ============================================================

  private buildOrderCards(): OrderCard[] {
    const groups = new Map<string, DeliveryOrderTimeline[]>();
    for (const r of this.rows) {
      const key = String(r.transferOrderId ?? r.transitID ?? r.deliveryNoteNo ?? Math.random());
      const arr = groups.get(key);
      if (arr) arr.push(r);
      else groups.set(key, [r]);
    }

    const cards: OrderCard[] = [];
    for (const [key, hist] of groups) {
      hist.sort((a, b) => {
        const sa = a.sequenceNo ?? 0;
        const sb = b.sequenceNo ?? 0;
        if (sa !== sb) return sa - sb;
        const ta = a.orderStatusStartTime ? new Date(a.orderStatusStartTime).getTime() : 0;
        const tb = b.orderStatusStartTime ? new Date(b.orderStatusStartTime).getTime() : 0;
        return ta - tb;
      });

      // The timeline is the FULL lifecycle pre-seeded: every status is a row and
      // only reached statuses carry timestamps. The current status is therefore the
      // row explicitly flagged 'Current', else the furthest status that has actually
      // started (has a start time) — NOT simply the highest sequence (which is the
      // final "Delivered" placeholder).
      const meta = hist[0];
      const current = this.pickCurrentRow(hist);
      const totalDuration = hist.reduce((s, r) => s + (r.orderDurationMinutes ?? 0), 0);

      cards.push({
        key,
        orderId: meta.transferOrderId,
        transitID: meta.transitID,
        companyName: meta.companyName ?? '',
        itemName: meta.itemName ?? meta.itemCode ?? '',
        itemCode: meta.itemCode ?? '',
        qty: meta.transferQty ?? 0,
        source: meta.sourceLocationName ?? '',
        destination: meta.destinationLocationName ?? '',
        assignedUser: meta.assignedUserName ?? '',
        manifestNo: meta.manifestNo ?? '',
        currentCode: current.statusCode ?? '',
        currentName: current.statusName ?? current.statusCode ?? '',
        color: current.colorCode || this.colorForStatus(current.statusCode ?? ''),
        currentStart: current.orderStatusStartTime,
        currentEnd: current.orderStatusEndTime,
        totalDuration,
        stageIndex: this.stageIndexOf(current.statusCode ?? ''),
        history: hist,
      });
    }

    return cards.sort((a, b) => b.stageIndex - a.stageIndex);
  }

  /** A status row counts as "reached" if it has actually started or is marked done/current. */
  private isReached(r: DeliveryOrderTimeline): boolean {
    const os = (r.orderStatus ?? '').trim().toLowerCase();
    return !!r.orderStatusStartTime || os === 'completed' || os === 'current';
  }

  /** Determine the genuine current status for an order (state/time based). */
  private pickCurrentRow(hist: DeliveryOrderTimeline[]): DeliveryOrderTimeline {
    // 1) Row explicitly flagged as the current one.
    const explicit = hist.find(r => (r.orderStatus ?? '').trim().toLowerCase() === 'current');
    if (explicit) return explicit;

    // 2) Otherwise the furthest status that has actually been reached (highest sequence).
    const reached = hist.filter(r => this.isReached(r));
    if (reached.length) return reached[reached.length - 1];

    // 3) Nothing reached yet -> the very first stage.
    return hist[0] ?? hist[hist.length - 1];
  }

  // ============================================================
  //  Filters
  // ============================================================

  get manifestStatusOptions(): string[] {
    const set = new Set<string>();
    for (const r of this.rows) {
      const v = (r.manifestStatus ?? '').trim();
      if (v) set.add(v);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
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
    this.manifestStatusFilter = 'ALL';
    this.companyFilter = 'ALL';
    this.sourceFilter = 'ALL';
    this.destinationFilter = 'ALL';
  }

  get hasActiveFilters(): boolean {
    return this.searchText.trim() !== '' ||
      this.manifestStatusFilter !== 'ALL' ||
      this.companyFilter !== 'ALL' ||
      this.sourceFilter !== 'ALL' ||
      this.destinationFilter !== 'ALL';
  }

  /** Order cards after company/source/destination/search filters (manifest status is applied at group level). */
  private get filteredOrderCards(): OrderCard[] {
    const search = this.searchText.trim().toLowerCase();
    return this.orderCards.filter(c => {
      if (this.companyFilter !== 'ALL' && c.companyName !== this.companyFilter) return false;
      if (this.sourceFilter !== 'ALL' && c.source !== this.sourceFilter) return false;
      if (this.destinationFilter !== 'ALL' && c.destination !== this.destinationFilter) return false;
      if (search) {
        const hay = [
          c.companyName, String(c.transitID), c.itemName, c.itemCode,
          c.assignedUser, c.manifestNo, c.currentName, c.source, c.destination
        ].map(v => (v ?? '').toLowerCase()).join(' ');
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }

  // ============================================================
  //  Manifest grouping (the heart of this report)
  // ============================================================
  get manifestGroups(): ManifestGroup[] {

    const map = new Map<string, ManifestGroup>();
    const lastIndex = this.lifecycleStages.length - 1;

    for (const c of this.filteredOrderCards) {

      const key = c.manifestNo || 'Unassigned';

      let g = map.get(key);

      if (!g) {

        const mRow = this.rows.find(r => (r.manifestNo || 'Unassigned') === key);

        g = {
          manifestNo: key,

          manifestDate: (mRow as any)?.manifestDate
            ? new Date((mRow as any).manifestDate)
            : null,

          manifestStatus: '',

          companyName: c.companyName,

          assignedUser: (mRow as any)?.manifestAssignedUserName ?? c.assignedUser,

          receiverUser: (mRow as any)?.receiverUserName ?? '-',

          sources: '',
          destinations: '',

          transferModeName: (mRow as any)?.transferModeName ?? '-',

          orders: [],

          totalQty: 0,
          delivered: 0,
          progress: 0,

          stageData: []
        };

        map.set(key, g);
      }

      g.orders.push(c);

      g.totalQty += c.qty;

      const status = c.history.find(x => x.manifestStatus)?.manifestStatus;

      if (status) {
        g.manifestStatus = status;
      }

      if (lastIndex >= 0 && c.stageIndex >= lastIndex) {
        g.delivered++;
      }
    }

    let groups = [...map.values()];

    if (this.manifestStatusFilter !== 'ALL') {
      groups = groups.filter(g => g.manifestStatus === this.manifestStatusFilter);
    }

    for (const g of groups) {

      const avg =
        g.orders.reduce((s, o) => s + Math.max(o.stageIndex, 0), 0) /
        (g.orders.length || 1);

      g.progress =
        lastIndex > 0
          ? Math.round((avg / lastIndex) * 100)
          : (g.delivered ? 100 : 0);

      g.sources = [...new Set(g.orders.map(o => o.source).filter(Boolean))].join(', ');

      g.destinations = [...new Set(g.orders.map(o => o.destination).filter(Boolean))].join(', ');

      g.stageData = this.buildManifestStageData(g.manifestNo);
    }

    return groups.sort((a, b) => a.manifestNo.localeCompare(b.manifestNo));
  }

  getManifestStageTime(group: ManifestGroup, statusCode: string): Date | null {

    const stage = group.stageData.find(s => s.code === statusCode);

    return stage?.time ?? null;

  }

  /**
   * Builds the per-stage status/time for a manifest, rolled up across ALL orders
   * belonging to that manifest (not just the manifest-level log, which is often
   * empty until the manifest itself gets its own lifecycle events).
   */
  private buildManifestStageData(manifestNo: string): StageCellData[] {
    const manifestRows = this.rows.filter(r => (r.manifestNo || 'Unassigned') === manifestNo);

    return this.lifecycleStages.map(stage => {
      const stageRows = manifestRows.filter(r => r.statusCode === stage.code);

      if (!stageRows.length) {
        return { code: stage.code, name: stage.name, color: stage.color, time: null, status: 'pending' as const };
      }

      const anyManifestCurrent = stageRows.some(r => (r.manifestStatus ?? '').trim().toLowerCase() === 'current');
      const anyOrderCurrent = stageRows.some(r => (r.orderStatus ?? '').trim().toLowerCase() === 'current');
      const allOrdersCompleted = stageRows.every(r => (r.orderStatus ?? '').trim().toLowerCase() === 'completed');

      // OPEN is a special case: once an order moves past OPEN, its OPEN row is
      // never flagged "Completed" and never gets an orderStatusStartTime — it just
      // sits there with orderStatus "Pending" forever. Treat OPEN as completed once
      // any later stage has actually started for these orders.
      const isOpenStage = stage.code === 'OPEN';
      const laterStageStarted = isOpenStage &&
        manifestRows.some(r => r.statusCode !== 'OPEN' && !!r.orderStatusStartTime);

      let status: 'completed' | 'current' | 'pending';
      if (anyManifestCurrent || anyOrderCurrent) {
        status = 'current';
      } else if (allOrdersCompleted || (isOpenStage && laterStageStarted)) {
        status = 'completed';
      } else {
        status = 'pending';
      }

      // Time: prefer manifest-level start time, fall back to earliest order-level
      // start time, then — for OPEN only — fall back to the earliest orderCreatedDate,
      // since OPEN never gets a real start timestamp of its own.
      const manifestTimeRaw = stageRows.find(r => r.manifestStatusStartTime)?.manifestStatusStartTime;

      const orderTimes = stageRows
        .filter(r => r.orderStatusStartTime)
        .map(r => new Date(r.orderStatusStartTime!).getTime());
      const earliestOrderTime = orderTimes.length ? Math.min(...orderTimes) : null;

      let time: Date | null = manifestTimeRaw
        ? new Date(manifestTimeRaw)
        : (earliestOrderTime ? new Date(earliestOrderTime) : null);

      if (!time && isOpenStage) {
        const createdTimes = stageRows
          .filter(r => r.orderCreatedDate)
          .map(r => new Date(r.orderCreatedDate!).getTime());
        if (createdTimes.length) {
          time = new Date(Math.min(...createdTimes));
        }
      }

      return { code: stage.code, name: stage.name, color: stage.color, time, status };
    });
  }

  trackByManifest = (_: number, g: ManifestGroup) => g.manifestNo;
  trackByCard = (_: number, c: OrderCard) => c.key;
  trackByStage = (_: number, s: { code: string }) => s.code;

  get manifestTotalOrders(): number {
    return this.manifestGroups.reduce((s, g) => s + g.orders.length, 0);
  }
  get manifestTotalQty(): number {
    return this.manifestGroups.reduce((s, g) => s + g.totalQty, 0);
  }
  get manifestTotalDelivered(): number {
    return this.manifestGroups.reduce((s, g) => s + g.delivered, 0);
  }

  // ============================================================
  //  Stat cards (manifest level)
  // ============================================================

  private buildStatCards(): void {
    const lastIndex = this.lifecycleStages.length - 1;

    // Build unfiltered groups for global KPIs.
    const map = new Map<string, { orders: OrderCard[]; qty: number; delivered: number }>();
    for (const c of this.orderCards) {
      const key = c.manifestNo || 'Unassigned';
      let g = map.get(key);
      if (!g) { g = { orders: [], qty: 0, delivered: 0 }; map.set(key, g); }
      g.orders.push(c);
      g.qty += c.qty;
      if (lastIndex >= 0 && c.stageIndex >= lastIndex) g.delivered++;
    }

    const totalManifests = map.size;
    const completed = [...map.values()].filter(g => g.orders.length > 0 && g.delivered === g.orders.length).length;
    const inProgress = totalManifests - completed;
    const totalOrders = this.orderCards.length;
    const totalQty = this.orderCards.reduce((s, c) => s + c.qty, 0);
    const deliveredOrders = [...map.values()].reduce((s, g) => s + g.delivered, 0);

    this.statCards = [
      { label: 'Manifests', value: totalManifests, color: '#7c3aed', icon: 'fa-solid fa-clipboard-list' },
      { label: 'In Progress', value: inProgress, color: '#f59e0b', icon: 'fa-solid fa-truck-fast' },
      { label: 'Completed', value: completed, color: '#16a34a', icon: 'fa-solid fa-circle-check' },
    ];
  }

  // ============================================================
  //  Export (grouped: manifest summary + its orders)
  // ============================================================

  exportToExcel(): void {

    const headers = [
      'S.No',
      'Manifest No',
      'Manifest Date',
      'Company',
      'Assigned User',
      'Receiver User',
      'Source',
      'Destination',
      'Transfer Mode',
      'Total Orders',
      'Status',
      'Open Time',
      'Pickup Ready Time',
      'Pickup Assigned Time',
      'Picked Up Time',
      'Delivered Time'
    ];

    const rows = this.manifestGroups.map((g, index) => [

      index + 1,

      g.manifestNo,

      g.manifestDate
        ? new Date(g.manifestDate).toLocaleString()
        : '',

      g.companyName,

      g.assignedUser,

      g.receiverUser,

      g.sources,

      g.destinations,

      g.transferModeName,

      g.orders.length,

      this.getCurrentStageName(g),

      this.getManifestStageTime(g, 'OPEN')
        ? new Date(this.getManifestStageTime(g, 'OPEN')!).toLocaleString()
        : '',

      this.getManifestStageTime(g, 'PICKUP_READY')
        ? new Date(this.getManifestStageTime(g, 'PICKUP_READY')!).toLocaleString()
        : '',

      this.getManifestStageTime(g, 'PICKUP_ASSIGNED')
        ? new Date(this.getManifestStageTime(g, 'PICKUP_ASSIGNED')!).toLocaleString()
        : '',

      this.getManifestStageTime(g, 'PICKED_UP')
        ? new Date(this.getManifestStageTime(g, 'PICKED_UP')!).toLocaleString()
        : '',

      this.getManifestStageTime(g, 'DELIVERED')
        ? new Date(this.getManifestStageTime(g, 'DELIVERED')!).toLocaleString()
        : ''

    ]);

    const csv = [headers, ...rows]
      .map(r =>
        r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');

    const blob = new Blob(
      ['\uFEFF' + csv],
      { type: 'text/csv;charset=utf-8;' }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');

    link.href = url;

    link.download =
      `Manifest_Level_Report_${new Date().toISOString().slice(0, 10)}.csv`;

    link.click();

    URL.revokeObjectURL(url);

  }

  exportToPdf(): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const headers = ['#', 'Transit ID', 'Item', 'Qty', 'Source', 'Destination', 'Assigned User', 'Status', 'Duration(m)'];
    const colWidths = [8, 26, 44, 12, 44, 44, 40, 40, 22];
    const rowH = 7.5;
    const startX = 8;
    let y = 28;

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Manifest Level Report – Manifest Tracker', startX, 14);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Generated: ${new Date().toLocaleString()}   |   Manifests: ${this.manifestGroups.length}   |   Orders: ${this.manifestTotalOrders}   |   Total Qty: ${this.manifestTotalQty}`,
      startX, 21
    );
    doc.setTextColor(0, 0, 0);

    const drawHeaderRow = () => {
      doc.setFillColor(37, 99, 235);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      let hx = startX;
      headers.forEach((h, i) => {
        doc.rect(hx, y, colWidths[i], rowH, 'F');
        doc.text(h, hx + 2, y + 5);
        hx += colWidths[i];
      });
      y += rowH;
    };

    const tableWidth = colWidths.reduce((s, w) => s + w, 0);

    for (const g of this.manifestGroups) {
      if (y > 185) { doc.addPage(); y = 15; }

      // Manifest banner row
      doc.setFillColor(237, 233, 254);
      doc.setDrawColor(226, 232, 240);
      doc.rect(startX, y, tableWidth, rowH, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(109, 40, 217);
      doc.text(
        `Manifest: ${g.manifestNo}${g.manifestStatus ? '  [' + g.manifestStatus + ']' : ''}   |   ${g.companyName || ''}   |   Orders: ${g.orders.length}   Qty: ${g.totalQty}   Delivered: ${g.delivered}   Progress: ${g.progress}%`,
        startX + 2, y + 5
      );
      y += rowH;

      drawHeaderRow();

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);

      g.orders.forEach((o, idx) => {
        if (y > 195) { doc.addPage(); y = 15; drawHeaderRow(); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); }
        const row = [
          (idx + 1).toString(), String(o.transitID ?? o.orderId ?? ''),
          o.itemName || o.itemCode, o.qty.toString(),
          o.source, o.destination, o.assignedUser,
          o.currentName, o.totalDuration.toString()
        ];
        const fill = idx % 2 === 0 ? [248, 250, 252] as const : [255, 255, 255] as const;
        doc.setTextColor(30, 41, 59);
        let x = startX;
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

      y += 3; // spacer between manifests
    }

    // Grand total
    if (y > 190) { doc.addPage(); y = 15; }
    doc.setFillColor(241, 245, 249);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.rect(startX, y, tableWidth, rowH, 'F');
    doc.text(
      `Grand Total   |   Manifests: ${this.manifestGroups.length}   Orders: ${this.manifestTotalOrders}   Qty: ${this.manifestTotalQty}   Delivered: ${this.manifestTotalDelivered}`,
      startX + 2, y + 5
    );

    doc.save(`manifest-level-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  getCurrentStageName(group: ManifestGroup): string {

    const current = group.stageData.find(x => x.status === 'current');

    return current ? current.name : '-';

  }
}