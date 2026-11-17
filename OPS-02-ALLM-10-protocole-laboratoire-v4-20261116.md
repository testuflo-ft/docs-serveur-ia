# OPS-02 / ALLM-10 — Protocole de vérification en laboratoire (v4)
## Protection de suppression des workspaces (`WORKSPACE_DELETION_PROTECTION`)

**Date :** 16 novembre 2026  
**Version :** 4 — corrections v4 : `docker ps -a` (conteneurs arrêtés visibles) ; 0b-db systématique et sans affichage de valeurs ; T-04 — distinction du comportement Route A en mono-utilisateur ; 0j — extraction token adaptée aux deux modes, sans affichage de fragment ; 0g — route `/api/v1/auth` (sans clé) à la place de `/api/` ; T-11 — étape de recréation ajoutée ; Phase 1 — précondition sur la valeur effective de la variable.  
**Nature :** Protocole de vérification en laboratoire isolé — lecture seule d'abord  
**Contraintes impératives :**
- Aucun test sur la production (`anythingllm`, port 3001)
- Aucune modification de configuration sans validation explicite de Florian
- Aucun redémarrage ni recréation de conteneur sans validation explicite de Florian — et seulement après que la persistance du stockage laboratoire est établie (§2.2)
- Commandes fournies, **non exécutées** — Florian exécute, analyse ensemble
- Aucun test destructif dans ce protocole

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

> **Note importante :** dans `server/index.js`, le routeur principal est monté sur `/api` : `app.use("/api", apiRouter)` [C19-GPT]. Toutes les URL HTTP portent donc le préfixe `/api`.

| Route | Méthode | Chemin HTTP complet | Fichier source | Chaîne middleware complète |
|-------|---------|---------------------|---------------|---------------------------|
| **A — Admin web** | `DELETE` | `/api/admin/workspaces/:id` | `server/endpoints/admin.js` l.300 [C17] | `[validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager]), workspaceDeletionProtection]` **[C19-GPT]** |
| **B — Workspace web** | `DELETE` | `/api/workspace/:slug` | `server/endpoints/workspaces.js` l.302 [C17] / l.303 [CM] | `[validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager]), workspaceDeletionProtection]` **[C19-GPT]** |
| **C — API REST** | `DELETE` | `/api/v1/workspace/:slug` | `server/endpoints/api/workspace/index.js` l.230 [C17] | `[validApiKey, workspaceDeletionProtection]` **[C17][C19-GPT]** |

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

### 1.3 Corps HTTP exacts des middlewares

| Middleware | Situation | Code HTTP | Corps exact |
|------------|-----------|-----------|-------------|
| `validApiKey` | Clé absente ou invalide | 403 | `{"error":"No valid api key found."}` **[C19-GPT]** |
| `validatedRequest` | Token de session absent ou invalide | **401** | corps relatif à l'authentification **[C19-GPT]** |
| `strictMultiUserRoleValid` | Mode mono-utilisateur (quel que soit le bypass de `validatedRequest`) | **401** | **[C19-GPT]** |
| `strictMultiUserRoleValid` | Mode multi-util., rôle insuffisant | **403** | **[C19-GPT]** |
| `workspaceDeletionProtection` | Variable présente | 403 | `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}` [C17][CM] |
| Handler `/api/v1/workspace/:slug` | Variable absente, slug inexistant | **400** | *(aucun corps JSON)* **[C19-GPT]** |
| Handler `/api/v1/workspace/:slug` | Variable absente, slug existant | 200 | *(aucun corps JSON)* **[C19-GPT]** |

### 1.4 Impact du mode mono-utilisateur / multi-utilisateur

Le mode multi-utilisateur est stocké **en base de données** (paramètre `multi_user_mode`, lu par `SystemSettings.isMultiUserMode()`) — il n'existe pas de variable d'environnement `MULTI_USER_MODE` [C19-GPT]. Le mode effectif sera déterminé en Phase 0 via l'API (commande 0e).

| Middleware | Mode multi-utilisateur | Mode mono-utilisateur |
|------------|----------------------|----------------------|
| `strictMultiUserRoleValid([ROLES.admin, ROLES.manager])` *(Route A)* | Vérifie que le rôle du compte est admin ou manager — rejette sinon | **HTTP 401 — refuse l'accès** [C19-GPT] |
| `flexUserRoleValid([ROLES.admin, ROLES.manager])` *(Route B)* | Vérifie que le rôle du compte est admin ou manager — rejette sinon | Passe directement (`next()`) — rôle non vérifié [C19-GPT] |

