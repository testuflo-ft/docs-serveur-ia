# Journal des incidents et risques — Serveur IA Mac mini + Synology

*Version 0.5 — 20 octobre 2026 — copie de travail complète datée pour revue Claude*

> Ce journal distingue incidents observés, risques visibles dans le code, et corrections effectivement validées. Une correction proposée n’est pas une correction appliquée. Cette copie n’est pas publiée sur GitHub. Les entrées héritées sont consolidées par identifiant, symptôme et état ; les nouvelles constatations de l’audit sont documentées avec preuves et actions détaillées.

## Format des entrées

Chaque entrée devrait contenir : date, symptôme/constat, preuve et chemin, impact, statut, test requis, action suivante et précautions. Les incidents historiques SMB/OWUI/AnythingLLM ci-dessous sont conservés sous forme de registre synthétique ; se référer à la version 0.4 du dépôt pour leur narration originale lorsqu’elle est nécessaire.

## Registre historique conservé

| ID | Sujet | État rapporté au dernier relevé | Note |
|---|---|---|---|
| SMB-01 | `mount_smbfs -N` retourne `Authentication error` | Résolu selon l’historique | Script shell lit le secret de `~/.nsmbrc`; garder permissions strictes. |
| SMB-02 | LaunchAgent basé sur `osascript` bloqué sans session graphique | Résolu selon l’historique | Éviter Finder/AppleScript depuis SSH. |
| SMB-03 | NFS : `Operation not permitted` | Historique | Voir ancienne version pour détails. |
| SMB-04 | Trousseau macOS inaccessible en écriture depuis SSH | Historique | Ne pas dépendre de GUI/Trousseau depuis session SSH. |
| OWUI-01 | `WEBUI_SECRET_KEY` perdue après recréation de conteneur | Corrigé selon l’historique | Garder secret/configuration persistante ; vérifier avant recréation. |
| OWUI-02 | PDF scanné extrait comme texte vide | Non confirmé résolu | Tesseract installé ; validation de réindexation en attente. |
| OWUI-03 | `gemma3:12b` sans tool calling dans le test Open WebUI | Comportement observé | Utiliser un modèle/provider compatible pour outils si nécessaire. |
| OWUI-04 | Clé API Open WebUI exposée | Action de rotation/révocation à confirmer | Ne jamais réutiliser l’ancienne clé ; vérifier qu’elle est invalidée. |
| ALLM-01 | Connexion AnythingLLM impossible après recréation de conteneur | Corrigé selon l’historique | Lié à la configuration JWT/secret persistante. |
| ALLM-02 | Montages NAS n’activent pas automatiquement l’indexation RAG | Constat confirmé conceptuellement | Un bind mount de sources n’est pas une ingestion. Automatisation en pause jusqu’à sécurisation. |
| ALLM-03 | Upload via UI workspace limité à certains rôles | Constat du parcours UI | Ne pas transposer ce contrôle aux routes API sans preuve. |
| ALLM-04 | Portée des clés API et isolation workspace | Réévalué | Developer API key = système/administrateur par conception documentée ; limitation à ajouter si nécessaire. Voir ALLM-12 et ALLM-13. |
| ALLM-05 | `purgeDocument` a une portée globale | Risque de portée | Fonction parcourt les workspaces ; vérifier tout appel et les conséquences avant usage. |
| ALLM-06 | Cache vectoriel indexé par chemin | Risque confirmé dans le code | Un même chemin modifié peut réutiliser un cache périmé. |
| ALLM-07 | Réimport : doublons ou vecteurs orphelins | Risque du pipeline | Vecteurs avant association SQL ; absence de rollback visible dans le flux examiné. |
| ALLM-08 | Routes admin API sans contrôle de rôle visible | Nuancé par la politique produit | Les clés Developer API sont intentionnellement admin-equivalent. Cela ne réduit pas le besoin de les protéger. |
| ALLM-09 | API documentaire et répertoire de fichiers générés partagés | À revoir dans contexte | Traiter les opérations sur fichiers comme privilégiées. |
| ALLM-10 | Protection de suppression workspace inactive dans l’environnement observé | Configuration à vérifier | Ne pas supposer la protection active sans lire les paramètres effectifs. |
| ALLM-11 | Montage API : pas de contrôle global de rôle visible dans les extraits | Source affinée | `app.use("/api", apiRouter)` monte le routeur sans `validApiKey` visible ; les routes utilisent majoritairement un middleware local. Une route sans middleware a été identifiée : ALLM-12. |
| GIT-01 | Écriture dépôt documentaire refusée par le connecteur GitHub | Non résolu | Erreur `403 Resource not accessible by integration`; aucune publication effectuée dans cette étape. |

