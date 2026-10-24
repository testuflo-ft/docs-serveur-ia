# Correctifs ciblés --- AnythingLLM 1.17.0

*Version 0.4 --- 24 octobre 2026*\
*Statut : plan révisé ; matrice maîtresse consolidée. Aucun correctif
déployé et aucun test de cette matrice déclaré exécuté.*

## 1. Objet et règles impératives

Ce document constitue le plan opérationnel de référence pour les
correctifs ciblés AnythingLLM 1.17.0. Il complète le Journal des
Incidents v0.6 et le Livret Technique v0.4 ; il fixe la matrice
maîtresse et les décisions retenues.

**Conventions :** fait vérifié = constat direct dans le code examiné ;
hypothèse = scénario non reproduit ; à vérifier = dépend de l'image ou
d'une inspection en attente ; non testé = aucune validation
fonctionnelle ; décision retenue = orientation, pas autorisation de
modifier la production.

**Garde-fous :** 1. Aucun test destructif ou mutatif sur la production.
2. Aucun déploiement, changement de configuration, redémarrage non
planifié ou modification du code installé sans autorisation explicite.
3. Aucun commit/publication GitHub par l'assistant : le connecteur a
renvoyé `403 Resource not accessible by integration`; publication
manuelle. 4. Les routes `env-dump` ne sont testées que dans un conteneur
isolé, car `dumpENV()` écrit `/app/server/.env`. 5. Préserver l'accès
LAN direct Ethernet 10 Gb/s. Ne pas lier les ports Docker uniquement à
`127.0.0.1` et ne pas faire passer les flux LAN par Tailscale. 6. Le
montage NAS `Corpus-IA` reste en lecture seule. Utiliser des fichiers
factices pour les tests. 7. Ne jamais consigner de secrets, clés, mots
de passe ou valeurs sensibles d'environnement. 8. Aucun import n8n réel
avant validation de l'autorisation, des erreurs et de l'intégrité
vectorielle.

## 2. Vérification obligatoire avant toute intervention

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
disponibles. La version déclarée 1.17.0 et l'ID d'image ne prouvent pas
à eux seuls la provenance complète. Le fichier `server/index.js` a été
comparé au tag v1.17.0, mais cela ne démontre pas que tous les fichiers
de l'image correspondent au tag.

Avant D1/ALLM-12, rechercher dans les scripts et configurations
effectivement utilisés les appels à `GET /api/env-dump` et
`GET /v1/system/env-dump` sans authentification. Ne pas appeler les
routes de production pour les tester.

## 3. Décisions de référence

### D1 --- ALLM-12 : privilégier CP-3 sous conditions

**Décision retenue :** appliquer CP-3 après vérification de l'image
réellement exécutée, recherche des appels opérationnels non
authentifiés, tests SEC-01 à SEC-05 en environnement isolé, sauvegarde
et autorisation explicite.

Dans le tag v1.17.0 audité, `GET /v1/system/env-dump` ne porte pas
`[validApiKey]`, alors que la route voisine `/v1/system` le porte.
L'`openapi.json` de v1.17.0 documente une réponse 403 `InvalidAPIKey`,
tandis qu'un commentaire de la branche par défaut décrit la route comme
volontairement non authentifiée. L'ambiguïté est réelle ; le commentaire
ultérieur ne prouve pas l'intention de v1.17.0. Le patch réduit une
exposition inutile à faible coût. Le risque de compatibilité bare-metal
est non bloquant pour cette installation Docker, mais doit rester
documenté.

**CP-3 préparé :** - Tag de référence : `v1.17.0`, commit
`fa7ec877f005a21ede94888b3b8618b700343857`. - SHA-256 du patch :
`b27d886c07d890616ef12d072d0848195214457dc07836ba34417a2940ca1a7e`. -
Vérifications déjà rapportées : application sur archive propre avec
`--whitespace=error` et `node --check` sur les deux fichiers. - État :
vérifié statiquement, non déployé, non testé en HTTP.

Modifications : - `server/endpoints/system.js`, route `/env-dump` :
ajouter `[validatedRequest, flexUserRoleValid([ROLES.admin])]`. -
`server/endpoints/api/system/index.js`, route `/v1/system/env-dump` :
ajouter `[validApiKey]`.

