import { loadSet, type Card } from '../api';
import {
  active,
  aiPickReplacement,
  aiTurn,
  alive,
  canAttack,
  canRetreat,
  createBattle,
  doAttack,
  doPass,
  doReplace,
  doRetreat,
  skipParalyzed,
  usableEnergies,
  type Battle,
  type BattleEvent,
  type Fighter,
  type SideId,
  type TeamMember,
} from '../battle/engine';
import { basicEnergyType, ENERGY_BOOST, isPlayablePokemon, MAX_CHARGE, MAX_ENERGIES, TEAM_SIZE } from '../battle/rules';
import { mainType, TYPE_INFO, type EnergyType } from '../battle/types';
import { cardEl } from '../components/card';
import { cardImage, cardName } from '../cardLang';
import { BOOSTERS, boosterById } from '../data/boosters';
import { leaderById, leaderTeam, LEADERS, type Leader } from '../data/leaders';
import { credits, h, sheet, toast, wait } from '../dom';
import { navigate } from '../router';
import { freeCopies, getState, recordBattle, sanitizeTeam, setSlotEnergies, setTeamSlot, subscribe } from '../state';

/* ---------- Données ---------- */

/** Toutes les cartes des extensions, avec leurs stats de combat. */
let allCards: Card[] = [];
const byId = new Map<string, Card>();

async function loadAll(): Promise<void> {
  const sets = await Promise.allSettled(BOOSTERS.map((b) => loadSet(b.setId)));
  allCards = sets.flatMap((r) => (r.status === 'fulfilled' ? r.value.cards : []));
  byId.clear();
  for (const c of allCards) byId.set(c.id, c);
}

/** Version complète d'une carte de la collection (les anciennes sauvegardes n'ont pas les stats). */
function full(id: string): Card | undefined {
  return byId.get(id) ?? getState().collection[id]?.card;
}

function typeChip(t: EnergyType, label = true): HTMLElement {
  const info = TYPE_INFO[t];
  return h('span', { class: 'type-chip', style: `--type:${info.color}`, title: info.label }, info.icon, label ? ` ${info.label}` : '');
}

function costPips(cost: string[]): HTMLElement {
  return h(
    'span',
    { class: 'cost' },
    ...cost.map((c) => {
      const info = TYPE_INFO[c as EnergyType] ?? TYPE_INFO.Colorless;
      return h('i', { style: `--type:${info.color}`, title: info.label }, info.icon);
    }),
  );
}

function statLine(card: Card): HTMLElement {
  const best = Math.max(0, ...(card.attacks ?? []).map((a) => a.damage));
  return h(
    'span',
    { class: 'stat-line' },
    typeChip(mainType(card.types), false),
    h('b', {}, `${card.hp} PV`),
    h('span', {}, `⚔ ${best}`),
    card.retreat ? h('span', { title: 'Coût de retraite' }, `↩ ${card.retreat}`) : null,
  );
}

/** Équipe du joueur prête pour un combat. */
function playerTeam(): TeamMember[] {
  return getState()
    .team.map((t) => {
      const card = full(t.cardId);
      if (!card || !isPlayablePokemon(card)) return null;
      const energies = t.energies.map((id) => full(id)).map((c) => (c ? basicEnergyType(c) : null)).filter((e): e is EnergyType => !!e);
      return { card, energies };
    })
    .filter((m): m is TeamMember => !!m);
}

function unlocked(index: number): boolean {
  return index === 0 || getState().arena.badges.includes(LEADERS[index - 1].id);
}

/* ---------- Page ---------- */

export function arenaPage(root: HTMLElement, param?: string): () => void {
  const page = h('section', { class: 'page arena' });
  root.append(page);
  let alive_ = true;
  let unsub: (() => void) | null = null;
  const closers: (() => void)[] = [];

  page.append(h('p', { class: 'empty' }, 'Chargement des cartes…'));
  void loadAll().then(() => {
    if (!alive_) return;
    sanitizeTeam();
    const leader = param ? leaderById(param) : undefined;
    if (leader) {
      const index = LEADERS.indexOf(leader);
      if (!unlocked(index) || playerTeam().length < TEAM_SIZE) return navigate('arenes');
      battleView(page, leader, () => alive_);
    } else {
      const draw = () => hubView(page, closers);
      draw();
      unsub = subscribe(draw);
    }
  });

  return () => {
    alive_ = false;
    unsub?.();
    closers.forEach((c) => c());
  };
}

