# Complément au Journal des incidents — ALLM-04
**Date :** 15 octobre 2026  
**Statut :** 🔎 Risque d’autorisation renforcé par inspection statique ; exploitabilité non démontrée  
**Périmètre :** lecture seule du code dans le conteneur `anythingllm`.

## Nouveaux constats

### 1. Middleware de clé API

Fichier : `/app/server/utils/middleware/validApiKey.js`

Le middleware vérifie qu’un bearer token correspond à une clé existante dans `ApiKey`, puis autorise la route. Dans le code consulté, il ne lie pas la clé à son créateur et n’applique pas de restriction de workspace.

Le modèle `ApiKey` contient un champ `createdBy` utilisé notamment pour l’affichage/audit, mais aucun contrôle de ce champ n’a été observé dans `validApiKey`.

### 2. Routes workspace

Fichier : `/app/server/endpoints/api/workspace/index.js`

- `GET /v1/workspaces` utilise `Workspace._findMany({ where: {} })` et inclut des métadonnées de threads. Aucun filtrage par utilisateur n’est visible.
- `GET /v1/workspace/:slug` recherche le workspace par slug et inclut `documents` et des métadonnées de threads. Aucun contrôle d’appartenance n’est visible.

À comparer avec `Workspace.whereWithUser(user, ...)` dans `/app/server/models/workspace.js`, qui filtre les workspaces pour les rôles autres que `admin` et `manager`. Les routes API examinées n’utilisent pas ce mécanisme.

### 3. Routes documents locaux

Fichier : `/app/server/endpoints/api/document/index.js`

- `GET /v1/documents` appelle `viewLocalFiles()` ou `getDocumentsByFolder(...)` après `validApiKey`.
- `GET /v1/documents/folder/:folderName` appelle `getDocumentsByFolder(...)` après `validApiKey`.

Aucun filtrage utilisateur n’est visible dans ces deux handlers. L’accès effectif aux fichiers et aux contenus doit encore être confirmé en examinant les fonctions auxiliaires et les routes documentaires de lecture/téléchargement.

### 4. Contrôle de chemin partiellement observé

Fichier : `/app/server/utils/files/index.js`, `getDocumentsByFolder()` (ligne 189 dans la version inspectée).

La fonction résout le dossier sous `documentsPath` et utilise `isWithin(documentsPath, folderPath)`, puis vérifie l’existence et le type de répertoire via `lstatSync`. Cela paraît bloquer une traversée de répertoires classique. L’implémentation de `isWithin`, `normalizePath` et le comportement en présence de liens symboliques n’ont pas encore été inspectés.

## Évaluation

**Risque : élevé pour la conception de l’automatisation, en attente de confirmation du périmètre réel d’accès.**

Plusieurs routes protégées seulement par la validité de la clé, dans le code observé, n’appliquent pas de filtre d’appartenance visible. Cela suggère une API à portée potentiellement globale. Toutefois, aucun accès non autorisé n’a été testé et aucune exploitation n’est démontrée.

## Actions et précautions

- Aucun test avec clé API, aucun accès croisé à des données privées, aucun import et aucune modification n’ont été effectués.
- Ne pas démarrer les imports automatiques n8n tant que les routes de lecture/téléchargement et les helpers associés n’ont pas été examinés.
- Continuer par l’inspection de `isWithin` et `normalizePath`, puis examiner les routes de lecture/téléchargement de documents et les fonctions appelées.
- Si une automatisation est ensuite retenue, traiter sa clé comme un secret de service privilégié, limiter les destinations de workspace dans le workflow, et ne jamais exposer cette clé aux utilisateurs finaux.

## Statut des conclusions

- **Vérifié dans le code examiné :** absence de filtrage utilisateur visible dans les routes citées ; `validApiKey` valide l’existence de la clé.
- **Non encore démontré :** accès effectif aux contenus privés, possibilités exactes de téléchargement, traversée par liens symboliques, exploitabilité pratique.
- **Aucun changement système :** confirmé.
