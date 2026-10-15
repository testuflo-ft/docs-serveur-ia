# Complément au Livret technique — AnythingLLM API
**Date : 15 octobre 2026**  
**À intégrer dans la section 7.4 « Import/cache/suppression » ou dans une sous-section Sécurité API.**

## Vérification complémentaire des autorisations API

Inspection en lecture seule du code présent dans le conteneur `anythingllm`. Aucune clé API n’a été créée, aucun document n’a été importé et aucune permission n’a été modifiée.

### Middleware `validApiKey`

Fichier : `/app/server/utils/middleware/validApiKey.js`

Le middleware :
- lit le bearer token de l’en-tête `Authorization` ;
- vérifie qu’une clé correspondante existe dans `ApiKey` ;
- appelle ensuite `next()`.

Dans le code consulté, il ne compare pas le créateur de la clé (`createdBy`) à l’utilisateur courant et ne limite pas la clé à un workspace. En mode multi-utilisateur, la création des clés via les routes d’administration est réservée à un administrateur, mais cela ne démontre pas que les clés obtenues sont limitées à ses seuls espaces de travail.

### Routes de consultation des workspaces

Fichier : `/app/server/endpoints/api/workspace/index.js`

- `GET /v1/workspaces` utilise `[validApiKey]`, puis appelle `Workspace._findMany({ where: {}, ... })`. Aucun filtrage par utilisateur n’est visible dans cette route.
- `GET /v1/workspace/:slug` utilise `[validApiKey]`, recherche le workspace par slug et inclut `documents` ainsi que certaines métadonnées de threads. Aucun contrôle d’appartenance n’est visible dans le code examiné.

### Route de consultation des documents locaux

Fichier : `/app/server/endpoints/api/document/index.js`

- `GET /v1/documents` utilise `[validApiKey]`, puis appelle `viewLocalFiles()` ou `getDocumentsByFolder(...)`.
- `GET /v1/documents/folder/:folderName` utilise `[validApiKey]`, puis appelle `getDocumentsByFolder(...)`.

Dans les routes examinées, aucun filtrage par utilisateur n’est visible. Il faut encore vérifier les fonctions auxiliaires et les routes de lecture/téléchargement avant de conclure sur les données réellement accessibles.

### Vérification partielle de `getDocumentsByFolder`

Fichier : `/app/server/utils/files/index.js`, fonction commençant à la ligne 189 dans la version inspectée.

La fonction :
- normalise le chemin et le résout sous `documentsPath` ;
- vérifie avec `isWithin(documentsPath, folderPath)` que le chemin résolu est dans le répertoire documentaire prévu ;
- vérifie que le chemin existe et que `lstatSync(...).isDirectory()` est vrai ;
- liste ensuite les fichiers JSON du dossier.

C’est une protection apparente contre les traversées de répertoires classiques. La fonction `isWithin`, `normalizePath` et le comportement face aux liens symboliques (notamment dans les composants intermédiaires du chemin) restent à inspecter. La fonction ne montre pas de contrôle d’identité ou d’appartenance à un workspace.

### Conséquence pour l’architecture

Jusqu’à la fin de ces vérifications, considérer la clé API AnythingLLM comme un accès potentiellement transversal à l’instance, et non comme une clé automatiquement limitée au compte qui l’a créée.

**Ne pas lancer l’automatisation n8n des imports inter-utilisateurs à ce stade.** Toute conception future devra imposer des destinations de workspace côté serveur/workflow, ne pas accepter un slug de destination libre depuis un utilisateur final, et définir les contrôles d’accès avant import.

**État :** risque d’autorisation à approfondir ; aucun test d’accès non autorisé n’a été effectué.
