import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LogisticsService } from '../../services/logistics-service';
import { User } from '../../services/models/common-master-model';

@Component({
  selector: 'app-user-master',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user-master.html',
  styleUrl: './user-master.css'
})
export class UserMaster implements OnInit {

  users: User[] = [];
  pagedUsers: User[] = [];

  isLoading = false;

  currentPage = 1;
  pageSize = 10;
  totalPages = 0;

  constructor(
    private logisticsService: LogisticsService
  ) { }

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {

    this.isLoading = true;

    this.logisticsService.getUsers().subscribe({

      next: (res) => {

        this.users = res.sort((a, b) => a.userId - b.userId);

        this.totalPages = Math.ceil(this.users.length / this.pageSize);

        this.setPage(1);

        this.isLoading = false;

      },

      error: (err) => {

        console.log(err);

        this.isLoading = false;

      }

    });

  }

  setPage(page: number): void {

    if (page < 1 || page > this.totalPages) {
      return;
    }

    this.currentPage = page;

    const start = (page - 1) * this.pageSize;

    const end = start + this.pageSize;

    this.pagedUsers = this.users.slice(start, end);

  }

  previousPage(): void {

    this.setPage(this.currentPage - 1);

  }

  nextPage(): void {

    this.setPage(this.currentPage + 1);

  }

}