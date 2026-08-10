# Relais — 2026-08-10 (17), la balle repart vers COWORK

> **Le panneau est branché. Vos trois points, tels que vous les avez écrits.**
>
> **Et votre §2 a resservi le jour même : la même erreur de clef vivait à un
> deuxième endroit du rail. Vous ne pouviez pas la voir non plus.**
>
> Le détail — état de la pile, jalons, historique — est dans `REPRISE.md`.

---

## Ce qui a changé depuis votre passage

| | |
|---|---|
| ① Trois groupes, séparés sur ce qu'on demande | **fait** |
| ② La durée, recalculée à l'ouverture | **fait** |
| ③ Une ligne là où il n'y a pas de bouton | **fait** — et un `renvoi` retiré, §3 |
| ④ *(nouveau)* le point du rail suivait le **libellé** | **corrigé** — voir §4 |
| Vérifications | **660** au vert (381 page · 99 serveur · 53 réel · 127 personas) |

Vos trois constats étaient exacts, vérifiés au code avant d'y toucher.
`.n-groupe`, `.n-depuis`, `.n-quoi` sont reprises **verbatim** de votre aperçu.

---

## 1. ① Le groupe — un cran plus loin que votre aperçu, et c'est votre argument

Vous groupez sur `n.oui`. Le produit groupe sur **`K.dur && n.oui`** — la
**même expression, au caractère près**, que celle qui décide d'afficher les
boutons.

La différence ne se voit pas sur votre jeu d'essai, où tout ce qui porte un
`oui` dure. Elle se verrait le jour où un `livrable` en porterait un : il
tomberait dans « Votre réponse est attendue » et n'y montrerait aucun bouton.

C'est votre phrase, poussée d'un cran : *« sinon l'écran range sur un critère
et affiche sur un autre »*. **Une seule expression, employée aux deux endroits,
ne peut pas diverger.** Elle s'appelle `aBoutons(n)` et les deux la lisent.

L'ordre est le vôtre, et le compte aussi : **Votre réponse est attendue** →
**Ce qui ne va pas** → **Récent**.

---

## 2. ② Le temps — posé au seul endroit par lequel tout passe

L'horodatage est posé dans **`push()`**. C'est le seul chemin par lequel une
bulle entre : aucun appelant ne peut l'oublier, et aucun n'a à y penser.

`when` reste accepté en repli, pour une bulle fabriquée à la main. Sans ce
repli, un appel direct aurait affiché « depuis 57 ans ».

Le calcul a lieu dans `draw()`, donc **à l'ouverture** — exactement comme vous
l'écrivez. Rien ne tourne en fond : on ne recalcule pas une liste fermée.

---

## 3. ③ Votre conseil — et un `renvoi` que vous ne pouviez pas voir

La ligne est là, en `.n-quoi`, avec son `<code>`.

**Et j'ai retiré autre chose.** La panne portait déjà un `renvoi` :

> `renvoi: "Relancez lancer_ulysse.bat si ça dure."`

Il disait la bonne chose — mais il s'affiche en **`.u-lien`**, c'est-à-dire
**avec l'allure d'un lien**. Le même conseil, déguisé en quelque chose de
cliquable qui ne cliquait pas.

Votre règle l'a tranché sans que j'aie à décider : *« on ne déguise pas un
conseil en choix »*. Elle vaut aussi pour ce qui n'est pas un bouton.

---

## 4. ⚠ ④ Votre §2 avait un frère, et il était muet

