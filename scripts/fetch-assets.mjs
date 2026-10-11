/**
 * Met en cache local (public/tcg-cache/, non versionné) les données et images du jeu.
 * Incrémental : seuls les fichiers absents sont téléchargés, rien n'est re-requêté.
 *
 *   node scripts/fetch-assets.mjs            sets (EN + FR) + logos + mascottes + images de cartes
 *   node scripts/fetch-assets.mjs --hires    + images haute définition (EN ~700 Ko, FR ~100 Ko / carte)
 *   node scripts/fetch-assets.mjs --refresh  re-télécharge les données des sets (prix)
 *
 * Un échec réseau n'est jamais bloquant : le jeu retombe sur les URL distantes.
 */
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'tcg-cache');
const API = 'https://api.pokemontcg.io/v2';
const IMAGES = 'https://images.pokemontcg.io/';
const TCGDEX = 'https://api.tcgdex.net/v2/fr';
const TCGDEX_IMAGES = 'https://assets.tcgdex.net/';
const MASCOTS = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';
const CONCURRENCY = 8;

const args = new Set(process.argv.slice(2));
const HIRES = args.has('--hires');
const REFRESH = args.has('--refresh');

/** Lit les sets (pokemontcg.io + TCGdex) et mascottes des boosters dans src/data/boosters.ts. */
async function boosters() {
  const src = await readFile(join(ROOT, 'src', 'data', 'boosters.ts'), 'utf8');
  const sets = [...src.matchAll(/setId:\s*'([^']+)',\s*tcgdexId:\s*'([^']+)'/g)].map((m) => ({ setId: m[1], tcgdexId: m[2] }));
  const mascots = [...src.matchAll(/mascot:\s*(\d+)/g)].map((m) => Number(m[1]));
  return { sets, mascots };
}

async function exists(path) {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

/** fetch avec quelques tentatives : l'API renvoie parfois des 500 passagères. */
async function get(url, tries = 4) {
  for (let i = 1; ; i++) {
    const res = await fetch(url).catch((e) => ({ ok: false, status: e.message }));
    if (res.ok || i >= tries || (res.status >= 400 && res.status < 500)) return res;
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
}

async function download(url, path) {
  if (await exists(path)) return 'skip';
  const res = await get(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  return 'ok';
}

/** Même format que fetchSet() dans src/api.ts (URL distantes, résolues côté client). */
async function fetchSet(setId) {
  const select = 'id,name,number,rarity,supertype,types,images,set,tcgplayer,cardmarket';
  const cards = [];
  for (let page = 1, total = Infinity; cards.length < total; page++) {
    const res = await get(`${API}/cards?q=set.id:${encodeURIComponent(setId)}&pageSize=250&page=${page}&select=${select}`);
    if (!res.ok) throw new Error(`API ${res.status} pour ${setId}`);
    const json = await res.json();
    cards.push(...json.data);
    total = json.totalCount;
    if (!json.data.length) break;
  }
  if (!cards.length) throw new Error(`Aucune carte pour ${setId}`);
  return cards;
}

/** Version française d'un set : même format que la réponse TCGdex, allégée. */
async function fetchFrSet(tcgdexId) {
  const res = await get(`${TCGDEX}/sets/${encodeURIComponent(tcgdexId)}`);
  if (!res.ok) throw new Error(`TCGdex ${res.status} pour ${tcgdexId}`);
  const set = await res.json();
  return { name: set.name, cards: set.cards.map(({ localId, name, image }) => ({ localId, name, image })) };
}

async function pool(items, fn) {
  let i = 0;
  const stats = { ok: 0, skip: 0, fail: 0 };
  const worker = async () => {
    while (i < items.length) {
      const item = items[i++];
      try {
        stats[await fn(item)]++;
      } catch (e) {
        stats.fail++;
        console.warn(`  ⚠ ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return stats;
}

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(p)));
    else out.push(relative(OUT, p).split('\\').join('/'));
  }
  return out;
}

async function main() {
  const { sets, mascots } = await boosters();
  const images = [];
  const frImages = [];

  for (const { setId, tcgdexId } of sets) {
    const frPath = join(OUT, 'sets', `${setId}.fr.json`);
    let fr;
    if (!REFRESH && (await exists(frPath))) {
      fr = JSON.parse(await readFile(frPath, 'utf8'));
    } else {
      try {
        process.stdout.write(`Set ${setId} (FR)… `);
        fr = await fetchFrSet(tcgdexId);
        await mkdir(dirname(frPath), { recursive: true });
        await writeFile(frPath, JSON.stringify(fr));
        console.log(`${fr.cards.length} cartes`);
      } catch (e) {
        console.warn(`échec (${e.message})`);
      }
    }
    for (const c of fr?.cards ?? []) {
      if (!c.image) continue;
      const base = c.image.replace(TCGDEX_IMAGES, '');
      frImages.push(`${base}/low.webp`);
      if (HIRES) frImages.push(`${base}/high.webp`);
    }

    const path = join(OUT, 'sets', `${setId}.json`);
    let cards;
    if (!REFRESH && (await exists(path))) {
      cards = JSON.parse(await readFile(path, 'utf8'));
    } else {
      try {
        process.stdout.write(`Set ${setId}… `);
        cards = await fetchSet(setId);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, JSON.stringify(cards));
        console.log(`${cards.length} cartes`);
      } catch (e) {
        console.warn(`échec (${e.message})`);
        continue;
      }
    }
    images.push(`${setId}/logo.png`);
    for (const c of cards) {
      images.push(c.images.small.replace(IMAGES, ''));
      if (HIRES) images.push(c.images.large.replace(IMAGES, ''));
    }
  }

  console.log(`Images : ${images.length} attendues`);
  const img = await pool(images, (p) => download(IMAGES + p, join(OUT, 'img', p)));
  console.log(`  téléchargées ${img.ok}, déjà présentes ${img.skip}, échecs ${img.fail}`);
  console.log(`Images FR : ${frImages.length} attendues`);
  const frImg = await pool(frImages, (p) => download(TCGDEX_IMAGES + p, join(OUT, 'tcgdex', p)));
  console.log(`  téléchargées ${frImg.ok}, déjà présentes ${frImg.skip}, échecs ${frImg.fail}`);
  const masc = await pool(mascots, (n) => download(`${MASCOTS}${n}.png`, join(OUT, 'mascots', `${n}.png`)));
  if (masc.ok || masc.fail) console.log(`Mascottes : téléchargées ${masc.ok}, échecs ${masc.fail}`);

  // Le manifeste indique au client ce qui est disponible localement.
  const files = (await listFiles(OUT)).filter((f) => f !== 'manifest.json').sort();
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify({ at: Date.now(), files }));
  console.log(`Manifeste : ${files.length} fichiers dans public/tcg-cache/`);
}

main().catch((e) => {
  console.warn(`Assets : ${e.message} (le jeu utilisera les URL distantes)`);
});
