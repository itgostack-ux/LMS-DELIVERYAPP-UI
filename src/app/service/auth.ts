import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { UserDataService } from '../service/user-data-service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private apiUrl = 'https://localhost:5001/api/Auth'; // Change to your API URL

  constructor(
    private http: HttpClient,
    private router: Router,
    private userDataService: UserDataService
  ) { }

  // Send OTP
  sendOtp(email: string): Observable<any> {

    return this.http.post<any>(
      `${this.apiUrl}/SendOtp`,
      {
        email: email
      }
    );

  }

  // Validate OTP
  validateOtp(email: string, otp: string): Observable<any> {

    return this.http.post<any>(
      `${this.apiUrl}/ValidateOtp`,
      {
        email: email,
        otp: otp
      }
    );

  }

  // Login
  login(user: any): void {

    this.userDataService.setUser(user);

  }

  // Check Login
  isLoggedIn(): boolean {

    return this.userDataService.getUser() != null;

  }

  // Logout
  logout(): void {

    this.userDataService.clearUser();

    this.router.navigate(['/login']);

  }

  // Token
  getToken(): string {

    return this.userDataService.getToken();

  }

}