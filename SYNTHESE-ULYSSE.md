# Ulysse — Fiche synthèse

> Synthèse générée le 2026-08-11 à partir des fichiers du dossier `Projet Ulysse`
> (BRIEF.md, plan-ulysse.md, architecture-projet.md, endpoints-ulysse.md,
> glossaire-ulysse.md, personas-ulysse.md, plan.md).
> Faits tirés des sources du projet, pas d'invention.

---

## 1. Qu'est-ce qu'Ulysse ?

**Ulysse est un MASQUE VISUEL** : une interface web locale posée **par-dessus
Hermes Agent**. On ne réinvente rien — on relie une coquille UI aux composants
**déjà existants** de Hermès (proxy, gateway, serve).

- L'utilisateur final (grand public, non technique) ne voit qu'une icône sur le
  bureau. Double-clic → interface web dans le navigateur → Hermès travaille en
  arrière-plan, **invisible**. Zéro friction.
- **Loi d'or** : tout est modifiable, on ne code rien from scratch, uniquement du
  **câblage** (entrée UI → endpoint Hermès → sortie).
- **Nature du livrable** : app web locale packagée pour *sembler* une app de
  bureau (raccourci bureau qui lance les moteurs puis ouvre le navigateur sur
  `http://localhost:<ui-port>`). Pas un binaire Electron natif par défaut.

---

## 2. Tableau — Composants UI ↔ Endpoints Hermès

Chaque composant UI = une entrée → un endpoint Hermès réutilisé → une sortie.

Repères d'endpoint :
- **[A] PROXY** → `hermes proxy` :8645, `POST /v1/chat/completions` (chat)
- **[B] WEBHOOK** → `hermes webhook subscribe <nom>` :8644 (action précise)
- **[C] PROFIL/FS** → lecture/écriture `$HERMES_HOME` + `hermes serve` :9119 (RPC/WS)

