import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import * as FileSaver from 'file-saver';
import { LogisticsService } from '../../services/logistics-service';
import { DeliveryOrderTimeline } from '../../services/models/common-master-model';
interface StatusCell {
  state: 'done' | 'current' | 'pending';
  reached: boolean;
  personName: string;
  startTime?: Date;
  endTime?: Date;
}

interface OrderDetail {
  transferOrderId: number;
  itemCode: string;
  itemName: string;
  imei: string;
  qty: number;      // Always 1
  currentStatus: string;
  currentColor: string;
  cells: { [statusCode: string]: StatusCell };
}
export interface PopupItem {

  transferOrderId: number;

  itemCode: string;

  itemName: string;

  imei: string;

  qty: number;

  currentStatus: string;

  orderStartTime?: Date;

  orderEndTime?: Date;

  changedBy?: string;

}
export interface TimelineRow {

  transferOrderId: number;

  itemCode: string;

  itemName: string;

  imei: string;

  qty: number;

  openUser?: string;

  pickupReadyUser?: string;

  pickupAssignedUser?: string;

  pickedUpUser?: string;

  deliveredUser?: string;

}

interface TransitGroup {
  transitID: string;
  deliveryNoteNo: string;
  companyName: string;
  sourceLocationName: string;
  destinationLocationName: string;
  assignedUserName: string;
  transferModeName: string;
  totalItems: number;
  totalQty: number;
  acceptedQty: number;
  pendingQty: number;
  manifestNo: string;
  manifestCreatedDate?: Date;
  transferOutByName: string;
  manifestDate?: Date;
  courierName: string;
  transferOutDate?: Date;
  awbBillNo: string;

  receiverUserName: string;


  vehicleNo: string;

currentSequence: number;
currentStatus: string;
currentStatusCode: string;
colorCode: string;

  transferOutTime?: Date;

  transferInTime?: Date;

  transferDuration?: string;
  details: OrderDetail[];

  orderStatus: string;
  manifestStatus: string;
}
@Component({
  selector: 'app-track-order-level',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './track-order-level.html',
  styleUrl: './track-order-level.css'
})
export class TrackOrderLevel implements OnInit {
  selectedSource = '';
  selectedDestination = '';
  selectedStatus = '';

  sourceList: string[] = [];
  destinationList: string[] = [];
  rows: DeliveryOrderTimeline[] = [];
  groupedLogs: TransitGroup[] = [];
  expandedTransitId: number | null = null;
  loading = false;
  errorMessage = '';
  selectedTransitId: number | null = null;
  selectedTransitRows: PopupItem[] = [];
  readonly Math = Math;
  companyList: string[] = [];

  selectedCompany = '';

  fromDate = '';

  toDate = '';

  currentPage = 1;

  pageSize = 10;

  pagedLogs: TransitGroup[] = [];

  totalPages = 0;

  filteredLogs: TransitGroup[] = [];
  constructor(
    private logisticsService: LogisticsService
  ) { }

  ngOnInit(): void {
    this.loadReport();
  }

  loadReport(): void {

    this.loading = true;
    this.errorMessage = '';

    this.logisticsService.getDeliveryOrderTimeline().subscribe({
      next: (response) => {

        //console.log('Delivery Order Timeline API Response');
       // console.log(response);

        this.rows = response;
        const transitMap = new Map<number, TransitGroup>();

        this.groupedLogs = this.buildGroups(response);

        this.filteredLogs = [...this.groupedLogs];
        this.loadPage();
        this.companyList = [
          ...new Set(this.groupedLogs.map(x => x.companyName))
        ];


        this.sourceList = [
          ...new Set(this.groupedLogs.map(x => x.sourceLocationName))
        ];

        this.destinationList = [
          ...new Set(this.groupedLogs.map(x => x.destinationLocationName))
        ];

        this.loading = false;

      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        this.errorMessage = 'Failed to load data';
      }
    });

  }
  loadPage(): void {

    this.totalPages = Math.ceil(this.filteredLogs.length / this.pageSize);

    const start = (this.currentPage - 1) * this.pageSize;

    const end = start + this.pageSize;

    this.pagedLogs = this.filteredLogs.slice(start, end);

  }


