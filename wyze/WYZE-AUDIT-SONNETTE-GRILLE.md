

# Audit Wyze — Sonnette Grille

Document de référence technique — Projet d'archivage local des événements vidéo Wyze.
- **Statut global :** audit exploratoire en cours ; événement GW_BE1 du 23 novembre identifié avec ressource KVS v3 ; analyse statique d'Optimyze approfondie ; récupération et reconstruction d'un véritable clip Wyze non encore démontrées.
- **Dernière mise à jour :** 28 novembre 2026 - analyse de Signature2.
- **NAS cible :** Synology SERVOR — DSM 7.4.1-90080 — x86_64.
- **Caméra pilote :** Wyze Video Doorbell Pro — « Sonnette Grille ».
- **Modèle :** GW_BE1.
- **Firmware et hardware :** valeurs précédemment relevées dans l'inventaire Wyze ; leur preuve brute expurgée n'est pas reproduite dans ce document. Elles restent à rattacher à une source vérifiable avant d'être considérées comme des preuves documentaires autonomes.

---

## 1. Objectif du projet

Construire un système local, autonome et sécurisé sur SERVOR permettant de récupérer les clips d'événements déjà enregistrés dans le cloud Wyze, de les archiver sur le NAS et de les consulter depuis une interface Web.

L'objectif est de ne plus dépendre quotidiennement de l'application mobile Wyze pour consulter les événements archivés.

Il ne s'agit pas d'un système de vidéosurveillance en direct.

### 1.1 Périmètre des caméras

Le système devra être conçu dès le départ pour gérer trois caméras, avec une activation progressive.

| Caméra | Modèle | État du projet |
|---|---|---|
| Sonnette Grille | Wyze Video Doorbell Pro — GW_BE1 | Caméra pilote |
| Outdoor Cam 1 | À identifier précisément | À réparer |
| Outdoor Cam 2 | À identifier précisément | À réparer |

La Sonnette Grille est la seule caméra actuellement autorisée pour les essais.

Les deux Outdoor Cam devront être intégrées ultérieurement, après diagnostic, réparation et autorisation explicite.

L'architecture devra permettre l'ajout d'une caméra par configuration, sans réécriture du collecteur ni modification fondamentale du système.

Chaque caméra devra disposer de :
- son identifiant Wyze ;
- sa configuration indépendante ;
- son répertoire d'archives ;
- son historique d'événements ;
- ses règles de déduplication ;
- son état de fonctionnement et de synchronisation.

### 1.2 Résultat attendu

Le système final devra assurer :

1. La collecte des métadonnées et événements cloud.
2. La récupération des clips enregistrés, si un mécanisme fiable est démontré.
3. L'archivage local des vidéos.
4. L'indexation des événements.
5. La déduplication et la gestion des erreurs.
6. La consultation des archives depuis une interface Web.
7. La lecture vidéo avec son directement dans le navigateur.
8. Le fonctionnement autonome sur SERVOR.

Le système devra rester utilisable pour consulter les archives même si le Mac mini est indisponible.

### 1.3 Périmètre explicitement exclu

- Flux vidéo en direct.
- RTSP et ONVIF.
- WebRTC.
- Capture vidéo continue.
- Surveillance permanente.
- Modification du firmware ou des paramètres des caméras.

Le projet concerne exclusivement les clips d'événements déjà enregistrés dans le cloud Wyze.

---

## 2. Règles impératives et sécurité

### 2.1 Périmètre des opérations

- Travailler uniquement sur les événements déjà enregistrés.
- Ne jamais appeler `markEventsRead()`.
- Ne jamais modifier les paramètres des caméras.
- Ne jamais modifier leur firmware.
- Ne pas installer l'extension Optimyze ni lui donner accès au compte Wyze.
- Ne pas effectuer de nouvel appel réseau Wyze sans autorisation explicite.
- Ne pas télécharger de clip sans autorisation explicite donnée au moment de l'étape de téléchargement.
- Ne pas intégrer les Outdoor Cam avant leur réparation et une autorisation explicite.
- Ne pas installer de conteneur ou modifier une configuration de production sans validation explicite.

La procédure de récupération d'un véritable clip est progressive :

1. Obtenir une ressource ou une URL de lecture.
2. Examiner la réponse en masquant les URL signées, jetons, identifiants et paramètres sensibles.
3. Présenter les informations utiles et demander confirmation avant tout téléchargement effectif.
4. Télécharger uniquement après cette confirmation.
5. Vérifier le fichier localement sans publier de données sensibles.

Les trois tentatives précédentes auprès de l'endpoint Kinesis Replay ont renvoyé HTTP 500. Aucune nouvelle tentative sur cet endpoint ne doit être effectuée sans nouvelle autorisation explicite.

### 2.2 Protection de l'environnement existant

Aucune modification ne doit perturber les services existants sur SERVOR :

- Jellyfin ;
- AnythingLLM ;
- Open WebUI ;
- Homer ;
- Home Assistant ;
- les autres services et caméras.

Le futur système devra être isolé dans son propre conteneur Docker, avec des volumes dédiés.

### 2.3 Protection des secrets

- Aucun mot de passe, API Key, Key ID ou jeton dans GitHub.
- Aucune URL signée ou URL temporaire dans les journaux.
- Aucun manifeste contenant des paramètres secrets dans les sorties de diagnostic.
- Secrets stockés hors de l'image Docker.
- Permissions restrictives sur les fichiers sensibles.
- Journaux expurgés des informations confidentielles.
- Interface Web sans accès aux identifiants Wyze.
- Accès aux vidéos limité aux utilisateurs autorisés.
- Aucun accès public direct.

Les hypothèses de sécurité devront être vérifiées avant tout déploiement.

---

## 3. Environnement technique

### 3.1 NAS SERVOR

- Synology SERVOR.
- DSM 7.4.1-90080.
- Architecture x86_64.
- Adresse LAN : 192.168.1.103.
- Node.js : v22.23.4.
- npm : 10.9.9.
- curl : 7.86.0.
- Docker disponible.

Le projet Wyze ne dispose actuellement d'aucun conteneur dédié.

FFmpeg 7 est installé via le paquet SynoCommunity :
- version observée : 7.1.5-10 ;
- binaire utilisé pour les essais : `/var/packages/ffmpeg7/target/bin/ffmpeg` ;
- binaire FFmpeg système non modifié.

Les essais MP4 décrits dans ce document ont été effectués avec FFmpeg 7 et Node.js sur le NAS.

### 3.2 Dossier d'audit temporaire

Dossier principal :

`/tmp/wyze-audit.hiRZRx`

Sources locales :

`/tmp/wyze-audit.hiRZRx/noelportugal-wyze-node-d556f1b`

`/tmp/wyze-audit.hiRZRx/optimyze/extracted`

Dossier des secrets :

`/tmp/wyze-audit.hiRZRx/secrets`

Fichiers utilisés :
- `api-keypair`
- `session-tokens.json`

Permissions constatées lors de la création :
- dossier secrets : 700 ;
- fichiers secrets : 600.

Attention : `/tmp` est temporaire. Les fichiers peuvent disparaître lors d'un redémarrage ou d'un nettoyage du NAS.

### 3.3 Laboratoire MP4 synthétique

Répertoire de travail :

`/tmp/wyze-audit.hiRZRx/mp4-lab`

Ce laboratoire contient des médias DASH synthétiques, les fragments, les moteurs extraits et corrigés, les scripts de test et les fichiers MP4 reconstruits.

Ces données ne proviennent pas d'une caméra Wyze. Elles servent exclusivement à valider le fonctionnement du moteur MP4 hors réseau.

---

## 4. Sources étudiées

### 4.1 Wyze Web View

Adresse :

https://my.wyze.com/events

Constats :
- Le compte Wyze est accessible dans le navigateur.
- La Sonnette Grille apparaît dans l'interface.
- Les événements enregistrés sont visibles.
- La consultation des événements est prise en charge pour la Video Doorbell Pro.
- Le direct n'est pas proposé pour ce modèle dans Web View.

La visibilité des événements dans le navigateur est confirmée. Cela ne prouve pas à elle seule qu'un téléchargement autonome par API est possible.

### 4.2 Bibliothèque communautaire wyze-node

Dépôt :

https://github.com/noelportugal/wyze-node

Version étudiée : 2.12.2.

Référence de commit consignée lors du téléchargement : `d556f1b`.

Le code a été téléchargé et inspecté sans installation du paquet ni exécution.

Méthodes pertinentes identifiées dans `src/index.js` :
- `login()`
- `getRefreshToken()`
- `getObjectList()`
- `getEventList()`
- `getEventVideoURL()`
- `markEventsRead()` — formellement exclue du projet.

Le module utilise notamment Axios, MD5 et moment.

Il initialise un stockage local dans `./scratch` et les jetons y sont enregistrés en clair par défaut.

**Décision :** ne pas utiliser la bibliothèque telle quelle sur le NAS.

Les éléments utiles pourront éventuellement être réutilisés après audit et adaptation.

L'analyse n'a pas mis en évidence de signature HMAC spécifique à l'endpoint Kinesis Replay.

La méthode `signature2` et son HMAC-MD5 concernent les appels Ex Services. Il ne faut pas en déduire une exigence de signature pour Kinesis Replay.

### 4.3 Extension Optimyze — Wyze Events Downloader

Fiche Chrome Web Store :

https://chromewebstore.google.com/detail/optimyze-wyze-events-down/kafelmbogbomkiliailedndknecjak

Identifiant :

`kafelmbogbomkiliailedndiknecjak`

Version examinée : 0.5.1.

Archive CRX téléchargée depuis le service de distribution Chrome.

SHA-256 du CRX :

`fd67487dd0f1c6fedf7db53e45a854656fa3b9c32eb6bccb67ec0da33a57438e`

Fichier JavaScript source analysé :

`/tmp/wyze-audit.hiRZRx/optimyze/extracted/src/content.js`

Taille : 69 902 octets.

SHA-256 de `content.js` :

`ed6210d52a85cbe161581e54c09f574068462360f10efaefa43bf42aa4eb91e1`

Second fichier JavaScript analysé :

`/tmp/wyze-audit.hiRZRx/optimyze/extracted/src/inject.js`

Taille : 1 109 octets.

SHA-256 de `inject.js` :

`e86d804af5453d215ddc54bac78f3db7db16522dc6743dc8c68c0fb13a3cb50e`

Ces empreintes identifient précisément l'archive et les deux fichiers JavaScript utilisés pour les constats de cette section.

L'extension a été extraite et inspectée statiquement.

Elle n'a pas été installée et aucun script de l'extension n'a été exécuté.

#### 4.3.1 Analyse du manifeste

- Manifest V3.
- Permission déclarée : `storage`.
- Scripts `inject.js` et `content.js` sur les pages Wyze.
- `inject.js` s'exécute dans le monde MAIN.
- `content.js` s'exécute dans le monde isolé.
- `login-fix.js` cible le callback de connexion Wyze.

Les affirmations du développeur concernant le traitement local des données n'ont pas été auditées indépendamment.

#### 4.3.2 Analyse statique de inject.js

Le fichier intercepte :
- `window.fetch` ;
- `XMLHttpRequest.prototype.open`.

Les fonctions natives sont conservées et les appels originaux continuent d'être exécutés.

Le script filtre les URL correspondant aux routes DASH suivantes :

- `/dash/vN/.../getMP4InitFragment`
- `/dash/vN/.../getMP4MediaFragment`
- `/dash/vN/.../getDASHManifest`
- `/dash/vN/.../getMPDManifest`

Les URL détectées sont communiquées à `content.js` par `window.postMessage`, avec le marqueur `__wyzeDownloader: "url"`.

Le script peut également répondre à une demande `ask-src` en recherchant l'élément DOM associé et en lisant `player.currentSrc()` lorsque cette méthode est disponible.

La réponse est transmise avec le marqueur `__wyzeDownloader: "src"`.

**Détail de la communication entre contextes :**

- Le script tente d'abord d'envoyer les messages à `window.location.origin`.
- Si cet envoi échoue, il prévoit un repli vers `window.postMessage(..., "*")`.
- Le listener vérifie que `event.source === window`.
- Le code examiné ne permet pas, à lui seul, de conclure à une validation complète de l'origine et du contenu de chaque message dans l'ensemble du dispositif.

Cette observation doit être prise en compte dans l'analyse de sécurité de la frontière entre le monde MAIN et le monde isolé. Elle ne démontre pas qu'une exploitation est possible.

Le fichier `inject.js` ne constitue pas un téléchargeur autonome : il observe les requêtes effectuées par la page et transmet les URL reconnues à l'autre contexte.

#### 4.3.3 Analyse statique de content.js

Les extraits examinés montrent que le script :

- reçoit les messages `__wyzeDownloader` ;
- reconnaît les URL de manifestes et de fragments ;
- associe les URL aux cartes vidéo et au lecteur actif ;
- conserve notamment `manifestUrl`, `mediaTemplate` et `initTemplate` ;
- récupère et analyse le manifeste DASH/MPD ;
- construit des URL de fragments avec les paramètres `TrackNumber` et `SequenceNumber` ;
- effectue des appels `fetch()` avec gestion des credentials et `cache: "no-store"` ;
- contient des fonctions de traitement et de reconstruction MP4 ;
- crée un Blob de type `video/mp4`.

Interprétation :

Optimyze semble observer les requêtes de lecture déjà effectuées par Wyze Web View, récupérer les URL des ressources DASH/MP4 et télécharger ou assembler les fragments dans le contexte du navigateur.

Cette découverte constitue une piste technique importante pour le projet.

Elle ne démontre pas que les mêmes ressources peuvent être récupérées depuis un NAS sans session de navigateur.

#### 4.3.4 Extraction et validation du moteur MP4

Le moteur de reconstruction MP4 a été extrait de `content.js` à des fins de test isolé.

L'extraction a été réalisée après identification du bon constructeur MP4 et du bon parseur d'initialisation.

**Précaution importante concernant le JavaScript minifié :**

Ne jamais identifier une fonction par son seul nom ni retenir automatiquement sa première occurrence.

Il faut :
1. rechercher toutes les déclarations portant ce nom ;
2. comparer leurs positions et signatures ;
3. confirmer le rôle de la fonction à partir de ses appels et de son contexte ;
4. tenir compte des fonctions locales et des portées lexicales ;
5. conserver le SHA-256 du fichier source utilisé.

Des noms de fonctions minifiées sont réutilisés dans `content.js`. Une extraction fondée uniquement sur la première occurrence conduirait à sélectionner une fonction incorrecte.

##### 4.3.4.1 Moteur original

Fichier de laboratoire :

`optimyze-mp4-core.js`

SHA-256 :

`65c2dba13b0738f5422dd07dcaa180ee2d98a13ed7ccd55c202e0adf6e35b9cf`

Le moteur expose la fonction de reconstruction MP4 sous la forme :

`module.exports = { mux: b };`

Le script de test utilise les fragments d'initialisation et les fragments média pour construire les pistes audio et vidéo, puis appelle le moteur avec les deux pistes.

##### 4.3.4.2 Problème identifié : edit lists MP4

Le premier essai synthétique a révélé un problème dans la reconstruction des pistes audio AAC.

Le média de référence contenait une edit list (`edts/elst`) indiquant un décalage de priming AAC de 1024 échantillons.

Le parseur d'initialisation original ne conservait pas cette information et le constructeur MP4 ne recréait pas la boîte `edts/elst`.

Conséquence constatée sur le premier fichier reconstruit :
- une trame AAC supplémentaire au début ;
- 376 trames audio décodées au lieu de 375 ;
- les 375 trames de référence correspondaient aux 375 dernières trames du fichier reconstruit ;
- la gestion du délai de priming n'était donc pas préservée.

Le problème était lié à la perte de l'edit list et non à une corruption générale des échantillons audio.

##### 4.3.4.3 Correction isolée

Un moteur corrigé a été produit dans le laboratoire :

`optimyze-mp4-core-editlist.js`

SHA-256 :

`57961306d545a496821745a1c6fd917faf3889b4eaa8c1c96b74c2f25045e7ca`

Taille observée : 11 316 octets.

Le fichier original `optimyze-mp4-core.js` a été conservé sans modification.

La correction :
- analyse l'edit list présente dans l'initialisation ;
- conserve le `media_time` ;
- prend en charge les versions 0 et 1 d'`elst` ;
- vérifie le nombre d'entrées et le taux de lecture ;
- refuse les structures non prises en charge plutôt que de les interpréter silencieusement ;
- calcule la durée de présentation à partir de la durée des échantillons moins le décalage de média ;
- recrée une boîte `edts/elst` dans la piste reconstruite ;
- conserve une taille de sortie déterministe lors des deux passages du constructeur.

Limites de cette correction :
- une seule entrée d'edit list est prise en charge ;
- les segments vides ne sont pas pris en charge ;
- les taux de lecture autres que 1,0 sont refusés ;
- les `media_time` négatifs sont refusés ;
- les structures non conformes ou non prises en charge doivent provoquer une erreur explicite.

Cette correction est un candidat expérimental local. Elle ne constitue pas encore une modification validée du code source complet de l'extension.

##### 4.3.4.4 Médias synthétiques utilisés

Un média synthétique DASH a été généré sur SERVOR avec FFmpeg 7.

Caractéristiques :
- vidéo H.264 ;
- résolution 640 × 360 ;
- fréquence 25 images/s ;
- audio AAC ;
- fréquence audio 48 kHz ;
- audio mono ;
- durée nominale : 8 secondes.

Les fichiers de référence comprennent :
- `probe-video.mp4`
- `probe-audio.mp4`

Les fragments DASH comprennent les initialisations et quatre fragments média pour chacune des deux pistes.

Ces fichiers sont entièrement synthétiques. Aucun média Wyze réel n'a été utilisé dans cette validation.

##### 4.3.4.5 Résultat de la reconstruction corrigée

Script de test :

`run-mux-test-editlist.js`

Fichier produit :

`optimyze-rebuilt-editlist.mp4`

Résultat de l'exécution :
- reconstruction réussie ;
- taille : 1 934 631 octets ;
- durée calculée : 8 secondes ;
- code retour Node.js : 0.

Résultat FFprobe :
- piste vidéo H.264, 640 × 360, durée 8,000000 secondes ;
- piste audio AAC, 48 kHz, mono, durée 8,000000 secondes ;
- durée du conteneur : 8,000000 secondes.

Le décodage complet avec FFmpeg 7 s'est terminé avec le code retour 0, sans erreur de décodage.

##### 4.3.4.6 Vérification directe des edit lists

Une lecture directe des boîtes MP4 a confirmé :

| Piste | Boîte `edts` | Boîte `elst` | Version | Entrées | `segment_duration` | `media_time` | Vitesse |
|---|---:|---:|---:|---:|---:|---:|---|
| Vidéo H.264 | 1 | 1 | 0 | 1 | 8000 | 0 | 1,0 |
| Audio AAC | 1 | 1 | 0 | 1 | 8000 | 1024 | 1,0 |

Les durées sont exprimées dans l'échelle de temps du film, ici en millisecondes.

La piste audio conserve le décalage de priming de 1024 échantillons. La durée de présentation est correctement ramenée à 8000 ms.

La piste vidéo possède également une edit list avec un décalage nul.

##### 4.3.4.7 Comparaison des trames décodées

Les trames des fichiers de référence et du fichier reconstruit ont été comparées avec le format `framemd5` de FFmpeg 7.

Résultats :

| Média | Trames de référence | Trames reconstruites | Empreintes identiques |
|---|---:|---:|---|
| Audio AAC | 375 | 375 | Oui |
| Vidéo H.264 | 200 | 200 | Oui |

Les empreintes MD5 de toutes les trames audio sont identiques entre la référence et le fichier reconstruit.

Les empreintes MD5 de toutes les trames vidéo sont également identiques.

Il n'y a donc ni trame audio supplémentaire ni différence de contenu décodé dans cet essai.

##### 4.3.4.8 Conclusion de cette validation

**Résultat : validation synthétique réussie.**

Le moteur MP4 extrait d'Optimyze, après correction de la gestion des edit lists, a démontré qu'il peut :

1. reconstruire un conteneur MP4 avec deux pistes ;
2. préserver les données décodées H.264 et AAC ;
3. conserver le décalage de priming AAC ;
4. produire une durée cohérente ;
5. générer un fichier décodable sans erreur par FFmpeg 7.

Cette validation porte uniquement sur le cas synthétique testé.

Elle ne démontre pas encore :
- la compatibilité avec les fragments DASH réellement fournis par Wyze ;
- la compatibilité avec toutes les variantes d'initialisation MP4 ;
- la compatibilité avec les edit lists multiples ou complexes ;
- la récupération des fragments sans session de navigateur ;
- l'autonomie complète du processus sur SERVOR ;
- la compatibilité avec les trois modèles de caméra prévus.

Le moteur corrigé reste donc un candidat expérimental.

##### 4.3.4.9 Analyse détaillée de la récupération DASH et des credentials

Cette sous-section complète l'analyse précédente à partir des déclarations et extraits identifiés dans le `content.js` version 0.5.1.

Les offsets sont des positions en octets dans le fichier source de 69 902 octets identifié par le SHA-256 :

`ed6210d52a85cbe161581e54c09f574068462360f10efaefa43bf42aa4eb91e1`

Aucun code n'a été exécuté pour produire ces constats.

**A. État de session construit par `y()`**

À l'offset 20607, le code contient une fonction fléchée :

`const y=()=>({manifestUrl:null,mediaTemplate:null,initTemplate:null,tracks:new Set})`

Elle construit un objet d'état initial comprenant :
- `manifestUrl` ;
- `mediaTemplate` ;
- `initTemplate` ;
- `tracks`, initialisé sous forme de `Set`.

Cet objet constitue un enregistrement de suivi des informations nécessaires à la récupération et à l'assemblage des fragments DASH.

L'offset 20607 correspond à l'initialisation de cet état. Une autre occurrence de `manifestUrl` apparaît à l'offset 23401 dans le traitement d'un message associé à la source du lecteur.

Le code observé adopte ou corrige alors l'URL du manifeste à partir de la source du lecteur, puis réinitialise les informations de templates et de pistes lorsque cet état doit être actualisé.

L'association des informations au lecteur et à la carte événement dépend également de la logique de suivi de la carte survolée. Une fenêtre temporelle de 2500 ms intervient dans la détection d'un changement récent de carte.

**Interprétation :** les URL et modèles de fragments ne sont pas présentés comme des constantes globales indépendantes. Ils sont associés à un état de lecture construit et actualisé dans le contexte de l'interface Wyze.

Cela renforce la dépendance fonctionnelle à l'observation du lecteur et de ses requêtes.

Cela ne prouve toutefois pas qu'une URL capturée ne puisse jamais être réutilisée hors du navigateur. Cette possibilité reste à tester séparément.

**B. Reconstruction d'une URL de fragment par `D()`**

À l'offset 23714 :

`function D(e,t,n,o)`

Cette fonction reconstruit une URL de fragment à partir des modèles observés.

Son comportement visible est le suivant :

1. Pour un fragment de type `init`, elle privilégie `initTemplate`, avec repli sur `mediaTemplate`.
2. Pour un fragment de type média, elle privilégie `mediaTemplate`, avec repli sur `initTemplate`.
3. Si aucun modèle n'est disponible, elle lève `Error("No fragment URL has been observed yet")`.
4. Elle construit un objet `URL` à partir du modèle retenu.
5. Elle remplace le dernier composant du chemin par `getMP4InitFragment.mp4` ou `getMP4MediaFragment.mp4`, selon le type demandé.
6. Elle ajoute `TrackNumber` lorsque le numéro de piste est fourni.
7. Elle ajoute `SequenceNumber` lorsque le numéro de séquence est fourni, ou supprime ce paramètre lorsqu'il ne l'est pas.
8. Elle restitue l'URL en restaurant la notation `$Number$` lorsque celle-ci avait été encodée sous la forme `%24Number%24`.

Le code démontre donc la reconstruction d'une URL à partir d'un modèle observé dans le contexte du lecteur.

Il ne démontre pas que cette URL reste valide après expiration de la session, ni qu'elle puisse être utilisée depuis le NAS avec les mêmes droits.

**C. Récupération HTTP par `L()`**

Déclaration identifiée à l'offset 23938 :

`async function L(e,n=0,o=t,r=null)`

La fonction effectue notamment :

`fetch(e,{credentials:o,cache:"no-store"})`

Elle reçoit donc une URL, un compteur de tentative, un mode de credentials et un objet facultatif de suivi de progression.

Le comportement observé :
- La première requête utilise le mode de credentials transmis.
- En cas d'exception réseau avec `credentials: "omit"`, la fonction tente une seconde requête avec `credentials: "include"`.
- Si cette tentative réussit, la variable de configuration `t` est modifiée en `"include"`.
- En cas de réponse HTTP 401 ou 403 avec `omit`, une tentative avec `include` est également effectuée.
- Les réponses 4xx autres que ces cas sont examinées via l'en-tête `x-amzn-ErrorType`.
- Les valeurs correspondant à `Expired`, `InvalidArgument` ou `NotAuthorized` déclenchent une erreur identifiée comme `Wyze streaming session expired`.
- Les autres réponses 4xx conduisent à `null`.
- Les réponses non réussies de type 5xx sont réessayées jusqu'à deux fois supplémentaires avant qu'une erreur HTTP soit levée.
- Lorsque la réponse contient un flux lisible, la fonction lit le corps progressivement et actualise les informations de progression.
- Lorsque le flux n'est pas disponible, elle utilise `arrayBuffer()`.

**D. Valeur initiale de la variable de credentials**

Le relevé de `content.js` identifie à l'offset 19728 le début d'une fermeture contenant :

`let t="omit",n={...e.DEFAULTS}`

Cette initialisation est dans le contexte fonctionnel qui contient la logique de récupération examinée.

La valeur initiale de `t` est donc bien `"omit"`.

Le comportement de repli décrit dans la section précédente est ainsi confirmé par deux éléments du même code :
- valeur initiale `omit` ;
- changement de `t` vers `include` après réussite d'une tentative utilisant les credentials.

La bascule est persistante dans cette variable de contexte pour les appels ultérieurs qui utilisent sa valeur.

**Conséquence :** Optimyze essaie d'abord de récupérer les ressources sans transmettre les credentials du navigateur, mais sait utiliser les credentials lorsque cette première stratégie échoue.

Cela constitue un indice fort d'une dépendance possible aux cookies ou à l'état d'authentification du navigateur.

Il ne faut cependant pas conclure que les cookies sont l'unique mécanisme d'authentification, ni que leur copie suffirait à rendre les requêtes autonomes sur SERVOR.

**E. Wrapper `N()`**

Le code définit immédiatement après `L()` un wrapper de la forme :

`const N=(e,n=null)=>L(e,0,t,n).catch(()=>null)`

