/**
 * Assets mis en cache localement par `npm run assets` (public/tcg-cache/, non versionné).
 * Le manifeste liste les fichiers présents : on sert la copie locale quand elle existe,
 * sinon l'URL distante d'origine. Sans manifeste, tout reste distant.
 */
const BASE = `${import.meta.env.BASE_URL}tcg-cache/`;
const REMOTES: [prefix: string, local: string][] = [
  ['https://images.pokemontcg.io/', 'img/'],
  ['https://assets.tcgdex.net/', 'tcgdex/'],
  ['https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/', 'mascots/'],
];

let files = new Set<string>();

export async function loadManifest(): Promise<void> {
  try {
    const res = await fetch(`${BASE}manifest.json`, { cache: 'no-cache' });
    if (res.ok) files = new Set(((await res.json()) as { files: string[] }).files);
  } catch {
    /* pas de cache local : URL distantes */
  }
}

export function hasLocal(path: string): boolean {
  return files.has(path);
}

export function localUrl(path: string): string {
  return BASE + path;
}

/** URL locale si l'asset est en cache, URL distante sinon. */
export function asset(url: string): string {
  for (const [prefix, dir] of REMOTES) {
    if (!url.startsWith(prefix)) continue;
    const path = dir + url.slice(prefix.length);
    return files.has(path) ? BASE + path : url;
  }
  return url;
}
