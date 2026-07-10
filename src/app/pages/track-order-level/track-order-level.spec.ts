import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TrackOrderLevel } from './track-order-level';

describe('TrackOrderLevel', () => {
  let component: TrackOrderLevel;
  let fixture: ComponentFixture<TrackOrderLevel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrackOrderLevel]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TrackOrderLevel);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
