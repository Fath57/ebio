# Quickstart — vérifier le terroir vers l'étranger

Prérequis : API locale `:3010` (SMS en journal), back-office `:5174`, app
Client (fuseau `Europe/Paris`) et app Fournisseur en build de développement.
`terroir_export_enabled` activé en local seulement.

## 1. Préparer (back-office)

1. Réglages → Livraison → « Terroir vers l'étranger » : activer.
2. Agences : créer « Bénin Express », points de retrait Paris et Bruxelles.
3. Départs : 22/11, dépôt avant 19/11, 7–11 jours, capacité 100 kg ; FR 8 500 FCFA/kg,
   minimum 5 kg, domicile 3 900 ; BE 9 000 FCFA/kg, minimum 5 kg, sans domicile.

## 2. Produits et packs (US3)

1. App Fournisseur (Fatou) : beurre de karité → « Vendre à l'étranger » : 450 g,
   conservation 365 j, origine (coopérative de Djougou, Atacora, 2026), photo d'étiquette.
2. Produit d'une catégorie interdite → refus `EXPORT_CATEGORY_BANNED`.
3. Back-office → Validation export : cocher la liste, valider → badge « Terroir validé eBio ».
4. Fatou compose un « Pack beauté karité » ; eBio compose un « Pack découverte » de trois boutiques.

## 3. Commander (US1, US7, US8)

1. App Client → Terroir : bandeau « Prochain envoi vers Paris : 22 novembre — commandez avant le 18 ».
2. Pack beauté + 2 moringa (3,2 kg estimés) → panier : « ajoutez jusqu'à 1,8 kg sans frais », suggestions.
3. Paiement : départ du 22/11 présélectionné, 42 500 FCFA (≈ 67,07 €) droits et taxes inclus ;
   assurance cochée ; carte (sandbox) ou portefeuille.
4. Supprimer le départ côté back-office → l'app propose « Me prévenir du prochain départ » ;
   recréer un départ → notification.

## 4. Préparer et expédier (US4, US5)

1. Boutiques : commandes `EXPORT` avec « à remettre avant le 18/11 » → « Prête pour la collecte ».
2. Back-office → Départ du 22/11 : liste de collecte ; « Collecté » pour Fatou → sa
   commande passe livrée, son portefeuille est crédité **immédiatement**.
3. Pesée 5,9 kg pour 5 kg facturés (> 10 %) → le client reçoit la demande de complément ;
   payer ou retirer un produit ; sinon, au bout de 48 h, eBio absorbe.
4. Liste du départ (imprimable) ; étape « Parti du Bénin » pour tout le départ → chaque client notifié.
5. Un colis : « Disponible au retrait » avec l'adresse de Paris → notification ; « Remis ».

## 5. Cas particuliers

- Remplissage : colis jusqu'à 80 kg → e-mail à l'équipe ; 100 kg → départ « complet », plus proposé.
- Départ annulé → réaffecter au suivant ; surcoût porté par le compte `EXPORT`.
- Produit manquant à la collecte → ligne retirée, client remboursé (produit + transport allégé).
- Colis perdu, assuré → remboursement complet ; boutique non débitée.
- Colis offert à Bruxelles : le destinataire reçoit le suivi par e-mail, sans prix ; le payeur est prévenu à la remise.
- Interrupteur désactivé : l'espace Terroir disparaît, les colis payés continuent leur suivi.
