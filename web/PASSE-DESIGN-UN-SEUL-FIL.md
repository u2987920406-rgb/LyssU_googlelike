# Passe de design — un seul fil, deux postures

> Demandée par kuchu le 2026-08-12 :
>
> *« Finalement, le mode chat, si l'on ne peut pas éditer des fichiers, faire
> des captures d'écran, créer des fichiers, les télécharger, il ne sert à rien,
> strictement à rien. Soit tu arrives à faire la même chose que dans Cowork,
> soit on le supprime. »*
>
> *« Il n'y a qu'un seul chat avec un petit sélecteur : chat/plan et
> build/verif. Discussion et plan par défaut. Une fois que le plan est établi
> et que la prochaine étape est de build, Hermès de lui-même propose un
> bouton… ce qui validerait aussi que le plan soit bon. »*
>
> Et les deux contraintes, données en même temps :
> *« il faut que ce soit intégré de manière naturelle et fluide, quasi
> invisible »* · *« il faut absolument que ça coûte le moins cher possible,
> sinon ce n'est pas viable et personne ne pourra utiliser l'app ».*

---

## 0. Constaté / supposé

**Constaté dans la source d'Hermès** (installée, lue ligne à ligne) :

| fait | où |
|---|---|
| `_APPROVAL_MODES = {"manual", "smart", "off"}` | `tui_gateway/server.py:3983` |
| `approval.request` **est émis vers le client**, `approval.respond` y répond | `server.py:1845` · RPC exposée |
| 61 familles d'outils, dont 27 configurables | `hermes_cli/tools_config.py:96` |
| `session.create` accepte `model`, `reasoning_effort`, `cwd`, `profile` **par session** | `methods_session.py:14` |
| il n'accepte **ni toolsets ni mode d'approbation** | vérifié : aucune occurrence |
| `_apply_toolset_change(cfg, "cli", …)` écrit la **config globale** | `tools_config.py:5312` |
| **aucun événement `plan.*`** n'est émis — mais l'outil `todo` renvoie la liste complète, `{id, content, status}`, par `tool.complete` | `tools/todo_tool.py` · 60 `_emit(...)` relevés |

**Constaté par la mesure**, session créée puis `session.context_breakdown`
sur l'installation de kuchu, **avant le premier mot de conversation** :

| poste | tokens |
|---|---|
| System prompt | 7 189 |
| **Tool definitions** | **19 359** |
| Rules | 495 |
| Subagent definitions | 1 120 |
| Memory | 929 |
| **Total du préfixe** | **29 092** — 11 % d'une fenêtre de 262 144 |

56 outils actifs répartis sur 19 familles, dont `browser` (13),
`kanban` (12), `bfl` (6), `computer_use`, `cronjob`, `image_gen`, `tts`,
`delegation`.

**Supposé, et assumé comme tel** : qu'une famille désactivée retire bien son
poids du préfixe. C'est ce que dit `get_tool_definitions(enabled_toolsets=…)`,
mais **je ne l'ai pas mesuré** — le vérifier exige d'écrire dans la config
globale de kuchu, ce que je ne fais pas sans son accord. Voir §9.

---

## 1. Le fond : un sélecteur ne choisit pas un moteur

Aujourd'hui `Chat | Cowork` choisit **par où passe la requête** — le proxy nu
ou la gateway. C'est un détail d'implémentation promu au rang de décision
utilisateur. Personne ne veut choisir un transport.

Et ce choix emporte, sans le dire, la perte de **tout** : lire un fichier,
en écrire un, lancer une commande. D'où le constat de kuchu — un mode qui ne
peut rien faire ne sert à rien. Nous avons passé la nuit à lui rendre le
collage d'images, les livrables et le volet : **nous reconstruisions Cowork en
moins bien.**

> **Le sélecteur ne doit pas choisir un moteur. Il doit choisir ce que l'agent
> a le droit de MODIFIER.** Lire, chercher, produire, montrer : toujours.
> Écrire dans le projet : seulement quand on l'a dit.

Un seul moteur, donc : **Hermès, dans les deux positions.**

---

## 2. ⚠ La contrainte qui commande tout le reste

29 092 tokens partent **avant** le premier mot. Sur une conversation de vingt
messages, c'est 580 000 tokens de préfixe si rien n'est mis en cache.

