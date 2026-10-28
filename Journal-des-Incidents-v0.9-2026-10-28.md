# Journal des Incidents — Serveur IA Mac mini + Synology

*Version 0.9 — 28 octobre 2026*

Format de chaque entrée :
- **Symptôme** : ce qui a été observé
- **Cause vérifiée** (ou hypothèse si non démontrée)
- **Solution validée**
- **Test de validation**
- **Précautions pour la prochaine fois**

## Lecture de cette version (0.9)

**Sources de preuve (légende utilisée dans ce document) :**
- **[C17]** code amont, tag `v1.17.0` (commit `fa7ec877f005a21ede94888b3b8618b700343857`), relu en lecture seule le 25/10/2026.
- **[CM]** code amont, branche principale, commit `a5bb8b9c7b1262635ea58fc17d4899619cbf58e9` (23/10/2026 ; `package.json` = 1.19.0). Aucun tag `v1.19.0` n'existe (dernier tag : `v1.18.0`, vérifié le 25/10/2026). Ce n'est **pas** une preuve du contenu de l'image exécutée.
- **[IMG]** relevé sur l'image active 1.19.0 (`sha256:ddf73304a4a96e2f90755d620dd3921de9afb4b8b8e914fa62d6ce7944ba95af`) rapporté par la passation du 25/10/2026 ; **non revérifié** par Claude, qui n'a pas accès à minimac.
- **[VAL]** conclusion validée par Florian le 25/10/2026 à 21:37 ; reprise telle quelle, sans nouvelle vérification.
- **[PROD]** relevé sur la production (minimac) rapporté par le bilan ChatGPT du 28/10/2026 pour le changement du 27/10/2026 ; **non revérifié** par Claude.
- **[LAB]** test ciblé exécuté dans le conteneur `anythingllm-fixlab` (Node.js et mocks) et rapporté par le même bilan ; ni les correctifs de laboratoire ni les sorties de test n'ont été relus par Claude. Ce n'est ni un test HTTP de bout en bout, ni un déploiement.
- **[TEST]** résultat d'un test exécuté **et constaté par la session qui rédige ces documents**. À ce jour : **aucun**. Les tests de laboratoire rapportés portent l'étiquette [LAB] ; l'état réel du laboratoire (conteneur démarré ou non) n'est pas connu de cette session.

Les numéros de ligne sont donnés pour la référence indiquée ([C17] ou [CM]). Les lignes relevées sur l'image ([IMG]) sont approximatives (« ≈ »).

**Numérotation canonique.** `CP-3` désigne le correctif d'authentification des routes `env-dump` (ALLM-12). La limite de corps `EMBED_BODY_LIMIT` sur `/api/embed` relève de `DOS-02`. La passation du 25/10 (matin) appelait à tort « CP-3 » cette limite de corps ; la numérotation du dépôt est conservée. `ALLM-06` (constat initial du 11-15 octobre) et `ALLM-15` (analyse de code du 20-21 octobre) décrivent le **même** risque de cache vectoriel ; `ALLM-06` est l'identifiant de suivi.

**Portée de « code installé ».** Les entrées antérieures au 25/10/2026 qui citent le « code installé » portent sur l'ancienne image (code relu comme v1.17.0), retirée le 25/10/2026 lors du passage en 1.19.0 ; elles ne sont pas réécrites. Les corrections sont signalées par « Mise à jour du 25/10 ».

**Conclusions validées par Florian le 25/10/2026 à 21:37 [VAL] (reprises sans les redécouvrir) :**
1. *ALLM-12.* Dans l'image installée et auditée, les routes `env-dump` ne comportent intentionnellement pas `validApiKey`. `dumpENV()` écrit `/app/server/.env` **à l'intérieur du conteneur** ; il ne modifie pas directement le `.env` de l'hôte ni le fichier Compose. CP-3 n'est **pas** appliqué automatiquement : toute modification suppose une analyse de ses conséquences et une autorisation explicite. Le comportement constaté dans l'image installée se distingue des éventuelles différences avec le dépôt amont.
2. *ALLM-10.* La protection de suppression dépend de la présence de `WORKSPACE_DELETION_PROTECTION`. Elle ne doit pas être déclarée active sans vérification de la valeur effective et du chemin de code ; toute conclusion cite fichiers et routes et distingue le code de la configuration déployée.
3. *ALLM-06.* Le cache vectoriel est associé au chemin du fichier (`uuidv5(filename, uuidv5.URL)`). Si le contenu change sans que le chemin change, des données périmées peuvent subsister. Le risque reste **ouvert** ; il ne sera pas déclaré résolu sans correction vérifiée et tests reproductibles.
4. *n8n.* Aucune clé API générale d'AnythingLLM n'est exposée directement à n8n ; une passerelle dédiée contrôle explicitement routes et opérations par liste blanche, sans supposer qu'une clé valide limite les droits à un utilisateur ou à un espace de travail.
5. *Règles.* Ni la production ni ses données/configuration ne sont modifiées, rien n'est publié sur GitHub, aucun test mutatif n'est exécuté sur les routes de production sans autorisation explicite ; les tests se font en laboratoire isolé, après vérification que le conteneur de laboratoire est effectivement démarré.

**INT-17 à INT-20, UPLOAD-02, RACE-01 : inchangés, pas de nouveau constat.** Entre v1.17.0 et [CM], `server/endpoints/api/document/index.js` ne diffère que par la propagation du résultat d'upload (hunks l.163-165, 315-322, 471-505, 637-652) ; `server/endpoints/document.js`, `server/utils/files/purgeDocument.js` et `server/utils/files/multer.js` sont identiques. Références [C17] : `move-files` API l.1081 (`isWithin` l.1138-1139, `fs.rename` l.1143, `Promise.all` l.1153 ; aucun `lstat`, `isFile` ni test d'existence de la destination dans l.1081-1180) et web `document.js` l.45 (`isWithin` l.64-65, `rename` l.69, `Promise.all` l.80) ; `remove-folder` API l.1022 (`purgeFolder` l.1066, réponse 200 l.1068) et web `system.js` l.492 (`purgeFolder` l.497, `sendStatus(200)` l.498) ; `create-folder` API l.956. En [CM] les mêmes routes sont décalées de +15 lignes (`create-folder` l.971, `remove-folder` l.1037, `move-files` l.1096).

### Mise à jour du 28/10/2026 (bilan ChatGPT)

**Bilan ChatGPT du 28/10/2026, intégré tel que rapporté (aucune de ces données n'a été revérifiée par Claude, qui n'a accès ni à minimac ni au laboratoire).**

#### Faits rapportés sur la production [PROD]

- Version réelle 1.19.0, image `sha256:ddf73304a4a96e2f90755d620dd3921de9afb4b8b8e914fa62d6ce7944ba95af`. Conteneur `anythingllm`, port publié 3001, volume `anythingllm:/app/server/storage`, politique de redémarrage `unless-stopped`. Fichiers : `~/services/ai-stack/compose.yaml` et `~/services/ai-stack/anythingllm.env`.
- Montages NAS conservés en lecture seule : `/Users/florian/IA/Corpus-IA:/mnt/nas-corpus:ro` et `/Users/florian/NAS-Home-Test/Travail:/mnt/florian-travail:ro`.
- **ALLM-10 activé en production le 27/10/2026.** Sauvegarde préalable : `~/services/ai-stack/backup-allm10-20261027-170318` (`compose.yaml` et `anythingllm.env`, comparés aux originaux). Deux modifications de `compose.yaml`, confirmées par `diff` avec la sauvegarde : (1) `DEPLOYMENT_VERSION` `1.17.0` → `1.19.0` (alignement de la déclaration sur la version réelle) ; (2) ajout de `WORKSPACE_DELETION_PROTECTION=true`. Recréation : `docker compose up -d --no-deps --force-recreate anythingllm`.
- Constats après recréation : conteneur `running` ; version réelle 1.19.0 ; variable effective `WORKSPACE_DELETION_PROTECTION=true` ; HTTP 200 sur `127.0.0.1:3001/` ; port, volume, montages NAS et politique de redémarrage inchangés ; test direct non destructif du middleware : réponse 403 et `next()` non appelé (**test unitaire**).
- Aucune suppression réelle de workspace n'a été effectuée.

#### Tests de laboratoire rapportés [LAB] (conteneur `anythingllm-fixlab`, Node.js et mocks)

- **INT-18 (déplacement)** : déplacement normal PASS ; collision avec une destination existante → erreur attendue ; noms de destination en double rejetés avant tout déplacement, sources conservées ; source manquante rejetée, aucune cible créée. Le correctif prévalide sources, doublons et collisions avant de déplacer.
- **INT-20 / PUR-02 (purge et suppression de dossier)** : purge récursive conforme ; dossier supprimé après succès et conservé après erreur simulée ; entrée symbolique rejetée (`UNSUPPORTED_FOLDER_ENTRY`) ; échec simulé de `Document.removeDocuments` propagé ; validations : nom vide → 400 `INVALID_FOLDER_NAME`, `../outside` → 400 `INVALID_FOLDER_PATH`, `custom-documents` → 403 `FOLDER_PROTECTED`, dossier absent → 404 `FOLDER_NOT_FOUND` ; contrôles de syntaxe Node réussis. Routes examinées : `DELETE /v1/document/remove-folder` (`validApiKey`) et `DELETE /system/remove-folder` (authentification et rôles).
- Fichiers modifiés dans le laboratoire : `/app/server/utils/files/index.js`, `/app/server/utils/files/purgeDocument.js`, `/app/server/endpoints/api/document/index.js`, `/app/server/endpoints/system.js`.
- Le laboratoire n'a ni port publié ni montage de production ; sa commande `sleep 3600` peut l'arrêter automatiquement.

#### Ce qui n'est PAS établi (limites de preuve)

