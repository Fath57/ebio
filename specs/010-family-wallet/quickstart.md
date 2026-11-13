# Quickstart — vérifier le portefeuille famille

Prérequis : API locale sur `:3010` (SMS en journal : lancer sans
`WIREPICK_USER`/`WIREPICK_PASSWORD`), back-office `:5174`, app Client en build de
développement. Comptes : payeur `user@ebio.app`, membre `+2290197000001`
(compte créé par SMS), mot de passe `Password123!`.

```bash
cd apps/api && ../../node_modules/.bin/mikro-orm migration:up --only <migrations 010>
pnpm --filter api test -- family
```

## 1. Ouvrir, ajouter, recharger (US1)

1. Payeur → Profil → Portefeuille famille → « Ouvrir ».
2. « Ajouter un proche » → choisir « Maman » dans le carnet → membre **actif**
   (son numéro est vérifié). Journal : SMS « Awa vous a ajouté(e)… ».
3. « Ajouter un proche » → nouveau → `+2290196000002` → membre **en attente**,
   SMS d'invitation ; le proche apparaît aussi dans le carnet.
4. Recharger 5 000 FCFA depuis le portefeuille personnel → solde 5 000 immédiat ;
   historique `FAMILY_TRANSFER_IN`.
5. Recharger par carte (sandbox INTRAM) → crédit après confirmation ; push aux membres actifs.

## 2. Dépenser (US2)

1. Se connecter comme Maman → panier de 3 000 FCFA → au paiement, « Portefeuille
   famille (John) — 5 000 FCFA disponibles » → payer.
2. Solde 2 000 ; push au payeur « Maman a commandé… ».
3. Panier de 4 000 FCFA → l'option est grisée : « Il vous reste 2 000 FCFA ».
4. Annuler la première commande côté boutique → solde 5 000, dépense du mois de Maman 0.

## 3. Limites (US3)

1. Défaut : 2 000 FCFA par mois ; propre à Maman : 4 000.
2. Maman : commande de 3 000 acceptée, puis 1 500 refusée (« Il vous reste 1 000 FCFA ce mois-ci »).
3. Retirer la limite propre → Maman revient à 2 000 ; déjà 3 000 dépensés → refusé.
4. Catégories par défaut : « Légumes & Fruits » ; panier avec une huile → refus,
   produit signalé.

## 4. Concurrence (SC-004)

Test e2e `family-wallet-concurrency.e2e-spec.ts` : deux membres paient en même
temps 3 000 sur un solde de 5 000 → une seule commande payée, l'autre
`FAMILY_WALLET_REFUSED / INSUFFICIENT`, solde 2 000.

## 5. Suivi et vie privée (US4)

- Payeur : historique filtré par Maman → seulement ses achats, avec produits et
  boutique, sans adresse.
- Maman : `GET /family-wallets/mine` → `spendable`, pas de `balance`.

## 6. Contrôle (US5)

1. Suspendre Maman → son option disparaît ; la tante (une fois inscrite) peut payer.
2. Fermer le portefeuille avec 2 000 FCFA → portefeuille personnel du payeur
   +2 000 (`FAMILY_CLOSURE_IN`) ; plus aucune option au passage en caisse.
3. Une commande payée avant la fermeture puis annulée → remboursement sur le
   portefeuille personnel du payeur.
4. Payeur avec un portefeuille ouvert → `DELETE /users/me` → `409 FAMILY_WALLET_OPEN`.

## 7. Invitation (US6)

1. Créer un compte par code SMS avec `+2290196000002` → le membre en attente
   passe actif, push « Tata a rejoint… » au payeur.
2. Saisir ce numéro dans le profil d'un autre compte, sans vérification → rien.

## 8. Back-office

Argent → Portefeuilles : filtre « Famille » ; page « Portefeuilles famille » :
détail, membres, suspension avec motif, trace d'audit.
