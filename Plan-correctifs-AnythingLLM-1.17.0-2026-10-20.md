# Correctifs ciblés — AnythingLLM 1.17.0
Date : 2026-10-20  
Statut : proposition technique préparatoire — **non appliquée, non testée**.

## Décision d'architecture

Ne pas traiter une clé API AnythingLLM générique comme une identité utilisateur. Le middleware `validApiKey` valide actuellement l'existence du secret, mais n'impose pas de propriétaire, de rôle, ni de périmètre d'espaces. Pour l'automatisation n8n, créer une autorisation distincte, limitée à l'import documentaire et à une liste explicite de slugs. Ne pas donner à n8n une clé administrateur générale.

## P0 — Import n8n limité aux espaces autorisés

Fichiers concernés :
- `server/utils/middleware/validApiKey.js` (ne pas modifier son comportement global sans audit de toutes les routes)
- `server/endpoints/api/document/index.js` (routes `POST /v1/document/upload` et `POST /v1/document/upload/:folderName`)
- nouveau middleware proposé : `server/utils/middleware/validDocumentImportKey.js`

Comportement attendu :
1. Authentifier la clé dédiée à l'import depuis une variable d'environnement dédiée, distincte des clés API générales.
2. Exiger une liste de slugs autorisés, configurée côté serveur.
3. Refuser par défaut si la clé dédiée ou la liste des espaces n'est pas configurée.
4. Si `addToWorkspaces` est fourni, vérifier que chaque slug demandé appartient à la liste autorisée avant que le collector ne traite le fichier.
5. Refuser les slugs inconnus et les espaces non autorisés avec HTTP 403/422 ; ne pas les ignorer silencieusement.
6. Ne pas accepter la clé d'import sur les routes d'administration, de suppression ou de lecture générale.
7. Ne jamais journaliser la clé ou la valeur `Authorization`.

**Point à trancher avant implémentation :** la route d'import doit-elle obligatoirement recevoir `addToWorkspaces`, ou accepter l'upload sans indexation ? Pour n8n, recommandation : exiger au moins un espace autorisé, afin d'éviter des fichiers importés mais non indexés.

## P1 — Ne jamais déclarer un import réussi si l'indexation a échoué

Dans `server/endpoints/api/document/index.js`, les deux routes d'upload appellent actuellement `Document.api.uploadToWorkspace(...)` sans exploiter son résultat. Elles renvoient ensuite `success: true`.

Dans `server/models/documents.js`, `Document.api.uploadToWorkspace` renvoie `true` en cas de réussite, mais plusieurs chemins d'erreur ne renvoient pas explicitement `false` (ils renvoient la valeur de `console.log`, généralement `undefined`).

Correctif proposé :
- standardiser la valeur de retour en résultat structuré `{ success, workspace, error }` ou, au minimum, en booléen strict ;
- propager les erreurs d'indexation aux routes ;
- utiliser un statut HTTP non-2xx si un espace demandé n'a pas été indexé ;
- conserver dans la réponse la liste des documents convertis, mais distinguer conversion réussie et indexation réussie ;
- ne pas supprimer automatiquement le fichier source en cas d'échec : prévoir une procédure de reprise explicite.

## P1 — Éviter les vecteurs orphelins lors d'un échec de persistance

Dans `server/models/documents.js`, `Document.addDocuments` ajoute les vecteurs avant de créer la ligne `workspace_documents`. Si cette création échoue, le code signale l'échec mais ne semble pas annuler les vecteurs déjà insérés ni ajouter le document à `failedToEmbed`. Dans le provider LanceDB, la suppression dépend ensuite des correspondances `document_vectors`.

Correctif proposé :
1. considérer l'insertion des vecteurs et la création des associations comme une opération en plusieurs étapes avec compensation ;
2. si la création de `workspace_documents` échoue après l'insertion, tenter de supprimer les vecteurs du `docId` concerné et les lignes `document_vectors` associées ;
3. enregistrer cet échec dans le résultat `failedToEmbed` et dans les logs ;
4. si la compensation échoue, signaler explicitement un état de réparation nécessaire plutôt que de prétendre que tout est propre.

