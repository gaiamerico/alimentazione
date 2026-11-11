// Edge Function: cerca online un alimento non presente nel catalogo e lo aggiunge.
//
// 1. Verifica che l'utente abbia effettuato l'accesso (limite: MAX_PER_DAY aggiunte al giorno).
// 2. Se l'alimento esiste già (ricerca search_foods o nome identico) lo restituisce.
// 3. Claude identifica l'alimento (nome italiano/inglese, categoria, porzione) e stima
//    i nutrienti e gli ossalati per 100 g.
// 4. Se esiste una voce USDA FoodData Central corrispondente, i nutrienti USDA sostituiscono
//    le stime (gli ossalati non sono in USDA e restano la stima, con affidabilità ≤ media).
// 5. Inserisce l'alimento con la service role key e lo restituisce.
//
// Secrets: ANTHROPIC_API_KEY (obbligatoria), FDC_API_KEY (facoltativa, default DEMO_KEY).
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY sono forniti da Supabase.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_PER_DAY = 20;

const CATEGORIES = [
  'Bevande',
  'Carne',
  'Cereali e derivati',
  'Dolci e snack',
  'Erbe e spezie',
  'Frutta',
  'Frutta secca e semi',
  'Grassi e condimenti',
  'Latte e derivati',
  'Legumi',
  'Pesce',
  'Uova',
  'Verdure',
] as const;

const ANIMAL_CATEGORIES = new Set(['Latte e derivati', 'Uova', 'Carne', 'Pesce']);

const NUMERIC_FIELDS = [
  'kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'calcium_mg',
  'cholesterol_mg',
  'oxalate_mg',
] as const;

// Numeri nutriente USDA FDC → colonne della tabella foods
const FDC_NUTRIENTS: Record<number, (typeof NUMERIC_FIELDS)[number]> = {
  208: 'kcal',
  203: 'protein_g',
  205: 'carbs_g',
  204: 'fat_g',
  291: 'fiber_g',
  301: 'calcium_mg',
  601: 'cholesterol_mg',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const number = { type: 'number' };
const FOOD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'is_food',
    'name_it',
    'name_en',
    'usda_query',
    'category',
    'synonyms',
    ...NUMERIC_FIELDS,
    'oxalate_confidence',
    'default_portion_g',
    'portion_label',
    'notes',
  ],
  properties: {
    is_food: { type: 'boolean', description: 'false se il testo non è un alimento riconoscibile' },
    name_it: { type: 'string', description: 'Nome italiano standard, iniziale maiuscola, es. "Cavolo nero cotto"' },
    name_en: { type: 'string', description: 'Nome inglese' },
    usda_query: {
      type: 'string',
      description:
        'Descrizione in stile USDA SR Legacy da cercare su FoodData Central (es. "Kale, cooked, boiled"); stringa vuota se è un prodotto tipico italiano senza equivalente USDA affidabile',
    },
    category: { type: 'string', enum: [...CATEGORIES] },
    synonyms: { type: 'string', description: 'Sinonimi e nomi regionali italiani separati da virgola, o stringa vuota' },
    kcal: number,
    protein_g: number,
    carbs_g: number,
    fat_g: number,
    fiber_g: number,
    calcium_mg: number,
    cholesterol_mg: number,
    oxalate_mg: { type: 'number', description: 'Ossalati totali in mg per 100 g di parte edibile' },
    oxalate_confidence: { type: 'string', enum: ['media', 'bassa'] },
    default_portion_g: { type: 'number', description: 'Porzione tipica in grammi' },
    portion_label: { type: 'string', description: 'Es. "1 frutto medio", "½ tazza", "1 fetta"' },
    notes: { type: 'string', description: 'Nota breve utile per chi segue una dieta a basso ossalato, o stringa vuota' },
  },
};

const SYSTEM_PROMPT = `Sei un nutrizionista che compila un catalogo di alimenti per un'app italiana dedicata a chi deve limitare gli ossalati (calcoli renali) e bilanciarli con il calcio.
Ricevi il testo che un utente ha cercato e non ha trovato nel catalogo. Identifica l'alimento più probabile (correggi refusi, scegli la forma più comune: crudo se non specificato, a meno che l'alimento si consumi di norma cotto) e fornisci i valori per 100 g di parte edibile.
- Nutrienti: usa i valori di USDA FoodData Central o delle tabelle CREA che conosci.
- Ossalati: basati su Harvard T.H. Chan, Oxalate.org, OHF o letteratura. Gli alimenti di origine animale hanno ossalati trascurabili (0). Usa "media" solo se conosci valori pubblicati coerenti, altrimenti "bassa".
- Se il testo non è un alimento (o è troppo generico per stimare valori sensati), imposta is_food a false e gli altri campi a valori vuoti o 0.
Rispondi solo con i dati richiesti.`;

interface AiFood {
  is_food: boolean;
  name_it: string;
  name_en: string;
  usda_query: string;
  category: string;
  synonyms: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  calcium_mg: number;
  cholesterol_mg: number;
  oxalate_mg: number;
  oxalate_confidence: 'media' | 'bassa';
  default_portion_g: number;
  portion_label: string;
  notes: string;
}

