import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LogisticsService } from '../../services/logistics-service';

import {
  Role,
  DeliveryLifecycle,
  RoleLifecycleMapping,
  RoleLifecycleMappingView
} from '../../services/models/common-master-model';

@Component({
  selector: 'app-role-lifecyle-mapping',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './role-lifecyle-mapping.html',
  styleUrl: './role-lifecyle-mapping.css'
})
export class RoleLifecyleMapping implements OnInit {

  roles: Role[] = [];

  lifecycles: DeliveryLifecycle[] = [];

  mappingList: RoleLifecycleMappingView[] = [];

  mapping: RoleLifecycleMapping = {

    mappingId: 0,

    roleId: 0,

    lifecycleId: 0,

    canView: true,

    canCreate: false,

    canEdit: false,

    canDelete: false,

    canChangeStatus: false,

    isActive: true

  };

  constructor(
    private logisticsService: LogisticsService
  ) { }

  ngOnInit(): void {

    this.loadRoles();

    this.loadLifecycles();

    this.loadMappings();

  }

  loadRoles() {

    this.logisticsService.getRoles().subscribe({

      next: res => this.roles = res

    });

  }

  loadLifecycles() {

    this.logisticsService.getDeliveryLifecycles().subscribe({

      next: res => {

        this.lifecycles = res;

      }

    });

  }

  loadMappings() {

    this.logisticsService
      .getRoleLifecycleMappings()
      .subscribe({

        next: res => {

          this.mappingList = res;

        }

      });

  }

  save() {

    if (this.mapping.roleId == 0) {

      alert("Please select Role.");

      return;

    }

    const selected = this.lifecycles.filter(x => x.selected);

    if (selected.length == 0) {

      alert("Please select at least one Lifecycle.");

      return;

    }

    for (const item of selected) {

      const duplicate = this.mappingList.find(x =>

        x.roleId == this.mapping.roleId &&
        x.lifecycleId == item.lifecycleId &&
        x.mappingId != this.mapping.mappingId

      );

      if (duplicate) {

        alert(item.statusName + " already mapped.");

        return;

      }

    }

    let completed = 0;

    selected.forEach(item => {

      const model = {

        ...this.mapping,

        lifecycleId: item.lifecycleId

      };

      this.logisticsService
        .saveRoleLifecycleMapping(model)
        .subscribe({

          next: (res) => {

            completed++;

            if (completed == selected.length) {

              alert(res.message);

              this.reset();

              this.loadMappings();

            }

          },

          error: err => {

            alert(err.error.message);

          }

        });

    });

  }

  edit(item: RoleLifecycleMappingView) {

    this.reset();

    this.mapping.mappingId = item.mappingId;

    this.mapping.roleId = item.roleId;

    this.mapping.canView = item.canView;

    this.mapping.canCreate = item.canCreate;

    this.mapping.canEdit = item.canEdit;

    this.mapping.canDelete = item.canDelete;

    this.mapping.canChangeStatus = item.canChangeStatus;

    this.mapping.isActive = item.isActive;

    this.lifecycles.forEach(x =>

      x.selected = x.lifecycleId == item.lifecycleId

    );

  }

  delete(item: RoleLifecycleMappingView) {

    if (!confirm("Delete this mapping?"))
      return;

    this.mapping = {

      mappingId: item.mappingId,

      roleId: item.roleId,

      lifecycleId: item.lifecycleId,

      canView: item.canView,

      canCreate: item.canCreate,

      canEdit: item.canEdit,

      canDelete: item.canDelete,

      canChangeStatus: item.canChangeStatus,

      isActive: false

    };

    this.logisticsService
      .saveRoleLifecycleMapping(this.mapping)
      .subscribe(res => {

        alert(res.message);

        this.reset();

        this.loadMappings();

      });

  }

  reset() {

    this.mapping = {

      mappingId: 0,

      roleId: 0,

      lifecycleId: 0,

      canView: true,

      canCreate: false,

      canEdit: false,

      canDelete: false,

      canChangeStatus: false,

      isActive: true

    };

    this.lifecycles.forEach(x =>

      x.selected = false

    );

  }

}