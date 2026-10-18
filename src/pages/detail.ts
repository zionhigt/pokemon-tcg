import { cardName, cardRarity, cardSetName } from '../cardLang';
import { mainType, TYPE_INFO } from '../battle/types';
import { cardEl } from '../components/card';
import { credits, h, plural, pushLayer } from '../dom';
import { TIER_LABEL } from '../rarity';
import { confirmSale, doSale } from '../sell';
import { getState, markSeen, planSale, protectedCounts, subscribe, toggleFavorite } from '../state';

/** Fiche carte plein écran : glisser pour passer d'une carte à l'autre, toucher pour la retourner. */
export function openDetail(ids: string[], id: string): void {
  let list = ids.filter((x) => getState().collection[x]);
  let current = id;
  let flipped = false;

  const closeBtn = h('button', { class: 'round-btn', 'aria-label': 'Fermer' }, '×');
  const counter = h('span', { class: 'mono muted grow center' });
  const favBtn = h('button', { class: 'round-btn fav', 'aria-label': 'Favori' }, '♥');
  const prev = h('button', { class: 'nav-arrow left', 'aria-label': 'Carte précédente' }, '‹');
  const next = h('button', { class: 'nav-arrow right', 'aria-label': 'Carte suivante' }, '›');
  const cardHost = h('div', { class: 'dt-card' });
  const info = h('div', { class: 'dt-info' });
  const actions = h('div', { class: 'dt-actions' });
  const layer = h(
    'div',
    { class: 'layer detail', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'dt-head' }, closeBtn, counter, favBtn),
    h('div', { class: 'dt-stage' }, prev, cardHost, next),
    info,
    actions,
  );
  let unsub = () => {};
  const close = pushLayer(layer, () => unsub());
  closeBtn.onclick = close;

  const nav = (dir: number) => {
    const j = list.indexOf(current) + dir;
    if (j < 0 || j >= list.length) return;
    current = list[j];
    flipped = false;
    draw(true);
  };
  prev.onclick = () => nav(-1);
  next.onclick = () => nav(1);
  favBtn.onclick = () => toggleFavorite(current);

  let down: { x: number } | null = null;
  let swiped = false;
  cardHost.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX };
    swiped = false;
  });
  cardHost.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    down = null;
    if (Math.abs(dx) > 50) {
      swiped = true;
      nav(dx < 0 ? 1 : -1);
    }
  });
  cardHost.addEventListener('click', () => {
    if (swiped) return;
    flipped = !flipped;
    cardHost.querySelector('.card')?.classList.toggle('face-down', flipped);
  });

  const draw = (newCard = false) => {
    const s = getState();
    list = list.filter((x) => s.collection[x]);
    if (!s.collection[current]) {
      // Dernier exemplaire vendu : on passe à la carte voisine
      if (!list.length) return close();
      current = list[Math.min(list.length - 1, Math.max(0, ids.indexOf(current) - 1))] ?? list[0];
      newCard = true;
    }
    const o = s.collection[current];
    const c = o.card;
    markSeen(current);
    const idx = list.indexOf(current);
    counter.textContent = `${idx + 1} / ${list.length}`;
    prev.classList.toggle('faded', idx <= 0);
    next.classList.toggle('faded', idx >= list.length - 1);
    favBtn.classList.toggle('on', o.favorite);
    favBtn.setAttribute('aria-pressed', String(o.favorite));
    if (newCard || !cardHost.firstChild) cardHost.replaceChildren(cardEl(c, { large: true, tilt: true, faceDown: flipped }));

    const type = mainType(c.types);
    const typeLabel =
      c.supertype === 'Pokémon' ? `Pokémon · ${TYPE_INFO[type].label}` : c.supertype === 'Energy' ? `Énergie${c.types.length ? ` ${TYPE_INFO[type].label}` : ''}` : 'Dresseur';
    const line =
      c.supertype === 'Pokémon' && c.hp
        ? `${cardSetName(c)} · n°${c.number} · ${c.hp} PV${c.attacks?.length ? ` · ${c.attacks.map((a) => `${a.name} ${a.damage || '—'}`).join(' / ')}` : ''}`
        : `${cardSetName(c)} · n°${c.number} · ${credits(o.value)} / carte`;
    info.replaceChildren(
      h(
        'div',
        { class: 'pills' },
        h('span', { class: `rar-pill tier-${c.tier}` }, TIER_LABEL[c.tier].toUpperCase()),
        h('span', { class: 'chip' }, h('i', { class: 'dot', style: `background:${c.supertype === 'Trainer' ? '#a39fbf' : TYPE_INFO[type].color}` }), typeLabel),
        h('span', { class: 'chip mono' }, `×${o.count} exemplaire${o.count > 1 ? 's' : ''}`),
        c.market ? h('span', { class: 'chip mono good' }, `Cote ${c.market.toFixed(2)} $`) : null,
      ),
      h('span', { class: 'dt-name' }, cardName(c)),
      h('span', { class: 'dt-line' }, line),
      h('span', { class: 'dt-rarity' }, cardRarity(c)),
    );

    const prot = protectedCounts()[current] ?? 0;
    const lockedLast = o.count <= Math.max(o.favorite ? 1 : 0, prot);
    const sell1 = h(
      'button',
      { class: 'btn big sell-btn grow', disabled: lockedLast },
      h('b', {}, lockedLast ? (o.favorite ? 'Favori protégé' : 'Dans ton équipe') : 'Vendre 1'),
      h('small', {}, `+${credits(o.value)}`),
    );
    sell1.onclick = () => {
      const plan = planSale([{ id: current, qty: 1 }]);
      if (o.count === 1) void confirmSale(plan, `Vendre ${cardName(c)} ?`, `1 carte pour ${credits(o.value)}.`);
      else doSale(plan, true);
    };
    const extra = o.count - Math.max(1, prot);
    const dup =
      extra > 0
        ? h('button', { class: 'btn big primary grow-12' }, h('b', {}, `Vendre ${plural(extra, 'doublon')}`), h('small', {}, `+${credits(extra * o.value)} · garde 1`))
        : null;
    if (dup) dup.onclick = () => doSale(planSale([{ id: current, qty: extra }]), true);
    actions.replaceChildren(sell1, dup ?? '');
  };

  draw(true);
  unsub = subscribe(() => draw());
}
