/* ============================================================================
   REVEAL-2D.JS — Révélation koï en canvas 2D — Astro Code v1.8
   ----------------------------------------------------------------------------
   POURQUOI CE FICHIER EXISTE
   Jusqu'ici, toutes les révélations vivaient dans la scène Three.js : vidéo
   alpha, Lottie, banc de koïs 3D. Toutes les trois ont échoué en silence,
   alors que la DÉTECTION, elle, fonctionnait (la carte horoscope s'affichait).
   La panne est donc dans la couche WebGL, pas dans le scan.

   Ce module ne touche pas à WebGL. Il dessine dans un <canvas> 2D posé
   PAR-DESSUS la vue caméra, en DOM pur. Aucune dépendance : ni three, ni
   MindAR, ni texture, ni fichier à charger. Il ne peut donc pas échouer
   pour les mêmes raisons.

   Il écoute simplement les deux événements que le scan émet déjà :
       astrocode:target-found   → les koïs sortent du centre et orbitent
       astrocode:target-lost    → fondu de sortie

   PROFONDEUR EN 2D : les koïs de la moitié arrière de l'orbite sont dessinés
   AVANT le halo central, ceux de la moitié avant APRÈS — et leur taille suit
   leur distance. L'œil lit une vraie orbite sans une ligne de 3D.
   ============================================================================ */
