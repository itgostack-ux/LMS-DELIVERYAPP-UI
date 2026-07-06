import { Component } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { Router } from '@angular/router';

import { AuthService } from '../../service/auth';

import { UserDataService } from '../../service/user-data-service';

@Component({

  selector: 'app-login',

  standalone: true,

  imports: [CommonModule, FormsModule],

  templateUrl: './login.html',

  styleUrls: ['./login.css']

})

export class Login {

  email = '';

  otp = '';

  showOtp = false;

  loading = false;

  errorMessage = '';

  constructor(

    private authService: AuthService,

    private userService: UserDataService,

    private router: Router

  ) { }

  sendOtp() {

    if (!this.email) {

      this.errorMessage = "Enter Email";

      return;

    }

    this.loading = true;

    this.authService.sendOtp(this.email).subscribe({

      next: (res: any) => {

        this.loading = false;

        if (res.isValidUser) {

          this.showOtp = true;

        } else {

          this.errorMessage = "Invalid User";

        }

      },

      error: () => {

        this.loading = false;

        this.errorMessage = "Server Error";

      }

    });

  }

  login() {

    if (!this.otp) {

      this.errorMessage = "Enter OTP";

      return;

    }

    this.loading = true;

    this.authService.validateOtp(this.email, this.otp).subscribe({

      next: (user: any) => {

        this.loading = false;

        if (user.isValidOTP) {

          this.userService.setUser(user);

          this.router.navigate(['/dashboard']);

        }

        else {

          this.errorMessage = "Invalid OTP";

        }

      },

      error: () => {

        this.loading = false;

        this.errorMessage = "Login Failed";

      }

    });

  }

}