- ALLM-10 : le test HTTP authentifié de **chaque** route (`DELETE /workspace/:slug`, `DELETE /v1/workspace/:slug`, `DELETE /admin/workspaces/:id`) n'a pas été fait ; OPS-02 reste à exécuter en laboratoire. Le test unitaire du middleware ne remplace pas un test HTTP.
- INT-18 et INT-20/PUR-02 : **ni validés, ni déployés**. Tests par mocks, sans test HTTP de bout en bout, sans vraie panne LanceDB/SQL, sans contrôle de l'état SQL/`DocumentVectors`/LanceDB/cache. Le déplacement n'est pas atomique : une erreur d'E/S réelle pendant la phase de déplacement peut laisser un état partiel. Certaines erreurs SQL de nettoyage peuvent être absorbées par le code existant. INT-18C (concurrence), INT-17, INT-19B (élément invalide au milieu d'un lot), sources répétées et conflits internes d'INT-19C ne sont pas couverts par le bilan. L'image de base du laboratoire n'est pas précisée : à comparer à l'ID de production avant de tirer une conclusion.
- Le code des correctifs de laboratoire n'a pas été relu par Claude ; il n'est pas dans le dépôt documentaire.

#### Hypothèses

- Le bilan indique que la variable a été ajoutée à `compose.yaml` ; il ne précise pas si c'est dans `environment:` ou via `env_file`. Hypothèse : `environment:` de `compose.yaml` (`anythingllm.env` inchangé, mais sauvegardé). La valeur effective dans le processus, elle, est rapportée comme vérifiée.
- L'effet fonctionnel de `DEPLOYMENT_VERSION` (déclaration seulement ?) n'a pas été examiné.

#### Risques résiduels

- Toute suppression légitime de workspace est bloquée, y compris depuis l'interface d'administration, tant que la variable est présente (retour arrière : retirer la variable de `compose.yaml` puis recréer le service, à partir de la sauvegarde `backup-allm10-20261027-170318`).
- La protection ne couvre ni `remove-documents`, ni `remove-folder`, ni `move-files` : ALLM-05, INT-17 à INT-20 restent entiers en production.
- Les correctifs de laboratoire n'existent que dans un conteneur éphémère : perte possible si le conteneur est supprimé ou recréé ; non reproductibles tant qu'ils ne sont pas exportés.
- ALLM-12 (D1) et ALLM-06 (D7) : inchangés, ouverts.

#### Décisions

- **D4** : la protection est **activée** (27/10/2026, valeur `true`) ; elle remplace l'état « désactivée, décision à prendre » des documents du 25/10. La décision a été prise hors de cette session ; elle est consignée telle que rapportée.
- **D6** : INT-18 et INT-20/PUR-02 passent de « inchangés, non testés » à « corrigés en laboratoire seulement, non validés, non déployés ».
- **D1, D2, D3, D5, D7** : inchangées.

#### Vérifications restantes (lecture seule d'abord ; aucune ne modifie la production)

1. Exporter les correctifs de laboratoire avant tout arrêt du laboratoire (`docker diff anythingllm-fixlab`, `docker cp` des quatre fichiers modifiés vers un dossier hôte, SHA-256 consignés).
2. Vérifier que `anythingllm-fixlab` est démarré (`docker ps --filter name=anythingllm-fixlab`) et comparer son image à celle de la production (`docker inspect anythingllm-fixlab --format '{{.Config.Image}} {{.Image}}'`).
3. Confirmer que `WORKSPACE_DELETION_PROTECTION` figure dans `compose.yaml` et non dans `anythingllm.env` (`grep -c` sur le nom de la variable, sans afficher les autres lignes).
4. OPS-02 en laboratoire (trois routes, valeur `true`, `1` puis `0`).
5. Tests HTTP de bout en bout et contrôle SQL/`DocumentVectors`/LanceDB/cache pour INT-18, INT-20 et PUR-01/02 ; INT-18C et INT-19B/C complémentaires.
6. ALLM-12 : protocole de lecture seule puis laboratoire décrit dans le Plan v0.6, §2.7.

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
**Statut :** 🔴 Risque confirmé — accès admin non scopé, exposition de contenu démontrée dans le code. *Qualification du 25/10 : comportement intentionnel (`SECURITY.md` v1.17.0 l.49-53), risque de gouvernance des clés et non élévation de privilèges ; constat déjà établi, à ne pas présenter comme nouveau.*

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

**Mise à jour du 25/10 [VAL] :** ne pas exposer directement à n8n une clé API générale ; la passerelle dédiée contrôle explicitement routes et opérations par liste blanche, sans supposer qu'une clé valide limite les droits à un utilisateur ou à un workspace.

**Routes prioritaires non encore auditées :**
- `POST /v1/document/upload` et `GET /v1/document/:docName`
- Routes `/v1/workspace/:slug/thread/*`
- Routes `GET /v1/admin/users`, `GET /v1/admin/workspace-chats`, `POST /v1/admin/workspaces/:id/update-users`

**Action (révisée le 28/10) :**
La protection `WORKSPACE_DELETION_PROTECTION` a été activée le 27/10/2026 [PROD] (voir ALLM-10 et D4 du Plan v0.6) ; test unitaire seulement, OPS-02 à faire.

**Règles de conception pour n8n — décision D2 retenue (24 oct 2026) :**  
Option A : passerelle dédiée. La clé Developer API générale ne sera pas transmise à n8n. La passerelle :
- Détient la clé admin sans la transmettre à l'appelant
- Impose une allowlist de slugs configurée côté serveur, jamais fournie par l'appelant
- Limite le premier périmètre à l'import documentaire
- Refuse par défaut si la clé dédiée ou l'allowlist manque
- Journalise cible, fichier, résultat et horodatage, sans clé ni en-tête `Authorization`

**Précautions :**
- Ne pas créer de comptes Kostia et chhsu dans AnythingLLM avant validation de l'architecture des workspaces
- Aucun import n8n avant validation de la passerelle (D2) ; la passerelle n'expose aucune route de suppression (la protection de suppression, si elle est activée, est une défense en profondeur — décision D4 à prendre)
- Traiter la clé `Import-Corpus-IA` comme un accès admin à l'instance entière
- Vérifier dans Open WebUI et dans les logs Docker si cette clé est utilisée avant toute révocation
- Ne jamais exposer la clé à un utilisateur final ni la faire transiter par une interface

---

## ALLM-05 — La fonction purgeDocument a une portée globale

**Date :** 12-13 octobre 2026 ; revu le 25 octobre 2026
**Statut :** ⚠️ Portée destructive globale confirmée dans le code ; pas de vulnérabilité autonome démontrée ; aucun incident de suppression constaté

**Symptôme / risque :**
Une future synchronisation NAS pourrait être tentée de supprimer les vecteurs d'un document lorsqu'un fichier source disparaît. Or, le helper `purgeDocument(filename)` n'est pas limité à un seul espace de travail.

**Cause vérifiée :**
[C17] `/app/server/utils/files/purgeDocument.js` l.13-20 : retour si le nom est absent ou si `normalizePath(filename)` est invalide (l.14) ; `purgeVectorCache(filename)` (l.16) ; `purgeSourceDocument(filename)` (l.17) ; puis, pour **chaque** workspace, `Document.removeDocuments(workspace, [filename])` (l.20). La route Developer API `DELETE /v1/system/remove-documents` (`server/endpoints/api/system/index.js` l.218 ; l.220 en [CM]) est protégée par `validApiKey` et appelle `purgeDocument(name)` pour chaque nom (l.272).

**Qualification (25/10) :**
La portée globale est un fait établi ; elle représente un risque opérationnel si une clé très privilégiée est utilisée par un workflow insuffisamment contrôlé ou si les noms transmis ne sont pas autorisés. `SECURITY.md` v1.17.0 (l.49-53) décrit les Developer API keys comme des identifiants système équivalents administrateur : l'absence d'autorisation par workspace dans `validApiKey` n'est donc pas, à elle seule, une élévation de privilèges. Ne pas présenter ALLM-05 comme une vulnérabilité indépendante de ce modèle.

**Solution :**
Aucune suppression automatisée n'a été mise en place. Ne pas relier directement une suppression de fichier sur le NAS à `purgeDocument` sans mécanisme de portée et de validation approprié.

**Test de validation :**
Le parcours a été inspecté dans le code. Aucun test destructif n'a été effectué et aucune suppression accidentelle n'a été signalée.

**Précautions :**
- Traiter les clés Developer API comme des secrets hautement privilégiés ; ne pas les distribuer à des workflows non fiables.
- La passerelle n8n n'expose pas `remove-documents` (D2).
- Ne pas révoquer `Import-Corpus-IA` avant inventaire des workflows qui pourraient l'utiliser (D3).
- Toute suppression doit être limitée explicitement à l'espace de travail visé ; prévoir une simulation (« dry run »), des journaux et une sauvegarde avant toute opération de purge.
- Traiter les suppressions NAS comme un cas séparé de l'ajout ou de la mise à jour des documents.

---

## ALLM-06 — Cache vectoriel indexé par chemin : risque de contenu périmé (ouvert)

**Date :** 11-15 octobre 2026 ; analyse de code 20-21 octobre (ALLM-15) ; revu le 25 octobre 2026
**Statut :** ⚠️ **Ouvert** [VAL] — mécanisme prouvé dans le code ; impact conditionnel ; non reproduit ; aucune correction appliquée. *(Le statut « ✅ mécanisme compris » de la v0.7 ne signifiait pas « résolu » et est remplacé.)*

**Qualification retenue [VAL] :**
« Risque de réutilisation de vecteurs obsolètes lorsque le contenu change sous un chemin constant et que le cache n'a pas été invalidé. Le mécanisme est prouvé dans le code ; l'impact dépend du parcours d'import et de l'état du cache. »

