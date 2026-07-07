import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManifestPrint } from './manifest-print';

describe('ManifestPrint', () => {
  let component: ManifestPrint;
  let fixture: ComponentFixture<ManifestPrint>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManifestPrint]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManifestPrint);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
