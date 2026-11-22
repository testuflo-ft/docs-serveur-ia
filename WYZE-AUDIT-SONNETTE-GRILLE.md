Audit Wyze — Sonnette Grille

Document de référence technique — Projet d'archivage des événements vidéo Wyze

- Statut : audit exploratoire en cours
- Dernière mise à jour : 22 novembre 2026
- Équipement ciblé : Wyze Video Doorbell Pro
- Nom dans le compte Wyze : Sonnette Grille
- Modèle : GW_BE1
- Firmware : 1.0.73

---

1. Objectif du projet

Étudier la possibilité de récupérer automatiquement les vidéos des événements déjà enregistrés dans le cloud Wyze par la caméra « Sonnette Grille », puis de les archiver sur le NAS Synology SERVOR.

L'objectif est de disposer d'une archive indépendante de la durée de conservation des événements dans le cloud Wyze.

Le projet doit aboutir, si la faisabilité est démontrée, à un dispositif autonome et isolé sur SERVOR, chargé de récupérer les clips existants et de les classer dans une arborescence dédiée.

Arborescence envisagée :

"Wyze-Archive/Sonnette-Grille/AAAA/MM/JJ/"

Ce projet ne concerne pas le stockage des documents destinés au RAG : le répertoire "Corpus-IA" est exclu.

2. Périmètre et règles impératives

Équipement concerné

Une seule caméra est concernée :

- Wyze Video Doorbell Pro
- Nom : Sonnette Grille
- Modèle : GW_BE1
- Firmware : 1.0.73

Les deux anciennes Outdoor Cams ne font pas partie du périmètre.

Contraintes techniques

- Ne pas utiliser RTSP ou ONVIF.
- Ne pas utiliser de flux vidéo en direct.
- Ne pas solliciter de WebRTC ni de capture vidéo continue.
- Travailler exclusivement sur les événements déjà enregistrés.
- Privilégier les interfaces API en lecture seule.
- Ne jamais appeler "markEventsRead()" : cette méthode modifie l'état de lecture des événements.

Contraintes opérationnelles

Aucune installation, création de conteneur, modification de configuration ou mise en production ne doit intervenir avant d'avoir démontré :

1. La compatibilité de l'API avec le modèle GW_BE1.
2. La récupération effective des événements.
3. L'obtention d'une URL de lecture ou de téléchargement.
4. La récupération complète d'un clip vidéo.
5. La possibilité de vérifier l'intégrité du fichier téléchargé.

Aucune modification du firmware ou des paramètres de la caméra n'est autorisée.

Les applications existantes sur SERVOR ne doivent pas être affectées : Jellyfin, AnythingLLM, Open WebUI, Homer et Home Assistant.

---

3. Environnement technique

NAS SERVOR

- Synology SERVOR
- DSM 7.4.1-90080
- Architecture x86_64
- Adresse LAN : 192.168.1.103
- Docker Engine : 24.0.2
- Node.js : v22.23.4
- npm : 10.9.9
- curl : 7.86.0

Le seul conteneur actif identifié lors de l'inventaire initial était Jellyfin.

Le projet Wyze doit rester isolé des autres services.

Dossier d'audit temporaire

Dossier utilisé pendant les premiers essais :

"/tmp/wyze-audit.hiRZRx"

Sources de travail :

"/tmp/wyze-audit.hiRZRx/noelportugal-wyze-node-d556f1b"

Dossier temporaire des secrets :

"/tmp/wyze-audit.hiRZRx/secrets"

Fichiers présents à la fin de l'étape du 22 novembre 2026 :

- "secrets/api-keypair"
- "secrets/session-tokens.json"
- "auth-check.js"
- "object-list-check.js"

Permissions constatées :

- Dossier "secrets" : 700
- Fichier "api-keypair" : 600
- Fichier "session-tokens.json" : 600

Attention : "/tmp" est temporaire. Les fichiers peuvent disparaître lors d'un redémarrage ou d'un nettoyage du NAS. Les jetons Wyze ont également une durée de validité limitée. Leur présence et leur validité devront être vérifiées lors de la reprise.

Ne jamais inscrire les clés API, mots de passe ou jetons dans ce document, dans GitHub ou dans les journaux de commandes.

---

4. Sources et recherches initiales

4.1. Wyze Web View

La consultation de "https://my.wyze.com/events" a été testée personnellement.

Résultats :

