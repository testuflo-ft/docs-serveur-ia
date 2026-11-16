# OPS-02 / ALLM-10 — Protocole de vérification en laboratoire (v2)
## Protection de suppression des workspaces (`WORKSPACE_DELETION_PROTECTION`)

**Date :** 16 novembre 2026  
**Version :** 2 — révision suite aux corrections ChatGPT (chaînes middleware v1.19.0, corps HTTP exacts, isolation Docker complète, mode mono/multi-utilisateur, suppression T-13)  
**Nature :** Protocole de vérification en laboratoire isolé — lecture seule d'abord  
**Contraintes impératives :**
- Aucun test sur la production (`anythingllm`, port 3001)
- Aucune modification de configuration sans validation explicite de Florian
- Aucun redémarrage ni recréation de conteneur sans validation explicite de Florian — et seulement après que la persistance du stockage laboratoire est établie (§2.2)
- Commandes fournies, **non exécutées** — Florian exécute, analyse ensemble
- Aucun test destructif dans ce protocole (T-13 supprimé)

---

## Conventions de sources

| Étiquette | Signification |
|-----------|---------------|
| **[C17]** | Code lu sur le tag v1.17.0 (`fa7ec877`) par Claude |
| **[CM]** | Code lu sur le commit main `a5bb8b9c` par Claude |
| **[C19-GPT]** | Code lu sur le tag officiel v1.19.0 par ChatGPT — **non revérifié par Claude** (GitHub non accessible en WebFetch depuis cette session) |
| **[PROD]** | Relevé sur la production (minimac), rapporté par bilan ChatGPT 28/10/2026 — non revérifié par Claude |

---

## 1. Identification des trois routes

### 1.1 Tableau de synthèse

| Route | Méthode | Chemin HTTP | Fichier source | Chaîne middleware complète |
|-------|---------|-------------|---------------|---------------------------|
| **A — Admin web** | `DELETE` | `/admin/workspaces/:id` | `server/endpoints/admin.js` l.300 [C17] | `[validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager]), workspaceDeletionProtection]` **[C19-GPT]** |
| **B — Workspace web** | `DELETE` | `/workspace/:slug` | `server/endpoints/workspaces.js` l.302 [C17] / l.303 [CM] | `[validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager]), workspaceDeletionProtection]` **[C19-GPT]** |
| **C — API REST** | `DELETE` | `/v1/workspace/:slug` | `server/endpoints/api/workspace/index.js` l.230 [C17] | `[validApiKey, workspaceDeletionProtection]` **[C17][C19-GPT]** |

**Paramètre `:id` (Route A) :** identifiant numérique du workspace (entier).  
**Paramètre `:slug` (Routes B et C) :** slug textuel du workspace (ex. `test-workspace`).

### 1.2 Code source du middleware [C17][CM]

```javascript
// server/utils/middleware/workspaceDeletionProtection.js (18 lignes)
function workspaceDeletionProtection(request, response, next) {
  if (!("WORKSPACE_DELETION_PROTECTION" in process.env)) return next();
  return response.status(403).json({
    success: false,
    error: "Workspace deletion is blocked by the system administrator.",
  });
}
```

**Point clé absolu :** la condition porte sur la **présence de la clé** dans `process.env` — pas sur sa valeur. `WORKSPACE_DELETION_PROTECTION=false`, `=0`, `=""` activent tous la protection de la **même façon** que `=true` ou `=1`.

### 1.3 Corps HTTP exacts des middlewares d'authentification

| Middleware | Situation | Code HTTP | Corps exact |
|------------|-----------|-----------|-------------|
| `validApiKey` | Clé absente ou invalide | 403 | `{"error":"No valid api key found."}` **[C19-GPT]** |
| `workspaceDeletionProtection` | Variable présente | 403 | `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}` [C17][CM] |
| Handler `/v1/workspace/:slug` | Variable absente, slug inexistant | **400** | *(aucun corps JSON)* **[C19-GPT]** |
| Handler `/v1/workspace/:slug` | Variable absente, slug existant | 200 | *(aucun corps JSON)* **[C19-GPT]** |

Ces corps permettront de distinguer sans ambiguïté quel middleware ou handler a répondu.

