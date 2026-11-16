import { DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MealItem } from '../../core/models/food.model';
import { calciumBySource, Contributor, ContributorNutrient, foodsMissing, OXALATE_HIGH_MIN, topContributors } from '../../core/utils/nutrition';

interface Group {
  key: ContributorNutrient;
  label: string;
  tone: string;
  top: Contributor[];
  /** Alimenti a cui manca il dato: non compaiono tra i contributi e le quote sono su un totale parziale. */
  missing: string[];
}

/**
 * Da dove vengono ossalati, calcio e colesterolo del pasto (o della giornata):
 * i primi tre alimenti per ciascun nutriente con la quota sul totale, e il calcio
 * separato tra alimenti ad alto contenuto di ossalati e tutti gli altri.
 */
@Component({
  selector: 'app-contributors-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, PercentPipe],
  template: `
    @if (hasData()) {
      <section class="card p-5" aria-label="Contributi principali">
        <h2 class="font-semibold">Contributi principali {{ scope() }}</h2>
        <div class="mt-3 grid gap-5 sm:grid-cols-3">
          @for (g of groups(); track g.key) {
            <div>
              <h3 class="text-xs font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">{{ g.label }}</h3>
              @if (g.top.length === 0 && g.missing.length === 0) {
                <p class="mt-2 text-sm text-stone-400 dark:text-stone-500">Nessun apporto</p>
              } @else {
                <ol class="mt-2 space-y-2">
                  @for (c of g.top; track c.food.id) {
                    <li>
                      <div class="flex items-baseline justify-between gap-2 text-sm">
                        <span class="truncate">{{ c.food.name_it }}</span>
                        <span class="shrink-0 tabular-nums text-stone-500 dark:text-stone-400">
                          {{ c.estimated ? '≈ ' : '' }}{{ c.amount | number: '1.0-0' }} mg · <strong class="text-stone-900 dark:text-white">{{ c.share | percent: '1.0-0' }}</strong>
                        </span>
                      </div>
                      <div class="mt-1 h-1.5 rounded-full bg-stone-200 dark:bg-white/10">
                        <div class="h-full rounded-full" [class]="g.tone" [style.width.%]="c.share * 100"></div>
                      </div>
                    </li>
                  }
                </ol>
                @if (g.missing.length > 0) {
                  <p class="mt-2 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                    Dato non disponibile per: {{ g.missing.join(', ') }}.@if (g.top.length > 0) { Le quote sono calcolate sul totale parziale.}
                  </p>
                }
              }
            </div>
          }
        </div>

        @if (calcium().total > 0) {
          <div class="mt-5 border-t border-stone-200 pt-4 dark:border-white/[0.06]">
            <h3 class="text-xs font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">Calcio per provenienza</h3>
            <div class="mt-2 flex h-2.5 overflow-hidden rounded-full bg-stone-200 dark:bg-white/10" role="img" [attr.aria-label]="calciumAria()">
              <div class="h-full bg-rose-400" [style.width.%]="calcium().highShare * 100"></div>
              <div class="h-full bg-sky-500" [style.width.%]="(1 - calcium().highShare) * 100"></div>
            </div>
            <dl class="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              <div class="flex items-baseline justify-between gap-2">
                <dt class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-rose-400"></span>Da alimenti ad alto contenuto di ossalati</dt>
                <dd class="shrink-0 font-semibold tabular-nums">{{ calcium().fromHighOxalate_mg | number: '1.0-0' }} mg</dd>
              </div>
              <div class="flex items-baseline justify-between gap-2">
                <dt class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-sky-500"></span>Da altri alimenti</dt>
                <dd class="shrink-0 font-semibold tabular-nums">{{ calcium().fromOthers_mg | number: '1.0-0' }} mg</dd>
              </div>
            </dl>
            <p class="mt-2 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
              “Alto contenuto di ossalati” = almeno {{ highMin }} mg per 100 g, la stessa soglia dell'indicatore rosso. Negli alimenti
              molto ricchi di ossalati una parte del calcio può essere già legata agli ossalati dell'alimento stesso.
            </p>
          </div>
        }
      </section>
    }
  `,
})
export class ContributorsPanel {
  /** Alimenti con i grammi (voci del pasto o del diario). */
  readonly items = input.required<readonly MealItem[]>();
  /** Completa il titolo: "del pasto" oppure "della giornata". */
  readonly scope = input('del pasto');

  protected readonly highMin = OXALATE_HIGH_MIN;

  protected readonly groups = computed((): Group[] => {
    const items = this.items();
    return [
      { key: 'oxalate_mg', label: 'Ossalati', tone: 'bg-amber-500', top: topContributors(items, 'oxalate_mg'), missing: foodsMissing(items, 'oxalate_mg') },
      { key: 'calcium_mg', label: 'Calcio', tone: 'bg-sky-500', top: topContributors(items, 'calcium_mg'), missing: foodsMissing(items, 'calcium_mg') },
      { key: 'cholesterol_mg', label: 'Colesterolo', tone: 'bg-violet-500', top: topContributors(items, 'cholesterol_mg'), missing: foodsMissing(items, 'cholesterol_mg') },
    ];
  });

  protected readonly hasData = computed(() => this.groups().some((g) => g.top.length > 0 || g.missing.length > 0));

  protected readonly calcium = computed(() => {
    const split = calciumBySource(this.items());
    const total = split.fromHighOxalate_mg + split.fromOthers_mg;
    return { ...split, total, highShare: total > 0 ? split.fromHighOxalate_mg / total : 0 };
  });

  protected readonly calciumAria = computed(() => {
    const c = this.calcium();
    return `Calcio: ${Math.round(c.fromHighOxalate_mg)} mg da alimenti ad alto contenuto di ossalati, ${Math.round(c.fromOthers_mg)} mg da altri alimenti`;
  });
}
