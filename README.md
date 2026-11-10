# NutriOssalati

PWA in italiano per cercare alimenti e bilanciare **ossalati, calcio, colesterolo e macronutrienti**.
Angular 22 (standalone, Signals, Reactive Forms, zoneless) · Tailwind CSS 4 · Supabase (Postgres + Auth + RLS) · Vercel.

> Strumento informativo: i valori sono indicativi e non sostituiscono il parere di medico o dietista.

## Funzionalità

- **Ricerca istantanea** full-text in italiano (prefissi, accenti, sinonimi, tolleranza ai refusi) tramite RPC `search_foods`.
- **Filtri rapidi**: basso ossalato (< 25 mg), alto calcio (> 150 mg), senza colesterolo, categoria; valori per 100 g o per porzione.
- **Indicatore ossalati**: verde < 25 mg · giallo 25–99 mg · rosso ≥ 100 mg.
- **Bilancio pasto**: composizione del pasto con grammature, totali e rapporto molare Ca:Ox con feedback (insufficiente / sufficiente / ottimo) e suggerimenti per colmare il calcio mancante.
- **Account** (email/password, Google OAuth, recupero password), **preferiti** e **diario** giornaliero con totali e bilancio per pasto.
- **PWA**: installabile, funziona offline (catalogo incluso nell'app + cache del service worker), tema chiaro/scuro/sistema.

## Struttura

```
├── supabase/
│   ├── migrations/20261110000000_schema.sql  # tabelle, indici FTS/trigram, vista totali, RLS, RPC search_foods
│   └── seed.sql                              # 148 alimenti (idempotente, upsert su name_it)
├── scripts/
│   ├── set-env.mjs          # genera src/environments/environment.ts dalle variabili d'ambiente
│   ├── import-usda.mjs      # aggiorna i nutrienti da USDA FoodData Central (anteprima / --apply)
│   └── export-catalog.mjs   # rigenera public/data/catalogo.json (catalogo offline) da Supabase
├── public/
│   ├── data/catalogo.json   # catalogo offline incluso nella build
│   ├── manifest.webmanifest
│   └── icons/, favicon.svg
├── src/app/
│   ├── core/
│   │   ├── models/food.model.ts
│   │   ├── utils/nutrition.ts (+ .spec.ts)   # soglie, riscalatura, bilancio calcio/ossalati
│   │   ├── services/  supabase · auth · food · favorites · diary · meal · theme · network · toast
│   │   └── guards/auth.guard.ts
│   ├── shared/components/  icon · oxalate-badge · food-card · food-picker · balance-panel · nutrient-summary
│   ├── features/  search · food-detail · meal · diary · favorites · auth
│   ├── layout/shell.ts      # header, navigazione desktop/mobile, banner offline, notifiche
│   ├── app.routes.ts        # rotte lazy: /, /alimento/:id, /pasto, /diario, /preferiti, /accedi
│   └── app.config.ts
├── ngsw-config.json         # service worker (asset + cache API catalogo)
└── vercel.json              # build, rewrite SPA, header di cache
```

## Requisiti

- **Node.js ≥ 22.22** (Angular 22). Con nvm: `nvm use` (legge `.nvmrc`).
- Un progetto [Supabase](https://supabase.com).

## 1. Database Supabase

**Da dashboard:** SQL Editor → esegui `supabase/migrations/20261110000000_schema.sql`, poi `supabase/seed.sql`.

**Da CLI:**

```bash
npx supabase link --project-ref <ref-progetto>
npx supabase db push                     # applica la migrazione
psql "$DATABASE_URL" -f supabase/seed.sql   # oppure incolla il seed nello SQL Editor
```

Cosa crea lo schema:

| Oggetto | Note |
|---|---|
| `foods` | catalogo per 100 g; colonna `search` (tsvector `italian` + `unaccent`, pesi A/B/C); indici GIN FTS e trigram |
| `favorites` | PK `(user_id, food_id)`; `user_id` default `auth.uid()` |
| `diary_entries` | data, pasto (`colazione/pranzo/cena/spuntino`), grammi (0–5000] |
| `diary_daily_totals` | vista `security_invoker` con i totali giornalieri |
| `search_foods(q, max_oxalate, min_calcium, no_cholesterol, food_category, result_limit)` | ricerca FTS a prefisso + fallback trigram |

**RLS:** `foods` è in sola lettura per `anon`/`authenticated` (scrittura solo con service role); `favorites` e `diary_entries` sono visibili e modificabili solo dal proprietario (`auth.uid() = user_id`).

**Auth:** in Authentication → URL Configuration imposta *Site URL* al dominio Vercel e aggiungi agli *Redirect URLs* `https://<tuo-dominio>/**` e `http://localhost:4200/**`. Per Google: Authentication → Providers → Google (client ID/secret da Google Cloud Console).

## 2. Sviluppo locale

```bash
cp .env.example .env      # inserisci SUPABASE_URL e SUPABASE_ANON_KEY (Project Settings → API)
npm install
npm start                 # http://localhost:4200
npm test                  # test unitari (Vitest)
npm run build             # build di produzione in dist/nutriossalati/browser
```

Senza variabili Supabase l'app funziona comunque in modalità sola consultazione con il catalogo offline incluso.
Il service worker è attivo solo nella build di produzione (prova con `npx http-server dist/nutriossalati/browser`).

## 3. Deploy su Vercel

1. Pubblica il repository su GitHub/GitLab e importalo su Vercel (*Add New → Project*).
2. Framework preset: **Other** (le impostazioni sono già in `vercel.json`: `npm ci`, `npm run build`, output `dist/nutriossalati/browser`).
3. *Settings → Environment Variables*: aggiungi `SUPABASE_URL` e `SUPABASE_ANON_KEY` (Production e Preview).
4. *Settings → General → Node.js Version*: **22.x**.
5. Deploy. Poi aggiorna Site URL / Redirect URLs su Supabase con il dominio assegnato.

Da CLI: `npx vercel` (anteprima) e `npx vercel --prod`.

`vercel.json` gestisce: rewrite SPA verso `index.html` (i file statici hanno la precedenza), `no-cache` per `ngsw-worker.js`/`ngsw.json`/`index.html`, cache immutabile per i bundle con hash, header di sicurezza.

## Dati e metodologia

- **Nutrienti** (kcal, proteine, carboidrati, grassi, fibre, calcio, colesterolo): USDA FoodData Central (SR Legacy/Foundation) e tabelle CREA per i prodotti tipici italiani; la fonte è indicata per ogni alimento.
- **Ossalati**: stime dalla lista Harvard T.H. Chan School of Public Health (mg per porzione riscalati a 100 g), confrontate con Oxalate.org e OHF. Il campo `oxalate_confidence` (alta/media/bassa) indica l'affidabilità: il contenuto reale varia con varietà, terreno, maturazione e cottura.
- **Bilancio Ca:Ox**: calcio e ossalato si legano in rapporto molare 1:1 (1 mg di ossalato ≈ 0,455 mg di calcio). L'app considera *ottimo* un rapporto ≥ 2:1, *sufficiente* tra 1:1 e 2:1, *insufficiente* sotto 1:1; sotto 10 mg di ossalati il pasto è *trascurabile*.
- **Aggiornare i nutrienti da USDA**: `npm run import:usda` (anteprima) e `npm run import:usda -- --apply` (richiede `SUPABASE_SERVICE_ROLE_KEY` e preferibilmente una `FDC_API_KEY` gratuita da api.data.gov). Gli alimenti CREA e i valori di ossalato non vengono modificati.
- Dopo modifiche al catalogo esegui `npm run export:catalog` per aggiornare il catalogo offline.