- Le compte Wyze est accessible depuis le navigateur.
- La caméra Sonnette Grille apparaît dans la liste.
- Les événements enregistrés sont visibles.

La documentation officielle Wyze relative à Web View indique que la Wyze Video Doorbell Pro est compatible avec la consultation des événements, mais pas avec le direct.

La consultation des événements est donc validée dans l'interface Web.

Cela ne démontre pas encore la possibilité de télécharger les vidéos par API.

Documentation officielle :
https://support.wyze.com/

4.2. Extension Optimyze

Extension étudiée :

Optimyze — Wyze Events Downloader
https://chromewebstore.google.com/detail/optimyze-wyze-events-down/kafelmbogbomkiliailedndiknnecjak

Le développeur annonce notamment :

- Téléchargement individuel des événements.
- Téléchargement en masse.
- Assemblage des vidéos en MP4 côté navigateur.

La politique de confidentialité affirme que les données et vidéos ne sont pas collectées par un serveur tiers et que les requêtes sont adressées directement aux services Wyze et Amazon Kinesis.

Ces déclarations sont celles de l'éditeur et n'ont pas été auditées indépendamment.

L'extension n'a pas été installée. Son code n'a pas été validé. Sa compatibilité avec GW_BE1 reste inconnue.

4.3. Bibliothèque communautaire wyze-node

Dépôt étudié :

https://github.com/noelportugal/wyze-node

Version du paquet étudiée : 2.12.2.

Commit téléchargé : "d556f1b".

Le dépôt est une bibliothèque communautaire non officielle.

Le code a été téléchargé et inspecté sans installation du paquet et sans exécution de celui-ci.

Dépendances identifiées notamment :

- axios
- md5
- moment
- node-localstorage

Le module initialise un stockage local dans "./scratch". Les jetons y sont enregistrés en clair par défaut.

Décision : ne pas utiliser la bibliothèque telle quelle pour les essais sur le NAS.

Les méthodes utiles identifiées dans "src/index.js" sont :

- "login()"
- "getRefreshToken()"
- "getObjectList()"
- "getEventList()"
- "getEventVideoURL()"
- "markEventsRead()"

La dernière méthode est exclue du projet.

---

5. Authentification Wyze

5.1. Création de la clé API

Le 22 novembre 2026, une clé API personnelle a été créée depuis le portail officiel :

https://developer-api-console.wyze.com/#/apikey/view

Les deux valeurs nécessaires ont été conservées localement :

- Key ID
- API Key

Aucune valeur secrète n'est reproduite dans ce document.

Documentation officielle Wyze :

https://support.wyze.com/hc/en-us/articles/16129834216731-Creating-an-API-Key

5.2. Authentification expérimentale

Un script Node.js indépendant a été créé :

"auth-check.js"

Il utilise les modules natifs Node.js, sans installation de dépendances supplémentaires.

L'analyse du code de "wyze-node" a permis de reproduire la méthode d'authentification observée :

- Endpoint : "https://auth-prod.api.wyze.com/api/user/login"
- Méthode : POST
- Authentification par adresse électronique et mot de passe transformé par triple MD5.
- En-têtes contenant notamment "x-api-key", "apikey" et "keyid".

Résultat expérimental du 22 novembre 2026 :

- HTTP : 200
- "access_token" : présent
- "refresh_token" : présent
- Marqueur MFA : absent
- Authentification : validée

Les deux jetons ont été enregistrés dans :

"secrets/session-tokens.json"

Permissions constatées : 600.

Cette étape est validée expérimentalement.

Elle démontre que le compte et les clés permettent d'obtenir des jetons auprès du service d'authentification Wyze.

Elle ne démontre pas encore que les autres API fonctionnent pour GW_BE1.

---

6. Identification de la caméra par API

6.1. Endpoint interrogé

"https://api.wyzecam.com/app/v2/home_page/get_object_list"

Méthode : POST.

La requête a été effectuée avec le jeton d'accès obtenu lors de l'étape précédente.

Script utilisé :

"object-list-check.js"

Cette opération est une lecture de la liste des appareils.

6.2. Résultat expérimental du 22 novembre 2026

Réponse HTTP : 200.

Clés principales de la réponse :

- "code"
- "ts"
- "msg"
- "data"
- "traceId"

La caméra a été identifiée dans :

"root.data.device_list.0"

Valeurs effectivement retournées :

