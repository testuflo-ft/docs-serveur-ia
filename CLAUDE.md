# Projet AnythingLLM — Correctifs serveur IA domestique

## Lire en arrivant (dans cet ordre)

1. `docs-serveur-ia/Plan-correctifs-AnythingLLM.md` — vue d'ensemble, matrice des correctifs, décisions ouvertes
2. `docs-serveur-ia/Journal-des-Incidents.md` — chronologie détaillée, état de chaque correctif, vérifications restantes
3. `docs-serveur-ia/Livret-Technique-Serveur-IA.md` — référence technique complète (architecture, procédures, matrices de tests)

> **Note localisation** : tous les fichiers sont dans `docs-serveur-ia/`. Le fichier `Plan-correctifs-AnythingLLM-1.17.0-v0.6-2026-10-28.md` (nom d'origine du 28/10) est devenu `Plan-correctifs-AnythingLLM.md` à la publication GitHub.

---

## Résumé de situation (13-14/11/2026)

### Correctifs actifs

| ID | Statut | Fichiers candidats |
|----|--------|--------------------|
| **PUR-02-E** | ✅ Validé (60/60 + 4 E2E) — **non déployé** | `candidate-purgeDocument-v4e.js`, `candidate-documents.js`, `candidate-lance-index-v4f.js` |
| **INT-18** | ⚠️ Code v3 consolidé + fichiers fixlab récupérés — non validé HTTP ni déployé | Voir §Archives et §Fixlab ci-dessous |
| **INT-19** | ⚠️ Partiel — couvert partiellement par v3 — non déployé | Lié à INT-18 |
| **OPS-02** | ⚠️ Candidat prêt — tests HTTP non effectués | — |
| **ALLM-12** | ⚠️ Protocole préparé — CP-3 non appliqué | Routes env-dump : validApiKey uniquement |
| **DOS-02** | 📋 À clarifier | Limite `EMBED_BODY_LIMIT` sur `/api/embed` |

### Branches GitHub

- `main` : docs + `candidate-purgeDocument-v4e.js`
- `correctif-PUR-02` : `candidate-documents.js` + `candidate-lance-index-v4f.js`

---

## Empreintes SHA-256 — candidats PUR-02-E

| Fichier | SHA-256 |
|---------|---------|
| `candidate-purgeDocument-v4e.js` (fix#1b) | `90a21b0488dfd78ee744b35ae02cd9a6b1e629ead17a88cec5bda49ae4875f79` |
| `candidate-documents.js` | `de9c586043cbf63f70c4070cc18bc2f0871bc3a8b1d8caa79f32248fba8152eb` |
| `candidate-lance-index-v4f.js` | `8103f042a0fed63db1d6f79db61ceb6eef97687e87893bec9747abe1d2c9149f` |
| `PUR-02-E-purgeDocument-v4e-fix1b.patch` | `86043b316bb40bbee3a9cc706d756255bbded05e278e3033ee018f14b1dbd8aa` |

---

## Archives de consolidation INT-18/INT-19/PUR-02

Trois archives ZIP dans `~/Downloads` sur le Mac de Florian :

| Archive | SHA-256 | Tests |
|---------|---------|-------|
| `AnythingLLM-consolidation-candidate-INT18-INT19-PUR02.zip` | `0ccb879db256ef6e86d55486d25fb81d495e413095f9550d516949331d481282` | v1 : 19/19 (Node 22) |
| `AnythingLLM-consolidation-candidate-INT18-INT19-PUR02-v2.zip` | `944e0986f2c8189e72ba83e9902dea8f48da0b4fd12d0f63efa3ed444c21e349` | v2 : 21/21 (Node 22.16.0) |
| `AnythingLLM-consolidation-candidate-INT18-INT19-PUR02-v3.zip` | `451a586c1327f977738429da027fd6bbfa9b5d9c3a6bca4ca07b089f6b9f9fba` | v3 : 22/22 (Node 18.20.8 + 22.16.0) |

Toutes trois datées du **29 octobre 2026**.
Archive source `CONSOLIDATION-SOURCES-20261028-210233.tar.gz` SHA `22f05ceb…` : **non retrouvée** (ne pas déclarer définitivement perdue).

**Contenu v3 — mapping fichiers/sujets :**

| Fichier | Sujet |
|---------|-------|
| `server/utils/files/safeMove.js` | INT-18 |
| `server/utils/files/index.js` | INT-18 |
| `server/endpoints/api/document/index.js` | INT-18 / INT-19 (et adaptations PUR-02) |
| `server/utils/files/purgeDocument.js` | PUR-02 |
| `server/endpoints/system.js` | PUR-02 |
| `server/endpoints/api/system/index.js` | ALLM-12 (conservé identique) |

**SHA clés de la v3 :**

| Fichier | SHA-256 |
|---------|---------|
| `purgeDocument.js` (v3 archive) | `efb8076c4118a10904da4b9721c17f788a20390aac2e1408459ee0e73967bb7d` |
| `safe-move.test.js` (v3) | `58566fd405d301b97333e9763495aa097ff8b92bdfaae978b92fbb39c5edd150` |

**Limites v3 :** pas d'intégration complète Express/SQL/LanceDB/cache, rollback incomplet dans cas exceptionnels, hypothèse même système de fichiers pour hardlinks, absence de garantie TOCTOU.

---

## Récupération fixlab (13/11/2026)

Conteneur `anythingllm-fixlab` (ID `30b4c526bbcf…`) : existant, arrêté depuis ~2 semaines, **non redémarré ni modifié**.
Image = production `sha256:ddf73304…`.
16 fichiers extraits vers `/Users/florian/INT18-recovery-20261113`.

**Empreintes confirmées :**

| Fichier | SHA-256 |
|---------|---------|
| `app/server/utils/files/index.js` | `959ee973681994076402031a6d59d6eafd3cdb1b83589103f56f42f6115ff70f` |
| `app/server/utils/files/purgeDocument.js` | `0717505ad08e8ff6cbb139528c77977fdab68da25529a4b4199ba5968fecde11` |
| `app/server/endpoints/api/system/index.js` | `825b898eed93569ddc9ed14912266bd94e2c02bd7dbb0e864810ad11cf729bcc` |
| `app/server/endpoints/api/document/index.js` | `b9c901945162631a685bff039e5df4b3ebc875c7408d93eab66217e5066ddb89` |
| `tmp/allm12-api-system.pre-patch.js` | `0bd17c2b3bfe7f73662e8d6b8e316854b619d358c3f3f9b9a40535aee7009681` |
| `tmp/allm12-system.js` | `7bf6715adea5057c1b58c9fe0b35430bf0ac8747e1ff75efdb1e1420339061e5` |
| `tmp/allm12-system.pre-patch.js` | `4ce6b6072b8ace2f0309880f426d2280b2d4fbaddbfb75e4a15a75a2d2c540f6` |
| `tmp/pur02-api.pre-patch.js` | `fc338b0a9b7d607d810cbd15ef3b2e0ea62a1613319e7b48f45f5374ab47aaf2` |
| `tmp/pur02-purge.pre-patch.js` | `9ee7c732408e5d3b4eab3bab44b9b11f4ff8b1a158e4adf46ae7c38a3a7b788b` |
| `tmp/pur02-system.pre-patch.js` | `4868a1f9dcaca1c9423a92cdfd2d5932dd070ba46a328028af14a003a5a960ee` |

> **⚠️ Trois versions distinctes de purgeDocument.js :**
> - v3 archive (29/10) : `efb8076c…`
> - fixlab (lab réel, date inconnue) : `0717505a…` ← intermédiaire non analysé
> - v4e/fix1b candidat : `90a21b04…`

---

## Résultats de validation PUR-02-E (10/11/2026)

- 60/60 tests simulés/handlers PASS (Suites A 22, B 16, C 14, L/R 8)
- 4/4 scénarios E2E PASS — laboratoire jetable `pur02-e2e-runtime-20261110`
- SQLite/Prisma réels + LanceDB réel, 40 migrations Prisma, `--network none`, sans données de production
- Laboratoire et image temporaire détruits après les tests
- **Ces résultats sont distincts et indépendants des 22/22 tests de consolidation v3**

---

## ALLM-12 — contrainte critique

> **⚠️ `dumpENV()` écrit dans `/app/server/.env` à l'intérieur du conteneur.**
> Appeler ces routes en production pendant un audit peut **modifier le fichier .env**. Ne jamais appeler ces routes sur la production.

CP-3 non appliqué automatiquement. Les deux routes `env-dump` : `validApiKey` uniquement, restriction admin non établie.
Décision D1 ouverte.

---

## Décisions ouvertes (arbitrage Florian requis)

1. **INT-18/INT-19** : valider les archives v3 comme base + comparer fixlab `0717505a…` vs v3 `efb8076c…` pour comprendre l'évolution intermédiaire
2. **CONSOLIDATION-SOURCES** : continuer la recherche ou acter la perte
3. **ALLM-12 D1** : option A (CP-3), B (audit seul), C (statu quo documenté)
4. **Déploiement** : consolidation v3 ↔ PUR-02-E combiné ou séparé ?
5. **purgeDocument.js fixlab `0717505a…`** : analyser les différences avec v3 et v4e avant de figer le candidat final

---

## Contraintes permanentes

- **Ne pas déployer PUR-02 ni aucun correctif en production**
- **Ne pas modifier AnythingLLM en production**
- **Ne pas modifier les candidats techniques** (`candidate-*.js`, fichiers de tests)
- **Aucune modification GitHub sans validation explicite de Florian**
- **Ne pas lancer de test destructif**
- **Ne pas supprimer de fichier**
- **Ne pas exposer de secrets, contenu de `.env` ou clés d'API**
- **Ne pas présenter des tests simulés comme des tests d'intégration réels**
- **Ne pas inventer de résultat, d'empreinte ou de preuve**
- **Signaler immédiatement tout risque identifié**
- SSH uniquement, une action à la fois
- Ne pas monter le NAS en environnement de test
- Ne pas utiliser la base, les volumes Docker ou les documents de production
- Ne pas appeler les routes env-dump sur la production (risque de modification du .env)

---

## Interlocuteurs

- **Florian** — propriétaire du projet, valide toutes les décisions et publications
- **ChatGPT** — co-pilote technique ; ses assertions sur l'état des conteneurs sont à considérer comme non vérifiées par Claude sauf confirmation directe
