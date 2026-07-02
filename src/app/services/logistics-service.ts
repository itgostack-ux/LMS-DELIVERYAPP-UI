import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DeliveryLifecycle,CompanyUserLifecycleAccess,CompanyUserLifecycleAccessView,RoleLifecycleMappingView,Company,RoleLifecycleMapping,User,Role } from './models/common-master-model';
@Injectable({
  providedIn: 'root'
})
export class LogisticsService {

  private readonly apiUrl = 'http://localhost:5089/api/Logistics';

  constructor(private http: HttpClient) { }

  // =============================
  // Company
  // =============================

  getCompanies(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/companies`);
  }

  // =============================
  // Location Type
  // =============================

  getLocationTypes(companyId: number): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/location-types/${companyId}`
    );
  }

  // =============================
  // Location
  // =============================

  getLocations(
    companyId: number,
    locationTypeId: number
  ): Observable<any[]> {

    return this.http.get<any[]>(
      `${this.apiUrl}/locations/${companyId}/${locationTypeId}`
    );

  }

  // =============================
  // Role
  // =============================

  getRoles(): Observable<any[]> {

    return this.http.get<any[]>(
      `${this.apiUrl}/roles`
    );

  }

  // =============================
  // User
  // =============================

  getUsers(): Observable<any[]> {

    return this.http.get<any[]>(
      `${this.apiUrl}/users`
    );

  }

    getCouriers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/couriers`);
  }

  getDeliveryLifecycles(): Observable<DeliveryLifecycle[]> {
    return this.http.get<DeliveryLifecycle[]>(
      `${this.apiUrl}/delivery-lifecycle`
    );
  }

  saveDeliveryLifecycle(model: DeliveryLifecycle): Observable<any> {
  return this.http.post<any>(
    `${this.apiUrl}/delivery-lifecycle`,
    model
  );
}
// ======================================
// Company User Role Access
// ======================================

// Get Company User Role Access List
getCompanyUserLifecycleAccess(): Observable<CompanyUserLifecycleAccessView[]> {

  return this.http.get<CompanyUserLifecycleAccessView[]>(
    `${this.apiUrl}/company-user-lifecycle-access`
  );

}

// Save / Update / Delete Company User Role Access
// Save Company User Role Access
saveCompanyUserLifecycleAccess(
  model: CompanyUserLifecycleAccess
): Observable<any> {

  return this.http.post<any>(
    `${this.apiUrl}/company-user-lifecycle-access`,
    model
  );

}

// ======================================
// Company Based User / User Based Role
// ======================================




getCompanyUserRole(
  userId: number,
  companyId: number
): Observable<any[]> {

  return this.http.get<any[]>(
    `${this.apiUrl}/company-user-role?userId=${userId}&companyId=${companyId}`
  );

}
// ======================================
// Role Lifecycle Mapping
// ======================================

// Get Role Lifecycle Mapping List
getRoleLifecycleMappings(): Observable<RoleLifecycleMappingView[]> {

  return this.http.get<RoleLifecycleMappingView[]>(
    `${this.apiUrl}/role-lifecycle-mapping`
  );

}

// Save / Update / Delete Role Lifecycle Mapping
saveRoleLifecycleMapping(
  model: RoleLifecycleMapping
): Observable<any> {

  return this.http.post<any>(
    `${this.apiUrl}/role-lifecycle-mapping`,
    model
  );

}



getCompanyUsers(companyId: number): Observable<User[]> {

  return this.http.get<User[]>(
    `${this.apiUrl}/company-user-role?companyId=${companyId}&userId=0`
  );

}

getUserCompanies(userId: number): Observable<Company[]> {
  return this.http.get<Company[]>(
    `${this.apiUrl}/company-user-role?userId=${userId}&companyId=0`
  );
}

getUserRoles(userId: number, companyId: number): Observable<Role[]> {
  return this.http.get<Role[]>(
    `${this.apiUrl}/company-user-role?userId=${userId}&companyId=${companyId}`
  );
}
}