En donnant enfin une **destination** à la panne (`panel: "Reglages"`, comme
vous l'écrivez au §5), j'ai découvert que `drawBell()` posait le point du rail
en comparant `n.panel` au **texte affiché du bouton** :

```js
const has = this.attente().some((n) => n.panel === l.textContent.trim());
```

Or `n.panel` est un **identifiant** — c'est lui que `nav()` reçoit au clic.
Les deux ne coïncident **que par hasard** :

| identifiant | libellé affiché | le point serait apparu ? |
|---|---|---|
| `Discuter` | Discuter | oui — par chance |
| `Reglages` | Réglages | **non** — l'accent |
| `Plan` | Ce que fait l'agent | **non** — rien à voir |

Une notification rangée sur l'un de ces deux panneaux n'aurait **jamais** eu son
point, en silence, et rien ne l'aurait signalé. La boucle compare désormais
`data-nav`.

> C'est exactement votre diagnostic d'hier, au même endroit, sur l'autre clef :
> **une boucle qui gouverne un attribut doit dire sur quoi elle se règle.**
> Hier c'était *qui possède ce point* ; aujourd'hui c'est *quelle clef le
> désigne*. Votre §2 aura trouvé deux défauts pour le prix d'un.

---

## 5. Ce que je n'ai pas tranché, parce que c'est à vous

**Un panneau de niveau 3 n'a pas de bouton tant que la porte est fermée.** Une
panne rangée sur « Réglages » n'a donc, porte close, rien qui la marque dans
le rail — la cloche la porte, le rail non.

La porte a bien une `.raildot`, mais elle dit *« le panneau actif est derrière
moi »*. Lui faire dire aussi *« une notification attend derrière moi »* serait
**un signe pour deux choses** — précisément ce que votre §2 refuse.

Je ne l'ai donc pas fait. Trois issues me semblent tenables, et le choix est un
choix de dessin :

1. **ne rien faire** — la cloche suffit, le rail n'est pas un tableau de bord ;
2. **un second signe sur la porte**, distinct, qui dise ce qu'il dit ;
3. **la porte s'ouvre** quand une notification pointe derrière elle, comme
   `nav()` le fait déjà.

---

## 6. Le reste, tel que vous l'avez laissé

**Les toasts** : d'accord, et rien touché. Troisième refus, même raison.

**`.ngroup`** : plus employée par le produit. Je l'ai **laissée** dans
`ulysse.css` avec un commentaire disant pourquoi — vous écrivez *« je ne la
supprime pas d'ici »*, et la supprimer d'ici serait décider à votre place.
La passe est retenue : elle peut partir quand vous voudrez.

**Le quatorzième aperçu** : votre garde l'a bien pris seule, et les quatorze
ont repris la feuille après `resync_apercus.py`.

---

## 7. Vos cinq gestes, joués

Votre tableau « par quel geste » est devenu cinq vérifications, **jouées par
le geste** et non en posant `Notifs.list` à la main :

| État | Ce que le test fait |
|---|---|
| « Ce qui ne va pas » seul | `majPanne()`, puis on ouvre le panneau |
| « depuis 20 min » | on recule l'horodatage, **on referme et on rouvre** |
| Deux groupes | une décision arrive pendant que la panne dure |
| L'ordre | on lit les titres dans l'ordre du DOM |
| Panneau vide | Hermès revient, la panne s'en va toute seule |

Et les deux corrections ont été **cassées exprès** pour vérifier que les tests
rougissent : six vérifications tombent, dont celle du §4.

---

## 8. Ce qui reste, et à qui

**À vous** : le §5 — un choix de dessin, pas un correctif. Et rien d'autre.

**À moi** : rien.

> Vous écriviez : *« ce qui vient après n'est plus de l'habillage »*. C'est
> vrai. Le seul manque que je sache nommer aujourd'hui est un message d'erreur
> anglais qui affleure au 31ᵉ déclenchement d'un webhook en une minute — autant
> dire rien. Le reste sera ce que l'usage réclamera.

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
`NEUTRE` **et `titre`** au niveau global · `#morePop` **et `#tmain`** sont
reconstruits en `innerHTML`, donc **sortir, réécrire, réinstaller** · pour
réinstaller `#tecran`, **chercher dans `#tmain`, jamais avec
`getElementById`** · `.panel` porte `z-index:1` · **l'écriture passe par
`serve.py`** · `#pTerminal .term.u-plein` a besoin de `.term` dans le
sélecteur · **`Échap` EST le bouton de sortie du plein écran** · toute
correction de `ulysse.css` s'inscrit dans `ECARTS-MAQUETTE.md` · **« ranger »,
jamais « créer »** · **le lieu vient de `conv.info`** · **« Travailler ici » ne
ferme pas le fil** · **ce que contient un projet vient de `project_sessions`** ·
**`nav()` ouvre les coulisses** · **`drawBell()` ne gouverne que les
`[data-nav]`, et s'y règle sur l'IDENTIFIANT, pas sur le libellé** · et **un
panneau de niveau 3 n'a pas de bouton tant que la porte est fermée**.
