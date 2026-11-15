// Edge Function "resolve-food"
//
// Chiamata dall'app quando la ricerca non trova un alimento. Un agente (Claude con
// ricerca web, lista Harvard e USDA FoodData Central) ricostruisce la scheda e la
// salva in `food_candidates` con stato "da_verificare". Nulla entra in `foods`
// senza l'approvazione di una persona (vedi scripts/review-candidates.mjs).
//
// Secrets richiesti:  ANTHROPIC_API_KEY
// Opzionali:          ANTHROPIC_MODEL (default claude-sonnet-5-5), ANTHROPIC_EFFORT (default medium),
//                     FDC_API_KEY (default DEMO_KEY), FOOD_AGENT_DAILY_LIMIT (default 5 richieste
//                     per utente al giorno)
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono forniti da Supabase.
//
// La risposta arriva subito (202) e la ricerca prosegue in background: l'app
// rilegge la riga in `food_candidates` finché lo stato cambia.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { runAgent, type AgentOutcome } from './agent.ts';
import { normalizeText } from './validate.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5';
const EFFORT = Deno.env.get('ANTHROPIC_EFFORT') ?? 'medium';
const FDC_API_KEY = Deno.env.get('FDC_API_KEY') ?? 'DEMO_KEY';
const DAILY_LIMIT = Number(Deno.env.get('FOOD_AGENT_DAILY_LIMIT') ?? 5) || 5;

const MAX_SEARCHES = 6; // ricerche web per ricerca
const DEADLINE_MS = 135_000; // sotto il limite di durata delle Edge Function
const STALE_AFTER_MS = 5 * 60_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PUBLIC_COLUMNS = 'id,query,status,name_it,existing_food_id,food_id,agent_notes';

type Json = Record<string, unknown>;

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metodo non consentito.' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Funzione non configurata.' }, 500);
  if (!ANTHROPIC_API_KEY) return json({ error: 'Assistente non configurato (manca ANTHROPIC_API_KEY).' }, 503);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // Solo utenti autenticati: ogni ricerca ha un costo.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = token ? await admin.auth.getUser(token) : { data: null, error: null };
  const user = userData?.user;
  if (userError || !user) return json({ error: 'Accedi per chiedere una ricerca all\'assistente.' }, 401);

  let query = '';
  try {
    const body = await req.json();
    query = typeof body?.query === 'string' ? body.query.replace(/\s+/g, ' ').trim() : '';
  } catch {
    return json({ error: 'Richiesta non valida.' }, 400);
  }
  const queryNorm = normalizeText(query);
  if (query.length > 60 || queryNorm.length < 3) return json({ error: 'Scrivi il nome di un alimento (da 3 a 60 caratteri).' }, 400);

  // Ricerche rimaste appese (funzione interrotta): liberano il termine.
  await admin
    .from('food_candidates')
    .update({ status: 'errore', error: 'Ricerca interrotta (timeout).' })
    .eq('status', 'in_ricerca')
    .lt('created_at', new Date(Date.now() - STALE_AFTER_MS).toISOString());

  // Stesso termine già in lavorazione o in attesa di verifica: niente doppioni.
  const active = await findActive(admin, queryNorm);
  if (active) return json(forUser(active, user.id));

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin
    .from('food_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('requested_by', user.id)
    .gte('created_at', since);
  if ((count ?? 0) >= DAILY_LIMIT)
    return json({ error: `Hai raggiunto il limite di ${DAILY_LIMIT} ricerche al giorno. Riprova domani.` }, 429);

  const { data: created, error: insertError } = await admin
    .from('food_candidates')
    .insert({ requested_by: user.id, query, query_norm: queryNorm, status: 'in_ricerca', model: MODEL })
    .select(PUBLIC_COLUMNS + ',requested_by')
    .single();
  if (insertError || !created) {
    if (insertError?.code === '23505') {
      const again = await findActive(admin, queryNorm);
      if (again) return json(forUser(again, user.id));
    }
    console.error('insert food_candidates', insertError);
    return json({ error: 'Impossibile avviare la ricerca.' }, 500);
  }

  const row = created as unknown as Json & { id: number };
  const job = runAndStore(admin, row.id, query);
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(job);
  else await job; // esecuzione locale senza background task

  return json(forUser(row, user.id), 202);
});

async function findActive(admin: SupabaseClient, queryNorm: string): Promise<Json | null> {
  const { data } = await admin
    .from('food_candidates')
    .select(PUBLIC_COLUMNS + ',requested_by')
    .eq('query_norm', queryNorm)
    .in('status', ['in_ricerca', 'da_verificare'])
    .maybeSingle();
  return (data as Json | null) ?? null;
}

