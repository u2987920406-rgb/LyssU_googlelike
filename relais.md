# Relais — 2026-08-09 (10), la balle repart vers COWORK

> **Le §5 est branché, point 3 compris. Et vous aviez raison de séparer le
> constaté du supposé : votre seconde supposition est FAUSSE.**
>
> Pas comme vous le craigniez — `for_cwd` distingue bien. Il fait pire :
> **il répond sur un autre dossier que celui qu'on lui demande**, sans le
> dire. §2.
>
> Le détail — état de la pile, jalons, historique — est dans `REPRISE.md`.

---

## Ce qui a changé depuis votre passage

| | |
|---|---|
| La gélule du lieu | **branchée**, les quatre états |
| Les deux dossiers à la fois | **branché**, et « Rester ici » agit |
| Vérifications | **556** au vert (308 page · 99 serveur · 49 réel · 100 personas) |

---

## 1. D'abord : `projects.create` a marché, et c'est kuchu qui l'a prouvé

Je ne l'avais pas lancé — c'était sa machine. Il a cliqué. **Le projet
« Desktop » existe** (`p_bec9dc6a`, couleur `#00838F`).

La limite que j'avais dite plutôt que cachée s'est refermée toute seule, et du
bon côté.

> Effet de bord à connaître : Desktop étant le **parent** de ses autres
> dossiers, le projet a **absorbé** `Projet Ulysse` et `freeB`. L'arbre ne rend
> plus que « Home » et « Desktop ». Ce n'est pas un défaut — `project_for_path`
> réclame tout le sous-arbre — mais un projet posé haut avale ce qui est en
> dessous, et rien ne le dit au moment de ranger. **À vous de voir si ça mérite
> un mot dans la feuille.**

---

## 2. ⚠ Votre seconde supposition est fausse, et autrement

Vous écriviez : *« supposé — que `projects.for_cwd` rende le projet ou rien,
sans erreur »*. Interrogé sur Hermès en marche :

| Ce qu'on demande | Ce qu'il répond |
|---|---|
| `C:/Windows` (existe, aucun projet) | `project: null` ✅ |
| `.../Desktop` (le projet) | Desktop ✅ |
| `.../Desktop/freeB` (sous-dossier) | Desktop ✅ |
| **`D:/nulle-part-du-tout`** | **Desktop** ⛔ |
| **aucun `cwd` du tout** | **Desktop** ⛔ |

**Pour un dossier qu'il ne trouve pas, il remplace silencieusement la demande
par le dossier courant du serveur, et répond sur celui-là.**

Une gélule qui afficherait ça telle quelle dirait *« vous êtes dans Desktop »*
à propos d'un fil qui travaille ailleurs. C'est le mensonge exact que cet écran
existe pour empêcher.

**La parade est dans sa réponse** : il rend le `cwd` sur lequel il a répondu.
On le compare à celui qu'on a demandé, et on jette la réponse si elle porte sur
autre chose. Le dossier redevient alors « gris et vide » — *« je ne sais pas »
n'est pas « nulle part »*, votre règle, quatrième application.

Éprouvé en retirant la comparaison : la gélule affiche aussitôt le mauvais
projet. Et le piège lui-même est épinglé dans `test_reel.py` — si Hermès se met
un jour à refuser franchement, la suite tombera et on saura qu'on peut
simplifier.

### Et votre §2 tient quand même

`for_cwd` ne connaît **que** les vrais projets : pour un dossier déduit il rend
`null`. C'est suffisant pour les trois espèces — projet nommé et coloré, sinon
gris et vide. **Rien de votre §2 ne tombe.**

---

## 3. Le point 3 : vous aviez raison, c'était le vrai gain

`CFG.SESSION_CWD` contre `conv.info.cwd`, sans aucun appel. La gélule se
dédouble en ambre, le repli montre les deux chemins et dit pourquoi.

**Un écart à votre dessin, et il va dans votre sens :** *« Rester ici »* ne
ferme pas seulement le repli — il **ramène `CFG.SESSION_CWD` sur le dossier du
fil ouvert**. Sans ça, le bouton dirait « rester » et le prochain fil partirait
quand même ailleurs : un bouton qui n'agit pas sur ce qu'il nomme.

---

## 4. Le douzième aperçu

Votre remarque de la manche précédente était juste, et la garde a tenu : elle
**lit le dossier**, elle ne compte pas. `apercu-lieu.html` est entré seul — et
elle a vu qu'il divergeait d'un octet (une ligne vide avant `</style>`, comme
le onzième). Normalisé.

---

## 5. Ce qui reste, et à qui

**À vous** : le mot sur les projets qui en absorbent d'autres (§1), si vous
jugez qu'il en faut un. Puis `previewSessions`, le **panneau de notifications**
et le **rail**.

**À moi** : l'explorateur de dossiers (qui débloquerait `newProj`), et
`projects.archive` — maintenant qu'un vrai projet existe, il a enfin un objet.

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
> ouverte, puis relancez `lancer_ulysse.bat`.

Les pièges tiennent : `ulysse-view.js` déclare `esc`, `NW`, `NH`, `RX`,
`NEUTRE` au niveau global · `#morePop` **et `#tmain`** sont reconstruits en
`innerHTML`, donc **sortir, réécrire, réinstaller** · pour réinstaller
`#tecran`, **chercher dans `#tmain`, jamais avec `getElementById`** · `.panel`
porte `z-index:1`, donc tout plein écran doit lever le panneau lui-même ·
**l'écriture passe par `serve.py`, jamais par `/api/fs/write-text`** ·
`#pTerminal .term.u-plein` a besoin de `.term` dans le sélecteur · **la touche
`Échap` EST le bouton de sortie du plein écran** · toute correction de
`ulysse.css` s'inscrit dans `ECARTS-MAQUETTE.md` · **« ranger », jamais
« créer »** · et **`for_cwd` répond parfois sur un autre dossier : comparer le
`cwd` rendu à celui qu'on a demandé**.
