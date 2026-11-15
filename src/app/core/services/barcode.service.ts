import { inject, Injectable } from '@angular/core';
import { PackagedProduct } from '../models/food.model';
import { SupabaseService } from './supabase.service';

/**
 * Cerca un prodotto confezionato dal codice a barre tramite la Edge Function
 * `lookup-barcode` (Open Food Facts, con cache in `packaged_products`).
 * `found: false` significa che il codice non è nella banca dati.
 */
@Injectable({ providedIn: 'root' })
export class BarcodeService {
  private readonly supabase = inject(SupabaseService);

  async lookup(barcode: string): Promise<PackagedProduct> {
    const client = this.supabase.client;
    if (!client) throw new Error('Ricerca dei prodotti non disponibile: Supabase non è configurato.');
    if (!navigator.onLine) throw new Error('Connessione assente: la ricerca dei prodotti confezionati richiede la rete.');

    const { data, error } = await client.functions.invoke<{ product?: PackagedProduct }>('lookup-barcode', { body: { barcode } });
    if (error) throw new Error(await readFunctionError(error));
    if (!data?.product) throw new Error('Risposta vuota dalla ricerca dei prodotti.');
    return normalizeProduct(data.product);
  }
}

/** PostgREST può restituire i `numeric` come stringhe: null resta null ("dato non disponibile"). */
function normalizeProduct(raw: PackagedProduct): PackagedProduct {
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    ...raw,
    kcal: num(raw.kcal),
    protein_g: num(raw.protein_g),
    carbs_g: num(raw.carbs_g),
    sugars_g: num(raw.sugars_g),
    fat_g: num(raw.fat_g),
    saturated_fat_g: num(raw.saturated_fat_g),
    fiber_g: num(raw.fiber_g),
    sodium_mg: num(raw.sodium_mg),
    calcium_mg: num(raw.calcium_mg),
    cholesterol_mg: num(raw.cholesterol_mg),
  };
}

/** Le risposte non-2xx della funzione portano un messaggio in italiano nel corpo JSON. */
async function readFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const body = (await context.json()) as { error?: string };
      if (body.error) return body.error;
    } catch {
      /* corpo non JSON */
    }
  }
  return 'La ricerca dei prodotti non è raggiungibile in questo momento. Riprova più tardi.';
}