/* ---------- Hub : badges, équipe, champions ---------- */

function hubView(page: HTMLElement, closers: (() => void)[]): void {
  const s = getState();
  const team = playerTeam();
  page.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', {}, 'Arènes'), h('p', {}, 'Compose ton équipe et décroche les 8 badges de Kanto.')),
    h(
      'div',
      { class: 'badges' },
      ...LEADERS.map((l) =>
        h('span', { class: `badge-slot ${s.arena.badges.includes(l.id) ? 'won' : ''}`, style: `--type:${TYPE_INFO[l.type].color}`, title: l.badge }, TYPE_INFO[l.type].icon),
      ),
      h('span', { class: 'muted small' }, `${s.arena.badges.length} / ${LEADERS.length} badges · ${s.arena.wins} V / ${s.arena.losses} D`),
    ),
    teamPanel(closers),
  );

  const list = h('div', { class: 'leaders' });
  LEADERS.forEach((l, i) => {
    const open = unlocked(i);
    const beaten = s.arena.badges.includes(l.id);
    const foes = leaderTeam(l, allCards);
    const fight = h('button', { class: 'btn primary', disabled: !open || team.length < TEAM_SIZE || foes.length < 1 }, beaten ? 'Revanche' : 'Défier');
    fight.onclick = () => navigate(`arenes/${l.id}`);
    list.append(
      h(
        'article',
        { class: `leader ${open ? '' : 'locked'} ${beaten ? 'beaten' : ''}`, style: `--type:${TYPE_INFO[l.type].color}` },
        h('div', { class: 'leader-emblem' }, open ? TYPE_INFO[l.type].icon : '🔒'),
        h(
          'div',
          { class: 'leader-info' },
          h('h2', {}, l.name, ' ', typeChip(l.type)),
          h('p', { class: 'muted small' }, `${l.arena} · ${l.badge}`),
          open ? h('p', { class: 'quote' }, `« ${l.quote} »`) : h('p', { class: 'muted small' }, `Bats ${LEADERS[i - 1].name} pour débloquer cette arène.`),
          open
            ? h(
                'div',
                { class: 'leader-team' },
                ...foes.map((m) => h('span', { class: 'mini-foe', title: cardName(m.card) }, h('img', { src: cardImage(m.card).src, alt: cardName(m.card), loading: 'lazy' }))),
              )
            : null,
          h(
            'p',
            { class: 'small' },
            beaten
              ? `Revanche : ${credits(Math.round(l.reward / 2))}`
              : `Récompense : ${credits(l.reward)} + ${l.badge} + booster ${boosterById(l.booster)?.name ?? ''}`,
          ),
        ),
        h('div', { class: 'leader-action' }, beaten ? h('span', { class: 'won-tag' }, '✔ Badge') : null, fight),
      ),
    );
  });
  page.append(h('h2', { class: 'section-title' }, 'Champions'), list);
}

