export interface LocationType {
  locationTypeId: number;
  locationTypeDesc: string;
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