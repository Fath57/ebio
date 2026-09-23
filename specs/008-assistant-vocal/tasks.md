---

description: "Découpage exécutable — commander à la voix"
---

# Tasks: Commander à la voix

**Input**: `/specs/008-assistant-vocal/` — spec.md, research.md, plan.md
**Branch**: `008-assistant-vocal`

## Format: `[ID] [P?] [Phase] Description`

- **[P]** : parallélisable — fichier distinct, aucune dépendance en attente.
- La **phase 0** est parquée : elle attend le corpus. Rien de ce qui suit n'en
  dépend, parce que tout le socle se construit et se teste en texte.

---

## Phase 0 — Mesure (parquée, en attente du corpus)

- [ ] **T001** [P0] Constituer le corpus : 30 enregistrements, 6 à 8 voix, la
      moitié dans le bruit, avec la transcription écrite de chacun.
- [ ] **T002** [P0] Écrire l'outil de scoring : entrée un dossier + ses
      références, sortie un tableau par oreille — exactitude des **quantités**,
      exactitude des **noms de produits**, latence. Le taux de mots est un
      indicateur secondaire.
- [ ] **T003** [P0] Mesurer la reconnaissance native Android sur le téléphone
      (elle ne se teste pas depuis un script).
- [ ] **T004** [P0] Comparer les oreilles payantes sur le même corpus.
- [ ] **T005** [P0] Trancher la pile, ou arrêter le projet si les quantités ne
      passent nulle part.

---

## Phase 1 — Le socle conversationnel, en texte

C'est ici que vit le vrai sujet. Tout est testable sans micro.

### Fondations

- [ ] **T010** Créer le module `assistant` (NestJS) : module, service,
      contrôleur, contrats Zod.
- [ ] **T011** Migration : `assistant_sessions` (acheteur, état, dates) et
      `assistant_turns` (transcription, réponse, outils appelés, jetons, coût).
      Écrite à la main et additive, comme les précédentes.
- [ ] **T012** [P] Entités MikroORM correspondantes.
- [ ] **T013** Configuration : clé du fournisseur de modèle, nom du modèle,
      plafond de jetons par tour. Valeurs par défaut prudentes, clé absente =
      assistant désactivé, pas d'erreur au démarrage.

### Les outils — la partie qui garde l'assistant honnête

- [ ] **T020** Définir le contrat d'un outil : nom, description, schéma
      d'arguments, exécution. Un registre, pas une liste de `if`.
- [ ] **T021** [P] `chercher_produits` — s'appuie sur la recherche existante,
      ne renvoie que ce qui est actif et en stock.
- [ ] **T022** [P] `voir_panier`, `ajouter_au_panier`, `retirer_du_panier`.
- [ ] **T023** [P] `estimer_commande` → `POST /orders/preview`. **Seule source
      des totaux.**
- [ ] **T024** [P] `dernieres_commandes` — pour le « comme la dernière fois ».
- [ ] **T025** Vérifier qu'aucun outil ne touche au paiement, et qu'un test le
      constate. L'absence est le garde-fou ; un test la rend permanente.

### Le tour de parole

- [ ] **T030** `POST /assistant/turn` en texte : reçoit un message, rend la
      réponse, l'état du panier et les outils appelés.
- [ ] **T031** Boucle d'appel d'outils : le modèle demande, on exécute, on
      rend, on recommence — avec un nombre maximal de tours d'outils par
      message, pour qu'une boucle folle ne coûte pas une fortune.
- [ ] **T032** Journaliser chaque tour : outils, jetons, coût. Sans cette
      colonne, la décision d'ouvrir se prendrait au doigt mouillé.
- [ ] **T033** Le contexte de conversation vit côté serveur et se purge après
      quelques jours : c'est un contexte, pas un historique.

### L'invite, et le ton

- [ ] **T040** Écrire l'invite système à partir des sections « Comment il
      parle » et « Registre » de la spec — tours courts, deux ou trois choses à
      la fois, vouvoiement, pas de nommage de ses propres actions.
- [ ] **T041** Rejouer la **conversation de référence** de la spec comme test :
      les tours de l'assistant doivent rester courts et ne jamais annoncer un
      prix absent de la dernière réponse d'outil.
- [ ] **T042** Tests d'ancrage : un montant prononcé qui n'est pas dans une
      réponse d'outil fait échouer le test. Idem pour un nom de produit.
- [ ] **T043** Tests de conversations tordues : « la même chose que la dernière
      fois mais sans le savon », « non, plutôt trois kilos », une rupture de
      stock en cours de route.

---

## Phase 2 — L'oreille et la voix

- [ ] **T050** Interfaces `Transcriber` et `Speaker`, une implémentation par
      fournisseur. Le choix sort de la phase 0 et doit rester remplaçable : les
      prix de ce poste bougeront.
- [ ] **T051** `POST /assistant/turn` accepte de l'audio et rend de l'audio,
      **plus le texte, toujours**.
- [ ] **T052** L'audio n'est pas conservé passé la transcription.
- [ ] **T053** Mesurer le coût réel d'un tour complet et le comparer à
      l'estimation de la recherche.

---

## Phase 3 — L'écran

- [ ] **T060** Écran assistant dans l'app cliente : bouton pour parler,
      conversation affichée au fil de l'eau, panier visible en dessous.
- [ ] **T061** Enregistrement via `expo-audio` — déjà en place pour les notes
      vocales du chat, rien à installer.
- [ ] **T062** Lecture de la réponse, avec le texte affiché pendant qu'il se
      dit : on suit des yeux, on rattrape un mot mal compris, et on peut s'en
      servir là où l'on ne peut pas mettre le son.
- [ ] **T063** L'écran reste utilisable à la main pendant la conversation.
- [ ] **T064** La fin du parcours bascule sur l'écran de paiement existant.
- [ ] **T065** Échec réseau : la conversation s'arrête proprement et le dit ;
      elle ne laisse pas un panier à moitié construit.

---

## Phase 4 — Ouvrir en mesurant

- [ ] **T070** Réserver l'assistant à un groupe restreint.
- [ ] **T071** Suivi du **coût par commande aboutie** — pas par conversation —
      et du taux d'abandon par tour.
- [ ] **T072** Décider : chemin normal, ou curiosité qu'on retire.

---

## Ordre conseillé

T010 → T013, puis T020 → T025, puis T030 → T033. À ce stade l'assistant tient
une conversation complète au clavier : c'est là qu'on saura si l'idée vaut, et
il n'aura coûté aucune seconde d'audio.

T040 → T043 ensuite, et ce sont les tâches qui décident de la qualité : le ton
et l'ancrage se travaillent là, sur un socle qui ne bouge plus.

La phase 2 ne commence pas avant que la phase 0 ait tranché la pile.
