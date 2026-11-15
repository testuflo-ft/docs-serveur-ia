# PUR-02-E — Clarifications 2A/2B/2C (15/11/2026)
**Lecture seule. Aucun fichier candidat ni branch GitHub modifié.**

---

## 1. Décompte exact de Suite A

### Données brutes vérifiées

```
grep -c "^\s*test("   pur02-candidate-v4f.test.js  → 22
grep -c "describe("   pur02-candidate-v4f.test.js  → 20
```

### Structure : 20 describe() → 22 test()

| describe() | Lignes test() | Nombre de tests |
|------------|--------------|----------------|
| Scenario 1  | 210 | 1 |
| Scenario 2  | 242 | 1 |
| Scenario 3  | 272 | 1 |
| Scenario 4  | 306 | 1 |
| Scenario 5  | 356 | 1 |
| **Scenario 5b** | 429, 437, 445 | **3** |
| Scenario 5c | 458 | 1 |
| Scenario 5d | 503 | 1 |
| Scenario 6  | 548 | 1 |
| Scenario 7  | 614 | 1 |
| Scenario 8  | 677 | 1 |
| Scenario 9  | 736 | 1 |
| Scenario 10 | 775 | 1 |
| Scenario 11 | 817 | 1 |
| Scenario 12 | 861 | 1 |
| Scenario 13 | 910 | 1 |
| Scenario 14 | 975 | 1 |
| Scenario 15 | 1021 | 1 |
| Scenario 16 | 1083 | 1 |
| Scenario 17 | 1148 | 1 |
| **Total**   |     | **22** |

**19 describe() à 1 test + 1 describe() (5b) à 3 tests = 22 tests.** ✅

### Erreurs du tableau de couverture dans le rapport 2A/2B/2C

Le tableau "Couverture par composant" annonçait 4+12+4+4 = 24 — incorrect.

| Composant | Scénarios | Tests (correct) | Tests (rapport) | Erreur |
|-----------|-----------|----------------|-----------------|--------|
| `removeDocuments` | 1,2,3,4 | **4** | 4 | — |
| `purgeFolder` | 5, 5b(×3), 5c, 5d, 6, 7, 13, 15, 16 | **11** | 12 | +1 |
| `purgeDocument` | 8, 14, 17 | **3** | 4 | +1 |
| `deleteDocumentFromNamespace` | 9,10,11,12 | **4** | 4 | — |
| **Total** | | **22** | 24 | **+2** |

Les deux erreurs :
1. `purgeFolder` : j'ai compté 12 au lieu de 11 (Sc. 5b compte 3 tests mais la ligne de couverture avait un test en trop).
2. `purgeDocument` : j'ai écrit "Sc. 8, 14, 17 (×2)" — Sc. 17 n'a qu'1 seul test, le "(×2)" était une erreur de rédaction.

### Correspondance table de scénarios / test() (22 lignes)

| Ligne table | Scénario | test() line |
|-------------|----------|-------------|
| 1  | Sc. 1  | 210 |
| 2  | Sc. 2  | 242 |
| 3  | Sc. 3  | 272 |
| 4  | Sc. 4  | 306 |
| 5  | Sc. 5  | 356 |
| 5b-1 | Sc. 5b | 429 |
| 5b-2 | Sc. 5b | 437 |
| 5b-3 | Sc. 5b | 445 |
| 6  | Sc. 5c | 458 |
| 7  | Sc. 5d | 503 |
| 8  | Sc. 6  | 548 |
| 9  | Sc. 7  | 614 |
| 10 | Sc. 8  | 677 |
| 11 | Sc. 9  | 736 |
| 12 | Sc. 10 | 775 |
| 13 | Sc. 11 | 817 |
| 14 | Sc. 12 | 861 |
| 15 | Sc. 13 | 910 |
| 16 | Sc. 14 | 975 |
| 17 | Sc. 15 | 1021 |
| 18 | Sc. 16 | 1083 |
| 19 | Sc. 17 | 1148 |

**22 lignes dans la table = 22 test() déclarés.** Le tableau principal du rapport 2A/2B/2C était juste
(22 lignes) ; la faute était dans le sous-tableau de couverture (24 ≠ 22).

---

## 2. Terminologie SQL/LanceDB — orphelins

### Situation à clarifier (Scénario 4 / L-1)

