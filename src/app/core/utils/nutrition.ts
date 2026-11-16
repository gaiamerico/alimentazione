import { CoreNutrient, Food, HarvardTier, MealItem, MealType, NutrientKey, NutrientTotals, OptionalNutrient } from '../models/food.model';

/** Soglie ossalati (mg) usate per filtri e indicatori cromatici. */
export const OXALATE_LOW_MAX = 25; // < 25 mg → basso
export const OXALATE_HIGH_MIN = 100; // ≥ 100 mg → alto
export const HIGH_CALCIUM_MIN = 150; // > 150 mg → alto calcio

/** Riferimenti giornalieri indicativi (adulto). */
export const DAILY_REFERENCE = {
  calcium_mg: 1000, // LARN/EFSA adulti
  cholesterol_mg: 300, // limite consigliato
  oxalate_mg: 100, // dieta a basso contenuto di ossalati: 50–100 mg/die
  kcal: 2000,
} as const;

const CALCIUM_MOLAR_MASS = 40.078; // g/mol
const OXALATE_MOLAR_MASS = 88.019; // g/mol (C2O4²⁻)

/** mg di calcio necessari a legare 1 mg di ossalato (rapporto molare 1:1). */
export const CALCIUM_PER_OXALATE_MG = CALCIUM_MOLAR_MASS / OXALATE_MOLAR_MASS; // ≈ 0,455

export type OxalateLevel = 'basso' | 'moderato' | 'alto';

export function oxalateLevel(mg: number): OxalateLevel {
  if (mg < OXALATE_LOW_MAX) return 'basso';
  if (mg < OXALATE_HIGH_MIN) return 'moderato';
  return 'alto';
}

export const OXALATE_LEVEL_LABEL: Record<OxalateLevel, string> = {
  basso: 'Basso',
  moderato: 'Moderato',
  alto: 'Alto',
};

/**
 * Fasce della lista Harvard T.H. Chan: sono riferite alla PORZIONE (bassa < 2 mg,
 * media 2–10 mg, alta > 10 mg) e non sono intercambiabili con le soglie per 100 g
 * usate dall'app. Vanno presentate come classificazione della fonte, non come
 * soglia clinica.
 */
export const HARVARD_TIER_LABEL: Record<HarvardTier, string> = {
  low: 'bassa',
  medium: 'media',
  high: 'alta',
};
export const HARVARD_REVISION_LABEL = 'revisione novembre 2023';

/** Nutrienti presenti da sempre in catalogo; nelle voci da completare possono mancare. */
export const CORE_KEYS: readonly CoreNutrient[] = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'calcium_mg', 'cholesterol_mg', 'oxalate_mg'];

/** Nutrienti che la fonte può non riportare. */
export const OPTIONAL_KEYS: readonly OptionalNutrient[] = ['saturated_fat_g', 'sugars_g', 'sodium_mg'];

/** Tutti i nutrienti: per ognuno null = "dato non disponibile", mai zero. */
export const NUTRIENT_KEYS: readonly NutrientKey[] = [...CORE_KEYS, ...OPTIONAL_KEYS];

export const MISSING_VALUE_LABEL = 'dato non disponibile';

/** Totali di un insieme vuoto: tutto a zero, niente di parziale. */
export function emptyTotals(): NutrientTotals {
  return {
    kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    calcium_mg: 0,
    cholesterol_mg: 0,
    oxalate_mg: 0,
    saturated_fat_g: 0,
    sugars_g: 0,
    sodium_mg: 0,
    partial: [],
    oxalateEstimated: false,
  };
}

/** Valore per 100 g dell'alimento: null se assente (anche nei cataloghi salvati prima dell'aggiunta del campo). */
function nutrientValue(food: Food, key: NutrientKey): number | null {
  const v = food[key] as number | null | undefined;
  return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
}

// ---------------------------------------------------------------------
// Ossalato per 100 g quando esiste solo il dato per porzione (lista Harvard)
// ---------------------------------------------------------------------

const OUNCE_G = 28.3495; // oncia di peso (avoirdupois): conversione esatta
const FLUID_OUNCE_ML = 29.5735; // oncia fluida USA
const CUP_ML = 8 * FLUID_OUNCE_ML; // tazza USA = 8 once fluide
const FRACTIONS: Record<string, number> = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 1 / 8 };

