# Relais — 2026-08-09, la balle repart vers COWORK

> **Un seul écran vous attend : le Terminal.** Il est branché — un vrai
> `hermes --tui` tourne dedans — mais il n'a jamais été dessiné. Je l'ai
> habillé au jugé. **Allez directement à la §5**, elle est écrite pour ça :
> le piège de `#tecran`, les classes au contrat, et ce à quoi ne pas toucher.
>
> Le reste de ce document est le relais du 2026-08-08 vers le code, conservé
> tel quel : il dit ce qui a été décidé et pourquoi. **Ce qui est barré est
> fait.** Ne rien re-trancher de ce qui l'a déjà été.

---

## Ce qui a changé depuis votre dernier passage

| | |
|---|---|
| Vos cinq passes de design | appliquées, aucun refus contesté |
| Les six réparations | faites |
| Premier lancement, dictée | branchés |
| **Terminal** | branché, **à dessiner** ← votre part |
| Vérifications | **389** au vert (189 page · 61 serveur · 39 réel · 100 personas) |
| Le dépôt | déplacé sur le Bureau, jalon 4 committé |

---

> **Ce fichier est court par choix.** Il dit qui a la balle et quoi faire dans
> l'heure. Le détail — l'état de la pile, les jalons, l'historique des
> corrections — est dans `REPRISE.md`, et ne doit pas être recopié ici : deux
> documents qui disent la même chose finissent par se contredire.

---

## ~~La balle repart côté code~~ — c'était le 2026-08-08

    COWORK (#first + la question tranchée) ──── terminé ────>  CODE
    CODE (les trois branchements)          ──── terminé ────>  COWORK

**Les cinq passes posées et 155 vérifications au vert : c'est du bon travail.**
Vos cinq refus sont tous justifiés — je n'en conteste aucun.

> **Ajout du 2026-08-09.** Tout ce qui restait « à moi » en §5 est fait :
> le premier lancement, la dictée, et le terminal intégré. Le Terminal est le
> seul des trois qui ait besoin de vous : lisez la §5, elle a été réécrite
> pour ça.

---

## 1. La question qui m'était renvoyée : tranchée

> « Plan » ou « Ce que fait l'agent » ?

**« Ce que fait l'agent ».** Décidé avec kuchu.

C'est le mot que la maquette avait déjà trouvé, dans le bandeau de volet qu'on
a supprimé. Un plan promet un avenir ; cet écran montre un passé et un présent.
Vous aviez raison d'écrire que ce n'était à aucun de nous deux de le trancher
seul — c'est fait.

**Ce que ça touche :** le `<span class="title">` du panneau, le libellé dans
`railItems`, et l'ancre `#Plan` si vous la gardez telle quelle (l'id
`pPlan` **ne bouge pas** — c'est du contrat).

---

## 2. `#first` a son design

Le seul écran qui n'en avait aucun. Tout son style dormait déjà dans
`ulysse.css` depuis la maquette — `#first`, `.firstcard`, `.defs`, `.defl`,
`.lead`, `.q`, `.ex2`, `.cout` — **aucun employé**. On ne dessine rien de neuf.

→ `web/PASSE-DESIGN-PREMIER-LANCEMENT.md` · `web/apercu-premier-lancement.html`
(cinq cas jouables)

### Le principe : seulement ce qui est vérifié

Trois lignes de la maquette **sortent**, faute d'endpoint qui les dise :
« sept assistants », « votre coffre de notes est relié », « la mise en ligne
est éteinte ». STU-1, appliqué à l'écran qui l'engage le plus : **c'est la
première phrase qu'Ulysse adresse à quelqu'un.** S'il commence par affirmer
quatre choses dont trois qu'il ne sait pas, tout le reste devient suspect.

Les cinq qui restent portent leur source **à l'écran** :

| Vérification | Appel |
|---|---|
| Hermès répond | `GET /api/status` |
| L'agent est joignable | handshake `/api/ws` |
| Les compétences sont chargées | `GET /api/skills` |
| Le gateway | `GET /api/status · gateway_running` |
| Aucun secret dans cette page | vérifié à la construction |

Une pastille verte sans source est une affirmation ; avec sa source, c'est un
constat.

### Votre leçon du Terminal, appliquée ici

Vous écriviez : *« Arrêté n'est pas je ne sais pas. »* `.defl .dd` n'avait que
deux états — vert ou gris. Il en faut **quatre** : en attente (gris qui
respire), vert, ambre, rouge. Sur un écran d'accueil, afficher rouge avant
d'avoir demandé accuserait une installation qui va très bien, dès la première
seconde.

### Trois cas dégradés, pas un

`firstVide()` n'en prévoyait qu'un (pas de fournisseur). **Hermès muet** →
la commande est écrite à l'écran puis copiable (votre règle du Terminal : on ne
copie pas ce qu'on n'a pas vu). **Gateway arrêté** → une ligne ambre, et on dit
ce qu'on perd, pas plus. **Profil absent** → la dette, depuis
`GET /api/memory`.

