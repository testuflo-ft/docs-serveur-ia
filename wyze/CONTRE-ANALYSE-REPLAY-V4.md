# Contre-analyse indépendante — `resource_version` → Replay v4 (APK Wyze 3.26.0.1046)

Pièces : archive `Wyze-Replay-v4-contre-analyse.zip` (intégrité : `sha256sum -c SHA256SUMS.txt` → 8/8 OK). Travail 100 % statique, sur les seuls extraits fournis. Aucun appel réseau.
Limite de méthode : les noms obfusqués (`o3n`, `ay7`, `swp`, `kwc`, `yvt`, `w6e`, `u6e`, `Lang`…) n'ont **pas** leur corps dans le dossier. Leur rôle (ex. `o3n.l` = ajout d'un élément au descripteur) est **déduit des signatures** ; je le signale chaque fois que la preuve en dépend.
Convention : « base-classesNN:L » = numéro de ligne du fichier d'extraction ; les valeurs hexadécimales = offsets DEX.

## 1. Verdict général

**Chaîne partiellement confirmée.**
Sont confirmés, maillon par maillon : nom JSON `resource_version` ↔ index 1 ↔ lecture `long` ↔ constructeur `Lepu` ↔ champ `Lepu.b:J` ↔ getter `g()J` ↔ `long-to-int` ↔ dernier argument `int` de `Lkwc.f(...)` ; puis, de l'autre côté, `$resourceVersion:I` (conservé par `create()`) ↔ ajout du paramètre `"resource_version"` au `HttpRequestBuilder` d'`/app/v4/replay_url`.
Ne sont **pas** démontrés : (R1) que l'objet `Lepu` lu par le ViewModel est bien la ressource `kvs` ; (R2) que `Lkwc.f(...)` aboutit au constructeur `…$getKvsReplayUrl$1` (concordance de types, pas de preuve) ; (R3) que `Lyvt.d` ajoute un paramètre de requête (corps absent) ; (R4) l'exécution du `HttpStatement`, l'envoi, la réponse, l'URL de lecture ; (R5) que la classe `Lepu` correspond à la réponse de l'endpoint `get_event_list` capturé (voir §2, ligne 11).

## 2. Tableau de vérification

