import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
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
  operationsMenuOpen = false;
  logisticsMenuOpen = false;

  constructor(
    private logisticsService: LogisticsService,
    private userDataService: UserDataService,
    private elementRef: ElementRef
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

  toggleOperationsMenu(event: Event): void {
    event.stopPropagation();
    this.operationsMenuOpen = !this.operationsMenuOpen;
    this.logisticsMenuOpen = false;
  }

  toggleLogisticsMenu(event: Event): void {
    event.stopPropagation();
    this.logisticsMenuOpen = !this.logisticsMenuOpen;
    this.operationsMenuOpen = false;
  }

  closeMenus(): void {
    this.operationsMenuOpen = false;
    this.logisticsMenuOpen = false;
  }

  // Close flyouts when clicking anywhere outside the sidebar
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.closeMenus();
    }
  }

  // Close on Escape for accessibility
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenus();
  }

}