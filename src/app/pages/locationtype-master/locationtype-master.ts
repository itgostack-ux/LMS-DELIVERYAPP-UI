import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogisticsService } from '../../services/logistics-service';
import { Company, Location, LocationType } from '../../services/models/common-master-model';

@Component({
  selector: 'app-location-type-master',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './locationtype-master.html',
  styleUrl: './locationtype-master.css'
})
export class LocationTypeMaster implements OnInit {

  companies: Company[] = [];
  locationTypes: LocationType[] = [];

  selectedCompanyId = 0;

  isLoading = false;

  constructor(
    private logisticsService: LogisticsService
  ) { }

  ngOnInit(): void {
    this.loadCompanies();
  }

  loadCompanies(): void {

    this.logisticsService.getCompanies().subscribe({

      next: (res) => {
        this.companies = res;
      },

      error: (err) => {
        console.log(err);
      }

    });

  }

  onCompanyChange(): void {

    this.locationTypes = [];

    if (this.selectedCompanyId == 0)
      return;

    this.isLoading = true;

    this.logisticsService
      .getLocationTypes(this.selectedCompanyId)
      .subscribe({

        next: (res) => {

          this.locationTypes = res;
          this.isLoading = false;

        },

        error: (err) => {

          console.log(err);
          this.isLoading = false;

        }

      });

  }

}