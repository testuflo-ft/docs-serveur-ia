# Correctifs ciblés --- AnythingLLM (audit 1.17.0 ; instance 1.19.0 depuis le 25/10/2026)

*Version 0.5 --- 25 octobre 2026*\
*Statut : plan révisé après le déploiement d'AnythingLLM 1.19.0 et la validation des conclusions d'audit du 25/10/2026. Un seul correctif est en place : DOS-02 (limite de corps sur `/api/embed`, présente dans l'image 1.19.0, preuve statique). CP-3 n'est pas appliqué. Aucun test de la matrice n'est déclaré exécuté.*

## 1. Objet et règles impératives

Ce document constitue le plan opérationnel de référence pour les
correctifs ciblés AnythingLLM. L'audit statique porte sur le tag amont
`v1.17.0` ; l'instance exécutée est en 1.19.0 depuis le 25/10/2026. Le
nom de fichier est conservé pour la continuité des références. Il
complète le Journal des Incidents v0.8 et le Livret Technique v0.6 ; il
fixe la matrice maîtresse et les décisions retenues.

**Conventions :** fait vérifié = constat direct dans le code examiné ;
hypothèse = scénario non reproduit ; à vérifier = dépend de l'image ou
d'une inspection en attente ; non testé = aucune validation
fonctionnelle ; décision retenue = orientation, pas autorisation de
modifier la production. Chaque constat distingue : fait démontré par le
code, résultat de test, hypothèse, risque résiduel, décision et
vérification restante. Les sources de preuve sont étiquetées (§2.1).

**Garde-fous :** 1. Aucun test destructif ou mutatif sur la production.
2. Aucun déploiement, changement de configuration, redémarrage non
planifié ou modification du code installé sans autorisation explicite
de Florian. 3. Aucun commit/publication GitHub sans autorisation
explicite : le connecteur a renvoyé `403 Resource not accessible by
integration` (GIT-01) ; publication manuelle par Florian. 4. Les routes
`env-dump` ne sont testées que dans un conteneur de laboratoire isolé,
car `dumpENV()` écrit `/app/server/.env`. 5. Préserver l'accès LAN
direct Ethernet 10 Gb/s. Ne pas lier les ports Docker uniquement à
`127.0.0.1` et ne pas faire passer les flux LAN par Tailscale. 6. Le
montage NAS `Corpus-IA` reste en lecture seule. Utiliser des fichiers
factices pour les tests. 7. Ne jamais consigner de secrets, clés, mots
de passe ou valeurs sensibles d'environnement. 8. Aucun import n'est
lancé dans n8n avant validation de l'autorisation, des erreurs et de
l'intégrité vectorielle. 9. Avant toute commande de test, vérifier que
le conteneur de laboratoire est effectivement démarré (`docker ps`) et
que la commande vise ce conteneur, jamais `anythingllm`. 10. L'état réel
du laboratoire n'a pas été communiqué à la session qui rédige cette
version : ce document n'affirme rien sur son contenu.

## 2. État au 25 octobre 2026

### 2.1 Sources de preuve

**Sources de preuve (légende utilisée dans ce document) :**
- **[C17]** code amont, tag `v1.17.0` (commit `fa7ec877f005a21ede94888b3b8618b700343857`), relu en lecture seule le 25/10/2026.
- **[CM]** code amont, branche principale, commit `a5bb8b9c7b1262635ea58fc17d4899619cbf58e9` (23/10/2026 ; `package.json` = 1.19.0). Aucun tag `v1.19.0` n'existe (dernier tag : `v1.18.0`, vérifié le 25/10/2026). Ce n'est **pas** une preuve du contenu de l'image exécutée.
- **[IMG]** relevé sur l'image active 1.19.0 (`sha256:ddf73304a4a96e2f90755d620dd3921de9afb4b8b8e914fa62d6ce7944ba95af`) rapporté par la passation du 25/10/2026 ; **non revérifié** par Claude, qui n'a pas accès à minimac.
- **[VAL]** conclusion validée par Florian le 25/10/2026 à 21:37 ; reprise telle quelle, sans nouvelle vérification.
- **[TEST]** résultat d'un test exécuté. À ce jour : **aucun** test de la matrice n'a été exécuté, et l'état réel du laboratoire isolé n'a pas été communiqué à la session qui rédige ces documents.

Les numéros de ligne sont donnés pour la référence indiquée ([C17] ou [CM]). Les lignes relevées sur l'image ([IMG]) sont approximatives (« ≈ »).

**Numérotation canonique.** `CP-3` désigne le correctif d'authentification des routes `env-dump` (ALLM-12). La limite de corps `EMBED_BODY_LIMIT` sur `/api/embed` relève de `DOS-02`. La passation du 25/10 (matin) appelait à tort « CP-3 » cette limite de corps ; la numérotation du dépôt est conservée. `ALLM-06` (constat initial du 11-15 octobre) et `ALLM-15` (analyse de code du 20-21 octobre) décrivent le **même** risque de cache vectoriel ; `ALLM-06` est l'identifiant de suivi.

### 2.2 Conclusions validées

**Conclusions validées par Florian le 25/10/2026 à 21:37 [VAL] (reprises sans les redécouvrir) :**
1. *ALLM-12.* Dans l'image installée et auditée, les routes `env-dump` ne comportent intentionnellement pas `validApiKey`. `dumpENV()` écrit `/app/server/.env` **à l'intérieur du conteneur** ; il ne modifie pas directement le `.env` de l'hôte ni le fichier Compose. CP-3 n'est **pas** appliqué automatiquement : toute modification suppose une analyse de ses conséquences et une autorisation explicite. Le comportement constaté dans l'image installée se distingue des éventuelles différences avec le dépôt amont.
2. *ALLM-10.* La protection de suppression dépend de la présence de `WORKSPACE_DELETION_PROTECTION`. Elle ne doit pas être déclarée active sans vérification de la valeur effective et du chemin de code ; toute conclusion cite fichiers et routes et distingue le code de la configuration déployée.
3. *ALLM-06.* Le cache vectoriel est associé au chemin du fichier (`uuidv5(filename, uuidv5.URL)`). Si le contenu change sans que le chemin change, des données périmées peuvent subsister. Le risque reste **ouvert** ; il ne sera pas déclaré résolu sans correction vérifiée et tests reproductibles.
4. *n8n.* Aucune clé API générale d'AnythingLLM n'est exposée directement à n8n ; une passerelle dédiée contrôle explicitement routes et opérations par liste blanche, sans supposer qu'une clé valide limite les droits à un utilisateur ou à un espace de travail.
5. *Règles.* Ni la production ni ses données/configuration ne sont modifiées, rien n'est publié sur GitHub, aucun test mutatif n'est exécuté sur les routes de production sans autorisation explicite ; les tests se font en laboratoire isolé, après vérification que le conteneur de laboratoire est effectivement démarré.

### 2.3 Ce qui a changé le 25/10/2026

- **Instance [IMG]** : image `mintplexlabs/anythingllm:latest`, version 1.19.0, arm64, ID `sha256:ddf73304a4a96e2f90755d620dd3921de9afb4b8b8e914fa62d6ce7944ba95af` ; seul le conteneur `anythingllm` a été recréé (`running`, `healthy`, HTTP 200 sur le port 3001, migrations à jour) ; Open WebUI et n8n n'ont pas été touchés.
- **Retour arrière préparé [IMG]** : répertoire `/Users/florian/services/ai-stack/backup-anythingllm-20261025-091540/` (`compose.yaml`, `ancienne-image-id.txt`, `storage-anythingllm.tar.gz`) et tag `mintplexlabs/anythingllm:rollback-20261025-091540`. La **restauration n'a pas été essayée** (OPS-01).
- **Portée des preuves antérieures** : toutes les preuves « code installé » datées d'avant ce déploiement portent sur l'ancienne image, retirée. Celle-ci n'a jamais été rapprochée du commit audité `fa7ec877…` (la révision d'image `feb04ca0` avait été relevée lors du diagnostic initial) : sa provenance exacte reste non établie.
- **Écart de version** : l'audit statique ([C17]) a été fait sur v1.17.0 ; l'image 1.19.0 n'a pas de tag amont. Pour les points où le code amont diffère entre v1.17.0 et la branche principale, le comportement de l'image 1.19.0 reste à confirmer.

