# OPS-02 / ALLM-10 — Protocole de vérification en laboratoire  
## Protection de suppression des workspaces (`WORKSPACE_DELETION_PROTECTION`)

**Date :** 16 novembre 2026  
**Nature :** Protocole de vérification en laboratoire isolé — lecture seule d'abord  
**Périmètre :** Trois routes HTTP de suppression de workspace, middleware `workspaceDeletionProtection`, trois états de la variable d'environnement  
**Contraintes impératives :**
- Aucun test sur la production (`anythingllm`, port 3001)
- Aucune modification de configuration sans validation explicite de Florian
- Aucun redémarrage ni recréation de conteneur sans validation explicite de Florian
- Commandes fournies, **non exécutées** — Florian exécute, analyse ensemble
- Aucune suppression de workspace réel sans validation séparée explicite

---

## 1. Identification des trois routes

### 1.1 Tableau de synthèse

| Route | Méthode | Chemin HTTP | Fichier source | Ligne | Middleware chaîne |
|-------|---------|-------------|---------------|-------|-------------------|
| **A — Admin web** | `DELETE` | `/admin/workspaces/:id` | `server/endpoints/admin.js` | l.300 | `[…auth admin…, workspaceDeletionProtection]` **[hyp]** |
| **B — Workspace web** | `DELETE` | `/workspace/:slug` | `server/endpoints/workspaces.js` | l.302 [C17] / l.303 [CM] | `[validatedRequest, workspaceDeletionProtection]` **[hyp]** |
| **C — API REST** | `DELETE` | `/v1/workspace/:slug` | `server/endpoints/api/workspace/index.js` | l.230 | `[validApiKey, workspaceDeletionProtection]` **[C17]** |

**Sources :** [C17] = code relu sur le tag v1.17.0 ; [CM] = commit main `a5bb8b9c` ; [hyp] = hypothèse par analogie avec le pattern standard AnythingLLM — middleware auth **non lu en source** dans cette session pour les routes A et B.  
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

**Point clé absolu :** la condition porte sur la **présence de la clé** dans `process.env` — pas sur sa valeur.  
`WORKSPACE_DELETION_PROTECTION=false`, `=0`, `=""` déclenchent tous la protection de la **même façon** que `=true` ou `=1`.

### 1.3 Comportement attendu par état de la variable

| État de `WORKSPACE_DELETION_PROTECTION` | `in process.env` | Comportement middleware | Effet sur workspace |
|-----------------------------------------|-----------------|------------------------|---------------------|
| **Absente** | `false` | `next()` — route exécutée | Dépend du handler (suppression possible) |
| Présente, valeur `true` | `true` | HTTP 403 — route non atteinte | **Aucun** (protégé) |
| Présente, valeur `1` | `true` | HTTP 403 — route non atteinte | **Aucun** (protégé) |
| Présente, valeur `false` | `true` | HTTP 403 — route non atteinte | **Aucun** (protégé) |
| Présente, valeur `0` | `true` | HTTP 403 — route non atteinte | **Aucun** (protégé) |

### 1.4 Comportement attendu par route — vue croisée

| Route | Sans auth | Auth incorrecte | Auth valide + variable présente | Auth valide + variable absente |
|-------|-----------|-----------------|---------------------------------|-------------------------------|
| A | 403/401 (auth) [hyp] | 403/401 (auth) [hyp] | **403** (middleware) [hyp] | 200 ou 404 (handler) [hyp] |
| B | 403/401 (auth) [hyp] | 403/401 (auth) [hyp] | **403** (middleware) [hyp] | 200 ou 404 (handler) [hyp] |
| C | **403** `"Invalid API key"` [C17] | **403** `"Invalid API key"` [C17] | **403** `"Workspace deletion is blocked…"` [C17] | 200 ou 404 (handler) [C17 partiel] |

**Toutes les lignes [hyp] seront vérifiées et remplacées par les résultats réels des tests.**

---

## 2. Préconditions du laboratoire

### 2.1 Exigence critique : port HTTP publié

Le conteneur `anythingllm-fixlab` utilisé pour PUR-02 **n'avait pas de port publié** [Journal 28/10/2026]. OPS-02 nécessite un conteneur avec un port HTTP accessible pour les tests `curl`. Si aucun tel conteneur n'existe, sa création est la première étape (sur validation de Florian).

### 2.2 Exigences complètes du conteneur de laboratoire

