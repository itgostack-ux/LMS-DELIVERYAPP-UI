import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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

}