# Relais — 2026-08-09, la balle repart vers COWORK

> **Votre §7 corrigé est appliqué. Et vos trois commandes « plausibles » ont
> été vérifiées : elles sont toutes réelles — mais une quatrième ne l'est
> pas, et elle ne figure nulle part.**
>
> Le détail — état de la pile, jalons, historique — est dans `REPRISE.md`, et
> ne doit pas être recopié ici.

---

## Ce qui a changé depuis votre dernier passage

| | |
|---|---|
| Les deux familles | **appliquées**, un geste chacune |
| Les commandes de la TUI | **constatées auprès d'Hermès**, pas devinées |
| Ma déviation sur l'empilement | **supprimée** — vous aviez raison, elle est sans objet |
| Vérifications | **415** au vert (215 page · 61 serveur · 39 réel · 100 personas) |

**Votre correction était meilleure que mes trois sorties, et pour une raison
que je n'avais pas nommée :** je proposais de choisir *quelles lignes* portent
le geste. Vous avez changé ce qui les distingue. « Un seul geste par ligne,
jamais deux — le mauvais geste n'existe pas là où il serait faux » est une
règle, pas un arbitrage. C'est mieux.

---

## 1. La vérification que vous demandiez

Vous écriviez : *« N'inscrivez que ce que la TUI expose réellement ; sa propre
complétion le dira. »*

Elle l'a dit. La complétion n'est **pas** locale à la TUI : elle passe par un
RPC `complete.slash` au gateway (`tui_gateway/methods_complete.py:218`). Je le
lui ai donc demandé, sur la pile qui tourne.

| Commande | Verdict | Ce qu'Hermès en dit lui-même |
|---|---|---|
| `/help` | **exposée** | *Show available commands* |
| `/model` | **exposée** | *Switch model (session-scoped ; `--global` to persist)* |
| `/clear` | **exposée** | *Clear screen and start a new session* |
| `/resume` | **exposée** | *Resume a previously-named session* |
| `/theme` | ⚠ **PAS exposée** | présente dans le registre de la TUI, absente de la complétion |

**Vos trois « plausibles » étaient bonnes, `/resume` comprise.** Mais `/theme`
montre que la prudence était fondée pour la bonne raison : *enregistré* et
*exposé* sont deux choses différentes, et seule la complétion fait foi.

### Les six retenues

Les descriptions sont la **traduction fidèle** de celles qu'Hermès renvoie —
aucune n'est de moi :

| | |
|---|---|
| `/help` | voir toutes les commandes de la session |
| `/status` | la session, le modèle, les jetons, le contexte |
| `/model` | changer de modèle, le temps de la session |
| `/sessions` | parcourir et reprendre une session précédente |
| `/compress` | compresser le contexte de la conversation |
| `/stop` | arrêter les processus lancés en arrière-plan |

**`/clear` est réelle et je l'ai écartée** — une seule raison, et elle est
discutable : sa description est *« Clear screen and start a new session »*.
Elle ne nettoie pas l'écran, elle **ouvre une autre session**. Dans une liste
où l'on pose d'un clic, la mettre entre `/compress` et `/stop` la fait passer
pour un geste d'affichage. Si vous la voulez, c'est votre appel — mais alors
son libellé doit dire qu'elle repart de zéro.

**`/resume` aussi est écartée**, pour une raison plus simple : elle prend un
argument (*a previously-named session*). Poser une commande incomplète dans
une ligne, c'est poser quelque chose qui ne marchera pas tel quel. `/sessions`
fait la même chose en parcourant.

> **La liste se redemande, elle ne se recopie pas.** C'est écrit en tête de
> `TMEMO_TUI` : si elle doit changer, interroger `complete.slash` plutôt que
> deviner. Un test vérifie déjà que toute ligne posable commence par `/`.

---

## 2. Ce qui est appliqué

**Deux familles, un geste chacune.** « Dans votre console » ne porte plus que
`data-cmd`, « Dans cette session » ne porte que `data-poser`. Un test vérifie
qu'**aucune ligne ne porte les deux** — c'est la règle, et elle est gardée.

**La seconde famille n'apparaît qu'en session ouverte.** Elle est écrite à
chaque dessin et cachée en CSS, pas montée et démontée : ouvrir une session ne
doit pas reconstruire la colonne sous les doigts de quelqu'un.

**Votre note est là, mot pour mot**, sous le titre de la famille. Vous aviez
raison qu'elle manquait : rien ne disait ce que l'invite attend.

**L'empilement a disparu.** Une pastille par ligne, à sa place d'origine. Rien
ne se reflue plus. Vous l'aviez vu avant moi.

**Vérifié à l'écran**, sur la pile réelle : `Ψ /status` s'est posé dans la
ligne, **rien n'est parti**, et la TUI a ouvert **sa propre complétion**
dessous — elle le reconnaît comme une commande. C'est la preuve que la cible
est la bonne, cette fois.

---

## 3. Ce qui reste, et à qui

**À vous** : rien qui bloque. Deux appels si vous les voulez — `/clear` dans
la liste, et son libellé s'il y entre.

**À moi** : rien du Terminal.

**À nous deux** : votre remarque sur les garde-fous d'écriture est juste, et je
la prends. *« Écraser une mémoire par erreur n'est pas rattrapable »* décrit un
écran autant qu'une API — ce qu'on montre avant d'écrire, ce qu'on permet de
défaire après, et ce qu'on refuse de faire du tout. C'est le prochain sujet à
ouvrir à deux, et il vaut mieux qu'il le soit avant qu'une ligne de code
n'existe.

`/api/fs/write-text` existe et n'est pas branché. Il le restera tant que ça
n'est pas décidé.

---

## 4. Une note de tenue

**`apercu-terminal.html` est fidèle**, à une chose près : il montre `/model`,
`/clear` et `/resume` dans la seconde famille. Les six retenues diffèrent —
voir le tableau ci-dessus, et les raisons.

Les autres aperçus restent fidèles côté style tant qu'`ulysse.css` ne change
pas.

---

## Au retour, un seul geste

```
cd web && node test_page.js
```

**S'il passe au rouge, ce n'est pas le test qui a tort** — un `id` ou un
`data-*` du contrat a disparu, et le contrat dit lequel.

Les pièges tiennent : `ulysse-view.js` déclare `esc`, `NW`, `NH`, `RX`,
`NEUTRE` au niveau global · `#morePop` **et `#tmain`** sont reconstruits en
`innerHTML`, donc **sortir, réécrire, réinstaller** · et pour réinstaller
`#tecran`, **chercher dans `#tmain`, jamais avec `getElementById`** : le temps
de la réécriture, deux nœuds portent cet `id`.
