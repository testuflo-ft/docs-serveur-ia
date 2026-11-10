# Rapport de réconciliation technique et documentaire — ALLM-12 / CP-3 (version 2)

**Date de production :** 2026-11-10  
**Version :** 2 — complément et corrections de la version 1 (2026-11-09)  
**Statut :** Lecture seule — aucune modification effectuée  
**Périmètre :** Réconciliation entre l'état réel de la production, les sauvegardes du laboratoire et les documents de suivi du projet  
**Destinataire :** Florian — pour validation avant toute décision

---

## Préambule

Ce rapport complète et corrige la version 1 (`RAPPORT-RECONCILIATION-ALLM12-CP3.md`, 2026-11-09). Il intègre les résultats des contrôles complémentaires exécutés en lecture seule sur le conteneur de production le 2026-11-10, qui lèvent les deux principales incertitudes de la version 1 et corrigent une erreur de raisonnement sur la chronologie.

**La version 1 est conservée intégralement sans modification.** Elle constitue la trace historique de la première analyse. Ce rapport ne la remplace pas : il la complète et corrige ce qui doit l'être.

---

## Corrections apportées à la version 1

Deux points de la version 1 sont corrigés ici.

### Correction C-1 : niveau de preuve sur `/env-dump`

**Version 1 (section 4.1) :** « La protection de `/env-dump` est fortement probable, non confirmée directement. »

**Correction :** La lecture directe du fichier en production confirme sans ambiguïté la présence de `[validApiKey]` sur cette route. Il ne s'agit plus d'une inférence. Ce point est désormais un fait établi (voir section 1 ci-dessous).

### Correction C-2 : raisonnement sur la chronologie

**Version 1 (section 4.2) :** « Les modifications ont nécessairement eu lieu après le démarrage du conteneur le 2026-10-29. »

**Correction :** Cette affirmation était inexacte. Les métadonnées `stat` montrent des timestamps antérieurs au démarrage du conteneur (2026-10-28 05:32:19 UTC vs démarrage 2026-10-29 08:51:05 UTC). Ces dates ne prouvent pas pour autant que les modifications ont eu lieu avant le démarrage — voir section 3 pour l'interprétation correcte.

---

## 1. Nouvelles preuves directes établies

Les contrôles suivants ont été exécutés en lecture seule sur le conteneur de production le 2026-11-10 par Florian via SSH.

### 1.1 Lecture directe de la route `/env-dump` (`endpoints/system.js`, ligne 95)

```js
// Intentionally unauthenticated so deploy/shutdown scripts can flush in-memory config to .env.
// Takes no input and returns nothing. NOT a vulnerability - see SECURITY.md.
app.get("/env-dump", [validApiKey], async (_, response) => {
  if (process.env.NODE_ENV !== "production")
    return response.sendStatus(200).end();
  dumpENV();
  response.sendStatus(200).end();
});
```

**Fait établi :** La route `GET /env-dump` est protégée par `[validApiKey]` en production.

**Observation :** Le commentaire `// Intentionally unauthenticated` est devenu inexact. Le middleware `[validApiKey]` est bien présent et constitue un contrôle d'accès. Ce commentaire est un vestige non mis à jour. Aucune modification en production n'est proposée à ce stade.

### 1.2 Lecture directe de la route `/v1/system/env-dump` (`endpoints/api/system/index.js`, ligne 18)

```js
// Intentionally unauthenticated so deploy/shutdown scripts can flush in-memory config to .env.
// Takes no input and returns nothing. NOT a vulnerability - see SECURITY.md.
app.get("/v1/system/env-dump", [validApiKey], async (_, response) => {
  /*
   #swagger.tags = ['System Settings']
   #swagger.description = 'Dump all settings to file storage'
   #swagger.responses[403] = {
     schema: {
       "$ref": "#/definitions/InvalidAPIKey"
     }
   }
   */
  try {
    if (process.env.NODE_ENV !== "production")
      return response.sendStatus(200).end();
```

**Fait établi :** La route `GET /v1/system/env-dump` est protégée par `[validApiKey]` en production. (Déjà confirmé par correspondance SHA en v1 — ici confirmé par lecture directe indépendante.)

**Observation :** Même commentaire `// Intentionally unauthenticated` trompeur que sur `system.js`.

### 1.3 Correspondance des fichiers temporaires ALLM-12

```
7bf6715adea5057c1b58c9fe0b35430bf0ac8747e1ff75efdb1e1420339061e5  /tmp/allm12-system.js
825b898eed93569ddc9ed14912266bd94e2c02bd7dbb0e864810ad11cf729bcc  /tmp/allm12-api-system-index.js
```