/** Chi non ha fatto la richiesta non può leggere la riga (RLS): riceve solo lo stato. */
function forUser(row: Json, userId: string): Json {
  const own = row['requested_by'] === userId;
  return {
    id: own ? row['id'] : null,
    query: row['query'],
    status: row['status'],
    name_it: row['name_it'] ?? null,
    existing_food_id: row['existing_food_id'] ?? null,
    food_id: row['food_id'] ?? null,
    agent_notes: own ? (row['agent_notes'] ?? null) : null,
    shared: !own,
  };
}

// ---------------------------------------------------------------------
// Agente
// ---------------------------------------------------------------------

async function runAndStore(admin: SupabaseClient, candidateId: number, query: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
  let update: Json;
  try {
    const outcome: AgentOutcome = await resolve(admin, query, controller.signal);
    update =
      outcome.status === 'da_verificare'
        ? { status: 'da_verificare', ...(outcome.proposal as unknown as Json) }
        : outcome.status === 'gia_presente'
          ? { status: 'gia_presente', existing_food_id: outcome.existing_food_id, agent_notes: outcome.agent_notes }
          : { status: 'non_trovato', agent_notes: outcome.agent_notes };
  } catch (e) {
    const message = controller.signal.aborted ? 'Tempo scaduto durante la ricerca.' : String((e as Error)?.message ?? e);
    console.error('resolve-food', candidateId, message);
    update = { status: 'errore', error: message.slice(0, 500) };
  } finally {
    clearTimeout(timer);
  }

  const { error } = await admin.from('food_candidates').update(update).eq('id', candidateId);
  if (error) {
    // Es. un'altra proposta con lo stesso nome approvata nel frattempo.
    console.error('update food_candidates', candidateId, error);
    await admin
      .from('food_candidates')
      .update({ status: 'errore', error: `Salvataggio non riuscito: ${error.message}`.slice(0, 500) })
      .eq('id', candidateId);
  }
}

/** Prepara il contesto dal database (catalogo, alimenti simili, lista Harvard) e avvia l'agente. */
async function resolve(admin: SupabaseClient, query: string, signal: AbortSignal): Promise<AgentOutcome> {
  const { data: catalog, error: catalogError } = await admin.from('foods').select('id,name_it,category').limit(5000);
  if (catalogError || !catalog) throw new Error('Catalogo non leggibile.');

  const { data: similar } = await admin.rpc('search_foods', { q: query, result_limit: 8 });

  return runAgent({
    query,
    signal,
    catalog: catalog as { id: number; name_it: string; category: string }[],
    similar: (similar ?? []) as { id: number; name_it: string; synonyms: string | null }[],
    harvardLookup: (term) => harvardLookup(admin, term),
    anthropicApiKey: ANTHROPIC_API_KEY,
    model: MODEL,
    effort: EFFORT,
    fdcApiKey: FDC_API_KEY,
    maxSearches: MAX_SEARCHES,
  });
}

async function harvardLookup(admin: SupabaseClient, term: string): Promise<string> {
  const q = term.trim().slice(0, 60);
  if (q.length < 2) return 'Indica un termine in inglese.';
  const { data, error } = await admin.rpc('match_oxalate_reference', { q, max_results: 8 });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as {
    name_en: string;
    category: string;
    serving: string;
    oxalate_mg_serving: number;
    tier: string;
    fdc_id?: number | null;
    serving_g?: number | null;
    oxalate_mg_100g?: number | null;
  }[];
  if (rows.length === 0) return `Nessuna voce per "${q}" nella lista Harvard. Prova un sinonimo o cerca sul web.`;
  return (
    'Lista Harvard T.H. Chan (rev. nov 2023) — mg di ossalato PER PORZIONE:\n' +
    rows
      .map((r) => {
        // Peso della porzione già verificato su USDA (scripts/enrich-reference.mjs), quando c'è.
        const weighed =
          r.serving_g != null && r.oxalate_mg_100g != null
            ? ` · porzione = ${r.serving_g} g (${r.fdc_id ? `peso USDA, FDC ${r.fdc_id}` : 'conversione esatta di unità'}) → ${r.oxalate_mg_100g} mg/100 g`
            : ' · peso della porzione non verificato';
        return `- ${r.name_en} [${r.category}] · porzione: ${r.serving} · ${r.oxalate_mg_serving} mg (${r.tier})${weighed}`;
      })
      .join('\n')
  );
}
