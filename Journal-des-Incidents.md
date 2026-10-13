# Journal des Incidents — Serveur IA Mac mini + Synology

*Version 0.1 — 12 octobre 2026*

Format de chaque entrée :
- **Symptôme** : ce qui a été observé
- **Cause vérifiée** (ou hypothèse si non démontrée)
- **Solution validée**
- **Test de validation**
- **Précautions pour la prochaine fois**

---

## SMB-01 — mount_smbfs -N échoue avec "Authentication error"

**Date :** octobre 2026  
**Statut :** ✅ Résolu

**Symptôme :**  
`mount_smbfs -N //Florian@192.168.1.103/Corpus-IA ~/NAS-Test` renvoie systématiquement "Authentication error" même avec un fichier `~/.nsmbrc` correctement configuré et un fichier `~/Library/Preferences/nsmb.conf` présent.

**Cause vérifiée :**  
L'option `-N` (no password prompt) est documentée comme utilisant le Trousseau macOS ou `.nsmbrc`, mais elle est cassée sur les versions modernes de macOS — le comportement a été observé directement, la cause interne dans la pile SMB d'Apple n'est pas documentée publiquement.

**Solution validée :**  
Lire le mot de passe depuis `~/.nsmbrc` via `awk` dans le script et le passer inline à `mount_smbfs` :
```bash
PASS=$(awk -F= '/^\[192\.168\.1\.103:[Ff]lorian\]/{f=1} f && /^password=/{print $2; exit}' ~/.nsmbrc)
mount_smbfs "//${NAS_USER}:${PASS}@${NAS_HOST}/${NAS_SHARE}" "$MP"
```

**Test de validation :**  
`sudo umount ~/IA/Corpus-IA && ~/bin/ensure-nas-mount.sh` → share remonté, log `monté : /Users/florian/IA/Corpus-IA` ✅

**Précautions :**  
- `~/.nsmbrc` contient le mot de passe en clair — permissions 600 obligatoires, ne jamais afficher son contenu dans une conversation ou un log
- Ne jamais tenter `mount_smbfs -N` — l'échec est silencieux et peut masquer un problème de script

---

## SMB-02 — LaunchAgent avec osascript bloqué indéfiniment

**Date :** octobre 2026  
**Statut :** ✅ Résolu

**Symptôme :**  
LaunchAgent utilisant `osascript` pour demander à Finder de monter le partage SMB : jamais de sortie, `last exit code` affiché `(never exited)` dans `launchctl`. Tentative `launchctl asuser` : "Could not switch to audit session: Operation not permitted".

**Cause vérifiée :**  
`osascript` nécessite une session graphique (GUI audit session). Depuis SSH, et même depuis un LaunchAgent au démarrage avant login graphique, cette session n'existe pas. Finder ne peut pas être contrôlé dans ces conditions.

**Solution validée :**  
Remplacer entièrement l'approche `osascript`/Finder par un script shell utilisant directement `mount_smbfs` (voir SMB-01). LaunchAgent appelle `~/bin/ensure-nas-mount.sh` toutes les 120 secondes.

**Test de validation :**  
`launchctl kickstart -k "gui/$(id -u)/com.florian.mount-corpus-ia"` après `sudo umount` → share remonté en moins de 3 secondes ✅

**Précautions :**  
- Ne jamais utiliser `osascript`, Finder, ni aucune app GUI depuis un LaunchAgent sur une machine sans écran connecté ou sans session graphique active
- Ne pas créer un second LaunchAgent avant d'avoir compris et corrigé le premier

---

## SMB-03 — NFS : "Operation not permitted"

**Date :** octobre 2026  
**Statut :** 🗄️ Abandonné — ne pas rouvrir

**Symptôme :**  
Tentative de montage NFS depuis le Mac mini vers le Synology : "Operation not permitted" avec et sans sudo.

**Cause vérifiée :**  
NFS n'était pas activé dans DSM.

**Solution :**  
Piste abandonnée au profit de SMB, qui fonctionne. NFS ajouterait de la complexité sans avantage démontré pour cet usage.

**Précautions :**  
**Ne pas rouvrir cette piste sans raison technique nouvelle et documentée.** SMB 3.1.1 signé fonctionne correctement sur la liaison 10GbE directe.

---

## SMB-04 — Trousseau macOS inaccessible en écriture depuis SSH

**Date :** octobre 2026  
**Statut :** 🗄️ Contourné — ne pas retenter

**Symptôme :**  
`security add-internet-password -w` depuis SSH : invite de saisie du mot de passe invisible → mot de passe vide enregistré. Ou : retour immédiat "User interaction is not allowed."

**Cause vérifiée :**  
macOS bloque toute écriture dans le Trousseau nécessitant une interaction utilisateur depuis une session SSH (pas de session graphique).

**Solution :**  
Utiliser `~/.nsmbrc` à la place du Trousseau. Ne pas tenter de configurer le Trousseau depuis SSH.

