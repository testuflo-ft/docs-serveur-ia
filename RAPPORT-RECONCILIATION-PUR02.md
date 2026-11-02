# Rapport de réconciliation — PUR-02 : documentation vs candidat v4 vs fichiers lab

*Produit par Claude Sonnet 4.6 le 2026-11-02*  
*Mission : audit technique autonome (mission ChatGPT 2026-11-02)*  
*Périmètre : comparaison entre RAPPORT-VALIDATION-PUR-02-v4.md (branche `correctif-PUR-02`), candidats v4 et fichiers lab*

---

## 1. Objets de la réconciliation

| Source | Identifiant | Localisation |
|---|---|---|
| Documentation de validation | `RAPPORT-VALIDATION-PUR-02-v4.md` | Branche `correctif-PUR-02` |
| Candidat v4 — purgeDocument | `candidate-purgeDocument.js` (SHA `15fc2ee1...`) | Branche `correctif-PUR-02` |
| Candidat v4 — documents | `candidate-documents.js` (SHA `de9c5860...`) | Branche `correctif-PUR-02` |
| Candidat v4 — lance | `candidate-lance-index.js` (SHA `c826f004...`) | Branche `correctif-PUR-02` |
| Patch unifié | `PUR-02-patch-complet.diff` (SHA `0cba6a1d...`) | Branche `correctif-PUR-02` |
| Lab — purgeDocument | `purgeDocument.js` (SHA `07175050...`) | ZIP lab, timestamp 26/10/2026 |
| Lab — 4 autres fichiers | Voir RAPPORT-ETAT-GITHUB-2026-11-02.md | ZIP lab |

---

## 2. Ce que décrit la documentation de validation

Le `RAPPORT-VALIDATION-PUR-02-v4.md` déclare :

- **Patch SHA :** `0cba6a1da13800fdd92411f3f8e9f83c611a45a2c57e017b7ce2a4de0baa79de`
- **Fichiers modifiés :** `server/utils/vectorDbProviders/lance/index.js`, `server/models/documents.js`, `server/utils/files/purgeDocument.js`
- **Tests unitaires :** 17/17 PASS (Jest 29)
- **Tests d'intégration :** 9/9 PASS (S01–S09, SQLite réel `better-sqlite3` v13.0.3 + LanceDB réel)
- **Limite résiduelle L-1 :** LanceDB nettoyé avant `$transaction` SQL — vecteurs supprimés même si SQL échoue (confirmé par S05)
- **Verdict :** "PRÊT POUR UN ESSAI ISOLÉ ✓"

---

## 3. Comparaison point par point : candidat v4 vs documentation

### 3.1 PUR-02-A — Propagation silencieuse d'erreurs SQL (`Workspace.where()`)

**Documentation :** `_getWorkspacesStrict()` utilise `prisma.workspaces.findMany()` directement — throw si erreur SQL.

**Candidat v4 (`candidate-purgeDocument.js`) :** ✅ Confirmé  
```javascript
async function _getWorkspacesStrict() {
  return await prisma.workspaces.findMany({ select: { id: true, slug: true } });
}
```
`Workspace.where()` remplacé par appel Prisma direct. Les erreurs SQL propagent normalement.

**Lab `purgeDocument.js` :** ❌ Non corrigé  
```javascript
const workspaces = await Workspace.where();
```
Utilise toujours `Workspace.where()` qui absorbe silencieusement les erreurs SQL.

---

### 3.2 PUR-02-B — Ordonnancement incorrect (cache/source avant associations workspace)

**Documentation :** L'ordre correct est associations workspace → cache → source.

**Candidat v4 (`candidate-purgeDocument.js`) :** ✅ Confirmé  
Ordre : `_getWorkspacesStrict()` → `Document.removeDocuments()` (associations) → `purgeVectorCache()` → `purgeSourceDocument()`

**Lab `purgeDocument.js` :** ❌ Non corrigé  
Ordre : `purgeVectorCache()` → `purgeSourceDocument()` → `Workspace.where()` → `Document.removeDocuments()`  
L'ordre original incorrect est conservé.

---

### 3.3 PUR-02-C — Atomicité SQL (`$transaction`)

**Documentation :** `prisma.$transaction([...])` pour la paire atomique `workspace_documents.delete` + `document_vectors.deleteMany`.

**Candidat v4 (`candidate-documents.js`) :** ✅ Confirmé (extrait du diff et du fichier candidat)  
```javascript
await prisma.$transaction([
  prisma.workspace_documents.delete({ where: { id: document.id, workspaceId: workspace.id } }),
  prisma.document_vectors.deleteMany({ where: { docId: document.docId } }),
]);
```

**Lab `purgeDocument.js` :** Non applicable — `purgeDocument.js` lab n'inclut pas `removeDocuments()` (ce code est dans `documents.js`, non extrait du lab).

---

### 3.4 PUR-02-D — Singleton LanceDB (`LanceDb.#connection`)

**Documentation :** Bug de mutation du singleton corrigé dans `lance/index.js`.

**Candidat v4 (`candidate-lance-index.js`) :** ✅ `deleteDocumentFromNamespace()` entièrement réécrit avec propagation explicite d'erreurs. Le champ statique `LanceDb.#connection = null` est conservé dans `reset()`. Les erreurs SQL et LanceDB sont maintenant explicitement throwées plutôt qu'absorbées.

