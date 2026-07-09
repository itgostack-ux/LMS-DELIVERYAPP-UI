import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';

import { LogisticsService } from '../../services/logistics-service';
import { UserDataService } from '../../service/user-data-service';
import { DeliveryLifecycle, DeliveryOrderTimeline } from '../../services/models/common-master-model';

type ViewMode = 'pipeline' | 'lifecycle' | 'manifest' | 'table';

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

interface PipelineColumn {
  stage: LifecycleStage;
  cards: OrderCard[];
  qty: number;
}

interface ManifestGroup {
  manifestNo: string;
  manifestStatus: string;
  companyName: string;
  orders: OrderCard[];
  totalQty: number;
  delivered: number;
  progress: number;
}

interface LifecycleStep {
  stage: LifecycleStage;
  state: 'done' | 'current' | 'pending';
  at?: Date;
  end?: Date;
  duration?: number;
  by?: string;
}

@Component({
  selector: 'app-manager-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manager-report.html',
  styleUrl: './manager-report.css',
})
export class ManagerReport implements OnInit {

  userId = 0;
  userName = '';

  rows: DeliveryOrderTimeline[] = [];
  lifecycles: DeliveryLifecycle[] = [];

  // Derived (computed once per load)
  lifecycleStages: LifecycleStage[] = [];
  orderCards: OrderCard[] = [];
  statCards: StatCard[] = [];

  // View
  view: ViewMode = 'pipeline';
  selectedOrderKey = '';

  // Lifecycle detail popup
  detailOrder: OrderCard | null = null;

  // Table view: expanded manifest rows
  expandedManifests = new Set<string>();

  toggleManifest(no: string): void {
    if (this.expandedManifests.has(no)) this.expandedManifests.delete(no);
    else this.expandedManifests.add(no);
  }

  isManifestExpanded(no: string): boolean {
    return this.expandedManifests.has(no);
  }

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

  refresh(): void {
    this.loadReport();
  }

