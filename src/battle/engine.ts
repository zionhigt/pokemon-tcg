import type { Attack, Card } from '../api';
import { attackCost, boostApplies, computeDamage, MAX_CHARGE, type DamageResult } from './rules';
import { mainType, type EnergyType } from './types';

export type Status = 'poison' | 'burn' | 'paralysis';
export type SideId = 'player' | 'foe';

export interface Fighter {
  card: Card;
  hp: number;
  maxHp: number;
  /** Énergies accumulées (une par tour passé en Pokémon actif) */
  charge: number;
  status: Status | null;
  /** Cartes Énergie équipées, chacune activable une fois par combat */
  energies: EnergyType[];
}

export interface Side {
  fighters: Fighter[];
  active: number;
  retreated: boolean;
}

export type BattleEvent =
  | { kind: 'attack'; side: SideId; attack: string; result: DamageResult; energy?: EnergyType }
  | { kind: 'status'; side: SideId; status: Status }
  | { kind: 'tick'; side: SideId; status: Status; amount: number }
  | { kind: 'heal'; side: SideId; amount: number }
  | { kind: 'paralyzed'; side: SideId }
  | { kind: 'ko'; side: SideId; name: string }
  | { kind: 'switch'; side: SideId; name: string };

export interface Battle {
  player: Side;
  foe: Side;
  turn: SideId;
  round: number;
  winner: SideId | null;
  /** Le joueur doit choisir un remplaçant après un K.O. */
  needsSwitch: SideId | null;
  rng: () => number;
}

export interface TeamMember {
  card: Card;
  energies: EnergyType[];
}

function fighter({ card, energies }: TeamMember): Fighter {
  return { card, hp: card.hp ?? 50, maxHp: card.hp ?? 50, charge: 0, status: null, energies: [...energies] };
}

export function createBattle(player: TeamMember[], foe: TeamMember[], rng: () => number = Math.random): Battle {
  const b: Battle = {
    player: { fighters: player.map(fighter), active: 0, retreated: false },
    foe: { fighters: foe.map(fighter), active: 0, retreated: false },
    turn: 'player',
    round: 1,
    winner: null,
    needsSwitch: null,
    rng,
  };
  startTurn(b);
  return b;
}

export const other = (s: SideId): SideId => (s === 'player' ? 'foe' : 'player');
export const active = (b: Battle, s: SideId): Fighter => b[s].fighters[b[s].active];
export const alive = (b: Battle, s: SideId): number[] =>
  b[s].fighters.map((f, i) => (f.hp > 0 ? i : -1)).filter((i) => i >= 0);

export function canAttack(f: Fighter, attack: Attack): boolean {
  return f.hp > 0 && f.status !== 'paralysis' && f.charge >= attackCost(attack);
}

/** Énergies équipées utilisables sur cette attaque. */
export function usableEnergies(f: Fighter, attack: Attack): EnergyType[] {
  return [...new Set(f.energies.filter((e) => boostApplies(e, attack, f.card)))];
}

export function canRetreat(b: Battle, s: SideId): boolean {
  const f = active(b, s);
  return !b[s].retreated && f.status !== 'paralysis' && f.charge >= (f.card.retreat ?? 0) && alive(b, s).length > 1;
}

function startTurn(b: Battle): void {
  const f = active(b, b.turn);
  f.charge = Math.min(MAX_CHARGE, f.charge + 1);
  b[b.turn].retreated = false;
}

/** Effets de fin de tour (poison, brûlure, soin Fée) sur le Pokémon actif de `s`. */
function endOfTurn(b: Battle, s: SideId, events: BattleEvent[]): void {
  const f = active(b, s);
  if (f.hp <= 0) return;
  if (f.status === 'poison' || f.status === 'burn') {
    const amount = f.status === 'poison' ? 10 : 20;
    f.hp = Math.max(0, f.hp - amount);
    events.push({ kind: 'tick', side: s, status: f.status, amount });
    if (f.hp <= 0) return knockOut(b, s, events);
  }
  if (mainType(f.card.types) === 'Fairy' && f.hp < f.maxHp) {
    const amount = Math.min(10, f.maxHp - f.hp);
    f.hp += amount;
    events.push({ kind: 'heal', side: s, amount });
  }
}

function knockOut(b: Battle, s: SideId, events: BattleEvent[]): void {
  const f = active(b, s);
  f.status = null;
  events.push({ kind: 'ko', side: s, name: f.card.name });
  if (!alive(b, s).length) b.winner = other(s);
  else b.needsSwitch = s;
}

function passTurn(b: Battle, events: BattleEvent[]): void {
  endOfTurn(b, b.turn, events);
  if (b.winner || b.needsSwitch) return;
  b.turn = other(b.turn);
  if (b.turn === 'player') b.round++;
  startTurn(b);
}

