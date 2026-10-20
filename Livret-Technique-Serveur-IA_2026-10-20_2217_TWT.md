# Livret technique — Serveur IA Mac mini + Synology

*Version 0.4 — 20 octobre 2026 — copie de travail complète datée pour revue Claude*

> Cette copie consolide l’état connu du serveur et les résultats de l’audit AnythingLLM. Elle n’est pas publiée sur GitHub et ne remplace pas encore le fichier de référence du dépôt. Les éléments non revalidés depuis le serveur sont marqués en conséquence.

## Statuts utilisés

- ✅ **Vérifié** : constat observé directement ou code source identifié.
- ⚙️ **Configuré, non testé ici** : configuration rapportée ou lue, mais pas retestée dans cette étape.
- 🔲 **À faire** : action prévue et pas encore réalisée.
- ⚠️ **Risque / hypothèse** : impact plausible dont l’exploitation ou l’impact exact reste à confirmer.
- 🗄️ **Historique** : conserve la trace d’une ancienne configuration ou d’un incident.

## 1. Objectifs et principes

Le projet utilise un Mac mini comme serveur de calcul IA local, un Synology comme stockage partagé, Ollama pour les modèles locaux, et des interfaces web accessibles aux membres autorisés de la famille. L’objectif est de fournir une recherche documentaire (RAG) sur des corpus communs et, à terme, sur des dossiers personnels séparés.

Principes à respecter :

- accès distant par le réseau privé Tailscale ; chaque application doit aussi appliquer son authentification propre lorsqu’elle en prévoit une ;
- données communes dans `Corpus-IA`, données personnelles dans des espaces séparés ; ne jamais placer des données sensibles dans les répertoires montés en commun ;
- montages NAS en lecture seule dans les conteneurs qui lisent les sources ;
- pas de déploiement, redémarrage, import massif, suppression ou modification de production pendant l’audit ;
- aucun secret, mot de passe ou token dans les documents techniques ; noter uniquement son emplacement et son usage ;
- distinguer explicitement les faits vérifiés, les risques et les tâches à accomplir.

## 2. Matériel et réseau

### 2.1 Mac mini `minimac`

| Élément | Valeur connue |
|---|---|
| Modèle indiqué par l’utilisateur | Mac mini M5 Pro |
| Mémoire unifiée | 64 Go |
| Stockage interne | 512 Go |
| Réseau local vers NAS | `192.168.1.104` sur `en0` |
| Tailscale | `minimac.saiga-tilapia.ts.net`, `100.73.109.89` |
| Accès d’administration | SSH ; pas d’écran/session graphique à disposition |
| Ollama | `/opt/homebrew/bin/ollama` ; service `/opt/homebrew/opt/ollama/bin/ollama serve` |

La session serveur est administrée par SSH. Ne pas dépendre de Finder, `osascript`, ni d’une interaction graphique pour l’exploitation courante.

### 2.2 Synology `SERVOR`

| Élément | Valeur connue |
|---|---|
| Adresse LAN de la liaison Mac/NAS | `192.168.1.103` |
| Tailscale | `servor.saiga-tilapia.ts.net`, `100.77.102.38` |
| DSM HTTPS | port `5001` |
| Partages utilisés | `Corpus-IA`, `home`, `homes`, `docker` |

L’accès SMB à `Corpus-IA` a été validé avec les comptes `Florian` et `Corpuser-IA`. Le compte dédié `Corpuser-IA` ne dispose pas de `homes`. Le partage `Corpus-IA` doit contenir uniquement des ressources destinées au corpus commun.

## 3. Accès réseau et portail

Les services sont publiés sur le réseau privé par Tailscale Serve, via les ports externes documentés ci-dessous. Ne pas interpréter « accessible via Tailscale » comme équivalent à « authentifié dans l’application » : ces deux contrôles sont distincts.

