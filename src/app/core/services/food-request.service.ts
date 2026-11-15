import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type FoodRequestStatus =
  | 'in_ricerca'
  | 'da_verificare'
  | 'approvato'
  | 'rifiutato'
  | 'non_trovato'
  | 'gia_presente'
  | 'errore';

/** Richiesta all'assistente per un alimento che non è in catalogo. */
export interface FoodRequest {
  /** null se la stessa ricerca è già stata chiesta da un altro utente. */
  id: number | null;
  query: string;
  status: FoodRequestStatus;
  name_it: string | null;
  existing_food_id: number | null;
  food_id: number | null;
  agent_notes: string | null;
}

const COLUMNS = 'id,query,status,name_it,existing_food_id,food_id,agent_notes';
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 180_000;

/**
 * Chiede alla Edge Function `resolve-food` di cercare online un alimento mancante.
 * La funzione risponde subito e lavora in background: lo stato si legge dalla
 * tabella `food_candidates` (RLS: ognuno vede solo le proprie richieste).
 * L'alimento entra nel catalogo solo dopo la verifica di una persona.
 */
@Injectable({ providedIn: 'root' })
export class FoodRequestService {
  private readonly supabase = inject(SupabaseService);

  async request(query: string): Promise<FoodRequest> {
    const client = this.supabase.client;
    if (!client) throw new Error('Assistente non disponibile: Supabase non è configurato.');

    const { data, error } = await client.functions.invoke<FoodRequest>('resolve-food', { body: { query } });
    if (error) throw new Error(await readFunctionError(error));
    if (!data) throw new Error('Risposta vuota dall\'assistente.');
    return data;
  }

  /**
   * Rilegge la richiesta finché l'assistente conclude (o scade l'attesa).
   * `isCancelled` permette di interrompere quando l'utente cambia ricerca.
   */
  async waitForResult(id: number, isCancelled: () => boolean): Promise<FoodRequest | null> {
    const client = this.supabase.client;
    if (!client) return null;
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      if (isCancelled()) return null;
      const { data } = await client.from('food_candidates').select(COLUMNS).eq('id', id).maybeSingle();
      const row = data as FoodRequest | null;
      if (row && row.status !== 'in_ricerca') return row;
    }
    return null;
  }
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
  return navigator.onLine
    ? 'L\'assistente non è raggiungibile in questo momento. Riprova più tardi.'
    : 'Connessione assente: riprova quando sei online.';
}
