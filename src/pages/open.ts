import { loadSet, type Card } from '../api';
import { cardImage, cardName, cardRarity } from '../cardLang';
import { cardEl } from '../components/card';
import { packEl } from '../components/pack';
import { BOOSTERS, boosterById, type BoosterDef } from '../data/boosters';
import { credits, h, toast, wait } from '../dom';
import { rollPack } from '../gacha';
import { TIER_LABEL, tierIndex } from '../rarity';
import { getState, openPack, subscribe } from '../state';
import { navigate } from '../router';

function preload(urls: string[]): Promise<void> {
  return Promise.all(
    urls.map(
      (src) =>
        new Promise<void>((res) => {
          const img = new Image();
          img.onload = img.onerror = () => res();
          img.src = src;
        }),
    ),
  ).then(() => undefined);
}

export function openPage(root: HTMLElement, param?: string): () => void {
  const page = h('section', { class: 'page open' });
  const inventory = h('div', { class: 'inventory' });
  const stage = h('div', { class: 'stage' });
  page.append(h('header', { class: 'page-head' }, h('h1', {}, 'Ouverture'), h('p', {}, 'Choisis un booster et déchire-le !')), inventory, stage);
  root.append(page);

  let selected: BoosterDef | undefined = param ? boosterById(param) : undefined;
  let busy = false;
  let alive = true;

  const drawInventory = () => {
    const s = getState();
    inventory.replaceChildren();
    const owned = BOOSTERS.filter((b) => (s.packs[b.id] ?? 0) > 0);
    if (!owned.length) {
      const go = h('button', { class: 'btn primary' }, 'Aller à la boutique');
      go.onclick = () => navigate('boutique');
      inventory.append(h('div', { class: 'empty' }, h('p', {}, "Tu n'as aucun booster scellé."), go));
      return;
    }
    for (const def of owned) {
      const btn = h(
        'button',
        { class: `inv-item ${selected?.id === def.id ? 'active' : ''}`, disabled: busy, 'aria-label': `Choisir ${def.name}` },
        packEl(def, 'mini'),
        h('span', { class: 'inv-count' }, `×${s.packs[def.id]}`),
      );
      btn.onclick = () => {
        if (busy) return;
        selected = def;
        drawInventory();
        drawReady();
      };
      inventory.append(btn);
    }
  };

  const drawReady = () => {
    stage.replaceChildren();
    const s = getState();
    if (!selected || !(s.packs[selected.id] > 0)) {
      selected = BOOSTERS.find((b) => (s.packs[b.id] ?? 0) > 0);
      if (!selected) return;
      drawInventory();
    }
    const def = selected;
    const pack = packEl(def, 'big float');
    const hint = h('p', { class: 'hint' }, 'Préparation des cartes…');
    const wrap = h('button', { class: 'pack-button', 'aria-label': `Ouvrir ${def.name}`, disabled: true }, pack);
    stage.append(wrap, hint);

    loadSet(def.setId)
      .then((set) => {
        if (!alive || selected !== def) return;
        hint.textContent = 'Touche le booster pour le déchirer';
        wrap.disabled = false;
        wrap.onclick = () => void open(def, pack, wrap, hint, set);
      })
      .catch((err: Error) => {
        if (!alive) return;
        hint.textContent = `Impossible de charger les cartes : ${err.message}`;
        const retry = h('button', { class: 'btn' }, 'Réessayer');
        retry.onclick = drawReady;
        stage.append(retry);
      });
  };

  const open = async (def: BoosterDef, pack: HTMLElement, wrap: HTMLButtonElement, hint: HTMLElement, set: Awaited<ReturnType<typeof loadSet>>) => {
    if (busy) return;
    busy = true;
    wrap.disabled = true;
    const cards = rollPack(def, set);
    const values = openPack(def.id, cards);
    if (!values.length) {
      busy = false;
      return drawReady();
    }
    drawInventory();
    hint.textContent = '';
    stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const loading = preload(cards.flatMap((c) => [cardImage(c).src, cardImage(c, true).src]));

    pack.classList.remove('float');
    pack.classList.add('shake');
    await wait(700);
    pack.classList.add('torn');
    await wait(550);
    await loading;
    pack.classList.add('drop');
    await wait(500);
    if (!alive) return;
    reveal(def, cards, values);
  };

  const reveal = (def: BoosterDef, cards: Card[], values: number[]) => {
    stage.replaceChildren();
    const stack = h('div', { class: 'reveal-stack' });
    const label = h('div', { class: 'reveal-label' }, 'Touche pour révéler');
    const counter = h('div', { class: 'reveal-counter' }, `0 / ${cards.length}`);
    const skip = h('button', { class: 'btn ghost small' }, 'Tout révéler');
    stage.append(h('div', { class: 'reveal' }, counter, stack, label, skip));

    // La pile : la première carte est au-dessus, la plus rare est révélée en dernier.
    const els = cards.map((card, i) => {
      const el = cardEl(card, { faceDown: true, large: true });
      el.style.setProperty('--i', String(i));
      el.classList.add('emerge');
      return el;
    });
    [...els].reverse().forEach((el) => stack.append(el));
    let index = 0;
    let revealed = false;

    const step = () => {
      if (index >= els.length) return;
      const el = els[index];
      const card = cards[index];
      if (!revealed) {
        revealed = true;
        el.classList.remove('face-down');
        el.classList.add('flipped');
        const rare = tierIndex(card.tier) >= tierIndex('ultra');
        if (rare) {
          stage.classList.remove('burst');
          void stage.offsetWidth;
          stage.classList.add('burst', `burst-${card.tier}`);
          setTimeout(() => stage.classList.remove('burst', `burst-${card.tier}`), 1400);
        }
        label.replaceChildren(
          h('span', { class: `rarity-pill tier-${card.tier}` }, TIER_LABEL[card.tier]),
          h('b', {}, cardName(card)),
          h('span', { class: 'muted' }, `${cardRarity(card)} · ${credits(values[index])}`),
        );
        counter.textContent = `${index + 1} / ${cards.length}`;
      } else {
        el.classList.add('gone');
        revealed = false;
        index++;
        if (index >= els.length) setTimeout(() => alive && summary(def, cards, values), 350);
        else label.textContent = 'Touche pour révéler';
      }
    };
    stack.onclick = step;
    skip.onclick = () => summary(def, cards, values);
    // Petite pré-révélation : les cartes très rares font briller le dos de la pile
    const best = cards.reduce((m, c) => Math.max(m, tierIndex(c.tier)), 0);
    if (best >= tierIndex('ultra')) stack.classList.add('aura');
  };

  const summary = (def: BoosterDef, cards: Card[], values: number[]) => {
    stage.replaceChildren();
    busy = false;
    drawInventory();
    const total = values.reduce((a, b) => a + b, 0);
    const profit = total - def.price;
    const grid = h('div', { class: 'summary-grid' });
    cards.forEach((card, i) => {
      const el = cardEl(card);
      el.style.setProperty('--i', String(i));
      grid.append(
        h('figure', { class: 'summary-card deal' , style: `--i:${i}` }, el, h('figcaption', {}, h('span', { class: `rarity-pill tier-${card.tier}` }, TIER_LABEL[card.tier]), h('b', {}, credits(values[i])))),
      );
    });
    const left = getState().packs[def.id] ?? 0;
    const again = h('button', { class: 'btn primary' }, left ? `Ouvrir un autre (${left})` : 'Racheter un booster');
    again.onclick = () => (left ? drawReady() : navigate('boutique'));
    const gallery = h('button', { class: 'btn ghost' }, 'Voir la galerie');
    gallery.onclick = () => navigate('galerie');
    stage.append(
      h(
        'div',
        { class: 'summary' },
        h(
          'div',
          { class: 'summary-head' },
          h('h2', {}, def.name),
          h('p', {}, `Valeur de revente : `, h('b', {}, credits(total)), ' ', h('span', { class: profit >= 0 ? 'good' : 'bad' }, `(${profit >= 0 ? '+' : ''}${credits(profit)})`)),
        ),
        grid,
        h('div', { class: 'actions center' }, again, gallery),
      ),
    );
    if (profit > def.price) toast(`Jackpot ! +${credits(profit)}`, 'good');
  };

  drawInventory();
  drawReady();
  const unsub = subscribe(() => {
    if (!busy) drawInventory();
  });
  return () => {
    alive = false;
    unsub();
  };
}