export interface ServingWeight {
  grams: number;
  /** "peso": oncia di peso, conversione esatta. "volume": bevanda, 1 ml ≈ 1 g. */
  basis: 'peso' | 'volume';
}

/**
 * Peso in grammi di una porzione della lista Harvard, SOLO dove la conversione è certa:
 * - once ("1 oz", "3.5 oz"): peso esatto per i solidi, volume ≈ peso per le bevande;
 * - tazze ("1 cup") solo per le bevande.
 * Per tutto il resto (tazze di solidi, pezzi, fette, cucchiai) restituisce null: una
 * tazza di lattuga e una di fagioli pesano in modo molto diverso, e l'app non stima.
 * Il risultato si calcola a video e non viene mai salvato.
 */
export function servingWeight(serving: string, isBeverage: boolean): ServingWeight | null {
  const match = serving.trim().match(/^(\d+(?:[.,]\d+)?)?\s*([½¼¾⅓⅔⅛])?\s*([a-z]+)$/i);
  if (!match || (!match[1] && !match[2])) return null;
  const quantity = (match[1] ? Number(match[1].replace(',', '.')) : 0) + (match[2] ? FRACTIONS[match[2]] : 0);
  if (!(quantity > 0)) return null;
  const unit = match[3].toLowerCase();
  if (unit === 'oz') {
    return isBeverage ? { grams: quantity * FLUID_OUNCE_ML, basis: 'volume' } : { grams: quantity * OUNCE_G, basis: 'peso' };
  }
  if ((unit === 'cup' || unit === 'cups') && isBeverage) return { grams: quantity * CUP_ML, basis: 'volume' };
  return null;
}

/** Categoria del catalogo in cui la porzione Harvard è un volume (1 ml ≈ 1 g). */
const BEVERAGE_CATEGORY = 'Bevande';

export interface OxalatePer100g {
  mg: number;
  /** true = ricavato a video dalla porzione Harvard, non è un dato del catalogo. */
  estimated: boolean;
  /** Peso attribuito alla porzione Harvard (solo per le stime). */
  serving?: ServingWeight;
}

/**
 * Ossalato per 100 g di un alimento: il dato del catalogo se c'è; altrimenti, se la
 * voce Harvard collegata ha una porzione convertibile con certezza, una stima calcolata
 * sul momento (mg per porzione / grammi della porzione × 100). null se non c'è né l'uno
 * né l'altra.
 */
export function oxalatePer100g(food: Food): OxalatePer100g | null {
  const stored = nutrientValue(food, 'oxalate_mg');
  if (stored !== null) return { mg: stored, estimated: false };
  const harvard = food.harvard;
  if (!harvard) return null;
  // Peso verificato su USDA (se presente) prima della conversione di unità.
  const serving: ServingWeight | null =
    harvard.serving_g !== null && harvard.serving_g > 0
      ? { grams: harvard.serving_g, basis: 'peso' }
      : servingWeight(harvard.serving, food.category === BEVERAGE_CATEGORY);
  if (!serving) return null;
  return { mg: (harvard.oxalate_mg_serving / serving.grams) * 100, estimated: true, serving };
}

/** Dati che mancano a un alimento del catalogo (da proporre alla ricerca online). */
export interface MissingData {
  /** Nessun ossalato per 100 g in catalogo (può esserci il dato Harvard per porzione). */
  oxalate: boolean;
  /** Manca almeno uno tra energia, macronutrienti, fibre, calcio e colesterolo. */
  nutrients: boolean;
  any: boolean;
}

export function missingData(food: Food): MissingData {
  const oxalate = nutrientValue(food, 'oxalate_mg') === null;
  const nutrients = CORE_KEYS.some((key) => key !== 'oxalate_mg' && nutrientValue(food, key) === null);
  return { oxalate, nutrients, any: oxalate || nutrients };
}

