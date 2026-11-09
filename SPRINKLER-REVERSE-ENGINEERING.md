cat > SPRINKLER-REVERSE-ENGINEERING.md <<'EOF'
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

~~~java
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
~~~

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

~~~java
PAIR_INFO = "%s/IOShop/Pair";
~~~

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

~~~java
TEST_SERVER_DOMAIN = "https://echo.ioshop.com.tw/LinkU/";
~~~

Variable de domaine :

~~~java
mServerDomain = "";
~~~

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

~~~java
SM_DEVICE_FEEDBACK = "http://%s/feedback?NTP=%s&TIMEZONE=%s";
SM_IDENTIFY_DEVICE = "http://%s/TYPE_BRAND";
~~~

Ces deux URL suggèrent l'existence d'échanges HTTP locaux avec un appareil, mais leur utilisation effective reste à analyser.

Un client ID est codé en dur :

`SQCTYatBMdZtDIBanpwS`

Sa fonction exacte devra être documentée à partir de ses références.

### 6.3 Enregistrement du programmateur

Fichier :

`task/UploadDeviceTask.java`

Appel observé :

~~~java
HttpUtil.getInstance().post(
    HttpUrlUtil.genUploadDeviceUrl(),
    HttpUrlUtil.genUploadDeviceContent(mac, name, timezone),
    PreferenceHelper.INSTANCE.getLoginToken(),
    true
);
~~~

Le JSON construit par `genUploadDeviceContent()` contient :

~~~json
{
  "mac": "...",
  "name": "...",
  "timezone": "..."
}
~~~

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

~~~java
DataParserV2.convertDevice(this.data);
~~~

Méthode `verifyCheckMark()` :

~~~java
this.data[127] == 83
~~~

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
- Correspondance exacte entre les 129 octets et les champs.
- Nature et rôle précis du marqueur.
- Reproduction exacte du checksum.
- Format utilisé pour l'écriture et construction de `mSetting`.

---

## 8. Analyse de DataParserV2.java

Fichier :

`data/DataParserV2.java`

La méthode `convertDevice(byte[] input)` découpe le tableau d'entrée en quatre zones successives :

1. `Info`
2. `Schedule`
3. `ScheduleSetting`
4. `Command`

Les tailles sont récupérées dynamiquement depuis les classes `Device`, `Info` et `Command`.

Le code construit ensuite un objet `Device` contenant ces différentes structures.

### 8.1 Zone Info

La méthode `getInfo(byte[] input)` découpe la zone d'information dans l'ordre suivant :

1. `updateTime`
2. `voltage`
3. `intervalState`
4. `durationState`
5. `addIntervalTime`
6. `addDurationTime`
7. `spinnerStatus`
8. `specialIntervalTime`
9. `rainDropStatus`
10. `rainDropStopTime`
11. `voltageStatus`
12. `motorStatus`
13. `runStatus`
14. `nextSprinklingDiff`
15. `firmware`
16. `batteryMode`
17. `nextSprinklingDiffHigh`
18. `connectMode`
19. `productSerialNumber`

Les tailles de ces champs sont définies dans `data/device/Info.java`.

Les noms suggèrent des informations de fonctionnement, de tension, d'état moteur, d'arrosage et de connexion. Leur interprétation exacte n'est pas encore établie.

### 8.2 Zone Schedule

La méthode `getSchedule(Product product, byte[] input)` parcourt la zone des programmes par blocs de taille `Device.scheduleSize`.

Chaque bloc commence par un octet de type, suivi d'un marqueur ou d'un champ de modèle.

Le code distingue deux structures.

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

Les tailles des champs sont définies dans :

- `data/device/schedule/SpecialTimer.java`
- `data/device/schedule/NormalTimer.java`

Le nombre exact de programmes et la signification de tous les octets restent à confirmer.

### 8.3 Zone ScheduleSetting

Après la zone des programmes, `convertDevice()` copie une zone de taille :

`Device.getScheduleSettingSize()`

Cette zone est conservée sous forme de tableau d'octets dans l'objet `Device`.

Sa structure interne reste à examiner.

### 8.4 Zone Command

