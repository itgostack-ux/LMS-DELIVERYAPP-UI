import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { LogisticsService } from '../../services/logistics-service';
import { UserDataService } from '../../service/user-data-service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule
  ],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css'
})
export class Sidebar implements OnInit {

  roleId = 0;
  roleName = '';
  trackingMenuOpen = false;
  operationsMenuOpen = false;
  logisticsMenuOpen = false;
  constructor(
    private logisticsService: LogisticsService,
    private userDataService: UserDataService
  ) { }

  ngOnInit(): void {

    this.loadUserRole();

  }

  loadUserRole(): void {

    const userId = this.userDataService.getUserId();

    if (userId === 0) {
      return;
    }

    this.logisticsService.getRoleslifecycle(userId).subscribe({

      next: (res) => {

        if (res.length > 0) {

          this.roleId = res[0].roleID;
          this.roleName = res[0].roleName;

        }

        console.log('Role Id :', this.roleId);
        console.log('Role Name :', this.roleName);

      },

      error: (err) => {

        console.error(err);

      }

    });

  }

  isLogisticsAdmin(): boolean {

    return this.roleName === 'Logistics Admin';

  }

  isLogisticsManager(): boolean {

    return this.roleName === 'Logistics Manager';

  }

  isDeliveryExecutive(): boolean {

    return this.roleName === 'Delivery Executive';

  }

  toggleOperationsMenu(): void {
  this.operationsMenuOpen = !this.operationsMenuOpen;
}

toggleLogisticsMenu(): void {
  this.logisticsMenuOpen = !this.logisticsMenuOpen;
}

closeMenus(): void {
  this.operationsMenuOpen = false;
  this.logisticsMenuOpen = false;
}

}