# Ulysse — REPRISE

## Dernier jalon
2026-08-07 — JALON 3 : Session B « Cowork + Studio + onglets » codée + prouvée
en réel dans le navigateur. (JALON 2 = Session A ; JALON 1 = fusion profil.)

## Prochaine etape
Session C : Webhooks (gateway :8644 /webhooks/*) + Vestiaire (6 roles) +
installateur .bat from-scratch (utilisateur non-tech fournit sa cle Nous).

## Contexte repli provider (si NuPortal free reste sature)
- Claude Code (forfait kuchu) dispo en repli — ET utilise pour tout le code
  du projet Ulysse (regle kuchu 2026-08-07 : si code lourd/impossible, dire
  immediatement pour passer Opus 5, ne pas perdre de temps).
- Ollama + GLM 5.2 dispo en repli local.

## Etat moteurs (verifie en reel, vivants)
- proxy 8645 : OK, CORS *, chat renvoie JSON (models gratuits 403 upstream).
- dashboard 9119/9123 : OK complet (build npm fait par Opus). /api/* exige
  token loopback X-Hermes-Session-Token. Cowork via WS /api/ws prouve.
- gateway 8644 : OK, /health ok, webhook /webhooks/<nom> (resume-lundi actif).

## Bugs resolus (Session B)
- Cowork/Studio : WS /api/ws + token loopback prouves (reponse recue).
- Onglets fetch /api/* (Sessions/Fichiers/Memoire/Skills/Statut) :
  « Failed to fetch » (preflight OPTIONS 401 du dashboard). RESOLU par
  reverse-proxy leger dans serve.py (page -> 8080, serve.py relaie vers
  dashboard 9123 + injecte token). Prouve : Sessions = 11 sessions reelles
  listees, Skills = vraie liste.
