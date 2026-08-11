# Passe de design — coller une image

> ✅ **APPLIQUÉE le 2026-08-11**, §1 et §2. Le collage passe par
> `surFichiers()` → `attacherFichier()`, comme le « + ».
>
> ⚠ **Mais pas par `image.attach`** — ce RPC veut un chemin visible du
> gateway et ignore `data_url` ; il répondait `4016 image not found`, pour le
> collage **comme pour le « + », depuis toujours**. C'est
> **`image.attach_bytes`** qu'il faut (`methods_prompt.py:453`). Constaté en
> lançant le produit, pas au banc : le faux Hermès acceptait l'appel.
> `/ulysse/capture`, `sauver_capture()`, `refsCaptures()`, le marqueur
> `[capture: …]` et la liste `captures[]` n'existent plus ; `web/captures/`
> est sorti du dossier servi.
>
> ⛔ **Le §3 n'est PAS appliqué, et il ne doit pas l'être tel qu'il est
> écrit.** La question du §4 — « Hermès dit-il si le modèle courant voit les
> images ? » — a été posée au code source, et la réponse est **oui, mais la
> pastille proposée serait fausse**. Voir le §4, réécrit.

> **Écrite après coup.** Le collage de capture a été branché le 2026-08-10 par
> Hermès lui-même, pendant que Claude Code était saturé — dans l'urgence d'une
> exigence, et sans passe de design. C'est la première fonction du produit qui
> arrive dans cet ordre.
>
> Elle marche, elle est prouvée bout-en-bout, et **elle a créé un second chemin
> à côté d'un chemin qui existait déjà.** C'est ça qu'il faut reprendre.

---

## 0. Constaté / supposé

**Constaté**, dans le code :

- `image.attach` existe (`ulysse-core.js:659`) et son commentaire dit :
  *« Une image passe par image.attach : elle devient une **tuile de vision** »* ;
- le « + » l'emploie — `surFichiers()` → `attacher()` → référence `@file:…` ;
- **le collage ne l'emploie pas** : il écrit dans `web/captures/` via une route
  neuve, et insère `[capture: C:\chemin\absolu.png]` dans le message ;
- `hy3:free` ne fait pas de vision (404 sur un payload image, testé).

**Supposé** : qu'Hermès puisse dire si le modèle courant voit les images.
`conv.info.model` donne son **nom**, pas ses capacités. **À vérifier** — le §3
en dépend entièrement.

---

## 1. Le même geste, deux mécaniques

| Geste | Ce qui se passe | Ce que l'agent reçoit |
|---|---|---|
| Glisser par le « + » | `image.attach` | une **tuile de vision**, référence `@file:` |
| **Coller** la même image | fichier dans `web/captures/` | un **chemin absolu**, dans le texte |

**C'est le même geste pour la personne** — mettre une image dans la
conversation. Deux mécaniques, deux résultats, et **rien à l'écran ne dit
laquelle on a déclenchée.**

C'est le défaut le plus grave de cette passe, et c'est le seul qui compte
vraiment : le reste en découle.

> On a passé la journée à retirer les seconds signes pour la même chose —
> *« on ne dessine pas un deuxième signe pour dire "il y a quelque chose
> là-dedans" »*. Ici c'est un second **chemin** pour le même geste, ce qui est
> pire : un signe de trop se voit, une mécanique de trop ne se voit pas.

**Le collage doit passer par `image.attach`**, comme le « + ». Une image collée
est une image jointe.

---

## 2. Deux conséquences qui disparaissent avec le §1

### Le produit écrit dans son propre code

`web/captures/` est **dans le dossier servi**. Rien ne le nettoie ; trois
fichiers y sont déjà. `serve.py` sert `web/` — il ne devrait pas y déposer des
données d'utilisateur.

C'est la même frontière que celle qu'on a tenue partout ailleurs : la règle S10
a fermé la publication de `web/` précisément parce que ce dossier est du
**produit**, pas un espace de travail.

Avec `image.attach`, la question ne se pose plus : c'est **le gateway** qui
matérialise le fichier dans l'espace de la session, là où il a sa place.

### Un texte qu'on ajoute puis qu'on cache

`[capture: C:\Users\…\cap_20260810_152103.png]` est inséré dans le message —
puis retiré de la bulle à l'affichage. Le code le dit lui-même : *« kuchu ne
veut pas ce texte dans la bulle : on le retire. »*

**Un texte qu'on ajoute et qu'on cache est un texte qui ne devrait pas être
là.** La référence `@file:` du chemin normal ne pose pas ce problème : elle est
faite pour ça, et `refsJointes()` la gère déjà.

---

## 3. Le vrai sujet : coller une image à un modèle qui ne voit pas

`hy3:free` ne fait pas de vision. **Coller une image ne sert alors à rien**, et
aujourd'hui rien ne le dit — l'aperçu s'affiche dans les pièces jointes,
exactement comme si elle allait être vue.

