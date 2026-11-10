import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    title: 'Cerca alimenti · NutriOssalati',
    loadComponent: () => import('./features/search/search.page').then((m) => m.SearchPage),
  },
  {
    path: 'alimento/:id',
    title: 'Dettaglio alimento · NutriOssalati',
    loadComponent: () => import('./features/food-detail/food-detail.page').then((m) => m.FoodDetailPage),
  },
  {
    path: 'pasto',
    title: 'Bilancio pasto · NutriOssalati',
    loadComponent: () => import('./features/meal/meal.page').then((m) => m.MealPage),
  },
  {
    path: 'diario',
    title: 'Diario alimentare · NutriOssalati',
    canActivate: [authGuard],
    loadComponent: () => import('./features/diary/diary.page').then((m) => m.DiaryPage),
  },
  {
    path: 'preferiti',
    title: 'Preferiti · NutriOssalati',
    canActivate: [authGuard],
    loadComponent: () => import('./features/favorites/favorites.page').then((m) => m.FavoritesPage),
  },
  {
    path: 'accedi',
    title: 'Accedi · NutriOssalati',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  { path: '**', redirectTo: '' },
];
