import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { DashboardService } from './dashboard.service';
import {
  AdminDashboardData,
  PatientDashboardData,
} from '../../core/models/dashboard.models';
import { environment } from '../../../environments/environment';

describe('DashboardService', () => {
  let service: DashboardService;
  let httpController: HttpTestingController;
  const endpoint = `${environment.apiBaseUrl}/dashboard`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DashboardService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpController.verify());

  it('GETs the dashboard endpoint and returns the discriminated payload (admin)', () => {
    const payload: AdminDashboardData = {
      role: 'admin',
      users: { total: 10, byRole: { admin: 1, doctor: 2, patient: 7 } },
      appointments: { total: 20, today: 3, byStatus: { confirmed: 15 } },
      doctors: { total: 2 },
      patients: { total: 7 },
      specialties: { total: 4 },
    };

    let received: unknown = null;
    service.getDashboard().subscribe(data => (received = data));

    const req = httpController.expectOne(endpoint);
    expect(req.request.method).toBe('GET');
    req.flush(payload);

    expect(received).toEqual(payload);
  });

  it('typed getAdminDashboard hits the same endpoint', () => {
    service.getAdminDashboard().subscribe();
    const req = httpController.expectOne(endpoint);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('typed getPatientDashboard hits the same endpoint and surfaces patient payload', () => {
    const payload: PatientDashboardData = {
      role: 'patient',
      appointments: { next: null, upcoming: [], pastCount: 0, total: 0 },
    };

    let received: PatientDashboardData | null = null;
    service.getPatientDashboard().subscribe(d => (received = d));

    const req = httpController.expectOne(endpoint);
    expect(req.request.method).toBe('GET');
    req.flush(payload);

    expect(received).toEqual(payload);
  });

  it('propagates HTTP errors instead of swallowing them', () => {
    let receivedStatus: number | null = null;
    service.getDashboard().subscribe({
      error: err => (receivedStatus = err.status),
    });

    httpController.expectOne(endpoint).flush({}, { status: 500, statusText: 'Server Error' });

    expect(receivedStatus).toBe(500);
  });
});
