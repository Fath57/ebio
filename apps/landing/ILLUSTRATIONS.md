# Illustrations de la landing eBio

Six visuels générés avec gpt-image-2 (OpenAI, qualité medium, 1536x1024),
convertis en WebP. Pour en regénérer un : reprendre le prompt ci-dessous,
déposer le fichier sous le nom exact dans `public/illustrations/` (WebP,
qualité ~84), le manifeste est `app/components/illustrations.ts`.

## Style commun (à coller en tête de chaque prompt)

> Illustration flat design moderne pour une landing page, sans texte dans
> l'image, sans contours noirs, personnages ouest-africains (Bénin) expressifs,
> vêtements aux motifs wax, fond crème uni #F7F6F2. Palette imposée : verts
> #2a9d4e et #1e7a37 dominants, accents terre #C07B2A, touches bleu #335289,
> ombres douces subtiles. Style cohérent type illustration vectorielle
> éditoriale (référence : popote.ai), cadrage 4:3.

Garder les **mêmes personnages récurrents** d'une image à l'autre : une
maraîchère (tablier vert, foulard) et une acheteuse (robe wax bleue).

## 0. `etape-chercher.webp` — hero

(voir prompt 1 : la scène de rue sert d'illustration du hero)

## 1. `etape-carte.webp`

> Gros plan sur une main tenant un smartphone qui affiche une carte de quartier
> stylisée avec des pins de géolocalisation verts en forme de goutte et un point
> bleu de position ; interface abstraite sans texte lisible. En arrière-plan
> léger et doux, un marché de rue avec étals de légumes et parasols verts.

## 1bis. `etape-chercher.webp`

> Une jeune femme béninoise en robe wax bleue consulte son téléphone dans une
> rue de Cotonou ; autour d'elle, des étals et boutiques bio avec des pins de
> carte verts en forme de goutte flottant au-dessus, comme des repères de
> géolocalisation. Ambiance de quartier vivant, palmiers discrets.

## 2. `etape-commander.webp`

> Gros plan sur des mains tenant un téléphone : à l'écran stylisé, un panier de
> légumes bio et un bouton de paiement mobile. Autour du téléphone, tomates,
> piments, ananas et bouteille d'huile flottent en composition. Évoquer le
> Mobile Money sans logo de marque.

## 3. `etape-recuperer.webp`

> Devant sa boutique, la maraîchère au tablier vert tend un panier de légumes
> frais à l'acheteuse en robe wax bleue, toutes deux souriantes. Cageots de
> produits bio, balance de marché, plantes en arrière-plan.

## 4. `transformatrice-atelier.webp`

> Dans un petit atelier artisanal lumineux, une transformatrice béninoise au
> tablier vert et foulard wax verse du jus d'ananas frais dans des bouteilles en
> verre alignées sur un plan de travail en bois. D'un côté, les produits bruts :
> bassine d'ananas entiers, gingembre, paniers de fruits. De l'autre, les
> produits finis : bouteilles de jus, bocaux de confiture, bouteilles d'huile
> aux étiquettes vertes vierges. L'image raconte la transformation du produit de
> la ferme en produit fini prêt à vendre.

## 5. `fournisseur-etal.webp` (non utilisé, gardé en réserve)

> La maraîchère au tablier vert photographie fièrement son étal avec son
> téléphone : bocaux, huiles, légumes alignés. Au-dessus de l'étal, un grand
> pin de carte vert en forme de goutte avec une feuille, comme une enseigne.

## Spots de la bande de confiance

Trois petites illustrations sur fond transparent (générées avec `gpt-image-1`,
le seul modèle qui accepte `background: transparent`), livrées en WebP 320px
avec alpha : `spot-valide.webp`, `spot-mobile-money.webp`,
`spot-livraison.webp`.

> Petite illustration spot flat design minimale, un seul sujet centré, fond
> entièrement transparent, sans aucun texte ni symbole monétaire, palette verts
> #2a9d4e #1e7a37, ocre #C07B2A, bleu #335289.

1. Badge rond vert à coche blanche entouré de deux feuilles.
2. Smartphone avec coche de paiement dans un cercle vert, deux pièces ocre unies.
3. Moto de livraison verte, caisse de légumes à l'arrière, panier posé à côté.
