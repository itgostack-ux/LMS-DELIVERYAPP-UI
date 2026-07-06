import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoleMaster } from './role-master';

describe('RoleMaster', () => {
  let component: RoleMaster;
  let fixture: ComponentFixture<RoleMaster>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoleMaster]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoleMaster);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
