import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CompanyRoleLifecycleAccess } from './company-role-lifecycle-access';

describe('CompanyRoleLifecycleAccess', () => {
  let component: CompanyRoleLifecycleAccess;
  let fixture: ComponentFixture<CompanyRoleLifecycleAccess>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompanyRoleLifecycleAccess]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CompanyRoleLifecycleAccess);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
