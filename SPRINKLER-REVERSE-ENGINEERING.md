# Sprinkler — Reverse Engineering

**Dernière mise à jour :** 9 novembre 2026  
**Statut :** analyse statique de l'APK Android  
**Référentiel :** ce document est la source de référence du projet.

Objectif : comprendre les protocoles et les structures de données du programmateur Sprinkler afin d'étudier une intégration indépendante, notamment avec Home Assistant.

---

## 1. Objectif et règles de travail

L'objectif est de déterminer si le programmateur Sprinkler, notamment les modèles évoqués A101W et A113W, peut être piloté ou intégré sans dépendre exclusivement de l'application mobile ou du service cloud du fabricant.

Axes d'investigation :

- Communication Wi-Fi et réseau local.
- Communication Bluetooth Low Energy (BLE).
- Mécanisme de provisionnement Wi-Fi.
- API HTTP distante et éventuelle API HTTP locale.
- MQTT.
- Format binaire propriétaire de configuration.
- Commandes d'arrosage et programmation.
- Possibilité d'une intégration Home Assistant.

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

### Convention de preuve

Chaque découverte doit être classée :

- **FAIT DÉMONTRÉ** : directement établi par le code ou une observation reproductible.
- **HYPOTHÈSE** : interprétation plausible, mais pas encore confirmée.
- **À VÉRIFIER** : question ouverte ou information insuffisante.

Ne pas transformer une hypothèse en fait au fil des conversations.

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

- Environ 10 422 fichiers Java.
- Environ 1 190 ressources.
- 181 erreurs de décompilation signalées par JADX.

L'APK original est conservé séparément. Les analyses portent sur les fichiers décompilés.

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

### Permissions réseau et Wi-Fi

- `ACCESS_WIFI_STATE`
- `INTERNET`
- `CHANGE_NETWORK_STATE`
- `ACCESS_NETWORK_STATE`
- `CHANGE_WIFI_MULTICAST_STATE`
- `CHANGE_WIFI_STATE`

### Permissions Bluetooth

- `BLUETOOTH`
- `BLUETOOTH_ADMIN` avec `maxSdkVersion="31"`
- `BLUETOOTH_ADVERTISE`
- `BLUETOOTH_SCAN`
- `BLUETOOTH_CONNECT`

### Permissions de localisation

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

---

## 7. Structure binaire de configuration : 129 octets

### 7.1 Longueur de réponse

Fichier :

`task/GetDeviceSettingTask.java`

Dans `parseHttpResponse(response)` :

- Si `response.getBytes().length == 129`, la réponse est interprétée comme un `DeviceSettingResponse`.
- Sinon, la réponse est traitée comme un JSON `SimpleTaskResponse`.

La réponse binaire est soumise à une vérification de validité.

### 7.2 DeviceSettingResponse

Fichier :

`data/DeviceSettingResponse.java`

Le code :

1. Récupère les octets de la réponse.
2. Alloue un tableau de taille `IOBody.BODY_SIZE`.
3. Copie les octets dans ce tableau.
4. Construit un objet `DataResult`.

La taille exacte de `IOBody.BODY_SIZE` reste à confirmer dans la classe `IOBody.java`.

### 7.3 DataResult

Fichier :

`data/device/DataResult.java`

Méthode `getTempDevice()` :

```java
DataParserV2.convertDevice(this.data);
```

Méthode `verifyCheckMark()` :

```java
this.data[127] == 83
```

Le marqueur attendu à l'offset 127 est donc `0x53`, caractère ASCII `S`.

Méthode `verifyCheckSum()` :

- Copie les 128 premiers octets.
- Calcule une somme sur ces octets.
- Applique un modulo 256.
- Compare le résultat à l'octet d'offset 128.

Le code Java utilise des octets signés lors du calcul de la somme. La reproduction exacte de cet algorithme dans une implémentation indépendante devra respecter les conversions signées/non signées.

**FAITS DÉMONTRÉS :**

- Longueur attendue : 129 octets.
- Octet 127 : marqueur `0x53`.
- Octet 128 : checksum calculé à partir des 128 premiers octets, modulo 256.
- Les données sont converties en structure `Device` par `DataParserV2`.

**À VÉRIFIER :**

- Valeur de `IOBody.BODY_SIZE`.
- Nature et rôle précis du marqueur.
- Reproduction exacte du checksum.
- Format utilisé pour l'écriture et construction de `mSetting`.

### 7.4 Structure exacte des 128 octets de données

Fichiers examinés :

- `data/device/Device.java`
- `data/device/Info.java`
- `data/device/Command.java`

Les méthodes `Device.setData()` et `Device.getData()` permettent maintenant de reconstituer précisément les quatre blocs qui composent les 128 octets.

