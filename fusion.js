/* ============================================================================
   FUSION.JS — v1.9.75 — LA RENCONTRE : le « troisième signe » (Poissons × Lion)

   Quand MindAR suit les DEUX signes en même temps (maxTrack: 2,
   ar-tracking.js), astrocode:fusion-start se déclenche : ce module prend
   le relais des créatures sur son propre canvas (au-dessus de celui du
   reveal, qui garde caméra + personne détourée) :

     phase A (0 → 1,4 s)   : chaque créature vit sur SON porteur.
     phase B (1,4 → 2,9 s) : les deux créatures convergent vers le milieu.
     phase C (> 2,9 s)     : l'animal fusionné apparaît au centre —
                             la vidéo d'Hamza si elle est déposée dans
                             assets/fusion/poissons-lion.webm,
                             sinon l'image fusionnée, sinon le fondu
                             croisé des deux créatures.

   astrocode:fusion-end (un signe perdu) → fondu de sortie, retour au
   spectacle solo. Aucun état de collection n'est touché ici.
   ============================================================================ */
(function () {
  'use strict';

  var FRONT = {
    poissons: 'assets/reveal/poissons-yinyang-vert-alpha.webm',
    lion: 'assets/reveal/leo-avant-alpha.webm'
  };
  var GLOW = {
    poissons: 'rgba(56,196,184,',
    lion: 'rgba(255,150,60,'
  };
  var MERGE_VIDEOS = ['assets/fusion/poissons-lion.webm'];
  var MERGE_IMG = 'assets/fusion/poissons-lion.webp';
  var SIGNS = ['poissons', 'lion'];

  var S = {
    on: false, t0: 0, fade: 0, raf: 0, last: 0,
    canvas: null, ctx: null, w: 0, h: 0,
    vids: {},           // vidéos « avant » des deux signes
    mergeVid: null, mergeVidReady: false,
    mergeImg: null, mergeImgReady: false,
    mediaStarted: false,
    sting: null,        // v1.9.85 — le son de la fusion (7 s, fondu inclus)
    targetMode: false,  // v1.9.82 — la cible est l'image DUO (une seule cible)
    lastTargetRect: null,
    rects: {}           // derniers rectangles lissés, par signe
  };

  function ensureCanvas() {
    if (S.canvas && S.canvas.isConnected) return true;
    var host = document.getElementById('ar-container') || document.body;
    var c = document.createElement('canvas');
    c.id = 'fusion-canvas';
    c.style.cssText =
      'position:absolute; inset:0; width:100%; height:100%;' +
      'pointer-events:none; z-index:31;';
    if (host === document.body) c.style.position = 'fixed';
    var pos = window.getComputedStyle(host).position;
    if (pos === 'static') host.style.position = 'relative';
    host.appendChild(c);
    S.canvas = c;
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

  function makeVideo(src, loop) {
    var v = document.createElement('video');
    v.src = src;
    v.muted = true;
    v.loop = !!loop;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    return v;
  }

  function startMedia() {
    if (S.mediaStarted) return;
    S.mediaStarted = true;
    SIGNS.forEach(function (signId) {
      var v = makeVideo(FRONT[signId], true);
      S.vids[signId] = v;
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
    });
    // La vidéo de fusion d'Hamza, si elle est déposée : webm d'abord.
    // Elle joue UNE fois (sa propre chorégraphie) puis reste sur sa
    // dernière image — l'animal fusionné — tant que la fusion dure.
    var tryMerge = function (i) {
      if (i >= MERGE_VIDEOS.length) return;
      var v = makeVideo(MERGE_VIDEOS[i], false);
      var settled = false;
      v.addEventListener('loadeddata', function () {
        if (settled) return;
        settled = true;
        S.mergeVid = v;
        S.mergeVidReady = true;
        // Si la fusion a déjà commencé, on recale la vidéo ET
        // l'horloge de la chorégraphie sur son début.
        if (S.on) {
          try { v.currentTime = 0; } catch (e) {}
          S.t0 = performance.now();
        }
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      });
      v.addEventListener('error', function () {
        if (settled) return;
        settled = true;
        tryMerge(i + 1);
      }, true);
      // Un fichier absent peut ne jamais déclencher « error » sur
      // certains navigateurs : filet de 2,5 s avant de passer au suivant.
      setTimeout(function () {
        if (!settled && v.readyState < 2) { settled = true; tryMerge(i + 1); }
      }, 2500);
    };
    tryMerge(0);
    var img = new Image();
    img.onload = function () { S.mergeImg = img; S.mergeImgReady = true; };
    img.src = MERGE_IMG;
  }

  function smoothstep(u) {
    u = Math.max(0, Math.min(1, u));
    return u * u * (3 - 2 * u);
  }

  // v1.9.78 — position de repli (armement manuel, aucune détection) :
  // Poissons à gauche, Lion à droite, comme deux porteurs côte à côte.
  function defaultRect(signId, W, H) {
    return {
      cx: signId === 'poissons' ? W * 0.35 : W * 0.65,
      cy: H * 0.44,
      tw: W * 0.30
    };
  }

  function rectOf(signId, W, H) {
    var API = window.AR_TRACKING;
    if (!API || !API.getSignScreenRect) return S.rects[signId] || defaultRect(signId, W, H);
    var rc = API.getSignScreenRect(signId);
    if (rc) {
      var tw = Math.hypot((rc.xr - rc.xl) * W, (rc.yr - rc.yl) * H);
      if (tw > W * 0.04 && tw < W * 1.9) {
        var cur = S.rects[signId];
        var next = { cx: rc.x * W, cy: rc.y * H, tw: tw };
        if (cur) {
          var L = 0.4;
          next.cx = cur.cx + (next.cx - cur.cx) * L;
          next.cy = cur.cy + (next.cy - cur.cy) * L;
          next.tw = cur.tw + (next.tw - cur.tw) * L;
        }
        S.rects[signId] = next;
        return next;
      }
    }
    return S.rects[signId] || defaultRect(signId, W, H);
  }

  function drawVid(ctx, v, cx, cy, w, alpha) {
    if (!v || v.readyState < 2 || !v.videoWidth) return false;
    var h = w * (v.videoHeight / v.videoWidth);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.drawImage(v, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
    return true;
  }

  function drawGlow(ctx, cx, cy, r, color, alpha) {
    if (alpha <= 0.01 || r <= 0) return;
    var gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, color + (0.5 * alpha) + ')');
    gr.addColorStop(0.55, color + (0.16 * alpha) + ')');
    gr.addColorStop(1, color + '0)');
    ctx.save();
    ctx.fillStyle = gr;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }

  function loop(now) {
    S.raf = requestAnimationFrame(loop);
    var dt = Math.min((now - (S.last || now)) / 1000, 0.08);
    S.last = now;
    var target = S.on ? 1 : 0;
    S.fade += Math.sign(target - S.fade) * Math.min(Math.abs(target - S.fade), dt / 0.32);
    if (!S.on && S.fade <= 0) { stopLoop(); return; }
    if (!S.canvas || !S.ctx) return;
    var ctx = S.ctx, W = S.w, H = S.h;
    if (!W || !H) { resize(); W = S.w; H = S.h; }
    ctx.clearRect(0, 0, W, H);
    if (S.fade <= 0) return;

    // v1.9.82 — mode « image duo » : une seule cible (la photo des deux
    // porteurs) ; la vidéo de fusion se joue dessus, centrée, et reste
    // sur l'animal fusionné tant que l'image est suivie.
    if (S.targetMode) {
      var API2 = window.AR_TRACKING;
      var rc2 = API2 && API2.getTargetScreenRect ? API2.getTargetScreenRect() : null;
      var fx = W / 2, fy = H * 0.46, ftw = W * 0.52;
      if (rc2) {
        var mtw = Math.hypot((rc2.xr - rc2.xl) * W, (rc2.yr - rc2.yl) * H);
        fx = rc2.x * W; fy = rc2.y * H;
        if (mtw > W * 0.05 && mtw < W * 1.9) ftw = mtw;
        S.lastTargetRect = { cx: fx, cy: fy, tw: ftw };
      } else if (S.lastTargetRect) {
        fx = S.lastTargetRect.cx; fy = S.lastTargetRect.cy; ftw = S.lastTargetRect.tw;
      }
      var vw2 = ftw * 1.5;
      drawGlow(ctx, fx, fy, vw2 * 0.85, 'rgba(255,180,90,', S.fade * 0.85);
      var drawn2 = false;
      if (S.mergeVidReady) drawn2 = drawVid(ctx, S.mergeVid, fx, fy, vw2, S.fade);
      if (!drawn2 && S.mergeImgReady && S.mergeImg) {
        var iw2 = ftw * 1.25, ih2 = iw2 * (S.mergeImg.height / S.mergeImg.width);
        ctx.save();
        ctx.globalAlpha = S.fade;
        ctx.drawImage(S.mergeImg, fx - iw2 / 2, fy - ih2 / 2, iw2, ih2);
        ctx.restore();
      }
      return;
    }

    var rp = rectOf('poissons', W, H);
    var rl = rectOf('lion', W, H);
    if (!rp && !rl) return;
    if (!rp) rp = rl;
    if (!rl) rl = rp;

    var t = (now - S.t0) / 1000;
    var mid = { cx: (rp.cx + rl.cx) / 2, cy: (rp.cy + rl.cy) / 2, tw: (rp.tw + rl.tw) / 2 };
    var u = smoothstep((t - 1.4) / 1.5);            // convergence
    var m = Math.max(0, Math.min(1, (t - 2.9) / 0.45));  // animal fusionné

    // v1.9.76 — SA vidéo de fusion est là : c'est ELLE qui mène la
    // chorégraphie (convergence, vortex, animal fusionné). Phase A :
    // chaque créature sur son porteur (1,2 s) ; fondu vers la vidéo au
    // centre ; elle finit sur l'animal fusionné et le garde à l'écran.
    if (S.mergeVidReady) {
      var xf = Math.max(0, Math.min(1, (t - 1.2) / 0.5));
      var duo = [
        { sign: 'poissons', r: rp, ph: 0 },
        { sign: 'lion', r: rl, ph: 2.1 }
      ];
      for (var j = 0; j < duo.length; j++) {
        var d = duo[j];
        var bobD = Math.sin(now / 450 + d.ph) * H * 0.006;
        var wD = d.r.tw * 1.6;
        var aD = S.fade * (1 - xf);
        drawGlow(ctx, d.r.cx, d.r.cy, wD * 0.85, GLOW[d.sign], aD * 0.55);
        drawVid(ctx, S.vids[d.sign], d.r.cx, d.r.cy + bobD, wD, aD);
      }
      if (xf > 0) {
        var vw = mid.tw * (1.7 + 0.7 * xf);
        drawGlow(ctx, mid.cx, mid.cy, vw * 0.8, 'rgba(255,180,90,', S.fade * xf * 0.8);
        drawVid(ctx, S.mergeVid, mid.cx, mid.cy, vw, S.fade * xf);
      }
      return;
    }

    // Les deux créatures, chacune sur son porteur puis vers le milieu.
    var creatures = [
      { sign: 'poissons', r: rp, ph: 0 },
      { sign: 'lion', r: rl, ph: 2.1 }
    ];
    for (var i = 0; i < creatures.length; i++) {
      var c = creatures[i];
      var bob = Math.sin(now / 450 + c.ph) * H * 0.006 * (1 - u);
      var px = c.r.cx + (mid.cx - c.r.cx) * u;
      var py = c.r.cy + (mid.cy - c.r.cy) * u + bob;
      var w = c.r.tw * 1.6 * (1 + 0.15 * u);
      var a = S.fade * (1 - m);
      drawGlow(ctx, px, py, w * 0.85, GLOW[c.sign], a * (0.55 + 0.45 * u));
      drawVid(ctx, S.vids[c.sign], px, py, w, a);
    }

    // L'animal fusionné, au centre.
    if (m > 0) {
      var ma = S.fade * m;
      drawGlow(ctx, mid.cx, mid.cy, mid.tw * 1.5, 'rgba(255,180,90,', ma);
      var drawn = false;
      if (S.mergeVidReady) {
        drawn = drawVid(ctx, S.mergeVid, mid.cx, mid.cy, mid.tw * 2.3, ma);
      }
      if (!drawn && S.mergeImgReady && S.mergeImg) {
        var iw = mid.tw * 2.0 * (1 + 0.03 * Math.sin(now / 600));
        var ih = iw * (S.mergeImg.height / S.mergeImg.width);
        ctx.save();
        ctx.globalAlpha = ma;
        ctx.drawImage(S.mergeImg, mid.cx - iw / 2, mid.cy - ih / 2 + Math.sin(now / 700) * H * 0.004, iw, ih);
        ctx.restore();
        drawn = true;
      }
      if (!drawn) {
        // Dernier repli : les deux créatures superposées en lumière.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        drawVid(ctx, S.vids.poissons, mid.cx, mid.cy, mid.tw * 1.7, ma * 0.9);
        drawVid(ctx, S.vids.lion, mid.cx, mid.cy, mid.tw * 1.7, ma * 0.9);
        ctx.restore();
      }
    }
  }

  function startLoop() {
    if (S.raf) return;
    S.last = 0;
    S.raf = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
    if (S.ctx && S.canvas) S.ctx.clearRect(0, 0, S.w, S.h);
    Object.keys(S.vids).forEach(function (k) { try { S.vids[k].pause(); } catch (e) {} });
    if (S.mergeVid) { try { S.mergeVid.pause(); } catch (e) {} }
  }

  window.addEventListener('astrocode:fusion-start', function (ev) {
    try {
      S.targetMode = !!(ev && ev.detail && ev.detail.target);
      if (!ensureCanvas()) return;
      resize();
      startMedia();
      Object.keys(S.vids).forEach(function (k) {
        var p = S.vids[k].play();
        if (p && p.catch) p.catch(function () {});
      });
      if (S.mergeVid) {
        try { S.mergeVid.currentTime = 0; } catch (e) {}
        var p2 = S.mergeVid.play(); if (p2 && p2.catch) p2.catch(function () {});
      }
      // v1.9.85 — LE SON DE LA FUSION (fichier d'Hamza, coupé à 7 s
      // avec le fondu sortant DANS le fichier : la durée de sa vidéo).
      var sting = ensureSting();
      if (sting) {
        try { sting.currentTime = 0; } catch (e) {}
        var p3 = sting.play(); if (p3 && p3.catch) p3.catch(function () {});
      }
      S.on = true;
      S.t0 = performance.now();
      S.rects = {};
      startLoop();
      // v1.9.87 — capture auto RETIRÉE (verdict d'Hamza : « ça capte
      // n'importe quoi »). La fusion ne range plus rien toute seule.
      console.log('[FUSION] les deux signes sont là — la rencontre commence.');
    } catch (e) { console.warn('[FUSION] démarrage impossible :', e); }
  });

  window.addEventListener('astrocode:fusion-end', function () {
    S.on = false;   // la boucle s'éteint en fondu puis s'arrête seule
    S.targetMode = false;
    S.lastTargetRect = null;
    if (S.sting) { try { S.sting.pause(); S.sting.currentTime = 0; } catch (e) {} }
  });

  /* v1.9.85 — le son de la fusion, créé paresseusement et AMORCÉ en
     silence au premier toucher (politique audio des navigateurs :
     sans geste préalable, la lecture au moment de la détection
     serait bloquée). */
  function ensureSting() {
    if (!S.sting) {
      try { S.sting = new Audio('assets/audio/fusion-sting.mp3'); S.sting.preload = 'auto'; } catch (e) { return null; }
    }
    return S.sting;
  }
  window.addEventListener('pointerdown', function primeSting() {
    window.removeEventListener('pointerdown', primeSting);
    var a = ensureSting();
    if (!a) return;
    try {
      a.muted = true;
      var p = a.play();
      if (p && p.then) p.then(function () {
        try { a.pause(); a.currentTime = 0; a.muted = false; } catch (e) {}
      }).catch(function () { a.muted = false; });
    } catch (e) {}
  });

  window.FUSION = {
    isOn: function () { return S.on; },
    diag: function () {
      return {
        on: S.on, fade: +S.fade.toFixed(2),
        mergeVideo: S.mergeVidReady, mergeImage: S.mergeImgReady,
        signes: Object.keys(S.rects)
      };
    }
  };
})();