### 1.4 Impact du mode mono-utilisateur / multi-utilisateur

Les Routes A et B comportent un middleware de vérification de rôle dont le comportement dépend du mode de l'instance :

| Middleware | Mode multi-utilisateur | Mode mono-utilisateur |
|------------|----------------------|----------------------|
| `strictMultiUserRoleValid([ROLES.admin, ROLES.manager])` | Vérifie que le rôle du compte est admin ou manager — rejette sinon | Passe directement (`next()`) — rôle non vérifié |
| `flexUserRoleValid([ROLES.admin, ROLES.manager])` | Vérifie que le rôle du compte est admin ou manager — rejette sinon | Passe directement (`next()`) — rôle non vérifié |

**Conséquence pour les tests T-06 et T-07 :**
- En mode **multi-utilisateur** : le token de session doit appartenir à un compte admin ou manager. Un compte `florian` (rôle standard) serait rejeté avant d'atteindre `workspaceDeletionProtection`.
- En mode **mono-utilisateur** : n'importe quel token de session valide suffit — le vérificateur de rôle passe sans contrôle.

Le mode du laboratoire sera établi en Phase 0 (commande 0i). Les tests T-06 et T-07 seront interprétés en fonction du mode constaté.

### 1.5 Comportement attendu synthétique

| Route | Situation | Code attendu | Corps attendu |
|-------|-----------|-------------|---------------|
| C | Sans auth | 403 | `{"error":"No valid api key found."}` |
| C | Auth invalide | 403 | `{"error":"No valid api key found."}` |
| C | Auth valide + var. présente | **403** | `{"success":false,"error":"Workspace deletion is blocked..."}` |
| C | Auth valide + var. absente + slug inexistant | **400** | *(aucun corps)* |
| B | Sans auth | 403 (depuis `validatedRequest`) | corps ≠ protection workspace |
| B | Auth valide + var. présente | **403** | `{"success":false,"error":"Workspace deletion is blocked..."}` |
| A | Sans auth | 403 (depuis `validatedRequest`) | corps ≠ protection workspace |
| A | Auth valide + var. présente | **403** | `{"success":false,"error":"Workspace deletion is blocked..."}` |

---

## 2. Préconditions du laboratoire

### 2.1 Exigence critique : port HTTP publié

Le conteneur `anythingllm-fixlab` utilisé pour PUR-02 **n'avait pas de port publié** [Journal 28/10/2026]. OPS-02 nécessite un conteneur avec un port HTTP accessible pour les tests `curl`. Si aucun tel conteneur n'existe, sa création est la première étape (sur validation de Florian, et seulement après établissement de la persistance du stockage — §2.2).

### 2.2 Persistance du stockage après recréation — point bloquant

**Aucune commande de recréation de conteneur ne sera proposée tant que la persistance du stockage laboratoire n'est pas établie.**

La recréation du conteneur (`docker compose up --force-recreate`) détruit les données si elles sont stockées dans la couche inscriptible du conteneur. Elle les préserve si elles sont dans un **volume nommé** ou un **bind mount**.

La commande 0b (Phase 0) établira la nature du stockage. L'interprétation est la suivante :

| Type de montage constaté en 0b | Persistance après recréation | Action |
|-------------------------------|------------------------------|--------|
| Volume nommé (ex. `anythingllm-lab:/app/server/storage`) | ✅ Les données persistent | Recréation sûre pour les phases 2, 3, 4 |
| Bind mount (ex. `/chemin/local:/app/server/storage`) | ✅ Les données persistent | Recréation sûre pour les phases 2, 3, 4 |
| Aucun montage (stockage dans la couche conteneur) | ⚠️ Les données sont perdues à chaque recréation | Signaler à Florian — il faut ajouter un volume avant de continuer |

Si le stockage n'est pas persistant, chaque changement de valeur de la variable (Phases 2, 3, 4) détruira les workspaces et la clé API du lab. Il faudra les recréer entre chaque phase.

---

## 3. Phase 0 — Lecture seule (aucune validation, aucune modification)

Exécuter dans l'ordre. Partager **tous les résultats bruts** avant de continuer.

