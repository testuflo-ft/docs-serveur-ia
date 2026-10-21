# Journal des Incidents — Serveur IA Mac mini + Synology

*Version 0.5 — 21 octobre 2026*

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

**Note (20-21 oct 2026) :** la politique officielle d'AnythingLLM (SECURITY.md v1.17.0) précise que les Developer API keys accordent un accès administrateur complet par conception. L'absence de middleware de rôle sur ces routes admin est cohérente avec ce modèle — ce n'est pas un bug mais le comportement intentionnel. Cela ne réduit pas la nécessité de protéger la clé, et ne dispense pas d'un test en instance isolée pour valider les limites exactes.

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

Cette inspection n'exclut pas une protection appliquée ailleurs dans l'application ; elle confirme qu'aucune protection globale par rôle n'apparaît dans les extraits étudiés. La route ALLM-12 illustre le cas d'une route sans aucun middleware d'authentification local.

**Précautions :**
- Cette observation renforce les conclusions d'ALLM-04 : l'isolation par utilisateur repose sur les routes individuelles, pas sur un filtre global.
- Aucun test d'accès non autorisé effectué.

---

## ALLM-12 — Route `/api/v1/system/env-dump` sans authentification

**Date de constat :** 20-21 octobre 2026  
**Statut :** 🔴 Route confirmée sans `[validApiKey]` dans la source installée (v1.17.0 et v1.18.0) ; ⚠️ impact en environnement réel non testé.

**Constat — code source installé (lignes vérifiées dans `/home/claude/anything-llm-src/server/endpoints/api/system/index.js`) :**

```js
// Ligne 16 — AUCUN middleware validApiKey :
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

// Ligne 37 — route suivante HAS validApiKey :
app.get("/v1/system", [validApiKey], async (_, response) => { ... });
```

La route suivante et toutes les autres routes du fichier portent `[validApiKey]` ; cette route en est le seul exemple sans authentification locale dans le fichier.

**Ce que fait `dumpENV()` (`server/utils/helpers/updateENV.js`, lignes 1537 et suivantes) :**
- Lit les valeurs de `process.env` pour une liste de clés de configuration : `JWT_EXPIRY`, `SIG_KEY`, `SIG_SALT`, `STORAGE_DIR`, `SERVER_PORT`, `WORKSPACE_DELETION_PROTECTION` et les autres clés mappées dans `KEY_MAPPING`
- Applique `sanitizeValue()` qui supprime `\n`, `\r`, `\t` et les guillemets — les valeurs contenant ces caractères sont tronquées
- Écrase le fichier `.env` dans le conteneur via `fs.writeFileSync(envPath, envResult, { encoding: "utf8", flag: "w" })`
- **Ne retourne pas les secrets dans la réponse HTTP** — la réponse est uniquement `HTTP 200`

**Confirmation sur v1.18.0 :** même handler présent sans `[validApiKey]` local.

**Impact plausible :**
- N'importe quel appelant atteignant le service HTTP peut déclencher une réécriture du `.env` dans le conteneur sans fournir de clé Developer API
- La réécriture utilise `flag: "w"` (écrasement total) et la fonction `sanitizeValue` tronque les valeurs avec caractères spéciaux — si un secret contient `'`, `"` ou `#`, la valeur dans le fichier réécrit peut différer de la valeur en mémoire
- Si le conteneur redémarre après un appel à cette route, il peut démarrer avec les valeurs tronquées

**Facteurs atténuants dans le setup actuel :**
- AnythingLLM est accessible uniquement via Tailscale — pas exposé publiquement ✅
- La réponse HTTP ne contient aucun secret ✅
- Les secrets en mémoire (`process.env`) ne sont pas modifiés — seul le fichier `.env` est réécrit ✅

**Risque résiduel :** tout appareil du tailnet peut déclencher cette route sans authentification. En cas de compromission d'un appareil du tailnet ou d'erreur de configuration, cette route constitue un vecteur d'écriture non authentifié.

**Action recommandée (avant prochain redémarrage planifié) :**  
Décider de l'une de ces options, dans une branche de test :
1. Ajouter `[validApiKey]` à la route (alignement sur les autres routes du fichier)
2. Désactiver la route complètement (`return response.sendStatus(404).end()` en début de handler)
3. Documenter explicitement comme risque accepté avec le périmètre Tailscale comme unique contrôle