### 2.4 Synthèse

| Sujet | État au 25/10/2026 | Décision / suite |
|---|---|---|
| ALLM-12 / CP-3 | Routes `env-dump` sans `validApiKey` : intentionnel [VAL] ; `dumpENV()` écrit le `.env` du conteneur [VAL] ; intention amont confirmée dans `SECURITY.md` [CM] | CP-3 préparé, **non appliqué automatiquement** ; analyse des conséquences puis autorisation explicite (D1 révisée) |
| ALLM-10 | Middleware actif si la variable est **présente** (toute valeur) ; variable absente de l'environnement actif [IMG] | Protection désactivée ; décision opérationnelle à prendre (D4) ; ne pas la déclarer active sans vérification |
| DOS-02 | `EMBED_BODY_LIMIT = "1mb"` sur `/api/embed` présent dans l'image 1.19.0 [IMG] ; limite globale 3 Go conservée ailleurs | Corrigé et déployé (preuve statique) ; 413 non testé (D5) |
| ALLM-06 / ALLM-15 | Cache indexé par `uuidv5(chemin)` ; aucune empreinte de contenu [C17][CM] | **Ouvert** [VAL] ; RAG-03A/B (D7) |
| ALLM-05 | `purgeDocument()` supprime dans tous les workspaces ; exposé par `DELETE /v1/system/remove-documents` [C17] | Risque de gouvernance des clés, pas une vulnérabilité autonome |
| ALLM-13 / D2 | Passerelle dédiée avec liste blanche | Retenue, reconfirmée [VAL] ; à spécifier et tester avant tout n8n |
| ALLM-14 | v1.17.0 : résultat d'upload non propagé, pas de compensation ; branche principale : propagation + retour arrière des vecteurs | À vérifier dans l'image 1.19.0, puis RAG-04/RAG-05 |
| INT-17 à INT-20, UPLOAD-02, RACE-01 | Code inchangé entre v1.17.0 et la branche principale | Tests isolés à exécuter (D6) |

### 2.5 Vérifications restantes (lecture seule, aucune ne modifie la production)

1. Confirmer dans l'image 1.19.0 l'absence de middleware sur les deux routes `env-dump` (`grep -n "env-dump\|validApiKey" /app/server/endpoints/api/system/index.js /app/server/endpoints/system.js`).
2. Confirmer par `docker inspect anythingllm --format '{{json .Mounts}}'` que `/app/server/.env` n'est pas un point de montage de l'hôte (précise la portée de la conclusion validée sur `dumpENV()` ; ne la remet pas en cause).
3. Confirmer la valeur effective de `WORKSPACE_DELETION_PROTECTION` dans l'environnement du **processus** (présence seulement, sans afficher les autres variables) : `docker exec anythingllm sh -c 'env | grep -c "^WORKSPACE_DELETION_PROTECTION="'`.
4. Confirmer la publication des ports (`docker port anythingllm`) : la surface réelle de la route non authentifiée (LAN, tailnet) en dépend.
5. Inventorier les consommateurs de la clé `Import-Corpus-IA` avant toute révocation (D3).
6. Vérifier que le conteneur de laboratoire est démarré avant toute commande de test (garde-fou 9).

## 3. Vérification obligatoire avant toute intervention

Inspection en lecture seule du conteneur actif. Ne pas envoyer de corps
HTTP volumineux, modifier la configuration ni redémarrer pendant cette
phase.

``` bash
docker inspect anythingllm --format 'ImageID={{.Image}}'
docker inspect anythingllm --format 'RestartPolicy={{.HostConfig.RestartPolicy.Name}}'
docker port anythingllm
docker exec anythingllm sh -lc 'node -p "require(\"/app/server/package.json\").version" 2>/dev/null || true'
docker exec anythingllm sh -lc 'grep -nE "EMBED_BODY_LIMIT|FILE_LIMIT|bodyParser\\.(text|json|urlencoded)" /app/server/index.js'
```

Examiner les résultats sans afficher l'environnement complet ni les
secrets. Relever le digest et les labels de révision s'ils sont
disponibles. La version déclarée (1.19.0) et l'ID d'image ne prouvent pas
à eux seuls la provenance complète : aucun tag amont `v1.19.0` n'existe.
Le fichier `server/index.js` de l'image active a été relu le 25/10
[IMG] ; cela ne démontre pas que tous les fichiers de l'image
correspondent à un commit amont donné.

Avant D1/ALLM-12, rechercher dans les scripts et configurations
effectivement utilisés les appels à `GET /api/env-dump` et
`GET /v1/system/env-dump` sans authentification. Ne pas appeler les
routes de production pour les tester.

## 4. Décisions de référence

### D1 --- ALLM-12 : CP-3 non appliqué automatiquement (révisée le 25/10/2026)

