import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Food } from '../../core/models/food.model';
import { FavoritesService } from '../../core/services/favorites.service';
import { HARVARD_TIER_LABEL, scaleNutrients } from '../../core/utils/nutrition';
import { EnrichOffer } from './enrich-offer';
import { Icon } from './icon';
import { OxalateBadge } from './oxalate-badge';

@Component({
  selector: 'app-food-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, Icon, OxalateBadge, EnrichOffer],
  template: `
    <article class="card group flex flex-col gap-3 p-4 transition hover:border-stone-300 dark:hover:border-white/15">
      <div class="flex items-start justify-between gap-3">
        <a [routerLink]="['/alimento', food().id]" class="min-w-0 flex-1">
          <h3 class="truncate font-semibold text-stone-900 group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-200">
            {{ food().name_it }}
          </h3>
          <p class="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
            {{ food().category }} ·
            @if (perPortion()) {
              {{ food().portion_label ?? 'porzione' }} ({{ food().default_portion_g | number: '1.0-0' }} g)
            } @else {
              per 100 g
            }
          </p>
        </a>
        @if (values().oxalate_mg === null && food().harvard; as h) {
          <!-- Solo il dato della lista Harvard, per porzione: non è confrontabile con le soglie per 100 g. -->
          <span
            class="inline-flex flex-col items-end rounded-xl bg-stone-100 px-2.5 py-1 text-xs whitespace-nowrap text-stone-700 ring-1 ring-stone-500/20 ring-inset dark:bg-white/5 dark:text-stone-200 dark:ring-white/15"
            [attr.title]="'Lista Harvard: ' + (h.oxalate_mg_serving | number: '1.0-1') + ' mg di ossalati per porzione (' + h.serving + '), fascia ' + tierLabel[h.tier] + '. Ossalato per 100 g non disponibile.'"
          >
            <span class="font-semibold tabular-nums">{{ h.oxalate_mg_serving | number: '1.0-1' }} mg</span>
            <span class="text-[10px] text-stone-500 dark:text-stone-400">per {{ h.serving }} · Harvard</span>
          </span>
        } @else {
          <app-oxalate-badge [mg]="values().oxalate_mg" [estimated]="values().oxalateEstimated" />
        }
      </div>

      <dl class="grid grid-cols-4 gap-2 text-center">
        <div class="rounded-xl bg-stone-50 px-1 py-2 dark:bg-white/[0.03]">
          <dt class="text-[10px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">Calcio</dt>
          <dd class="mt-0.5 text-sm font-semibold tabular-nums">@if (values().calcium_mg === null) { <span class="font-normal text-stone-400">n.d.</span> } @else { {{ values().calcium_mg | number: '1.0-0' }}<span class="text-[10px] font-normal text-stone-400"> mg</span> }</dd>
        </div>
        <div class="rounded-xl bg-stone-50 px-1 py-2 dark:bg-white/[0.03]">
          <dt class="text-[10px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">Colest.</dt>
          <dd class="mt-0.5 text-sm font-semibold tabular-nums">@if (values().cholesterol_mg === null) { <span class="font-normal text-stone-400">n.d.</span> } @else { {{ values().cholesterol_mg | number: '1.0-0' }}<span class="text-[10px] font-normal text-stone-400"> mg</span> }</dd>
        </div>
        <div class="rounded-xl bg-stone-50 px-1 py-2 dark:bg-white/[0.03]">
          <dt class="text-[10px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">Kcal</dt>
          <dd class="mt-0.5 text-sm font-semibold tabular-nums">@if (values().kcal === null) { <span class="font-normal text-stone-400">n.d.</span> } @else { {{ values().kcal | number: '1.0-0' }} }</dd>
        </div>
        <div class="rounded-xl bg-stone-50 px-1 py-2 dark:bg-white/[0.03]">
          <dt class="text-[10px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">P · C · G</dt>
          <dd class="mt-0.5 text-xs font-semibold tabular-nums leading-5">
            @if (values().protein_g === null && values().carbs_g === null && values().fat_g === null) {
              <span class="font-normal text-stone-400">n.d.</span>
            } @else {
              {{ (values().protein_g | number: '1.0-0') ?? '–' }}·{{ (values().carbs_g | number: '1.0-0') ?? '–' }}·{{ (values().fat_g | number: '1.0-0') ?? '–' }}
            }
          </dd>
        </div>
      </dl>

      <app-enrich-offer [food]="food()" [compact]="true" />

      <div class="mt-auto flex items-center justify-end gap-1">
        <button
          type="button"
          class="btn-ghost px-2.5 py-1.5"
          [class.text-amber-500!]="isFavorite()"
          (click)="favorites.toggle(food())"
          [attr.aria-pressed]="isFavorite()"
          [attr.aria-label]="isFavorite() ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'"
        >
          <app-icon name="star" [size]="18" [filled]="isFavorite()" />
        </button>
        <button type="button" class="btn-outline px-3 py-1.5 text-xs" (click)="addToMeal.emit(food())">
          <app-icon name="plus" [size]="16" /> Pasto
        </button>
      </div>
    </article>
  `,
})
export class FoodCard {
  protected readonly favorites = inject(FavoritesService);
  protected readonly tierLabel = HARVARD_TIER_LABEL;

  readonly food = input.required<Food>();
  readonly perPortion = input(false);
  readonly addToMeal = output<Food>();

  protected readonly values = computed(() =>
    scaleNutrients(this.food(), this.perPortion() ? this.food().default_portion_g : 100),
  );
  protected readonly isFavorite = computed(() => this.favorites.ids().has(this.food().id));
}