| Service | Port local/container connu | URL/port Tailscale connu | État rapporté |
|---|---:|---|---|
| Open WebUI | `3000` | `https://minimac.saiga-tilapia.ts.net:8444` | sain lors du dernier contrôle rapporté |
| AnythingLLM | `3001` | `https://minimac.saiga-tilapia.ts.net:8445` | sain lors du dernier contrôle rapporté |
| Homer | `8888` | `https://minimac.saiga-tilapia.ts.net:8443` | sain lors du dernier contrôle rapporté |
| n8n | `5678` | pas de publication externe confirmée ici | en place |
| Home Assistant | `8123` | non confirmé ici | en place |
| documentation API évoquée | dépend de l’application | `/docs/` a été mentionné | vérifier l’URL effective avant utilisation |

Open WebUI était configuré avec `WEBUI_URL=https://minimac.saiga-tilapia.ts.net:8444` et un SSO OIDC Synology. L’issuer rapporté utilise `servor...:5001/webman/sso`. La configuration actuelle n’a pas été retestée pendant cet audit.

## 4. Montage automatique des partages SMB

- Corpus monté côté macOS sur `/Users/florian/IA/Corpus-IA`.
- LaunchAgent : `com.florian.mount-corpus-ia`.
- Script : `~/bin/ensure-nas-mount.sh`, permissions rapportées `700`.
- Identifiants SMB lus depuis `~/.nsmbrc` par le script ; ce fichier contient un mot de passe en clair et doit rester en permissions `600`. Ne jamais en afficher le contenu ni consigner la valeur du mot de passe.
- Point de montage de corpus configurable par `NAS_MP`, avec défaut `$HOME/IA/Corpus-IA`.
- Le partage `home` a aussi été monté sur `~/NAS-Home-Test`; le répertoire `Travail` est le dossier personnel pertinent à ce stade.

Historique : l’option `mount_smbfs -N` a échoué avec `Authentication error`; l’approche Finder/`osascript` a bloqué faute de session graphique. Le script shell avec lecture du secret depuis `~/.nsmbrc` a été rapporté comme fonctionnel. Ne pas relancer d’essais de montage ni modifier les permissions sans nécessité.

## 5. Stack Docker

Fichier Compose : `/Users/florian/services/ai-stack/compose.yaml`. Version rapportée de Docker Compose : `v5.1.2`.

Conteneurs et volumes connus :

- AnythingLLM : port `3001`, stockage persistant Docker `anythingllm`, répertoire de stockage `/app/server/storage`, version déployée rapportée `1.17.0` ;
- Open WebUI : port `3000`, volume `open-webui` ;
- n8n : port `5678`, volume `n8n-data` ;
- Homer : port `8888` ;
- Home Assistant : port `8123`.

Montages rapportés :

| Source macOS | Destination dans le conteneur | Accès |
|---|---|---|
| `/Users/florian/IA/Corpus-IA` | `/mnt/nas-corpus` | lecture seule dans AnythingLLM et n8n |
| `/Users/florian/NAS-Home-Test/Travail` | `/mnt/florian-travail` | lecture seule dans AnythingLLM |

Le montage historique `~/NAS-Test` dans Open WebUI a été supprimé. Ne pas confondre ces chemins de lecture NAS avec le stockage géré par AnythingLLM : les fichiers source montés ne sont pas automatiquement indexés par le RAG.

AnythingLLM reçoit le service Ollama via `http://host.docker.internal:11434`. Le fichier `anythingllm.env` est utilisé pour les paramètres secrets/configuration ; ne jamais copier son contenu dans ce document. La clé JWT a déjà causé un problème après recréation de conteneur et a été corrigée à l’époque.

## 6. Ollama et modèles

Modèles installés rapportés :

