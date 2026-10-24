# Correctifs ciblés — AnythingLLM 1.17.0

*Version 0.3 — 23 octobre 2026*  
*Statut : correctifs préparés et vérifiés statiquement — **non déployés, non testés en environnement HTTP**.*

**Conventions :**
- **Fait vérifié** : constat direct dans le code installé ou sur GitHub tag v1.17.0
- **Risque plausible** : déduction du code, non exploitée expérimentalement
- **Hypothèse** : à reproduire en instance isolée pour confirmation
- **Non testé** : comportement à valider en instance isolée avant déploiement

---

## Vérification obligatoire avant tout correctif

Avant de choisir ou déployer un correctif, effectuer une vérification **en lecture seule** du conteneur réellement en service :

1. ID de l'image et digest SHA : `docker inspect anythingllm --format '{{.Image}}'`
2. Version déclarée par l'application (interface ou `docker exec`)
3. Présence d'une limite dédiée à `/api/embed` dans `/app/server/index.js` (chercher `EMBED_BODY_LIMIT`)
4. Politique de redémarrage effective du conteneur
5. Liaisons de ports publiées : `docker port anythingllm`

**Justification :** le code audité correspond au tag `v1.17.0`, mais le conteneur utilise l'image `mintplexlabs/anythingllm:latest` (mutable). Le tag `v1.18.0` ne contient pas le correctif de limite `/api/embed` du commit upstream `c729bf480ab146063b6c9ef287182384b9b080e0` (14 octobre 2026). L'image réellement en service peut différer des deux.

Ne pas envoyer de corps HTTP de grande taille, modifier la configuration, ni redémarrer le conteneur pendant cette phase.

---

## Décision d'architecture (inchangée)

Ne pas traiter une clé API AnythingLLM générique comme une identité utilisateur. Le middleware `validApiKey` valide l'existence du secret, mais n'impose pas de propriétaire, de rôle ni de périmètre d'espaces — comportement intentionnel confirmé par SECURITY.md v1.17.0. Pour l'automatisation n8n, créer une autorisation distincte, limitée à l'import documentaire et à une liste explicite de slugs. Ne jamais donner à n8n une clé administrateur générale.

---

## P0 — Sécurité critique

### P0.1 — Routes `env-dump` sans authentification (ALLM-12) ⚠️

**⚠️ Statut révisé (23 octobre 2026) : décision de durcissement — comportement à valider**

Le statut a été revu à la suite d'un examen du dépôt upstream (analyse ChatGPT du 23 octobre 2026). La branche par défaut d'AnythingLLM contient un commentaire de code documentant explicitement `/v1/system/env-dump` comme volontairement non authentifié. La route est décrite comme un utilitaire de synchronisation de configuration pour les scripts de déploiement ou d'arrêt, sans entrée utilisateur et sans retour de secrets dans la réponse HTTP.

**Situation dans v1.17.0 (tag installé) — fait vérifié :**  
- La route n'a aucun middleware d'authentification (ligne 16 de `server/endpoints/api/system/index.js`)
- La route voisine `GET /v1/system` (ligne 37) porte `[validApiKey]`
- L'`openapi.json` de v1.17.0 documente une réponse 403 `InvalidAPIKey` pour cette route — ce qui suggère qu'une authentification était attendue, en contradiction avec le commentaire de la branche par défaut

**Ambiguïté à résoudre :** le commentaire déclarant la route comme "volontairement non authentifiée" est absent de v1.17.0 ; il appartient à la branche par défaut (postérieure à v1.18.0). L'`openapi.json` de v1.17.0, en documentant un 403, constitue un indice que l'authentification était peut-être prévue mais non implémentée. La décision finale appartient à Florian.

**Ce que fait `dumpENV()` — fait vérifié :**  
- Lit `process.env` pour les clés de configuration (`SIG_KEY`, `SIG_SALT`, `JWT_EXPIRY`, `STORAGE_DIR`, `SERVER_PORT`, `WORKSPACE_DELETION_PROTECTION`, toutes les clés de `KEY_MAPPING`)
- Applique `sanitizeValue()` — tronque les valeurs contenant `'`, `"`, `#`, `\n`, `\r`, `\t`
- Écrase `/app/server/.env` dans le conteneur via `fs.writeFileSync(..., { flag: "w" })`
- **Ne retourne aucun secret dans la réponse HTTP** — réponse uniquement `HTTP 200`
- En production (`NODE_ENV=production`) : exécuté. Hors production : handler retourne 200 sans appeler `dumpENV()`

