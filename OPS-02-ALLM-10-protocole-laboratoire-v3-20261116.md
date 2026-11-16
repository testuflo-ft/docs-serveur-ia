# OPS-02 / ALLM-10 — Protocole de vérification en laboratoire (v3)
## Protection de suppression des workspaces (`WORKSPACE_DELETION_PROTECTION`)

**Date :** 16 novembre 2026  
**Version :** 3 — corrections v3 : préfixe `/api` sur toutes les URL curl ; mode multi-utilisateur via API (non via variable d'environnement) ; comportement `strictMultiUserRoleValid` en mode mono-utilisateur (HTTP 401, non `next()`) ; codes HTTP T-03/T-04 corrigés (401) ; isolation base de données complétée ; sécurité de la réponse token.  
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
| `strictMultiUserRoleValid` | Mode mono-utilisateur (quel que soit le rôle) | **401** | *voir §1.4* **[C19-GPT]** |
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

**Conséquences directes sur les tests :**

| Test | Comportement en mode mono-utilisateur | Comportement en mode multi-utilisateur |
|------|--------------------------------------|---------------------------------------|
| T-06 (Route B) | Token valide suffit (`flexUserRoleValid` passe) | Token d'un compte admin ou manager requis |
| T-07 (Route A) | **Inutilisable** — HTTP 401 reçu depuis `strictMultiUserRoleValid`, jamais de 403 `workspaceDeletionProtection` | Token d'un compte admin ou manager requis |

**Si le lab est en mode mono-utilisateur : T-07 ne peut pas valider la Route A.** Il faudra soit activer le mode multi-utilisateur dans le lab (validation Florian), soit accepter cette limitation et documenter que la Route A n'a pas pu être testée en l'état.

### 1.5 Comportement attendu synthétique

| Route | Situation | Code attendu | Corps attendu |
|-------|-----------|-------------|---------------|
| C | Sans auth | 403 | `{"error":"No valid api key found."}` |
| C | Auth invalide | 403 | `{"error":"No valid api key found."}` |
| C | Auth valide + var. présente | **403** | `{"success":false,"error":"Workspace deletion is blocked..."}` |
| C | Auth valide + var. absente + slug inexistant | **400** | *(aucun corps)* |
| B | Sans auth | **401** (depuis `validatedRequest`) | corps relatif à l'authentification (≠ message protection workspace) |
| B | Auth valide + var. présente | **403** | `{"success":false,"error":"Workspace deletion is blocked..."}` |
| A | Sans auth | **401** (depuis `validatedRequest`) | corps relatif à l'authentification (≠ message protection workspace) |
| A | Auth valide + var. présente + mode multi-util. | **403** | `{"success":false,"error":"Workspace deletion is blocked..."}` |
| A | Auth valide + mode mono-util. | **401** (depuis `strictMultiUserRoleValid`) | — T-07 inutilisable en mono-util. |

---

## 2. Préconditions du laboratoire

### 2.1 Exigence critique : port HTTP publié

Le conteneur `anythingllm-fixlab` utilisé pour PUR-02 **n'avait pas de port publié** [Journal 28/10/2026]. OPS-02 nécessite un conteneur avec un port HTTP accessible pour les tests `curl`. Si aucun tel conteneur n'existe, sa création est la première étape (sur validation de Florian, et seulement après établissement de la persistance du stockage — §2.2).

### 2.2 Persistance du stockage et isolation de la base de données — point bloquant

**Aucune commande de recréation de conteneur ne sera proposée tant que la persistance du stockage laboratoire et l'indépendance de la base de données ne sont pas établies.**

La commande 0b établira la nature des montages. La commande 0b-db établira l'indépendance de la base de données.

**Stockage applicatif (`/app/server/storage`) :**

| Type de montage constaté | Persistance après recréation | Action |
|--------------------------|------------------------------|--------|
| Volume nommé (ex. `anythingllm-lab:/app/server/storage`) | ✅ Les données persistent | Recréation sûre |
| Bind mount (ex. `/chemin/local:/app/server/storage`) | ✅ Les données persistent | Recréation sûre |
| Aucun montage (stockage dans la couche conteneur) | ⚠️ Données perdues à chaque recréation | Signaler à Florian — volume à ajouter avant de continuer |

**Base de données :**

AnythingLLM utilise SQLite par défaut — le fichier est dans le répertoire de stockage. Si un montage externe ou une base distante (PostgreSQL, etc.) est configuré, il faut vérifier que cette base n'est **pas** celle de production.

La commande 0b-db révèlera la configuration. Si la base est une SQLite dans le stockage du lab, l'indépendance est garantie dès que le stockage est isolé.

---

## 3. Phase 0 — Lecture seule (aucune validation, aucune modification)

Exécuter dans l'ordre. Partager **tous les résultats bruts** avant de continuer. **Ne pas inclure de tokens, mots de passe, clés ou codes de récupération dans les résultats partagés.**

---

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

**À relever :**
- Nature du montage `/app/server/storage` (volume nommé, bind mount, ou absent)
- Aucun chemin de production dans la sortie — absent : volume nommé `anythingllm`, chemins `~/services/ai-stack/`, `/Users/florian/IA/Corpus-IA`, `/Users/florian/NAS-Home-Test/Travail`

> **Note :** `.Mounts` est utilisé ici (et non `.HostConfig.Binds`) car il liste l'ensemble des volumes — y compris volumes nommés et montages anonymes.

---

### 0b-db — Isolation : vérifier l'indépendance de la base de données

Si le stockage est monté (volume nommé ou bind mount), vérifier que la base de données est un fichier SQLite dans ce stockage :

```bash
docker exec LAB_CONTAINER ls -lh /app/server/storage/anythingllm.db 2>/dev/null \
  && echo "SQLite présente dans le stockage lab" \
  || echo "SQLite absente — vérifier la configuration DB"
```

Si la commande indique que SQLite est absente, vérifier la présence d'une configuration de base externe :

```bash
docker exec LAB_CONTAINER env | grep -iE "DATABASE_URL|POSTGRES|MYSQL" | sed 's/=.*/=MASQUÉ/'
```

**Critère de succès :** SQLite présente dans le stockage du lab, sans référence à une base externe. Si une base externe est configurée, signaler à Florian avant de continuer — confirmer qu'elle est distincte de la production.

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

---

### 0e — Présence des variables d'authentification et détection du mode multi-utilisateur

```bash
# Vérification de présence des variables sensibles (sans afficher leurs valeurs)
for VAR in NODE_ENV AUTH_TOKEN JWT_SECRET; do
  COUNT=$(docker exec LAB_CONTAINER env | grep -c "^${VAR}=")
  NODE_VAL=$(docker exec LAB_CONTAINER env | grep "^NODE_ENV=" | cut -d= -f2)
  if [ "$VAR" = "NODE_ENV" ] && [ -n "$NODE_VAL" ]; then
    echo "NODE_ENV: présente, valeur=${NODE_VAL}"
  else
    echo "${VAR}: ${COUNT}  (1=présente, 0=absente)"
  fi
done
```

> **Note :** `NODE_ENV` n'est pas un secret — sa valeur est affichée car elle conditionne un bypass de `validatedRequest`. `AUTH_TOKEN` et `JWT_SECRET` sont des secrets — seule leur présence est relevée, sans valeur.

**Interprétation pour T-03/T-04 :** si `NODE_ENV=development` ou si `AUTH_TOKEN` ou `JWT_SECRET` sont absents, le middleware `validatedRequest` peut laisser passer des requêtes sans token valide en mode mono-utilisateur [C19-GPT]. Ce bypass changerait le code de réponse observé. À noter et à considérer dans l'interprétation.

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

### 0g — Le serveur HTTP du lab répond

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:LAB_PORT/api/
```

**Critère de succès :** `HTTP 200` ou tout code non 404 indiquant que le serveur est actif et que le préfixe `/api` est reconnu.

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
- Mode **mono-utilisateur** : `{"password":"MOT_DE_PASSE"}`
- Mode **multi-utilisateur** : `{"username":"NOM_UTILISATEUR","password":"MOT_DE_PASSE"}`

```bash
# Mode mono-utilisateur :
curl -s -X POST http://localhost:LAB_PORT/api/request-token \
  -H "Content-Type: application/json" \
  -d '{"password":"MOT_DE_PASSE_LAB"}' \
  -w "\nHTTP %{http_code}\n"

# Mode multi-utilisateur :
curl -s -X POST http://localhost:LAB_PORT/api/request-token \
  -H "Content-Type: application/json" \
  -d '{"username":"NOM_UTILISATEUR_LAB","password":"MOT_DE_PASSE_LAB"}' \
  -w "\nHTTP %{http_code}\n"
```

**⚠️ Sécurité — NE PAS partager la réponse brute.** La réponse peut contenir un token de session ET des codes de récupération à usage unique. Extraire uniquement la valeur du champ `token` en local et conserver `LAB_SESSION_TOKEN` pour les tests suivants. Les codes de récupération sont à conserver hors de cette conversation.

```bash
# Extraction sécurisée du token uniquement (aucun affichage des secrets) :
TOKEN=$(curl -s -X POST http://localhost:LAB_PORT/api/request-token \
  -H "Content-Type: application/json" \
  -d '{"password":"MOT_DE_PASSE_LAB"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token','NON_TROUVÉ'))")
