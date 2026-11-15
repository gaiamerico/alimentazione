# NutriOssalati

PWA in italiano per cercare alimenti e confrontare **ossalati, calcio, colesterolo e macronutrienti**.
Angular 22 (standalone, Signals, Reactive Forms, zoneless) · Tailwind CSS 4 · Supabase (Postgres + Auth + RLS) · Vercel.

> Strumento informativo: i valori sono indicativi e non sostituiscono il parere di medico o dietista. Le [avvertenze](#avvertenze) complete sono anche dentro l'app, alla pagina `/avvertenze`.

## Funzionalità

- **Ricerca istantanea** full-text in italiano (prefissi, accenti, sinonimi, tolleranza ai refusi) tramite RPC `search_foods`.
- **Filtri rapidi**: basso ossalato (< 25 mg), alto calcio (> 150 mg), senza colesterolo, categoria; valori per 100 g o per porzione.
- **Indicatore ossalati**: verde < 25 mg · giallo 25–99 mg · rosso ≥ 100 mg.
- **Bilancio pasto**: composizione del pasto con grammature, totali e rapporto molare Ca:Ox (stima teorica: insufficiente / sufficiente / ottimo), alimenti ricchi di calcio con cui raggiungere il rapporto 2:1, **contributi principali** (i primi tre alimenti per ossalati, calcio e colesterolo, con la quota sul totale) e **calcio per provenienza** (da alimenti ad alto contenuto di ossalati o da altri).
- **Nutrienti**: kcal, proteine, carboidrati, zuccheri, fibre, grassi, grassi saturi, calcio, colesterolo, sodio. Zuccheri, grassi saturi e sodio possono mancare: l'app scrive «dato non disponibile» e segna come *parziale* un totale che non comprende tutti gli alimenti.
- **Scheda alimento**: fonte dei nutrienti, fonte degli ossalati e affidabilità; quando esiste una voce corrispondente, il dato della **lista Harvard** (mg per porzione e fascia della fonte, revisione novembre 2023).
- **Codice a barre**: scansione dei prodotti confezionati con la fotocamera (o codice digitato a mano) e scheda con i valori dell'etichetta da Open Food Facts; segnala gli ingredienti che nel catalogo sono ricchi di ossalati (vedi [Prodotti confezionati](#prodotti-confezionati-codice-a-barre)).
- **Account** (email/password, Google OAuth, recupero password), **preferiti** e **diario** giornaliero con totali e bilancio per pasto.
- **Assistente per gli alimenti mancanti**: se la ricerca non trova nulla, un agente cerca online ossalati e valori nutrizionali e propone la scheda; entra nel catalogo solo dopo la tua verifica (vedi [Assistente](#assistente-per-gli-alimenti-mancanti)).
- **PWA**: installabile, funziona offline (catalogo incluso nell'app + cache del service worker), tema chiaro/scuro/sistema.

## Struttura

```
├── supabase/
│   ├── migrations/20261110000000_schema.sql      # tabelle, indici FTS/trigram, vista totali, RLS, RPC search_foods
│   ├── migrations/20261115000000_food_agent.sql  # oxalate_reference, food_candidates, approvazione
│   ├── migrations/20261116000000_extra_nutrients.sql  # grassi saturi, zuccheri, sodio; campi di arricchimento Harvard
│   ├── migrations/20261117000000_harvard_link_packaged_products.sql  # alimento → voce Harvard; packaged_products
│   ├── seed.sql                                  # 148 alimenti (idempotente, upsert su name_it)
│   ├── seed_oxalate_reference.sql                # lista Harvard: 289 alimenti, mg di ossalato per porzione
│   ├── seed_oxalate_reference_it.sql             # nome italiano e stato di preparazione delle 289 voci
│   ├── seed_harvard_links.sql                    # alimento del catalogo → voce Harvard (62 corrispondenze curate)
│   ├── functions/resolve-food/                   # Edge Function dell'assistente (index · agent · prompt · validate)
│   └── functions/lookup-barcode/                 # Edge Function codice a barre → Open Food Facts (index · product)
├── scripts/
│   ├── set-env.mjs          # genera src/environments/environment.ts dalle variabili d'ambiente
│   ├── import-usda.mjs      # aggiorna i nutrienti da USDA FoodData Central (anteprima / --apply)
│   ├── enrich-reference.mjs # peso USDA delle porzioni Harvard → ossalato per 100 g (anteprima / --apply)
│   ├── eval-agent.mjs       # misura l'assistente contro la lista Harvard (senza lo strumento Harvard)
│   ├── export-catalog.mjs   # rigenera public/data/catalogo.json (catalogo offline) da Supabase
│   └── review-candidates.mjs  # elenca / approva / rifiuta le proposte dell'assistente
├── public/
│   ├── data/catalogo.json   # catalogo offline incluso nella build
│   ├── manifest.webmanifest
│   └── icons/, favicon.svg
├── src/app/
│   ├── core/
│   │   ├── models/food.model.ts
│   │   ├── utils/nutrition.ts (+ .spec.ts)   # soglie, riscalatura, bilancio calcio/ossalati, contributi
│   │   ├── utils/packaged.ts (+ .spec.ts)    # validazione del codice a barre, ingredienti ricchi di ossalati
│   │   ├── services/  supabase · auth · food · food-request · barcode · favorites · diary · meal · theme · network · toast
│   │   └── guards/auth.guard.ts
│   ├── shared/components/  icon · oxalate-badge · food-card · food-picker · balance-panel · nutrient-summary · contributors-panel
│   ├── features/  search · food-detail · meal · diary · favorites · auth · barcode (scan · product) · disclaimer
│   ├── layout/shell.ts      # header, navigazione desktop/mobile, banner offline, notifiche
│   ├── app.routes.ts        # rotte lazy: /, /alimento/:id, /pasto, /diario, /preferiti, /accedi, /scansiona, /prodotto/:barcode, /avvertenze
│   └── app.config.ts
├── ngsw-config.json         # service worker (asset + cache API catalogo)
└── vercel.json              # build, rewrite SPA, header di cache
```

## Requisiti

- **Node.js ≥ 22.22** (Angular 22). Con nvm: `nvm use` (legge `.nvmrc`).
- Un progetto [Supabase](https://supabase.com).

## 1. Database Supabase

**Da dashboard:** SQL Editor → esegui nell'ordine i file di `supabase/migrations/`, poi, in quest'ordine, `supabase/seed.sql`, `supabase/seed_oxalate_reference.sql`, `supabase/seed_oxalate_reference_it.sql` e `supabase/seed_harvard_links.sql` (collega gli alimenti del catalogo alle voci Harvard: va eseguito dopo la lista).

**Da CLI:**

```bash
npx supabase link --project-ref <ref-progetto>
npx supabase db push                     # applica la migrazione
psql "$DATABASE_URL" -f supabase/seed.sql   # oppure incolla il seed nello SQL Editor
```

Cosa crea lo schema:

| Oggetto | Note |
|---|---|
| `foods` | catalogo per 100 g; colonna `search` (tsvector `italian` + `unaccent`, pesi A/B/C); indici GIN FTS e trigram. `saturated_fat_g`, `sugars_g`, `sodium_mg` sono nullable: NULL = dato non disponibile, non zero. `oxalate_reference_id` punta alla voce Harvard dello stesso alimento, se c'è |
| `oxalate_reference` | lista Harvard: mg **per porzione**, fascia, nome italiano, preparazione; `fdc_id`, `serving_g`, `oxalate_mg_100g` compilati solo con pesi USDA verificati |
| `food_candidates` | proposte dell'assistente in attesa di verifica |
| `packaged_products` | cache dei prodotti confezionati letti da Open Food Facts (chiave: codice a barre) |
| `favorites` | PK `(user_id, food_id)`; `user_id` default `auth.uid()` |
| `diary_entries` | data, pasto (`colazione/pranzo/cena/spuntino`), grammi (0–5000] |
| `diary_daily_totals` | vista `security_invoker` con i totali giornalieri; per grassi saturi, zuccheri e sodio somma solo i valori presenti e conta le voci senza dato (`*_missing`) |
| `search_foods(q, max_oxalate, min_calcium, no_cholesterol, food_category, result_limit)` | ricerca FTS a prefisso + fallback trigram |

**RLS:** `foods` e `packaged_products` sono in sola lettura per `anon`/`authenticated` (scrittura solo con service role); `favorites` e `diary_entries` sono visibili e modificabili solo dal proprietario (`auth.uid() = user_id`); di `oxalate_reference` sono leggibili solo le voci collegate a un alimento del catalogo; `food_candidates` è leggibile solo da chi ha fatto la richiesta.

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

## Assistente per gli alimenti mancanti

Quando la ricerca non trova un alimento, l'utente autenticato può chiedere all'assistente di cercarlo online.

```
ricerca senza risultati → Edge Function resolve-food → agente (Claude)
     ├─ lista Harvard (tabella oxalate_reference, mg per porzione)
     ├─ USDA FoodData Central (nutrienti per 100 g e pesi delle porzioni)
     └─ ricerca web (studi, enti clinici, tabelle CREA)
→ food_candidates (stato "da_verificare") → verifica umana → foods
```

**Perché una verifica umana.** I valori di ossalato variano molto tra le fonti e un numero sbagliato su quest'app non è innocuo: l'agente propone, una persona pubblica. Per ogni proposta restano salvati fonti (con il valore letto), conversioni porzione → 100 g, intervallo min–max, base del dato (`misurato` / `derivato` / `stimato`) e confidenza.

**Controlli automatici** (`validate.ts`): intervalli plausibili, coerenza kcal/macronutrienti, grassi saturi ≤ grassi, zuccheri ≤ carboidrati, sodio 0–40000 mg, categoria esistente, almeno una fonte per ossalati e nutrienti; confidenza abbassata se il valore è stimato, se le fonti differiscono di oltre 3 volte o se nessuna fonte citata compare nei risultati di ricerca (segnate con `?` nella revisione).

**Limiti:** solo utenti autenticati, 5 ricerche al giorno per utente (`FOOD_AGENT_DAILY_LIMIT`), una sola ricerca attiva per termine, fino a 6 ricerche web per alimento.

### Attivazione

```bash
npx supabase db push                                        # applica le migrazioni
psql "$DATABASE_URL" -f supabase/seed_oxalate_reference.sql # oppure incollalo nello SQL Editor
psql "$DATABASE_URL" -f supabase/seed_oxalate_reference_it.sql
psql "$DATABASE_URL" -f supabase/seed_harvard_links.sql     # dopo la lista: collega gli alimenti alle voci Harvard
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...       # chiave da console.anthropic.com
npx supabase secrets set FDC_API_KEY=...                    # gratuita, api.data.gov (consigliata)
npx supabase functions deploy resolve-food
```

La chiave Anthropic vive solo nei secrets di Supabase: non va in `.env` del frontend né su Vercel.

Modello predefinito `claude-sonnet-5-5` con ricerca web `web_search_20260209` (secrets opzionali `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT`, default `medium`). La ricerca ha una scadenza interna di 135 secondi: il limite di durata delle Edge Function è 150 s sul piano gratuito di Supabase e 400 s sui piani a pagamento.

### Misurare l'affidabilità

```bash
node scripts/enrich-reference.mjs --apply                          # prima: pesi delle porzioni Harvard
ANTHROPIC_API_KEY=sk-ant-... npm run eval:agent -- --n 5            # prova ridotta: guarda il consumo
ANTHROPIC_API_KEY=sk-ant-... npm run eval:agent -- --out eval.json  # 50 alimenti
```

Lo script fa cercare all'agente alimenti della lista Harvard **senza** lo strumento Harvard e confronta il risultato con il valore della lista alla stessa porzione: percentuale di fasce corrette, errore mediano in mg, alimenti alti sottostimati. Se le fasce corrette sono poche, l'agente non è pronto per gli alimenti che la lista non copre e va reso più prudente in `prompt.ts`. Ogni alimento è una ricerca completa a pagamento.

### Revisione delle proposte

```bash
npm run candidates                      # elenca le proposte da verificare, con fonti e note dell'agente
npm run candidates -- --approve 12      # pubblica nel catalogo
npm run candidates -- --reject 12 --note "valore non riscontrato"
npm run export:catalog                  # dopo un'approvazione: aggiorna il catalogo offline
```

Le regole dell'agente (gerarchia delle fonti, conversioni, cottura, quando rispondere "non trovato") sono in `supabase/functions/resolve-food/prompt.ts`: è il file da modificare per renderlo più o meno prudente.

## Dati e metodologia

- **Nutrienti** (kcal, proteine, carboidrati, grassi, fibre, calcio, colesterolo; in più grassi saturi, zuccheri e sodio dove la fonte li riporta): USDA FoodData Central (SR Legacy/Foundation) e tabelle CREA per i prodotti tipici italiani; la fonte è indicata per ogni alimento. Un nutriente mancante è NULL e si mostra come «dato non disponibile», mai come zero.
- **Ossalati**: stime dalla lista Harvard T.H. Chan School of Public Health (mg per porzione riscalati a 100 g), confrontate con Oxalate.org e OHF. Il campo `oxalate_confidence` (alta/media/bassa) indica l'affidabilità: il contenuto reale varia con varietà, terreno, maturazione e cottura.
- **Due scale, non intercambiabili**: l'indicatore colorato e i filtri dell'app sono **per 100 g** (basso < 25 mg, moderato 25–99, alto ≥ 100). La lista Harvard classifica **per porzione** (bassa < 2 mg, media 2–10, alta > 10): nella scheda alimento compare come dato della fonte, non come soglia clinica.
- **Lista Harvard (rev. nov 2023)**: 289 voci in `oxalate_reference`, con il valore per porzione del PDF che non viene mai modificato. `node scripts/enrich-reference.mjs` (anteprima) e `--apply` cercano ogni voce su USDA e compilano `serving_g` e `oxalate_mg_100g` solo quando USDA dà il peso di quella misura (es. ½ cup di spinaci lessati = 90 g → 608 mg/100 g); sono ammesse le conversioni esatte 1 oz = 28,35 g e, per i liquidi, 1 fl oz = 29,57 ml. Lo script è volutamente severo: la voce USDA deve essere lo stesso alimento nello stesso stato, senza parole in più (varietà, altri ingredienti); se il nome Harvard non dice lo stato («White rice», «Quinoa») o la porzione è a pezzo («1», «5–6») il peso resta null, perché una tazza di riso crudo e una di riso cotto non pesano uguale. Molte voci restano quindi senza valore per 100 g: è il comportamento voluto.
- **Bilancio Ca:Ox**: calcio e ossalato possono legarsi in rapporto molare 1:1 (1 mg di ossalato ≈ 0,455 mg di calcio). L'app considera *ottimo* un rapporto ≥ 2:1, *sufficiente* tra 1:1 e 2:1, *insufficiente* sotto 1:1; sotto 10 mg di ossalati il pasto è *trascurabile*. È una stima teorica: in generale il calcio alimentare può legare parte degli ossalati nell'intestino, ma la risposta individuale varia. I suggerimenti sono sempre alimenti, mai integratori, e l'app non indica una dose personale.
- **Aggiornare i nutrienti da USDA**: `npm run import:usda` (anteprima) e `npm run import:usda -- --apply` (richiede `SUPABASE_SERVICE_ROLE_KEY` e una `FDC_API_KEY` gratuita da api.data.gov: con `DEMO_KEY` il limite si raggiunge dopo poche richieste). Gli alimenti CREA e i valori di ossalato non vengono modificati. Lo script prende il primo risultato della ricerca USDA: se le kcal trovate sono molto diverse da quelle in catalogo la voce è segnalata con ⚠ e non viene scritta (a meno di `--force`).
- Dopo modifiche al catalogo esegui `npm run export:catalog` per aggiornare il catalogo offline.

## Prodotti confezionati (codice a barre)

Dalla ricerca, «Scansiona un prodotto confezionato» apre la fotocamera, legge il codice (EAN-13, EAN-8, UPC-A, UPC-E) e mostra la scheda del prodotto.

```
/scansiona → BarcodeDetector nativo (Chrome/Android) oppure libreria barcode-detector (ZXing in WebAssembly)
          → Edge Function lookup-barcode → Open Food Facts (API v2) → cache in packaged_products
          → /prodotto/:barcode
```

- **Lettura del codice.** Dove il browser non ha `BarcodeDetector` (Safari/iOS, Firefox) si usa la libreria [`barcode-detector`](https://github.com/Sec-ant/barcode-detector) (licenza MIT, versione fissata in `package.json`), caricata solo all'apertura dello scanner. Il file `.wasm` (~950 kB) è servito dall'app in `/wasm/`, non da una CDN. La fotocamera richiede HTTPS e il permesso dell'utente; se manca, resta il campo per digitare il codice. Si accettano solo codici con cifra di controllo corretta.
- **Dati.** `lookup-barcode` interroga Open Food Facts con un `User-Agent` che identifica l'app (secret opzionale `OFF_USER_AGENT`, es. `NutriOssalati/1.0 (contatto)`) e salva il risultato: un prodotto trovato si rilegge dopo 30 giorni, un codice assente dopo un giorno. La funzione è pubblica: accetta solo codici con cifra di controllo valida (un UPC-E viene esteso a UPC-A) e le letture nuove hanno un tetto orario complessivo (secret `BARCODE_HOURLY_LIMIT`, default 300), oltre il quale risponde solo dalla cache; non registra indirizzi IP. Si usano solo i valori dell'etichetta (`nutriments`), non le stime dagli ingredienti. Sodio, calcio e colesterolo arrivano in grammi e vengono convertiti in mg; un campo assente o implausibile è NULL («dato non disponibile»).
- **Ossalati.** Le etichette non li riportano: il prodotto non ha un valore di ossalato. L'elenco ingredienti viene confrontato con nomi e sinonimi del catalogo (confronto deterministico, senza modello linguistico) e la scheda segnala gli ingredienti riconosciuti che in catalogo hanno ossalati alti o moderati, precisando che la quantità non è nota.
- **Sola consultazione.** I prodotti confezionati non si aggiungono a pasto e diario: senza il valore di ossalato i totali e il bilancio sarebbero incompleti.
- **Licenza.** I dati di Open Food Facts sono distribuiti con [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/); l'attribuzione compare nella scheda prodotto e nelle avvertenze. La ODbL prevede obblighi di condivisione per le banche dati derivate: valutare se la cache `packaged_products` rientri in questi obblighi spetta a chi pubblica l'app.

```bash
npx supabase functions deploy lookup-barcode
```

Da provare su un iPhone e su un Android reali, anche con la PWA installata: il comportamento della fotocamera cambia tra browser e non è verificabile dal computer.

## Avvertenze

La pagina `/avvertenze` (icona a scudo nella testata, collegamento nel piè di pagina e nei pannelli del bilancio) riporta:

- l'app è informativa e non sostituisce medico, dietista o esami;
- chi ha calcoli renali, iperossaluria, malattia renale cronica, osteoporosi, iperparatiroidismo, malassorbimento intestinale, è in gravidanza, in età pediatrica o in terapia con calcio, vitamina D o diuretici deve confrontarsi con un professionista;
- non ridurre drasticamente il calcio senza valutazione professionale; il fabbisogno di calcio è individuale e l'app non indica una dose personale;
- sangue nelle urine, dolore lombare forte, febbre, vomito persistente o difficoltà a urinare richiedono un contatto con un servizio sanitario;
- fonti dei dati e licenza di Open Food Facts.