**Fait établi :** Les fichiers temporaires `/tmp/allm12-system.js` et `/tmp/allm12-api-system-index.js` sont des copies exactes des fichiers de routes actuellement installés en production. Leur présence est cohérente avec une démarche d'inspection ou d'archivage dans le cadre des travaux ALLM-12. Ils ne permettent pas, à eux seuls, d'établir la date ni l'auteur de leur copie.

---

## 2. Tableau récapitulatif mis à jour

### 2.1 Empreintes SHA-256

| Fichier | SHA-256 production | SHA-256 fixlab | SHA-256 /tmp | Concordance |
|---|---|---|---|---|
| `endpoints/api/system/index.js` | `825b898e…` | `825b898e…` | `825b898e…` | **Totale** |
| `endpoints/system.js` | `7bf6715a…` | `0f7d5db7…` | `7bf6715a…` | **Partielle** (1 diff connue : purgeFolder) |
| `utils/helpers/updateENV.js` | `25d9a542…` | — | — | — |
| `utils/middleware/validApiKey.js` | `83f40985e…` | — | — | — |

### 2.2 État des routes

| Route | Middleware en production | Niveau de certitude |
|---|---|---|
| `GET /env-dump` | `[validApiKey]` | **Confirmé** (lecture directe ligne 95) |
| `GET /v1/system/env-dump` | `[validApiKey]` | **Confirmé** (SHA + lecture directe ligne 18) |

---

## 3. Chronologie et métadonnées des fichiers

### 3.1 Données `stat`

| Fichier | Birth | Modify | Change | Access (dernier) |
|---|---|---|---|---|
| `endpoints/system.js` | 2026-10-28 05:32:19 UTC | 2026-10-28 05:32:19 UTC | 2026-10-28 05:32:19 UTC | 2026-11-09 22:44:55 UTC |
| `api/system/index.js` | 2026-10-28 05:32:19 UTC | 2026-10-28 05:32:19 UTC | 2026-10-28 05:32:19 UTC | 2026-11-09 22:44:55 UTC |
| Démarrage du conteneur | 2026-10-29 08:51:05 UTC | — | — | — |

### 3.2 Interprétation correcte

Les deux fichiers portent un timestamp de modification au **2026-10-28 05:32:19 UTC**, soit environ 27 heures avant le démarrage du conteneur le 2026-10-29 08:51:05 UTC.

Ce timestamp correspond à la date des fichiers extraits du conteneur de laboratoire `anythingllm-fixlab` (horodatage 2026-10-28, confirmé par le RAPPORT-ETAT-GITHUB-2026-11-02).

L'explication la plus cohérente avec l'ensemble des faits est que les fichiers ont été **copiés depuis le laboratoire dans le conteneur de production** (par exemple via `docker cp`) avec **préservation du timestamp d'origine**. `docker cp` transfère les fichiers en conservant leur `mtime` source, ce qui explique des dates antérieures au démarrage du conteneur.

**Ce que ces timestamps établissent :**

- L'**origine probable** des fichiers : le laboratoire du 2026-10-28.
- La **cohérence** avec les sauvegardes lab et fixlab.

**Ce que ces timestamps n'établissent pas :**

- La **date exacte** à laquelle les fichiers ont été copiés dans le conteneur de production (inconnue).
- L'**auteur** de la copie (non documenté dans les sources disponibles).
- La **procédure** d'installation (aucune décision explicitement autorisée dans les documents de suivi ne couvre cette opération).

Les métadonnées de fichiers ne constituent pas un journal d'audit. Toute reconstruction chronologique à partir de `stat` reste une inférence, non une preuve.

Le dernier accès (`Access: 2026-11-09 22:44:55 UTC`) correspond à l'exécution des commandes `grep` lors des contrôles du 2026-11-09, ce qui est cohérent.

---

## 4. Statut technique réel de CP-3 (version corrigée)

### 4.1 Route `/v1/system/env-dump` (`api/system/index.js`)

**Statut : Protection active confirmée, conforme à CP-3 pour cette route.**

Middleware `[validApiKey]` présent — confirmé par correspondance SHA (v1) et par lecture directe (v2). Cette protection correspond à l'élément CP-3 prévu pour ce fichier.

### 4.2 Route `/env-dump` (`system.js`)

**Statut : Protection active confirmée. Variante — différente de CP-3 pour cette route.**

Middleware `[validApiKey]` présent — confirmé par lecture directe (v2). CP-3 spécifiait `[validatedRequest, flexUserRoleValid([ROLES.admin])]` pour cette route ; l'implémentation réelle utilise `[validApiKey]`.

