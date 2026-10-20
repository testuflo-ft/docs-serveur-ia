# Livret Technique — Serveur IA Mac mini + Synology

*Version 0.3 — 20 octobre 2026*

**Statuts utilisés dans ce document :**
- ✅ Vérifié — constat direct, sortie de commande ou code examiné
- ⚙️ Configuré non testé — présent dans les fichiers, fonctionnement non confirmé
- 🔲 À faire — objectif décidé, pas encore réalisé
- ⚠️ Hypothèse — explication plausible, à confirmer
- 🗄️ Obsolète — ancienne configuration conservée pour comprendre un incident

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

Résultat dans `tailscale serve status` :
```
https://minimac.saiga-tilapia.ts.net (tailnet only)
|-- / proxy http://127.0.0.1:3000
|-- /docs proxy http://servor:8090
```

✅ Open WebUI accessible en HTTPS propre via `/`.  
⚠️ **La configuration Tailscale Serve n'est pas persistante** — elle est perdue au redémarrage du Mac mini. Voir tâche 18 pour la mise en place d'un LaunchAgent.

**Conflit historique résolu (13 oct 2026) :** la commande `tailscale serve --bg http://servor:8090` sans `--set-path` avait écrasé la route `/` et cassé Homer et Open WebUI. La solution est le paramètre `--set-path /docs`.

### 3.4 Architecture HTTPS multi-applications — décision en attente

🔲 Seul Open WebUI dispose d'un accès HTTPS propre. Les autres services (n8n, Homer, AnythingLLM, Nextcloud) sont en HTTP local ou HTTPS via port non standard.

Options à évaluer :
1. Reverse proxy central (Caddy) sur le Mac mini avec noms de sous-chemin ou sous-domaines
2. Ports Tailscale Serve distincts par service

**Contrainte :** l'URL OIDC d'Open WebUI (`https://minimac.saiga-tilapia.ts.net/oauth/oidc/callback`) est enregistrée dans le SSO Synology — ne pas la modifier sans raison, au risque de casser l'authentification.

**Note technique :** ajouter `:3000` à une URL HTTPS essaierait une connexion TLS directe sur ce port, ce qui ne fonctionne pas avec la configuration actuelle.

### 3.5 Tailscale Funnel — exposition publique (non fonctionnel)

**Objectif :** rendre la documentation accessible publiquement à des outils externes (ChatGPT, Claude) sans authentification.

**Commandes testées (13 oct 2026) :**
```bash
tailscale cert minimac.saiga-tilapia.ts.net   # certificat généré ✅
tailscale funnel --bg http://127.0.0.1:443    # HTTP 502 côté navigateur ❌
```

`tailscale funnel status` affichait le routage correct, mais le navigateur et `curl` retournaient `HTTP 502 Bad Gateway`. Cause probable : boucle de routage (`http://127.0.0.1:443` → Funnel → lui-même), ou délai de propagation DNS. Non résolu.

**Conséquences :** l'exposition publique via Funnel est abandonnée pour l'instant. La documentation est hébergée sur GitHub (voir section 11).

**Important :** `minimac.saiga-tilapia.ts.net` reste une URL **privée au tailnet** — seuls les appareils connectés à Tailscale y ont accès. La Funnel non fonctionnelle ne crée pas d'exposition publique.

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
| Protocole alternatif NFS | Abandonné — voir incident SMB-03 |

### 4.2 Fichiers clés

| Fichier | Rôle | Permissions |
|---------|------|-------------|
| `~/.nsmbrc` | Identifiants SMB — section `[192.168.1.103:Florian]` avec `password=` | **600** — ne jamais afficher |
| `~/bin/ensure-nas-mount.sh` | Script de montage/remontage | **700** |
| `~/Library/LaunchAgents/com.florian.mount-corpus-ia.plist` | Déclenchement automatique toutes les 120 s, au démarrage | standard |
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