**Code source `strictMultiUserRoleValid` (extrait) [C19-GPT] :**
```javascript
// server/utils/middleware/multiUserProtected.js
if (!multiUserMode) return response.sendStatus(401).end();
```

**Conséquences sur les tests T-03, T-04, T-06, T-07 selon le mode :**

| Test | Route | Mode mono-utilisateur | Mode multi-utilisateur |
|------|-------|-----------------------|------------------------|
| T-03 | B (sans auth) | Si bypass `validatedRequest` actif ¹ → `flexUserRoleValid` passe → **peut atteindre** `workspaceDeletionProtection` | `validatedRequest` retourne 401 — corps ≠ protection workspace |
| T-04 | A (sans auth) | Si bypass `validatedRequest` actif ¹ → `strictMultiUserRoleValid` retourne **401** — **ne peut pas atteindre** `workspaceDeletionProtection` dans ce mode | `validatedRequest` retourne 401 — corps ≠ protection workspace |
| T-06 | B (auth valide) | `flexUserRoleValid` passe — atteint `workspaceDeletionProtection` → **403** attendu | Token d'un compte admin ou manager requis |
| T-07 | A (auth valide) | `strictMultiUserRoleValid` retourne **401** — **T-07 inutilisable** en mono-util. | Token d'un compte admin ou manager requis → **403** attendu |

¹ Bypass `validatedRequest` actif si `NODE_ENV=development` ou si `AUTH_TOKEN`/`JWT_SECRET` absent (relevés en 0e).

**Si le lab est en mode mono-utilisateur :** T-07 ne peut pas valider la Route A — signaler la limitation, ne pas l'exécuter.

### 1.5 Comportement attendu synthétique

| Route | Situation | Code attendu | Corps attendu |
|-------|-----------|-------------|---------------|
| C | Sans auth | 403 | `{"error":"No valid api key found."}` |
| C | Auth invalide | 403 | `{"error":"No valid api key found."}` |
| C | Auth valide + var. présente | **403** | `{"success":false,"error":"Workspace deletion is blocked..."}` |
| C | Auth valide + var. absente + slug inexistant | **400** | *(aucun corps)* |
| B | Sans auth (cond. normales) | **401** | corps relatif auth (≠ protection workspace) |
| B | Auth valide + var. présente | **403** | `{"success":false,"error":"Workspace deletion is blocked..."}` |
| A | Sans auth | **401** | corps relatif auth (≠ protection workspace) |
| A | Auth valide + var. présente + mode multi-util. | **403** | `{"success":false,"error":"Workspace deletion is blocked..."}` |
| A | Auth valide + mode mono-util. | **401** | depuis `strictMultiUserRoleValid` — T-07 non exécutable |

---

## 2. Préconditions du laboratoire

### 2.1 Exigence critique : port HTTP publié

Le conteneur `anythingllm-fixlab` utilisé pour PUR-02 **n'avait pas de port publié** [Journal 28/10/2026]. OPS-02 nécessite un conteneur avec un port HTTP accessible pour les tests `curl`. Si aucun tel conteneur n'existe, sa création est la première étape (sur validation de Florian, et seulement après établissement de la persistance du stockage — §2.2).

### 2.2 Persistance du stockage et isolation de la base de données — point bloquant

**Aucune commande de recréation de conteneur ne sera proposée tant que la persistance du stockage laboratoire et l'indépendance de la base de données ne sont pas établies.**

**Stockage applicatif (`/app/server/storage`) :**

| Type de montage constaté | Persistance après recréation | Action |
|--------------------------|------------------------------|--------|
| Volume nommé (ex. `anythingllm-lab:/app/server/storage`) | ✅ Les données persistent | Recréation sûre |
| Bind mount (ex. `/chemin/local:/app/server/storage`) | ✅ Les données persistent | Recréation sûre |
| Aucun montage (stockage dans la couche conteneur) | ⚠️ Données perdues à chaque recréation | Signaler à Florian — volume à ajouter avant de continuer |

**Base de données :**

AnythingLLM utilise SQLite par défaut dans le répertoire de stockage. Une base externe (PostgreSQL, etc.) peut être configurée en complément. La commande 0b-db vérifie **systématiquement** ces deux points, même si SQLite est présente.

---

## 3. Phase 0 — Lecture seule (aucune validation, aucune modification)

Exécuter dans l'ordre. Partager **tous les résultats bruts** avant de continuer. **Ne pas inclure de tokens, mots de passe, clés ou codes de récupération dans les résultats partagés.**

