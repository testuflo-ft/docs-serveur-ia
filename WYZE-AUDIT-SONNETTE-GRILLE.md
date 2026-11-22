# Audit Wyze — Sonnette Grille

Document de référence technique — Projet d'archivage local des événements vidéo Wyze.

- **Statut global :** audit exploratoire en cours ; moteur MP4 validé sur médias synthétiques ; récupération d'un véritable clip Wyze non encore démontrée.
- **Dernière mise à jour :** 22 novembre 2026 — consolidation de l'audit statique Optimyze.
- **NAS cible :** Synology SERVOR — DSM 7.4.1-90080 — x86_64.
- **Caméra pilote :** Wyze Video Doorbell Pro — « Sonnette Grille ».
- **Modèle :** GW_BE1.
- **Firmware et hardware :** valeurs précédemment relevées dans l'inventaire Wyze ; leur preuve brute expurgée n'est pas reproduite dans ce document.

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

Ces deux empreintes identifient précisément l'archive et le fichier JavaScript utilisés pour les constats de cette section.

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

Le script filtre les URL correspondant à :

- `/dash/vN/.../getMP4InitFragment`
- `/dash/vN/.../getMP4MediaFragment`
- `/dash/vN/.../getDASHManifest`
- `/dash/vN/.../getMPDManifest`

Les URL détectées sont communiquées à `content.js` par `window.postMessage`, avec le marqueur `__wyzeDownloader: "url"`.

Le script peut également demander au lecteur vidéo sa source actuelle via `currentSrc()` et transmettre cette information avec le marqueur `__wyzeDownloader: "src"`.

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

##### 4.3.4.9 Ce qui reste à démontrer pour Optimyze

- Le détail complet du mécanisme de récupération des fragments.
- La gestion des cookies et des credentials.
- Les conditions de renouvellement des URL temporaires.
- La possibilité de reproduire le mécanisme hors navigateur.
- La compatibilité avec la Sonnette Grille.
- La compatibilité future avec les Outdoor Cam.
- La possibilité de récupérer les clips sans session Web active.
- La robustesse du moteur sur des flux DASH réels et leurs éventuelles particularités.

Aucune installation ou connexion de compte Wyze via Optimyze n'est autorisée.

##### 4.3.4.10 Pièges liés aux fonctions homonymes dans le JavaScript minifié

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

Plusieurs appels autorisés ont été effectués sur une fenêtre d'événement réelle de la Sonnette Grille.

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
| 2 | Examiner les autres scripts de l'extension | Cartographie complète | Partiellement réalisé |
| 3 | Comparer Axios et Node natif hors réseau | Identifier les différences de requête | À faire |
| 4 | Étudier l'extraction indépendante du navigateur | Choisir une méthode | À faire |
| 5 | Valider le moteur MP4 sur médias synthétiques | Reconstruction audio/vidéo fidèle | **Validé pour le cas synthétique testé** |
| 6 | Documenter les fonctions homonymes de `content.js` | Extraction reproductible | **Inventaire et rôles principaux documentés ; portées complètes non formellement cartographiées** |
| 7 | Tester le moteur sur fragments Wyze réels | Compatibilité avec les médias de la caméra | À faire |
| 8 | Définir le modèle de sécurité | Architecture documentée | À faire |
| 9 | Concevoir le prototype isolé | Prototype non productif | À faire |
| 10 | Obtenir une ressource de lecture réelle et inspecter la réponse expurgée | URL et métadonnées comprises | À faire |
| 11 | Demander confirmation avant le téléchargement réel | Autorisation explicite | À faire |
| 12 | Télécharger un premier clip autorisé | Premier fichier récupéré | Non effectué |
| 13 | Vérifier MP4, son et intégrité | Lecture validée | À faire |
| 14 | Auditer le prototype | Risques identifiés et corrigés | À faire |
| 15 | Soumettre le déploiement à validation | Autorisation préalable | À faire |
| 16 | Installer le service sur SERVOR | Déploiement contrôlé | Non commencé |
| 17 | Construire l'interface de consultation | Archives accessibles | À faire |
| 18 | Réparer et diagnostiquer les Outdoor Cam | Éligibilité à l'intégration | En attente |
| 19 | Intégrer chaque Outdoor Cam séparément | Extension progressive | Non commencé |

Aucune étape ne doit être considérée comme validée sans résultat expérimental.

La validation synthétique du moteur MP4 ne remplace pas le test d'un véritable fichier Wyze.

---

## 12. Journal des avancées

### 22 novembre 2026 — Authentification et identification

1. Téléchargement et inspection statique de wyze-node 2.12.2, commit référencé `d556f1b`.
2. Identification des méthodes d'authentification et de lecture des événements.
3. Décision de ne pas utiliser la bibliothèque telle quelle en raison du stockage des jetons en clair.
4. Création d'une clé API Wyze personnelle et stockage local protégé.
5. Authentification réelle auprès de Wyze : HTTP 200, jetons obtenus.
6. Interrogation de `get_object_list` : HTTP 200.
7. Identification de la Sonnette Grille : GW_BE1.
8. Aucun conteneur ni changement de production.

