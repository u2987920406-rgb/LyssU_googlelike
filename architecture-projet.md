# Architecture fichiers & nature de l'app — Projet Ulysse

Réflexion sur la structure de livraison (2026-08-07). Répond aux questions :
« faut-il revoir l'architecture pour laisser de la marge ? » et
« app web ou app de bureau ? ».

══════════════════════════════════════════════════════════════
1. ÉTAT ACTUEL DE LA MAQUETTE
══════════════════════════════════════════════════════════════
maquette-ulysse-google-33.html = 1 fichier, 4486 lignes, CSS/JS/SVG inline,
zéro dépendance externe.
  • Pour un MOCK autonome : excellent (se transporte, s'ouvre en double-clic).
  • Pour un PRODUIT CÂBLÉ : MAUVAIS pour la « marge ». Trop gros, trop
    entrelacé (état factice global drawSet, toasts simulés). Modifier un panneau
    risque d'en casser un autre. Zéro séparation endpoints / UI / état.

══════════════════════════════════════════════════════════════
2. RECOMMANDATION : SPLITTER AVANT DE CÂBLER (pour la marge)
══════════════════════════════════════════════════════════════
Garder la maquette comme RÉFÉRENCE VISUELLE, et construire la version câblée
en modules. Proposition de structure (dans un dossier `app/` à côté) :

  app/
    index.html                  ← shell (menu + conteneurs de panneaux)
    styles/
      base.css                  ← variables, thème (Google Material 3)
      panels.css                ← Discuter / Studio / Vestiaire / Projets / Réglages
    js/
      core/
        api.js                  ← clients signés : proxyFetch(), serveRpc(),
                                  webhookPost()  (TOUTE la glue réseau ici)
        endpoints.js            ← LA CARTE endpoints EN CODE (1 seule source de
                                  vérité : entrée→endpoint→sortie). C'est le
                                  pendant exécutable de endpoints-ulysse.md.
        mock.js                 ← mode "mock" : renvoie des données fictives
                                  (clone la maquette) pour itérer le design SANS
                                  le moteur.
      state/
        session.js              ← état session (Discussion/Cowork, sous-mode)
        roles.js                ← store des 6 rôles + agents (lu depuis Hermès)
        memory.js               ← bridge vers coffre-mémoire Obsidian (plus tard)
      panels/
        discuter.js
        studio.js               ← lit /api/sessions/{id}/messages en live
        vestiaire.js
        projets.js
        reglages.js
      main.js                   ← bootstrap, route le menu, bascule mock/réel
    assets/
      icons.js                  ← SVG inline (réutilisés, pas dupliqués)

PRINCIPE « marge » : un flag global USE_MOCK (true/false). En mock, l'UI tourne
SANS Hermès (design/ergo iterables). En réel, elle appelle endpoints.js. On peut
 ainsi livrer l'UI avant le moteur, et déboguer l'un sans l'autre. C'est la
 « marge » demandée : on ne durcit rien, on peut basculer.

══════════════════════════════════════════════════════════════
3. APP WEB ou APP DE BUREAU ? (clarification)
══════════════════════════════════════════════════════════════
RÉPONSE : c'est une APPLICATION WEB LOCALE, packagée pour SE RENDRE comme une
app de bureau. Pas un binaire natif Electron par défaut.

  • Le .bat installateur pose les moteurs + un petit serveur statique.
  • Le raccourci bureau lance : hermes proxy + gateway + serve (invisibles)
    PUIS ouvre le navigateur sur http://localhost:<ui-port>.
  • L'utilisateur voit « une app sur son bureau » → ouvre son navigateur sur
    l'interface Ulysse. C'est exactement « webui perso ».

Pourquoi PAS un binaire Electron natif d'emblée :
  • Hermès a une app desktop (Electron) avec un plugin SDK strict (pas de JSX,
    imports limités à @hermes/plugin-sdk, pas de couleurs hardcoded…). Ça
    contraindrait notre design Material 3 et réduirait la marge.
  • La voie web locale donne le contrôle total de l'UI + respecte « ne rien
    réinventer » (on s'appuie sur hermes serve :9119, déjà fait pour ça).

ÉVOLUTION POSSIBLE (plus tard, si souhaité) : envelopper la web app dans un
shell natif léger (Tauri/Electron) pour un vrai .exe — mais ce n'est pas
 nécessaire pour le socle. La web app locale suffit à « app sur le bureau ».

══════════════════════════════════════════════════════════════
4. OBSIDIAN & COFFRE-MÉMOIRE (à venir)
══════════════════════════════════════════════════════════════
kuchu va mettre en place le dossier « Mère » + coffre-mémoire Obsidian pour que
je visualise le rendu post-installateur. À noter comme PRÉREQUIS :
  • L'installateur inclut un pack Obsidian (+ vault « Mère » + coffre-mémoire).
  • memory.js (state/) fera le bridge : toute skill apprise / notion modifiée
    dans Ulysse est retranscrite dans coffre-mémoire. (brancher PLUS TARD,
    session dédiée)
  • Voir endpoints-ulysse.md bloc « Mémoire via Obsidian » + memory.md.

══════════════════════════════════════════════════════════════
5. TENTATIVES ANTÉRIEURES (contexte à fournir par kuchu)
══════════════════════════════════════════════════════════════
kuchu a indiqué plusieurs essais précédents pour créer Ulysse. À intégrer dès
réception : comprendre ce qui a été tenté (et pourquoi ça a coincé) évitera de
refaire les mêmes erreurs. (Fichiers à fournir par kuchu.)