**Précautions :**  
Si le Mac mini est un jour connecté à un écran, une entrée Trousseau pourrait être créée pour remplacer `.nsmbrc`. Mais `.nsmbrc` avec permissions 600 est fonctionnel et suffisant.

---

## OWUI-01 — WEBUI_SECRET_KEY perdue lors de la recréation du conteneur

**Date :** 9 octobre 2026  
**Statut :** ✅ Résolu (préventivement)

**Symptôme :**  
Avant résolution : risque de perte de la clé de session Open WebUI lors de la recréation du conteneur, entraînant l'invalidation de toutes les sessions actives.

**Cause vérifiée :**  
La `WEBUI_SECRET_KEY` était générée par le script de démarrage d'Open WebUI dans `/app/backend/.webui_secret_key`, dans le système de fichiers du conteneur — **pas dans le volume persistant**. Elle serait donc perdue à chaque recréation du conteneur.

**Solution validée :**  
Avant recréation, extraction de la clé depuis le conteneur existant (sans l'afficher dans le terminal) et ajout dans `~/.config/open-webui/recreate.env` (permissions 600). Le nouveau conteneur repart avec la même clé.

**Test de validation :**  
Nouveau conteneur actif et signalé "healthy". Connexions existantes préservées ✅

**Précautions :**  
- Toujours extraire `WEBUI_SECRET_KEY` avant de recréer un conteneur Open WebUI
- Ne jamais afficher ni copier `WEBUI_SECRET_KEY` dans une conversation ou un log
- `recreate.env` doit rester en permissions 600

---

## OWUI-02 — PDF scanné échoue à l'indexation (contenu vide)

**Date :** 10-11 octobre 2026  
**Statut :** ✅ Résolu

**Symptôme :**  
`07_fiche_controle_extincteur_scan_FR.pdf` — statut "failed" dans Open WebUI après tentative d'indexation. Le document est un PDF scanné (image), sans couche texte.

**Cause vérifiée :**  
Open WebUI extrait le texte des PDF pour l'indexation. Un PDF purement scanné ne contient pas de texte extractible — la tentative d'indexation retourne un contenu vide.

**Solution validée :**  
Générer un PDF avec couche OCR via `ocrmypdf` :
```bash
ocrmypdf -l fra --skip-text 07_fiche_controle_extincteur_scan_FR.pdf 07_fiche_controle_extincteur_scan_FR_OCR.pdf
```
Résultat : `~/ocr-work/07_fiche_controle_extincteur_scan_FR_OCR.pdf` (336 265 octets) ✅

**Test de validation :**  
🔲 À confirmer : vérifier que le document OCR est bien présent dans la base "Corpus-AI-test" et que Mistral répond correctement à "Quand a lieu le prochain contrôle de l'extincteur ?" (réponse attendue : 9 janvier 2027, numéro 7731-KP).

**Précautions :**  
- Tout PDF scanné devra passer par OCR avant indexation
- `--skip-text` évite de retraiter les pages qui ont déjà une couche texte
- Les outils OCR sont installés globalement sur macOS, pas dans Docker — `ocrmypdf` n'est pas disponible à l'intérieur des conteneurs

---

## OWUI-03 — gemma3:12b incompatible avec le tool calling

**Date :** octobre 2026  
**Statut :** ✅ Documenté (comportement attendu)

**Symptôme :**  
Message d'erreur dans Open WebUI lors de l'utilisation de `gemma3:12b` pour des tâches nécessitant des outils (tool calling).

**Cause vérifiée :**  
`gemma3:12b` ne supporte pas le tool calling dans la version Ollama / Open WebUI testée.

**Solution :**  
Utiliser `mistral:latest` pour toute tâche nécessitant des outils. Réserver `gemma3:12b` aux conversations sans outils.

**Précautions :**  
Ne pas confondre cette erreur avec un échec d'indexation — les documents peuvent être correctement indexés même si le modèle échoue sur le tool calling.

---

## OWUI-04 — Clé API Open WebUI exposée

**Date :** 11 octobre 2026  
**Statut :** 🔲 À confirmer révoqué

**Symptôme :**  
Une clé API Open WebUI a été utilisée pour importer le PDF OCR (bloc 4 de la session du 11 octobre). Cette clé a circulé dans la session de travail.

**Cause :**  
Usage temporaire pour l'automatisation d'import — clé créée pour l'occasion.

**Action requise :**  
Vérifier dans Open WebUI (Paramètres → Compte → Clés API) que la clé a bien été révoquée. Si non révoquée : la révoquer.

**Précautions :**  
Les clés API Open WebUI ne doivent pas être des clés longue durée. Créer une clé, l'utiliser, la révoquer immédiatement après usage.

---

*Dernière mise à jour : 12 octobre 2026*  
*Sources : notes de passation ChatGPT (9, 11, 12 oct 2026) + conversations Claude oct 2026*