**Précautions :**
- Ne pas appeler `/api/v1/system/env-dump` manuellement sans raison
- Ne pas redémarrer le conteneur après un appel à cette route sans avoir vérifié le fichier `.env` résultant
- Tout correctif doit être testé : sans clé → refus sans écriture fichier ; avec clé valide → comportement attendu

**Sources :**
- Source installée : `/home/claude/anything-llm-src/server/endpoints/api/system/index.js`, ligne 16
- Source installée : `/home/claude/anything-llm-src/server/utils/helpers/updateENV.js`, fonction `dumpENV()`, ligne ~1537
- GitHub tag v1.17.0 : `server/endpoints/api/system/index.js`, lignes 16–31

---

## ALLM-13 — Les clés Developer API ne sont pas des identifiants à portée limitée

**Date de constat :** 20-21 octobre 2026  
**Type :** décision d'architecture / clarification de modèle  
**Statut :** ✅ Politique officielle confirmée dans SECURITY.md v1.17.0 ; architecture de moindre privilège non mise en place.

**Fait établi :**  
Le fichier `SECURITY.md` du dépôt officiel AnythingLLM (tag v1.17.0), section *"Reports based on Developer API Key access"*, déclare explicitement :
- Les Developer API keys sont des identifiants **système**, créés uniquement par des administrateurs
- Elles accordent volontairement un accès **complet et non restreint** à `/v1/*`, équivalent administrateur
- Une clé limitée par fonctionnalité ou workspace est une **demande de fonctionnalité**, pas une vulnérabilité du modèle actuel

Cela **corrige** les interprétations d'ALLM-04 et ALLM-08 qui supposaient un manque de contrôle : le comportement est intentionnel et documenté par le mainteneur.

**Ce que cela ne change pas :**
- Une clé Developer API doit être considérée comme un secret administrateur complet — stocker, transmettre et utiliser en conséquence
- Le rôle de session d'un utilisateur web et ses workspaces autorisés ne limitent pas les appels Developer API
- ALLM-12 reste un risque : une route *sans* `validApiKey` est accessible sans aucune clé, ce qui dépasse même le modèle intentionnel

**Conséquence pour n8n :**  
Ne pas donner à n8n une clé Developer API générale. Construire une passerelle dédiée qui :
- Expose uniquement les opérations nécessaires à l'import documentaire
- Applique une allowlist de workspaces côté serveur
- Refuse par défaut tout endpoint non explicitement autorisé
- Journalise chaque opération avec workspace cible, fichier et résultat

**Source :** SECURITY.md, tag v1.17.0 — section « Reports based on Developer API Key access »

---

## ALLM-14 — Pipeline d'import : vecteurs et association SQL sans transaction commune visible

**Date de constat :** 20-21 octobre 2026  
**Type :** risque d'intégrité des données  
**Statut :** ✅ Ordre des opérations confirmé dans le code ; ⚠️ panne réelle non injectée.

**Constat dans le code (`server/models/documents.js`, `Document.addDocuments`) :**  
L'insertion des vecteurs dans LanceDB (via `VectorDb.addDocumentToNamespace(...)`) précède la création de l'enregistrement SQL `workspace_documents`. Si la création SQL échoue après l'insertion vectorielle, le code journalise l'erreur et émet `doc_failed` — mais aucune suppression compensatoire du vecteur déjà inséré n'est visible dans ce bloc.

Il n'existe pas de transaction atomique couvrant ensemble LanceDB et la base relationnelle (cette limite est intrinsèque à l'architecture). `Document.removeDocuments` se fonde sur les enregistrements `DocumentVectors` pour effacer les vecteurs : en l'absence de l'association SQL, le nettoyage ultérieur d'un vecteur orphelin peut être difficile.

Par ailleurs, `Document.api.uploadToWorkspace` retourne `true` en cas de succès mais certains chemins d'erreur ne retournent pas explicitement `false`. La valeur `success: true` dans la réponse HTTP n'est donc pas une preuve suffisante de cohérence complète de l'import.

