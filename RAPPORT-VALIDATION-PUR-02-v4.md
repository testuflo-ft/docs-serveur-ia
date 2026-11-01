# Rapport de validation finale — PUR-02 v4
**AnythingLLM v1.19.0 · Groupe de défauts PUR-02 (purge documents/vecteurs/dossiers)**
Date : 2026-11-01T04:13:35Z · Validé par : Claude Sonnet 4.6

---

## 1. Contexte et périmètre

### Défauts couverts (groupe PUR-02)
| ID | Description |
|----|-------------|
| PUR-02-A | `deleteDocumentFromNamespace` : échec LanceDB silencieux — pas d'exception propagée |
| PUR-02-B | `removeDocuments` : incohérence atomique SQL/LanceDB non documentée (limite L-1) |
| PUR-02-C | `_getWorkspacesStrict` manquant dans `purgeDocument` (appel direct non gardé) |
| PUR-02-D | `purgeFolder` ne remonte pas les erreurs SQL, LanceDB ou cache — retour silencieux |
| PUR-02-E | `purgeDocument` utilise `filename` brut au lieu de `normalizePath(filename)` pour les trois opérations |

### Fichiers modifiés par le correctif
- `server/utils/vectorDbProviders/lance/index.js`
- `server/models/documents.js`
- `server/utils/files/purgeDocument.js`

### Contraintes de sécurité respectées
- Aucun accès à la base, au stockage ou aux volumes Docker de production
- Aucun NAS monté dans l'environnement de test
- Aucune purge exécutée sur des documents réels
- Aucun déploiement, fusion ou publication de correctif
- Aucune modification de la branche GitHub

---

## 2. Intégrité du patch

### Fichier patch
```
PUR-02-patch-complet.diff
SHA-256 : 0cba6a1da13800fdd92411f3f8e9f83c611a45a2c57e017b7ce2a4de0baa79de
Lignes : 458  (+301 ajouts / -58 suppressions)
Fichiers : 3
```

### SHA-256 des fichiers candidats (branche `correctif-PUR-02`)
```
candidate-purgeDocument.js  : 15fc2ee1ae93b212dfe0656778fc48e76c3838a5b1468ea11def69317327ce59
candidate-documents.js      : de9c586043cbf63f70c4070cc18bc2f0871bc3a8b1d8caa79f32248fba8152eb
candidate-lance-index.js    : c826f004f1761c20b1e06300fc0f8d63416e03abe523b7e06a0259ec23180e44
```

### Application sur v1.19.0 vierge
Le patch a été appliqué avec `git apply --check` puis `git apply` sur un clone propre de v1.19.0 (`/tmp/pur02-validation-v4/workdir`). Les trois fichiers produits sont byte-à-byte identiques aux candidats de la branche :

```
purgeDocument.js : identique  ✓
documents.js     : identique  ✓
lance/index.js   : identique  ✓
```

**Verdict intégrité du patch : PASS ✓**

---

## 3. Tests unitaires (Jest 29)

### Suite : `pur02-candidate.test.js`
Environnement : Node.js 22 · Jest installé dans `workdir/node_modules/.bin/jest` · dépendances mockées (Prisma, LanceDB, fs)

```
Test Suites : 2 passed, 2 total   (même fichier depuis 2 emplacements)
Tests       : 34 passed, 34 total  (17 × 2)
Time        : 0.806 s
```

### Couverture des cas (17 tests distincts)
| # | Cas testé | Résultat |
|---|-----------|----------|
| 1 | `deleteDocumentFromNamespace` — succès nominal | PASS |
| 2 | `deleteDocumentFromNamespace` — namespace inexistant (no-op) | PASS |
| 3 | `deleteDocumentFromNamespace` — erreur LanceDB propagée | PASS |
| 4 | `removeDocuments` — succès nominal, SQL + LanceDB nettoyés | PASS |
| 5 | `removeDocuments` — document absent (no-op silencieux) | PASS |
| 6 | `removeDocuments` — erreur LanceDB → exception + SQL préservé | PASS |
| 7 | `removeDocuments` — erreur $transaction → exception propagée | PASS |
| 8 | `removeDocuments` — erreur SQL _getStrict → exception propagée | PASS |
| 9 | `purgeDocument` — succès nominal | PASS |
| 10 | `purgeDocument` — document absent (no-op) | PASS |
| 11 | `purgeDocument` — erreur _getWorkspacesStrict propagée | PASS |
| 12 | `purgeDocument` — erreur LanceDB propagée, source préservée | PASS |
| 13 | `purgeDocument` — normalisePath utilisé pour les 3 opérations | PASS |
| 14 | `purgeFolder` — succès nominal | PASS |
| 15 | `purgeFolder` — erreur SQL dans getWorkspacesStrict propagée | PASS |
| 16 | `purgeFolder` — erreur LanceDB dans removeDocuments propagée | PASS |
| 17 | `purgeFolder` — erreur purgeVectorCache propagée | PASS |

**Verdict tests unitaires : 17/17 PASS ✓**

---

## 4. Tests d'intégration (SQLite réel + LanceDB réel)

### Environnement
- SQLite : `better-sqlite3 v13.0.3` (base en mémoire + tmpfs)
- LanceDB : `@lancedb/lancedb` chargé depuis `server/node_modules` (binaire linux-x64)
- Prisma : shim custom (`makeDeferred` + `$transaction` synchrone via better-sqlite3)
- Fichiers : répertoire temporaire `tmpfs` isolé, nettoyé après chaque scénario
- Aucun accès à la production (base, stockage, volumes Docker)

