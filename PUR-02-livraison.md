# PUR-02 — Livraison candidat correctif (v4e + fix#1b + LanceDB v4f)
**Date** : 2026-11-11 (révisé après E2E sur instance jetable 2026-11-10)  
**Version AnythingLLM cible** : v1.19.0  
**Statut** : CANDIDAT PUR-02-E v4e+fix#1b + LanceDB v4f — intégrité vérifiée, **60/60 tests simulés PASS, 4 scénarios E2E PASS**, non déployé en production  
**Révision** : v4e + correctif traversal-to-existing-target (D-2) + LanceDB v4f (no-ops → true) — **60 / 60 PASS**

> **Note de version** : Ce document remplace la version du 2026-11-04 (52/52 PASS, sans E2E ni LanceDB v4f).  
> La version précédente (branch `main`, SHA `f3e88f13…` pour Suite A) reste accessible dans l'historique git.

---

## 1. Fichiers livrés

### Candidats (trois composants)

| Fichier candidat | Fichier de référence (v1.19.0) | Rôle |
|---|---|---|
| `candidate-lance-index-v4f.js` ← **v4f** | `server/utils/vectorDbProviders/lance/index.js` | Fournisseur LanceDB — `deleteDocumentFromNamespace()` retourne `true` pour les no-ops |
| `candidate-documents.js` | `server/models/documents.js` | Modèle Document |
| `candidate-purgeDocument-v4e.js` ← **v4e+fix#1b** | `server/utils/files/purgeDocument.js` | Utilitaires de purge |

> **Attention** : `fix#1b` est un correctif de **`candidate-purgeDocument-v4e.js`** (validation pré-normalisation, `FOLDER_NAME_INVALID`). Il ne concerne **pas** `candidate-lance-index-v4f.js`. Les deux fichiers sont indépendants.

Le fichier `candidate-lance-index.js` (v4, SHA `c826f004…`) est **supersédé** par `candidate-lance-index-v4f.js` et ne fait plus partie du candidat actif.

### Suites de tests (canoniques)

| Suite | Fichier | Description |
|---|---|---|
| A (v4f) | `pur02-candidate-v4f.test.js` | Tests unitaires isolés — 22 scénarios ; adapté pour v4f (scénarios 9/10 : → `true`) |
| B | `pur02-http-handler.test.js` | Tests handlers HTTP réels (route recorder) — 16 scénarios |
| C | `pur02-path-security.test.js` | Tests sécurité chemins (real `normalizePath`/`isWithin`) — 14 scénarios |
| L/R | `pur02-lance-v4f.test.js` | Tests `deleteDocumentFromNamespace` + rollback `addDocuments` — 8 scénarios |

