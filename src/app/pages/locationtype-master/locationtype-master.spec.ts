import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LocationtypeMaster } from './locationtype-master';

describe('LocationtypeMaster', () => {
  let component: LocationtypeMaster;
  let fixture: ComponentFixture<LocationtypeMaster>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LocationtypeMaster]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LocationtypeMaster);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