| Bloc | Offset de début | Taille | Offset de fin exclu |
|---|---:|---:|---:|
| Info | 0 | 48 | 48 |
| Schedule | 48 | 66 | 114 |
| ScheduleSetting | 114 | 6 | 120 |
| Command | 120 | 8 | 128 |
| Checksum | 128 | 1 | 129 |

**FAIT DÉMONTRÉ :** les données utiles occupent 128 octets. Le checksum est ajouté en 129e position.

### 7.5 Découpage dans Device.setData()

La méthode `setData(byte[] data)` effectue les opérations suivantes :

1. Copie 48 octets à partir de l'offset 0 dans un tableau destiné à `Info`.
2. Passe ce tableau à `DataParserV2.getInfo()`.
3. Copie 66 octets à partir de l'offset 48 dans un tableau destiné aux six programmes.
4. Passe ce tableau à `DataParserV2.getSchedule()`.
5. Copie 6 octets à partir de l'offset 114 dans `schedulesSetting`.
6. Copie 8 octets à partir de l'offset 120 dans un tableau destiné à `Command`.
7. Passe ce tableau à `DataParserV2.getCommand()`.

La méthode ne lit pas l'octet 128 du checksum.

### 7.6 Reconstruction dans Device.getData()

La méthode `getData()` :

1. Appelle `Info.toBytes()` pour reconstruire les 48 octets.
2. Alloue un tableau de 66 octets pour les programmes.
3. Parcourt la liste des programmes et copie chaque timer sérialisé sur 11 octets.
4. Ajoute les 6 octets de `schedulesSetting`.
5. Ajoute les 8 octets de `Command.toBytes()`.
6. Ajoute le résultat de `calculateCheckSum()`.

L'ordre de reconstruction est donc identique à celui du découpage.

**FAIT DÉMONTRÉ :** `getData()` reconstruit un tableau de 129 octets.

### 7.7 Calcul exact du checksum

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

**FAIT DÉMONTRÉ :** la méthode `Device.calculateCheckSum()` calcule le checksum à partir des quatre blocs reconstruits.

### 7.8 Constante headSize

`Device.java` expose également :

`headSize = 40`

Cependant, cette constante n'intervient pas dans les méthodes `setData()`, `getData()` et `calculateCheckSum()` examinées.

**À VÉRIFIER :** retrouver toutes ses références avant de lui attribuer une fonction. Il ne faut pas conclure qu'il existe un en-tête de 40 octets dans le paquet de 129 octets.

---

## 8. Analyse des structures binaires

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

Les tailles observées permettent d'établir la table suivante :

| Offset global | Offset dans Info | Taille | Champ |
|---|---:|---:|---|
| 0–9 | 0–9 | 10 | `_updateTime` |
| 10–12 | 10–12 | 3 | `_voltage` |
| 13–15 | 13–15 | 3 | `_intervalState` |
| 16–18 | 16–18 | 3 | `_durationState` |
| 19–21 | 19–21 | 3 | `_addIntervalTime` |
| 22–24 | 22–24 | 3 | `_addDurationTime` |
| 25 | 25 | 1 | `_spinnerStatus` |
| 26–28 | 26–28 | 3 | `_specialIntervalTime` |
| 29 | 29 | 1 | `_rainDropStatus` |
| 30–33 | 30–33 | 4 | `_rainDropStopTime` |
| 34 | 34 | 1 | `_voltageStatus` |
| 35 | 35 | 1 | `_motorStatus` |
| 36 | 36 | 1 | `_runStatus` |
| 37–40 | 37–40 | 4 | `_nextSprinklingDiff` |
| 41–43 | 41–43 | 3 | `_firmware` |
| 44 | 44 | 1 | `_batteryMode` |
| 45 | 45 | 1 | `_nextSprinklingDiffHigh` |
| 46 | 46 | 1 | `_connectMode` |
| 47 | 47 | 1 | `_productSerialNumber` |

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
- La correspondance exacte entre les valeurs décodées et les informations affichées dans l'application.

### 8.2 Classe Schedule : 66 octets

La zone Schedule commence à l'offset 48 et occupe 66 octets.

La taille d'un programme est :

`Device.scheduleSize = 11`

Le total est :

`Device.scheduleTotalSize = 11 × 6 = 66`

Il existe donc six emplacements de programme de 11 octets chacun.

La méthode `Device.getData()` reconstruit ces six blocs à partir des timers présents dans la liste `schedules`.

Elle distingue deux types :

- `Schedule.Normal`
- `Schedule.Special`

Chaque timer fournit un tableau de 11 octets via `toBytes()`.

La méthode `DataParserV2.getSchedule()` distingue également les deux structures.

#### Programme spécial

Si le deuxième octet du bloc vaut 83 (`0x53`, ASCII `S`), le programme est construit comme un `SpecialTimer`.

Les champs extraits sont :

