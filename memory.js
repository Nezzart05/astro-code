/* ============================================================================
   MEMORY.JS — « ✦ MEMORY · Immortalize the moment » — v1.9.15
   ----------------------------------------------------------------------------
   Pendant un scan, un tap sur le bouton MEMORY fige le moment : on capture
   l'image composée (caméra + révélation, exactement ce que l'écran montre),
   on l'envoie à Muse Image (Meta AI) avec LA RECETTE FIGÉE (validée par
   Hamza le 27 oct 2026, test v4 « le scan figé ») :

     visage et mains RÉELS · tout le reste illustré plat EN COULEURS ·
     la créature du signe, coloriée, vivante, en orbite autour de la
     personne · le monde doodle du signe qui jaillit derrière (éléments +
     icônes sociales) · le lieu reste reconnaissable, redessiné plat.

   v1.9.16 — la création part EN ARRIÈRE-PLAN (aucun voile sur le scan,
   juste un toast) et l'affiche se range dans l'écran dédié « MY
   MEMORIES » (localStorage de l'appareil), où on la rouvre pour la
   partager ou la télécharger.

   Coût : 0,01 $ par souvenir (Muse Image, via le proxy Netlify — la clé
   ne quitte jamais le serveur). Aucun réglage côté utilisateur : la
   recette est la même à chaque fois, seuls le signe et son monde changent.
   ============================================================================ */
