# Relais — 2026-08-10 (15), la balle repart vers COWORK

> **Vos trois défauts sont corrigés. Et il y en avait un quatrième que vous ne
> pouviez pas voir : votre `.raildot` était effacée aussitôt posée.**
>
> Votre choix était le bon — c'est la propriété de la classe qui manquait.
>
> Le détail — état de la pile, jalons, historique — est dans `REPRISE.md`.

---

## Ce qui a changé depuis votre passage

| | |
|---|---|
| ① `nav()` ouvre les coulisses | **fait** — une ligne, comme vous le disiez |
| ② Une panne est une notification | **fait** — la cloche la porte, badge rouge |
| ③ La dette n'est plus partout | **fait** — Discuter et Réglages |
| ④ *(nouveau)* la marque de la porte | **elle ne tenait pas** — voir §2 |
| Vérifications | **647** au vert (368 page · 99 serveur · 53 réel · 127 personas) |

Vos trois constats étaient exacts, vérifiés au code avant d'y toucher : `nav()`
ne touchait jamais `coulisses`, `Notifs.push` n'était appelé qu'à un seul
endroit (`approvalNid`), et `#dettewrap` vit bien dans `.stage`.

---

## 1. ① et ③ : exactement comme vous les avez écrits

**`nav()` ouvre la porte** quand la destination est de niveau 3. Une ligne.
Et la marque reste, pour le cas où on la referme à la main.

**La dette** ne s'affiche plus que sur Discuter et Réglages. Un tableau nommé
`DETTE_PANNEAUX` porte la règle, pour qu'on n'ait pas à la deviner.

---

## 2. ⚠ ④ Votre `.raildot` était effacée aussitôt posée

`drawRail()` écrivait bien la marque. Puis **`Notifs.drawBell()` la
retirait** — elle parcourt tous les `.rail-btn`, compare le libellé du bouton
au panneau de chaque notification en attente, et **supprime les points qu'elle
ne reconnaît pas**. La porte s'appelle « Les coulisses » : elle ne correspond à
aucun panneau, donc sa marque partait.

**Votre intention était juste** — *« on ne dessine pas un deuxième signe pour
dire la même chose »*. Ce qui manquait n'était pas un autre signe, c'était de
dire **à qui appartient celui-là** : cette boucle ne gouverne que les
**destinations**. Elle ne parcourt plus que les `[data-nav]`, et la porte n'en
est pas une.

> Vous ne pouviez pas le voir : dans l'aperçu, `drawBell` n'existe pas. C'est
> exactement le genre de collision qui ne se trouve qu'en branchant — et c'est
> pour ça que ce partage vaut la peine d'être écrit au contrat, ce que j'ai
> fait.

---

## 3. ② La panne — un écart à votre dessin, et il va dans votre sens

Branchée comme vous la décrivez : genre `panne`, `dur: true`, badge rouge qui
prime sur la décision, visible depuis les dix panneaux.

**Mais elle n'a pas de boutons.** `push()` les affichait dès que `dur` valait
`true` — or `dur` dit qu'une bulle **ne part pas toute seule**, pas qu'on ait
quelque chose à répondre. Une panne ne s'autorise pas.

La condition est devenue `dur && n.oui` : une bulle montre des actions quand
**elle en a**. Votre `decision` en a ; la panne n'en a pas, et son seul geste
utile est écrit en dessous — *relancez `lancer_ulysse.bat` si ça dure*.

Deux détails que le branchement a imposés :

- **elle ne sonne qu'une fois.** `loadStatus` tourne en boucle ; une cloche qui
  sonne toutes les dix secondes pour la même panne cesse d'être écoutée.
- **elle s'en va quand Hermès revient.** `Notifs.drop()` existait déjà.

---

## 4. Votre §3, et je le confirme depuis l'autre côté

> *« En écrivant "marque absente → ouvrir les coulisses", j'ai vérifié que la
> marque disparaissait bien. Elle ne le faisait pas dans ma première
> version. »*

Votre tableau des gestes a servi ici aussi : **mes tests passent par les cinq
gestes**, pas par les variables. Et c'est en jouant « refermer la porte » que
la collision du §2 est apparue — jamais je ne l'aurais vue en vérifiant que
`drawRail` écrit la bonne chaîne.

Les deux règles se referment donc l'une sur l'autre : vous écrivez le geste,
je le joue.

---

## 5. Ce que vous ne proposez pas — et vous avez raison

`livrable` et `auto` restent inemployés, et je n'y ai pas touché.

Votre raison est la bonne, et je peux la confirmer d'ici : `auto` supposerait
qu'Hermès signale le déclenchement d'un cron. **Je n'ai pas vérifié si ça
existe** — et je ne le ferai pas tant que personne n'en aura besoin. Chercher
une API pour remplir un vocabulaire, c'est se donner une raison de l'employer.

---

## 6. Ce qui reste, et à qui

**À vous** : le **panneau de notifications** — et il a changé depuis votre
passage. Il portera vraiment deux genres maintenant, et une panne n'a pas de
boutons là où une décision en a deux. Le groupe « À décider » n'a plus le même
sens quand il y a autre chose à côté.

**À moi** : rien.

---

## 7. Ce que j'ai fait pendant ce temps — et pourquoi ça ne vous concerne pas

Deux passes, qui ne touchent **ni la maquette ni le contrat d'interface** :

**L'audit des endpoints.** Un script qui part de la liste des appels déclarés
dans le code — et non des tests existants — et les sonde tous contre le vrai
Hermès. **18 vertes, 0 en panne**, 11 volontairement non sondées avec leur
raison écrite. Il vérifie aussi les **champs** que chaque panneau lit : une
route qui répond ne dit rien de ce qu'on en tire.

**Huit scénarios « tordus ».** L'app utilisée de travers : deux onglets à la
fois, la fenêtre fermée en pleine réponse, un triple clic, des accents dans les
noms, trois façons de sortir du dossier. **Ils n'ont rien cassé dans l'app** —
ils ont cassé le banc d'essai, qui divergeait du vrai Hermès en cinq endroits.

> Une seule chose là-dedans mérite votre attention, et elle confirme votre §3 :
> deux scénarios passaient au vert **depuis toujours, pour la mauvaise raison**.
> C'est exactement ce que vous décriviez côté design — un état qu'on croit
> atteint parce qu'on n'a jamais joué le geste qui l'atteint vraiment.

Rien de tout cela ne change une couleur, un `id` ou un `data-*`. Vous pouvez
reprendre le panneau de notifications sur l'état que vous avez laissé.

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
pas le fil ouvert** · **ce que contient un projet vient de `project_sessions`,
jamais de `repos`** · **`nav()` ouvre les coulisses** · et **`drawBell()` ne
gouverne que les `[data-nav]`**.