| Exigence | Valeur attendue |
|----------|----------------|
| Port HTTP publié | Ex. `3002` sur l'hôte (différent du port 3001 de production) |
| Image | `sha256:ddf73304a4a96e2f90755d620dd3921de9afb4b8b8e914fa62d6ce7944ba95af` (AnythingLLM 1.19.0 arm64) [PROD] |
| Volumes | Aucun volume de production. Aucun montage NAS |
| Variable configurable | `WORKSPACE_DELETION_PROTECTION` modifiable entre les phases (recréation du conteneur) |
| Base de données | Distincte de la production — données de test uniquement |
| Au moins un workspace | Pour les tests avec slug/id valide |
| Au moins une clé API | Pour les tests Route C |
| Compte admin connu | Pour les tests Routes A et B (session JWT) |

---

## 3. Phase 0 — Lecture seule (aucune validation, aucune modification)

Exécuter dans l'ordre. Partager tous les résultats bruts avant de continuer.

### 0a — Inventaire des conteneurs actifs

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
```

**Critère de succès :** le conteneur de production `anythingllm` est visible sur le port 3001. Un conteneur de laboratoire distinct est identifiable. Les deux sont sur des ports différents.  
**Si aucun conteneur de lab avec port publié :** s'arrêter ici — signaler à Florian pour création du lab avant de continuer.

### 0b — Isolation : vérifier les volumes du conteneur de lab

```bash
docker inspect LAB_CONTAINER --format '{{json .HostConfig.Binds}}'
```

*(Remplacer `LAB_CONTAINER` par le nom réel du conteneur de laboratoire.)*

**Critère de succès :** aucun chemin de production dans la sortie. Absent : `anythingllm` (volume nommé de production), `~/services/ai-stack/`, `/Users/florian/IA/Corpus-IA`, `/Users/florian/NAS-Home-Test/Travail`.

### 0c — Isolation : vérifier l'image du conteneur de lab

```bash
docker inspect LAB_CONTAINER --format '{{.Image}}'
```

**Critère de succès :** `sha256:ddf73304a4a96e2f90755d620dd3921de9afb4b8b8e914fa62d6ce7944ba95af` — identique à la production.

### 0d — État actuel de la variable dans le lab

```bash
docker exec LAB_CONTAINER env | grep WORKSPACE_DELETION_PROTECTION
```

**Résultat à relever :** aucune sortie (absente) ou `WORKSPACE_DELETION_PROTECTION=VALEUR`. **Ne pas supposer l'état — le lire.**

### 0e — Le serveur HTTP du lab répond

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:LAB_PORT/
```

**Critère de succès :** `HTTP 200`. Confirme que le port est accessible et le serveur démarré.

### 0f — Lister les workspaces disponibles dans le lab

```bash
curl -s -X GET http://localhost:LAB_PORT/v1/workspaces \
  -H "Authorization: Bearer LAB_API_KEY" | python3 -m json.tool
```

**Résultat à relever :** la liste des workspaces avec leur `slug` et `id`. Identifier le workspace de test (`WORKSPACE_SLUG` et `WORKSPACE_ID`).  
**Si la liste est vide :** il faut créer un workspace dans le lab avant de continuer (sur validation de Florian).

### 0g — Valider la clé API du lab (Route C)

```bash
curl -s -X GET http://localhost:LAB_PORT/v1/auth \
  -H "Authorization: Bearer LAB_API_KEY"
```

**Critère de succès :** `{"authenticated":true}`.

### 0h — Obtenir un token de session admin du lab (Routes A et B)

```bash
curl -s -X POST http://localhost:LAB_PORT/api/request-token \
  -H "Content-Type: application/json" \
  -d '{"username":"LAB_USERNAME","password":"LAB_PASSWORD"}' | python3 -m json.tool
```

**Résultat à relever :** le champ `token`. Le conserver comme `LAB_SESSION_TOKEN` pour les tests des Routes A et B.

---

## 4. Variables de substitution

Avant d'exécuter les commandes des phases 1 à 4, remplacer toutes les occurrences :

| Placeholder | Valeur à substituer |
|-------------|---------------------|
| `LAB_CONTAINER` | Nom du conteneur de laboratoire (ex. `anythingllm-ops02-lab`) |
| `LAB_PORT` | Port HTTP publié du laboratoire (ex. `3002`) |
| `LAB_API_KEY` | Clé API valide dans la base du laboratoire |
| `LAB_SESSION_TOKEN` | Token JWT de session obtenu en 0h |
| `WORKSPACE_SLUG` | Slug du workspace de test (ex. `test-workspace`) |
| `WORKSPACE_ID` | Identifiant numérique du workspace de test (ex. `1`) |
| `FAKE_SLUG` | Slug inexistant garanti (ex. `workspace-factice-99999`) |
| `FAKE_ID` | ID numérique inexistant garanti (ex. `99999`) |

