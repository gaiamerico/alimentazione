import { inject, Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface CandidateSource {
  title?: string;
  url?: string;
  used_for?: string;
  reported_value?: string;
}

/** Valori per 100 g confrontabili tra proposta e alimento in catalogo. */
export const REVIEW_FIELDS = [
  { key: 'oxalate_mg', label: 'Ossalati', unit: 'mg' },
  { key: 'calcium_mg', label: 'Calcio', unit: 'mg' },
  { key: 'kcal', label: 'Energia', unit: 'kcal' },
  { key: 'protein_g', label: 'Proteine', unit: 'g' },
  { key: 'carbs_g', label: 'Carboidrati', unit: 'g' },
  { key: 'sugars_g', label: 'di cui zuccheri', unit: 'g' },
  { key: 'fat_g', label: 'Grassi', unit: 'g' },
  { key: 'saturated_fat_g', label: 'di cui saturi', unit: 'g' },
  { key: 'fiber_g', label: 'Fibre', unit: 'g' },
  { key: 'cholesterol_mg', label: 'Colesterolo', unit: 'mg' },
  { key: 'sodium_mg', label: 'Sodio', unit: 'mg' },
] as const;

export type ReviewFieldKey = (typeof REVIEW_FIELDS)[number]['key'];

export type Candidate = Record<ReviewFieldKey, number | null> & {
  id: number;
  query: string;
  name_it: string | null;
  name_en: string | null;
  category: string | null;
  oxalate_min_mg: number | null;
  oxalate_max_mg: number | null;
  oxalate_basis: string | null;
  oxalate_confidence: string | null;
  default_portion_g: number | null;
  portion_label: string | null;
  nutrient_source: string | null;
  oxalate_source: string | null;
  notes: string | null;
  agent_notes: string | null;
  sources: CandidateSource[];
  created_at: string;
  target_food_id: number | null;
  target: (Record<ReviewFieldKey, number | null> & { id: number; name_it: string }) | null;
};

/** Proposte dell'assistente da verificare; per ora chiunque abbia un account può decidere. */
@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly supabase = inject(SupabaseService);

  readonly candidates = signal<Candidate[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    const client = this.supabase.client;
    if (!client) {
      this.error.set('Supabase non è configurato.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const { data, error } = await client.rpc('pending_food_candidates');
    this.loading.set(false);
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.candidates.set(((data ?? []) as Candidate[]).map((c) => ({ ...c, sources: c.sources ?? [] })));
  }

  /** Approva o rifiuta; restituisce l'id dell'alimento creato o completato (null se rifiutata). */
  async decide(id: number, approve: boolean, note: string): Promise<number | null> {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase non è configurato.');
    const { data, error } = await client.rpc('review_food_candidate', {
      candidate_id: id,
      approve,
      note: note.trim() || null,
    });
    if (error) throw new Error(error.message);
    this.candidates.update((list) => list.filter((c) => c.id !== id));
    return (data as number | null) ?? null;
  }
}
