# Pokémon TCG — Booster Shop

Jeu solo d'ouverture de boosters Pokémon, en **TypeScript + Vite**, installable en **PWA**.

- **Boutique** : achète des boosters (5 extensions, prix et chances de rare différents) et revends tes cartes.
- **Ouverture** : déchire le booster, révèle les cartes une à une (effet holo, aura quand une ultra/secrète arrive).
- **Galerie** : collection filtrable (extension, rareté, doublons, favoris), progression par set, revente à l'unité.

Tu commences avec **500 ₽**. Chaque booster rapporte **toujours plus que son prix** à la revente : 
le pire tirage possible (6 communes, 3 peu communes, 1 rare) vaut 108 % du prix du booster.

## Données

Les cartes viennent de l'[API Pokémon TCG](https://pokemontcg.io) (gratuite, sans clé, CORS ouvert) :
une requête par extension renvoie toutes les cartes avec rareté officielle, images HD et cote du marché.
La rareté officielle est convertie en 6 paliers (`src/rarity.ts`) et la cote réelle donne un bonus de revente.
Les sets sont mis en cache (localStorage + service worker), les images aussi : le jeu tourne hors-ligne après la première ouverture.

## Développement

```bash
npm install
npm run dev       # serveur local
npm run build     # typecheck + build de production (dist/)
npm run preview
```

## Versions / releases GitHub

La version affichée dans l'app vient de `package.json`.

```bash
npm version minor          # ex: 0.1.0 -> 0.2.0, crée le commit + tag v0.2.0
git push --follow-tags
```

Le tag `v*` déclenche `.github/workflows/release.yml` : build, release GitHub avec le zip de `dist/`,
puis déploiement sur GitHub Pages (activer *Settings → Pages → Source : GitHub Actions*).
Les joueurs ayant installé la PWA voient un bandeau « Nouvelle version disponible ».

## Structure

```
src/
  api.ts             client pokemontcg.io + cache
  data/boosters.ts   définition des boosters (set, prix, couleurs, chances)
  gacha.ts           tirage du contenu d'un booster
  rarity.ts          paliers de rareté et valeurs de revente
  state.ts           crédits, inventaire, collection (sauvegarde locale)
  components/        emballage de booster, carte holo
  pages/             boutique, ouverture, galerie
```