**Décision révisée.** CP-3 reste **préparé mais non appliqué**. Il n'est
plus « privilégié sous conditions » (v0.4, 24/10) : son application est
suspendue à (1) une analyse écrite de ses conséquences, (2) les tests de
laboratoire correspondants et (3) l'autorisation explicite de Florian.

**Faits démontrés par le code**
- [VAL] Dans l'image installée et auditée, les routes `env-dump` ne comportent intentionnellement pas `validApiKey`.
- [VAL] `dumpENV()` écrit `/app/server/.env` à l'intérieur du conteneur ; il ne modifie pas directement le `.env` de l'hôte ni le fichier Compose.
- [C17] `GET /v1/system/env-dump` (`server/endpoints/api/system/index.js` l.16) et `GET /env-dump` (`server/endpoints/system.js` l.91) n'ont aucun middleware d'authentification ; hors production ils répondent 200 sans effet ; en production ils appellent `dumpENV()` puis répondent 200 sans corps. La route voisine `/v1/system` porte `[validApiKey]`.
- [C17] `server/swagger/openapi.json` l.2627 documente un 403 `InvalidAPIKey` que le code ne produit pas. `SECURITY.md` v1.17.0 (59 lignes) ne mentionne pas `env-dump`.
- [CM] Commentaire « Intentionally unauthenticated so deploy/shutdown scripts can flush in-memory config to .env » (`api/system/index.js` l.16-17 ; `system.js` l.92-93) et rubrique « Reports about `env-dump` endpoints being unauthenticated » de `SECURITY.md` (l.65-76) : routes sans entrée ni sortie, volontairement non authentifiées. C'est l'intention **actuelle** des mainteneurs ; elle ne prouve pas leur intention à v1.17.0.
- [C17][CM] Seul appelant trouvé dans le dépôt amont hors définitions : `BARE_METAL.md` l.84 (`curl -I http://localhost:3001/api/env-dump`). Le script `docker/docker-entrypoint.sh` (branche principale) n'appelle pas `env-dump`.
- [C17] `dumpENV()` : `server/utils/helpers/updateENV.js` l.1537 ; `WORKSPACE_DELETION_PROTECTION` figure parmi les clés conservées (l.1569). [CM] Le corps réécrit le `.env` (`fs.writeFileSync(envPath, …, { flag: "w" })` l.1718) à partir des seules clés listées dont la valeur est non vide dans `process.env` ; commentaires et autres lignes du fichier ne sont pas conservés.

**Tests** : aucun (SEC-01 à SEC-05 et SEC-10 à exécuter en laboratoire).

**Hypothèses et limites**
- Le comportement exact de l'image 1.19.0 n'est pas revérifié par Claude ; le patch CP-3 (SHA-256 `b27d886c07d890616ef12d072d0848195214457dc07836ba34417a2940ca1a7e`, tag `v1.17.0`, vérifié statiquement avec `node --check`) n'a **pas** été rebasé sur le code de l'image 1.19.0 : `system.js` et `api/system/index.js` diffèrent entre v1.17.0 et la branche principale.
- Que `/app/server/.env` ne soit pas un point de montage de l'hôte est supposé par la conclusion validée ; SEC-10 le confirme.
- La surface réelle de la route (LAN, tailnet) dépend de la publication du port 3001 : l'ancien facteur atténuant « accès Tailscale uniquement » n'est **pas démontré** (garde-fou 5 : pas de liaison à `127.0.0.1`).

