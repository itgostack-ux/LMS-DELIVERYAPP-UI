import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LogisticsService } from '../../services/logistics-service';

import {
  Company,
  User,
  Role,
  CompanyUserLifecycleAccess,
  CompanyUserLifecycleAccessView
} from '../../services/models/common-master-model';

@Component({
  selector: 'app-company-role-lifecycle-access',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './company-role-lifecycle-access.html',
  styleUrl: './company-role-lifecycle-access.css'
})
export class CompanyRoleLifecycleAccess implements OnInit {

  companies: Company[] = [];
  users: User[] = [];
  roles: Role[] = [];

  accessList: CompanyUserLifecycleAccessView[] = [];

  model: CompanyUserLifecycleAccess = {

    mappingId: 0,

    companyId: 0,

    userId: 0,

    roleId: 0,

    isActive: true,

    createdBy: '',

    createdDate: new Date(),

    modifiedBy: '',

    modifiedDate: new Date()

  };

  constructor(
    private logisticsService: LogisticsService
  ) { }

  ngOnInit(): void {

    this.loadUsers();
    this.loadRoles();
    this.loadAccessList();

  }


  //=========================================
  // Load Roles
  //=========================================
  loadRoles(): void {

    this.logisticsService.getRoles().subscribe({

      next: (res) => {

        this.roles = res;

      },

      error: (err) => {

        console.error('Failed to load roles', err);

      }

    });

  }
  //=========================================
  // Load Companies
  //=========================================

  loadCompanies(): void {

    this.logisticsService.getCompanies().subscribe({

      next: (res) => {

        this.companies = res;

      },

      error: (err) => {

        console.error(err);

      }

    });

  }
  loadUsers(): void {

    this.logisticsService.getUsers().subscribe({

      next: (res) => {

        this.users = res;

      },

      error: (err) => {

        console.error(err);

      }

    });

  }
  //=========================================
  // Company Changed
  //=========================================


  //=========================================
  // User Changed
  //=========================================
  userChanged(): void {

    this.companies = [];

    this.model.companyId = 0;

    if (this.model.userId === 0) {
      return;
    }

    this.logisticsService
      .getUserCompanies(this.model.userId)
      .subscribe({

        next: (res) => {

          this.companies = res;

        },

        error: (err) => {

          console.error(err);

        }

      });

  }
  //=========================================
  // Save
  //=========================================

  save(): void {

    if (this.model.companyId === 0) {

      alert('Please select Company.');
      return;

    }

    if (this.model.userId === 0) {

      alert('Please select User.');
      return;

    }

    if (this.model.roleId === 0) {

      alert('Please select Role.');
      return;

    }

    // Duplicate Check
    const duplicate = this.accessList.find(x =>
      x.companyId === this.model.companyId &&
      x.userId === this.model.userId &&
      x.roleId === this.model.roleId &&
      x.mappingId !== this.model.mappingId
    );

    if (duplicate) {

      alert('This User is already mapped to the selected Company and Role.');

      return;

    }

    const saveModel: CompanyUserLifecycleAccess = {

      mappingId: this.model.mappingId,

      companyId: this.model.companyId,

      userId: this.model.userId,

      roleId: this.model.roleId,

      isActive: true,

      createdBy: 'Admin',

      createdDate: new Date(),

      modifiedBy: 'Admin',

      modifiedDate: new Date()

    };

    this.logisticsService
      .saveCompanyUserLifecycleAccess(saveModel)
      .subscribe({

        next: (res) => {

          alert(res.message);

          this.reset();

          this.loadUsers();

          this.loadAccessList();

        },

        error: (err) => {

          alert(err.error?.message || 'Save Failed');

        }

      });

  }

  //=========================================
  // Edit
  //=========================================

edit(item: CompanyUserLifecycleAccessView): void {

  this.model.mappingId = item.mappingId;

  // Set User first
  this.model.userId = item.userId;

  // Load companies for the selected user
  this.logisticsService.getUserCompanies(item.userId).subscribe({

    next: (companies) => {

      this.companies = companies;

      // After companies are loaded, set the selected company
      this.model.companyId = item.companyId;

      // Roles are already loaded from the master
      this.model.roleId = item.roleId;

    },

    error: (err) => {

      console.error(err);

    }

  });

}
  //=========================================
  // Delete
  //=========================================

  delete(item: CompanyUserLifecycleAccessView): void {

    if (!confirm('Delete this Mapping?')) {
      return;
    }

    const deleteModel: CompanyUserLifecycleAccess = {

      mappingId: item.mappingId,

      companyId: item.companyId,

      userId: item.userId,

      roleId: item.roleId,

      isActive: false,

      createdBy: '',

      createdDate: new Date(),

      modifiedBy: 'Admin',

      modifiedDate: new Date()

    };

    this.logisticsService
      .saveCompanyUserLifecycleAccess(deleteModel)
      .subscribe({

        next: (res) => {

          alert(res.message);

          this.reset();

          this.loadAccessList();

        },

        error: (err) => {

          alert(err.error?.message || 'Delete Failed');

        }

      });

  }

  //=========================================
  // Load Grid
  //=========================================

  loadAccessList(): void {

    this.logisticsService
      .getCompanyUserLifecycleAccess()
      .subscribe({

        next: (res) => {

          this.accessList = res;

        },

        error: (err) => {

          console.error(err);

        }

      });

  }

  //=========================================
  // Reset
  //=========================================

  reset(): void {

    this.users = [];

    this.roles = [];

    this.model = {

      mappingId: 0,

      companyId: 0,

      userId: 0,

      roleId: 0,

      isActive: true,

      createdBy: '',

      createdDate: new Date(),

      modifiedBy: '',

      modifiedDate: new Date()

    };

  }

}