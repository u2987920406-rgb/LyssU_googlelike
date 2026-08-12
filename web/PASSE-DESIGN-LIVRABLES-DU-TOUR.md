# Passe de design — les fichiers d'un tour, à la fin et visibles

> Demandée par kuchu le 2026-08-12 à 2 h, après avoir essayé le
> téléchargement construit une heure plus tôt :
>
> *« Il faut que le texte soit complètement fini, puis ensuite il propose les
> fichiers CSV ou autres à la fin, dans un encart bien visuel. Cela permet de
> voir à la fin les encarts, de cliquer dessus, de faire apparaître ça dans le
> browser in-app s'il le veut, ou le télécharger directement. »*
>
> Et le constat qui l'a amené : *« j'ai regardé la fin de la discussion, il n'y
> avait rien. Par contre, en plein milieu, il y avait plein de fichiers que je
> pouvais cliquer. »*

---

## 0. Constaté / supposé

**Constaté**, sur ses deux captures et dans le code :

- **le ⤓ d'un bloc de code est NOYÉ** — il est au coin du bloc, au milieu du
  texte, gris sur gris, et il n'apparaît qu'au survol. Rien ne dit qu'il y a
  là quelque chose à emporter ;
- **la ligne `write_file … Ouvrir ›` est noyée aussi**, au milieu de six
  autres lignes d'outil (`terminal`, `browser_navigate`, `patch`) qui, elles,
  ne mènent nulle part ;
- **un bloc ` ```texte ` contenant une simple URL a reçu un ⤓** — sur la
  capture, on propose d'emporter un fichier `extrait.txt` de 40 octets qui ne
  contient qu'une adresse. C'est du bruit que j'ai fabriqué ce soir ;
- **« Livrables » n'est PAS cet endroit** : c'est `REST.files()` sur un
  dossier, un explorateur. Il ne sait rien de la conversation en cours. Il n'y
  a donc rien à réutiliser — et rien à dupliquer non plus.

**Supposé** : rien. Cette passe ne dépend d'aucune vérification en attente.

---

## 1. Le fond : un livrable n'est pas une décoration de paragraphe

Ce que j'ai construit ce soir traite le fichier comme **une propriété du
texte** — un bouton au coin du bloc qui le contient. Ça se défend en lisant :
le bloc est là, l'action est là.

**Mais ce n'est pas comme ça qu'on s'en sert.** On lit la réponse en entier,
puis on veut ce qu'elle a produit. À ce moment-là on est **en bas**, et il
faut remonter chercher dans le texte des boutons qu'on n'a pas remarqués en
passant.

> **Ce qu'on emporte ne se range pas dans la phrase qui en parle. Ça se range
> à la fin, là où on arrive quand on a fini de lire.**

C'est la même erreur que les deux visualiseurs, d'un cran plus bas : j'ai posé
l'action là où l'objet est *mentionné*, pas là où l'on est quand on en a
*besoin*.

---

## 2. ⚠ La contradiction qu'il faut trancher : un signe, pas deux

Si l'encart de fin arrive **et** que le ⤓ reste au coin du bloc, alors **le
même fichier porte deux boutons** — la faute que ce projet retire partout, et
qu'il a retirée trois fois cette semaine.

**Le ⤓ inline disparaît.** L'encart de fin le remplace, il ne s'y ajoute pas.

Ce qu'on perd : emporter un bloc sans quitter des yeux le paragraphe qui
l'explique. Ce qu'on gagne : ne plus rater ce qu'on a produit. **Le second
compte plus** — kuchu a regardé la fin et n'a rien vu, alors que trois
fichiers l'attendaient au milieu.

---

## 3. Ce que l'encart contient — et ce qu'il ne contient pas

Deux espèces y entrent, et elles n'ont pas les mêmes actions :

| espèce | d'où | Ouvrir | Télécharger |
|---|---|---|---|
| **Écrit sur le disque** — `write_file`, `patch` | `tool.complete.args.path` | ✅ le volet | ✅ |
| **Écrit dans la réponse** — un bloc de code | le texte du tour | ⛔ *rien à ouvrir* | ✅ |

Un bloc de code n'existe pas encore comme fichier : il n'y a rien à ouvrir
tant qu'on ne l'a pas emporté. **On ne met donc pas « Ouvrir » sur les deux
pour faire joli** — un bouton qui n'agit pas est pire qu'un bouton absent.

### Ce qui n'entre PAS : les blocs qui ne sont pas des fichiers

Le bloc ` ```texte ` avec une URL, la commande shell d'un exemple, les trois
lignes de JSON qu'on cite : **ce sont des illustrations, pas des livrables.**