**Le cache de prompt ne tient que si le préfixe est identique d'un appel à
l'autre.** Le préfixe, c'est le system prompt **et les définitions d'outils**.

D'où la conséquence, et elle décide de toute l'architecture :

> **Changer de mode ne doit RIEN changer au préfixe.** Un sélecteur qui
> réécrirait la liste des outils invaliderait le cache **à chaque bascule** —
> et rendrait le produit exactement aussi cher que ce que kuchu refuse.

Trois choses en découlent, et aucune n'est négociable :

1. **Le mode ne touche pas aux toolsets.** Ils sont réglés **une fois**, pour
   de bon (§9).
2. **Le mode ne touche pas au system prompt.** Il n'y est pas écrit.
3. **Le mode est dit dans le TOUR DE L'UTILISATEUR**, en une ligne. Un tour
   utilisateur vient *après* le préfixe : il ne casse aucun cache. Coût
   mesurable : une quinzaine de tokens par message.

Et l'application du mode, elle, **ne coûte rien du tout** : elle est
client-side, à la porte d'approbation (§3).

> Ce serait plus simple d'écrire « tu es en mode plan » dans le system prompt.
> C'est précisément ce qu'il ne faut pas faire : la simplicité y est payée en
> cache invalidé, c'est-à-dire en argent, à chaque bascule.

---

## 3. Ce que chaque posture autorise

Deux positions. **« Vérif » n'est pas un cran** — c'est la fin automatique du
build, décidée par kuchu : *« ça sert à la vérification du code, du bon
fonctionnement et du respect du plan »*. Elle s'affiche comme une **phase**,
pas comme un choix.

| | **Discussion / Plan** *(défaut)* | **Build → Vérif** |
|---|---|---|
| discuter, coller une capture | ✅ | ✅ |
| lire un fichier, chercher | ✅ | ✅ |
| produire un livrable, le voir, l'emporter | ✅ | ✅ |
| **écrire dans le projet** (`write_file`, `patch`) | ⛔ **refusé** | ✅ |
| **lancer une commande** (`terminal`, `execute_code`) | ⛔ **refusé** | ✅ |

### Comment le refus est appliqué — sans un token

`approvals.mode = manual` côté Hermès. Quand l'agent demande à écrire, la
gateway émet `approval.request`. En Discussion/Plan, **Ulysse répond `non`
tout seul**, avec le motif, et l'affiche dans le fil :

> *« Refusé : on est en Discussion/Plan. Passez en Build pour l'autoriser. »*

C'est un refus **structurel**, pas une consigne. Le cadre le dit aussi à
l'agent (§2.3) pour qu'il n'essaie pas — mais si le modèle l'oublie, **la
porte tient quand même.** Une garantie qui repose sur la bonne volonté du
modèle n'est pas une garantie.

> ⚠ **Ce que ça coûte quand même** : un outil tenté puis refusé a déjà été
> écrit par le modèle, donc facturé. La ligne de cadre est là pour que ça
> n'arrive presque jamais ; la porte est là pour le cas où ça arrive.

---

## 4. Le passage d'un mode à l'autre

### Ce que kuchu demande

*« Hermès de lui-même propose, en affichant un bouton sur lequel l'utilisateur
appuierait, ce qui validerait aussi que le plan soit bon. »*

**Le bouton vaut deux choses à la fois** : *« ce plan me va »* et *« lance
le build »*. C'est juste — la validation d'un plan n'a pas d'existence
séparée, elle se prouve en passant à la suite.

### Le signal existe, et il est structuré

Il n'y a **aucun événement dédié** — j'ai relevé les 60 `_emit(...)` du
serveur, rien pour un plan. Mais ce n'était pas là qu'il fallait chercher.

**`tools/todo_tool.py`** — la famille `todo` est active — tient une liste de
tâches ordonnée, une par session, et **chaque appel renvoie la liste
complète** :

```
{ id, content, status }      status ∈ pending | in_progress | completed | cancelled
```

Elle arrive par `tool.complete`, dans le résultat, en JSON. **C'est un signal
lisible, pas une devinette** — et il en dit plus qu'un simple « un plan
existe » :

