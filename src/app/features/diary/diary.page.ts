import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DiaryEntry, Food, MEAL_TYPES, MealType } from '../../core/models/food.model';
import { DiaryService } from '../../core/services/diary.service';
import { guessMeal, scaleNutrients, shiftIsoDate, todayIso } from '../../core/utils/nutrition';
import { BalancePanel } from '../../shared/components/balance-panel';
import { FoodPicker } from '../../shared/components/food-picker';
import { Icon } from '../../shared/components/icon';
import { NutrientSummary } from '../../shared/components/nutrient-summary';
import { OxalateBadge } from '../../shared/components/oxalate-badge';

@Component({
  selector: 'app-diary-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, ReactiveFormsModule, RouterLink, BalancePanel, FoodPicker, Icon, NutrientSummary, OxalateBadge],
  template: `
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="page-title">Diario alimentare</h1>
        <p class="page-subtitle first-letter:uppercase">{{ dateLabel() }}</p>
      </div>
      <div class="flex items-center gap-1 rounded-2xl border border-stone-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.03]">
        <button type="button" class="btn-ghost size-9 p-0" (click)="shift(-1)" aria-label="Giorno precedente">
          <app-icon name="chevron-left" [size]="18" />
        </button>
        <label class="sr-only" for="diary-date">Data</label>
        <input
          id="diary-date"
          type="date"
          class="rounded-lg bg-transparent px-2 py-1.5 text-sm font-medium tabular-nums focus:outline-none"
          [value]="diary.selectedDate()"
          (change)="setDate($any($event.target).value)"
        />
        <button type="button" class="btn-ghost size-9 p-0" (click)="shift(1)" aria-label="Giorno successivo">
          <app-icon name="chevron-right" [size]="18" />
        </button>
        @if (!isToday()) {
          <button type="button" class="btn-ghost px-3 py-1.5 text-sm" (click)="setDate(today())">Oggi</button>
        }
      </div>
    </header>

    <app-nutrient-summary [totals]="diary.totals()" [showDaily]="true" />

    <div class="mt-5 grid gap-5 lg:grid-cols-[1fr_400px]">
      <div class="space-y-5">
        <!-- Aggiunta rapida -->
        <section class="card p-5">
          <h2 class="mb-3 font-semibold">Aggiungi un alimento</h2>
          @if (pending(); as food) {
            <form [formGroup]="addForm" (ngSubmit)="confirmAdd(food)" class="space-y-3">
              <div class="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2 dark:bg-white/[0.03]">
                <span class="truncate font-medium">{{ food.name_it }}</span>
                <button type="button" class="btn-ghost size-8 p-0" (click)="pending.set(null)" aria-label="Annulla">
                  <app-icon name="x" [size]="16" />
                </button>
              </div>
              <div class="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                <div>
                  <label class="label" for="add-grams">Grammi</label>
                  <input id="add-grams" type="number" inputmode="decimal" min="1" max="5000" class="input tabular-nums" formControlName="grams" />
                </div>
                <div>
                  <label class="label" for="add-meal">Pasto</label>
                  <select id="add-meal" class="input" formControlName="meal">
                    @for (m of mealTypes; track m.value) {
                      <option [value]="m.value">{{ m.label }}</option>
                    }
                  </select>
                </div>
                <button type="submit" class="btn-primary" [disabled]="addForm.invalid">Aggiungi</button>
              </div>
            </form>
          } @else {
            <app-food-picker (picked)="startAdd($event)" />
          }
        </section>

        <!-- Voci per pasto -->
        @if (diary.loading() && diary.entries().length === 0) {
          <div class="card h-40 animate-pulse bg-stone-100 dark:bg-white/[0.03]"></div>
        }
        @for (group of diary.byMeal(); track group.meal) {
          @if (group.entries.length > 0) {
            <section class="card overflow-hidden">
              <header class="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-3 dark:border-white/[0.06]">
                <h2 class="font-semibold">{{ group.label }}</h2>
                <div class="flex items-center gap-3 text-xs text-stone-500 tabular-nums dark:text-stone-400">
                  <span>{{ group.totals.kcal | number: '1.0-0' }} kcal</span>
                  <span>Ca {{ group.totals.calcium_mg | number: '1.0-0' }} mg</span>
                  <span class="size-2.5 rounded-full" [class]="balanceDot(group.balance.status)" [attr.title]="group.balance.title"></span>
                </div>
              </header>
              <ul class="divide-y divide-stone-100 dark:divide-white/[0.05]">
                @for (entry of group.entries; track entry.id) {
                  @let v = scaled(entry.food, entry.grams);
                  <li class="flex items-center gap-3 px-5 py-3">
                    <div class="min-w-0 flex-1">
                      <a [routerLink]="['/alimento', entry.food.id]" class="block truncate font-medium hover:text-brand-700 dark:hover:text-brand-200">{{ entry.food.name_it }}</a>
                      <p class="text-xs text-stone-500 tabular-nums dark:text-stone-400">
                        {{ v.kcal | number: '1.0-0' }} kcal · P {{ v.protein_g | number: '1.0-1' }} · C {{ v.carbs_g | number: '1.0-1' }} · G {{ v.fat_g | number: '1.0-1' }} · Ca {{ v.calcium_mg | number: '1.0-0' }} mg
                      </p>
                    </div>
                    <app-oxalate-badge [mg]="v.oxalate_mg" [showLabel]="false" />
                    <label class="sr-only" [for]="'e-' + entry.id">Grammi</label>
                    <input
                      [id]="'e-' + entry.id"
                      type="number"
                      min="1"
                      max="5000"
                      class="input w-20 px-2 py-1.5 text-center tabular-nums"
                      [value]="entry.grams"
                      (change)="updateGrams(entry, $any($event.target).valueAsNumber)"
                    />
                    <button type="button" class="btn-ghost size-9 p-0 text-stone-400 hover:text-rose-600" (click)="diary.remove(entry)" [attr.aria-label]="'Elimina ' + entry.food.name_it">
                      <app-icon name="trash" [size]="18" />
                    </button>
                  </li>
                }
              </ul>
            </section>
          }
        }
        @if (!diary.loading() && diary.entries().length === 0) {
          <div class="card flex flex-col items-center gap-2 p-10 text-center">
            <app-icon name="calendar" [size]="32" class="text-stone-400" />
            <p class="font-medium">Nessun alimento registrato</p>
            <p class="text-sm text-stone-500 dark:text-stone-400">Aggiungi alimenti qui sopra o salva un pasto dal <a routerLink="/pasto" class="underline">bilancio pasto</a>.</p>
          </div>
        }
      </div>

      <aside>
        <app-balance-panel [balance]="diary.balance()" heading="Bilancio della giornata" />
        <p class="mt-3 px-1 text-xs text-stone-500 dark:text-stone-400">
          Il legame calcio-ossalato avviene pasto per pasto: il pallino colorato accanto a ogni pasto indica il suo bilancio.
        </p>
      </aside>
    </div>
  `,
})
export class DiaryPage {
  protected readonly diary = inject(DiaryService);