**Options à évaluer (aucune n'est exécutée)**

| Option | Effet | Coût / risque | État |
|---|---|---|---|
| A. CP-3 rebasé | Refus sans clé ou session valide | Patch local à refaire à chaque mise à jour de l'image `latest` ; écart avec l'intention amont ; casse tout script sans identifiants (cas `BARE_METAL.md`) | Non appliqué |
| B. Désactiver la route (404) | Plus d'appel possible | Même coût de maintenance ; casse les scripts amont | Non retenue |
| C. Ne rien modifier, documenter, surveiller les accès | Comportement amont conservé | Risque résiduel : tout client atteignant le port peut déclencher la réécriture du `.env` du conteneur, sans lecture de données ni changement de la configuration en mémoire | Alternative la moins coûteuse ; décision à prendre |

**Risques résiduels** : impact faible (aucune donnée lue ou renvoyée, effet borné au `.env` du conteneur) mais route non authentifiée ; compatibilité bare-metal documentée, non bloquante pour cette installation Docker.

**Décision à prendre (Florian)** : A, B ou C, après analyse et SEC-01 / SEC-10 en laboratoire. **Prérequis communs** : image identifiée, appels internes éventuels recherchés dans les scripts réellement utilisés, diff relu, sauvegarde, autorisation explicite.

### D2 --- Automatisation : Option A, passerelle dédiée

**Décision retenue : Option A.** Ne pas modifier maintenant le
middleware central. L'Option B --- portée des clés dans le code
AnythingLLM --- pourra être réévaluée après stabilisation et exécution
des tests.

La passerelle doit : - détenir la clé Developer API générale sans la
transmettre à n8n ou à l'appelant ; - imposer une allowlist de slugs
configurée côté serveur, jamais fournie par l'appelant ; - limiter le
premier périmètre à l'import documentaire ; - refuser par défaut si la
clé dédiée ou l'allowlist manque ; - valider tous les slugs avant
traitement du fichier ; - refuser les routes d'administration,
suppression, recherche générale et opérations non explicitement
autorisées ; - journaliser cible, fichier, résultat et horodatage, sans
clé ni en-tête `Authorization` ; - ne jamais signaler un succès si
l'indexation échoue.

Aucun workflow n8n réel avant validation de la passerelle en
environnement isolé. Option B est reportée, non abandonnée.

**Reconfirmée le 25/10/2026 [VAL].** Aucune clé API générale n'est exposée
à n8n. La passerelle contrôle explicitement routes et opérations par
liste blanche et ne suppose jamais qu'une clé valide limite les droits à
un utilisateur ou à un workspace : AnythingLLM ne lie pas la clé à un
périmètre (`SECURITY.md` v1.17.0 l.49-53 [C17]). Routes à exclure
explicitement de la passerelle : `DELETE /v1/system/remove-documents`
(purge dans tous les workspaces, ALLM-05), `DELETE /v1/document/remove-folder`,
`POST /v1/document/move-files`, `POST /v1/workspace/:slug/vector-search`
(renvoie `source.text`), toute route `/v1/admin/*` et toute suppression
de workspace.

### D3 --- Clé `Import-Corpus-IA`

Consulter les journaux disponibles sans afficher la valeur de la clé.
Confirmer son usage par Open WebUI ou un autre consommateur avant toute
révocation. La traiter comme une clé à portée administrative dans
l'instance.

### D4 --- Protection de suppression des workspaces (révisée le 25/10/2026)

**État** : fonctionnalité facultative **disponible mais désactivée** dans
l'environnement actif. Ce n'est pas une vulnérabilité confirmée. Elle ne
doit pas être déclarée active sans vérification de la valeur effective
et du chemin de code.

**Faits démontrés par le code**
- [C17][CM] `server/utils/middleware/workspaceDeletionProtection.js` (18 lignes) : `if (!("WORKSPACE_DELETION_PROTECTION" in process.env)) return next();` sinon HTTP 403 `{ success: false, error: "Workspace deletion is blocked by the system administrator." }` (l.9-13). La protection est donc active dès que la variable est **présente, quelle que soit sa valeur** (y compris `0` ou vide).
- [C17] Le middleware est monté sur trois routes : `DELETE /admin/workspaces/:id` (`server/endpoints/admin.js` l.300), `DELETE /workspace/:slug` (`server/endpoints/workspaces.js` l.302 ; l.303 en [CM]) et `DELETE /v1/workspace/:slug` (`server/endpoints/api/workspace/index.js` l.230, `[validApiKey, workspaceDeletionProtection]`). Elle bloque donc aussi la suppression depuis l'interface d'administration.
- [C17] `server/index.js` l.1-3 charge le `.env` du conteneur au démarrage (`dotenv`) ; le `.env` ne reflète donc pas à lui seul l'environnement du processus.
- [IMG] Variable absente de l'environnement actif ; le `.env` contient une ligne **commentée**, ce qui ne signifie pas que la variable est présente.

**Tests** : aucun (OPS-02).

**Limites** : la protection ne couvre que ces trois routes de suppression de workspace ; elle ne couvre ni la purge de documents (`remove-documents`, `remove-folder`) ni d'éventuelles autres voies non examinées.

**Risque résiduel** : suppression de workspace possible par toute clé API valide ou tout administrateur tant que la variable est absente.

**Décision à prendre (Florian)** : activer ou non (option v0.4 « `=1` au prochain redémarrage planifié », maintenue comme option, non comme action programmée). L'activer sans plan peut bloquer des suppressions légitimes (retrait de la variable et redémarrage nécessaires). Aucune modification ni aucun redémarrage dans le cadre de cette révision.

### D5 --- DOS-02 : corrigé et déployé, preuve statique (25/10/2026)

**Statut** : la limite dédiée à `/api/embed` est **présente dans le code de
l'image 1.19.0 active** [IMG] ; son comportement HTTP n'a **pas** été testé.
La passation du 25/10 l'a nommée « CP-3 » à tort (numérotation, §2.1).

**Faits démontrés par le code**
- [IMG] `/app/server/index.js` : `EMBED_BODY_LIMIT = "1mb"` ≈ l.54 ; limites appliquées aux routes `/api/embed` ≈ l.70-74 ; limite globale distincte de 3 Go conservée pour les autres routes (≈ l.75 et suivantes) ; réponse 413 « Request payload too large. » ≈ l.83-86.
- [CM] `server/index.js` : `FILE_LIMIT = "3GB"` l.53, `EMBED_BODY_LIMIT = "1mb"` l.54, `app.use("/api/embed", [bodyParser.text, bodyParser.json, bodyParser.urlencoded])` l.70-74, parseurs globaux l.75-81, gestionnaire d'erreur l.83-90 (413 pour `entity.too.large`, 400 pour corps mal formé).
- [C17] `v1.17.0` (et v1.18.0) : `FILE_LIMIT = "3GB"` l.52 et parseurs globaux l.66-70 uniquement, sans limite dédiée : le correctif n'existe pas avant la branche principale.
- [IMG] Preuves opérationnelles : version 1.19.0, ID `sha256:ddf73304a4a96e2f90755d620dd3921de9afb4b8b8e914fa62d6ce7944ba95af`, conteneur `healthy`, HTTP 200 local sur le port 3001, migrations à jour dans les journaux.

**Tests** : aucun test avec corps volumineux (aucun en production) ; DOS-01 (relevé statique, rapporté) et DOS-02 (413) à rejouer en laboratoire.

**Risques résiduels** : les autres routes restent sous la limite globale de 3 Go avant authentification ; le 413 effectif n'est pas observé.

**Décision** : DOS-02 est consigné « corrigé et déployé (preuve statique) » et non « validé ». Ne pas envoyer de corps volumineux en production.

### D6 --- INT-17 à INT-20, UPLOAD-02, RACE-01

Traiter après définition du contrat, tests isolés et vérification des
effets sur système de fichiers, SQL, `DocumentVectors`, LanceDB et
cache. Aucun test de collision ou de suppression sur la production.

**État au 25/10/2026 :** ces points sont **inchangés** et ne sont pas
de nouvelles découvertes. Entre v1.17.0 et la branche principale, les
routes `move-files`, `remove-folder` et `create-folder` de
`server/endpoints/api/document/index.js` ne diffèrent pas (les différences
portent sur la propagation du résultat d'upload, l.163-165, 315-322,
471-505, 637-652) ; `server/endpoints/document.js`,
`server/utils/files/purgeDocument.js` et `server/utils/files/multer.js`
sont identiques.

### D7 --- ALLM-06 : risque de cache vectoriel obsolète, ouvert (25/10/2026)

Décision [VAL] : le risque reste **ouvert** ; il ne sera pas déclaré
résolu sans correction vérifiée et tests reproductibles. Prochaine étape :
revue des tests automatisés amont et des parcours d'import, puis RAG-03A
et RAG-03B en laboratoire. Toute correction est évaluée et validée hors
production avant déploiement.

## 5. Registre des problèmes et corrections

### ALLM-12 --- Routes `env-dump` sans authentification

**Statut (25/10) :** comportement intentionnel selon l'amont et selon la
conclusion validée [VAL] ; CP-3 non appliqué automatiquement ; point
**non clos** : conséquences à analyser et image 1.19.0 à revérifier. Faits,
hypothèses, risques, options et décision : voir D1.

Résumé des faits : [C17] aucune authentification sur
`/v1/system/env-dump` (l.16) et `/env-dump` (l.91) ; `dumpENV()` écrit
`/app/server/.env` du conteneur, ne renvoie aucun secret [VAL]. Aucun
appel fonctionnel à ces routes sur la production.

### ALLM-13 --- Import limité aux espaces autorisés

La passerelle impose une allowlist et une clé d'import distincte. Exiger
au moins un workspace autorisé ; refuser slugs inconnus/non autorisés
avant traitement du fichier. La clé d'import ne fonctionne pas sur les
routes administratives ou de suppression. [VAL] Aucune clé API générale
n'est exposée à n8n ; ne pas supposer qu'une clé valide garantit des
droits limités (voir D2).

### ALLM-04 / ALLM-09 --- Portée des clés Developer API

Selon `SECURITY.md` v1.17.0 (l.49-53) [C17], les Developer API keys sont
des identifiants système donnant un accès équivalent administrateur et ne
sont pas liées à un utilisateur/workspace : ce n'est pas une élévation
de privilèges mais un risque de **gouvernance** des clés. Les routes API
ne doivent pas être assimilées aux contrôles d'appartenance de
l'interface web. `POST /v1/workspace/:slug/vector-search` renvoie
notamment `source.text`. Ne jamais remettre une clé générale à n8n ou à
un utilisateur final. Constat déjà établi : ne pas le présenter comme
nouveau.

### ALLM-05 --- Portée de `purgeDocument()`

**Fait [C17]** : `server/utils/files/purgeDocument.js` l.13-20 :
`purgeDocument(filename)` retourne si le nom est absent ou si
`normalizePath(filename)` est invalide (l.14), puis appelle
`purgeVectorCache(filename)` (l.16) et `purgeSourceDocument(filename)`
(l.17), puis retire l'association documentaire dans **chaque** workspace
via `Document.removeDocuments(workspace, [filename])` (l.20). La route
`DELETE /v1/system/remove-documents` (`server/endpoints/api/system/index.js`
l.218 ; l.220 en [CM]) est protégée par `validApiKey` et appelle
`purgeDocument(name)` pour chaque nom (l.272).
**Qualification** : portée globale établie ; risque opérationnel si une
clé très privilégiée est utilisée par un workflow insuffisamment
contrôlé. Pas de vulnérabilité autonome démontrée (modèle de privilèges
des clés, voir ci-dessus). **Décision** : traiter les clés comme secrets
hautement privilégiés ; ne pas révoquer `Import-Corpus-IA` avant
inventaire de ses consommateurs (D3). **Test** : aucun.

### ALLM-10 --- Protection de suppression : disponible, désactivée

Voir D4 pour les faits (fichiers et routes), les limites et la décision à
prendre. [IMG] Variable absente de l'environnement actif. Ne pas
affirmer que la protection est active ; ne pas la qualifier de
vulnérabilité confirmée. Test isolé : OPS-02 (trois routes ; valeur `1`
puis `0`).

### DOS-02 --- Parseurs HTTP à limite globale de 3 Go

**Statut : corrigé et déployé dans l'image 1.19.0 (preuve statique [IMG]) ;
comportement HTTP non testé ; risque résiduel sur les autres routes.**
Voir D5 pour les références de lignes et les preuves.

Historique (v1.17.0 [C17]) : `bodyParser.text`, `bodyParser.json` et
`bodyParser.urlencoded` utilisent `FILE_LIMIT = "3GB"` (l.52, 66-70) et
sont montés avant plusieurs contrôles d'authentification.
`/api/embed/:embedId/stream-chat` était une zone d'attention. Le risque
de saturation est une inférence d'ordre des middlewares ; aucun crash de
production n'a été reproduit.

Vérifications restantes : DOS-01 et DOS-02 en laboratoire ; décider si la
limite globale de 3 Go des autres routes est acceptable. Aucun corps
volumineux en production.

### ALLM-14 --- Succès d'import trompeur et vecteurs orphelins

**Constat v1.17.0 [C17]** : les routes d'upload ne propagent pas le
résultat de `Document.api.uploadToWorkspace(...)` (appels l.164, 316, 473,
638 de `server/endpoints/api/document/index.js`, résultat ignoré).
`Document.addDocuments` (`server/models/documents.js` l.83) insère les
vecteurs LanceDB (l.137) **avant** de créer l'association SQL
`workspace_documents` (l.159) ; aucune suppression compensatoire n'est
visible. Une transaction SQL ne couvre pas LanceDB.

**Différence amont [CM], non vérifiée dans l'image 1.19.0** :
`uploadToWorkspace(wsSlugs, docLocations = [])` (l.372) renvoie
`{ success, partial, error }` ; les routes d'upload testent
`embedded.success` (api/document l.163, 317, 477, 648 : HTTP 500 en cas
d'échec total, 200 avec `success: false` en cas d'échec partiel). En cas
d'échec SQL après insertion vectorielle (`documents.js` l.179), un retour
arrière **au mieux** est tenté : `VectorDb.deleteDocumentFromNamespace`
(l.196) puis `DocumentVectors.delete({ docId })` (l.211), avec journalisation
des erreurs de nettoyage. Ce retour arrière n'est pas atomique.

**Hypothèse** : l'image 1.19.0 contient ce code (cohérent avec la
référence `documents.js` l.157-161 de la passation du 25/10), non vérifié
par recherche du retour arrière dans l'image.
**Risque résiduel** : état à réparer si le retrait des vecteurs échoue.
**Décision** : ne pas clore ; vérifier l'image, puis RAG-04 et RAG-05. Ne
pas supprimer automatiquement le fichier source en cas d'échec ; ne pas
présenter la compensation comme atomique.

