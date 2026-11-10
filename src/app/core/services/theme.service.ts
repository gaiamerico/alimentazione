import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';

export type ThemeMode = 'chiaro' | 'scuro' | 'sistema';

const STORAGE_KEY = 'tema';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(readMode());
  private readonly systemDark = signal(matchMedia('(prefers-color-scheme: dark)').matches);

  constructor() {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => this.systemDark.set(e.matches);
    media.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => media.removeEventListener('change', onChange));

    effect(() => {
      const mode = this.mode();
      const dark = mode === 'scuro' || (mode === 'sistema' && this.systemDark());
      document.documentElement.classList.toggle('dark', dark);
      try {
        if (mode === 'sistema') localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        /* ignore */
      }
    });
  }

  isDark(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  /** Ciclo: sistema → chiaro → scuro → sistema. */
  cycle(): void {
    const order: ThemeMode[] = ['sistema', 'chiaro', 'scuro'];
    this.mode.update((m) => order[(order.indexOf(m) + 1) % order.length]);
  }
}

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'chiaro' || v === 'scuro' ? v : 'sistema';
  } catch {
    return 'sistema';
  }
}
