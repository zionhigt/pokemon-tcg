import { badgeLetter, foes, full, loadAll, unlocked, weakTypes } from '../arenaData';
import { basicEnergyType } from '../battle/rules';
import { TYPE_INFO } from '../battle/types';
import { cardEl } from '../components/card';
import { packEl } from '../components/pack';
import { boosterById } from '../data/boosters';
import { leaderById, LEADERS, type Leader } from '../data/leaders';
import { credits, dots, h, justSwiped, swiper, toast } from '../dom';
import { getState, sanitizeTeam, subscribe } from '../state';
import { openPrep } from './prep';

/** Champion affiché : le premier encore à battre, sauf choix du joueur. */
let index = -1;

function firstToBeat(): number {
  const s = getState();
  const i = LEADERS.findIndex((l, j) => unlocked(j) && !s.arena.badges.includes(l.id));
  return i >= 0 ? i : LEADERS.length - 1;
}

export function typeChip(t: keyof typeof TYPE_INFO, dark = true): HTMLElement {
  return h('span', { class: `type-chip ${dark ? 'dark' : ''}` }, h('i', { class: 'dot', style: `background:${TYPE_INFO[t].color}` }), TYPE_INFO[t].label);
}

export function arenaPage(root: HTMLElement, param?: string): () => void {
  const page = h('section', { class: 'page arena' });
  root.append(page);
  const leader = param ? leaderById(param) : undefined;
  if (leader) index = LEADERS.indexOf(leader);
  if (index < 0) index = firstToBeat();
  let alive = true;
  let unsub = () => {};

  page.append(h('p', { class: 'loading pulse' }, 'Chargement des cartes…'));
  void loadAll().then(() => {
    if (!alive) return;
    sanitizeTeam();
    hub(page);
    unsub = subscribe(() => hub(page));
  });
  return () => {
    alive = false;
    unsub();
  };
}

function hub(page: HTMLElement): void {
  const s = getState();
  const badges = h(
    'div',
    { class: 'badge-row' },
    ...LEADERS.map((l, i) => {
      const won = s.arena.badges.includes(l.id);
      const b = h(
        'button',
        { class: `badge-dot ${won ? 'won' : ''} ${i === index ? 'cur' : ''}`, style: `--type:${TYPE_INFO[l.type].color}`, 'aria-label': `${l.name} · ${l.badge}` },
        badgeLetter(l),
      );
      b.onclick = () => go(i);
      return b;
    }),
  );

  const rail = h('div', { class: 'champ-rail' }, ...LEADERS.map((l, i) => champCard(l, i)));
  const viewport = h('div', { class: 'champs' }, rail);
  const dotsHost = h('div');
  const sw = swiper(viewport, rail, {
    count: () => LEADERS.length,
    index: () => index,
    pos: (i, dx) => `translateX(calc(31px - ${i} * (100% - 48px) + ${dx}px))`,
    go: (i) => go(i),
  });
  const cta = h('button', { class: 'btn big cta' });
  const bar = h('div', { class: 'team-bar' }, teamButton(), cta);

  const go = (i: number) => {
    index = i;
    sw.place();
    refresh();
  };
  const refresh = () => {
    rail.querySelectorAll<HTMLElement>('.champ').forEach((el, i) => el.classList.toggle('on', i === index));
    badges.querySelectorAll('.badge-dot').forEach((el, i) => el.classList.toggle('cur', i === index));
    dotsHost.replaceChildren(dots(LEADERS.length, index, go));
    const l = LEADERS[index];
    const locked = !unlocked(index);
    cta.className = `btn big cta ${locked ? 'off' : 'primary'}`;
    cta.textContent = locked ? 'Verrouillée' : s.arena.badges.includes(l.id) ? 'Revanche' : `Défier ${l.name.split(' ').pop()}`;
    cta.onclick = () => (locked ? toast(`Bats ${LEADERS[index - 1].name} d’abord.`) : openPrep(l));
  };
  rail.querySelectorAll<HTMLElement>('.champ').forEach((el, i) =>
    el.addEventListener('click', () => {
      if (!justSwiped() && i !== index) go(i);
    }),
  );

  page.replaceChildren(badges, viewport, dotsHost, bar);
  sw.place();
  refresh();
}

