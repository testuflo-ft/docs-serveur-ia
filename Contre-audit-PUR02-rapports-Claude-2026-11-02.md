# Contre-audit — rapports Claude du 2 novembre 2026

## Périmètre et méthode

Lecture des quatre rapports téléversés sur `main` dans `testuflo-ft/docs-serveur-ia` (commit `9b6ef3dc16df615a7549094edd99db6c0d4216bf`) et relecture directe des fichiers candidats de la branche `correctif-PUR-02` :

- `candidate-purgeDocument.js`
- `candidate-lance-index.js`
- `candidate-documents.js`
- `pur02-candidate.test.js`
- `PUR-02-patch-complet.diff`

Aucun test n'a été exécuté. Aucune modification de production ou de GitHub n'a été effectuée.

## 1. Ce que les rapports Claude établissent correctement

- Les fichiers extraits du laboratoire sont un ensemble distinct des trois candidats PUR-02 v4.
- Le `purgeDocument.js` du laboratoire conserve `Workspace.where()` et l'ordre de nettoyage qui ne correspond pas au candidat v4.
- Le correctif INT-18 du laboratoire concerne `moveProcessedDocsToFolder`, pas l'endpoint API externe `POST /v1/document/move-files`.
- Les routes `env-dump` du laboratoire portent bien `[validApiKey]`, mais ce middleware ne signifie pas authentification d'une session administrateur.
- La limite L-1 (absence de transaction distribuée entre LanceDB et SQL) est bien explicitement documentée.
- La récursion de la version laboratoire est distincte du comportement non récursif du candidat v4.

## 2. Correction de mon audit intermédiaire : point LanceDB

Mon audit intermédiaire affirmait que le correctif du singleton LanceDB annoncé n'apparaissait pas parce qu'aucun `Proxy` n'était présent. Cette formulation était erronée : l'absence de `Proxy` ne démontre pas l'absence du correctif.

Le candidat `candidate-lance-index.js` réécrit effectivement `deleteDocumentFromNamespace()` (lignes 292–351 environ) et propage explicitement les erreurs de lecture SQL et de suppression LanceDB. Il conserve `static #connection = null` et la réinitialisation dans `reset()`.

**Conclusion corrigée :** le diff ne change pas la stratégie du singleton `connect()` elle-même ; il modifie la gestion des erreurs dans `deleteDocumentFromNamespace()`. Le rapport Claude décrit ce changement plus précisément que mon audit intermédiaire. Il reste à confirmer que cette réécriture corrige exactement le défaut PUR-02-D initial, à partir du scénario de panne qui l'a révélé. Je retire donc mon affirmation « le correctif annoncé est absent ».

## 3. Défaut confirmé dans le candidat v4 : `purgeFolder()` retourne silencieusement

Le rapport de réconciliation Claude indique que le candidat v4 « abort explicitement » en présence d'un sous-répertoire et que PUR-02-E est corrigé. La lecture du fichier candidat montre toutefois que l'abandon est un simple `return`, pas une exception.

Dans `candidate-purgeDocument.js` :

- lignes 124–129 : si le dossier est absent de la liste autorisée, inexistant ou hors du répertoire attendu, la fonction fait `return` ;
- lignes 134–145 : si le dossier contient une entrée inattendue (sous-répertoire ou lien symbolique), elle écrit un message avec `console.error(...)`, puis fait `return` ;
- aucune valeur de résultat explicite n'est renvoyée pour distinguer « dossier supprimé » de « opération abandonnée ».

Le test Scenario 6 de `pur02-candidate.test.js` appelle `await purgeFolder(TARGET)` puis vérifie seulement que `unlinkSync` et `rmdirSync` n'ont pas été appelés. Il ne vérifie pas que la fonction rejette ou renvoie un résultat d'échec. Le test valide donc la non-suppression, pas la bonne remontée de l'échec à l'appelant.

Le même défaut de contrat concerne le nom vide (`if (!folderName) return;`) et les cas de dossier protégé/absent qui aboutissent à un retour anticipé.

### Conséquence HTTP

Le patch v4 ne modifie pas les handlers HTTP. Dans le handler laboratoire de `DELETE /v1/document/remove-folder`, l'appelant fait `await purgeFolder(name)` puis renvoie un JSON de succès si aucune exception n'est levée. Si ce handler est conservé avec le candidat v4, un sous-répertoire ou un dossier absent/protégé peut donc produire une réponse HTTP de succès alors que rien n'a été supprimé.

Il s'agit d'un faux succès observable, pas seulement d'un détail de journalisation. Cela contredit l'affirmation du rapport de validation selon laquelle PUR-02-E serait entièrement corrigé si le critère inclut la remontée fiable de l'échec.

### Correction à envisager avant de considérer PUR-02-E clos

Choisir et documenter un contrat unique :

1. soit `purgeFolder()` lève une erreur typée pour tout refus/abandon (nom invalide, dossier absent/protégé, entrée inattendue) ;
2. soit elle renvoie un objet de résultat explicite (`{ success: false, code, message }`) et les routes HTTP traduisent ce résultat en statut non-2xx.

Puis ajouter des tests qui vérifient à la fois le résultat de fonction et la réponse HTTP pour les cas dossier absent, protégé, sous-répertoire et lien symbolique. Ne pas se contenter de vérifier qu'aucun fichier n'a été supprimé.

## 4. Évaluation de la décision « pas de v5 »

La conclusion « pas de v5 pour ajouter la récursion » reste raisonnable : la récursion laboratoire répond à un cas hors du modèle de stockage annoncé et n'est pas justifiée par un besoin démontré.

Mais cette décision ne doit pas être confondue avec la clôture complète de PUR-02 v4. Le point de contrat silencieux de `purgeFolder()` ci-dessus est indépendant du choix récursion/abort. Il peut être corrigé sans introduire de récursion ni nécessairement créer une version v5 fonctionnelle : il peut s'agir d'une correction ciblée du candidat avant l'essai isolé, avec mise à jour du diff et revalidation des tests concernés.

## 5. État des quatre rapports sur GitHub

Le commit `9b6ef3dc16df615a7549094edd99db6c0d4216bf` sur `main` ajoute bien les quatre rapports. Le rapport d'état GitHub décrit encore les rapports comme « à produire / pas encore dans GitHub » : c'est une photographie prise avant leur téléversement, devenue obsolète après le commit d'upload. Ce n'est pas une incohérence technique, mais la ligne d'état devrait être actualisée lors de la prochaine révision documentaire.

## Conclusion

- Je corrige mon propre faux positif sur l'absence du correctif LanceDB : la réécriture de `deleteDocumentFromNamespace()` est bien présente.
- Je maintiens les constats d'indépendance entre PUR-02 v4 et les cinq fichiers du laboratoire.
- Je relève un défaut vérifiable non signalé par Claude : les refus de `purgeFolder()` dans le candidat v4 peuvent se terminer par une résolution normale, sans résultat d'échec. Le test correspondant ne vérifie pas la propagation de cet échec.
- La récursion ne justifie pas un v5 ; le contrat de retour de `purgeFolder()`, lui, doit être clarifié et testé avant de qualifier PUR-02-E de complètement clos.

**Décision recommandée :** ne pas déployer en production. Avant l'essai isolé, demander à Claude une correction ciblée du contrat d'échec de `purgeFolder()` et des tests associés, sans fusionner la récursion du laboratoire.
