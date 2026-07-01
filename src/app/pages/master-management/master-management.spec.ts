import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MasterManagement } from './master-management';

describe('MasterManagement', () => {
  let component: MasterManagement;
  let fixture: ComponentFixture<MasterManagement>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MasterManagement]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MasterManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
