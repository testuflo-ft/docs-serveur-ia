# PUR-02-E — Vérification chemin de recherche LanceDB (15/11/2026)
**Lecture seule. Aucune modification. Sources : fichiers locaux lus, lignes de code citées.**

---

## 1. Vérification du risque fonctionnel du vecteur LanceDB résiduel

### 1.1 Chemin de recherche — fonctions identifiées

Le chemin de recherche LanceDB passe par trois fonctions dans `candidate-lance-index-v4f.js` :

| Fonction | Lignes | Rôle |
|----------|--------|------|
| `performSimilaritySearch()` | 464–514 | Point d'entrée public ; dispatche vers l'une des deux fonctions ci-dessous |
| `similarityResponse()` | 183–224 | Recherche vectorielle standard |
| `rerankedSimilarityResponse()` | 98–170 | Recherche vectorielle + reranking |

### 1.2 Analyse de `similarityResponse()` — filtrage appliqué

```js
// candidate-lance-index-v4f.js, lignes 198–221
const response = await collection
  .vectorSearch(queryVector)
  .distanceType("cosine")
  .limit(topN)
  .toArray();

response.forEach((item) => {
  if (this.distanceToSimilarity(item._distance) < similarityThreshold)
    return;                                // ← filtre 1 : seuil de similarité
  const { vector: _, ...rest } = item;
  if (filterIdentifiers.includes(sourceIdentifier(rest))) {
    this.logger("A source was filtered from context as it's parent document is pinned.");
    return;                                // ← filtre 2 : documents "pinnés"
  }
  result.contextTexts.push(rest.text);
  result.sourceDocuments.push({ ...rest, score: ... });
  result.scores.push(...);
});
```

**Deux filtres seulement, appliqués séquentiellement :**

| Filtre | Mécanisme | Consulte SQL ? |
|--------|-----------|---------------|
| Seuil de similarité | `distanceToSimilarity(item._distance) < threshold` | ❌ Non |
| Documents pinnés | `filterIdentifiers.includes(sourceIdentifier(rest))` | ❌ Non — `filterIdentifiers` vient de l'appelant ; `sourceIdentifier` lit les métadonnées stockées DANS LanceDB |

**`document_vectors` et `workspace_documents` ne sont jamais consultés dans ce chemin.**

### 1.3 Analyse de `performSimilaritySearch()` — aucun filtre SQL post-recherche

```js
// candidate-lance-index-v4f.js, lignes 505–513
const { contextTexts, sourceDocuments } = result;
const sources = sourceDocuments.map((metadata, i) => {
  return { metadata: { ...metadata, text: contextTexts[i] } };
});
return {
  contextTexts,
  sources: this.curateSources(sources),   // ← reformatage des métadonnées uniquement
  message: false,
};
```

`curateSources()` (lignes 548–562) extrait les champs de métadonnées des résultats LanceDB sans consulter aucune table SQL.

### 1.4 Analyse de `rerankedSimilarityResponse()` — même conclusion

```js
// candidate-lance-index-v4f.js, lignes 134–138 + 143–162
const vectorSearchResults = await collection
  .vectorSearch(queryVector)
  .distanceType("cosine")
  .limit(searchLimit)
  .toArray();

await reranker.rerank(query, vectorSearchResults, { topK: topN })
  .then((rerankResults) => {
    rerankResults.forEach((item) => {
      if (this.distanceToSimilarity(item._distance) < similarityThreshold) return;
      const { vector: _, ...rest } = item;
      if (filterIdentifiers.includes(sourceIdentifier(rest))) { ... return; }
      result.contextTexts.push(rest.text);
      ...
    });
  });
```

Mêmes deux filtres. Aucune consultation SQL.

### 1.5 Comportement de `filterIdentifiers` vis-à-vis d'un vecteur orphelin

`filterIdentifiers` est construit par l'appelant (l'endpoint de chat workspace) **à partir des enregistrements `workspace_documents.pinned`** — les documents que l'utilisateur a explicitement marqués comme "toujours inclure" (exclus de la recherche vectorielle car injectés directement).

Après purge multi-workspace :
- La ligne `workspace_documents` pour le document D dans workspace B est **supprimée** (soit lors du retry réussi, soit lors du succès normal)
- Il n'existe donc **aucune entrée** de D dans `workspace_documents` pour B
- D ne peut pas figurer dans `filterIdentifiers` construits pour le workspace B
- Vec2 dans `B.slug` **ne sera pas filtré** par le mécanisme `filterIdentifiers`

