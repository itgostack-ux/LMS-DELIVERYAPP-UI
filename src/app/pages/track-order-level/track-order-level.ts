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


  // Open
  openUser?: string;
  openTime?: Date;

  // Pickup Ready
  pickupReadyUser?: string;
  pickupReadyTime?: Date;

  // Pickup Assigned
  pickupAssignedUser?: string;
  pickupAssignedTime?: Date;

  // Picked Up
  pickedUpUser?: string;
  pickedUpTime?: Date;

  // Delivered
  deliveredUser?: string;
  deliveredTime?: Date;
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
  statusFilteredLogs: TransitGroup[] = [];
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

        this.rows = response;
        //console.log('Delivery Order Timeline:', this.rows);
        // Build Transit Groups
        console.log(response.filter(x => x.transitID === 64871));
        this.groupedLogs = this.buildGroups(response);
       // console.log('Grouped Logs:', this.groupedLogs);

       console.log(
  this.groupedLogs.find(x => x.transitID === '64871')
);
        // Load Company Filter
        this.companyList = [
          ...new Set(this.groupedLogs.map(x => x.companyName))
        ];

        // Load Source Filter
        this.sourceList = [
          ...new Set(this.groupedLogs.map(x => x.sourceLocationName))
        ];

        // Load Destination Filter
        this.destinationList = [
          ...new Set(this.groupedLogs.map(x => x.destinationLocationName))
        ];

        // Default From Date & To Date = Today
        this.setTodayDate();

        // Apply Filters (Company, Source, Destination,
        // Current Status, Date)
        this.applyFilter();

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


          openUser: '',
          openTime: undefined,

          pickupReadyUser: '',
          pickupReadyTime: undefined,

          pickupAssignedUser: '',
          pickupAssignedTime: undefined,

          pickedUpUser: '',
          pickedUpTime: undefined,

          deliveredUser: '',
          deliveredTime: undefined,
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
  Transit Lifecycle Details
-------------------------------------*/
/*------------------------------------
  Transit Lifecycle Details
-------------------------------------*/
switch ((r.statusCode ?? '').toUpperCase()) {

  case 'OPEN':

    group.openUser = r.createdByName ?? '';

    group.openTime = r.transferOutTime;

    break;

  case 'PICKUP_READY':

    group.pickupReadyUser = r.orderChangedByName ?? '';

    group.pickupReadyTime = r.orderStatusStartTime;

    break;

  case 'PICKUP_ASSIGNED':

    group.pickupAssignedUser = r.orderChangedByName ?? '';

    group.pickupAssignedTime = r.orderStatusStartTime;

    break;

  case 'PICKED_UP':

    group.pickedUpUser = r.orderChangedByName ?? '';

    group.pickedUpTime = r.orderStatusStartTime;

    break;

  case 'DELIVERED':

    group.deliveredUser = r.orderChangedByName ?? '';

    group.deliveredTime = r.orderStatusStartTime;

    break;
}

      /*------------------------------------
        Item Details
      -------------------------------------*/
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

  const formatDateTime = (value: any): string => {
    if (!value) return '';
    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const exportData = this.filteredLogs.map((t, index) => ({

    'S.No': index + 1,

    'Transit ID': t.transitID,



    'Company': t.companyName,

    'Source Location': t.sourceLocationName,

    'Destination Location': t.destinationLocationName,

    'Transfer Mode': t.transferModeName,

    'Assigned User': t.assignedUserName,

    'Receiver User': t.receiverUserName,

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

    // Lifecycle Details
    'Open User': t.openUser,
    'Open Date & Time': formatDateTime(t.openTime),

    'Pickup Ready User': t.pickupReadyUser,
    'Pickup Ready Date & Time': formatDateTime(t.pickupReadyTime),

    'Pickup Assigned User': t.pickupAssignedUser,
    'Pickup Assigned Date & Time': formatDateTime(t.pickupAssignedTime),

    'Picked Up User': t.pickedUpUser,
    'Picked Up Date & Time': formatDateTime(t.pickedUpTime),

    'Delivered User': t.deliveredUser,
    'Delivered Date & Time': formatDateTime(t.deliveredTime),

    'Transfer Out Time': formatDateTime(t.transferOutTime),

    'Transfer In Time': formatDateTime(t.transferInTime),

    'Transfer Duration': t.transferDuration

  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transit Level Report');

  XLSX.writeFile(
    workbook,
    `Transit_Level_Report_${new Date().toISOString().slice(0,10)}.xlsx`
  );
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

       changedBy: r.changedByName ?? ''

        });

      }

      const item = map.get(key)!;

      // Keep latest status
      if ((r.sequenceNo ?? 0) >= 0) {

        item.currentStatus = r.statusName ?? item.currentStatus;

        item.orderStartTime = r.orderStatusStartTime;

        item.orderEndTime = r.orderStatusEndTime;

     item.changedBy = r.changedByName ?? item.changedBy;

      }

    });

    this.selectedTransitRows = [...map.values()];

  }

  closeTransit(): void {
    this.selectedTransitId = null;
    this.selectedTransitRows = [];
  }

  getStatusCount(status: string): number {

    return this.statusFilteredLogs.filter(x =>
      x.currentStatus === status
    ).length;

  }

  setTodayDate(): void {

    const today = new Date();

    const yyyy = today.getFullYear();

    const mm = String(today.getMonth() + 1).padStart(2, '0');

    const dd = String(today.getDate()).padStart(2, '0');

    const currentDate = `${yyyy}-${mm}-${dd}`;

    this.fromDate = currentDate;

    this.toDate = currentDate;

  }
  applyFilter(): void {

    // First filter without status
    this.statusFilteredLogs = this.groupedLogs.filter(x => {

      let match = true;

      if (this.selectedCompany) {
        match = match && x.companyName === this.selectedCompany;
      }

      if (this.selectedSource) {
        match = match && x.sourceLocationName === this.selectedSource;
      }

      if (this.selectedDestination) {
        match = match && x.destinationLocationName === this.selectedDestination;
      }

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

    // Apply Current Status Tab
    this.filteredLogs = [...this.statusFilteredLogs];

    if (this.selectedStatus) {

      this.filteredLogs = this.filteredLogs.filter(x =>
        x.currentStatus === this.selectedStatus
      );

    }

    // Sort
    this.filteredLogs.sort((a, b) =>
      Number(b.transitID) - Number(a.transitID));

    this.currentPage = 1;

    this.loadPage();

  }
  clearFilter(): void {

    // Clear all filters
    this.selectedCompany = '';

    this.selectedSource = '';

    this.selectedDestination = '';

    this.selectedStatus = '';

    // Set today's date
    this.setTodayDate();

    // Apply filters
    this.applyFilter();

  }
  filterByStatus(status: string): void {

    this.selectedStatus = status;

    this.applyFilter();

  }

  getAllCount(): number {

    return this.statusFilteredLogs.length;

  }
}