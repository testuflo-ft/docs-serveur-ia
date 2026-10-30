# PUR-02 — Livraison candidat correctif (v2)
**Date** : 2026-10-30  
**Version AnythingLLM cible** : v1.19.0  
**Statut** : CANDIDAT v2 — non déployé, à valider avant intégration en production  
**Révision** : Corrections post-revue ChatGPT appliquées et re-testées (12 / 12 PASS)

---

## 1. Fichiers livrés

| Fichier candidat | Fichier de référence (v1.19.0) | Rôle |
|---|---|---|
| `candidate-lance-index.js` | `server/utils/vectorDbProviders/lance/index.js` | Fournisseur LanceDB |
| `candidate-documents.js` | `server/models/documents.js` | Modèle Document |
| `candidate-purgeDocument.js` | `server/utils/files/purgeDocument.js` | Utilitaires de purge |
| `pur02-candidate.test.js` | *(nouveau)* `server/__tests__/pur02-candidate.test.js` | Suite de tests isolés |

---

## 2. Empreintes SHA-256 (v2 — après corrections post-revue)

```
c826f004f1761c20b1e06300fc0f8d63416e03abe523b7e06a0259ec23180e44  candidate-lance-index.js
de9c586043cbf63f70c4070cc18bc2f0871bc3a8b1d8caa79f32248fba8152eb  candidate-documents.js
c1d8570c9d82f71606399ff139c2fc7b525c7934b58d8fd292594d4231097f7b  candidate-purgeDocument.js
61f1d83c374ee72a62a7b5441bce46bfa9b61e29b409589d7594b821dbfe6bdc  pur02-candidate.test.js
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
| Jest 29 — 12 scénarios (v2) | **12 / 12 PASS** |

Sortie Jest complète (v2) :
```
PASS server/__tests__/pur02-candidate.test.js
  ✓ Scenario 1 — absent document silently skipped (7 ms)
  ✓ Scenario 2 — SQL read error propagates (87 ms)
  ✓ Scenario 3 — LanceDB error aborts; SQL record preserved (5 ms)
  ✓ Scenario 4 — SQL cleanup error propagates with orphan warning (3 ms)
  ✓ Scenario 5 — custom-documents folder rejected (3 ms)
  ✓ Scenario 6 — nested subdirectory aborts operation (3 ms)
  ✓ Scenario 7 — symbolic link entry aborts operation (1 ms)
  ✓ Scenario 8 — cleanup failure preserves source file (2 ms)
  ✓ Scenario 9 — namespace absent → false, no LanceDB or SQL call (4 ms)
  ✓ Scenario 10 — no vectors found → false, no table.delete (4 ms)
  ✓ Scenario 11 — SQL read error → throws with clear message (2 ms)
  ✓ Scenario 12 — table.delete() error → throws with clear message (1 ms)
Tests: 12 passed, 12 total  — Time: 1.065 s
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

## 5. Corrections post-revue ChatGPT (v1 → v2)

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
