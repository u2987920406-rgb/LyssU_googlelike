# Ulysse

Enveloppe web posée par-dessus **Hermes Agent**. Ulysse n'installe rien dans
Hermes : il l'enveloppe (un masque UI + un plugin d'approbation). Tout ce qui
est ici est servi/local, en loopback (127.0.0.1) — rien n'est exposé au réseau.

## Ce qu'il faut sur la machine cible

Ulysse n'est pas autonome : il a besoin que **Hermes Agent** tourne en dessous.
Installer une fois, à la main :

1. **Python 3.11+**
2. **uv** (gestionnaire d'environnement d'Hermes) — `pip install uv`
3. **Hermes Agent** — voir https://hermes-agent.nousresearch.com/docs
4. **Node.js** (LTS) — pour le serveur statique UI
5. **Git** — requis (la reprise en dépend)

Sur Windows, tout se fait en double-clic sur les `.bat` (pas de PowerShell
nécessaire pour lancer).

## Installer Ulysse (depuis ce dépôt)

```bash
git clone https://github.com/u2987920406-rgb/LyssU_googlelike.git
cd LyssU_googlelike/web
```

Copier aussi le plugin d'approbation dans le dossier plugins d'Hermes :

- Windows : `%LOCALAPPDATA%\hermes\plugins\`
- Linux/macOS : `~/.hermes/plugins\`

```
cp -r web/plugin-hermes/ulysse-approbation <plugins Hermes>/
hermes plugins enable ulysse-approbation
```

Répondre **non** à la question sur le remplacement des outils intégrés
(le plugin n'a pas besoin de ce privilège).

## Lancer

Double-clic sur `web/lancer_ulysse.bat`.

Avant de démarrer quoi que ce soit, il lance `verif_ports.py` qui sonde les
ports Hermes/Ulysse (8644 gateway, 8645 proxy, 9123 dashboard, 8080 UI) :

- **port libre** → Ulysse le prend et démarre le backend.
- **backend Hermes déjà actif** sur 8644/8645 → Ulysse le **réutilise**, il ne
  relance pas par-dessus (plus de crash sur une machine où Hermes tourne déjà).
- **port occupé par un service inconnu** → **conflit bloquant** : le lancement
  s'arrête avec un message clair (« libérez le port puis relancez »).

Puis il ouvre `http://127.0.0.1:8080/` dans le navigateur.

## Authentification (1re fois)

- **OAuth Portal (défaut)** : le navigateur s'ouvre, vous confirmez — aucune
  clé à coller.
- **Clé API Nous** (alternative) : à écrire dans `~/.hermes/.env`.

## Arrêter

Fermer les fenêtres « Ulysse-Dashboard », « Ulysse-Gateway », « Ulysse-Proxy »,
« Ulysse-Serve ». Le terminal peut être fermé.

## Ports utilisés

| Port  | Rôle                                  |
|-------|---------------------------------------|
| 8644  | gateway Hermes (webhooks)             |
| 8645  | proxy Hermes (chat pur, OpenAI-compat)|
| 9119  | dashboard Hermes (défaut Hermes)      |
| 9123  | dashboard Ulysse (démarré par nous)   |
| 8080  | serveur statique UI Ulysse            |

Tous en loopback par défaut = pas exposés au réseau.

## Note sur le plugin d'approbation

`ulysse-approbation` fait demander un accord avant chaque écriture de fichier
(write_file / patch / skill_manage) en mode `manual`. Il s'applique à **tout**
Hermes de la machine, pas seulement Ulysse. Désactiver pour une session :
`ULYSSE_APPROBATION_OFF=1`.
