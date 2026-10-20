# Journal des Incidents — Serveur IA Mac mini + Synology

*Version 0.4 — 20 octobre 2026*

Format de chaque entrée :
- **Symptôme** : ce qui a été observé
- **Cause vérifiée** (ou hypothèse si non démontrée)
- **Solution validée**
- **Test de validation**
- **Précautions pour la prochaine fois**

---

## SMB-01 — mount_smbfs -N échoue avec "Authentication error"

**Date :** octobre 2026  
**Statut :** ✅ Résolu

**Symptôme :**  
`mount_smbfs -N //Florian@192.168.1.103/Corpus-IA ~/NAS-Test` renvoie systématiquement "Authentication error" même avec un fichier `~/.nsmbrc` correctement configuré et un fichier `~/Library/Preferences/nsmb.conf` présent.

**Cause vérifiée :**  
L'option `-N` (no password prompt) est documentée comme utilisant le Trousseau macOS ou `.nsmbrc`, mais elle est cassée sur les versions modernes de macOS — le comportement a été observé directement, la cause interne dans la pile SMB d'Apple n'est pas documentée publiquement.

**Solution validée :**  
Lire le mot de passe depuis `~/.nsmbrc` via `awk` dans le script et le passer inline à `mount_smbfs` :
```bash
PASS=$(awk -F= '/^\[192\.168\.1\.103:[Ff]lorian\]/{f=1} f && /^password=/{print $2; exit}' ~/.nsmbrc)
mount_smbfs "//${NAS_USER}:${PASS}@${NAS_HOST}/${NAS_SHARE}" "$MP"
```

**Test de validation :**  
`sudo umount ~/IA/Corpus-IA && ~/bin/ensure-nas-mount.sh` → share remonté, log `monté : /Users/florian/IA/Corpus-IA` ✅

**Précautions :**  
- `~/.nsmbrc` contient le mot de passe en clair — permissions 600 obligatoires, ne jamais afficher son contenu dans une conversation ou un log
- Ne jamais tenter `mount_smbfs -N` — l'échec est silencieux et peut masquer un problème de script

---

## SMB-02 — LaunchAgent avec osascript bloqué indéfiniment

**Date :** octobre 2026  
**Statut :** ✅ Résolu

**Symptôme :**  
LaunchAgent utilisant `osascript` pour demander à Finder de monter le partage SMB : jamais de sortie, `last exit code` affiché `(never exited)` dans `launchctl`. Tentative `launchctl asuser` : "Could not switch to audit session: Operation not permitted".

**Cause vérifiée :**  
`osascript` nécessite une session graphique (GUI audit session). Depuis SSH, et même depuis un LaunchAgent au démarrage avant login graphique, cette session n'existe pas. Finder ne peut pas être contrôlé dans ces conditions.

**Solution validée :**  
Remplacer entièrement l'approche `osascript`/Finder par un script shell utilisant directement `mount_smbfs` (voir SMB-01). LaunchAgent appelle `~/bin/ensure-nas-mount.sh` toutes les 120 secondes.

**Test de validation :**  
`launchctl kickstart -k "gui/$(id -u)/com.florian.mount-corpus-ia"` après `sudo umount` → share remonté en moins de 3 secondes ✅

**Précautions :**  
- Ne jamais utiliser `osascript`, Finder, ni aucune app GUI depuis un LaunchAgent sur une machine sans écran connecté ou sans session graphique active
- Ne pas créer un second LaunchAgent avant d'avoir compris et corrigé le premier

---

## SMB-03 — NFS : "Operation not permitted"

**Date :** octobre 2026  
**Statut :** 🗄️ Abandonné — ne pas rouvrir

**Symptôme :**  
Tentative de montage NFS depuis le Mac mini vers le Synology : "Operation not permitted" avec et sans sudo.

**Cause vérifiée :**  
NFS n'était pas activé dans DSM.

**Solution :**  
Piste abandonnée au profit de SMB, qui fonctionne. NFS ajouterait de la complexité sans avantage démontré pour cet usage.

**Précautions :**  
**Ne pas rouvrir cette piste sans raison technique nouvelle et documentée.** SMB 3.1.1 signé fonctionne correctement sur la liaison 10GbE directe.

---

## SMB-04 — Trousseau macOS inaccessible en écriture depuis SSH

**Date :** octobre 2026  
**Statut :** 🗄️ Contourné — ne pas retenter

