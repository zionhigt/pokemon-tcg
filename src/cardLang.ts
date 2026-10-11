import type { Card } from './api';
import { asset, hasLocal, localUrl } from './assets';
import type { BoosterDef } from './data/boosters';

/**
 * Langue des cartes (noms, images, extension). Le français vient de TCGdex :
 * une requête par set, associée aux cartes pokemontcg.io par leur numéro.
 * L'interface reste en français dans les deux cas.
 */
export type CardLang = 'fr' | 'en';

const LANG_KEY = 'ptcg:card-lang';
const FR_PREFIX = 'ptcg:fr:';
const TCGDEX = 'https://api.tcgdex.net/v2/fr';

interface FrSet {
  name: string;
  cards: { localId: string; name: string; image?: string }[];
}

interface FrCard {
  name: string;
  image?: string;
}

let lang: CardLang = 'fr';
try {
  if (localStorage.getItem(LANG_KEY) === 'en') lang = 'en';
} catch {
  /* ignore */
}

/** Cartes françaises par `setId:numéro`, et noms français des sets. */
const frCards = new Map<string, FrCard>();
const frSetNames = new Map<string, string>();

/** "001" et "1" désignent la même carte. */
function key(setId: string, number: string): string {
  return `${setId}:${/^\d+$/.test(number) ? String(Number(number)) : number.toUpperCase()}`;
}

function index(setId: string, set: FrSet): void {
  frSetNames.set(setId, set.name);
  for (const c of set.cards) frCards.set(key(setId, c.localId), { name: c.name, image: c.image });
}

async function fetchFr(def: BoosterDef): Promise<FrSet | null> {
  if (hasLocal(`sets/${def.setId}.fr.json`)) {
    const res = await fetch(localUrl(`sets/${def.setId}.fr.json`));
    if (res.ok) return (await res.json()) as FrSet;
  }
  try {
    const raw = localStorage.getItem(FR_PREFIX + def.setId);
    if (raw) return JSON.parse(raw) as FrSet;
  } catch {
    /* ignore */
  }
  const res = await fetch(`${TCGDEX}/sets/${encodeURIComponent(def.tcgdexId)}`);
  if (!res.ok) return null;
  const full = (await res.json()) as FrSet;
  const set: FrSet = { name: full.name, cards: full.cards.map(({ localId, name, image }) => ({ localId, name, image })) };
  try {
    localStorage.setItem(FR_PREFIX + def.setId, JSON.stringify(set));
  } catch {
    /* quota : on re-demandera la prochaine fois */
  }
  return set;
}

const loaded = new Map<string, Promise<void>>();

/** Charge les données françaises des boosters (cache local → localStorage → TCGdex). */
export function loadFrench(defs: BoosterDef[]): Promise<void> {
  return Promise.all(
    defs.map((def) => {
      const cached = loaded.get(def.setId);
      if (cached) return cached;
      const p = fetchFr(def).then(
        (set) => {
          if (set) index(def.setId, set);
          else loaded.delete(def.setId);
        },
        () => void loaded.delete(def.setId),
      );
      loaded.set(def.setId, p);
      return p;
    }),
  ).then(() => {});
}

export function getCardLang(): CardLang {
  return lang;
}

export function setCardLang(l: CardLang): void {
  lang = l;
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* ignore */
  }
}

function fr(card: Card): FrCard | undefined {
  return lang === 'fr' ? frCards.get(key(card.setId, card.number)) : undefined;
}

export function cardName(card: Card): string {
  return fr(card)?.name ?? card.name;
}

/** Les deux noms, pour que la recherche marche dans les deux langues. */
export function searchText(card: Card): string {
  return `${card.name} ${frCards.get(key(card.setId, card.number))?.name ?? ''}`.toLowerCase();
}

export function cardSetName(card: Card): string {
  return (lang === 'fr' && frSetNames.get(card.setId)) || card.setName;
}

/** Image de la carte dans la langue choisie ; `fallback` est l'image anglaise. */
export function cardImage(card: Card, large = false): { src: string; fallback: string } {
  const en = asset(large ? card.large : card.small);
  const image = fr(card)?.image;
  return { src: image ? asset(`${image}/${large ? 'high' : 'low'}.webp`) : en, fallback: en };
}

const SUPERTYPES: Record<string, string> = { 'Pokémon': 'Pokémon', Trainer: 'Dresseur', Energy: 'Énergie' };
const TYPES: Record<string, string> = {
  Colorless: 'Incolore',
  Darkness: 'Obscurité',
  Dragon: 'Dragon',
  Fairy: 'Fée',
  Fighting: 'Combat',
  Fire: 'Feu',
  Grass: 'Plante',
  Lightning: 'Électrique',
  Metal: 'Métal',
  Psychic: 'Psy',
  Water: 'Eau',
};

export function cardTypes(card: Card): string {
  const all = [card.supertype, ...card.types];
  return (lang === 'fr' ? all.map((t) => SUPERTYPES[t] ?? TYPES[t] ?? t) : all).join(' · ');
}

/** Rareté officielle telle qu'imprimée sur les cartes françaises. */
const RARITIES: Record<string, string> = {
  Common: 'Commune',
  Uncommon: 'Peu commune',
  Rare: 'Rare',
  'Rare Holo': 'Rare Holo',
  'Rare Holo V': 'Rare Holo V',
  'Rare Holo VMAX': 'Rare Holo VMAX',
  'Rare Holo VSTAR': 'Rare Holo VSTAR',
  'Rare Ultra': 'Ultra rare',
  'Ultra Rare': 'Ultra rare',
  'Double Rare': 'Double rare',
  'Illustration Rare': 'Illustration rare',
  'Special Illustration Rare': 'Illustration spéciale rare',
  'Hyper Rare': 'Hyper rare',
  'Rare Rainbow': 'Rare arc-en-ciel',
  'Rare Secret': 'Rare secrète',
  'Radiant Rare': 'Radieux rare',
};

export function cardRarity(card: Card): string {
  return lang === 'fr' ? (RARITIES[card.rarity] ?? card.rarity) : card.rarity;
}
