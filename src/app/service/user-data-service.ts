import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class UserDataService {

  private readonly USER_KEY = 'currentUser';

  constructor() { }

  // Save User
  setUser(user: any): void {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  // Get User
  getUser(): any {
    const user = localStorage.getItem(this.USER_KEY);
    return user ? JSON.parse(user) : null;
  }

  // Get Token
  getToken(): string {
    const user = this.getUser();
    return user?.token ?? '';
  }

  // Get User Id
  getUserId(): number {
    const user = this.getUser();
    return user?.userId ?? 0;
  }

  // Get User Name
  getUserName(): string {
    const user = this.getUser();
    return user?.userName ?? '';
  }

  // Get Role
  getUserRole(): string {
    const user = this.getUser();
    return user?.roleName ?? '';
  }

  // Check Login
  isLoggedIn(): boolean {
    return this.getUser() != null;
  }

  // Logout
  clearUser(): void {
    localStorage.removeItem(this.USER_KEY);
  }
}