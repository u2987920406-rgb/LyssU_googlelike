# La loi du cerveau

*Posée par kuchu le 2026-08-10. Elle vaut pour tout le produit, et elle n'a
qu'une phrase.*

---

## La règle

> **Ulysse ne choisit jamais le fournisseur ni le modèle. Il hérite de celui
> d'Hermès, quel qu'il soit.**

Peu importe lequel — HY3, Fullside, Laguna, Anthropic, autre chose demain.
**Ulysse n'a pas à le savoir.** C'est le portail d'Hermès qui le décide, et
Ulysse le reflète.

### La seule exception

**Ollama, ou tout autre repli local** — et c'est une exception *apparente*. Le
basculement se fait **chez Hermès**, pas dans Ulysse. Ulysse suivra sans qu'on
lui dise, parce qu'il n'imposait rien.

C'est la propriété qui rend la règle utile : **une règle qui n'impose rien n'a
rien à défaire.**

---

## Pourquoi

Trois raisons, dans l'ordre de gravité.

**1. La clé vit à un seul endroit.** C'est déjà écrit dans l'écran de premier
lancement, repris de la maquette : *« L'installation l'a connecté chez Hermès.
Sa clé reste là-bas, à un seul endroit — je ne la copie nulle part. »* Un
fournisseur choisi dans Ulysse serait une seconde source de vérité, donc une
seconde chose à tenir à jour, donc une occasion de divergence.

**2. Ulysse est une fenêtre.** Il montre ce qu'Hermès fait. S'il impose un
modèle, il cesse d'être une fenêtre et devient un intermédiaire — et un
intermédiaire qu'on n'a pas demandé.

**3. On ne peut pas afficher honnêtement ce qu'on décide soi-même.** L'écran
« Le cerveau » dit *« Modèle en cours : celui que la session vivante utilise
réellement »*. Cette phrase n'est vraie que si Ulysse n'a rien imposé.

---

## Où en est le produit

**Cowork respecte la règle.** `SESSION_MODEL` vaut `""`, et le core ne le pose
que s'il est rempli :

```js
if (CFG.SESSION_MODEL && !params.model) params.model = CFG.SESSION_MODEL;
```

Vide par défaut, donc **rien n'est imposé** : Hermès décide. C'est exactement
la règle, et elle était déjà là.

**Le mode Discussion ne la respecte pas.** `PROXY_MODEL` vaut
`"tencent/hy3:free"`, **écrit en dur** dans `ulysse-config.js`, et posé à
chaque appel :

```js
body: { model: CFG.PROXY_MODEL, messages, max_tokens: CFG.PROXY_MAX_TOKENS }
```

C'est un fournisseur choisi par Ulysse. **C'est ce que la règle interdit.**

> Nuance à ne pas perdre : le proxy est un **service séparé**, lancé avec son
> propre fournisseur (`hermes proxy start --provider …`). `PROXY_MODEL` ne
> choisit donc pas le fournisseur — il choisit le **modèle** qu'on lui demande.
> C'est une imposition plus étroite, mais c'en est une.

---

## Ce qu'il faut vérifier avant de corriger

**Le proxy accepte-t-il une requête sans `model` ?**

- **Si oui** — retirer `model` du corps, et laisser le proxy servir son défaut.
  La règle est respectée en une ligne de moins.
- **Si non** — demander au proxy la liste de ses modèles (`GET /v1/models`, si
  elle existe) et prendre le premier, ou celui qu'il annonce par défaut.
  `PROXY_MODEL` devient alors un **repli**, pas un choix.

Dans les deux cas, `PROXY_MODEL` cesse d'être une décision d'Ulysse.

> **Constaté** : les deux comportements ci-dessus, dans le code.
> **Supposé** : ce que le proxy accepte. Je ne l'ai pas vérifié.

---

## Ce que ça change à l'écran

Peu, et c'est le signe que la règle est bonne.

`Réglages › Le cerveau` dit déjà *« Vide = celui du profil Hermès »* pour la
session. La ligne du mode Discussion devrait dire la même chose — aujourd'hui
elle affiche un modèle en dur, comme si c'était un réglage d'Ulysse.

**Et une ligne à ajouter, une fois la règle tenue :**

> Le fournisseur est celui de votre installation d'Hermès. Pour en changer —
> Ollama en local, par exemple — c'est là-bas que ça se règle, et Ulysse
> suivra.

C'est la phrase qui rend la règle visible sans la faire ressembler à un
réglage manquant.
