import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TranferOrderView } from './tranfer-order-view';

describe('TranferOrderView', () => {
  let component: TranferOrderView;
  let fixture: ComponentFixture<TranferOrderView>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranferOrderView]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TranferOrderView);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
