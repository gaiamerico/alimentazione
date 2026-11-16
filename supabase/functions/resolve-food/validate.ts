// Controlli lato server sulla proposta dell'agente: il modello propone, il codice verifica.
// Funzioni pure (nessuna dipendenza da Deno) così si possono provare anche con Node.

export type OxalateBasis = 'misurato' | 'derivato' | 'stimato';
export type Confidence = 'alta' | 'media' | 'bassa';

export interface ProposalSource {
  title: string;
  url: string;
  used_for: 'ossalato' | 'nutrienti' | 'porzione';
  reported_value: string;
  /** true se l'URL è comparso nei risultati di ricerca (o è Harvard/USDA interrogati dagli strumenti). */
  seen_in_search: boolean;
}

export interface Proposal {
  name_it: string;
  name_en: string;
  category: string;
  synonyms: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  calcium_mg: number;
  cholesterol_mg: number;
  /** Facoltativi: null = dato non disponibile nella fonte (mai zero di comodo). */
  saturated_fat_g: number | null;
  sugars_g: number | null;
  sodium_mg: number | null;
  /** null solo nel completamento di un alimento esistente, se l'ossalato per 100 g non è ricavabile. */
  oxalate_mg: number | null;
  oxalate_min_mg: number | null;
  oxalate_max_mg: number | null;
  oxalate_basis: OxalateBasis | null;
  oxalate_confidence: Confidence | null;
  default_portion_g: number;
  portion_label: string | null;
  nutrient_source: string;
  oxalate_source: string | null;
  notes: string | null;
  agent_notes: string;
  sources: ProposalSource[];
}

export interface ValidationContext {
  categories: readonly string[];
  /** Nomi già in catalogo, normalizzati con normalizeText. */
  existingNames: ReadonlySet<string>;
  /** URL visti nei risultati della ricerca web. */
  seenUrls: ReadonlySet<string>;
  usedHarvard: boolean;
  usedUsdaIds: ReadonlySet<number>;
  /**
   * Completamento di un alimento già in catalogo: l'ossalato per 100 g può restare null
   * (resta valido il dato per porzione della lista Harvard) invece di essere stimato.
   */
  allowMissingOxalate?: boolean;
}

export type ValidationResult = { ok: true; proposal: Proposal } | { ok: false; errors: string[] };

/** Stessa normalizzazione del frontend (core/utils/nutrition.ts). */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeUrl(url: string): string {
  return url.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/+$/, '');
}

