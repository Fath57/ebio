# Phase 0 — Recherche : portefeuille famille

Lu dans le code, pas supposé. Chemins relatifs à `apps/api/src/modules/` sauf mention.

## 1. Où vit le solde

**Décision** : le solde est une ligne de `wallets`, avec un nouveau propriétaire
`family_wallet_id`. La table `family_wallets` porte tout le reste (payeur,
statut, limites par défaut, seuil d'alerte).

**Rationale** : `WalletService.apply()` (`wallet/wallet.service.ts` L115-163)
verrouille le solde (`SELECT … FOR UPDATE`), refuse un débit qui le rendrait
négatif (L139) et écrit la ligne d'historique, le tout dans une transaction.
C'est exactement la garantie de SC-004 sous paiements simultanés de plusieurs
membres : les débits d'un même portefeuille sont sérialisés par ce verrou. La
recharge (`wallet_topups.wallet_id` est déjà distinct de `user_id`), l'historique
paginé et les pages Argent du back-office suivent sans rien réécrire.

**À modifier** : la contrainte `wallet_single_owner`
(`num_nonnulls(user_id, supplier_id, courier_profile_id, platform_account) = 1`,
`Migration20260911100000.ts`) reçoit `family_wallet_id` ; `WalletOwner` et
`getOrCreate` (L25, L46) reçoivent `familyWalletId`.

**Alternative écartée** : un solde en colonne sur `family_wallets` — il
faudrait réécrire verrou, historique, recharge et administration.

## 2. Dépense par membre et limites

**Décision** : `wallet_transactions` reçoit une colonne `family_member_id`
(nullable). Un achat, un remboursement d'achat portent le membre. La dépense du
mois d'un membre = `−SUM(amount)` des lignes `ORDER_PAYMENT` et `REFUND` de ce
membre depuis le 1er du mois (fuseau Africa/Porto-Novo).

**Contrôle au paiement** : dans la même transaction que le débit, **après** le
verrou sur le portefeuille, calculer la dépense du mois du membre et vérifier
plafond mensuel, maximum par commande et catégories. Le verrou sérialise deux
membres qui paient en même temps, donc le calcul ne peut pas être doublé.

**Catégories** : `Product.category` est obligatoire (`products/entities/product.entity.ts`
L65-66), liste plate (`categories`). `CheckoutService.groupBySupplier` (L105-130)
charge les produits avec `populate: ['supplier']` ; on ajoute `'category'`.

**Limites effectives** : pour chaque limite, celle du membre si elle est
renseignée, sinon celle du portefeuille. Calcul pur, testable seul.

## 3. Paiement au passage en caisse

**Décision** : un quatrième moyen de paiement `FAMILY_WALLET` (enum
`PaymentMethod`, `orders/entities/order.entity.ts` L25-29 et
`orders/contracts/order.contract.ts` L38) avec `familyMemberId` dans le corps.
`CheckoutService.create` (L329) appelle `payFromFamilyWallet` à la place de
`payFromWallet` (L305-327), **dans la même transaction** que la création des
commandes : un refus (solde, limite) annule tout.

**Traçabilité** : `checkouts.family_member_id` (nullable). Rien aujourd'hui ne
dit quel portefeuille a payé (`Payment.paymentMethod` est une chaîne libre) :
c'est la colonne qui permet de router un remboursement.

**Le reste ne change pas** : `Payment` en `ESCROW` comme un paiement par
portefeuille personnel ; la libération du séquestre
(`payments/payments.service.ts` `releaseEscrow` L686-750) ne regarde pas le
moyen de paiement.

**Aperçu** : `POST /orders/checkout/preview` renvoie, pour l'acheteur connecté,
la liste des portefeuilles famille dont il est membre actif, avec le montant
dépensable et, s'il est refusé, la raison (`INSUFFICIENT`, `MONTHLY_CAP`,
`ORDER_MAX`, `CATEGORY`, avec les produits en cause).

## 4. Remboursements

Quatre endroits créditent en dur le portefeuille personnel de l'acheteur :

| Endroit | Ligne | Traitement |
|---|---|---|
| `payments/compensation.service.ts` `compensateOrder` | L111, L132 | brancher : checkout payé par portefeuille famille → ce portefeuille s'il n'est pas fermé, sinon portefeuille personnel du **payeur** ; la ligne `REFUND` porte le membre |
| `deliveries/deliveries.service.ts` `buyerDecision` | L1054-1061 | même branchement (frais de tournée) |
| `deliveries/courier-feedback.service.ts` (pourboire) | ~L103 | inchangé : un pourboire se paie toujours depuis le portefeuille personnel |
| `gift/gift-failure.service.ts` | L59 | passe par `compensateOrder`, rien à faire |

