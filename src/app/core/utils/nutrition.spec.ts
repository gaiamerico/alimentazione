import { describe, expect, it } from 'vitest';
import { Food } from '../models/food.model';
import {
  CALCIUM_PER_OXALATE_MG,
  calciumOxalateBalance,
  calciumSuggestions,
  guessMeal,
  normalizeText,
  oxalateLevel,
  scaleNutrients,
  shiftIsoDate,
  sumTotals,
} from './nutrition';

function food(partial: Partial<Food>): Food {
  return {
    id: 1,
    name_it: 'Test',
    name_en: null,
    category: 'Verdure',
    synonyms: null,
    kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    calcium_mg: 0,
    cholesterol_mg: 0,
    oxalate_mg: 0,
    oxalate_confidence: 'alta',
    default_portion_g: 100,
    portion_label: null,
    nutrient_source: '',
    oxalate_source: '',
    notes: null,
    ...partial,
  };
}

describe('oxalateLevel', () => {
  it('applica le soglie verde/giallo/rosso', () => {
    expect(oxalateLevel(0)).toBe('basso');
    expect(oxalateLevel(24.9)).toBe('basso');
    expect(oxalateLevel(25)).toBe('moderato');
    expect(oxalateLevel(99)).toBe('moderato');
    expect(oxalateLevel(100)).toBe('alto');
  });
});

describe('scaleNutrients / sumTotals', () => {
  const spinaci = food({ id: 1, kcal: 23, calcium_mg: 136, oxalate_mg: 750 });
  const parmigiano = food({ id: 2, kcal: 387, calcium_mg: 1159, cholesterol_mg: 91 });

  it('riscala i valori da 100 g ai grammi indicati', () => {
    const v = scaleNutrients(spinaci, 50);
    expect(v.oxalate_mg).toBe(375);
    expect(v.calcium_mg).toBe(68);
  });

  it('tratta grammi negativi o non numerici come zero', () => {
    expect(scaleNutrients(spinaci, -10).oxalate_mg).toBe(0);
    expect(scaleNutrients(spinaci, Number.NaN).kcal).toBe(0);
  });

  it('somma i nutrienti del pasto', () => {
    const t = sumTotals([
      { food: spinaci, grams: 200 },
      { food: parmigiano, grams: 20 },
    ]);
    expect(t.oxalate_mg).toBe(1500);
    expect(t.calcium_mg).toBeCloseTo(272 + 231.8, 5);
    expect(t.cholesterol_mg).toBeCloseTo(18.2, 5);
  });
});

describe('calciumOxalateBalance', () => {
  it('usa il rapporto molare 1:1 (≈0,455 mg Ca per mg di ossalato)', () => {
    expect(CALCIUM_PER_OXALATE_MG).toBeCloseTo(0.4553, 3);
    const b = calciumOxalateBalance(0, 100);
    expect(b.calciumToBind_mg).toBeCloseTo(45.53, 1);
    expect(b.calciumRecommended_mg).toBeCloseTo(91.07, 1);
  });

  it('segnala ossalati trascurabili sotto 10 mg', () => {
    expect(calciumOxalateBalance(0, 5).status).toBe('trascurabile');
  });

  it('classifica il bilancio in base al rapporto molare', () => {
    // 100 mg di ossalato: 1:1 ≈ 45,5 mg Ca, 2:1 ≈ 91 mg Ca
    expect(calciumOxalateBalance(30, 100).status).toBe('insufficiente');
    expect(calciumOxalateBalance(50, 100).status).toBe('sufficiente');
    expect(calciumOxalateBalance(95, 100).status).toBe('ottimo');
  });

  it('calcola il calcio mancante e la percentuale legabile', () => {
    const b = calciumOxalateBalance(20, 100);
    expect(b.calciumMissing_mg).toBeCloseTo(71.07, 1);
    expect(b.boundPercent).toBeCloseTo(43.9, 1);
    expect(calciumOxalateBalance(500, 100).boundPercent).toBe(100);
    expect(calciumOxalateBalance(0, 0).molarRatio).toBeNull();
  });

  it('suggerisce quantità di alimenti ricchi di calcio', () => {
    expect(calciumSuggestions(0)).toEqual([]);
    const s = calciumSuggestions(116);
    expect(s[0]).toEqual({ label: 'Parmigiano Reggiano', amount: '15 g' });
    expect(s[1].amount).toBe('100 ml');
  });
});

describe('utilità', () => {
  it('normalizza accenti e punteggiatura', () => {
    expect(normalizeText('  Caffè   Espresso! ')).toBe('caffe espresso');
    expect(normalizeText("Tuorlo d'uovo")).toBe('tuorlo d uovo');
  });

  it('sposta le date ISO attraverso mesi e anni', () => {
    expect(shiftIsoDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftIsoDate('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('indovina il pasto dall’ora', () => {
    expect(guessMeal(new Date(2026, 0, 1, 8))).toBe('colazione');
    expect(guessMeal(new Date(2026, 0, 1, 13))).toBe('pranzo');
    expect(guessMeal(new Date(2026, 0, 1, 16))).toBe('spuntino');
    expect(guessMeal(new Date(2026, 0, 1, 20))).toBe('cena');
  });
});