const LIMITS: Record<string, [number, number]> = {
  kcal: [0, 900],
  protein_g: [0, 100],
  carbs_g: [0, 100],
  fat_g: [0, 100],
  fiber_g: [0, 100],
  calcium_mg: [0, 3000],
  cholesterol_mg: [0, 3500],
  oxalate_mg: [0, 5000],
  default_portion_g: [1, 1000],
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function validateProposal(input: Record<string, unknown>, ctx: ValidationContext): ValidationResult {
  const errors: string[] = [];

  const name_it = text(input['name_it'], 80);
  if (name_it.length < 2) errors.push('name_it mancante.');
  else if (ctx.existingNames.has(normalizeText(name_it)))
    errors.push(`"${name_it}" è già in catalogo: rispondi con esito "gia_presente" e il suo food_id.`);

  const category = text(input['category'], 60);
  if (!ctx.categories.includes(category)) errors.push(`category deve essere una di: ${ctx.categories.join(', ')}.`);

  const noOxalate = ctx.allowMissingOxalate === true && (input['oxalate_mg'] === null || input['oxalate_mg'] === undefined);

  const nums: Record<string, number> = {};
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const v = input[key];
    if (key === 'oxalate_mg' && noOxalate) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${key} mancante o non numerico.`);
    else if (v < min || v > max) errors.push(`${key} = ${v} fuori dall'intervallo plausibile ${min}–${max} (valori per 100 g).`);
    else nums[key] = round1(v);
  }

  if (errors.length === 0) {
    const macros = nums['protein_g'] + nums['carbs_g'] + nums['fat_g'];
    if (macros > 102) errors.push(`proteine + carboidrati + grassi = ${round1(macros)} g su 100 g: ricontrolla i valori.`);
    if (nums['fiber_g'] > nums['carbs_g'] + 5 && nums['fiber_g'] > 5)
      errors.push('fiber_g supera i carboidrati totali: ricontrolla (in USDA le fibre sono incluse nei carboidrati).');
    // Atwater: 4/4/9 kcal per g. Tolleranza ampia (polioli, fibre); nelle bevande
    // l'alcol (7 kcal/g) non è tra i macronutrienti, quindi lì niente limite superiore.
    const atwater = 4 * nums['protein_g'] + 4 * nums['carbs_g'] + 9 * nums['fat_g'];
    const tooHigh = category !== 'Bevande' && nums['kcal'] > atwater * 1.6 + 60;
    if (nums['kcal'] > 50 && (tooHigh || nums['kcal'] < atwater * 0.5 - 20))
      errors.push(`kcal (${nums['kcal']}) incoerenti con i macronutrienti (stima Atwater ≈ ${Math.round(atwater)}): controlla di non aver usato kJ o valori per porzione.`);
  }

  const optionalNum = (key: string, max = 5000, round = round1): number | null => {
    const v = input[key];
    if (v === undefined || v === null) return null;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) {
      errors.push(`${key} = ${String(v)} non valido (atteso un numero tra 0 e ${max}, valori per 100 g).`);
      return null;
    }
    return round(v);
  };

  // Nutrienti facoltativi: assenti = "dato non disponibile". Se presenti devono essere coerenti.
  const saturatedFat = optionalNum('saturated_fat_g', 100, round2);
  const sugars = optionalNum('sugars_g', 100, round2);
  const sodium = optionalNum('sodium_mg', 40000);
  // Tolleranza di 0,1 g per gli arrotondamenti delle fonti.
  if (saturatedFat !== null && nums['fat_g'] !== undefined && saturatedFat > nums['fat_g'] + 0.1)
    errors.push(`saturated_fat_g (${saturatedFat}) supera i grassi totali (${nums['fat_g']}).`);
  if (sugars !== null && nums['carbs_g'] !== undefined && sugars > nums['carbs_g'] + 0.1)
    errors.push(`sugars_g (${sugars}) supera i carboidrati totali (${nums['carbs_g']}).`);
  const oxMin = noOxalate ? null : optionalNum('oxalate_min_mg');
  const oxMax = noOxalate ? null : optionalNum('oxalate_max_mg');
  if (oxMin !== null && oxMax !== null && oxMin > oxMax) errors.push('oxalate_min_mg è maggiore di oxalate_max_mg.');
  if (nums['oxalate_mg'] !== undefined) {
    if (oxMin !== null && nums['oxalate_mg'] < oxMin) errors.push('oxalate_mg è sotto oxalate_min_mg.');
    if (oxMax !== null && nums['oxalate_mg'] > oxMax) errors.push('oxalate_mg è sopra oxalate_max_mg.');
  }

  // Senza ossalato per 100 g non ci sono né base né confidenza: qualunque valore proposto si ignora.
  const basis = noOxalate ? null : input['oxalate_basis'];
  if (!noOxalate && basis !== 'misurato' && basis !== 'derivato' && basis !== 'stimato') errors.push('oxalate_basis non valido.');
  let confidence = noOxalate ? null : input['oxalate_confidence'];
  if (!noOxalate && confidence !== 'alta' && confidence !== 'media' && confidence !== 'bassa') errors.push('oxalate_confidence non valido.');

  const rawSources = Array.isArray(input['sources']) ? (input['sources'] as Record<string, unknown>[]) : [];
  const sources: ProposalSource[] = [];
  for (const s of rawSources.slice(0, 12)) {
    const url = text(s?.['url'], 500);
    const used_for = s?.['used_for'];
    if (!url || (used_for !== 'ossalato' && used_for !== 'nutrienti' && used_for !== 'porzione')) continue;
    const fdc = url.match(/fdc\.nal\.usda\.gov\/food-details\/(\d+)/);
    const seen =
      url.toLowerCase() === 'harvard'
        ? ctx.usedHarvard
        : fdc
          ? ctx.usedUsdaIds.has(Number(fdc[1]))
          : ctx.seenUrls.has(normalizeUrl(url));
    sources.push({
      title: text(s['title'], 200),
      url,
      used_for,
      reported_value: text(s['reported_value'], 300),
      seen_in_search: seen,
    });
  }
  const oxalateSources = sources.filter((s) => s.used_for === 'ossalato');
  if (!noOxalate && oxalateSources.length === 0) errors.push('Serve almeno una fonte con used_for "ossalato".');
  if (!sources.some((s) => s.used_for === 'nutrienti')) errors.push('Serve almeno una fonte con used_for "nutrienti".');

  const reasoning = text(input['reasoning'], 2000);
  if (reasoning.length < 20) errors.push('reasoning troppo breve: descrivi fonti e conversioni.');

  if (errors.length > 0) return { ok: false, errors };

  // Regole di prudenza applicate dal codice, non lasciate al modello.
  const downgrades: string[] = [];
  if (noOxalate) downgrades.push('ossalato per 100 g non ricavato: resta il solo dato per porzione della lista Harvard');
  if (basis === 'stimato' && confidence !== 'bassa') {
    confidence = 'bassa';
    downgrades.push('confidenza portata a "bassa" perché il valore è stimato');
  }
  if (confidence === 'alta' && !oxalateSources.some((s) => s.seen_in_search)) {
    confidence = 'media';
    downgrades.push('confidenza portata a "media": nessuna fonte sugli ossalati è stata riscontrata nelle ricerche');
  }
  if (confidence !== 'bassa' && oxMin !== null && oxMax !== null && oxMin > 0 && oxMax / oxMin > 3) {
    confidence = 'bassa';
    downgrades.push('confidenza portata a "bassa": le fonti differiscono di oltre 3 volte');
  }
  const unseen = sources.filter((s) => !s.seen_in_search).length;
  const agent_notes = [
    reasoning,
    ...downgrades.map((d) => `[controllo automatico] ${d}.`),
    unseen > 0 ? `[controllo automatico] ${unseen} fonte/i non riscontrata/e nei risultati di ricerca: da aprire a mano.` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    ok: true,
    proposal: {
      name_it: name_it.charAt(0).toUpperCase() + name_it.slice(1),
      name_en: text(input['name_en'], 120),
      category,
      synonyms: text(input['synonyms'], 300) || null,
      kcal: nums['kcal'],
      protein_g: nums['protein_g'],
      carbs_g: nums['carbs_g'],
      fat_g: nums['fat_g'],
      fiber_g: nums['fiber_g'],
      calcium_mg: nums['calcium_mg'],
      cholesterol_mg: nums['cholesterol_mg'],
      saturated_fat_g: saturatedFat,
      sugars_g: sugars,
      sodium_mg: sodium,
      oxalate_mg: noOxalate ? null : nums['oxalate_mg'],
      oxalate_min_mg: oxMin,
      oxalate_max_mg: oxMax,
      oxalate_basis: basis as OxalateBasis | null,
      oxalate_confidence: confidence as Confidence | null,
      default_portion_g: nums['default_portion_g'],
      portion_label: text(input['portion_label'], 60) || null,
      nutrient_source: text(input['nutrient_source'], 120) || 'USDA FoodData Central',
      oxalate_source: noOxalate ? null : text(input['oxalate_source'], 120) || 'Stima da letteratura',
      notes: text(input['notes'], 300) || null,
      agent_notes,
      sources,
    },
  };
}
