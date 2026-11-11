-- =====================================================================
-- Alimenti aggiunti dalla ricerca online (Edge Function lookup-food).
-- La scrittura resta riservata al service role: l'Edge Function verifica
-- l'utente e inserisce con la service role key.
-- =====================================================================

alter table public.foods
  add column if not exists created_by uuid references auth.users (id) on delete set null;

comment on column public.foods.created_by is
  'Utente che ha aggiunto l''alimento tramite ricerca online (null = catalogo curato).';

-- Per il limite giornaliero di aggiunte per utente.
create index if not exists foods_created_by_idx on public.foods (created_by, created_at)
  where created_by is not null;
