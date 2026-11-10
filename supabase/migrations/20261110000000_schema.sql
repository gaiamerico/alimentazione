-- =====================================================================
-- NutriOssalati — schema Supabase
-- Alimenti (catalogo pubblico in sola lettura), preferiti e diario (RLS).
-- Tutti i valori nutrizionali sono riferiti a 100 g di parte edibile.
-- =====================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- unaccent() non è IMMUTABLE: serve un wrapper per colonne generate e indici.
create or replace function public.immutable_unaccent(input text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, input)
$$;

-- ---------------------------------------------------------------------
-- Catalogo alimenti
-- ---------------------------------------------------------------------
create table if not exists public.foods (
  id                 bigint generated always as identity primary key,
  name_it            text not null unique,
  name_en            text,                       -- usato per l'import da USDA FDC
  category           text not null,
  synonyms           text,                       -- sinonimi/termini regionali per la ricerca
  kcal               numeric(7,1) not null default 0 check (kcal >= 0),
  protein_g          numeric(6,2) not null default 0 check (protein_g >= 0),
  carbs_g            numeric(6,2) not null default 0 check (carbs_g >= 0),
  fat_g              numeric(6,2) not null default 0 check (fat_g >= 0),
  fiber_g            numeric(6,2) not null default 0 check (fiber_g >= 0),
  calcium_mg         numeric(7,1) not null default 0 check (calcium_mg >= 0),
  cholesterol_mg     numeric(7,1) not null default 0 check (cholesterol_mg >= 0),
  oxalate_mg         numeric(7,1) not null default 0 check (oxalate_mg >= 0),
  oxalate_confidence text not null default 'media'
                     check (oxalate_confidence in ('alta', 'media', 'bassa')),
  default_portion_g  numeric(6,1) not null default 100 check (default_portion_g > 0),
  portion_label      text,                       -- es. "1 tazza", "1 frutto medio"
  nutrient_source    text not null default 'USDA FDC / CREA',
  oxalate_source     text not null default 'Harvard T.H. Chan',
  notes              text,
  search             tsvector generated always as (
                       setweight(to_tsvector('italian'::regconfig, public.immutable_unaccent(name_it)), 'A') ||
                       setweight(to_tsvector('italian'::regconfig, public.immutable_unaccent(coalesce(synonyms, ''))), 'B') ||
                       setweight(to_tsvector('italian'::regconfig, public.immutable_unaccent(category)), 'C')
                     ) stored,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.foods is 'Catalogo alimenti (valori per 100 g). Lettura pubblica, scrittura solo service_role.';

create index if not exists foods_search_idx    on public.foods using gin (search);
create index if not exists foods_name_trgm_idx on public.foods
  using gin (public.immutable_unaccent(lower(name_it)) extensions.gin_trgm_ops);
create index if not exists foods_oxalate_idx   on public.foods (oxalate_mg);
create index if not exists foods_calcium_idx   on public.foods (calcium_mg desc);
create index if not exists foods_category_idx  on public.foods (category);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists foods_touch on public.foods;
create trigger foods_touch before update on public.foods
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Preferiti
-- ---------------------------------------------------------------------
create table if not exists public.favorites (
  user_id    uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  food_id    bigint not null references public.foods (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, food_id)
);

create index if not exists favorites_food_idx on public.favorites (food_id);

-- ---------------------------------------------------------------------
-- Diario alimentare
-- ---------------------------------------------------------------------
create table if not exists public.diary_entries (
  id         bigint generated always as identity primary key,
  user_id    uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  food_id    bigint not null references public.foods (id) on delete restrict,
  entry_date date   not null default current_date,
  meal       text   not null default 'pranzo'
             check (meal in ('colazione', 'pranzo', 'cena', 'spuntino')),
  grams      numeric(7,1) not null check (grams > 0 and grams <= 5000),
  created_at timestamptz not null default now()
);

create index if not exists diary_user_date_idx on public.diary_entries (user_id, entry_date);
create index if not exists diary_food_idx      on public.diary_entries (food_id);

-- Totali giornalieri (security_invoker: rispetta la RLS dell'utente che interroga)
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
  round(sum(f.oxalate_mg     * d.grams / 100), 1) as oxalate_mg
from public.diary_entries d
join public.foods f on f.id = d.food_id
group by d.user_id, d.entry_date;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.foods         enable row level security;
alter table public.favorites     enable row level security;
alter table public.diary_entries enable row level security;

drop policy if exists "Alimenti leggibili da tutti" on public.foods;
create policy "Alimenti leggibili da tutti" on public.foods
  for select to anon, authenticated using (true);
-- Nessuna policy di scrittura su foods: solo service_role (bypassa RLS).

drop policy if exists "Preferiti: lettura propri"     on public.favorites;
drop policy if exists "Preferiti: inserimento propri" on public.favorites;
drop policy if exists "Preferiti: cancellazione propri" on public.favorites;
create policy "Preferiti: lettura propri" on public.favorites
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Preferiti: inserimento propri" on public.favorites
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Preferiti: cancellazione propri" on public.favorites
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Diario: lettura propri"      on public.diary_entries;
drop policy if exists "Diario: inserimento propri"  on public.diary_entries;
drop policy if exists "Diario: modifica propri"     on public.diary_entries;
drop policy if exists "Diario: cancellazione propri" on public.diary_entries;
create policy "Diario: lettura propri" on public.diary_entries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Diario: inserimento propri" on public.diary_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Diario: modifica propri" on public.diary_entries
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Diario: cancellazione propri" on public.diary_entries
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select on public.foods to anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select, insert, update, delete on public.diary_entries to authenticated;
grant select on public.diary_daily_totals to authenticated;

-- ---------------------------------------------------------------------
-- Ricerca full-text (italiano, senza accenti, prefissi + fallback trigram)
-- ---------------------------------------------------------------------
create or replace function public.search_foods(
  q              text    default '',
  max_oxalate    numeric default null,
  min_calcium    numeric default null,
  no_cholesterol boolean default false,
  food_category  text    default null,
  result_limit   int     default 50
)
returns setof public.foods
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  clean   text := trim(regexp_replace(lower(public.immutable_unaccent(coalesce(q, ''))), '[^a-z0-9 ]', ' ', 'g'));
  tsq     tsquery;
begin
  if clean <> '' then
    select to_tsquery('italian'::regconfig, string_agg(w || ':*', ' & '))
      into tsq
      from regexp_split_to_table(clean, '\s+') as w
     where w <> '';
  end if;

  return query
  select f.*
    from public.foods f
   where (tsq is null
          or f.search @@ tsq
          or extensions.similarity(public.immutable_unaccent(lower(f.name_it)), clean) > 0.3)
     and (max_oxalate   is null or f.oxalate_mg < max_oxalate)
     and (min_calcium   is null or f.calcium_mg > min_calcium)
     and (not coalesce(no_cholesterol, false) or f.cholesterol_mg = 0)
     and (food_category is null or f.category = food_category)
   order by
     case when tsq is null then 0 else ts_rank(f.search, tsq) end desc,
     case when clean = '' then 0
          else extensions.similarity(public.immutable_unaccent(lower(f.name_it)), clean) end desc,
     f.name_it
   limit least(greatest(coalesce(result_limit, 50), 1), 200);
end;
$$;

grant execute on function public.search_foods(text, numeric, numeric, boolean, text, int) to anon, authenticated;