(function () {
  'use strict';

  var LS_KEY = 'astrocode_memories_v1';
  var MAX_STORED = 12;
  var state = { busy: false, lastSign: null, pending: null };

  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------------ */
  /* La recette figée (v4) — créature et monde par signe                 */
  /* ------------------------------------------------------------------ */
  var CREATURES = {
    belier: 'a bold ram with great curved horns, in warm reds and oranges',
    taureau: 'a powerful bull with wide horns, in warm ambers and greens',
    gemeaux: 'two playful twin figures dancing around each other, in sky blues and sunny yellows',
    cancer: 'a great crab with big rounded claws, in coral reds and turquoise',
    lion: 'a majestic lion with a huge flowing mane, in golds and oranges',
    vierge: 'a graceful maiden with long flowing hair, in soft greens and golds',
    balance: 'a pair of golden scales held in perfect balance, in lavenders and sky blues',
    scorpion: 'a striking scorpion with a great curved tail, in deep reds and blacks with turquoise sparks',
    sagittaire: 'an archer drawing a great bow, in oranges and crimsons',
    capricorne: 'a mountain goat with great curved horns, in bronze and deep greens',
    verseau: 'a figure pouring a great jug of sparkling water, in electric blues and lavenders',
    poissons: 'the two koi fish, one turquoise and one coral pink',
  };
  var WORLDS = {
    eau: 'ocean waves, algae, coral, shells, bubbles, little fish, stars, hearts',
    feu: 'flames, embers, suns, lightning bolts, sparks, stars, hearts',
    terre: 'mountains, leaves, crystals, flowers, pebbles, stars, hearts',
    air: 'clouds, wind swirls, feathers, crescent moons, stars, hearts',
  };
  var SIGN_ELEMENT = {
    belier: 'feu', lion: 'feu', sagittaire: 'feu',
    taureau: 'terre', vierge: 'terre', capricorne: 'terre',
    gemeaux: 'air', balance: 'air', verseau: 'air',
    cancer: 'eau', scorpion: 'eau', poissons: 'eau',
  };
  var SIGN_EN = {
    belier: 'Aries', taureau: 'Taurus', gemeaux: 'Gemini', cancer: 'Cancer',
    lion: 'Leo', vierge: 'Virgo', balance: 'Libra', scorpion: 'Scorpio',
    sagittaire: 'Sagittarius', capricorne: 'Capricorn', verseau: 'Aquarius',
    poissons: 'Pisces',
    fusion: 'FUSION · Pisces × Leo',
  };

  function buildPrompt(signId) {
    var creature = CREATURES[signId] || CREATURES.poissons;
    var world = WORLDS[SIGN_ELEMENT[signId] || 'eau'];
    return (
      'Create a bold flat 2D illustrated souvenir poster from this photo, as if an AR scan ' +
      'came to life and froze. The person\'s FACE and HANDS stay fully photorealistic and ' +
      'untouched. Everything else becomes vibrant flat 2D streetwear illustration, rich in ' +
      'COLOR everywhere (no grayscale, no dull tones). The clothing is drawn with cel ' +
      'shading: even a dark garment gets rich colored shadows and warm highlights so the ' +
      'illustration reads clearly. The artwork printed on the garment comes ALIVE: ' +
      creature + ', fully COLORED, large and joyful, swimming or floating in an orbit ' +
      'around the person. Behind the person bursts the doodle world of the scan, drawn ' +
      'flat and colorful and dense: ' + world + ', and cute social media doodle icons ' +
      '(a camera, a play button, a chat bubble, a music note), framing the person like ' +
      'a living poster. The real setting stays recognizable underneath, redrawn flat. ' +
      'No text, no letters, no logos, no watermark.'
    );
  }

  /* ------------------------------------------------------------------ */
  /* Capture : le canvas composé de la révélation, sinon la caméra       */
  /* ------------------------------------------------------------------ */
  function grabCanvas() {
    return new Promise(function (resolve) {
      var cvs = $('reveal2d-canvas');
      var recording = window.RECORD_SHARE && window.RECORD_SHARE.isRecording();
      if (cvs && cvs.width > 10 && window.REVEAL_2D) {
        // En mode enregistrement, le canvas compose AUSSI la caméra :
        // on active ce mode le temps d'une frame (sauf si un REC tourne).
        var wasRecording = !!recording;
        if (!wasRecording) { try { window.REVEAL_2D.setRecording(true); } catch (e) {} }
        setTimeout(function () {
          if (!wasRecording) { try { window.REVEAL_2D.setRecording(false); } catch (e) {} }
          resolve(cvs);
        }, 180);
        return;
      }
      // Repli : l'image brute de la caméra MindAR.
      var vids = document.querySelectorAll('#ar-container video');
      var v = null;
      for (var i = 0; i < vids.length; i++) { if (vids[i].readyState >= 2 && vids[i].videoWidth > 10) { v = vids[i]; break; } }
      if (!v) { resolve(null); return; }
      var c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      resolve(c);
    });
  }

  function canvasToDataUrl(cvs) {
    var MAX = 1024;
    var w = cvs.width, h = cvs.height;
    var scale = Math.min(1, MAX / Math.max(w, h));
    var out = document.createElement('canvas');
    out.width = Math.round(w * scale); out.height = Math.round(h * scale);
    out.getContext('2d').drawImage(cvs, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.85);
  }

  /* ------------------------------------------------------------------ */
  /* Stockage local des souvenirs                                        */
  /* ------------------------------------------------------------------ */
  function loadMemories() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveMemory(entry) {
    var list = loadMemories();
    list.unshift(entry);
    list = list.slice(0, MAX_STORED);
    for (;;) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(list)); return; }
      catch (e) {
        if (list.length <= 1) return; // plus de place : on garde le souvenir affiché, sans stockage
        list.pop();
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Interface : voile de travail, panneau résultat, toast               */
  /* ------------------------------------------------------------------ */
  function toast(msg) {
    var f = $('flash');
    if (!f) return;
    f.textContent = msg;
    f.classList.add('show');
    clearTimeout(f._t);
    f._t = setTimeout(function () { f.classList.remove('show'); }, 3000);
  }

  /* v1.9.16 — PLUS AUCUN VOILE : la création part en arrière-plan et ne
     cache jamais le spectacle du scan (demande d'Hamza : le REC et le
     spectacle restent rois). Seuls de petits toasts informent. */

  function showPanel(entry) {
    state.pending = entry;
    var p = $('memory-panel');
    if (!p) {
      p = document.createElement('div');
      p.id = 'memory-panel';
      p.style.cssText = 'position:fixed;inset:0;z-index:81;display:none;flex-direction:column;' +
        'align-items:center;justify-content:center;gap:12px;background:rgba(8,9,20,.88);' +
        'padding:20px;box-sizing:border-box;';
      p.innerHTML =
        // v1.9.88 — barre du haut (réglage d'Hamza) : ⬇ télécharger à
        // gauche, ✕ fermer à droite, le titre au centre. En bas, il ne
        // reste que DEUX boutons : Post to Feed (orange) et Share
        // externally (mauve).
        '<div style="display:flex;align-items:center;justify-content:space-between;width:min(92vw,430px)">' +
        '<button type="button" data-act="dl" aria-label="Download this memory" style="width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.06);color:#fff;font-size:17px;cursor:pointer">⬇</button>' +
        '<div style="color:#fff;font:600 15px system-ui,sans-serif;letter-spacing:.06em">✦ MY MEMORY</div>' +
        '<button type="button" data-act="x" aria-label="Close" style="width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.06);color:#fff;font-size:15px;cursor:pointer">✕</button>' +
        '</div>' +
        '<img id="memory-img" alt="My Astro Code memory" style="max-width:min(92vw,430px);max-height:62vh;' +
        'border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.55)">' +
        '<div id="memory-cap" style="color:rgba(255,255,255,.8);font:500 13px system-ui,sans-serif"></div>' +
        '<div id="memory-composer" style="display:none;width:min(92vw,430px);gap:8px;align-items:center">' +
        '<input id="memory-caption" type="text" maxlength="140" placeholder="A few words for your post… (optional)" ' +
        'style="flex:1;min-width:0;border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:11px 16px;' +
        'background:rgba(255,255,255,.08);color:#fff;font:500 14px system-ui,sans-serif;outline:none">' +
        '<button type="button" data-act="post-go" style="border:0;border-radius:999px;padding:11px 18px;flex:none;' +
        'background:linear-gradient(160deg,#ff8a2a,#fd7d02);color:#fff;font:700 14px system-ui,sans-serif;cursor:pointer">Post ✦</button>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">' +
        '<button type="button" data-act="post" style="border:0;border-radius:999px;padding:11px 20px;' +
        'background:linear-gradient(160deg,#ff8a2a,#fd7d02);color:#fff;font:700 14px system-ui,sans-serif;cursor:pointer">Post to Feed</button>' +
        '<button type="button" data-act="share" style="border:0;border-radius:999px;padding:11px 20px;' +
        'background:linear-gradient(160deg,#9d6bff,#7c3aed);color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer">Share externally</button>' +
        '</div>';
      p.addEventListener('click', function (ev) {
        var act = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-act');
        if (!act || !state.pending) return;
        if (act === 'share') shareMemory(state.pending);
        else if (act === 'dl') { downloadMemory(state.pending); }
        else if (act === 'x') { p.style.display = 'none'; }
        else if (act === 'post') {
          // v1.9.56 — le compositeur de légende s'ouvre dans le panneau.
          var comp = $('memory-composer');
          if (comp) {
            comp.style.display = 'flex';
            var inp = $('memory-caption');
            if (inp) setTimeout(function () { inp.focus(); }, 60);
          }
        }
        else if (act === 'post-go') {
          // v1.9.56 — publication dans le Fil (feed.js), puis on va VOIR
          // le post en tête du fil.
          var capEl = $('memory-caption');
          var cap = capEl ? capEl.value.trim() : '';
          // v1.9.57 — on poste la RÉFÉRENCE du souvenir (son
          // horodatage), pas une copie de l'image : la v1.9.56
          // saturait le stockage local et le post échouait.
          if (window.FEED && window.FEED.addPost({ ref: state.pending.at, sign: state.pending.sign, caption: cap })) {
            toast('Posted to your Feed ✦');
            p.style.display = 'none';
            goToScreen('screen-feed');
          } else {
            toast('Could not post — storage is full. Delete a memory first.');
          }
        }
      });
      document.body.appendChild(p);
    }
    var compReset = $('memory-composer');
    if (compReset) compReset.style.display = 'none';
    var capReset = $('memory-caption');
    if (capReset) capReset.value = '';
    $('memory-img').src = entry.img;
    $('memory-cap').textContent = (SIGN_EN[entry.sign] || 'Astro Code') + ' · ' +
      new Date(entry.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' · Immortalized by Meta AI';
    p.style.display = 'flex';
  }

  function hidePanel() { var p = $('memory-panel'); if (p) p.style.display = 'none'; }

  function dataUrlToFile(dataUrl, filename) {
    return fetch(dataUrl).then(function (r) { return r.blob(); })
      .then(function (b) { try { return new File([b], filename, { type: b.type || 'image/png' }); } catch (e) { return null; } });
  }

  function shareMemory(entry) {
    var caption = 'My Astro Code moment, immortalized by Meta AI ✦ #AstroCode #Streetwear #AR';
    dataUrlToFile(entry.img, 'astro-code-memory.png').then(function (file) {
      if (file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], text: caption, title: 'Astro Code — Memory' })
          .catch(function (err) { if (err && err.name !== 'AbortError') toast('Sharing was blocked — use Download.'); });
      } else {
        toast('File sharing is not supported here — use Download.');
      }
    });
  }

  function downloadMemory(entry) {
    var a = document.createElement('a');
    a.href = entry.img; a.download = 'astro-code-memory.png';
    document.body.appendChild(a); a.click(); a.remove();
    toast('Memory saved to your downloads.');
  }

  /* ------------------------------------------------------------------ */
  /* Le geste principal                                                  */
  /* ------------------------------------------------------------------ */
  function createMemory() {
    if (state.busy) return;
    var signId = state.lastSign || window.ASTRO_OWN_SIGN || 'poissons';
    state.busy = true;
    setBtnBusy(true);
    // v1.9.16 — arrière-plan total : on capture le moment, on prévient
    // d'un petit texte, et le spectacle continue. Le souvenir se range
    // tout seul dans l'écran My Memories.
    toast('✦ Creating your memory — you\'ll find it in My Memories.');
    grabCanvas().then(function (cvs) {
      if (!cvs) throw new Error('no-frame');
      var dataUrl = canvasToDataUrl(cvs);
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 120000);
      // META_AI.callApi ne prend pas de signal : on borne l'attente ici.
      return Promise.race([
        window.META_AI.callApi('/v1/images/edits', {
          model: 'muse-image-1.0',
          prompt: buildPrompt(signId),
          images: [{ image_url: dataUrl }],
          n: 1,
        }),
        new Promise(function (_, rej) { ctrl.signal.addEventListener('abort', function () { rej(new Error('timeout')); }); }),
      ]).then(function (data) { clearTimeout(timer); return data; });
    }).then(function (data) {
      var item = data && data.data && data.data[0];
      var b64 = item && item.b64_json;
      if (!b64 && item && item.url) { // repli : l'API renvoie une URL
        state.busy = false; setBtnBusy(false);
        saveMemory({ sign: signId, at: Date.now(), img: item.url });
        render();
        window.dispatchEvent(new CustomEvent('astrocode:memory-ready'));   // v1.9.54 — notification jaune sur « My memories »
        toast('✦ Your memory is ready — it\'s waiting in My Memories.');
        return;
      }
      if (!b64) throw new Error('bad-response');
      var mime = b64.indexOf('UklGR') === 0 ? 'image/webp' : (b64.indexOf('/9j/') === 0 ? 'image/jpeg' : 'image/png');
      saveMemory({ sign: signId, at: Date.now(), img: 'data:' + mime + ';base64,' + b64 });
      state.busy = false; setBtnBusy(false);
      render();
      window.dispatchEvent(new CustomEvent('astrocode:memory-ready'));   // v1.9.54 — notification jaune sur « My memories »
      toast('✦ Your memory is ready — it\'s waiting in My Memories.');
    }).catch(function (err) {
      state.busy = false; setBtnBusy(false);
      console.warn('[MEMORY]', err);
      toast(err && err.message === 'no-frame'
        ? 'No camera image yet — let the scan settle, then tap Memory.'
        : 'The memory could not be created — try again in a moment.');
    });
  }

  function setBtnBusy(on) {
    var btn = $('btn-memory');
    if (!btn) return;
    btn.classList.toggle('busy', on);
    btn.disabled = !!on;
  }

  /* ------------------------------------------------------------------ */
  /* Galerie « MY MEMORIES » (écran Collection)                          */
  /* ------------------------------------------------------------------ */
  function render() {
    var grid = $('memories-grid');
    if (!grid) return;
    var empty = $('memories-empty');
    var list = loadMemories();
    grid.innerHTML = '';
    if (empty) empty.style.display = list.length ? 'none' : '';
    list.forEach(function (entry) {
      var d = document.createElement('div');
      d.className = 'memory-thumb';
      d.innerHTML = '<img alt="" src="' + entry.img + '"><span>' + (SIGN_EN[entry.sign] || '') + '</span>';
      d.addEventListener('click', function () { showPanel(entry); });
      grid.appendChild(d);
    });
  }

  function goToScreen(name) {
    var b = document.querySelector('#bottom-nav [data-screen="' + name + '"]');
    if (b) b.click();
  }

  /* ------------------------------------------------------------------ */
  /* Branchements                                                        */
  /* ------------------------------------------------------------------ */
  window.addEventListener('astrocode:target-found', function (e) {
    var id = e.detail && e.detail.signId;
    if (id) state.lastSign = id;
  });

  document.addEventListener('DOMContentLoaded', function () {
    var btn = $('btn-memory');
    if (btn) btn.addEventListener('click', createMemory);
    var back = $('btn-memories-back');
    if (back) back.addEventListener('click', function () { goToScreen('screen-scan'); });
    render();
  });

  /* v1.9.86 — rangement automatique d'un souvenir (la Rencontre s'en
     sert : la fusion se photographie toute seule, sans bouton). */
  function addAuto(entry) {
    saveMemory(entry);
    render();
    window.dispatchEvent(new CustomEvent('astrocode:memory-ready'));
  }

  window.MEMORY_FEATURE = { create: createMemory, render: render, promptFor: buildPrompt, addAuto: addAuto };
})();
