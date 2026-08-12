# Relais — 2026-08-12 (24), le mode Plan cesse de promettre

> ## ⚠ LU EN PREMIER : « accords en manuel » n'est PAS « on vous demande »
>
> Le relais 23 vous laissait un bouton — *« Passer les accords en manuel »* —
> en disant que le mode Plan tiendrait alors sa promesse. **kuchu l'a cliqué.
> Et la promesse ne tient toujours pas.**
>
> Éprouvé juste après, dans les conditions mêmes que cet écran réclamait :
>
> | geste | résultat |
> |---|---|
> | `write_file` sur `essai-refus.txt` | fichier écrit · **zéro `approval.request`** |
> | `terminal echo essai-porte` | exécuté en **185 ms** · zéro demande |
>
> Le code source d'Hermès dit pourquoi, et c'est **structurel** :
>
> - **`tools/approval.py:3938`** — `if not warnings: return {"approved": True}`,
>   **avant** toute lecture du mode. Une commande qui ne déclenche aucun motif
>   de danger est auto-approuvée dans **tous** les modes, manuel compris.
>   `approvals.mode` ne dit pas *si* l'on demande : il dit **quoi faire quand un
>   motif a déjà mordu**.
> - **`tools/file_tools.py:706`** — la seule porte toujours-demander sur une
>   écriture couvre **quatre noms** : `agents.md`, `claude.md`, `soul.md`,
>   `.cursorrules`. Un `write_file` ordinaire ne passe par **aucune** porte, à
>   aucun réglage.
>
> **Le clic a donc rendu Ulysse moins protecteur, pas plus** : le trou est
> resté, l'avertissement est parti. `planGaranti()` tirait une GARANTIE de
> `modeAccords === "manual"`, et l'écran s'est mis à afficher « rien ne sera
> modifié sur le disque » pendant qu'un fichier s'écrivait sans un mot.
>
> ### 👉 CE QUI A CHANGÉ, ET QU'IL NE FAUT PAS DÉFAIRE
>
> La phrase **« rien ne sera modifié sur le disque » est retirée des trois
> endroits où elle vivait** — l'accueil, la note sous le composeur, l'encart.
> Il n'existe aucun réglage sous lequel elle soit vraie. L'encart, lui, ne
> disparaît plus en manuel : il change de propos et dit la portée exacte, en
> gris, avec la mesure qui l'appuie.
>
> Ce qui retient vraiment l'agent en Plan, c'est **la consigne** de
> `ligneDeMode()` — on l'a vu refuser `write_file` sur instruction directe, en
> disant « la règle de session prime ». C'est réel. Mais le code le dit
> lui-même : *une garantie qui repose sur la bonne volonté du modèle n'est pas
> une garantie.*

> **`node test_page.js` : 511 / 511.** Seize vérifications neuves, six
> mutations posées, six mordues.

---

## 0. Ce qui vous attend au premier geste

```
cd web && node test_page.js          # 511/511
python resync_apercus.py             # après TOUTE retouche de ulysse.css
lancer_ulysse.bat                    # http://127.0.0.1:8080/ulysse.html
```

> **Trois pièges en vérifiant dans le navigateur**, tous rencontrés :
>
> 1. **Naviguer vers l'URL courante, hash compris, ne recharge rien.**
>    `location.reload()`.
> 2. **`location.reload()` peut figer l'onglet côté extension** (« script
>    injection timed out ») sans que l'app soit en cause : serveur à 200,
>    syntaxe bonne. Ouvrir un onglet neuf.
> 3. **Au démarrage la page est sur l'accueil, pas sur le fil.** Ce n'est pas
>    une panne : il faut envoyer un vrai message.
>
> Et **prévenez kuchu de ne pas cliquer pendant que vous pilotez le
> navigateur** : la fenêtre a changé de taille trois fois en pleine mesure, et
> j'ai cru dix secondes à un défaut d'affichage.

---

## 0 bis. Les dix scénarios sont joués

Cinq l'avaient été avant que le PC s'éteigne ; la conversation a été perdue,
pas le disque — elle s'est relue dans le transcript. Les cinq derniers ont
trouvé **sept défauts**, plus celui de la promesse ci-dessus.

**Trois contredisaient un commentaire écrit dans le fichier même.** C'est la
catégorie la plus dure à voir : on lit le commentaire, et on le croit.

