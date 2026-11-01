# Tableau de bord des correctifs — Serveur IA AnythingLLM

*Version 1.0 — 1er novembre 2026*  
*Auteur : Florian — élaboré avec Claude*  
*Périmètre : audit de sécurité et de fiabilité AnythingLLM v1.19.0 (Mac mini M5 Pro)*

---

## Légende des niveaux de validation

| Niveau | Signification |
|---|---|
| **[IMG]** | Relevé statique dans l'image 1.19.0 active (non revérifié par Claude) |
| **[LAB]** | Test dans un conteneur de laboratoire isolé (mocks ou composants réels) |
| **[TEST]** | Test d'intégration avec composants réels (SQLite réel + LanceDB réel) |
| **[PROD]** | Constaté en production par ChatGPT (bilan 28/10/2026 ; non revérifié par Claude) |
| **[VAL]** | Validé par Florian le 25/10/2026 à 21:37 |
| **[CM]** | Code amont branche principale (commit `a5bb8b9`, 23/10/2026) |

---

## Tableau global

| Identifiant | Problème | Correctif préparé | Tests | Niveau de validation | Production | Risques résiduels | Décision suivante |
|---|---|---|---|---|---|---|---|
| **PUR-02 v4** | 5 défauts dans `purgeDocument` / `removeDocuments` / `deleteDocumentFromNamespace` : atomicité SQL+LanceDB, singleton `LanceDb.#connection`, ordonnancement, propagation d'erreurs, récursivité `purgeFolder` (ALLM-16) | Candidats v4 : `candidate-purgeDocument.js`, `candidate-documents.js`, `candidate-lance-index.js` — patch SHA `0cba6a1da1…` | **9/9 intégration** (S01–S09, SQLite réel + LanceDB réel) + **17/17 unitaires** ; consolidation v3 22/22 PASS | ✅ **VALIDÉ en laboratoire** [TEST] 2026-11-01 | ❌ Non déployé | **L-1 non-atomicité résiduelle** : LanceDB nettoyé avant `$transaction` → vecteurs supprimés même si SQL échoue (S05 confirmé). Essai isolé requis avant production. | Exporter candidats du lab (`docker cp`, SHA-256) ; planifier essai isolé ; obtenir autorisation déploiement |
| **ALLM-10** | Pas de protection contre la suppression accidentelle de workspace | Middleware `WORKSPACE_DELETION_PROTECTION` : bloque 3 routes si variable présente (`DELETE /admin/workspaces/:id`, `DELETE /workspace/:slug`, `DELETE /v1/workspace/:slug`) | Test unitaire middleware (403 + `next()` non appelé) | ✅ **DÉPLOYÉ en production le 27/10/2026** [PROD] | ✅ Actif — `WORKSPACE_DELETION_PROTECTION=true` dans `compose.yaml` | Suppressions légitimes de workspace bloquées (retour arrière : retirer la variable, recréer le conteneur depuis sauvegarde `backup-allm10-20261027-170318`). Test HTTP des 3 routes non effectué (OPS-02 en attente). | OPS-02 en laboratoire (3 routes, valeurs `true`/`1`/`0`) |
| **ALLM-12 / DOS-02 (ex-CP-3)** | Routes `env-dump` accessibles sans authentification valide (`GET /api/v1/system/env-dump`, `GET /system/env-dump`) | Options A/B/C préparées dans Plan v0.6 §2.7 ; protocole lecture seule + laboratoire documenté | Aucun test exécuté | ❌ **Non déployé** | ❌ Routes toujours présentes [IMG] ; comportement intentionnel [VAL][CM] | Surface réseau à confirmer (`docker port anythingllm`) ; si port 3001 exposé hors Tailscale, risque d'exposition de secrets d'environnement | Décision A/B/C par Florian ; autorisation explicite avant toute modification |
| **INT-18** | `move-files` sans validation préalable de la destination (écrasement silencieux possible) | Correctif laboratoire : prévalidation sources, doublons, collisions avant déplacement (`/app/server/utils/files/index.js`) | Tests par mocks [LAB] : déplacement normal PASS, collision → erreur attendue, source manquante rejetée | ⚠️ **Validé par mocks [LAB]** — non déployé | ❌ Non déployé | Déplacement non atomique : erreur E/S réelle peut laisser un état partiel. INT-18C (concurrence), INT-19B/C non couverts. Candidats uniquement dans conteneur lab éphémère. | Exporter correctifs lab ; test HTTP bout-en-bout (INT-18A/B/C) en environnement isolé ; puis planifier déploiement |
| **INT-20 / PUR-01** | `remove-folder` : retour anticipé silencieux → faux succès possible ; purge non récursive des index (ALLM-16) | Correctif laboratoire : validations d'entrée (nom vide, chemin `../`, dossier protégé, dossier absent) + propagation d'erreurs (`/app/server/endpoints/api/document/index.js`, `…/system.js`) | Tests par mocks [LAB] : purge récursive conforme, dossier supprimé/conservé selon succès/erreur, entrée symbolique rejetée, validations → 400/403/404 | ⚠️ **Validé par mocks [LAB]** — non déployé | ❌ Non déployé | Pas de test HTTP de bout en bout. Pas de contrôle SQL/`DocumentVectors`/LanceDB/cache. Image du lab non comparée à la production. | Exporter correctifs lab ; test HTTP INT-20 + PUR-01 en environnement isolé |
| **ALLM-04** | `POST /v1/workspace/:slug/vector-search` retourne `source.text` sans filtrage | Aucun correctif — comportement intentionnel selon [VAL] | — | ⚠️ **Risque de gouvernance documenté** — pas de correctif planifié | ✅ Comportement actif | Exposition possible de contenu sensible à un client n8n non contrôlé. Pas d'injection de code mais risque de fuite documentaire. | Ne pas exposer cette route à n8n ni à aucun client non contrôlé (D2) ; documenter dans la configuration de la passerelle |
| **DOS-02** | `bodyParser` global 3 Go avant authentification ; route `/api/embed` sans clé et sans limite | Limit `EMBED_BODY_LIMIT = "1mb"` sur `/api/embed` | Aucun test HTTP 413 exécuté | ✅ **Présent dans l'image 1.19.0** [IMG] (preuve statique, non revérifiée) | ✅ Déployé avec l'image | Limite 3 Go conservée sur les autres routes avant authentification. Comportement HTTP 413 non testé en pratique. Appelé à tort « CP-3 » dans la passation du 25/10 : numérotation DOS-02 conservée. | DOS-01 et DOS-02 (test 413) à rejouer en laboratoire ; décider du résiduel de la limite globale 3 Go |
| **ALLM-06** | Cache vectoriel indexé par chemin, pas par contenu : un réimport JSON vers le même chemin peut servir des vecteurs périmés | Aucun correctif | RAG-03A/B en laboratoire (non exécutés) | ❌ **Ouvert** | ✅ Comportement actif | Réponses RAG potentiellement obsolètes après mise à jour d'un document au même chemin. | RAG-03A/B en environnement isolé ; revue du comportement du cache amont (D7) |

