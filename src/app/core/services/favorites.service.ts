import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Food } from '../models/food.model';
import { AuthService } from './auth.service';
import { normalizeFood } from './food.service';
import { SupabaseService } from './supabase.service';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  private readonly _foods = signal<Food[]>([]);
  private readonly _loading = signal(false);

  readonly loading = this._loading.asReadonly();
  readonly favorites = computed(() =>
    [...this._foods()].sort((a, b) => a.name_it.localeCompare(b.name_it, 'it')),
  );
  readonly ids = computed(() => new Set(this._foods().map((f) => f.id)));

  constructor() {
    // Ricarica i preferiti quando cambia l'utente.
    effect(() => {
      const userId = this.auth.user()?.id;
      untracked(() => (userId ? void this.load() : this._foods.set([])));
    });
  }

  isFavorite(foodId: number): boolean {
    return this.ids().has(foodId);
  }

  async load(): Promise<void> {
    const client = this.supabase.client;
    if (!client) return;
    this._loading.set(true);
    const { data, error } = await client
      .from('favorites')
      .select('food:foods(*)')
      .order('created_at', { ascending: false });
    this._loading.set(false);
    if (error) {
      this.toast.error('Impossibile caricare i preferiti.');
      return;
    }
    const rows = (data ?? []) as unknown as { food: Food | null }[];
    this._foods.set(rows.flatMap((r) => (r.food ? [normalizeFood(r.food)] : [])));
  }

  /** Aggiunge o rimuove un preferito con aggiornamento ottimistico. */
  async toggle(food: Food): Promise<void> {
    const client = this.supabase.client;
    if (!client || !this.auth.isLoggedIn()) {
      this.toast.info('Accedi per salvare i tuoi alimenti preferiti.');
      return;
    }
    const wasFavorite = this.isFavorite(food.id);
    const previous = this._foods();
    this._foods.set(wasFavorite ? previous.filter((f) => f.id !== food.id) : [food, ...previous]);

    const { error } = wasFavorite
      ? await client.from('favorites').delete().eq('food_id', food.id)
      : await client.from('favorites').insert({ food_id: food.id });

    if (error) {
      this._foods.set(previous);
      this.toast.error('Operazione non riuscita, riprova.');
    } else {
      this.toast.success(wasFavorite ? 'Rimosso dai preferiti' : 'Aggiunto ai preferiti');
    }
  }

}
