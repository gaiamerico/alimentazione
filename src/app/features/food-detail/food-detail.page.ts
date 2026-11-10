import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Food, MEAL_TYPES, MealType } from '../../core/models/food.model';
import { AuthService } from '../../core/services/auth.service';
import { DiaryService } from '../../core/services/diary.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { FoodService } from '../../core/services/food.service';
import { MealService } from '../../core/services/meal.service';
import { ToastService } from '../../core/services/toast.service';
import { calciumOxalateBalance, emptyTotals, guessMeal, scaleNutrients, todayIso } from '../../core/utils/nutrition';
import { BalancePanel } from '../../shared/components/balance-panel';
import { Icon } from '../../shared/components/icon';
import { OxalateBadge } from '../../shared/components/oxalate-badge';

@Component({
  selector: 'app-food-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, ReactiveFormsModule, RouterLink, Icon, OxalateBadge, BalancePanel],
  template: `
    <a routerLink="/" class="btn-ghost -ml-3 mb-3 px-3 py-1.5 text-sm"><app-icon name="arrow-left" [size]="16" /> Torna alla ricerca</a>

    @if (loading()) {
      <div class="card h-64 animate-pulse bg-stone-100 dark:bg-white/[0.03]"></div>
    } @else if (food(); as f) {
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-brand-700 dark:text-brand-200">{{ f.category }}</p>
          <h1 class="page-title">{{ f.name_it }}</h1>
          @if (f.synonyms) {
            <p class="page-subtitle">Anche: {{ f.synonyms }}</p>
          }
        </div>
        <button
          type="button"
          class="btn-outline"
          [class.text-amber-500!]="isFavorite()"
          (click)="favorites.toggle(f)"
          [attr.aria-pressed]="isFavorite()"
        >
          <app-icon name="star" [size]="18" [filled]="isFavorite()" />
          {{ isFavorite() ? 'Nei preferiti' : 'Aggiungi ai preferiti' }}
        </button>
      </header>

      <div class="mt-6 grid gap-5 lg:grid-cols-[1fr_380px]">
        <div class="space-y-5">
          <!-- Quantità -->
          <section class="card p-5">
            <div class="flex flex-wrap items-end gap-3">
              <div class="w-36">
                <label class="label" for="grams">Quantità (g)</label>
                <input id="grams" type="number" inputmode="decimal" min="1" max="5000" class="input tabular-nums" [formControl]="gramsControl" />
              </div>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="chip" [class.chip-active]="grams() === 100" (click)="gramsControl.setValue(100)">100 g</button>
                <button type="button" class="chip" [class.chip-active]="grams() === f.default_portion_g" (click)="gramsControl.setValue(f.default_portion_g)">
                  {{ f.portion_label ?? 'Porzione' }} · {{ f.default_portion_g | number: '1.0-0' }} g
                </button>
              </div>
            </div>
            @if (gramsControl.invalid) {
              <p class="mt-2 text-sm text-rose-600">Inserisci una quantità tra 1 e 5000 g.</p>
            }
          </section>

          <!-- Tabella nutrienti -->
          <section class="card overflow-hidden">
            <header class="flex items-center justify-between border-b border-stone-200 px-5 py-3 dark:border-white/[0.06]">
              <h2 class="font-semibold">Valori nutrizionali</h2>
              <span class="text-sm text-stone-500 dark:text-stone-400 tabular-nums">per {{ grams() | number: '1.0-1' }} g</span>
            </header>
            <table class="w-full text-sm">
              <tbody class="divide-y divide-stone-100 dark:divide-white/[0.05]">
                <tr class="bg-stone-50/60 dark:bg-white/[0.02]">
                  <th scope="row" class="px-5 py-3 text-left font-medium">Ossalati</th>
                  <td class="px-5 py-3 text-right"><app-oxalate-badge [mg]="values().oxalate_mg" /></td>
                </tr>
                @for (row of rows(); track row.label) {
                  <tr>
                    <th scope="row" class="px-5 py-3 text-left font-normal text-stone-600 dark:text-stone-300" [class.pl-9]="row.sub">{{ row.label }}</th>
                    <td class="px-5 py-3 text-right font-semibold tabular-nums">{{ row.value | number: row.digits }} {{ row.unit }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </section>

          @if (f.notes) {
            <p class="card flex gap-3 p-4 text-sm"><app-icon name="info" class="text-brand-600" /> {{ f.notes }}</p>
          }

          <section class="text-xs leading-relaxed text-stone-500 dark:text-stone-400">
            <p><strong>Fonte nutrienti:</strong> {{ f.nutrient_source }}</p>
            <p><strong>Fonte ossalati:</strong> {{ f.oxalate_source }} · affidabilità stima: <strong>{{ f.oxalate_confidence }}</strong></p>
            <p class="mt-1">Il contenuto di ossalati varia sensibilmente per varietà, maturazione, terreno e cottura: i valori sono indicativi.</p>
          </section>
        </div>

        <aside class="space-y-5">
          <app-balance-panel [balance]="balance()" heading="Questo alimento da solo" />

          <section class="card space-y-3 p-5">
            <h2 class="font-semibold">Aggiungi</h2>
            <button type="button" class="btn-outline w-full" [disabled]="gramsControl.invalid" (click)="addToMeal(f)">
              <app-icon name="scale" [size]="18" /> Al pasto da bilanciare
            </button>

            @if (auth.isLoggedIn()) {
              <form [formGroup]="diaryForm" (ngSubmit)="addToDiary(f)" class="space-y-3 border-t border-stone-200 pt-3 dark:border-white/[0.06]">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="label" for="meal">Pasto</label>
                    <select id="meal" class="input" formControlName="meal">
                      @for (m of mealTypes; track m.value) {
                        <option [value]="m.value">{{ m.label }}</option>
                      }
                    </select>
                  </div>
                  <div>
                    <label class="label" for="date">Data</label>
                    <input id="date" type="date" class="input" formControlName="date" />
                  </div>
                </div>
                <button type="submit" class="btn-primary w-full" [disabled]="diaryForm.invalid || gramsControl.invalid || saving()">
                  <app-icon name="book" [size]="18" /> Al diario
                </button>
              </form>
            } @else {
              <p class="text-sm text-stone-500 dark:text-stone-400">
                <a routerLink="/accedi" class="font-medium text-brand-700 underline dark:text-brand-200">Accedi</a> per salvarlo nel tuo diario.
              </p>
            }
          </section>
        </aside>
      </div>
    } @else {
      <div class="card p-10 text-center">
        <p class="font-medium">Alimento non trovato</p>
        <a routerLink="/" class="btn-primary mt-4">Torna alla ricerca</a>
      </div>
    }
  `,
})
export class FoodDetailPage {
  private readonly foods = inject(FoodService);
  private readonly meal = inject(MealService);
  private readonly diary = inject(DiaryService);
  private readonly toast = inject(ToastService);
  protected readonly favorites = inject(FavoritesService);
  protected readonly auth = inject(AuthService);

