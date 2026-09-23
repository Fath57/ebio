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
> **— Bonjour ! Qu'est-ce qu'il vous faut ?**
>
> — Je cherche du gari avec de l'huile rouge.
>
> **— Du gari et de l'huile rouge, d'accord… Attendez, je regarde.**
>
> **— Voilà : j'ai les deux chez Mama Adjo. Son gari blanc, c'est 1 500 le kilo.**
>
> — Ça va. Il m'en faut deux kilos.
>
> **— Deux kilos, c'est noté. Et pour l'huile, elle a la bouteille d'un litre à
> 2 500. J'en mets une ?**
>
> — Oui.
>
> **— Voilà. Ça vous fait 5 500 pour l'instant. Autre chose ?**
>
> — Non, c'est bon.
>
> **— D'accord. Avec la livraison, on est à 6 500. Je vous laisse confirmer à
> l'écran.**

Ce qu'il faut lire dans cet échange :

- **Les tours sont courts.** Une idée, parfois deux. Jamais un paragraphe.
- Il **accuse réception avant de répondre** — « du gari et de l'huile rouge,
  d'accord » — comme on le fait en écoutant quelqu'un.
- Il **ne vide pas le catalogue**. Une seule boutique proposée, celle qui a les
  deux. Le reste attend qu'on le demande.
- Il **laisse parler**. Après « c'est 1 500 le kilo », il s'arrête. C'est
  l'acheteuse qui donne la quantité, il ne la lui demande pas comme un
  formulaire.
- Il **compte au fur et à mesure**, sans solennité : « ça vous fait 5 500 pour
  l'instant ».
- Il **rend la main** pour l'argent, en une phrase.

### Comparaison

La même chose, mal dite — et c'était la première rédaction de cette spec :

> *J'ai du gari chez deux boutiques : du gari blanc à 1 500 le kilo chez Mama
> Adjo, et du gari Sohui à 1 800 chez Fidjrossè Bio. Pour l'huile rouge, Mama
> Adjo a une bouteille d'un litre à 2 500 — si vous prenez tout chez elle, ça
> vous fait une seule livraison. Je vous mets ça ?*

Quatre informations, deux boutiques, trois prix et une question sans reprendre
son souffle. À lire, ça passe. À l'oreille, on décroche à la moitié — et on ne
peut pas relire.

## Comment il parle

Le ton n'est pas un vernis qu'on applique à la fin : c'est la fonctionnalité.
Un assistant qui dit des choses justes dans une langue d'automate n'est pas un
assistant dégradé, c'est une fonctionnalité ratée — personne ne parlera deux
fois à un serveur vocal.

**Ce qui fait qu'on parle comme quelqu'un :**

- **Des tours courts.** Deux phrases, rarement trois. Ce qui ne tient pas dans
  un souffle ne tient pas dans une oreille.
- **Deux ou trois choses à la fois, pas plus.** L'oreille ne revient pas en
  arrière. Une liste de cinq produits lue à voix haute est perdue d'avance.
- **On accuse réception.** « D'accord », « c'est noté », « attendez, je
  regarde ». C'est ce qui prouve qu'on écoute.
- **On dit les prix comme on les dit au marché** : « 1 500 le kilo », pas
  « 1 500 francs CFA le kilogramme ».
- **On s'arrête.** Après une proposition, on se tait. Le silence est une
  question.
- **On a le droit d'hésiter.** « Attendez… » pendant que le catalogue est
  interrogé vaut mieux qu'un blanc.

**Ce qui trahit la machine** — et qu'on ne veut pas entendre :

- énumérer en annonçant le nombre : « j'ai trois options pour vous » ;
- répéter la demande mot pour mot avant d'y répondre ;
- confirmer chaque ligne séparément comme une case à cocher ;
- dire « je vais maintenant ajouter cet article à votre panier » ;
- nommer ses propres actions : « recherche en cours », « traitement de votre
  demande » ;
- terminer chaque tour par une formule identique.

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

### US5 — Savoir où en est sa commande (priorité 1)

« Où est ma commande ? » est la question la plus posée d'une place de marché qui
livre. Aujourd'hui elle suppose d'ouvrir l'application, de trouver l'onglet, la
bonne commande, et de lire un suivi.

« Où en est ma commande ? » — l'assistant répond : la boutique a accepté, elle
prépare, le livreur est en route, il arrive. En une phrase, sans navigation.

S'il y a plusieurs commandes en cours, il demande laquelle, en les désignant par
ce qui les distingue pour l'acheteuse — la boutique, ce qu'il y a dedans — pas
par un numéro.

**Critère d'acceptation** : la réponse vient de la commande et de sa livraison
réelles, jamais d'une supposition sur le délai.

### US6 — Aller jusqu'au paiement (priorité 1)

Le panier prêt, l'assistant annonce le total, les frais de livraison et l'adresse retenue, puis **rend la main** : la confirmation du paiement se fait à l'écran.

