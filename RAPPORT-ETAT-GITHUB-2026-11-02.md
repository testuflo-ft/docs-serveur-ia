# Rapport — État GitHub au 2 novembre 2026

*Produit par Claude Sonnet 4.6 le 2026-11-02*  
*Mission : audit technique autonome (mission ChatGPT 2026-11-02)*  
*Périmètre : dépôt `testuflo-ft/docs-serveur-ia`, branches `main` et `correctif-PUR-02`, fichiers lab ZIP*

---

## 1. Branches distantes observées

| Branche | Dernier commit | Date | Note |
|---|---|---|---|
| `main` | `a39e7f8` | 2026-11-02 07:29 +08 | Branche de référence documentation |
| `correctif-PUR-02` | `50203a9` | 2026-11-01 17:53 +08 | Candidats code + rapport de validation |

### Branche locale uniquement
| Branche | Commit | Créé | État |
|---|---|---|---|
| `docs/mise-a-jour-2026-11-01` | `78b4c60` | 2026-11-01 | **Non poussée** — accès GitHub en écriture non disponible dans cette session |

---

## 2. Contenu de la branche `main`

Commit de tête : `a39e7f868970b66c00c83644f343b9948615ffb0`  
3 fichiers présents :

| Fichier | Version | Description |
|---|---|---|
| `Livret-Technique-Serveur-IA.md` | v0.8 | Livret technique AnythingLLM v1.19.0 — mis à jour 2026-11-01 |
| `Journal-des-Incidents.md` | v1.0 | Journal des incidents — mis à jour 2026-11-01 |
| `Tableau-de-bord-correctifs-2026-11-01.md` | v1.0 | Tableau de bord des correctifs — nouveau fichier 2026-11-01 |

Ces 3 fichiers ont été téléversés manuellement par Florian via l'interface web GitHub le 2026-11-01, suite à l'échec du push depuis la session Claude (token GH_TOKEN invalide).

**Fichier absent de `main` :** `PUR-02-livraison.md` — présent uniquement dans `docs/mise-a-jour-2026-11-01` (local) et dans `correctif-PUR-02`.

---

## 3. Contenu de la branche `correctif-PUR-02`

Commit de tête : `50203a9ce37384a9ad859ef7f7c10957885cf363`  
10 fichiers présents, répartis sur 5 commits (tous "Add files via upload") :

### Fichiers de code candidats (correctif PUR-02 v4)

| Fichier | SHA-256 | Lignes | Objet |
|---|---|---|---|
| `candidate-purgeDocument.js` | `15fc2ee1ae93b212...` | ~232 | `purgeDocument()` + `purgeFolder()` v4 |
| `candidate-documents.js` | `de9c586043cbf63f...` | 504 | `Document._getStrict()` + `removeDocuments()` v4 |
| `candidate-lance-index.js` | `c826f004f1761c20...` | 559 | `LanceDb.deleteDocumentFromNamespace()` v4 |

### Fichiers de test et patch

| Fichier | SHA-256 | Description |
|---|---|---|
| `pur02-candidate.test.js` | (non calculé) | Suite Jest — 17 tests unitaires PUR-02 v4 |
| `PUR-02-patch-complet.diff` | `0cba6a1da1380...` | Diff unifié 3 fichiers (lance, documents, purgeDocument) |

### Documentation

| Fichier | Description |
|---|---|
| `PUR-02-livraison.md` | Fiche de livraison PUR-02 v4 |
| `RAPPORT-VALIDATION-PUR-02-v4.md` | Rapport de validation : 9/9 intégration + 17/17 unitaires |
| `Plan-correctifs-AnythingLLM-1.17.0-v0.6-2026-10-28.md` | Plan v0.6 (version antérieure) |
| `Journal-des-Incidents-v0.9-2026-10-28.md` | Journal v0.9 (version antérieure) |
| `Livret-Technique-Serveur-IA-v0.7-2026-10-28.md` | Livret v0.7 (version antérieure) |

---

## 4. Fichiers lab (ZIP fourni par Florian, 2026-11-02)

5 fichiers extraits du conteneur `anythingllm-fixlab` et transmis en ZIP.  
**Ces fichiers n'existent pas dans aucune branche GitHub.**

| Fichier lab | SHA-256 | Timestamp | Chemin dans le conteneur |
|---|---|---|---|
| `purgeDocument.js` | `0717505ad08e8ff6...` | 2026-10-26 13:28 | `/app/server/utils/files/purgeDocument.js` |
| `api-document-index.js` | `b9c901945162631a...` | 2026-10-26 13:28 | `/app/server/endpoints/api/document/index.js` |
| `files-index.js` | `959ee973681994...` | 2026-10-25 21:51 | `/app/server/utils/files/index.js` |
| `endpoints-system.js` | `0f7d5db7accd68c5...` | 2026-10-28 12:56 | `/app/server/endpoints/system.js` |
| `api-system-index.js` | `825b898eed93569d...` | 2026-10-28 12:56 | `/app/server/endpoints/api/system/index.js` |

**Observation sur les timestamps :**  
Les fichiers lab couvrent trois dates d'extraction distinctes, ce qui indique que les correctifs ont été développés en plusieurs itérations dans le conteneur lab :
- 25/10 : `files-index.js` — correctif INT-18 pour `moveProcessedDocsToFolder`
- 26/10 : `purgeDocument.js` + `api-document-index.js` — `purgeFolder` amélioré + route API
- 28/10 : `endpoints-system.js` + `api-system-index.js` — correctifs ALLM-12 + INT-20

---

## 5. Relation entre les sources

```
BRANCHE main
  └── Documentation de production (v0.8 / v1.0 / Tableau v1.0)
  
BRANCHE correctif-PUR-02
  ├── Candidats v4 (3 fichiers code) — cible : PUR-02-A à PUR-02-E
  ├── Tests + patch diff (SHA 0cba6a1da1...)
  └── Documentation antérieure (v0.7 / v0.9)
  
BRANCHE LOCALE docs/mise-a-jour-2026-11-01 [non poussée]
  └── PUR-02-livraison.md (+ copie des 3 docs de main)
  
FICHIERS LAB [hors GitHub]
  ├── purgeDocument.js — purgeFolder amélioré (récursif) + purgeDocument() ORIGINAL
  ├── api-document-index.js — route DELETE /v1/document/remove-folder
  ├── files-index.js — moveProcessedDocsToFolder pré-validé
  ├── endpoints-system.js — DELETE /system/remove-folder + GET /env-dump [validApiKey]
  └── api-system-index.js — GET /v1/system/env-dump [validApiKey]
```

**Point critique :** Les fichiers lab et les candidats v4 ciblent des défauts **différents** et sont issus de développements parallèles. Ils ne sont pas interchangeables.

---

## 6. Ce qui manque dans GitHub

| Élément | État |
|---|---|
| Fichiers lab (5) | Non présents dans aucune branche — uniquement dans le ZIP Florian |
| `PUR-02-livraison.md` v4 | Dans branche `correctif-PUR-02` et local `docs/mise-a-jour-2026-11-01`, absent de `main` |
| Rapports de la mission 2026-11-02 (ce rapport + 3 autres) | À produire — pas encore dans GitHub |
| Branche `docs/mise-a-jour-2026-11-01` | Commit local `78b4c60` non poussé |

---

*Sources : `git ls-tree`, `git log`, `git show`, `sha256sum` — exécutés dans cette session Claude le 2026-11-02.*
