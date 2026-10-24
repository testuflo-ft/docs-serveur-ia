# Livret Technique — Serveur IA Mac mini + Synology

*Version 0.4 — 23 octobre 2026*

**Statuts utilisés dans ce document :**
- ✅ Vérifié — constat direct, sortie de commande ou code examiné
- ⚙️ Configuré non testé — présent dans les fichiers, fonctionnement non confirmé
- 🔲 À faire — objectif décidé, pas encore réalisé
- ⚠️ Hypothèse — explication plausible, à confirmer
- 🗄️ Obsolète — ancienne configuration conservée pour comprendre un incident

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
| 14 | Audit de sécurité AnythingLLM — état au 23 octobre 2026 |
| 15 | Procédures d'exploitation |

**Index des incidents documentés dans ce livret :**  
SMB-01 à SMB-04 → section 4.4  
OWUI-01 à OWUI-04 → sections 6.1, 6.4  
ALLM-01 → 7.1 ; ALLM-04/13 → 14.4/14.5 ; ALLM-08 → 14.6 ; ALLM-09 → 14.7 ; ALLM-10 → 14.8 ; ALLM-12 → 14.9 ; ALLM-14 → 14.10 ; ALLM-15 → 14.11 ; ALLM-16 → 14.12  
DOS-02 → 14.16 ; INT-17/18 → 14.17 ; INT-19 → 14.18 ; INT-20 → 14.19 ; UPLOAD-02/RACE-01 → 14.20

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
| anythingllm | mintplexlabs/anythingllm:latest | 3001→3001 | unless-stopped | ✅ Actif |
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
| Version code audité | v1.17.0 (commit fa7ec877f005a21ede94888b3b8618b700343857) |
| ⚠️ À vérifier | Image ID et digest du conteneur déployé vs commit audité |
| Vector DB | LanceDB |
| Embeddings | BGE-M3 via Ollama |
| Modèle de génération | mistral:latest |

**⚠️ Vérification de l'image obligatoire avant tout déploiement de correctif** (voir section 14.2 et section 13 item 22).

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

**Cache vectoriel :** clé = `UUIDv5(chemin_du_fichier)`. Un fichier modifié sans changement de nom peut servir des chunks périmés. Stratégie : **suppression du cache + réimport** (jamais un simple réimport).

**Suppression :** `purgeFolder()` supprime les index du premier niveau uniquement, puis efface récursivement le dossier. Les sous-dossiers peuvent laisser des index orphelins. Voir ALLM-16 (section 14.12).

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
| 6 | Activer `WORKSPACE_DELETION_PROTECTION=1` dans `anythingllm.env` au prochain redémarrage planifié | 🔴 Haute | Avant tout import automatisé |
| 7 | Décider correction route `env-dump` (ALLM-12 ⚠️) : options A/B/C — voir section 14.9 | 🔴 Haute | Avant prochain redémarrage |
| 8 | Exécuter plan de test SEC/RAG/OPS en instance isolée (21 tests — voir section 14.13) | 🔴 Haute | Avant déploiement n8n |
| 9 | Concevoir et valider passerelle n8n dédiée avec allowlist workspaces — voir Plan-correctifs | 🔴 Haute | Avant import automatisé |
| 10 | Transition point de montage ~/NAS-Test → ~/IA/Corpus-IA | 🟡 Moyenne | Cohérence |
| 11 | Décider architecture HTTPS : reverse proxy vs Tailscale Serve | 🟡 Moyenne | Homer, accès autres services |
| 12 | Configurer Homer — compléter les tuiles (dont Documentation) | 🟡 Moyenne | UX portail |
| 13 | Créer workspaces Corpus-IA thématiques dans AnythingLLM | 🟡 Moyenne | RAG production |
| 14 | Créer comptes Chia-hua et Kostia dans Open WebUI | 🟡 Moyenne | Accès multi-utilisateurs |
| 15 | Créer comptes Kostia et chhsu dans AnythingLLM — bloqué après tests ALLM-08 en instance isolée | 🟡 Moyenne | Multi-utilisateurs |
| 16 | Concevoir automatisation n8n — bloqué par items 7, 8, 9 | 🟡 Moyenne | Après validation sécurité |
| 17 | Configurer UPS → signal d'extinction Mac mini | 🟢 Basse | Fiabilité |
| 18 | Configuration Nextcloud (MariaDB) | 🟢 Basse | — |
| 19 | Appliquer tuile Homer pour GitHub Documentation | 🟡 Moyenne | UX portail |
| 20 | Tailscale Funnel 502 — investigation ou abandon définitif | 🟢 Basse | Accès public docs |
| 21 | Tailscale Serve — LaunchAgent pour persistance après redémarrage | 🟡 Moyenne | Fiabilité accès Open WebUI |
| 22 | **Vérifier image conteneur anythingllm avant tout déploiement de correctif** : `docker inspect anythingllm` → image ID et digest vs commit fa7ec877 ; vérifier présence `EMBED_BODY_LIMIT` dans `/app/server/index.js` de l'image déployée | 🔴 Haute | Avant ALLM-12 et DOS-02 |
| 23 | DOS-02 : décider limite de corps sur `/api/embed` — vérifier d'abord l'image (item 22) | 🟡 Moyenne | Sécurité DoS |
| 24 | INT-17 à RACE-01 : préparer et exécuter tests TEST-17 à TEST-21 en environnement isolé — voir section 14.17 à 14.20 | 🟡 Moyenne | Fiabilité opérations documentaires |

