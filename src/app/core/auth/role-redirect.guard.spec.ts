import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { roleRedirectGuard } from './role-redirect.guard';
import { AuthService } from './auth.service';

const runGuard = (): UrlTree =>
  TestBed.runInInjectionContext(() =>
    roleRedirectGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  ) as UrlTree;

describe('roleRedirectGuard', () => {
  let userRole: ReturnType<typeof vi.fn>;
  let clearSessionAndRedirect: ReturnType<typeof vi.fn>;
  let parseUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    userRole = vi.fn();
    clearSessionAndRedirect = vi.fn();
    parseUrl = vi.fn().mockImplementation((url: string) => ({ url } as unknown as UrlTree));

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { userRole, clearSessionAndRedirect } },
        { provide: Router, useValue: { parseUrl, navigate: vi.fn() } },
      ],
    });
  });

  it('redirects admin to /admin/dashboard', () => {
    userRole.mockReturnValue('admin');
    runGuard();
    expect(parseUrl).toHaveBeenCalledWith('/admin/dashboard');
  });

  it('redirects patient to /patient/dashboard', () => {
    userRole.mockReturnValue('patient');
    runGuard();
    expect(parseUrl).toHaveBeenCalledWith('/patient/dashboard');
  });

  it('redirects doctor to /403 because the area is not yet implemented in the frontend', () => {
    userRole.mockReturnValue('doctor');
    runGuard();
    expect(parseUrl).toHaveBeenCalledWith('/403');
  });

  it('clears session and redirects to /login when the role is unknown (defensive)', () => {
    userRole.mockReturnValue(null);
    runGuard();
    expect(clearSessionAndRedirect).toHaveBeenCalled();
    expect(parseUrl).toHaveBeenCalledWith('/login');
  });
});
