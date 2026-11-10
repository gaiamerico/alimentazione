import { DestroyRef, inject, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NetworkService {
  readonly online = signal(navigator.onLine);

  constructor() {
    const on = () => this.online.set(true);
    const off = () => this.online.set(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    });
  }
}