Ces deux mécanismes ne sont pas équivalents du point de vue des droits d'accès :

| Mécanisme | Prérequis | Contrôle de rôle |
|---|---|---|
| `[validatedRequest, flexUserRoleValid([ROLES.admin])]` (CP-3 documenté) | Session utilisateur authentifié | Oui — rôle admin requis |
| `[validApiKey]` (implémentation réelle) | Clé API valide dans l'en-tête | Non — toute clé API valide suffit |

`[validApiKey]` vérifie la possession d'une clé API valide, non le rôle de son détenteur. Ne pas présenter ces deux mécanismes comme équivalents en termes de sécurité.

**Note importante :** `dumpENV()` réécrit le fichier `.env` avec les variables retenues par son mécanisme de filtrage. Cette route ne doit pas être invoquée en production pour test. Les routes de production ne font l'objet d'aucun test fonctionnel dans ce rapport.

### 4.3 Correctif PUR-02 sur `system.js`

**Statut : Absent en production — inchangé par rapport à la version 1.**

Le gestionnaire `purgeFolder` retourne HTTP 200 sans corps JSON en cas d'erreur. La version fixlab/lab corrige ce comportement ; la version production ne l'a pas.

### 4.4 Commentaire `// Intentionally unauthenticated` — incohérence

Les deux routes conservent ce commentaire alors que `[validApiKey]` est présent. Ce commentaire est un vestige non mis à jour. Il est trompeur et devra être corrigé lors d'une intervention future autorisée. Aucune modification en production n'est proposée ici.

### 4.5 Tableau de synthèse CP-3 (version finale)

| Élément | État | Niveau de certitude |
|---|---|---|
| `/v1/system/env-dump` — `[validApiKey]` présent | **Confirmé** | Lecture directe + SHA |
| `/env-dump` — `[validApiKey]` présent | **Confirmé** | Lecture directe |
| CP-3 exact (`b27d886c…`) déployé | **Non démontré** | Mécanisme différent sur `system.js` |
| Variante `[validApiKey]` sur les deux routes | **Présente** | Confirmé |
| Correctif PUR-02 dans `purgeFolder` | **Absent** | Confirmé par diff |
| Validation fonctionnelle en conditions réelles | **Non effectuée** | — |
| Origine et autorisation des modifications | **Non établies** | Aucune décision tracée |

---

## 5. Hypothèses et limites de preuve (version corrigée)

Les hypothèses de la version 1 sont maintenues ou levées selon le cas.

| Hypothèse v1 | Statut v2 |
|---|---|
| H-4.1 : `/env-dump` probablement protégé | **Levée** — confirmé par lecture directe |
| H-4.2 : modifications postérieures au démarrage du conteneur | **Corrigée** — timestamps antérieurs au démarrage ; copie avec préservation de mtime probable |
| H-4.3 : variante lab appliquée en production | **Renforcée** — deux routes confirmées avec `[validApiKey]` |
| H-4.4 : `updateENV.js` et `validApiKey.js` inchangés | Maintenue — absent du docker diff ; comparaison upstream non effectuée |

**Limite principale restante :** L'origine et la date exacte de l'installation des fichiers dans le conteneur de production demeurent inconnues. Aucun journal d'opération ni décision tracée ne couvre cette action.

---

## 6. Corrections documentaires proposées (version actualisée)

Ces propositions sont soumises à la validation de Florian. Aucune n'est appliquée. Elles remplacent celles de la version 1 sur les mêmes points.

### 6.1 Plan-correctifs-AnythingLLM.md (v0.8) — Section D1 / ALLM-12

**Proposition de statut révisé (D1 — 2026-11-10) :**

> **Statut révisé :** Réconciliation ALLM-12 complétée en lecture seule (2026-11-09 → 2026-11-10).  
>  
> — Route `/v1/system/env-dump` (`api/system/index.js`, SHA `825b898e…`) : protection `[validApiKey]` **confirmée en production** (SHA = version lab 28/10 ; lecture directe confirmée).  
> — Route `/env-dump` (`system.js`, SHA `7bf6715a…`) : protection `[validApiKey]` **confirmée en production** (lecture directe ligne 95).  
> — Les deux routes conservent un commentaire `// Intentionally unauthenticated` devenu inexact — vestige non mis à jour.  
> — Mécanisme réel : `[validApiKey]` sur les deux routes — différent de CP-3 pour `system.js` (CP-3 spécifiait `[validatedRequest, flexUserRoleValid([ROLES.admin])]`). `[validApiKey]` ne contrôle pas le rôle administrateur.  
> — CP-3 exact (patch `b27d886c…`) : **non démontré comme déployé**.  
> — Correctif PUR-02 (`purgeFolder`) : **absent** de la version de production.  
> — Origine et autorisation des modifications : **non tracées** dans les documents.  
> — Validation fonctionnelle et de sécurité : **non effectuée**.  
> — Décision sur la suite (application de CP-3 exact, maintien de la variante, PUR-02) : **en attente de validation Florian**.