**Risque :** un import en apparence réussi peut laisser des vecteurs sans association SQL (orphelins), rendant leur nettoyage ultérieur difficile.

**Action recommandée :**
- Standardiser la valeur de retour de `uploadToWorkspace` en résultat structuré `{ success, workspace, error }`
- Introduire une compensation après échec SQL : tentative de suppression des vecteurs du `docId` concerné ; si la compensation échoue, signaler explicitement un état de réparation nécessaire
- Conserver le fichier source en cas d'échec pour permettre une reprise manuelle
- Tester l'échec entre écriture vectorielle et écriture SQL dans un environnement isolé

**Précautions :**
- Ne pas lancer d'import massif avant que la valeur de retour soit fiable
- En cas d'import échoué, ne pas supposer que le document est absent — vérifier les deux couches (LanceDB et SQL) avant de réimporter

---

## ALLM-15 — Cache vectoriel indexé sur le chemin source, pas le contenu

**Date de constat :** 20-21 octobre 2026  
**Type :** risque de contenu périmé et d'import non déterministe  
**Statut :** ✅ Clé de cache confirmée dans le code ; comportement exact sur réimport à tester.

**Constat dans le code (`server/utils/files/index.js`) :**  
La clé de cache vectoriel est `uuidv5(filename, uuidv5.URL)` — dérivée du chemin/nom du fichier, pas d'un hash du contenu ni d'un couple contenu + modèle d'embedding.

Dans `server/utils/vectorDbProviders/lance/index.js`, `addDocumentToNamespace` appelle `cachedVectorInformation(fullFilePath)` et peut réutiliser les chunks du cache. En l'absence de cache, les chunks sont calculés, stockés et les vecteurs écrits. Le fichier `5d8cac14-8cf5-5c28-964b-c70d2dae2fdb.json` (13 774 octets, mtime `2026-10-11 06:03:10 UTC`) correspond au cache de `06_volunteer_day_notice_2026-11_ZH.txt` (confirmé en ALLM-06).

**Conséquence :**
- Si un document est modifié à chemin identique et que le flux accepte le cache existant, des chunks périmés peuvent être réutilisés pour l'embedding
- Certains flux d'import créent des chemins internes à UUID, ce qui peut générer de nouveaux documents/vecteurs au lieu de réutiliser le cache — entraînant des doublons plutôt qu'une mise à jour

Le comportement exact dépend du flux d'import utilisé par n8n : à tester dans un environnement isolé avant tout réimport en production.

**Action recommandée :**
- Tester en instance isolée : modifier le contenu d'un document sans changer son chemin, réimporter, vérifier les chunks utilisés
- Envisager une clé de cache fondée sur contenu + modèle d'embedding + paramètres de segmentation
- Prévoir une invalidation explicite du cache avant réimport (suppression du fichier `.json` dans `vector-cache/`)
- Ne pas modifier le cache de production pendant l'audit

**Précautions :**
- Ne pas supposer qu'un réimport met à jour le contenu indexé — vérifier les chunks effectivement utilisés
- La stratégie de mise à jour/remplacement doit être définie et testée avant l'automatisation n8n

---

## ALLM-16 — Purge de dossier récursive mais purge cache/associations non récursive

**Date de constat :** 20-21 octobre 2026  
**Type :** risque de nettoyage incomplet  
**Statut :** ✅ Comportement du code confirmé ; aucune purge exécutée dans cet audit.

**Constat dans le code (`server/utils/files/purgeDocument.js`, `purgeFolder`) :**  
La fonction `purgeFolder` :
1. Liste le contenu **de premier niveau** du dossier
2. Pour chaque entrée directe : purge du cache et des associations (non récursif)
3. Appelle `fs.rmSync(subFolderPath, { recursive: true })` — suppression physique récursive du dossier

La suppression physique est récursive mais la purge des index (cache vectoriel, associations SQL, vecteurs LanceDB) ne l'est **pas**. En présence de sous-dossiers, les fichiers internes sont supprimés du disque sans qu'il soit démontré que chaque entrée de cache/association a été traitée individuellement.

**Risque :** une arborescence de dossiers purgée via `purgeFolder` peut laisser des entrées orphelines dans LanceDB et la base SQL pour les fichiers situés dans des sous-dossiers.

