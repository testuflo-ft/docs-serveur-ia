# Journal des Incidents — Serveur IA Mac mini + Synology

*Version 0.6 — 23 octobre 2026*

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

**Note architecturale (20-21 oct 2026) :**  
Le comportement intentionnel est confirmé par `SECURITY.md` du dépôt officiel (tag v1.17.0) : les Developer API keys sont des identifiants système accordant un accès complet équivalent administrateur. Une portée par workspace/utilisateur est documentée comme demande de fonctionnalité, pas comme comportement attendu. Voir ALLM-13.

**Correction de l'évaluation du 15 octobre :**  
La conclusion *"contenu textuel des chunks indexés : non exposé par l'API"* était incorrecte. Elle se basait uniquement sur `GET /api/v1/documents` (métadonnées) et `GET /api/v1/workspaces`. La route `POST /v1/workspace/:slug/vector-search`, non testée empiriquement, retourne bien le texte brut des fragments via `source.text`. Le niveau de risque réel est supérieur à ce qui avait été documenté.

**Confirmation empirique partielle (15 oct 2026) :**

| Commande | Résultat |
|---------|---------|
| `GET /api/v1/workspaces` | Retourne les 3 workspaces sans filtrage ✅ |
| `GET /api/v1/documents` | Retourne les métadonnées de tous les documents uploadés ✅ |
| `POST /api/v1/workspace/:slug/vector-search` | Retourne `text: source.text` — confirmé dans le code, non testé empiriquement |
| `GET /api/v1/workspace/:slug/chats` | Confirmé dans le code (comportement *"regardless of user"*), non testé empiriquement |

**Niveau de risque :** une clé API constitue un accès admin non scopé à l'instance entière. Ce comportement est **intentionnel** dans la conception d'AnythingLLM — la clé API est prévue pour des intégrations disposant d'un accès admin. Ce n'est pas un bug, mais une contrainte architecturale à prendre en compte.

**Routes prioritaires non encore auditées :**
- `POST /v1/document/upload` et `GET /v1/document/:docName`
- Routes `/v1/workspace/:slug/thread/*`
- Routes `GET /v1/admin/users`, `GET /v1/admin/workspace-chats`, `POST /v1/admin/workspaces/:id/update-users`

**Action immédiate (sans redémarrage applicatif non planifié) :**  
Ajouter `WORKSPACE_DELETION_PROTECTION=1` dans `anythingllm.env` au prochain redémarrage planifié.

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
Si un fichier est modifié en conservant le même chemin et si aucune autre logique n'invalide ce cache, d'anciens fragments pourraient être réutilisés.

**Identification du fichier cache (15 oct 2026) :**  
Le fichier `5d8cac14-8cf5-5c28-964b-c70d2dae2fdb.json` correspond au cache de `06_volunteer_day_notice_2026-11_ZH.txt`. ✅

**Solution :**  
Aucune suppression ou invalidation de cache n'a été effectuée. Le fichier actuel correspond à l'état actuel du document.

**Précautions :**
- Si un document est modifié et réimporté sous le même nom, supprimer explicitement le cache avant réindexation.
- Ne pas supprimer le cache sans avoir identifié le document source correspondant.

---

## ALLM-07 — Répétition d'un ajout : risque de doublons ou de vecteurs orphelins

**Date :** 12-13 octobre 2026  
**Statut :** 🔎 Risque identifié dans le code ; incident non constaté

**Constat dans le code examiné :**  
`Document.addDocuments` crée un nouvel identifiant de document (`docId`) lors d'un ajout et écrit ensuite les enregistrements en base après l'appel au fournisseur vectoriel. Le parcours examiné dans le fournisseur Lance insère des vecteurs et des associations sans déduplication préalable clairement visible par chemin.

**Conséquence possible :**  
Des réimports répétés pourraient créer des associations ou vecteurs en double ; un échec partiel pourrait laisser des vecteurs orphelins.

**Solution :**  
Aucune correction ni opération de réindexation n'a été effectuée.

**Précautions :**
- Une automatisation doit distinguer nouveau fichier, fichier modifié et fichier déjà traité.
- Prévoir un identifiant stable et une stratégie de mise à jour/remplacement plutôt qu'un ajout systématique.

---

## ALLM-08 — Routes d'administration API sans contrôle de rôle visible

**Date de constat :** 20 octobre 2026  
**Statut :** ⚠️ Risque élevé par inspection statique ; aucune création/suppression de compte testée.

**Constat :**  
`/app/server/endpoints/api/admin/index.js` : routes `GET/POST/DELETE` sur `/v1/admin/users` protégées par `validApiKey` et vérification du mode multi-utilisateur, mais aucun middleware de rôle admin visible dans les extraits inspectés.

**Note (20-21 oct 2026) :** la politique officielle d'AnythingLLM (SECURITY.md v1.17.0) précise que les Developer API keys accordent un accès administrateur complet par conception. L'absence de middleware de rôle sur ces routes admin est cohérente avec ce modèle — comportement intentionnel.

**Précautions :**
- Ne pas tenter sur l'instance réelle.
- Reproduire et valider uniquement sur une instance isolée avec des données factices.
- Ne pas créer les comptes Kostia et chhsu avant que ce risque soit évalué en environnement isolé.

---

## ALLM-09 — API documentaire et répertoire de fichiers générés partagés

**Date de constat :** 20 octobre 2026  
**Statut :** ⚠️ Contrôles d'appartenance non visibles dans les routes examinées.

