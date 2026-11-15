// Misura l'affidabilità dell'assistente sugli alimenti che la lista Harvard NON copre.
//
// Prende N alimenti dalla lista Harvard (oxalate_reference), li fa cercare all'agente
// SENZA lo strumento Harvard (quindi solo ricerca web e USDA, come per un alimento
// fuori lista) e confronta il risultato con il valore Harvard riportato alla stessa
// porzione. Usa lo stesso ciclo della Edge Function (supabase/functions/resolve-food/agent.ts).
//
// Uso:
//   ANTHROPIC_API_KEY=sk-ant-... node scripts/eval-agent.mjs            # 50 alimenti
//   ANTHROPIC_API_KEY=sk-ant-... node scripts/eval-agent.mjs --n 10     # prova ridotta
//   ... --seed 7            # campione diverso (stesso seed = stesso campione)
//   ... --out eval.json     # salva il dettaglio di ogni alimento
//
// ATTENZIONE AI COSTI: ogni alimento è una ricerca completa dell'agente (fino a 6
// ricerche web). Prova prima con --n 5 e guarda il consumo di token stampato alla fine.
//
// Variabili: ANTHROPIC_API_KEY solo dall'ambiente della shell (non va scritta in .env);
// dal file .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FDC_API_KEY.
// Opzionali: ANTHROPIC_MODEL (default claude-sonnet-5-5), ANTHROPIC_EFFORT (default medium).
//
// Servono le voci con peso della porzione verificato (serving_g): esegui prima
// `node scripts/enrich-reference.mjs --apply`. Il confronto è alla porzione Harvard:
//   mg per porzione dell'agente = oxalate_mg (per 100 g) × serving_g / 100
// Fasce Harvard per porzione: bassa < 2 mg · media 2–10 mg · alta > 10 mg.
//
// Come leggere il risultato: se le fasce corrette sono poche, l'agente non è pronto per
// gli alimenti che la lista non copre e va reso più prudente in prompt.ts.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAgent } from '../supabase/functions/resolve-food/agent.ts';

