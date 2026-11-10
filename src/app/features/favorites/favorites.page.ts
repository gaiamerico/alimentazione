import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Food } from '../../core/models/food.model';
import { FavoritesService } from '../../core/services/favorites.service';
import { MealService } from '../../core/services/meal.service';
import { ToastService } from '../../core/services/toast.service';
import { FoodCard } from '../../shared/components/food-card';
import { Icon } from '../../shared/components/icon';

@Component({
  selector: 'app-favorites-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoodCard, Icon],
  template: `
    <header class="mb-6">
      <h1 class="page-title">Preferiti</h1>
      <p class="page-subtitle">Gli alimenti che usi più spesso, sempre a portata di mano.</p>
    </header>

    @if (favorites.loading() && favorites.favorites().length === 0) {
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        @for (i of [1, 2, 3]; track i) {
          <div class="card h-40 animate-pulse bg-stone-100 dark:bg-white/[0.03]"></div>
        }
      </div>
    } @else {
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        @for (food of favorites.favorites(); track food.id) {
          <app-food-card [food]="food" [perPortion]="true" (addToMeal)="addToMeal($event)" />
        } @empty {
          <div class="card col-span-full flex flex-col items-center gap-2 p-10 text-center">
            <app-icon name="star" [size]="32" class="text-amber-400" />
            <p class="font-medium">Ancora nessun preferito</p>
            <p class="text-sm text-stone-500 dark:text-stone-400">Tocca la stella su un alimento per salvarlo qui.</p>
            <a routerLink="/" class="btn-primary mt-3">Cerca alimenti</a>
          </div>
        }
      </div>
    }
  `,
})
export class FavoritesPage {
  protected readonly favorites = inject(FavoritesService);
  private readonly meal = inject(MealService);
  private readonly toast = inject(ToastService);

  protected addToMeal(food: Food): void {
    this.meal.add(food);
    this.toast.success(`${food.name_it} aggiunto al pasto`);
  }
}