---

### 0a — Inventaire de tous les conteneurs (actifs et arrêtés)

```bash
docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
```

**Critère de succès :** le conteneur de production `anythingllm` est visible sur le port 3001. `anythingllm-fixlab` apparaît (arrêté, sans port). Un conteneur de laboratoire distinct avec port HTTP est identifiable.  
**Si aucun conteneur lab avec port publié :** s'arrêter ici et signaler à Florian avant de continuer.

---

### 0b — Isolation : vérifier tous les montages du conteneur de lab

```bash
docker inspect LAB_CONTAINER --format '{{json .Mounts}}' | python3 -m json.tool
```

*(Remplacer `LAB_CONTAINER` par le nom réel du conteneur de laboratoire.)*

**À relever :**
- Nature du montage `/app/server/storage` (volume nommé, bind mount, ou absent)
- Aucun chemin de production dans la sortie — absent : volume nommé `anythingllm`, chemins `~/services/ai-stack/`, `/Users/florian/IA/Corpus-IA`, `/Users/florian/NAS-Home-Test/Travail`

> **Note :** `.Mounts` est utilisé ici (et non `.HostConfig.Binds`) car il liste l'ensemble des volumes — y compris volumes nommés et montages anonymes.

---

### 0b-db — Isolation : vérifier l'indépendance de la base de données

Ces deux vérifications sont **systématiques**, même si un fichier SQLite est présent.

```bash
# Vérification 1 : présence du fichier SQLite dans le stockage du lab
docker exec LAB_CONTAINER ls -lh /app/server/storage/anythingllm.db 2>/dev/null \
  && echo "SQLite présente" \
  || echo "SQLite absente"

# Vérification 2 : configuration d'une base externe (présence uniquement, valeurs masquées)
docker exec LAB_CONTAINER env \
  | grep -iE "^(DATABASE_URL|POSTGRES|MYSQL)" \
  | sed 's/=.*/=MASQUÉ/' \
  || echo "Aucune variable de base externe détectée"
```

**Ne pas communiquer les valeurs des variables de base de données.** Seule la présence ou l'absence est à relever.

**Critère de succès :** SQLite présente dans le stockage du lab et aucune variable de base externe — ou base externe confirmée comme distincte de la production. Si une base externe est détectée, signaler à Florian avant de continuer.

---

### 0c — Isolation : vérifier l'image du conteneur de lab

```bash
docker inspect LAB_CONTAINER --format '{{.Image}}'
```

**Critère de succès :** `sha256:ddf73304a4a96e2f90755d620dd3921de9afb4b8b8e914fa62d6ce7944ba95af` (AnythingLLM 1.19.0 arm64).

---

### 0d — État de la variable de protection dans le lab

```bash
docker exec LAB_CONTAINER env | grep WORKSPACE_DELETION_PROTECTION
```

**Résultat à relever :** aucune sortie (absente) ou `WORKSPACE_DELETION_PROTECTION=VALEUR`. **Ne pas supposer l'état — le lire.**

**Ce résultat détermine le point de départ des phases :**
- Si `=true` → Phase 1 s'exécute sans modification du conteneur
- Si valeur différente de `true` (ex. `=1`, `=false`, `=0`) → s'arrêter et signaler à Florian avant la Phase 1 — la séquence doit être adaptée
- Si absente → s'arrêter et signaler à Florian — il faut recréer le conteneur lab avec la variable pour commencer par la Phase 1

---

### 0e — Présence des variables d'authentification et détection du mode multi-utilisateur

```bash
# Vérification de présence des variables sensibles (sans afficher leurs valeurs)
# NODE_ENV : non confidentiel — sa valeur conditionne un bypass de validatedRequest
NODE_VAL=$(docker exec LAB_CONTAINER env | grep "^NODE_ENV=" | cut -d= -f2)
echo "NODE_ENV: ${NODE_VAL:-ABSENTE}"

# AUTH_TOKEN et JWT_SECRET : secrets — présence uniquement
for VAR in AUTH_TOKEN JWT_SECRET; do
  COUNT=$(docker exec LAB_CONTAINER env | grep -c "^${VAR}=")
  echo "${VAR}: $([ "$COUNT" -gt 0 ] && echo 'présente' || echo 'absente')"
done
```

**Interprétation pour T-03 et T-04 :** si `NODE_ENV=development` ou si `AUTH_TOKEN`/`JWT_SECRET` sont absents, `validatedRequest` peut laisser passer des requêtes sans token valide en mode mono-utilisateur [C19-GPT]. Ce bypass est à noter et à considérer dans l'interprétation des résultats.

