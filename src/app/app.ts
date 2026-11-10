import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { ThemeService } from './core/services/theme.service';
import { ToastService } from './core/services/toast.service';
import { Shell } from './layout/shell';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Shell],
  template: `<app-shell />`,
})
export class App {
  constructor() {
    inject(ThemeService); // applica il tema all'avvio

    // Aggiornamento PWA: la nuova versione viene applicata alla prossima apertura dell'app.
    const updates = inject(SwUpdate);
    const toast = inject(ToastService);
    if (updates.isEnabled) {
      updates.versionUpdates.subscribe((event) => {
        if (event.type === 'VERSION_READY') {
          toast.info('Nuova versione disponibile: verrà applicata alla prossima apertura.');
        }
      });
    }
  }
}
