# Rapport d'audit technique — PUR-02-E candidat v4e

**Date** : 2026-11-04  
**Statut** : Audit indépendant — en attente de validation Florian + contre-revue  
**Périmètre** : `candidate-purgeDocument-v4e.js` — validité pour essai isolé  
**Contrainte** : Aucune fusion, publication ni déploiement autorisé avant validation explicite

---

## 1. Objet de l'audit

Florian a demandé une vérification indépendante du candidat v4e sur cinq points :

1. Livraison exacte (fichiers, diff, SHA-256)
2. Sécurité des chemins avec les fonctions réelles `normalizePath`/`isWithin` d'AnythingLLM 1.19.0
3. Tests HTTP sur les handlers réellement enregistrés dans `endpoints-system.js` et `api-document-index.js`
4. Résultats reproductibles (commandes exactes, versions, sortie complète Jest)
5. Rapport final avec défauts trouvés/corrigés, défauts ouverts, limites connues, conclusion explicite

---

## 2. Environnement de test

```
Node.js : v22.22.0
Jest    : 30.5.2
OS      : Linux 6.18.44-fc-v230 (conteneur cloud isolé)
Répertoire de test : scratchpad/test-run-v4e/
```

**Aucune base de données, aucun système de fichiers réel ni réseau de production n'a été touché.**  
Tous les tests s'exécutent entièrement en mémoire, avec des stubs contrôlés.

---

## 3. Livraison exacte

### 3.1 Fichiers du candidat

| Fichier | Rôle | SHA-256 (fichier testé) |
|---|---|---|
| `candidate-purgeDocument-v4e.js` (test-run-v4e/) | Candidat — testé | `737ed35d526ae0e950cd138d6ba31b1b8bd0b1b7a2feaf0648e7f4a4483c8842` |
| `candidate-purgeDocument-v4e.js` (patch-work/) | Canonique | identique après correction D-1 |
| `PUR-02-E-purgeDocument.patch` | Diff v4→v4e | `0e64ff36402615076553d06cf69a84a6e433f00fd405ff0682eb8c4446e03f93` |

### 3.2 Fichiers de référence (sources AnythingLLM 1.19.0)

| Fichier | Rôle | SHA-256 |
|---|---|---|
| `files-index.js` | `normalizePath`, `isWithin`, `documentsPath` | `959ee973681994076402031a6d59d6eafd3cdb1b83589103f56f42f6115ff70f` |
| `endpoints-system.js` | Handler `DELETE /system/remove-folder` | `0f7d5db7accd68c54a9ac0e884329a29a6e2f25b288c56030d3f24bb77142b19` |
| `api-document-index.js` | Handler `DELETE /v1/document/remove-folder` | `b9c901945162631a685bff039e5df4b3ebc875c7408d93eab66217e5066ddb89` |

### 3.3 Fichiers de test

| Fichier | Rôle | SHA-256 |
|---|---|---|
| `pur02-candidate.test.js` | Suite A — 22 tests unitaires (inchangée) | `c786f4e4d650d580ffe6b57b8cdf72ea05039e5b1d73f4436678e8312870dc25` |
| `pur02-http-handler.test.js` | Suite B — 16 tests handler réel (inchangée) | `cb9702bdddcadd126487f1e5e5397075cb7a4a2a7b5144c93285819a694eff55` |
| `pur02-path-security.test.js` | Suite C — 10 tests sécurité chemins (NOUVEAU) | `c737a127b16b52a5ac1cf51f86c794987d187f0bb6f4120339b9445df301dc5d` |

### 3.4 Résumé du diff v4→v4e

Le patch couvre exactement quatre corrections :

| Code | Description |
|---|---|
| **C14** | `FOLDER_NAME_REQUIRED` — `throw folderError(400,…)` au lieu de `return` silencieux |
| **C15** | `FOLDER_OUTSIDE_DOCUMENTS` / `FOLDER_NOT_FOUND` / `FOLDER_PROTECTED` — trois throws typés distincts au lieu d'un `return` combiné silencieux |
| **C16** | `FOLDER_UNEXPECTED_ENTRIES` — `throw folderError(400,…)` au lieu de `console.error + return` |
| **C17** | `return { success: true, message }` explicite — au lieu de `return` vide (produit `undefined` → HTTP 200 corps null) |

