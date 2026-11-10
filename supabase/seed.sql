-- =====================================================================
-- NutriOssalati — seed alimenti (valori per 100 g di parte edibile)
--
-- Nutrienti: USDA FoodData Central (SR Legacy / Foundation) e tabelle CREA
--            (colonna nsrc: 'U' = USDA, 'C' = CREA), valori arrotondati.
-- Ossalati:  stime derivate dalla lista Harvard T.H. Chan School of Public
--            Health (mg per porzione → riscalati a 100 g) e confrontate con
--            Oxalate.org / Oxalosis & Hyperoxaluria Foundation (OHF).
--            Il contenuto reale varia molto (varietà, terreno, cottura):
--            la colonna oxalate_confidence esprime l'affidabilità della stima.
--
-- Lo script è idempotente: può essere rieseguito (upsert su name_it).
-- Per aggiornare i nutrienti da USDA FDC usa scripts/import-usda.mjs.
-- =====================================================================

insert into public.foods (
  name_it, name_en, category, synonyms,
  kcal, protein_g, carbs_g, fat_g, fiber_g,
  calcium_mg, cholesterol_mg, oxalate_mg, oxalate_confidence,
  default_portion_g, portion_label, nutrient_source, oxalate_source, notes
)
select
  v.name_it, v.name_en, v.category, v.synonyms,
  v.kcal, v.prot, v.carb, v.fat, v.fib,
  v.ca, v.chol, v.ox, v.conf,
  v.portion_g, v.portion_label,
  case v.nsrc when 'C' then 'CREA – Tabelle di composizione degli alimenti'
              else 'USDA FoodData Central' end,
  case
    when v.category in ('Latte e derivati', 'Uova', 'Carne', 'Pesce')
      then 'Trascurabile (alimento di origine animale)'
    when v.conf = 'bassa'
      then 'Stima da letteratura (Oxalate.org / OHF)'
    else 'Harvard T.H. Chan (porzione riscalata a 100 g)'
  end,
  v.notes
