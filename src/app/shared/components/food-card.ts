import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Food } from '../../core/models/food.model';
import { FavoritesService } from '../../core/services/favorites.service';
import { scaleNutrients } from '../../core/utils/nutrition';
import { Icon } from './icon';
import { OxalateBadge } from './oxalate-badge';

@Component({
  selector: 'app-food-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, Icon, OxalateBadge],
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
        <app-oxalate-badge [mg]="values().oxalate_mg" />
      </div>

      <dl class="grid grid-cols-4 gap-2 text-center">
        <div class="rounded-xl bg-stone-50 px-1 py-2 dark:bg-white/[0.03]">
          <dt class="text-[10px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">Calcio</dt>
          <dd class="mt-0.5 text-sm font-semibold tabular-nums">{{ values().calcium_mg | number: '1.0-0' }}<span class="text-[10px] font-normal text-stone-400"> mg</span></dd>
        </div>
        <div class="rounded-xl bg-stone-50 px-1 py-2 dark:bg-white/[0.03]">
          <dt class="text-[10px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">Colest.</dt>
          <dd class="mt-0.5 text-sm font-semibold tabular-nums">{{ values().cholesterol_mg | number: '1.0-0' }}<span class="text-[10px] font-normal text-stone-400"> mg</span></dd>
        </div>
        <div class="rounded-xl bg-stone-50 px-1 py-2 dark:bg-white/[0.03]">
          <dt class="text-[10px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">Kcal</dt>
          <dd class="mt-0.5 text-sm font-semibold tabular-nums">{{ values().kcal | number: '1.0-0' }}</dd>
        </div>
        <div class="rounded-xl bg-stone-50 px-1 py-2 dark:bg-white/[0.03]">
          <dt class="text-[10px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">P · C · G</dt>
          <dd class="mt-0.5 text-xs font-semibold tabular-nums leading-5">
            {{ values().protein_g | number: '1.0-0' }}·{{ values().carbs_g | number: '1.0-0' }}·{{ values().fat_g | number: '1.0-0' }}
          </dd>
        </div>
      </dl>

      <div class="flex items-center justify-end gap-1">
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

  readonly food = input.required<Food>();
  readonly perPortion = input(false);
  readonly addToMeal = output<Food>();

  protected readonly values = computed(() =>
    scaleNutrients(this.food(), this.perPortion() ? this.food().default_portion_g : 100),
  );
  protected readonly isFavorite = computed(() => this.favorites.ids().has(this.food().id));
}