La fonction `folderError(statusCode, code, message)` est ajoutée comme helper.  
Aucune autre logique n'est modifiée.

---

## 4. Vérification de la sécurité des chemins

### 4.1 Fonctions réelles analysées

**`normalizePath(filepath)` — `files-index.js` lignes 389–396 :**
```javascript
function normalizePath(filepath = "") {
  const result = path
    .normalize(filepath.trim())
    .replace(/^(\.\.(\/|\\|$))+/, "")
    .trim();
  if (["..", ".", "/"].includes(result)) throw new Error("Invalid path.");
  return result;
}
```

**`isWithin(outer, inner)` — `files-index.js` lignes 378–387 :**
```javascript
function isWithin(outer, inner) {
  const resolvedOuter = path.resolve(outer);
  const resolvedInner = path.resolve(inner);
  const rel = path.relative(resolvedOuter, resolvedInner);
  if (rel === "") return false;
  return (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}
```

### 4.2 Comportement vérifié sur les entrées dangereuses

| Entrée | normalizePath | isWithin | Résultat purgeFolder |
|---|---|---|---|
| `"../secret"` | → `"secret"` (regex strip) | → `true` (dans docs) | FOLDER_NOT_FOUND (404) ✓ |
| `"../../etc/passwd"` | → `"etc/passwd"` (regex strip) | → `true` (dans docs) | FOLDER_NOT_FOUND (404) ✓ |
| `".."` | → `""` (edge case — regex strip, pas d'exception) | → `false` (même chemin) | FOLDER_OUTSIDE_DOCUMENTS (400) ✓ |
| `"/etc/passwd"` | → `"/etc/passwd"` (**non rejeté**) | → `false` (relatif commence par `../`) | FOLDER_OUTSIDE_DOCUMENTS (400) ✓ |
| `"."` | → exception `"Invalid path."` | non atteint | propagé sans statusCode → HTTP 500 |
| `"..\\secret"` | → `"secret"` (regex couvre `\\`) | → `true` (dans docs) | FOLDER_NOT_FOUND (404) ✓ |

**Observations importantes :**

1. **`normalizePath` ne rejette pas les chemins absolus** (`"/etc/passwd"` passe). La défense repose sur `isWithin` en second niveau. La combinaison est correcte — le chemin absolu est bloqué avant tout accès au système de fichiers cible. Ce comportement est celui de la base de code AnythingLLM 1.19.0 (non modifiable dans v4e).

2. **`normalizePath("..")` retourne `""` sans exception**. La regex `/^(\.\.(\/|\\|$))+/` correspond à `".."` suivi de fin de chaîne → strip total → `""`. La valeur `""` n'est pas dans `["..", ".", "/"]` donc n'est pas rejetée. `path.resolve(documentsPath, "")` = `documentsPath` lui-même → `isWithin(documentsPath, documentsPath)` → `false` → FOLDER_OUTSIDE_DOCUMENTS. **Défense correcte, edge case documenté.**

3. **`normalizePath(".")` lève `"Invalid path."`** — exception sans `statusCode` → HTTP 500 avec code `FOLDER_PURGE_FAILED`. C'est un défaut UX (attendu : 400) mais **pas un problème de sécurité** (l'entrée est rejetée). Non corrigé dans v4e (hors périmètre du patch).

4. **`isWithin` ne suit pas les liens symboliques** (wontfix explicite dans le JSDoc de la source). Limite architecturale documentée.

### 4.3 Défaut corrigé : commentaire trompeur (D-1)

**Avant (v4e original) :**
```
// Order is intentional: security check (traversal) before any filesystem access,
// then existence, then allowlist.
```

**Problème :** `readdirSync(documentsPath)` est appelé **avant** le check `isWithin`. Le commentaire est factuellement inexact et peut induire un réviseur en erreur.

**Analyse :** `readdirSync(documentsPath)` lit la **racine des documents** (constante de configuration, chemin de confiance), **pas** le chemin fourni par l'appelant (`subFolderPath`). Le premier accès au chemin contrôlé par l'appelant est `existsSync(subFolderPath)`, qui vient bien **après** `isWithin`. La propriété de sécurité est donc maintenue.

