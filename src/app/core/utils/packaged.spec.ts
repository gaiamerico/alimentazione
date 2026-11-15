import { describe, expect, it } from 'vitest';
import { Food } from '../models/food.model';
import { findOxalateIngredients, normalizeBarcode } from './packaged';

function food(id: number, name_it: string, oxalate_mg: number, synonyms: string | null = null): Food {
  return {
    id,
    name_it,
    name_en: null,
    category: 'Test',
    synonyms,
    kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    calcium_mg: 0,
    cholesterol_mg: 0,
    saturated_fat_g: null,
    sugars_g: null,
    sodium_mg: null,
    oxalate_mg,
    oxalate_confidence: 'media',
    default_portion_g: 100,
    portion_label: null,
    nutrient_source: '',
    oxalate_source: '',
    notes: null,
  };
}

const catalog: Food[] = [
  food(1, 'Cacao amaro in polvere', 650, 'cacao'),
  food(2, 'Mandorle', 435),
  food(3, 'Nocciole', 167),
  food(4, 'Spinaci crudi', 970),
  food(5, 'Spinaci cotti', 750),
  food(6, 'Arachidi tostate', 96),
  food(7, 'Burro di arachidi', 41),
  food(8, 'Noci', 62),
  food(9, 'Latte intero', 0),
  food(10, 'Zucchero', 0),
  food(11, 'Tè nero (infuso)', 30, 'tè'),
  food(12, 'Semi di girasole', 40),
];

describe('normalizeBarcode', () => {
  it('accetta EAN-13, EAN-8 e UPC-A con cifra di controllo corretta', () => {
    expect(normalizeBarcode('3017620422003')).toBe('3017620422003');
    expect(normalizeBarcode('8001120894601')).toBe('8001120894601');
    expect(normalizeBarcode('96385074')).toBe('96385074');
    expect(normalizeBarcode('036000291452')).toBe('036000291452');
  });

  it('accetta spazi e trattini', () => {
    expect(normalizeBarcode(' 3017 6204-22003 ')).toBe('3017620422003');
  });

  it('estende un UPC-E al codice UPC-A con cui il prodotto è registrato', () => {
    expect(normalizeBarcode('04252614')).toBe('042100005264');
  });

  it('rifiuta cifre di controllo sbagliate, lunghezze non previste e testo', () => {
    expect(normalizeBarcode('3017620422004')).toBeNull();
    expect(normalizeBarcode('12345')).toBeNull();
    expect(normalizeBarcode('12345678901234567')).toBeNull();
    expect(normalizeBarcode('abc')).toBeNull();
    expect(normalizeBarcode('')).toBeNull();
  });
});

describe('findOxalateIngredients', () => {
  it('riconosce gli ingredienti ricchi di ossalati, al singolare o al plurale', () => {
    const found = findOxalateIngredients(
      'Zucchero, olio di palma, NOCCIOLE 13%, latte scremato in polvere 8,7%, cacao magro 7,4%, emulsionanti: lecitina di soia, vanillina',
      catalog,
    );
    expect(found).toEqual([
      { label: 'cacao', level: 'alto' },
      { label: 'nocciole', level: 'alto' },
    ]);
    expect(findOxalateIngredients('farina, mandorla (5%), sale', catalog)).toEqual([{ label: 'mandorle', level: 'alto' }]);
  });

  it('non segnala gli alimenti a basso contenuto di ossalati', () => {
    expect(findOxalateIngredients('latte intero, zucchero', catalog)).toEqual([]);
  });

  it('unisce le varianti dello stesso ingrediente (crudo/cotto)', () => {
    expect(findOxalateIngredients('pasta, spinaci 20%, ricotta', catalog)).toEqual([{ label: 'spinaci', level: 'alto' }]);
  });

  it('tiene il riscontro più lungo: "burro di arachidi" non è anche "arachidi"', () => {
    expect(findOxalateIngredients('burro di arachidi, sale', catalog)).toEqual([{ label: 'burro di arachidi', level: 'moderato' }]);
    expect(findOxalateIngredients('arachidi, burro di arachidi', catalog)).toEqual([
      { label: 'arachidi', level: 'moderato' },
      { label: 'burro di arachidi', level: 'moderato' },
    ]);
  });

  it('ignora gli ingredienti che contengono il nome senza esserlo', () => {
    expect(findOxalateIngredients('zucchero, burro di cacao, noce moscata, olio di semi di girasole', catalog)).toEqual([]);
    expect(findOxalateIngredients('burro di cacao, pasta di cacao', catalog)).toEqual([{ label: 'cacao', level: 'alto' }]);
  });

  it('non riconosce un nome a cavallo di un ingrediente escluso né nomi troppo corti', () => {
    expect(findOxalateIngredients('semi di noce moscata girasole', catalog)).toEqual([]);
    expect(findOxalateIngredients('estratto di te verde', catalog)).toEqual([]);
  });

  it('ordina prima gli alti, poi i moderati', () => {
    expect(findOxalateIngredients('noci, mandorle', catalog).map((i) => i.label)).toEqual(['mandorle', 'noci']);
  });

  it('gestisce un elenco ingredienti assente', () => {
    expect(findOxalateIngredients(null, catalog)).toEqual([]);
    expect(findOxalateIngredients('', catalog)).toEqual([]);
  });
});
