import { badgeLetter, foes, playerTeam, weakTypes } from '../arenaData';
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
} from '../battle/engine';
import { attackCost, computeDamage, ENERGY_BOOST, MAX_CHARGE } from '../battle/rules';
import { mainType, TYPE_INFO, type EnergyType } from '../battle/types';
import { cardName } from '../cardLang';
import { cardEl } from '../components/card';
import { boosterById } from '../data/boosters';
import { LEADERS, type Leader } from '../data/leaders';
import { credits, h, plural, pushLayer, replay, toast, wait } from '../dom';
import { recordBattle } from '../state';
import { energyToken } from './prep';

const STATUS_LABEL = { poison: 'Empoisonné', burn: 'Brûlé', paralysis: 'Paralysé' } as const;

/** Lance l'intro « VS » puis le combat. `closePrep` ferme la préparation après une victoire. */
export function startBattle(leader: Leader, closePrep: () => void): void {
  const team = playerTeam();
  const foeTeam = foes(leader);
  if (!foeTeam.length) return toast('Les cartes du champion ne sont pas encore chargées.');
  versus(leader, team.map((m) => m.card), foeTeam.map((m) => m.card), () => battleLayer(leader, closePrep));
}

/* ---------- Intro VS ---------- */

function versus(leader: Leader, mine: Fighter['card'][], theirs: Fighter['card'][], start: () => void): void {
  const color = TYPE_INFO[leader.type].color;
  const top = h(
    'div',
    { class: 'vs-top', style: `--type:${color}` },
    h(
      'div',
      { class: 'vs-side right' },
      h('span', { class: 'eyebrow light' }, `CHAMPION · ${leader.arena}`.toUpperCase()),
      h('span', { class: 'vs-name' }, leader.name),
      h('div', { class: 'vs-cards' }, ...theirs.map((c) => h('div', {}, cardEl(c)))),
    ),
  );
  const bottom = h(
    'div',
    { class: 'vs-bottom' },
    h(
      'div',
      { class: 'vs-side left' },
      h('div', { class: 'vs-cards' }, ...mine.map((c) => h('div', {}, cardEl(c)))),
      h('span', { class: 'vs-name me' }, 'Toi'),
      h('span', { class: 'eyebrow light' }, `TON ÉQUIPE · ${mine.length} POKÉMON`),
    ),
  );
  const line = h('div', { class: 'vs-line' });
  const badge = h('div', { class: 'vs-badge' }, 'VS');
  const el = h('div', { class: 'layer vs' }, top, bottom, line, badge);
  const close = pushLayer(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  setTimeout(() => {
    start();
    // L'intro reste au-dessus du combat le temps de s'effacer
    el.parentElement?.append(el);
    el.classList.add('out');
  }, 1600);
  setTimeout(close, 2050);
}

/* ---------- Combat ---------- */

function battleLayer(leader: Leader, closePrep: () => void): void {
  const b: Battle = createBattle(playerTeam(), foes(leader));
  /** Énergies équipées au départ (le moteur retire celles qui ont servi) */
  const equipped = new Map<Fighter, EnergyType[]>(b.player.fighters.map((f) => [f, [...f.energies]]));
  let busy = false;
  let armed = false;
  let over = false;
  let alive_ = true;

  const color = TYPE_INFO[leader.type].color;
  const round = h('span', { class: 'mono muted small' });
  const flee = h('button', { class: 'ghost-btn' }, 'Abandonner');
  const foePanel = h('div', { class: 'fighter foe' });
  const log = h('div', { class: 'battle-log', 'aria-live': 'polite' });
  const mePanel = h('div', { class: 'fighter me' });
  const controls = h('div', { class: 'battle-controls' });
  const layer = h(
    'div',
    { class: 'layer battle', style: `--type:${color}` },
    h('div', { class: 'battle-head' }, h('i', { class: 'dot lg', style: `background:${color}` }), h('b', {}, leader.name), round, flee),
    foePanel,
    log,
    mePanel,
    controls,
  );
  const close = pushLayer(layer, () => (alive_ = false));
  flee.onclick = () => {
    if (over) return close();
    recordBattle(leader.id, false, { credits: leader.reward, booster: leader.booster });
    close();
    toast('Combat abandonné');
  };
  setLog(`${leader.name} : « ${leader.quote} »`, 'quote');

  function setLog(text: string, tone: 'plain' | 'quote' | 'crit' | 'ko' | 'think' = 'plain') {
    log.textContent = text;
    log.className = `battle-log tone-${tone}`;
  }

  const name = (s: SideId) => cardName(active(b, s).card);
  const who = (s: SideId) => (s === 'player' ? '' : `${leader.name} — `);

  /* ----- Panneaux ----- */
  const cardWraps: Record<SideId, HTMLElement> = { player: h('div', { class: 'f-card' }), foe: h('div', { class: 'f-card' }) };
  const shownActive: Record<SideId, Fighter | null> = { player: null, foe: null };

  const pips = (f: Fighter) => h('div', { class: 'pips' }, ...Array.from({ length: MAX_CHARGE }, (_, i) => h('i', { class: i < f.charge ? 'on' : '' })));
  const bench = (s: SideId) =>
    h(
      'div',
      { class: 'bench' },
      ...b[s].fighters.map((f, i) => h('div', { class: 'bench-card' }, cardEl(f.card, { dim: f.hp <= 0 || i === b[s].active }))),
    );
  const hpBar = (f: Fighter) => {
    const p = f.hp / f.maxHp;
    return h('div', { class: 'hp' }, h('i', { style: `width:${p * 100}%;background:${p > 0.5 ? '#43d18d' : p > 0.2 ? '#f4cf3a' : '#ff5c7a'}` }));
  };

  const drawPanel = (s: SideId) => {
    const f = active(b, s);
    const wrap = cardWraps[s];
    if (shownActive[s] !== f) {
      shownActive[s] = f;
      wrap.replaceChildren(h('div', { class: 'f-shake' }, cardEl(f.card)));
    }
    const nameRow = h(
      'div',
      { class: 'row min0' },
      h('span', { class: 'f-name' }, cardName(f.card)),
      h('i', { class: 'dot', style: `background:${TYPE_INFO[mainType(f.card.types)].color}` }),
      f.status ? h('span', { class: `status ${f.status}` }, STATUS_LABEL[f.status]) : null,
    );
    const hpRow = h('div', { class: 'row between' }, h('span', { class: 'mono' }, `${f.hp} / ${f.maxHp} PV`), pips(f));
    const info = h('div', { class: 'col grow min0 f-info' }, nameRow, hpBar(f), hpRow);
    if (s === 'player') {
      const eq = equipped.get(f) ?? [];
      const left = [...f.energies];
      const tokens = eq.map((t) => {
        const i = left.indexOf(t);
        const used = i < 0;
        if (!used) left.splice(i, 1);
        const helps = (f.card.attacks ?? []).some((a) => usableEnergies({ ...f, energies: [t] }, a).length);
        return energyToken(t, `${used ? 'used' : ''} ${helps ? 'ok' : 'bad'}`);
      });
      const usable = f.energies.some((t) => (f.card.attacks ?? []).some((a) => usableEnergies({ ...f, energies: [t] }, a).length));
      const txt = !eq.length ? 'Aucune Énergie attachée' : usable ? `Boost ×${ENERGY_BOOST} disponible` : f.energies.length ? 'Énergie d’un autre type' : 'Boost utilisé';
      info.append(h('div', { class: 'boosts' }, ...tokens, h('span', { class: 'muted small' }, txt)));
    }
    info.append(bench(s));
    (s === 'foe' ? foePanel : mePanel).replaceChildren(...(s === 'foe' ? [info, wrap] : [wrap, info]));
  };

  /* ----- Commandes ----- */
  const renderControls = () => {
    controls.replaceChildren();
    if (over) return;
    const me = active(b, 'player');
    const foe = active(b, 'foe');
    const myTurn = b.turn === 'player' && !busy && !b.needsSwitch && !b.winner;
    const boostable = me.energies.some((t) => (me.card.attacks ?? []).some((a) => a.damage > 0 && usableEnergies({ ...me, energies: [t] }, a).length));
    if (!boostable) armed = false;
    if (boostable && myTurn) {
      const t = me.energies.find((e) => (me.card.attacks ?? []).some((a) => usableEnergies({ ...me, energies: [e] }, a).length))!;
      const arm = h(
        'button',
        { class: `arm-btn ${armed ? 'on' : ''}`, 'aria-pressed': armed },
        armed ? `Énergie ${TYPE_INFO[t].label} activée · prochaine attaque ×${ENERGY_BOOST}` : `Activer l’Énergie ${TYPE_INFO[t].label} (×${ENERGY_BOOST}, une fois)`,
      );
      arm.onclick = () => {
        armed = !armed;
        renderControls();
      };
      controls.append(arm);
    }
    (me.card.attacks ?? []).forEach((a, i) => {
      // Attaques à effet seul (sans dégâts) : hors jeu dans les règles simplifiées
      if (a.damage <= 0) return;
      const has = me.charge >= attackCost(a);
      const ok = myTurn && canAttack(me, a);
      const energy = armed ? usableEnergies(me, a)[0] : undefined;
      const r = computeDamage(me.card, foe.card, a, { boost: !!energy, defenderDamaged: foe.hp < foe.maxHp, rng: () => 1 });
      const weak = foe.card.weaknesses?.find((w) => me.card.types?.includes(w.type));
      const sub = me.status === 'paralysis'
        ? 'Paralysé ce tour-ci'
        : !has
          ? `Il manque ${plural(attackCost(a) - me.charge, 'énergie')}`
          : r.weak || energy
            ? [r.weak && `${weak?.value ?? '×2'} sur ${cardName(foe.card)}`, energy && `Énergie ×${ENERGY_BOOST}`].filter(Boolean).join(' · ')
            : plural(attackCost(a), 'énergie');
      const btn = h(
        'button',
        { class: `atk ${ok ? 'ready' : ''}`, disabled: !ok },
        h(
          'div',
          { class: 'atk-cost' },
          ...a.cost.map((c, j) => h('i', { style: `background:${j < me.charge ? (TYPE_INFO[c as EnergyType]?.color ?? '#d6d2c4') : 'rgba(255,255,255,.15)'}` })),
        ),
        h('div', { class: 'col grow min0' }, h('span', { class: 'atk-name' }, a.name), h('span', { class: 'atk-sub' }, sub)),
        h('span', { class: 'atk-dmg' }, String(r.amount)),
      );
      btn.onclick = () => {
        const e = armed ? usableEnergies(me, a)[0] : undefined;
        if (e) armed = false;
        void run(() => doAttack(b, i, e));
      };
      controls.append(btn);
    });
    const canRet = myTurn && canRetreat(b, 'player');
    const retreat = h('button', { class: `btn ${canRet ? '' : 'faded'}` }, `Retraite · ${plural(me.card.retreat ?? 0, 'énergie')}`);
    retreat.onclick = () => canRet && pickSheet('retreat');
    const pass = h('button', { class: `btn ${myTurn ? '' : 'faded'}` }, 'Passer le tour');
    pass.onclick = () => {
      if (!myTurn) return;
      armed = false;
      void run(() => doPass(b));
    };
    controls.append(h('div', { class: 'row-btns' }, retreat, pass));
  };

  /** Choix du Pokémon qui entre en jeu (après un K.O. ou pour une retraite). */
  const pickSheet = (reason: 'ko' | 'retreat') => {
    const opts = alive(b, 'player').filter((i) => i !== b.player.active || reason === 'ko');
    const scrim = h('div', { class: 'scrim in-layer' });
    const done = () => scrim.remove();
    const panel = h(
      'div',
      { class: 'sheet' },
      h('span', { class: 'sheet-title' }, reason === 'ko' ? `${name('player')} est K.O. — choisis le suivant` : 'Retraite — qui entre en jeu ?'),
      ...opts
        .filter((i) => b.player.fighters[i].hp > 0)
        .map((i) => {
          const f = b.player.fighters[i];
          const btn = h(
            'button',
            { class: 'pick-row' },
            h('div', { class: 'pick-row-card' }, cardEl(f.card)),
            h('div', { class: 'col grow' }, h('b', {}, cardName(f.card)), h('span', { class: 'mono muted' }, `${f.hp}/${f.maxHp} PV · ${plural(f.charge, 'énergie')}`)),
            h('span', { class: 'chev' }, '›'),
          );
          btn.onclick = () => {
            done();
            void run(() => (reason === 'ko' ? doReplace(b, i) : doRetreat(b, i)));
          };
          return btn;
        }),
    );
    if (reason === 'retreat') {
      const cancel = h('button', { class: 'text-btn muted' }, 'Annuler');
      cancel.onclick = done;
      panel.append(cancel);
      scrim.onclick = (e) => e.target === scrim && done();
    }
    scrim.append(panel);
    layer.append(scrim);
  };

  /* ----- Animations ----- */
  const float = (s: SideId, text: string, kind: 'dmg' | 'big' | 'heal') => {
    const wrap = cardWraps[s];
    const flash = kind === 'heal' ? null : h('div', { class: 'hit-flash' });
    const num = h('div', { class: `dmg-float ${kind}` }, text);
    wrap.append(...(flash ? [flash, num] : [num]));
    setTimeout(() => {
      flash?.remove();
      num.remove();
    }, 1100);
  };
  const pose = (s: SideId, cls: 'lunge' | 'ko' | 'enter' | 'hit') => {
    const el = cls === 'hit' ? cardWraps[s].querySelector('.f-shake') : cardWraps[s];
    if (!el) return;
    if (cls !== 'hit') el.classList.remove('lunge', 'ko', 'enter');
    replay(el, cls);
  };

  const describe = (e: BattleEvent): string => {
    switch (e.kind) {
      case 'attack': {
        const r = e.result;
        const extras = [r.weak && 'Super efficace !', r.resisted && 'Résisté…', r.critical && 'Coup critique !', e.energy && `Énergie ${TYPE_INFO[e.energy].label} ×${ENERGY_BOOST} !`]
          .filter(Boolean)
          .join(' ');
        return `${who(e.side)}${name(e.side)} utilise ${e.attack} : ${r.amount} dégâts.${extras ? ` ${extras}` : ''}`;
      }
      case 'status':
        return `${name(e.side)} est ${STATUS_LABEL[e.status].toLowerCase()} !`;
      case 'tick':
        return `${name(e.side)} subit ${e.amount} dégâts (${e.status === 'poison' ? 'poison' : 'brûlure'}).`;
      case 'heal':
        return `${name(e.side)} récupère ${e.amount} PV.`;
      case 'paralyzed':
        return `${name(e.side)} est paralysé et ne peut pas attaquer !`;
      case 'ko':
        return `${cardName(b[e.side].fighters[b[e.side].active].card)} est K.O. !`;
      case 'switch':
        return e.side === 'player' ? `À toi, ${name('player')} !` : `${leader.name} envoie ${name('foe')} !`;
    }
  };

  const render = () => {
    round.textContent = `· Tour ${b.round}`;
    drawPanel('foe');
    drawPanel('player');
    renderControls();
  };

  const play = async (events: BattleEvent[]) => {
    for (const e of events) {
      if (!alive_) return;
      const tone = e.kind === 'ko' ? 'ko' : e.kind === 'attack' && (e.result.weak || e.result.critical || e.energy) ? 'crit' : 'plain';
      setLog(describe(e), tone);
      if (e.kind === 'attack') {
        pose(e.side, 'lunge');
        await wait(230);
        const target = e.side === 'player' ? 'foe' : 'player';
        render();
        pose(target, 'hit');
        float(target, `-${e.result.amount}`, e.result.weak || e.result.critical || e.energy ? 'big' : 'dmg');
      } else if (e.kind === 'tick') {
        render();
        float(e.side, `-${e.amount}`, 'dmg');
      } else if (e.kind === 'heal') {
        render();
        float(e.side, `+${e.amount}`, 'heal');
      } else if (e.kind === 'ko') {
        pose(e.side, 'ko');
      } else if (e.kind === 'switch') {
        render();
        pose(e.side, 'enter');
      } else render();
      await wait(e.kind === 'ko' ? 900 : 800);
    }
  };

  const run = async (action: () => BattleEvent[]) => {
    if (busy) return;
    busy = true;
    renderControls();
    await play(action());
    // Tours automatiques : IA, remplacements du champion, paralysie du joueur
    while (alive_ && !b.winner) {
      if (b.needsSwitch === 'foe') {
        await wait(400);
        await play(doReplace(b, aiPickReplacement(b, 'foe')));
      } else if (b.needsSwitch === 'player') break;
      else if (b.turn === 'foe') {
        render();
        setLog(`${leader.name} réfléchit…`, 'think');
        await wait(750);
        await play(aiTurn(b));
      } else if (active(b, 'player').status === 'paralysis') {
        await wait(500);
        await play(skipParalyzed(b));
      } else break;
    }
    busy = false;
    if (!alive_) return;
    render();
    if (b.winner) finish();
    else if (b.needsSwitch === 'player') pickSheet('ko');
    else if (b.turn === 'player') setLog(`À toi de jouer — ${name('player')} gagne 1 énergie.`);
  };

  /** Enregistre le résultat (une seule fois) et affiche l'écran de fin. */
  const finish = () => {
    over = true;
    renderControls();
    const won = b.winner === 'player';
    const reward = recordBattle(leader.id, won, { credits: leader.reward, booster: leader.booster });
    const weak = weakTypes(leader).map((w) => TYPE_INFO[w]?.label ?? w);
    const primary = h('button', { class: 'btn big primary' }, won ? 'Continuer' : 'Réessayer');
    const scrim = h('div', { class: 'result-scrim' });
    primary.onclick = () => {
      if (won) {
        close();
        closePrep();
      } else {
        close();
        startBattle(leader, closePrep);
      }
    };
    const edit = won ? null : h('button', { class: 'btn' }, 'Modifier l’équipe');
    if (edit) edit.onclick = close;
    const booster = reward.booster ? boosterById(reward.booster) : null;
    scrim.append(
      h(
        'div',
        { class: 'result-card' },
        won ? h('div', { class: 'res-badge', style: `--type:${TYPE_INFO[leader.type].color}` }, badgeLetter(leader)) : null,
        h('span', { class: 'res-title' }, won ? 'Victoire !' : 'Défaite…'),
        h(
          'span',
          { class: 'res-body' },
          won
            ? reward.badge
              ? `Tu as battu ${leader.name} et remporté le ${leader.badge}.`
              : `Tu as encore battu ${leader.name}. Revanche payée moitié prix.`
            : `${leader.name} remporte le combat. Son équipe craint ${weak.join(' et ') || '—'} : mise sur ces types et leurs Énergies.`,
        ),
        won
          ? h(
              'div',
              { class: 'pills' },
              h('span', { class: 'reward-pill gold' }, `+${credits(reward.credits)}`),
              reward.badge ? h('span', { class: 'reward-pill' }, leader.badge) : null,
              booster ? h('span', { class: 'reward-pill green' }, `Booster ${booster.name}`) : null,
            )
          : null,
        h('div', { class: 'col-btns' }, primary, edit),
      ),
    );
    layer.append(scrim);
    if (won && LEADERS.indexOf(leader) === LEADERS.length - 1 && reward.badge) toast('Les 8 badges de Kanto sont à toi !');
  };

  render();
}
