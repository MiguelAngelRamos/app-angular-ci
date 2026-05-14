import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { AuthResponse } from '../models/auth.models';

type AuthServiceStub = {
  accessToken$: () => string | null;
  isRefreshing$: BehaviorSubject<boolean>;
  isResfreshing: () => boolean;
  refresh: () => Observable<AuthResponse>;
  clearSessionAndRedirect: () => void;
};

const buildResponse = (token = 'fresh'): AuthResponse => ({
  accessToken: token,
  user: { id: 'u1', email: 'a@b.com', role: 'patient' },
});

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpController: HttpTestingController;
  let authStub: AuthServiceStub;
  let currentToken: string | null;

  beforeEach(() => {
    currentToken = 'token-1';
    const isRefreshing$ = new BehaviorSubject<boolean>(false);

    authStub = {
      accessToken$: () => currentToken,
      isRefreshing$,
      isResfreshing: () => isRefreshing$.getValue(),
      refresh: vi.fn(() => of(buildResponse('token-2'))),
      clearSessionAndRedirect: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authStub },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpController.verify());

  it('attaches Authorization Bearer header when a token is present', () => {
    http.get('/api/v1/me').subscribe();

    const req = httpController.expectOne('/api/v1/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-1');
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it('does NOT attach Authorization when there is no token but keeps withCredentials true', () => {
    currentToken = null;
    http.get('/api/v1/public').subscribe();

    const req = httpController.expectOne('/api/v1/public');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it('on 401 for a non-auth endpoint: triggers refresh and retries the original request', () => {
    const result: { value: unknown } = { value: null };
    http.get('/api/v1/dashboard').subscribe(r => (result.value = r));

    const first = httpController.expectOne('/api/v1/dashboard');
    expect(first.request.headers.get('Authorization')).toBe('Bearer token-1');
    currentToken = 'token-2';
    first.flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    const retry = httpController.expectOne('/api/v1/dashboard');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer token-2');
    retry.flush({ data: 'ok' });

    expect(authStub.refresh).toHaveBeenCalledTimes(1);
    expect(result.value).toEqual({ data: 'ok' });
  });

  it('on 401 for an /auth/ endpoint: does NOT trigger refresh and propagates the error', () => {
    const captured: { error: HttpErrorResponse | null } = { error: null };
    http.post('/api/v1/auth/login', { email: 'a@b.com', password: 'x' }).subscribe({
      error: (e: HttpErrorResponse) => (captured.error = e),
    });

    httpController
      .expectOne('/api/v1/auth/login')
      .flush({ message: 'invalid' }, { status: 401, statusText: 'Unauthorized' });

    expect(authStub.refresh).not.toHaveBeenCalled();
    expect(captured.error?.status).toBe(401);
  });

  it('when refresh itself fails: clears session and propagates the error', () => {
    authStub.refresh = vi.fn(() => throwError(() => new Error('refresh failed')));

    const captured: { error: unknown } = { error: null };
    http.get('/api/v1/protected').subscribe({ error: e => (captured.error = e) });

    httpController
      .expectOne('/api/v1/protected')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(authStub.clearSessionAndRedirect).toHaveBeenCalled();
    expect(captured.error).toBeInstanceOf(Error);
  });

  it('when a refresh is already in flight, queues the new request until it completes', () => {
    authStub.isRefreshing$.next(true);

    const flags: { completed: boolean } = { completed: false };
    http.get('/api/v1/data').subscribe(() => (flags.completed = true));

    httpController.expectNone('/api/v1/data');

    currentToken = 'fresh-after-refresh';
    authStub.isRefreshing$.next(false);

    const req = httpController.expectOne('/api/v1/data');
    expect(req.request.headers.get('Authorization')).toBe('Bearer fresh-after-refresh');
    req.flush({});

    expect(flags.completed).toBe(true);
  });

  it('does NOT queue when the request is an /auth/ endpoint, even if a refresh is in flight', () => {
    authStub.isRefreshing$.next(true);

    http.post('/api/v1/auth/login', {}).subscribe();

    const req = httpController.expectOne('/api/v1/auth/login');
    req.flush({});
  });

  it('propagates non-401 errors without attempting a refresh', () => {
    const captured: { error: HttpErrorResponse | null } = { error: null };
    http.get('/api/v1/something').subscribe({
      error: (e: HttpErrorResponse) => (captured.error = e),
    });

    httpController
      .expectOne('/api/v1/something')
      .flush({}, { status: 500, statusText: 'Server Error' });

    expect(authStub.refresh).not.toHaveBeenCalled();
    expect(captured.error?.status).toBe(500);
  });
});
