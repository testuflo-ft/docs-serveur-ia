# Rapport d'audit technique — INT-18 (move-files) et ALLM-12 (env-dump)

*Produit par Claude Sonnet 4.6 le 2026-11-02*  
*Mission : audit technique autonome (mission ChatGPT 2026-11-02)*  
*Périmètre : fichiers lab extraits du conteneur `anythingllm-fixlab` (ZIP 2026-11-02)*  
*Méthode : lecture directe du code — aucun test exécuté dans cette session*

---

## PARTIE 1 — INT-18 : `move-files` sans validation préalable

### 1.1 Contexte et défaut original

L'endpoint `POST /v1/document/move-files` permet de déplacer des fichiers dans l'espace de stockage de documents. Le défaut INT-18 identifié : l'absence de validation préalable des sources et destinations (écrasement silencieux possible, source manquante non détectée avant le début des opérations).

### 1.2 Deux mécanismes distincts dans le code

L'audit révèle qu'il existe **deux chemins de code séparés** pour le déplacement de fichiers :

#### Chemin A — Endpoint API externe : `POST /v1/document/move-files`
**Fichier :** `api-document-index.js` (lab, SHA `b9c901945162...`, timestamp 26/10/2026)

```javascript
// Lignes 1139–1194
const { files } = reqBody(request);
const docpaths = files.map(({ from }) => from);
const documents = await Document.where({ docpath: { in: docpaths } });
const embeddedFiles = documents.map((doc) => doc.docpath);
const moveableFiles = files.filter(({ from }) => !embeddedFiles.includes(from));
const movePromises = moveableFiles.map(({ from, to }) => {
  const sourcePath = path.join(documentsPath, normalizePath(from));
  const destinationPath = path.join(documentsPath, normalizePath(to));
  return new Promise((resolve, reject) => {
    if (!isWithin(documentsPath, sourcePath) || !isWithin(documentsPath, destinationPath))
      return reject("Invalid file location");
    fs.rename(sourcePath, destinationPath, (err) => { ... });
  });
});
Promise.all(movePromises).then(...).catch(...);
```

**État dans la version lab :** **Non corrigé pour INT-18.**  
- Aucune pré-validation de l'existence des sources
- Aucune détection de collision de destination avant le début des opérations
- `fs.rename()` sur une destination existante → **écrasement silencieux** sur Linux (comportement POSIX)
- `Promise.all()` avec démarrages parallèles → état partiel possible si un déplacement échoue

#### Chemin B — Interne lors du téléversement : `moveProcessedDocsToFolder`
**Fichier :** `files-index.js` (lab, SHA `959ee973681994...`, timestamp 25/10/2026)

```javascript
// Lignes 715–786
function moveProcessedDocsToFolder(documents = [], folderName = "", basePath = documentsPath) {
  const folder = normalizePath(folderName);
  // ... validation nom dossier ...

  // PHASE 1 : pré-validation complète AVANT toute opération
  const destinations = new Set();
  for (const doc of documents) {
    const sourcePath = path.join(basePath, normalizePath(doc.location));
    const destName = path.basename(doc.location);
    const destinationPath = path.join(targetFolderPath, destName);
    if (!isWithin(basePath, sourcePath) || !isWithin(basePath, destinationPath))
      throw new Error("Invalid file location.");
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile())
      throw new Error("Source file does not exist: " + doc.location);
    if (destinations.has(destName))
      throw new Error("Duplicate destination: " + destName);
    destinations.add(destName);
    if (fs.existsSync(destinationPath))
      throw new Error("Destination already exists: " + destName);
  }

  // PHASE 2 : exécution seulement si pré-validation réussie
  for (const doc of documents) {
    fs.linkSync(sourcePath, destinationPath);  // lien fort
    fs.unlinkSync(sourcePath);                 // suppression source
    // ...
  }
}
```

**État dans la version lab :** ✅ **Correctif INT-18 présent.**  
- Pré-validation en deux passes (validation puis exécution)
- Détection des doublons de destination (`Set`)
- Vérification d'existence des sources
- Détection de collision avant déplacement
- Mécanisme `linkSync`+`unlinkSync` plutôt que `rename` (plus contrôlé)

### 1.3 Évaluation du correctif lab INT-18

| Critère | Chemin A (API) | Chemin B (interne) |
|---|---|---|
| Pré-validation sources | ❌ Absente | ✅ Présente |
| Détection collision destination | ❌ Absente | ✅ Présente |
| Détection doublons | ❌ Absente | ✅ Présente |
| Atomicité | ❌ Partielle (Promise.all) | ⚠️ Non-atomique mais séquentiel |
| Protection traversée | ✅ `isWithin()` | ✅ `isWithin()` |
| Comportement en erreur E/S | ❌ État partiel possible | ⚠️ État partiel possible (linkSync partiel) |

### 1.4 Lacunes persistantes

1. **Chemin A (API externe) non corrigé** : L'endpoint `POST /v1/document/move-files` ne bénéficie pas du correctif INT-18. Il utilise toujours `fs.rename()` sans pré-validation. Si l'endpoint est exposé à des clients externes (n8n, API REST), le risque persiste.