/** Valori di un alimento riscalati sui grammi indicati (i dati sono per 100 g). */
export function scaleNutrients(food: Food, grams: number): NutrientTotals {
  const factor = Math.max(0, grams || 0) / 100;
  const out = emptyTotals();
  for (const key of NUTRIENT_KEYS) {
    let v = nutrientValue(food, key);
    if (key === 'oxalate_mg' && v === null) {
      const estimate = oxalatePer100g(food);
      if (estimate) {
        v = estimate.mg;
        out.oxalateEstimated = true;
      }
    }
    out[key] = v === null ? null : v * factor;
    if (v === null) out.partial.push(key);
  }
  return out;
}

/**
 * Somma i nutrienti degli alimenti. Somma solo i valori presenti: se a qualche
 * alimento manca il dato il totale è segnato come parziale; se manca a tutti il
 * totale è null. Un insieme vuoto ha tutti i totali a zero.
 */
export function sumTotals(items: readonly MealItem[]): NutrientTotals {
  const out = emptyTotals();
  const present = new Map<NutrientKey, number>();
  const missing = new Map<NutrientKey, number>();
  for (const item of items) {
    const scaled = scaleNutrients(item.food, item.grams);
    if (scaled.oxalateEstimated) out.oxalateEstimated = true;
    for (const key of NUTRIENT_KEYS) {
      const v = scaled[key];
      if (v === null) missing.set(key, (missing.get(key) ?? 0) + 1);
      else {
        present.set(key, (present.get(key) ?? 0) + 1);
        out[key] = (out[key] ?? 0) + v;
      }
    }
  }
  for (const key of NUTRIENT_KEYS) {
    if (!missing.has(key)) continue;
    out.partial.push(key);
    if (!present.has(key)) out[key] = null;
  }
  return out;
}

/** true se il totale del nutriente esiste ma non comprende tutti gli alimenti. */
export function isPartial(totals: NutrientTotals, key: NutrientKey): boolean {
  return totals[key] !== null && totals.partial.includes(key);
}

/** Bilancio calcio/ossalati dei totali di un pasto o di una giornata, prudente se i dati sono incompleti. */
export function balanceOfTotals(totals: NutrientTotals): CalciumOxalateBalance {
  return calciumOxalateBalance(totals.calcium_mg ?? 0, totals.oxalate_mg ?? 0, totals.partial.includes('oxalate_mg'));
}

/** true se ci sono alimenti ma nessuno ha il dato su ossalati o calcio: il bilancio non si può calcolare. */
export function balanceUnavailable(totals: NutrientTotals, itemCount: number): boolean {
  return itemCount > 0 && (totals.oxalate_mg === null || totals.calcium_mg === null);
}

/** Nomi degli alimenti (senza ripetizioni) a cui manca il dato, anche stimato, di un nutriente. */
export function foodsMissing(items: readonly MealItem[], key: NutrientKey): string[] {
  const names = new Set<string>();
  for (const item of items) {
    if (scaleNutrients(item.food, item.grams)[key] === null) names.add(item.food.name_it);
  }
  return [...names];
}

/**
 * Avvertenze sul bilancio calcio/ossalati quando i dati non sono completi: alimenti
 * esclusi dal totale (che è quindi una sottostima) e ossalati stimati dalla porzione Harvard.
 */
export function balanceCaveats(items: readonly MealItem[]): string[] {
  const out: string[] = [];
  const list = (names: string[]) => (names.length > 3 ? `${names.slice(0, 3).join(', ')} e altri ${names.length - 3}` : names.join(', '));
  const noOxalate = foodsMissing(items, 'oxalate_mg');
  if (noOxalate.length > 0)
    out.push(`Ossalati per 100 g non disponibili per: ${list(noOxalate)}. Non entrano nel totale degli ossalati (se c'è, è una sottostima).`);
  const noCalcium = foodsMissing(items, 'calcium_mg');
  if (noCalcium.length > 0)
    out.push(`Calcio non disponibile per: ${list(noCalcium)}. Non entra nel totale del calcio.`);
  if (items.some((item) => oxalatePer100g(item.food)?.estimated))
    out.push('Il totale degli ossalati comprende stime ricavate dalla porzione della lista Harvard (non misure per 100 g).');
  return out;
}

