import { loadSet, type Card } from './api';
import type { TeamMember } from './battle/engine';
import { basicEnergyType, isPlayablePokemon } from './battle/rules';
import { mainType, type EnergyType } from './battle/types';
import { BOOSTERS } from './data/boosters';
import { LEADERS, leaderTeam, type Leader } from './data/leaders';
import { getState } from './state';

/** Toutes les cartes des extensions, avec leurs stats de combat. */
let allCards: Card[] = [];
const byId = new Map<string, Card>();
let loading: Promise<void> | null = null;

export function loadAll(): Promise<void> {
  loading ??= Promise.allSettled(BOOSTERS.map((b) => loadSet(b.setId))).then((sets) => {
    allCards = sets.flatMap((r) => (r.status === 'fulfilled' ? r.value.cards : []));
    byId.clear();
    for (const c of allCards) byId.set(c.id, c);
    // Échec réseau : on retentera au prochain passage
    if (sets.some((r) => r.status === 'rejected')) loading = null;
  });
  return loading;
}

export function cards(): Card[] {
  return allCards;
}

/** Version complète d'une carte de la collection (les anciennes sauvegardes n'ont pas les stats). */
export function full(id: string): Card | undefined {
  return byId.get(id) ?? getState().collection[id]?.card;
}

/** Une carte Énergie de base de ce type, pour son image. */
export function energyCard(type: EnergyType): Card | undefined {
  return allCards.find((c) => basicEnergyType(c) === type);
}

const teams = new Map<string, TeamMember[]>();
export function foes(leader: Leader): TeamMember[] {
  let t = teams.get(leader.id);
  if (!t || !t.length) teams.set(leader.id, (t = leaderTeam(leader, allCards)));
  return t;
}

/** Types qui font mal à l'équipe d'un champion (faiblesses de ses Pokémon). */
export function weakTypes(leader: Leader): EnergyType[] {
  const out = new Set<EnergyType>();
  for (const m of foes(leader)) for (const w of m.card.weaknesses ?? []) out.add(w.type as EnergyType);
  return [...out];
}

/** Atout d'un Pokémon contre un champion : +2 s'il frappe une faiblesse, −1 s'il craint son type. */
export function advantage(card: Card, leader: Leader): number {
  const weak = weakTypes(leader);
  return (weak.includes(mainType(card.types)) ? 2 : 0) - (card.weaknesses?.some((w) => w.type === leader.type) ? 1 : 0);
}

export function maxDamage(card: Card): number {
  return Math.max(0, ...(card.attacks ?? []).map((a) => a.damage));
}

export function unlocked(index: number): boolean {
  return index === 0 || getState().arena.badges.includes(LEADERS[index - 1].id);
}

export function badgeLetter(leader: Leader): string {
  return leader.badge.replace(/^Badge\s+/i, '')[0];
}

/** Équipe du joueur prête pour un combat. */
export function playerTeam(): TeamMember[] {
  return getState()
    .team.map((t) => {
      const card = full(t.cardId);
      if (!card || !isPlayablePokemon(card)) return null;
      const energies = t.energies
        .map((id) => full(id))
        .map((c) => (c ? basicEnergyType(c) : null))
        .filter((e): e is EnergyType => !!e);
      return { card, energies };
    })
    .filter((m): m is TeamMember => !!m);
}
