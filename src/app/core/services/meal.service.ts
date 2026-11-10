import { computed, effect, Injectable, signal } from '@angular/core';
import { Food, MealItem } from '../models/food.model';
import { calciumOxalateBalance, sumTotals } from '../utils/nutrition';

const STORAGE_KEY = 'nutriossalati:pasto:v1';

/** Pasto in composizione (persistito in locale, funziona anche offline e senza login). */
@Injectable({ providedIn: 'root' })
export class MealService {
  private readonly _items = signal<MealItem[]>(readItems());

  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().length);
  readonly totals = computed(() => sumTotals(this._items()));
  readonly balance = computed(() => {
    const t = this.totals();
    return calciumOxalateBalance(t.calcium_mg, t.oxalate_mg);
  });

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._items()));
      } catch {
        /* storage non disponibile */
      }
    });
  }

  add(food: Food, grams = food.default_portion_g): void {
    this._items.update((items) => {
      const existing = items.find((i) => i.food.id === food.id);
      return existing
        ? items.map((i) => (i.food.id === food.id ? { ...i, grams: i.grams + grams } : i))
        : [...items, { food, grams }];
    });
  }

  setGrams(foodId: number, grams: number): void {
    const safe = Math.min(5000, Math.max(0, Number(grams) || 0));
    this._items.update((items) => items.map((i) => (i.food.id === foodId ? { ...i, grams: safe } : i)));
  }

  remove(foodId: number): void {
    this._items.update((items) => items.filter((i) => i.food.id !== foodId));
  }

  clear(): void {
    this._items.set([]);
  }
}

function readItems(): MealItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as MealItem[]) : [];
    return Array.isArray(parsed) ? parsed.filter((i) => i?.food?.id && i.grams >= 0) : [];
  } catch {
    return [];
  }
}
