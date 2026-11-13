# Phase 0 — Recherche : commander pour un proche

Tout ce qui suit a été lu dans le code d'eBio ou dans le code source d'INTRAM
(`suntech/intram/paycfa-webservice`, branche `origin/develop-v2`), pas supposé.
Les chemins sont relatifs à `apps/api/src/modules/` sauf mention contraire.

## 1. Où porter le destinataire

**Décision** : le proche est figé sur le **passage en caisse** (`checkouts`), pas
sur chaque commande.
**Rationale** : un passage en caisse multi-boutiques livre un seul proche ; le
SMS d'annonce, le lien de suivi et le compteur de renvoi sont par passage en
caisse (spec : « un seul SMS pour l'ensemble »). L'adresse et le point restent
copiés sur chaque `Order` comme aujourd'hui (`order.entity.ts` L69-90), donc le
devis, la zone et la diffusion n'ont rien à changer (FR-004).
**Alternatives** : colonnes sur `orders` — redondantes, et rien ne garantirait
que toutes les commandes d'un passage en caisse visent le même proche.

Ce qui existe : aucune notion de destinataire. Le livreur voit
`buyerContact: { name: order.buyer.name, phone: order.buyer.phone }`
(`deliveries/deliveries.mapper.ts` L275) — à remplacer par le proche quand il
existe (FR-005).

## 2. Le code de remise et les SMS au proche

**Décision** : deux SMS. Annonce + lien de suivi à la confirmation du paiement ;
code de remise à la collecte, au moment où il est aujourd'hui poussé à
l'acheteur. La spec (FR-008/FR-009) a été corrigée en ce sens.
**Rationale** : le code est créé à la collecte
(`deliveries.service.ts` L850 pour une livraison seule, L1137 `run.confirmationCode ??=`
pour une tournée), pas au paiement. Le générer plus tôt changerait le modèle de
tournée pour tous les acheteurs.
**Envoi** : `SmsService.send(phone, message)` (`apps/api/src/common/sms.service.ts`
L88) accepte un numéro brut — c'est ce qu'il faut, le proche n'a pas forcément de
compte, et `NotificationsService.sendSms` exige un `User`.
**Points d'accroche** : `confirmCheckout()` (`payments/payments.service.ts` L439,
seul point de confirmation réel — le webhook INTRAM ne confirme pas les paniers)
et les deux endroits où le code est poussé à l'acheteur (`deliveries.service.ts`
L862-869 et L1184). Le payeur continue de recevoir le code en push : c'est sa
roue de secours si le SMS n'arrive pas.

## 3. Preuve de remise : code **et** photo **et** position

**Décision** : un troisième type `CODE_AND_PHOTO` dans l'union discriminée
`completeDeliverySchema` (`deliveries/contracts/delivery.contract.ts` L151-165),
avec `code`, `mediaId`, `latitude`, `longitude`. Exigé — et seul accepté —
quand le passage en caisse a un proche. Colonnes ajoutées sur `deliveries` :
`proof_latitude`, `proof_longitude`, `proof_distance_m`, `proof_far`.
**Rationale** : la preuve vit déjà en colonnes sur `deliveries`
(`proof_type`, `proof_media_id`) ; une table à part pour quatre champs n'apporte
rien. `deliverRun()` (L1206-1272) recopie déjà la preuve sur chaque livraison de
la tournée : il recopie aussi les nouveaux champs.
**Position** : le mobile la lit avec `expo-location` (déjà utilisé par
`use-live-location.ts`) au moment de la validation. La distance au point de
livraison se calcule côté API (`ST_Distance` en `geography`, le même calcul que
la diffusion) ; au-delà de 300 m, `proof_far = true` (FR-015).
**Durcissement nécessaire** : aujourd'hui `complete()` n'examine pas le
`mediaId` reçu. Pour une preuve qui part chez le payeur, on vérifie que le média
existe, a le contexte `DELIVERY_PROOF` et a été envoyé par ce livreur.
**Hors ligne** : la file `use-offline-queue.ts` rejoue avec `occurredAt` ; la
position et l'heure sont capturées à la prise de vue, donc rejouées telles
quelles.

