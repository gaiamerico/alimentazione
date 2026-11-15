import { Food, HarvardTier, MealItem, MealType, NutrientTotals, OptionalNutrient } from '../models/food.model';

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

/** Nutrienti sempre presenti in catalogo. */
const CORE_KEYS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'calcium_mg', 'cholesterol_mg', 'oxalate_mg'] as const;

/** Nutrienti che la fonte può non riportare: null = "dato non disponibile", mai zero. */
export const OPTIONAL_KEYS: readonly OptionalNutrient[] = ['saturated_fat_g', 'sugars_g', 'sodium_mg'];

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
  };
}

/** Valore facoltativo dell'alimento: null se assente (anche nei cataloghi salvati prima dell'aggiunta del campo). */
function optionalValue(food: Food, key: OptionalNutrient): number | null {
  const v = food[key] as number | null | undefined;
  return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
}

/** Valori di un alimento riscalati sui grammi indicati (i dati sono per 100 g). */
export function scaleNutrients(food: Food, grams: number): NutrientTotals {
  const factor = Math.max(0, grams || 0) / 100;
  const out = emptyTotals();
  for (const key of CORE_KEYS) out[key] = (Number(food[key]) || 0) * factor;
  for (const key of OPTIONAL_KEYS) {
    const v = optionalValue(food, key);
    out[key] = v === null ? null : v * factor;
    if (v === null) out.partial.push(key);
  }
  return out;
}

/**
 * Somma i nutrienti degli alimenti. Per i nutrienti facoltativi somma solo i
 * valori presenti: se a qualche alimento manca il dato il totale è segnato come
 * parziale; se manca a tutti il totale è null.
 */
export function sumTotals(items: readonly MealItem[]): NutrientTotals {
  const out = emptyTotals();
  const present: Record<OptionalNutrient, number> = { saturated_fat_g: 0, sugars_g: 0, sodium_mg: 0 };
  const missing: Record<OptionalNutrient, number> = { saturated_fat_g: 0, sugars_g: 0, sodium_mg: 0 };
  for (const item of items) {
    const scaled = scaleNutrients(item.food, item.grams);
    for (const key of CORE_KEYS) out[key] += scaled[key];
    for (const key of OPTIONAL_KEYS) {
      const v = scaled[key];
      if (v === null) missing[key]++;
      else {
        present[key]++;
        out[key] = (out[key] ?? 0) + v;
      }
    }
  }
  for (const key of OPTIONAL_KEYS) {
    if (missing[key] === 0) continue;
    out.partial.push(key);
    if (present[key] === 0) out[key] = null;
  }
  return out;
}

/** true se il totale del nutriente esiste ma non comprende tutti gli alimenti. */
export function isPartial(totals: NutrientTotals, key: OptionalNutrient): boolean {
  return totals[key] !== null && totals.partial.includes(key);
}

export type BalanceStatus = 'trascurabile' | 'ottimo' | 'sufficiente' | 'insufficiente';

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
export function calciumOxalateBalance(calcium_mg: number, oxalate_mg: number): CalciumOxalateBalance {
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
  /** Quantità del nutriente portata dall'alimento, per i grammi indicati. */
  amount: number;
  /** Quota sul totale del pasto o della giornata (0–1). */
  share: number;
}

/** Gli alimenti che contribuiscono di più a un nutriente (lo stesso alimento in più voci viene sommato). */
export function topContributors(items: readonly MealItem[], key: ContributorNutrient, limit = 3): Contributor[] {
  const byFood = new Map<number, { food: Food; amount: number }>();
  for (const item of items) {
    const amount = scaleNutrients(item.food, item.grams)[key];
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
    .map((e) => ({ food: e.food, amount: e.amount, share: e.amount / total }));
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
    const calcium = scaleNutrients(item.food, item.grams).calcium_mg;
    if (oxalateLevel(Number(item.food.oxalate_mg) || 0) === 'alto') out.fromHighOxalate_mg += calcium;
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
