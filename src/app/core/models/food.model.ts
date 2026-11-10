export type OxalateConfidence = 'alta' | 'media' | 'bassa';

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
  oxalate_mg: number;
  oxalate_confidence: OxalateConfidence;
  default_portion_g: number;
  portion_label: string | null;
  nutrient_source: string;
  oxalate_source: string;
  notes: string | null;
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

export interface NutrientTotals {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  calcium_mg: number;
  cholesterol_mg: number;
  oxalate_mg: number;
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