**Faits démontrés par le code ([C17] et [CM] : fichiers identiques) :**
- `/app/server/utils/files/index.js` : `cachedVectorInformation` l.271 (clé `uuidv5(filename, uuidv5.URL)` l.274), `storeVectorResult` l.290 (l.297), `purgeVectorCache` l.321 (l.323). La lecture du cache vérifie son existence et lit ses chunks ; aucune empreinte de contenu, date de modification ni version n'est comparée.
- `/app/server/utils/vectorDbProviders/lance/index.js` : `addDocumentToNamespace` l.312, `skipCache = false` l.316, `if (!skipCache)` l.324 puis `cachedVectorInformation(fullFilePath)` l.325 : les chunks du cache sont rechargés et insérés sans recalcul à partir du `pageContent` courant.
- `skipCache` non fourni (donc `false`) : `server/jobs/embedding-worker.js` l.108-112 ; `server/models/documents.js` l.137 [C17] / l.157 [CM]. Synchronisation surveillée : le document principal passe `true` ([C17] `server/jobs/sync-watched-documents.js` l.138-147 ; [CM] `reembedDocument` l.97-113, appel l.171-177) ; les références du même document dans d'autres workspaces omettent l'argument ([C17] l.185-193 ; [CM] l.203-208) et réutilisent le cache actualisé.
- `purgeVectorCache` n'est appelée (hors tests) que par `purgeDocument.js` l.16 et `purgeFolder` l.68 : **retirer un document d'un workspace ne purge pas son cache**. Cette recherche ne prouve pas qu'aucune autre opération indirecte n'invalide le cache.

**Précision de portée [C17] (lecture de code, non testée) :**
Chaque conversion du Collector écrit un nouveau fichier `custom-documents/<nom-slugifié>-<identifiant>.json` (`collector/processSingleFile/convert/asTxt.js` l.36 `id: v4()` et l.51 ; `asPDF/index.js` l.57 et l.78 ; `asDocx`, `asEPub`, `asImage`, `asMbox`, `asOfficeMime`, `asAudio`, `asXlsx` : même motif ; `collector/utils/files/index.js` l.120-152). Le ré-upload d'un fichier NAS modifié obtient donc normalement un **nouveau chemin**, donc une nouvelle clé de cache. Le scénario « même chemin, contenu différent » concerne surtout le ré-embedding d'un JSON existant (JSON modifié en place puis retiré et rajouté au workspace ; ajout du même JSON à un autre workspace ; synchronisation). Cela peut réduire l'exposition du flux d'import ordinaire ; cela ne clôt pas le risque.

**Identification du fichier cache (15 oct 2026) :**
Le fichier `5d8cac14-8cf5-5c28-964b-c70d2dae2fdb.json` correspond au cache de `06_volunteer_day_notice_2026-11_ZH.txt`. ✅ Le fichier actuel correspond à l'état actuel du document.

**Limites de la preuve (non démontré) :** que tous les réimports soient affectés ; qu'un import standard rencontre un cache préexistant ; que toutes les voies d'invalidation aient été examinées ; qu'un défaut observable ait été reproduit sur des données de production.

