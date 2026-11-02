/* ============================================================================
   AR-TRACKING.JS — Suivi d'image RÉEL (MindAR) + ANTI-JITTER — Astro Code
   ----------------------------------------------------------------------------
   Ce module ajoute le VRAI scan par caméra au prototype (fini le mock) :
     1. Il charge MindAR (image tracking) depuis le CDN, SANS build step.
     2. Il suit le dessin du t-shirt via le fichier `targets.mind`
        à DEUX cibles (Poissons, Lion) et la fenêtre de décision Rencontre.
     3. Il maintient un groupe « overlay » sur la pose LISSÉE du dessin
        (anti-tremblement, voir RÉGLAGES) et expose les rectangles écran
        de chaque signe (reveal-2d.js et fusion.js s'en servent).
     4. Quand la cible est trouvée, il déclenche aussi la révélation
        (événement `astrocode:target-found` écouté par app.js).
     5. Le scan passe en PLEIN ÉCRAN dès le toucher du bouton (classe
        `ar-fullscreen` sur #ar-container, contrôles ✕ / 🔄 flottants).
     6. BOOST RÉSOLUTION (v1.5) : MindAR 1.2.5 demande le flux SANS contrainte
        de résolution (souvent 640×480) — on demande du HD via
        applyConstraints après le démarrage (sans risque, refusé proprement
        si l'appareil ne peut pas).

   PRÉ-REQUIS (voir README.md) :
     - `targets.mind` à la racine (compilé avec les visuels des t-shirts)
     - page servie en HTTPS (ou http://localhost) pour l'accès caméra
   ============================================================================ */