(function () {
  'use strict';

  var CFG = {
    COUNT: 6,           // koïs dans le banc
    RX: 0.34,           // demi-axe horizontal de l'orbite (en largeurs d'écran)
    RY: 0.12,           // demi-axe vertical (l'ellipse = l'orbite vue de biais)
    PERIOD: 7.0,        // secondes pour un tour complet
    EMERGE_S: 1.1,      // durée de l'émergence depuis le centre
    FADE_S: 0.45,       // fondu de sortie quand la cible se perd
    ROULETTE_DUR: 1.35, // v1.9.8 — la roulette des signes avant les vidéos (s) ; v1.9.9 : plus rapide
    SHOW_PHRASE: false, // v1.9.9 — la phrase d'horoscope est DESCENDUE pour le moment (demande d'Hamza)
    KOI_W: 0.26,        // longueur d'une koï (en largeurs d'écran, au plus près)
    TRAIL: 14,          // points de traînée par koï
    WORD_IN: 0.28,      // délai entre deux mots qui apparaissent (secondes)
    WORD_RISE: 0.45,    // durée de la montée d'un mot
    CARTOON: true,      // v1.9.51 — TEST cartoon temps réel (recette Wonder, kill-test : pass shader sur le flux caméra)
    HARVEST_AT: 7.0     // v1.9.51 — la récolte du badge ; v1.9.55 : 15 s → 7 s (demande d'Hamza : « maximum sept huit secondes »)
  };

  var S = {
    canvas: null, ctx: null, host: null,
    raf: 0, last: 0, t: 0,
    visible: false,     // cible actuellement détectée
    fade: 0,            // 0 → invisible, 1 → pleinement visible
    emerge: 0,          // 0 → au centre, 1 → en orbite
    sprites: null,      // les deux koïs pré-dessinées (orange, blanche)
    trails: [],         // historique de positions par koï
    words: [],          // la phrase, découpée mot à mot
    wordsT: 0,          // temps écoulé depuis le début de la phrase
    recording: false,   // en enregistrement → on compose aussi la caméra
    videoEl: null,      // l'élément <video> de la caméra (trouvé à la volée)
    vEl: null,          // v1.8.5 — la vidéo alpha du signe (si elle existe)
    vSign: null,        // signe dont la vidéo est chargée
    vReady: false,      // la vidéo a assez de données pour être dessinée
    bEl: null,          // v1.8.7 — la vidéo d'ARRIÈRE-plan du signe (éléments derrière)
    bReady: false,      // le fond a assez de données pour être dessiné
    seg: null,          // v1.8.6 — instance MediaPipe SelfieSegmentation
    segBusy: false,     // une inférence de segmentation est en vol
    segOk: false,       // la segmentation répond → l'occlusion est active
    segTried: false,    // initialisation tentée (une seule fois)
    maskC: null,        // canvas du dernier masque de personne reçu
    samMaskC: null,     // v1.9.26 — canvas du masque SAM 3.1 (repère caméra)
    gummy: false,       // v1.9.28 — la vraie 3D (koi3d) a pris le relais du spectacle
    fusionMode: false,  // v1.9.75 — la Rencontre : les créatures vivent sur le canvas de fusion.js
    fusionTargetMode: false, // v1.9.82 — fusion sur l'image duo : pas de fond Lion par-dessus la photo
    fusionBackEl: null, // v1.9.76 — la vidéo de fond du Lion, plein cadre pendant la fusion
    fusionBackReady: false,
    fusionBackTried: false,
    bdCanvas: null,     // v1.9.29 — canvas du FOND vidéo, glissé SOUS le WebGL
    bdCtx: null,
    samTmpC: null,      // v1.9.26 — canvas temporaire de décodage SAM
    samSrcC: null,      // v1.9.26 — canvas de capture pour l'envoi à SAM
    samOk: false,       // v1.9.26 — un masque SAM valide est disponible
    samBusy: false,     // v1.9.26 — un appel SAM est en vol
    samLastTry: 0,      // v1.9.26 — dernier essai SAM (cadence)
    shirtBusy: false,   // v1.9.47 — un appel SAM « vêtement » est en vol
    shirtLastTry: 0,    // v1.9.47 — cadence d'échantillonnage du vêtement
    shirtSrcC: null,    // v1.9.47 — miniature caméra envoyée à SAM (384 px)
    shirtFlatC: null,   // v1.9.47 — l'aplat du vêtement (repère caméra)
    shirtAt: 0,         // v1.9.47 — arrivée du premier aplat (fondu d'entrée)
    shirtC: null,       // v1.9.47 — composition plein cadre de l'aplat
    shirtPrevMask: null, // v1.9.47 — masque précédent (garde IoU)
    shirtBase: null,    // v1.9.47 — couleur de base lissée entre échantillons
    shirtThr: 0,        // v1.9.47 — seuil d'ombre lissé entre échantillons
    shirtTries: 0,      // v1.9.48 — appels SAM « hoodie » envoyés (diag)
    shirtOks: 0,        // v1.9.48 — aplats construits avec succès (diag)
    hvT0: 0,            // v1.9.51 — début de la récolte (0 = inactive)
    hvDone: false,      // v1.9.51 — récolte déjà jouée pour cette session de scan
    hvLandSent: false,  // v1.9.51 — l'événement d'atterrissage du badge est parti
    badgeImg: null,     // v1.9.51 — artwork du signe récolté (assets/signs/*.webp)
    badgeSign: '',      // v1.9.51 — signe en cours de récolte
    garmentC: null,     // v1.9.52 — canvas du cartoon limité au vêtement
    meltC: null,        // v1.9.52 — mini-canvas caméra floutée (fonte du logo)
    meltMaskC: null,    // v1.9.52 — canvas de la fonte du logo (plein cadre)
    personC: null,      // canvas de la personne détourée
    silC: null,         // v1.9.6 — silhouette mi-résolution pour le contour
    outlineKey: '',     // signe dont les couleurs de contour sont en cache
    outlineCols: null,  // { c1, c2 } couleurs du contour
    bdImgs: [],         // v1.9.0 — éléments du fond ancré (images chargées)
    bdSign: null,       // signe dont le fond ancré est chargé
    bdReady: false,     // assez d'éléments chargés pour dessiner le fond
    bdLayout: null,     // disposition calculée pour la taille du canvas
    bdLayoutKey: '',    // "WxH" de la disposition en cache
    smCx: null,         // v1.9.5 — ancrage : centre lissé de la cible (px)
    smCy: null,
    smTw: null,         // largeur apparente lissée du dessin suivi (px)
    backH: null,        // hauteur ancrée de la vidéo de fond (px)
    fishW: null,        // largeur ancrée de la vidéo des poissons (px)
    anchorReset: false, // resynchroniser le lissage à la prochaine pose
    phaseT: 0,          // v1.9.8 — secondes depuis la détection (chorégraphie)
    stingPlayed: false, // v1.9.9 — le jingle a-t-il déjà salué CE spectacle ?
    lastLostAt: 0,      // v1.9.9 — dernière perte de cible (anti-recommencement)
    rouletteImgs: null, // v1.9.8 — les 12 médaillons semi-flat (assets/signs/)
    rouletteSeq: null   // v1.9.8 — la séquence tirée, finit sur le signe scanné
  };

  /* ---------------------------------------------------------------- */
  /* Les koïs, dessinées une fois dans un canvas hors écran            */
  /* ---------------------------------------------------------------- */
  function drawKoiSprite(body, patch) {
    var W = 420, H = 150, cy = H / 2;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');

    // Queue : deux lobes souples à l'arrière (la tête est à GAUCHE).
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(W * 0.78, cy);
    g.quadraticCurveTo(W * 0.93, cy - H * 0.44, W * 0.995, cy - H * 0.31);
    g.quadraticCurveTo(W * 0.91, cy, W * 0.995, cy + H * 0.31);
    g.quadraticCurveTo(W * 0.93, cy + H * 0.44, W * 0.78, cy);
    g.closePath(); g.fill();

    // Nageoires dorsale et ventrale.
    g.beginPath();
    g.moveTo(W * 0.40, cy - H * 0.20);
    g.quadraticCurveTo(W * 0.51, cy - H * 0.48, W * 0.65, cy - H * 0.17);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(W * 0.38, cy + H * 0.19);
    g.quadraticCurveTo(W * 0.47, cy + H * 0.46, W * 0.59, cy + H * 0.16);
    g.closePath(); g.fill();

    // Corps en fuseau.
    function bodyPath() {
      g.beginPath();
      g.moveTo(W * 0.04, cy);
      g.quadraticCurveTo(W * 0.15, cy - H * 0.31, W * 0.43, cy - H * 0.27);
      g.quadraticCurveTo(W * 0.67, cy - H * 0.22, W * 0.79, cy);
      g.quadraticCurveTo(W * 0.67, cy + H * 0.22, W * 0.43, cy + H * 0.27);
      g.quadraticCurveTo(W * 0.15, cy + H * 0.31, W * 0.04, cy);
      g.closePath();
    }
    bodyPath(); g.fill();

    // Volume : dos sombre, ventre clair.
    var grd = g.createLinearGradient(0, cy - H * 0.31, 0, cy + H * 0.31);
    grd.addColorStop(0, 'rgba(0,0,0,.28)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0)');
    grd.addColorStop(1, 'rgba(255,255,255,.32)');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';

    // Taches, contenues dans le corps.
    g.save(); bodyPath(); g.clip();
    g.fillStyle = patch;
    [[0.19, -0.06, 0.072], [0.39, 0.07, 0.054], [0.58, -0.04, 0.040]]
      .forEach(function (p) {
        g.beginPath();
        g.ellipse(W * p[0], cy + H * p[1], W * p[2], W * p[2] * 0.80, 0, 0, Math.PI * 2);
        g.fill();
      });
    g.restore();

    // Œil.
    g.fillStyle = 'rgba(12,10,16,.92)';
    g.beginPath(); g.ellipse(W * 0.10, cy - H * 0.05, W * 0.017, W * 0.017, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.beginPath(); g.ellipse(W * 0.095, cy - H * 0.08, W * 0.006, W * 0.006, 0, 0, Math.PI * 2); g.fill();

    return c;
  }

  function buildSprites() {
    if (S.sprites) return;
    S.sprites = [drawKoiSprite('#ff7a2d', '#fff3e2'), drawKoiSprite('#f4f7ff', '#ff6a3d')];
  }

  /* ---------------------------------------------------------------- */
  /* Le canvas, posé par-dessus la vue caméra                           */
  /* ---------------------------------------------------------------- */
  function ensureCanvas() {
    if (S.canvas && S.canvas.isConnected) return true;
    // On se pose sur le conteneur AR s'il existe, sinon en plein écran fixe.
    var host = document.getElementById('ar-container') || document.body;
    var c = document.createElement('canvas');
    c.id = 'reveal2d-canvas';
    c.style.cssText =
      'position:absolute; inset:0; width:100%; height:100%;' +
      'pointer-events:none; z-index:30;';
    if (host === document.body) c.style.position = 'fixed';
    // Le conteneur doit pouvoir porter un enfant absolu.
    var pos = window.getComputedStyle(host).position;
    if (pos === 'static') host.style.position = 'relative';
    host.appendChild(c);
    S.canvas = c; S.host = host;
    S.ctx = c.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    return true;
  }

  function resize() {
    if (!S.canvas) return;
    var r = S.canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    S.canvas.width = Math.max(1, Math.round(r.width * dpr));
    S.canvas.height = Math.max(1, Math.round(r.height * dpr));
    S.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S.w = r.width; S.h = r.height;
  }

  /* ---------------------------------------------------------------- */
  /* Boucle de rendu                                                    */
  /* ---------------------------------------------------------------- */
  function loop(now) {
    S.raf = requestAnimationFrame(loop);
    var dt = Math.min((now - (S.last || now)) / 1000, 0.08);
    S.last = now; S.t += dt;
    if (S.visible) S.wordsT += dt;
    // v1.9.10 — l'horloge du spectacle avance aussi pendant les
    // micro-pertes (grâce de 2,5 s) : le scintillement du suivi ne
    // peut plus geler la chorégraphie avant l'arrivée des vidéos.
    if (S.visible || (S.phaseT > 0 && performance.now() - (S.lastLostAt || 0) < 2500)) S.phaseT += dt;
    // v1.9.9 — le jingle démarre quand le SPECTACLE commence (la fin de
    // la roulette), pas à la détection : la roulette crée l'attente,
    // la musique célèbre la révélation.
    if (!S.fusionMode && S.visible && !S.stingPlayed && S.phaseT >= CFG.ROULETTE_DUR) {
      S.stingPlayed = true;
      playSting();
    }

    // Fondu global et émergence depuis le centre.
    var targetFade = S.visible ? 1 : 0;
    S.fade += Math.sign(targetFade - S.fade) *
      Math.min(Math.abs(targetFade - S.fade), dt / (S.visible ? 0.3 : CFG.FADE_S));
    var targetEm = S.visible ? 1 : 0;
    S.emerge += Math.sign(targetEm - S.emerge) *
      Math.min(Math.abs(targetEm - S.emerge), dt / (S.visible ? CFG.EMERGE_S : CFG.FADE_S));

    // On ne rend la main QUE si la cible est perdue ET le fondu terminé.
    // (Sans la condition sur S.visible, la toute première image — où dt vaut
    // 0, donc fade vaut encore 0 — arrêtait la boucle aussitôt lancée.)
    if (!S.visible && S.fade <= 0.001) {
      if (S.ctx) S.ctx.clearRect(0, 0, S.w, S.h);
      if (S.bdCtx) S.bdCtx.clearRect(0, 0, S.w, S.h);
      if (S.vEl) { try { S.vEl.pause(); } catch (e) {} }
      if (S.bEl) { try { S.bEl.pause(); } catch (e) {} }
      cancelAnimationFrame(S.raf); S.raf = 0;
      return;
    }
    // v1.8.6 — nourrir la segmentation tant que la vidéo du signe joue.
    if (S.visible && S.vEl) feedSegmentation();
    // v1.9.41 — SAM RETIRÉ de la révélation 2D (demande d'Hamza) : son
    // échantillonnage toutes les ~2,4 s (capture + encodage JPEG + décodage
    // du masque sur le thread principal) volait la fluidité du détourage
    // MediaPipe. Retour à la recette exacte de la version « super » :
    // MediaPipe seul, recalculé à chaque image, rien d'autre en parallèle.
    // if (S.visible && S.vEl) maybeSamSample();
    // v1.9.51 — TEST CARTOON : le pass shader sur la caméra se rend
    // AVANT le composite (une fois par image, consommé deux fois :
    // fond + personne détourée). L'échelle de résolution dynamique
    // surveille le temps d'image (p95) et redescend si ça chauffe.
    if (CFG.CARTOON && S.visible) {
      cartoonTick(dt);
      cartoonRender();
    }
    draw();
  }

  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
  function smooth01(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }

  // v1.9.29 — le canvas du FOND vidéo (mode gummy) : pour que les poissons
  // 3D nagent PAR-DESSUS le décor océan, la vidéo de fond ne peut pas être
  // peinte dans le canvas principal (il est au-dessus du WebGL). On la
  // dessine dans un canvas glissé DANS le conteneur AR, juste avant le
  // canvas WebGL de MindAR : vidéo caméra (z −2) → fond → WebGL → ce
  // canvas-ci (roulette, mots) → interface.
  function backdropCtx() {
    if (S.bdCtx) {
      if (S.bdCanvas.width !== S.w || S.bdCanvas.height !== S.h) {
        S.bdCanvas.width = S.w; S.bdCanvas.height = S.h;
      }
      return S.bdCtx;
    }
    var cont = document.getElementById('ar-container');
    if (!cont) return null;
    var gl = cont.querySelector('canvas');
    if (!gl) return null;   // WebGL pas encore là — on réessaiera à l'image suivante
    var c = document.createElement('canvas');
    c.id = 'backdrop-canvas';
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    c.width = S.w; c.height = S.h;
    cont.insertBefore(c, gl);
    S.bdCanvas = c;
    S.bdCtx = c.getContext('2d');
    return S.bdCtx;
  }

  function draw() {
    var ctx = S.ctx; if (!ctx) return;
    var W = S.w, H = S.h;
    ctx.clearRect(0, 0, W, H);

    // En enregistrement seulement : on peint d'abord l'image de la caméra,
    // pour que la vidéo capturée contienne la scène ENTIÈRE (caméra + koïs
    // + mots). Hors enregistrement, le canvas reste transparent et laisse
    // voir la caméra qui est déjà affichée derrière — rien n'est peint deux
    // fois, et on ne paie pas le coût du dessin vidéo à chaque image.
    // v1.8.6 — exception : quand l'occlusion par la personne est active,
    // le canvas doit composer toute la scène (caméra, poissons, personne)
    // pour pouvoir glisser la personne détourée entre les deux.
    // v1.8.7 — idem dès qu'une couche vidéo joue (le fond doit passer
    // ENTRE la caméra et la personne) : le canvas compose tout.
    var frontOk = !!(S.vEl && S.vReady && S.vEl.readyState >= 2);
    var backOk = !!(S.bEl && S.bReady && S.bEl.readyState >= 2);
    var backdropOk = !!S.bdReady;
    var videoMode = !S.gummy && (frontOk || backOk || backdropOk);
    var occlude = videoMode && (S.segOk || S.samOk); // v1.9.26 — SAM peut porter l'occlusion seul
    if (S.recording || videoMode) drawCameraFrame(ctx, W, H);

    var e = easeOutCubic(Math.min(1, S.emerge));

    // v1.9.8 — CHORÉGRAPHIE (demande d'Hamza) : 1) la ROULETTE des signes
    // au centre, qui ralentit et s'arrête sur le signe scanné ; 2) la
    // vidéo de l'AVANT démarre ; 3) une seconde plus tard, la vidéo de
    // l'ARRIÈRE la rejoint. phaseT = secondes depuis la détection.
    var RD = CFG.ROULETTE_DUR;
    var eFront = easeOutCubic(Math.max(0, Math.min(1, (S.phaseT - RD) / 0.9)));
    var eBack = easeOutCubic(Math.max(0, Math.min(1, (S.phaseT - RD - 0.8) / 0.9)));

    // v1.9.51 — LA RÉCOLTE (scénario d'Hamza) : après HARVEST_AT
    // secondes de spectacle continu, les vidéos se condensent en un
    // BADGE du signe, qui vole jusqu'au panneau de collection (le DOM
    // d'app.js affiche le panneau et le texte). Machine à états par le
    // temps écoulé : A (0→0,9 s) rétrécissement des couches, B (0,9→
    // 1,45 s) le badge pop au centre, C (1,45→2,35 s) le vol vers le
    // panneau, D (2,35→3,4 s) reprise douce du spectacle. Une fois par
    // session de scan (réarmée à la prochaine détection fraîche).
    var hvT = S.hvT0 ? (performance.now() - S.hvT0) / 1000 : -1;
    if (!S.fusionMode && !S.hvDone && hvT < 0 && S.visible && S.phaseT >= CFG.HARVEST_AT && (frontOk || backOk)) {
      S.hvT0 = performance.now(); hvT = 0;
      S.badgeSign = S.vSign || 'poissons';
      S.badgeImg = new Image();
      S.badgeImg.src = 'assets/signs/' + S.badgeSign + '.webp';
      try { window.dispatchEvent(new CustomEvent('astrocode:harvest-start', { detail: { signId: S.badgeSign } })); } catch (e) {}
    }
    var hvFishMul = 1, hvBackMul = 1, hvFrontMul = 1;
    if (hvT >= 0) {
      if (hvT < 2.35) {
        var kA = smooth01(hvT / 0.9);
        hvFishMul = 1 - 0.88 * kA;
        hvFrontMul = 1 - kA;
        hvBackMul = 1 - easeOutCubic(Math.min(1, hvT / 0.7));
      } else {
        var kD = easeOutCubic(Math.min(1, (hvT - 2.35) / 0.9));
        hvFishMul = 0.12 + 0.88 * kD;
        hvFrontMul = kD;
        hvBackMul = kD;
        if (hvT >= 3.4) { S.hvDone = true; S.hvT0 = 0; hvFishMul = 1; hvBackMul = 1; hvFrontMul = 1; }
      }
    }

    // v1.9.5 — ANCRAGE (demande d'Hamza) : les couches ne sont plus
    // dimensionnées en fraction d'écran, mais à partir de la LARGEUR
    // APPARENTE du dessin suivi. Avancer le téléphone grossit le
    // dessin → les couches grossissent avec lui, en restant collées
    // au torse ; reculer les rétrécit. Un lissage (lerp) absorbe le
    // tremblement du suivi : plus de nage, plus d'effet « ça flotte ».
    var cx = W / 2, cy = H / 2;
    var API = window.AR_TRACKING;
    var twPx = null;
    if (API && API.getTargetScreenRect) {
      var rc = API.getTargetScreenRect();
      if (rc) {
        cx = rc.x * W; cy = rc.y * H;
        twPx = Math.hypot((rc.xr - rc.xl) * W, (rc.yr - rc.yl) * H);
      }
    }
    if (!(twPx > 0) && API && API.getTargetScreenPos) {
      var p = API.getTargetScreenPos();
      if (p && isFinite(p.x) && isFinite(p.y)) { cx = p.x * W; cy = p.y * H; }
    }
    // v1.9.10 — VALIDATION de la mesure : une largeur absurde (pose pas
    // encore stable) ne dimensionne pas les vidéos et n'empoisonne pas
    // le lissage. Hors plage → dernière mesure saine ; aucune → repli
    // sur les fractions d'écran des fonctions de dessin.
    var twOk = twPx > 0 && twPx >= W * 0.05 && twPx <= W * 1.8;
    if (twOk) {
      if (S.smTw == null || S.anchorReset) {
        S.smCx = cx; S.smCy = cy; S.smTw = twPx; S.anchorReset = false;
      } else {
        var L = 0.35;
        S.smCx += (cx - S.smCx) * L;
        S.smCy += (cy - S.smCy) * L;
        S.smTw += (twPx - S.smTw) * L;
      }
    }
    if (S.smTw) {
      cx = S.smCx; cy = S.smCy;
      // Le fond : hauteur proportionnelle à la taille du dessin.
      S.backH = Math.min(H * 1.3, S.smTw * 3.1 * (0.90 + 0.10 * eBack));
      // Les poissons commencent SUR le dessin (petits) puis grandissent
      // juste un peu : ×1,25 → ×1,75 de la largeur du dessin.
      S.fishW = Math.min(W * 1.6, S.smTw * (1.0 + 0.35 * eFront));   // v1.9.48 — poissons réduits ~-23 % (verdict terrain d'Hamza : trop gros)
      if (hvFishMul !== 1) S.fishW *= hvFishMul;   // v1.9.51 — récolte : les poissons se condensent
    } else {
      S.backH = null; S.fishW = null;
    }
    var rx = CFG.RX * W * e;
    var ry = CFG.RY * W * e;
    var g = S.fade;

    // v1.9.8 — pendant la roulette, elle occupe le centre, seule.
    // v1.9.80 — sauf en fusion : la rencontre ne montre QUE la fusion.
    if (!S.fusionMode && S.visible && S.phaseT < RD && S.rouletteSeq) { drawRoulette(ctx, W, H, cx, cy, g); return; }

    // v1.9.28/29 — mode GUMMY : la vraie 3D nage dans la couche WebGL,
    // SOUS ce canvas. Composition voulue par Hamza pour le test : QUE la
    // 3D qui orbite sur le porteur + la vidéo de fond SEULE (pas de
    // poissons vidéo, pas de détourage 2D — l'occlusion « passe derrière »
    // est assurée en 3D par le masque SAM, occluteur de koi3d). La vidéo
    // de fond est donc peinte dans le canvas du dessous (backdropCtx),
    // jamais ici — sinon elle recouvrirait la 3D.
    if (S.gummy) {
      // v1.9.35 — TEST GRIS : aucune vidéo du tout, même le fond.
      var bctx = backdropCtx();
      if (bctx) bctx.clearRect(0, 0, W, H);
      drawWords(ctx, W, H, g);
      return;
    }

    // v1.8.5 — si le signe a une vidéo alpha et qu'elle est prête, c'est
    // elle le spectacle : halo et koïs dessinées se taisent. La phrase,
    // elle, continue de s'écrire par-dessus (et tout reste dans le canvas,
    // donc dans l'enregistrement).
    // v1.8.7 — le fond d'abord (plein cadre, derrière tout le monde),
    // puis l'orbite par-dessus.
    // v1.8.9 — ordre voulu par Hamza : le nuage d'éléments d'abord,
    // puis la personne détourée repasse devant LUI — les éléments
    // restent derrière sa silhouette, ils l'entourent sans la couvrir.
    // v1.9.0 — le fond ancré d'abord (éléments fixes qui remplissent
    // tout l'arrière-plan) ; l'ancienne vidéo de fond reste en repli
    // pour les signes qui n'ont pas encore leurs éléments.
    // v1.9.2 — le fond d'abord : pour Poissons, c'est la vidéo « ruban »
    // (voir SIGN_VIDEOS). Le fond ancré par sprites n'est dessiné que
    // pour un signe SANS vidéo de fond, ou si la sienne a échoué
    // (S.bEl retombe alors à null et les sprites prennent le relais).
    var backDrawn = false;
    if (!S.fusionMode && backOk && eBack > 0) backDrawn = drawBackVideo(ctx, W, H, cx, cy, g * eBack * hvBackMul, eBack);
    if (!S.fusionMode && !backDrawn && !S.bEl && eBack > 0) drawBackdrop(ctx, W, H, g * eBack, S.t);
    // v1.9.76 — FUSION : le fond du LION en plein cadre (il remplit
    // l'écran, paysage compris) derrière les deux porteurs.
    if (S.fusionMode && !S.fusionTargetMode) { ensureFusionBack(); drawFusionBack(ctx, W, H, g * eBack); }
    if (occlude && eFront > 0 && drawPersonCutout(ctx, W, H)) drawGarmentToon(ctx, W, H, cx, cy);   // v1.9.52 — cartoon du vêtement par-dessus la personne brute
    // v1.8.9 — les poissons, eux, ne sont PAS masqués pour le moment :
    // dessinés après la personne, ils nagent librement par-dessus.
    if (!S.fusionMode && drawRevealVideo(ctx, W, H, cx, cy, g * eFront * hvFrontMul, eFront)) {
      drawHarvestBadge(ctx, W, H, cx, cy);
      drawWords(ctx, W, H, g);
      return;
    }

    // v1.9.3 — ordre d'Hamza : un signe qui a sa vidéo de poissons ne
    // montre JAMAIS les koïs dessinées par le code, même pendant le
    // chargement de la vidéo. On n'utilise que les vidéos.
    if (!S.fusionMode && S.vEl) {
      drawHarvestBadge(ctx, W, H, cx, cy);
      drawWords(ctx, W, H, g);
      return;
    }

    // v1.9.75 — mode Fusion (la Rencontre) : les deux créatures et leur
    // fusion sont dessinées par fusion.js sur son propre canvas ; ici
    // on ne garde que la caméra, le fond Lion et la personne détourée.
    // v1.9.80 — pas même la phrase : en fusion, QUE la fusion.
    if (S.fusionMode) {
      return;
    }

    // Halo central : la source d'où les koïs émergent.
    var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.30);
    halo.addColorStop(0, 'rgba(255,170,90,' + (0.42 * g) + ')');
    halo.addColorStop(0.45, 'rgba(255,110,60,' + (0.14 * g) + ')');
    halo.addColorStop(1, 'rgba(255,110,60,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    // Les koïs, triées par profondeur : les plus lointaines d'abord.
    var fish = [];
    for (var i = 0; i < CFG.COUNT; i++) {
      var a = (S.t / CFG.PERIOD) * Math.PI * 2 + (i / CFG.COUNT) * Math.PI * 2;
      var sway = Math.sin(S.t * 1.3 + i) * 0.04;   // la nage n'est jamais droite
      var x = cx + Math.cos(a) * rx;
      var y = cy + Math.sin(a) * ry + Math.sin(S.t * 1.7 + i * 1.9) * H * 0.02;
      // depth : -1 au plus loin (derrière), +1 au plus près (devant)
      var depth = Math.sin(a);
      fish.push({ i: i, a: a, x: x, y: y, depth: depth, sway: sway });
    }
    fish.sort(function (p, q) { return p.depth - q.depth; });

    for (var k = 0; k < fish.length; k++) {
      var f = fish[k];
      // Échelle et opacité suivent la profondeur : l'indice le plus fort.
      var sc = (0.62 + 0.38 * (f.depth * 0.5 + 0.5)) * e;
      var alpha = g * (0.55 + 0.45 * (f.depth * 0.5 + 0.5));
      var sprite = S.sprites[f.i % 2];
      var w = CFG.KOI_W * S.w * sc;
      var h = w * (sprite.height / sprite.width);
      // L'orientation suit la tangente de l'orbite (la tête part devant).
      var tx = -Math.sin(f.a) * rx, ty = Math.cos(f.a) * ry;
      var ang = Math.atan2(ty, tx) + Math.PI + f.sway;

      drawTrail(ctx, f, alpha, w);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(f.x, f.y);
      ctx.rotate(ang);
      // La koï nage vers la gauche sur son sprite : on la retourne quand
      // elle revient vers la droite, pour qu'elle ne nage jamais sur le dos.
      if (Math.cos(ang) < 0) ctx.scale(1, -1);
      ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    drawWords(ctx, W, H, g);
  }

  /* ---------------------------------------------------------------- */
  /* La caméra, peinte en « cover » (recadrée, jamais déformée)        */
  /* ---------------------------------------------------------------- */
  function cameraEl() {
    var v = S.videoEl;
    if (!v || !v.isConnected) {
      v = document.querySelector('#ar-container video:not(#reveal-sign-video):not(#reveal-back-video):not(#fusion-back-video)') || document.querySelector('video:not(#reveal-sign-video):not(#reveal-back-video):not(#fusion-back-video)');
      S.videoEl = v;
    }
    return (v && v.readyState >= 2 && v.videoWidth) ? v : null;
  }

  function coverRectWH(iw, ih, W, H) {
    var vr = iw / ih, cr = W / H, sw, sh, sx, sy;
    if (vr > cr) { sh = ih; sw = sh * cr; sx = (iw - sw) / 2; sy = 0; }
    else         { sw = iw;  sh = sw / cr; sx = 0; sy = (ih - sh) / 2; }
    return { sx: sx, sy: sy, sw: sw, sh: sh };
  }

  function coverRect(v, W, H) {
    return coverRectWH(v.videoWidth, v.videoHeight, W, H);
  }

  /* ---------------------------------------------------------------- */
  /* v1.9.51 — TEST CARTOON TEMPS RÉEL (dernier test, recette Muse   */
  /* Wonder, consultation du 29 oct) : un pass WebGL dédié rend le    */
  /* flux caméra UNE fois par image à travers un shader toon —        */
  /* quantification de la luminance en 4 bandes qui PRÉSERVE la       */
  /* teinte (pas de posterize par canal : la peau survit), saturation  */
  /* ×1,38, contours Sobel sur luminance pré-floutée + gradient        */
  /* chroma, zone morte large (0,10 → 0,28) contre le scintillement.  */
  /* Le canvas stylisé alimente ENSUITE le composite aux deux         */
  /* endroits où la caméra brute servait : le fond (drawCameraFrame)  */
  /* et la personne détourée (drawPersonCutout). MediaPipe continue   */
  /* de manger la vidéo BRUTE. Les vidéos AR, déjà flat, ne sont      */
  /* jamais touchées. Critères d'abandon écrits par Wonder : fps      */
  /* soutenus < 50, contours qui nagent sur le print, print illisible, */
  /* copie WebGL→2D qui bloque le pipeline. En cas d'erreur WebGL :   */
  /* repli silencieux et définitif sur la caméra brute — le spectacle */
  /* ne casse jamais pour un shader.                                  */
  /* ---------------------------------------------------------------- */
  var CT = {
    ok: false, failed: false, hasFrame: false,
    canvas: null, gl: null, tex: null, uTexel: null,
    tier: 0,           // 0 = long côté 1280, 1 = long côté 960
    times: [], lastSwitch: 0, fps: 0
  };

  function cartoonInit() {
    try {
      CT.canvas = document.createElement('canvas');
      var attrs = { antialias: false, depth: false, alpha: false, powerPreference: 'high-performance' };
      var gl = CT.canvas.getContext('webgl2', attrs) || CT.canvas.getContext('webgl', attrs);
      if (!gl) { CT.failed = true; return; }
      CT.gl = gl;
      var vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, 'attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }');
      gl.compileShader(vs);
      var fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, [
        'precision mediump float;',
        'varying vec2 vUv;',
        'uniform sampler2D uTex;',
        'uniform vec2 uTexel;',
        'uniform float uBands, uSat, uEdgeLo, uEdgeHi, uBlurR;',
        'float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }',
        'void main(){',
        '  vec2 t = uTexel * uBlurR;',
        '  vec3 c   = texture2D(uTex, vUv).rgb;',
        '  vec3 cn  = texture2D(uTex, vUv + vec2(0.0, t.y)).rgb;',
        '  vec3 cs  = texture2D(uTex, vUv - vec2(0.0, t.y)).rgb;',
        '  vec3 ce  = texture2D(uTex, vUv + vec2(t.x, 0.0)).rgb;',
        '  vec3 cw  = texture2D(uTex, vUv - vec2(t.x, 0.0)).rgb;',
        '  vec3 cne = texture2D(uTex, vUv + t).rgb;',
        '  vec3 cnw = texture2D(uTex, vUv + vec2(-t.x, t.y)).rgb;',
        '  vec3 cse = texture2D(uTex, vUv + vec2(t.x, -t.y)).rgb;',
        '  vec3 csw = texture2D(uTex, vUv - t).rgb;',
        '  vec3 base = (c + cn + cs + ce + cw) * 0.2;',
        '  float l = luma(base);',
        '  float gx = (luma(cne) + 2.0 * luma(ce) + luma(cse)) - (luma(cnw) + 2.0 * luma(cw) + luma(csw));',
        '  float gy = (luma(cnw) + 2.0 * luma(cn) + luma(cne)) - (luma(csw) + 2.0 * luma(cs) + luma(cse));',
        '  float mag = sqrt(gx * gx + gy * gy);',
        '  float cmag = abs((ce.r - ce.b) - (cw.r - cw.b)) + abs((cn.r - cn.b) - (cs.r - cs.b));',
        '  mag = max(mag, cmag * 1.4);',
        '  float q = floor(l * uBands) / uBands;',
        '  float f = fract(l * uBands);',
        '  float soft = smoothstep(0.85, 1.0, f) / uBands;',
        '  float ql = q + soft + 0.5 / uBands;',
        '  vec3 col = clamp(base * (ql / max(l, 0.004)), 0.0, 1.0);',
        '  float lq = luma(col);',
        '  col = mix(vec3(lq), col, uSat);',
        '  float edge = smoothstep(uEdgeLo, uEdgeHi, mag);',
        '  col = mix(col, vec3(0.04), edge * 0.92);',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n'));
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) { CT.failed = true; return; }
      var prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { CT.failed = true; return; }
      gl.useProgram(prog);
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      CT.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, CT.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
      gl.uniform1f(gl.getUniformLocation(prog, 'uBands'), 4.0);
      gl.uniform1f(gl.getUniformLocation(prog, 'uSat'), 1.38);
      gl.uniform1f(gl.getUniformLocation(prog, 'uEdgeLo'), 0.17);   // v1.9.52 — trait noir AMINCI (demande d'Hamza) : seuils relevés…
      gl.uniform1f(gl.getUniformLocation(prog, 'uEdgeHi'), 0.42);   // …et rampe plus étroite = seules les vraies arêtes portent un trait fin
      gl.uniform1f(gl.getUniformLocation(prog, 'uBlurR'), 1.1);
      CT.uTexel = gl.getUniformLocation(prog, 'uTexel');
      CT.ok = true;
    } catch (e) { CT.failed = true; CT.ok = false; }
  }

  function cartoonTick(dt) {
    // Échelle de résolution dynamique (recette Wonder) : p95 des temps
    // d'image sur une fenêtre glissante ; bascule au plus tôt toutes
    // les 2 s pour éviter l'oscillation.
    if (dt > 0 && dt < 0.25) {
      CT.times.push(dt * 1000);
      if (CT.times.length > 90) CT.times.shift();
    }
    if (CT.times.length >= 60) {
      var sorted = CT.times.slice().sort(function (a, b) { return a - b; });
      var p95 = sorted[Math.floor(0.95 * (sorted.length - 1))];
      var avg = CT.times.reduce(function (a, b) { return a + b; }, 0) / CT.times.length;
      CT.fps = Math.round(1000 / Math.max(avg, 0.01));
      var now = performance.now();
      if (now - CT.lastSwitch > 2000) {
        if (p95 > 19 && CT.tier === 0) { CT.tier = 1; CT.lastSwitch = now; CT.times.length = 0; }
        else if (p95 < 13.5 && CT.tier === 1) { CT.tier = 0; CT.lastSwitch = now; CT.times.length = 0; }
      }
    }
  }

  function cartoonRender() {
    if (!CT.ok && !CT.failed) cartoonInit();
    if (!CT.ok) return;
    var v = cameraEl(); if (!v) return;
    var vw = v.videoWidth, vh = v.videoHeight;
    var longEdge = CT.tier === 0 ? 1280 : 960;
    var sc = Math.min(1, longEdge / Math.max(vw, vh));
    var cw = Math.max(2, Math.round(vw * sc / 2) * 2);
    var ch = Math.max(2, Math.round(vh * sc / 2) * 2);
    var gl = CT.gl;
    try {
      if (CT.canvas.width !== cw || CT.canvas.height !== ch) {
        CT.canvas.width = cw; CT.canvas.height = ch;
        gl.viewport(0, 0, cw, ch);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, CT.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
      gl.uniform2f(CT.uTexel, 1 / cw, 1 / ch);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      CT.hasFrame = true;
    } catch (e) { CT.ok = false; CT.failed = true; }
  }

  function cartoonSource() {
    return (CFG.CARTOON && CT.ok && CT.hasFrame) ? CT.canvas : null;
  }

  function drawCameraFrame(ctx, W, H) {
    // v1.9.52 — le fond redevient la caméra BRUTE : le cartoon ne
    // s'applique plus qu'au vêtement (drawGarmentToon), le reste du
    // monde — visage, cheveux, mains, décor — reste photographique.
    var v = cameraEl(); if (!v) return;
    var r = coverRect(v, W, H);
    try { ctx.drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H); } catch (e) {}
  }

  /* ---------------------------------------------------------------- */
  /* v1.8.6 — DÉTOURAGE DE LA PERSONNE EN DIRECT (occlusion)           */
  /* Les poissons doivent passer DERRIÈRE le porteur, pas par-dessus    */
  /* son visage. Le téléphone segmente la personne en temps réel       */
  /* (MediaPipe, embarqué) ; on redessine la personne détourée          */
  /* PAR-DESSUS la vidéo du signe : les poissons disparaissent          */
  /* derrière le corps et ressortent de l'autre côté. Si la             */
  /* segmentation ne répond pas (vieux téléphone, CDN coupé), repli    */
  /* silencieux : la vidéo reste un calque, comme en v1.8.5.            */
  /* ---------------------------------------------------------------- */
  function initSegmentation() {
    if (S.segTried) return; S.segTried = true;
    if (typeof window.SelfieSegmentation !== 'function') { S.segOk = false; return; }
    try {
      var seg = new window.SelfieSegmentation({
        locateFile: function (f) { return 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/' + f; }
      });
      seg.setOptions({ modelSelection: 1 });   // 1 = corps entier, paysage
      seg.onResults(function (res) {
        S.segBusy = false;
        if (!res || !res.segmentationMask) return;
        if (!S.maskC) S.maskC = document.createElement('canvas');
        var mw = res.segmentationMask.width, mh = res.segmentationMask.height;
        if (!mw || !mh) return;
        if (S.maskC.width !== mw || S.maskC.height !== mh) { S.maskC.width = mw; S.maskC.height = mh; }
        var mc = S.maskC.getContext('2d');
        mc.clearRect(0, 0, mw, mh);
        try { mc.drawImage(res.segmentationMask, 0, 0, mw, mh); } catch (e) { return; }
        S.segOk = true;
        S.maskVersion = (S.maskVersion || 0) + 1;   // v1.9.27 — l'occluteur 3D suit
      });
      S.seg = seg;
    } catch (e) { S.segOk = false; }
  }

  function feedSegmentation() {
    if (!S.seg || S.segBusy) return;
    var v = cameraEl(); if (!v) return;
    S.segBusy = true;
    try {
      var r = S.seg.send({ image: v });
      if (r && r.catch) r.catch(function () { S.segBusy = false; });
    } catch (e) { S.segBusy = false; }
  }

  /* ---------------------------------------------------------------- */
  /* v1.9.26 — SAM 3.1 (Meta) : le détourage de référence.              */
  /* Toutes les ~2,4 s pendant le spectacle, une frame de la caméra   */
  /* (512 px) part via le proxy vers /v1/responses (modèle sam-3.1,    */
  /* prompt « person », masque one_bit). Le masque décodé par le        */
  /* parser officiel (window.SAM31, sam-mask.js) remplace le masque     */
  /* MediaPipe dans drawPersonCutout. RÈGLE D'OR (demande d'Hamza) :    */
  /* l'animation n'attend JAMAIS SAM — en cas d'échec ou de lenteur,    */
  /* on garde le dernier masque (gel) et MediaPipe continue seul.       */
  /* ---------------------------------------------------------------- */
  function maybeSamSample() {
    if (!window.SAM31 || !window.META_AI || S.samBusy) return;
    var now = performance.now();
    if (now - (S.samLastTry || 0) < 2400) return;
    var v = cameraEl(); if (!v || !v.videoWidth) return;
    S.samLastTry = now;
    if (!S.samSrcC) S.samSrcC = document.createElement('canvas');
    var sc = S.samSrcC;
    var scale = 512 / v.videoWidth;
    sc.width = 512;
    sc.height = Math.max(2, Math.round(v.videoHeight * scale));
    var g = sc.getContext('2d');
    try { g.drawImage(v, 0, 0, sc.width, sc.height); } catch (e) { return; }
    var dataUrl;
    try { dataUrl = sc.toDataURL('image/jpeg', 0.82); } catch (e) { return; }
    S.samBusy = true;
    window.META_AI.callApi('/v1/responses', {
      model: 'sam-3.1',
      input: [{
        type: 'message', role: 'user',
        content: [
          { type: 'input_text', text: 'person' },
          { type: 'input_image', image_url: dataUrl },
        ],
      }],
      metadata: { mask_encoding: 'one_bit' },
    }, 7000).then(function (json) {
      return window.SAM31.segmentPerson(json);
    }).then(function (seg) {
      S.samBusy = false;
      if (!seg || !seg.data) return;      // échec doux : masque précédent conservé
      if (!S.samMaskC) S.samMaskC = document.createElement('canvas');
      var mc = S.samMaskC;
      if (mc.width !== sc.width || mc.height !== sc.height) { mc.width = sc.width; mc.height = sc.height; }
      if (!S.samTmpC) S.samTmpC = document.createElement('canvas');
      var tc = S.samTmpC;
      tc.width = seg.w; tc.height = seg.h;
      var tg = tc.getContext('2d');
      var img = tg.createImageData(seg.w, seg.h);
      for (var i = 0; i < seg.data.length; i++) {
        var o = i * 4;
        img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255;
        img.data[o + 3] = seg.data[i] ? 255 : 0;
      }
      tg.putImageData(img, 0, 0);
      var mg = mc.getContext('2d');
      mg.clearRect(0, 0, mc.width, mc.height);
      // Si la grille couvre toute la frame, elle va à l'origine ; sinon
      // elle se place au coin de la boîte de l'objet (vérifié le 27/10).
      var ox = (seg.w === mc.width && seg.h === mc.height) ? 0 : seg.left;
      var oy = (seg.w === mc.width && seg.h === mc.height) ? 0 : seg.top;
      mg.drawImage(tc, ox, oy);
      S.samOk = true;
      S.maskVersion = (S.maskVersion || 0) + 1;   // v1.9.27 — l'occluteur 3D suit
    }).catch(function () {
      S.samBusy = false;                  // gel : on continue avec l'existant
    });
  }

  // ---------- v1.9.8 — LA ROULETTE des signes ----------
  // Demande d'Hamza : au scan, les médaillons défilent au centre de
  // l'écran comme une roulette de loterie, ralentissent, et s'arrêtent
  // sur LE signe scanné. Alors seulement les vidéos commencent.
  function buildRoulette(signId) {
    var ids = [];
    try { (window.SIGNS || []).forEach(function (s) { ids.push(s.id); }); } catch (e) {}
    if (!ids.length) ids = ['belier', 'taureau', 'gemeaux', 'cancer', 'lion', 'vierge', 'balance', 'scorpion', 'sagittaire', 'capricorne', 'verseau', 'poissons'];
    if (!S.rouletteImgs) {
      S.rouletteImgs = {};
      ids.forEach(function (id) {
        var im = new Image();
        im.src = 'assets/signs/' + id + '.webp';
        S.rouletteImgs[id] = im;
      });
    }
    var N = 16, seq = [], start = Math.floor(Math.random() * ids.length);
    for (var i = 0; i < N; i++) seq.push(ids[(start + i * 5 + Math.floor(Math.random() * 3)) % ids.length]);
    seq.push(signId);   // la roulette s'arrête TOUJOURS sur le signe scanné
    S.rouletteSeq = seq;
  }

  function drawRoulette(ctx, W, H, cx, cy, g) {
    var seq = S.rouletteSeq; if (!seq || !seq.length) return;
    var p = Math.max(0, Math.min(1, S.phaseT / CFG.ROULETTE_DUR));
    // Décélération : les signes défilent vite, puis de plus en plus lentement.
    var idx = Math.min(seq.length - 1, Math.floor((1 - Math.pow(1 - p, 2)) * seq.length));
    var im = S.rouletteImgs && S.rouletteImgs[seq[idx]];
    var settle = p > 0.92 ? 1 + (p - 0.92) * 1.1 : 1;   // petit « pop » final
    var side = Math.min(W, H) * 0.46 * settle;
    var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, side * 0.85);
    halo.addColorStop(0, 'rgba(255,215,140,' + (0.30 * g) + ')');
    halo.addColorStop(1, 'rgba(255,215,140,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(cx - side, cy - side, side * 2, side * 2);
    if (im && im.complete && im.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, g * 1.2);
      ctx.beginPath(); ctx.arc(cx, cy, side / 2, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(im, cx - side / 2, cy - side / 2, side, side);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = g;
      ctx.strokeStyle = 'rgba(255,225,160,0.85)';
      ctx.lineWidth = Math.max(2, W * 0.004);
      ctx.beginPath(); ctx.arc(cx, cy, side / 2, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- v1.9.6 — CONTOUR COLORÉ autour de la personne ----------
  // Demande d'Hamza : un contour aux couleurs du SIGNE scanné (via son
  // élément : eau = cyan/bleu, feu = orange/rouge, terre = doré,
  // air = bleu clair). Le bord du masque temps réel est colorié puis
  // dessiné en anneau SOUS la personne : il la suit partout. Un halo
  // extérieur doux (couleur profonde) + un liseré net (couleur claire)
  // qui respire lentement.
  function signColors() {
    if (S.outlineKey === S.signId && S.outlineCols) return S.outlineCols;
    var cols = { c1: '#2d7fff', c2: '#7fe7ff' };
    try {
      var signs = window.SIGNS || [], els = window.ELEMENTS || {};
      for (var i = 0; i < signs.length; i++) {
        if (signs[i].id === S.signId && els[signs[i].element]) {
          cols = { c1: els[signs[i].element].color, c2: els[signs[i].element].color2 };
          break;
        }
      }
    } catch (e) { /* repli eau */ }
    S.outlineKey = S.signId; S.outlineCols = cols;
    return cols;
  }

  function drawOutline(ctx, W, H) {
    if (!S.personC || !S.personC.width) return;
    var sc = S.silC;
    if (!sc) { sc = S.silC = document.createElement('canvas'); }
    var hw = Math.max(2, Math.round(W / 2)), hh = Math.max(2, Math.round(H / 2));
    if (sc.width !== hw || sc.height !== hh) { sc.width = hw; sc.height = hh; }
    var sctx = sc.getContext('2d');
    sctx.clearRect(0, 0, hw, hh);
    sctx.globalCompositeOperation = 'source-over';
    sctx.drawImage(S.personC, 0, 0, hw, hh);
    var cols = signColors();
    var pulse = 1 + 0.10 * Math.sin(performance.now() / 420);
    var r = Math.max(3, Math.round(W * 0.0075 * pulse));
    var i, a;
    ctx.save();
    // Halo extérieur (couleur profonde, anneau large, discret)
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = cols.c1; sctx.fillRect(0, 0, hw, hh);
    ctx.globalAlpha = 0.30;
    for (i = 0; i < 8; i++) {
      a = i * Math.PI / 4;
      ctx.drawImage(sc, Math.cos(a) * r * 2.1, Math.sin(a) * r * 2.1, W, H);
    }
    // Liseré net (couleur claire, anneau fin, franc)
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = cols.c2; sctx.fillRect(0, 0, hw, hh);
    ctx.globalAlpha = 0.95;
    for (i = 0; i < 8; i++) {
      a = i * Math.PI / 4;
      ctx.drawImage(sc, Math.cos(a) * r, Math.sin(a) * r, W, H);
    }
    ctx.restore();
  }

  // La personne détourée, dessinée aux dimensions du canvas (W×H CSS).
  function drawPersonCutout(ctx, W, H) {
    // v1.9.26 — le masque SAM 3.1 (détourage bien plus précis) prime dès
    // qu'il existe ; sinon le masque MediaPipe, exactement comme avant.
    // v1.9.28 — verdict terrain d'Hamza : le détourage « de ce matin »
    // (MediaPipe, recalculé à chaque image) est meilleur que le masque SAM
    // figé entre deux échantillons (~2,4 s) sur une personne qui bouge.
    // MediaPipe redevient la source du détourage 2D ; SAM reste réservé à
    // l'occluteur 3D (getPersonMask), où sa précision compte plus.
    var useSam = !(S.segOk && S.maskC && S.maskC.width) && !!(S.samOk && S.samMaskC && S.samMaskC.width);
    var maskC = useSam ? S.samMaskC : S.maskC;
    if (!maskC || !maskC.width) return false;
    var v = cameraEl(); if (!v) return false;
    if (!S.personC) S.personC = document.createElement('canvas');
    var pc = S.personC;
    if (pc.width !== W || pc.height !== H) { pc.width = W; pc.height = H; }
    var g2 = pc.getContext('2d');
    // v1.9.52 — la personne détourée redevient la caméra BRUTE (visage,
    // cheveux, mains photographiques) ; le cartoon du vêtement est une
    // passe séparée par-dessus (drawGarmentToon).
    var r = coverRect(v, W, H);
    var mx = maskC.width / v.videoWidth, my = maskC.height / v.videoHeight;
    g2.clearRect(0, 0, W, H);
    g2.globalCompositeOperation = 'source-over';
    try { g2.filter = 'blur(2px)'; } catch (e) {}   // bords doux
    try { g2.drawImage(maskC, r.sx * mx, r.sy * my, r.sw * mx, r.sh * my, 0, 0, W, H); }
    catch (e) { return false; }
    try { g2.filter = 'none'; } catch (e) {}
    g2.globalCompositeOperation = 'source-in';      // ne garder que la personne
    try { g2.drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H); }
    catch (e) { return false; }
    g2.globalCompositeOperation = 'source-over';
    // v1.9.9 — le CONTOUR est RETIRÉ (demande d'Hamza : détourage trop
    // approximatif, effets « moches » sur le terrain). La personne
    // détourée reste, sans anneau coloré.
    ctx.drawImage(pc, 0, 0, W, H);
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* v1.9.52 — LE CARTOON DU VÊTEMENT SEUL (verdict terrain d'Hamza   */
  /* sur la v1.9.51 : « bien sur les t-shirts, mais pas le reste — le  */
  /* visage est moche »). Le pass shader tourne toujours sur tout le  */
  /* cadre, mais son résultat n'est appliqué QU'À travers ce masque : */
  /* personne (MediaPipe, chaque image) ∩ zone du vêtement (ellipse   */
  /* ancrée sur le dessin SUIVI — l'app sait où est le torse : le     */
  /* dessin est dessus — haut fondu pour épargner cou et visage).     */
  /* SAM sait dire « hoodie » mais répond en ~2,4 s : c'est ce qui a  */
  /* fait échouer l'aplat du 29 oct au matin (« il suit pas »). Ici,  */
  /* tout suit à chaque image. Par-dessus, la FONTE DU LOGO : la      */
  /* caméra fortement floutée (couleur locale du tissu, sans le       */
  /* détail du print) déposée en douceur sur la zone du dessin.       */
  /* ---------------------------------------------------------------- */
  function drawGarmentToon(ctx, W, H, cx, cy) {
    if (!CFG.CARTOON) return;
    var cs = cartoonSource(); if (!cs) return;
    var maskC = (S.segOk && S.maskC && S.maskC.width) ? S.maskC : null;
    if (!maskC || !S.smTw) return;
    if (!S.garmentC) S.garmentC = document.createElement('canvas');
    var gc = S.garmentC;
    if (gc.width !== W || gc.height !== H) { gc.width = W; gc.height = H; }
    var g2 = gc.getContext('2d');
    var r = coverRectWH(cs.width, cs.height, W, H);
    g2.clearRect(0, 0, W, H);
    g2.globalCompositeOperation = 'source-over';
    try { g2.filter = 'none'; } catch (e) {}
    try { g2.drawImage(cs, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H); } catch (e) { return; }
    // ∩ personne (même mapping par fractions que le détourage)
    var mx = maskC.width / cs.width, my = maskC.height / cs.height;
    g2.globalCompositeOperation = 'destination-in';
    try { g2.filter = 'blur(2px)'; } catch (e) {}
    try { g2.drawImage(maskC, r.sx * mx, r.sy * my, r.sw * mx, r.sh * my, 0, 0, W, H); } catch (e) { return; }
    try { g2.filter = 'none'; } catch (e) {}
    // ∩ zone du vêtement : ellipse ancrée sur le dessin suivi ; le
    // haut fond progressivement (cou/visage épargnés), le reste plein.
    g2.globalCompositeOperation = 'destination-in';
    var zx = cx, zy = cy + S.smTw * 0.52, zrx = S.smTw * 1.18, zry = S.smTw * 1.22;
    var grad = g2.createLinearGradient(0, zy - zry, 0, zy - zry * 0.30);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    g2.fillStyle = grad;
    g2.beginPath();
    g2.ellipse(zx, zy, zrx, zry, 0, 0, 6.2832);
    g2.fill();
    g2.globalCompositeOperation = 'source-over';
    ctx.drawImage(gc, 0, 0);
    drawLogoMelt(ctx, W, H, cx, cy, maskC);
  }

  /* v1.9.52 — LA FONTE DU LOGO : un mini-canvas de la caméra (64 px,
     ré-agrandi = flou extrême) garde la couleur et les grands plis du
     tissu mais perd le détail du print. Déposé à 60 % dans une ellipse
     douce sur la zone du dessin, rogné par le masque personne. Si le
     logo reste un peu visible, « c'est pas grave » (Hamza).          */
  function drawLogoMelt(ctx, W, H, cx, cy, maskC) {
    var v = cameraEl(); if (!v || !S.smTw) return;
    if (!S.meltC) S.meltC = document.createElement('canvas');
    var mc = S.meltC;
    var mw = 64, mh = Math.max(2, Math.round(64 * H / W));
    if (mc.width !== mw || mc.height !== mh) { mc.width = mw; mc.height = mh; }
    var r = coverRect(v, W, H);
    try { mc.getContext('2d').drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, mw, mh); } catch (e) { return; }
    if (!S.meltMaskC) S.meltMaskC = document.createElement('canvas');
    var mm = S.meltMaskC;
    if (mm.width !== W || mm.height !== H) { mm.width = W; mm.height = H; }
    var g3 = mm.getContext('2d');
    g3.clearRect(0, 0, W, H);
    g3.globalCompositeOperation = 'source-over';
    g3.drawImage(mc, 0, 0, W, H);
    var mx = maskC.width / v.videoWidth, my = maskC.height / v.videoHeight;
    g3.globalCompositeOperation = 'destination-in';
    try { g3.drawImage(maskC, r.sx * mx, r.sy * my, r.sw * mx, r.sh * my, 0, 0, W, H); } catch (e) { return; }
    g3.globalCompositeOperation = 'destination-in';
    var ex = cx, ey = cy + S.smTw * 0.02, erx = S.smTw * 0.56, ery = S.smTw * 0.62;
    g3.save();
    g3.translate(ex, ey); g3.scale(erx, ery);
    var rg = g3.createRadialGradient(0, 0, 0.25, 0, 0, 1);
    rg.addColorStop(0, 'rgba(0,0,0,0.95)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g3.fillStyle = rg;
    g3.beginPath(); g3.arc(0, 0, 1, 0, 6.2832); g3.fill();
    g3.restore();
    ctx.save();
    ctx.globalAlpha = 0.60;
    ctx.drawImage(mm, 0, 0);
    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /* v1.9.51 — le BADGE de la récolte : pop au centre du signe, puis  */
  /* vol en arc jusqu'au slot du panneau de collection (position      */
  /* publiée par app.js dans window.__harvestSlot, en px canvas).     */
  /* Tout est dessiné ICI, donc l'animation fait partie de            */
  /* l'enregistrement REC, comme le reste du spectacle.               */
  /* ---------------------------------------------------------------- */
  function drawHarvestBadge(ctx, W, H, cx, cy) {
    if (!S.hvT0 || !S.badgeImg || !S.badgeImg.complete || !S.badgeImg.naturalWidth) return;
    var t = (performance.now() - S.hvT0) / 1000;
    var R0 = Math.min(W, H) * 0.17;
    var x = cx, y = cy, r = R0;
    if (t < 0.9) return;                          // phase A : rétrécissement
    if (t < 1.45) {                               // phase B : pop
      var p = (t - 0.9) / 0.55;
      var s = p < 0.6 ? easeOutCubic(p / 0.6) * 1.12 : 1.12 - 0.12 * easeOutCubic((p - 0.6) / 0.4);
      r = R0 * Math.max(0.05, s);
    } else if (t < 2.35) {                        // phase C : le vol
      var p2 = smooth01((t - 1.45) / 0.9);
      var tgt = window.__harvestSlot;
      var tx = tgt ? tgt.x : W / 2, ty = tgt ? tgt.y : H * 0.93, tr = tgt ? tgt.r : R0 * 0.3;
      x = cx + (tx - cx) * p2;
      y = cy + (ty - cy) * p2 - Math.sin(p2 * Math.PI) * H * 0.15;
      r = R0 + (tr - R0) * p2;
      if (p2 >= 1 && !S.hvLandSent) {
        S.hvLandSent = true;
        try { window.dispatchEvent(new CustomEvent('astrocode:harvest-land', { detail: { signId: S.badgeSign } })); } catch (e) {}
      }
    } else return;                                // atterri : le DOM prend le relais
    ctx.save();
    ctx.globalAlpha = S.fade;
    var grd = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2.0);
    grd.addColorStop(0, 'rgba(255,196,64,0.50)');
    grd.addColorStop(1, 'rgba(255,196,64,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.clip();
    try { ctx.drawImage(S.badgeImg, x - r, y - r, r * 2, r * 2); } catch (e) {}
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = S.fade;
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.strokeStyle = '#f5c542';
    ctx.beginPath(); ctx.arc(x, y, r * 0.99, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /* La phrase, mot après mot                                           */
  /* ---------------------------------------------------------------- */
  function drawWords(ctx, W, H, g) {
    if (!CFG.SHOW_PHRASE) return;   // v1.9.9 — phrase descendue pour le moment
    if (!S.words.length) return;
    var size = Math.max(17, Math.min(30, W * 0.062));
    ctx.font = '700 ' + size + 'px "Space Grotesk", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Mise en lignes : on remplit tant que ça tient dans 86 % de la largeur.
    var maxW = W * 0.86, lines = [], cur = [], curW = 0, spaceW = ctx.measureText(' ').width;
    for (var i = 0; i < S.words.length; i++) {
      var ww = ctx.measureText(S.words[i]).width;
      if (cur.length && curW + spaceW + ww > maxW) { lines.push(cur); cur = []; curW = 0; }
      cur.push({ text: S.words[i], w: ww, index: i });
      curW += (cur.length > 1 ? spaceW : 0) + ww;
    }
    if (cur.length) lines.push(cur);

    var lineH = size * 1.42;
    // Dans le bas, mais SANS bloc opaque : les mots flottent sur l'image.
    // On laisse 22 % de hauteur sous eux — la place du bouton
    // d'enregistrement et de la zone de pouce.
    var baseY = H - lineH * lines.length - H * 0.22;

    for (var li = 0; li < lines.length; li++) {
      var line = lines[li], total = 0;
      for (var j = 0; j < line.length; j++) total += line[j].w + (j ? spaceW : 0);
      var x = (W - total) / 2, y = baseY + li * lineH + lineH / 2;
      for (var j2 = 0; j2 < line.length; j2++) {
        var wd = line[j2];
        // Chaque mot entre à son tour, en montant et en apparaissant.
        var born = wd.index * CFG.WORD_IN;
        var k = (S.wordsT - born) / CFG.WORD_RISE;
        if (k <= 0) { x += wd.w + spaceW; continue; }
        k = Math.min(1, k);
        var ease = 1 - Math.pow(1 - k, 3);
        var cxw = x + wd.w / 2;
        var cyw = y + (1 - ease) * size * 0.9;
        ctx.save();
        ctx.globalAlpha = g * ease;
        // Une ombre portée douce : lisible sur n'importe quelle image.
        ctx.shadowColor = 'rgba(0,0,0,.75)';
        ctx.shadowBlur = size * 0.5;
        ctx.fillStyle = '#fff6ee';
        ctx.fillText(wd.text, cxw, cyw);
        ctx.restore();
        x += wd.w + spaceW;
      }
    }
  }

  // Traînée : un court historique de positions, qui s'éteint.
  function drawTrail(ctx, f, alpha, w) {
    var tr = S.trails[f.i] || (S.trails[f.i] = []);
    tr.push({ x: f.x, y: f.y });
    if (tr.length > CFG.TRAIL) tr.shift();
    ctx.save();
    for (var i = 0; i < tr.length; i++) {
      var k = i / tr.length;
      ctx.globalAlpha = alpha * k * 0.35;
      ctx.fillStyle = (f.i % 2 === 0) ? '#ffb46a' : '#bfd9ff';
      ctx.beginPath();
      ctx.arc(tr[i].x, tr[i].y, w * 0.035 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function kick() {
    if (!S.raf) { S.last = 0; S.raf = requestAnimationFrame(loop); }
  }

  /* ---------------------------------------------------------------- */
  /* v1.8.5 — LA VIDÉO DU SIGNE                                         */
  /* Certains signes ont une vraie vidéo alpha (générée, détourée) :    */
  /* quand elle existe, elle REMPLACE le banc de koïs dessinées dans    */
  /* ce même canvas — elle se retrouve donc aussi dans la vidéo         */
  /* enregistrée, et la validation du scan (isRunning) ne change pas.   */
  /* Si la vidéo ne charge pas, repli automatique sur les koïs          */
  /* dessinées : jamais d'écran vide. Chargement paresseux : le         */
  /* fichier n'est demandé qu'à la première détection du signe.         */
  /* ---------------------------------------------------------------- */
  /* v1.8.7 — DEUX couches par signe : le FOND (éléments derrière la
     personne, plein cadre) et l'ORBITE (la créature autour du corps).
     Chaque couche est indépendante : si l'une échoue, l'autre joue, et
     si les deux manquent on retombe sur les koïs dessinées. */
  var SIGN_VIDEOS = {
    poissons: {
      // v1.9.49 — RETOUR À L'ANCIENNE VERSION (verdict terrain
      // d'Hamza, 29 oct) : le mode tout-orange (v1.9.46-48) est
      // abandonné, et l'aplat SAM du vêtement (v1.9.47-48) est RETIRÉ
      // (« il reste petit, il suit pas le t-shirt ») — il ne reste que
      // le détourage MediaPipe de la personne, qui met les éléments
      // derrière elle. Le fond redevient la vidéo ALPHA ancrée
      // d'avant l'orange, EN ATTENDANT la nouvelle vidéo de fond sur
      // FOND VERT qu'Hamza va générer : elle sera détourée au chroma
      // et remplacera ce fichier (même rôle, même ancrage).
      // v1.9.50 — NOUVEAU FOND d'Hamza (29 oct) : sa vidéo urbaine sur
      // FOND VERT (720×1280), son enlevée, vert détouré au chroma
      // (fond mesuré (13,229,78), despill qui épargne les sarcelles).
      // La scène ne bouclait pas (les éléments sortent du cadre) →
      // montée en ALLER-RETOUR (20 s), rendue à 12 i/s pour le poids
      // (12 Mo) — c'est un décor, la fluidité suffit. Rôle et ancrage
      // inchangés : derrière la personne, pas en grand.
      back: 'assets/reveal/poissons-fond-vert-alpha.webm',
      // v1.9.47 — AVANT régénéré par Hamza sur FOND VERT (sa solution
      // du 29 oct : le détourage noir mangeait les intérieurs sombres
      // des poissons — rayure trouée à 80 %, mesuré). Détourage CHROMA
      // (vert pur (0,255,0), distance + dé-prémultiplication + despill
      // qui épargne le poisson sarcelle) → 960×536, TOUT survit : yeux,
      // traits, rayures. Et la rotation fait exactement un tour en
      // 240 frames : couture mesurée 12,5 ≈ un pas normal (12,7) →
      // BOUCLE PARFAITE, loop=true (frontLoop) : l'orbite ne gèle plus.
      // L'avant sticker détouré du noir (v1.9.46, corrigé en v5) est
      // archivé avec les anciens fonds.
      front: 'assets/reveal/poissons-yinyang-vert-alpha.webm',
      frontLoop: true
    },
    lion: {
      // v1.9.42 — avant = SA vidéo Seedance (le print s'anime, le
      // lion gummy saute dans l'anneau), RECENTRÉE sur le scan (le sujet
      // vivait à x≈807/1280, décalée de −167 px) puis détourée v4.
      // v1.9.44 — NOUVEAU fond : vidéo générée par Hamza sur fond VERT
      // (704×1280, 24 fps), détourage chroma (distance couleur +
      // dé-prémultiplication + correction de frange verte), boucle
      // rendue propre par fondu d'enroulement de 0,7 s (344 frames,
      // 14,3 s). L'ancien fond reste en place (leo-fond-alpha.webm).
      back: 'assets/reveal/leo-fond-vert-alpha.webm',
      front: 'assets/reveal/leo-avant-alpha.webm'
    }
  };

  /* v1.9.43 — LA MONTÉE FINALE (demande d'Hamza, 28 oct) : à la fin de
     sa vidéo, le lion assis est glissé vers le haut, en douceur,
     pendant son arrivée : il « grimpe » et finit perché à hauteur
     d'épaule. t0/t1 = secondes dans la timeline de la vidéo avant ;
     lift = fraction de la hauteur dessinée ; après la fin de la vidéo
     (image figée), la montée reste.
     v1.9.44 — RECALIBRAGE sur le NOUVEAU fond (repère d'Hamza, 29 oct) :
     le lion doit finir POSÉ SUR LE RUBAN ROSE, À CÔTÉ DE LA CLÉ DORÉE
     du fond — ce qui tombe sur l'épaule de la porteuse. Mesures :
     centre du lion assis (pose finale, 13,5-14,8 s) = (0,384 ; 0,502)
     dans la vidéo avant ; centre de la clé dans le nouveau fond =
     (0,210 ; 0,211), dents ≈ (0,29 ; 0,26) → point cible « ruban à
     côté de la clé » = (0,295 ; 0,285) dans le fond. Géométrie de fin
     de révélation : fishW = 1,75 × larg. cible, backH = 3,1 × larg.
     cible, aspects avant et fond = 0,55 tous les deux. Résolution :
     dx = −0,08 (fraction de la largeur dessinée, négatif = gauche),
     lift = 0,69. Vérifié : position écran finale du centre du lion
     (−0,350 ; −0,666) × larg. cible vs point clé/ruban (−0,350 ;
     −0,667) — écart < 0,1 % de la largeur de la cible. */
  var SIGN_CLIMB = {
    // v1.9.49 — ajustement terrain d'Hamza (29 oct) : poser le lion
    // ~10 % plus à droite et ~10 % plus bas sur l'épaule → dx −0,08
    // devient +0,02 et lift 0,69 devient 0,59.
    lion: { t0: 11.0, t1: 14.0, lift: 0.59, dx: 0.02 }
  };

  /* ------------------------------------------------------------------ */
  /* v1.9.0 — LE FOND ANCRÉ (grammaire des réfs « parapluie », 27 oct)   */
  /* Des éléments SÉPARÉS remplissent TOUT l'arrière-plan derrière le   */
  /* porteur : positions aléatoires mais FIXES, tailles variées (le     */
  /* feu plus grand, les roses plus petites), chacun animé SUR PLACE    */
  /* (flottement, balancement, pulsation) — aucun zoom, aucun voyage,   */
  /* rien ne sort du cadre, et les éléments ne dessinent PAS la         */
  /* silhouette : ils sont partout derrière, la personne détourée les   */
  /* cache au centre et les révèle quand elle bouge.                    */
  /* ------------------------------------------------------------------ */
  var SIGN_BACKDROPS = {
    poissons: {
      dir: 'assets/elements/poissons2/',
      // Composition dessinée d'après la réf 9 d'Hamza (27 oct), ALLÉGÉE
      // (moins de corail, moins dense). x/y = centre, w = largeur, en
      // fractions du canvas ; z = ordre de dessin. Les anneaux ont un
      // `spin` (rad/s) : ils tournent lentement SUR PLACE. Les poissons
      // du fond ont `swim` : balancement de nage, toujours sur place.
      places: [
        { f: 'corail-1',       x: 0.16, y: 0.945, w: 0.20, z: 0 },
        { f: 'corail-cerveau', x: 0.40, y: 0.960, w: 0.19, z: 0 },
        { f: 'corail-2',       x: 0.63, y: 0.945, w: 0.20, z: 0 },
        { f: 'anemone',        x: 0.86, y: 0.940, w: 0.17, z: 0 },
        { f: 'coquille-1',     x: 0.05, y: 0.970, w: 0.13, z: 0 },
        { f: 'coquille-2',     x: 0.52, y: 0.982, w: 0.12, z: 0 },
        { f: 'etoile-mer',     x: 0.96, y: 0.972, w: 0.13, z: 0 },
        { f: 'anneau-1', x: 0.30, y: 0.30, w: 0.50, z: 1, spin: 0.10 },
        { f: 'anneau-2', x: 0.70, y: 0.46, w: 0.56, z: 1, spin: -0.08 },
        { f: 'anneau-3', x: 0.33, y: 0.61, w: 0.44, z: 1, spin: 0.13 },
        { f: 'monstre-diable', x: 0.15, y: 0.12, w: 0.27, z: 2 },
        { f: 'ours',           x: 0.86, y: 0.11, w: 0.25, z: 2 },
        { f: 'pieuvre',        x: 0.12, y: 0.40, w: 0.22, z: 2 },
        { f: 'monstre-orange', x: 0.88, y: 0.64, w: 0.25, z: 2 },
        { f: 'poisson-1', x: 0.64, y: 0.21, w: 0.19, z: 2, swim: 1 },
        { f: 'poisson-2', x: 0.84, y: 0.33, w: 0.16, z: 2, swim: 1 },
        { f: 'poisson-3', x: 0.20, y: 0.74, w: 0.18, z: 2, swim: 1 },
        { f: 'planete-rose', x: 0.94, y: 0.235, w: 0.15, z: 3 },
        { f: 'planete-1',    x: 0.06, y: 0.565, w: 0.16, z: 3 },
        { f: 'planete-2',    x: 0.50, y: 0.065, w: 0.14, z: 3 },
        { f: 'coeur-1', x: 0.44, y: 0.155, w: 0.11, z: 3 },
        { f: 'coeur-2', x: 0.58, y: 0.68, w: 0.10, z: 3 },
        { f: 'eclair',  x: 0.955, y: 0.47, w: 0.10, z: 3 },
        { f: 'etoile',  x: 0.045, y: 0.25, w: 0.11, z: 3 },
        { f: 'engrenage-1', x: 0.14, y: 0.845, w: 0.12, z: 3 },
        { f: 'engrenage-2', x: 0.66, y: 0.83, w: 0.11, z: 3 },
        { f: 'pouce', x: 0.045, y: 0.685, w: 0.13, z: 3, rot: -0.15 },
        { f: 'pouce', x: 0.945, y: 0.865, w: 0.12, z: 3, rot: 0.12 }
      ]
    }
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function loadBackdrop(signId) {
    var bd = SIGN_BACKDROPS[signId];
    if (!bd) { S.bdImgs = []; S.bdReady = false; S.bdSign = null; return; }
    if (S.bdSign === signId && S.bdImgs.length) return;
    S.bdSign = signId; S.bdReady = false; S.bdImgs = []; S.bdLayout = null;
    var names = {};
    bd.places.forEach(function (p) { names[p.f] = true; });
    var total = Object.keys(names).length, loaded = 0;
    Object.keys(names).forEach(function (name) {
      var im = new Image();
      im.onload = function () {
        loaded++;
        if (loaded >= Math.ceil(total * 0.8)) S.bdReady = true;
      };
      im.onerror = function () { loaded++; };
      im.src = bd.dir + name + '.webp';
      im.dataset.name = name;
      S.bdImgs.push(im);
    });
  }

  function buildBackdropLayout(W, H) {
    var key = W + 'x' + H;
    if (S.bdLayout && S.bdLayoutKey === key) return S.bdLayout;
    var bd = SIGN_BACKDROPS[S.bdSign];
    if (!bd) return [];
    var byName = {};
    S.bdImgs.forEach(function (im) { byName[im.dataset.name] = im; });
    var rnd = mulberry32(4242);
    var items = [];
    bd.places.forEach(function (p) {
      var img = byName[p.f];
      if (!img || !img.naturalWidth) return;
      var w = W * p.w, h = w * img.naturalHeight / img.naturalWidth;
      var x = Math.max(w / 2 + 1, Math.min(W - w / 2 - 1, p.x * W));
      var y = Math.max(h / 2 + 1, Math.min(H - h / 2 - 1, p.y * H));
      items.push({
        img: img, x: x, y: y, w: w, z: p.z || 0,
        rot: p.rot || 0, spin: p.spin || 0, swim: !!p.swim,
        amp: p.swim ? 6 + rnd() * 3 : 3 + rnd() * 3,
        ampX: p.swim ? 2.5 + rnd() * 1.5 : 0,
        spd: 0.6 + rnd() * 0.6, ph: rnd() * Math.PI * 2,
        sway: 0.03 + rnd() * 0.03, pulse: 0.02 + rnd() * 0.025
      });
    });
    items.sort(function (a, b) { return a.z - b.z; });
    S.bdLayout = items; S.bdLayoutKey = key;
    return items;
  }

  function drawBackdrop(ctx, W, H, g, t) {
    if (!S.bdReady || !S.bdImgs.length) return false;
    var items = buildBackdropLayout(W, H);
    var drawn = false;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var bobY = Math.sin(t * it.spd + it.ph) * it.amp;
      var bobX = it.ampX ? Math.sin(t * it.spd * 0.7 + it.ph * 1.3) * it.ampX : 0;
      var sc = 1 + Math.sin(t * it.spd * 0.8 + it.ph * 1.7) * it.pulse;
      var w = it.w * sc, h = w * it.img.naturalHeight / it.img.naturalWidth;
      var rot = it.rot + Math.sin(t * it.spd * 0.6 + it.ph) * it.sway + it.spin * t;
      ctx.save();
      ctx.globalAlpha = g;
      ctx.translate(it.x + bobX, it.y + bobY);
      ctx.rotate(rot);
      try { ctx.drawImage(it.img, -w / 2, -h / 2, w, h); drawn = true; }
      catch (e) {}
      ctx.restore();
    }
    return drawn;
  }

  function makeLayerVideo(id, src, onReady, onFail, loopIt) {
    var v = document.createElement('video');
    v.id = id;
    // v1.9.12 (demande d'Hamza) : la vidéo des poissons (avant) joue UNE
    // fois puis s'arrête sur sa dernière image — pas de boucle. La boucle
    // parfaite, il la préparera lui-même et la fournira à la main ; en
    // attendant, loop=false pour l'avant, le fond garde sa boucle.
    v.muted = true; v.loop = loopIt !== false; v.playsInline = true;
    v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
    v.preload = 'auto';
    // Invisible mais PAS display:none (drawImage doit pouvoir la lire
    // partout) : 2 px, transparente, sous le canvas.
    v.style.cssText = 'position:absolute; width:2px; height:2px; opacity:0; pointer-events:none; z-index:1;';
    v.addEventListener('canplay', onReady);
    v.addEventListener('error', onFail);
    v.src = src;
    (document.getElementById('ar-container') || document.body).appendChild(v);
    var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
    return v;
  }

  function ensureRevealVideo(signId, fresh) {
    var entry = SIGN_VIDEOS[signId];
    if (!entry) {
      S.vEl = null; S.vSign = null; S.vReady = false;
      S.bEl = null; S.bReady = false;
      return;
    }
    if (S.vSign === signId && (S.vEl || S.bEl)) {   // déjà chargées
      // Le fond reprend toujours. Les poissons : seulement si le
      // spectacle est NOUVEAU (fresh) on repart de zéro ; sinon on
      // relance seulement une lecture en cours — jamais une vidéo
      // terminée (elle reste figée sur sa dernière image, v1.9.12).
      if (S.bEl) { var pb = S.bEl.play(); if (pb && pb.catch) pb.catch(function () {}); }
      if (S.vEl) {
        if (fresh) {
          try { S.vEl.currentTime = 0; } catch (e) {}
          var pf = S.vEl.play(); if (pf && pf.catch) pf.catch(function () {});
        } else if (!S.vEl.ended) {
          var pr2 = S.vEl.play(); if (pr2 && pr2.catch) pr2.catch(function () {});
        }
      }
      if (!S.bEl) loadBackdrop(signId);
      return;
    }
    S.vSign = signId; S.vReady = false; S.bReady = false;
    S.vEl = makeLayerVideo('reveal-sign-video', entry.front,
      function () { S.vReady = true; },
      function () { S.vReady = false; S.vEl = null; },
      entry.frontLoop === true);   // v1.9.12 — pas de boucle par défaut ; v1.9.47 — frontLoop pour les rotations qui bouclent (mesuré)
    S.bEl = entry.back ? makeLayerVideo('reveal-back-video', entry.back,
      function () { S.bReady = true; },
      function () { S.bReady = false; S.bEl = null; loadBackdrop(signId); }) : null;
    // v1.9.2 — les sprites du fond ancré ne se chargent que pour un
    // signe sans vidéo de fond (ou, via le onFail ci-dessus, si la
    // vidéo échoue) : pas de téléchargement inutile.
    if (!entry.back) loadBackdrop(signId);
    initSegmentation();   // v1.8.6 — l'occlusion se prépare en parallèle
  }

  // v1.8.9 — le nuage d'éléments n'est plus un « cover » plein cadre
  // (c'est ce qui le rendait géant sur un écran portrait). Il est
  // dessiné à pleine largeur, centré sur le point scanné, comme
  // l'orbite des poissons — un peu plus large qu'elle, pour la
  // border. Éléments PETITS, centre vide : ils entourent le porteur.
  function drawBackVideo(ctx, W, H, cx, cy, g, e) {
    var v = S.bEl;
    if (!v || !S.bReady || v.readyState < 2 || !v.videoWidth) return false;
    // v1.9.3 — le fond est réduit « juste un peu » (× 0,93, demande d'Hamza).
    // v1.9.5 — si l'ancrage connaît la taille de la cible, la hauteur du
    // fond en découle (S.backH) ; sinon, repli sur la fraction d'écran.
    var w, h;
    if (S.backH) { h = S.backH; w = h * v.videoWidth / v.videoHeight; }
    else { w = W * 0.93 * (0.88 + 0.12 * e); h = w * v.videoHeight / v.videoWidth; }
    ctx.save();
    ctx.globalAlpha = g;
    try { ctx.drawImage(v, cx - w / 2, cy - h / 2, w, h); }
    catch (err) { ctx.restore(); return false; }
    ctx.restore();
    return true;
  }

  // v1.9.76 — le fond du Lion pour la FUSION : chargé une fois (élément
  // dédié, jamais confondu avec la caméra ni avec le fond du signe
  // actif), dessiné en « cover » plein cadre — en paysage, il remplit
  // l'écran en largeur derrière les deux porteurs.
  function ensureFusionBack() {
    if (S.fusionBackEl || S.fusionBackTried) return;
    S.fusionBackTried = true;
    S.fusionBackEl = makeLayerVideo('fusion-back-video',
      'assets/reveal/leo-fond-vert-alpha.webm',
      function () { S.fusionBackReady = true; },
      function () { S.fusionBackEl = null; }, true);
  }

  function drawFusionBack(ctx, W, H, g) {
    var v = S.fusionBackEl;
    if (!v || !S.fusionBackReady || v.readyState < 2 || !v.videoWidth) return false;
    var s = Math.max(W / v.videoWidth, H / v.videoHeight);
    var w = v.videoWidth * s, h = v.videoHeight * s;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, g));
    try { ctx.drawImage(v, (W - w) / 2, (H - h) / 2, w, h); }
    catch (err) { ctx.restore(); return false; }
    ctx.restore();
    return true;
  }

  function drawRevealVideo(ctx, W, H, cx, cy, g, e) {
    var v = S.vEl;
    if (!v || !S.vReady || v.readyState < 2 || !v.videoWidth) return false;
    // La vidéo (16:9) est dessinée plus large que l'écran, centrée sur
    // le point scanné : l'orbite yin-yang entoure le porteur et les
    // poissons dominent le fond (proportions de l'aperçu validé).
    // Elle grandit en émergeant.
    var w = S.fishW || (W * (0.94 + 0.36 * e));
    var h = w * v.videoHeight / v.videoWidth;
    // v1.9.43 — montée finale éventuelle (voir SIGN_CLIMB) : décalage
    // progressif, lu sur l'horloge de la vidéo elle-même.
    // v1.9.44 — décalage horizontal aussi (climb.dx, fraction de la
    // largeur dessinée) : le lion finit sur le ruban, à côté de la clé.
    var liftPx = 0, dxPx = 0;
    var climb = SIGN_CLIMB[S.vSign];
    if (climb && v.duration) {
      var cp = Math.max(0, Math.min(1, (v.currentTime - climb.t0) / (climb.t1 - climb.t0)));
      cp = cp * cp * (3 - 2 * cp);   // smoothstep
      liftPx = cp * climb.lift * h;
      dxPx = cp * (climb.dx || 0) * w;
    }
    ctx.save();
    ctx.globalAlpha = g;
    try { ctx.drawImage(v, cx - w / 2 + dxPx, cy - h / 2 - liftPx, w, h); }
    catch (err) { ctx.restore(); return false; }
    ctx.restore();
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* v1.9.7 — LE SON DU SCAN : le jingle Suno d'Hamza (« Wonderful,    */
  /* Awesome, Wow! ») part au moment où la cible est trouvée, et        */
  /* s'estompe quand elle se perd. Le navigateur exige un geste avant   */
  /* le premier son : on amorce l'élément au premier toucher, en        */
  /* silence, pour débloquer l'audio mobile.                            */
  /* ---------------------------------------------------------------- */
  var sting = null, stingPrimed = false, stingFadeTimer = null;
  function ensureSting() {
    if (sting) return sting;
    try {
      sting = new Audio('assets/audio/wonderful-sting.mp3');
      sting.preload = 'auto';
      sting.volume = 0.9;
    } catch (e) { sting = null; }
    return sting;
  }
  document.addEventListener('pointerdown', function (ev) {
    if (stingPrimed) return;
    // v1.9.69 — DISSOCIATION (demande d'Hamza) : le jingle ne s'amorce
    // QUE dans l'écran de scan, son seul territoire. Avant, le premier
    // toucher N'IMPORTE OÙ dans l'app (y compris l'essayage) amorçait
    // l'élément audio du reveal — et le son « bloquait tout ».
    var inScan = document.body.classList.contains('scanning') ||
      (ev.target && ev.target.closest && ev.target.closest('#screen-scan'));
    if (!inScan) return;
    stingPrimed = true;
    var a = ensureSting(); if (!a) return;
    var v = a.volume; a.volume = 0;
    var pr = a.play();
    if (pr && pr.then) {
      pr.then(function () { a.pause(); a.currentTime = 0; a.volume = v; })
        .catch(function () { a.volume = v; });
    } else { a.pause(); a.volume = v; }
  });
  function playSting() {
    var a = ensureSting(); if (!a) return;
    if (stingFadeTimer) { clearInterval(stingFadeTimer); stingFadeTimer = null; }
    try {
      a.volume = 0.9; a.currentTime = 0;
      var pr = a.play(); if (pr && pr.catch) pr.catch(function () {});
    } catch (e) {}
  }
  function stopSting() {
    var a = sting; if (!a || a.paused) return;
    if (stingFadeTimer) clearInterval(stingFadeTimer);
    stingFadeTimer = setInterval(function () {
      try {
        a.volume = Math.max(0, a.volume - 0.15);
        if (a.volume <= 0.01) {
          clearInterval(stingFadeTimer); stingFadeTimer = null; a.pause();
        }
      } catch (e) { clearInterval(stingFadeTimer); stingFadeTimer = null; }
    }, 60);
  }

  /* ---------------------------------------------------------------- */
  /* Branchement sur les événements du scan                             */
  /* ---------------------------------------------------------------- */
  window.addEventListener('astrocode:target-found', function (ev) {
    buildSprites();
    if (!ensureCanvas()) return;
    resize();
    S.visible = true;
    // v1.9.9 — ANTI-RECOMMENCEMENT : si la cible revient moins de 1,5 s
    // après une perte (scintillement du suivi, surtout sur un écran),
    // la chorégraphie REPREND où elle était au lieu de tout relancer —
    // c'est ce qui empêchait les vidéos d'apparaître en v1.9.8.
    // v1.9.12 — « fresh » dit à la vidéo des poissons si elle peut
    // repartir de zéro (nouveau spectacle) ou si elle doit rester
    // figée là où elle s'est arrêtée (simple scintillement du suivi).
    var fresh = performance.now() - (S.lastLostAt || 0) > 2500;
    if (fresh) {
      S.phaseT = 0;
      S.stingPlayed = false;
      S.hvDone = false; S.hvT0 = 0; S.hvLandSent = false;   // v1.9.51 — la récolte se réarme à chaque nouveau scan
      buildRoulette((ev && ev.detail && ev.detail.signId) || 'poissons');
    }
    ensureRevealVideo((ev && ev.detail && ev.detail.signId) || 'poissons', fresh);
    ensureRevealVideo((ev && ev.detail && ev.detail.signId) || 'poissons', fresh);
    kick();
    console.log('[REVEAL2D] cible détectée — koïs en orbite (canvas 2D).');
  });

  window.addEventListener('astrocode:target-lost', function () {
    S.visible = false;
    S.lastLostAt = performance.now();   // v1.9.9 — pour l'anti-recommencement
    stopSting();   // v1.9.7 — le son s'estompe avec l'image
    S.anchorReset = true;   // v1.9.5 — le lissage d'ancrage repartira net
    kick(); // laisse le fondu de sortie se jouer
  });

  // v1.9.75 — la Rencontre : quand les deux signes sont suivis ensemble,
  // le spectacle solo s'efface (fusion.js prend les créatures).
  window.addEventListener('astrocode:fusion-start', function (ev) {
    S.fusionMode = true;
    S.fusionTargetMode = !!(ev && ev.detail && ev.detail.target);
    if (!S.fusionTargetMode) ensureFusionBack();
    kick();
  });
  window.addEventListener('astrocode:fusion-end', function () { S.fusionMode = false; S.fusionTargetMode = false; kick(); });

  /* API — permet de déclencher l'animation à la main pour un test, sans
     caméra ni cible : REVEAL_2D.test() depuis la console. */
  window.REVEAL_2D = {
    // v1.9.10 — diagnostic lisible en console : REVEAL_2D.diag()
    diag: function () {
      return {
        phaseT: +S.phaseT.toFixed(2), visible: S.visible, fade: +S.fade.toFixed(2),
        largeurDessin: S.smTw && Math.round(S.smTw),
        largeurPoissons: S.fishW && Math.round(S.fishW),
        hauteurFond: S.backH && Math.round(S.backH),
        videoAvantPrete: S.vReady, videoArrierePrete: S.bReady,
        cartoon: { on: CFG.CARTOON, ok: CT.ok, failed: CT.failed, tier: CT.tier, fps: CT.fps, res: CT.canvas ? (CT.canvas.width + 'x' + CT.canvas.height) : '' },
        harvest: { done: S.hvDone, active: !!S.hvT0, at: CFG.HARVEST_AT }
      };
    },
    test: function (phrase) {
      buildSprites(); ensureCanvas(); resize();
      if (phrase) this.setPhrase(phrase);
      S.visible = true; kick();
      return 'koïs en orbite — REVEAL_2D.stop() pour arrêter';
    },
    stop: function () { S.visible = false; kick(); },
    // v1.9.69 — Coupe le jingle immédiatement (utilisé par l'essayage :
    // aucun son du reveal ne doit exister hors du scan).
    silence: function () {
      if (stingFadeTimer) { clearInterval(stingFadeTimer); stingFadeTimer = null; }
      if (sting) { try { sting.pause(); } catch (e) { /* déjà en pause */ } }
    },
    isRunning: function () { return !!S.raf; },

    // v1.9.28 — koi3d signale que la vraie 3D est chargée : le spectacle
    // vidéo du canvas s'efface pour la laisser visible.
    setGummyActive: function (v) { S.gummy = !!v; },

    // v1.9.27 — masque personne courant, pour l'occluteur 3D de koi3d.js :
    // SAM 3.1 d'abord (précis), MediaPipe en repli (immédiat). Le compteur
    // de version dit à l'occluteur quand recharger sa texture.
    getPersonMask: function () {
      var c = (S.samOk && S.samMaskC && S.samMaskC.width) ? S.samMaskC
            : ((S.segOk && S.maskC && S.maskC.width) ? S.maskC : null);
      return c ? { canvas: c, version: S.maskVersion || 0 } : null;
    },

    // La phrase de l'oracle s'écrit DANS l'animation, mot après mot.
    // Elle remplace l'ancienne carte qui mangeait le bas de l'écran.
    setPhrase: function (text) {
      var t = String(text || '').replace(/[“”"]/g, '').trim();
      S.words = t ? t.split(/\s+/) : [];
      S.wordsT = 0;
      kick();
    },
    clearPhrase: function () { S.words = []; S.wordsT = 0; },

    // Enregistrement : le canvas doit composer la caméra en plus des koïs
    // et des mots, sinon la vidéo capturée serait transparente par-dessous.
    setRecording: function (on) { S.recording = !!on; if (on) kick(); },
    // Le flux à enregistrer (canvas composé). 0 = suit le rythme du rendu.
    captureStream: function (fps) {
      ensureCanvas();
      return S.canvas && S.canvas.captureStream ? S.canvas.captureStream(fps || 30) : null;
    },
    getCanvas: function () { return S.canvas; }
  };
})();
