import type { Attack, Card } from '../api';
import { isEnergyType, mainType, type EnergyType } from './types';

/**
 * Règles simplifiées : on garde les vraies stats des cartes (PV, dégâts, coûts,
 * faiblesses, résistances, retraite) et on remplace les effets écrits par un bonus par type.
 * Les cartes Dresseur, les Énergies spéciales et les Pokémon sans attaque offensive sont hors jeu.
 */

export const TEAM_SIZE = 3;
/** Cartes Énergie équipables par Pokémon */
export const MAX_ENERGIES = 2;
/** Multiplicateur d'une Énergie activée sur une attaque de son type */
export const ENERGY_BOOST = 1.5;
/** Charge maximale accumulable par un Pokémon */
export const MAX_CHARGE = 5;

/** Pokémon utilisable en combat : des PV et au moins une attaque qui fait des dégâts. */
export function isPlayablePokemon(card: Card): boolean {
  return card.supertype === 'Pokémon' && !!card.hp && !!card.attacks?.some((a) => a.damage > 0);
}

const ENERGY_NAMES: [RegExp, EnergyType][] = [
  [/grass|plante/i, 'Grass'],
  [/fire|feu/i, 'Fire'],
  [/water|eau/i, 'Water'],
  [/lightning|électrique|electrique/i, 'Lightning'],
  [/psychic|psy/i, 'Psychic'],
  [/fighting|combat/i, 'Fighting'],
  [/darkness|obscurité/i, 'Darkness'],
  [/metal|métal/i, 'Metal'],
  [/fairy|fée/i, 'Fairy'],
];

/** Type d'une carte Énergie de base (null pour les Énergies spéciales et les autres cartes). */
export function basicEnergyType(card: Card): EnergyType | null {
  if (card.supertype !== 'Energy' || card.subtypes?.includes('Special')) return null;
  const typed = card.types?.find(isEnergyType);
  if (typed) return typed;
  return ENERGY_NAMES.find(([re]) => re.test(card.name))?.[1] ?? null;
}

/** Une Énergie booste une attaque dont le coût contient son type (ou une attaque incolore d'un Pokémon de ce type). */
export function boostApplies(energy: EnergyType, attack: Attack, attacker: Card): boolean {
  if (attack.cost.includes(energy)) return true;
  return attack.cost.every((c) => c === 'Colorless') && mainType(attacker.types) === energy;
}

/** Coût d'une attaque en charges (une charge = une énergie quelconque). */
export function attackCost(attack: Attack): number {
  return attack.cost.length;
}

function applyMod(damage: number, value: string, sign: 1 | -1): number {
  const n = parseInt(value.replace(/[^\d]/g, '')) || 0;
  if (/[×x*]/i.test(value)) return sign > 0 ? damage * n : Math.floor(damage / n);
  return damage + sign * n;
}

export interface DamageResult {
  amount: number;
  weak: boolean;
  resisted: boolean;
  critical: boolean;
  boosted: boolean;
}

export function computeDamage(
  attacker: Card,
  defender: Card,
  attack: Attack,
  opts: { boost: boolean; defenderDamaged: boolean; rng: () => number },
): DamageResult {
  const type = mainType(attacker.types);
  let dmg = attack.damage;
  if (type === 'Fighting' || type === 'Dragon') dmg += 10;
  if (type === 'Darkness' && opts.defenderDamaged) dmg += 20;
  let critical = false;
  if ((type === 'Colorless' && opts.rng() < 0.2) || (type === 'Dragon' && opts.rng() < 0.1)) {
    critical = true;
    dmg = Math.round(dmg * 1.5);
  }
  if (opts.boost) dmg = Math.round(dmg * ENERGY_BOOST);

  const attackerTypes = attacker.types ?? [];
  const weakness = defender.weaknesses?.find((w) => attackerTypes.includes(w.type));
  if (weakness) dmg = applyMod(dmg, weakness.value, 1);
  const resistance = type === 'Psychic' ? undefined : defender.resistances?.find((r) => attackerTypes.includes(r.type));
  if (resistance) dmg = applyMod(dmg, resistance.value, -1);
  if (mainType(defender.types) === 'Metal') dmg -= 10;

  return { amount: Math.max(0, Math.round(dmg / 10) * 10), weak: !!weakness, resisted: !!resistance, critical, boosted: opts.boost };
}