---

## 5. Phase 1 — Variable présente, valeur `true`

**Précondition :** `WORKSPACE_DELETION_PROTECTION=true` dans le lab (état actuel en production [PROD]).  
**Recréation de conteneur requise :** Non — si l'état est confirmé par 0d.  
**Risque pour le workspace :** Aucun — le middleware retourne 403 avant d'atteindre le handler.

### 5.1 Contrôles d'authentification préalables (non-destructifs)

**T-01 — Route C sans aucune authentification**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/v1/workspace/WORKSPACE_SLUG \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Corps attendu : `{"success":false,"message":"Invalid API key"}` (depuis `validApiKey` — avant le middleware de protection)  
Critère : le message est celui de l'échec d'authentification API, **pas** celui de la protection workspace.

---

**T-02 — Route C avec clé API invalide**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/v1/workspace/WORKSPACE_SLUG \
  -H "Authorization: Bearer cle-api-invalide-xxxxxxxxxxx" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Corps attendu : `{"success":false,"message":"Invalid API key"}`  
Critère : même erreur qu'en T-01 — confirme que `validApiKey` intercepte avant `workspaceDeletionProtection`.

---

**T-03 — Route B sans authentification**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/workspace/WORKSPACE_SLUG \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403 ou 401** [hyp — dépend de `validatedRequest`]  
Critère : code 4xx — pas d'accès sans session. **Relever le code exact et le corps complet.**

---

**T-04 — Route A sans authentification**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/admin/workspaces/WORKSPACE_ID \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403 ou 401** [hyp]  
Critère : code 4xx — pas d'accès sans session admin. **Relever le code exact et le corps complet.**

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
Critère de succès : code 403 avec exactement ce message — confirme que `workspaceDeletionProtection` est actif sur Route C.

---

**T-06 — Route B, session valide, variable `true`, workspace existant** ⭐ Test principal [hyp]

```bash
curl -s -X DELETE http://localhost:LAB_PORT/workspace/WORKSPACE_SLUG \
  -H "Authorization: Bearer LAB_SESSION_TOKEN" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403** [hyp]  
Corps attendu : `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}` [hyp]  
Critère de succès : code 403 avec le message de protection workspace.  
**Si résultat différent de [hyp] :** relever le code et le corps exacts — ajustera l'hypothèse sur la chaîne middleware de la Route B.

---

**T-07 — Route A, session admin valide, variable `true`, workspace existant** ⭐ Test principal [hyp]

```bash
curl -s -X DELETE http://localhost:LAB_PORT/admin/workspaces/WORKSPACE_ID \
  -H "Authorization: Bearer LAB_SESSION_TOKEN" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403** [hyp]  
Corps attendu : `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}` [hyp]  
Critère de succès : code 403 avec le message de protection workspace.

---

**Vérification de préservation du workspace — après T-05, T-06, T-07**

```bash
curl -s -X GET http://localhost:LAB_PORT/v1/workspace/WORKSPACE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" | python3 -m json.tool
```

Critère de succès : workspace toujours présent dans la réponse (`workspace` non null). **Confirme que les trois 403 n'ont touché ni supprimé le workspace.**

---

### 5.3 Protection active — slug inexistant (non-destructif, contrôle d'ordre middleware)

**T-08 — Route C, auth valide, variable `true`, workspace INEXISTANT**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/v1/workspace/FAKE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **403**  
Corps attendu : `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}`  
Critère de succès : **identique à T-05** — confirme que le middleware intervient avant tout lookup du workspace. Si le résultat était 404 au lieu de 403, le middleware ne serait pas correctement positionné avant le handler.

---

## 6. Phase 2 — Variable présente, valeur `1`

**⚠️ ARRÊT — VALIDATION DE FLORIAN REQUISE avant cette phase.**

**Pourquoi :** modification de `WORKSPACE_DELETION_PROTECTION` de `true` à `1` → recréation du conteneur de lab.  
**Objectif :** confirmer que la présence seule suffit — une valeur numérique non-booléenne active aussi la protection.

