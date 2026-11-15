import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BARCODE_FORMATS, normalizeBarcode } from '../../core/utils/packaged';
import { Icon } from '../../shared/components/icon';

/** Quanto serve dell'API BarcodeDetector (nativa o della libreria di ripiego). */
interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
interface DetectorConstructor {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<readonly string[]>;
}

type ScanState =
  | 'idle' // fotocamera non ancora avviata
  | 'starting'
  | 'scanning'
  | 'denied' // permesso negato
  | 'no-camera'
  | 'unsupported' // browser senza accesso alla fotocamera (o pagina non HTTPS)
  | 'error';

const SCAN_INTERVAL_MS = 200;

/**
 * Scanner del codice a barre dei prodotti confezionati.
 * Usa l'API nativa `BarcodeDetector` dove esiste (Chrome su Android); altrove
 * (Safari/iOS, Firefox) carica solo al momento una libreria che decodifica in
 * WebAssembly. Se la fotocamera non è disponibile resta il campo per digitare il codice.
 */
@Component({
  selector: 'app-scan-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Icon],
  template: `
    <a routerLink="/" class="btn-ghost -ml-3 mb-3 px-3 py-1.5 text-sm"><app-icon name="arrow-left" [size]="16" /> Torna alla ricerca</a>

    <header class="mb-6">
      <h1 class="page-title">Scansiona un prodotto</h1>
      <p class="page-subtitle">Inquadra il codice a barre di un prodotto confezionato per vederne i valori dell'etichetta.</p>
    </header>

    <div class="grid max-w-3xl gap-5">
      <section class="card overflow-hidden">
        <div class="relative aspect-[4/3] bg-stone-900" [class.hidden]="state() !== 'scanning' && state() !== 'starting'">
          <video #video class="size-full object-cover" playsinline muted autoplay aria-label="Anteprima della fotocamera"></video>
          <div class="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80"></div>
          @if (state() === 'starting') {
            <p class="absolute inset-0 grid place-items-center text-sm text-white">Avvio della fotocamera…</p>
          }
        </div>

        <div class="p-5" aria-live="polite">
          @switch (state()) {
            @case ('idle') {
              <div class="flex flex-col items-center gap-3 py-6 text-center">
                <span class="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
                  <app-icon name="camera" [size]="24" />
                </span>
                <p class="max-w-sm text-sm text-stone-500 dark:text-stone-400">
                  La fotocamera serve solo a leggere il codice: le immagini restano sul dispositivo.
                </p>
                <button type="button" class="btn-primary" (click)="start()">
                  <app-icon name="barcode" [size]="18" /> Avvia la fotocamera
                </button>
              </div>
            }
            @case ('scanning') {
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm text-stone-600 dark:text-stone-300">Tieni il codice a barre dentro il riquadro, ben illuminato.</p>
                <button type="button" class="btn-outline shrink-0 px-3 py-1.5 text-sm" (click)="stop()">Ferma</button>
              </div>
            }
            @case ('denied') {
              <p class="flex gap-2 text-sm"><app-icon name="alert" class="text-amber-600" />
                Permesso alla fotocamera negato. Puoi concederlo dalle impostazioni del browser per questo sito, oppure digitare il codice qui sotto.
              </p>
              <button type="button" class="btn-outline mt-3" (click)="start()">Riprova</button>
            }
            @case ('no-camera') {
              <p class="flex gap-2 text-sm"><app-icon name="alert" class="text-amber-600" />
                Nessuna fotocamera trovata su questo dispositivo. Digita il codice qui sotto.
              </p>
            }
            @case ('unsupported') {
              <p class="flex gap-2 text-sm"><app-icon name="alert" class="text-amber-600" />
                Questo browser non permette di usare la fotocamera da questa pagina (serve una connessione HTTPS). Digita il codice qui sotto.
              </p>
            }
            @case ('error') {
              <p class="flex gap-2 text-sm"><app-icon name="alert" class="text-rose-600" />
                Non è stato possibile avviare lo scanner. Digita il codice qui sotto oppure riprova.
              </p>
              <button type="button" class="btn-outline mt-3" (click)="start()">Riprova</button>
            }
          }
        </div>
      </section>

      <section class="card p-5">
        <h2 class="font-semibold">Digita il codice</h2>
        <form class="mt-3 flex flex-wrap items-start gap-3" (submit)="$event.preventDefault(); submitManual()">
          <div class="min-w-0 flex-1">
            <label class="sr-only" for="barcode">Codice a barre</label>
            <input
              id="barcode"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              maxlength="20"
              placeholder="es. 8001234567890"
              class="input tabular-nums"
              [formControl]="manual"
              [attr.aria-invalid]="manualError() ? 'true' : null"
              aria-describedby="barcode-help"
            />
            <p id="barcode-help" class="mt-1.5 text-xs" [class]="manualError() ? 'text-rose-600' : 'text-stone-500 dark:text-stone-400'">
              {{ manualError() ?? 'Le cifre sotto le barre: 13 o 8 (EAN), 12 (UPC).' }}
            </p>
          </div>
          <button type="submit" class="btn-primary">Cerca</button>
        </form>
      </section>

      <p class="px-1 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
        I dati dei prodotti vengono da <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener" class="underline">Open Food Facts</a>
        (licenza ODbL). Le etichette non riportano gli ossalati: la scheda segnala solo gli ingredienti che nel catalogo ne sono ricchi.
      </p>
    </div>
  `,
})
export class ScanPage {
  private readonly router = inject(Router);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  protected readonly state = signal<ScanState>('idle');
  protected readonly manual = new FormControl('', { nonNullable: true });
  protected readonly manualError = signal<string | null>(null);

  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Cambia a ogni avvio/arresto: i cicli di lettura rimasti in sospeso si fermano. */
  private session = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected async start(): Promise<void> {
    this.stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      this.state.set('unsupported');
      return;
    }
    const session = ++this.session;
    this.state.set('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (session !== this.session) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const video = this.video().nativeElement;
      video.srcObject = stream;
      await video.play();
      const detector = await createDetector();
      if (session !== this.session) return;
      this.state.set('scanning');
      this.scan(detector, session);
    } catch (e) {
      if (session !== this.session) return;
      this.releaseCamera();
      const name = (e as { name?: string })?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') this.state.set('denied');
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') this.state.set('no-camera');
      else this.state.set('error');
    }
  }

  protected stop(): void {
    this.session++;
    this.releaseCamera();
    if (this.state() === 'scanning' || this.state() === 'starting') this.state.set('idle');
  }

  protected submitManual(): void {
    const code = normalizeBarcode(this.manual.value);
    if (!code) {
      this.manualError.set('Codice non valido: controlla le cifre (EAN-13, EAN-8, UPC-A o UPC-E).');
      return;
    }
    this.manualError.set(null);
    this.open(code);
  }

  private scan(detector: Detector, session: number): void {
    const tick = async () => {
      if (session !== this.session) return;
      try {
        const video = this.video().nativeElement;
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          for (const result of await detector.detect(video)) {
            // Solo codici con cifra di controllo corretta: scarta le letture sbagliate.
            const code = normalizeBarcode(result.rawValue);
            if (code && session === this.session) {
              this.open(code);
              return;
            }
          }
        }
      } catch {
        /* fotogramma non leggibile: si riprova al prossimo */
      }
      if (session === this.session) this.timer = setTimeout(tick, SCAN_INTERVAL_MS);
    };
    void tick();
  }

  private open(barcode: string): void {
    this.stop();
    void this.router.navigate(['/prodotto', barcode]);
  }

  private releaseCamera(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

/**
 * Lettore di codici a barre: nativo se il browser lo offre per i formati che
 * servono, altrimenti la libreria `barcode-detector` (ZXing in WebAssembly),
 * caricata solo qui, quando si apre lo scanner.
 */
async function createDetector(): Promise<Detector> {
  const formats = [...BARCODE_FORMATS];
  const native = (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  if (native) {
    try {
      const supported = await native.getSupportedFormats();
      if (formats.every((f) => supported.includes(f))) return new native({ formats });
    } catch {
      /* API presente ma non utilizzabile: si passa alla libreria */
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
  // Il file .wasm è servito dall'app (vedi angular.json), non da una CDN esterna.
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? `wasm/${path}` : prefix + path) },
  });
  return new BarcodeDetector({ formats }) as unknown as Detector;
}