| Modèle | Taille rapportée | Usage/observation |
|---|---:|---|
| `bge-m3:latest` | 1,2 Go | embeddings |
| `llama3.1:8b` | 4,9 Go, Q4_K_M | contexte rapporté 131072 |
| `gemma3:12b` | 8,1 Go | Open WebUI ; pas d’outils disponibles dans le test rapporté |
| `mistral:latest` | 4,4 Go ; `ollama show` indique 7,2B, Q4_K_M | AnythingLLM modèle par défaut rapporté ; tool calling disponible dans le test rapporté |

Les comportements des modèles peuvent varier avec la version, le provider, le contexte et les paramètres. Les observations ci-dessus ne sont pas des garanties universelles.

## 7. Open WebUI

- Version/image/API rapportée : `0.11.4`.
- Espace documentaire de test `Corpus-AI-test`, six fichiers attendus selon le dernier état rapporté.
- Le PDF scanné `07_fiche_controle_extincteur_scan_FR.pdf` n’était pas indexé correctement parce que le contenu extrait était vide ; Tesseract a ensuite été installé, mais la réindexation et la validation finale restent à confirmer.
- Une clé API Open WebUI exposée précédemment fait l’objet de l’incident `OWUI-04`; ne pas réutiliser l’ancienne clé. Confirmer son remplacement/révocation avant de nouvelles intégrations.

## 8. AnythingLLM : configuration et permissions

### 8.1 État applicatif rapporté

- Image/version : `1.17.0`.
- Provider LLM : Ollama, base `http://host.docker.internal:11434`.
- Modèle favori rapporté dans l’environnement : `mistral:latest`.
- Embeddings : BGE était sélectionné dans l’interface, malgré une configuration d’environnement précédemment décrite comme native ; vérifier la source effective avant tout changement.
- Espaces : `Mon Espace de Travail` et `Test-Corpus-IA` (`test-corpus-ia`).
- `florian-admin` : rôle Admin ; `Florian` : non-admin. Florian était associé par défaut à `Test-Corpus-IA`; réglages de recherche rapportés : `vectorSearchMode=query`, seuil `0.0`, `topN=4`.
- Un import d’essai par API de `06_volunteer_day_notice_2026-11_ZH.txt` a été rapporté comme réussi ; la date attendue dans la réponse était le 7 novembre 2026.

### 8.2 Frontière de sécurité de l’API Developer

Dans la source officielle du tag `v1.17.0` :

- `server/index.js` monte `apiRouter` sous `/api` (ligne 81) et appelle `developerEndpoints(app, apiRouter)` (ligne 97). Aucun middleware global `validApiKey` n’est attaché à `app.use("/api", apiRouter)` dans l’extrait examiné.
- `server/endpoints/api/index.js` enregistre les routes Developer API : admin, auth, system, workspace, documents, threads, user management, OpenAI-compatible et embeds. Le commentaire exige que les routes passent par `validApiKey`, mais le commentaire ne constitue pas un mécanisme d’exécution.
- Les principales routes inspectées appliquent `validApiKey` localement. Exception identifiée : `GET /v1/system/env-dump` dans `server/endpoints/api/system/index.js` n’ajoute pas ce middleware. Avec le préfixe `/api`, le chemin effectif est `/api/v1/system/env-dump`.
- En production, le gestionnaire appelle `dumpENV()` puis répond `200`. `dumpENV()` écrit les variables protégées du processus dans `server/.env` (chemin résolu par `path.join(__dirname, "../../.env")`, dans `server/utils/helpers/updateENV.js`). La réponse ne renvoie pas les valeurs, mais la route autorise le déclenchement non authentifié d’une écriture de configuration persistante. L’exploitation et l’impact sur les redémarrages n’ont pas été testés sur l’instance.
- Les routes documentaires d’import, le retrait d’un dossier, les routes système de modification de paramètres, plusieurs opérations admin et les routes de conversations exigent localement une clé API. Il faut inventorier les protections route par route plutôt que déduire les autorisations du seul commentaire global.