---

## ALLM-12 — Route `env-dump` sans authentification Developer API visible

**Date :** 20 octobre 2026  
**Type :** constat de code / risque de sécurité  
**Priorité proposée :** P0 — corriger ou neutraliser avant d’exposer davantage l’API  
**Statut :** ✅ Route et appel de fonction confirmés dans la source ; ⚠️ impact en environnement réel non testé.

### Fait établi

Dans la source AnythingLLM `v1.17.0`, `server/endpoints/api/system/index.js` définit à la ligne 16 :

```js
app.get("/v1/system/env-dump", async (_, response) => {
```

La route n’utilise pas `[validApiKey]`, contrairement à la route suivante `/v1/system` (ligne 37), qui le fait. Le handler appelle `dumpENV()` en production (ligne 29), puis répond avec un statut HTTP 200.

Le montage est visible dans `server/index.js` :

```js
app.use("/api", apiRouter); // ligne 81
developerEndpoints(app, apiRouter); // ligne 97
```

Dans cet extrait, aucun middleware d’authentification n’est attaché globalement à `app.use("/api", apiRouter)`. Le chemin routé est donc `/api/v1/system/env-dump` dans le contexte de ce serveur.

`server/utils/helpers/updateENV.js`, fonction `dumpENV()` à partir de la ligne 1537, sélectionne des variables d’environnement et écrit le fichier déterminé par :

```js
const envPath = path.join(__dirname, "../../.env"); // ligne 1668
fs.writeFileSync(envPath, envResult, { encoding: "utf8", flag: "w" });
```

Les valeurs font l’objet d’un filtrage de certains caractères ; il ne s’agit pas d’une simple lecture. La fonction écrit un fichier de configuration persistant à partir des variables du processus.

Vérification complémentaire : dans le tag `v1.18.0`, le même handler est encore présent sans middleware local `validApiKey` dans `server/endpoints/api/system/index.js`. Cela ne démontre pas l’état de toutes les versions ultérieures ni celui d’une image personnalisée.

### Impact plausible

Un appelant capable d’atteindre le service HTTP peut déclencher cette écriture sans fournir de Developer API key. L’effet exact dépend de `NODE_ENV`, des variables chargées, du chemin réellement présent dans le conteneur, des permissions d’écriture et de la façon dont le processus charge `.env` au démarrage.

Ce constat ne prouve pas que la réponse expose immédiatement les secrets, ni qu’un redémarrage produit forcément une altération fonctionnelle. Le problème confirmé est une route à effet d’écriture sur le système de fichiers du conteneur sans le contrôle d’authentification attendu. La durabilité de cette écriture après recréation du conteneur, ainsi que son effet au redémarrage, restent à vérifier.

### Action recommandée

1. Dans une branche/fork de test, ajouter le middleware approprié à la route ou supprimer/neutraliser cette route de diagnostic en production.
2. Faire le changement en amont si possible et vérifier l’historique/issue du mainteneur ; ne pas éditer directement le conteneur en production comme correctif durable.
3. Tester sans clé, avec clé invalide et avec clé valide. Le premier et le deuxième cas doivent être refusés sans effet fichier ; le troisième ne doit être autorisé qu’à une identité système autorisée.
4. Vérifier dans l’environnement de test que l’appel refusé ne crée ni ne remplace le fichier `.env` et qu’aucun secret n’apparaît dans la réponse ou les journaux.
5. Avant déploiement, comparer les valeurs et l’empreinte du fichier de configuration sauvegardé ; ne pas afficher les secrets dans les traces.