✅ **Validation (11 oct 2026) :** remontage automatique en moins de 3 secondes après déconnexion forcée (`sudo umount`).

### 4.4 Pourquoi cette approche et pas les alternatives

| Tentative | Résultat | Raison |
|-----------|----------|--------|
| `mount_smbfs -N` | ❌ Échec "Authentication error" | Cassé sur macOS moderne même avec `.nsmbrc` — comportement documenté, cause Apple interne |
| `security add-internet-password` (Trousseau depuis SSH) | ❌ "User interaction is not allowed" | Nécessite session graphique (audit session) |
| `osascript` / Finder depuis LaunchAgent | ❌ Blocage indéfini | Requiert audit GUI session, non disponible au démarrage sans login physique |
| NFS | ❌ "Operation not permitted" | NFS non activé dans DSM **— ne pas rouvrir sans raison technique nouvelle** |

### 4.5 Signaux connus dans les logs

| Message | Signification |
|---------|---------------|
| `monté : /Users/florian/IA/Corpus-IA` | Montage réussi |
| `monté mais sans réponse` | Share monté mais `ls` a expiré (avertissement mineur, non bloquant) |
| `mot de passe introuvable dans .nsmbrc` | Section manquante ou mal nommée dans `.nsmbrc` |
| `échec mount_smbfs (code N)` | Erreur de montage — vérifier connectivité NAS et identifiants |

Erreurs kernel `smb2_smb_read: Unexpected partial read` : observées lors d'accès Docker au bind mount. Avertissements seuls, aucun fichier altéré constaté. ⚠️ Suspect : accès Open WebUI au bind mount NAS.

---

## 5. Docker et OrbStack

### 5.1 Runtime Docker

| Élément | Valeur |
|---------|--------|
| Runtime | OrbStack (remplace Docker Desktop sur Apple Silicon) |
| Démarrage automatique | ⚙️ LaunchAgent `open -a OrbStack` — à vérifier |

**Important :** sur macOS avec OrbStack, les volumes Docker ne sont **pas** accessibles via `/var/lib/docker/volumes/` (contrairement à Linux). Utiliser `docker exec` ou `docker cp` pour accéder aux fichiers dans les conteneurs et volumes.

### 5.2 Inventaire des conteneurs

| Conteneur | Image | Port hôte | Restart | Statut |
|-----------|-------|-----------|---------|--------|
| open-webui | ghcr.io/open-webui/open-webui:main | 3000→8080 | unless-stopped | ✅ Actif, healthy |
| anythingllm | mintplexlabs/anythingllm:latest | 3001→3001 | unless-stopped | ✅ Actif |
| n8n | n8n | 5678→5678 | — | ⚙️ Actif, non configuré |
| home-assistant | homeassistant/home-assistant | 8123→8123 | — | ⚙️ Actif, non configuré |
| homer | b4bz/homer | 8888→8080 | — | ⚙️ Actif, config partielle (voir section 12) |
| nextcloud | nextcloud | — | — | 🔲 Arrêté, reconfiguration MariaDB en cours |
| open-webui-before-oidc | ghcr.io/open-webui/open-webui:main | — | — | 🗄️ Conservé — **ne pas supprimer avant validation complète** |