| ce qu'Ulysse lit | ce que ça veut dire |
|---|---|
| des items, **tous `pending`** | l'agent a posé les étapes, il n'a rien commencé → **le plan est prêt** |
| au moins un `in_progress` / `completed` | le travail a démarré → pas de bouton, on n'est plus à valider |
| liste vide, ou pas d'appel `todo` | pas de plan → pas de bouton |

**Donc, et c'est mieux que ce que j'avais écrit** : Ulysse n'a pas à deviner.
Il affiche **le plan lui-même** — les étapes, dans l'ordre, telles que l'agent
les a écrites — et **le bouton dessous** :

```
 ┃┌────────────────────────────────────────────┐
 ┃│  ▤  Plan proposé — 4 étapes                │
 ┃├────────────────────────────────────────────┤
 ┃│  1. Retirer le chemin `pur` de surFichiers │
 ┃│  2. Brancher la porte d'approbation        │
 ┃│  3. Remplacer le sélecteur par la mention  │
 ┃│  4. Rejouer le banc et les mutations       │
 ┃├────────────────────────────────────────────┤
 ┃│            [ Build and Vérif ›  ]          │
 ┃└────────────────────────────────────────────┘
```

**Appuyer vaut les deux choses à la fois** : *« ce plan me va »* et *« lance
le codage »*. Ce sont les étapes affichées qu'on valide — pas une intention
qu'il aurait fallu croire sur parole.

> **On ne devine JAMAIS un plan dans le texte.** Compter des puces ou chercher
> « étape 1 » ferait apparaître le bouton sur une réponse qui énumère trois
> restaurants. Le signal est `todo` ou rien. Un bouton qui se propose à tort
> apprend à ne plus le lire — c'est exactement ce qui vient d'arriver au ⤓.

**Le repli reste, et il n'est pas honteux** : la mention du composeur bascule à
la main. Si l'agent n'a pas structuré son plan, on part quand même. Le bouton
est un raccourci quand le signal est là, **jamais le seul chemin**.

---

## 5. « Quasi invisible » — où ça se voit, et où ça ne se voit pas

C'est la deuxième contrainte, et elle est plus dure que la première.

**Au repos, le mode est un mot.** Pas un segmented control de 120 px sous le
composeur comme aujourd'hui : **une mention discrète dans le composeur**, à
gauche du champ, qui dit où l'on est — `Plan` — et qui s'ouvre au clic sur les
deux positions. Ce que l'on regarde en écrivant, c'est ce qu'on écrit.

**Il devient visible aux trois seuls moments où il compte :**

1. **quand l'agent propose de basculer** — le bouton, sous sa réponse ;
2. **quand un refus tombe** — la ligne dans le fil dit le mode et comment en
   sortir. Un refus qui ne nomme pas sa cause est un mur ;
3. **pendant le build** — la mention passe à `Build`, puis à `Vérif` quand la
   phase de contrôle démarre. C'est là qu'on veut savoir, sans demander.

> **Le mode se lit, il ne s'opère pas.** On le change deux fois par heure au
> plus. Ce qui doit rester sous la main, c'est le champ de saisie.

---

## 6. Ce que ça supprime

Le chemin `pur` **disparaît en entier** :

- `sendPure()` et son contenu multimodal OpenAI ;
- `/proxy/chat` côté `serve.py`, et `PROXY_MODEL` ;
- `PROXY_MAX_TOKENS` **et l'avis de troncature `.u-coupe`** — construits cette
  nuit, et déjà sans objet ;
- le traitement d'image en double dans `surFichiers()` : la branche
  `mode === "pur"` qui garde le `dataUrl` en local plutôt que d'appeler
  `attacherFichier()` ;
- le refus « pas de fichier non-image en Discussion » ;
- `pannePhrase` garde ses cas, mais **le message « passez en Discussion, elle
  n'a pas besoin de ce lien » devient faux** : sans lien, il n'y a plus rien.
  Il doit dire quoi faire, pas où fuir.

C'est **du code en moins**, et une classe entière de divergences en moins :
il n'y aura plus « ça marche en Cowork mais pas en Chat ».

---

## 7. Ce que je ne propose pas

- **Un troisième cran « Vérif ».** kuchu a tranché : c'est la fin du build.
  Un cran de plus serait un choix qu'on n'a pas à faire.
- **Basculer en Build automatiquement** quand l'agent le propose. Le bouton
  existe pour être *appuyé* — c'est là qu'est la validation du plan. Un
  passage automatique validerait un plan que personne n'a lu.