**Constat :**  
Les routes de listing documentaire, upload, déplacement/suppression et `GET /v1/document/generated-files/:filename` reposent visiblement sur `validApiKey` sans propriétaire utilisateur/session/workspace.

**Précautions :**
- Non testé en exploitation. Ne pas utiliser ces routes pour une automatisation multi-utilisateur avant correction et validation.

---

## ALLM-10 — Protection de suppression de workspace inactive dans l'environnement observé

**Date de constat :** 20 octobre 2026  
**Statut :** ⚠️ Condition du middleware confirmée dans le code ; variable absente de l'environnement — protection inactive.

**Constat :**  
`workspaceDeletionProtection.js` bloque `DELETE /v1/workspace/:slug` uniquement si `WORKSPACE_DELETION_PROTECTION` est présente dans `process.env`. Variable absente lors de l'inspection → protection inactive.

**Action requise :**  
Ajouter `WORKSPACE_DELETION_PROTECTION=1` dans `anythingllm.env` au prochain redémarrage planifié.

**Test de validation :**  
Après redémarrage, vérifier que `DELETE /v1/workspace/:slug` retourne `403 { "success": false, "error": "Workspace deletion is blocked by the system administrator." }`.

---

## ALLM-11 — Montage API : pas de contrôle global par rôle visible dans les extraits

**Date de constat :** 20 octobre 2026  
**Statut :** 🔎 Inspection statique ciblée.

**Constat :**  
Dans `server/index.js`, aucun middleware global de session ou de rôle visible dans les extraits de la zone de montage API. Chaque route doit porter son propre middleware d'authentification.

**Précautions :**
- Cette observation renforce les conclusions d'ALLM-04.
- Aucun test d'accès non autorisé effectué.

---

## ALLM-12 — Route `/api/v1/system/env-dump` sans authentification

**Date de constat :** 20-21 octobre 2026  
**Statut :** ⚠️ Décision de durcissement requise — ambiguïté entre openapi.json v1.17.0 et branche principale du dépôt

---

### Constat initial — code source installé

Fichier : `/home/claude/anything-llm-src/server/endpoints/api/system/index.js`, ligne 16 :

```js
// AUCUN middleware validApiKey :
app.get("/v1/system/env-dump", async (_, response) => {
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

// Route suivante HAS validApiKey :
app.get("/v1/system", [validApiKey], async (_, response) => { ... });
```

Confirmé aussi en v1.18.0.

**Ce que fait `dumpENV()` :**
- Lit les valeurs de `process.env` pour les clés de configuration mappées
- Applique `sanitizeValue()` — supprime `\n`, `\r`, `\t`, `'`, `"`, `#`
- Écrase le fichier `.env` dans le conteneur (`flag: "w"`)
- **Ne retourne pas les secrets dans la réponse HTTP** — réponse `HTTP 200` uniquement

**Facteurs atténuants dans le setup actuel :**
- AnythingLLM accessible uniquement via Tailscale ✅
- Réponse HTTP sans contenu secret ✅
- Secrets en mémoire (`process.env`) non modifiés ✅

---

### Reclassification — dossier ChatGPT 23 octobre 2026

Un examen de la branche principale du dépôt (postérieure à v1.17.0) révèle un commentaire explicite dans le code indiquant que la route `/v1/system/env-dump` est **intentionnellement non authentifiée**. Cela crée une ambiguïté avec le comportement documenté dans `openapi.json` de v1.17.0, qui décrit une réponse `403 InvalidAPIKey` — suggérant que l'authentification était prévue dans cette version.

**Tension non résolue :**
- `openapi.json` v1.17.0 : documente `403 InvalidAPIKey` → auth *prévue*
- Commentaire branche principale : route explicitement *sans* auth par intention
- Comportement observé : aucune auth locale dans v1.17.0 et v1.18.0

**Statut reclassifié** : de "🔴 P0 — vulnérabilité confirmée" à "⚠️ Décision de durcissement requise". La route est sans auth dans la version installée, mais cette absence peut être intentionnelle. La décision finale appartient à Florian.

---

### Correctifs proposés et revus

**CP-1 — Premier correctif proposé par ChatGPT (octobre 2026) :**  
Ajout de `[validApiKey]` uniquement sur la route `/api/v1/system/env-dump` dans `server/endpoints/api/system/index.js`.  
**Lacunes identifiées :** ne couvrait pas la nuance `NODE_ENV !== 'production'` (route retourne 200 sans écrire si pas en production) ; ne couvrait pas la seconde route `/api/env-dump` dans `server/endpoints/system.js`. **Incomplet — non appliqué.**

**CP-2 — Correctif révisé par ChatGPT (octobre 2026) :**  
Couvre les deux routes :
- `server/endpoints/system.js` : ajout `[validatedRequest, flexUserRoleValid([ROLES.admin])]`
- `server/endpoints/api/system/index.js` : ajout `[validApiKey]`

Techniquement solide. **Non appliqué.**

**CP-3 — Patch 23 octobre 2026 (préparé, non déployé) :**  
Patch `--whitespace=error` appliqué au checkout source :
- `server/endpoints/system.js` : `[validatedRequest, flexUserRoleValid([ROLES.admin])]` ajouté à la route `/api/env-dump`
- `server/endpoints/api/system/index.js` : `[validApiKey]` ajouté à la route `/v1/system/env-dump`

Vérifications statiques :
- `node --check server/endpoints/api/system/index.js` ✅
- `node --check server/endpoints/system.js` ✅

