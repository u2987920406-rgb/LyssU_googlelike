# Ulysse — PLAN

## Objectif
Web UI enveloppant Hermès, livrée via .bat, pour non-techniques.

## Jalons
- [x] Architecture + carte des endpoints (validés)
- [x] Étape zéro : proxy chat / webhook / serve prouvés en réel
- [x] Profil kuchu dans Hermes Home (fusion)  [= JALON 1]
- [x] Connexion Obsidian : junction vault Documents -> Hermes Home
- [x] Déclencheur « reprise » (git jalons -1/+2) — reprise.py opérationnel
- [x] Dev A : Discussion pur (proxy + serveur statique CORS)  [= JALON 2]
      Infra prouvée. Bout-en-bout texte en ATTENTE (free NuPortal saturé).
- [ ] Dev B : Cowork (WebSocket) + auth front serve :9119
- [ ] Dev C : Studio (panneau miroir plan vivant), webhooks, Vestiaire
- [ ] Installateur .bat (Python/uv/Node/Playwright/Hermes/UI from scratch)

## Risques connus
- done.md / ADM.md cumulatifs : risque dump -> entrées datées/structurées (OK).
- .hermes.md lu nativement par Hermès au cwd projet (confirmé en code source).
- Session B : serve :9119 exige auth (/api/v1/models -> Unauthorized).
- Provider : free NuPortal saturé (403). Repli = Claude Code / Ollama GLM 5.2.