**Action recommandée :**
- Implémenter un parcours récursif dans la phase de purge des index avant la suppression physique
- Tester avec une arborescence imbriquée : vérifier séparément que les namespaces/vecteurs, mappings SQL et fichiers de cache sont tous supprimés
- Ne pas utiliser `purgeFolder` pour du nettoyage automatisé tant que ce comportement n'est pas corrigé et validé
- Ne pas supposer que la suppression physique d'un fichier supprime ses index

---

## Registre des vérifications au 21 octobre 2026

| Point de vérification | Source de preuve | État |
|---|---|---|
| `validApiKey` vérifie l'existence de la clé | Code installé lu intégralement (30 lignes) | Confirmé ✅ |
| Association clé → utilisateur ou workspace | Non visible dans le middleware examiné | Non démontrée — ne pas supposer l'isolation |
| `GET /v1/workspaces` et `/v1/documents` retournent tout | Appels empiriques antérieurs | Résultats globaux observés ✅ |
| `vector-search` retourne `source.text` | Code installé inspecté (lignes 899–1032) | Confirmé dans le code ; fuite inter-utilisateur non testée |
| Pas de protections API dans `Workspace.getWithUser` / `whereWithUser` | Code inspecté — ces méthodes absentes des routes API | Confirmé ✅ |
| Création/suppression d'utilisateurs par clé API | Inspection statique des routes admin + SECURITY.md | Developer API = admin par conception ; comportement intentionnel |
| Fichiers générés partagés sans propriétaire visible | Inspection statique de route documentaire | Risque plausible — non testé |
| `WORKSPACE_DELETION_PROTECTION` absente | Environnement inspecté | Protection inactive ⚠️ — action requise (voir ALLM-10) |
| Pas de contrôle global de rôle au montage API | Extraits de `server/index.js` | Confirmé dans les extraits — inspection partielle |
| Route `env-dump` sans `[validApiKey]` | Code installé `system/index.js` ligne 16 | Confirmé ✅ — voir ALLM-12 |
| `dumpENV()` écrit `.env` sans retourner les secrets | Code installé `updateENV.js` fonction `dumpENV()` | Confirmé ✅ — réponse HTTP 200 uniquement |
| Pipeline d'import : vecteurs avant SQL, pas de compensation | Code installé `documents.js` `addDocuments` | Confirmé — compensation non visible |
| Clé de cache vectoriel dérivée du chemin | Code installé `files/index.js` + lance `index.js` | Confirmé ✅ |
| `purgeFolder` : purge index non récursive | Code installé `purgeDocument.js` | Confirmé ✅ |
| Developer API keys = accès admin par conception | SECURITY.md officiel v1.17.0 | Confirmé ✅ |
| Correctifs appliqués | Aucun | Aucun |

**Règle de sécurité jusqu'à nouvel avis :** pas d'import n8n ni d'opérations d'administration via l'API sur les données réelles avant correction et validation dans un environnement isolé. Ne stocker aucun secret dans ce journal.

---

## Plan de test consolidé — avant d'activer n8n

| ID test | Scénario | Résultat attendu | Exécuté ? |
|---|---|---|---|
| SEC-01 | `GET /api/v1/system/env-dump` sans clé | Refus HTTP ; aucun fichier `.env` écrit/modifié | Non |
| SEC-02 | Clé Developer API invalide sur routes protégées | Refus HTTP ; aucun effet secondaire | Non |
| SEC-03 | Passerelle n8n vers workspace allowlisté | Opération minimale autorisée et vérifiable | Non |
| SEC-04 | Même passerelle vers workspace non autorisé | Refus avant toute écriture | Non |
| SEC-05 | Tentative de suppression/déplacement par passerelle | Refus sauf permission explicitement accordée | Non |
| RAG-01 | Import d'un nouveau fichier | Succès vérifié dans source, SQL, mapping vectoriel et vecteurs | Non |
| RAG-02 | Même fichier importé deux fois | Comportement idempotent, pas de double association/vecteur | Non |
| RAG-03 | Fichier modifié au même chemin | Chunks conformes au nouveau contenu, aucun cache périmé | Non |
| RAG-04 | Échec embedding | Réponse d'échec fiable, pas de faux `success: true` | Non |
| RAG-05 | Échec SQL après insertion LanceDB | Compensation ou réconciliation traçable | Non |
| RAG-06 | Suppression d'un document avec mapping | Association, cache et vecteurs supprimés comme prévu | Non |
| RAG-07 | Dossier avec sous-dossiers purgé | Aucun index/cache/association abandonné | Non |
| RAG-08 | Modification du modèle d'embedding | Réindexation cohérente ; aucune action sur production | Non |
| OPS-01 | État des volumes et sauvegarde | Sauvegarde produite puis restauration d'essai vérifiée | Non |

