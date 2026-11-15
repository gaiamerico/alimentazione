-- =====================================================================
-- NutriOssalati — collegamento degli alimenti del catalogo alle voci Harvard
--
-- Da eseguire DOPO seed.sql, seed_oxalate_reference.sql e la migrazione
-- 20261117000000_harvard_link_packaged_products.sql (colonna oxalate_reference_id).
--
-- Collegamento curato a mano: solo corrispondenze chiare (stesso alimento, stesso
-- stato). Serve alla scheda alimento per mostrare il dato della lista Harvard
-- (mg per porzione e fascia). Non modifica foods.oxalate_mg.
-- Idempotente: può essere rieseguito.
-- =====================================================================

update public.foods f
   set oxalate_reference_id = r.id
  from (values
    ('Spinaci crudi',                'Spinach, raw'),
    ('Spinaci cotti',                'Spinach, boiled'),
    ('Patata al forno con buccia',   'Potato, baked, w/ skin'),
    ('Patata dolce cotta',           'Sweet potato, baked'),
    ('Carota cruda',                 'Carrots, raw'),
    ('Cavolo riccio',                'Kale, raw'),
    ('Cavoletti di Bruxelles',       'Brussels sprouts, boiled'),
    ('Rucola',                       'Arugula, raw'),
    ('Pomodoro',                     'Tomato, red ripe'),
    ('Peperone rosso',               'Red peppers, raw'),
    ('Cetriolo',                     'Cucumber, w/ peel'),
    ('Cipolla',                      'Onion, raw'),
    ('Aglio',                        'Garlic, raw'),
    ('Sedano',                       'Celery, raw'),
    ('Funghi champignon',            'Mushrooms, white, raw'),
    ('Fagiolini',                    'Green beans, boiled'),
    ('Mais dolce',                   'Corn kernels, boiled'),
    ('Prezzemolo fresco',            'Parsley, raw'),
    ('Mela con buccia',              'Apple, w/ skin'),
    ('Pera',                         'Pears, raw'),
    ('Banana',                       'Banana, raw'),
    ('Arancia',                      'Orange, raw'),
    ('Fragole',                      'Strawberries, raw'),
    ('Lamponi',                      'Raspberries, raw'),
    ('Mirtilli',                     'Blueberries'),
    ('Datteri secchi',               'Dates'),
    ('Fichi secchi',                 'Figs, dried'),
    ('Uva',                          'Grapes, seedless'),
    ('Pesca',                        'Peaches, raw'),
    ('Albicocca',                    'Apricots, raw'),
    ('Avocado',                      'Avocado'),
    ('Ananas',                       'Pineapple, raw'),
    ('Mango',                        'Mango, raw'),
    ('Anguria',                      'Watermelon'),
    ('Melone',                       'Cantaloupe'),
    ('Prugne secche',                'Prunes, dried'),
    ('Succo di limone',              'Lemon juice, raw'),
    ('Arachidi tostate',             'Peanuts, dry roasted'),
    ('Burro di arachidi',            'Peanut butter'),
    ('Noci',                         'Walnuts'),
    ('Pistacchi',                    'Pistachios'),
    ('Tahina (crema di sesamo)',     'Tahini (sesame butter)'),
    ('Semi di girasole',             'Sunflower seeds, dried'),
    ('Fagioli neri cotti',           'Black beans'),
    ('Lenticchie cotte',             'Lentils, boiled'),
    ('Piselli cotti',                'Peas, green, boiled'),
    ('Hummus',                       'Hummus'),
    ('Pasta di semola cotta',        'Spaghetti'),
    ('Pasta integrale cotta',        'Whole wheat spaghetti'),
    ('Riso bianco cotto',            'White rice'),
    ('Riso integrale cotto',         'Brown rice'),
    ('Pane integrale',               'Whole wheat bread'),
    ('Crusca di frumento',           'Wheat bran, crude'),
    ('Quinoa cotta',                 'Quinoa'),
    ('Grano saraceno cotto',         'Buckwheat groats'),
    ('Couscous cotto',               'Couscous'),
    ('Tè nero (infuso)',             'Tea, brewed'),
    ('Tè verde (infuso)',            'Green tea, unsweet'),
    ('Birra',                        'Beer / hard cider'),
    ('Vino rosso',                   'Red wine'),
    ('Patatine fritte',              'French fries, frozen'),
    ('Patatine in busta',            'Potato chips')
  ) as m(food_name_it, harvard_name_en)
  join public.oxalate_reference r on r.name_en = m.harvard_name_en
 where f.name_it = m.food_name_it;