> **Note** : le code qui construit `filterIdentifiers` n'est pas directement disponible dans ce dépôt (fichier `server/endpoints/workspaces.js` ou `server/utils/chats/index.js` de l'AnythingLLM non publié ici). La conclusion ci-dessus repose sur : (a) l'architecture documentée dans le Livret (§14.5 : `workspace_documents.pinned` est l'attribut writable concerné), (b) le message de log dans `similarityResponse` ("parent document is pinned"), et (c) l'absence de toute autre source possible pour `filterIdentifiers` dans le code disponible.

### 1.6 Conclusion : risque fonctionnel confirmé

**Un vecteur présent dans `LanceDB B.slug` sans entrée correspondante dans `document_vectors` ou `workspace_documents` SERA retourné dans les résultats de recherche du workspace B.**

Le risque est **fonctionnel (correctness/confidentialité)**, pas uniquement un leak de stockage :

| Aspect | Évaluation |
|--------|-----------|
| Vec2 retourné par `vectorSearch(B.slug)` | ✅ Oui — il est dans la table LanceDB B.slug |
| Exclu par seuil de similarité | Seulement si distance > 1.0 (orthogonal) — peu probable pour un vrai chunk |
| Exclu par `filterIdentifiers` | ❌ Non — workspace_documents supprimé, D ne peut pas être dans les pinnés |
| Exclu par validation SQL post-recherche | ❌ Non — aucune validation SQL dans le chemin de recherche |
| **Résultat pour l'utilisateur de B** | **Les chunks de D apparaissent dans les réponses du LLM pour workspace B** |

Cet état persiste **indéfiniment** jusqu'à nettoyage manuel de la table LanceDB B.slug.

### 1.7 Moment d'apparition du risque

| Phase | État workspace_documents B | État LanceDB B.slug | Vec2 visible dans les résultats ? |
|-------|--------------------------|---------------------|-----------------------------------|
| Pendant la purge (B échoue, avant retry) | Présent ⚠️ | Vec2 présent ⚠️ | **Oui** |
| Après retry réussi (workspace_documents B supprimé) | Supprimé ✅ | Vec2 toujours présent ⚠️ | **Oui** |
| Après purge complète sans échec (B réussit normalement) | Supprimé ✅ | Vec2 toujours présent ⚠️ | **Oui** |

Le risque s'applique dans tous les cas post-purge multi-workspace.

---

## 2. Terminologie et documentation L-1 / L-3

### 2.1 Trois états résiduels distincts — formulations précises

#### État résiduel type 1 — L-1 (par workspace, indépendant du multi-workspace)

**Situation** : Pour un workspace donné, `deleteDocumentFromNamespace` réussit (vecteurs LanceDB supprimés), puis le `$transaction` SQL échoue.

```
LanceDB workspace.slug : vecteurs supprimés ✅
document_vectors SQL   : lignes toujours présentes ⚠️ — elles référencent des vectorId disparus
workspace_documents    : ligne toujours présente ⚠️
```

**Formulation correcte** :
> *Lignes SQL orphelines* (`document_vectors` et `workspace_documents`) : les enregistrements SQL subsistent alors que leurs contreparties LanceDB ont été supprimées.

**Terme à éviter** : "vecteurs orphelins" — les vecteurs sont supprimés, pas orphelins.

**Référence code** : `candidate-documents.js` ligne 344 :
```js
`document_vectors rows for docId ${document.docId} may be orphaned. Manual cleanup required.`
```

**Référence BILAN L-1** : "Non-atomicité LanceDB/SQL — vecteurs supprimés, SQL orphelins possibles" ✅ (terminologie correcte dans le BILAN)

---

#### État résiduel type 2 — multi-workspace (nouveau cas, non nommé dans le BILAN)

**Situation** : Workspace A est entièrement traité (LanceDB A.slug nettoyé, SQL `document_vectors` vidé pour le docId), puis workspace B est traité — le `$transaction` de B peut réussir ou échouer.

```
LanceDB B.slug         : vec2 toujours présent ⚠️ — findMany retourne [] (SQL vidé par A)
document_vectors SQL   : supprimées (par A) ✅
workspace_documents B  : supprimée (par retry ou succès) ✅
```

**Formulation correcte** :
> *Vecteur LanceDB orphelin dans le namespace B* : un vecteur présent dans `LanceDB B.slug` sans ligne correspondante dans `document_vectors` SQL. **Ce vecteur est retourné dans les résultats de recherche** de workspace B jusqu'à nettoyage manuel.

