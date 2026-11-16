// Revisione degli alimenti proposti dall'agente (tabella food_candidates).
//
// Uso:
//   npm run candidates                          # elenca le proposte da verificare
//   npm run candidates -- --approve 12          # pubblica la proposta 12 nel catalogo
//   npm run candidates -- --reject 12 --note "valore ossalati non riscontrato"
//   npm run candidates -- --all                 # elenca tutte le richieste (ogni stato)
//
// Variabili (.env): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Dopo un'approvazione esegui `npm run export:catalog` per aggiornare il catalogo offline.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(import.meta.dirname, '..', '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Imposta SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nel file .env');
  process.exit(1);
}

const args = process.argv.slice(2);
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

async function rpc(name, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const approveId = valueOf('--approve');
const rejectId = valueOf('--reject');
const note = valueOf('--note') ?? null;

try {
  if (approveId) {
    const foodId = await rpc('approve_food_candidate', { candidate_id: Number(approveId), note });
    console.log(`Proposta ${approveId} approvata: alimento #${foodId} aggiunto al catalogo o completato.`);
    console.log('Ricorda: npm run export:catalog (catalogo offline).');
  } else if (rejectId) {
    await rpc('reject_food_candidate', { candidate_id: Number(rejectId), note });
    console.log(`Proposta ${rejectId} rifiutata.`);
  } else {
    const filter = args.includes('--all') ? '' : '&status=eq.da_verificare';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/food_candidates?select=*${filter}&order=created_at`, { headers });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const rows = await res.json();
    if (rows.length === 0) {
      console.log(args.includes('--all') ? 'Nessuna richiesta.' : 'Nessuna proposta da verificare.');
    }
    for (const c of rows) {
      console.log(`\n#${c.id} · ${c.status} · cercato: "${c.query}" · ${c.created_at.slice(0, 16).replace('T', ' ')}`);
      if (c.status === 'errore') console.log(`  errore: ${c.error}`);
      if (!c.name_it) {
        if (c.agent_notes) console.log(`  ${c.agent_notes}`);
        continue;
      }
      const range =
        c.oxalate_min_mg !== null && c.oxalate_max_mg !== null ? ` (fonti: ${c.oxalate_min_mg}–${c.oxalate_max_mg})` : '';
      console.log(`  ${c.name_it} [${c.category}] — EN: ${c.name_en}`);
      if (c.target_food_id) console.log(`  COMPLETA l'alimento #${c.target_food_id} già in catalogo: riempie solo i campi vuoti.`);
      console.log(
        c.oxalate_mg === null
          ? '  ossalati per 100 g: non ricavati (resta il dato per porzione della lista Harvard)'
          : `  ossalati ${c.oxalate_mg} mg/100 g${range} · ${c.oxalate_basis} · confidenza ${c.oxalate_confidence}`,
      );
      console.log(`  calcio ${c.calcium_mg} mg · colesterolo ${c.cholesterol_mg} mg · ${c.kcal} kcal`);
      console.log(`  P ${c.protein_g} g · C ${c.carbs_g} g · G ${c.fat_g} g · fibre ${c.fiber_g} g`);
      const optional = (v, unit) => (v === null || v === undefined ? 'dato non disponibile' : `${v} ${unit}`);
      console.log(`  saturi ${optional(c.saturated_fat_g, 'g')} · zuccheri ${optional(c.sugars_g, 'g')} · sodio ${optional(c.sodium_mg, 'mg')}`);
      console.log(`  porzione ${c.default_portion_g} g (${c.portion_label ?? '—'})`);
      console.log(`  fonti: ${c.oxalate_source} · ${c.nutrient_source}`);
      for (const s of c.sources ?? []) {
        console.log(`    ${s.seen_in_search ? '✓' : '?'} [${s.used_for}] ${s.title} — ${s.reported_value}\n      ${s.url}`);
      }
      if (c.notes) console.log(`  nota per l'utente: ${c.notes}`);
      if (c.agent_notes) console.log(`  note dell'agente:\n    ${c.agent_notes.replace(/\n/g, '\n    ')}`);
    }
    if (rows.some((c) => c.status === 'da_verificare')) {
      console.log('\nApprova con: npm run candidates -- --approve <id>   ·   Rifiuta con: --reject <id> --note "motivo"');
    }
  }
} catch (e) {
  console.error(`Errore: ${e.message}`);
  process.exit(1);
}
