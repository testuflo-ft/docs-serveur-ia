# Rapport de réconciliation technique et documentaire — ALLM-12 / CP-3

**Date de production :** 2026-11-09  
**Statut :** Lecture seule — aucune modification effectuée  
**Périmètre :** Réconciliation entre l'état réel de la production, les sauvegardes du laboratoire et les documents de suivi du projet  
**Destinataire :** Florian — pour validation avant toute décision

---

## Préambule méthodologique

Ce rapport est produit en lecture seule. Aucun fichier de production, aucun conteneur, aucune base de données ni aucun document du dépôt n'a été modifié. Les corrections documentaires proposées à la section 6 sont des propositions soumises à validation ; elles ne sont pas appliquées.

Les termes de preuve employés dans ce rapport suivent une gradation stricte :

- **Confirmé** : identité ou contenu établi par correspondance SHA-256 et lecture directe du fichier source.
- **Fortement probable** : inférence solide depuis une correspondance SHA-256 partielle et un diff négatif (absence d'une différence connue), sans lecture directe du fichier en question.
- **Hypothèse** : raisonnement plausible fondé sur des indices convergents, non confirmable par les seules données disponibles en lecture seule.
- **Inconnu** : aucun élément disponible ne permet de trancher.

---

## 1. Faits vérifiés

Les faits suivants sont établis sans ambiguïté à partir des sources disponibles (empreintes SHA-256, diff de conteneur, lecture directe des fichiers lab et sauvegardes).

### 1.1 Conteneur de production

| Élément | Valeur |
|---|---|
| Nom du conteneur | `anythingllm` |
| Image de base | `sha256:ddf73304a4a96e2f90755d620dd3921de9afb4b8b8e914fa62d6ce7944ba95af` |
| Démarrage | `2026-10-29T08:51:05.728428208Z` |

### 1.2 Empreintes SHA-256 en production

Relevées lors des contrôles en lecture seule rapportés par ChatGPT :

| Fichier | SHA-256 production |
|---|---|
| `endpoints/api/system/index.js` | `825b898eed93569ddc9ed14912266bd94e2c02bd7dbb0e864810ad11cf729bcc` |
| `endpoints/system.js` | `7bf6715adea5057c1b58c9fe0b35430bf0ac8747e1ff75efdb1e1420339061e5` |
| `utils/helpers/updateENV.js` | `25d9a5421c9e5b6d06d220d8b8d67d917cb78e74c9aafe43bdd9d690fa888768` |
| `utils/middleware/validApiKey.js` | `83f40985e245024a14488f03f02b6f2b1f9649a13b018472866f6025d3d6d18b` |

### 1.3 Couche inscriptible du conteneur (`docker diff`)

Les deux fichiers de routes ALLM-12 apparaissent comme modifiés dans la couche inscriptible du conteneur de production, confirmant qu'ils diffèrent de l'image de base :

- `/app/server/endpoints/api/system/index.js` — **modifié**
- `/app/server/endpoints/system.js` — **modifié**

Les fichiers `updateENV.js` et `validApiKey.js` **n'apparaissent pas** dans le diff : ils sont vraisemblablement identiques à l'image de base.

### 1.4 Fichiers temporaires en production

Deux fichiers temporaires sont présents dans le conteneur de production :

- `/tmp/allm12-system.js` — empreinte SHA-256 `7bf6715a…` = **identique à `endpoints/system.js` en production**
- `/tmp/allm12-api-system-index.js` — présence confirmée (empreinte non relevée séparément, mais cohérente avec la démarche ALLM-12)

Ces copies indiquent que les fichiers de production ont été inspectés ou archivés dans `/tmp` dans le cadre des travaux ALLM-12.

### 1.5 Sauvegarde fixlab (`/Users/florian/fixlab-preservation-2026-11-08`)

| Fichier | SHA-256 fixlab |
|---|---|
| `endpoints/api/system/index.js` | `825b898eed93569ddc9ed14912266bd94e2c02bd7dbb0e864810ad11cf729bcc` |
| `endpoints/system.js` | `0f7d5db7accd68c54a9ac0e884329a29a6e2f25b288c56030d3f24bb77142b19` |

La sauvegarde fixlab a été extraite du conteneur `anythingllm-fixlab` le 2026-11-02 par Florian. Les fichiers lab portent un horodatage de modification au 2026-10-28.

### 1.6 Contenu des fichiers lab (confirmé par lecture directe dans le rapport INT18)

**`api-system-index.js` lab (SHA `825b898e…`) :**
- Middleware `[validApiKey]` présent sur la route `GET /v1/system/env-dump`
- Commentaire original `// Intentionally unauthenticated` conservé (vestige non retiré)

**`endpoints-system.js` lab (SHA `0f7d5db7…`) :**
- Middleware `[validApiKey]` présent sur la route `GET /env-dump`
- Gestionnaire `purgeFolder` retourne `response.status(200).json(result)` avec le message d'erreur en JSON (correctif PUR-02 appliqué)

### 1.7 Différence entre `system.js` production et fixlab

Le diff entre les deux versions de `system.js` porte **exclusivement sur le gestionnaire `purgeFolder`** :

| Point de différence | Version production (`7bf6715a…`) | Version fixlab (`0f7d5db7…`) |
|---|---|---|
| Gestionnaire `purgeFolder` | `await purgeFolder(name)` → HTTP 200 sans corps JSON | `purgeFolder(name)` → `response.status(200).json(result)` avec code et message d'erreur |
| Correctif PUR-02 | **Absent** | **Présent** |

Aucune autre différence n'est documentée entre les deux fichiers.

### 1.8 Répertoire `pur02-sources-1.19.0/`

Le répertoire local `pur02-sources-1.19.0/endpoints-system.js` possède la même empreinte SHA-256 `0f7d5db7…` que la sauvegarde fixlab. Il s'agit donc de la **version lab modifiée** (avec variante CP-3 et correctif PUR-02), et non des sources originales AnythingLLM 1.19.0. Le nom du répertoire est trompeur.

---

## 2. Correspondances exactes

### 2.1 Correspondance totale : `api/system/index.js` production = lab = fixlab

```
Production :  825b898eed93569ddc9ed14912266bd94e2c02bd7dbb0e864810ad11cf729bcc
Fixlab       : 825b898eed93569ddc9ed14912266bd94e2c02bd7dbb0e864810ad11cf729bcc
Lab (INT18)  : 825b898e… (confirmé)
```

**Conclusion :** Le fichier `endpoints/api/system/index.js` actuellement en production est **identique octet par octet** à la version produite lors des travaux de laboratoire du 2026-10-28.

Puisque le contenu du fichier lab est confirmé (lecture directe dans INT18), cela établit que la production contient `[validApiKey]` sur la route `GET /v1/system/env-dump`.

### 2.2 Correspondance partielle : `system.js` production ≠ fixlab (une différence connue)

```
Production :  7bf6715adea5057c1b58c9fe0b35430bf0ac8747e1ff75efdb1e1420339061e5
Fixlab       : 0f7d5db7accd68c54a9ac0e884329a29a6e2f25b288c56030d3f24bb77142b19
```

La seule différence documentée entre les deux versions porte sur `purgeFolder`. Cette correspondance est partielle, non totale — voir section 3.

### 2.3 Correspondance présumée avec l'image de base : `updateENV.js` et `validApiKey.js`

Ces deux fichiers n'apparaissent pas dans le `docker diff`. Leur présence dans les empreintes est à des fins de traçabilité. Ils ne font pas partie du périmètre CP-3 et sont vraisemblablement inchangés depuis l'image de base. Cette présomption reste non confirmée par comparaison avec la source upstream.

---

## 3. Écarts

### 3.1 Écart principal : `system.js` production ≠ fixlab

Comme établi en 1.7, la version de production ne contient pas le correctif PUR-02 (gestionnaire `purgeFolder` retournant une réponse JSON structurée). La version fixlab, elle, le contient.

**Conséquence :** La route `purgeFolder` en production retourne HTTP 200 sans détail JSON en cas d'erreur — comportement documenté comme défaut dans ALLM-12 et PUR-02.

### 3.2 Écart entre CP-3 documenté et implémentation réelle

Le patch CP-3 (SHA `b27d886c…`, 23/10/2026) spécifie, selon les documents de suivi :

- `server/endpoints/system.js` : ajout de `[validatedRequest, flexUserRoleValid([ROLES.admin])]`
- `server/endpoints/api/system/index.js` : ajout de `[validApiKey]`

L'implémentation trouvée dans le laboratoire (et en production pour `api/system/index.js`) utilise :

- `api-system-index.js` : `[validApiKey]` → **conforme à CP-3**
- `endpoints-system.js` : `[validApiKey]` → **différent de CP-3** (CP-3 prévoyait `[validatedRequest, flexUserRoleValid([ROLES.admin])]`)

La variante lab protège `/env-dump` par clé API plutôt que par session admin. Ces deux mécanismes ne sont pas équivalents du point de vue des droits d'accès :

| Mécanisme | Prérequis | Niveau d'accès |
|---|---|---|
| `[validatedRequest, flexUserRoleValid([ROLES.admin])]` (CP-3 documenté) | Session utilisateur authentifié + rôle admin | Accès réservé aux administrateurs connectés |
| `[validApiKey]` (variante lab/production) | Clé API valide dans l'en-tête `Authorization` | Accès réservé aux clients possédant une clé API configurée |

L'implémentation réelle n'est donc **pas CP-3 exact** : c'est une **variante** qui protège les deux routes par le même mécanisme (`validApiKey`), avec une sémantique d'accès différente pour `system.js`.

### 3.3 Écart documentaire : statut "non appliqué"

Les documents de suivi indiquent unanimement que CP-3 est « préparé mais non appliqué » :

- **Plan-correctifs v0.8, section D1 :** « CP-3 reste préparé mais non appliqué »
- **Journal-des-Incidents v1.3, entrée ALLM-12 :** « CP-3 préparé, non appliqué automatiquement »
- **Livret Technique v0.9 :** statut CP-3 non déployé

Or, les faits établis montrent que la route `/v1/system/env-dump` **est protégée en production** par `[validApiKey]` depuis au moins le démarrage du conteneur le 2026-10-29 (ou ultérieurement, dans la couche inscriptible). Le statut documentaire est en contradiction avec l'état réel de cette route.

### 3.4 Écart entre nom et contenu du répertoire `pur02-sources-1.19.0/`

Le nom suggère des sources originales AnythingLLM 1.19.0 ; le contenu est en réalité la version lab modifiée. Cela constitue une source de confusion documentaire.

### 3.5 Absence du fichier de patch CP-3 (`b27d886c…`)

Le patch CP-3 lui-même n'est pas disponible localement pour comparaison directe. La branche `correctif-PUR-02` sur GitHub ne contient pas de fichier correspondant à ce patch. La description de CP-3 repose sur les documents de suivi et sur le rapport INT18 — aucune lecture directe du patch `b27d886c…` n'a été possible.

---

## 4. Hypothèses et limites de preuve

### 4.1 Hypothèse forte : `system.js` production contient `[validApiKey]` sur `/env-dump`

**Base :** Le diff entre production et fixlab ne porte que sur `purgeFolder`. Si la route `/env-dump` était différente entre les deux versions, cette différence apparaîtrait dans le diff. Or le diff ne la signale pas.

**Limite :** Cette inférence repose sur l'hypothèse que le diff rapporté est exhaustif et que seule la différence `purgeFolder` a été relevée. Sans lecture directe de `endpoints/system.js` en production, la présence de `[validApiKey]` sur `/env-dump` ne peut être formellement confirmée.

**Niveau de certitude : fortement probable, non confirmé.**

### 4.2 Hypothèse : les modifications de production ont eu lieu après le démarrage du conteneur le 2026-10-29

**Base :** `docker diff` mesure les modifications de la couche inscriptible par rapport à l'image de base. Les fichiers apparaissant dans le diff ont donc été modifiés **dans le conteneur en cours d'exécution**, après son démarrage le 2026-10-29.

**Limite :** La date exacte des modifications n'est pas connue. L'auteur des modifications dans le conteneur de production n'est pas documenté dans les informations disponibles. Ces modifications ne font référence à aucune décision explicitement autorisée dans les documents de suivi (D1 indique "non appliqué").

### 4.3 Hypothèse : la variante lab (et non CP-3 exact) a été appliquée en production

**Base :** `api/system/index.js` production = lab. La variante lab utilise `[validApiKey]` sur les deux routes. Si CP-3 exact (`[validatedRequest, flexUserRoleValid([ROLES.admin])]` pour `system.js`) avait été appliqué, le SHA de `system.js` en production serait différent de la variante lab — sauf si les deux patches produisent exactement le même résultat, ce qui n'est pas le cas (middlewares distincts).

**Limite :** Sans lecture directe de `system.js` en production et sans accès au patch `b27d886c…`, la distinction entre CP-3 exact et variante lab reste une inférence forte mais non prouvée.

### 4.4 Limite : `updateENV.js` et `validApiKey.js` non comparés à l'upstream

L'absence de ces fichiers dans `docker diff` est cohérente avec l'absence de modification, mais n'exclut pas une modification réalisée au niveau de l'image de base elle-même. Une comparaison des SHA avec le dépôt upstream AnythingLLM 1.19.0 permettrait de le confirmer formellement.

---

## 5. Statut technique réel de CP-3

### 5.1 Route `/v1/system/env-dump` (`endpoints/api/system/index.js`)

**Statut : Protection active confirmée.**

Le fichier en production est identique à la version lab du 2026-10-28, qui contient `[validApiKey]` sur cette route. La protection est présente et fonctionnelle au sens du code (aucun test d'intégration en conditions réelles n'a été réalisé).

Cette protection correspond à **l'élément CP-3 prévu pour ce fichier** (`[validApiKey]`), et est donc conforme à CP-3 sur cette route.

### 5.2 Route `/env-dump` (`endpoints/system.js`)

**Statut : Protection probable, non confirmée directement ; variante distincte de CP-3.**

La version de production (`7bf6715a…`) diffère du fixlab uniquement sur `purgeFolder`. Le diff ne signale aucune différence sur la route `/env-dump`. Cela suggère fortement que `[validApiKey]` est également présent sur cette route — mais sans lecture directe du fichier, cette conclusion ne peut pas être déclarée comme un fait établi.

Si confirmé, le middleware utilisé serait `[validApiKey]`, et non `[validatedRequest, flexUserRoleValid([ROLES.admin])]` tel que spécifié dans le patch CP-3 original. L'implémentation réelle constituerait une **variante** de CP-3, avec une sémantique d'accès différente.

### 5.3 Correctif PUR-02 sur `system.js`

**Statut : Absent en production.**

Le gestionnaire `purgeFolder` en production retourne HTTP 200 sans corps JSON en cas d'erreur. Le correctif PUR-02 (retour JSON structuré) est présent dans la version lab/fixlab mais pas en production.

### 5.4 `updateENV.js` et `validApiKey.js`

**Statut : Probablement inchangés depuis l'image de base.**

Ces fichiers ne sont pas modifiés par CP-3. Leur absence du `docker diff` confirme qu'ils n'ont pas été modifiés dans la couche inscriptible du conteneur. Une comparaison upstream reste à effectuer pour certification complète.

### 5.5 Synthèse du statut CP-3

| Composant | Prévu par CP-3 | État production | Niveau de certitude |
|---|---|---|---|
| `api/system/index.js` — `[validApiKey]` sur `/v1/system/env-dump` | Oui | **Présent** | Confirmé (SHA = lab) |
| `system.js` — middleware sur `/env-dump` | `[validatedRequest, flexUserRoleValid([ROLES.admin])]` | Probable `[validApiKey]` (variante) | Fortement probable, non confirmé |
| PUR-02 fix sur `system.js` | Non (hors CP-3) | Absent | Confirmé |
| `updateENV.js` — inchangé | Attendu | Inchangé | Probable |
| `validApiKey.js` — inchangé | Attendu | Inchangé | Probable |

**Conclusion synthétique :** CP-3 n'a pas été appliqué dans sa forme exacte telle que documentée (patch `b27d886c…`). Une variante fonctionnellement proche — utilisant `[validApiKey]` sur les deux routes — est présente en production, sans traçabilité documentaire de cette décision et sans test d'intégration validé.

---

## 6. Corrections documentaires proposées

Ces propositions sont soumises à la validation de Florian. Aucune n'est appliquée.

### 6.1 Plan-correctifs-AnythingLLM.md (v0.8) — Section D1 / ALLM-12

**Problème :** D1 indique « CP-3 reste préparé mais non appliqué ». Cette formulation est en contradiction avec l'état observé.

**Proposition :** Remplacer la formulation de D1 par un statut différencié :

> **Statut révisé (D1 — 2026-11-09) :** Réconciliation ALLM-12 effectuée en lecture seule.  
> — Route `/v1/system/env-dump` (`api/system/index.js`) : protection `[validApiKey]` **confirmée en production** (SHA `825b898e…` = version lab du 28/10/2026). Conforme à l'élément CP-3 prévu pour ce fichier.  
> — Route `/env-dump` (`system.js`) : protection `[validApiKey]` **probable mais non confirmée directement** (inférence depuis diff). Variante de CP-3 : middleware différent de celui spécifié (`[validApiKey]` au lieu de `[validatedRequest, flexUserRoleValid([ROLES.admin])]`). Correctif PUR-02 absent.  
> — Origine et autorisation des modifications en production non tracées dans les documents.  
> — CP-3 exact (patch `b27d886c…`) : **non appliqué** (variante fonctionnelle, non équivalente, présente à la place).  
> — Validation fonctionnelle et de sécurité : **non effectuée**.  
> — Décision sur la suite (application de CP-3 exact, maintien de la variante, PUR-02) : **en attente de validation Florian**.

### 6.2 Journal-des-Incidents.md (v1.3) — Entrée ALLM-12

**Problème :** L'entrée indique « CP-3 préparé, non appliqué automatiquement » sans distinguer l'état des deux routes.

**Proposition :** Ajouter une sous-section à l'entrée ALLM-12 :

> **Réconciliation 2026-11-09 (lecture seule) :**  
> - `api/system/index.js` : SHA production `825b898e…` = version lab. Protection `[validApiKey]` sur `/v1/system/env-dump` **confirmée**.  
> - `system.js` : SHA production `7bf6715a…` ≠ fixlab `0f7d5db7…`. Différence documentée : correctif PUR-02 absent en production. Protection `/env-dump` : probable `[validApiKey]` (non confirmé directement).  
> - Variante CP-3 (non CP-3 exact) : présente pour au moins une route. Origine non tracée.  
> - Statut : `[C17]` protection présente — validation et autorisation à établir.

### 6.3 Livret-Technique-Serveur-IA.md (v0.9) — Section ALLM-12

**Problème :** Le statut CP-3 indiqué comme « non déployé » n'est plus exact.

**Proposition :** Réviser le statut ALLM-12 en :

> CP-3 : variante fonctionnelle présente en production (`[validApiKey]` sur les deux routes — implémentation lab) ; CP-3 exact (patch `b27d886c…`) non appliqué ; PUR-02 absent de production ; validation fonctionnelle non effectuée.

### 6.4 Répertoire `pur02-sources-1.19.0/`

**Problème :** Le nom laisse croire à des sources originales 1.19.0, alors qu'il s'agit des versions lab modifiées.

**Proposition :** Renommer en `pur02-sources-LAB-1.19.0/` ou ajouter un fichier `README.md` dans le répertoire précisant : « Ce répertoire contient les fichiers modifiés extraits du conteneur lab (`anythingllm-fixlab`, 2026-10-28), incluant la variante CP-3 et le correctif PUR-02. Il ne s'agit pas des sources originales AnythingLLM 1.19.0. »

---

## 7. Contrôles complémentaires nécessaires avant toute décision

Ces contrôles sont tous réalisables en lecture seule via SSH. Aucun ne nécessite de redémarrage, de modification ou d'accès mutatif.

### 7.1 Lecture directe de `endpoints/system.js` en production — PRIORITAIRE

**Objectif :** Confirmer ou infirmer la présence de `[validApiKey]` sur la route `/env-dump` en production.

**Commande :**
```bash
docker exec anythingllm grep -n "env-dump\|validApiKey\|validatedRequest\|flexUserRoleValid" /app/server/endpoints/system.js
```

**Ce que cela établit :** Le middleware exact présent sur la route `/env-dump` en production, et la résolution de l'hypothèse 4.1.

### 7.2 Lecture directe de `endpoints/api/system/index.js` en production

**Objectif :** Confirmer le commentaire `// Intentionally unauthenticated` et le middleware sur `/v1/system/env-dump`.

**Commande :**
```bash
docker exec anythingllm grep -n "env-dump\|validApiKey\|Intentionally" /app/server/endpoints/api/system/index.js
```

### 7.3 Date de modification des fichiers en production

**Objectif :** Dater les modifications dans la couche inscriptible du conteneur.

**Commande :**
```bash
docker exec anythingllm stat /app/server/endpoints/system.js /app/server/endpoints/api/system/index.js
```

**Ce que cela établit :** Quand les fichiers ont été modifiés (avant ou après le démarrage du 2026-10-29), permettant d'affiner la chronologie.

### 7.4 Comparaison avec l'upstream AnythingLLM 1.19.0

**Objectif :** Confirmer l'empreinte de référence des fichiers de l'image de base pour `updateENV.js` et `validApiKey.js`, et obtenir une base de comparaison pour les fichiers modifiés.

**Source :** Dépôt officiel `Mintplex-Labs/anything-llm`, tag `v1.19.0` sur GitHub (lecture seule).

**Fichiers à comparer :**
- `server/utils/helpers/updateENV.js`
- `server/utils/middleware/validApiKey.js`
- `server/endpoints/system.js`
- `server/endpoints/api/system/index.js`

### 7.5 Localisation du patch CP-3 (`b27d886c…`)

**Objectif :** Lire le contenu exact du patch CP-3 tel que préparé le 2026-10-23 pour confirmer les middlewares spécifiés et établir une comparaison directe avec l'implémentation production.

**Action :** Identifier le fichier `.patch` ou le commit correspondant à SHA `b27d886c…` dans les archives du projet. Si le patch n'est pas disponible localement, demander à Florian s'il peut le localiser.

### 7.6 Validation fonctionnelle minimale en environnement lab isolé

**Objectif :** Vérifier que les routes `/env-dump` et `/v1/system/env-dump` retournent bien HTTP 401/403 sans clé API valide, et HTTP 200 avec une clé valide — sur un conteneur de lab isolé, jamais sur la production.

**Prérequis :** Autorisation explicite de Florian. Environnement de test isolé, sans données réelles.

---

## Annexe — Tableau récapitulatif des empreintes

| Fichier | SHA-256 production | SHA-256 fixlab | SHA-256 lab (INT18) | Concordance |
|---|---|---|---|---|
| `endpoints/api/system/index.js` | `825b898e…` | `825b898e…` | `825b898e…` | **Totale** |
| `endpoints/system.js` | `7bf6715a…` | `0f7d5db7…` | `0f7d5db7…` | **Partielle** (1 diff connue) |
| `utils/helpers/updateENV.js` | `25d9a542…` | — | — | — |
| `utils/middleware/validApiKey.js` | `83f40985e…` | — | — | — |

---

*Rapport produit en lecture seule. Aucun fichier modifié. Propositions documentaires soumises à validation de Florian avant application.*
