import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CourierMaster } from './courier-master';

describe('CourierMaster', () => {
  let component: CourierMaster;
  let fixture: ComponentFixture<CourierMaster>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CourierMaster]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CourierMaster);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