Ce wrapper :
- appelle `L()` avec le mode de credentials courant ;
- transmet éventuellement l'objet de progression ;
- transforme les erreurs rejetées en résultat `null`.

Cela signifie que certains appelants de `N()` ne reçoivent pas nécessairement le détail de l'erreur HTTP ou réseau d'origine.

Il faudra tenir compte de cette perte d'information lors de l'analyse des chemins d'échec.

**F. Récupération et analyse du manifeste par `P()`**

Le code contient :

`async function P(e)`

La fonction :
- lit `e.manifestUrl` ;
- retourne une liste vide si aucune URL de manifeste n'a été observée ;
- effectue un `fetch()` du manifeste avec le mode de credentials courant ;
- vérifie le statut HTTP ;
- lit le contenu texte ;
- analyse le document XML avec `DOMParser` ;
- vérifie la présence d'un élément `MPD` ;
- extrait notamment la durée de présentation, l'heure de disponibilité et les structures `AdaptationSet` et `SegmentTemplate` ;
- récupère les modèles d'URL média nécessaires à la suite du traitement.

Le code de journalisation du manifeste applique une expurgation à certains paramètres nommés `Token`, `Signature` et `Key`.

Cette protection est un constat positif, mais sa portée est limitée à cette opération de journalisation identifiée.

Elle ne démontre pas que toutes les autres fonctions de journalisation, tous les messages d'erreur ou toutes les sorties de diagnostic expurgent systématiquement les URL et paramètres sensibles.

Une vérification distincte des autres chemins de journalisation reste nécessaire avant toute réutilisation du mécanisme.

**G. Préparation du fragment d'initialisation par `B()`**

Déclaration unique repérée à l'offset 27525 :

`async function B(e,t,n)`

Les recherches `async function B(` et `function B(` retrouvent la même déclaration. Elles ne correspondent pas à deux fonctions différentes.

Le comportement du corps est le suivant :

1. Si `t.init` est présent, la fonction tente de le récupérer via `N(t.init)`.
2. Si cette récupération réussit, elle retourne les données obtenues.
3. En cas d'échec, elle journalise l'échec de l'URL d'initialisation.
4. Elle inspecte ensuite `n[0]` en parcourant les boîtes MP4.
5. Si une boîte `moov` est trouvée avant une boîte `moof` ou `mdat`, elle considère ce premier bloc comme contenant déjà le fragment d'initialisation attendu et le retourne.
6. Sinon, si un modèle `mediaTemplate` ou `initTemplate` est disponible, elle reconstruit une URL d'initialisation avec `D()` et tente de la récupérer via `N()`.
7. Si aucune voie ne fonctionne, elle retourne `null`.

Le rôle visible est celui d'une routine de préparation ou de récupération du fragment d'initialisation MP4 d'une piste DASH.

**Limite d'interprétation :** le contrat complet des paramètres `e`, `t` et `n` ne doit pas être déduit du seul corps de la fonction. Les appelants de `B()` doivent encore être examinés pour confirmer précisément la nature des données transmises, notamment celle de `n[0]`.

**H. Synthèse du chemin DASH observé**

Les éléments examinés permettent de décrire le mécanisme général suivant :

1. `inject.js` observe les requêtes du lecteur Wyze.
2. Les URL reconnues sont transmises à `content.js`.


3. `content.js` associe les URL à un état de lecture contenant le manifeste et les modèles de fragments.
4. `P()` récupère et analyse le manifeste DASH.
5. `D()` reconstruit les URL de fragments à partir des modèles observés.
6. `L()` récupère les ressources en essayant d'abord les requêtes sans credentials, puis éventuellement avec ceux du navigateur.
7. `N()` fournit une interface simplifiée qui transforme les erreurs en résultat `null`.
8. `B()` prépare ou récupère les fragments d'initialisation nécessaires à une piste.
9. Les routines MP4 traitent ensuite les fragments et construisent le conteneur final.

Cette séquence décrit les responsabilités observées dans le code. L'ordre exact des appels et le contrat complet des paramètres doivent encore être confirmés par l'examen des appelants.

**Conclusion technique :** Optimyze est conçu pour exploiter les informations de lecture déjà observées dans le contexte Wyze Web View. Il ne s'agit pas d'un client autonome disposant d'une méthode documentée pour retrouver à lui seul les ressources de n'importe quel événement.

##### 4.3.4.10 Ce qui reste à démontrer pour Optimyze

- Le détail complet des appelants de `B()` et le contrat de ses paramètres.
- Les conditions exactes d'adoption et de remplacement de `manifestUrl`.
- La gestion complète des cookies et des credentials.
- Les conditions de renouvellement des URL temporaires.
- La possibilité de reproduire le mécanisme hors navigateur.
- La compatibilité avec la Sonnette Grille.
- La compatibilité future avec les Outdoor Cam.
- La possibilité de récupérer les clips sans session Web active.
- La robustesse du moteur sur des flux DASH réels et leurs éventuelles particularités.
- La couverture de l'expurgation des URL et paramètres sensibles dans tous les chemins de journalisation.

Aucune installation ou connexion de compte Wyze via Optimyze n'est autorisée.

##### 4.3.4.11 Pièges liés aux fonctions homonymes dans le JavaScript minifié

L'analyse de `content.js` a révélé plusieurs noms de fonctions déclarés plusieurs fois.

Ce phénomène est particulièrement piégeux dans un fichier minifié : les identifiants courts sont réutilisés pour réduire la taille du code.

**Une recherche textuelle sur un nom ne suffit donc pas à identifier une fonction.**

Il faut distinguer :
- les déclarations de fonctions nommées ;
- les appels à une fonction ;
- les fonctions fléchées et expressions de fonctions ;
- les identifiants locaux réutilisés dans des fonctions différentes ;
- les portées lexicales dans lesquelles ces identifiants sont définis.

Les offsets ci-dessous sont des positions en octets, calculées dans le fichier `content.js` identifié par le SHA-256 :

`ed6210d52a85cbe161581e54c09f574068462360f10efaefa43bf42aa4eb91e1`

Taille : 69 902 octets.

Le fichier est minifié sur une seule ligne. Les offsets en octets sont donc plus utiles que des numéros de ligne.

**A. Les deux déclarations `function g()`**

| Offset | Signature | Fonction |
|---:|---|---|
| 2327 | `function g(e,t)` | Application d'un modèle de nom de fichier |
| 8441 | `function g(e,t,n)` | Construction de la boîte MP4 `moov` |

Première déclaration, offset 2327 :

`function g(e,t)`

Cette fonction :
- remplace les variables d'un modèle de nom de fichier ;
- nettoie les valeurs insérées ;
- normalise les séparateurs et les espaces ;
- est exposée dans l'objet retourné sous le nom `applyPattern` ;
- est utilisée par `buildFilename`.

L'appel identifié dans le contexte de `buildFilename` apparaît à l'offset 3102.

Deuxième déclaration, offset 8441 :

`function g(e,t,n)`

Cette fonction appartient au moteur MP4.

Elle :
- construit la boîte `moov` ;
- calcule les durées des pistes ;
- construit notamment les métadonnées `mvhd` ;
- construit les structures `trak`, dont `tkhd` et `mdia`.

Les appels identifiés dans le constructeur MP4 apparaissent aux offsets 12713 et 12822.

Il s'agit de deux fonctions de responsabilités totalement différentes.

Retenir la première occurrence de `function g` aurait conduit à extraire une fonction de nommage de fichiers à la place du constructeur MP4.

**B. Les deux déclarations `function u()`**

| Offset | Signature | Fonction |
|---:|---|---|
| 1474 | `function u(e,t,n)` | Enveloppe d'opération asynchrone de stockage |
| 5036 | `function u(e)` | Analyseur du fragment d'initialisation MP4 |

Première déclaration, offset 1474 :

`function u(e,t,n)`

Cette fonction :
- enveloppe une opération asynchrone sur une API de stockage ;
- appelle une méthode telle que `get` ou `set` ;
- gère le callback et, le cas échéant, la Promise retournée ;
- est utilisée par la gestion de l'historique des événements téléchargés ;
- est également utilisée pour les paramètres sonores.

Appels identifiés dans les contextes examinés :
- offset 1652 : lecture de l'historique ;
- offset 1914 : écriture de l'historique ;
- offset 1957 : opération de stockage dans la méthode `clear` ;
- offset 2896 : lecture des paramètres sonores ;
- offset 3014 : écriture des paramètres sonores.

Deuxième déclaration, offset 5036 :

`function u(e)`

Cette fonction appartient au moteur MP4.

Elle :
- recherche la boîte `moov` ;
- analyse `mvhd` ;
- recherche `trak`, `tkhd` et `mdia` ;
- analyse les informations de piste et les descriptions d'échantillons ;
- extrait notamment l'identifiant de piste, le type de média, les dimensions, les échelles de temps et les paramètres nécessaires à la reconstruction.

Appels identifiés dans les contextes examinés :
- offset 11682 ;
- offset 13498 ;
- offset 13777.

Cette fonction est le parseur d'initialisation utilisé par le moteur MP4.

Elle a joué un rôle central dans l'analyse du problème de conservation des edit lists `edts/elst`.

**C. Inventaire des dix noms répétés**

Le relevé des déclarations nommées a trouvé 79 déclarations au total et dix noms déclarés plusieurs fois.

| Nom | Nombre de déclarations | Offsets en octets |
|---|---:|---|
| `a` | 3 | 691, 3653, 14800 |
| `c` | 2 | 1309, 4863 |
| `g` | 2 | 2327, 8441 |
| `h` | 2 | 8225, 20257 |
| `l` | 2 | 1095, 4634 |
| `m` | 2 | 6723, 20121 |
| `n` | 3 | 3239, 14480, 17780 |
| `o` | 3 | 3305, 14601, 19756 |
| `p` | 3 | 2114, 6979, 20181 |
| `u` | 2 | 1474, 5036 |

Les signatures et les rôles identifiés à partir des extraits sont les suivants.

| Nom | Offset | Signature | Rôle identifié |
|---|---:|---|---|
| `a` | 691 | `a(e)` | Sélectionne le modèle de nom de fichier selon le format configuré |
| `a` | 3653 | `a(e,t,n,o)` | Recherche une boîte MP4 d'un type donné dans une plage |
| `a` | 14800 | `a(e,n)` | Construit une configuration audio AAC de type AudioSpecificConfig |
| `c` | 1309 | `c(e)` | Enveloppe une opération d'écriture dans le stockage |
| `c` | 4863 | `c(e,t,n,...o)` | Construit une boîte MP4 avec version, flags et contenu |
| `g` | 2327 | `g(e,t)` | Applique un modèle de nom de fichier |
| `g` | 8441 | `g(e,t,n)` | Construit la boîte MP4 `moov` |
| `h` | 8225 | `h(e)` | Construit la table `stts` en regroupant les durées d'échantillons identiques |
| `h` | 20257 | `h()` | Recherche la carte Wyze située sous le pointeur dans l'interface |
| `l` | 1095 | `l()` | Lit les paramètres depuis le stockage |
| `l` | 4634 | `l(e,...t)` | Sérialise une boîte MP4 et ses données |
| `m` | 6723 | `m(e,t)` | Analyse un fragment média MP4 et ses échantillons |
| `m` | 20121 | `m()` | Suit la carte Wyze actuellement ciblée dans l'interface |
| `n` | 3239 | `n(e,t)` | Lit une valeur entière 64 bits à partir d'une DataView |
| `n` | 14480 | `n(e)` | Décode une valeur audio G.711 μ-law |
| `n` | 17780 | `n(e)` | Calcule un CRC32 |
| `o` | 3305 | `o(e,t)` | Lit un identifiant de boîte MP4 sur quatre caractères |
| `o` | 14601 | `o(e)` | Décode une valeur audio G.711 A-law |
| `o` | 19756 | `o(...e)` | Journalisation conditionnelle des messages Optimyze |
| `p` | 2114 | `p(e)` | Nettoie et normalise un nom de fichier |
| `p` | 6979 | `p(e,o,i,s)` | Analyse les échantillons d'un fragment MP4 |
| `p` | 20181 | `p(e)` | Détermine si une autre carte Wyze est récemment ciblée |

Cet inventaire est fondé sur les signatures et les extraits de corps examinés. Il ne signifie pas que les dix groupes représentent dix collisions de portée globale.

En particulier, la réutilisation d'un identifiant minifié dans deux fonctions ou deux fermetures ne signifie pas nécessairement que l'une écrase l'autre. Il faut déterminer la portée de chaque déclaration avant de parler de collision effective à l'exécution.

**D. Distinction entre déclarations et appels**

Un premier relevé a cherché les déclarations à partir de `function`, puis les occurrences d'appel à partir du nom lui-même.

Cette méthode avait un défaut : les offsets ne commençaient pas au même caractère.

Par exemple :
- déclaration de `g` : offset 2327 ;
- occurrence de `g(` dans cette déclaration : offset 2336.

La différence est de neuf octets, correspondant au préfixe `function `.

La même différence existe pour les déclarations de `u`.

Il ne faut donc pas comparer directement les offsets des deux recherches pour éliminer les déclarations.
De plus, les occurrences syntaxiques d'un identifiant ne sont pas nécessairement des appels à la fonction étudiée.

Le cas de `u` l'illustre particulièrement bien :
- les appels du stockage utilisent la fonction `u(e,t,n)` de la première portée ;
- les appels du moteur MP4 utilisent la fonction `u(e)` de la seconde portée ;
- d'autres occurrences de `u()` sont des fonctions locales ou des identifiants de fonctions fléchées, notamment dans les modules audio et d'interface.

Les occurrences à proximité des offsets 17258, 17299 et 17311 appartiennent notamment à un identifiant local utilisé pour écrire des données WAV. Elles ne doivent pas être attribuées au parseur MP4.

Les occurrences autour des offsets 49072 et 49434 à 49453 sont également dans un contexte local de gestion de progression. Celles observées autour des offsets 61838 et 62857 appartiennent à l'interface.

Il est donc incorrect de conclure qu'une fonction appelée `u` est systématiquement le parseur MP4.

**E. Méthode obligatoire pour toute extraction ultérieure**

Pour chaque fonction minifiée étudiée :

1. Calculer et conserver le SHA-256 du fichier source.
2. Rechercher toutes les déclarations portant le nom concerné.
3. Relever leurs positions exactes en octets.
4. Comparer leurs signatures et leurs corps.
5. Examiner les fonctions qui les appellent.
6. Vérifier les données consommées et les valeurs retournées.
7. Identifier les portées lexicales et les fonctions locales.
8. Distinguer les appels effectifs des déclarations et des simples occurrences textuelles.
9. Confirmer le rôle à partir du contexte statiquement identifiable.
10. Extraire uniquement la déclaration dont le rôle a été démontré.
11. Conserver une référence à la position et au SHA-256 du fichier source.

Ne jamais se contenter de la première occurrence retournée par `grep`, une recherche textuelle ou un script d'extraction.

**Conséquence pour la reproductibilité**

L'extraction du moteur MP4 doit être considérée comme une opération d'analyse structurée, et non comme une simple copie de fonctions identifiées par leur nom.

Les offsets et les signatures de ce document concernent exclusivement le `content.js` version 0.5.1 identifié par le SHA-256 indiqué ci-dessus.

Toute nouvelle version de l'extension devra faire l'objet d'une nouvelle vérification. Les noms et positions observés dans la version 0.5.1 ne doivent pas être supposés stables.


#### 4.3.5 Reconstitution détaillée de la chaîne de lecture DASH — 25 novembre 2026

Une analyse complémentaire de `content.js` a permis de préciser comment Optimyze obtient les URL de lecture et comment il exploite le manifeste DASH.

Cette analyse est fondée sur le fichier local identifié en section 4.3. Les recherches ont porté sur toutes les occurrences de `manifestUrl`, `mediaTemplate` et `initTemplate`, sur le gestionnaire des messages `__wyzeDownloader` et sur les fonctions de traitement du manifeste.

Aucun script de l'extension n'a été exécuté. Aucune requête Wyze n'a été effectuée dans le cadre de cette analyse.

##### 4.3.5.1 Classification des requêtes interceptées

Le gestionnaire de messages de `content.js` reçoit les URL transmises par `inject.js` avec le marqueur :

`__wyzeDownloader: "url"`

Il analyse le chemin de chaque URL et distingue trois catégories :

| Catégorie | Motif détecté | Information conservée |
|---|---|---|
| Manifeste | `getDASHManifest` ou `getMPDManifest` | `manifestUrl` |
| Fragment média | `getMP4MediaFragment` | `mediaTemplate` |
| Fragment d'initialisation | `getMP4InitFragment` | `initTemplate` |

Le code utilise les expressions régulières suivantes pour reconnaître les catégories :

```js
/get(DASH|MPD)Manifest/i
/getMP4MediaFragment/i
/getMP4InitFragment/i
```

Pour les fragments, le gestionnaire récupère également le paramètre `TrackNumber`, lorsqu'il est présent, et l'ajoute à l'ensemble des pistes connues.

Les trois informations ne sont donc pas déduites d'un même objet ni générées uniquement à partir du manifeste : elles sont capturées à partir des requêtes réellement observées pendant la lecture.

##### 4.3.5.2 Association des requêtes au bon événement

Le code ne conserve pas indistinctement toutes les URL observées.

Il tente de rattacher chaque requête à un contexte de lecture pertinent :

- lecteur global ou lecteur actif ;
- fenêtre modale de lecture ;
- carte vidéo actuellement chargée ;
- carte vidéo survolée par le pointeur.

Le code prévoit également un cas ambigu lorsqu'une carte est en cours de chargement et que le pointeur vient d'entrer sur une autre carte.

Cette association est importante : les URL d'un événement ne doivent pas être mélangées avec celles d'un autre événement.

Le gestionnaire conserve un état par contexte, comprenant notamment :

```js
{
  manifestUrl: null,
  mediaTemplate: null,
  initTemplate: null,
  tracks: new Set()
}
```

Lorsqu'une nouvelle URL de manifeste est adoptée depuis le lecteur, le code réinitialise les deux modèles de fragments, l'ensemble des pistes et l'indicateur d'échec du manifeste. Cela évite de réutiliser les modèles observés pour une lecture précédente.

##### 4.3.5.3 Récupération du manifeste depuis le lecteur

Une seconde voie permet à `content.js` de demander au contexte de la page l'URL courante du lecteur.

Le mécanisme est le suivant :

1. `content.js` envoie un message `ask-src`.
2. `inject.js` recherche le lecteur vidéo correspondant.
3. Il tente de lire `player.currentSrc()`.
4. L'URL est renvoyée avec le marqueur `__wyzeDownloader: "src"`.
5. `content.js` adopte cette URL comme `manifestUrl` si elle diffère de celle déjà connue.

Lors de cette adoption, `mediaTemplate` et `initTemplate` sont remis à `null`, les pistes sont réinitialisées et l'état d'échec du manifeste est effacé.

Ce mécanisme confirme qu'Optimyze peut obtenir l'URL du manifeste directement depuis le lecteur Wyze, en complément de l'interception des requêtes réseau.

Il ne démontre pas que cette URL peut être obtenue indépendamment du lecteur ou de la session Web View.

##### 4.3.5.4 Analyse du manifeste par `P()`

La fonction `P(e)` est le parseur principal du manifeste DASH.

Elle commence par vérifier la présence de `e.manifestUrl`, puis effectue une requête :

```js
fetch(n, { credentials: t })
```

Elle vérifie la réponse HTTP et lit le manifeste comme texte. En cas d'échec de récupération ou de réponse HTTP non valide, elle positionne `manifestFailed` et retourne une liste vide.

Le texte est ensuite analysé avec `DOMParser` en XML.

Le parseur extrait notamment :

- `mediaPresentationDuration` depuis l'élément `MPD` ;
- `availabilityStartTime`, lorsqu'il est présent ;
- les éléments `AdaptationSet` ;
- les éléments `SegmentTemplate` ;
- l'attribut `media` du modèle de segments ;
- le `TrackNumber`, lorsqu'il est présent dans l'URL du modèle ;
- `SegmentTimeline` et le nombre de segments calculé à partir des éléments `S` et de leur répétition `r` ;
- à défaut de `SegmentTimeline`, une estimation du nombre de segments à partir de `duration`, `timescale` et de la durée de présentation ;
- `initialization` ;
- `startNumber` ;
- `mimeType` ;
- `audioSamplingRate`, lorsqu'il est disponible.

Les URL relatives du manifeste sont résolues par rapport à l'URL du manifeste.

Pour chaque piste exploitable, la fonction retourne un objet contenant notamment :

- `number` ;
- `media` ;
- `init` ;
- `count` ;
- `startNumber` ;
- `mime` ;
- `sampleRate`.

**Point important :** le parseur ne renseigne pas directement `e.mediaTemplate` ou `e.initTemplate`. Ces deux propriétés proviennent du gestionnaire des requêtes interceptées. Le manifeste fournit une description des pistes et des modèles de segments, tandis que les modèles de fragments observés dans le trafic restent conservés séparément dans l'état du lecteur.

##### 4.3.5.5 Construction et téléchargement des fragments

La fonction `D(e, type, trackNumber, sequenceNumber)` construit une URL de fragment à partir d'une URL déjà observée.

Elle sélectionne :

- `initTemplate` ou `mediaTemplate` selon le type demandé ;
- le modèle de l'autre type en solution de repli, si nécessaire.

Elle remplace le dernier élément du chemin par :

- `getMP4InitFragment.mp4` pour l'initialisation ;
- `getMP4MediaFragment.mp4` pour les fragments média.

Elle renseigne ensuite les paramètres `TrackNumber` et, le cas échéant, `SequenceNumber`.

La fonction `R(e, n)` remplace le marqueur `$Number$` dans les modèles DASH par le numéro de séquence demandé. Elle prend également en charge le formatage numérique de type `$Number%0Nd$` et l'échappement `$$`.

La fonction `I(e, ...)` récupère les segments successifs de la piste. Elle utilise le nombre de segments et le numéro de départ fournis par le manifeste, avec une limite de sécurité de 20 000 segments.

La fonction `B(...)` obtient le segment d'initialisation de la piste selon trois possibilités :

1. utiliser directement l'URL `init` extraite du manifeste ;
2. réutiliser le premier fragment média si celui-ci contient déjà une boîte `moov` ;
3. construire une URL d'initialisation à partir d'un modèle de fragment déjà observé.

Le dernier cas dépend donc de la capture préalable d'une URL de fragment.

##### 4.3.5.6 Dépendance à la session du navigateur

Les fonctions de récupération utilisent `fetch()` avec le mode `credentials` défini dans le script.

Le code prévoit également des mécanismes de reprise et de gestion des erreurs HTTP, notamment pour les réponses 401 et 403. Certaines récupérations utilisent `cache: "no-store"`.

Le téléchargement dépend donc du contexte d'authentification et des possibilités de requête offertes par la page Wyze.

L'analyse statique ne permet pas d'affirmer que les credentials sont exclusivement des cookies, ni d'établir à elle seule le détail complet du mécanisme d'authentification. Elle démontre en revanche qu'Optimyze ne traite pas les URL comme des ressources publiques indépendantes de toute session.

Lorsque le script ne dispose pas d'une session exploitable, il peut échouer avec le message :

`Could not load this event - hover it until it plays, then click again`

Lorsque le manifeste a échoué, le code peut également signaler que le lien de l'événement a expiré.

##### 4.3.5.7 Conséquences pour une récupération autonome sur SERVOR

L'analyse permet de distinguer trois catégories d'informations :

| Information | Origine | Dépendance constatée |
|---|---|---|
| URL du manifeste | Requête interceptée ou `player.currentSrc()` | Lecteur Wyze / session Web View |
| Modèles des fragments d'initialisation et média | Requêtes interceptées pendant la lecture | Trafic de lecture du navigateur |
| Description des pistes et des segments | Analyse du MPD par `P()` | URL du manifeste et accès authentifié |

Optimyze n'est donc pas un simple client API autonome auquel il suffirait de fournir un identifiant d'événement.

Son fonctionnement documenté repose sur une lecture Wyze préalablement engagée dans le navigateur, l'observation des URL de ressources et l'utilisation du contexte de requête de la page.

Une adaptation sur SERVOR devrait reproduire ou remplacer explicitement ces fonctions :

- obtenir une URL de manifeste exploitable ;
- obtenir les modèles de fragments nécessaires ;
- disposer d'un mécanisme d'authentification compatible ;
- récupérer les fragments ;
- reconstruire et vérifier le MP4.

Le moteur MP4 extrait et testé en section 4.3.4 ne résout que la dernière partie de cette chaîne. Sa validation sur médias synthétiques ne prouve pas que les ressources Wyze peuvent être obtenues.

**Conclusion technique :** Optimyze constitue une preuve de faisabilité du téléchargement et de l'assemblage de fragments DASH dans le contexte de Wyze Web View. Il ne constitue pas une preuve de récupération autonome depuis SERVOR, sans navigateur.



---

## 5. Authentification Wyze

Une clé API personnelle a été créée depuis le portail officiel :

https://developer-api-console.wyze.com/#/apikey/view

Documentation :

https://support.wyze.com/hc/en-us/articles/16129834216731-Creating-an-API-Key

Les valeurs Key ID et API Key sont conservées localement et ne doivent jamais être publiées.

Script de test :

`/tmp/wyze-audit.hiRZRx/auth-check.js`

L'authentification utilise notamment :
- `https://auth-prod.api.wyze.com/api/user/login`
- une requête POST ;
- un mot de passe transformé par triple MD5 ;
- des en-têtes comprenant notamment `x-api-key`, `apikey` et `keyid`.

Résultat du 22 novembre 2026 :
- HTTP 200 ;
- `access_token` présent ;
- `refresh_token` présent ;
- authentification validée.

Les jetons sont stockés dans `secrets/session-tokens.json`.

La méthode `getRefreshToken()` de wyze-node effectue un POST vers :

`https://api.wyzecam.com/app/user/refresh_token`

Aucun renouvellement n'a été exécuté pendant les essais documentés.

La validation de l'authentification ne démontre pas que tous les endpoints vidéo sont utilisables.

---

## 6. Identification de la caméra

Endpoint interrogé :

`https://api.wyzecam.com/app/v2/home_page/get_object_list`

Résultat : HTTP 200.

Caméra identifiée :

| Champ | Valeur |
|---|---|
| Nom | Sonnette Grille |
| Modèle | GW_BE1 |
| Identifiant Wyze | GW_BE1_7C78B2A71D53 |
| Firmware | Valeur observée dans l'inventaire initial |
| Hardware | Valeur observée dans l'inventaire initial |
| Type | Camera |

L'identifiant retourné par Wyze est conservé exactement comme fourni.

**Identification de la caméra pilote : validée.**

Les valeurs de firmware et de hardware devront être rattachées à une sortie source expurgée avant d'être considérées comme des preuves documentaires autonomes.

---

## 7. Récupération des événements cloud

Endpoint :