Champ| Valeur
"nickname"| Sonnette Grille
"product_model"| GW_BE1
"mac"| GW_BE1_7C78B2A71D53
"firmware_ver"| 1.0.73
"hardware_ver"| 1.0.1
"product_type"| Camera

L'identifiant "mac" est conservé exactement tel que retourné par Wyze. Il ne faut pas le traiter comme une adresse MAC Ethernet classique.

Cette étape est validée expérimentalement.

L'API Wyze permet donc de retrouver précisément la caméra ciblée et de confirmer son modèle.

---

7. Prochaine étape : récupération des événements

La prochaine opération consiste à interroger :

"https://api.wyzecam.com/app/v2/device/get_event_list"

Méthode : POST.

La méthode correspondante dans "wyze-node" est "getEventList(options)".

Les paramètres identifiés dans le code sont notamment :

- "count"
- "event_type"
- "device_mac_list"
- "event_value_list"
- "event_tag_list"
- "order_by"
- "end_time"
- "begin_time"

Pour le premier essai, il faudra :

1. Utiliser exclusivement l'identifiant de Sonnette Grille.
2. Limiter la période interrogée.
3. Effectuer une lecture seule.
4. Examiner la structure réelle de la réponse.
5. Identifier les champs d'événement, les dates et les identifiants.
6. Ne jamais appeler "markEventsRead()".

Aucune structure de réponse ne doit être considérée comme certaine avant observation expérimentale.

---

8. Étape ultérieure : récupération des vidéos

La méthode identifiée dans "wyze-node" est :

"getEventVideoURL(options)"

Endpoint :

"https://beta-ams-api.wyzecam.com/api/v1/kinesis/replay_url/get"

Cette méthode envoie notamment :

- "device_mac"
- "begin_time"
- "end_time"
- "expires"
- "max_manifest_fragment"
- "device_model"
- "sc"
- "sv"

Le code de la bibliothèque retourne "result.data", mais ne télécharge pas lui-même la vidéo.

Il reste donc à démontrer :

- Le format réel de la réponse.
- La nature de l'URL retournée.
- Le protocole de lecture utilisé.
- Le format des fragments vidéo.
- La possibilité de reconstituer un MP4 exploitable.
- La compatibilité de cette méthode avec GW_BE1.

Aucun téléchargement n'a encore été effectué.

---

9. État des validations

Sujet| État
Consultation Web des événements| Validée
Création de la clé API| Validée
Authentification Wyze| Validée
Obtention des jetons| Validée
Identification de Sonnette Grille par API| Validée
Compatibilité de "getEventList()" avec GW_BE1| À tester
Structure réelle des événements| Inconnue
Obtention d'une URL vidéo| Inconnue
Téléchargement d'un clip| Non démontré
Assemblage et intégrité MP4| Non démontrés
Archivage automatique sur NAS| Non commencé
Conteneur dédié| Non créé

---

10. Journal des avancées

22 novembre 2026 — Première session d'audit

1. Recherche et examen de la bibliothèque communautaire "wyze-node".
2. Téléchargement du code source dans un dossier temporaire sur SERVOR.
3. Inspection des méthodes d'authentification, de lecture des appareils et des événements.
4. Décision de ne pas installer la bibliothèque telle quelle en raison de son stockage local des jetons en clair.
5. Création d'une clé API Wyze personnelle.
6. Mise en place d'un stockage temporaire protégé des clés.
7. Authentification réelle auprès de Wyze : HTTP 200, deux jetons obtenus.
8. Interrogation de "get_object_list" : HTTP 200.
9. Identification effective de Sonnette Grille : modèle GW_BE1, firmware 1.0.73.
10. Aucune installation, aucun conteneur et aucune modification de production.

Point de reprise : préparer et exécuter le premier test de lecture des événements, filtré sur "GW_BE1_7C78B2A71D53".

---

11. Règles de maintenance du document

Ce document est le référentiel cumulatif du projet Wyze.

Toute nouvelle session devra :

- reprendre à partir du dernier point de reprise ;
- conserver les résultats précédemment validés ;
- distinguer les observations réelles des hypothèses ;
- consigner les commandes et résultats utiles ;
- mettre à jour le tableau des validations ;
- ne jamais inscrire de secret ou de jeton ;
- ne pas présenter une étape comme validée sans résultat expérimental.

Aucune publication GitHub ni modification du dépôt ne doit être effectuée sans validation explicite.

Statut global : audit en cours — authentification et identification de la caméra validées, récupération des événements à tester.