| | trouvé en… | quoi |
|---|---|---|
| A | jouant | la **ligne de mode se peignait dans le fil** — `onSend` promettait « elle part, elle ne s'affiche pas » |
| F | jouant | un fichier joint s'affichait `@file:.hermes/desktop-attachments/…` |
| G | jouant | une **image collée ne laissait aucune trace** : zéro `<img>`, zéro nom |
| C | jouant | « Lien interrompu » envoyait relancer le `.bat` alors que **tout tournait** |
| D | jouant | en « Les deux », la pastille d'état **volait la largeur au titre** |
| E | jouant | le bouton `⟨/⟩` **s'allumait sans rien changer** devant un CSV |
| — | mesurant | **« manuel » ne fait demander ni écriture ni commande anodine** |

Aucun n'était visible au banc. **Neuvième fois.**

---

## 1. ⚠ Ce qui part au moteur ne se peint plus dans le fil

`submitPrompt(text, opts)` avait déjà la couture : `sent` part, `shown` se
peint, et `opts.preamble` (le cadre de rôle) l'empruntait. **La ligne de mode
et les références `@file:` ne l'empruntaient pas** — les appelants les
collaient dans `text`, donc dans les deux.

À l'écran : **une deuxième bulle « Vous » par tour**, disant
`[Mode Plan : ne modifiez rien sur le disque…]`, que personne n'avait écrite.
Et une pièce jointe rendue en clair, sous votre nom.

`opts.suffix` est le même droit que `opts.preamble`, de l'autre côté : **ça
part, ça ne s'affiche pas.**

### Et ce qu'on a joint reste visible

Les puces vivaient au-dessus du composeur et **disparaissaient avec lui**. Une
image collée ne laissait ensuite rien : impossible de dire, en relisant demain,
quelle image on avait envoyée. Les mêmes puces, même forme, **dans la bulle**,
sans le ✕ — il n'y a plus rien à retirer.

> Les deux vérifications se tiennent : la référence **sort** du fil ET la
> pièce y **reste**. Sans la seconde, retirer la référence ferait disparaître
> le fichier sans un mot — exactement le défaut qu'on répare.

---

## 2. Un message qui dit quoi faire doit encore être vrai

« Lien interrompu » disait : *« Relancez lancer_ulysse.bat, puis renvoyez votre
message. »* Mesuré **au moment d'une vraie coupure**, arrivée toute seule :

- 8080, 9123, 8645 **répondaient tous** — rien n'était mort ;
- `link.state` était **déjà revenu à `open`** — `_scheduleRetry()` rebranche
  seul, avec un délai qui monte de 1 s à 30 s ;
- j'ai **renvoyé un message sans rien relancer** : nouvelle session, l'agent
  repart.

Le conseil était faux, et cher : relancer aurait tué des backends vivants, et
`serve.py` refuse un port pris. Les trois messages du lien disent maintenant
qu'Ulysse se rebranche seul, et ne proposent le `.bat` qu'**en second recours**.

> Le banc vérifiait `txt.includes("Lien interrompu")`. Il vérifiait qu'un
> message **existe**, jamais que ce qu'il dit **soit encore vrai**.

---

## 3. Un CSV se lit en colonnes, ou ne se lit pas

Le bouton `⟨/⟩` ne se désactivait que devant un binaire. Devant un CSV il
s'allumait — et ne changeait **rien** : `renderArtifactBody` ne rendait que le
markdown, tout le reste tombait dans le même `<pre>`. Le fichier interdit
pourtant cela **deux lignes plus haut** : *« un bouton qui ne peut rien faire
se désactive plutôt que de mentir »*.

Deux corrections, pas une :

- le CSV gagne son **rendu en table** — en-tête collant, défilement horizontal
  dans son propre conteneur (sinon huit colonnes poussent la page entière) ;
- le bouton **s'éteint** pour ce qui n'a qu'une seule lecture (`.txt`, `.py`…).

Le séparateur ne se devine pas au hasard : **un export Excel français écrit des
points-virgules**, et un libellé entre guillemets peut contenir le séparateur.
Les deux sont découpés, et gardés au banc.

---

## 4. La pastille d'état volait la largeur au titre

`flex:1` vaut `1 1 0%` : une **base nulle**. Le titre de l'étape ne recevait
que ce qui restait après la pastille « exécution », qui gardait sa largeur de
contenu. Mesuré en « Les deux » sur 859 px : volet **258**, ligne **214**,
titre **48 px** — « Cadrage 2025 » rendu *une syllabe par ligne*. En « Détail »
seul, la même ligne est parfaite : **ce n'est pas le texte, c'est le partage.**

Base `auto` des deux côtés : ils se réduisent à proportion de ce qu'ils
contiennent, donc le titre garde l'essentiel et la pastille s'abrège.

> `ECARTS-MAQUETTE.md` avait **innocenté cette règle** — à juste titre, sur la
> question du `display`. Le défaut était ailleurs, dans le même `flex:1`.
> **Innocenter une règle sur une question ne l'innocente pas sur les autres.**

---

