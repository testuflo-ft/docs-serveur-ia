# Sprinkler — Reverse Engineering

**Dernière mise à jour :** 9 novembre 2026  
**Statut :** analyse statique de l'APK Android  
**Référentiel :** document cumulatif de référence du projet.

Objectif : comprendre les protocoles, les structures de données et les mécanismes de commande des programmateurs Sprinkler afin d'étudier une intégration locale et indépendante, notamment avec Home Assistant.

---

## 1. Objectif et règles de travail

### 1.1 Objectif fonctionnel

Le matériel étudié est le programmateur **A113W**. L'objectif à terme est d'étudier le pilotage de ce programmateur et d'un second programmateur depuis Home Assistant, sans dépendre obligatoirement de l'application mobile Sprinkler ni du serveur d'authentification du fabricant.

Architecture envisagée, sous réserve de faisabilité technique :

```text
Téléphone distant
       |
       v
   Tailscale
       |
       v
     Homer
       |
       v
Home Assistant
   (Mac mini)
       |
       | Wi-Fi domestique
       |
       +-------------------- A113W
       |
       +-------------------- second programmateur
```

Homer reste le portail d'accès. Home Assistant assure l'interface de commande et les automatisations.

L'accès distant doit pouvoir s'appuyer sur l'infrastructure réseau existante, sans faire transiter le trafic local par Tailscale lorsque les appareils communiquent directement sur le LAN.

**Cet objectif d'autonomie est une exigence à vérifier, pas une capacité acquise.**

Il faudra établir séparément :

1. Si l'authentification initiale peut être effectuée sans serveur du fabricant.
2. Si les commandes peuvent être envoyées directement au programmateur sur le réseau local.
3. Si les états et programmes peuvent être lus localement.
4. Si les programmes peuvent être créés et modifiés localement.
5. Si le fonctionnement reste possible en cas d'indisponibilité du serveur d'authentification.
6. Si Home Assistant peut assurer la gestion des deux programmateurs.
7. Si l'accès distant peut être assuré par l'infrastructure existante, sans dépendance au cloud du fabricant.

Il ne faudra jamais confondre une simple communication locale possible avec une autonomie complète : l'authentification, la lecture, la programmation et les commandes doivent être vérifiées séparément.

### 1.2 Axes d'investigation

- Communication Wi-Fi et réseau local.
- Communication Bluetooth Low Energy (BLE).
- Provisionnement Wi-Fi.
- API HTTP distante.
- API HTTP locale en mode point d'accès.
- API HTTP locale éventuelle en mode station.
- MQTT.
- Format binaire propriétaire de configuration.
- Commandes d'arrosage.
- Programmation normale et spéciale.
- Authentification et dépendances au serveur du fabricant.
- Possibilité d'une intégration Home Assistant.

### 1.3 Règles de sécurité

L'analyse doit rester non destructive.

- Ne pas modifier l'APK original.
- Ne pas modifier l'application installée sur le téléphone.
- Ne pas envoyer de commandes au programmateur pendant cette phase d'analyse.
- Ne pas effectuer de test réseau actif sur le programmateur pendant l'analyse statique.
- Ne pas modifier le réseau ou la configuration du programmateur.
- Privilégier les commandes de lecture seule sur les fichiers décompilés.
- Ne procéder à aucun changement sur un système en production sans validation explicite.
- Ne publier aucune modification GitHub sans validation explicite de l'utilisateur.

Les commandes d'investigation sont exécutées sur macOS, dans un terminal zsh.

La progression se fait une commande à la fois : chaque résultat est examiné avant de décider de la suite.

### 1.4 Convention de preuve

Chaque découverte doit être classée :

- **FAIT DÉMONTRÉ** : directement établi par le code ou une observation reproductible.
- **HYPOTHÈSE** : interprétation plausible, mais pas encore confirmée.
- **À VÉRIFIER** : question ouverte ou information insuffisante.

Ne pas transformer une hypothèse en fait au fil des conversations.

---

## 2. Environnement d'analyse

### 2.1 Machine

- Mac mini Apple Silicon, configuration indiquée : M5 Pro, 64 Go de RAM, SSD 512 Go.
- Accès principalement par SSH.
- Système macOS.

### 2.2 Configuration réseau réelle du Mac mini

Le Mac mini n'est pas relié au réseau domestique par Ethernet.

Sa configuration actuelle est :

- Wi-Fi : connexion au réseau domestique et à Internet.
- Ethernet : liaison directe avec le NAS Synology.
- NAS Synology : sa propre interface Ethernet est reliée au réseau local et à Internet.

Le NAS ne sert pas de hub Ethernet ni de passerelle pour le Mac mini.

**Conséquence pour l'architecture envisagée :** si les programmateurs sont connectés au Wi-Fi domestique en mode station et exposent une API locale sur ce réseau, le Mac mini pourrait communiquer avec eux par son interface Wi-Fi. Le NAS n'aurait pas à intervenir dans ces échanges.

Cette possibilité reste conditionnée à la disponibilité de l'API locale en mode station.

### 2.3 APK et décompilation

Répertoire de travail :

`~/Sprinkler-JADX`

Répertoire des sources décompilées :

`~/Sprinkler-JADX/sources`

Package propriétaire principal :

`com.ioshop.sprinkler`

Outil utilisé : JADX 1.5.6.

Inventaire déjà effectué :

- Environ 10 422 fichiers Java.
- Environ 1 190 ressources.
- 181 erreurs de décompilation signalées par JADX.

L'APK original est conservé séparément. Les analyses portent sur les fichiers décompilés.

### 2.4 Répertoire source utilisé dans les commandes

```bash
SRC="$HOME/Sprinkler-JADX/sources/com/ioshop/sprinkler"
```

---

## 3. Architecture logicielle identifiée

### 3.1 Bibliothèques et composants tiers

| Composant | Indice dans l'APK | Interprétation |
|---|---|---|
| ESP Touch | `com/espressif/iot/esptouch/` | Provisionnement Wi-Fi possible |
| Eclipse Paho MQTT | `org/eclipse/paho/client/mqttv3/` | Client MQTT |
| OkHttp | `okhttp3/` | Communications HTTP |
| Okio | `okio/` | Bibliothèque associée aux entrées/sorties réseau |

La présence de ces bibliothèques ne prouve pas à elle seule leur utilisation effective dans toutes les fonctions de l'application.

### 3.2 Principales classes propriétaires identifiées

| Domaine | Classes |
|---|---|
| MQTT | `mqtt/MQTTHelper.java`, `mqtt/topic/Topic.java` |
| HTTP | `network/HttpHelper.java`, `network/NetworkMonitor.java`, `network/Response.java` |
| Commandes | `services/command/SprinklerCommand.java` |
| Bluetooth | `services/BLEService.java` |
| Parsing | `data/DataParser.java`, `data/DataParserV2.java` |
| Données appareil | `data/device/Command.java`, `Device.java`, `Info.java`, `DataResult.java` |
| Structure binaire | `data/IOBody.java`, `data/IOHeader.java` |
| Anciennes structures | `data/DeviceCommand.java`, `DeviceInfo.java`, `DeviceTimer.java`, `IOSprinklerData.java` |
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

### 4.1 Permissions réseau et Wi-Fi

- `ACCESS_WIFI_STATE`
- `INTERNET`
- `CHANGE_NETWORK_STATE`
- `ACCESS_NETWORK_STATE`
- `CHANGE_WIFI_MULTICAST_STATE`
- `CHANGE_WIFI_STATE`

### 4.2 Permissions Bluetooth

- `BLUETOOTH`
- `BLUETOOTH_ADMIN` avec `maxSdkVersion="31"`
- `BLUETOOTH_ADVERTISE`
- `BLUETOOTH_SCAN`
- `BLUETOOTH_CONNECT`

### 4.3 Permissions de localisation

- `ACCESS_COARSE_LOCATION`
- `ACCESS_FINE_LOCATION`

Bluetooth et BLE sont déclarés comme fonctionnalités facultatives.

Une permission nommée `android.permission.BLUE` a également été observée. Son statut et sa fonction restent à vérifier.

**Interprétation :** l'application possède les autorisations nécessaires à plusieurs modes de communication, notamment Wi-Fi, réseau et Bluetooth. L'autorisation `usesCleartextTraffic` permet le trafic HTTP en clair, mais ne prouve pas que tous les échanges utilisent HTTP non chiffré.

---

## 5. MQTT et découverte du programmateur

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

mqttClient.setTimeToWait(10000L);

MqttMessage mqttMessage = new MqttMessage(content.getBytes());
mqttMessage.setQos(1);
mqttMessage.setRetained(true);

getMqttClient().subscribe(topic);
```

**FAITS DÉMONTRÉS :**

- Broker distant : `210.61.46.162`.
- Port : `2883`.
- Protocole déclaré : `tcp://`.
- Identifiant client généré automatiquement.
- Publications en QoS 1.
- Publications avec `retained=true`.
- Délai d'attente configuré à 10 secondes.

Aucune configuration d'identifiant ou de mot de passe n'est visible dans le code examiné. Cela ne prouve pas qu'aucune authentification n'existe à un autre niveau.

### 5.2 Topic

Fichier :

`mqtt/topic/Topic.java`

Constante observée :

```java
PAIR_INFO = "%s/IOShop/Pair";
```

La méthode `genPairInfoTopic()` renvoie ce motif.

### 5.3 Traitement des messages MQTT

Les deux classes suivantes contiennent une logique pratiquement identique :

- `Presenter/DeviceWifiListPresenter.java`
- `Presenter/DeviceAddAPPresenter.java`

La méthode `setMQTTCallback()` traite les messages reçus.

Éléments observés :

1. Lecture du contenu JSON du message.
2. Extraction de `ip` et `bssid`.
3. Ignorance du message si l'un de ces champs est vide.
4. Extraction de la première partie du topic avec `topic.split("/")[0]`.
5. Cette première partie est utilisée comme adresse MAC présumée du matériel.
6. Création d'un nouveau JSON dans lequel `ip` et `bssid` sont vidés.
7. Republication du message sur le même topic.
8. Appel de `postRegisterDevice(str)`.
9. Annulation du compte à rebours d'appairage.

La méthode `postRegisterDevice(mac)` lance `UploadDeviceTask`.

Le nom par défaut du matériel est construit à partir de `pre_default_name` et des quatre derniers caractères de l'adresse MAC. Le fuseau horaire local est également transmis.