### 22 novembre 2026 — Événements et ressources vidéo

1. Interrogation de `get_event_list` en lecture seule.
2. Réponses SUCCESS et événements associés à la Sonnette Grille.
3. Identification des ressources S3 JPEG et KVS Replay.
4. Vérification que la ressource S3 examinée est une image et non le clip vidéo.
5. Plusieurs appels autorisés à l'endpoint Kinesis Replay ont renvoyé HTTP 500 générique.
6. Aucun clip téléchargé.
7. Aucun événement marqué comme lu.
8. Décision de ne pas effectuer de nouvelle tentative Replay sans autorisation explicite.

### 22 novembre 2026 — Audit statique d'Optimyze

1. Téléchargement de l'archive CRX 0.5.1 depuis le service de distribution Chrome.
2. Vérification de l'en-tête CRX3 et calcul du SHA-256.
3. Extraction locale avec 7z.
4. Aucun script exécuté et extension non installée.
5. Analyse du manifeste : scripts injectés sur les pages Wyze, mondes MAIN et isolé.
6. Analyse de `inject.js` : interception de fetch et XHR, filtrage des URL DASH, communication via `window.postMessage`.
7. Analyse ciblée de `content.js` : association des URL aux cartes vidéo, stockage des URL de manifeste et fragments, construction des paramètres TrackNumber et SequenceNumber, récupération du manifeste et reconstruction MP4.
8. Conclusion provisoire : l'extension semble exploiter les requêtes de lecture déjà effectuées par Wyze Web View. La possibilité de reproduire ce mécanisme hors navigateur reste à démontrer.

### 22 novembre 2026 — Évolution du périmètre

Décisions complémentaires :

1. Le système devra gérer trois caméras à terme.
2. La Sonnette Grille reste la seule caméra autorisée pour les essais initiaux.
3. Les deux Outdoor Cam seront intégrées après réparation et autorisation.
4. Une interface Web de consultation des archives devient une exigence du projet.
5. L'interface devra intégrer calendrier, filtres, recherche, lecteur vidéo et téléchargement.
6. Le système final devra être autonome sur SERVOR.
7. Le Mac mini ne devra pas être une dépendance pour la consultation des archives.
8. Aucun déploiement ni changement de production n'est autorisé pendant la phase d'audit.

### 22 novembre 2026 — Extraction et validation synthétique du moteur MP4

1. Extraction isolée du moteur MP4 de `content.js`, sans installer ni exécuter l'extension.
2. Conservation du moteur original `optimyze-mp4-core.js`.
3. SHA-256 du moteur original : `65c2dba13b0738f5422dd07dcaa180ee2d98a13ed7ccd55c202e0adf6e35b9cf`.
4. Génération de médias DASH synthétiques avec une piste H.264 et une piste AAC.
5. Premier essai de reconstruction : détection d'une perte de l'edit list AAC, entraînant une trame audio supplémentaire au début.
6. Analyse des boîtes MP4 : le média de référence contenait une edit list avec `media_time=1024`.
7. Création d'une correction isolée prenant en charge les edit lists simples à vitesse 1,0.
8. Conservation du moteur original sans modification.
9. SHA-256 du moteur corrigé : `57961306d545a496821745a1c6fd917faf3889b4eaa8c1c96b74c2f25045e7ca`.
10. Vérification syntaxique Node.js du moteur corrigé et du script de test.
11. Reconstruction réussie du fichier `optimyze-rebuilt-editlist.mp4`.
12. Taille du fichier reconstruit : 1 934 631 octets.
13. FFprobe confirme deux pistes : H.264 640 × 360 et AAC 48 kHz mono.
14. Durée des deux pistes et du conteneur : 8 secondes.
15. Décodage FFmpeg 7 terminé sans erreur.
16. Inspection directe des boîtes MP4 : une edit list par piste, une entrée par liste, durée de présentation de 8000 ms ; `media_time=0` pour la vidéo et `media_time=1024` pour l'audio.
17. Comparaison des empreintes `framemd5` : 375 trames audio sur 375 identiques et 200 trames vidéo sur 200 identiques.
18. Conclusion : moteur corrigé validé sur le cas synthétique testé.
19. Aucune vidéo Wyze réelle utilisée ; aucune requête réseau Wyze effectuée pendant cette validation.
20. Aucune installation, modification de production ou modification de configuration SERVOR.

### 22 novembre 2026 — Relevé reproductible de content.js et fonctions homonymes

