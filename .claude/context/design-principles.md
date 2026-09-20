# Principes de design eBio — grille de revue

Document de référence de la revue de design (`/design-review` et l'agent
`design-review`). Il sert aussi de rappel quand on écrit du front.

Si une règle ici contredit le code, c'est le document qui fait foi : on corrige
le code ou on met le document à jour, jamais les deux en désaccord.

---

## 1. Identité de marque

- Le nom s'écrit **eBio** — jamais Ebio, EBIO ni e-bio.
- Accroche : « Trouvez des produits bio près de chez vous ».
- Logo : « e » en bleu (#335289), « Bio » en vert (#1e7a37), épingle feuille.

### Vocabulaire (français, obligatoire dans l'UI)

| On dit | On ne dit pas |
|---|---|
| Fournisseur | vendeur, marchand |
| Acheteur | client, utilisateur |
| Mise en relation | messagerie |
| Commander | acheter |

Les accents sont obligatoires partout, y compris sur les capitales (« Écran »,
« À propos »). Un texte d'interface sans accents est un défaut, pas un détail.

## 2. Couleurs

Cinq familles. Dans le code, on utilise les tokens (`--color-green-400`,
`colors.green[400]`), jamais l'hexadécimal en dur.

- **Vert** (primaire, CTA, navigation) — 50 `#e8f5ec` · 100 `#c5e6cf` · 200 `#7cc896` · 400 `#2a9d4e` · 600 `#1e7a37` · 800 `#134e23` · 900 `#0a2912`
- **Terre** (secondaire, badges, notes) — 50 `#FAF5ED` · 400 `#C07B2A` · 600 `#8A5518` · 800 `#543310`
- **Bleu** (information, carte, liens) — 50 `#eaeff6` · 100 `#c4d1e6` · 200 `#8aa4cc` · 400 `#4a6da6` · 600 `#335289` · 800 `#213559`
- **Corail** (erreur uniquement) — 400 `#F06040` · 600 `#B83820`
- **Neutre chaud** (texte, fonds) — 0 `#FFFFFF` · 50 `#F7F6F2` · 100 `#EDECEA` · 200 `#D5D3CE` · 400 `#9B9890` · 600 `#5A5852` · 800 `#2A2924` · 900 `#141410`

Règles :

- CTA principal : vert 400. Texte sur fond clair : vert 600.
- **Vert 400 n'est jamais du texte sur blanc** — contraste insuffisant.
- Corail est réservé aux états d'erreur. Un corail décoratif est un défaut.
- Contraste minimum WCAG AA : 4.5:1 pour le texte, 3:1 pour les gros titres et
  les bordures d'éléments interactifs.

## 3. Typographie

- **DM Serif Display** : titres héros et nom de marque, rien d'autre.
- **Plus Jakarta Sans** (400/500/600/700) : interface et corps de texte.
  Jamais Inter, Roboto ni la police système.
- **JetBrains Mono** : tous les montants, au format `X XXX FCFA / unité`.
- Graisse 300 (light) interdite.
- Sur-titre : capitales, interlettrage +0.10em.

## 4. Composants et espacements

- Boutons : 5 variantes (Primaire / Secondaire / Terre / Fantôme / Danger),
  hauteur 44 px en mobile, 40 px en web, rayon 10 px.
- Badges : pilule (rayon 99 px), 22 px de haut — Validé eBio (vert),
  Top Vendeur (terre), Certifié Bio (bleu), Nouveau (corail).
- Carte produit : image en 4:3 d'abord, rayon 12 px,
  ombre `0 2px 8px rgba(0,0,0,0.06)`.
- Barre de recherche : 48 px mobile / 44 px web, anneau de focus vert 400.
- Espacements : 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 px. Une valeur hors de
  cette échelle est un défaut à signaler.
- Rayons : xs 4 · sm 8 · md 10 · lg 12 · xl 16 · pilule 99.
- Cible tactile mobile : 44 × 44 px minimum, y compris pour les icônes seules.

## 5. Mode sombre

- Pas de noir pur : fond de page neutre 900, surfaces neutre 800.
- Les couleurs de CTA (vert 400, terre 400) ne changent pas.
- Le texte passe des stops 600-800 aux stops 100-200.
- Les fonds de badge s'inversent : vert 50 → vert 900.

## 6. Grille de revue

À parcourir dans cet ordre — l'expérience réelle d'abord, le code ensuite.

### Parcours et interaction
- Le parcours principal va jusqu'au bout sans impasse.
- États survol, actif, désactivé, chargement : tous présents et distincts.
- Toute action destructrice demande confirmation.
- Le retour visuel arrive en moins de 100 ms après un clic.

### Responsive
- 1440 px (bureau), 768 px (tablette), 375 px (mobile).
- Aucun défilement horizontal, aucun chevauchement, aucun texte tronqué.
- Le contenu se réorganise, il ne se contente pas de rétrécir.

### Finition visuelle
- Alignements et espacements cohérents avec l'échelle du §4.
- Hiérarchie typographique lisible : on doit comprendre la page en la survolant.
- Images nettes, jamais déformées, toujours un ratio explicite.

### Accessibilité (WCAG 2.1 AA)
- Navigation clavier complète, ordre de tabulation logique.
- Focus visible sur **tout** élément interactif.
- Entrée / Espace activent les contrôles.
- HTML sémantique : `button` pour une action, `a` pour une navigation.
- Chaque champ a un label associé, chaque image un `alt` utile
  (`alt=""` si décorative).
- Contrastes vérifiés (§2).

### Robustesse
- Formulaire avec saisies invalides : messages clairs, en français.
- Contenu trop long : nom de boutique à rallonge, panier vide, liste à 200
  éléments.
- États vide, chargement et erreur dessinés, pas seulement l'état nominal.

### Santé du code
- Composant réutilisé plutôt que dupliqué.
- Tokens plutôt que valeurs magiques.
- Conventions du projet respectées (voir `CLAUDE.md` et les guidelines
  frontend de `apps/documentation`).

### Contenu et console
- Orthographe, accents, vocabulaire du §1.
- Console du navigateur sans erreur ni avertissement nouveau.

## 7. Périmètre

La revue automatisée couvre ce qui s'ouvre dans Chrome :

- `apps/landing` (site vitrine) — `http://localhost:5175`
- `apps/web-spa` (back-office et fournisseurs) — `http://localhost:5174`

`apps/mobile` est du React Native : il ne s'ouvre pas dans le navigateur. Sa
revue se fait sur captures d'écran de l'appareil, en appliquant les mêmes
principes (§1 à §5) plus les cibles tactiles de 44 px.
