import { BOOSTERS, PACK_LAYOUT } from '../data/boosters';
import { packEl } from '../components/pack';
import { credits, h, toast } from '../dom';
import { oddsOf } from '../gacha';
import { TIER_LABEL, TIER_VALUE } from '../rarity';
import { buyPack, getState, sellCard, sellDuplicates, subscribe } from '../state';
import { navigate } from '../router';

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
      h('header', { class: 'page-head' }, h('h1', {}, 'Boutique'), h('p', {}, 'Achète des boosters, revends tes cartes. Chaque booster rapporte plus que son prix !')),
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
    const dupes = Object.values(s.collection).filter((o) => o.count > 1 && !o.favorite);
    const dupeValue = dupes.reduce((sum, o) => sum + (o.count - 1) * o.value, 0);
    const dupeCount = dupes.reduce((sum, o) => sum + o.count - 1, 0);
    const sellAll = h('button', { class: 'btn primary', disabled: !dupeCount }, `Vendre ${dupeCount} doublon${dupeCount > 1 ? 's' : ''} · ${credits(dupeValue)}`);
    sellAll.onclick = () => {
      const r = sellDuplicates();
      toast(`${r.count} cartes vendues pour ${credits(r.gain)}`, 'good');
    };
    const list = h('div', { class: 'sell-list' });
    for (const o of dupes.sort((a, b) => b.value - a.value).slice(0, 40)) {
      const b = h('button', { class: 'btn small' }, `Vendre 1 · ${credits(o.value)}`);
      b.onclick = () => {
        toast(`${o.card.name} vendue pour ${credits(sellCard(o.card.id))}`, 'good');
      };
      list.append(
        h(
          'div',
          { class: `sell-row tier-${o.card.tier}` },
          h('img', { src: o.card.small, alt: '', loading: 'lazy' }),
          h('div', {}, h('b', {}, o.card.name), h('span', { class: 'muted small' }, `${TIER_LABEL[o.card.tier]} · ×${o.count}`)),
          b,
        ),
      );
    }
    const galleryLink = h('button', { class: 'btn ghost' }, 'Gérer toute la collection');
    galleryLink.onclick = () => navigate('galerie');
    page.append(
      h(
        'section',
        { class: 'sell' },
        h('h2', {}, 'Revendre des cartes'),
        h('p', { class: 'muted' }, 'Les favoris ne sont jamais vendus en masse. Un exemplaire de chaque carte est conservé.'),
        h('div', { class: 'actions' }, sellAll, galleryLink),
        dupes.length ? list : h('p', { class: 'empty' }, 'Aucun doublon pour le moment. Ouvre des boosters !'),
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