Quand, **pour un workspace donné**, LanceDB réussit puis SQL échoue :
- LanceDB : vecteurs **supprimés** (nettoyés avec succès)
- SQL `document_vectors` : lignes toujours présentes (elles référencent des IDs qui n'existent plus dans LanceDB)
- SQL `workspace_documents` : ligne toujours présente

Les lignes SQL survivent alors que leur contrepartie LanceDB est déjà effacée.
Ce sont donc les **enregistrements SQL qui sont orphelins** — pas les vecteurs.

### Terminologie cohérente avec le code et le BILAN

**Dans `candidate-documents.js` (ligne 344) :**
> `document_vectors rows for docId X may be orphaned`

Exact : les lignes SQL `document_vectors` pointent vers des vectorId que LanceDB ne contient plus.

**Dans BILAN L-1 :**
> `Non-atomicité LanceDB/SQL — vecteurs supprimés, SQL orphelins possibles`

Exact : "vecteurs supprimés" (LanceDB nettoyé) + "SQL orphelins" (lignes SQL subsistantes).

### Erreur dans le rapport 2A/2B/2C

Le rapport avait écrit "⚠️ vecteurs orphelins" dans la ligne correspondant à ce cas.
C'est **inversé** : les vecteurs sont supprimés ; ce sont les lignes SQL qui sont orphelines.

### Formulation homogène proposée

| Situation | Terme correct |
|-----------|--------------|
| LanceDB OK + SQL échoue (Sc. 4 / L-1) | **lignes SQL orphelines** (`document_vectors` et `workspace_documents`) |
| Multi-workspace : workspace A entièrement traité → `document_vectors` SQL vidés → workspace B : LanceDB non nettoyé | **vecteur LanceDB orphelin dans le namespace de B** (voir §3) |

Ces deux cas sont distincts et symétriques. L-1 dans le BILAN désigne le premier cas.
Le deuxième (spécifique au multi-workspace) n'est pas nommé explicitement dans le BILAN — il est
couvert implicitement par L-3 ("retry sans effet secondaire" = le vecteur orphelin LanceDB subsiste
mais ne nuit pas à la cohérence fonctionnelle).

---

## 3. Purge multi-workspace — analyse complète

### Modèle de données (établi depuis le code)

```
workspace_documents : (id, docpath, workspaceId, docId)   — 1 ligne par (workspace × document)
document_vectors    : (vectorId, docId)                    — vectorId par docId, tous workspaces confondus
LanceDB namespace   : table par workspace.slug             — vectorId par table (namespace)
```

**Point critique** : `removeDocuments` utilise `document_vectors.deleteMany({where:{docId}})`.
Cette requête supprime **toutes** les lignes `document_vectors` pour ce docId, tous workspaces confondus —
même si les vecteurs LanceDB correspondants appartiennent au namespace d'un autre workspace.

### État initial

Document D (docId=X) est dans workspace A et workspace B.

```
workspace_documents : rowA (workspaceId=A, docId=X), rowB (workspaceId=B, docId=X)
document_vectors    : {vectorId: vec1, docId: X}  ← vecteur de A.slug
                      {vectorId: vec2, docId: X}  ← vecteur de B.slug
LanceDB A.slug      : vec1 ✅
LanceDB B.slug      : vec2 ✅
Source file         : présent
```

### Déroulement : workspace A RÉUSSIT, workspace B ÉCHOUE en étape 2 (LanceDB)

**Workspace A — étape 2 (LanceDB) :**
- `deleteDocumentFromNamespace(A.slug, X)` → `findMany({docId:X})` → [vec1, vec2]
- `A.table.delete("id IN ('vec1','vec2')")` → vec1 supprimé ✅ ; vec2 non présent dans A.slug
  → **comportement LanceDB sur ID inexistant : no-op** (hypothèse raisonnable, non vérifié sur le LanceDB utilisé)
- LanceDB A.slug : vec1 disparu ✅

**Workspace A — étape 3 (SQL) :**
- `$transaction` : `workspace_documents.delete(rowA)` + `document_vectors.deleteMany(docId=X)` → ✅
- SQL `document_vectors` : **vidé pour docId=X** (vec1 ET vec2 supprimés)
- SQL `workspace_documents` : rowA supprimée

**Workspace B — étape 2 (LanceDB) :**
- `deleteDocumentFromNamespace(B.slug, X)` → `findMany({docId:X})` → **[]** (vidé par A étape 3)
- Retourne `true` sans appeler `table.delete`
- LanceDB B.slug : **vec2 toujours présent** ⚠️

**Workspace B — étape 2 ÉCHOUE** (hypothèse remplacée : on suppose que c'est ici que ça échoue pour B)

Mais dans ce cas précis : findMany retourne [] → retourne true → pas d'échec possible à l'étape 2 pour B.
L'échec de B ne peut donc intervenir qu'à l'étape 1 (SQL read) ou à l'étape 3 (SQL write).

### Tableau des états selon le point d'échec de B

| Point d'échec de B | workspace_documents | document_vectors SQL | LanceDB A.slug | LanceDB B.slug | Source |
|--------------------|---------------------|---------------------|----------------|----------------|--------|
| Étape 1 (SQL read) | rowA ❌, rowB ✅ | vec1+vec2 ❌ | vec1 ❌ | vec2 ✅ | ✅ |
| Étape 3 (SQL write) | rowA ❌, rowB ✅ | vec1+vec2 ❌ | vec1 ❌ | vec2 ✅ | ✅ |
| (Pas d'échec — B réussit) | rowA ❌, rowB ❌ | vec1+vec2 ❌ | vec1 ❌ | vec2 ✅ | ❌ (purge complète) |

> ❌ = supprimé/absent ; ✅ = présent/intact

### Constat : trois stockages ne sont pas dans le même état

**Après A réussit + B échoue (étape 1 ou 3) :**

| Stockage | État |
|----------|------|
| `workspace_documents` pour A | Nettoyé ✅ |
| `workspace_documents` pour B | Toujours présent ⚠️ (B pense posséder D) |
| `document_vectors` pour docId=X | **Entièrement vides** (supprimés par A) ⚠️ |
| LanceDB A.slug | Nettoyé ✅ |
| LanceDB B.slug | vec2 **toujours présent** ⚠️ |
| Source file | Préservé ✅ |

### Atomicité globale multi-workspace : absente

`purgeDocument` n'est pas atomique sur l'ensemble des workspaces. Chaque `removeDocuments`
est appelé séquentiellement dans une boucle. Le succès de A n'est pas lié transactionnellement
à celui de B.

### Retentative (retry)

Que se passe-t-il si on réappelle `purgeDocument` sur le même fichier ?

**Pour workspace A :**
- `_getStrict({docpath, workspaceId: A.id})` → null (rowA supprimée) → **skip** ✅

**Pour workspace B :**
- `_getStrict({docpath, workspaceId: B.id})` → retourne rowB (toujours présente) ✅
- Étape 2 : `findMany({docId:X})` → [] (vidé) → `deleteDocumentFromNamespace` → true (no-op)
- Étape 3 : `workspace_documents.delete(rowB)` + `document_vectors.deleteMany(0 lignes)` → peut réussir ✅

**Résultat d'un retry réussi :**
- rowB supprimée ✅
- Source supprimée ✅ (si le retry complet réussit)
- LanceDB B.slug : **vec2 toujours présent** ❌ — le retry ne peut pas corriger cet état car `findMany` retourne [] depuis la première tentative

**Le vecteur LanceDB orphelin dans B.slug est permanent** et ne peut être corrigé que manuellement
(en supprimant vec2 de la table B.slug via LanceDB). Il n'affecte pas la cohérence fonctionnelle :
B n'a plus de `workspace_documents` pour D, donc D n'apparaîtra jamais dans les résultats de B.
C'est un **leak de stockage LanceDB**, pas une corruption de données.

### Synthèse des trois propriétés

| Propriété | État |
|-----------|------|
| **Préservation de la source** | ✅ Garantie si A ou B échoue avant que les deux réussissent |
| **Cohérence SQL/LanceDB par workspace** | ⚠️ Partielle — le workspace A est cohérent ; B possède une entrée LanceDB sans SQL (`document_vectors` vidé, vec2 LanceDB subsiste) |
| **Atomicité globale multi-workspace** | ❌ Absente — succès de A n'est pas lié transactionnellement au succès de B |

Cette limite est documentée dans le BILAN comme **L-3** ("retry sans effet secondaire") et est
acceptée comme limite résiduelle. L-3 décrit correctement le retry SQL mais ne dit pas que le
vecteur LanceDB orphelin dans B.slug est récupérable — il ne l'est pas automatiquement.

---

## 4. Dépendance de livraison — trois composants / deux branches

### Répartition actuelle sur GitHub

| Composant | Branche GitHub | Statut |
|-----------|---------------|--------|
| `candidate-purgeDocument-v4e.js` | `main` | HEAD `22a15eff` (14/11) |
| `candidate-documents.js` | `correctif-PUR-02` | HEAD `d156f237` (08/11) |
| `candidate-lance-index-v4f.js` | `correctif-PUR-02` | HEAD `d156f237` (08/11) |

### Versions constituant le candidat de livraison

| Fichier candidat | SHA-256 (confirmé) | Remplace dans le serveur |
|------------------|--------------------|--------------------------|
| `candidate-purgeDocument-v4e.js` | `90a21b04…` | `server/utils/files/purgeDocument.js` |
| `candidate-documents.js` | `de9c5860…` | `server/models/documents.js` |
| `candidate-lance-index-v4f.js` | `8103f042…` | `server/utils/vectorDbProviders/lance/index.js` |

Ces trois empreintes sont celles validées lors de la campagne 60/60 + 4 E2E du 10/11/2026.
**Aucune modification intermédiaire n'a eu lieu depuis** (vérifié par git diff le 14/11/2026 : 0 ligne de diff local/distant).

### Garantir que les trois composants sont dans le même build

**Problème** : les deux branches (`main` et `correctif-PUR-02`) ont des historiques divergents.
Un `merge` naïf de l'une dans l'autre ne livrerait qu'une partie du correctif.

**Conséquences d'un déploiement partiel :**

| Composants déployés | Risque résiduel |
|---------------------|----------------|
| `purgeDocument-v4e` seul (sans documents.js ni lance-index-v4f) | `removeDocuments` original absorbe silencieusement les erreurs LanceDB → la source peut être détruite malgré une défaillance LanceDB (régressif) |
| `documents.js` + `lance-index-v4f` seuls (sans purgeDocument-v4e) | `purgeDocument` original supprime cache+source avant les associations → aucune amélioration sur la préservation de la source |
| Tout le correctif ensemble | ✅ Garanties complètes (60/60 + 4 E2E) |

### Faisabilité d'un déploiement atomique dans l'architecture actuelle

L'image Docker est construite depuis une branche unique (`main`, vraisemblablement) par `docker build`.
Deux approches permettent de livrer les trois composants ensemble :

**Option A — Merge de `correctif-PUR-02` dans `main` avant build**
- Simple, mais crée un commit de merge avec les deux composants de `correctif-PUR-02` dans `main`
- Risque : si d'autres fichiers de `correctif-PUR-02` ne doivent pas être dans `main`, un cherry-pick est préférable

**Option B — Cherry-pick des deux fichiers depuis `correctif-PUR-02` vers `main`**
- `git cherry-pick` ou copie manuelle de `candidate-documents.js` et `candidate-lance-index-v4f.js` dans `main`
- Préserve la séparation des branches pour la lisibilité
- Après le cherry-pick, `main` contient les trois candidats → `docker build` depuis `main` ✅

**Option C — Docker multi-stage avec COPY depuis les deux branches**
- Techniquement possible (cloner les deux branches et copier les fichiers dans l'image) mais complexifie le Dockerfile
- Non recommandé sauf contrainte spécifique

**Recommandation** : Option B (cherry-pick ciblé vers `main`), sous réserve de décision Florian sur D-déploiement.

> **Note** : toute action GitHub reste soumise à la contrainte "Aucune modification GitHub sans
> validation explicite de Florian". Cette section est une analyse, pas une instruction d'action.

---

## 5. Recommandations motivées pour D-2A-1, D-2A-2, D-2C-1

### D-2A-1 — Régression `documentsPath root check` (v3 → v4e)

**Rappel :** v3 ajoute avant toute opération filesystem :
```js
const rootStat = fs.lstatSync(documentsPath);
if (rootStat.isSymbolicLink() || !rootStat.isDirectory())
  fail(500, "INVALID_DOCUMENTS_ROOT", "...");
```
v4e omet cette vérification. `documentsPath` est une constante définie dans `index.js` (non controllable par l'appelant HTTP).

**Option A — Accepter la régression**
- Impact pratique : quasi-nul. `documentsPath` est une constante système ; un déploiement avec un lien symbolique à cet endroit serait une erreur de configuration, pas une entrée malveillante.
- Avantage : aucune modification du candidat ; empreintes inchangées ; aucun test à ajouter.
- Inconvénient : v4e est formellement moins robuste que v3 sur ce point. La garantie documentée en v3 disparaît sans explication dans le changelog.

**Option B — Réintégrer la vérification dans v4e**
- La vérification s'insère naturellement avant le `readdirSync(documentsPath)` existant (ligne 186 de v4e), en utilisant `folderError(500, "INVALID_DOCUMENTS_ROOT", "...")`.
- Code à ajouter : 3 lignes. Comportement identique à v3.
- Conséquence : empreinte de `candidate-purgeDocument-v4e.js` change → nouveau SHA-256 → le BILAN et CLAUDE.md doivent être mis à jour.
- Un nouveau test de couverture pour `INVALID_DOCUMENTS_ROOT` devrait être ajouté à Suite A ou Suite C.
- Avantage : v4e est un strict sur-ensemble des garanties de v3 (aucune régression).

**Recommandation : Option B.** L'ajout est minime (3 lignes), préserve la cohérence avec v3, et évite qu'un déploiement sur un système exotique se comporte silencieusement de manière inattendue. Le coût (nouveau SHA, 1 test supplémentaire) est proportionnel au bénéfice.

**Prérequis si Option B retenue :** modification du candidat nécessite une nouvelle campagne de tests (au moins Suite A + test unitaire INVALID_DOCUMENTS_ROOT). La contrainte "Ne modifier aucun candidat" est suspendue uniquement pour cette modification spécifique et sur décision explicite de Florian.

---

### D-2A-2 — Commentaire stale (scénarios 9/10, en-tête Suite A)

**Rappel :** lignes 24-25 du fichier disent `returns false` mais les assertions réelles sont `toBe(true)`.
Le BILAN documente ceci (I-2). La correction est purement cosmétique : remplacer deux chaînes de texte dans un commentaire.

**Option A — Laisser tel quel**
- Documenté dans BILAN I-2.
- Risque : un lecteur futur qui ne connaît pas le BILAN sera induit en erreur par l'en-tête.
- Avantage : aucune modification du fichier de test, empreinte inchangée (`773fbe04…`).

**Option B — Corriger les deux lignes du commentaire**
- Modifier uniquement les lignes 24 et 25 : `returns false` → `returns true`.
- Aucun impact sur les assertions ni sur les tests eux-mêmes.
- Empreinte de `pur02-candidate-v4f.test.js` change → la note dans CLAUDE.md indiquant "absent de GitHub" devient caduque si le fichier est republié.

**Recommandation : Option B, sous réserve que Florian publie le fichier de test.** La correction est sans risque. Si le fichier reste sur le Mac de Florian uniquement et n'est pas publié, Option A est acceptable (l'incohérence est déjà documentée dans le BILAN, qui est publié).

---

### D-2C-1 — Nom de fichier `candidate-lance-index.js` vs `candidate-lance-index-v4f.js`

**Rappel :** le test charge le candidat LanceDB via :
```js
const CANDIDATE_LANCE = path.join(SCRATCHPAD, "candidate-lance-index.js");
```
Le fichier publié s'appelle `candidate-lance-index-v4f.js`.

**Option A — Renommer le candidat LanceDB**
- `candidate-lance-index-v4f.js` → `candidate-lance-index.js`
- Empreinte du fichier inchangée (c'est le même contenu), mais son nom dans GitHub et CLAUDE.md change.
- Perd la clarté sémantique du suffixe `-v4f` (qui indique la version corrigée).
- **Non recommandé** : conforme à l'orientation de Florian.

**Option B — Modifier le chemin dans le fichier de test**
- Changer la ligne 168 de `pur02-candidate-v4f.test.js` :
  `"candidate-lance-index.js"` → `"candidate-lance-index-v4f.js"`
- Empreinte du test change → nouvelle valeur `773fbe04…` invalidée.
- Simple, 1 caractère.

**Option C — Lien symbolique (prérequis d'exécution, pas de modification de fichier)**
- Avant d'exécuter Suite A, créer `candidate-lance-index.js → candidate-lance-index-v4f.js`
- Aucun fichier source modifié, aucune empreinte changée.
- Prérequis documenté dans le livret ou le README de la suite de tests.

**Option D — Statu quo documenté**
- Documenter que l'exécution de Suite A nécessite de renommer ou lier `candidate-lance-index-v4f.js` avant `jest`.
- Aucune modification de fichier.

**Recommandation : Option C (symlink) ou Option D (documentation).** Option B serait la plus propre techniquement (aligner le test sur le nom canonique) mais invalide l'empreinte. Option C ne touche à rien, est réversible, et ne modifie aucun candidat. Option D est suffisante si Suite A n'est pas réexécutée dans l'immédiat.

---

## Synthèse des décisions

| Décision | Recommandation | Coût si retenu |
|----------|---------------|----------------|
| D-2A-1 (root check) | **Option B** — réintégrer | Nouveau SHA v4e, nouvelle campagne tests |
| D-2A-2 (commentaire stale) | **Option B** — corriger si publié ; Option A sinon | Nouveau SHA `pur02-candidate-v4f.test.js` |
| D-2C-1 (nom lance-index) | **Option C** (symlink, pas de modif) ou D (doc) | Aucun |

---

*Lecture seule. Aucun fichier modifié. Sources : fichiers lus localement + grep de vérification.*