### 5.4 Interprétation

**FAIT DÉMONTRÉ :** MQTT intervient dans le processus de découverte et d'appairage Wi-Fi.

Le message reçu fournit au minimum une adresse IP et un BSSID. Le code réutilise la première partie du topic comme identifiant MAC, puis déclenche l'enregistrement du matériel auprès du serveur.

**HYPOTHÈSE :** le BSSID correspond probablement au point d'accès Wi-Fi auquel le programmateur vient de se connecter.

**NON DÉMONTRÉ :** MQTT transporte les commandes d'arrosage ou les paramètres de programmation. Aucun élément examiné ne permet encore de l'affirmer.

---

## 6. API HTTP distante et enregistrement des appareils

### 6.1 Configuration des URL

Fichier :

`utility/HttpUrlUtil.java`

Domaine par défaut :

```java
TEST_SERVER_DOMAIN = "https://echo.ioshop.com.tw/LinkU/";
```

Variable de domaine :

```java
mServerDomain = "";
```

Une méthode `setServerDomain(String domain)` permet de modifier cette valeur.

Les méthodes `gen...Url()` utilisent `mServerDomain` si celui-ci n'est pas vide, sinon le domaine par défaut.

À ce stade, aucune invocation de `setServerDomain()` n'a été trouvée dans la recherche effectuée sur le package propriétaire. Cette recherche devra être élargie à l'ensemble de l'APK et aux ressources.

### 6.2 Endpoints distants identifiés

Les chemins suivants sont définis dans `HttpUrlUtil.java` :

| Endpoint | Fonction supposée d'après le nom |
|---|---|
| `user/login` | Connexion |
| `user/register` | Inscription |
| `user/reSendCertificationMail` | Renvoi de certification |
| `user/querypassword` | Récupération de mot de passe |
| `user/updatepassword` | Mise à jour du mot de passe |
| `auth/token` | Authentification / jeton |
| `user/registerPush` | Enregistrement des notifications |
| `31/v1/app/devices/` | Liste des appareils |
| `31/v1/app/%1$s/name` | Nom d'un appareil |
| `31/v1/app/%1$s/config` | Configuration d'un appareil |
| `user/uploadDevice` | Enregistrement d'un appareil |

Le code définit également deux URL locales :

```java
SM_DEVICE_FEEDBACK = "http://%s/feedback?NTP=%s&TIMEZONE=%s";
SM_IDENTIFY_DEVICE = "http://%s/TYPE_BRAND";
```

Ces URL sont utilisées pendant l'identification du programmateur lors de l'appairage. Leur rôle est détaillé à la section 9.

Un client ID est codé en dur :

`SQCTYatBMdZtDIBanpwS`

Sa fonction exacte devra être documentée à partir de ses références.

### 6.3 Enregistrement du programmateur : UploadDeviceTask

Fichier :

`task/UploadDeviceTask.java`

Le constructeur reçoit :

```java
UploadDeviceTask(
    Context context,
    String mac,
    String name,
    String timezone,
    IAsyncTaskResultCallback callback
)
```

La méthode `onDo()` exécute :

```java
HttpUtil.getInstance().post(
    HttpUrlUtil.genUploadDeviceUrl(),
    HttpUrlUtil.genUploadDeviceContent(
        this.mMac,
        this.mName,
        this.mTimeZone
    ),
    PreferenceHelper.INSTANCE.getLoginToken(),
    true
);
```

**FAITS DÉMONTRÉS :**

- POST vers `user/uploadDevice`.
- Transmission de la MAC.
- Transmission du nom.
- Transmission du fuseau horaire.
- Transmission du jeton utilisateur via `PreferenceHelper.INSTANCE.getLoginToken()`.
- Le paramètre `true` indique l'utilisation du corps JSON dans cette surcharge de `HttpUtil.post()`.

La réponse est transformée en `JSONObject`, puis traitée par `UploadDeviceResponse`.

La méthode `parseHttpResponse()` :

- récupère `getStatusCode()` ;
- appelle également `getProductID()` ;
- renvoie le statut.

En cas de succès, `onSuccess()` appelle le callback du Presenter.

En cas d'échec, `onFail(int status)` transmet le statut au callback.

**Point important :** l'adresse IP locale obtenue pendant ESPTouch n'est pas passée au constructeur de `UploadDeviceTask` et n'est pas transmise explicitement dans cet appel. Le `productID` est lu dans la réponse, mais son rôle ultérieur doit encore être étudié.

### 6.4 Lecture de configuration distante

Fichier :

`task/GetDeviceSettingTask.java`

Le code utilise :

```java
HttpUrlUtil.genAccessSettingUrl()
```

Cette méthode construit l'URL :

`31/v1/app/%1$s/config`

Le MAC est injecté dans le chemin.

La requête GET utilise le jeton :

`PreferenceHelper.INSTANCE.getLoginToken()`

La réponse est traitée de la façon suivante :

- si `response.getBytes().length == 129`, elle est interprétée comme une réponse binaire `DeviceSettingResponse` ;
- sinon, elle est traitée comme un JSON `SimpleTaskResponse`.

Le chemin de lecture distant est donc authentifié par Bearer token.

### 6.5 Écriture de configuration distante

Fichier :

`task/SetDeviceSettingTask.java`

Le Presenter construit les données avec :

```java
new String(device.getData(), StandardCharsets.UTF_8)
```

`Device.getData()` retourne 129 octets : les 128 octets de données V2 et le checksum.

Le chemin distant transmet ces données à `SetDeviceSettingTask`, qui utilise l'URL de configuration distante et le jeton de connexion.

La méthode exacte et le traitement de la réponse devront être conservés dans le suivi détaillé de cette classe.

### 6.6 Dépendance au cloud pour les fonctions examinées

`DeviceFunctionPresenter.getDeviceSetting()` :

1. lance `GetDeviceSettingTask` ;
2. récupère `tempDevice` à partir de la réponse ;
3. modifie la commande correspondant à la fonction demandée ;
4. appelle `setDeviceSetting(tempDevice)`.

`setDeviceSetting()` reconstruit les 129 octets et lance `SetDeviceSettingTask`.

`NewDeviceFunctionViewModel` distingue les chemins :

- si `device.isAp()` est vrai, il appelle `getDeviceDataFromAp()` ;
- si `device.isAp()` est faux, il utilise le chemin distant, notamment `presenter.setStopRun()` pour la fonction étudiée.

Le traitement des erreurs comporte un retour à la connexion en cas de statut 401.

**FAIT DÉMONTRÉ :** pour les fonctions examinées, l'application utilise un chemin local en mode AP et un chemin cloud lorsque `device.isAp()` est faux.

**À NE PAS GÉNÉRALISER :** cela ne prouve pas que toutes les fonctions de l'application utilisent exclusivement le cloud en mode station. Il faut encore examiner les autres chemins et les possibilités d'accès local.

---

## 7. Structures binaires : ancien format et format V2

### 7.1 Deux générations de classes de données

L'examen des fichiers montre deux ensembles de classes.

**Ancien modèle :**

- `DataParser.java`
- `IOBody.java`
- `IOHeader.java`
- `DeviceInfo.java`
- `DeviceTimer.java`
- `DeviceCommand.java`

**Modèle V2 :**

- `DataParserV2.java`
- `data/device/Device.java`
- `data/device/Info.java`
- `data/device/Command.java`
- `data/device/schedule/NormalTimer.java`
- `data/device/schedule/SpecialTimer.java`
- `data/device/DataResult.java`

Les deux modèles partagent plusieurs dimensions de données, mais diffèrent notamment dans la structure des commandes et le traitement du checksum.

Il ne faut pas supposer que les deux formats sont interchangeables.

### 7.2 Ancien modèle : IOBody

Fichier :

`data/IOBody.java`

Constantes :

```java
public static final int BODY_CONFIG_SIZE = 6;
public static final int BODY_SIZE = 129;
```

La classe contient :

- `DeviceInfo info`
- `List<DeviceTimer> timers`
- `byte[] bodyConfig`
- `DeviceCommand cmd`

Le constructeur reçoit ces quatre éléments.

`getBodyData()` concatène :

1. `info.getContent()`
2. Le contenu de chacun des timers.
3. `new String(getBodyConfig())`
4. `cmd.getContent()`

La méthode `calCheckSum()` effectue :

```java
public int calCheckSum() {
    int i = 0;

    for (char c : getBodyData().toCharArray()) {
        i += c;
    }

    return i % 128;
}
```

**FAITS DÉMONTRÉS :**

- `IOBody.BODY_SIZE = 129`.
- `IOBody.BODY_CONFIG_SIZE = 6`.
- L'ancien modèle assemble un bloc composé d'un objet d'information, d'une liste de timers, d'une configuration de six octets et d'un objet de commande.
- Le checksum de cette classe est calculé sur les caractères de la chaîne renvoyée par `getBodyData()`, modulo 128.
- `calCheckSum()` est un calcul distinct du checksum binaire du modèle V2.

La signification exacte de ce checksum ancien dans le transport reste à confirmer. Il ne faut pas le confondre avec l'octet de checksum V2.

### 7.3 Ancien modèle : DataParser

Fichier :

`data/DataParser.java`

#### `getHeader(byte[] input)`

Cette méthode copie :

- 20 octets à partir de l'offset 0.
- 12 octets à partir de l'offset 20.
- 8 octets à partir de l'offset 32.

Elle crée ensuite un objet `IOHeader`.

#### `getBody(byte[] input)`

Cette méthode découpe le tableau d'entrée de la façon suivante :

| Offset | Taille | Objet |
|---:|---:|---|
| 0 | 48 | `DeviceInfo` |
| 48 | 66 | Six `DeviceTimer` |
| 114 | 6 | `bodyConfig` |
| 120 | 9 | `DeviceCommand` |
| **Total** | **129** | |

Le parsing des commandes est effectué par `getDeviceCommand()`.

#### `getDeviceCommand(byte[] input)`

Cette méthode reçoit neuf octets et les distribue ainsi :

| Offset local | Taille | Champ |
|---:|---:|---|
| 0 | 1 | premier champ byte |
| 1 | 1 | deuxième champ byte |
| 2 | 1 | troisième champ byte |
| 3 | 2 | tableau de deux octets |
| 5 | 1 | champ byte |
| 6 | 1 | champ byte |
| 7 | 1 | champ byte |
| 8 | 1 | champ byte |

Le constructeur appelé est :