**Symptôme :**  
`security add-internet-password -w` depuis SSH : invite de saisie du mot de passe invisible → mot de passe vide enregistré. Ou : retour immédiat "User interaction is not allowed."

**Cause vérifiée :**  
macOS bloque toute écriture dans le Trousseau nécessitant une interaction utilisateur depuis une session SSH (pas de session graphique).

**Solution :**  
Utiliser `~/.nsmbrc` à la place du Trousseau. Ne pas tenter de configurer le Trousseau depuis SSH.

**Précautions :**  
Si le Mac mini est un jour connecté à un écran, une entrée Trousseau pourrait être créée pour remplacer `.nsmbrc`. Mais `.nsmbrc` avec permissions 600 est fonctionnel et suffisant.

---

## OWUI-01 — WEBUI_SECRET_KEY perdue lors de la recréation du conteneur

**Date :** 9 octobre 2026  
**Statut :** ✅ Résolu (préventivement)

**Symptôme :**  
Avant résolution : risque de perte de la clé de session Open WebUI lors de la recréation du conteneur, entraînant l'invalidation de toutes les sessions actives.

**Cause vérifiée :**  
La `WEBUI_SECRET_KEY` était générée par le script de démarrage d'Open WebUI dans `/app/backend/.webui_secret_key`, dans le système de fichiers du conteneur — **pas dans le volume persistant**. Elle serait donc perdue à chaque recréation du conteneur.