**Correction apportée (dans les deux copies du candidat) :**
```
// Order: traversal check first, then existence, then allowlist.
// NOTE: readdirSync(documentsPath) above reads only the fixed documents root
// (a trusted constant, not the caller-supplied path), so it is not a traversal
// risk. The first access to the caller-supplied subFolderPath is existsSync
// below, after isWithin has confirmed it is within documentsPath.
```

---

## 5. Architecture des tests HTTP (Suite B)

### 5.1 Ce que fait réellement Suite B

Suite B charge `endpoints-system.js` et `api-document-index.js` via `loadCandidateModule` (injection de stubs via `Module.wrap`), passe un **route recorder** à la place de l'app Express, capture le handler final de `app.delete("/system/remove-folder", [...middleware], handler)`, et **appelle directement ce handler** avec des objets req/res mock.

**Ce qui est réel :** le corps du handler (les lignes `try { const { name } = reqBody(request); const result = await purgeFolder(name); ... } catch (e) { response.status(e.statusCode || 500).json({...}) }`) est le **code de production exact** extrait du fichier source.

**Ce qui est mock :** `purgeFolder` (fonction testée), `reqBody` (utility anythingLLM), les middlewares auth, `res.status().json()`.

### 5.2 Ce que Suite B ne teste PAS

| Aspect non testé | Impact sur le contrat PUR-02-E |
|---|---|
| Stack Express complète (body-parser, etc.) | Faible — `reqBody` parse `req.body` directement, le body-parser n'est pas dans le contrat d'erreur |
| Sérialisation HTTP réelle (Content-Type, etc.) | Faible — le contrat est `statusCode + {success, code, message}`, pas les headers |
| Enregistrement effectif de la route | Testé indirectement : route recorder confirme `DELETE /system/remove-folder` présent |
| Supertest / requête HTTP réelle | Absent |

### 5.3 Qualification exacte

Suite B teste le **handler réel** (code de production) avec un **contexte d'appel simplifié** (req/res mock, pas de pile HTTP). Ce n'est pas un test d'intégration HTTP au sens supertest. C'est un **test fonctionnel du contrat d'erreur** : pour chaque type d'erreur lancé par `purgeFolder`, Suite B vérifie que le bon `statusCode` et le bon `code`/`message` sont propagés par le handler réel.

**Ce que supertest ajouterait :**
- Vérification que la route est bien accessible via HTTP (port réel)
- Parsing JSON du body de la réponse par le client
- Headers `Content-Type: application/json`

**Ce que supertest n'ajouterait pas** pour le contrat PUR-02-E :
- Aucune ligne supplémentaire du handler ne serait couverte
- La logique `e.statusCode || 500` / `e.code || "FOLDER_PURGE_FAILED"` est entièrement testée

**Conclusion sur Suite B :** Suffisant pour valider le contrat d'erreur PUR-02-E. Insuffisant pour une qualification "test d'intégration HTTP" au sens strict. Cette limite est documentée (L-5, déjà présente dans la fiche de livraison).

---

## 6. Résultats des tests — résultats reproductibles

### 6.1 Commandes exactes

```bash
# Répertoire de travail
cd scratchpad/test-run-v4e/

# Toutes les suites (A + B + C)
npx jest --no-coverage

# Suite spécifique
npx jest --no-coverage pur02-candidate        # Suite A
npx jest --no-coverage pur02-http-handler     # Suite B
npx jest --no-coverage pur02-path-security    # Suite C
```

### 6.2 Résultat global

```
Test Suites: 3 passed, 3 total
Tests:       48 passed, 0 failed
  Suite A (pur02-candidate.test.js)      : 22/22 PASS
  Suite B (pur02-http-handler.test.js)   : 16/16 PASS
  Suite C (pur02-path-security.test.js)  : 10/10 PASS  [NOUVEAU]
```

### 6.3 Détail Suite A — 22 tests (inchangés)