Commande d'inventaire des ports :
```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

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

⚠️ Un dossier monté dans le conteneur **n'est pas automatiquement indexé**. L'import reste une action explicite dans l'interface ou via l'API.

⚠️ La racine du dossier `homes` ne doit **jamais** être montée dans un conteneur — elle contient des fichiers privés de tous les utilisateurs.

---

## 6. Open WebUI

### 6.1 Configuration générale

| Élément | Valeur |
|---------|--------|
| Version | 0.11.4 |
| URL | https://minimac.saiga-tilapia.ts.net |
| Fichier d'environnement | `~/.config/open-webui/recreate.env` — permissions 600 |
| Ollama | http://host.docker.internal:11434 |
| USE_OLLAMA_DOCKER | false |

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
| OAUTH_TOKEN_ENDPOINT_AUTH_METHOD | client_secret_post |
| ENABLE_OAUTH_SIGNUP | true |

Application OIDC côté Synology : "Open WebUI" dans SSO Server.  
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
- 🔲 Vérifier présence des 7 documents (dont `07_fiche_controle_extincteur_scan_FR_OCR.pdf`)
- 🔲 Test Mistral : réponse attendue sur la fiche extincteur → 9 janvier 2027, numéro 7731-KP

---

## 7. AnythingLLM

### 7.1 Configuration générale

| Élément | Valeur |
|---------|--------|
| URL | https://minimac.saiga-tilapia.ts.net:8445 |
| Mode | Multi-utilisateur (team) |
| Image | mintplexlabs/anythingllm:latest (4 oct 2026, révision feb04ca0) |
| Vector DB | LanceDB (valeur par défaut quand VECTOR_DB non défini) |
| Embeddings | BGE-M3 via Ollama |
| Reranker | Xenova/ms-marco-MiniLM-L-6-v2 |
| Modèle de génération | mistral:latest |
| Similarity threshold | 0 |
| Top N | 4 |
| Chat mode | query |
| Vector search mode | rerank |

### 7.2 Comptes

| Compte | Rôle |
|--------|------|
| florian-admin | Administrateur |
| florian | Utilisateur standard |

### 7.3 Workspaces

| Workspace | Slug | Test RAG | Notes |
|-----------|------|----------|-------|
| Test-Corpus-IA | test-corpus-ia | ✅ ZH correct (7 nov 2026) | Attribué à florian-admin |
| Florian - Personnel | — | ⚙️ Créé | Visible par les deux comptes ; florian standard le voit vide |

### 7.4 Mécanisme d'indexation — points critiques

**Import :**
- Route `POST /v1/document/upload` → fichier → hotdir → Collector.processDocument → Document.addDocuments
- L'API ne parcourt pas spontanément les dossiers montés — **import explicite requis à chaque fois**

**Cache vectoriel :**
- Emplacement : `/app/server/storage/vector-cache/`
- Nom du fichier : `UUIDv5(chemin_du_fichier).json`
- ⚠️ La clé de cache est basée sur le **chemin**, non sur le contenu. Un fichier modifié sans changement de nom peut servir des chunks périmés.
- Stratégie de mise à jour : **suppression + réimport** (jamais un simple réimport)

**Suppression :**
- `purgeDocument(filename)` supprime le cache ET les associations dans **tous les workspaces** simultanément
- Supprimer un fichier source du NAS et purger AnythingLLM sont deux opérations distinctes — ne jamais les coupler automatiquement sans stratégie définie

**Sécurité API — inspection statique du code (15 oct 2026) :**

Inspection en lecture seule du conteneur `anythingllm`. Aucune clé créée, aucun document importé, aucune permission modifiée.

| Élément inspecté | Constat |
|-----------------|---------|
| `validApiKey.js` | Vérifie seulement qu'un bearer token existe dans la table `ApiKey`. Pas de lien avec le créateur, pas de restriction de workspace, pas de contrôle du champ `createdBy`. |
| `GET /v1/workspaces` et `/v1/workspace/:slug` | Aucun filtrage par utilisateur visible (contrairement à `Workspace.whereWithUser`, utilisé pour d'autres rôles). |
| `GET /v1/documents` et `/v1/documents/folder/:folderName` | Aucun filtrage par utilisateur visible. |
| `getDocumentsByFolder()` | Semble bloquer la traversée de répertoires classique (`isWithin`, `lstatSync`). Comportement des liens symboliques et de `normalizePath` non vérifié. |
| Routes de téléchargement de contenu | **Non encore examinées** — point critique restant. |

**Verdict (confirmé empiriquement le 15 oct 2026) :**

`GET /api/v1/workspaces` → retourne les 3 workspaces sans filtrage utilisateur ✅ confirmé  
`GET /api/v1/documents` → retourne les métadonnées de TOUS les documents du système ✅ confirmé  
Contenu textuel des chunks indexés : non exposé par l'API (stocké dans le vector cache du conteneur).

**Niveau de risque révisé :** une clé API permet de cartographier l'instance (workspaces, documents uploadés, threads) mais ne permet pas de lire le contenu indexé directement. Risque de **cartographie**, pas de fuite de contenu.

**Règles de conception pour l'automatisation n8n :**
- Workspaces de destination hardcodés dans le workflow (jamais un slug fourni par l'utilisateur)
- Clé API stockée comme credential n8n, jamais en clair dans le workflow ni visible par les utilisateurs
- Une clé dédiée à n8n, séparée de toute clé d'exploration manuelle
- Journaliser tous les appels API pour audit

⚠️ **N8n bloqué** tant que l'architecture des workspaces thématiques n'est pas définie (étape 4 de la feuille de route).

### 7.5 Fichier cache observé — identifié (15 oct 2026)

| Élément | Valeur |
|---------|--------|
| Fichier cache | `5d8cac14-8cf5-5c28-964b-c70d2dae2fdb.json` |
| Taille | 13 774 octets |
| Dernière modification | 2026-10-11 06:03:10 UTC |
| Document source | ✅ `06_volunteer_day_notice_2026-11_ZH.txt` |
| Identifié par | Timestamp API (`published: 10/11/2026, 6:03:08 AM`) — écart de 2 secondes |

L'UUID du cache (`5d8cac14-…`) est distinct de l'ID de document API (`6025bd66-…`) : confirmation que le cache est indexé par UUIDv5 calculé depuis le chemin du fichier, pas depuis l'ID document.

**État de la bibliothèque de documents (15 oct 2026) :** un seul document dans le système — `06_volunteer_day_notice_2026-11_ZH.txt`. Les autres fichiers du corpus de test ne sont plus dans la bibliothèque globale et devront être réimportés.

### 7.6 SSO AnythingLLM

AnythingLLM ne supporte pas OIDC nativement (version actuelle). Le "Simple SSO" est un mécanisme de token à usage unique nécessitant un bridge personnalisé et des comptes préalablement créés.  
**Priorité : faible** — accès déjà restreint au tailnet Tailscale.

---

## 8. Ollama et modèles

| Élément | Valeur |
|---------|--------|
| Installation | Nativement sur macOS (pas dans Docker) |
| Accès depuis Docker | `http://host.docker.internal:11434` |

