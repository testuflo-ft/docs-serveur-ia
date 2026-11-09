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
Accès utilisateur
       |
       v
     Homer
       |
       v
Home Assistant
       |
       +------ communication locale ------ A113W
       |
       +------ communication locale ------ second programmateur
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
- API HTTP locale et mode point d'accès.
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
- Ne pas interroger le contrôleur ou le serveur distant pendant l'analyse statique.
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

### 2.2 APK et décompilation

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

### 2.3 Répertoire source utilisé dans les commandes

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

## 6. API HTTP distante

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

### 6.2 Endpoints identifiés

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

Le code définit également :

```java
SM_DEVICE_FEEDBACK = "http://%s/feedback?NTP=%s&TIMEZONE=%s";
SM_IDENTIFY_DEVICE = "http://%s/TYPE_BRAND";
```

Ces deux URL suggèrent l'existence d'échanges HTTP locaux avec un appareil, mais leur utilisation effective reste à analyser.

Un client ID est codé en dur :

`SQCTYatBMdZtDIBanpwS`

Sa fonction exacte devra être documentée à partir de ses références.

### 6.3 Enregistrement du programmateur

Fichier :

`task/UploadDeviceTask.java`

Appel observé :

```java
HttpUtil.getInstance().post(
    HttpUrlUtil.genUploadDeviceUrl(),
    HttpUrlUtil.genUploadDeviceContent(mac, name, timezone),
    PreferenceHelper.INSTANCE.getLoginToken(),
    true
);
```

Le JSON construit par `genUploadDeviceContent()` contient :

```json
{
  "mac": "...",
  "name": "...",
  "timezone": "..."
}
```

Constats :

- POST vers `user/uploadDevice`.
- Transmission de la MAC.
- Transmission du nom.
- Transmission du fuseau horaire.
- Transmission du jeton utilisateur.

Les valeurs `ip` et `bssid` reçues par MQTT ne sont pas transmises explicitement dans cet appel.

### 6.4 Lecture et écriture de configuration

`GetDeviceSettingTask.java` :

- GET sur `31/v1/app/{MAC}/config`.
- Transmission du jeton utilisateur.
- Jusqu'à trois tentatives.
- Traitement particulier d'une réponse de 129 octets.

`SetDeviceSettingTask.java` :

- POST sur le même endpoint.
- Transmission de `mSetting`.
- Transmission du jeton utilisateur.
- Journalisation de la valeur envoyée avec le tag `setDeviceSettingTask`.

Autres tâches identifiées :

- `GetDeviceListTask.java` : lecture de la liste des appareils.
- `ChangeDeviceNameTask.java` : modification du nom d'un appareil.

**INTERPRÉTATION :** l'application utilise une API HTTP(S) distante pour gérer la liste des appareils et lire ou modifier leur configuration.

Cela ne prouve pas que les commandes doivent nécessairement passer par ce serveur : l'API locale reste à examiner.

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

### 7.10 DeviceListResponse : en-tête et taille des enregistrements

Fichier :

`task/DeviceListResponse.java`

Le constructeur procède notamment ainsi :

```java
int headSize = Device.INSTANCE.getHeadSize();
byte[] bArr = new byte[headSize];
System.arraycopy(bytes, i, bArr, 0, headSize);

IOHeader header = DataParserV2.getHeader(bArr);

int headSize2 = Device.INSTANCE.getHeadSize() + i;
int totalSize = Device.INSTANCE.getTotalSize();
byte[] bArr2 = new byte[totalSize];
System.arraycopy(bytes, headSize2, bArr2, 0, totalSize);

Device deviceConvertDevice = DataParserV2.convertDevice(bArr2);
```

Constantes observées dans `Device.java` :

- `headSize = 40`
- `totalSize = 128`

Le code :

- Copie 40 octets d'en-tête.
- Appelle `DataParserV2.getHeader()`.
- Copie ensuite 128 octets.
- Passe ces 128 octets à `DataParserV2.convertDevice()`.

`DataParserV2.convertDevice()` construit le Device à partir des 128 octets utiles. Il ne traite pas le checksum.

**FAITS DÉMONTRÉS :**

- `headSize` vaut 40.
- `totalSize` vaut 128 dans `Device`.
- `DeviceListResponse` copie 40 octets d'en-tête puis 128 octets de données utiles.
- `Device.getData()` reconstruit 129 octets avec checksum.
- `DataResult` traite séparément le checksum à l'offset 128.

Le découpage 128/129 est donc déjà expliqué par la distinction entre les données utiles et leur checksum.

**POINT RESTANT À VÉRIFIER :**

- La valeur de `IOSprinklerData.SPRINKLE_DATA_SIZE`.
- La longueur et le pas exacts des enregistrements parcourus par `DeviceListResponse`.
- La façon dont le checksum est présent ou non dans ce flux particulier.

Cette question porte sur le format global des enregistrements et leur pas de parcours, pas sur la distinction entre 128 et 129 octets.

