# Audit des fonctionnalités — Ulysse (2026-08-12)

## Pourquoi ce document

kuchu, avant de construire une batterie de tests automatisés : il faut d'abord
savoir ce qu'Ulysse est censé faire, en entier — pas seulement ce qui est venu
à l'esprit pendant les scénarios joués aujourd'hui. Ce document croise trois
sources, jamais une seule :

1. **Ce qui est documenté comme intention** — `endpoints-ulysse.md`,
   `glossaire-ulysse.md`, `personas-ulysse.md`, `architecture-projet.md`,
   `plan-ulysse.md`, `matrice-fichiers-projet.md` (racine), et
   `web/CONTRAT-INTERFACE.md` + les vingt `web/PASSE-DESIGN-*.md` (les passes
   de design, qui sont le journal des décisions écran par écran).
2. **Ce qui est réellement codé** — lecture de `web/ulysse-app.js` (5399
   lignes), `web/ulysse-core.js` (1119 lignes), `web/ulysse-view.js` (1287
   lignes), `web/ulysse-artifact.js` (461 lignes), `web/ulysse.html`.
3. **Ce qui a été éprouvé aujourd'hui** — `relais.md` (racine, Relais 24) et
   les deux séries de scénarios réels : dix le matin (après une coupure de
   courant qui a fait perdre la conversation mais pas le disque — cinq
   reconstruits depuis le transcript, cinq rejoués), dix le soir (livrables
   vérifiables JSON/MD/HTML/Python/SQL, reprise après pause en trois variantes,
   modification de scripts de rôle).

**Ce que ce document n'est pas** : ni un test, ni une correction. Aucun
scénario n'a été relancé pour l'écrire, aucun fichier de code n'a été modifié,
aucune doc existante n'a été réécrite. Une fonctionnalité mentionnée dans un
vieux fichier de persona mais introuvable dans le code actuel est signalée
comme un écart — jamais présentée comme existante.

## Comment lire les tableaux

- **Où** : fichier + fonction (et ligne, quand c'est direct).
- **Documenté** : le(s) fichier(s) de conception qui en parlent, ou « non
  documentée, déduite du code ».
- **Statut** : `ÉPROUVÉE AUJOURD'HUI` (avec le scénario), `PARTIELLEMENT
  ÉPROUVÉE` (ce qui manque est précisé), `JAMAIS ÉPROUVÉE EN SITUATION
  RÉELLE`.
- **⚠ Écart** : toute incohérence doc/code repérée en croisant les trois
  sources — c'est la partie la plus utile de ce document.

Repères des séries de scénarios, réutilisés partout comme référence courte :

- **M1–M10** — série du matin (`relais.md` §0 bis + `scenarios-6-10.md`).
  M1–M5 reconstruits depuis le transcript après la coupure de courant ; M6
  (correction en plein tour) et M10 (lien coupé en direct) rejoués et détaillés
  dans `scenarios-6-10.md`. Défauts trouvés : A (ligne de mode peinte dans le
  fil), B (tour interrompu muet), C (« Lien interrompu » envoie relancer le
  `.bat` à tort), D (pastille d'état vole la largeur du titre), E (`⟨/⟩`
  s'allume sans rien faire sur un CSV), F (pièce jointe affichée en
  `@file:…` brut), G (image collée sans trace), plus la mesure « manuel »
  ne fait demander ni écriture ni commande anodine.
- **S1–S10** — série du soir (`10-scenarios-vagues2.md`) : S1 JSON, S2
  Markdown (tableau de comptes), S3 HTML, S4 Python (exécuté), S5 SQL (texte
  généré depuis des chiffres), S6 Reprise A (fermer l'onglet, reprendre via
  Travaux, rappeler un secret), S7 Reprise B (build interrompu en plein plan,
  reprendre, vérifier l'état du plan), S8 Reprise C — témoin (F5 simple, sans
  passer par Travaux), S9 script de rôle Codage, S10 script de rôle
  Généraliste (puis retour arrière complet).

---

## 1. Le rail et le cadre global

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| Dix panneaux, deux niveaux (travail en cours / coulisses) | `PANELS` (`ulysse-app.js:20`), `nav()` (`:59`) | `PASSE-DESIGN-RAIL.md`, `CONTRAT-INTERFACE.md` §2.1 | ÉPROUVÉE AUJOURD'HUI — les dix panneaux traversés dans M1–M10 et S1–S10 |
| `nav()` ouvre les coulisses quand la destination est de niveau 3 | `ulysse-app.js:73` | `PASSE-DESIGN-RAIL.md` §1 | PARTIELLEMENT ÉPROUVÉE — le correctif est en place et lu ; pas rejoué spécifiquement aujourd'hui (les quatre chemins d'entrée : ancre d'URL, « Voir la mémoire », « Dépenses », fermeture manuelle) |
| Marque `.raildot` sur la porte des coulisses fermée | `drawRail()` (`:117-138`) | `PASSE-DESIGN-RAIL.md` §1 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Épingler / replier le rail (survol 140 ms lisière, 520 ms bande) | `pinRail()` (`:149`), `initRailHover()` (`:102`) | `PASSE-DESIGN-RAIL.md` §5 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui — non listée dans M/S |
| La dette de profil (`#dettewrap`), limitée à Discuter/Réglages | `majDette()` (`:194`), `DETTE_PANNEAUX` (`:192`) | `PASSE-DESIGN-RAIL.md` §3 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Une panne devient une notification (`NKIND.panne`) | `majPanne()` (`:4823`) | `PASSE-DESIGN-RAIL.md` §2, `PASSE-DESIGN-NOTIFICATIONS.md` §1 | ⚠ voir Notifications ci-dessous — jamais déclenchée en conditions réelles aujourd'hui (aucune coupure de `/api/status` observée pendant les scénarios) |
| Densité épurée/dense | `drawSet()` setSel 0, `densSeg` | `endpoints-ulysse.md` REG-11 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |

**⚠ Écart** : `endpoints-ulysse.md` (M2, M5, M6, M7) décrit un menu à sept
entrées — Discuter, Studio, Vestiaire, Projets, Réglages, Cloche, Densité —
issu de la toute première carte des endpoints (2026-08-07). Le produit actuel
a **dix** panneaux dans le rail (Plan, Travaux, Livrables, Automatisations,
Terminal, Repères en plus), et la cloche/densité ne sont plus des entrées du
rail mais des commandes de la barre. Ce n'est pas un défaut : `endpoints-ulysse.md`
est un document de cadrage initial, jamais mis à jour depuis, et le produit
l'a dépassé de façon documentée (chaque écran a sa propre passe de design
postérieure). À noter pour qui lirait ce fichier en croyant qu'il décrit
l'état actuel.

---

## 2. Discuter

