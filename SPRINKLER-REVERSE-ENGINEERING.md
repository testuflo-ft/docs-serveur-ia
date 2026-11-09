# Sprinkler — Reverse Engineering

**État du dossier :** 9 novembre 2026  
**Statut :** analyse statique de l'APK Android  
**Objectif :** comprendre les protocoles et les structures de données du programmateur Sprinkler afin d'étudier une intégration indépendante, notamment avec Home Assistant.

---

## 1. Objectif et règles de travail

L'objectif est de déterminer si le programmateur Sprinkler (notamment les modèles évoqués A101W et A113W) peut être piloté ou intégré sans dépendre exclusivement de l'application mobile ou du service cloud du fabricant.

Axes d'investigation :

- communication Wi-Fi et réseau local ;
- communication Bluetooth Low Energy (BLE) ;
- mécanisme de provisionnement Wi-Fi ;
- API HTTP distante et éventuelle API HTTP locale ;
- MQTT ;
- format binaire propriétaire de configuration ;
- commandes d'arrosage et programmation ;
- possibilité d'une intégration Home Assistant.

### Règles de sécurité

L'analyse doit rester non destructive.

- Ne pas modifier l'APK original.
- Ne pas modifier l'application installée sur le téléphone.
- Ne pas envoyer de commandes au programmateur.
- Ne pas interroger le contrôleur ou le serveur distant pendant l'analyse statique.
- Ne pas modifier le réseau ou la configuration du programmateur.
- Privilégier les commandes de lecture seule sur les fichiers décompilés.
- Ne procéder à aucun changement sur un système en production sans validation explicite.

Les commandes d'investigation sont exécutées sur macOS, dans un terminal zsh.

La progression se fait une commande à la fois : chaque résultat est examiné avant de décider de la suite.

---

## 2. Environnement d'analyse

### Machine

- Mac mini Apple Silicon, configuration indiquée : M5 Pro, 64 Go de RAM, SSD 512 Go.
- Accès principalement par SSH.
- Système macOS.

### APK et décompilation

Répertoire de travail :

`~/Sprinkler-JADX`

Répertoire des sources décompilées :

`~/Sprinkler-JADX/sources`

Package propriétaire principal :

`com.ioshop.sprinkler`

Outil utilisé : JADX 1.5.6.

Inventaire déjà effectué :

- environ 10 422 fichiers Java ;
- environ 1 190 ressources ;
- 181 erreurs de décompilation signalées par JADX.

L'APK original est conservé séparément. Les analyses portent sur les fichiers décompilés.

---

## 3. Architecture logicielle identifiée

### Bibliothèques et composants tiers

Les bibliothèques suivantes ont été repérées dans l'application :

| Composant | Indice dans l'APK | Interprétation |
|---|---|---|
| ESP Touch | `com/espressif/iot/esptouch/` | Provisionnement Wi-Fi possible |
| Eclipse Paho MQTT | `org/eclipse/paho/client/mqttv3/` | Client MQTT |
| OkHttp | `okhttp3/` | Communications HTTP |
| Okio | `okio/` | Bibliothèque associée aux entrées/sorties réseau |

La présence de ces bibliothèques ne prouve pas à elle seule leur utilisation effective dans toutes les fonctions de l'application.

### Principales classes propriétaires identifiées

| Domaine | Classes |
|---|---|
| MQTT | `mqtt/MQTTHelper.java`, `mqtt/topic/Topic.java` |
| HTTP | `network/HttpHelper.java`, `network/NetworkMonitor.java`, `network/Response.java` |
| Commandes | `services/command/SprinklerCommand.java` |
| Bluetooth | `services/BLEService.java` |
| Parsing | `data/DataParser.java`, `data/DataParserV2.java` |
| Données appareil | `data/device/Command.java`, `Device.java`, `Info.java`, `DataResult.java` |
| Structure binaire | `data/IOBody.java`, `data/IOHeader.java` |
| Données et commandes | `data/DeviceCommand.java`, `DeviceInfo.java`, `DeviceTimer.java`, `IOSprinklerData.java` |
| HTTP et URL | `utility/HttpAPUrl.java`, `HttpUrlUtil.java`, `HttpUtil.java` |
| Appairage | `utility/DirectPairManager.java` |
| Tâches réseau | `task/HttpTask.java`, `GetDeviceListTask.java`, `GetDeviceSettingTask.java`, `SetDeviceSettingTask.java`, `GetApDeviceSettingTask.java`, `SetApDeviceSettingTask.java`, `UploadDeviceTask.java`, `LoginTask.java` |
| Programmation | `data/device/schedule/NormalTimer.java`, `SpecialTimer.java`, `types/Schedule` |
| Énumérations | `enums/HttpMethod.java`, `FunctionCommand.java`, `Product.java`, enums BLE et `ConnectState.java` |