**Décision d’architecture :** la politique `SECURITY.md` du dépôt AnythingLLM précise que les Developer API keys sont des identifiants système créés par les administrateurs, qui accordent intentionnellement un accès complet à `/v1/*`, équivalent à un accès administrateur. L’absence de portée par espace est donc un choix documenté du produit, non un défaut à corriger uniquement par `createdBy`. Pour limiter n8n, ne pas lui confier une clé complète si des opérations doivent être interdites.

### 8.3 Matrice des routes Developer API inspectées

Le tableau suivant cartographie les familles d’API définies dans `server/endpoints/api/index.js` au tag `v1.17.0`. « Clé exigée » décrit le middleware local constaté dans les routes échantillonnées ; cela ne signifie pas une permission à portée limitée. La politique officielle attribue à toute Developer API key un accès système complet.

| Famille / exemples de chemins | Protection visible | Portée fonctionnelle constatée |
|---|---|---|
| `GET /api/v1/auth` | `validApiKey` | Vérifier la validité de la clé. |
| `/api/v1/admin/*` | généralement `validApiKey` ; handlers utilisant parfois le garde `multiUserMode` | Lister/créer/modifier/supprimer des utilisateurs et invitations, gérer les utilisateurs de workspace et certains réglages/chats d’administration. Ce n’est pas une clé scoped. |
| `/api/v1/system` ; `/vector-count` ; `/update-env` ; `/export-chats` ; `/remove-documents` | `validApiKey` dans les routes inspectées | Lire des réglages, compter les vecteurs, modifier la configuration, exporter les chats, purger des documents. Opérations système sensibles. |
| `GET /api/v1/system/env-dump` | **Aucun `validApiKey` visible** | En production, appelle `dumpENV()` et écrit le fichier `.env` dans le système de fichiers du conteneur. Voir ALLM-12. |
| `/api/v1/workspace/new` ; `/workspaces` ; `/workspace/:slug` ; `/update` ; `/chats` ; `/chat` ; `/stream-chat` ; `/vector-search` ; `/update-embeddings` ; `/update-pin` | `validApiKey` ; suppression de workspace ajoute `workspaceDeletionProtection` | Créer/lister/lire/modifier/supprimer, interroger et gérer les espaces. Les listes et recherches peuvent couvrir les workspaces de l’instance ; ne pas supposer une isolation utilisateur via la clé. |
| `/api/v1/document/upload` ; `/upload/:folderName` ; `/upload-link` ; `/raw-text` | `validApiKey`; upload fichier ajoute le middleware Multer et la validation de la forme du slug | Importer documents/liens/texte et demander l’association à des workspaces. La validation du format `addToWorkspaces` n’est pas une vérification de permissions par workspace. |
| `/api/v1/documents` ; `/documents/folder/:folderName` ; `/document/:docName` ; `/accepted-file-types` ; `/metadata-schema` ; `/create-folder` ; `/remove-folder` ; `/move-files` ; `/generated-files/:filename` | `validApiKey` dans les routes inspectées | Inventorier/lire des documents, gérer les dossiers et déplacements, accéder aux fichiers générés. `remove-folder` appelle `purgeFolder`; traiter ces routes comme privilégiées. |
| `/api/v1/workspace/:slug/thread/*` | `validApiKey` sur création, mise à jour, suppression et lecture/écriture de conversations | Manipuler threads et chats d’un workspace choisi par slug. Le handler consulte l’espace avec `Workspace.get`, pas un contexte utilisateur scoping dans les extraits relevés. |
| `/api/v1/users` ; `/users/:id/issue-auth-token` | `validApiKey`; émission de token ajoute `simpleSSOEnabled` | Énumérer des utilisateurs et, si configuration compatible, demander un token d’authentification. Fonctionnalités sensibles. |
| `/api/v1/embed/*` | `validApiKey` dans les routes inspectées | Lister/créer/modifier/supprimer des embeds et consulter leurs chats. |
| `/api/v1/openai/models` ; `/chat/completions` ; `/images/generations` ; `/embeddings` ; `/vector_stores` | `validApiKey` dans les routes inspectées | Compatibilité API OpenAI, chat, génération d’images, embeddings et informations vector stores. |