C'est la règle qu'on applique partout : **ne pas laisser croire qu'une chose
agit quand elle n'agit pas.** Un bouton mort, un conseil déguisé en lien, une
pièce jointe que personne ne regardera : même famille.

### Ce que la pastille doit dire

`.u-jointe` existe déjà, avec son état `att` (envoi en cours). Il lui faut un
troisième état :

> 🖼 capture.png · **ce modèle ne voit pas les images**

En ambre, pas en rouge : ce n'est pas une erreur, c'est une limite. La pièce
part quand même — l'agent peut la lire avec ses outils, ce qui est justement le
contournement qu'Hermès a trouvé.

### Et ce qu'il ne faut pas faire

**Ne pas changer de modèle tout seul.** Le contournement d'Hermès — décrire
l'image avec `stepfun/step-3.7-flash:free` — respecte la loi du cerveau parce
que c'est **Hermès** qui le décide, pas Ulysse. Si Ulysse se mettait à choisir
un modèle de vision pour ses images, il choisirait un cerveau. C'est
exactement ce que `LOI-DU-CERVEAU.md` interdit.

L'écran dit la limite. Il ne la contourne pas.

---

## 4. Vérifié dans le code d'Hermès — et la réponse renverse le §3

**La question posée était :** Hermès dit-il si le modèle courant voit les
images ? **Oui.** `GET /api/model/info` rend `supports_vision`, lu des
capacités models.dev (`hermes_cli/web_server.py:6225`).

**Et pourtant la pastille ne doit pas être posée**, parce que la seconde
moitié de la mécanique dit le contraire de ce qu'on supposait :

`agent/image_routing.py:461`, `decide_image_input_mode()`, tranche **à chaque
tour**. En `auto` — la valeur par défaut (`config_defaults.py:268`) — si le
modèle ne fait pas de vision, le mode retenu est `"text"`, et
`tui_gateway/server.py:6733` `_enrich_with_attached_images()` fait analyser
l'image par `vision_analyze_tool` et **préfixe la description au message**.

> **L'image passe dans les deux cas.** Nativement si le modèle voit ; décrite
> par un autre modèle s'il ne voit pas. Ce que la passe prenait pour le
> contournement manuel d'Hermès est en réalité **le comportement par défaut du
> produit**.

Écrire « ce modèle ne voit pas les images » serait donc **faux**, et faux dans
la direction exacte que cette passe redoutait : *« une pastille qui annonce à
tort ne voit pas ferait renoncer à un geste qui marchait. »* On y arrive par
l'autre bout — non pas en devinant, mais en croyant savoir.

**Rien n'est donc affiché, et `.u-jointe.aveugle` n'existe pas.** Ce n'est plus
de la prudence faute de réponse : c'est la conclusion d'une réponse.

> ⚠ Ce qui **resterait** vrai à dire un jour, c'est *« décrite par un autre
> modèle »* — mais ça dépend de `auxiliary.vision` et de `image_input_mode`,
> deux réglages qu'Ulysse ne lit pas. Et **Ulysse ne choisit jamais le
> cerveau** : il n'a pas non plus à commenter celui qu'Hermès a choisi.

---

## 5. Ce qui est bon dans ce qui a été fait, et qu'il faut garder

- **La limite est écrite**, dans le journal du relais : *« si l'utilisateur
  envoie la capture mais que Hermes n'utilise QUE hy3:free, l'image n'est pas
  vue »*. Elle a été dite avant d'être demandée.
- **Le modèle par défaut n'a pas été changé** pour faire marcher la
  fonctionnalité. C'était la tentation évidente, et elle a été refusée en
  nommant la loi.
- **Le contournement est côté agent**, pas côté page. C'est le bon côté.

---

## 6. Contrat d'interface

`#jointes0` / `#jointes1`, `.u-jointe`, `data-jx` — inchangés. Le collage doit
**rejoindre** `jointes[]`, pas vivre à côté.

**Classe nouvelle** : `u-jointe.aveugle` — la pièce part, mais le modèle ne la
verra pas.

**À retirer si le §1 est appliqué** : la route `/ulysse/capture`, la méthode
`sauver_capture()`, le dossier `web/captures/` et son contenu, `refsCaptures()`
et le marqueur `[capture: …]`.

### Par quel geste on atteint chaque état

| État | Geste |
|---|---|
| Pièce jointe normale | coller une image, modèle avec vision |
| Pastille « ne voit pas » | coller une image, modèle sans vision |
| Envoi en cours (`att`) | coller une image lourde |
| Rien | coller du texte — le collage laisse passer |

---

## 7. Une remarque qui dépasse cette passe

**C'est la première fois qu'une fonction arrive avant son dessin**, et le
défaut qui en résulte est exactement celui qu'on aurait vu en dessinant : *« et
si on colle, ça fait quoi de différent du "+" ? »*

Ce n'est pas un reproche — l'urgence était réelle, la fonction marche, et la
limite a été dite. C'est une observation sur l'ordre des choses : **la question
« qu'est-ce que ce geste a de différent d'un geste existant » ne se pose pas
toute seule quand on code. Elle se pose quand on dessine.**