## 5. Ce que le banc gardait, et qu'il ne fallait pas garder

Il exigeait littéralement : *« accords en manuel : la promesse revient,
l'avertissement part »*. **Le banc gardait la fausseté.** Réécrit.

Les six mutations posées, et ce qu'elles ont fait tomber :

| mutation | gardes mordus |
|---|---|
| la plomberie revient dans le texte affiché | 2 |
| le bouton `⟨/⟩` ne regarde plus s'il a deux lectures | 1 |
| le séparateur est toujours la virgule | 2 |
| la promesse revient à l'accueil | 4 |
| l'encart se tait en manuel | 1 |
| la promesse revient sous le composeur | 1 |

> Un garde a d'abord **tenu à un accent** : il cherchait `modifié` et la
> mutation écrivait `modifie`. Rendu insensible. Une vérification qui dépend
> d'un accent ne vérifie pas ce qu'elle croit.

---

## 6. Ce qui reste, et à qui

**Non corrigé, et c'est un choix :**

- **Un tour interrompu ne laisse aucune marque.** Corrigez un message en plein
  tour : le premier bloc « Ulysse » reste vide, pour toujours, sans un mot. Je
  ne sais pas distinguer « abandonné » de « lent » sans risquer d'accuser un
  tour qui allait répondre. **À trancher, pas à deviner.**

**Jamais éprouvé en vrai :**

- **la porte d'approbation elle-même.** Elle n'a jamais été appelée, dans aucun
  réglage : Hermès ne demande rien pour une écriture ni pour une commande
  anodine. Il faudrait une commande qui **morde un motif de danger**
  (`approval.py`) pour la voir enfin s'ouvrir. C'est le prochain scénario.
- **le ⤓** — il écrit dans les Téléchargements de kuchu.

**À vous, tout de suite :**

- **Trois fichiers d'essai** traînent, non commités : `personas-ulysse.csv`,
  `web/personas-ulysse.csv`, `web/personas-csv.html`. À supprimer quand vous
  voulez.
- **`web/.hermes/`** est né en jouant le scénario de la pièce jointe : le
  gateway y dépose **vos** octets, dans le dossier servi. Ajouté au
  `.gitignore` — ça n'a rien à faire sur un remote public.

**Décisions, pas du code.** `POST /api/skills/toggle` · les 4 sous-modes de
permission · l'écriture du fichier de profil · la création de projet / de
coffre.

**À Cowork** : `u-jdit`, `u-art-tab`, `u-art-tabwrap`, `m-portee` sont à porter
au `CONTRAT-INTERFACE.md`.

---

## Les pièges tiennent

`ulysse-view.js` déclare `esc`, `NW`, `NH`, `RX`, `NEUTRE`, `titre`,
`LANGUES_FICHIER` au niveau global — **et `ulysse-artifact.js` ajoute
`ARTIFACT_RE`, `aUnRendu`, `csvSeparateur`, `csvLigne`, `csvTableHTML`** ·
`#morePop` et `#tmain` sont reconstruits en `innerHTML`, donc **sortir,
réécrire, réinstaller** · pour réinstaller `#tecran`, **chercher dans `#tmain`,
jamais avec `getElementById`** · `.panel` porte `z-index:1` · **l'écriture passe
par `serve.py`** · `#pTerminal .term.u-plein` a besoin de `.term` dans le
sélecteur · **`Échap` EST le bouton de sortie du plein écran** · toute
correction de `ulysse.css` s'inscrit dans `ECARTS-MAQUETTE.md` **et se suit
d'un `resync_apercus.py`** · **« ranger », jamais « créer »** · **le lieu vient
de `conv.info`** · **« Travailler ici » ne ferme pas le fil** · **`nav()` ouvre
les coulisses** · **`drawBell()` compare `data-nav`, jamais le libellé** ·
**Ulysse ne choisit jamais le cerveau** (`LOI-DU-CERVEAU.md`) · **une image
collée est une image jointe**, et c'est **`image.attach_bytes`** · **un fichier
se montre dans un seul écran** : le volet, jamais la modale · **Hermès décrit
les images que le modèle ne voit pas** · **le garde qui répare doit mesurer
comme le garde qui alerte** · **un test qui désigne par la position accuse le
voisin** · **une valeur par défaut ne sert pas de signal** · **un `$` suivi de
`` ` ``, `&`, `'` ou d'un chiffre est un motif dans un remplacement
`String.replace`** · **`flex:1` est une base NULLE — le contenu perd contre un
voisin à base `auto`** · **ce qui part au moteur passe par `preamble` ou
`suffix`, jamais par `text`** · et **un message qui dit quoi faire doit être
vérifié encore vrai, pas seulement présent**.
