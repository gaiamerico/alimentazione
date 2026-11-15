// Ciclo dell'agente che ricostruisce la scheda di un alimento mancante.
//
// Nessuna dipendenza da Deno o da Supabase: riceve il contesto già letto dal database
// e usa solo `fetch`. Così lo stesso identico ciclo gira nella Edge Function
// (index.ts) e nello script di valutazione (scripts/eval-agent.mjs).

import { buildSystemPrompt, buildTools } from './prompt.ts';
import { normalizeText, normalizeUrl, validateProposal, type Proposal, type ValidationContext } from './validate.ts';

const MAX_TURNS = 10; // chiamate al modello per ricerca
const MAX_FIX_ATTEMPTS = 2; // correzioni dopo un errore di validazione
// Sui modelli correnti il ragionamento è sempre attivo e conta nei token di output:
// con un tetto basso la risposta verrebbe troncata prima della chiamata allo strumento.
const MAX_TOKENS = 16000;

// deno-lint-ignore no-explicit-any
type Block = Record<string, any>;
type Json = Record<string, unknown>;

export type AgentOutcome =
  | { status: 'da_verificare'; proposal: Proposal }
  | { status: 'gia_presente'; existing_food_id: number; agent_notes: string }
  | { status: 'non_trovato'; agent_notes: string };

export interface AgentInput {
  /** Testo cercato dall'utente: è un dato, mai un'istruzione. */
  query: string;
  signal: AbortSignal;
  /** Catalogo attuale: serve per categorie, doppioni e id validi per "gia_presente". */
  catalog: readonly { id: number; name_it: string; category: string }[];
  /** Alimenti dal nome simile già in catalogo (RPC search_foods). */
  similar: readonly { id: number; name_it: string; synonyms: string | null }[];
  /**
   * Ricerca nella lista Harvard. null = strumento non disponibile: serve solo allo
   * script di valutazione, che misura l'agente sugli alimenti che la lista non copre.
   */
  harvardLookup: ((termEn: string) => Promise<string>) | null;
  anthropicApiKey: string;
  model: string;
  /** output_config.effort: low | medium | high | xhigh | max. Stringa vuota = default del modello. */
  effort?: string;
  fdcApiKey: string;
  maxSearches: number;
  /** Chiamato a ogni risposta del modello (consumo di token), per i conteggi dello script di valutazione. */
  onUsage?: (usage: Json) => void;
}