**SHA-256 du patch :** `b27d886c07d890616ef12d072d0848195214457dc07836ba34417a2940ca1a7e`  
**Statut : préparé, vérification statique réussie, NON DÉPLOYÉ.**

---

### Options de décision

| Option | Action | Condition préalable |
|--------|--------|---------------------|
| A | Appliquer CP-3 | Vérifier image conteneur + dépendances scripts ; tester sur branche isolée |
| B | Désactiver la route | `return response.sendStatus(404).end()` en début de handler ; vérifier qu'aucun script interne ne l'appelle |
| C | Accepter le risque | Documenter explicitement avec Tailscale comme unique contrôle ; surveiller les accès |

**Vérification obligatoire avant tout déploiement :**
- `docker inspect anythingllm` → image ID et digest
- `grep -r "env-dump" /home/claude/anything-llm-src/` → identifier les appelants internes éventuels
- Vérifier que l'image déployée correspond au commit audité (fa7ec877f005)

**Précautions :**
- Ne pas appeler `/api/v1/system/env-dump` manuellement sans raison
- Ne pas redémarrer le conteneur après un appel à cette route sans vérifier le `.env` résultant
- Ne jamais écrire les secrets du `.env` dans ce journal

---

## ALLM-13 — Les clés Developer API ne sont pas des identifiants à portée limitée

**Date de constat :** 20-21 octobre 2026  
**Type :** décision d'architecture / clarification de modèle  
**Statut :** ✅ Politique officielle confirmée dans SECURITY.md v1.17.0 ; architecture de moindre privilège non mise en place.

**Fait établi :**  
`SECURITY.md` tag v1.17.0 : les Developer API keys sont des identifiants **système**, créées uniquement par des administrateurs, accordant un accès **complet et non restreint** à `/v1/*`. Une clé limitée par workspace est une demande de fonctionnalité.

**Ce que cela ne change pas :**
- ALLM-12 reste un risque : une route *sans* `validApiKey` dépasse même le modèle intentionnel
- La clé Developer API doit être traitée comme un secret administrateur complet

**Conséquence pour n8n :**  
Construire une passerelle dédiée avec allowlist de workspaces, opérations limitées et journalisation.

---

## ALLM-14 — Pipeline d'import : vecteurs et association SQL sans transaction commune visible

**Date de constat :** 20-21 octobre 2026  
**Statut :** ✅ Ordre des opérations confirmé dans le code ; ⚠️ panne réelle non injectée.

**Constat :**  
Dans `Document.addDocuments`, l'insertion LanceDB précède la création SQL `workspace_documents`. Si la création SQL échoue, aucune suppression compensatoire du vecteur déjà inséré n'est visible. Pas de transaction atomique possible entre LanceDB et SQL.

**Action recommandée :**
- Standardiser la valeur de retour de `uploadToWorkspace` en résultat structuré
- Introduire une compensation après échec SQL
- Tester l'échec entre écriture vectorielle et écriture SQL en environnement isolé

---

## ALLM-15 — Cache vectoriel indexé sur le chemin source, pas le contenu

**Date de constat :** 20-21 octobre 2026  
**Statut :** ✅ Clé de cache confirmée dans le code ; comportement exact sur réimport à tester.

**Constat :**  
Clé de cache = `uuidv5(filename, uuidv5.URL)`. Pas de hash du contenu. Un fichier modifié au même chemin peut réutiliser des chunks périmés.

**Action recommandée :**
- Tester en instance isolée le comportement sur réimport à chemin identique
- Envisager une clé de cache fondée sur contenu + modèle d'embedding
- Prévoir une invalidation explicite du cache avant réimport

---

## ALLM-16 — Purge de dossier : index non récursif et risques complémentaires

**Date de constat :** 20-21 octobre 2026 ; complété 23 octobre 2026  
**Type :** risque de nettoyage incomplet  
**Statut :** ✅ Comportement du code confirmé et complété ; aucune purge exécutée dans cet audit.

### Constat initial (v0.5)

Fichier `server/utils/files/purgeDocument.js`, fonction `purgeFolder` :
1. Liste le contenu **de premier niveau** du dossier
2. Pour chaque entrée directe : purge du cache et des associations (non récursif)
3. Appelle `fs.rmSync(subFolderPath, { recursive: true })` — suppression physique récursive

La suppression physique est récursive mais la purge des index (cache vectoriel, associations SQL, vecteurs LanceDB) ne l'est **pas**. Les fichiers dans des sous-dossiers sont supprimés du disque sans que leurs associations aient été traitées individuellement.

### Compléments identifiés — 23 octobre 2026

**Chemins imbriqués dans create-folder et move-files :**  
La route `create-folder` accepte des noms de dossier contenant le séparateur `/`, ce qui permet de créer des arborescences imbriquées. La fonction `moveProcessedDocsToFolder()` rejette les séparateurs imbriqués dans son propre contexte, mais d'autres routes ne bloquent pas nécessairement ces chemins — la cohérence entre routes n'est pas garantie.

**`Document.removeDocuments()` et erreurs SQL :**  
La fonction peut avaler silencieusement des erreurs SQL et retourner un résultat de succès même si certaines associations n'ont pas été supprimées. Le résultat renvoyé à l'appelant ne reflète pas nécessairement l'état réel de la base.

**`purgeVectorCache()` — gestion asynchrone incomplète :**  
Les appels à `purgeVectorCache()` sont asynchrones ; en cas de rejet, la promesse peut ne pas être correctement interceptée, laissant des entrées de cache orphelines sans qu'aucune erreur ne soit remontée.