const root = resolve(import.meta.dirname, '..');
const envFile = resolve(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    // La chiave Anthropic non si legge mai da .env: solo dall'ambiente.
    if (m && m[1] !== 'ANTHROPIC_API_KEY' && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const args = process.argv.slice(2);
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const N = Number(valueOf('--n') ?? 50);
const SEED = Number(valueOf('--seed') ?? 1);
const OUT = valueOf('--out');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY } = process.env;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const EFFORT = process.env.ANTHROPIC_EFFORT ?? 'medium';
const FDC_API_KEY = process.env.FDC_API_KEY || 'DEMO_KEY';
const DEADLINE_MS = 135_000; // come nella Edge Function

export const tierOf = (mgPerServing) => (mgPerServing < 2 ? 'low' : mgPerServing <= 10 ? 'medium' : 'high');
export const median = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Generatore deterministico (mulberry32): stesso seed, stesso campione. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sample(rows, n, seed) {
  const random = rng(seed);
  const pool = [...rows];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

// Esecuzione diretta (non quando il file viene importato).
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  if (!ANTHROPIC_API_KEY) {
    console.error('Imposta ANTHROPIC_API_KEY nell\'ambiente: ANTHROPIC_API_KEY=sk-ant-... node scripts/eval-agent.mjs');
    process.exit(1);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Imposta SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nel file .env');
    process.exit(1);
  }
  if (!Number.isInteger(N) || N < 1) {
    console.error('--n deve essere un numero intero positivo.');
    process.exit(1);
  }

  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
  const get = async (path) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    return res.json();
  };

  const reference = await get(
    'oxalate_reference?select=id,name_en,name_it,category,serving,oxalate_mg_serving,tier,serving_g&serving_g=not.is.null&order=id',
  );
  if (reference.length === 0) {
    console.error('Nessuna voce Harvard con peso verificato: esegui prima `node scripts/enrich-reference.mjs --apply`.');
    process.exit(1);
  }
  // Il catalogo dà all'agente le categorie; i nomi non si passano come "già presenti",
  // altrimenti molti alimenti della lista verrebbero chiusi come "gia_presente".
  const categories = [...new Set((await get('foods?select=category')).map((f) => f.category))];
  const catalog = categories.map((category, i) => ({ id: -1 - i, name_it: `__categoria_${i}__`, category }));

  const items = sample(reference, Math.min(N, reference.length), SEED);
  console.log(
    `${items.length} alimenti (su ${reference.length} con peso verificato) · modello ${MODEL} · effort ${EFFORT || 'default'} · seed ${SEED}\n` +
      `Strumento Harvard disattivato: l'agente usa solo ricerca web e USDA.\n`,
  );

  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 };
  const details = [];

  for (const ref of items) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
    const started = Date.now();
    const expected = Number(ref.oxalate_mg_serving);
    const row = { name_en: ref.name_en, serving: ref.serving, serving_g: Number(ref.serving_g), expected_mg: expected, expected_tier: ref.tier };
    try {
      const outcome = await runAgent({
        // L'agente riceve il nome italiano, come lo scriverebbe un utente.
        query: ref.name_it || ref.name_en,
        signal: controller.signal,
        catalog,
        similar: [],
        harvardLookup: null,
        anthropicApiKey: ANTHROPIC_API_KEY,
        model: MODEL,
        effort: EFFORT,
        fdcApiKey: FDC_API_KEY,
        maxSearches: 6,
        onUsage: (u) => {
          for (const key of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) {
            usage[key] += Number(u[key]) || 0;
          }
          usage.web_search_requests += Number(u.server_tool_use?.web_search_requests) || 0;
        },
      });
      row.status = outcome.status;
      if (outcome.status === 'da_verificare') {
        const p = outcome.proposal;
        row.agent_mg_100g = p.oxalate_mg;
        row.agent_mg = Math.round(((p.oxalate_mg * row.serving_g) / 100) * 10) / 10;
        row.agent_tier = tierOf(row.agent_mg);
        row.tier_ok = row.agent_tier === ref.tier;
        row.error_mg = Math.round(Math.abs(row.agent_mg - expected) * 10) / 10;
        row.confidence = p.oxalate_confidence;
        row.basis = p.oxalate_basis;
        row.oxalate_source = p.oxalate_source;
        // La lista Harvard non doveva essere usata: se compare tra le fonti il confronto non vale.
        row.cited_harvard = p.sources.some((s) => /harvard/i.test(`${s.title} ${s.url}`)) || /harvard/i.test(p.oxalate_source);
      } else {
        row.note = outcome.agent_notes;
      }
    } catch (e) {
      row.status = 'errore';
      row.note = controller.signal.aborted ? 'tempo scaduto' : String(e?.message ?? e);
    } finally {
      clearTimeout(timer);
    }
    row.seconds = Math.round((Date.now() - started) / 1000);
    details.push(row);

    const mark = row.status !== 'da_verificare' ? '–' : row.tier_ok ? '✓' : '✗';
    console.log(
      `${mark} ${ref.name_en} · ${ref.serving} (${row.serving_g} g): Harvard ${expected} mg [${ref.tier}]` +
        (row.status === 'da_verificare'
          ? ` · agente ${row.agent_mg} mg [${row.agent_tier}] · errore ${row.error_mg} mg · confidenza ${row.confidence}${row.cited_harvard ? ' · ⚠ cita Harvard' : ''}`
          : ` · ${row.status}: ${row.note ?? ''}`) +
        ` · ${row.seconds}s`,
    );
  }

  // ---------------------------------------------------------------------
  // Riepilogo
  // ---------------------------------------------------------------------
  const proposed = details.filter((d) => d.status === 'da_verificare');
  const valid = proposed.filter((d) => !d.cited_harvard);
  const correct = valid.filter((d) => d.tier_ok);
  const pct = (a, b) => (b === 0 ? 'n/d' : `${Math.round((a / b) * 100)}%`);
  const count = (status) => details.filter((d) => d.status === status).length;

  console.log('\n— Riepilogo —');
  console.log(`Alimenti provati:            ${details.length}`);
  console.log(`Schede proposte:             ${proposed.length}  (non_trovato ${count('non_trovato')}, gia_presente ${count('gia_presente')}, errori ${count('errore')})`);
  if (proposed.length !== valid.length) {
    console.log(`Escluse dal confronto:       ${proposed.length - valid.length}  (citano la lista Harvard nonostante il divieto)`);
  }
  console.log(`Fasce corrette:              ${correct.length} su ${valid.length} (${pct(correct.length, valid.length)})`);
  console.log(`Errore mediano:              ${median(valid.map((d) => d.error_mg)) ?? 'n/d'} mg per porzione`);
  for (const level of ['alta', 'media', 'bassa']) {
    const group = valid.filter((d) => d.confidence === level);
    if (group.length > 0) {
      console.log(`  confidenza ${level.padEnd(5)}: ${group.filter((d) => d.tier_ok).length} su ${group.length} fasce corrette (${pct(group.filter((d) => d.tier_ok).length, group.length)})`);
    }
  }
  // L'errore che conta di più: un alimento "alto" per Harvard presentato come più basso.
  const underestimated = valid.filter((d) => d.expected_tier === 'high' && d.agent_tier !== 'high');
  console.log(`Alimenti alti sottostimati:  ${underestimated.length}${underestimated.length ? ' → ' + underestimated.map((d) => d.name_en).join(', ') : ''}`);
  console.log(
    `Consumo: ${usage.input_tokens} token in ingresso (+${usage.cache_read_input_tokens} dalla cache), ${usage.output_tokens} in uscita, ${usage.web_search_requests} ricerche web.`,
  );
  console.log(
    '\nNota: il confronto dice quanto l\'agente si avvicina alla lista Harvard partendo da altre fonti. Fonti diverse misurano\n' +
      'campioni diversi, quindi uno scarto non è per forza un errore; conta soprattutto la fascia e i casi sottostimati.',
  );

  if (OUT) {
    writeFileSync(resolve(process.cwd(), OUT), JSON.stringify({ model: MODEL, effort: EFFORT, seed: SEED, usage, details }, null, 2));
    console.log(`Dettaglio salvato in ${OUT}`);
  }
}
