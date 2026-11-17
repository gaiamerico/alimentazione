-- =====================================================================
-- NutriOssalati — revisione delle proposte dall'app, aperta a tutti gli utenti registrati
--
-- Per ora chiunque abbia un account può verificare le proposte dell'assistente
-- (pagina /verifica). Le scritture restano dietro funzioni security definer:
-- la tabella food_candidates non riceve policy di scrittura.
--   pending_food_candidates()          elenco "da_verificare" con i valori attuali
--                                      dell'alimento da completare (se c'è)
--   review_food_candidate(id, ok, note) approva (via approve_food_candidate) o rifiuta,
--                                      registrando chi ha deciso (reviewed_by)
-- Idempotente: può essere rieseguita.
-- =====================================================================

alter table public.food_candidates
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null;

comment on column public.food_candidates.reviewed_by is
  'Utente che ha approvato o rifiutato la proposta dall''app. NULL se decisa da riga di comando.';

-- ---------------------------------------------------------------------
-- Elenco delle proposte da verificare
-- ---------------------------------------------------------------------
create or replace function public.pending_food_candidates()
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(c) - 'requested_by' - 'reviewed_by' - 'query_norm'
         || jsonb_build_object(
              'target',
              case when f.id is null then null else jsonb_build_object(
                'id', f.id, 'name_it', f.name_it,
                'kcal', f.kcal, 'protein_g', f.protein_g, 'carbs_g', f.carbs_g, 'fat_g', f.fat_g,
                'fiber_g', f.fiber_g, 'calcium_mg', f.calcium_mg, 'cholesterol_mg', f.cholesterol_mg,
                'oxalate_mg', f.oxalate_mg, 'saturated_fat_g', f.saturated_fat_g,
                'sugars_g', f.sugars_g, 'sodium_mg', f.sodium_mg
              ) end)
    from public.food_candidates c
    left join public.foods f on f.id = c.target_food_id
   where c.status = 'da_verificare'
     and (select auth.uid()) is not null
   order by c.created_at;
$$;

revoke all on function public.pending_food_candidates() from public, anon;
grant execute on function public.pending_food_candidates() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Decisione
-- ---------------------------------------------------------------------
create or replace function public.review_food_candidate(candidate_id bigint, approve boolean, note text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid    uuid := (select auth.uid());
  result bigint;
begin
  if uid is null then
    raise exception 'Accedi per verificare le proposte';
  end if;
  if note is not null and char_length(note) > 500 then
    raise exception 'La nota può avere al massimo 500 caratteri';
  end if;

  if approve then
    result := public.approve_food_candidate(candidate_id, nullif(btrim(note), ''));
  else
    update public.food_candidates
       set status = 'rifiutato', review_note = nullif(btrim(note), ''), reviewed_at = now()
     where id = candidate_id and status = 'da_verificare'
    returning id into result;
    if result is null then
      raise exception 'La proposta % non è più da verificare', candidate_id;
    end if;
    result := null;
  end if;

  update public.food_candidates set reviewed_by = uid where id = candidate_id;
  return result;
end;
$$;

revoke all on function public.review_food_candidate(bigint, boolean, text) from public, anon;
grant execute on function public.review_food_candidate(bigint, boolean, text) to authenticated, service_role;

notify pgrst, 'reload schema';