## 4. Photo envoyée au payeur

**Décision** : push avec `imageUrl` = URL signée 7 jours ; e-mail avec la photo
en pièce jointe inline (`cid`) ; écran commande mobile qui demande une URL signée
courte à la demande.
**Rationale** :
- `delivery_proof/` est un préfixe privé (seuls cinq préfixes sont publics) ;
  `media.service.ts` L320 `getSignedUrl()` existe déjà.
- `PushOptions.imageUrl` est déjà pris en charge par `fcm.service.ts` (L9-26)
  mais jamais rempli par `NotificationsService.pushOptionsFor` — on ajoute
  le passage de l'option.
- `EmailService` accepte des pièces jointes `cid` ; l'e-mail de facture le fait
  déjà pour sa carte. On lit les octets avec `media.service.readObject` (L378)
  plutôt qu'une URL signée qui expirerait dans la boîte du payeur.
**Conservation 90 jours** (FR-017) : un cron quotidien supprime les médias de
preuve des livraisons « pour un proche » remises depuis plus de 90 jours.

## 5. Échec de remise : remboursement sur le portefeuille, moins les frais

**Décision** : sur un échec d'une livraison « pour un proche », annuler la
commande et créditer le portefeuille eBio du payeur de
`order.totalAmount − frais de livraison de cette commande` ; le livreur est
réglé comme une livraison effectuée.
**Rationale** :
- Le code INTRAM ne sait rembourser une carte qu'intégralement
  (`app/workers/refundWorker.js` L163 : `stripe.refunds.create({ payment_intent })`,
  sans montant). Décision utilisateur : portefeuille eBio.
- eBio rembourse déjà tout sur le portefeuille : `compensation.service.ts`
  `compensateOrder()` (L61), idempotent sur `wallet_transactions.type='REFUND'`.
  On lui ajoute un paramètre de retenue (`withholdDeliveryFee`).
- Aujourd'hui `DeliveriesService.fail()` (L1555) ne bouge ni l'argent ni le
  statut de commande et ne prévient que la boutique. Le comportement des
  commandes ordinaires **ne change pas** dans ce lot ; seule la branche « pour
  un proche » est ajoutée.
**Alternative écartée** : rembourser intégralement sur la carte puis débiter les
frais — impossible sans moyen de prélèvement.

## 6. Devise : taux, marge et gel