**⚠️ PRÉVENTION : ne pas appeler ces routes sur la production ni tester sur des données réelles.**

#### Patch préparé — référence source v1.17.0

- Commit de référence : `fa7ec877f005a21ede94888b3b8618b700343857` (tag `v1.17.0`)
- SHA-256 du patch : `b27d886c07d890616ef12d072d0848195214457dc07836ba34417a2940ca1a7e`
- Vérifié : application sur une archive propre du tag officiel avec `--whitespace=error`
- Vérifié : `node --check` passe sur les deux fichiers modifiés
- **Statut : préparé et vérifié statiquement — non déployé, aucun test HTTP fonctionnel effectué**

**Modifications du patch :**

*Fichier 1 — `server/endpoints/system.js` (route `/env-dump`) :*  
Middleware ajouté : `[validatedRequest, flexUserRoleValid([ROLES.admin])]`

Les deux middlewares sont importés dans ce fichier aux lignes 30 et 49-53. Comportement en production avec `MULTI_USER_MODE=true` :
- `validatedRequest` exige un JWT de session valide et un utilisateur actif non suspendu
- `flexUserRoleValid([ROLES.admin])` exige le rôle administrateur
- En mode mono-utilisateur (`MULTI_USER_MODE=false`) : `flexUserRoleValid` bypasse la vérification de rôle (ligne 72 de `multiUserProtected.js`) ; seule la vérification JWT de `validatedRequest` s'applique

*Fichier 2 — `server/endpoints/api/system/index.js` (route `/v1/system/env-dump`) :*  
Middleware ajouté : `[validApiKey]`

`validApiKey` est déjà importé à la ligne 11 de ce fichier. Le patch est cohérent avec le motif de la route `/v1/system` (ligne 37).

#### Point de compatibilité bare-metal (non bloquant pour cette installation)

Le script de mise à jour documenté dans `BARE_METAL.md` appelle `GET /api/env-dump` sans en-tête d'authentification. Après application du patch, cet appel recevra HTTP 401 en mode multi-utilisateur. **Cette installation étant Docker avec `MULTI_USER_MODE=true`, le script bare-metal n'est pas utilisé — ce point ne constitue pas un blocage.** À documenter pour toute installation bare-metal.

#### Décision requise (D1)

| Option | Description | Conditions préalables |
|--------|-------------|----------------------|
| A — Appliquer le patch | Alignement sur les autres routes ; protège l'écriture `.env` | Tests TEST-01 à TEST-05 en instance isolée ; confirmer `NODE_ENV=production` |
| B — Désactiver la route | `return response.sendStatus(404)` en début de handler | Confirmer qu'aucun script interne n'appelle la route |
| C — Risque accepté | Documenter explicitement ; Tailscale comme unique contrôle | Confirmer qu'aucun script dépendant n'appelle la route sans auth |

**Avant toute décision :** vérifier si des scripts opérationnels internes appelent ces routes sans authentification.

---

### P0.2 — Import n8n limité aux espaces autorisés (ALLM-13)

*Statut : spécification — non implémentée.*

Fichiers concernés :
- `server/utils/middleware/validApiKey.js` (ne pas modifier le comportement global sans audit de toutes les routes)
- `server/endpoints/api/document/index.js` (routes `POST /v1/document/upload` et `POST /v1/document/upload/:folderName`)
- Nouveau middleware proposé : `server/utils/middleware/validDocumentImportKey.js`

Comportement attendu :
1. Authentifier la clé dédiée à l'import depuis une variable d'environnement dédiée, distincte des clés API générales
2. Exiger une liste de slugs autorisés, configurée côté serveur
3. Refuser par défaut si la clé dédiée ou la liste des espaces n'est pas configurée
4. Si `addToWorkspaces` est fourni, vérifier que chaque slug demandé appartient à la liste autorisée avant que le collector ne traite le fichier
5. Refuser les slugs inconnus et les espaces non autorisés avec HTTP 403/422 ; ne pas les ignorer silencieusement
6. Ne pas accepter la clé d'import sur les routes d'administration, de suppression ou de lecture générale
7. Ne jamais journaliser la clé ou la valeur `Authorization`

