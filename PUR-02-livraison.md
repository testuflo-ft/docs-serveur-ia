# PUR-02 — Livraison candidat correctif
**Date** : 2026-10-30  
**Version AnythingLLM cible** : v1.19.0  
**Statut** : CANDIDAT — non déployé, à valider avant intégration en production

---

## 1. Fichiers livrés

| Fichier candidat | Fichier de référence (v1.19.0) | Rôle |
|---|---|---|
| `candidate-lance-index.js` | `server/utils/vectorDbProviders/lance/index.js` | Fournisseur LanceDB |
| `candidate-documents.js` | `server/models/documents.js` | Modèle Document |
| `candidate-purgeDocument.js` | `server/utils/files/purgeDocument.js` | Utilitaires de purge |
| `pur02-candidate.test.js` | *(nouveau)* `server/__tests__/pur02-candidate.test.js` | Suite de tests isolés |

---

## 2. Empreintes SHA-256

```
c826f004f1761c20b1e06300fc0f8d63416e03abe523b7e06a0259ec23180e44  candidate-lance-index.js
97e42e07deb61a04bf46a4fd38cf3014e807ecebadd78cddcaed1a5ac3804e7a  candidate-documents.js
80e6934c0ab032bd556fa272900becd01d92b59bb762cc5a3ca1cdb7f0e70506  candidate-purgeDocument.js
a3b9e1aec3633bb562dcf1194ad42d697d0efe067ec86868ddd27015a6008859  pur02-candidate.test.js
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
| Jest 29 — 8 scénarios | **8 / 8 PASS** |

Sortie Jest complète :
```
PASS server/__tests__/pur02-candidate.test.js
  ✓ Scenario 1 — absent document silently skipped (4 ms)
  ✓ Scenario 2 — SQL read error propagates (57 ms)
  ✓ Scenario 3 — LanceDB error aborts; SQL record preserved (5 ms)
  ✓ Scenario 4 — SQL cleanup error propagates with orphan warning (2 ms)
  ✓ Scenario 5 — custom-documents folder rejected (2 ms)
  ✓ Scenario 6 — nested subdirectory aborts operation (3 ms)
  ✓ Scenario 7 — symbolic link entry aborts operation (1 ms)
  ✓ Scenario 8 — cleanup failure preserves source file (1 ms)
Tests: 8 passed, 8 total  — Time: 0.318 s
```

---

## 4. Défauts corrigés (rappel)

### 4.1 `candidate-lance-index.js` — `deleteDocumentFromNamespace()`
- **Défaut** : utilisait `DocumentVectors.where()` qui absorbe silencieusement les erreurs SQL et retourne `[]`, causant l'absence de suppression LanceDB sans aucun signal d'erreur.
- **Correctif** : requête Prisma directe (`prisma.document_vectors.findMany`). Erreur SQL → exception propagée. Erreur LanceDB → exception propagée. Retour `false` (au lieu de `undefined`) quand namespace absent ou aucun vecteur.

### 4.2 `candidate-documents.js` — `removeDocuments()` + `_getStrict()`
- **Défaut** : `get()` absorbe les erreurs SQL et retourne `null`, traité comme "document absent" — la suppression LanceDB et le nettoyage SQL étaient silencieusement ignorés.
- **Correctif** : nouvelle méthode `_getStrict()` sans try/catch. `removeDocuments()` utilise `_getStrict()` ; encapsule séparément LanceDB et SQL ; si LanceDB échoue, abort avant SQL (enregistrement préservé pour retry) ; si SQL échoue après LanceDB, log explicite "orphaned rows, manual cleanup required" puis propagation.

### 4.3 `candidate-purgeDocument.js` — `purgeDocument()` et `purgeFolder()`
- **Défaut `purgeDocument`** : fichier source supprimé AVANT le nettoyage des associations (SQL + LanceDB). En cas d'échec, source perdue, opération non reproductible.
- **Correctif** : ordre inversé — associations en premier, source supprimée seulement après succès complet.
- **Défaut `purgeFolder`** : `Promise.all()` avec `.then(() => resolve(true))` absorbait les rejets ; `rmSync({recursive:true})` appelé même en cas d'échec partiel ; pas de vérification des liens symboliques ni des sous-répertoires.
- **Correctif** : vérification `withFileTypes` de chaque entrée (sous-répertoire ou symlink → abort avec log) ; lstat sur les dossiers du niveau racine (symlinks exclus) ; séquence `await` individuelle avec `cleanupErrors[]` ; si erreurs → dossier NON supprimé ; suppression par `unlinkSync` fichier par fichier puis `rmdirSync` (non-récursif).

---

## 5. Limites résiduelles connues

### L-1 — Non-atomicité Prisma / LanceDB (non résolu, documenté)
Prisma (SQLite) et LanceDB n'ont pas de transaction partagée. Deux scénarios de défaillance partielle subsistent après ce correctif :

| Scénario | État résultant | Détection |
|---|---|---|
| SQL `findMany` OK → LanceDB `table.delete()` échoue | document_vectors rows présents, vecteurs LanceDB **toujours présents** | Exception propagée + log `[LanceDb.deleteDocumentFromNamespace] LanceDB deletion failed` |
| LanceDB OK → SQL `deleteMany` échoue | Vecteurs LanceDB **supprimés**, document_vectors rows **orphelines** | Exception propagée + log `[removeDocuments] SQL cleanup failed … document_vectors rows … may be orphaned` |

**Remédiation manuelle pour le scénario 2** : identifier les `docId` signalés dans les logs, puis exécuter :
```sql
DELETE FROM document_vectors WHERE docId = '<docId>';
```

### L-2 — `purgeFolder` : opération non atomique par fichier
Si `purgeVectorCache()` réussit pour le fichier N et échoue pour N+1, les caches des fichiers précédents sont déjà supprimés mais le dossier est préservé. Les fichiers dont le cache est manquant peuvent être ré-indexés ; le dossier reste intact pour retry.

### L-3 — `purgeDocument` : workspace partiellement nettoyé
Si `removeDocuments()` lève une exception à mi-parcours (workspace W_n après avoir nettoyé W_1…W_{n-1}), la source est préservée mais certains workspaces ont déjà eu leurs associations supprimées. Un retry repassera sur tous les workspaces ; `removeDocuments()` continue silencieusement si `document` est absent (`if (!document) continue`), donc les workspaces déjà nettoyés seront traités sans effet secondaire.

### L-4 — Tests : isolation par eval, pas d'intégration réelle
Les tests utilisent `Module.wrap` + `eval` pour injecter les stubs sans vraie résolution de modules. La couverture est comportementale (flux de contrôle, propagation d'erreurs) ; elle ne couvre pas :
- La sérialisation SQL réelle de Prisma
- Le comportement de `table.delete()` avec un filtre malformé
- L'interaction avec un vrai namespace LanceDB

---

## 6. Procédure de déploiement recommandée (hors périmètre de cette livraison)

1. Valider les diffs manuellement (fichiers `.diff` joints)
2. Copier les 3 candidats sur les copies de laboratoire déjà vérifiées
3. Recalculer les SHA-256 après copie et comparer à la table §2
4. Tester en environnement staging (conteneur isolé, DB de test) avant production
5. Ne pas modifier le conteneur AnythingLLM de production sans snapshot préalable
6. Conserver le tag de rollback `mintplexlabs/anythingllm:rollback-20261025-091540`