**Solution validée :**  
Avant recréation, extraction de la clé depuis le conteneur existant (sans l'afficher dans le terminal) et ajout dans `~/.config/open-webui/recreate.env` (permissions 600). Le nouveau conteneur repart avec la même clé.

**Test de validation :**  
Nouveau conteneur actif et signalé "healthy". Connexions existantes préservées ✅

**Précautions :**  
- Toujours extraire `WEBUI_SECRET_KEY` avant de recréer un conteneur Open WebUI
- Ne jamais afficher ni copier `WEBUI_SECRET_KEY` dans une conversation ou un log
- `recreate.env` doit rester en permissions 600

---

## OWUI-02 — PDF scanné échoue à l'indexation (contenu vide)

**Date :** 10-11 octobre 2026  
**Statut :** ✅ Résolu

**Symptôme :**  
`07_fiche_controle_extincteur_scan_FR.pdf` — statut "failed" dans Open WebUI après tentative d'indexation. Le document est un PDF scanné (image), sans couche texte.

**Cause vérifiée :**  
Open WebUI extrait le texte des PDF pour l'indexation. Un PDF purement scanné ne contient pas de texte extractible — la tentative d'indexation retourne un contenu vide.

**Solution validée :**  
Générer un PDF avec couche OCR via `ocrmypdf` :
```bash
ocrmypdf -l fra --skip-text 07_fiche_controle_extincteur_scan_FR.pdf 07_fiche_controle_extincteur_scan_FR_OCR.pdf
```
Résultat : `~/ocr-work/07_fiche_controle_extincteur_scan_FR_OCR.pdf` (336 265 octets) ✅

**Test de validation :**  
🔲 À confirmer : vérifier que le document OCR est bien présent dans la base "Corpus-AI-test" et que Mistral répond correctement à "Quand a lieu le prochain contrôle de l'extincteur ?" (réponse attendue : 9 janvier 2027, numéro 7731-KP).

**Précautions :**  
- Tout PDF scanné devra passer par OCR avant indexation
- `--skip-text` évite de retraiter les pages qui ont déjà une couche texte
- Les outils OCR sont installés globalement sur macOS, pas dans Docker — `ocrmypdf` n'est pas disponible à l'intérieur des conteneurs

---

## OWUI-03 — gemma3:12b incompatible avec le tool calling

**Date :** octobre 2026  
**Statut :** ✅ Documenté (comportement attendu)

**Symptôme :**  
Message d'erreur dans Open WebUI lors de l'utilisation de `gemma3:12b` pour des tâches nécessitant des outils (tool calling).

**Cause vérifiée :**  
`gemma3:12b` ne supporte pas le tool calling dans la version Ollama / Open WebUI testée.

**Solution :**  
Utiliser `mistral:latest` pour toute tâche nécessitant des outils. Réserver `gemma3:12b` aux conversations sans outils.

**Précautions :**  
Ne pas confondre cette erreur avec un échec d'indexation — les documents peuvent être correctement indexés même si le modèle échoue sur le tool calling.

---

## OWUI-04 — Clé API Open WebUI exposée

**Date :** 11 octobre 2026  
**Statut :** 🔲 À confirmer révoqué

**Symptôme :**  
Une clé API Open WebUI a été utilisée pour importer le PDF OCR (bloc 4 de la session du 11 octobre). Cette clé a circulé dans la session de travail.

**Cause :**  
Usage temporaire pour l'automatisation d'import — clé créée pour l'occasion.

**Action requise :**  
Vérifier dans Open WebUI (Paramètres → Compte → Clés API) que la clé a bien été révoquée. Si non révoquée : la révoquer.

**Précautions :**  
Les clés API Open WebUI ne doivent pas être des clés longue durée. Créer une clé, l'utiliser, la révoquer immédiatement après usage.

---

## ALLM-01 — Connexion AnythingLLM impossible après recréation du conteneur

**Date :** octobre 2026  
**Statut :** ✅ Résolu

**Symptôme :**  
Après recréation du conteneur AnythingLLM, la connexion à l'interface ne fonctionnait plus.

**Cause vérifiée :**  
Les variables nécessaires à la session, notamment `JWT_SECRET`, n'étaient pas reprises dans la configuration du nouveau conteneur. La configuration précédente contenait ces valeurs dans l'environnement de l'ancien conteneur ; elles n'étaient pas garanties par la seule persistance du volume de stockage.

**Solution validée :**  
Créer et utiliser le fichier `anythingllm.env` pour fournir les variables nécessaires au conteneur recréé. Le fichier est référencé dans le `compose.yaml` du projet.

**Test de validation :**  
La connexion à AnythingLLM a de nouveau fonctionné après recréation avec cet environnement.

**Précautions :**
- Avant toute recréation, relever les variables d'environnement indispensables sans afficher ni copier les secrets dans un terminal partagé, une conversation ou un journal.
- Vérifier que le fichier d'environnement est bien référencé par Compose et que ses permissions limitent l'accès.
- Ne pas confondre persistance du volume applicatif et persistance des secrets d'environnement.

---

## ALLM-02 — Les montages NAS ne déclenchent pas automatiquement l'indexation RAG

**Date :** octobre 2026  
**Statut :** ⚠️ Comportement confirmé ; automatisation non réalisée

**Symptôme :**  
Les dossiers du NAS sont visibles dans le conteneur AnythingLLM via les montages en lecture seule, mais leur présence ne fait pas apparaître automatiquement leurs documents dans les espaces de travail RAG.

**Cause vérifiée :**  
Un montage de système de fichiers rend les fichiers accessibles au conteneur ; il ne déclenche pas à lui seul leur importation, leur traitement par le Collector et leur indexation dans la base vectorielle d'un espace de travail.

**Solution validée :**  
Aucune synchronisation automatique n'est actuellement validée. Un test d'import via l'API AnythingLLM a réussi pour le fichier `06_volunteer_day_notice_2026-11_ZH.txt` dans l'espace `Test-Corpus-IA`.

**Test de validation :**  
Une question portant sur le fichier importé a produit la date limite attendue : **7 novembre 2026**. Ce test valide ce document et ce parcours précis, pas une synchronisation de dossier.

**Précautions :**
- Ne pas considérer un montage NAS comme une indexation RAG.
- Ne lancer aucun import en masse et ne modifier aucun espace de travail sans validation préalable.
- L'automatisation envisagée avec n8n reste à concevoir et à tester ; elle ne doit pas être considérée comme opérationnelle.

---

## ALLM-03 — Le parcours d'upload d'un espace de travail est réservé à certains rôles

**Date :** 11-13 octobre 2026  
**Statut :** ⚠️ Comportement du code confirmé ; conception d'automatisation en attente

**Symptôme :**  
L'endpoint `POST /workspace/:slug/upload` ne permet pas à un utilisateur standard d'effectuer un upload par ce parcours.

**Cause vérifiée :**  
Dans `/app/server/endpoints/workspaces.js`, cette route vérifie que le rôle est `admin` ou `manager` avant de traiter le fichier. Le traitement passe ensuite par `handleFileUpload` et le Collector.

**Solution :**  
Aucune modification n'a été apportée. Le parcours doit être pris en compte lors de la conception de l'automatisation ; ne pas élargir les rôles simplement pour contourner cette restriction.

**Test de validation :**  
Le contrôle de rôle a été repéré dans le code source du conteneur. Aucun test de contournement ni changement de permissions n'a été effectué.

**Précautions :**
- Toute automatisation doit être conçue avec le principe du moindre privilège.
- Ne pas supposer que l'endpoint d'upload d'un espace de travail et l'endpoint API général ont les mêmes contrôles d'accès.
- Avant tout import automatisé, vérifier explicitement l'identité, les autorisations et les espaces de travail cibles.

---

## ALLM-04 — Portée des clés API et isolation des workspaces (Risque réévalué — niveau élevé)

**Date :** 12-20 octobre 2026  
**Statut :** 🔴 Risque confirmé — accès admin non scopé, exposition de contenu démontrée dans le code

**Symptôme :** une clé API AnythingLLM donne un accès administrateur non restreint à l'ensemble de l'instance : tous les workspaces, leurs documents, leur historique de conversation, et le texte brut des fragments indexés.

---

**Analyse — inspection statique du code source (dépôt GitHub Mintplex-Labs, 20 oct 2026) :**  
Fichiers lus : `server/utils/middleware/validApiKey.js` (30 lignes, intégralité), `server/endpoints/api/workspace/index.js` (1036 lignes, intégralité), `server/utils/middleware/workspaceDeletionProtection.js` (18 lignes, intégralité), `server/models/workspace.js` (méthodes `getWithUser` et `whereWithUser`), `server/utils/chats/apiChatHandler.js` (signature et appels `user: null`). Aucune modification effectuée.

| Route / composant | Constat vérifié dans le code |
|-------------------|------------------------------|
| `validApiKey.js` | Vérifie uniquement l'existence du bearer token dans la table `ApiKey`. Aucun lien utilisateur, aucune portée de workspace, aucun champ `createdBy` consulté. |
| `GET /v1/workspaces` | `Workspace._findMany({ where: {} })` — aucun filtre. Retourne tous les workspaces avec leurs threads (inclus `user_id` des threads). |
| `GET /v1/workspace/:slug` | Lookup par slug seul, aucun contrôle d'appartenance. |
| `GET /v1/workspace/:slug/chats` | Retourne l'historique complet de toutes les conversations du workspace, sans filtre utilisateur. Le commentaire Swagger le confirme explicitement : *"Get a workspaces chats regardless of user"*. |
| `POST /v1/workspace/:slug/vector-search` | Retourne `text: source.text` — **le texte brut des fragments indexés**. C'est l'exposition de contenu la plus significative. |
| `DELETE /v1/workspace/:slug` | Supprime workspace + conversations + associations documentaires + vecteurs. Middleware `workspaceDeletionProtection` : ne bloque que si la variable d'environnement `WORKSPACE_DELETION_PROTECTION` est définie. Si absente : suppression sans contrôle d'appartenance. |
| `POST /v1/workspace/:slug/update` | Modifie les paramètres de n'importe quel workspace. |
| `POST /v1/workspace/:slug/update-embeddings` | Ajoute ou retire des documents de n'importe quel workspace. |
| `POST /v1/workspace/:slug/chat` et `stream-chat` | Transmet `user: null` au gestionnaire. Les messages sont enregistrés sans identité utilisateur (`userId: null`). Un `reset: true` sans `sessionId` risque d'effacer tout l'historique API du workspace. |
| Interface web (routes `workspaces.js`) | Utilise `Workspace.getWithUser(user, {slug})` et `whereWithUser(user)` qui filtrent par appartenance dans `workspace_users`. **Ces protections sont absentes de toutes les routes API.** |

**Correction de l'évaluation du 15 octobre :**  
La conclusion *"contenu textuel des chunks indexés : non exposé par l'API"* était incorrecte. Elle se basait uniquement sur `GET /api/v1/documents` (métadonnées) et `GET /api/v1/workspaces`. La route `POST /v1/workspace/:slug/vector-search`, non testée empiriquement, retourne bien le texte brut des fragments via `source.text`. Le niveau de risque réel est supérieur à ce qui avait été documenté.

**Confirmation empirique partielle (15 oct 2026) :**

| Commande | Résultat |
|---------|---------|
| `GET /api/v1/workspaces` | Retourne les 3 workspaces sans filtrage ✅ |
| `GET /api/v1/documents` | Retourne les métadonnées de tous les documents uploadés ✅ |
| `POST /api/v1/workspace/:slug/vector-search` | Retourne `text: source.text` — confirmé dans le code, non testé empiriquement |
| `GET /api/v1/workspace/:slug/chats` | Confirmé dans le code (comportement *"regardless of user"*), non testé empiriquement |

**Niveau de risque :** une clé API constitue un accès admin non scopé à l'instance entière. Elle permet de lister tous les workspaces, lire l'historique de toutes les conversations, récupérer le texte brut des fragments indexés de n'importe quel espace, modifier ou supprimer n'importe quel workspace. Ce comportement est **intentionnel** dans la conception d'AnythingLLM — la clé API est prévue pour des intégrations disposant d'un accès admin. Ce n'est pas un bug, mais une contrainte architecturale à prendre en compte.

**Routes prioritaires non encore auditées :**
- `POST /v1/document/upload` et `GET /v1/document/:docName`
- Routes `/v1/workspace/:slug/thread/*`
- Routes `GET /v1/admin/users`, `GET /v1/admin/workspace-chats`, `POST /v1/admin/workspaces/:id/update-users`

**Action immédiate (sans redémarrage applicatif non planifié) :**  
Ajouter `WORKSPACE_DELETION_PROTECTION=1` dans `anythingllm.env` au prochain redémarrage planifié. C'est la seule protection intégrée disponible ; elle ferme le risque de suppression destructrice sans modifier le comportement des autres routes.

**Règles de conception pour n8n (inchangées, renforcées) :**
- L'API ne doit jamais cibler les workspaces personnels — uniquement `corpus-ia`
- Slug hardcodé dans le workflow, jamais fourni par l'appelant
- Clé dédiée à n8n, distincte de toute clé d'exploration ou d'intégration Open WebUI
- Clé stockée comme credential n8n chiffré, jamais dans les logs ni dans l'interface
- Journaliser chaque appel (workspace ciblé, fichier, résultat)
- Ne pas utiliser `reset: true` sans `sessionId` explicite

**Précautions :**
- Ne pas créer de comptes Kostia et chhsu dans AnythingLLM avant validation de l'architecture des workspaces
- Ne pas lancer l'automatisation n8n tant que `WORKSPACE_DELETION_PROTECTION` n'est pas activé
- Traiter la clé `Import-Corpus-IA` comme un accès admin à l'instance entière
- Vérifier dans Open WebUI et dans les logs Docker si cette clé est utilisée avant toute révocation
- Ne jamais exposer la clé à un utilisateur final ni la faire transiter par une interface

---

## ALLM-05 — La fonction purgeDocument a une portée globale

**Date :** 12-13 octobre 2026  
**Statut :** ⚠️ Comportement du code confirmé ; aucun incident de suppression constaté

**Symptôme / risque :**  
Une future synchronisation NAS pourrait être tentée de supprimer les vecteurs d'un document lorsqu'un fichier source disparaît. Or, le helper `purgeDocument(filename)` ne semble pas limité à un seul espace de travail.

**Cause vérifiée :**  
Dans `/app/server/utils/files/purgeDocument.js`, la fonction appelle le nettoyage du cache et du document source, puis récupère les espaces de travail et appelle `Document.removeDocuments` pour chacun d'eux.

**Solution :**  
Aucune suppression automatisée n'a été mise en place. Ne pas relier directement une suppression de fichier sur le NAS à `purgeDocument` sans mécanisme de portée et de validation approprié.

**Test de validation :**  
Le parcours a été inspecté dans le code. Aucun test destructif n'a été effectué et aucune suppression accidentelle n'a été signalée.

**Précautions :**
- Toute suppression doit être limitée explicitement à l'espace de travail visé.
- Prévoir une simulation (« dry run »), des journaux et une sauvegarde avant toute opération de purge.
- Traiter les suppressions NAS comme un cas séparé de l'ajout ou de la mise à jour des documents.

---

## ALLM-06 — Cache vectoriel indexé par chemin : risque de contenu périmé

**Date :** 11-15 octobre 2026  
**Statut :** ✅ Fichier cache identifié — mécanisme compris

**Symptôme / risque :**  
Le cache des résultats vectorisés peut réutiliser des fragments déjà calculés pour un chemin de fichier.

**Cause observée dans le code examiné :**  
Dans `/app/server/utils/files/index.js`, le nom du fichier de cache est calculé à partir d'un UUIDv5 du chemin (`filename`). Les fonctions `cachedVectorInformation` et `storeVectorResult` consultées ne prennent pas en compte, dans cette clé, le contenu du fichier ni sa date de modification.

**Conséquence possible :**  
Si un fichier est modifié en conservant le même chemin et si aucune autre logique n'invalide ce cache, d'anciens fragments pourraient être réutilisés. La présence d'autres mécanismes d'invalidation n'a pas été entièrement exclue ; il s'agit donc d'un risque, pas d'un comportement systématiquement démontré.

**Identification du fichier cache (15 oct 2026) :**  
Le fichier `5d8cac14-8cf5-5c28-964b-c70d2dae2fdb.json` (13 774 octets) a été identifié comme le cache vectoriel de `06_volunteer_day_notice_2026-11_ZH.txt` par correspondance de timestamp : l'API indique `published: 06:03:08 UTC`, la date de modification du fichier cache est `06:03:10 UTC` — écart de 2 secondes cohérent avec le temps d'écriture du cache après indexation. Le chemin source est donc : `custom-documents/06_volunteer_day_notice_2026-11_ZH.txt`. L'UUIDv5 `5d8cac14-…` est bien la dérivation de ce chemin selon la logique de `index.js`. ✅

**Solution :**  
Aucune suppression ou invalidation de cache n'a été effectuée. Le fichier actuel correspond à l'état actuel du document — aucune action corrective requise.

**Précautions :**
- Si un document est modifié et réimporté sous le même nom, supprimer explicitement le cache avant réindexation.
- Ne pas supprimer le cache sans avoir identifié le document source correspondant.
- Tester les mises à jour de contenu dans un espace de test avant de définir une stratégie de synchronisation.

---

## ALLM-07 — Répétition d'un ajout : risque de doublons ou de vecteurs orphelins

**Date :** 12-13 octobre 2026  
**Statut :** 🔎 Risque identifié dans le code ; incident non constaté

**Constat dans le code examiné :**  
`Document.addDocuments` crée un nouvel identifiant de document (`docId`) lors d'un ajout et écrit ensuite les enregistrements en base après l'appel au fournisseur vectoriel. Le parcours examiné dans le fournisseur Lance insère des vecteurs et des associations sans déduplication préalable clairement visible par chemin. Si l'insertion en base échoue après l'ajout des vecteurs, aucun nettoyage compensatoire n'a été repéré dans le passage examiné.

**Conséquence possible :**  
Des réimports répétés pourraient créer des associations ou vecteurs en double ; un échec partiel pourrait laisser des vecteurs orphelins. Ces conséquences restent des hypothèses à confirmer par des tests et par l'examen du comportement complet du fournisseur.

**Solution :**  
Aucune correction ni opération de réindexation n'a été effectuée. Ne pas lancer de réimport massif avant d'avoir défini une procédure idempotente et vérifié le comportement des mises à jour.

**Test de validation :**  
Aucun test de duplication, d'échec SQL ou de nettoyage d'orphelins n'a été effectué.

**Précautions :**
- Une automatisation doit distinguer nouveau fichier, fichier modifié et fichier déjà traité.
- Prévoir un identifiant stable et une stratégie de mise à jour/remplacement plutôt qu'un ajout systématique.
- Ne pas supposer que relancer un import est sans effet secondaire.

---

## ALLM-08 — Routes d'administration API sans contrôle de rôle visible

**Date de constat :** 20 octobre 2026  
**Statut :** ⚠️ Risque élevé par inspection statique ; aucune création/suppression de compte testée.

**Constat :**  
`/app/server/endpoints/api/admin/index.js` : `GET /v1/admin/users` appelle `User.where()` ; `POST /v1/admin/users/new` transmet le corps à `User.create()` ; `DELETE /v1/admin/users/:id` appelle `User.delete()`. Dans les extraits inspectés, ces routes sont protégées par `validApiKey` et la vérification du mode multi-utilisateur, mais aucun middleware de rôle admin n'est visible.

Le modèle autorise les rôles `default`, `admin` et `manager`. La route de création examinée n'appelle pas visiblement `validRoleSelection`. La fonction `canModifyAdmin` utilisée par une route de modification empêche certains cas où il ne resterait aucun administrateur, mais ne vérifie pas à elle seule le rôle de l'appelant.

**Risque :** une clé API ordinaire pourrait potentiellement créer ou supprimer des comptes, y compris un compte privilégié. C'est une déduction forte à partir du code, pas un exploit démontré.

**Précautions :**
- Ne pas tenter sur l'instance réelle.
- Reproduire et valider uniquement sur une instance isolée avec des données factices.
- Ne pas créer les comptes Kostia et chhsu avant que ce risque soit évalué en environnement isolé.

---

## ALLM-09 — API documentaire et répertoire de fichiers générés partagés

**Date de constat :** 20 octobre 2026  
**Statut :** ⚠️ Contrôles d'appartenance non visibles dans les routes examinées.

**Constat :**  
Les routes de listing documentaire, upload, déplacement/suppression et `GET /v1/document/generated-files/:filename` reposent visiblement sur `validApiKey` sans propriétaire utilisateur/session/workspace. Certaines vérifications de chemin existent mais ne remplacent pas une autorisation par utilisateur. `purgeDocument()` retire les associations dans tous les workspaces ; `purgeFolder()` utilise une suppression récursive du dossier ciblé après ses contrôles.

**Risque :** accès ou altération de documents et fichiers d'un autre utilisateur si les routes sont accessibles à une clé non privilégiée.

**Précautions :**
- Non testé en exploitation. Ne pas utiliser ces routes pour une automatisation multi-utilisateur avant correction et validation.

---

## ALLM-10 — Protection de suppression de workspace inactive dans l'environnement observé

**Date de constat :** 20 octobre 2026  
**Statut :** ⚠️ Condition du middleware confirmée dans le code ; variable absente de l'environnement — protection inactive.

**Constat :**  
`/app/server/utils/middleware/workspaceDeletionProtection.js` (18 lignes) bloque `DELETE /v1/workspace/:slug` uniquement si la variable d'environnement `WORKSPACE_DELETION_PROTECTION` est présente dans `process.env`. La variable a été constatée absente lors de l'inspection ; la protection est donc inactive. Le middleware n'est par ailleurs pas une protection générale : il ne s'applique qu'aux routes auxquelles il est explicitement attaché.

**Action requise :**  
Ajouter `WORKSPACE_DELETION_PROTECTION=1` dans `anythingllm.env` au prochain redémarrage planifié. Cette valeur n'a aucune signification particulière — seule la présence de la variable compte.

**Test de validation :**  
Après redémarrage, vérifier que `DELETE /v1/workspace/:slug` retourne `403 { "success": false, "error": "Workspace deletion is blocked by the system administrator." }`.

**Précautions :**
- Aucun changement d'environnement ni test de suppression effectué à ce stade.
- Ne pas lancer de suppression de workspace via l'API tant que cette protection n'est pas activée.

---

## ALLM-11 — Montage API : pas de contrôle global par rôle visible dans les extraits

**Date de constat :** 20 octobre 2026  
**Statut :** 🔎 Inspection statique ciblée.

**Constat :**  
Dans `/app/server/index.js`, `apiRouter` est créé par `express.Router()` et monté via `app.use("/api", apiRouter)`. Les extraits de la zone de montage montrent CORS et parseurs de corps, mais aucun middleware global de session ou de rôle. `developerEndpoints(app, apiRouter)` enregistre les routes de l'API développeur ; son commentaire indique que les routes doivent passer par `validApiKey`.

Cette inspection n'exclut pas une protection appliquée ailleurs dans l'application ; elle confirme qu'aucune protection globale par rôle n'apparaît dans les extraits étudiés.

**Précautions :**
- Cette observation renforce les conclusions d'ALLM-04 : l'isolation par utilisateur repose sur les routes individuelles, pas sur un filtre global.
- Aucun test d'accès non autorisé effectué.

---

## Registre des vérifications au 20 octobre 2026

| Point de vérification | Source de preuve | État |
|---|---|---|
| `validApiKey` vérifie l'existence de la clé | Code installé lu intégralement (30 lignes) | Confirmé ✅ |
| Association clé → utilisateur ou workspace | Non visible dans le middleware examiné | Non démontrée — ne pas supposer l'isolation |
| `GET /v1/workspaces` et `/v1/documents` retournent tout | Appels empiriques antérieurs | Résultats globaux observés ✅ |
| `vector-search` retourne `source.text` | Code installé inspecté (lignes 899–1032) | Confirmé dans le code ; fuite inter-utilisateur non testée |
| Pas de protections API dans `Workspace.getWithUser` / `whereWithUser` | Code inspecté — ces méthodes absentes des routes API | Confirmé ✅ |
| Création/suppression d'utilisateurs par clé non admin | Inspection statique des routes admin | Risque fort — non testé |
| Fichiers générés partagés sans propriétaire visible | Inspection statique de route documentaire | Risque plausible — non testé |
| `WORKSPACE_DELETION_PROTECTION` absente | Environnement inspecté | Protection inactive ⚠️ — action requise (voir ALLM-10) |
| Pas de contrôle global de rôle au montage API | Extraits de `server/index.js` | Confirmé dans les extraits — inspection partielle |
| Correctifs appliqués | Aucun | Aucun |

**Règle de sécurité jusqu'à nouvel avis :** pas d'import n8n ni d'opérations d'administration via l'API sur les données réelles avant correction et validation dans un environnement isolé. Ne stocker aucun secret dans ce journal.

---

## GIT-01 — Écriture du dépôt documentaire refusée par le connecteur GitHub

**Date :** 14-15 octobre 2026  
**Statut :** 🔎 Non résolu ; aucune modification effectuée

**Symptôme :**  
La lecture des fichiers et des métadonnées du dépôt `testuflo-ft/docs-serveur-ia` fonctionne avec le connecteur GitHub de ChatGPT, mais la tentative de création d'un nouveau fichier échoue avec :

`403 — Resource not accessible by integration`

**Constats :**
- Les métadonnées du dépôt retournées par le connecteur indiquaient `push: true` pour le compte connecté.
- L'action de création de fichier a néanmoins été refusée par l'API.
- La reconnexion du compte GitHub dans ChatGPT a été essayée sans résoudre le problème.
- La politique de confirmation des actions ChatGPT (« Autoriser si faible risque ») ne constitue pas, à elle seule, une autorisation d'écriture accordée par GitHub.
- CodeConverse AI a ensuite été installé côté GitHub avec des droits annoncés de lecture/écriture et le dépôt sélectionné, mais son usage dans ChatGPT exige un abonnement ChatGPT Plus. Son accès effectif au dépôt n'a donc pas été testé.

**Cause :**  
Non déterminée. Le 403 montre que la requête d'écriture est refusée par l'intégration ou l'API ; il ne permet pas d'identifier à lui seul le réglage ou la couche responsable.

**Solution :**  
Aucune. Aucun fichier n'a été créé et aucun document existant n'a été modifié dans le dépôt.

**Précautions :**
- Ne pas confondre les droits `push` du compte GitHub avec les autorisations effectives du jeton ou de l'application utilisés par le connecteur.
- Ne pas activer des réglages de sécurité plus permissifs sans élément indiquant qu'ils corrigeraient ce 403.
- En attendant la résolution, préparer et relire les modifications séparément avant de les appliquer au dépôt.

---

## État des vérifications en attente au 20 octobre 2026

- **OWUI-02 :** confirmer l'indexation du PDF OCR dans `Corpus-AI-test` et la réponse attendue sur la date du prochain contrôle de l'extincteur (9 janvier 2027, numéro 7731-KP).
- **OWUI-04 :** vérifier si la clé API Open WebUI temporaire a bien été révoquée.
- **ALLM-04 / ALLM-10 :** activer `WORKSPACE_DELETION_PROTECTION=1` dans `anythingllm.env` au prochain redémarrage planifié ; vérifier avec un `DELETE` que le 403 est bien retourné.
- **ALLM-04 :** vérifier dans Open WebUI et les logs Docker si la clé `Import-Corpus-IA` est utilisée avant toute décision de révocation.
- **ALLM-07 :** tester le comportement d'un réimport et d'un échec partiel dans un espace isolé.
- **ALLM-08 :** valider en instance isolée si une clé non-admin peut créer ou supprimer des comptes utilisateur.
- **ALLM-09 :** valider en instance isolée l'accès inter-utilisateur aux routes documentaires et aux fichiers générés.
- **GIT-01 :** résoudre le refus d'écriture du connecteur GitHub avant d'utiliser ce dépôt comme cible de publication automatique.

*Clos depuis la version précédente :*
- ~~**ALLM-06 :** identifier le chemin source du fichier de cache observé~~ → `5d8cac14-….json` = cache de `06_volunteer_day_notice_2026-11_ZH.txt` ✅

*Rouvert et réévalué :*
- **ALLM-04** : rouvert en v0.3 — la conclusion du 15 octobre ("contenu non exposé") était incomplète. La route `POST /v1/workspace/:slug/vector-search` retourne le texte brut des fragments. Niveau de risque relevé à 🔴.

---

*Dernière mise à jour : 20 octobre 2026*  
*Version 0.4 : ajout des incidents ALLM-08 à ALLM-11 (routes admin, API documentaire, protection suppression workspace, montage API) issus de l'inspection statique du 20 octobre ; ajout du registre des vérifications ; table des vérifications en attente mise à jour. Base : v0.3 (ALLM-04 🔴).*
