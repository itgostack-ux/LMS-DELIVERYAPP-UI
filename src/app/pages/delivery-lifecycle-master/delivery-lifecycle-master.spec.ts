import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeliveryLifecycleMaster } from './delivery-lifecycle-master';

describe('DeliveryLifecycleMaster', () => {
  let component: DeliveryLifecycleMaster;
  let fixture: ComponentFixture<DeliveryLifecycleMaster>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeliveryLifecycleMaster]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DeliveryLifecycleMaster);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
