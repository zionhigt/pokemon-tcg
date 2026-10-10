import { cachedSet } from '../api';
import { cardEl } from '../components/card';
import { BOOSTERS } from '../data/boosters';
import { credits, h, toast } from '../dom';
import { TIERS, TIER_LABEL, tierIndex, type Tier } from '../rarity';
import { getState, sellCard, subscribe, toggleFavorite, type OwnedCard } from '../state';

type Sort = 'value' | 'rarity' | 'recent' | 'name' | 'number';

interface Filters {
  q: string;
  set: string;
  tier: Tier | '';
  sort: Sort;
  dupes: boolean;
  favs: boolean;
}

const FILTER_KEY = 'ptcg:gallery-filters';

function loadFilters(): Filters {
  const base: Filters = { q: '', set: '', tier: '', sort: 'rarity', dupes: false, favs: false };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(FILTER_KEY) ?? '{}') };
  } catch {
    return base;
  }
}

function sorter(sort: Sort): (a: OwnedCard, b: OwnedCard) => number {
  switch (sort) {
    case 'value':
      return (a, b) => b.value - a.value;
    case 'rarity':
      return (a, b) => tierIndex(b.card.tier) - tierIndex(a.card.tier) || b.value - a.value;
    case 'recent':
      return (a, b) => b.lastAt - a.lastAt;
    case 'name':
      return (a, b) => a.card.name.localeCompare(b.card.name, 'fr');
    case 'number':
      return (a, b) => a.card.setId.localeCompare(b.card.setId) || (parseInt(a.card.number) || 0) - (parseInt(b.card.number) || 0);
  }
}