  previousPage(): void {

    if (this.currentPage > 1) {

      this.currentPage--;

      this.loadPage();

    }

  }

  nextPage(): void {

    if (this.currentPage < this.totalPages) {

      this.currentPage++;

      this.loadPage();

    }

  }
private buildGroups(data: DeliveryOrderTimeline[]): TransitGroup[] {

  const transitMap = new Map<string, TransitGroup>();

  data.forEach(r => {

    const transitId = String(r.transitID ?? 0);
    const sequence = r.sequenceNo ?? 0;

    let group = transitMap.get(transitId);

    if (!group) {

      group = {

        transitID: transitId,

        manifestNo: r.manifestNo ?? '',
        deliveryNoteNo: r.deliveryNoteNo ?? '',
        manifestDate: r.manifestDate,

        companyName: r.companyName ?? '',
        sourceLocationName: r.sourceLocationName ?? '',
        destinationLocationName: r.destinationLocationName ?? '',

        transferOutDate: r.transferOutDate,
        transferOutTime: r.transferOutTime,
        transferInTime: r.transferInTime,

        transferModeName: r.transferModeName ?? '',
        assignedUserName: r.assignedUserName ?? '',
        transferOutByName: r.transferOutByName ?? '',
        receiverUserName: r.receiverUserName ?? '',

        courierName: r.courierName ?? '',
        awbBillNo: r.awbBillNo ?? '',
        vehicleNo: r.vehicleNo ?? '',

        transferDuration: r.transferDuration ?? '',

        totalItems: 0,
        totalQty: 0,
        acceptedQty: 0,
        pendingQty: 0,

      currentSequence: 0,
currentStatus: '',
currentStatusCode: '',
colorCode: '',

        orderStatus: '',
        manifestStatus: '',

        details: []

      };

      transitMap.set(transitId, group);
    }

    /*------------------------------------
      Current Transit Status
      Use only lifecycle rows that started
    -------------------------------------*/

if (
    r.orderLogId != null &&
    r.orderStatusStartTime != null &&
    sequence > group.currentSequence
) {

    group.currentSequence = sequence;

    group.currentStatus = r.statusName ?? '';

    group.currentStatusCode = r.statusCode ?? '';

    group.colorCode = r.colorCode ?? '';

    group.orderStatus = r.orderStatus ?? '';

    group.manifestStatus = r.manifestStatus ?? '';

}

    /*------------------------------------
      Item Details
    -------------------------------------*/

    let detail = group.details.find(
      x => x.transferOrderId === r.transferOrderId
    );

    if (!detail) {

      detail = {

        transferOrderId: r.transferOrderId,

        itemCode: r.itemCode ?? '',

        itemName: r.itemName ?? '',

        imei: r.imei ?? '',

        qty: 1,

        currentStatus: '',

        currentColor: '',

        cells: {}

      };

      group.details.push(detail);

      group.totalItems++;

      group.totalQty++;

    }

    /*------------------------------------
      Item Current Status
    -------------------------------------*/

    if (r.orderStatusStartTime != null &&
        sequence >= group.currentSequence) {

      detail.currentStatus = r.statusName ?? '';

      detail.currentColor = r.colorCode ?? '';

    }

    /*------------------------------------
      Accepted Qty
    -------------------------------------*/

    if ((r.statusCode ?? '').toUpperCase() === 'DELIVERED') {

      group.acceptedQty++;

    }

  });

  transitMap.forEach(g => {

    g.pendingQty = g.totalQty - g.acceptedQty;

    if (!g.currentStatus) {

      g.currentStatus = 'Pending';

    }

  });

  return [...transitMap.values()];

}

getStatusBackground(color: string): string {

  switch (color?.toUpperCase()) {

    case '#6B7280': // Open
      return '#F3F4F6';

    case '#F59E0B': // Pickup Ready
      return '#FEF3C7';

    case '#2563EB': // Pickup Assigned
      return '#DBEAFE';

    case '#7C3AED': // Picked Up
      return '#EDE9FE';

    case '#16A34A': // Delivered
      return '#DCFCE7';

    default:
      return '#F8FAFC';

  }

}


exportToExcel(): void {

  const exportData = this.filteredLogs.map((t, index) => ({

    'S.No': index + 1,

    'Transit ID': t.transitID,

    'Manifest No': t.manifestNo,

    'Manifest Date': t.manifestDate
      ? new Date(t.manifestDate).toLocaleString()
      : '',

    'Company': t.companyName,

    'Source Location': t.sourceLocationName,

    'Destination Location': t.destinationLocationName,

    'Transfer Mode': t.transferModeName,

    'Assigned User': t.assignedUserName,

    'Receiver': t.receiverUserName,

    'Transfer Out By': t.transferOutByName,

    'Courier': t.courierName,

    'AWB No': t.awbBillNo,

    'Vehicle No': t.vehicleNo,

    'Total Items': t.totalItems,

    'Total Qty': t.totalQty,

    'Accepted Qty': t.acceptedQty,

    'Pending Qty': t.pendingQty,

    'Order Status': t.orderStatus,

    'Current Status': t.currentStatus,

    'Transfer Out Time': t.transferOutTime
      ? new Date(t.transferOutTime).toLocaleString()
      : '',

    'Transfer In Time': t.transferInTime
      ? new Date(t.transferInTime).toLocaleString()
      : '',

    'Duration': t.transferDuration

  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transit Report');

  XLSX.writeFile(workbook, 'Transit_Level_Report.xlsx');

}


openTransit(transitId: number): void {

    this.selectedTransitId = transitId;

    const rows = this.rows.filter(x => x.transitID === transitId);

    const map = new Map<string, PopupItem>();

    rows.forEach(r => {

      const key = r.transferOrderId + '_' + (r.imei ?? '');

      if (!map.has(key)) {

        map.set(key, {

          transferOrderId: r.transferOrderId,

          itemCode: r.itemCode ?? '',

          itemName: r.itemName ?? '',

          imei: r.imei ?? '',

          qty: 1,

          currentStatus: r.statusName ?? '',

          orderStartTime: r.orderStatusStartTime,

          orderEndTime: r.orderStatusEndTime,

          changedBy: r.orderChangedByName ?? ''

        });

      }

      const item = map.get(key)!;

      // Keep latest status
      if ((r.sequenceNo ?? 0) >= 0) {

        item.currentStatus = r.statusName ?? item.currentStatus;

        item.orderStartTime = r.orderStatusStartTime;

        item.orderEndTime = r.orderStatusEndTime;

        item.changedBy = r.orderChangedByName ?? item.changedBy;

      }

    });

    this.selectedTransitRows = [...map.values()];

  }

  closeTransit(): void {
    this.selectedTransitId = null;
    this.selectedTransitRows = [];
  }
applyFilter(): void {

  this.filteredLogs = this.groupedLogs.filter(x => {

    let match = true;

    // Company
    if (this.selectedCompany) {
      match = match && x.companyName === this.selectedCompany;
    }

    // Source
    if (this.selectedSource) {
      match = match && x.sourceLocationName === this.selectedSource;
    }

    // Destination
    if (this.selectedDestination) {
      match = match && x.destinationLocationName === this.selectedDestination;
    }

    // Current Status Filter
    if (this.selectedStatus) {
      match = match && x.currentStatus === this.selectedStatus;
    }

    // Transfer Out Date Filter
    const transferDate = x.transferOutTime
      ? new Date(x.transferOutTime)
      : null;

    if (transferDate) {

      transferDate.setHours(0, 0, 0, 0);

      if (this.fromDate) {
        const from = new Date(this.fromDate);
        from.setHours(0, 0, 0, 0);

        match = match && transferDate >= from;
      }

      if (this.toDate) {
        const to = new Date(this.toDate);
        to.setHours(0, 0, 0, 0);

        match = match && transferDate <= to;
      }
    }

    return match;

  });

  // Latest Transit First
  this.filteredLogs.sort((a, b) =>
    Number(b.transitID) - Number(a.transitID)
  );

  this.currentPage = 1;

  this.loadPage();

}
  clearFilter(): void {

    this.selectedCompany = '';

    this.fromDate = '';

    this.toDate = '';

    this.filteredLogs = [...this.groupedLogs];
    this.loadPage();
  }
filterByStatus(status: string): void {

  this.selectedStatus = status;

  this.applyFilter();

}
}