# PUR-02-E — Analyse de correction : bug deleteMany multi-workspace (15/11/2026)

**Lecture seule. Aucune modification de fichier, de test, de branche GitHub ni d'action sur la production.**
**Sources : fichiers lus localement ; lignes de code citées par fichier et numéro de ligne exact.**

---

## Rappel de la cause racine

Le bug est dans `candidate-documents.js`, fonction `removeDocuments()`, lignes 332–340 :

```js
// candidate-documents.js — Step 3 (lignes 332–340)
await prisma.$transaction([
  prisma.workspace_documents.delete({
    where: { id: document.id, workspaceId: workspace.id },
  }),
  prisma.document_vectors.deleteMany({
    where: { docId: document.docId },   // ← GLOBAL : supprime toutes les lignes pour ce docId,
  }),                                   //   tous workspaces confondus
]);
```

Pourquoi le scope est global : la table `document_vectors` ne contient pas de colonne `workspaceId` ni `namespace`. Structure inférée de tout le code d'insertion (`candidate-lance-index-v4f.js`, ligne 383) :

```js
documentVectors.push({ docId, vectorId: id });   // ← pas de workspaceId
```

La table ne contient que `{id, docId, vectorId}`. Schéma Prisma non disponible dans ce dépôt (aucun fichier `.prisma` trouvé lors de la recherche), mais l'absence de tout champ workspace dans les `push`, `findMany` et `deleteMany` le confirme par consistance.

**Conséquence** : lorsque `purgeDocument` traite workspace A en premier, le `deleteMany({docId})` de l'étape 3 efface AUSSI les lignes SQL de workspace B. Quand B est traité ensuite, `deleteDocumentFromNamespace` appelle `findMany({where:{docId}})` → retourne `[]` (SQL vidé par A) → la suppression LanceDB du namespace B est sautée (lignes 338–340 du candidat) → le vecteur `vec2` reste dans `LanceDB B.slug` sans ligne SQL correspondante.

---

## Partie 1 — Correction minimale et fiable

### 1.1 Principe directeur

La correction doit : (a) ne pas modifier le schéma SQL, (b) éliminer le scope global du `deleteMany`, (c) rester compatible avec l'architecture LanceDB-par-namespace existante.

La clé est que **LanceDB connaît déjà le namespace** : chaque workspace a sa propre table LanceDB nommée d'après son slug. La source de vérité du "quels vectorIds appartiennent à ce namespace ?" est donc **LanceDB lui-même**, pas la table SQL `document_vectors`.

### 1.2 Option A — Correction sans migration de schéma (recommandée comme correction minimale)

**Principe** : avant de supprimer en SQL, demander à LanceDB quels vectorIds existent dans CE namespace, puis scoper le `deleteMany` sur ces vectorIds.

#### 1.2.1 Modification de `deleteDocumentFromNamespace` (candidate-lance-index-v4f.js)

Actuellement (lignes 311–357), la fonction :
1. Fait `findMany({where:{docId}})` en SQL → récupère TOUS les vectorIds pour ce docId (tous workspaces)
2. Supprime ces vectorIds dans la table LanceDB du namespace courant
3. Retourne `boolean`

Après correction, la fonction devrait :
1. Interroger LanceDB **directement** : lister les IDs présents dans la table de ce namespace pour ce docId
2. Supprimer uniquement ceux trouvés dans LanceDB
3. Retourner `{ deleted: string[] }` — la liste des vectorIds effectivement supprimés de LanceDB

```js
// deleteDocumentFromNamespace — pseudocode de la correction (Option A)
// Étape 1 : interroger LanceDB pour ce namespace et ce docId
const table = await lancedb.openTable(namespace);
const rows = await table
  .search(/* filter only */)
  .where(`docId = '${docId}'`)
  .select(["id"])
  .toArray();
const vectorIds = rows.map(r => r.id);   // ← scope = ce namespace uniquement

if (vectorIds.length === 0) {
  return { deleted: [] };   // rien dans ce namespace, SQL non modifié
}

// Étape 2 : supprimer dans LanceDB
await table.delete(`id IN (${vectorIds.map(v => `'${v}'`).join(",")})`);

return { deleted: vectorIds };
```

