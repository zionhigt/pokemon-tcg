import type { Card } from '../api';
import { advantage, energyCard, full, maxDamage, unlocked, weakTypes } from '../arenaData';
import { basicEnergyType, boostApplies, ENERGY_BOOST, isPlayablePokemon, MAX_ENERGIES, TEAM_SIZE } from '../battle/rules';
import { mainType, TYPE_INFO, type EnergyType } from '../battle/types';
import { cardImage, cardName } from '../cardLang';
import { cardEl } from '../components/card';
import { LEADERS, type Leader } from '../data/leaders';
import { dots, h, justSwiped, pushLayer, segmented, sheet, swiper, toast } from '../dom';
import { freeCopies, getState, setSlotEnergies, setTeam, setTeamSlot, subscribe, type TeamSlot } from '../state';
import { typeChip } from './arena';
import { startBattle } from './battle';

type PickSort = 'adv' | 'hp' | 'pow';
const PER_PAGE = 8;

/** Une Énergie sert si au moins une attaque du Pokémon peut en profiter. */
function energyHelps(e: EnergyType, card: Card): boolean {
  return (card.attacks ?? []).some((a) => a.damage > 0 && boostApplies(e, a, card));
}

/** Pastille ronde montrant une carte Énergie (image recadrée) ou sa couleur. */
export function energyToken(t: EnergyType, cls = ''): HTMLElement {
  const c = energyCard(t);
  return h(
    'span',
    { class: `en-token ${cls}`, style: `--type:${TYPE_INFO[t].color}`, title: `Énergie ${TYPE_INFO[t].label}` },
    c ? h('img', { src: cardImage(c).src, alt: '', loading: 'lazy' }) : null,
  );
}

