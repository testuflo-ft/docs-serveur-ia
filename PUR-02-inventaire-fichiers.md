# PUR-02 — Inventaire des fichiers et log de provenance SHA-256

**Date** : 2026-11-11  
**Répertoire de référence** : `docs-serveur-ia/`  
**Statut** : INVENTAIRE POST-E2E — publication initiale effectuée sur `main` (commit `11f188a1…`, 2026-11-11) — toute correction ou nettoyage requiert autorisation Florian

---

## 1. Fichiers de référence (sources v1.19.0)

Copies de laboratoire des fichiers de production AnythingLLM 1.19.0.  
**Usage** : comparaison diff candidats/référence, vérification de non-régression.

| Fichier | Chemin relatif | SHA-256 | Origine |
|---|---|---|---|
| `purgeDocument.js` | `pur02-sources-1.19.0/purgeDocument.js` | `f6dda7152e476a6078533a8c06f458204d36c2abd550b08bbf69c8ccf232727a` | Copie lab PUR-02-lab-20261029 |
| `api-document-index.js` | `pur02-sources-1.19.0/api-document-index.js` | `b9c901945162631a685bff039e5df4b3ebc875c7408d93eab66217e5066ddb89` | Copie lab PUR-02-lab-20261029 |
| `endpoints-system.js` | `pur02-sources-1.19.0/endpoints-system.js` | `0f7d5db7accd68c54a9ac0e884329a29a6e2f25b288c56030d3f24bb77142b19` | Copie lab PUR-02-lab-20261029 |
| `files-index.js` | `pur02-sources-1.19.0/files-index.js` | `959ee973681994076402031a6d59d6eafd3cdb1b83589103f56f42f6115ff70f` | Copie lab PUR-02-lab-20261029 |

> **Note** : Ces fichiers proviennent de la branche `correctif-PUR-02` (créée fin octobre 2026). Leurs SHA-256 ont été vérifiés identiques à l'officiel AnythingLLM 1.19.0 lors de la création du lab. Ne pas modifier.

---

## 2. Candidats techniques actifs (PUR-02-E — composants du correctif)

Les trois fichiers à déployer ensemble pour appliquer PUR-02-E.  
**Statut : VALIDÉS — 60/60 tests + 4 E2E PASS — NON DÉPLOYÉS**

| Fichier candidat | Fichier de destination (v1.19.0) | SHA-256 (vérifié 2026-11-11) | Version |
|---|---|---|---|
| `candidate-purgeDocument-v4e.js` | `server/utils/files/purgeDocument.js` | `90a21b0488dfd78ee744b35ae02cd9a6b1e629ead17a88cec5bda49ae4875f79` | v4e + fix#1b |
| `candidate-documents.js` | `server/models/documents.js` | `de9c586043cbf63f70c4070cc18bc2f0871bc3a8b1d8caa79f32248fba8152eb` | v4 |
| `candidate-lance-index-v4f.js` | `server/utils/vectorDbProviders/lance/index.js` | `8103f042a0fed63db1d6f79db61ceb6eef97687e87893bec9747abe1d2c9149f` | v4f |

> **Important** : fix#1b (vérification pré-normalisation → `FOLDER_NAME_INVALID`) concerne **uniquement** `candidate-purgeDocument-v4e.js`. LanceDB v4f est un correctif distinct et indépendant.

---

## 3. Suites de tests canoniques

| Fichier | Rôle | SHA-256 (vérifié 2026-11-11) | Statut |
|---|---|---|---|
| `pur02-candidate.test.js` | Suite A unitaire — **OBSOLÈTE** (scénarios 9/10 → `false`) | `f3e88f13165dc273749284c18750f9c745d8194a3f8e635664d18f24dbab8cbf` | ⚠️ OBSOLÈTE — remplacée par `pur02-candidate-v4f.test.js` |
| `pur02-http-handler.test.js` | Suite B — handlers HTTP (purgeFolder mocké) | `cb9702bdddcadd126487f1e5e5397075cb7a4a2a7b5144c93285819a694eff55` | ✅ Canonique |
| `pur02-path-security.test.js` | Suite C — sécurité chemins (fonctions reproductibles) | `89e32abc8c171b0aa7ad14cc90d49b614534e249c3e64f85d2fbabc6712d7921` | ✅ Canonique |
| `pur02-lance-v4f.test.js` | Suite L/R — LanceDB v4f | `11d835b2eb1ed91b97ac6c9be6f9fae7bb5c585fbe0dd70ae7e306c65917a465` | ✅ Canonique |

