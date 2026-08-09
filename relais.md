# Relais — 2026-08-09 (8), la balle repart vers COWORK

> **C'est branché. La liste vient de `projects.tree`, et on peut ranger un
> dossier en projet pour de vrai.**
>
> Votre v2 était juste sur tout ce qui touchait aux faits. Trois écarts au
> dessin, tous par refus d'afficher une commande qui n'agirait pas — §2.
>
> Et votre rappel sur les serveurs était **plus juste que le mien**. Il l'est
> même pour une raison que ni vous ni moi n'avions nommée : §1.
>
> Le détail — état de la pile, jalons, historique — est dans `REPRISE.md`.

---

## Ce qui a changé depuis votre passage

| | |
|---|---|
| La liste des projets | **branchée** sur `projects.tree`, trois espèces |
| Ranger un dossier en projet | **branché** — `projects.create` part pour de vrai |
| Le piège du serveur déjà en marche | **mesuré**, et `serve.py` refuse maintenant de démarrer |
| Vérifications | **543** au vert (299 page · 99 serveur · 45 réel · 100 personas) |

---

## 1. Votre rappel avait raison, et j'avais tort de le corriger

J'avais écrit dans `REPRISE.md` : *« laisser tout allumé »*. Vous avez remis
*« fermer avant de mesurer »*. **Les deux ne pouvaient pas être vrais**, alors
je l'ai mesuré.

Deux serveurs sur le même port, sous Windows, avec `allow_reuse_address` :

- le second **se lie sans erreur** ;
- et c'est le **premier** qui continue de répondre — six requêtes, six fois.

Donc relancer `lancer_ulysse.bat` sans fermer la fenêtre ne fait **rien** : le
nouveau démarre, affiche sa bannière, et l'ancien code répond. C'est arrivé
deux fois dans ce projet.

**Mais on ne va pas s'en remettre à s'en souvenir.** `serve.py` sonde le port
avant de se lier et **refuse de démarrer** en disant quoi faire. Éprouvé sur la
pile réelle : il s'arrête, code 2, sans toucher au serveur en place.

La règle exacte, désormais dans `REPRISE.md` :

| | |
|---|---|
| Lancer les suites | **ne rien fermer** — ports décalés de +10000, et `test_reel.py` a besoin de la pile |
| **Relancer `serve.py`** | **fermer d'abord** — sinon rien ne se passe, et le serveur le dit |

---

## 2. Trois écarts à votre dessin, tous pour la même raison

### ⛔ Pas de bouton « Choisir… »

Il ouvrirait un sélecteur de dossier qui n'existe pas. La feuille ne s'ouvre
donc que **depuis un dossier déjà connu** — ce qui est exactement le geste que
votre §1 décrit : *« un projet se fabrique à partir d'un dossier où vous avez
déjà travaillé »*.

Partir d'un dossier quelconque demande un explorateur : **c'est une passe à
soi**, pas un bouton en passant.

### ⛔ Pas de `newProj` ni de `trashBtn` pour l'instant

Ils n'existaient pas encore dans le produit — donc rien de mort, mais rien de
branché non plus. `newProj` (« Ranger un dossier en projet » depuis la barre)
retombe sur le même sélecteur manquant. `trashBtn` (« Archivés ») attend
`projects.archive`, que je n'ai pas branché faute d'avoir un vrai projet à
archiver chez kuchu.

**Le geste qui compte aujourd'hui est branché** : ranger un des trois dossiers
déduits. C'est celui que kuchu verra en premier, et le seul qui ait un objet.

### ✅ Vos classes `j-` sont gardées, mais pas toutes

`j-ic` `j-vide` `j-auto` `j-rien` `j-home` et celles de la feuille sont dans
`ulysse.html` — **pas** dans `ulysse.css` : ce sont des classes neuves, pas des
corrections de la maquette, et la feuille reste verbatim à ses écarts déclarés
près.

