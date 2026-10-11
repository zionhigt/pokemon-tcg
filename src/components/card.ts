import type { Card } from '../api';
import { cardImage, cardName } from '../cardLang';
import { h } from '../dom';
import { tierIndex } from '../rarity';

/** Carte avec effet holographique qui suit le pointeur pour les raretés holo et plus. */
export function cardEl(card: Card, opts: { faceDown?: boolean; large?: boolean } = {}): HTMLElement {
  const shiny = tierIndex(card.tier) >= tierIndex('holo');
  const { src, fallback } = cardImage(card, opts.large);
  const img = h('img', { src, alt: cardName(card), loading: 'lazy', draggable: 'false' });
  // Image française absente ou hors-ligne : on affiche la version anglaise
  if (src !== fallback) img.addEventListener('error', () => (img.src = fallback), { once: true });
  const el = h(
    'div',
    { class: `card tier-${card.tier} ${shiny ? 'shiny' : ''} ${opts.faceDown ? 'face-down' : ''}` },
    h(
      'div',
      { class: 'card-inner' },
      h('div', { class: 'card-back' }),
      h(
        'div',
        { class: 'card-front' },
        img,
        shiny ? h('div', { class: 'card-holo' }) : null,
        shiny ? h('div', { class: 'card-glare' }) : null,
      ),
    ),
  );
  if (shiny) attachTilt(el);
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
