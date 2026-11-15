import { computed, inject, Injectable, signal } from '@angular/core';
import { Food, HarvardReference, SearchFilters } from '../models/food.model';
import { HIGH_CALCIUM_MIN, normalizeText, OXALATE_LOW_MAX } from '../utils/nutrition';
import { SupabaseService } from './supabase.service';

// v2: il catalogo include grassi saturi, zuccheri, sodio e la voce Harvard collegata.
const CACHE_KEY = 'nutriossalati:catalogo:v2';
const OLD_CACHE_KEYS = ['nutriossalati:catalogo:v1'];

/** Alimento con la voce Harvard collegata (solo le voci collegate sono leggibili: vedi RLS). */
const FOOD_SELECT = '*, harvard:oxalate_reference(name_en,name_it,serving,oxalate_mg_serving,tier,serving_g)';

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
        let { data, error } = await client.from('foods').select(FOOD_SELECT).order('name_it').limit(5000);
        // Database non ancora aggiornato con il collegamento Harvard: si legge il catalogo senza.
        if (error) ({ data, error } = await client.from('foods').select('*').order('name_it').limit(5000));
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

  async getById(id: number): Promise<Food | null> {
    const cached = this.catalogById().get(id);
    if (cached) return cached;
    const client = this.supabase.client;
    if (client) {
      let { data, error } = await client.from('foods').select(FOOD_SELECT).eq('id', id).maybeSingle();
      if (error) ({ data } = await client.from('foods').select('*').eq('id', id).maybeSingle());
      if (data) return normalizeFood(data as Food);
    }
    await this.loadCatalog();
    return this.catalogById().get(id) ?? null;
  }
}

/** PostgREST restituisce i `numeric` come numeri, ma normalizziamo per sicurezza. */
export function normalizeFood(raw: Food): Food {
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
  // Nutrienti facoltativi: null resta null ("dato non disponibile"), non diventa zero.
  const optional = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    ...raw,
    kcal: num(raw.kcal),
    protein_g: num(raw.protein_g),
    carbs_g: num(raw.carbs_g),
    fat_g: num(raw.fat_g),
    fiber_g: num(raw.fiber_g),
    calcium_mg: num(raw.calcium_mg),
    cholesterol_mg: num(raw.cholesterol_mg),
    saturated_fat_g: optional(raw.saturated_fat_g),
    sugars_g: optional(raw.sugars_g),
    sodium_mg: optional(raw.sodium_mg),
    oxalate_mg: num(raw.oxalate_mg),
    default_portion_g: num(raw.default_portion_g) || 100,
    harvard: normalizeHarvard(raw.harvard),
  };
}

function normalizeHarvard(raw: HarvardReference | null | undefined): HarvardReference | null {
  if (!raw || typeof raw.serving !== 'string') return null;
  const mg = Number(raw.oxalate_mg_serving);
  if (!Number.isFinite(mg) || (raw.tier !== 'low' && raw.tier !== 'medium' && raw.tier !== 'high')) return null;
  const grams = raw.serving_g === null || raw.serving_g === undefined ? null : Number(raw.serving_g);
  return {
    name_en: raw.name_en,
    name_it: raw.name_it ?? null,
    serving: raw.serving,
    oxalate_mg_serving: mg,
    tier: raw.tier,
    serving_g: grams !== null && Number.isFinite(grams) && grams > 0 ? grams : null,
  };
}

function readCache(): Food[] {
  try {
    for (const key of OLD_CACHE_KEYS) localStorage.removeItem(key);
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
