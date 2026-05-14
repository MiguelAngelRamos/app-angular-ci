import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { rolesGuard } from './roles.guard';
import { AuthService } from './auth.service';
import { UserRole } from '../models/auth.models';

const runGuardWith = (allowed: readonly UserRole[]) =>
  TestBed.runInInjectionContext(() =>
    rolesGuard(allowed)({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );

describe('rolesGuard', () => {
  let userRole: ReturnType<typeof vi.fn>;
  let routerNavigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    userRole = vi.fn();
    routerNavigate = vi.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { userRole } },
        { provide: Router, useValue: { navigate: routerNavigate } },
      ],
    });
  });

  it('returns true when the current role is in the allowed list', () => {
    userRole.mockReturnValue('admin');

    expect(runGuardWith(['admin'])).toBe(true);
    expect(routerNavigate).not.toHaveBeenCalled();
  });

  it('navigates to /login and returns false when there is no role (not authenticated)', () => {
    userRole.mockReturnValue(null);

    expect(runGuardWith(['admin'])).toBe(false);
    expect(routerNavigate).toHaveBeenCalledWith(['/login']);
  });

  it('navigates to /403 with skipLocationChange when authenticated but lacks permission', () => {
    userRole.mockReturnValue('patient');

    expect(runGuardWith(['admin'])).toBe(false);
    expect(routerNavigate).toHaveBeenCalledWith(['/403'], { skipLocationChange: true });
  });

  it('accepts multiple allowed roles', () => {
    userRole.mockReturnValue('doctor');

    expect(runGuardWith(['admin', 'doctor'])).toBe(true);
    expect(routerNavigate).not.toHaveBeenCalled();
  });
});
