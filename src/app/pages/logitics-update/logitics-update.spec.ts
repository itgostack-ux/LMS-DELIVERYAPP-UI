import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LogiticsUpdate } from './logitics-update';

describe('LogiticsUpdate', () => {
  let component: LogiticsUpdate;
  let fixture: ComponentFixture<LogiticsUpdate>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LogiticsUpdate]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LogiticsUpdate);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