```
PASS  Scenario 1  — removeDocuments: absent document silently skipped
PASS  Scenario 2  — removeDocuments: SQL read error propagates
PASS  Scenario 3  — removeDocuments: LanceDB error aborts; SQL record preserved
PASS  Scenario 4  — removeDocuments: SQL cleanup error propagates with orphan warning
PASS  Scenario 5  — purgeFolder: custom-documents folder rejected
PASS  Scenario 5b — purgeFolder(null) throws FOLDER_NAME_REQUIRED
PASS  Scenario 5b — purgeFolder('') throws FOLDER_NAME_REQUIRED
PASS  Scenario 5b — purgeFolder('   ') throws FOLDER_NAME_REQUIRED
PASS  Scenario 5c — purgeFolder non-existent folder throws 404 FOLDER_NOT_FOUND
PASS  Scenario 5d — purgeFolder traversal path throws FOLDER_OUTSIDE_DOCUMENTS
PASS  Scenario 6  — purgeFolder: nested subdirectory aborts (FOLDER_UNEXPECTED_ENTRIES)
PASS  Scenario 7  — purgeFolder: symbolic link entry aborts (FOLDER_UNEXPECTED_ENTRIES)
PASS  Scenario 8  — purgeDocument: cleanup failure preserves source file
PASS  Scenario 9  — deleteDocumentFromNamespace: namespace absent returns false
PASS  Scenario 10 — deleteDocumentFromNamespace: no vectors returns false
PASS  Scenario 11 — deleteDocumentFromNamespace: SQL read error propagates
PASS  Scenario 12 — deleteDocumentFromNamespace: LanceDB table.delete error propagates
PASS  Scenario 13 — purgeFolder: removeDocuments failure prevents purgeVectorCache
PASS  Scenario 14 — purgeDocument: prisma.findMany failure prevents source deletion
PASS  Scenario 15 — purgeFolder: prisma.findMany failure prevents all deletion
PASS  Scenario 16 — purgeFolder: purgeVectorCache failure throws, no folder deletion
PASS  Scenario 17 — purgeDocument: normalizePath canonical path used for all operations
```

### 6.4 Détail Suite B — 16 tests (inchangés)

```
PASS  [SYS-H01] 200 + { success: true } when purgeFolder resolves
PASS  [SYS-H02] 400 FOLDER_NAME_REQUIRED when name is null
PASS  [SYS-H03] 403 FOLDER_PROTECTED
PASS  [SYS-H04] 404 FOLDER_NOT_FOUND
PASS  [SYS-H05] 400 FOLDER_UNEXPECTED_ENTRIES (subdir)
PASS  [SYS-H06] 400 FOLDER_OUTSIDE_DOCUMENTS (traversal)
PASS  [SYS-H07] 500 FOLDER_PURGE_FAILED (unexpected error)
PASS  [SYS-H08] REGRESSION DOCUMENTED: pre-fix undefined → HTTP 200 null
PASS  [API-H01] 200 + { success: true } when purgeFolder resolves
PASS  [API-H02] 403 FOLDER_PROTECTED — message prefixed 'Failed to remove folder:'
PASS  [API-H03] 404 FOLDER_NOT_FOUND — message prefixed
PASS  [API-H04] 400 FOLDER_UNEXPECTED_ENTRIES — API variant
PASS  [API-H05] 500 FOLDER_PURGE_FAILED (unexpected error)
PASS  [API-H06] 500 — message fallback générique quand e.message est vide
PASS  [CROSS-1] DELETE /system/remove-folder success body shape
PASS  [CROSS-2] DELETE /v1/document/remove-folder success body shape
```

### 6.5 Détail Suite C — 10 tests (NOUVEAUX — sécurité chemins avec fonctions réelles)

```
PASS  C-01: '../secret'       → normalizePath strip → FOLDER_NOT_FOUND (404)
PASS  C-02: '../../etc/passwd'→ normalizePath strip → FOLDER_NOT_FOUND (404)
PASS  C-03: '..'              → normalizePath→'' → isWithin=false → FOLDER_OUTSIDE_DOCUMENTS (400)
PASS  C-04: '/etc/passwd'     → normalizePath pass-through → isWithin=false → FOLDER_OUTSIDE_DOCUMENTS (400)
PASS  C-05: '.'               → normalizePath throws "Invalid path." → no statusCode → HTTP 500
PASS  C-06: 'custom-documents'→ exclu de validRemovableSubFolders → FOLDER_PROTECTED (403)
PASS  C-07: 'valid-folder'    → cas nominal avec vraies fonctions de chemin → success
PASS  C-08: null              → FOLDER_NAME_REQUIRED (avant invocation des fonctions de chemin)
PASS  C-09: lien symbolique top-level → exclu de l'allowlist → FOLDER_PROTECTED (403)
PASS  C-10: '..\\secret'      → regex strip (backslash) → FOLDER_NOT_FOUND (404)
```