> **Note technique** : LanceDB supporte les filtres `where` en mode scan (sans vecteur de recherche) depuis la version utilisée dans ce projet. L'implémentation exacte dépend de l'API LanceDB disponible — `table.query().where(...).select(...).toArray()` ou équivalent selon la version. À vérifier à l'implémentation.

#### 1.2.2 Modification de `removeDocuments` (candidate-documents.js)

Actuellement (lignes 309–321), l'appel est :
```js
await VectorDb.deleteDocumentFromNamespace(workspace.slug, document.docId);
// retourne boolean — résultat ignoré
```

Après correction, l'appel utilise le retour pour scoper le `deleteMany` SQL :
```js
// Step 2 — LanceDB cleanup, namespace-scoped
let deletedVectorIds;
try {
  const result = await VectorDb.deleteDocumentFromNamespace(
    workspace.slug,
    document.docId
  );
  deletedVectorIds = result.deleted;   // string[] | []
} catch (lanceError) {
  // comportement conservé : throw, SQL préservé pour retry
  throw lanceError;
}

// Step 3 — SQL cleanup, scopé sur les vectorIds supprimés de CE namespace
if (deletedVectorIds.length === 0) {
  // LanceDB ne contenait rien pour ce namespace → seule workspace_documents est supprimée
  await prisma.workspace_documents.delete({
    where: { id: document.id, workspaceId: workspace.id },
  });
} else {
  await prisma.$transaction([
    prisma.workspace_documents.delete({
      where: { id: document.id, workspaceId: workspace.id },
    }),
    prisma.document_vectors.deleteMany({
      where: { vectorId: { in: deletedVectorIds } },   // ← scopé par vectorId
    }),
  ]);
}
```

**Pourquoi `vectorId` et pas `docId`** : chaque vectorId est un `uuidv4()` unique généré à l'insertion (ligne 381 de candidate-lance-index-v4f.js). Un vectorId n'appartient qu'à un seul namespace. Supprimer `{vectorId: {in: deletedVectorIds}}` est donc équivalent à supprimer uniquement les lignes SQL du namespace traité, sans toucher aux lignes des autres workspaces.

#### 1.2.3 Cas limite important : `deletedVectorIds = []`

