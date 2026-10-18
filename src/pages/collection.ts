import { cachedSet, powerScore } from '../api';
import { cardName, searchText } from '../cardLang';
import { cardEl } from '../components/card';
import { BOOSTERS } from '../data/boosters';
import { credits, dots, h, justSwiped, plural, segmented, sheet, swiper, toast } from '../dom';
import { tierIndex } from '../rarity';
import { confirmSale } from '../sell';
import { setTabsHidden } from '../shell';
import { getState, planBulk, planSale, protectedCounts, subscribe, type OwnedCard } from '../state';
import { openDetail } from './detail';

type Kind = 'all' | 'Pokémon' | 'Energy' | 'Trainer';
type Sort = 'rarity' | 'hp' | 'power' | 'value' | 'number';

interface Filters {
  set: string;
  kind: Kind;
  favs: boolean;
  dupes: boolean;
  sort: Sort;
}

const FILTER_KEY = 'ptcg:collection-filters';
const PER_PAGE = 9;
const SORTS: Sort[] = ['rarity', 'hp', 'power', 'value', 'number'];
const SORT_LABEL: Record<Sort, string> = { rarity: 'Rareté', hp: 'PV', power: 'Puissance', value: 'Valeur', number: 'N°' };
const KINDS: [Kind, string][] = [
  ['all', 'Tout'],
  ['Pokémon', 'Pokémon'],
  ['Energy', 'Énergie'],
  ['Trainer', 'Dresseur'],
];
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });

function loadFilters(): Filters {
  const base: Filters = { set: '', kind: 'all', favs: false, dupes: false, sort: 'rarity' };
  try {
    const f = { ...base, ...JSON.parse(localStorage.getItem(FILTER_KEY) ?? '{}') } as Filters;
    if (!SORTS.includes(f.sort)) f.sort = 'rarity';
    return f;
  } catch {
    return base;
  }
}

function sorter(sort: Sort): (a: OwnedCard, b: OwnedCard) => number {
  const num = (o: OwnedCard) => parseInt(o.card.number) || 0;
  const tie = (a: OwnedCard, b: OwnedCard) => a.card.setId.localeCompare(b.card.setId) || num(a) - num(b);
  switch (sort) {
    case 'rarity':
      return (a, b) => tierIndex(b.card.tier) - tierIndex(a.card.tier) || b.value - a.value || tie(a, b);
    case 'hp':
      return (a, b) => (b.card.hp ?? 0) - (a.card.hp ?? 0) || tie(a, b);
    case 'power':
      return (a, b) => powerScore(b.card) - powerScore(a.card) || (b.card.hp ?? 0) - (a.card.hp ?? 0) || tie(a, b);
    case 'value':
      return (a, b) => b.value - a.value || tie(a, b);
    case 'number':
      return tie;
  }
}

function metricOf(o: OwnedCard, sort: Sort): string {
  if (sort === 'hp') return o.card.hp ? `${o.card.hp} PV` : '';
  if (sort === 'power') {
    const p = powerScore(o.card);
    return p ? `${compact.format(Math.round(p))} pts` : '';
  }
  if (sort === 'value') return credits(o.value);
  return '';
}

/** Taille connue d'une extension (si son contenu a déjà été chargé). */
function setSize(setId: string): number {
  return cachedSet(setId)?.cards.length ?? 0;
}