### INT-17 --- Source de déplacement qui n'est pas un fichier ordinaire

La route `move-files` vérifie la frontière des chemins mais ne garantit
pas, dans le code examiné, que la source est un fichier régulier via
`lstat(...).isFile()`. Définir une politique pour les liens symboliques
et refuser les sources qui ne sont pas des fichiers réguliers.

### INT-18 --- Destination existante et risque d'écrasement

`fs.rename()` peut remplacer une destination existante sur POSIX. Une
vérification `exists()` puis `rename()` est vulnérable à une course et
ne garantit pas « no replace ». **Ne pas recommander `O_EXCL` seul comme
protection d'un `rename()`** : cette option de création ne rend pas, à
elle seule, le renommage atomique sans écrasement.

Avant de choisir une primitive, vérifier sa compatibilité avec la
version Node.js, macOS/Linux et le système de fichiers ciblé. Refuser
toute destination existante et prouver le comportement par test
concurrent isolé. Préserver source, destination, métadonnées et vecteurs
si le déplacement est refusé.

### INT-19 --- Déplacements en lot : résultats individuels, pas de fausse atomicité

**Décision retenue : Option B.** Un rollback après plusieurs `rename()`
partiellement exécutés peut échouer si une source a entre-temps été
déplacée ou modifiée. La compensation applicative ne garantit pas
l'atomicité.

