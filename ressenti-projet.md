# Ressenti & estimation d'effort — Projet Ulysse

Écrit à chaud (2026-08-07), après le cadrage + l'étape zéro réelle.
But : donner un avis honnête pour la suite, pas vendre du rêve.

══════════════════════════════════════════════════════════════
BILAN GLOBAL
══════════════════════════════════════════════════════════════
Le projet est SAIN. L'architecture « masque visuel sur Hermès » est la bonne :
on n'invente pas d'agent, on assemble une coquille. Le moteur (Hermès) sait déjà
tout faire. Le vrai coût n'est PAS la puissance, c'est la COLLE d'intégration
(serveur statique, flux live, glue CORS/WebSocket, installateur).

Est-ce « relativement simple » ? Non dans sa globalité, mais CHAQUE pièce prise
isolément l'est, car le moteur existe. Le risque est dans l'ASSEMBLAGE, pas dans
la logique métier.

══════════════════════════════════════════════════════════════
POINTS DE FRICTION (par ordre de risque réel)
══════════════════════════════════════════════════════════════
1. COLLAGE DANS LA MAQUETTE (risque le + élevé)
   La maquette = 1 fichier HTML, 4486 lignes, JS front-only avec son propre
   faux état (objet FICHIERS, drawSet, toasts simulés). Injecter de vrais fetch
   async/streaming sans casser la logique élaborée = la partie la plus piégeuse.
   → Conseil : traiter la maquette comme RÉFÉRENCE VISUELLE et construire la
   version câblée de façon modulaire (voir architecture-projet.md), ou injecter
   les fetch par petits incréments. Pas impossible, mais c'est là qu'on perdra
   du temps.

2. MODE COWORK (toucher l'ordi)
   `hermes serve` a un ws-ticket (WebSocket) MAIS on n'a PAS câblé un vrai client
   WS qui déclenche un run agent. Seule grande capacité non prouvée bout en bout.
   Discussion pur = OK (proxy vérifié). Cowork = à câbler.

3. CORS / serveur statique devant
   Navigateur localhost appelant :8645 et :9119 → risque réel de blocage.
   Fix connu : un petit serveur qui sert la page ET proxyfie /api/* et /v1/*.
   Mécanique, mais à faire.

4. 6 RÔLES / AGENTS (Vestiaire)
   Formats dans Hermès pas encore confirmés contre la doc. À vérifier avant de
   coder Vestiaire.

5. INSTALLEUR .bat from-scratch
   Poser Python/uv/Node/Playwright/Hermès + flow OAuth + raccourci. Déjà vu des
   bizarreries Windows (python3 introuvable en shell MSYS, chemins). Répétitif
   mais robuste à tester.

6. STUDIO miroir live
   On sait QUEL endpoint (/api/sessions/{id}/messages + ws-ticket), mais il faut
   remplacer les faux nœuds SVG par le vrai flux d'état. Délicat mais clarifié.

7. Telegram, Obsidian = setup 1re fois ou différé. Pas bloquants.

══════════════════════════════════════════════════════════════
NOTRE MÉTHODE — évaluation
══════════════════════════════════════════════════════════════
Fiable et reçue positivement. Ce qui la rend fiable :
  • Discussion amont avant le code → sens commun aligné.
  • Carte endpoints (entrée→endpoint→sortie) → cahier des charges + checklist.
  • Personas + matrice de couverture → aucun angle mort.
  • Vérifier CONTRE l'environnement réel avant de coder → a évité 2 couacs
    (OAuth vs clé, et `hermes serve` = déjà le backend complet).
Universelle pour recréer « des masques » à partir d'Hermès ?
  • OUI pour ~90 % des cas (chat/agent/mémoire/voix/fichiers/rôles/canaux) :
    la recette (mapper → vérifier → câbler proxy/webhook/serve → personas)
    est réutilisable. Encodée dans le skill hermes-webui-shell.
  • LIMITE : tant que Hermès EXPOSE ce dont le masque a besoin. Si capacité
    très custom, on cogne un mur et il faut vraiment coder, pas juste relier.

══════════════════════════════════════════════════════════════
ESTIMATION
══════════════════════════════════════════════════════════════
Compte 2 à 3 sessions de vrai boulot (pas un après-midi) :
  • Session A : câbler Discussion pur (proxy) + serveur statique/CORS.
  • Session B : Cowork (WS) + Studio live + boutons webhook.
  • Session C : Vestiaire (rôles) + Projets + installateur .bat + OAuth.
  (Obsidian/mémoire = session ultérieure, volontairement différée.)

Par où commencer concrètement : Discussion pur via le proxy (déjà prouvé,
moins risqué) = le socle qui valide toute la plomberie. Le reste s'articule
autour.
