import './styles/index.css';
import { registerSW } from 'virtual:pwa-register';
import { loadManifest } from './assets';
import { getCardLang, loadFrench, setCardLang, type CardLang } from './cardLang';
import { BOOSTERS } from './data/boosters';
import { LEADERS } from './data/leaders';
import { appRoot, closeAllLayers, confirmSheet, credits, h, sheet, toast } from './dom';
import { arenaPage } from './pages/arena';
import { collectionPage } from './pages/collection';
import { openSealed } from './pages/open';
import { shopPage } from './pages/shop';
import { currentRoute, navigate } from './router';
import { buildShell, coinsBtn, main, renderCoins, renderSealed, sealedBtn, setActiveTab, setHead, setTabsHidden, type TabId } from './shell';
import { getState, rescueIfBroke, resetGame, subscribe } from './state';

const VERSION = __APP_VERSION__;

const PAGES: Record<TabId, { title: string; render: (root: HTMLElement, param?: string) => () => void }> = {
  boutique: { title: 'Boutique', render: shopPage },
  collection: { title: 'Collection', render: collectionPage },
  arenes: { title: 'Arènes', render: arenaPage },
};
/** Anciennes adresses (avant la refonte mobile). */
const ALIASES: Record<string, TabId> = { galerie: 'collection', ouverture: 'boutique' };

buildShell(appRoot());

function subtitleOf(tab: TabId): string {
  const s = getState();
  if (tab === 'boutique') return 'Boosters & revente';
  if (tab === 'collection') {
    const owned = Object.values(s.collection);
    const total = owned.reduce((a, o) => a + o.count, 0);
    const value = owned.reduce((a, o) => a + o.count * o.value, 0);
    return `${owned.length} uniques · ${total} cartes · ${credits(value)}`;
  }
  return `${s.arena.badges.length}/${LEADERS.length} badges · ${s.arena.wins} V · ${s.arena.losses} D`;
}

let tab: TabId = 'boutique';
function renderHead(): void {
  const s = getState();
  setHead(PAGES[tab].title, subtitleOf(tab));
  renderCoins(s.credits);
  renderSealed(Object.values(s.packs).reduce((a, b) => a + b, 0));
}

/* ---------- Réglages de la partie (derrière les crédits) ---------- */

/** Données françaises : attendues au plus 3 s, puis la page se redessine quand elles arrivent. */
function prepareLang(): Promise<void> {
  if (getCardLang() !== 'fr') return Promise.resolve();
  const ready = loadFrench(BOOSTERS);
  return Promise.race([ready, new Promise<void>((r) => setTimeout(r, 3000))]).then(() => {
    ready.then(route, () => {});
  });
}

coinsBtn.onclick = () =>
  sheet((close) => {
    const s = getState();
    const lang = h('div', { class: 'seg' });
    const drawLang = () =>
      lang.replaceChildren(
        ...(['fr', 'en'] as CardLang[]).map((l) => {
          const b = h('button', { class: getCardLang() === l ? 'on' : '' }, l === 'fr' ? 'Français' : 'English');
          b.onclick = () => {
            if (getCardLang() === l) return;
            setCardLang(l);
            drawLang();
            void prepareLang().then(route);
          };
          return b;
        }),
      );
    drawLang();
    const reset = h('button', { class: 'btn danger-soft' }, 'Réinitialiser la partie');
    reset.onclick = async () => {
      close();
      const ok = await confirmSheet({
        title: 'Recommencer de zéro ?',
        body: 'Collection, boosters scellés et badges seront effacés.',
        warn: 'Cette action est définitive.',
        ok: 'Tout effacer',
      });
      if (!ok) return;
      resetGame();
      toast('Nouvelle partie !');
      navigate('boutique');
    };
    const stat = (v: string, l: string) => h('div', {}, h('b', {}, v), h('span', {}, l));
    return [
      h('span', { class: 'sheet-title' }, 'Partie'),
      h(
        'div',
        { class: 'stats-row three' },
        stat(credits(s.credits), 'Crédits'),
        stat(String(s.stats.bought), 'Boosters achetés'),
        stat(String(s.stats.opened), 'Ouverts'),
      ),
      h('div', { class: 'setting' }, h('span', {}, 'Langue des cartes'), lang),
      reset,
      h(
        'span',
        { class: 'sheet-foot' },
        `v${VERSION} · Données : `,
        h('a', { href: 'https://pokemontcg.io', target: '_blank', rel: 'noopener' }, 'Pokémon TCG API'),
        ' · ',
        h('a', { href: 'https://tcgdex.dev', target: '_blank', rel: 'noopener' }, 'TCGdex'),
      ),
    ];
  });

sealedBtn.onclick = () => openSealed();

/* ---------- Routage ---------- */

let cleanup: (() => void) | null = null;
function route(): void {
  const { page, param } = currentRoute();
  const legacy = ALIASES[page];
  tab = legacy ?? (page in PAGES ? (page as TabId) : 'boutique');
  closeAllLayers();
  cleanup?.();
  setTabsHidden(false);
  main.replaceChildren();
  setActiveTab(tab);
  renderHead();
  cleanup = PAGES[tab].render(main, legacy ? undefined : param);
  // #/ouverture/<booster> : ouvre directement ce booster
  if (page === 'ouverture') {
    history.replaceState(null, '', '#/boutique');
    openSealed(param);
  }
}

const minPrice = Math.min(...BOOSTERS.map((b) => b.price));
subscribe(() => {
  renderHead();
  const grant = rescueIfBroke(minPrice);
  if (grant) toast(`Le Professeur Chen t'offre ${credits(grant)} pour continuer !`);
});
window.addEventListener('hashchange', route);
renderHead();
// Le manifeste (local, minuscule) indique quels assets servir depuis le cache du projet.
void loadManifest().then(prepareLang).finally(route);

// Mise à jour de la PWA : on propose de recharger quand une nouvelle release est disponible.
const updateSW = registerSW({
  onNeedRefresh() {
    const btn = h('button', { class: 'btn primary small' }, 'Mettre à jour');
    btn.onclick = () => void updateSW(true);
    appRoot().append(h('div', { class: 'update-banner' }, h('span', {}, 'Une nouvelle version est disponible.'), btn));
  },
  onOfflineReady() {
    toast('Prêt à jouer hors-ligne');
  },
});
