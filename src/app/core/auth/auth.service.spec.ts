import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { AuthResponse } from '../../core/models/auth.models';

const buildAuthResponse = (overrides: Partial<AuthResponse> = {}): AuthResponse => ({
  accessToken: 'access-token-abc',
  user: { id: 'user-1', email: 'test@test.com', role: 'patient' },
  ...overrides,
});

describe('AuthService', () => {
  let authService: AuthService;
  let httpController: HttpTestingController;
  let routerNavigateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    routerNavigateSpy = vi.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: routerNavigateSpy } },
      ],
    });

    authService = TestBed.inject(AuthService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpController.verify();
  });

  describe('initial state', () => {
    it('starts unauthenticated with no token, no user, no role', () => {
      expect(authService.isAuthenticated()).toBe(false);
      expect(authService.accessToken$()).toBeNull();
      expect(authService.currentUser$()).toBeNull();
      expect(authService.userRole()).toBeNull();
      expect(authService.isAdmin()).toBe(false);
      expect(authService.isDoctor()).toBe(false);
      expect(authService.isPatient()).toBe(false);
      expect(authService.isResfreshing()).toBe(false);
    });
  });

  describe('login()', () => {
    it('POSTs credentials with credentials and populates the session on success', () => {
      const response = buildAuthResponse({
        user: { id: 'u-1', email: 'admin@test.com', role: 'admin' },
      });

      let received: AuthResponse | null = null;
      authService.login('admin@test.com', 'pwd12345').subscribe(r => (received = r));

      const req = httpController.expectOne('/api/v1/auth/login');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'admin@test.com', password: 'pwd12345' });
      expect(req.request.withCredentials).toBe(true);
      req.flush(response);

      expect(received).toEqual(response);
      expect(authService.isAuthenticated()).toBe(true);
      expect(authService.accessToken$()).toBe('access-token-abc');
      expect(authService.userRole()).toBe('admin');
      expect(authService.isAdmin()).toBe(true);
      expect(authService.isPatient()).toBe(false);
    });

    it('does NOT touch the session if the login HTTP call errors', () => {
      authService.login('a@b.com', 'pwd12345').subscribe({ error: () => {} });

      httpController
        .expectOne('/api/v1/auth/login')
        .flush({ message: 'invalid' }, { status: 401, statusText: 'Unauthorized' });

      expect(authService.isAuthenticated()).toBe(false);
      expect(authService.accessToken$()).toBeNull();
    });
  });

  describe('register()', () => {
    it('POSTs to /auth/register and populates the session on success', () => {
      const response = buildAuthResponse();

      authService.register('new@test.com', 'pwd12345').subscribe();

      const req = httpController.expectOne('/api/v1/auth/register');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'new@test.com', password: 'pwd12345' });
      expect(req.request.withCredentials).toBe(true);
      req.flush(response);

      expect(authService.isAuthenticated()).toBe(true);
      expect(authService.currentUser$()?.email).toBe('test@test.com');
    });
  });

  describe('refresh()', () => {
    it('POSTs to /auth/refresh and updates the session', () => {
      const response = buildAuthResponse({ accessToken: 'fresh-token' });

      let received: AuthResponse | null = null;
      authService.refresh().subscribe(r => (received = r));

      // Mientras la peticion esta en vuelo, el flag isRefreshing debe ser true.
      expect(authService.isResfreshing()).toBe(true);

      const req = httpController.expectOne('/api/v1/auth/refresh');
      expect(req.request.method).toBe('POST');
      expect(req.request.withCredentials).toBe(true);
      req.flush(response);

      expect(received).toEqual(response);
      expect(authService.accessToken$()).toBe('fresh-token');
      // Una vez completa, el flag debe volver a false.
      expect(authService.isResfreshing()).toBe(false);
    });

    it('shares a single in-flight HTTP request across concurrent subscribers (shareReplay)', () => {
      // Dos llamadas concurrentes deben colgarse del mismo POST /auth/refresh
      // — H-02 en authInterceptor depende de esto para evitar revocación.
      const subA = authService.refresh().subscribe();
      const subB = authService.refresh().subscribe();

      const req = httpController.expectOne('/api/v1/auth/refresh');
      req.flush(buildAuthResponse({ accessToken: 'shared-token' }));

      expect(authService.accessToken$()).toBe('shared-token');
      subA.unsubscribe();
      subB.unsubscribe();
    });

    it('clears isRefreshing flag and allows another refresh after the request errors', () => {
      authService.refresh().subscribe({ error: () => {} });

      httpController
        .expectOne('/api/v1/auth/refresh')
        .flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });

      expect(authService.isResfreshing()).toBe(false);

      // Un segundo refresh debe disparar una NUEVA peticion (no reusar la anterior).
      authService.refresh().subscribe({ error: () => {} });
      httpController
        .expectOne('/api/v1/auth/refresh')
        .flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    });
  });

  describe('logout()', () => {
    it('clears session immediately and redirects when there is no token', () => {
      authService.logout().subscribe();

      expect(authService.accessToken$()).toBeNull();
      expect(authService.currentUser$()).toBeNull();
      expect(routerNavigateSpy).toHaveBeenCalledWith(['/login']);
      // No HTTP call expected since there was no token.
      httpController.expectNone('/api/v1/auth/logout');
    });

    it('POSTs to /auth/logout with the Bearer token and clears the session on success', () => {
      // Establecer una sesion primero.
      authService.login('a@b.com', 'pwd12345').subscribe();
      httpController.expectOne('/api/v1/auth/login').flush(buildAuthResponse());

      routerNavigateSpy.mockClear();

      authService.logout().subscribe();

      const req = httpController.expectOne('/api/v1/auth/logout');
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Authorization')).toBe('Bearer access-token-abc');
      expect(req.request.withCredentials).toBe(true);
      req.flush({});

      expect(authService.accessToken$()).toBeNull();
      expect(authService.currentUser$()).toBeNull();
      expect(routerNavigateSpy).toHaveBeenCalledWith(['/login']);
    });

    it('clears the session even when the backend call to /auth/logout fails', () => {
      authService.login('a@b.com', 'pwd12345').subscribe();
      httpController.expectOne('/api/v1/auth/login').flush(buildAuthResponse());

      routerNavigateSpy.mockClear();

      authService.logout().subscribe();

      httpController
        .expectOne('/api/v1/auth/logout')
        .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(authService.accessToken$()).toBeNull();
      expect(authService.currentUser$()).toBeNull();
      expect(routerNavigateSpy).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('clearSessionAndRedirect()', () => {
    it('wipes signals and navigates to /login', () => {
      authService.login('a@b.com', 'pwd12345').subscribe();
      httpController.expectOne('/api/v1/auth/login').flush(buildAuthResponse());

      routerNavigateSpy.mockClear();
      authService.clearSessionAndRedirect();

      expect(authService.accessToken$()).toBeNull();
      expect(authService.currentUser$()).toBeNull();
      expect(authService.isAuthenticated()).toBe(false);
      expect(routerNavigateSpy).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('role computed signals', () => {
    it('reflects admin role correctly', () => {
      authService.login('a@b.com', 'pwd12345').subscribe();
      httpController
        .expectOne('/api/v1/auth/login')
        .flush(buildAuthResponse({ user: { id: 'a', email: 'a@b.com', role: 'admin' } }));

      expect(authService.isAdmin()).toBe(true);
      expect(authService.isDoctor()).toBe(false);
      expect(authService.isPatient()).toBe(false);
    });

    it('reflects doctor role correctly', () => {
      authService.login('a@b.com', 'pwd12345').subscribe();
      httpController
        .expectOne('/api/v1/auth/login')
        .flush(buildAuthResponse({ user: { id: 'd', email: 'd@b.com', role: 'doctor' } }));

      expect(authService.isAdmin()).toBe(false);
      expect(authService.isDoctor()).toBe(true);
      expect(authService.isPatient()).toBe(false);
    });
  });
});