function teamPanel(closers: (() => void)[]): HTMLElement {
  const s = getState();
  const playableCount = Object.values(s.collection).filter((o) => {
    const c = full(o.card.id);
    return c && isPlayablePokemon(c);
  }).length;
  const slots = h('div', { class: 'team-slots' });
  for (let i = 0; i < TEAM_SIZE; i++) {
    const slot = s.team[i];
    const card = slot ? full(slot.cardId) : undefined;
    if (!slot || !card) {
      const add = h('button', { class: 'team-slot empty-slot', disabled: i > s.team.length }, h('span', {}, '+'), h('small', {}, 'Choisir un Pokémon'));
      add.onclick = () => closers.push(pickPokemon(i));
      slots.append(add);
      continue;
    }
    const change = h('button', { class: 'btn small' }, 'Changer');
    change.onclick = () => closers.push(pickPokemon(i));
    const remove = h('button', { class: 'btn small ghost' }, 'Retirer');
    remove.onclick = () => setTeamSlot(i, null);
    const energies = h('div', { class: 'energy-slots' });
    for (let j = 0; j < MAX_ENERGIES; j++) {
      const id = slot.energies[j];
      const e = id ? full(id) : undefined;
      const type = e ? basicEnergyType(e) : null;
      const b = h(
        'button',
        { class: `energy-slot ${type ? 'filled' : ''}`, style: type ? `--type:${TYPE_INFO[type].color}` : undefined, title: type ? `Énergie ${TYPE_INFO[type].label}` : 'Équiper une Énergie' },
        type ? TYPE_INFO[type].icon : '+',
      );
      b.onclick = () => closers.push(pickEnergy(i, j));
      energies.append(b);
    }
    slots.append(
      h(
        'div',
        { class: 'team-slot' },
        cardEl(card),
        h('b', { class: 'slot-name' }, cardName(card)),
        statLine(card),
        h('p', { class: 'muted tiny' }, TYPE_INFO[mainType(card.types)].passive),
        energies,
        h('div', { class: 'actions' }, change, remove),
      ),
    );
  }
  return h(
    'section',
    { class: 'team' },
    h('h2', {}, 'Mon équipe'),
    h(
      'p',
      { class: 'muted small' },
      `${TEAM_SIZE} Pokémon et jusqu'à ${MAX_ENERGIES} cartes Énergie de base chacun : une Énergie s'active une fois par combat et multiplie par ${ENERGY_BOOST} une attaque de son type. `,
      'Les cartes Dresseur et Énergies spéciales ne participent pas aux combats.',
    ),
    playableCount ? slots : h('p', { class: 'empty' }, 'Aucun Pokémon jouable dans ta collection : ouvre des boosters !'),
  );
}

function pickPokemon(index: number): () => void {
  const s = getState();
  const current = s.team[index]?.cardId;
  const taken = new Set(s.team.map((t, i) => (i === index ? '' : t.cardId)));
  const options = Object.values(s.collection)
    .map((o) => full(o.card.id))
    .filter((c): c is Card => !!c && isPlayablePokemon(c) && !taken.has(c.id))
    .sort((a, b) => b.hp! - a.hp!);
  const grid = h('div', { class: 'pick-grid' });
  let close = () => {};
  for (const card of options) {
    const b = h('button', { class: `pick ${card.id === current ? 'current' : ''}` }, cardEl(card), h('b', {}, cardName(card)), statLine(card));
    b.onclick = () => {
      setTeamSlot(index, card.id);
      close();
    };
    grid.append(b);
  }
  close = sheet(
    'Choisir un Pokémon',
    h('p', { class: 'muted small' }, 'Seuls les Pokémon avec une attaque offensive sont proposés.'),
    options.length ? grid : h('p', { class: 'empty' }, 'Aucun Pokémon jouable disponible.'),
  );
  return close;
}

function pickEnergy(slotIndex: number, energyIndex: number): () => void {
  const s = getState();
  const slot = s.team[slotIndex];
  const pokemon = slot ? full(slot.cardId) : undefined;
  const current = slot?.energies[energyIndex];
  const byType = new Map<EnergyType, string[]>();
  for (const o of Object.values(s.collection)) {
    const t = basicEnergyType(o.card);
    if (!t) continue;
    if (freeCopies(o.card.id, { slot: slotIndex, energy: energyIndex }) > 0) byType.set(t, [...(byType.get(t) ?? []), o.card.id]);
  }
  let close = () => {};
  const set = (id: string | null) => {
    const energies = [...(slot?.energies ?? [])];
    if (id) energies[energyIndex] = id;
    else energies.splice(energyIndex, 1);
    setSlotEnergies(slotIndex, energies.filter(Boolean));
    close();
  };
  const own = pokemon ? mainType(pokemon.types) : null;
  const list = h('div', { class: 'energy-pick' });
  for (const [t, ids] of [...byType].sort(([a], [b]) => Number(b === own) - Number(a === own))) {
    const b = h('button', { class: 'btn', style: `--type:${TYPE_INFO[t].color}` }, typeChip(t), h('small', {}, ` (${ids.length} carte${ids.length > 1 ? 's' : ''})`));
    b.onclick = () => set(ids[0]);
    list.append(b);
  }
  const remove = current ? h('button', { class: 'btn ghost' }, 'Retirer l’Énergie') : null;
  if (remove) remove.onclick = () => set(null);
  close = sheet(
    'Équiper une Énergie',
    h(
      'p',
      { class: 'muted small' },
      own ? `Conseil : une Énergie ${TYPE_INFO[own].label} booste les attaques de ${pokemon ? cardName(pokemon) : 'ce Pokémon'}.` : '',
    ),
    byType.size ? list : h('p', { class: 'empty' }, 'Aucune carte Énergie de base libre. On en trouve dans les boosters (Set de Base notamment).'),
    remove,
  );
  return close;
}