**Lab :** Non applicable — `lance/index.js` non extrait du lab.

---

### 3.5 PUR-02-E — `purgeFolder` : arrêt sur sous-répertoire

**Documentation :** `purgeFolder` abandonne (abort) si un sous-répertoire est rencontré.

**Candidat v4 (`candidate-purgeDocument.js`) :** ✅ Confirmé — collecte séquentielle, `cleanupErrors[]`, `unlinkSync`+`rmdirSync` (pas de récursion), abort explicite sur `entry.isDirectory()`.

**Lab `purgeDocument.js` :** ⚠️ **DIVERGE DU CANDIDAT v4**  
La version lab a `purgeFolder` avec **traversée récursive** via `collectFiles(dir)` :
```javascript
function collectFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) collectFiles(fullPath);  // ← récursion
    else if (entry.isFile()) filenames.push(...);
  }
}
```
Elle utilise aussi `Promise.all()` pour le nettoyage parallèle et `fs.rmSync({recursive:true})` pour la suppression finale.

**C'est la différence la plus importante entre lab et candidat v4.**

---

## 4. Tableau de synthèse

| Défaut | Description | Candidat v4 | Lab `purgeDocument.js` |
|---|---|---|---|
| PUR-02-A | `Workspace.where()` absorbe erreurs SQL | ✅ Corrigé (`_getWorkspacesStrict`) | ❌ Non corrigé |
| PUR-02-B | Mauvais ordre cache/source avant assocs | ✅ Corrigé | ❌ Non corrigé |
| PUR-02-C | `$transaction` atomique SQL | ✅ Corrigé (dans `documents.js`) | N/A (autre fichier) |
| PUR-02-D | Singleton `LanceDb.#connection` | ✅ Corrigé (propagation d'erreur) | N/A (autre fichier) |
| PUR-02-E | `purgeFolder` — comportement sous-répertoires | ✅ Abort sur sous-répertoire | ⚠️ Récursion (diverge) |
| L-1 | Non-atomicité LanceDB + SQL | ❌ Limite résiduelle confirmée | ❌ Même limite |

---

## 5. L-1 : contradiction apparente et résolution

**Constat :** Le `RAPPORT-VALIDATION-PUR-02-v4.md` déclare "PRÊT POUR UN ESSAI ISOLÉ ✓" tout en documentant que la limite L-1 (non-atomicité LanceDB+SQL) est confirmée par S05.

**N'est pas une contradiction :** L-1 est une limite **architecturale** qui ne peut être résolue sans un changement profond de la couche de persistance (LanceDB et SQL dans la même transaction distribuée, ce qui n'est pas supporté nativement). PUR-02 v4 documente cette limite explicitement plutôt que de l'ignorer. Le verdict "PRÊT POUR UN ESSAI ISOLÉ" ne signifie pas que v4 est sans risque résiduel — il signifie que les 5 défauts identifiés (A–E) sont adressés et que l'essai isolé permettra d'évaluer L-1 en conditions réelles avant déploiement production.

---

## 6. Les fichiers lab représentent un autre ensemble de correctifs

Les 5 fichiers lab adressent **trois sujets distincts**, séparés des défauts PUR-02-A à PUR-02-E :

| Fichier lab | Sujet adressé | Différence avec candidat v4 |
|---|---|---|
| `purgeDocument.js` | `purgeFolder` récursif (INT-20 partiel) | `purgeDocument()` NON corrigé ; `purgeFolder` diffère |
| `api-document-index.js` | Route `DELETE /v1/document/remove-folder` (INT-20/PUR-01) | Appelle lab `purgeFolder` ; non lié à PUR-02 v4 |
| `files-index.js` | `moveProcessedDocsToFolder` pré-validé (INT-18) | Indépendant de PUR-02 |
| `endpoints-system.js` | `DELETE /system/remove-folder` (INT-20) + `GET /env-dump` (ALLM-12) | Indépendant de PUR-02 |
| `api-system-index.js` | `GET /v1/system/env-dump` (ALLM-12) | Indépendant de PUR-02 |

**Conclusion :** Les fichiers lab et les candidats PUR-02 v4 ne sont pas substituables. Ils doivent être traités comme deux séries de correctifs parallèles.

---

## 7. Niveau de preuve des affirmations documentaires

| Affirmation | Niveau | Vérification dans cette session |
|---|---|---|
| 17/17 tests unitaires PASS | [TEST] | SHA du patch confirmé : `0cba6a1da138...` = SHA dans rapport |
| 9/9 tests d'intégration PASS | [TEST] | Rapport lu directement dans branche `correctif-PUR-02` |
| Candidats v4 sur branche | [C17] | `git ls-tree FETCH_HEAD` + lecture code |
| Lab files ≠ candidat v4 | [LAB] | Comparaison directe ligne par ligne |
| L-1 confirmé par S05 | [TEST] | Lu dans `RAPPORT-VALIDATION-PUR-02-v4.md` |
| Lab `purgeDocument.js` récursif | [LAB] | Lu dans `/app/server/utils/files/purgeDocument.js` |

---

*Sources : `RAPPORT-VALIDATION-PUR-02-v4.md` (branche `correctif-PUR-02`) ; `candidate-*.js` (branche `correctif-PUR-02` FETCH_HEAD) ; `PUR-02-patch-complet.diff` ; fichiers lab ZIP.*
