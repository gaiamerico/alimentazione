// Arricchisce la lista Harvard (tabella oxalate_reference) con il peso della porzione
// preso da USDA FoodData Central e calcola l'ossalato per 100 g.
//
// Uso:
//   node scripts/enrich-reference.mjs                    # anteprima (nessuna scrittura)
//   node scripts/enrich-reference.mjs --apply            # scrive fdc_id, serving_g, oxalate_mg_100g
//   node scripts/enrich-reference.mjs --only spinach     # solo le voci il cui nome contiene il testo
//   node scripts/enrich-reference.mjs --limit 20         # solo le prime 20 voci
//   node scripts/enrich-reference.mjs --from-seed        # legge le voci da supabase/seed_oxalate_reference.sql
//                                                        # (solo anteprima, non serve il database)
//
// Variabili (.env): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FDC_API_KEY (default DEMO_KEY:
// circa 30 richieste l'ora, non basta per le 289 voci — usa una chiave gratuita di api.data.gov).
//
// Regole (non allentarle: un peso sbagliato produce un valore per 100 g sbagliato):
//   - serving_g si compila solo se il peso viene da USDA PER QUELLA MISURA (es. "½ cup" con
//     "1 cup = 180 g" → 90 g). Sono ammesse le conversioni esatte di unità: 1 oz = 28,35 g e,
//     per i liquidi, 1 fl oz = 29,57 ml (1 cup = 8 fl oz).
//   - Porzioni come "1", "5–6", "¼ cuke" restano null se USDA non dà il peso di quella misura.
//     Se USDA ha più pesi diversi per la stessa misura ("cup, chopped" / "cup, sliced") e nessuno
//     senza qualifica, la voce resta null: non si sceglie a occhio.
//   - La voce USDA deve essere lo stesso alimento nello stesso stato: tutte le parole del nome
//     Harvard, lo stesso stato (crudo, cotto, in scatola, secco…) e nessuna parola in più che
//     cambi alimento o varietà. Se il nome Harvard non indica lo stato ("White rice", "Quinoa")
//     il peso resta null: una tazza di riso crudo e una di riso cotto non pesano uguale.
//   - Solo la misura USDA senza qualifica: "cup, chopped" non vale per "cup".
//   - Con --apply, una voce senza peso giustificato viene riportata a null anche se una
//     esecuzione precedente aveva scritto un valore.
//   - Il valore per porzione del PDF (oxalate_mg_serving) non viene mai modificato.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envFile = resolve(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const args = process.argv.slice(2);
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const APPLY = args.includes('--apply');
const FROM_SEED = args.includes('--from-seed');
const LIMIT = valueOf('--limit') ? Number(valueOf('--limit')) : Infinity;
const ONLY = valueOf('--only')?.toLowerCase();
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const FDC_API_KEY = process.env.FDC_API_KEY || 'DEMO_KEY';

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

const OZ_G = 28.35; // 1 oz (peso)
const FL_OZ_PER_CUP = 8; // 1 cup USA = 8 fl oz

// ---------------------------------------------------------------------
// Porzione Harvard → { amount, unit }
// ---------------------------------------------------------------------
const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const UNIT_ALIASES = {
  cup: 'cup', cups: 'cup',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  oz: 'oz',
  slice: 'slice', slices: 'slice',
  med: 'medium', medium: 'medium', sm: 'small', small: 'small', large: 'large', lg: 'large',
  clove: 'clove', cloves: 'clove',
  ring: 'ring', rings: 'ring',
  half: 'half', halves: 'half',
  pc: 'piece', piece: 'piece', pieces: 'piece',
  biscuit: 'biscuit', biscuits: 'biscuit',
  patty: 'patty', roll: 'roll',
};

/** "1½ cup" → { amount: 1.5, unit: 'cup' }; null se la quantità non è un numero preciso (es. "5–6"). */
export function parseServing(serving) {
  const text = serving.trim();
  const m = text.match(/^(\d+(?:\.\d+)?)?\s*([½¼¾⅓⅔⅛])?\s*(.*)$/);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  const rest = m[3].trim().toLowerCase();
  if (/^[–-]/.test(rest)) return null; // intervallo: "5–6"
  const amount = (m[1] ? Number(m[1]) : 0) + (m[2] ? FRACTIONS[m[2]] : 0);
  if (!(amount > 0)) return null;
  if (rest === '') return { amount, unit: '' }; // conteggio senza misura: "1", "2"
  return { amount, unit: UNIT_ALIASES[rest] ?? null, rawUnit: rest };
}