**Risque de réponse HTTP trompeuse :**  
Les routes de suppression peuvent retourner HTTP 200 après un retour anticipé de `purgeFolder()` (dossier protégé, chemin invalide, dossier inexistant) sans que la suppression ait eu lieu. L'appelant ne peut pas distinguer un succès réel d'un no-op silencieux. (Voir INT-20 pour les détails de la route.)

**Action recommandée :**
- Implémenter un parcours récursif dans la phase de purge des index avant la suppression physique
- Vérifier et gérer les rejets de `purgeVectorCache()`
- Tester les erreurs SQL dans `Document.removeDocuments()` pour s'assurer qu'elles remontent
- Tester avec une arborescence imbriquée : vérifier que namespaces/vecteurs, SQL et cache sont tous traités
- Ne pas utiliser `purgeFolder` pour du nettoyage automatisé tant que ce comportement n'est pas corrigé

---

## DOS-02 — Parseurs globaux sans limite effective avant authentification

**Date de constat :** 23 octobre 2026  
**Type :** déni de service potentiel  
**Statut :** ⚠️ Confirmé dans le code v1.17.0 et v1.18.0 ; correctif upstream absent des deux versions.

**Symptôme :**  
N'importe quel appelant peut envoyer un corps HTTP de plusieurs gigaoctets sans être authentifié. Le serveur tentera de lire et parser ce corps avant tout contrôle d'accès.

**Cause vérifiée :**  
Dans `server/index.js`, les parseurs de corps globaux (`express.json`, `express.urlencoded`) utilisent `FILE_LIMIT = "3GB"` et sont montés avant les middlewares d'authentification. La route `/api/embed` est particulièrement exposée car elle ne requiert pas de `validApiKey`.

**Correctif upstream :**  
Commit `c729bf480ab146063b6c9ef287182384b9b080e0` (14 octobre 2026) dans la branche principale : ajout d'une limite de 1 MB sur `/api/embed`. Ce correctif est **absent de v1.17.0 ET de v1.18.0**.

**Impact :**
- Saturation mémoire ou disque possible par un attaquant sur le tailnet ou en cas de mauvaise configuration réseau
- Pas d'exposition de secrets dans la réponse
- Pas d'exécution de code arbitraire

**Facteurs atténuants :**
- AnythingLLM accessible uniquement via Tailscale — surface d'attaque limitée
- Nécessite un accès réseau au service

**Vérification préalable obligatoire :**  
Avant tout correctif : vérifier la présence ou l'absence de `EMBED_BODY_LIMIT` dans `/app/server/index.js` de l'image déployée, et vérifier l'ID et le digest de l'image pour confirmer que le code audité correspond bien au code en production.

**Action recommandée :**
- Court terme : vérifier l'image déployée (voir vérification obligatoire ci-dessus)
- Moyen terme : appliquer une limite explicite sur `/api/embed` et réduire `FILE_LIMIT` global
- Ne pas modifier l'image de production sans planification préalable

**Sources :**
- `server/index.js` v1.17.0 : `const FILE_LIMIT = "3GB"`
- Upstream commit `c729bf480ab146063b6c9ef287182384b9b080e0`, 14 oct 2026

---

## INT-17 — Route `move-files` : absence de validation du type de la source

**Date de constat :** 23 octobre 2026  
**Référence dossier ChatGPT :** MVT-01  
**Type :** défaut de validation d'entrée  
**Statut :** ⚠️ Confirmé dans le code v1.17.0 ; aucun test destructif effectué.

**Symptôme :**  
La route `move-files` déplace n'importe quel objet du système de fichiers — y compris un répertoire — sans vérifier que la source est un fichier ordinaire.

**Cause vérifiée :**  
Aucun appel `lstat(...).isFile()` avant `fs.rename()`. La route vérifie que les chemins restent dans le répertoire documentaire (`isWithin`) mais ne distingue pas fichiers, répertoires et liens symboliques.

**Risques additionnels (MVT-01) :**
- **TOCTOU (race condition) :** un appel `lstat` isolé suivi de `fs.rename` n'est pas atomique — l'objet peut changer de nature entre les deux opérations. Sur les systèmes de fichiers concernés, aucune primitive ne garantit à la fois la vérification du type et le déplacement.
- **Politique lien symbolique non définie :** le comportement attendu pour les liens symboliques (suivi, refus, cas particuliers) n'est pas documenté dans le code.

**Action recommandée :**
- Ajouter un contrôle `lstat(...).isFile()` avant tout `fs.rename()`
- Définir et documenter explicitement la politique concernant les liens symboliques
- Documenter les limites résiduelles liées au TOCTOU si aucune primitive atomique n'est disponible
- Tester : source répertoire, source lien symbolique, source fichier valide, source inexistante, chemin ambigu

**Sources :**
- `server/endpoints/api/document/index.js` — route `POST /v1/document/move-files`
- `server/endpoints/document.js` — route web de déplacement
- Dossier ChatGPT f34bd946, section 4 (MVT-01)

---

## INT-18 — Route `move-files` : écrasement silencieux de la destination

**Date de constat :** 23 octobre 2026  
**Référence dossier ChatGPT :** MVT-02  
**Type :** défaut de protection des données  
**Statut :** ⚠️ Confirmé dans le code v1.17.0 ; aucun test destructif effectué.