```bash
# Détection du mode multi-utilisateur via l'API (source de vérité)
curl -s http://localhost:LAB_PORT/api/v1/admin/is-multi-user-mode \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Réponse attendue : `{"isMultiUser":true}` ou `{"isMultiUser":false}`.  
**Ce résultat est décisif pour les préconditions de T-06 et T-07 (voir §1.4).**

---

### 0f — Vérification des chaînes middleware Routes A et B depuis l'image lab

```bash
docker exec LAB_CONTAINER grep -n \
  "workspaceDeletionProtection\|strictMultiUserRoleValid\|flexUserRoleValid\|validatedRequest" \
  /app/server/endpoints/admin.js /app/server/endpoints/workspaces.js
```

**Résultat à relever :** les lignes contenant ces middlewares dans les deux fichiers. Permet de confirmer [C19-GPT] directement sur l'image en cours d'exécution.

---

### 0g — Le serveur HTTP du lab répond et le routage `/api` est actif

```bash
curl -s http://localhost:LAB_PORT/api/v1/auth \
  -w "\nHTTP %{http_code}\n"
```

**Critère de succès :** HTTP **403** avec corps `{"error":"No valid api key found."}` — confirme que le serveur est actif, que le préfixe `/api` est reconnu et que `validApiKey` est opérationnel.  
**Si HTTP 404 :** le routage `/api` ne fonctionne pas — vérifier la configuration du conteneur lab avant de continuer.

---

### 0h — Lister les workspaces dans le lab et obtenir slug/id

```bash
curl -s -X GET http://localhost:LAB_PORT/api/v1/workspaces \
  -H "Authorization: Bearer LAB_API_KEY" | python3 -m json.tool
```

**Résultat à relever :** `slug` et `id` numérique du workspace de test (`WORKSPACE_SLUG` et `WORKSPACE_ID`).  
**Si la liste est vide :** signaler à Florian — un workspace doit être créé avant de continuer.

---

### 0i — Valider la clé API du lab (Route C)

```bash
curl -s -X GET http://localhost:LAB_PORT/api/v1/auth \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

**Critère de succès :** `{"authenticated":true}` avec HTTP 200.

---

### 0j — Obtenir un token de session admin du lab (Routes A et B)

**Corps de la requête selon le mode (déterminé en 0e) :**

```bash
# Mode mono-utilisateur :
TOKEN=$(curl -s -X POST http://localhost:LAB_PORT/api/request-token \
  -H "Content-Type: application/json" \
  -d '{"password":"MOT_DE_PASSE_LAB"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('token') else 'ECHEC')")
echo "Token mono-util. : $TOKEN"

# Mode multi-utilisateur :
TOKEN=$(curl -s -X POST http://localhost:LAB_PORT/api/request-token \
  -H "Content-Type: application/json" \
  -d '{"username":"NOM_UTILISATEUR_LAB","password":"MOT_DE_PASSE_LAB"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('token') else 'ECHEC')")
echo "Token multi-util. : $TOKEN"
```

**Résultat attendu :** `Token [mode] : OK` — confirme que le token a bien été obtenu, sans aucun affichage de valeur.

**⚠️ Sécurité — NE PAS partager la réponse brute.** La réponse peut contenir un token de session ET des codes de récupération à usage unique. Les stocker en local uniquement pour les tests suivants.

**En mode multi-utilisateur :** utiliser un compte de rôle admin ou manager. Un compte de rôle standard serait rejeté en T-07 par `strictMultiUserRoleValid`.

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

**Précondition impérative :** 0d a confirmé que `WORKSPACE_DELETION_PROTECTION=true`.  
Si la valeur relevée en 0d est différente de `true` (ex. `=1`, `=false`, `=0` ou absente) : **s'arrêter et signaler à Florian** — la séquence doit être adaptée avant d'exécuter les tests.

**Recréation de conteneur requise :** Non — si la précondition ci-dessus est remplie.  
**Risque pour le workspace :** Aucun — le middleware retourne 403 avant d'atteindre le handler.

---

### 5.1 Contrôles d'authentification préalables (non-destructifs)

**T-01 — Route C sans aucune authentification**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/api/v1/workspace/WORKSPACE_SLUG \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Corps attendu : `{"error":"No valid api key found."}` [C19-GPT]  
Critère de succès : corps correspond au message de `validApiKey` — **différent** du message de `workspaceDeletionProtection`.

---

