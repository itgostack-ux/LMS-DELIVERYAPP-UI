import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Administration } from './administration';

describe('Administration', () => {
  let component: Administration;
  let fixture: ComponentFixture<Administration>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Administration]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Administration);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
