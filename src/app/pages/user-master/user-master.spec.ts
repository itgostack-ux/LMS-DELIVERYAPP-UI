import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserMaster } from './user-master';

describe('UserMaster', () => {
  let component: UserMaster;
  let fixture: ComponentFixture<UserMaster>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserMaster]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UserMaster);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