| # | Maillon | Preuve (fichier : offset DEX) | Résultat | Commentaire |
|---|---|---|---|---|
| 1 | `resource_version` ↔ index 1 dans `Lepu$a` | 01 : `<clinit>` 14304c ; appels `Lo3n;.l(String,Z)` en ordre : `resource_type` (143080), **`resource_version` (143088/14308c)**, `required`… ; compte 15 à 143072 | **Confirmé (indirect)** | Aucun argument ne porte l'index : il est **positionnel** (2ᵉ enregistrement). Le `Z` (`v2` = 0/1) est l'optionnalité, pas l'index. Le README dit « explicitement » : à corriger. 3 recoupements indépendants ci-dessous. |
| 1b | Recoupement : types | 02 : idx0 `decodeStringElement`, idx1 `decodeLongElement`, idx2 `decodeBooleanElement` (142bf4/142bfc/142c04) | Concorde | String/Long/Boolean ↔ JSON `"kvs"` / `3` / `true` (06). |
| 1c | Recoupement : obligatoires | 01 : 3 premiers `Z=0`, 12 suivants `Z=1` ; 02 : `and-int/lit8 v0,v3,7 ; if-eq 7` (1437c8) | Concorde | Masque 0x7 = idx 0,1,2 requis ; idx 3 (`and-int/lit8 …,8`, 1437f6) facultatif. |
| 1d | Recoupement : masque de lecture | 02 : `or-int/lit8 v6,v6,2` après `decodeLongElement(idx 1)` (142f44→142f4c) | Concorde | bit 2 = 1<<1 = idx 1 ; idx 0 → bit 1 (142f6a), idx 2 → bit 4 (142f2e). |
| 2 | Lecture `long` à l'index 1 | 02 : 142bfc (chemin séquentiel) et 142f44 (boucle) ; `v5`=1 posé en 142bea, `v2`=1 en 142f40 | **Confirmé** | Registres vérifiés : aucun écrasement de `v5` entre 142bea et 142bfc. |
| 3 | Valeur → constructeur `Lepu` | 02 : `move-wide/from16 v34,v23` (142fc6) ; `invoke-direct/range {v31..v49} Lepu.<init>(I,String,J,Z,…)` (142fe0) | **Confirmé** (chemin boucle) | `v31`=this, `v32`=masque, `v33`=String, **`v34:v35`=J**, `v36`=Z. Le chemin séquentiel (142bfc, `v5:v6`) : sa construction n'est **pas** dans l'extrait (non démontré). La table du `packed-switch` (142fe8) n'est pas lisible. |
| 4 | Stockage dans `Lepu.b:J` | 02 : `Lepu.<init>` 1437b8 : params `v2`=this, `v3`=masque, `v4`=String, **`v5:v6`=J**, `v7`=Z ; `iput-wide v5,v2,Lepu.b:J` (1437ee) | **Confirmé** | `ins`=19 cohérent. |
| 5 | Getter `g()J` | 03 : `iget-wide v0,v2,Lepu.b` (143700), `return-wide` (143704) | **Confirmé** | |
| 6 | Sérialiseur réencode `b` à l'index 1 | 03 : `iget-wide …b` (143906), `encodeLongElement(v6, 1, …)` (14390a) | **Confirmé** | Sans effet sur le flux entrant ; sert à la cohérence nom/index (idx 3 = `Lepu.d` ↔ `file_id`, idem). |
| 7 | ViewModel : `Lepu.g()` → `long-to-int` | 04 : 177e84 (`invoke-virtual {v0} Lepu.g`), 177e8a, **177e8c `long-to-int v4,v4`** | **Confirmé** | Aucune autre opération sur la valeur entre 177e84 et 177e9e. |
| 8 | Valeur → dernier arg de `Lkwc.f` | 04 : `move/from16 v21,v4` (177e9e) ; `invoke-virtual/range {v13..v21} Lkwc.f(String,String,J,J,Z,I)Lu6e` (177ea2) | **Confirmé** | `v13`=this, `v14,v15`=String, `v16:v17`, `v18:v19`=J, `v20`=Z (0), **`v21`=I**. Les deux `long` viennent de `Lepu.d()`/`e()` parsés (`zbr.u`, défaut 0) après permutation 177e92–177e9a. |
| 9 | `Lkwc.f` → constructeur `…$getKvsReplayUrl$1` | 04 (signature `String,String,J,J,Z,I`) ↔ 05 : `<init>(Repo,String,String,J,J,Z,I,Continuation)` (216ae0) | **Non démontré** | Concordance de types forte, mais le corps de `kwc.f` est absent. `f` retourne `Lu6e` consommé par `Lh7e.F(u6e, url$1, cont)` (177ee6, après création de `url$1` en 177eaa) : ce n'est donc pas la coroutine elle-même. Transformation possible dans `kwc.f` non exclue. |
| 10 | `$resourceVersion:I` conservé | 05 : `iput v9,v0,…$resourceVersion:I` (216b08) ; `create` : `iget v9` (216acc) → ctor (216ad2) | **Confirmé** | `v9`=int, avant-dernier paramètre (`v10`=Continuation). |
| 11 | Classe `Lepu` ↔ réponse `get_event_list` | 01 : classe `…videosearch.VideoSearchRepositoryResponseEventsItemEventResourcesItem` (143072) ; 06 : mêmes clés (`resource_type`, `resource_version`, `required`, `begin_time`, `end_time`, `is_playable`) | **Partiel** | 6/15 noms concordent ; la clé parente `event_resources`, la classe `…EventsItem` et l'URL d'API qui la décode ne figurent dans aucun extrait. Le nom « VideoSearch… » n'est pas « get_event_list ». |
| 12 | Endpoint `/app/v4/replay_url` | 05 : const-string `v6` (2165bc) ; `v6` non réécrit jusqu'à `HttpRequestKt.a(v5,v6)` (216622) | **Confirmé** (affectation à l'URL du builder) | Rôle de `HttpRequestKt.a` déduit de sa signature. |
| 13 | Lecture/ajout de `resource_version` | 05 : `iget v4,…$resourceVersion` (216614) ; `move/from16 v18,v4` (216628) ; const-string clé (216680) ; `Boxing.e(I)Integer` (216684–21668a) ; `Lyvt.d(builder,String,Object)` (21668c) | **Confirmé** (appel) / **partiel** (sémantique) | Que `yvt.d` = paramètre de **requête** (vs en-tête/corps) n'est pas prouvé : corps absent. `yvt.c` (même famille) sert à `"Authorization"` (21660a/216630). |
| 14 | Construction du `HttpStatement` | 05 : `new HttpStatement` (2166a4), `<init>(builder,client)` (2166a8) | **Confirmé** | |
| 15 | Exécution / envoi / réponse | 05 s'arrête en 687660 (ligne) / 216702 : sauvegarde des `L$0..L$8` puis… | **Non démontré** | Voir §5. |