**T-02 — Route C avec clé API invalide**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/api/v1/workspace/WORKSPACE_SLUG \
  -H "Authorization: Bearer cle-api-invalide-xxxxxxxxxxx" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Corps attendu : `{"error":"No valid api key found."}` [C19-GPT]

---

**T-03 — Route B sans authentification**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/api/workspace/WORKSPACE_SLUG \
  -w "\nHTTP %{http_code}\n"
```

Code attendu en conditions normales : **401** (depuis `validatedRequest`)

> **Note de bypass :** si `NODE_ENV=development` ou si `AUTH_TOKEN`/`JWT_SECRET` sont absents (relevés en 0e) **et** que le lab est en mode mono-utilisateur, `validatedRequest` peut laisser passer la requête. Dans ce cas, `flexUserRoleValid` passe aussi en mono-util. → la requête atteint `workspaceDeletionProtection` → corps `{"success":false,"error":"Workspace deletion is blocked..."}` avec code 403. Relever le code et le corps exacts et interpréter selon les conditions relevées en 0e.

**Critère de distinction (conditions normales) :** le corps doit être **différent** de `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}`.

---

**T-04 — Route A sans authentification**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/api/admin/workspaces/WORKSPACE_ID \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **401** — quelle que soit la configuration de `validatedRequest`.

> **Comportement spécifique à la Route A :** même si `validatedRequest` laissait passer la requête (bypass actif, voir 0e), `strictMultiUserRoleValid` retourne **401** en mode mono-utilisateur. T-04 ne peut donc **pas** atteindre `workspaceDeletionProtection`, ni en conditions normales ni avec le bypass actif. Le corps observé doit toujours être relatif à l'authentification ou au mode utilisateur — **jamais** `{"success":false,"error":"Workspace deletion is blocked..."}`.

**Relever le code et le corps complets.**

---

### 5.2 Protection active — auth valide — workspace existant

**T-05 — Route C, clé API valide, variable `true`, workspace existant** ⭐ Test principal

```bash
curl -s -X DELETE http://localhost:LAB_PORT/api/v1/workspace/WORKSPACE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Corps attendu : `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}`  
Critère de succès : code 403 avec exactement ce corps.

---

**T-06 — Route B, session valide, variable `true`, workspace existant** ⭐ Test principal

```bash
curl -s -X DELETE http://localhost:LAB_PORT/api/workspace/WORKSPACE_SLUG \
  -H "Authorization: Bearer LAB_SESSION_TOKEN" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Corps attendu : `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}`

**Prérequis selon le mode (relevé en 0e) :**
- Mode **multi-utilisateur** : token d'un compte admin ou manager (sinon 403 depuis `flexUserRoleValid`, corps différent)
- Mode **mono-utilisateur** : n'importe quel token valide suffit

---

**T-07 — Route A, session admin valide, variable `true`, workspace existant** ⭐ Test principal (mode multi-utilisateur uniquement)

> **⚠️ Précondition impérative :** T-07 n'est exécutable que si le lab est en mode **multi-utilisateur** (confirmé en 0e). En mode mono-utilisateur, `strictMultiUserRoleValid` retourne HTTP 401 — le test ne peut pas valider la Route A dans ce mode.  
> **Si le lab est en mode mono-utilisateur :** ne pas exécuter T-07. Documenter que la Route A n'a pas pu être testée. Signaler à Florian pour décider si le mode doit être activé dans le lab.

```bash
curl -s -X DELETE http://localhost:LAB_PORT/api/admin/workspaces/WORKSPACE_ID \
  -H "Authorization: Bearer LAB_SESSION_TOKEN" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu (mode multi-util. uniquement) : **403**  
Corps attendu : `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}`

---

**Vérification de préservation du workspace — après T-05, T-06, T-07**

```bash
curl -s -X GET http://localhost:LAB_PORT/api/v1/workspace/WORKSPACE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n" | python3 -m json.tool
```

Critère de succès : workspace présent (`workspace` non null, HTTP 200). Confirme que les 403 n'ont pas supprimé le workspace.

---

### 5.3 Protection active — slug inexistant (contrôle d'ordre middleware, non-destructif)

**T-08 — Route C, auth valide, variable `true`, workspace INEXISTANT**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/api/v1/workspace/FAKE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Corps attendu : `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}`  
Critère de succès : identique à T-05 — confirme que le middleware intervient avant tout lookup du workspace. Si 400 au lieu de 403, le middleware ne serait pas correctement positionné avant le handler.

---

## 6. Phase 2 — Variable présente, valeur `1`