| Modèle | Usage | Notes |
|--------|-------|-------|
| mistral:latest | Chat, RAG, tool calling | ✅ Modèle principal — priorité européenne |
| gemma3:12b | Chat | ⚠️ Ne supporte pas le tool calling dans Open WebUI |
| llama3.1:8b | Chat | — |

**Orientation :** privilégier Mistral et les modèles européens pour tout nouvel ajout.

---

## 9. OCR

| Outil | Version | Installation |
|-------|---------|-------------|
| Tesseract | 5.5.3 | Global macOS (pas Docker) |
| tesseract-lang | — | fra, eng, chi_tra, spa, ita, nld, deu, jpn |
| OCRmyPDF | 17.13.0 | Global macOS |
| Poppler | — | Global macOS (pdftotext, pdfinfo) |

Commande type :
```bash
ocrmypdf -l fra --skip-text source.pdf output_OCR.pdf
```

Répertoire de travail OCR : `~/ocr-work/`

✅ Utilisé sur `07_fiche_controle_extincteur_scan_FR.pdf` (PDF scanné → indexation réussie après OCR).

---

## 10. Partages Synology et accès documentaires

### 10.1 Partages principaux

| Partage | Accès | Usage |
|---------|-------|-------|
| Corpus-IA | Florian RW, Corpuser-IA RO | Base commune IA, sous-dossiers thématiques |
| homes/[user] | Utilisateur propriétaire uniquement | Documents personnels |