`https://api.wyzecam.com/app/v2/device/get_event_list`

Méthode : POST.

Méthode correspondante dans wyze-node : `getEventList(options)`.

Paramètres identifiés :
- `count`
- `event_type`
- `device_mac_list`
- `event_value_list`
- `event_tag_list`
- `order_by`
- `end_time`
- `begin_time`

Résultats observés le 22 novembre 2026 :
- HTTP 200.
- Code Wyze 1 — SUCCESS.
- 9 événements dans une première fenêtre de 24 heures.
- 10 événements lors d'une interrogation ultérieure.
- Événements associés à la Sonnette Grille.
- `event_value` observé : 13.
- `read_state` observé : 0 ; signification non interprétée sans documentation.
- Présence des champs `file_list` et `event_resources`.

La lecture des événements est validée expérimentalement pour la caméra pilote.

### 7.1 Ressources des événements

Les événements examinés présentent notamment :

1. Une ressource S3, `resource_version: 0`, type 1, statut 2, marquée `required`.
2. Une ressource KVS, `resource_version: 3`, marquée `required` et `is_playable: true`, avec `begin_time` et `end_time`.

Les fenêtres KVS observées ont des durées variables.

La ressource `file_list` examinée contient une URL S3 présignée dont le chemin se termine par `.jpg`.

Elle est considérée comme une image ou une miniature, et non comme le clip vidéo.

Aucun téléchargement de cette ressource n'a été effectué.

Les URL présignées, identifiants de fichiers, mots de passe de chiffrement et paramètres sensibles ne doivent jamais être publiés.

---

## 8. Tentatives d'obtention d'une URL de replay

Méthode identifiée dans wyze-node :

`getEventVideoURL(options)`

Endpoint :

`https://beta-ams-api.wyzecam.com/api/v1/kinesis/replay_url/get`

La méthode envoie notamment :
- `device_mac`
- `begin_time`
- `end_time`
- `expires`
- `max_manifest_fragment`
- `device_model`
- paramètres `sc` et `sv` propres à l'API v1 ;
- champs communs construits par `getRequestBodyData()`.

La méthode retourne `result.data`, mais ne télécharge pas elle-même la vidéo.

Script local :

`/tmp/wyze-audit.hiRZRx/replay-url-check.js`

Le script utilise Node.js natif et lit le jeton depuis le fichier secret.

Il masque les informations sensibles dans les sorties et ne télécharge aucun média.

Trois appels autorisés ont été effectués sur une fenêtre d'événement réelle de la Sonnette Grille.

Résultat observé :
- HTTP 500 ;
- réponse JSON contenant `timestamp`, `path`, `status`, `error` et `requestId` ;
- absence de champ `data` ;
- absence de code d'erreur Wyze exploitable.

Interprétation :
- Il s'agit d'une erreur HTTP 500 générique du service.
- Ce résultat ne démontre ni un jeton invalide, ni l'indisponibilité du clip, ni une incompatibilité définitive du modèle.
- La comparaison hors réseau de la requête Axios avec le script Node natif reste à effectuer.
- Trois tentatives ont échoué avec HTTP 500.
- Aucun nouvel appel à cet endpoint ne doit être effectué sans autorisation explicite.
- Aucun clip n'a été téléchargé.

## 8. Tentatives d'obtention d'une URL de replay

### 8.1 Analyse statique de l'endpoint KVS Replay v4 — 25 novembre 2026
### Remontée du paramètre `resource_version` jusqu'à la ressource KVS

L'analyse du DEX de l'APK Wyze 3.26.0.1046 (versionCode 62746) permet désormais de remonter le paramètre `resource_version` jusqu'à l'objet ressource sélectionné par le ViewModel.

**1. Appel depuis `EventGroupViewModel$fetchVideoUrl$2`**

Le ViewModel parcourt une liste de ressources et sélectionne celle dont `Lepu.f()` renvoie la chaîne `"kvs"`.

Il récupère ensuite :
- `deviceId` et `productModel` depuis l'objet appareil ;
- `startTime` et `endTime` depuis les champs temporels de la ressource ;
- une valeur long depuis `Lepu.g()`.

Cette dernière valeur est convertie en entier (`long-to-int`) puis transmise à l'interface `kwc.f(...)`, avec `isLive=false`.

La signature appelée est :

`(String, String, long, long, boolean, int) -> Lu6e;`

Elle correspond au wrapper `getKvsReplayUrl`.

**2. Origine de la valeur transmise**

L'implémentation de `Lepu.g(): long` lit directement le champ `Lepu.b:J` :

`iget-wide ..., Lepu;.b:J`

La méthode de sérialisation `Lepu.j()` confirme que ce champ correspond à l'élément de sérialisation d'index 1 et qu'il est encodé comme un long (`encodeLongElement`).

La chaîne de transmission est donc établie :

`Lepu.b (long) → Lepu.g() → long-to-int → getKvsReplayUrl(..., resourceVersion) → query parameter resource_version`

**3. Limite de l'identification**

Le nom JSON associé à l'élément de sérialisation d'index 1 n'est pas encore identifié. Il serait donc prématuré d'affirmer que le champ JSON source porte lui-même le nom `resource_version`.

En revanche, le lien entre la valeur de `Lepu.b`, sa transmission au wrapper et son utilisation comme paramètre HTTP `resource_version` est démontré par le désassemblage.

**4. Conséquence pour la compatibilité KVS v3**

Cette analyse confirme que le chemin de lecture de l'application utilise une ressource identifiée comme `"kvs"` et transmet sa valeur de version à l'endpoint `/app/v4/replay_url`, avec `is_live=false`.

Elle ne démontre pas encore que la valeur de version de la ressource KVS v3 observée dans la capture `get_event_list` est acceptée par cet endpoint, ni que la réponse obtenue permet effectivement de télécharger et reconstruire le clip.

**État :** remontée du callsite et de la valeur de version établie ; nom JSON source et compatibilité effective KVS v3 non établis.

---

## 9. Architecture cible : Wyze Archive

Le projet ne doit pas se limiter à un script de téléchargement.

L'objectif est un véritable système local d'archivage et de consultation, conçu pour trois caméras à terme.

### 9.1 Composants fonctionnels

**1. Collecteur Wyze**

- Authentification.
- Lecture des événements et métadonnées.
- Filtrage par caméra autorisée.
- Détection des nouveaux événements.
- Gestion des erreurs et renouvellement des jetons.

**2. Extracteur vidéo**

- Obtention des ressources de lecture.
- Récupération des clips enregistrés.
- Vérification de l'intégrité des médias.
- Conversion ou assemblage MP4 si nécessaire.

Le moteur MP4 a passé un premier essai synthétique, mais le mécanisme de récupération des fragments réels reste à déterminer.

**3. Index local**

- Identifiant de l'événement.
- Caméra concernée.
- Date et heure.
- Durée.
- Statut de récupération.
- Référence vers le fichier vidéo.
- Informations utiles à la recherche.

**4. Archive**

- Stockage des fichiers MP4.
- Miniatures.
- Organisation par caméra et date.
- Déduplication.
- Politique de conservation configurable.

**5. API locale**

- Accès aux métadonnées.
- Accès aux vidéos archivées.
- Contrôle des autorisations.
- Interface indépendante des identifiants Wyze.

**6. Interface Web**

L'interface constitue une exigence fonctionnelle du projet, pas une option secondaire.

Elle devra permettre :
- la consultation des trois caméras ;
- la navigation par calendrier ;
- la recherche par date et période ;
- les filtres par caméra ;
- les vignettes des événements ;
- la lecture vidéo directement dans le navigateur ;
- l'activation du son ;
- le téléchargement individuel des clips ;
- l'affichage des métadonnées ;
- le suivi des événements non récupérés ou en erreur.

L'utilisateur ne devra pas avoir à parcourir manuellement les dossiers du NAS pour retrouver une vidéo.

### 9.2 Architecture logique

```text
             WYZE CLOUD
                  |
                  v
            Collecteur Wyze
                  |
                  v
            Extracteur vidéo
                  |
          +-------+-------+
          |               |
          v               v
      Index local     Archive MP4
          |               |
          +-------+-------+
                  |
                  v
              API locale
                  |
                  v
             Interface Web
                  |
                  v
          Lecture des archives
```

### 9.3 Isolation et accès

- Service Docker dédié.
- Volumes indépendants.
- Aucun accès inutile aux autres services.
- Secrets absents de l'image Docker.
- Interface accessible sur le réseau local.
- Accès distant uniquement via les mécanismes sécurisés déjà utilisés sur SERVOR.
- Aucun accès public direct.
- Consultation possible même si le Mac mini est indisponible.

### 9.4 Organisation indicative des archives

```text
Wyze-Archive/
├── Sonnette-Grille/
│   └── AAAA/
│       └── MM/
│           └── JJ/
│               ├── evenement-001.mp4
│               └── evenement-002.mp4
├── Outdoor-Cam-1/
├── Outdoor-Cam-2/
├── Database/
└── Thumbnails/
```

Le répertoire `Corpus-IA` est exclu : les archives vidéo ne font pas partie du corpus RAG.

### 9.5 Stratégies techniques à comparer

**A — API Wyze et Kinesis Replay**

Comprendre l'erreur HTTP 500 et vérifier si ce mécanisme peut être exploité de manière fiable. Aucun nouvel appel à l'endpoint Replay sans autorisation explicite.

**B — Extraction DASH/MP4**

Approfondir l'analyse d'Optimyze et déterminer si les manifestes et fragments observés dans Wyze Web View peuvent être récupérés sans dépendance permanente à Chrome.

Le moteur MP4 a désormais passé un test synthétique audio/vidéo. Les flux réels restent à tester.

**C — Bibliothèque wyze-node**

Réutiliser uniquement les méthodes utiles après audit, sans reprendre son stockage des secrets en clair.

**D — Architecture hybride**

Collecte des événements par API et extraction vidéo par un mécanisme distinct si nécessaire.

Aucune stratégie complète n'est encore validée.

Le choix final devra privilégier :
- la sécurité ;
- la fiabilité ;
- l'autonomie ;
- la simplicité de maintenance ;
- la compatibilité avec les trois caméras ;
- l'indépendance vis-à-vis de l'application mobile.

---

## 10. Interface de consultation : exigences

L'interface Web devra être conçue comme une application autonome de consultation des archives.

### 10.1 Tableau de bord

Afficher :
- les trois caméras ;
- leur état de fonctionnement ;
- le nombre d'événements archivés ;
- les derniers événements ;
- les éventuelles erreurs de synchronisation.

Une caméra en attente de réparation ne devra pas être présentée comme opérationnelle.

### 10.2 Recherche et navigation

Filtres attendus :
- caméra ;
- date ;
- période ;
- événement ;
- statut d'archivage.

Une vue calendrier et une chronologie des événements sont souhaitées.

### 10.3 Lecteur vidéo

Le lecteur devra permettre :
- lecture MP4 ;
- lecture du son ;
- pause et reprise ;
- navigation dans la vidéo ;
- affichage de la date et de la caméra ;
- téléchargement du fichier original.

La lecture devra fonctionner sur ordinateur et smartphone.

### 10.4 Sécurité de l'interface

- Authentification requise.
- Aucun accès direct aux identifiants Wyze.
- Pas de liens publics vers les vidéos.
- API locale avec permissions minimales.
- Protection contre l'accès à des fichiers hors du répertoire d'archives.
- Aucun accès direct à la base de données depuis le navigateur.

### 10.5 Intégration à l'environnement existant

Une entrée dans Homer pourra être ajoutée après validation du système.

Il faudra conserver les principes existants :
- accès LAN direct ;
- accès distant via Tailscale ;
- absence d'exposition publique ;
- authentification appropriée.

Aucune modification de Homer n'est prévue pendant l'audit.

---

## 11. Étapes de validation avant déploiement

| Étape | Travail | Résultat attendu | État |
|---:|---|---|---|
| 1 | Terminer l'analyse statique d'Optimyze | Compréhension du mécanisme | Première phase réalisée |
| 2 | Examiner les autres scripts de l'extension | Cartographie des scripts principaux | `inject.js` et `content.js` examinés ; autres scripts à confirmer |
| 3 | Comparer Axios et Node natif hors réseau | Identifier les différences de requête | À faire |
| 4 | Étudier l'extraction indépendante du navigateur | Choisir une méthode | À faire |
| 5 | Valider le moteur MP4 sur médias synthétiques | Reconstruction audio/vidéo fidèle | **Validé pour le cas synthétique testé** |
| 6 | Documenter les fonctions homonymes de `content.js` | Extraction reproductible | **Inventaire des déclarations nommées et rôles principaux documentés ; portées complètes non formellement cartographiées** |
| 7 | Examiner les appelants de `B()` | Contrat des paramètres confirmé | À faire |
| 8 | Vérifier les autres chemins de journalisation | Couverture de l'expurgation des secrets | À faire |
| 9 | Tester le moteur sur fragments Wyze réels | Compatibilité avec les médias de la caméra | À faire |
| 10 | Définir le modèle de sécurité | Architecture documentée | À faire |
| 11 | Concevoir le prototype isolé | Prototype non productif | À faire |
| 12 | Obtenir une ressource de lecture réelle et inspecter la réponse expurgée | URL et métadonnées comprises | À faire |
| 13 | Demander confirmation avant le téléchargement réel | Autorisation explicite | À faire |
| 14 | Télécharger un premier clip autorisé | Premier fichier récupéré | Non effectué |
| 15 | Vérifier MP4, son et intégrité | Lecture validée | À faire |
| 16 | Auditer le prototype | Risques identifiés et corrigés | À faire |
| 17 | Soumettre le déploiement à validation | Autorisation préalable | À faire |
| 18 | Installer le service sur SERVOR | Déploiement contrôlé | Non commencé |
| 19 | Construire l'interface de consultation | Archives accessibles | À faire |
| 20 | Réparer et diagnostiquer les Outdoor Cam | Éligibilité à l'intégration | En attente |
| 21 | Intégrer chaque Outdoor Cam séparément | Extension progressive | Non commencé |

Aucune étape ne doit être considérée comme validée sans résultat expérimental.

La validation synthétique du moteur MP4 ne remplace pas le test d'un véritable fichier Wyze.

---

## 12. Architecture cible et exigences de sécurité

L'objectif est de disposer d'une chaîne locale permettant de récupérer, analyser et reconstruire les vidéos Wyze, sans dépendre durablement de l'interface Web du fabricant.

Cette architecture reste un objectif à valider. Les essais réalisés ne démontrent pas encore qu'une récupération autonome des clips est possible.

### 12.1 Principes à respecter

- Conserver les fichiers et les traitements sur l'environnement local.
- Ne pas exposer les identifiants, mots de passe, jetons d'accès ou URL signées.
- Ne pas réutiliser directement un mécanisme de stockage des jetons en clair sans l'avoir préalablement sécurisé.
- Séparer les essais, les fichiers temporaires et les archives définitives.
- Ne pas modifier la configuration de production du NAS sans validation explicite.
- Ne pas télécharger de clips ni multiplier les appels à l'API Wyze sans autorisation explicite.

### 12.2 Chaîne de traitement envisagée

La chaîne cible comporte plusieurs étapes indépendantes :

1. Authentification auprès du service Wyze.
2. Identification de la caméra et récupération de ses événements.
3. Identification des ressources associées à un événement.
4. Obtention éventuelle d'une URL de lecture ou d'une ressource vidéo.
5. Récupération des fragments vidéo et audio.
6. Analyse des structures MP4 et des fragments.
7. Reconstruction d'un fichier MP4 exploitable.
8. Vérification de l'intégrité et archivage local.

Chaque étape doit être validée séparément. La réussite d'une étape ne prouve pas que les suivantes fonctionneront.

### 12.3 Conditions avant intégration au NAS

Avant toute intégration à SERVOR, il faudra notamment démontrer :

- que la récupération des ressources fonctionne de manière reproductible ;
- que les fragments peuvent être récupérés sans dépendre d'une session Web active, si cette autonomie est recherchée ;
- que les flux vidéo et audio sont reconstruits correctement ;
- que les fichiers obtenus sont lisibles et complets ;
- que les erreurs réseau, les expirations de jetons et les interruptions sont gérées ;
- que les secrets sont conservés dans un emplacement protégé ;
- que les traitements n'altèrent pas les données sources.

Aucune intégration de production n'est autorisée par les seuls résultats des essais en laboratoire.

---

## 13. Méthode de validation

Les validations doivent rester reproductibles et documentées.

### 13.1 Analyse statique

Pour chaque version du code étudiée :

- relever la version et l'origine du fichier ;
- calculer son SHA-256 ;
- identifier les fonctions et leurs appels ;
- vérifier les chemins de données ;
- distinguer les comportements démontrés des hypothèses.

Dans le JavaScript minifié d'Optimyze, un nom de fonction court ne constitue jamais une identification suffisante. Il faut rechercher toutes les déclarations portant ce nom, comparer leur position et leur signature, puis confirmer leur rôle avec les appels et le contexte lexical.

### 13.2 Essais MP4

Les essais du moteur MP4 doivent utiliser des fichiers synthétiques indépendants des caméras Wyze.

Ils doivent vérifier séparément :

- la lecture des boîtes MP4 ;
- l'analyse des structures `moof`, `traf`, `tfhd`, `tfdt` et `trun` ;
- les offsets et les plages de données ;
- la reconstruction des fragments ;
- la conservation des paquets audio et vidéo ;
- la lisibilité du fichier reconstruit.

Les résultats sur un fichier synthétique ne prouvent pas la compatibilité avec les fichiers Wyze.

### 13.3 Traçabilité

Pour chaque essai, conserver :

- la commande exécutée ;
- le résultat obtenu ;
- la version des outils ;
- les empreintes des fichiers concernés ;
- les éventuelles sauvegardes ;
- les limites et les points non vérifiés.

---

## 14. Journal des travaux — jusqu'au 22 novembre 2026

Les essais Wyze ont permis de confirmer le fonctionnement de l'authentification et de la récupération des événements pour la caméra pilote.

La récupération des ressources associées aux événements a également été observée. Les ressources identifiées comprennent des images JPEG hébergées sur S3 et une ressource de type Kinesis Replay.

La demande de récupération d'URL Kinesis Replay a été testée trois fois sur un événement autorisé. Les trois appels ont retourné une erreur HTTP 500 générique.

Aucun clip vidéo n'a été téléchargé.

L'analyse statique d'Optimyze a permis d'identifier les mécanismes d'interception des requêtes du navigateur, de récupération des manifestes DASH et de reconstruction des fragments MP4. Elle ne démontre pas encore que ces mécanismes peuvent être utilisés indépendamment de l'interface Web Wyze.

Le moteur MP4 indépendant a été développé et testé sur un fichier synthétique H.264/AAC. Les tests d'intégration vérifient notamment la conservation des signatures des paquets audio et des images vidéo décodées.

À ce stade, la récupération autonome des vidéos Wyze reste à démontrer.

## 15. Journal des travaux — 23 novembre 2026

### 15.1 Moteur MP4 indépendant : phase 4

La validation d'intégration sur un fichier MP4 fragmenté synthétique contenant de la vidéo H.264 et de l'audio AAC a été corrigée.

La comparaison stricte des empreintes des dernières trames audio décodées n'était pas pertinente : FFmpeg applique un `discard_padding` de 256 échantillons au dernier paquet du fichier reconstruit.

Les paquets AAC compressés sont en revanche comparés directement à l'aide de leurs signatures :

- PTS ;
- durée ;
- taille ;
- SHA-256 des données du paquet.

Les 95 paquets AAC sont ainsi vérifiés. La comparaison des images vidéo décodées reste également effectuée.

Le test d'intégration passe :

- 1 test réussi ;
- 0 échec.

Cette validation démontre la conservation des paquets sur le fichier synthétique utilisé. Elle ne démontre pas encore la compatibilité avec les fragments Wyze.

### 15.2 Moteur MP4 indépendant : phase 5

La phase 5 ajoute sept tests de robustesse au parseur de fragments.

Les cas vérifiés sont :

1. Acceptation de `first_sample_flags` sans `sample_flags`.
2. Acceptation de `sample_flags` sans `first_sample_flags`.
3. Rejet de l'utilisation simultanée de `first_sample_flags` et `sample_flags`.
4. Résolution de `base_data_offset` explicite sur 64 bits avec un `sourceOffset` non nul.
5. Enchaînement de plusieurs boîtes `trun`, la seconde poursuivant les données après la première.
6. Utilisation de la fin des données du `traf` précédent comme base implicite du `traf` suivant.
7. Priorité de `base_data_offset` explicite sur `default-base-is-moof` dans le cas testé.

Une seule ligne a été ajoutée dans `src/fragments/moof-parser.js` pour rejeter la combinaison interdite des deux indicateurs :

```js
if((f.flags & 0x000004) && (f.flags & 0x000400)) fail('first_sample_flags and sample_flags are mutually exclusive');
```

Une sauvegarde du fichier avant modification a été conservée sous :

`src/fragments/moof-parser.js.bak-phase5-trun-flags`

La documentation `README.md` a été actualisée pour présenter les phases 1 à 5 et les nouveaux tests.

### 15.3 Résultat global des tests

La suite complète a été exécutée avec :

```bash
npm test
```

Résultat :

- 25 tests exécutés ;
- 25 réussis ;
- 0 échec ;
- 0 test ignoré ;
- 0 test en attente.

Répartition :

- phases 1 à 3 : 17 tests ;
- phase 4 : 1 test d'intégration ;
- phase 5 : 7 tests de robustesse.

L'environnement utilise Node.js 24.22.3 et FFmpeg/FFprobe 9.0.2.

Le projet est configuré en modules ES (`"type": "module"`) et ne comporte pas de dépendance npm à l'exécution.

### 15.4 Limites de cette validation

Les 25 tests réussis valident uniquement les comportements couverts par les tests actuels.

Ils ne démontrent pas :

- la compatibilité avec toutes les variantes de MP4 fragmenté ;
- la prise en charge de tous les indicateurs et versions de boîtes ;
- la reconstruction de fragments provenant réellement de Wyze ;
- la récupération autonome des clips depuis les services Wyze.

Le moteur reste un outil expérimental en laboratoire.

Aucune modification n'a été effectuée sur SERVOR ou dans l'environnement de production.

### 15.5 Moteur MP4 indépendant sur Mac mini : architecture et pipeline

Le développement du moteur MP4 indépendant est réalisé dans un environnement de laboratoire distinct de SERVOR.

**Environnement :**

- Machine : Mac mini.
- Répertoire du projet : `~/dev/mp4-engine-lab/phase4/mp4-engine`.
- Node.js : 24.22.3.
- FFmpeg : 9.0.2.
- FFprobe : 9.0.2.
- Modules JavaScript ES (`"type": "module"`).
- Aucune dépendance npm à l'exécution.

**Organisation des sources :**

```text
mp4-engine/
├── src/
│   ├── binary/
│   │   └── reader.js
│   ├── boxes/
│   │   ├── parser.js
│   │   └── validator.js
│   ├── fragments/
│   │   └── moof-parser.js
│   ├── tracks/
│   │   └── init-parser.js
│   ├── muxer/
│   │   └── mp4-builder.js
│   └── index.js
├── test/
│   ├── fixtures/
│   │   └── generated-h264-aac-fragmented.mp4
│   ├── phase1.test.js
│   ├── phase2.test.js
│   ├── phase3.test.js
│   ├── phase4.integration.test.js
│   └── phase5.test.js
└── package.json
```

**Interface publique du moteur :**

Le fichier `src/index.js` expose huit fonctions :

- `BinaryReader` : lecture binaire.
- `parseBoxes` : analyse des boîtes MP4.
- `parseChildBoxes` : analyse des boîtes enfants.
- `boxPayload` : accès au contenu des boîtes.
- `validateBoxTree` : validation de l'arborescence.
- `parseInitSegment` : analyse du segment d'initialisation.
- `parseMoof` : analyse des fragments média.
- `buildMp4` : reconstruction du conteneur MP4.

**Pipeline du test d'intégration de phase 4 :**

Le fichier `test/phase4.integration.test.js` démontre la chaîne suivante :

1. Lecture du fichier MP4 fragmenté avec `parseBoxes`.
2. Identification du premier `moof`.
3. Extraction du segment d'initialisation.
4. Analyse des pistes et des valeurs par défaut avec `parseInitSegment`.
5. Analyse de chaque fragment avec `parseMoof`.
6. Extraction des données binaires de chaque échantillon à partir de `dataOffset` et `size`.
7. Regroupement des échantillons par identifiant de piste.
8. Reconstruction du fichier final avec `buildMp4`.
9. Vérification des flux avec FFprobe.
10. Décodage complet avec FFmpeg.
11. Comparaison des empreintes des images vidéo décodées.
12. Comparaison des signatures des paquets AAC : PTS, durée, taille et SHA-256.

Ce pipeline constitue une base d'intégration réutilisable pour étudier la compatibilité avec d'autres fragments DASH.

**Fixture synthétique du Mac mini :**

Le fichier `test/fixtures/generated-h264-aac-fragmented.mp4` est un média synthétique indépendant de Wyze.

Caractéristiques observées avec FFprobe :

- Vidéo H.264 Constrained Baseline, 320 × 240.
- Audio AAC-LC, 48 kHz, mono.
- 20 paquets vidéo.
- 95 paquets audio.
- Durée du conteneur : environ 2,021 secondes.

Un décodage intégral des deux pistes avec FFmpeg a été exécuté :

```bash
ffmpeg -v error -i "$P" -map 0:v:0 -map 0:a:0 -f null -
```

Résultat : code retour 0, aucune erreur de décodage.

**État :** moteur indépendant validé pour les scénarios synthétiques couverts par les 25 tests. La compatibilité avec les fragments provenant réellement de Wyze reste à démontrer.

Ce moteur est distinct du moteur Optimyze extrait et corrigé dans le laboratoire SERVOR. Les deux travaux ne doivent pas être confondus.


---

## 16. Point de reprise — 23 novembre 2026

La phase 6 du moteur MP4 indépendant est temporairement suspendue.

Les 25 tests des phases 1 à 5 sont validés. Les pistes de durcissement recensées précédemment restent des sujets de revue, et non des anomalies démontrées.

### 16.1 Objectif immédiat

Étudier la compatibilité entre :

- le moteur MP4 indépendant développé sur le Mac mini ;
- les fragments DASH conservés dans `/tmp/wyze-audit.hiRZRx/mp4-lab` sur SERVOR.

Aucune modification des sources existantes du moteur ne doit être effectuée pour cette première étude.

### 16.2 Étapes prévues

