import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DriverReport } from './driver-report';

describe('DriverReport', () => {
  let component: DriverReport;
  let fixture: ComponentFixture<DriverReport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DriverReport]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DriverReport);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