⚠️ **Principe de moindre privilège :**
- Le compte `Corpuser-IA` n'a accès qu'à `Corpus-IA`, pas aux `homes`
- Les conteneurs Docker ne doivent jamais avoir accès aux `homes`

### 10.2 Applications Synology actives

| Application | Port | Statut |
|-------------|------|--------|
| DSM | 5001 (HTTPS) | ✅ |
| Synology SSO Server | via DSM | ✅ |
| Tailscale | — | ✅ |
| Synology Drive | 5010 | ✅ |
| Synology Photos | 5443 | ✅ |
| Note Station | 9351 | ✅ |
| Jellyfin | — | ✅ |
| Web Station | 8090 | ✅ (voir 10.3) |

### 10.3 Web Station — dossier Documentation

| Élément | Valeur |
|---------|--------|
| Application | Web Station (depuis Package Center DSM) |
| Type de virtual host | Basé sur le port |
| Port | 8090 |
| Racine du document | `Documentation_NAS` (dossier partagé Synology) |
| URL (tailnet) | http://servor.saiga-tilapia.ts.net:8090 |

**Fichiers présents dans `Documentation_NAS/` :**
- `index.html` — interface web avec rendu Markdown (marked.js v9.1.6, thème Catppuccin sombre)
- `Livret-Technique-Serveur-IA.md` — ce document
- `Journal-des-Incidents.md` — journal des incidents

L'`index.html` charge les fichiers `.md` via `fetch()`, les rend avec `marked.js`, et permet la navigation par barre latérale. L'URL du document peut être partagée via le hash (`#Livret-Technique-Serveur-IA.md`).

**Incident robots.txt (13 oct 2026) :** un fichier `robots.txt` avec `Disallow: /` a été placé dans `Documentation_NAS/` pour limiter le référencement, ce qui a bloqué l'accès WebFetch de Claude à **toutes les URLs du domaine** pendant ~20 minutes (cache proxy). Résolution : suppression du fichier. La protection repose désormais sur l'obscurité de l'URL et l'absence de référencement.

---

## 11. Documentation technique — dépôt GitHub

### 11.1 Dépôt

| Élément | Valeur |
|---------|--------|
| URL | https://github.com/testuflo-ft/docs-serveur-ia |
| Visibilité | Public |
| Branche principale | main |
| Contenu | Livret-Technique-Serveur-IA.md, Journal-des-Incidents.md |

Ce dépôt est la **source de vérité principale** pour la documentation. Il est accessible :
- par Claude via WebFetch (URLs `raw.githubusercontent.com` — accès direct sans authentification ✅)
- par ChatGPT via le plugin GitHub officiel ✅
- par Florian via l'interface GitHub

### 11.2 Accès aux fichiers bruts

```
https://raw.githubusercontent.com/testuflo-ft/docs-serveur-ia/main/Livret-Technique-Serveur-IA.md
https://raw.githubusercontent.com/testuflo-ft/docs-serveur-ia/main/Journal-des-Incidents.md
```

✅ Vérifié le 13 octobre 2026 : Claude peut lire ces URLs directement via WebFetch.

### 11.3 Workflow de mise à jour

1. Mettre à jour le fichier `.md` localement (ou via Claude)
2. Déposer (`push`) sur GitHub
3. Optionnel : copier également dans `Documentation_NAS/` pour la version Web Station

---

## 12. Homer — portail central

| Élément | Valeur |
|---------|--------|
| Conteneur | homer |
| Port hôte | 8888 → conteneur 8080 |
| URL actuelle | http://minimac.saiga-tilapia.ts.net:8888 |
| Statut | ⚙️ Actif, configuration partielle |

### 12.1 Configuration actuelle (état 13 oct 2026)