En mode multi-utilisateur, la route web exige une session valide et un
rôle administrateur. En mode mono-utilisateur, le comportement existant
de `flexUserRoleValid` peut contourner le contrôle de rôle, mais la
validation de session demeure. La route API exige une clé API valide.
Relire le diff exact avant déploiement. Le script bare-metal décrit dans
`BARE_METAL.md` appelle `/api/env-dump` sans authentification et
pourrait recevoir 401 en mode multi-utilisateur ; cette installation est
Docker.

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

### D3 --- Clé `Import-Corpus-IA`

Consulter les journaux disponibles sans afficher la valeur de la clé.
Confirmer son usage par Open WebUI ou un autre consommateur avant toute
révocation. La traiter comme une clé à portée administrative dans
l'instance.

### D4 --- Protection de suppression des workspaces

`WORKSPACE_DELETION_PROTECTION` a été signalée absente de
`anythingllm.env`. Recommandation : ajouter
`WORKSPACE_DELETION_PROTECTION=1` lors d'un redémarrage planifié, après
autorisation et sauvegarde. Aucune modification ni redémarrage dans le
cadre de cette révision documentaire. Test isolé : OPS-02.

### D5 --- DOS-02

Vérifier la présence et l'activité effective de la limite dédiée à
`/api/embed` dans l'image réelle. Si absente, étudier un backport en
environnement isolé. Ne pas envoyer de corps volumineux en production.
Le correctif upstream ne résout pas à lui seul toutes les routes
utilisant la limite globale de 3 Go.

### D6 --- INT-17 à INT-20, UPLOAD-02, RACE-01

Traiter après définition du contrat, tests isolés et vérification des
effets sur système de fichiers, SQL, `DocumentVectors`, LanceDB et
cache. Aucun test de collision ou de suppression sur la production.

## 4. Registre des problèmes et corrections

### ALLM-12 --- Routes `env-dump` sans authentification

Dans v1.17.0, `/v1/system/env-dump` ne porte pas `[validApiKey]` et
`/api/env-dump` ne comporte pas les middlewares de session/rôle dans le
code audité. `dumpENV()` écrit `/app/server/.env` en production. La
réponse HTTP ne renvoie pas les valeurs des secrets, mais l'écriture
constitue un effet de bord. Appliquer D1 ; aucun appel fonctionnel à ces
routes sur la production.

### ALLM-13 --- Import limité aux espaces autorisés

La passerelle impose une allowlist et une clé d'import distincte. Exiger
au moins un workspace autorisé ; refuser slugs inconnus/non autorisés
avant traitement du fichier. La clé d'import ne fonctionne pas sur les
routes administratives ou de suppression.

### ALLM-04 / ALLM-09 --- Portée des clés Developer API

Selon `SECURITY.md` v1.17.0, les Developer API keys donnent un accès
système étendu et ne sont pas liées à un utilisateur/workspace. Les
routes API ne doivent pas être assimilées aux contrôles d'appartenance
de l'interface web. `POST /v1/workspace/:slug/vector-search` renvoie
notamment `source.text`. Ne jamais remettre une clé générale à n8n ou à
un utilisateur final.

### ALLM-10 --- Protection de suppression inactive

La variable a été signalée absente. Prévoir
`WORKSPACE_DELETION_PROTECTION=1` au prochain redémarrage planifié,
après autorisation. Tester uniquement en isolé que la suppression d'un
workspace factice est refusée.

### DOS-02 --- Parseurs HTTP à limite globale de 3 Go

Dans `server/index.js` v1.17.0, `bodyParser.text`, `bodyParser.json` et
`bodyParser.urlencoded` utilisent `FILE_LIMIT = "3GB"` et sont montés
avant plusieurs contrôles d'authentification.
`/api/embed/:embedId/stream-chat` est une zone d'attention. Le risque de
saturation est une inférence d'ordre des middlewares ; aucun crash de
production n'a été reproduit.

Vérifier `EMBED_BODY_LIMIT` dans l'image réelle et le comportement HTTP
dans un environnement isolé. Distinguer présence statique du code et
activation effective. Aucun corps volumineux en production.

### ALLM-14 --- Succès d'import trompeur et vecteurs orphelins