export function collectionPage(root: HTMLElement, param?: string): () => void {
  const f = loadFilters();
  const ui = { q: '', searching: false, page: 0, selecting: param === 'vendre', sel: new Set<string>() };
  const page = h('section', { class: 'page coll' });
  root.append(page);

  const save = () => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(f));
    } catch {
      /* ignore */
    }
  };
  const update = (patch: Partial<Filters>) => {
    Object.assign(f, patch);
    ui.page = 0;
    save();
    draw();
  };

  const filtered = (o: Partial<Filters> & { q?: string } = {}): OwnedCard[] => {
    const q = { ...f, q: ui.q, ...o };
    const t = q.q.trim().toLowerCase();
    return Object.values(getState().collection)
      .filter((x) => !q.set || x.card.setId === q.set)
      .filter((x) => q.kind === 'all' || x.card.supertype === q.kind)
      .filter((x) => !q.favs || x.favorite)
      .filter((x) => !q.dupes || x.count > 1)
      .filter((x) => !t || searchText(x.card).includes(t) || x.card.number === t)
      .sort(sorter(q.sort));
  };

  /* ----- Barre du haut : extension + recherche ----- */
  const topRow = (): HTMLElement => {
    if (ui.searching) {
      const input = h('input', { type: 'search', class: 'search-input', placeholder: 'Nom ou n° de carte…', value: ui.q, 'aria-label': 'Rechercher une carte' });
      input.oninput = () => {
        ui.q = input.value;
        ui.page = 0;
        drawGrid();
      };
      const closeS = h('button', { class: 'text-btn' }, 'Fermer');
      closeS.onclick = () => {
        ui.searching = false;
        ui.q = '';
        ui.page = 0;
        draw();
      };
      setTimeout(() => input.focus(), 0);
      return h('div', { class: 'coll-top' }, input, closeS);
    }
    const owned = Object.values(getState().collection);
    const have = f.set ? owned.filter((o) => o.card.setId === f.set).length : owned.length;
    const total = f.set ? setSize(f.set) : BOOSTERS.reduce((a, b) => a + setSize(b.setId), 0);
    const label = f.set ? (BOOSTERS.find((b) => b.setId === f.set)?.name ?? f.set) : 'Toutes les extensions';
    const setBtn = h(
      'button',
      { class: 'set-btn' },
      h(
        'span',
        { class: 'set-btn-main' },
        h('span', { class: 'set-btn-line' }, h('b', {}, label), h('span', { class: 'mono muted' }, total ? `${have} / ${total}` : String(have))),
        h('span', { class: 'progress' }, h('i', { style: `width:${total ? Math.max(2, (have / total) * 100) : 100}%` })),
      ),
      h('span', { class: 'chevron-down' }),
    );
    setBtn.onclick = openSetSheet;
    const searchBtn = h('button', { class: 'icon-btn search-ico', 'aria-label': 'Rechercher' }, h('i'));
    searchBtn.onclick = () => {
      ui.searching = true;
      draw();
    };
    return h('div', { class: 'coll-top' }, setBtn, searchBtn);
  };

  const openSetSheet = () =>
    sheet((close) => {
      const owned = Object.values(getState().collection);
      const row = (id: string, name: string, have: number, total: number) => {
        const b = h(
          'button',
          { class: `set-row ${f.set === id ? 'on' : ''}` },
          h('span', { class: 'set-btn-line' }, h('b', {}, name), h('span', { class: 'mono muted' }, total ? `${have} / ${total}` : String(have))),
          h('span', { class: 'progress' }, h('i', { style: `width:${total ? Math.max(1.5, (have / total) * 100) : have ? 100 : 1.5}%` })),
        );
        b.onclick = () => {
          close();
          update({ set: id });
        };
        return b;
      };
      return [
        h('span', { class: 'sheet-title' }, 'Extension'),
        row('', 'Toutes les extensions', owned.length, BOOSTERS.reduce((a, b) => a + setSize(b.setId), 0)),
        ...BOOSTERS.map((b) => row(b.setId, b.name, owned.filter((o) => o.card.setId === b.setId).length, setSize(b.setId))),
      ];
    });

  /* ----- Filtres en un tap ----- */
  const filterRow = (): HTMLElement => {
    const kinds = segmented(
      KINDS.map(([k, l]) => ({ key: k, label: l, muted: !filtered({ kind: k }).length && f.kind !== k })),
      f.kind,
      (k) => (filtered({ kind: k }).length || f.kind === k) && update({ kind: k }),
      'grow kinds',
    );
    const fav = h('button', { class: `toggle-btn fav ${f.favs ? 'on' : ''}`, 'aria-pressed': f.favs, 'aria-label': 'Favoris' }, h('b', {}, '♥'), h('span', {}, String(filtered({ favs: true }).length)));
    fav.onclick = () => update({ favs: !f.favs });
    const dup = h('button', { class: `toggle-btn dup ${f.dupes ? 'on' : ''}`, 'aria-pressed': f.dupes, 'aria-label': 'Doublons' }, h('b', {}, '×2'), h('span', {}, String(filtered({ dupes: true }).length)));
    dup.onclick = () => update({ dupes: !f.dupes });
    return h('div', { class: 'coll-filters' }, kinds, fav, dup);
  };

  /* ----- Tri, pages, actions ----- */
  const dotsHost = h('div', { class: 'grow center-row' });
  const sortRow = (): HTMLElement => {
    const sort = h('button', { class: 'sort-btn' }, h('span', { class: 'muted' }, 'Tri'), h('span', {}, SORT_LABEL[f.sort]), h('span', { class: 'accent' }, '↓'));
    sort.onclick = () => update({ sort: SORTS[(SORTS.indexOf(f.sort) + 1) % SORTS.length] });
    let action: HTMLElement | null = null;
    const dupPlan = planBulk(() => true, true);
    if (ui.selecting) action = null;
    else if (f.dupes && dupPlan.count) {
      action = h('button', { class: 'btn small primary' }, `Vendre ×${dupPlan.count} · ${credits(dupPlan.gain)}`);
      action.onclick = () => void confirmSale(dupPlan, 'Vendre tous les doublons ?', `${plural(dupPlan.count, 'carte')} · favoris et équipe exclus.`);
    } else {
      action = h('button', { class: 'text-btn' }, 'Sélectionner');
      action.onclick = () => setSelecting(true);
    }
    return h('div', { class: 'coll-sort' }, sort, dotsHost, action);
  };

  /* ----- Grille paginée ----- */
  const rail = h('div', { class: 'pages-rail' });
  const viewport = h('div', { class: 'pages' }, rail);
  let list: OwnedCard[] = [];
  let pageEls: HTMLElement[] = [];
  const nPages = () => Math.max(1, Math.ceil(list.length / PER_PAGE));
  const sw = swiper(viewport, rail, {
    count: nPages,
    index: () => ui.page,
    pos: (i, dx) => `translateX(calc(${-i * 100}% + ${dx}px))`,
    go: (i) => goPage(i),
  });
  const goPage = (i: number) => {
    ui.page = i;
    sw.place();
    fillPages();
    dotsHost.replaceChildren(dots(nPages(), ui.page, goPage));
  };

  let lpTimer = 0;
  let lpFired = false;
  viewport.addEventListener('swipestart', () => clearTimeout(lpTimer));

  const tile = (o: OwnedCard, ids: string[]): HTMLElement => {
    const s = getState();
    const id = o.card.id;
    const el = h(
      'button',
      { class: 'grid-cell', 'aria-label': `${cardName(o.card)}, ${o.count} exemplaire${o.count > 1 ? 's' : ''}` },
      h(
        'div',
        { class: 'fit-card' },
        cardEl(o.card, {
          count: o.count,
          fav: o.favorite,
          isNew: !!s.fresh[id],
          metric: metricOf(o, f.sort),
          selecting: ui.selecting,
          selected: ui.sel.has(id),
        }),
      ),
    );
    el.addEventListener('pointerdown', () => {
      clearTimeout(lpTimer);
      lpFired = false;
      lpTimer = window.setTimeout(() => {
        lpFired = true;
        if (!ui.selecting) setSelecting(true);
        toggleSel(id);
      }, 480);
    });
    const cancel = () => clearTimeout(lpTimer);
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.onclick = () => {
      if (justSwiped()) return;
      if (lpFired) {
        lpFired = false;
        return;
      }
      if (ui.selecting) toggleSel(id);
      else openDetail(ids, id);
    };
    return el;
  };

  const fillPages = () => {
    const ids = list.map((o) => o.card.id);
    pageEls.forEach((p, i) => {
      const near = Math.abs(i - ui.page) <= 1;
      if (near && !p.childElementCount) p.append(...list.slice(i * PER_PAGE, (i + 1) * PER_PAGE).map((o) => tile(o, ids)));
      else if (!near && p.childElementCount) p.replaceChildren();
    });
  };

  const drawGrid = () => {
    list = filtered();
    ui.page = Math.min(ui.page, nPages() - 1);
    pageEls = Array.from({ length: nPages() }, () => h('div', { class: 'grid-page' }));
    rail.replaceChildren(...pageEls);
    viewport.querySelector('.coll-empty')?.remove();
    if (!list.length) {
      const owned = Object.keys(getState().collection).length;
      const clear = h('button', { class: 'btn' }, owned ? 'Effacer les filtres' : 'Aller à la boutique');
      clear.onclick = () => {
        if (!owned) return void (location.hash = '#/boutique');
        ui.q = '';
        ui.searching = false;
        update({ set: '', kind: 'all', favs: false, dupes: false });
      };
      const msg = !owned
        ? 'Ta collection est vide. Ouvre ton premier booster !'
        : ui.q
          ? `Aucune carte ne correspond à « ${ui.q} ».`
          : f.set
            ? `Aucune carte ${BOOSTERS.find((b) => b.setId === f.set)?.name ?? ''} avec ces filtres — ouvre un booster de cette extension.`
            : 'Aucune carte avec ces filtres.';
      viewport.append(h('div', { class: 'coll-empty' }, h('b', {}, 'Rien ici'), h('span', {}, msg), clear));
    }
    sw.place();
    fillPages();
    dotsHost.replaceChildren(dots(nPages(), ui.page, goPage));
  };

  /* ----- Sélection multiple ----- */
  const selBar = h('div', { class: 'sel-bar' });
  const drawSelBar = () => {
    const ids = [...ui.sel];
    const sum = ids.reduce((a, id) => a + (getState().collection[id]?.value ?? 0), 0);
    const cancel = h('button', { class: 'btn' }, 'Annuler');
    cancel.onclick = () => setSelecting(false);
    const go = h('button', { class: `btn primary ${ids.length ? '' : 'faded'}` }, `Vendre · ${credits(sum)}`);
    go.onclick = async () => {
      if (!ids.length) return;
      const ok = await confirmSale(
        planSale(ids.map((id) => ({ id, qty: 1 }))),
        `Vendre ${plural(ids.length, 'carte')} ?`,
        '1 exemplaire de chaque carte cochée.',
      );
      if (ok) setSelecting(false);
    };
    selBar.replaceChildren(cancel, h('span', { class: 'grow muted' }, ids.length ? `${plural(ids.length, 'carte')} cochée${ids.length > 1 ? 's' : ''}` : 'Touche les cartes à vendre'), go);
  };
  const setSelecting = (on: boolean) => {
    ui.selecting = on;
    ui.sel.clear();
    setTabsHidden(on);
    draw();
  };
  const toggleSel = (id: string) => {
    const s = getState();
    if (ui.sel.has(id)) ui.sel.delete(id);
    else {
      const o = s.collection[id];
      if (!o) return;
      if (o.favorite && o.count <= 1) return toast('Favori protégé — retire-le des favoris pour le vendre.');
      if (o.count <= (protectedCounts()[id] ?? 0)) return toast('Utilisée dans ton équipe d’arène.');
      ui.sel.add(id);
    }
    // Mise à jour légère : seule la case de la carte change
    drawGrid();
    drawSelBar();
  };

  const draw = () => {
    page.replaceChildren(topRow(), filterRow(), sortRow(), viewport);
    drawGrid();
    if (ui.selecting) {
      drawSelBar();
      page.append(selBar);
    }
  };

  setTabsHidden(ui.selecting);
  draw();
  const unsub = subscribe(() => {
    // Cartes vendues : on retire de la sélection celles qui n'existent plus
    for (const id of ui.sel) if (!getState().collection[id]) ui.sel.delete(id);
    if (ui.searching) drawGrid();
    else draw();
  });
  return () => {
    unsub();
    setTabsHidden(false);
  };
}
