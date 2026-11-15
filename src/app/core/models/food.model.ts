export type OxalateConfidence = 'alta' | 'media' | 'bassa';

/** Fascia della lista Harvard, riferita alla PORZIONE (non a 100 g). */
export type HarvardTier = 'low' | 'medium' | 'high';

/** Voce della lista Harvard T.H. Chan (rev. nov 2023) collegata a un alimento del catalogo. */
export interface HarvardReference {
  name_en: string;
  name_it: string | null;
  /** Porzione originale della lista, es. "½ cup". */
  serving: string;
  oxalate_mg_serving: number;
  tier: HarvardTier;
  /** Peso della porzione verificato su USDA; null se non verificato. */
  serving_g: number | null;
}

/** Alimento del catalogo. Tutti i valori nutrizionali sono riferiti a 100 g. */
export interface Food {
  id: number;
  name_it: string;
  name_en: string | null;
  category: string;
  synonyms: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  calcium_mg: number;
  cholesterol_mg: number;
  /** Nutrienti facoltativi: null = dato non disponibile nella fonte (non zero). */
  saturated_fat_g: number | null;
  sugars_g: number | null;
  sodium_mg: number | null;
  oxalate_mg: number;
  oxalate_confidence: OxalateConfidence;
  default_portion_g: number;
  portion_label: string | null;
  nutrient_source: string;
  oxalate_source: string;
  notes: string | null;
  /** Voce Harvard per lo stesso alimento e stato, se esiste una corrispondenza chiara. */
  harvard?: HarvardReference | null;
}

/** Prodotto confezionato letto dal codice a barre (Open Food Facts). Valori per 100 g o 100 ml. */
export interface PackagedProduct {
  barcode: string;
  /** false = codice cercato ma assente dalla banca dati. */
  found: boolean;
  name: string | null;
  brand: string | null;
  quantity: string | null;
  countries: string | null;
  ingredients: string | null;
  /** null = dato non presente sull'etichetta. Gli ossalati non sono mai riportati. */
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  sugars_g: number | null;
  fat_g: number | null;
  saturated_fat_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
  calcium_mg: number | null;
  cholesterol_mg: number | null;
  source: string;
  source_url: string | null;
  fetched_at: string;
}

export type MealType = 'colazione' | 'pranzo' | 'cena' | 'spuntino';

export const MEAL_TYPES: readonly { value: MealType; label: string }[] = [
  { value: 'colazione', label: 'Colazione' },
  { value: 'pranzo', label: 'Pranzo' },
  { value: 'cena', label: 'Cena' },
  { value: 'spuntino', label: 'Spuntino' },
];

export interface DiaryEntry {
  id: number;
  food_id: number;
  entry_date: string; // YYYY-MM-DD
  meal: MealType;
  grams: number;
  created_at: string;
  food: Food;
}

/** Nutrienti che non tutti gli alimenti del catalogo riportano. */
export type OptionalNutrient = 'saturated_fat_g' | 'sugars_g' | 'sodium_mg';

export interface NutrientTotals {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  calcium_mg: number;
  cholesterol_mg: number;
  oxalate_mg: number;
  /** null = nessun alimento considerato riporta il dato ("dato non disponibile"). */
  saturated_fat_g: number | null;
  sugars_g: number | null;
  sodium_mg: number | null;
  /**
   * Nutrienti facoltativi per cui almeno un alimento non ha il dato: il totale
   * somma solo i valori presenti ed è quindi parziale (una sottostima).
   */
  partial: OptionalNutrient[];
}

export interface SearchFilters {
  query: string;
  lowOxalate: boolean;
  highCalcium: boolean;
  noCholesterol: boolean;
  category: string | null;
}

export interface MealItem {
  food: Food;
  grams: number;
}
