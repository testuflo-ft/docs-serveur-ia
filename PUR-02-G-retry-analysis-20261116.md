# PUR-02-G — Comportement PUR-02-E sous échec SQL post-LanceDB : analyse du retry

**Date :** 16 novembre 2026  
**Nature :** Lecture seule — analyse de comportement  
**Périmètre :** `removeDocuments()`, `deleteDocumentFromNamespace()`, `purgeDocument()`, `purgeFolder()`  
**Sources :** `candidate-documents.js`, `candidate-lance-index-v4f.js`, `candidate-purgeDocument-v4e.js`  
**Contrainte :** Lecture seule. Aucun patch, test, modification, publication.

---

## 0. Scénario analysé

```
Appel initial :
  1. findMany({where:{docId}})       → OK — retourne [vec1, vec2, vec3]
  2. table.delete('id IN (...)')      → OK — LanceDB supprime vec1, vec2, vec3
  3. prisma.$transaction([             → ÉCHOUE — rollback automatique
       workspace_documents.delete,
       document_vectors.deleteMany
     ])

État après l'échec :
  LanceDB namespace          → vec1, vec2, vec3 ABSENTS (supprimés à l'étape 2)
  SQL workspace_documents    → ligne PRÉSENTE (rollback)
  SQL document_vectors       → lignes PRÉSENTES pour docId (rollback)
  Fichier source             → INTACT (purgeSourceDocument non atteint)

Retry :
  Nouvel appel de purgeDocument(filename)
```

---

## 1. Le retry retrouve-t-il les mêmes vectorIds dans SQL ?

**Oui.** La transaction Prisma au Step 3 de `removeDocuments()` (lignes 333–340 de `candidate-documents.js`) regroupe `workspace_documents.delete` et `document_vectors.deleteMany` en une seule opération atomique. Un échec annule les deux. Après l'échec initial, les lignes `document_vectors` sont donc intactes dans SQL.

```javascript
// candidate-documents.js, lignes 332–340
try {
  await prisma.$transaction([
    prisma.workspace_documents.delete({
      where: { id: document.id, workspaceId: workspace.id },
    }),
    prisma.document_vectors.deleteMany({
      where: { docId: document.docId },
    }),
  ]);
}
```

Au retry, `findMany({where:{docId}})` (lignes 325–330 de `candidate-lance-index-v4f.js`) retrouve exactement les mêmes vectorIds. Rien n'a modifié ces lignes SQL entre les deux appels.

---

## 2. Que retourne `deleteDocumentFromNamespace()` quand le namespace existe mais que les vectorIds n'y sont plus ?

**Retourne `true` sans exception — chemin L-03.**

Chemin exact (lignes 311–357 de `candidate-lance-index-v4f.js`) :

```
namespaceExists()       → true (namespace toujours présent)
findMany({docId})       → [vec1, vec2, vec3] (toujours en SQL)
vectorIds.length        → 3 → pas de retour anticipé
table.delete(          → appel effectué sur une table ouverte
  'id IN (vec1, vec2, vec3)'
)                       → aucune erreur (SQL predicate delete idempotent :
                          supprimer des IDs inexistants est un no-op)
return true             ← L-03
```

La fonction retourne `true` **que les vecteurs aient réellement été supprimés ou non**. Elle n'inspecte pas le résultat de `table.delete()`. C'est un point clé : L-03 décrit le chemin de code (vectorIds non vides → `table.delete()` appelé → `true`), pas un effet réel constaté en LanceDB.

---

## 3. Le cas namespace absent est-il traité de la même façon ?

**Non — le chemin est différent, mais l'effet sur l'appelant est identique.**

| | Namespace absent (L-01) | Namespace présent, vectors absents (retry L-03) |
|--|--|-|
| `namespaceExists()` | → false → return true **immédiatement** | → true → continue |
| `findMany()` appelé | ❌ Non | ✅ Oui |
| `table.delete()` appelé | ❌ Non | ✅ Oui (no-op) |
| Valeur retournée | `true` | `true` |
| Exception levée | Non | Non |

