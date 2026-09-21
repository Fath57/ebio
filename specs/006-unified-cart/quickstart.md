# Quickstart — Panier unifié multi-boutiques

**Feature**: 006-unified-cart

Comment lancer l'environnement et vérifier la fonctionnalité de bout en bout.

## Lancer la pile

```bash
pnpm docker:up                       # PostgreSQL, Redis, MailDev, MinIO
cd apps/api && pnpm dev              # port défini par API_PORT (3010 en local)
```

Le port de l'API n'est pas 3000 partout : il est lu dans `apps/api/.env`. La
landing et le mobile doivent pointer dessus — `API_URL` pour la première,
`EXPO_PUBLIC_API_URL` pour le second.

## Lancer l'app client sur un appareil

```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3010 tcp:3010        # le port de l'API, pas 3000
cd apps/mobile && APP_VARIANT=client EXPO_PUBLIC_APP_VARIANT=client npx expo start --dev-client
```

**Piège** : une app installée depuis le Play Store ne parle pas à Metro — elle
embarque son JavaScript. Il faut un build de développement. Et `expo run:android`
**ne relance pas le prebuild** quand `android/` existe déjà : passer d'une
variante à l'autre impose `npx expo prebuild --platform android --clean` avec le
bon `APP_VARIANT`, sous peine de reconstruire la variante précédente.

## Jeu de données minimal

Il faut au moins deux boutiques validées, localisées, avec des produits en
stock, et un livreur validé disponible dont la position GPS date de moins de
12 heures — sans quoi la diffusion ne le retiendra pas.

```bash
cd apps/api && pnpm db:fresh:seed
```

## Vérifier la fonctionnalité

### US1 — Un panier, un paiement

1. Ajouter des produits de **deux boutiques différentes** au panier.
2. Ouvrir le panier : une seule liste, un seul total, un seul bouton.
3. Commander : une seule saisie d'adresse, une seule opération de paiement.
4. Côté API, vérifier qu'un `checkout` existe et que **deux** commandes lui sont
   rattachées, chacune avec son numéro.
5. Côté fournisseur, chaque boutique voit sa commande, comme avant.

### US2 — Une seule livraison

1. Au récapitulatif, vérifier qu'**un seul** frais de livraison est annoncé
   avant paiement.
2. Après paiement, une `delivery_run` existe et regroupe les deux livraisons.
3. Sur l'app livreur, la tournée arrive en une proposition unique, avec les
   points de collecte ordonnés.
4. Accepter, collecter chez la première boutique : seule cette commande passe
   en « récupérée ».
5. Remettre avec le code : les deux commandes passent en « livrée ».

### US3 — Une boutique défaille

1. Passer une commande multi-boutiques payée.
2. Faire refuser l'une des commandes côté fournisseur.
3. Vérifier que le portefeuille de l'acheteur est crédité du montant **de cette
   commande seule**, et que l'autre suit son cours.
4. Vérifier que rejouer le dédommagement ne crédite pas deux fois.

### Cas limites à ne pas oublier

- **Panier mono-boutique** : le parcours doit rester au moins aussi court
  qu'avant (FR-024). C'est la vérification de non-régression la plus importante,
  puisque c'est le cas le plus fréquent.
- **Espèces au-dessus du plafond** : le message doit annoncer le dépassement et
  les deux issues, pas refuser sèchement.
- **Boutique sans position** : le forfait s'applique, la commande passe.
- **Boutique hors zone** : le blocage nomme la boutique concernée.

## Contrôles avant de déclarer terminé

```bash
pnpm lint                            # 0 erreur ; les avertissements sont tolérés
pnpm --filter=@boilerstone/api typecheck
pnpm --filter=@boilerstone/api test  # dont delivery-fee.spec.ts et dispatch.service.spec.ts
cd apps/mobile && npx tsc --noEmit   # filtrer : le mobile a des erreurs préexistantes
```

Le mobile porte des erreurs de types antérieures à ce chantier (imports
profonds de `lucide-react-native`, API `expo-file-system`) : ne comparer que les
fichiers touchés, sans quoi le bruit masque les vraies régressions.
