import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TrackManifestLevel } from './track-manifest-level';

describe('TrackManifestLevel', () => {
  let component: TrackManifestLevel;
  let fixture: ComponentFixture<TrackManifestLevel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrackManifestLevel]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TrackManifestLevel);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