  setView(v: ViewMode): void {
    this.view = v;
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

        if (!this.selectedOrderKey && this.orderCards.length) {
          this.selectedOrderKey = this.orderCards[0].key;
        }
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Failed to load manager report:', err);
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
  //  Filters (shared across all views)
  // ============================================================

  get statusOptions(): { code: string; name: string }[] {
    return this.lifecycleStages.map(s => ({ code: s.code, name: s.name }));
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
  }

  get hasActiveFilters(): boolean {
    return this.searchText.trim() !== '' ||
      this.statusFilter !== 'ALL' ||
      this.companyFilter !== 'ALL' ||
      this.sourceFilter !== 'ALL' ||
      this.destinationFilter !== 'ALL';
  }

  // ----- Row-level filter (for the Table view + exports) -----
  get filteredRows(): DeliveryOrderTimeline[] {
    const search = this.searchText.trim().toLowerCase();
    return this.rows.filter(r => {
      if (this.statusFilter !== 'ALL' && r.statusCode !== this.statusFilter) return false;
      if (this.companyFilter !== 'ALL' && (r.companyName ?? '') !== this.companyFilter) return false;
      if (this.sourceFilter !== 'ALL' && (r.sourceLocationName ?? '') !== this.sourceFilter) return false;
      if (this.destinationFilter !== 'ALL' && (r.destinationLocationName ?? '') !== this.destinationFilter) return false;
      if (search) {
        const haystack = [
          r.companyName, r.transitID?.toString(), r.deliveryNoteNo,
          r.sourceLocationName, r.destinationLocationName,
          r.assignedUserName, r.manifestNo, r.statusName,
          r.itemCode, r.itemName
        ].map(v => (v ?? '').toLowerCase()).join(' ');
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  // ----- Card-level filter (for Pipeline / Lifecycle / Manifest) -----
  get filteredOrderCards(): OrderCard[] {
    const search = this.searchText.trim().toLowerCase();
    return this.orderCards.filter(c => {
      if (this.statusFilter !== 'ALL' && c.currentCode !== this.statusFilter) return false;
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

  get totalQty(): number {
    return this.filteredRows.reduce((s, r) => s + (r.transferQty ?? 0), 0);
  }

  // ============================================================
  //  Pipeline (Kanban) view
  // ============================================================

  get pipelineColumns(): PipelineColumn[] {
    const cols: PipelineColumn[] = this.lifecycleStages.map(s => ({ stage: s, cards: [], qty: 0 }));
    const idx = new Map(cols.map((c, i) => [c.stage.code, i]));
    for (const card of this.filteredOrderCards) {
      const i = idx.get(card.currentCode);
      if (i == null) continue;
      cols[i].cards.push(card);
      cols[i].qty += card.qty;
    }
    return cols;
  }

  trackByStage = (_: number, c: PipelineColumn) => c.stage.code;
  trackByCard = (_: number, c: OrderCard) => c.key;

  /** Open the lifecycle tracker for a single order in a popup. */
  openDetail(card: OrderCard): void {
    this.detailOrder = card;
  }

  closeDetail(): void {
    this.detailOrder = null;
  }

  /** Open the full-tab lifecycle view focused on this order. */
  openLifecycle(card: OrderCard): void {
    this.selectedOrderKey = card.key;
    this.view = 'lifecycle';
    this.detailOrder = null;
  }

  // ============================================================
  //  Lifecycle stepper view
  // ============================================================

  get selectedOrder(): OrderCard | undefined {
    const list = this.filteredOrderCards;
    if (!list.length) return undefined;
    return list.find(c => c.key === this.selectedOrderKey) ?? list[0];
  }

  lifecycleSteps(order: OrderCard): LifecycleStep[] {
    const currentIdx = order.stageIndex;
    return this.lifecycleStages.map(stage => {
      const hist = order.history.find(h => h.statusCode === stage.code);
      let state: 'done' | 'current' | 'pending';
      if (stage.order === currentIdx) state = 'current';
      else if (currentIdx >= 0 && stage.order < currentIdx) state = 'done';
      else state = 'pending';
      return {
        stage,
        state,
        at: hist?.orderStatusStartTime,
        end: hist?.orderStatusEndTime,
        duration: hist?.orderDurationMinutes,
        by: hist?.orderChangedByName,
      };
    });
  }

  progressOf(order: OrderCard): number {
    const last = this.lifecycleStages.length - 1;
    if (last <= 0) return order.stageIndex >= 0 ? 100 : 0;
    return Math.round((Math.max(order.stageIndex, 0) / last) * 100);
  }

  // ============================================================
  //  Manifest tracker view
  // ============================================================

  get manifestGroups(): ManifestGroup[] {
    const map = new Map<string, ManifestGroup>();
    const lastIndex = this.lifecycleStages.length - 1;

    for (const c of this.filteredOrderCards) {
      const key = c.manifestNo || 'Unassigned';
      let g = map.get(key);
      if (!g) {
        g = {
          manifestNo: key, manifestStatus: '', companyName: c.companyName,
          orders: [], totalQty: 0, delivered: 0, progress: 0,
        };
        map.set(key, g);
      }
      g.orders.push(c);
      g.totalQty += c.qty;
      const ms = c.history.find(h => h.manifestStatus)?.manifestStatus;
      if (ms) g.manifestStatus = ms;
      if (lastIndex >= 0 && c.stageIndex >= lastIndex) g.delivered++;
    }

    const groups = [...map.values()];
    for (const g of groups) {
      const avg = g.orders.reduce((s, o) => s + Math.max(o.stageIndex, 0), 0) / (g.orders.length || 1);
      g.progress = lastIndex > 0 ? Math.round((avg / lastIndex) * 100) : (g.delivered ? 100 : 0);
    }
    return groups.sort((a, b) => a.manifestNo.localeCompare(b.manifestNo));
  }

  trackByManifest = (_: number, g: ManifestGroup) => g.manifestNo;

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
  //  Stat cards
  // ============================================================

  private buildStatCards(): void {
    const lastIndex = this.lifecycleStages.length - 1;
    const total = this.orderCards.length;
    const delivered = lastIndex >= 0
      ? this.orderCards.filter(c => c.stageIndex === lastIndex).length
      : 0;
    const inTransit = this.orderCards.filter(c => c.stageIndex > 0 && c.stageIndex < lastIndex).length;
    const pending = total - delivered - inTransit;
    const totalQtyAll = this.orderCards.reduce((s, c) => s + c.qty, 0);
    const distinctManifests = new Set(
      this.orderCards.filter(c => c.manifestNo).map(c => c.manifestNo)
    ).size;

    this.statCards = [
      { label: 'Total Orders', value: total,             color: '#2563eb', icon: 'fa-solid fa-boxes-stacked' },
      { label: 'Manifests',    value: distinctManifests, color: '#7c3aed', icon: 'fa-solid fa-clipboard-list' },
      { label: 'Pending',      value: Math.max(pending, 0), color: '#f59e0b', icon: 'fa-solid fa-clock' },
      { label: 'In Transit',   value: inTransit,         color: '#0891b2', icon: 'fa-solid fa-truck-fast' },
      { label: 'Delivered',    value: delivered,         color: '#16a34a', icon: 'fa-solid fa-circle-check' },
      { label: 'Total Qty',    value: totalQtyAll,       color: '#64748b', icon: 'fa-solid fa-cubes' },
    ];
  }

  getStatusColor(row: DeliveryOrderTimeline): string {
    return row.colorCode || '#6B7280';
  }

  // ============================================================
  //  Export
  // ============================================================

  exportToExcel(): void {
    const headers = [
      'S.No', 'Company', 'Transit ID', 'Delivery Note', 'Item Code', 'Item Name',
      'IMEI', 'Qty', 'Source', 'Destination', 'Transfer Mode',
      'Assigned User', 'Courier', 'AWB No', 'Manifest No',
      'Status', 'Seq No', 'Order Start', 'Order End', 'Duration (min)',
      'Changed By', 'Order Status', 'Manifest Status'
    ];

    const fmt = (d: Date | undefined) => d ? new Date(d).toLocaleString() : '';

    // Sort so every lifecycle row groups under its manifest -> order -> sequence.
    const sorted = [...this.filteredRows].sort((a, b) => {
      const ma = (a.manifestNo ?? '').localeCompare(b.manifestNo ?? '');
      if (ma !== 0) return ma;
      const oa = String(a.transferOrderId ?? a.transitID ?? '')
        .localeCompare(String(b.transferOrderId ?? b.transitID ?? ''));
      if (oa !== 0) return oa;
      return (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0);
    });

    const dataRows = sorted.map((r, i) => [
      i + 1, r.companyName ?? '', r.transitID ?? '', r.deliveryNoteNo ?? '',
      r.itemCode ?? '', r.itemName ?? '', r.imei ?? '', r.transferQty ?? 0,
      r.sourceLocationName ?? '', r.destinationLocationName ?? '', r.transferModeName ?? '',
      r.assignedUserName ?? '', r.courierName ?? '', r.awbBillNo ?? '', r.manifestNo ?? '',
      r.statusName ?? r.statusCode ?? '', r.sequenceNo ?? '',
      fmt(r.orderStatusStartTime), fmt(r.orderStatusEndTime), r.orderDurationMinutes ?? '',
      r.orderChangedByName ?? '', r.orderStatus ?? '', r.manifestStatus ?? ''
    ]);

    const totalRow = new Array(headers.length).fill('');
    totalRow[0] = 'Total';
    totalRow[7] = this.totalQty;

    const csv = [headers, ...dataRows, totalRow]
      .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manager-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportToPdf(): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const headers = ['#', 'Company', 'Transit ID', 'Source', 'Destination', 'Item', 'Qty', 'Assigned User', 'Manifest No', 'Status', 'Duration(m)'];
    const colWidths = [8, 30, 22, 38, 38, 30, 10, 30, 26, 26, 18];
    const rowH = 7.5;
    const startX = 8;
    let y = 28;

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Manager Report – Delivery Order Timeline', startX, 14);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Generated: ${new Date().toLocaleString()}   |   Records: ${this.filteredRows.length}   |   Total Qty: ${this.totalQty}`,
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

    this.filteredRows.forEach((r, idx) => {
      if (y > 195) { doc.addPage(); y = 15; }
      const row = [
        (idx + 1).toString(), r.companyName ?? '', (r.transitID ?? '').toString(),
        r.sourceLocationName ?? '', r.destinationLocationName ?? '',
        r.itemName ?? r.itemCode ?? '', (r.transferQty ?? 0).toString(),
        r.assignedUserName ?? '', r.manifestNo ?? '',
        r.statusName ?? r.statusCode ?? '', (r.orderDurationMinutes ?? '').toString()
      ];
      const fill = idx % 2 === 0 ? [248, 250, 252] as const : [255, 255, 255] as const;
      doc.setTextColor(30, 41, 59);
      x = startX;
      row.forEach((cell, i) => {
        doc.setFillColor(fill[0], fill[1], fill[2]);
        doc.setDrawColor(226, 232, 240);
        doc.rect(x, y, colWidths[i], rowH, 'FD');
        const clipped = doc.splitTextToSize(cell, colWidths[i] - 3)[0];
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
    totals[6] = this.totalQty.toString();
    totals.forEach((cell, i) => {
      doc.rect(x, y, colWidths[i], rowH, 'F');
      doc.text(cell, x + 2, y + 5);
      x += colWidths[i];
    });

    doc.save(`manager-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  }
}