(function () {
  'use strict';

  /* ==========================================================================
     RÉGLAGES — tout l'anti-jitter se règle ici.
     --------------------------------------------------------------------------
     LE PROBLÈME : à chaque image, MindAR calcule une pose "brute" (position +
     orientation) de la cible. Cette pose brute tremble légèrement d'une image
     à l'autre (bruit du tracking) → si on l'applique telle quelle, l'overlay
     vidéo tremble sur le t-shirt. C'est le "mini shake" qu'Hamza veut éliminer.

     LA SOLUTION : on ne colle JAMAIS la pose brute à l'overlay. On maintient
     une pose "lissée" qui POURSUIT la pose brute avec un filtre passe-bas
     (interpolation). Résultat : l'animation reste collée au t-shirt, mais le
     tremblement haute-fréquence est absorbé. Zéro jitter visible.
     ========================================================================== */
  const CFG = {

    // v1.9.99 — LE FICHIER PUR (décision d'Hamza, 2 nov) : DEUX cibles
    // seulement, 0 = Poissons, 1 = Lion. La cible « duo » (la photo des
    // deux porteurs) est SUPPRIMÉE : elle contenait le dessin Poissons
    // en entier et pouvait se verrouiller pendant un scan solo de
    // Poissons tenu — la fusion sortait sur un scan simple (le bug
    // terrain signalé par Hamza, sa peur n° 1 devant le jury). La
    // fusion = les deux signes RÉELS suivis en même temps
    // (maxTrack: 2), rien d'autre.
    TARGET_SRC: './targets.mind',
    // LA FENÊTRE DE DÉCISION (règle Rencontre n° 2) : quand un premier
    // signe est trouvé, on attend ce délai avant de lancer sa
    // révélation solo. Si le second signe apparaît entre-temps,
    // c'est la FUSION qui part à la place.
    // v1.9.100 (2 nov, verdict terrain d'Hamza) : 500 ms au lieu de
    // 1000 — avec la reconnaissance (~0,3 s), le solo mettait 1 à 1,5 s
    // à réagir, trop lent devant un jury. La fusion, elle, part
    // IMMÉDIATEMENT dès que le second signe se verrouille (aucune
    // attente) — deux porteurs côte à côte se verrouillent à quelques
    // centaines de ms l'un de l'autre, 500 ms suffit ; et un second
    // signe tardif bascule toujours le solo en cours vers la fusion.
    DUO_WINDOW_MS: 500,

    /* ---- SMOOTH_POS : lissage de la POSITION (0.0 → 1.0) ----
       À chaque image : pose_lissée += (pose_brute − pose_lissée) × SMOOTH_POS
       - Proche de 1.0 (ex. 0.6)  → overlay très réactif, MAIS le tremblement
         du tracking passe à travers (mauvais).
       - Proche de 0.0 (ex. 0.1)  → overlay ultra-stable, MAIS il traîne
         derrière quand on bouge le téléphone vite (effet "élastique").
       - 0.35 = compromis validé pour un t-shirt filmé à bout de bras :
         stable à l'arrêt, suit sans retard gênant en mouvement normal. */
    SMOOTH_POS: 0.35,

    /* ---- SMOOTH_ROT : lissage de la ROTATION (0.0 → 1.0) ----
       Même principe, mais en interpolation sphérique (slerp) sur le
       quaternion d'orientation. Volontairement un peu PLUS BAS que la
       position : l'œil humain pardonne moins un tremblement d'angle
       (l'image "vibre") qu'un micro-tremblement de position. */
    SMOOTH_ROT: 0.30,

    /* ---- JUMP_SNAP_DIST : seuil de "saut" (en largeurs de cible) ----
       1.0 = la largeur du dessin scanné. Si la pose brute SAUTE de plus de
       35 % de cette largeur entre deux images, ce n'est PAS un mouvement
       réel : c'est un artefact (ré-acquisition après perte, faux positif).
       Dans ce cas on "snap" (on colle directement, sans lisser) — sinon
       l'overlay traverserait l'écran en glissant, ce qui est pire que tout. */
    JUMP_SNAP_DIST: 0.35,

    /* ---- HIDE_DELAY_MS : délai avant de cacher l'overlay à la perte ----
       Quand le tracking hésite une fraction de seconde (main qui passe
       devant, reflet), on ne veut PAS que la vidéo clignote. On attend
       150 ms avant de la masquer : si la cible revient entre-temps,
       rien ne s'est passé à l'écran. */
    HIDE_DELAY_MS: 150,
  };

  /* ------------------------------------------------------------------ */
  /* État interne                                                        */
  /* ------------------------------------------------------------------ */
  const S = {
    started: false,
    starting: false,
    mindar: null,      // instance MindARThree
    anchor: null,       // ancre MindAR (pose BRUTE)
    renderer: null,
    scene: null,
    camera: null,
    overlay: null,      // THREE.Group qui porte l'overlay (pose LISSÉE)
    targetVisible: false,
    hasPose: false,     // false tant qu'aucune pose brute reçue
    hideTimer: null,
    smoothPos: null,    // THREE.Vector3 — position lissée
    smoothQuat: null,   // THREE.Quaternion — orientation lissée
    facingUser: false,  // false = caméra arrière (défaut), true = avant
    flipping: false,    // changement de caméra en cours
  };

  let THREE = null;
  const _p = { v: null };  // vecteur temporaire
  const _q = { v: null };  // quaternion temporaire
  const _s = { v: null };  // échelle temporaire (v1.9.35)

  const MINDAR_URL =
    'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js';

  /* ==========================================================================
     PRÉCHARGEMENT — le scan doit être INSTANTANÉ (« pas d'attente »).
     --------------------------------------------------------------------------
     Dès le chargement de la page (en tâche de fond, ~1 s après), on charge
     en avance : three.js, le module MindAR, les fichiers .mind (vérification) et
     la vidéo des koïs. Quand l'utilisateur touche « Démarrer le scan réel »,
     il ne reste plus qu'à ouvrir la caméra — le reste est déjà en mémoire.
     Le bouton donne en plus un feedback visuel immédiat (< 100 ms).
     ========================================================================== */
  const WARM = {
    done: false,       // warmup déjà lancé
    three: null,       // module three.js
    mindarMod: null,   // module MindAR
    targetsOk: null,   // fichiers .mind vérifiés (true/false/null = inconnu)
  };

  async function warmup() {
    if (WARM.done) return;
    WARM.done = true;
    try { WARM.three = await import('three'); } catch (e) { /* réessayé au scan */ }
    try { WARM.mindarMod = await import(MINDAR_URL); } catch (e) { /* idem */ }
    try {
      const r = await fetch(CFG.TARGET_SRC, { method: 'HEAD' });
      WARM.targetsOk = r.ok;
    } catch (e) { WARM.targetsOk = false; }
  }

  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function setStatus(msg, isError) {
    const el = $('ar-status');
    if (el) {
      el.textContent = msg;
      el.style.color = isError ? '#ff6b6b' : '';
    }
    // Miroir pour le mode plein écran (statut overlay en bas de l'écran).
    const fs = $('ar-status-fs');
    if (fs) {
      fs.textContent = msg;
      fs.style.color = isError ? '#ff9d9d' : '';
    }
  }

  /* ==========================================================================
     DIAGNOSTIC CAMÉRA — vérifie que le flux envoie VRAIMENT des images.
     --------------------------------------------------------------------------
     Contexte : sur certains téléphones, `mindar.start()` se termine SANS
     erreur alors que la caméra n'affiche rien (écran noir). Cas typique :
     lien ouvert depuis le navigateur INTÉGRÉ de Pinterest / Instagram /
     TikTok, qui bloque ou fige le flux caméra. On ne se contente donc pas
     de "start() a résolu" : on exige des images qui AVANCENT
     (video.currentTime qui augmente + readyState >= 2 + dimensions > 0).
     ========================================================================== */
  function cameraSupported() {
    return !!(
      navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    );
  }

  function getCameraVideo() {
    return (S.mindar && S.mindar.video) || null;
  }

  // Force la lecture (certains navigateurs n'appliquent pas bien l'autoplay)
  // puis attend jusqu'à `timeoutMs` que des images arrivent réellement.
  // Retourne true si le flux est vivant, false sinon.
  async function verifyCameraFeed(timeoutMs) {
    timeoutMs = timeoutMs || 5000;
    const video = getCameraVideo();
    if (!video) return false;
    try {
      const p = video.play();
      if (p && p.catch) { await p.catch(() => {}); }
    } catch (e) { /* autoplay déjà géré par MindAR */ }
    const t0 = Date.now();
    const last = video.currentTime;
    while (Date.now() - t0 < timeoutMs) {
      if (video.videoWidth > 0 && video.readyState >= 2) {
        if (video.currentTime !== last) return true; // des images avancent
      }
      await wait(300);
    }
    return false;
  }

  // Attend l'apparition d'un élément vidéo caméra valide (après flip).
  async function waitForVideo(timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const v = getCameraVideo();
      if (v && v.videoWidth > 0) return true;
      await wait(300);
    }
    return false;
  }

  /* ==========================================================================
     BOOST RÉSOLUTION CAMÉRA (v1.5)
     --------------------------------------------------------------------------
     MindAR 1.2.5 demande le flux avec des contraintes FIXES, sans résolution :
     `{ audio: false, video: { facingMode: "environment" } }` (vérifié dans
     le code source du CDN — aucune option publique pour forcer du HD).
     Résultat : le navigateur donne souvent du 640×480 → image « médiocre ».
     SANS toucher à MindAR, on demande ensuite du HD via applyConstraints
     sur la piste vidéo : refusé proprement (catch) si l'appareil ne peut
     pas — zéro risque pour le tracking (qui tourne à sa propre résolution
     interne de toute façon).
     ========================================================================== */
  async function boostCameraResolution() {
    try {
      const video = getCameraVideo();
      const track = video && video.srcObject && video.srcObject.getVideoTracks
        ? video.srcObject.getVideoTracks()[0]
        : null;
      if (!track || typeof track.applyConstraints !== 'function') return;
      // On vise le max raisonnable de l'appareil (plafonné à 1080p).
      let idealW = 1280, idealH = 720;
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : null;
        if (caps && caps.width && caps.width.max) idealW = Math.min(caps.width.max, 1920);
        if (caps && caps.height && caps.height.max) idealH = Math.min(caps.height.max, 1080);
      } catch (e) { /* on garde 1280×720 */ }
      await track.applyConstraints({
        width: { ideal: idealW },
        height: { ideal: idealH },
      });
      let res = null;
      try {
        const s = track.getSettings ? track.getSettings() : {};
        if (s.width && s.height) res = s.width + '×' + s.height;
      } catch (e) {}
      console.log('[AR] résolution caméra : ' + (res || 'inconnue'));
      return res;
    } catch (e) {
      console.warn('[AR] boost résolution impossible :', (e && e.message) || e);
      return null;
    }
  }

  /* ==========================================================================
     OVERLAY VIDÉO (ou placeholder en attendant le fichier d'Hamza)
     ========================================================================== */

  // Placeholder dessiné sur canvas : carte visible "EN ATTENTE DE LA VIDÉO
  // ALPHA" — l'utilisateur comprend ce qui manque au lieu de voir du vide.
  function buildOverlay() {
    // Groupe "lissé" : il porte la pose LISSÉE (jamais l'ancre brute).
    // Le spectacle vit sur le canvas 2D de reveal-2d.js ; ce groupe ne
    // sert plus qu'au suivi de pose (rectangles écran des signes).
    S.overlay = new THREE.Group();
    S.overlay.visible = false;
    S.scene.add(S.overlay);
  }

  /* ==========================================================================
     CŒUR ANTI-JITTER — appelé à chaque image rendue
     --------------------------------------------------------------------------
     1. On lit la pose BRUTE de l'ancre MindAR (position + quaternion monde).
     2. Première pose reçue → on l'adopte telle quelle (pas de lissage à vide).
     3. Saut anormal (> JUMP_SNAP_DIST) → SNAP direct (artefact, pas de glide).
     4. Sinon → lerp (position) + slerp (rotation) vers la pose brute.
     5. On applique la pose LISSÉE au groupe overlay.
     ========================================================================== */
  function smoothTick() {
    if (!S.targetVisible || !S.anchor) return;

    // v1.9.35 — on décompose la matrice MONDE COMPLÈTE de l'ancre :
    // position, rotation ET ÉCHELLE. Jusqu'ici l'échelle était jetée —
    // or la matrice de MindAR porte un facteur d'échelle (sa postMatrix
    // compose une échelle = largeur de la cible dans l'espace du traqueur).
    // Sans elle, l'overlay restait à l'échelle 1 dans un espace où la
    // cible peut valoir des centaines d'unités : tout enfant 3D devenait
    // microscopique, invisible — pendant que le 2D, lui, retombait sur
    // ses fractions d'écran et masquait le problème.
    S.anchor.group.matrixWorld.decompose(_p.v, _q.v, _s.v);
    if (!(_s.v.x > 0.001) || !(_s.v.y > 0.001) || !(_s.v.z > 0.001)) _s.v.set(1, 1, 1);

    if (!S.hasPose) {
      // Première détection : on part de la vraie pose, sans transition.
      S.smoothPos.copy(_p.v);
      S.smoothQuat.copy(_q.v);
      S.smoothScale.copy(_s.v);
      S.hasPose = true;
    } else if (_p.v.distanceTo(S.smoothPos) > CFG.JUMP_SNAP_DIST * Math.max(1, S.smoothScale.x)) {
      // Saut anormal → snap immédiat (ré-acquisition / faux positif).
      // (Seuil converti en unités monde via l'échelle courante.)
      S.smoothPos.copy(_p.v);
      S.smoothQuat.copy(_q.v);
      S.smoothScale.copy(_s.v);
    } else {
      // Cas normal : poursuite lissée (filtre passe-bas).
      S.smoothPos.lerp(_p.v, CFG.SMOOTH_POS);
      S.smoothQuat.slerp(_q.v, CFG.SMOOTH_ROT);
      S.smoothScale.lerp(_s.v, CFG.SMOOTH_POS);
    }

    S.overlay.position.copy(S.smoothPos);
    S.overlay.quaternion.copy(S.smoothQuat);
    S.overlay.scale.copy(S.smoothScale);
  }

  /* v1.9.75 — poses LISSÉES par signe : pour la Rencontre, chaque signe
     garde sa propre pose écran, même quand l'autre est le signe « actif »
     (smoothTick ne suit que l'actif). Même recette que smoothTick :
     décomposition de la matrice monde + lerp/slerp. */
  function trackSignPoses() {
    if (!S.anchors || !S.signState) return;
    if (!S.poseBySign) S.poseBySign = {};
    const order = ['poissons', 'lion'];
    for (let i = 0; i < order.length; i++) {
      const signId = order[i];
      const anchor = S.anchors[i];
      const st = S.signState[signId];
      if (!anchor || !st) continue;
      if (st.visible) {
        st.lastSeenAt = performance.now();   // v1.9.77 — fraîcheur pour la fenêtre de fusion
        // v1.9.79 — présence CONFIRMÉE après 1,2 s de suivi continu.
        if (st.foundAt && performance.now() - st.foundAt >= 1200) st.confirmedAt = performance.now();
      }
      if (!st.visible) continue;   // pose figée sur la dernière connue (fenêtre de fusion)
      anchor.group.matrixWorld.decompose(_p.v, _q.v, _s.v);
      if (!(_s.v.x > 0.001) || !(_s.v.y > 0.001) || !(_s.v.z > 0.001)) _s.v.set(1, 1, 1);
      let P = S.poseBySign[signId];
      if (!P) {
        P = S.poseBySign[signId] = {
          pos: _p.v.clone(), quat: _q.v.clone(), scale: _s.v.clone(), has: true,
        };
      } else {
        P.pos.lerp(_p.v, CFG.SMOOTH_POS);
        P.quat.slerp(_q.v, CFG.SMOOTH_ROT);
        P.scale.lerp(_s.v, CFG.SMOOTH_POS);
      }
    }
    updateFusion();
  }

  /* v1.9.80 — SÉPARATION NETTE (décision d'Hamza, 31 oct, en plein
     tournage) : la fusion ne se déclenche PLUS jamais toute seule.
     Les scans solo redeviennent exactement ceux des anciennes
     versions ; la fusion = le bouton ✦ FUSION, et lui seul
     (forceFusion). On rouvrira l'automatique plus tard, au calme.
     updateFusion ne fait donc plus rien — il reste appelé à chaque
     image pour garder la porte ouverte. */
  function updateFusion() { /* volontairement inerte depuis la v1.9.80 */ }

  /* ==========================================================================
     DÉMARRAGE / ARRÊT
     ========================================================================== */
  /* ==========================================================================
     LA RENCONTRE — FENÊTRE DE DÉCISION (v1.9.97, spec d'Hamza, 1er nov)
     --------------------------------------------------------------------------
     Le bug d'origine (1er nov) : sur la PHOTO DUO, le dessin Poissons
     est entier — la cible Poissons se faisait reconnaître et sa
     révélation solo partait IMMÉDIATEMENT, la fusion n'avait jamais
     sa chance. D'où la fenêtre de décision ci-dessous.
     Le bug symétrique (corrigé en v1.9.99) : l'ancienne cible n° 2
     (cette même photo duo, compilée comme cible) pouvait se
     verrouiller pendant un scan SOLO de Poissons tenu → la fusion
     sortait sur un scan simple. Cible supprimée : il ne reste que
     les deux signes réels.

     Les règles :
     1. Poissons ET Lion suivis en même temps = FUSION (jamais de solo).
     2. Un premier signe trouvé ouvre une FENÊTRE de CFG.DUO_WINDOW_MS :
        sa révélation solo n'est lancée qu'à l'expiration. Si le second
        signe apparaît avant, la fusion part.
     3. PENDANT la fusion, les found/lost des solos sont ignorés pour
        les révélations ; la fusion ne s'arrête que lorsque les deux
        signes sont perdus depuis ~700 ms.
     4. Si un solo joue déjà et que le second signe apparaît, on bascule
        vers la fusion (reveal-2d et fusion.js réagissent à
        astrocode:fusion-start ; l'horoscope est gardé par isFusion()).
     ========================================================================== */
  function dispatchTargetFound(signId) {
    S.soloActive = signId;
    window.dispatchEvent(new CustomEvent('astrocode:target-found', {
      detail: { signId, firstTime: true },
    }));
  }

  function startFusion(detail) {
    if (S.fusionOn) return;
    if (S.pendingSolo) { clearTimeout(S.pendingSolo.timer); S.pendingSolo = null; }
    S.soloActive = null;   // la fusion remplace tout solo en cours (règle 5)
    S.fusionOn = true;
    window.dispatchEvent(new CustomEvent('astrocode:fusion-start', { detail }));
  }

  function endFusion() {
    if (!S.fusionOn) return;
    S.fusionOn = false;
    if (S.fusionEndTimer) { clearTimeout(S.fusionEndTimer); S.fusionEndTimer = null; }
    console.log('[Duo] fusion terminée — plus aucun signe suivi');
    window.dispatchEvent(new CustomEvent('astrocode:fusion-end'));
  }

  // Règle 3 — la fusion ne s'arrête que si PLUS AUCUN signe n'est
  // suivi (ni Poissons, ni Lion) depuis ~700 ms.
  function checkFusionEnd() {
    if (!S.fusionOn) return;
    const anyVisible =
      !!(S.signState && ((S.signState.poissons && S.signState.poissons.visible) ||
                         (S.signState.lion && S.signState.lion.visible)));
    if (anyVisible) {
      if (S.fusionEndTimer) { clearTimeout(S.fusionEndTimer); S.fusionEndTimer = null; }
      return;
    }
    if (S.fusionEndTimer) return;
    S.fusionEndTimer = setTimeout(() => {
      S.fusionEndTimer = null;
      const stillNone =
        !(S.signState && ((S.signState.poissons && S.signState.poissons.visible) ||
                          (S.signState.lion && S.signState.lion.visible)));
      if (stillNone) endFusion();
    }, 700);
  }

  function scheduleHideOverlay() {
    if (S.hideTimer) clearTimeout(S.hideTimer);
    S.hideTimer = setTimeout(() => {
      if (S.overlay) S.overlay.visible = false;
      S.hideTimer = null;
    }, CFG.HIDE_DELAY_MS);
  }

  function wireSign(anchor, signId) {
    anchor.onTargetFound = () => {
      if (!S.signState) S.signState = {};
      S.signState[signId] = { visible: true, at: performance.now(), lastSeenAt: performance.now(), foundAt: performance.now(), confirmedAt: 0 };
      if (S.hideTimer) { clearTimeout(S.hideTimer); S.hideTimer = null; }
      if (S.fusionEndTimer) { clearTimeout(S.fusionEndTimer); S.fusionEndTimer = null; }   // règle 4 : un signe revu repousse la fin
      S.anchor = anchor;
      S.activeSign = signId;
      S.targetVisible = true;
      if (S.overlay) S.overlay.visible = true;
      setStatus('Target found — tracking active.');
      if (S.fusionOn) return;    // règle 4 — pendant la fusion, solos ignorés
      if (S.pendingSolo && S.pendingSolo.signId !== signId) {
        // Règles 1+2 — le second signe arrive pendant la fenêtre : FUSION.
        console.log('[Duo] second signe trouvé → fusion');
        startFusion({ signs: [S.pendingSolo.signId, signId] });
        return;
      }
      if (S.pendingSolo) return;          // ré-accroche du signe en fenêtre
      if (S.soloActive === signId) return;   // ré-accroche du solo en cours
      if (S.soloActive) {
        // Règle 5 — un solo joue déjà, le second signe apparaît : FUSION.
        console.log('[Duo] second signe trouvé → fusion');
        startFusion({ signs: [S.soloActive, signId] });
        return;
      }
      // Premier signe : la fenêtre de décision s'ouvre.
      console.log('[Duo] premier signe =', signId);
      const timer = setTimeout(() => {
        if (!S.pendingSolo || S.pendingSolo.signId !== signId) return;
        S.pendingSolo = null;
        console.log('[Duo] fenêtre expirée → solo', signId);
        dispatchTargetFound(signId);
      }, CFG.DUO_WINDOW_MS);
      S.pendingSolo = { signId, timer };
    };
    anchor.onTargetLost = () => {
      if (S.signState && S.signState[signId]) {
        S.signState[signId].visible = false;
        // v1.9.79 — une perte remet la confirmation à zéro.
        S.signState[signId].foundAt = 0;
        S.signState[signId].confirmedAt = 0;
      }
      if (S.fusionOn) { checkFusionEnd(); return; }   // règle 4
      if (S.pendingSolo && S.pendingSolo.signId === signId) {
        clearTimeout(S.pendingSolo.timer);
        S.pendingSolo = null;
        console.log('[Duo] premier signe perdu avant la fin de la fenêtre — solo annulé');
      }
      const wasSolo = S.soloActive === signId;
      if (wasSolo) {
        S.soloActive = null;
        // Prévenir app.js (annule la confirmation de scan en cours)
        window.dispatchEvent(new CustomEvent('astrocode:target-lost'));
        setStatus('Target lost — point the camera at the design.');
      }
      if (S.activeSign === signId) {
        S.targetVisible = false;
        scheduleHideOverlay();
        // Rendre la main à l'autre signe s'il est toujours suivi.
        const otherId = signId === 'poissons' ? 'lion' : 'poissons';
        if (S.anchorsBySign && S.signState && S.signState[otherId] && S.signState[otherId].visible) {
          S.anchor = S.anchorsBySign[otherId];
          S.activeSign = otherId;
          S.targetVisible = true;
          if (S.overlay) S.overlay.visible = true;
        }
      }
    };
  }

  // Démantèlement SILENCIEUX d'une session MindAR (rotation de la chasse
  // ou arrêt complet) : pas d'événement scan-stopped, pas de sortie du
  // plein écran — c'est stop() qui s'en charge quand il l'appelle.
  async function teardownMindar() {
    S.sessionGen = (S.sessionGen || 0) + 1;   // invalide toute session en cours de démarrage
    if (S.hideTimer) { clearTimeout(S.hideTimer); S.hideTimer = null; }
    if (S.mindar) {
      try {
        S.mindar.renderer.setAnimationLoop(null);
        await S.mindar.stop();
      } catch (e) {}
      S.mindar = null;
    }
    const container = $('ar-container');
    // On retire UNIQUEMENT les éléments de MindAR (vidéo + canvas) : les
    // boutons de contrôle plein écran (✕ / 🔄) et le statut survivent.
    if (container) container.querySelectorAll('video, canvas').forEach((el) => el.remove());
    S.anchor = null;
    S.overlay = null;
    S.targetVisible = false;
    S.hasPose = false;
  }

  /* La session unique : le fichier à DEUX cibles (0 Poissons,
     1 Lion), ses deux ancres câblées par la machine Rencontre,
     l'overlay, la caméra et la boucle de rendu. */
  async function startSession() {
    const gen = S.sessionGen || 0;
    // MindARThree se résout ICI (module mis en cache par le navigateur).
    const { MindARThree } = WARM.mindarMod || await import(MINDAR_URL);
    const container = $('ar-container');
    S.mindar = new MindARThree({
      container,
      imageTargetSrc: CFG.TARGET_SRC,
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'no',
      maxTrack: 2,   // LA RENCONTRE : deux cibles suivies EN MÊME TEMPS
      missTolerance: 10,   // v1.9.77 — suivi « collant » : ~10 images manquées avant la perte
    });
    const { renderer, scene, camera } = S.mindar;
    S.renderer = renderer;
    S.scene = scene;
    S.camera = camera;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    // Les deux ancres du fichier. NOTE : on n'attache RIEN
    // directement aux ancres (leur pose brute tremble) : smoothTick
    // relit S.anchor à chaque image et applique la pose LISSÉE.
    const a0 = S.mindar.addAnchor(0);
    const a1 = S.mindar.addAnchor(1);
    S.anchors = [a0, a1];
    S.anchorsBySign = { poissons: a0, lion: a1 };
    wireSign(a0, 'poissons');
    wireSign(a1, 'lion');
    S.anchor = a0;
    buildOverlay();

    // Démarrer la caméra + le tracking
    await S.mindar.start();
    // La session a été démantelée pendant le démarrage (✕) : ne pas
    // installer de boucle sur une instance morte.
    if ((S.sessionGen || 0) !== gen) return;
    S.facingUser = !!S.mindar.shouldFaceUser;
    // v1.9.39 — LA BOUCLE DE RENDU D'ABORD, avant toute étape optionnelle.
    let lastT = performance.now();
    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const dt = Math.min((now - lastT) / 1000, 0.1); // clamp anti-saut
      lastT = now;
      smoothTick();
      trackSignPoses();   // v1.9.75 — poses par signe + fenêtre de fusion
      renderer.render(scene, camera);
    });
  }

  async function start() {
    if (S.started || S.starting) return;
    S.starting = true;
    // Le scan passe en PLEIN ÉCRAN dès le toucher du bouton (« pas d'attente »,
    // on apprécie vraiment ce qu'on voit). Si le démarrage échoue, on en sort.
    enterFullscreen();
    const btnStart = $('btn-ar-start');
    const btnStop = $('btn-ar-stop');
    const btnFlip = $('btn-ar-flip');
    if (btnStart) btnStart.disabled = true;

    // Étape 0 — le navigateur permet-il l'accès caméra ?
    // (les navigateurs intégrés de Pinterest / Instagram / TikTok le bloquent
    // ou le figent : il faut ouvrir la page dans Chrome)
    if (!cameraSupported()) {
      setStatus(
        'This browser cannot access the camera. ' +
        'If you opened this link from Pinterest, Instagram or TikTok: ' +
        'their built-in browser blocks the camera — open the page in Chrome, then start the scan again.',
        true
      );
      S.starting = false;
      if (btnStart) { btnStart.disabled = false; btnStart.classList.remove('activating'); }
      return;
    }

    try {
      // Étape 1 — le fichier de cibles combiné existe-t-il ?
      // (compilé avec les visuels — voir CFG.TARGET_SRC ; le
      // préchargement l'a déjà vérifié quand il a réussi)
      setStatus('Checking targets.mind…');
      let ok = WARM.targetsOk === true;
      if (WARM.targetsOk !== true) {
        try {
          const r = await fetch(CFG.TARGET_SRC, { method: 'HEAD' });
          ok = r.ok;
        } catch (e) { ok = false; }
        WARM.targetsOk = ok;
      }
      if (!ok) {
        setStatus(
          '"targets.mind" not found next to the app. ' +
          'Check the deployment, then reload the page.',
          true
        );
        S.starting = false;
        if (btnStart) { btnStart.disabled = false; btnStart.classList.remove('activating'); }
        return;
      }

      // Étape 2 — three (importmap) + MindAR : réutilise le préchargement si
      // dispo, sinon charge maintenant (cas où le warmup a échoué).
      setStatus('Loading the AR engine…');
      THREE = WARM.three || await import('three');
      const mindarMod = WARM.mindarMod || await import(MINDAR_URL);
      const { MindARThree } = mindarMod;

      _p.v = new THREE.Vector3();
      _q.v = new THREE.Quaternion();
      _s.v = new THREE.Vector3();
      S.smoothPos = new THREE.Vector3();
      S.smoothQuat = new THREE.Quaternion();
      S.smoothScale = new THREE.Vector3(1, 1, 1);

      // Étapes 3 à 5 — la session : création de MindAR sur le fichier
      // combiné, ses ancres, l'overlay, le démarrage de la caméra et
      // la boucle de rendu (startSession).
      await startSession();

      // Étape 5b — VÉRIFICATION RÉELLE : la caméra envoie-t-elle des images ?
      // (start() peut résoudre sans erreur avec un flux figé — typique des
      // navigateurs intégrés. On exige des images qui avancent.)
      setStatus('Checking the camera feed…');
      const feedOk = await verifyCameraFeed(5000);
      if (!feedOk) {
        await stop(); // nettoie, puis on écrase son statut générique
        setStatus(
          'The camera started but is sending no image (black screen). ' +
          'If you opened this link from Pinterest, Instagram or TikTok: ' +
          'their built-in browser blocks the camera — open the page in Chrome. ' +
          'Otherwise, check that the camera is allowed for this site in your browser settings.',
          true
        );
        return;
      }
      // Étape 5c — BOOST RÉSOLUTION (v1.5) : MindAR ne demande aucune
      // résolution → on demande du HD via applyConstraints.
      // v1.9.39 : borné à 2,5 s — un applyConstraints qui traîne ne doit
      // plus jamais retarder ni bloquer le démarrage.
      const camRes = await Promise.race([
        boostCameraResolution(),
        new Promise((r) => setTimeout(() => r(null), 2500)),
      ]).catch(() => null);
      setStatus(camRes ? 'Camera active (' + camRes + ').' : 'Camera active.');

      // (La boucle de rendu est installée plus haut, juste après
      // mindar.start() — voir v1.9.39.)

      S.started = true;
      S.starting = false;
      if (btnStart) btnStart.style.display = 'none';
      if (btnStop) btnStop.style.display = 'inline-block';
      if (btnFlip) btnFlip.style.display = 'inline-block';
      setStatus('Scan active — point the camera at the t-shirt design.');
    } catch (e) {
      console.error('[AR] échec du démarrage :', e);
      const name = e && e.name;
      let msg;
      if (!e || !cameraSupported()) {
        // MindAR rejette sans objet d'erreur quand getUserMedia est absent
        msg = 'This browser cannot access the camera. ' +
          'Open this page in Chrome (not from Pinterest, Instagram or TikTok), then try again.';
      } else if (name === 'NotAllowedError' || name === 'SecurityError') {
        msg = 'Camera access denied. Allow the camera for this site in your browser settings, then start the scan again.';
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        msg = 'No camera found on this device.';
      } else if (name === 'NotReadableError' || name === 'AbortError') {
        msg = 'The camera is already used by another app. Close it, then try again.';
      } else {
        msg = 'Could not start the scan (' +
          (e && e.message ? e.message : 'camera error') +
          '). Check the camera permission and HTTPS, then try again.';
      }
      setStatus(msg, true);
      S.starting = false;
      exitFullscreen(); // le scan a échoué : on quitte le plein écran
      if (btnStart) { btnStart.disabled = false; btnStart.classList.remove('activating'); }
    }
  }

  /* ==========================================================================
     CHANGEMENT DE CAMÉRA (avant ↔ arrière)
     --------------------------------------------------------------------------
     MindAR 1.2.5 intègre `switchCamera()` : il bascule `shouldFaceUser`,
     coupe le flux actuel (stop() arrête les pistes et retire l'élément
     vidéo), puis relance start() avec l'autre caméra. Les ancres et le
     lissage anti-jitter sont conservés — seul l'élément vidéo est recréé.
     Défaut au démarrage : caméra ARRIÈRE (shouldFaceUser = false).
     ========================================================================== */
  async function flipCamera() {
    if (!S.mindar || !S.started || S.flipping) return;
    S.flipping = true;
    const btn = $('btn-ar-flip');
    if (btn) btn.disabled = true;
    setStatus('Switching camera…');
    try {
      S.mindar.switchCamera(); // natif MindAR : stop() + start()
      const ok = await waitForVideo(8000);
      if (!ok) throw new Error('nouveau flux introuvable');
      const feedOk = await verifyCameraFeed(5000);
      if (!feedOk) throw new Error('flux sans images');
      await boostCameraResolution(); // v1.5 : re-demande du HD après le flip
      S.facingUser = !!S.mindar.shouldFaceUser;
      setStatus(
        S.facingUser
          ? 'Front camera active — detection continues.'
          : 'Rear camera active — point at the t-shirt design.'
      );
    } catch (e) {
      console.error('[AR] échec du changement de caméra :', e);
      setStatus('Camera switch failed. Try again.', true);
    }
    S.flipping = false;
    if (btn) btn.disabled = false;
  }

  /* ==========================================================================
     SCAN PLEIN ÉCRAN
     --------------------------------------------------------------------------
     Au démarrage du scan, #ar-container passe en plein écran (classe CSS
     `ar-fullscreen` : position fixed, inset 0, z-index 50, sans fond opaque).
     La vidéo MindAR et le canvas WebGL étant DANS le conteneur, ils suivent
     automatiquement. Leçon de l'écran noir n°2 : le conteneur reste SANS
     fond opaque (la vidéo MindAR est en z-index négatif — un fond opaque
     la masquerait).
     `ar-active` affiche les contrôles flottants : ✕ (quitter) et 🔄 (flip).
     Le statut reste lisible via #ar-status-fs (miroir de #ar-status).
     ========================================================================== */
  function enterFullscreen() {
    const container = $('ar-container');
    if (!container) return;
    // Appliqué AVANT la création de MindAR pour qu'il mesure le conteneur
    // déjà en plein écran (dimensionnement vidéo/canvas optimal).
    container.classList.add('ar-fullscreen', 'ar-active');
    // Un ancêtre portant backdrop-filter devient BLOC CONTENEUR pour ses
    // descendants en position:fixed : le « plein écran » se retrouvait
    // décalé de la hauteur de l'en-tête. On aplatit le bloc de verre
    // parent le temps du scan.
    const host = container.parentElement;
    if (host) host.classList.add('ar-host-flat');
    document.body.classList.add('scanning');
  }

  function exitFullscreen() {
    const container = $('ar-container');
    if (!container) return;
    container.classList.remove('ar-fullscreen', 'ar-active');
    const host = container.parentElement;
    if (host) host.classList.remove('ar-host-flat');
    document.body.classList.remove('scanning');
  }

  async function stop() {
    // v1.9.97 — la machine Rencontre se remet à zéro avec le scan.
    if (S.pendingSolo) { clearTimeout(S.pendingSolo.timer); S.pendingSolo = null; }
    if (S.fusionEndTimer) { clearTimeout(S.fusionEndTimer); S.fusionEndTimer = null; }
    S.soloActive = null;
    await teardownMindar();
    exitFullscreen();
    S.started = false;
    S.starting = false;
    const btnStart = $('btn-ar-start');
    const btnStop = $('btn-ar-stop');
    const btnFlip = $('btn-ar-flip');
    if (btnStart) { btnStart.style.display = 'inline-block'; btnStart.disabled = false; btnStart.classList.remove('activating'); }
    if (btnStop) btnStop.style.display = 'none';
    if (btnFlip) { btnFlip.style.display = 'none'; btnFlip.disabled = false; }
    S.facingUser = false;
    S.flipping = false;
    setStatus('Scan stopped.');
    // v1.9.78 — fin de scan = fin de fusion, état remis à zéro.
    if (S.fusionOn) {
      S.fusionOn = false;
      window.dispatchEvent(new CustomEvent('astrocode:fusion-end'));
    }
    S.fusionManual = false;
    S.signState = null;
    S.poseBySign = null;
    S.bothSince = 0;
    // v1.5 : prévient app.js (masque la carte horoscope).
    window.dispatchEvent(new CustomEvent('astrocode:scan-stopped'));
  }

  /* ------------------------------------------------------------------ */
  /* Câblage UI                                                          */
  /* ------------------------------------------------------------------ */
  function init() {
    const btnStart = $('btn-ar-start');
    const btnStop = $('btn-ar-stop');
    const btnFlip = $('btn-ar-flip');
    if (btnStart) btnStart.addEventListener('click', () => {
      // Feedback IMMÉDIAT (< 100 ms) : le bouton réagit au toucher avant
      // même que la caméra ne démarre — « pas d'attente ».
      btnStart.classList.add('activating');
      start();
    });
    if (btnStop) btnStop.addEventListener('click', stop);
    if (btnFlip) btnFlip.addEventListener('click', flipCamera);
    // Contrôles flottants du mode plein écran (dans #ar-container)
    const btnClose = $('btn-ar-close');
    const btnFlipFs = $('btn-ar-flip-fs');
    if (btnClose) btnClose.addEventListener('click', stop);
    if (btnFlipFs) btnFlipFs.addEventListener('click', flipCamera);
    // Sécurité : couper proprement si on quitte l'onglet
    window.addEventListener('pagehide', () => { if (S.started) stop(); });

    // PRÉCHARGEMENT : moteur AR + cibles + vidéo prêts AVANT le premier scan.
    // Lancé en tâche de fond ~1 s après le chargement (n'interfère pas
    // avec l'affichage initial de la page).
    const kickWarmup = () => setTimeout(warmup, 1000);
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => setTimeout(warmup, 400), { timeout: 4000 });
    } else {
      kickWarmup();
    }
  }

  // API publique (utilisée par app.js pour la révélation au scan réel)
  window.AR_TRACKING = {
    start,
    stop,
    flipCamera,
    config: CFG,
    isTargetVisible: () => S.targetVisible,
    // Position de la cible projetée à l'écran, en 0..1 (0,0 = coin haut
    // gauche). Sert à la révélation 2D (reveal-2d.js) pour centrer l'orbite
    // sur le torse du porteur. Retourne null si la pose n'est pas connue :
    // l'appelant se rabat alors sur le centre de l'écran.
    getTargetScreenPos: () => {
      if (!S.hasPose || !S.camera || !S.smoothPos || !THREE) return null;
      try {
        const v = S.smoothPos.clone().project(S.camera);
        if (!isFinite(v.x) || !isFinite(v.y)) return null;
        return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
      } catch (e) { return null; }
    },
    // v1.9.5 — ANCRAGE : le centre projeté de la cible ET les extrémités
    // de son axe X (les bords gauche/droit du dessin suivi), en
    // coordonnées écran normalisées. La distance entre les extrémités =
    // la LARGEUR APPARENTE du dessin : elle grandit quand le téléphone
    // s'approche et rétrécit quand il s'éloigne. C'est elle qui permet
    // aux couches 2D de rester COLLÉES au t-shirt (échelle ancrée),
    // au lieu d'une taille fixe en pixels d'écran.
    // v1.9.10 — la largeur se calcule depuis la pose LISSÉE elle-même
    // (position + quaternion), comme getTargetScreenPos qui fonctionne :
    // on ne dépend plus de la matrice monde d'un groupe, qui pouvait
    // être périmée et renvoyer une largeur quasi nulle.
    getTargetScreenRect: () => {
      if (!S.hasPose || !S.camera || !S.smoothPos || !S.smoothQuat || !THREE) return null;
      try {
        const right = new THREE.Vector3(0.5, 0, 0).applyQuaternion(S.smoothQuat);
        const proj = (v) => {
          const p = v.project(S.camera);
          return { x: (p.x + 1) / 2, y: (1 - p.y) / 2, ok: isFinite(p.x) && isFinite(p.y) };
        };
        const c = proj(S.smoothPos.clone());
        const r = proj(S.smoothPos.clone().add(right));
        const l = proj(S.smoothPos.clone().sub(right));
        if (!c.ok || !r.ok || !l.ok) return null;
        return { x: c.x, y: c.y, xr: r.x, yr: r.y, xl: l.x, yl: l.y };
      } catch (e) { return null; }
    },
    // v1.9.75 — le rectangle écran d'UN signe précis (la Rencontre suit
    // les deux signes à la fois). Même projection que getTargetScreenRect,
    // mais sur la pose lissée DU signe demandé. null si le signe n'est
    // pas visible ou si sa pose n'est pas encore connue.
    getSignScreenRect: (signId) => {
      const P = S.poseBySign && S.poseBySign[signId];
      if (!P || !P.has || !S.camera || !THREE) return null;
      // v1.9.77 — visible OU vu il y a moins de 2,2 s (fenêtre de fusion :
      // entre deux accroches du traqueur, la dernière pose reste servie).
      const st = S.signState && S.signState[signId];
      if (!st || (!st.visible && (!st.lastSeenAt || performance.now() - st.lastSeenAt > 2200))) return null;
      try {
        const right = new THREE.Vector3(0.5, 0, 0).applyQuaternion(P.quat);
        const proj = (v) => {
          const p = v.project(S.camera);
          return { x: (p.x + 1) / 2, y: (1 - p.y) / 2, ok: isFinite(p.x) && isFinite(p.y) };
        };
        const c = proj(P.pos.clone());
        const r = proj(P.pos.clone().add(right));
        const l = proj(P.pos.clone().sub(right));
        if (!c.ok || !r.ok || !l.ok) return null;
        return { x: c.x, y: c.y, xr: r.x, yr: r.y, xl: l.x, yl: l.y };
      } catch (e) { return null; }
    },
    getVisibleSigns: () => {
      if (!S.signState) return [];
      return Object.keys(S.signState).filter((k) => S.signState[k].visible);
    },
    isFusion: () => !!S.fusionOn,
    // v1.9.78 — armement MANUEL de la fusion (bouton ✦ FUSION de
    // l'écran de scan) : la garantie du tournage, aucune détection
    // requise. Un toucher arme, un autre désarme ; la fin du scan
    // désarme aussi. Retourne le nouvel état.
    forceFusion: () => {
      if (S.fusionOn) {
        S.fusionOn = false;
        S.fusionManual = false;
        window.dispatchEvent(new CustomEvent('astrocode:fusion-end'));
        return false;
      }
      S.fusionOn = true;
      S.fusionManual = true;
      window.dispatchEvent(new CustomEvent('astrocode:fusion-start', {
        detail: { signs: ['poissons', 'lion'], manual: true },
      }));
      return true;
    },
    // Diagnostic (v1.8) : où en est vraiment la couche WebGL ? Lisible
    // depuis la console avec AR_TRACKING.diag().
    diag: () => ({
      three_charge: !!THREE,
      scan_demarre: !!S.started,
      cible_vue: !!S.targetVisible,
      pose_connue: !!S.hasPose,
      overlay_existe: !!S.overlay,
      overlay_visible: !!(S.overlay && S.overlay.visible),
      revelation_2d_active: !!(window.REVEAL_2D && window.REVEAL_2D.isRunning()),
    }),
    isCameraFront: () => S.facingUser,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