### 0a — Inventaire des conteneurs actifs

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
```

**Critère de succès :** le conteneur de production `anythingllm` est visible sur le port 3001. Un conteneur de laboratoire distinct est identifiable sur un port différent.  
**Si aucun conteneur lab avec port publié :** s'arrêter ici et signaler à Florian avant de continuer.

---

### 0b — Isolation : vérifier tous les montages du conteneur de lab

```bash
docker inspect LAB_CONTAINER --format '{{json .Mounts}}' | python3 -m json.tool
```

*(Remplacer `LAB_CONTAINER` par le nom réel du conteneur de laboratoire.)*

**Critère de succès :** aucun chemin de production dans la sortie — absent : volume nommé `anythingllm`, chemins `~/services/ai-stack/`, `/Users/florian/IA/Corpus-IA`, `/Users/florian/NAS-Home-Test/Travail`.

**À relever :** la nature du montage du stockage applicatif (`/app/server/storage`) — volume nommé, bind mount, ou absent (couche conteneur). Ce résultat détermine si les recréations des Phases 2, 3, 4 sont sûres (§2.2).

> **Note :** `.Mounts` est utilisé ici (et non `.HostConfig.Binds`) car il liste l'ensemble des volumes — y compris les volumes nommés et les montages anonymes — là où `.HostConfig.Binds` ne listerait que les bind mounts explicites.

---

### 0c — Isolation : vérifier l'image du conteneur de lab

```bash
docker inspect LAB_CONTAINER --format '{{.Image}}'
```

**Critère de succès :** `sha256:ddf73304a4a96e2f90755d620dd3921de9afb4b8b8e914fa62d6ce7944ba95af` (AnythingLLM 1.19.0 arm64) — identique à la production.

---

### 0d — État de la variable de protection dans le lab

```bash
docker exec LAB_CONTAINER env | grep WORKSPACE_DELETION_PROTECTION
```

**Résultat à relever :** aucune sortie (absente) ou `WORKSPACE_DELETION_PROTECTION=VALEUR`. **Ne pas supposer l'état — le lire.**

---

### 0e — Présence des variables sensibles sans afficher leurs valeurs

```bash
for VAR in NODE_ENV AUTH_TOKEN JWT_SECRET MULTI_USER_MODE; do
  COUNT=$(docker exec LAB_CONTAINER env | grep -c "^${VAR}=")
  echo "${VAR}: ${COUNT}  (1=présente, 0=absente)"
done
```

**Résultat à relever :** présence ou absence de chacune. Aucune valeur n'est affichée.  
**Interprétation de `MULTI_USER_MODE` :** si présente → mode multi-utilisateur actif → les vérificateurs de rôle (`strictMultiUserRoleValid`, `flexUserRoleValid`) contrôlent effectivement le rôle. Si absente → mode mono-utilisateur → vérificateurs de rôle passent sans contrôle de rôle (voir §1.4).

---

### 0f — Vérification des chaînes middleware Routes A et B depuis l'image lab

```bash
docker exec LAB_CONTAINER grep -n \
  "workspaceDeletionProtection\|strictMultiUserRoleValid\|flexUserRoleValid\|validatedRequest" \
  /app/server/endpoints/admin.js /app/server/endpoints/workspaces.js
```

**Résultat à relever :** les lignes contenant ces middlewares dans les deux fichiers. Permet de confirmer [C19-GPT] directement sur l'image en cours d'exécution.

---

### 0g — Le serveur HTTP du lab répond

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:LAB_PORT/
```

**Critère de succès :** `HTTP 200`.

---

### 0h — Lister les workspaces dans le lab et obtenir slug/id

```bash
curl -s -X GET http://localhost:LAB_PORT/v1/workspaces \
  -H "Authorization: Bearer LAB_API_KEY" | python3 -m json.tool
```

**Résultat à relever :** `slug` et `id` numérique du workspace de test (`WORKSPACE_SLUG` et `WORKSPACE_ID`).  
**Si la liste est vide :** signaler à Florian — un workspace doit être créé avant de continuer.

---

### 0i — Valider la clé API du lab (Route C)