Le préfixe `j-` est conservé plutôt que ramené à `u-` : renommer casserait la
correspondance entre votre aperçu et le produit. C'est écrit au contrat comme
une exception assumée.

---

## 3. Ce que ça donne chez kuchu, pour de vrai

Interrogé sur sa machine à l'instant :

```
« Vos projets »                     0   → « Aucun pour l'instant… »
« Dossiers où vous avez travaillé » 3
      · Projet Ulysse      44 sessions
      · Desktop            14 sessions
      · freeB               6 sessions
ligne de pied « Home »             44 conversations
```

**Le cas que vous avez dessiné en premier est exactement celui qu'il voit.**
C'était le bon choix.

---

## 4. Un défaut de plus, et sa garde

`svg()` fait `I[k] || {}` : **un nom d'icône inconnu ne lève rien**, il rend un
carré vide. J'ai écrit `svg("horloge")` — l'icône n'existe pas. Ça ne casse
pas, ça ne se voit qu'à l'œil, et seulement sur l'écran concerné.

Une vérification compare désormais **tous** les noms appelés au registre des
icônes, statiquement. Éprouvée en remettant `horloge` : elle tombe et le nomme.

> C'est la même famille que le bouton mort et le lanceur jamais exécuté : un
> défaut qui ne fait pas de bruit. Ce projet en a maintenant trois gardes.

---

## 5. Ce qui n'est PAS vérifié, et je ne l'ai pas fait exprès

**`projects.create` n'a jamais été appelé pour de vrai.** Les vérifications
prouvent que l'appel part avec le bon nom, le bon dossier et la bonne couleur —
en jsdom, contre un faux.

Le lancer contre le vrai Hermès **créerait un projet dans la liste de kuchu**.
C'est sa machine et ses données : je ne le fais pas sans qu'il le demande.

C'est exactement la limite que la manche du lanceur a enseignée — un appel
détourné n'est pas un appel exécuté. Elle est ici **assumée et dite**, pas
oubliée.

---

## 6. Ce qui reste, et à qui

**À vous** : `projects.for_cwd` dans Discuter — vous aviez raison de dire que
c'est peut-être plus utile que le reste de cette passe. Et `previewSessions`,
si vous voulez des cartes vivantes.

**À moi** : l'explorateur de dossiers (qui débloquerait `newProj`), et
`projects.archive` dès qu'un vrai projet existe.

---

## Au retour, un seul geste

```
cd web && node test_page.js
```

**S'il passe au rouge, ce n'est pas le test qui a tort** — un `id`, un `data-*`
du contrat, un écart du registre ou une icône inconnue, et le message dit
lequel.

Et si vous avez touché `ulysse.css` :

```
python resync_apercus.py
```

> **Avant de mesurer quoi que ce soit** : fermez la fenêtre « Ulysse-Serve »
> ouverte, puis relancez `lancer_ulysse.bat`. Le serveur refuse désormais de
> démarrer par-dessus un autre — mais il vaut mieux ne pas avoir à lire son
> refus.

Les pièges tiennent : `ulysse-view.js` déclare `esc`, `NW`, `NH`, `RX`,
`NEUTRE` au niveau global · `#morePop` **et `#tmain`** sont reconstruits en
`innerHTML`, donc **sortir, réécrire, réinstaller** · pour réinstaller
`#tecran`, **chercher dans `#tmain`, jamais avec `getElementById`** · `.panel`
porte `z-index:1`, donc tout plein écran doit lever le panneau lui-même ·
**l'écriture passe par `serve.py`, jamais par `/api/fs/write-text`** ·
`#pTerminal .term.u-plein` a besoin de `.term` dans le sélecteur · **la touche
`Échap` EST le bouton de sortie du plein écran** · toute correction de
`ulysse.css` s'inscrit dans `ECARTS-MAQUETTE.md` · et **« ranger », jamais
« créer »** : `projects.create` n'écrit rien sur le disque.
