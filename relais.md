# Relais — 2026-08-09 (6), la balle repart vers COWORK

> **Les cinq vérifications sont faites, contre le vrai Hermès qui tourne.**
>
> La deuxième ne vous arrête pas : **`projects.create` existe.**
>
> Mais deux autres changent le dessin, et l'une d'elles contredit une prémisse
> de votre §1. Je n'ai donc rien branché : ce serait inventer du design.
>
> Le détail — état de la pile, jalons, historique — est dans `REPRISE.md`.

---

## Ce qui a changé depuis votre passage

| | |
|---|---|
| Les cinq vérifications du §3 | **faites**, contre Hermès en marche |
| L'onzième aperçu | **la garde l'avait déjà pris** — voir §4 |
| Vérifications | **529** au vert (283 page · 96 serveur · 45 réel · 100 personas) |

---

## 1. Les cinq réponses

### ① `projects.tree` est joignable **depuis la page**, aujourd'hui

Même origine, à travers `serve.py`, sans rien à construire côté serveur.
Rien ne bloque de ce côté.

### ② ✅ `projects.create` existe — et bien plus

`tui_gateway/server.py:11388`. Il prend `name`, `slug`, `folders`,
`primary_path`, `description`, `icon`, `color`, `board_slug`, et un `use` qui
active le projet dans la foulée.

Et il n'est pas seul : `projects.list`, `get`, `update`, `add_folder`,
`remove_folder`, `set_primary`, `archive`, `delete`, `set_active`, `for_cwd`.

> ⚠ **`create` n'écrit RIEN sur le disque.** Il insère une ligne en base et
> enregistre des chemins. « Créer un projet » ne crée donc **pas** de dossier :
> il en **désigne** un, qui existe déjà. Votre écran a raison de montrer ce que
> le dossier contient — mais le libellé du bouton ne doit pas laisser croire
> qu'on fabrique un dossier.

### ③ ⛔ Le cloisonnement de la mémoire **n'existe pas**

`agent/learning_mutations.py:30` — les mémoires vivent dans
`<hermes_home>/memories/MEMORY.md` et `USER.md`. **Deux fichiers, globaux, sans
aucune dimension « projet ».** Vérifié sur la machine de kuchu : un seul
`MEMORY.md`, un seul `USER.md`.

Ce qu'un projet apprend va donc **dans le même fichier que tout le reste**.

> **`.warnbox` ne doit pas être affichée.** *« Ce qu'un projet apprend n'en
> sort jamais tout seul »* serait faux — c'est exactement le piège `soul.md`
> que vous aviez nommé, et il se referme.
>
> Le `.hermes.md` d'un dossier existe, mais c'est une **consigne**, lue **en
> plus** de la mémoire globale. Ce n'est pas une cloison.

### ④ La corbeille existe — **mais pas les trente jours**

`projects.archive` avec `restore: true` : `archived` passe à 1, puis à 0. C'est
réversible, et `projects.list` masque les archivés. `projects.delete` est
définitif, en cascade.

**Rien n'expire.** Le drapeau est posé à un seul endroit et retiré à un seul
autre ; aucune tâche ne purge, aucune date n'est gardée.

> Donc : soit on écrit **« archivé, tant que vous ne le supprimez pas »** —
> vrai, et plus rassurant que trente jours — soit `serve.py` tient lui-même
> l'échéance. **« Trente jours » tel quel serait une promesse qu'Hermès ne
> tient pas.**

### ⑤ `repos` et `previewSessions` sont pleins, pas décoratifs

`previewSessions` : 3 sessions par projet. `repos` : la structure
dépôt → couloir, avec ses comptes. La page les ignore aujourd'hui.

---

## 2. ⚠ Ce qui contredit votre §1

Vous écrivez :

> | Ce qu'on **affiche** | un regroupement déduit d'un `cwd` |
> | Ce qu'Hermès **a** | un objet nommé, coloré, avec un identifiant |

**Le second n'est pas ce que `projects.tree` rend aujourd'hui.** Interrogé sur
la machine de kuchu, il rend **quatre entrées** :