Ne pas réintroduire la distinction 128/129 comme une incohérence non résolue.

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

Ces deux mécanismes de checksum ne doivent pas être confondus.

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

## 9. Architecture des communications et dépendance au cloud

### 9.1 Couches actuellement démontrées

| Couche | Fonction observée | État de preuve |
|---|---|---|
| MQTT distant | Découverte et appairage Wi-Fi | Démontré |
| HTTP(S) distant | Enregistrement, liste des appareils, lecture/écriture de configuration | Démontré |
| Structure binaire V2 | Représentation de la configuration | Démontré |
| HTTP local | Endpoints suggérés par les constantes | Non vérifié |
| BLE | Bibliothèques et classes présentes | Non vérifié |

### 9.2 Ce que l'on sait de la dépendance au fabricant

Le code examiné montre que l'application utilise le serveur distant pour :

- L'authentification utilisateur.
- L'enregistrement des appareils.
- La récupération de la liste des appareils.
- La lecture de configuration.
- L'écriture de configuration.

Cela établit une dépendance de l'application à des services distants pour les opérations examinées.

Cela ne démontre pas que le programmateur lui-même exige le serveur pour exécuter ses programmes ou accepter des commandes locales.

### 9.3 Question centrale encore ouverte

Il faut découvrir si l'application sait communiquer directement avec le programmateur sur le LAN ou en mode point d'accès, sans passer par les endpoints cloud.

Les constantes suivantes sont des pistes :

```java
SM_DEVICE_FEEDBACK = "http://%s/feedback?NTP=%s&TIMEZONE=%s";
SM_IDENTIFY_DEVICE = "http://%s/TYPE_BRAND";
```

Les classes suivantes doivent être examinées :

- `HttpAPUrl.java`
- `GetApDeviceSettingTask.java`
- `SetApDeviceSettingTask.java`
- `HttpHelper.java`
- `HttpUtil.java`
- `SprinklerCommand.java`

Il faudra identifier les adresses IP utilisées, les méthodes HTTP, les corps de requête et les réponses attendues.

**Aucune autonomie locale complète n'est encore démontrée.**

---

## 10. Points restant à examiner et ordre de reprise

### Priorité 1 — Format global des enregistrements

- [x] `Device.java` : constantes, tailles, découpage et reconstruction.
- [x] `DataResult.java` : marqueur et checksum.
- [x] `IOBody.java` : ancien `BODY_SIZE=129`, configuration de 6 octets et checksum textuel modulo 128.
- [x] `IOHeader.java` : en-tête de 40 octets, champs 20/12/8.
- [x] `DataParser.java` : ancien parseur, commandes sur 9 octets.
- [x] `DataParserV2.java` : nouveau parseur, commandes sur 8 octets.
- [x] Distinction entre 128 octets de données V2 et 129 octets avec checksum.
- [ ] `IOSprinklerData.java` : valeur exacte de `SPRINKLE_DATA_SIZE`.
- [ ] Confirmer le pas exact des enregistrements parcourus par `DeviceListResponse`.
- [ ] Vérifier comment le checksum est traité dans le flux de liste des appareils.

### Priorité 2 — Commandes locales et réseau

- [ ] `GetApDeviceSettingTask.java`.
- [ ] `SetApDeviceSettingTask.java`.
- [ ] `HttpAPUrl.java`.
- [ ] `HttpHelper.java`.
- [ ] `HttpUtil.java`.
- [ ] `SprinklerCommand.java`.
- [ ] Références à `SM_DEVICE_FEEDBACK`.
- [ ] Références à `SM_IDENTIFY_DEVICE`.
- [ ] Identifier les IP et ports locaux.
- [ ] Relier les méthodes d'interface aux tâches HTTP locales.
- [ ] Déterminer si les commandes d'arrosage utilisent HTTP local, BLE ou un autre mécanisme.

### Priorité 3 — Programmation et états

- [x] `NormalTimer.java` : structure et conversions principales.
- [x] `SpecialTimer.java` : structure et conversions principales.
- [x] Correspondance des jours de semaine.
- [ ] `Schedule.java`.
- [ ] `DeviceTimer.java`.
- [ ] `DeviceCommand.java`.
- [ ] `IOSprinklerData.java`.
- [ ] Signification des six octets `ScheduleSetting`.
- [ ] Valeurs et enums des huit octets `Command`.
- [ ] Relations entre programmes et canaux/vannes.
- [ ] Signification exacte des modèles de programme spécial.

### Priorité 4 — Bluetooth

- [ ] `BLEService.java`.
- [ ] UUID des services et caractéristiques.
- [ ] Format des messages BLE.
- [ ] Commandes et réponses.
- [ ] Relation entre BLE et configuration Wi-Fi.
- [ ] Déterminer si BLE est une voie de commande ou seulement de provisionnement.

### Priorité 5 — Authentification et dépendances cloud

