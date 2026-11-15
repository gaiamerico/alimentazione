-- =====================================================================
-- NutriOssalati — nutrienti aggiuntivi e arricchimento della lista Harvard
--
-- 1. foods / food_candidates : grassi saturi, zuccheri, sodio (per 100 g).
--    Colonne nullable e senza default: NULL significa "dato non disponibile",
--    non zero.
-- 2. approve_food_candidate  : copia anche le tre nuove colonne.
-- 3. diary_daily_totals      : tre nuovi totali (somma solo i valori presenti).
-- 4. oxalate_reference       : nome italiano, preparazione, voce USDA, peso
--    della porzione e ossalato per 100 g (calcolato solo con pesi USDA).
--
-- Idempotente: può essere rieseguita.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Nuovi nutrienti
-- ---------------------------------------------------------------------
alter table public.foods
  add column if not exists saturated_fat_g numeric(6,2) check (saturated_fat_g >= 0),
  add column if not exists sugars_g        numeric(6,2) check (sugars_g >= 0),
  add column if not exists sodium_mg       numeric(7,1) check (sodium_mg >= 0);

comment on column public.foods.saturated_fat_g is 'Grassi saturi, g per 100 g. NULL = dato non disponibile.';
comment on column public.foods.sugars_g        is 'Zuccheri totali, g per 100 g. NULL = dato non disponibile.';
comment on column public.foods.sodium_mg       is 'Sodio, mg per 100 g. NULL = dato non disponibile.';

alter table public.food_candidates
  add column if not exists saturated_fat_g numeric(6,2) check (saturated_fat_g >= 0),
  add column if not exists sugars_g        numeric(6,2) check (sugars_g >= 0),
  add column if not exists sodium_mg       numeric(7,1) check (sodium_mg >= 0);

-- ---------------------------------------------------------------------
-- 2. Approvazione: copia anche i nuovi nutrienti
-- ---------------------------------------------------------------------
create or replace function public.approve_food_candidate(candidate_id bigint, note text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  c      public.food_candidates;
  new_id bigint;
begin
  select * into c from public.food_candidates where id = candidate_id for update;
  if not found then
    raise exception 'Proposta % inesistente', candidate_id;
  end if;
  if c.status <> 'da_verificare' then
    raise exception 'La proposta % è nello stato "%": si approvano solo quelle "da_verificare"', candidate_id, c.status;
  end if;

  insert into public.foods (
    name_it, name_en, category, synonyms,
    kcal, protein_g, carbs_g, fat_g, fiber_g,
    calcium_mg, cholesterol_mg, oxalate_mg, oxalate_confidence,
    saturated_fat_g, sugars_g, sodium_mg,
    default_portion_g, portion_label, nutrient_source, oxalate_source, notes
  ) values (
    c.name_it, c.name_en, c.category, c.synonyms,
    c.kcal, c.protein_g, c.carbs_g, c.fat_g, c.fiber_g,
    c.calcium_mg, c.cholesterol_mg, c.oxalate_mg, c.oxalate_confidence,
    c.saturated_fat_g, c.sugars_g, c.sodium_mg,
    c.default_portion_g, c.portion_label, c.nutrient_source, c.oxalate_source, c.notes
  )
  returning id into new_id;

  update public.food_candidates
     set status = 'approvato', food_id = new_id, review_note = note, reviewed_at = now()
   where id = candidate_id;

  return new_id;
end;
$$;

revoke all on function public.approve_food_candidate(bigint, text) from public, anon, authenticated;
grant execute on function public.approve_food_candidate(bigint, text) to service_role;

-- ---------------------------------------------------------------------
-- 3. Totali giornalieri
--    sum() ignora i NULL: il totale somma solo i valori presenti ed è NULL
--    se nessun alimento del giorno ha il dato. Le colonne *_missing contano
--    le voci senza dato: se > 0 il totale corrispondente è parziale.
-- ---------------------------------------------------------------------
create or replace view public.diary_daily_totals
with (security_invoker = true) as
select
  d.user_id,
  d.entry_date,
  round(sum(f.kcal           * d.grams / 100), 1) as kcal,
  round(sum(f.protein_g      * d.grams / 100), 1) as protein_g,
  round(sum(f.carbs_g        * d.grams / 100), 1) as carbs_g,
  round(sum(f.fat_g          * d.grams / 100), 1) as fat_g,
  round(sum(f.fiber_g        * d.grams / 100), 1) as fiber_g,
  round(sum(f.calcium_mg     * d.grams / 100), 1) as calcium_mg,
  round(sum(f.cholesterol_mg * d.grams / 100), 1) as cholesterol_mg,
  round(sum(f.oxalate_mg     * d.grams / 100), 1) as oxalate_mg,
  round(sum(f.saturated_fat_g * d.grams / 100), 1) as saturated_fat_g,
  round(sum(f.sugars_g        * d.grams / 100), 1) as sugars_g,
  round(sum(f.sodium_mg       * d.grams / 100), 1) as sodium_mg,
  count(*) filter (where f.saturated_fat_g is null) as saturated_fat_missing,
  count(*) filter (where f.sugars_g is null)        as sugars_missing,
  count(*) filter (where f.sodium_mg is null)       as sodium_missing
from public.diary_entries d
join public.foods f on f.id = d.food_id
group by d.user_id, d.entry_date;

grant select on public.diary_daily_totals to authenticated;

-- ---------------------------------------------------------------------
-- 4. Lista Harvard: campi di arricchimento (tutti nullable)
--    Il valore per porzione del PDF (oxalate_mg_serving) non si modifica mai.
--    serving_g e oxalate_mg_100g si compilano solo quando USDA dà il peso di
--    quella misura (scripts/enrich-reference.mjs).
-- ---------------------------------------------------------------------
alter table public.oxalate_reference
  add column if not exists name_it         text,
  add column if not exists preparation     text
    check (preparation in ('crudo', 'bollito', 'cotto', 'in scatola', 'essiccato', 'altro')),
  add column if not exists fdc_id          bigint,
  add column if not exists serving_g       numeric(7,1) check (serving_g > 0),
  add column if not exists oxalate_mg_100g numeric(7,1) check (oxalate_mg_100g >= 0);

comment on column public.oxalate_reference.serving_g is
  'Peso in grammi della porzione, solo se ricavato da USDA per quella misura (o da conversioni esatte di unità).';
comment on column public.oxalate_reference.oxalate_mg_100g is
  'oxalate_mg_serving / serving_g × 100. NULL se il peso della porzione non è verificato.';

-- Accesso esplicito del service role (Edge Function e script di revisione).
grant select, insert, update on public.oxalate_reference to service_role;
grant select, insert, update on public.food_candidates   to service_role;

-- PostgREST: rilegge lo schema (nuove colonne e funzione aggiornata).
notify pgrst, 'reload schema';