*Clos depuis v0.2 :*
- ~~Item 12 (v0.2) : Identifier source fichier cache `5d8cac14-*.json`~~ → ✅ Clos — cache de `06_volunteer_day_notice_2026-11_ZH.txt`

---

## 14. Audit de sécurité AnythingLLM — état au 23 octobre 2026

### 14.1 Périmètre et méthode

Audit en lecture seule du code **installé dans le conteneur** `anythingllm` (v1.17.0, commit `fa7ec877f005a21ede94888b3b8618b700343857`) ainsi que du checkout source `/home/claude/anything-llm-src/`. Inspection statique uniquement. Aucun réglage modifié. Aucune route destructive testée.

Niveaux de preuve :
- **Code confirmé** : comportement visible dans les fichiers installés ou sur GitHub tag v1.17.0
- **Test empirique** : résultat observé lors d'un appel de lecture
- **Risque plausible/élevé** : déduction du code sans exploitation démontrée
- **Non testé** : ne pas présenter comme résultat acquis

⚠️ **L'image `mintplexlabs/anythingllm:latest` est une balise mutable.** Vérifier que l'image en production correspond au commit audité avant tout déploiement de correctif (item 22, section 13).

### 14.2 Infrastructure et chemins utiles

- Compose : `/Users/florian/services/ai-stack/compose.yaml`
- Conteneur : `anythingllm`, port hôte `3001`
- Stockage : volume Docker monté sur `/app/server/storage`
- Corpus : `/Users/florian/IA/Corpus-IA` → `/mnt/nas-corpus` (RO)
- Checkout source : `/home/claude/anything-llm-src/`

### 14.3 Comptes et espaces constatés

- `florian-admin` : rôle `admin`, ID 1
- `florian` : rôle `default`, ID 2
- `Test-Corpus-IA` : ID 2, membre florian-admin
- `Florian - Personnel` : ID 3, membres florian-admin et florian
- Comptes Kostia et chhsu : pas encore créés
- Clé `Import-Corpus-IA` : créée par florian-admin ; usage réel non établi

### 14.4 Clé API : portée réelle de `validApiKey` et modèle officiel

`validApiKey.js` vérifie uniquement qu'un bearer token existe dans la table `ApiKey`. Aucun lien avec un utilisateur, rôle ou workspace.

