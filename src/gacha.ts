import type { Card, SetInfo } from './api';
import { PACK_LAYOUT, type BoosterDef } from './data/boosters';
import { TIERS, tierIndex, type Tier } from './rarity';

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weighted(weights: Partial<Record<Tier, number>>): Tier {
  const entries = Object.entries(weights) as [Tier, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [tier, w] of entries) {
    roll -= w;
    if (roll <= 0) return tier;
  }
  return entries[entries.length - 1][0];
}

function pools(set: SetInfo): Map<Tier, Card[]> {
  const map = new Map<Tier, Card[]>(TIERS.map((t) => [t, []]));
  for (const c of set.cards) map.get(c.tier)!.push(c);
  return map;
}

/**
 * Cartes du palier demandé, ou du palier existant le plus proche.
 * Le slot rare cherche d'abord vers le haut pour ne jamais rapporter moins que prévu.
 */
function poolFor(map: Map<Tier, Card[]>, tier: Tier, preferUp = false): Card[] {
  const i = tierIndex(tier);
  for (let d = 0; d < TIERS.length; d++) {
    const order = preferUp ? [TIERS[i + d], TIERS[i - d]] : [TIERS[i - d], TIERS[i + d]];
    for (const t of order) if (t && map.get(t)!.length) return map.get(t)!;
  }
  return [];
}

function drawUnique(pool: Card[], taken: Set<string>): Card {
  const free = pool.filter((c) => !taken.has(c.id));
  const card = pick(free.length ? free : pool);
  taken.add(card.id);
  return card;
}

/** Génère le contenu d'un booster, trié de la carte la plus commune à la plus rare. */
export function rollPack(def: BoosterDef, set: SetInfo): Card[] {
  const map = pools(set);
  const taken = new Set<string>();
  const cards: Card[] = [];
  for (let i = 0; i < PACK_LAYOUT.common; i++) cards.push(drawUnique(poolFor(map, 'common'), taken));
  for (let i = 0; i < PACK_LAYOUT.uncommon; i++) {
    const tier = Math.random() < def.bonusChance ? weighted(def.rareSlot) : 'uncommon';
    cards.push(drawUnique(poolFor(map, tier, tier !== 'uncommon'), taken));
  }
  for (let i = 0; i < PACK_LAYOUT.rare; i++) cards.push(drawUnique(poolFor(map, weighted(def.rareSlot), true), taken));
  return cards.sort((a, b) => tierIndex(a.tier) - tierIndex(b.tier));
}

/** Probabilités affichées en boutique pour le slot rare. */
export function oddsOf(def: BoosterDef): { tier: Tier; pct: number }[] {
  const entries = Object.entries(def.rareSlot) as [Tier, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  return entries.map(([tier, w]) => ({ tier, pct: Math.round((w / total) * 1000) / 10 }));
}
