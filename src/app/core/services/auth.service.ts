import { computed, inject, Injectable, signal } from '@angular/core';
import { AuthError, Provider, Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

export type OAuthProvider = Extract<Provider, 'google' | 'github'>;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);

  private readonly _session = signal<Session | null>(null);
  private readonly _ready = signal(false);
  private readonly _passwordRecovery = signal(false);
  private readyPromise: Promise<void>;

  readonly session = this._session.asReadonly();
  readonly ready = this._ready.asReadonly();
  /** true dopo il click sul link di recupero password: va impostata una nuova password. */
  readonly passwordRecovery = this._passwordRecovery.asReadonly();
  readonly user = computed(() => this._session()?.user ?? null);
  readonly isLoggedIn = computed(() => this.user() !== null);
  readonly isAvailable = this.supabase.isConfigured;

  constructor() {
    const client = this.supabase.client;
    if (!client) {
      this._ready.set(true);
      this.readyPromise = Promise.resolve();
      return;
    }
    client.auth.onAuthStateChange((event, session) => {
      this._session.set(session);
      if (event === 'PASSWORD_RECOVERY') this._passwordRecovery.set(true);
    });
    this.readyPromise = client.auth
      .getSession()
      .then(({ data }) => this._session.set(data.session))
      .catch(() => this._session.set(null))
      .finally(() => this._ready.set(true));
  }

  /** Risolve quando la sessione iniziale è stata letta (usato dalle guard). */
  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.requireClient().auth.signInWithPassword({ email, password });
    if (error) throw new Error(translateAuthError(error));
  }

  /** Ritorna true se è richiesta la conferma via email. */
  async signUp(email: string, password: string): Promise<boolean> {
    const { data, error } = await this.requireClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw new Error(translateAuthError(error));
    return data.session === null;
  }

  async signInWithOAuth(provider: OAuthProvider): Promise<void> {
    const { error } = await this.requireClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/diario` },
    });
    if (error) throw new Error(translateAuthError(error));
  }

  async resetPassword(email: string): Promise<void> {
    const { error } = await this.requireClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/accedi`,
    });
    if (error) throw new Error(translateAuthError(error));
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.requireClient().auth.updateUser({ password });
    if (error) throw new Error(translateAuthError(error));
    this._passwordRecovery.set(false);
  }

  async signOut(): Promise<void> {
    await this.supabase.client?.auth.signOut();
    this._session.set(null);
  }

  private requireClient() {
    const client = this.supabase.client;
    if (!client) throw new Error('Autenticazione non disponibile: Supabase non è configurato.');
    return client;
  }
}

function translateAuthError(error: AuthError): string {
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Email o password non corretti.';
  if (msg.includes('email not confirmed')) return 'Conferma prima il tuo indirizzo email (controlla la casella di posta).';
  if (msg.includes('user already registered')) return 'Esiste già un account con questa email.';
  if (msg.includes('password should be at least')) return 'La password deve contenere almeno 6 caratteri.';
  if (msg.includes('rate limit')) return 'Troppi tentativi: riprova tra qualche minuto.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Connessione assente: riprova quando sei online.';
  return `Errore di autenticazione: ${error.message}`;
}