**Confirmé par SECURITY.md v1.17.0 :** les Developer API keys sont des identifiants système accordant un accès admin complet par conception. Ce n'est pas un bug — c'est le comportement intentionnel documenté.

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
- `purgeDocument()` : supprime associations dans **tous les workspaces**
- `purgeFolder()` : voir section 14.12

### 14.8 Protection de suppression de workspace

`workspaceDeletionProtection.js` : ne bloque `DELETE /v1/workspace/:slug` que si `WORKSPACE_DELETION_PROTECTION` est dans l'environnement. **Variable absente → protection inactive.**

**Action requise :** ajouter `WORKSPACE_DELETION_PROTECTION=1` dans `anythingllm.env` au prochain redémarrage.

### 14.9 ⚠️ Route `env-dump` — décision de durcissement requise (ALLM-12)

**Code confirmé dans le source installé** (`/home/claude/anything-llm-src/server/endpoints/api/system/index.js`, ligne 16) :

```js
// AUCUN middleware [validApiKey] :
app.get("/v1/system/env-dump", async (_, response) => {
  try {
    if (process.env.NODE_ENV !== "production")
      return response.sendStatus(200).end();
    dumpENV();
    response.sendStatus(200).end();
  } catch (e) { ... }
});
// Route suivante — avec auth :
app.get("/v1/system", [validApiKey], async (_, response) => { ... });
```

Confirmé sur v1.17.0 et v1.18.0.

**Ce que fait `dumpENV()` :** écrase `/app/server/.env` dans le conteneur avec les valeurs de `process.env` sanitisées (supprime `'`, `"`, `#`, `\n`). **Ne retourne pas les secrets dans la réponse HTTP.**

**Facteurs atténuants :** accès Tailscale uniquement ; pas de secret dans la réponse.