```bash
curl -s -X GET http://localhost:LAB_PORT/v1/auth \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

**Critère de succès :** `{"authenticated":true}` avec HTTP 200.

---

### 0j — Obtenir un token de session admin du lab (Routes A et B)

```bash
curl -s -X POST http://localhost:LAB_PORT/api/request-token \
  -H "Content-Type: application/json" \
  -d '{"username":"LAB_USERNAME","password":"LAB_PASSWORD"}' \
  -w "\nHTTP %{http_code}\n" | python3 -m json.tool
```

**Résultat à relever :** le champ `token`. Conserver comme `LAB_SESSION_TOKEN`.  
**En mode multi-utilisateur :** utiliser un compte de rôle admin ou manager. Un compte de rôle standard serait rejeté en T-06 et T-07 par le middleware de rôle avant d'atteindre `workspaceDeletionProtection`.

---

## 4. Variables de substitution

Avant d'exécuter les commandes des phases 1 à 4, remplacer toutes les occurrences :

| Placeholder | Valeur à substituer |
|-------------|---------------------|
| `LAB_CONTAINER` | Nom du conteneur de laboratoire |
| `LAB_PORT` | Port HTTP publié du laboratoire |
| `LAB_API_KEY` | Clé API valide dans la base du laboratoire |
| `LAB_SESSION_TOKEN` | Token JWT de session obtenu en 0j |
| `WORKSPACE_SLUG` | Slug du workspace de test (ex. `test-workspace`) |
| `WORKSPACE_ID` | Identifiant numérique du workspace de test |
| `FAKE_SLUG` | Slug inexistant garanti (ex. `workspace-factice-99999`) |
| `FAKE_ID` | ID numérique inexistant garanti (ex. `99999`) |

---

## 5. Phase 1 — Variable présente, valeur `true`

**Précondition :** `WORKSPACE_DELETION_PROTECTION=true` dans le lab (état actuel en production [PROD]).  
**Recréation de conteneur requise :** Non — si l'état est confirmé par 0d.  
**Risque pour le workspace :** Aucun — le middleware retourne 403 avant d'atteindre le handler.

---

### 5.1 Contrôles d'authentification préalables (non-destructifs)

**T-01 — Route C sans aucune authentification**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/v1/workspace/WORKSPACE_SLUG \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Corps attendu : `{"error":"No valid api key found."}` [C19-GPT]  
Critère de succès : le corps correspond au message de `validApiKey` — **différent** du message de `workspaceDeletionProtection`. Confirme que `validApiKey` intercepte en premier.

---

**T-02 — Route C avec clé API invalide**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/v1/workspace/WORKSPACE_SLUG \
  -H "Authorization: Bearer cle-api-invalide-xxxxxxxxxxx" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Corps attendu : `{"error":"No valid api key found."}` [C19-GPT]  
Critère de succès : même corps qu'en T-01 — confirme que `validApiKey` intercepte aussi une clé syntaxiquement valide mais inconnue.

---

**T-03 — Route B sans authentification**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/workspace/WORKSPACE_SLUG \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403** (depuis `validatedRequest`)  
Corps attendu : message relatif à l'authentification de session — **différent** de `{"success":false,"error":"Workspace deletion is blocked..."}`.  

**Critère de distinction :** si le corps contient `"Workspace deletion is blocked by the system administrator."`, c'est `workspaceDeletionProtection` qui a répondu, non `validatedRequest` — ce serait une erreur d'ordre de middleware.  
**Relever le code exact et le corps complet.**

---

**T-04 — Route A sans authentification**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/admin/workspaces/WORKSPACE_ID \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403** (depuis `validatedRequest`)  
Corps attendu : message relatif à l'authentification de session — **différent** de `{"success":false,"error":"Workspace deletion is blocked..."}`.  

**Critère de distinction :** même logique qu'en T-03 — relever le code et le corps complets.

---

### 5.2 Protection active — auth valide — workspace existant

**T-05 — Route C, clé API valide, variable `true`, workspace existant** ⭐ Test principal

```bash
curl -s -X DELETE http://localhost:LAB_PORT/v1/workspace/WORKSPACE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Corps attendu : `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}`  
Critère de succès : code 403 avec exactement ce corps — confirme que `workspaceDeletionProtection` est actif sur Route C.