### Sources

- [`server/endpoints/api/system/index.js` — tag v1.17.0](https://github.com/Mintplex-Labs/anything-llm/blob/v1.17.0/server/endpoints/api/system/index.js), lignes 16–31.
- [`server/index.js` — tag v1.17.0](https://github.com/Mintplex-Labs/anything-llm/blob/v1.17.0/server/index.js), lignes 81 et 97.
- [`server/utils/helpers/updateENV.js` — tag v1.17.0](https://github.com/Mintplex-Labs/anything-llm/blob/v1.17.0/server/utils/helpers/updateENV.js), fonction `dumpENV()`, lignes 1537 et suivantes, écriture à la ligne 1668.

---

## ALLM-13 — Les clés Developer API ne sont pas des identifiants à portée limitée

**Date :** 20 octobre 2026  
**Type :** décision d’architecture / risque d’usage  
**Priorité proposée :** P1 avant connexion n8n en production  
**Statut :** ✅ Politique officielle consultée ; architecture de moindre privilège non mise en place.

### Fait établi et correction d’interprétation

Le fichier `SECURITY.md` dans le tag officiel `v1.17.0` déclare explicitement que les Developer API keys sont des identifiants système, créés uniquement par des administrateurs, et qu’elles accordent volontairement un accès complet et non restreint à `/v1/*`, équivalent à l’accès administrateur. Il précise qu’une clé limitée par fonctionnalité ou workspace constitue une demande de fonctionnalité, pas une vulnérabilité du modèle actuel.

La fonction `validApiKey` de `server/utils/middleware/validApiKey.js` vérifie qu’un Bearer token existe et que `ApiKey.get({ secret })` le retrouve. Le modèle `server/models/apiKeys.js` conserve `createdBy`, et `whereWithUser` peut enrichir les résultats de listing, mais le middleware ne transforme pas `createdBy` en autorisation par utilisateur/workspace. Ce comportement concorde avec le modèle système décrit par le mainteneur.

### Conséquence pour le projet

- Une clé Developer API doit être considérée comme un secret administrateur complet.
- Le rôle de session d’un utilisateur web et ses workspaces autorisés ne doivent pas être supposés limiter les appels Developer API.
- Le simple ajout d’un test `createdBy` ne suffit pas pour appliquer une vraie portée d’opération/workspace.
- Il faut soit créer une passerelle n8n dédiée, soit implémenter et maintenir des clés à portée limitée dans un fork, avec vérification dans chaque route et tests de refus.

### Action recommandée

Construire une interface serveur minimale qui conserve la clé complète et n’expose à n8n que les opérations autorisées. Prévoir une allowlist de workspaces fixée côté serveur, aucune suppression non prévue, limites de taille/type de fichier et journal d’audit. Refuser par défaut tout endpoint non explicitement autorisé. Garder l’automatisation d’import en pause avant les tests d’intégrité de bout en bout.

### Source

[`SECURITY.md` — tag v1.17.0](https://github.com/Mintplex-Labs/anything-llm/blob/v1.17.0/SECURITY.md), section « Reports based on Developer API Key access ».

---

## ALLM-14 — Pipeline d’import : vecteurs et association SQL sans transaction commune visible

**Date :** 20 octobre 2026  
**Type :** risque d’intégrité des données  
**Priorité proposée :** P1 avant import automatisé  
**Statut :** ✅ Ordre des opérations confirmé dans le code ; ⚠️ panne réelle non injectée.

### Fait établi

Dans `server/models/documents.js`, `Document.addDocuments` appelle `VectorDb.addDocumentToNamespace(...)` (ligne 137 environ) avant de créer l’enregistrement `prisma.workspace_documents.create({ data: newDoc })` (ligne 159 environ). Si la création de l’enregistrement échoue, le code journalise l’erreur et émet `doc_failed`, mais aucune suppression compensatoire du vecteur nouvellement ajouté n’est visible dans ce bloc.

Le pipeline ne fournit pas de transaction atomique couvrant ensemble LanceDB et la base relationnelle. `Document.removeDocuments` se fonde sur les enregistrements de document et les identifiants dans `DocumentVectors` pour effacer les vecteurs. L’absence d’association ou de mapping relationnel peut donc compliquer le nettoyage d’un vecteur orphelin.

Les routes de téléversement inspectées répondent à partir du résultat du collecteur / de la préparation documentaire ; `Document.api.uploadToWorkspace` détecte certaines erreurs d’embedding, mais toutes les erreurs de création de l’association SQL ne semblent pas être propagées comme un échec global. La valeur HTTP `success: true` n’est donc pas, à elle seule, une preuve suffisante de cohérence complète.

### Action recommandée

- Définir la réponse d’import comme réussie uniquement si les vecteurs, l’association SQL et les mappings attendus sont confirmés.
- Introduire une compensation fiable ou une tâche de réconciliation capable d’identifier puis nettoyer les orphelins ; ne pas s’appuyer uniquement sur l’association SQL si celle-ci peut manquer.
- Tester l’échec entre l’écriture vectorielle et l’écriture SQL, ainsi que les doubles imports.
- Conserver pour chaque tentative un identifiant d’opération/idempotence, le chemin source, le workspace cible et un statut final durable.

### Sources

- [`server/models/documents.js` — tag v1.17.0](https://github.com/Mintplex-Labs/anything-llm/blob/v1.17.0/server/models/documents.js), `addDocuments`.
- [`server/utils/vectorDbProviders/lance/index.js` — tag v1.17.0](https://github.com/Mintplex-Labs/anything-llm/blob/v1.17.0/server/utils/vectorDbProviders/lance/index.js), `addDocumentToNamespace`.
- [`server/utils/files/purgeDocument.js` — tag v1.17.0](https://github.com/Mintplex-Labs/anything-llm/blob/v1.17.0/server/utils/files/purgeDocument.js), `purgeDocument` / `purgeFolder`.

---

## ALLM-15 — Cache vectoriel indexé sur le chemin source, pas le contenu

**Date :** 20 octobre 2026  
**Type :** risque de contenu périmé et d’import non déterministe  
**Priorité proposée :** P1  
**Statut :** ✅ clé de cache et chemin d’utilisation confirmés dans le code ; cas réel exact dépendant du flux d’import.

### Fait établi

`server/utils/files/index.js` génère la clé à partir de `uuidv5(filename, uuidv5.URL)` et construit le chemin dans `STORAGE_DIR/vector-cache`. Cette clé est dérivée du nom/chemin, pas d’un hash du contenu ou du couple contenu + modèle d’embedding.

`server/utils/vectorDbProviders/lance/index.js`, dans `addDocumentToNamespace`, appelle `cachedVectorInformation(fullFilePath)` puis peut réutiliser les chunks du cache. Lors d’un cache absent, les chunks sont calculés, stockés et les vecteurs écrits. Le cache observé précédemment dans l’instance avait pour nom `5d8cac14-8cf5-5c28-964b-c70d2dae2fdb.json`, taille rapportée 13 774 octets, mtime `2026-10-11 06:03:10 UTC`. Une recherche de journaux sur l’intervalle précédemment examiné n’avait pas fourni les lignes attendues ; cela ne prouve ni corruption ni utilisation effective de ce fichier.

### Interprétation prudente

Si un document change à chemin identique et que le flux accepte le cache, des chunks périmés peuvent être réutilisés. Mais certains flux d’import créent des chemins internes à UUID ; un nouvel import peut plutôt créer de nouveaux documents/vecteurs, ce qui provoque potentiellement des doublons. Il faut tester le comportement pour le chemin exact utilisé par n8n.

### Action recommandée

Comparer le contenu et le nom du chemin lors d’un test isolé, modifier le contenu sans changer le chemin puis vérifier les chunks utilisés. Envisager une clé de cache fondée sur contenu, modèle et paramètres de segmentation, ainsi qu’une invalidation explicite pour remplacement, suppression et changement de modèle. Ne pas supprimer le cache de production pendant l’audit.

### Sources

- [`server/utils/files/index.js` — tag v1.17.0](https://github.com/Mintplex-Labs/anything-llm/blob/v1.17.0/server/utils/files/index.js), calcul de clé et `purgeVectorCache`.
- [`server/utils/vectorDbProviders/lance/index.js` — tag v1.17.0](https://github.com/Mintplex-Labs/anything-llm/blob/v1.17.0/server/utils/vectorDbProviders/lance/index.js), `cachedVectorInformation` et `storeVectorResult`.

---

## ALLM-16 — Purge de dossier récursive alors que purge cache/associations non récursive

**Date :** 20 octobre 2026  
**Type :** risque de nettoyage incomplet  
**Statut :** ✅ comportement du code confirmé ; aucune purge exécutée dans cet audit.

`purgeFolder` dans `server/utils/files/purgeDocument.js` liste directement le contenu de premier niveau, purge cache et associations pour ces chemins, puis appelle `fs.rmSync(subFolderPath, { recursive: true })`. Le commentaire confirme que la phase de purge n’est pas récursive. En présence de sous-dossiers, les fichiers internes sont supprimés du disque sans qu’il soit démontré que chaque entrée de cache/association a été traitée individuellement.

**Action :** parcours récursif explicite et tests avec arbre de dossiers imbriqués avant d’utiliser cette route sur des données réelles. Vérifier séparément les namespaces/vecteurs et mappings SQL ; ne pas supposer que la suppression physique de fichier supprime tous les index.

Source : [`server/utils/files/purgeDocument.js` — tag v1.17.0](https://github.com/Mintplex-Labs/anything-llm/blob/v1.17.0/server/utils/files/purgeDocument.js), `purgeFolder`.

---

## Plan de test consolidé — avant d’activer n8n

| ID test | Scénario | Résultat attendu | Exécuté ? |
|---|---|---|---|
| SEC-01 | `GET /api/v1/system/env-dump` sans clé | refus ; aucun fichier `.env` écrit/modifié | Non |
| SEC-02 | Clé Developer API invalide sur routes protégées | HTTP refusé ; aucun effet secondaire | Non |
| SEC-03 | Passerelle n8n vers workspace allowlisté | opération minimale autorisée et vérifiable | Non |
| SEC-04 | Même passerelle vers workspace non autorisé | refus avant toute écriture | Non |
| SEC-05 | Tentative de suppression/déplacement par passerelle | refus sauf permission explicitement accordée | Non |
| RAG-01 | Import d’un nouveau fichier | état succès vérifié dans source, SQL, mapping vectoriel, vecteurs | Non |
| RAG-02 | Même fichier importé deux fois | comportement idempotent, pas de double association/vecteur | Non |
| RAG-03 | Fichier modifié au même chemin | chunks conformes au nouveau contenu, aucune cache périmée | Non |
| RAG-04 | Échec embedding | réponse d’échec fiable, pas de faux `success: true` | Non |
| RAG-05 | Échec SQL après insertion LanceDB | rollback/compensation ou réconciliation traçable | Non |
| RAG-06 | Suppression d’un document avec mapping | association, cache et vecteurs supprimés comme prévu | Non |
| RAG-07 | Dossier avec sous-dossiers | pas d’index/cache/association abandonnés | Non |
| RAG-08 | Modification modèle d’embedding | reindexation/caches cohérents ; aucune action sur production | Non |
| OPS-01 | État des volumes et sauvegarde | sauvegarde produite puis restauration d’essai vérifiée | Non |

Aucun test de cette table n’a été exécuté dans la présente étape. Il s’agit d’un protocole de test.

## Limites et conditions de clôture

L’audit est en cours. Ne pas le déclarer clos avant que :

1. la route env-dump ait une décision/correction vérifiée dans une branche ou un environnement de test ;
2. l’architecture d’accès restreint pour n8n soit choisie ;
3. les tests de cohérence import SQL/LanceDB/cache soient définis puis exécutés sans risque de production ;
4. les documents soient relus, puis intégrés au dépôt documentaire par une méthode autorisée ;
5. les actions de révocation de la clé Open WebUI historique soient confirmées.

Aucune action destructive, aucun import additionnel, aucun redémarrage et aucune écriture GitHub n’ont été réalisés pendant cette étape.
