import type { Card } from './api';
import { boosterById } from './data/boosters';
import { TIER_VALUE } from './rarity';

export const STARTING_CREDITS = 500;
const SAVE_KEY = 'ptcg:save:v1';

export interface OwnedCard {
  card: Card;
  count: number;
  /** Prix de revente unitaire en crédits */
  value: number;
  favorite: boolean;
  firstAt: number;
  lastAt: number;
}

export interface Stats {
  opened: number;
  bought: number;
  sold: number;
  earned: number;
  spent: number;
}

export interface GameState {
  credits: number;
  /** Boosters scellés en inventaire : boosterId → quantité */
  packs: Record<string, number>;
  collection: Record<string, OwnedCard>;
  stats: Stats;
}

function fresh(): GameState {
  return {
    credits: STARTING_CREDITS,
    packs: {},
    collection: {},
    stats: { opened: 0, bought: 0, sold: 0, earned: 0, spent: 0 },
  };
}

function load(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return { ...fresh(), ...(JSON.parse(raw) as GameState) };
  } catch {
    /* sauvegarde corrompue : on repart de zéro */
  }
  return fresh();
}

let state = load();
const listeners = new Set<() => void>();

function commit(): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* stockage plein ou indisponible */
  }
  listeners.forEach((l) => l());
}

export function getState(): Readonly<GameState> {
  return state;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Valeur de revente d'une carte : fraction du prix du booster selon le palier,
 * avec un bonus (jusqu'à ×2.5) pour les cartes très cotées sur le marché réel.
 */
export function cardValue(card: Card, boosterPrice: number): number {
  const marketBonus = Math.min(2.5, 1 + Math.log10(1 + card.market) / 2);
  return Math.max(1, Math.round(boosterPrice * TIER_VALUE[card.tier] * marketBonus));
}

export function buyPack(boosterId: string, qty = 1): boolean {
  const def = boosterById(boosterId);
  if (!def) return false;
  const cost = def.price * qty;
  if (state.credits < cost) return false;
  state.credits -= cost;
  state.packs[boosterId] = (state.packs[boosterId] ?? 0) + qty;
  state.stats.bought += qty;
  state.stats.spent += cost;
  commit();
  return true;
}

/** Retire un booster scellé et ajoute son contenu à la collection. */
export function openPack(boosterId: string, cards: Card[]): number[] {
  const def = boosterById(boosterId);
  if (!def || !state.packs[boosterId]) return [];
  state.packs[boosterId]--;
  if (state.packs[boosterId] <= 0) delete state.packs[boosterId];
  const now = Date.now();
  const values = cards.map((card) => {
    const value = cardValue(card, def.price);
    const owned = state.collection[card.id];
    if (owned) {
      owned.count++;
      owned.lastAt = now;
      owned.value = Math.max(owned.value, value);
    } else {
      state.collection[card.id] = { card, count: 1, value, favorite: false, firstAt: now, lastAt: now };
    }
    return value;
  });
  state.stats.opened++;
  commit();
  return values;
}

export function sellCard(cardId: string, qty = 1): number {
  const owned = state.collection[cardId];
  if (!owned) return 0;
  const n = Math.min(qty, owned.count);
  const gain = n * owned.value;
  owned.count -= n;
  if (owned.count <= 0) delete state.collection[cardId];
  state.credits += gain;
  state.stats.sold += n;
  state.stats.earned += gain;
  commit();
  return gain;
}

/** Vend tous les exemplaires en double (garde 1 exemplaire, ignore les favoris). */
export function sellDuplicates(): { count: number; gain: number } {
  let count = 0;
  let gain = 0;
  for (const owned of Object.values(state.collection)) {
    if (owned.favorite || owned.count <= 1) continue;
    const n = owned.count - 1;
    owned.count = 1;
    count += n;
    gain += n * owned.value;
  }
  state.credits += gain;
  state.stats.sold += count;
  state.stats.earned += gain;
  commit();
  return { count, gain };
}

export function toggleFavorite(cardId: string): void {
  const owned = state.collection[cardId];
  if (!owned) return;
  owned.favorite = !owned.favorite;
  commit();
}

/** Coup de pouce si le joueur est totalement bloqué (ni crédits, ni booster, ni carte). */
export function rescueIfBroke(minPrice: number): number {
  const hasPacks = Object.values(state.packs).some((n) => n > 0);
  const hasCards = Object.keys(state.collection).length > 0;
  if (state.credits >= minPrice || hasPacks || hasCards) return 0;
  const grant = minPrice - state.credits;
  state.credits += grant;
  commit();
  return grant;
}

export function resetGame(): void {
  state = fresh();
  commit();
}
