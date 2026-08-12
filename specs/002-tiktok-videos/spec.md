# Feature Specification: Intégration des vidéos TikTok des fournisseurs

**Feature Branch**: `002-tiktok-videos`
**Created**: 2026-06-24
**Status**: Draft
**Input**: Afficher les vidéos TikTok des fournisseurs dans l'app mobile via l'API TikTok Display (Option A : OAuth Login Kit). Le fournisseur connecte son compte TikTok depuis ses réglages boutique ; les acheteurs voient les vidéos sur la fiche boutique.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Le fournisseur connecte son compte TikTok (Priority: P1)

Un fournisseur validé ouvre les réglages de sa boutique, appuie sur « Connecter mon compte TikTok », autorise eBio dans la fenêtre TikTok, et revient dans l'app où son compte apparaît comme connecté (« Connecté en tant que @pseudo »).

**Why this priority**: Sans connexion OAuth, aucune vidéo ne peut être récupérée légitimement. C'est le socle de toute la fonctionnalité — rien d'autre n'est possible avant.

**Independent Test**: Connecter un compte TikTok de test (sandbox) et vérifier que le statut « connecté » + le pseudo s'affichent, et qu'un jeton est stocké côté serveur (chiffré).

**Acceptance Scenarios**:

1. **Given** un fournisseur validé sans compte TikTok lié, **When** il lance le flux de connexion et autorise eBio, **Then** son compte TikTok est lié (pseudo affiché) et il peut le déconnecter.
2. **Given** un fournisseur qui annule l'autorisation TikTok, **When** il ferme la fenêtre sans autoriser, **Then** aucun compte n'est lié et un message neutre s'affiche (pas d'erreur bloquante).
3. **Given** un fournisseur déjà connecté, **When** il rouvre les réglages, **Then** le statut « connecté » et le pseudo sont visibles, avec une action « Déconnecter ».

---

### User Story 2 - L'acheteur regarde les vidéos d'un fournisseur (Priority: P2)

Un acheteur ouvre la fiche boutique d'un fournisseur qui a connecté TikTok. Une section « Vidéos » affiche les miniatures des dernières vidéos TikTok du fournisseur. En appuyant sur une miniature, la vidéo se lit (lecteur TikTok intégré) sans quitter l'app, avec une attribution TikTok.

**Why this priority**: C'est la valeur visible côté acheteur — le but de la fonctionnalité. Dépend de P1 (le fournisseur doit d'abord être connecté).

**Independent Test**: Sur une fiche boutique d'un fournisseur connecté en sandbox, vérifier que les miniatures se chargent et qu'un appui ouvre la lecture intégrée.

**Acceptance Scenarios**:

1. **Given** un fournisseur connecté avec des vidéos publiques, **When** un acheteur ouvre sa fiche boutique, **Then** une section « Vidéos » affiche les miniatures (les plus récentes en premier).
2. **Given** la section vidéos affichée, **When** l'acheteur appuie sur une miniature, **Then** la vidéo se lit dans le lecteur intégré TikTok avec attribution.
3. **Given** un fournisseur sans compte TikTok lié, **When** un acheteur ouvre sa fiche boutique, **Then** aucune section « Vidéos » n'est affichée (pas d'espace vide).

---

### User Story 3 - Le fournisseur gère / révoque la connexion (Priority: P3)

Un fournisseur connecté peut se déconnecter de TikTok à tout moment depuis ses réglages ; ses vidéos cessent alors d'apparaître sur sa fiche et ses jetons sont supprimés côté serveur.

**Why this priority**: Conformité (droit de révocation) et hygiène des données. Important mais non bloquant pour démontrer la valeur.

**Independent Test**: Déconnecter un compte lié et vérifier que la section « Vidéos » disparaît de la fiche et que les jetons sont effacés.

**Acceptance Scenarios**:

1. **Given** un fournisseur connecté, **When** il appuie sur « Déconnecter », **Then** le lien est supprimé, ses jetons sont effacés, et ses vidéos n'apparaissent plus.
2. **Given** un jeton TikTok expiré et non rafraîchissable, **When** l'app tente de charger les vidéos, **Then** la section se dégrade proprement (vide, sans erreur visible) et le fournisseur est invité à reconnecter.

---

### Edge Cases