Les routes d'upload ont été observées comme ne propageant pas
systématiquement le résultat de `Document.api.uploadToWorkspace(...)`.
Standardiser le résultat, propager l'échec et distinguer réception,
conversion et indexation. Ne pas supprimer automatiquement le fichier
source en cas d'échec.

L'insertion LanceDB peut précéder la création d'associations SQL
`workspace_documents`. En cas d'échec SQL, la compensation n'est pas
garantie. Tester la suppression compensatoire ; sinon signaler un état
nécessitant réparation. Une transaction SQL ne couvre pas LanceDB : ne
pas présenter la compensation comme atomique.

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

### ALLM-15 --- Cache vectoriel dérivé du chemin

La clé de cache a été observée comme dérivée du chemin
(`uuidv5(filename, uuidv5.URL)`) plutôt que du contenu. Une modification
au même chemin peut réutiliser des chunks périmés dans certains
parcours. Définir identité stable (chemin NAS normalisé + empreinte),
politique de remplacement/version/doublon et portée autorisée. Ne pas
activer le remplacement automatique avant validation.

### ALLM-16 --- Purge physique récursive, nettoyage d'index non récursif

`purgeFolder()` énumère le premier niveau pour le nettoyage des index
puis supprime physiquement récursivement. Certaines routes acceptent les
chemins imbriqués ; `Document.addDocuments()` et `fileData()` peuvent
les lire. `Document.removeDocuments()` peut intercepter des erreurs SQL
et `purgeVectorCache()` est asynchrone avec gestion incomplète de
certains rejets. Corriger le parcours d'index récursif et gérer les
erreurs avant suppression physique.

### RACE-01 --- Collision possible de fichiers temporaires homonymes

Hypothèse non confirmée de bout en bout : le chemin temporaire Multer
semble construit à partir du nom original assaini sans suffixe unique
visible. Tester uniquement en isolé deux uploads simultanés de même nom
et contenus différents. Chaque traitement doit indexer le bon contenu.
Si confirmé, utiliser un identifiant temporaire unique et conserver
séparément le nom d'affichage.

### OPS-01 --- Sauvegarde/restauration

Sauvegarder volume et configuration avant toute future modification,
sans exposer les secrets. Vérifier une restauration en environnement
isolé ; une archive créée ne prouve pas qu'elle est restaurable.

## 5. Matrice maîtresse de tests

