import { Food, MealItem, MealType, NutrientTotals } from '../models/food.model';

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
  };
}

const NUTRIENT_KEYS = Object.keys(emptyTotals()) as (keyof NutrientTotals)[];

/** Valori di un alimento riscalati sui grammi indicati (i dati sono per 100 g). */
export function scaleNutrients(food: Food, grams: number): NutrientTotals {
  const factor = Math.max(0, grams || 0) / 100;
  const out = emptyTotals();
  for (const key of NUTRIENT_KEYS) out[key] = (Number(food[key]) || 0) * factor;
  return out;
}

export function sumTotals(items: readonly MealItem[]): NutrientTotals {
  const out = emptyTotals();
  for (const item of items) {
    const scaled = scaleNutrients(item.food, item.grams);
    for (const key of NUTRIENT_KEYS) out[key] += scaled[key];
  }
  return out;
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
 * Valuta se il calcio del pasto è sufficiente a legare gli ossalati nell'intestino.
 * Calcio e ossalato si legano in rapporto molare 1:1 formando ossalato di calcio
 * insolubile, che viene eliminato con le feci invece di essere assorbito.
 * Poiché non tutto il calcio è disponibile (fosfati, fitati, assorbimento),
 * si considera ottimale un margine 2:1.
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
      message: 'Il pasto contiene pochissimi ossalati: nessun bilanciamento necessario.',
    };
  }
  if (molarRatio !== null && molarRatio >= 2) {
    return {
      ...base,
      status: 'ottimo',
      title: 'Calcio abbondante',
      message:
        'Il calcio presente è più che sufficiente a legare gli ossalati a livello intestinale, riducendone l’assorbimento.',
    };
  }
  if (molarRatio !== null && molarRatio >= 1) {
    return {
      ...base,
      status: 'sufficiente',
      title: 'Calcio appena sufficiente',
      message:
        'In teoria il calcio basta a legare gli ossalati, ma con poco margine: valuta di aggiungere una fonte di calcio.',
    };
  }
  return {
    ...base,
    status: 'insufficiente',
    title: 'Calcio insufficiente',
    message:
      'Il calcio non basta a legare tutti gli ossalati: una parte potrebbe essere assorbita. Aggiungi una fonte di calcio allo stesso pasto.',
  };
}

/** Suggerimenti di alimenti ricchi di calcio per coprire un fabbisogno (mg). */
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