**Commande de modification — NE PAS EXÉCUTER sans validation**

Si le lab utilise `docker compose` :
```bash
# 1. Modifier la valeur dans le fichier compose du lab (WORKSPACE_DELETION_PROTECTION=1)
# 2. Recréer le conteneur de lab seulement :
docker compose -f LAB_COMPOSE_FILE up -d --no-deps --force-recreate LAB_SERVICE_NAME
```

Si le lab utilise `docker run` directement :
```bash
# Recréer avec la nouvelle valeur :
docker stop LAB_CONTAINER && docker rm LAB_CONTAINER
docker run -d --name LAB_CONTAINER \
  -p LAB_PORT:3001 \
  -e WORKSPACE_DELETION_PROTECTION=1 \
  [autres paramètres du conteneur de lab]
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
Critère de succès : identique à T-05 — **confirme que la valeur `1` active la protection, comme `true`.** La logique de présence est vérifiée.

---

## 7. Phase 3 — Variable présente, valeur `false`

**⚠️ ARRÊT — VALIDATION DE FLORIAN REQUISE avant cette phase.**

**Pourquoi :** modification de la valeur en `false` → recréation du conteneur.  
**Objectif :** confirmer que `false` n'est pas interprété comme « désactivé » — la présence seule suffit.  
**⚠️ Attention spécifique :** si, contrairement au code source, la valeur `false` était parsée comme une désactivation, ce test avec `FAKE_SLUG` retournerait 404 (handler atteint) au lieu de 403. Ce résultat devra être signalé immédiatement.  
**Stratégie :** utiliser `FAKE_SLUG` (workspace inexistant) pour ce test — non-destructif quel que soit le résultat.

**Commande de modification — NE PAS EXÉCUTER sans validation**

```bash
# Modifier : WORKSPACE_DELETION_PROTECTION=false
# Recréer le conteneur de lab (même procédure que Phase 2)
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
Code alternatif : **404** (si valeur `false` est interprétée comme désactivation — comportement inattendu)  
Corps si 403 : `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}`  
Corps si 404 : message d'erreur du handler (workspace non trouvé)

**Critère de succès :** code **403**.  
**⚠️ Si 404 :** la protection est inactive avec `false` — signaler immédiatement, ne pas continuer. Ce serait un comportement différent du code source lu [C17][CM].

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
**⚠️ ATTENTION : avec un workspace existant, la suppression sera RÉELLE et IRRÉVERSIBLE.**

**Objectif :** confirmer que `next()` est appelé quand la variable est absente — le handler de suppression est réellement atteint.  
**Stratégie non-destructive :** tester d'abord avec `FAKE_SLUG` (workspace inexistant) — le handler retourne 404 sans rien supprimer, mais confirme que le middleware a bien cédé le passage.

**Commande de modification — NE PAS EXÉCUTER sans validation**

```bash
# Retirer la variable WORKSPACE_DELETION_PROTECTION du fichier compose du lab (ou ne pas la passer en docker run)
# Recréer le conteneur de lab
```

**Vérification post-modification :**

```bash
docker exec LAB_CONTAINER env | grep WORKSPACE_DELETION_PROTECTION
```

Attendu : **aucune sortie** — confirme que la variable est absente du processus.

---

**T-12 — Route C, auth valide, variable ABSENTE, workspace INEXISTANT** *(non-destructif)*

```bash
curl -s -X DELETE http://localhost:LAB_PORT/v1/workspace/FAKE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **≠ 403** — probablement **404** (workspace non trouvé) ou **200** selon l'implémentation  
Corps attendu : message d'erreur du handler (non-existence du workspace)

**Critère de succès :** code **différent de 403** — confirme que `next()` est bien appelé, et que le handler est atteint (pas le middleware). Le code exact (404 ou autre) sera noté comme résultat d'observation.

---

**T-13 — Route C, auth valide, variable ABSENTE, workspace EXISTANT** ⚠️ DESTRUCTIF

**⚠️ VALIDATION SÉPARÉE ET EXPLICITE DE FLORIAN REQUISE — ce test supprime définitivement le workspace.**  
**Ne pas exécuter avant T-12 et sans validation distincte.**

```bash
curl -s -X DELETE http://localhost:LAB_PORT/v1/workspace/WORKSPACE_SLUG \
  -H "Authorization: Bearer LAB_API_KEY" \
  -w "\nHTTP %{http_code}\n"