Aucun test de cette table n'a été exécuté. Il s'agit d'un protocole de test préparatoire.

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

## État des vérifications en attente au 21 octobre 2026

- **OWUI-02 :** confirmer l'indexation du PDF OCR dans `Corpus-AI-test` et la réponse attendue sur la date du prochain contrôle de l'extincteur (9 janvier 2027, numéro 7731-KP).
- **OWUI-04 :** vérifier si la clé API Open WebUI temporaire a bien été révoquée.
- **ALLM-04 / ALLM-10 :** activer `WORKSPACE_DELETION_PROTECTION=1` dans `anythingllm.env` au prochain redémarrage planifié ; vérifier avec un `DELETE` que le 403 est bien retourné.
- **ALLM-04 :** vérifier dans Open WebUI et les logs Docker si la clé `Import-Corpus-IA` est utilisée avant toute décision de révocation.
- **ALLM-07 / ALLM-14 :** tester le comportement d'un réimport, d'un échec SQL après insertion vectorielle et le nettoyage des orphelins dans un espace isolé.
- **ALLM-08 :** valider en instance isolée si une clé Developer API peut créer ou supprimer des comptes utilisateur (attendu : oui, par conception).
- **ALLM-09 :** valider en instance isolée l'accès inter-utilisateur aux routes documentaires et aux fichiers générés.
- **ALLM-12 :** décider de l'action sur la route `env-dump` (ajouter `[validApiKey]`, désactiver, ou documenter comme risque accepté avec Tailscale comme unique contrôle) ; tester dans une branche ou instance de test.
- **ALLM-13 :** concevoir et valider la passerelle d'import dédiée pour n8n (allowlist workspace, opérations limitées, journalisation).
- **ALLM-15 :** tester le comportement du cache vectoriel sur réimport de même chemin avec contenu modifié dans un espace isolé.
- **ALLM-16 :** tester `purgeFolder` avec une arborescence imbriquée ; vérifier que les index ne sont pas abandonnés.
- **GIT-01 :** résoudre le refus d'écriture du connecteur GitHub avant d'utiliser ce dépôt comme cible de publication automatique.
- **Plan de test SEC/RAG/OPS :** aucun des 14 tests du plan consolidé n'a été exécuté — à planifier en instance isolée avant tout déploiement n8n.

*Clos depuis la version précédente :*
- ~~**ALLM-06 :** identifier le chemin source du fichier de cache observé~~ → `5d8cac14-….json` = cache de `06_volunteer_day_notice_2026-11_ZH.txt` ✅

*Rouvert et réévalué :*
- **ALLM-04** : rouvert en v0.3 — la conclusion du 15 octobre ("contenu non exposé") était incomplète. La route `POST /v1/workspace/:slug/vector-search` retourne le texte brut des fragments. Niveau de risque relevé à 🔴.
- **ALLM-08 / ALLM-13** : nuancés en v0.5 — le comportement admin des clés Developer API est intentionnel et documenté dans SECURITY.md v1.17.0.

---

*Dernière mise à jour : 21 octobre 2026*  
*Version 0.5 : intégration ALLM-12 (route env-dump sans auth — P0, confirmé dans le code installé), ALLM-13 (clés Developer API intentionnellement admin par SECURITY.md), ALLM-14 (pipeline import sans transaction atomique LanceDB/SQL), ALLM-15 (cache vectoriel par chemin, pas par contenu), ALLM-16 (purge dossier : index non récursif) ; ajout du plan de test consolidé SEC/RAG/OPS ; registre des vérifications et table des actions en attente mis à jour. Base : v0.4 (ALLM-08 à ALLM-11 + ALLM-04 🔴).*
