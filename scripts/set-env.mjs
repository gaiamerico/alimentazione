// Genera src/environments/environment.ts a partire dalle variabili d'ambiente.
// Usato in locale (file .env) e su Vercel (Project Settings → Environment Variables).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envFile = resolve(root, '.env');

if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

const url = process.env.SUPABASE_URL ?? process.env.NG_APP_SUPABASE_URL ?? '';
const anonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.NG_APP_SUPABASE_ANON_KEY ??
  '';

if (!url || !anonKey) {
  console.warn(
    '[set-env] SUPABASE_URL o SUPABASE_ANON_KEY mancanti: l\'app funzionerà solo con il catalogo offline.',
  );
}

const content = `// File generato da scripts/set-env.mjs — non modificare a mano.
export const environment = {
  supabaseUrl: ${JSON.stringify(url)},
  supabaseAnonKey: ${JSON.stringify(anonKey)},
} as const;
`;

mkdirSync(resolve(root, 'src/environments'), { recursive: true });
writeFileSync(resolve(root, 'src/environments/environment.ts'), content);
console.log('[set-env] src/environments/environment.ts generato.');