```java
new DeviceCommand(b, b2, b3, bArr, b4, b5, input[7], input[8]);
```

Des logs mentionnent notamment `sprinkle` et `saveMode`, mais leur sémantique complète reste à confirmer.

#### `getDeviceTimers(byte[] input)`

La méthode parcourt les 66 octets par pas de 11.

Pour chaque bloc :

- 1 octet d'activation.
- 3 octets de modèle.
- 3 octets de durée.
- 4 octets de temps d'arrosage.

Elle crée un `DeviceTimer`.

**FAITS DÉMONTRÉS :**

- L'ancien parseur utilise six blocs de 11 octets.
- Chaque timer ancien a une structure uniforme.
- L'ancien parseur réserve neuf octets aux commandes.
- La zone de configuration occupe six octets.
- La somme des quatre blocs est bien de 129 octets : 48 + 66 + 6 + 9.

### 7.4 Ancien modèle : IOHeader

Fichier :

`data/IOHeader.java`

Constantes :

```java
HEADER_IDLE_SIZE = 8;
HEADER_SIZE = 40;
MAC_SIZE = 12;
NAME_SIZE = 20;
```

La classe contient trois tableaux :

- `deviceName`
- `deviceMac`
- `config`

Le constructeur stocke les trois tableaux.

`DataParser.getHeader()` les découpe ainsi :

| Offset | Taille | Champ |
|---:|---:|---|
| 0 | 20 | `deviceName` |
| 20 | 12 | `deviceMac` |
| 32 | 8 | `config` |
| **Total** | **40** | |

Les méthodes Parcelable servent à transporter l'objet dans Android. Elles ne démontrent pas, à elles seules, le protocole réseau.

**FAIT DÉMONTRÉ :** l'ancien modèle possède un en-tête de 40 octets, composé de trois champs de 20, 12 et 8 octets.

Le sens des huit octets `config` reste inconnu.

### 7.5 Format V2 : longueur de la réponse et checksum

Fichier :

`task/GetDeviceSettingTask.java`

Dans `parseHttpResponse(response)` :

- Si `response.getBytes().length == 129`, la réponse est interprétée comme un `DeviceSettingResponse`.
- Sinon, la réponse est traitée comme un JSON `SimpleTaskResponse`.

Fichier :

`data/device/DataResult.java`

`getTempDevice()` appelle :

```java
DataParserV2.convertDevice(this.data);
```

`verifyCheckMark()` vérifie :

```java
this.data[127] == 83
```

Le marqueur attendu à l'offset 127 est donc `0x53`, caractère ASCII `S`.

`verifyCheckSum()` :

- Copie les 128 premiers octets.
- Calcule une somme sur ces octets.
- Applique un modulo 256.
- Compare le résultat à l'octet d'offset 128.

Le code Java utilise des octets signés lors du calcul de la somme. La reproduction exacte de cet algorithme dans une implémentation indépendante devra respecter les conversions signées/non signées.

### 7.6 Format V2 : structure des 128 octets de données

Fichiers examinés :

- `data/device/Device.java`
- `data/device/Info.java`
- `data/device/Command.java`

| Bloc | Offset de début | Taille | Offset de fin exclu |
|---|---:|---:|---:|
| Info | 0 | 48 | 48 |
| Schedule | 48 | 66 | 114 |
| ScheduleSetting | 114 | 6 | 120 |
| Command | 120 | 8 | 128 |
| Checksum | 128 | 1 | 129 |

**FAIT DÉMONTRÉ :** le modèle V2 contient 128 octets de données utiles. Un octet de checksum est ajouté à la suite, ce qui donne un bloc complet de 129 octets.

La distinction est donc la suivante :

- **128 octets** : données utiles du modèle V2.
- **129 octets** : données utiles suivies de leur checksum.

Ce ne sont pas deux formats contradictoires.

### 7.7 Device.setData()

La méthode `setData(byte[] data)` :

1. Copie 48 octets à partir de l'offset 0 dans un tableau destiné à `Info`.
2. Passe ce tableau à `DataParserV2.getInfo()`.
3. Copie 66 octets à partir de l'offset 48 dans un tableau destiné aux six programmes.
4. Passe ce tableau à `DataParserV2.getSchedule()`.
5. Copie 6 octets à partir de l'offset 114 dans `schedulesSetting`.
6. Copie 8 octets à partir de l'offset 120 dans un tableau destiné à `Command`.
7. Passe ce tableau à `DataParserV2.getCommand()`.

La méthode ne lit pas l'octet 128 du checksum.

### 7.8 Device.getData()

La méthode `getData()` :

1. Appelle `Info.toBytes()` pour reconstruire les 48 octets.
2. Alloue un tableau de 66 octets pour les programmes.
3. Parcourt la liste des programmes et copie chaque timer sérialisé sur 11 octets.
4. Ajoute les 6 octets de `schedulesSetting`.
5. Ajoute les 8 octets de `Command.toBytes()`.
6. Ajoute le résultat de `calculateCheckSum()`.

**FAIT DÉMONTRÉ :** `getData()` reconstruit 128 octets de données puis ajoute un octet de checksum. Le tableau retourné contient donc 129 octets.

### 7.9 Calcul du checksum V2

Fichier :

`data/device/Device.java`

Méthode :

`calculateCheckSum()`

Le code reconstruit les quatre blocs :

- `Info.toBytes()`
- Les 66 octets des six programmes.
- `schedulesSetting`.
- `Command.toBytes()`.

Il additionne ensuite les octets dans une variable Java de type `int` :

```java
int i5 = 0;

for (byte b : bArrPlus) {
    i5 += b;
}

return (byte) (i5 % 256);
```

Formule conceptuelle :

\[
C = \left(\sum_{i=0}^{127} b_i\right)\bmod 256
\]

**Attention à l'implémentation :** les éléments de type `byte` sont signés en Java. Lors de leur addition dans un `int`, les valeurs supérieures à 127 sont donc interprétées comme des valeurs négatives. Le calcul doit reproduire cette particularité, puis la conversion finale en `byte`.

Le checksum est ajouté après les 128 octets. Il n'est pas inclus dans sa propre somme.

### 7.10 IOSprinklerData et DeviceListResponse : format global des enregistrements

Fichiers :

- `data/IOSprinklerData.java`
- `task/DeviceListResponse.java`

Dans `IOSprinklerData.java` :

```java
public static final int SPRINKLE_DATA_SIZE = 169;
```

La classe `IOSprinklerData` est un conteneur Parcelable composé de :

- un `IOHeader` ;
- un `IOBody`.

Elle ne définit pas elle-même le découpage du flux réseau.

Dans `DeviceListResponse.java`, le constructeur exécute :

```java
byte[] bytes = result.getBytes();

for (int i = 0; i < bytes.length; i += IOSprinklerData.SPRINKLE_DATA_SIZE) {
    int headSize = Device.INSTANCE.getHeadSize();

    byte[] bArr = new byte[headSize];
    System.arraycopy(bytes, i, bArr, 0, headSize);

    int headSize2 = Device.INSTANCE.getHeadSize() + i;

    IOHeader header = DataParserV2.getHeader(bArr);

    int totalSize = Device.INSTANCE.getTotalSize();

    byte[] bArr2 = new byte[totalSize];
    System.arraycopy(bytes, headSize2, bArr2, 0, totalSize);

    Device deviceConvertDevice = DataParserV2.convertDevice(bArr2);
}
```

Constantes observées dans `Device.java` :

- `headSize = 40`
- `totalSize = 128`

Le constructeur parcourt donc la réponse par pas de 169 octets et extrait :

| Position dans chaque enregistrement | Taille | Traitement |
|---|---:|---|
| 0–39 | 40 octets | Copiés dans `IOHeader` |
| 40–167 | 128 octets | Copiés dans `Device` V2 |
| 168 | 1 octet | Non copié et non exploité par ce constructeur |
| **Total** | **169 octets** | Pas de parcours |

Après conversion, le code affecte au Device :

- le nom extrait du champ `deviceName` ;
- la MAC extraite du champ `deviceMac` ;
- la configuration issue du champ `config`.

Les chaînes du nom et de la MAC sont découpées sur le caractère `-` et le premier élément est conservé.

**FAITS DÉMONTRÉS :**

- `SPRINKLE_DATA_SIZE` vaut 169.
- `DeviceListResponse` parcourt le flux par pas de 169 octets.
- Chaque enregistrement commence par un en-tête de 40 octets.
- Les 128 octets suivants sont transmis à `DataParserV2.convertDevice()`.
- Le dernier octet de l'enregistrement, à l'offset local 168, n'est pas copié ni vérifié par ce constructeur.
- `Device.getData()` reconstruit séparément 129 octets, dont un checksum à l'offset 128.

**À NE PAS AFFIRMER :**

Le dernier octet de l'enregistrement de 169 octets n'est pas démontré comme étant le checksum V2. Le constructeur de `DeviceListResponse` ne le vérifie pas et ne permet pas d'en déterminer la fonction.

Il faut également noter que `result.getBytes()` utilise le charset par défaut de Java, et non explicitement `StandardCharsets.UTF_8`. Le traitement de l'encodage du flux de liste devra être vérifié dans la chaîne HTTP complète.

### 7.11 Conclusion sur les formats

Les deux modèles partagent les zones de 48 octets d'information, 66 octets de timers et 6 octets de configuration.

Ils diffèrent notamment sur la zone de commandes :

- Ancien parseur : 9 octets.
- Parseur V2 : 8 octets.

Dans le modèle V2 :

- 128 octets constituent les données utiles.
- L'octet à l'offset 128 est le checksum.
- Le bloc complet contient donc 129 octets.

Dans l'ancien modèle :

- `DataParser.getBody()` découpe 129 octets : 48 + 66 + 6 + 9.
- `IOBody.BODY_SIZE` vaut 129.
- `IOBody.calCheckSum()` calcule une somme des caractères modulo 128.

Pour le flux de liste des appareils :

- Un enregistrement occupe 169 octets.
- Le code exploite 40 octets d'en-tête et 128 octets de données V2.
- Le 169e octet n'est pas traité par `DeviceListResponse`.

Ces différents mécanismes ne doivent pas être confondus.

---

## 8. Analyse détaillée des structures V2

### 8.1 Classe Info : 48 octets

Fichier :

`data/device/Info.java`

La classe contient 19 tableaux d'octets. La méthode `toBytes()` utilise un `ByteBuffer` et place ces tableaux successivement, dans l'ordre suivant :

