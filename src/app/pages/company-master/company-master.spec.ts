import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CompanyMaster } from './company-master';

describe('CompanyMaster', () => {
  let component: CompanyMaster;
  let fixture: ComponentFixture<CompanyMaster>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompanyMaster]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CompanyMaster);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
