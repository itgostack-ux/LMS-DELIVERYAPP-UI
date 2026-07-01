import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LogisticsService } from '../../services/logistics-service';
import { Role } from '../../services/models/common-master-model';

@Component({
  selector: 'app-role-master',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl: './role-master.html',
  styleUrl: './role-master.css'
})
export class RoleMaster implements OnInit {

  roles: Role[] = [];

  isLoading = false;

  constructor(
    private logisticsService: LogisticsService
  ) { }

  ngOnInit(): void {

    this.loadRoles();

  }

loadRoles(): void {

  this.isLoading = true;

  this.logisticsService.getRoles().subscribe({

    next: (res) => {

      this.roles = res.sort((a, b) => a.roleID - b.roleID);

      this.isLoading = false;

    },

    error: (err) => {

      console.error(err);

      this.isLoading = false;

    }

  });

}
}