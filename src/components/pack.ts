import { mascotUrl, PACK_LAYOUT, type BoosterDef } from '../data/boosters';
import { setLogoUrl } from '../api';
import { asset } from '../assets';
import { h } from '../dom';

/** Bord dentelé du sachet, en polygone CSS. */
function zig(n: number, top: boolean): string {
  const pts: string[] = [];
  if (top) {
    pts.push('0% 100%');
    for (let i = 0; i <= n; i++) pts.push(`${((i / n) * 100).toFixed(2)}% ${i % 2 ? '0%' : '38%'}`);
    pts.push('100% 100%');
  } else {
    pts.push('0% 0%', '100% 0%');
    for (let i = n; i >= 0; i--) pts.push(`${((i / n) * 100).toFixed(2)}% ${i % 2 ? '100%' : '98.4%'}`);
  }
  return `polygon(${pts.join(',')})`;
}
const TOP = zig(28, true);
const BOT = zig(28, false);

export interface PackEl extends HTMLElement {
  /** Avancement de la déchirure (0 à 1) */
  setTear(t: number): void;
  /** Bande du haut arrachée */
  setTorn(): void;
}

/** Sachet de booster ; sa largeur vient du conteneur (proportions 3:5). */
export function packEl(def: BoosterDef): PackEl {
  const total = PACK_LAYOUT.common + PACK_LAYOUT.uncommon + PACK_LAYOUT.rare;
  const logo = h('img', { class: 'bp-logo', src: asset(setLogoUrl(def.setId)), alt: '', draggable: 'false', loading: 'lazy' });
  logo.addEventListener('error', () => logo.remove());
  const tear = h('div', { class: 'bp-tear' });
  const strip = h('div', { class: 'bp-strip', style: `clip-path:${TOP}` });
  const el = h(
    'div',
    { class: 'bpack', style: `--hue:${def.hue}`, 'aria-label': def.name },
    h(
      'div',
      { class: 'bp-body', style: `clip-path:${BOT}` },
      h('div', { class: 'bp-stripes' }),
      h('div', { class: 'bp-shine' }),
      h('div', { class: 'bp-glow' }),
      logo,
      h('img', { class: 'bp-art', src: asset(mascotUrl(def.mascot)), alt: '', draggable: 'false', loading: 'lazy' }),
      h('div', { class: 'bp-text' }, h('span', { class: 'bp-name' }, def.name), h('span', { class: 'bp-count' }, `${total} CARTES`)),
      h('div', { class: 'bp-crimp' }),
    ),
    tear,
    strip,
  );
  return Object.assign(el, {
    setTear(t: number) {
      tear.style.width = `${t * 100}%`;
      tear.style.opacity = t > 0 ? '1' : '0';
      strip.style.transform = `translateY(${-t * 3}cqw) rotate(${-t * 7}deg)`;
    },
    setTorn() {
      tear.style.width = '100%';
      tear.style.opacity = '1';
      el.classList.add('torn');
    },
  });
}