---

**T-06 — Route B, session valide, variable `true`, workspace existant** ⭐ Test principal

```bash
curl -s -X DELETE http://localhost:LAB_PORT/workspace/WORKSPACE_SLUG \
  -H "Authorization: Bearer LAB_SESSION_TOKEN" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Corps attendu : `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}`  
**Prérequis selon le mode (voir 0e) :**  
- Mode **multi-utilisateur** : le token doit appartenir à un compte admin ou manager. Si le token est d'un compte standard, la réponse sera 403 avec un corps relatif au rôle (depuis `flexUserRoleValid`), non relatif à la protection workspace — les deux 403 sont donc distincts.  
- Mode **mono-utilisateur** : n'importe quel token valide suffit — `flexUserRoleValid` passe sans contrôle de rôle.

---

**T-07 — Route A, session admin valide, variable `true`, workspace existant** ⭐ Test principal

```bash
curl -s -X DELETE http://localhost:LAB_PORT/admin/workspaces/WORKSPACE_ID \
  -H "Authorization: Bearer LAB_SESSION_TOKEN" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Corps attendu : `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}`  
**Prérequis selon le mode :**  
- Mode **multi-utilisateur** : le token doit appartenir à un compte admin ou manager (rôle vérifié par `strictMultiUserRoleValid`).  
- Mode **mono-utilisateur** : n'importe quel token valide suffit — `strictMultiUserRoleValid` passe sans contrôle de rôle.

---

**Vérification de préservation du workspace — après T-05, T-06, T-07**

```bash
curl -s -X GET http://localhost:LAB_PORT/v1/workspace/WORKSPACE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n" | python3 -m json.tool
```

Critère de succès : workspace présent dans la réponse (`workspace` non null, HTTP 200). Confirme que les trois 403 n'ont touché ni supprimé le workspace.

---

### 5.3 Protection active — slug inexistant (contrôle d'ordre middleware, non-destructif)

**T-08 — Route C, auth valide, variable `true`, workspace INEXISTANT**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/v1/workspace/FAKE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Corps attendu : `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}`  
Critère de succès : **identique à T-05** — confirme que le middleware intervient avant tout lookup du workspace. Si le résultat était 400 (ou 404) au lieu de 403, le middleware ne serait pas correctement positionné avant le handler.

---

## 6. Phase 2 — Variable présente, valeur `1`

**⚠️ ARRÊT — VALIDATION DE FLORIAN REQUISE avant cette phase.**

**Prérequis :** persistance du stockage lab établie (§2.2 — résultat de 0b).  
**Objectif :** confirmer que la présence seule suffit — une valeur numérique `1` active aussi la protection.  
**Modification :** changer `WORKSPACE_DELETION_PROTECTION` de `true` à `1` → recréation du conteneur lab.

**Commandes de modification — NE PAS EXÉCUTER sans validation**

Si le lab utilise `docker compose` :
```bash
# 1. Modifier la valeur dans le fichier compose du lab (WORKSPACE_DELETION_PROTECTION=1)
# 2. Recréer le seul conteneur lab :
docker compose -f LAB_COMPOSE_FILE up -d --no-deps --force-recreate LAB_SERVICE_NAME
```

Si le lab utilise `docker run` :
```bash
docker stop LAB_CONTAINER && docker rm LAB_CONTAINER
docker run -d --name LAB_CONTAINER \
  -p LAB_PORT:3001 \
  -e WORKSPACE_DELETION_PROTECTION=1 \
  [autres paramètres du conteneur de lab inchangés]
```

**Vérification post-modification (obligatoire avant T-09) :**

```bash
docker exec LAB_CONTAINER env | grep WORKSPACE_DELETION_PROTECTION
```

Attendu : `WORKSPACE_DELETION_PROTECTION=1`

---

**T-09 — Route C, auth valide, variable `1`, workspace existant**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/v1/workspace/WORKSPACE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Corps attendu : `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}`  
Critère de succès : identique à T-05 — **confirme que la valeur `1` active la protection, comme `true`.**

---

## 7. Phase 3 — Variable présente, valeur `false`

**⚠️ ARRÊT — VALIDATION DE FLORIAN REQUISE avant cette phase.**