Prévalider structure du lot, sources, destinations, répétitions,
destinations dupliquées et conflits internes avant la première opération
physique. Résultat explicite par opération : - `moved` : déplacement
réalisé ; - `refused` : refus avant exécution, avec motif ; -
`not_executed` : opération non lancée, avec motif ; - `failed` :
opération lancée mais échouée.

La réponse globale indique complet/partiel/échec ; aucun succès global
ne masque un échec. Les preuves doivent permettre de réconcilier système
de fichiers, SQL, `DocumentVectors`, LanceDB et cache. Ne pas promettre
de rollback atomique.

### INT-20 / PUR-01 / PUR-02 --- Purge et faux succès

`purgeFolder()` peut retourner silencieusement pour un dossier protégé,
inexistant ou invalide ; les routes peuvent répondre avec succès sans
suppression. Le nettoyage des index n'est pas récursif alors que la
suppression physique du dossier l'est.

Contrat requis : `deleted`, `protected`, `invalid`, `not_found`,
`partial_failure`, `failure`. Les routes API et Web doivent propager le
résultat et des statuts HTTP cohérents. Préserver la protection de
`custom-documents`, y compris variantes de casse, chemins imbriqués et
tentatives de contournement. Nettoyer récursivement
associations/index/cache/vecteurs avant suppression physique et gérer
explicitement erreurs SQL et rejets asynchrones.

**Nomenclature canonique dans tous les documents :** - `PUR-01` =
cohérence de purge (récursivité, SQL, vecteurs, cache, erreurs). -
`PUR-02` = contrat de résultat et réponse HTTP. - `INT-20` = incident
parent.

### UPLOAD-02 --- Fichiers temporaires orphelins

Multer écrit dans `collector/hotdir` avant la validation de
`addToWorkspaces`. Une erreur 422 ou l'indisponibilité du Collector peut
laisser un temporaire. L'authentification est en amont ; ce n'est pas un
contournement d'authentification. Prévoir un nettoyage idempotent
compatible avec le cycle de vie réel. Tester erreur de validation et
Collector indisponible, sans supprimer les fichiers légitimes en cours
de traitement.

### ALLM-06 / ALLM-15 --- Cache vectoriel dérivé du chemin (ouvert)

**Qualification retenue [VAL] :** « Risque de réutilisation de vecteurs
obsolètes lorsque le contenu change sous un chemin constant et que le
cache n'a pas été invalidé. Le mécanisme est prouvé dans le code ;
l'impact dépend du parcours d'import et de l'état du cache. »

**Faits démontrés par le code ([C17] et [CM] : fichiers identiques)**
- `server/utils/files/index.js` : `cachedVectorInformation` l.271 (clé `uuidv5(filename, uuidv5.URL)` l.274), `storeVectorResult` l.290 (l.297), `purgeVectorCache` l.321 (l.323). La lecture du cache vérifie l'existence du fichier et lit ses chunks ; aucune empreinte de contenu, date de modification ni version n'est comparée.
- `server/utils/vectorDbProviders/lance/index.js` : `addDocumentToNamespace` l.312, `skipCache = false` l.316, `if (!skipCache)` l.324 puis `cachedVectorInformation(fullFilePath)` l.325 : les chunks du cache sont rechargés et insérés sans recalcul à partir du `pageContent` courant.
- Appels sans 4e argument donc `skipCache = false` : `server/jobs/embedding-worker.js` l.108-112 ; `server/models/documents.js` l.137 [C17] / l.157 [CM]. Synchronisation surveillée : le document principal passe `true` ([C17] `sync-watched-documents.js` l.138-147 ; [CM] `reembedDocument` l.97-113, appel l.171-177) ; les références du même document dans d'autres workspaces omettent l'argument ([C17] l.185-193 ; [CM] l.203-208) et réutilisent le cache actualisé.
- `purgeVectorCache` n'est appelée (hors tests) que par `purgeDocument.js` l.16 et `purgeFolder` l.68 : **retirer un document d'un workspace ne purge pas son cache**.

**Précision de portée [C17], lecture de code non testée.** Chaque
conversion du Collector écrit un nouveau fichier
`custom-documents/<nom-slugifié>-<identifiant>.json` (`collector/processSingleFile/convert/asTxt.js` l.36 `id: v4()` et l.51 ; `asPDF/index.js` l.57 et l.78 ; `asDocx`, `asEPub`, `asImage`, `asMbox`, `asOfficeMime`, `asAudio`, `asXlsx` : même motif de nom ; `collector/utils/files/index.js` l.120-152). Le ré-upload d'un fichier NAS modifié obtient donc normalement un **nouveau chemin**, donc une nouvelle clé de cache. Le scénario « même chemin, contenu différent » concerne surtout le ré-embedding d'un JSON existant (JSON modifié en place puis retiré et rajouté au workspace, ou ajouté à un autre workspace ; parcours de synchronisation). Cela peut réduire l'exposition du flux d'import ordinaire ; cela **ne clôt pas** le risque.

**Limites de la preuve.** Non démontré : que tous les réimports soient affectés ; qu'un import standard rencontre un cache préexistant ; que toutes les voies d'invalidation aient été examinées ; qu'un défaut observable ait été reproduit sur des données de production.

