import { Routes } from '@angular/router';

import { Login } from './pages/login/login';
import { Dashboard } from './pages/dashboard/dashboard';

import { MainLayout } from './layout/main-layout/main-layout';

import { MasterManagement } from './pages/master-management/master-management';

import { CompanyMaster } from './pages/company-master/company-master';
import { LocationTypeMaster } from './pages/locationtype-master/locationtype-master';
import { LocationMaster } from './pages/locations/locations';

export const routes: Routes = [

  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },

  {
    path: 'login',
    component: Login
  },

  {
    path: '',
    component: MainLayout,
    children: [

      {
        path: 'dashboard',
        component: Dashboard
      },

      {
        path: 'master-management',
        component: MasterManagement,

        children: [

          {
            path: '',
            redirectTo: 'company',
            pathMatch: 'full'
          },

          {
            path: 'company',
            component: CompanyMaster
          },

          {
            path: 'location-type',
            component: LocationTypeMaster
          },

          {
            path: 'location',
            component: LocationMaster
          }

        ]

      }

    ]
  },

  {
    path: '**',
    redirectTo: 'dashboard'
  }

];