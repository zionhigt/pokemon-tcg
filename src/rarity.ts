/** Paliers de rareté utilisés par le jeu (du plus commun au plus rare). */
export type Tier = 'common' | 'uncommon' | 'rare' | 'holo' | 'ultra' | 'secret';

export const TIERS: Tier[] = ['common', 'uncommon', 'rare', 'holo', 'ultra', 'secret'];

export const TIER_LABEL: Record<Tier, string> = {
  common: 'Commune',
  uncommon: 'Peu commune',
  rare: 'Rare',
  holo: 'Holo',
  ultra: 'Ultra rare',
  secret: 'Secrète',
};

/**
 * Valeur de revente d'une carte, en fraction du prix du booster dont elle provient.
 * Calibré pour qu'un booster de 10 cartes (6 communes, 3 peu communes, 1 rare au minimum)
 * rapporte toujours plus que son prix : 6×0.07 + 3×0.12 + 0.30 = 1.08.
 */
export const TIER_VALUE: Record<Tier, number> = {
  common: 0.07,
  uncommon: 0.12,
  rare: 0.3,
  holo: 0.6,
  ultra: 1.2,
  secret: 3,
};

/** Convertit la rareté renvoyée par l'API Pokémon TCG en palier de jeu. */
export function tierOf(rarity: string | undefined): Tier {
  const r = (rarity ?? '').toLowerCase();
  if (!r || r === 'common') return 'common';
  if (r === 'uncommon') return 'uncommon';
  if (/secret|hyper|rainbow|gold|special illustration|shiny ultra|mega hyper/.test(r)) return 'secret';
  if (/ultra|illustration|double rare|vmax|vstar|gx|ex|\bv\b|break|prime|legend|amazing|ace spec|radiant|prism|star|lv\.x|shining/.test(r))
    return 'ultra';
  if (/holo|shiny|promo|classic/.test(r)) return 'holo';
  if (/rare/.test(r)) return 'rare';
  return 'common';
}

export function tierIndex(t: Tier): number {
  return TIERS.indexOf(t);
}