Autres composants pertinents :

- `Presenter/DeviceWifiListPresenter.java`
- `Presenter/DeviceAddAPPresenter.java`
- `DeviceAddAPActivity.java`
- `DeviceAddActivity.java`
- `DeviceBleControllerActivity.java`
- `DeviceBleInfoActivity.java`
- `DeviceBleScheduleSettingActivity.java`
- `WifiListActivity.java`
- `SmartConfigList`
- `SettingWifiDialog`

Les classes de présentation et les ViewModels devront être étudiés pour relier les actions de l'interface aux commandes réseau réellement exécutées.

---

## 4. Manifest Android

Constats effectués dans le manifeste :

- `minSdkVersion="29"`
- `targetSdkVersion="36"`
- `android:usesCleartextTraffic="true"`

Permissions réseau et Wi-Fi observées :

- `ACCESS_WIFI_STATE`
- `INTERNET`
- `CHANGE_NETWORK_STATE`
- `ACCESS_NETWORK_STATE`
- `CHANGE_WIFI_MULTICAST_STATE`
- `CHANGE_WIFI_STATE`

Permissions Bluetooth observées :

- `BLUETOOTH`
- `BLUETOOTH_ADMIN` avec `maxSdkVersion="31"`
- `BLUETOOTH_ADVERTISE`
- `BLUETOOTH_SCAN`
- `BLUETOOTH_CONNECT`

Permissions de localisation également déclarées :

- `ACCESS_COARSE_LOCATION`
- `ACCESS_FINE_LOCATION`

Bluetooth et BLE sont déclarés comme fonctionnalités facultatives.

Une permission nommée `android.permission.BLUE` a également été observée. Son statut et sa fonction restent à vérifier.

**Interprétation :** l'application possède les autorisations nécessaires à plusieurs modes de communication, notamment Wi-Fi, réseau et Bluetooth. L'autorisation `usesCleartextTraffic` permet le trafic HTTP en clair, mais ne prouve pas que tous les échanges utilisent HTTP non chiffré.

---

## 5. MQTT : mécanisme de découverte et d'appairage

### 5.1 Client MQTT

Fichier :

`mqtt/MQTTHelper.java`

Éléments observés :

