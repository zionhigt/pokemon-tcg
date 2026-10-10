import { mascotUrl, PACK_LAYOUT, type BoosterDef } from '../data/boosters';
import { setLogoUrl } from '../api';
import { h } from '../dom';

/** Emballage de booster : sachet aluminium dentelé avec logo du set et mascotte. */
export function packEl(def: BoosterDef, extraClass = ''): HTMLElement {
  const [a, b, c] = def.colors;
  const total = PACK_LAYOUT.common + PACK_LAYOUT.uncommon + PACK_LAYOUT.rare;
  const pack = h(
    'div',
    { class: `pack ${extraClass}`, style: `--pa:${a};--pb:${b};--pc:${c}` },
    h('div', { class: 'pack-crimp top' }),
    h(
      'div',
      { class: 'pack-body' },
      h('div', { class: 'pack-shine' }),
      h('div', { class: 'pack-brand' }, 'POKÉMON', h('small', {}, 'TRADING CARD GAME')),
      h('img', { class: 'pack-logo', src: setLogoUrl(def.setId), alt: def.name, loading: 'lazy', draggable: 'false' }),
      h('img', { class: 'pack-mascot', src: mascotUrl(def.mascot), alt: '', loading: 'lazy', draggable: 'false' }),
      h('div', { class: 'pack-name' }, def.name),
      h('div', { class: 'pack-count' }, `${total} cartes`),
    ),
    h('div', { class: 'pack-crimp bottom' }),
  );
  // Si le logo ne charge pas, on garde le nom en grand
  const logo = pack.querySelector<HTMLImageElement>('.pack-logo')!;
  logo.addEventListener('error', () => logo.remove());
  return pack;
}
