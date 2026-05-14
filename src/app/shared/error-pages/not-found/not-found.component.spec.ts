import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideRouter } from '@angular/router';
import { NotFoundComponent } from './not-found.component';

describe('NotFoundComponent', () => {
  let locationBack: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    locationBack = vi.fn();

    await TestBed.configureTestingModule({
      imports: [NotFoundComponent],
      providers: [
        provideRouter([]),
        { provide: Location, useValue: { back: locationBack } },
      ],
    }).compileComponents();
  });

  it('creates', () => {
    const fixture = TestBed.createComponent(NotFoundComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('calls Location.back() when goBack() is invoked', () => {
    const fixture = TestBed.createComponent(NotFoundComponent);
    const instance = fixture.componentInstance as unknown as { goBack: () => void };
    instance.goBack();
    expect(locationBack).toHaveBeenCalledTimes(1);
  });
});