1. Consolider les informations sur les fichiers DASH présents dans le laboratoire SERVOR.
2. Vérifier leur provenance et leur statut : médias synthétiques ou ressources réellement issues de Wyze.
3. Examiner leur manifeste MPD, leurs segments d'initialisation et leurs fragments média.
4. Comparer les structures des fragments avec les capacités actuelles de `parseInitSegment` et `parseMoof`.
5. Définir un adaptateur isolé permettant de transmettre les échantillons au format attendu par `buildMp4`.
6. Réaliser les essais sur une copie de travail, sans modifier les sources ni les tests existants.
7. Vérifier le MP4 obtenu avec FFprobe et FFmpeg sur le Mac mini.

### 16.3 Conditions de validation

La compatibilité ne sera considérée comme démontrée que si :

- les deux pistes audio et vidéo sont correctement identifiées ;
- les échantillons sont extraits sans erreur d'offset ;
- les durées et les horodatages sont cohérents ;
- la synchronisation audio/vidéo est préservée ;
- le fichier reconstruit est reconnu et intégralement décodable.

### 16.4 Limites et autorisations

- Aucun nouvel appel réseau Wyze sans autorisation explicite.
- Aucun nouvel appel à l'endpoint Kinesis Replay sans autorisation explicite.
- Aucun téléchargement de clip sans confirmation explicite au moment du téléchargement.
- Aucun déploiement ni modification de production sur SERVOR.
- Aucun changement du moteur MP4 avant identification d'un besoin technique démontré et validation d'un test reproductible.

La reprise de la phase 6 interviendra après cette étude d'intégration, si elle reste nécessaire.

---

## 17. État général du projet


| Élément | État |
|---|---|
| Authentification Wyze | Validée lors des essais précédents ; jeton d'accès expiré le 24 novembre ; aucun renouvellement autorisé à ce stade |
| Identification de la caméra pilote | Validée |
| Récupération des événements | Validée |
| Identification des ressources d'événements | Validée ; ressource KVS v3 identifiée pour l'événement cible |
| Récupération de l'ancien Replay v1 | Échec HTTP 500 lors des trois essais |
| Compatibilité de `/app/v4/replay_url` avec GW_BE1 / KVS v3 | Non démontrée |
| Obtention autonome d'une URL de manifeste KVS v3 | Non démontrée ; verrou technique prioritaire |
| Téléchargement d'un clip Wyze | Non réalisé |
| Analyse statique d'Optimyze | Réalisée ; chaîne de lecture DASH détaillée |
| Récupération des ressources DASH sans navigateur | Non démontrée |
| Moteur MP4 indépendant, phases 1 à 5 | 25 tests réussis ; intégration DASH à étudier |
| Compatibilité avec les fragments DASH de SERVOR | À vérifier |
| Compatibilité avec des fragments Wyze réels | Non démontrée |
| Intégration à SERVOR | Non réalisée |
| Adaptation sécurisée de wyze-node sur Mac mini | Prototype adapté ; contrôles statiques réussis |
| TokenStore — tests unitaires | 8 tests réussis ; limites de sécurité restantes |
| Intégration fonctionnelle Wyze / TokenStore | À tester avec jetons fictifs |

**Conclusion :** le travail d'analyse et le moteur MP4 indépendant ont progressé, mais la récupération effective et la reconstruction d'une vidéo Wyze restent les objectifs techniques à démontrer. Le projet demeure en phase expérimentale et aucune modification de production n'a été effectuée.

## 18. Adaptation sécurisée de wyze-node — laboratoire Mac mini — 23 novembre 2026

### 18.1 Objectif

Étudier la réutilisation de la bibliothèque communautaire `wyze-node` version 2.12.2 pour les futurs traitements Wyze, en remplaçant son stockage local des jetons par un mécanisme indépendant, explicitement injecté et conçu pour protéger les secrets.

La bibliothèque originale utilise `node-localstorage` et initialise automatiquement un répertoire relatif `./scratch`. Ce comportement n'est pas adapté à un service autonome sécurisé.

Le travail est réalisé exclusivement dans un laboratoire sur le Mac mini. Il ne constitue ni une intégration à SERVOR ni une autorisation de connexion supplémentaire à Wyze.

### 18.2 Environnement et séparation des sources

Machine de développement : Mac mini.

Répertoire de travail courant :

`~/dev/mp4-engine-lab/servor-dash-lab`

Environnement :
- Node.js 24.22.3.
- npm 11.19.1.
- Bibliothèque étudiée : `wyze-node` 2.12.2.
- Module CommonJS (`module.exports = Wyze`).

Organisation du laboratoire :

```text
wyze-token-store-lab/
├── token-store.js
├── test-token-store.js
├── wyze-node-source/
│   ├── package.json
│   └── src/
└── wyze-node-adapted/
    ├── package.json
    └── src/
```

Règle impérative :
- `wyze-node-source` conserve les sources originales extraites.
- `wyze-node-adapted` est la seule copie modifiée.
- `token-store.js` est le prototype indépendant de stockage.
- Ne jamais modifier la source originale pour réaliser les adaptations.

Le dossier `wyze-token-store-lab` a été créé avec des permissions privées `700`.

### 18.3 Sauvegarde des éléments de l'audit sur SERVOR

Une archive de travail a été créée dans le dossier partagé Synology `Wyze-Archive`.

Chemin sur SERVOR :

`/volume1/Wyze-Archive/Audit-Wyze-2026-11-22-23`

Les éléments non secrets de l'audit temporaire ont été copiés depuis :

`/tmp/wyze-audit.hiRZRx`

La sauvegarde comprend notamment :
- les scripts de diagnostic ;
- le laboratoire MP4 ;
- les sources `wyze-node` ;
- les fichiers d'analyse statique Optimyze ;
- les archives de sources.

Les secrets ont été volontairement exclus.

Vérification effectuée par comparaison récursive entre le dossier temporaire et la sauvegarde : seule la présence du dossier `secrets` dans la source temporaire explique la différence.

Taille constatée de la sauvegarde : environ 8,6 Mo.

Archive de la bibliothèque `wyze-node` 2.12.2 :

`wyze-node-2.12.2-source.tar.gz`

SHA-256 :

`78a5db3057653a7fbd76a0c2e414f1cb4631868f400c31153e953e9d9c4ed4dd`

Cette sauvegarde est une copie documentaire de laboratoire. Elle ne constitue pas une installation ou un déploiement de la bibliothèque sur SERVOR.

### 18.4 Analyse du stockage original de wyze-node

La bibliothèque originale utilise :

```js
const LocalStorage = require('node-localstorage').LocalStorage
const localStorage = new LocalStorage('./scratch')
```

Le chemin `./scratch` est relatif au répertoire courant du processus Node.js.

Les méthodes concernées dans `src/index.js` sont :

- `getTokens()` : lit `access_token` et `refresh_token` séparément ;
- `setTokens()` : écrit les deux jetons séparément ;
- `login()` : obtient les jetons et les stocke ;
- `getRefreshToken()` : renouvelle les jetons et les stocke.

La bibliothèque relit également les jetons avant plusieurs opérations API.

L'analyse a identifié 19 appels à `getTokens()` dans le fichier `src/index.js`.

La bibliothèque ne doit donc pas être reprise telle quelle pour un futur service autonome.

### 18.5 Prototype indépendant TokenStore

Un prototype a été créé dans :

`wyze-token-store-lab/token-store.js`

Principes déjà implémentés :
- stockage conjoint des deux jetons dans un fichier JSON ;
- répertoire privé ;
- ouverture du fichier avec `O_NOFOLLOW` ;
- vérification que le fichier lu est régulier ;
- validation de la structure JSON ;
- écriture dans un fichier temporaire exclusif ;
- permissions restrictives ;
- synchronisation du fichier avant remplacement ;
- remplacement atomique du fichier de jetons ;
- verrou d'écriture exclusif ;
- vérification de l'identité du verrou lors de sa libération.

Le fichier contient les champs suivants :

- `version` ;
- `accessToken` ;
- `refreshToken` ;
- `updatedAt`.

Lorsque le fichier n'existe pas, `read()` retourne `null`.

Les erreurs autres que `ENOENT` sont propagées.

Tests déjà exécutés avec `node --test` :

- 8 tests réussis ;
- 0 échec.

Les tests couvrent notamment :
- stockage et relecture des deux jetons ;
- permissions privées ;
- rejet des jetons invalides ;
- écritures concurrentes dans le processus de test ;
- refus de remplacer un fichier existant par un lien symbolique ;
- blocage prudent en présence d'un verrou abandonné ;
- conservation des données valides malgré un fichier temporaire orphelin ;
- rejet d'un JSON invalide.

Limites importantes :
- la concurrence entre plusieurs processus n'a pas encore été démontrée ;
- la lecture ne vérifie pas encore explicitement les permissions du fichier existant ;
- la robustesse complète du verrou et de sa libération doit encore être examinée ;
- ce prototype n'est pas un stockage de production validé.

### 18.6 Adaptation de wyze-node dans la copie de travail

Une copie de travail a été créée :

`wyze-token-store-lab/wyze-node-adapted`

Les modifications effectuées concernent exclusivement :

`wyze-token-store-lab/wyze-node-adapted/src/index.js`

Le constructeur exige désormais un objet `options.tokenStore` fournissant deux méthodes :

```js
read()
write(accessToken, refreshToken)
```

Le stockage est injecté explicitement dans chaque instance de `Wyze`.

La méthode `getTokens()` utilise désormais :

```js
const tokens = await this.tokenStore.read()
```

Si le stockage retourne `null`, les deux propriétés en mémoire sont initialisées à des chaînes vides.

Si le stockage retourne des jetons, les deux propriétés sont renseignées depuis le même objet.

La méthode `setTokens()` utilise désormais :

```js
await this.tokenStore.write(accessToken, refreshToken)
```

Les propriétés de l'instance ne sont mises à jour qu'après confirmation de l'écriture.

Les deux appels à `setTokens()` dans `login()` et `getRefreshToken()` ont également été modifiés pour attendre leur exécution avec `await`.

L'interface publique de la bibliothèque est conservée :

```js
module.exports = Wyze
```

### 18.7 Contrôles déjà effectués sur l'adaptation

Contrôle syntaxique :

```bash
node --check wyze-token-store-lab/wyze-node-adapted/src/index.js
```

Résultat : aucune erreur de syntaxe.

Contrôle des appels :

```bash
grep -nE 'getTokens\(' wyze-token-store-lab/wyze-node-adapted/src/index.js
```

Résultat :
- 19 appels à `getTokens()` ;
- les 19 appels utilisent `await`.

Contrôle de l'ancien stockage :

```bash
grep -RInE 'node-localstorage|LocalStorage|localStorage' \
  wyze-token-store-lab/wyze-node-adapted \
  --exclude-dir=node_modules
```

Résultat :

La seule occurrence restante est la déclaration de dépendance dans :

`wyze-token-store-lab/wyze-node-adapted/package.json`

La dépendance `node-localstorage` n'a donc pas encore été retirée de `package.json`, mais aucun usage correspondant ne subsiste dans le code de la copie adaptée.

Le diff avec la source originale confirme que les changements sont limités :
- suppression de l'initialisation de `node-localstorage` ;
- injection obligatoire de `tokenStore` ;
- lecture et écriture asynchrones ;
- attente des deux opérations d'écriture.

### 18.8 État exact au point de reprise

**Réalisé :**
- sauvegarde des sources originales ;
- création de la copie adaptée ;
- prototype TokenStore ;
- 8 tests du prototype réussis ;
- adaptation de `src/index.js` ;
- contrôle syntaxique réussi ;
- vérification des 19 appels asynchrones ;
- vérification de l'absence d'utilisation de l'ancien stockage dans le code adapté.

**Non réalisé :**
- suppression de `node-localstorage` dans `package.json` ;
- installation ou résolution des dépendances dans la copie adaptée ;
- test d'intégration entre `Wyze` et `TokenStore` ;
- tests de concurrence entre processus ;
- validation complète des permissions et du verrou ;
- test de connexion Wyze avec cette adaptation ;
- déploiement sur SERVOR.

Aucun appel réseau Wyze n'a été effectué pendant cette adaptation.

Aucun jeton réel ne doit être utilisé pour les tests locaux à venir : employer exclusivement des jetons fictifs.

### 18.9 Prochaines étapes

Ordre de travail recommandé :

1. Retirer `node-localstorage` de `package.json` dans la seule copie adaptée, après vérification des usages.
2. Vérifier le JSON de `package.json` et l'absence de toute référence résiduelle.
3. Améliorer les contrôles de sécurité du prototype TokenStore, notamment les permissions du fichier existant.
4. Examiner et tester le verrou avec plusieurs processus Node.js.
5. Écrire des tests d'intégration locaux avec un faux `tokenStore` et des jetons fictifs.
6. Vérifier que le constructeur refuse l'absence de stockage.
7. Vérifier qu'une erreur d'écriture empêche la mise à jour des jetons en mémoire.
8. Vérifier que la lecture et l'écriture des deux jetons restent cohérentes.
9. Réexaminer les chemins de connexion et de renouvellement sans exécuter de requête réseau.
10. Produire un bilan de sécurité avant toute décision d'utilisation sur SERVOR.

### 18.10 Règles à respecter pour la reprise

- Travailler exclusivement sur le Mac mini pour cette phase.
- Ne pas modifier `wyze-node-source`.
- Ne pas modifier les sources du moteur MP4 indépendant.
- Ne pas installer de dépendance sans nécessité démontrée.
- Ne pas effectuer de nouvel appel réseau Wyze sans autorisation explicite.
- Ne pas renouveler les jetons réels sans autorisation explicite.
- Ne pas afficher ni publier les secrets.
- Ne pas utiliser les jetons réels dans les tests.
- Ne pas installer de conteneur ni modifier la production SERVOR.
- Ne pas considérer le prototype TokenStore comme validé pour la production.

**Conclusion :** l'adaptation de `wyze-node` à un stockage injecté est commencée et passe les contrôles statiques. Le remplacement du stockage historique est effectué dans la copie de travail, mais la validation fonctionnelle et la validation de sécurité restent à réaliser. La bibliothèque adaptée demeure un prototype de laboratoire, sans connexion Wyze ni déploiement sur SERVOR.



---

## 19. Point de situation — événement GW_BE1 et verrou de récupération vidéo — 25 novembre 2026

### 19.1 Événement réel identifié

L'analyse locale de la réponse `get_event_list` a permis d'identifier précisément l'événement utilisé comme cible de référence pour la suite des essais.

Fichier de capture :

`/tmp/wyze-audit.hiRZRx/captures/event-list-20261123T150802690Z.json`

Caméra :

- Nom fonctionnel : Sonnette Grille.
- Modèle : `GW_BE1`.

Événement cible :

- `event_ts` : `1795421717004` millisecondes Unix.
- Date UTC : `2026-11-23T08:15:17.004Z`.
- `event_params.beginTime` : `1795421717004`.
- `event_params.endTime` : `1795421737004`.
- Durée calculée : 20 secondes.

**Attention :** `event_ts`, `beginTime` et `endTime` sont des timestamps Unix numériques exprimés en millisecondes. Ils ne sont pas des chaînes de date ISO 8601.

### 19.2 Ressources associées à l'événement

Le champ `event_resources` contient deux ressources distinctes :

| Type de ressource | Version | `required` | `status` |
|---|---:|---:|---|
| `s3` | 0 | `true` | 2 |
| `kvs` | 3 | `true` | `null` |

Autres observations :

- file_params est un objet vide dans la ressource S3 v0 et dans l'entrée correspondante de file_list. Ce champ est absent de l'objet KVS v3.
- Une ressource KVS version 3 est donc explicitement associée à l'événement.
- Un examen complémentaire de la ressource KVS a indiqué `is_playable: true`.
- La ressource KVS v3 ne doit pas être assimilée à l'ancienne ressource Replay v1 ni à une ressource KVS version 0.

La présence de la ressource KVS v3 constitue un élément important : l'événement possède bien une ressource vidéo KVS déclarée par l'API d'événements.

Elle ne fournit toutefois pas, à elle seule, une URL DASH directement exploitable ni les modèles de fragments nécessaires à la récupération.

Aucune interprétation supplémentaire de `status: null` ne doit être faite sans documentation du protocole.


#### 19.2.1 Comparaison de quatre événements de la capture

Une inspection complémentaire de la capture locale a porté sur les quatre événements présents dans `data.event_list`.

Les quatre événements présentent exactement la même structure :

| Champ | Ressource S3 v0 | Ressource KVS v3 |
|---|---|---|
| `required` | `true` | `true` |
| `resource_type` | `s3` | `kvs` |
| `resource_version` | `0` | `3` |
| `file_id` | Présent | Absent |
| `url` | Présent | Absent |
| `file_params` | Objet vide | Absent |
| `status` | `2` | Absent |
| `is_playable` | Absent | `true` |
| `begin_time` / `end_time` | Absents | Présents |

Le champ `file_list` contient également un élément associé à la ressource S3, avec notamment `file_id` et `url`. Les valeurs de ces champs ne sont pas reproduites dans la documentation.

Les quatre événements ont tous `ScanFrameNumber = 0`.

Les durées observées pour les ressources KVS v3 sont respectivement de 20, 15, 15 et 12 secondes.

**Interprétation :**

- Les métadonnées S3 et KVS correspondent à deux ressources distinctes.
- Le `file_id` et l'URL présents dans la ressource S3 ne doivent pas être attribués à la ressource KVS v3.
- La ressource KVS v3 expose une fenêtre temporelle et un indicateur `is_playable`, mais aucun identifiant de fichier ni URL de lecture directe dans la réponse examinée.
- `ScanFrameNumber = 0` est observé, mais son rôle dans la récupération vidéo n'est pas établi.

Cette comparaison confirme que le profil observé sur l'événement cible n'est pas un cas isolé dans cette capture.

Elle ne démontre pas que la ressource S3 contient le clip vidéo complet, ni qu'elle permet de récupérer la vidéo KVS.


### 19.3 Distinction entre les API étudiées

Les analyses précédentes ont identifié plusieurs services et routes qui ne doivent pas être confondus :

1. **API principale Wyze** — `https://api.wyzecam.com`  
   L'authentification et la récupération de la liste des événements ont fonctionné lors des essais précédents.

2. **Ancien service Replay v1** — `https://beta-ams-api.wyzecam.com`  
   Les trois tentatives précédentes ont renvoyé HTTP 500. Aucune nouvelle tentative n'est autorisée sans accord explicite.

3. **Service KVS** — `https://kvs-service.wyzecam.com`  
   La route `/app/v4/replay_url` a été identifiée dans des sources communautaires, notamment `dishcam`. Son utilisation observée dans ces sources concerne une ressource KVS avec `resource_version: 0` et un autre modèle de caméra.

La capture de la Sonnette Grille indique une ressource KVS version 3.

Il n'est donc pas démontré que la route `/app/v4/replay_url`, avec les paramètres observés dans `dishcam`, soit compatible avec la GW_BE1 et sa ressource KVS v3.

La présence de la route dans un projet communautaire ne constitue pas une preuve de compatibilité avec notre événement.


#### 19.3.1 Contrat de l'ancien Replay v1 dans wyze-node 2.12.2

L'analyse de `src/index.js` de `wyze-node` 2.12.2 (commit `d556f1b`) a permis d'identifier le fonctionnement exact de `getEventVideoURL(options)`.

La méthode effectue un POST vers :

`https://beta-ams-api.wyzecam.com/api/v1/kinesis/replay_url/get`

Les données construites comprennent :

- `device_mac` ;
- `begin_time` ;
- `end_time` ;
- `expires` (valeur par défaut : 4000) ;
- `max_manifest_fragment` (valeur par défaut : 1000) ;
- `device_model` ;
- `sc` et `sv`, propres à cette API Replay v1.

Le corps commun construit par `getRequestBodyData()` ajoute notamment :

- `access_token` ;
- `phone_id` ;
- `app_ver` ;
- `sc` et `sv` ;
- `ts`.

Les paramètres spécifiques fournis à la méthode remplacent les valeurs générales correspondantes.

**Comportement important :** si la réponse est reconnue comme une erreur de jeton, `getEventVideoURL()` appelle automatiquement `getRefreshToken()` puis relance la méthode. L'utilisation de cette méthode avec une session réelle peut donc déclencher un renouvellement de jeton.

Cette route ne transmet pas les champs `resource_type`, `resource_version` ou `event_id`. Elle ne sélectionne donc pas explicitement la ressource KVS v3 identifiée dans notre capture.

Les trois essais antérieurs de Replay v1 ont renvoyé HTTP 500.

**Décision :**

- ne pas réessayer cette route sans autorisation explicite ;
- ne pas exécuter `getEventVideoURL()` avec les jetons réels ;
- ne pas assimiler ce mécanisme Replay v1 à la récupération KVS v3.

Cette analyse décrit le contrat du code communautaire étudié. Elle ne constitue pas une documentation officielle du protocole Wyze.

#### Précisions sur l'implémentation de `getEventVideoURL()` dans `wyze-node` 2.12.2

L'inspection de `src/index.js`, au commit `d556f1b141af527d79c2916eba199e6209c52cf2`, confirme les détails suivants :

- La fonction `getEventVideoURL(options)` effectue un `POST` vers `https://beta-ams-api.wyzecam.com/api/v1/kinesis/replay_url/get`.
- Le corps contient notamment `device_mac`, `device_model`, `begin_time`, `end_time`, `expires` (4000 par défaut) et `max_manifest_fragment` (1000).
- La construction du corps reprend le mécanisme commun `getRequestBodyData()`, puis remplace les champs `sc` et `sv` par les valeurs propres à Replay v1.
- Le jeton d'accès est transmis dans le corps de la requête, et non dans un en-tête `Authorization` dans cette implémentation.
- En cas de réponse reconnue comme une erreur de jeton, la bibliothèque renouvelle le jeton puis recommence l'appel.
- La fonction renvoie directement `result.data`. Elle ne vérifie pas que cette réponse contient un manifeste DASH, ne télécharge aucun fragment vidéo et ne construit aucun fichier MP4.

**Portée de cette observation :** cette implémentation documente une voie Replay v1 distincte des appels Replay v4 décrits dans `dishcam` et par Casey Ellis. Elle ne fournit donc pas le schéma de requête nécessaire pour appeler le Replay v4 de GW_BE1, et ne démontre pas la compatibilité de Replay v1 avec les ressources KVS v3 observées dans notre capture.