```

Code attendu : **200**  
Corps attendu : réponse de succès AnythingLLM (ex. `{"success":true,"message":"Workspace ... was deleted."}`)  
Critère de succès : code 200 — confirme que sans la variable, la suppression est réellement exécutée.

---

## 9. Matrice de tests — résumé

| Test | Route | Auth | Variable | Workspace | Code attendu | Élément clé de la réponse |
|------|-------|------|----------|-----------|-------------|--------------------------|
| T-01 | C | Absent | true | Existant | **403** | `"message":"Invalid API key"` |
| T-02 | C | Invalide | true | Existant | **403** | `"message":"Invalid API key"` |
| T-03 | B | Absent | true | Existant | **4xx** [hyp] | — à relever — |
| T-04 | A | Absent | true | Existant | **4xx** [hyp] | — à relever — |
| T-05 | C | Valide API | true | Existant | **403** | `"error":"Workspace deletion is blocked..."` |
| T-06 | B | Valide session | true | Existant | **403** [hyp] | `"error":"Workspace deletion is blocked..."` |
| T-07 | A | Valide session admin | true | Existant | **403** [hyp] | `"error":"Workspace deletion is blocked..."` |
| — | C | Valide API | — | Existant | — | Vérification préservation (GET) |
| T-08 | C | Valide API | true | **Inexistant** | **403** | `"error":"Workspace deletion is blocked..."` |
| T-09 | C | Valide API | **1** | Existant | **403** | `"error":"Workspace deletion is blocked..."` |
| T-10 | C | Valide API | **false** | **Inexistant** | **403** | `"error":"Workspace deletion is blocked..."` |
| T-11 | C | Valide API | **0** | **Inexistant** | **403** | (optionnel) |
| T-12 | C | Valide API | **absente** | **Inexistant** | **≠ 403** | — code observé — |
| T-13 | C | Valide API | **absente** | Existant ⚠️ | **200** | `"success":true` |

---

## 10. Critères de réussite globaux

### OPS-02 validé si toutes les conditions suivantes sont réunies

1. **Routes A, B, C** retournent toutes HTTP **403** avec le corps `{"success":false,"error":"Workspace deletion is blocked by the system administrator."}` lorsque `WORKSPACE_DELETION_PROTECTION=true` (T-05, T-06, T-07).

2. Le workspace est **préservé** après T-05, T-06, T-07 (vérification GET).

3. **Route C** retourne **403** lorsque la valeur est `1` (T-09) — confirme que présence seule suffit, valeur `1` comprise.

4. **Route C** retourne **403** lorsque la valeur est `false` (T-10) — confirme que `false` n'est pas interprété comme désactivation.

5. **Route C** retourne un code **différent de 403** (404 attendu) lorsque la variable est absente et le slug inexistant (T-12) — confirme que `next()` est appelé.

### ⚠️ Alertes immédiates — signaler et stopper

| Résultat observé | Signification | Action |
|-----------------|---------------|--------|
| T-05, T-06, ou T-07 retourne **200** | Protection non active malgré variable présente | ⛔ Arrêt — analyser la chaîne middleware |
| T-10 retourne **404** au lieu de 403 | Valeur `false` interprétée comme désactivation — comportement différent du code source | ⛔ Arrêt — signaler immédiatement |
| T-01 ou T-02 retourne **200** | Faille d'authentification sur Route C — distincte de la protection workspace | ⛔ Arrêt — analyser `validApiKey` |
| T-12 retourne **403** | Middleware actif sans la variable — variable héritée d'une autre source ? | ⛔ Arrêt — revoir l'environnement du conteneur |
| T-08 retourne **404** au lieu de 403 | Middleware intervient après le lookup du workspace — ordre incorrect | ⛔ Arrêt — analyser la chaîne middleware |

---

## 11. Ordre d'exécution recommandé

```
Phase 0 (lecture seule — aucune validation requise)
  → 0a : inventaire conteneurs
  → 0b : vérification volumes lab
  → 0c : vérification image lab
  → 0d : état de la variable dans le lab
  → 0e : test HTTP de base (serveur vivant ?)
  → 0f : liste des workspaces dans le lab
  → 0g : validation clé API
  → 0h : obtention token session admin
  → Partager tous les résultats bruts

[ARRÊT] — Florian valide les préconditions lab avant de continuer.
        Si aucun conteneur lab avec port : créer le lab (validation Florian).
        Si aucun workspace dans le lab : en créer un (validation Florian).