**Point à trancher :** la route d'import doit-elle obligatoirement recevoir `addToWorkspaces`, ou accepter l'upload sans indexation ? Recommandation : exiger au moins un espace autorisé pour éviter des fichiers importés mais non indexés.

---

### P0.3 — Routes workspace et documents sans contrôle d'appartenance (ALLM-04 / ALLM-09)

*Statut : risque documenté — correction dépend de l'option architecturale choisie (voir section P3).*

**Fait vérifié :** les routes API workspace (`GET /v1/workspaces`, `GET /v1/workspace/:slug`, `POST /v1/workspace/:slug/vector-search`, etc.) et document n'utilisent pas les méthodes `Workspace.getWithUser` / `whereWithUser` présentes pour l'interface web. Une clé API a accès à tous les workspaces, tous les documents et le texte brut des chunks via `source.text`.

**Comportement intentionnel confirmé** par SECURITY.md v1.17.0 : les Developer API keys accordent un accès administrateur complet par conception.

---

### P0.4 — Protection de suppression de workspace inactive (ALLM-10)

*Statut : action immédiate possible sans correctif logiciel.*

**Fait vérifié :** la variable `WORKSPACE_DELETION_PROTECTION` est absente de `anythingllm.env`. Le middleware ne bloque `DELETE /v1/workspace/:slug` que si cette variable est présente dans `process.env`.

**Action requise :** ajouter `WORKSPACE_DELETION_PROTECTION=1` dans `anythingllm.env` au prochain redémarrage planifié.

**Test de validation :**
```
DELETE /api/v1/workspace/:slug → HTTP 403
{"success": false, "error": "Workspace deletion is blocked by the system administrator."}
```

---

### P0.5 — Corps HTTP jusqu'à 3 Go avant authentification sur certains chemins (DOS-02)

*Statut : défaut confirmé dans le code v1.17.0 — crash non reproduit sur l'instance de Florian.*

**Fait vérifié** dans `server/index.js` du tag v1.17.0 : les parseurs globaux `bodyParser.text`, `bodyParser.json` et `bodyParser.urlencoded` utilisent `FILE_LIMIT = "3GB"`. Ces parseurs sont montés avant le routeur API et donc avant les contrôles d'authentification de nombreuses routes.

La route publique d'intégration `GET /api/embed/:embedId/stream-chat` (définie dans `server/endpoints/embed/index.js`) est particulièrement exposée : la validation de configuration et les contrôles de quota arrivent **après** le parsing du corps HTTP.

**Correctif upstream disponible :**  
Commit `c729bf480ab146063b6c9ef287182384b9b080e0` (14 octobre 2026, branche par défaut) — limite dédiée de 1 Mo sur `/api/embed` et gestionnaire d'erreur `RangeError`. **Ce correctif n'est présent ni dans v1.17.0 ni dans v1.18.0.**

**Nuances importantes :**
- Le correctif upstream ne supprime pas la limite globale de 3 Go pour les autres chemins
- Le risque sur les autres routes est une inférence basée sur l'ordre des middlewares — non reproduit en crash
- L'image en service (`latest`) peut différer de `v1.17.0` — vérifier avant toute décision (voir section « Vérification obligatoire »)
- Ne pas envoyer de corps de plusieurs centaines de mégaoctets au serveur de production

**Actions requises :**
1. Vérifier si l'image en production contient déjà la limite dédiée `/api/embed` (chercher `EMBED_BODY_LIMIT` dans `/app/server/index.js`)
2. Si absente, étudier un backport du correctif upstream
3. Définir une politique de limites globales et par route sans casser les pièces jointes base64
4. En instance isolée : vérifier qu'un corps > 1 Mo sur `/api/embed` retourne HTTP 413 et que le processus reste vivant

---

## P1 — Fiabilité de l'import et gestion des fichiers

### P1.1 — Ne jamais déclarer un import réussi si l'indexation a échoué (ALLM-14 partie 1)

*Statut : spécification — non implémentée.*