**Aucun test ci-dessous n'est déclaré exécuté dans le cadre de ce
plan.** Tests uniquement en environnement isolé avec données factices.
Une inspection statique ne remplace pas un test fonctionnel.

  -----------------------------------------------------------------------------------------------------------------
  ID             Catégorie      Scénario                 Résultat attendu / preuve                   État
  -------------- -------------- ------------------------ ------------------------------------------- --------------
  SEC-01         ALLM-12        `/v1/system/env-dump`    Caractériser le build non corrigé ; après   À exécuter
                                sans bearer, build       CP-3, refus sans clé ; aucun `.env` de      
                                avant/après CP-3         production touché                           

  SEC-02         ALLM-12        `/api/env-dump` sans     Après patch : refus en multi-utilisateur ;  À exécuter
                                session, avant/après     aucun `.env` modifié lors du refus          
                                CP-3                                                                 

  SEC-03         ALLM-12        `/api/env-dump` avec JWT Succès après patch ; écriture uniquement    À exécuter
                                admin valide,            dans le conteneur isolé                     
                                `NODE_ENV=production`,                                               
                                conteneur isolé                                                      

  SEC-04         ALLM-12        `/v1/system/env-dump`    Succès après patch ; écriture uniquement    À exécuter
                                avec clé valide,         dans le conteneur isolé                     
                                conteneur isolé                                                      

  SEC-05         ALLM-12        `/api/env-dump` avec JWT Refus ; aucun `.env` modifié                À exécuter
                                utilisateur standard,                                                
                                `MULTI_USER_MODE=true`                                               

  SEC-06         Sécurité       Clé API invalide sur     Refus HTTP, aucun effet secondaire          À exécuter
                                route protégée de test                                               

  SEC-07         Passerelle     Import vers slug         Opération autorisée ; fichier, workspace,   À exécuter
                                allowlisté               réponse et indexation vérifiables           

  SEC-08         Passerelle     Import vers slug non     Refus avant traitement/écriture durable ;   À exécuter
                                autorisé/inconnu         journal sans secret                         

  SEC-09         Passerelle     Clé d'import sur route   Refus ; aucune mutation                     À exécuter
                                admin, suppression ou                                                
                                lecture générale                                                     

  RAG-01         Import         Import d'un fichier      Vérifier fichier, SQL, `DocumentVectors`,   À exécuter
                                factice neuf             LanceDB, cache et réponse HTTP              

  RAG-02         Import         Réimport identique       Politique d'idempotence observée ; aucun    À exécuter
                                                         doublon inattendu                           

  RAG-03         Cache          Contenu modifié à chemin Chunks conformes au nouveau contenu, aucun  À exécuter
                                identique puis réimport  cache périmé                                

  RAG-04         Import         Échec                    Échec explicite, pas de faux                À exécuter
                                d'embedding/indexation   `success: true`                             
                                simulé                                                               

  RAG-05         Cohérence      Échec SQL après          Compensation tentée ou état de réparation   À exécuter
                                insertion LanceDB        signalé ; contrôler SQL et vecteurs         

  PUR-01         Purge          Purge dossier factice    Pas de référence résiduelle non signalée    À exécuter
                                avec sous-dossiers       dans SQL, `DocumentVectors`, LanceDB ou     
                                                         cache                                       

  PUR-02         Contrat HTTP   `custom-documents`,      `protected`/`not_found`/`invalid` distincts À exécuter
                                dossier absent, chemin   ; aucun faux succès                         
                                invalide/nesté                                                       

  OPS-01         Sauvegarde     Sauvegarde puis          Restauration fonctionnelle et intégrité     À exécuter
                                restauration isolée      vérifiée                                    

  OPS-02         Protection     Protection activée en    Refus ; workspace préservé                  À exécuter
                                isolé ; suppression                                                  
                                workspace factice                                                    

  DOS-01         Limite HTTP    Inspection statique      Code réellement présent documenté ;         À exécuter
                                image de test pour       présence seule ne prouve pas l'activité     
                                `/api/embed`                                                         

  DOS-02         Limite HTTP    Dépassement de la limite HTTP 413 si prévu par le correctif ;        À exécuter
                                `/api/embed` dans        processus reste sain                        
                                l'isolé                                                              

  INT-17         Déplacement    Répertoire comme source  Refus ; aucun déplacement ; SQL/vecteurs    À exécuter
                                                         inchangés                                   

  INT-18A        Déplacement    Destination existante    Refus sans écrasement ; source/destination  À exécuter
                                mais non indexée         préservées                                  

  INT-18B        Déplacement    Destination existante    Refus sans altération du contenu, SQL,      À exécuter
                                déjà indexée             `DocumentVectors`, LanceDB et cache         

  INT-18C        Course         Deux opérations          Au plus un succès ; aucune corruption ;     À exécuter
                                concurrentes vers la     garantie no-replace prouvée                 
                                même destination                                                     

  INT-19A        Lot            Lot valide               Chaque résultat `moved` ; cohérence disque, À exécuter
                                                         SQL, mapping, cache                         

  INT-19B        Lot            Élément invalide au      Résultats                                   À exécuter
                                milieu du lot            `moved`/`refused`/`not_executed`/`failed` ; 
                                                         partiel explicitement signalé               

  INT-19C        Lot            Sources répétées,        Prévalidation rejette avant première        À exécuter
                                destinations dupliquées, mutation physique                           
                                conflits internes                                                    

  UPLOAD-02A     Upload         Rejet de validation      Temporaire supprimé ; fichiers légitimes    À exécuter
                                après écriture Multer    préservés                                   

  UPLOAD-02B     Upload         Collector indisponible   Nettoyage déterministe ou reprise explicite À exécuter
                                après réception          ; pas d'accumulation silencieuse            

  RACE-01        Course         Deux uploads simultanés  Chaque traitement indexe le bon contenu ;   À exécuter
                                de même nom, contenus    aucune collision/corruption                 
                                distinctifs                                                          
  -----------------------------------------------------------------------------------------------------------------

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