### 6.2 Journal-des-Incidents.md (v1.3) — Entrée ALLM-12

**Proposition d'ajout à l'entrée ALLM-12 :**

> **Réconciliation 2026-11-09/10 (lecture seule) :**  
> - Route `/env-dump` (`system.js`) : `[validApiKey]` **confirmé** (lecture directe, ligne 95). Commentaire `// Intentionally unauthenticated` trompeur — vestige.  
> - Route `/v1/system/env-dump` (`api/system/index.js`) : `[validApiKey]` **confirmé** (SHA `825b898e…` = lab ; lecture directe, ligne 18).  
> - Variante CP-3 (non CP-3 exact) : présence confirmée. Mécanisme `[validApiKey]` ≠ `[validatedRequest, flexUserRoleValid([ROLES.admin])]` prévu par CP-3 pour `system.js`.  
> - PUR-02 (`purgeFolder`) : absent en production.  
> - Origine des modifications et autorisation : non tracées. `[C17]` protection présente — validation et autorisation à établir.

### 6.3 Livret-Technique-Serveur-IA.md (v0.9) — Section ALLM-12

**Proposition de révision du statut ALLM-12 :**

> CP-3 : variante `[validApiKey]` sur les deux routes confirmée en production (lecture directe 2026-11-10) ; CP-3 exact (patch `b27d886c…`) non démontré déployé ; mécanisme différent de CP-3 pour `system.js` (`[validApiKey]` ≠ contrôle rôle admin) ; PUR-02 absent ; validation fonctionnelle non effectuée ; origine des modifications non tracée.

### 6.4 Répertoire `pur02-sources-1.19.0/`

Proposition inchangée par rapport à la version 1 : renommer ou documenter le contenu réel (versions lab modifiées, non sources originales 1.19.0).

---

## 7. Contrôles complémentaires restants

Les contrôles 7.1 et 7.2 de la version 1 sont désormais exécutés. Les suivants restent ouverts.

### 7.1 ~~Lecture directe de `system.js` en production~~ — ✅ Exécuté

Levé le 2026-11-10. Résultat : `[validApiKey]` ligne 95, confirmé.

### 7.2 ~~Lecture directe de `api/system/index.js` en production~~ — ✅ Exécuté

Levé le 2026-11-10. Résultat : `[validApiKey]` ligne 18, confirmé.

### 7.3 ~~Dates des fichiers (`stat`)~~ — ✅ Exécuté

Levé le 2026-11-10. Voir section 3.

### 7.4 Comparaison avec l'upstream AnythingLLM 1.19.0

**Toujours ouvert.** Confirmer les SHA de référence de `updateENV.js` et `validApiKey.js` depuis le dépôt officiel `Mintplex-Labs/anything-llm` tag `v1.19.0`. Optionnel mais utile pour certification complète.

### 7.5 Localisation du patch CP-3 (`b27d886c…`)

**Toujours ouvert.** Lire le contenu exact du patch pour confirmer les middlewares spécifiés. Si non disponible localement, Florian peut vérifier ses archives.

### 7.6 Validation fonctionnelle minimale en environnement lab isolé

**Toujours ouvert.** Vérifier que les routes retournent HTTP 401/403 sans clé valide, sur un conteneur de lab isolé, jamais sur la production. Nécessite une autorisation explicite de Florian.

---

## Annexe — Historique des versions du rapport

| Version | Date | Modifications |
|---|---|---|
| v1 | 2026-11-09 | Première analyse — protection `/env-dump` qualifiée de « probable » ; hypothèse chronologique incorrecte |
| v2 | 2026-11-10 | C-1 : protection `/env-dump` confirmée (lecture directe) ; C-2 : chronologie corrigée (timestamps antérieurs au démarrage, préservation mtime probable) ; ajout de l'observation sur le commentaire trompeur `// Intentionally unauthenticated` ; tableau de synthèse finalisé |

---

*Rapport produit en lecture seule. Aucun fichier modifié. Propositions documentaires soumises à validation de Florian avant application. Version 1 conservée intégralement.*
