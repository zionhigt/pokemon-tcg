# Pokémon TCG — Booster Shop

Jeu solo d'ouverture de boosters Pokémon, en **TypeScript + Vite**, installable en **PWA**.

- **Boutique** : achète des boosters (5 extensions, prix et chances de rare différents) et revends tes cartes :
  en masse (doublons, par rareté, toute la collection) ou à l'unité, toujours avec confirmation.
- **Ouverture** : déchire le booster, révèle les cartes une à une (effet holo, aura quand une ultra/secrète arrive).
- **Cartes en français ou en anglais** : réglage FR / EN en bas de page (noms, images, rareté, extension).
- **Galerie** : collection filtrable (extension, rareté, doublons, favoris), progression par set, revente à l'unité.

Tu commences avec **500 ₽**. Chaque booster rapporte **toujours plus que son prix** à la revente :
le pire tirage possible (6 communes, 3 peu communes, 1 rare) vaut 108 % du prix du booster.
Pour en profiter il faut revendre aussi ses exemplaires uniques : décoche « Garder 1 exemplaire »
dans la boutique. Les favoris (★) ne partent jamais dans une vente en masse.

## Données

Les cartes viennent de l'[API Pokémon TCG](https://pokemontcg.io) (gratuite, sans clé, CORS ouvert) :
une requête par extension renvoie toutes les cartes avec rareté officielle, images HD et cote du marché.
Les versions françaises (noms + scans) viennent de [TCGdex](https://tcgdex.dev) : une requête par extension,
associée aux cartes pokemontcg.io par leur numéro (`tcgdexId` dans `src/data/boosters.ts`).
La rareté et les cotes restent celles de pokemontcg.io ; si une image française manque, l'anglaise est affichée.
La rareté officielle est convertie en 6 paliers (`src/rarity.ts`) et la cote réelle donne un bonus de revente.
### Cache d'assets (non versionné)

`npm run assets` télécharge dans `public/tcg-cache/` (ignoré par git) les données des sets, les logos,
les mascottes et les images de cartes. Le script est **incrémental** : il ne requête que les fichiers absents,
donc chaque clone du projet construit son cache une fois puis ne télécharge que ce qui manque
(nouveau booster ajouté dans `src/data/boosters.ts`, échec réseau précédent…).
Il tourne automatiquement avant `npm run dev` et `npm run build` ; un échec réseau n'est jamais bloquant.

```bash
npm run assets            # sets EN + FR + images de cartes (~160 Mo EN, ~20 Mo FR)
npm run assets:hires      # + images haute définition (EN ~700 Ko, FR ~100 Ko / carte)
node scripts/fetch-assets.mjs --refresh   # re-télécharge les données des sets (cotes)
```

Le client lit `tcg-cache/manifest.json` et sert la copie locale de chaque asset présent, sinon l'URL distante.
Les images ne sont pas précachées par le service worker (trop lourdes) mais mises en cache à la première vue ;
le jeu tourne hors-ligne après la première ouverture. La release GitHub réutilise le cache entre deux builds (`actions/cache`).

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
scripts/
  fetch-assets.mjs   cache local incrémental des assets
src/
  api.ts             client pokemontcg.io + cache
  assets.ts          résolution des assets locaux (manifeste)
  cardLang.ts        langue des cartes (FR via TCGdex / EN)
  sell.ts            confirmation des ventes
  data/boosters.ts   définition des boosters (set, prix, couleurs, chances)
  gacha.ts           tirage du contenu d'un booster
  rarity.ts          paliers de rareté et valeurs de revente
  state.ts           crédits, inventaire, collection (sauvegarde locale)
  components/        emballage de booster, carte holo
  pages/             boutique, ouverture, galerie
```