## 6. Conditions de déploiement et retour arrière

Avant toute intervention : image identifiée ; tests pertinents réussis
en environnement isolé ; sauvegarde et restauration d'essai vérifiées ;
diff exact revu ; dépendances scripts vérifiées pour ALLM-12 ;
autorisation explicite de Florian. `node --check` ne prouve pas le
fonctionnement HTTP.

**Préparation de retour arrière CP-3 (pas une autorisation d'exécution)
:** 1. sauvegarder les deux fichiers d'origine et leurs empreintes ; 2.
conserver le diff exact ; 3. en cas d'anomalie, restaurer les deux
fichiers par une procédure contrôlée ; 4. redémarrer uniquement selon la
procédure approuvée ; 5. vérifier la santé et les logs sans secret ; 6.
préserver les liaisons de ports LAN existantes. Ne pas arrêter, recréer
ou redémarrer la production pour un test non autorisé.

## 7. Registre des décisions

  -----------------------------------------------------------------------------------------
  ID                Décision                            État              Prochaine étape
  ----------------- ----------------------------------- ----------------- -----------------
  D1                ALLM-12 : CP-3 privilégié sous      Retenue, non      Image + scripts +
                    conditions                          appliquée         SEC-01..05 en
                                                                          isolé +
                                                                          autorisation

  D2                Passerelle dédiée, Option A         Retenue           Spécifier et
                                                                          tester
                                                                          allowlist/refus
                                                                          avant n8n

  D3                Usage de `Import-Corpus-IA`         À vérifier        Examiner logs
                                                                          sans afficher la
                                                                          clé

  D4                `WORKSPACE_DELETION_PROTECTION=1`   Recommandée, non  Prochain
                                                        appliquée         redémarrage
                                                                          planifié après
                                                                          autorisation ;
                                                                          OPS-02 en isolé

  D5                DOS-02                              À vérifier        Inspecter image
                                                                          et tester limite
                                                                          en isolé

  D6                INT-17..20, UPLOAD-02, RACE-01      En attente        Corriger après
                                                                          tests et contrôle
                                                                          d'intégrité

  GIT-01            Écriture GitHub par connecteur      Non résolue       Publication
                                                                          manuelle
  -----------------------------------------------------------------------------------------

## 8. Sources de code et références

Référence : dépôt public `Mintplex-Labs/anything-llm`, tag `v1.17.0`,
commit `fa7ec877f005a21ede94888b3b8618b700343857`.

-   `server/endpoints/api/system/index.js` --- `/v1/system/env-dump`.
-   `server/endpoints/system.js` --- `/env-dump`.
-   `server/utils/middleware/validApiKey.js` --- validation clé API.
-   `server/utils/middleware/validatedRequest.js` --- session.
-   `server/utils/middleware/multiUserProtected.js` ---
    `flexUserRoleValid`.
-   `server/utils/helpers/updateENV.js` --- `dumpENV()`.
-   `server/endpoints/api/document/index.js` --- upload, `move-files`,
    `remove-folder`.
-   `server/endpoints/document.js` --- routes web de déplacement/purge.
-   `server/models/documents.js` --- traitement, LanceDB et associations
    SQL.
-   `server/utils/vectorDbProviders/lance/index.js` --- cache/vecteurs.
-   `server/utils/files/purgeDocument.js` --- `purgeFolder()`.
-   `server/utils/files/multer.js` --- fichiers temporaires.
-   `server/index.js` --- parseurs globaux et `FILE_LIMIT`.
-   `server/endpoints/embed/index.js` --- endpoint public embed.
-   `SECURITY.md` --- portée des Developer API keys.
-   `BARE_METAL.md` --- appel à `/api/env-dump`.
-   Commit upstream `c729bf480ab146063b6c9ef287182384b9b080e0` ---
    limite `/api/embed` à vérifier dans l'image active.

Les numéros de ligne peuvent varier. Revalider les références sur le
commit ou l'image effectivement audités avant toute modification.

## 9. Historique

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

------------------------------------------------------------------------

*Ce document est un plan de correction et de validation. Il ne constitue
ni un patch exécutable, ni une preuve que les problèmes ont été
corrigés, ni une autorisation de modifier la production.*
