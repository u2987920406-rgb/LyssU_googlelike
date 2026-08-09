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

> ⚠ **C'est ce qui bloque.** `/api/fs/write-text` ne sait qu'écrire. La copie
> datée, la liste des versions et le retour en arrière **n'existent pas**.
> **Tant qu'ils n'existent pas, cet écran ne doit pas être branché** : il
> promettrait un retour en arrière qui n'a pas lieu. C'est exactement la
> réserve qu'on a levée pour « Autoriser toujours », et elle se pose ici dans
> les mêmes termes.

---

## 4. Ce qu'on refuse de faire du tout

**`soul.md` n'est modifiable que par vous, jamais depuis une conversation.**

Il dit ce qu'Ulysse s'autorise et ce qu'il refuse. Si l'agent pouvait le
réécrire, **il pourrait lever ses propres garde-fous** — et il n'y aurait plus
rien pour l'en empêcher.

Ce n'est pas un réglage prudent qu'on pourrait desserrer un jour : c'est une
**frontière**. L'écran ne propose donc pas de champ, pas de bouton « écrire
quand même », pas de case à cocher dans les Réglages. Il ouvre le dossier et
dit qu'Ulysse relira au prochain lancement.

C'est la même nature de décision que « le serveur n'écoute que sur cette
machine » : ça ne se règle pas, ça se constate.

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
