import { tierOf, type Tier } from './rarity';

/**
 * Données des cartes : API publique Pokémon TCG (https://pokemontcg.io).
 * Une seule requête paginée par set renvoie toutes les cartes avec leur rareté,
 * leurs images et leur prix de marché (TCGplayer / Cardmarket).
 */
const API = 'https://api.pokemontcg.io/v2';
const CACHE_PREFIX = 'ptcg:set:';
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
  };
}

const memory = new Map<string, Promise<SetInfo>>();

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

async function fetchSet(setId: string): Promise<SetInfo> {
  const select = 'id,name,number,rarity,supertype,types,images,set,tcgplayer,cardmarket';
  const cards: ApiCard[] = [];
  let page = 1;
  let total = Infinity;
  while (cards.length < total) {
    const url = `${API}/cards?q=set.id:${encodeURIComponent(setId)}&pageSize=250&page=${page}&select=${select}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API Pokémon TCG : erreur ${res.status}`);
    const json = (await res.json()) as { data: ApiCard[]; totalCount: number };
    cards.push(...json.data);
    total = json.totalCount;
    if (!json.data.length) break;
    page++;
  }
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

/** Charge un set (cache mémoire → localStorage → réseau). */
export function loadSet(setId: string): Promise<SetInfo> {
  const cached = memory.get(setId);
  if (cached) return cached;
  const local = readCache(setId);
  const p = local
    ? Promise.resolve(local)
    : fetchSet(setId).then((s) => {
        writeCache(s);
        return s;
      });
  p.catch(() => memory.delete(setId));
  memory.set(setId, p);
  return p;
}

/** Retrouve une carte déjà chargée (pour la galerie). */
export function cachedSet(setId: string): SetInfo | null {
  return readCache(setId);
}

export function setLogoUrl(setId: string): string {
  return `https://images.pokemontcg.io/${setId}/logo.png`;
}
