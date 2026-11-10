import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, OAuthProvider } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { Icon } from '../../shared/components/icon';

type Mode = 'accedi' | 'registrati' | 'recupero' | 'nuova-password';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const pw = group.get('password')?.value;
  const confirm = group.get('confirm');
  if (!confirm || confirm.disabled) return null;
  return pw === confirm.value ? null : { mismatch: true };
}

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Icon],
  template: `
    <div class="mx-auto max-w-md">
      <div class="mb-6 text-center">
        <span class="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-700 text-white">
          <app-icon name="user" [size]="24" />
        </span>
        <h1 class="page-title mt-4">
          @switch (mode()) {
            @case ('accedi') { Bentornato }
            @case ('registrati') { Crea il tuo account }
            @case ('recupero') { Recupera la password }
            @case ('nuova-password') { Imposta una nuova password }
          }
        </h1>
        <p class="page-subtitle">Salva preferiti e diario alimentare, sincronizzati su tutti i dispositivi.</p>
      </div>

      @if (!auth.isAvailable) {
        <div class="card border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          Supabase non è configurato: imposta <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> per abilitare l'accesso.
        </div>
      }

      <div class="card p-6">
        @if (mode() === 'accedi' || mode() === 'registrati') {
          <div class="mb-5 grid grid-cols-2 rounded-xl bg-stone-100 p-1 text-sm font-medium dark:bg-white/5" role="tablist">
            <button type="button" role="tab" class="rounded-lg py-2 transition" [attr.aria-selected]="mode() === 'accedi'"
              [class]="mode() === 'accedi' ? 'bg-white shadow-sm dark:bg-white/10' : 'text-stone-500'" (click)="setMode('accedi')">Accedi</button>
            <button type="button" role="tab" class="rounded-lg py-2 transition" [attr.aria-selected]="mode() === 'registrati'"
              [class]="mode() === 'registrati' ? 'bg-white shadow-sm dark:bg-white/10' : 'text-stone-500'" (click)="setMode('registrati')">Registrati</button>
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4" novalidate>
          <div [hidden]="mode() === 'nuova-password'">
            <label class="label" for="email">Email</label>
            <input id="email" type="email" autocomplete="email" class="input" formControlName="email" placeholder="nome@esempio.it" />
            @if (form.controls.email.touched && form.controls.email.invalid) {
              <p class="mt-1 text-xs text-rose-600">Inserisci un indirizzo email valido.</p>
            }
          </div>

          @if (mode() !== 'recupero') {
            <div>
              <label class="label" for="password">Password</label>
              <input id="password" type="password" class="input" formControlName="password"
                [attr.autocomplete]="mode() === 'registrati' ? 'new-password' : 'current-password'" />
              @if (form.controls.password.touched && form.controls.password.invalid) {
                <p class="mt-1 text-xs text-rose-600">La password deve contenere almeno 8 caratteri.</p>
              }
            </div>
          }

          @if (mode() === 'registrati' || mode() === 'nuova-password') {
            <div>
              <label class="label" for="confirm">Conferma password</label>
              <input id="confirm" type="password" autocomplete="new-password" class="input" formControlName="confirm" />
              @if (form.controls.confirm.touched && form.hasError('mismatch')) {
                <p class="mt-1 text-xs text-rose-600">Le password non coincidono.</p>
              }
            </div>
          }

          @if (error()) {
            <p class="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" role="alert">{{ error() }}</p>
          }
          @if (info()) {
            <p class="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300" role="status">{{ info() }}</p>
          }

          <button type="submit" class="btn-primary w-full py-3" [disabled]="busy() || !auth.isAvailable">
            @switch (mode()) {
              @case ('accedi') { Accedi }
              @case ('registrati') { Crea account }
              @case ('recupero') { Invia link di recupero }
              @case ('nuova-password') { Salva nuova password }
            }
          </button>
        </form>

        @if (mode() === 'accedi') {
          <button type="button" class="mt-3 w-full text-center text-sm text-stone-500 hover:underline" (click)="setMode('recupero')">Password dimenticata?</button>
        }
        @if (mode() === 'recupero') {
          <button type="button" class="mt-3 w-full text-center text-sm text-stone-500 hover:underline" (click)="setMode('accedi')">Torna all'accesso</button>
        }

        @if (mode() === 'accedi' || mode() === 'registrati') {
          <div class="my-5 flex items-center gap-3 text-xs text-stone-400">
            <span class="h-px flex-1 bg-stone-200 dark:bg-white/10"></span> oppure <span class="h-px flex-1 bg-stone-200 dark:bg-white/10"></span>
          </div>
          <button type="button" class="btn-outline w-full py-3" [disabled]="busy() || !auth.isAvailable" (click)="oauth('google')">
            <app-icon name="google" [size]="18" /> Continua con Google
          </button>
        }
      </div>
    </div>
  `,
})
export class LoginPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** Query param `?ritorno=/percorso` per tornare alla pagina richiesta. */
  readonly ritorno = input<string>();

  protected readonly mode = signal<Mode>('accedi');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);

  protected readonly form = new FormGroup(
    {
      email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
      password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
      confirm: new FormControl({ value: '', disabled: true }, { nonNullable: true }),
    },
    { validators: passwordsMatch },
  );

  constructor() {
    // Se l'utente risulta già autenticato (es. ritorno da OAuth), prosegui.
    effect(() => {
      if (this.auth.passwordRecovery()) {
        untracked(() => this.setMode('nuova-password'));
      } else if (this.auth.isLoggedIn() && untracked(this.mode) !== 'nuova-password') {
        void this.router.navigateByUrl(this.safeReturnUrl());
      }
    });
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set(null);
    this.info.set(null);
    const { password, confirm } = this.form.controls;
    const { email } = this.form.controls;
    if (mode === 'registrati' || mode === 'nuova-password') confirm.enable();
    else confirm.disable();
    if (mode === 'recupero') password.disable();
    else password.enable();
    if (mode === 'nuova-password') email.disable();
    else email.enable();
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.info.set(null);
    try {
      switch (this.mode()) {
        case 'accedi':
          await this.auth.signIn(email, password);
          this.toast.success('Accesso effettuato');
          break;
        case 'registrati': {
          const needsConfirm = await this.auth.signUp(email, password);
          if (needsConfirm) this.info.set('Ti abbiamo inviato un’email: conferma l’indirizzo per completare la registrazione.');
          else this.toast.success('Account creato!');
          break;
        }
        case 'recupero':
          await this.auth.resetPassword(email);
          this.info.set('Se l’indirizzo è registrato riceverai un link per reimpostare la password.');
          break;
        case 'nuova-password':
          await this.auth.updatePassword(password);
          this.toast.success('Password aggiornata');
          await this.router.navigateByUrl('/diario');
          break;
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Si è verificato un errore.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async oauth(provider: OAuthProvider): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.signInWithOAuth(provider);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Accesso non riuscito.');
      this.busy.set(false);
    }
  }

  /** Accetta solo percorsi interni per evitare open redirect. */
  private safeReturnUrl(): string {
    const r = this.ritorno();
    return r && r.startsWith('/') && !r.startsWith('//') ? r : '/diario';
  }
}
