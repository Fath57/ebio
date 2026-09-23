# Feature Specification: Commander à la voix, comme au marché

**Feature Branch**: `008-assistant-vocal`
**Created**: 2026-09-23
**Status**: Draft
**Input**: User description: « Faire une commande sans même toucher l'écran. Un assistant IA naturel, en français, qui se comporte comme une personne physique dans le marché. »

## Vue d'ensemble

Commander sur eBio suppose aujourd'hui de savoir lire, écrire et naviguer : chercher un produit au clavier, comparer des fiches, remplir une adresse, choisir un créneau. Pour une partie des acheteurs visés — au Bénin, sur un marché alimentaire — chacune de ces étapes est un filtre. On perd des gens qui savent parfaitement ce qu'ils veulent acheter.

Or il existe déjà une interface que tout le monde maîtrise : **parler à la vendeuse**. Elle ne récite pas un catalogue. Elle salue, elle demande ce qu'il faut aujourd'hui, elle dit ce qui est arrivé ce matin, elle propose autre chose quand il n'y a plus, elle annonce le prix à voix haute, et elle assemble le panier au fil de l'échange. La conversation *est* l'interface.

Cette fonctionnalité porte cette interface-là dans l'application : un assistant à qui l'on parle en français et qui compose une commande réelle, ancrée dans le catalogue réel, sans qu'on ait à toucher l'écran pour autre chose que confirmer le paiement.

Ce n'est pas un moteur de recherche à commande vocale. La différence tient à ce qu'une vendeuse fait et qu'un champ de recherche ne fait pas : se souvenir, suggérer, substituer, et compter à voix haute.

## Ce qui existe déjà et qu'on réutilise

L'application n'est pas vierge sur ce terrain :

- **`expo-audio`** est installé et éprouvé : les notes vocales du chat enregistrent et rejouent déjà sur les trois apps.
- **Les produits savent parler** : `products.voice_description_url` existe depuis l'origine. Le catalogue a été pensé pour être écouté.
- **Le panier vit côté serveur** : `POST /orders/preview` calcule les totaux, les promotions et les frais de livraison. L'assistant n'a donc aucune règle commerciale à réimplémenter — il appelle ce qui existe.
- **L'historique est là** : les commandes passées permettent le « comme d'habitude ? » d'une vendeuse qui vous reconnaît.

## Conversation de référence

Ce dialogue est la cible. Tout ce qui suit — exigences, arbitrages — n'existe que
pour le rendre possible.

> *(l'acheteuse ouvre l'assistant)*
>
> **— Bonjour ! Qu'est-ce qu'il vous faut aujourd'hui ?**
>
> — Je cherche du gari avec de l'huile rouge.
>
> **— J'ai du gari chez deux boutiques : du gari blanc à 1 500 le kilo chez Mama
> Adjo, et du gari Sohui à 1 800 chez Fidjrossè Bio. Pour l'huile rouge, Mama
> Adjo a une bouteille d'un litre à 2 500 — si vous prenez tout chez elle, ça
> vous fait une seule livraison. Je vous mets ça ?**
>
> — Oui, deux kilos de gari et une bouteille.
>
> **— C'est noté : deux kilos de gari blanc et une bouteille d'huile rouge, chez
> Mama Adjo. Ça fait 5 500. Il vous faut autre chose ?**
>
> — Non, c'est tout.
>
> **— Très bien. Avec la livraison à Fidjrossè, on arrive à 6 500. Je vous laisse
> confirmer le paiement à l'écran.**

Ce qu'il faut lire dans cet échange :

- L'assistant **oriente** au lieu d'énumérer. Il ne récite pas un catalogue, il
  propose ce qui va ensemble et dit pourquoi.
- Il **remarque** ce qu'une vendeuse remarquerait : deux produits chez la même
  boutique, c'est une livraison au lieu de deux. Le panier unifié rend cette
  remarque vraie, donc utile.
- Il **demande avant de mettre dans le sac**, une fois, naturellement — pas à
  chaque ligne, pas sous forme de case à cocher.
- Il **compte à voix haute**, au fur et à mesure et à la fin.
- Il **rend la main** pour l'argent, sans cérémonie.

## Registre

L'assistant **vouvoie**, toujours. Décidé, pas à redébattre au moment d'écrire
l'invite : c'est le genre de détail qui dérive silencieusement d'une version à
l'autre et finit par rendre le personnage incohérent.

Vouvoyer ne l'empêche pas d'être familier de ton — « je vous mets ça ? » est du
vouvoiement de marché, pas du vouvoiement administratif.

## Naturel n'est pas flou

Une exigence de cette spec pourrait passer pour une contrainte de rigidité :
l'assistant n'énonce aucun produit, aucun prix, aucune disponibilité qu'il n'a
pas obtenus du serveur. Ce n'en est pas une.

La liberté porte sur **la façon de parler** : l'ordre des propositions, le
choix de ce qu'on met en avant, le ton, les raccourcis, le fait de grouper deux
articles en une phrase plutôt qu'en deux. Elle ne porte pas sur **les faits** :
qu'un gari existe, qu'il coûte 1 500, qu'il en reste. Une vendeuse improvise ses
phrases, jamais ses prix.

C'est précisément ce qui sépare un assistant crédible d'un assistant dangereux :
le premier est libre de sa langue et tenu par le catalogue.

