import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CalciumOxalateBalance, calciumSuggestions } from '../../core/utils/nutrition';
import { Icon, IconName } from './icon';

/** Pannello "Bilancio Calcio vs Ossalati" con feedback visivo immediato. */
@Component({
  selector: 'app-balance-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, Icon],
  template: `
    @let b = balance();
    <section class="card overflow-hidden" [attr.aria-label]="'Bilancio calcio e ossalati: ' + b.title">
      <header class="flex items-start gap-3 p-5" [class]="theme().header">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl" [class]="theme().iconBox">
          <app-icon [name]="theme().icon" [size]="22" />
        </span>
        <div class="min-w-0">
          <p class="text-xs font-medium tracking-wide uppercase opacity-70">{{ heading() }}</p>
          <h3 class="text-lg font-semibold">{{ b.title }}</h3>
          <p class="mt-1 text-sm opacity-90">{{ b.message }}</p>
        </div>
      </header>

      <div class="space-y-5 p-5">
        <!-- Barra: calcio presente rispetto al calcio consigliato (rapporto molare 2:1) -->
        <div>
          <div class="mb-2 flex items-baseline justify-between text-sm">
            <span class="font-medium">Calcio disponibile per legare gli ossalati</span>
            <span class="tabular-nums text-stone-500 dark:text-stone-400">
              {{ b.calcium_mg | number: '1.0-0' }} / {{ b.calciumRecommended_mg | number: '1.0-0' }} mg
            </span>
          </div>
          <div class="relative h-3 rounded-full bg-stone-200 dark:bg-white/10">
            <div class="h-full rounded-full transition-[width] duration-500" [class]="theme().bar" [style.width.%]="fill()"></div>
            @if (b.oxalate_mg >= 10) {
              <span class="absolute inset-y-[-3px] left-1/2 w-0.5 rounded bg-stone-500/70 dark:bg-stone-300/60" title="Soglia 1:1"></span>
            }
          </div>
          <div class="mt-1.5 flex justify-between text-[11px] text-stone-500 dark:text-stone-400">
            <span>0</span>
            <span>1:1 legame teorico</span>
            <span>2:1 consigliato</span>
          </div>
        </div>

        <dl class="grid grid-cols-2 gap-3">
          <div class="rounded-xl bg-stone-50 p-3 dark:bg-white/[0.03]">
            <dt class="text-xs text-stone-500 dark:text-stone-400">Calcio</dt>
            <dd class="text-lg font-semibold whitespace-nowrap tabular-nums">{{ b.calcium_mg | number: '1.0-0' }} <span class="text-xs font-normal">mg</span></dd>
          </div>
          <div class="rounded-xl bg-stone-50 p-3 dark:bg-white/[0.03]">
            <dt class="text-xs text-stone-500 dark:text-stone-400">Ossalati</dt>
            <dd class="text-lg font-semibold whitespace-nowrap tabular-nums">{{ b.oxalate_mg | number: '1.0-0' }} <span class="text-xs font-normal">mg</span></dd>
          </div>
          <div class="rounded-xl bg-stone-50 p-3 dark:bg-white/[0.03]">
            <dt class="text-xs text-stone-500 dark:text-stone-400">Rapporto molare Ca:Ox</dt>
            <dd class="text-lg font-semibold whitespace-nowrap tabular-nums">
              @if (b.molarRatio === null) { — } @else { {{ b.molarRatio | number: '1.1-1' }} : 1 }
            </dd>
          </div>
          <div class="rounded-xl bg-stone-50 p-3 dark:bg-white/[0.03]">
            <dt class="text-xs text-stone-500 dark:text-stone-400">Ossalati legabili</dt>
            <dd class="text-lg font-semibold whitespace-nowrap tabular-nums">{{ b.boundPercent | number: '1.0-0' }}%</dd>
          </div>
        </dl>

        @if (suggestions().length > 0) {
          <div class="rounded-xl border border-dashed border-stone-300 p-4 dark:border-white/15">
            <p class="text-sm font-medium">
              Per un margine sicuro mancano circa <strong class="tabular-nums">{{ b.calciumMissing_mg | number: '1.0-0' }} mg</strong> di calcio. Ad esempio:
            </p>
            <ul class="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
              @for (s of suggestions(); track s.label) {
                <li class="flex justify-between gap-2 rounded-lg bg-stone-50 px-3 py-1.5 dark:bg-white/[0.03]">
                  <span>{{ s.label }}</span><span class="font-semibold tabular-nums">{{ s.amount }}</span>
                </li>
              }
            </ul>
          </div>
        }

        @if (b.oxalate_mg >= 100) {
          <p class="flex gap-2 text-xs text-stone-500 dark:text-stone-400">
            <app-icon name="info" [size]="16" />
            Carico di ossalati elevato: anche con calcio sufficiente, valuta porzioni più piccole o cotture in acqua (bollitura e scolatura).
          </p>
        }
      </div>
    </section>
  `,
})
export class BalancePanel {
  readonly balance = input.required<CalciumOxalateBalance>();
  readonly heading = input('Bilancio Calcio vs Ossalati');

  protected readonly fill = computed(() => {
    const b = this.balance();
    if (b.calciumRecommended_mg <= 0) return b.calcium_mg > 0 ? 100 : 0;
    return Math.min(100, (b.calcium_mg / b.calciumRecommended_mg) * 100);
  });

  protected readonly suggestions = computed(() => {
    const b = this.balance();
    return b.status === 'insufficiente' || b.status === 'sufficiente' ? calciumSuggestions(b.calciumMissing_mg) : [];
  });

  protected readonly theme = computed((): { header: string; iconBox: string; bar: string; icon: IconName } => {
    switch (this.balance().status) {
      case 'trascurabile':
      case 'ottimo':
        return {
          header: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200',
          iconBox: 'bg-emerald-600 text-white',
          bar: 'bg-emerald-500',
          icon: 'check',
        };
      case 'sufficiente':
        return {
          header: 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200',
          iconBox: 'bg-amber-500 text-white',
          bar: 'bg-amber-500',
          icon: 'info',
        };
      default:
        return {
          header: 'bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-200',
          iconBox: 'bg-rose-600 text-white',
          bar: 'bg-rose-500',
          icon: 'alert',
        };
    }
  });
}