```java
byteBufferAllocate.put(this._updateTime);
byteBufferAllocate.put(this._voltage);
byteBufferAllocate.put(this._intervalState);
byteBufferAllocate.put(this._durationState);
byteBufferAllocate.put(this._addIntervalTime);
byteBufferAllocate.put(this._addDurationTime);
byteBufferAllocate.put(this._spinnerStatus);
byteBufferAllocate.put(this._specialIntervalTime);
byteBufferAllocate.put(this._rainDropStatus);
byteBufferAllocate.put(this._rainDropStopTime);
byteBufferAllocate.put(this._voltageStatus);
byteBufferAllocate.put(this._motorStatus);
byteBufferAllocate.put(this._runStatus);
byteBufferAllocate.put(this._nextSprinklingDiff);
byteBufferAllocate.put(this._firmware);
byteBufferAllocate.put(this._batteryMode);
byteBufferAllocate.put(this._nextSprinklingDiffHigh);
byteBufferAllocate.put(this._connectMode);
byteBufferAllocate.put(this._productSerialNumber);
```

| Offset dans Info | Taille | Champ |
|---:|---:|---|
| 0–9 | 10 | `_updateTime` |
| 10–12 | 3 | `_voltage` |
| 13–15 | 3 | `_intervalState` |
| 16–18 | 3 | `_durationState` |
| 19–21 | 3 | `_addIntervalTime` |
| 22–24 | 3 | `_addDurationTime` |
| 25 | 1 | `_spinnerStatus` |
| 26–28 | 3 | `_specialIntervalTime` |
| 29 | 1 | `_rainDropStatus` |
| 30–33 | 4 | `_rainDropStopTime` |
| 34 | 1 | `_voltageStatus` |
| 35 | 1 | `_motorStatus` |
| 36 | 1 | `_runStatus` |
| 37–40 | 4 | `_nextSprinklingDiff` |
| 41–43 | 3 | `_firmware` |
| 44 | 1 | `_batteryMode` |
| 45 | 1 | `_nextSprinklingDiffHigh` |
| 46 | 1 | `_connectMode` |
| 47 | 1 | `_productSerialNumber` |

Les offsets globaux correspondent aux mêmes valeurs, puisque `Info` commence à l'offset 0 du bloc V2.

**FAITS DÉMONTRÉS :**

- `Info` occupe 48 octets.
- Les 19 champs sont assemblés dans l'ordre indiqué.
- Les tableaux d'octets sont copiés directement dans le `ByteBuffer`.
- Aucun séparateur ni en-tête supplémentaire n'est ajouté par `Info.toBytes()`.

Les getters de `Info` convertissent plusieurs tableaux en valeurs métier : tension, durées, états, prochain arrosage, firmware, etc.

**À VÉRIFIER :**

- La représentation numérique de chaque champ.
- Le sens des bits et des valeurs d'état.
- L'éventuel encodage temporel.
- Les relations entre les champs et les variantes matérielles.
- Les correspondances avec les informations affichées dans l'application.

### 8.2 Identification des produits

Fichiers :

- `enums/Product.java`
- `DeviceType.java`
- `data/device/Info.java`

Valeurs observées dans `Product.java` :

| Produit logiciel | Identifiant |
|---|---|
| `ORIGINAL_701` | `"-"` |
| `NEW_701` | `"1"` |
| `VARIANT_701_A` | `"A"` |
| `VARIANT_701_B` | `"B"` |
| `P917` | `"7"` |
| `P108` | `"8"` |

`DeviceType.java` contient les mêmes valeurs.

`Info.getProductSerialNumber()` décode `_productSerialNumber` :

- `"1"` → `NEW_701`
- `"A"` → `VARIANT_701_A`
- `"B"` → `VARIANT_701_B`
- `"7"` → `P917`
- Toute autre valeur → `ORIGINAL_701`

**Anomalie démontrée :** l'identifiant `"8"` de `P108` n'est pas reconnu explicitement par cette méthode et tombe dans la branche `ORIGINAL_701`.

D'autres références à `P108` existent dans l'application, notamment dans `SprinkleTimeDialog`, `DeviceListAdapter`, des valeurs par défaut Bluetooth et `BLEList`.

Des références à `P917` et aux variantes A/B existent également dans les ViewModels et activités.

**À VÉRIFIER :**

- Pourquoi `P108` n'est pas reconnu explicitement dans `Info.getProductSerialNumber()`.
- Si cette méthode est ancienne ou incomplète.
- La correspondance entre les identifiants logiciels et les références commerciales.
- L'identifiant réellement transmis par l'A113W possédé par l'utilisateur.

**Important :** la possession d'un A113W est confirmée, mais le code examiné ne permet pas encore d'établir à quel identifiant `Product` ce modèle correspond.

### 8.3 Classe Schedule : 66 octets

La zone Schedule commence à l'offset 48 et occupe 66 octets.

Constantes :

- `Device.scheduleSize = 11`
- `Device.scheduleTotalSize = 66`

Il existe six emplacements de programme de 11 octets chacun.

La méthode `DataParserV2.getSchedule()` parcourt les 66 octets par pas de 11.

Pour chaque programme :

- `input[i]` est l'octet d'activation.
- Si `input[i + 1] == 83` (`0x53`, ASCII `S`), un `SpecialTimer` est créé.
- Dans les autres cas, un `NormalTimer` est créé.

La branche normale est sélectionnée pour toute valeur du deuxième octet différente de `83`. Cela ne démontre pas que toutes ces valeurs sont nécessairement `"N"`.

#### Programme spécial

La branche spéciale extrait :

1. Activation : 1 octet.
2. Modèle : 1 octet.
3. Semaines : 1 octet.
4. Heure de début : 2 octets.
5. Heure de fin : 2 octets.
6. Intervalle : 2 octets.
7. Durée : 2 octets.

Total : 11 octets.

#### Programme normal

La branche normale extrait :

1. Activation : 1 octet.
2. Modèle : 3 octets.
3. Durée : 3 octets.
4. Temps d'arrosage : 4 octets.

Total : 11 octets.

### 8.4 NormalTimer

Fichier :

`data/device/schedule/NormalTimer.java`

Constantes :

- `enabledSize = 1`
- `modelSize = 3`
- `durationTimeSize = 3`
- `sprinkleTimeSize = 4`

Constructeur :

```java
NormalTimer(
    int index,
    Product product,
    byte enabled,
    byte[] modelTime,
    byte[] durationTime,
    byte[] sprinkleTime
)
```

Valeurs par défaut observées :

- `defaultEnabledStatus = '-'`
- `defaultModelSetting = "---"`
- `defaultDredgingTime = "---"`
- `defaultSprinkleTime = DeviceTimer.DEFAULT_SPRINKLE_TIME`

Méthodes identifiées :

- `setModeTime(byte[] value)`
- `getExist()`
- `getEnabled()`
- `getDurationDayForWeek()`
- `getDurationDay()`
- `getWeeks()`
- `getDurationTime()`
- `getSprinkleTime()`
- `reset()`
- `setEnabled(boolean)`
- `toBytes()`

#### Activation

Les méthodes de NormalTimer établissent :

- `getExist()` renvoie vrai si `_enabled == 'Y'` ou `_enabled == 'N'`.
- `getEnabled()` renvoie vrai uniquement si `_enabled == 'Y'`.
- `setEnabled(true)` écrit `Y`.
- `setEnabled(false)` écrit `N`.
- `reset()` réinitialise l'état à `'-'`.

Il existe donc trois états :

| Valeur | Interprétation dans le code |
|---|---|
| `-` | Non défini / emplacement inexistant |
| `N` | Programme existant, désactivé |
| `Y` | Programme activé |

#### Modèle et jours

`isWeekModel()` examine le premier caractère de `_modelTime` :

- Si le premier caractère est `D`, le programme est en mode durée.
- Sinon, il est interprété comme un modèle hebdomadaire.

En mode durée :

- Le caractère 1 est lu par `getDurationDayForWeek()`.
- Le caractère 2 est lu par `getDurationDay()` et converti en entier.

En mode hebdomadaire :

- Les deux caractères qui suivent le premier sont lus comme une valeur hexadécimale lorsqu'elle est valide.
- Si la chaîne hexadécimale n'est pas valide, la méthode renvoie 0.

`setWeeks(int week)` transforme les sept bits en une liste de sept indicateurs.

Le modèle hebdomadaire observé est de la forme `Wxx`, où `xx` est une valeur hexadécimale.

#### Durée

Pour `Product.P917` :

- Les trois octets ASCII sont interprétés comme une valeur hexadécimale.
- Si l'entier obtenu est inférieur à 2048, il est multiplié par 10 secondes puis converti en heures, minutes et secondes.
- Sinon, 2048 est soustrait, puis la valeur est décodée en minutes et secondes, les heures étant calculées par division par 60.
- Le format retourné est `HH:MM'SS`.

Pour les autres produits :

- Les deux premiers caractères sont suivis d'une apostrophe puis du troisième caractère et d'un zéro.

`setDurationTime(String)` écrit directement les octets UTF-8 de la chaîne.

#### Temps d'arrosage

`getSprinkleTime()` lit quatre caractères ASCII et renvoie `HH:MM`.

#### Sérialisation

`toBytes()` concatène :

- 1 octet activation.
- 3 octets modèle.
- 3 octets durée.
- 4 octets temps d'arrosage.

Total : 11 octets.

### 8.5 SpecialTimer

Fichier :

`data/device/schedule/SpecialTimer.java`

Constantes :

- `enabledSize = 1`
- `modelSize = 1`
- `weeksSize = 1`
- `startTimeSize = 2`
- `endTimeSize = 2`
- `intervalTimeSize = 2`
- `durationTimeSize = 2`

Constructeur :

```java
SpecialTimer(
    int index,
    Product product,
    byte enabled,
    byte model,
    byte weeks,
    byte[] startTime,
    byte[] endTime,
    byte[] intervalTime,
    byte[] durationTime
)
```

Valeurs par défaut :

- `defaultEnabledStatus = '-'`
- `defaultModelSetting = '-'`
- `defaultWeeks = '-'`
- `defaultStartTime = "--"`
- `defaultEndTime = "--"`
- `defaultInterval = "--"`
- `defaultDurationTime = "--"`

#### Activation

Même logique que `NormalTimer` :

