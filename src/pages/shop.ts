import { BOOSTERS, PACK_LAYOUT, type BoosterDef } from '../data/boosters';
import { packEl } from '../components/pack';
import { credits, dots, h, justSwiped, plural, segmented, swiper, toast } from '../dom';
import { oddsOf } from '../gacha';
import { TIER_LABEL, TIER_VALUE } from '../rarity';
import { navigate } from '../router';
import { confirmSale } from '../sell';
import { flyToSealed } from '../shell';
import { buyPack, getState, planBulk, subscribe, type OwnedCard } from '../state';
import { openSealed, prefetchBooster } from './open';

const OPTS_KEY = 'ptcg:sell-options';

/** État de la boutique, conservé d'un onglet à l'autre. */
const ui = { view: 'boosters' as 'boosters' | 'sell', index: 0, keepOne: true };
try {
  ui.keepOne = JSON.parse(localStorage.getItem(OPTS_KEY) ?? '{}').keepOne ?? true;
} catch {
  /* ignore */
}

/** Valeur de revente minimale garantie d'un booster (pire tirage possible). */
function guaranteed(price: number): number {
  return Math.round(
    price * (PACK_LAYOUT.common * TIER_VALUE.common + PACK_LAYOUT.uncommon * TIER_VALUE.uncommon + PACK_LAYOUT.rare * TIER_VALUE.rare),
  );
}

/** Ventes en masse proposées dans l'onglet Revendre. */
const BULK: { key: string; title: string; filter: (o: OwnedCard) => boolean; dupes?: boolean; label: string }[] = [
  { key: 'dup', title: 'Tous les doublons', filter: () => true, dupes: true, label: 'tous les doublons' },
  { key: 'common', title: 'Communes', filter: (o) => o.card.tier === 'common', label: 'les communes' },
  { key: 'uncommon', title: 'Peu communes', filter: (o) => o.card.tier === 'uncommon', label: 'les peu communes' },
  { key: 'rare', title: 'Rares & Holo', filter: (o) => o.card.tier === 'rare' || o.card.tier === 'holo', label: 'les rares & holo' },
];

function bulkPlan(b: (typeof BULK)[number]) {
  return planBulk(b.filter, b.dupes || ui.keepOne);
}

export function shopPage(root: HTMLElement, param?: string): () => void {
  if (param === 'revente') ui.view = 'sell';
  const page = h('section', { class: 'page shop' });
  root.append(page);

  const draw = () => {
    const dup = bulkPlan(BULK[0]);
    const seg = segmented(
      [
        { key: 'boosters', label: 'Boosters' },
        { key: 'sell', label: 'Revendre', badge: dup.count ? `+${credits(dup.gain)}` : undefined },
      ],
      ui.view,
      (k) => {
        ui.view = k;
        draw();
      },
      'seg-lg',
    );
    page.replaceChildren(seg, ui.view === 'boosters' ? boostersView() : sellView(draw));
  };

  draw();
  return subscribe(() => {
    // Le carrousel garde sa position : seuls les infos et boutons dépendent de l'état
    if (ui.view === 'boosters') page.querySelector<HTMLElement & { refresh?: () => void }>('.boosters')?.refresh?.();
    else draw();
    const badge = page.querySelector('.seg-lg');
    if (badge && ui.view === 'boosters') {
      const dup = bulkPlan(BULK[0]);
      const b = badge.querySelectorAll('button')[1];
      b.querySelector('.seg-badge')?.remove();
      if (dup.count) b.append(h('span', { class: 'seg-badge' }, `+${credits(dup.gain)}`));
    }
  });
}

/* ---------- Boosters ---------- */