```java
new MqttClient(
    "tcp://210.61.46.162:2883",
    MqttClient.generateClientId(),
    null
);

Autres paramètres observés :
mqttClient.setTimeToWait(10000L);


Publication :
MqttMessage mqttMessage = new MqttMessage(content.getBytes());
mqttMessage.setQos(1);
mqttMessage.setRetained(true);


Souscription :
getMqttClient().subscribe(topic);


Constats :
- broker distant : 210.61.46.162 ;
- port : 2883 ;
- protocole déclaré : tcp:// ;
- identifiant client généré automatiquement ;
- aucune configuration d'identifiant ou de mot de passe visible dans le code examiné ;
- publications en QoS 1 ;
- publications avec retained=true.
L'absence d'identifiants dans cet extrait ne prouve pas qu'aucune authentification n'existe à un autre niveau.
5.2 Topic
Fichier :

mqtt/topic/Topic.java

Constante observée :
PAIR_INFO = "%s/IOShop/Pair";


La méthode genPairInfoTopic() renvoie ce motif.
5.3 Traitement des messages MQTT
Les deux classes suivantes contiennent une logique pratiquement identique :
- Presenter/DeviceWifiListPresenter.java
- Presenter/DeviceAddAPPresenter.java
La méthode setMQTTCallback() traite les messages reçus.

Éléments observés :
1. Lecture du contenu JSON du message.
2. Extraction de ip et bssid.
3. Ignorance du message si l'un de ces champs est vide.
4. Extraction de la première partie du topic avec topic.split("/")[0].
5. Cette première partie est utilisée comme adresse MAC présumée du matériel.
6. Création d'un nouveau JSON dans lequel ip et bssid sont vidés.
7. Republication du message sur le même topic.
8. Appel de postRegisterDevice(str).
9. Annulation du compte à rebours d'appairage.
La méthode postRegisterDevice(mac) lance UploadDeviceTask.

Le nom par défaut du matériel est construit à partir de pre_default_name et des quatre derniers caractères de l'adresse MAC. Le fuseau horaire local est également transmis.
5.4 Interprétation
Fait démontré : MQTT intervient dans le processus de découverte et d'appairage Wi-Fi.

Le message reçu fournit au minimum une adresse IP et un BSSID. Le code réutilise la première partie du topic comme identifiant MAC, puis déclenche l'enregistrement du matériel auprès du serveur.

Hypothèse : le BSSID correspond probablement au point d'accès Wi-Fi auquel le programmateur vient de se connecter.

Non démontré : MQTT transporte les commandes d'arrosage ou les paramètres de programmation. Aucun élément examiné ne permet encore de l'affirmer.

6. API HTTP distante
6.1 Configuration des URL
Fichier :

utility/HttpUrlUtil.java

Domaine par défaut :
TEST_SERVER_DOMAIN = "https://echo.ioshop.com.tw/LinkU/";


Variable de domaine :
mServerDomain = "";


Une méthode setServerDomain(String domain) permet de modifier cette valeur.

Les méthodes gen...Url() utilisent mServerDomain si celui-ci n'est pas vide, sinon le domaine par défaut.

À ce stade, aucune invocation de setServerDomain() n'a été trouvée dans la recherche effectuée sur le package propriétaire. Cette recherche devra être élargie à l'ensemble de l'APK et aux ressources.
6.2 Endpoints identifiés
Les chemins suivants sont définis dans HttpUrlUtil.java :
- user/login
- user/register
- user/reSendCertificationMail
- user/querypassword
- user/updatepassword
- auth/token
- user/registerPush
- 31/v1/app/devices/
- 31/v1/app/%1$s/name
- 31/v1/app/%1$s/config
- user/uploadDevice
Le code définit également :
SM_DEVICE_FEEDBACK = "http://%s/feedback?NTP=%s&TIMEZONE=%s";
SM_IDENTIFY_DEVICE = "http://%s/TYPE_BRAND";


Ces deux URL suggèrent l'existence d'échanges HTTP locaux avec un appareil, mais leur utilisation effective reste à analyser.

Un client ID est codé en dur :

SQCTYatBMdZtDIBanpwS

Sa fonction exacte devra être documentée à partir de ses références.
6.3 Enregistrement du programmateur
Fichier :

task/UploadDeviceTask.java

Appel observé :
HttpUtil.getInstance().post(
    HttpUrlUtil.genUploadDeviceUrl(),
    HttpUrlUtil.genUploadDeviceContent(mac, name, timezone),
    PreferenceHelper.INSTANCE.getLoginToken(),
    true
);


Le JSON construit par genUploadDeviceContent() contient :
{
  "mac": "...",
  "name": "...",
  "timezone": "..."
}


Constats :
- POST vers user/uploadDevice ;
- transmission de la MAC ;
- transmission du nom ;
- transmission du fuseau horaire ;
- transmission du jeton utilisateur.
Les valeurs ip et bssid reçues par MQTT ne sont pas transmises explicitement dans cet appel.
6.4 Lecture et écriture de configuration
GetDeviceSettingTask.java :
- GET sur 31/v1/app/{MAC}/config ;
- transmission du jeton utilisateur ;
- jusqu'à trois tentatives ;
- traitement particulier d'une réponse de 129 octets.
SetDeviceSettingTask.java :
- POST sur le même endpoint ;
- transmission de mSetting ;
- transmission du jeton utilisateur ;
- journalisation de la valeur envoyée avec le tag setDeviceSettingTask.
Les autres tâches identifiées :
- GetDeviceListTask.java : lecture de la liste des appareils ;
- ChangeDeviceNameTask.java : modification du nom d'un appareil.
Interprétation : l'application utilise une API HTTP(S) distante pour gérer la liste des appareils et lire ou modifier leur configuration.

7. Structure binaire de configuration : 129 octets
7.1 Longueur de réponse
Fichier :

task/GetDeviceSettingTask.java

Dans parseHttpResponse(response) :
- si response.getBytes().length == 129, la réponse est interprétée comme un DeviceSettingResponse ;
- sinon, la réponse est traitée comme un JSON SimpleTaskResponse.
La réponse binaire est soumise à une vérification de validité.
7.2 DeviceSettingResponse
Fichier :

data/DeviceSettingResponse.java

Le code :
- récupère les octets de la réponse ;
- alloue un tableau de taille IOBody.BODY_SIZE ;
- copie les octets dans ce tableau ;
- construit un objet DataResult.
La taille exacte de IOBody.BODY_SIZE reste à confirmer dans la classe IOBody.java.
7.3 DataResult
Fichier :

data/device/DataResult.java

Méthode getTempDevice() :
DataParserV2.convertDevice(this.data);


Méthode verifyCheckMark() :
this.data[127] == 83


Le marqueur attendu à l'offset 127 est donc 0x53, caractère ASCII S.

Méthode verifyCheckSum() :
- copie les 128 premiers octets ;
- calcule une somme sur ces octets ;
- applique un modulo 256 ;
- compare le résultat à l'octet d'offset 128.
Le code Java utilise des octets signés lors du calcul de la somme. La reproduction exacte de cet algorithme dans une implémentation indépendante devra respecter les conversions signées/non signées.

Faits démontrés :
- longueur attendue : 129 octets ;
- octet 127 : marqueur 0x53 ;
- octet 128 : checksum calculé à partir des 128 premiers octets, modulo 256 ;
- les données sont converties en structure Device par DataParserV2.
À vérifier :
- valeur de IOBody.BODY_SIZE ;
- correspondance exacte entre les 129 octets et les champs ;
- nature et rôle précis du marqueur ;
- reproduction exacte du checksum ;
- format utilisé pour l'écriture et construction de mSetting.

8. Analyse de DataParserV2.java
Fichier :

data/DataParserV2.java

La méthode convertDevice(byte[] input) découpe le tableau d'entrée en quatre zones successives :
1. Info
2. Schedule
3. ScheduleSetting
4. Command
Les tailles sont récupérées dynamiquement depuis les classes Device, Info et Command.

Le code construit ensuite un objet Device contenant ces différentes structures.
8.1 Zone Info
La méthode getInfo(byte[] input) découpe la zone d'information dans l'ordre suivant :
1. updateTime
2. voltage
3. intervalState
4. durationState
5. addIntervalTime
6. addDurationTime
7. spinnerStatus
8. specialIntervalTime
9. rainDropStatus
10. rainDropStopTime
11. voltageStatus
12. motorStatus
13. runStatus
14. nextSprinklingDiff
15. firmware
16. batteryMode
17. nextSprinklingDiffHigh
18. connectMode
19. productSerialNumber
Les tailles de ces champs sont définies dans data/device/Info.java.

Les noms suggèrent des informations de fonctionnement, de tension, d'état moteur, d'arrosage et de connexion. Leur interprétation exacte n'est pas encore établie.
8.2 Zone Schedule
La méthode getSchedule(Product product, byte[] input) parcourt la zone des programmes par blocs de taille Device.scheduleSize.

Chaque bloc commence par un octet de type, suivi d'un marqueur ou d'un champ de modèle.

Le code distingue deux structures :

Programme spécial

Si le deuxième octet du bloc vaut 83 (0x53, ASCII S), le programme est construit comme un SpecialTimer.

Les champs extraits sont :
1. modèle ;
2. semaines ;
3. heure de début ;
4. heure de fin ;
5. intervalle ;
6. durée.
Programme normal

Dans les autres cas, le programme est construit comme un NormalTimer.

Les champs extraits sont :
1. modèle ;
2. durée ;
3. temps d'arrosage.
Les tailles des champs sont définies dans :
- data/device/schedule/SpecialTimer.java
- data/device/schedule/NormalTimer.java
Le nombre exact de programmes et la signification de tous les octets restent à confirmer.
8.3 Zone ScheduleSetting
Après la zone des programmes, convertDevice() copie une zone de taille :

Device.getScheduleSettingSize()

Cette zone est conservée sous forme de tableau d'octets dans l'objet Device.

Sa structure interne reste à examiner.
8.4 Zone Command
La méthode getCommand(byte[] input) découpe la zone de commande dans l'ordre suivant :
1. stopSwitch
2. spinnerSwitch
3. rainDropSwitch
4. firmwareUpdate
5. wifiUpdate
6. batteryModeSwitch
7. sprinkleSwitch
8. checkMark
Les tailles sont définies dans data/device/Command.java.

Les noms suggèrent des commandes ou états liés à l'arrêt, à la rotation, à la pluie, au firmware, au Wi-Fi, au mode batterie et à l'arrosage. Leur sémantique opérationnelle doit être vérifiée dans les méthodes d'accès et les classes qui construisent les commandes.
8.5 Limite de l'analyse actuelle
DataParserV2 est un parseur : il montre comment les octets reçus sont découpés et transformés en objets.

Il ne démontre pas, à lui seul, comment l'application construit les octets destinés à être envoyés au programmateur.

La sérialisation inverse devra être recherchée dans les classes de commandes, de données et de timers.

9. Modèle provisoire des communications
Les éléments actuellement observés suggèrent trois couches distinctes :
Couche	Fonction observée	État de preuve
MQTT distant	Découverte et appairage Wi-Fi	Démontré
HTTP(S) distant	Enregistrement, liste des appareils, lecture/écriture de configuration	Démontré
Structure binaire de 129 octets	Représentation de la configuration du programmateur	Démontré

Deux autres voies restent à examiner :
- HTTP local / mode point d'accès ;
- Bluetooth Low Energy.
La présence de bibliothèques et de classes dédiées ne suffit pas à déterminer leur rôle exact ni leur disponibilité sur chaque modèle.

10. Points restant à examiner
Priorité 1 — Structure exacte des octets
- [ ] data/device/Device.java
- [ ] data/device/Info.java
- [ ] data/device/Command.java
- [ ] data/IOBody.java
- [ ] data/IOHeader.java
- [ ] tailles exactes des zones et offsets absolus ;
- [ ] valeur et calcul exact du checksum ;
- [ ] rôle des marqueurs 0x53.
Priorité 2 — Programmation de l'arrosage
- [ ] NormalTimer.java
- [ ] SpecialTimer.java
- [ ] Schedule.java
- [ ] DeviceTimer.java
- [ ] IOSprinklerData.java
- [ ] DeviceCommand.java
- [ ] construction et sérialisation des données écrites ;
- [ ] relation entre les programmes et les canaux/vannes.
Priorité 3 — Commandes
- [ ] SprinklerCommand.java
- [ ] méthodes de construction des commandes ;
- [ ] chemins d'appel depuis les ViewModels et Presenters ;
- [ ] signification des champs de la zone Command.
Priorité 4 — Réseau local
- [ ] GetApDeviceSettingTask.java
- [ ] SetApDeviceSettingTask.java
- [ ] HttpAPUrl.java
- [ ] HttpHelper.java
- [ ] HttpUtil.java
- [ ] endpoints locaux et mode point d'accès ;
- [ ] SM_DEVICE_FEEDBACK ;
- [ ] SM_IDENTIFY_DEVICE.
Priorité 5 — Bluetooth
- [ ] BLEService.java
- [ ] UUID des services et caractéristiques ;
- [ ] format des messages BLE ;
- [ ] commandes et réponses ;
- [ ] relation entre BLE et configuration Wi-Fi.
Priorité 6 — Provisionnement et configuration cloud
- [ ] utilisation réelle de ESP Touch ;
- [ ] références à setServerDomain() dans l'ensemble de l'APK ;
- [ ] chaînes d'URL et adresses IP dans les ressources ;
- [ ] authentification et gestion des jetons ;
- [ ] dépendance effective au serveur distant.
Priorité 7 — Compatibilité matérielle
- [ ] examiner Product.java ;
- [ ] identifier les variantes de protocole par modèle ;
- [ ] comparer A101W et A113W ;
- [ ] déterminer les fonctions communes et spécifiques.

11. Principes de documentation
Chaque nouvelle découverte doit être classée dans l'une de ces catégories :
- FAIT DÉMONTRÉ : directement établi par le code ou une observation reproductible.
- HYPOTHÈSE : interprétation plausible, mais pas encore confirmée.
- À VÉRIFIER : question ouverte ou information insuffisante.
Ne pas transformer une hypothèse en fait au fil des conversations.

Les résultats importants, les commandes exécutées et les chemins de fichiers doivent être conservés ici afin de permettre une reprise de l'analyse sans dépendre de l'historique ChatGPT.

Ce document constitue le référentiel technique cumulatif du projet.

12. Dernier état de l'analyse
Dernière classe examinée : data/DataParserV2.java

Dernière découverte : la configuration binaire de 129 octets est découpée en structures Info, Schedule, ScheduleSetting et Command.

Prochaine étape : lire les classes qui définissent les tailles des champs et les structures :
- data/device/Device.java
- data/device/Info.java
- data/device/Command.java
Commande préparée :
SRC="$HOME/Sprinkler-JADX/sources/com/ioshop/sprinkler"

for F in \
  data/device/Device.java \
  data/device/Info.java \
  data/device/Command.java
do
  echo
  echo "========== $F =========="
  sed -n '1,320p' "$SRC/$F"
done


Attendre et analyser le résultat avant toute nouvelle commande.

EOF
