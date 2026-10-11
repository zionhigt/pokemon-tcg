import { cardName } from './cardLang';
import { confirmDialog, credits, h, toast } from './dom';
import { sell, type OwnedCard, type SalePlan } from './state';

function names(list: OwnedCard[], max = 4): string {
  const shown = list.slice(0, max).map((o) => cardName(o.card));
  return list.length > max ? `${shown.join(', ')}… (+${list.length - max})` : shown.join(', ');
}

/** Demande confirmation puis exécute la vente. Renvoie true si la vente a eu lieu. */
export async function confirmSale(plan: SalePlan, title = 'Confirmer la vente'): Promise<boolean> {
  if (!plan.count) {
    toast('Rien à vendre', 'info');
    return false;
  }
  const ok = await confirmDialog({
    title,
    body: [
      h('p', {}, `${plan.count} carte${plan.count > 1 ? 's' : ''}${plan.sales.length > 1 ? ` (${plan.sales.length} différentes)` : ''} pour`),
      h('p', { class: 'confirm-total' }, credits(plan.gain)),
      plan.lost.length
        ? h(
            'p',
            { class: 'warn' },
            plan.lost.length === 1
              ? `Tu n'auras plus aucun exemplaire de ${cardName(plan.lost[0].card)}.`
              : `${plan.lost.length} cartes quitteront ta collection : ${names(plan.lost)}.`,
          )
        : null,
      plan.favorites.length ? h('p', { class: 'warn' }, `★ Favori${plan.favorites.length > 1 ? 's' : ''} inclus : ${names(plan.favorites)}.`) : null,
    ],
    confirm: `Vendre · ${credits(plan.gain)}`,
    danger: plan.lost.length > 0 || plan.favorites.length > 0,
  });
  if (!ok) return false;
  const r = sell(plan.sales);
  toast(`${r.count} carte${r.count > 1 ? 's' : ''} vendue${r.count > 1 ? 's' : ''} pour ${credits(r.gain)}`, 'good');
  return true;
}
