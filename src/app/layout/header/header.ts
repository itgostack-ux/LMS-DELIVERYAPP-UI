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

  userId = 0;
  userName = '';

  roleId = 0;
  roleName = '';

  companyName = 'GoFix India';

  constructor(
    private authService: AuthService,
    private userDataService: UserDataService,
    private router: Router
  )
  
  
  
  
  {

    const user = this.userDataService.getUser();

    if (user) {

      this.userId = user.userId;
      this.userName = user.userName;

      if (user.userProjectAccessList?.length > 0) {

        this.roleId = user.userProjectAccessList[0].roleId;
        this.roleName = user.userProjectAccessList[0].roleName;

      }

    }

  }

  logout(): void {

    this.authService.logout();
    this.router.navigate(['/login']);

  }

}
