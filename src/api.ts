import { hasLocal, localUrl } from './assets';
import { tierOf, type Tier } from './rarity';

/**
 * Données des cartes : API publique Pokémon TCG (https://pokemontcg.io).
 * Une seule requête paginée par set renvoie toutes les cartes avec leur rareté,
 * leurs images et leur prix de marché (TCGplayer / Cardmarket).
 */
const API = 'https://api.pokemontcg.io/v2';
// v2 : les sets contiennent aussi les stats de combat (PV, attaques, faiblesses…)
const CACHE_PREFIX = 'ptcg:set:v2:';
const OLD_CACHE = /^ptcg:set:(?!v2:)/;
const CACHE_TTL = 1000 * 60 * 60 * 24 * 7;

export interface Card {
  id: string;
  name: string;
  number: string;
  rarity: string;
  tier: Tier;
  setId: string;
  setName: string;
  supertype: string;
  types: string[];
  small: string;
  large: string;
  /** Prix de marché en USD (0 si inconnu) */
  market: number;
  /** Basic, Stage 1, ex, V… (Pokémon) ou Basic / Special (Énergie) */
  subtypes?: string[];
  hp?: number;
  attacks?: Attack[];
  weaknesses?: TypeMod[];
  resistances?: TypeMod[];
  retreat?: number;
}

export interface Attack {
  name: string;
  /** Types d'énergie du coût (ex. ["Fire", "Colorless"]) */
  cost: string[];
  /** Dégâts de base ("30+", "20×" → 30, 20) ; 0 pour une attaque à effet seul */
  damage: number;
}

export interface TypeMod {
  type: string;
  /** "×2", "-30", "+20" tels qu'imprimés sur la carte */
  value: string;
}

export interface SetInfo {
  id: string;
  name: string;
  logo: string;
  symbol: string;
  cards: Card[];
}

interface ApiCard {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  supertype: string;
  types?: string[];
  images: { small: string; large: string };
  set: { id: string; name: string; images: { logo: string; symbol: string } };
  subtypes?: string[];
  hp?: string;
  attacks?: { name: string; cost?: string[]; damage?: string }[];
  weaknesses?: TypeMod[];
  resistances?: TypeMod[];
  convertedRetreatCost?: number;
  tcgplayer?: { prices?: Record<string, { market?: number; mid?: number }> };
  cardmarket?: { prices?: { averageSellPrice?: number; trendPrice?: number } };
}

function marketPrice(c: ApiCard): number {
  const prices = c.tcgplayer?.prices;
  if (prices) {
    const values = Object.values(prices)
      .map((p) => p.market ?? p.mid ?? 0)
      .filter((v) => v > 0);
    if (values.length) return Math.max(...values);
  }
  return c.cardmarket?.prices?.trendPrice ?? c.cardmarket?.prices?.averageSellPrice ?? 0;
}

function computePower(card: Pick<ApiCard, 'hp' | 'attacks'>): number {
  let value = 0;
  if (card?.attacks && card.attacks.length > 0) {
    for (let atk of card.attacks) {
      const cost = atk?.cost?.length || 1;
      const damage = atk.damage ? Number.parseInt(atk.damage) : 0;
      value += damage / cost;
    }
  }
  return value * (card.hp ? parseInt(card.hp) : 0);
}

/** Score de puissance calculé à la volée (les cartes d'avant le mode Arènes, sans PV, valent 0). */
export function powerScore(card: Card): number {
  return computePower({
    hp: card.hp?.toString(),
    attacks: card.attacks?.map((a) => ({ name: a.name, cost: a.cost, damage: a.damage.toString() })),
  });
}

function toCard(c: ApiCard): Card {
  return {
    id: c.id,
    name: c.name,
    number: c.number,
    rarity: c.rarity ?? 'Common',
    tier: tierOf(c.rarity),
    setId: c.set.id,
    setName: c.set.name,
    supertype: c.supertype,
    types: c.types ?? [],
    small: c.images.small,
    large: c.images.large,
    market: Math.round(marketPrice(c) * 100) / 100,
    subtypes: c.subtypes,
    hp: c.hp ? parseInt(c.hp) || undefined : undefined,
    attacks: c.attacks?.map((a) => ({ name: a.name, cost: a.cost ?? [], damage: parseInt(a.damage ?? '') || 0 })),
    weaknesses: c.weaknesses,
    resistances: c.resistances,
    retreat: c.convertedRetreatCost,
  };
}

