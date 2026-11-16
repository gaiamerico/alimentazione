import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NutrientKey, NutrientTotals, OptionalNutrient } from '../../core/models/food.model';
import { DAILY_REFERENCE, isPartial, MISSING_VALUE_LABEL } from '../../core/utils/nutrition';

interface Tile {
  key: NutrientKey;
  label: string;
  /** null = nessun alimento riporta il dato. */
  value: number | null;
  /** true = ad alcuni alimenti manca il dato: il totale somma solo i valori disponibili. */
  partial: boolean;
  /** true = il totale comprende ossalati stimati dalla porzione della lista Harvard. */
  estimated: boolean;
  unit: string;
  digits: string;
  /** Percentuale rispetto al riferimento giornaliero (se applicabile). */
  percent: number | null;
  ref: string | null;
  tone: string;
  /** true se superare il riferimento è negativo (colesterolo, ossalati). */
  isLimit: boolean;
}

/** Nutriente che non tutti gli alimenti riportano: può mancare o essere un totale parziale. */
interface OptionalTile {
  key: OptionalNutrient;
  label: string;
  value: number | null;
  unit: string;
  digits: string;
  partial: boolean;
}

const NO_REFERENCE = { percent: null, ref: null, tone: '', isLimit: false } as const;

/** Riquadri con i totali nutrizionali (pasto o giornata). */
@Component({
  selector: 'app-nutrient-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      @for (t of tiles(); track t.key) {
        <div class="card p-4">
          <p class="text-xs font-medium text-stone-500 dark:text-stone-400">{{ t.label }}</p>
          @if (t.value === null) {
            <p class="mt-1 text-sm text-stone-400 italic dark:text-stone-500">{{ missingLabel }}</p>
          } @else {
            <p class="mt-1 text-xl font-semibold tabular-nums tracking-tight">
              {{ t.estimated ? '≈ ' : '' }}{{ t.value | number: t.digits }}<span class="ml-0.5 text-xs font-normal text-stone-400">{{ t.unit }}</span>
            </p>
            @if (t.partial || t.estimated) {
              <p class="mt-1 flex flex-wrap gap-1">
                @if (t.partial) {
                  <span
                    class="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
                    title="Alcuni alimenti non riportano questo dato: il totale somma solo i valori disponibili."
                  >parziale</span>
                }
                @if (t.estimated) {
                  <span
                    class="rounded-full bg-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-700 dark:bg-white/10 dark:text-stone-200"
                    title="Il totale comprende ossalati stimati dalla porzione della lista Harvard, non misure per 100 g."
                  >include stime</span>
                }
              </p>
            }
          }
          @if (t.value !== null && t.percent !== null) {
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

    <dl class="card mt-3 grid grid-cols-3 divide-x divide-stone-100 dark:divide-white/[0.05]">
      @for (o of optionalTiles(); track o.key) {
        <div class="px-3 py-3 sm:px-4">
          <dt class="text-xs font-medium text-stone-500 dark:text-stone-400">{{ o.label }}</dt>
          @if (o.value === null) {
            <dd class="mt-1 text-xs text-stone-400 italic dark:text-stone-500">{{ missingLabel }}</dd>
          } @else {
            <dd class="mt-1 text-base font-semibold tabular-nums tracking-tight">
              {{ o.value | number: o.digits }}<span class="ml-0.5 text-xs font-normal text-stone-400">{{ o.unit }}</span>
              @if (o.partial) {
                <span
                  class="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 align-middle text-[10px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
                  title="Alcuni alimenti non riportano questo dato: il totale somma solo i valori disponibili."
                >parziale</span>
              }
            </dd>
          }
        </div>
      }
    </dl>
    @if (hasPartial()) {
      <p class="mt-1.5 px-1 text-[11px] text-stone-500 dark:text-stone-400">
        “Parziale”: alcuni alimenti non riportano il dato, quindi il totale somma solo i valori disponibili.
      </p>
    }
  `,
})
export class NutrientSummary {
  readonly totals = input.required<NutrientTotals>();
  /** Mostra le barre di avanzamento rispetto ai riferimenti giornalieri. */
  readonly showDaily = input(false);

  protected readonly missingLabel = MISSING_VALUE_LABEL;

  protected readonly optionalTiles = computed((): OptionalTile[] => {
    const t = this.totals();
    return [
      { key: 'saturated_fat_g', label: 'Grassi saturi', value: t.saturated_fat_g, unit: ' g', digits: '1.0-1', partial: isPartial(t, 'saturated_fat_g') },
      { key: 'sugars_g', label: 'Zuccheri', value: t.sugars_g, unit: ' g', digits: '1.0-1', partial: isPartial(t, 'sugars_g') },
      { key: 'sodium_mg', label: 'Sodio', value: t.sodium_mg, unit: ' mg', digits: '1.0-0', partial: isPartial(t, 'sodium_mg') },
    ];
  });
  protected readonly hasPartial = computed(() => this.optionalTiles().some((o) => o.partial) || this.tiles().some((t) => t.partial));

  protected readonly tiles = computed((): Tile[] => {
    const t = this.totals();
    const daily = this.showDaily();
    const pct = (key: NutrientKey, ref: number) => (daily && t[key] !== null ? ((t[key] ?? 0) / ref) * 100 : null);
    const tile = (key: NutrientKey, label: string, unit: string, digits: string, rest: Pick<Tile, 'percent' | 'ref' | 'tone' | 'isLimit'> = NO_REFERENCE): Tile => ({
      key,
      label,
      value: t[key],
      partial: isPartial(t, key),
      estimated: key === 'oxalate_mg' && t.oxalateEstimated && t[key] !== null,
      unit,
      digits,
      ...rest,
    });
    return [
      tile('kcal', 'Energia', ' kcal', '1.0-0', { percent: pct('kcal', DAILY_REFERENCE.kcal), ref: `${DAILY_REFERENCE.kcal} kcal`, tone: 'bg-brand-500', isLimit: false }),
      tile('protein_g', 'Proteine', ' g', '1.0-1'),
      tile('carbs_g', 'Carboidrati', ' g', '1.0-1'),
      tile('fat_g', 'Grassi', ' g', '1.0-1'),
      tile('calcium_mg', 'Calcio', ' mg', '1.0-0', { percent: pct('calcium_mg', DAILY_REFERENCE.calcium_mg), ref: `${DAILY_REFERENCE.calcium_mg} mg`, tone: 'bg-sky-500', isLimit: false }),
      tile('cholesterol_mg', 'Colesterolo', ' mg', '1.0-0', { percent: pct('cholesterol_mg', DAILY_REFERENCE.cholesterol_mg), ref: `max ${DAILY_REFERENCE.cholesterol_mg} mg`, tone: 'bg-violet-500', isLimit: true }),
      tile('oxalate_mg', 'Ossalati', ' mg', '1.0-0', { percent: pct('oxalate_mg', DAILY_REFERENCE.oxalate_mg), ref: `max ${DAILY_REFERENCE.oxalate_mg} mg`, tone: 'bg-amber-500', isLimit: true }),
      tile('fiber_g', 'Fibre', ' g', '1.0-1'),
    ];
  });
}