**Tests :** aucun. À exécuter en laboratoire : RAG-03A (ré-upload d'un fichier modifié) et RAG-03B (JSON modifié en place, retiré puis rajouté).

**Risque résiduel :** vecteurs d'un ancien contenu servis pour un chemin réutilisé ; caches orphelins qui s'accumulent.

**Décision [VAL] :** ne pas classer ALLM-06 comme corrigé ni le clore, et ne pas déclarer que tous les imports produisent des vecteurs obsolètes. Prochaine étape : revue des tests automatisés amont et des parcours d'import, puis test de régression isolé. Toute correction est évaluée et validée hors production.

**Précautions :**
- Si un JSON de document est modifié en place sous le même chemin, supprimer explicitement le cache (par une purge du document) avant réindexation.
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

## ALLM-10 — Protection de suppression de workspace : activée en production le 27/10/2026, partiellement vérifiée

**Date de constat :** 20 octobre 2026 ; activée le 27 octobre 2026 ; revu le 28 octobre 2026
**Statut :** ✅ Activée en production (`WORKSPACE_DELETION_PROTECTION=true`, variable effective dans le processus) [PROD] ; ⚠️ test unitaire du middleware seulement, **aucun test HTTP authentifié des trois routes** ; pas une vulnérabilité confirmée. *(La v0.8 la décrivait « disponible, désactivée, décision à prendre » : remplacé.)*

**Faits démontrés par le code :**
[C17][CM] `server/utils/middleware/workspaceDeletionProtection.js` (18 lignes) : `if (!("WORKSPACE_DELETION_PROTECTION" in process.env)) return next();` (l.9), sinon HTTP 403 `{ "success": false, "error": "Workspace deletion is blocked by the system administrator." }` (l.10-13). Active dès que la variable est **présente, quelle que soit sa valeur** (`true`, `0` ou vide). Montée sur trois routes : `DELETE /admin/workspaces/:id` (`server/endpoints/admin.js` l.300), `DELETE /workspace/:slug` (`server/endpoints/workspaces.js` l.302 ; l.303 en [CM]) et `DELETE /v1/workspace/:slug` (`server/endpoints/api/workspace/index.js` l.230). Elle bloque aussi la suppression depuis l'interface d'administration.

**Configuration déployée [PROD] (27/10/2026) :**
Sauvegarde préalable `~/services/ai-stack/backup-allm10-20261027-170318` (`compose.yaml`, `anythingllm.env`, comparés aux originaux). Deux changements de `compose.yaml`, seuls constatés par `diff` : `DEPLOYMENT_VERSION` 1.17.0 → 1.19.0 ; ajout de `WORKSPACE_DELETION_PROTECTION=true`. Recréation par `docker compose up -d --no-deps --force-recreate anythingllm`. Après recréation : conteneur `running`, version 1.19.0, variable effective, HTTP 200 sur `127.0.0.1:3001/`, port, volume, montages NAS (lecture seule) et politique de redémarrage conservés.

**Test de validation :**
Test direct non destructif du middleware en production : réponse 403, `next()` non appelé — **test unitaire**, qui ne remplace pas un test HTTP authentifié de chaque route. Aucune suppression réelle effectuée. OPS-02 en laboratoire reste à faire (trois routes ; `true`, `1` puis `0`).

**Limites :** ne couvre ni `remove-documents`, ni `remove-folder`, ni `move-files`. Le bilan ne précise pas si la variable est dans `environment:` de `compose.yaml` ou via `env_file` (hypothèse : `environment:`).

**Risque résiduel :** suppressions légitimes de workspace bloquées jusqu'au retrait de la variable et à la recréation du service (retour arrière : sauvegarde du 27/10). La décision d'activer a été prise hors de cette session ; consignée telle que rapportée.

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

**Date de constat :** 20-21 octobre 2026 ; reclassifié 23 octobre 2026 ; décision D1 du 24 octobre 2026 **remplacée** le 25 octobre 2026
**Statut :** ⚠️ Comportement intentionnel selon l'amont et selon la conclusion validée [VAL] ; CP-3 préparé, **non appliqué automatiquement**, non déployé ; point **non clos** (analyse des conséquences à faire, image 1.19.0 à revérifier)

---

### Constat initial — checkout source v1.17.0 (session du 20-21 octobre ; non conservé)

Fichier du checkout source (et non de l'image installée) : `/home/claude/anything-llm-src/server/endpoints/api/system/index.js`, ligne 16 :

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
- ~~AnythingLLM accessible uniquement via Tailscale~~ — **non démontré** (mise à jour du 25/10) : le port 3001 est publié sur l'hôte et le garde-fou « LAN direct » interdit une liaison à `127.0.0.1` ; la surface réelle (LAN, tailnet) est à confirmer par `docker port anythingllm`
- Réponse HTTP sans contenu secret ✅
- Secrets en mémoire (`process.env`) non modifiés ✅

---

### Ambiguïté documentée — 23 octobre 2026

Un examen de la branche principale du dépôt (postérieure à v1.17.0) révèle un commentaire explicite dans le code indiquant que la route `/v1/system/env-dump` est **intentionnellement non authentifiée**. Cela crée une ambiguïté avec le comportement documenté dans `openapi.json` de v1.17.0, qui décrit une réponse `403 InvalidAPIKey` — suggérant que l'authentification était prévue dans cette version.

**Tension non résolue :**
- `openapi.json` v1.17.0 : documente `403 InvalidAPIKey` → auth *prévue*
- Commentaire branche principale : route explicitement *sans* auth par intention
- Comportement observé : aucune auth locale dans v1.17.0 et v1.18.0

---

### Conclusions validées — 25 octobre 2026 (D1 révisée)

**Faits [VAL] :** dans l'image installée et auditée, les routes `env-dump` ne comportent intentionnellement pas `validApiKey` ; `dumpENV()` écrit `/app/server/.env` à l'intérieur du conteneur et ne modifie pas directement le `.env` de l'hôte ni le fichier Compose. CP-3 n'est pas appliqué automatiquement.

**Faits complémentaires lus dans le code amont :**
- [C17] aucun middleware sur `GET /v1/system/env-dump` (`server/endpoints/api/system/index.js` l.16) ni sur `GET /env-dump` (`server/endpoints/system.js` l.91) ; hors production : 200 sans effet ; en production : `dumpENV()` puis 200 sans corps. `openapi.json` l.2627 annonce un 403 que le code ne produit pas. `SECURITY.md` v1.17.0 (59 lignes) ne mentionne pas `env-dump`.
- [CM] commentaire « Intentionally unauthenticated so deploy/shutdown scripts can flush in-memory config to .env » (`api/system/index.js` l.16-17 ; `system.js` l.92-93) et rubrique « Reports about `env-dump` endpoints being unauthenticated » de `SECURITY.md` (l.65-76). C'est l'intention **actuelle** des mainteneurs, pas une preuve de leur intention à v1.17.0.
- [C17][CM] seul appelant trouvé dans le dépôt amont : `BARE_METAL.md` l.84 ; `docker/docker-entrypoint.sh` n'appelle pas `env-dump`.
- [C17] `dumpENV()` : `server/utils/helpers/updateENV.js` l.1537 ; [CM] écriture `fs.writeFileSync(envPath, …, { flag: "w" })` l.1718 à partir des seules clés listées dont la valeur est non vide dans `process.env` : commentaires et autres lignes du `.env` du conteneur ne sont pas conservés.

**Hypothèses et limites :** l'image 1.19.0 n'est pas revérifiée par Claude ; CP-3 (SHA-256 `b27d886c…`) n'est pas rebasé sur 1.19.0 (`system.js` et `api/system/index.js` ont changé en amont) ; que `/app/server/.env` ne soit pas un point de montage de l'hôte est supposé par la conclusion validée (SEC-10 le confirme).

**Tests :** aucun.

**Options (aucune n'est exécutée) :** A. CP-3 rebasé — patch local à refaire à chaque mise à jour de l'image `latest`, écart avec l'intention amont, casse les scripts sans identifiants ; B. désactiver la route (404) — même coût ; C. ne rien modifier, documenter et surveiller — alternative la moins coûteuse ; risque : tout client atteignant le port peut déclencher la réécriture du `.env` du conteneur, sans lecture de données ni changement de la configuration en mémoire.

**Risque résiduel :** impact faible, route non authentifiée.

**Décision à prendre (Florian)** : A, B ou C, après SEC-01 et SEC-10 en laboratoire et autorisation explicite. **Vérifications restantes** (lecture seule) : `grep -n "env-dump\|validApiKey"` sur les deux fichiers de l'image ; `docker inspect anythingllm --format '{{json .Mounts}}'` ; `docker port anythingllm`.

---

### Correctifs proposés et revus

**CP-1 — Premier correctif proposé par ChatGPT (octobre 2026) :**  
Ajout de `[validApiKey]` uniquement sur la route `/api/v1/system/env-dump` dans `server/endpoints/api/system/index.js`.  
**Lacunes identifiées :** ne couvrait pas la nuance `NODE_ENV !== 'production'` ; ne couvrait pas la seconde route `/api/env-dump` dans `server/endpoints/system.js`. **Incomplet — non appliqué.**

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

### Décision D1 du 24 octobre 2026 — **remplacée le 25 octobre 2026** (conservée pour l'historique)

**[Remplacée] Décision retenue le 24/10 : Option A — appliquer CP-3, sous les conditions préalables suivantes :**

1. Vérifier l'image du conteneur en production (`docker inspect anythingllm`) et confirmer que le code correspond au commit audité `fa7ec877f005`
2. Rechercher dans les scripts et configurations effectivement utilisés les appels à `/api/env-dump` et `/v1/system/env-dump` sans authentification
3. Exécuter les tests SEC-01 à SEC-05 en environnement isolé
4. Réaliser une sauvegarde et une restauration d'essai vérifiée
5. Obtenir l'autorisation explicite de Florian

**Note pour cette installation Docker :** le script bare-metal décrit dans `BARE_METAL.md` appelle `/api/env-dump` sans authentification et pourrait recevoir 401 en mode multi-utilisateur — cette installation est Docker, le risque de compatibilité bare-metal est non bloquant mais doit rester documenté.

| Option | Action | Condition préalable |
|--------|--------|---------------------|
| **A (retenue)** | **Appliquer CP-3** | Vérifier image + dépendances scripts ; tester en isolé ; sauvegarder ; autorisation |
| B | Désactiver la route | `return response.sendStatus(404).end()` en début de handler |
| C | Accepter le risque | Documenter avec Tailscale comme unique contrôle ; surveiller les accès |

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
- ALLM-12 : voir son entrée — les routes `env-dump` sont intentionnellement sans `validApiKey` [VAL] ; ce n'est pas une exception au modèle de clés
- La clé Developer API doit être traitée comme un secret administrateur complet

**Conséquence pour n8n :**
Construire une passerelle dédiée avec allowlist de workspaces, opérations limitées et journalisation (décision D2 retenue — Option A ; reconfirmée [VAL] le 25/10). Aucune clé API générale n'est exposée à n8n ; la passerelle contrôle explicitement routes et opérations par liste blanche, sans supposer qu'une clé valide limite les droits à un utilisateur ou à un workspace. Routes à exclure : `DELETE /v1/system/remove-documents`, `DELETE /v1/document/remove-folder`, `POST /v1/document/move-files`, `POST /v1/workspace/:slug/vector-search`, `/v1/admin/*`, suppression de workspace.

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

**Mise à jour du 25/10 — différences amont, non vérifiées dans l'image 1.19.0 :**
- [C17] `server/endpoints/api/document/index.js` l.164, 316, 473, 638 : `await Document.api.uploadToWorkspace(addToWorkspaces, document.location)` sans exploiter le résultat ; `Document.addDocuments` l.83 : insertion vectorielle l.137, puis `prisma.workspace_documents.create` l.159.
- [CM] `uploadToWorkspace(wsSlugs, docLocations = [])` (`server/models/documents.js` l.372) renvoie `{ success, partial, error }` ; les routes d'upload testent `embedded.success` (api/document l.163, 317, 477, 648 : HTTP 500 en cas d'échec total, 200 avec `success: false` en cas d'échec partiel). En cas d'échec SQL (l.179), retour arrière au mieux : `VectorDb.deleteDocumentFromNamespace` (l.196) puis `DocumentVectors.delete({ docId })` (l.211), erreurs de nettoyage journalisées. Non atomique.
- **Hypothèse :** l'image 1.19.0 contient ce code (cohérent avec la référence `documents.js` l.157-161 de la passation du 25/10). **Statut :** partiellement traité en amont ; ne pas clore ; vérifier l'image puis RAG-04 et RAG-05.

---

## ALLM-15 — Cache vectoriel indexé sur le chemin source, pas le contenu

**Date de constat :** 20-21 octobre 2026  
**Statut :** ⚠️ Ouvert — identique à ALLM-06 (voir cette entrée pour la précision de portée, les faits ligne à ligne et la décision [VAL]) ; clé de cache confirmée dans le code ; comportement exact sur réimport à tester (RAG-03A, RAG-03B).

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
**Statut :** ✅ Corrigé et déployé dans l'image 1.19.0 (preuve statique [IMG], 25/10) ; ⚠️ comportement HTTP 413 non testé ; confirmé dans le code v1.17.0 et v1.18.0 (historique ci-dessous).

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
- ~~AnythingLLM accessible uniquement via Tailscale~~ — non démontré (voir ALLM-12) : surface réelle à confirmer par `docker port anythingllm`
- Nécessite un accès réseau au service

**Vérification préalable obligatoire :**  
Avant tout correctif : vérifier la présence ou l'absence de `EMBED_BODY_LIMIT` dans `/app/server/index.js` de l'image déployée (DOS-01), et vérifier l'ID et le digest de l'image pour confirmer que le code audité correspond bien au code en production.

**Action recommandée :**
- Court terme : vérifier l'image déployée (DOS-01)
- Moyen terme : appliquer une limite explicite sur `/api/embed` et réduire `FILE_LIMIT` global
- Ne pas modifier l'image de production sans planification préalable

**Sources :**
- `server/index.js` v1.17.0 : `const FILE_LIMIT = "3GB"`
- Upstream commit `c729bf480ab146063b6c9ef287182384b9b080e0`, 14 oct 2026

**Mise à jour du 25 octobre 2026 :**
- [IMG] `/app/server/index.js` de l'image 1.19.0 : `EMBED_BODY_LIMIT = "1mb"` ≈ l.54 ; limites appliquées aux routes `/api/embed` ≈ l.70-74 ; limite globale distincte de 3 Go conservée pour les autres routes (≈ l.75 et suivantes) ; réponse 413 « Request payload too large. » ≈ l.83-86. Image `sha256:ddf73304a4a96e2f90755d620dd3921de9afb4b8b8e914fa62d6ce7944ba95af`, conteneur `healthy`, HTTP 200 sur le port 3001, migrations à jour. Open WebUI et n8n n'ont pas été touchés.
- [CM] `server/index.js` : `FILE_LIMIT` l.53, `EMBED_BODY_LIMIT` l.54, `app.use("/api/embed", …)` l.70-74, parseurs globaux l.75-81, gestionnaire d'erreur l.83-90. [C17] et v1.18.0 : `FILE_LIMIT` seul (l.52, l.66-70).
- La passation du 25/10 appelait cette correction « CP-3 » à tort ; numérotation du dépôt conservée (DOS-02).
- **Tests :** aucun corps volumineux n'a été envoyé ; DOS-01 (relevé statique, rapporté) et DOS-02 (413) à rejouer en laboratoire.
- **Risque résiduel :** les autres routes restent sous la limite globale de 3 Go avant authentification.
- **Retour arrière préparé [IMG] :** `/Users/florian/services/ai-stack/backup-anythingllm-20261025-091540/` (`compose.yaml`, `ancienne-image-id.txt`, `storage-anythingllm.tar.gz`) et tag `mintplexlabs/anythingllm:rollback-20261025-091540` ; restauration non essayée (OPS-01).

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
- Tester : source répertoire, source lien symbolique (si politique définie), source fichier valide, source inexistante, chemin ambigu

**Sources :**
- `server/endpoints/api/document/index.js` — route `POST /v1/document/move-files`
- `server/endpoints/document.js` — route web de déplacement
- Dossier ChatGPT f34bd946, section 4 (MVT-01)

---

## INT-18A/B/C — Route `move-files` : écrasement et course sur la destination

**Date de constat :** 23 octobre 2026 ; scindé en sous-scénarios A/B/C le 24 octobre 2026  
**Référence dossier ChatGPT :** MVT-02  
**Type :** défaut de protection des données  
**Statut :** ⚠️ Confirmé dans le code v1.17.0 ; aucun test destructif effectué.

**Symptôme général :**  
Un déplacement vers une destination déjà occupée peut remplacer silencieusement le fichier existant, y compris si celui-ci est indexé ou référencé par AnythingLLM.

**Cause vérifiée :**  
`fs.rename()` sur une destination existante écrase sans avertissement sur les systèmes de fichiers POSIX. Aucune vérification d'existence de la destination n'est visible dans le code des routes de déplacement.

---

**État laboratoire au 28/10/2026 [LAB] :** correctif de laboratoire (prévalidation des sources, doublons et collisions avant déplacement) testé par mocks : déplacement normal PASS ; collision avec une destination existante → erreur attendue ; noms de destination en double rejetés avant déplacement, sources conservées ; source manquante rejetée, aucune cible créée. Limite : une erreur d'E/S réelle pendant la phase de déplacement peut laisser un état partiel (opération non atomique). Destination indexée / non indexée non distinguées ; INT-18C (concurrence) non couvert ; non déployé ; non validé.

### INT-18A — Destination existante, non indexée

**Scénario :** déplacement vers un fichier présent sur le disque mais non indexé dans AnythingLLM.

**Risque :** le fichier de destination est écrasé sans avertissement. La source est déplacée même si cela détruit du contenu.

**Résultat attendu (après correction) :** refus du déplacement, source préservée, destination inchangée.

---

### INT-18B — Destination existante, déjà indexée

**Scénario :** déplacement vers un fichier présent sur le disque *et* indexé (SQL + LanceDB + cache vectoriel).

**Risque :** en plus de l'écrasement du fichier, les associations SQL, les vecteurs LanceDB et le cache vectoriel de la destination restent liés à un contenu qui n'existe plus. Les références documentaires sont corrompues.

**Résultat attendu (après correction) :** refus du déplacement, contenu et métadonnées SQL/vecteurs de la destination inchangés.

---

### INT-18C — Course concurrente vers la même destination

**Scénario :** deux opérations `move-files` simultanées visant la même destination.

**Risque :** un schéma `existsSync(dest) → rename()` n'est **pas atomique**. Une vérification peut réussir pour les deux opérations simultanément, puis l'une écrase la destination de l'autre. **`O_EXCL` n'est pas directement applicable à `fs.rename()`** — cette option de création de fichier ne rend pas le renommage atomique sans écrasement. Avant de choisir une primitive, vérifier sa compatibilité avec la version Node.js ciblée et le système de fichiers (contraintes cross-device, liens symboliques, permissions).

**Résultat attendu (après correction) :** au plus un succès ; aucune corruption ; garantie no-replace prouvée par test concurrent en isolé.

---

**Action recommandée (INT-18 globale) :**
- Refuser tout déplacement si la destination existe déjà (erreur explicite, source préservée)
- Choisir une primitive anti-écrasement garantie par les primitives réellement disponibles dans la version Node.js ciblée et le système de fichiers concerné — pas un simple `existsSync + rename`
- Documenter les limites éventuelles entre systèmes de fichiers différents (rename non atomique cross-device)
- Prouver le comportement no-replace par test concurrent en isolé

**Sources :**
- `server/endpoints/api/document/index.js` — route `POST /v1/document/move-files`
- Dossier ChatGPT f34bd946, section 5 (MVT-02)

---

## INT-19A/B/C — Lots de déplacements : résultats individuels (Option B retenue)

**Date de constat :** 23 octobre 2026 ; décision Option B retenue 24 octobre 2026  
**Référence dossier ChatGPT :** MVT-03  
**Type :** risque d'incohérence d'état  
**Statut :** ⚠️ Confirmé dans le code v1.17.0 ; décision de sémantique retenue ; aucun test destructif effectué.

**Symptôme :**  
Un lot de déplacements peut être partiellement exécuté en cas d'erreur — certains fichiers déplacés, d'autres non — sans que le client dispose d'un résultat individuel par opération.

**Cause vérifiée :**  
`Promise.all(fs.rename ops)` échoue à la première erreur mais ne défait pas les opérations déjà réussies. La réponse agrégée ne distingue pas les succès des échecs individuels.

**Décision retenue — Option B : résultats individuels (24 octobre 2026) :**  
Un rollback après plusieurs `rename()` partiellement exécutés peut échouer si une source a entre-temps été déplacée ou modifiée. La compensation applicative ne garantit pas l'atomicité. Ne pas promettre de rollback atomique.

**Statuts explicites par opération :**
- `moved` : déplacement réalisé
- `refused` : refus avant exécution, avec motif
- `not_executed` : opération non lancée, avec motif
- `failed` : opération lancée mais échouée

La réponse globale indique complet/partiel/échec — aucun succès global ne masque un échec.

**Pré-validation requise avant toute opération physique :**
1. Valider la structure complète du lot
2. Valider chaque source et chaque destination
3. Détecter les destinations dupliquées et les conflits source/destination internes
4. Détecter les sources répétées

Les preuves doivent permettre de réconcilier système de fichiers, SQL, `DocumentVectors`, LanceDB et cache.

---

### INT-19A — Lot valide

**Scénario :** toutes les opérations sont valides, sources et destinations sont correctes, pas de conflit.

**Résultat attendu :** chaque opération retourne `moved` ; cohérence disque, SQL, mapping vectoriel et cache vérifiés (vérification Step C complète).

---

### INT-19B — Élément invalide au milieu du lot

**Scénario :** un lot où une source est invalide (inexistante, type incorrect) figure au milieu d'opérations valides.

**Résultat attendu :** résultats `moved`/`refused`/`not_executed`/`failed` par opération ; partiel explicitement signalé ; aucun faux succès global.

---

### INT-19C — Sources répétées, destinations dupliquées, conflits internes

**Scénario :** lot avec sources répétées, destinations apparaissant plusieurs fois, ou une source qui est aussi une destination d'une autre opération.

**Résultat attendu :** la prévalidation rejette le lot avant la première mutation physique.

---

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

---

**État laboratoire au 28/10/2026 [LAB] (PUR-01, PUR-02) :** correctif de laboratoire testé par mocks : purge récursive de fichiers et sous-dossiers ; dossier supprimé après succès, conservé après erreur simulée ; entrée symbolique rejetée (`UNSUPPORTED_FOLDER_ENTRY`) ; échec simulé de `Document.removeDocuments` propagé ; 400 `INVALID_FOLDER_NAME`, 400 `INVALID_FOLDER_PATH` (`../outside`), 403 `FOLDER_PROTECTED` (`custom-documents`), 404 `FOLDER_NOT_FOUND`. Routes : `DELETE /v1/document/remove-folder` (`validApiKey`) et `DELETE /system/remove-folder` (authentification et rôles). Limites : pas de test HTTP de bout en bout ; pas de vraie panne LanceDB/SQL ; opérations non transactionnelles, des erreurs de nettoyage SQL peuvent être absorbées par le code existant. Non déployé ; non validé.

### PUR-01 — Cohérence de la purge

**Problème :** `purgeFolder()` n'énumère que les entrées de premier niveau pour la purge des index — les documents dans des sous-dossiers voient leur contenu physique supprimé sans que leurs associations SQL, vecteurs LanceDB et entrées de cache aient été traitées individuellement.

**Risques complémentaires :**
- Les erreurs SQL dans `Document.removeDocuments()` peuvent être absorbées silencieusement
- Les appels asynchrones à `purgeVectorCache()` peuvent rejeter sans être interceptés → entrées cache orphelines sans erreur visible

**Correction requise :** implémenter un parcours récursif dans la phase de purge des index avant la suppression physique ; vérifier et gérer explicitement les erreurs SQL et les rejets asynchrones.

---

### PUR-02 — Contrat de résultat HTTP

**Problème :** les routes retournent HTTP 200 après un no-op. L'appelant ne peut pas distinguer une suppression effective d'un refus silencieux.

**Contrat HTTP requis :**  
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

---

**Action recommandée :**
- Modifier `purgeFolder()` pour retourner un résultat structuré (PUR-01 + PUR-02)
- Mettre à jour les routes pour propager ce résultat dans la réponse HTTP
- Tester : suppression réussie, dossier protégé, dossier inexistant, chemin invalide, chemin imbriqué, échec de nettoyage

**Sources :**
- `server/utils/files/purgeDocument.js` — fonction `purgeFolder()`
- `server/endpoints/api/document/index.js` — route `DELETE /v1/document/remove-folder`
- `server/endpoints/system.js` — route web de suppression de dossier
- Dossier ChatGPT f34bd946, sections 7, 8, 9

---

## UPLOAD-02A/B — Fichiers temporaires orphelins après échec d'upload

**Date de constat :** 23 octobre 2026  
**Type :** fuite de ressources  
**Statut :** ⚠️ Confirmé dans le code v1.17.0 ; aucun test destructif effectué.

**Symptôme :**  
Un upload qui échoue après la réception par Multer laisse des fichiers temporaires dans `collector/hotdir`.

**Cause vérifiée :**  
Multer écrit le fichier dans `collector/hotdir` avant l'exécution du middleware de validation. Si ce middleware rejette la requête, ou si le Collector est indisponible, le fichier temporaire reste sur le disque sans être nettoyé.

---

### UPLOAD-02A — Rejet de validation après écriture Multer

**Scénario :** Multer écrit le fichier dans `hotdir` ; `validateWorkspaceSlugQuery` (ou validation équivalente) rejette ensuite la requête (workspace invalide, type de fichier non autorisé, etc.).

**Impact :** accumulation de fichiers non liés à un workspace valide dans `hotdir` ; saturation disque à terme.

**Résultat attendu (après correction) :** temporaire supprimé après rejet de validation ; fichiers légitimes en cours de traitement préservés.

---

### UPLOAD-02B — Collector indisponible après réception

**Scénario :** Multer écrit le fichier dans `hotdir` ; le Collector est indisponible ou retourne une erreur lors du traitement.

**Impact :** le fichier reste dans `hotdir` indéfiniment sans que l'appelant soit informé d'un état de reprise.

**Résultat attendu (après correction) :** nettoyage déterministe ou état de reprise explicite signalé à l'appelant ; pas d'accumulation silencieuse.

---

**Action recommandée :**
- Ajouter un nettoyage de fichier temporaire dans les handlers d'erreur (validation et Collector)
- Distinguer "fichier en attente de traitement légitime" et "fichier orphelin"
- Tester les deux scénarios en environnement isolé

**Sources :**
- `server/utils/files/multer.js` *(chemin corrigé le 25/10 ; la v0.7 indiquait `server/utils/multer.js`)*
- `server/endpoints/api/document/index.js` — route `POST /v1/document/upload`

---

## RACE-01 — Collision potentielle sur upload concurrent de fichiers homonymes

**Date de constat :** 23 octobre 2026  
**Type :** hypothèse — course sur nom de fichier temporaire  
**Statut :** 🔎 Nommage sans suffixe unique établi dans le code ; collision effective : hypothèse non testée.

**Hypothèse :**  
Multer génère le nom de fichier temporaire dans `collector/hotdir` à partir du nom de fichier original sanitisé, sans suffixe unique (timestamp ou identifiant aléatoire). Deux uploads simultanés du même fichier (même nom) pourraient écrire au même chemin temporaire et se corrompre mutuellement.

**Fait de code [C17][CM] (25/10) :**
`server/utils/files/multer.js` : `fileUploadStorage` (l.11-25) et `fileAPIUploadStorage` (l.31-45) nomment le fichier temporaire d'après le nom d'origine assaini (`cb(null, file.originalname)`, l.19-23 et l.39-43), sans suffixe unique ; ils servent `handleFileUpload` et `handleAPIFileUpload` (`api/document/index.js` l.52 et l.180 ; `workspaces.js` l.124, 825, 903). Seul `pfpUploadStorage` (l.68-85) utilise un UUID.

**Limite de la preuve actuelle :**
Le comportement sous charge concurrente (écrasement ou mélange avant lecture par le Collector) n'a pas été testé. Il s'agit d'une hypothèse à confirmer (RACE-01).

**Action recommandée :**
- ~~Examiner `server/utils/files/multer.js` pour confirmer si le nom temporaire est unique ou partageable~~ — fait le 25/10 : nom non unique (voir ci-dessus)
- Tester deux uploads simultanés du même fichier dans un environnement isolé, avec contenus différents
- Si confirmé : ajouter un suffixe unique (UUID ou timestamp) au nom temporaire, conserver séparément le nom d'affichage

**Sources :**
- `server/utils/files/multer.js`

---

## Registre des vérifications au 28 octobre 2026

| Point de vérification | Source de preuve | État |
|---|---|---|
| `validApiKey` vérifie l'existence de la clé | Code installé lu intégralement (30 lignes) | Confirmé ✅ |
| Association clé → utilisateur ou workspace | Non visible dans le middleware examiné | Non démontrée — ne pas supposer l'isolation |
| `GET /v1/workspaces` et `/v1/documents` retournent tout | Appels empiriques antérieurs | Résultats globaux observés ✅ |
| `vector-search` retourne `source.text` | Code installé inspecté | Confirmé dans le code ; fuite inter-utilisateur non testée |
| `WORKSPACE_DELETION_PROTECTION` présente (`true`) et effective dans le processus | [PROD] bilan 28/10 (activée le 27/10 ; remplace « absente » du 25/10) | Rapporté, non revérifié par Claude ; test unitaire PASS ; test HTTP par route non fait (voir ALLM-10) |
| Routes `env-dump` sans `[validApiKey]` | [C17] `api/system/index.js` l.16, `system.js` l.91 ; [VAL] intentionnel dans l'image auditée | Confirmé dans le code ; intention amont [CM] ; voir ALLM-12 |
| `dumpENV()` écrit `.env` sans retourner les secrets | Code installé `updateENV.js` | Confirmé ✅ |
| ALLM-12 décision D1 | Plan v0.5 — 25 oct 2026 | ⚠️ Révisée : CP-3 non appliqué automatiquement (remplace « retenu sous conditions ») |
| Patch CP-3 (ALLM-12) | Vérification statique 23 oct 2026 | SHA-256 confirmé ; non déployé ; non rebasé sur 1.19.0 |
| Developer API keys = accès admin par conception | SECURITY.md officiel v1.17.0 | Confirmé ✅ |
| Pipeline d'import : vecteurs avant SQL, pas de compensation | Code installé `documents.js` | Confirmé |
| Clé de cache vectoriel dérivée du chemin | Code installé `files/index.js` + lance | Confirmé ✅ |
| `purgeFolder` : purge index non récursive | Code installé `purgeDocument.js` | Confirmé ✅ |
| `purgeFolder` : retour anticipé silencieux → faux succès HTTP | Code installé | Confirmé (INT-20/PUR-02) |
| `create-folder` accepte chemins imbriqués | Code installé | Confirmé (ALLM-16 complément) |
| `Document.removeDocuments()` peut avaler erreurs SQL | Code installé | Confirmé (PUR-01) |
| `purgeVectorCache()` rejet async non intercepté | Code installé | Confirmé (PUR-01) |
| `bodyParser` 3GB avant auth | Code installé `server/index.js` | Confirmé (DOS-02) |
| Correctif upstream DOS-02 absent de v1.17.0 et v1.18.0 | `server/index.js` des deux tags relu le 25/10 ; commit c729bf4… non revérifié | Confirmé (DOS-02) |
| `move-files` sans `lstat().isFile()` | Code installé | Confirmé (INT-17) |
| `move-files` sans vérification destination | Code installé | Confirmé (INT-18A/B/C) |
| `O_EXCL` non applicable directement à `fs.rename()` | Analyse Node.js + Plan v0.4 | Confirmé — ne pas le recommander |
| Lot de déplacements non atomique | Code installé | Confirmé (INT-19A/B/C) |
| INT-19 sémantique retenue | Plan v0.4 — 24 oct 2026 | ✅ Option B — résultats individuels |
| D2 passerelle dédiée retenue | Plan v0.4 — 24 oct 2026 | ✅ Option A |
| Multer écrit avant validation workspace | Code installé | Confirmé (UPLOAD-02A/B) |
| Nom temporaire multer sans suffixe unique | [C17][CM] `multer.js` l.19-23 et l.39-43 | Confirmé dans le code ; collision non testée (RACE-01) |
| Correctifs appliqués en production | Passation 25/10 [IMG] | Aucun correctif de code ajouté ; l'image 1.19.0 embarque la limite `/api/embed` (DOS-02) |
| Image conteneur vs commit audité | Image remplacée le 25/10 (1.19.0, `sha256:ddf73304…`) ; aucun tag amont 1.19.0 | ⚠️ Provenance de l'ancienne image jamais établie ; 1.19.0 non rapprochée d'un commit |
| Chaque conversion du Collector crée un nouveau `docpath` suffixé d'un identifiant | [C17] `asTxt.js` l.36 et l.51 ; `asPDF/index.js` l.57 et l.78 ; `collector/utils/files/index.js` l.120-152 | Confirmé dans le code ; effet sur ALLM-06 non testé (RAG-03A/B) |
| `purgeVectorCache` appelée seulement par `purgeDocument` (l.16) et `purgeFolder` (l.68) | Recherche dans le code, hors tests [C17][CM] | Confirmé ✅ |
| Middleware de protection monté sur trois routes de suppression de workspace | [C17] `admin.js` l.300 ; `workspaces.js` l.302 ; `api/workspace/index.js` l.230 | Confirmé ✅ ; variable testée par présence (`in process.env`) |
| `uploadToWorkspace` : résultat ignoré (v1.17.0) ; propagé avec retour arrière des vecteurs (branche principale) | [C17] `api/document/index.js` l.164… ; [CM] `documents.js` l.372, l.196, l.211 | Confirmé dans le code amont ; image 1.19.0 non vérifiée |
| `dumpENV()` écrit `/app/server/.env` dans le conteneur | [VAL] ; [C17] `updateENV.js` l.1537 ; [CM] l.1718 | Validé ; absence de bind mount à confirmer (SEC-10) |
| Mise à jour d'AnythingLLM en 1.19.0 | Passation 25/10 [IMG] | Rapporté, non revérifié par Claude |
| Changement de production du 27/10 : `DEPLOYMENT_VERSION` aligné sur 1.19.0 et ajout de la variable, un seul service recréé | [PROD] bilan 28/10 ; sauvegarde `backup-allm10-20261027-170318` | Rapporté, non revérifié ; effet fonctionnel de `DEPLOYMENT_VERSION` non examiné |
| Correctifs de laboratoire INT-18 et INT-20/PUR-02 | [LAB] bilan 28/10 (mocks, `anythingllm-fixlab`) | Non validés, non déployés ; code non relu par Claude ; correctifs non exportés |

**Règle de sécurité jusqu'à nouvel avis :** pas d'import n8n ni d'opérations d'administration via l'API sur les données réelles avant correction et validation dans un environnement isolé. Ne stocker aucun secret dans ce journal.

---

## Matrice maîtresse de tests — avant d'activer n8n

**Aucun test de cette matrice n'a été exécuté** (32 identifiants ; la v0.7 en annonçait 29 alors que la table en comptait 30). Tests uniquement en laboratoire isolé avec données factices, après vérification que le conteneur de laboratoire est démarré. Une inspection statique ne remplace pas un test fonctionnel. SEC-02 à SEC-05 ne concernent que l'évaluation éventuelle de CP-3 ; RAG-03 est scindé en RAG-03A/B (ALLM-06) ; SEC-10 est nouveau.

| ID | Catégorie | Scénario | Résultat attendu / preuve | État |
|---|---|---|---|---|
| SEC-01 | ALLM-12 | `/v1/system/env-dump` sans bearer sur le conteneur de laboratoire (image 1.19.0) | Caractériser la réponse HTTP et l'effet sur `/app/server/.env` du conteneur ; aucune écriture hors conteneur | À exécuter |
| SEC-02 | ALLM-12 / CP-3 (conditionnel) | `/api/env-dump` sans session, avant/après CP-3 rebasé | Après patch : refus en multi-utilisateur ; aucun `.env` modifié lors du refus | À exécuter — seulement si l'évaluation de CP-3 est autorisée |
| SEC-03 | ALLM-12 / CP-3 (conditionnel) | `/api/env-dump` avec JWT admin valide, `NODE_ENV=production`, conteneur isolé | Succès après patch ; écriture uniquement dans le conteneur isolé | À exécuter — seulement si l'évaluation de CP-3 est autorisée |
| SEC-04 | ALLM-12 / CP-3 (conditionnel) | `/v1/system/env-dump` avec clé valide, conteneur isolé | Succès après patch ; écriture uniquement dans le conteneur isolé | À exécuter — seulement si l'évaluation de CP-3 est autorisée |
| SEC-05 | ALLM-12 / CP-3 (conditionnel) | `/api/env-dump` avec JWT utilisateur standard, `MULTI_USER_MODE=true` | Refus ; aucun `.env` modifié | À exécuter — seulement si l'évaluation de CP-3 est autorisée |
| SEC-06 | Sécurité | Clé API invalide sur route protégée de test | Refus HTTP, aucun effet secondaire | À exécuter |
| SEC-07 | Passerelle | Import vers slug allowlisté | Opération autorisée ; fichier, workspace, réponse et indexation vérifiables | À exécuter |
| SEC-08 | Passerelle | Import vers slug non autorisé/inconnu | Refus avant traitement/écriture durable ; journal sans secret | À exécuter |
| SEC-09 | Passerelle | Clé d'import sur route admin, suppression ou lecture générale | Refus ; aucune mutation | À exécuter |
| SEC-10 | ALLM-12 | Conséquences de `dumpENV()` en laboratoire | Comparer `/app/server/.env` avant/après l'appel ; `docker inspect` (Mounts) : `/app/server/.env` n'est pas un bind mount de l'hôte ; aucun fichier hôte ni Compose modifié | À exécuter |
| RAG-01 | Import | Import d'un fichier factice neuf | Vérifier fichier, SQL, `DocumentVectors`, LanceDB, cache et réponse HTTP | À exécuter |
| RAG-02 | Import | Réimport identique | Politique d'idempotence observée ; aucun doublon inattendu | À exécuter |
| RAG-03A | Cache (ALLM-06) | Fichier source modifié puis ré-upload via le Collector | Nouveau `docpath` (suffixe UUID) attendu ; chunks conformes au nouveau contenu ; sort de l'ancien document et de son cache documenté | À exécuter |
| RAG-03B | Cache (ALLM-06) | JSON de document modifié en place (même `docpath`), retiré puis rajouté au workspace | Chunks conformes au nouveau contenu ; sinon cache périmé reproduit (risque ALLM-06 confirmé en pratique) | À exécuter |
| RAG-04 | Import | Échec d'embedding/indexation simulé | Échec explicite, pas de faux `success: true` ; comparer avec le comportement 1.19.0 (propagation de `embedded.success`) | À exécuter |
| RAG-05 | Cohérence | Échec SQL après insertion LanceDB | Retour arrière des vecteurs tenté (code amont) ou état de réparation signalé ; contrôler SQL, `DocumentVectors` et LanceDB | À exécuter |
| PUR-01 | Purge | Purge dossier factice avec sous-dossiers | Pas de référence résiduelle non signalée dans SQL, `DocumentVectors`, LanceDB ou cache | Partiel en laboratoire [LAB] : purge récursive, dossier supprimé après succès et conservé après erreur simulée, échec simulé de `Document.removeDocuments` propagé ; vraie panne LanceDB/SQL non testée |
| PUR-02 | Contrat HTTP | `custom-documents`, dossier absent, chemin invalide/imbriqué | `protected`/`not_found`/`invalid` distincts ; aucun faux succès | Partiel en laboratoire [LAB] : 400 `INVALID_FOLDER_NAME` / `INVALID_FOLDER_PATH`, 403 `FOLDER_PROTECTED`, 404 `FOLDER_NOT_FOUND`, entrée symbolique rejetée (`UNSUPPORTED_FOLDER_ENTRY`) ; pas de test HTTP de bout en bout ; `partial_failure` non rapporté |
| OPS-01 | Sauvegarde | Sauvegarde puis restauration isolée (dont l'archive `storage-anythingllm.tar.gz` du 25/10) | Restauration fonctionnelle et intégrité vérifiée | À exécuter |
| OPS-02 | Protection | Protection activée en isolé (valeur `1`, puis valeur `0` : la présence seule suffit-elle ?) ; suppression d'un workspace factice par les trois routes (`/admin/workspaces/:id`, `/workspace/:slug`, `/v1/workspace/:slug`) | 403 « Workspace deletion is blocked by the system administrator. » ; workspace préservé | Production : test unitaire du middleware PASS (403, `next()` non appelé) [PROD] ; test HTTP authentifié par route non fait ; laboratoire : à exécuter |
| DOS-01 | Limite HTTP | Inspection statique de l'image de laboratoire pour `/api/embed` | Code réellement présent documenté ; présence seule ne prouve pas l'activité | Inspection statique de l'image active rapportée le 25/10 [IMG] ; à rejouer sur l'image de laboratoire |
| DOS-02 | Limite HTTP | Dépassement de la limite `/api/embed` dans l'isolé | HTTP 413 « Request payload too large. » ; processus reste sain ; comparer avec une route hors `/api/embed` (limite globale 3 Go) | À exécuter |
| INT-17 | Déplacement | Répertoire comme source | Refus ; aucun déplacement ; SQL/vecteurs inchangés | À exécuter |
| INT-18A | Déplacement | Destination existante mais non indexée | Refus sans écrasement ; source/destination préservées | Partiel en laboratoire [LAB] : collision avec une destination existante → erreur attendue (indexée / non indexée non distinguées) ; contrôle SQL, vecteurs et cache non rapporté |
| INT-18B | Déplacement | Destination existante déjà indexée | Refus sans altération du contenu, SQL, `DocumentVectors`, LanceDB et cache | Partiel en laboratoire [LAB] : collision avec une destination existante → erreur attendue (indexée / non indexée non distinguées) ; contrôle SQL, vecteurs et cache non rapporté |
| INT-18C | Course | Deux opérations concurrentes vers la même destination | Au plus un succès ; aucune corruption ; garantie no-replace prouvée | À exécuter |
| INT-19A | Lot | Lot valide | Chaque résultat `moved` ; cohérence disque, SQL, mapping, cache | Partiel en laboratoire [LAB] : déplacement normal PASS ; cohérence SQL, mapping et cache non rapportée |
| INT-19B | Lot | Élément invalide au milieu du lot | Résultats `moved`/`refused`/`not_executed`/`failed` ; partiel explicitement signalé | Partiel en laboratoire [LAB] : source manquante rejetée, aucune cible créée ; élément invalide au milieu d'un lot non rapporté |
| INT-19C | Lot | Sources répétées, destinations dupliquées, conflits internes | Prévalidation rejette avant première mutation physique | Partiel en laboratoire [LAB] : noms de destination en double rejetés avant déplacement, sources conservées ; sources répétées et conflits internes non rapportés |
| UPLOAD-02A | Upload | Rejet de validation après écriture Multer | Temporaire supprimé ; fichiers légitimes préservés | À exécuter |
| UPLOAD-02B | Upload | Collector indisponible après réception | Nettoyage déterministe ou reprise explicite ; pas d'accumulation silencieuse | À exécuter |
| RACE-01 | Course | Deux uploads simultanés de même nom, contenus distincts | Chaque traitement indexe le bon contenu ; aucune collision/corruption | À exécuter |

**Critères de clôture pour les tests touchant des documents :**  
Ne pas se limiter au code HTTP ou à `success: true`. Vérifier l'état initial/final sur : 1. système de fichiers et chemins exacts ; 2. associations SQL ; 3. enregistrements `DocumentVectors` ; 4. vecteurs dans le namespace LanceDB concerné ; 5. cache vectoriel correspondant ; 6. résultat HTTP et logs expurgés de secrets.

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

**Livraison :**  
En raison de GIT-01 (accès GitHub refusé), les documents ont été livrés par téléchargement direct. Florian pousse manuellement au dépôt `testuflo-ft/docs-serveur-ia`.

---

## MISS-02 — Session de travail 24 octobre 2026 : addendum qualité et harmonisation v0.7/v0.5

**Date :** 24 octobre 2026  
**Type :** entrée de mission  
**Statut :** ✅ Documents produits et livrés

**Contexte :**  
À la suite de la réception d'un addendum de contrôle qualité (24 octobre 2026) et de la production du Plan v0.4 par ChatGPT, une session de révision documentaire a été consacrée à l'harmonisation du Journal et du Livret sur la matrice maîtresse à 29 tests et les décisions D1/D2/INT-19.

**Documents produits dans cette session :**

| Document | Version | Statut |
|----------|---------|--------|
| `Plan-correctifs-AnythingLLM-1.17.0-v0.4-2026-10-24.md` | v0.4 | ✅ Produit par ChatGPT ; publié sur GitHub par Florian |
| `Journal-des-Incidents-v0.7-2026-10-24.md` | v0.7 | ✅ Produit |
| `Livret-Technique-Serveur-IA-v0.5-2026-10-24.md` | v0.5 | ✅ Produit |

**Principaux apports de la session :**
- Décisions D1 (CP-3 sous conditions), D2 (passerelle dédiée Option A), INT-19 (Option B résultats individuels) documentées dans les trois documents
- INT-18 scindé en sous-scénarios A (destination non indexée), B (destination indexée), C (course concurrente)
- INT-19 scindé en sous-scénarios A (lot valide), B (élément invalide), C (prévalidation)
- UPLOAD-02 scindé en A (validation) et B (Collector indisponible)
- Correction langage O_EXCL : non applicable directement à `fs.rename()`
- Matrice de tests unifiée à 29 identifiants (SEC-01..09, RAG-01..05, PUR-01/02, OPS-01/02, DOS-01/02, INT-17, INT-18A/B/C, INT-19A/B/C, UPLOAD-02A/B, RACE-01)
- Section 14.19 du Livret corrigée : PUR-01 = cohérence de purge, PUR-02 = contrat de résultat HTTP

**Livraison :**  
Documents livrés par téléchargement direct (GIT-01 non résolu). Florian pousse manuellement.

---

## MISS-03 — Session de travail 25 octobre 2026 : mise à jour après déploiement 1.19.0 et conclusions validées

**Date :** 25 octobre 2026
**Type :** entrée de mission
**Statut :** ✅ Documents produits en local ; **non publiés sur GitHub** (autorisation de Florian requise ; GIT-01)

**Contexte :**
Passation ChatGPT du 25 octobre (déploiement 1.19.0, audit, cache vectoriel) puis conclusions validées par Florian à 21:37. La passation citait des versions de départ obsolètes (Livret v0.3, Journal v0.5) et appelait « CP-3 » la limite `/api/embed` ; la mise à jour est repartie des versions canoniques du dépôt (HEAD `d29d1b2`, Livret v0.5, Journal v0.7, Plan v0.4).

**Documents produits dans cette session :**

| Document | Version | Statut |
|----------|---------|--------|
| `Plan-correctifs-AnythingLLM-1.17.0-v0.5-2026-10-25.md` | v0.5 | ✅ Produit en local |
| `Journal-des-Incidents-v0.8-2026-10-25.md` | v0.8 | ✅ Produit en local |
| `Livret-Technique-Serveur-IA-v0.6-2026-10-25.md` | v0.6 | ✅ Produit en local |

**Principaux apports :**
- État au 25/10 : sources de preuve étiquetées ([C17], [CM], [IMG], [VAL]) ; faits, tests, hypothèses, risques résiduels, décisions et vérifications restantes séparés.
- D1 révisée (CP-3 non appliqué automatiquement), D4 révisée (protection facultative, désactivée), DOS-02 consigné « corrigé et déployé (preuve statique) », ALLM-06 maintenu ouvert (D7), ALLM-05 requalifié.
- Corrections : décompte de la matrice (29 annoncés en v0.7, 30 lignes réelles, 32 en v0.8) ; chemin `server/utils/files/multer.js` ; facteur atténuant « Tailscale uniquement » non démontré ; références croisées du Plan v0.4 (qui citait Journal v0.6 et Livret v0.4) ; `package.json` du Livret §15.6 (`/app/server/package.json`).
- **Non fait :** aucun test exécuté ; image 1.19.0 non inspectée par Claude ; état du laboratoire non examiné ; aucune modification de la production ; aucune publication.

**Livraison :**
Fichiers locaux, à publier manuellement par Florian après relecture (GIT-01 non résolu).

---

## MISS-04 — Session de travail 28 octobre 2026 : intégration du bilan ChatGPT

**Date :** 28 octobre 2026
**Type :** entrée de mission
**Statut :** ✅ Documents produits en local ; **non publiés sur GitHub** (autorisation de Florian requise ; GIT-01)

**Contexte :** bilan ChatGPT des travaux postérieurs à la mise à jour du 25/10 : ALLM-10 activé en production le 27/10 ; correctifs de laboratoire INT-18 et INT-20/PUR-02 ; état du laboratoire ; prochaine tâche ALLM-12.

**Principaux apports :** étiquettes [PROD] et [LAB] ; ALLM-10 réécrit (activé, test unitaire seulement) ; D4 révisée ; D6 précisée ; états partiels dans la matrice (32 identifiants) ; protocole ALLM-12 préparé (Plan v0.6 §2.7) ; limites de preuve explicites.

**Non fait :** aucun test exécuté par Claude ; production et laboratoire non accessibles ; correctifs de laboratoire non relus ; aucune modification de la production ; aucune publication ; ALLM-12 non traité au-delà de la préparation du protocole.

**Documents :** `Plan-correctifs-AnythingLLM-1.17.0-v0.6-2026-10-28.md`, `Journal-des-Incidents-v0.9-2026-10-28.md`, `Livret-Technique-Serveur-IA-v0.7-2026-10-28.md` ; archives datées des versions v0.5/v0.8/v0.6 du 25/10.

---

## État des vérifications en attente au 28 octobre 2026

- **OWUI-02 :** confirmer l'indexation du PDF OCR dans `Corpus-AI-test` et la réponse attendue (9 janvier 2027, numéro 7731-KP).
- **OWUI-04 :** vérifier si la clé API Open WebUI temporaire a bien été révoquée.
- **Laboratoire :** vérifier que le conteneur de laboratoire est démarré (`docker ps`) avant toute commande de test ; l'état réel du laboratoire n'est pas connu de cette mise à jour.
- **ALLM-12 / D1 :** protocole préparé dans le Plan v0.6 §2.7 (non exécuté) ; lecture seule dans l'image 1.19.0 (`grep -n "env-dump\|validApiKey"` sur les deux fichiers ; `docker inspect … .Mounts` ; `docker port anythingllm`), puis SEC-01 et SEC-10 en laboratoire ; décision A/B/C de Florian et autorisation explicite avant toute modification.
- **ALLM-10 / D4 :** activée le 27/10 [PROD] ; reconfirmer la valeur effective (présence) ; OPS-02 et tests HTTP des trois routes en laboratoire.
- **Laboratoire / correctifs INT-18 et INT-20/PUR-02 :** exporter les correctifs (`docker diff`, `docker cp`, SHA-256) avant tout arrêt du conteneur ; comparer l'image du laboratoire à l'ID de production ; tests de bout en bout et contrôle disque/SQL/`DocumentVectors`/LanceDB/cache.
- **ALLM-04 / D3 :** inventorier les consommateurs de la clé `Import-Corpus-IA` (Open WebUI, n8n, journaux Docker) avant toute décision de révocation.
- **ALLM-05 :** aucun test ; la passerelle n'expose pas `remove-documents`.
- **ALLM-06 / ALLM-15 / D7 :** revue des tests automatisés amont et des parcours d'import ; RAG-03A et RAG-03B en laboratoire. **Ouvert.**
- **ALLM-07 / ALLM-14 :** vérifier dans l'image 1.19.0 la propagation du résultat d'upload et le retour arrière des vecteurs (code amont [CM]) ; RAG-02, RAG-04, RAG-05 dans un espace isolé.
- **ALLM-08 :** valider en instance isolée si une clé Developer API peut créer ou supprimer des comptes (attendu : oui, par conception).
- **ALLM-09 :** valider en instance isolée l'accès inter-utilisateur aux routes documentaires.
- **ALLM-13 / D2 :** spécifier et tester la passerelle d'import dédiée pour n8n (SEC-07, SEC-08, SEC-09) ; aucun workflow n8n réel avant validation isolée.
- **ALLM-16 :** tester `purgeFolder` avec arborescence imbriquée (PUR-01, PUR-02).
- **DOS-02 / D5 :** corrigé et déployé (preuve statique) ; DOS-01 et DOS-02 (413) à rejouer en laboratoire ; décider du résiduel de la limite globale de 3 Go.
- **INT-17 à RACE-01 :** préparer et exécuter INT-17, INT-18A/B/C, INT-19A/B/C, UPLOAD-02A/B, RACE-01 en environnement isolé (D6).
- **OPS-01 :** essai de restauration de la sauvegarde du 25/10 (`storage-anythingllm.tar.gz`) en environnement isolé.
- **GIT-01 :** résoudre le refus d'écriture GitHub ; publication manuelle d'ici là.
- **Plan de test complet :** aucun des 32 tests de la matrice maîtresse n'a été exécuté.

*Clos depuis v0.5 :*
- ~~**ALLM-06 :** identifier le chemin source du fichier de cache observé~~ → `5d8cac14-….json` = cache de `06_volunteer_day_notice_2026-11_ZH.txt` ✅ (le risque ALLM-06 lui-même reste ouvert)

*Décisions (état au 25 octobre 2026) :*
- **D1 (ALLM-12) :** CP-3 non appliqué automatiquement — remplace « CP-3 sous conditions » du 24/10 ; décision A/B/C à prendre.
- **D2 (automatisation) :** Option A passerelle dédiée, liste blanche — retenue, reconfirmée [VAL], à spécifier et tester.
- **D4 :** protection de suppression **activée** le 27/10/2026 [PROD] ; test unitaire seulement.
- **D6 :** INT-18 et INT-20/PUR-02 corrigés en laboratoire seulement ; non déployés.
- **D5 :** DOS-02 corrigé et déployé (preuve statique).
- **D7 :** ALLM-06 ouvert.
- **INT-19 :** Option B résultats individuels — retenue.

*Rouvert et réévalué :*
- **ALLM-04** : rouvert en v0.3 ; qualifié le 25/10 (risque de gouvernance, comportement intentionnel).
- **ALLM-05** : requalifié le 25/10 (portée globale confirmée ; pas de vulnérabilité autonome).
- **ALLM-06** : statut « ✅ mécanisme compris » de la v0.7 remplacé par « ⚠️ ouvert ».
- **ALLM-10** : de « protection inactive — action requise » (v0.7) à « facultative, désactivée » (v0.8) puis « activée le 27/10, test unitaire seulement » (v0.9).
- **ALLM-12** : P0 (v0.5) → durcissement requis (v0.6) → D1 sous conditions (v0.7) → comportement intentionnel, CP-3 non appliqué automatiquement (v0.8).

---

*Dernière mise à jour : 28 octobre 2026*
*Version 0.9 : intègre le bilan ChatGPT du 28/10/2026 (étiquettes [PROD] et [LAB] ; ALLM-10 activé le 27/10 avec test unitaire seulement ; états de laboratoire INT-18 et INT-20/PUR-02 ; matrice : états partiels, 32 identifiants ; MISS-04 ; liste des vérifications en attente mise à jour). Base : v0.8 (25 oct 2026).*
*Version 0.8 : repart du Journal v0.7 du dépôt (24 oct 2026) ; ajout d'une section de lecture (sources de preuve, numérotation canonique, conclusions validées du 25/10 21:37, état INT-17 à RACE-01) ; ALLM-05, ALLM-06 et ALLM-10 réécrits ; ALLM-12 : D1 du 24/10 remplacée, options A/B/C, conclusions validées ; ALLM-13, ALLM-14, ALLM-15, DOS-02, RACE-01 et UPLOAD-02 mis à jour ; registre des vérifications complété ; matrice portée à 32 identifiants (RAG-03A/B, SEC-10) ; ajout MISS-03 ; liste des vérifications en attente refaite ; chemin `multer.js` corrigé ; facteur atténuant « Tailscale uniquement » signalé comme non démontré. Base : v0.7 (24 oct 2026).*