**Fait vérifié :** dans `server/endpoints/api/document/index.js`, les routes d'upload appellent `Document.api.uploadToWorkspace(...)` sans exploiter son résultat, puis renvoient `success: true`. Dans `server/models/documents.js`, `uploadToWorkspace` renvoie `true` en cas de réussite mais plusieurs chemins d'erreur renvoient `undefined` (valeur de `console.log`) au lieu de `false`.

Correctif proposé :
- Standardiser la valeur de retour en résultat structuré `{ success, workspace, error }` ou booléen strict
- Propager les erreurs d'indexation aux routes
- Utiliser un statut HTTP non-2xx si un espace demandé n'a pas été indexé
- Distinguer conversion réussie et indexation réussie dans la réponse
- Ne pas supprimer automatiquement le fichier source en cas d'échec — prévoir une procédure de reprise explicite

### P1.2 — Éviter les vecteurs orphelins lors d'un échec de persistance (ALLM-14 partie 2)

*Statut : spécification — non implémentée.*

**Fait vérifié :** dans `Document.addDocuments`, l'insertion des vecteurs dans LanceDB précède la création de l'enregistrement SQL `workspace_documents`. En cas d'échec SQL, le code journalise et émet `doc_failed` sans effectuer de suppression compensatoire des vecteurs déjà insérés. `Document.removeDocuments` se fonde sur les enregistrements `DocumentVectors` — en l'absence de l'association SQL, le nettoyage d'un vecteur orphelin est difficile.

Correctif proposé :
1. Traiter l'insertion des vecteurs et la création des associations comme une séquence avec compensation
2. Si la création SQL échoue après insertion, tenter la suppression des vecteurs du `docId` concerné
3. Enregistrer l'échec dans `failedToEmbed` et dans les logs
4. Si la compensation échoue, signaler explicitement un état de réparation nécessaire

**Limite architecturale :** une transaction Prisma ne peut pas couvrir une insertion LanceDB externe. La compensation n'est pas atomique — elle doit être testée.

### P1.3 — `move-files` peut accepter un répertoire comme source ou écraser une destination existante (INT-17 / INT-18)

*Statut : défaut confirmé par lecture du code — comportement `fs.rename` testé hors production.*

**Fichiers concernés :**
- `server/endpoints/api/document/index.js`, route `POST /v1/document/move-files`
- `server/endpoints/document.js`, route web `/document/move-files`

**INT-17 — Source répertoire :** les routes vérifient que les chemins se trouvent dans le répertoire autorisé, mais ne vérifient pas explicitement que la source est un fichier régulier avec `lstat(...).isFile()`. Un répertoire passé comme source peut être renommé entièrement, laissant les chemins en base, les caches et l'index vectoriel incohérents.

**INT-18 — Écrasement de destination :** les routes ne vérifient pas si la destination existe déjà ou correspond à un document indexé. Si une source non indexée est déplacée vers le chemin d'un fichier existant et indexé, le contenu physique peut être remplacé sans synchroniser les enregistrements SQL, les caches et les vecteurs. Le code examiné sur la branche par défaut et dans v1.18.0 ne contient pas ce contrôle.

