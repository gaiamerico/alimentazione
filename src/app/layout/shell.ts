import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { MealService } from '../core/services/meal.service';
import { NetworkService } from '../core/services/network.service';
import { ThemeService } from '../core/services/theme.service';
import { ToastService } from '../core/services/toast.service';
import { Icon, IconName } from '../shared/components/icon';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  exact: boolean;
}

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  template: `
    <a href="#contenuto" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
      Vai al contenuto
    </a>

    <header class="sticky top-0 z-40 border-b border-stone-200/70 bg-stone-50/80 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#0c1412]/80" style="padding-top: env(safe-area-inset-top)">
      <div class="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <a routerLink="/" class="flex items-center gap-2.5 font-semibold tracking-tight">
          <img src="favicon.svg" alt="" class="size-8" width="32" height="32" />
          <span class="text-stone-900 dark:text-white">Nutri<span class="text-brand-700 dark:text-brand-200">Ossalati</span></span>
        </a>

        <nav class="ml-6 hidden items-center gap-1 md:flex" aria-label="Navigazione principale">
          @for (item of nav; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-white text-stone-900 shadow-sm dark:bg-white/10 dark:text-white"
              [routerLinkActiveOptions]="{ exact: item.exact }"
              class="relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-stone-600 transition hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"
            >
              <app-icon [name]="item.icon" [size]="18" />
              {{ item.label }}
              @if (item.path === '/pasto' && meal.count() > 0) {
                <span class="rounded-full bg-brand-600 px-1.5 text-[10px] leading-4 font-semibold text-white">{{ meal.count() }}</span>
              }
            </a>
          }
        </nav>

        <div class="ml-auto flex items-center gap-1">
          <button type="button" class="btn-ghost size-10 p-0" (click)="theme.cycle()" [attr.aria-label]="themeLabel()" [attr.title]="themeLabel()">
            <app-icon [name]="themeIcon()" />
          </button>
          @if (auth.isLoggedIn()) {
            <button type="button" class="btn-ghost size-10 p-0" (click)="logout()" aria-label="Esci" [attr.title]="'Esci (' + auth.user()?.email + ')'">
              <app-icon name="logout" />
            </button>
          } @else {
            <a routerLink="/accedi" class="btn-primary px-3.5 py-2">Accedi</a>
          }
        </div>
      </div>
    </header>

    @if (!network.online()) {
      <div class="bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200" role="status">
        <p class="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-sm sm:px-6">
          <app-icon name="wifi-off" [size]="16" /> Sei offline: la ricerca usa il catalogo salvato sul dispositivo.
        </p>
      </div>
    }

    <main id="contenuto" class="mx-auto max-w-6xl px-4 pt-6 pb-28 sm:px-6 md:pb-12">
      <router-outlet />
    </main>

    <footer class="mx-auto hidden max-w-6xl px-6 pb-8 text-xs text-stone-500 md:block dark:text-stone-500">
      Dati: USDA FoodData Central, CREA, Harvard T.H. Chan School of Public Health, Oxalate.org, OHF. Valori indicativi:
      non sostituiscono il parere medico.
    </footer>

    <!-- Navigazione mobile -->
    <nav
      class="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/90 backdrop-blur-xl md:hidden dark:border-white/[0.06] dark:bg-[#0c1412]/90"
      style="padding-bottom: env(safe-area-inset-bottom)"
      aria-label="Navigazione principale"
    >
      <div class="grid grid-cols-4">
        @for (item of nav; track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="text-brand-700! dark:text-brand-200!"
            [routerLinkActiveOptions]="{ exact: item.exact }"
            class="relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-stone-500 dark:text-stone-400"
          >
            <app-icon [name]="item.icon" [size]="22" />
            {{ item.label }}
            @if (item.path === '/pasto' && meal.count() > 0) {
              <span class="absolute top-1.5 left-1/2 ml-2 rounded-full bg-brand-600 px-1.5 text-[10px] leading-4 font-semibold text-white">{{ meal.count() }}</span>
            }
          </a>
        }
      </div>
    </nav>

    <!-- Notifiche -->
    <div class="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div
          class="pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg"
          [class]="t.kind === 'error' ? 'bg-rose-600 text-white' : t.kind === 'success' ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900' : 'bg-brand-700 text-white'"
          role="status"
        >
          <app-icon [name]="t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'check' : 'info'" [size]="18" />
          {{ t.message }}
          <button type="button" class="ml-1 opacity-70 hover:opacity-100" (click)="toast.dismiss(t.id)" aria-label="Chiudi notifica">
            <app-icon name="x" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly meal = inject(MealService);
  protected readonly network = inject(NetworkService);
  protected readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly nav: NavItem[] = [
    { path: '/', label: 'Cerca', icon: 'search', exact: true },
    { path: '/pasto', label: 'Pasto', icon: 'scale', exact: false },
    { path: '/diario', label: 'Diario', icon: 'book', exact: false },
    { path: '/preferiti', label: 'Preferiti', icon: 'star', exact: false },
  ];

  protected readonly themeIcon = computed<IconName>(() =>
    ({ sistema: 'monitor', chiaro: 'sun', scuro: 'moon' } as const)[this.theme.mode()],
  );
  protected readonly themeLabel = computed(
    () => `Tema: ${this.theme.mode()} (clicca per cambiare)`,
  );

  protected async logout(): Promise<void> {
    await this.auth.signOut();
    this.toast.info('Sei uscito dal tuo account');
    await this.router.navigateByUrl('/');
  }
}
