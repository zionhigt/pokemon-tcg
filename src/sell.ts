import { cardName } from './cardLang';
import { confirmSheet, credits, plural, toast } from './dom';
import { sell, type OwnedCard, type SalePlan } from './state';

function names(list: OwnedCard[], max = 3): string {
  const shown = list.slice(0, max).map((o) => cardName(o.card));
  return list.length > max ? `${shown.join(', ')}…` : shown.join(', ');
}

/** Exécute la vente et l'annonce ; `undoable` propose « Annuler » dans le toast. */
export function doSale(plan: SalePlan, undoable = false): void {
  const r = sell(plan.sales);
  toast(
    `+${credits(r.gain)} · ${plural(r.count, 'carte')} vendue${r.count > 1 ? 's' : ''}`,
    undoable ? { label: 'Annuler', fn: r.undo } : undefined,
  );
}

/** Demande confirmation puis exécute la vente. Renvoie true si la vente a eu lieu. */
export async function confirmSale(plan: SalePlan, title = 'Confirmer la vente', body?: string): Promise<boolean> {
  if (!plan.count) {
    toast('Rien à vendre');
    return false;
  }
  const warn = [
    plan.lost.length ? `Tu n’auras plus aucun exemplaire de ${names(plan.lost)}.` : '',
    plan.favorites.length ? `Favori${plan.favorites.length > 1 ? 's' : ''} inclus : ${names(plan.favorites)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const ok = await confirmSheet({
    title,
    body: body ?? `${plural(plan.count, 'carte')}${plan.sales.length > 1 ? ` (${plan.sales.length} différentes)` : ''}.`,
    amount: `+${credits(plan.gain)}`,
    warn,
    ok: `Vendre · ${credits(plan.gain)}`,
  });
  if (ok) doSale(plan);
  return ok;
}
