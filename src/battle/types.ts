/** Les 11 types d'énergie du JCC : libellé français, couleur et bonus passif en combat. */
export type EnergyType =
  | 'Grass'
  | 'Fire'
  | 'Water'
  | 'Lightning'
  | 'Psychic'
  | 'Fighting'
  | 'Darkness'
  | 'Metal'
  | 'Fairy'
  | 'Dragon'
  | 'Colorless';

export interface TypeInfo {
  label: string;
  color: string;
  icon: string;
  /** Description du bonus passif, affichée dans l'équipe et en combat */
  passive: string;
}

export const TYPE_INFO: Record<EnergyType, TypeInfo> = {
  Grass: { label: 'Plante', color: '#5cc46a', icon: '🌿', passive: '30 % de chance d’empoisonner (10 dégâts / tour)' },
  Fire: { label: 'Feu', color: '#f2804a', icon: '🔥', passive: '30 % de chance de brûler (20 dégâts / tour)' },
  Water: { label: 'Eau', color: '#4ea6f2', icon: '💧', passive: 'Se soigne de 20 PV en attaquant' },
  Lightning: { label: 'Électrique', color: '#f4cf3a', icon: '⚡', passive: '25 % de chance de paralyser (passe son tour)' },
  Psychic: { label: 'Psy', color: '#b974e0', icon: '🔮', passive: 'Ignore les résistances' },
  Fighting: { label: 'Combat', color: '#c97a45', icon: '👊', passive: '+10 dégâts' },
  Darkness: { label: 'Obscurité', color: '#8a86b0', icon: '🌑', passive: '+20 dégâts contre un Pokémon déjà blessé' },
  Metal: { label: 'Métal', color: '#8d9aa6', icon: '⚙️', passive: '−10 dégâts reçus' },
  Fairy: { label: 'Fée', color: '#e77fb6', icon: '✨', passive: 'Soigne 10 PV à chaque fin de tour' },
  Dragon: { label: 'Dragon', color: '#b39234', icon: '🐉', passive: '+10 dégâts et 10 % de coup critique' },
  Colorless: { label: 'Incolore', color: '#d6d2c4', icon: '⭐', passive: '20 % de coup critique (+50 %)' },
};

export const ENERGY_TYPES = Object.keys(TYPE_INFO) as EnergyType[];

export function isEnergyType(t: string): t is EnergyType {
  return t in TYPE_INFO;
}

/** Type principal d'une carte (Incolore par défaut). */
export function mainType(types: string[] | undefined): EnergyType {
  const t = types?.find(isEnergyType);
  return t ?? 'Colorless';
}
