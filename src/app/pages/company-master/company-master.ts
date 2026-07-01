import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { LogisticsService } from '../../services/logistics-service';
import { Company, Location, LocationType } from '../../services/models/common-master-model';

@Component({
  selector: 'app-company-master',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './company-master.html',
  styleUrl: './company-master.css'
})
export class CompanyMaster implements OnInit {

  companies: Company[] = [];
  locationTypes: LocationType[] = [];
  locations: Location[] = [];

  selectedCompanyId = 0;
  selectedLocationTypeId = 0;
  selectedLocationId = 0;

  isLoading = false;

  constructor(
    private logisticsService: LogisticsService
  ) {
    console.log('CompanyMaster Constructor');
  }

  ngOnInit(): void {

    console.log('CompanyMaster Loaded');

    this.loadCompanies();

  }

loadCompanies(): void {

  console.log('Loading Companies...');

  this.logisticsService.getCompanies().subscribe({

    next: (res) => {

      console.log(res);

      this.companies = res;

    },

    error: (err) => {

      console.log(err);

    }

  });

}

  onCompanyChange(): void {

    console.log('Selected Company :', this.selectedCompanyId);

    this.locationTypes = [];
    this.locations = [];

    this.selectedLocationTypeId = 0;
    this.selectedLocationId = 0;

    if (this.selectedCompanyId === 0) {
      return;
    }

    this.logisticsService
      .getLocationTypes(this.selectedCompanyId)
      .subscribe({

        next: (response: LocationType[]) => {

          console.log('Location Types:', response);

          this.locationTypes = response || [];

        },

        error: (err) => {

          console.error(err);

        }

      });

  }

  onLocationTypeChange(): void {

    console.log('Selected Location Type :', this.selectedLocationTypeId);

    this.locations = [];

    this.selectedLocationId = 0;

    if (this.selectedLocationTypeId === 0) {
      return;
    }

    this.logisticsService
      .getLocations(
        this.selectedCompanyId,
        this.selectedLocationTypeId
      )
      .subscribe({

        next: (response: Location[]) => {

          console.log('Locations:', response);

          this.locations = response || [];

        },

        error: (err) => {

          console.error(err);

        }

      });

  }

}