## Parcours utilisateur

### US1 — Dicter un panier (priorité 1)

Une acheteuse ouvre l'assistant et dit : « Bonjour, il me faut deux kilos de tomates, du gari et une bouteille d'huile rouge. » L'assistant cherche chacun des trois dans le catalogue, annonce ce qu'il a trouvé avec son prix et sa boutique, et les ajoute au panier. Il termine en récapitulant le total à voix haute.

**Critère d'acceptation** : les trois produits ajoutés existent, sont en stock, et leurs prix sont ceux du serveur.

### US2 — Être compris quand c'est imprécis (priorité 1)

« Du riz » ne désigne pas un produit mais une famille. L'assistant ne tranche pas à la place de l'acheteuse et ne lui récite pas non plus un inventaire : il met en avant ce qui a du sens — le plus proche de ce qui a été demandé, ce qui est en stock, ce qui vient d'une boutique déjà dans le panier — et propose.

**Critère d'acceptation** : aucune demande ambiguë n'aboutit à un ajout silencieux.

### US3 — Se voir proposer autre chose (priorité 2)

Le produit demandé est en rupture, ou la boutique est fermée. L'assistant le dit et propose un équivalent disponible, sans le substituer d'autorité.

**Critère d'acceptation** : une rupture est annoncée, jamais contournée en silence.

### US4 — Reprendre ses habitudes (priorité 2)

« Comme la dernière fois » reconstitue le panier de la commande précédente, article par article, en signalant ce qui n'est plus disponible et à quel prix les choses ont changé.

**Critère d'acceptation** : l'assistant énonce les écarts avec la commande de référence avant de valider.

### US5 — Aller jusqu'au paiement (priorité 1)

Le panier prêt, l'assistant annonce le total, les frais de livraison et l'adresse retenue, puis **rend la main** : la confirmation du paiement se fait à l'écran.

**Critère d'acceptation** : aucun débit ne peut être déclenché par la voix seule.

## Exigences fonctionnelles

- **FR-001** — L'assistant comprend le français parlé, y compris les tournures et le lexique alimentaire d'usage au Bénin.
- **FR-002** — L'assistant répond **à voix haute**. Sans cela « sans toucher l'écran » est faux : l'acheteur devrait lire.
- **FR-003** — **Tout produit, tout prix, toute disponibilité énoncés proviennent d'un appel à l'API.** L'assistant n'énonce jamais une information qu'il n'a pas obtenue du serveur.
- **FR-004** — Les totaux sont ceux de `POST /orders/preview`, jamais un calcul de l'assistant.
- **FR-005** — L'assistant peut ajouter, retirer et modifier des lignes du panier. Il ne peut **ni payer, ni déclencher un paiement**.
- **FR-006** — Rien n'entre dans le panier sans que l'acheteur l'ait voulu. L'accord peut couvrir plusieurs articles à la fois — « je vous mets ça ? » vaut pour ce qui vient d'être proposé — et n'a pas à être redemandé ligne à ligne. Ce qui est ajouté reste visible à l'écran : qui regarde voit le panier se construire.
- **FR-007** — L'acheteur peut interrompre et reprendre la main à tout moment ; l'écran reste pleinement utilisable pendant la conversation.
- **FR-008** — Le traitement se fait **côté serveur**. Aucune clé de fournisseur d'IA ne descend dans une application distribuée.
- **FR-009** — L'assistant dispose de l'historique des commandes de l'acheteur, et de lui seul.
- **FR-010** — Une conversation sans réseau échoue proprement et dit pourquoi ; elle ne laisse pas un panier à moitié construit.

## Hors périmètre

- Les langues autres que le français — fon, yoruba, dendi. C'est un autre projet : la transcription générique n'y est pas mûre, et il faudrait un dialogue contraint plutôt qu'une dictée libre.
- Le paiement à la voix.
- L'assistant côté boutique ou livreur.
- La négociation du prix : les prix sont fixes sur eBio.

## Risques, et ce qu'ils imposent

**L'invention.** Un assistant qui hallucine un produit ou un prix sur une place de marché détruit la confiance en une seule fois, et engage le vendeur sur un prix qu'il n'a pas fixé. D'où FR-003 et FR-004 : le modèle formule, il n'invente pas le contenu. C'est une contrainte d'architecture, pas une consigne de rédaction.

**Le coût par commande.** Un panier de 2 000 FCFA ne peut pas porter 200 FCFA d'IA. Le coût par conversation doit être mesuré avant de généraliser, et l'assistant reste **un chemin parmi d'autres**, jamais le seul.

**La latence.** Sur un réseau mobile à Cotonou, une réponse qui met cinq secondes casse l'illusion de la conversation. À mesurer sur le terrain, pas en local.

**Le bruit.** Un marché est bruyant. La qualité de transcription doit être éprouvée en conditions réelles avant toute promesse.

**L'accent.** Le français parlé au Bénin n'est pas celui sur lequel ces modèles sont évalués. À mesurer, jamais à supposer.

## Questions ouvertes

- Quel fournisseur pour la transcription et la synthèse, et à quel coût par minute ?
- Conversation en flux continu, ou tour par tour ? Le flux est plus naturel mais plus cher et plus fragile.
- L'assistant est-il proposé à tous, ou d'abord à un groupe restreint le temps de mesurer coût et qualité ?