echo "Token obtenu : ${TOKEN:0:8}... (tronqué)"
```

Confirmer : `Token obtenu : xxxxxxxx... (tronqué)` — 8 premiers caractères suffisent à confirmer la présence du token.

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

**Précondition :** `WORKSPACE_DELETION_PROTECTION=true` dans le lab (état actuel en production [PROD]).  
**Recréation de conteneur requise :** Non — si l'état est confirmé par 0d.  
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

Code attendu : **401** (depuis `validatedRequest`) **[C19-GPT]**  

> **Note de bypass :** si `NODE_ENV=development` (relevé en 0e) ou si `AUTH_TOKEN`/`JWT_SECRET` sont absents (relevés en 0e), `validatedRequest` peut laisser passer la requête en mode mono-utilisateur. Dans ce cas, le code observé pourrait être 403 (depuis `workspaceDeletionProtection`). Relever le code et le corps exacts et interpréter selon les conditions relevées en 0e.

**Critère de distinction :** le corps doit être **différent** de `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}`. Si ce corps apparaît, c'est `workspaceDeletionProtection` qui a répondu — cela indiquerait un bypass de `validatedRequest` (voir note ci-dessus).

---

**T-04 — Route A sans authentification**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/api/admin/workspaces/WORKSPACE_ID \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **401** (depuis `validatedRequest`) **[C19-GPT]**  
Même logique de bypass et critère de distinction qu'en T-03.  
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

> **⚠️ Précondition impérative :** T-07 n'est exécutable que si le lab est en mode **multi-utilisateur** (confirmé en 0e). En mode mono-utilisateur, `strictMultiUserRoleValid` retourne HTTP 401 avant d'atteindre `workspaceDeletionProtection` — le test ne peut pas valider la Route A dans ce mode.  
> **Si le lab est en mode mono-utilisateur :** signaler la limitation, ne pas exécuter T-07, documenter que la Route A n'a pas pu être testée.

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
curl -s -X DELETE http://localhost:LAB_PORT/api/v1/workspace/WORKSPACE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Corps attendu : `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}`  
Critère de succès : identique à T-05 — **confirme que la valeur `1` active la protection, comme `true`.**

---

## 7. Phase 3 — Variable présente, valeur `false`

**⚠️ ARRÊT — VALIDATION DE FLORIAN REQUISE avant cette phase.**

**Prérequis :** persistance du stockage lab et isolation DB établies.  
**Objectif :** confirmer que `false` n'est pas interprété comme « désactivé » — la présence seule suffit.  
**Stratégie :** utiliser `FAKE_SLUG` (workspace inexistant) — non-destructif quel que soit le résultat.  
**⚠️ Alerte :** si contrairement au code source la valeur `false` était parsée comme une désactivation, le test avec `FAKE_SLUG` retournerait **400** au lieu de 403. Ce résultat doit être signalé immédiatement.

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

Code attendu : **403** (si présence seule suffit — comportement conforme au code)  
Corps attendu : `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}`

Code alternatif : **400** sans corps (si valeur `false` est interprétée comme désactivation — comportement inattendu)  
**⚠️ Si 400 :** la protection est inactive avec `false` — signaler immédiatement, ne pas continuer.

---

**T-11 — Route C, auth valide, variable `0`, workspace INEXISTANT** *(optionnel)*

```bash
curl -s -X DELETE http://localhost:LAB_PORT/api/v1/workspace/FAKE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**

