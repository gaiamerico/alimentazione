-- =====================================================================
-- NutriOssalati — tutta la lista Harvard nel catalogo, con dati incompleti
--
-- La lista Harvard dà gli ossalati PER PORZIONE ("½ cup", "1 oz", "1 fetta"),
-- il catalogo lavora per 100 g. I due dati restano distinti:
--   foods.oxalate_mg                        mg per 100 g, solo se misurato o verificato
--   oxalate_reference.oxalate_mg_serving    mg per porzione, così come scritto nella lista
-- Il peso in grammi della porzione NON si stima e NON si salva: dove la conversione
-- è certa (once; bevande, volume ≈ peso) l'app calcola una stima a video; altrove
-- mostra il dato per porzione e propone la ricerca online.
--
-- 1. foods            : nutrienti, ossalati per 100 g e fonti diventano nullable.
--                       NULL = "dato non disponibile" (mai zero di comodo).
-- 2. food_candidates  : target_food_id = alimento già in catalogo da completare.
-- 3. approve_food_candidate : con target_food_id completa SOLO i campi vuoti
--                       dell'alimento; senza, inserisce un alimento nuovo (come prima).
--
-- Le voci Harvard si caricano con supabase/seed_harvard_foods.sql.
-- Idempotente: può essere rieseguita.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Catalogo: valori facoltativi
-- ---------------------------------------------------------------------
alter table public.foods
  alter column kcal               drop not null, alter column kcal               drop default,
  alter column protein_g          drop not null, alter column protein_g          drop default,
  alter column carbs_g            drop not null, alter column carbs_g            drop default,
  alter column fat_g              drop not null, alter column fat_g              drop default,
  alter column fiber_g            drop not null, alter column fiber_g            drop default,
  alter column calcium_mg         drop not null, alter column calcium_mg         drop default,
  alter column cholesterol_mg     drop not null, alter column cholesterol_mg     drop default,
  alter column oxalate_mg         drop not null, alter column oxalate_mg         drop default,
  alter column oxalate_confidence drop not null, alter column oxalate_confidence drop default,
  alter column nutrient_source    drop not null, alter column nutrient_source    drop default,
  alter column oxalate_source     drop not null, alter column oxalate_source     drop default;

comment on table public.foods is
  'Catalogo alimenti (valori per 100 g; NULL = dato non disponibile). Lettura pubblica, scrittura solo service_role.';
comment on column public.foods.oxalate_mg is
  'Ossalato totale, mg per 100 g. NULL se esiste solo il dato per porzione della lista Harvard (oxalate_reference_id).';

-- ---------------------------------------------------------------------
-- 2. Proposte: completamento di un alimento esistente
-- ---------------------------------------------------------------------
alter table public.food_candidates
  add column if not exists target_food_id bigint references public.foods (id) on delete cascade;

create index if not exists food_candidates_target_food_idx on public.food_candidates (target_food_id);

comment on column public.food_candidates.target_food_id is
  'Alimento già in catalogo che la proposta completa. NULL = proposta di un alimento nuovo.';

-- ---------------------------------------------------------------------
-- 3. Approvazione
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

  if c.target_food_id is not null then
    -- Completamento: si riempiono solo i campi vuoti, i dati già presenti non si toccano.
    -- Le fonti seguono il dato: cambiano solo se la proposta ha portato quel dato.
    update public.foods f
       set nutrient_source = case
             when (f.kcal is null or f.protein_g is null or f.carbs_g is null or f.fat_g is null
                   or f.fiber_g is null or f.calcium_mg is null or f.cholesterol_mg is null)
                  and c.nutrient_source is not null
             then case when f.nutrient_source is null or f.nutrient_source = c.nutrient_source
                       then c.nutrient_source
                       else f.nutrient_source || ' + ' || c.nutrient_source end
             else f.nutrient_source end,
           oxalate_source = case
             when f.oxalate_mg is null and c.oxalate_mg is not null then coalesce(c.oxalate_source, f.oxalate_source)
             else f.oxalate_source end,
           oxalate_confidence = case
             when f.oxalate_mg is null and c.oxalate_mg is not null then c.oxalate_confidence
             else f.oxalate_confidence end,
           default_portion_g = case
             when f.portion_label is null and c.default_portion_g is not null then c.default_portion_g
             else f.default_portion_g end,
           portion_label   = coalesce(f.portion_label, c.portion_label),
           kcal            = coalesce(f.kcal, c.kcal),
           protein_g       = coalesce(f.protein_g, c.protein_g),
           carbs_g         = coalesce(f.carbs_g, c.carbs_g),
           fat_g           = coalesce(f.fat_g, c.fat_g),
           fiber_g         = coalesce(f.fiber_g, c.fiber_g),
           calcium_mg      = coalesce(f.calcium_mg, c.calcium_mg),
           cholesterol_mg  = coalesce(f.cholesterol_mg, c.cholesterol_mg),
           saturated_fat_g = coalesce(f.saturated_fat_g, c.saturated_fat_g),
           sugars_g        = coalesce(f.sugars_g, c.sugars_g),
           sodium_mg       = coalesce(f.sodium_mg, c.sodium_mg),
           oxalate_mg      = coalesce(f.oxalate_mg, c.oxalate_mg),
           synonyms        = coalesce(f.synonyms, c.synonyms),
           notes           = coalesce(f.notes, c.notes)
     where f.id = c.target_food_id
    returning f.id into new_id;
    if new_id is null then
      raise exception 'L''alimento % da completare non esiste più', c.target_food_id;
    end if;
  else
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
  end if;

  update public.food_candidates
     set status = 'approvato', food_id = new_id, review_note = note, reviewed_at = now()
   where id = candidate_id;

  return new_id;
end;
$$;

revoke all on function public.approve_food_candidate(bigint, text) from public, anon, authenticated;
grant execute on function public.approve_food_candidate(bigint, text) to service_role;

-- PostgREST: rilegge lo schema (colonne e funzione aggiornate).
notify pgrst, 'reload schema';