**Symptôme :**  
Un déplacement vers une destination déjà occupée remplace silencieusement le fichier existant, y compris si celui-ci est indexé ou référencé par AnythingLLM.

**Cause vérifiée :**  
`fs.rename()` sur une destination existante écrase sans avertissement sur les systèmes de fichiers POSIX. Aucune vérification d'existence de la destination n'est visible dans le code des routes de déplacement.

**Risques additionnels (MVT-02) :**
- Le schéma `existsSync(dest) → rename()` n'est **pas atomique** : une race condition entre la vérification et le déplacement reste possible. Il faut une primitive offrant une garantie réelle (flag `O_EXCL` via `open()`, ou une stratégie équivalente adaptée à Node.js et au système de fichiers ciblé).
- Si la stratégie repose sur des liens physiques, les contraintes de systèmes de fichiers différents, de liens symboliques et de permissions doivent être documentées.

**Action recommandée :**
- Refuser tout déplacement si la destination existe déjà (erreur explicite, source préservée)
- Utiliser une primitive anti-écrasement garantie, pas un simple `existsSync + rename`
- Tester : destination absente (succès), destination présente (refus + contenu préservé), destination indexée (aucune altération), deux opérations concurrentes (au plus une réussite)

**Sources :**
- `server/endpoints/api/document/index.js` — route `POST /v1/document/move-files`
- Dossier ChatGPT f34bd946, section 5 (MVT-02)

---

## INT-19 — Lots de déplacements : sémantique non définie, pas d'atomicité

**Date de constat :** 23 octobre 2026  
**Référence dossier ChatGPT :** MVT-03  
**Type :** risque d'incohérence d'état  
**Statut :** ⚠️ Confirmé dans le code v1.17.0 ; aucun test destructif effectué.

**Symptôme :**  
Un lot de déplacements peut être partiellement exécuté en cas d'erreur — certains fichiers déplacés, d'autres non — sans que le client dispose d'un résultat individuel par opération.

**Cause vérifiée :**  
`Promise.all(fs.rename ops)` échoue à la première erreur mais ne défait pas les opérations déjà réussies. La réponse agrégée ne distingue pas les succès des échecs individuels.

**Décision requise (MVT-03) — choisir l'une des deux sémantiques :**
- **Option A — lot atomique :** si un déplacement échoue, les opérations déjà effectuées sont annulées autant que possible. Le mécanisme de compensation doit lui-même être vérifié et ses échecs signalés. À privilégier si une garantie réaliste peut être assurée.
- **Option B — résultats individuels :** chaque déplacement dispose d'un résultat explicite (succès/échec/non exécuté). La réponse distingue les trois états. Aucun succès global ne masque un échec partiel.

Ne pas annoncer une transaction atomique si le système de fichiers et les métadonnées SQL/vecteurs ne sont pas réellement couverts.

**Pré-validation requise avant toute opération physique :**
1. Valider la structure complète du lot
2. Valider chaque source et chaque destination
3. Détecter les destinations dupliquées et les conflits source/destination internes
4. Détecter les sources répétées

**Action recommandée :**
- Choisir et documenter la sémantique retenue (Option A ou B)
- Implémenter la pré-validation complète du lot
- Tester : lot valide, lot avec source invalide, lot avec destination existante, deux opérations visant la même destination, échec simulé en cours de lot

**Sources :**
- `server/endpoints/api/document/index.js` — route `POST /v1/document/move-files`
- Dossier ChatGPT f34bd946, section 6 (MVT-03)

---

## INT-20 — Route `remove-folder` : faux succès HTTP en cas de no-op

**Date de constat :** 23 octobre 2026  
**Référence dossier ChatGPT :** PUR-01 + PUR-02  
**Type :** réponse HTTP trompeuse + purge incomplète  
**Statut :** ⚠️ Confirmé dans le code v1.17.0 ; aucun test destructif effectué.

**Symptôme :**  
La route `remove-folder` retourne HTTP 200 même quand `purgeFolder()` n'a rien supprimé — dossier protégé, chemin invalide ou dossier inexistant. Le client ne peut pas distinguer un succès réel d'un refus silencieux.

**Cause vérifiée :**  
`purgeFolder()` effectue des retours anticipés silencieux pour les dossiers protégés et les chemins invalides. Les routes qui appellent cette fonction ne vérifient pas son résultat avant de répondre `200`.

**Risques complémentaires (PUR-01) :**
- `purgeFolder()` n'énumère que les entrées de premier niveau pour la purge des index — les documents dans des sous-dossiers ne sont pas traités (voir ALLM-16)
- Les erreurs SQL et les rejets asynchrones de `purgeVectorCache()` peuvent ne pas être interceptés, laissant des références résiduelles

**Contrat HTTP requis (PUR-02) :**  
Remplacer la réponse implicite par un résultat explicite parmi :
- `deleted` — suppression réalisée
- `protected` — dossier protégé (ex : `custom-documents`)
- `invalid` — chemin ou demande invalide
- `not_found` — dossier absent
- `partial_failure` — opérations partiellement effectuées
- `failure` — opération échouée

Les routes API et Web doivent retourner des statuts HTTP cohérents. Un HTTP 200 ne doit pas masquer une non-suppression.

**Protection du dossier `custom-documents` :**  
La protection existante doit être préservée et rendue explicite dans le résultat retourné à l'appelant. Les variations de casse, les chemins imbriqués et les tentatives de contournement doivent être testés.