Si LanceDB ne retourne aucun vecteur pour ce docId dans ce namespace (namespace vide ou inexistant), le code ci-dessus :
- Supprime `workspace_documents` (correct : le document n'est plus dans ce workspace)
- **Ne supprime aucune ligne `document_vectors`** (correct si LanceDB était déjà vide pour ce namespace)

Ce comportement est sûr. Si des lignes SQL `document_vectors` persistent alors que LanceDB était vide, elles constituent une **anomalie L-1 pré-existante** (lignes SQL orphelines sans vecteur LanceDB correspondant) — c'est l'état déjà documenté et acceptable comme limite résiduelle.

### 1.3 Option B — Correction avec migration de schéma

**Principe** : ajouter une colonne `workspaceId` (ou `namespace`) à `document_vectors`, scoper toutes les opérations par workspace dès le départ.

| Étape | Action |
|-------|--------|
| Schéma | Ajouter `workspaceId Int` (FK → `workspaces.id`) à `document_vectors` |
| Migration Prisma | `prisma migrate dev` → nouvelle migration SQL |
| Backfill | Pour chaque ligne existante, trouver le workspaceId via `workspace_documents.docId` |
| `addDocumentToNamespace` | Passer `workspace.id` dans le push : `{docId, vectorId: id, workspaceId: workspace.id}` |
| `deleteDocumentFromNamespace` | Passer `workspaceId` ; faire `findMany({where:{docId, workspaceId}})` |
| `removeDocuments` | `deleteMany({where:{docId, workspaceId: workspace.id}})` — scope direct |

**Avantage** : correction propre, cohérence totale entre SQL et LanceDB, requêtes simples.

**Inconvénient** : migration de schéma irréversible sans downtime, backfill à écrire et valider, risque de régression sur les autres opérations qui lisent `document_vectors`.

### 1.4 Comparaison des deux options

| Critère | Option A (sans migration) | Option B (avec migration) |
|---------|--------------------------|--------------------------|
| Migration SQL requise | ❌ Non | ✅ Oui |
| Backfill requis | ❌ Non | ✅ Oui |
| Vecteurs orphelins déjà présents nettoyés | ❌ Non | Via backfill (partiel) |
| Nouveaux orphelins créés après le fix | ❌ Non (si LanceDB disponible) | ❌ Non |
| Complexité de l'implémentation | Moyenne (API LanceDB query) | Élevée (migration + backfill + multi-fichiers) |
| Risque de régression | Faible (2 fichiers) | Modéré (schéma + 2 fichiers + migration) |
| Dépendance à LanceDB disponible | ✅ Oui (si LanceDB inaccessible → `deleted=[]`) | ❌ Non |
| SHA candidats affectés | 2 (documents.js + lance-index-v4f.js) | 2 (mêmes) + migration |

**Recommandation** : Option A comme correction minimale et fiable. Option B si Florian souhaite une base propre avant déploiement en production, en sachant que la migration ajoute un risque opérationnel.

---

## Partie 2 — Comportement en cas d'échec et garanties de retry

### 2.1 Séquences d'échec pour Option A

#### Échec 1 : LanceDB query échoue dans `deleteDocumentFromNamespace`

```
deleteDocumentFromNamespace throws
  → removeDocuments : catch lanceError → throw
  → SQL workspace_documents : non touché ✅
  → SQL document_vectors : non touché ✅
  → LanceDB namespace : non modifié ✅
```

**Retry possible** : oui. Toutes les données sont préservées. `_getStrict` retrouve le document, réessai complet.

#### Échec 2 : LanceDB query réussit, suppression LanceDB réussit, SQL `$transaction` échoue

```
LanceDB : vecteurs supprimés ✅
SQL workspace_documents : non supprimé ⚠️ (transaction rollback)
SQL document_vectors : non supprimé ⚠️ (transaction rollback)
```

**État** : lignes SQL orphelines (L-1). `workspace_documents` toujours présent → `_getStrict` le retrouve au retry. Mais LanceDB est déjà propre pour ce namespace → au retry, `deleteDocumentFromNamespace` retournera `deleted = []` → `deleteMany` scopé par vectorId ne sera pas appelé → `workspace_documents` sera supprimé seul.

> ⚠️ **Conséquence pour le retry** : les lignes `document_vectors` SQL correspondant à ce namespace ne seront jamais nettoyées (LanceDB déjà vide, donc `deleted=[]`). Ces lignes SQL deviennent des **orphelines permanentes** (L-1). C'est acceptable comme limite résiduelle documentée — elles ne causent pas de risque fonctionnel (aucun vecteur LanceDB correspondant).

**Garantie** : le retry ne crée pas d'orphelin LanceDB (vecteurs déjà supprimés, non recréés). Le retry ne supprime pas les `document_vectors` SQL orphelines — c'est un cas de nettoyage manuel, identique au L-1 existant.

#### Échec 3 : Échec en cours de boucle `purgeDocument` (après workspace A, avant workspace B)

Avec Option A :

```
Workspace A : deleteDocumentFromNamespace(A.slug, docId)
  → LanceDB A.slug : vectorIds de A supprimés ✅
  → SQL document_vectors : lignes de A supprimées par {vectorId: {in: deletedA}} ✅
  → SQL workspace_documents A : supprimé ✅

Exception avant workspace B.

Workspace B :
  → SQL document_vectors : lignes de B toujours présentes ✅ (non touchées par A)
  → SQL workspace_documents B : toujours présent ✅
  → LanceDB B.slug : vec2 toujours présent ✅
```

**Retry pour B** : `_getStrict` trouve `workspace_documents B` → `findMany({where:{docId}})` dans LanceDB retourne vec2 → suppression LanceDB B OK → `deleteMany({vectorId:{in:[vec2]}})` SQL OK → cleanup complet.

**Verdict** : avec Option A, le bug multi-workspace est corrigé. Le retry pour B est pleinement fonctionnel.

#### Tableau de synthèse des garanties

| Scénario | SQL après échec | LanceDB après échec | Retry possible ? | Orphelin résiduel après retry |
|----------|----------------|---------------------|-----------------|-------------------------------|
| LanceDB query échoue | Préservé ✅ | Préservé ✅ | Oui ✅ | Aucun |
| LanceDB suppression réussit + SQL échoue | Orphelins SQL (L-1) ⚠️ | Propre ✅ | Oui (workspace_documents) ✅ | Lignes document_vectors SQL (L-1) |
| Échec à mi-boucle (A OK, B non traité) | B préservé ✅ | B préservé ✅ | Oui pour B ✅ | Aucun (si retry B réussit) |
| Toutes étapes OK | Propre ✅ | Propre ✅ | Sans objet | Aucun ✅ |

### 2.2 Garantie de non-destruction précoce de la source

La source SQL (`source_documents` ou équivalent) n'est supprimée que par `purgeSourceDocument`, qui est appelé **après** la boucle sur tous les workspaces dans `candidate-purgeDocument-v4e.js` (lignes 69–98). Cette logique est inchangée par Option A. Garantie maintenue.

### 2.3 Propriété d'idempotence du retry

Avec Option A, le retry est **idempotent** pour les deux cas principaux :

| Appel | Effet si déjà exécuté |
|-------|-----------------------|
| `_getStrict({docpath, workspaceId: B.id})` | Retourne null si déjà supprimé → skip (`continue`) |
| `deleteDocumentFromNamespace(B.slug, docId)` | Si LanceDB déjà vide → `deleted = []` → aucune opération SQL |
| `workspace_documents.delete({id, workspaceId: B.id})` | Prisma lève une erreur si déjà absent (record not found) → attrapé par le try/catch existant |

Le dernier cas (workspace_documents déjà absent) doit être anticipé dans le code de correction si on veut un retry strictement sans erreur. Le code actuel de `removeDocuments` throw sur cette erreur SQL — à considérer lors de l'implémentation.

---

## Partie 3 — Évaluation des conséquences

### 3.1 Périmètre des fichiers touchés

#### Option A

| Fichier candidat | Type de modification | Nature |
|-----------------|---------------------|--------|
| `candidate-lance-index-v4f.js` | Modifier `deleteDocumentFromNamespace` | Remplacer le `findMany` SQL par un scan LanceDB ; changer le type de retour de `boolean` à `{deleted: string[]}` |
| `candidate-documents.js` | Modifier `removeDocuments` | Utiliser `result.deleted` pour scoper `deleteMany` ; gérer `deleted = []` |

Deux fichiers. Pas de migration SQL. Pas de modification du schéma Prisma.

**Impact sur les autres appelants de `deleteDocumentFromNamespace`** : la signature change (retour `{deleted}` au lieu de `boolean`). Dans `candidate-documents.js`, l'appel de rollback (lignes 212–216) utilise aussi `deleteDocumentFromNamespace` :

```js
// addDocuments — rollback LanceDB si workspace_documents.create échoue (ligne 212)
const deleted = await VectorDb.deleteDocumentFromNamespace(workspace.slug, docId);
vectorsRemoved = deleted !== false;   // ← attend boolean
```

Ce site devra être mis à jour pour `vectorsRemoved = deleted.deleted.length > 0` (ou équivalent). **Un troisième site de modification dans le même fichier**, mais pas un troisième fichier.

#### Option B

| Fichier | Type de modification |
|---------|---------------------|
| `candidate-lance-index-v4f.js` | Passer `workspaceId` dans les pushs, modifier `deleteDocumentFromNamespace` |
| `candidate-documents.js` | `deleteMany({docId, workspaceId})` ; adapter les appels |
| `schema.prisma` | Ajouter colonne `workspaceId` à `document_vectors` (fichier non présent dans ce dépôt) |
| Migration Prisma | Nouveau fichier `.sql` généré par `prisma migrate dev` |
| Script de backfill | Nouveau fichier (non candidat) |

Minimum 3 fichiers de code + migration + backfill.

### 3.2 Risques spécifiques de chaque option

#### Option A — risques

| Risque | Probabilité | Impact | Mitigation |
|--------|------------|--------|-----------|
| API LanceDB query sans vecteur non disponible dans la version utilisée | Faible (API de scan standard) | Bloquant | Vérifier la version LanceDB à l'implémentation |
| `deleted = []` lors d'une suppression légitime → lignes SQL orphelines | Moyenne (si LanceDB inaccessible) | L-1 (acceptable, documenté) | Log explicite ; comportement identique au L-1 existant |
| Changement de signature de `deleteDocumentFromNamespace` casse un appelant non recensé | Faible (2 sites connus) | Régressions tests | Grep exhaustif de tous les appelants avant implémentation |
| Performance : scan LanceDB remplace findMany SQL | Faible (docId = UUID → scan ciblé) | Latence légèrement supérieure | Acceptable pour opération de purge (non critique en latence) |

#### Option B — risques

| Risque | Probabilité | Impact | Mitigation |
|--------|------------|--------|-----------|
| Migration échoue ou crée un downtime | Moyenne | Service indisponible | Planifier une fenêtre de maintenance |
| Backfill incomplet (docId partagé entre plusieurs workspaces) | Faible (cas normal) → Moyenne (documents partagés) | workspaceId erroné → bug de scope | Écrire le backfill avec vérification de l'unicité workspaceId par (docId, namespace) |
| Données de production modifiées de manière irréversible | Certaine (migration) | — | Test exhaustif en lab avant |
| Régressions sur les autres opérations qui lisent document_vectors | Faible (peu de sites) | — | Tests de régression complets |

### 3.3 Conséquences sur les trois candidats PUR-02-E

Les trois candidats actuels ont les SHA-256 suivants (source CLAUDE.md) :

| Fichier | SHA-256 actuel |
|---------|---------------|
| `candidate-purgeDocument-v4e.js` | `90a21b04…` |
| `candidate-documents.js` | `de9c5860…` |
| `candidate-lance-index-v4f.js` | `8103f042…` |

#### Impact Option A

| Candidat | SHA après correction | Raison |
|----------|---------------------|--------|
| `candidate-purgeDocument-v4e.js` | **Inchangé** `90a21b04…` | Aucune modification — `purgeDocument` reste identique |
| `candidate-documents.js` | **Nouveau SHA** | `removeDocuments` modifié (scope deleteMany + gestion deleted=[]) ; site rollback addDocuments modifié |
| `candidate-lance-index-v4f.js` | **Nouveau SHA** | `deleteDocumentFromNamespace` modifié (scan LanceDB + retour {deleted}) |

L'archive v3 (`451a586c…`) contient une version antérieure de `purgeDocument.js` (`efb8076c…`, différente des trois candidats PUR-02-E). L'Option A ne modifie pas `purgeDocument`, donc l'écart avec v3 reste inchangé.

#### Impact Option B

Mêmes changements SHA que Option A, **plus** :
- Nouveau fichier migration Prisma (SHA nouveau)
- `schema.prisma` modifié (SHA nouveau, si présent dans le dépôt)
- Script de backfill (nouveau fichier)

### 3.4 Stratégie de réconciliation des vecteurs orphelins déjà présents

Les vecteurs orphelins déjà créés (sur toutes les instances de production ou de test ayant exécuté une purge multi-workspace) ne seront pas nettoyés automatiquement par Option A.

**Option A — réconciliation manuelle possible** :

```
Pour chaque workspace W :
  1. Lister les IDs dans LanceDB W.slug : SELECT id, docId FROM W.slug
  2. Lister les vectorIds dans document_vectors : SELECT vectorId FROM document_vectors
  3. Les IDs dans LanceDB non présents dans document_vectors sont des orphelins
  4. Supprimer ces IDs de LanceDB W.slug
```

Cette procédure peut être écrite comme un script autonome (hors candidats). Elle ne nécessite pas de migration SQL.

**Option B — réconciliation via backfill** : le backfill relie chaque vectorId SQL à son workspaceId correct. Les orphelins LanceDB ne sont pas automatiquement supprimés — le même scan que ci-dessus reste nécessaire.

**Dans les deux cas** : la réconciliation est une opération ponctuelle, hors du périmètre du correctif lui-même. Elle devrait être exécutée une seule fois en environnement lab avant tout déploiement.

### 3.5 Tests à prévoir (non exhaustif)

#### Tests existants à re-valider (Suite A — scenarios 3 et 4)

| Scénario | Ce qui change avec Option A |
|----------|-----------------------------|
| A-3 : purge d'un document présent dans un seul workspace | `deleted` non vide → `deleteMany({vectorId})` scopé → comportement identique au test existant (si les mocks retournent le bon format) |
| A-4 : purge d'un document présent dans deux workspaces | Nouveau comportement : workspace A ne touche plus aux lignes SQL de B → à ajouter explicitement |

#### Nouveaux tests à écrire

| Test | Description | Vérifie |
|------|-------------|---------|
| Multi-workspace — succès complet | A et B traités, chaque namespace nettoyé indépendamment | Lignes SQL de B toujours présentes après traitement de A |
| Multi-workspace — échec SQL après LanceDB (workspace A) | LanceDB A propre, SQL A échoue | B toujours complet ; retry A possible |
| Multi-workspace — retry complet | Après échec à mi-boucle, retry ne crée pas d'orphelin | État final propre |
| `deleted = []` — LanceDB vide | `deleteDocumentFromNamespace` retourne `{deleted:[]}` | Seul `workspace_documents` est supprimé ; `document_vectors` non touché |
| Signature de retour | `deleteDocumentFromNamespace` retourne `{deleted: string[]}` | Site rollback `addDocuments` correct |

#### Suite L/R (limite/retry)

Les 8 tests existants de Suite L/R couvrent les scénarios mono-workspace. Nouveaux tests L/R à ajouter pour le cas multi-workspace (au moins 2 : échec sur B pendant purge multi-workspace + retry B).

---

## Information manquante à signaler

1. **Schéma Prisma non disponible** : aucun fichier `.prisma` trouvé dans le dépôt. La structure `{id, docId, vectorId}` de `document_vectors` est inférée du code (cohérente sur 100% des sites) mais non confirmée par le DDL. Option B nécessite le schéma réel avant d'être précisément spécifiée.

2. **Version LanceDB** : l'API de scan sans vecteur (`query().where()` ou équivalent) est présente dans les versions récentes de LanceDB. La version exacte utilisée dans ce projet n'est pas disponible dans les fichiers lus (aucun `package.json` lu ce cycle). À vérifier lors de l'implémentation d'Option A.

3. **Appelants de `deleteDocumentFromNamespace` hors candidats** : seuls les sites dans `candidate-documents.js` ont été recensés. D'autres fichiers du projet AnythingLLM non présents dans ce dépôt pourraient appeler cette fonction. Un grep sur le dépôt complet de production est nécessaire avant implémentation.

---

## Résumé exécutif

| | Option A (sans migration) | Option B (avec migration) |
|--|--------------------------|--------------------------|
| **Principe** | LanceDB devient source de vérité du scope par namespace | SQL devient source de vérité via colonne workspaceId |
| **Fichiers modifiés** | 2 (documents.js + lance-index-v4f.js) | 2 + schema.prisma + migration + backfill |
| **Vecteurs orphelins existants nettoyés** | Non (script de réconciliation séparé) | Non automatiquement (même script) |
| **Vecteurs orphelins futurs éliminés** | Oui ✅ | Oui ✅ |
| **Retry fonctionnel** | Oui ✅ (B préservé jusqu'au traitement de B) | Oui ✅ |
| **Source supprimée prématurément** | Non ✅ (purgeDocument inchangé) | Non ✅ |
| **SHA purgeDocument-v4e.js** | Inchangé ✅ | Inchangé ✅ |
| **Risque opérationnel** | Faible | Modéré (migration irréversible) |
| **Complexité implémentation** | Moyenne | Élevée |

**Option A est la correction minimale et fiable** pour le bug `deleteMany` multi-workspace. Elle nécessite 2 nouveaux SHA (documents.js, lance-index-v4f.js), préserve candidate-purgeDocument-v4e.js inchangé, et maintient les garanties de retry existantes.

**Option B** apporte une base architecturale plus propre mais nécessite une migration de schéma irréversible, un backfill, et une validation plus lourde.

**Dans les deux cas**, un script de réconciliation ponctuel est nécessaire pour nettoyer les vecteurs orphelins déjà présents dans les namespaces LanceDB.

---

*Lecture seule. Aucun fichier modifié. Aucune action sur GitHub ni en production.*

**Fichiers sources de cette analyse :**

| Fichier | Lignes clés |
|---------|------------|
| `candidate-documents.js` (SHA `de9c5860…`) | 285–361 (`removeDocuments`), 194–235 (rollback dans `addDocuments`) |
| `candidate-lance-index-v4f.js` (SHA `8103f042…`) | 311–357 (`deleteDocumentFromNamespace`), 359–462 (`addDocumentToNamespace`) |
| `candidate-purgeDocument-v4e.js` (SHA `90a21b04…`) | 69–98 (`purgeDocument` — ordre correct, inchangé) |
| `CLAUDE.md` | SHA-256 de référence des trois candidats |