### 2.1 Le fil et l'accueil

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| Accueil unique = écran d'entrée (plus de `#lvl1` séparé) | `PASSE-DESIGN-DISCUTER.md` §2.3 (appliqué) | idem | ÉPROUVÉE AUJOURD'HUI — ouverture de session à chaque scénario M/S |
| `paintThread()`, bulles utilisateur/assistant/système/erreur | `ulysse-app.js:572` | `PASSE-DESIGN-DISCUTER.md` | ÉPROUVÉE AUJOURD'HUI (usage massif, M1–S10) |
| Compteur d'attente / filet de 25 s (`.wait.inline`) | `compteur()` (`:742`), `attendreOuverture()` (`:782`) | `PASSE-DESIGN-DISCUTER.md` §2.3 | PARTIELLEMENT ÉPROUVÉE — vu en usage normal ; le cas « ça dépasse 25 s sans réponse » non spécifiquement testé |
| Chien de garde 3 min sans événement (`TURN_SILENCE_MS`) | `ulysse-core.js:477-496` | non documentée dans une passe, déduite du code (commentaire inline) | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE — demande un silence réseau de 3 min en plein tour |
| Tour interrompu marqué (`p.interrompu`) quand on corrige en plein tour | `submitPrompt()` (`ulysse-core.js:816-824`) | non documentée en passe séparée ; commentaire inline | ÉPROUVÉE AUJOURD'HUI — **M6, Défaut B confirmé** : le bloc reste vide, sans marque visible côté écran au moment du test (le code marque `p.interrompu = true`, mais `scenarios-6-10.md` note que « rien ne dit qu'il a été abandonné » à l'écran — ⚠ voir incohérence ci-dessous) |
| Ligne de mode envoyée en `suffix`, jamais affichée | `submitPrompt()` (`ulysse-core.js:754-768`), `ligneDeMode()` (`ulysse-app.js:1212`) | `PASSE-DESIGN-UN-SEUL-FIL.md` §2-3 | ÉPROUVÉE AUJOURD'HUI — **le défaut existait (M-série, Défaut A) et a été corrigé dans la même journée** (`opts.suffix` vs `text`) ; le relais confirme le correctif appliqué et vérifié au banc (511/511) |
| Pièces jointes visibles dans la bulle envoyée (puces sans ✕) | `turnHTML()` (jointes du tour) | `relais.md` §1 | ÉPROUVÉE AUJOURD'HUI — correctif du jour, lié au défaut F/G de la série du matin |
| Lien coupé en direct → reconnexion automatique avec back-off, message d'absence après 3 essais | `HermesLink._scheduleRetry()` (`ulysse-core.js:335-349`) | non documentée en passe séparée ; commentaires inline (2026-08-12) | ÉPROUVÉE AUJOURD'HUI — **M10 / défaut C** : le message envoyait relancer `lancer_ulysse.bat` alors que tout tournait ; corrigé le jour même (message ne promet plus une issue, dit ce qu'Ulysse fait) |

**⚠ Incohérence à surveiller** : le code ajoute bien `p.interrompu = true` sur
le tour coupé (`ulysse-core.js:816-824`), mais `turnHTML()` — la fonction qui
peint chaque tour — n'a pas été relue dans le détail de ce fork pour confirmer
qu'elle rend visuellement ce drapeau. `scenarios-6-10.md`, écrit en jouant le
scénario, dit explicitement : *« le premier bloc "Ulysse" reste vide et sans
marque »*. Autrement dit, au moment du test, soit le rendu du drapeau n'était
pas encore câblé côté affichage, soit il l'a été après coup sans qu'un nouveau
scénario le confirme. **À vérifier en priorité** avant de considérer ce point
comme clos : c'est explicitement listé dans `relais.md` §6 comme *« non
corrigé, et c'est un choix : […] à trancher, pas à deviner »*.

### 2.2 Mode Plan / Build (le sélecteur qui remplace Chat/Cowork)

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| Sélecteur unique Plan/Build (`setMode2`), mention discrète dans le composeur | `ulysse-app.js:1059-1078`, `#modeMention` | `PASSE-DESIGN-UN-SEUL-FIL.md` (toute la passe) | ÉPROUVÉE AUJOURD'HUI — refonte du jour même, testée dans M-série (raisons du changement) et implicitement dans tous les scénarios S1–S10 |
| Phase automatique Build → Vérif (`phaseBuild()`) | `ulysse-app.js:1087-1092` | `PASSE-DESIGN-UN-SEUL-FIL.md` §3 | PARTIELLEMENT ÉPROUVÉE — dépend du plan (`todo`) entièrement terminé ; pas isolément vérifié qu'un plan 100 % complété bascule bien la mention en « Vérif » |
| Refus structurel d'écrire/exécuter en Plan, à la porte d'approbation | `coreHooks.refusDeMode` (`ulysse-app.js:5098-5117`), `OUTILS_QUI_MODIFIENT` (`:4982-4986`) | `PASSE-DESIGN-UN-SEUL-FIL.md` §3 | ÉPROUVÉE AUJOURD'HUI — **partiellement, et c'est le cœur du Relais 24** : marche pour un `write_file`/`terminal` explicite quand `approval.request` est réellement émis, mais **`approvals.mode = smart` (l'installation de kuchu) n'émet quasiment jamais cette demande** — la porte n'a donc pas grand-chose à refuser en pratique. Le refus s'est bien déclenché sur commande (payload sans `tool`, corrigé le jour même pour lire `pl.command`) |
| Bandeau « ce que le mode Plan retient / ne retient pas » selon `approvals.mode` | `avertissementAccordsHTML()` (`ulysse-app.js:5046-5079`), `porteConsultee()` (`:5044`) | `PASSE-DESIGN-UN-SEUL-FIL.md` §3 | ÉPROUVÉE AUJOURD'HUI — testé dans les deux états (`smart` puis `manual`, après que kuchu a cliqué « Passer les accords en manuel ») ; **le bandeau dit maintenant la vérité mesurée sur cette installation, plus une promesse** |
| **⚠ « accords en manuel » ne garantit pas une demande** | `tools/approval.py:3938`, `tools/file_tools.py:706` côté Hermès (hors Ulysse) | `relais.md` (bandeau du haut, réécrit le 2026-08-12) | ÉPROUVÉE AUJOURD'HUI — mesuré en conditions réelles : `write_file` et `terminal echo` passent sans aucune `approval.request`, même en manuel. C'est un **fait sur Hermès**, qu'Ulysse ne peut pas changer ; le produit s'est adapté en cessant d'affirmer une garantie qu'il ne tient pas |
| Bouton « Passer les accords en manuel » (`config.set`) | `#accordsManuel` (à câbler — présent dans le HTML généré, pas relu ligne à ligne côté handler) | `avertissementAccordsHTML()` | PARTIELLEMENT ÉPROUVÉE — kuchu a cliqué le bouton aujourd'hui et l'effet a été mesuré (voir ci-dessus) ; le code du handler lui-même n'a pas été isolément relu dans ce fork |
| Bouton « Build and Vérif » sous un plan proposé (`todo` tout `pending`) | décrit dans `PASSE-DESIGN-UN-SEUL-FIL.md` §4 (`.m-plan`, `.m-bascule`) | idem | ⚠ **JAMAIS ÉPROUVÉE, ET PROBABLEMENT PAS ENCORE CODÉE** — voir incohérence ci-dessous |

**⚠ Incohérence probable — le bouton « Build and Vérif » n'a pas été retrouvé
dans `ulysse-app.js`.** La passe `PASSE-DESIGN-UN-SEUL-FIL.md` §4 décrit en
détail un encart « Plan proposé — N étapes » avec un bouton `[ Build and
Vérif › ]` qui apparaît quand `todo` renvoie une liste entièrement `pending`.
Aucune fonction `.m-plan` / `.m-bascule` n'a été localisée dans le grep des
fonctions de `ulysse-app.js`, et `dernierPlan()` / `phaseBuild()` (qui existent
bel et bien) ne semblent utilisés que pour la **mention** de phase, pas pour
afficher ce bouton dans le fil. **À vérifier directement dans `turnHTML()`**
(non entièrement relue caractère par caractère dans ce fork) avant de conclure
à une absence totale — mais rien dans les scénarios joués aujourd'hui ne
mentionne avoir vu ce bouton apparaître, ce qui est cohérent avec une passe
documentée mais pas (ou pas entièrement) câblée.

### 2.3 Cadres (rôles)

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| Six rôles fixes (Orchestrateur, Généraliste, Raisonnement, Codage, Appel d'outil, Garde-fou) | `ROLES` (`ulysse-app.js:229-242`) | `endpoints-ulysse.md`, `glossaire-ulysse.md`, `PASSE-DESIGN-VESTIAIRE.md` | ÉPROUVÉE AUJOURD'HUI — S9/S10 (modification directe du texte dans `ROLES`) |
| Gélule « Cadre », repli avec encoches, aucun cadre pré-choisi | `drawRoles()` (`:278-296`), `majCadre()` (`:302-310`) | `PASSE-DESIGN-DISCUTER.md` §1 | ÉPROUVÉE AUJOURD'HUI — sélection/désélection utilisée dans le cours normal des scénarios |
| Préfixe de rôle envoyé en tête du **premier** message seulement | `roleOpts()` (`ulysse-app.js:1120-1128`) | `PASSE-DESIGN-DISCUTER.md` §1 | PARTIELLEMENT ÉPROUVÉE — le mécanisme est lu et cohérent avec les scénarios S9/S10 (modification du prompt puis vérification qu'elle apparaît « dans la trame ET dans le livrable ») ; pas de relecture indépendante de ce fork confirmant l'apparition exacte dans la trame réseau |
| **Édition du prompt d'un rôle depuis l'interface** | — aucune fonction trouvée | non documentée : `ROLES` est un `const` en dur, aucun écran ne l'édite | ⚠ **ÉCART DOC/CODE MAJEUR — voir ci-dessous** |

**⚠ Écart majeur — pas d'UI pour éditer un cadre.** `personas-ulysse.md`
(P5, P7) et `endpoints-ulysse.md` (VES-5 « soul.md d'un agent — écriture
fichier profil ») laissent entendre qu'on peut personnaliser un rôle/agent
depuis Ulysse. **Ce n'est pas le cas** : `ROLES` est un tableau JavaScript en
dur dans `ulysse-app.js`, sans route de lecture ni d'écriture. Les scénarios
S9 et S10 d'aujourd'hui l'ont confirmé en pratique : pour tester une
« modification de script de rôle », le protocole prévu était de **modifier le
fichier source directement**, jouer le scénario, puis **tout annuler par
`git checkout`** — ce n'est donc pas une fonctionnalité produit, c'est un
contournement de test. Personne ne peut, depuis l'écran, changer durablement
le comportement d'un cadre. C'est cohérent avec `PASSE-DESIGN-VESTIAIRE.md`
§5 qui dit explicitement : *« on ne crée pas une compétence depuis Ulysse, et
il n'y a pas d'endpoint pour ça »* — mais ce n'est écrit nulle part pour les
**rôles** eux-mêmes, seulement pour les compétences (skills).

### 2.4 Pièces jointes, capture d'écran, dictée

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| Joindre un fichier via « + » (`file.attach`) | `attacherFichier()` (`ulysse-core.js:1009-1035`) | `PASSE-DESIGN-COLLER-IMAGE.md` | ÉPROUVÉE AUJOURD'HUI — usage courant dans les scénarios S1–S5 (livrables produits/consultés) |
| Coller une image (`collerCapture` → même chemin que « + ») | `ulysse-app.js:1141-1167`, `image.attach_bytes` | `PASSE-DESIGN-COLLER-IMAGE.md` (appliquée) | ÉPROUVÉE AUJOURD'HUI — **le défaut G du matin (aucune trace visible) a été trouvé et corrigé le jour même** ; `image.attach` → `image.attach_bytes` (4016 corrigé le 2026-08-11, veille de ce relais) |
| Pastille « ce modèle ne voit pas les images » | — n'existe pas (décision explicite de ne PAS l'afficher) | `PASSE-DESIGN-COLLER-IMAGE.md` §4 (renversé) | N/A — **décision documentée de ne rien afficher**, ce n'est pas un gap : Hermès décrit l'image via un modèle auxiliaire dans tous les cas, donc afficher une pastille « aveugle » serait faux |
| Dictée (STT), `micEtat()`, `arreterDictee()` | `ulysse-app.js:937-1035` | `endpoints-ulysse.md` DIS-7, VOC-1, `personas-ulysse.md` P10 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui — ni dans M-série ni dans S-série |
| `/api/audio/transcribe`, silence = succès vide (pas une erreur) | `REST.transcribe()` (`ulysse-core.js:203-206`) | commentaire inline | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Vider les pièces jointes après envoi | `viderJointes()` (`ulysse-app.js:1041-1044`) | — | ÉPROUVÉE AUJOURD'HUI (usage courant) |

### 2.5 L'Établi (volet fichiers)

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| Ouvrir/fermer l'Établi, languette quand replié | `setMode()` (`:1224`), `wireCtlEtabli()` (`:1242`) | `PASSE-DESIGN-DISCUTER.md` §1 | PARTIELLEMENT ÉPROUVÉE — usage probable pendant les scénarios de fichiers (S1–S5), non confirmé isolément |
| Parcourir un dossier via `REST.files()` | `drawEtabli()` (`:1260`) | `glossaire-ulysse.md` (Établi) | PARTIELLEMENT ÉPROUVÉE (idem) |
| Bouton de relecture (`etabliRefresh`) | `wireCtlEtabli()` (`:1252-1257`) | commentaire inline, correctif du 2026-08-11 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui, isolément |
| Ouvrir l'Établi **sur un dossier précis** depuis le fil d'Ariane du volet fichier | `ouvrirEtabliSur()` (`:1232-1236`) | `PASSE-DESIGN-FICHIERS.md` §1 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |

### 2.6 Livrables du tour (l'encart en fin de réponse)

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| Encart `.l-livrables` en fin de réponse, liseré coloré | `blocsLivrables` (`ulysse-app.js:314`), écoute de clic globale (`:326-366`) | `PASSE-DESIGN-LIVRABLES-DU-TOUR.md` (appliquée, éprouvée le 2026-08-12 avant ce relais) | ÉPROUVÉE AUJOURD'HUI — **c'est exactement le sujet des scénarios S1 à S5** (JSON/MD/HTML/Python/SQL), qui vérifient chacun la production et l'ouverture d'un livrable |
| Deux espèces dans l'encart : fichier du disque vs bloc de la réponse | `ouvrirTexteEnMemoire()` (`ulysse-artifact.js:365-383`) vs `ouvrirFichier()` (`:386-416`) | `PASSE-DESIGN-LIVRABLES-DU-TOUR.md` §3 | ÉPROUVÉE AUJOURD'HUI — S4 (Python exécuté → fichier réel probable) et S1/S2/S3/S5 (texte de réponse) couvrent les deux cas en pratique |
| Règle d'inclusion (langue de fichier reconnue ou nom explicite, ≥ 2 lignes) | non isolée dans une fonction unique nommée `decouperLivrables` — **non retrouvée telle quelle dans `ulysse-app.js` par grep** | `PASSE-DESIGN-LIVRABLES-DU-TOUR.md` §3, §6 | ⚠ voir incohérence ci-dessous |
| ⤓ inline sur bloc de code (ancien) retiré, remplacé par l'encart | — | `PASSE-DESIGN-LIVRABLES-DU-TOUR.md` §2, §6 | ÉPROUVÉE AUJOURD'HUI (implicitement, via S1–S5 qui décrivent l'encart comme seul point d'accès) |

**⚠ À vérifier** : `PASSE-DESIGN-LIVRABLES-DU-TOUR.md` §6 nomme précisément
`decouperLivrables(src)` (dans `ulysse-view.js`) et `livrablesDuTexte(src)`
comme les fonctions porteuses. Ce fork n'a pas relu `ulysse-view.js` dans
son intégralité (1287 lignes, priorité donnée à `ulysse-app.js` et
`ulysse-core.js`) — la présence exacte de ces deux fonctions sous ce nom
n'est donc **pas vérifiée directement**, seulement déduite de la cohérence
entre la passe de design (qui dit avoir été éprouvée le 2026-08-12, « 484/484
au banc ») et le comportement observé dans S1–S5. À confirmer par une lecture
ciblée de `ulysse-view.js` avant de bâtir un test E2E dessus.

### 2.7 Demande d'accord (approval)

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| Bloc `.ask` dans le fil, 4 portées (`once`/`session`/`always`/`deny`) | `accordHTML()` (`ulysse-app.js:4496`), `repondreAccord()` (`:4559`) | `PASSE-DESIGN-ACCORD.md` (appliquée) | ⚠ **JAMAIS ÉPROUVÉE EN SITUATION RÉELLE — voir section 16** |
| Notification de secours (bulle à 2 boutons + renvoi vers le fil) | `onApproval()` (`ulysse-app.js:4583`) | `PASSE-DESIGN-ACCORD.md` §4 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Refus automatique en Plan avant même d'afficher la question | `coreHooks.refusDeMode` | voir §2.2 | ÉPROUVÉE AUJOURD'HUI (voir §2.2) — mais seulement pour les cas où `approval.request` arrive réellement |
| Retrait d'un accord « toujours » depuis Réglages · Sécurité | — pas trouvé de route dédiée dans `ulysse-app.js` (`ouvrirReglages`, section 3 « Sécurité et accords ») | `AUDIT-ENDPOINTS-REEL.md` §5 bis (la phrase « peut rester ») | ⚠ **la Réglages section 3 actuelle ne montre pas la liste `command_allowlist`** — voir incohérence ci-dessous |

**⚠ Incohérence** : `AUDIT-ENDPOINTS-REEL.md` §5 bis conclut que la phrase
*« vous pourrez revenir sur "toujours" dans Réglages · Sécurité et accords »*
peut rester **à une condition : que l'écran montre vraiment la liste**
(`GET /api/config`, clé `command_allowlist`). En relisant `drawSet()` section
`setSel === 3` (`ulysse-app.js:3708-3731`), l'écran actuel liste des lignes
statiques (« Les accords », « Ce que la page détient », « Qui peut atteindre
Ulysse ») et un bloc `.u-todo` sur les 4 sous-modes — **aucune liste
`command_allowlist` n'y apparaît**. Soit la phrase n'est plus affichée nulle
part (bonne nouvelle), soit elle vit ailleurs et n'a pas été retrouvée dans ce
fork. À vérifier avant de promettre quoi que ce soit sur ce point à un
utilisateur.

---

## 3. Ce que fait l'agent (Plan)

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| Schéma en rangées (repliement de la chaîne, plus un ruban) | `ulysse-view.js` `layout()` (non relu ligne à ligne dans ce fork) | `PASSE-DESIGN-PLAN.md` §1 (appliquée) | PARTIELLEMENT ÉPROUVÉE — un plan à peu d'étapes a probablement été vu (S1–S10 produisent des `todo`), un plan à 12+ étapes (le cas qui justifie le repliement) n'est pas mentionné dans les scénarios |
| Couleur des cartes par famille (terminée 12 %, en cours 19 %) | `drawPlan()` (`ulysse-app.js:1382`) délègue à `ulysse-view.js` `draw()` | `PASSE-DESIGN-PLAN.md` §1 quater | PARTIELLEMENT ÉPROUVÉE (usage visuel non confirmé isolément) |
| Kebab par étape en Détail, actions repliées (`.exp-acts`) | `drawPlan()`, `actionEtape()` (`ulysse-app.js:1516`) | `PASSE-DESIGN-PLAN.md` §1 ter | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui (5 actions proposées : Tout savoir, Ouvrir le fichier, Copier le détail, Rejouer, Me demander avant — la dernière suppose un réglage côté Hermès non confirmé câblé) |
| Le plan vient **uniquement** de l'outil `todo`, jamais deviné dans le texte | `lireTodo()` (`ulysse-core.js:888-913`) | `PASSE-DESIGN-UN-SEUL-FIL.md` §4 | ÉPROUVÉE AUJOURD'HUI — bug trouvé et corrigé le jour même (le résultat pouvait être un objet, pas une chaîne — « [object Object] » sinon) ; corrigé et confirmé contre le vrai Hermès |
| Échelle (zoom/recentrer), caméra tirer/molette | `graph.camReset()`, `graph.camZoom()` (`ulysse-app.js:5245-5255`) | `PASSE-DESIGN-PLAN.md` §1 bis | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| **Reconstruction du plan après `session.resume`** | `conv.resumed` (`ulysse-core.js:433`), `resumeSession()` (`:947-964`) | `AUDIT-ENDPOINTS-REEL.md`, commentaire inline | ⚠ **ÉPROUVÉE AUJOURD'HUI — S7 (Reprise B)**, et c'est une **limite documentée, pas un bug** : `session.resume` ne renvoie jamais le détail structuré d'un outil (`todo` compris), seulement un texte du type « planning 6 task(s) ». Le drapeau `conv.resumed` distingue ce cas d'un silence honnête. **Le graphe du Plan ne peut donc PAS se reconstruire après une reprise**, quel que soit l'état réel côté Hermès — accepté comme limite de l'API, pas à corriger côté Ulysse |
| Flux brut (`voirJrn`, journal d'événements avec compte) | `majJrnBtn()` (`:1537`) | `PASSE-DESIGN-PLAN.md` §4 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Réglage `display.tool_progress` nécessaire pour voir `tool.start`/`tool.complete` | non câblé dans Ulysse (pas de bouton pour le poser) | `AUDIT-ENDPOINTS-REEL.md` §5 | ⚠ **écart potentiel** — si ce réglage est à `false` sur une installation, le Plan reste vide sans qu'Ulysse le sache ni ne le propose ; rien dans le produit ne pose ce réglage au démarrage. Non rencontré aujourd'hui (l'installation de kuchu semble l'avoir activé, vu le volume de `tool.start`/`tool.complete` traités dans les scénarios), mais reste un point aveugle pour une autre installation |
| **Bouton « Build and Vérif » dans le plan proposé** | voir §2.2 | `PASSE-DESIGN-UN-SEUL-FIL.md` §4 | ⚠ voir incohérence en §2.2 |

---

## 4. Travaux

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| Liste des sessions (`REST.sessions`), filtre (`travQ`) | `drawWorksListe()` (`ulysse-app.js:1651`) | `PASSE-DESIGN-LISTES.md` §2-3 | ÉPROUVÉE AUJOURD'HUI — S6/S7/S8 (reprise via Travaux) |
| Reprendre une session (`data-resume` → `session.resume`) | `reprendre()` (`:1741`) | `PASSE-DESIGN-LISTES.md` §1 | ÉPROUVÉE AUJOURD'HUI — **S6 (Reprise A)** : mémoire réelle confirmée tenir (le secret redonné correctement), mais un **bug d'affichage a été trouvé et corrigé le jour même** : `contentToText(m.content)` lisait un champ `content` qui n'existe pas dans la vraie réponse Hermès (le champ réel est `text`) — le fil affichait l'accueil par-dessus trois bulles vides. Corrigé, plus un second défaut connexe (rôle d'outil inconnu produisant une bulle vide, traité en l'ignorant proprement plutôt qu'en l'inventant) |
| Rang épinglé / récent / archivé (`PATCH /api/sessions/{id}`) | décrit dans la passe, pas retrouvé de fonction dédiée par grep dans `ulysse-app.js` | `PASSE-DESIGN-LISTES.md` §1 bis | ⚠ **JAMAIS ÉPROUVÉE, statut de câblage incertain** — voir incohérence ci-dessous |
| Actions de ligne (Renommer, Épingler, Archiver, Supprimer) | `.acts`, `data-a` | `PASSE-DESIGN-LISTES.md` §1 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| **F5 direct, sans passer par Travaux (témoin)** | comportement du navigateur + `resetSession()` implicite au rechargement | non documentée en passe séparée | ÉPROUVÉE AUJOURD'HUI — **S8 (Reprise C), scénario témoin** : le fil doit redevenir vide proprement, sans planter |

**⚠ À vérifier** : `PASSE-DESIGN-LISTES.md` §1 bis présente l'épinglage et
l'archivage de sessions comme la vraie nouveauté de la passe (« ce qui décide
de la tenue de Travaux au bout de six mois »). Le grep des fonctions de
`ulysse-app.js` ne fait apparaître ni `epingler`, ni `archiverSession`, ni
d'appel visible à `REST.patchSession` en dehors de sa définition dans
`ulysse-core.js:148`. **Il est possible que cette partie de la passe n'ait
jamais été câblée côté écran**, malgré `REST.patchSession` existant côté
couche réseau. À confirmer par une lecture ciblée de `drawWorksListe()` en
entier (seule la ligne de définition a été lue dans ce fork) avant de la
classer « fonctionnalité existante ».

---

## 5. Livrables (l'explorateur, à ne pas confondre avec l'encart de tour)

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| Explorateur de dossier (`REST.files`), fil d'Ariane cliquable | `drawLivListe()` (`ulysse-app.js:1806`), `livFil()` (`:1794`) | `PASSE-DESIGN-LISTES.md` §5 | PARTIELLEMENT ÉPROUVÉE — probablement traversé pour ouvrir des livrables produits (S1–S5), sans confirmation isolée du fil d'Ariane cliquable |
| Actions : poser sur l'Établi, copier le chemin, ouvrir un dossier | `.acts` sur `.row` | `PASSE-DESIGN-LISTES.md` §1 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Filtre (`livQ`) | `boot()` (`:5316-5318`) | `PASSE-DESIGN-LISTES.md` §3 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |

**Rappel documentaire** (`PASSE-DESIGN-LIVRABLES-DU-TOUR.md` §0) : « Livrables »
n'a **rien à voir** avec l'encart de fin de tour du §2.6 — c'est un simple
explorateur de fichiers sur un dossier, sans lien avec la conversation en
cours. Les deux portent des mots proches (« livrable ») pour deux objets
différents ; à garder en tête pour ne pas les confondre dans un futur banc
E2E.

---

## 6. Projets

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| Liste à trois espèces (vrai projet / dossier déduit / « Home ») | `drawProjets()`, `carteProjetVrai()` (`:2165`), `carteProjetDeduit()` (`:2263`) | `PASSE-DESIGN-PROJETS.md` §1 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui — aucun scénario M/S ne touche aux Projets |
| « Ranger un dossier en projet » (`projects.create`, ne crée rien sur le disque) | `feuilleProjet()` (`:2383`), `#newProj` | `PASSE-DESIGN-PROJETS.md` §3 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Avertissement dossiers imbriqués absorbés + ligne repliable « Contient N dossiers » | `majDedans()` (`:2207`), `dedansHTML()` (`:2234`) | `PASSE-DESIGN-PROJETS.md` §8 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Archiver / Restaurer (pas de suppression, rien n'expire) | `brancherArchive()` (`:2609`), `feuilleArchiver()` (`:2570`) | `PASSE-DESIGN-PROJETS.md` §4 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Supprimer définitivement (depuis Archivés seulement, double confirmation) | `feuilleSupprimer()` (`:2591`) | `PASSE-DESIGN-PROJETS.md` §4 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui — **écriture destructive, à tester avec précaution** |
| Bandeau « la mémoire reste commune, pas cloisonnée par projet » | `.warnbox` réemployée | `PASSE-DESIGN-PROJETS.md` §2 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Gélule « lieu » dans Discuter (`conv.info.project`) | `geluleLieu()` (`:1945`), `majLieu()` (`:2018`) | `PASSE-DESIGN-LIEU.md` | ⚠ PARTIELLEMENT ÉPROUVÉE — indirectement : les scénarios de reprise (S6-S8) impliquent forcément une session avec un `cwd`, donc `conv.info` a été peuplé ; mais la gélule elle-même (affichage, dédoublement ambre si `SESSION_CWD` ≠ `conv.info.cwd`, « Travailler ici » sans fermer le fil) n'a pas été spécifiquement observée aujourd'hui |

---

## 7. Automatisations

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| Liste des tâches cron (`GET /api/cron/jobs`) | `wireAutos()` (`ulysse-app.js:2964`), `REST.cronJobs()` | `endpoints-ulysse.md` AUTO-1, `personas-ulysse.md` P3 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Pause/reprise/déclenchement (`data-tog`, `data-fire`) | `REST.pauseCron/resumeCron/triggerCron` | `PASSE-DESIGN-LISTES.md` §8 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Webhooks (liste, déclenchement signé côté serveur) | `REST.webhooks()`, `REST.fireWebhook()` (`ulysse-core.js:182-189`) | `AUDIT-ENDPOINTS-REEL.md` E2/E3 (corrigés) | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui — **et c'est une écriture qui touche un système externe (l'URL cible du webhook)**, donc à isoler avec précaution dans un futur banc |
| ⚠ Cartes de webhook sans `data-open` (ne se déplient pas malgré l'apparence) | — | `PASSE-DESIGN-LISTES.md` §8 (réserve non tranchée) | non testé ; réserve documentée mais pas confirmée corrigée |

---

## 8. Vestiaire

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| Vue Rôles (6, à plat) / Compétences (99, groupées par provenance repliable) | `vListe()` (`:3036`), `grilleV()` (`:3124`) | `PASSE-DESIGN-VESTIAIRE.md` §2 (appliquée) | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui (dans le sens : ouvrir l'écran et le parcourir — S9/S10 modifient `ROLES` en dur, sans passer par cet écran) |
| Volet de détail complet (`.vdet-head`/`.vdet-body`, plus de texte coupé) | `drawVDetail()` (`:3166`) (correctif appliqué) | `PASSE-DESIGN-VESTIAIRE.md` §1 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Sélection par identité (`vSelId`), survit à un filtrage | `boot()` (`:5261`) — `vSelId = null` au changement de vue | `PASSE-DESIGN-VESTIAIRE.md` §3 (correctif appliqué) | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Activer/désactiver une compétence (`POST /api/skills/toggle`) | non câblé | `PASSE-DESIGN-VESTIAIRE.md` §4, `relais.md` §6 (« décisions, pas du code ») | N/A — **délibérément non branché**, ce n'est pas un gap silencieux : décision explicite documentée |

---

## 9. Réglages

Sept sous-écrans (`SETS`, `ulysse-app.js:3206-3208`) : Général · Ce qu'Ulysse
sait · Le cerveau · Sécurité et accords · Connexions · Dépenses · Avancé.

| Sous-écran | Où (code) | Documenté | Statut |
|---|---|---|---|
| **Général** — langue (figée FR), densité, mode sans mémoire, où tourne Ulysse | `drawSet()` setSel 0 (`:3631-3656`) | `PASSE-DESIGN-REGLAGES-TERMINAL-REPERES.md` | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui — le mode sans mémoire (incognito) est plutôt activé depuis le menu « ⋯ » de Discuter en pratique |
| **Ce qu'Ulysse sait** — `GET /api/memory`, fichiers de mémoire, versions gardées | `drawSet()` setSel 1 (`:3659-3677`), `drawMemFiles()` | `PASSE-DESIGN-ECRITURE-MEMOIRE.md` | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui — **c'est l'écran d'écriture dans la mémoire, la fonctionnalité la plus sensible du produit (écrase un fichier de profil) : voir section 16** |
| **Le cerveau** — override modèle Discussion (local) / Cowork (`/api/model/set`) | `drawSet()` setSel 2 (`:3679-3706`), `chargerModelesCerveau()` (`:3570`) | `LOI-DU-CERVEAU.md` (« Ulysse ne choisit jamais »), `PASSE-DESIGN-REGLAGES-TERMINAL-REPERES.md` §1 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui — **écrit un override durable, à tester avec précaution** (voir section 16) |
| **Sécurité et accords** — état des accords, réserve sur les 4 sous-modes | `drawSet()` setSel 3 (`:3708-3731`) | `PASSE-DESIGN-REGLAGES-TERMINAL-REPERES.md` §1 | PARTIELLEMENT ÉPROUVÉE — le **contenu réel** de cette section (les 4 sous-modes Auto/Accept-edit/Manuel/Plan) reste `.u-todo`, non câblé ; en revanche `modeAccords` (lu via `config.get`) et le bandeau associé, eux, ont été éprouvés aujourd'hui (voir §2.2) — la section Réglages proprement dite n'a pas été visitée en tant qu'écran |
| **Connexions** — MCP, Telegram, plateformes (lecture seule, rien de branché) | `drawSet()` setSel 4 (`:3733-3752`) | `endpoints-ulysse.md` MCP-1, DIST-1, `personas-ulysse.md` P7/P8 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui — délibérément non branché (« une clé saisie dans une page est une clé qui traîne ») |
| **Dépenses** — `GET /api/analytics/usage` | `drawSet()` setSel 5 (`:3755-3787`) | non documentée en passe séparée | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| **Avancé** — `/api/status` brut | `drawSet()` (sinon, `:3790-3802`) | `PASSE-DESIGN-REGLAGES-TERMINAL-REPERES.md` §7 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui (probablement consulté en coulisse pendant le débogage des scénarios, mais pas comme un test dédié) |

**⚠ Écart** : `endpoints-ulysse.md` REG-1 à REG-10 décrit dix réglages
(`user.md`, `soul.md`, `MEMORY.md`, `ACQUIS.md`, niveau charte, 8 garde-fous,
mémoire 4 étages, choix cerveau GEN/REL, réindexer coffre, diagnostic/logs).
L'écran actuel de Réglages n'a **que sept sections**, et aucune n'expose
`ACQUIS.md`, le niveau de charte (ess/met/comp) ni les « 8 garde-fous »
individuellement — ces notions viennent de la toute première carte
d'endpoints (2026-08-07) et n'ont pas survécu telles quelles dans les passes
de design successives. Ce n'est pas nécessairement un défaut (le produit a pu
choisir un vocabulaire plus simple), mais c'est un écart réel entre le
document fondateur et l'écran livré, à trancher consciemment plutôt qu'à
laisser filer.

---

## 10. Terminal CLI

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| WebSocket `/api/pty`, `hermes --tui` rendu par xterm.js | `ouvrirPty()` (`:3901`), `ptyUrl()` (`:3834`) | `PASSE-DESIGN-TERMINAL.md` (appliquée) | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui — **c'est le seul endroit du produit qui ouvre un vrai processus interactif sur la machine ; haut risque, jamais testé** |
| Colonne de réglages repliée en deux pop (apparence / aide-mémoire) | `poserOutils()` (`:4112`) | `PASSE-DESIGN-TERMINAL.md` §0a | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Plein écran applicatif, sortie par bouton nommé (jamais Échap seul confisqué) | `basculerPlein()` (`:4077`) | `PASSE-DESIGN-TERMINAL.md` §0b | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Aide-mémoire à deux familles : copier (hors session) / poser (`data-poser`, dans la session) | `poserDansTerm()` (`:4408`), `ligneTui()` (`:4167`) | `PASSE-DESIGN-TERMINAL.md` §7 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Ouvrir une vraie console Hermès (`POST /ulysse/console`) | `REST.ouvrirConsole()` | `CONTRAT-INTERFACE.md` (« le seul endroit où Ulysse lance un processus sur la machine ») | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui — **deuxième point d'exécution de processus, jamais testé** |
| Séquence sortir/réécrire/réinstaller pour `#tecran` (ne pas couper le PTY) | `drawTerm()` (`:4174`) | `PASSE-DESIGN-TERMINAL.md`, `CONTRAT-INTERFACE.md` §2.1 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Avertissement « les accords donnés dans Ulysse ne s'appliquent pas au Terminal » | `#tSortie`, section « Sécurité et accords » | `PASSE-DESIGN-REGLAGES-TERMINAL-REPERES.md` §4 | non testé, mais **fait important à retenir pour tout futur test du Terminal** : le mode Plan d'Ulysse ne protège rien ici |

---

## 11. Repères (glossaire des icônes)

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| Liste des icônes documentées, filtre | `drawGlossary()` (`:4431`) | `PASSE-DESIGN-REGLAGES-TERMINAL-REPERES.md` §5-6 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| ⚠ Le titre promet « chaque signe », mais 17 icônes déclarées par forme (`{tune:true}` etc.) n'ont ni `nm` ni `r` | `ulysse-icons.js` (non relu dans ce fork) | `PASSE-DESIGN-REGLAGES-TERMINAL-REPERES.md` §5 | écart documenté, statut de correction non vérifié (« 24 signes documentés sur 41 » au moment de la passe — pas revérifié depuis) |

---

## 12. Premier lancement

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| Détection « premier lancement » côté `serve.py` (`CFG.PREMIER`) | `lancerFirst()` (`ulysse-app.js:4750`), `CFG.PREMIER` (`ulysse-core.js:44`) | `PASSE-DESIGN-PREMIER-LANCEMENT.md` §7 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui — kuchu a déjà passé ce cap, aucun scénario ne repart de zéro |
| Quatre vérifications en parallèle (Hermès, agent, compétences, gateway) | `lancerFirst()` (`:4758-4794`) | `PASSE-DESIGN-PREMIER-LANCEMENT.md` §2 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| États dégradés (Hermès muet / gateway arrêté / profil absent) | `drawFirst()` (`:4664`) | `PASSE-DESIGN-PREMIER-LANCEMENT.md` §4 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| « Entrer quand même » toujours disponible | `drawFirst()` boutons `data-go` | `PASSE-DESIGN-PREMIER-LANCEMENT.md` §5 | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Marqueur posé via `POST /ulysse/premier-vu` | `quitterFirst()` (`:4738-4747`) | idem | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui — **ce marqueur, une fois posé, ne peut être retesté sans le retirer côté `serve.py`, hors du dossier servi** |

---

## 13. Notifications (la cloche)

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| `NKIND` à quatre genres — decision, panne, livrable, auto | `Notifs` (non isolé par grep dans `ulysse-app.js` — probablement dans `ulysse-view.js`, non relu en entier) | `PASSE-DESIGN-NOTIFICATIONS.md` §0 | PARTIELLEMENT ÉPROUVÉE |
| Genre `decision` (demande d'accord) | `onApproval()` (`ulysse-app.js:4583`) | `PASSE-DESIGN-ACCORD.md` | ⚠ **techniquement jamais déclenché aujourd'hui** — voir §2.7 et section 16 (aucune `approval.request` réelle observée) |
| Genre `panne` (Hermès injoignable) | `majPanne()` (`:4823-4851`) | `PASSE-DESIGN-RAIL.md` §2, `PASSE-DESIGN-NOTIFICATIONS.md` (mis à jour) | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui — `/api/status` n'a pas échoué pendant les scénarios (M10/S6-S8 coupent le WebSocket ou l'onglet, pas `/api/status` lui-même) |
| Genres `livrable` et `auto` | — non poussés, volontairement | `PASSE-DESIGN-RAIL.md` §4, `PASSE-DESIGN-NOTIFICATIONS.md` §4 | N/A — **décision documentée de ne pas les brancher** (interprétation non fiable d'un événement) |
| Groupes « Votre réponse est attendue » / « Ce qui ne va pas » / « Récent » | `PASSE-DESIGN-NOTIFICATIONS.md` §1 (appliquée) | idem | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui (aucune notification à grouper n'a été générée) |
| Horodatage recalculé (« depuis 20 min ») | `PASSE-DESIGN-NOTIFICATIONS.md` §2 | idem | JAMAIS ÉPROUVÉE EN SITUATION RÉELLE aujourd'hui |
| Toasts (`.toast`, `#toasts`) | — jamais utilisés | `PASSE-DESIGN-NOTIFICATIONS.md` §4 | N/A — composant présent dans la maquette, volontairement non branché (pas d'événement fiable pour `livrable`/`auto`) |

---

## 14. Le volet fichier (transverse — Discuter, Établi, Livrables)

| Fonctionnalité | Où (code) | Documenté | Statut |
|---|---|---|---|
| Un seul visualiseur, le volet (`#artifactViewer`), plus de modale `#sFile` | `ouvrirFichier()` (`ulysse-artifact.js:386-416`) | `PASSE-DESIGN-FICHIERS.md` (appliquée) | ÉPROUVÉE AUJOURD'HUI — usage direct dans S1-S5 (ouverture des livrables produits) |
| Carte `[artifact: chemin]` posée par l'agent dans sa réponse, sur n'importe quel chemin | `ARTIFACT_RE`, `artifactCardHTML()` (`:32-163`) | `PASSE-DESIGN-FICHIERS.md` §2 | PARTIELLEMENT ÉPROUVÉE — l'ouverture via l'encart de livrables (§2.6) a été testée ; la balise `[artifact:]` posée spontanément par l'agent en dehors de l'encart n'est pas spécifiquement confirmée aujourd'hui |
| Rendu CSV en tableau (en-tête collant, séparateur détecté) | `csvTableHTML()` (`:127-144`), `csvSeparateur()` (`:92-101`) | `relais.md` §3 (correctif du jour, avant ce relais) | ÉPROUVÉE AUJOURD'HUI — plausible via un scénario CSV, mais aucun des scénarios S1-S5 n'est explicitement un CSV (JSON, MD, HTML, Python, SQL) ; **le rendu CSV en particulier n'a probablement pas été retesté aujourd'hui**, seulement corrigé la veille/le matin |
| Bouton `⟨/⟩` désactivé pour ce qui n'a qu'une seule lecture | `renderArtifactBody()` (`:295-350`), `aUnRendu()` (`:84-86`) | `relais.md` §3 (correctif du jour) | PARTIELLEMENT ÉPROUVÉE (voir ci-dessus) |
| Document entier rendu, jamais tronqué (limite honnête à 2 Mo) | `renderArtifactBody()`, `PREVIEW_MAX_BYTES` (`ulysse-core.js:1111`) | commentaire inline (correctif du jour) | PARTIELLEMENT ÉPROUVÉE — les livrables produits aujourd'hui sont petits (comptes, extraits SQL) ; le cas « fichier proche de 2 Mo » n'a pas été mis en scène |
| Contenu en mémoire (pas sur le disque), même volet | `ouvrirTexteEnMemoire()` (`:365-383`) | `PASSE-DESIGN-LIVRABLES-DU-TOUR.md` §3 | ÉPROUVÉE AUJOURD'HUI (S1-S3, S5 — blocs produits « dans la réponse ») |

---

## 15. Les incohérences doc/code les plus importantes

Classées par ce qu'elles coûteraient si on les ignorait en construisant un
banc E2E dessus.

1. **« accords en manuel » ne garantit aucune demande d'approbation, sur
   Hermès lui-même.** `tools/approval.py:3938` auto-approuve tout ce qui ne
   déclenche aucun motif de danger, **quel que soit** `approvals.mode`.
   `tools/file_tools.py:706` ne verrouille que quatre noms de fichiers
   (`agents.md`, `claude.md`, `soul.md`, `.cursorrules`) — un `write_file`
   ordinaire ne passe **par aucune porte, à aucun réglage**. Toute la
   documentation de conception antérieure au 2026-08-12 (`endpoints-ulysse.md`
   PERM-1, `glossaire-ulysse.md` « Deux couches de permission », `plan-ulysse.md`
   étape 8) suppose que les 4 sous-modes d'`approvals.mode` gouvernent ce qui
   est demandé. **Ce n'est vrai qu'à moitié**, et un banc de test qui vérifierait
   « en manuel, chaque écriture déclenche une demande » testerait un
   comportement qui n'existe pas côté Hermès — il faut tester le **refus côté
   Ulysse** (`refusDeMode`), pas une garantie côté Hermès.

2. **Le mode Discussion/Cowork a disparu et a été remplacé par Plan/Build le
   2026-08-12** — mais `endpoints-ulysse.md`, `plan-ulysse.md`,
   `personas-ulysse.md` (P2, P6, P7) et `glossaire-ulysse.md` (« Cowork »,
   « Discussion », « Sous-mode ») décrivent tous l'ancien système à deux
   surfaces (Discussion = chat pur sans agent, Cowork = agent complet), avec
   4 sous-modes de permission (Auto/Accept-edit/Manuel/Plan) réservés à
   Cowork. **Ce vocabulaire est obsolète dans sa moitié « surface »** : il
   n'y a plus qu'un seul moteur (Hermès, toujours), et le sélecteur ne choisit
   plus un transport mais un droit d'écriture (Plan/Build). Un test ou un
   persona écrit contre l'ancien vocabulaire (« teste que le mode Discussion
   n'ouvre pas de session ») testerait une fonctionnalité retirée
   intentionnellement (`sendPure`, `/proxy/chat` côté client, `PROXY_MAX_TOKENS`
   et `.u-coupe` — tous supprimés le même jour, `PASSE-DESIGN-UN-SEUL-FIL.md`
   §6).

3. **La demande d'accord dans le fil (`.ask`, 4 portées) n'a jamais été
   déclenchée par un événement réel `approval.request`** — malgré une passe de
   design complète, un code qui semble prêt (`accordHTML`, `repondreAccord`,
   `data-ch`), et un banc jsdom qui la couvre avec un faux Hermès. `relais.md`
   §6 le dit explicitement : *« jamais éprouvé en vrai : la porte d'approbation
   elle-même. Elle n'a jamais été appelée, dans aucun réglage. »* C'est la
   fonctionnalité la plus documentée et la plus testée-au-banc du produit, et
   c'est simultanément celle qui a le **moins** de preuve de fonctionnement
   réel — un paradoxe qu'un futur banc E2E doit corriger en priorité (voir
   section 16).

4. **Pas d'UI pour éditer le prompt d'un rôle**, alors que
   `personas-ulysse.md` (P5, P7) et `endpoints-ulysse.md` VES-5 laissent
   entendre une personnalisation possible des agents/rôles depuis Ulysse.
   `ROLES` est un `const` en dur ; le seul moyen constaté aujourd'hui de le
   modifier est d'éditer le fichier source puis `git checkout` pour annuler
   (protocole des scénarios S9/S10). Ce n'est ni un bug ni forcément un
   manque à corriger — mais c'est un écart net entre l'intention documentée
   (« agents spécialisés… soul.md ») et ce que le produit livre.

5. **Le bouton « Build and Vérif » décrit par `PASSE-DESIGN-UN-SEUL-FIL.md`
   §4 n'a pas été retrouvé dans le code lu**, ni observé dans les scénarios
   d'aujourd'hui. La bascule Plan→Build existe et fonctionne (manuellement,
   via la mention sous le champ), mais le mécanisme « le plan proposé porte
   son propre bouton de validation » semble soit non câblé, soit vivant dans
   une portion de `ulysse-app.js` ou `ulysse-view.js` non couverte par ce
   fork. À vérifier avant de construire un scénario de test dessus.

6. **`endpoints-ulysse.md` et une partie de `glossaire-ulysse.md` sont des
   documents de cadrage du 2026-08-07, jamais mis à jour depuis** : dix
   sections de Réglages promises (REG-1 à REG-10) contre sept livrées, sept
   entrées de menu promises contre dix livrées, un système de rôles à 6+3
   « fantômes » jamais retrouvé nulle part dans le code (les « 3 fantômes du
   Garde-fou » de `endpoints-ulysse.md` VES-3 et `glossaire-ulysse.md` n'ont
   pas de trace dans `ROLES`, qui n'a que 6 entrées et aucune notion de
   sous-composant). Aucun de ces écarts n'est un défaut du produit — chacun
   est absorbé par une passe de design postérieure et documentée — mais ce
   sont des pièges pour quiconque lirait `endpoints-ulysse.md` en le croyant
   à jour.

---

## 16. Jamais éprouvé, trié par risque — le socle du prochain banc E2E

Cette liste est le point de départ de la prochaine phase (un banc contre le
**vrai** Hermès, pas contre le faux du `test_page.js` — dont plusieurs défauts
d'aujourd'hui ont montré qu'il ne reproduit pas fidèlement les payloads
réels). Triée du risque le plus élevé (écriture disque, flux d'approbation,
canaux distants) au plus faible.

### Risque élevé — écrit sur le disque, exécute, ou engage une ressource externe

1. **La demande d'accord dans le fil (`.ask`), pour de vrai.** Il faut un
   scénario qui **fait mordre un motif de danger réel** (`tools/approval.py`)
   pour que `approval.request` soit émis en pratique — sinon la porte
   n'existe que sur le papier. C'est, de très loin, le test le plus important
   à construire en premier : c'est la fonctionnalité qui protège l'utilisateur.
2. **Écriture dans la mémoire** (Réglages · Ce qu'Ulysse sait) — `POST
   /ulysse/ecrire`, la copie datée avant écrasement, la liste des versions
   gardées, le retour en arrière. Jamais déclenché aujourd'hui ; c'est une
   écriture qui écrase un fichier de profil, avec une doctrine entière
   (`PASSE-DESIGN-ECRITURE-MEMOIRE.md`) qui mérite d'être vérifiée en vrai,
   pas seulement lue.
3. **Le Terminal CLI** (`/api/pty`, WebSocket) et **la console Hermès**
   (`POST /ulysse/console`) — les deux seuls endroits du produit qui ouvrent
   un vrai processus sur la machine. Zéro test aujourd'hui.
4. **Suppression définitive d'un projet** (`projects.delete`, en cascade,
   depuis Archivés) — destructif, jamais testé.
5. **Webhooks** — déclenchement (`fireWebhook`, signature HMAC côté serveur)
   vers une cible externe. Jamais testé ; à isoler dans un environnement
   contrôlé.
6. **Automatisations (cron)** — pause/reprise/déclenchement d'une tâche
   planifiée. Jamais testé.
7. **Override de modèle** (Réglages · Le cerveau) — écrit un override
   durable côté `ulysse-config.js` (Discussion) ou via `/api/model/set`
   (Cowork, portée « main » = tout le profil). Jamais testé ; changer le
   modèle par défaut de tout le profil depuis un clic mérite un test dédié
   avant qu'un utilisateur le fasse par erreur.
8. **Ranger un dossier en projet, avec absorption de sous-dossiers.** Jamais
   testé ; le cas documenté (`PASSE-DESIGN-PROJETS.md` §8) où un rangement
   fait disparaître des dossiers plus profonds de la liste mérite une
   vérification réelle, pas seulement la lecture du correctif.
9. **Archiver un projet** — non destructif en théorie (« rien n'expire »),
   mais jamais vérifié en pratique.

### Risque moyen — modifie un état durable mais réversible, ou touche une ressource locale

10. **Dictée (STT)** — `/api/audio/transcribe`, y compris le cas silence =
    succès vide. Jamais testé.
11. **Mode sans mémoire (incognito)** de bout en bout — poser le drapeau,
    vérifier que le fil ne réapparaît pas dans Travaux, que la fermeture de
    fenêtre le clôt bien (`close_on_disconnect`). Jamais isolément testé
    aujourd'hui (le mécanisme a été lu, pas rejoué).
12. **Épingler/Archiver/Renommer/Supprimer une session** depuis Travaux —
    statut de câblage lui-même incertain (voir incohérence §4). À vérifier
    avant de construire un test dessus.
13. **Genre de notification `panne`** — jamais déclenché en conditions
    réelles (aucune coupure `/api/status` observée aujourd'hui, seulement des
    coupures de WebSocket).
14. **Vestiaire** en tant qu'écran parcouru (vue Rôles/Compétences, volet de
    détail, filtre, groupes repliables) — jamais ouvert aujourd'hui en tant
    que tel.
15. **Premier lancement**, tous les cas dégradés (Hermès muet, gateway
    arrêté, profil absent) — jamais rejoués, kuchu a déjà passé ce cap.
16. **`⟨/⟩` sur un CSV réel et le rendu de tableau** — corrigé le jour même,
    mais pas revérifié dans les scénarios d'aujourd'hui (aucun des S1-S5
    n'est un CSV).
17. **Réglages · Connexions** (MCP, Telegram) — délibérément non branché,
    mais la page elle-même (lecture des plateformes actives) n'a pas été
    ouverte aujourd'hui.

### Risque faible — lecture seule, ou purement local à l'affichage

18. **Dépenses** (`/api/analytics/usage`) — jamais ouvert.
19. **Repères** (glossaire des icônes) et son filtre — jamais ouvert.
20. **Automatisations**, la liste seule (sans déclencher quoi que ce soit).
21. **Zoom/recentrer/caméra du schéma Plan**, kebab d'étape et ses 5 actions.
22. **Épingler/replier le rail**, densité épurée/dense.
23. **Toasts** — composant jamais branché ; à laisser tel quel plutôt qu'à
    tester (aucun événement fiable ne les déclenche, par choix documenté).

---

*Document produit par lecture seule : aucun scénario relancé, aucun fichier
de code touché, aucune documentation existante réécrite pour l'écrire.*