**Prérequis :** persistance du stockage lab établie (résultat de 0b).  
**Objectif :** confirmer que `false` n'est pas interprété comme « désactivé » — la présence seule suffit.  
**Stratégie :** utiliser `FAKE_SLUG` (workspace inexistant) — non-destructif quel que soit le résultat.  
**⚠️ Alerte :** si contrairement au code source, la valeur `false` était parsée comme une désactivation, le test avec `FAKE_SLUG` retournerait **400** (handler atteint) au lieu de 403. Ce résultat doit être signalé immédiatement.

**Commandes de modification — NE PAS EXÉCUTER sans validation**

```bash
# Modifier : WORKSPACE_DELETION_PROTECTION=false
# Recréer le conteneur lab (même procédure que Phase 2)
```

**Vérification post-modification :**

```bash
docker exec LAB_CONTAINER env | grep WORKSPACE_DELETION_PROTECTION
```

Attendu : `WORKSPACE_DELETION_PROTECTION=false`

---

**T-10 — Route C, auth valide, variable `false`, workspace INEXISTANT**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/v1/workspace/FAKE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403** (si présence seule suffit — comportement conforme au code)  
Corps attendu : `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}`

Code alternatif : **400** sans corps (si valeur `false` est interprétée comme désactivation — comportement inattendu — handler atteint)  
**⚠️ Si 400 :** la protection est inactive avec `false` — signaler immédiatement, ne pas continuer.

---

**T-11 — Route C, auth valide, variable `0`, workspace INEXISTANT** *(optionnel)*

*(Si Florian souhaite vérifier `0` aussi — même procédure : modifier la valeur en `0`, recréer, vérifier.)*

```bash
curl -s -X DELETE http://localhost:LAB_PORT/v1/workspace/FAKE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**

---

## 8. Phase 4 — Variable absente (aucune protection)

**⚠️ ARRÊT — VALIDATION DE FLORIAN REQUISE avant cette phase.**

**Prérequis :** persistance du stockage lab établie (résultat de 0b).  
**Objectif :** confirmer que `next()` est appelé quand la variable est absente — le handler est réellement atteint.  
**Stratégie :** utiliser `FAKE_SLUG` (workspace inexistant) — le handler retourne **400** sans corps [C19-GPT], ce qui démontre qu'il a été atteint sans rien supprimer.

**Commandes de modification — NE PAS EXÉCUTER sans validation**

```bash
# Retirer la variable WORKSPACE_DELETION_PROTECTION du fichier compose du lab (ou ne pas la passer en docker run)
# Recréer le conteneur lab
```

**Vérification post-modification :**

```bash
docker exec LAB_CONTAINER env | grep WORKSPACE_DELETION_PROTECTION
```

Attendu : **aucune sortie** — confirme que la variable est absente du processus.

---

**T-12 — Route C, auth valide, variable ABSENTE, workspace INEXISTANT** ⭐ Test décisif non-destructif

```bash
curl -s -X DELETE http://localhost:LAB_PORT/v1/workspace/FAKE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **400** sans corps JSON [C19-GPT]  
Critère de succès : code **400** — confirme que `next()` a été appelé et que le handler a reçu la requête. Le code 400 (différent de 403) démontre que `workspaceDeletionProtection` n'a pas intercepté la requête.

**Ce test est suffisant pour valider le comportement « variable absente → handler atteint ».** Aucun workspace réel n'est supprimé.

---

## 9. Matrice de tests — résumé v2

