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
  Grass: { label: 'Plante', color: '#3fae4a', icon: '🌿', passive: '30 % de chance d’empoisonner (10 dégâts / tour)' },
  Fire: { label: 'Feu', color: '#e8542c', icon: '🔥', passive: '30 % de chance de brûler (20 dégâts / tour)' },
  Water: { label: 'Eau', color: '#3b8fe0', icon: '💧', passive: 'Se soigne de 20 PV en attaquant' },
  Lightning: { label: 'Électrique', color: '#f2c200', icon: '⚡', passive: '25 % de chance de paralyser (passe son tour)' },
  Psychic: { label: 'Psy', color: '#9b4fc9', icon: '🔮', passive: 'Ignore les résistances' },
  Fighting: { label: 'Combat', color: '#b5622d', icon: '👊', passive: '+10 dégâts' },
  Darkness: { label: 'Obscurité', color: '#6a7a90', icon: '🌑', passive: '+20 dégâts contre un Pokémon déjà blessé' },
  Metal: { label: 'Métal', color: '#8d9aa6', icon: '⚙️', passive: '−10 dégâts reçus' },
  Fairy: { label: 'Fée', color: '#e77fb6', icon: '✨', passive: 'Soigne 10 PV à chaque fin de tour' },
  Dragon: { label: 'Dragon', color: '#b39234', icon: '🐉', passive: '+10 dégâts et 10 % de coup critique' },
  Colorless: { label: 'Incolore', color: '#b8b8b0', icon: '⭐', passive: '20 % de coup critique (+50 %)' },
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