/** Le Pokémon actif paralysé passe son tour (la paralysie est levée). */
export function skipParalyzed(b: Battle): BattleEvent[] {
  const f = active(b, b.turn);
  const events: BattleEvent[] = [{ kind: 'paralyzed', side: b.turn }];
  f.status = null;
  passTurn(b, events);
  return events;
}

export function doAttack(b: Battle, index: number, energy?: EnergyType): BattleEvent[] {
  const s = b.turn;
  const me = active(b, s);
  const foe = active(b, other(s));
  const attack = me.card.attacks?.[index];
  if (!attack || !canAttack(me, attack) || b.winner) return [];
  const events: BattleEvent[] = [];

  const boost = !!energy && me.energies.includes(energy) && boostApplies(energy, attack, me.card);
  if (boost) me.energies.splice(me.energies.indexOf(energy!), 1);
  const result = computeDamage(me.card, foe.card, attack, { boost, defenderDamaged: foe.hp < foe.maxHp, rng: b.rng });
  foe.hp = Math.max(0, foe.hp - result.amount);
  events.push({ kind: 'attack', side: s, attack: attack.name, result, energy: boost ? energy : undefined });

  const type = mainType(me.card.types);
  if (result.amount > 0 && foe.hp > 0 && !foe.status) {
    const roll = b.rng();
    const status: Status | null =
      type === 'Fire' && roll < 0.3 ? 'burn' : type === 'Grass' && roll < 0.3 ? 'poison' : type === 'Lightning' && roll < 0.25 ? 'paralysis' : null;
    if (status) {
      foe.status = status;
      events.push({ kind: 'status', side: other(s), status });
    }
  }
  if (type === 'Water' && me.hp < me.maxHp) {
    const amount = Math.min(20, me.maxHp - me.hp);
    me.hp += amount;
    events.push({ kind: 'heal', side: s, amount });
  }
  // Après un K.O., le tour se termine une fois le remplaçant choisi (doReplace)
  if (foe.hp <= 0) knockOut(b, other(s), events);
  else passTurn(b, events);
  return events;
}

/** Retraite volontaire : coûte la retraite de la carte en charges, ne termine pas le tour. */
export function doRetreat(b: Battle, to: number): BattleEvent[] {
  const s = b.turn;
  if (!canRetreat(b, s) || to === b[s].active || b[s].fighters[to]?.hp <= 0) return [];
  const f = active(b, s);
  f.charge -= f.card.retreat ?? 0;
  f.status = null;
  b[s].active = to;
  b[s].retreated = true;
  return [{ kind: 'switch', side: s, name: b[s].fighters[to].card.name }];
}

/** Remplacement après K.O. (gratuit). */
export function doReplace(b: Battle, to: number): BattleEvent[] {
  const s = b.needsSwitch;
  if (!s || b[s].fighters[to]?.hp <= 0) return [];
  b[s].active = to;
  b.needsSwitch = null;
  const events: BattleEvent[] = [{ kind: 'switch', side: s, name: b[s].fighters[to].card.name }];
  // Le K.O. a eu lieu pendant le tour de `b.turn` : on termine ce tour normalement
  passTurn(b, events);
  return events;
}

export function doPass(b: Battle): BattleEvent[] {
  const events: BattleEvent[] = [];
  passTurn(b, events);
  return events;
}

/* ---------- IA des champions ---------- */

function expected(b: Battle, s: SideId, f: Fighter, attack: Attack): number {
  const target = active(b, other(s));
  return computeDamage(f.card, target.card, attack, { boost: false, defenderDamaged: target.hp < target.maxHp, rng: () => 1 }).amount;
}

/** Meilleur remplaçant : celui qui frappe le plus fort le Pokémon actif adverse. */
export function aiPickReplacement(b: Battle, s: SideId): number {
  const options = alive(b, s);
  const score = (i: number) => Math.max(0, ...(b[s].fighters[i].card.attacks ?? []).map((a) => expected(b, s, b[s].fighters[i], a)));
  return options.sort((x, y) => score(y) - score(x))[0];
}

/** Tour de l'IA : attaque la plus forte payable (avec énergie si utile), sinon attend. */
export function aiTurn(b: Battle): BattleEvent[] {
  const s = b.turn;
  const me = active(b, s);
  if (me.status === 'paralysis') return skipParalyzed(b);
  const target = active(b, other(s));
  const options = (me.card.attacks ?? [])
    .map((a, i) => ({ a, i, dmg: expected(b, s, me, a) }))
    .filter((o) => canAttack(me, o.a) && o.a.damage > 0)
    .sort((x, y) => y.dmg - x.dmg);
  const best = options[0];
  if (!best) return doPass(b);
  // L'énergie est gardée pour achever ou pour une grosse attaque
  const energy = usableEnergies(me, best.a)[0];
  const useEnergy = energy && (best.dmg < target.hp ? best.dmg * 1.5 >= target.hp || best.dmg >= 60 : false);
  return doAttack(b, best.i, useEnergy ? energy : undefined);
}
