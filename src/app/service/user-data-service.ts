import { Injectable } from '@angular/core';
import { UserDetails } from '../services/models/common-master-model';

@Injectable({
  providedIn: 'root'
})
export class UserDataService {

  private readonly USER_KEY = 'currentUser';

  setUser(user: UserDetails): void {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  getUser(): UserDetails | null {

    const user = localStorage.getItem(this.USER_KEY);

    return user ? JSON.parse(user) : null;

  }

  getUserId(): number {
    return this.getUser()?.userId ?? 0;
  }

  getUserName(): string {
    return this.getUser()?.userName ?? '';
  }

  getRoleId(): number {
    return this.getUser()?.userProjectAccessList?.[0]?.roleId ?? 0;
  }

  getRoleName(): string {
    return this.getUser()?.userProjectAccessList?.[0]?.roleName ?? '';
  }


  clearUser(): void {
    localStorage.removeItem(this.USER_KEY);
  }

  isLoggedIn(): boolean {
    return this.getUser() != null;
  }

}