async function askClaude(query: string): Promise<AiFood | null> {
  const client = new Anthropic(); // legge ANTHROPIC_API_KEY
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: FOOD_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Alimento cercato: ${query}` }],
  });
  if (response.stop_reason !== 'end_turn') return null;
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') return null;
  return JSON.parse(text.text) as AiFood;
}

async function searchFdc(query: string): Promise<{ fdcId: number; description: string; values: Record<string, number> } | null> {
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', Deno.env.get('FDC_API_KEY') || 'DEMO_KEY');
  url.searchParams.set('query', query);
  url.searchParams.set('dataType', 'SR Legacy,Foundation');
  url.searchParams.set('pageSize', '1');
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const [hit] = (await res.json()).foods ?? [];
  if (!hit) return null;
  const values: Record<string, number> = {};
  for (const n of hit.foodNutrients ?? []) {
    const column = FDC_NUTRIENTS[Number(n.nutrientNumber)];
    if (column && typeof n.value === 'number') values[column] = n.value;
  }
  // Senza energia e macronutrienti la voce non è utilizzabile.
  if (!['kcal', 'protein_g', 'carbs_g', 'fat_g'].every((k) => k in values)) return null;
  return { fdcId: hit.fdcId, description: hit.description, values };
}

/** Arrotonda e limita ai vincoli delle colonne numeric della tabella. */
function clamp(value: unknown, max: number, decimals = 1): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  const f = 10 ** decimals;
  return Math.min(Math.round(n * f) / f, max);
}

function cleanText(value: unknown, maxLength: number): string | null {
  const s = String(value ?? '').trim().slice(0, maxLength);
  return s === '' ? null : s;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  if (!user) return json({ error: 'unauthorized', message: 'Accedi per cercare alimenti online.' }, 401);

  let query = '';
  try {
    query = String((await req.json())?.query ?? '').trim().replace(/\s+/g, ' ');
  } catch {
    /* corpo non valido */
  }
  if (query.length < 2 || query.length > 80) {
    return json({ error: 'invalid_query', message: 'Inserisci un nome tra 2 e 80 caratteri.' }, 400);
  }

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // Già presente? (es. aggiunto da un altro utente nel frattempo)
  const { data: existing } = await admin.rpc('search_foods', { q: query, result_limit: 1 });
  if (existing?.length) return json({ food: existing[0], created: false });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from('foods')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', user.id)
    .gte('created_at', since);
  if ((count ?? 0) >= MAX_PER_DAY) {
    return json({ error: 'rate_limited', message: `Puoi aggiungere al massimo ${MAX_PER_DAY} alimenti al giorno.` }, 429);
  }

  let ai: AiFood | null;
  try {
    ai = await askClaude(query);
  } catch (e) {
    console.error('Claude:', e);
    return json({ error: 'lookup_failed', message: 'Ricerca online non riuscita: riprova più tardi.' }, 502);
  }
  if (!ai?.is_food || !ai.name_it?.trim() || !CATEGORIES.includes(ai.category as (typeof CATEGORIES)[number])) {
    return json({ error: 'not_found', message: `Nessun alimento trovato online per "${query}".` }, 404);
  }

  const nameIt = ai.name_it.trim().slice(0, 120);
  const { data: sameName } = await admin.from('foods').select('*').ilike('name_it', nameIt).limit(1);
  if (sameName?.length) return json({ food: sameName[0], created: false });

  let fdc: Awaited<ReturnType<typeof searchFdc>> = null;
  if (ai.usda_query?.trim()) {
    try {
      fdc = await searchFdc(ai.usda_query.trim());
    } catch (e) {
      console.warn('FDC:', e);
    }
  }
  const nutrients: Record<string, unknown> = { ...ai, ...(fdc?.values ?? {}) };
  const isAnimal = ANIMAL_CATEGORIES.has(ai.category);

  const row = {
    name_it: nameIt,
    name_en: cleanText(ai.name_en, 160),
    category: ai.category,
    synonyms: cleanText(ai.synonyms, 300),
    kcal: clamp(nutrients.kcal, 9999),
    protein_g: clamp(nutrients.protein_g, 100, 2),
    carbs_g: clamp(nutrients.carbs_g, 100, 2),
    fat_g: clamp(nutrients.fat_g, 100, 2),
    fiber_g: clamp(nutrients.fiber_g, 100, 2),
    calcium_mg: clamp(nutrients.calcium_mg, 99999),
    cholesterol_mg: clamp(nutrients.cholesterol_mg, 99999),
    oxalate_mg: clamp(ai.oxalate_mg, 99999),
    // Una stima automatica non è mai ad alta affidabilità.
    oxalate_confidence: ai.oxalate_confidence === 'media' ? 'media' : 'bassa',
    default_portion_g: clamp(ai.default_portion_g, 5000) || 100,
    portion_label: cleanText(ai.portion_label, 60),
    nutrient_source: fdc
      ? `USDA FoodData Central (FDC ${fdc.fdcId} "${fdc.description}")`.slice(0, 200)
      : 'Stima AI (Claude) da tabelle USDA/CREA',
    oxalate_source: isAnimal ? 'Trascurabile (alimento di origine animale)' : 'Stima AI (Claude) da letteratura',
    notes: [cleanText(ai.notes, 300), 'Aggiunto automaticamente da una ricerca online: valori indicativi da verificare.']
      .filter(Boolean)
      .join(' '),
    created_by: user.id,
  };

  const { data: inserted, error } = await admin.from('foods').insert(row).select('*').single();
  if (error) {
    // Inserito in contemporanea da un'altra richiesta: restituiamo quello.
    if (error.code === '23505') {
      const { data } = await admin.from('foods').select('*').eq('name_it', nameIt).single();
      if (data) return json({ food: data, created: false });
    }
    console.error('Insert:', error);
    return json({ error: 'save_failed', message: 'Impossibile salvare l’alimento.' }, 500);
  }
  return json({ food: inserted, created: true }, 201);
});