**Correctif proposé :**
- Rejeter les sources qui ne sont pas des fichiers réguliers (`lstat(...).isFile()`)
- Définir une politique explicite pour les liens symboliques
- Refuser explicitement toute destination déjà existante (une vérification `exists()` + `rename()` n'est pas atomique : prévoir une stratégie "no replace" robuste)
- Valider la source et la destination avant le déplacement
- Ajouter des tests qui vérifient la cohérence du système de fichiers, de la base et des vecteurs

### P1.4 — Déplacements en lot non atomiques (INT-19)

*Statut : défaut confirmé par lecture du code.*

**Fait vérifié :** le traitement de plusieurs déplacements utilise des opérations `fs.rename` lancées en parallèle avec `Promise.all`. Si une opération échoue, les déplacements déjà réussis ne sont pas annulés. Certaines opérations peuvent se terminer après le rejet de `Promise.all`. La réponse d'erreur ne décrit pas l'état de chaque fichier individuellement.

**Correctif proposé :**
- Prévalider toutes les entrées avant le premier déplacement
- Choisir une sémantique explicite : rollback documenté ou résultat individuel par fichier
- En cas de résultat partiel, retourner clairement les opérations réussies et échouées

### P1.5 — `remove-folder` peut annoncer un succès sans supprimer (INT-20)

*Statut : défaut confirmé par lecture du code.*

**Fait vérifié :** la route API `DELETE /v1/document/remove-folder` appelle `purgeFolder(name)` puis répond avec succès si aucune exception n'est remontée. Or `purgeFolder()` peut retourner silencieusement dans plusieurs cas : nom non autorisé, dossier inexistant, chemin imbriqué non pris en charge, dossier protégé `custom-documents`. La route web `/system/remove-folder` présente une sémantique similaire.

**Correctif proposé :** faire retourner à `purgeFolder()` un résultat explicite (supprimé / absent / protégé / chemin invalide / erreur). La route doit ensuite traduire le résultat en codes HTTP cohérents. Ajouter des tests de contrat pour chaque situation.

### P1.6 — Fichiers temporaires conservés après un échec d'upload (UPLOAD-02)

*Statut : défaut confirmé par lecture du code — aucun scénario de production exécuté.*

**Fait vérifié :** dans la route `/v1/document/upload`, l'ordre des middlewares est `[validApiKey, handleAPIFileUpload, validateWorkspaceSlugQuery]`. Multer écrit le fichier dans `collector/hotdir` **avant** que `validateWorkspaceSlugQuery` vérifie `addToWorkspaces`. Si la validation retourne 422 (ex. : champ multipart répété produisant un tableau au lieu d'une chaîne), le fichier temporaire peut rester sur disque. Un Collector hors ligne après l'écriture peut également laisser un fichier sans nettoyage. `wipeCollectorStorage()` au démarrage du Collector peut nettoyer ces restes, mais ils occupent de l'espace entre-temps.

**Note :** le contrôle par clé API intervient avant l'upload — ne pas classer ce problème comme un contournement d'authentification.

**Correctif proposé :**
- Vérifier que tous les chemins d'échec après l'écriture du fichier nettoient le fichier temporaire
- Prévoir un nettoyage centralisé, idempotent, exécuté dans un `finally` si cela correspond au cycle de vie réel
- Tester au minimum une erreur 422 et une indisponibilité du Collector
- Vérifier que les fichiers légitimes en cours de traitement ne sont pas supprimés prématurément

---

## P2 — Cohérence des données

### P2.1 — Politique de réimport et cache vectoriel indexé sur le chemin (ALLM-15)

*Statut : spécification — non implémentée.*

**Fait vérifié :** la clé de cache vectoriel est `uuidv5(filename, uuidv5.URL)` — dérivée du chemin, pas du contenu. Si un document est modifié à chemin identique, le flux peut réutiliser des chunks périmés. D'autres flux créent des chemins internes à UUID, pouvant générer des doublons au lieu de remplacer.

Avant d'implémenter un remplacement :
- Définir une identité stable du document source (chemin NAS normalisé + empreinte du contenu)
- Déterminer la politique : « remplacer », « conserver les versions » ou « refuser les doublons »
- Remplacer uniquement dans les espaces explicitement autorisés
- Retirer les anciens vecteurs uniquement après identification des associations correspondantes

Recommandation pour le premier déploiement : ne pas activer le remplacement automatique.

### P2.2 — Purge de dossier récursive mais purge d'index non récursive (ALLM-16 — complété)

*Statut : spécification — non implémentée.*

**Fait vérifié :** dans `server/utils/files/purgeDocument.js`, `purgeFolder` :
1. Liste le contenu de **premier niveau** du dossier
2. Purge cache et associations pour ces entrées (non récursif)
3. Appelle `fs.rmSync(subFolderPath, { recursive: true })` — suppression physique récursive

**Complément (23 octobre 2026) — comportements connexes :**
- `create-folder` accepte des chemins imbriqués et utilise la création récursive de répertoires
- `move-files` accepte également des chemins imbriqués
- `Document.addDocuments()` et `fileData()` peuvent lire des chemins sous le répertoire de documents
- `moveProcessedDocsToFolder()` rejette les séparateurs de dossiers imbriqués, mais ce contrôle ne bloque pas les autres routes
- `Document.removeDocuments()` peut intercepter certaines erreurs SQL, les journaliser, puis retourner un succès tandis que la suppression physique continue
- `purgeVectorCache(filename)` est asynchrone sans gestion complète des rejets dans le chemin examiné