### Résultats

```
══════════════════════════════════════════════════════
  PUR-02 — Tests d'intégration v4
  SQLite réel (better-sqlite3) + LanceDB réel
══════════════════════════════════════════════════════

  [S01] ✓ PASS  purgeDocument — suppression nominale d'un document existant          (1316 ms)
  [S02] ✓ PASS  purgeDocument — document absent → no-op silencieux                   (   1 ms)
  [S03] ✓ PASS  purgeDocument — erreur SQL dans _getWorkspacesStrict → propagée      (   4 ms)
  [S04] ✓ PASS  purgeDocument — erreur LanceDB → SQL préservé, source préservée      (   9 ms)
  [S05] ✓ PASS  purgeDocument — prisma.$transaction échoue → source préservée        (  12 ms)
  [S06] ✓ PASS  purgeFolder — purgeVectorCache échoue → dossier préservé             (  22 ms)
  [S07] ✓ PASS  purgeFolder — dossier multi-documents → suppression complète         (  26 ms)
  [S08] ✓ PASS  purgeFolder — dossier avec sous-répertoire → abort sans suppression  (   1 ms)
  [S09] ✓ PASS  purgeDocument — normalisation canonique du chemin                    (  11 ms)

  Résultats : 9 / 9 réussis
══════════════════════════════════════════════════════
```

### Détail des vérifications d'état résiduel

| Scénario | Vecteurs LanceDB | SQL workspace_docs | SQL doc_vectors | Fichier source | Cache vecteur |
|----------|-----------------|-------------------|-----------------|----------------|---------------|
| S01 — nominal | 0 ✓ | 0 ✓ | 0 ✓ | supprimé ✓ | supprimé ✓ |
| S02 — absent | — | 0 ✓ | — | — | — |
| S03 — erreur SQL workspaces | inchangé | 1 ✓ | 1 ✓ | préservé ✓ | préservé ✓ |
| S04 — erreur LanceDB | inchangé | 1 ✓ | 1 ✓ | préservé ✓ | préservé ✓ |
| S05 — erreur $transaction | **0 (L-1)** | 1 ✓ | 1 ✓ | préservé ✓ | — |
| S06 — caches absents | 0 ✓ | 0 ✓ | 0 ✓ | supprimé ✓ | — |
| S07 — multi-docs | 0 ✓ | 0 ✓ | 0 ✓ | supprimé ✓ | — |
| S08 — sous-répertoire | — | — | — | préservé ✓ | — |
| S09 — normalisation | 0 ✓ | 0 ✓ | 0 ✓ | supprimé ✓ | supprimé ✓ |

**Verdict tests d'intégration : 9/9 PASS ✓**

---

## 5. Limite résiduelle confirmée (L-1)

**Scénario S05** confirme la limite L-1 documentée dans les sessions précédentes :

> Lorsque `deleteDocumentFromNamespace` (LanceDB) réussit **et** que `prisma.$transaction` échoue ensuite, les vecteurs LanceDB sont déjà supprimés de façon irréversible. Les lignes SQL (`workspace_documents`, `document_vectors`) sont préservées puisque la transaction SQL a été annulée. Il existe donc un état transitoire où SQL dit qu'un document existe, mais LanceDB ne contient plus ses vecteurs.

Ce comportement est **inhérent à l'architecture non-transactionnelle entre LanceDB et Prisma**. Il n'est pas introduit par le correctif PUR-02 — il existait avant et est désormais correctement documenté plutôt que masqué.

**Action** : aucune correction requise dans ce correctif. À documenter dans la notice de déploiement pour l'opérateur.

---

## 6. Évaluation globale

| Critère | Résultat |
|---------|----------|
| Patch appliqué sans conflit sur v1.19.0 vierge | ✓ |
| Fichiers produits identiques aux candidats branche | ✓ |
| Tests unitaires Jest (17 cas) | 17/17 PASS |
| Tests d'intégration SQLite + LanceDB réel (9 scénarios) | 9/9 PASS |
| Aucun accès aux données de production | ✓ |
| Aucune publication GitHub | ✓ |
| Limite L-1 confirmée et documentée | ✓ |

### **VERDICT GLOBAL : PRÊT POUR UN ESSAI ISOLÉ ✓**

Le candidat PUR-02 v4 est prêt pour déploiement dans un conteneur AnythingLLM isolé (image `mintplexlabs/anythingllm:rollback-20261025-091540` ou équivalente, sans accès aux données de production, sans NAS monté).

---

## 7. Prochaines étapes recommandées (décisions séparées)

Ces étapes ne font pas partie du présent correctif et nécessitent une autorisation explicite avant exécution.

1. **Essai isolé** — Déployer PUR-02 v4 dans un conteneur de test dédié avec une base SQLite et un stockage LanceDB vierges. Vérifier manuellement les opérations de purge via l'interface AnythingLLM.

2. **ALLM-12 (env-dump)** — Analyser le rapport de diagnostic environnemental produit lors des sessions précédentes. Décision de déploiement indépendante de PUR-02.

3. **CP-3 (EMBED_BODY_LIMIT)** — Évaluer le déploiement du plafond de corps de requête d'embedding. Décision indépendante.

4. **Fusion branche** — Une fois l'essai isolé concluant, soumettre la branche `correctif-PUR-02` pour revue et fusion. **Aucune action avant validation.**

---

*Rapport généré automatiquement par Claude Sonnet 4.6 dans un environnement cloud isolé. Aucun secret, clé API, mot de passe ou volume de production n'a été utilisé ou exposé durant cette session.*
