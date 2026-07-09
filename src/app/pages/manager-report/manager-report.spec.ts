import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManagerReport } from './manager-report';

describe('ManagerReport', () => {
  let component: ManagerReport;
  let fixture: ComponentFixture<ManagerReport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManagerReport]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManagerReport);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
