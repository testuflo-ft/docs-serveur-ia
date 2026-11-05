# PUR-02 — Livraison candidat correctif (v4e + fix#1b)
**Date** : 2026-11-04 (révisé après contre-revue indépendante)  
**Version AnythingLLM cible** : v1.19.0  
**Statut** : CANDIDAT v4e + fix#1b — non déployé, à valider avant intégration en production  
**Révision** : v4e + correctif traversal-to-existing-target (D-2) — **52 / 52 PASS**

---

## 1. Fichiers livrés

| Fichier candidat | Fichier de référence (v1.19.0) | Rôle |
|---|---|---|
| `candidate-lance-index.js` | `server/utils/vectorDbProviders/lance/index.js` | Fournisseur LanceDB |
| `candidate-documents.js` | `server/models/documents.js` | Modèle Document |
| `candidate-purgeDocument-v4e.js` ← **v4e+fix#1b** | `server/utils/files/purgeDocument.js` | Utilitaires de purge |
| `pur02-candidate.test.js` ← **v4e+fix#1b** | *(nouveau)* `server/__tests__/pur02-candidate.test.js` | Tests unitaires isolés — Suite A (22 scénarios) |
| `pur02-http-handler.test.js` ← **v4e** | *(nouveau)* `server/__tests__/pur02-http-handler.test.js` | Tests handlers HTTP réels — Suite B (16 scénarios) |
| `pur02-path-security.test.js` ← **nouveau** | *(nouveau)* `server/__tests__/pur02-path-security.test.js` | Tests sécurité chemins (real normalizePath/isWithin) — Suite C (14 scénarios) |

Patch unifié :

| Fichier diff | Cible |
|---|---|
| `PUR-02-E-purgeDocument-v4e-fix1b.patch` | `server/utils/files/purgeDocument.js` |

---

## 2. Empreintes SHA-256

### v4 — inchangés (candidate-lance-index.js, candidate-documents.js)

```
c826f004f1761c20b1e06300fc0f8d63416e03abe523b7e06a0259ec23180e44  candidate-lance-index.js
de9c586043cbf63f70c4070cc18bc2f0871bc3a8b1d8caa79f32248fba8152eb  candidate-documents.js
```

### v4e + fix#1b — fichiers modifiés ou nouveaux (2026-11-04)

```
90a21b0488dfd78ee744b35ae02cd9a6b1e629ead17a88cec5bda49ae4875f79  candidate-purgeDocument-v4e.js          (v4e + fix#1b)
86043b316bb40bbee3a9cc706d756255bbded05e278e3033ee018f14b1dbd8aa  PUR-02-E-purgeDocument-v4e-fix1b.patch  (patch unifié)
f3e88f13165dc273749284c18750f9c745d8194a3f8e635664d18f24dbab8cbf  pur02-candidate.test.js                 (Suite A — 22 tests, v4e + fix#1b)
cb9702bdddcadd126487f1e5e5397075cb7a4a2a7b5144c93285819a694eff55  pur02-http-handler.test.js              (Suite B — 16 scénarios, v4e)
89e32abc8c171b0aa7ad14cc90d49b614534e249c3e64f85d2fbabc6712d7921  pur02-path-security.test.js             (Suite C — 14 scénarios, nouveau)
```

> **Cohérence** : les deux copies du candidat (test-run-v4e/ et patch-work/) ont le même SHA-256 `90a21b04…`, confirmant l'identité des fichiers.

### v4e (2026-11-03) — empreintes historiques supersédées par fix#1b

> Ces empreintes correspondent à la version v4e avant correction D-2. Elles sont conservées à titre historique.

```
95c06dcfa48f0ed7109496b1a37ef5c4e1de6acfa842aadb7de5ac40a73d8134  candidate-purgeDocument.js  (v4e, pré-fix#1b)
0e64ff36402615076553d06cf69a84a6e433f00fd405ff0682eb8c4446e03f93  PUR-02-E-purgeDocument.patch
c786f4e4d650d580ffe6b57b8cdf72ea05039e5b1d73f4436678e8312870dc25  pur02-candidate.test.js     (pré-fix#1b, 22 scénarios)
```