## 3. Erreurs ou surinterprétations du README

1. « associé **explicitement** à l'index 1 » : aucune instruction ne nomme l'index. À écrire : « 2ᵉ élément enregistré ; confirmé par les types et les masques ». Le piège signalé dans le prompt (booléen d'optionnalité vs index) a été respecté par le README sur le fond.
2. §2 points 5–6 (« transmet à `Lkwc.f` … le repository conserve ») : suggère un raccord `kwc.f` → coroutine **non établi** (ligne 9). `kwc.f` renvoie un `Lu6e` ; l'extrait ne montre pas `new …$getKvsReplayUrl$1`.
3. « constructeur coroutine » : c'est une `SuspendLambda` d'arité 2 (216b0e `const/4 v1,2`) dont `invokeSuspend` appelle `Lw6e;.emit(...)` (2165ac) : forme d'un bloc `flow{}`. À reformuler en conséquence (déduction, non preuve).
4. §3 : « ne fournit pas de `file_id`, d'URL ou de `file_params` » : le JSON 06 est **filtré** ; l'absence réelle n'est pas démontrée. Le descripteur (01) prouve au contraire que `file_id`, `url`, `en_algorithm`, `en_password`, `ai_url` existent comme champs facultatifs. L'argument « c'est pourquoi Replay v4 » repose donc sur une absence non vérifiable ici.
5. Source de la classe : le README présente `Lepu` comme réponse d'événement sans signaler qu'elle appartient à un modèle « VideoSearch… » (ligne 11).
6. Offsets/lignes : **tous** les offsets cités par le README ont été retrouvés à l'identique dans les extraits (01 : 143088, 14308c ; 02 : 142bfc, 142c02, 142f44, 142fc6, 142fe0, 1437ee ; 03 : 1436f0–143704, 143906–14390a ; 04 : 177e84–177ea2 ; 05 : 216b08, 216acc–216ad2, 2165bc, 216614, 216628, 216680, 216684–21668c, 2166a4–2166a8). Aucune erreur numérique relevée.

## 4. Conversion long → int

- `long-to-int` (Dalvik) **tronque** aux 32 bits de poids faible, sans exception ni saturation.
- Sans perte : −2 147 483 648 … 2 147 483 647. Hors domaine : repli modulo 2³² (ex. 2 147 483 648 → −2 147 483 648 ; 4 294 967 299 → 3 : **collision possible** avec une valeur valide).
- La valeur observée `3` n'est pas concernée : transmise inchangée (`3L` → `3`), puis boxée en `Integer` (216684). Aucune arithmétique entre 177e84 et 177e9e.
- On ne peut **pas** généraliser : le dossier ne contient qu'une valeur. Le champ est `long` côté JSON (rien ne dit pourquoi) et `int` côté requête. Preuves nécessaires : (a) l'ensemble des `resource_version` réellement vus (captures déjà détenues, autres événements/modèles) ; (b) usages de `Lepu.g()` ailleurs dans l'APK (comparaisons à des constantes, `switch`) ; (c) corps de `kwc.f` (pas de transformation). Comportement serveur : hors portée statique.
- Hypothèse non vérifiée : l'`Integer` est sérialisé en texte décimal dans la requête (dépend de `yvt.d`).

## 5. Suite de la coroutine

**Démontré** : état initial → `emit(e$b.a)` (2165ac, objet singleton de `com.wyze.network.e$b`, nature inconnue) → construction du builder (URL 2165bc, en-tête `Authorization` dont la valeur vient de `zaz.c()` — valeur absente du dossier —, paramètres `device_id`, `product_model`, `start_time`, `end_time`, `is_live`, `resource_version`) → appel `HttpRequestBuilder.m(Lang)` avec `Lang$a.b()` (21669e ; rôle inconnu) → `new HttpStatement(builder, client)` → sauvegarde de l'état dans `L$0..L$8` (2166ae→216702…). La sauvegarde de tout l'état (client, builder, chaînes) est **cohérente avec** un point de suspension imminent ; ce n'est pas une preuve d'exécution.
**Visible côté reprise** (05 : 687550–687569) : un bloc de restauration `L$8` (builder) … `L$1`, `ResultKt.b(v18)`, `v4=v18`, `goto/16 0192` : un résultat de suspension est repris puis traité à l'unité `0192`. Ni l'appel suspendu, ni l'unité `0192` ne sont fournis.
**Manque** : (i) les instructions après 216702 (ligne 687660) jusqu'à l'appel suspendu sur le `HttpStatement` (`v4`/`L$…`) ; (ii) le code à l'unité `0192` — par calcul (base d'instructions 21641c + 2×0x192) ≈ **216740**, à confirmer ; (iii) `Lang`, `Lang$a.b()` et `HttpRequestBuilder.m` : **la méthode HTTP (GET/POST) n'apparaît dans aucun extrait**, ce qui conditionne le sens de `resource_version` ; (iv) corps de `Lyvt.d` (paramètre de requête ou non).

