# Rapport de validation et décision — PUR-02 v5

*Produit par Claude Sonnet 4.6 le 2026-11-02*  
*Mission : audit technique autonome (mission ChatGPT 2026-11-02)*  
*Question centrale : PUR-02 v5 est-il justifié ? Si oui, qu'apporterait-il ?*

---

## 1. Rappel — État de PUR-02 v4

### 1.1 Validation acquise

| Critère | Résultat |
|---|---|
| Tests unitaires Jest 29 | **17/17 PASS** |
| Tests d'intégration (SQLite réel + LanceDB réel) | **9/9 PASS** (S01–S09) |
| Patch SHA-256 | `0cba6a1da13800fdd92411f3f8e9f83c611a45a2c57e017b7ce2a4de0baa79de` |
| Verdict du rapport de validation | **PRÊT POUR UN ESSAI ISOLÉ ✓** |
| Déploiement production | ❌ Non déployé |

### 1.2 Défauts adressés par v4

| Ref | Défaut | Statut v4 |
|---|---|---|
| PUR-02-A | `Workspace.where()` absorbe silencieusement les erreurs SQL | ✅ Corrigé |
| PUR-02-B | Mauvais ordre : cache/source supprimés avant les associations workspace | ✅ Corrigé |
| PUR-02-C | `$transaction` SQL manquant (delete + deleteMany non atomiques) | ✅ Corrigé |
| PUR-02-D | Singleton `LanceDb.#connection` — erreurs non propagées | ✅ Corrigé |
| PUR-02-E | `purgeFolder` manque de validation d'entrée et de contrôle sur sous-répertoires | ✅ Corrigé (abort sur sous-répertoire) |
| **L-1** | Non-atomicité résiduelle LanceDB + SQL | ❌ Limite architecturale — non résolue en v4 |

---

## 2. Ce que le lab apporte de différent pour `purgeFolder`

La version lab de `purgeDocument.js` (SHA `0717505ad08e8ff6...`, timestamp 26/10/2026) contient un `purgeFolder()` **récursif**, distinct du candidat v4.

### 2.1 Comparaison `purgeFolder` v4 vs lab

| Aspect | Candidat v4 | Version lab |
|---|---|---|
| Sous-répertoires | **Abort** : `fail(400, "UNSUPPORTED_FOLDER_ENTRY", ...)` sur `entry.isDirectory()` | **Récursion** : `collectFiles(fullPath)` |
| Collecte des fichiers | `for` séquentiel, liste plate dans `collectedFiles` | `collectFiles()` récursif, liste plate dans `filenames` |
| Nettoyage vecteurs/associations | Séquentiel avec tableau `cleanupErrors[]` | `Promise.all()` parallèle |
| Suppression dossier final | `unlinkSync` fichiers + `rmdirSync` dossier vide | `fs.rmSync({recursive:true})` |
| Validation d'entrée | ✅ `fail()` avec codes HTTP (400/403/404) | ✅ Identique |
| Liens symboliques | ✅ Rejeté (`lstatSync().isSymbolicLink()`) | ✅ Identique |

### 2.2 Analyse de la divergence

Le choix **abort vs récursion** sur les sous-répertoires est une décision de conception, pas un bug :

- **Candidat v4 — abort :** Cohérent avec l'architecture documentaire d'AnythingLLM où les documents sont stockés sur exactement 2 niveaux (`dossier/fichier.json`). Un sous-répertoire est une situation anormale. L'abort est défensif : il refuse de traiter un état inattendu.

- **Version lab — récursion :** Plus permissive. Permet de purger des arborescences imbriquées. Potentiellement utile si le stockage évolue ou si des sous-dossiers sont créés manuellement.

La référence dans `files-index.js` (lab) confirme la contrainte d'architecture :
> "document storage is exactly two segments (`folder/file.json`) and docpath, the embedding pipeline and the vector cache all assume that shape."

Dans ce contexte, **la récursion lab résout un problème qui ne devrait pas exister** dans une installation normale.

---

## 3. PUR-02 v5 est-il justifié ?

### 3.1 Arguments pour (v5 utile)

