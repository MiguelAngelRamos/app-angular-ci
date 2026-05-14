import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, ParamMap, Router, RouterStateSnapshot } from '@angular/router';
import { uuidParamsGuard } from './uuid-params.guard';

const buildRouteWithParam = (value: string | null, paramName = 'id'): ActivatedRouteSnapshot => {
  const map: ParamMap = {
    has: key => key === paramName && value !== null,
    get: key => (key === paramName ? value : null),
    getAll: () => (value !== null ? [value] : []),
    keys: value !== null ? [paramName] : [],
  };
  return { paramMap: map } as unknown as ActivatedRouteSnapshot;
};

const runGuardForParam = (paramValue: string | null, paramName?: string) =>
  TestBed.runInInjectionContext(() =>
    uuidParamsGuard(paramName)(buildRouteWithParam(paramValue, paramName ?? 'id'), {} as RouterStateSnapshot),
  );

describe('uuidParamsGuard', () => {
  let routerNavigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    routerNavigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { navigate: routerNavigate } }],
    });
  });

  it('returns true when the param is absent — routing config is responsible for required params', () => {
    expect(runGuardForParam(null)).toBe(true);
    expect(routerNavigate).not.toHaveBeenCalled();
  });

  it('returns true for a canonical UUID v4 (lowercase)', () => {
    expect(runGuardForParam('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('accepts UUID v4 in uppercase (regex is case-insensitive)', () => {
    expect(runGuardForParam('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('rejects a UUID v1 (wrong version digit)', () => {
    expect(runGuardForParam('550e8400-e29b-11d4-a716-446655440000')).toBe(false);
    expect(routerNavigate).toHaveBeenCalledWith(['/404'], { skipLocationChange: true });
  });

  it('rejects an obviously malformed string (sql-injection style)', () => {
    expect(runGuardForParam("1' OR '1'='1")).toBe(false);
    expect(routerNavigate).toHaveBeenCalledWith(['/404'], { skipLocationChange: true });
  });

  it('rejects a string that looks like a UUID but has wrong variant bits', () => {
    // Variant digit must be in [89ab]; here it is "c" (1100 binary) which is invalid for v4.
    expect(runGuardForParam('550e8400-e29b-41d4-c716-446655440000')).toBe(false);
    expect(routerNavigate).toHaveBeenCalledWith(['/404'], { skipLocationChange: true });
  });

  it('rejects a numeric id (the most common legacy/abuse case)', () => {
    expect(runGuardForParam('42')).toBe(false);
    expect(routerNavigate).toHaveBeenCalledWith(['/404'], { skipLocationChange: true });
  });

  it('supports a custom param name', () => {
    expect(runGuardForParam('550e8400-e29b-41d4-a716-446655440000', 'patientId')).toBe(true);
  });
});
