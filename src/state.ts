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

export interface TeamSlot {
  cardId: string;
  /** Ids des cartes Énergie de base équipées */
  energies: string[];
}

export interface ArenaProgress {
  /** Ids des champions battus au moins une fois */
  badges: string[];
  wins: number;
  losses: number;
}

export interface GameState {
  credits: number;
  /** Boosters scellés en inventaire : boosterId → quantité */
  packs: Record<string, number>;
  collection: Record<string, OwnedCard>;
  stats: Stats;
  /** Équipe de combat (jusqu'à 3 Pokémon) */
  team: TeamSlot[];
  arena: ArenaProgress;
  /** Cartes obtenues pour la première fois et pas encore regardées (badge NEW) */
  fresh: Record<string, true>;
}

function fresh(): GameState {
  return {
    credits: STARTING_CREDITS,
    packs: {},
    collection: {},
    stats: { opened: 0, bought: 0, sold: 0, earned: 0, spent: 0 },
    team: [],
    arena: { badges: [], wins: 0, losses: 0 },
    fresh: {},
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
      state.fresh[card.id] = true;
    }
    return value;
  });
  state.stats.opened++;
  commit();
  return values;
}

export interface Sale {
  id: string;
  qty: number;
}

export interface SalePlan {
  sales: Sale[];
  /** Nombre de cartes vendues */
  count: number;
  gain: number;
  /** Cartes dont on vend le dernier exemplaire (elles quittent la collection) */
  lost: OwnedCard[];
  /** Favoris inclus dans la vente */
  favorites: OwnedCard[];
}

/** Résume une vente sans l'exécuter (pour la confirmation). */
export function planSale(sales: Sale[]): SalePlan {
  const plan: SalePlan = { sales: [], count: 0, gain: 0, lost: [], favorites: [] };
  for (const { id, qty } of sales) {
    const owned = state.collection[id];
    const n = owned ? Math.min(qty, owned.count) : 0;
    if (n <= 0) continue;
    plan.sales.push({ id, qty: n });
    plan.count += n;
    plan.gain += n * owned.value;
    if (n === owned.count) plan.lost.push(owned);
    if (owned.favorite) plan.favorites.push(owned);
  }
  return plan;
}

/**
 * Vente en masse : toutes les cartes qui passent le filtre, favoris toujours exclus.
 * `keepOne` conserve un exemplaire de chaque carte (= vendre les doublons).
 */
export function planBulk(filter: (o: OwnedCard) => boolean, keepOne: boolean): SalePlan {
  const prot = protectedCounts();
  return planSale(
    Object.values(state.collection)
      .filter((o) => !o.favorite && filter(o))
      .map((o) => ({ id: o.card.id, qty: o.count - Math.max(keepOne ? 1 : 0, prot[o.card.id] ?? 0) }))
      .filter((s) => s.qty > 0),
  );
}

/** Exemplaires réservés par l'équipe d'arène (Pokémon et Énergies) : jamais vendus en masse. */
export function protectedCounts(): Record<string, number> {
  const p: Record<string, number> = {};
  for (const t of state.team) {
    p[t.cardId] = (p[t.cardId] ?? 0) + 1;
    for (const e of t.energies) p[e] = (p[e] ?? 0) + 1;
  }
  return p;
}

/** Exécute une vente ; `undo` la défait tant que rien d'autre n'a changé ces cartes. */
export function sell(sales: Sale[]): { count: number; gain: number; undo: () => void } {
  const { count, gain } = planSale(sales);
  const before = sales.map(({ id }) => [id, state.collection[id] && { ...state.collection[id] }] as const);
  for (const { id, qty } of sales) {
    const owned = state.collection[id];
    if (!owned) continue;
    owned.count -= Math.min(qty, owned.count);
    if (owned.count <= 0) delete state.collection[id];
  }
  state.credits += gain;
  state.stats.sold += count;
  state.stats.earned += gain;
  commit();
  let undone = false;
  const undo = () => {
    if (undone) return;
    undone = true;
    for (const [id, o] of before) if (o) state.collection[id] = o;
    state.credits -= gain;
    state.stats.sold -= count;
    state.stats.earned -= gain;
    commit();
  };
  return { count, gain, undo };
}

export function markSeen(cardId: string): void {
  if (!state.fresh[cardId]) return;
  delete state.fresh[cardId];
  commit();
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

/* ---------- Équipe & arènes ---------- */

/**
 * Exemplaires d'une carte encore libres pour l'équipe (une carte vendue ou déjà
 * équipée ailleurs ne peut pas l'être deux fois).
 */
export function freeCopies(cardId: string, except?: { slot: number; energy?: number }): number {
  const owned = state.collection[cardId]?.count ?? 0;
  let used = 0;
  state.team.forEach((t, i) => {
    if (t.cardId === cardId && !(except && except.slot === i && except.energy === undefined)) used++;
    t.energies.forEach((e, j) => {
      if (e === cardId && !(except && except.slot === i && except.energy === j)) used++;
    });
  });
  return owned - used;
}

/** Retire de l'équipe les cartes qui ne sont plus dans la collection (vendues). */
export function sanitizeTeam(): void {
  const before = JSON.stringify(state.team);
  const team: TeamSlot[] = [];
  const left = new Map<string, number>();
  const take = (id: string) => {
    const n = left.get(id) ?? state.collection[id]?.count ?? 0;
    if (n <= 0) return false;
    left.set(id, n - 1);
    return true;
  };
  for (const t of state.team) {
    if (!take(t.cardId)) continue;
    team.push({ cardId: t.cardId, energies: t.energies.filter(take) });
  }
  state.team = team;
  if (JSON.stringify(team) !== before) commit();
}

export function setTeamSlot(index: number, cardId: string | null): void {
  if (cardId === null) state.team.splice(index, 1);
  else {
    const j = state.team.findIndex((t) => t.cardId === cardId);
    if (j === index) return;
    // Déjà dans l'équipe : on échange les deux places (avec leurs Énergies)
    if (j >= 0 && state.team[index]) [state.team[index], state.team[j]] = [state.team[j], state.team[index]];
    else if (j >= 0) return;
    else if (state.team[index]) state.team[index] = { cardId, energies: [] };
    else state.team.push({ cardId, energies: [] });
  }
  commit();
}

export function setTeam(team: TeamSlot[]): void {
  state.team = team;
  commit();
}

export function setSlotEnergies(index: number, energies: string[]): void {
  const slot = state.team[index];
  if (!slot) return;
  slot.energies = energies;
  commit();
}

/** Enregistre un combat ; renvoie la récompense (crédits + booster éventuel). */
export function recordBattle(
  leaderId: string,
  won: boolean,
  reward: { credits: number; booster: string },
): { credits: number; booster: string | null; badge: boolean } {
  if (!won) {
    state.arena.losses++;
    commit();
    return { credits: 0, booster: null, badge: false };
  }
  const first = !state.arena.badges.includes(leaderId);
  const credits = first ? reward.credits : Math.round(reward.credits / 2);
  state.arena.wins++;
  state.credits += credits;
  if (first) {
    state.arena.badges.push(leaderId);
    state.packs[reward.booster] = (state.packs[reward.booster] ?? 0) + 1;
  }
  commit();
  return { credits, booster: first ? reward.booster : null, badge: first };
}

export function resetGame(): void {
  state = fresh();
  commit();
}
