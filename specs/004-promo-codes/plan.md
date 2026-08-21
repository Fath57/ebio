# 004 — Codes promo

## Décisions

| # | Sujet | Décision |
|---|-------|----------|
| 1 | Créateurs | Admin (codes **plateforme**, valables partout) et fournisseur (codes **boutique**, valables uniquement sur ses commandes). |
| 2 | Types de remise | `PERCENT` (avec plafond optionnel `maxDiscount`) et `FIXED`. Base = **articles uniquement**, jamais la livraison. |
| 3 | Qui paie la remise | Code boutique → le fournisseur (ses produits, sa marge). Code plateforme → **eBio compense le fournisseur** : à la libération d'escrow (en ligne) ou à la livraison (espèces), le wallet boutique est crédité du montant de la remise (`PROMO_COMPENSATION`). La commission se calcule sur la base **remisée** dans les deux cas. |
| 4 | Contraintes | fenêtre `startsAt`/`expiresAt`, `minOrderAmount`, `maxUses` global, `maxUsesPerUser`, activable/désactivable. |
| 5 | Comptage | Table `promo_redemptions` (une par commande, unique) = source de vérité. Réservation **atomique** à la création de commande (`UPDATE … WHERE use_count < max_uses`). Commande annulée (y compris auto-annulation des impayées) → rédemption libérée, compteur décrémenté. |
| 6 | Application | Le panier envoie `promoCode` à `POST /orders`. Préviste : `POST /promo-codes/validate` (code + boutique + sous-total) → remise calculée ou motif de refus lisible. |
| 7 | Stockage commande | `orders.promo_code_id`, `orders.discount_amount`, `orders.discount_funded_by` (`SUPPLIER`\|`PLATFORM`). Montants figés à la commande. |

## Endpoints
- Buyer : `POST /promo-codes/validate`
- Fournisseur : `GET|POST|PATCH|DELETE /suppliers/me/promo-codes`
- Admin : `GET|POST|PATCH|DELETE /admin/promo-codes` (voit tout, peut désactiver un code boutique)

## UI
- **BO** : page « Codes promo » (groupe Ventes) — liste avec usages, création/édition, désactivation.
- **Web fournisseur** : page « Codes promo » dans le menu.
- **Mobile fournisseur** : entrée paramètres boutique → gestion des codes.
- **Mobile acheteur** : champ « Code promo » au checkout avec aperçu de la remise et nouveau total.

## Ordre
1. SQL + entités + `PromoCodesService` (validation/réservation/libération) + intégration `orders.create` + compensation wallet ; tests e2e locaux
2. BO admin
3. Web fournisseur
4. Mobile (checkout acheteur + gestion fournisseur)