**Suite canonique A (non présente localement — résultat E2E uniquement) :**

| Fichier | SHA-256 | Statut |
|---|---|---|
| `pur02-candidate-v4f.test.js` | `773fbe04198bc45d5bc8daea435101fc9cb5461c223d319ce27afdd99a77e06e` | ✅ Canonique — scénarios 9/10 → `true` |

> **Note** : `pur02-candidate-v4f.test.js` a été utilisée pour les tests simulés 60/60 (pas dans le laboratoire E2E lui-même, qui était distinct). Elle n'est pas présente dans le répertoire local ni sur aucune branche GitHub vérifiée. Son SHA-256 est fourni par ChatGPT à partir du rapport de session du 2026-11-10 et n'a pas été vérifié localement (lab détruit).

> **Limite de traçabilité** : aucun journal Jest persistant du run 60/60 n'a été retrouvé permettant de démontrer rétrospectivement la correspondance exacte entre chaque fichier, son empreinte SHA-256 et ce run. Ne pas présenter les SHA des suites comme une preuve certifiée du run.

> **Distinction SHA-256 fichier / Git blob SHA** : les SHA-256 listés dans cet inventaire sont des empreintes de contenu de fichier (`sha256sum`), **pas** des Git blob SHA. Ces deux empreintes sont différentes pour le même fichier.

---

## 4. Doublons identifiés

| Fichier | Doublon de | Remarque |
|---|---|---|
| `candidate-lance-index.js` (SHA `c826f004…`) | Supersédé par `candidate-lance-index-v4f.js` | Ancienne version v4 — ne pas déployer |

---

## 5. Fichiers obsolètes

| Fichier | Raison | Action recommandée |
|---|---|---|
| `pur02-candidate.test.js` (SHA `f3e88f13…`) | Suite A adaptée : scénarios 9/10 → `false` incorrect depuis v4f | Archiver ou supprimer — remplacée par `pur02-candidate-v4f.test.js` |
| `candidate-lance-index.js` (SHA `c826f004…`) | LanceDB v4 supersédé par v4f | Archiver ou supprimer après autorisation |

---

## 6. Pièces d'archive et de preuve

Rapports de validation et d'audit produits pendant le développement de PUR-02.  
**Usage** : traçabilité, référence historique, ne pas modifier.

| Fichier | Contenu | Date |
|---|---|---|
| `RAPPORT-VALIDATION-PUR-02.md` | Validation v3/v4 initiale | Oct 2026 |
| `Contre-audit-PUR02-rapports-Claude-2026-11-02.md` | Contre-audit indépendant | 2026-11-02 |
| `RAPPORT-AUDIT-PUR-02-E-v4e-2026-11-04.md` | Rapport audit v4e + fix#1b (ChatGPT) | 2026-11-04 |
| `RAPPORT-AUDIT-INT18-ALLM12.md` | Audit INT-18 et ALLM-12 | Oct 2026 |
| `RAPPORT-ETAT-GITHUB-2026-11-02.md` | État GitHub branches au 02/11 | 2026-11-02 |
| `RAPPORT-RECONCILIATION-PUR02.md` | Réconciliation historique PUR-02 | Oct/Nov 2026 |
| `RAPPORT-RECONCILIATION-ALLM12-CP3.md` | Réconciliation ALLM-12/CP-3 (v1) | Oct 2026 |
| `RAPPORT-RECONCILIATION-ALLM12-CP3-v2.md` | Réconciliation ALLM-12/CP-3 (v2) | Oct 2026 |
| `Tableau-de-bord-correctifs-2026-11-01.md` | Tableau de bord 01/11 | 2026-11-01 |
| `PUR-02-E-purgeDocument-v4e-fix1b.patch` | Patch diff fix#1b | 2026-11-04 |

