import type { Tier } from '../rarity';

export interface BoosterDef {
  id: string;
  /** Identifiant du set dans l'API pokemontcg.io */
  setId: string;
  name: string;
  subtitle: string;
  price: number;
  /** Couleurs de l'emballage */
  colors: [string, string, string];
  /** Numéro national du Pokémon en mascotte sur l'emballage */
  mascot: number;
  /** Poids de tirage du slot rare (rare, holo, ultra, secret) */
  rareSlot: Partial<Record<Tier, number>>;
  /** Chance (0-1) qu'une peu commune soit remplacée par une carte du slot rare */
  bonusChance: number;
}

/** Emplacements d'un booster : 6 communes, 3 peu communes, 1 slot rare. */
export const PACK_LAYOUT = { common: 6, uncommon: 3, rare: 1 } as const;

export const BOOSTERS: BoosterDef[] = [
  {
    id: 'base',
    setId: 'base1',
    name: 'Set de Base',
    subtitle: 'Le classique de 1999',
    price: 100,
    colors: ['#1f4fa8', '#3c7bd9', '#ffcb05'],
    mascot: 6,
    rareSlot: { rare: 70, holo: 30 },
    bonusChance: 0.03,
  },
  {
    id: 'sv1',
    setId: 'sv1',
    name: 'Écarlate & Violet',
    subtitle: 'Bienvenue à Paldea',
    price: 180,
    colors: ['#b3122e', '#6c2bb5', '#f6d8ff'],
    mascot: 906,
    rareSlot: { rare: 62, ultra: 30, secret: 8 },
    bonusChance: 0.06,
  },
  {
    id: '151',
    setId: 'sv3pt5',
    name: 'Pokémon 151',
    subtitle: 'Les originaux reviennent',
    price: 300,
    colors: ['#d8262b', '#1d1d1d', '#ffffff'],
    mascot: 151,
    rareSlot: { rare: 55, ultra: 33, secret: 12 },
    bonusChance: 0.08,
  },
  {
    id: 'evs',
    setId: 'swsh7',
    name: 'Évolution Céleste',
    subtitle: 'Les dragons dans le ciel',
    price: 450,
    colors: ['#0d5c63', '#3fb6a8', '#d8f7ff'],
    mascot: 384,
    rareSlot: { rare: 45, holo: 20, ultra: 27, secret: 8 },
    bonusChance: 0.1,
  },
  {
    id: 'crz',
    setId: 'swsh12pt5',
    name: 'Zénith Suprême',
    subtitle: 'Le sommet de la collection',
    price: 700,
    colors: ['#1a1446', '#c9a227', '#fff3c4'],
    mascot: 888,
    rareSlot: { rare: 30, holo: 25, ultra: 33, secret: 12 },
    bonusChance: 0.15,
  },
];

export function boosterById(id: string): BoosterDef | undefined {
  return BOOSTERS.find((b) => b.id === id);
}

/** Artwork officiel d'un Pokémon (dépôt public PokeAPI) pour l'emballage. */
export function mascotUrl(dex: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`;
}
