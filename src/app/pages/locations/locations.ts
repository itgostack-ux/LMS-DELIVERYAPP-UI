import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LogisticsService } from '../../services/logistics-service';
import {
  Company,
  Location,
  LocationType
} from '../../services/models/common-master-model';

@Component({
  selector: 'app-location-master',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './locations.html',
  styleUrl: './locations.css'
})
export class LocationMaster implements OnInit {

  companies: Company[] = [];
  locationTypes: LocationType[] = [];
  locations: Location[] = [];

  selectedCompanyId = 0;
  selectedLocationTypeId = 0;

  isLoading = false;

  constructor(
    private logisticsService: LogisticsService
  ) { }

  ngOnInit(): void {

    this.loadCompanies();

  }

  loadCompanies() {

    this.logisticsService.getCompanies().subscribe({

      next: (res) => {

        this.companies = res;

      },

      error: err => console.log(err)

    });

  }

  onCompanyChange() {

    this.locationTypes = [];
    this.locations = [];

    if (this.selectedCompanyId == 0)
      return;

    this.logisticsService
      .getLocationTypes(this.selectedCompanyId)
      .subscribe({

        next: (res) => {

          this.locationTypes = res;

        },

        error: err => console.log(err)

      });

  }

  onLocationTypeChange() {

    this.locations = [];

    if (this.selectedLocationTypeId == 0)
      return;

    this.logisticsService
      .getLocations(
        this.selectedCompanyId,
        this.selectedLocationTypeId
      )
      .subscribe({

        next: (res) => {

          this.locations = res;

        },

        error: err => console.log(err)

      });

  }

}