Fichier de configuration : `/www/assets/config.yml` à l'intérieur du conteneur.

**Procédure de modification :**
```bash
# Extraire le fichier
docker cp homer:/www/assets/config.yml /tmp/config.yml

# Modifier avec un éditeur
nano /tmp/config.yml

# Réinjecter dans le conteneur
docker cp /tmp/config.yml homer:/www/assets/config.yml
```

**Configuration appliquée :**
```yaml
title: "minimac"
subtitle: "Tableau de bord"
logo: "logo.png"
header: true
footer: false

services:
  - name: "Mes données"
    icon: "fas fa-folder"
    items:
      - name: "Mes fichiers"
        icon: "fas fa-folder-open"
        url: "https://servor.saiga-tilapia.ts.net/drive"
        subtitle: "Synology Drive"
      - name: "Mes notes"
        icon: "fas fa-sticky-note"
        url: "https://servor.saiga-tilapia.ts.net/notes"
        subtitle: "Synology Note Station"
      - name: "Mes photos"
        icon: "fas fa-images"
        url: "https://servor.saiga-tilapia.ts.net/photos"
        subtitle: "Synology Photos"

  - name: "Intelligence artificielle"
    icon: "fas fa-robot"
    items:
      - name: "Assistant IA"
        icon: "fas fa-brain"
        url: "https://minimac.saiga-tilapia.ts.net:8444/"
        subtitle: "Open WebUI"
      - name: "Réponses documentées"
        icon: "fas fa-book"
        url: "https://minimac.saiga-tilapia.ts.net:8445/"
        subtitle: "AnythingLLM"
```

### 12.2 Tuile Documentation à ajouter

🔲 La tuile suivante est préparée mais pas encore appliquée (à ajouter dans la section "Intelligence artificielle") :

```yaml
      - name: "Docs techniques"
        icon: "fas fa-file-alt"
        url: "https://github.com/testuflo-ft/docs-serveur-ia"
        subtitle: "Livret & Incidents"
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
| 6 | Vérifier risque sécurité validApiKey.js AnythingLLM | 🔴 Haute | Avant toute automatisation |
| 7 | Transition point de montage ~/NAS-Test → ~/IA/Corpus-IA | 🟡 Moyenne | Cohérence |
| 8 | Décider architecture HTTPS : reverse proxy vs Tailscale Serve | 🟡 Moyenne | Homer, accès autres services |
| 9 | Configurer Homer — compléter les tuiles (dont Documentation) | 🟡 Moyenne | UX portail |
| 10 | Créer workspaces Corpus-IA thématiques dans AnythingLLM | 🟡 Moyenne | RAG production |
| 11 | Créer comptes Chia-hua et Kostia dans Open WebUI | 🟡 Moyenne | Accès multi-utilisateurs |
| 12 | Identifier source fichier cache 5d8cac14-*.json | 🟢 Basse | Investigation |
| 13 | Concevoir automatisation n8n (import NAS → AnythingLLM) | 🟢 Basse | Après validation sécurité |
| 14 | Configurer UPS → signal d'extinction Mac mini | 🟢 Basse | Fiabilité |
| 15 | Configuration Nextcloud (MariaDB) | 🟢 Basse | — |
| 16 | Appliquer tuile Homer pour GitHub Documentation (config prête — voir 12.2) | 🟡 Moyenne | UX portail |
| 17 | Tailscale Funnel 502 — investigation ou abandon définitif | 🟢 Basse | Accès public docs |
| 18 | Tailscale Serve — LaunchAgent pour persistance après redémarrage | 🟡 Moyenne | Fiabilité accès Open WebUI |

---

*Auteur : Florian — élaboré avec Claude et ChatGPT*  
*Sources : notes de passation ChatGPT (9, 11, 12 oct 2026) + conversations Claude oct 2026*  
*Mise à jour : 13 octobre 2026*