**Décision** :
- EUR : saisi au back-office, 655,957 FCFA par défaut (parité officielle), jamais téléchargé ni écrasé par le cron.
- USD et CAD : taux EUR→USD et EUR→CAD de la Banque centrale européenne via
  `https://api.frankfurter.dev/v1/latest?from=EUR&to=USD,CAD` (gratuit, sans clé),
  convertis en FCFA par la parité officielle : `XOF par USD = 655,957 / (EUR→USD)`.
  (Ce calcul utilise toujours la parité officielle, pas le taux EUR saisi : une
  correction de l'euro au back-office ne déforme pas le dollar.)
  Un cron quotidien (`@Cron` + `@SingleInstance` + `@EnsureRequestContext`,
  modèle `payments/escrow-scheduler.service.ts` L35) écrit le résultat.
- Stockage : deux clés `platform_settings` (table clé/valeur existante,
  `settings/platform-settings.service.ts`) : `EXCHANGE_RATES` (JSON validé Zod :
  par devise, taux, source `AUTO|MANUAL`, date) et `FX_MARGIN_BPS` (entier,
  200 = 2 %).
- Taux appliqué : `taux effectif = taux de référence × (1 − marge)`, prix
  affiché = `FCFA ÷ taux effectif`, arrondi au centime supérieur. La marge
  **gonfle seulement l'affichage** : le montant encaissé reste le FCFA.
- Gel : à la création du passage en caisse (`CheckoutService.create`,
  `orders/checkout.service.ts` L267), qui précède immédiatement le lancement du
  paiement. Le serveur recalcule lui-même ; le client n'envoie que la devise.
**Rationale de la marge** : elle n'est pas un revenu. INTRAM encaisse en XOF
(Stripe, `createPaymentIntent.js`) et la banque du payeur convertit à son propre
taux, plus défavorable que celui de la BCE. La marge réduit le risque qu'Awa
voie « 30,50 € » puis soit débitée de 31,20 €.
**Échec du téléchargement** : on garde le dernier taux, et le back-office
affiche une alerte quand `updatedAt` dépasse 72 h (FR-021b). Une correction
manuelle passe la source à `MANUAL` jusqu'au téléchargement suivant.
**Alternatives** : exchangerate.host / openexchangerates (clé API, quota) ;
saisie seulement manuelle (refusée par l'utilisateur).

## 7. Paiement par carte

**Décision** : aucun changement dans la passerelle. La carte est proposée par la
page hébergée d'INTRAM (`gateway.intram.org/<ref>`), qui sait déjà encaisser
Visa/Mastercard via Stripe en XOF. Côté mobile, le choix « paiement en ligne »
(`PaymentChoice 'FEDAPAY'`, libellé générique) passe en tête et mentionne la carte
pour une commande à un proche.
**À vérifier en sandbox avant la mise en production** :
- le moyen `STRIPE_CARD` est actif sur le compte marchand eBio chez INTRAM ;
- montant minimum 1 000 FCFA pour la carte (`createPaymentIntent.js`) — en dessous,
  l'API refuse ; on bloque la commande à un proche sous ce seuil avec un message.
**Espèces** : refusées côté serveur dans `CheckoutService.create` à côté des
deux contrôles existants (L281-288), et masquées dans l'app (FR-006).

## 8. Lien de suivi public

**Décision** : jeton aléatoire (24 caractères base64url, 144 bits) stocké en
colonne unique sur `checkouts`, page SSR `apps/landing` en `suivi/:token`,
endpoint API `GET /api/gift-tracking/:token` en `@Public()` + `@RateLimit(60)`.
**Rationale** :
- Le jeton doit vivre aussi longtemps que la commande et être révocable : un
  jeton en base fait les deux. Le jeton HMAC des relevés de ventes
  (`sales-statements/sales-statement-token.ts`) expire en 10 minutes et ne
  se révoque pas.
- `apps/landing` sert déjà les pages publiques (`routes/parrainage.tsx` :
  loader → API, `robots: noindex`). La page se rafraîchit toutes les 15 s
  pendant la course (le mobile sonde déjà toutes les 10 s,
  `order-tracking.tsx` L1013 ; il n'y a pas de socket de suivi).
- Lien construit sur `config.clients.publicSite.url`, comme le parrainage.
**Ce que l'endpoint renvoie** : produits (nom, quantité, image), boutiques,
créneau, état, position du livreur seulement pendant la course, prénom du payeur.
Ni prix, ni code de remise, ni téléphone (FR-011). Détail réduit à « livré » ou
« annulé » sept jours après la fin (FR-012).

## 9. Compte du proche : « Paniers reçus »

**Décision** : rattacher par numéro **vérifié** seulement. Nouvelle colonne
`users.phone_verified_at`, renseignée par l'inscription par code SMS
(`otp-auth.service.ts` `registerWithPhone` L60-96) et remise à `null` quand le
numéro change dans le profil.
**Rationale** : le profil accepte un téléphone libre sans vérification
(`users/contracts/user.contract.ts` L27-32). Rattacher sur ce champ permettrait à
n'importe qui de saisir le numéro d'un autre pour voir ses paniers. Migration :
les comptes créés par code SMS (e-mail de remplacement `@phone.ebio.app`) sont
réputés vérifiés.
**Notation** : le module `ratings` exige aujourd'hui que l'auteur soit
l'acheteur de la commande ; l'éligibilité accepte aussi le proche rattaché
(`checkouts.recipient_user_id`, renseigné à la volée à la lecture).

## 10. Inscription depuis l'étranger

**Détection** (FR-034a) : fuseau horaire de l'appareil via `expo-localization`
(installé et déclaré en plugin, jamais importé) : `getCalendars()[0].timeZone`.
Est « au Bénin » un fuseau `Africa/Porto-Novo` ou un fuseau UTC+1 d'Afrique de
l'Ouest (`Africa/Lagos`, `Africa/Douala`…) — certains téléphones béninois sont
réglés sur Lagos.
**Rationale** : la région de la langue est trompeuse — beaucoup de téléphones
béninois sont en `fr-FR`. Le pays du réseau mobile demanderait un module natif
absent du binaire (et une nouvelle version sur les stores). Le fuseau est
fiable, gratuit et ne demande aucune autorisation. La position GPS n'est pas
utilisée : elle demande une autorisation (contraire à FR-034a).
**Écrans** : `register-screen.tsx` et `login-screen.tsx` démarrent aujourd'hui
sur le téléphone `+229` (L56, L41). Hors du Bénin, ils démarrent sur e-mail avec
Google et Apple, dans la disposition actuelle, sans mise en avant, et un lien
« J'ai un numéro béninois » rouvre le parcours téléphone.
**Serveur** : `otpRequestSchema` refuse déjà tout numéro hors `+229`
(`auth/contracts/auth.contract.ts` L4) ; on renvoie un code d'erreur que l'app
traduit en « Utilisez Google, Apple ou votre e-mail » (FR-034).
**E-mail confirmé avant commande** (FR-034c) : Better Auth n'exige pas
la vérification (`requireEmailVerification` absent, `better-auth.config.ts`
L94-102) et rien ne la contrôle à la commande. On ajoute le contrôle dans
`CheckoutService.create` : refus si ni `emailVerified` ni `phone_verified_at`.
Google et Apple renvoient `emailVerified: true` ; l'inscription par code e-mail
aussi (`registerWithEmail` L98-131).
**Pas de SMS hors Bénin** (FR-033) : garde dans `NotificationsService.sendSms`
(L262) — tout numéro qui ne commence pas par `+229` passe à la place par push et
e-mail. `SmsService.send` reste neutre pour les SMS au proche (numéro béninois
contrôlé au passage en caisse).
**Profil** : le numéro devient E.164 validé (`^\+[1-9]\d{6,14}$`).

## 11. Préférence de devise côté mobile

**Décision** : colonne `users.display_currency` (défaut `XOF`) + copie locale
dans `storage` (`utils/offline-storage.ts`), lue par un `CurrencyContext` sur le
modèle de `theme/theme-context.tsx`. Taux lus dans `GET /api/settings/public`
(déjà appelé au passage en caisse).
**Un seul formateur** : il existe environ 22 copies locales de `formatPrice`.
On crée `features/common/hooks/use-money.ts` → `formatMoney(xof)` qui rend
« 30,50 € » + « 20 000 FCFA » ; on ne remplace **que** les écrans acheteur
listés dans `plan.md` (catalogue, recherche, panier, passage en caisse,
commandes). Fournisseur et livreur restent en FCFA.

## 12. Notifications : nouveaux types

`NotificationType` est un enum avec contrainte CHECK
(`notifications/notification.entity.ts`) et une table d'audience
(`notifications.service.ts` L26-78). Ajouts : `GIFT_DELIVERED`,
`GIFT_DELIVERY_FAILED` (audience acheteur). Gabarits e-mail EJS :
`gift-delivered.ejs`, `gift-delivery-failed.ejs`, à déclarer dans `TemplateName`
(`email/email-template.service.ts` L6-26). Envoi par appel direct depuis
`DeliveriesService` (il n'y a pas d'`EventEmitter` dans le projet).
