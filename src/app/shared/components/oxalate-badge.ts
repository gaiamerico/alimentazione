import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { OXALATE_LEVEL_LABEL, oxalateLevel } from '../../core/utils/nutrition';

const NEUTRAL = 'bg-stone-100 text-stone-600 ring-stone-500/20 dark:bg-white/5 dark:text-stone-300 dark:ring-white/15';

/**
 * Indicatore cromatico del rischio ossalati: verde < 25 mg, giallo 25–99 mg, rosso ≥ 100 mg.
 * mg null = dato non disponibile (indicatore neutro). estimated = valore ricavato a video
 * dalla porzione della lista Harvard: è preceduto da "≈" e segnalato nel suggerimento.
 */
@Component({
  selector: 'app-oxalate-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    @let value = mg();
    @if (value === null) {
      <span
        class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ring-1 ring-inset"
        [class]="neutral"
        title="Ossalati per 100 g: dato non disponibile"
      >
        <span class="size-2 rounded-full bg-stone-400"></span>
        ossalati n.d.
      </span>
    } @else {
      <span
        class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ring-1 ring-inset"
        [class]="tone()"
        [attr.title]="'Ossalati: ' + label() + ' (' + (estimated() ? 'circa ' : '') + (value | number: '1.0-0') + ' mg' + (estimated() ? ', stima dalla porzione della lista Harvard' : '') + ')'"
      >
        <span class="size-2 rounded-full" [class]="dot()"></span>
        @if (showValue()) {
          {{ estimated() ? '≈ ' : '' }}{{ value | number: '1.0-0' }} mg
        }
        @if (showLabel()) {
          <span class="font-medium opacity-80">{{ label() }}{{ estimated() ? ' · stima' : '' }}</span>
        }
      </span>
    }
  `,
})
export class OxalateBadge {
  readonly mg = input.required<number | null>();
  readonly estimated = input(false);
  readonly showValue = input(true);
  readonly showLabel = input(true);

  protected readonly neutral = NEUTRAL;
  protected readonly level = computed(() => oxalateLevel(this.mg() ?? 0));
  protected readonly label = computed(() => OXALATE_LEVEL_LABEL[this.level()]);
  protected readonly tone = computed(
    () =>
      ({
        basso: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25',
        moderato: 'bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25',
        alto: 'bg-rose-50 text-rose-800 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/25',
      })[this.level()],
  );
  protected readonly dot = computed(
    () => ({ basso: 'bg-emerald-500', moderato: 'bg-amber-500', alto: 'bg-rose-500' })[this.level()],
  );
}