Cette cartographie couvre les familles Developer API inscrites par `developerEndpoints`. Elle ne remplace pas l’inspection d’un chemin concret avant d’en autoriser l’usage. Elle n’a pas été confirmée par des appels HTTP contre le serveur réel.

### 8.3 Accès aux workspaces

Les contrôles de permissions de l’interface utilisateur s’appuient sur des fonctions telles que `Workspace.getWithUser` et `Workspace.whereWithUser`, ainsi que sur des middlewares de rôle fondés sur l’utilisateur de session. Les routes Developer API inspectées utilisent fréquemment `Workspace.get`, `Workspace.where` ou des requêtes Prisma globales avec seulement `validApiKey`. Ce modèle d’API est à considérer comme administrateur/système, pas comme équivalent à un compte web limité à un workspace.

Aucune clé ou session non privilégiée ne doit être présumée limitée à ses espaces dans les appels Developer API, sauf preuve route par route.

## 9. Import documentaire : flux et cohérence

### 9.1 Flux simplifié

1. n8n lit les fichiers depuis `/mnt/nas-corpus` (lecture seule).
2. Une intégration appelle un endpoint d’import d’AnythingLLM et peut fournir `addToWorkspaces`.
3. Le collecteur convertit le fichier et écrit une version JSON dans `STORAGE_DIR/documents` (notamment `custom-documents` pour certains flux).
4. `Document.api.uploadToWorkspace` résout les slugs de workspace, puis appelle `Document.addDocuments`.
5. Pour chaque source, `Document.addDocuments` charge les données, appelle le provider vectoriel, puis crée l’association `workspace_documents` en base relationnelle.
6. Pour LanceDB, les vecteurs sont ajoutés au namespace puis la cache vectorielle du chemin de fichier peut être écrite et les identifiants de vecteur enregistrés en base. Il n’existe pas de transaction distribuée visible entre ces systèmes.

### 9.2 Défauts ou risques visibles dans le code

- `server/endpoints/api/document/index.js` valide que `addToWorkspaces` est une chaîne formatée comme attendu, mais cette validation n’est pas en elle-même une validation de permissions d’utilisateur/workspace.
- `Document.api.uploadToWorkspace` rapporte un résultat basé sur `failedToEmbed`; les routes d’upload inspectées ne propagent pas toujours rigoureusement tous les échecs et peuvent répondre `success: true` si des erreurs d’association relationnelle surviennent après l’ajout de vecteurs.
- Dans `Document.addDocuments`, les vecteurs sont ajoutés avant `prisma.workspace_documents.create`. Si la création relationnelle échoue, le code journalise l’erreur et émet `doc_failed`, mais ne supprime pas explicitement les vecteurs ajoutés. Cela peut laisser des vecteurs sans association SQL.
- `Document.removeDocuments` se base sur l’association SQL pour trouver le `docId`; la suppression des vecteurs LanceDB s’appuie sur les lignes `DocumentVectors`. En l’absence de ce mapping, un vecteur orphelin peut être difficile à supprimer par le flux habituel.
- `vector-cache` est indexé à partir du chemin source, via UUIDv5 du nom/chemin, et non d’une empreinte du contenu. Si le contenu change sans changer le chemin, le cache existant peut réutiliser des chunks périmés.
- Les imports ordinaires du collecteur peuvent générer des noms de fichiers internes avec UUID. Dans ce cas, un réimport peut créer un nouveau chemin plutôt que réutiliser la cache précédente, avec risque distinct de doublons et d’accumulation d’anciens documents. Ce comportement dépend du chemin et de la méthode d’import ; il ne faut pas conclure que chaque réimport sert des chunks périmés.
- `purgeFolder` déclare être non récursif pour le traitement des caches/associations, puis supprime le dossier de façon récursive. Les fichiers imbriqués peuvent ne pas avoir été individuellement purgés avant la suppression du répertoire.
- L’endpoint `DELETE /v1/document/remove-folder` exige seulement `validApiKey` dans le fichier de route inspecté. Étant donné le caractère administrateur de la Developer API, cette opération doit être traitée comme privilégiée.