**⚠️ ARRÊT — VALIDATION DE FLORIAN REQUISE avant cette phase.**

**Prérequis :** persistance du stockage lab et isolation DB établies (résultats de 0b et 0b-db).  
**Objectif :** confirmer que la présence seule suffit — une valeur numérique `1` active aussi la protection.

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
curl -s -X DELETE http://localhost:LAB_PORT/api/v1/workspace/WORKSPACE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Corps attendu : `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}`

---

## 7. Phase 3 — Variable présente, valeur `false` puis `0`

**⚠️ ARRÊT — VALIDATION DE FLORIAN REQUISE avant cette phase.**

**Prérequis :** persistance du stockage lab et isolation DB établies.  
**Objectif :** confirmer que `false` et `0` n'activent pas une désactivation réelle — la présence seule suffit.  
**Stratégie :** utiliser `FAKE_SLUG` pour T-10 et T-11 — non-destructif quel que soit le résultat.  
**⚠️ Alerte :** si contrairement au code source la valeur `false` ou `0` était parsée comme une désactivation, le test avec `FAKE_SLUG` retournerait **400** au lieu de 403 — signaler immédiatement.

---

### Phase 3a — Valeur `false`

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
curl -s -X DELETE http://localhost:LAB_PORT/api/v1/workspace/FAKE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403** — `false` active la protection  
Code alternatif : **400** — `false` désactive la protection — **⚠️ Signaler immédiatement.**

---

### Phase 3b — Valeur `0` *(optionnel, sur validation de Florian)*

**⚠️ ARRÊT — VALIDATION DE FLORIAN REQUISE avant cette sous-phase.** Recréation du conteneur lab requise.

**Commandes de modification — NE PAS EXÉCUTER sans validation**

```bash
# Modifier : WORKSPACE_DELETION_PROTECTION=0
# Recréer le conteneur lab (même procédure que Phase 2)
```

**Vérification post-modification :**

```bash
docker exec LAB_CONTAINER env | grep WORKSPACE_DELETION_PROTECTION
```

Attendu : `WORKSPACE_DELETION_PROTECTION=0`

---

**T-11 — Route C, auth valide, variable `0`, workspace INEXISTANT**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/api/v1/workspace/FAKE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Code alternatif : **400** — **⚠️ Signaler immédiatement.**

---

## 8. Phase 4 — Variable absente (aucune protection)

**⚠️ ARRÊT — VALIDATION DE FLORIAN REQUISE avant cette phase.**

**Prérequis :** persistance du stockage lab et isolation DB établies.  
**Objectif :** confirmer que `next()` est appelé quand la variable est absente — le handler est réellement atteint.  
**Stratégie :** utiliser `FAKE_SLUG` — le handler retourne **400** sans corps [C19-GPT], ce qui démontre qu'il a été atteint sans rien supprimer.

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
curl -s -X DELETE http://localhost:LAB_PORT/api/v1/workspace/FAKE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **400** sans corps JSON [C19-GPT]  
Critère de succès : code **400** — confirme que `next()` a été appelé et que le handler a reçu la requête. Le code 400 (différent de 403) démontre que `workspaceDeletionProtection` n'a pas intercepté la requête.

---

## 9. Matrice de tests — résumé v4

| Test | Route | Auth | Variable | Workspace | Code attendu | Corps (clé) | Phase |
|------|-------|------|----------|-----------|-------------|-------------|-------|
| T-01 | C `/api/v1/workspace/:slug` | Absent | true | Existant | **403** | `"error":"No valid api key found."` | 1 |
| T-02 | C | Invalide | true | Existant | **403** | `"error":"No valid api key found."` | 1 |
| T-03 | B `/api/workspace/:slug` | Absent | true | Existant | **401** ¹ | corps ≠ protection workspace | 1 |
| T-04 | A `/api/admin/workspaces/:id` | Absent | true | Existant | **401** ² | corps ≠ protection workspace (toujours) | 1 |
| T-05 | C | Valide API | true | Existant | **403** | `"error":"Workspace deletion is blocked..."` | 1 |
| T-06 | B | Valide session ³ | true | Existant | **403** | `"error":"Workspace deletion is blocked..."` | 1 |
| T-07 | A | Valide session admin/mgr | true | Existant | **403** ⁴ | `"error":"Workspace deletion is blocked..."` | 1 |
| — | C | Valide API | — | Existant | **200** | workspace présent (GET vérification) | 1 |
| T-08 | C | Valide API | true | **Inexistant** | **403** | `"error":"Workspace deletion is blocked..."` | 1 |
| T-09 | C | Valide API | **1** | Existant | **403** | `"error":"Workspace deletion is blocked..."` | 2 |
| T-10 | C | Valide API | **false** | **Inexistant** | **403** | `"error":"Workspace deletion is blocked..."` | 3a |
| T-11 | C | Valide API | **0** | **Inexistant** | **403** | (optionnel) | 3b |
| T-12 | C | Valide API | **absente** | **Inexistant** | **400** | *(aucun corps)* | 4 |

