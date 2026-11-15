-- =====================================================================
-- NutriOssalati — collegamento alla lista Harvard e prodotti confezionati
--
-- 1. foods.oxalate_reference_id : la voce della lista Harvard (rev. nov 2023)
--    che descrive lo stesso alimento nello stesso stato. Serve alla scheda
--    alimento per mostrare "X mg per porzione · fascia" come dato della fonte.
--    Il collegamento è curato a mano: solo corrispondenze chiare (stesso
--    alimento, stesso stato di cottura). Non modifica foods.oxalate_mg.
-- 2. oxalate_reference : lettura pubblica delle SOLE voci collegate al catalogo.
-- 3. packaged_products : cache dei prodotti letti dal codice a barre
--    (Open Food Facts, licenza ODbL). Tenuta separata da foods: le etichette
--    non riportano gli ossalati, quindi questi prodotti non entrano nei calcoli.
--
-- Idempotente. I collegamenti veri e propri sono in supabase/seed_harvard_links.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Collegamento alimento → voce Harvard
-- ---------------------------------------------------------------------
alter table public.foods
  add column if not exists oxalate_reference_id bigint
    references public.oxalate_reference (id) on delete set null;

create index if not exists foods_oxalate_reference_idx on public.foods (oxalate_reference_id);

comment on column public.foods.oxalate_reference_id is
  'Voce della lista Harvard (mg per porzione) per lo stesso alimento e stato. NULL se non c''è una corrispondenza chiara.';

-- I collegamenti si caricano con supabase/seed_harvard_links.sql, DOPO la lista Harvard
-- (seed_oxalate_reference.sql): al momento della migrazione la lista può essere ancora vuota.

-- ---------------------------------------------------------------------
-- 2. Lista Harvard: lettura pubblica delle sole voci collegate al catalogo.
--    Le altre voci restano riservate al service role (agente).
-- ---------------------------------------------------------------------
drop policy if exists "Voci Harvard collegate al catalogo" on public.oxalate_reference;
create policy "Voci Harvard collegate al catalogo" on public.oxalate_reference
  for select to anon, authenticated
  using (exists (select 1 from public.foods f where f.oxalate_reference_id = oxalate_reference.id));

revoke all on public.oxalate_reference from anon, authenticated;
grant select on public.oxalate_reference to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Prodotti confezionati (codice a barre → Open Food Facts)
--    Tutti i nutrienti sono per 100 g (o 100 ml) e nullable: NULL = dato non
--    disponibile sull'etichetta. Nessuna colonna per gli ossalati.
-- ---------------------------------------------------------------------
create table if not exists public.packaged_products (
  barcode         text primary key check (barcode ~ '^[0-9]{8,14}$'),
  found           boolean not null default true,   -- false = codice cercato ma assente dalla banca dati
  name            text,
  brand           text,
  quantity        text,                            -- formato, es. "400 g"
  countries       text,
  ingredients     text,
  kcal            numeric(7,1) check (kcal >= 0),
  protein_g       numeric(6,2) check (protein_g >= 0),
  carbs_g         numeric(6,2) check (carbs_g >= 0),
  sugars_g        numeric(6,2) check (sugars_g >= 0),
  fat_g           numeric(6,2) check (fat_g >= 0),
  saturated_fat_g numeric(6,2) check (saturated_fat_g >= 0),
  fiber_g         numeric(6,2) check (fiber_g >= 0),
  sodium_mg       numeric(7,1) check (sodium_mg >= 0),
  calcium_mg      numeric(7,1) check (calcium_mg >= 0),
  cholesterol_mg  numeric(7,1) check (cholesterol_mg >= 0),
  source          text not null default 'Open Food Facts',
  source_url      text,
  fetched_at      timestamptz not null default now()
);

comment on table public.packaged_products is
  'Cache dei prodotti confezionati letti da Open Food Facts (ODbL). Lettura pubblica, scrittura solo service_role (Edge Function lookup-barcode).';

alter table public.packaged_products enable row level security;

drop policy if exists "Prodotti confezionati leggibili da tutti" on public.packaged_products;
create policy "Prodotti confezionati leggibili da tutti" on public.packaged_products
  for select to anon, authenticated using (true);
-- Nessuna policy di scrittura: solo service_role (bypassa RLS).

revoke all on public.packaged_products from anon, authenticated;
grant select on public.packaged_products to anon, authenticated;
grant select, insert, update, delete on public.packaged_products to service_role;

notify pgrst, 'reload schema';