## 6. Réponse Replay et URL de lecture — pistes précises

Aucun nom de méthode n'est inventé ; chaque piste part d'un symbole **présent** dans les extraits.
1. `…$getKvsReplayUrl$1.invokeSuspend` après 216702 et à l'unité 0192 : repérer l'appel suspendu sur le statement, puis le premier `invoke` sur le résultat (lecture du corps), un `const-string`/type de DTO, et chaque `emit(...)`.
2. DTO : dans le package `com.wyze.kmplugin.datalayers.eventgroup`, classes dont le nom contient `Replay`/`Kvs` et leurs `$a.<clinit>` (noms JSON, dont celui de l'URL). Point de départ non spéculatif : xref de la chaîne `string@53fe` (l'endpoint) et des classes `$getKvsReplayUrl$…`.
3. `Lcom/wyze/network/e$b;` (émis en 2165ac) et ses classes sœurs : modèle d'état (chargement/succès/erreur ?) — à lire pour savoir comment le DTO est livré.
4. ViewModel : `EventGroupViewModel$fetchVideoUrl$2$url$1` (présent en 04, 559799) et la suite de `fetchVideoUrl$2.invokeSuspend` après 177eec : traitement du résultat de `Lh7e.F(...)`.
5. Utilisation par le lecteur : appelants de `EventGroupViewModel.fetchVideoUrl` et ce qui consomme la valeur retournée.
6. Preuve d'« obtention effective d'une URL » : **impossible statiquement** — au mieux, la preuve que le code extrait une chaîne du DTO et la transmet au lecteur ; le succès serveur reste inconnu.

## 7. Confidentialité

- **Aucun** jeton, secret, identifiant de compte/périphérique, URL signée ou adresse MAC détecté (balayage par motifs + lecture). `Authorization` n'apparaît que comme **clé** ; sa valeur n'est pas dans le dossier.
- Endpoint public `https://kvs-service.wyzecam.com/app/v4/replay_url` : constante de l'APK, sans risque.
- Faible : horodatage exact de l'événement (UTC + `begin_time`/`end_time` en ms, 20 s) et modèle `GW_BE1` : trace d'activité de la sonnette ; arrondir si diffusion large.
- À surveiller si une capture **non filtrée** est un jour partagée : `file_id`, `url`, `ai_url`, `en_algorithm`, `en_password` (noms vus en 01) sont des champs potentiellement sensibles.
- Un point de qualité (pas de confidentialité) : le filtrage de 06 rend impossible de distinguer « champ absent » de « champ retiré ».

