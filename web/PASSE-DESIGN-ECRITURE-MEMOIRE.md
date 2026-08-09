# Passe de design — écrire dans la mémoire

`/api/fs/write-text` existe et n'est pas branché depuis le premier jour du
projet, pour une raison écrite noir sur blanc :

> « Écraser une mémoire par erreur n'est pas rattrapable. »

Aperçu : `apercu-ecriture-memoire.html` (autonome, cinq cas).

---

## 0. La doctrine existe déjà, et personne ne s'en est servi

Elle est dans `ulysse.css`, au-dessus de `.snack` :

> « Rien ne disparaît d'un geste.
> · Ce qui se refait part sur place, avec un « Annuler » qui reste six secondes.
> · Ce qui porte des données va à la corbeille, et y reste.
> La destruction définitive n'existe qu'à un seul endroit, et se confirme. »

**Écrire par-dessus un fichier de mémoire *est* une destruction**, même si ça
s'appelle écrire. Ce qui suit n'invente rien : ça applique cette doctrine à un
geste qu'elle n'avait pas nommé.

---

## 1. Les trois gestes ne sont pas le même geste

`/api/fs/write-text` n'en connaît qu'un : écrire. Du côté de la personne, il y
en a trois, et ils n'ont pas le même risque :

| Geste | Ce qu'on perd | Ce qu'on montre |
|---|---|---|
| **Créer** | rien | un aperçu, et c'est tout |
| **Compléter** | rien | ce qui s'ajoute |
| **Remplacer** | le contenu d'avant | **la différence**, et la garantie de retour |

Les traiter pareil, c'est faire payer à la création la prudence que mérite le
remplacement — et l'habituer, si bien qu'on ne la lira plus le jour où elle
compte.

---

## 2. Ce qu'on montre avant : la différence, pas le fichier

Montrer le nouveau texte ne dit pas ce qu'on perd. Montrer les deux côte à côte
demande de comparer soi-même, sur un écran de 660 px.

Ce qu'il faut lire tient en **deux nombres et quelques lignes** : *2 lignes
retirées · 4 ajoutées · 4 inchangées*, puis les lignes elles-mêmes, en rouge et
en vert. Le reste du fichier est annoncé comme inchangé, il n'est pas déroulé.

C'est le même principe que partout ailleurs dans ce produit : on montre ce qui
change, pas ce qui est.

---

## 3. Ce qu'on permet de défaire : une version gardée, pas six secondes

**« Annuler » pendant six secondes est juste pour ce qui se refait.** Une
mémoire fausse, on s'en aperçoit des jours plus tard — au moment où Ulysse
répond à côté. Six secondes ne sont pas un garde-fou, c'est une politesse.

La doctrine a la réponse : *ce qui porte des données ne disparaît pas, il est
mis de côté.*

**Chaque écriture met la version d'avant de côté, datée.** L'écran Réglages ›
Ce qu'Ulysse sait liste les versions gardées et permet d'y revenir, sans limite
de temps. Ces fichiers pèsent quelques kilo-octets : rien ne justifie de les
jeter.

Le snack « Annuler » **reste** — il ne remplace pas la version gardée, il évite
d'avoir à s'en servir dans les six secondes qui suivent la bêtise.

> ~~⚠ **C'est ce qui bloque.**~~ **Levé le 2026-08-09 : le socle existe.**
> Copie datée **avant** l'écriture — et si la copie échoue, l'écriture n'a pas
> lieu, ce qui est plus fort que ce que je demandais. Versions dans
> `versions-ulysse/` (le sous-dossier, comme je penchais : un dossier se
> replie, un nom de fichier non). Retour en arrière qui **garde d'abord ce
> qu'il quitte** — sinon revenir serait devenu un aller simple.
>
> Deux protections que je n'avais pas vues, et qui manquaient : une version
> gardée ne peut pas être écrasée (on aurait pu détruire précisément ce qui
> existe pour empêcher une destruction), et deux copies simultanées ne peuvent
> plus se choisir le même nom.

---

## 4. Ce qu'on refuse de faire du tout

> **Réécrit le 2026-08-09.** La première version disait : *« `soul.md` n'est
> modifiable que par vous, jamais depuis une conversation. »* **C'était faux**,
> et le code l'a établi en cherchant dans Hermès. Je laisse la correction
> visible : c'est exactement le reproche que cette passe fait à l'écran non
> branché, retourné contre elle.