- [ ] Références à `setServerDomain()` dans l'ensemble de l'APK.
- [ ] Chaînes d'URL et adresses IP dans les ressources.
- [ ] Authentification et gestion des jetons.
- [ ] Dépendance effective au serveur distant.
- [ ] Vérifier si une session ou un jeton obtenu initialement est indispensable au pilotage local.
- [ ] Déterminer le comportement en cas d'indisponibilité du serveur fabricant.

### Priorité 6 — Compatibilité matérielle

- [x] Valeurs logicielles de `Product.java`.
- [ ] Identifier l'identifiant produit réel de l'A113W.
- [ ] Comparer A101W et A113W.
- [ ] Identifier les variantes de protocole par modèle.
- [ ] Déterminer les fonctions communes et spécifiques.
- [ ] Vérifier la compatibilité du second programmateur.

### Priorité 7 — Faisabilité Home Assistant

Cette étape ne commencera qu'après compréhension suffisante du protocole local.

- [ ] Identifier le protocole local réellement utilisable.
- [ ] Définir les opérations de lecture et d'écriture.
- [ ] Définir une représentation fiable des états et programmes.
- [ ] Étudier une intégration Home Assistant locale.
- [ ] Prévoir une gestion de deux programmateurs.
- [ ] Définir le comportement en cas de perte du réseau ou de Home Assistant.
- [ ] Préserver l'exécution autonome des programmes enregistrés dans les programmateurs, si le matériel le permet.
- [ ] Étudier l'accès distant via l'infrastructure existante et l'entrée Homer.

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
| 09/11/2026 | `DeviceListResponse.java` | Parsing d'un en-tête de 40 octets suivi de 128 octets utiles ; pas global des enregistrements encore à confirmer |

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

Autres éléments :

- `enums/Product.java`
- `DeviceType.java`
- `task/DeviceListResponse.java`
- `mqtt/MQTTHelper.java`
- `utility/HttpUrlUtil.java`

### 12.2 Découvertes essentielles

1. L'ancien et le nouveau modèle partagent les zones de 48 octets d'information, 66 octets de timers et 6 octets de configuration.
2. L'ancien parseur utilise neuf octets de commandes.
3. Le parseur V2 utilise huit octets de commandes.
4. L'ancien `IOBody` expose `BODY_SIZE=129` et un checksum textuel modulo 128.
5. Le modèle V2 contient 128 octets de données utiles et ajoute un checksum en 129e position.
6. `DeviceListResponse` lit un en-tête de 40 octets puis 128 octets de données utiles.
7. La constante `IOSprinklerData.SPRINKLE_DATA_SIZE` et le pas global des enregistrements restent à vérifier.
8. Les six timers peuvent être normaux ou spéciaux.
9. L'ordre des jours est confirmé : lundi à dimanche, bits 0 à 6.
10. Les heures de `SpecialTimer` utilisent un encodage où chaque octet stocké vaut la valeur affichée augmentée de 1.
11. Les identifiants de produits logiciels sont connus, mais l'identifiant réel de l'A113W n'est pas encore établi.
12. MQTT est démontré pour la découverte et l'appairage, pas pour les commandes d'arrosage.
13. L'API HTTP distante de gestion et de configuration est démontrée.
14. Les chemins de communication locale restent à examiner.

### 12.3 Prochaine étape immédiate

**Examiner `IOSprinklerData.java` et la constante `SPRINKLE_DATA_SIZE`.**

Objectif : vérifier le pas des enregistrements parcourus par `DeviceListResponse` et déterminer comment le flux global associe :

- les 40 octets d'en-tête ;
- les 128 octets de données utiles ;
- le checksum éventuel ;
- les éventuels octets supplémentaires ou séparateurs entre les enregistrements.

La distinction entre les 128 octets utiles et les 129 octets avec checksum est déjà comprise. Il ne faut pas rouvrir cette question.

Commande préparée :

```bash
SRC="$HOME/Sprinkler-JADX/sources/com/ioshop/sprinkler"

echo "========== IOSPRINKLERDATA =========="

cat "$SRC/data/IOSprinklerData.java"
```

**Procédure :** exécuter uniquement cette commande, attendre le résultat, puis l'analyser avant de décider de la suivante.

### 12.4 Étape suivante après vérification du pas des enregistrements

Reprendre l'investigation réseau locale :

1. `HttpAPUrl.java`.
2. `GetApDeviceSettingTask.java`.
3. `SetApDeviceSettingTask.java`.
4. `SprinklerCommand.java`.
5. `HttpHelper.java` et `HttpUtil.java`.

L'objectif est de suivre une commande depuis l'action dans l'application jusqu'à la méthode qui effectue réellement l'échange réseau.

Ne pas envoyer de commande au programmateur pendant cette phase.

---

## 13. Référence GitHub et continuité du projet

Dépôt :

https://github.com/testuflo-ft/docs-serveur-ia

Fichier de référence :

https://github.com/testuflo-ft/docs-serveur-ia/blob/main/SPRINKLER-REVERSE-ENGINEERING.md

Branche :

`main`

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