/** Champs demandés à l'API (aussi utilisés par scripts/fetch-assets.mjs). */
const SELECT = 'id,name,number,rarity,supertype,subtypes,types,hp,attacks,weaknesses,resistances,convertedRetreatCost,images,set,tcgplayer,cardmarket';

/** Les anciens fichiers (avant le mode Arènes) n'ont pas les stats de combat. */
function hasBattleData(cards: ApiCard[]): boolean {
  return cards.some((c) => c.supertype === 'Pokémon' && c.hp);
}

const memory = new Map<string, Promise<SetInfo>>();

// Libère la place occupée par les sets en cache dans l'ancien format.
try {
  for (const k of Object.keys(localStorage)) if (OLD_CACHE.test(k)) localStorage.removeItem(k);
} catch {
  /* ignore */
}

function readCache(setId: string): SetInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + setId);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw) as { at: number; data: SetInfo };
    if (Date.now() - at > CACHE_TTL || !data.cards?.length) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(set: SetInfo): void {
  try {
    localStorage.setItem(CACHE_PREFIX + set.id, JSON.stringify({ at: Date.now(), data: set }));
  } catch {
    /* quota dépassé : le cache du service worker prend le relais */
  }
}

function toSet(setId: string, cards: ApiCard[]): SetInfo {
  if (!cards.length) throw new Error(`Aucune carte trouvée pour le set ${setId}`);
  const first = cards[0].set;
  return {
    id: setId,
    name: first.name,
    logo: first.images.logo,
    symbol: first.images.symbol,
    cards: cards.map(toCard),
  };
}

/** Copie locale du set (générée par `npm run assets`), sans appel à l'API. */
async function fetchLocalSet(setId: string): Promise<SetInfo> {
  const res = await fetch(localUrl(`sets/${setId}.json`));
  if (!res.ok) throw new Error(`Cache local : erreur ${res.status}`);
  const cards = (await res.json()) as ApiCard[];
  if (!hasBattleData(cards)) throw new Error('Cache local sans stats de combat');
  return toSet(setId, cards);
}

async function fetchSet(setId: string): Promise<SetInfo> {
  const cards: ApiCard[] = [];
  let page = 1;
  let total = Infinity;
  while (cards.length < total) {
    const url = `${API}/cards?q=set.id:${encodeURIComponent(setId)}&pageSize=250&page=${page}&select=${SELECT}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API Pokémon TCG : erreur ${res.status}`);
    const json = (await res.json()) as { data: ApiCard[]; totalCount: number };
    cards.push(...json.data);
    total = json.totalCount;
    if (!json.data.length) break;
    page++;
  }
  return toSet(setId, cards);
}

/** Charge un set (mémoire → fichier local → localStorage → API). Seul ce qui manque est requêté. */
export function loadSet(setId: string): Promise<SetInfo> {
  const cached = memory.get(setId);
  if (cached) return cached;
  const stored = readCache(setId);
  const p = hasLocal(`sets/${setId}.json`)
    ? fetchLocalSet(setId).catch(() => stored ?? fetchSet(setId))
    : stored
      ? Promise.resolve(stored)
      : fetchSet(setId);
  p.then((s) => s !== stored && writeCache(s)).catch(() => {});
  p.catch(() => memory.delete(setId));
  memory.set(setId, p);
  return p;
}

/** Retrouve une carte déjà chargée (pour la galerie). */
export function cachedSet(setId: string): SetInfo | null {
  return readCache(setId);
}

/** Version complète (avec stats de combat) d'une carte d'un set déjà chargé. */
export async function fullCard(card: Card): Promise<Card> {
  if (card.hp !== undefined || card.supertype !== 'Pokémon') return card;
  try {
    return (await loadSet(card.setId)).cards.find((c) => c.id === card.id) ?? card;
  } catch {
    return card;
  }
}

export function setLogoUrl(setId: string): string {
  return `https://images.pokemontcg.io/${setId}/logo.png`;
}
