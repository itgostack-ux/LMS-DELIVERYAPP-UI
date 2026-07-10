import { Routes } from '@angular/router';

import { Login } from './pages/login/login';
import { Dashboard } from './pages/dashboard/dashboard';

import { MainLayout } from './layout/main-layout/main-layout';

import { MasterManagement } from './pages/master-management/master-management';

import { CompanyMaster } from './pages/company-master/company-master';
import { LocationTypeMaster } from './pages/locationtype-master/locationtype-master';
import { LocationMaster } from './pages/locations/locations';
import { RoleMaster } from './pages/role-master/role-master';
import { UserMaster } from './pages/user-master/user-master';
import { CourierMaster } from './pages/courier-master/courier-master';
import { DeliveryLifecycleMaster } from './pages/delivery-lifecycle-master/delivery-lifecycle-master';
import { Administration } from './pages/administration/administration';
import { CompanyRoleLifecycleAccess } from './pages/company-role-lifecycle-access/company-role-lifecycle-access';
import { RoleLifecyleMapping } from './pages/role-lifecyle-mapping/role-lifecyle-mapping';
import { TransferOrderWorkbench } from './pages/transfer-order-workbench/transfer-order-workbench';
import { DriverConsole } from './pages/driver-console/driver-console';
import { TranferOrderView } from './pages/tranfer-order-view/tranfer-order-view';
import { ManifestPrintComponent } from '../app/pages/manifest-print/manifest-print'
import { DriverReport } from './pages/driver-report/driver-report';
import { ManagerReport } from './pages/manager-report/manager-report';
import { TrackManifestLevel } from './pages/track-manifest-level/track-manifest-level';
import { TrackOrderLevel } from './pages/track-order-level/track-order-level';
export const routes: Routes = [

  {
    path: '',
    redirectTo: 'login',
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
          },

          {
            path: 'role',
            component: RoleMaster
          },
          {
            path: 'user-master',
            component: UserMaster
          },
          {
            path: 'courier',
            component: CourierMaster
          },

          {
            path: 'lifecycle',
            component: DeliveryLifecycleMaster
          },

        ]


      },

      {
        path: 'administration',
        component: Administration,
        children: [

          { path: '', redirectTo: 'role', pathMatch: 'full' },

          { path: 'role', component: RoleMaster },

          { path: 'user-master', component: UserMaster },

          { path: 'lifecycle', component: DeliveryLifecycleMaster },
          { path: 'lifecycleaccess', component: CompanyRoleLifecycleAccess },
          { path: 'role-cycle', component: RoleLifecyleMapping }
        ]
      },


      {
        path: 'operations',
        component: TransferOrderWorkbench,
        children: [

          { path: '', redirectTo: 'role', pathMatch: 'full' },

          { path: 'role', component: RoleMaster },

          { path: 'user-master', component: UserMaster },

          { path: 'lifecycle', component: DeliveryLifecycleMaster },
          { path: 'lifecycleaccess', component: CompanyRoleLifecycleAccess },
          { path: 'role-cycle', component: RoleLifecyleMapping }
        ]
      },
      {
        path: 'driver-console',
        component: DriverConsole,
        children: [

          { path: '', redirectTo: 'role', pathMatch: 'full' },

          { path: 'role', component: RoleMaster },


        ]
      },

         {
        path: 'track-orders',
        component: TranferOrderView,
        children: [

          { path: '', redirectTo: 'role', pathMatch: 'full' },

          { path: 'role', component: RoleMaster },


        ]
      },

        {
        path: 'd-report',
        component: DriverReport,
        children: [

          { path: '', redirectTo: 'role', pathMatch: 'full' },

          { path: 'role', component: DriverReport },


        ]
      },

        {
        path: 'm-report',
        component: ManagerReport,
        children: [

          { path: '', redirectTo: 'role', pathMatch: 'full' },

          { path: 'role', component: ManagerReport },


        ]
      },

      
        {
        path: 'track-manifest-report',
        component: TrackManifestLevel,
        children: [

          { path: '', redirectTo: 'role', pathMatch: 'full' },

          { path: 'role', component: TrackManifestLevel },


        ]
      },

         {
        path: 'track-order-level-report',
        component: TrackOrderLevel,
        children: [

          { path: '', redirectTo: 'role', pathMatch: 'full' },

          { path: 'role', component: TrackOrderLevel },


        ]
      }
    ]















  },

  {
    path: '**',
    redirectTo: 'dashboard'
  }

];