/* ---------- Combat ---------- */

const STATUS_LABEL = { poison: '☠ Empoisonné', burn: '🔥 Brûlé', paralysis: '⚡ Paralysé' } as const;

function battleView(page: HTMLElement, leader: Leader, isAlive: () => boolean): void {
  const b: Battle = createBattle(playerTeam(), leaderTeam(leader, allCards));
  let busy = false;
  let result: HTMLElement | null = null;
  let lastHp = new Map<Fighter, number>();
  const log = h('div', { class: 'battle-log', 'aria-live': 'polite' });
  const field = h('div', { class: 'battle-field' });
  const controls = h('div', { class: 'battle-controls' });
  const quit = h('button', { class: 'btn ghost small' }, 'Abandonner');
  quit.onclick = () => navigate('arenes');
  page.replaceChildren(
    h('div', { class: 'battle-head' }, h('b', {}, `${leader.arena}`), typeChip(leader.type), quit),
    field,
    log,
    controls,
  );
  log.textContent = `${leader.name} : « ${leader.quote} »`;

  const name = (s: SideId) => cardName(active(b, s).card);
  const who = (s: SideId) => (s === 'player' ? '' : `${leader.name} — `);

  const fighterEl = (s: SideId): HTMLElement => {
    const side = b[s];
    const f = active(b, s);
    const pct = Math.round((f.hp / f.maxHp) * 100);
    const from = Math.round(((lastHp.get(f) ?? f.hp) / f.maxHp) * 100);
    const bench = h(
      'div',
      { class: 'bench' },
      ...side.fighters.map((m, i) =>
        h('span', { class: `bench-dot ${m.hp <= 0 ? 'down' : ''} ${i === side.active ? 'current' : ''}`, title: `${cardName(m.card)} ${m.hp}/${m.maxHp} PV` }, h('img', { src: cardImage(m.card).src, alt: '' })),
      ),
    );
    return h(
      'div',
      { class: `fighter ${s}`, 'data-side': s },
      h('div', { class: 'fighter-card' }, cardEl(f.card), h('div', { class: 'floats' })),
      h(
        'div',
        { class: 'fighter-info' },
        h('div', { class: 'fighter-name' }, h('b', {}, who(s) + cardName(f.card)), typeChip(mainType(f.card.types), false)),
        h(
          'div',
          { class: `hp-bar ${pct <= 25 ? 'low' : pct <= 50 ? 'mid' : ''}` },
          h('i', { style: `--from:${from}%;--to:${pct}%` }),
        ),
        h('div', { class: 'hp-text' }, `${f.hp} / ${f.maxHp} PV`, f.status ? h('span', { class: `status ${f.status}` }, STATUS_LABEL[f.status]) : null),
        h(
          'div',
          { class: 'charge', title: 'Énergies accumulées' },
          ...Array.from({ length: MAX_CHARGE }, (_, i) => h('i', { class: i < f.charge ? 'on' : '' })),
          ...f.energies.map((e) => h('span', { class: 'energy-token', style: `--type:${TYPE_INFO[e].color}`, title: `Énergie ${TYPE_INFO[e].label} (×${ENERGY_BOOST})` }, TYPE_INFO[e].icon)),
        ),
        bench,
      ),
    );
  };

  const render = () => {
    field.replaceChildren(fighterEl('foe'), h('div', { class: 'versus' }, `Tour ${b.round}`), fighterEl('player'));
    lastHp = new Map([...b.player.fighters, ...b.foe.fighters].map((f) => [f, f.hp]));
    renderControls();
  };

  const renderControls = () => {
    controls.replaceChildren();
    if (b.winner) {
      result ??= finish();
      controls.append(result);
      return;
    }
    if (b.needsSwitch === 'player') {
      controls.append(h('p', { class: 'prompt' }, 'Ton Pokémon est K.O. ! Choisis le suivant :'), switchList((i) => run(() => doReplace(b, i))));
      return;
    }
    if (b.turn !== 'player' || busy) {
      controls.append(h('p', { class: 'prompt muted' }, b.turn === 'foe' ? `${leader.name} réfléchit…` : '…'));
      return;
    }
    const me = active(b, 'player');
    const attacks = h('div', { class: 'attacks' });
    (me.card.attacks ?? []).forEach((a, i) => {
      // Attaques à effet seul (sans dégâts) : hors jeu dans les règles simplifiées
      if (a.damage <= 0) return;
      const ok = canAttack(me, a);
      const btn = h(
        'button',
        { class: 'attack', disabled: !ok },
        h('span', { class: 'attack-name' }, a.name),
        costPips(a.cost),
        h('b', { class: 'attack-dmg' }, a.damage ? String(a.damage) : '—'),
      );
      btn.onclick = () => run(() => doAttack(b, i));
      const row = h('div', { class: 'attack-row' }, btn);
      for (const e of ok ? usableEnergies(me, a) : []) {
        const boost = h('button', { class: 'boost', style: `--type:${TYPE_INFO[e].color}`, title: `Utiliser l'Énergie ${TYPE_INFO[e].label}` }, `${TYPE_INFO[e].icon} ×${ENERGY_BOOST}`);
        boost.onclick = () => run(() => doAttack(b, i, e));
        row.append(boost);
      }
      attacks.append(row);
    });
    const retreat = h('button', { class: 'btn small', disabled: !canRetreat(b, 'player') }, `Retraite (↩ ${me.card.retreat ?? 0})`);
    retreat.onclick = () => {
      const close = sheet('Changer de Pokémon', switchList((i) => {
        close();
        void run(() => doRetreat(b, i));
      }, true));
    };
    const pass = h('button', { class: 'btn small ghost' }, 'Passer le tour');
    pass.onclick = () => run(() => doPass(b));
    const hint = me.card.attacks?.some((a) => canAttack(me, a))
      ? null
      : h('p', { class: 'muted small' }, `Pas assez d'énergie : ${cardName(me.card)} gagne 1 énergie par tour.`);
    controls.append(attacks, ...(hint ? [hint] : []), h('div', { class: 'actions center' }, retreat, pass));
  };

  /** Seuls les membres de l'équipe encore debout sont proposés. */
  const switchList = (onPick: (i: number) => void, excludeActive = false) =>
    h(
      'div',
      { class: 'switch-list' },
      ...alive(b, 'player')
        .filter((i) => !excludeActive || i !== b.player.active)
        .map((i) => {
          const f = b.player.fighters[i];
          const btn = h('button', { class: 'switch-item' }, h('img', { src: cardImage(f.card).src, alt: '' }), h('span', {}, h('b', {}, cardName(f.card)), h('small', {}, `${f.hp}/${f.maxHp} PV · ${f.charge} énergie${f.charge > 1 ? 's' : ''}`)));
          btn.onclick = () => onPick(i);
          return btn;
        }),
    );

  const describe = (e: BattleEvent): string => {
    switch (e.kind) {
      case 'attack': {
        const r = e.result;
        const extras = [r.weak && 'Super efficace !', r.resisted && 'Résisté…', r.critical && 'Coup critique !', e.energy && `Énergie ${TYPE_INFO[e.energy].label} ×${ENERGY_BOOST} !`].filter(Boolean).join(' ');
        return `${who(e.side)}${name(e.side)} utilise ${e.attack} : ${r.amount} dégâts. ${extras}`;
      }
      case 'status':
        return `${name(e.side)} est ${STATUS_LABEL[e.status].slice(2).toLowerCase()} !`;
      case 'tick':
        return `${name(e.side)} subit ${e.amount} dégâts (${e.status === 'poison' ? 'poison' : 'brûlure'}).`;
      case 'heal':
        return `${name(e.side)} récupère ${e.amount} PV.`;
      case 'paralyzed':
        return `${name(e.side)} est paralysé et ne peut pas attaquer !`;
      case 'ko':
        return `${cardName(b[e.side].fighters[b[e.side].active].card)} est K.O. !`;
      case 'switch':
        return `${e.side === 'player' ? 'À toi' : `${leader.name} envoie`} ${e.side === 'player' ? cardName(b.player.fighters[b.player.active].card) : cardName(active(b, 'foe').card)} !`;
    }
  };

  const float = (s: SideId, text: string, kind: string) => {
    const host = field.querySelector(`.fighter.${s} .floats`);
    if (!host) return;
    const el = h('span', { class: `float ${kind}` }, text);
    host.append(el);
    setTimeout(() => el.remove(), 1200);
  };

  const animate = (s: SideId, cls: string) => {
    const el = field.querySelector<HTMLElement>(`.fighter.${s} .fighter-card`);
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  };

  const play = async (events: BattleEvent[]) => {
    for (const e of events) {
      if (!isAlive()) return;
      log.textContent = describe(e);
      if (e.kind === 'attack') {
        animate(e.side, 'lunge');
        await wait(260);
        const target = e.side === 'player' ? 'foe' : 'player';
        animate(target, 'hit');
        float(target, `-${e.result.amount}`, e.result.weak || e.result.critical ? 'big' : 'dmg');
        render();
      } else if (e.kind === 'tick') {
        float(e.side, `-${e.amount}`, 'dmg');
        render();
      } else if (e.kind === 'heal') {
        render();
        float(e.side, `+${e.amount}`, 'heal');
      } else if (e.kind === 'ko') {
        animate(e.side, 'ko');
      } else {
        render();
      }
      await wait(e.kind === 'ko' ? 900 : 750);
    }
  };

  const run = async (action: () => BattleEvent[]) => {
    if (busy) return;
    busy = true;
    renderControls();
    await play(action());
    // Tours automatiques : IA, remplacements du champion, paralysie du joueur
    while (isAlive() && !b.winner) {
      if (b.needsSwitch === 'foe') {
        await wait(400);
        await play(doReplace(b, aiPickReplacement(b, 'foe')));
      } else if (b.needsSwitch === 'player') {
        break;
      } else if (b.turn === 'foe') {
        render();
        await wait(700);
        await play(aiTurn(b));
      } else if (active(b, 'player').status === 'paralysis') {
        await wait(500);
        await play(skipParalyzed(b));
      } else break;
    }
    busy = false;
    if (isAlive()) render();
  };

  /** Enregistre le résultat (une seule fois) et construit l'écran de fin. */
  const finish = (): HTMLElement => {
    const won = b.winner === 'player';
    const reward = recordBattle(leader.id, won, { credits: leader.reward, booster: leader.booster });
    const again = h('button', { class: 'btn primary' }, won ? 'Retour aux arènes' : 'Réessayer');
    again.onclick = () => (won ? navigate('arenes') : battleView(page, leader, isAlive));
    const back = h('button', { class: 'btn ghost' }, won ? 'Ouvrir le booster' : 'Modifier l’équipe');
    back.onclick = () => navigate(won ? `ouverture/${leader.booster}` : 'arenes');
    if (won && reward.badge) toast(`${leader.badge} obtenu !`, 'good');
    return h(
        'div',
        { class: `result ${won ? 'won' : 'lost'}` },
        h('h2', {}, won ? 'Victoire !' : 'Défaite…'),
        won
          ? h(
              'p',
              {},
              `${leader.name} : « Bravo, tu as gagné ! » `,
              h('b', {}, `+${credits(reward.credits)}`),
              reward.badge ? h('span', { class: 'badge-won' }, ` · ${leader.badge} obtenu !`) : null,
              reward.booster ? ` · Booster ${boosterById(reward.booster)?.name} offert` : null,
            )
          : h('p', {}, `${leader.name} remporte le combat. Renforce ton équipe ou profite des faiblesses de type !`),
        h('div', { class: 'actions center' }, again, reward.booster ? back : won ? null : back),
      );
  };

  render();
}
