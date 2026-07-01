import { Component } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../service/auth';
import { UserDataService } from '../../service/user-data-service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [],
  templateUrl: './header.html',
  styleUrl: './header.css'
})
export class Header {

  userName: string = '';
  companyName: string = 'GoFix India';

  constructor(
    private authService: AuthService,
    private userDataService: UserDataService,
    private router: Router
  ) {

    const user = this.userDataService.getUser();

    if (user) {
      this.userName = user.userName ?? '';
    }
  }

  logout(): void {

    this.authService.logout();

    this.router.navigate(['/login']);

  }

}