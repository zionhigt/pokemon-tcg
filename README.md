# Pokémon TCG — Booster Shop

Jeu solo d'ouverture de boosters Pokémon, en **TypeScript + Vite**, installable en **PWA**.

Interface pensée pour le téléphone : chaque écran tient dans l'écran, on pagine au glisser
et les actions restent sous le pouce (barre d'onglets ancrée en bas).

- **Boutique** : un booster par écran (5 extensions, prix et chances de rare différents), achat ×1 / ×5.
  L'onglet **Revendre** vend en masse (doublons, par rareté), toujours avec confirmation.
- **Ouverture** : les boosters scellés vivent dans l'en-tête, on les ouvre depuis n'importe quel écran.
  Glisse le long du haut pour déchirer, puis révèle les cartes une à une (effet holo, halo pour les rares) ou « Tout révéler ».
- **Collection** : sélecteur d'extension avec progression, filtres en un tap (type, favoris, doublons),
  grille 3×3 paginée ; le tri (rareté, PV, puissance, valeur, numéro) s'affiche sur la carte.
  Appui long sur une carte = sélection multiple pour vendre à l'unité ; la fiche carte se feuillette au glisser.
- **Arènes** : mode histoire, 8 champions de Kanto à battre dans l'ordre avec une équipe de 3 Pokémon (voir plus bas).
- **Partie** (touche le compteur de ₽) : statistiques, cartes en français ou en anglais, réinitialisation.

Tu commences avec **500 ₽**. Chaque booster rapporte **toujours plus que son prix** à la revente :
le pire tirage possible (6 communes, 3 peu communes, 1 rare) vaut 108 % du prix du booster.
Pour en profiter il faut revendre aussi ses exemplaires uniques : décoche « Garder 1 exemplaire »
dans l'onglet Revendre. Les favoris (♥), ton équipe d'arène et ses Énergies ne partent jamais dans une vente en masse.

## Arènes (mode histoire)

Les combats utilisent les vraies stats des cartes : PV, attaques (coût en énergies et dégâts de base),
faiblesses, résistances et coût de retraite. Les effets écrits sur les cartes ne sont pas gérés :
chaque type a à la place un bonus simple (brûlure Feu, poison Plante, paralysie Électrique, soin Eau…, voir `src/battle/types.ts`).

- Équipe de 3 Pokémon, chacun avec jusqu'à 2 cartes Énergie de base de la collection.
  Une Énergie s'active une fois par combat et multiplie par 1,5 une attaque de son type.
- Hors jeu (masqués dans l'équipe et au changement de Pokémon) : cartes Dresseur, Énergies spéciales,
  Pokémon sans attaque offensive et attaques sans dégâts.
- Chaque Pokémon actif gagne 1 énergie par tour ; une attaque coûte autant d'énergies que de symboles.
- Les équipes des champions sont tirées des vraies cartes des extensions (type du champion, PV croissants).
- Récompenses : crédits, badge et booster offert à la première victoire ; revanche à moitié prix.

Règles : `src/battle/rules.ts`, moteur et IA : `src/battle/engine.ts`, champions : `src/data/leaders.ts`.

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
  shell.ts           en-tête, barre d'onglets, animations de la coque
  dom.ts             calques, feuilles du bas, toast, pagination au glisser
  arenaData.ts       cartes de combat, équipes des champions, avantages de type
  sell.ts            confirmation des ventes
  data/boosters.ts   définition des boosters (set, prix, couleurs, chances)
  gacha.ts           tirage du contenu d'un booster
  rarity.ts          paliers de rareté et valeurs de revente
  state.ts           crédits, inventaire, collection (sauvegarde locale)
  components/        emballage de booster, carte holo
  pages/             boutique, collection, arènes ; calques ouverture, fiche carte, équipe, combat
```