- **Jeton d'accès expiré** : rafraîchissement automatique via le refresh token ; si le refresh échoue, marquer la connexion comme expirée et inviter à reconnecter.
- **Le fournisseur n'a aucune vidéo publique** : section masquée (pas d'état vide intrusif).
- **Compte TikTok privé / vidéos privées** : seules les vidéos accessibles via le scope sont affichées ; sinon section vide.
- **Quota / rate limit TikTok atteint** : servir la liste depuis le cache ; ne jamais bloquer l'écran.
- **Révocation côté TikTok** (l'utilisateur retire l'accès depuis TikTok) : traiter l'erreur d'autorisation comme une déconnexion.
- **Indisponibilité régionale** : [NEEDS CLARIFICATION: TikTok Login/Display API est-il disponible et autorisé au Bénin / Afrique de l'Ouest pour les comptes développeurs et utilisateurs ?]
- **Lecture hors-ligne** : impossible (lecteur TikTok requiert le réseau) — afficher un état réseau requis.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Un fournisseur validé MUST pouvoir lier son compte TikTok via OAuth (TikTok Login Kit) depuis les réglages boutique.
- **FR-002**: Le système MUST échanger le code d'autorisation contre des jetons côté serveur ; les jetons (access + refresh) MUST être stockés chiffrés et ne JAMAIS être exposés au client.
- **FR-003**: Le système MUST rafraîchir automatiquement le jeton d'accès expiré à l'aide du refresh token.
- **FR-004**: Le système MUST récupérer la liste des vidéos publiques du fournisseur via l'API Display (scope `video.list`) et exposer uniquement des métadonnées (miniature, lien d'intégration, lien de partage, titre) — jamais le fichier vidéo.
- **FR-005**: Le système MUST mettre en cache la liste de vidéos par fournisseur (TTL court) pour respecter les quotas TikTok.
- **FR-006**: L'acheteur MUST voir une section « Vidéos » sur la fiche boutique d'un fournisseur connecté, avec les vidéos les plus récentes d'abord.
- **FR-007**: L'acheteur MUST pouvoir lire une vidéo via le lecteur intégré TikTok (embed), avec attribution TikTok et lien retour.
- **FR-008**: Le fournisseur MUST pouvoir se déconnecter de TikTok ; la déconnexion MUST supprimer les jetons et masquer ses vidéos.
- **FR-009**: Le système MUST NOT télécharger, stocker ni réhéberger les fichiers vidéo TikTok (conformité Developer Policy).
- **FR-010**: Le système MUST se dégrader proprement (section vide, aucune erreur bloquante) en cas d'échec TikTok (jeton invalide, quota, réseau).
- **FR-011**: Le flux OAuth mobile MUST utiliser PKCE et un `state` anti-CSRF ; le retour dans l'app MUST passer par le schéma `ebio-mobile://` ou un callback backend.
- **FR-012**: La politique de confidentialité eBio MUST être mise à jour pour déclarer la collecte de données TikTok.
- **FR-013**: Toute UI nouvelle MUST respecter la constitution (design system, vocabulaire « Fournisseur »/« Fiche boutique », accessibilité 44px, accents FR).

### Key Entities *(include if feature involves data)*

- **Connexion TikTok du fournisseur**: rattachée à un `Supplier`. Attributs : identifiant TikTok ouvert (`open_id`), pseudo affiché, jeton d'accès (chiffré), jeton de rafraîchissement (chiffré), dates d'expiration des deux jetons, date de connexion, statut (connecté / expiré).
- **Vidéo TikTok (métadonnée, non persistée durablement)**: identifiant vidéo, URL de miniature, lien d'intégration (embed), lien de partage, titre, durée. Récupérée à la demande et mise en cache temporairement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un fournisseur peut connecter son compte TikTok en moins de 60 secondes (du tap « Connecter » au statut « connecté »).
- **SC-002**: Sur une fiche boutique d'un fournisseur connecté, les miniatures de vidéos s'affichent en moins de 2 secondes (cache chaud).
- **SC-003**: 100 % des jetons sont stockés chiffrés ; aucun jeton n'apparaît jamais dans une réponse API consommée par le client.
- **SC-004**: Aucun fichier vidéo TikTok n'est téléchargé ni stocké par eBio (vérifiable : seules des URL/métadonnées en base et en cache).
- **SC-005**: En cas d'échec TikTok, la fiche boutique reste fonctionnelle (aucun crash, aucune erreur visible bloquante) dans 100 % des cas testés.

## Out of Scope (v1)

- Feed vertical « façon TikTok » autoplay agrégé multi-fournisseurs (le lecteur TikTok contrôle la lecture ; non fourni aux tiers).
- Publication / édition de vidéos vers TikTok depuis eBio.
- Récupération de vidéos par simple @pseudo sans autorisation du fournisseur (non permis par TikTok).
- Statistiques / analytics des vidéos.

## Assumptions & Dependencies

- Compte **TikTok for Developers** + app enregistrée (Login Kit + Display API) — prérequis externe, hors code.
- **Revue d'app TikTok** requise pour la production (sandbox d'abord) — goulot de calendrier connu.
- Chaque fournisseur doit volontairement autoriser eBio (pas d'automatisation possible sans son consentement).
