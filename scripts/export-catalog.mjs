// Rigenera public/data/catalogo.json (catalogo offline incluso nell'app) dai dati su Supabase.
// Uso: npm run export:catalog   (richiede SUPABASE_URL e SUPABASE_ANON_KEY nel file .env)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envFile = resolve(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Imposta SUPABASE_URL e SUPABASE_ANON_KEY nel file .env');
  process.exit(1);
}

const columns =
  'id,name_it,name_en,category,synonyms,kcal,protein_g,carbs_g,fat_g,fiber_g,calcium_mg,cholesterol_mg,' +
  'oxalate_mg,oxalate_confidence,default_portion_g,portion_label,nutrient_source,oxalate_source,notes';
const res = await fetch(`${SUPABASE_URL}/rest/v1/foods?select=${columns}&order=name_it`, {
  headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
});
if (!res.ok) {
  console.error(`Errore Supabase: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const foods = await res.json();
mkdirSync(resolve(root, 'public/data'), { recursive: true });
writeFileSync(resolve(root, 'public/data/catalogo.json'), JSON.stringify(foods));
console.log(`Esportati ${foods.length} alimenti in public/data/catalogo.json`);