Phase 1 (variable = true — aucune modification si déjà en place)
  → T-01, T-02 : Route C sans auth / auth invalide
  → T-03, T-04 : Routes B et A sans auth
  → T-05 : Route C, auth valide, workspace existant ⭐
  → T-06 : Route B, auth valide, workspace existant ⭐
  → T-07 : Route A, auth valide, workspace existant ⭐
  → Vérification préservation workspace (GET)
  → T-08 : Route C, auth valide, workspace inexistant
  → Partager tous les résultats bruts

[ARRÊT] — Florian valide avant Phase 2 (recréation conteneur lab).

Phase 2 (variable = 1 — recréation conteneur lab)
  → Vérification post-modification
  → T-09 : Route C, auth valide, workspace existant
  → Partager les résultats

[ARRÊT] — Florian valide avant Phase 3 (recréation conteneur lab).

Phase 3 (variable = false — recréation conteneur lab)
  → Vérification post-modification
  → T-10 : Route C, auth valide, workspace INEXISTANT (non-destructif)
  → T-11 (optionnel, valeur 0)
  → Partager les résultats

[ARRÊT] — Florian valide avant Phase 4 (recréation conteneur lab, variable absente).

Phase 4 (variable absente)
  → Vérification post-modification
  → T-12 : Route C, auth valide, workspace INEXISTANT (non-destructif) ⭐
  → Partager les résultats

[ARRÊT] — Florian valide T-13 séparément (destructif pour le workspace de lab).

  → T-13 (optionnel) : Route C, auth valide, workspace existant — ⚠️ DESTRUCTIF
```

---

## 12. Hypothèses explicites non vérifiées en source

### Auth Routes A et B — non lu en source [hyp]

Le middleware d'authentification des Routes A (`/admin/workspaces/:id`) et B (`/workspace/:slug`) **n'a pas été lu directement** dans le code source pendant cette session. Les hypothèses sont fondées sur le pattern standard d'AnythingLLM à [C17] :

| Route | Auth attendue (hypothèse) |
|-------|--------------------------|
| A — Admin | JWT session + rôle admin (`flexUserRoleValid([ROLES.admin, ROLES.manager])`) |
| B — Workspace | JWT session authenticated (`validatedRequest`) |

**Impact :** si ces hypothèses sont incorrectes, les codes observés en T-03, T-04, T-06, T-07 seront différents des valeurs [hyp] du tableau. Dans tous les cas, les codes observés remplaceront les hypothèses — les tests restent valides.

**Pour lever ces hypothèses :** lire les routes A et B directement depuis l'image lab :

```bash
docker exec LAB_CONTAINER grep -n "workspaceDeletionProtection\|flexUserRoleValid\|validatedRequest" \
  /app/server/endpoints/admin.js /app/server/endpoints/workspaces.js
```

*(Commande non-destructive — peut être exécutée en Phase 0 pour compléter les informations.)*

### Réponse exacte du handler quand workspace introuvable [hyp]

Pour T-12 (variable absente, slug inexistant), le code attendu est 404 mais le corps exact dépend du handler AnythingLLM. Ce corps sera relevé lors du test.

---

## 13. Contexte et état actuel

| Élément | État | Source |
|---------|------|--------|
| `WORKSPACE_DELETION_PROTECTION=true` en production | Activée le 27/10/2026 | [PROD] |
| Test unitaire middleware PASS (403) | Effectué en production | [PROD] |
| Test HTTP Route A (`/admin/workspaces/:id`) | ❌ Non effectué | — |
| Test HTTP Route B (`/workspace/:slug`) | ❌ Non effectué | — |
| Test HTTP Route C (`/v1/workspace/:slug`) | ❌ Non effectué | — |
| Conteneur lab avec port publié | ❓ À confirmer en 0a | — |
| Sauvegarde de retour arrière | `~/services/ai-stack/backup-allm10-20261027-170318` | [PROD] |

**OPS-02 est le premier test HTTP authentifié des trois routes.** Le test unitaire du middleware ne se substitue pas à un test HTTP de bout en bout sur un serveur en cours d'exécution.

---

*OPS-02 / ALLM-10 — Protocole de vérification en laboratoire — 16 novembre 2026*  
*Lecture seule. Aucun fichier modifié, aucune branche modifiée, aucun test exécuté.*  
*Sources : [C17] tag v1.17.0, [CM] commit a5bb8b9c, [PROD] bilan 28/10/2026 (rapporté, non revérifié par Claude).*
