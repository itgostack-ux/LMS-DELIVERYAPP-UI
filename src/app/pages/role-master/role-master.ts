import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LogisticsService } from '../../services/logistics-service';
import { Role } from '../../services/models/common-master-model';

@Component({
  selector: 'app-role-master',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './role-master.html',
  styleUrl: './role-master.css'
})
export class RoleMaster implements OnInit {

  roles: Role[] = [];
  pagedRoles: Role[] = [];

  isLoading = false;

  currentPage = 1;
  pageSize = 10;
  totalPages = 0;

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

        this.totalPages = Math.ceil(this.roles.length / this.pageSize);

        this.setPage(1);

        this.isLoading = false;

      },

      error: (err) => {

        console.error(err);

        this.isLoading = false;

      }

    });

  }

  setPage(page: number): void {

    if (page < 1 || page > this.totalPages)
      return;

    this.currentPage = page;

    const start = (page - 1) * this.pageSize;
    const end = start + this.pageSize;

    this.pagedRoles = this.roles.slice(start, end);

  }

  previousPage(): void {

    if (this.currentPage > 1)
      this.setPage(this.currentPage - 1);

  }

  nextPage(): void {

    if (this.currentPage < this.totalPages)
      this.setPage(this.currentPage + 1);

  }

}