---

## 8. Phase 4 — Variable absente (aucune protection)

**⚠️ ARRÊT — VALIDATION DE FLORIAN REQUISE avant cette phase.**

**Prérequis :** persistance du stockage lab et isolation DB établies.  
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
curl -s -X DELETE http://localhost:LAB_PORT/api/v1/workspace/FAKE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **400** sans corps JSON [C19-GPT]  
Critère de succès : code **400** — confirme que `next()` a été appelé et que le handler a reçu la requête. Le code 400 (différent de 403) démontre que `workspaceDeletionProtection` n'a pas intercepté la requête.

**Ce test est suffisant pour valider le comportement « variable absente → handler atteint ».** Aucun workspace réel n'est supprimé.

---

## 9. Matrice de tests — résumé v3

| Test | Route | Auth | Variable | Workspace | Code attendu | Corps (clé) | Phase |
|------|-------|------|----------|-----------|-------------|-------------|-------|
| T-01 | C `/api/v1/workspace/:slug` | Absent | true | Existant | **403** | `"error":"No valid api key found."` | 1 |
| T-02 | C | Invalide | true | Existant | **403** | `"error":"No valid api key found."` | 1 |
| T-03 | B `/api/workspace/:slug` | Absent | true | Existant | **401** ¹ | corps ≠ protection workspace | 1 |
| T-04 | A `/api/admin/workspaces/:id` | Absent | true | Existant | **401** ¹ | corps ≠ protection workspace | 1 |
| T-05 | C | Valide API | true | Existant | **403** | `"error":"Workspace deletion is blocked..."` | 1 |
| T-06 | B | Valide session ² | true | Existant | **403** | `"error":"Workspace deletion is blocked..."` | 1 |
| T-07 | A | Valide session admin/mgr | true | Existant | **403** ³ | `"error":"Workspace deletion is blocked..."` | 1 |
| — | C | Valide API | — | Existant | **200** | workspace présent (GET vérification) | 1 |
| T-08 | C | Valide API | true | **Inexistant** | **403** | `"error":"Workspace deletion is blocked..."` | 1 |
| T-09 | C | Valide API | **1** | Existant | **403** | `"error":"Workspace deletion is blocked..."` | 2 |
| T-10 | C | Valide API | **false** | **Inexistant** | **403** | `"error":"Workspace deletion is blocked..."` | 3 |
| T-11 | C | Valide API | **0** | **Inexistant** | **403** | (optionnel) | 3 |
| T-12 | C | Valide API | **absente** | **Inexistant** | **400** | *(aucun corps)* | 4 |