Aucun cache ni document de production n’a été modifié ou supprimé au cours de l’audit.

## 10. Stratégie recommandée pour n8n

Ne pas utiliser une clé Developer API complète comme identité de moindre privilège. Deux approches à comparer :

1. **Passerelle d’import dédiée** : service interne non exposé publiquement, accessible uniquement à n8n, avec une API minimale. La passerelle possède la clé système en secret et n’accepte que les opérations prédéfinies. Elle valide strictement les chemins, les tailles et types de fichiers, et mappe les sources à une liste explicite de workspaces autorisés côté serveur.
2. **Évolution du produit / fork contrôlé** : implémenter des identités d’intégration et des portées (opération + workspaces) appliquées côté serveur à chaque route, puis maintenir le patch à chaque mise à jour. Lier simplement une clé à `createdBy` ne suffit pas sans contrôle d’autorisation explicite dans les handlers/middlewares.

La passerelle doit être fail-closed : refuser toute opération non listée, tout workspace non autorisé, toute destination inattendue et toute suppression. La clé système ne doit être accessible ni au navigateur des utilisateurs ni au workflow n8n en clair si une couche de service peut la conserver.

### Tests à réaliser hors production avant déploiement

- clé absente / invalide : refus ;
- import vers workspace autorisé : succès, puis vérification de l’association SQL et des vecteurs ;
- import vers workspace interdit ou slug inconnu : refus explicite avant tout écrit ;
- suppression et déplacement hors périmètre : refus ;
- échec d’embedding ; échec d’écriture SQL après insertion vectorielle ; échec d’écriture cache ;
- même contenu importé deux fois ; contenu modifié au même chemin ; renommage ; suppression de fichier ; dossier contenant des sous-dossiers ;
- cohérence entre réponse HTTP, journaux, associations SQL, `DocumentVectors`, namespace LanceDB et cache ;
- appel à `/api/v1/system/env-dump` sans authentification dans un environnement de test : il doit être refusé après correction et ne doit pas écrire le fichier.

Ces tests sont une spécification ; ils n’ont pas encore été exécutés.

## 11. Corpus et espaces personnels

Le corpus commun `/mnt/nas-corpus` doit être en lecture seule et servir uniquement de source d’import. Les dossiers personnels, à commencer par `/mnt/florian-travail`, doivent être accessibles seulement par les utilisateurs/workspaces autorisés. Ne pas ajouter de répertoires comme immobilier ou voyages au montage partagé avant d’avoir défini les ACL, la propriété du workflow d’import et les règles de rétention.

Le picker de fichiers AnythingLLM sur téléphone ne fournit pas un navigateur libre du NAS ; le montage au conteneur ne signifie pas que l’utilisateur peut sélectionner directement les fichiers du NAS depuis l’interface.

## 12. Documentation, sauvegardes et procédures

Dépôt documentaire : `testuflo-ft/docs-serveur-ia`, avec les fichiers de référence :

- `Livret-Technique-Serveur-IA.md` — architecture, configuration et décisions d’exploitation ;
- `Journal-des-Incidents.md` — incidents/risques datés, preuves, impacts, tests et actions.

L’écriture GitHub par le connecteur avait renvoyé `403 Resource not accessible by integration` (`GIT-01`). Les fichiers de cette copie datée sont destinés à être relus, puis téléversés manuellement ou publiés après autorisation explicite et résolution des droits du connecteur. Rien n’a été poussé sur GitHub ici.

Les sauvegardes vers Infomaniak étaient prévues mais non confirmées comme configurées. Définir la sauvegarde et le test de restauration pour le volume AnythingLLM (base relationnelle, documents, configuration sans divulgation de secrets, cache si utile) avant un déploiement majeur.