---

## Résumé des statuts

| Identifiant | Statut synthétique |
|---|---|
| PUR-02 v4 | ✅ Validé lab (9/9 intégration + 17/17 unitaires) — **essai isolé avant déploiement** |
| ALLM-10 | ✅ Déployé en production le 27/10/2026 — OPS-02 en attente |
| ALLM-12 | ⚠️ Décision A/B/C en attente — non déployé |
| INT-18 | ⚠️ Correctif lab (mocks) — export + test HTTP requis |
| INT-20 / PUR-01 | ⚠️ Correctif lab (mocks) — export + test HTTP requis |
| ALLM-04 | 📋 Risque gouvernance documenté — pas de correctif |
| DOS-02 | ✅ Présent dans image 1.19.0 — test 413 en attente |
| ALLM-06 | ❌ Ouvert — RAG-03A/B non exécutés |

---

## Décisions actives (état au 1er novembre 2026)

| # | Décision | État |
|---|---|---|
| D1 | ALLM-12 : CP-3 non appliqué automatiquement ; décision A/B/C à prendre | **En attente de Florian** |
| D2 | Automatisation n8n : Option A — passerelle dédiée avec allowlist workspaces | Retenue [VAL] — à spécifier et tester |
| D3 | Clé `Import-Corpus-IA` : ne pas révoquer avant inventaire des workflows | En attente d'inventaire |
| D4 | ALLM-10 activé en production le 27/10/2026 | ✅ Exécuté |
| D5 | DOS-02 corrigé et déployé (preuve statique) | ✅ Exécuté |
| D6 | PUR-02 v4 validé lab (9/9+17/17) ; essai isolé requis avant déploiement | **Essai isolé à planifier** |
| D7 | ALLM-06 ouvert | Ouvert |

---

## Contraintes de sécurité permanentes

> Ces contraintes s'appliquent à toute session de travail sur ce serveur, sans exception.

- Ne jamais afficher ou copier dans une conversation le secret client OIDC ni la valeur de `WEBUI_SECRET_KEY`
- Ne jamais écrire de mots de passe, clés API, secrets JWT ou codes de récupération dans la documentation
- Ne jamais utiliser la base, le stockage, les volumes Docker ou les documents du serveur de production pour des tests
- Ne pas déployer, fusionner ou publier de nouveau correctif sans autorisation explicite
- Ne pas modifier les fichiers de code applicatif depuis une session documentaire
- Conserver le tag de retour arrière `mintplexlabs/anythingllm:rollback-20261025-091540` jusqu'à validation complète
- SSH uniquement, une action à la fois, aucun secret transmis

---

*Sources : `PUR-02-livraison.md` (détail v4) ; `Livret-Technique-Serveur-IA.md` v0.8 (sections 14.8–14.22) ; `Journal-des-Incidents.md` v1.0 ; passation ChatGPT 28/10/2026 ; conclusions validées Florian 25/10/2026 21:37*
