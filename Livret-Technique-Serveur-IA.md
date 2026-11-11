# Livret Technique — Serveur IA Mac mini + Synology

*Version 1.0 — 11 novembre 2026*

**Statuts utilisés dans ce document :**
- ✅ Vérifié — constat direct, sortie de commande ou code examiné
- ⚙️ Configuré non testé — présent dans les fichiers, fonctionnement non confirmé
- 🔲 À faire — objectif décidé, pas encore réalisé
- ⚠️ Hypothèse — explication plausible, à confirmer
- 🗄️ Obsolète — ancienne configuration conservée pour comprendre un incident

**Sources de preuve (légende utilisée dans ce document) :**
- **[C17]** code amont, tag `v1.17.0` (commit `fa7ec877f005a21ede94888b3b8618b700343857`), relu en lecture seule le 25/10/2026.
- **[CM]** code amont, branche principale, commit `a5bb8b9c7b1262635ea58fc17d4899619cbf58e9` (23/10/2026 ; `package.json` = 1.19.0). Aucun tag `v1.19.0` n'existe (dernier tag : `v1.18.0`, vérifié le 25/10/2026). Ce n'est **pas** une preuve du contenu de l'image exécutée.
- **[IMG]** relevé sur l'image active 1.19.0 (`sha256:ddf73304a4a96e2f90755d620dd3921de9afb4b8b8e914fa62d6ce7944ba95af`) rapporté par la passation du 25/10/2026 ; **non revérifié** par Claude, qui n'a pas accès à minimac.
- **[VAL]** conclusion validée par Florian le 25/10/2026 à 21:37 ; reprise telle quelle, sans nouvelle vérification.
- **[PROD]** relevé sur la production (minimac) rapporté par le bilan ChatGPT du 28/10/2026 pour le changement du 27/10/2026 ; **non revérifié** par Claude.
- **[LAB]** test ciblé exécuté dans le conteneur `anythingllm-fixlab` (Node.js et mocks) et rapporté par le même bilan ; ni les correctifs de laboratoire ni les sorties de test n'ont été relus par Claude. Ce n'est ni un test HTTP de bout en bout, ni un déploiement.
- **[TEST]** résultat d'un test exécuté **et constaté par la session qui rédige ces documents**. À ce jour : **aucun**. Les tests de laboratoire rapportés portent l'étiquette [LAB] ; l'état réel du laboratoire (conteneur démarré ou non) n'est pas connu de cette session.

Les numéros de ligne sont donnés pour la référence indiquée ([C17] ou [CM]). Les lignes relevées sur l'image ([IMG]) sont approximatives (« ≈ »).

**Numérotation canonique.** `CP-3` désigne le correctif d'authentification des routes `env-dump` (ALLM-12). La limite de corps `EMBED_BODY_LIMIT` sur `/api/embed` relève de `DOS-02`. La passation du 25/10 (matin) appelait à tort « CP-3 » cette limite de corps ; la numérotation du dépôt est conservée. `ALLM-06` (constat initial du 11-15 octobre) et `ALLM-15` (analyse de code du 20-21 octobre) décrivent le **même** risque de cache vectoriel ; `ALLM-06` est l'identifiant de suivi.

---

## 0. Table des matières

| Section | Titre |
|---------|-------|
| 1 | Vue d'ensemble |
| 2 | Infrastructure matérielle |
| 3 | Réseau |
| 4 | Montage SMB automatique |
| 5 | Docker et OrbStack |
| 6 | Open WebUI |
| 7 | AnythingLLM |
| 8 | Ollama et modèles |
| 9 | OCR |
| 10 | Partages Synology et accès documentaires |
| 11 | Documentation technique — dépôt GitHub |
| 12 | Homer — portail central |
| 13 | Récapitulatif des actions en attente |
| 14 | Audit de sécurité AnythingLLM — état au 28 octobre 2026 |
| 15 | Procédures d'exploitation |

**Index des incidents documentés dans ce livret :**
SMB-01 à SMB-04 → section 4.4
OWUI-01 à OWUI-04 → sections 6.1, 6.4
ALLM-01 → 7.1 ; ALLM-04/13 → 14.4/14.5 ; ALLM-05 → 14.7 ; ALLM-06/15 → 14.11 ; ALLM-08 → 14.6 ; ALLM-09 → 14.7 ; ALLM-10 → 14.8 ; bilan du 28/10 → 14.21 ; ALLM-12 → 14.9 ; ALLM-14 → 14.10 ; ALLM-16 → 14.12
DOS-02 → 14.16 ; INT-17/18A/B/C → 14.17 ; INT-19A/B/C → 14.18 ; INT-20 → 14.19 ; UPLOAD-02A/B/RACE-01 → 14.20

---

## 1. Vue d'ensemble

### 1.1 Objectif général

Serveur IA local accessible à plusieurs utilisateurs (Florian, Chia-hua, Kostia), avec souveraineté des données, modèles européens en priorité (Mistral), et sauvegarde cloud européenne (Infomaniak à venir).

### 1.2 Principes directeurs

- Stockage sur NAS Synology, calcul sur Mac mini
- Accès distant via Tailscale uniquement (réseau privé)
- Modèles IA locaux via Ollama (Mistral prioritaire)
- Authentification centralisée via Synology SSO (OIDC)
- Séparation stricte des données entre utilisateurs
- Aucun secret (mot de passe, clé API, token, WEBUI_SECRET_KEY) dans ce document — documenter l'emplacement, jamais la valeur

---

## 2. Infrastructure matérielle

### 2.1 Mac mini (minimac)

| Élément | Valeur |
|---------|--------|
| Modèle | Mac mini M5 Pro |
| RAM | 64 Go |
| SSD | 512 Go |
| Hostname réseau local | minimac.local |
| Ethernet (en0) | 192.168.1.104 — liaison directe NAS |
| Wi-Fi (en1) | gateway 192.168.68.1 — accès Internet |
| Tailscale | minimac.saiga-tilapia.ts.net (100.73.109.89) |
| Mode d'accès | SSH uniquement (pas d'écran connecté) |

**Contrainte importante :** l'absence de session graphique interdit l'utilisation d'`osascript`, du Trousseau macOS (écriture), et de toute interaction nécessitant un audit GUI session.

### 2.2 NAS Synology (SERVOR)

| Élément | Valeur |
|---------|--------|
| Modèle | DS1525neo+ |
| RAM | 4 Go |
| Carte réseau ajoutée | E10G22-T1-Mini (slot PCIe) — 10GbE |
| Disques données | 3 × WD Red Plus 8 To en SHR |
| Cache SSD | 2 × SSD NVMe Synology SNV (slots M.2 intégrés) |
| LAN 3 (carte ajoutée) | 192.168.1.103 — liaison directe Mac mini |
| DSM HTTPS | port 5001 |
| Tailscale | servor.saiga-tilapia.ts.net (100.77.102.38) |

### 2.3 Onduleur

| Élément | Valeur |
|---------|--------|
| Modèle | APC Back-UPS Pro BX850M |
| Connecté à | Synology (USB) |
| Signal d'extinction Mac mini depuis DSM | 🔲 À configurer |

---

## 3. Réseau

### 3.1 Topologie

```
[Mac mini en0 192.168.1.104] ──10GbE──► [NAS LAN3 192.168.1.103]
[Mac mini en1]               ──Wi-Fi──► [Routeur Internet 192.168.68.1]
[Mac mini + NAS]             ──VPN────► [Tailscale tailnet saiga-tilapia.ts.net]
```

### 3.2 Adresses Tailscale et ports

| Service | URL Tailscale | Port |
|---------|--------------|------|
| DSM Synology | https://servor.saiga-tilapia.ts.net:5001 | 5001 |
| Open WebUI | https://minimac.saiga-tilapia.ts.net | 443 via Serve |
| AnythingLLM | https://minimac.saiga-tilapia.ts.net:8445 | 8445 |
| n8n | http://minimac.saiga-tilapia.ts.net:5678 | 5678 |
| Homer (portail) | http://minimac.saiga-tilapia.ts.net:8888 | 8888 |
| Synology Drive | https://servor.saiga-tilapia.ts.net:5010 | 5010 |
| Synology Photos | https://servor.saiga-tilapia.ts.net:5443 | 5443 |
| Note Station | https://servor.saiga-tilapia.ts.net:9351 | 9351 |
| Documentation NAS (Web Station) | http://servor.saiga-tilapia.ts.net:8090 | 8090 |

### 3.3 Tailscale Serve (configuration active)

Configuration multi-chemins mise en place le 13 octobre 2026 :

```bash
# Open WebUI sur /
tailscale serve --bg http://127.0.0.1:3000

# Documentation NAS sur /docs
tailscale serve --bg --set-path /docs http://servor:8090
```

✅ Open WebUI accessible en HTTPS propre via `/`.  
⚠️ **La configuration Tailscale Serve n'est pas persistante** — elle est perdue au redémarrage du Mac mini.

### 3.4 Architecture HTTPS multi-applications — décision en attente

🔲 Seul Open WebUI dispose d'un accès HTTPS propre. Les autres services sont en HTTP local ou HTTPS via port non standard.

**Contrainte :** l'URL OIDC d'Open WebUI (`https://minimac.saiga-tilapia.ts.net/oauth/oidc/callback`) est enregistrée dans le SSO Synology — ne pas la modifier sans raison.

### 3.5 Tailscale Funnel — exposition publique (non fonctionnel)

`tailscale funnel` testée le 13 octobre 2026 → HTTP 502. Non résolu. Piste abandonnée.

---

## 4. Montage SMB automatique

### 4.1 Partage Corpus-IA

| Élément | Valeur |
|---------|--------|
| Hôte NAS | 192.168.1.103 (liaison directe Ethernet) |
| Compte SMB | Florian |
| Partage | Corpus-IA |
| Point de montage | ~/IA/Corpus-IA |
| Version SMB négociée | SMB 3.1.1 signé ✅ |
| Protocole alternatif NFS | Abandonné — ne pas rouvrir |

### 4.2 Fichiers clés

| Fichier | Rôle | Permissions |
|---------|------|-------------|
| `~/.nsmbrc` | Identifiants SMB — section `[192.168.1.103:Florian]` | **600** — ne jamais afficher |
| `~/bin/ensure-nas-mount.sh` | Script de montage/remontage | **700** |
| `~/Library/LaunchAgents/com.florian.mount-corpus-ia.plist` | Déclenchement automatique toutes les 120 s | standard |
| `~/Library/Logs/nas-mount.log` | Journal des montages | — |

### 4.3 Logique du script

```
1. ~/IA/Corpus-IA est-il monté ?
   → Oui : tester l'accessibilité (ls avec timeout 5 s) → si ok, sortir
   → Non : continuer
2. Lire le mot de passe depuis ~/.nsmbrc (awk)
3. Si mot de passe absent : écrire dans le log, sortir avec erreur
4. Lancer mount_smbfs //Florian:PASS@192.168.1.103/Corpus-IA ~/IA/Corpus-IA (timeout 30 s)
5. Journaliser le résultat
```

✅ **Validation (11 oct 2026) :** remontage automatique en moins de 3 secondes après déconnexion forcée.

### 4.4 Pourquoi cette approche et pas les alternatives

| Tentative | Résultat | Raison |
|-----------|----------|--------|
| `mount_smbfs -N` | ❌ Échec "Authentication error" | Cassé sur macOS moderne |
| `security add-internet-password` (Trousseau depuis SSH) | ❌ "User interaction is not allowed" | Nécessite session graphique |
| `osascript` / Finder depuis LaunchAgent | ❌ Blocage indéfini | Requiert audit GUI session |
| NFS | ❌ "Operation not permitted" | NFS non activé dans DSM **— ne pas rouvrir** |

### 4.5 Signaux connus dans les logs

| Message | Signification |
|---------|---------------|
| `monté : /Users/florian/IA/Corpus-IA` | Montage réussi |
| `monté mais sans réponse` | Share monté mais `ls` a expiré (avertissement mineur) |
| `mot de passe introuvable dans .nsmbrc` | Section manquante ou mal nommée |
| `échec mount_smbfs (code N)` | Erreur de montage — vérifier connectivité et identifiants |

---

## 5. Docker et OrbStack

### 5.1 Runtime Docker

| Élément | Valeur |
|---------|--------|
| Runtime | OrbStack (remplace Docker Desktop sur Apple Silicon) |
| Démarrage automatique | ⚙️ LaunchAgent `open -a OrbStack` — à vérifier |