- `getExist()` vrai si `_enabled == 'Y'` ou `_enabled == 'N'`.
- `getEnabled()` vrai uniquement si `_enabled == 'Y'`.
- `setEnabled(true/false)` écrit `Y` / `N`.
- `reset()` remet `_enabled` à `'-'`.

#### Modèle

`getModel()` renvoie la représentation décimale du byte `_model` via :

```java
String.valueOf((int) this._model)
```

La signification métier des valeurs du modèle reste à établir.

#### Semaines

`getWeeks()` convertit l'octet `_weeks` en sept indicateurs.

`setWeeks(int)` affecte directement le byte.

`convertToWeeks(int week)` renvoie une liste vide si `week == 0`, sinon sept indicateurs selon les masques :

- 1
- 2
- 4
- 8
- 16
- 32
- 64

#### Horaires

`getStartTime()`, `getEndTime()`, `getInterval()` et `getDuration()` lisent deux octets numériques et soustraient 1 à chaque octet pour produire `HH:MM`.

Les setters parsèment `HH:MM` et stockent l'heure et la minute augmentées de 1.

Exemple :

`06:30` → octets décimaux `7, 31`.

#### Sérialisation

`toBytes()` concatène :

- 1 octet activation.
- 1 octet modèle.
- 1 octet semaines.
- 2 octets heure de début.
- 2 octets heure de fin.
- 2 octets intervalle.
- 2 octets durée.

Total : 11 octets.

### 8.6 Correspondance des jours de semaine

Fichiers :

- `fragment/SprinklerWeekSelectPage.java`
- `fragment/NewSprinklerWeekSelectPage.java`

Dans `updateAll()`, l'ordre des jours est :

| Index | Jour | Bit |
|---:|---|---:|
| 0 | Monday | 0 |
| 1 | Tuesday | 1 |
| 2 | Wednesday | 2 |
| 3 | Thursday | 3 |
| 4 | Friday | 4 |
| 5 | Saturday | 5 |
| 6 | Sunday | 6 |

L'ancien écran `getTotalWeek()` utilise :

- Index 0 → 1.
- Index 1 → 2.
- Index 2 → 4.
- Index 3 → 8.
- Index 4 → 16.
- Index 5 → 32.
- Index 6 → 64.

L'entier est encodé en deux caractères hexadécimaux majuscules, préfixés par `W`.

Exemples :

- Lundi seul : `W01`.
- Lundi et mercredi : `W05`.
- Tous les jours : `W7F`.

`SpecialTimer` utilise directement un byte `_weeks`, avec le même ordre de bits.

**FAIT DÉMONTRÉ :** bit 0 = lundi, bit 1 = mardi, ..., bit 6 = dimanche.

Cette correspondance est confirmée par les deux écrans de sélection des jours et les méthodes de conversion des timers.

### 8.7 Zone ScheduleSetting : 6 octets

Cette zone commence à l'offset 114 et se termine à l'offset 119 inclus.

Elle est copiée directement dans :

`Device.schedulesSetting`

La méthode `Device.getData()` réinjecte ce tableau tel quel lors de la reconstruction.

**FAIT DÉMONTRÉ :** cette zone occupe six octets et est conservée séparément des objets Schedule.

**À VÉRIFIER :** structure interne et signification des six octets.

### 8.8 Classe Command : 8 octets

Fichier :

`data/device/Command.java`

La méthode `toBytes()` assemble huit tableaux d'un octet dans l'ordre suivant :

```java
byteBufferAllocate.put(this._runSwitch);
byteBufferAllocate.put(this._spinnerSwitch);
byteBufferAllocate.put(this._rainDropSwitch);
byteBufferAllocate.put(this._firmwareUpdate);
byteBufferAllocate.put(this._wifiUpdate);
byteBufferAllocate.put(this._batteryModeSwitch);
byteBufferAllocate.put(this._sprinkleSwitch);
byteBufferAllocate.put(this._checkMark);
```

| Offset dans Command | Offset global | Champ interne |
|---:|---:|---|
| 0 | 120 | `_runSwitch` |
| 1 | 121 | `_spinnerSwitch` |
| 2 | 122 | `_rainDropSwitch` |
| 3 | 123 | `_firmwareUpdate` |
| 4 | 124 | `_wifiUpdate` |
| 5 | 125 | `_batteryModeSwitch` |
| 6 | 126 | `_sprinkleSwitch` |
| 7 | 127 | `_checkMark` |

Valeurs par défaut observées :

| Champ | Valeur |
|---|---|
| `_runSwitch` | `N` |
| `_spinnerSwitch` | `N` |
| `_rainDropSwitch` | `L` |
| `_firmwareUpdate` | `N` |
| `_wifiUpdate` | `N` |
| `_batteryModeSwitch` | `-` |
| `_sprinkleSwitch` | `-` |
| `_checkMark` | 83 (`S`) |

Les valeurs textuelles sont encodées en UTF-8 dans les setters examinés.

**FAITS DÉMONTRÉS :**

- `Command` occupe huit octets.
- L'ordre des champs est celui du tableau ci-dessus.
- Le dernier octet est le marqueur `S` dans la valeur par défaut observée.
- L'octet global 127 est également vérifié par `DataResult.verifyCheckMark()`.

**À VÉRIFIER :**

- Les valeurs possibles de chaque champ.
- La signification opérationnelle des lettres et caractères.
- Les enums associés aux différents champs.
- Les méthodes et chemins d'appel qui construisent ces commandes.
- La différence éventuelle entre état courant et commande à envoyer.

Attention : les noms des champs ne suffisent pas à établir leur sémantique opérationnelle.

---

## 9. Communications locales, appairage et dépendance au cloud

### 9.1 Découverte de l'adresse IP par ESPTouch

Fichier :

`Presenter/DeviceAddPresenter.java`

La méthode `searchDevice(ssid, bssid, password)` lance `SmartConfigTask`, qui utilise la bibliothèque ESPTouch.

Le listener appelle :

```java
onEsptoucResultAddedPerform(result);
```

Cette méthode exécute :

```java
identifyDevice(
    result.getBssid(),
    result.getInetAddress().getHostAddress()
);
```

La méthode `identifyDevice(String mac, String ip)` reçoit donc :

- le BSSID, utilisé comme identifiant MAC dans ce chemin ;
- l'adresse IP découverte par ESPTouch.

### 9.2 Identification HTTP locale

Dans `identifyDevice()`, l'application effectue jusqu'à cinq tentatives.

Première requête :

```java
HttpUtil.getInstance().get(
    String.format(HttpUrlUtil.SM_IDENTIFY_DEVICE, ip)
).getString(HttpUrlUtil.SM_DEVICE_BRAND)
```

Les constantes de `HttpUrlUtil.java` sont :

```java
DS_DEVICE_BRAND = "LinkU";
SM_DEVICE_BRAND = "BRAND";
SM_IDENTIFY_DEVICE = "http://%s/TYPE_BRAND";
```

L'application vérifie que la valeur du champ JSON `BRAND` est égale à `LinkU`.

Deuxième requête :

```java
HttpUtil.getInstance().get(
    String.format(
        HttpUrlUtil.SM_DEVICE_FEEDBACK,
        ip,
        "",
        200
    )
).getInt(HttpUrlUtil.SM_STATUS_CODE)
```

Les constantes sont :

```java
SM_DEVICE_FEEDBACK =
    "http://%s/feedback?NTP=%s&TIMEZONE=%s";

SM_STATUS_CODE = "status_code";
```

L'application vérifie que `status_code` vaut 200.

**Correction importante :** le champ effectivement lu par le code est `status_code`, et non `status`.

### 9.3 Enregistrement distant après identification locale

Si les deux requêtes locales réussissent, `identifyDevice()` appelle :

```java
uploadDevices(
    mac,
    this.mActivity.getString(R.string.pre_default_name)
        + mac.substring(mac.length() - 4)
);
```

`uploadDevices()` construit un `UploadDeviceTask` avec :

- le contexte ;
- la MAC ;
- le nom ;
- le fuseau horaire ;
- le callback.

L'adresse IP n'est pas passée à `UploadDeviceTask`.

`UploadDeviceTask` transmet ensuite au cloud la MAC, le nom, le fuseau horaire et le jeton de connexion.

**FAITS DÉMONTRÉS :**

- ESPTouch fournit une adresse IP et un BSSID.
- L'application utilise l'adresse IP pour interroger directement le programmateur.
- `TYPE_BRAND` permet de vérifier la marque `LinkU`.
- `feedback` reçoit les paramètres NTP et de fuseau horaire.
- L'application vérifie `status_code == 200`.
- Après cette identification, l'application enregistre l'appareil auprès du serveur fabricant.
- L'adresse IP n'est pas transmise explicitement au constructeur de `UploadDeviceTask`.

**INTERPRÉTATION :** l'adresse IP est utilisée dans cette procédure pour identifier et vérifier localement le matériel. Le code examiné ne démontre pas qu'elle soit conservée pour le pilotage ultérieur.

### 9.4 Endpoints locaux du mode AP

Fichier :

`utility/HttpAPUrl.java`

Base :

`http://192.168.4.1`

Endpoints définis :

- `/typeAndMAC`
- `/connectType`
- `/SSIDPwd`
- `/stationInfo`
- `/property`
- `/TIME`
- `/Read128`
- `/GetHistory`

Les classes de présentation et tâches d'appairage utilisent ces chemins pour la configuration et l'identification du programmateur en mode point d'accès.

### 9.5 Lecture locale : /TIME

Fichier :

`task/GetApDeviceSettingTask.java`

Le chemin local de lecture utilise une requête POST vers `/TIME`.

Le corps JSON est construit sous la forme :

```json
{"TIME":"..."}
```

La chaîne temporelle inclut l'heure courante et le numéro du jour de semaine.

La réponse attendue est de 129 octets et passe par le traitement de `DataResult` :

- marqueur `S` à l'offset 127 ;
- checksum à l'offset 128.

Le chemin moderne correspondant est également présent dans `WifiDeviceRepo`.

### 9.6 Écriture locale : /Read128

Fichier :

`task/SetApDeviceSettingTask.java`

Le chemin local d'écriture utilise POST `/Read128`.

Le contenu est transmis avec le type MIME `application/octet-stream`.

Dans le chemin étudié, les données sont issues de `Device.getData()`, soit 129 octets : 128 octets utiles et un checksum.

La réponse est traitée comme un JSON de statut.

Le chemin moderne correspondant est également présent dans `WifiDeviceRepo`.