**Décision.** Rester ouvert (D7). Définir une identité stable (chemin NAS normalisé + empreinte + modèle d'embedding), une politique de remplacement/version/doublon et une portée autorisée. Ne pas activer le remplacement automatique avant validation. Tests : RAG-03A, RAG-03B.

### ALLM-16 --- Purge physique récursive, nettoyage d'index non récursif

`purgeFolder()` énumère le premier niveau pour le nettoyage des index
puis supprime physiquement récursivement. Certaines routes acceptent les
chemins imbriqués ; `Document.addDocuments()` et `fileData()` peuvent
les lire. `Document.removeDocuments()` peut intercepter des erreurs SQL
et `purgeVectorCache()` est asynchrone avec gestion incomplète de
certains rejets. Corriger le parcours d'index récursif et gérer les
erreurs avant suppression physique.

### RACE-01 --- Collision possible de fichiers temporaires homonymes

**Fait de code [C17][CM]** : `server/utils/files/multer.js`
`fileUploadStorage` (l.11-25) et `fileAPIUploadStorage` (l.31-45) nomment
le fichier temporaire d'après le nom d'origine assaini
(`cb(null, file.originalname)`, l.19-23 et l.39-43), sans suffixe
unique ; ils servent `handleFileUpload` et `handleAPIFileUpload`
(`api/document/index.js` l.52 et l.180 ; `workspaces.js` l.124, 825,
903). Seul `pfpUploadStorage` (l.68-85) utilise un UUID.

**Hypothèse non testée** : deux uploads simultanés du même nom écrasent
ou mélangent le fichier temporaire avant lecture par le Collector. Tester
uniquement en isolé deux uploads simultanés de même nom et contenus
différents. Chaque traitement doit indexer le bon contenu. Si confirmé,
utiliser un identifiant temporaire unique et conserver séparément le nom
d'affichage.

### OPS-01 --- Sauvegarde/restauration

Sauvegarder volume et configuration avant toute future modification,
sans exposer les secrets. Vérifier une restauration en environnement
isolé ; une archive créée ne prouve pas qu'elle est restaurable.

## 6. Matrice maîtresse de tests

**Aucun test ci-dessous n'est déclaré exécuté dans le cadre de ce
plan** (32 identifiants). Tests uniquement en environnement de
laboratoire isolé avec données factices, après vérification que le
conteneur de laboratoire est démarré. Une inspection statique ne remplace
pas un test fonctionnel. SEC-02 à SEC-05 ne concernent que l'évaluation
éventuelle de CP-3 (D1) ; RAG-03 est scindé en RAG-03A/B (ALLM-06) ;
SEC-10 est nouveau (conséquences de `dumpENV()`).

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
| PUR-01 | Purge | Purge dossier factice avec sous-dossiers | Pas de référence résiduelle non signalée dans SQL, `DocumentVectors`, LanceDB ou cache | À exécuter |
| PUR-02 | Contrat HTTP | `custom-documents`, dossier absent, chemin invalide/imbriqué | `protected`/`not_found`/`invalid` distincts ; aucun faux succès | À exécuter |
| OPS-01 | Sauvegarde | Sauvegarde puis restauration isolée (dont l'archive `storage-anythingllm.tar.gz` du 25/10) | Restauration fonctionnelle et intégrité vérifiée | À exécuter |
| OPS-02 | Protection | Protection activée en isolé (valeur `1`, puis valeur `0` : la présence seule suffit-elle ?) ; suppression d'un workspace factice par les trois routes (`/admin/workspaces/:id`, `/workspace/:slug`, `/v1/workspace/:slug`) | 403 « Workspace deletion is blocked by the system administrator. » ; workspace préservé | À exécuter |
| DOS-01 | Limite HTTP | Inspection statique de l'image de laboratoire pour `/api/embed` | Code réellement présent documenté ; présence seule ne prouve pas l'activité | Inspection statique de l'image active rapportée le 25/10 [IMG] ; à rejouer sur l'image de laboratoire |
| DOS-02 | Limite HTTP | Dépassement de la limite `/api/embed` dans l'isolé | HTTP 413 « Request payload too large. » ; processus reste sain ; comparer avec une route hors `/api/embed` (limite globale 3 Go) | À exécuter |
| INT-17 | Déplacement | Répertoire comme source | Refus ; aucun déplacement ; SQL/vecteurs inchangés | À exécuter |
| INT-18A | Déplacement | Destination existante mais non indexée | Refus sans écrasement ; source/destination préservées | À exécuter |
| INT-18B | Déplacement | Destination existante déjà indexée | Refus sans altération du contenu, SQL, `DocumentVectors`, LanceDB et cache | À exécuter |
| INT-18C | Course | Deux opérations concurrentes vers la même destination | Au plus un succès ; aucune corruption ; garantie no-replace prouvée | À exécuter |
| INT-19A | Lot | Lot valide | Chaque résultat `moved` ; cohérence disque, SQL, mapping, cache | À exécuter |
| INT-19B | Lot | Élément invalide au milieu du lot | Résultats `moved`/`refused`/`not_executed`/`failed` ; partiel explicitement signalé | À exécuter |
| INT-19C | Lot | Sources répétées, destinations dupliquées, conflits internes | Prévalidation rejette avant première mutation physique | À exécuter |
| UPLOAD-02A | Upload | Rejet de validation après écriture Multer | Temporaire supprimé ; fichiers légitimes préservés | À exécuter |
| UPLOAD-02B | Upload | Collector indisponible après réception | Nettoyage déterministe ou reprise explicite ; pas d'accumulation silencieuse | À exécuter |
| RACE-01 | Course | Deux uploads simultanés de même nom, contenus distincts | Chaque traitement indexe le bon contenu ; aucune collision/corruption | À exécuter |

### Critères de clôture

Pour les tests de cohérence, ne pas se limiter au code HTTP ou à
`success: true`. Comparer l'état initial/final sur : 1. système de
fichiers et chemins exacts ; 2. associations SQL ; 3. enregistrements
`DocumentVectors` ; 4. vecteurs dans le namespace LanceDB concerné ; 5.
cache vectoriel correspondant ; 6. résultat HTTP et logs expurgés de
secrets.

Un test est réussi seulement si le résultat attendu et l'absence
d'effets secondaires inattendus sont vérifiés. Sinon, noter échec,
partiel ou non concluant.

## 7. Conditions de déploiement et retour arrière

Avant toute intervention : image identifiée ; tests pertinents réussis en
laboratoire isolé (conteneur de laboratoire vérifié démarré) ; sauvegarde
et restauration d'essai vérifiées ; diff exact revu ; dépendances scripts
vérifiées pour ALLM-12 si CP-3 est évalué ; autorisation explicite de
Florian. `node --check` ne prouve pas le fonctionnement HTTP.

**Retour arrière disponible depuis la mise à jour du 25/10/2026 [IMG] :**
sauvegarde `/Users/florian/services/ai-stack/backup-anythingllm-20261025-091540/`
(`compose.yaml`, `ancienne-image-id.txt`, `storage-anythingllm.tar.gz`) et
tag `mintplexlabs/anythingllm:rollback-20261025-091540`. La restauration
n'a pas été essayée (OPS-01). Revenir à l'ancienne image rétablirait aussi
le code v1.17.0 (sans la limite `/api/embed`). Ne pas arrêter, recréer ou
redémarrer la production pour un test non autorisé.

**Préparation de retour arrière CP-3 (pas une autorisation d'exécution ;
applicable seulement si CP-3 est un jour autorisé) :** 1. sauvegarder les
deux fichiers d'origine et leurs empreintes ; 2. conserver le diff exact ;
3. en cas d'anomalie, restaurer les deux fichiers par une procédure
contrôlée ; 4. redémarrer uniquement selon la procédure approuvée ; 5.
vérifier la santé et les logs sans secret ; 6. préserver les liaisons de
ports LAN existantes.

## 8. Registre des décisions

| ID | Décision | État | Prochaine étape |
|---|---|---|---|
| D1 | ALLM-12 : CP-3 non appliqué automatiquement ; analyse des conséquences puis décision | Révisée le 25/10 (remplace « retenue sous conditions ») | Options A/B/C ; SEC-01 et SEC-10 en laboratoire ; décision et autorisation de Florian |
| D2 | Passerelle dédiée, Option A, liste blanche | Retenue ; reconfirmée [VAL] le 25/10 | Spécifier et tester allowlist/refus avant n8n (SEC-07 à SEC-09) |
| D3 | Usage de `Import-Corpus-IA` | À vérifier ; ne pas révoquer avant inventaire | Examiner logs et workflows sans afficher la clé |
| D4 | `WORKSPACE_DELETION_PROTECTION` | Désactivée ; décision de Florian à prendre | Décider ; OPS-02 en laboratoire |
| D5 | DOS-02 | Corrigé et déployé (preuve statique [IMG]) | DOS-01 et DOS-02 en laboratoire |
| D6 | INT-17 à INT-20, UPLOAD-02, RACE-01 | En attente, inchangés | Corriger après tests et contrôle d'intégrité |
| D7 | ALLM-06 / ALLM-15 | Ouvert [VAL] | Revue des tests amont, RAG-03A/B |
| GIT-01 | Écriture GitHub par connecteur | Non résolue | Publication manuelle par Florian |

## 9. Sources de code et références

Références amont (dépôt public `Mintplex-Labs/anything-llm`) :
**[C17]** tag `v1.17.0`, commit `fa7ec877f005a21ede94888b3b8618b700343857` ;
**[CM]** commit `a5bb8b9c7b1262635ea58fc17d4899619cbf58e9` (23/10/2026, `package.json` 1.19.0). Aucun tag
`v1.19.0` ; dernier tag `v1.18.0`.

-   `server/endpoints/api/system/index.js` --- `/v1/system/env-dump`, `/v1/system/remove-documents`.
-   `server/endpoints/system.js` --- `/env-dump`, `/system/remove-folder`.
-   `server/utils/middleware/validApiKey.js` --- validation clé API.
-   `server/utils/middleware/validatedRequest.js` --- session.
-   `server/utils/middleware/multiUserProtected.js` --- `flexUserRoleValid`.
-   `server/utils/middleware/workspaceDeletionProtection.js` --- protection de suppression.
-   `server/utils/helpers/updateENV.js` --- `dumpENV()`.
-   `server/endpoints/api/document/index.js` --- upload, `create-folder`, `remove-folder`, `move-files`.
-   `server/endpoints/document.js` --- routes web de déplacement.
-   `server/endpoints/admin.js`, `server/endpoints/workspaces.js`, `server/endpoints/api/workspace/index.js` --- suppression de workspace.
-   `server/models/documents.js` --- traitement, LanceDB et associations SQL.
-   `server/utils/vectorDbProviders/lance/index.js` --- cache/vecteurs.
-   `server/utils/files/index.js` --- clé de cache, `purgeVectorCache`.
-   `server/utils/files/purgeDocument.js` --- `purgeDocument()`, `purgeFolder()`.
-   `server/utils/files/multer.js` --- fichiers temporaires.
-   `server/jobs/embedding-worker.js`, `server/jobs/sync-watched-documents.js` --- parcours d'import et de synchronisation.
-   `collector/processSingleFile/convert/*` et `collector/utils/files/index.js` --- nommage des documents convertis.
-   `server/index.js` --- parseurs globaux, `FILE_LIMIT`, `EMBED_BODY_LIMIT`.
-   `server/endpoints/embed/index.js` --- endpoint public embed.
-   `SECURITY.md` --- v1.17.0 : Developer API keys (l.49-53) ; branche principale : `env-dump` (l.65-76).
-   `BARE_METAL.md` --- appel à `/api/env-dump` (l.84).
-   Commit upstream `c729bf480ab146063b6c9ef287182384b9b080e0` --- limite `/api/embed` (date non revérifiée le 25/10).

Les numéros de ligne peuvent varier. Revalider les références sur le
commit ou l'image effectivement audités avant toute modification.

## 10. Historique

-   v0.1 --- 20 octobre 2026 : première spécification.
-   v0.2 --- 23 octobre 2026 : patch CP-3, architecture et première
    matrice.
-   v0.3 --- 23 octobre 2026 : ALLM-12 reclassé ; ajout DOS-02, INT-17 à
    INT-20, UPLOAD-02, RACE-01 ; complément ALLM-16 ; 21 tests.
-   v0.4 --- 24 octobre 2026 : D1 CP-3 sous conditions ; D2 passerelle
    dédiée ; INT-19 fixé sur résultats individuels avec `failed` ;
    matrice maîtresse harmonisée ; séparation tests UPLOAD-02/RACE-01 ;
    INT-18 scindé (destination indexée/non indexée/course concurrente) ;
    contrôle du disque, SQL, `DocumentVectors`, LanceDB et cache ;
    correction de la recommandation `O_EXCL` ; conditions de production
    renforcées.
-   v0.5 --- 25 octobre 2026 : instance passée en 1.19.0 ; nouveau §2
    (état, sources de preuve, conclusions validées, vérifications
    restantes) ; D1 révisée (CP-3 non appliqué automatiquement, options
    A/B/C) ; D4 révisée (protection facultative, désactivée, décision à
    prendre) ; D5 (DOS-02 corrigé et déployé, preuve statique) ; D7
    (ALLM-06 ouvert) ; ajout ALLM-05 ; ALLM-14 : différences amont ;
    précision de portée du cache (nouveau chemin à chaque conversion) ;
    RACE-01 : nommage sans suffixe établi dans le code ; matrice portée à
    32 identifiants (RAG-03A/B, SEC-10) ; références croisées corrigées
    (Journal v0.8, Livret v0.6 ; la v0.4 citait Journal v0.6 et Livret
    v0.4).

------------------------------------------------------------------------

*Ce document est un plan de correction et de validation. Il ne constitue
ni un patch exécutable, ni une preuve que les problèmes ont été
corrigés, ni une autorisation de modifier la production.*
