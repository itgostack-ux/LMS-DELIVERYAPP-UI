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

  clearUser(): void {
    localStorage.removeItem(this.USER_KEY);
  }

  isLoggedIn(): boolean {

    return this.getUser() != null;

  }

}