Références v1.19.0 (copies de laboratoire PUR-02-lab-20261029-191346) :
```
5fb3092729447ba8501d1fc8d6f7072caebd390d1692e3dbe74dfbe365271470  ref-lance-index.js
dde27671eb3f6379ee7e4bb5b2f693800b17316837f1317aa7bd6c4165a2076c  ref-documents.js
f6dda7152e476a6078533a8c06f458204d36c2abd550b08bbf69c8ccf232727a  ref-purgeDocument.js      ← source du patch (non modifiée)
```

Traçabilité des sources publiées (`pur02-sources-1.19.0/`) :
```
f6dda7152e476a6078533a8c06f458204d36c2abd550b08bbf69c8ccf232727a  purgeDocument.js      (source non patchée — base du diff)
959ee973681994076402031a6d59d6eafd3cdb1b83589103f56f42f6115ff70f  files-index.js        (normalizePath, isWithin)
0f7d5db7accd68c54a9ac0e884329a29a6e2f25b288c56030d3f24bb77142b19  endpoints-system.js   (route DELETE /system/remove-folder)
b9c901945162631a685bff039e5df4b3ebc875c7408d93eab66217e5066ddb89  api-document-index.js (route DELETE /v1/document/remove-folder)
```

> **Note** : Le fichier extrait du conteneur de laboratoire (`PUR-02-lab-20261029-191346/purgeDocument.js`, SHA `0717505a…`) contenait déjà une modification intermédiaire ; il ne constitue **pas** la source de référence 1.19.0. La source correcte est `ref-purgeDocument.js` / `pur02-sources-1.19.0/purgeDocument.js` (`f6dda715…`), contre laquelle le patch s'applique et reconstruit exactement le candidat (`90a21b04…`).

---

## 3. Vérifications effectuées

### v4 (historique)

| Contrôle | Résultat |
|---|---|
| `node --check` sur les 3 candidats | ✓ Aucune erreur de syntaxe |
| `node --check` sur le fichier de tests | ✓ |
| Jest 30.5.2 — 17 scénarios unitaires (v4) | **17 / 17 PASS** |

### v4e (2026-11-03) — résultats historiques (pré-fix#1b)

| Contrôle | Résultat |
|---|---|
| `node --check` sur les 3 candidats (dont `candidate-purgeDocument.js` v4e) | ✓ Aucune erreur de syntaxe |
| `node --check` sur les deux fichiers de tests v4e | ✓ |
| Jest 30.5.2 — Suite A : `pur02-candidate.test.js` — 22 scénarios unitaires | **22 / 22 PASS** |
| Jest 30.5.2 — Suite B : `pur02-http-handler.test.js` — 16 scénarios handlers HTTP | **16 / 16 PASS** |
| **Total v4e pré-fix#1b** | **38 / 38 PASS** |

### v4e + fix#1b (2026-11-04) — résultats consolidés après contre-revue