### 9.7 HttpHelper : appels locaux sans Bearer token

Fichier :

`network/HttpHelper.java`

La classe utilise OkHttp avec des délais de connexion, écriture et lecture de 30 secondes.

Méthodes observées :

- `getAp(url)` : GET sans header Authorization ajouté par cette méthode.
- `postAp(url, data, isJson)` : POST sans header Authorization ajouté par cette méthode.

La méthode `postAp()` accepte le contenu et le type de données, puis effectue la requête HTTP.

Seul le statut HTTP 200 est traité comme succès dans le chemin examiné. Les autres statuts sont convertis en échec.

La méthode `postAp()` journalise au niveau Debug :

- l'URL ;
- les données ;
- le type de contenu (`isJson`).

Le chemin moderne de `WifiDeviceRepo` utilise `network.HttpHelper`, notamment pour :

- `getApDeviceSetting()` : POST `/TIME` avec JSON ;
- `setApDeviceSetting()` : POST `/Read128` ;
- `getHistory()` : GET `/GetHistory`.

**FAIT DÉMONTRÉ :** ces méthodes clientes n'ajoutent pas de Bearer token HTTP.

Cela ne prouve pas que le firmware n'applique aucune authentification ou protection interne.

### 9.8 Ancien chemin HttpUtil

Fichier :

`utility/HttpUtil.java`

Les surcharges observées ne sont pas toutes équivalentes :

- `post(url, content)` : POST JSON sans Authorization.
- `post(url, content, tokenID, isJSON)` : ajoute `Authorization: Bearer <tokenID>`.
- `get`, `put` et `delete` : ajoutent un Bearer token dans les chemins examinés.

Les anciennes tâches AP n'utilisent pas toutes la même surcharge :

- `GetApDeviceSettingTask` utilise une surcharge à deux arguments sans authentification Bearer explicite.
- `SetApDeviceSettingTask` utilise une surcharge à quatre arguments avec un Bearer token vide.

Les appels modernes de `WifiDeviceRepo` passent par `network.HttpHelper`, et non par ces anciennes méthodes.

### 9.9 DirectPairManager et connexion au point d'accès

Fichier :

`utility/DirectPairManager.java`

La méthode `setUp(context, ssid, password, isHidden)` prépare la connexion Wi-Fi au point d'accès du programmateur.

Sur Android 10 et versions ultérieures, le code utilise `WifiNetworkSpecifier` avec SSID et mot de passe WPA2, puis :

```java
bindProcessToNetwork(network)
```

Le processus Android est ainsi associé au réseau du programmateur.

L'ancien chemin configure un `WifiConfiguration`.

Le gestionnaire traite le scan Wi-Fi, un délai d'attente de 10 secondes et les callbacks de connexion.

**Limite :** `DirectPairManager` ne récupère pas à lui seul l'adresse IP du programmateur.

### 9.10 Deux familles de communications locales identifiées

L'analyse a maintenant identifié deux familles d'URL HTTP locales :

**A. Endpoints utilisés pendant l'identification après ESPTouch :**

- `http://<IP>/TYPE_BRAND`
- `http://<IP>/feedback?NTP=...&TIMEZONE=...`

L'adresse IP est fournie par le résultat ESPTouch.

**B. Endpoints utilisés pour le pilotage local en mode AP :**

- `http://192.168.4.1/TIME`
- `http://192.168.4.1/Read128`
- `http://192.168.4.1/GetHistory`
- autres endpoints de configuration AP.

Ces deux familles ne doivent pas être confondues.

### 9.11 Question centrale : accès local en mode station

Le code prouve que l'application sait communiquer par HTTP avec l'adresse IP obtenue pendant ESPTouch.

Il prouve également l'existence d'une API locale utilisée en mode AP.

En revanche, il ne démontre pas encore que les endpoints de lecture et d'écriture (`/TIME`, `/Read128`, `/GetHistory`) sont accessibles lorsque le programmateur est connecté au Wi-Fi domestique en mode station.

Le comportement non-AP observé dans certaines fonctions passe par l'API cloud. Cela ne suffit pas à conclure que le firmware n'expose aucune API locale en mode station.

**À VÉRIFIER :**

1. Si le programmateur écoute sur son adresse IP du LAN en mode station.
2. Si `/TYPE_BRAND` et `/feedback` restent accessibles après le provisionnement.
3. Si `/TIME`, `/Read128` et `/GetHistory` répondent sur l'adresse IP du programmateur en mode station.
4. Si l'adresse IP est communiquée par MQTT, DHCP ou un autre mécanisme.
5. Si l'adresse IP peut être retrouvée durablement sans application mobile.
6. Si le programmateur possède une authentification ou un contrôle d'accès côté firmware.
7. Si l'API locale est limitée à l'interface AP.

Aucun test actif n'a été effectué sur le matériel pour répondre à ces questions.

### 9.12 Architecture réseau cible

La configuration réelle du Mac mini est compatible avec une architecture locale si l'API station existe :

```text
Téléphone distant
       |
       v
   Tailscale
       |
       v
     Homer
       |
       v
Home Assistant
   (Mac mini)
       |
       | Wi-Fi domestique
       |
       v
  Programmateurs
```

Le Mac mini possède :

- une connexion Wi-Fi au réseau domestique ;
- une liaison Ethernet directe au NAS.

Le NAS possède sa propre connexion Ethernet au réseau local. Il ne joue pas le rôle de hub entre le Mac mini et le réseau Wi-Fi.

Si les programmateurs sont en mode station et exposent leur API locale sur le LAN, le Mac mini pourrait les piloter par son Wi-Fi sans passer par le NAS.

Si l'API est uniquement disponible en mode AP, une autre solution devra être étudiée. Il ne faut pas supposer que le Mac mini puisse simultanément rester sur le Wi-Fi domestique et joindre le point d'accès isolé d'un programmateur avec une seule interface Wi-Fi.

### 9.13 Sécurité locale

Les appels locaux examinés utilisent HTTP en clair.

Le client Sprinkler n'ajoute pas d'authentification HTTP dans le chemin moderne AP de `HttpHelper`.

`postAp()` journalise les URL et les données au niveau Debug.

Le chemin `/Read128` transmet 129 octets de données d'appareil.

Le chemin `/TIME` transmet un JSON de synchronisation temporelle et attend une réponse binaire de 129 octets.

**FAITS DÉMONTRÉS :**

- Le client effectue des échanges HTTP locaux sans Bearer token dans les méthodes modernes AP.
- Les données de configuration sont transmises en clair dans ce chemin.
- L'application autorise le trafic en clair dans son manifeste.

**INCONNUES FIRMWARE :**

- Authentification interne.
- Segmentation réseau.
- Exposition des endpoints en mode station.
- Contrôles d'origine ou de source.
- Protection contre les requêtes répétées.
- Chiffrement et protection réels du point d'accès.
- Contrôle d'accès aux endpoints sur le réseau domestique.

Ne pas qualifier de vulnérabilité confirmée ou exploitable sans preuve.

**Recommandation d'architecture future :** si le firmware n'applique pas d'authentification, privilégier une isolation réseau et des ACL afin que Home Assistant soit le seul client autorisé. Ne pas exposer directement les endpoints du programmateur au LAN général ou à Internet.

---

### 9.14 Recherche réseau complémentaire : SSID, BSSID et adresse IP

Les classes suivantes ont été examinées :

- `network/NetworkMonitor.java`
- `utility/DirectPairManager.java`
- `utility/UtilityManager.java`
- `Presenter/DeviceAddPresenter.java`

#### `UtilityManager.java`

Les méthodes suivantes ont été identifiées :

- `getWifiSSID(Context)` : récupère le SSID via `WifiManager.getConnectionInfo()`.
- `getWifiConnectedSSID(Context)` : récupère le SSID si le téléphone est connecté à un réseau Wi-Fi.
- `getWifiConnectedBSSID(Context)` : récupère le BSSID du réseau Wi-Fi connecté.
- `isConnectToWifi(Context)` : vérifie que la connexion active est de type Wi-Fi.

**FAIT DÉMONTRÉ :** ces méthodes interrogent les informations de connexion Wi-Fi du téléphone. Elles ne récupèrent pas l'adresse IP du programmateur et ne réalisent pas de découverte de matériel sur le LAN.

#### `NetworkMonitor.java`

Cette classe surveille la connexion Wi-Fi du téléphone au moyen de `ConnectivityManager.registerNetworkCallback()`.

Lors des événements `onAvailable()` et `onLost()`, elle vérifie le SSID courant à partir de `WifiManager.getConnectionInfo().getSSID()` et le compare au SSID cible fourni au constructeur.

**FAIT DÉMONTRÉ :** `NetworkMonitor` surveille l'appartenance du téléphone à un réseau Wi-Fi identifié par son SSID. Il ne découvre pas les programmateurs, ne récupère pas leur adresse IP et n'envoie pas de requête HTTP à leur intention.

Le SSID cible est un paramètre générique. Son utilisation pour surveiller spécifiquement le point d'accès du programmateur dépend des appels à cette classe.

#### `DirectPairManager.java`

Cette classe utilise les mécanismes Android de scan Wi-Fi, notamment `WifiManager.startScan()` et `getScanResults()`, puis compare les SSID détectés au SSID recherché.

Sur Android 10 et versions ultérieures, elle utilise `WifiNetworkSpecifier` et `ConnectivityManager.bindProcessToNetwork()` pour associer le processus Android au réseau Wi-Fi sélectionné.

**FAIT DÉMONTRÉ :** cette classe détecte et rejoint un réseau Wi-Fi par son SSID. Elle ne constitue pas un mécanisme de découverte de l'adresse IP du programmateur sur le réseau domestique.

#### Recherche globale de mécanismes de découverte LAN

Une recherche dans les sources Java a porté notamment sur :

- `NsdManager` et les mécanismes NSD ;
- `InetAddress`, `getByName()` et `getAllByName()` ;
- `DatagramSocket` et `MulticastSocket` ;
- les mécanismes broadcast ;
- `255.255.255.255` ;
- les adresses locales fixes de type `192.168.1.x`.

Dans les sources examinées, le seul usage pertinent d'`InetAddress` retrouvé est la récupération de l'adresse IP fournie par le résultat ESPTouch dans `DeviceAddPresenter`.

Aucun mécanisme classique de découverte LAN par mDNS/NSD, UDP, multicast, broadcast ou balayage d'une plage IP n'a été identifié dans cette recherche.

