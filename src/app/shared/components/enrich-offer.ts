import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Food } from '../../core/models/food.model';
import { AuthService } from '../../core/services/auth.service';
import { FoodRequest, FoodRequestService } from '../../core/services/food-request.service';
import { NetworkService } from '../../core/services/network.service';
import { missingData } from '../../core/utils/nutrition';
import { Icon } from './icon';

type View = 'offerta' | 'accedi' | 'non_disponibile' | 'in_ricerca' | 'gia_in_corso' | 'da_verificare' | 'aggiornato' | 'non_trovato' | 'errore';

/**
 * Per un alimento del catalogo con dati mancanti: dice che cosa manca e propone la
 * ricerca online per completarlo. I valori trovati non entrano subito nel catalogo:
 * restano in attesa di verifica, come le proposte di alimenti nuovi.
 * Non mostra nulla se l'alimento è completo.
 */
@Component({
  selector: 'app-enrich-offer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    @if (missing().any) {
      <div
        class="flex flex-col gap-2 rounded-xl border border-dashed border-stone-300 text-stone-600 dark:border-white/15 dark:text-stone-300"
        [class]="compact() ? 'px-3 py-2 text-xs' : 'p-4 text-sm'"
        aria-live="polite"
      >
        @switch (view()) {
          @case ('in_ricerca') {
            <p class="flex items-center gap-2 font-medium text-stone-700 dark:text-stone-200">
              <span class="size-3.5 shrink-0 animate-spin rounded-full border-2 border-brand-600 border-t-transparent"></span>
              Sto cercando i dati mancanti nelle fonti…
            </p>
            @if (!compact()) {
              <p>Può richiedere un paio di minuti. Puoi restare su questa pagina.</p>
            }
          }
          @case ('gia_in_corso') {
            <p>La ricerca dei dati mancanti è già in corso. Riprova tra un paio di minuti.</p>
          }
          @case ('da_verificare') {
            <p class="flex items-start gap-2 font-medium text-stone-700 dark:text-stone-200">
              <app-icon name="check" [size]="16" class="mt-0.5 shrink-0 text-emerald-600" />
              Dati trovati: compariranno qui dopo la verifica dei valori.
            </p>
          }
          @case ('aggiornato') {
            <p class="flex items-start gap-2 font-medium text-stone-700 dark:text-stone-200">
              <app-icon name="check" [size]="16" class="mt-0.5 shrink-0 text-emerald-600" />
              I dati sono stati verificati e aggiunti: ricarica la pagina per vederli.
            </p>
          }
          @case ('non_trovato') {
            <p class="font-medium text-stone-700 dark:text-stone-200">Nessun dato affidabile trovato</p>
            <p>{{ request()?.agent_notes || 'Le fonti consultate non riportano valori verificabili per questo alimento.' }}</p>
          }
          @case ('errore') {
            <p class="flex items-start gap-2 text-rose-600 dark:text-rose-400">
              <app-icon name="alert" [size]="16" class="mt-0.5 shrink-0" /> {{ error() || 'L’assistente non è riuscito a completare la ricerca.' }}
            </p>
            <button type="button" class="btn-outline self-start px-3 py-1.5 text-xs" (click)="ask()">Riprova</button>
          }
          @default {
            <p>{{ missingText() }}</p>
            @if (view() === 'offerta') {
              <button type="button" class="btn-outline self-start px-3 py-1.5 text-xs" (click)="ask()">
                <app-icon name="sparkles" [size]="16" /> Completa i dati online
              </button>
            } @else if (view() === 'accedi') {
              <a class="btn-outline self-start px-3 py-1.5 text-xs" routerLink="/accedi" [queryParams]="{ ritorno: returnUrl() }">
                <app-icon name="user" [size]="16" /> Accedi per completarli online
              </a>
            }
          }
        }
      </div>
    }
  `,
})
export class EnrichOffer {
  private readonly auth = inject(AuthService);
  private readonly network = inject(NetworkService);
  private readonly foodRequests = inject(FoodRequestService);
  private readonly router = inject(Router);

  readonly food = input.required<Food>();
  /** Versione ridotta per le schede dei risultati di ricerca. */
  readonly compact = input(false);

  protected readonly missing = computed(() => missingData(this.food()));
  protected readonly request = signal<FoodRequest | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private destroyed = false;
  /** Cambia a ogni nuova richiesta: le risposte delle precedenti vengono ignorate. */
  private token = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    // Il componente può essere riusato per un altro alimento (cambio di scheda): lo stato riparte da zero.
    effect(() => {
      this.food().id;
      untracked(() => {
        this.token++;
        this.request.set(null);
        this.error.set(null);
        this.busy.set(false);
      });
    });
  }

  protected readonly missingText = computed(() => {
    const m = this.missing();
    const hasServing = !!this.food().harvard;
    const oxalate = hasServing ? 'l’ossalato per 100 g (c’è solo il dato per porzione della lista Harvard)' : 'l’ossalato per 100 g';
    if (m.oxalate && m.nutrients) return `Dati incompleti: mancano ${oxalate} e i valori nutrizionali.`;
    if (m.oxalate) return `Dati incompleti: manca ${oxalate}.`;
    return 'Dati incompleti: mancano alcuni valori nutrizionali.';
  });

  protected readonly view = computed((): View => {
    if (this.error()) return 'errore';
    if (this.busy()) return 'in_ricerca';
    const request = this.request();
    if (!request) {
      if (!this.auth.isAvailable || !this.network.online()) return 'non_disponibile';
      return this.auth.isLoggedIn() ? 'offerta' : 'accedi';
    }
    switch (request.status) {
      case 'in_ricerca':
        return 'gia_in_corso';
      case 'da_verificare':
        return 'da_verificare';
      case 'approvato':
        return 'aggiornato';
      case 'errore':
        return 'errore';
      default:
        return 'non_trovato';
    }
  });

  protected returnUrl(): string {
    return this.router.url;
  }

  /** Avvia la ricerca online dei dati mancanti e ne segue lo stato. */
  protected async ask(): Promise<void> {
    const token = ++this.token;
    const isStale = () => this.destroyed || token !== this.token;
    this.error.set(null);
    this.request.set(null);
    this.busy.set(true);
    try {
      const request = await this.foodRequests.requestEnrichment(this.food().id);
      if (isStale()) return;
      this.request.set(request);
      if (request.status === 'in_ricerca' && request.id !== null) {
        const result = await this.foodRequests.waitForResult(request.id, isStale);
        if (isStale()) return;
        if (result) this.request.set(result);
        else this.error.set('La ricerca sta richiedendo più del previsto. Riprova tra qualche minuto.');
      }
    } catch (e) {
      if (!isStale()) this.error.set(e instanceof Error ? e.message : 'Errore imprevisto.');
    } finally {
      if (!isStale()) this.busy.set(false);
    }
  }
}
