# PUR-02-G — Addendum : vérification du comportement de `table.delete()` en LanceDB

**Date :** 16 novembre 2026  
**Nature :** Lecture seule — vérification de source  
**Objet :** Établir le comportement de `table.delete()` lorsque le prédicat ne correspond à aucune ligne, sur la version réellement utilisée par AnythingLLM 1.19.0  
**Contrainte :** Lecture seule. Aucun test, patch, modification, publication.

---

## 1. Version de `@lancedb/lancedb` dans AnythingLLM 1.19.0

### Résultat

**Version utilisée : `0.15.0` (pin exact)**

### Niveau de preuve

| Source | Contenu | Statut |
|--------|---------|--------|
| `server/package.json` du dépôt HuggingFace [`leowuming/rag`](https://huggingface.co/spaces/leowuming/rag/blob/main/server/package.json), fork direct d'AnythingLLM | `"@lancedb/lancedb": "0.15.0"` — pin exact, sans caret | ✅ Confirmé sur source |
| Dépôt officiel `mintplex-labs/anything-llm` tag `v1.19.0` | Non accessible (GitHub bloqué en lecture WebFetch depuis cette session) | ⚠️ Non confirmé sur source officielle |

**Réserve explicite :** La version `0.15.0` est confirmée sur un fork HuggingFace d'AnythingLLM, non sur le tag officiel `mintplex-labs/anything-llm@v1.19.0`. Ces deux sources sont vraisemblablement identiques — le fork est contemporain et les pins exacts dans `package.json` ne divergent pas accidentellement — mais l'identité n'est pas vérifiée de source primaire.

---

## 2. Comportement de `table.delete()` sur un prédicat sans correspondance

### Question

Est-ce que `table.delete('id IN (vec1, vec2, vec3)')` lève une exception lorsque `vec1, vec2, vec3` sont absents de la table LanceDB ?

### Analyse par couche

#### Couche JavaScript — `@lancedb/lancedb` (Node.js binding)

- **Signature TypeScript** (d'après `@lancedb/lancedb@0.31.0/dist/table.d.ts`, architecture stable depuis 0.x) :
  ```typescript
  abstract delete(predicate: string): Promise<DeleteResult>
  ```
- **Documentation** : « Delete the rows that satisfy the predicate. Returns a promise resolving to an object containing the table's new version number. »
- **Comportement no-match documenté** : non mentionné. Aucune source de documentation (`docs.lancedb.com`, `lancedb.github.io`) ne décrit le comportement lorsque le prédicat ne correspond à aucune ligne.

#### Couche Rust — `vectordb` / `NativeTable` (wrapper LanceDB autour de Lance)

Source confirmée : `docs.rs/crate/vectordb/0.4.8/source/src/table.rs` (version encapsulée dans `@lancedb/lancedb@0.15.0`) :

```rust
async fn delete(&self, predicate: &str) -> Result<()> {
    let mut dataset = self.clone_inner_dataset();
    dataset.delete(predicate).await?;
    self.reset_dataset(dataset);
    Ok(())
}
```

Observations :
- Retourne `Result<()>` — aucune valeur de retour portant un compte de lignes supprimées
- Aucune vérification avant ou après `dataset.delete()` du nombre de lignes affectées
- L'unique chemin d'erreur est l'opérateur `?` sur `dataset.delete(predicate).await` — une erreur ne se produit que si `dataset.delete()` lui-même retourne `Err(...)`

#### Couche Lance (bibliothèque Rust sous-jacente)

Source confirmée : `lancedb.github.io/lance/api/python/LanceDataset.delete.html` et `docs.rs/lance/3.0.0` :

- `Dataset::delete(&mut self, predicate: &str) -> Result<DeleteResult>` — retourne `DeleteResult`
- Description : « marks rows as deleted, but does not physically remove them from the files » (soft delete via deletion vector)
- **Comportement no-match** : aucune source consultée ne documente un chemin d'erreur pour un prédicat sans correspondance

#### Sémantique SQL sous-jacente

Le prédicat de suppression est interprété comme une clause `WHERE` SQL standard. Dans tous les moteurs SQL connus (SQLite, PostgreSQL, DuckDB, Arrow/Lance), `DELETE WHERE id IN (...)` sur des IDs inexistants retourne un succès avec 0 lignes affectées — c'est la sémantique standard d'un prédicat de filtrage.

### Verdict

| Propriété | Statut | Base |
|-----------|--------|------|
| `table.delete()` ne lève pas d'exception lorsque le prédicat correspond à des lignes existantes | ✅ Confirmé | Chemin normal documenté |
| `table.delete()` ne lève pas d'exception lorsque le prédicat correspond à des lignes absentes | ⚠️ **Déduit, non confirmé sur source** | Implémentation Rust + sémantique SQL standard |
| `table.delete()` est idempotent (second appel avec mêmes IDs = no-op sans erreur) | ⚠️ **Déduit, non confirmé sur source** | Corollaire de la déduction ci-dessus |

**Résumé du niveau de preuve :**

> L'implémentation Rust de `NativeTable.delete()` (vectordb ≥ 0.4.7, encapsulée dans `@lancedb/lancedb@0.15.0`) ne contient aucun chemin de code qui retournerait une erreur en cas de prédicat sans correspondance. L'unique source d'erreur possible est la bibliothèque Lance sous-jacente, pour laquelle aucune source documentant une erreur sur prédicat vide n'a été trouvée. La conclusion — `table.delete()` est un no-op sans exception lorsque les IDs sont absents — est **cohérente avec toutes les sources consultées** mais reste une **déduction par absence de preuve contraire**, non une confirmation positive d'une propriété documentée.

---

## 3. Impact sur les conclusions de PUR-02-G

### Formulations mises à jour

Le §9 de PUR-02-G (« Fichiers absents — limites de l'analyse ») indiquait :

> « L'analyse de comportement LanceDB (`table.delete()` idempotent sur IDs absents) est déduite du fonctionnement standard de Apache Arrow LanceDB 0.x — non vérifié sur une source pinpoint de la version 1.19.0. »

La présente vérification affine cette réserve comme suit :

**Formulation mise à jour :**
> L'idempotence de `table.delete()` sur IDs absents est déduite de l'implémentation Rust de `NativeTable.delete()` dans `vectordb` (source lue sur `docs.rs/crate/vectordb/0.4.8`) et de la sémantique SQL standard des prédicats `WHERE id IN (...)`. Aucune source ne documente positivement cette propriété pour `@lancedb/lancedb@0.15.0`. La version 0.15.0 est confirmée sur un fork HuggingFace d'AnythingLLM — non sur le tag officiel `mintplex-labs/anything-llm@v1.19.0` (GitHub non accessible en lecture directe depuis cette session).

### Conclusions de PUR-02-G préservées

Les conclusions des §1–8 de PUR-02-G ne sont pas remises en cause par la présente vérification. La réserve sur l'idempotence LanceDB est précisée, pas levée.

---

## 4. Sources consultées pour cet addendum

| Source | URL | Résultat |
|--------|-----|---------|
| HuggingFace fork `leowuming/rag` — `server/package.json` | https://huggingface.co/spaces/leowuming/rag/blob/main/server/package.json | Version `0.15.0` confirmée |
| `lancedb.github.io/lancedb/js/classes/Table/` | https://lancedb.github.io/lancedb/js/classes/Table/ | Signature `delete(predicate): Promise<DeleteResult>` — no-match non documenté |
| `app.unpkg.com/@lancedb/lancedb@0.31.0/dist/table.d.ts` | https://app.unpkg.com/@lancedb/lancedb@0.31.0/files/dist/table.d.ts | Même signature — no-match non documenté |
| `docs.rs/crate/vectordb/0.4.8/source/src/table.rs` | https://docs.rs/crate/vectordb/0.4.8/source/src/table.rs | Implémentation Rust : aucun chemin d'erreur sur no-match |
| `lancedb.github.io/lance/api/python/LanceDataset.delete.html` | https://lancedb.github.io/lance/api/python/LanceDataset.delete.html | « marks rows as deleted » — no-match non documenté |
| `docs.rs/lance/3.0.0/lance/dataset/struct.Dataset.html` | https://docs.rs/lance/3.0.0/lance/dataset/struct.Dataset.html | Signature `Result<DeleteResult>` — no-match non documenté |
| `docs.anythingllm.com/changelog/v1.19.0` | https://docs.anythingllm.com/changelog/v1.19.0| Aucune dépendance mentionnée |
| GitHub `mintplex-labs/anything-llm` tag `v1.19.0` | Bloqué (GitHub non accessible en WebFetch depuis cette session) | Non consulté |

---

*Addendum PUR-02-G — Lecture seule — 16 novembre 2026*  
*Aucun candidat modifié. Aucun test lancé. Aucune publication effectuée.*
