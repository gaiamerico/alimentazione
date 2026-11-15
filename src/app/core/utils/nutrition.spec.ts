import { describe, expect, it } from 'vitest';
import { Food } from '../models/food.model';
import {
  CALCIUM_PER_OXALATE_MG,
  calciumBySource,
  calciumOxalateBalance,
  calciumSuggestions,
  guessMeal,
  isPartial,
  normalizeText,
  oxalateLevel,
  scaleNutrients,
  shiftIsoDate,
  sumTotals,
  topContributors,
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
    saturated_fat_g: null,
    sugars_g: null,
    sodium_mg: null,
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

describe('nutrienti facoltativi (grassi saturi, zuccheri, sodio)', () => {
  const completo = food({ id: 1, fat_g: 10, saturated_fat_g: 4, sugars_g: 2, sodium_mg: 300 });
  const senzaDati = food({ id: 2, fat_g: 5 });
  const soloSodio = food({ id: 3, sodium_mg: 100 });

  it('riscala i valori presenti e lascia null quelli mancanti', () => {
    const v = scaleNutrients(completo, 50);
    expect(v.saturated_fat_g).toBe(2);
    expect(v.sugars_g).toBe(1);
    expect(v.sodium_mg).toBe(150);
    expect(v.partial).toEqual([]);

    const m = scaleNutrients(senzaDati, 50);
    expect(m.saturated_fat_g).toBeNull();
    expect(m.sugars_g).toBeNull();
    expect(m.sodium_mg).toBeNull();
  });

  it('non confonde lo zero con il dato mancante', () => {
    const zero = scaleNutrients(food({ sodium_mg: 0 }), 100);
    expect(zero.sodium_mg).toBe(0);
    expect(zero.partial).not.toContain('sodium_mg');
  });

  it('tratta come mancante un alimento salvato prima dell’aggiunta dei campi', () => {
    const vecchio = { ...completo } as Partial<Food>;
    delete vecchio.sodium_mg;
    expect(scaleNutrients(vecchio as Food, 100).sodium_mg).toBeNull();
  });

  it('somma solo i valori presenti e segnala il totale come parziale', () => {
    const t = sumTotals([
      { food: completo, grams: 100 },
      { food: soloSodio, grams: 200 },
    ]);
    expect(t.sodium_mg).toBe(500);
    expect(isPartial(t, 'sodium_mg')).toBe(false);
    expect(t.saturated_fat_g).toBe(4);
    expect(isPartial(t, 'saturated_fat_g')).toBe(true);
    expect(t.partial).toEqual(['saturated_fat_g', 'sugars_g']);
  });

  it('restituisce null se nessun alimento ha il dato', () => {
    const t = sumTotals([{ food: senzaDati, grams: 100 }]);
    expect(t.saturated_fat_g).toBeNull();
    expect(isPartial(t, 'saturated_fat_g')).toBe(false);
  });

  it('un pasto vuoto ha totali a zero e niente di parziale', () => {
    const t = sumTotals([]);
    expect(t.sodium_mg).toBe(0);
    expect(t.partial).toEqual([]);
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

describe('testi del bilancio', () => {
  it('non promettono che il calcio neutralizzi gli ossalati', () => {
    const messages = [
      calciumOxalateBalance(0, 5),
      calciumOxalateBalance(30, 100),
      calciumOxalateBalance(50, 100),
      calciumOxalateBalance(95, 100),
    ].map((b) => `${b.title} ${b.message}`.toLowerCase());
    for (const m of messages) {
      expect(m).not.toMatch(/neutralizz|elimin|annull|integrator/);
    }
    // I tre stati con ossalati non trascurabili ricordano che la risposta individuale varia.
    for (const m of messages.slice(1)) expect(m).toContain('risposta individuale varia');
  });

  it('suggerisce solo alimenti', () => {
    const labels = calciumSuggestions(200).map((s) => s.label.toLowerCase()).join(' ');
    expect(labels).not.toMatch(/integrator|compress|supplement/);
  });
});

describe('topContributors', () => {
  const spinaci = food({ id: 1, name_it: 'Spinaci', oxalate_mg: 750, calcium_mg: 136 });
  const mandorle = food({ id: 2, name_it: 'Mandorle', oxalate_mg: 435, calcium_mg: 269 });
  const parmigiano = food({ id: 3, name_it: 'Parmigiano', calcium_mg: 1159, cholesterol_mg: 91 });
  const latte = food({ id: 4, name_it: 'Latte', calcium_mg: 119, cholesterol_mg: 10 });

  it('ordina per contributo e calcola la quota sul totale', () => {
    const top = topContributors(
      [
        { food: mandorle, grams: 20 }, // 87 mg
        { food: spinaci, grams: 100 }, // 750 mg
        { food: parmigiano, grams: 30 }, // 0 mg di ossalati
      ],
      'oxalate_mg',
    );
    expect(top.map((c) => c.food.name_it)).toEqual(['Spinaci', 'Mandorle']);
    expect(top[0].amount).toBe(750);
    expect(top[0].share).toBeCloseTo(750 / 837, 5);
    expect(top[0].share + top[1].share).toBeCloseTo(1, 5);
  });

  it('restituisce al massimo tre alimenti, con la quota calcolata su tutto il pasto', () => {
    const top = topContributors(
      [
        { food: spinaci, grams: 100 }, // 136
        { food: mandorle, grams: 100 }, // 269
        { food: parmigiano, grams: 10 }, // 115,9
        { food: latte, grams: 100 }, // 119
      ],
      'calcium_mg',
    );
    expect(top.map((c) => c.food.name_it)).toEqual(['Mandorle', 'Spinaci', 'Latte']);
    expect(top.reduce((sum, c) => sum + c.share, 0)).toBeLessThan(1);
  });

  it('somma lo stesso alimento presente in più voci (diario)', () => {
    const top = topContributors(
      [
        { food: latte, grams: 100 },
        { food: parmigiano, grams: 10 },
        { food: latte, grams: 200 },
      ],
      'cholesterol_mg',
    );
    expect(top).toHaveLength(2);
    expect(top[0].food.name_it).toBe('Latte');
    expect(top[0].amount).toBeCloseTo(30, 5);
  });

  it('è vuoto se nessun alimento apporta il nutriente', () => {
    expect(topContributors([{ food: spinaci, grams: 100 }], 'cholesterol_mg')).toEqual([]);
    expect(topContributors([], 'oxalate_mg')).toEqual([]);
  });
});

describe('calciumBySource', () => {
  it('separa il calcio degli alimenti ad alto contenuto di ossalati (≥ 100 mg/100 g)', () => {
    const split = calciumBySource([
      { food: food({ id: 1, oxalate_mg: 750, calcium_mg: 136 }), grams: 100 }, // alto
      { food: food({ id: 2, oxalate_mg: 100, calcium_mg: 50 }), grams: 200 }, // alto (soglia inclusa)
      { food: food({ id: 3, oxalate_mg: 99, calcium_mg: 40 }), grams: 100 }, // moderato
      { food: food({ id: 4, oxalate_mg: 0, calcium_mg: 1159 }), grams: 20 }, // basso
    ]);
    expect(split.fromHighOxalate_mg).toBeCloseTo(236, 5);
    expect(split.fromOthers_mg).toBeCloseTo(40 + 231.8, 5);
  });

  it('usa la soglia per 100 g dell’alimento, non la quantità nel pasto', () => {
    const split = calciumBySource([{ food: food({ id: 1, oxalate_mg: 750, calcium_mg: 136 }), grams: 5 }]);
    expect(split.fromHighOxalate_mg).toBeCloseTo(6.8, 5);
    expect(split.fromOthers_mg).toBe(0);
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
