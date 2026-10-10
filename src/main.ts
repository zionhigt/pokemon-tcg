import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { BOOSTERS } from './data/boosters';
import { credits, h, toast } from './dom';
import { galleryPage } from './pages/gallery';
import { openPage } from './pages/open';
import { shopPage } from './pages/shop';
import { currentRoute, navigate } from './router';
import { getState, rescueIfBroke, resetGame, subscribe } from './state';

const VERSION = __APP_VERSION__;

const PAGES: Record<string, { label: string; icon: string; render: (root: HTMLElement, param?: string) => () => void }> = {
  boutique: { label: 'Boutique', icon: '🛒', render: shopPage },
  ouverture: { label: 'Ouverture', icon: '✨', render: openPage },
  galerie: { label: 'Galerie', icon: '🗂️', render: galleryPage },
};

const app = document.querySelector<HTMLDivElement>('#app')!;
const wallet = h('div', { class: 'wallet', title: 'Crédits' });
const packBadge = h('span', { class: 'nav-badge' });
const main = h('main', { id: 'main' });
const nav = h('nav', { class: 'tabs', 'aria-label': 'Navigation principale' });

for (const [id, p] of Object.entries(PAGES)) {
  const a = h('a', { href: `#/${id}`, 'data-page': id }, h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, p.icon), h('span', {}, p.label));
  if (id === 'ouverture') a.append(packBadge);
  nav.append(a);
}

const reset = h('button', { class: 'link' }, 'Réinitialiser la partie');
reset.onclick = () => {
  if (confirm('Effacer ta collection et repartir avec les crédits de départ ?')) {
    resetGame();
    toast('Nouvelle partie !', 'info');
    navigate('boutique');
  }
};

app.append(
  h(
    'header',
    { class: 'topbar' },
    h('a', { class: 'logo', href: '#/boutique' }, h('span', { class: 'ball', 'aria-hidden': 'true' }), 'Booster', h('b', {}, 'Shop')),
    wallet,
  ),
  main,
  nav,
  h(
    'footer',
    { class: 'footer' },
    h('span', {}, `v${VERSION}`),
    h('span', {}, 'Données : ', h('a', { href: 'https://pokemontcg.io', target: '_blank', rel: 'noopener' }, 'Pokémon TCG API')),
    reset,
  ),
);

let shownCredits = getState().credits;
function renderWallet(): void {
  const s = getState();
  const target = s.credits;
  const from = shownCredits;
  shownCredits = target;
  if (from !== target) {
    wallet.classList.remove('up', 'down');
    void wallet.offsetWidth;
    wallet.classList.add(target > from ? 'up' : 'down');
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 500);
      wallet.textContent = credits(Math.round(from + (target - from) * t));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } else {
    wallet.textContent = credits(target);
  }
  const packs = Object.values(s.packs).reduce((a, b) => a + b, 0);
  packBadge.textContent = packs ? String(packs) : '';
  packBadge.hidden = !packs;
}

let cleanup: (() => void) | null = null;
function route(): void {
  const { page, param } = currentRoute();
  const def = PAGES[page] ?? PAGES.boutique;
  cleanup?.();
  main.replaceChildren();
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.page === (PAGES[page] ? page : 'boutique')));
  cleanup = def.render(main, param);
  window.scrollTo({ top: 0 });
}

const minPrice = Math.min(...BOOSTERS.map((b) => b.price));
subscribe(() => {
  renderWallet();
  const grant = rescueIfBroke(minPrice);
  if (grant) toast(`Le Professeur Chen t'offre ${credits(grant)} pour continuer !`, 'good');
});
window.addEventListener('hashchange', route);
renderWallet();
route();

// Mise à jour de la PWA : on propose de recharger quand une nouvelle release est disponible.
const updateSW = registerSW({
  onNeedRefresh() {
    const btn = h('button', { class: 'btn primary small' }, 'Mettre à jour');
    btn.onclick = () => void updateSW(true);
    document.body.append(h('div', { class: 'update-banner' }, h('span', {}, 'Une nouvelle version est disponible.'), btn));
  },
  onOfflineReady() {
    toast('Prêt à jouer hors-ligne', 'info');
  },
});