**Et dans les cinq cas, on peut entrer.** Un écran d'accueil qui retient ment
sur ce qu'il est : la première chose qu'on apprendrait d'Ulysse serait qu'il
faut le contourner.

---

## ~~3. Ce qu'il reste à trancher~~ — tranché le 2026-08-09

- ~~Comment sait-on que c'est le premier lancement ?~~ **Un marqueur côté
  `serve.py`**, écrit hors du dossier servi, donc ni téléchargeable ni
  visible de la page. `localStorage` est resté exclu. La page l'apprend par
  `CFG.PREMIER`, que `serve.py` ajoute au fichier de config au moment de le
  servir ; le marqueur est posé par `POST /ulysse/premier-vu`, même origine
  exigée.
- ~~`#first` et `#firstcard` entrent au contrat §2.1.~~ **Fait.**

---

## ~~4. Un doute qu'il faut lever~~ — levé le 2026-08-08

> **La 33 est la référence retenue, et la question est close.** Cherchée
> partout depuis ici : le Bureau, tout le profil utilisateur, le Hermes Home,
> et l'historique git du dépôt — aucune maquette postérieure, nulle part.
> Aucun document du projet n'en cite d'autre. C'est écrit noir sur blanc dans
> `REPRISE.md`, comme vous le demandiez.
>
> Le Hermes Home que vous ne voyiez pas d'ici : **il n'y avait aucune
> maquette dedans**, et cette copie parallèle n'existe plus — le dépôt a été
> déplacé sur le Bureau le 2026-08-09. Il n'y a qu'un seul arbre.
>
> Ce qui suit est votre texte d'origine, conservé pour la trace.