`soul.md` dit ce qu'Ulysse s'autorise et ce qu'il refuse. Si l'agent pouvait le
réécrire, **il pourrait lever ses propres garde-fous**. C'est donc le fichier
qu'on voudrait le plus protéger — et c'est celui dont la protection est la
moins totale.

### Trois niveaux, et l'écran les dit tels quels

| | |
|---|---|
| **Ulysse ne l'écrira jamais** | garanti. `serve.py` refuse ce nom, quelle que soit la casse, avant toute écriture |
| **L'écran ne le propose pas** | pas de champ, pas de « écrire quand même », pas de case dans les Réglages |
| **L'agent, lui, en a les moyens** | **non garanti.** Il écrit avec ses propres outils, dans le processus Hermès, sans passer par ce serveur — et Hermès n'expose aucun refus d'écriture par chemin (`agent/file_safety.py` se documente comme *« not a security boundary »*) |

Peindre les trois en vert serait plus rassurant et moins vrai. Le troisième
n'est pas une alerte : c'est une limite, et elle a le droit d'être dite
calmement.

### Ce qui reste, et qui n'est pas rien

Une écriture ne s'autorisant pas « toujours » (§5), **l'agent devra la demander
à chaque fois**. Le garde-fou tient par un autre chemin — la demande d'accord —
et c'est ce que l'écran dit, avec sa condition : *tant que les accords sont
demandés.*

C'est moins net qu'une frontière. C'est ce qu'il y a.

---

## 5. Une quatrième réponse, qui n'était pas demandée

**Une écriture ne s'autorise pas « toujours ».**

La demande d'accord porte quatre portées — une fois, cette conversation,
toujours, refuser. Pour une écriture dans la mémoire, la troisième doit
disparaître.

Raison : les autres actions se ressemblent d'une fois sur l'autre. Autoriser
`fs.read` toujours, c'est autoriser une famille de gestes dont on a vu un
exemplaire représentatif. **Deux écritures dans un même fichier n'ont rien à
voir** — autoriser « toujours » revient à approuver un contenu qu'on n'a pas
lu, et qui n'existe pas encore.

Il reste donc trois portées : cette écriture-ci, celles de cette conversation,
refuser. Et le bloc montre **la différence** avant, comme partout : un accord
donné sans voir ce qui change n'est pas un accord, c'est un blanc-seing.

---

## 6. Ce que le code doit tenir avant de brancher

Dans cet ordre — le premier conditionne tout le reste :

1. **La copie datée avant écrasement.** Sans elle, rien de cet écran n'est
   honnête.
2. **La liste des versions gardées**, et le retour en arrière.
3. Le **diff** côté page (le contenu d'avant est lisible par
   `/api/fs/read-text`, la comparaison peut se faire ici).
4. Les **trois modes** distingués côté interface — l'API n'a pas à changer.
5. `soul.md` **refusé à l'écriture par l'agent**, côté serveur et pas seulement
   côté page. Une frontière qui ne tient que dans l'interface n'est pas une
   frontière.

> **À vérifier :** où vivent les versions gardées ? Un sous-dossier à côté des
> fichiers de mémoire, ou une convention de nommage (`user.md.2026-08-09-1804`) ?
> La seconde est plus simple mais encombre la liste des fichiers. Je penche pour
> un sous-dossier, mais c'est un choix de code.

---

## 7. Contrat d'interface

Rien du contrat n'est touché : cet écran vit dans `#setbody`, qui est déjà
reconstruit à chaque section.

**Classes nouvelles**, toutes préfixées `m-` : `m-fichier`, `m-verrou`,
`m-cadenas`, `m-diff`, `m-bilan`, `m-garde`, `m-vers`, `m-sheet-acts`.

**Réemployées de la maquette** : `.irrev` (l'avertissement jaune, jamais
utilisé jusqu'ici), `.sheet` / `.sheet-bg`, `.snack` avec son `Annuler`,
`.validate`, `.btn-pick`, `.dangerlink`, `.txt-btn`, `.seth`.

Vérifié en jsdom sur les cinq cas, sans erreur : le diff ne s'affiche que pour
les remplacements, la garantie de retour n'apparaît que quand quelque chose se
perd, « toujours » est absent des portées d'écriture, et `soul.md` n'offre
aucun chemin vers l'écriture.