/** Préparation de l'équipe face à un champion. */
export function openPrep(leader: Leader): void {
  const ui = { slot: Math.min(getState().team.length, TEAM_SIZE - 1), sort: 'adv' as PickSort, page: 0 };
  const back = h('button', { class: 'round-btn', 'aria-label': 'Retour' }, '‹');
  const body = h('div', { class: 'prep-body' });
  const layer = h(
    'div',
    { class: 'layer prep', style: `--type:${TYPE_INFO[leader.type].color}` },
    h(
      'div',
      { class: 'prep-head' },
      back,
      h('div', { class: 'col grow min0' }, h('span', { class: 'prep-title' }, `Équipe vs ${leader.name}`), h('span', { class: 'mono muted small' }, `${TEAM_SIZE} Pokémon · ${MAX_ENERGIES} Énergies max chacun`)),
      typeChip(leader.type),
    ),
    body,
  );
  let unsub = () => {};
  const close = pushLayer(layer, () => unsub());
  back.onclick = close;

  const weak = weakTypes(leader);
  const rail = h('div', { class: 'pages-rail' });
  const viewport = h('div', { class: 'pages pick-pages' }, rail);
  let nPages = 1;
  const sw = swiper(viewport, rail, {
    count: () => nPages,
    index: () => ui.page,
    pos: (i, dx) => `translateX(calc(${-i * 100}% + ${dx}px))`,
    go: (i) => {
      ui.page = i;
      draw();
    },
  });

  const draw = () => {
    const s = getState();
    const team = s.team;
    ui.slot = Math.min(ui.slot, team.length, TEAM_SIZE - 1);

    const tip = h(
      'div',
      { class: 'tip' },
      'Son équipe craint ',
      h('b', {}, weak.map((w) => TYPE_INFO[w]?.label ?? w).join(' et ') || 'rien de particulier'),
      `. Une Énergie du type de ton Pokémon multiplie une attaque par ${ENERGY_BOOST}, une fois par combat.`,
    );

    const mismatch: string[] = [];
    const slots = h(
      'div',
      { class: 'slots' },
      ...[0, 1, 2].map((i) => {
        const slot: TeamSlot | undefined = team[i];
        const card = slot ? full(slot.cardId) : undefined;
        const sel = ui.slot === i;
        const face = h('div', { class: `slot-face ${sel ? 'sel' : ''}` });
        if (card) face.append(cardEl(card));
        else face.append(h('div', { class: 'slot-empty' }, h('span', {}, '+'), h('small', {}, `Place ${i + 1}`)));
        face.onclick = () => {
          // Les places se remplissent dans l'ordre
          ui.slot = Math.min(i, team.length);
          draw();
        };
        if (card && sel) {
          const rm = h('button', { class: 'slot-rm', 'aria-label': 'Retirer' }, '×');
          rm.onclick = (e) => {
            e.stopPropagation();
            setTeamSlot(i, null);
          };
          face.append(rm);
        }
        const energies = (slot?.energies ?? []).map((id) => full(id)).map((c) => (c ? basicEnergyType(c) : null));
        for (const t of energies) if (t && card && !energyHelps(t, card)) mismatch.push(`Énergie ${TYPE_INFO[t].label} sur ${cardName(card)}`);
        const socks = h(
          'div',
          { class: 'socks' },
          ...Array.from({ length: MAX_ENERGIES }, (_, k) => {
            const t = energies[k];
            const open = !!card && k <= energies.length;
            const b = h(
              'button',
              { class: `sock ${t ? (card && energyHelps(t, card) ? 'ok' : 'bad') : 'empty'} ${open ? '' : 'faded'}`, 'aria-label': t ? `Énergie ${TYPE_INFO[t].label}` : 'Ajouter une Énergie' },
              t ? energyToken(t) : '+',
            );
            b.onclick = () => open && card && energySheet(i, Math.min(k, energies.length), card);
            return b;
          }),
        );
        return h(
          'div',
          { class: 'slot' },
          face,
          h('span', { class: 'mono muted small' }, card ? `PV ${card.hp} · ${maxDamage(card)}` : '—'),
          socks,
        );
      }),
    );

    // Choix du Pokémon pour la place sélectionnée
    const sorters: Record<PickSort, (a: Card, b: Card) => number> = {
      adv: (a, b) => advantage(b, leader) - advantage(a, leader) || maxDamage(b) - maxDamage(a) || b.hp! - a.hp!,
      hp: (a, b) => b.hp! - a.hp! || maxDamage(b) - maxDamage(a),
      pow: (a, b) => maxDamage(b) - maxDamage(a) || b.hp! - a.hp!,
    };
    const elig = Object.keys(s.collection)
      .map(full)
      .filter((c): c is Card => !!c && isPlayablePokemon(c))
      .sort(sorters[ui.sort]);
    nPages = Math.max(1, Math.ceil(elig.length / PER_PAGE));
    ui.page = Math.min(ui.page, nPages - 1);
    const current = team[ui.slot] ? full(team[ui.slot].cardId) : undefined;
    const pages = Array.from({ length: nPages }, (_, p) =>
      h(
        'div',
        { class: 'pick-page' },
        ...(Math.abs(p - ui.page) <= 1 ? elig.slice(p * PER_PAGE, (p + 1) * PER_PAGE) : []).map((c) => {
          const inTeam = team.findIndex((t) => t.cardId === c.id);
          const adv = advantage(c, leader);
          const tag = inTeam >= 0 ? `Place ${inTeam + 1}` : adv >= 2 ? 'Fort' : adv < 0 ? 'Fragile' : '';
          const b = h(
            'button',
            { class: 'pick-cell', 'aria-label': cardName(c) },
            h('div', { class: 'grow fit-wrap' }, h('div', { class: 'fit-card' }, cardEl(c, { dim: inTeam >= 0 && inTeam !== ui.slot, tag, tagBg: inTeam >= 0 ? '#ffcb05' : adv >= 2 ? '#43d18d' : '#ff8a65' }))),
            h('span', { class: 'mono small' }, ui.sort === 'hp' ? `${c.hp} PV` : ui.sort === 'pow' ? `${maxDamage(c)} dég.` : `${c.hp} PV · ${maxDamage(c)}`),
          );
          b.onclick = () => {
            if (justSwiped()) return;
            const slot = ui.slot;
            setTeamSlot(slot, c.id);
            const t = getState().team;
            const nx = t.length < TEAM_SIZE ? t.length : slot;
            ui.slot = nx;
            draw();
          };
          return b;
        }),
      ),
    );
    rail.replaceChildren(...pages);
    sw.place();

    const ready = team.length >= TEAM_SIZE;
    const locked = !unlocked(LEADERS.indexOf(leader));
    const auto = h('button', { class: 'btn big' }, 'Auto');
    auto.onclick = autoTeam;
    const fight = h(
      'button',
      { class: `btn big grow ${ready && !locked ? 'primary' : 'off'}` },
      locked ? 'Arène verrouillée' : ready ? 'Combattre' : `Il manque ${TEAM_SIZE - team.length} Pokémon`,
    );
    fight.onclick = () => ready && !locked && startBattle(leader, close);

    body.replaceChildren(
      tip,
      slots,
      mismatch.length ? h('span', { class: 'mismatch' }, `Sans effet : ${mismatch.join(', ')} (type différent).`) : '',
      h(
        'div',
        { class: 'pick-head' },
        h('span', { class: 'grow min0 pick-title' }, current ? `Remplacer ${cardName(current)}` : `Place ${ui.slot + 1} — choisis un Pokémon`),
        segmented(
          [
            { key: 'adv', label: 'Avantage' },
            { key: 'hp', label: 'PV' },
            { key: 'pow', label: 'Puissance' },
          ],
          ui.sort,
          (k) => {
            ui.sort = k;
            ui.page = 0;
            draw();
          },
          'seg-sm',
        ),
      ),
      elig.length ? viewport : h('p', { class: 'empty grow' }, 'Aucun Pokémon jouable dans ta collection : ouvre des boosters !'),
      dots(nPages, ui.page, (i) => {
        ui.page = i;
        draw();
      }),
      h('div', { class: 'row-btns' }, auto, fight),
    );
  };

  /** Équipe automatique : avantage de type, puis Énergies assorties. */
  const autoTeam = () => {
    const s = getState();
    const best = Object.keys(s.collection)
      .map(full)
      .filter((c): c is Card => !!c && isPlayablePokemon(c))
      .sort((a, b) => advantage(b, leader) - advantage(a, leader) || maxDamage(b) - maxDamage(a) || b.hp! - a.hp!)
      .slice(0, TEAM_SIZE);
    const used = new Map<string, number>();
    const energyIds = Object.values(s.collection)
      .map((o) => full(o.card.id))
      .filter((c): c is Card => !!c && !!basicEnergyType(c));
    const team: TeamSlot[] = best.map((c) => {
      const t = mainType(c.types);
      const energies: string[] = [];
      for (const e of energyIds) {
        if (energies.length >= MAX_ENERGIES) break;
        if (!energyHelps(basicEnergyType(e)!, c) || basicEnergyType(e) !== t) continue;
        while (energies.length < MAX_ENERGIES && (s.collection[e.id]?.count ?? 0) - (used.get(e.id) ?? 0) > 0) {
          energies.push(e.id);
          used.set(e.id, (used.get(e.id) ?? 0) + 1);
        }
      }
      return { cardId: c.id, energies };
    });
    setTeam(team);
    ui.slot = 0;
    toast('Équipe auto : avantage de type + énergies assorties');
  };

  /** Feuille de choix d'une Énergie pour une place. */
  const energySheet = (slot: number, sock: number, card: Card) =>
    sheet((close) => {
      const s = getState();
      const cur = s.team[slot]?.energies[sock];
      const curType = cur ? basicEnergyType(full(cur)!) : null;
      const own = mainType(card.types);
      const byType = new Map<EnergyType, { id: string; free: number }>();
      for (const o of Object.values(s.collection)) {
        const c = full(o.card.id);
        const t = c ? basicEnergyType(c) : null;
        if (!t) continue;
        const free = freeCopies(o.card.id, { slot, energy: sock });
        const prev = byType.get(t);
        byType.set(t, { id: prev && prev.free > 0 ? prev.id : o.card.id, free: (prev?.free ?? 0) + Math.max(0, free) });
      }
      const set = (id: string | null) => {
        const list = [...(s.team[slot]?.energies ?? [])];
        if (id) list[sock] = id;
        else list.splice(sock, 1);
        setSlotEnergies(slot, list.filter(Boolean));
        close();
      };
      const opts = [...byType].sort(([a], [b]) => Number(energyHelps(b, card)) - Number(energyHelps(a, card)) || Number(b === own) - Number(a === own));
      const remove = cur ? h('button', { class: 'btn big danger-soft' }, 'Retirer cette Énergie') : null;
      if (remove) remove.onclick = () => set(null);
      return [
        h('span', { class: 'sheet-title' }, `Énergie pour ${cardName(card)}`),
        h(
          'span',
          { class: 'sheet-text' },
          own === 'Colorless'
            ? `${cardName(card)} est Incolore : seules les Énergies du coût de ses attaques le boostent.`
            : `Une Énergie ${TYPE_INFO[own].label} multiplie une attaque de ${cardName(card)} par ${ENERGY_BOOST}, une fois par combat.` +
                ([...byType].some(([t, v]) => t === own && v.free > 0) ? '' : ' Tu n’en as pas : on en trouve dans les boosters.'),
        ),
        opts.length
          ? h(
              'div',
              { class: 'en-grid' },
              ...opts.map(([t, v]) => {
                const c = full(v.id)!;
                const b = h(
                  'button',
                  { class: `en-opt ${curType === t ? 'on' : ''}` },
                  h('div', { class: 'en-card' }, cardEl(c, { dim: v.free <= 0, tag: energyHelps(t, card) ? 'Booste' : '' })),
                  h('span', { class: `mono small ${v.free > 0 ? '' : 'dim'}` }, v.free > 0 ? `${v.free} dispo` : 'aucune'),
                );
                b.onclick = () => v.free > 0 && set(v.id);
                return b;
              }),
            )
          : h('p', { class: 'empty' }, 'Aucune carte Énergie de base. On en trouve dans les boosters (Set de Base notamment).'),
        remove,
      ];
    });

  draw();
  unsub = subscribe(draw);
}
