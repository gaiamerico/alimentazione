import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { DiaryEntry, MealItem, MEAL_TYPES, MealType } from '../models/food.model';
import { calciumOxalateBalance, sumTotals, todayIso } from '../utils/nutrition';
import { AuthService } from './auth.service';
import { normalizeFood } from './food.service';
import { SupabaseService } from './supabase.service';
import { ToastService } from './toast.service';

const ENTRY_SELECT = 'id, food_id, entry_date, meal, grams, created_at, food:foods(*)';

@Injectable({ providedIn: 'root' })
export class DiaryService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly selectedDate = signal(todayIso());
  private readonly _entries = signal<DiaryEntry[]>([]);
  private readonly _loading = signal(false);

  readonly entries = this._entries.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly totals = computed(() => sumTotals(this._entries()));
  readonly balance = computed(() => {
    const t = this.totals();
    return calciumOxalateBalance(t.calcium_mg, t.oxalate_mg);
  });

  /** Voci raggruppate per pasto, nell'ordine colazione → spuntino. */
  readonly byMeal = computed(() =>
    MEAL_TYPES.map(({ value, label }) => {
      const entries = this._entries().filter((e) => e.meal === value);
      const totals = sumTotals(entries);
      return { meal: value, label, entries, totals, balance: calciumOxalateBalance(totals.calcium_mg, totals.oxalate_mg) };
    }),
  );

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id;
      const date = this.selectedDate();
      untracked(() => (userId ? void this.load(date) : this._entries.set([])));
    });
  }

  async load(date = this.selectedDate()): Promise<void> {
    const client = this.supabase.client;
    if (!client) return;
    this._loading.set(true);
    const { data, error } = await client
      .from('diary_entries')
      .select(ENTRY_SELECT)
      .eq('entry_date', date)
      .order('created_at');
    // Evita di sovrascrivere con una risposta arrivata in ritardo per un altro giorno.
    if (date !== this.selectedDate()) return;
    this._loading.set(false);
    if (error) {
      this.toast.error('Impossibile caricare il diario.');
      return;
    }
    this._entries.set(((data ?? []) as unknown as DiaryEntry[]).map(normalizeEntry));
  }

  async add(foodId: number, grams: number, meal: MealType, date = this.selectedDate()): Promise<boolean> {
    return this.addMany([{ foodId, grams }], meal, date);
  }

  async addMeal(items: readonly MealItem[], meal: MealType, date: string): Promise<boolean> {
    return this.addMany(
      items.map((i) => ({ foodId: i.food.id, grams: i.grams })),
      meal,
      date,
    );
  }

  async updateGrams(entry: DiaryEntry, grams: number): Promise<void> {
    const client = this.requireClient();
    if (!client) return;
    const previous = this._entries();
    this._entries.update((list) => list.map((e) => (e.id === entry.id ? { ...e, grams } : e)));
    const { error } = await client.from('diary_entries').update({ grams }).eq('id', entry.id);
    if (error) {
      this._entries.set(previous);
      this.toast.error('Modifica non salvata.');
    }
  }

  async remove(entry: DiaryEntry): Promise<void> {
    const client = this.requireClient();
    if (!client) return;
    const previous = this._entries();
    this._entries.update((list) => list.filter((e) => e.id !== entry.id));
    const { error } = await client.from('diary_entries').delete().eq('id', entry.id);
    if (error) {
      this._entries.set(previous);
      this.toast.error('Eliminazione non riuscita.');
    }
  }

  private async addMany(rows: { foodId: number; grams: number }[], meal: MealType, date: string): Promise<boolean> {
    const client = this.requireClient();
    if (!client || rows.length === 0) return false;
    const { data, error } = await client
      .from('diary_entries')
      .insert(rows.map((r) => ({ food_id: r.foodId, grams: r.grams, meal, entry_date: date })))
      .select(ENTRY_SELECT);
    if (error) {
      this.toast.error('Impossibile salvare nel diario.');
      return false;
    }
    if (date === this.selectedDate()) {
      const added = ((data ?? []) as unknown as DiaryEntry[]).map(normalizeEntry);
      this._entries.update((list) => [...list, ...added]);
    }
    this.toast.success(rows.length === 1 ? 'Aggiunto al diario' : `${rows.length} alimenti aggiunti al diario`);
    return true;
  }

  private requireClient() {
    const client = this.supabase.client;
    if (!client || !this.auth.isLoggedIn()) {
      this.toast.info('Accedi per usare il diario alimentare.');
      return null;
    }
    return client;
  }
}

function normalizeEntry(e: DiaryEntry): DiaryEntry {
  return { ...e, grams: Number(e.grams), food: normalizeFood(e.food) };
}
