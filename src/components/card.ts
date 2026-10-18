import type { Card } from '../api';
import { mainType, TYPE_INFO } from '../battle/types';
import { cardImage, cardName } from '../cardLang';
import { h } from '../dom';
import { tierIndex } from '../rarity';

export interface CardOpts {
  faceDown?: boolean;
  large?: boolean;
  /** Pastille ×N (masquée en mode sélection) */
  count?: number;
  fav?: boolean;
  isNew?: boolean;
  /** Valeur du tri en cours, affichée en bas à gauche */
  metric?: string;
  /** Étiquette en bas de carte (Place 1, Fort, Booste…) */
  tag?: string;
  tagBg?: string;
  /** Carte grisée (indisponible, K.O.) */
  dim?: boolean;
  /** Mode sélection multiple : case à cocher */
  selecting?: boolean;
  selected?: boolean;
  /** Inclinaison au pointeur même pour une carte non holo (fiche carte) */
  tilt?: boolean;
}

/** Carte à jouer, avec effet holographique qui suit le pointeur pour les raretés holo et plus. */
export function cardEl(card: Card, opts: CardOpts = {}): HTMLElement {
  const shiny = tierIndex(card.tier) >= tierIndex('holo');
  const { src, fallback } = cardImage(card, opts.large);
  const img = h('img', { src, alt: cardName(card), loading: 'lazy', draggable: 'false' });
  // Image française absente ou hors-ligne : on affiche la version anglaise
  if (src !== fallback) img.addEventListener('error', () => (img.src = fallback), { once: true });
  const color = card.supertype === 'Pokémon' || card.supertype === 'Energy' ? TYPE_INFO[mainType(card.types)].color : '#8a84b8';
  const cls = ['card', `tier-${card.tier}`, shiny && 'shiny', opts.faceDown && 'face-down', opts.dim && 'dim', opts.selected && 'selected'];
  const el = h(
    'div',
    { class: cls.filter(Boolean).join(' '), style: `--type:${color}` },
    h(
      'div',
      { class: 'card-inner' },
      h('div', { class: 'card-back' }),
      h(
        'div',
        { class: 'card-front' },
        h('span', { class: 'card-fallback' }, cardName(card)),
        img,
        shiny && !opts.dim ? h('div', { class: 'card-holo' }) : null,
        shiny || opts.tilt ? h('div', { class: 'card-glare' }) : null,
      ),
    ),
    !opts.selecting && (opts.count ?? 0) > 1 ? h('span', { class: 'cb cb-count' }, `×${opts.count}`) : null,
    opts.fav && !opts.selecting ? h('span', { class: 'cb cb-fav', 'aria-label': 'Favori' }, '♥') : null,
    opts.isNew ? h('span', { class: 'cb cb-new' }, 'NEW') : null,
    opts.metric ? h('span', { class: 'cb cb-metric' }, opts.metric) : null,
    opts.tag ? h('span', { class: 'cb cb-tag', style: `background:${opts.tagBg ?? '#43d18d'}` }, opts.tag) : null,
    opts.selecting ? h('span', { class: `cb cb-check ${opts.selected ? 'on' : ''}` }, opts.selected ? '✓' : '') : null,
  );
  if (shiny || opts.tilt) attachTilt(el);
  return el;
}

export function attachTilt(el: HTMLElement): void {
  const move = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
    el.style.setProperty('--rx', `${(0.5 - y) * 18}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 22}deg`);
    el.classList.add('tilting');
  };
  const leave = () => {
    el.classList.remove('tilting');
    el.style.removeProperty('--rx');
    el.style.removeProperty('--ry');
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  el.addEventListener('pointercancel', leave);
}
