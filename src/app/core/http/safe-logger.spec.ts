import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { SafeLogger } from './safe-logger';
import { environment } from '../../../environments/environment';

describe('SafeLogger', () => {
  let logger: SafeLogger;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  const originalProduction = environment.production;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    logger = TestBed.inject(SafeLogger);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    environment.production = originalProduction;
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('error()', () => {
    it('logs the full error object in development mode', () => {
      environment.production = false;
      const err = new HttpErrorResponse({
        status: 500,
        statusText: 'Server Error',
        url: '/api/v1/patients',
        error: { message: 'PHI: patient John Doe' },
      });

      logger.error('http', err);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('[http]', err);
    });

    it('sanitizes the error in production keeping only whitelisted fields', () => {
      environment.production = true;
      const err = new HttpErrorResponse({
        status: 500,
        statusText: 'Server Error',
        url: '/api/v1/patients',
        error: { message: 'PHI: patient John Doe' },
      });

      logger.error('http', err);

      const logged = consoleErrorSpy.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(logged).toMatchObject({
        status: 500,
        statusText: 'Server Error',
        url: '/api/v1/patients',
        name: 'HttpErrorResponse',
      });
      // PHI fields must NOT be present.
      expect(logged).not.toHaveProperty('error');
      expect(logged).not.toHaveProperty('message');
    });

    it('handles non-object errors gracefully in production', () => {
      environment.production = true;

      logger.error('scope', 'something went wrong');

      const logged = consoleErrorSpy.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(logged).toEqual({ value: '[non-object error]' });
    });

    it('handles null errors gracefully in production', () => {
      environment.production = true;

      logger.error('scope', null);

      const logged = consoleErrorSpy.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(logged).toEqual({ value: '[non-object error]' });
    });
  });

  describe('warn()', () => {
    it('logs the warning with the scope prefix', () => {
      logger.warn('http', 'Network error');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[http] Network error');
    });
  });
});
