/* ============================================================================
   RECORD-SHARE.JS — Enregistrer l'écran du scan et le partager — v1.8
   (v1.8.2 : partage fiabilisé — voir deliver() plus bas.)
   ----------------------------------------------------------------------------
   On n'enregistre PAS l'écran du téléphone (l'API d'enregistrement d'écran
   n'existe pas sur mobile). On enregistre le CANVAS de la révélation, qui
   compose déjà tout : l'image de la caméra, les koïs en orbite et la phrase
   qui s'écrit. Le résultat est donc exactement ce que la personne voyait.

   Chaîne : REVEAL_2D.setRecording(true) → le canvas peint aussi la caméra
            canvas.captureStream()       → un flux vidéo
            MediaRecorder                → un fichier
            navigator.share({files})     → la feuille de partage du système
                                           (Instagram, TikTok, Facebook…)

   Si le partage de fichiers n'est pas disponible (ordinateur, navigateur
   ancien), on télécharge la vidéo et on copie la légende : la personne peut
   toujours publier, en deux gestes au lieu d'un.
   ============================================================================ */
(function () {
  'use strict';

  var MAX_MS = 15000;       // au-delà, les réseaux sociaux recompressent mal
  var state = { rec: null, chunks: [], stopTimer: null, startedAt: 0, lastSign: null };

  function $(id) { return document.getElementById(id); }

  /* ---------------------------------------------------------------- */
  /* La légende, prête à publier                                        */
  /* ---------------------------------------------------------------- */
  function buildCaption() {
    var sign = state.lastSign || 'un signe';
    var count = 0;
    try {
      if (window.ASTRO_STATE && window.ASTRO_STATE.getCollectedCount) {
        count = window.ASTRO_STATE.getCollectedCount();
      }
    } catch (e) {}
    var left = Math.max(0, 12 - count);
    var line;
    if (left === 0)      line = 'My constellation is complete. All 12 signs.';
    else if (left === 1) line = 'I crossed paths with ' + sign + ' today. Only one more to go.';
    else                 line = 'I crossed paths with ' + sign + ' today. ' + left + ' more to go.';
    return line + '\n\nScan an Astro Code garment and see what comes out.\n#AstroCode #Streetwear #AR';
  }

  /* ---------------------------------------------------------------- */
  /* Choix du format : mp4 si le navigateur sait, sinon webm            */
  /* ---------------------------------------------------------------- */
  function pickMime() {
    var tries = [
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    for (var i = 0; i < tries.length; i++) {
      try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(tries[i])) return tries[i]; }
      catch (e) {}
    }
    return '';
  }

  function supported() {
    return !!(window.MediaRecorder && window.REVEAL_2D && window.REVEAL_2D.captureStream);
  }

  /* ---------------------------------------------------------------- */
  /* Démarrer / arrêter                                                 */
  /* ---------------------------------------------------------------- */
  function start() {
    if (state.rec || !supported()) return false;
    hideSharePanel();
    window.REVEAL_2D.setRecording(true);
    var stream = window.REVEAL_2D.captureStream(30);
    if (!stream) { window.REVEAL_2D.setRecording(false); return false; }
    var mime = pickMime();
    try {
      state.rec = mime ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 })
                       : new MediaRecorder(stream);
    } catch (e) {
      console.warn('[REC] MediaRecorder refusé :', e);
      window.REVEAL_2D.setRecording(false);
      return false;
    }
    state.chunks = [];
    state.startedAt = Date.now();
    state.rec.ondataavailable = function (e) { if (e.data && e.data.size) state.chunks.push(e.data); };
    state.rec.onstop = finish;
    state.rec.start(250);
    setUI(true);
    // Garde-fou : on ne dépasse jamais MAX_MS, même si on oublie d'arrêter.
    // (Arrêt automatique = AUCUN geste utilisateur → le partage natif sera
    // refusé par le navigateur ; on passera par le panneau, voir deliver().)
    state.stopTimer = setTimeout(function () { stop(false); }, MAX_MS);
    return true;
  }

  function stop(byUser) {
    if (!state.rec) return;
    // On retient QUI a arrêté : un tap (activation valide pour share())
    // ou le minuteur (aucune activation → panneau obligatoire).
    state.stoppedByUser = !!byUser;
    if (state.stopTimer) { clearTimeout(state.stopTimer); state.stopTimer = null; }
    try { state.rec.stop(); } catch (e) {}
  }

  function finish() {
    var rawType = (state.rec && state.rec.mimeType) || 'video/webm';
    // Type MIME « propre » (sans ;codecs=…) : un type paramétré fait
    // échouer la validation canShare sur certains navigateurs.
    var type = rawType.split(';')[0];
    state.rec = null;
    window.REVEAL_2D.setRecording(false);
    setUI(false);
    if (!state.chunks.length) { toast('Nothing was recorded.'); return; }
    var blob = new Blob(state.chunks, { type: type });
    state.chunks = [];
    var ext = type.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
    deliver(blob, 'astro-code.' + ext, type);
  }

  /* ---------------------------------------------------------------- */
  /* Partage                                                            */
  /* ---------------------------------------------------------------- */
  /* ---------------------------------------------------------------- */
  /* Partage — v1.8.2                                                   */
  /* Le navigateur n'autorise navigator.share() que dans la foulée     */
  /* d'un geste de l'utilisateur (« transient activation »). Chaîne :   */
  /*  1. arrêt par un tap → on tente le partage immédiat ;              */
  /*  2. arrêt automatique (minuteur) ou échec du partage immédiat →    */
  /*     on affiche le panneau « Vidéo prête » : son bouton Partager    */
  /*     EST un geste frais, le partage y marche à tous les coups ;     */
  /*  3. le téléchargement devient un choix explicite du panneau,       */
  /*     plus jamais le comportement silencieux par défaut.            */
  /* ---------------------------------------------------------------- */
  function deliver(blob, filename, type) {
    var caption = buildCaption();
    var file = null;
    try { file = new File([blob], filename, { type: type }); } catch (e) {}
    state.pending = { blob: blob, filename: filename, file: file, caption: caption };
    if (state.stoppedByUser && file && canShareFile(file)) {
      tryShare(file, caption, true);
    } else {
      showSharePanel();
    }
  }

  function canShareFile(file) {
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); }
    catch (e) { return false; }
  }

  function tryShare(file, caption, immediate) {
    navigator.share({ files: [file], text: caption, title: 'Astro Code' })
      .then(function () { hideSharePanel(); })
      .catch(function (err) {
        // L'utilisateur a fermé la feuille lui-même : on respecte, silence.
        if (err && err.name === 'AbortError') { hideSharePanel(); return; }
        // Activation expirée ou refus : le panneau prend le relais
        // (sauf si on y est déjà — là, on informe).
        if (immediate) showSharePanel();
        else toast('Sharing was blocked by the browser — you can download the video below.');
      });
  }

  function showSharePanel() {
    var p = $('share-panel');
    if (!p) {
      p = document.createElement('div');
      p.id = 'share-panel';
      p.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:104px;z-index:60;' +
        'display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:16px;' +
        'background:rgba(16,18,32,.78);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);' +
        'border:1px solid rgba(255,255,255,.20);box-shadow:0 10px 32px rgba(0,0,0,.45);' +
        'color:#fff;font:500 14px system-ui,sans-serif;max-width:92vw;box-sizing:border-box;';
      p.innerHTML =
        '<span style="white-space:nowrap">🎬 Video ready</span>' +
        '<button type="button" data-act="share" style="border:0;border-radius:999px;padding:9px 16px;' +
        'background:#ff7a1a;color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer">Share</button>' +
        '<button type="button" data-act="dl" style="border:1px solid rgba(255,255,255,.35);border-radius:999px;' +
        'padding:9px 13px;background:transparent;color:#fff;font:500 13px system-ui,sans-serif;cursor:pointer">Download</button>' +
        '<button type="button" data-act="x" aria-label="Close" style="border:0;background:transparent;' +
        'color:#fff;font-size:17px;line-height:1;cursor:pointer;padding:4px 2px">✕</button>';
      p.addEventListener('click', function (ev) {
        var act = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-act');
        if (!act || !state.pending) return;
        if (act === 'share') {
          // CE tap est le geste frais qu'exige navigator.share().
          if (state.pending.file && canShareFile(state.pending.file)) {
            tryShare(state.pending.file, state.pending.caption, false);
          } else {
            toast('File sharing is not supported here — use Download.');
          }
        } else if (act === 'dl') {
          download(state.pending.blob, state.pending.filename, state.pending.caption);
          hideSharePanel();
        } else if (act === 'x') {
          hideSharePanel();
        }
      });
      document.body.appendChild(p);
    }
    p.style.display = 'flex';
    toast('Video ready — tap Share to send it wherever you like.');
  }

  function hideSharePanel() {
    var p = $('share-panel');
    if (p) p.style.display = 'none';
  }

  function download(blob, filename, caption) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(caption).catch(function () {});
      toast('Video saved — caption copied.');
    } else {
      toast('Video saved.');
    }
  }

  /* ---------------------------------------------------------------- */
  /* Interface                                                          */
  /* ---------------------------------------------------------------- */
  function setUI(on) {
    var btn = $('btn-record');
    if (!btn) return;
    btn.classList.toggle('recording', on);
    btn.setAttribute('aria-label', on ? 'Stop recording' : 'Record and share');
  }

  function toast(msg) {
    var f = $('flash');
    if (!f) return;
    f.textContent = msg;
    f.classList.add('show');
    clearTimeout(f._t);
    f._t = setTimeout(function () { f.classList.remove('show'); }, 2800);
  }

  /* ---------------------------------------------------------------- */
  /* Branchements                                                       */
  /* ---------------------------------------------------------------- */
  // On retient le dernier signe vu, pour la légende.
  window.addEventListener('astrocode:target-found', function (e) {
    var id = (e.detail && e.detail.signId) || null;
    if (!id) return;
    var names = {
      belier: 'an Aries', taureau: 'a Taurus', gemeaux: 'Gemini',
      cancer: 'a Cancer', lion: 'a Leo', vierge: 'a Virgo',
      balance: 'a Libra', scorpion: 'a Scorpio', sagittaire: 'a Sagittarius',
      capricorne: 'a Capricorn', verseau: 'an Aquarius', poissons: 'a Pisces',
    };
    state.lastSign = names[id] || id;
  });

  document.addEventListener('DOMContentLoaded', function () {
    var btn = $('btn-record');
    if (!btn) return;
    if (!supported()) { btn.style.display = 'none'; return; }
    btn.addEventListener('click', function () {
      if (state.rec) stop(true); else if (!start()) toast('Recording is not available in this browser.');
    });
  });

  window.RECORD_SHARE = {
    start: start, stop: stop,
    isRecording: function () { return !!state.rec; },
    caption: buildCaption,
    supported: supported,
  };
})();