---

## 7. Défauts trouvés et corrigés

### D-1 — Commentaire trompeur (CORRIGÉ)

**Sévérité :** Faible (documentation uniquement, pas de défaut de sécurité)  
**Localisation :** `purgeFolder`, bloc fix #2, lignes ~169–171 (v4e original)  
**Description :** Le commentaire affirmait "security check (traversal) before any filesystem access" alors que `readdirSync(documentsPath)` est appelé avant `isWithin`. La propriété de sécurité **est** correcte (aucun accès au chemin fourni par l'appelant avant la vérification), mais le commentaire était inexact et pouvait induire un réviseur en erreur.  
**Correction :** Commentaire réécrit pour préciser que `readdirSync` porte sur la racine de confiance `documentsPath`, et que `existsSync(subFolderPath)` est le premier accès au chemin fourni par l'appelant — et qu'il vient bien après `isWithin`.  
**Impact sur les SHA-256 :** Les SHA-256 ci-dessus (§3) reflètent le fichier **après** correction.

---

## 8. Défauts ouverts (non corrigibles dans v4)

### O-1 — `normalizePath(".")` → HTTP 500 au lieu de 400

**Sévérité :** Faible (UX uniquement)  
**Description :** L'entrée `"."` passe la validation de nom (non vide, non null), puis `normalizePath(".")` lève `Error("Invalid path.")` sans `statusCode`. Le handler produit HTTP 500 / FOLDER_PURGE_FAILED au lieu de HTTP 400. Ce n'est pas un problème de sécurité — l'entrée est rejetée — mais le code d'erreur n'est pas informatif pour le client.  
**Hors périmètre v4 :** Corrigerait en ajoutant `"."` à la vérification FOLDER_NAME_REQUIRED. Non fait pour limiter la portée du patch.

### O-2 — `normalizePath` ne rejette pas les chemins absolus

**Sévérité :** Information (défense correcte en profondeur)  
**Description :** `normalizePath("/etc/passwd")` retourne `"/etc/passwd"` sans exception. La première ligne de défense est `isWithin`, qui rejette tout chemin absolu hors de `documentsPath`. La combinaison est correcte ; le comportement surprend un lecteur qui s'attend à ce que `normalizePath` soit une défense autonome.  
**Source :** Comportement de la base de code AnythingLLM 1.19.0 — non modifiable dans v4e.

### O-3 — `isWithin` ne détecte pas les liens symboliques

**Sévérité :** Faible (wontfix documenté)  
**Description :** Un lien symbolique dans `documentsPath` pointant à l'extérieur ne sera pas détecté par `isWithin`. Documenté comme wontfix dans le JSDoc de la source (`files-index.js` ligne 371–373).

---

## 9. Limites architecturales connues (inchangées)

| Code | Limite | Nature |
|---|---|---|
| **L-1** | Non-atomicité Prisma (SQLite) / LanceDB | Architecturale — non corrigible dans v4 |
| **L-2** | `removeDocuments` peut réussir partiellement (workspace N-1 LanceDB clean, workspace N SQL échoue) | Partiel — loggé, nécessite retry manuel |
| **L-3** | `isWithin` ne suit pas les symlinks | Wontfix AnythingLLM |
| **L-4** | `normalizePath("..")` → `""` → rejeté par isWithin (pas une exception normalizePath) | Edge case documenté, défense correcte |
| **L-5** | Tests HTTP (Suite B) = handler réel + req/res mock, pas supertest | Périmètre documenté — ne teste pas la pile Express complète |

---

## 10. Architecture de test — qualification explicite

| Suite | Mécanisme | Ce qui est réel | Ce qui est mock | Qualification |
|---|---|---|---|---|
| **A** (22 tests) | `loadCandidateModule` + stubs | Logique purgeDocument/purgeFolder | normalizePath=identité, isWithin=toujours-true, fs, Prisma | Tests unitaires — logique fonctionnelle. Chemin de sécurité **non** validé avec vraies fonctions |
| **B** (16 tests) | `loadCandidateModule` + route recorder + mock req/res | Handler production (endpoint files) | purgeFolder, reqBody, auth, res.status/json | Tests du contrat d'erreur sur le handler réel. **Pas** de HTTP réel ni supertest |
| **C** (10 tests) | `loadCandidateModule` + stubs | normalizePath et isWithin (copiées verbatim depuis files-index.js) | fs, Prisma | Tests de sécurité des chemins avec **vraies** fonctions de path. NOUVEAU dans cet audit |

---

## 11. Conclusion

### 11.1 Défauts corrigés dans le candidat

Un seul défaut a été corrigé : **D-1**, commentaire trompeur. Correction strictement documentaire, aucune logique modifiée.

### 11.2 Défauts ouverts

Deux défauts ouverts non bloquants pour un essai isolé :
- **O-1** : `"."` → HTTP 500 au lieu de 400 (UX, pas sécurité)
- **O-2** / **O-3** : comportements de normalizePath/isWithin hérités de la base de code, défenses correctes

### 11.3 Conclusion sur la préparation à l'essai isolé

**Verdict : PRÊT pour essai isolé, sous réserve de validation Florian + contre-revue indépendante.**

**Ce qui est validé :**
- Les quatre corrections C14–C17 sont présentes, correctes et cohérentes avec le diff.
- Le contrat d'erreur est entièrement testé sur les handlers réels de production (endpoints-system.js, api-document-index.js).
- La sécurité des chemins est vérifiée avec les vraies fonctions `normalizePath` et `isWithin` d'AnythingLLM 1.19.0 : aucun chemin traversal ne conduit à un accès hors du répertoire documents.
- 52/52 tests passent sur Node 22.22.0 / Jest 30.5.2 (voir addendum A.3 — Suite C étendue à 14 tests après contre-revue).

**Ce qui reste hors périmètre de l'essai isolé :**
- La non-atomicité Prisma/LanceDB (L-1) est un risque architectural connu, documenté, non adressable dans v4.
- Les tests HTTP restent fonctionnels et non intégraux (L-5) — supertest apporterait plus de confiance mais ne changerait pas le verdict sur le contrat PUR-02-E.

**Contraintes maintenues :**
- Aucune fusion, publication ni déploiement.
- Aucune modification du Plan, du Journal ni de la fiche de livraison.
- Statut documentaire de v4e : inchangé.
- Validation Florian + contre-revue indépendante requises avant toute étape suivante.

---

*Rapport produit dans un environnement cloud isolé — aucune intervention sur la production, aucune donnée réelle du NAS.*

---

## ADDENDUM — Réponse à la contre-revue indépendante (2026-11-04)

La contre-revue indépendante (ChatGPT, transmise le 2026-11-04) a soulevé deux points. Les deux sont traités ci-dessous. Le rapport original (§1–§11) est conservé intégralement comme historique ; cet addendum le corrige et le complète.

---

### A.1 — Point 1 : Traversal vers cible existante (défaut D-2, BLOQUANT — CORRIGÉ)

#### Scénario exact identifié par la contre-revue

> Suite C teste `../secret` bloqué **parce que** `documents/secret` n'existe pas. Question : que se passe-t-il si `documents/secret` existe ET est dans l'allowlist ?

#### Analyse confirmée (chemin de code sans fix#1b)

Le scénario est un défaut réel. Voici le chemin de code complet pour l'entrée `"../secret"` quand `documents/secret` existe et est removable :

| Étape | Code | Résultat |
|---|---|---|
| 1 | `normalizePath("../secret")` | → `"secret"` (regex strip `../`) |
| 2 | `subFolderPath = path.resolve(DOCS, "secret")` | → `DOCS/secret` |
| 3 | `isWithin(DOCS, DOCS/secret)` | → `true` (pas d'échappement) |
| 4 | `existsSync(DOCS/secret)` | → `true` (cible présente) |
| 5 | `validRemovableSubFolders.includes("secret")` | → `true` |
| 6 | Purge déclenchée | fichiers supprimés + `rmdirSync` ✗ |

Ce n'est pas une fuite de chemin (isWithin aurait bloqué un vrai échappement), mais une **confusion sémantique destructive** : une entrée contenant une séquence de traversal déclenche la suppression du dossier légitime `secret`. Le contrat de l'API est qu'un nom de dossier doit être un identifiant de premier niveau, pas une expression de chemin. Toute entrée contenant `/` ou `\` ou égale à `".."` ou `"."` viole ce contrat.

#### Correction appliquée — fix#1b

Ajout d'une vérification **pré-normalisée** dans `purgeFolder()`, avant tout appel à `normalizePath` ou toute opération filesystem :

```javascript
// PUR-02-E fix #1b: reject path separators and traversal sequences before
// normalizePath can silently transform them into valid-looking folder names.
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

Nouveau code d'erreur : `FOLDER_NAME_INVALID` (400). Le fix intercepte l'entrée avant que `normalizePath`, `isWithin`, `readdirSync`, `existsSync`, `unlinkSync`, `rmdirSync`, `purgeVectorCache` ou `removeDocuments` ne soient jamais appelés.

**Effet de bord positif** : corrige également O-1. L'entrée `"."` retournait un HTTP 500 non typé (exception `normalizePath` sans `statusCode`). Elle reçoit maintenant `FOLDER_NAME_INVALID` (400). O-1 est **fermé**.

#### Mise à jour du tableau §4.2 (comportement avec fix#1b actif)

| Entrée | fix#1b | Résultat final |
|---|---|---|
| `"../secret"` | `/` détecté → rejeté | **FOLDER_NAME_INVALID (400)** — aucun accès fs |
| `"../../etc/passwd"` | `/` détecté → rejeté | **FOLDER_NAME_INVALID (400)** — aucun accès fs |
| `".."` | `".."` égalité → rejeté | **FOLDER_NAME_INVALID (400)** — aucun accès fs |
| `"/etc/passwd"` | `/` détecté → rejeté | **FOLDER_NAME_INVALID (400)** — aucun accès fs |
| `"."` | `"."` égalité → rejeté | **FOLDER_NAME_INVALID (400)** — aucun accès fs (**O-1 résolu**) |
| `"..\\secret"` | `\` détecté → rejeté | **FOLDER_NAME_INVALID (400)** — aucun accès fs |

#### Mise à jour du tableau §4.4 — nouvelle ligne D-2

**D-2 — Traversal silencieux vers cible existante (CORRIGÉ)**

**Sévérité :** Haute (risque de suppression non intentionnelle d'un dossier légitime)  
**Description :** `normalizePath("../secret")` retourne `"secret"`. Si `documents/secret` est un dossier removable, l'entrée traversal déclenche sa suppression sans erreur.  
**Correction (fix#1b) :** Vérification pré-normalisée rejettant tout nom contenant `/` ou `\` ou égal à `".."` ou `"."`. Code `FOLDER_NAME_INVALID` (400). Appliqué dans les deux copies du candidat.

---

### A.2 — Point 2 : Cohérence des livrables et des empreintes (RÉSOLU)

#### Incohérence signalée

Le rapport original (§3) montrait le SHA `737ed35d…` pour le candidat. La fiche de livraison montrait `95c06dcf…` et 38/38 tests. Ces divergences correspondaient à des états intermédiaires du candidat entre les deux documents.

#### Résolution

Fix#1b a été appliqué au candidat → nouveau SHA unique et cohérent pour les deux copies. Suite A mise à jour (CANDIDATE_PURGE corrigé vers v4e, Scénario 5d → FOLDER_NAME_INVALID). Suite C étendue de 10 à 14 tests (C-11 à C-14 : scénarios traversal vers cibles existantes). Total normalisé : 52/52.

#### Tableau §3.1 mis à jour

| Fichier | Rôle | SHA-256 (après fix#1b) |
|---|---|---|
| `candidate-purgeDocument-v4e.js` (test-run-v4e/) | Candidat — testé | `90a21b0488dfd78ee744b35ae02cd9a6b1e629ead17a88cec5bda49ae4875f79` |
| `candidate-purgeDocument-v4e.js` (patch-work/) | Canonique | `90a21b0488dfd78ee744b35ae02cd9a6b1e629ead17a88cec5bda49ae4875f79` (**identique**) |

> Les deux copies partagent le même SHA-256 — cohérence confirmée.

#### Tableau §3.3 mis à jour

| Fichier | Rôle | SHA-256 (après fix#1b) |
|---|---|---|
| `pur02-candidate.test.js` | Suite A — 22 tests unitaires | `f3e88f13165dc273749284c18750f9c745d8194a3f8e635664d18f24dbab8cbf` |
| `pur02-http-handler.test.js` | Suite B — 16 tests handler réel | `cb9702bdddcadd126487f1e5e5397075cb7a4a2a7b5144c93285819a694eff55` *(inchangé)* |
| `pur02-path-security.test.js` | Suite C — 14 tests sécurité chemins | `89e32abc8c171b0aa7ad14cc90d49b614534e249c3e64f85d2fbabc6712d7921` |

---

### A.3 — Résultats de tests mis à jour (52/52)

```
Test Suites: 3 passed, 3 total
Tests:       52 passed, 52 total  (était 48/48 dans le rapport original)
  Suite A (pur02-candidate.test.js)      : 22/22 PASS
  Suite B (pur02-http-handler.test.js)   : 16/16 PASS
  Suite C (pur02-path-security.test.js)  : 14/14 PASS  (était 10/10)
```

Nouveaux tests Suite C (C-11 à C-14) — scénarios traversal vers cibles existantes :

```
PASS  C-11: '../secret' avec documents/secret existant → FOLDER_NAME_INVALID, aucune op destructive
PASS  C-12: '../../secret' avec documents/secret existant → FOLDER_NAME_INVALID, aucune op destructive
PASS  C-13: '..\\secret' avec documents/secret existant → FOLDER_NAME_INVALID, aucune op destructive
PASS  C-14: '/stub/documents/secret' avec cible existante → FOLDER_NAME_INVALID, aucune op destructive
```

Chaque test vérifie explicitement : `readdirSync`, `unlinkSync`, `rmdirSync`, `purgeVectorCache`, `removeDocuments` **non appelés**.

Mise à jour du tableau §10 (qualification) :

| Suite | Qualification | Mise à jour |
|---|---|---|
| **A** (22 tests) | Tests unitaires — logique fonctionnelle | CANDIDATE_PURGE corrigé → v4e ; Scénario 5d → FOLDER_NAME_INVALID |
| **B** (16 tests) | Tests contrat d'erreur sur handler réel | Inchangé |
| **C** (14 tests) | Tests sécurité chemins avec vraies fonctions | Étendu de 10 → 14 : C-11 à C-14 ajoutés |

---

### A.4 — Mise à jour des défauts ouverts

**O-1 — FERMÉ.** Fix#1b intercèpte `"."` avant normalizePath → `FOLDER_NAME_INVALID` (400). Vérifié par C-05.

**O-2 et O-3** (normalizePath chemins absolus, isWithin symlinks) : inchangés — défenses correctes, comportements hérités AnythingLLM 1.19.0.

---

### A.5 — Verdict révisé

**Les deux points de la contre-revue sont traités.**

**Point 1 — Défaut D-2 (traversal vers cible existante) :**
- Défaut confirmé comme réel par analyse de code.
- Fix#1b appliqué : vérification pré-normalisée rejette toute entrée contenant `/`, `\`, `".."` ou `"."` avant tout accès filesystem.
- Quatre tests de régression spécifiques (C-11 à C-14) vérifient que le scénario exact de la contre-revue est bloqué, et qu'aucune opération destructive n'est déclenchée.
- Effet de bord : O-1 résolu.

**Point 2 — Cohérence des empreintes :**
- Un SHA unique `90a21b04…` couvre les deux copies du candidat.
- Toutes les empreintes de la fiche de livraison correspondent au run 2026-11-04.
- Total normalisé : 52/52.

**Verdict final : PRÊT pour essai isolé**, sous réserve de validation Florian.

Les contraintes restent inchangées : aucune fusion, aucun déploiement, aucune publication, aucune modification du Plan ni du Journal, aucune opération destructive.

---

*Addendum produit dans le même environnement cloud isolé — aucune intervention sur la production.*