1. Modèle.
2. Semaines.
3. Heure de début.
4. Heure de fin.
5. Intervalle.
6. Durée.

#### Programme normal

Dans les autres cas, le programme est construit comme un `NormalTimer`.

Les champs extraits sont :

1. Modèle.
2. Durée.
3. Temps d'arrosage.

**FAITS DÉMONTRÉS :**

- Six emplacements de programme.
- Onze octets par emplacement.
- Soixante-six octets au total.
- Deux types de structure : `Normal` et `Special`.
- Le marqueur `0x53` au deuxième octet distingue le programme spécial dans le code examiné.

**À VÉRIFIER :**

- La signification exacte de chaque octet.
- Les règles de conversion des heures et durées.
- La signification des champs de semaines et d'intervalle.
- Le traitement des emplacements de programme vides.
- Les éventuelles différences entre les variantes A101W et A113W.

Classes à examiner :

- `data/device/schedule/NormalTimer.java`
- `data/device/schedule/SpecialTimer.java`
- `types/Schedule`

### 8.3 Zone ScheduleSetting : 6 octets

Cette zone commence à l'offset 114 et se termine à l'offset 119 inclus.

Elle est copiée directement dans le tableau :

`Device.schedulesSetting`

La méthode `Device.getData()` réinjecte ce tableau tel quel lors de la reconstruction.

**FAIT DÉMONTRÉ :** cette zone occupe six octets et est conservée séparément des objets Schedule.

**À VÉRIFIER :** structure interne et signification des six octets.

### 8.4 Classe Command : 8 octets

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

Table des offsets :

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
| `_checkMark` | `83` (`S`) |

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

### 8.5 Méthodes de parsing : emplacement du fichier

Fichier exact :

`data/DataParserV2.java`

Chemin local :

`~/Sprinkler-JADX/sources/com/ioshop/sprinkler/data/DataParserV2.java`

Une recherche ciblée a identifié les méthodes suivantes :

| Méthode | Ligne observée |
|---|---:|
| `convertDevice()` | 30 environ |
| `getHeader()` | méthode présente |
| `getInfo()` | 65 |
| `getSchedule()` | 147 |
| `getCommand()` | 227 |

La sortie de `grep` a également montré que `convertDevice()` appelle `getInfo()`, `getSchedule()` et `getCommand()`.

**NOUVEL ÉLÉMENT À EXAMINER :** `getHeader()` apparaît dans les métadonnées de la classe et dans la structure du parseur. Son rôle doit être étudié directement dans le code. Il ne faut pas confondre cette méthode avec la constante `Device.headSize = 40`, dont l'usage reste non identifié.

La recherche précédente a affiché une longue ligne `@Metadata` générée par Kotlin. Cette ligne contient des métadonnées de compilation et n'est pas le corps des méthodes. Pour la suite, privilégier `sed` sur des plages de lignes précises plutôt qu'un `grep` qui inclut cette annotation.

### 8.6 Limite de l'analyse actuelle

Le parseur et les méthodes de sérialisation permettent maintenant de reconstruire la disposition des blocs.

Ils ne démontrent pas encore :

- La signification complète de chaque octet.
- Le protocole de transport local.
- La manière dont une commande est effectivement envoyée au programmateur.
- La correspondance entre une action de l'interface et les octets transmis.

La sérialisation des timers et les chemins d'appel des commandes doivent encore être étudiés.

---

## 9. Modèle provisoire des communications

Les éléments actuellement observés permettent de distinguer trois couches :

| Couche | Fonction observée | État de preuve |
|---|---|---|
| MQTT distant | Découverte et appairage Wi-Fi | Démontré |
| HTTP(S) distant | Enregistrement, liste des appareils, lecture/écriture de configuration | Démontré |
| Structure binaire de 129 octets | Représentation de la configuration du programmateur | Démontré |

Deux autres voies restent à examiner :

- HTTP local / mode point d'accès.
- Bluetooth Low Energy.

La présence de bibliothèques et de classes dédiées ne suffit pas à déterminer leur rôle exact ni leur disponibilité sur chaque modèle.

---

## 10. Points restant à examiner

### Priorité 1 — Structure exacte des données

- [x] `data/device/Device.java` : tailles, découpage et reconstruction.
- [x] `data/device/Info.java` : ordre des champs et sérialisation des 48 octets.
- [x] `data/device/Command.java` : ordre des champs et sérialisation des 8 octets.
- [ ] `data/IOBody.java`.
- [ ] `data/IOHeader.java`.
- [x] Tailles et offsets des quatre zones principales.
- [x] Formule du checksum dans `Device.calculateCheckSum()`.
- [ ] Comparaison détaillée avec `DataResult.verifyCheckSum()`.
- [ ] Rôle exact des marqueurs `0x53`.
- [ ] Usage de `Device.headSize = 40`.
- [ ] Rôle de `DataParserV2.getHeader()`.

