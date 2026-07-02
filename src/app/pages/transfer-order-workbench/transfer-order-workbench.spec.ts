import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TransferOrderWorkbench } from './transfer-order-workbench';

describe('TransferOrderWorkbench', () => {
  let component: TransferOrderWorkbench;
  let fixture: ComponentFixture<TransferOrderWorkbench>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TransferOrderWorkbench]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TransferOrderWorkbench);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