/** 'parziale': il calcolo direbbe "trascurabile" o "ottimo", ma ad alcuni alimenti manca il dato sugli ossalati. */
export type BalanceStatus = 'trascurabile' | 'ottimo' | 'sufficiente' | 'insufficiente' | 'parziale';

export interface CalciumOxalateBalance {
  calcium_mg: number;
  oxalate_mg: number;
  /** Rapporto molare Ca:Ox (null se ossalati assenti). */
  molarRatio: number | null;
  /** Calcio teoricamente necessario per legare tutti gli ossalati (1:1 molare). */
  calciumToBind_mg: number;
  /** Calcio consigliato con margine di sicurezza (rapporto molare 2:1). */
  calciumRecommended_mg: number;
  /** Calcio mancante per raggiungere il valore consigliato (0 se sufficiente). */
  calciumMissing_mg: number;
  /** Percentuale degli ossalati teoricamente legabili dal calcio presente (0–100). */
  boundPercent: number;
  status: BalanceStatus;
  title: string;
  message: string;
}

/** Soglia sotto cui gli ossalati del pasto si considerano trascurabili. */
export const NEGLIGIBLE_OXALATE_MG = 10;

/**
 * Confronta il calcio del pasto con gli ossalati sulla base del rapporto molare.
 * Calcio e ossalato possono legarsi in rapporto molare 1:1; poiché non tutto il
 * calcio è disponibile (fosfati, fitati, assorbimento), l'app usa come riferimento
 * un margine 2:1.
 *
 * È una STIMA TEORICA: in generale il calcio alimentare può legare parte degli
 * ossalati nell'intestino, ma la quota realmente legata varia da persona a persona.
 * I testi non devono promettere che il calcio "neutralizza" gli ossalati.
 */
export function calciumOxalateBalance(calcium_mg: number, oxalate_mg: number, oxalateIncomplete = false): CalciumOxalateBalance {
  const ca = Math.max(0, calcium_mg);
  const ox = Math.max(0, oxalate_mg);
  const calciumToBind = ox * CALCIUM_PER_OXALATE_MG;
  const calciumRecommended = calciumToBind * 2;
  const molarRatio = ox > 0 ? ca / CALCIUM_MOLAR_MASS / (ox / OXALATE_MOLAR_MASS) : null;
  const boundPercent = ox > 0 ? Math.min(100, (ca / calciumToBind) * 100) : 100;
  const missing = Math.max(0, calciumRecommended - ca);

  const base = {
    calcium_mg: ca,
    oxalate_mg: ox,
    molarRatio,
    calciumToBind_mg: calciumToBind,
    calciumRecommended_mg: calciumRecommended,
    calciumMissing_mg: missing,
    boundPercent,
  };

  // Con ossalati mancanti il totale è una sottostima: un esito rassicurante non è affidabile.
  if (oxalateIncomplete && (ox < NEGLIGIBLE_OXALATE_MG || (molarRatio !== null && molarRatio >= 2))) {
    return {
      ...base,
      status: 'parziale',
      title: 'Bilancio parziale',
      message:
        'Ad alcuni alimenti manca il dato sugli ossalati per 100 g: il totale è una sottostima e il confronto con il calcio non è affidabile.',
    };
  }
  if (ox < NEGLIGIBLE_OXALATE_MG) {
    return {
      ...base,
      status: 'trascurabile',
      title: 'Ossalati trascurabili',
      message: 'Il pasto contiene pochissimi ossalati: il confronto con il calcio qui conta poco.',
    };
  }
  if (molarRatio !== null && molarRatio >= 2) {
    return {
      ...base,
      status: 'ottimo',
      title: 'Calcio abbondante',
      message:
        'Sulla carta il calcio del pasto supera con margine la quantità che può legarsi agli ossalati. In generale il calcio alimentare può legare parte degli ossalati nell’intestino; la risposta individuale varia.',
    };
  }
  if (molarRatio !== null && molarRatio >= 1) {
    return {
      ...base,
      status: 'sufficiente',
      title: 'Calcio appena sufficiente',
      message:
        'Sulla carta il calcio del pasto è pari alla quantità che può legarsi agli ossalati, con poco margine. È una stima teorica e la risposta individuale varia: un alimento ricco di calcio nello stesso pasto aumenta il margine.',
    };
  }
  return {
    ...base,
    status: 'insufficiente',
    title: 'Calcio insufficiente',
    message:
      'Sulla carta il calcio del pasto è inferiore alla quantità che può legarsi agli ossalati. In generale un alimento ricco di calcio nello stesso pasto può legarne una parte nell’intestino; la risposta individuale varia.',
  };
}

