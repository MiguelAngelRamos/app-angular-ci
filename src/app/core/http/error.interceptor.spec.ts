import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { errorInterceptor } from './error.interceptor';
import { SafeLogger } from './safe-logger';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpController: HttpTestingController;
  let routerNavigate: ReturnType<typeof vi.fn>;
  let loggerError: ReturnType<typeof vi.fn>;
  let loggerWarn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    routerNavigate = vi.fn().mockResolvedValue(true);
    loggerError = vi.fn();
    loggerWarn = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: routerNavigate } },
        { provide: SafeLogger, useValue: { error: loggerError, warn: loggerWarn } },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpController.verify());

  it('does not interfere with successful responses', () => {
    let received: unknown = null;
    http.get('/api/v1/me').subscribe(r => (received = r));

    httpController.expectOne('/api/v1/me').flush({ ok: true });

    expect(received).toEqual({ ok: true });
    expect(routerNavigate).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it('navigates to /403 on a 403 response and rethrows the error', () => {
    const captured: { error: HttpErrorResponse | null } = { error: null };
    http.get('/api/v1/admin/users').subscribe({
      error: (e: HttpErrorResponse) => (captured.error = e),
    });

    httpController
      .expectOne('/api/v1/admin/users')
      .flush({}, { status: 403, statusText: 'Forbidden' });

    expect(routerNavigate).toHaveBeenCalledWith(['/403']);
    expect(captured.error?.status).toBe(403);
  });

  it('logs a network warning on status 0 (no server reachable)', () => {
    http.get('/api/v1/ping').subscribe({ error: () => {} });

    httpController
      .expectOne('/api/v1/ping')
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect(loggerWarn).toHaveBeenCalledWith('http', expect.stringContaining('Error de red'));
    // Importante: NO se loguea la URL exacta en el mensaje (defensa H-06).
    const warnArg = loggerWarn.mock.calls[0]?.[1] as string;
    expect(warnArg).not.toContain('/api/v1/ping');
  });

  it('logs server errors through SafeLogger.error on 5xx responses', () => {
    http.get('/api/v1/crash').subscribe({ error: () => {} });

    httpController
      .expectOne('/api/v1/crash')
      .flush({}, { status: 500, statusText: 'Server Error' });

    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith('http', expect.anything());
  });

  it('does not navigate or log on a plain 400/404', () => {
    http.get('/api/v1/missing').subscribe({ error: () => {} });

    httpController
      .expectOne('/api/v1/missing')
      .flush({}, { status: 404, statusText: 'Not Found' });

    expect(routerNavigate).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
    expect(loggerWarn).not.toHaveBeenCalled();
  });
});
