// Aggiorna i nutrienti degli alimenti (fonte USDA) interrogando USDA FoodData Central.
//
// Uso:
//   node scripts/import-usda.mjs                 # anteprima (nessuna scrittura)
//   node scripts/import-usda.mjs --apply         # scrive su Supabase (richiede service role key)
//   node scripts/import-usda.mjs --limit 5       # solo i primi 5 alimenti
//
// Variabili (.env): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FDC_API_KEY (default DEMO_KEY).
// Gli alimenti con fonte CREA non vengono toccati. Gli ossalati non sono presenti in FDC
// e restano quelli del seed.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(import.meta.dirname, '..', '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const FDC_API_KEY = process.env.FDC_API_KEY || 'DEMO_KEY';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Imposta SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nel file .env');
  process.exit(1);
}

// Numeri nutriente FDC → colonne della tabella foods
const NUTRIENTS = {
  208: 'kcal',
  203: 'protein_g',
  205: 'carbs_g',
  204: 'fat_g',
  291: 'fiber_g',
  301: 'calcium_mg',
  601: 'cholesterol_mg',
};

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

async function fetchFoods() {
  const url = `${SUPABASE_URL}/rest/v1/foods?select=id,name_it,name_en,nutrient_source&name_en=not.is.null&order=id`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Supabase: ${res.status} ${await res.text()}`);
  return (await res.json()).filter((f) => f.nutrient_source.startsWith('USDA'));
}

async function searchFdc(query) {
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', FDC_API_KEY);
  url.searchParams.set('query', query);
  url.searchParams.set('dataType', 'SR Legacy,Foundation');
  url.searchParams.set('pageSize', '1');
  const res = await fetch(url);
  if (res.status === 429) throw new Error('Limite di richieste FDC raggiunto: usa una FDC_API_KEY personale.');
  if (!res.ok) throw new Error(`FDC: ${res.status}`);
  const [hit] = (await res.json()).foods ?? [];
  if (!hit) return null;
  const values = {};
  for (const n of hit.foodNutrients ?? []) {
    const column = NUTRIENTS[Number(n.nutrientNumber)];
    if (column && typeof n.value === 'number') values[column] = Math.round(n.value * 10) / 10;
  }
  return { fdcId: hit.fdcId, description: hit.description, values };
}

const foods = (await fetchFoods()).slice(0, LIMIT);
console.log(`${foods.length} alimenti USDA da verificare${APPLY ? '' : ' (anteprima, usa --apply per salvare)'}\n`);

for (const food of foods) {
  try {
    const hit = await searchFdc(food.name_en);
    if (!hit || Object.keys(hit.values).length === 0) {
      console.log(`– ${food.name_it}: nessun risultato FDC per "${food.name_en}"`);
      continue;
    }
    console.log(`✓ ${food.name_it} ← FDC ${hit.fdcId} "${hit.description}"`, hit.values);
    if (APPLY) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/foods?id=eq.${food.id}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ ...hit.values, nutrient_source: `USDA FoodData Central (FDC ${hit.fdcId})` }),
      });
      if (!res.ok) console.error(`  errore salvataggio: ${res.status} ${await res.text()}`);
    }
  } catch (e) {
    console.error(`✗ ${food.name_it}: ${e.message}`);
    if (String(e.message).includes('Limite')) break;
  }
  await new Promise((r) => setTimeout(r, 250)); // rispetta i limiti dell'API
}