**La règle : un bloc entre dans l'encart s'il a une LANGUE DE FICHIER**
(`csv`, `json`, `md`, `html`, `py`, `js`, `svg`, `sql`, `yaml`, `xml`, `css`)
**ou un nom explicite** après la clôture. Un bloc sans langue, ou en `texte` /
`text` / `bash` / `sh` / `console`, reste un extrait dans le texte.

> On préfère **oublier un livrable** que d'en inventer trois. Une liste qui
> contient du bruit cesse d'être lue — et c'est précisément ce qui vient
> d'arriver au ⤓.

Une longueur minimale aussi : **sous deux lignes, ce n'est pas un fichier.**
Une URL seule, un nom de commande, un chiffre — on ne propose pas d'en faire
un `.txt`.

---

## 4. Où, et à quoi ça ressemble

**À la fin du tour de l'agent, après le texte**, dans le fil. Pas un panneau
séparé : ce sont les livrables *de cette réponse-là*, et ils doivent rester
avec elle quand on relit le fil demain.

```
  ┌─────────────────────────────────────────────┐
  │  ▤  2 fichiers produits                     │
  │                                             │
  │   📄 personas-ulysse.csv    Ouvrir ·  ⤓     │
  │      …/Projet Ulysse/web · 4,1 ko            │
  │                                             │
  │   📄 extrait.csv            ⤓               │
  │      dans cette réponse · 12 lignes          │
  └─────────────────────────────────────────────┘
```

**Un liseré, comme kuchu le demande** — c'est le seul bloc du fil qui porte
une bordure pleine et un fond distinct. Il doit se voir en faisant défiler
sans lire, parce que c'est exactement comme ça qu'on le cherchera.

**Sa deuxième ligne dit d'où vient le fichier** : un chemin pour ce qui est
sur le disque, « dans cette réponse » pour ce qui n'y est pas. La différence
est réelle, elle se lit d'un coup d'œil, et elle explique pourquoi l'un a
« Ouvrir » et l'autre non.

### Ce que la ligne d'outil devient

Elle **garde** son « Ouvrir › ». Ce n'est pas le même geste : la ligne d'outil
dit *ce que l'agent a fait, quand il l'a fait* — c'est un journal. L'encart
dit *ce qu'il vous reste*. Le premier est chronologique, le second est un
bilan.

> C'est la limite du « un seul signe » : il vaut pour deux boutons qui font la
> même chose **au même moment de la lecture**. Ici l'un est dans le récit,
> l'autre dans la conclusion.

---

## 5. Ce que je ne propose pas

- **Un panneau « livrables de la session »**, cumulant tous les tours. Ça
  double « Livrables », et ça éloigne le fichier de la phrase qui l'explique.
- **Ouvrir le volet automatiquement** après une création. kuchu l'a évoqué —
  mais un volet qui s'ouvre tout seul déplace la lecture sous les yeux, et
  c'est la règle qu'on tient depuis le rail : *un écran qui s'ouvre sur un
  événement s'ouvre par erreur.* L'encart est visible : ça suffit à ne pas le
  rater.
- **Convertir un tableau markdown en CSV** — déjà écarté, c'est une
  conversion, pas un transport.

---

## 6. Contrat d'interface

**Classes nouvelles**, préfixées `l-` : `l-livrables` (l'encart), `l-titre`,
`l-item`, `l-nom`, `l-ou`, `l-actes`, `l-ouvrir`, `l-dl`.

**À retirer** : `.u-md-fig`, `.u-md-cap`, `.u-md-dl` — le bandeau et le ⤓
inline construits le 2026-08-12 à 1 h, remplacés par l'encart. Le bloc de code
redevient un simple `<pre class="u-md-c">`.

**Inchangé** : `.u-tool.ouvrable` et son « Ouvrir › » — voir §4.

### Par quel geste on atteint chaque état

| État | Geste |
|---|---|
| Encart avec un fichier du disque | demander à l'agent d'écrire un fichier (Cowork) |
| Encart avec un bloc de la réponse | demander un CSV (les deux modes) |
| Les deux dans le même encart | demander un fichier ET un extrait |
| Pas d'encart | une réponse sans bloc de fichier — le cas normal |
| Bloc ignoré | un ` ```texte ` avec une URL, un ` ```bash ` d'exemple |