| Test | Route | Auth | Variable | Workspace | Code attendu | Corps (clé) | Phase |
|------|-------|------|----------|-----------|-------------|-------------|-------|
| T-01 | C | Absent | true | Existant | **403** | `"error":"No valid api key found."` | 1 |
| T-02 | C | Invalide | true | Existant | **403** | `"error":"No valid api key found."` | 1 |
| T-03 | B | Absent | true | Existant | **403** | corps ≠ protection workspace | 1 |
| T-04 | A | Absent | true | Existant | **403** | corps ≠ protection workspace | 1 |
| T-05 | C | Valide API | true | Existant | **403** | `"error":"Workspace deletion is blocked..."` | 1 |
| T-06 | B | Valide session (admin/mgr si multi-util.) | true | Existant | **403** | `"error":"Workspace deletion is blocked..."` | 1 |
| T-07 | A | Valide session (admin/mgr si multi-util.) | true | Existant | **403** | `"error":"Workspace deletion is blocked..."` | 1 |
| — | C | Valide API | — | Existant | **200** | workspace présent (GET) | 1 |
| T-08 | C | Valide API | true | **Inexistant** | **403** | `"error":"Workspace deletion is blocked..."` | 1 |
| T-09 | C | Valide API | **1** | Existant | **403** | `"error":"Workspace deletion is blocked..."` | 2 |
| T-10 | C | Valide API | **false** | **Inexistant** | **403** | `"error":"Workspace deletion is blocked..."` | 3 |
| T-11 | C | Valide API | **0** | **Inexistant** | **403** | (optionnel) | 3 |
| T-12 | C | Valide API | **absente** | **Inexistant** | **400** | *(aucun corps)* | 4 |

---

## 10. Critères de réussite globaux

### OPS-02 validé si toutes les conditions suivantes sont réunies

1. **Routes A, B, C** retournent toutes HTTP **403** avec le corps `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}` lorsque `WORKSPACE_DELETION_PROTECTION=true` (T-05, T-06, T-07).

2. Le workspace est **préservé** après T-05, T-06, T-07 (vérification GET).

3. T-01 et T-02 retournent **403** avec le corps `{"error":"No valid api key found."}` — corps différent du message de protection workspace — confirme que `validApiKey` intercepte avant `workspaceDeletionProtection`.

4. T-03 et T-04 retournent un **corps différent** de `{"success":false,"error":"Workspace deletion is blocked..."}` — confirme que `validatedRequest` intercepte avant `workspaceDeletionProtection`.

5. T-08 retourne **403** même pour un slug inexistant — confirme que le middleware intervient avant le lookup du workspace.

6. **Route C** retourne **403** avec la valeur `1` (T-09) — présence seule suffit.

7. **Route C** retourne **403** avec la valeur `false` (T-10) — `false` n'est pas interprété comme désactivation.

8. **Route C** retourne **400** (sans corps) lorsque la variable est absente et le slug inexistant (T-12) — `next()` est appelé, le handler est atteint.

### ⚠️ Alertes immédiates — signaler et stopper

| Résultat observé | Signification | Action |
|-----------------|---------------|--------|
| T-05, T-06, ou T-07 retourne **200** | Protection non active malgré variable présente | ⛔ Arrêt — analyser la chaîne middleware |
| T-01 ou T-02 retourne un corps `"Workspace deletion is blocked..."` | `validApiKey` absent ou mal positionné — faille | ⛔ Arrêt — analyser la chaîne Route C |
| T-03 ou T-04 retourne un corps `"Workspace deletion is blocked..."` | `validatedRequest` absent ou mal positionné — faille | ⛔ Arrêt — analyser les chaînes Routes A et B |
| T-08 retourne **400** au lieu de 403 | Middleware intervient après le lookup du workspace — ordre incorrect | ⛔ Arrêt — analyser la chaîne middleware |
| T-10 retourne **400** au lieu de 403 | Valeur `false` interprétée comme désactivation — différent du code source | ⛔ Arrêt — signaler immédiatement |
| T-12 retourne **403** | Middleware actif sans la variable — variable héritée d'une autre source ? | ⛔ Arrêt — revoir l'environnement du conteneur |

---

## 11. Ordre d'exécution