**Important :** sur macOS avec OrbStack, les volumes Docker ne sont **pas** accessibles via `/var/lib/docker/volumes/`. Utiliser `docker exec` ou `docker cp`.

### 5.2 Inventaire des conteneurs

| Conteneur | Image | Port hôte | Restart | Statut |
|-----------|-------|-----------|---------|--------|
| open-webui | ghcr.io/open-webui/open-webui:main | 3000→8080 | unless-stopped | ✅ Actif, healthy |
| anythingllm | mintplexlabs/anythingllm:latest (version 1.19.0 depuis le 25/10/2026 [IMG]) | 3001→3001 | unless-stopped | ✅ Actif, healthy [IMG] |
| n8n | n8n | 5678→5678 | — | ⚙️ Actif, non configuré |
| home-assistant | homeassistant/home-assistant | 8123→8123 | — | ⚙️ Actif, non configuré |
| homer | b4bz/homer | 8888→8080 | — | ⚙️ Actif, config partielle |
| nextcloud | nextcloud | — | — | 🔲 Arrêté, reconfiguration MariaDB en cours |
| open-webui-before-oidc | ghcr.io/open-webui/open-webui:main | — | — | 🗄️ **Ne pas supprimer avant validation complète** |

### 5.3 Volumes Docker persistants

| Volume | Contenu | Conteneur | Point de montage |
|--------|---------|-----------|-----------------|
| open-webui | Données utilisateurs, conversations, config | open-webui | /app/backend/data |
| anythingllm | Storage, vector cache, SQLite | anythingllm | /app/server/storage |

**⚠️ Ne jamais supprimer ces volumes.**

### 5.4 Bind mounts NAS → conteneurs

| Chemin Mac | Chemin conteneur | Conteneur | Mode | Statut |
|-----------|-----------------|-----------|------|--------|
| ~/IA/Corpus-IA | /mnt/nas-corpus | anythingllm | ro | ✅ Actif |
| ~/NAS-Home-Test/Travail | /mnt/florian-travail | anythingllm | ro | ✅ Actif |
| ~/NAS-Test/RAG-Test/Documents | /mnt/nas-documents | open-webui | ro | ✅ Actif |

⚠️ Un dossier monté dans le conteneur **n'est pas automatiquement indexé**.  
⚠️ La racine du dossier `homes` ne doit **jamais** être montée dans un conteneur.

---

## 6. Open WebUI

### 6.1 Configuration générale

| Élément | Valeur |
|---------|--------|
| Version | 0.11.4 |
| URL | https://minimac.saiga-tilapia.ts.net |
| Fichier d'environnement | `~/.config/open-webui/recreate.env` — permissions 600 |
| Ollama | http://host.docker.internal:11434 |

**Contenu de `recreate.env` (liste des variables, valeurs non documentées ici) :**  
WEBUI_URL, OPENID_PROVIDER_URL, OPENID_REDIRECT_URI, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_PROVIDER_NAME, OAUTH_SCOPES, OAUTH_USERNAME_CLAIM, OAUTH_EMAIL_CLAIM, OAUTH_TOKEN_ENDPOINT_AUTH_METHOD, ENABLE_OAUTH_SIGNUP, WEBUI_AUTH, WEBUI_SECRET_KEY, USE_OLLAMA_DOCKER.

### 6.2 Authentification OIDC (Synology SSO)

✅ **Opérationnel depuis le 9 octobre 2026.**

| Paramètre | Valeur |
|-----------|--------|
| OAUTH_CLIENT_ID | e8feedca7f3324709e280505691c2685 |
| OPENID_PROVIDER_URL | https://servor.saiga-tilapia.ts.net:5001/webman/sso/.well-known/openid-configuration |
| OPENID_REDIRECT_URI | https://minimac.saiga-tilapia.ts.net/oauth/oidc/callback |
| OAUTH_PROVIDER_NAME | Synology |

OAUTH_CLIENT_SECRET et WEBUI_SECRET_KEY : **emplacement uniquement → `~/.config/open-webui/recreate.env`**

### 6.3 Comptes utilisateurs

| Compte | Authentification | Rôle | Statut |
|--------|-----------------|------|--------|
| Florian admin Proton | Local (mot de passe) | Admin | ✅ Secours |
| Florian (Gmail Synology) | OIDC Synology | Admin | 🔲 Rôle admin à confirmer |
| Chia-hua | OIDC Synology | Standard | 🔲 À créer |
| Kostia | OIDC Synology | Standard | 🔲 À créer |

### 6.4 Sauvegardes

| Fichier | Description | Instruction |
|---------|-------------|-------------|
| `~/Backups/OpenWebUI/open-webui-pre-oidc-20261009-141522.tar.gz` | Volume complet avant recréation OIDC (~963 Mio) | **Conserver jusqu'à validation complète** |
| `~/.config/open-webui/container-before-oidc.json` | Config docker inspect avant recréation | Conserver |
| `~/.config/open-webui/session-key.tmp` | Ancienne WEBUI_SECRET_KEY (33 octets) | Conserver |

### 6.5 RAG Open WebUI

- Modèle : Mistral (via Ollama)
- ✅ Validé sur 6 documents (FR, EN, ZH)
- Base de test : "Corpus-AI-test" (7 documents dont 1 OCR)
- 🔲 Test Mistral : réponse attendue sur la fiche extincteur → 9 janvier 2027, numéro 7731-KP

---

## 7. AnythingLLM

### 7.1 Configuration générale

| Élément | Valeur |
|---------|--------|
| URL | https://minimac.saiga-tilapia.ts.net:8445 |
| Mode | Multi-utilisateur (team) |
| Image déclarée | mintplexlabs/anythingllm:latest |
| Version exécutée | 1.19.0, arm64, mise à jour du 25/10/2026 [IMG] ; ID `sha256:ddf73304a4a96e2f90755d620dd3921de9afb4b8b8e914fa62d6ce7944ba95af` |
| Code audité | v1.17.0 [C17] (commit `fa7ec877f005a21ede94888b3b8618b700343857`) ; branche principale [CM] (commit `a5bb8b9c7b1262635ea58fc17d4899619cbf58e9`) ; aucun tag amont 1.19.0 |
| Configuration [PROD] | `~/services/ai-stack/compose.yaml` et `anythingllm.env` ; `DEPLOYMENT_VERSION=1.19.0` ; `WORKSPACE_DELETION_PROTECTION=true` (ALLM-10, activée le 27/10/2026) ; sauvegarde `~/services/ai-stack/backup-allm10-20261027-170318` |
| Retour arrière [IMG] | `/Users/florian/services/ai-stack/backup-anythingllm-20261025-091540/` + tag `mintplexlabs/anythingllm:rollback-20261025-091540` ; restauration non essayée |
| Vector DB | LanceDB |
| Embeddings | BGE-M3 via Ollama |
| Modèle de génération | mistral:latest |

**⚠️ Vérification de l'image :** la mise à jour du 25/10 a remplacé l'image auditée. Les constats [IMG] sont rapportés, non revérifiés par Claude (voir section 14.1 et section 13 item 22).

### 7.2 Comptes

| Compte | Rôle |
|--------|------|
| florian-admin | Administrateur |
| florian | Utilisateur standard |

### 7.3 Workspaces

| Workspace | Slug | Test RAG | Notes |
|-----------|------|----------|-------|
| Test-Corpus-IA | test-corpus-ia | ✅ ZH correct (7 nov 2026) | Attribué à florian-admin |
| Florian - Personnel | — | ⚙️ Créé | Visible par les deux comptes |

### 7.4 Mécanisme d'indexation — points critiques

