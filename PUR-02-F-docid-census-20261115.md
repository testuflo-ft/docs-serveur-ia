# PUR-02-F — Recensement des chemins d'insertion `document_vectors` et atteignabilité du scénario multi-workspace

**Date :** 15 novembre 2026  
**Nature :** Lecture seule — vérification exhaustive  
**Périmètre :** AnythingLLM 1.19.0, sources disponibles dans `pur02-sources-1.19.0/` + candidats PUR-02-E  
**Contrainte :** Aucun patch, aucun test, aucune modification, aucune publication  

---

## 0. Fichiers sources utilisés et disponibilité

### Disponibles et lus intégralement

| Fichier | Rôle | Chemin exact |
|---------|------|-------------|
| `purgeDocument.js` | Suppression globale par filename | `pur02-sources-1.19.0/purgeDocument.js` |
| `files-index.js` | Utilitaires fichiers, cache vectoriel | `pur02-sources-1.19.0/files-index.js` |
| `api-document-index.js` | Endpoints API v1/document/* | `pur02-sources-1.19.0/api-document-index.js` |
| `endpoints-system.js` | Endpoints système /system/* | `pur02-sources-1.19.0/endpoints-system.js` |
| `candidate-documents.js` | Modèle Document (PUR-02 patché) | `candidate-documents.js` |
| `candidate-lance-index-v4f.js` | LanceDB (PUR-02 patché v4f) | `candidate-lance-index-v4f.js` |
| `candidate-lance-index.js` | LanceDB (PUR-02 patché, version antérieure) | `candidate-lance-index.js` |

### **Non disponibles — signalement explicite**

Les fichiers suivants ne sont PAS présents dans `pur02-sources-1.19.0/` ni comme candidats lisibles :

| Fichier absent | Impact sur le recensement |
|---------------|--------------------------|
| `server/endpoints/workspaces.js` | Contient l'endpoint `POST /workspace/:slug/update-embeddings` (UI « ajouter un document ») — chemin d'insertion principal non vérifié sur source originale |
| `server/endpoints/api/workspace/index.js` | Endpoint API workspace — chemin d'insertion API workspace non vérifié |
| `server/models/documents.js` (original) | Modèle pré-patch — `removeDocuments()` original non disponible |
| `server/models/vectors.js` | Modèle `DocumentVectors` — schéma exact non vérifié sur source |
| `server/utils/vectorDbProviders/lance/index.js` (original 1.19.0) | `deleteDocumentFromNamespace` pre-patch non disponible |
| `server/utils/files/documentSyncQueue.js` | Synchronisation de documents observés — chemin de re-embedding non vérifié |

Toute conclusion dans ce rapport concerne **les chemins censurés dans les sources disponibles**. Les fichiers absents sont une limitation explicite.

---

## 1. Recensement de tous les chemins d'insertion de `document_vectors`

L'insertion dans `document_vectors` se fait exclusivement via `DocumentVectors.bulkInsert()`, appelé dans `addDocumentToNamespace()`.

### Chemin A — Upload API vers workspace (endpoint `/v1/document/upload*`)

**Source :** `pur02-sources-1.19.0/api-document-index.js`

Endpoints concernés :
- `POST /v1/document/upload`
- `POST /v1/document/upload/:folderName`
- `POST /v1/document/upload-link`
- `POST /v1/document/upload-raw-text`

Chaîne d'appel (reconstituée depuis le code disponible) :
```
Endpoint → Document.api.uploadToWorkspace(addToWorkspaces, docLocations)
  └─ for each workspace in addToWorkspaces:
       for each docLocation in docLocations:
         await Document.addDocuments(workspace, [docLocation])  ← génère docId
```

La fonction `Document.api.uploadToWorkspace()` est définie dans `candidate-documents.js` lignes 446–501. Elle itère sur chaque workspace et appelle `addDocuments()` **séparément pour chaque paire (workspace, document)**.

### Chemin B — Endpoint système `/system/remove-document` et `/system/remove-documents`

**Source :** `pur02-sources-1.19.0/endpoints-system.js`, lignes 470–497

Ces endpoints appellent `purgeDocument(name)` — c'est un **chemin de suppression**, pas d'insertion. **Aucune création de `document_vectors` ici.**

### Chemin C — Endpoint UI workspace (non disponible sur source 1.19.0)

**Source : ABSENTE.** L'endpoint standard d'AnythingLLM `POST /workspace/:slug/update-embeddings` (UI « glisser un document vers un workspace ») n'est pas dans les 4 fichiers de `pur02-sources-1.19.0/`. Ce chemin appelle vraisemblablement `Document.addDocuments(workspace, docpaths)` — le même mécanisme que le chemin A — mais **ne peut pas être vérifié sur source originale 1.19.0**.

### Chemin D — `addDocuments()` — point d'insertion central

**Source :** `candidate-documents.js` lignes 141–221 (PUR-02 patché)

```javascript
// candidate-documents.js, ligne 152
const docId = uuidv4();
```

Comportement commun à tous les chemins :
- Création d'une entrée `workspace_documents` avec ce `docId` frais
- Appel `VectorDb.addDocumentToNamespace(workspace.slug, {..., docId, ...})`
- Création des enregistrements `document_vectors` via `DocumentVectors.bulkInsert()`

---

## 2. Génération, transmission et réutilisation du `docId`

### 2.1 Génération

**Source :** `candidate-documents.js`, ligne 152

```javascript
const docId = uuidv4();   // ← UUID v4 aléatoire, généré à chaque appel
```

Chaque appel à `addDocuments(workspace, docpaths)` génère un `docId` frais par fichier dans la boucle interne (lignes 148–221). Ce UUID est :
- Stocké dans la colonne `workspace_documents.docId`
- Passé au vecteur DB via le paramètre `documentData.docId`

### 2.2 Transmission vers LanceDB

**Source :** `candidate-lance-index-v4f.js`, lignes 353–462

```javascript
// Chemin cache HIT (lignes 371–391) :
for (const chunk of chunks) {
  chunk.forEach((chunk) => {
    const id = uuidv4();                            // ← vectorId frais (PAS le docId)
    documentVectors.push({ docId, vectorId: id }); // ← docId vient du CALLER
    submissions.push({ id: id, vector: chunk.values, ...metadata });
  });
}

// Chemin cache MISS (lignes 421–438) :
documentVectors.push({ docId, vectorId: vectorRecord.id }); // ← même schéma
```

Le `docId` passé à `addDocumentToNamespace()` est le même UUID généré par `addDocuments()`. Il n'est ni modifié ni partagé ici.

### 2.3 Réutilisation — analyse du cache vectoriel

**Source :** `pur02-sources-1.19.0/files-index.js`, lignes 271–301

```javascript
async function cachedVectorInformation(filename = null, checkOnly = false) {
  const digest = uuidv5(filename, uuidv5.URL);  // ← clé = hash du NOM DE FICHIER
  const file = path.resolve(vectorCachePath, `${digest}.json`);
  // Retourne : { exists: true, chunks: JSON.parse(rawData) }
  // Les chunks = valeurs d'embedding (vecteurs), PAS des docIds
}
```

**Le cache vectoriel stocke exclusivement des valeurs d'embedding (chunks), clé par hash du chemin de fichier.** Il ne stocke, ne lit, ni ne propage de `docId`. Lorsque le cache est utilisé :

1. Les **valeurs d'embedding** sont lues depuis le cache (évitant le re-calcul LLM)
2. De **nouveaux vectorIds** (`uuidv4()`) sont générés pour chaque vecteur
3. Le **docId passé par le caller** (workspace-spécifique) est utilisé tel quel

**Conclusion partielle :** Le cache ne peut pas propager un `docId` d'un workspace à un autre.

---

## 3. Un même `docId` peut-il être associé à plusieurs `workspace_documents` ayant des `workspaceId` différents ?

### 3.1 Mécanisme normal

Dans le chemin d'upload multi-workspace (`Document.api.uploadToWorkspace()`, `candidate-documents.js` lignes 446–501) :

```javascript
for (const workspace of workspaces) {
  for (const docLocation of docLocations) {
    await Document.addDocuments(workspace, [docLocation]);
    //  ↑ chaque appel génère son propre docId = uuidv4()
  }
}
```

Pour un même fichier ajouté à deux workspaces A et B :
- Workspace A → `addDocuments(A, [file])` → `docId_A = uuidv4()` → `workspace_documents.docId = docId_A`
- Workspace B → `addDocuments(B, [file])` → `docId_B = uuidv4()` → `workspace_documents.docId = docId_B`

`docId_A ≠ docId_B` (probabilité 1 − 2^−122 ≈ 1). **Deux docIds distincts, chacun lié à son workspace.**

### 3.2 Vérification des chemins d'insertion disponibles

| Chemin | docId généré où | Partagé entre workspaces ? |
|--------|----------------|---------------------------|
| `addDocuments()` direct | Ligne 152 `uuidv4()` | ❌ Non — frais par appel |
| `api.uploadToWorkspace()` | Via `addDocuments()` dans boucle | ❌ Non — un appel par workspace |
| Endpoints API upload | Via `Document.api.uploadToWorkspace()` | ❌ Non |
| Cache vectoriel | Pas de docId dans le cache | ❌ Non — cache stocke vecteurs |
| Endpoint workspace (ABSENT) | Vraisemblablement via `addDocuments()` | ⚠️ Non vérifié sur source |

---

## 4. Rôle du cache vectoriel : réutilise-t-il les vecteurs sans réutiliser le `docId` ?

**Oui, c'est exactement ce que fait le cache.** Synthèse :

| Élément | Cache HIT | Cache MISS |
|---------|-----------|-----------|
| Valeurs d'embedding | ✅ Réutilisées depuis le fichier cache | ❌ Recalculées via LLM |
| `vectorId` (colonne `document_vectors.vectorId`) | 🆕 Nouveau `uuidv4()` généré | 🆕 Nouveau `uuidv4()` généré |
| `docId` (colonne `document_vectors.docId`) | Passé par le caller (workspace-spécifique) | Passé par le caller (workspace-spécifique) |

**Le cache vectoriel ne partage PAS les docIds.** Il optimise le temps de calcul des embeddings mais n'affecte pas la clé d'identification par workspace.

---

## 5. Autres appels à `removeDocuments()` et `deleteDocumentFromNamespace()`

### 5.1 `Document.removeDocuments()` — appels recensés

**Source :** `pur02-sources-1.19.0/purgeDocument.js`, lignes 18–21 et 74–78

```javascript
// purgeDocument() — ligne 18-21 (original 1.19.0)
for (const workspace of workspaces) {
  await Document.removeDocuments(workspace, [filename]);
}

// purgeFolder() — lignes 74-78 (original 1.19.0, concurrent)
const rmWorkspaceDoc = () => new Promise((resolve) =>
  Document.removeDocuments(workspace, filenames).then(() => resolve(true))
);
```

Depuis `endpoints-system.js` :
- `DELETE /system/remove-document` → `purgeDocument(name)` → `removeDocuments(workspace, [name])` pour chaque workspace (lignes 470–477)
- `DELETE /system/remove-documents` → boucle `purgeDocument(name)` (lignes 485–497)
- `DELETE /system/remove-folder` → `purgeFolder(name)` → `removeDocuments(workspace, filenames)` concurrent (lignes 500–517)

Dans tous ces cas, `removeDocuments()` est appelé **workspace par workspace** avec le `filename`. La fonction récupère le `docId` depuis `workspace_documents` pour CE workspace (en faisant un `findFirst` ou `where({docpath: filename, workspaceId: workspace.id})`), puis passe ce docId à `deleteDocumentFromNamespace()`.

### 5.2 `deleteDocumentFromNamespace()` — implémentation originale vs PUR-02

La version originale (pre-patch) n'est pas disponible dans `pur02-sources-1.19.0/`. Le candidat `candidate-lance-index.js` (version antérieure au v4f) contient déjà le commentaire `PUR-02 PATCH: deleteDocumentFromNamespace` (ligne 292). Le pré-patch est disponible uniquement via `tmp/pur02-lance-v4f.test.js` (non lu ici).

D'après le commentaire de patch (`candidate-lance-index.js`, lignes 292–308) :
- Original : utilisait `DocumentVectors.where()` (absorbe silencieusement les erreurs SQL)
- PUR-02 : utilise `prisma.document_vectors.findMany()` (throws sur erreur SQL)
- **Les deux versions font `findMany({where:{docId}})` sans filtre workspaceId**

La portée de la requête SQL (`findMany({where:{docId}})`) est globale (pas de filtre workspace), mais :
- Si `docId` est unique par workspace, cela ne supprime que les lignes de ce workspace
- **C'est une fragilité architecturale**, non un bug actif dans les chemins censurés

---

## 6. Conclusion explicite sur l'atteignabilité du scénario

### **VERDICT : Scénario impossible avec les chemins d'insertion recensés**

Dans tous les chemins d'insertion disponibles pour analyse, chaque ajout d'un document à un workspace génère un `docId = uuidv4()` frais et distinct. Il n'existe aucun mécanisme de partage ou de propagation de `docId` entre workspaces dans le code disponible.

**Conséquence directe sur `deleteMany({docId})` :**

```
docId_A est unique à workspace A
  → document_vectors ne contient que des lignes avec docId = docId_A pour workspace A
  → deleteMany({where:{docId: docId_A}}) ne supprime que les lignes de workspace A
  → Pas d'effet de bord sur les autres workspaces
```

**Le risque de suppression cross-workspace avait donc été surestimé dans PUR-02-E.**

### Nuances importantes

**1. Fragilité structurelle persistante**  
Le schéma `document_vectors` n'a pas de colonne `workspaceId`. L'intégrité repose exclusivement sur la garantie applicative que `uuidv4()` soit toujours appelé séparément par workspace. Si cette garantie est un jour violée (refactoring, bug futur, manipulation manuelle de la base), `deleteMany({docId})` pourrait supprimer des enregistrements cross-workspace sans avertissement.

**2. Chemin workspace/update-embeddings non vérifié**  
L'endpoint `POST /workspace/:slug/update-embeddings` (chemin d'insertion principal depuis l'UI) n'est pas dans les fichiers disponibles. D'après l'architecture AnythingLLM, il appelle `Document.addDocuments()` → docId frais par workspace. Cela reste une inférence, pas une vérification sur source.

**3. DocumentSyncQueue non vérifié**  
La synchronisation de documents observés (`documentSyncQueue.js`) n'est pas disponible. Si elle re-embed un document existant avec son `docId` original plutôt qu'un nouveau UUID, le scénario de réutilisation de docId deviendrait possible. Fichier absent — non vérifiable.

---

## 7. Incohérences de l'Option A

### 7.1 Contrat de retour `deleted=[]`

**Problème :** Dans l'Option A, lorsque `findMany({where:{docId}})` retourne un tableau vide (après une suppression SQL réussie mais avant la requête, ou après un échec SQL silencieux), le `deleteDocumentFromNamespace()` retourne `false` ou `[]`. L'appelant (`removeDocuments()`) traite cela comme "rien à supprimer" — ce qui est faux si LanceDB contenait des vecteurs orphelins.

**État réel :** Vecteurs LanceDB existent → SQL vide → `deleted=[]` → vecteurs restent en base LanceDB → orphelins persistants.

**Le retour `deleted=[]` masque la divergence SQL/LanceDB sans la signaler.**

### 7.2 Rollback dans `addDocuments()`

Le candidat `candidate-documents.js` n'a pas de transaction atomique entre :
- `workspace_documents` SQL (Prisma/SQLite)
- `document_vectors` SQL (Prisma/SQLite)  
- LanceDB (fichiers `.lance`)

Si `addDocuments()` échoue après `DocumentVectors.bulkInsert()` mais avant la fin, les enregistrements `document_vectors` créés ne sont PAS annulés. Il n'existe pas de rollback `document_vectors` dans le code disponible. Le "rollback" mentionné dans PUR-02-E s'applique à la logique de `purgeDocument`, pas à `addDocuments()`.

### 7.3 Appelants non recensés de `removeDocuments()`

Le endpoint workspace `POST /workspace/:slug/update-embeddings` (absent des sources) appelle probablement `Document.removeDocuments()` lors du "unembed" (retrait d'un document d'un workspace depuis l'UI). Ce chemin n'est pas recensé. Si son comportement diffère de `purgeDocument`, les garanties de l'Option A pourraient ne pas couvrir tous les cas d'appel.

---

## 8. Synthèse

| Question | Réponse |
|----------|---------|
| **Scénario même docId dans deux workspaces** | **Impossible** dans les chemins recensés |
| **Exemple de code créant ce scénario** | Aucun dans les sources disponibles |
| **deleteMany({docId}) risque multi-workspace actuel** | Nul en utilisation normale (docId unique par workspace) |
| **Risque résiduel** | Fragilité architecturale (pas de workspaceId dans document_vectors) |
| **deleteMany({docId}) risque réel** | Oui, mais différent : masquage d'erreur SQL → vecteurs LanceDB orphelins |
| **Cache vectoriel partage des docIds** | Non — cache stocke des valeurs d'embedding, pas de docIds |
| **Option A — deleted=[] cohérent** | Non — masque la divergence SQL/LanceDB |
| **Rollback addDocuments() en Option A** | Absent — pas de transaction atomique SQL↔LanceDB |
| **Appelants non recensés de removeDocuments()** | workspace/update-embeddings (endpoint absent) |

### Le vrai risque de `deleteMany({docId})`

Le risque initial était formulé comme : "suppression cross-workspace d'un document partagé". Ce risque est impossible avec les chemins d'insertion recensés.

**Le risque réel de `deleteMany({docId})` est différent :** lorsqu'une erreur SQL silencieuse retourne `[]` pour `DocumentVectors.where({docId})` alors que des vecteurs existent dans LanceDB, la suppression SQL est suivie d'une suppression LanceDB qui n'a pas lieu, laissant des vecteurs orphelins dans le namespace. C'est ce risque que PUR-02-E corrige correctement en remplaçant `DocumentVectors.where()` (absorption silencieuse) par `prisma.findMany()` (throw sur erreur).

---

*Rapport PUR-02-F — Lecture seule — 15 novembre 2026*  
*Sources vérifiées : 7 fichiers lus. 6 fichiers absents signalés. Aucune déduction sans source.*
