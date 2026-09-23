# Recherche technique — assistant vocal

**Statut** : à valider. Les tarifs cités viennent de ma connaissance au moment
de la rédaction et **doivent être revérifiés** avant tout engagement : ils
bougent vite, et c'est sur eux que repose l'arbitrage principal.

## La décision qui commande les autres : tour par tour, ou flux continu ?

Deux architectures existent.

**Le flux continu** (API « realtime » parole-à-parole) : le micro est ouvert,
le modèle entend et répond en continu, on peut lui couper la parole. C'est ce
qui ressemble le plus à une conversation.

**Le tour par tour** : on enregistre un tour, on le transcrit, on le donne à un
modèle avec ses outils, on synthétise la réponse. Trois étapes qu'on contrôle
chacune.

Le flux est plus naturel. On prend quand même **le tour par tour**, pour trois
raisons qui pèsent plus lourd que la fluidité :

1. **L'ancrage.** La spec impose qu'aucun prix, aucun produit ne sorte d'ailleurs
   que de notre API. En tour par tour, on voit passer chaque appel d'outil et
   chaque réponse : c'est vérifiable, testable, journalisable. En flux continu,
   le contrôle est bien plus lâche.
2. **Le coût.** Un flux parole-à-parole facture le temps d'écoute, pas seulement
   ce qui est dit. Sur un panier à 5 000 FCFA, ça ne passe pas.
3. **Le réseau.** Une session temps réel tenue sur un mobile à Cotonou est
   fragile. Un tour perdu se rejoue ; une session perdue tue la commande.

Le flux continu reste la cible du jour où le coût et le réseau le permettront.
La spec ne dépend pas de ce choix — seule la fluidité change.

## Transcription (l'oreille)

| Option | Ordre de grandeur | Ce qu'il faut savoir |
|---|---|---|
| **Reconnaissance native Android** | **gratuit** | Intégrée au téléphone, hors ligne possible. Qualité très variable selon l'appareil et le bruit. À mesurer en premier, parce que gratuit change tout. |
| **Deepgram Nova** | ~0,004 $/min | Rapide, conçu pour le flux, bon en français. |
| **Whisper** (API ou auto-hébergé) | ~0,006 $/min, ou le coût de la machine | Le plus robuste sur les accents et le bruit, parce qu'entraîné sur du monde entier. Auto-hébergé, le coût marginal tombe à zéro. |
| **Google / Azure** | comparable | Rien de décisif pour nous. |

**Ce qui décide** : la tenue sur le **français parlé au Bénin**, dans le bruit.
Aucune de ces options n'est évaluée là-dessus par ses éditeurs. À tester sur des
enregistrements réels avant de choisir — c'est la première tâche du plan.

## Le cerveau

Un modèle à **appels d'outils**, côté serveur, avec pour outils nos endpoints
existants : recherche produits, ajout au panier, aperçu de commande, historique.
L'assistant ne réimplémente aucune règle commerciale ; il appelle ce qui existe
et met en mots ce qu'on lui répond.

Ce que le choix doit satisfaire :

- **fiabilité des appels d'outils** — un modèle qui invente un argument casse le
  panier ;
- **français naturel**, à l'oral, pas à l'écrit ;
- **coût par tour**, avec un modèle léger pour l'ordinaire et un modèle plus
  fort réservé aux tours difficiles si besoin.

Un modèle de classe « légère » suffit pour l'essentiel de la conversation. C'est
l'ancrage qui fait la qualité ici, pas la puissance brute : les faits viennent
du catalogue.

## La voix

| Option | Ordre de grandeur | Ce qu'il faut savoir |
|---|---|---|
| **OpenAI TTS** | ~15 $/M caractères | Bon rapport qualité-prix, français correct. |
| **Google Cloud TTS** (voix HD) | comparable | Beaucoup de voix françaises. |
| **Cartesia** | comparable | Latence très basse, utile si on vise le flux plus tard. |
| **ElevenLabs** | nettement plus cher | La plus naturelle, de loin. À réserver si la voix devient un argument. |

Un point à trancher tôt : **une voix féminine**, si l'on assume la métaphore de
la vendeuse de marché. Ce n'est pas un détail de confort, c'est ce qui rend le
personnage crédible — ou ridicule s'il sonne comme un standard téléphonique.

## Ce que ça coûte par conversation

Hypothèse : six tours, ~50 secondes de parole de l'acheteuse, ~40 secondes de
réponse.

| Poste | Pile économique | Pile haut de gamme |
|---|---|---|
| Transcription | 0 (natif) à 0,005 $ | 0,005 $ |
| Modèle + outils | ~0,04 $ | ~0,15 $ |
| Synthèse | ~0,01 $ | ~0,10 $ |
| **Total** | **~0,05 $ ≈ 30 FCFA** | **~0,25 $ ≈ 150 FCFA** |

À rapporter à la marge, pas au panier : sur une commande de 5 500 FCFA à 10 % de
commission, eBio gagne 550 FCFA. **30 FCFA, c'est 5 % de la marge — supportable.
150 FCFA, c'est 27 % — non.**

D'où la conclusion la plus utile de cette recherche : **la pile économique
d'abord**, et on ne monte en gamme que sur ce qui se voit. Et une conversation
qui n'aboutit pas coûte quand même : le suivi devra mesurer le coût par commande
*aboutie*, pas par conversation.

## Côté application

Rien de nouveau à installer : **`expo-audio`** enregistre déjà les notes vocales
du chat, sur les trois apps. La lecture de la réponse utilise le même lecteur.

Le téléphone envoie l'audio d'un tour à notre API, reçoit l'audio de la réponse,
son texte, et l'état du panier. Le texte est affiché en même temps qu'il est
prononcé : c'est ce qui permet de suivre des yeux, de rattraper un mot mal
compris — et d'utiliser l'assistant dans un endroit où l'on ne peut pas mettre
le son.

**Aucune clé de fournisseur dans l'application.** Tout transite par l'API, qui
les détient — comme pour INTRAM.

## Ce qu'il faut mesurer avant de s'engager

1. La transcription du français parlé au Bénin, **dans le bruit**, sur de vrais
   enregistrements. C'est la mesure qui peut tuer le projet ou le rendre facile.
2. La latence d'un tour complet sur un réseau mobile réel à Cotonou.
3. Le coût réel d'une conversation aboutie, mesuré et non estimé.
4. La fiabilité des appels d'outils sur des demandes tordues : « la même chose
   que la dernière fois mais sans le savon ».
