import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NutrientTotals } from '../../core/models/food.model';
import { DAILY_REFERENCE } from '../../core/utils/nutrition';

interface Tile {
  label: string;
  value: number;
  unit: string;
  digits: string;
  /** Percentuale rispetto al riferimento giornaliero (se applicabile). */
  percent: number | null;
  ref: string | null;
  tone: string;
  /** true se superare il riferimento è negativo (colesterolo, ossalati). */
  isLimit: boolean;
}

/** Riquadri con i totali nutrizionali (pasto o giornata). */
@Component({
  selector: 'app-nutrient-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      @for (t of tiles(); track t.label) {
        <div class="card p-4">
          <p class="text-xs font-medium text-stone-500 dark:text-stone-400">{{ t.label }}</p>
          <p class="mt-1 text-xl font-semibold tabular-nums tracking-tight">
            {{ t.value | number: t.digits }}<span class="ml-0.5 text-xs font-normal text-stone-400">{{ t.unit }}</span>
          </p>
          @if (t.percent !== null) {
            <div class="mt-2 h-1.5 rounded-full bg-stone-200 dark:bg-white/10">
              <div
                class="h-full rounded-full transition-[width] duration-500"
                [class]="t.isLimit && t.percent > 100 ? 'bg-rose-500' : t.tone"
                [style.width.%]="t.percent > 100 ? 100 : t.percent"
              ></div>
            </div>
            <p class="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
              {{ t.percent | number: '1.0-0' }}% di {{ t.ref }}
            </p>
          }
        </div>
      }
    </div>
  `,
})
export class NutrientSummary {
  readonly totals = input.required<NutrientTotals>();
  /** Mostra le barre di avanzamento rispetto ai riferimenti giornalieri. */
  readonly showDaily = input(false);

  protected readonly tiles = computed((): Tile[] => {
    const t = this.totals();
    const daily = this.showDaily();
    const pct = (v: number, ref: number) => (daily ? (v / ref) * 100 : null);
    return [
      { label: 'Energia', value: t.kcal, unit: ' kcal', digits: '1.0-0', percent: pct(t.kcal, DAILY_REFERENCE.kcal), ref: `${DAILY_REFERENCE.kcal} kcal`, tone: 'bg-brand-500', isLimit: false },
      { label: 'Proteine', value: t.protein_g, unit: ' g', digits: '1.0-1', percent: null, ref: null, tone: '', isLimit: false },
      { label: 'Carboidrati', value: t.carbs_g, unit: ' g', digits: '1.0-1', percent: null, ref: null, tone: '', isLimit: false },
      { label: 'Grassi', value: t.fat_g, unit: ' g', digits: '1.0-1', percent: null, ref: null, tone: '', isLimit: false },
      { label: 'Calcio', value: t.calcium_mg, unit: ' mg', digits: '1.0-0', percent: pct(t.calcium_mg, DAILY_REFERENCE.calcium_mg), ref: `${DAILY_REFERENCE.calcium_mg} mg`, tone: 'bg-sky-500', isLimit: false },
      { label: 'Colesterolo', value: t.cholesterol_mg, unit: ' mg', digits: '1.0-0', percent: pct(t.cholesterol_mg, DAILY_REFERENCE.cholesterol_mg), ref: `max ${DAILY_REFERENCE.cholesterol_mg} mg`, tone: 'bg-violet-500', isLimit: true },
      { label: 'Ossalati', value: t.oxalate_mg, unit: ' mg', digits: '1.0-0', percent: pct(t.oxalate_mg, DAILY_REFERENCE.oxalate_mg), ref: `max ${DAILY_REFERENCE.oxalate_mg} mg`, tone: 'bg-amber-500', isLimit: true },
      { label: 'Fibre', value: t.fiber_g, unit: ' g', digits: '1.0-1', percent: null, ref: null, tone: '', isLimit: false },
    ];
  });
}