Cette absence concerne uniquement les sources examinées de l'APK. Elle ne démontre pas l'absence de tels mécanismes dans le firmware du programmateur ou dans des composants qui n'auraient pas été couverts par la recherche.

#### Conséquence pour la question du mode station

Les éléments établissent désormais trois mécanismes distincts :

1. ESPTouch fournit une adresse IP pendant le provisionnement ; l'application l'utilise pour interroger `/TYPE_BRAND` et `/feedback`.
2. `DirectPairManager` et `NetworkMonitor` gèrent la connexion Wi-Fi du téléphone, essentiellement par SSID.
3. Les opérations de lecture et d'écriture de configuration observées utilisent l'API locale en mode AP, ou le chemin distant dans les fonctions non-AP examinées.

L'application ne fournit donc pas, dans les mécanismes étudiés, de preuve d'une découverte et d'un pilotage local permanent des programmateurs sur le LAN domestique.

**QUESTION TOUJOURS OUVERTE :** le firmware expose-t-il les endpoints locaux sur son adresse IP en mode station ? Seul un examen complémentaire du code ou, ultérieurement et avec autorisation, un test matériel contrôlé pourra répondre à cette question.

## 10. Points restant à examiner et ordre de reprise

### Priorité 1 — API locale et mode station

C'est désormais le point prioritaire, car il conditionne l'architecture Home Assistant envisagée.

- [x] Identifier les endpoints `/TYPE_BRAND` et `/feedback`.
- [x] Identifier la découverte de l'adresse IP par ESPTouch.
- [x] Confirmer que l'adresse IP n'est pas passée explicitement à `UploadDeviceTask`.
- [x] Identifier les endpoints AP `/TIME`, `/Read128` et `/GetHistory`.
- [x] Identifier les méthodes modernes `HttpHelper` utilisées pour les appels AP.
- [ ] Déterminer si les endpoints locaux sont accessibles en mode station.
- [ ] Identifier le mécanisme permettant de retrouver l'IP du programmateur sur le LAN.
- [ ] Déterminer si l'API locale en mode station est identique à l'API AP.
- [ ] Vérifier les éventuelles restrictions d'accès côté firmware.

### Priorité 2 — Commandes locales et réseau

- [x] `HttpAPUrl.java`.
- [x] `GetApDeviceSettingTask.java`.
- [x] `SetApDeviceSettingTask.java`.
- [x] `HttpHelper.java` : méthodes AP et absence de Bearer token.
- [x] `HttpUtil.java` : différences entre surcharges.
- [ ] `SprinklerCommand.java`.
- [ ] Relier toutes les méthodes d'interface aux tâches HTTP locales.
- [ ] Déterminer si les commandes d'arrosage utilisent HTTP local, BLE ou un autre mécanisme.
- [ ] Examiner les chemins locaux et cloud de chaque fonction.

### Priorité 3 — Format global et données

- [x] `Device.java` : constantes, tailles, découpage et reconstruction.
- [x] `DataResult.java` : marqueur et checksum.
- [x] `IOBody.java` : ancien `BODY_SIZE=129`, configuration de 6 octets et checksum textuel modulo 128.
- [x] `IOHeader.java` : en-tête de 40 octets, champs 20/12/8.
- [x] `DataParser.java` : ancien parseur, commandes sur 9 octets.
- [x] `DataParserV2.java` : nouveau parseur, commandes sur 8 octets.
- [x] Distinction entre 128 octets de données V2 et 129 octets avec checksum.
- [x] `IOSprinklerData.java` : constante `SPRINKLE_DATA_SIZE=169`.
- [x] `DeviceListResponse.java` : pas de parcours de 169 octets, extraction de 40 + 128 octets.
- [x] Identifier que le 169e octet n'est pas exploité par le constructeur.
- [ ] Déterminer la signification éventuelle du 169e octet à partir d'autres éléments du code ou de réponses déjà disponibles, sans test actif sur le matériel.
- [ ] Vérifier le traitement de l'encodage de la réponse de liste.

### Priorité 4 — Programmation et états

- [x] `NormalTimer.java` : structure et conversions principales.
- [x] `SpecialTimer.java` : structure et conversions principales.
- [x] Correspondance des jours de semaine.
- [ ] `Schedule.java`.
- [ ] `DeviceTimer.java`.
- [ ] `DeviceCommand.java`.
- [ ] Signification des six octets `ScheduleSetting`.
- [ ] Valeurs et enums des huit octets `Command`.
- [ ] Relations entre programmes et canaux/vannes.
- [ ] Signification exacte des modèles de programme spécial.

### Priorité 5 — Bluetooth

- [ ] `BLEService.java`.
- [ ] UUID des services et caractéristiques.
- [ ] Format des messages BLE.
- [ ] Commandes et réponses.
- [ ] Relation entre BLE et configuration Wi-Fi.
- [ ] Déterminer si BLE est une voie de commande ou seulement de provisionnement.

### Priorité 6 — Authentification et dépendances cloud

- [x] Domaine par défaut de l'API distante.
- [x] Endpoints distants de gestion et de configuration.
- [x] Transmission du Bearer token dans `UploadDeviceTask`.
- [x] Transmission du Bearer token dans le chemin de lecture de configuration distante.
- [ ] Références à `setServerDomain()` dans l'ensemble de l'APK.
- [ ] Chaînes d'URL et adresses IP dans les ressources.
- [ ] Authentification et gestion des jetons.
- [ ] Dépendance effective au serveur distant pour chaque fonction.
- [ ] Vérifier si une session ou un jeton obtenu initialement est indispensable au pilotage local.
- [ ] Déterminer le comportement en cas d'indisponibilité du serveur fabricant.

### Priorité 7 — Compatibilité matérielle

- [x] Valeurs logicielles de `Product.java`.
- [ ] Identifier l'identifiant produit réel de l'A113W.
- [ ] Comparer A101W et A113W.
- [ ] Identifier les variantes de protocole par modèle.
- [ ] Déterminer les fonctions communes et spécifiques.
- [ ] Vérifier la compatibilité du second programmateur.

### Priorité 8 — Faisabilité Home Assistant

Cette étape ne commencera qu'après compréhension suffisante du protocole local.

- [ ] Identifier le protocole local réellement utilisable en mode station.
- [ ] Définir les opérations de lecture et d'écriture.
- [ ] Définir une représentation fiable des états et programmes.
- [ ] Étudier une intégration Home Assistant locale.
- [ ] Prévoir une gestion de deux programmateurs.
- [ ] Définir le comportement en cas de perte du réseau ou de Home Assistant.
- [ ] Préserver l'exécution autonome des programmes enregistrés dans les programmateurs, si le matériel le permet.
- [ ] Étudier l'accès distant via l'infrastructure existante et l'entrée Homer.
- [ ] Définir les restrictions réseau et les règles d'accès aux endpoints locaux.

---

## 11. Journal des découvertes

| Date | Élément examiné | Résultat |
|---|---|---|
| 09/11/2026 | Manifest Android | Permissions réseau, Wi-Fi, Bluetooth et autorisation du trafic en clair identifiées |
| 09/11/2026 | Inventaire du package propriétaire | Classes MQTT, HTTP, BLE, parsing et programmation identifiées |
| 09/11/2026 | `MQTTHelper.java` | Broker `210.61.46.162:2883`, TCP, QoS 1, retained |
| 09/11/2026 | `Topic.java` | Topic d'appairage `%s/IOShop/Pair` |
| 09/11/2026 | Presenters Wi-Fi | Traitement MQTT des champs `ip` et `bssid`, puis enregistrement du matériel |
| 09/11/2026 | `HttpUrlUtil.java` | API distante et endpoints de configuration identifiés |
| 09/11/2026 | `UploadDeviceTask.java` | Enregistrement HTTP du matériel avec MAC, nom, fuseau horaire et jeton |
| 09/11/2026 | `GetDeviceSettingTask.java` | Réponse binaire de 129 octets reconnue |
| 09/11/2026 | `DataResult.java` | Marqueur à l'offset 127 et checksum à l'offset 128 |
| 09/11/2026 | `Device.java` | 128 octets de données utiles, checksum ajouté en 129e position |
| 09/11/2026 | `Device.java` | Calcul du checksum sur les 128 octets reconstruits |
| 09/11/2026 | `Info.java` | Ordre exact des 19 champs et offsets des 48 octets établis |
| 09/11/2026 | `Command.java` | Ordre exact des 8 champs et offsets globaux 120–127 établis |
| 09/11/2026 | `DataParserV2.java` | Parsing V2 des blocs Info, Schedule et Command examiné |
| 09/11/2026 | `NormalTimer.java` | Structure, activation, modèles et conversions de durée examinés |
| 09/11/2026 | `SpecialTimer.java` | Structure, activation, semaines et encodage horaire examinés |
| 09/11/2026 | Écrans de sélection des semaines | Correspondance des bits : lundi à dimanche |
| 09/11/2026 | `Product.java`, `DeviceType.java` | Identifiants logiciels des variantes identifiés ; correspondance A113W non établie |
| 09/11/2026 | `IOBody.java` | Ancien corps de 129 octets, configuration de 6 octets, checksum textuel modulo 128 |
| 09/11/2026 | `IOHeader.java` | En-tête ancien de 40 octets : nom 20, MAC 12, config 8 |
| 09/11/2026 | `DataParser.java` | Ancien parseur : Info 48, timers 66, config 6, commandes 9 |
| 09/11/2026 | `IOSprinklerData.java` | `SPRINKLE_DATA_SIZE=169`, conteneur Parcelable avec IOHeader et IOBody |
| 09/11/2026 | `DeviceListResponse.java` | Parcours par pas de 169 octets ; copie de 40 octets d'en-tête et 128 octets de données ; dernier octet non exploité |
| 09/11/2026 | `DeviceAddPresenter.java` | ESPTouch fournit BSSID et adresse IP ; interrogation HTTP locale pendant l'identification |
| 09/11/2026 | `HttpUrlUtil.java` | `/TYPE_BRAND` et `/feedback` ; marque attendue `LinkU` ; statut lu dans `status_code` |
| 09/11/2026 | `UploadDeviceTask.java` | POST cloud `user/uploadDevice`, MAC, nom, fuseau horaire et Bearer token ; lecture de `productID` dans la réponse |
| 09/11/2026 | `HttpAPUrl.java` | Endpoints locaux AP : `/typeAndMAC`, `/connectType`, `/SSIDPwd`, `/stationInfo`, `/property`, `/TIME`, `/Read128`, `/GetHistory` |
| 09/11/2026 | `HttpHelper.java` | Appels modernes AP sans Bearer token ajouté par le client ; délais de 30 secondes |
| 09/11/2026 | `HttpUtil.java` | Différences entre les surcharges HTTP avec et sans Bearer token |
| 09/11/2026 | `WifiDeviceRepo.java` | Chemins modernes locaux pour lecture `/TIME`, écriture `/Read128` et historique `/GetHistory` |
| 09/11/2026 | Configuration réseau Mac mini | Mac relié au réseau domestique en Wi-Fi et au NAS par Ethernet direct ; NAS relié séparément au LAN |
| 09/11/2026 | Analyse du chemin non-AP | Fonctions examinées utilisant le chemin cloud lorsque `device.isAp()` est faux ; disponibilité d'une API locale en station non démontrée |
| 09/11/2026 | `WifiDevice.java` et schéma Room | Entité `WifiDevice` et table `wifi_devices` : nom, MAC, SSID, mot de passe et données binaires ; aucun champ IP identifié |
| 09/11/2026 | `WifiDeviceDao_Impl.java` | Requêtes SQL de lecture, insertion, mise à jour et suppression ; aucune requête relative à une adresse IP |
| 09/11/2026 | `SprinklerDB_Impl.java` | Schéma SQLite examiné ; aucune colonne IP identifiée dans les tables étudiées |
| 09/11/2026 | `BaseDeviceViewModel$getDeviceDataFromAp$2.java` | Lecture AP : vérification `device.isAp()`, appel au dépôt local, extraction du champ JSON `response`, conversion en bytes puis parsing par `DataResult` |
| 09/11/2026 | `WifiDeviceRepo.java` | Lecture AP par POST `/TIME` avec JSON contenant l'heure et le jour courant ; écriture AP par POST `/Read128` |
| 09/11/2026 | `BaseDeviceViewModel$setDeviceDataToAp$2.java` | Écriture AP : envoi des données, contrôle du code de réponse, mise à jour du modèle et persistance locale après succès ; rollback en cas d'échec |
| 09/11/2026 | `NetworkMonitor.java` | Surveillance du SSID Wi-Fi courant ; aucune découverte IP ou requête au programmateur |
| 09/11/2026 | `DirectPairManager.java` | Scan et connexion à un réseau Wi-Fi par SSID ; aucune découverte de l'adresse IP du programmateur |
| 09/11/2026 | `UtilityManager.java` | Récupération du SSID et du BSSID du Wi-Fi connecté au téléphone ; aucune récupération de l'IP du programmateur |
| 09/11/2026 | Recherche réseau globale | Aucun mécanisme mDNS/NSD, UDP, multicast, broadcast ou balayage de plage IP identifié dans les sources Java examinées |
| 09/11/2026 | Synthèse réseau | L'IP ESPTouch est utilisée pendant l'identification ; aucune persistance de cette IP dans `wifi_devices` n'a été identifiée ; API locale station toujours non démontrée |
---

