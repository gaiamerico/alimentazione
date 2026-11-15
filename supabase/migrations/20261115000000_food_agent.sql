-- =====================================================================
-- NutriOssalati — agente "alimento non trovato"
--
-- 1. oxalate_reference : lista Harvard (mg per porzione), prima fonte dell'agente.
-- 2. food_candidates   : proposte dell'agente in attesa di verifica umana.
-- 3. approve_food_candidate / reject_food_candidate : revisione (solo service_role).
--
-- Il catalogo `foods` resta scrivibile solo dal service role: l'agente non
-- pubblica mai direttamente, ogni alimento passa da una verifica.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Riferimento ossalati (Harvard T.H. Chan, mg per porzione)
-- ---------------------------------------------------------------------
create table if not exists public.oxalate_reference (
  id                 bigint generated always as identity primary key,
  name_en            text not null,
  category           text not null,
  serving            text not null,              -- es. "½ cup", "1 slice"
  oxalate_mg_serving numeric(7,1) not null check (oxalate_mg_serving >= 0),
  tier               text not null check (tier in ('low', 'medium', 'high')),
  source             text not null default 'Harvard T.H. Chan School of Public Health (rev. nov 2023)',
  unique (name_en, serving)
);

comment on table public.oxalate_reference is
  'Lista ossalati Harvard: mg PER PORZIONE (non per 100 g). Sola lettura per il service role (agente).';

create index if not exists oxalate_reference_name_trgm_idx on public.oxalate_reference
  using gin (lower(name_en) extensions.gin_trgm_ops);

alter table public.oxalate_reference enable row level security;
-- Nessuna policy: accessibile solo dal service role.

create or replace function public.match_oxalate_reference(q text, max_results int default 8)
returns setof public.oxalate_reference
language sql
stable
security invoker
set search_path = ''
as $$
  select r.*
    from public.oxalate_reference r
   where lower(r.name_en) like '%' || lower(trim(q)) || '%'
      or extensions.similarity(lower(r.name_en), lower(trim(q))) > 0.25
      or extensions.word_similarity(lower(trim(q)), lower(r.name_en)) > 0.5
   order by greatest(
              extensions.similarity(lower(r.name_en), lower(trim(q))),
              extensions.word_similarity(lower(trim(q)), lower(r.name_en))
            ) desc,
            r.name_en
   limit least(greatest(coalesce(max_results, 8), 1), 20);
$$;

revoke all on function public.match_oxalate_reference(text, int) from public, anon, authenticated;
grant execute on function public.match_oxalate_reference(text, int) to service_role;

-- ---------------------------------------------------------------------
-- 2. Proposte dell'agente
-- ---------------------------------------------------------------------
create table if not exists public.food_candidates (
  id                 bigint generated always as identity primary key,
  requested_by       uuid references auth.users (id) on delete set null,
  query              text not null check (char_length(query) between 2 and 80),
  query_norm         text not null,
  status             text not null default 'in_ricerca'
                     check (status in ('in_ricerca', 'da_verificare', 'approvato', 'rifiutato',
                                       'non_trovato', 'gia_presente', 'errore')),

  -- Proposta (stessi campi di foods, valori per 100 g). Null finché l'agente non conclude.
  name_it            text,
  name_en            text,
  category           text,
  synonyms           text,
  kcal               numeric(7,1) check (kcal >= 0),
  protein_g          numeric(6,2) check (protein_g >= 0),
  carbs_g            numeric(6,2) check (carbs_g >= 0),
  fat_g              numeric(6,2) check (fat_g >= 0),
  fiber_g            numeric(6,2) check (fiber_g >= 0),
  calcium_mg         numeric(7,1) check (calcium_mg >= 0),
  cholesterol_mg     numeric(7,1) check (cholesterol_mg >= 0),
  oxalate_mg         numeric(7,1) check (oxalate_mg >= 0),
  oxalate_min_mg     numeric(7,1) check (oxalate_min_mg >= 0),   -- intervallo trovato nelle fonti
  oxalate_max_mg     numeric(7,1) check (oxalate_max_mg >= 0),
  oxalate_basis      text check (oxalate_basis in ('misurato', 'derivato', 'stimato')),
  oxalate_confidence text check (oxalate_confidence in ('alta', 'media', 'bassa')),
  default_portion_g  numeric(6,1) check (default_portion_g > 0),
  portion_label      text,
  nutrient_source    text,
  oxalate_source     text,
  notes              text,                       -- nota per l'utente (finisce in foods.notes)

  -- Tracciabilità
  sources            jsonb not null default '[]'::jsonb,  -- [{title,url,used_for,reported_value,seen_in_search}]
  agent_notes        text,                       -- ragionamento/conversioni, per chi verifica
  model              text,
  error              text,

  existing_food_id   bigint references public.foods (id) on delete set null,  -- se "gia_presente"
  food_id            bigint references public.foods (id) on delete set null,  -- dopo l'approvazione
  review_note        text,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.food_candidates is
  'Alimenti proposti dall''agente. Lettura: solo il richiedente. Scrittura: solo service_role.';

-- Una sola ricerca attiva per lo stesso termine.
create unique index if not exists food_candidates_active_query_idx
  on public.food_candidates (query_norm)
  where status in ('in_ricerca', 'da_verificare');
create index if not exists food_candidates_user_idx   on public.food_candidates (requested_by, created_at desc);
create index if not exists food_candidates_status_idx on public.food_candidates (status, created_at);
create index if not exists food_candidates_existing_food_idx on public.food_candidates (existing_food_id);
create index if not exists food_candidates_food_idx   on public.food_candidates (food_id);

drop trigger if exists food_candidates_touch on public.food_candidates;
create trigger food_candidates_touch before update on public.food_candidates
  for each row execute function public.touch_updated_at();

alter table public.food_candidates enable row level security;

drop policy if exists "Proposte: lettura proprie" on public.food_candidates;
create policy "Proposte: lettura proprie" on public.food_candidates
  for select to authenticated using ((select auth.uid()) = requested_by);
-- Nessuna policy di scrittura: inserimenti e aggiornamenti solo dalla Edge Function (service role).

grant select on public.food_candidates to authenticated;

-- ---------------------------------------------------------------------
-- 3. Revisione
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
    default_portion_g, portion_label, nutrient_source, oxalate_source, notes
  ) values (
    c.name_it, c.name_en, c.category, c.synonyms,
    c.kcal, c.protein_g, c.carbs_g, c.fat_g, c.fiber_g,
    c.calcium_mg, c.cholesterol_mg, c.oxalate_mg, c.oxalate_confidence,
    c.default_portion_g, c.portion_label, c.nutrient_source, c.oxalate_source, c.notes
  )
  returning id into new_id;

  update public.food_candidates
     set status = 'approvato', food_id = new_id, review_note = note, reviewed_at = now()
   where id = candidate_id;

  return new_id;
end;
$$;

create or replace function public.reject_food_candidate(candidate_id bigint, note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.food_candidates
     set status = 'rifiutato', review_note = note, reviewed_at = now()
   where id = candidate_id and status = 'da_verificare';
  if not found then
    raise exception 'Proposta % inesistente o non in stato "da_verificare"', candidate_id;
  end if;
end;
$$;

revoke all on function public.approve_food_candidate(bigint, text) from public, anon, authenticated;
revoke all on function public.reject_food_candidate(bigint, text)  from public, anon, authenticated;
grant execute on function public.approve_food_candidate(bigint, text) to service_role;
grant execute on function public.reject_food_candidate(bigint, text)  to service_role;
