# PUR-02 — Livraison candidat correctif (v4)
**Date** : 2026-10-31  
**Version AnythingLLM cible** : v1.19.0  
**Statut** : CANDIDAT v4 — non déployé, à valider avant intégration en production  
**Révision** : Troisième revue ChatGPT appliquée et re-testée (17 / 17 PASS)

---

## 1. Fichiers livrés

| Fichier candidat | Fichier de référence (v1.19.0) | Rôle |
|---|---|---|
| `candidate-lance-index.js` | `server/utils/vectorDbProviders/lance/index.js` | Fournisseur LanceDB |
| `candidate-documents.js` | `server/models/documents.js` | Modèle Document |
| `candidate-purgeDocument.js` | `server/utils/files/purgeDocument.js` | Utilitaires de purge |
| `pur02-candidate.test.js` | *(nouveau)* `server/__tests__/pur02-candidate.test.js` | Suite de tests isolés |

---

## 2. Empreintes SHA-256 (v4 — après troisième revue ChatGPT)

```
c826f004f1761c20b1e06300fc0f8d63416e03abe523b7e06a0259ec23180e44  candidate-lance-index.js
de9c586043cbf63f70c4070cc18bc2f0871bc3a8b1d8caa79f32248fba8152eb  candidate-documents.js
15fc2ee1ae93b212dfe0656778fc48e76c3838a5b1468ea11def69317327ce59  candidate-purgeDocument.js
1e516960785ef346087f1551471f39d48d6c4c96a929874db8af0b6577df17a6  pur02-candidate.test.js
```

Références v1.19.0 (copies de laboratoire PUR-02-lab-20261029-191346, SHA vérifiés identiques à l'officiel) :
```
5fb3092729447ba8501d1fc8d6f7072caebd390d1692e3dbe74dfbe365271470  ref-lance-index.js
dde27671eb3f6379ee7e4bb5b2f693800b17316837f1317aa7bd6c4165a2076c  ref-documents.js
f6dda7152e476a6078533a8c06f458204d36c2abd550b08bbf69c8ccf232727a  ref-purgeDocument.js
```

---

## 3. Vérifications effectuées

| Contrôle | Résultat |
|---|---|
| `node --check` sur les 3 candidats | ✓ Aucune erreur de syntaxe |
| `node --check` sur le fichier de tests | ✓ |
| Jest 29 — 17 scénarios (v4) | **17 / 17 PASS** |

Sortie Jest complète (v4) :
```
PASS server/__tests__/pur02-candidate.test.js
  ✓ Scenario 1 — absent document silently skipped (6 ms)
  ✓ Scenario 2 — SQL read error propagates (77 ms)
  ✓ Scenario 3 — LanceDB error aborts; SQL record preserved (4 ms)
  ✓ Scenario 4 — SQL cleanup error propagates with orphan warning (2 ms)
  ✓ Scenario 5 — custom-documents folder rejected (2 ms)
  ✓ Scenario 6 — nested subdirectory aborts operation (2 ms)
  ✓ Scenario 7 — symbolic link entry aborts operation (1 ms)
  ✓ Scenario 8 — cleanup failure preserves source file (1 ms)
  ✓ Scenario 9 — namespace absent → false, no LanceDB or SQL call (2 ms)
  ✓ Scenario 10 — no vectors found → false, no table.delete (3 ms)
  ✓ Scenario 11 — SQL read error → throws with clear message (1 ms)
  ✓ Scenario 12 — table.delete() error → throws with clear message (1 ms)
  ✓ Scenario 13 — removeDocuments failure prevents purgeVectorCache call (2 ms)
  ✓ Scenario 14 — prisma.workspaces.findMany failure in purgeDocument (1 ms)
  ✓ Scenario 15 — prisma.workspaces.findMany failure in purgeFolder (2 ms)
  ✓ Scenario 16 — purgeVectorCache failure throws and prevents folder deletion (1 ms)
  ✓ Scenario 17 — normalizePath canonical path used for all operations (3 ms)
Tests: 17 passed, 17 total  — Time: 0.76 s
```

---

## 4. Défauts corrigés

### 4.1 `candidate-lance-index.js` — `deleteDocumentFromNamespace()`
- **Défaut** : utilisait `DocumentVectors.where()` qui absorbe silencieusement les erreurs SQL et retourne `[]`, causant l'absence de suppression LanceDB sans aucun signal d'erreur.
- **Correctif** : requête Prisma directe (`prisma.document_vectors.findMany`). Erreur SQL → exception propagée. Erreur LanceDB → exception propagée. Retour `false` (au lieu de `undefined`) quand namespace absent ou aucun vecteur.

### 4.2 `candidate-documents.js` — `removeDocuments()` + `_getStrict()`
- **Défaut** : `get()` absorbe les erreurs SQL et retourne `null`, traité comme "document absent".
- **Correctif** : nouvelle méthode `_getStrict()` sans try/catch. `removeDocuments()` utilise `_getStrict()` ; si LanceDB échoue → abort avant SQL (enregistrement préservé pour retry) ; les deux suppressions SQL regroupées dans `prisma.$transaction([...])` pour atomicité SQL-SQL ; si la transaction échoue après LanceDB → log explicite "orphaned rows" + propagation.

### 4.3 `candidate-purgeDocument.js` — `purgeDocument()` et `purgeFolder()`
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

---

## 6. Limites résiduelles connues

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

### L-4 — Tests : isolation par eval, pas d'intégration réelle
Les tests utilisent `Module.wrap` + `eval` pour injecter des stubs. La couverture est comportementale ; elle ne couvre pas la sérialisation SQL réelle, le comportement de `table.delete()` avec un filtre malformé, ni l'interaction avec un vrai namespace LanceDB.

---

## 7. Procédure de déploiement recommandée (hors périmètre de cette livraison)

1. Valider les diffs manuellement (fichiers `.diff` joints)
2. Copier les 3 candidats sur les copies de laboratoire déjà vérifiées
3. Recalculer les SHA-256 après copie et comparer à la table §2
4. Tester en environnement staging (conteneur isolé, DB de test) avant production
5. Ne pas modifier le conteneur AnythingLLM de production sans snapshot préalable
6. Conserver le tag de rollback `mintplexlabs/anythingllm:rollback-20261025-091540`
