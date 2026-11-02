/* =====================================================================
   ESSAYAGE VOCAL — « Dis-le, porte-le » (v1.9.59, idée d'Hamza, 30 oct)
   ---------------------------------------------------------------------
   En mode invité : l'utilisateur se filme 5 secondes en PARLANT
   (« Black lion on a red hoodie »). La chaîne Meta AI fait le reste :
     1. Voice Transcribe comprend signe + couleurs ;
     2. SAM 3.1 segmente la personne sur des frames clés → zone torse ;
     3. Muse Image génère LE hoodie (couleur, signe imprimé, ASTRO CODE) ;
     4. le hoodie détouré suit la zone sur toutes les frames → vidéo.
   Chaque étape échoue en douceur : sans voix, les listes de choix
   (signe / couleurs) prennent le relais — la démo ne bloque jamais.
   ===================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var SIGNS = [
    { id: 'belier', en: 'Aries', animal: 'ram' },
    { id: 'taureau', en: 'Taurus', animal: 'bull' },
    { id: 'gemeaux', en: 'Gemini', animal: 'twin brothers' },
    { id: 'cancer', en: 'Cancer', animal: 'crab' },
    { id: 'lion', en: 'Leo', animal: 'lion' },
    { id: 'vierge', en: 'Virgo', animal: 'maiden' },
    { id: 'balance', en: 'Libra', animal: 'scales' },
    { id: 'scorpion', en: 'Scorpio', animal: 'scorpion' },
    { id: 'sagittaire', en: 'Sagittarius', animal: 'archer centaur' },
    { id: 'capricorne', en: 'Capricorn', animal: 'goat' },
    { id: 'verseau', en: 'Aquarius', animal: 'water bearer' },
    { id: 'poissons', en: 'Pisces', animal: 'two koi fish' },
  ];
  var COLORS = ['black', 'white', 'red', 'blue', 'orange', 'grey', 'pink', 'green', 'purple', 'yellow'];
  var FR_WORDS = {
    lion: 'Leo', poissons: 'Pisces', poisson: 'Pisces', 'bélier': 'Aries', belier: 'Aries',
    taureau: 'Taurus', 'gémeaux': 'Gemini', gemeaux: 'Gemini', cancer: 'Cancer',
    vierge: 'Virgo', balance: 'Libra', scorpion: 'Scorpio', sagittaire: 'Sagittarius',
    capricorne: 'Capricorn', verseau: 'Aquarius',
    rouge: 'red', noir: 'black', noire: 'black', blanc: 'white', blanche: 'white',
    bleu: 'blue', bleue: 'blue', gris: 'grey', grise: 'grey', rose: 'pink',
    vert: 'green', verte: 'green', violet: 'purple', violette: 'purple', jaune: 'yellow',
  };
  var REC_MS = 5000, OUT_FPS = 8, KEY_EVERY = 4;   // 40 frames, 10 clés

  var S = {
    stream: null, recorder: null, chunks: [], busy: false,
    frames: [],           // canvases 480 px des frames de sortie
    picks: { sign: 'lion', print: 'black', hoodie: 'red' },
    resultUrl: null,
  };

  /* ---------------- utilitaires ---------------- */
  function setStep(name, state) {
    var el = document.querySelector('.to-step[data-step="' + name + '"]');
    if (el) el.className = 'to-step' + (state ? ' ' + state : '');
  }
  function setError(msg) {
    var e = $('to-error');
    e.textContent = msg || '';
    e.style.display = msg ? 'block' : 'none';
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function blobToDataUrl(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }

  /* ---------------- caméra ---------------- */
  async function startCamera() {
    if (S.stream || S.busy) return;
    try {
      S.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 } }, audio: true,
      });
      $('to-preview').srcObject = S.stream;
      await $('to-preview').play().catch(function () { /* lecture auto différée */ });
    } catch (e) {
      setError('Camera unavailable — allow camera and microphone access, then come back.');
    }
  }
  function stopCamera() {
    if (S.stream) { S.stream.getTracks().forEach(function (t) { t.stop(); }); S.stream = null; }
    var p = $('to-preview');
    if (p) p.srcObject = null;
  }

  /* ---------------- enregistrement 5 s ---------------- */
  function pickMime() {
    var list = ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];
    for (var i = 0; i < list.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(list[i])) return list[i];
    }
    return '';
  }
  async function record() {
    if (S.busy) return;
    setError('');
    if (!S.stream) { await startCamera(); if (!S.stream) return; }
    var preview = $('to-preview');
    // Préparer les listes de choix (filet de sécurité + corrections).
    $('to-picks').style.display = 'flex';
    ['voice', 'sam', 'gen', 'mix'].forEach(function (n) { setStep(n, ''); });

    S.frames = [];
    S.chunks = [];
    var grab = document.createElement('canvas');
    var grabTimer = null;
    try {
      S.recorder = new MediaRecorder(S.stream, { mimeType: pickMime() || undefined });
    } catch (e) {
      setError('Recording is not supported on this browser.');
      return;
    }
    S.recorder.ondataavailable = function (ev) { if (ev.data && ev.data.size) S.chunks.push(ev.data); };
    var stopped = new Promise(function (res) { S.recorder.onstop = res; });

    S.busy = true;
    $('btn-to-record').style.display = 'none';
    var count = $('to-count');
    count.style.display = 'flex';
    S.recorder.start(250);
    // Grappiller les frames de sortie PENDANT l'enregistrement (le flux
    // brut n'est pas miroir : le texte du hoodie restera lisible).
    var t0 = performance.now();
    grabTimer = setInterval(function () {
      if (!preview.videoWidth) return;
      var w = 480, h = Math.round(480 * preview.videoHeight / preview.videoWidth);
      grab.width = w; grab.height = h;
      grab.getContext('2d').drawImage(preview, 0, 0, w, h);
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(grab, 0, 0);
      S.frames.push(c);
      var left = Math.ceil((REC_MS - (performance.now() - t0)) / 1000);
      count.textContent = Math.max(1, left);
    }, 1000 / OUT_FPS);
    await sleep(REC_MS);
    clearInterval(grabTimer);
    count.style.display = 'none';
    try { S.recorder.stop(); } catch (e) { /* déjà arrêté */ }
    await stopped;
    var blob = new Blob(S.chunks, { type: S.recorder.mimeType || 'video/webm' });
    await process(blob);
    S.busy = false;
    $('btn-to-again').style.display = 'block';
  }

  /* ---------------- 1. la voix → signe + couleurs ---------------- */
  function wavEncode(samples, rate) {
    var buf = new ArrayBuffer(44 + samples.length * 2);
    var v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true);
    v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples.length * 2, true);
    for (var i = 0; i < samples.length; i++) {
      var x = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7FFF, true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  }
  async function transcribe(blob) {
    var AC = window.AudioContext || window.webkitAudioContext;
    var ac = new AC();
    var buf = await ac.decodeAudioData(await blob.arrayBuffer());
    var off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * 16000)), 16000);
    var src = off.createBufferSource();
    src.buffer = buf; src.connect(off.destination); src.start();
    var rendered = await off.startRendering();
    var wav = wavEncode(rendered.getChannelData(0), 16000);
    var dataUrl = await blobToDataUrl(wav);
    var res = await window.META_AI.callApi('/v1/asr/transcribe', {
      audio_b64: dataUrl.split(',')[1], filename: 'voice.wav',
    }, 45000);
    if (!res || res.error) throw new Error('transcribe');
    // La forme exacte de la réponse n'est pas figée : on cherche le texte.
    var text = res.transcript || res.text || res.output_text || '';
    if (!text && res.results && res.results[0]) {
      var alt = res.results[0].alternatives && res.results[0].alternatives[0];
      text = (alt && alt.transcript) || res.results[0].transcript || '';
    }
    if (!text && Array.isArray(res.output)) {
      res.output.forEach(function (o) {
        (o.content || []).forEach(function (c) { if (c.text) text += c.text; });
      });
    }
    return String(text || '').trim();
  }
  function scanWords(text) {
    // Filet lexical FR + EN : le signe, puis les couleurs DANS L'ORDRE
    // (« lion noir sur hoodie rouge », « black lion on a red hoodie »).
    var found = { sign: null, colors: [] };
    var words = String(text || '').toLowerCase().replace(/[^a-zàâäéèêëîïôöùûüç' -]/g, ' ').split(/\s+/);
    words.forEach(function (w) {
      var en = FR_WORDS[w] || null;
      var asSign = SIGNS.find(function (s) { return s.en.toLowerCase() === (en || w); });
      if (asSign && !found.sign) found.sign = asSign.id;
      var asColor = COLORS.indexOf(en || w) >= 0 ? (en || w) : null;
      if (asColor && found.colors.indexOf(asColor) < 0) found.colors.push(asColor);
    });
    return found;
  }
  async function parseCommand(text) {
    var picks = { sign: null, print: null, hoodie: null };
    if (text && window.META_AI) {
      try {
        var res = await window.META_AI.callApi('/v1/chat/completions', {
          model: 'muse-spark-1.3', max_tokens: 120,
          messages: [{ role: 'user', content:
            'From this spoken clothing request, reply with JSON only, no prose: ' +
            '{"sign":"Leo","print":"black","hoodie":"red"}. ' +
            'Sign = zodiac name in English. Colors only from: ' + COLORS.join(' ') + '. ' +
            '"X <sign> on a Y hoodie" means print color X and hoodie color Y. ' +
            'If only one color is given, it is the hoodie color and print is "white". ' +
            'Request: "' + text.replace(/"/g, "'") + '"' }],
        }, 20000);
        var raw = res.choices[0].message.content;
        var j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
        var sg = SIGNS.find(function (s) { return s.en.toLowerCase() === String(j.sign || '').toLowerCase(); });
        if (sg) picks.sign = sg.id;
        if (COLORS.indexOf(String(j.print || '').toLowerCase()) >= 0) picks.print = String(j.print).toLowerCase();
        if (COLORS.indexOf(String(j.hoodie || '').toLowerCase()) >= 0) picks.hoodie = String(j.hoodie).toLowerCase();
      } catch (e) { /* le filet lexical prend le relais */ }
    }
    var scan = scanWords(text);
    if (!picks.sign) picks.sign = scan.sign;
    if (!picks.print && scan.colors.length >= 2) picks.print = scan.colors[0];
    if (!picks.hoodie && scan.colors.length >= 2) picks.hoodie = scan.colors[1];
    if (!picks.hoodie && scan.colors.length === 1) picks.hoodie = scan.colors[0];
    if (!picks.print && picks.hoodie) picks.print = 'white';
    return picks;
  }
  function applyPicks(p) {
    if (p.sign) S.picks.sign = p.sign;
    if (p.print) S.picks.print = p.print;
    if (p.hoodie) S.picks.hoodie = p.hoodie;
    $('to-sign').value = S.picks.sign;
    $('to-print').value = S.picks.print;
    $('to-hoodie').value = S.picks.hoodie;
  }

  /* ---------------- 2. SAM → la zone du torse ---------------- */
  function samBody(dataUrl) {
    return {
      model: 'sam-3.1',
      input: [{ type: 'message', role: 'user', content: [
        { type: 'input_text', text: 'person' },
        { type: 'input_image', image_url: dataUrl },
      ] }],
      metadata: { mask_encoding: 'one_bit' },
    };
  }
  function torsoFromMask(seg, srcW, srcH) {
    if (!seg || !seg.data) return null;
    var ox = seg.left || 0, oy = seg.top || 0;
    var minx = 1e9, miny = 1e9, maxx = -1, maxy = -1, n = 0;
    for (var y = 0; y < seg.h; y++) {
      for (var x = 0; x < seg.w; x++) {
        if (seg.data[y * seg.w + x]) {
          n++;
          if (x < minx) minx = x; if (x > maxx) maxx = x;
          if (y < miny) miny = y; if (y > maxy) maxy = y;
        }
      }
    }
    if (n < 200 || maxx < 0) return null;
    var bx0 = (ox + minx) / srcW, bx1 = (ox + maxx) / srcW;
    var by0 = (oy + miny) / srcH, by1 = (oy + maxy) / srcH;
    var ph = by1 - by0;
    if (ph < 0.15) return null;
    // Le vêtement : des épaules (14 % sous le haut de la personne)
    // aux hanches (74 %), presque toute la largeur du buste.
    return {
      cx: (bx0 + bx1) / 2,
      top: by0 + ph * 0.14,
      w: (bx1 - bx0) * 0.96,
      h: ph * 0.60,
      pw: bx1 - bx0,   // largeur totale de la personne (pour l'échelle)
      pTop: by0,       // haut de la personne (pour recoller la tête)
      pH: ph,          // hauteur totale de la personne
    };
  }
  // v1.9.60 — L'overlay « tête » d'une frame clé : la frame d'origine
  // vue à travers le masque personne, coupée sous le cou (~30 % de la
  // hauteur). Recollé PAR-DESSUS le hoodie, il met la capuche DERRIÈRE
  // la tête — c'est ce qui fait « porté » plutôt que « collé ».
  function headOverlay(frame, seg, meas, srcW, srcH) {
    var W = frame.width, H = frame.height;
    var mc = document.createElement('canvas');
    mc.width = seg.w; mc.height = seg.h;
    var mg = mc.getContext('2d');
    var img = mg.createImageData(seg.w, seg.h);
    for (var i = 0; i < seg.data.length; i++) {
      var o = i * 4;
      img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255;
      img.data[o + 3] = seg.data[i] ? 255 : 0;
    }
    mg.putImageData(img, 0, 0);
    var full = document.createElement('canvas');
    full.width = W; full.height = H;
    var fg = full.getContext('2d');
    fg.drawImage(frame, 0, 0);
    fg.globalCompositeOperation = 'destination-in';
    fg.imageSmoothingEnabled = true;
    fg.drawImage(mc, 0, 0, seg.w, seg.h,
      (seg.left || 0) / srcW * W, (seg.top || 0) / srcH * H,
      seg.w / srcW * W, seg.h / srcH * H);
    fg.globalCompositeOperation = 'destination-out';
    var cutY = (meas.pTop + meas.pH * 0.30) * H;
    fg.fillRect(0, cutY, W, H - cutY);
    fg.globalCompositeOperation = 'source-over';
    return full;
  }
  async function samZones(frames) {
    var raw = [];
    var lastGood = null;
    for (var i = 0; i < frames.length; i += KEY_EVERY) {
      var c = frames[i];
      var small = document.createElement('canvas');
      var sw = 448, sh = Math.round(448 * c.height / c.width);
      small.width = sw; small.height = sh;
      small.getContext('2d').drawImage(c, 0, 0, sw, sh);
      var zone = null, head = null;
      try {
        var json = await window.META_AI.callApi('/v1/responses',
          samBody(small.toDataURL('image/jpeg', 0.8)), 20000);
        var seg = await window.SAM31.segmentPerson(json);
        zone = torsoFromMask(seg, sw, sh);
        if (zone) head = headOverlay(c, seg, zone, sw, sh);
      } catch (e) { zone = null; }
      if (zone) lastGood = { zone: zone, head: head };
      raw.push({ at: i, good: zone ? { zone: zone, head: head } : lastGood });
    }
    var keys = raw.filter(function (z) { return z.good; })
      .map(function (z) { return { at: z.at, zone: z.good.zone, head: z.good.head }; });
    if (!keys.length) return null;
    var out = [];
    for (var f = 0; f < frames.length; f++) {
      var a = keys[0], b = keys[keys.length - 1];
      for (var k = 0; k < keys.length; k++) {
        if (keys[k].at <= f) a = keys[k];
        if (keys[k].at >= f) { b = keys[k]; break; }
      }
      var t = (b.at === a.at) ? 0 : (f - a.at) / (b.at - a.at);
      out.push({
        cx: a.zone.cx + (b.zone.cx - a.zone.cx) * t,
        top: a.zone.top + (b.zone.top - a.zone.top) * t,
        w: a.zone.w + (b.zone.w - a.zone.w) * t,
        h: a.zone.h + (b.zone.h - a.zone.h) * t,
        pw: a.zone.pw + (b.zone.pw - a.zone.pw) * t,
      });
    }
    return { zones: out, keys: keys };
  }

  /* ---------- les VRAIS dessins d'Hamza (SVG recolorables) ---------- */
  var PRINT_ART = { lion: 'assets/prints/lion.svg', poissons: 'assets/prints/poissons.svg' };
  var PRINT_HEX = { black: '#141414', white: '#ffffff', red: '#e5322d', blue: '#2b7fff',
    orange: '#ff8a2a', grey: '#8a8f98', pink: '#ff7ac1', green: '#37c978', purple: '#8b5cf6', yellow: '#ffd94d' };
  function tintedImage(svgUrl, mode, printHex) {
    return fetch(svgUrl).then(function (r) { return r.text(); }).then(function (txt) {
      // Dimensions explicites depuis le viewBox (sinon certains
      // navigateurs donnent un naturalWidth de 0 pour un SVG en blob).
      var vb = txt.match(/viewBox="([0-9.\s]+)"/);
      if (vb) {
        var p = vb[1].trim().split(/\s+/);
        txt = txt.replace('<svg', '<svg width="' + p[2] + '" height="' + p[3] + '"');
      }
      txt = txt.replace(/fill="#([0-9a-fA-F]{6})"/g, function (m, hex) {
        if (mode === 'logo') return 'fill="#ffffff"';
        var r = parseInt(hex.slice(0, 2), 16) / 255,
            g = parseInt(hex.slice(2, 4), 16) / 255,
            b = parseInt(hex.slice(4, 6), 16) / 255;
        var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return 'fill="' + (lum > 0.8 ? '#ffffff' : printHex) + '"';
      });
      var url = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' }));
      var img = new Image();
      return new Promise(function (res, rej) {
        img.onload = function () { res(img); };
        img.onerror = rej;
        img.src = url;
      });
    });
  }
  // La disposition d'Hamza (30 oct) : logo PETIT en haut, dessin du
  // signe GRAND au centre — imprimés sur le hoodie détouré.
  async function printArtwork(garment, picks) {
    var g = garment.getContext('2d');
    var GW = garment.width, GH = garment.height;
    var printHex = PRINT_HEX[picks.print] || '#141414';
    if (picks.print === 'white') printHex = '#141414'; // contraste préservé
    var signImg = await tintedImage(PRINT_ART[picks.sign], 'sign', printHex);
    var logoImg = await tintedImage('assets/prints/logo.svg', 'logo', printHex);
    var lw = GW * 0.26, lh = lw * logoImg.naturalHeight / Math.max(1, logoImg.naturalWidth);
    g.drawImage(logoImg, (GW - lw) / 2, GH * 0.13, lw, lh);
    var sw = GW * 0.62, sh = sw * signImg.naturalHeight / Math.max(1, signImg.naturalWidth);
    g.drawImage(signImg, (GW - sw) / 2, GH * 0.30, sw, sh);
    return garment;
  }

  /* ---------------- 3. Muse Image → le hoodie ---------------- */
  function keyOutGarment(img) {
    var c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    var g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    var data = g.getImageData(0, 0, c.width, c.height);
    var d = data.data;
    // La couleur de fond = la moyenne des 4 coins.
    var br = 0, bg = 0, bb = 0, cnt = 0;
    [[0, 0], [c.width - 1, 0], [0, c.height - 1], [c.width - 1, c.height - 1]].forEach(function (p) {
      var i = (p[1] * c.width + p[0]) * 4;
      br += d[i]; bg += d[i + 1]; bb += d[i + 2]; cnt++;
    });
    br /= cnt; bg /= cnt; bb /= cnt;
    var minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
    for (var y = 0; y < c.height; y++) {
      for (var x = 0; x < c.width; x++) {
        var i = (y * c.width + x) * 4;
        var dx = d[i] - br, dy = d[i + 1] - bg, dz = d[i + 2] - bb;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var a = Math.max(0, Math.min(1, (dist - 26) / 90));
        d[i + 3] = Math.round(a * 255);
        // Déborder le vert résiduel sur les bords semi-transparents.
        if (a > 0 && a < 1 && d[i + 1] > d[i] && d[i + 1] > d[i + 2]) d[i + 1] = Math.max(d[i], d[i + 2]);
        if (a > 0.5) {
          if (x < minx) minx = x; if (x > maxx) maxx = x;
          if (y < miny) miny = y; if (y > maxy) maxy = y;
        }
      }
    }
    g.putImageData(data, 0, 0);
    if (maxx < 0) return c;
    var pad = 6;
    minx = Math.max(0, minx - pad); miny = Math.max(0, miny - pad);
    maxx = Math.min(c.width - 1, maxx + pad); maxy = Math.min(c.height - 1, maxy + pad);
    var out = document.createElement('canvas');
    out.width = maxx - minx + 1; out.height = maxy - miny + 1;
    out.getContext('2d').drawImage(c, minx, miny, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }
  async function generateGarment(picks) {
    var sign = SIGNS.find(function (s) { return s.id === picks.sign; }) || SIGNS[4];
    var hasArt = !!PRINT_ART[picks.sign];
    // Avec un vrai dessin SVG : le hoodie généré est UNI et VIDE —
    // l'impression (logo + signe recoloré) est faite par le code,
    // fidèle à l'original. Sans dessin : Muse Image imprime tout.
    var prompt = hasArt
      ? 'Studio product photo of a single completely plain ' + picks.hoodie + ' hoodie sweatshirt, ' +
        'totally blank chest, NO print, NO logo, NO text, NO design, front view, floating flat as if ' +
        'worn by an invisible person, on a solid pure green background, no person, no model, ' +
        'no mannequin, no head, the whole hoodie visible including the hood and both sleeves, ' +
        'flat even lighting, streetwear product photography'
      : 'Studio product photo of a single plain ' + picks.hoodie + ' hoodie sweatshirt, ' +
        'front view, floating flat as if worn by an invisible person, on a solid pure green background, ' +
        'the words ASTRO CODE printed in bold white capital letters across the upper chest, ' +
        'a large ' + picks.print + ' ' + sign.animal + ' emblem printed in the center of the chest, ' +
        'no person, no model, no mannequin, no head, the whole hoodie visible including the hood and both sleeves, ' +
        'flat even lighting, streetwear product photography';
    var res = await window.META_AI.callApi('/v1/images/generations', {
      model: 'muse-image-1.0', prompt: prompt, size: '1024x1024',
    }, 120000);
    var b64 = res && res.data && res.data[0] && res.data[0].b64_json;
    if (!b64) throw new Error('generation vide');
    var img = new Image();
    await new Promise(function (res2, rej) {
      img.onload = res2; img.onerror = rej;
      img.src = 'data:image/png;base64,' + b64;
    });
    var garment = keyOutGarment(img);
    if (hasArt) garment = await printArtwork(garment, picks);
    return garment;
  }

  /* ---------------- 4. habiller la vidéo ---------------- */
  async function dressVideo(frames, sam, garment) {
    var W = frames[0].width, H = frames[0].height;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    var stream = c.captureStream(OUT_FPS);
    var mime = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find(function (mt) {
      return window.MediaRecorder && MediaRecorder.isTypeSupported(mt);
    }) || '';
    var rec = new MediaRecorder(stream, { mimeType: mime || undefined });
    var chunks = [];
    rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
    var done = new Promise(function (res) { rec.onstop = res; });
    rec.start(200);
    var ga = garment.width / garment.height;
    var zones = sam.zones, keys = sam.keys;
    for (var i = 0; i < frames.length; i++) {
      var z = zones[i];
      g.drawImage(frames[i], 0, 0);
      if (z) {
        // v1.9.60 — Échelle par la LARGEUR de la personne (le hoodie la
        // couvre entièrement, manches incluses) et ancrage sur la ligne
        // d'épaules : la capuche (le quart haut de l'image produit)
        // remonte derrière la tête au lieu de la couvrir.
        var gw = z.pw * W * 1.04;
        var gh = gw / ga;
        var gx = z.cx * W - gw / 2;
        var gy = z.top * H - gh * 0.24;
        g.drawImage(garment, gx, gy, gw, gh);
        // Recoller la tête d'origine par-dessus (frame clé la plus
        // proche) : la capuche passe derrière le visage.
        var best = null, bd = 1e9;
        for (var k = 0; k < keys.length; k++) {
          var dd = Math.abs(keys[k].at - i);
          if (dd < bd) { bd = dd; best = keys[k]; }
        }
        if (best && best.head) g.drawImage(best.head, 0, 0);
      }
      await sleep(1000 / OUT_FPS);
    }
    rec.stop();
    await done;
    return new Blob(chunks, { type: rec.mimeType || 'video/webm' });
  }

  /* ---------------- DECART LIVE (v1.9.62) ----------------
     Le miroir temps réel qui a bluffé Hamza au test : le hoodie est
     TOUJOURS fabriqué par notre chaîne Meta (Muse Image + les vrais
     SVG d'Hamza), Decart ne fait que l'habiller en direct. La clé
     reste sur le téléphone (localStorage), jamais dans le code.
     Garde-fou crédits : arrêt automatique à 1 min 30. */
  var D = { client: null, clientObj: null, stream: null, timer: null, startedAt: 0, sdk: null, preset: 0, wasLive: false, voiceOn: false, rec: null, lastVoiceCombo: '', voiceFails: 0, micStream: null, mrec: null, voiceTimer: null, metaFails: 0 };
  // Les hoodies du carrousel = les premiers choix de la rangée
  // (Hamza en enverra d'autres ; un item = une ligne ici).
  var HOODIE_PRESETS = [
    { img: 'assets/hoodies/porteur-lion-rouge-v3.webp', label: 'Leo' },
    { img: 'assets/hoodies/porteur-poissons-koi-v3.webp', label: 'Pisces' },
    { img: 'assets/hoodies/porteur-sagittaire-orange-v3.webp', label: 'Sagittarius' },
    { img: 'assets/hoodies/porteur-scorpion-noir-v3.webp', label: 'Scorpio' },
  ];
  function buildStrip() {
    var el = $('to-strip');
    if (!el) return;
    el.innerHTML = HOODIE_PRESETS.map(function (p, i) {
      return '<button type="button" class="to-thumb' + (i === D.preset ? ' sel' : '') + '" data-i="' + i + '">' +
        '<img src="' + p.img + '" alt=""><span class="lbl">' + p.label + '</span></button>';
    }).join('') +
      '<button type="button" class="to-thumb' + (D.preset === -1 ? ' sel' : '') + '" data-i="-1">' +
      '<span class="gen-box">✦</span><span class="lbl">Yours</span></button>';
    el.querySelectorAll('.to-thumb').forEach(function (b) {
      b.addEventListener('click', function () {
        D.preset = parseInt(b.getAttribute('data-i'), 10);
        buildStrip();
        if (D.client) {
          swapGarment().catch(function (e) {
            setError('Change failed: ' + (e && e.message ? e.message : String(e)));
          });
        }
      });
    });
  }
  // La référence Decart : la photo choisie, ou le hoodie généré
  // (chaîne Meta) pour l'item « Yours ».
  async function presetReference(btn) {
    if (D.preset >= 0) {
      var r = await fetch(HOODIE_PRESETS[D.preset].img);
      return await r.blob();
    }
    if (btn) btn.textContent = '⏳ GENERATING YOUR HOODIE…';
    var picks = { sign: $('to-sign').value, print: $('to-print').value, hoodie: $('to-hoodie').value };
    var garment = await generateGarment(picks);
    return await flattenGarment(garment);
  }
  // (Re)connexion Decart sur le flux courant, avec un vêtement donné.
  async function decartReconnect(refBlob) {
    var client = D.clientObj;
    if (!client || !D.stream || !D.sdk) return;
    try { if (D.client && D.client.disconnect) D.client.disconnect(); } catch (e) { /* silencieux */ }
    try { if (D.client && D.client.close) D.client.close(); } catch (e) { /* silencieux */ }
    D.client = null;
    var rv = $('to-result');
    var connect = function (mdl) {
      return client.realtime.connect(D.stream, {
        model: mdl,
        // v1.9.71 — Le miroir se fait à la SOURCE (consigne officielle
        // Decart pour les selfies) : le flux envoyé est pré-inversé,
        // donc les gestes restent naturels ET le texte du hoodie se
        // lit à l'endroit. On ne retourne plus l'image affichée.
        mirror: true,
        onRemoteStream: function (rs) {
          D.wasLive = true;
          rv.srcObject = rs;
          rv.classList.remove('mirror');
          rv.removeAttribute('controls');
          rv.style.display = 'block';
          $('to-preview').style.display = 'none';
          if (rv.play) rv.play().catch(function () { /* lecture auto */ });
        },
        onError: function (err) {
          setError('Decart: ' + (err && err.message ? err.message : String(err)));
        },
        onDisconnect: function () { /* les fermetures volontaires sont ignorées */ },
        initialState: {
          prompt: { text: DECART_PROMPT, enhance: true },
          image: refBlob,
        },
      });
    };
    try {
      D.client = await connect(D.sdk.models.realtime('lucy-vton-latest'));
    } catch (e1) {
      D.client = await connect(D.sdk.models.realtime('lucy-latest'));
    }
  }
  // v1.9.71 — L'ORDRE natif à Decart (le chaînon qui manquait) :
  // la session ouverte expose set() — on pousse le nouveau vêtement
  // + la consigne DANS la même session, sans raccrocher. Avant, on
  // déconnectait/reconnectait tout, et l'échec mourait en silence.
  var DECART_PROMPT = 'Substitute the current top with the garment in the reference image. Keep the person\'s face, head, hair and the background unchanged.';
  async function decartSetGarment(refBlob) {
    if (D.client && typeof D.client.set === 'function') {
      await D.client.set({ prompt: DECART_PROMPT, enhance: true, image: refBlob });
      return;
    }
    if (D.client && typeof D.client.setImage === 'function') {
      await D.client.setImage(refBlob);
      if (typeof D.client.setPrompt === 'function') await D.client.setPrompt(DECART_PROMPT, { enhance: true });
      return;
    }
    await decartReconnect(refBlob);   // dernier recours seulement
  }
  async function swapGarment() {
    if (!D.clientObj || !D.stream) return;
    var ref = await presetReference(null);
    await decartSetGarment(ref);
  }
  // Changement à la VOIX pendant le direct : la reconnaissance vocale
  // du téléphone (celle de Meta reste bloquée côté API), l'entendement
  // signe/couleurs réutilise le filet lexical, et le nouveau hoodie est
  // régénéré par la chaîne Meta puis poussé à Decart.
  // v1.9.66 — Coupe TOUTE voix de signe en cours : sur l'écran
  // d'essayage, aucun clip pré-enregistré ne doit jamais jouer —
  // le micro sert à ENREGISTRER, pas à écouter les constellations.
  function silenceSignVoice() {
    try {
      if (window.META_AI && META_AI._voiceEl) {
        META_AI._voiceEl.pause();
        META_AI._voiceEl = null;
      }
    } catch (e) { /* pas de voix en cours */ }
  }
  // v1.9.68 — Voix TOUJOURS active pendant le direct (demande
  // d'Hamza : un seul bouton dans l'écran, aucun bouton micro —
  // le toucher déclenchait le jingle du scan). On parle quand on
  // veut ; seules les phrases avec un signe ou une couleur agissent,
  // le reste est ignoré en silence.
  async function applyVoiceText(text) {
    var scan = scanWords(text);
    if (!scan.sign && !scan.colors.length) return;
    if (scan.sign) $('to-sign').value = scan.sign;
    if (scan.colors.length >= 2) {
      $('to-print').value = scan.colors[0];
      $('to-hoodie').value = scan.colors[1];
    } else if (scan.colors.length === 1) {
      $('to-hoodie').value = scan.colors[0];
    }
    var combo = $('to-sign').value + '|' + $('to-print').value + '|' + $('to-hoodie').value;
    if (combo === D.lastVoiceCombo && D.preset === -1) return;
    D.lastVoiceCombo = combo;
    S.picks = { sign: $('to-sign').value, print: $('to-print').value, hoodie: $('to-hoodie').value };
    D.preset = -1;
    buildStrip();
    setError('🎙 "' + text + '" → generating your hoodie…');
    try {
      await swapGarment();
      setError('🎙 Order sent to Decart — watch it change. Keep talking for another.');
    } catch (e) {
      setError('🎙 Change failed: ' + (e && e.message ? e.message : String(e)));
    }
  }
  // v1.9.70 — La voix devient OBSERVABLE : la ligne d'état affiche ce
  // que le téléphone entend, mot pour mot. Avant, une phrase sans mot
  // clé disparaissait en silence et rien ne prouvait que ça écoutait.
  function voiceStatus(msg) {
    var vh = $('to-voice-hint');
    if (vh && D.client) vh.textContent = msg;
  }
  function startVoiceLoop() {
    silenceSignVoice();
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { voiceStatus('🎙 Voice recognition is not available in this browser.'); return; }
    if (D.voiceOn) return;
    D.voiceOn = true;
    D.voiceFails = 0;
    voiceStatus('🎙 Phone voice ON — speak anytime: “en rouge, signe noir”');
    var start = function () {
      if (!D.voiceOn || !D.client) return;
      var bornAt = Date.now();
      var rec = new SR();
      D.rec = rec;
      rec.lang = 'fr-FR';
      rec.continuous = true;
      rec.interimResults = false;
      rec.onresult = function (ev) {
        var res = ev.results[ev.results.length - 1];
        if (res && res[0]) {
          voiceStatus('🎙 Heard: “' + res[0].transcript + '”');
          applyVoiceText(res[0].transcript);
        }
      };
      rec.onerror = function (e) {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          D.voiceOn = false;
          voiceStatus('🎙 Voice blocked — tap the screen once to allow it.');
        }
      };
      rec.onend = function () {
        if (!D.voiceOn || !D.client) return;
        if (Date.now() - bornAt < 250) D.voiceFails++; else D.voiceFails = 0;
        if (D.voiceFails >= 8) {
          D.voiceOn = false;
          voiceStatus('🎙 The speech service is not answering on this phone.');
          return;
        }
        setTimeout(start, 300);
      };
      try { rec.start(); } catch (err) { /* déjà en écoute */ }
    };
    start();
  }
  function stopVoiceLoop() {
    D.voiceOn = false;
    if (D.rec) {
      try { D.rec.stop(); } catch (e) { /* déjà arrêté */ }
      D.rec = null;
    }
  }
  /* ---------------------------------------------------------------- */
  /* v1.9.73 — LA VOIX DU DIRECT PASSE PAR META (choix d'Hamza).      */
  /* Pendant le direct Decart, un micro séparé enregistre des         */
  /* tranches de 3 s ; chacune part à Muse Voice Transcribe via le    */
  /* proxy (recette cookbook prouvée le 30/10) ; le texte revient     */
  /* dans applyVoiceText, comme avant. Le silence n'est pas envoyé    */
  /* (porte d'énergie) : pas de coût, pas de commandes fantômes.      */
  /* En cas d'échec répété, repli automatique sur la voix du          */
  /* téléphone pour ne jamais laisser la démo sans voix.              */
  /* ---------------------------------------------------------------- */
  var META_VOICE_SEG_MS = 3000;
  async function transcribeChunk(blob) {
    var AC = window.AudioContext || window.webkitAudioContext;
    var ac = new AC();
    var buf = await ac.decodeAudioData(await blob.arrayBuffer());
    if (ac.close) ac.close();
    var off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * 16000)), 16000);
    var src = off.createBufferSource();
    src.buffer = buf; src.connect(off.destination); src.start();
    var rendered = await off.startRendering();
    var samples = rendered.getChannelData(0);
    var sum = 0;
    for (var i = 0; i < samples.length; i += 8) sum += samples[i] * samples[i];
    var rms = Math.sqrt(sum / Math.max(1, Math.floor(samples.length / 8)));
    if (rms < 0.004) return '';
    var wav = wavEncode(samples, 16000);
    var dataUrl = await blobToDataUrl(wav);
    var res = await window.META_AI.callApi('/v1/asr/transcribe', {
      audio_b64: dataUrl.split(',')[1], filename: 'voice.wav',
    }, 20000);
    if (!res || res.error) throw new Error(res && res.error ? String(res.error) : 'transcribe failed');
    return res.transcript || res.text || res.output_text || '';
  }
  function startVoiceSystem() {
    silenceSignVoice();
    if (D.voiceOn) return;
    D.voiceOn = true;
    startMetaVoiceLoop();
  }
  async function startMetaVoiceLoop() {
    var SRfallback = function () {
      stopMetaVoice();
      D.voiceOn = false;
      startVoiceLoop();
      voiceStatus('🎙 Meta voice unavailable — phone voice is on.');
    };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') { SRfallback(); return; }
    var stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) { SRfallback(); return; }
    if (!D.voiceOn || !D.client) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      return;
    }
    D.micStream = stream;
    D.metaFails = 0;
    voiceStatus('🎙 Meta AI is listening — speak anytime: “en rouge, signe noir”');
    var mime = '';
    ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].some(function (m) {
      if (MediaRecorder.isTypeSupported(m)) { mime = m; return true; }
      return false;
    });
    var cycle = function () {
      if (!D.voiceOn || !D.client || !D.micStream) return;
      var rec;
      try {
        rec = new MediaRecorder(D.micStream, mime ? { mimeType: mime } : undefined);
      } catch (e) { SRfallback(); return; }
      D.mrec = rec;
      var chunks = [];
      rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
      rec.onstop = async function () {
        if (!D.voiceOn || !D.client) return;
        var failed = false;
        try {
          var blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
          var text = await transcribeChunk(blob);
          if (text) {
            D.metaFails = 0;
            voiceStatus('🎙 Meta heard: “' + text + '”');
            await applyVoiceText(text);
          }
        } catch (e) {
          failed = true;
          D.metaFails++;
          if (D.metaFails >= 3) {
            stopMetaVoice();
            SRfallback();
            return;
          }
        }
        if (!failed || D.metaFails < 3) cycle();
      };
      try { rec.start(); } catch (e) { SRfallback(); return; }
      D.voiceTimer = setTimeout(function () {
        if (rec.state !== 'inactive') { try { rec.stop(); } catch (e) { /* déjà arrêté */ } }
      }, META_VOICE_SEG_MS);
    };
    cycle();
  }
  function stopMetaVoice() {
    if (D.voiceTimer) { clearTimeout(D.voiceTimer); D.voiceTimer = null; }
    if (D.mrec && D.mrec.state !== 'inactive') { try { D.mrec.stop(); } catch (e) { /* déjà arrêté */ } }
    D.mrec = null;
    if (D.micStream) {
      D.micStream.getTracks().forEach(function (t) { t.stop(); });
      D.micStream = null;
    }
  }
  function stopAllVoice() {
    stopMetaVoice();
    stopVoiceLoop();
  }
  function flattenGarment(garment) {
    return new Promise(function (res) {
      var c = document.createElement('canvas');
      c.width = 1024; c.height = 1024;
      var g = c.getContext('2d');
      g.fillStyle = '#f0f0f2'; g.fillRect(0, 0, 1024, 1024);
      var s = Math.min(880 / garment.width, 880 / garment.height);
      var w = garment.width * s, h = garment.height * s;
      g.drawImage(garment, (1024 - w) / 2, (1024 - h) / 2, w, h);
      c.toBlob(function (b) { res(b); }, 'image/png');
    });
  }
  function stopDecart() {
    if (D.timer) { clearInterval(D.timer); D.timer = null; }
    try { if (D.client && D.client.disconnect) D.client.disconnect(); } catch (e) { /* silencieux */ }
    try { if (D.client && D.client.close) D.client.close(); } catch (e) { /* silencieux */ }
    D.client = null;
    D.clientObj = null;
    stopAllVoice();
    var vh2 = $('to-voice-hint');
    if (vh2) vh2.style.display = 'none';
    if (D.stream) { D.stream.getTracks().forEach(function (t) { t.stop(); }); D.stream = null; }
    var rv = $('to-result');
    if (rv && !S.busy) rv.srcObject = null;
    if (D.wasLive) {
      D.wasLive = false;
      if (rv) rv.style.display = 'none';
      var pv = $('to-preview');
      if (pv) pv.style.display = 'block';
      startCamera();
    }
    var bl = $('btn-to-live'), bs = $('btn-to-live-stop');
    if (bl) bl.style.display = 'block';
    if (bs) bs.style.display = 'none';
  }
  // v1.9.65 — La clé ne vit QUE côté serveur (variable Netlify) :
  // notre fonction l'échange contre un jeton éphémère que le SDK
  // demande tout seul avant chaque connexion. Aucune clé dans le
  // code, aucune demande à l'utilisateur.
  async function fetchDecartToken() {
    var r = await fetch('/.netlify/functions/decart-token');
    var d = await r.json();
    if (!r.ok || !d.apiKey) throw new Error('token refused');
    return d.apiKey;
  }
  async function startDecart() {
    if (D.client || S.busy) return;
    setError('');
    S.busy = true;
    var btn = $('btn-to-live');
    btn.disabled = true;
    btn.textContent = '⏳ GETTING YOUR HOODIE…';
    try {
      stopCamera();
      var refBlob = await presetReference(btn);
      btn.textContent = '⏳ CONNECTING…';
      if (!D.sdk) D.sdk = await import('https://esm.sh/@decartai/sdk@0.2.14');
      var model = D.sdk.models.realtime('lucy-vton-latest');
      D.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', frameRate: model.fps, width: model.width, height: model.height },
        audio: false,
      });
      D.clientObj = D.sdk.createDecartClient({
        apiKeyProvider: async function () {
          try {
            return await fetchDecartToken();
          } catch (e) {
            // Secours dev uniquement : une clé déjà présente sur CE
            // téléphone (anciennes versions) peut encore servir.
            var local = '';
            try { local = localStorage.getItem('astrocode_decart_key') || ''; } catch (err) { /* stockage */ }
            if (local) return local;
            throw new Error('Live try-on is not switched on yet (server key missing).');
          }
        },
      });
      await decartReconnect(refBlob);
      btn.style.display = 'none';
      $('btn-to-live-stop').style.display = 'block';
      var vh = $('to-voice-hint');
      if (vh) vh.style.display = 'block';
      startVoiceSystem();
      D.startedAt = Date.now();
      $('to-live-timer').textContent = '0:00';
      D.timer = setInterval(function () {
        var s = Math.floor((Date.now() - D.startedAt) / 1000);
        $('to-live-timer').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        if (s >= 90) { stopDecart(); setError('Live stopped at 1:30 (credit guard). Tap GO LIVE to restart.'); }
      }, 500);
    } catch (e) {
      setError('Live try-on could not start: ' + (e && e.message ? e.message : String(e)));
      S.busy = false;
      stopDecart();
    }
    S.busy = false;
    btn.disabled = false;
    btn.textContent = '⚡ GO LIVE WITH THIS HOODIE';
  }

  /* ---------------- orchestration ---------------- */
  async function process(blob) {
    if (S.frames.length < 16) {
      setError('The camera frames could not be captured — try recording again.');
      return;
    }
    // 1. Voix (best effort : la transcription peut encore échouer).
    setStep('voice', 'on');
    var heard = '';
    try { heard = await transcribe(blob); } catch (e) { heard = ''; }
    var picks = await parseCommand(heard);
    applyPicks(picks);
    setStep('voice', heard ? 'done' : 'fail');
    if (!heard) setError('I could not hear you this time — check the three choices below, they are set by hand.');
    // Les listes sont la source finale (corrections manuelles possibles
    // pendant les étapes suivantes, relues au moment de générer).
    // 2. SAM sur les frames clés.
    setStep('sam', 'on');
    var sam = await samZones(S.frames);
    if (!sam) {
      setStep('sam', 'fail');
      setError('SAM could not find you in the video — step into the light and record again.');
      return;
    }
    setStep('sam', 'done');
    // 3. Génération du hoodie (choix relus maintenant).
    applyPicks({ sign: $('to-sign').value, print: $('to-print').value, hoodie: $('to-hoodie').value });
    setStep('gen', 'on');
    var garment;
    try {
      garment = await generateGarment(S.picks);
    } catch (e) {
      setStep('gen', 'fail');
      setError('The hoodie generation failed — try again in a moment.');
      return;
    }
    setStep('gen', 'done');
    // 4. Habillage + encodage.
    setStep('mix', 'on');
    var out = await dressVideo(S.frames, sam, garment);
    if (S.resultUrl) URL.revokeObjectURL(S.resultUrl);
    S.resultUrl = URL.createObjectURL(out);
    var rv = $('to-result');
    rv.src = S.resultUrl;
    rv.classList.remove('mirror');       // texte du hoodie lisible
    rv.style.display = 'block';
    $('to-preview').style.display = 'none';
    var dl = $('to-download');
    dl.href = S.resultUrl;
    dl.style.display = 'block';
    setStep('mix', 'done');
  }

  /* ---------------- câblage ---------------- */
  function fillSelects() {
    var ss = $('to-sign');
    ss.innerHTML = SIGNS.map(function (s) {
      return '<option value="' + s.id + '">' + s.en + '</option>';
    }).join('');
    var opts = COLORS.map(function (c) {
      return '<option value="' + c + '">' + c[0].toUpperCase() + c.slice(1) + '</option>';
    }).join('');
    $('to-print').innerHTML = opts;
    $('to-hoodie').innerHTML = opts;
    applyPicks({});
    ['to-sign', 'to-print', 'to-hoodie'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        S.picks = { sign: $('to-sign').value, print: $('to-print').value, hoodie: $('to-hoodie').value };
      });
    });
  }
  function resetUi() {
    setError('');
    ['voice', 'sam', 'gen', 'mix'].forEach(function (n) { setStep(n, ''); });
    $('to-result').style.display = 'none';
    $('to-preview').style.display = 'block';
    $('btn-to-record').style.display = 'block';
    $('btn-to-again').style.display = 'none';
    $('to-download').style.display = 'none';
    $('to-picks').style.display = 'none';
  }
  window.TRYON = {
    onShow: function () {
      document.body.classList.add('on-tryon');
      silenceSignVoice();
      // v1.9.69 — Le jingle du reveal est coupé dès l'entrée : il
      // appartient au scan, pas à l'essayage.
      if (window.REVEAL_2D && REVEAL_2D.silence) REVEAL_2D.silence();
      resetUi();
      startCamera();
    },
    onHide: function () {
      document.body.classList.remove('on-tryon');
      stopDecart();
      if (!S.busy) stopCamera();
    },
  };
  document.addEventListener('DOMContentLoaded', function () {
    fillSelects();
    // v1.9.63 — Rangée de hoodies + micro du direct ; clé restaurée
    // depuis le téléphone.
    buildStrip();
    $('btn-to-live').addEventListener('click', startDecart);
    $('btn-to-live-stop').addEventListener('click', stopDecart);
    // v1.9.70 — Si la voix s'est arrêtée (permission refusée au
    // démarrage auto, service muet), un toucher dans l'écran la
    // relance pendant le direct : le geste débloque le micro.
    document.addEventListener('pointerdown', function () {
      if (document.body.classList.contains('on-tryon') && D.client && !D.voiceOn) startVoiceSystem();
    });
    $('btn-to-record').addEventListener('click', record);
    $('btn-to-again').addEventListener('click', function () {
      resetUi();
      if (!S.stream) startCamera();
    });
  });
})();