**SHA-256 du patch (vérifié 2026-11-11) :** `86043b316bb40bbee3a9cc706d756255bbded05e278e3033ee018f14b1dbd8aa`

---

## 7. Fichiers nécessitant une décision

| Fichier | Situation | Question en suspens |
|---|---|---|
| `pur02-candidate.test.js` | OBSOLÈTE (Suite A pré-v4f) | **Supprimer ou archiver ?** Archivage recommandé pour traçabilité historique. |
| `candidate-lance-index.js` | SUPERSÉDÉ (v4 → v4f) | **Supprimer ou archiver ?** Archivage recommandé. |
| `pur02-candidate-v4f.test.js` | Absente localement — présente uniquement dans l'env E2E (ChatGPT) | **Rapatrier ?** Utile si un re-test est nécessaire. SHA fourni par rapport E2E, non vérifié localement. |

---

## 8. Inventaire par branche GitHub (état vérifié lors de la session)

> **Méthode** : clone local effectué pendant la session à partir du dépôt `testuflo-ft/docs-serveur-ia`. État des branches au moment du clone (avant l'upload Florian du 2026-11-11).

### Branche `main`

| Fichier | Présent | Remarque |
|---|---|---|
| `candidate-purgeDocument-v4e.js` | ✅ | Candidat actif v4e + fix#1b |
| `candidate-documents.js` | ❌ | Absent de `main` — présent sur `correctif-PUR-02` uniquement |
| `candidate-lance-index-v4f.js` | ❌ | Absent de `main` — présent sur `correctif-PUR-02` uniquement |
| `pur02-candidate.test.js` | ✅ | Suite A OBSOLÈTE (scénarios 9/10 → `false`) |
| `pur02-http-handler.test.js` | ✅ | Suite B canonique |
| `pur02-path-security.test.js` | ✅ | Suite C canonique |
| `pur02-lance-v4f.test.js` | ✅ | Suite L/R canonique |
| `pur02-candidate-v4f.test.js` | ❌ | **Absente de toutes les branches GitHub** — utilisée uniquement dans l'env local/scratchpad lors des tests 60/60 |
| `pur02-sources-1.19.0/` | ✅ | Dossier sources v1.19.0 complet |
| `PUR-02-E-purgeDocument-v4e-fix1b.patch` | ✅ | Patch fix#1b |
| Rapports et documents `docs-serveur-ia/` | ✅ | Présents sur `main` |

### Branche `correctif-PUR-02`

| Fichier | Présent | Remarque |
|---|---|---|
| `candidate-documents.js` | ✅ | Candidat actif v4 |
| `candidate-lance-index-v4f.js` | ✅ | Candidat actif v4f |
| `candidate-lance-index.js` | ✅ | Ancienne version v4 — SUPERSÉDÉE |
| `candidate-purgeDocument.js` | ✅ | Ancienne version v4 pré-fix#1b — SUPERSÉDÉE |
| `candidate-purgeDocument-v4e.js` | ❌ | Absent de `correctif-PUR-02` — présent sur `main` uniquement |

### Synthèse : répartition des 3 candidats actifs

| Candidat | `main` | `correctif-PUR-02` |
|---|---|---|
| `candidate-purgeDocument-v4e.js` | ✅ | ❌ |
| `candidate-documents.js` | ❌ | ✅ |
| `candidate-lance-index-v4f.js` | ❌ | ✅ |

> **Conséquence** : pour déployer PUR-02-E, il faudra récupérer les 3 candidats depuis deux branches différentes. Aucune des deux branches ne contient les 3 composants réunis.

> **`pur02-candidate-v4f.test.js`** : absente de toutes les branches GitHub vérifiées. Elle n'était présente que dans l'environnement scratchpad/tests/ local pendant les tests simulés du 2026-11-10. Son SHA-256 déclaré (`773fbe04…`) n'est pas vérifiable via GitHub.

---

## Log SHA-256 de provenance complet (2026-11-11)

### Candidats et tests (vérifiés localement)

```
90a21b0488dfd78ee744b35ae02cd9a6b1e629ead17a88cec5bda49ae4875f79  candidate-purgeDocument-v4e.js
de9c586043cbf63f70c4070cc18bc2f0871bc3a8b1d8caa79f32248fba8152eb  candidate-documents.js
8103f042a0fed63db1d6f79db61ceb6eef97687e87893bec9747abe1d2c9149f  candidate-lance-index-v4f.js
c826f004f1761c20b1e06300fc0f8d63416e03abe523b7e06a0259ec23180e44  candidate-lance-index.js  [SUPERSÉDÉ]
f3e88f13165dc273749284c18750f9c745d8194a3f8e635664d18f24dbab8cbf  pur02-candidate.test.js  [OBSOLÈTE]
cb9702bdddcadd126487f1e5e5397075cb7a4a2a7b5144c93285819a694eff55  pur02-http-handler.test.js
89e32abc8c171b0aa7ad14cc90d49b614534e249c3e64f85d2fbabc6712d7921  pur02-path-security.test.js
11d835b2eb1ed91b97ac6c9be6f9fae7bb5c585fbe0dd70ae7e306c65917a465  pur02-lance-v4f.test.js
86043b316bb40bbee3a9cc706d756255bbded05e278e3033ee018f14b1dbd8aa  PUR-02-E-purgeDocument-v4e-fix1b.patch
```

### Sources v1.19.0 (vérifiés localement)

```
f6dda7152e476a6078533a8c06f458204d36c2abd550b08bbf69c8ccf232727a  pur02-sources-1.19.0/purgeDocument.js
b9c901945162631a685bff039e5df4b3ebc875c7408d93eab66217e5066ddb89  pur02-sources-1.19.0/api-document-index.js
0f7d5db7accd68c54a9ac0e884329a29a6e2f25b288c56030d3f24bb77142b19  pur02-sources-1.19.0/endpoints-system.js
959ee973681994076402031a6d59d6eafd3cdb1b83589103f56f42f6115ff70f  pur02-sources-1.19.0/files-index.js
```

### Documentation mise à jour (état final, vérifiés localement 2026-11-11)

```
742e7fb40905e193a564eb9bd4b3f7ee590f84d633458696e40a85fcc7784def  Journal-des-Incidents.md
019e9cd18914b66800292c6df5a5bc1191176b106149875af01d20ee7e200953  Livret-Technique-Serveur-IA.md
76d95d125dce4c92737a7f20ecf3cec609064fb389622ee41e88038ebb7ff1dd  Plan-correctifs-AnythingLLM.md
352b1a8ec7a39431c09d5369e839f6c123d3ed6a13324537db2117bd1618618f  PUR-02-livraison.md
```

### Depuis rapport E2E (fournis par ChatGPT, non vérifiables localement — lab détruit)

```
773fbe04198bc45d5bc8daea435101fc9cb5461c223d319ce27afdd99a77e06e  pur02-candidate-v4f.test.js  [ENV E2E uniquement]
86043b316bb40bbee3a9cc706d756255bbded05e278e3033ee018f14b1dbd8aa  PUR-02-E-purgeDocument-v4e-fix1b.patch  [confirmé localement]
```

---

*Inventaire produit par Claude — 2026-11-11*  
*Vérification SHA-256 locale via `sha256sum` sur les fichiers présents dans `docs-serveur-ia/`*  
*Les SHA des fichiers du lab E2E (`pur02-candidate-v4f.test.js`) proviennent du rapport ChatGPT 2026-11-10 et ne sont pas vérifiables localement (lab détruit).*
