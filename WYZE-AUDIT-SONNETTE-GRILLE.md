

# Audit Wyze — Sonnette Grille

Document de référence technique — Projet d'archivage local des événements vidéo Wyze.

- **Statut global :** audit exploratoire en cours ; moteur MP4 validé sur médias synthétiques ; récupération d'un véritable clip Wyze non encore démontrée.
- **Dernière mise à jour :** 23 novembre 2026 — validation des phases 1 à 5 d'un moteur MP4 indépendant sur le Mac mini ; approfondissement de l'analyse statique d'Optimyze.
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
| Authentification Wyze | Validée pour les essais réalisés |
| Identification de la caméra pilote | Validée |
| Récupération des événements | Validée |
| Identification des ressources d'événements | Validée |
| Récupération Kinesis Replay | Échec HTTP 500 lors des trois essais |
| Téléchargement d'un clip Wyze | Non réalisé |
| Analyse statique d'Optimyze | Réalisée, avec limites documentées |
| Moteur MP4 indépendant, phases 1 à 5 | 25 tests réussis ; intégration DASH à étudier |
| Compatibilité avec les fragments DASH de SERVOR | À vérifier |
| Compatibilité avec des fragments Wyze réels | Non démontrée |
| Intégration à SERVOR | Non réalisée |

**Conclusion :** le travail d'analyse et le moteur MP4 indépendant ont progressé, mais la récupération effective et la reconstruction d'une vidéo Wyze restent les objectifs techniques à démontrer. Le projet demeure en phase expérimentale et aucune modification de production n'a été effectuée.

