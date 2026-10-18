import { loadSet, type Card, type SetInfo } from '../api';
import { cardImage, cardName } from '../cardLang';
import { cardEl } from '../components/card';
import { packEl } from '../components/pack';
import { BOOSTERS, type BoosterDef } from '../data/boosters';
import { credits, dismissToast, h, plural, pushLayer, toast } from '../dom';
import { rollPack } from '../gacha';
import { TIER_LABEL, tierIndex } from '../rarity';
import { navigate } from '../router';
import { buyPack, getState, openPack } from '../state';
import { openDetail } from './detail';

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

/**
 * Contenu tiré d'avance pour le prochain booster de chaque sorte : ses images
 * se chargent pendant qu'on regarde le booster, la révélation n'attend plus.
 * Gardé jusqu'à l'ouverture (fermer puis rouvrir ne relance pas le tirage).
 */
const prepared = new Map<string, { cards: Card[]; loading: Promise<void> }>();

function prepare(def: BoosterDef, set: SetInfo): { cards: Card[]; loading: Promise<void> } {
  let p = prepared.get(def.id);
  if (!p) {
    const cards = rollPack(def, set);
    p = { cards, loading: preload(cards.map((c) => cardImage(c, true).src)) };
    prepared.set(def.id, p);
  }
  return p;
}

/** Charge l'extension et prépare le prochain booster (appelé dès l'achat). */
export function prefetchBooster(def: BoosterDef): void {
  loadSet(def.setId).then(
    (set) => void prepare(def, set),
    () => {},
  );
}

function sealedDefs(): BoosterDef[] {
  const s = getState();
  return BOOSTERS.filter((b) => (s.packs[b.id] ?? 0) > 0);
}

let closeCurrent: (() => void) | null = null;

/** Ouvre l'écran d'ouverture sur un booster scellé (celui demandé s'il en reste). */
export function openSealed(id?: string): void {
  const owned = sealedDefs();
  if (!owned.length) {
    toast('Aucun booster scellé — passe à la boutique.', { label: 'Boutique', fn: () => navigate('boutique') });
    return;
  }
  const def = (id && owned.find((b) => b.id === id)) || owned[0];
  closeCurrent?.();
  dismissToast();
  owned.forEach(prefetchBooster);
  openingLayer(def);
}

