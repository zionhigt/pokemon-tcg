import type { BoosterDef } from './data/boosters';
import { credits, h, replay } from './dom';

/**
 * Coque de l'app : en-tête (titre, boosters scellés, crédits), zone de page
 * et barre d'onglets ancrée en bas. Chaque écran tient dans la hauteur de l'écran.
 */
export type TabId = 'boutique' | 'collection' | 'arenes';

const title = h('span', { class: 'head-title' });
const subtitle = h('span', { class: 'head-sub' });
const sealedCount = h('span', { class: 'sealed-n' });
const sealedDot = h('span', { class: 'sealed-dot' });
export const sealedBtn = h(
  'button',
  { class: 'sealed-btn', 'aria-label': 'Ouvrir un booster scellé' },
  h('span', { class: 'mini-pack', 'aria-hidden': 'true' }),
  sealedCount,
  sealedDot,
);
export const coinsBtn = h('button', { class: 'coins', 'aria-label': 'Crédits et réglages' });
export const main = h('main', { id: 'main', class: 'app-main' });

const TABS: { id: TabId; label: string }[] = [
  { id: 'boutique', label: 'Boutique' },
  { id: 'collection', label: 'Collection' },
  { id: 'arenes', label: 'Arènes' },
];
const tabBtns = new Map<TabId, HTMLAnchorElement>();
export const tabbar = h(
  'nav',
  { class: 'tabbar', 'aria-label': 'Navigation principale' },
  ...TABS.map((t) => {
    const a = h('a', { href: `#/${t.id}`, class: 'tab' }, h('span', { class: `tab-ico ico-${t.id}`, 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')), h('span', {}, t.label));
    tabBtns.set(t.id, a);
    return a;
  }),
);

export function buildShell(app: HTMLElement): void {
  app.classList.add('shell');
  app.append(h('header', { class: 'app-head' }, h('div', { class: 'head-titles' }, title, subtitle), sealedBtn, coinsBtn), main, tabbar);
}

export function setHead(t: string, sub: string): void {
  title.textContent = t;
  subtitle.textContent = sub;
}

export function setActiveTab(id: TabId): void {
  tabBtns.forEach((a, k) => {
    a.classList.toggle('on', k === id);
    if (k === id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

/** Masque la barre d'onglets (mode sélection de la collection). */
export function setTabsHidden(hidden: boolean): void {
  tabbar.hidden = hidden;
}

let shownCredits: number | null = null;
export function renderCoins(value: number): void {
  const from = shownCredits ?? value;
  shownCredits = value;
  if (from === value) {
    coinsBtn.textContent = credits(value);
    return;
  }
  replay(coinsBtn, 'bump');
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / 450);
    coinsBtn.textContent = credits(Math.round(from + (value - from) * t));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

let shownSealed: number | null = null;
export function renderSealed(n: number): void {
  if (shownSealed !== null && n > shownSealed) setTimeout(() => replay(sealedBtn, 'bump'), 650);
  shownSealed = n;
  sealedCount.textContent = String(n);
  sealedDot.hidden = !n;
  sealedBtn.classList.toggle('empty', !n);
}

/** Petit booster qui s'envole de `from` vers le bouton des boosters scellés. */
export function flyToSealed(from: Element, def: BoosterDef): void {
  const a = from.getBoundingClientRect();
  const b = sealedBtn.getBoundingClientRect();
  const el = h('div', { class: 'fly-pack', style: `--hue:${def.hue}` });
  document.body.append(el);
  const x0 = a.left + a.width / 2 - 28;
  const y0 = a.top + a.height / 2 - 46;
  const x1 = b.left + 14 - 28;
  const y1 = b.top + b.height / 2 - 46;
  el.animate(
    [
      { transform: `translate(${x0}px,${y0}px) scale(1)`, opacity: 1 },
      { transform: `translate(${x1}px,${y1}px) scale(.14)`, opacity: 0.5 },
    ],
    { duration: 700, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' },
  ).onfinish = () => el.remove();
}