¹ 401 en conditions normales. Peut différer en cas de bypass `validatedRequest` (voir 0e).  
² 401 — `strictMultiUserRoleValid` retourne 401 en mode mono-util. même si bypass `validatedRequest` actif.  
³ Mode multi-util. : token d'un compte admin/manager. Mode mono-util. : n'importe quel token valide.  
⁴ **Mode multi-utilisateur uniquement.** En mode mono-util. : HTTP 401 — T-07 non exécutable.

---

## 10. Critères de réussite globaux

### OPS-02 validé si toutes les conditions suivantes sont réunies

1. **Routes A ⁴, B, C** retournent toutes HTTP **403** avec le corps `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}` lorsque `WORKSPACE_DELETION_PROTECTION=true` (T-05, T-06, T-07⁴).

2. Le workspace est **préservé** après T-05, T-06, T-07 (vérification GET).

3. T-01 et T-02 retournent **403** avec `{"error":"No valid api key found."}` — corps différent du message de protection workspace.

4. T-03 retourne un **corps différent** de `{"success":false,"error":"Workspace deletion is blocked..."}` — confirme que `validatedRequest` intercepte (ou que le bypass est identifié et documenté).

5. T-04 retourne un code **401** avec un corps **toujours différent** de `{"success":false,"error":"Workspace deletion is blocked..."}` — confirme que la Route A ne peut pas atteindre le middleware de protection sans token valide et sans mode multi-utilisateur.

6. T-08 retourne **403** même pour un slug inexistant — ordre du middleware confirmé.

7. **Route C** retourne **403** avec la valeur `1` (T-09) — présence seule suffit.

8. **Route C** retourne **403** avec la valeur `false` (T-10) — `false` n'est pas interprété comme désactivation.

9. **Route C** retourne **400** (sans corps) lorsque la variable est absente et le slug inexistant (T-12) — `next()` est appelé, handler atteint.

⁴ T-07 applicable uniquement en mode multi-utilisateur.

### ⚠️ Alertes immédiates — signaler et stopper

| Résultat observé | Signification | Action |
|-----------------|---------------|--------|
| T-05 ou T-06 retourne **200** | Protection non active malgré variable présente | ⛔ Arrêt — analyser la chaîne middleware |
| T-07 (mode multi-util.) retourne **200** | Protection non active sur Route A | ⛔ Arrêt — analyser la chaîne middleware |
| T-01 ou T-02 retourne un corps `"Workspace deletion is blocked..."` | `validApiKey` absent ou mal positionné — faille | ⛔ Arrêt — analyser la chaîne Route C |
| T-03 ou T-04 retourne un corps `"Workspace deletion is blocked..."` | Protection atteinte sans auth valide | ⛔ Arrêt — analyser le bypass et les conditions 0e |
| T-07 retourne **401** alors que le mode est multi-utilisateur | `strictMultiUserRoleValid` refuse le rôle du compte | ⛔ Vérifier que le compte est admin ou manager |
| T-08 retourne **400** au lieu de 403 | Middleware intervient après le lookup — ordre incorrect | ⛔ Arrêt — analyser la chaîne middleware |
| T-10 ou T-11 retourne **400** au lieu de 403 | Valeur parsée comme désactivation — différent du code source | ⛔ Arrêt — signaler immédiatement |
| T-12 retourne **403** | Middleware actif sans la variable — variable héritée d'une autre source ? | ⛔ Arrêt — revoir l'environnement du conteneur |
| Toute commande curl retourne **404** | Préfixe `/api` non reconnu — vérifier le routage | ⛔ Arrêt — revoir la configuration du conteneur |

---

## 11. Ordre d'exécution

