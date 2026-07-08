import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';

import {
  SendOtpRequest,
  ValidateOtpRequest,
  UserDetails,
  SendMailRequest
} from '../services/models/common-master-model';
import { environment } from '../pages/confiq';
@Injectable({
  providedIn: 'root'
})

export class AuthService {

  private baseUrl = environment.authApiUrl;

  constructor(private http: HttpClient) { }

  sendOtp(email: string): Observable<any> {

    const request = {
      emailId: email,
      projectName: 'Delivery App'
    };

    return this.http.post(
      `${this.baseUrl}User/SendOtpByProject`,
      request
    );
  }

  validateOtp(email: string, otp: string): Observable<any> {

    const request = {
      emailId: email,
      otp: otp,
      projectName: 'Delivery App'
    };

    return this.http.post(
      `${this.baseUrl}User/ValidateOtpByProject`,
      request
    );
  }
logout(): void {

  localStorage.removeItem('currentUser');

  // Remove token if you use JWT
  localStorage.removeItem('token');

}
  sendMail(data: SendMailRequest): Observable<any> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.post<any>(`${this.baseUrl}api/Common/SendMailAsync`, data, { headers });
  }


}