2. **INT-18C (concurrence)** : Deux requêtes simultanées de déplacement peuvent créer une condition de concurrence entre la pré-validation et l'exécution (TOCTOU — Time Of Check / Time Of Use). Non adressé.

3. **INT-19B/C** : Non couverts (scénarios de bords non testés).

4. **Atomicité** : `linkSync`+`unlinkSync` n'est pas atomique. Une panne entre les deux laisse des doublons. Limitation inhérente au système de fichiers.

### 1.5 Niveau de validation

| Élément | Niveau | Source |
|---|---|---|
| Pré-validation dans `moveProcessedDocsToFolder` | [LAB] | Lecture directe `files-index.js` lab |
| API endpoint non corrigé | [LAB] | Lecture directe `api-document-index.js` lab |
| Tests mocks [LAB] mentionnés | [LAB] | Tableau de bord (non revus dans cette session) |
| Test HTTP bout-en-bout | ❌ Non exécuté | — |

---

## PARTIE 2 — ALLM-12 / CP-3 : routes env-dump sans authentification valide

### 2.1 Contexte et défaut original

ALLM-12 identifie deux routes permettant de vider la configuration en mémoire vers le fichier `.env` :
- `GET /env-dump` (interface web, `system.js`)
- `GET /v1/system/env-dump` (API REST, `api/system/index.js`)

Le défaut : ces routes seraient accessibles sans authentification valide, exposant potentiellement des secrets d'environnement.

### 2.2 État dans les fichiers lab

#### Route web : `GET /env-dump`
**Fichier :** `endpoints-system.js` (lab, SHA `0f7d5db7...`, timestamp 28/10/2026)

```javascript
// Lignes 93–100
// Intentionally unauthenticated so deploy/shutdown scripts can flush in-memory config to .env.
// Takes no input and returns nothing. NOT a vulnerability - see SECURITY.md.
app.get("/env-dump", [validApiKey], async (_, response) => {
  if (process.env.NODE_ENV !== "production")
    return response.sendStatus(200).end();
  dumpENV();
  response.sendStatus(200).end();
});
```

#### Route API : `GET /v1/system/env-dump`
**Fichier :** `api-system-index.js` (lab, SHA `825b898e...`, timestamp 28/10/2026)

```javascript
// Lignes 15–37
// Intentionally unauthenticated so deploy/shutdown scripts can flush in-memory config to .env.
// Takes no input and returns nothing. NOT a vulnerability - see SECURITY.md.
app.get("/v1/system/env-dump", [validApiKey], async (_, response) => {
  try {
    if (process.env.NODE_ENV !== "production")
      return response.sendStatus(200).end();
    dumpENV();
    response.sendStatus(200).end();
  } catch (e) {
    console.error(e.message, e);
    response.sendStatus(500).end();
  }
});
```

**Observation critique :** Dans les deux cas, le commentaire dit "Intentionally unauthenticated" mais le code applique `[validApiKey]`. Cette contradiction indique que :
- **Avant le correctif lab :** la route n'avait PAS de middleware (`app.get("/env-dump", async (_, response) => {...})`), conformément au commentaire
- **Après le correctif lab :** `[validApiKey]` a été ajouté — le commentaire est un vestige de l'état antérieur, non mis à jour

### 2.3 Ce que fait `dumpENV()`

La fonction `dumpENV()` flush la configuration en mémoire vers le fichier `.env`. Dans un conteneur Docker AnythingLLM en production, ce fichier peut contenir des secrets critiques : clés API LLM, connexions base de données, secrets JWT, clés OIDC, etc.

L'intention documentée est de permettre à des scripts de déploiement/arrêt de persister la configuration. Cependant, une route HTTP exposée pour cet usage constitue un vecteur d'attaque si elle n't est pas protégée.

### 2.4 Analyse du correctif lab

**Ce que le correctif fait :**  
Ajoute `[validApiKey]` middleware — exige une clé API valide (header `Authorization: Bearer <key>` ou équivalent).

**Ce que le correctif ne fait PAS :**

| Limitation | Description |
|---|---|
| **Type d'auth** | `validApiKey` valide une clé API AnythingLLM — il ne valide pas une session utilisateur (JWT/cookie). Tout détenteur d'une clé API valide peut déclencher l'appel. |
| **Chiffrement de sortie** | `dumpENV()` écrit les secrets en clair dans `.env` — inchangé |
| **Scope de la route** | La route ne prend aucune entrée, mais elle déclenche une écriture disque avec potentiellement des données sensibles |
| **Port d'exposition** | Si le port 3001 est exposé hors Tailscale (à vérifier avec `docker port anythingllm`), toute entité avec une clé API valide peut l'appeler depuis l'extérieur |
| **Commentaire obsolète** | Le commentaire "Intentionally unauthenticated" est trompeur dans la version lab — risque de confusion lors d'une future revue |

### 2.5 Contexte production

