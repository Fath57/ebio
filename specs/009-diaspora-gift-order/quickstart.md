# Quickstart — vérifier le module diaspora

Prérequis : `pnpm docker:up`, API sur `:3000`, landing sur `:5175`, app
acheteur et app livreur en build de développement (voir la mémoire
« dev sur device physique » : `adb reverse`).

## 0. Préparer

```bash
pnpm --filter api db:migrate:up   # en local ; en prod, migrer avec --only (registre désynchronisé)
pnpm --filter api test -- diaspora
```

Back-office → Réglages → **Devises** : vérifier que USD et CAD ont un taux du
jour (bouton « Actualiser » sinon) et que la marge vaut 2 %.

## 1. Inscription depuis l'étranger (US6)

1. Sur l'émulateur, régler le fuseau sur `Europe/Paris`, ouvrir l'app.
2. Créer un compte : l'écran propose Google, Apple, e-mail ; aucun champ
   téléphone. Le lien « J'ai un numéro béninois » rouvre le parcours SMS.
3. Créer le compte par e-mail, ne pas confirmer, tenter une commande →
   refus `ACCOUNT_NOT_VERIFIED`.
4. Confirmer, ajouter `+33612345678` dans le profil → accepté.
5. Remettre le fuseau sur `Africa/Porto-Novo` → écran d'aujourd'hui.

## 2. Devise (US3)

1. Profil → Devise → EUR. Catalogue, panier et récapitulatif affichent
   « x,xx € » avec le montant FCFA en dessous.
2. Contrôle : 6 559,57 FCFA à 2 % de marge → 6 559,57 ÷ (655,957 × 0,98) = 10,21 €.
   Saisir 660 pour l'euro au back-office → le même prix passe à 10,15 € ; le
   cron du lendemain ne touche pas l'euro.
3. Passer en USD, passer commande, puis modifier le taux USD au back-office et
   rouvrir la commande : le montant en USD n'a pas bougé (FR-022).

## 3. Commander pour un proche (US1, US4)

1. Panier de deux boutiques → « Livrer à un proche » → nom, `+2290197000001`,
   point sur la carte, adresse.
2. Vérifier que les espèces ne sont pas proposées et que le paiement en ligne
   est en tête.
3. Payer en sandbox INTRAM par carte test.
4. Logs SMS (Wirepick en mode journal sans identifiants) : SMS d'annonce avec
   le lien `…/suivi/<token>`.
5. Après la commande, l'app propose d'enregistrer le proche ; il apparaît dans
   le carnet.

## 4. Suivi public (US5)

1. Ouvrir `http://localhost:5175/suivi/<token>` en navigation privée : contenu,
   créneau, état ; aucun prix, aucun code.
2. Passer la commande en préparation, faire collecter par le livreur : nouveau
   SMS au proche avec le code ; la page affiche le livreur sur la carte.
3. `UPDATE checkouts SET …` pour simuler une livraison vieille de 8 jours →
   la page n'affiche plus que « Livré ».

## 5. Preuve de remise (US2)

1. App livreur, course pour un proche : l'écran de remise exige code **et**
   photo ; « Valider » reste grisé tant qu'il manque l'un des deux.
2. Valider loin du point (émulateur : position fixée à 1 km) → remise
   acceptée, `proof_far = true`, visible dans Back-office → Livraisons →
   Preuves éloignées.
3. Payeur : push avec la photo, e-mail MailDev (`:1080`) avec la photo inline
   et les deux heures (Paris / Cotonou).
4. Tenter `POST /deliveries/:id/complete` avec `proofType: "CODE"` seul →
   `400 GIFT_PROOF_REQUIRED`.

## 6. Échec de remise

1. Sur une autre commande pour un proche, déclarer « Client absent ».
2. Portefeuille du payeur crédité de `total − frais de livraison` ; commande
   annulée ; livreur crédité de sa course ; push + e-mail au payeur.

## 7. Paniers reçus

1. Créer un compte par code SMS avec `+2290197000001`.
2. Onglet Commandes → « Paniers reçus » : la commande livrée, sans montant ;
   noter un produit et le livreur.
3. Saisir ce même numéro dans le profil d'un **autre** compte (non vérifié) →
   aucun panier reçu.