| Composant UI          | Rôle / contenu                                       | Endpoint Hermès                 | Type           |
|-----------------------|------------------------------------------------------|---------------------------------|----------------|
| **M1 Discuter**       | Chat pur (bulle), mode Discussion                     | [A] proxy /chat/completions     | Chat           |
| **M2 Studio**         | Schéma + lecteur = miroir **temps réel** du plan     | [C] flux gateway (miroir)       | Affichage live |
| **M3 Vestiaire**      | 6 rôles + agents spécialisés                         | [C] gateway RPC / $HERMES_HOME  | Profil         |
| **M4 Projets**        | Coffre par projet, bac à sable isolé                 | [C] dossier projet Hermès       | Profil/FS      |
| **M5 Réglages**       | user.md / soul.md / MEMORY / config                  | [C] fichiers profil             | Profil/FS      |
| **M6 Cloche**         | Notifications                                        | aucun (host.onEvent)            | Local          |
| **M7 Densité**        | Épuré / dense                                        | aucun (affichage local)         | Local          |
| **DIS-1/2**           | Composer + Envoyer                                   | [A] proxy (outils OFF en Disc.) | Chat           |
| **DIS-5/6**           | L'établi + « + » (fichiers)                          | [B/C] fichiers → proxy          | Fichiers       |
| **DIS-7/8**           | Micro (STT) + Incognito                              | [A] proxy variante              | Chat           |
| **STU-1**             | Schéma (svg) — aucune data fictive                   | [C] flux gateway plan-update    | Affichage live |
| **VES-1→6**           | 6 rôles, cerveau rôle, fantômes, agents, skills      | [C] profil + gateway RPC        | Profil         |
| **PERM**              | 2 couches (Discussion/Cowork) + 4 sous-modes         | [C] `approvals.mode`            | Permissions    |
| **MCP / API**         | Connexions externes (Appel d'outil)                  | [C] config `mcp_servers`        | Connexions     |
| **DIST (Telegram)**   | Canal distant (piloter sans ouvrir l'UI)             | gateway setup                   | Canal distant  |
| **VOC-1**             | STT → proxy ; TTS réponse                            | [A] + /api/audio/*              | Vocal          |
| **AUTH**              | Premier lancement                                    | Portal OAuth device_code / .env | Auth           |

---

## 3. Graphique — Architecture (masque au-dessus de Hermès)

```mermaid
flowchart TB
    User([Utilisateur final<br/>double-clic bureau]) -->|ouvre navigateur| UI[Interface web Ulysse<br/>HTML Material 3 local]

    subgraph MOTEUR [Moteurs Hermès — démarrés par l'installateur]
        Proxy["hermes proxy :8645<br/>API OpenAI-compatible (Discussion)"]
        Gateway["hermes gateway :8644<br/>webhooks + canaux"]
        Serve["hermes serve :9119<br/>backend JSON-RPC/WS<br/>Cowork, Studio, FS, mémoire, vocal, cron, MCP"]
    end

    UI -->|M1 Discuter [A]| Proxy
    UI -->|boutons précis [B]| Gateway
    UI -->|Cowork / Studio / FS / vocal / MCP [C]| Serve
    UI -.->|M6 cloche, M7 densité| UI

    subgraph PROFIL [Profil $HERMES_HOME]
        Files["config.yaml · .env · user.md · soul.md<br/>MEMORY.md · roles/ · agents/ · projects/"]
    end
    Serve -->|lit/écrit| Files

    subgraph VESTIAIRE [6 rôles (pas des agents)]
        R1[Orchestrateur] & R2[Généraliste] & R3[Raisonnement] & R4[Codage] & R5[Appel d'outil] & R6[Garde-fou + 3 fantômes]
    end
    Files --> VESTIAIRE

    subgraph PERMS [2 couches de permission]
        P1[Surface: Discussion (chat pur) vs Cowork (touche l'ordi)]
        P2[4 sous-modes: Auto / Accept-edit / Manuel / Plan]
    end
    UI -->|PERM| P1 --> P2

    Gateway -.->|canal distant| TG([Telegram — pilotage sans UI])
```

**Vue texte (lisible sans Mermaid) :**

```
Utilisateur (bureau)
       │ double-clic
       ▼
Interface web Ulysse (HTML Material 3, localhost)
       │
       ├─[A] hermes proxy  :8645 ──── Discussion (chat pur)
       ├─[B] hermes gateway :8644 ──── boutons webhook + Telegram
       └─[C] hermes serve  :9119 ──── Cowork, Studio, FS, mémoire,
                                    vocal, cron, MCP
             │
             ▼
      Profil $HERMES_HOME (config, .env, user/soul/MEMORY,
      roles/, agents/, projects/)
             │
             ├─ Vestiaire : 6 rôles (+ 3 fantômes Garde-fou)
             └─ Permissions : Discussion/Cowork × 4 sous-modes
```

---

## 4. Les chiffres clés

| Élément                          | Valeur                              |
|----------------------------------|-------------------------------------|
| Rôles du Vestiaire               | 6 (+ 3 fantômes dans Garde-fou)     |
| Couches de permission            | 2 (Discussion / Cowork)             |
| Sous-modes (Cowork)              | 4 (Auto / Accept-edit / Manuel / Plan) |
| Personas de test                 | 10 (P1–P10)                         |
| Moteurs Hermès démarrés          | 3 (proxy 8645 / gateway 8644 / serve 9119) |
| Panneaux UI (menu latéral)       | 7 (M1–M7)                           |
| Fichiers standard par projet     | 6 (.hermes, BRIEF, REPRISE, plan, done, ADM) |
| Étages de mémoire                | 4 (vif / index / journaux / durable)|

---

## 5. État du projet (au 2026-08-11, source : plan.md)

- **Jalons atteints** : architecture + carte endpoints validés ; étape zéro
  (proxy chat / webhook / serve) prouvée en réel ; profil kuchu fusionné dans
  Hermes Home ; connexion Obsidian ; déclencheur reprise.py opérationnel ;
  Dev A (Discussion pur) — infra prouvée.
- **En cours / à venir** : Dev B (Cowork WebSocket + auth serve :9119) ;
  Dev C (Studio, webhooks, Vestiaire) ; installateur `.bat`.
- **Risques connus** : provider free NuPortal saturé (403) ;
  serve :9119 exige auth (Unauthorized sur `/api/v1/models`).
- **Principe « marge »** : flag `USE_MOCK` permet de livrer l'UI avant le
  moteur et de basculer sans rien durcir.

---

## 6. Sources

- `BRIEF.md` — description + phase
- `plan-ulysse.md` — vision, décisions, ordre de construction
- `architecture-projet.md` — nature app web locale, split recommandé
- `endpoints-ulysse.md` — carte entrée→endpoint→sortie
- `glossaire-ulysse.md` — lexique stable (Masque, Vestiaire, Cowork…)
- `personas-ulysse.md` — 10 personas + matrice de couverture
- `matrice-fichiers-projet.md` — 6 fichiers standard par projet
- `config-ulysse.md` — contrats concrets profil Hermès
- `plan.md` — jalons et risques (état au 2026-08-11)