La méthode `getCommand(byte[] input)` découpe la zone de commande dans l'ordre suivant :

1. `stopSwitch`
2. `spinnerSwitch`
3. `rainDropSwitch`
4. `firmwareUpdate`
5. `wifiUpdate`
6. `batteryModeSwitch`
7. `sprinkleSwitch`
8. `checkMark`

Les tailles sont définies dans `data/device/Command.java`.

Les noms suggèrent des commandes ou états liés à l'arrêt, à la rotation, à la pluie, au firmware, au Wi-Fi, au mode batterie et à l'arrosage. Leur sémantique opérationnelle doit être vérifiée dans les méthodes d'accès et les classes qui construisent les commandes.

### 8.5 Limite de l'analyse actuelle

`DataParserV2` est un parseur : il montre comment les octets reçus sont découpés et transformés en objets.

Il ne démontre pas, à lui seul, comment l'application construit les octets destinés à être envoyés au programmateur.

La sérialisation inverse devra être recherchée dans les classes de commandes, de données et de timers.

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

### Priorité 1 — Structure exacte des octets

- [ ] `data/device/Device.java`
- [ ] `data/device/Info.java`
- [ ] `data/device/Command.java`
- [ ] `data/IOBody.java`
- [ ] `data/IOHeader.java`
- [ ] Tailles exactes des zones et offsets absolus.
- [ ] Valeur et calcul exact du checksum.
- [ ] Rôle des marqueurs `0x53`.

### Priorité 2 — Programmation de l'arrosage

- [ ] `NormalTimer.java`
- [ ] `SpecialTimer.java`
- [ ] `Schedule.java`
- [ ] `DeviceTimer.java`
- [ ] `IOSprinklerData.java`
- [ ] `DeviceCommand.java`
- [ ] Construction et sérialisation des données écrites.
- [ ] Relation entre les programmes et les canaux/vannes.

### Priorité 3 — Commandes

- [ ] `SprinklerCommand.java`
- [ ] Méthodes de construction des commandes.
- [ ] Chemins d'appel depuis les ViewModels et Presenters.
- [ ] Signification des champs de la zone `Command`.

### Priorité 4 — Réseau local

- [ ] `GetApDeviceSettingTask.java`
- [ ] `SetApDeviceSettingTask.java`
- [ ] `HttpAPUrl.java`
- [ ] `HttpHelper.java`
- [ ] `HttpUtil.java`
- [ ] Endpoints locaux et mode point d'accès.
- [ ] `SM_DEVICE_FEEDBACK`.
- [ ] `SM_IDENTIFY_DEVICE`.

### Priorité 5 — Bluetooth

- [ ] `BLEService.java`
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
| 09/11/2026 | `DataParserV2.java` | Découpage en Info, Schedule, ScheduleSetting et Command |

---

## 12. Dernier état de l'analyse

**Dernière classe examinée :** `data/DataParserV2.java`

**Dernière découverte :** la configuration binaire de 129 octets est découpée en structures `Info`, `Schedule`, `ScheduleSetting` et `Command`.

Les noms et l'ordre des champs sont identifiés, mais leurs tailles et offsets absolus ne sont pas encore établis.

### Prochaine étape

Lire les classes qui définissent les tailles des champs et les structures :

- `data/device/Device.java`
- `data/device/Info.java`
- `data/device/Command.java`

Commande préparée :

~~~bash
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
~~~

Attendre et analyser le résultat avant toute nouvelle commande.

---

## 13. Référence du projet

Dépôt GitHub :

https://github.com/testuflo-ft/docs-serveur-ia

Fichier de référence :

https://github.com/testuflo-ft/docs-serveur-ia/blob/main/SPRINKLER-REVERSE-ENGINEERING.md

Ce document est le référentiel technique cumulatif du projet Sprinkler. Il doit être consulté lors de toute reprise du travail.

Toute mise à jour doit préserver les faits déjà établis, distinguer les hypothèses et actualiser le journal des découvertes.

EOF

echo "Document Markdown créé :"
pwd
ls -lh SPRINKLER-REVERSE-ENGINEERING.md