Dans les deux cas, `removeDocuments()` ne reçoit aucune exception et progresse vers le Step 3 (SQL cleanup via `$transaction`). Les lignes `document_vectors` SQL sont supprimées par `deleteMany({docId})` dans la transaction, **indépendamment du chemin pris dans `deleteDocumentFromNamespace()`**.

Différence pratique notable pour L-01 : `findMany()` n'est pas appelé, donc les vectorIds SQL ne sont pas lus. Cela ne pose pas de problème car c'est le `deleteMany({docId})` du Step 3 qui les supprime — `deleteDocumentFromNamespace()` n'est pas responsable du nettoyage SQL.

---

## 4. Le retry peut-il supprimer les lignes SQL résiduelles ?

**Oui, si la cause de l'échec SQL initial est transitoire.**

Après le retour `true` de `deleteDocumentFromNamespace()` (Step 2 sans exception), `removeDocuments()` atteint le Step 3 :

```javascript
// candidate-documents.js, lignes 332–349
await prisma.$transaction([
  prisma.workspace_documents.delete({
    where: { id: document.id, workspaceId: workspace.id },
  }),
  prisma.document_vectors.deleteMany({
    where: { docId: document.docId },
  }),
]);
```

- `workspace_documents` row : toujours présente → supprimée ✅  
- `document_vectors` rows : toujours présentes → supprimées par `deleteMany({docId})` ✅

Le retry **résout complètement l'état orphelin** si la transaction SQL réussit. Aucune ligne résiduelle ne subsiste.

**Si la cause SQL est permanente :** le retry échouera de nouveau. L'état reste : LanceDB propre + SQL dirty. Le log explicite (ligne 343–347) permet une remédiation manuelle. C'est la limite résiduelle L-1 documentée dans le code.

---

## 5. La source du document reste-t-elle préservée jusqu'à la réussite de toutes les étapes ?

**Oui, garantie architecturale de PUR-02-E.**

Dans `purgeDocument()` (lignes 78–98 de `candidate-purgeDocument-v4e.js`) :

```javascript
// Step 1 — boucle sur les workspaces (peut throw)
for (const workspace of workspaces) {
  await Document.removeDocuments(workspace, [normalized]);
}
// Steps 2 et 3 — seulement si step 1 complète sans exception
await purgeVectorCache(normalized);
await purgeSourceDocument(normalized);
```

Toute exception dans `removeDocuments()` (Steps 1, 2 ou 3 de cette fonction) se propage sans être capturée par `purgeDocument()`. `purgeVectorCache()` et `purgeSourceDocument()` ne sont donc jamais atteints. **Le fichier source est préservé jusqu'à la réussite complète de toutes les suppressions SQL et LanceDB** — c'est l'inversion de comportement centrale de PUR-02 par rapport à l'original 1.19.0.

**Cas du retry partiel multi-workspace :** si l'erreur SQL survient au workspace N (après succès des workspaces 1..N-1), la source est préservée. Au retry, les workspaces 1..N-1 s'exécutent via le chemin `_getStrict()` → `document not found` (déjà supprimé) → `continue` (ligne 304). Le workspace N reprend via le chemin L-03 décrit en §2. Les workspaces N+1..fin s'exécutent normalement.

---

## 6. Comportement distingué par type d'erreur

### Dans `removeDocuments()` (candidate-documents.js, lignes 285–361)

| Étape | Type d'erreur | Comportement | État résultant |
|-------|--------------|--------------|----------------|
| Step 1 — `_getStrict()` | Erreur SQL | throw sqlError | Rien touché. Source préservée. Retry possible. |
| Step 2 — `deleteDocumentFromNamespace()` | Erreur LanceDB (`table.delete` throw) | throw lanceError + log "SQL record preserved for retry" | SQL intact. LanceDB état inconnu. Source préservée. |
| Step 3 — `prisma.$transaction` | Erreur SQL | throw sqlError + log "document_vectors rows may be orphaned" | LanceDB propre. SQL `workspace_documents` + `document_vectors` toujours présents. Source préservée. **(L-1 résiduel)** |