**Action recommandée :**
- Modifier `purgeFolder()` pour retourner un résultat structuré
- Mettre à jour les routes pour propager ce résultat dans la réponse HTTP
- Tester : suppression réussie, dossier protégé, dossier inexistant, chemin invalide, échec de nettoyage

**Sources :**
- `server/utils/files/purgeDocument.js` — fonction `purgeFolder()`
- `server/endpoints/api/document/index.js` — route `DELETE /v1/document/remove-folder`
- `server/endpoints/system.js` — route web de suppression de dossier
- Dossier ChatGPT f34bd946, sections 7, 8, 9

---

## UPLOAD-02 — Fichiers temporaires orphelins après échec de validation

**Date de constat :** 23 octobre 2026  
**Type :** fuite de ressources  
**Statut :** ⚠️ Confirmé dans le code v1.17.0 ; aucun test destructif effectué.

**Symptôme :**  
Un upload qui échoue à la validation post-réception laisse des fichiers temporaires dans `collector/hotdir`.

**Cause vérifiée :**  
Multer écrit le fichier dans `collector/hotdir` avant l'exécution du middleware `validateWorkspaceSlugQuery`. Si ce middleware rejette la requête, le fichier temporaire reste sur le disque sans être nettoyé.

**Impact :**
- Accumulation de fichiers non liés à un workspace valide dans `hotdir`
- Pas d'exposition de secrets ni d'exécution de code
- Risque de saturation disque à terme si les uploads invalides se répètent

**Action recommandée :**
- Ajouter un nettoyage de fichier temporaire dans le handler d'erreur après `validateWorkspaceSlugQuery`
- Tester : upload avec workspace invalide, puis vérifier l'absence de résidu dans `hotdir`

**Sources :**
- `server/utils/multer.js`
- `server/endpoints/api/document/index.js` — route `POST /v1/document/upload`

---

## RACE-01 — Collision potentielle sur upload concurrent de fichiers homonymes

**Date de constat :** 23 octobre 2026  
**Type :** hypothèse — course sur nom de fichier temporaire  
**Statut :** 🔎 Hypothèse non confirmée ; comportement exact à tester.

**Hypothèse :**  
Multer génère le nom de fichier temporaire dans `collector/hotdir` à partir du nom de fichier original sanitisé, sans suffixe unique (timestamp ou identifiant aléatoire). Deux uploads simultanés du même fichier (même nom) pourraient écrire au même chemin temporaire et se corrompre mutuellement.

**Limite de la preuve actuelle :**  
La logique de nommage de `multer.js` a été inspectée mais le comportement exact sous charge concurrente n'a pas été testé. Il s'agit d'une hypothèse à confirmer.

**Action recommandée :**
- Examiner `server/utils/multer.js` pour confirmer si le nom temporaire est unique ou partageable
- Tester deux uploads simultanés du même fichier dans un environnement isolé
- Si confirmé : ajouter un suffixe unique (UUID ou timestamp) au nom temporaire

**Sources :**
- `server/utils/multer.js`

---

## Registre des vérifications au 23 octobre 2026

| Point de vérification | Source de preuve | État |
|---|---|---|
| `validApiKey` vérifie l'existence de la clé | Code installé lu intégralement (30 lignes) | Confirmé ✅ |
| Association clé → utilisateur ou workspace | Non visible dans le middleware examiné | Non démontrée — ne pas supposer l'isolation |
| `GET /v1/workspaces` et `/v1/documents` retournent tout | Appels empiriques antérieurs | Résultats globaux observés ✅ |
| `vector-search` retourne `source.text` | Code installé inspecté | Confirmé dans le code ; fuite inter-utilisateur non testée |
| `WORKSPACE_DELETION_PROTECTION` absente | Environnement inspecté | Protection inactive ⚠️ — action requise (voir ALLM-10) |
| Route `env-dump` sans `[validApiKey]` | Code installé `system/index.js` ligne 16 | Confirmé ✅ — voir ALLM-12 |
| `dumpENV()` écrit `.env` sans retourner les secrets | Code installé `updateENV.js` | Confirmé ✅ |
| ALLM-12 statut | Examen openapi.json v1.17.0 + branche principale | ⚠️ Ambiguïté — décision requise |
| Patch CP-3 (ALLM-12) | Vérification statique 23 oct 2026 | SHA-256 confirmé ; non déployé |
| Developer API keys = accès admin par conception | SECURITY.md officiel v1.17.0 | Confirmé ✅ |
| Pipeline d'import : vecteurs avant SQL, pas de compensation | Code installé `documents.js` | Confirmé |
| Clé de cache vectoriel dérivée du chemin | Code installé `files/index.js` + lance | Confirmé ✅ |
| `purgeFolder` : purge index non récursive | Code installé `purgeDocument.js` | Confirmé ✅ |
| `purgeFolder` : retour anticipé silencieux → faux succès HTTP | Code installé | Confirmé (INT-20) |
| `create-folder` accepte chemins imbriqués | Code installé | Confirmé (ALLM-16 complément) |
| `Document.removeDocuments()` peut avaler erreurs SQL | Code installé | Confirmé (ALLM-16 complément) |
| `purgeVectorCache()` rejet async non intercepté | Code installé | Confirmé (ALLM-16 complément) |
| `bodyParser` 3GB avant auth | Code installé `server/index.js` | Confirmé (DOS-02) |
| Correctif upstream DOS-02 absent v1.17.0 et v1.18.0 | Commit c729bf4… branche principale | Confirmé (DOS-02) |
| `move-files` sans `lstat().isFile()` | Code installé | Confirmé (INT-17) |
| `move-files` sans vérification destination | Code installé | Confirmé (INT-18) |
| Lot de déplacements non atomique | Code installé | Confirmé (INT-19) |
| Multer écrit avant validation workspace | Code installé | Confirmé (UPLOAD-02) |
| Nom temporaire multer sans suffixe unique | Code installé | Hypothèse (RACE-01) |
| Correctifs appliqués en production | Aucun | Aucun ✅ |
| Image conteneur vs commit audité fa7ec877 | Non vérifié | ⚠️ Vérification obligatoire avant tout déploiement |