```
Phase 0 (lecture seule — aucune validation requise)
  → 0a : inventaire conteneurs
  → 0b : vérification montages lab (.Mounts) — détermine la persistance du stockage
  → 0c : vérification image lab
  → 0d : état de la variable WORKSPACE_DELETION_PROTECTION
  → 0e : présence NODE_ENV / AUTH_TOKEN / JWT_SECRET / MULTI_USER_MODE (sans valeurs)
  → 0f : vérification middleware Routes A et B depuis l'image lab
  → 0g : test HTTP de base (serveur vivant ?)
  → 0h : liste des workspaces dans le lab
  → 0i : validation clé API
  → 0j : obtention token session admin
  → Partager tous les résultats bruts

[ARRÊT] — Florian valide les préconditions lab.
        Si aucun conteneur lab avec port : créer le lab (validation Florian, après établissement de la persistance).
        Si aucun workspace dans le lab : en créer un (validation Florian).
        Si stockage non persistant (0b) : ajouter un volume avant tout (validation Florian).

Phase 1 (variable = true — aucune modification si déjà en place)
  → T-01, T-02 : Route C sans auth / auth invalide (contrôle d'authentification)
  → T-03 : Route B sans auth (contrôle d'authentification + distinction corps)
  → T-04 : Route A sans auth (contrôle d'authentification + distinction corps)
  → T-05 : Route C, auth valide, workspace existant ⭐
  → T-06 : Route B, auth valide, workspace existant ⭐
  → T-07 : Route A, auth valide, workspace existant ⭐
  → Vérification préservation workspace (GET)
  → T-08 : Route C, auth valide, workspace inexistant (contrôle ordre middleware)
  → Partager tous les résultats bruts

[ARRÊT] — Florian valide avant Phase 2 (recréation conteneur lab).

Phase 2 (variable = 1)
  → Vérification post-modification
  → T-09 : Route C, auth valide, workspace existant
  → Partager les résultats

[ARRÊT] — Florian valide avant Phase 3 (recréation conteneur lab).

Phase 3 (variable = false)
  → Vérification post-modification
  → T-10 : Route C, auth valide, workspace INEXISTANT
  → T-11 (optionnel, valeur 0)
  → Partager les résultats

[ARRÊT] — Florian valide avant Phase 4 (recréation conteneur lab, variable absente).

Phase 4 (variable absente)
  → Vérification post-modification
  → T-12 : Route C, auth valide, workspace INEXISTANT ⭐ (non-destructif — HTTP 400 attendu)
  → Partager les résultats — OPS-02 complet
```

---

## 12. Corrections appliquées par rapport à la version 1

| Correction | v1 | v2 |
|-----------|-----|-----|
| Chaîne middleware Route A | `[…auth admin…]` **[hyp]** | `[validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager]), workspaceDeletionProtection]` **[C19-GPT]** |
| Chaîne middleware Route B | `[validatedRequest, workspaceDeletionProtection]` **[hyp]** | `[validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager]), workspaceDeletionProtection]` **[C19-GPT]** |
| Corps T-01/T-02 | `{"success":false,"message":"Invalid API key"}` | `{"error":"No valid api key found."}` **[C19-GPT]** |
| Code T-12 (variable absente, slug inexistant) | 404 attendu | **400** attendu, sans corps **[C19-GPT]** |
| Critère T-03/T-04 | Code 4xx suffisant | Corps à comparer — doit être **différent** du message de protection workspace |
| Impact mono/multi-utilisateur | Non traité | Expliqué en §1.4 — impact sur T-06, T-07 et prérequis du token |
| Isolation Docker | `.HostConfig.Binds` seulement | **`.Mounts`** — liste tous les types de montages |
| Persistance stockage lab | Non abordée | §2.2 — point bloquant avant toute recréation |
| Commandes de recréation | Proposées d'emblée | Conditionnées à l'établissement de la persistance |
| T-13 (destructif) | Présent (optionnel) | **Supprimé** — T-12 (HTTP 400) est suffisant |
| Commande 0f | Absente | Ajoutée — vérifie les chaînes middleware Routes A et B depuis l'image lab |
| Commande 0e | Absente | Ajoutée — présence NODE_ENV/AUTH_TOKEN/JWT_SECRET/MULTI_USER_MODE sans valeurs |

---

*OPS-02 / ALLM-10 — Protocole de vérification en laboratoire v2 — 16 novembre 2026*  
*Lecture seule. Aucun fichier modifié, aucune branche modifiée, aucun test exécuté.*  
*Sources : [C17] tag v1.17.0, [CM] commit a5bb8b9c, [C19-GPT] tag v1.19.0 (lu par ChatGPT — non revérifié par Claude), [PROD] bilan 28/10/2026 (rapporté, non revérifié par Claude).*