### Dans `purgeDocument()` (candidate-purgeDocument-v4e.js, lignes 70–100)

| Étape | Type d'erreur | Comportement |
|-------|--------------|--------------|
| `_getWorkspacesStrict()` | Erreur SQL | throw → rien nettoyé, source préservée |
| Boucle workspace / `removeDocuments()` | SQL ou LanceDB | throw propagé → purgeVectorCache et purgeSourceDocument **non appelés** → source préservée |
| `purgeVectorCache()` | Erreur filesystem | throw → purgeSourceDocument **non appelé** → source préservée ; SQL et LanceDB déjà propres |
| `purgeSourceDocument()` | Erreur filesystem | throw → SQL et LanceDB propres, cache supprimé, **source non supprimée** (état partiellement propre — remédiation manuelle) |

### Dans `purgeFolder()` (candidate-purgeDocument-v4e.js, lignes 143–322)

| Étape | Type d'erreur | Comportement |
|-------|--------------|--------------|
| `_getWorkspacesStrict()` | Erreur SQL | throw → folder NOT deleted |
| `removeDocuments()` par workspace | Toute erreur | collectée dans `cleanupErrors` ; si non vide : throw avant purgeVectorCache → folder NOT deleted |
| `purgeVectorCache()` par fichier | Erreur filesystem | collectée dans `cleanupErrors` → throw avant unlinkSync → folder NOT deleted |
| `unlinkSync` / `rmdirSync` | Erreur filesystem | throw non capturé → sort de la fonction |

**Garantie `purgeFolder()` :** le dossier n'est jamais supprimé si un cleanup workspace ou cache a échoué. Les erreurs sont collectées plutôt que propagées unitairement pour permettre de continuer les autres workspaces/fichiers avant de décider.

---

## 7. Corrections de formulation L-01 et L-03

Ces corrections s'appliquent à la **Suite L** documentée dans le Livret Technique (§14, « Suite L (5 tests) »).

---

### L-01 — Namespace absent

**Formulation actuelle :**
> L-01 namespace absent → `true`

**Problème :** La formulation courte laisse entendre que le retour `true` signifie "nettoyage complet". Elle cache deux faits importants : (a) `findMany()` n'est pas appelé — les lignes SQL `document_vectors` ne sont pas lues dans `deleteDocumentFromNamespace()` ; (b) ces lignes SQL seront supprimées par `deleteMany` dans le Step 3 de l'appelant `removeDocuments()`, pas dans `deleteDocumentFromNamespace()` elle-même.

**Formulation corrigée :**
> L-01 — namespace absent → `true` immédiatement ; `findMany()` et `table.delete()` non appelés. Les lignes SQL `document_vectors` restent dans la base jusqu'à la transaction SQL de l'appelant (`removeDocuments()` Step 3).

---

### L-03 — Suppression

**Formulation actuelle :**
> L-03 suppression effective → `true`, `table.delete()` appelé

**Problème :** « Suppression effective » implique que des vecteurs ont été supprimés de LanceDB. Ce n'est pas toujours le cas :  
- **Appel normal** : les vecteurs existent → supprimés → `true` ✅ (formulation juste)  
- **Retry après échec SQL** : les vecteurs ont déjà été supprimés lors du premier appel → `table.delete()` est un **no-op idempotent** → aucune erreur → `true`. La formulation "suppression effective" est fausse dans ce cas.

La fonction retourne `true` **que la suppression LanceDB ait réellement eu lieu ou non**. Elle ne vérifie pas si `table.delete()` a effectivement supprimé quelque chose.

**Formulation corrigée :**
> L-03 — vectorIds SQL non vides → `table.delete()` appelé → `true`. Idempotent : pas d'erreur si les vecteurs sont déjà absents de LanceDB (cas de retry après échec SQL partiel). La fonction ne vérifie pas si `table.delete()` a réellement supprimé des entrées.

