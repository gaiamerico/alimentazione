-- =====================================================================
-- NutriOssalati — le voci della lista Harvard come alimenti del catalogo
--
-- Da eseguire DOPO seed_oxalate_reference.sql, seed_oxalate_reference_it.sql,
-- seed_harvard_links.sql e la migrazione 20261118000000_harvard_catalog.sql.
--
-- Per ogni voce Harvard non ancora collegata a un alimento:
--   1. se in catalogo c'è un alimento con lo stesso nome, le due voci si uniscono
--      (l'alimento prende il collegamento, i suoi dati non cambiano);
--   2. altrimenti la voce entra nel catalogo con i soli dati della lista:
--      nome, categoria e collegamento. Nutrienti e ossalati per 100 g restano NULL
--      ("dato non disponibile"): li completa la ricerca online, dopo verifica.
-- Il dato della lista (mg per porzione) resta in oxalate_reference e non si riscala.
--
-- Idempotente: può essere rieseguito.
-- =====================================================================

-- 1. Stesso alimento già in catalogo: si collega, senza toccarne i valori.
update public.foods f
   set oxalate_reference_id = r.id
  from public.oxalate_reference r
 where f.oxalate_reference_id is null
   and r.name_it is not null
   and lower(public.immutable_unaccent(f.name_it)) = lower(public.immutable_unaccent(r.name_it))
   and not exists (select 1 from public.foods g where g.oxalate_reference_id = r.id);

-- 2. Voci senza corrispondenza: nuovi alimenti con i campi vuoti.
insert into public.foods (name_it, name_en, category, oxalate_source, oxalate_reference_id)
select
  r.name_it,
  r.name_en,
  case
    -- Eccezioni alla categoria della lista, per restare nelle categorie del catalogo.
    when r.name_en in ('Garlic powder') then 'Erbe e spezie'
    when r.name_en in ('Lima beans, boiled', 'Soybeans, green, boiled') then 'Legumi'
    when r.name_en in (
      'Danish / cinnamon roll', 'Sponge cake, filled', 'Donut', 'Apple pie', 'Chocolate chip dough',
      'Chocolate chip cookie', 'Snack / granola bar', 'Cookie, commercial', 'Blueberry muffin',
      'Cinnamon buns', 'Croissant', 'Bran muffin', 'Pancakes / waffles', 'French toast', 'Cake',
      'Sweet roll, reduced fat', 'Yellow cake w/ frosting', 'Brownie, homemade', 'Brownie, ready-to-eat'
    ) then 'Dolci e snack'
    else case r.category
      when 'Beans & Lentils'      then 'Legumi'
      when 'Beverages'            then 'Bevande'
      when 'Breads & Bakery'      then 'Cereali e derivati'
      when 'Cold Cereal'          then 'Cereali e derivati'
      when 'Fruits'               then 'Frutta'
      when 'Nuts & Seeds'         then 'Frutta secca e semi'
      when 'Pasta, Rice & Grains' then 'Cereali e derivati'
      when 'Snacks'               then 'Dolci e snack'
      when 'Vegetables'           then 'Verdure'
    end
  end,
  'Harvard T.H. Chan (mg per porzione)',
  r.id
from public.oxalate_reference r
where r.name_it is not null
  and not exists (select 1 from public.foods f where f.oxalate_reference_id = r.id)
on conflict (name_it) do nothing;

-- 3. Controllo: ogni voce Harvard deve avere il suo alimento.
do $$
declare
  orphans int;
begin
  select count(*) into orphans
    from public.oxalate_reference r
   where not exists (select 1 from public.foods f where f.oxalate_reference_id = r.id);
  if orphans > 0 then
    raise exception '% voci Harvard sono rimaste senza alimento (nome già usato da un altro alimento?)', orphans;
  end if;
end $$;