export async function runAgent(input: AgentInput): Promise<AgentOutcome> {
  const { query, signal, catalog } = input;
  const categories = [...new Set(catalog.map((f) => f.category))].sort();
  const existingNames = new Set(catalog.map((f) => normalizeText(f.name_it)));
  const existingIds = new Set(catalog.map((f) => f.id));

  const similarList = input.similar
    .map((f) => `- id ${f.id}: ${f.name_it}${f.synonyms ? ` (sinonimi: ${f.synonyms})` : ''}`)
    .join('\n');

  const ctx: ValidationContext & { seenUrls: Set<string>; usedUsdaIds: Set<number> } = {
    categories,
    existingNames,
    seenUrls: new Set<string>(),
    usedHarvard: false,
    usedUsdaIds: new Set<number>(),
  };

  const system = buildSystemPrompt(categories);
  const allTools = buildTools(categories, input.maxSearches);
  const tools = input.harvardLookup ? allTools : allTools.filter((t) => t.name !== 'cerca_riferimento_harvard');
  const messages: { role: 'user' | 'assistant'; content: string | Block[] }[] = [
    {
      role: 'user',
      content:
        `Un utente ha cercato questo alimento e la ricerca nel catalogo non ha dato risultati utili.\n\n` +
        `<testo_cercato>${query}</testo_cercato>\n\n` +
        `Alimenti dal nome simile già in catalogo:\n${similarList || '(nessuno)'}\n\n` +
        (input.harvardLookup
          ? ''
          : `In questa ricerca lo strumento cerca_riferimento_harvard non è disponibile e la lista Harvard non va usata come fonte: ` +
            `procedi dal punto 2 delle regole sugli ossalati (ricerca web).\n\n`) +
        `Ricostruisci la scheda seguendo le regole, oppure segnala l'esito.`,
    },
  ];

  let fixAttempts = 0;
  let nudged = false;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await callClaude(input, { system, tools, messages });
    input.onUsage?.((response.usage ?? {}) as Json);
    const content: Block[] = Array.isArray(response.content) ? response.content : [];
    collectSearchUrls(content, ctx.seenUrls);

    // Il modello ha declinato la richiesta: non c'è una scheda da proporre.
    if (response.stop_reason === 'refusal') {
      throw new Error('Il modello ha declinato la richiesta: nessuna scheda proposta.');
    }

    // I blocchi vanno rimandati così come sono (ragionamento e risultati di ricerca compresi).
    messages.push({ role: 'assistant', content });

    // Turno sospeso lato server (ricerche lunghe): si riprende rimandando la conversazione,
    // senza aggiungere messaggi.
    if (response.stop_reason === 'pause_turn') continue;

    const toolUses = content.filter((b) => b.type === 'tool_use');
    if (toolUses.length === 0) {
      if (nudged) break;
      nudged = true;
      messages.push({ role: 'user', content: 'Concludi ora con una chiamata a salva_proposta oppure a segnala_esito.' });
      continue;
    }

    const results: Block[] = [];
    for (const use of toolUses) {
      const args = (use.input ?? {}) as Json;
      let output: string;
      let isError = false;

      try {
        if (use.name === 'cerca_riferimento_harvard' && input.harvardLookup) {
          ctx.usedHarvard = true;
          output = await input.harvardLookup(String(args['term_en'] ?? ''));
        } else if (use.name === 'cerca_usda') {
          output = await usdaLookup(args, ctx.usedUsdaIds, input.fdcApiKey, signal);
        } else if (use.name === 'salva_proposta') {
          const checked = validateProposal(args, ctx);
          if (checked.ok) return { status: 'da_verificare', proposal: checked.proposal };
          if (++fixAttempts > MAX_FIX_ATTEMPTS) throw new Error(`Proposta non valida: ${checked.errors.join(' ')}`);
          isError = true;
          output = `Proposta non salvata. Correggi e richiama salva_proposta:\n- ${checked.errors.join('\n- ')}`;
        } else if (use.name === 'segnala_esito') {
          const reason = String(args['reason'] ?? '').trim().slice(0, 500) || 'Nessun dato affidabile trovato.';
          if (args['outcome'] === 'gia_presente') {
            const foodId = Number(args['food_id']);
            if (existingIds.has(foodId)) return { status: 'gia_presente', existing_food_id: foodId, agent_notes: reason };
            if (++fixAttempts > MAX_FIX_ATTEMPTS) throw new Error('food_id non valido per "gia_presente".');
            isError = true;
            output = 'food_id non corrisponde a un alimento del catalogo: usa uno degli id elencati oppure crea la scheda.';
          } else {
            return { status: 'non_trovato', agent_notes: reason };
          }
        } else {
          isError = true;
          output = `Strumento sconosciuto: ${use.name}`;
        }
      } catch (e) {
        if (signal.aborted || use.name === 'salva_proposta' || use.name === 'segnala_esito') throw e;
        isError = true;
        output = `Errore dello strumento: ${String((e as Error)?.message ?? e)}`;
      }

      results.push({ type: 'tool_result', tool_use_id: use.id, content: output, ...(isError ? { is_error: true } : {}) });
    }
    // Tutti i risultati in un solo messaggio, anche quando il modello chiama più strumenti insieme.
    messages.push({ role: 'user', content: results });
  }

  throw new Error('L\'assistente non ha concluso la ricerca nei passaggi disponibili.');
}