**Limite :** une transaction Prisma ne peut pas rendre atomique une insertion externe dans LanceDB. Il faut donc une compensation testée, pas seulement une transaction SQL.

## P2 — Politique de réimport

Le collector génère des noms internes incluant un UUID ; deux imports du même nom de fichier peuvent donc produire des chemins différents. Ne pas supposer que réimporter remplacera automatiquement l'ancienne version.

Avant d'implémenter un remplacement :
- définir une identité stable du document source (par exemple chemin NAS normalisé + empreinte du contenu) ;
- déterminer si la politique est « remplacer », « conserver les versions » ou « refuser les doublons » ;
- remplacer uniquement dans les espaces explicitement autorisés ;
- retirer les anciens vecteurs uniquement après avoir identifié les associations correspondantes ;
- gérer les imports partiels vers plusieurs espaces sans supprimer une version qui reste utilisée ailleurs.

Recommandation pour le premier déploiement : ne pas activer le remplacement automatique. D'abord rendre les résultats et erreurs fiables, puis construire le mécanisme d'upsert avec tests.

## P2 — Suppression de dossier

`DELETE /v1/document/remove-folder` est protégé par `validApiKey` seul dans la version auditée. Il ne doit pas être exposé à la clé dédiée d'import n8n. Les routes destructives doivent conserver une autorisation séparée, explicite et testée.

`purgeFolder` parcourt les entrées directes puis supprime le dossier récursivement ; la cohérence des fichiers JSON, caches, associations et vecteurs doit être vérifiée pour les sous-dossiers imbriqués avant d'utiliser cette route pour du nettoyage automatisé.

## Matrice de tests obligatoire

### Autorisation
- clé d'import absente ou invalide → refus ;
- clé d'import valide + slug autorisé → autorisé ;
- clé valide + slug non autorisé → refus avant traitement du fichier ;
- mélange d'un slug autorisé et d'un slug interdit → refus complet, sans import partiel ;
- clé d'import utilisée sur une route de suppression ou d'administration → refus ;
- mode multi-utilisateur activé et désactivé → mêmes limites explicites pour la clé d'import.

### Import et indexation
- collector hors ligne → HTTP non-2xx, aucune fausse réussite ;
- conversion échouée → HTTP non-2xx ;
- espace inconnu → HTTP non-2xx ;
- échec d'embedding → HTTP non-2xx et erreur lisible ;
- création de l'association SQL échouée après insertion des vecteurs → erreur rapportée et compensation tentée ;
- deux espaces demandés, un seul en échec → résultat indiquant précisément l'espace en échec ;
- document sans `addToWorkspaces` → comportement conforme à la décision produit documentée.

### Intégrité
- import initial ;
- réimport du même fichier sans changement ;
- réimport du même chemin avec contenu modifié ;
- suppression d'un document avec association et vecteurs ;
- suppression avec association manquante mais vecteurs présents ;
- suppression d'un dossier contenant des sous-dossiers ;
- échec de compensation et procédure de réparation.

## Conditions de validation avant déploiement

- tests automatisés réussis sur une branche isolée ;
- tests manuels sur une instance de test, jamais sur les données du serveur en production ;
- sauvegarde de la base et des fichiers avant toute migration ou opération de nettoyage ;
- validation indépendante de Claude après fourniture du patch et des résultats de tests ;
- aucun import n8n réel avant validation de l'autorisation, des erreurs et de l'intégrité des vecteurs.

## Sources de code examinées

Version de référence : `v1.17.0` du dépôt public `Mintplex-Labs/anything-llm`.

- `server/utils/middleware/validApiKey.js` — vérifie l'existence du secret Bearer.
- `server/endpoints/api/document/index.js` — routes d'import et propagation actuelle du résultat.
- `server/models/documents.js` — insertion des vecteurs, association SQL et retour de `uploadToWorkspace`.
- `server/utils/vectorDbProviders/lance/index.js` — cache et insertion/suppression des vecteurs.
- Comparaison de versions : https://github.com/Mintplex-Labs/anything-llm/compare/v1.17.0...v1.18.0

Ce document est une spécification de correctifs, pas un patch exécutable et pas une preuve que les problèmes ont été corrigés.