**Note** : le terme "orphelin" est ici correct et symétrique au type 1 (mais dans le sens inverse : c'est le vecteur LanceDB qui survit, pas la ligne SQL).

---

#### État résiduel type 3 — `workspace_documents` transitoire (pendant retry)

**Situation** : Le `$transaction` de B échoue en première tentative ; le retry est en cours.

```
document_vectors SQL   : supprimées (par A) ⚠️ — B n'a plus de vecteurs SQL
workspace_documents B  : toujours présente ⚠️ — B pense encore posséder D
LanceDB B.slug         : vec2 toujours présent ⚠️
```

**Formulation correcte** :
> *Incohérence `workspace_documents` transitoire* : B croit posséder D (ligne SQL présente) mais ne dispose plus de vecteurs indexés (document_vectors vides). Un retry SQL peut corriger l'entrée `workspace_documents` mais **ne peut pas corriger le vecteur LanceDB orphelin**.

---

### 2.2 Statut de L-3 vis-à-vis du cas multi-workspace

Le BILAN L-3 dit :
> "purgeDocument workspace partiellement nettoyé sur exception à mi-parcours — Documentée — **retry sans effet secondaire**"

**L-3 est exact mais incomplet** pour le cas multi-workspace :

| Ce que L-3 décrit correctement | Ce que L-3 ne dit pas |
|-------------------------------|----------------------|
| Le retry SQL est sans danger (workspace A : `_getStrict` retourne null → skip) | Le retry ne peut pas corriger le vecteur LanceDB orphelin dans B.slug |
| Le retry SQL pour B peut réussir et supprimer `workspace_documents` | Après le retry, vec2 reste dans LanceDB et **est visible dans les résultats** |
| "Sans effet secondaire" = le retry n'aggrave pas la situation SQL | Le vecteur LanceDB orphelin est **permanent** sans intervention manuelle |

**Proposition de complément à L-3** (si décision de Florian de mettre à jour le BILAN) :

> L-3 (complété) : "purgeDocument workspace partiellement nettoyé sur exception à mi-parcours — Documentée — retry sans effet secondaire pour SQL. **Dans le cas multi-workspace, le vecteur LanceDB du namespace B n'est pas récupéré par le retry : il subsiste dans `LanceDB B.slug` et est retourné dans les résultats de recherche de B jusqu'à nettoyage manuel (risque fonctionnel, non limité au stockage).**"

---

### 2.3 Tableau de synthèse terminologique

| Cas | Entité orpheline | SQL orphelin ? | LanceDB orphelin ? | Visible dans résultats ? |
|-----|-----------------|---------------|-------------------|------------------------|
| L-1 par workspace (LanceDB OK + SQL échoue) | Lignes SQL (`document_vectors` + `workspace_documents`) | **Oui** ⚠️ | Non (vecteurs supprimés) | ❌ Non (vecteurs absents) |
| Multi-workspace (A traité + B LanceDB non nettoyé) | Vecteur dans `LanceDB B.slug` | Non (SQL vide par A) | **Oui** ⚠️ | **✅ Oui — risque fonctionnel** |
| `workspace_documents` transitoire (retry en attente) | Ligne `workspace_documents B` | Non (document_vectors vide) | **Oui** ⚠️ | **✅ Oui — jusqu'au retry** |

---

## Résumé exécutif

**Le vecteur LanceDB résiduel dans B.slug n'est pas un simple leak de stockage : c'est un risque fonctionnel.**

Les chunks du document D apparaîtront dans les réponses LLM pour toute requête sur workspace B qui dépasse le seuil de similarité, **même après purge complète** (workspace_documents supprimé, document_vectors supprimé, source supprimée). Ce risque persiste jusqu'à suppression manuelle de vec2 dans la table LanceDB B.slug.

**L-3 est exact mais ne couvre pas ce risque explicitement.** Une mise à jour de L-3 dans le BILAN permettrait de documenter cette limite résiduelle distinctement.

**Fichiers sources de cette conclusion :**

| Fichier | Lignes | Élément |
|---------|--------|---------|
| `candidate-lance-index-v4f.js` | 183–224 | `similarityResponse` — aucun filtre SQL |
| `candidate-lance-index-v4f.js` | 98–170 | `rerankedSimilarityResponse` — aucun filtre SQL |
| `candidate-lance-index-v4f.js` | 464–514 | `performSimilaritySearch` — aucun post-traitement SQL |
| `candidate-lance-index-v4f.js` | 548–562 | `curateSources` — reformatage uniquement |
| `candidate-documents.js` | 344 | Formulation "document_vectors rows may be orphaned" |
| `Livret-Technique-Serveur-IA.md` | §14.5 | Route `/v1/workspace/:slug/vector-search` = appel direct `performSimilaritySearch` |
| `BILAN-PUR02-E-2026-11-11.md` | L-1, L-3 | Terminologie de référence |

*Lecture seule. Aucun fichier modifié.*