- **Changer les toolsets selon le mode.** §2 : ça casse le cache. C'est la
  proposition qui semble la plus naturelle et c'est la plus chère.
- **Écrire le mode dans le system prompt.** Même raison.
- **Garder le mode pur « au cas où ».** Deux chemins pour un même geste, c'est
  ce que ce projet retire partout.

---

## 8. Contrat d'interface

**Change de sens** : `mode` ne vaut plus `"pur" | "cowork"` mais
`"plan" | "build"`. C'est **la même variable avec un autre domaine** — tout ce
qui la teste est à relire, pas à renommer.

**Disparaissent** : le bouton `Chat`/`Cowork` du composeur, `sendPure`,
`CFG.PROXY_MODEL`, `CFG.PROXY_MAX_TOKENS`, `.u-coupe`.

**Nouveaux** : `#modeMention` (la mention dans le composeur), `.m-plan`
(l'encart du plan proposé) et `.m-etape` (une ligne du plan), `.m-bascule`
(le bouton « Build and Vérif »), `.m-refus` (la ligne de refus dans le fil).

### Par quel geste on atteint chaque état

| État | Geste |
|---|---|
| Plan (défaut) | ouvrir l'app |
| Refus d'écriture affiché | en Plan, demander d'écrire un fichier |
| **Plan affiché + bouton** | en Plan, demander un plan — l'agent appelle `todo`, tous les items `pending` |
| Plan affiché **sans** bouton | l'agent a déjà commencé : un item `in_progress` ou `completed` |
| Build | appuyer sur « Build and Vérif », ou changer la mention |
| Vérif | attendre la fin d'un build — la phase suit |
| Retour en Plan | changer la mention |

---

## 9. Le préfixe raccourci — FAIT, et mesuré

> **Tranché par kuchu le 2026-08-12** : *« je pense que des préfixes courts
> pour de bon est meilleur, car plusieurs cerveaux/modèles pourront être
> amenés à être remplacés. Vas-y, touche et mesure. »*
>
> L'argument est le bon, et il vaut mieux que le mien : **un préfixe stable
> protège un modèle, un préfixe court les protège tous.** Le cache dépend du
> fournisseur ; la longueur, non.

Huit familles retirées par `tools.configure` — `bfl`, `browser`,
`computer_use`, `cronjob`, `delegation`, `image_gen`, `tts`, `session_search`.
**56 outils → 31.**

| poste | avant | après | |
|---|---|---|---|
| System prompt | 7 189 | 5 818 | −19 % |
| **Tool definitions** | **19 359** | **7 825** | **−60 %** |
| Rules | 495 | 495 | — |
| Subagent definitions | 1 120 | **0** | parties avec `delegation` |
| Memory | 929 | 929 | — |
| **Préfixe total** | **29 092** | **15 067** | **−48 %** |

Le system prompt maigrit aussi : la consigne d'usage du navigateur et de la
synthèse vocale en faisait partie.

**Réversible d'un geste** : `config.yaml.avant-elagage-2026-08-12`, dans
`HERMES_HOME`. Ou `tools.configure` avec `action: "enable"`.

### Le levier qui reste, et pourquoi je ne l'ai pas tiré

**`kanban` pèse 12 des 31 outils restants** — plus du tiers. Mais il n'est pas
dans `CONFIGURABLE_TOOLSETS` : c'est une fonctionnalité de la gateway
(tableaux, pièces jointes, dispatcher), réglée par la clé `kanban` de la
config. La retirer **désactiverait une fonction du TUI**, pas seulement des
schémas envoyés au modèle. Ce n'est plus de l'élagage, c'est une amputation —
et elle demande un accord explicite.

Même remarque, plus petite, pour `skills` (3 outils) : le fichier
`.skills_prompt_snapshot.json` fait **68 ko**. Une partie du system prompt
part probablement de là. À mesurer.

### Ce qui reste vrai quoi qu'on fasse

Le modèle mesuré est `tencent/hy3:free`. Ulysse **ne choisit pas le cerveau**
(`LOI-DU-CERVEAU.md`) — mais il doit **montrer ce que la conversation coûte**,
pour que le choix se fasse en connaissance de cause. `session.usage` et
`usage.bars` existent déjà.