¹ Code 401 attendu en conditions normales. Peut différer si bypass `validatedRequest` actif (voir 0e).  
² Mode multi-util. : token d'un compte admin/manager. Mode mono-util. : n'importe quel token valide.  
³ **Mode multi-utilisateur uniquement.** En mode mono-util. : HTTP 401 depuis `strictMultiUserRoleValid` — T-07 inutilisable.

---

## 10. Critères de réussite globaux

### OPS-02 validé si toutes les conditions suivantes sont réunies

1. **Routes A ³, B, C** retournent toutes HTTP **403** avec le corps `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}` lorsque `WORKSPACE_DELETION_PROTECTION=true` (T-05, T-06, T-07³).

2. Le workspace est **préservé** après T-05, T-06, T-07 (vérification GET).

3. T-01 et T-02 retournent **403** avec le corps `{"error":"No valid api key found."}` — corps différent du message de protection workspace — confirme que `validApiKey` intercepte avant `workspaceDeletionProtection`.

4. T-03 et T-04 retournent **401** (ou code conforme aux conditions relevées en 0e) avec un **corps différent** de `{"success":false,"error":"Workspace deletion is blocked..."}` — confirme que `validatedRequest` intercepte avant `workspaceDeletionProtection`.

5. T-08 retourne **403** même pour un slug inexistant — confirme que le middleware intervient avant le lookup du workspace.

6. **Route C** retourne **403** avec la valeur `1` (T-09) — présence seule suffit.

7. **Route C** retourne **403** avec la valeur `false` (T-10) — `false` n'est pas interprété comme désactivation.

8. **Route C** retourne **400** (sans corps) lorsque la variable est absente et le slug inexistant (T-12) — `next()` est appelé, le handler est atteint.

³ T-07 applicable uniquement en mode multi-utilisateur.

### ⚠️ Alertes immédiates — signaler et stopper

| Résultat observé | Signification | Action |
|-----------------|---------------|--------|
| T-05, T-06 (ou T-07 en mode multi-util.) retourne **200** | Protection non active malgré variable présente | ⛔ Arrêt — analyser la chaîne middleware |
| T-01 ou T-02 retourne un corps `"Workspace deletion is blocked..."` | `validApiKey` absent ou mal positionné — faille | ⛔ Arrêt — analyser la chaîne Route C |
| T-03 ou T-04 retourne un corps `"Workspace deletion is blocked..."` | `validatedRequest` absent ou bypass actif non prévu | ⛔ Arrêt — analyser conditions 0e |
| T-07 retourne **401** alors que le mode est multi-utilisateur | `strictMultiUserRoleValid` refuse le rôle du compte | ⛔ Vérifier que le compte est admin ou manager |
| T-08 retourne **400** au lieu de 403 | Middleware intervient après le lookup — ordre incorrect | ⛔ Arrêt — analyser la chaîne middleware |
| T-10 retourne **400** au lieu de 403 | Valeur `false` interprétée comme désactivation — différent du code source | ⛔ Arrêt — signaler immédiatement |
| T-12 retourne **403** | Middleware actif sans la variable — variable héritée d'une autre source ? | ⛔ Arrêt — revoir l'environnement du conteneur |
| Toute commande curl retourne **404** | Préfixe `/api` non reconnu — vérifier le routage du conteneur lab | ⛔ Arrêt — revoir la configuration du conteneur |