| Argument | Poids |
|---|---|
| Récursion lab plus robuste si sous-dossiers accidentels existent | Faible — cas non standard |
| `Promise.all()` lab plus performant sur grands dossiers | Marginal — cas rares |
| `fs.rmSync({recursive:true})` plus simple à maintenir | Faible — `unlinkSync`+`rmdirSync` v4 est explicite et contrôlé |
| Unification des deux versions en une seule | Faible — augmente la complexité sans bénéfice immédiat |

### 3.2 Arguments contre (v5 non justifié maintenant)

| Argument | Poids |
|---|---|
| PUR-02 v4 est **entièrement validé** (9/9 + 17/17) | Fort |
| La récursion lab n'a **pas de tests d'intégration** équivalents à S01–S09 | Fort |
| L'architecture AnythingLLM garantit 2 niveaux max — la récursion lab adresse un cas hors-spec | Fort |
| Un v5 nécessiterait une nouvelle campagne de validation complète | Fort |
| Le `purgeDocument()` lab est **non corrigé** (PUR-02-A/B) — fusionner lab et v4 introduit un risque de régression | Fort |
| L'objectif immédiat est l'essai isolé de v4, pas une nouvelle itération | Fort |

### 3.3 Risque spécifique à éviter

Si un v5 tentait de fusionner le `purgeFolder` récursif du lab avec le `purgeDocument()` de v4, il faudrait :
1. Extraire `_getWorkspacesStrict()` dans `purgeFolder` (appel indirect via `Workspace.where()` dans la version lab)
2. Corriger l'ordre du nettoyage dans `purgeFolder` (la version lab conserve l'ordre cache/vecteurs avant associations)
3. Réécrire les tests d'intégration S07/S08/S09 pour le cas récursif

Ce travail est non trivial et n'est pas justifié par un besoin avéré.

---

## 4. Décision

> **PUR-02 v5 n'est pas justifié à ce stade.**

PUR-02 v4 est le correctif validé et complet pour les défauts PUR-02-A à PUR-02-E. Le `purgeFolder` récursif du lab représente une amélioration défensive pour des cas hors-architecture standard. Il ne peut pas être intégré directement sans re-validation complète et sans corriger les défauts PUR-02-A/B qui restent présents dans la version lab.

La priorité reste :
1. **Essai isolé de PUR-02 v4** (candidats SHA `15fc2ee1...`, `de9c5860...`, `c826f004...`) — export depuis le lab, déploiement en environnement isolé, validation HTTP des scénarios S01–S09
2. **Obtenir l'autorisation de Florian** pour le déploiement production
3. **Traiter INT-18, INT-20, ALLM-12 séparément** (voir `RAPPORT-AUDIT-INT18-ALLM12.md`)

---

## 5. Conditions pour reconsidérer v5

PUR-02 v5 pourrait être justifié dans les cas suivants :

| Condition | Seuil |
|---|---|
| Des sous-répertoires sont effectivement présents dans le stockage documentaire de production | Vérification par `ls -la` dans le conteneur |
| L'essai isolé de v4 révèle un échec sur `purgeFolder` en conditions réelles | Résultats de l'essai isolé |
| Un besoin de purge récursive est explicitement exprimé pour un cas d'usage identifié | Décision de Florian |

En dehors de ces cas, la récursion est une optimisation prématurée vis-à-vis de l'architecture actuelle.

---

## 6. État résumé et prochaines étapes

| Élément | État | Action |
|---|---|---|
| PUR-02 v4 | ✅ Validé lab (9/9 + 17/17) | Essai isolé à planifier |
| L-1 (non-atomicité) | ❌ Limite architecturale | Documenter + surveiller lors de l'essai isolé |
| PUR-02 v5 | 🔴 **Non justifié** | Pas d'action |
| Lab `purgeFolder` récursif | ⚠️ Meilleure couverture cas hors-spec | Conserver en documentation pour référence |
| Déploiement production | ❌ En attente | Autorisation Florian + essai isolé réussi |

---

*Sources : `RAPPORT-VALIDATION-PUR-02-v4.md` (branche `correctif-PUR-02`) ; `candidate-purgeDocument.js` (branche `correctif-PUR-02`) ; `purgeDocument.js` lab (ZIP) ; `files-index.js` lab (ZIP) ; `RAPPORT-RECONCILIATION-PUR02.md` (produit dans cette session).*