Un seul assistant `refundTargetWallet(checkout)` dans le module famille, appelé
par les deux premiers.

## 5. Recharge

`TopupService.initiate(userId, amount, target)` (`wallet/topup.service.ts` L56)
résout le portefeuille par `resolveOwner` (L393). **Décision** : une cible
`'family'` — le portefeuille famille du demandeur, qui doit en être le payeur.
Confirmation, idempotence (`settleFromProvider` L286, `UPDATE … WHERE status IN
('PENDING','FAILED')`) et rapprochement par cron (L329) inchangés. Après crédit,
`FamilyWalletNotifier.onTopup` prévient les membres.

**Bornes** : le schéma actuel accepte 100 à 1 000 000 FCFA ; pour la cible
famille, 1 000 à 500 000 (FR-010), contrôlées dans le service.

**Virement depuis le portefeuille personnel** : un débit `FAMILY_TRANSFER_OUT`
sur le personnel puis un crédit `FAMILY_TRANSFER_IN` sur le famille, dans une
seule transaction (`em.transactional` englobant les deux `apply`).

**Fermeture** : `FAMILY_CLOSURE_OUT` sur le famille (tout le solde), puis
`FAMILY_CLOSURE_IN` sur le personnel du payeur.

Quatre nouveaux types de ligne : enum de l'entité, zod
(`wallet/contracts/wallet.contract.ts` L5-26, à qui manque aussi
`REFERRAL_REWARD`), contrainte `wallet_transactions_type_check`
(dernière définition `Migration20260928020000.ts`).

## 6. Membres en attente

`users.phone_verified_at` n'est posé qu'à un seul endroit :
`auth/otp-auth.service.ts` `registerWithPhone` (L60-98). **Décision** : après la
création du compte, `FamilyMembersService.linkPendingByPhone(userId, phone)`.
Au moment de l'ajout d'un membre, on cherche aussi un compte existant au numéro
vérifié (même règle que `gift/recipient-link.ts`).

Le membre garde une copie de son numéro et de son surnom : le proche du carnet
peut être modifié ou supprimé sans casser l'accès (`saved_relative_id` en
`SET NULL`, comme `checkouts`).

**Invitation** : `SmsService.send()` direct (le proche n'a pas de compte).
Cron quotidien : membres en attente depuis 30 jours → notification au payeur
(une seule fois, colonne `pending_reminded_at`).

## 7. Suppression de compte

`users/account-deletion.service.ts` `assertNothingPending` (L81-113) refuse déjà
la suppression si un portefeuille du compte a un solde non nul. **Ajout** :
refus (409, code `FAMILY_WALLET_OPEN`) si l'utilisateur est payeur d'un
portefeuille famille non fermé (FR-031). Un membre peut supprimer son compte :
son accès passe en `REMOVED`.

## 8. Back-office

`wallet/admin-wallets.service.ts` : `toWalletRow` range en `USER` tout
propriétaire inconnu (L44). **Ajout** du type `FAMILY` (jointure sur
`family_wallets` → nom du payeur). Nouvelle page « Portefeuilles famille » :
liste, détail (membres, historique), suspension d'un portefeuille ou d'un
membre avec trace d'audit (module `AuditModule` existant).

## 9. Notifications

Nouveaux types (`notifications/notification.entity.ts` + `AUDIENCE_TYPES`
`notifications.service.ts` L29-83 + contrainte CHECK) :

| Type | Destinataire |
|---|---|
| `FAMILY_WALLET_TOPUP` | membres |
| `FAMILY_WALLET_PURCHASE` | payeur |
| `FAMILY_WALLET_LOW_BALANCE` | payeur |
| `FAMILY_WALLET_MEMBER_JOINED` | payeur |
| `FAMILY_WALLET_MEMBER_PENDING` | payeur (30 jours) |
| `FAMILY_WALLET_STATUS` | membres (suspension, réactivation, retrait, fermeture) |

Alerte de solde bas : après chaque débit, si le solde passe **sous** le seuil
alors qu'il était au-dessus (une seule alerte par franchissement).

## 10. Réglementaire

Pas de décision technique ; noté au plan comme risque : faire valider par un
juriste le statut (BCEAO) de fonds prépayés détenus pour un tiers, utilisables
seulement sur eBio. Le portefeuille personnel existant soulève déjà la même
question.