```
Phase 0 (lecture seule — aucune validation requise)
  → 0a : inventaire TOUS les conteneurs, actifs et arrêtés (docker ps -a)
  → 0b : vérification montages lab (.Mounts) — détermine la persistance du stockage
  → 0b-db : vérification SQLite + variables de base externe (systématique, sans valeurs)
  → 0c : vérification image lab
  → 0d : état de la variable WORKSPACE_DELETION_PROTECTION (détermine le point de départ)
  → 0e : présence AUTH_TOKEN/JWT_SECRET, valeur NODE_ENV
         + détection mode multi-utilisateur via /api/v1/admin/is-multi-user-mode
  → 0f : vérification middleware Routes A et B depuis l'image lab
  → 0g : test HTTP + validation routage /api (GET /api/v1/auth sans clé → 403 attendu)
  → 0h : liste des workspaces dans le lab
  → 0i : validation clé API
  → 0j : obtention token session admin — NE PAS partager la réponse brute — afficher "OK"
  → Partager tous les résultats bruts (sans secrets, tokens ni codes de récupération)

[ARRÊT] — Florian valide les préconditions lab.
        Si aucun conteneur lab avec port publié : créer le lab (validation Florian, après persistance établie).
        Si aucun workspace dans le lab : en créer un (validation Florian).
        Si stockage non persistant ou DB non isolée (0b, 0b-db) : corriger avant tout.
        Si valeur en 0d ≠ true : adapter la séquence (validation Florian).

Phase 1 (variable = true — uniquement si 0d confirme la valeur true)
  → T-01, T-02 : Route C sans auth / auth invalide (contrôle validApiKey)
  → T-03 : Route B sans auth (corps ≠ protection workspace)
  → T-04 : Route A sans auth (corps toujours ≠ protection workspace — strictMultiUserRoleValid bloque)
  → T-05 : Route C, auth valide, workspace existant ⭐
  → T-06 : Route B, auth valide, workspace existant ⭐
  → T-07 : Route A, mode multi-util. requis ⭐ (si mono-util. : signaler limitation, ne pas exécuter)
  → Vérification préservation workspace (GET)
  → T-08 : Route C, auth valide, workspace inexistant (contrôle ordre middleware)
  → Partager tous les résultats bruts

[ARRÊT] — Florian valide avant Phase 2 (recréation conteneur lab).

Phase 2 (variable = 1) → T-09 → Partager les résultats

[ARRÊT] — Florian valide avant Phase 3a (recréation conteneur lab).

Phase 3a (variable = false) → T-10 → Partager les résultats

[ARRÊT] — Florian valide avant Phase 3b (recréation conteneur lab) — optionnel.

Phase 3b (variable = 0) → T-11 (optionnel) → Partager les résultats

[ARRÊT] — Florian valide avant Phase 4 (recréation conteneur lab, variable absente).

Phase 4 (variable absente) → T-12 ⭐ (non-destructif — HTTP 400 attendu) → OPS-02 complet
```

---

## 12. Corrections appliquées par rapport à la version 3

| Correction | v3 | v4 |
|-----------|-----|-----|
| 0a — inventaire conteneurs | `docker ps` (actifs seulement) | `docker ps -a` (actifs **et arrêtés**) |
| 0b-db — déclenchement | Conditionnel (si SQLite absente) | **Systématique** — les deux vérifications toujours exécutées |
| 0b-db — valeurs de base externe | Non encadré | **Ne pas communiquer les valeurs** — présence seule |
| T-04 — note de bypass | Même note que T-03 | Comportement **spécifique Route A** : `strictMultiUserRoleValid` retourne 401 même si bypass `validatedRequest` actif — T-04 ne peut jamais atteindre `workspaceDeletionProtection` |
| 0j — extraction token | Script mono-util. uniquement, 8 premiers caractères affichés | Scripts **mono-util. et multi-util.**, affiche seulement `OK` / `ECHEC` |
| 0g — test de routage | `GET /api/` (non défini) | `GET /api/v1/auth` sans clé → **403** attendu (route connue, valide le routage) |
| Phase 1 — précondition valeur | Non vérifiée | **Valeur effective `true` requise** — si ≠ true : s'arrêter et signaler |
| T-11 — transition `false`→`0` | Aucune étape de recréation | **Phase 3b avec arrêt de validation et recréation** décrits explicitement |

---

*OPS-02 / ALLM-10 — Protocole de vérification en laboratoire v4 — 16 novembre 2026*  
*Lecture seule. Aucun fichier modifié, aucune branche modifiée, aucun test exécuté.*  
*Sources : [C17] tag v1.17.0, [CM] commit a5bb8b9c, [C19-GPT] tag v1.19.0 (lu par ChatGPT — non revérifié par Claude), [PROD] bilan 28/10/2026 (rapporté, non revérifié par Claude).*
