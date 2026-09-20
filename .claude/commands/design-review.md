---
description: Revue de design des changements front-end de la branche courante, dans un vrai navigateur
allowed-tools: Read, Grep, Glob, Bash, TodoWrite, Agent, Task, ToolSearch
argument-hint: [écran ou URL à revoir, optionnel]
---

Revue de design des changements en cours sur eBio.

CIBLE DEMANDÉE : $ARGUMENTS

ÉTAT GIT :

```
!`git status --short`
```

FICHIERS MODIFIÉS :

```
!`git diff --name-only origin/HEAD... 2>/dev/null || git diff --name-only`
```

COMMITS :

```
!`git log --no-decorate --oneline origin/HEAD... 2>/dev/null | head -20`
```

DIFF :

```
!`git diff --merge-base origin/HEAD 2>/dev/null || git diff`
```

SERVEURS DE DÉVELOPPEMENT :

```
!`for p in 5174 5175 3010 3000; do printf "%s: " $p; curl -s -o /dev/null -w "%{http_code}\n" --max-time 2 http://localhost:$p/ 2>/dev/null || echo "éteint"; done`
```

OBJECTIF :

Délègue la revue au sous-agent `design-review` — outil `Agent` (nommé `Task`
sur certaines versions), avec `subagent_type: "design-review"`. Transmets-lui
dans son prompt :

1. le diff ci-dessus et les fichiers touchés ;
2. la cible demandée si l'utilisateur en a donné une, sinon les écrans que le
   diff laisse deviner ;
3. les ports qui répondent réellement — landing 5175, web-spa 5174, API 3010
   (voir `API_PORT` dans `apps/api/.env`).

Si aucun serveur front ne répond, ne lance pas l'agent : dis-le à l'utilisateur
et propose de démarrer `pnpm dev` dans l'application concernée. Une revue de
design sans navigateur n'est qu'une relecture de diff, et elle ne doit pas être
présentée comme autre chose.

Si le diff ne touche que `apps/mobile`, préviens que le navigateur ne peut rien
ouvrir : la revue se fait alors sur captures de l'appareil, avec la même grille
(`.claude/context/design-principles.md`).

Ta réponse finale est le rapport de l'agent, et rien d'autre.