## 13. Actions en attente — ordre de priorité

### P0 — sécurité

1. 🔲 Corriger la route `/api/v1/system/env-dump` non authentifiée dans la version déployée ou la neutraliser de façon sûre ; vérifier le résultat en environnement de test avant tout déploiement.
2. 🔲 Vérifier que les accès Tailscale ne sont pas considérés comme un substitut à l’authentification applicative.
3. 🔲 Ne pas distribuer une Developer API key complète à n8n ou à un utilisateur standard ; concevoir une passerelle restreinte.
4. 🔲 Confirmer la révocation/remplacement de l’ancienne clé API Open WebUI de l’incident OWUI-04.

### P1 — intégrité RAG

5. 🔲 Définir une stratégie d’import idempotent et de remplacement/suppression de document.
6. 🔲 Propager correctement les erreurs d’indexation et d’association SQL ; prévoir une réconciliation ou compensation pour les vecteurs orphelins.
7. 🔲 Définir l’invalidation du cache sur changement de contenu et tester la suppression de dossiers avec sous-dossiers.
8. 🔲 Maintenir l’automatisation n8n en pause tant que les tests d’autorisation et de cohérence ne sont pas passés.

### P2 — exploitation

9. 🔲 Terminer la validation OCR/réindexation du PDF scanné Open WebUI.
10. 🔲 Définir une procédure de sauvegarde et de restauration vérifiée.
11. 🔲 Produire une matrice des permissions réelles par utilisateur, workspace, route et opération.
12. 🔲 Résoudre le problème de permission du connecteur GitHub avant de publier les mises à jour documentaires.

## 14. Sources de code vérifiées dans cet audit

Source amont : [`Mintplex-Labs/anything-llm`, tag `v1.17.0`](https://github.com/Mintplex-Labs/anything-llm/tree/v1.17.0). Le tag `v1.18.0` a aussi été consulté pour vérifier que la route `env-dump` demeure définie sans `validApiKey` dans `server/endpoints/api/system/index.js`.

- `server/index.js` — montage du routeur API ; source SHA `66e2ef965f3e36ee0f884ee7d64dea31e0aefb7e`.
- `server/endpoints/api/index.js` — inscription des familles de routes ; SHA `6879c0150aee4e8ae9a7e9cbc2b3a814b86dc7e4`.
- `server/endpoints/api/system/index.js` — route env-dump et routes système ; SHA `017bec614cceb7e47209db02800cb94d1cfdbb51`.
- `server/utils/helpers/updateENV.js` — fonction `dumpENV`, chemin `.env` ; SHA `b9227681f786f935323d7da9197e27e4a0e0cf9e`.
- `server/utils/middleware/validApiKey.js` — contrôle existence de clé ; SHA `a1f3274040d83b26fbd32e10bca1bf4d6fc67fdd`.
- `server/models/documents.js` — ordre ajout vecteur/association relationnelle ; SHA `27e28ea354af8a341b4a33e6806541ed4924b68e`.
- `server/utils/vectorDbProviders/lance/index.js` — insertion LanceDB et utilisation cache ; SHA `d0232e15dc90bb0effe99ade84622e5e16cbbfc2`.
- `server/utils/files/purgeDocument.js` — purge d’un document/dossier ; SHA `2ef74a914563bea76b54bca923d74e9aff2b13df`.
- `SECURITY.md` du tag `v1.17.0` — précise le caractère système et l’accès intégral des Developer API keys : https://github.com/Mintplex-Labs/anything-llm/blob/v1.17.0/SECURITY.md.

**Limite de l’audit :** code source examiné en lecture seule ; aucun test HTTP sur l’instance, aucune simulation de panne, aucune écriture sur le serveur, aucune modification GitHub, aucun changement de conteneur, aucune suppression ni import supplémentaire.