---

## 8. Synthèse du scénario complet

```
APPEL INITIAL
  removeDocuments(workspace, [filename])
    Step 1 : _getStrict() → document {id, docId, ...} ✅
    Step 2 : deleteDocumentFromNamespace(namespace, docId)
      findMany({docId}) → [vec1, vec2, vec3]        ✅
      table.delete('id IN (vec1,vec2,vec3)')         ✅  ← vecteurs supprimés
      return true                                    ✅
    Step 3 : $transaction([delete, deleteMany])      ❌  ← ÉCHEC
      → rollback : workspace_documents et document_vectors intacts
      → log "[removeDocuments] SQL cleanup failed … document_vectors rows … may be orphaned"
      → throw sqlError
  purgeDocument() reçoit l'exception
  purgeVectorCache() NON appelé                      ✅  ← source préservée
  purgeSourceDocument() NON appelé                   ✅  ← source préservée

ÉTAT INTERMÉDIAIRE
  SQL workspace_documents :  PRÉSENT        ← allow retry
  SQL document_vectors    :  PRÉSENTS [v1,v2,v3] ← allow retry
  LanceDB vec1,vec2,vec3  :  ABSENTS        ← irréversible (non transactionnel)
  Fichier source          :  INTACT

RETRY (purgeDocument appelé de nouveau)
  _getWorkspacesStrict() ✅
  removeDocuments(workspace, [filename])
    Step 1 : _getStrict() → document TROUVÉ  ✅  (workspace_documents toujours là)
    Step 2 : deleteDocumentFromNamespace(namespace, docId)
      namespaceExists() → true               ✅
      findMany({docId}) → [vec1,vec2,vec3]   ✅  (toujours en SQL)
      table.delete('id IN (...)') → NO-OP    ✅  (vecteurs absents, pas d'erreur)
      return true (L-03, idempotent)         ✅
    Step 3 : $transaction([delete, deleteMany])
      workspace_documents.delete   ✅
      document_vectors.deleteMany  ✅        (lignes SQL supprimées)
  purgeVectorCache() ✅
  purgeSourceDocument() ✅

ÉTAT FINAL
  SQL workspace_documents :  ABSENT  ✅
  SQL document_vectors    :  ABSENT  ✅
  LanceDB namespace       :  propre  ✅
  Fichier source          :  ABSENT  ✅  ← supprimé seulement ici
```

**Conclusion :** Le scénario findMany OK + LanceDB OK + SQL FAIL est récupérable par un retry lorsque l'échec SQL est transitoire **et** que `table.delete()` accepte sans erreur un prédicat ne correspondant plus à aucune ligne. Cette dernière propriété — l'idempotence de L-03 — reste déduite de l'implémentation Rust et de la sémantique SQL standard, et non confirmée sur la version exacte utilisée (`@lancedb/lancedb@0.15.0`). Voir addendum PUR-02-G-addendum-lancedb-20261116.

---

## 9. Fichiers absents — limites de l'analyse

Les fichiers suivants ne sont pas disponibles et pourraient modifier l'analyse :

| Fichier | Impact |
|---------|--------|
| `server/models/vectors.js` (original) | Contrat exact de `DocumentVectors.bulkInsert()` non vérifié sur source |
| `server/endpoints/workspaces.js` | Comportement de `update-embeddings` (pathway UI) non vérifié |
| `server/utils/vectorDbProviders/lance/index.js` (original 1.19.0) | Comportement pre-patch de `deleteDocumentFromNamespace()` non vérifié |

L'analyse de comportement LanceDB (`table.delete()` idempotent sur IDs absents) est déduite du fonctionnement standard de Apache Arrow LanceDB 0.x — non vérifié sur une source pinpoint de la version 1.19.0.

---

*Rapport PUR-02-G — Lecture seule — 16 novembre 2026*  
*Sources : 3 candidats PUR-02-E lus. 3 fichiers absents signalés. Aucune déduction sans source explicite sauf comportement LanceDB standard signalé comme tel.*