function openingLayer(start: BoosterDef): void {
  let def = start;
  let stage: 'pack' | 'reveal' | 'summary' = 'pack';
  const closeBtn = h('button', { class: 'round-btn', 'aria-label': 'Fermer' }, '×');
  const title = h('span', { class: 'op-title' });
  const sub = h('span', { class: 'op-sub' });
  const right = h('div', { class: 'op-right' });
  const body = h('div', { class: 'op-stage' });
  const layer = h('div', { class: 'layer opening' }, h('div', { class: 'op-head' }, closeBtn, h('div', { class: 'op-titles' }, title, sub), right), body);
  let alive = true;
  const close = pushLayer(layer, () => {
    alive = false;
    if (closeCurrent === close) closeCurrent = null;
  });
  closeCurrent = close;
  closeBtn.onclick = () => stage !== 'reveal' && close();

  const theme = () => layer.style.setProperty('--hue', String(def.hue));

  /* ----- Booster scellé ----- */
  const packStage = () => {
    stage = 'pack';
    theme();
    closeBtn.classList.remove('faded');
    right.replaceChildren();
    const left = getState().packs[def.id] ?? 0;
    title.textContent = def.name;
    sub.textContent = `${plural(left, 'booster')} scellé${left > 1 ? 's' : ''}`;

    const types = sealedDefs();
    const picks =
      types.length > 1
        ? h(
            'div',
            { class: 'op-picks' },
            ...types.map((b) => {
              const btn = h('button', { class: `op-pick ${b.id === def.id ? 'on' : ''}`, 'aria-label': b.name }, packEl(b), h('span', {}, `×${getState().packs[b.id]}`));
              btn.onclick = () => {
                def = b;
                packStage();
              };
              return btn;
            }),
          )
        : null;
    const pack = packEl(def);
    // Le booster apparaît en montant : le temps que l'extension et les images arrivent
    const wrap = h('div', { class: 'op-pack enter', role: 'button', 'aria-label': `Déchirer ${def.name}` }, h('div', { class: 'op-float' }, pack));
    wrap.addEventListener('animationend', () => wrap.classList.remove('enter'), { once: true });
    const hint = h('span', { class: 'op-hint pulse' }, 'Préparation des cartes…');
    body.replaceChildren(h('div', { class: 'op-center' }, picks, wrap, hint));

    let set: SetInfo | null = null;
    let wantTear = false;
    const current = def;
    loadSet(def.setId)
      .then((s) => {
        if (!alive || def !== current || stage !== 'pack') return;
        set = s;
        prepare(def, s);
        hint.textContent = 'Glisse le long du haut pour déchirer — ou touche le booster';
        // Touché avant la fin du chargement : on déchire maintenant
        if (wantTear) tear();
      })
      .catch((err: Error) => {
        if (!alive || def !== current) return;
        hint.classList.remove('pulse');
        hint.textContent = `Impossible de charger les cartes : ${err.message}`;
        const retry = h('button', { class: 'btn' }, 'Réessayer');
        retry.onclick = packStage;
        hint.after(retry);
      });

    let drag: { x: number; moved: boolean } | null = null;
    let torn = false;
    const tear = () => {
      if (torn) return;
      if (!set) {
        wantTear = true;
        return;
      }
      torn = true;
      drag = null;
      picks?.remove();
      void open(def, set, pack, wrap);
    };
    wrap.addEventListener('pointerdown', (e) => {
      if (torn) return;
      drag = { x: e.clientX, moved: false };
      wrap.setPointerCapture(e.pointerId);
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!drag || !set) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 6) drag.moved = true;
      if (!drag.moved) return;
      const t = Math.min(1, Math.abs(dx) / 170);
      wrap.classList.add('tearing');
      wrap.style.transform = `rotate(${(t * 2.5).toFixed(2)}deg)`;
      pack.setTear(t);
      if (t >= 1) tear();
    });
    const up = () => {
      const d = drag;
      drag = null;
      if (!d || torn) return;
      if (!d.moved) return tear();
      wrap.classList.remove('tearing');
      wrap.style.transform = '';
      pack.setTear(0);
    };
    wrap.addEventListener('pointerup', up);
    wrap.addEventListener('pointercancel', up);
  };

  const open = async (d: BoosterDef, set: SetInfo, pack: ReturnType<typeof packEl>, wrap: HTMLElement) => {
    const { cards, loading } = prepare(d, set);
    const seen = new Set(Object.keys(getState().collection));
    const isNew = cards.map((c) => {
      const n = !seen.has(c.id);
      seen.add(c.id);
      return n;
    });
    const values = openPack(d.id, cards);
    if (!values.length) return packStage();
    prepared.delete(d.id);
    // Le suivant de la même sorte se prépare pendant la révélation
    if (getState().packs[d.id]) prepare(d, set);
    sub.textContent = `${plural(getState().packs[d.id] ?? 0, 'booster')} restant${(getState().packs[d.id] ?? 0) > 1 ? 's' : ''}`;
    pack.setTorn();
    wrap.classList.add('tearing');
    wrap.style.transform = '';
    await new Promise((r) => setTimeout(r, 200));
    wrap.classList.add('gone');
    // Images en général déjà là ; au pire on n'attend pas plus de 4 s
    await Promise.all([Promise.race([loading, new Promise((r) => setTimeout(r, 4000))]), new Promise((r) => setTimeout(r, 600))]);
    if (alive) reveal(d, cards, values, isNew);
  };

  /* ----- Révélation carte par carte ----- */
  const reveal = (d: BoosterDef, cards: Card[], values: number[], isNew: boolean[]) => {
    stage = 'reveal';
    closeBtn.classList.add('faded');
    const skip = h('button', { class: 'pill-btn' }, 'Tout révéler');
    skip.onclick = () => summary(d, cards, values, isNew);
    right.replaceChildren(skip);

    const glow = h('div', { class: 'op-glow' });
    const els = cards.map((c) => h('div', { class: 'stack-card' }, cardEl(c, { faceDown: true, large: true })));
    const stack = h('div', { class: 'op-stackwrap', role: 'button', 'aria-label': 'Révéler la carte suivante' }, glow, ...els);
    const info = h('div', { class: 'op-info' });
    body.replaceChildren(h('div', { class: 'op-center' }, stack, info));

    let i = 0;
    let flipped = false;
    const layout = () => {
      els.forEach((el, j) => {
        const dd = j - i;
        el.style.zIndex = String(40 - j);
        el.style.transform =
          dd < 0 ? 'translate(-125%,-30px) rotate(-16deg)' : dd === 0 ? 'none' : `translateY(${Math.min(dd, 4) * 5}px) scale(${1 - Math.min(dd, 4) * 0.025})`;
        el.style.opacity = dd < 0 || dd > 5 ? '0' : '1';
        el.firstElementChild!.classList.toggle('face-down', !(dd < 0 || (dd === 0 && flipped)));
      });
      const card = cards[Math.min(i, cards.length - 1)];
      sub.textContent = `${Math.min(i + 1, cards.length)} / ${cards.length}`;
      const t = tierIndex(card.tier);
      glow.className = `op-glow ${flipped && t >= tierIndex('rare') ? `on g-${t >= tierIndex('secret') ? 'secret' : t >= tierIndex('holo') ? 'gold' : 'blue'}` : ''}`;
      if (!flipped) {
        info.replaceChildren(h('span', { class: 'op-hint pulse' }, 'Touche pour révéler'));
        return;
      }
      const total = getState().collection[card.id]?.count ?? 0;
      info.replaceChildren(
        h(
          'div',
          { class: 'pills fade-in' },
          h('span', { class: `rar-pill tier-${card.tier}` }, TIER_LABEL[card.tier].toUpperCase()),
          isNew[i] ? h('span', { class: 'rar-pill new' }, 'NOUVELLE') : null,
        ),
        h('span', { class: 'op-name fade-in' }, cardName(card)),
        h('span', { class: 'op-meta' }, `${TIER_LABEL[card.tier]} · ${credits(values[i])}${isNew[i] ? '' : ` · ×${total} en tout`}`),
      );
    };
    stack.onclick = () => {
      if (stage !== 'reveal') return;
      if (!flipped) flipped = true;
      else if (i + 1 >= cards.length) return summary(d, cards, values, isNew);
      else {
        i++;
        flipped = false;
      }
      layout();
    };
    layout();
  };

  /* ----- Résumé ----- */
  const summary = (d: BoosterDef, cards: Card[], values: number[], isNew: boolean[]) => {
    stage = 'summary';
    closeBtn.classList.remove('faded');
    right.replaceChildren();
    const total = values.reduce((a, b) => a + b, 0);
    const gain = total - d.price;
    title.textContent = 'Ton booster';
    sub.textContent = `${plural(cards.length, 'carte')} · ${isNew.filter(Boolean).length} nouvelles`;
    const ids = [...new Set(cards.map((c) => c.id))];
    const grid = h(
      'div',
      { class: 'sum-grid' },
      ...cards.map((c, j) => {
        const cell = h('button', { class: 'sum-cell', style: `animation-delay:${j * 60}ms`, 'aria-label': cardName(c) }, h('div', { class: 'fit-card' }, cardEl(c, { isNew: isNew[j] })));
        cell.onclick = () => openDetail(ids, c.id);
        return cell;
      }),
    );
    const sealed = sealedDefs();
    const left = sealed.reduce((a, b) => a + getState().packs[b.id], 0);
    const next = h('button', { class: 'btn big primary' }, left ? `Ouvrir le suivant (${left})` : `Racheter ${d.name} · ${credits(d.price)}`);
    next.onclick = () => {
      if (left) {
        def = getState().packs[d.id] ? d : sealed[0];
        return packStage();
      }
      if (buyPack(d.id, 1)) {
        def = d;
        return packStage();
      }
      close();
      navigate('boutique/revente');
      toast('Pas assez de ₽ — revends quelques doublons.');
    };
    const coll = h('button', { class: 'btn' }, 'Voir la collection');
    coll.onclick = () => {
      close();
      navigate('collection');
    };
    body.replaceChildren(
      h(
        'div',
        { class: 'op-summary' },
        h(
          'div',
          { class: 'sum-head' },
          h('span', { class: 'muted' }, 'Valeur de revente'),
          h('b', {}, credits(total)),
          h('span', { class: `mono ${gain >= 0 ? 'good' : 'warn'}` }, `(${gain >= 0 ? '+' : ''}${credits(gain)})`),
        ),
        grid,
        h('div', { class: 'col-btns' }, next, coll),
      ),
    );
    if (gain > d.price) toast(`Jackpot ! +${credits(gain)}`);
  };

  packStage();
}