kuchu mentionne **une maquette d'une version ultérieure à la 33**. Elle n'est
pas dans `Projet Ulysse\`, et je n'ai pas pu la trouver depuis Cowork.

**Tout ce que j'ai produit s'appuie sur `maquette-ulysse-google-33.html`** —
les sept aperçus, les six passes, et chaque fois que j'ai écrit « la maquette
avait prévu la place » (`.acts`, `.dots`, `.vhero`, `.privnote`, `.ask`).
`ulysse.css` porte lui-même en tête : *« EXTRAIT VERBATIM de
maquette-ulysse-google-33.html… la maquette EST le produit fini, donc elle est
la source »*.

Le seul endroit que je ne vois pas d'ici est le **Hermes Home**
(`…\hermes\Projets\Ulysse\`) — cette copie parallèle figée au jalon 3 que
`REPRISE.md` signale depuis le début comme un point à trancher.

**Si vous la trouvez, dites-le : je la diffe contre la 33** et je dis
précisément ce qui bouge dans `ulysse.css`, dans le contrat, et dans lesquelles
des passes. Si l'écart est mince, on le sait vite. S'il est large, mieux vaut
le découvrir maintenant.

**Si elle n'existe pas**, écrivez-le noir sur blanc dans `REPRISE.md` : la 33
est la référence retenue. Un doute que personne ne tranche revient tous les
trois mois.

---

## 5. Ce qui reste, et qui est à moi

- ~~**La dictée**~~ — **faite le 2026-08-09.** Le micro enregistre, part vers
  `/api/audio/transcribe`, et le texte atterrit **dans le champ** : il n'est
  jamais envoyé à votre place.
- ~~**Le terminal intégré**~~ — **branché le 2026-08-09, et il attend votre
  passe.** Correction au passage : ce n'est pas `POST /api/pty`, c'est une
  **WebSocket** (`@app.websocket("/api/pty")`, web_server.py:15736). Ce
  document, `REPRISE.md` et l'audit disaient tous « POST » — c'était faux, et
  c'est corrigé partout.

  Ce qui tourne derrière n'est pas une imitation : c'est `hermes --tui`, le
  vrai, dans un pseudo-terminal. Vérifié à l'écran contre l'Hermès installé —
  41 outils, 99 compétences, l'invite prête, et `/help` a déclenché la
  complétion de la TUI elle-même.

  **Ce qu'il vous faut savoir avant d'y toucher :**

  - `xterm.js` est **emprunté**, pas recopié : `serve.py` le sert depuis
    `node_modules` d'Hermès (`/xterm/xterm.js`, `/xterm/xterm.css`,
    `/xterm/addon-fit.js`). C'est la même bibliothèque que le tableau de bord
    d'Hermès. La liste est fermée et aucun segment de chemin ne vient du
    client.
  - ⚠ **`#tecran` est un nœud vivant.** Il porte le terminal et sa session
    ouverte. `#tmain` étant reconstruit en `innerHTML` à chaque changement de
    thème, le laisser dans le gabarit **couperait le PTY sous les doigts** de
    quelqu'un en train de taper. `drawTerm()` fait donc : sortir vers
    `#uStock` → réécrire → réinstaller. Réécrivez tout le reste de `#tmain`
    si vous voulez, mais laissez `<div id="tecran">` **vide** dans le gabarit.
  - Les ids et classes sont au contrat : `tecran` `tstate` `tGo` `tSize`,
    et `u-tscreen` / `u-tecran` / `u-tstate` (qui porte l'état de session en
    classe jointe : `repos` `ouverture` `ouvert` `coupe`).
  - L'avertissement du panneau reste tel quel, ou plus fort : **les accords
    donnés dans Ulysse ne s'appliquent pas ici.** C'est la seule fenêtre de
    l'application qui mène en dehors d'elle.

---

## 6. Trois notes de tenue

**`apercu-plan.html` est dépassé** sur le repliage — le vôtre est réel, le sien
était simulé. C'est écrit en tête de `PASSE-DESIGN-PLAN.md`. Il reste utile
pour la carte colorée, le kebab d'étape et l'échelle.

**⚠ `apercu-reglages-terminal-reperes.html` est dépassé sur le Terminal.**
Vous y montriez un écran *illustratif*, et vous aviez posé la réserve
vous-même : « c'est juste tant que `/api/pty` n'est pas branché »
(`PASSE-DESIGN-REGLAGES-TERMINAL-REPERES.md`, §57). Il l'est. Ce que vous
verrez dans l'aperçu n'est plus ce qui s'affiche : `#tecran` porte désormais
un vrai terminal, avec une vraie session. **Regardez le produit qui tourne,
pas l'aperçu** — c'est précisément l'objet de la passe qu'on vous demande.
L'aperçu reste juste pour les Réglages et les Repères.

**Les huit aperçus restent fidèles côté style** tant qu'`ulysse.css` ne change
pas. Ce sont des copies figées au 2026-08-08.

---

## Au retour, un seul geste

```
cd web && node test_page.js
```

**S'il passe au rouge, ce n'est pas le test qui a tort** — un `id` ou un
`data-*` du contrat a disparu, et le contrat dit lequel.

Les pièges tiennent toujours : `ulysse-view.js` déclare `esc`, `NW`, `NH`,
`RX`, `NEUTRE` au niveau global · `#morePop` est reconstruit en `innerHTML`,
donc **sortir, réécrire, réinstaller** · et depuis le 2026-08-09, **`#tmain`
aussi** — avec, cette fois, une session PTY vivante dans `#tecran`. Le test
qui l'attrape s'appelle « changer de thème ne détruit pas la session en
cours » ; il a été vérifié en cassant volontairement la réinstallation, et il
est passé au rouge comme il devait.
