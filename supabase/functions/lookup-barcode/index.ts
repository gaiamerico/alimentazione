// Edge Function "lookup-barcode"
//
// Riceve un codice a barre (EAN-13, EAN-8, UPC-A, UPC-E) e restituisce la scheda del
// prodotto confezionato letta da Open Food Facts, salvandola in `packaged_products`.
// Passare da qui (e non dal browser) serve a due cose: la richiesta porta un
// User-Agent che identifica l'app, come chiede Open Food Facts, e il risultato resta
// in cache, così lo stesso prodotto non viene richiesto ogni volta.
//
// Nessun modello linguistico e nessun valore di ossalato: le etichette non lo riportano.
//
// La funzione è pubblica (la ricerca non richiede login), quindi è protetta così:
//   - si accettano solo codici con cifra di controllo valida;
//   - i prodotti già letti si servono dalla cache senza contattare Open Food Facts;
//   - le letture NUOVE hanno un tetto orario complessivo (BARCODE_HOURLY_LIMIT): un abuso
//     non può inondare Open Food Facts con richieste a nome dell'app né gonfiare la tabella;
//   - i codici non trovati restano in cache un giorno e poi vengono cancellati.
// Non si registrano indirizzi IP.
//
// Secrets opzionali: OFF_USER_AGENT (default "NutriOssalati/1.0 (PWA)"): Open Food Facts
// consiglia la forma "NomeApp/Versione (contatto)"; BARCODE_HOURLY_LIMIT (default 300).
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono forniti da Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { mapOpenFoodFactsProduct, normalizeBarcode, notFoundRow, type PackagedProductRow } from './product.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const USER_AGENT = Deno.env.get('OFF_USER_AGENT') ?? 'NutriOssalati/1.0 (PWA)';
const HOURLY_LIMIT = Number(Deno.env.get('BARCODE_HOURLY_LIMIT') ?? 300) || 300;

const FOUND_TTL_MS = 30 * 24 * 3600_000; // un prodotto trovato si rilegge dopo 30 giorni
const NOT_FOUND_TTL_MS = 24 * 3600_000; // un codice assente si riprova dopo un giorno
const OFF_TIMEOUT_MS = 8000;
const OFF_FIELDS =
  'code,product_name,product_name_it,generic_name_it,brands,quantity,countries,ingredients_text,ingredients_text_it,nutriments';

const COLUMNS =
  'barcode,found,name,brand,quantity,countries,ingredients,kcal,protein_g,carbs_g,sugars_g,fat_g,saturated_fat_g,' +
  'fiber_g,sodium_mg,calcium_mg,cholesterol_mg,source,source_url,fetched_at';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metodo non consentito.' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Funzione non configurata.' }, 500);

  let barcode: string | null = null;
  try {
    barcode = normalizeBarcode((await req.json())?.barcode);
  } catch {
    return json({ error: 'Richiesta non valida.' }, 400);
  }
  if (!barcode) return json({ error: 'Codice a barre non valido: controlla le cifre (EAN-13, EAN-8, UPC-A o UPC-E).' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: cached } = await admin.from('packaged_products').select(COLUMNS).eq('barcode', barcode).maybeSingle();
  const cachedRow = cached as unknown as (PackagedProductRow & { fetched_at: string }) | null;
  if (cachedRow) {
    const age = Date.now() - new Date(cachedRow.fetched_at).getTime();
    if (age < (cachedRow.found ? FOUND_TTL_MS : NOT_FOUND_TTL_MS)) return json({ product: cachedRow });
  }

  // Tetto alle letture nuove dell'ultima ora (trovate o no): oltre, si serve solo la cache.
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count: recent } = await admin
    .from('packaged_products')
    .select('barcode', { count: 'exact', head: true })
    .gte('fetched_at', hourAgo);
  if ((recent ?? 0) >= HOURLY_LIMIT) {
    if (cachedRow?.found) return json({ product: cachedRow, stale: true });
    return json({ error: 'Troppe ricerche di prodotti in questo momento. Riprova tra qualche minuto.' }, 429);
  }

  // Pulizia: i codici non trovati scaduti non servono più.
  await admin
    .from('packaged_products')
    .delete()
    .eq('found', false)
    .lt('fetched_at', new Date(Date.now() - NOT_FOUND_TTL_MS).toISOString());

  let row: PackagedProductRow;
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=${OFF_FIELDS}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
    });
    if (res.status === 404) {
      row = notFoundRow(barcode);
    } else if (!res.ok) {
      throw new Error(`Open Food Facts ${res.status}`);
    } else {
      const body = (await res.json()) as { status?: number; product?: Record<string, unknown> };
      row = body.status === 1 && body.product ? mapOpenFoodFactsProduct(barcode, body.product) : notFoundRow(barcode);
    }
  } catch (e) {
    console.error('lookup-barcode', barcode, String((e as Error)?.message ?? e));
    // Banca dati non raggiungibile: meglio una scheda vecchia che nessuna.
    if (cachedRow?.found) return json({ product: cachedRow, stale: true });
    return json({ error: 'La banca dati dei prodotti non risponde in questo momento. Riprova tra poco.' }, 502);
  }

  // Una scheda già letta non viene sostituita da un "non trovato" (prodotto momentaneamente
  // assente o rinominato nella banca dati): si tiene la scheda e si rimanda la prossima rilettura.
  if (!row.found && cachedRow?.found) {
    const fetched_at = new Date().toISOString();
    await admin.from('packaged_products').update({ fetched_at }).eq('barcode', barcode);
    return json({ product: { ...cachedRow, fetched_at }, stale: true });
  }

  const { data: saved, error } = await admin
    .from('packaged_products')
    .upsert({ ...row, fetched_at: new Date().toISOString() }, { onConflict: 'barcode' })
    .select(COLUMNS)
    .single();
  if (error) console.error('upsert packaged_products', barcode, error);

  return json({ product: saved ?? { ...row, fetched_at: new Date().toISOString() } });
});