function boostersView(): HTMLElement {
  const items = BOOSTERS.map((def, i) => {
    const pack = packEl(def);
    const item = h('div', { class: 'car-item' }, h('div', { class: 'car-float' }, pack));
    item.onclick = () => {
      if (justSwiped() || i === ui.index) return;
      go(i);
    };
    return item;
  });
  const rail = h('div', { class: 'car-rail' }, ...items);
  const viewport = h('div', { class: 'carousel' }, rail);
  const dotsHost = h('div');
  const info = h('div', { class: 'set-info' });
  const odds = h('div', { class: 'odds-card' });
  const buys = h('div', { class: 'buy-row' });
  const view = h('div', { class: 'boosters' }, viewport, dotsHost, info, odds, buys);

  const pos = (i: number, dx: number) => `translateX(calc((100% - var(--pw)) / 2 - ${i} * (var(--pw) + 20px) + ${dx}px))`;
  const sw = swiper(viewport, rail, { count: () => BOOSTERS.length, index: () => ui.index, pos, go: (i) => go(i) });
  const go = (i: number) => {
    ui.index = i;
    sw.place();
    refresh();
  };

  const refresh = () => {
    const s = getState();
    const def = BOOSTERS[ui.index];
    items.forEach((it, i) => it.classList.toggle('on', i === ui.index));
    dotsHost.replaceChildren(dots(BOOSTERS.length, ui.index, go));
    info.replaceChildren(
      h('span', { class: 'set-name' }, def.name),
      h('span', { class: 'set-tag' }, def.subtitle),
      h(
        'div',
        { class: 'set-meta' },
        h('span', { class: 'good' }, `Revente garantie ≥ ${credits(guaranteed(def.price))}`),
        h('span', { class: 'mono muted' }, `+${Math.round(def.bonusChance * 100)} % carte bonus`),
      ),
    );
    const o = oddsOf(def);
    odds.replaceChildren(
      h(
        'div',
        { class: 'odds-head' },
        h('span', { class: 'eyebrow' }, 'SLOT RARE'),
        h('span', { class: 'mono dim' }, `${PACK_LAYOUT.common} C · ${PACK_LAYOUT.uncommon} PC · ${PACK_LAYOUT.rare} rare`),
      ),
      h('div', { class: 'odds-bar' }, ...o.map((x) => h('span', { style: `flex:${x.pct};background:var(--t-${x.tier})` }))),
      h(
        'div',
        { class: 'odds-legend' },
        ...o.map((x) => h('span', {}, h('i', { style: `background:var(--t-${x.tier})` }), TIER_LABEL[x.tier], h('b', {}, `${x.pct} %`))),
      ),
    );
    const can1 = s.credits >= def.price;
    const can5 = s.credits >= def.price * 5;
    const b1 = h('button', { class: `btn big grow-15 ${can1 ? 'primary' : 'off'}` }, can1 ? `Acheter · ${credits(def.price)}` : `Il manque ${credits(def.price - s.credits)}`);
    const b5 = h('button', { class: `btn big grow ${can5 ? '' : 'faded'}` }, `×5 · ${credits(def.price * 5)}`);
    b1.onclick = () => buy(def, 1, items[ui.index]);
    b5.onclick = () => buy(def, 5, items[ui.index]);
    buys.replaceChildren(b1, b5);
  };
  sw.place();
  refresh();
  return Object.assign(view, { refresh });
}

function buy(def: BoosterDef, qty: number, from: Element): void {
  const s = getState();
  const cost = def.price * qty;
  if (s.credits < cost) {
    toast(`Il te manque ${credits(cost - s.credits)} — revends quelques doublons.`, {
      label: 'Revendre',
      fn: () => {
        ui.view = 'sell';
        navigate('boutique/revente');
      },
    });
    return;
  }
  flyToSealed(from, def);
  buyPack(def.id, qty);
  prefetchBooster(def);
  toast(`${plural(qty, 'booster')} ${def.name} ajouté${qty > 1 ? 's' : ''}`, { label: 'Ouvrir', fn: () => openSealed(def.id) });
}

/* ---------- Revente ---------- */

function sellView(redraw: () => void): HTMLElement {
  const s = getState();
  const toggle = h(
    'button',
    { class: 'row-card toggle-row', role: 'switch', 'aria-checked': ui.keepOne },
    h('span', {}, 'Garder 1 exemplaire de chaque carte'),
    h('span', { class: `switch ${ui.keepOne ? 'on' : ''}` }, h('i')),
  );
  toggle.onclick = () => {
    ui.keepOne = !ui.keepOne;
    try {
      localStorage.setItem(OPTS_KEY, JSON.stringify({ keepOne: ui.keepOne }));
    } catch {
      /* ignore */
    }
    redraw();
  };
  const tiles = h(
    'div',
    { class: 'sell-tiles' },
    ...BULK.map((b) => {
      const p = bulkPlan(b);
      const t = h(
        'button',
        { class: `sell-tile ${b.dupes && p.count ? 'hl' : ''} ${p.count ? '' : 'faded'}` },
        h('span', { class: 'st-head' }, h('b', {}, b.title), h('span', { class: 'mono muted' }, p.count ? plural(p.count, 'carte') : 'aucune')),
        h('span', { class: `st-amount ${p.count ? '' : 'none'}` }, p.count ? `+${credits(p.gain)}` : '—'),
      );
      t.onclick = () => {
        if (p.count) void confirmSale(p, `Vendre ${b.label} ?`, `${plural(p.count, 'carte')} · favoris et équipe exclus.`);
      };
      return t;
    }),
  );
  const unit = h(
    'button',
    { class: 'row-card unit-row' },
    h('span', { class: 'grow col' }, h('b', {}, 'À l’unité'), h('span', { class: 'muted' }, 'Coche des cartes dans ta collection')),
    h('span', { class: 'chev' }, '›'),
  );
  unit.onclick = () => navigate('collection/vendre');
  const stat = (v: string, l: string) => h('div', {}, h('b', {}, v), h('span', {}, l));
  return h(
    'div',
    { class: 'sell-view' },
    toggle,
    tiles,
    h('p', { class: 'note' }, '♥ Les favoris, ton équipe d’arène et ses énergies ne partent jamais dans une vente en masse.'),
    unit,
    h('div', { class: 'stats-row three push' }, stat(credits(s.stats.spent), 'Dépensé'), stat(credits(s.stats.earned), 'Gagné'), stat(String(s.stats.sold), 'Vendues')),
  );
}