## 8. Prochaines extractions recommandées (ordre, minimal)

1. `EventGroupViewModel$fetchVideoUrl$2.invokeSuspend` : de la production de `v0` (Lepu) jusqu'à 177e3a — sélection `Lepu.f()` = `"kvs"` et affectation de `v0`. **Indispensable** pour dire que la version transmise est celle de la ressource KVS (sans cela, la chaîne mécanique `Lepu.b` → paramètre reste vraie pour *l'objet* `v0`, pas pour « la ressource KVS »). Vérifier aussi qu'aucune réaffectation de `v0` n'intervient entre sélection et 177e84.
2. `Lkwc.f` (method@2305) en entier + la méthode du repository qu'il appelle (celle qui crée `…$getKvsReplayUrl$1`) : ferme R2 et exclut une transformation.
3. Suite de `…$getKvsReplayUrl$1.invokeSuspend` : de 216702 à la fin de l'état ; plus l'unité `0192`.
4. `Lyvt.d`, `Lang$a.b()`, `HttpRequestBuilder.m` (R3 et méthode HTTP).
5. Descripteur du parent `…ResponseEventsItem` (clé `event_resources`) et la méthode qui décode `VideoSearchRepositoryResponse`, avec son URL : ferme R5.
6. DTO de réponse Replay et `…$fetchVideoUrl$2$url$1`.
7. (Pour §4) autres usages de `Lepu.g()`.

## 9. Conclusion graduée

**Faits établis (par les extraits)** : ordre/noms/types/obligatoriété du descripteur `Lepu$a` ; lecture `long` idx 1 → `Lepu.b:J` (chemin boucle) ; `g()` renvoie `b` ; `long-to-int` puis dernier argument `int` de `kwc.f` ; `$resourceVersion:I` conservé puis ajouté sous la clé `resource_version` au builder d'`/app/v4/replay_url` ; `HttpStatement` construit. `3` survit sans perte à `long-to-int`.
**Hypothèses plausibles (non prouvées)** : `Lepu` du ViewModel = ressource `kvs` (étude séparée annoncée par le README, absente) ; `kwc.f` → `…$getKvsReplayUrl$1` ; `yvt.d` = paramètre de requête ; la suspension suivante exécute le statement ; `Lepu` décode la réponse de `get_event_list` (6 noms sur 15 concordent).
**Inconnues** : méthode HTTP ; exécution et envoi ; réponse, DTO, extraction de l'URL, passage au lecteur ; plage réelle de `resource_version` ; absence réelle de `file_id`/`url` dans la ressource non filtrée ; acceptation par le serveur.
**Sur la ressource KVS v3 de GW_BE1** : si (R1)–(R3) se confirment, la valeur `3` serait transmise telle quelle (`resource_version=3`). Aujourd'hui, c'est **cohérent avec le code, non démontré de bout en bout**. `is_playable: true`, `required: true`, `resource_version: 3` sont des déclarations du serveur ; elles ne prouvent ni la disponibilité d'un clip ni qu'une URL sera délivrée.

## Reproduction

```bash
unzip Wyze-Replay-v4-contre-analyse.zip -d wz && cd wz && sha256sum -c SHA256SUMS.txt
python3 -I - <<'E'   # ordre/optionnalité des 15 noms du descripteur
import re
n=[];f=cur=None
for l in open('01-json-descriptor-Lepu.txt'):
    m=re.search(r'const/4 v2, #int (\d)',l); f=int(m.group(1)) if m else f
    m=re.search(r'const-string v0, "([^"]+)"',l); cur=m.group(1) if m else cur
    if 'Lo3n;.l:(Ljava/lang/String;Z)V' in l: n.append((cur,f))
print(len(n)); [print(i,*x) for i,x in enumerate(n)]
E
grep -n "decodeLongElement\|iput-wide\|long-to-int\|resourceVersion\|resource_version" 0[2-5]*.txt
```
