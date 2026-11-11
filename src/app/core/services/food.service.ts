import { computed, inject, Injectable, signal } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Food, SearchFilters } from '../models/food.model';
import { HIGH_CALCIUM_MIN, normalizeText, OXALATE_LOW_MAX } from '../utils/nutrition';
import { SupabaseService } from './supabase.service';

const CACHE_KEY = 'nutriossalati:catalogo:v1';

/**
 * Catalogo e ricerca alimenti.
 * - Ricerca primaria: RPC `search_foods` (full-text italiano su Supabase).
 * - Fallback offline: ricerca locale sul catalogo (localStorage o JSON statico).
 */
@Injectable({ providedIn: 'root' })
export class FoodService {
  private readonly supabase = inject(SupabaseService);

  private readonly _catalog = signal<Food[]>(readCache());
  readonly catalog = this._catalog.asReadonly();
  readonly catalogById = computed(() => new Map(this._catalog().map((f) => [f.id, f])));
  readonly categories = computed(() =>
    [...new Set(this._catalog().map((f) => f.category))].sort((a, b) => a.localeCompare(b, 'it')),
  );

  private catalogRequest: Promise<void> | null = null;

  /**
   * Carica (una volta per sessione) l'intero catalogo per l'uso offline:
   * da Supabase se disponibile, altrimenti dal catalogo statico incluso nell'app.
   */
  loadCatalog(force = false): Promise<void> {
    if (this.catalogRequest && !force) return this.catalogRequest;
    this.catalogRequest = (async () => {
      const client = this.supabase.client;
      if (client && navigator.onLine) {
        const { data, error } = await client.from('foods').select('*').order('name_it').limit(5000);
        if (!error && data) {
          const foods = (data as Food[]).map(normalizeFood);
          this._catalog.set(foods);
          writeCache(foods);
          return;
        }
      }
      if (this._catalog().length === 0) {
        try {
          const res = await fetch('data/catalogo.json');
          if (res.ok) this._catalog.set(((await res.json()) as Food[]).map(normalizeFood));
        } catch {
          /* offline e senza cache: catalogo vuoto */
        }
      }
      if (this._catalog().length === 0) this.catalogRequest = null;
    })();
    return this.catalogRequest;
  }

  async search(filters: SearchFilters, limit = 60): Promise<Food[]> {
    const client = this.supabase.client;
    if (client && navigator.onLine) {
      const { data, error } = await client.rpc(
        'search_foods',
        {
          q: filters.query.trim(),
          max_oxalate: filters.lowOxalate ? OXALATE_LOW_MAX : null,
          min_calcium: filters.highCalcium ? HIGH_CALCIUM_MIN : null,
          no_cholesterol: filters.noCholesterol,
          food_category: filters.category,
          result_limit: limit,
        },
        { get: true }, // GET → risposta cacheabile dal service worker
      );
      if (!error && data) return (data as Food[]).map(normalizeFood);
    }
    await this.loadCatalog();
    return this.localSearch(filters, limit);
  }

  localSearch(filters: SearchFilters, limit = 60): Food[] {
    const words = normalizeText(filters.query).split(' ').filter(Boolean);
    const scored: { food: Food; score: number }[] = [];

    for (const food of this._catalog()) {
      if (filters.lowOxalate && !(food.oxalate_mg < OXALATE_LOW_MAX)) continue;
      if (filters.highCalcium && !(food.calcium_mg > HIGH_CALCIUM_MIN)) continue;
      if (filters.noCholesterol && food.cholesterol_mg !== 0) continue;
      if (filters.category && food.category !== filters.category) continue;

      if (words.length === 0) {
        scored.push({ food, score: 0 });
        continue;
      }
      const name = normalizeText(food.name_it).split(' ');
      const extra = normalizeText(`${food.synonyms ?? ''} ${food.category}`).split(' ');
      let score = 0;
      let matchesAll = true;
      for (const w of words) {
        if (name.some((t) => t.startsWith(w))) score += 2;
        else if (extra.some((t) => t.startsWith(w))) score += 1;
        else {
          matchesAll = false;
          break;
        }
      }
      if (matchesAll) scored.push({ food, score });
    }

    return scored
      .sort((a, b) => b.score - a.score || a.food.name_it.localeCompare(b.food.name_it, 'it'))
      .slice(0, limit)
      .map((s) => s.food);
  }

  /**
   * Cerca online un alimento non presente nel catalogo (Edge Function `lookup-food`)
   * e lo aggiunge al database. Richiede l'accesso. Lancia un Error con messaggio in italiano.
   */
  async lookupOnline(query: string): Promise<{ food: Food; created: boolean }> {
    const client = this.supabase.client;
    if (!client) throw new Error('Ricerca online non disponibile: Supabase non è configurato.');
    const { data, error } = await client.functions.invoke<{ food: Food; created: boolean }>('lookup-food', {
      body: { query: query.trim() },
    });
    if (error || !data?.food) {
      let message = 'Ricerca online non riuscita: riprova più tardi.';
      if (error instanceof FunctionsHttpError) {
        try {
          const body = (await error.context.json()) as { message?: string };
          if (body.message) message = body.message;
        } catch {
          /* risposta non JSON */
        }
      }
      throw new Error(message);
    }
    const food = normalizeFood(data.food);
    const catalog = this._catalog().filter((f) => f.id !== food.id);
    const updated = [...catalog, food].sort((a, b) => a.name_it.localeCompare(b.name_it, 'it'));
    this._catalog.set(updated);
    writeCache(updated);
    return { food, created: data.created };
  }

  async getById(id: number): Promise<Food | null> {
    const cached = this.catalogById().get(id);
    if (cached) return cached;
    const client = this.supabase.client;
    if (client) {
      const { data } = await client.from('foods').select('*').eq('id', id).maybeSingle();
      if (data) return normalizeFood(data as Food);
    }
    await this.loadCatalog();
    return this.catalogById().get(id) ?? null;
  }
}

/** PostgREST restituisce i `numeric` come numeri, ma normalizziamo per sicurezza. */
export function normalizeFood(raw: Food): Food {
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
  return {
    ...raw,
    kcal: num(raw.kcal),
    protein_g: num(raw.protein_g),
    carbs_g: num(raw.carbs_g),
    fat_g: num(raw.fat_g),
    fiber_g: num(raw.fiber_g),
    calcium_mg: num(raw.calcium_mg),
    cholesterol_mg: num(raw.cholesterol_mg),
    oxalate_mg: num(raw.oxalate_mg),
    default_portion_g: num(raw.default_portion_g) || 100,
  };
}

function readCache(): Food[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Food[]) : [];
  } catch {
    return [];
  }
}

function writeCache(foods: Food[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(foods));
  } catch {
    /* quota piena o storage non disponibile: ignoriamo */
  }
}