  /** Parametro di rotta `:id` (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly mealTypes = MEAL_TYPES;
  protected readonly food = signal<Food | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  protected readonly gramsControl = new FormControl(100, {
    nonNullable: true,
    validators: [Validators.required, Validators.min(1), Validators.max(5000)],
  });
  private readonly gramsValue = toSignal(this.gramsControl.valueChanges, { initialValue: 100 });
  protected readonly grams = computed(() => Number(this.gramsValue()) || 0);

  protected readonly diaryForm = new FormGroup({
    meal: new FormControl<MealType>(guessMeal(), { nonNullable: true }),
    date: new FormControl(todayIso(), { nonNullable: true, validators: [Validators.required] }),
  });

  protected readonly values = computed(() => {
    const f = this.food();
    return f ? scaleNutrients(f, this.grams()) : emptyTotals();
  });
  protected readonly balance = computed(() => {
    const v = this.values();
    return calciumOxalateBalance(v.calcium_mg, v.oxalate_mg);
  });
  protected readonly isFavorite = computed(() => {
    const f = this.food();
    return f ? this.favorites.ids().has(f.id) : false;
  });

  protected readonly rows = computed(() => {
    const v = this.values();
    return [
      { label: 'Energia', value: v.kcal, unit: 'kcal', digits: '1.0-0', sub: false },
      { label: 'Proteine', value: v.protein_g, unit: 'g', digits: '1.1-1', sub: false },
      { label: 'Carboidrati', value: v.carbs_g, unit: 'g', digits: '1.1-1', sub: false },
      { label: 'di cui fibre', value: v.fiber_g, unit: 'g', digits: '1.1-1', sub: true },
      { label: 'Grassi', value: v.fat_g, unit: 'g', digits: '1.1-1', sub: false },
      { label: 'Calcio', value: v.calcium_mg, unit: 'mg', digits: '1.0-0', sub: false },
      { label: 'Colesterolo', value: v.cholesterol_mg, unit: 'mg', digits: '1.0-0', sub: false },
    ];
  });

  constructor() {
    effect(() => {
      const id = Number(this.id());
      this.loading.set(true);
      void this.foods.getById(id).then((f) => {
        this.food.set(f);
        this.loading.set(false);
        if (f) this.gramsControl.setValue(f.default_portion_g);
      });
    });
  }

  protected addToMeal(food: Food): void {
    this.meal.add(food, this.grams());
    this.toast.success(`${food.name_it} aggiunto al pasto`);
  }

  protected async addToDiary(food: Food): Promise<void> {
    if (this.diaryForm.invalid || this.gramsControl.invalid) return;
    this.saving.set(true);
    const { meal, date } = this.diaryForm.getRawValue();
    await this.diary.add(food.id, this.grams(), meal, date);
    this.saving.set(false);
  }
}

