import type { Card } from '../api';
import { isPlayablePokemon, TEAM_SIZE } from '../battle/rules';
import type { TeamMember } from '../battle/engine';
import type { EnergyType } from '../battle/types';

export interface Leader {
  id: string;
  name: string;
  city: string;
  arena: string;
  type: EnergyType;
  badge: string;
  /** Fourchette de PV des Pokémon du champion (monte d'arène en arène) */
  hp: [number, number];
  /** Cartes Énergie équipées par Pokémon du champion */
  energies: number;
  /** Crédits à chaque victoire (×½ en revanche) */
  reward: number;
  /** Booster offert à la première victoire */
  booster: string;
  quote: string;
}

export const LEADERS: Leader[] = [
  { id: 'pierre', name: 'Pierre', city: 'Argenta', arena: 'Arène d’Argenta', type: 'Fighting', badge: 'Badge Roche', hp: [40, 80], energies: 0, reward: 150, booster: 'base', quote: 'Ma défense est solide comme le roc !' },
  { id: 'ondine', name: 'Ondine', city: 'Azuria', arena: 'Arène d’Azuria', type: 'Water', badge: 'Badge Cascade', hp: [50, 90], energies: 0, reward: 200, booster: 'sv1', quote: 'Mes Pokémon Eau vont te submerger !' },
  { id: 'bob', name: 'Major Bob', city: 'Carmin sur Mer', arena: 'Arène de Carmin', type: 'Lightning', badge: 'Badge Foudre', hp: [60, 110], energies: 1, reward: 260, booster: 'sv1', quote: 'Prépare-toi à être électrocuté, gamin !' },
  { id: 'erika', name: 'Erika', city: 'Céladopole', arena: 'Arène de Céladopole', type: 'Grass', badge: 'Badge Prisme', hp: [70, 130], energies: 1, reward: 330, booster: '151', quote: 'Les plantes ont plus de force qu’on ne le croit.' },
  { id: 'koga', name: 'Koga', city: 'Parmanie', arena: 'Arène de Parmanie', type: 'Darkness', badge: 'Badge Âme', hp: [80, 150], energies: 1, reward: 420, booster: '151', quote: 'Le ninja frappe depuis l’ombre…' },
  { id: 'morgane', name: 'Morgane', city: 'Safrania', arena: 'Arène de Safrania', type: 'Psychic', badge: 'Badge Marais', hp: [100, 180], energies: 2, reward: 520, booster: 'evs', quote: 'J’ai déjà vu l’issue de ce combat.' },
  { id: 'auguste', name: 'Auguste', city: 'Cramois’Île', arena: 'Arène de Cramois’Île', type: 'Fire', badge: 'Badge Volcan', hp: [120, 220], energies: 2, reward: 650, booster: 'evs', quote: 'Ouaaaah ! Tu vas brûler !' },
  { id: 'giovanni', name: 'Giovanni', city: 'Jadielle', arena: 'Arène de Jadielle', type: 'Fighting', badge: 'Badge Terre', hp: [150, 340], energies: 2, reward: 800, booster: 'crz', quote: 'Voyons si tu mérites le dernier badge.' },
];

export function leaderById(id: string): Leader | undefined {
  return LEADERS.find((l) => l.id === id);
}

/** Générateur pseudo-aléatoire déterministe : l'équipe d'un champion ne change pas d'une partie à l'autre. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * Équipe d'un champion tirée des vraies cartes des extensions : Pokémon de son type
 * dans sa fourchette de PV, élargie si l'extension en manque.
 */
export function leaderTeam(leader: Leader, cards: Card[]): TeamMember[] {
  const rng = seeded(leader.id);
  const playable = cards.filter(isPlayablePokemon);
  const ofType = playable.filter((c) => c.types?.includes(leader.type));
  const [min, max] = leader.hp;
  const inBand = (c: Card) => c.hp! >= min && c.hp! <= max;
  const dist = (c: Card) => (inBand(c) ? 0 : Math.min(Math.abs(c.hp! - min), Math.abs(c.hp! - max)));

  const picked: Card[] = [];
  const names = new Set<string>();
  const take = (pool: Card[]) => {
    const shuffled = pool.map((c) => ({ c, r: rng() })).sort((a, b) => dist(a.c) - dist(b.c) || a.r - b.r);
    for (const { c } of shuffled) {
      if (picked.length >= TEAM_SIZE) return;
      if (names.has(c.name)) continue;
      names.add(c.name);
      picked.push(c);
    }
  };
  take(ofType.filter(inBand));
  take(ofType);
  take(playable.filter(inBand));
  // Le plus fort en dernier : le champion garde son as dans la manche
  picked.sort((a, b) => a.hp! - b.hp!);
  return picked.map((card) => ({ card, energies: Array(leader.energies).fill(leader.type) }));
}