### Priorité 2 — Programmation de l'arrosage

- [ ] `NormalTimer.java`.
- [ ] `SpecialTimer.java`.
- [ ] `Schedule.java`.
- [ ] `DeviceTimer.java`.
- [ ] `IOSprinklerData.java`.
- [ ] `DeviceCommand.java`.
- [ ] Construction et sérialisation des données écrites.
- [ ] Relation entre les programmes et les canaux/vannes.

### Priorité 3 — Commandes

- [ ] `SprinklerCommand.java`.
- [ ] Méthodes de construction des commandes.
- [ ] Chemins d'appel depuis les ViewModels et Presenters.
- [ ] Signification des champs de la zone `Command`.
- [ ] Valeurs et enums associés aux commandes.

### Priorité 4 — Réseau local

- [ ] `GetApDeviceSettingTask.java`.
- [ ] `SetApDeviceSettingTask.java`.
- [ ] `HttpAPUrl.java`.
- [ ] `HttpHelper.java`.
- [ ] `HttpUtil.java`.
- [ ] Endpoints locaux et mode point d'accès.
- [ ] `SM_DEVICE_FEEDBACK`.
- [ ] `SM_IDENTIFY_DEVICE`.

### Priorité 5 — Bluetooth

- [ ] `BLEService.java`.
- [ ] UUID des services et caractéristiques.
- [ ] Format des messages BLE.
- [ ] Commandes et réponses.
- [ ] Relation entre BLE et configuration Wi-Fi.

### Priorité 6 — Provisionnement et configuration cloud

- [ ] Utilisation réelle de ESP Touch.
- [ ] Références à `setServerDomain()` dans l'ensemble de l'APK.
- [ ] Chaînes d'URL et adresses IP dans les ressources.
- [ ] Authentification et gestion des jetons.
- [ ] Dépendance effective au serveur distant.

### Priorité 7 — Compatibilité matérielle

- [ ] Examiner `Product.java`.
- [ ] Identifier les variantes de protocole par modèle.
- [ ] Comparer A101W et A113W.
- [ ] Déterminer les fonctions communes et spécifiques.

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
| 09/11/2026 | `DataParserV2.java` | Méthodes `convertDevice`, `getHeader`, `getInfo`, `getSchedule` et `getCommand` repérées |
| 09/11/2026 | `Device.java` | Découpage et reconstruction des 128 octets de données établis |
| 09/11/2026 | `Device.java` | Calcul du checksum sur les 128 octets reconstruit |
| 09/11/2026 | `Info.java` | Ordre exact des 19 champs et offsets des 48 octets établis |
| 09/11/2026 | `Command.java` | Ordre exact des 8 champs et offsets globaux 120–127 établis |

---

## 12. Dernier état de l'analyse

**Dernières classes examinées :**

- `data/device/Device.java`
- `data/device/Info.java`
- `data/device/Command.java`

**Dernière méthode examinée dans chacune :**

- `Device.setData()`
- `Device.getData()`
- `Device.calculateCheckSum()`
- `Info.toBytes()`
- `Command.toBytes()`

**Dernières découvertes :**

1. La structure des données utiles est de 128 octets.
2. Le paquet complet, checksum compris, est de 129 octets.
3. Les quatre zones sont identifiées avec leurs offsets absolus.
4. Les 48 octets de `Info` sont documentés champ par champ.
5. Les 66 octets de `Schedule` correspondent à six blocs de 11 octets.
6. Les 6 octets de `ScheduleSetting` sont identifiés, mais leur structure interne reste inconnue.
7. Les 8 octets de `Command` sont documentés champ par champ.
8. Le checksum est calculé sur les 128 octets reconstruits, avec l'arithmétique signée des `byte` Java.
9. `Device.headSize = 40` existe, mais son utilisation reste inconnue.
10. `DataParserV2.getHeader()` a été repérée et doit être examinée.

### Prochaine étape

Examiner directement le début de `DataParserV2.java`, notamment `convertDevice()` et `getHeader()`, puis poursuivre avec `getInfo()`.

Commande préparée :

```bash
SRC="$HOME/Sprinkler-JADX/sources/com/ioshop/sprinkler"

sed -n '1,145p' "$SRC/data/DataParserV2.java"
```

Attendre et analyser le résultat avant toute nouvelle commande.

---

## 13. Référence du projet

Dépôt GitHub :

https://github.com/testuflo-ft/docs-serveur-ia

Fichier de référence :

https://github.com/testuflo-ft/docs-serveur-ia/blob/main/SPRINKLER-REVERSE-ENGINEERING.md

Ce document est le référentiel technique cumulatif du projet Sprinkler. Il doit être consulté lors de toute reprise du travail.

Toute mise à jour doit préserver les faits déjà établis, distinguer les hypothèses et actualiser le journal des découvertes.