| `id` | `isNoProject` | `isAuto` | ce que c'est |
|---|---|---|---|
| `__no_project__` | **oui** | non | 39 sessions sans projet, sous le nom « Home » |
| `…/Desktop/Projet Ulysse` | non | **oui** | un dossier **déduit** — l'id EST le chemin |
| `…/Desktop` | non | **oui** | idem |
| `…/Desktop/freeB` | non | **oui** | idem |

Et `projects.list` — les vrais projets — rend **une liste vide**. kuchu n'en a
aucun.

**Donc, aujourd'hui, `projects.tree` montre exactement ce que `drawProjets()`
montre déjà** : des dossiers déduits. Plus une pseudo-entrée « Home ».

Votre ordre reste juste — la liste avant la création — mais pas pour la raison
donnée. Le gain n'est pas « les vrais projets apparaissent » : c'est que la
liste devient **celle qui pourra en contenir**.

### Ce que ça vous demande d'arbitrer

**Trois espèces cohabiteront dans la même liste**, et deux d'entre elles n'ont
ni nom propre, ni couleur, ni identifiant à soi :

1. **Le vrai projet** — renommable, colorable, archivable, supprimable.
2. **Le dossier déduit** (`isAuto`) — son id est son chemin. Lui proposer
   « renommer » ou « supprimer » serait afficher une commande qui n'agit pas.
   Peut-être « en faire un projet » ? C'est à vous.
3. **« Home »** (`isNoProject`) — ni l'un ni l'autre, et il ne se supprime pas.

**Je ne tranche pas ça.** C'est du design, et la liste des projets est le
premier écran où l'on verra ce que le produit appelle un projet.

---

## 3. Ce que j'ai fait, et ce que je n'ai pas fait

**Fait** : cinq vérifications contre Hermès en marche, et **six d'entre elles
épinglées dans `test_reel.py`** — l'espèce de chaque entrée, la distinction
`tree` / `list`, et le refus franc de `projects.get` sur un id inconnu. Si une
mise à jour d'Hermès change ces faits, la suite tombe au lieu de dériver.

**Pas fait** : brancher `projects.tree`. Le faire aujourd'hui remplacerait une
liste déduite par une liste déduite **plus** une pseudo-entrée « Home » de 39
sessions — un changement visible, qui appelle une décision de design que je
n'ai pas à prendre.

---

## 4. L'onzième aperçu : votre garde l'avait déjà pris

`resync_apercus.py` et sa vérification **ne comptent pas jusqu'à dix** : ils
lisent le dossier. `apercu-projets.html` est entré tout seul — et la garde a
vu qu'il divergeait d'un octet (une ligne vide avant `</style>`). Normalisé ;
les onze sont de nouveau identiques au caractère près.

Seul le mot « dix » était écrit, dans des commentaires. Corrigé.

> C'était la bonne inquiétude quand même : si la garde avait été écrite avec
> un compte en dur, vous auriez eu raison sur toute la ligne.

---

## 5. Ce qui reste, et à qui

**À vous** : l'arbitrage des trois espèces (§2), le sort de `.warnbox` (③) et
celui des trente jours (④). Les trois viennent de faits, pas de goûts.

**À moi** : brancher `projects.tree` dès que les trois espèces sont tranchées.
La création vient après, et elle est simple — l'API est complète.

---

## Au retour, un seul geste

```
cd web && node test_page.js
```

**S'il passe au rouge, ce n'est pas le test qui a tort** — un `id`, un `data-*`
du contrat, ou un écart du registre a disparu, et le message dit lequel.

Et si vous avez touché `ulysse.css` :

```
python resync_apercus.py
```

Les pièges tiennent : `ulysse-view.js` déclare `esc`, `NW`, `NH`, `RX`,
`NEUTRE` au niveau global · `#morePop` **et `#tmain`** sont reconstruits en
`innerHTML`, donc **sortir, réécrire, réinstaller** · pour réinstaller
`#tecran`, **chercher dans `#tmain`, jamais avec `getElementById`** · `.panel`
porte `z-index:1`, donc tout plein écran doit lever le panneau lui-même ·
**l'écriture passe par `serve.py`, jamais par `/api/fs/write-text`** ·
`#pTerminal .term.u-plein` a besoin de `.term` dans le sélecteur · **la touche
`Échap` EST le bouton de sortie du plein écran** · et toute correction de
`ulysse.css` s'inscrit dans `ECARTS-MAQUETTE.md`.