async function callClaude(
  input: AgentInput,
  body: { system: string; tools: unknown[]; messages: unknown[] },
): Promise<Block> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: input.signal,
    headers: {
      'x-api-key': input.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: MAX_TOKENS,
      ...(input.effort ? { output_config: { effort: input.effort } } : {}),
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`API Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as Block;
}

/**
 * Raccoglie gli URL comparsi nei risultati di ricerca: servono a riscontrare le fonti citate.
 * Un risultato andato a buon fine ha `content` come elenco; in caso di errore è un oggetto.
 */
function collectSearchUrls(content: Block[], seen: Set<string>): void {
  for (const block of content) {
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue;
    for (const result of block.content) {
      if (typeof result?.url === 'string') seen.add(normalizeUrl(result.url));
    }
  }
}

// ---------------------------------------------------------------------
// USDA FoodData Central
// ---------------------------------------------------------------------

// Numeri nutriente FDC → campi della scheda (208 = kcal; 957/958 = kcal Atwater nei Foundation Foods).
// Nomi dei campi confermati su risposte reali: nella ricerca `nutrientNumber` / `value`,
// nel dettaglio `nutrient.number` / `amount` e `foodPortions[].gramWeight`.
const FDC_NUTRIENTS: Record<number, string> = {
  208: 'kcal',
  957: 'kcal',
  958: 'kcal',
  203: 'protein_g',
  205: 'carbs_g',
  204: 'fat_g',
  291: 'fiber_g',
  301: 'calcium_mg',
  601: 'cholesterol_mg',
  606: 'saturated_fat_g',
  269: 'sugars_g',
  307: 'sodium_mg',
};

// Due decimali: con uno solo i grassi saturi delle verdure (es. 0,043 g) diventerebbero 0.
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function usdaLookup(input: Json, usedIds: Set<number>, apiKey: string, signal: AbortSignal): Promise<string> {
  const fdcId = Number(input['fdc_id']);
  if (Number.isInteger(fdcId) && fdcId > 0) {
    const res = await fetch(`https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${encodeURIComponent(apiKey)}`, { signal });
    if (res.status === 429) throw new Error('Limite di richieste USDA raggiunto.');
    if (!res.ok) throw new Error(`USDA FDC ${res.status}`);
    const food = (await res.json()) as Block;
    usedIds.add(fdcId);
    const values: Record<string, number> = {};
    for (const n of food.foodNutrients ?? []) {
      const field = FDC_NUTRIENTS[Number(n?.nutrient?.number)];
      if (field && typeof n.amount === 'number' && !(field in values)) values[field] = round2(n.amount);
    }
    const portions = (food.foodPortions ?? [])
      .filter((p: Block) => typeof p.gramWeight === 'number')
      .slice(0, 12)
      .map((p: Block) => `- ${[p.amount, p.measureUnit?.name !== 'undetermined' ? p.measureUnit?.name : '', p.modifier, p.portionDescription].filter(Boolean).join(' ')} = ${p.gramWeight} g`);
    return (
      `FDC ${fdcId} "${food.description}" — per 100 g: ${JSON.stringify(values)}\n` +
      (portions.length ? `Pesi delle porzioni:\n${portions.join('\n')}` : 'Nessun peso di porzione disponibile per questa voce.')
    );
  }

  const query = String(input['query_en'] ?? '').trim().slice(0, 100);
  if (query.length < 2) return 'Indica query_en oppure fdc_id.';
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', query);
  url.searchParams.set('dataType', 'SR Legacy,Foundation');
  url.searchParams.set('pageSize', '5');
  const res = await fetch(url, { signal });
  if (res.status === 429) throw new Error('Limite di richieste USDA raggiunto.');
  if (!res.ok) throw new Error(`USDA FDC ${res.status}`);
  const foods = ((await res.json()) as Block).foods ?? [];
  if (foods.length === 0) return `Nessun risultato USDA per "${query}". Prova un'altra descrizione o cerca le tabelle CREA sul web.`;
  return (
    'USDA FoodData Central — valori per 100 g:\n' +
    foods
      .map((f: Block) => {
        usedIds.add(Number(f.fdcId));
        const values: Record<string, number> = {};
        for (const n of f.foodNutrients ?? []) {
          const field = FDC_NUTRIENTS[Number(n.nutrientNumber)];
          if (field && typeof n.value === 'number' && !(field in values)) values[field] = round2(n.value);
        }
        return `- FDC ${f.fdcId} "${f.description}" (${f.dataType}): ${JSON.stringify(values)}`;
      })
      .join('\n')
  );
}
