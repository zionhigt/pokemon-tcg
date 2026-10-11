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
  return `${n.toLocaleString("fr-FR")}\u00a0₽`;
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let toastHost: HTMLElement | null = null;
export function toast(message: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
  toastHost ??= document.body.appendChild(h('div', { class: 'toasts', 'aria-live': 'polite' }));
  const t = h('div', { class: `toast toast-${kind}` }, message);
  toastHost.append(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3000);
}

/**
 * Boîte de confirmation (remplace window.confirm). Entrée valide, Échap annule.
 * `danger` met le focus sur « Annuler » pour éviter une validation réflexe.
 */
export function confirmDialog(opts: {
  title: string;
  body?: (Node | string | null)[];
  confirm: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const cancelBtn = h('button', { class: 'btn ghost' }, 'Annuler');
    const okBtn = h('button', { class: `btn ${opts.danger ? 'danger' : 'primary'}` }, opts.confirm);
    const box = h(
      'div',
      { class: 'modal confirm', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': opts.title },
      h('div', { class: 'modal-box confirm-box' }, h('h2', {}, opts.title), ...(opts.body ?? []), h('div', { class: 'actions' }, cancelBtn, okBtn)),
    );
    const done = (ok: boolean) => {
      document.removeEventListener('keydown', onKey, true);
      box.remove();
      resolve(ok);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Ne ferme que cette boîte, pas une modale ouverte en dessous
      e.stopImmediatePropagation();
      done(false);
    };
    cancelBtn.onclick = () => done(false);
    okBtn.onclick = () => done(true);
    box.onclick = (e) => {
      if (e.target === box) done(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.body.append(box);
    (opts.danger ? cancelBtn : okBtn).focus();
  });
}