| Contrôle | Résultat |
|---|---|
| `node --check` sur `candidate-purgeDocument-v4e.js` (fix#1b) | ✓ Aucune erreur de syntaxe |
| `node --check` sur les trois fichiers de tests | ✓ |
| Jest 30.5.2 — Suite A : `pur02-candidate.test.js` — 22 scénarios unitaires | **22 / 22 PASS** |
| Jest 30.5.2 — Suite B : `pur02-http-handler.test.js` — 16 scénarios handlers HTTP | **16 / 16 PASS** |
| Jest 30.5.2 — Suite C : `pur02-path-security.test.js` — 14 scénarios sécurité chemins | **14 / 14 PASS** |
| **Total v4e + fix#1b** | **52 / 52 PASS** |

Sortie Jest complète (2026-11-04) :
```
Test Suites: 3 passed, 3 total
Tests:       52 passed, 52 total
Snapshots:   0 total
Time:        0.707 s
```

Sortie Jest — Suite A — `pur02-candidate.test.js` (v4e + fix#1b — 22 scénarios) :
```
PASS server/__tests__/pur02-candidate.test.js
  ✓ Scenario 1 — absent document silently skipped
  ✓ Scenario 2 — SQL read error propagates
  ✓ Scenario 3 — LanceDB error aborts; SQL record preserved
  ✓ Scenario 4 — SQL cleanup error propagates with orphan warning
  ✓ Scenario 5 — custom-documents folder rejected
  ✓ Scenario 5b — null/empty/whitespace folder name → 400 FOLDER_NAME_REQUIRED
  ✓ Scenario 5c — non-existent folder → 404 FOLDER_NOT_FOUND
  ✓ Scenario 5d — path traversal throws FOLDER_NAME_INVALID before any filesystem access
  ✓ Scenario 6 — nested subdirectory aborts operation
  ✓ Scenario 7 — symbolic link entry aborts operation
  ✓ Scenario 8 — cleanup failure preserves source file
  ✓ Scenario 9 — namespace absent → false, no LanceDB or SQL call
  ✓ Scenario 10 — no vectors found → false, no table.delete
  ✓ Scenario 11 — SQL read error → throws with clear message
  ✓ Scenario 12 — table.delete() error → throws with clear message
  ✓ Scenario 13 — removeDocuments failure prevents purgeVectorCache call
  ✓ Scenario 14 — prisma.workspaces.findMany failure in purgeDocument
  ✓ Scenario 15 — prisma.workspaces.findMany failure in purgeFolder
  ✓ Scenario 16 — purgeVectorCache failure throws and prevents folder deletion
  ✓ Scenario 17 — normalizePath canonical path used for all operations
  ✓ Scenario 18 — purgeFolder returns { success: true, message } on success
  ✓ Scenario 19 — folder with unexpected entries → 400 FOLDER_UNEXPECTED_ENTRIES
Tests: 22 passed, 22 total
```

Sortie Jest — Suite B — `pur02-http-handler.test.js` (v4e — 16 scénarios) :
```
PASS server/__tests__/pur02-http-handler.test.js
  system handler — DELETE /api/system/remove-folder
  ✓ [SYS-H01] 400 FOLDER_NAME_REQUIRED when name missing
  ✓ [SYS-H02] 400 FOLDER_OUTSIDE_DOCUMENTS on path traversal
  ✓ [SYS-H03] 404 FOLDER_NOT_FOUND when folder absent
  ✓ [SYS-H04] 400 FOLDER_UNEXPECTED_ENTRIES when folder has subdirs/symlinks
  ✓ [SYS-H05] 403 FOLDER_PROTECTED for protected folders
  ✓ [SYS-H06] 200 { success: true, message } on clean purge
  ✓ [SYS-H07] 500 on unexpected internal error
  ✓ [SYS-H08] purgeFolder called with correct folder name

  api-document handler — DELETE /api/v1/document/remove-folder
  ✓ [API-H01] 400 FOLDER_NAME_REQUIRED when name missing
  ✓ [API-H02] 400 FOLDER_OUTSIDE_DOCUMENTS on path traversal
  ✓ [API-H03] 404 FOLDER_NOT_FOUND when folder absent
  ✓ [API-H04] 400 FOLDER_UNEXPECTED_ENTRIES when folder has subdirs/symlinks
  ✓ [API-H05] 403 FOLDER_PROTECTED for protected folders
  ✓ [API-H06] 200 { success: true, message } on clean purge
  ✓ [API-H07] 500 on unexpected internal error
  ✓ [API-H08] purgeFolder called with correct folder name
Tests: 16 passed, 16 total
```

Sortie Jest — Suite C — `pur02-path-security.test.js` (nouveau — 14 scénarios) :
```
PASS server/__tests__/pur02-path-security.test.js
  Suite C — Path security with REAL normalizePath and isWithin
  ✓ C-01: '../secret' → fix #1b catches separator → FOLDER_NAME_INVALID, no fs access
  ✓ C-02: '../../etc/passwd' → fix #1b catches separator → FOLDER_NAME_INVALID
  ✓ C-03: '..' → fix #1b catches '..' equality → FOLDER_NAME_INVALID
  ✓ C-04: '/etc/passwd' → fix #1b catches separator → FOLDER_NAME_INVALID
  ✓ C-05: '.' → fix #1b catches '.' equality → FOLDER_NAME_INVALID 400 (O-1 fixed)
  ✓ C-06: 'custom-documents' → validRemovableSubFolders excludes it → FOLDER_PROTECTED
  ✓ C-07: 'valid-folder' → control case → success with real path functions
  ✓ C-08: null → FOLDER_NAME_REQUIRED (before path functions are invoked)
  ✓ C-09: top-level symlink → excluded from allowlist → FOLDER_PROTECTED
  ✓ C-10: '..\\secret' → fix #1b catches backslash → FOLDER_NAME_INVALID
  ✓ C-11: '../secret' with documents/secret existing → FOLDER_NAME_INVALID, no purge ops triggered
  ✓ C-12: '../../secret' with documents/secret existing → FOLDER_NAME_INVALID, no purge ops triggered
  ✓ C-13: '..\\secret' with documents/secret existing → FOLDER_NAME_INVALID, no purge ops triggered
  ✓ C-14: absolute path '/stub/documents/secret' with target existing → FOLDER_NAME_INVALID, no purge ops
Tests: 14 passed, 14 total
```

> **Note** : Les `console.error` visibles pendant les tests d'erreur sont produits par le bloc `catch` du code de production réel — comportement attendu confirmant que le vrai code s'exécute. Ce ne sont pas des échecs de test.

### Commandes de reproduction

```bash
# Environnement ayant produit les 52 PASS (2026-11-04/05)
# Node.js v22.22.0 / Jest 30.5.2

# Dans scratchpad/test-run-v4e/
cd scratchpad/test-run-v4e
node --version          # v22.22.0
npx jest --version      # 30.5.2
npx jest --no-coverage  # → 52 passed, 3 suites

# Suites individuelles
npx jest --no-coverage pur02-candidate        # Suite A — 22 PASS
npx jest --no-coverage pur02-http-handler     # Suite B — 16 PASS
npx jest --no-coverage pur02-path-security    # Suite C — 14 PASS

# Vérification empreintes
sha256sum candidate-purgeDocument-v4e.js PUR-02-E-purgeDocument-v4e-fix1b.patch \
          pur02-candidate.test.js pur02-http-handler.test.js \
          pur02-path-security.test.js

# Vérification application du patch (depuis la racine du serveur)
patch --dry-run -p1 < PUR-02-E-purgeDocument-v4e-fix1b.patch
# → Hunk #1 succeeded — APPLY_OK
```

---

## 4. Défauts corrigés

### 4.1 `candidate-lance-index.js` — `deleteDocumentFromNamespace()`
- **Défaut** : utilisait `DocumentVectors.where()` qui absorbe silencieusement les erreurs SQL et retourne `[]`, causant l'absence de suppression LanceDB sans aucun signal d'erreur.
- **Correctif** : requête Prisma directe (`prisma.document_vectors.findMany`). Erreur SQL → exception propagée. Erreur LanceDB → exception propagée. Retour `false` (au lieu de `undefined`) quand namespace absent ou aucun vecteur.

### 4.2 `candidate-documents.js` — `removeDocuments()` + `_getStrict()`
- **Défaut** : `get()` absorbe les erreurs SQL et retourne `null`, traité comme "document absent".
- **Correctif** : nouvelle méthode `_getStrict()` sans try/catch. `removeDocuments()` utilise `_getStrict()` ; si LanceDB échoue → abort avant SQL (enregistrement préservé pour retry) ; les deux suppressions SQL regroupées dans `prisma.$transaction([...])` pour atomicité SQL-SQL ; si la transaction échoue après LanceDB → log explicite "orphaned rows" + propagation.

### 4.3 `candidate-purgeDocument-v4e.js` — `purgeDocument()` et `purgeFolder()`
- **Défaut `purgeDocument`** : utilisait `Workspace.where()` qui absorbe les erreurs → SQL failure silencieusement traité comme "aucun workspace" ; fichier source supprimé AVANT le nettoyage des associations.
- **Correctif** : `_getWorkspacesStrict()` avec `prisma.workspaces.findMany()` direct ; ordre inversé — associations en premier, source supprimée seulement après succès complet.
- **Défaut `purgeFolder`** : même problème `Workspace.where()` ; `rmSync({recursive:true})` même en cas d'échec partiel ; pas de vérification des liens symboliques ni des sous-répertoires ; `purgeVectorCache` appelé avant `removeDocuments`.
- **Correctif** : `_getWorkspacesStrict()` ; vérification `withFileTypes` de chaque entrée (sous-répertoire ou symlink → abort) ; lstat sur les dossiers racine (symlinks exclus) ; `removeDocuments` AVANT `purgeVectorCache` ; `cleanupErrors[]` ; si erreurs → dossier NON supprimé ; suppression par `unlinkSync` fichier par fichier puis `rmdirSync` (non-récursif).

---

## 5. Corrections post-revue ChatGPT (v1 → v2 → v3)

### v1 → v2 (première revue ChatGPT)

| # | Problème identifié par ChatGPT | Correction appliquée |
|---|---|---|
| C1 (bloquant) | `Workspace.where()` absorbe les erreurs → liste vide indiscernable d'une DB inaccessible | Remplacé par `_getWorkspacesStrict()` → `prisma.workspaces.findMany()` dans `purgeDocument()` et `purgeFolder()` |
| C2 (bloquant) | Les deux suppressions SQL (`workspace_documents.delete` + `document_vectors.deleteMany`) non atomiques entre elles | Regroupées dans `prisma.$transaction([...])` |
| C3 | `purgeFolder()` appelait `purgeVectorCache` avant `removeDocuments` | Ordre corrigé : `removeDocuments` en premier |
| C4 | `deleteDocumentFromNamespace()` non testée directement | Scénarios 9-12 ajoutés |

Corrections dans les tests (v1 → v2) :
- `mockPrisma` enrichi : `$transaction` + `workspaces.findMany`
- Scénarios 5-8 : ajout du stub `../../utils/prisma` (requis par `candidate-purgeDocument.js` v2)
- Scénario 4 : mock de `$transaction` au lieu des opérations individuelles (évite les unhandled rejections)
- Scénario 8 : `_getWorkspacesStrict()` alimenté via `mockPrismaWorkspacesFindMany` (remplace le stub `Workspace.where`)

### v2 → v3 (seconde revue ChatGPT)

| # | Problème identifié par ChatGPT | Correction appliquée |
|---|---|---|
| C5 | `purgeFolder()` supprimait les caches même si `removeDocuments` avait échoué | Vérification de `cleanupErrors` ajoutée entre la boucle `removeDocuments` et la boucle `purgeVectorCache` (early-exit) |
| C6 | Aucun test de régression pour le défaut C5 | Scénario 13 ajouté |
| C7 | Aucun test automatisé pour l'échec de `prisma.workspaces.findMany` dans `purgeDocument()` | Scénario 14 ajouté |
| C8 | Aucun test automatisé pour l'échec de `prisma.workspaces.findMany` dans `purgeFolder()` | Scénario 15 ajouté |

### v3 → v4 (troisième revue ChatGPT)

| # | Problème identifié par ChatGPT | Correction appliquée |
|---|---|---|
| C9 | `purgeFolder()` : les trois `return` sur erreur masquent les échecs à l'appelant (HTTP 200 en cas d'échec) | Remplacés par `throw new Error(...)` pour chaque type d'erreur : SQL workspace, association cleanup, cache purge |
| C10 | `purgeDocument()` : `normalizePath(filename)` appelé pour validation uniquement, valeur de retour ignorée ; les trois opérations utilisaient le chemin original non normalisé | Normalisation stockée dans `const normalized` ; toutes les opérations (`removeDocuments`, `purgeVectorCache`, `purgeSourceDocument`) utilisent `normalized` |
| C11 | Scénarios 13 et 15 invalides après C9 (appellent `purgeFolder()` sans attendre un `rejects`) | Mis à jour vers `await expect(purgeFolder(TARGET)).rejects.toThrow(...)` |
| C12 | Aucun test de régression pour l'échec de `purgeVectorCache` dans `purgeFolder()` | Scénario 16 ajouté |
| C13 | Aucun test de régression pour la normalisation du chemin dans `purgeDocument()` | Scénario 17 ajouté |

### v4 → v4e — corrections PUR-02-E (2026-11-03)

Défaut PUR-02-E identifié lors de la revue des tests HTTP : `purgeFolder()` retournait `undefined` (pas de `return` explicite sur le chemin succès) → les deux handlers HTTP renvoyaient un HTTP 200 avec un corps `null` ou vide, annonçant un succès sans confirmation.

| # | Problème identifié | Correction appliquée dans `candidate-purgeDocument-v4e.js` |
|---|---|---|
| C14 | `purgeFolder()` ne validait pas le nom du dossier : appels avec `undefined`/`null`/chaîne vide passaient silencieusement | Validation préalable : `if (!folderName \|\| …)` → `throw folderError(400, "FOLDER_NAME_REQUIRED", …)` |
| C15 | Aucun contrôle de traversal de chemin ni de dossier protégé (`custom-documents`) dans `purgeFolder()` | Ajout de `normalizePath(folderName)` + vérification que le chemin résolu reste sous `DOCUMENTS_ROOT` → `throw folderError(400, "FOLDER_OUTSIDE_DOCUMENTS", …)` ; vérification dossier protégé → `throw folderError(403, "FOLDER_PROTECTED", …)` ; dossier absent → `throw folderError(404, "FOLDER_NOT_FOUND", …)` |
| C16 | `purgeFolder()` n'interceptait pas les dossiers contenant des sous-répertoires ou des liens symboliques avant de démarrer la purge | Vérification `withFileTypes` en début de fonction → `throw folderError(400, "FOLDER_UNEXPECTED_ENTRIES", …)` |
| C17 | `purgeFolder()` ne retournait rien (`undefined`) sur le chemin succès → HTTP 200 corps `null` | `return { success: true, message: \`Folder "${folderName}" purged successfully\` }` ajouté en fin de fonction |

Tests ajoutés pour PUR-02-E :

| Scénario | Description |
|---|---|
| S05b | `null` / chaîne vide / whitespace → `400 FOLDER_NAME_REQUIRED` |
| S05c | Dossier inexistant → `404 FOLDER_NOT_FOUND` |
| S05d | Traversal `../secret` → `400 FOLDER_OUTSIDE_DOCUMENTS` |
| S18 | Succès nominal → `{ success: true, message }` |
| S19 | Dossier avec sous-répertoires/liens symboliques → `400 FOLDER_UNEXPECTED_ENTRIES` |

Tests handlers HTTP ajoutés (Suite B — `pur02-http-handler.test.js`) :  
16 scénarios couvrant les deux endpoints réels (`endpoints/system.js` et `endpoints/api/v1/document/index.js`) via la technique du *route recorder* + `loadCandidateModule()`.

Vérification des autres appelants de `purgeFolder()` :
- `endpoints/system.js` ligne 506 : `const result = await purgeFolder(name); response.status(200).json(result);`
- `endpoints/api/v1/document/index.js` ligne 1081 : même pattern
- Les deux passent directement le retour à `.json()`. Le changement `undefined → { success: true, message }` est une amélioration stricte (réponse JSON valide au lieu d'un corps vide). Aucun autre appelant.

---

## 6. Corrections post-contre-revue indépendante (v4e → v4e + fix#1b, 2026-11-04)

Deux points soulevés par la contre-revue indépendante (ChatGPT, transmis le 2026-11-04).

### Point 1 — Défaut D-2 : traversal vers cible existante (BLOQUANT, corrigé)

**Scénario** : `normalizePath("../secret")` strip le préfixe `../` et retourne `"secret"`. Si `documents/secret` existe ET est dans `validRemovableSubFolders`, la purge est déclenchée — aucune erreur. Pas d'échappement de chemin (isWithin aurait bloqué), mais une confusion sémantique destructive : l'entrée `../secret` provoque la suppression du dossier `secret`.

**Analyse complète du chemin de code (sans fix)** :
1. `normalizePath("../secret")` → `"secret"` (regex strip `../`)
2. `subFolderPath = path.resolve(DOCS, "secret")` = `DOCS/secret`
3. `isWithin(DOCS, DOCS/secret)` → `true`
4. `existsSync(DOCS/secret)` → `true` (cible présente)
5. `validRemovableSubFolders.includes("secret")` → `true`
6. Purge déclenchée → fichiers supprimés, `rmdirSync` exécuté ✗

**Fix appliqué (fix#1b)** : vérification pré-normalisée dans `purgeFolder()`, avant tout appel à `normalizePath` ou toute opération filesystem. Rejette tout `folderName` contenant `/` ou `\` ou égal à `".."` ou `"."`. Nouveau code d'erreur : `FOLDER_NAME_INVALID` (400).

```javascript
const trimmedFolderName = folderName.trim();
if (
  /[/\\]/.test(trimmedFolderName) ||
  trimmedFolderName === ".." ||
  trimmedFolderName === "."
) {
  throw folderError(
    400,
    "FOLDER_NAME_INVALID",
    `[purgeFolder] "${trimmedFolderName}" is not a valid top-level folder name \
(contains path separators or traversal sequences).`
  );
}
```

**Effet de bord positif** : corrige également O-1 (`"."` → 400 clair au lieu de 500 non typé).

**Tests de régression** (Suite A, Scénario 5d mis à jour ; Suite C, C-01 à C-05, C-10 à C-14) :
- C-11 : `"../secret"` avec `documents/secret` existant → `FOLDER_NAME_INVALID`, aucune opération destructive
- C-12 : `"../../secret"` avec `documents/secret` existant → idem
- C-13 : `"..\\secret"` (backslash) avec cible existante → idem
- C-14 : `"/stub/documents/secret"` (chemin absolu) avec cible existante → idem
- Tous confirment : `readdirSync`, `unlinkSync`, `rmdirSync`, `purgeVectorCache`, `removeDocuments` **non appelés**.

### Point 2 — Cohérence des livrables et des empreintes (résolu)

**Problème identifié** : rapport d'audit montrait SHA `737ed35d…` ; fiche de livraison montrait `95c06dcf…` et 38/38. Incohérence due à des versions différentes du candidat entre les deux documents.

**Résolution** :
- Fix#1b appliqué → nouveau SHA candidat : `90a21b04…`
- Suite C créée (14 scénarios) → SHA `89e32abc…`
- Suite A mise à jour (CANDIDATE_PURGE → v4e, Scénario 5d → FOLDER_NAME_INVALID, commentaire d'en-tête 17→22) → SHA `f3e88f13…`
- **Total normalisé : 52 / 52 PASS** (22 Suite A + 16 Suite B + 14 Suite C)
- Toutes les empreintes dans cette fiche de livraison correspondent aux fichiers du run 2026-11-04.

---

## 7. Limites résiduelles connues

### L-1 — Non-atomicité Prisma / LanceDB (non résolu, documenté)
Prisma (SQLite) et LanceDB n'ont pas de transaction partagée. Deux scénarios de défaillance partielle subsistent :

| Scénario | État résultant | Détection |
|---|---|---|
| SQL `findMany` OK → LanceDB `table.delete()` échoue | document_vectors rows présents, vecteurs LanceDB **toujours présents** | Exception propagée + log `[LanceDb.deleteDocumentFromNamespace] LanceDB deletion failed` |
| LanceDB OK → `prisma.$transaction` échoue | Vecteurs LanceDB **supprimés**, document_vectors rows **orphelines** | Exception propagée + log `[removeDocuments] SQL cleanup failed … document_vectors rows … may be orphaned` |

**Remédiation manuelle pour le scénario 2** : identifier les `docId` dans les logs, puis :
```sql
DELETE FROM document_vectors WHERE docId = '<docId>';
```

### L-2 — `purgeFolder` : opération non atomique par fichier
Si `purgeVectorCache()` réussit pour le fichier N et échoue pour N+1, les caches antérieurs sont perdus mais le dossier est préservé. Les fichiers dont le cache est manquant peuvent être ré-indexés.

### L-3 — `purgeDocument` : workspace partiellement nettoyé
Si `removeDocuments()` lève une exception à mi-parcours (workspace W_n après avoir nettoyé W_1…W_{n-1}), la source est préservée mais certains workspaces ont déjà eu leurs associations supprimées. Un retry repassera sans effet secondaire sur les workspaces déjà nettoyés (`if (!document) continue`).

### L-4 — Tests unitaires : isolation par eval, pas d'intégration réelle
Les tests unitaires (`pur02-candidate.test.js`) utilisent `Module.wrap` + `eval` pour injecter des stubs. La couverture est comportementale ; elle ne couvre pas la sérialisation SQL réelle, le comportement de `table.delete()` avec un filtre malformé, ni l'interaction avec un vrai namespace LanceDB.

### L-5 — Tests HTTP : handlers réels, mais `purgeFolder` mockée
Les tests handlers (`pur02-http-handler.test.js`) exécutent les vrais fichiers de routes AnythingLLM (via `loadCandidateModule`). Cependant, `purgeFolder` elle-même est remplacée par un mock Jest. Ces tests valident le routage des erreurs et du succès entre le handler HTTP et `purgeFolder`, mais pas l'exécution réelle de `purgeFolder` dans ce contexte. La couverture comportementale de `purgeFolder` reste celle de la Suite A.

La variable d'environnement `process.env.STORAGE_DIR` doit être définie avant le chargement du module `api-document-index.js` (ligne 23 évalue `path.resolve(STORAGE_DIR, 'documents')` au chargement). Le fichier de tests fixe `STORAGE_DIR=/tmp/stub-storage` en en-tête pour éviter l'erreur `TypeError: The "paths[0]" argument must be of type string`.

### ~~O-1 — `purgeFolder(".")` → HTTP 500~~ (RÉSOLU par fix#1b)
~~`normalizePath(".")` lève `Error("Invalid path.")` sans `statusCode` → handler HTTP mappe vers 500. Comportement non typé, différent des autres rejets de validation (400).~~

**O-1 résolu** : fix#1b intercepte `"."` avant normalizePath → `FOLDER_NAME_INVALID` (400). Vérifié par C-05.

---

## 8. Procédure de déploiement recommandée (hors périmètre de cette livraison)

1. Valider les diffs manuellement (fichiers `.diff` joints)
2. Copier les 3 candidats sur les copies de laboratoire déjà vérifiées
3. Recalculer les SHA-256 après copie et comparer à la table §2
4. Tester en environnement staging (conteneur isolé, DB de test) avant production
5. Ne pas modifier le conteneur AnythingLLM de production sans snapshot préalable
6. Conserver le tag de rollback `mintplexlabs/anythingllm:rollback-20261025-091540`
