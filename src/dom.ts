export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | undefined> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function credits(n: number): string {
  return `${n.toLocaleString('fr-FR')} ₽`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Relance une animation CSS portée par une classe. */
export function replay(el: Element, cls: string): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

/* ---------- Calques (écrans plein écran, feuilles, confirmations) ---------- */

/** Conteneur de l'app : les calques s'y empilent pour rester dans la colonne mobile. */
export function appRoot(): HTMLElement {
  return document.querySelector<HTMLElement>('#app') ?? document.body;
}

const layers: (() => void)[] = [];

function syncLayers(): void {
  appRoot().classList.toggle('has-layer', layers.length > 0);
}

/** Ajoute un calque ; Échap ferme le plus haut. Renvoie la fonction de fermeture. */
export function pushLayer(el: HTMLElement, onClose?: () => void): () => void {
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    const i = layers.indexOf(close);
    if (i >= 0) layers.splice(i, 1);
    el.remove();
    syncLayers();
    onClose?.();
  };
  layers.push(close);
  appRoot().append(el);
  syncLayers();
  return close;
}

export function closeAllLayers(): void {
  [...layers].reverse().forEach((c) => c());
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !layers.length) return;
  e.preventDefault();
  layers[layers.length - 1]();
});

/** Feuille qui monte du bas de l'écran. `build` reçoit la fonction de fermeture. */
export function sheet(build: (close: () => void) => (Node | string | null | false)[], cls = '', onClose?: () => void): () => void {
  const panel = h('div', { class: `sheet ${cls}`, role: 'dialog', 'aria-modal': 'true' }, h('span', { class: 'sheet-handle' }));
  const scrim = h('div', { class: 'scrim' }, panel);
  const close = pushLayer(scrim, onClose);
  scrim.onclick = (e) => {
    if (e.target === scrim) close();
  };
  panel.append(...build(close).filter((n): n is Node | string => !!n));
  return close;
}

/** Confirmation de vente (ou autre) : renvoie true si l'utilisateur valide. */
export function confirmSheet(opts: { title: string; body?: string; amount?: string; warn?: string; ok: string }): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    sheet(
      (close) => {
        const cancel = h('button', { class: 'btn' }, 'Annuler');
        const ok = h('button', { class: 'btn danger grow' }, opts.ok);
        cancel.onclick = close;
        ok.onclick = () => {
          result = true;
          close();
        };
        setTimeout(() => (opts.warn ? cancel : ok).focus(), 0);
        return [
          h('span', { class: 'sheet-title' }, opts.title),
          opts.body ? h('span', { class: 'sheet-text' }, opts.body) : null,
          opts.amount ? h('span', { class: 'confirm-amount' }, opts.amount) : null,
          opts.warn ? h('div', { class: 'warn-box' }, opts.warn) : null,
          h('div', { class: 'row-btns' }, cancel, ok),
        ];
      },
      'confirm',
      // Fond, Échap ou Annuler : la promesse se résout à la fermeture
      () => resolve(result),
    );
  });
}

/* ---------- Toast ---------- */

let toastEl: HTMLElement | null = null;
let toastTimer = 0;

export function dismissToast(): void {
  clearTimeout(toastTimer);
  toastEl?.remove();
}

/** Message bref en bas de l'écran, avec une action facultative (Annuler, Ouvrir…). */
export function toast(message: string, action?: { label: string; fn: () => void }): void {
  clearTimeout(toastTimer);
  toastEl?.remove();
  const el = h('div', { class: 'toast', role: 'status' }, h('span', {}, message));
  if (action) {
    const b = h('button', {}, action.label);
    b.onclick = () => {
      el.remove();
      action.fn();
    };
    el.append(b);
  }
  appRoot().append(el);
  toastEl = el;
  toastTimer = window.setTimeout(() => el.remove(), action ? 3400 : 2200);
}

/* ---------- Pagination au glisser ---------- */

let swipedAt = 0;
/** Vrai juste après un glisser : le « clic » qui le termine ne doit pas compter. */
export function justSwiped(): boolean {
  return Date.now() - swipedAt < 300;
}

const EASE = 'transform .4s cubic-bezier(.2,.8,.2,1)';

/**
 * Glisser horizontal d'une page à l'autre. `pos(i, dx)` donne le transform du rail
 * pour la page i décalée de dx pixels ; les bords résistent.
 */
export function swiper(
  viewport: HTMLElement,
  track: HTMLElement,
  opts: { count: () => number; index: () => number; pos: (i: number, dx: number) => string; go: (i: number) => void },
): { place: () => void } {
  let start: { x: number; y: number; dx: number; moved: boolean; id: number } | null = null;
  const place = () => {
    track.style.transition = EASE;
    track.style.transform = opts.pos(opts.index(), 0);
  };
  viewport.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, y: e.clientY, dx: 0, moved: false, id: e.pointerId };
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    if (!start.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - start.y)) {
      start.moved = true;
      viewport.dispatchEvent(new CustomEvent('swipestart'));
    }
    if (!start.moved) return;
    const i = opts.index();
    const n = opts.count();
    start.dx = (i === 0 && dx > 0) || (i === n - 1 && dx < 0) ? dx * 0.3 : dx;
    track.style.transition = 'none';
    track.style.transform = opts.pos(i, start.dx);
  });
  const end = () => {
    const s = start;
    start = null;
    if (!s) return;
    const i = opts.index();
    let ni = i;
    if (s.moved) {
      swipedAt = Date.now();
      if (s.dx < -45) ni = Math.min(opts.count() - 1, i + 1);
      else if (s.dx > 45) ni = Math.max(0, i - 1);
    }
    place();
    if (ni !== i) opts.go(ni);
  };
  viewport.addEventListener('pointerup', end);
  viewport.addEventListener('pointercancel', end);
  viewport.addEventListener('pointerleave', end);
  return { place };
}

/** Points de pagination ; renvoie un élément vide s'il n'y a qu'une page. */
export function dots(count: number, index: number, go: (i: number) => void): HTMLElement {
  const el = h('div', { class: 'dots' });
  if (count <= 1) return el;
  for (let i = 0; i < count; i++) {
    const d = h('button', { class: i === index ? 'on' : '', 'aria-label': `Page ${i + 1}` });
    d.onclick = () => go(i);
    el.append(d);
  }
  return el;
}

/** Interrupteur segmenté (onglets internes, filtres). */
export function segmented<T extends string>(
  items: { key: T; label: string | Node; badge?: string; muted?: boolean }[],
  current: T,
  onPick: (k: T) => void,
  cls = '',
): HTMLElement {
  return h(
    'div',
    { class: `seg ${cls}` },
    ...items.map((it) => {
      const b = h('button', { class: `${it.key === current ? 'on' : ''} ${it.muted ? 'muted' : ''}`, 'aria-pressed': it.key === current }, it.label);
      if (it.badge) b.append(h('span', { class: 'seg-badge' }, it.badge));
      b.onclick = () => onPick(it.key);
      return b;
    }),
  );
}
