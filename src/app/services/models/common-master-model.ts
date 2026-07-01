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