from (values
  -- name_it, name_en, category, synonyms, kcal, prot, carb, fat, fib, ca, chol, ox, conf, portion_g, portion_label, nsrc, notes

  -- ---------------- VERDURE ----------------
  ('Spinaci crudi', 'Spinach, raw', 'Verdure', 'spinacio, spinacino, baby spinach', 23, 2.9, 3.6, 0.4, 2.2, 99, 0, 970, 'alta', 30, '1 tazza', 'U', 'Tra gli alimenti più ricchi di ossalati: il calcio presente è quasi tutto legato e poco assorbibile.'),
  ('Spinaci cotti', 'Spinach, cooked, boiled, drained', 'Verdure', 'spinaci lessati, spinaci surgelati', 23, 3.0, 3.8, 0.3, 2.4, 136, 0, 750, 'alta', 90, '½ tazza', 'U', 'La bollitura con scolatura riduce parte degli ossalati solubili.'),
  ('Bietola da coste cruda', 'Chard, swiss, raw', 'Verdure', 'bieta, biete, coste, erbette', 19, 1.8, 3.7, 0.2, 1.6, 51, 0, 645, 'alta', 36, '1 tazza', 'U', null),
  ('Bietola cotta', 'Chard, swiss, cooked, boiled', 'Verdure', 'bieta lessata, erbette cotte', 20, 1.9, 4.1, 0.1, 2.1, 58, 0, 560, 'media', 88, '½ tazza', 'U', null),
  ('Rabarbaro', 'Rhubarb, raw', 'Verdure', null, 21, 0.9, 4.5, 0.2, 1.8, 86, 0, 500, 'media', 120, '½ tazza', 'U', null),
  ('Barbabietola rossa cotta', 'Beets, cooked, boiled, drained', 'Verdure', 'rapa rossa, barbabietole', 44, 1.7, 10.0, 0.2, 2.0, 16, 0, 90, 'alta', 85, '½ tazza', 'U', null),
  ('Foglie di barbabietola cotte', 'Beet greens, cooked, boiled', 'Verdure', 'cime di barbabietola', 27, 2.6, 5.5, 0.2, 2.9, 114, 0, 610, 'media', 72, '½ tazza', 'U', null),
  ('Okra cotta', 'Okra, cooked, boiled', 'Verdure', 'gombo', 22, 1.9, 4.5, 0.2, 2.5, 77, 0, 71, 'media', 80, '½ tazza', 'U', null),
  ('Patata al forno con buccia', 'Potatoes, baked, flesh and skin', 'Verdure', 'patate al forno', 93, 2.5, 21.2, 0.1, 2.2, 15, 0, 56, 'alta', 173, '1 patata media', 'U', 'Buona parte degli ossalati è nella buccia.'),
  ('Patata lessa senza buccia', 'Potatoes, boiled, cooked without skin', 'Verdure', 'patate lesse, purè', 86, 1.7, 20.0, 0.1, 1.8, 8, 0, 20, 'media', 150, '1 patata', 'U', null),
  ('Patata dolce cotta', 'Sweet potato, cooked, baked in skin', 'Verdure', 'patata americana, batata', 90, 2.0, 20.7, 0.2, 3.3, 38, 0, 14, 'media', 200, '1 tazza', 'U', null),
  ('Carota cruda', 'Carrots, raw', 'Verdure', 'carote', 41, 0.9, 9.6, 0.2, 2.8, 33, 0, 16, 'media', 61, '1 carota media', 'U', null),
  ('Broccoli', 'Broccoli, raw', 'Verdure', 'cime di broccolo, broccolo', 34, 2.8, 6.6, 0.4, 2.6, 47, 0, 2, 'alta', 91, '1 tazza', 'U', 'Verdura a basso ossalato con calcio ben assorbibile.'),
  ('Cavolfiore', 'Cauliflower, raw', 'Verdure', null, 25, 1.9, 5.0, 0.3, 2.0, 22, 0, 1, 'alta', 100, '1 tazza', 'U', null),
  ('Cavolo cappuccio', 'Cabbage, raw', 'Verdure', 'verza, cavolo', 25, 1.3, 5.8, 0.1, 2.5, 40, 0, 1, 'alta', 89, '1 tazza', 'U', null),
  ('Cavolo riccio', 'Kale, raw', 'Verdure', 'kale, cavolo nero, cavolo toscano', 49, 4.3, 8.8, 0.9, 3.6, 150, 0, 5, 'media', 67, '1 tazza', 'U', 'Ottima fonte di calcio vegetale a basso ossalato.'),
  ('Cavoletti di Bruxelles', 'Brussels sprouts, cooked, boiled', 'Verdure', 'cavolini', 36, 2.6, 7.1, 0.5, 2.6, 36, 0, 6, 'media', 78, '½ tazza', 'U', null),
  ('Rucola', 'Arugula, raw', 'Verdure', 'ruchetta', 25, 2.6, 3.7, 0.7, 1.6, 160, 0, 1, 'bassa', 20, '1 tazza', 'U', null),
  ('Lattuga', 'Lettuce, green leaf, raw', 'Verdure', 'insalata, lattughino, iceberg', 15, 1.4, 2.9, 0.2, 1.3, 36, 0, 1, 'alta', 36, '1 tazza', 'U', null),
  ('Pomodoro', 'Tomatoes, red, ripe, raw', 'Verdure', 'pomodori, pomodorini, ciliegino', 18, 0.9, 3.9, 0.2, 1.2, 10, 0, 5, 'alta', 123, '1 pomodoro medio', 'U', null),
  ('Passata di pomodoro', 'Tomato puree, canned', 'Verdure', 'salsa di pomodoro, sugo, pelati', 38, 1.7, 9.0, 0.2, 1.9, 18, 0, 7, 'media', 125, '½ tazza', 'U', null),
  ('Zucchina', 'Squash, summer, zucchini, raw', 'Verdure', 'zucchine', 17, 1.2, 3.1, 0.3, 1.0, 16, 0, 2, 'media', 124, '1 zucchina', 'U', null),
  ('Melanzana', 'Eggplant, raw', 'Verdure', 'melanzane', 25, 1.0, 5.9, 0.2, 3.0, 9, 0, 10, 'bassa', 82, '1 tazza', 'U', null),
  ('Peperone rosso', 'Peppers, sweet, red, raw', 'Verdure', 'peperoni, peperone giallo', 31, 1.0, 6.0, 0.3, 2.1, 7, 0, 3, 'media', 119, '1 peperone', 'U', null),
  ('Cetriolo', 'Cucumber, with peel, raw', 'Verdure', 'cetrioli', 15, 0.7, 3.6, 0.1, 0.5, 16, 0, 1, 'alta', 100, '½ cetriolo', 'U', null),
  ('Cipolla', 'Onions, raw', 'Verdure', 'cipolle, scalogno', 40, 1.1, 9.3, 0.1, 1.7, 23, 0, 3, 'media', 110, '1 cipolla media', 'U', null),
  ('Aglio', 'Garlic, raw', 'Verdure', null, 149, 6.4, 33.1, 0.5, 2.1, 181, 0, 10, 'bassa', 3, '1 spicchio', 'U', null),
  ('Asparagi', 'Asparagus, raw', 'Verdure', 'asparago', 20, 2.2, 3.9, 0.1, 2.1, 24, 0, 5, 'media', 134, '1 tazza', 'U', null),
  ('Carciofo cotto', 'Artichokes, cooked, boiled', 'Verdure', 'carciofi', 53, 2.9, 11.9, 0.3, 8.6, 21, 0, 46, 'media', 120, '1 carciofo medio', 'U', null),
  ('Sedano', 'Celery, raw', 'Verdure', 'coste di sedano', 14, 0.7, 3.0, 0.2, 1.6, 40, 0, 10, 'bassa', 40, '1 gambo', 'U', null),
  ('Funghi champignon', 'Mushrooms, white, raw', 'Verdure', 'funghi, champignon', 22, 3.1, 3.3, 0.3, 1.0, 3, 0, 2, 'media', 70, '1 tazza', 'U', null),
  ('Fagiolini', 'Beans, snap, green, cooked, boiled', 'Verdure', 'cornetti, tegoline', 35, 1.9, 7.9, 0.3, 3.2, 44, 0, 15, 'media', 62, '½ tazza', 'U', null),
  ('Finocchio', 'Fennel, bulb, raw', 'Verdure', 'finocchi', 31, 1.2, 7.3, 0.2, 3.1, 49, 0, 5, 'bassa', 87, '1 tazza', 'U', null),
  ('Zucca', 'Pumpkin, raw', 'Verdure', 'zucca gialla', 26, 1.0, 6.5, 0.1, 0.5, 21, 0, 3, 'bassa', 116, '1 tazza', 'U', null),
  ('Mais dolce', 'Corn, sweet, yellow, cooked, boiled', 'Verdure', 'mais, granoturco, pannocchia', 96, 3.4, 21.0, 1.5, 2.4, 3, 0, 4, 'media', 100, '1 pannocchia', 'U', null),

  -- ---------------- ERBE E SPEZIE ----------------
  ('Prezzemolo fresco', 'Parsley, fresh', 'Erbe e spezie', 'prezzemolo', 36, 3.0, 6.3, 0.8, 3.3, 138, 0, 1700, 'media', 4, '1 cucchiaio tritato', 'U', 'Molto ricco per 100 g, ma le quantità usate sono minime.'),
  ('Cannella in polvere', 'Spices, cinnamon, ground', 'Erbe e spezie', 'cannella', 247, 4.0, 80.6, 1.2, 53.1, 1002, 0, 1900, 'bassa', 2.6, '1 cucchiaino', 'U', 'Contenuto molto variabile tra cannella Cassia e di Ceylon.'),

  -- ---------------- FRUTTA ----------------
  ('Mela con buccia', 'Apples, raw, with skin', 'Frutta', 'mele, mela', 52, 0.3, 13.8, 0.2, 2.4, 6, 0, 1, 'alta', 180, '1 mela media', 'U', null),
  ('Pera', 'Pears, raw', 'Frutta', 'pere', 57, 0.4, 15.2, 0.1, 3.1, 9, 0, 2, 'media', 178, '1 pera', 'U', null),
  ('Banana', 'Bananas, raw', 'Frutta', 'banane', 89, 1.1, 22.8, 0.3, 2.6, 5, 0, 3, 'alta', 118, '1 banana media', 'U', null),
  ('Arancia', 'Oranges, raw, all commercial varieties', 'Frutta', 'arance, agrumi', 47, 0.9, 11.8, 0.1, 2.4, 40, 0, 22, 'media', 131, '1 arancia', 'U', null),
  ('Kiwi', 'Kiwifruit, green, raw', 'Frutta', null, 61, 1.1, 14.7, 0.5, 3.0, 34, 0, 16, 'media', 76, '1 kiwi', 'U', null),
  ('Fragole', 'Strawberries, raw', 'Frutta', 'fragola', 32, 0.7, 7.7, 0.3, 2.0, 16, 0, 3, 'alta', 72, '½ tazza', 'U', null),
  ('Lamponi', 'Raspberries, raw', 'Frutta', 'lampone', 52, 1.2, 11.9, 0.7, 6.5, 25, 0, 39, 'alta', 123, '1 tazza', 'U', null),
  ('Mirtilli', 'Blueberries, raw', 'Frutta', 'mirtillo', 57, 0.7, 14.5, 0.3, 2.4, 6, 0, 4, 'media', 148, '1 tazza', 'U', null),
  ('More', 'Blackberries, raw', 'Frutta', 'mora, more di rovo', 43, 1.4, 9.6, 0.5, 5.3, 29, 0, 12, 'media', 144, '1 tazza', 'U', null),
  ('Datteri secchi', 'Dates, deglet noor', 'Frutta', 'dattero, datteri', 282, 2.5, 75.0, 0.4, 8.0, 39, 0, 100, 'media', 24, '1 dattero', 'U', null),
  ('Fichi secchi', 'Figs, dried, uncooked', 'Frutta', 'fichi', 249, 3.3, 63.9, 0.9, 9.8, 162, 0, 24, 'bassa', 40, '2 fichi', 'U', null),
  ('Uva', 'Grapes, red or green, raw', 'Frutta', 'uva bianca, uva nera', 69, 0.7, 18.1, 0.2, 0.9, 10, 0, 1, 'alta', 150, '1 grappolo piccolo', 'U', null),
  ('Pesca', 'Peaches, yellow, raw', 'Frutta', 'pesche, nettarina', 39, 0.9, 9.5, 0.3, 1.5, 6, 0, 1, 'media', 150, '1 pesca', 'U', null),
  ('Albicocca', 'Apricots, raw', 'Frutta', 'albicocche', 48, 1.4, 11.1, 0.4, 2.0, 13, 0, 1, 'media', 35, '1 albicocca', 'U', null),
  ('Avocado', 'Avocados, raw, all commercial varieties', 'Frutta', null, 160, 2.0, 8.5, 14.7, 6.7, 12, 0, 10, 'media', 150, '1 avocado piccolo', 'U', null),
  ('Ananas', 'Pineapple, raw', 'Frutta', null, 50, 0.5, 13.1, 0.1, 1.4, 13, 0, 2, 'media', 165, '1 tazza', 'U', null),
  ('Mango', 'Mangos, raw', 'Frutta', null, 60, 0.8, 15.0, 0.4, 1.6, 11, 0, 1, 'media', 165, '1 tazza', 'U', null),
  ('Anguria', 'Watermelon, raw', 'Frutta', 'cocomero', 30, 0.6, 7.6, 0.2, 0.4, 7, 0, 1, 'alta', 280, '1 fetta', 'U', null),
  ('Melone', 'Melons, cantaloupe, raw', 'Frutta', 'melone giallo', 34, 0.8, 8.2, 0.2, 0.9, 9, 0, 1, 'alta', 160, '1 fetta', 'U', null),
  ('Prugne secche', 'Plums, dried (prunes), uncooked', 'Frutta', 'prugne', 240, 2.2, 63.9, 0.4, 7.1, 43, 0, 11, 'bassa', 40, '4 prugne', 'U', null),
  ('Succo di limone', 'Lemon juice, raw', 'Frutta', 'limone', 22, 0.4, 6.9, 0.2, 0.3, 6, 0, 1, 'media', 15, '1 cucchiaio', 'U', 'Il citrato del limone è un inibitore della formazione di calcoli.'),

  -- ---------------- FRUTTA SECCA E SEMI ----------------
  ('Mandorle', 'Nuts, almonds', 'Frutta secca e semi', 'mandorla, farina di mandorle', 579, 21.2, 21.6, 49.9, 12.5, 269, 0, 435, 'alta', 28, '22 mandorle (28 g)', 'U', null),
  ('Anacardi', 'Nuts, cashew nuts, raw', 'Frutta secca e semi', 'anacardo', 553, 18.2, 30.2, 43.9, 3.3, 37, 0, 175, 'alta', 28, '18 anacardi (28 g)', 'U', null),
  ('Arachidi tostate', 'Peanuts, all types, dry-roasted', 'Frutta secca e semi', 'noccioline, arachidi', 585, 24.4, 21.3, 49.7, 8.0, 54, 0, 96, 'media', 28, '1 manciata (28 g)', 'U', null),
  ('Burro di arachidi', 'Peanut butter, smooth style', 'Frutta secca e semi', 'crema di arachidi', 588, 25.1, 19.6, 50.4, 6.0, 43, 0, 41, 'media', 32, '2 cucchiai', 'U', null),
  ('Noci', 'Nuts, english walnuts', 'Frutta secca e semi', 'noce, gherigli', 654, 15.2, 13.7, 65.2, 6.7, 98, 0, 62, 'media', 28, '7 noci', 'U', null),
  ('Nocciole', 'Nuts, hazelnuts or filberts', 'Frutta secca e semi', 'nocciola', 628, 15.0, 16.7, 60.8, 9.7, 114, 0, 167, 'bassa', 28, '20 nocciole', 'U', null),
  ('Pistacchi', 'Nuts, pistachio nuts, raw', 'Frutta secca e semi', 'pistacchio', 562, 20.2, 27.2, 45.3, 10.6, 105, 0, 50, 'media', 28, '49 pistacchi', 'U', null),
  ('Tahina (crema di sesamo)', 'Seeds, sesame butter, tahini', 'Frutta secca e semi', 'tahini, sesamo', 595, 17.0, 21.2, 53.8, 9.3, 426, 0, 153, 'media', 30, '2 cucchiai', 'U', null),
  ('Semi di girasole', 'Seeds, sunflower seed kernels, dried', 'Frutta secca e semi', 'girasole', 584, 20.8, 20.0, 51.5, 8.6, 78, 0, 20, 'media', 35, '¼ di tazza', 'U', null),

  -- ---------------- LEGUMI ----------------
  ('Fagioli cannellini cotti', 'Beans, white, mature seeds, cooked, boiled', 'Legumi', 'fagioli bianchi, fagioli', 139, 9.7, 25.1, 0.4, 6.3, 90, 0, 75, 'media', 90, '½ tazza', 'U', null),
  ('Fagioli borlotti cotti', 'Beans, cranberry (roman), mature seeds, cooked, boiled', 'Legumi', 'fagioli, borlotti', 136, 9.3, 24.5, 0.5, 8.6, 50, 0, 70, 'bassa', 90, '½ tazza', 'U', null),
  ('Fagioli neri cotti', 'Beans, black, mature seeds, cooked, boiled', 'Legumi', 'fagioli', 132, 8.9, 23.7, 0.5, 8.7, 27, 0, 40, 'bassa', 86, '½ tazza', 'U', null),
  ('Lenticchie cotte', 'Lentils, mature seeds, cooked, boiled', 'Legumi', 'lenticchia', 116, 9.0, 20.1, 0.4, 7.9, 19, 0, 4, 'media', 198, '1 tazza', 'U', null),
  ('Ceci cotti', 'Chickpeas (garbanzo beans), mature seeds, cooked, boiled', 'Legumi', 'cece', 164, 8.9, 27.4, 2.6, 7.6, 49, 0, 9, 'media', 164, '1 tazza', 'U', null),
  ('Piselli cotti', 'Peas, green, cooked, boiled', 'Legumi', 'pisellini', 84, 5.4, 15.6, 0.2, 5.5, 27, 0, 1, 'media', 80, '½ tazza', 'U', null),
  ('Hummus', 'Hummus, commercial', 'Legumi', 'crema di ceci', 166, 7.9, 14.3, 9.6, 6.0, 38, 0, 53, 'media', 30, '2 cucchiai', 'U', null),
  ('Tofu (con solfato di calcio)', 'Tofu, firm, prepared with calcium sulfate', 'Legumi', 'tofu, soia', 144, 17.3, 2.8, 8.7, 2.3, 683, 0, 13, 'media', 100, '1 porzione', 'U', 'Il calcio dipende dal coagulante: verifica in etichetta.'),

  -- ---------------- CEREALI E DERIVATI ----------------
  ('Pasta di semola cotta', 'Pasta, cooked, enriched, without added salt', 'Cereali e derivati', 'spaghetti, penne, maccheroni, fusilli', 158, 5.8, 30.9, 0.9, 1.8, 7, 0, 8, 'alta', 180, '1 piatto (80 g a crudo)', 'U', null),
  ('Pasta integrale cotta', 'Pasta, whole-wheat, cooked', 'Cereali e derivati', 'spaghetti integrali', 149, 6.0, 30.1, 1.7, 3.9, 18, 0, 17, 'bassa', 180, '1 piatto (80 g a crudo)', 'U', null),
  ('Riso bianco cotto', 'Rice, white, long-grain, regular, cooked', 'Cereali e derivati', 'riso, risotto, riso basmati', 130, 2.7, 28.2, 0.3, 0.4, 10, 0, 2, 'alta', 158, '1 tazza', 'U', null),
  ('Riso integrale cotto', 'Rice, brown, long-grain, cooked', 'Cereali e derivati', 'riso', 123, 2.7, 25.6, 1.0, 1.6, 3, 0, 12, 'bassa', 158, '1 tazza', 'U', null),
  ('Pane comune', 'Bread, Italian', 'Cereali e derivati', 'pane bianco, rosetta, pagnotta, baguette', 275, 8.6, 57.0, 1.0, 3.0, 20, 0, 13, 'media', 50, '1 fetta media', 'C', null),
  ('Pane integrale', 'Bread, whole-wheat, commercially prepared', 'Cereali e derivati', 'pane di farina integrale', 250, 8.9, 48.0, 1.5, 6.5, 28, 0, 20, 'media', 50, '1 fetta media', 'C', null),
  ('Fette biscottate', 'Toast, crispbread', 'Cereali e derivati', 'pane tostato', 410, 11.0, 82.0, 6.0, 3.5, 30, 0, 15, 'bassa', 10, '1 fetta', 'C', null),
  ('Fiocchi d''avena', 'Cereals, oats, regular and quick, not fortified, dry', 'Cereali e derivati', 'avena, porridge', 379, 13.2, 67.7, 6.5, 10.1, 52, 0, 20, 'bassa', 40, '½ tazza', 'U', null),
  ('Crusca di frumento', 'Wheat bran, crude', 'Cereali e derivati', 'crusca, all bran', 216, 15.6, 64.5, 4.3, 42.8, 73, 0, 450, 'media', 15, '2 cucchiai', 'U', null),
  ('Farina integrale di frumento', 'Wheat flour, whole-grain', 'Cereali e derivati', 'farina integrale', 340, 13.2, 72.0, 2.5, 10.7, 34, 0, 70, 'bassa', 30, '3 cucchiai', 'U', null),
  ('Quinoa cotta', 'Quinoa, cooked', 'Cereali e derivati', null, 120, 4.4, 21.3, 1.9, 2.8, 17, 0, 40, 'bassa', 185, '1 tazza', 'U', null),
  ('Grano saraceno cotto', 'Buckwheat groats, roasted, cooked', 'Cereali e derivati', 'saraceno', 92, 3.4, 19.9, 0.6, 2.7, 7, 0, 79, 'media', 168, '1 tazza', 'U', null),
  ('Couscous cotto', 'Couscous, cooked', 'Cereali e derivati', 'cous cous', 112, 3.8, 23.2, 0.2, 1.4, 8, 0, 6, 'bassa', 157, '1 tazza', 'U', null),
  ('Polenta', 'Cornmeal, yellow, cooked (polenta)', 'Cereali e derivati', 'farina di mais', 70, 1.6, 15.0, 0.3, 1.0, 1, 0, 10, 'bassa', 200, '1 porzione', 'C', null),
  ('Pizza margherita', 'Pizza, cheese topping, regular crust', 'Cereali e derivati', 'pizza', 266, 11.4, 33.3, 9.7, 2.3, 188, 17, 10, 'bassa', 300, '1 pizza (300 g)', 'U', null),

  -- ---------------- LATTE E DERIVATI ----------------
  ('Latte intero', 'Milk, whole, 3.25% milkfat', 'Latte e derivati', 'latte vaccino', 64, 3.3, 4.9, 3.6, 0, 119, 11, 0, 'alta', 250, '1 tazza', 'C', null),
  ('Latte parzialmente scremato', 'Milk, reduced fat, fluid, 2% milkfat', 'Latte e derivati', 'latte ps', 46, 3.5, 5.0, 1.5, 0, 120, 7, 0, 'alta', 250, '1 tazza', 'C', null),
  ('Latte scremato', 'Milk, nonfat, fluid', 'Latte e derivati', 'latte magro', 36, 3.6, 5.3, 0.2, 0, 125, 2, 0, 'alta', 250, '1 tazza', 'C', null),
  ('Yogurt bianco intero', 'Yogurt, plain, whole milk', 'Latte e derivati', 'yogurt naturale', 66, 3.8, 4.3, 3.9, 0, 125, 11, 0, 'alta', 125, '1 vasetto', 'C', null),
  ('Yogurt greco 0%', 'Yogurt, Greek, plain, nonfat', 'Latte e derivati', 'yogurt greco magro', 59, 10.3, 3.6, 0.4, 0, 110, 5, 0, 'alta', 170, '1 vasetto', 'U', null),
  ('Kefir', 'Kefir, lowfat, plain', 'Latte e derivati', null, 41, 3.8, 4.5, 1.0, 0, 130, 5, 0, 'alta', 200, '1 bicchiere', 'U', null),
  ('Parmigiano Reggiano', 'Cheese, parmesan, hard', 'Latte e derivati', 'parmigiano, formaggio grattugiato', 387, 33.5, 0, 28.1, 0, 1159, 91, 0, 'alta', 10, '1 cucchiaio grattugiato', 'C', 'Concentrato di calcio: ottimo da abbinare ad alimenti ricchi di ossalati.'),
  ('Grana Padano', 'Cheese, parmesan, hard', 'Latte e derivati', 'grana, formaggio grattugiato', 398, 33.0, 0, 28.5, 0, 1165, 98, 0, 'alta', 10, '1 cucchiaio grattugiato', 'C', null),
  ('Pecorino Romano', 'Cheese, romano', 'Latte e derivati', 'pecorino', 387, 25.5, 0.2, 32.0, 0, 1064, 90, 0, 'alta', 10, '1 cucchiaio grattugiato', 'C', null),
  ('Mozzarella di vacca', 'Cheese, mozzarella, whole milk', 'Latte e derivati', 'fior di latte, mozzarella', 253, 18.7, 0.7, 19.5, 0, 160, 46, 0, 'alta', 100, '1 mozzarella piccola', 'C', null),
  ('Mozzarella di bufala', 'Cheese, mozzarella, buffalo milk', 'Latte e derivati', 'bufala', 288, 16.7, 0.4, 24.4, 0, 210, 64, 0, 'alta', 125, '1 mozzarella', 'C', null),
  ('Ricotta vaccina', 'Cheese, ricotta, whole milk', 'Latte e derivati', 'ricotta', 146, 8.8, 3.5, 10.9, 0, 295, 57, 0, 'alta', 100, '1 porzione', 'C', null),
  ('Emmental', 'Cheese, swiss', 'Latte e derivati', 'emmentaler, groviera', 380, 27.0, 5.4, 27.8, 0, 890, 93, 0, 'alta', 30, '1 fetta', 'U', null),
  ('Gorgonzola', 'Cheese, blue', 'Latte e derivati', 'formaggio erborinato', 324, 19.1, 0, 27.1, 0, 612, 70, 0, 'alta', 40, '1 porzione', 'C', null),
  ('Panna da cucina', 'Cream, fluid, light (coffee cream or table cream)', 'Latte e derivati', 'panna', 195, 2.7, 3.7, 19.3, 0, 96, 66, 0, 'alta', 30, '2 cucchiai', 'U', null),
  ('Gelato fior di latte', 'Ice creams, vanilla', 'Latte e derivati', 'gelato', 207, 3.5, 23.6, 11.0, 0.7, 128, 44, 0, 'media', 100, '1 coppetta', 'U', null),

  -- ---------------- UOVA ----------------
  ('Uovo intero', 'Egg, whole, raw, fresh', 'Uova', 'uova, uovo di gallina', 143, 12.6, 0.7, 9.5, 0, 56, 372, 0, 'alta', 50, '1 uovo medio', 'U', null),
  ('Tuorlo d''uovo', 'Egg, yolk, raw, fresh', 'Uova', 'rosso d''uovo', 322, 15.9, 3.6, 26.5, 0, 129, 1085, 0, 'alta', 17, '1 tuorlo', 'U', 'Concentra quasi tutto il colesterolo dell''uovo.'),
  ('Albume d''uovo', 'Egg, white, raw, fresh', 'Uova', 'chiara d''uovo, bianco d''uovo', 52, 10.9, 0.7, 0.2, 0, 7, 0, 0, 'alta', 33, '1 albume', 'U', null),

  -- ---------------- CARNE ----------------
  ('Petto di pollo', 'Chicken, broiler, breast, meat only, raw', 'Carne', 'pollo, fesa di pollo', 120, 22.5, 0, 2.6, 0, 5, 73, 0, 'alta', 150, '1 petto', 'U', null),
  ('Petto di tacchino', 'Turkey, breast, meat only, raw', 'Carne', 'tacchino, fesa di tacchino', 107, 24.0, 0, 1.2, 0, 9, 60, 0, 'alta', 150, '1 fetta spessa', 'C', null),
  ('Manzo magro', 'Beef, round, top round, lean only, raw', 'Carne', 'fesa, bistecca, vitellone', 130, 21.8, 0, 4.7, 0, 5, 60, 0, 'alta', 120, '1 bistecca', 'U', null),
  ('Carne macinata di manzo', 'Beef, ground, 85% lean meat / 15% fat, raw', 'Carne', 'macinato, hamburger', 215, 18.6, 0, 15.0, 0, 18, 68, 0, 'alta', 100, '1 hamburger', 'U', null),
  ('Lonza di maiale', 'Pork, fresh, loin, lean only, raw', 'Carne', 'maiale, braciola', 143, 21.4, 0, 5.7, 0, 19, 63, 0, 'alta', 120, '1 braciola', 'U', null),
  ('Prosciutto crudo', 'Ham, prosciutto', 'Carne', 'crudo, prosciutto di Parma, San Daniele', 268, 25.5, 0, 18.4, 0, 13, 72, 0, 'alta', 50, '4 fette', 'C', null),
  ('Prosciutto cotto', 'Ham, sliced, regular', 'Carne', 'cotto', 215, 19.8, 0.9, 14.7, 0, 7, 62, 0, 'alta', 50, '3 fette', 'C', null),
  ('Bresaola', 'Beef, cured, dried', 'Carne', null, 151, 32.0, 0, 2.6, 0, 15, 67, 0, 'alta', 50, '6 fette', 'C', null),
  ('Salame', 'Salami, dry or hard, pork', 'Carne', 'salame Milano, salamino', 425, 26.7, 1.5, 35.0, 0, 15, 85, 0, 'alta', 30, '6 fette', 'C', null),
  ('Fegato di vitello', 'Veal, variety meats and by-products, liver, raw', 'Carne', 'fegato', 140, 19.9, 2.9, 4.9, 0, 6, 301, 0, 'alta', 100, '1 porzione', 'U', null),

  -- ---------------- PESCE ----------------
  ('Salmone', 'Fish, salmon, Atlantic, farmed, raw', 'Pesce', 'salmone fresco, trancio di salmone', 208, 20.4, 0, 13.4, 0, 9, 55, 0, 'alta', 150, '1 trancio', 'U', null),
  ('Tonno sott''olio sgocciolato', 'Fish, tuna, light, canned in oil, drained solids', 'Pesce', 'tonno in scatola', 192, 25.2, 0, 10.1, 0, 7, 65, 0, 'alta', 80, '1 scatoletta', 'C', null),
  ('Tonno al naturale', 'Fish, tuna, light, canned in water, drained solids', 'Pesce', 'tonno in scatola', 116, 25.5, 0, 0.8, 0, 11, 30, 0, 'alta', 80, '1 scatoletta', 'U', null),
  ('Merluzzo', 'Fish, cod, Atlantic, raw', 'Pesce', 'nasello, baccalà dissalato', 82, 17.8, 0, 0.7, 0, 16, 43, 0, 'alta', 150, '1 filetto', 'U', null),
  ('Sardine sott''olio con lische', 'Fish, sardine, Atlantic, canned in oil, drained solids with bone', 'Pesce', 'sardine in scatola', 208, 24.6, 0, 11.5, 0, 382, 142, 0, 'alta', 92, '1 scatoletta', 'U', 'Le lische edibili le rendono un''ottima fonte di calcio.'),
  ('Alici fresche', 'Fish, anchovy, european, raw', 'Pesce', 'acciughe', 131, 20.4, 0, 4.8, 0, 147, 60, 0, 'alta', 100, '1 porzione', 'U', null),
  ('Gamberi', 'Crustaceans, shrimp, mixed species, raw', 'Pesce', 'gamberetti, mazzancolle', 106, 20.3, 0.9, 1.7, 0, 52, 152, 0, 'alta', 100, '1 porzione', 'U', null),
  ('Calamari', 'Mollusks, squid, mixed species, raw', 'Pesce', 'calamaro, totano', 92, 15.6, 3.1, 1.4, 0, 32, 233, 0, 'alta', 100, '1 porzione', 'U', null),
  ('Cozze', 'Mollusks, mussel, blue, raw', 'Pesce', 'mitili', 86, 11.9, 3.7, 2.2, 0, 26, 28, 0, 'alta', 100, '1 porzione (sgusciate)', 'U', null),
  ('Polpo', 'Mollusks, octopus, common, raw', 'Pesce', 'polipo', 82, 14.9, 2.2, 1.0, 0, 53, 48, 0, 'alta', 150, '1 porzione', 'U', null),

  -- ---------------- GRASSI E CONDIMENTI ----------------
  ('Olio extravergine d''oliva', 'Oil, olive, salad or cooking', 'Grassi e condimenti', 'olio evo, olio d''oliva', 884, 0, 0, 100, 0, 1, 0, 0, 'alta', 10, '1 cucchiaio', 'U', null),
  ('Burro', 'Butter, salted', 'Grassi e condimenti', null, 717, 0.9, 0.1, 81.1, 0, 24, 215, 0, 'alta', 10, '1 noce', 'U', null),
  ('Maionese', 'Salad dressing, mayonnaise, regular', 'Grassi e condimenti', null, 680, 1.0, 0.6, 75.0, 0, 8, 42, 0, 'alta', 15, '1 cucchiaio', 'U', null),

  -- ---------------- BEVANDE ----------------
  ('Acqua minerale calcica', 'Water, mineral, high calcium', 'Bevande', 'acqua ricca di calcio, acqua minerale', 0, 0, 0, 0, 0, 30, 0, 0, 'alta', 250, '1 bicchiere', 'C', 'Valore indicativo (300 mg/L): controlla il calcio riportato in etichetta.'),
  ('Bevanda di soia con calcio', 'Soymilk, unsweetened, with added calcium', 'Bevande', 'latte di soia', 33, 2.9, 1.7, 1.6, 0.4, 120, 0, 5, 'bassa', 250, '1 bicchiere', 'U', null),
  ('Bevanda di mandorla con calcio', 'Beverages, almond milk, unsweetened, fortified', 'Bevande', 'latte di mandorla', 15, 0.6, 0.3, 1.2, 0.2, 184, 0, 10, 'bassa', 250, '1 bicchiere', 'U', null),
  ('Tè nero (infuso)', 'Beverages, tea, black, brewed', 'Bevande', 'tè, the', 1, 0, 0.3, 0, 0, 0, 0, 6, 'media', 240, '1 tazza', 'U', 'Ossalato variabile con il tempo di infusione.'),
  ('Tè verde (infuso)', 'Beverages, tea, green, brewed', 'Bevande', 'tè verde, the verde', 1, 0.2, 0, 0, 0, 0, 0, 2, 'bassa', 240, '1 tazza', 'U', null),
  ('Caffè espresso', 'Beverages, coffee, brewed, espresso', 'Bevande', 'caffè, espresso', 9, 0.1, 1.7, 0.2, 0, 2, 0, 1, 'media', 30, '1 tazzina', 'U', null),
  ('Succo d''arancia', 'Orange juice, raw', 'Bevande', 'spremuta', 45, 0.7, 10.4, 0.2, 0.2, 11, 0, 2, 'media', 200, '1 bicchiere', 'U', null),
  ('Birra', 'Alcoholic beverage, beer, regular', 'Bevande', null, 43, 0.5, 3.6, 0, 0, 4, 0, 2, 'media', 330, '1 lattina', 'U', null),
  ('Vino rosso', 'Alcoholic beverage, wine, table, red', 'Bevande', 'vino', 85, 0.1, 2.6, 0, 0, 8, 0, 1, 'bassa', 125, '1 bicchiere', 'U', null),

  -- ---------------- DOLCI E SNACK ----------------
  ('Cacao amaro in polvere', 'Cocoa, dry powder, unsweetened', 'Dolci e snack', 'cacao', 228, 19.6, 57.9, 13.7, 37.0, 128, 0, 650, 'media', 5, '1 cucchiaino', 'U', null),
  ('Cioccolato fondente 70-85%', 'Chocolate, dark, 70-85% cacao solids', 'Dolci e snack', 'cioccolato extra fondente', 598, 7.8, 45.9, 42.6, 10.9, 73, 3, 120, 'media', 20, '2 quadretti', 'U', null),
  ('Cioccolato al latte', 'Candies, milk chocolate', 'Dolci e snack', 'cioccolata', 535, 7.7, 59.4, 29.7, 3.4, 189, 23, 30, 'bassa', 20, '2 quadretti', 'U', null),
  ('Patatine fritte', 'Potatoes, french fried, frozen, oven-heated', 'Dolci e snack', 'patate fritte', 312, 3.4, 41.4, 14.7, 3.8, 18, 0, 50, 'media', 117, '1 porzione media', 'U', null),
  ('Patatine in busta', 'Snacks, potato chips, plain, salted', 'Dolci e snack', 'chips', 536, 7.0, 53.0, 34.6, 4.4, 24, 0, 75, 'media', 28, '1 bustina (28 g)', 'U', null),
  ('Miele', 'Honey', 'Dolci e snack', null, 304, 0.3, 82.4, 0, 0.2, 6, 0, 0, 'alta', 20, '1 cucchiaio', 'U', null),
  ('Zucchero', 'Sugars, granulated', 'Dolci e snack', 'zucchero semolato', 387, 0, 100, 0, 0, 1, 0, 0, 'alta', 5, '1 cucchiaino', 'U', null)
) as v(name_it, name_en, category, synonyms, kcal, prot, carb, fat, fib, ca, chol, ox, conf, portion_g, portion_label, nsrc, notes)
on conflict (name_it) do update set
  name_en            = excluded.name_en,
  category           = excluded.category,
  synonyms           = excluded.synonyms,
  kcal               = excluded.kcal,
  protein_g          = excluded.protein_g,
  carbs_g            = excluded.carbs_g,
  fat_g              = excluded.fat_g,
  fiber_g            = excluded.fiber_g,
  calcium_mg         = excluded.calcium_mg,
  cholesterol_mg     = excluded.cholesterol_mg,
  oxalate_mg         = excluded.oxalate_mg,
  oxalate_confidence = excluded.oxalate_confidence,
  default_portion_g  = excluded.default_portion_g,
  portion_label      = excluded.portion_label,
  nutrient_source    = excluded.nutrient_source,
  oxalate_source     = excluded.oxalate_source,
  notes              = excluded.notes;