Un document indexé sous `parent/sous-dossier/fichier.json` peut être supprimé physiquement lors de la purge de `parent`, sans que le nettoyage des chemins exacts, associations SQL, cache et vecteurs des documents imbriqués soit garanti.

**Correctif proposé :** parcours récursif dans la phase de purge des index avant suppression physique ; tester les échecs de purge du cache pour éviter des promesses pendantes ou des rejets non gérés ; ne pas utiliser `purgeFolder` pour du nettoyage automatisé avant correction et validation.

### P2.3 — Collision possible entre uploads simultanés de même nom (RACE-01) ⚠️

*Statut : **hypothèse à reproduire** — pas un défaut démontré de bout en bout.*

**Dans les fichiers examinés :**
- `server/utils/files/multer.js` utilise le nom de fichier d'origine assaini comme nom temporaire dans `collector/hotdir`, sans suffixe unique visible dans le chemin concerné
- `CollectorApi.processDocument(filename)` transmet le nom seul au Collector
- Le chemin vers `processSingleFile(...)` ne révèle pas de verrou par nom dans les portions examinées

Deux uploads concurrents de contenu différent portant le même nom pourraient se télescoper. À maintenir au statut d'hypothèse jusqu'à reproduction.

**Test requis :** dans une instance isolée, envoyer simultanément deux fichiers de même nom, avec des contenus distinctifs. Vérifier que chaque traitement indexe bien le contenu qui lui correspond.

**Correction possible :** utiliser un nom temporaire unique (UUID) et conserver séparément le nom d'affichage original. Ne pas modifier le code avant d'avoir validé le scénario.

---

## P3 — Architecture : Option A vs Option B

### Option A — Passerelle dédiée (sans modification du code AnythingLLM)