**Règle de sécurité jusqu'à nouvel avis :** pas d'import n8n ni d'opérations d'administration via l'API sur les données réelles avant correction et validation dans un environnement isolé. Ne stocker aucun secret dans ce journal.

---

## Plan de test consolidé — avant d'activer n8n

| ID test | Scénario | Résultat attendu | Exécuté ? |
|---|---|---|---|
| SEC-01 | `GET /api/v1/system/env-dump` sans clé | Refus HTTP ; aucun fichier `.env` écrit/modifié | À exécuter |
| SEC-02 | Clé Developer API invalide sur routes protégées | Refus HTTP ; aucun effet secondaire | À exécuter |
| SEC-03 | Passerelle n8n vers workspace allowlisté | Opération minimale autorisée et vérifiable | À exécuter |
| SEC-04 | Même passerelle vers workspace non autorisé | Refus avant toute écriture | À exécuter |
| SEC-05 | Tentative de suppression/déplacement par passerelle | Refus sauf permission explicitement accordée | À exécuter |
| RAG-01 | Import d'un nouveau fichier | Succès vérifié dans source, SQL, mapping vectoriel et vecteurs | À exécuter |
| RAG-02 | Même fichier importé deux fois | Comportement idempotent, pas de double association/vecteur | À exécuter |
| RAG-03 | Fichier modifié au même chemin | Chunks conformes au nouveau contenu, aucun cache périmé | À exécuter |
| RAG-04 | Échec embedding | Réponse d'échec fiable, pas de faux `success: true` | À exécuter |
| RAG-05 | Échec SQL après insertion LanceDB | Compensation ou réconciliation traçable | À exécuter |
| RAG-06 | Suppression d'un document avec mapping | Association, cache et vecteurs supprimés comme prévu | À exécuter |
| RAG-07 | Dossier avec sous-dossiers purgé | Aucun index/cache/association abandonné | À exécuter |
| RAG-08 | Modification du modèle d'embedding | Réindexation cohérente ; aucune action sur production | À exécuter |
| OPS-01 | État des volumes et sauvegarde | Sauvegarde produite puis restauration d'essai vérifiée | À exécuter |
| TEST-15 | `WORKSPACE_DELETION_PROTECTION=1` actif | `DELETE /v1/workspace/:slug` → 403 | À exécuter |
| TEST-16 | DOS-02 : vérifier `EMBED_BODY_LIMIT` dans image déployée | Variable présente ou correctif upstream intégré | À exécuter |
| TEST-17 | `move-files` source = répertoire | Refus HTTP, aucun déplacement effectué | À exécuter |
| TEST-18 | `move-files` destination déjà existante | Refus HTTP, destination inchangée, source préservée | À exécuter |
| TEST-19 | Lot de déplacements avec une source invalide | Résultat individuel par opération ; succès partiels non masqués | À exécuter |
| TEST-20 | `remove-folder` sur dossier inexistant | Réponse distincte de `deleted` ; pas de faux succès | À exécuter |
| TEST-21 | Uploads simultanés du même fichier | Aucune corruption ; comportement déterministe | À exécuter |

Aucun test de cette table n'a été exécuté. Il s'agit d'un protocole de test préparatoire. **Les tests doivent être exécutés exclusivement dans un environnement isolé** — jamais sur l'installation en production.

---

## GIT-01 — Écriture du dépôt documentaire refusée par le connecteur GitHub

**Date :** 14-15 octobre 2026  
**Statut :** 🔎 Non résolu ; aucune modification effectuée

**Symptôme :**  
La lecture des fichiers et des métadonnées du dépôt `testuflo-ft/docs-serveur-ia` fonctionne avec le connecteur GitHub, mais la tentative de création d'un nouveau fichier échoue avec :

`403 — Resource not accessible by integration`

**Constats :**
- Les métadonnées du dépôt indiquaient `push: true` pour le compte connecté.
- L'action de création de fichier a néanmoins été refusée par l'API.
- La reconnexion du compte GitHub a été essayée sans résoudre le problème.

**Cause :**  
Non déterminée. Le 403 montre que la requête d'écriture est refusée par l'intégration ou l'API.

**Solution :**  
Aucune. Les documents sont livrés par téléchargement direct — Florian pousse manuellement au dépôt.

**Précautions :**
- Ne pas confondre les droits `push` du compte GitHub avec les autorisations effectives du jeton ou de l'application utilisés par le connecteur.
- En attendant la résolution, préparer et relire les modifications séparément avant de les appliquer au dépôt.

---

## MISS-01 — Session de travail 23 octobre 2026 : production des trois documents d'audit

**Date :** 23 octobre 2026  
**Type :** entrée de mission  
**Statut :** ✅ Documents produits et livrés