export function galleryPage(root: HTMLElement): () => void {
  const f = loadFilters();
  const page = h('section', { class: 'page gallery' });
  const summary = h('div', { class: 'gallery-summary' });
  const grid = h('div', { class: 'gallery-grid' });

  const save = () => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify({ ...f, q: '' }));
    } catch {
      /* ignore */
    }
    drawGrid();
  };

  const search = h('input', { type: 'search', placeholder: 'Rechercher un Pokémon…', value: f.q, 'aria-label': 'Rechercher' });
  search.oninput = () => {
    f.q = search.value;
    drawGrid();
  };
  const setSel = h(
    'select',
    { 'aria-label': 'Extension' },
    h('option', { value: '' }, 'Toutes les extensions'),
    ...BOOSTERS.map((b) => h('option', { value: b.setId, selected: f.set === b.setId }, b.name)),
  );
  setSel.onchange = () => {
    f.set = setSel.value;
    save();
  };
  const tierSel = h(
    'select',
    { 'aria-label': 'Rareté' },
    h('option', { value: '' }, 'Toutes raretés'),
    ...TIERS.map((t) => h('option', { value: t, selected: f.tier === t }, TIER_LABEL[t])),
  );
  tierSel.onchange = () => {
    f.tier = tierSel.value as Tier | '';
    save();
  };
  const sorts: [Sort, string][] = [
    ['rarity', 'Rareté'],
    ['value', 'Valeur'],
    ['recent', 'Récentes'],
    ['name', 'Nom'],
    ['number', 'Numéro'],
  ];
  const sortSel = h('select', { 'aria-label': 'Tri' }, ...sorts.map(([v, l]) => h('option', { value: v, selected: f.sort === v }, `Tri : ${l}`)));
  sortSel.onchange = () => {
    f.sort = sortSel.value as Sort;
    save();
  };
  const toggle = (label: string, key: 'dupes' | 'favs') => {
    const input = h('input', { type: 'checkbox', checked: f[key] });
    input.onchange = () => {
      f[key] = input.checked;
      save();
    };
    return h('label', { class: 'chip' }, input, label);
  };

  page.append(
    h('header', { class: 'page-head' }, h('h1', {}, 'Galerie'), h('p', {}, 'Ta collection : trie, mets en favori, revends.')),
    summary,
    h('div', { class: 'filters' }, search, setSel, tierSel, sortSel, toggle('Doublons', 'dupes'), toggle('Favoris', 'favs')),
    grid,
  );
  root.append(page);

  const drawSummary = () => {
    const owned = Object.values(getState().collection);
    const total = owned.reduce((s, o) => s + o.count, 0);
    const value = owned.reduce((s, o) => s + o.count * o.value, 0);
    const sets = BOOSTERS.map((b) => {
      const info = cachedSet(b.setId);
      const have = owned.filter((o) => o.card.setId === b.setId).length;
      if (!info && !have) return null;
      const size = info?.cards.length ?? 0;
      const pct = size ? Math.round((have / size) * 100) : 0;
      return h(
        'div',
        { class: 'set-progress' },
        h('span', {}, b.name),
        h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` })),
        h('small', {}, size ? `${have} / ${size}` : `${have}`),
      );
    });
    summary.replaceChildren(
      h(
        'div',
        { class: 'kpis' },
        h('div', {}, h('b', {}, String(owned.length)), h('span', {}, 'cartes uniques')),
        h('div', {}, h('b', {}, String(total)), h('span', {}, 'cartes au total')),
        h('div', {}, h('b', {}, credits(value)), h('span', {}, 'valeur de revente')),
      ),
      h('div', { class: 'sets' }, ...sets),
    );
  };

  const drawGrid = () => {
    const q = f.q.trim().toLowerCase();
    const list = Object.values(getState().collection)
      .filter((o) => !f.set || o.card.setId === f.set)
      .filter((o) => !f.tier || o.card.tier === f.tier)
      .filter((o) => !f.dupes || o.count > 1)
      .filter((o) => !f.favs || o.favorite)
      .filter((o) => !q || o.card.name.toLowerCase().includes(q))
      .sort(sorter(f.sort));
    grid.replaceChildren();
    if (!list.length) {
      grid.append(h('p', { class: 'empty' }, Object.keys(getState().collection).length ? 'Aucune carte ne correspond aux filtres.' : 'Ta collection est vide. Ouvre ton premier booster !'));
      return;
    }
    for (const o of list) {
      const tile = h(
        'button',
        { class: `tile tier-${o.card.tier}`, 'aria-label': `${o.card.name}, ${o.count} exemplaire(s)` },
        cardEl(o.card),
        o.count > 1 ? h('span', { class: 'badge count' }, `×${o.count}`) : null,
        o.favorite ? h('span', { class: 'badge fav' }, '★') : null,
        h('span', { class: 'tile-meta' }, h('span', { class: 'tile-name' }, o.card.name), h('span', { class: 'tile-value' }, credits(o.value))),
      );
      tile.onclick = () => openDetail(o.card.id);
      grid.append(tile);
    }
  };

  let modal: HTMLElement | null = null;
  const closeDetail = () => {
    modal?.remove();
    modal = null;
  };
  const openDetail = (id: string) => {
    closeDetail();
    const o = getState().collection[id];
    if (!o) return;
    const c = o.card;
    const fav = h('button', { class: `btn ${o.favorite ? 'primary' : ''}` }, o.favorite ? '★ Favori' : '☆ Mettre en favori');
    fav.onclick = () => toggleFavorite(id);
    const sell1 = h('button', { class: 'btn' }, `Vendre 1 · ${credits(o.value)}`);
    sell1.onclick = () => toast(`Vendu pour ${credits(sellCard(id, 1))}`, 'good');
    const sellDupes = o.count > 1 ? h('button', { class: 'btn' }, `Vendre les doublons (${o.count - 1}) · ${credits((o.count - 1) * o.value)}`) : null;
    if (sellDupes) sellDupes.onclick = () => toast(`Vendu pour ${credits(sellCard(id, o.count - 1))}`, 'good');
    const sellAll = h('button', { class: 'btn danger' }, `Tout vendre (${o.count}) · ${credits(o.count * o.value)}`);
    sellAll.onclick = () => {
      if (o.favorite && !confirm('Cette carte est en favori. La vendre quand même ?')) return;
      toast(`Vendu pour ${credits(sellCard(id, o.count))}`, 'good');
    };
    const close = h('button', { class: 'modal-close', 'aria-label': 'Fermer' }, '×');
    close.onclick = closeDetail;
    modal = h(
      'div',
      { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': c.name, 'data-id': id },
      h(
        'div',
        { class: 'modal-box' },
        close,
        h('div', { class: 'modal-card' }, cardEl(c, { large: true })),
        h(
          'div',
          { class: 'modal-info' },
          h('span', { class: `rarity-pill tier-${c.tier}` }, TIER_LABEL[c.tier]),
          h('h2', {}, c.name),
          h(
            'dl',
            {},
            h('dt', {}, 'Extension'), h('dd', {}, `${c.setName} · n°${c.number}`),
            h('dt', {}, 'Rareté officielle'), h('dd', {}, c.rarity),
            h('dt', {}, 'Type'), h('dd', {}, [c.supertype, ...c.types].join(' · ')),
            h('dt', {}, 'Exemplaires'), h('dd', {}, String(o.count)),
            h('dt', {}, 'Revente'), h('dd', {}, `${credits(o.value)} / carte`),
            c.market ? h('dt', {}, 'Cote réelle') : null, c.market ? h('dd', {}, `${c.market.toFixed(2)} $`) : null,
          ),
          h('div', { class: 'actions col' }, fav, sell1, sellDupes, sellAll),
        ),
      ),
    );
    modal.onclick = (e) => {
      if (e.target === modal) closeDetail();
    };
    document.body.append(modal);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeDetail();
  };
  document.addEventListener('keydown', onKey);

  drawSummary();
  drawGrid();
  const unsub = subscribe(() => {
    drawSummary();
    drawGrid();
    if (modal) {
      const id = modal.getAttribute('data-id');
      if (id) openDetail(id);
    }
  });
  return () => {
    unsub();
    closeDetail();
    document.removeEventListener('keydown', onKey);
  };
}