// ---------------------------------------------------------------------
// USDA
// ---------------------------------------------------------------------
const STOP_WORDS = new Set(['w', 'with', 'and', 'or', 'the', 'of', 'in']);
const tokens = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9% ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP_WORDS.has(t));
const stem = (t) => (t.length > 3 ? t.replace(/(es|s)$/, '') : t);

// Stato dell'alimento: crudo e cotto (o secco e pronto) pesano in modo diverso a parità di
// misura, quindi la voce USDA deve avere lo stesso stato del nome Harvard.
const STATE_CLASS = {
  raw: 'crudo', uncooked: 'crudo', crude: 'crudo',
  cooked: 'cotto', boiled: 'cotto', baked: 'cotto', roasted: 'cotto', toasted: 'cotto', microwaved: 'cotto',
  steamed: 'cotto', fried: 'cotto', heated: 'cotto', prepared: 'cotto',
  canned: 'in scatola',
  dried: 'secco', dry: 'secco', dehydrated: 'secco',
  frozen: 'surgelato', unprepared: 'surgelato',
  concentrate: 'concentrato', undiluted: 'concentrato',
};
// Parole in più della descrizione USDA che non cambiano né l'alimento né il peso della misura.
const NEUTRAL_WORDS = new Set([
  'drained', 'without', 'salt', 'added', 'all', 'varieties', 'commercial', 'types', 'mature', 'seeds',
  'year', 'round', 'average', 'nfs', 'unsalted', 'salted',
]);

const stateClasses = (words) => new Set(words.map((w) => STATE_CLASS[w]).filter(Boolean));

/**
 * La voce USDA descrive lo stesso alimento nello stesso stato?
 * - tutte le parole del nome Harvard compaiono nella descrizione (parole intere);
 * - lo stato (crudo, cotto, in scatola, secco…) è dichiarato dal nome Harvard ed è lo stesso;
 * - la descrizione non aggiunge altre parole (varietà, altri ingredienti, "peeled"…),
 *   a parte quelle che non cambiano il peso ("drained", "without salt").
 * Restituisce { ok } oppure { ok: false, reason }.
 */
export function matchFood(nameEn, description) {
  const want = tokens(nameEn);
  const have = tokens(description);
  const wantStems = new Set(want.map(stem));
  const haveStems = new Set(have.map(stem));
  if (!want.every((t) => haveStems.has(stem(t)))) return { ok: false, reason: 'nome diverso' };

  const wantState = stateClasses(want);
  if (wantState.size === 0) return { ok: false, reason: 'il nome Harvard non indica lo stato (crudo, cotto…)' };
  const haveState = stateClasses(have);
  if (wantState.size !== haveState.size || [...wantState].some((c) => !haveState.has(c))) {
    return { ok: false, reason: 'stato diverso' };
  }
  const extra = have.filter((t) => !wantStems.has(stem(t)) && !STATE_CLASS[t] && !NEUTRAL_WORDS.has(t));
  if (extra.length > 0) return { ok: false, reason: `la voce USDA aggiunge "${extra.join(' ')}"` };
  return { ok: true };
}

export const describesSameFood = (nameEn, description) => matchFood(nameEn, description).ok;

class RateLimitError extends Error {}

