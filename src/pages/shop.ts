import { BOOSTERS, PACK_LAYOUT } from '../data/boosters';
import { packEl } from '../components/pack';
import { credits, h, toast } from '../dom';
import { oddsOf } from '../gacha';
import { cardImage, cardName, cardSetName, searchText } from '../cardLang';
import { TIERS, TIER_LABEL, TIER_VALUE } from '../rarity';
import { buyPack, getState, planBulk, planSale, subscribe, type SalePlan } from '../state';
import { navigate } from '../router';
import { confirmSale } from '../sell';

const PAGE_SIZE = 30;
const SELL_KEY = 'ptcg:sell-options';

/** Options de revente, conservées entre les rendus (la recherche n'est pas sauvegardée). */
const sellOpts = { keepOne: true, q: '', shown: PAGE_SIZE };
try {
  sellOpts.keepOne = JSON.parse(localStorage.getItem(SELL_KEY) ?? '{}').keepOne ?? true;
} catch {
  /* ignore */
}
function saveSellOpts(): void {
  try {
    localStorage.setItem(SELL_KEY, JSON.stringify({ keepOne: sellOpts.keepOne }));
  } catch {
    /* ignore */
  }
}

/** Valeur de revente minimale garantie d'un booster (pire tirage possible). */
function guaranteed(price: number): number {
  return Math.round(
    price * (PACK_LAYOUT.common * TIER_VALUE.common + PACK_LAYOUT.uncommon * TIER_VALUE.uncommon + PACK_LAYOUT.rare * TIER_VALUE.rare),
  );
}

