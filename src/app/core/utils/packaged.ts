import { Food } from '../models/food.model';
import { normalizeText, OxalateLevel, oxalateLevel } from './nutrition';

// ---------------------------------------------------------------------
// Codice a barre
// ---------------------------------------------------------------------

/** Formati letti dallo scanner (nomi dell'API BarcodeDetector). */
export const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

/** Cifra di controllo GS1 (EAN-8, UPC-A, EAN-13): pesi 3-1 da destra. */
function hasValidCheckDigit(digits: string): boolean {
  let sum = 0;
  for (let i = digits.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += Number(digits[i]) * weight;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/** UPC-E (8 cifre) → UPC-A (12 cifre); null se la forma non è valida. */
function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const d = code.slice(1, 7);
  let body: string;
  if (d[5] <= '2') body = `${d[0]}${d[1]}${d[5]}0000${d[2]}${d[3]}${d[4]}`;
  else if (d[5] === '3') body = `${d[0]}${d[1]}${d[2]}00000${d[3]}${d[4]}`;
  else if (d[5] === '4') body = `${d[0]}${d[1]}${d[2]}${d[3]}00000${d[4]}`;
  else body = `${d[0]}${d[1]}${d[2]}${d[3]}${d[4]}0000${d[5]}`;
  return `${code[0]}${body}${code[7]}`;
}

/**
 * Ripulisce e valida un codice EAN-13, EAN-8, UPC-A o UPC-E (stessa regola della
 * Edge Function lookup-barcode). Un UPC-E viene esteso a UPC-A. null se le cifre non sono un codice valido.
 */
export function normalizeBarcode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(code)) return null;
  if (code.length === 13 || code.length === 12) return hasValidCheckDigit(code) ? code : null;
  if (code.length === 8) {
    if (hasValidCheckDigit(code)) return code;
    // UPC-E: la banca dati registra il prodotto con il codice esteso (UPC-A, 12 cifre).
    const upcA = expandUpcE(code);
    return upcA && hasValidCheckDigit(upcA) ? upcA : null;
  }
  return null;
}

// ---------------------------------------------------------------------
// Ingredienti ricchi di ossalati
// ---------------------------------------------------------------------

/** Ingrediente dell'etichetta riconosciuto nel catalogo. */
export interface OxalateIngredient {
  /** Nome dell'ingrediente come compare nel catalogo, es. "cacao", "mandorle". */
  label: string;
  /** Livello di ossalati per 100 g dell'alimento corrispondente nel catalogo. */
  level: Exclude<OxalateLevel, 'basso'>;
}

/** Parole di collegamento: ignorate sia nei nomi del catalogo sia nell'elenco ingredienti. */
const STOP_WORDS = new Set(['di', 'd', 'da', 'del', 'della', 'dei', 'delle', 'in', 'con', 'senza', 'al', 'alla', 'il', 'la', 'le', 'e', 'a']);

/** Stato o preparazione: non fanno parte del nome dell'ingrediente ("Spinaci cotti" → "spinaci"). */
const QUALIFIERS = new Set([
  'crudo', 'cruda', 'crudi', 'crude', 'cotto', 'cotta', 'cotti', 'cotte', 'lesso', 'lessa', 'lessi', 'lesse',
  'lessato', 'lessata', 'lessati', 'lessate', 'bollito', 'bollita', 'bolliti', 'bollite',
  'fresco', 'fresca', 'freschi', 'fresche', 'secco', 'secca', 'secchi', 'secche',
  'tostato', 'tostata', 'tostati', 'tostate', 'amaro', 'polvere', 'forno', 'buccia', 'coste', 'infuso',
]);

/** Ingredienti che contengono il nome di un alimento ricco di ossalati senza esserlo. */
const FALSE_FRIENDS = ['burro di cacao', 'noce moscata', 'noce di cocco', 'noci di cocco', 'olio di arachidi', 'olio di arachide', 'olio di girasole', 'olio di semi di girasole', 'lecitina di girasole'];

/** Singolare e plurale coincidono togliendo la vocale finale: "mandorla" / "mandorle" → "mandorl". */
const stem = (word: string) => (word.length > 3 ? word.replace(/[aeio]$/, '') : word);

function words(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((w) => w && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

/** Nome dell'ingrediente ricavato dal nome in catalogo, senza stato né preparazione. */
function ingredientName(foodName: string): string {
  const kept = normalizeText(foodName)
    .split(' ')
    .filter((w) => w && !QUALIFIERS.has(w) && !/^\d+$/.test(w));
  while (kept.length > 0 && STOP_WORDS.has(kept[kept.length - 1])) kept.pop();
  while (kept.length > 0 && STOP_WORDS.has(kept[0])) kept.shift();
  return kept.join(' ');
}

const LEVEL_RANK: Record<OxalateLevel, number> = { basso: 0, moderato: 1, alto: 2 };

/**
 * Confronta l'elenco ingredienti di un prodotto confezionato con il catalogo e
 * restituisce gli ingredienti riconosciuti che in catalogo hanno ossalati alti o
 * moderati. Confronto deterministico sulle parole (nomi e sinonimi), senza modello
 * linguistico. Dice solo che l'ingrediente è presente: la quantità non è nota.
 */
export function findOxalateIngredients(ingredients: string | null, catalog: readonly Food[]): OxalateIngredient[] {
  if (!ingredients) return [];
  let cleaned = ` ${normalizeText(ingredients)} `;
  for (const phrase of FALSE_FRIENDS) cleaned = cleaned.replaceAll(` ${normalizeText(phrase)} `, ' | ');
  // Il separatore "|" impedisce di riconoscere un nome a cavallo di un ingrediente rimosso.
  const text = cleaned
    .split(' ')
    .filter((w) => w && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
    .map((w) => (w === '|' ? w : stem(w)));

  const matches: { start: number; end: number; label: string; level: OxalateLevel }[] = [];
  for (const food of catalog) {
    const level = oxalateLevel(Number(food.oxalate_mg) || 0);
    if (level === 'basso') continue;
    const names = [ingredientName(food.name_it), ...(food.synonyms ?? '').split(',').map((s) => normalizeText(s))];
    for (const name of names) {
      const term = words(name).map(stem);
      // Nomi troppo corti ("tè") darebbero falsi riscontri dentro altre parole dell'etichetta.
      if (term.length === 0 || term.join('').length < 3) continue;
      for (let i = 0; i + term.length <= text.length; i++) {
        if (term.every((t, k) => text[i + k] === t)) {
          matches.push({ start: i, end: i + term.length, label: ingredientName(food.name_it), level });
        }
      }
    }
  }

  // "burro di arachidi" contiene "arachidi": si tiene solo il riscontro più lungo.
  const kept = matches.filter(
    (m) => !matches.some((o) => o !== m && o.start <= m.start && o.end >= m.end && o.end - o.start > m.end - m.start),
  );

  const byLabel = new Map<string, OxalateLevel>();
  for (const m of kept) {
    const current = byLabel.get(m.label);
    if (!current || LEVEL_RANK[m.level] > LEVEL_RANK[current]) byLabel.set(m.label, m.level);
  }
  return [...byLabel.entries()]
    .map(([label, level]) => ({ label, level: level as OxalateIngredient['level'] }))
    .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.label.localeCompare(b.label, 'it'));
}
