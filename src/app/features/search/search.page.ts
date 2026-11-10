import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, map, startWith, switchMap, tap } from 'rxjs';
import { Food, SearchFilters } from '../../core/models/food.model';
import { FoodService } from '../../core/services/food.service';
import { MealService } from '../../core/services/meal.service';
import { ToastService } from '../../core/services/toast.service';
import { HIGH_CALCIUM_MIN, OXALATE_HIGH_MIN, OXALATE_LOW_MAX } from '../../core/utils/nutrition';
import { FoodCard } from '../../shared/components/food-card';
import { Icon } from '../../shared/components/icon';

@Component({
  selector: 'app-search-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FoodCard, Icon],
  template: `
    <section class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 px-5 py-8 text-white sm:px-8 sm:py-10">
      <div class="pointer-events-none absolute -top-16 -right-16 size-64 rounded-full bg-white/10 blur-3xl"></div>
      <div class="relative max-w-2xl">
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">Cerca un alimento</h1>
        <p class="mt-2 text-sm text-brand-100 sm:text-base">
          Ossalati, calcio, colesterolo e macronutrienti per 100 g o per porzione.
        </p>
        <form [formGroup]="form" class="mt-6" (submit)="$event.preventDefault()">
          <label for="q" class="sr-only">Nome dell'alimento</label>
          <div class="relative">
            <span class="pointer-events-none absolute inset-y-0 left-4 flex items-center text-stone-400">
              <app-icon name="search" />
            </span>
            <input
              id="q"
              type="search"
              formControlName="query"
              autocomplete="off"
              placeholder="es. spinaci, mandorle, parmigiano…"
              class="w-full rounded-2xl border-0 bg-white py-4 pr-4 pl-12 text-base text-stone-900 shadow-lg shadow-black/10 placeholder:text-stone-400 focus:ring-4 focus:ring-white/30 focus:outline-none dark:bg-stone-900 dark:text-white"
            />
          </div>
        </form>
      </div>
    </section>

    <section class="mt-5 flex flex-wrap items-center gap-2" [formGroup]="form" aria-label="Filtri rapidi">
      <label class="chip" [class.chip-active]="form.controls.lowOxalate.value">
        <input type="checkbox" class="sr-only" formControlName="lowOxalate" />
        <span class="size-2 rounded-full bg-emerald-500"></span> Basso ossalato (&lt;{{ lowMax }} mg)
      </label>
      <label class="chip" [class.chip-active]="form.controls.highCalcium.value">
        <input type="checkbox" class="sr-only" formControlName="highCalcium" />
        <span class="size-2 rounded-full bg-sky-500"></span> Alto calcio (&gt;{{ highCa }} mg)
      </label>
      <label class="chip" [class.chip-active]="form.controls.noCholesterol.value">
        <input type="checkbox" class="sr-only" formControlName="noCholesterol" />
        <span class="size-2 rounded-full bg-violet-500"></span> Senza colesterolo
      </label>

      <label for="cat" class="sr-only">Categoria</label>
      <select id="cat" formControlName="category" class="chip appearance-none pr-3">
        <option [ngValue]="null">Tutte le categorie</option>
        @for (c of categories(); track c) {
          <option [ngValue]="c">{{ c }}</option>
        }
      </select>

      <div class="ml-auto flex rounded-full border border-stone-300 p-0.5 text-xs dark:border-white/10" role="group" aria-label="Valori riferiti a">
        <button type="button" class="rounded-full px-3 py-1.5 font-medium transition" [class]="perPortion() ? 'text-stone-500' : 'bg-stone-900 text-white dark:bg-white dark:text-stone-900'" (click)="perPortion.set(false)">100 g</button>
        <button type="button" class="rounded-full px-3 py-1.5 font-medium transition" [class]="perPortion() ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900' : 'text-stone-500'" (click)="perPortion.set(true)">Porzione</button>
      </div>
    </section>

    <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
      <span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-emerald-500"></span>Basso &lt;{{ lowMax }} mg</span>
      <span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-amber-500"></span>Moderato {{ lowMax }}–{{ highMin - 1 }} mg</span>
      <span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-rose-500"></span>Alto ≥{{ highMin }} mg</span>
      <span class="ml-auto" aria-live="polite">
        @if (!loading()) { {{ results().length }} risultati }
      </span>
    </div>

    <section class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" [attr.aria-busy]="loading()">
      @if (loading() && results().length === 0) {
        @for (i of skeleton; track i) {
          <div class="card h-40 animate-pulse bg-stone-100 dark:bg-white/[0.03]"></div>
        }
      } @else {
        @for (food of results(); track food.id) {
          <app-food-card [food]="food" [perPortion]="perPortion()" (addToMeal)="addToMeal($event)" />
        } @empty {
          <div class="card col-span-full flex flex-col items-center gap-2 p-10 text-center">
            <app-icon name="leaf" [size]="32" class="text-stone-400" />
            <p class="font-medium">Nessun alimento trovato</p>
            <p class="text-sm text-stone-500 dark:text-stone-400">Prova un altro termine o rimuovi qualche filtro.</p>
          </div>
        }
      }
    </section>
  `,
})
export class SearchPage implements OnInit {
  private readonly foods = inject(FoodService);
  private readonly meal = inject(MealService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly lowMax = OXALATE_LOW_MAX;
  protected readonly highMin = OXALATE_HIGH_MIN;
  protected readonly highCa = HIGH_CALCIUM_MIN;
  protected readonly skeleton = [1, 2, 3, 4, 5, 6];

  protected readonly form = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    lowOxalate: new FormControl(false, { nonNullable: true }),
    highCalcium: new FormControl(false, { nonNullable: true }),
    noCholesterol: new FormControl(false, { nonNullable: true }),
    category: new FormControl<string | null>(null),
  });

  protected readonly perPortion = signal(false);
  protected readonly loading = signal(true);
  protected readonly categories = computed(() => this.foods.categories());

  protected readonly results = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue() satisfies SearchFilters),
      debounceTime(180),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      tap((filters) => {
        this.loading.set(true);
        this.syncUrl(filters);
      }),
      switchMap((filters) => this.foods.search(filters)),
      tap(() => this.loading.set(false)),
    ),
    { initialValue: [] as Food[] },
  );

  ngOnInit(): void {
    // Ripristina i filtri dall'URL (link condivisibili) e precarica il catalogo offline.
    const p = this.route.snapshot.queryParamMap;
    this.form.patchValue({
      query: p.get('q') ?? '',
      lowOxalate: p.get('ossalati') === 'bassi',
      highCalcium: p.get('calcio') === 'alto',
      noCholesterol: p.get('colesterolo') === 'zero',
      category: p.get('categoria'),
    });
    void this.foods.loadCatalog();
  }

  protected addToMeal(food: Food): void {
    this.meal.add(food);
    this.toast.success(`${food.name_it} aggiunto al pasto (${food.default_portion_g} g)`);
  }

  private syncUrl(f: SearchFilters): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        q: f.query || null,
        ossalati: f.lowOxalate ? 'bassi' : null,
        calcio: f.highCalcium ? 'alto' : null,
        colesterolo: f.noCholesterol ? 'zero' : null,
        categoria: f.category,
      },
    });
  }
}
