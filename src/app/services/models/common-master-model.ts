export interface LocationType {
  locationTypeId: number;
  locationTypeDesc: string;
}

export class SendMailRequest {
  subject?: string;
  message?: string;
  isGofix?: boolean;
  emailAddress?: string;
  projectName?: string;
}

export interface Company {
  compId: number;
  compName: string;
  compShortCode: string;
  tradeName: string;
}

export interface Location {
  locId: number;
  locDesc: string;
  stateId: number;
  compId: number;
  locationTypeId: number;
}

export interface Role {

  roleID: number;

  roleName: string;

}


export interface Rolelifecycle {
  userId: number;
  roleID: number;

  roleName: string;

}

export interface User {

  userId: number;

  fullName: string;

  loginName: string;

  emailId: string;

  mobileNo: string;

}


export interface DeliveryLifecycle {

  lifecycleId: number;

  sequenceNo: number;

  statusCode: string;

  statusName: string;

  nextStatusCode: string;

  colorCode: string;

  description: string;

  isActive: boolean;

  createdBy: string;

  createdDate: Date;

  modifiedBy: string;

  modifiedDate: Date;
  selected?: boolean


}

export interface SendOtpRequest {
  emailId: string;
  projectName: string;
}

export interface ValidateOtpRequest {
  emailId: string;
  otp: string;
  projectName: string;
}


export interface UserProjectAccess {
  roleId: number;
  roleName: string;
}

export interface UserDetails {

  userId: number;

  userName: string;

  isValidOTP: boolean;

  userProjectAccessList: UserProjectAccess[];

}

export interface Courier {

  courierId: number;

  courierName: string;

  transStateId: number;

}
export interface CompanyUserLifecycleAccess {

  mappingId: number;

  companyId: number;

  userId: number;

  roleId: number;

  isActive: boolean;

  createdBy?: string;

  createdDate?: Date;

  modifiedBy?: string;

  modifiedDate?: Date;

}


export interface CompanyUserLifecycleAccessView {

  mappingId: number;

  companyId: number;

  companyName: string;

  userId: number;

  userName: string;

  roleId: number;

  roleName: string;

  isActive: boolean;

}

export interface RoleLifecycleMapping {

  mappingId: number;

  roleId: number;

  lifecycleId: number;

  canView: boolean;

  canCreate: boolean;

  canEdit: boolean;

  canDelete: boolean;

  canChangeStatus: boolean;

  isActive: boolean;

  createdBy?: string;

  createdDate?: Date;

  modifiedBy?: string;

  modifiedDate?: Date;

}

export interface RoleLifecycleMappingView {

  mappingId: number;

  roleId: number;

  roleName: string;

  lifecycleId: number;

  statusName: string;

  sequenceNo: number;

  canView: boolean;

  canCreate: boolean;

  canEdit: boolean;

  canDelete: boolean;

  canChangeStatus: boolean;

  isActive: boolean;

}


export interface TransferStockLogDetail {

  // Company (not always returned by the SP)
  companyId?: number;
  companyName?: string;
acceptedQty?  : number;
  // Transfer
  transferOrderId: number;
  transitID: number;

  deliveryNoteNo: string;

  transferOutDate: string;
  transferOutTime: string;

  // Source
  sourceLocationId: number;
  sourceLocationName: string;
  sourceBranch: string;
  sourceLocationTypeId?: number;
  sourceLocationTypeName?: string;

  // Destination
  destinationLocationId: number;
  destinationLocationName: string;
  destinationBranch: string;
  destinationLocationTypeId?: number;
  destinationLocationTypeName?: string;

  // Item
  itemCode: string;
  itemName: string;
  imei: string;

  transferQty: number;
  transferStatus: string;

  // Transfer Out User
  transferOutById?: number;
  transferOutByName?: string;

  // Added (API names)
  transferOutByUserId?: number;
  transferredOutBy?: string;

  // Assigned Driver
  assignedUserId?: number;
  assignedUserName?: string;

  // Courier
  courierId?: number;
  courierName?: string;
  awbBillNo?: string;

  // Transfer In
  transferInTime?: string;
  inwardDoneById?: number;
  inwardDoneByName?: string;

  // Added (API names)
  inwardDoneByUserId?: number;
  inwardDoneBy?: string;

  transferDuration?: string;

  // Lifecycle
  lifecycleId: number;
  lifecycleSequenceNo: number;
  lifecycleCode: string;
  lifecycleName: string;

  // Logistics
  logisticsStatus: string;

