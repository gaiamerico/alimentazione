import { Injectable } from '@angular/core';
import { createClient, processLock, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

/** Wrapper unico del client Supabase. `client` è null se le chiavi non sono configurate. */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient | null;
  readonly isConfigured: boolean;

  constructor() {
    this.isConfigured = Boolean(environment.supabaseUrl && environment.supabaseAnonKey);
    this.client = this.isConfigured
      ? createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: 'pkce',
            // Evita i timeout del Navigator LockManager con più schede/HMR.
            lock: processLock,
          },
        })
      : null;
  }
}