/**
 * Alimenti ricchi di calcio con cui raggiungere una quantità (mg).
 * Sempre alimenti, mai integratori: l'app non indica dosi personali.
 */
export function calciumSuggestions(missing_mg: number): { label: string; amount: string }[] {
  if (missing_mg <= 0) return [];
  const round5 = (n: number) => Math.max(5, Math.ceil(n / 5) * 5);
  return [
    { label: 'Parmigiano Reggiano', amount: `${round5((missing_mg / 1159) * 100)} g` },
    { label: 'Latte (vaccino)', amount: `${round5((missing_mg / 119) * 100)} ml` },
    { label: 'Yogurt bianco', amount: `${round5((missing_mg / 125) * 100)} g` },
    { label: 'Acqua calcica (300 mg/L)', amount: `${round5((missing_mg / 30) * 100)} ml` },
  ];
}

export type ContributorNutrient = 'oxalate_mg' | 'calcium_mg' | 'cholesterol_mg';

export interface Contributor {
  food: Food;
  /** true se la quantità viene da una stima (ossalati dalla porzione Harvard). */
  estimated: boolean;
  /** Quantità del nutriente portata dall'alimento, per i grammi indicati. */
  amount: number;
  /** Quota sul totale del pasto o della giornata (0–1). */
  share: number;
}

/** Gli alimenti che contribuiscono di più a un nutriente (lo stesso alimento in più voci viene sommato). */
export function topContributors(items: readonly MealItem[], key: ContributorNutrient, limit = 3): Contributor[] {
  const byFood = new Map<number, { food: Food; amount: number }>();
  for (const item of items) {
    const amount = scaleNutrients(item.food, item.grams)[key] ?? 0;
    if (!(amount > 0)) continue;
    const entry = byFood.get(item.food.id);
    if (entry) entry.amount += amount;
    else byFood.set(item.food.id, { food: item.food, amount });
  }
  const total = [...byFood.values()].reduce((sum, e) => sum + e.amount, 0);
  if (total <= 0) return [];
  return [...byFood.values()]
    .sort((a, b) => b.amount - a.amount || a.food.name_it.localeCompare(b.food.name_it, 'it'))
    .slice(0, limit)
    .map((e) => ({
      food: e.food,
      amount: e.amount,
      share: e.amount / total,
      estimated: key === 'oxalate_mg' && oxalatePer100g(e.food)?.estimated === true,
    }));
}

export interface CalciumBySource {
  /** Calcio che viene da alimenti ad alto contenuto di ossalati (≥ OXALATE_HIGH_MIN per 100 g). */
  fromHighOxalate_mg: number;
  fromOthers_mg: number;
}

/** Separa il calcio per provenienza, con la stessa soglia "alto" usata dall'indicatore dell'app. */
export function calciumBySource(items: readonly MealItem[]): CalciumBySource {
  const out: CalciumBySource = { fromHighOxalate_mg: 0, fromOthers_mg: 0 };
  for (const item of items) {
    const calcium = scaleNutrients(item.food, item.grams).calcium_mg ?? 0;
    // Senza ossalato per 100 g (nemmeno stimato) l'alimento non si può dire "alto".
    if (oxalateLevel(oxalatePer100g(item.food)?.mg ?? 0) === 'alto') out.fromHighOxalate_mg += calcium;
    else out.fromOthers_mg += calcium;
  }
  return out;
}

/** Normalizza testo per confronti: minuscolo, senza accenti né punteggiatura. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Suggerisce il pasto in base all'ora corrente. */
export function guessMeal(date = new Date()): MealType {
  const h = date.getHours();
  if (h < 11) return 'colazione';
  if (h < 15) return 'pranzo';
  if (h < 18) return 'spuntino';
  return 'cena';
}
