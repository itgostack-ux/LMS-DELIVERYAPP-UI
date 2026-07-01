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