| Aspect | Description |
|--------|-------------|
| Périmètre | Seule la passerelle détient une clé API générale ; n8n n'y a pas accès |
| Workspace allowlist | Hardcodée dans la passerelle, jamais fournie par l'appelant |
| Opérations autorisées | Upload uniquement (pas de suppression, pas d'administration) |
| Journalisation | Chaque opération : workspace cible, fichier, résultat, timestamp |
| Déploiement | Nouveau service Docker ou workflow n8n dédié |
| Impact sur AnythingLLM | Aucune modification du code source — pas de risque de régression |
| Limitation | Ne résout pas la portée des clés à l'intérieur d'AnythingLLM |

**Recommandation pour le premier déploiement :** Option A.

### Option B — Modification du code AnythingLLM (portée par clé)

| Aspect | Description |
|--------|-------------|
| Modifications requises | `validApiKey.js`, schéma `ApiKey`, routes d'upload et potentiellement toutes les routes API |
| Portée | Résout la limitation architecturale à la source |
| Risque | Modification profonde d'un middleware central — impact sur toutes les routes |
| Maintenance | À reporter à chaque mise à jour d'AnythingLLM |
| Alignement officiel | Demande de fonctionnalité documentée dans SECURITY.md |

### Tableau comparatif

| Critère | Option A (passerelle) | Option B (code) |
|---------|----------------------|-----------------|
| Temps de mise en œuvre | Semaines | Mois |
| Risque de régression | Faible | Élevé |
| Protection en profondeur | Partielle (chemin n8n seulement) | Complète |
| Maintenance sur mises à jour | Aucune | À chaque version |

---

## Matrice de tests — 21 tests obligatoires en instance isolée

⚠️ **Aucun de ces tests ne doit être exécuté sur la production. `dumpENV()` écrit dans `/app/server/.env` — cet effet doit être observé uniquement dans un conteneur de test isolé. Pour les tests INT-17 à INT-19, utiliser des fichiers et dossiers factices dans une instance de test isolée.**

| ID | Catégorie | Scénario | Résultat attendu | Exécuté |
|----|-----------|----------|-----------------|---------|
| TEST-01 | SEC | `GET /api/v1/system/env-dump` sans bearer | HTTP 403 ; aucun `.env` écrit/modifié | À EXÉCUTER |
| TEST-02 | SEC | `GET /api/env-dump` sans token de session | HTTP 401 ; aucun `.env` écrit/modifié | À EXÉCUTER |
| TEST-03 | SEC | `GET /api/env-dump` + JWT admin valide, `NODE_ENV=production` | HTTP 200 ; `.env` réécrit dans le conteneur isolé | À EXÉCUTER |
| TEST-04 | SEC | `GET /api/v1/system/env-dump` + clé API valide, `NODE_ENV=production` | HTTP 200 ; `.env` réécrit dans le conteneur isolé | À EXÉCUTER |
| TEST-05 | SEC | `GET /api/env-dump` + JWT utilisateur standard (non admin), `MULTI_USER_MODE=true` | HTTP 401 (flexUserRoleValid) | À EXÉCUTER |
| TEST-06 | SEC | Clé Developer API invalide sur routes protégées | HTTP 403 ; aucun effet secondaire | À EXÉCUTER |
| TEST-07 | SEC | Passerelle n8n vers workspace allowlisté | Opération autorisée et vérifiable | À EXÉCUTER |
| TEST-08 | SEC | Passerelle n8n vers workspace non autorisé | Refus avant tout traitement du fichier | À EXÉCUTER |
| TEST-09 | SEC | Clé d'import sur route admin ou route de suppression | HTTP 403/401 ; refus | À EXÉCUTER |
| TEST-10 | RAG | Import d'un nouveau fichier | Succès vérifié dans source, SQL, mapping vectoriel et vecteurs LanceDB | À EXÉCUTER |
| TEST-11 | RAG | Même fichier importé deux fois | Comportement idempotent ; pas de double association ni de vecteur dupliqué | À EXÉCUTER |
| TEST-12 | RAG | Fichier modifié au même chemin | Chunks conformes au nouveau contenu ; aucun cache périmé réutilisé | À EXÉCUTER |
| TEST-13 | RAG | Échec SQL après insertion LanceDB | Compensation tentée ou état de réparation signalé explicitement | À EXÉCUTER |
| TEST-14 | RAG | Dossier avec sous-dossiers purgé | Aucun index, cache ni association abandonnés dans les sous-dossiers | À EXÉCUTER |
| TEST-15 | OPS | État des volumes et sauvegarde | Sauvegarde produite ; restauration d'essai vérifiée dans un environnement isolé | À EXÉCUTER |
| TEST-16 | DOS | Vérifier limite `/api/embed` dans l'image en service | `EMBED_BODY_LIMIT` présent et actif, ou absence documentée | À EXÉCUTER |
| TEST-17 | INT | `move-files` avec répertoire comme source | HTTP 4xx ; aucun renommage de dossier | À EXÉCUTER |
| TEST-18 | INT | `move-files` vers une destination déjà indexée | HTTP 4xx ou refus explicite ; destination, métadonnées SQL et vecteurs inchangés | À EXÉCUTER |
| TEST-19 | INT | Lot `move-files` avec un élément invalide au milieu | État final (disque, base, vecteurs) clairement décrit ; opérations partielles documentées | À EXÉCUTER |
| TEST-20 | INT | `remove-folder` sur dossier inexistant | HTTP 4xx ou corps indiquant absence ; pas de succès silencieux | À EXÉCUTER |
| TEST-21 | RACE | Upload simultané de deux fichiers de même nom, contenus différents | Chaque traitement indexe le contenu qui lui correspond (hypothèse à confirmer) | À EXÉCUTER |

---

## Conditions de validation avant déploiement

- Vérification de l'image en service (voir section « Vérification obligatoire ») avant tout déploiement
- Tests TEST-01 à TEST-09 réussis sur une branche ou instance isolée
- Tests TEST-10 à TEST-21 réussis sur une instance isolée avec données factices
- Sauvegarde du volume `anythingllm` et de `anythingllm.env` avant toute opération
- Vérification indépendante du patch après fourniture du diff et des résultats de tests
- Aucun import n8n réel avant validation de l'autorisation, des erreurs et de l'intégrité des vecteurs

### Rollback (patch ALLM-12 uniquement)

En cas de problème après déploiement :
1. Arrêter le conteneur : `docker stop anythingllm`
2. Restaurer `server/endpoints/api/system/index.js` depuis la sauvegarde
3. Restaurer `server/endpoints/system.js` depuis la sauvegarde
4. Redémarrer : `docker start anythingllm`
5. Vérifier les logs : `docker logs anythingllm --tail 50`

---

## Décisions en attente pour Florian

| # | Décision | Options | Urgence |
|---|----------|---------|---------|
| D1 | Action sur route `env-dump` (ALLM-12) | Patch / Désactiver / Risque accepté avec Tailscale | 🔴 Après vérification image et scripts dépendants |
| D2 | Architecture n8n | Option A (passerelle) / Option B (code) | 🟡 Avant déploiement n8n |
| D3 | Vérifier usage clé `Import-Corpus-IA` | Consulter logs Docker et Open WebUI sans afficher la valeur | 🔴 Avant révocation éventuelle |
| D4 | Activer `WORKSPACE_DELETION_PROTECTION=1` | Ajouter dans `anythingllm.env` au prochain redémarrage | 🔴 Immédiat |
| D5 | Correctif DOS-02 (`/api/embed` body limit) | Vérifier image actuelle, backport si absent | 🟡 Après vérification image |
| D6 | Correctifs INT-17 à INT-20, UPLOAD-02 | À planifier après validation en instance isolée | 🟡 Avant usage automatisé des routes concernées |

---

## Sources de code examinées

Version de référence : `v1.17.0` du dépôt public `Mintplex-Labs/anything-llm`  
Commit de référence : `fa7ec877f005a21ede94888b3b8618b700343857`

- `server/endpoints/api/system/index.js` — route `/v1/system/env-dump` sans `[validApiKey]` (ligne 16 confirmée)
- `server/endpoints/system.js` — route `/env-dump` sans middleware (ligne 92 confirmée)
- `server/utils/middleware/validApiKey.js` — vérifie l'existence du secret Bearer (29 lignes, intégralité)
- `server/utils/middleware/validatedRequest.js` — authentification session JWT (116 lignes, intégralité)
- `server/utils/middleware/multiUserProtected.js` — `flexUserRoleValid`, comportement en mode mono/multi (108 lignes, intégralité)
- `server/utils/helpers/updateENV.js` — fonction `dumpENV()`, écriture `.env` sans retour de secret
- `server/endpoints/api/document/index.js` — routes d'import, `move-files`, `remove-folder`, propagation du résultat
- `server/endpoints/document.js` — routes web `move-files`, `remove-folder`
- `server/models/documents.js` — insertion des vecteurs, association SQL, retour `uploadToWorkspace`
- `server/utils/vectorDbProviders/lance/index.js` — cache et insertion/suppression des vecteurs
- `server/utils/files/purgeDocument.js` — `purgeFolder` : parcours non récursif des index
- `server/utils/files/multer.js` — nom de fichier temporaire dans `hotdir`
- `server/index.js` — parseurs globaux `bodyParser` avec `FILE_LIMIT = "3GB"`
- `server/endpoints/embed/index.js` — route publique `/api/embed/:embedId/stream-chat`
- `SECURITY.md` (tag v1.17.0) — politique officielle des Developer API keys
- `BARE_METAL.md` — script de mise à jour appelant `/api/env-dump` sans authentification
- Commit upstream `c729bf480ab146063b6c9ef287182384b9b080e0` — correctif limite `/api/embed` (14 octobre 2026, branche par défaut)

---

*Ce document est une spécification de correctifs et une revue technique. Il ne constitue pas un patch exécutable ni une preuve que les problèmes ont été corrigés.*  
*Version 0.1 : 2026-10-20 — Florian avec Claude*  
*Version 0.2 : 2026-10-23 — Intégration revue ALLM-12 (patch préparé, SHA-256 documenté, revue des deux middlewares, note bare-metal, 15 tests) ; ajout P3 (Option A vs Option B) ; restructuration P0 (P0.1 à P0.4) ; décisions en attente.*  
*Version 0.3 : 2026-10-23 — Intégration dossier ChatGPT oct 2026 : reclassification ALLM-12 (décision de durcissement vs P0 confirmé, conflit openapi.json / branche par défaut documenté) ; vérification image obligatoire avant tout correctif ; ajout P0.5 (DOS-02), P1.3 (INT-17/18), P1.4 (INT-19), P1.5 (INT-20), P1.6 (UPLOAD-02), P2.3 (RACE-01 hypothèse) ; complément P2.2 (ALLM-16 purge imbriquée) ; matrice étendue de 15 à 21 tests ; décisions D5 et D6 ajoutées.*
