import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DriverConsole } from './driver-console';

describe('DriverConsole', () => {
  let component: DriverConsole;
  let fixture: ComponentFixture<DriverConsole>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DriverConsole]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DriverConsole);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