**Contexte :**  
Suite aux sessions des 20-21 octobre 2026 (v0.5 du Journal, v0.3 du Livret, v0.1 du Plan) et à la réception d'un dossier de corrections préparé par ChatGPT (23 octobre 2026), une session de production a été consacrée à l'intégration des nouveaux incidents et à la finalisation des trois documents.

**Documents produits dans cette session :**

| Document | Version | Statut |
|----------|---------|--------|
| `Plan-correctifs-AnythingLLM-1.17.0-v0.3-2026-10-23.md` | v0.3 | ✅ Produit |
| `Journal-des-Incidents-v0.6-2026-10-23.md` | v0.6 | ✅ Produit |
| `Livret-Technique-Serveur-IA-v0.4-2026-10-23.md` | v0.4 | ✅ Produit |

**Principaux apports de la session :**
- Intégration de 7 nouveaux incidents : DOS-02, INT-17, INT-18, INT-19, INT-20, UPLOAD-02, RACE-01
- Reclassification d'ALLM-12 : de "P0 confirmé" à "⚠️ Décision de durcissement requise" — ambiguïté documentée
- Complément ALLM-16 : chemins imbriqués, erreurs SQL silencieuses, gestion async de purgeVectorCache
- Plan de test étendu de 14 à 21 tests
- Vérification statique du patch CP-3 (SHA-256 : `b27d886c07d890616ef12d072d0848195214457dc07836ba34417a2940ca1a7e`)
- Ajout de la vérification obligatoire du conteneur avant tout déploiement

**Livraison :**  
En raison de GIT-01 (accès GitHub refusé), les documents ont été livrés par téléchargement direct. Florian pousse manuellement au dépôt `testuflo-ft/docs-serveur-ia`.

---

## État des vérifications en attente au 23 octobre 2026

- **OWUI-02 :** confirmer l'indexation du PDF OCR dans `Corpus-AI-test` et la réponse attendue (9 janvier 2027, numéro 7731-KP).
- **OWUI-04 :** vérifier si la clé API Open WebUI temporaire a bien été révoquée.
- **ALLM-04 / ALLM-10 :** activer `WORKSPACE_DELETION_PROTECTION=1` dans `anythingllm.env` au prochain redémarrage planifié ; tester avec TEST-15.
- **ALLM-04 :** vérifier dans les logs Docker si la clé `Import-Corpus-IA` est utilisée avant toute décision de révocation.
- **ALLM-07 / ALLM-14 :** tester le comportement d'un réimport, d'un échec SQL après insertion vectorielle et le nettoyage des orphelins dans un espace isolé.
- **ALLM-08 :** valider en instance isolée si une clé Developer API peut créer ou supprimer des comptes (attendu : oui, par conception).
- **ALLM-09 :** valider en instance isolée l'accès inter-utilisateur aux routes documentaires.
- **ALLM-12 :** décider de l'action sur la route `env-dump` — options A (CP-3), B (désactiver) ou C (risque accepté). **Vérification obligatoire préalable :** `docker inspect anythingllm` + image ID/digest + présence de `EMBED_BODY_LIMIT` dans `/app/server/index.js` de l'image déployée.
- **ALLM-13 :** concevoir et valider la passerelle d'import dédiée pour n8n.
- **ALLM-15 :** tester le comportement du cache vectoriel sur réimport de même chemin avec contenu modifié dans un espace isolé.
- **ALLM-16 :** tester `purgeFolder` avec arborescence imbriquée ; vérifier l'absence de références résiduelles (TEST RAG-07).
- **DOS-02 :** vérifier la présence/absence de `EMBED_BODY_LIMIT` dans l'image déployée (TEST-16) avant toute décision de correctif.
- **INT-17 à RACE-01 :** préparer et exécuter les tests TEST-17 à TEST-21 en environnement isolé uniquement.
- **GIT-01 :** résoudre le refus d'écriture GitHub avant d'utiliser ce dépôt comme cible de publication automatique.
- **Plan de test SEC/RAG/OPS :** aucun des 21 tests n'a été exécuté — à planifier en instance isolée avant tout déploiement n8n.

*Clos depuis la version précédente :*
- ~~**ALLM-06 :** identifier le chemin source du fichier de cache observé~~ → `5d8cac14-….json` = cache de `06_volunteer_day_notice_2026-11_ZH.txt` ✅

*Rouvert et réévalué :*
- **ALLM-04** : rouvert en v0.3 — la conclusion du 15 octobre ("contenu non exposé") était incomplète.
- **ALLM-08 / ALLM-13** : nuancés en v0.5 — comportement admin des clés Developer API intentionnel et documenté.
- **ALLM-12** : reclassifié en v0.6 — de P0 confirmé à décision de durcissement requise (ambiguïté openapi.json / branche principale).

---

*Dernière mise à jour : 23 octobre 2026*  
*Version 0.6 : intégration dossier ChatGPT 23 oct 2026 (DOS-02, INT-17 à INT-20/MVT-01 à PUR-02, UPLOAD-02, RACE-01) ; reclassification ALLM-12 (décision de durcissement requise) ; complément ALLM-16 (chemins imbriqués, erreurs SQL silencieuses, purgeVectorCache async) ; correctifs CP-1/CP-2/CP-3 documentés dans ALLM-12 ; plan de test étendu à 21 tests ; ajout MISS-01 (session 23 oct) ; registre des vérifications mis à jour au 23 octobre 2026. Base : v0.5 (ALLM-12 à ALLM-16, ALLM-13, plan de test SEC/RAG/OPS).*
