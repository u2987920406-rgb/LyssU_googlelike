# Ulysse — ADM

## Decisions (cumulatif, ne jamais effacer)

### 2026-08-07
- Architecture : envelopper Hermès, ne RIEN réinventer (wire-don't-rebuild).
- Coffre mémoire : Option B — garder vault Documents, relier Hermes Home par
  junction (pas de copie parallèle).
- Profil : fusion non-destructive (sauvegardes .default), pas d'écrasement.
- Provider : RESTER sur NuPortal free (pas de crédits/clé). Repli dispo =
  Claude Code (forfait kuchu) + Ollama GLM 5.2, uniquement si free bloqué.

### 2026-08-07 — JALON 2 (Session A)
- Session A livrée en HTML statique autonome + serveur statique local (port 8080).
  Pas de build npm requis ; CORS géré par le proxy (Access-Control-Allow-Origin:*).
- Bout-en-bout texte non prouvé faute de modèle libre répondant (403 upstream).
  Décision : ne PAS forcer la démo, ne PAS inventer de réponse. Jalon = code +
  infra prouvés. Preuve texte reportée à quand un modèle répond.
- Méthode : 1 jalon = 1 commit + 1 tag git (reprise.py --check le confirme).