function teamButton(): HTMLElement {
  const s = getState();
  const minis = [0, 1, 2].map((i) => {
    const slot = s.team[i];
    const card = slot ? full(slot.cardId) : undefined;
    return h(
      'div',
      { class: 'team-mini' },
      card ? h('div', { class: 'mini-card' }, cardEl(card)) : h('div', { class: 'mini-empty' }),
      h(
        'div',
        { class: 'en-dots' },
        ...(slot?.energies ?? []).map((id) => {
          const c = full(id);
          const t = c ? basicEnergyType(c) : null;
          return h('i', { style: `background:${t ? TYPE_INFO[t].color : '#555'}` });
        }),
      ),
    );
  });
  const btn = h(
    'button',
    { class: 'team-btn' },
    h('div', { class: 'team-minis' }, ...minis),
    h('div', { class: 'col' }, h('b', {}, 'Ton équipe'), h('span', { class: 'accent' }, 'Modifier ›')),
  );
  btn.onclick = () => openPrep(LEADERS[index]);
  return btn;
}

function champCard(l: Leader, i: number): HTMLElement {
  const s = getState();
  const color = TYPE_INFO[l.type].color;
  const beaten = s.arena.badges.includes(l.id);
  const team = foes(l);
  const weak = weakTypes(l);
  const booster = boosterById(l.booster);
  const el = h(
    'article',
    { class: 'champ', style: `--type:${color}` },
    h(
      'div',
      { class: 'champ-id' },
      h('div', { class: 'avatar' }, l.name[0]),
      h(
        'div',
        { class: 'col grow min0' },
        h('div', { class: 'row min0' }, h('span', { class: 'champ-name' }, l.name), typeChip(l.type)),
        h('span', { class: 'champ-arena' }, `${l.arena} · ${l.badge}`),
      ),
    ),
    h('p', { class: 'quote' }, `« ${l.quote} »`),
    h(
      'div',
      { class: 'champ-team' },
      h(
        'div',
        { class: 'champ-team-head' },
        h('span', { class: 'eyebrow' }, 'SON ÉQUIPE'),
        weak.length
          ? h('span', { class: 'weak' }, 'Craint', ...weak.slice(0, 3).map((w) => h('span', {}, h('i', { class: 'dot', style: `background:${TYPE_INFO[w]?.color ?? '#888'}` }), TYPE_INFO[w]?.label ?? w)))
          : null,
      ),
      h('div', { class: 'champ-cards' }, ...team.map((m) => h('div', { class: 'champ-card' }, cardEl(m.card)))),
    ),
    h(
      'div',
      { class: 'reward' },
      booster ? h('div', { class: 'reward-pack' }, packEl(booster)) : null,
      h(
        'div',
        { class: 'col grow min0' },
        h('span', { class: 'eyebrow' }, 'RÉCOMPENSE'),
        h('span', { class: 'reward-txt' }, beaten ? `Revanche : ${credits(Math.round(l.reward / 2))}` : `${credits(l.reward)} · ${l.badge} · booster ${booster?.name ?? ''}`),
      ),
      beaten ? h('span', { class: 'got' }, 'Obtenu ✓') : null,
    ),
  );
  if (!unlocked(i)) {
    el.append(
      h(
        'div',
        { class: 'locked' },
        h('span', { class: 'lock-ico' }),
        h('b', {}, 'Arène verrouillée'),
        h('span', {}, `Bats ${LEADERS[i - 1].name} pour débloquer ${l.name}.`),
      ),
    );
  }
  return el;
}