**Cache vectoriel (ALLM-06, ouvert) :** clé = `UUIDv5(chemin_du_fichier)` ; aucune empreinte de contenu. Si le contenu change sous un chemin constant sans invalidation du cache, des vecteurs périmés peuvent être réutilisés. Précision de portée : chaque conversion du Collector produit un nouveau chemin (suffixe identifiant) ; le scénario concerne surtout un JSON existant ré-embeddé (section 14.11). Stratégie : **suppression du cache + réimport** (jamais un simple réimport d'un JSON modifié).

**Suppression :** `purgeFolder()` supprime les index du premier niveau uniquement, puis efface récursivement le dossier. Les sous-dossiers peuvent laisser des index orphelins. Voir ALLM-16 (section 14.12).

**PUR-02 v4 (validé 2026-11-01, non déployé) :** correctif candidat remplace `Workspace.where()` par `_getWorkspacesStrict()`, normalise le chemin avant toutes les opérations, propage les erreurs SQL/LanceDB à l'appelant, et avorte `purgeFolder()` en cas de sous-répertoire présent. 9/9 tests d'intégration SQLite réel + LanceDB réel. Essai isolé requis avant déploiement. Voir section 14.22.

**Sécurité API :** une Developer API key est un accès admin non scopé à l'instance entière, par conception (SECURITY.md v1.17.0). Ne pas l'utiliser directement dans n8n. Voir section 14.4 et 14.5.

### 7.5 Clé API

| Élément | Valeur |
|---------|--------|
| Clé en base | Import-Corpus-IA (créée par florian-admin) |
| Usage réel | Non établi — vérifier dans les logs avant révocation |
| Règle | Ne jamais inscrire la valeur secrète dans les documents |

---

## 8. Ollama et modèles

| Modèle | Usage | Notes |
|--------|-------|-------|
| mistral:latest | Chat, RAG, tool calling | ✅ Modèle principal |
| gemma3:12b | Chat | ⚠️ Ne supporte pas le tool calling dans Open WebUI |
| llama3.1:8b | Chat | — |

Orientation : privilégier Mistral et les modèles européens.

---

## 9. OCR

| Outil | Version |
|-------|---------|
| Tesseract | 5.5.3 (global macOS) |
| OCRmyPDF | 17.13.0 (global macOS) |

Commande type : `ocrmypdf -l fra --skip-text source.pdf output_OCR.pdf`

✅ Utilisé sur `07_fiche_controle_extincteur_scan_FR.pdf`.

---

## 10. Partages Synology et accès documentaires

### 10.1 Partages principaux

| Partage | Accès | Usage |
|---------|-------|-------|
| Corpus-IA | Florian RW, Corpuser-IA RO | Base commune IA |
| homes/[user] | Utilisateur propriétaire uniquement | Documents personnels |

⚠️ Les conteneurs Docker ne doivent jamais avoir accès aux `homes`.

### 10.2 Web Station — dossier Documentation

| Élément | Valeur |
|---------|--------|
| Port | 8090 |
| Racine | `Documentation_NAS` |
| Fichiers | index.html + Livret + Journal |

---

## 11. Documentation technique — dépôt GitHub

| Élément | Valeur |
|---------|--------|
| URL | https://github.com/testuflo-ft/docs-serveur-ia |
| Visibilité | Public |
| Accès brut | `https://raw.githubusercontent.com/testuflo-ft/docs-serveur-ia/main/<fichier>` |
| Écriture | 🔎 GIT-01 — accès 403 non résolu ; livraison par téléchargement, push manuel par Florian |
| Versions publiées (HEAD `d29d1b2`, 24/10/2026) | Livret v0.5, Journal v0.7, Plan-correctifs v0.4 |
| Versions préparées en local (25/10/2026, **non publiées**, archivées) | Livret v0.6, Journal v0.8, Plan-correctifs v0.5 |
| Versions préparées en local (28/10/2026, **non publiées**) | Livret v0.7, Journal v0.9, Plan-correctifs v0.6 |

---

## 12. Homer — portail central

| Conteneur | Port hôte | Statut |
|-----------|-----------|--------|
| homer | 8888→8080 | ⚙️ Actif, configuration partielle |

Procédure de modification de la configuration :
```bash
docker cp homer:/www/assets/config.yml /tmp/config.yml
# modifier /tmp/config.yml
docker cp /tmp/config.yml homer:/www/assets/config.yml
```

---

## 13. Récapitulatif des actions en attente

| # | Action | Priorité | Bloquant pour |
|---|--------|----------|--------------|
| 1 | Confirmer rôle admin compte Synology Gmail dans Open WebUI | 🔴 Haute | Accès multi-utilisateurs |
| 2 | Vérifier que compte local Proton reste fonctionnel | 🔴 Haute | Secours |
| 3 | Confirmer 7 documents dans Corpus-AI-test (dont OCR) | 🔴 Haute | Validation RAG |
| 4 | Test Mistral : fiche extincteur (9 jan 2027, n° 7731-KP) | 🔴 Haute | Validation RAG |
| 5 | Révoquer clé API Open WebUI si pas encore fait | 🔴 Haute | Sécurité |
| 6 | **ALLM-10 activé le 27/10/2026** [PROD] (`WORKSPACE_DELETION_PROTECTION=true`) : exécuter OPS-02 et les tests HTTP des trois routes en laboratoire ; la protection bloque aussi la suppression depuis l'interface d'administration — voir section 14.8 | 🟡 Moyenne | Validation de la protection |
| 7 | **D1 révisée (25/10)** : CP-3 non appliqué automatiquement ; analyser les conséquences (options A/B/C), SEC-01 et SEC-10 en laboratoire, puis décision et autorisation explicite de Florian — voir section 14.9 | 🟡 Moyenne | Décision sur ALLM-12 |
| 8 | Exécuter le plan de test en laboratoire isolé (32 tests — voir section 14.13) après avoir vérifié que le conteneur de laboratoire est démarré | 🔴 Haute | Avant déploiement n8n |
| 9 | Concevoir et valider passerelle n8n dédiée avec allowlist workspaces (D2 — Option A retenue) — voir Plan-correctifs | 🔴 Haute | Avant import automatisé |
| 10 | Transition point de montage ~/NAS-Test → ~/IA/Corpus-IA | 🟡 Moyenne | Cohérence |
| 11 | Décider architecture HTTPS : reverse proxy vs Tailscale Serve | 🟡 Moyenne | Homer, accès autres services |
| 12 | Configurer Homer — compléter les tuiles (dont Documentation) | 🟡 Moyenne | UX portail |
| 13 | Créer workspaces Corpus-IA thématiques dans AnythingLLM | 🟡 Moyenne | RAG production |
| 14 | Créer comptes Chia-hua et Kostia dans Open WebUI | 🟡 Moyenne | Accès multi-utilisateurs |
| 15 | Créer comptes Kostia et chhsu dans AnythingLLM — bloqué après tests ALLM-08 en instance isolée | 🟡 Moyenne | Multi-utilisateurs |
| 16 | Concevoir automatisation n8n — bloqué par items 8 et 9, et par la décision de l'item 7 | 🟡 Moyenne | Après validation sécurité |
| 17 | Configurer UPS → signal d'extinction Mac mini | 🟢 Basse | Fiabilité |
| 18 | Configuration Nextcloud (MariaDB) | 🟢 Basse | — |
| 19 | Appliquer tuile Homer pour GitHub Documentation | 🟡 Moyenne | UX portail |
| 20 | Tailscale Funnel 502 — investigation ou abandon définitif | 🟢 Basse | Accès public docs |
| 21 | Tailscale Serve — LaunchAgent pour persistance après redémarrage | 🟡 Moyenne | Fiabilité accès Open WebUI |
| 22 | **Vérifications en lecture seule de l'image 1.19.0** : version, ID et `EMBED_BODY_LIMIT` rapportés le 25/10 [IMG] ; restent à faire : `grep` des routes `env-dump`, `docker inspect … .Mounts`, `docker port anythingllm`, valeur effective de `WORKSPACE_DELETION_PROTECTION` — voir section 15.6 | 🟡 Moyenne | Avant toute décision sur ALLM-12 et ALLM-10 |
| 23 | DOS-02 : **corrigé et déployé (preuve statique)** ; tester le 413 en laboratoire (DOS-02) et décider du résiduel de la limite globale de 3 Go | 🟡 Moyenne | Sécurité DoS |
| 24 | INT-17 à RACE-01 : préparer et exécuter tests INT-17, INT-18A/B/C, INT-19A/B/C, UPLOAD-02A/B, RACE-01 en environnement isolé — voir sections 14.17 à 14.20 | 🟡 Moyenne | Fiabilité opérations documentaires |
| 25 | Vérifier l'état du laboratoire `anythingllm-fixlab` (démarré ? `sleep 3600`) et son image avant toute commande de test ; non connu de cette version du livret | 🔴 Haute | Tous les tests |
| 29 | **Exporter les correctifs de laboratoire** INT-18 et INT-20/PUR-02 (4 fichiers, `docker diff`, `docker cp`, SHA-256) avant tout arrêt du laboratoire ; ils ne sont ni validés ni déployés — voir section 14.21 | 🔴 Haute | Perte possible des correctifs |
| 30 | ALLM-12 : exécuter le protocole préparé (Plan v0.6 §2.7) en lecture seule puis en laboratoire ; décision D1 de Florian | 🟡 Moyenne | Décision sur ALLM-12 |
| 26 | Inventorier les consommateurs de `Import-Corpus-IA` (Open WebUI, n8n, journaux Docker) avant toute révocation (D3) | 🟡 Moyenne | Gouvernance des clés |
| 27 | ALLM-06 (ouvert) : revue des tests automatisés amont et des parcours d'import, puis RAG-03A et RAG-03B | 🟡 Moyenne | Cache vectoriel |
| 28 | Essai de restauration de la sauvegarde du 25/10 (`storage-anythingllm.tar.gz`) en environnement isolé (OPS-01) | 🟡 Moyenne | Retour arrière |

*Clos depuis v0.2 :*
- ~~Item 12 (v0.2) : Identifier source fichier cache `5d8cac14-*.json`~~ → ✅ Clos — cache de `06_volunteer_day_notice_2026-11_ZH.txt`

---

## 14. Audit de sécurité AnythingLLM — état au 28 octobre 2026

### 14.1 Périmètre et méthode

Audit en lecture seule, par inspection statique : (1) code de l'ancien conteneur `anythingllm`, relu comme v1.17.0 (commit `fa7ec877f005a21ede94888b3b8618b700343857`), jusqu'à la mise à jour du 25/10/2026 ; (2) clones amont en lecture seule relus le 25/10 : tag v1.17.0 [C17] et commit `a5bb8b9` [CM] ; (3) relevés sur l'image 1.19.0 active rapportés par la passation du 25/10 [IMG]. La légende des sources figure en tête du document. Aucun réglage modifié. Aucune route destructive testée.

Niveaux de preuve :
- **Code confirmé** : comportement visible dans les fichiers installés ou sur GitHub tag v1.17.0
- **Test empirique** : résultat observé lors d'un appel de lecture
- **Risque plausible/élevé** : déduction du code sans exploitation démontrée
- **Non testé** : ne pas présenter comme résultat acquis

⚠️ **L'image `mintplexlabs/anythingllm:latest` est une balise mutable** et la version 1.19.0 n'a pas de tag amont : une image ne se rapproche d'un commit que par comparaison de fichiers. Voir section 13 item 22.

### 14.2 Infrastructure et chemins utiles

- Compose : `/Users/florian/services/ai-stack/compose.yaml`
- Conteneur : `anythingllm`, port hôte `3001`
- Stockage : volume Docker monté sur `/app/server/storage`
- Corpus : `/Users/florian/IA/Corpus-IA` → `/mnt/nas-corpus` (RO)
- Checkout source de la session du 20-21 oct. : `/home/claude/anything-llm-src/` (non conservé ; clones amont de référence relus le 25/10 : voir 14.1)
- Sauvegarde et retour arrière du 25/10/2026 [IMG] : `/Users/florian/services/ai-stack/backup-anythingllm-20261025-091540/` (`compose.yaml`, `ancienne-image-id.txt`, `storage-anythingllm.tar.gz`) ; ancienne image sous le tag `mintplexlabs/anythingllm:rollback-20261025-091540` ; restauration non essayée.

### 14.3 Comptes et espaces constatés

- `florian-admin` : rôle `admin`, ID 1
- `florian` : rôle `default`, ID 2
- `Test-Corpus-IA` : ID 2, membre florian-admin
- `Florian - Personnel` : ID 3, membres florian-admin et florian
- Comptes Kostia et chhsu : pas encore créés
- Clé `Import-Corpus-IA` : créée par florian-admin ; usage réel non établi

### 14.4 Clé API : portée réelle de `validApiKey` et modèle officiel

`validApiKey.js` vérifie uniquement qu'un bearer token existe dans la table `ApiKey`. Aucun lien avec un utilisateur, rôle ou workspace.

**Confirmé par SECURITY.md v1.17.0 (l.49-53) [C17] :** les Developer API keys sont des identifiants système accordant un accès admin complet par conception. Ce n'est pas un bug — c'est le comportement intentionnel documenté. **[VAL] 25/10 :** aucune clé générale n'est exposée à n8n ; ne pas supposer qu'une clé valide limite les droits à un utilisateur ou à un workspace.

### 14.5 Routes workspace et conversations

- `GET /v1/workspaces` : aucun filtre utilisateur
- `POST /v1/workspace/:slug/vector-search` : retourne `source.text` — **texte brut des chunks indexés**
- `GET /v1/workspace/:slug/chats` : toutes les conversations sans filtre utilisateur
- Routes de mise à jour, suppression : sans contrôle d'appartenance visible
- `Workspace.getWithUser` / `whereWithUser` : présents uniquement dans l'interface web

### 14.6 API d'administration

Routes sur `/v1/admin/users` protégées par `validApiKey` uniquement. Conformément à SECURITY.md, ce comportement est intentionnel. Non testé sur l'instance réelle.

### 14.7 API documents et fichiers générés

- `GET /v1/documents` : sans filtre utilisateur visible
- `DELETE /v1/document/remove-folder` : ne pas exposer à une passerelle d'import
- `purgeDocument()` (ALLM-05) : supprime le cache, la source et les associations dans **tous les workspaces** ; exposé par `DELETE /v1/system/remove-documents` ([C17] `api/system/index.js` l.218 ; `purgeDocument.js` l.13-20). Portée globale établie ; pas une vulnérabilité autonome (clés = équivalent administrateur) ; ne pas exposer à une passerelle d'import ; ne pas révoquer `Import-Corpus-IA` avant inventaire (D3).
- `purgeFolder()` : voir section 14.12

### 14.8 Protection de suppression de workspace (ALLM-10) — activée le 27/10/2026, partiellement vérifiée

`server/utils/middleware/workspaceDeletionProtection.js` (18 lignes) [C17][CM] : `if (!("WORKSPACE_DELETION_PROTECTION" in process.env)) return next();`, sinon HTTP 403 « Workspace deletion is blocked by the system administrator. ». Active dès que la variable est **présente, quelle que soit sa valeur** (`true`, `0` ou vide).

Routes protégées [C17] : `DELETE /admin/workspaces/:id` (`admin.js` l.300), `DELETE /workspace/:slug` (`workspaces.js` l.302 ; l.303 en [CM]), `DELETE /v1/workspace/:slug` (`api/workspace/index.js` l.230). Elle bloque aussi la suppression depuis l'interface d'administration ; elle ne couvre ni `remove-documents` ni `remove-folder`.

**Configuration déployée [PROD] (27/10/2026) :** `WORKSPACE_DELETION_PROTECTION=true` ajoutée à `compose.yaml` (et `DEPLOYMENT_VERSION` 1.17.0 → 1.19.0) ; sauvegarde `~/services/ai-stack/backup-allm10-20261027-170318` ; seul le service `anythingllm` recréé ; variable effective dans le processus ; HTTP 200 sur `127.0.0.1:3001/` ; montages NAS en lecture seule, port, volume et politique de redémarrage inchangés.

**Test [PROD] :** test direct du middleware : 403, `next()` non appelé — **test unitaire**. Aucun test HTTP authentifié des trois routes ; aucune suppression réelle. Test restant : OPS-02 en laboratoire.

**Retour arrière :** retirer la variable de `compose.yaml` puis recréer le service (`docker compose up -d --no-deps --force-recreate anythingllm`), à partir de la sauvegarde du 27/10. **Risque résiduel :** suppressions légitimes bloquées ; autres routes destructrices (ALLM-05) non couvertes.

### 14.9 Routes `env-dump` (ALLM-12) — CP-3 non appliqué automatiquement (D1 révisée le 25/10/2026)

**Faits [VAL] :** dans l'image installée et auditée, les routes `env-dump` ne comportent intentionnellement pas `validApiKey` ; `dumpENV()` écrit `/app/server/.env` **dans le conteneur** et ne modifie pas directement le `.env` de l'hôte ni le fichier Compose. **CP-3 n'est pas appliqué automatiquement** : analyse des conséquences et autorisation explicite requises.

**Faits lus dans le code amont :**
- [C17] aucun middleware sur `GET /v1/system/env-dump` (`api/system/index.js` l.16) ni sur `GET /env-dump` (`system.js` l.91) ; hors production : 200 sans effet ; en production : `dumpENV()` puis 200 sans corps ; la route voisine `/v1/system` porte `[validApiKey]`. `openapi.json` (l.2627) annonce un 403 que le code ne produit pas ; `SECURITY.md` v1.17.0 ne mentionne pas `env-dump`.
- [CM] commentaire « Intentionally unauthenticated so deploy/shutdown scripts can flush in-memory config to .env » et rubrique de `SECURITY.md` (l.65-76) : intention **actuelle** des mainteneurs, pas une preuve de leur intention à v1.17.0.
- [C17][CM] seul appelant trouvé : `BARE_METAL.md` l.84 ; l'entrypoint Docker n'appelle pas `env-dump`.
- [C17] `dumpENV()` : `updateENV.js` l.1537. [CM] il réécrit le `.env` du conteneur (l.1718, `flag: "w"`) à partir des seules clés listées dont la valeur est non vide ; commentaires et autres lignes sont perdus.

**Hypothèses et limites :** image 1.19.0 non revérifiée par Claude ; CP-3 (SHA-256 `b27d886c07d890616ef12d072d0848195214457dc07836ba34417a2940ca1a7e`, `node --check` ✅ sur v1.17.0) non rebasé sur 1.19.0 ; absence de bind mount de `/app/server/.env` à confirmer (SEC-10) ; surface réelle (LAN + tailnet) à confirmer par `docker port anythingllm` — l'ancien facteur atténuant « Tailscale uniquement » n'est **pas démontré**.

**Options (aucune n'est exécutée) :**

| Option | Action | Coût / risque |
|---|---|---|
| A | CP-3 rebasé | Patch local à refaire à chaque mise à jour de l'image `latest` ; écart avec l'intention amont ; casse les scripts sans identifiants |
| B | Désactiver la route (404) | Même coût de maintenance |
| C | Ne rien modifier ; documenter ; surveiller | Alternative la moins coûteuse ; risque résiduel faible (aucune donnée lue ni renvoyée) mais route non authentifiée |

**Décision à prendre (Florian) :** A, B ou C, après SEC-01 et SEC-10 en laboratoire et autorisation explicite. **Tests :** aucun.

### 14.10 Pipeline d'import : vecteurs et association SQL sans transaction commune (ALLM-14)

`Document.addDocuments` : insertion LanceDB **avant** SQL. Si la création SQL échoue, aucune compensation visible → vecteurs orphelins possibles. `uploadToWorkspace` peut retourner `true` malgré un import partiel. *(Constat sur v1.17.0 [C17] : `api/document/index.js` l.164, 316, 473, 638 ignorent le résultat.)*

**Différence amont [CM], non vérifiée dans l'image 1.19.0 :** `uploadToWorkspace` (`documents.js` l.372) renvoie `{ success, partial, error }` et les routes d'upload le testent (l.163, 317, 477, 648) ; en cas d'échec SQL, retour arrière au mieux des vecteurs (`documents.js` l.196 et l.211), non atomique. Statut : partiellement traité en amont ; ne pas clore ; RAG-04 et RAG-05.

### 14.11 Cache vectoriel indexé sur le chemin source (ALLM-15)

**ALLM-06 / ALLM-15 — ouvert [VAL].** Clé de cache = `uuidv5(chemin)` (`utils/files/index.js` l.271-274, 290-297, 321-323 ; identique en [C17] et [CM]). Pas de hash du contenu. `addDocumentToNamespace` (`lance/index.js` l.312 ; `skipCache = false` l.316 ; lecture du cache l.324-325) recharge les chunks du cache sans recalcul. Les appels ordinaires (`embedding-worker.js` l.108-112 ; `documents.js` l.137 [C17] / l.157 [CM]) ne passent pas `skipCache`. Seul le document principal de la synchronisation surveillée passe `true`. `purgeVectorCache` n'est appelée que par `purgeDocument` et `purgeFolder` : retirer un document d'un workspace ne purge pas son cache.

*Précision de portée [C17], non testée :* chaque conversion du Collector crée un nouveau chemin suffixé d'un identifiant (`asTxt.js` l.36 et l.51 ; `asPDF/index.js` l.57 et l.78 ; `collector/utils/files/index.js` l.120-152) : un ré-upload ordinaire n'est normalement pas concerné ; le risque porte sur le ré-embedding d'un JSON existant modifié en place.

Qualification retenue : « Risque de réutilisation de vecteurs obsolètes lorsque le contenu change sous un chemin constant et que le cache n'a pas été invalidé. Le mécanisme est prouvé dans le code ; l'impact dépend du parcours d'import et de l'état du cache. » Ne pas le déclarer résolu sans correction vérifiée et tests reproductibles (RAG-03A, RAG-03B). Stratégie en attendant : suppression du cache + réimport (jamais simple réimport d'un JSON modifié).

### 14.12 Purge de dossier : index non récursif et risques complémentaires (ALLM-16)

`purgeFolder()` :
1. Liste les entrées de **premier niveau** seulement
2. Purge cache et associations pour ces entrées (non récursif)
3. `fs.rmSync(subFolderPath, { recursive: true })` — suppression physique récursive

La suppression physique est récursive mais la purge des index ne l'est pas. Sous-dossiers → index orphelins possibles.

**Compléments identifiés (23 oct 2026) :**
- `create-folder` accepte les chemins imbriqués (séparateur `/` dans le nom)
- `Document.removeDocuments()` peut avaler silencieusement les erreurs SQL et retourner succès
- `purgeVectorCache()` asynchrone : rejet peut ne pas être intercepté → entrées cache orphelines sans erreur visible
- Routes de suppression peuvent retourner HTTP 200 après retour anticipé de `purgeFolder()` — voir section 14.19

**Action :** parcours récursif explicite avant suppression physique ; vérifier les rejets async ; tester avec arborescence imbriquée.

**PUR-02-E — Statut final (2026-11-10/11) :** 3 candidats (`candidate-purgeDocument-v4e.js` SHA `90a21b04…`, `candidate-documents.js` SHA `de9c5860…`, `candidate-lance-index-v4f.js` SHA `8103f042…`) ; 60/60 tests PASS (22A v4f + 16B + 14C + 8L/R) + 4 scénarios E2E PASS (instance jetable `pur02-e2e-runtime-20261110`). Points couverts :
- `purgeFolder()` avorte si un sous-répertoire est présent (UNSUPPORTED_FOLDER_ENTRY) → plus d'index orphelin (ALLM-16 corrigé, non déployé)
- `purgeDocument()` : `_getWorkspacesStrict()` propage les erreurs SQL ; `normalizePath` appliqué avant toutes les opérations
- `deleteDocumentFromNamespace()` : requête Prisma directe, erreurs SQL et LanceDB propagées ; LanceDB v4f → `true` pour no-ops (fix rollback `addDocuments()`)
- `removeDocuments()` : `_getStrict()` sans try/catch ; LanceDB avant SQL ; `prisma.$transaction([...])` pour atomicité SQL-SQL
- Défaut D-2 (fix#1b) : vérification pré-normalisation → 400 `FOLDER_NAME_INVALID` (fix#1b = `purgeDocument-v4e` **uniquement**, ≠ LanceDB v4f)
- Codes d'erreur canoniques : `FOLDER_NAME_REQUIRED`, `FOLDER_NAME_INVALID`, `FOLDER_OUTSIDE_DOCUMENTS`, `FOLDER_PROTECTED`, `FOLDER_NOT_FOUND`
- Limite L-1 (non-atomicité LanceDB/SQL) : **confirmée empiriquement par E2E-04** ; remédiation manuelle documentée
- Contre-revue indépendante favorable (ChatGPT, 2026-11-04 et 2026-11-10). Patch SHA-256 `86043b31…`.
- Lab détruit après E2E. Production inchangée. **Non déployé — déploiement requiert autorisation explicite de Florian.**
Voir section 14.22 et fichier `PUR-02-livraison.md`.

### 14.13 Plan de test consolidé — avant d'activer n8n

**Les tests de cette matrice générale (SEC-*, RAG-*, OPS-*, INT-*, UPLOAD-*, RACE-*) ne sont pas déclarés validés** (32 identifiants ; des résultats partiels de laboratoire [LAB] et un test unitaire de production [PROD] sont rapportés dans la colonne « Exécuté ? » ; l'état réel du laboratoire n'est pas connu de cette version). **Exception : PUR-01 et PUR-02** font l'objet de validations spécifiques rapportées dans leurs colonnes respectives et détaillées dans §14.22 et `PUR-02-livraison.md`. Ces validations PUR-02 (60/60 tests simulés + 4 scénarios E2E) sont distinctes des tests généraux non exécutés — elles ne valident pas les autres lignes de la matrice. Tests uniquement en laboratoire isolé avec données factices, **après vérification que le conteneur de laboratoire est démarré**. Ne pas se limiter au code HTTP ou à `success: true` : vérifier pour chaque test touchant des documents — système de fichiers, associations SQL, enregistrements `DocumentVectors`, vecteurs LanceDB, cache vectoriel, résultat HTTP et logs expurgés de secrets. SEC-02 à SEC-05 ne concernent que l'évaluation éventuelle de CP-3 ; RAG-03 est scindé en RAG-03A/B (ALLM-06) ; SEC-10 est nouveau.

| ID | Catégorie | Scénario | Résultat attendu / preuve | Exécuté ? |
|---|---|---|---|---|
| SEC-01 | ALLM-12 | `/v1/system/env-dump` sans bearer sur le conteneur de laboratoire (image 1.19.0) | Caractériser la réponse HTTP et l'effet sur `/app/server/.env` du conteneur ; aucune écriture hors conteneur | À exécuter |
| SEC-02 | ALLM-12 / CP-3 (conditionnel) | `/api/env-dump` sans session, avant/après CP-3 rebasé | Après patch : refus en multi-utilisateur ; aucun `.env` modifié lors du refus | À exécuter — seulement si l'évaluation de CP-3 est autorisée |
| SEC-03 | ALLM-12 / CP-3 (conditionnel) | `/api/env-dump` avec JWT admin valide, `NODE_ENV=production`, conteneur isolé | Succès après patch ; écriture uniquement dans le conteneur isolé | À exécuter — seulement si l'évaluation de CP-3 est autorisée |
| SEC-04 | ALLM-12 / CP-3 (conditionnel) | `/v1/system/env-dump` avec clé valide, conteneur isolé | Succès après patch ; écriture uniquement dans le conteneur isolé | À exécuter — seulement si l'évaluation de CP-3 est autorisée |
| SEC-05 | ALLM-12 / CP-3 (conditionnel) | `/api/env-dump` avec JWT utilisateur standard, `MULTI_USER_MODE=true` | Refus ; aucun `.env` modifié | À exécuter — seulement si l'évaluation de CP-3 est autorisée |
| SEC-06 | Sécurité | Clé API invalide sur route protégée de test | Refus HTTP, aucun effet secondaire | À exécuter |
| SEC-07 | Passerelle | Import vers slug allowlisté | Opération autorisée ; fichier, workspace, réponse et indexation vérifiables | À exécuter |
| SEC-08 | Passerelle | Import vers slug non autorisé/inconnu | Refus avant traitement/écriture durable ; journal sans secret | À exécuter |
| SEC-09 | Passerelle | Clé d'import sur route admin, suppression ou lecture générale | Refus ; aucune mutation | À exécuter |
| SEC-10 | ALLM-12 | Conséquences de `dumpENV()` en laboratoire | Comparer `/app/server/.env` avant/après l'appel ; `docker inspect` (Mounts) : `/app/server/.env` n'est pas un bind mount de l'hôte ; aucun fichier hôte ni Compose modifié | À exécuter |
| RAG-01 | Import | Import d'un fichier factice neuf | Vérifier fichier, SQL, `DocumentVectors`, LanceDB, cache et réponse HTTP | À exécuter |
| RAG-02 | Import | Réimport identique | Politique d'idempotence observée ; aucun doublon inattendu | À exécuter |
| RAG-03A | Cache (ALLM-06) | Fichier source modifié puis ré-upload via le Collector | Nouveau `docpath` (suffixe UUID) attendu ; chunks conformes au nouveau contenu ; sort de l'ancien document et de son cache documenté | À exécuter |
| RAG-03B | Cache (ALLM-06) | JSON de document modifié en place (même `docpath`), retiré puis rajouté au workspace | Chunks conformes au nouveau contenu ; sinon cache périmé reproduit (risque ALLM-06 confirmé en pratique) | À exécuter |
| RAG-04 | Import | Échec d'embedding/indexation simulé | Échec explicite, pas de faux `success: true` ; comparer avec le comportement 1.19.0 (propagation de `embedded.success`) | À exécuter |
| RAG-05 | Cohérence | Échec SQL après insertion LanceDB | Retour arrière des vecteurs tenté (code amont) ou état de réparation signalé ; contrôler SQL, `DocumentVectors` et LanceDB | À exécuter |
| PUR-01 | Purge | Purge dossier factice avec sous-dossiers | Pas de référence résiduelle non signalée dans SQL, `DocumentVectors`, LanceDB ou cache | Partiel en laboratoire [LAB] : purge récursive, dossier supprimé après succès et conservé après erreur simulée, échec simulé de `Document.removeDocuments` propagé ; vraie panne LanceDB/SQL non testée. **v4e + fix#1b (2026-11-05) : 52/52 PASS (22A+16B+14C) ; S01-S09 couverts ; test HTTP de bout en bout restant.** |
| PUR-02 | Contrat HTTP | `custom-documents`, dossier absent, chemin invalide/imbriqué | `protected`/`not_found`/`invalid` distincts ; aucun faux succès | **PUR-02-E (10/11/2026) :** 60/60 PASS (22A v4f + 16B + 14C + 8L/R) ; 4 scénarios E2E PASS ; `FOLDER_NAME_REQUIRED`, `FOLDER_NAME_INVALID`, `FOLDER_OUTSIDE_DOCUMENTS`, `FOLDER_PROTECTED`, `FOLDER_NOT_FOUND`, `UNSUPPORTED_FOLDER_ENTRY` ; traversée cible existante (C-11..C-14) ; LanceDB v4f no-ops → `true` ; L-1 confirmée empiriquement (E2E-04) ; lab détruit, production inchangée. **Non déployé.** |
| OPS-01 | Sauvegarde | Sauvegarde puis restauration isolée (dont l'archive `storage-anythingllm.tar.gz` du 25/10) | Restauration fonctionnelle et intégrité vérifiée | À exécuter |
| OPS-02 | Protection | Protection activée en isolé (valeur `1`, puis valeur `0` : la présence seule suffit-elle ?) ; suppression d'un workspace factice par les trois routes (`/admin/workspaces/:id`, `/workspace/:slug`, `/v1/workspace/:slug`) | 403 « Workspace deletion is blocked by the system administrator. » ; workspace préservé | Production : test unitaire du middleware PASS (403, `next()` non appelé) [PROD] ; test HTTP authentifié par route non fait ; laboratoire : à exécuter |
| DOS-01 | Limite HTTP | Inspection statique de l'image de laboratoire pour `/api/embed` | Code réellement présent documenté ; présence seule ne prouve pas l'activité | Inspection statique de l'image active rapportée le 25/10 [IMG] ; à rejouer sur l'image de laboratoire |
| DOS-02 | Limite HTTP | Dépassement de la limite `/api/embed` dans l'isolé | HTTP 413 « Request payload too large. » ; processus reste sain ; comparer avec une route hors `/api/embed` (limite globale 3 Go) | À exécuter |
| INT-17 | Déplacement | Répertoire comme source | Refus ; aucun déplacement ; SQL/vecteurs inchangés | À exécuter |
| INT-18A | Déplacement | Destination existante mais non indexée | Refus sans écrasement ; source/destination préservées | Partiel en laboratoire [LAB] : collision avec une destination existante → erreur attendue (indexée / non indexée non distinguées) ; contrôle SQL, vecteurs et cache non rapporté |
| INT-18B | Déplacement | Destination existante déjà indexée | Refus sans altération du contenu, SQL, `DocumentVectors`, LanceDB et cache | Partiel en laboratoire [LAB] : collision avec une destination existante → erreur attendue (indexée / non indexée non distinguées) ; contrôle SQL, vecteurs et cache non rapporté |
| INT-18C | Course | Deux opérations concurrentes vers la même destination | Au plus un succès ; aucune corruption ; garantie no-replace prouvée | À exécuter |
| INT-19A | Lot | Lot valide | Chaque résultat `moved` ; cohérence disque, SQL, mapping, cache | Partiel en laboratoire [LAB] : déplacement normal PASS ; cohérence SQL, mapping et cache non rapportée |
| INT-19B | Lot | Élément invalide au milieu du lot | Résultats `moved`/`refused`/`not_executed`/`failed` ; partiel explicitement signalé | Partiel en laboratoire [LAB] : source manquante rejetée, aucune cible créée ; élément invalide au milieu d'un lot non rapporté |
| INT-19C | Lot | Sources répétées, destinations dupliquées, conflits internes | Prévalidation rejette avant première mutation physique | Partiel en laboratoire [LAB] : noms de destination en double rejetés avant déplacement, sources conservées ; sources répétées et conflits internes non rapportés |
| UPLOAD-02A | Upload | Rejet de validation après écriture Multer | Temporaire supprimé ; fichiers légitimes préservés | À exécuter |
| UPLOAD-02B | Upload | Collector indisponible après réception | Nettoyage déterministe ou reprise explicite ; pas d'accumulation silencieuse | À exécuter |
| RACE-01 | Course | Deux uploads simultanés de même nom, contenus distincts | Chaque traitement indexe le bon contenu ; aucune collision/corruption | À exécuter |

**Tests à exécuter exclusivement dans un environnement isolé — jamais sur la production.**

### 14.14 Mesures conservatoires avant reprise

1. Ne pas lancer l'automatisation n8n avant : conception et test de la passerelle (D2), décision D1 prise et exécution d'un sous-ensemble du plan de test.
2. Ne pas révoquer `Import-Corpus-IA` sans vérifier son usage dans les logs.
3. ALLM-10 est activé (27/10/2026, D4) : ne pas retirer `WORKSPACE_DELETION_PROTECTION` sans décision ; reconfirmer la valeur effective et exécuter OPS-02.
4. Vérifier l'image du conteneur avant toute décision de correctif (item 22, section 13) ; ne pas appliquer CP-3 automatiquement.
5. Ne pas créer les comptes Kostia et chhsu dans AnythingLLM avant tests ALLM-08.
6. Tests destructifs uniquement en instance isolée.
7. Ne pas supposer qu'un import retournant `success: true` est cohérent.
8. Ne jamais écrire de mots de passe, clés API, secrets JWT ou codes de récupération dans la documentation.
9. Avant toute commande de test, vérifier que le conteneur de laboratoire est effectivement démarré et que la commande le vise (jamais `anythingllm`).

### 14.15 Statut de l'audit au 28 octobre 2026

**Confirmé dans le code (source indiquée) :**
- `validApiKey` sans liaison utilisateur/workspace — intentionnel (`SECURITY.md` l.49-53 [C17])
- Plusieurs routes sans contrôle d'appartenance ; `POST /v1/workspace/:slug/vector-search` retourne `source.text`
- Routes `env-dump` sans authentification — intentionnel dans l'image auditée [VAL] ; intention amont [CM]
- Protection de suppression de workspace : **activée en production le 27/10/2026** [PROD] ; testée par présence de la variable (14.8) ; test unitaire seulement
- Pipeline d'import : v1.17.0 — vecteurs avant SQL, résultat ignoré, sans compensation ; [CM] — résultat propagé et retour arrière au mieux (image 1.19.0 non vérifiée)
- Cache vectoriel par chemin, pas par contenu — **ALLM-06 ouvert**
- `purgeDocument` à portée globale (ALLM-05) ; `purgeFolder` : index non récursif, suppression physique récursive
- `create-folder` accepte les chemins imbriqués ; `Document.removeDocuments()` peut avaler les erreurs SQL ; `purgeVectorCache()` sans gestion complète des rejets
- `bodyParser` global 3 Go avant authentification ; limite de 1 Mo sur `/api/embed` présente dans l'image 1.19.0 [IMG] (DOS-02)
- `move-files` sans validation du type de source ni de la destination (INT-17/18) ; lot de déplacements non atomique (INT-19)
- `remove-folder` : retour anticipé silencieux → faux succès possible (INT-20)
- Multer écrit avant validation du workspace (UPLOAD-02) ; nom temporaire sans suffixe unique (RACE-01, collision non testée)

**Décisions (état au 25 octobre 2026) :**
- D1 : CP-3 non appliqué automatiquement ; décision A/B/C à prendre (ALLM-12)
- D2 : Option A — passerelle dédiée n8n avec allowlist workspaces (reconfirmée [VAL])
- D4 : protection de suppression **activée** le 27/10/2026 ; test HTTP par route à faire
- D6 : INT-18 et INT-20/PUR-02 corrigés en laboratoire seulement (14.21)
- D5 : DOS-02 corrigé et déployé (preuve statique)

**Mise à jour 2026-11-01 :**
- **PUR-02 v4 VALIDÉ** : correctif candidat — 9/9 tests d'intégration SQLite réel + LanceDB réel ; 17/17 tests unitaires. ALLM-16 corrigé (abort si sous-répertoire). Non déployé — essai isolé requis. Voir section 14.22 et `PUR-02-livraison.md`.
- Consolidation tests (unité) : 22/22 PASS (17 PUR-02 + Swagger fix)
- D7 : ALLM-06 ouvert
- INT-19 : Option B — résultats individuels par opération

**Mise à jour 2026-11-05 :**
- **PUR-02 v4e + fix#1b** : contre-revue indépendante favorable (ChatGPT, 2026-11-04) ; défaut D-2 traité (fix#1b : vérification pré-normalisation, 400 `FOLDER_NAME_INVALID`) ; 52/52 PASS (22 Suite A + 16 Suite B + 14 Suite C) ; patch SHA-256 `86043b31…`. Candidat prêt pour essai isolé, non déployé.

**Mise à jour 2026-11-08 :**
- **Compagnon LanceDB v4f** : `candidate-lance-index-v4f.js` — `deleteDocumentFromNamespace()` retourne `true` pour les no-ops ; 8/8 PASS (L-01..L-05 + R-01..R-03) ; corrections audit ChatGPT (chemin portable, R-02 vrai test d'intégration) ; SHA `8103f042…`. Sans impact sur PUR-02-E (non déployé). Voir section 14.22.

**Mise à jour 2026-11-10/11 :**
- **PUR-02-E VALIDÉ E2E** : 4 scénarios E2E PASS sur instance réelle jetable (`pur02-e2e-runtime-20261110`, image dérivée `pur02-e2e:20261110` basée sur `sha256:ddf73304…`, SQLite de zéro, 40 migrations Prisma, LanceDB réel, `NODE_ENV=production`, réseau Docker `none`). Scénarios réels : E2E-01 (purge multi-workspace, 2 workspaces, 2 namespaces LanceDB), E2E-02 (namespace LanceDB absent, no-op), E2E-03 (namespace LanceDB existant mais vide), E2E-04 (échec SQL par trigger + reprise après suppression du trigger). Ces scénarios sont des **tests d'intégration du traitement de purge**, pas des tests HTTP authentifiés. `E2E_PUR02_RESULT=PASS`. Résultat total : **60/60 tests simulés + 4 scénarios E2E PASS**. Conteneur et image dérivée supprimés et vérifiés absents post-tests. Production inchangée.
- **L-1 confirmée empiriquement** par E2E-04 : `$transaction` SQL échoue après LanceDB ok → exception propagée + log `[removeDocuments] SQL cleanup failed … document_vectors rows … may be orphaned`.
- **Suite A adaptée** : `pur02-candidate-v4f.test.js` SHA `773fbe04…` (scénarios 9/10 → `true`) est la suite canonique. L'ancienne `pur02-candidate.test.js` SHA `f3e88f13…` (scénarios 9/10 → `false`) est OBSOLÈTE.
- **Non déployé — déploiement requiert autorisation explicite de Florian.**

**Non testé :** exploitation effective de ces risques ; tous les tests de la matrice.

**Correctifs appliqués en production :** aucun correctif de code appliqué par nous ; l'image 1.19.0 (mise à jour du 25/10) embarque la limite `/api/embed` (DOS-02).

---

### 14.16 DOS-02 — Parseurs globaux sans limite avant authentification

**Date :** 23 octobre 2026 ; mis à jour le 25 octobre | **Statut :** ✅ corrigé et déployé dans l'image 1.19.0 (preuve statique [IMG]) ; ⚠️ 413 non testé ; confirmé dans v1.17.0 et v1.18.0 (historique)

Dans `server/index.js`, `bodyParser` avec `FILE_LIMIT = "3GB"` monté avant tout middleware d'authentification. La route `/api/embed` est particulièrement exposée car sans auth.

**Correctif upstream :** commit `c729bf480ab146063b6c9ef287182384b9b080e0` (14 oct 2026, date non revérifiée le 25/10) — limite 1 Mo sur `/api/embed`. Absent de v1.17.0 et de v1.18.0 (`server/index.js` relu le 25/10 : `FILE_LIMIT` seul). **Présent dans la branche principale** [CM] (`EMBED_BODY_LIMIT` l.54 ; parseurs l.70-74 ; gestionnaire 413 l.83-90) **et dans l'image 1.19.0** [IMG] (`EMBED_BODY_LIMIT = "1mb"` ≈ l.54 ; ≈ l.70-74 ; 413 ≈ l.83-86).

**Vérification (25/10) :** présence statique rapportée dans l'image active [IMG] ; DOS-01 et DOS-02 (413) à rejouer en laboratoire ; aucun corps volumineux en production. La passation du 25/10 nommait cette correction « CP-3 » à tort.

**Impact :** saturation mémoire/disque possible. Pas d'exposition de secrets.

**Facteur atténuant :** non démontré — le port 3001 est publié sur l'hôte et le garde-fou « LAN direct » interdit une liaison à `127.0.0.1` ; surface réelle à confirmer (`docker port anythingllm`). **Risque résiduel :** les autres routes restent sous la limite globale de 3 Go avant authentification.

---

### 14.17 INT-17 et INT-18A/B/C — Routes `move-files` : validation insuffisante

**Date :** 23 octobre 2026

**INT-17 — Absence de validation du type de la source :**  
`move-files` ne vérifie pas que la source est un fichier ordinaire avant `fs.rename()`. Un répertoire ou un lien symbolique peut être passé. `isWithin()` valide le périmètre mais pas le type.

Risque TOCTOU : un `lstat()` isolé suivi de `rename()` n'est pas atomique. La politique sur les liens symboliques n'est pas définie dans le code.

**Action recommandée :**
- Ajouter `lstat().isFile()` avant `rename()`
- Définir et documenter la politique lien symbolique

**Test :** INT-17.

---

**INT-18 — Écrasement silencieux de la destination (scénarios A/B/C) :**  
`fs.rename()` sur une destination existante écrase sans avertissement sur POSIX. Aucune vérification d'existence avant déplacement.

Un schéma `existsSync + rename` n'est **pas atomique** : course possible entre la vérification et le déplacement. `O_EXCL` n'est pas directement applicable à `fs.rename()` — une primitive adaptée doit être choisie en fonction de la version Node.js et du système de fichiers cible.

**Sous-scénarios :**

- **INT-18A — Destination existante non indexée :** la destination existe sur le disque mais n'est pas présente dans l'index DocumentVectors. Écrasement silencieux possible sans alerte documentaire.
- **INT-18B — Destination existante déjà indexée :** la destination est déjà indexée dans DocumentVectors. L'écrasement pourrait corrompre les associations SQL et vecteurs LanceDB correspondants.
- **INT-18C — Course concurrente :** deux opérations distinctes tentent simultanément un déplacement vers la même destination. Sans primitive atomique, les deux peuvent réussir partiellement.

**Action recommandée :**
- Refuser si la destination existe, avec une erreur exploitable
- Ne pas recommander `O_EXCL` seul comme protection d'un `rename()` — définir une primitive adaptée à la version Node.js et au système de fichiers cible
- Vérifier l'existence **et** l'index avant toute opération physique

**Tests :** INT-18A, INT-18B, INT-18C.

---

### 14.18 INT-19A/B/C — Lots de déplacements non atomiques

**Date :** 23 octobre 2026

`Promise.all(fs.rename ops)` : en cas d'erreur sur une opération, les autres peuvent être déjà exécutées ou en cours. La réponse agrégée ne distingue pas les succès des échecs individuels.

**Décision retenue — Option B : résultats individuels (24 octobre 2026) :**  
Chaque opération du lot dispose d'un résultat explicite : `moved`, `refused`, `not_executed`, ou `failed`. Aucun succès global ne masque un échec partiel. La prévalidation du lot entier (structure, sources, destinations, doublons, conflits source/destination internes) doit être complétée avant la première opération physique.

**Sous-scénarios :**

- **INT-19A — Lot valide :** toutes les opérations autorisées ; résultat `moved` pour chacune ; cohérence disque, SQL, mapping et cache vérifiée en fin de lot.
- **INT-19B — Élément invalide au milieu du lot :** les opérations valides renvoient `moved`, l'opération invalide renvoie `refused` ou `failed` ; les suivantes renvoient `not_executed` si elles dépendent d'une opération échouée ; le partiel est explicitement signalé dans la réponse.
- **INT-19C — Sources répétées, destinations dupliquées, conflits internes :** la prévalidation détecte et rejette l'ensemble avant la première mutation physique ; aucune opération partielle n'est engagée.

**Tests :** INT-19A, INT-19B, INT-19C.

---

### 14.19 INT-20 — Route `remove-folder` : contrat de résultat HTTP (PUR-01/02)

**Date :** 23 octobre 2026

**PUR-01 — Cohérence de la purge :**  
`purgeFolder()` n'énumère que les entrées de premier niveau ; `Document.removeDocuments()` peut avaler silencieusement les erreurs SQL ; `purgeVectorCache()` rejet async non intercepté. La suppression physique (`fs.rmSync` récursif) peut donc supprimer des fichiers sans avoir nettoyé les index SQL, LanceDB et le cache vectoriel correspondants.

Corrections requises : parcours récursif explicite de l'arborescence avant suppression physique ; gestion des rejets async de `purgeVectorCache()` ; vérification du retour de `Document.removeDocuments()` ; stratégie de récupération en cas d'erreur partielle.

**PUR-02 — Contrat de résultat HTTP :**  
`purgeFolder()` effectue des retours anticipés silencieux (dossier protégé, chemin invalide, dossier inexistant) et les routes ne vérifient pas son résultat avant de répondre HTTP 200 → faux succès HTTP possible.

Remplacer la réponse implicite par un résultat nommé : `deleted`, `protected`, `invalid`, `not_found`, `partial_failure`, `failure`. Les routes API et Web doivent utiliser des codes HTTP cohérents.

**Protection `custom-documents` :** préserver et rendre explicite dans le résultat retourné (`protected`).

**Action :** `purgeFolder()` doit retourner un résultat structuré ; les routes doivent le propager.

**Tests :** PUR-01, PUR-02.

---

### 14.20 UPLOAD-02A/B et RACE-01 — Fichiers temporaires et upload concurrent

**Date :** 23 octobre 2026

**UPLOAD-02A — Fichier temporaire orphelin après erreur de validation :**  
Multer écrit dans `collector/hotdir` avant `validateWorkspaceSlugQuery`. Si la validation échoue, le fichier temporaire reste sur le disque.

*Action :* ajouter un nettoyage dans le handler d'erreur après validation.

**UPLOAD-02B — Collector indisponible après écriture Multer :**  
Si le Collector devient indisponible entre l'écriture Multer et le traitement, le fichier reste dans `hotdir` sans être traité ni signalé.

*Action :* mettre en place un nettoyage déterministe ou une file de reprise explicite ; éviter l'accumulation silencieuse de fichiers dans `hotdir`.

**RACE-01 — Hypothèse de collision sur upload concurrent :**  
Dans `server/utils/files/multer.js`, `fileUploadStorage` (l.11-25) et `fileAPIUploadStorage` (l.31-45) nomment le fichier temporaire d'après le nom d'origine assaini, sans suffixe unique ([C17][CM], fait de code ; seul `pfpUploadStorage` utilise un UUID). Deux uploads simultanés du même fichier pourraient se corrompre mutuellement (hypothèse).

*Statut :* nommage établi dans le code ; collision effective non testée — tester deux uploads simultanés du même fichier (RACE-01).

**Tests :** UPLOAD-02A, UPLOAD-02B, RACE-01.

### 14.21 Bilan du 28 octobre 2026 (production et laboratoire)

**Bilan ChatGPT du 28/10/2026, intégré tel que rapporté (aucune de ces données n'a été revérifiée par Claude, qui n'a accès ni à minimac ni au laboratoire).**

**Faits rapportés sur la production [PROD]**

- Version réelle 1.19.0, image `sha256:ddf73304a4a96e2f90755d620dd3921de9afb4b8b8e914fa62d6ce7944ba95af`. Conteneur `anythingllm`, port publié 3001, volume `anythingllm:/app/server/storage`, politique de redémarrage `unless-stopped`. Fichiers : `~/services/ai-stack/compose.yaml` et `~/services/ai-stack/anythingllm.env`.
- Montages NAS conservés en lecture seule : `/Users/florian/IA/Corpus-IA:/mnt/nas-corpus:ro` et `/Users/florian/NAS-Home-Test/Travail:/mnt/florian-travail:ro`.
- **ALLM-10 activé en production le 27/10/2026.** Sauvegarde préalable : `~/services/ai-stack/backup-allm10-20261027-170318` (`compose.yaml` et `anythingllm.env`, comparés aux originaux). Deux modifications de `compose.yaml`, confirmées par `diff` avec la sauvegarde : (1) `DEPLOYMENT_VERSION` `1.17.0` → `1.19.0` (alignement de la déclaration sur la version réelle) ; (2) ajout de `WORKSPACE_DELETION_PROTECTION=true`. Recréation : `docker compose up -d --no-deps --force-recreate anythingllm`.
- Constats après recréation : conteneur `running` ; version réelle 1.19.0 ; variable effective `WORKSPACE_DELETION_PROTECTION=true` ; HTTP 200 sur `127.0.0.1:3001/` ; port, volume, montages NAS et politique de redémarrage inchangés ; test direct non destructif du middleware : réponse 403 et `next()` non appelé (**test unitaire**).
- Aucune suppression réelle de workspace n'a été effectuée.

**Tests de laboratoire rapportés [LAB] (conteneur `anythingllm-fixlab`, Node.js et mocks)**

- **INT-18 (déplacement)** : déplacement normal PASS ; collision avec une destination existante → erreur attendue ; noms de destination en double rejetés avant tout déplacement, sources conservées ; source manquante rejetée, aucune cible créée. Le correctif prévalide sources, doublons et collisions avant de déplacer.
- **INT-20 / PUR-02 (purge et suppression de dossier)** : purge récursive conforme ; dossier supprimé après succès et conservé après erreur simulée ; entrée symbolique rejetée (`UNSUPPORTED_FOLDER_ENTRY`) ; échec simulé de `Document.removeDocuments` propagé ; validations : nom vide → 400 `INVALID_FOLDER_NAME`, `../outside` → 400 `INVALID_FOLDER_PATH`, `custom-documents` → 403 `FOLDER_PROTECTED`, dossier absent → 404 `FOLDER_NOT_FOUND` ; contrôles de syntaxe Node réussis. Routes examinées : `DELETE /v1/document/remove-folder` (`validApiKey`) et `DELETE /system/remove-folder` (authentification et rôles).
- Fichiers modifiés dans le laboratoire : `/app/server/utils/files/index.js`, `/app/server/utils/files/purgeDocument.js`, `/app/server/endpoints/api/document/index.js`, `/app/server/endpoints/system.js`.
- Le laboratoire n'a ni port publié ni montage de production ; sa commande `sleep 3600` peut l'arrêter automatiquement.

**Ce qui n'est PAS établi (limites de preuve)**

- ALLM-10 : le test HTTP authentifié de **chaque** route (`DELETE /workspace/:slug`, `DELETE /v1/workspace/:slug`, `DELETE /admin/workspaces/:id`) n'a pas été fait ; OPS-02 reste à exécuter en laboratoire. Le test unitaire du middleware ne remplace pas un test HTTP.
- INT-18 et INT-20/PUR-02 : **ni validés, ni déployés**. Tests par mocks, sans test HTTP de bout en bout, sans vraie panne LanceDB/SQL, sans contrôle de l'état SQL/`DocumentVectors`/LanceDB/cache. Le déplacement n'est pas atomique : une erreur d'E/S réelle pendant la phase de déplacement peut laisser un état partiel. Certaines erreurs SQL de nettoyage peuvent être absorbées par le code existant. INT-18C (concurrence), INT-17, INT-19B (élément invalide au milieu d'un lot), sources répétées et conflits internes d'INT-19C ne sont pas couverts par le bilan. L'image de base du laboratoire n'est pas précisée : à comparer à l'ID de production avant de tirer une conclusion.
- Le code des correctifs de laboratoire n'a pas été relu par Claude ; il n'est pas dans le dépôt documentaire.

**Hypothèses**

- Le bilan indique que la variable a été ajoutée à `compose.yaml` ; il ne précise pas si c'est dans `environment:` ou via `env_file`. Hypothèse : `environment:` de `compose.yaml` (`anythingllm.env` inchangé, mais sauvegardé). La valeur effective dans le processus, elle, est rapportée comme vérifiée.
- L'effet fonctionnel de `DEPLOYMENT_VERSION` (déclaration seulement ?) n'a pas été examiné.

**Risques résiduels**

- Toute suppression légitime de workspace est bloquée, y compris depuis l'interface d'administration, tant que la variable est présente (retour arrière : retirer la variable de `compose.yaml` puis recréer le service, à partir de la sauvegarde `backup-allm10-20261027-170318`).
- La protection ne couvre ni `remove-documents`, ni `remove-folder`, ni `move-files` : ALLM-05, INT-17 à INT-20 restent entiers en production.
- Les correctifs de laboratoire n'existent que dans un conteneur éphémère : perte possible si le conteneur est supprimé ou recréé ; non reproductibles tant qu'ils ne sont pas exportés.
- ALLM-12 (D1) et ALLM-06 (D7) : inchangés, ouverts.

**Décisions**

- **D4** : la protection est **activée** (27/10/2026, valeur `true`) ; elle remplace l'état « désactivée, décision à prendre » des documents du 25/10. La décision a été prise hors de cette session ; elle est consignée telle que rapportée.
- **D6** : INT-18 et INT-20/PUR-02 passent de « inchangés, non testés » à « corrigés en laboratoire seulement, non validés, non déployés ».
- **D1, D2, D3, D5, D7** : inchangées.

**Vérifications restantes (lecture seule d'abord ; aucune ne modifie la production)**

1. Exporter les correctifs de laboratoire avant tout arrêt du laboratoire (`docker diff anythingllm-fixlab`, `docker cp` des quatre fichiers modifiés vers un dossier hôte, SHA-256 consignés).
2. Vérifier que `anythingllm-fixlab` est démarré (`docker ps --filter name=anythingllm-fixlab`) et comparer son image à celle de la production (`docker inspect anythingllm-fixlab --format '{{.Config.Image}} {{.Image}}'`).
3. Confirmer que `WORKSPACE_DELETION_PROTECTION` figure dans `compose.yaml` et non dans `anythingllm.env` (`grep -c` sur le nom de la variable, sans afficher les autres lignes).
4. OPS-02 en laboratoire (trois routes, valeur `true`, `1` puis `0`).
5. Tests HTTP de bout en bout et contrôle SQL/`DocumentVectors`/LanceDB/cache pour INT-18, INT-20 et PUR-01/02 ; INT-18C et INT-19B/C complémentaires.
6. ALLM-12 : protocole de lecture seule puis laboratoire décrit dans le Plan v0.6, §2.7.

**ALLM-12 :** protocole de lecture seule puis de laboratoire préparé dans le Plan v0.6 §2.7 ; non exécuté ; CP-3 non appliqué.

---

### 14.22 PUR-02 v4 / v4e+fix#1b / v4f — Validation et livraison

#### Contexte

Résolution des 5 défauts identifiés dans `purgeDocument` / `removeDocuments` / `deleteDocumentFromNamespace` (ALLM-16) : atomicité SQL+LanceDB, singleton `LanceDb.#connection`, ordonnancement, propagation d'erreurs, récursivité de `purgeFolder`. Les correctifs s'appuient sur des candidats distincts (`candidate-purgeDocument.js`, `candidate-documents.js`, `candidate-lance-index.js`).

#### Résultats de validation — v4 (2026-11-01, base)

| Suite | Résultat | Date |
|---|---|---|
| 17 tests unitaires (Jest, SQLite mock) | **17/17 PASS** | 2026-10-25 |
| 9 tests d'intégration (SQLite réel `better-sqlite3` v13.0.3 + LanceDB réel `@lancedb/lancedb`) | **9/9 PASS** | 2026-11-01 |
| Consolidation v3 (suite complète) | **22/22 PASS** | 2026-11-01 |

Scénarios d'intégration couverts : S01 purge simple, S02 purge multi-documents, S03 workspace inconnu, S04 bug singleton (régression), S05 limite L-1 (non-atomicité résiduelle confirmée et documentée), S06 purge globale, S07 purge avec entrées invalides, S08 purge d'un sous-répertoire (abort conservateur), S09 suppression d'un document vecteur inexistant en LanceDB.

#### Correctifs techniques — v4

- **`_getWorkspacesStrict()`** : remplace `Workspace.where()` par `prisma.workspaces.findMany()` direct (lance sur erreur au lieu de retourner `null`).
- **`_getStrict()`** (`candidate-documents.js`) : `prisma.workspace_documents.findFirst()` sans try/catch ; erreur DB propagée.
- **`prisma.$transaction([])`** : paire SQL atomique via objets différés dans le shim.
- **Proxy `LanceDb.#connection`** : correction du bug de mutation du singleton (S04).
- **`purgeFolder` abort si sous-répertoire** : approche conservatrice ; S08 valide l'abort.

#### Limite résiduelle documentée (L-1)

LanceDB est nettoyé *avant* que `$transaction` échoue → état transitoire partiel possible : rangées SQL préservées, vecteurs LanceDB déjà supprimés. Confirmé par S05. Non résolu dans v4 ; nécessite une révision architecturale séparée.

#### SHA-256 du patch complet v4

```
0cba6a1da13800fdd92411f3f8e9f83c611a45a2c57e017b7ce2a4de0baa79de
```

(Fichier `PUR-02-patch-complet.diff`, branche `docs/mise-a-jour-2026-11-01`)

#### Candidats v4 vérifiés (SHA-256)

| Fichier | SHA-256 |
|---|---|
| `candidate-lance-index.js` | `c826f004…` |
| `candidate-documents.js` | `de9c5860…` |
| `candidate-purgeDocument.js` | `15fc2ee1…` |

---

#### v4e + fix#1b — Résultats de validation (2026-11-05)

Contre-revue indépendante favorable (ChatGPT, 2026-11-04). Défaut D-2 traité dans fix#1b : vérification pré-normalisation, 400 `FOLDER_NAME_INVALID`. O-1 (`.` → 500) résolu.

| Suite | Résultat | Date |
|---|---|---|
| 22 tests unitaires Suite A | **22/22 PASS** | 2026-11-05 |
| 16 tests handler HTTP Suite B | **16/16 PASS** | 2026-11-05 |
| 14 tests sécurité chemins Suite C (`normalizePath`/`isWithin` réels, dont C-11..C-14 traversée avec cible existante) | **14/14 PASS** | 2026-11-05 |
| **Total** | **52/52 PASS** | 2026-11-05 |

Codes d'erreur canoniques : `FOLDER_NAME_REQUIRED` (nom vide), `FOLDER_NAME_INVALID` (séparateurs, traversal), `FOLDER_OUTSIDE_DOCUMENTS` (traversée hors-racine), `FOLDER_PROTECTED`, `FOLDER_NOT_FOUND`.

#### Candidats v4e + fix#1b (SHA-256)

| Fichier | SHA-256 |
|---|---|
| `candidate-purgeDocument-v4e.js` | `90a21b04…` |
| `candidate-documents.js` | `de9c5860…` |
| `candidate-lance-index.js` | `c826f004…` |
| Patch `PUR-02-E-purgeDocument-v4e-fix1b.patch` | `86043b316bb40bbee3a9cc706d756255bbded05e278e3033ee018f14b1dbd8aa` |

**Statut v4e + fix#1b :** candidat prêt pour essai isolé, non déployé. ALLM-16 corrigé.

---

#### v4f — Compagnon LanceDB (2026-11-08)

**Anomalie identifiée dans v4 :** `deleteDocumentFromNamespace()` retournait `false` pour deux cas no-op — namespace absent et 0 vecteur trouvé.

**Impact dans `addDocuments()` :** `vectorsRemoved = deleted !== false` → si `false`, `DocumentVectors.delete()` non appelé → nettoyage SQL silencieusement sauté lors d'un rollback après échec de `workspace_documents.create()`.

**Impact sur PUR-02-E :** aucun. Dans `removeDocuments()`, la valeur de retour de `deleteDocumentFromNamespace()` n'est pas utilisée ; seules les exceptions déclenchent un comportement différent.

**Correctif v4f :** `candidate-lance-index-v4f.js` — deux cas corrigés :
- Namespace absent → `return true` (au lieu de `return false`)
- 0 vecteur trouvé → `return true` (au lieu de `return false`)

**Tests `pur02-lance-v4f.test.js` — 8/8 PASS [LAB] (rapportés par la session Claude) :**
- Suite L (5 tests) : L-01 namespace absent → `true` ; L-02 0 vecteur → `true` ; L-03 suppression effective → `true`, `table.delete()` appelé ; L-04 erreur SQL → exception ; L-05 erreur LanceDB → exception.
- Suite R (3 tests) : R-01 rollback, `deleteDocumentFromNamespace` stubbé `true` → `DocumentVectors.delete()` appelé ; R-02 vrai test d'intégration, vraie classe `LanceDb` v4f, `namespaceExists` simulé `false`, spy sur la méthode réelle conservant l'exécution v4f, vérification que le même `docId` (`"stub-uuid-r02"`) est transmis à `deleteDocumentFromNamespace()` et à `DocumentVectors.delete()` ; R-03 contrôle négatif, exception LanceDB → `DocumentVectors.delete()` non appelé.

Limites du test : `namespaceExists`, `connect` et les dépendances SQL sont simulés (mocks) — pas de vraie instance LanceDB ni de vraie base SQL. Résultat rapporté par la session Claude [LAB] ; non vérifié de manière indépendante.

Corrections appliquées sur suggestion audit ChatGPT — deux séries : (1) chemin portable `path.resolve(__dirname, "candidate-documents.js")` ; (2) R-02 réécrit comme vrai test d'intégration ; (3) UUID déterministes (`Math.random()` supprimé dans les trois occurrences) ; (4) spy enveloppant la vraie `deleteDocumentFromNamespace()` dans R-02 — conserve l'exécution réelle tout en capturant les arguments ; (5) R-02 : vérification du même `docId` (`"stub-uuid-r02"`) dans l'appel LanceDB et dans `DocumentVectors.delete()`.

#### Candidats v4f (SHA-256)

| Fichier | SHA-256 |
|---|---|
| `candidate-lance-index-v4f.js` | `8103f042a0fed63db1d6f79db61ceb6eef97687e87893bec9747abe1d2c9149f` |
| `pur02-lance-v4f.test.js` | `11d835b2eb1ed91b97ac6c9be6f9fae7bb5c585fbe0dd70ae7e306c65917a465` |

SHA-256 `candidate-lance-index-v4f.js` (`8103f042…`) vérifié sur `correctif-PUR-02` par ChatGPT (08/11/2026). SHA-256 `pur02-lance-v4f.test.js` (`11d835b2…`) : version finale après 5 corrections, rapportée par la session Claude.

**Statut v4f :** non déployé. Ajout Suite L/R portant le total à 60/60 (voir ci-dessous).

---

#### E2E sur instance jetable (2026-11-10)

**Environnement** : conteneur `pur02-e2e-runtime-20261110`, image dérivée de la production (`sha256:ddf73304…`), 40 migrations Prisma depuis zéro. Exécuté par ChatGPT sur minimac. Aucune modification de la production.

**Résultat : `E2E_PUR02_RESULT=PASS`**

> Ces quatre scénarios sont des **tests d'intégration du traitement de purge** dans un laboratoire isolé. Ils ne constituent **pas** quatre tests HTTP authentifiés des routes de production.

| Scénario | Description réelle | Résultat |
|---|---|---|
| E2E-01 | **Purge multi-workspace nominale** : document associé à deux workspaces, vecteurs dans les deux namespaces LanceDB | ✅ PASS |
| E2E-02 | **Namespace LanceDB absent** : no-op reconnu, nettoyage SQL effectué | ✅ PASS |
| E2E-03 | **Namespace LanceDB existant mais vide** : 0 vecteur, nettoyage SQL effectué | ✅ PASS |
| E2E-04 | **Échec SQL par trigger + reprise** : 1re tentative → LanceDB ok, `$transaction` échoue (`Foreign key constraint failed`), conservé ; 2e tentative → PASS | ✅ PASS (comportement attendu) |

Conteneur `pur02-e2e-runtime-20261110` **supprimé** et vérifié absent. Image dérivée `pur02-e2e:20261110` **supprimée** et vérifiée absente. Production inchangée (`RestartCount=0`).

**Suite A adaptée pour v4f (2026-11-10)** : `pur02-candidate-v4f.test.js` (SHA `773fbe04…`) — scénarios 9/10 retournent désormais `true` (au lieu de `false`). L'ancienne `pur02-candidate.test.js` (SHA `f3e88f13…`, scénarios 9/10 → `false`) est **obsolète**.

**Total consolidé :** 22 Suite A v4f + 16 Suite B + 14 Suite C + 8 Suite L/R = **60/60 PASS**

> **60 ≠ 52** : les 52 du 04/11 n'incluaient pas la Suite L/R et utilisaient la Suite A v4e (scénarios 9/10 → `false`).

#### Candidats actifs PUR-02-E (SHAs vérifiés 2026-11-11)

| Fichier | SHA-256 | Rôle |
|---|---|---|
| `candidate-purgeDocument-v4e.js` | `90a21b04…` | Purge — v4e + fix#1b |
| `candidate-documents.js` | `de9c5860…` | Modèle Document |
| `candidate-lance-index-v4f.js` | `8103f042…` | LanceDB v4f |
| Patch `PUR-02-E-purgeDocument-v4e-fix1b.patch` | `86043b31…` | |

Suites canoniques :

| Suite | Fichier | SHA-256 |
|---|---|---|
| A (v4f) | `pur02-candidate-v4f.test.js` | `773fbe04…` |
| B | `pur02-http-handler.test.js` | `cb9702bd…` |
| C | `pur02-path-security.test.js` | `89e32abc…` |
| L/R | `pur02-lance-v4f.test.js` | `11d835b2…` |

---

#### Statut global

**PUR-02-E (v4e + fix#1b + LanceDB v4f) :** VALIDÉ — 60/60 tests simulés + 4 scénarios E2E PASS. Lab détruit. Production inchangée. **Non déployé** — déploiement requiert autorisation explicite de Florian.

> `fix#1b` est un correctif de `candidate-purgeDocument-v4e.js` uniquement. Il ne concerne pas LanceDB v4f. Ces deux améliorations sont dans des fichiers distincts et indépendants.

Voir `PUR-02-livraison.md` pour le détail complet de livraison.

---

## 15. Procédures d'exploitation

⚠️ **Règles générales :** SSH uniquement, une action à la fois. Ne pas modifier les autres conteneurs pendant la stabilisation d'Open WebUI. Ne jamais écrire de secrets dans les commandes ou la documentation.

### 15.1 Sauvegarde des volumes Docker

**Volumes à sauvegarder :** `open-webui` et `anythingllm`.

```bash
# Sauvegarde du volume Open WebUI (conteneur arrêté ou pausé recommandé)
docker run --rm \
  -v open-webui:/data:ro \
  -v ~/Backups/OpenWebUI:/backup \
  alpine tar czf /backup/open-webui-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .

# Sauvegarde du volume AnythingLLM
docker run --rm \
  -v anythingllm:/data:ro \
  -v ~/Backups/AnythingLLM:/backup \
  alpine tar czf /backup/anythingllm-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .
```

Conserver la sauvegarde `open-webui-pre-oidc-20261009-141522.tar.gz` (~963 Mio) jusqu'à validation complète de l'OIDC.

### 15.2 Restauration d'un volume

```bash
# Restaurer un volume AnythingLLM depuis une sauvegarde (volume vide ou recréé)
docker run --rm \
  -v anythingllm:/data \
  -v ~/Backups/AnythingLLM:/backup:ro \
  alpine tar xzf /backup/<nom_du_fichier.tar.gz> -C /data
```

Vérifier l'intégrité après restauration avant de redémarrer le conteneur.

### 15.3 Diagnostic de base

```bash
# État des conteneurs
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

# Logs récents d'un conteneur (ex : anythingllm)
docker logs --tail 100 anythingllm

# Espace disque des volumes
docker system df -v

# Variables d'environnement d'un conteneur (ne PAS afficher dans une conversation partagée)
docker inspect anythingllm --format '{{range .Config.Env}}{{println .}}{{end}}'

# Image ID et digest du conteneur (vérification avant correctif)
docker inspect anythingllm --format '{{.Image}} {{.Config.Image}}'
```

### 15.4 Redémarrage des conteneurs

```bash
# Redémarrage propre d'un seul conteneur
docker restart anythingllm

# Redémarrage via Compose (depuis le répertoire du projet)
cd ~/services/ai-stack
docker compose restart anythingllm
```

⚠️ Avant tout redémarrage d'AnythingLLM :
- La protection de suppression est activée (D4, 27/10/2026) : vérifier que `WORKSPACE_DELETION_PROTECTION` figure toujours dans la configuration (rapportée dans `compose.yaml` ; la présence suffit, quelle que soit la valeur) ; une recréation depuis une ancienne sauvegarde de `compose.yaml` la supprimerait
- Ne pas appeler `env-dump` sur la production ; si un appel a eu lieu, vérifier le `.env` résultant dans le conteneur avant tout redémarrage (`dumpENV()` le réécrit)

### 15.5 Retour arrière après déploiement d'un correctif

Si un correctif est déployé et crée une régression :

1. **Arrêter le conteneur** :
   ```bash
   docker stop anythingllm
   ```
2. **Revenir à l'image précédente** : depuis le 25/10/2026, le tag `mintplexlabs/anythingllm:rollback-20261025-091540` et le répertoire `/Users/florian/services/ai-stack/backup-anythingllm-20261025-091540/` (`compose.yaml`, `ancienne-image-id.txt`, `storage-anythingllm.tar.gz`) sont disponibles [IMG] ; restauration non essayée (OPS-01). Noter l'ID avant tout changement. Un simple `docker stop`/`docker start` ne change pas d'image : le conteneur doit être recréé avec l'ancienne image, sur autorisation explicite.
3. **Vérifier les volumes** : les volumes `anythingllm` ne doivent pas être supprimés ou recréés dans ce processus.
4. **Redémarrer** :
   ```bash
   docker start anythingllm
   ```
5. **Vérifier** que la version antérieure est bien active et que les données sont intactes.

⚠️ Ne jamais reconstruire ni recréer le conteneur AnythingLLM sans planification préalable et sauvegarde du volume.

### 15.6 Vérification de l'image avant déploiement d'un correctif

Avant tout déploiement (ALLM-12, DOS-02 ou autre) :

```bash
# Image et balise du conteneur
docker inspect anythingllm --format '{{.Config.Image}} {{.Image}}'

# Limites de corps (DOS-02) dans le code déployé
docker exec anythingllm grep -n "EMBED_BODY_LIMIT\|FILE_LIMIT" /app/server/index.js

# Routes env-dump dans le code déployé (ALLM-12)
docker exec anythingllm grep -n "env-dump\|validApiKey" /app/server/endpoints/api/system/index.js /app/server/endpoints/system.js

# Version de l'application (le package.json de la racine du dépôt n'est pas copié dans l'image : utiliser celui du serveur)
docker exec anythingllm node -p "require('/app/server/package.json').version"

# Points de montage : /app/server/.env ne doit pas être un bind mount de l'hôte (SEC-10)
docker inspect anythingllm --format '{{json .Mounts}}'

# Ports publiés (surface réelle des routes non authentifiées)
docker port anythingllm

# Présence (sans valeur) de WORKSPACE_DELETION_PROTECTION dans l'environnement du processus ; 0 = absente
docker exec anythingllm sh -c 'env | grep -c "^WORKSPACE_DELETION_PROTECTION="'
```

Toutes ces commandes sont en lecture seule. Elles ne prouvent pas la provenance complète de l'image (aucun tag amont 1.19.0) ; elles précisent seulement ce qui est présent. Avant toute commande de **test**, vérifier que le conteneur de laboratoire est démarré (`docker ps --filter name=<conteneur-labo>`) et que la commande ne vise pas `anythingllm`. Le `Dockerfile` amont ne copie pas le `package.json` racine ([C17][CM]) : la commande de la v0.5 (`/app/package.json`) était probablement erronée.

---

*Auteur : Florian — élaboré avec Claude et ChatGPT*
*Sources : notes de passation ChatGPT (9, 11, 12 oct 2026) + conversations Claude oct 2026 + audit AnythingLLM oct 2026 + dossiers ChatGPT 23 oct 2026 + Plan-correctifs v0.4 (24 oct 2026) + passation ChatGPT du 25 oct 2026 + conclusions validées du 25 oct 2026 (21:37) + relecture du code amont par Claude le 25 oct 2026 (tag v1.17.0 et commit a5bb8b9)*
*Version 1.0 — 11 novembre 2026*
*Changements v1.0 : intégration résultats E2E PUR-02-E (ChatGPT, 2026-11-10) — 4/4 scénarios E2E PASS (`E2E_PUR02_RESULT=PASS`) sur instance jetable `pur02-e2e-runtime-20261110` ; 60/60 tests total (52 simulés + 8 LanceDB v4f) ; candidat actif : 3 composants (`candidate-purgeDocument-v4e.js` SHA `90a21b04…`, `candidate-documents.js` SHA `de9c5860…`, `candidate-lance-index-v4f.js` SHA `8103f042…`) ; suite canonique A v4f `pur02-candidate-v4f.test.js` SHA `773fbe04…` (scénarios 9/10 → `true`) ; ancienne suite A `pur02-candidate.test.js` SHA `f3e88f13…` OBSOLÈTE ; L-1 confirmée empiriquement par E2E-04 ; fix#1b ≠ LanceDB v4f (distincts et indépendants) ; section 14.12 (statut PUR-02-E final), 14.13 (PUR-02 → 60/60 + 4 E2E), 14.15 (mise à jour 2026-11-10/11), 14.22 (E2E, candidats actifs, suites canoniques, statut global VALIDÉ) mis à jour. Lab détruit. Production inchangée. **Non déployé.** Base : v0.9 (8 nov 2026).*
*Changements v0.9 : mise à jour PUR-02 v4e + fix#1b (52/52 tests PASS, 22A+16B+14C, patch SHA `86043b31…`, contre-revue indépendante) manquant depuis v0.8 ; ajout compagnon LanceDB v4f (`candidate-lance-index-v4f.js`, SHA `8103f042…`, 8/8 PASS [LAB], L-01..L-05 + R-01..R-03) ; 5 corrections test v4f (UUID déterministes, spy R-02 conservant l'exécution réelle, vérification même docId) ; test SHA final `11d835b2…` ; section 14.12 (statut v4e+fix#1b + v4f), 14.13 (matrice PUR-01, PUR-02), 14.15 (mises à jour 2026-11-05 et 2026-11-08), 14.22 (v4e+fix#1b, v4f) mis à jour. PUR-02-E non déployé — essai isolé requis. Base : v0.8 (1er nov 2026).*
*Changements v0.8 : intégration de la validation PUR-02 v4 (9/9 tests d'intégration + 17/17 unitaires, consolidation v3 22/22) ; nouvelle section 14.22 (PUR-02 v4) ; section 7.4 mise à jour ; section 14.12 mise à jour (statut ALLM-16) ; matrice 14.13 mise à jour (PUR-01, PUR-02) ; section 14.15 mise à jour (milestone 2026-11-01). Non déployé — essai isolé requis. Base : v0.7 (28 oct 2026).*
*Changements v0.7 : intégration du bilan ChatGPT du 28/10/2026 (étiquettes [PROD] et [LAB] ; ALLM-10 activé en production le 27/10, test unitaire seulement ; configuration `compose.yaml` ; états partiels dans la matrice ; correctifs de laboratoire INT-18 et INT-20/PUR-02 non validés ni déployés ; nouvelle section 14.21 ; items 6, 25, 29, 30 de la section 13 ; 15.4 mis à jour). Base : v0.6 (25 oct 2026).*
*Changements v0.6 : légende des sources de preuve et numérotation canonique en tête ; sections 5.2, 7.1, 7.4, 11 mises à jour (version 1.19.0, retour arrière, versions de documents) ; section 13 : items 6, 7, 8, 16, 22, 23 révisés et items 25 à 28 ajoutés ; section 14 datée du 25 oct ; 14.8 (ALLM-10 : disponible, désactivée) et 14.9 (ALLM-12 : CP-3 non appliqué automatiquement, options A/B/C) réécrites ; 14.7 (ALLM-05), 14.10 (ALLM-14), 14.11 (ALLM-06 ouvert), 14.16 (DOS-02 corrigé et déployé, preuve statique) et 14.20 (RACE-01) mises à jour ; 14.13 : matrice portée à 32 identifiants (RAG-03A/B, SEC-10) ; 14.14 et 14.15 révisées ; 15.4 à 15.6 révisées (commande de version corrigée, commandes de lecture seule ajoutées). Base : v0.5 (24 oct 2026).*