Source : [`noelportugal/wyze-node/src/index.js`, commit `d556f1b`](https://github.com/noelportugal/wyze-node/blob/d556f1b141af527d79c2916eba199e6209c52cf2).

#### 19.3.2 Pistes communautaires récentes sur `/app/v4/replay_url`

Deux implémentations communautaires apportent des informations complémentaires, mais ne permettent pas encore d'établir un contrat unique pour cette route.

**Source 1 — `eliwjones/dishcam`**

Au commit `75b41d5f3df285024da5be775442799beb43db0a`, le fichier `util/wyze.py` implémente :

- GET vers `https://kvs-service.wyzecam.com/app/v4/replay_url` ;
- paramètres `device_id`, `product_model`, `start_time`, `end_time` ;
- `resource_type: kvs` ;
- `resource_version: 0` ;
- `is_live: false` ;
- jeton transmis dans l'en-tête `Authorization`.

Le projet utilise une caméra `WYZE_CAKP2JFUS`, et non la GW_BE1. Sa fonction retourne simplement le champ `data` de la réponse JSON, sans vérifier formellement son type ni son contenu.

Cette implémentation ne démontre donc ni la compatibilité avec la GW_BE1, ni la signification de `resource_version: 0` face à la ressource KVS version 3 observée dans notre capture.

Source :
https://github.com/eliwjones/dishcam/blob/75b41d5f3df285024da5be775442799beb43db0a/util/wyze.py

**Source 2 — compte rendu de Casey Ellis, 3 mai 2026**

L'article « Continued Monitoring of the Situation » décrit une chaîne de récupération de clips Wyze utilisant :

- POST vers `/app/v4/device/get-event-list` pour rechercher les événements ;
- POST vers `/app/v4/replay_url` pour obtenir un manifeste DASH signé ;
- utilisation immédiate de FFmpeg pour assembler les segments avant expiration des jetons de session AWS Kinesis Video Streams.

L'auteur indique que ces jetons de session expirent après environ 5 à 15 minutes et que Cam Plus est nécessaire dans son environnement.

Il précise que les routes ont été identifiées par observation des échanges réseau de Wyze Web View et qu'elles ne sont pas documentées officiellement.

L'article ne fournit toutefois ni le corps exact de la requête `replay_url`, ni son schéma de réponse, ni le modèle précis de caméra utilisé pour cette démonstration.

Source :
https://cje.io/2026/05/04/continued-monitoring-of-the-situation/

**Source 3 — `mrlt8/docker-wyze-bridge`**

Le fichier `app/wyzecam/api.py` documente une autre API v4, utilisée pour les opérations sur les appareils :

- hôte `app-core.cloud.wyze.com` ;
- POST vers `/app/v4/device/get_event_list` ;
- corps JSON trié ;
- signature transmise dans les en-têtes.

Cette API de liste des événements ne doit pas être confondue avec le service KVS et sa route `/app/v4/replay_url`. Son mécanisme de signature ne peut pas être transposé à cette dernière sans preuve.

Source :
https://github.com/mrlt8/docker-wyze-bridge/blob/main/app/wyzecam/api.py

**Comparaison et limites**

Les sources présentent plusieurs divergences :

- GET dans `dishcam`, POST dans le compte rendu de Casey Ellis ;
- `resource_version: 0` dans `dishcam`, alors que notre événement déclare une ressource KVS version 3 ;
- authentification par en-tête `Authorization` dans `dishcam`, alors que d'autres API v4 Wyze utilisent des requêtes signées ;
- chemins de liste d'événements différents selon les implémentations.

Ces différences ne démontrent pas nécessairement une incompatibilité : elles peuvent correspondre à des variantes de service ou de version. Elles interdisent cependant de considérer l'une de ces implémentations comme un contrat universel.

**Conclusion provisoire :**

La récupération d'un manifeste DASH par `/app/v4/replay_url` est rapportée comme fonctionnelle dans au moins un environnement communautaire.

La compatibilité avec la GW_BE1, la ressource KVS version 3 de notre événement et les paramètres exacts nécessaires restent à établir.

Aucun nouvel appel réseau Wyze n'a été effectué dans le cadre de cette analyse documentaire.

#### 19.3.2.1 — Analyse détaillée de `dishcam` : portée réelle de Replay v4

L'examen du code source et de l'historique du dépôt `eliwjones/dishcam` permet de préciser ce que cette implémentation démontre réellement.

**Appel Replay v4**

Dans `util/wyze.py`, la fonction `dash_mpd()` construit une requête :

- méthode : `GET` ;
- endpoint : `https://kvs-service.wyzecam.com/app/v4/replay_url` ;
- en-tête : `Authorization` contenant directement le jeton d'accès ;
- paramètres : `device_id`, `product_model`, `start_time`, `end_time`, `resource_type=kvs`, `resource_version=0` et `is_live=false`.

La fonction décode la réponse JSON et retourne directement `resp_json["data"]`. Elle ne vérifie pas le type ni la structure de cette valeur.

Le nom `dash_mpd()` et l'annotation `-> str` ne constituent donc pas une preuve que la réponse contient effectivement un manifeste MPD.

**Authentification et récupération des événements**

Le même fichier utilise :
- `POST /api/user/login` sur `auth-prod.api.wyze.com`, avec les en-têtes `KeyId` et `ApiKey`, pour obtenir les jetons ;
- `POST /app/v2/device/get_event_list` sur `api.wyzecam.com` pour récupérer les événements.

Il s'agit d'un parcours API développeur particulier. Il ne démontre pas que ces mêmes jetons sont acceptés dans tous les contextes Replay KVS.

**Traitement dans le programme principal**

Dans `dishcam.py`, le programme :
- télécharge une image JPG issue de `file_list` pour l'analyse par Gemini ;
- appelle `dash_mpd()` lorsqu'une transition d'événement est détectée ;
- affiche la valeur retournée sous le libellé `MPD` ;
- conserve les horodatages de la transition dans son état local.

Il ne télécharge toutefois pas le manifeste retourné, ne traite pas les segments vidéo et ne reconstitue pas de fichier MP4.

**Évolution historique**

Le commit `615ccf8bc3c8831df046be986f0267b8c772482a`, daté du 13 juin 2025, remplace dans `util/wyze.py` :
- `video_file_ids()` et `save_mp4()` ;
- par `kvs_times()` et `dash_mpd()`.

Le changement introduit donc l'appel Replay v4 et l'extraction des horodatages KVS, mais ne fournit pas une chaîne complète de récupération et de reconstruction vidéo.

Sources :
- [Code `util/wyze.py`, commit 75b41d5](https://github.com/eliwjones/dishcam/blob/75b41d5f3df285024da5be775442799beb43db0a/util/wyze.py)
- [Code `dishcam.py`, commit 75b41d5](https://github.com/eliwjones/dishcam/blob/75b41d5f3df285024da5be775442799beb43db0a/dishcam.py)
- [Diff du commit 615ccf8](https://github.com/eliwjones/dishcam/commit/615ccf8bc3c8831df046be986f0267b8c772482a)

**Conclusion pour notre audit**

`dishcam` confirme l'existence d'un appel public à Replay v4, avec une authentification par jeton et des paramètres KVS. Mais son exemple utilise `resource_version=0`, alors que notre capture GW_BE1 expose une ressource KVS v3.

Il ne démontre ni la compatibilité de Replay v4 avec cette ressource v3, ni le format réel de la réponse, ni la récupération du clip vidéo.

Le point bloquant reste donc inchangé : obtenir une preuve documentaire ou expérimentale du traitement d'une ressource KVS v3 pour la GW_BE1.

#### 19.3.2.2 — Comparaison avec le parcours Replay v4 décrit par Casey Ellis

L'article de Casey Ellis, publié le 3 mai 2026, décrit une seconde implémentation de récupération des clips Wyze, sensiblement différente de celle de `dishcam`.

Source : [Continued Monitoring of the Situation — Casey Ellis, 3 mai 2026](https://cje.io/2026/05/04/continued-monitoring-of-the-situation/).

**Parcours rapporté par l'auteur**

1. Authentification par `POST` vers `auth.wyze.com/oauth/token`, avec adresse e-mail, mot de passe MD5 et code TOTP éventuel lorsque la double authentification est activée.
2. Recherche des événements par `POST /app/v4/device/get-event-list`.
3. Pour chaque événement, appel par `POST /app/v4/replay_url` afin d'obtenir un manifeste DASH signé.
4. Transmission immédiate du manifeste à FFmpeg pour récupérer les segments et assembler un fichier MP4 avant expiration de la session.
5. Copie du fichier obtenu vers le NAS avec `scp`.

L'auteur indique que les sessions AWS Kinesis Video Streams utilisées pour la lecture expirent au bout de 5 à 15 minutes. Il rapporte également que Cam Plus était nécessaire dans son environnement : les comptes gratuits recevaient un tableau vide en réponse à `replay_url`.

Ces indications sont des observations publiées par l'auteur, et non des garanties générales concernant tous les modèles ou comptes Wyze.

**Différences avec `dishcam`**

| Élément | `dishcam` | Casey Ellis |
|---|---|---|
| Authentification | `POST /api/user/login` | `POST /oauth/token` |
| Identifiants | `KeyId`, `ApiKey` et mot de passe | E-mail, mot de passe MD5, TOTP éventuel |
| Recherche d'événements | `POST /app/v2/device/get_event_list` | `POST /app/v4/device/get-event-list` |
| Replay | `GET /app/v4/replay_url` | `POST /app/v4/replay_url` |
| Ressource | `resource_type=kvs`, `resource_version=0` | Paramètres exacts non publiés |
| Résultat décrit | Retour direct de `data` | Manifeste DASH signé |
| Traitement vidéo | Pas de téléchargement du clip dans le code étudié | FFmpeg récupère les segments et produit un MP4 |

**Limites documentaires**

L'article de Casey Ellis ne fournit pas :
- le corps JSON exact de la requête Replay ;
- les en-têtes HTTP complets ;
- l'hôte complet utilisé pour les deux routes v4 ;
- un exemple brut de réponse Replay ;
- le contenu du manifeste DASH ;
- les paramètres exacts transmis à FFmpeg.

Il n'est donc pas possible de déterminer si les deux implémentations utilisent le même backend, si le `POST` est obligatoire ou si le `GET` de `dishcam` correspond à une autre variante du service.

La valeur `resource_version` utilisée par Casey n'est pas indiquée. Sa compatibilité avec la ressource KVS v3 observée sur notre GW_BE1 reste inconnue.

**Conséquence pour notre audit**

La différence `GET` / `POST` sur `/app/v4/replay_url` devient une question technique prioritaire. Il faut également distinguer :
- le jeton d'authentification Wyze utilisé pour demander la lecture ;
- les éventuels jetons de session Kinesis Video Streams utilisés ensuite pour accéder au manifeste et aux segments.

L'article suggère que ces deux niveaux d'accès existent dans le parcours décrit, mais ne fournit pas assez de détails pour en reconstruire les échanges.

**Conclusion :** Casey Ellis rapporte une chaîne complète allant de l'authentification à la production d'un MP4. Contrairement à `dishcam`, son implémentation ne s'arrête pas à la valeur retournée par Replay v4. Toutefois, aucun élément ne démontre encore que cette méthode fonctionne avec notre GW_BE1 et sa ressource KVS v3.

#### 19.3.2.3 — Vérification de l'état actuel et de l'historique de dishcam

Une nouvelle inspection de la branche `main` du dépôt `eliwjones/dishcam` confirme que l'implémentation Replay v4 examinée précédemment est toujours celle utilisée.

Dans `util/wyze.py` :
- `dash_mpd()` construit une requête `GET` vers `https://kvs-service.wyzecam.com/app/v4/replay_url`.
- Les paramètres transmis comprennent `device_id`, `product_model`, `start_time`, `end_time`, `resource_type=kvs`, `resource_version=0` et `is_live=false`.
- Le jeton d'accès est transmis dans l'en-tête `Authorization`.
- La fonction décode la réponse JSON et renvoie directement `resp_json["data"]`.

Dans `dishcam.py`, le résultat est affiché sous l'étiquette `MPD`, puis les horaires de la séquence sont enregistrés dans l'état du programme. Aucun traitement ultérieur du résultat n'est effectué : pas de lecture du manifeste, pas de téléchargement de fragments DASH et pas de reconstruction MP4.

L'historique du fichier `util/wyze.py` montre :
- le 13 juin 2025, commit `615ccf8` : introduction de la fonction `dash_mpd()` et transition vers Replay v4 ;
- le 14 juin 2025, commit `80cf364` : suppression de la dépendance `requests`, sans changement documenté du mécanisme Replay.

**Limite de compatibilité avec notre capture :** la ressource KVS observée pour GW_BE1 est de version 3, tandis que `dishcam` transmet explicitement `resource_version=0`. Aucun résultat de test ni exemple de réponse dans ce dépôt ne démontre que cette requête permet de récupérer une ressource KVS v3.

**Conclusion :** `dishcam` constitue une preuve documentaire de l'utilisation d'une route Replay v4 et de la construction d'une requête KVS, mais pas une preuve de récupération effective d'un clip vidéo. Son paramètre `resource_version=0` ne doit pas être transposé à notre événement GW_BE1 sans preuve de compatibilité.

Sources :
- https://github.com/eliwjones/dishcam/blob/main/util/wyze.py
- https://github.com/eliwjones/dishcam/blob/main/dishcam.py
- https://github.com/eliwjones/dishcam/commit/615ccf8bc3c8831df046be986f0267b8c772482a
- https://github.com/eliwjones/dishcam/commit/80cf364e16c11034476618f7b1ac21ac87ea8ab4

  #### 19.3.2.4 — Architecture KVS documentée par AWS et distinction avec la récupération des événements

Un document d'architecture AWS consacré à Wyze décrit le fonctionnement général de la vidéo événementielle Kinesis Video Streams :

1. La caméra obtient ses certificats KVS auprès du Device Gateway.
2. Elle se connecte à KVS et y envoie son flux.
3. L'application demande à l'App Gateway une URL DASH à partir du jeton utilisateur.
4. L'App Gateway génère l'URL de lecture KVS.
5. L'application télécharge l'audio et la vidéo depuis KVS.

Cette architecture confirme que la génération de l'URL de lecture et le téléchargement du média sont deux opérations distinctes. Elle ne documente cependant ni les routes HTTP v4, ni le format exact des requêtes, ni le paramètre `resource_version`.

Une vérification complémentaire de `mrlt8/docker-wyze-bridge` montre que son mécanisme d'événements v4 utilise `post_device(..., "get_event_list", ..., api_version=4)`. Les événements sont ensuite exploités à partir de `event_list` et de `file_list`, notamment pour récupérer les miniatures et signaler les mouvements.

Cette implémentation ne constitue pas une preuve d'utilisation de `/app/v4/replay_url` : le code examiné ne met pas en œuvre la récupération des clips événementiels par cette route.

**Conséquence pour notre investigation :** il faut conserver trois opérations distinctes :
- récupération de la liste des événements ;
- récupération des miniatures associées ;
- génération de l'URL Replay puis téléchargement des médias KVS.

La réussite de la première ou de la deuxième opération ne démontre pas la faisabilité de la troisième.

**Sources :**
- https://d1.awsstatic.com/whitepapers/lot-smart-home-solution.pdf
- https://github.com/mrlt8/docker-wyze-bridge/blob/main/app/wyzebridge/wyze_api.py
- https://github.com/mrlt8/docker-wyze-bridge/blob/main/app/wyzebridge/wyze_events.py

### 19.4 Ce que l'analyse d'Optimyze permet désormais d'affirmer

L'analyse statique complémentaire de `content.js` (section 4.3.5) a précisé le fonctionnement de l'extension :

- l'URL du manifeste est capturée dans le trafic de lecture ou récupérée depuis `player.currentSrc()` ;
- les URL des fragments média et d'initialisation sont capturées dans les requêtes effectuées par le lecteur ;
- les modèles de fragments sont conservés séparément du résultat du parseur MPD ;
- le manifeste décrit les pistes et les séquences ;
- les URL de fragments sont construites à partir de modèles déjà observés ;
- les téléchargements utilisent le contexte de credentials du navigateur.

**Conséquence :** Optimyze ne démontre pas qu'un identifiant d'événement et un jeton API suffisent à récupérer un clip depuis SERVOR.

Le navigateur apporte des informations de lecture qui ne figurent pas nécessairement dans la réponse `get_event_list`.

Le moteur MP4 validé sur médias synthétiques ne résout pas cette dépendance : il sait traiter des fragments disponibles, mais ne sait pas obtenir les ressources Wyze.

### 19.5 État des jetons et limites des essais

Les jetons obtenus lors de la session d'authentification du 22 novembre sont conservés localement dans le dossier protégé :

`/tmp/wyze-audit.hiRZRx/secrets/session-tokens.json`

Le jeton d'accès utilisé lors de ces essais a expiré le 24 novembre 2026 à 07:22 UTC.

Le fichier de session ne doit jamais être affiché, copié dans le dépôt ou inclus dans une sortie de diagnostic.

**Aucun renouvellement de jeton n'est autorisé à ce stade.**

Aucun nouvel appel réseau Wyze n'a été effectué pendant les analyses statiques du 25 novembre.

Aucun clip réel n'a été téléchargé.

### 19.6 Verrou technique actuel

Le verrou n'est plus l'identification de l'événement ni la compréhension du fonctionnement général d'Optimyze.

Les éléments suivants sont établis :

- l'événement GW_BE1 du 23 novembre est identifié ;
- sa durée est de 20 secondes ;
- une ressource KVS v3 est associée à l'événement ;
- Optimyze sait exploiter un manifeste DASH et des fragments obtenus pendant la lecture Web ;
- les modèles de fragments utilisés par Optimyze sont capturés dans le trafic du lecteur ;
- le moteur MP4 a été validé sur des médias synthétiques.

En revanche, les points suivants restent non démontrés :

- obtenir une URL de manifeste KVS v3 pour cet événement sans lecteur Web ;
- établir les paramètres exacts nécessaires à une éventuelle route autonome ;
- démontrer la compatibilité de `/app/v4/replay_url` avec la GW_BE1 et `resource_version: 3` ;
- obtenir les fragments d'initialisation et média depuis SERVOR ;
- reconstruire un véritable clip Wyze.

**Le verrou prioritaire est donc l'obtention d'une URL de manifeste KVS v3 exploitable pour l'événement réel, sans dépendre du lecteur Wyze Web View.**

Il ne faut pas reprendre les essais périphériques sur le moteur MP4 ou réexaminer une nouvelle fois les fonctions déjà comprises d'Optimyze tant que ce verrou n'a pas avancé.

### 19.7 Point de reprise et règles applicables

La prochaine étape de recherche devra être consacrée exclusivement à la possibilité d'obtenir la ressource de lecture KVS v3 de l'événement cible sans navigateur.

Règles impératives :

- aucune requête réseau Wyze sans autorisation explicite ;
- aucun renouvellement de jeton sans autorisation explicite ;
- aucun nouvel essai sur l'ancien Replay v1 sans autorisation explicite ;
- aucun appel à `auth-check.js` ;
- aucun téléchargement de clip sans confirmation explicite au moment du téléchargement ;
- aucune installation de l'extension Optimyze ;
- aucune modification des caméras ;
- aucune modification de production sur SERVOR.

La récupération d'une URL ou d'une réponse de lecture devra être examinée progressivement, en masquant systématiquement les jetons, URL signées, identifiants et paramètres sensibles.

Avant tout téléchargement effectif, les informations obtenues devront être présentées et une confirmation explicite demandée.

**Conclusion au 25 novembre 2026 :** l'événement réel et sa ressource KVS v3 sont identifiés. Le fonctionnement interne d'Optimyze est désormais suffisamment compris pour écarter l'hypothèse d'un téléchargeur autonome fondé uniquement sur l'identifiant d'événement. La récupération d'un manifeste KVS v3 sans navigateur reste le verrou technique principal. Aucun clip Wyze réel n'a encore été récupéré et aucune modification de production n'a été effectuée.



### 19.8 Clôture de l'étape — inspection de la capture et analyse de Replay v1

L'inspection complémentaire de la capture locale `event-list-20261123T150802690Z.json` est terminée.

La structure racine de la réponse a été identifiée :

- `code`
- `data`
- `msg`
- `traceId`
- `ts`

Les quatre événements présents dans `data.event_list` ont été examinés. Ils présentent tous le même profil de ressources :

- une ressource S3 version 0, avec `required: true`, `type: 1`, `status: 2`, `is_ai: 0`, un `file_id` et une URL ;
- une ressource KVS version 3, avec `required: true`, `is_playable: true`, `begin_time` et `end_time`, sans `file_id`, URL ni `file_params` ;
- `ScanFrameNumber` vaut 0 dans les quatre événements.

Les durées des ressources KVS v3 sont respectivement de 20, 15, 15 et 12 secondes.

Cette comparaison confirme l'homogénéité du profil observé dans les quatre événements. Elle ne démontre pas que la ressource S3 contient le clip vidéo complet ni qu'elle permet de récupérer la ressource KVS.

L'analyse de `getEventVideoURL(options)` dans `wyze-node` 2.12.2 a également permis de préciser le contrat de l'ancien Replay v1 :

- POST vers `/api/v1/kinesis/replay_url/get` sur `beta-ams-api.wyzecam.com` ;
- paramètres de caméra, de plage temporelle et paramètres Replay v1 ;
- ajout des informations de session par `getRequestBodyData()` ;
- renouvellement automatique du jeton et nouvel essai en cas d'erreur de jeton.

Cette méthode ne transmet pas explicitement `resource_type`, `resource_version` ou `event_id`. Elle ne démontre donc pas la récupération de notre ressource KVS v3.

Les trois essais antérieurs de Replay v1 ont renvoyé HTTP 500. Aucune nouvelle tentative n'a été effectuée.

**Bilan de l'étape :**

- structure de la capture et des quatre événements documentée ;
- distinction S3 v0 / KVS v3 confirmée ;
- contrat de l'ancien Replay v1 précisé ;
- aucun nouvel appel réseau Wyze ;
- aucun renouvellement de jeton ;
- aucun téléchargement de clip.

**Étape terminée.**

La prochaine étape sera l'étude documentaire du contrat de `/app/v4/replay_url`, avec pour objectif de déterminer si une récupération autonome de la ressource KVS v3 de la GW_BE1 est techniquement envisageable.

Cette recherche ne commencera qu'à la reprise explicite du travail et restera soumise aux règles d'autorisation de la section 19.7.

**Vérification locale complémentaire — 25 novembre 2026**

Le fichier de capture `event-list-20261123T150802690Z.json` a été retrouvé sur SERVOR, dans le répertoire temporaire `/tmp/wyze-audit.hiRZRx/captures/`, puis relu avec un traitement local en lecture seule.

La relecture confirme :
- les clés racines `code`, `ts`, `msg`, `data` et `traceId` ;
- quatre événements dans `data.event_list` ;
- les quatre événements associés au modèle `GW_BE1` ;
- la présence, pour chacun, de ressources S3 v0 et KVS v3 distinctes ;
- pour l'événement étudié en §19.1, une ressource KVS v3 marquée `is_playable: true`, avec une fenêtre de 20 secondes.

Cette vérification confirme que la capture locale contient bien les éléments décrits dans les sections précédentes. Elle ne démontre pas que la ressource KVS est encore accessible auprès de Wyze, ni que son clip a été récupéré.

**Précaution :** le fichier se trouve dans `/tmp`, qui est un espace temporaire. Il ne doit pas être considéré comme une archive pérenne.

## 19.9 — Synthèse des investigations complémentaires avec Gemini

### 19.9.1 — Portée et niveau de preuve

Trois investigations complémentaires ont été menées avec Gemini afin de confronter les éléments du dépôt `dishcam`, les projets communautaires Wyze et les informations publiées sur la récupération des événements vidéo.

Cette section conserve les pistes et conclusions utiles de ces investigations. Elle ne constitue pas une validation indépendante des dépôts ou des services Wyze : les éléments rapportés par Gemini doivent être distingués des comportements directement vérifiés dans le code ou observés dans les captures locales.

Les éléments concernant `dishcam` et l'endpoint Replay v4 sont déjà détaillés en §19.3.2. Ils ne sont donc pas reproduits ici.

### 19.9.2 — Première investigation : récupération Replay v4 et vidéo DASH

Les éléments examinés conduisent aux conclusions suivantes :

- Le dépôt `eliwjones/dishcam` fournit un exemple d'appel à `/app/v4/replay_url` et de récupération du champ `data` de la réponse.
- L'historique de ce dépôt montre une évolution depuis une méthode GraphQL de récupération de lecture et de sauvegarde MP4 vers l'utilisation de Replay v4. Cette évolution ne démontre pas, à elle seule, que l'endpoint Replay v4 renvoie directement un fichier vidéo complet.
- Un article de Casey Ellis décrit un autre parcours : récupération d'événements, appel Replay, obtention d'un manifeste DASH signé et utilisation de FFmpeg. Les informations rapportées concernent son environnement et ne prouvent pas que le même parcours fonctionne avec la sonnette GW_BE1.
- La durée de validité des URL signées, parfois rapportée comme étant de l'ordre de 5 à 15 minutes, reste une indication issue de cette documentation, et non une mesure effectuée sur notre appareil.
- L'exigence Cam Plus mentionnée dans cet exemple ne doit pas être généralisée à tous les modèles, comptes ou endpoints Wyze.

**Conclusion :** il existe des pistes documentaires crédibles pour un parcours Replay v4/DASH, mais aucune démonstration disponible ne confirme encore la récupération d'un clip de la GW_BE1 avec la ressource KVS v3 observée dans nos événements.

### 19.9.3 — Deuxième investigation : API développeur, renouvellement et modèles

L'examen des projets communautaires a fait ressortir plusieurs éléments distincts :

- `docker-wyze-bridge` documente des mécanismes liés à l'API Wyze, notamment l'utilisation d'une API Key

## 20. Audit indépendant du moteur MP4 — Phase 5 — 25 novembre 2026

### 20.1 Objet et périmètre

Un audit indépendant a été réalisé sur le candidat du moteur MP4, avec pour objectif d'examiner les corrections A4, A5, A9 et A10, puis de rechercher d'éventuelles régressions ou anomalies supplémentaires.

L'audit porte exclusivement sur le code du moteur et sur des données synthétiques :
- fixture fournie avec le candidat ;
- fragments générés avec FFmpeg ;
- mutations binaires déterministes et aléatoires ;
- comparaisons différentielles entre le candidat et la version originale.

**Aucun fragment Wyze/KVS réel n'a été utilisé.** La compatibilité du moteur avec les fragments de la Sonnette Grille GW_BE1 n'est donc toujours pas démontrée.

L'audit n'a entraîné :
- aucune modification des fichiers fournis ;
- aucune suppression de test ;
- aucune modification de l'environnement de production ;
- aucune recommandation de déploiement.

### 20.2 Environnement et intégrité des livrables

Environnement utilisé pour l'audit indépendant :
- Node.js : 22.23.5 ;
- FFmpeg / FFprobe : 6.1.1.

Versions annoncées pour le candidat :
- Node.js : 22.16.0 ;
- FFmpeg : 7.1.5.

Les versions d'environnement ne sont donc pas strictement identiques à celles annoncées pour le candidat. Cette différence doit être conservée comme réserve de reproductibilité.

Le rapport indique que le contrôle d'intégrité des fichiers fournis avec `sha256sum -c SHA256SUMS.txt` n'a relevé aucune ligne en échec.

Livrables de l'audit :
- `RAPPORT-AUDIT-INDEPENDANT.md`
- `mp4-engine-phase5-independent-audit.zip`

SHA-256 de l'archive ZIP reçue :

`8597a4021077008f7a2c2a7a51e2022d40203699c023bdb9236012a644d9f0a0`

Le rapport détaillé et l'archive constituent les pièces justificatives de cette synthèse. Ils doivent être conservés avec les éléments de laboratoire correspondants.

### 20.3 Résultat des quatre corrections examinées

| Correction | Résultat de l'audit indépendant | Réserves |
|---|---|---|
| A4 — Bornes ISO BMFF | Corrigée dans les cas testés | Tailles minimales de certaines boîtes encore trop permissives |
| A5 — Plages d'échantillons | Corrigée avec les options par défaut | Anomalies F1 à F4 |
| A9 — Budget mémoire des `trun` | Correction efficace contre l'amplification mémoire testée | Plafond par défaut de 16 384 échantillons |
| A10 — Débordement de pile du constructeur | Corrigée jusqu'à 2 000 000 d'échantillons dans les essais | Consommation mémoire élevée et oracle de test initial insuffisant |

**A4 — Bornes ISO BMFF**

L'audit différentiel ne relève plus de lecture hors boîte sur les cibles examinées : `mvhd`, `tkhd`, `mdhd`, `hdlr`, `stsd`, entrées d'échantillons et `trex`.

L'original présentait des lectures hors boîte sur `mvhd`, `tkhd` et `mdhd`.

Réserve résiduelle : certaines boîtes sont acceptées avec une longueur minimale inférieure à celle exigée par leur structure complète. Cette permissivité peut conduire à accepter des métadonnées partielles, sans lecture hors boîte.

**A5 — Plages d'échantillons**

Avec les options par défaut, les plages d'échantillons sont contrôlées par rapport aux zones de données `mdat`.

Sur 4 000 mutations de `moof` :
- candidat : aucune plage hors `mdat` acceptée ;
- original : 187 plages hors `mdat` acceptées.

La désactivation de `validateDataRanges` supprime cependant également les contrôles élémentaires de bornes du buffer. Ce comportement est détaillé en F4.

**A9 — Budget mémoire des métadonnées**

Une entrée d'environ 116 octets déclarant 1 000 000 d'échantillons est rejetée rapidement par le candidat avec un tas limité à 48 Mo.

L'original échoue par épuisement mémoire dans le même scénario.

Le plafond par défaut du candidat est de 16 384 échantillons par `moof`. Un fragment de 20 000 échantillons accepté par l'original est donc rejeté par défaut par le candidat.

**A10 — Débordement de pile**

Le candidat a accepté jusqu'à 2 000 000 d'échantillons dans les scénarios testés, avec une consommation mémoire mesurée d'environ 926 Mo RSS.

L'original déborde dès 125 000 échantillons dans le scénario correspondant.

Le contrôle FFprobe a retrouvé le nombre attendu de paquets et les durées attendues dans les cas examinés. Le test de sécurité initial du candidat reste toutefois insuffisant, car il ne vérifie pas directement la cohérence des tables et le nombre de paquets reconstruits.

### 20.4 Anomalies nouvelles relevées

L'audit indépendant a identifié quatre anomalies de gravité moyenne, principalement liées au parseur de fragments.

| Référence | Gravité | Description |
|---|---|---|
| F1 | Moyenne | `parseMoof` réanalyse toutes les boîtes du buffer à chaque appel |
| F2 | Moyenne | La limite `maxBoxes` du scan global peut affecter un appel local à `parseMoof` |
| F3 | Moyenne | Une queue tronquée après un `moof` valide provoque désormais le rejet de l'ensemble |
| F4 | Moyenne, optionnelle | `validateDataRanges:false` désactive aussi les contrôles de bornes du buffer |

**F1 — Coût par appel**

`parseMoof` réanalyse les boîtes top-level du buffer à chaque appel.

Dans le scénario de 5 000 fragments :
- candidat : environ 5,23 secondes ;
- original : environ 0,04 seconde.

Cette différence constitue un risque de performance lorsque le nombre de fragments augmente.

**F2 — Couplage à `maxBoxes`**

Un buffer contenant 60 000 fragments, soit 120 000 boîtes, peut être analysé lors d'un scan global avec une limite relevée, puis être rejeté par un appel à `parseMoof` utilisant la limite par défaut de 100 000.

Un fragment valide peut donc être affecté par le nombre d'autres boîtes présentes dans le buffer.

**F3 — Queue tronquée**

Un `moof` et son `mdat` complets, suivis d'un en-tête de boîte tronqué, sont acceptés par l'original mais rejetés par le candidat.

Le rejet est explicite et ne correspond pas à une corruption silencieuse. Il constitue néanmoins un changement de comportement non annoncé dans le CHANGELOG.

Son impact sur des captures réellement interrompues ou tronquées reste une hypothèse : aucun fragment Wyze n'a été testé.

**F4 — Désactivation des contrôles de plages**

Avec `validateDataRanges:false`, les cas suivants sont acceptés :
- offset situé dans le `moof` ;
- offset au-delà du buffer ;
- offset négatif.

Les données extraites peuvent alors être vides ou tronquées sans erreur.

Ce comportement est associé à une option de désactivation explicite et n'est pas une régression par rapport à l'original. L'audit recommande néanmoins de conserver au minimum les contrôles de bornes du buffer, même lorsque la validation stricte des plages dans `mdat` est désactivée.

### 20.5 Autres observations et réserves

L'audit relève également :

- **F5 — Faible à moyenne :** plafond par défaut de 16 384 échantillons par `moof`, pouvant rejeter certains fragments légitimes plus volumineux.
- **F6 — Faible :** message d'erreur indiquant le budget restant plutôt que la limite totale.
- **F7 — Faible :** absence de budget spécifique pour les très nombreux `traf` et `trun` vides ; aucun risque concret n'a été mesuré.
- **F8 — Faible :** consommation mémoire importante du constructeur, environ 926 Mo RSS à 2 millions d'échantillons.
- **F9 — Faible :** oracle du test de sécurité A10 initial trop faible pour vérifier complètement la reconstruction.
- **R-A4-1 — Faible :** longueurs minimales acceptées trop permissives pour plusieurs boîtes ISO BMFF.
- **R-A4-2 — Faible, préexistant :** acceptation d'une boîte de taille zéro au milieu d'un conteneur, alors que cette forme devrait être réservée à la dernière boîte.

Les corrections A1, A2, A3, A6, A7, A8 et A11 sont restées inchangées dans les comparaisons effectuées. Elles ne doivent pas être considérées comme corrigées par cet audit.

### 20.6 Résultats de non-régression

Selon le rapport d'audit indépendant :

| Contrôle | Résultat |
|---|---:|
| Tests du candidat | 31/31 réussis |
| Tests de l'original | 18/18 réussis |
| Entrées aléatoires du constructeur | 379 sorties identiques sur 400 |
| Rejets du constructeur | 21 avec les mêmes messages |
| Mutations du parseur d'initialisation | 4 000, aucune divergence |
| Fragments synthétiques FFmpeg | 11 cas comparés |
| Reconstruction des fragments FFmpeg | Octet-identique à l'original |
| Comparaison des trames décodées | `framemd5` identiques |

Les cas FFmpeg comprennent notamment des configurations audio/vidéo, B-frames, HEVC, Opus, PCM et HLS fMP4.

Ces résultats sont ceux rapportés par l'audit indépendant. Ils ne constituent pas une reproduction sur des médias Wyze.

### 20.7 Limites et décisions encore en attente

Les essais n'ont pas couvert :
- des fragments KVS réellement fournis par Wyze ;
- la compatibilité avec l'événement GW_BE1 du 23 novembre ;
- les entrées d'échantillons multiples ;
- les fragments non ordonnés ou dupliqués ;
- les cas SDI ;
- les flux chiffrés ou auxiliaires ;
- la synchronisation audio/vidéo sur de longues durées.

Trois décisions de conception issues de l'audit précédent restent également sans réponse :

1. Politique à adopter pour les trous dans les plages de données.
2. Gestion des offsets de piste : prise en charge de `elst` ou normalisation.
3. Politique de prise en charge des entrées d'échantillons multiples.

Ces décisions ne sont pas considérées comme résolues par le présent audit.

### 20.8 Conclusion et statut

**Résultat : audit indépendant Phase 5 terminé sur données synthétiques.**

Les corrections A4, A5, A9 et A10 résistent aux scénarios examinés. Les résultats de non-régression sont favorables dans le périmètre couvert.

Les anomalies F1 à F4 doivent néanmoins rester inscrites au suivi technique du candidat. Les autres réserves F5 à F9 et R-A4-1/R-A4-2 doivent également être conservées.

Cet audit ne démontre pas :
- la compatibilité du moteur avec les fragments KVS v3 de la GW_BE1 ;
- la récupération autonome d'un manifeste DASH Wyze ;
- la reconstruction correcte d'un clip réel de la sonnette ;
- l'aptitude du candidat à être déployé en production.

**Décision :** conserver le candidat et le rapport dans le laboratoire. Ne pas considérer les résultats comme une validation de production et ne procéder à aucun déploiement sur SERVOR sur la seule base de cet audit.

## 21. Analyse statique de Replay v4 — propagation de `resource_version` et contre-analyse indépendante — 26 novembre 2026

### 21.1 Objet et périmètre

Cette étape vise à déterminer si la valeur `resource_version` associée à une ressource KVS v3 de l'événement GW_BE1 du 23 novembre 2026 est propagée par l'APK Wyze jusqu'à la construction de la requête `/app/v4/replay_url`.

L'analyse porte sur les DEX de l'APK Wyze 3.26.0.1046 et sur les extraits statiques constitués localement. Elle a fait l'objet d'une contre-analyse indépendante par Claude.

Aucun appel réseau Wyze n'a été effectué pendant cette étape. Aucun jeton n'a été renouvelé et aucun clip n'a été téléchargé.

### 21.2 Intégrité du dossier transmis à la contre-analyse

Le dossier `evidence-replay-v4` a été archivé et transmis à Claude.

Contrôles effectués avant transmission :
- 8 empreintes SHA-256 de pièces contrôlées : toutes conformes ;
- archive ZIP : 9 fichiers, test d'intégrité `unzip -t` réussi ;
- permissions restrictives sur les fichiers et l'archive.

SHA-256 de l'archive `Wyze-Replay-v4-contre-analyse.zip` :

`0cff634cd63605005b34e9ce85e7b8314cbf32dee5609fae4ab21fba461c3d7d`

Le dossier comprenait notamment les cinq extraits DEX, le JSON d'événement filtré, le README et le prompt de contre-analyse.

### 21.3 Résultats statiques concordants

Les éléments suivants sont corroborés par les extraits examinés et la contre-analyse :

1. Le descripteur `Lepu$a` associe la propriété JSON `resource_version` à l'index de sérialisation 1. Cet index découle de l'ordre d'enregistrement des éléments du descripteur. Le second argument de `Lo3n.l(String,Z)` est un booléen d'optionnalité et non l'index.
2. Le désérialiseur lit un `long` à l'index 1, puis transmet cette valeur au constructeur de `Lepu`.
3. Le constructeur stocke cette valeur dans le champ `Lepu.b:J`.
4. Le getter `Lepu.g()J` renvoie ce champ. Le serializer réencode également ce champ à l'index 1.
5. Dans `EventGroupViewModel$fetchVideoUrl$2`, le getter est appelé, puis la valeur subit une conversion `long-to-int` avant d'être transmise comme dernier argument de `Lkwc.f(...)`.
6. La coroutine `EventGroupRepositoryRemoteImplementation$getKvsReplayUrl$1` stocke un entier dans `$resourceVersion:I`, puis le relit dans `invokeSuspend`.
7. Cette coroutine associe la clé littérale `resource_version` à une valeur entière boxée, puis appelle `Lyvt.d(HttpRequestBuilder, String, Object)` avec cette clé et cette valeur.
8. Le code construit ensuite un `HttpStatement` à partir du builder et du client HTTP.

Pour la valeur observée `3`, la conversion du type `long` vers `int` ne provoque pas de perte numérique.

Ces éléments établissent une chaîne mécanique de propagation de la valeur dans le code étudié, jusqu'à son passage à une méthode auxiliaire appelée lors de la construction du builder HTTP.

### 21.4 Réserves apportées par la contre-analyse

La contre-analyse conclut à une confirmation partielle. Les points suivants ne sont pas encore démontrés :

- **Sélection KVS :** l'extrait fourni ne montre pas la sélection explicite de `resource_type == "kvs"` dans le ViewModel. La transmission d'une valeur de ressource est visible, mais son rattachement à la sélection KVS doit encore être établi.
- **Raccord entre méthodes :** le corps de `Lkwc.f(...)` n'a pas été examiné. La concordance de signature ne suffit pas à démontrer que cette méthode déclenche précisément la coroutine `getKvsReplayUrl`.
- **Sémantique de `Lyvt.d(...)` :** son corps n'est pas fourni. Il n'est donc pas encore possible d'affirmer que cet appel ajoute un paramètre de requête HTTP, même si la clé et la valeur lui sont transmises.
- **Exécution HTTP :** la construction d'un `HttpStatement` ne prouve ni son exécution, ni l'envoi de la requête, ni la réception d'une réponse.
- **Lien avec la capture :** le type `Lepu` est associé à un DTO `VideoSearchRepositoryResponseEventsItemEventResourcesItem`. Le lien complet entre ce DTO, la réponse de l'endpoint d'événements et la capture locale doit encore être établi par l'examen du DTO parent et de la chaîne de désérialisation.
- **Lecture du clip :** aucune preuve ne démontre encore l'extraction d'une URL exploitable depuis la réponse Replay v4, ni sa transmission effective au lecteur vidéo.

Le rôle exact de certaines méthodes obfusquées ne doit pas être déduit de leur seul nom ou de leur signature.

### 21.5 Portée de la preuve concernant l'événement GW_BE1

Le JSON `06-event-GW_BE1-filtered.json` transmis à Claude est une pièce volontairement filtrée. Son contenu permet de vérifier la présence d'une ressource KVS v3, `required: true`, `is_playable: true`, sur une fenêtre de 20 secondes. Il ne permet pas, à lui seul, de conclure à l'absence de `file_id`, d'URL ou de `file_params` dans la capture d'origine.

Cette absence a toutefois été documentée séparément en §19.8 à partir de l'inspection locale de la capture brute : les quatre événements examinés présentaient une ressource KVS v3 sans ces champs, distincte de leur ressource S3 v0.

Il faut conserver cette distinction entre la preuve contenue dans l'archive transmise et les observations consignées antérieurement à partir de la capture brute.

### 21.6 Confidentialité et intégrité

Selon la contre-analyse, les pièces transmises ne contenaient aucun jeton, identifiant sensible ou URL signée. Le timestamp exact de l'événement constitue une information temporelle précise, mais aucun secret d'authentification n'a été relevé.

La contre-analyse n'a entraîné aucun nouvel appel réseau Wyze.

### 21.7 Prochaines vérifications statiques

Les investigations doivent être poursuivies dans l'ordre suivant :

1. Retrouver dans `fetchVideoUrl$2` le parcours de sélection KVS et le relier au passage de `resource_version`.
2. Examiner le corps complet de `Lkwc.f(...)` et identifier la méthode repository effectivement appelée.
3. Examiner la suite de `invokeSuspend` après l'offset `216702`, en vérifiant les limites exactes de la méthode et de l'unité DEX avant toute extraction.
4. Examiner le corps de `Lyvt.d(...)` et les méthodes associées à la construction de la requête (`Lang$a.b()` et `HttpRequestBuilder.m`, sous réserve de confirmation de leurs références exactes).
5. Examiner le DTO parent `VideoSearchRepositoryResponseEventsItem` et la chaîne qui rattache ce modèle à la réponse d'événements.
6. Examiner le DTO de réponse Replay et `fetchVideoUrl$2$url$1` pour déterminer comment une éventuelle URL de lecture est extraite et transmise au lecteur.

Ces recherches restent strictement statiques et locales.

### 21.8 Conclusion et statut au 26 novembre 2026

**Résultat : propagation mécanique de `resource_version` partiellement établie jusqu'à la construction du builder HTTP.**

La valeur observée dans le modèle de ressource est lue, stockée, récupérée par getter, convertie en entier et transmise à la coroutine Replay v4, qui l'associe à la clé `resource_version` avant de construire un `HttpStatement`.

En revanche, la sélection explicite de la ressource KVS, le raccord entre le ViewModel et la coroutine, la sémantique de la méthode auxiliaire d'ajout au builder et l'exécution effective de la requête restent à établir.

Cette analyse ne démontre ni l'acceptation de `resource_version: 3` par le serveur Wyze, ni l'obtention d'une URL de lecture, ni la récupération d'un clip réel.

**Statut :** analyse statique Replay v4 partiellement confirmée par contre-analyse indépendante ; vérifications DEX complémentaires nécessaires ; aucun appel réseau Wyze et aucun téléchargement de clip effectués.

La priorité du projet Wyze reste l'obtention d'une ressource de lecture KVS v3 exploitable pour l'événement réel, sans dépendance au lecteur Web Wyze. Les investigations complémentaires sur le moteur MP4 ne doivent pas détourner le travail de ce verrou technique tant qu'aucun fragment réel n'est disponible.

### 21.9 — Confirmation de l’ajout de `resource_version` au constructeur de paramètres URL

**Date : 27 novembre 2026**

Une analyse complémentaire de `base/classes29.dex` a permis de résoudre une réserve de la contre-analyse indépendante concernant la méthode `Lyvt.d(HttpRequestBuilder, String, Object)`.

#### 1. Identification des interfaces et de l’implémentation

- `Lmbr` est une interface publique abstraite qui déclare notamment `e(String, String)`.
- `Lcsm` est une interface qui étend `Lmbr` et expose `build(): io.ktor.http.f`.
- `Ldsm` est une classe publique finale qui implémente `Lcsm`.
- `Ldsm` hérite de `io.ktor.util.StringValuesBuilderImpl`.

#### 2. Vérification de la construction

La méthode `Lyvt.d` récupère l’objet `Lcsm` depuis le constructeur d’URL, convertit la valeur en chaîne, puis appelle `Lmbr.e(String, String)` avec la clé et la valeur.

Le corps de `StringValuesBuilderImpl.e(String, String)` a été retrouvé à l’offset DEX `28e094` dans `base/classes29.dex`.

Il effectue les opérations suivantes :

- vérification des deux arguments ;
- normalisation de la valeur par appel à `StringValuesBuilderImpl.n(String)` ;
- récupération de la liste associée à la clé par `StringValuesBuilderImpl.h(String)` ;
- ajout de la valeur à cette liste par `List.add()`.

La méthode `Ldsm.build()` récupère ensuite la map interne par `StringValuesBuilderImpl.j()` et construit l’objet `Lgsm`, de type `io.ktor.http.f`.

#### 3. Conclusion

La chaîne statique est désormais établie jusqu'à l'ajout effectif de `resource_version` dans la structure de paramètres URL de Ktor :

`EventGroupViewModel` → `Lkwc.f` → `Liwc.f` → `EventGroupRepositoryRemoteImplementation.f` → coroutine `getKvsReplayUrl` → `Lyvt.d` → `Lcsm.e` → `StringValuesBuilderImpl.e` → ajout dans la liste associée à la clé.

Cette analyse confirme que `resource_version` est bien ajouté comme paire clé/valeur au constructeur de paramètres URL. Elle lève la réserve concernant le rôle de `Lyvt.d` et l'absence d'identification de l'implémentation de `Lmbr.e`.

#### 4. Limites restantes

Cette preuve statique ne démontre pas encore :

- le détail de la normalisation effectuée par `n()` ;
- la sérialisation finale des paramètres dans l'URL ;
- l'exécution effective du `HttpStatement` ;
- l'envoi de la requête et la réponse du serveur Wyze ;
- l'obtention d'une URL de manifeste ou la récupération du clip.

Aucun appel réseau Wyze, aucun téléchargement de vidéo et aucune modification de production n'ont été effectués pendant cette analyse.

**État :** ajout de `resource_version` à la structure de paramètres URL confirmé par analyse statique. Exécution réseau et récupération vidéo toujours non démontrées.

### §21.10 — Replay v4 : chaîne de construction des paramètres URL (Lyvt.d → io.ktor.http.i) — 27 novembre 2026

#### 1. Objet de l'extraction

Poursuite de l'analyse statique de la chaîne Replay v4 de Wyze, après confirmation de `Lyvt.d()` à partir de sa transcription DEX brute.

Fichier analysé sur le Mac mini :

`dex-work/crossrefs/base-classes29.txt`

La classe `Lio/ktor/http/i;` est localisée à partir de la ligne 1 344 109.

#### 2. Relation entre `Lyvt.d()` et `io.ktor.http.i`

La méthode `Lyvt.d(HttpRequestBuilder, String, Object)` appelle :

- `HttpRequestBuilder.h()` pour obtenir un objet `io.ktor.http.i` ;
- `io.ktor.http.i.k()` pour obtenir un objet `Lcsm` ;
- `Object.toString()` sur la valeur reçue ;
- `Lmbr.e(String, String)` pour ajouter la paire clé/valeur.

L'extrait brut de `Lyvt.d()` a été vérifié : offsets DEX 147550 à 147592, références `method@50c0`, `method@535e`, `method@61f3`, `method@674a` et `field@f138`.

La méthode `i.k()` retourne directement le champ `j`, de type `Lcsm`.

Le constructeur de `io.ktor.http.i` initialise ce champ `j` avec un objet `Ltnt`, construit à partir du `Lcsm` initial. La méthode `i.s(Lcsm)` reproduit cette même logique : affectation du champ `i`, création de `Ltnt`, puis affectation au champ `j`.

Pour `resource_version`, la valeur transmise à `Lyvt.d()` est un `Integer` non nul, issu de `Boxing.e`. La conversion par `Object.toString()` donne donc la chaîne décimale `"3"`.

#### 3. Lien avec la construction de l'objet URL

L'analyse précédente de `io.ktor.http.i.b()` a montré que cette méthode appelle `build()` sur le champ `j` et transmet le résultat au constructeur de `io.ktor.http.Url`.

La méthode `io.ktor.http.i.toString()` appelle quant à elle `io.ktor.http.k.a(i, Appendable)` pour construire sa représentation textuelle.

La dernière extraction de la classe montre également :

- `i.n()` retourne le champ port `c` ;
- `i.o()` retourne le champ schéma `a` ;
- `i.p()` retourne le booléen `d` ;
- `i.q()` encode le champ `e` avec `CodecsKt.i()` ;
- `i.m()` parcourt une liste de chaînes et applique également `CodecsKt.i()` à chaque élément ;
- `i.w(String)` affecte le champ hôte `b` ;
- `i.x(int)` affecte le port `c` ;
- `i.y(io.ktor.http.l)` affecte le schéma `a`.

Ces éléments confirment que `io.ktor.http.i` représente un objet structuré utilisé dans la manipulation et la construction d'une URL.

#### 4. Conclusion probatoire

**Établi :**

La paire `resource_version=3` est ajoutée au `Lcsm` accessible depuis l'objet `io.ktor.http.i`, via `Lyvt.d()`.

Ce même objet `Lcsm`, enveloppé par `Ltnt` dans le champ `j`, est utilisé par `i.b()` lors de la construction d'un objet `Url`.

**Non établi à ce stade :**

La sérialisation finale de ce paramètre dans la chaîne URL, puis sa présence dans la requête HTTP effectivement envoyée.

La méthode `io.ktor.http.k.a()` reste à examiner. Il faut également comprendre la construction produite par `Lcsm.build()`, le rôle de `Ltnt` et la représentation concrète des paramètres dans l'objet `Url`.

Aucun appel réseau Wyze n'a été effectué. Aucune requête Replay v4 n'a été envoyée. Cette analyse repose exclusivement sur le désassemblage statique de l'APK.

#### 5. Prochaine étape

Reprendre par l'analyse de :

1. `io.ktor.http.k.a()` : assemblage textuel de l'URL ;
2. `Ltnt` : comportement du wrapper autour de `Lcsm` ;
3. `Lcsm.build()` et `Lgsm` : construction de la collection de valeurs ;
4. `StringValuesBuilderImpl.j()`, `h()` et `n()` ;
5. les éventuels encodeurs et séparateurs de paramètres de requête.

Ne conclure à la présence de `resource_version=3` dans l'URL finale qu'après vérification de cette chaîne de sérialisation.

## 22. Analyse statique de WpkSignature2Service — construction de la requête Replay v4 et reconstitution de Signature2 — 28 novembre 2026

### 22.1 Objet, périmètre et méthode

Cette étape poursuit l'analyse statique de l'APK Wyze 3.26.0.1046 (versionCode 62746). Elle porte sur le mécanisme `WpkSignature2Service`, la fonction native de génération de `Signature2` et son utilisation par `WyzeEventNet.u()` pour construire une requête vers Replay v4.

Deux chemins présents dans l'APK doivent être distingués :

1. Le chemin repository/coroutine Ktor, précédemment étudié, qui construit une requête vers `https://kvs-service.wyzecam.com/app/v4/replay_url` avec `Authorization`, `device_id`, `product_model`, `start_time`, `end_time`, `is_live` et `resource_version`.
2. Le chemin `WyzeEventNet.u()`, qui utilise `WpkSignature2Service`, `WpkSecurityUtil`, `WpkSecurity` et une fonction native de génération de signature.

L'existence de ces deux chemins ne démontre pas qu'ils sont interchangeables ni que toutes les requêtes Replay v4 empruntent le même mécanisme.

Le présent relevé décrit le second chemin. Il repose sur l'analyse statique des DEX et de `libwyze_olive-lib.so`, ainsi que sur une vérification indépendante hors ligne de certains calculs.

Aucun appel réseau Wyze n'a été effectué pendant cette analyse. Aucune routine native n'a été exécutée. Aucun jeton n'a été renouvelé, aucun clip n'a été téléchargé et aucune caméra ni aucun élément de production n'a été modifié.

Les valeurs secrètes, clés natives, données déchiffrées et matériaux permettant de les reconstituer sont volontairement exclus de ce document public.

### 22.2 Vue d'ensemble de la chaîne étudiée

Le chemin Replay v4 utilisant `WpkSignature2Service` peut être représenté ainsi :

```text
WyzeEventNet.u(...)
    -> WpkSignature2Service.builder(appId)
    -> WpkDomain.kvs_service_wyzecam("/app/v4/replay_url")
    -> GetBuilder
    -> ajout des paramètres de requête
    -> GetBuilder.build()
        -> getSortParams(paramsData)
        -> construction des en-têtes
        -> calcul de requestid
        -> WpkSecurityUtil.getSignature(appId, sortedParams)
            -> WpkSecurity.getSignature(appId, access_token, sortedParams)
                -> getSignatureByString(...)
        -> appendParams(url, paramsData)
    -> GetBuilder.execute()
    -> WyzeEventNet.z(Response)
    -> WyzeEventVideoUrlData
```

Cette chaîne relie l'appelant Replay v4 au mécanisme natif de signature. Elle ne constitue pas une preuve que le serveur accepte la signature ni que la réponse contient une URL vidéo exploitable.

### 22.3 Classe WpkSignature2Service : méthodes et responsabilités

La classe `WpkSignature2Service` expose notamment les éléments suivants :

- `builder(String)` ;
- `appendParams(...)` ;
- `getSortParams(JSONObject)` ;
- `cutStr(...)` ;
- `filterField(...)`.

Les noms de champs retrouvés dans cette famille de classes comprennent notamment `Signature2`, `nonce`, `requestid`, `appid`, `appinfo`, `phoneid`, `access_token`, `Authorization` et `Accept-Language`.

Les offsets DEX relevés dans `base-classes18.txt` sont :

| Élément | Offset DEX |
|---|---:|
| `builder(String)` | `0x28a158` |
| `appendParams(...)` | `0x28a1b4` |
| `cutStr(...)` | `0x28a268` |
| `getSortParams(JSONObject)` | `0x28a2c8` |
| `filterField(...)` | `0x28a3f4` |
| `GetBuilder.build()` | `0x2899f4` |

La méthode `builder(String)` instancie `WpkSignature2Service$Builder`, lui transmet l'identifiant applicatif, puis retourne l'objet Builder.

La préparation effective de la requête et le calcul de la signature sont réalisés dans les classes internes Builder et GetBuilder, et non dans la seule méthode `builder(String)`.

### 22.4 getSortParams(JSONObject) : insertion du nonce et construction du message signé

La méthode `getSortParams(JSONObject)`, située à l'offset DEX `0x28a2c8`, modifie le JSON reçu.

Son comportement observé est le suivant :

1. Appel de `System.currentTimeMillis()`.
2. Conversion de la valeur temporelle en objet `Long`.
3. Insertion ou remplacement de la propriété `nonce` dans le `JSONObject`.
4. Récupération des clés du JSON.
5. Conversion de l'itérable en liste au moyen du helper Kotlin `CollectionsKt___CollectionsKt.e1(Iterable)`.
6. Parcours des clés dans l'ordre obtenu.
7. Construction d'une chaîne sous la forme `clé=valeur&`.
8. Suppression du dernier caractère `&`.

La représentation produite est de la forme :

```text
key1=value1&key2=value2&key3=value3
```

Formellement :

```text
paramsData["nonce"] = currentTimeMillis()

keys = sorted(paramsData.keys())

sortedParams =
    join("&", key + "=" + paramsData[key].toString())
```

Le helper Kotlin utilisé correspond au mécanisme de tri de la collection. L'analyse établit l'utilisation de ce helper pour obtenir la liste ordonnée des clés ; elle ne démontre pas l'existence d'un comparateur personnalisé.

Les valeurs sont converties en chaînes au moment de la concaténation, notamment par le comportement de `StringBuilder.append(Object)`.

**Point essentiel :** `getSortParams()` construit la représentation utilisée comme message du HMAC. Elle ne réalise pas l'encodage des paramètres URL. Il ne faut donc pas confondre `sortedParams` avec la chaîne finale de requête HTTP.

La méthode modifie le `JSONObject` initial. Le nonce ajouté fait donc partie des paramètres parcourus ultérieurement par `appendParams()`.

### 22.5 appendParams(...) : construction de l'URL

La méthode `appendParams(url, json)`, située à l'offset DEX `0x28a1b4`, suit un chemin distinct de `getSortParams()`.

Son fonctionnement observé est le suivant :

1. Analyse de l'URL avec `Uri.parse(url)`.
2. Création d'un constructeur avec `buildUpon()`.
3. Parcours des clés du JSON.
4. Récupération de la valeur associée à chaque clé.
5. Ignorance des valeurs nulles.
6. Conversion des autres valeurs en chaînes avec `toString()`.
7. Ajout de chaque paire avec `Uri.Builder.appendQueryParameter(key, value)`.
8. Construction de l'URL finale avec `build().toString()`.

La méthode ne calcule pas la signature.

Il existe donc deux représentations distinctes des paramètres :

| Représentation | Fonction |
|---|---|
| `sortedParams` | Chaîne brute `clé=valeur&...` utilisée comme message du HMAC |
| URL construite par `appendParams()` | Paramètres ajoutés à l'URL au moyen de `Uri.Builder.appendQueryParameter()` |

`appendQueryParameter()` applique les règles d'encodage des paramètres URL. Il ne faut donc pas supposer que la représentation textuelle finale des paramètres dans l'URL est identique octet pour octet à la chaîne `sortedParams`.

La correspondance exacte entre la canonicalisation utilisée pour signer et celle attendue par le serveur n'a pas été vérifiée par une réponse serveur.

### 22.6 GetBuilder : initialisation, en-têtes et construction de la requête

Le constructeur de GetBuilder initialise notamment :

- l'`appId` transmis par le Builder ;
- un `JSONObject` destiné aux paramètres ;
- un `logTag` de type `WyzeNetwork:` ;
- `isShowLog` à `true` ;
- `hasAccessToken` à `true` par défaut ;
- une collection d'en-têtes ;
- un timeout de 30 000 ms ;
- un `OkHttpClient` ;
- un nonce propre au Builder, initialisé avec `String.valueOf(System.currentTimeMillis())`.

Ce nonce initial est distinct du nonce ajouté ultérieurement au JSON par `getSortParams()`.

La méthode `GetBuilder.build()` effectue les opérations suivantes.

**1. Préparation de la chaîne signée**

Appel de :

```text
sortedParams = getSortParams(paramsData)
```

Cette opération ajoute le nonce temporel au JSON et construit la chaîne ordonnée utilisée comme message du HMAC.

**2. En-têtes hérités**

Les en-têtes fournis par `OkHttpUtils.getHeaderInfo()` sont fusionnés dans la collection d'en-têtes de la requête.

**3. Identifiant applicatif**

Le Builder ajoute `appid`, dont la valeur provient de l'identifiant applicatif conservé par le Builder.

**4. Jeton d'accès**

Lorsque `hasAccessToken` est activé — comportement par défaut — le Builder récupère `Center.access_token` et ajoute l'en-tête `access_token`.

Cet en-tête ne doit pas être confondu avec `Authorization`, ajouté séparément par l'appelant `WyzeEventNet.u()`.

**5. Informations applicatives**

Le champ `appinfo` est construit à partir de :

```text
Center.app_name + "_android_" + ServiceCenter.getAppVersion()
```

**6. Identifiant du téléphone**

Le Builder vérifie la présence de `Center.phone_id`.

Lorsque cette valeur est absente, un UUID est généré et `WpkSPUtil` est utilisé pour lire ou créer la valeur persistante `wpk_phone_id`.

La valeur obtenue est utilisée pour le champ `phoneid`.

**7. requestid**

Le Builder calcule `requestid` au moyen de deux appels MD5 imbriqués appliqués au nonce initial du Builder :

```text
requestid = MD5(MD5(nonce_Builder))
```

Ce calcul est distinct de la génération de `Signature2`.

Le nonce concerné est celui initialisé dans le constructeur de GetBuilder, et non le nonce ajouté ensuite à `paramsData` par `getSortParams()`.

La structure des deux appels MD5 est observée dans le chemin de construction. En revanche, la représentation exacte transmise entre le premier et le second appel — chaîne hexadécimale ou digest binaire — n'est pas suffisamment établie dans les éléments conservés ici. Il ne faut donc pas développer cette formule en affirmant un format intermédiaire qui n'a pas été vérifié.

**8. Signature2**

Le Builder appelle :

```text
WpkSecurityUtil.getSignature(appId, sortedParams)
```

Le wrapper récupère `Center.access_token` et transmet à la couche native l'identifiant applicatif, le jeton d'accès et la chaîne `sortedParams`.

La valeur calculée est ajoutée à la collection d'en-têtes sous le nom `Signature2`.

**9. Langue**

Le champ `Accept-Language` est construit avec :

```text
Locale.getDefault().toLanguageTag()
```

**10. En-tête nonce facultatif**

Lorsque `includeNonceHeader` est activé, un en-tête `nonce` est ajouté.

La valeur est récupérée depuis `paramsData` si le JSON contient la propriété `nonce`. Sinon, le nonce initial du Builder est utilisé.

**11. Construction de l'URL**

Enfin, `appendParams(url, paramsData)` ajoute les paramètres JSON à l'URL et le Builder conserve l'URL construite.

Les en-têtes et les paramètres URL sont deux ensembles distincts. En particulier, les champs ajoutés à la collection d'en-têtes par GetBuilder ne doivent pas être présentés comme des paramètres du JSON `paramsData`.

### 22.7 Fonctions auxiliaires cutStr et filterField

Deux méthodes auxiliaires de la classe ont également été examinées.

**cutStr(...)**

Cette méthode travaille sur une représentation UTF-8.

Son comportement observé est le suivant :

- si la limite est inférieure à 1, elle retourne une chaîne vide ;
- si la limite est supérieure ou égale à la longueur en octets de la chaîne UTF-8, elle retourne la chaîne complète ;
- sinon, elle copie les `n` premiers octets avec `Arrays.copyOf(...)`, reconstruit une chaîne UTF-8, puis retire le dernier caractère.

La troncature est donc basée sur une longueur en octets et non sur le nombre de caractères Unicode. Elle ne garantit pas, dans tous les cas, la conservation correcte des caractères multioctets.

**filterField(...)**

Cette méthode intervient dans le filtrage des champs JSON destinés à la journalisation.

Les champs ciblés sont remplacés, y compris dans le parcours récursif des structures JSON, par la chaîne :

```text
[FILTERED]
```

Cette fonction relève du filtrage des données affichées dans les logs. Elle ne constitue pas une étape du calcul cryptographique de Signature2.

### 22.8 WyzeEventNet.u() : appel réel du service Replay v4

La méthode `WyzeEventNet.u()` a été retrouvée dans `base-classes14.txt`, autour des lignes 489430 à 489515.

Son adresse DEX est située dans la zone `0x1320f4–0x1321c0`.

Sa signature est :

```text
u(String, String, long, long, boolean, int)
    -> WyzeEventVideoUrlData
```

Les arguments correspondent à :

- l'identifiant de l'appareil ;
- le modèle du produit ;
- le début de la fenêtre temporelle ;
- la fin de la fenêtre temporelle ;
- le booléen `isLive` ;
- la version de ressource KVS.

La méthode construit une requête GET vers :

```text
https://kvs-service.wyzecam.com/app/v4/replay_url
```

L'URL est obtenue par :

```text
WpkDomain.Companion.kvs_service_wyzecam("/app/v4/replay_url")
```

Le Builder est instancié avec un identifiant applicatif constant. Sa valeur exacte n'est pas reproduite dans ce document public.

La méthode ajoute séparément l'en-tête `Authorization`, à partir du jeton récupéré par le service d'accès au compte.

Elle ajoute ensuite les paramètres suivants au Builder :

| Paramètre | Type transmis |
|---|---|
| `device_id` | chaîne |
| `product_model` | chaîne |
| `start_time` | long |
| `end_time` | long |
| `is_live` | booléen |
| `resource_version` | entier |

Le Builder est ensuite exécuté au moyen de `GetBuilder.execute()`.

Cette méthode établit le raccord entre le mécanisme `WpkSignature2Service` et l'endpoint Replay v4.

**Distinction des jetons :** l'appelant ajoute un en-tête `Authorization` au moyen du service d'accès. De son côté, `GetBuilder` peut ajouter un en-tête `access_token` à partir de `Center.access_token`, et `WpkSecurityUtil` utilise également cette dernière valeur pour appeler la fonction native. Les éléments étudiés identifient ces deux chemins d'obtention, mais ne suffisent pas à affirmer que les valeurs sont nécessairement identiques dans tous les états d'exécution.

### 22.9 Chaîne Java/Kotlin vers la fonction native

La chaîne d'appel de la signature est :

```text
GetBuilder.build()
    -> WpkSecurityUtil.getSignature(appId, sortedParams)
    -> WpkSecurity.getSignature(appId, access_token, sortedParams)
    -> getSignatureByString(...)
```

`WpkSecurity` charge la bibliothèque native `wyze_olive-lib`.

Les méthodes natives exposées comprennent notamment :

- `getDataByString(String)` ;
- `getOldSignature(String, String)` ;
- `getOldSignature(String, byte[])` ;
- `getSignature(String, String, String)` ;
- `getSignature(String, String, byte[])`.

La fonction étudiée est `getSignatureByString`, située dans `libwyze_olive-lib.so` à l'offset `0x16104`.

À l'entrée de la fonction JNI :

- `x0` contient l'environnement JNI ;
- `x1` contient la classe ;
- `x2` contient `appId` ;
- `x3` contient `access_token` ;
- `x4` contient `sortedParams`.

Le désassemblage permet d'établir les rôles distincts de ces trois arguments applicatifs :

- `appId` sert à identifier une entrée dans une table native ;
- `access_token` participe à la dérivation de la clé HMAC ;
- `sortedParams` constitue le message du HMAC.

### 22.10 Premier MD5 : recherche dans la table native

La fonction native calcule d'abord :

```text
digest_app = MD5(UTF8(appId))
lookup_key = lowercase_hex(digest_app)
```

Le résultat est représenté sous forme de 32 caractères hexadécimaux minuscules.

Cette chaîne est utilisée pour rechercher une entrée dans une table native.

**Le premier MD5 n'est pas la clé HMAC.** Il sert uniquement à sélectionner la valeur applicative associée à l'identifiant de l'application.

La comparaison des clés de recherche a été reliée à `strcmp` à partir des symboles dynamiques et des appels PLT observés dans la bibliothèque.

### 22.11 Deuxième MD5 : dérivation de la clé HMAC

Après la recherche dans la table, la fonction native récupère la valeur associée à la clé de recherche.

Elle construit ensuite une chaîne par concaténation :

```text
key_material = UTF8(access_token || S_app)
```

Le désassemblage montre explicitement que la valeur récupérée dans la table est ajoutée à la chaîne contenant le jeton d'accès.

Le second MD5 est calculé sur cette concaténation :

```text
digest_key = MD5(key_material)
```

Le résultat est converti en 32 caractères hexadécimaux minuscules.

La clé transmise au HMAC est constituée des caractères ASCII de cette représentation :

```text
hmac_key = UTF8(lowercase_hex(digest_key))
```

Il faut donc distinguer trois opérations :

1. le premier MD5, qui sert à retrouver l'entrée native ;
2. le second MD5, qui dérive la clé HMAC à partir de `access_token` et de la valeur de table ;
3. la conversion du second digest en 32 caractères hexadécimaux minuscules, utilisés comme octets ASCII de la clé HMAC.

Le second digest n'est donc pas transmis au HMAC sous la forme de ses 16 octets binaires bruts.

### 22.12 Format des sorties MD5

Le désassemblage de `MD5.getHash()` à l'offset `0x18570` établit le format de sortie hexadécimal.

La fonction :

1. parcourt les 16 octets du digest ;
2. extrait le nibble haut de chaque octet ;
3. extrait le nibble bas ;
4. convertit chacun de ces nibbles au moyen de la table :

```text
0123456789abcdef
```

Elle produit ainsi 32 caractères hexadécimaux minuscules.

Un autre overload, `MD5.getHash(unsigned char*)`, situé à l'offset `0x18678`, retourne les 16 octets bruts du digest.

Ces deux sorties ne sont pas interchangeables.

Pour le calcul de Signature2 étudié ici, le résultat du second MD5 est utilisé sous forme hexadécimale, c'est-à-dire comme 32 octets ASCII minuscules constituant la clé HMAC.

### 22.13 JNI_OnLoad et initialisation de la table native

La fonction `JNI_OnLoad`, située à l'offset `0x15574`, vérifie le nom du package parmi plusieurs candidats.

Lorsqu'un package correspond, elle appelle `initKey()` et retourne la version JNI 1.6 (`0x10006`).

La fonction `initKey()` se trouve à l'offset `0x158c0`.

Elle parcourt une zone de données statique comprise entre `0x2b68` et `0xc670`, avec un pas de `0x190`, soit 127 enregistrements.

Chaque enregistrement contient six mots de 32 bits utilisés pour reconstruire les paramètres de la clé et les données encodées.

Les six mots initiaux sont lus aux positions suivantes dans chaque enregistrement :

| Mot | Position dans l'enregistrement |
|---|---:|
| `w24` | `+0x00` |
| `w25` | `+0x04` |
| `w20` | `+0x08` |
| `w19` | `+0x0c` |
| `w23` | `+0x10` |
| `w9` | `+0x14` |

Les calculs intermédiaires observés sont :

```text
L = w24 XOR w9
S = w25 + w24 + w20 + w19
R = signed_remainder(S, w23)
```

La fonction calcule ensuite les paramètres de longueur :

```text
w10 = max(L + 37, 6)
x11 = w10 - 5
x12 = x11 & ~1
```

La boucle de reconstruction commence à `j = 7` et progresse par pas de deux.

À chaque itération, deux mots sont lus dans la zone de données de l'enregistrement, à partir de `+0x18`, avec un pas de huit octets.

Les deux mots sont transformés par XOR :

```text
A = word1 XOR (R + j - 6)
B = word2 XOR (R + j - 5)
```

Le résultat est réparti entre la zone de clé et la zone de données encodées selon les conditions d'indice observées :

```text
if (j - 1) < 0x26:
    key[j - 7] = A
else:
    encoded[j - 39] = A

if j < 0x26:
    key[j - 6] = B
else:
    encoded[j - 38] = B
```

Cette étape reconstitue les matériaux ensuite transmis aux fonctions de décodage Base64 et de déchiffrement XXTEA.

Les fonctions `WYZE_base64_decode` et `WYZE_xxtea_decrypt` sont implémentées dans la même bibliothèque `libwyze_olive-lib.so`.

### 22.13 bis. Reconstruction algorithmique des buffers `key` et `encoded`

Ce complément explicite le fonctionnement de `initKey()` au niveau des opérations et des indices. Il doit être lu avec le §22.13, qui décrit la zone mémoire parcourue et la structure des enregistrements.

L'objectif de `initKey()` est de reconstruire, à partir des mots stockés dans chaque enregistrement, deux buffers distincts :

- `key` : matériau transmis ensuite au déchiffrement XXTEA ;
- `encoded` : données encodées qui seront décodées en Base64 avant le déchiffrement.

Il ne faut pas confondre ces deux buffers avec la clé HMAC finale de `Signature2`. La clé HMAC est dérivée ultérieurement, dans `getSignatureByString()`, à partir du jeton d'accès et de la valeur applicative issue du déchiffrement.

#### A. Lecture des six mots de contrôle

Pour chaque enregistrement, six mots de 32 bits sont lus aux offsets suivants, relativement au début de l'enregistrement :

| Variable | Offset | Rôle dans les calculs |
|---|---:|---|
| `w24` | `+0x00` | participe au calcul de `L` et de `S` |
| `w25` | `+0x04` | participe au calcul de `S` |
| `w20` | `+0x08` | participe au calcul de `S` |
| `w19` | `+0x0c` | participe au calcul de `S` |
| `w23` | `+0x10` | diviseur du calcul de `R` |
| `w9` | `+0x14` | participe au calcul de `L` |

Les trois paramètres calculés à partir de ces mots sont :

```text
L = w24 XOR w9

S = w25 + w24 + w20 + w19

R = signed_remainder(S, w23)
```

Précisions :

- `XOR` désigne le OU exclusif binaire.
- `S` est la somme des quatre mots indiqués.
- `signed_remainder` désigne le reste de division signé observé dans le code natif. Il ne faut pas le remplacer automatiquement par un modulo mathématique positif : pour des opérandes négatifs, les deux opérations peuvent produire des résultats différents.
- Le calcul suppose un diviseur `w23` non nul. Le traitement d'un éventuel diviseur nul n'est pas documenté ici.

`L` et `R` servent ensuite aux calculs de longueur et à la transformation des mots de données.

#### B. Calcul des paramètres intermédiaires

Le code calcule ensuite :

```text
w10 = max(L + 37, 6)

x11 = w10 - 5

x12 = x11 AND NOT 1
```

La dernière opération efface le bit de poids faible de `x11`. Elle revient donc à arrondir cette valeur à l'entier pair inférieur ou égal.

Ces trois expressions sont relevées dans le désassemblage. Elles doivent être conservées telles quelles dans une éventuelle réimplémentation.

`x12` est un paramètre intermédiaire du traitement natif. Sa présence dans le calcul ne suffit pas, à elle seule, à justifier une interprétation fonctionnelle plus précise que celle établie par le contrôle de flux observé.

#### C. Lecture et transformation des mots de données

Après les six mots de contrôle, les données à transformer commencent à l'offset `+0x18` de l'enregistrement.

La boucle utilise un indice `j` initialisé à 7 et augmenté de 2 à chaque itération :

```text
j = 7

à chaque itération :
    lire word1 et word2
    transformer word1 et word2
    répartir les résultats
    j = j + 2
```

Les deux mots lus sont transformés séparément :

```text
A = word1 XOR (R + j - 6)

B = word2 XOR (R + j - 5)
```

On peut aussi écrire :

\[
A_j=word1_j\oplus(R+j-6)
\]

\[
B_j=word2_j\oplus(R+j-5)
\]

Les valeurs `R + j - 6` et `R + j - 5` sont les deux masques arithmétiques utilisés par les opérations XOR.

Les deux mots ne sont donc pas déchiffrés avec un masque identique : le second utilise un décalage d'une unité par rapport au premier.

#### D. Répartition entre `key` et `encoded`

Après transformation, chaque valeur est dirigée vers l'un des deux buffers. Les conditions observées sont :

```text
if (j - 1) < 0x26:
    key[j - 7] = A
else:
    encoded[j - 39] = A

if j < 0x26:
    key[j - 6] = B
else:
    encoded[j - 38] = B
```

Le seuil `0x26` vaut 38 en décimal.

Les deux conditions sont légèrement différentes :

- pour `A`, le test porte sur `j - 1` ;
- pour `B`, le test porte directement sur `j`.

Il est important de conserver cette différence. La remplacer par une condition commune décalerait la frontière entre les deux buffers.

La distribution peut être explicitée par les premiers indices :

| `j` | Destination de `A` | Destination de `B` |
|---:|---|---|
| 7 | `key[0]` | `key[1]` |
| 9 | `key[2]` | `key[3]` |
| 11 | `key[4]` | `key[5]` |
| ... | ... | ... |
| 35 | `key[28]` | `key[29]` |
| 37 | `key[30]` | `key[31]` |
| 39 | `encoded[0]` | `encoded[1]` |
| 41 | `encoded[2]` | `encoded[3]` |
| 43 | `encoded[4]` | `encoded[5]` |

Cette table rend visible le point de séparation :

- les indices de `key` sont alimentés jusqu'à la paire produite pour `j = 37` ;
- à partir de `j = 39`, les deux valeurs sont dirigées vers `encoded`.

Les indices de destination sont ceux employés par le code natif. Il ne faut pas les confondre avec les offsets des mots lus dans l'enregistrement.

#### E. Pseudocode consolidé

Le comportement établi peut être résumé par le pseudocode suivant :

```text
pour chaque enregistrement :

    lire w24, w25, w20, w19, w23, w9

    L = w24 XOR w9
    S = w25 + w24 + w20 + w19
    R = signed_remainder(S, w23)

    w10 = max(L + 37, 6)
    x11 = w10 - 5
    x12 = x11 AND NOT 1

    j = 7

    tant que le contrôle de boucle natif autorise une itération :

        lire word1 et word2

        A = word1 XOR (R + j - 6)
        B = word2 XOR (R + j - 5)

        si (j - 1) < 0x26 :
            key[j - 7] = A
        sinon :
            encoded[j - 39] = A

        si j < 0x26 :
            key[j - 6] = B
        sinon :
            encoded[j - 38] = B

        j = j + 2
```

La condition d'arrêt exacte de la boucle doit rester celle du désassemblage, et non une borne supposée à partir de la seule longueur `L`. Les formules de calcul des paramètres intermédiaires ne doivent pas être utilisées pour inventer une borne de boucle qui n'aurait pas été vérifiée indépendamment.

#### F. Raccord avec Base64 et XXTEA

À la sortie de cette reconstruction, les deux buffers ont des fonctions différentes :

```text
key
    -> matériau de clé transmis à WYZE_xxtea_decrypt()

encoded
    -> données soumises à WYZE_base64_decode()
    -> données décodées transmises à WYZE_xxtea_decrypt()
```

La séquence fonctionnelle est donc :

```text
enregistrement natif
    -> lecture des six mots de contrôle
    -> calcul de L, S et R
    -> calcul de w10, x11 et x12
    -> lecture des mots de données
    -> XOR donnant A et B
    -> répartition entre key et encoded
    -> décodage Base64 de encoded
    -> déchiffrement XXTEA avec key
    -> valeur applicative déchiffrée
```

Le déchiffrement XXTEA reçoit un pointeur sur les données décodées, leur longueur, un pointeur sur la clé et un pointeur destiné à recevoir la longueur de sortie.

Le code natif charge 16 octets de clé pour ce traitement et recherche un terminateur NUL dans la zone prévue. En l'absence de terminateur dans les quinze premiers octets, il utilise les 16 premiers octets.

Pour l'entrée applicative étudiée, les observations statiques et la vérification indépendante hors ligne sont les suivantes :

| Propriété | Résultat observé |
|---|---:|
| Valeur de `L` | 40 |
| Valeur de `R` | 2 |
| Longueur du buffer Base64 reconstruit | 40 caractères |
| Longueur après décodage Base64 | 28 octets |
| Nombre de mots XXTEA | 7 |
| Nombre de tours XXTEA | 13 |
| Longueur de sortie vérifiée hors ligne | 23 octets |

Pour XXTEA, le nombre de tours est calculé par division entière :

\[
n=\left\lceil\frac{28}{4}\right\rceil=7
\]

\[
rounds=\left\lfloor\frac{52}{n}\right\rfloor+6
=\left\lfloor\frac{52}{7}\right\rfloor+6=13
\]

La longueur utile est contrôlée dans l'intervalle observé :

\[
21\leq output\_length\leq24
\]

La sortie vérifiée de 23 octets respecte cet intervalle.

Cette vérification indépendante confirme la cohérence de la reconstruction pour l'entrée étudiée. Elle ne constitue ni une exécution de la bibliothèque native, ni une validation serveur.

#### G. Ce qui est établi et ce qui ne doit pas être extrapolé

**Établi par l'analyse statique :**

- la lecture des six mots de contrôle ;
- les formules de `L`, `S` et `R` ;
- les formules de `w10`, `x11` et `x12` ;
- le démarrage de la boucle à `j = 7` et son incrément de 2 ;
- les deux transformations XOR ;
- les deux conditions distinctes de distribution ;
- les formules des indices de destination dans `key` et `encoded` ;
- le passage de `encoded` par Base64 puis de la sortie Base64 par XXTEA ;
- le contrôle de longueur à la sortie du déchiffrement.

**À ne pas prétendre sans nouvelle preuve :**

- que `L` est directement la longueur du buffer `key` ou celle du buffer `encoded` ;
- que `x12` représente à lui seul la borne exacte de la boucle ;
- que la seule valeur de `L` permet de déduire tous les indices effectivement parcourus ;
- que les valeurs des buffers sont publiables ;
- que la validation hors ligne équivaut à une validation du serveur Wyze.

Les valeurs secrètes, les buffers reconstruits, les octets de clé, la chaîne Base64 et le contenu déchiffré restent exclus du journal public.

Ce complément décrit ainsi l'algorithme de reconstruction sans publier les données sensibles nécessaires à sa reproduction.

### 22.14 Entrée correspondant à l'identifiant applicatif étudié

La recherche statique a permis d'identifier une entrée correspondant au hash MD5 de l'identifiant applicatif employé par le chemin `WyzeEventNet.u()`.

Les métadonnées non secrètes de cette entrée sont :

| Propriété | Valeur |
|---|---:|
| Index dans la table | `2` |
| Offset de l'enregistrement | `0x2e88` |
| `L` | `40` |
| `R` | `2` |
| Longueur de la chaîne Base64 reconstruite | `40` caractères |
| Longueur après décodage Base64 | `28` octets |

Les valeurs de clé, la chaîne Base64, les données déchiffrées et le contenu secret de cette entrée sont volontairement exclus du document public.

Cette identification permet de relier la recherche par `MD5(appId)` à une entrée effective de la table native sans publier les matériaux permettant de reproduire le secret applicatif.

### 22.15 Décodage Base64 et déchiffrement XXTEA

La chaîne reconstruite à partir de l'enregistrement correspondant est soumise à un décodage Base64, puis à un déchiffrement XXTEA.

La fonction de décodage Base64 se trouve à l'offset `0x18954`.

La fonction `WYZE_xxtea_decrypt` se trouve à l'offset `0x18da8`.

Son interface reçoit :

- un pointeur sur les données ;
- la longueur des données ;
- un pointeur sur la clé ;
- un pointeur destiné à recevoir la longueur de sortie.

Le désassemblage montre le chargement de 16 octets de clé.

La fonction examine les octets de la clé à la recherche d'un terminateur NUL dans la zone prévue. Si aucun terminateur n'est trouvé dans les quinze premiers octets, elle utilise les 16 premiers octets.

La fonction prépare ensuite les données sous forme de mots de 32 bits et applique le déchiffrement XXTEA.

Pour l'entrée étudiée :

```text
longueur après Base64 = 28 octets
n = 28 / 4 = 7 mots de 32 bits
```

Le nombre de tours suit la formule XXTEA :

```text
rounds = 52 / n + 6
```

Pour `n = 7` :

```text
rounds = 52 / 7 + 6 = 13
```

La boucle inverse utilise l'index de clé dérivé de :

```text
(p & 3) XOR e
```

La fonction vérifie ensuite la longueur finale annoncée par le dernier mot déchiffré.

Pour sept mots, la longueur utile doit se trouver dans l'intervalle :

```text
21 <= output_length <= 24
```

La fonction alloue le buffer de sortie, copie les octets utiles, ajoute le terminateur NUL et renseigne la longueur de sortie.

Une vérification indépendante réalisée hors ligne en Python à partir de la reconstruction statique a confirmé une longueur de sortie de 23 octets pour l'entrée correspondant à l'identifiant applicatif étudié.

Cette vérification n'a nécessité ni l'exécution de la bibliothèque native ni un appel réseau.

Le contenu déchiffré et les matériaux permettant de le reproduire sont volontairement exclus du document public.

### 22.16 HMAC-MD5 : fonction, clé et message

La fonction native `hmac<MD5>` a été identifiée à l'offset `0x17690`.

L'appel depuis `getSignatureByString` se situe autour de l'offset `0x164b0`.

Le suivi des registres établit les rôles des deux couples pointeur/longueur transmis à la fonction :

- `x0/x1` : pointeur et longueur du message, soit `sortedParams` ;
- `x2/x3` : pointeur et longueur de la clé HMAC, soit la représentation hexadécimale du second MD5.

Le sens de l'opération est donc :

```text
HMAC-MD5(
    key = hmac_key,
    message = sortedParams
)
```

L'implémentation suit le mécanisme HMAC standard avec une taille de bloc MD5 de 64 octets.

Le désassemblage montre :

1. le traitement de la longueur de la clé ;
2. le hachage préalable de la clé si elle dépasse la taille du bloc ;
3. la préparation du bloc de clé ;
4. la construction du bloc XOR avec `ipad` ;
5. le calcul MD5 interne sur le message préfixé par `ipad` ;
6. la construction du bloc XOR avec `opad` ;
7. le calcul MD5 externe sur le résultat interne.

La fonction retourne une chaîne produite par le mécanisme natif de signature. La fonction JNI transmet ce résultat à Java au moyen de `NewStringUTF`.

### 22.17 Formules complètes des calculs

Cette section rassemble les formules distinctes établies pendant l'analyse. Elles ne doivent pas être confondues.

**A. Nonce ajouté aux paramètres signés**

```text
nonce_params = currentTimeMillis()
paramsData["nonce"] = nonce_params
```

Les clés du JSON sont ensuite ordonnées et concaténées sous la forme `clé=valeur&...`.

**B. requestid**

La structure des appels observée dans `GetBuilder.build()` est :

```text
requestid = MD5(MD5(nonce_Builder))
```

`nonce_Builder` est le nonce initialisé par le constructeur de GetBuilder. Il est distinct de `nonce_params`.

La représentation exacte du résultat intermédiaire du premier MD5 reste à confirmer dans le chemin qui calcule `requestid`. Il ne faut donc pas assimiler sans preuve cette formule à celle du digest hexadécimal utilisé dans le calcul natif de Signature2.

**C. Recherche de la valeur applicative**

```text
D1 = MD5(UTF8(appId))
lookup_key = lowercase_hex(D1)
S_app = native_table[lookup_key]
```

`D1` sert uniquement à rechercher l'entrée correspondante dans la table native.

**D. Dérivation de la clé HMAC**

```text
key_material = UTF8(access_token || S_app)
D2 = MD5(key_material)
hmac_key = UTF8(lowercase_hex(D2))
```

`D2` est le second MD5 du mécanisme de Signature2. Sa représentation hexadécimale minuscule, constituée de 32 caractères ASCII, devient la clé HMAC.

**E. Construction du message**

```text
message = UTF8(sortedParams)
```

`sortedParams` est la chaîne brute produite par `getSortParams(JSONObject)` après insertion du nonce et ordonnancement des clés.

**F. Signature2**

```text
Signature2 = HMAC-MD5(
    key = hmac_key,
    message = message
)
```

En notation condensée :

\[
D_1=MD5(UTF8(appId))
\]

\[
S_{app}=NativeTable[hex_{lower}(D_1)]
\]

\[
D_2=MD5(UTF8(access\_token \parallel S_{app}))
\]

\[
K=UTF8(hex_{lower}(D_2))
\]

\[
Signature2=HMAC\text{-}MD5(K,UTF8(sortedParams))
\]

**Distinction essentielle :**

- le premier MD5 identifie l'entrée de la table native ;
- le second MD5 dérive la clé HMAC ;
- le HMAC-MD5 calcule la signature à partir de cette clé et de `sortedParams` ;
- `requestid` est un calcul distinct, appliqué au nonce initial du Builder.

Le digest MD5 binaire de 16 octets et sa représentation hexadécimale de 32 caractères ASCII sont deux formats différents. Pour la clé HMAC de Signature2, c'est la représentation hexadécimale du second MD5 qui est utilisée.

### 22.18 WyzeEventNet.z(Response) : traitement de la réponse

La méthode `WyzeEventNet.u()` transmet la réponse HTTP à `WyzeEventNet.z(Response)`.

La zone de code examinée pour le traitement de la réponse se situe autour des offsets `0x131ccc–0x131ed6`.

La méthode construit ou renseigne un objet résultat de type `WyzeEventNet$a`, dont les accesseurs observés comprennent notamment :

- `a()` : chaîne associée à l'URL ;
- `b()` : statut HTTP ;
- `c()` : code extrait de la réponse.

Le traitement distingue les réponses nulles, les réponses HTTP 200 et les réponses non-200.

**Réponse nulle**

Une réponse nulle conduit à un résultat vide.

**Réponse HTTP non-200**

Le corps est lu et interprété comme du JSON. Le code JSON est extrait et le résultat conserve les informations de statut et de code.

Dans le chemin observé, lorsque le code JSON vaut `1`, le champ `data` est extrait et placé dans l'objet résultat.

Cette branche ne prouve pas qu'une réponse non-200 fournit nécessairement une URL vidéo exploitable : elle décrit uniquement le traitement du champ `data` dans cette branche.

**Réponse HTTP 200**

Le statut HTTP est enregistré, le corps est lu et le code JSON est analysé.

Le chemin observé comprend également le traitement d'une combinaison de codes d'erreur, notamment le cas où le code analysé vaut `400` et où le code interne associé vaut `1000`, qui conduit à une erreur spécifique.

Il ne faut pas présenter ce chemin HTTP 200 comme une preuve d'extraction réussie de `data` ou d'obtention d'une URL vidéo. Les éléments conservés de ce désassemblage ne permettent pas de conclure à une extraction systématique de `data` dans cette branche.

**Conséquence**

Le traitement de la réponse par `WyzeEventNet.z()` doit être distingué du traitement de la réponse par la coroutine Ktor `getKvsReplayUrl`.

Dans le chemin Ktor, la réponse est désérialisée par le modèle `Lx9i`, dont les champs JSON comprennent `code`, `message` et `data`. La coroutine vérifie `code == 1` et la présence d'un `data` non vide avant d'émettre une chaîne comme résultat.

Cette preuve propre au chemin Ktor ne doit pas être transposée automatiquement au parseur `WyzeEventNet.z()`.

Aucune réponse serveur positive n'a été obtenue pendant la présente analyse statique.

### 22.19 Distinction avec le chemin Ktor de Replay v4

Les analyses précédentes ont établi un chemin Ktor distinct :

```text
EventGroupViewModel
    -> Lkwc.f(...)
    -> Liwc.f(...)
    -> EventGroupRepositoryRemoteImplementation.f(...)
    -> getKvsReplayUrl(...)
    -> Lyvt.d(...)
    -> constructeur de paramètres URL Ktor
    -> HttpStatement
```

Ce chemin transmet notamment :

- `device_id` ;
- `product_model` ;
- `start_time` ;
- `end_time` ;
- `is_live` ;
- `resource_version`.

La coroutine construit une requête vers :

```text
https://kvs-service.wyzecam.com/app/v4/replay_url
```

Elle ajoute `Authorization` et les paramètres URL au moyen des mécanismes Ktor précédemment étudiés.

Le chemin `WyzeEventNet.u()` utilise quant à lui :

```text
WyzeEventNet.u(...)
    -> WpkSignature2Service.builder(...)
    -> GetBuilder
    -> getSortParams(...)
    -> WpkSecurityUtil.getSignature(...)
    -> WpkSecurity.getSignature(...)
    -> getSignatureByString(...)
    -> GetBuilder.execute()
    -> WyzeEventNet.z(Response)
```

Les deux chemins sont présents dans l'APK. Le second fait intervenir le mécanisme natif de Signature2 décrit dans cette section.

Il n'est pas démontré que la coroutine Ktor appelle ce mécanisme natif. Il n'est pas non plus démontré que `WyzeEventNet.u()` est systématiquement utilisé pour toutes les opérations Replay v4.

Les deux chemins doivent donc rester séparés dans le journal tant que leur éventuel raccord à l'exécution n'a pas été établi.

### 22.20 Relation avec la ressource KVS et resource_version

Les analyses précédentes ont établi que le ViewModel sélectionne une ressource identifiée comme `kvs`, récupère ses bornes temporelles et transmet sa version à la méthode repository Ktor.

La valeur de version est convertie de long en entier avant son ajout au paramètre `resource_version`.

La méthode `WyzeEventNet.u()` reçoit également un entier `resource_version` et l'ajoute aux paramètres de la requête Replay v4.

Ces observations montrent que les deux chemins prennent en compte une version de ressource KVS.

Elles ne démontrent toutefois pas que la ressource KVS v3 observée pour `GW_BE1` est effectivement acceptée par le service Replay v4, ni que les deux chemins utilisent la même représentation de requête ou la même signature.

La compatibilité effective de la ressource KVS v3 avec le service Replay reste à vérifier.

### 22.21 Matrice des preuves et des limites

| Point examiné | État |
|---|---|
| `getSortParams()` ajoute un nonce temporel au JSON | Établi |
| Le JSON initial est modifié par cette insertion | Établi |
| Les clés sont ordonnées avant concaténation | Établi |
| La chaîne est construite sous forme `clé=valeur&...` | Établi |
| `sortedParams` est le message transmis au HMAC | Établi |
| `appendParams()` utilise `Uri.Builder.appendQueryParameter()` | Établi |
| Les valeurs nulles sont ignorées par `appendParams()` | Établi |
| Le nonce initial du Builder est distinct du nonce ajouté au JSON | Établi |
| `requestid` utilise deux appels MD5 imbriqués sur le nonce du Builder | Établi |
| La représentation intermédiaire du premier MD5 de `requestid` | À confirmer |
| `appinfo` utilise le nom d'application, le suffixe Android et la version | Établi |
| `phoneid` utilise le mécanisme `WpkSPUtil` | Établi |
| `Signature2` est ajouté aux en-têtes par GetBuilder | Établi |
| `Authorization` est ajouté séparément par `WyzeEventNet.u()` | Établi |
| `access_token` est ajouté par GetBuilder lorsque l'option est activée | Établi |
| `WpkSecurityUtil` transmet `appId`, `access_token` et `sortedParams` à la couche native | Établi |
| Le premier MD5 sert de clé de recherche dans la table native | Établi |
| La valeur de table est concaténée après `access_token` | Établi |
| Le second MD5 est utilisé pour dériver la clé HMAC | Établi |
| `MD5.getHash()` retourne 32 caractères hexadécimaux minuscules | Établi |
| Un autre overload retourne les 16 octets bruts | Établi |
| Le HMAC reçoit `sortedParams` comme message | Établi |
| Le HMAC reçoit le second MD5 hexadécimal comme clé | Établi |
| `initKey()` parcourt 127 enregistrements statiques | Établi |
| La reconstruction utilise les opérations XOR décrites | Établi |
| La reconstruction utilise Base64 puis XXTEA | Établi |
| Le déchiffrement vérifie la longueur de sortie | Établi |
| L'entrée applicative correspondante a été localisée dans la table | Établi |
| Une vérification indépendante hors ligne a confirmé la longueur de sortie | Établi |
| Les valeurs secrètes sont publiées dans ce journal | Non : volontairement exclues |
| `WyzeEventNet.u()` construit une requête GET vers Replay v4 | Établi statiquement |
| `WyzeEventNet.u()` ajoute les six paramètres documentés | Établi statiquement |
| `WyzeEventNet.u()` exécute le Builder et transmet la réponse à `z(Response)` | Établi statiquement |
| Le chemin HTTP 200 de `z(Response)` démontre une URL vidéo exploitable | Non démontré |
| Le serveur Wyze accepte la signature calculée | Non démontré |
| Le mécanisme est utilisé par toutes les requêtes Replay v4 | Non démontré |
| Le chemin Ktor utilise nécessairement le même mécanisme natif | Non démontré |
| La ressource KVS v3 de `GW_BE1` est acceptée par le service Replay | Non démontré |
| Une URL de lecture exploitable a été obtenue | Non démontré |
| Un manifeste ou un clip a été récupéré | Non démontré |

### 22.22 Conclusion et statut au 28 novembre 2026

L'analyse statique a permis de reconstituer le mécanisme de génération de Signature2 utilisé par le chemin `WpkSignature2Service`, et de le raccorder à son appelant `WyzeEventNet.u()`.

Le mécanisme cryptographique comporte les opérations distinctes suivantes :

1. insertion d'un nonce temporel dans le JSON des paramètres ;
2. ordonnancement des clés et construction de `sortedParams` ;
3. calcul indépendant de `requestid` à partir du nonce initial du Builder ;
4. calcul de `MD5(appId)` et recherche de l'entrée correspondante dans la table native ;
5. concaténation du jeton d'accès et de la valeur applicative récupérée ;
6. second MD5 et conversion de son résultat en 32 caractères hexadécimaux minuscules ;
7. HMAC-MD5 de `sortedParams` avec cette représentation hexadécimale comme clé ;
8. insertion de `Signature2` dans les en-têtes de la requête.

La préparation de la table native, le décodage Base64, le déchiffrement XXTEA et la fonction HMAC-MD5 ont été examinés statiquement. Une vérification indépendante hors ligne a confirmé la longueur de sortie attendue pour l'entrée étudiée.

Le raccord avec `WyzeEventNet.u()` établit la construction d'une requête GET vers `/app/v4/replay_url`, avec les six paramètres documentés et l'en-tête `Authorization`. La réponse est ensuite traitée par `WyzeEventNet.z(Response)`, dont les branches HTTP 200 et non-200 ne doivent pas être confondues.

Cette reconstitution ne démontre pas l'acceptation de la signature par le serveur Wyze, l'obtention d'une URL Replay v4 exploitable, ni la récupération d'un clip.

Elle ne démontre pas non plus que le chemin Ktor utilise le même mécanisme natif, ni que la ressource KVS v3 de `GW_BE1` est acceptée par le service Replay.

**Statut au 28 novembre 2026 :** mécanisme de Signature2 reconstitué statiquement pour le chemin `WpkSignature2Service` et raccordé à l'appelant `WyzeEventNet.u()` ; traitement de la réponse analysé avec des limites explicites ; aucune validation serveur ; aucun appel réseau ; aucune récupération vidéo ; aucun changement de production.

La prochaine vérification doit rester statique et porter sur les différences entre les deux chemins Replay v4, ainsi que sur les éléments encore non démontrés concernant la réponse et la compatibilité de la ressource KVS v3.

Les secrets, clés natives, données déchiffrées et matériaux de dérivation restent exclus du journal public.

## 23. FICHE DE REPRISE AUTONOME — ÉTAT AU 28 NOVEMBRE 2026

### 23.1. Objet et priorité du projet

Objectif principal : mettre en place sur le NAS Synology SERVOR un archivage automatique des vidéos d'événements cloud Wyze Cam Plus / Web View de la sonnette **GW_BE1 — Sonnette Grille**, avant leur expiration de la rétention cloud (environ 15 jours).

Le résultat recherché n'est pas simplement de reconstituer une API ou de produire une URL théorique : il faut parvenir à récupérer effectivement une vidéo d'événement de la sonnette, la télécharger, vérifier son intégrité et la conserver sur le NAS.

Périmètre actuel :
- Uniquement la sonnette GW_BE1 / Sonnette Grille.
- Les deux anciennes Outdoor Cams sont hors périmètre tant qu'elles ne sont pas réparées et que leur intégration n'a pas été explicitement autorisée.
- Pas de flux permanent, RTSP, ONVIF, WebRTC, capture continue ou surveillance permanente.
- Le fonctionnement final doit être centralisé sur le NAS autant que possible, sans intervention régulière dans l'application Wyze ou dans un navigateur.

### 23.2. Règles impératives de travail

Ces règles s'appliquent à tout assistant reprenant le projet, y compris ChatGPT, Claude, Gemini ou un autre outil.

1. **Aucun appel réseau vers Wyze sans autorisation explicite préalable.** La reconstitution statique actuelle ne constitue pas une autorisation de tester l'API.
2. Aucun téléchargement de vidéo, aucune demande de replay et aucune expérimentation susceptible de solliciter le compte Wyze sans accord explicite.
3. Aucune modification de production sur SERVOR, DSM, Docker, les montages NAS ou les services existants sans validation explicite.
4. Aucune installation de logiciel ou d'outil sans autorisation.
5. Analyse de l'APK et de la bibliothèque native hors ligne uniquement. Ne jamais exécuter `libwyze_olive-lib.so`.
6. Ne jamais publier de jeton, mot de passe, clé, valeur native reconstituée, matériau de dérivation, contenu Base64 sensible ou donnée permettant de reproduire les secrets de signature.
7. Ne pas confondre les conclusions statiques avec des résultats obtenus par exécution réelle.
8. Ne pas considérer un MP4 synthétique comme la preuve qu'une vidéo Wyze réelle a été récupérée ou reconstruite.
9. Ne pas supposer qu'une ancienne commande, une ancienne réponse ou un ancien état local est encore valable. Vérifier avant de poursuivre.
10. L'utilisateur conserve la maîtrise des modifications du dépôt GitHub et des commits. Ne pas modifier le dépôt sans demande explicite.

### 23.3. Environnement de travail

**Mac mini**
- Nom : `minimac`.
- Machine Apple Silicon, décrite par l'utilisateur comme M5 Pro, 64 Go de mémoire, SSD 512 Go.
- Compte utilisateur : `florian`.
- Répertoire principal de l'audit APK :
  `$HOME/wyze-apk-audit-2026-11-25`
- Cross-references DEX :
  `$HOME/wyze-apk-audit-2026-11-25/dex-work/crossrefs/`
- Dossier de preuves Replay v4 :
  `$HOME/wyze-apk-audit-2026-11-25/evidence-replay-v4`
- Bibliothèque native extraite :
  `/tmp/libwyze_olive-lib.so`
- Attention : `/tmp` est temporaire. Ne pas considérer son contenu comme une archive durable.

**Téléphone de référence**
- Vivo 2006NG.
- APK Wyze 3.26.0.1046, versionCode 62746.
- Installation auditée le 25 novembre 2026.
- Les fichiers APK et DEX locaux doivent être vérifiés avant toute nouvelle analyse.

**NAS**
- Nom : SERVOR.
- Synology DS1525neo+.
- DSM 7.4.1 build 90080.
- Adresse LAN : `192.168.1.103`.
- Dossier d'archive cible :
  `/volume1/Wyze-Archive`
- Aucun changement de production ne doit être entrepris sans accord.

### 23.4. Référentiel documentaire

Rapport central :
`https://github.com/testuflo-ft/docs-serveur-ia/blob/main/wyze/WYZE-AUDIT-SONNETTE-GRILLE.md`

État consulté le 28 novembre 2026 :
- Branche : `main`.
- SHA du fichier : `177126f8fcf1b464b45c9162f0f6856cd7c984bf`.
- Taille : 4 443 lignes.
- Dernière section technique : §22.22.
- Reconstruction algorithmique des buffers `key` et `encoded` : §22.13 bis.

**Important :** ce SHA est un point de référence historique, pas une garantie que le document est toujours identique. À chaque reprise, récupérer le fichier courant et son SHA avant de travailler. Les sections §16, §18.8 et §19.7 contiennent des points de reprise plus anciens : ne pas les utiliser comme état courant sans les comparer aux dernières sections.

Les preuves détaillées sont dans le rapport et dans le dossier local `evidence-replay-v4`. Les fichiers locaux doivent être vérifiés par leur présence et leurs empreintes avant d'être utilisés comme preuves.

### 23.5. Résultats établis — analyse statique

Les éléments suivants sont établis par l'analyse de l'APK Wyze 3.26.0.1046 et de sa bibliothèque native.

**A. Ressource KVS**
- Le serializer `Lepu$a` enregistre `resource_version` à l'index 1.
- `Lepu.g()` retourne cette valeur sous forme de `long`.
- Le ViewModel la convertit en `int` avant de la transmettre au repository.
- La valeur est transmise comme paramètre `resource_version`.
- La sélection du chemin KVS est conditionnée par `Lepu.f() == "kvs"`.

**B. Chemin Ktor**
- L'implémentation `EventGroupRepositoryRemoteImplementation` construit une requête vers :
  `https://kvs-service.wyzecam.com/app/v4/replay_url`
- Les paramètres identifiés sont :
  `device_id`, `product_model`, `start_time`, `end_time`, `is_live`, `resource_version`.
- Un en-tête Authorization est ajouté.
- Le paramètre `resource_version` est converti en chaîne par le mécanisme Ktor.
- La réponse est désérialisée en `KvsReplayUrlResponse`, avec les champs `code`, `message` et `data`.
- Le chemin attend `code == 1` et une valeur `data` non vide pour produire un résultat positif.

**C. Chemin WyzeEventNet**
- `WyzeEventNet.u(String,String,long,long,boolean,int)` construit également une requête Replay v4.
- Il utilise le même endpoint `/app/v4/replay_url`.
- Il ajoute les paramètres de requête identifiés et un en-tête Authorization.
- La réponse passe par `WyzeEventNet.z(Response)`.
- Les traitements des réponses HTTP non 200 et HTTP 200 ont été analysés partiellement et sont documentés dans la section 22.

**D. Signature2**
- Le chemin de construction de la signature a été suivi dans `GetBuilder.build()`, `WpkSignature2Service`, `WpkSecurityUtil` et la bibliothèque native.
- La fonction native `getSignatureByString` a été désassemblée.
- Le rôle de MD5, de HMAC-MD5 et de la chaîne `sortedParams` a été établi.
- La construction algorithmique des buffers internes a été reconstituée.
- La reconstruction est documentée en §22.13 bis et dans les sections suivantes.
- Les valeurs secrètes et matériaux permettant de reproduire la clé ne doivent pas être recopiés dans ce document public.

### 23.6. Ce qui n'est PAS démontré

Les points suivants restent ouverts et ne doivent pas être présentés comme acquis :

1. Le succès d'une requête Replay v4 avec les paramètres d'un événement réel de la sonnette.
2. La validité de la signature reconstruite auprès du serveur Wyze.
3. Le raccordement effectif du chemin Ktor à `WyzeEventNet.u()`. Ce sont deux chemins identifiés, mais leur relation exacte n'est pas établie.
4. La compatibilité opérationnelle entre les ressources KVS v3 observées dans les événements et le endpoint Replay v4.
5. La forme exacte et le contenu de la valeur `data` d'une réponse positive réelle.
6. La durée de validité d'une éventuelle URL de replay.
7. Le mécanisme exact de récupération des octets vidéo une fois l'URL obtenue.
8. Le format réel des données vidéo récupérées : fichier direct, fragments, manifeste ou autre mécanisme.
9. La reconstruction complète et la validation d'un MP4 à partir d'une vidéo Wyze réelle.
10. La possibilité d'effectuer l'ensemble du processus de manière autonome depuis SERVOR.

**Une analyse statique, même complète, ne démontre pas que le serveur acceptera la requête.**

### 23.7. Prochaine étape technique recommandée

La prochaine étape doit rester une analyse statique ciblée :

**Comparer précisément le chemin Ktor et le chemin `WyzeEventNet.u()` pour comprendre pourquoi l'application contient deux implémentations du même endpoint Replay v4 et déterminer laquelle est effectivement utilisée par le parcours de lecture vidéo.**

Travail attendu :
1. Repartir des callsites déjà identifiés dans le DEX.
2. Remonter les appels et les dépendances de chaque implémentation.
3. Identifier les conditions de sélection du chemin utilisé.
4. Comparer les paramètres, les en-têtes, la construction de la signature et le traitement de la réponse.
5. Identifier les différences qui pourraient expliquer des comportements distincts.
6. Déterminer si les deux chemins sont indépendants, alternatifs, complémentaires ou liés par une couche intermédiaire.
7. Consigner les preuves précises (fichier, classe, méthode, offset ou lignes) et distinguer les déductions des faits directement observés.

Ne pas lancer de requête réseau pour résoudre une incertitude statique tant que l'utilisateur n'a pas donné son accord.

### 23.8. Objectif opérationnel à terme

Une fois l'analyse statique suffisamment consolidée et après autorisation explicite de l'utilisateur, le parcours de validation pourra être envisagé par étapes :

1. Sélectionner un événement réel récent de `GW_BE1`.
2. Vérifier ses paramètres et ses ressources à partir des données déjà disponibles.
3. Préparer une requête Replay v4 conforme au comportement de l'application.
4. Effectuer, si autorisé, un unique test contrôlé et documenté.
5. Vérifier la réponse HTTP et son contenu sans publier de données sensibles.
6. Si une URL est renvoyée, déterminer le mécanisme de récupération vidéo et ses contraintes de validité.
7. Télécharger un seul clip, uniquement après validation explicite.
8. Vérifier le fichier avec `ffprobe`, puis contrôler son décodage.
9. Documenter les résultats avant d'envisager une automatisation.
10. Tester ensuite le stockage et l'archivage sur un emplacement de laboratoire, avant toute intégration à la production NAS.

Le premier objectif opérationnel est modeste mais décisif : **obtenir et valider une seule vidéo réelle de la Sonnette Grille.** L'automatisation et les autres caméras viennent après.

### 23.9. Protocole de reprise par un nouvel assistant

À chaque nouvelle session :

1. Lire intégralement la présente fiche §23.
2. Récupérer la version actuelle du rapport GitHub et relever son SHA.
3. Lire les dernières sections du rapport, en particulier §21 et §22, ainsi que les éventuelles sections ajoutées après cette fiche.
4. Comparer les conclusions récentes avec celles de cette fiche. En cas de contradiction, privilégier les preuves les plus récentes et les plus directement vérifiables.
5. Vérifier la présence des fichiers locaux nécessaires avant de demander à l'utilisateur de les rechercher.
6. Vérifier les empreintes des fichiers de preuve lorsqu'elles sont disponibles.
7. Identifier clairement la machine concernée avant de proposer une commande : Mac mini ou SERVOR.
8. Ne pas installer d'outil. Vérifier d'abord les outils déjà présents.
9. Présenter le constat actuel et proposer une seule commande ou une seule action à la fois.
10. Attendre le résultat de l'utilisateur avant de poursuivre.
11. Consigner toute nouvelle conclusion dans le rapport avec sa preuve, son niveau de certitude et ses limites.
12. Ne jamais prétendre qu'une opération réseau, un téléchargement ou une modification a été effectué si ce n'est pas le cas.

### 23.10. Principe directeur

La priorité est désormais de transformer les résultats de rétro-ingénierie en une récupération vidéo réelle, sans brûler les étapes.

Il faut avancer vers un premier téléchargement effectif, mais ne pas sacrifier la sécurité du compte Wyze, la stabilité du NAS ou la qualité des preuves pour aller plus vite.

**État au 28 novembre 2026 :** mécanisme de signature reconstitué statiquement ; chemins Replay v4 identifiés ; récupération réelle d'une vidéo non démontrée ; aucun nouveau test réseau autorisé par cette fiche.
