import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { firstValueFrom, isObservable, Observable, of, throwError } from 'rxjs';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthResponse } from '../models/auth.models';

const runGuard = () =>
  TestBed.runInInjectionContext(() =>
    authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );

describe('authGuard', () => {
  let isAuthenticated: ReturnType<typeof vi.fn>;
  let refresh: ReturnType<typeof vi.fn>;
  let routerNavigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    isAuthenticated = vi.fn().mockReturnValue(false);
    refresh = vi.fn();
    routerNavigate = vi.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { isAuthenticated, refresh } },
        { provide: Router, useValue: { navigate: routerNavigate } },
      ],
    });
  });

  it('returns true immediately when the user is already authenticated', () => {
    isAuthenticated.mockReturnValue(true);

    const result = runGuard();

    expect(result).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
    expect(routerNavigate).not.toHaveBeenCalled();
  });

  it('returns true after a successful silent refresh', async () => {
    isAuthenticated.mockReturnValue(false);
    refresh.mockReturnValue(
      of<AuthResponse>({
        accessToken: 'fresh',
        user: { id: 'u1', email: 'a@b.com', role: 'patient' },
      }),
    );

    const result = runGuard();
    expect(isObservable(result)).toBe(true);
    const value = await firstValueFrom(result as Observable<boolean>);

    expect(value).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(routerNavigate).not.toHaveBeenCalled();
  });

  it('navigates to /login and returns false when refresh fails', async () => {
    isAuthenticated.mockReturnValue(false);
    refresh.mockReturnValue(throwError(() => new Error('refresh failed')));

    const result = runGuard();
    const value = await firstValueFrom(result as Observable<boolean>);

    expect(value).toBe(false);
    expect(routerNavigate).toHaveBeenCalledWith(['/login']);
  });
});