**Critère d'acceptation** : aucun débit ne peut être déclenché par la voix seule.

## Ce que cette fonctionnalité devient

Ajouter le suivi de commande déplace le projet. Ce n'est plus « commander à la
voix » : c'est **une porte d'entrée parlée à eBio**. Passer commande en est
l'usage le plus lourd, mais pas le plus fréquent — on commande une fois, on
demande où en est la livraison trois fois.

Cela ne change rien à l'architecture : un outil de plus, branché sur des
endpoints qui existent. Mais cela change la façon de juger la fonctionnalité.
Le succès ne se mesurera pas seulement en commandes passées à la voix, mais en
**questions auxquelles on n'a plus eu à répondre à la main** — au support, ou en
naviguant.

## L'écran

L'assistant est vocal, pas aveugle. L'écran n'est pas un décor : c'est lui qui
rend la conversation digne de confiance.

**Ce qu'il montre, et pourquoi :**

- **Ce qui a été entendu**, tour par tour, écrit. C'est le plus important. La
  transcription se trompera — « deux kilos » entendu « douze » — et l'acheteuse
  doit le voir à l'instant, pas le découvrir sur la facture.
- **Ce que l'assistant a fait** : le panier se remplit sous les yeux, ligne à
  ligne, pendant qu'il parle.
- **Le total, toujours visible.** Jamais à chercher.
- **Son état, sans ambiguïté** : il écoute, il cherche, il parle. Trois états
  lisibles d'un coup d'œil. Un assistant dont on ne sait pas s'il écoute est un
  assistant qu'on interrompt au mauvais moment.

**Ce qu'il permet :**

- **Un bouton pour parler**, large, atteignable au pouce d'une seule main. On
  fait ses courses debout, souvent avec l'autre main occupée.
- **Couper la parole** : un appui l'arrête net.
- **Corriger à la main** à tout moment — retirer une ligne, changer une
  quantité — sans quitter la conversation ni recommencer.
- **Écrire au lieu de parler**, pour un mot que la transcription n'attrape pas,
  ou dans un endroit où l'on ne peut pas parler.

**Ce qu'il n'est pas.** Pas de sphère animée, pas d'onde sonore décorative, pas
d'effet. Ce qu'on attend d'un outil qu'on utilise pour acheter, c'est qu'il soit
rapide, lisible, et qu'il ne mente pas sur son état. La sobriété n'est pas ici
une préférence esthétique : chaque élément qui bouge sans rien dire est un
élément qui distrait de ce qui compte — le panier et le total.

L'écran suit la charte d'eBio comme les autres. Il n'invente ni ses couleurs ni
ses espacements.

## Exigences fonctionnelles

- **FR-001** — L'assistant comprend le français parlé, y compris les tournures et le lexique alimentaire d'usage au Bénin.
- **FR-002** — L'assistant répond **à voix haute**. Sans cela « sans toucher l'écran » est faux : l'acheteur devrait lire.
- **FR-002b** — Un tour de parole tient en deux ou trois phrases et ne porte pas plus de deux ou trois informations. Ce qui ne tient pas dans un souffle ne tient pas dans une oreille, et l'oreille ne revient pas en arrière.
- **FR-003** — **Tout produit, tout prix, toute disponibilité énoncés proviennent d'un appel à l'API.** L'assistant n'énonce jamais une information qu'il n'a pas obtenue du serveur.
- **FR-004** — Les totaux sont ceux de `POST /orders/preview`, jamais un calcul de l'assistant.
- **FR-005** — L'assistant peut ajouter, retirer et modifier des lignes du panier. Il ne peut **ni payer, ni déclencher un paiement**.
- **FR-006** — Rien n'entre dans le panier sans que l'acheteur l'ait voulu. L'accord peut couvrir plusieurs articles à la fois — « je vous mets ça ? » vaut pour ce qui vient d'être proposé — et n'a pas à être redemandé ligne à ligne. Ce qui est ajouté reste visible à l'écran : qui regarde voit le panier se construire.
- **FR-007** — L'acheteur peut interrompre et reprendre la main à tout moment ; l'écran reste pleinement utilisable pendant la conversation.
- **FR-008** — Le traitement se fait **côté serveur**. Aucune clé de fournisseur d'IA ne descend dans une application distribuée.
- **FR-009** — L'assistant dispose de l'historique des commandes de l'acheteur, et de lui seul.
- **FR-009b** — L'assistant peut lire l'état d'une commande en cours et de sa livraison. Il énonce ce que disent la commande et le suivi, **jamais une estimation de délai qu'il aurait formée lui-même**.
- **FR-011** — L'écran affiche la transcription de ce qui a été entendu, à chaque tour. C'est le seul moyen de rattraper une erreur de transcription avant qu'elle ne coûte quelque chose.
- **FR-012** — L'acheteur peut à tout moment couper la parole à l'assistant, corriger le panier à la main, ou écrire au lieu de parler.
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