1. Localisation du fichier source original dans `/tmp/wyze-audit.hiRZRx/optimyze/extracted/src/content.js`.
2. Vérification de sa taille : 69 902 octets.
3. Calcul du SHA-256 : `ed6210d52a85cbe161581e54c09f574068462360f10efaefa43bf42aa4eb91e1`.
4. Confirmation du SHA-256 du CRX : `fd67487dd0f1c6fedf7db53e45a854656fa3b9c32eb6bccb67ec0da33a57438e`.
5. Relevé de 79 déclarations de fonctions nommées.
6. Identification de dix noms déclarés plusieurs fois : `a`, `c`, `g`, `h`, `l`, `m`, `n`, `o`, `p` et `u`.
7. Confirmation des deux déclarations `g()` aux offsets 2327 et 8441.
8. Identification de la première comme fonction de nommage de fichiers et de la seconde comme constructeur de la boîte MP4 `moov`.
9. Confirmation des deux déclarations `u()` aux offsets 1474 et 5036.
10. Identification de la première comme enveloppe d'opération de stockage asynchrone et de la seconde comme parseur du fragment d'initialisation MP4.
11. Relevé des contextes d'appel de ces fonctions.
12. Mise en évidence de la nécessité de distinguer les déclarations, les appels et les identifiants locaux réutilisés.
13. Correction de la méthode de comptage des occurrences : les offsets des déclarations et des occurrences de nom ne commençaient pas au même caractère.
14. Extension de l'inventaire aux huit autres noms répétés, avec offsets, signatures et rôles identifiés à partir des extraits.
15. Conclusion : l'identification d'une fonction minifiée doit être faite par signature, corps, contexte, appels et portée lexicale, jamais par son seul nom.

---

## 13. Point de reprise

**Prochaine tâche : préparer le premier essai avec un véritable événement de la Sonnette Grille, après validation de la version consolidée du présent document.**

Priorités :

1. Conserver les fichiers du laboratoire MP4, les deux moteurs et leurs empreintes SHA-256.
2. Poursuivre l'analyse statique d'Optimyze et vérifier les fonctions restantes de récupération des fragments.
3. Si nécessaire, approfondir la cartographie des portées lexicales des dix groupes de fonctions homonymes.
4. Comparer hors réseau les requêtes Axios de wyze-node avec le script Node natif.
5. Déterminer comment obtenir les ressources de lecture DASH réellement utilisées par Wyze Web View.
6. Préparer l'inspection expurgée d'une ressource réelle, sans afficher d'URL signée ni de jeton.
7. Vérifier que les fragments réels sont compatibles avec le parseur et le moteur MP4 corrigé.
8. Demander une confirmation explicite avant tout téléchargement effectif du clip.
9. Après téléchargement autorisé, vérifier le conteneur, les pistes, le son, la durée et l'intégrité du fichier.
10. Définir ensuite l'architecture du prototype isolé.

Ne pas :
- installer Optimyze ;
- effectuer de nouvel appel à l'endpoint Kinesis Replay sans autorisation explicite ;
- télécharger un clip sans confirmation après inspection de la ressource ;
- appeler `markEventsRead()` ;
- modifier les paramètres ou le firmware des caméras ;
- intégrer les Outdoor Cam ;
- modifier les services de production de SERVOR.

La prochaine validation recherchée est la compatibilité du moteur corrigé avec les fragments d'un véritable événement de la Sonnette Grille. La réussite du test synthétique ne doit pas être présentée comme une preuve de cette compatibilité.

---

## 14. Maintenance du document

Ce fichier est le référentiel cumulatif du projet Wyze.

À chaque reprise :

- consulter ce document avant de poursuivre ;
- reprendre au dernier point de reprise ;
- préserver les observations précédemment validées ;
- distinguer les faits, hypothèses et décisions ;
- mettre à jour le tableau d'état et le journal ;
- ne jamais publier de secret, jeton, URL signée ou donnée de session ;
- ne jamais déclarer une étape validée sans résultat expérimental ;
- ne modifier la production qu'après autorisation explicite ;
- conserver les moteurs expérimentaux et leurs empreintes afin de pouvoir reproduire les tests.

### Statut global

**Audit en cours.**

| Domaine | État |
|---|---|
| Authentification Wyze | Validée |
| Identification de la Sonnette Grille | Validée |
| Lecture des événements cloud | Validée |
| Identification des ressources KVS | Validée |
| Endpoint Replay | HTTP 500, cause inconnue |
| Analyse statique d'Optimyze | Première phase réalisée |
| Empreinte et identification du content.js | Validées |
| Inventaire des fonctions homonymes | Réalisé pour les déclarations nommées |
| Cartographie exhaustive des portées lexicales | Non réalisée |
| Extraction du moteur MP4 | Réalisée |
| Reconstruction MP4 synthétique | Validée pour le cas testé |
| Préservation des edit lists simples | Validée pour le cas testé |
| Identité des trames audio et vidéo synthétiques | Validée |
| Extraction autonome des vidéos Wyze réelles | Non démontrée |
| Compatibilité avec les fragments réels Wyze | À tester |
| Interface d'archives | Spécifications fonctionnelles définies, non développée |
| Outdoor Cam | En attente de réparation |
| Téléchargement d'un clip réel | Non effectué |
| Déploiement sur SERVOR | Non commencé |