**Ambiguïté documentée (23 oct 2026) :** `openapi.json` de v1.17.0 décrit une réponse `403 InvalidAPIKey` (suggère que l'auth était prévue) ; mais un commentaire de la branche principale indique que la route est explicitement sans auth par intention. La tension n'est pas résolue. Voir Journal ALLM-12 pour les détails.

**Statut reclassifié** : de "🔴 P0 confirmé" à "⚠️ Décision de durcissement requise" — l'absence d'auth peut être intentionnelle.

**Patch CP-3 préparé (23 oct 2026) :**
- `server/endpoints/system.js` : `[validatedRequest, flexUserRoleValid([ROLES.admin])]`
- `server/endpoints/api/system/index.js` : `[validApiKey]`
- SHA-256 : `b27d886c07d890616ef12d072d0848195214457dc07836ba34417a2940ca1a7e`
- `node --check` ✅ sur les deux fichiers
- **Non déployé**

**Options de décision :**

| Option | Action | Condition préalable |
|--------|--------|---------------------|
| A | Appliquer CP-3 | Vérifier image + dépendances scripts internes |
| B | Désactiver la route | `return response.sendStatus(404)` en début de handler |
| C | Accepter le risque | Documenter avec Tailscale comme unique contrôle |

### 14.10 Pipeline d'import : vecteurs et association SQL sans transaction commune (ALLM-14)

`Document.addDocuments` : insertion LanceDB **avant** SQL. Si la création SQL échoue, aucune compensation visible → vecteurs orphelins possibles. `uploadToWorkspace` peut retourner `true` malgré un import partiel.

### 14.11 Cache vectoriel indexé sur le chemin source (ALLM-15)

Clé de cache = `uuidv5(chemin)`. Pas de hash du contenu. Stratégie requise : suppression du cache + réimport (jamais simple réimport).

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

### 14.13 Plan de test consolidé — avant d'activer n8n

| ID test | Scénario | Résultat attendu | Exécuté ? |
|---|---|---|---|
| SEC-01 | `GET /api/v1/system/env-dump` sans clé | Refus HTTP ; aucun `.env` modifié | À exécuter |
| SEC-02 | Clé Developer API invalide sur routes protégées | Refus HTTP ; aucun effet secondaire | À exécuter |
| SEC-03 | Passerelle n8n vers workspace allowlisté | Opération minimale autorisée | À exécuter |
| SEC-04 | Même passerelle vers workspace non autorisé | Refus avant toute écriture | À exécuter |
| SEC-05 | Tentative suppression/déplacement par passerelle | Refus sauf permission explicite | À exécuter |
| RAG-01 | Import d'un nouveau fichier | Succès vérifié SQL + LanceDB + cache | À exécuter |
| RAG-02 | Même fichier importé deux fois | Pas de double association/vecteur | À exécuter |
| RAG-03 | Fichier modifié au même chemin | Chunks conformes au nouveau contenu | À exécuter |
| RAG-04 | Échec embedding | Réponse d'échec fiable | À exécuter |
| RAG-05 | Échec SQL après insertion LanceDB | Compensation traçable | À exécuter |
| RAG-06 | Suppression d'un document avec mapping | Cache, SQL et vecteurs supprimés | À exécuter |
| RAG-07 | Dossier avec sous-dossiers purgé | Aucun index/association abandonné | À exécuter |
| RAG-08 | Modification du modèle d'embedding | Réindexation cohérente | À exécuter |
| OPS-01 | État des volumes et sauvegarde | Sauvegarde + restauration d'essai | À exécuter |
| TEST-15 | `WORKSPACE_DELETION_PROTECTION=1` actif | `DELETE /v1/workspace/:slug` → 403 | À exécuter |
| TEST-16 | DOS-02 : vérifier `EMBED_BODY_LIMIT` dans image déployée | Variable présente ou upstream intégré | À exécuter |
| TEST-17 | `move-files` source = répertoire | Refus HTTP, aucun déplacement | À exécuter |
| TEST-18 | `move-files` destination existante | Refus, destination inchangée, source préservée | À exécuter |
| TEST-19 | Lot de déplacements avec source invalide | Résultat individuel par opération | À exécuter |
| TEST-20 | `remove-folder` sur dossier inexistant | Réponse distincte de "supprimé" | À exécuter |
| TEST-21 | Uploads simultanés du même fichier | Aucune corruption | À exécuter |

**Tests à exécuter exclusivement dans un environnement isolé — jamais sur la production.**

### 14.14 Mesures conservatoires avant reprise

1. Ne pas lancer l'automatisation n8n avant résolution d'ALLM-12, conception de la passerelle et exécution d'un sous-ensemble du plan de test.
2. Ne pas révoquer `Import-Corpus-IA` sans vérifier son usage dans les logs.
3. Activer `WORKSPACE_DELETION_PROTECTION=1` au prochain redémarrage planifié.
4. Vérifier l'image du conteneur avant tout déploiement (item 22, section 13).
5. Ne pas créer les comptes Kostia et chhsu dans AnythingLLM avant tests ALLM-08.
6. Tests destructifs uniquement en instance isolée.
7. Ne pas supposer qu'un import retournant `success: true` est cohérent.
8. Ne jamais écrire de mots de passe, clés API, secrets JWT ou codes de récupération dans la documentation.

### 14.15 Statut de l'audit au 23 octobre 2026

**Confirmé dans le code installé :**
- `validApiKey` sans liaison utilisateur/workspace — intentionnel
- Plusieurs routes sans contrôle d'appartenance
- `POST /v1/workspace/:slug/vector-search` retourne `source.text`
- Route `GET /v1/system/env-dump` sans authentification
- Protection workspace inactive (`WORKSPACE_DELETION_PROTECTION` absente)
- Pipeline d'import : vecteurs avant SQL, sans compensation visible
- Cache vectoriel par chemin, pas par contenu
- `purgeFolder` : index non récursif, suppression physique récursive
- `create-folder` accepte les chemins imbriqués
- `Document.removeDocuments()` peut avaler les erreurs SQL
- `purgeVectorCache()` sans gestion complète des rejets
- `bodyParser` global 3GB avant auth (DOS-02)
- `move-files` sans validation type source ni destination (INT-17/18)
- Lot de déplacements non atomique (INT-19)
- `remove-folder` retour anticipé silencieux → faux succès possible (INT-20)
- Multer écrit avant validation workspace (UPLOAD-02)

**Non testé :** exploitation effective de ces risques.

**Correctifs appliqués en production :** aucun.

---

### 14.16 DOS-02 — Parseurs globaux sans limite avant authentification

**Date :** 23 octobre 2026 | **Statut :** ⚠️ Confirmé v1.17.0 et v1.18.0

Dans `server/index.js`, `bodyParser` avec `FILE_LIMIT = "3GB"` monté avant tout middleware d'authentification. La route `/api/embed` est particulièrement exposée car sans auth.

**Correctif upstream :** commit `c729bf480ab146063b6c9ef287182384b9b080e0` (14 oct 2026) — limite 1 MB sur `/api/embed`. **Absent de v1.17.0 ET v1.18.0.**

**Vérification préalable obligatoire :** avant tout correctif, vérifier la présence de `EMBED_BODY_LIMIT` dans `/app/server/index.js` de l'image déployée et confirmer que l'image correspond au commit audité (voir TEST-16 et item 22 section 13).

**Impact :** saturation mémoire/disque possible. Pas d'exposition de secrets.

**Facteur atténuant :** accès Tailscale uniquement.

---

### 14.17 INT-17 et INT-18 — Routes `move-files` : validation insuffisante (MVT-01/02)

**Date :** 23 octobre 2026

**INT-17 (MVT-01) — Absence de validation du type de la source :**  
`move-files` ne vérifie pas que la source est un fichier ordinaire avant `fs.rename()`. Un répertoire ou un lien symbolique peut être passé. `isWithin()` valide le périmètre mais pas le type.

Risque TOCTOU : un `lstat()` isolé suivi de `rename()` n'est pas atomique. La politique sur les liens symboliques n'est pas définie dans le code.

**INT-18 (MVT-02) — Écrasement silencieux de la destination :**  
`fs.rename()` sur une destination existante écrase sans avertissement sur POSIX. Aucune vérification d'existence avant déplacement.

Un schéma `existsSync + rename` n'est **pas atomique** : race condition possible. Besoin d'une primitive offrant une garantie réelle (flag `O_EXCL` ou équivalent adapté à Node.js).

**Action recommandée :**
- Ajouter `lstat().isFile()` avant `rename()`
- Définir et documenter la politique lien symbolique
- Refuser si la destination existe, avec une erreur exploitable
- Utiliser une primitive anti-écrasement garantie

**Tests :** TEST-17, TEST-18.

---

### 14.18 INT-19 — Lots de déplacements non atomiques (MVT-03)

**Date :** 23 octobre 2026

`Promise.all(fs.rename ops)` : en cas d'erreur sur une opération, les autres peuvent être déjà exécutées ou en cours. La réponse agrégée ne distingue pas les succès des échecs individuels.

**Décision requise — choisir une sémantique :**
- **Option A — lot atomique :** si un déplacement échoue, les opérations déjà effectuées sont annulées. Le mécanisme de compensation doit être vérifié.
- **Option B — résultats individuels :** chaque opération a un résultat explicite (succès/échec/non exécuté). Aucun succès global ne masque un échec partiel.

**Pré-validation requise avant toute opération physique :** structure du lot, sources, destinations, doublons, conflits source/destination internes.

**Tests :** TEST-19.

---

### 14.19 INT-20 — Route `remove-folder` : faux succès HTTP (PUR-01/02)

**Date :** 23 octobre 2026

**PUR-01 — Réponse HTTP trompeuse :** `purgeFolder()` effectue des retours anticipés silencieux (dossier protégé, chemin invalide, dossier inexistant) et les routes ne vérifient pas son résultat avant de répondre HTTP 200.

**PUR-02 — Contrat HTTP requis :**  
Remplacer la réponse implicite par un résultat nommé : `deleted`, `protected`, `invalid`, `not_found`, `partial_failure`, `failure`. Les routes API et Web doivent utiliser des codes HTTP cohérents.

**Protection `custom-documents` :** préserver et rendre explicite dans le résultat retourné.

**Compléments PUR-01 :** `purgeFolder()` n'énumère que les entrées de premier niveau ; `Document.removeDocuments()` peut avaler les erreurs SQL ; `purgeVectorCache()` rejet async non intercepté.

**Action :** `purgeFolder()` doit retourner un résultat structuré ; les routes doivent le propager.

**Tests :** TEST-20, RAG-07.

---

### 14.20 UPLOAD-02 et RACE-01 — Fichiers temporaires et upload concurrent

**Date :** 23 octobre 2026

**UPLOAD-02 — Fichiers temporaires orphelins :**  
Multer écrit dans `collector/hotdir` avant `validateWorkspaceSlugQuery`. Si la validation échoue, le fichier temporaire reste sur le disque.

*Action :* ajouter un nettoyage dans le handler d'erreur après validation.

**RACE-01 — Hypothèse de collision sur upload concurrent :**  
Multer pourrait utiliser le nom de fichier original sanitisé comme nom temporaire dans `hotdir` sans suffixe unique. Deux uploads simultanés du même fichier pourraient se corrompre mutuellement.

*Statut :* hypothèse à confirmer — examiner `multer.js` et tester deux uploads simultanés.

**Tests :** TEST-21 (UPLOAD-02 et RACE-01).

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
- Vérifier que `anythingllm.env` contient `WORKSPACE_DELETION_PROTECTION=1`
- Ne pas redémarrer après un appel à `/api/v1/system/env-dump` sans vérifier le fichier `.env` résultant dans le conteneur

### 15.5 Retour arrière après déploiement d'un correctif

Si un correctif est déployé et crée une régression :

1. **Arrêter le conteneur** :
   ```bash
   docker stop anythingllm
   ```
2. **Revenir à l'image précédente** : utiliser l'image ou la balise avant déploiement (noter l'ID avant tout changement).
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
# Identifier l'image et la balise actuelle
docker inspect anythingllm --format '{{.Config.Image}} {{.Image}}'

# Vérifier la présence de EMBED_BODY_LIMIT dans le code déployé
docker exec anythingllm grep -n "EMBED_BODY_LIMIT\|FILE_LIMIT" /app/server/index.js

# Vérifier la route env-dump dans le conteneur
docker exec anythingllm grep -n "env-dump\|validApiKey" /app/server/endpoints/api/system/index.js

# Vérifier la version de l'application
docker exec anythingllm node -e "console.log(require('/app/package.json').version)"
```

Ces vérifications permettent de confirmer que le code audité correspond bien au code en production avant d'appliquer ou de rejeter un correctif.

---

*Auteur : Florian — élaboré avec Claude et ChatGPT*  
*Sources : notes de passation ChatGPT (9, 11, 12 oct 2026) + conversations Claude oct 2026 + audit AnythingLLM oct 2026 + dossiers ChatGPT 23 oct 2026*  
*Version 0.4 — 23 octobre 2026*  
*Changements v0.4 : section 0 (TOC) ; section 13 items 22-24 (vérification image, DOS-02, INT-17 à RACE-01) ; section 14.9 ALLM-12 reclassifié (décision requise + CP-3 documenté) ; section 14.12 ALLM-16 complété (chemins imbriqués, erreurs SQL silencieuses, purgeVectorCache async) ; section 14.13 plan de test 21 tests ; sections 14.16 à 14.20 (DOS-02, INT-17/18, INT-19, INT-20, UPLOAD-02/RACE-01) ; section 15 procédures d'exploitation ajoutée.*
