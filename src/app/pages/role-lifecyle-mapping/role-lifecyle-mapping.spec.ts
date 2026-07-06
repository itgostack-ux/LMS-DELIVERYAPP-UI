import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoleLifecyleMapping } from './role-lifecyle-mapping';

describe('RoleLifecyleMapping', () => {
  let component: RoleLifecyleMapping;
  let fixture: ComponentFixture<RoleLifecyleMapping>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoleLifecyleMapping]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoleLifecyleMapping);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