> **Note** : La Suite A originale (`pur02-candidate.test.js`, SHA `f3e88f13…`, scénarios 9/10 → `false`) est désormais **obsolète** ; elle correspond au comportement LanceDB v4 et ne teste plus le candidat actif v4f.  
> Suite B : les handlers HTTP réels sont exécutés via `loadCandidateModule()`, mais `purgeFolder` elle-même est mockée (validation du routage, pas de l'exécution réelle de `purgeFolder`).  
> Suite C : les fonctions `normalizePath`/`isWithin` sont appelées directement dans les tests, sans charger l'intégralité du module de routes.

### Patch unifié

| Fichier diff | Cible |
|---|---|
| `PUR-02-E-purgeDocument-v4e-fix1b.patch` | `server/utils/files/purgeDocument.js` |

---

## 2. Empreintes SHA-256

### Candidats actifs (2026-11-10)

```
8103f042a0fed63db1d6f79db61ceb6eef97687e87893bec9747abe1d2c9149f  candidate-lance-index-v4f.js    (v4f — no-ops → true)
de9c586043cbf63f70c4070cc18bc2f0871bc3a8b1d8caa79f32248fba8152eb  candidate-documents.js
90a21b0488dfd78ee744b35ae02cd9a6b1e629ead17a88cec5bda49ae4875f79  candidate-purgeDocument-v4e.js  (v4e + fix#1b)
86043b316bb40bbee3a9cc706d756255bbded05e278e3033ee018f14b1dbd8aa  PUR-02-E-purgeDocument-v4e-fix1b.patch
```

### Suites de tests canoniques (2026-11-10)

```
773fbe04198bc45d5bc8daea435101fc9cb5461c223d319ce27afdd99a77e06e  pur02-candidate-v4f.test.js     (Suite A — 22 tests, adapté v4f)
cb9702bdddcadd126487f1e5e5397075cb7a4a2a7b5144c93285819a694eff55  pur02-http-handler.test.js      (Suite B — 16 scénarios)
89e32abc8c171b0aa7ad14cc90d49b614534e249c3e64f85d2fbabc6712d7921  pur02-path-security.test.js     (Suite C — 14 scénarios)
11d835b2eb1ed91b97ac6c9be6f9fae7bb5c585fbe0dd70ae7e306c65917a465  pur02-lance-v4f.test.js         (Suite L/R — 8 scénarios)
```

### Références v1.19.0 (copies de laboratoire PUR-02-lab-20261029-191346)

```
5fb3092729447ba8501d1fc8d6f7072caebd390d1692e3dbe74dfbe365271470  ref-lance-index.js
dde27671eb3f6379ee7e4bb5b2f693800b17316837f1317aa7bd6c4165a2076c  ref-documents.js
f6dda7152e476a6078533a8c06f458204d36c2abd550b08bbf69c8ccf232727a  ref-purgeDocument.js
```

### Historique — empreintes supersédées

#### v4e + fix#1b, suite A v4e (2026-11-04) — supersédées par l'adaptation v4f

```
f3e88f13165dc273749284c18750f9c745d8194a3f8e635664d18f24dbab8cbf  pur02-candidate.test.js     (Suite A v4e — OBSOLÈTE : scénarios 9/10 → false)
```

#### LanceDB v4 (pré-v4f) — supersédé

```
c826f004f1761c20b1e06300fc0f8d63416e03abe523b7e06a0259ec23180e44  candidate-lance-index.js    (v4 — OBSOLÈTE : no-ops → false)
```

#### v4e (2026-11-03) — empreintes pré-fix#1b

```
95c06dcfa48f0ed7109496b1a37ef5c4e1de6acfa842aadb7de5ac40a73d8134  candidate-purgeDocument.js  (v4e, pré-fix#1b)
0e64ff36402615076553d06cf69a84a6e433f00fd405ff0682eb8c4446e03f93  PUR-02-E-purgeDocument.patch
c786f4e4d650d580ffe6b57b8cdf72ea05039e5b1d73f4436678e8312870dc25  pur02-candidate.test.js     (pré-fix#1b, 22 scénarios)
```

### Traçabilité sources publiées (`pur02-sources-1.19.0/`)

```
f6dda7152e476a6078533a8c06f458204d36c2abd550b08bbf69c8ccf232727a  purgeDocument.js      (source non patchée — base du diff)
959ee973681994076402031a6d59d6eafd3cdb1b83589103f56f42f6115ff70f  files-index.js        (normalizePath, isWithin)
0f7d5db7accd68c54a9ac0e884329a29a6e2f25b288c56030d3f24bb77142b19  endpoints-system.js   (route DELETE /system/remove-folder)
b9c901945162631a685bff039e5df4b3ebc875c7408d93eab66217e5066ddb89  api-document-index.js (route DELETE /v1/document/remove-folder)
```

> **Note** : La source correcte de `purgeDocument.js` est `ref-purgeDocument.js` / `pur02-sources-1.19.0/purgeDocument.js` (`f6dda715…`). Le fichier extrait du conteneur lab (`PUR-02-lab-20261029-191346/purgeDocument.js`, SHA `0717505a…`) contenait déjà une modification intermédiaire ; il ne constitue **pas** la source de référence 1.19.0.

---

## 3. Vérifications effectuées

### v4 (historique)

| Contrôle | Résultat |
|---|---|
| `node --check` sur les 3 candidats | ✓ |
| Jest — 17 scénarios (v4) | **17 / 17 PASS** |

### v4e (2026-11-03) — pré-fix#1b

| Contrôle | Résultat |
|---|---|
| `node --check` sur les 3 candidats + 2 fichiers de tests | ✓ |
| Suite A — 22 scénarios unitaires | **22 / 22 PASS** |
| Suite B — 16 scénarios handlers HTTP | **16 / 16 PASS** |
| **Total v4e pré-fix#1b** | **38 / 38 PASS** |

### v4e + fix#1b (2026-11-04) — 52/52 PASS [LAB]

| Contrôle | Résultat |
|---|---|
| `node --check` sur tous les candidats et tests | ✓ |
| Suite A — 22 scénarios unitaires (scénarios 9/10 → `false`, v4e) | **22 / 22 PASS** |
| Suite B — 16 scénarios handlers HTTP | **16 / 16 PASS** |
| Suite C — 14 scénarios sécurité chemins | **14 / 14 PASS** |
| **Total v4e + fix#1b** | **52 / 52 PASS** |

### v4e + fix#1b + LanceDB v4f (2026-11-08) — 60/60 PASS [LAB]

| Contrôle | Résultat |
|---|---|
| Suite A adaptée v4f — 22 scénarios (scénarios 9/10 → `true`) | **22 / 22 PASS** |
| Suite B — 16 scénarios handlers HTTP | **16 / 16 PASS** |
| Suite C — 14 scénarios sécurité chemins | **14 / 14 PASS** |
| Suite L/R — 8 scénarios `deleteDocumentFromNamespace` + rollback `addDocuments` | **8 / 8 PASS** |
| **Total PUR-02-E (simulés)** | **60 / 60 PASS** |

> **60 ≠ 52** : Les 52 du 2026-11-04 utilisaient la Suite A v4e (scénarios 9/10 → `false`) et ne comprenaient pas la Suite L/R. Les 60 du 2026-11-10 utilisent la Suite A adaptée v4f (scénarios 9/10 → `true`) et incluent la Suite L/R (8 scénarios). **Ne pas confondre les deux totaux.**

Sortie Jest — Suite L/R — `pur02-lance-v4f.test.js` (v4f — 8 scénarios) :

```
PASS pur02-lance-v4f.test.js
  deleteDocumentFromNamespace — LanceDB v4f
  ✓ L-01: namespace absent → true (no-op, no table.delete call)
  ✓ L-02: 0 vectors found → true (no-op, no table.delete call)
  ✓ L-03: vectors found → delete called, success
  ✓ L-04: table.delete() error → throws with clear message
  ✓ L-05: SQL findMany error → throws, no LanceDB call
  addDocuments rollback — LanceDB v4f
  ✓ R-01: LanceDB ok, SQL fails → rollback calls deleteDocumentFromNamespace
  ✓ R-02: real LanceDb v4f class, namespaceExists false → true, DocumentVectors.delete called (same docId)
  ✓ R-03: DocumentVectors.delete fails during rollback → error logged, exception propagated
Tests: 8 passed, 8 total
```

> **L-01 / L-02** : avant v4f, `deleteDocumentFromNamespace()` retournait `false` pour les no-ops. Dans `addDocuments()`, la logique `vectorsRemoved = deleted !== false` interprétait ce `false` comme "aucun vecteur supprimé" et n'appelait pas `DocumentVectors.delete()` lors du rollback SQL → nettoyage SQL silencieusement sauté. Après v4f, `true` est retourné → `DocumentVectors.delete()` toujours appelé.  
> **R-02** : vrai test d'intégration partielle — vraie classe `LanceDb` v4f, `namespaceExists` simulé `false`, spy conservant l'exécution réelle, vérification du même `docId` (`"stub-uuid-r02"`) dans `deleteDocumentFromNamespace()` et `DocumentVectors.delete()`.

---

## 4. Tests E2E — instance jetable (2026-11-10)

**Environnement** :
- Conteneur lab : `pur02-e2e-runtime-20261110`
- Image lab : `pur02-e2e:20261110` (dérivée de l'image de production `sha256:ddf73304a4a96e2f90755d620dd3921de9afb4b8b8e914fa62d6ce7944ba95af`)
- 40 migrations Prisma appliquées depuis zéro (`npx prisma migrate deploy`)
- Exécuté par ChatGPT sur la machine de Florian le 2026-11-10

**Résultat global : `E2E_PUR02_RESULT=PASS`**

| Scénario | Description | Résultat |
|---|---|---|
| E2E-01 | Purge nominale d'un document unique dans un namespace existant | ✅ PASS |
| E2E-02 | Purge d'un dossier complet (fichiers multiples) | ✅ PASS |
| E2E-03 | Rejet des noms invalides / traversal / dossier protégé | ✅ PASS |
| E2E-04 | Démonstration de la limite L-1 : SQL `$transaction` échoue après LanceDB ok → `document_vectors` rows présents, vecteurs supprimés | ✅ PASS (comportement attendu confirmé) |

**Vérifications post-tests** :
- Conteneur lab `pur02-e2e-runtime-20261110` : supprimé et vérifié absent ✅
- Image lab `pur02-e2e:20261110` : supprimée et vérifiée absente ✅
- Conteneur de production `anythingllm` : `running`, `RestartCount=0`, inchangé ✅
- Image de production `sha256:ddf73304…` : inchangée ✅

> **E2E-04** confirme empiriquement la limite L-1 (§5, L-1). Ce n'est pas un échec — le comportement correct après `$transaction` failure est l'exception propagée et le log `[removeDocuments] SQL cleanup failed … document_vectors rows … may be orphaned`. La détection fonctionne. La non-atomicité entre SQLite et LanceDB reste une limite résiduelle documentée.

**Commandes de reproduction (simulé, 2026-11-04/05)** :
```bash
# Node.js v22.22.0 / Jest 30.5.2
# Dans scratchpad/test-run-v4e/
npx jest --no-coverage  # → 60 passed, 4 suites (avec pur02-lance-v4f.test.js)

# Suites individuelles
npx jest --no-coverage pur02-candidate-v4f   # Suite A — 22 PASS
npx jest --no-coverage pur02-http-handler    # Suite B — 16 PASS
npx jest --no-coverage pur02-path-security   # Suite C — 14 PASS
npx jest --no-coverage pur02-lance-v4f       # Suite L/R — 8 PASS
```

---

## 5. Limites résiduelles connues

### L-1 — Non-atomicité Prisma / LanceDB (non résolu, documenté et **empiriquement confirmé par E2E-04**)

Prisma (SQLite) et LanceDB n'ont pas de transaction partagée. Deux scénarios de défaillance partielle subsistent :

| Scénario | État résultant | Détection |
|---|---|---|
| SQL `findMany` OK → LanceDB `table.delete()` échoue | `document_vectors` rows présents, vecteurs LanceDB **toujours présents** | Exception propagée + log `[LanceDb.deleteDocumentFromNamespace] LanceDB deletion failed` |
| LanceDB OK → `prisma.$transaction` échoue | Vecteurs LanceDB **supprimés**, `document_vectors` rows **orphelines** | Exception propagée + log `[removeDocuments] SQL cleanup failed … document_vectors rows … may be orphaned` |

**E2E-04 (2026-11-10)** a reproduit le scénario 2 sur instance réelle et confirmé : exception propagée + log correct → comportement documenté respecté. La réparation manuelle reste identique :

```sql
DELETE FROM document_vectors WHERE docId = '<docId>';
```

### L-2 — `purgeFolder` : opération non atomique par fichier

Si `purgeVectorCache()` réussit pour le fichier N et échoue pour N+1, les caches antérieurs sont perdus mais le dossier est préservé. Les fichiers dont le cache est manquant peuvent être ré-indexés.

### L-3 — `purgeDocument` : workspace partiellement nettoyé

Si `removeDocuments()` lève une exception à mi-parcours (workspace W_n après avoir nettoyé W_1…W_{n-1}), la source est préservée mais certains workspaces ont déjà eu leurs associations supprimées. Un retry repassera sans effet secondaire sur les workspaces déjà nettoyés (`if (!document) continue`).

### L-4 — Tests unitaires : isolation par eval, pas d'intégration réelle

Les tests unitaires (`pur02-candidate-v4f.test.js`) utilisent `Module.wrap` + `eval` pour injecter des stubs. La couverture est comportementale ; elle ne couvre pas la sérialisation SQL réelle, le comportement de `table.delete()` avec un filtre malformé, ni l'interaction avec un vrai namespace LanceDB (comblé partiellement par R-02 et les E2E).

### L-5 — Tests HTTP : handlers réels, mais `purgeFolder` mockée

Les tests handlers (`pur02-http-handler.test.js`) exécutent les vrais fichiers de routes AnythingLLM (via `loadCandidateModule`). Cependant, `purgeFolder` elle-même est remplacée par un mock Jest. Ces tests valident le routage des erreurs entre handler HTTP et `purgeFolder`, mais pas l'exécution réelle de `purgeFolder` dans ce contexte.

### ~~O-1 — `purgeFolder(".")` → HTTP 500~~ (RÉSOLU par fix#1b)

Fix#1b intercepte `"."` avant `normalizePath` → `FOLDER_NAME_INVALID` (400). Vérifié par C-05.

---

## 6. Défauts corrigés

### 6.1 `candidate-lance-index-v4f.js` — `deleteDocumentFromNamespace()`

**Défaut v4** : retournait `false` pour les no-ops (namespace absent ou 0 vecteur trouvé). Dans `addDocuments()`, `vectorsRemoved = deleted !== false` → si `false`, `DocumentVectors.delete()` non appelé → nettoyage SQL silencieusement sauté lors d'un rollback.

**Correctif v4f** : retourne `true` pour les no-ops → `DocumentVectors.delete()` toujours appelé lors du rollback. Pas d'impact sur `removeDocuments()` (qui n'utilise pas la valeur de retour ; seules les exceptions comptent).

> **Note** : `fix#1b` est un correctif de `candidate-purgeDocument-v4e.js` (validation pré-normalisation). Il est **distinct** et indépendant de la correction LanceDB v4f. Ces deux améliorations sont portées par des fichiers différents.

### 6.2 `candidate-documents.js` — `removeDocuments()` + `_getStrict()`

- **Défaut** : `get()` absorbe les erreurs SQL et retourne `null`, traité comme "document absent".
- **Correctif** : nouvelle méthode `_getStrict()` sans try/catch. `removeDocuments()` utilise `_getStrict()` ; si LanceDB échoue → abort avant SQL (enregistrement préservé pour retry) ; les deux suppressions SQL regroupées dans `prisma.$transaction([...])` pour atomicité SQL-SQL ; si la transaction échoue après LanceDB → log explicite "orphaned rows" + propagation.

### 6.3 `candidate-purgeDocument-v4e.js` — `purgeDocument()` et `purgeFolder()`

Voir §7 pour l'historique complet des corrections v1 → v4e + fix#1b.

---

## 7. Historique des corrections (v1 → v4e + fix#1b)

### v1 → v2 (première revue ChatGPT)

| # | Problème | Correction |
|---|---|---|
| C1 | `Workspace.where()` absorbe les erreurs | `_getWorkspacesStrict()` → `prisma.workspaces.findMany()` |
| C2 | Deux suppressions SQL non atomiques | `prisma.$transaction([...])` |
| C3 | `purgeFolder()` appelait `purgeVectorCache` avant `removeDocuments` | Ordre corrigé |
| C4 | `deleteDocumentFromNamespace()` non testée | Scénarios 9-12 ajoutés |

### v2 → v3 (seconde revue ChatGPT)

| # | Problème | Correction |
|---|---|---|
| C5 | `purgeFolder()` supprimait les caches même si `removeDocuments` avait échoué | `cleanupErrors` + early-exit |
| C6–C8 | Tests de régression manquants | Scénarios 13–15 ajoutés |

### v3 → v4 (troisième revue ChatGPT)

| # | Problème | Correction |
|---|---|---|
| C9 | `purgeFolder()` : `return` sur erreur masquait les échecs | Remplacés par `throw new Error(...)` |
| C10 | `purgeDocument()` : path non normalisé utilisé | `const normalized` stocké et propagé |
| C11–C13 | Tests invalides / manquants | Scénarios 11, 16, 17 mis à jour/ajoutés |

### v4 → v4e (PUR-02-E, 2026-11-03)

| # | Problème | Correction |
|---|---|---|
| C14 | `purgeFolder()` acceptait `null`/vide silencieusement | Validation `FOLDER_NAME_REQUIRED` |
| C15 | Pas de contrôle traversal ni de dossier protégé | `normalizePath` + `isWithin` + `FOLDER_OUTSIDE_DOCUMENTS` / `FOLDER_PROTECTED` / `FOLDER_NOT_FOUND` |
| C16 | Pas de vérification des sous-répertoires/symlinks | `withFileTypes` + `FOLDER_UNEXPECTED_ENTRIES` |
| C17 | `purgeFolder()` retournait `undefined` | `return { success: true, message }` |

### v4e → v4e + fix#1b (contre-revue, 2026-11-04)

| # | Problème | Correction |
|---|---|---|
| D-2 | `normalizePath("../secret")` stripait le `../` → purge d'une cible existante possible | Vérification pré-normalisée : `FOLDER_NAME_INVALID` si `folderName` contient `/` ou `\` ou est `".."` ou `"."` |
| — | Incohérence empreintes entre audit et livraison | SHA normalisés ; total 52/52 PASS |

### v4e + fix#1b → PUR-02-E avec LanceDB v4f (2026-11-08)

| # | Problème | Correction |
|---|---|---|
| L4f | `deleteDocumentFromNamespace()` retournait `false` pour no-ops → rollback SQL sauté silencieusement | v4f : retourne `true` → `DocumentVectors.delete()` toujours appelé |

---

## 8. Procédure de déploiement recommandée (hors périmètre de cette livraison)

1. Valider les diffs manuellement (fichier `.patch` joint)
2. Copier les **3 candidats** (`candidate-purgeDocument-v4e.js`, `candidate-documents.js`, `candidate-lance-index-v4f.js`) sur les copies de laboratoire déjà vérifiées
3. Recalculer les SHA-256 après copie et comparer à la table §2
4. Tester en environnement staging (conteneur isolé, DB de test) avant production
5. Ne pas modifier le conteneur AnythingLLM de production sans snapshot préalable
6. Conserver le tag de rollback `mintplexlabs/anythingllm:rollback-20261025-091540`
7. Après déploiement : vérifier `RestartCount=0`, logs d'erreur absents, test fonctionnel non destructif