## 12. Dernier état de l'analyse et point de reprise

### 12.1 Dernières classes examinées

Ancien modèle :

- `data/IOBody.java`
- `data/IOHeader.java`
- `data/DataParser.java`

Modèle V2 :

- `data/DataParserV2.java`
- `data/device/Device.java`
- `data/device/Info.java`
- `data/device/Command.java`
- `data/device/DataResult.java`
- `data/device/schedule/NormalTimer.java`
- `data/device/schedule/SpecialTimer.java`

Communications :

- `mqtt/MQTTHelper.java`
- `mqtt/topic/Topic.java`
- `utility/HttpUrlUtil.java`
- `utility/HttpAPUrl.java`
- `utility/HttpUtil.java`
- `network/HttpHelper.java`
- `task/DeviceListResponse.java`
- `task/UploadDeviceTask.java`
- `Presenter/DeviceAddPresenter.java`

### 12.2 Découvertes essentielles

1. L'ancien et le nouveau modèle partagent les zones de 48 octets d'information, 66 octets de timers et 6 octets de configuration.
2. L'ancien parseur utilise neuf octets de commandes.
3. Le parseur V2 utilise huit octets de commandes.
4. L'ancien `IOBody` expose `BODY_SIZE=129` et un checksum textuel modulo 128.
5. Le modèle V2 contient 128 octets de données utiles et ajoute un checksum en 129e position.
6. `DeviceListResponse` parcourt les enregistrements par pas de 169 octets.
7. Pour chaque enregistrement, il exploite 40 octets d'en-tête et 128 octets de données V2.
8. Le 169e octet n'est pas exploité par le constructeur de `DeviceListResponse`. Sa fonction reste inconnue.
9. Les six timers peuvent être normaux ou spéciaux.
10. L'ordre des jours est confirmé : lundi à dimanche, bits 0 à 6.
11. Les heures de `SpecialTimer` utilisent un encodage où chaque octet stocké vaut la valeur affichée augmentée de 1.
12. Les identifiants de produits logiciels sont connus, mais l'identifiant réel de l'A113W n'est pas encore établi.
13. MQTT est démontré pour la découverte et l'appairage, pas pour les commandes d'arrosage.
14. ESPTouch fournit une adresse IP utilisée pour interroger le programmateur pendant son identification.
15. Les endpoints `/TYPE_BRAND` et `/feedback` sont utilisés en HTTP local pendant cette identification.
16. Après cette identification, `UploadDeviceTask` transmet au cloud la MAC, le nom et le fuseau horaire, avec un Bearer token. L'adresse IP n'est pas transmise explicitement.
17. L'application possède une API HTTP locale en mode AP, avec notamment `/TIME`, `/Read128` et `/GetHistory`.
18. Les appels modernes AP de `HttpHelper` n'ajoutent pas de Bearer token.
19. Les chemins de fonctions examinés utilisent le cloud lorsque `device.isAp()` est faux.
20. La disponibilité de l'API locale lorsque le programmateur est en mode station reste inconnue.
21. Le Mac mini est relié au réseau domestique par Wi-Fi et au NAS par Ethernet direct. Le NAS possède sa propre liaison Ethernet au réseau local.

### 12.3 Prochaine étape immédiate

Le volet de recherche statique sur la gestion Wi-Fi et la découverte réseau de l'application est désormais largement documenté.

Les classes examinées comprennent :

- `DeviceAddPresenter.java`
- `NetworkMonitor.java`
- `DirectPairManager.java`
- `UtilityManager.java`
- `WifiDevice.java`
- `WifiDeviceDao.java`
- `WifiDeviceDao_Impl.java`
- `SprinklerDB.java`
- `SprinklerDB_Impl.java`
- `WifiDeviceRepo.java`
- `BaseDeviceViewModel.java`
- `BaseDeviceViewModel$getDeviceDataFromAp$2.java`
- `BaseDeviceViewModel$setDeviceDataToAp$2.java`

**Constat principal :** aucun mécanisme de découverte permanente des programmateurs par adresse IP sur le LAN n'a été identifié dans les sources examinées. L'IP obtenue par ESPTouch sert à l'identification initiale, mais aucune persistance de cette IP dans la base SQLite étudiée n'a été trouvée.

La question prioritaire demeure l'exposition éventuelle de l'API locale en mode station.

Prochaine investigation :

1. Examiner les usages de `SprinklerCommand.java`.
2. Relier les commandes d'arrosage aux chemins HTTP, BLE ou cloud.
3. Rechercher les autres chemins non-AP dans les ViewModels et Presenters.
4. Examiner les éventuelles références à une adresse IP ou à un hôte dans les autres modèles de données et préférences.
5. Continuer à distinguer les limites de l'application Android de ce qui reste inconnu dans le firmware.

L'analyse reste strictement statique et en lecture seule. Aucun test actif sur le programmateur n'est autorisé à ce stade.

### 12.4 Étape suivante après l'analyse du mode station

1. Examiner les appels à `SprinklerCommand.java`.
2. Relier chaque fonction de commande à son chemin local ou distant.
3. Examiner les autres ViewModels et Presenters pour identifier d'éventuelles communications locales en mode station.
4. Étudier les classes BLE pour déterminer si BLE constitue une voie de commande indépendante.
5. Vérifier le traitement de l'adresse IP et de la MAC dans le modèle Device.
6. Examiner les références à `setServerDomain()` dans l'ensemble de l'APK.
7. Poursuivre l'analyse de l'authentification et des dépendances cloud.

Ne pas envoyer de commande au programmateur pendant cette phase.

---

## 13. Référence GitHub et continuité du projet

Dépôt :

https://github.com/testuflo-ft/docs-serveur-ia

Fichier de référence :

https://github.com/testuflo-ft/docs-serveur-ia/blob/main/SPRINKLER-REVERSE-ENGINEERING.md

Branche :

`main`

Dernière version de référence consultée avant cette révision :

- SHA : `79e86df358e507e88d24a3ff3c4d7aecc52e8365`
- Document : 1 630 lignes.
- Structure : 13 sections.

Ce document est le référentiel technique cumulatif du projet Sprinkler. Il doit être consulté lors de toute reprise du travail.

### Règle de sauvegarde

Les résultats ne doivent pas rester uniquement dans l'historique d'une conversation.

Lorsqu'une étape importante de l'analyse est terminée, mettre à jour ce fichier GitHub avant de poursuivre trop loin. Il faut éviter de repousser indéfiniment la documentation au profit de nouvelles investigations.

À chaque mise à jour :

- fournir le contenu intégral du fichier ;
- préserver les découvertes antérieures ;
- intégrer les nouveaux résultats ;
- actualiser le journal ;
- actualiser le point de reprise ;
- distinguer clairement les faits, hypothèses et questions ouvertes.

L'utilisateur colle lui-même le contenu dans l'éditeur GitHub et confirme lorsque la mise à jour est terminée. Ne pas prétendre avoir publié une modification si l'utilisateur ne l'a pas effectuée.

### Objectif final du projet

Déterminer si l'A113W et un second programmateur peuvent être pilotés localement, sans dépendance obligatoire à l'application et au serveur d'authentification du fabricant.

Si la faisabilité est démontrée, étudier une intégration Home Assistant et un accès depuis Homer, en conservant l'architecture réseau existante.

**Aucune autonomie complète, compatibilité Home Assistant ou indépendance vis-à-vis du cloud ne doit être annoncée avant validation technique.**