  protected readonly mealTypes = MEAL_TYPES;
  protected readonly scaled = scaleNutrients;
  protected readonly today = todayIso;
  protected readonly pending = signal<Food | null>(null);

  protected readonly isToday = computed(() => this.diary.selectedDate() === todayIso());
  protected readonly dateLabel = computed(() => {
    const [y, m, d] = this.diary.selectedDate().split('-').map(Number);
    return new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d));
  });

  protected readonly addForm = new FormGroup({
    grams: new FormControl(100, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.max(5000)] }),
    meal: new FormControl<MealType>(guessMeal(), { nonNullable: true }),
  });

  protected shift(days: number): void {
    this.diary.selectedDate.update((d) => shiftIsoDate(d, days));
  }

  protected setDate(value: string): void {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) this.diary.selectedDate.set(value);
  }

  protected startAdd(food: Food): void {
    this.addForm.patchValue({ grams: food.default_portion_g });
    this.pending.set(food);
  }

  protected async confirmAdd(food: Food): Promise<void> {
    if (this.addForm.invalid) return;
    const { grams, meal } = this.addForm.getRawValue();
    if (await this.diary.add(food.id, grams, meal)) this.pending.set(null);
  }

  protected updateGrams(entry: DiaryEntry, grams: number): void {
    if (Number.isFinite(grams) && grams > 0 && grams <= 5000 && grams !== entry.grams) {
      void this.diary.updateGrams(entry, grams);
    }
  }

  protected balanceDot(status: string): string {
    return status === 'insufficiente' ? 'bg-rose-500' : status === 'sufficiente' ? 'bg-amber-500' : 'bg-emerald-500';
  }
}
