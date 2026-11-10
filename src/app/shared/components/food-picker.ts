import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { Food } from '../../core/models/food.model';
import { FoodService } from '../../core/services/food.service';
import { Icon } from './icon';
import { OxalateBadge } from './oxalate-badge';

/** Campo di ricerca con suggerimenti per scegliere rapidamente un alimento. */
@Component({
  selector: 'app-food-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Icon, OxalateBadge],
  template: `
    <div class="relative">
      <label class="sr-only" [for]="inputId">{{ placeholder() }}</label>
      <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-400">
        <app-icon name="search" [size]="18" />
      </span>
      <input
        [id]="inputId"
        class="input pl-10"
        type="search"
        autocomplete="off"
        [placeholder]="placeholder()"
        [formControl]="query"
        (focus)="open.set(true)"
        (blur)="closeSoon()"
        (keydown.escape)="open.set(false)"
        (keydown.enter)="pickFirst($event)"
        role="combobox"
        [attr.aria-expanded]="open() && results().length > 0"
        [attr.aria-controls]="inputId + '-list'"
      />
      @if (open() && results().length > 0) {
        <ul
          [id]="inputId + '-list'"
          role="listbox"
          class="absolute z-30 mt-2 max-h-80 w-full overflow-auto rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xl shadow-stone-900/10 dark:border-white/10 dark:bg-[#132320]"
        >
          @for (food of results(); track food.id) {
            <li role="option" [attr.aria-selected]="false">
              <button
                type="button"
                class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-stone-100 dark:hover:bg-white/5"
                (mousedown)="$event.preventDefault()"
                (click)="pick(food)"
              >
                <span class="min-w-0">
                  <span class="block truncate font-medium">{{ food.name_it }}</span>
                  <span class="block text-xs text-stone-500 dark:text-stone-400">{{ food.category }}</span>
                </span>
                <app-oxalate-badge [mg]="food.oxalate_mg" [showLabel]="false" />
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class FoodPicker {
  private readonly foods = inject(FoodService);
  private static nextId = 0;

  readonly placeholder = input('Cerca un alimento da aggiungere…');
  readonly picked = output<Food>();

  protected readonly inputId = `food-picker-${FoodPicker.nextId++}`;
  protected readonly query = new FormControl('', { nonNullable: true });
  protected readonly results = signal<Food[]>([]);
  protected readonly open = signal(false);

  constructor() {
    this.query.valueChanges
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((q) =>
          q.trim().length < 2
            ? Promise.resolve([] as Food[])
            : this.foods.search({ query: q, lowOxalate: false, highCalcium: false, noCholesterol: false, category: null }, 8),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((list) => {
        this.results.set(list);
        this.open.set(true);
      });
  }

  protected pick(food: Food): void {
    this.picked.emit(food);
    this.query.setValue('');
    this.results.set([]);
    this.open.set(false);
  }

  protected pickFirst(event: Event): void {
    const first = this.results()[0];
    if (first) {
      event.preventDefault();
      this.pick(first);
    }
  }

  protected closeSoon(): void {
    setTimeout(() => this.open.set(false), 120);
  }
}
