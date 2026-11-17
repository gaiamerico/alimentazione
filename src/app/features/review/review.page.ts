import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Candidate, REVIEW_FIELDS, ReviewService } from '../../core/services/review.service';
import { ToastService } from '../../core/services/toast.service';
import { Icon } from '../../shared/components/icon';

@Component({
  selector: 'app-review-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    <header class="mb-6">
      <h1 class="page-title">Verifica proposte</h1>
      <p class="page-subtitle">
        Valori trovati online dall'assistente. Controlla le fonti: entrano nel catalogo solo se li approvi.
      </p>
    </header>

    @if (review.loading() && review.candidates().length === 0) {
      <div class="card h-40 animate-pulse bg-stone-100 dark:bg-white/[0.03]"></div>
    } @else if (review.error()) {
      <div class="card flex items-center gap-2 p-4 text-sm text-red-700 dark:text-red-300" role="alert">
        <app-icon name="alert" [size]="18" /> {{ review.error() }}
        <button type="button" class="btn-ghost ml-auto" (click)="review.load()">Riprova</button>
      </div>
    } @else {
      <div class="grid gap-4">
        @for (c of review.candidates(); track c.id) {
          <article class="card p-4 sm:p-5">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 class="text-lg font-semibold">{{ c.name_it ?? c.query }}</h2>
              <span class="text-sm text-stone-500 dark:text-stone-400">{{ c.category }} · proposta n. {{ c.id }}</span>
            </div>
            <p class="mt-1 text-sm text-stone-600 dark:text-stone-300">
              @if (c.target) {
                Completa i dati mancanti di
                <a class="underline" [routerLink]="['/alimento', c.target.id]">{{ c.target.name_it }}</a>:
                i valori già presenti non cambiano.
              } @else {
                Nuovo alimento cercato come «{{ c.query }}».
              }
            </p>

            <table class="mt-4 w-full text-sm">
              <thead>
                <tr class="text-left text-xs text-stone-500 dark:text-stone-400">
                  <th class="py-1 font-medium">per 100 g</th>
                  @if (c.target) { <th class="py-1 text-right font-medium">in catalogo</th> }
                  <th class="py-1 text-right font-medium">proposta</th>
                </tr>
              </thead>
              <tbody>
                @for (f of fields; track f.key) {
                  @if (c[f.key] !== null || (c.target && c.target[f.key] !== null)) {
                    <tr class="border-t border-stone-100 dark:border-white/[0.06]">
                      <td class="py-1.5">{{ f.label }}</td>
                      @if (c.target) {
                        <td class="py-1.5 text-right tabular-nums text-stone-500">{{ fmt(c.target[f.key], f.unit) }}</td>
                      }
                      <td class="py-1.5 text-right font-medium tabular-nums"
                          [class.text-stone-400]="c.target && c.target[f.key] !== null">
                        {{ fmt(c[f.key], f.unit) }}
                        @if (f.key === 'oxalate_mg' && c.oxalate_min_mg !== null && c.oxalate_max_mg !== null) {
                          <span class="block text-xs font-normal text-stone-500">fonti: {{ c.oxalate_min_mg }}–{{ c.oxalate_max_mg }} mg</span>
                        }
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
            @if (c.target) {
              <p class="mt-1 text-xs text-stone-500">In grigio i valori proposti che non verranno usati perché il dato c'è già.</p>
            }

            <dl class="mt-4 grid gap-1 text-sm sm:grid-cols-2">
              @if (c.oxalate_mg !== null) {
                <div><dt class="inline text-stone-500">Ossalati:</dt> <dd class="inline">{{ c.oxalate_basis }}, affidabilità {{ c.oxalate_confidence }}</dd></div>
              }
              @if (c.portion_label) {
                <div><dt class="inline text-stone-500">Porzione:</dt> <dd class="inline">{{ c.portion_label }} ({{ c.default_portion_g }} g)</dd></div>
              }
              @if (c.nutrient_source) {
                <div><dt class="inline text-stone-500">Fonte nutrienti:</dt> <dd class="inline">{{ c.nutrient_source }}</dd></div>
              }
              @if (c.oxalate_source) {
                <div><dt class="inline text-stone-500">Fonte ossalati:</dt> <dd class="inline">{{ c.oxalate_source }}</dd></div>
              }
            </dl>

            @if (c.sources.length) {
              <h3 class="mt-4 text-sm font-semibold">Fonti consultate</h3>
              <ul class="mt-1 grid gap-1 text-sm">
                @for (s of c.sources; track $index) {
                  <li>
                    @if (isHttp(s.url)) {
                      <a class="underline break-all" [href]="s.url" target="_blank" rel="noopener noreferrer">{{ s.title || s.url }}</a>
                    } @else {
                      {{ s.title }}
                    }
                    @if (s.used_for || s.reported_value) {
                      <span class="text-stone-500"> — {{ s.used_for }}{{ s.reported_value ? ': ' + s.reported_value : '' }}</span>
                    }
                  </li>
                }
              </ul>
            }

            @if (c.agent_notes) {
              <details class="mt-3 text-sm">
                <summary class="cursor-pointer text-stone-600 dark:text-stone-300">Ragionamento dell'assistente</summary>
                <p class="mt-2 whitespace-pre-line text-stone-600 dark:text-stone-300">{{ c.agent_notes }}</p>
              </details>
            }

            <div class="mt-4 flex flex-wrap items-center gap-2">
              <input
                type="text"
                maxlength="500"
                class="input min-w-0 flex-1"
                placeholder="Nota (facoltativa, es. motivo del rifiuto)"
                aria-label="Nota sulla decisione"
                [value]="notes()[c.id] ?? ''"
                (input)="setNote(c.id, $any($event.target).value)"
              />
              <button type="button" class="btn-ghost" [disabled]="busy() === c.id" (click)="decide(c, false)">
                <app-icon name="x" [size]="16" /> Rifiuta
              </button>
              <button type="button" class="btn-primary" [disabled]="busy() === c.id" (click)="decide(c, true)">
                <app-icon name="check" [size]="16" /> Approva
              </button>
            </div>
          </article>
        } @empty {
          <div class="card flex flex-col items-center gap-2 p-10 text-center">
            <app-icon name="check" [size]="32" class="text-brand-600" />
            <p class="font-medium">Nessuna proposta da verificare</p>
            <p class="text-sm text-stone-500 dark:text-stone-400">Quando l'assistente trova un alimento o dei dati mancanti, compaiono qui.</p>
          </div>
        }
      </div>
    }
  `,
})
export class ReviewPage implements OnInit {
  protected readonly review = inject(ReviewService);
  private readonly toast = inject(ToastService);

  protected readonly fields = REVIEW_FIELDS;
  protected readonly notes = signal<Record<number, string>>({});
  protected readonly busy = signal<number | null>(null);

  ngOnInit(): void {
    void this.review.load();
  }

  protected fmt(value: number | null, unit: string): string {
    return value === null ? '—' : `${value.toLocaleString('it-IT')} ${unit}`;
  }

  protected isHttp(url: string | undefined): boolean {
    return !!url && /^https?:\/\//i.test(url);
  }

  protected setNote(id: number, value: string): void {
    this.notes.update((n) => ({ ...n, [id]: value }));
  }

  protected async decide(c: Candidate, approve: boolean): Promise<void> {
    this.busy.set(c.id);
    try {
      await this.review.decide(c.id, approve, this.notes()[c.id] ?? '');
      const name = c.name_it ?? c.query;
      if (approve) this.toast.success(`${name}: dati pubblicati nel catalogo`);
      else this.toast.info(`${name}: proposta rifiutata`);
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Operazione non riuscita');
    } finally {
      this.busy.set(null);
    }
  }
}