async function fdc(path, params = {}) {
  const url = new URL(`https://api.nal.usda.gov/fdc/v1/${path}`);
  url.searchParams.set('api_key', FDC_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (res.status === 429) throw new RateLimitError('Limite di richieste USDA raggiunto: usa una FDC_API_KEY personale o riprova più tardi.');
  if (!res.ok) throw new Error(`USDA FDC ${res.status}`);
  await new Promise((r) => setTimeout(r, 350)); // rispetta i limiti dell'API
  return res.json();
}

async function findCandidates(nameEn) {
  // Nomi con alternative ("Danish / cinnamon roll") non indicano un solo alimento.
  if (nameEn.includes(' / ')) return [];
  const query = nameEn.replace(/\bw\/\s*/g, 'with ');
  const data = await fdc('foods/search', { query, dataType: 'SR Legacy,Foundation', pageSize: '10' });
  // Una sola voce: quella con la descrizione più breve tra le corrispondenze esatte.
  // Niente ripiego su una seconda voce: se questa non ha la misura, il peso resta null.
  return (data.foods ?? [])
    .filter((f) => describesSameFood(nameEn, f.description))
    .sort((a, b) => tokens(a.description).length - tokens(b.description).length)
    .slice(0, 1);
}

/** Unità e qualifica di una porzione USDA: "cup, chopped" → { unit: 'cup', qualifier: 'chopped' }. */
function portionMeasure(p) {
  const unitName = p.measureUnit?.name && p.measureUnit.name !== 'undetermined' ? p.measureUnit.name : '';
  const label = [unitName, p.modifier, p.portionDescription].filter(Boolean).join(' ').toLowerCase().trim();
  const m = label.match(/^([a-z]+)\b[\s,]*(.*)$/);
  if (!m) return { label, unit: null, qualifier: '' };
  return { label, unit: UNIT_ALIASES[m[1]] ?? null, qualifier: m[2].trim() };
}

/**
 * Peso in grammi di una unità della misura richiesta, dalle porzioni USDA.
 * Restituisce { grams, via } oppure { reason } se la misura manca o è ambigua.
 */
export function gramsPerUnit(portions, unit, isLiquid) {
  const usable = (portions ?? []).filter((p) => typeof p.gramWeight === 'number' && p.gramWeight > 0 && (p.amount ?? 1) > 0);
  const found = [];
  for (const p of usable) {
    const measure = portionMeasure(p);
    const perUnit = p.gramWeight / (p.amount ?? 1);
    if (measure.unit === unit) {
      found.push({ grams: perUnit, qualifier: measure.qualifier, via: `"${measure.label}" = ${p.gramWeight} g` });
    } else if (isLiquid && (unit === 'floz' || unit === 'cup')) {
      // Liquidi: conversioni esatte tra fl oz e cup (1 cup = 8 fl oz).
      const flOz = measure.label.match(/(\d+(?:\.\d+)?)\s*fl\.? ?oz/);
      const isPlainFlOz = /^fl\.? ?oz$/.test(measure.label);
      let perFlOz = null;
      if (isPlainFlOz) perFlOz = perUnit;
      else if (flOz) perFlOz = perUnit / Number(flOz[1]);
      else if (measure.unit === 'cup' && measure.qualifier === '') perFlOz = perUnit / FL_OZ_PER_CUP;
      if (perFlOz !== null) {
        const grams = unit === 'cup' ? perFlOz * FL_OZ_PER_CUP : perFlOz;
        found.push({ grams, qualifier: '', via: `"${measure.label}" = ${p.gramWeight} g (conversione fl oz/cup)` });
      }
    }
  }
  if (found.length === 0) return { reason: 'USDA non riporta il peso di questa misura' };
  // Solo la misura senza qualifica: "cup, chopped" non è la "cup" della lista Harvard.
  const pool = found.filter((f) => f.qualifier === '');
  if (pool.length === 0) {
    return { reason: `USDA riporta questa misura solo con una qualifica (${found.map((f) => f.via).join('; ')})` };
  }
  const min = Math.min(...pool.map((f) => f.grams));
  const max = Math.max(...pool.map((f) => f.grams));
  // Più pesi per la stessa misura: si accettano solo se coincidono (entro il 3%).
  if (max / min > 1.03) return { reason: `USDA ha pesi diversi per questa misura (${pool.map((f) => f.via).join('; ')})` };
  return { grams: pool[0].grams, via: pool[0].via };
}

// ---------------------------------------------------------------------
// Una voce della lista
// ---------------------------------------------------------------------
const round1 = (n) => Math.round(n * 10) / 10;

async function enrich(row) {
  const serving = parseServing(row.serving);
  if (!serving) return { reason: 'porzione non numerica' };
  const isLiquid = row.category === 'Beverages';

  // Once di peso: conversione esatta, non serve USDA.
  if (serving.unit === 'oz' && !isLiquid) {
    const grams = serving.amount * OZ_G;
    return { serving_g: grams, via: `${serving.amount} oz × ${OZ_G} g` };
  }
  if (serving.unit === '') return { reason: 'porzione a pezzo senza misura: USDA non ne indica il peso' };
  if (serving.unit === null) return { reason: `misura "${serving.rawUnit}" non riconosciuta` };

  const unit = serving.unit === 'oz' ? 'floz' : serving.unit; // bevande: "oz" = once fluide
  // Il nome non dice lo stato (es. "White rice", "Quinoa"): crudo e cotto pesano diversamente,
  // quindi non si sceglie una voce USDA a occhio e non si spende una richiesta.
  if (matchFood(row.name_en, row.name_en).reason?.startsWith('il nome Harvard')) {
    return { reason: 'il nome Harvard non indica lo stato (crudo, cotto…): peso non attribuibile' };
  }
  const candidates = await findCandidates(row.name_en);
  if (candidates.length === 0) return { reason: 'nessuna voce USDA con lo stesso nome e lo stesso stato' };

  let lastReason = '';
  for (const candidate of candidates) {
    const food = await fdc(`food/${candidate.fdcId}`);
    const weight = gramsPerUnit(food.foodPortions, unit, isLiquid);
    if (weight.grams) {
      return {
        fdc_id: candidate.fdcId,
        serving_g: serving.amount * weight.grams,
        via: `FDC ${candidate.fdcId} "${candidate.description}", ${weight.via}`,
      };
    }
    lastReason = `FDC ${candidate.fdcId} "${candidate.description}": ${weight.reason}`;
  }
  return { reason: lastReason };
}

// ---------------------------------------------------------------------
// Lettura delle voci
// ---------------------------------------------------------------------
async function loadRows() {
  if (FROM_SEED) {
    const sql = readFileSync(resolve(root, 'supabase/seed_oxalate_reference.sql'), 'utf8');
    const re = /^\s+\('((?:[^']|'')+)', '([^']+)', '([^']+)', ([0-9.]+), '(?:low|medium|high)'\)/gm;
    return [...sql.matchAll(re)].map((m, i) => ({
      id: i + 1,
      name_en: m[1].replaceAll("''", "'"),
      category: m[2],
      serving: m[3],
      oxalate_mg_serving: Number(m[4]),
    }));
  }
  const url = `${SUPABASE_URL}/rest/v1/oxalate_reference?select=id,name_en,category,serving,oxalate_mg_serving&order=id`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Supabase: ${res.status} ${await res.text()}`);
  return res.json();
}

// Esecuzione diretta (non quando il file viene importato dai test).
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  if (APPLY && FROM_SEED) {
    console.error('--from-seed è solo per l\'anteprima: con --apply le voci si leggono dal database.');
    process.exit(1);
  }
  if (!FROM_SEED && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
    console.error('Imposta SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nel file .env (oppure usa --from-seed per un\'anteprima).');
    process.exit(1);
  }

  const rows = (await loadRows()).filter((r) => !ONLY || r.name_en.toLowerCase().includes(ONLY)).slice(0, LIMIT);
  console.log(`${rows.length} voci della lista Harvard${APPLY ? '' : ' (anteprima, usa --apply per salvare)'}`);
  if (FDC_API_KEY === 'DEMO_KEY') console.log('Attenzione: FDC_API_KEY=DEMO_KEY ha limiti molto stretti (circa 30 richieste l\'ora).');
  console.log('');

  let done = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      const result = await enrich(row);
      if (!result.serving_g) {
        skipped++;
        console.log(`– ${row.name_en} · ${row.serving}: ${result.reason}`);
        // Esito definitivo (non un errore di rete): si azzerano eventuali valori scritti in passato.
        if (APPLY) {
          const res = await fetch(`${SUPABASE_URL}/rest/v1/oxalate_reference?id=eq.${row.id}`, {
            method: 'PATCH',
            headers: { ...headers, Prefer: 'return=minimal' },
            body: JSON.stringify({ fdc_id: null, serving_g: null, oxalate_mg_100g: null }),
          });
          if (!res.ok) console.error(`  errore salvataggio: ${res.status} ${await res.text()}`);
        }
        continue;
      }
      const serving_g = round1(result.serving_g);
      const oxalate_mg_100g = round1((Number(row.oxalate_mg_serving) / result.serving_g) * 100);
      done++;
      console.log(
        `✓ ${row.name_en} · ${row.serving} = ${serving_g} g → ${row.oxalate_mg_serving} mg/porzione = ${oxalate_mg_100g} mg/100 g\n    ${result.via}`,
      );
      if (APPLY) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/oxalate_reference?id=eq.${row.id}`, {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({ fdc_id: result.fdc_id ?? null, serving_g, oxalate_mg_100g }),
        });
        if (!res.ok) console.error(`  errore salvataggio: ${res.status} ${await res.text()}`);
      }
    } catch (e) {
      console.error(`✗ ${row.name_en}: ${e.message}`);
      if (e instanceof RateLimitError) break;
    }
  }
  console.log(`\n${done} voci con peso verificato, ${skipped} lasciate senza peso (serving_g e oxalate_mg_100g restano null).`);
}