export function shopPage(root: HTMLElement): () => void {
  const page = h('section', { class: 'page shop' });
  root.append(page);

  const draw = () => {
    const s = getState();
    page.replaceChildren();

    page.append(
      h('header', { class: 'page-head' }, h('h1', {}, 'Boutique'), h('p', {}, 'Achète des boosters, revends tes cartes. Chaque booster vaut plus que son prix à la revente !')),
    );

    const grid = h('div', { class: 'shop-grid' });
    for (const def of BOOSTERS) {
      const owned = s.packs[def.id] ?? 0;
      const odds = h(
        'ul',
        { class: 'odds' },
        ...oddsOf(def).map((o) =>
          h('li', { class: `tier-${o.tier}` }, h('span', {}, TIER_LABEL[o.tier]), h('b', {}, `${o.pct} %`), h('i', { style: `width:${o.pct}%` })),
        ),
      );
      const buy = (qty: number) => {
        if (buyPack(def.id, qty)) toast(`${qty} × ${def.name} ajouté${qty > 1 ? 's' : ''} à ton inventaire`, 'good');
        else toast('Crédits insuffisants', 'bad');
      };
      const btn1 = h('button', { class: 'btn primary', disabled: s.credits < def.price }, `Acheter · ${credits(def.price)}`);
      const btn5 = h('button', { class: 'btn', disabled: s.credits < def.price * 5 }, `×5 · ${credits(def.price * 5)}`);
      btn1.onclick = () => buy(1);
      btn5.onclick = () => buy(5);
      const openBtn = owned
        ? h('button', { class: 'btn ghost' }, `Ouvrir (${owned})`)
        : null;
      if (openBtn) openBtn.onclick = () => navigate(`ouverture/${def.id}`);

      grid.append(
        h(
          'article',
          { class: 'shop-item' },
          h('div', { class: 'shop-pack' }, packEl(def, 'small float')),
          h(
            'div',
            { class: 'shop-info' },
            h('h2', {}, def.name),
            h('p', { class: 'muted' }, def.subtitle),
            h('p', { class: 'guarantee' }, `Revente garantie ≥ ${credits(guaranteed(def.price))}`),
            h('p', { class: 'muted small' }, `Carte bonus : ${Math.round(def.bonusChance * 100)} % de chance d'une rare en plus`),
            h('h3', {}, 'Slot rare'),
            odds,
            h('div', { class: 'actions' }, btn1, btn5, openBtn),
          ),
        ),
      );
    }
    page.append(grid);

    // Revente
    const bulk = (label: string, plan: SalePlan, primary = false) => {
      const b = h(
        'button',
        { class: `btn bulk ${primary ? 'primary' : `tier-btn`}`, disabled: !plan.count },
        h('span', {}, label),
        h('small', {}, plan.count ? `${plan.count} · ${credits(plan.gain)}` : 'aucune'),
      );
      b.onclick = () => void confirmSale(plan, `Vendre : ${label.toLowerCase()}`);
      return b;
    };
    const keepToggle = h('input', { type: 'checkbox', checked: sellOpts.keepOne });
    keepToggle.onchange = () => {
      sellOpts.keepOne = keepToggle.checked;
      saveSellOpts();
      draw();
    };
    const owned = Object.values(s.collection);
    const tiers = TIERS.filter((t) => owned.some((o) => o.card.tier === t));
    const bulkRow = h(
      'div',
      { class: 'bulk-row' },
      bulk(sellOpts.keepOne ? 'Tous les doublons' : 'Toute la collection', planBulk(() => true, sellOpts.keepOne), true),
      ...tiers.map((t) => {
        const b = bulk(TIER_LABEL[t], planBulk((o) => o.card.tier === t, sellOpts.keepOne));
        b.classList.add(`tier-${t}`);
        return b;
      }),
    );

    const search = h('input', { type: 'search', placeholder: 'Rechercher une carte…', value: sellOpts.q, 'aria-label': 'Rechercher une carte à vendre' });
    const list = h('div', { class: 'sell-list' });
    const drawList = () => {
      const q = sellOpts.q.trim().toLowerCase();
      const rows = owned
        .filter((o) => !q || searchText(o.card).includes(q))
        .sort((a, b) => b.value - a.value || b.count - a.count);
      list.replaceChildren();
      for (const o of rows.slice(0, sellOpts.shown)) {
        const one = h('button', { class: 'btn small' }, `1 · ${credits(o.value)}`);
        one.onclick = () => void confirmSale(planSale([{ id: o.card.id, qty: 1 }]), `Vendre ${cardName(o.card)}`);
        const all = o.count > 1 ? h('button', { class: 'btn small' }, `×${o.count} · ${credits(o.count * o.value)}`) : null;
        if (all) all.onclick = () => void confirmSale(planSale([{ id: o.card.id, qty: o.count }]), `Vendre ${cardName(o.card)}`);
        list.append(
          h(
            'div',
            { class: `sell-row tier-${o.card.tier}` },
            h('img', { src: cardImage(o.card).src, alt: '', loading: 'lazy' }),
            h(
              'div',
              {},
              h('b', {}, `${o.favorite ? '★ ' : ''}${cardName(o.card)}`),
              h('span', { class: 'muted small' }, `${TIER_LABEL[o.card.tier]} · ×${o.count} · ${cardSetName(o.card)}`),
            ),
            h('div', { class: 'sell-btns' }, one, all),
          ),
        );
      }
      if (!rows.length) list.append(h('p', { class: 'empty' }, owned.length ? 'Aucune carte ne correspond.' : 'Aucune carte pour le moment. Ouvre des boosters !'));
      if (rows.length > sellOpts.shown) {
        const more = h('button', { class: 'btn ghost more' }, `Afficher plus (${rows.length - sellOpts.shown} restantes)`);
        more.onclick = () => {
          sellOpts.shown += PAGE_SIZE;
          drawList();
        };
        list.append(more);
      }
    };
    search.oninput = () => {
      sellOpts.q = search.value;
      sellOpts.shown = PAGE_SIZE;
      drawList();
    };
    drawList();

    const galleryLink = h('button', { class: 'btn ghost' }, 'Voir la galerie');
    galleryLink.onclick = () => navigate('galerie');
    page.append(
      h(
        'section',
        { class: 'sell' },
        h('h2', {}, 'Revendre des cartes'),
        h('p', { class: 'muted' }, 'Chaque vente demande une confirmation. Les favoris (★) ne sont jamais inclus dans les ventes en masse.'),
        h('label', { class: 'chip' }, keepToggle, 'Garder 1 exemplaire de chaque carte'),
        bulkRow,
        h('h3', {}, 'À l\'unité'),
        h('div', { class: 'sell-search' }, search, galleryLink),
        list,
      ),
      h(
        'section',
        { class: 'stats' },
        h('h2', {}, 'Statistiques'),
        h(
          'dl',
          {},
          h('dt', {}, 'Boosters achetés'), h('dd', {}, String(s.stats.bought)),
          h('dt', {}, 'Boosters ouverts'), h('dd', {}, String(s.stats.opened)),
          h('dt', {}, 'Cartes vendues'), h('dd', {}, String(s.stats.sold)),
          h('dt', {}, 'Dépensé'), h('dd', {}, credits(s.stats.spent)),
          h('dt', {}, 'Gagné en revente'), h('dd', {}, credits(s.stats.earned)),
        ),
      ),
    );
  };

  draw();
  return subscribe(draw);
}
