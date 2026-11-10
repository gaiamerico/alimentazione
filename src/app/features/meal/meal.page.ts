import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Food, MEAL_TYPES, MealType } from '../../core/models/food.model';
import { AuthService } from '../../core/services/auth.service';
import { DiaryService } from '../../core/services/diary.service';
import { MealService } from '../../core/services/meal.service';
import { guessMeal, scaleNutrients, todayIso } from '../../core/utils/nutrition';
import { BalancePanel } from '../../shared/components/balance-panel';
import { FoodPicker } from '../../shared/components/food-picker';
import { Icon } from '../../shared/components/icon';
import { NutrientSummary } from '../../shared/components/nutrient-summary';
import { OxalateBadge } from '../../shared/components/oxalate-badge';

@Component({
  selector: 'app-meal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, ReactiveFormsModule, RouterLink, BalancePanel, FoodPicker, Icon, NutrientSummary, OxalateBadge],
  template: `
    <header class="mb-6">
      <h1 class="page-title">Bilancio pasto</h1>
      <p class="page-subtitle">
        Componi un pasto e verifica se il calcio presente basta a legare gli ossalati nell'intestino.
      </p>
    </header>

    <div class="grid gap-5 lg:grid-cols-[1fr_400px]">
      <div class="space-y-5">
        <section class="card p-5">
          <app-food-picker (picked)="add($event)" />

          @if (meal.items().length === 0) {
            <div class="flex flex-col items-center gap-2 py-12 text-center">
              <span class="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
                <app-icon name="scale" [size]="24" />
              </span>
              <p class="font-medium">Il pasto è vuoto</p>
              <p class="max-w-sm text-sm text-stone-500 dark:text-stone-400">
                Cerca un alimento qui sopra oppure usa il pulsante “Pasto” nei risultati di ricerca.
              </p>
            </div>
          } @else {
            <ul class="mt-4 divide-y divide-stone-100 dark:divide-white/[0.05]">
              @for (item of meal.items(); track item.food.id) {
                @let v = scaled(item.food, item.grams);
                <li class="flex flex-wrap items-center gap-3 py-3">
                  <div class="min-w-0 flex-1">
                    <a [routerLink]="['/alimento', item.food.id]" class="block truncate font-medium hover:text-brand-700 dark:hover:text-brand-200">{{ item.food.name_it }}</a>
                    <p class="text-xs text-stone-500 tabular-nums dark:text-stone-400">
                      Ca {{ v.calcium_mg | number: '1.0-0' }} mg · {{ v.kcal | number: '1.0-0' }} kcal · Col. {{ v.cholesterol_mg | number: '1.0-0' }} mg
                    </p>
                  </div>
                  <app-oxalate-badge [mg]="v.oxalate_mg" [showLabel]="false" />
                  <div class="flex items-center gap-1">
                    <button type="button" class="btn-ghost size-9 p-0" (click)="step(item.food.id, item.grams, -10)" aria-label="Diminuisci di 10 g">
                      <app-icon name="minus" [size]="16" />
                    </button>
                    <label class="sr-only" [for]="'g-' + item.food.id">Grammi di {{ item.food.name_it }}</label>
                    <input
                      [id]="'g-' + item.food.id"
                      type="number"
                      inputmode="decimal"
                      min="0"
                      max="5000"
                      class="input w-20 px-2 py-1.5 text-center tabular-nums"
                      [value]="item.grams"
                      (change)="meal.setGrams(item.food.id, $any($event.target).valueAsNumber)"
                    />
                    <span class="text-xs text-stone-500">g</span>
                    <button type="button" class="btn-ghost size-9 p-0" (click)="step(item.food.id, item.grams, 10)" aria-label="Aumenta di 10 g">
                      <app-icon name="plus" [size]="16" />
                    </button>
                  </div>
                  <button type="button" class="btn-ghost size-9 p-0 text-stone-400 hover:text-rose-600" (click)="meal.remove(item.food.id)" [attr.aria-label]="'Rimuovi ' + item.food.name_it">
                    <app-icon name="trash" [size]="18" />
                  </button>
                </li>
              }
            </ul>
            <div class="mt-3 flex justify-end">
              <button type="button" class="btn-ghost text-sm" (click)="meal.clear()">Svuota pasto</button>
            </div>
          }
        </section>

        <app-nutrient-summary [totals]="meal.totals()" />
      </div>

      <aside class="space-y-5">
        <app-balance-panel [balance]="meal.balance()" />

        @if (meal.items().length > 0) {
          <section class="card p-5">
            <h2 class="font-semibold">Salva nel diario</h2>
            @if (auth.isLoggedIn()) {
              <form [formGroup]="saveForm" (ngSubmit)="save()" class="mt-3 space-y-3">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="label" for="meal-type">Pasto</label>
                    <select id="meal-type" class="input" formControlName="meal">
                      @for (m of mealTypes; track m.value) {
                        <option [value]="m.value">{{ m.label }}</option>
                      }
                    </select>
                  </div>
                  <div>
                    <label class="label" for="meal-date">Data</label>
                    <input id="meal-date" type="date" class="input" formControlName="date" />
                  </div>
                </div>
                <label class="flex items-center gap-2 text-sm">
                  <input type="checkbox" formControlName="clearAfter" class="size-4 accent-brand-600" /> Svuota il pasto dopo il salvataggio
                </label>
                <button type="submit" class="btn-primary w-full" [disabled]="saveForm.invalid || saving()">
                  <app-icon name="book" [size]="18" /> Salva {{ meal.count() }} alimenti
                </button>
              </form>
            } @else {
              <p class="mt-2 text-sm text-stone-500 dark:text-stone-400">
                <a routerLink="/accedi" [queryParams]="{ ritorno: '/pasto' }" class="font-medium text-brand-700 underline dark:text-brand-200">Accedi</a>
                per registrare il pasto nel diario.
              </p>
            }
          </section>
        }

        <details class="card p-5 text-sm text-stone-600 dark:text-stone-300">
          <summary class="cursor-pointer font-semibold text-stone-900 dark:text-white">Come funziona il calcolo?</summary>
          <div class="mt-3 space-y-2 leading-relaxed">
            <p>
              Nell'intestino il calcio si lega all'ossalato in rapporto molare <strong>1:1</strong> formando ossalato di calcio
              insolubile, che viene eliminato invece di essere assorbito e filtrato dai reni.
            </p>
            <p>
              1 mg di ossalato richiede circa <strong>0,46 mg di calcio</strong>. Poiché non tutto il calcio è disponibile
              (fosfati, fitati, assorbimento), consideriamo ottimale un rapporto di <strong>2:1</strong>.
            </p>
            <p class="text-xs text-stone-500 dark:text-stone-400">
              Strumento informativo: non sostituisce il parere del medico o del dietista.
            </p>
          </div>
        </details>
      </aside>
    </div>
  `,
})
export class MealPage {
  protected readonly meal = inject(MealService);
  protected readonly auth = inject(AuthService);
  private readonly diary = inject(DiaryService);

  protected readonly mealTypes = MEAL_TYPES;
  protected readonly saving = signal(false);
  protected readonly scaled = scaleNutrients;

  protected readonly saveForm = new FormGroup({
    meal: new FormControl<MealType>(guessMeal(), { nonNullable: true }),
    date: new FormControl(todayIso(), { nonNullable: true, validators: [Validators.required] }),
    clearAfter: new FormControl(true, { nonNullable: true }),
  });

  protected add(food: Food): void {
    this.meal.add(food);
  }

  protected step(foodId: number, grams: number, delta: number): void {
    this.meal.setGrams(foodId, Math.max(0, grams + delta));
  }

  protected async save(): Promise<void> {
    const items = this.meal.items().filter((i) => i.grams > 0);
    if (this.saveForm.invalid || items.length === 0) return;
    this.saving.set(true);
    const { meal, date, clearAfter } = this.saveForm.getRawValue();
    const ok = await this.diary.addMeal(items, meal, date);
    this.saving.set(false);
    if (ok && clearAfter) this.meal.clear();
  }
}
