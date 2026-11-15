// Funzioni pure per la Edge Function "lookup-barcode" (nessuna dipendenza da Deno,
// così si possono provare anche con Node): validazione del codice a barre e
// conversione della risposta di Open Food Facts nella riga di `packaged_products`.

export interface PackagedProductRow {
  barcode: string;
  found: boolean;
  name: string | null;
  brand: string | null;
  quantity: string | null;
  countries: string | null;
  ingredients: string | null;
  /** Nutrienti per 100 g (o 100 ml). null = dato non presente sull'etichetta. */
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
}

/** Cifra di controllo GS1 (EAN-8, UPC-A, EAN-13, GTIN-14): pesi 3-1 da destra. */
function hasValidCheckDigit(digits: string): boolean {
  let sum = 0;
  for (let i = digits.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += Number(digits[i]) * weight;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/** UPC-E (8 cifre, sistema 0 o 1) → UPC-A (12 cifre). null se la forma non è valida. */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const system = code[0];
  const d = code.slice(1, 7);
  const check = code[7];
  let body: string;
  switch (d[5]) {
    case '0':
    case '1':
    case '2':
      body = `${d[0]}${d[1]}${d[5]}0000${d[2]}${d[3]}${d[4]}`;
      break;
    case '3':
      body = `${d[0]}${d[1]}${d[2]}00000${d[3]}${d[4]}`;
      break;
    case '4':
      body = `${d[0]}${d[1]}${d[2]}${d[3]}00000${d[4]}`;
      break;
    default:
      body = `${d[0]}${d[1]}${d[2]}${d[3]}${d[4]}0000${d[5]}`;
  }
  return `${system}${body}${check}`;
}

/**
 * Ripulisce e valida un codice EAN-13, EAN-8, UPC-A o UPC-E.
 * Restituisce il codice (solo cifre; un UPC-E viene esteso a UPC-A) oppure null se la cifra di controllo non torna:
 * evita di interrogare Open Food Facts con codici letti male o digitati a caso.
 */
export function normalizeBarcode(input: unknown): string | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const code = String(input).replace(/[\s-]/g, '');
  if (!/^\d+$/.test(code)) return null;
  if (code.length === 13 || code.length === 12) return hasValidCheckDigit(code) ? code : null;
  if (code.length === 8) {
    if (hasValidCheckDigit(code)) return code; // EAN-8
    // UPC-E: Open Food Facts registra il prodotto con il codice esteso (UPC-A, 12 cifre).
    const upcA = expandUpcE(code);
    return upcA && hasValidCheckDigit(upcA) ? upcA : null;
  }
  return null;
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const clean = v.replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, max) : null;
};

/**
 * Valore numerico di un nutriente, oppure null se manca o è implausibile.
 * I dati sono inseriti dalla comunità: un valore fuori scala è più probabilmente
 * un errore di digitazione che un dato, e si mostra come "dato non disponibile".
 */
function nutrient(nutriments: Record<string, unknown>, key: string, factor: number, max: number, decimals: number): number | null {
  const raw = nutriments[key];
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  const value = n * factor;
  if (value > max) return null;
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
}

/**
 * Risposta di Open Food Facts (API v2) → riga di packaged_products.
 * Unità: i valori "_100g" sono in grammi, quindi sodio, calcio e colesterolo
 * vanno convertiti in mg (× 1000). Si usa solo `nutriments` (dati dell'etichetta):
 * `nutriments_estimated` è una stima dagli ingredienti e non va mostrata come dato.
 */
export function mapOpenFoodFactsProduct(barcode: string, product: Record<string, unknown>): PackagedProductRow {
  const n = (product['nutriments'] && typeof product['nutriments'] === 'object' ? product['nutriments'] : {}) as Record<string, unknown>;
  const kcal =
    nutrient(n, 'energy-kcal_100g', 1, 900, 1) ??
    // Solo kJ in etichetta: conversione esatta di unità (1 kcal = 4,184 kJ).
    nutrient(n, 'energy-kj_100g', 1 / 4.184, 900, 1);
  return {
    barcode,
    found: true,
    name: text(product['product_name_it'], 200) ?? text(product['product_name'], 200) ?? text(product['generic_name_it'], 200),
    brand: text(product['brands'], 200),
    quantity: text(product['quantity'], 80),
    countries: text(product['countries'], 300),
    ingredients: text(product['ingredients_text_it'], 4000) ?? text(product['ingredients_text'], 4000),
    kcal,
    protein_g: nutrient(n, 'proteins_100g', 1, 100, 2),
    carbs_g: nutrient(n, 'carbohydrates_100g', 1, 100, 2),
    sugars_g: nutrient(n, 'sugars_100g', 1, 100, 2),
    fat_g: nutrient(n, 'fat_100g', 1, 100, 2),
    saturated_fat_g: nutrient(n, 'saturated-fat_100g', 1, 100, 2),
    fiber_g: nutrient(n, 'fiber_100g', 1, 100, 2),
    sodium_mg: nutrient(n, 'sodium_100g', 1000, 40000, 1),
    calcium_mg: nutrient(n, 'calcium_100g', 1000, 40000, 1),
    cholesterol_mg: nutrient(n, 'cholesterol_100g', 1000, 3500, 1),
    source: 'Open Food Facts',
    source_url: `https://world.openfoodfacts.org/product/${barcode}`,
  };
}

/** Riga per un codice assente dalla banca dati (cache negativa, scadenza breve). */
export function notFoundRow(barcode: string): PackagedProductRow {
  return {
    barcode,
    found: false,
    name: null,
    brand: null,
    quantity: null,
    countries: null,
    ingredients: null,
    kcal: null,
    protein_g: null,
    carbs_g: null,
    sugars_g: null,
    fat_g: null,
    saturated_fat_g: null,
    fiber_g: null,
    sodium_mg: null,
    calcium_mg: null,
    cholesterol_mg: null,
    source: 'Open Food Facts',
    source_url: null,
  };
}
