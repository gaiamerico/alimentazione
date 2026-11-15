import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PackagedProduct } from '../../core/models/food.model';
import { BarcodeService } from '../../core/services/barcode.service';
import { FoodService } from '../../core/services/food.service';
import { MISSING_VALUE_LABEL } from '../../core/utils/nutrition';
import { findOxalateIngredients, normalizeBarcode } from '../../core/utils/packaged';
import { Icon } from '../../shared/components/icon';

interface Row {
  label: string;
  value: number | null;
  unit: string;
  digits: string;
  sub: boolean;
}

/**
 * Scheda di un prodotto confezionato letto dal codice a barre (sola consultazione).
 * Il prodotto non si aggiunge a pasto e diario: l'etichetta non riporta gli ossalati
 * e i totali sarebbero incompleti.
 */
@Component({
  selector: 'app-product-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, RouterLink, Icon],
  template: `
    <a routerLink="/scansiona" class="btn-ghost -ml-3 mb-3 px-3 py-1.5 text-sm"><app-icon name="arrow-left" [size]="16" /> Scansiona un altro prodotto</a>

    @if (loading()) {
      <div class="card h-64 animate-pulse bg-stone-100 dark:bg-white/[0.03]" aria-busy="true"></div>
    } @else if (error(); as message) {
      <div class="card flex flex-col items-center gap-3 p-10 text-center">
        <app-icon name="alert" [size]="32" class="text-rose-600" />
        <p class="font-medium">{{ message }}</p>
        <div class="flex flex-wrap justify-center gap-2">
          <button type="button" class="btn-primary" (click)="load()">Riprova</button>
          <a routerLink="/" class="btn-outline">Cerca per nome</a>
        </div>
      </div>
    } @else if (product(); as p) {
      @if (!p.found) {
        <div class="card flex flex-col items-center gap-3 p-10 text-center">
          <app-icon name="barcode" [size]="32" class="text-stone-400" />
          <p class="font-medium">Prodotto non trovato</p>
          <p class="max-w-md text-sm text-stone-500 dark:text-stone-400">
            Il codice <span class="tabular-nums">{{ p.barcode }}</span> non è nella banca dati di Open Food Facts. Puoi cercare
            per nome il prodotto o i suoi ingredienti principali.
          </p>
          <div class="flex flex-wrap justify-center gap-2">
            <a routerLink="/" class="btn-primary"><app-icon name="search" [size]="18" /> Cerca per nome</a>
            <a routerLink="/scansiona" class="btn-outline">Scansiona di nuovo</a>
          </div>
        </div>
      } @else {
        <header>
          <p class="text-sm font-medium text-brand-700 dark:text-brand-200">Prodotto confezionato{{ p.brand ? ' · ' + p.brand : '' }}</p>
          <h1 class="page-title">{{ p.name ?? 'Prodotto senza nome' }}</h1>
          <p class="page-subtitle tabular-nums">
            @if (p.quantity) { {{ p.quantity }} · }
            codice {{ p.barcode }}
          </p>
        </header>

        <div class="mt-6 grid gap-5 lg:grid-cols-[1fr_380px]">
          <div class="space-y-5">
            <section class="card overflow-hidden">
              <header class="flex items-center justify-between border-b border-stone-200 px-5 py-3 dark:border-white/[0.06]">
                <h2 class="font-semibold">Valori dell'etichetta</h2>
                <span class="text-sm text-stone-500 dark:text-stone-400">per 100 g o 100 ml</span>
              </header>
              <table class="w-full text-sm">
                <tbody class="divide-y divide-stone-100 dark:divide-white/[0.05]">
                  <tr class="bg-stone-50/60 dark:bg-white/[0.02]">
                    <th scope="row" class="px-5 py-3 text-left font-medium">Ossalati</th>
                    <td class="px-5 py-3 text-right text-stone-400 italic dark:text-stone-500">{{ missingLabel }}</td>
                  </tr>
                  @for (row of rows(); track row.label) {
                    <tr>
                      <th scope="row" class="px-5 py-3 text-left font-normal text-stone-600 dark:text-stone-300" [class.pl-9]="row.sub">{{ row.label }}</th>
                      @if (row.value === null) {
                        <td class="px-5 py-3 text-right text-stone-400 italic dark:text-stone-500">{{ missingLabel }}</td>
                      } @else {
                        <td class="px-5 py-3 text-right font-semibold tabular-nums">{{ row.value | number: row.digits }} {{ row.unit }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </section>

            <section class="card p-5">
              <h2 class="font-semibold">Ingredienti</h2>
              @if (p.ingredients) {
                <p class="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">{{ p.ingredients }}</p>
              } @else {
                <p class="mt-2 text-sm text-stone-400 italic dark:text-stone-500">{{ missingLabel }}</p>
              }
            </section>
          </div>

          <aside class="space-y-5">
            <section class="card overflow-hidden" aria-label="Ossalati del prodotto">
              <header class="flex items-start gap-3 p-5" [class]="oxalateTheme().header">
                <span class="grid size-10 shrink-0 place-items-center rounded-xl" [class]="oxalateTheme().iconBox">
                  <app-icon [name]="flagged().length > 0 ? 'alert' : 'info'" [size]="22" />
                </span>
                <div class="min-w-0">
                  <p class="text-xs font-medium tracking-wide uppercase opacity-70">Ossalati</p>
                  <h2 class="text-lg font-semibold">Valore non disponibile</h2>
                  <p class="mt-1 text-sm opacity-90">Le etichette non riportano gli ossalati: per questo prodotto non esiste un numero.</p>
                </div>
              </header>
              <div class="space-y-3 p-5 text-sm">
                @if (!p.ingredients) {
                  <p class="text-stone-500 dark:text-stone-400">L'elenco degli ingredienti non è disponibile, quindi non è possibile riconoscere quelli ricchi di ossalati.</p>
                } @else if (flagged().length === 0) {
                  <p class="text-stone-600 dark:text-stone-300">
                    Tra gli ingredienti non ne abbiamo riconosciuti di ricchi di ossalati. Il confronto riguarda solo gli alimenti
                    presenti nel catalogo: non è una garanzia che il prodotto ne sia privo.
                  </p>
                } @else {
                  <p class="font-medium">Contiene ingredienti che nel catalogo risultano ricchi di ossalati:</p>
                  <ul class="flex flex-wrap gap-2">
                    @for (i of flagged(); track i.label) {
                      <li>
                        <a
                          [routerLink]="['/']"
                          [queryParams]="{ q: i.label }"
                          class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium"
                          [class]="i.level === 'alto' ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'"
                        >
                          <span class="size-2 rounded-full" [class]="i.level === 'alto' ? 'bg-rose-500' : 'bg-amber-500'"></span>
                          {{ i.label }} <span class="font-normal opacity-80">· {{ i.level }}</span>
                        </a>
                      </li>
                    }
                  </ul>
                  <p class="text-stone-600 dark:text-stone-300">
                    La quantità di questi ingredienti nel prodotto non è nota: non è possibile stimare gli ossalati di una porzione.
                    Il livello indicato è quello dell'ingrediente per 100 g nel catalogo.
                  </p>
                }
              </div>
            </section>

            <section class="card p-5 text-sm text-stone-600 dark:text-stone-300">
              <h2 class="font-semibold text-stone-900 dark:text-white">Solo consultazione</h2>
              <p class="mt-2">
                I prodotti confezionati non si aggiungono a pasto e diario: senza il valore di ossalato i totali e il bilancio
                calcio-ossalati sarebbero incompleti. Per il bilancio usa gli alimenti del
                <a routerLink="/" class="underline">catalogo</a>.
              </p>
            </section>
          </aside>
        </div>

        <footer class="mt-5 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
          <p>
            <strong>Fonte:</strong>
            @if (p.source_url) {
              <a [href]="p.source_url" target="_blank" rel="noopener" class="underline">Open Food Facts</a>
            } @else {
              Open Food Facts
            }
            · dati compilati dalla comunità, disponibili con licenza
            <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener" class="underline">Open Database License (ODbL)</a>
            · letti il {{ p.fetched_at | date: 'd MMMM y' }}.
          </p>
          <p class="mt-1">
            Possono essere incompleti o contenere errori: fa fede l'etichetta della confezione. Strumento informativo:
            <a routerLink="/avvertenze" class="underline">leggi le avvertenze</a>.
          </p>
        </footer>
      }
    }
  `,
})
export class ProductPage {
  private readonly barcodes = inject(BarcodeService);
  private readonly foods = inject(FoodService);

