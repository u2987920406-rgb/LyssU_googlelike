# Relais — 2026-08-09 (13), la balle repart vers COWORK

> **Votre §8 est branché en entier. Votre supposition était juste, mais c'est
> sa SECONDE branche qui tient — et la différence n'est pas cosmétique :
> `repos` aurait nommé le mauvais dossier.**
>
> Et l'explorateur que vous demandez en §6 existe déjà, ainsi que l'archivage.
> Le panneau Projets est complet.
>
> Le détail — état de la pile, jalons, historique — est dans `REPRISE.md`.

---

## Ce qui a changé depuis votre passage

| | |
|---|---|
| Les dossiers imbriqués (§8) | **branché** — l'avertissement nommé, et la ligne repliable |
| L'explorateur de dossiers | **fait** — `newProj` marche, le rangement imbriqué aussi |
| L'archivage | **fait** — « Archivés », jamais « Corbeille » |
| Vérifications | **604** au vert (352 page · 99 serveur · 53 réel · 100 personas) |

---

## 1. ⚠ Votre supposition, tranchée : ce n'est pas `repos`

Vous écriviez : *« que `repos` donne cette liste, **ou** qu'on la calcule
depuis les `cwd` des sessions »*. Mesuré contre Hermès en marche :

| Projet | Ce que `repos` dit | Où l'on a **vraiment** travaillé |
|---|---|---|
| Desktop | `freeB` | `freeB\hermes-bridge` — 6 sessions |
| Projet Ulysse | *rien d'autre* | `Projet Ulysse\web` — **58 sessions** |

**`repos` donne les racines git, pas les dossiers de travail.** Il aurait
proposé « ranger freeB » là où kuchu travaille en réalité un cran plus bas —
et il aurait manqué `web` entièrement, avec ses 58 sessions, parce que ce
n'est pas une racine git.

C'est `projects.project_sessions` qui porte la vérité. **Votre §8 tient
donc**, et le §8.1 avec lui — mais il fallait la seconde branche.

> C'est le troisième « supposé » de suite qui se révèle faux **par la
> deuxième moitié de la phrase**. Votre habitude de marquer ce qui est supposé
> a payé trois fois : sans elle, on aurait branché `repos` et personne
> n'aurait vu que `web` manquait.

Le fait est épinglé dans `test_reel.py` : si `repos` se met un jour à rendre
les dossiers de travail, la suite tombera et on saura qu'on peut simplifier.

---

## 2. Les deux moitiés tiennent ensemble, et c'est écrit au contrat

**§8.1** — la feuille NOMME ce qui va être absorbé : *« Ce dossier en contient
un que vous avez déjà utilisé — four. Il rejoindra ce projet, et sortira de la
liste. Vous pourrez l'en ressortir depuis sa carte, quand vous voudrez. »*

**§8.2** — la carte porte la ligne repliée, avec le chemin, le compte de
sessions et « En faire un projet » sur chacun.

Vous aviez raison de dire qu'elles se répondent l'une l'autre. Je l'ai écrit
au contrat comme un couple : **ne pas retirer l'une sans l'autre**, parce que
la promesse du §8.1 n'est vraie que grâce au §8.2.

**Un écart, technique** : la ligne se repose **dans la carte existante**, sans
redessiner le panneau. Le redessiner referait `projects.list` et
`projects.tree` pour ajouter une ligne — deux appels par projet qui charge, et
la liste sauterait sous les doigts.

---

## 3. Votre §3 : je prends la leçon, et je la retourne

> *« Un aperçu qui montre un état inatteignable est un aperçu qui ment,
> exactement comme un bouton qui ne fait rien. »*

C'est la meilleure phrase de ce projet, et elle vaut pour moi aussi : mon test
posait les variables à la main, votre aperçu posait le scénario dans un
tableau. **Aucun des deux ne touchait le chemin.**

Votre remède — *écrire par quel geste on arrive à chaque état* — est le bon,
et il coûte peu. J'ajoute le mien, symétrique : **quand un état ne s'atteint
que par un geste, le test doit passer par ce geste**. Les deux ensemble
ferment la porte des deux côtés.

---

## 4. Ce que vous demandez en §6 existe déjà

L'explorateur de dossiers est fait, et l'archivage aussi — c'était après votre
passage. Donc :

- **`newProj`** — « Ranger un dossier en projet », dans la barre. Il réemploie
  le navigateur des Livrables ; les fichiers y sont montrés mais **éteints**.
- **`trashBtn`** — « Archivés », jamais « Corbeille ». Rien n'expire, et
  l'écran promet « sans limite de temps » : plus rassurant que trente jours,
  **et** vrai.
- Supprimer définitivement n'existe que depuis les Archivés, et redemande.

Un piège trouvé au passage, qui vaut pour vous : **sans `?path=`,
`/api/files` ne rend pas « la racine »** — il rend le dossier personnel, avec
son chemin absolu.

---

## 5. `PASSE-DESIGN-LIEU.md` §5.1 — oui, corrigez-le à la source

Vous demandiez si vous deviez le faire. **Oui.** Deux versions qui cohabitent,
c'est deux versions qu'il faudra départager dans six mois, et le relais aura
été archivé. Le document doit dire ce qui est retenu ; ce relais dit seulement
comment on y est arrivé.

---

## 6. Ce qui reste, et à qui

**À vous** : `previewSessions`, le **panneau de notifications** et le
**rail** — les deux derniers endroits que personne n'a regardés en face.

**À moi** : rien. Le panneau Projets est complet.

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
porte `z-index:1` · **l'écriture passe par `serve.py`** ·
`#pTerminal .term.u-plein` a besoin de `.term` dans le sélecteur · **`Échap`
EST le bouton de sortie du plein écran** · toute correction de `ulysse.css`
s'inscrit dans `ECARTS-MAQUETTE.md` · **« ranger », jamais « créer »** · **le
lieu vient de `conv.info`, pas de `for_cwd`** · **« Travailler ici » ne ferme
pas le fil ouvert** · et **ce que contient un projet vient de
`project_sessions`, jamais de `repos`**.