Le Tableau de bord note :
> "Surface réseau à confirmer (`docker port anythingllm`) ; si port 3001 exposé hors Tailscale, risque d'exposition de secrets d'environnement"

Ce risque n'a pas changé avec le correctif lab. Si une clé API est compromise, la route `/env-dump` peut toujours être appelée depuis l'extérieur si le port 3001 est accessible.

Les **options A/B/C** du Plan v0.6 §2.7 (décision D1 en attente de Florian) restent pertinentes :
- **Option A :** Middleware `validApiKey` (= ce que fait le lab) — requis : port non exposé publiquement
- **Option B :** Middleware session admin uniquement (plus restrictif)
- **Option C :** Supprimer la route (si les scripts de déploiement ne l'utilisent pas)

### 2.6 Niveau de validation

| Élément | Niveau | Source |
|---|---|---|
| Middleware `[validApiKey]` présent dans lab | [LAB] | Lecture directe fichiers lab |
| Comportement original (sans middleware) | [IMG] | Commentaire "Intentionally unauthenticated" + ALLM-12 documenté |
| Test HTTP d'accès sans clé | ❌ Non exécuté | — |
| Exposition port 3001 | ❌ Non vérifié | `docker port anythingllm` non exécuté |
| Contenu de `dumpENV()` | Non lu dans cette session | — |

---

## PARTIE 3 — INT-20 / PUR-01 : synthèse (sujet connexe)

### 3.1 Route `DELETE /system/remove-folder`

**Fichier lab :** `endpoints-system.js` lignes 500–517

```javascript
app.delete(
  "/system/remove-folder",
  [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
  async (request, response) => {
    try {
      const { name } = reqBody(request);
      const result = await purgeFolder(name);
      response.status(200).json(result);
    } catch (e) {
      console.error(e.message, e);
      response.status(e.statusCode || 500).json({
        success: false,
        code: e.code || "FOLDER_PURGE_FAILED",
        message: e.message || "Failed to remove folder.",
      });
    }
  }
);
```

**Correction par rapport à l'état antérieur :**
- `purgeFolder(name)` lève maintenant des erreurs typées (`statusCode`, `code`, `message`) que le handler propage correctement
- Plus de retour anticipé silencieux → faux succès corrigé
- Protection d'entrée dans `purgeFolder()` : `fail(400, ...)`, `fail(403, ...)`, `fail(404, ...)`
- Accès réservé aux rôles admin/manager (`flexUserRoleValid`)

### 3.2 Route API `DELETE /v1/document/remove-folder`

**Fichier lab :** `api-document-index.js` lignes 1036–1092

```javascript
app.delete(
  "/v1/document/remove-folder",
  [validApiKey],
  async (request, response) => {
    try {
      const { name } = reqBody(request);
      const result = await purgeFolder(name);
      response.status(200).json(result);
    } catch (e) {
      console.error(e);
      response.status(e.statusCode || 500).json({
        success: false,
        code: e.code || "FOLDER_PURGE_FAILED",
        message: e.message ? `Failed to remove folder: ${e.message}` : "Failed to remove folder.",
      });
    }
  }
);
```

Même correction que la route web. Les deux routes utilisent la même fonction `purgeFolder()` du lab.

### 3.3 Limites INT-20 persistantes

| Limite | Description |
|---|---|
| Contrôle SQL/LanceDB | `purgeFolder()` appelle `Document.removeDocuments()` et `purgeVectorCache()` mais ne vérifie pas l'état SQL après exécution |
| `purgeDocument.js` lab ≠ candidat v4 | Le `purgeDocument()` lab (appelé via `purgeFolder`) utilise l'ordre incorrect (PUR-02-A/B non corrigés) |
| Test HTTP bout-en-bout | Non exécuté |
| Scénario erreur LanceDB partielle | Non testé |

**Point d'attention :** La version lab de `purgeFolder` appelle `Workspace.where()` via `purgeDocument.js` lab (non corrigé PUR-02-A). Si PUR-02 v4 est déployé, il faudra s'assurer que `purgeFolder` dans les endpoints utilise la version v4 de `purgeDocument.js`, pas la version lab.

---

## 4. Récapitulatif des décisions nécessaires

| Sujet | Décision requise |
|---|---|
| INT-18 (API `/v1/document/move-files`) | Décider si l'endpoint API externe doit aussi bénéficier d'une pré-validation. Si oui : correctif séparé à préparer. |
| ALLM-12 (env-dump) | Décision D1 (options A/B/C) de Florian en attente. Le lab a appliqué l'option A (`validApiKey`). |
| INT-20 (remove-folder + purgeDocument) | Si PUR-02 v4 est déployé, vérifier la cohérence avec le `purgeDocument.js` utilisé par `purgeFolder`. |
| Port 3001 exposition | Vérifier `docker port anythingllm` avant tout déploiement ALLM-12 |

---

*Sources : `api-document-index.js`, `files-index.js`, `endpoints-system.js`, `api-system-index.js` (fichiers lab ZIP) ; `Tableau-de-bord-correctifs-2026-11-01.md` ; lecture directe code dans cette session.*
