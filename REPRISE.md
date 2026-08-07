# Ulysse — REPRISE

## Dernier jalon
2026-08-07 — JALON 2 : Session A « Discussion » codée + infra prouvée.
(profil kuchu fusionné = JALON 1)

## Prochaine etape
Session B : Studio (panneau miroir plan vivant) + Cowork (WebSocket).
Point bloquant préalable : serve :9119 exige une auth (vu /api/v1/models ->
Unauthorized). Il faut câbler l'auth front avant d'appeler le backend.

## Contexte repli provider (si NuPortal free reste saturé)
- Claude Code (forfait kuchu) dispo en repli.
- Ollama + GLM 5.2 dispo en repli local.
- Décision : RESTER sur NuPortal free pour l'instant (pas de crédits/clé ajoutés).

## État moteurs (vérifié en réel, vivants)
- proxy 8645 : OK, CORS *, chat renvoie JSON (models gratuits 403 upstream).
- serve 9119 : OK headless, /api/status OK, /api/* = Unauthorized (auth req).
- gateway 8644 : OK, /health ok, webhook /webhooks/<nom> (resume-lundi actif).