  // Transfer Mode
  transferModeId: number;
  transferModeName: string;

  // Remarks
  remarks?: string;

  // Audit
  isActive: boolean;

  createdBy: number;
  createdByName: string;
  createdDate: string;

  modifiedBy?: number;
  modifiedByName?: string;
  modifiedDate?: string;

  // Other Party
  otherPartyType?: string;
  otherPartyName?: string;
  vehicleNo?: string;

  // Pickup Manifest
  pickupManifestId?: number;
  pickupManifestNo?: string;

  // Location Type
  locationTypeId?: number;
  locationTypeName?: string;

  // UI Only
  selected: boolean;

  deliveryLifecycles?: DeliveryLifecycle[];
  currentLifecycle?: DeliveryLifecycle;
}
export interface DeliveryOrderTransaction {

  // Company
  companyId?: number;
  companyName?: string;

  transferOrderId: number;

  transitID: number;

  deliveryNoteNo: string;

  transferOutDate: string;
  transferOutTime: string;

  sourceLocationId: number;
  sourceLocationName: string;

  destinationLocationId: number;
  destinationLocationName: string;

  itemCode: string;
  itemName: string;
  imei: string;

  transferQty: number;

  lifecycleId: number;
  lifecycleSequenceNo: number;
  lifecycleCode: string;
  lifecycleName: string;

  transferModeId: number;
  transferModeName: string;

  transferOutById?: number;
  transferOutByName?: string;

  assignedUserId?: number;
  assignedUserName?: string;

  courierId?: number;
  courierName?: string;

  awbBillNo?: string;

  transferInTime?: string;

  inwardDoneById?: number;
  inwardDoneByName?: string;


  otherPartyType?: string;
  otherPartyName?: string;
  vehicleNo?: string;
  transferDuration?: string;

  remarks?: string;

  isActive: boolean;

  createdBy: number;
  createdByName: string;
  createdDate: string;

  modifiedBy?: number;
  modifiedByName?: string;
  modifiedDate?: string;

  pickupManifestId?: number;
  pickupManifestNo?: string;

  locationTypeId?: number;
  locationTypeName?: string;
  sourceLocationTypeId?: number;
  sourceLocationTypeName?: string;
  destinationLocationTypeId?: number;
  destinationLocationTypeName?: string;
}

export interface TransferMode {

  transferModeId: number;

  transferModeCode: string;

  transferModeName: string;

  description: string;

  isActive: boolean;

  createdBy: string;

  createdDate: string;

  modifiedBy?: string;

  modifiedDate?: string;

}

export interface TransferManifest {
  manifestId: number;
  manifestNo: string;
  transferOrderId: number;

  assignedUserId: number;
  assignedUserName: string;

  receiverUserId: number;
  receiverUserName: string;

  otp: string;

  lifecycleId: number;
  lifecycleSequenceNo: number;
  lifecycleCode: string;
  lifecycleName: string;

  manifestDate: Date;
  status: string;


}
// Flattened row returned by GET /api/Logistics/transfer-manifest —
// a join of TransferManifest + DeliveryOrderTransaction, one row per
// transfer order under a manifest. This is the real backend DTO shape.
export interface TransferManifestResponse {

  // TransferManifest
  manifestId: number;
  manifestNo: string;
  transferOrderId: number;

  assignedUserId: number;
  assignedUserName: string;

  receiverUserId: number;
  receiverUserName: string;

  otp: string;

  lifecycleId: number;
  lifecycleSequenceNo: number;
  lifecycleCode: string;
  lifecycleName: string;

  manifestDate: Date | null;
  status: string;

  // DeliveryOrderTransaction
  transitID: string;
  deliveryNoteNo: string;

  transferOutDate: Date | null;
  transferOutTime: Date | null;

  sourceLocationId: number;
  sourceLocationName: string;

  destinationLocationId: number;
  destinationLocationName: string;

  itemCode: string;
  itemName: string;
  imei: string;

  transferQty: number;

  transferModeId: number;
  transferModeName: string;

  courierId: number | null;
  courierName: string;

  awbBillNo: string;

  transferInTime: Date | null;

  inwardDoneById: number | null;
  inwardDoneByName: string;

  transferDuration: string;
  remarks: string;

  vehicleNo: string;
  otherPartyName: string;

  companyId: number;
  companyName: string;

  locationTypeId: number;
  locationTypeName: string;

  pickupManifestId: number | null;
  pickupManifestNo: string;

  // UI only
  selected?: boolean;
}