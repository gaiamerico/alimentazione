# Ricerca online degli alimenti

Se cerchi un alimento che non è nel catalogo, l'app può cercarlo online e aggiungerlo al database.

## Come funziona

Quando una ricerca non trova risultati, compare il pulsante **"Cerca «…» online e aggiungilo"**. Lo vedi solo se hai fatto l'accesso e sei online.

1. Claude identifica l'alimento (corregge anche i refusi). Stabilisce nome italiano e inglese, categoria e porzione tipica, e stima nutrienti e ossalati per 100 g.
2. Se nel database americano USDA FoodData Central esiste lo stesso alimento, i nutrienti vengono presi da lì al posto della stima.
3. L'alimento viene salvato nel database, quindi da quel momento lo trovano tutti. Poi si apre la sua scheda.

## Limiti

- Ogni alimento aggiunto così è marcato come «Stima AI» e ha la nota «valori indicativi da verificare».
- L'affidabilità degli ossalati è al massimo *media*: online non esiste una fonte affidabile da consultare, quindi il valore è sempre una stima.
- Prima di aggiungere, la funzione controlla che l'alimento non sia già presente.
- Ogni utente può aggiungere al massimo 20 alimenti al giorno, per contenere i costi.
- Ogni ricerca online è una chiamata a pagamento all'API di Claude (pochi centesimi di dollaro).

## Attivazione

### 1. Applica la migrazione

Nell'SQL Editor di Supabase esegui `supabase/migrations/20261111000000_online_lookup.sql`.
Aggiunge la colonna `created_by` alla tabella `foods`.

Oppure da CLI:

```bash
npx supabase db push
```

### 2. Imposta la chiave di Claude

La ottieni su console.anthropic.com.

```bash
npx supabase secrets set ANTHROPIC_API_KEY=la-tua-chiave
```

### 3. (Facoltativo) Imposta la chiave USDA

Gratuita, da api.data.gov. Senza, si usa la chiave demo, che ha limiti bassi.

```bash
npx supabase secrets set FDC_API_KEY=la-tua-chiave
```

### 4. Pubblica la funzione

```bash
npx supabase functions deploy lookup-food
```

Se la CLI non è ancora collegata al progetto, prima esegui:

```bash
npx supabase link --project-ref <ref-progetto>
```

## File coinvolti

| File | Ruolo |
|---|---|
| `supabase/migrations/20261111000000_online_lookup.sql` | colonna `created_by` e indice per il limite giornaliero |
| `supabase/functions/lookup-food/index.ts` | Edge Function: verifica utente, Claude + USDA, inserimento |
| `src/app/core/services/food.service.ts` | metodo `lookupOnline()` che chiama la funzione |
| `src/app/features/search/search.page.ts` | pulsante nella pagina di ricerca quando non ci sono risultati |