---

## 11. Ordre d'exécution

```
Phase 0 (lecture seule — aucune validation requise)
  → 0a : inventaire conteneurs
  → 0b : vérification montages lab (.Mounts) — détermine la persistance du stockage
  → 0b-db : vérification indépendance de la base de données
  → 0c : vérification image lab
  → 0d : état de la variable WORKSPACE_DELETION_PROTECTION
  → 0e : présence AUTH_TOKEN/JWT_SECRET, valeur NODE_ENV (sans secrets)
         + détection mode multi-utilisateur via /api/v1/admin/is-multi-user-mode
  → 0f : vérification middleware Routes A et B depuis l'image lab
  → 0g : test HTTP de base (serveur vivant ?)
  → 0h : liste des workspaces dans le lab
  → 0i : validation clé API
  → 0j : obtention token session admin — NE PAS partager la réponse brute
  → Partager tous les résultats bruts (sans secrets, tokens ni codes de récupération)

[ARRÊT] — Florian valide les préconditions lab.
        Si aucun conteneur lab avec port : créer le lab (validation Florian, après persistance établie).
        Si aucun workspace dans le lab : en créer un (validation Florian).
        Si stockage non persistant ou DB non isolée (0b, 0b-db) : corriger avant tout.

Phase 1 (variable = true — aucune modification si déjà en place)
  → T-01, T-02 : Route C sans auth / auth invalide (contrôle validApiKey)
  → T-03 : Route B sans auth (contrôle validatedRequest — corps ≠ protection workspace)
  → T-04 : Route A sans auth (contrôle validatedRequest — corps ≠ protection workspace)
  → T-05 : Route C, auth valide, workspace existant ⭐
  → T-06 : Route B, auth valide, workspace existant ⭐
  → T-07 : Route A, auth valide, mode multi-util. requis ⭐ (si mono-util. : signaler limitation)
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

## 12. Corrections appliquées par rapport à la version 2

| Correction | v2 | v3 |
|-----------|-----|-----|
| Préfixe des URL curl | `/v1/workspace/...`, `/workspace/...`, `/admin/workspaces/...` | `/api/v1/workspace/...`, `/api/workspace/...`, `/api/admin/workspaces/...` **[C19-GPT]** |
| Tableau §1.1 — chemins HTTP | Sans préfixe `/api` | Avec préfixe `/api` sur toutes les routes |
| Diagnostic mode multi-utilisateur (0e) | Variable d'environnement `MULTI_USER_MODE` (inexistante) | API `/api/v1/admin/is-multi-user-mode` — source de vérité **[C19-GPT]** |
| Comportement `strictMultiUserRoleValid` en mono-util. §1.4 | Passe directement (`next()`) | **HTTP 401 — refuse l'accès** `if (!multiUserMode) return response.sendStatus(401).end()` **[C19-GPT]** |
| T-07 (Route A) précondition | Toujours exécutable | **Mode multi-utilisateur uniquement** — inutilisable en mono-util. |
| Code attendu T-03/T-04 | 403 | **401** (en conditions normales) — avec note de bypass selon 0e **[C19-GPT]** |
| Sécurité réponse token (0j) | Partage brut non encadré | ⚠️ Ne jamais partager la réponse brute — extraction tronquée du token uniquement |
| Isolation base de données | Non couverte | 0b-db : vérification SQLite dans stockage lab ou base externe **[C19-GPT]** |

---

*OPS-02 / ALLM-10 — Protocole de vérification en laboratoire v3 — 16 novembre 2026*  
*Lecture seule. Aucun fichier modifié, aucune branche modifiée, aucun test exécuté.*  
*Sources : [C17] tag v1.17.0, [CM] commit a5bb8b9c, [C19-GPT] tag v1.19.0 (lu par ChatGPT — non revérifié par Claude), [PROD] bilan 28/10/2026 (rapporté, non revérifié par Claude).*
