import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../service/auth';
import { UserDataService } from '../../service/user-data-service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {

  email: string = '';
  otp: string = '';

  showOtp: boolean = false;
  isLoading: boolean = false;
  errorMessage: string = '';

  constructor(
    private authService: AuthService,
    private userDataService: UserDataService,
    private router: Router
  ) { }

  sendOtp(): void {

    this.errorMessage = '';

    if (this.email.trim() === '') {
      this.errorMessage = 'Please enter your email.';
      return;
    }

    this.isLoading = true;

    this.authService.sendOtp(this.email).subscribe({

      next: (response: any) => {

        this.isLoading = false;

        if (response.isSuccess) {

          this.showOtp = true;

        } else {

          this.errorMessage = response.message;

        }

      },

      error: () => {

        this.isLoading = false;
        this.errorMessage = 'Unable to send OTP. Please try again.';

      }

    });

  }

  login(): void {

    this.errorMessage = '';

    if (this.otp.trim() === '') {

      this.errorMessage = 'Please enter OTP.';
      return;

    }

    this.isLoading = true;

    this.authService.validateOtp(this.email, this.otp).subscribe({

      next: (response: any) => {

        this.isLoading = false;

        if (response.isSuccess) {

          this.userDataService.setUser(response);

          this.router.navigate(['/dashboard']);

        } else {

          this.errorMessage = response.message;

        }

      },

      error: () => {

        this.isLoading = false;
        this.errorMessage = 'Invalid OTP.';

      }

    });

  }

  clear(): void {

    this.email = '';
    this.otp = '';
    this.showOtp = false;
    this.errorMessage = '';

  }

}