  /** Parametro di rotta `:barcode` (withComponentInputBinding). */
  readonly barcode = input.required<string>();

  protected readonly missingLabel = MISSING_VALUE_LABEL;
  protected readonly product = signal<PackagedProduct | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** Ingredienti riconosciuti che nel catalogo hanno ossalati alti o moderati. */
  protected readonly flagged = computed(() => findOxalateIngredients(this.product()?.ingredients ?? null, this.foods.catalog()));

  protected readonly oxalateTheme = computed(() =>
    this.flagged().length > 0
      ? { header: 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200', iconBox: 'bg-amber-500 text-white' }
      : { header: 'bg-stone-100 text-stone-900 dark:bg-white/[0.04] dark:text-stone-100', iconBox: 'bg-stone-500 text-white' },
  );

  protected readonly rows = computed((): Row[] => {
    const p = this.product();
    if (!p) return [];
    return [
      { label: 'Energia', value: p.kcal, unit: 'kcal', digits: '1.0-0', sub: false },
      { label: 'Proteine', value: p.protein_g, unit: 'g', digits: '1.1-1', sub: false },
      { label: 'Carboidrati', value: p.carbs_g, unit: 'g', digits: '1.1-1', sub: false },
      { label: 'di cui zuccheri', value: p.sugars_g, unit: 'g', digits: '1.1-1', sub: true },
      { label: 'Fibre', value: p.fiber_g, unit: 'g', digits: '1.1-1', sub: false },
      { label: 'Grassi', value: p.fat_g, unit: 'g', digits: '1.1-1', sub: false },
      { label: 'di cui saturi', value: p.saturated_fat_g, unit: 'g', digits: '1.1-1', sub: true },
      { label: 'Calcio', value: p.calcium_mg, unit: 'mg', digits: '1.0-0', sub: false },
      { label: 'Colesterolo', value: p.cholesterol_mg, unit: 'mg', digits: '1.0-0', sub: false },
      { label: 'Sodio', value: p.sodium_mg, unit: 'mg', digits: '1.0-0', sub: false },
    ];
  });

  constructor() {
    effect(() => {
      this.barcode();
      void this.load();
    });
    void this.foods.loadCatalog();
  }

  protected async load(): Promise<void> {
    const requested = this.barcode();
    this.loading.set(true);
    this.error.set(null);
    this.product.set(null);
    const code = normalizeBarcode(requested);
    try {
      if (!code) throw new Error('Codice a barre non valido: controlla le cifre.');
      const product = await this.barcodes.lookup(code);
      if (requested === this.barcode()) this.product.set(product);
    } catch (e) {
      if (requested === this.barcode()) this.error.set(e instanceof Error ? e.message : 'Errore imprevisto.');
    } finally {
      if (requested === this.barcode()) this.loading.set(false);
    }
  }
}
