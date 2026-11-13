# Projet AnythingLLM — Correctifs serveur IA domestique

## Lire en arrivant (dans cet ordre)

1. `docs-serveur-ia/Plan-correctifs-AnythingLLM.md` — vue d'ensemble, matrice des correctifs, décisions ouvertes
2. `docs-serveur-ia/Journal-des-Incidents.md` — chronologie détaillée, état de chaque correctif, vérifications restantes
3. `docs-serveur-ia/Livret-Technique-Serveur-IA.md` — référence technique complète (architecture, procédures, matrices de tests)

## Résumé de situation (13/11/2026)

### Correctifs actifs

| ID | Statut | Fichiers candidats |
|----|--------|-------------------|
| **PUR-02-E** | ✅ Validé (60/60 + 4 E2E) — **non déployé** | `candidate-purgeDocument-v4e.js`, `candidate-documents.js`, `candidate-lance-index-v4f.js` |
| **INT-18** | ⚠️ Corrigé en lab — non validé ni déployé | Dans `anythingllm-fixlab` (non exporté) |
| **INT-19** | ⚠️ Partiel — non validé ni déployé | Lié à INT-18 |
| **OPS-02** | ⚠️ Candidat prêt — non testé ni déployé | — |
| **ALLM-12** | ⚠️ Protocole préparé — non exécuté | D1 (CP-3) non appliqué |

### Branches GitHub

- `main` : docs + `candidate-purgeDocument-v4e.js`
- `correctif-PUR-02` : `candidate-documents.js` + `candidate-lance-index-v4f.js`

### Décisions ouvertes (arbitrage Florian requis)

1. **INT-18/INT-19** : valider ou rejeter les archives ZIP de consolidation v3 comme base de référence
2. **CONSOLIDATION-SOURCES** : retrouver le paquet ou acter sa perte
3. **ALLM-12 D1** : option A (appliquer CP-3), B (audit seul), ou C (statu quo documenté)
4. **Déploiement** : consolidation v3 ↔ PUR-02-E combiné ou séparé ?

### Risques identifiés

- ⚠️ INT-18 : correctifs dans `anythingllm-fixlab` **non exportés** — à risque si le conteneur est arrêté définitivement
- ⚠️ `purgeDocument.js` v3 ZIP (SHA `efb8076c…`) ≠ candidat PUR-02-E actif (SHA `90a21b04…`) — articulation à vérifier

## Contraintes permanentes

- **Ne pas déployer PUR-02 ni aucun correctif en production**
- **Ne pas modifier AnythingLLM en production**
- **Ne pas modifier les candidats techniques** (`candidate-*.js`, fichiers de tests)
- **Aucune modification GitHub sans validation explicite de Florian**
- **Ne pas lancer de test destructif**
- **Ne pas supprimer de fichier**
- **Ne pas exposer de secrets, contenu de `.env` ou clés d'API**
- **Ne pas présenter des tests simulés comme des tests d'intégration réels**
- **Ne pas inventer de résultat, d'empreinte ou de preuve**
- **Signaler immédiatement tout risque identifié**
- SSH uniquement, une action à la fois
- Ne pas monter le NAS en environnement de test
- Ne pas utiliser la base, les volumes Docker ou les documents de production

## Interlocuteurs

- **Florian** — propriétaire du projet, valide toutes les décisions et publications
- **ChatGPT** — co-pilote technique, envoie des briefs via Florian ; ses assertions sur l'état des conteneurs sont à considérer comme non vérifiées par Claude
