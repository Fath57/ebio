# Implementation Plan: Commander à la voix

**Branch**: `008-assistant-vocal` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)
**Recherche**: [research.md](./research.md)

## Résumé

Un module `assistant` côté API tient la conversation : il reçoit l'audio d'un
tour, le transcrit, le donne à un modèle **muni d'outils qui sont nos endpoints
existants**, et renvoie l'audio de la réponse avec son texte et l'état du panier.

Rien du domaine n'est réécrit. L'assistant ne sait pas ce que coûte une
livraison, ni comment s'applique une promotion : il appelle `POST /orders/preview`
comme le panier le fait déjà, et met en mots la réponse. C'est ce qui rend
l'exigence d'ancrage tenable — elle n'est pas une consigne donnée au modèle,
c'est la seule chose qu'il puisse faire.

Côté mobile, un écran et rien d'autre : `expo-audio` enregistre déjà les notes
vocales du chat.

## Ce qui se décide avant d'écrire du code

La recherche désigne une inconnue capable de tuer le projet : **la transcription
du français parlé au Bénin, dans le bruit**. Construire quoi que ce soit avant
de l'avoir mesurée serait bâtir sur une hypothèse.

La phase 0 n'est donc pas une phase de code, et elle a un droit de veto.

## Phasage

### Phase 0 — Mesurer, avant de s'engager

#### 0a. Constituer le corpus

Vérifié : la base ne contient que neuf notes vocales, qui sont des essais de
chat. Il n'existe pas de corpus, et il faut le créer.

Ces neuf-là ne seraient d'ailleurs pas utilisables : elles ont été enregistrées
pour parler à un commerçant, pas pour être envoyées à un service de
transcription tiers. Le corpus se constitue **exprès**, avec des gens qui savent
à quoi il sert.

Ce n'est pas un travail de recherche, c'est un après-midi :

- **30 enregistrements**, 5 à 15 secondes chacun ;
- **6 à 8 voix différentes** — pas seulement la nôtre : des femmes et des
  hommes, des âges différents, des accents différents. Une seule voix ne mesure
  rien ;
- chacun dit **3 ou 4 demandes de courses** comme il les dirait vraiment, sans
  lire une phrase préparée : « il me faut du gari, deux bouteilles d'huile rouge
  et un peu de piment » ;
- **la moitié dans le bruit** : dehors, au marché, avec la télévision ou un
  ventilateur. C'est la condition réelle, pas la condition confortable ;
- y glisser volontairement les pièges : **les quantités** (« deux » contre
  « douze »), les noms de produits locaux (gari, sohui, akassa), et au moins
  deux demandes qui se corrigent en cours de route — « non, plutôt trois kilos ».

Pour chaque enregistrement, noter **ce qui a été dit réellement** : sans cette
référence écrite, on ne peut rien scorer.

#### 0b. Comparer les oreilles

Passer le corpus à travers la reconnaissance **native Android** (gratuite, à
tester sur le téléphone), Whisper, et un service de flux.

Comparer sur ce qui compte, pas sur le taux de mots : **les noms de produits et
les quantités sont-ils justes ?** « Deux kilos » entendu « douze kilos » est une
erreur qui coûte de l'argent ; une virgule manquée n'en est pas une.

Mesurer aussi la latence d'un aller-retour complet depuis Cotonou.

**Critère de sortie** : si le gratuit tient, la pile économique est validée et le
projet est facile. Sinon on sait ce qu'il faut payer. Si aucune option ne tient
sur les quantités, **le projet s'arrête ici** et on rend la parole à une autre
forme — une note vocale envoyée à la boutique, par exemple.

### Phase 1 — Le socle serveur, sans voix

Un module `assistant` qui prend du **texte** et rend du **texte**, avec ses
outils. Aucune transcription, aucune synthèse : on éprouve la conversation
elle-même, qui est le vrai sujet.

- `POST /assistant/turn` — un tour, en texte, avec l'identifiant de session.
- Les outils exposés au modèle :
  - `chercher_produits(termes, contraintes)` → recherche existante ;
  - `voir_panier()` / `ajouter_au_panier(produit, quantité)` / `retirer_du_panier(ligne)` ;
  - `estimer_commande()` → `POST /orders/preview`, seule source des totaux ;
  - `dernieres_commandes()` → pour le « comme la dernière fois ».
- **Aucun outil de paiement.** L'absence est le garde-fou : ce qui n'existe pas
  ne peut pas être appelé par erreur.
- Le contexte de la conversation vit côté serveur, rattaché à l'acheteur.

Testable en entier sans micro, donc testable automatiquement — c'est ce qui
permettra de vérifier le ton et l'ancrage à chaque changement d'invite.

### Phase 2 — L'oreille et la voix

Transcription et synthèse ajoutées autour du socle, derrière une interface :
`Transcriber` et `Speaker`, une implémentation par fournisseur. Le choix sort de
la phase 0 et reste remplaçable — c'est le poste dont les prix bougeront le plus.

- `POST /assistant/turn` accepte désormais de l'audio et rend de l'audio.
- Le texte est renvoyé **en plus** de l'audio, toujours : il s'affiche pendant
  qu'il se dit.

### Phase 3 — L'écran

Un écran dans l'app cliente : un bouton pour parler, la conversation qui
s'affiche au fil de l'eau, et le panier visible en dessous qui se remplit.

- L'écran reste utilisable à la main pendant qu'on parle.
- La fin du parcours bascule sur l'écran de paiement existant — celui-là même
  qu'on vient d'unifier.

### Phase 4 — Ouvrir, en mesurant

Ouverture à un groupe restreint, avec un suivi du **coût par commande aboutie**
et du **taux d'abandon** par tour. C'est ce qui dira si l'assistant devient un
chemin normal ou reste une curiosité.

## Modèle de données

Deux tables, pas plus.

**`assistant_sessions`** — une conversation : l'acheteur, l'état du dialogue, sa
date. Purgée après quelques jours : ce n'est pas un historique, c'est un
contexte.

**`assistant_turns`** — un tour : ce qui a été transcrit, ce qui a été répondu,
les outils appelés, les jetons consommés et le coût. Sans cette dernière colonne,
la phase 4 est aveugle et la décision d'ouvrir se prendrait au doigt mouillé.

L'audio n'est **pas** conservé passé la transcription. C'est la voix de
quelqu'un ; on n'en a plus besoin une fois le texte obtenu.

## Ce qui garde l'assistant honnête

- Les prix et totaux ne viennent que d'`estimer_commande()`. Un test vérifie
  qu'aucun montant prononcé n'est absent de la dernière réponse d'outil.
- Les produits nommés proviennent d'un résultat de recherche. Même contrôle.
- Aucun outil ne touche au paiement.
- Chaque tour journalise ses appels d'outils : un ancrage qu'on ne peut pas
  relire n'est pas un ancrage.

## Ce qui n'est pas dans ce plan

- Le flux continu parole-à-parole. La spec ne dépend pas de ce choix ; seule la
  fluidité changerait.
- Les langues autres que le français.
- L'assistant côté boutique ou livreur.

## Risque principal, et ce qu'on fait s'il se réalise

Le ton. Un assistant exact mais qui parle comme un automate est une
fonctionnalité ratée, pas une fonctionnalité dégradée. La phase 1 étant
entièrement textuelle, le ton se relit et se teste **avant** d'avoir dépensé un
centime en synthèse vocale — et la conversation de référence de la spec sert de
critère.
