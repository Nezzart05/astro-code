/* ============================================================================
   APP.JS — Astro Code "sauce Meta" (prototype)
   Écrans : onboarding / scan / révélation / collection / échange+empreinte.
   Pas de compte requis pour scanner. Collection persistée en localStorage.
   ============================================================================ */
(function () {
  'use strict';

  const LS_KEY = 'astrocode_meta_collection_v1';
  const LS_BIO = 'astrocode_meta_bio_v1';

  const $ = (id) => document.getElementById(id);
  const screens = ['screen-onboarding', 'screen-scan', 'screen-reveal', 'screen-collection', 'screen-memories', 'screen-feed', 'screen-passport', 'screen-tryon', 'screen-map', 'screen-exchange', 'screen-game'];

  /* ---------------- état ---------------- */
  // La collection ne contient QUE des scans réels validés :
  // [{ id: 'poissons', at: '2026-10-15T14:32:10.000Z' }, …]
  // (l'ancien format [ids] reste lisible pour migration douce)
  function loadCollection() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr
        .map(e => (typeof e === 'string' ? { id: e, at: null } : e))
        .filter(e => e && SIGNS.some(s => s.id === e.id));
    } catch (e) { return []; }
  }
  function saveCollection(entries) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(entries)); } catch (e) {}
  }
  const hasSign = (id) => collected.some(c => c.id === id);
  let collected = loadCollection();
  let currentSign = null;

  // Lecture seule exposée aux modules (game.js : légende de partage, etc.)
  window.ASTRO_STATE = { getCollectedCount: () => collected.length };

  const isUnlocked = () => collected.length >= 12;

  function fmtScanDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('en-US', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      });
    } catch (e) { return ''; }
  }

  /* ---------------- navigation ---------------- */
  let currentScreen = null;
  /* v1.9.74 — historique interne : le bouton « retour » du téléphone doit
     naviguer DANS l'app (écran précédent, puis l'accueil) au lieu de la
     quitter. Chaque écran visité empile une entrée history ; popstate
     rejoue la navigation sans ré-empiler. La sortie ne se fait que
     depuis l'accueil, comme une app native. */
  var fromPopstate = false;
  try { history.replaceState({ astroScreen: 'screen-onboarding' }, ''); } catch (e) {}
  // v1.9.103 — navigation partagée : la carte (map.js) ouvre le
  // scanner par cette poignée (son ancien sélecteur ne visait rien,
  // le bouton « Open the scanner » de la carte était mort).
  window.ASTRO_SHOW = show;
  function show(name) {
    if (currentScreen === 'screen-game' && name !== 'screen-game' && window.GAME) window.GAME.exit();
    screens.forEach(id => $(id).classList.toggle('active', id === name));
    document.querySelectorAll('#bottom-nav .nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.screen === name);
    });
    window.scrollTo(0, 0);
    // v1.9.96 — les écrans hors de #app (collection, feed, carte…)
    // remplacent #app au lieu de s'empiler sous ses 100dvh (voir le
    // commentaire CSS « bug du feed » dans index.html).
    const shownEl = $(name);
    const appEl = document.getElementById('app');
    document.body.classList.toggle('sub-screen', !!(shownEl && appEl && !appEl.contains(shownEl)));
    const previous = currentScreen;
    currentScreen = name;
    // v1.9.22 — la barre du bas se cache sur l'accueil (voir index.html).
    document.body.classList.toggle('on-home', name === 'screen-onboarding');
    if (name === 'screen-game' && window.GAME) window.GAME.enter();
    // v1.9.3 — la carte radar démarre à l'entrée sur son écran, quelle
    // que soit la porte utilisée (nav, accueil, scan).
    if (name === 'screen-map' && window.MAP_TAB) window.MAP_TAB.ensureInit();
    // v1.9.16 — l'écran Memories se rafraîchit à chaque entrée.
    if (name === 'screen-memories' && window.MEMORY_FEATURE) window.MEMORY_FEATURE.render();
    // v1.9.56 — le Fil se rafraîchit à chaque entrée (nouveaux posts, likes).
    if (name === 'screen-feed' && window.FEED) window.FEED.render();
    // v1.9.59 — Essayage vocal : caméra à l'ouverture, coupée à la sortie.
    if (name === 'screen-tryon' && window.TRYON) TRYON.onShow();
    if (name !== 'screen-tryon' && window.TRYON) TRYON.onHide();

    // v1.7 — le scan démarre DÈS l'entrée sur l'écran : plus de bouton
    // « démarrer ». start() se protège lui-même des appels redondants.
    if (name === 'screen-scan' && window.AR_TRACKING) {
      window.AR_TRACKING.start();
    }
    // …et s'arrête en sortant, pour rendre la caméra et la batterie.
    if (previous === 'screen-scan' && name !== 'screen-scan' && window.AR_TRACKING) {
      window.AR_TRACKING.stop();
    }
    // v1.9.74 — empiler l'écran visité pour le « retour » du téléphone
    // (pas de doublon si on ré-affiche le même écran).
    if (!fromPopstate && name !== previous) {
      try { history.pushState({ astroScreen: name }, ''); } catch (e) {}
    }
  }

  // v1.9.74 — le « retour » du téléphone rejoue l'historique de l'app.
  window.addEventListener('popstate', function (e) {
    const name = e && e.state && e.state.astroScreen;
    fromPopstate = true;
    show(screens.indexOf(name) >= 0 ? name : 'screen-onboarding');
    fromPopstate = false;
  });

  /* ---------------- collection ---------------- */
  function renderCollection() {
    const grid = $('collection-grid');
    grid.innerHTML = '';
    SIGNS.forEach(sign => {
      const entry = collected.find(c => c.id === sign.id);
      const has = !!entry;
      const el = ELEMENTS[sign.element];
      const card = document.createElement('div');
      card.className = 'sign-card' + (has ? ' unlocked' : ' locked');
      const sub = has
        ? sign.factory + (entry.at ? '<br>Scanned on ' + fmtScanDate(entry.at) : '')
        : sign.dates;
      card.innerHTML =
        `<div class="sign-medal" style="--c1:${el.color};--c2:${el.color2}"><img class="sign-art" src="assets/signs/${sign.id}.webp" alt=""></div>` +
        `<div class="sign-name">${sign.name.toUpperCase()}</div>` +
        `<div class="sign-dates">${sub}</div>`;
      if (has) {
        // v1.5 : toucher un signe débloqué ouvre sa fiche (écran Révélation).
        // Le scan n'y navigue plus automatiquement (il reste sur la caméra).
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => startReveal(sign));
      }
      grid.appendChild(card);
    });
    $('collection-count').textContent = `${collected.length}/12 signs unlocked`;
    $('progress-fill').style.width = (collected.length / 12 * 100) + '%';
    renderExchange();
  }

  /* ---------------- scan RÉEL uniquement ----------------
     Il n'y a plus de scan démo : un signe n'entre dans la collection que
     si TOUTES ces conditions sont réunies —
       1. MindAR a trouvé la cible (événement astrocode:target-found),
       2. la cible reste suivie en continu pendant 2 s (anti faux positif ;
          toute perte — astrocode:target-lost — annule la confirmation),
       3. la révélation JOUE réellement à l'écran
          (REVEAL_2D.isRunning() : le spectacle canvas 2D tourne).
     --------------------------------------------------------------- */
  let confirmTimer = null;

  function onRealTargetFound(e) {
    const signId = (e.detail && e.detail.signId) || 'poissons';
    if (hasSign(signId)) return;          // déjà collectionné : rien à faire
    if (confirmTimer) return;             // confirmation déjà en cours
    confirmTimer = setTimeout(() => {
      confirmTimer = null;
      const AR = window.AR_TRACKING;
      // v1.8 — la preuve que le spectacle a bien eu lieu, c'est la
      // RÉVÉLATION qui tourne (le canvas 2D), plus l'ancienne vidéo alpha
      // (abandonnée, dont le contrôle bloquait toute validation).
      const revealing = !!(window.REVEAL_2D && window.REVEAL_2D.isRunning());
      const stillOnTarget = !AR || typeof AR.isTargetVisible !== 'function' || AR.isTargetVisible();
      if (revealing && stillOnTarget) {
        addRealScan(signId);
      }
      // sinon : rien ne s'affiche (faux positif) → on ne valide pas.
      // Une prochaine détection relancera le timer.
    }, 2000);
  }

  function onRealTargetLost() {
    if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null; }
  }

  function addRealScan(signId) {
    if (hasSign(signId)) return;
    collected.push({ id: signId, at: new Date().toISOString() });
    saveCollection(collected);
    renderCollection();
    const sign = SIGNS.find(s => s.id === signId);
    if (sign) {
      // v1.5 : on RESTE sur la caméra plein écran (le spectacle continue).
      // La fiche détaillée (écran Révélation) s'ouvre depuis la Collection.
      flash(`+1 — ${sign.name} added to your constellation`);
    }
  }

  /* ---------------- v1.9.51 — LA RÉCOLTE (cérémonie de fin de scan) ------
     reveal-2d déclenche la récolte après 15 s de spectacle : les vidéos
     se condensent en un badge DANS le canvas, et le badge vole jusqu'au
     panneau. Ce bloc ne gère que le DOM : le panneau des 12 signes, le
     texte de félicitations, et la position du slot visé, publiée dans
     window.__harvestSlot (en px canvas) pour guider le vol.          */
  let hvWasNew = false;       // ce scan a-t-il nouvellement ajouté son signe ?
  let hvPublishTimer = null;  // republication de la position du slot
  let hvFallbackT = null;     // v1.9.55 — filet de sécurité de la notification orange
  let hvTextHideT = null;     // v1.9.94 — masquage dur du texte de récolte à 2 s

  window.addEventListener('astrocode:target-found', (e) => {
    const sid = (e.detail && e.detail.signId) || 'poissons';
    hvWasNew = !hasSign(sid);
  });

  function publishHarvestSlot() {
    // v1.9.52 — la cible du vol n'est plus un panneau temporaire mais le
    // bouton « My collection » du menu du bas, visible pendant le scan.
    const btn = document.querySelector('.nav-btn[data-screen="screen-collection"]');
    const cv = document.getElementById('reveal2d-canvas');
    if (!btn || !cv || !cv.width) return;
    const br = btn.getBoundingClientRect(), cr = cv.getBoundingClientRect();
    if (!br.width || !cr.width) return;
    window.__harvestSlot = {
      x: (br.left + br.width / 2 - cr.left) * cv.width / cr.width,
      y: (br.top + br.height / 2 - cr.top) * cv.height / cr.height,
      r: (br.height * 0.30) * cv.height / cr.height
    };
  }

  window.addEventListener('astrocode:harvest-start', (e) => {
    const signId = (e.detail && e.detail.signId) || 'poissons';
    const layer = $('harvest-layer'), txt = $('harvest-text');
    if (!layer || !txt) return;
    const sign = SIGNS.find(s => s.id === signId);
    const name = sign ? sign.name : signId;
    txt.innerHTML = hvWasNew
      ? `Congratulations! You collected ${name} <span class="hv-star">✦</span>`
      : `${name} <span class="hv-star">✦</span> collected`;
    layer.hidden = false;
    requestAnimationFrame(() => layer.classList.add('show'));
    // v1.9.94 — demande d'Hamza : le texte (« Pisces ✦ collected ») doit
    // DISPARAÎTRE après 2 s, quoi qu'il arrive. Avant, il ne partait qu'à
    // l'atterrissage du badge (harvest-land) : si le vol était interrompu,
    // le texte restait collé à l'écran, devant le visage du porteur.
    if (hvTextHideT) clearTimeout(hvTextHideT);
    hvTextHideT = setTimeout(() => {
      layer.classList.remove('show');
      if (hvPublishTimer) { clearInterval(hvPublishTimer); hvPublishTimer = null; }
      setTimeout(() => { layer.hidden = true; window.__harvestSlot = null; }, 350);
    }, 2000);
    if (hvPublishTimer) clearInterval(hvPublishTimer);
    hvPublishTimer = setInterval(publishHarvestSlot, 90);
    setTimeout(publishHarvestSlot, 60);
    // v1.9.55 — FILET DE SÉCURITÉ : le vol dure 2,35 s ; si, 3,6 s après
    // le départ de la récolte, l'atterrissage n'a toujours pas allumé
    // la notification (image du badge lente, image perdue…), on
    // l'allume quand même — le badge EST récolté, le menu doit le dire.
    if (hvFallbackT) clearTimeout(hvFallbackT);
    hvFallbackT = setTimeout(() => {
      const b = document.querySelector('.nav-btn[data-screen="screen-collection"]');
      if (b) b.classList.add('has-new');
    }, 3600);
  });

  window.addEventListener('astrocode:harvest-land', () => {
    if (hvTextHideT) { clearTimeout(hvTextHideT); hvTextHideT = null; }   // v1.9.94 — l'atterrissage a son propre masquage
    // v1.9.54 — la notification orange vit ICI, dans le gestionnaire qui
    // reçoit l'atterrissage (canal prouvé par la v1.9.51), et plus dans
    // un script isolé du HTML (v1.9.53 : jamais apparu chez Hamza).
    if (hvFallbackT) { clearTimeout(hvFallbackT); hvFallbackT = null; }   // v1.9.55 — l'atterrissage réel rend le filet inutile
    const collBtn = document.querySelector('.nav-btn[data-screen="screen-collection"]');
    if (collBtn) collBtn.classList.add('has-new');
    const layer = $('harvest-layer'); if (!layer) return;
    const btn = collBtn;
    if (btn) {
      btn.classList.remove('hv-hit');
      void btn.offsetWidth;   // relance l'animation si elle a déjà joué
      btn.classList.add('hv-hit');
      setTimeout(() => btn.classList.remove('hv-hit'), 900);
    }
    renderCollection();
    setTimeout(() => {
      layer.classList.remove('show');
      if (hvPublishTimer) { clearInterval(hvPublishTimer); hvPublishTimer = null; }
      setTimeout(() => { layer.hidden = true; window.__harvestSlot = null; }, 350);
    }, 1800);
  });

  /* v1.9.54 — notification jaune « My memories » : quand un souvenir
     finit de se générer (memory.js émet astrocode:memory-ready), la
     case passe en jaune jusqu'à ce qu'on l'ouvre. Même principe que
     l'orange de la collection ; l'ouverture efface la notification. */
  window.addEventListener('astrocode:memory-ready', () => {
    const memBtn = document.querySelector('.nav-btn[data-screen="screen-memories"]');
    if (memBtn) memBtn.classList.add('has-new-mem');
  });
  document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.screen === 'screen-collection') b.classList.remove('has-new');
    if (b.dataset.screen === 'screen-memories') b.classList.remove('has-new-mem');
  }));

  /* ---------------- carte horoscope PAR-DESSUS la vidéo (v1.5) -----------
     Au targetFound, le scan ne quitte PLUS le plein écran : l'horoscope
     s'affiche dans une carte glassmorphism ancrée en bas de la caméra
     (max 45 % de la hauteur — on voit toujours les koïs). La carte se
     réduit en petit bandeau via le bouton ⌄ / ⌃. Elle se masque quand la
     cible est perdue (anti-clignotement 450 ms) ou le scan arrêté.
     --------------------------------------------------------------------- */
  let horoSignId = null;      // signe actuellement affiché dans la carte
  let horoHideTimer = null;   // masquage différé anti-clignotement
  let horoFetchToken = 0;     // invalide les réponses d'horoscope périmées

  function horoCard() { return $('horo-card'); }

  function onHoroTargetFound(e) {
    // v1.9.80 — en fusion, le scan ne fait RIEN d'autre que la fusion :
    // pas d'horoscope, pas de voix, pas de phrase par-dessus la rencontre.
    if (window.AR_TRACKING && window.AR_TRACKING.isFusion && window.AR_TRACKING.isFusion()) return;
    const signId = (e.detail && e.detail.signId) || 'poissons';
    if (horoHideTimer) { clearTimeout(horoHideTimer); horoHideTimer = null; }
    if (horoSignId === signId) return;   // déjà en cours pour ce signe
    const sign = SIGNS.find(s => s.id === signId) || SIGNS[11];
    horoSignId = signId;

    // v1.8 — plus de carte en bas de l'écran. La phrase s'écrit mot après
    // mot DANS l'animation, par-dessus l'image, et se retrouve donc aussi
    // dans la vidéo qu'on enregistre.
    const R2D = window.REVEAL_2D;
    if (R2D && R2D.setPhrase) R2D.setPhrase('');

    const token = ++horoFetchToken;
    const showHoroscope = () => {
      META_AI.generateHoroscope(sign, { collected: collected.length })
        .then(horo => {
          if (token !== horoFetchToken || horoSignId !== signId) return; // périmé
          if (R2D && R2D.setPhrase) R2D.setPhrase(trimPhrase(horo.text));
        })
        .catch(() => {
          if (token !== horoFetchToken) return;
          if (R2D && R2D.setPhrase) R2D.setPhrase(sign.name.toUpperCase());
        });
    };
    // v1.9.98 — LA PHRASE BRISE-GLACE REVIENT (décision d'Hamza) : quand
    // le signe scanné n'est pas le sien, ce scan est une RENCONTRE —
    // Muse Spark écrit la phrase brise-glace entre les deux signes, et
    // c'est elle qui s'écrit dans le spectacle, à la place de
    // l'horoscope. Scanné = son propre signe : horoscope Wonder, comme
    // toujours. Échec ou vide de Spark → repli sur l'horoscope.
    const ownSign = (window.ASTRO_OWN_SIGN && window.ASTRO_OWN_SIGN !== signId)
      ? SIGNS.find(s => s.id === window.ASTRO_OWN_SIGN) : null;
    if (ownSign && META_AI.generateIcebreaker) {
      META_AI.generateIcebreaker(ownSign, sign)
        .then(ice => {
          if (token !== horoFetchToken || horoSignId !== signId) return; // périmé
          if (ice && ice.text) {
            if (R2D && R2D.setPhrase) R2D.setPhrase(trimPhrase(ice.text));
            return;
          }
          showHoroscope();
        })
        .catch(() => {
          if (token !== horoFetchToken || horoSignId !== signId) return;
          showHoroscope();
        });
      return;
    }
    showHoroscope();
  }

  /* Une phrase courte se lit d'un coup d'œil ; une longue couvre l'écran.
     On garde la première proposition, plafonnée à 12 mots. */
  function trimPhrase(text) {
    const clean = String(text || '').replace(/[\u201C\u201D"]/g, '').trim();
    const first = clean.split(/(?<=[.!?\u2026])\s+/)[0] || clean;
    const words = first.replace(/[.\u2026]+$/, '').split(/\s+/);
    return words.length > 16 ? words.slice(0, 14).join(" ") + "\u2026" : words.join(" ");
  }

  function onHoroTargetLost() {
    if (horoHideTimer) clearTimeout(horoHideTimer);
    horoHideTimer = setTimeout(hideHoroCard, 450);
  }

  function hideHoroCard() {
    if (horoHideTimer) { clearTimeout(horoHideTimer); horoHideTimer = null; }
    horoSignId = null;
    horoFetchToken++;                       // invalide une requête en cours
    if (window.REVEAL_2D && window.REVEAL_2D.clearPhrase) window.REVEAL_2D.clearPhrase();
  }


  /* Fiche d'un signe (écran Révélation).
     v1.5 : le scan n'y navigue PLUS automatiquement — il reste sur la
     caméra plein écran avec la carte horoscope. Cette fiche s'ouvre quand
     on touche un signe déjà débloqué dans la Collection. */
  function startReveal(sign) {
    currentSign = sign;
    show('screen-reveal');
    // v1.9.55 — CONTENU LOCAL D'ABORD (demande d'Hamza : l'ancien écran
    // tournait dans le vide, suspendu aux appels IA — le personnage
    // bloquait tout l'affichage). Le signe, sa DATE de scan et ses
    // boutons s'affichent IMMÉDIATEMENT, sans réseau ; le personnage
    // IA et l'horoscope ne font que s'ajouter quand ils arrivent.
    setStep(2);
    const entry = collected.find(c => c.id === sign.id);
    $('reveal-glyph').textContent = sign.glyph;
    $('reveal-title').textContent = sign.name.toUpperCase();
    $('reveal-factory').textContent = sign.factory;
    $('reveal-date').textContent = entry
      ? '✦ Collected · scanned on ' + fmtScanDate(entry.at)
      : '✦ ' + sign.dates;
    // v1.9.108 — LE CERCLE NE RESTE JAMAIS VIDE, POUR DE VRAI (la
    // v1.9.102 choisissait une source sans vérifier qu'elle charge :
    // un vieux Memory gardé en URL morte donnait un cercle vide, vu
    // par Hamza le 2 nov — et sa boucle prenait le plus ANCIEN
    // Memory au lieu du plus récent). Maintenant : candidats dans
    // l'ordre — 1) les Memories de CE signe, du plus récent au plus
    // ancien, 2) l'illustration fournie par Hamza (Poissons/Lion),
    // 3) l'œuvre du signe — et chacun n'est retenu que s'il CHARGE
    // réellement (préchargement, 1,5 s max par candidat). Le
    // personnage IA n'est commandé que si aucun candidat ne charge.
    const photoCandidates = [];
    try {
      const mems = JSON.parse(localStorage.getItem('astrocode_memories_v1') || '[]');
      for (let i = 0; i < mems.length; i++) {
        if (mems[i] && mems[i].sign === sign.id && mems[i].img) photoCandidates.push(mems[i].img);
      }
    } catch (e) {}
    if (sign.id === 'poissons' || sign.id === 'lion') {
      photoCandidates.push('assets/card-' + sign.id + '.webp');
    }
    photoCandidates.push('assets/signs/' + sign.id + '.webp');
    const revealImg = $('reveal-img');
    revealImg.alt = sign.name;
    revealImg.style.display = 'block';
    // v1.9.109 — PEINTURE SYNCHRONE GARANTIE : l'œuvre du signe
    // (fichier du build, toujours là) s'affiche TOUT DE SUITE ; la
    // chaîne de candidats ne fait que la REMPLACER quand un Memory
    // ou l'illustration a réellement chargé. Filet : si la source
    // posée échoue au rendu malgré le préchargement, retour à
    // l'œuvre. Et l'anneau dégradé (wrapper) devient visible.
    const artSrc = 'assets/signs/' + sign.id + '.webp';
    revealImg.onerror = () => {
      if (!revealImg.src.endsWith(artSrc)) revealImg.src = artSrc;
      else revealImg.onerror = null;
    };
    revealImg.src = artSrc;
    const ring = $('reveal-img-ring');
    if (ring) ring.style.display = 'block';
    let photoSettled = false;
    (function tryPhoto(idx) {
      if (photoSettled || currentSign !== sign) return;
      if (idx >= photoCandidates.length) {
        // Aucun candidat n'a chargé : dernier recours, le personnage IA.
        photoSettled = true;
        META_AI.generateSignCharacter(sign).then(char => {
          if (currentSign !== sign || !char || !char.imageUrl) return;
          revealImg.src = char.imageUrl;
          revealImg.alt = char.alt || sign.name;
        }).catch(() => {});
        return;
      }
      const probe = new Image();
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; tryPhoto(idx + 1); } }, 1500);
      probe.onload = () => {
        if (done) return;
        done = true; clearTimeout(timer);
        if (currentSign !== sign) return;
        photoSettled = true;
        revealImg.src = photoCandidates[idx];
      };
      probe.onerror = () => {
        if (done) return;
        done = true; clearTimeout(timer);
        tryPhoto(idx + 1);
      };
      probe.src = photoCandidates[idx];
    })(0);
    $('reveal-horo').textContent = '';
    $('reveal-horo-date').textContent = '';
    // La voix du signe peut parler tout de suite (fichier voix local) ;
    // le texte lu devient l'horoscope quand il arrive.
    const nb = $('btn-narrate');
    nb.style.display = 'inline-block';
    const bindVoice = (text) => {
      nb.onclick = () => {
        nb.disabled = true;
        nb.textContent = '🔊 PLAYING…';
        META_AI.narrate(text, sign.id).finally(() => {
          nb.disabled = false;
          nb.textContent = "🔊 HEAR THE SIGN'S VOICE";
        });
      };
    };
    bindVoice(sign.factory);
    // La constellation DÉDIÉE à ce signe : on pose le focus, et l'écran
    // Constellation accueille avec SA voix (game.js, welcome()).
    const cb = $('btn-constellation');
    cb.textContent = '✦ ' + sign.name.toUpperCase() + ' IN MY CONSTELLATION';
    cb.onclick = () => { window.ASTRO_FOCUS_SIGN = sign.id; show('screen-game'); };
    // Enrichissements IA en arrière-plan — jamais bloquants.
    // (v1.9.108 : le personnage IA est devenu le dernier recours de
    // la chaîne de candidats photo ci-dessus — plus d'appel ici.)
    // v1.9.101 — L'HOROSCOPE DU JOUR (demande d'Hamza, 2 nov ; le film
    // promet « Your horoscope. Every day. ») : UN horoscope par signe
    // et par date, gardé dans le téléphone — le même toute la journée,
    // un nouveau demain matin. Wonder n'est appelé qu'à la première
    // ouverture du jour. La lecture du texte du jour par une belle
    // voix viendra via fal.ai (plus tard) ; le bouton voix garde pour
    // l'instant l'accueil humain du signe.
    const todayKey = new Date().toLocaleDateString('en-CA');
    const DAILY_K = 'astrocode_daily_horo_v1';
    let dailyMap = {};
    try { dailyMap = JSON.parse(localStorage.getItem(DAILY_K) || '{}') || {}; } catch (e) {}
    const showDaily = (text) => {
      if (currentSign !== sign) return;
      setStep(3);
      $('reveal-horo-date').textContent = '☀️ TODAY — ' +
        new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
      $('reveal-horo').textContent = '“' + text + '”';
      bindVoice(text);
    };
    const cachedDaily = dailyMap[sign.id + ':' + todayKey];
    if (cachedDaily) {
      showDaily(cachedDaily);
    } else {
      META_AI.generateHoroscope(sign, { collected: collected.length, date: todayKey }).then(horo => {
        if (horo && horo.text) {
          dailyMap[sign.id + ':' + todayKey] = horo.text;
          try { localStorage.setItem(DAILY_K, JSON.stringify(dailyMap)); } catch (e) {}
          showDaily(horo.text);
        } else if (currentSign === sign) setStep(3);
      }).catch(() => { if (currentSign === sign) setStep(3); });
    }
    // NOTE : startReveal n'ajoute RIEN à la collection — seul un scan réel
    // validé (voir addRealScan) peut le faire.
  }

  function setStep(n) {
    [1, 2, 3].forEach(i => {
      const d = $('step-' + i);
      if (d) d.classList.toggle('on', i <= n);
    });
  }
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  /* ---------------- échange / rencontre ---------------- */
  function renderExchange() {
    const unlocked = isUnlocked();
    $('exchange-locked').style.display = unlocked ? 'none' : 'block';
    $('exchange-progress').textContent = unlocked
      ? 'Constellation complete — exchanges unlocked.'
      : `Unlocks at 12/12 signs (${collected.length}/12)`;

    renderEmpreinte();
  }

  /* ---------------- empreinte (bio 12/12) ---------------- */
  function renderEmpreinte() {
    const unlocked = isUnlocked();
    $('empreinte-locked').style.display = unlocked ? 'none' : 'block';
    $('empreinte-form').style.display = unlocked ? 'block' : 'none';
    if (!unlocked) return;
    let bio = null;
    try { bio = JSON.parse(localStorage.getItem(LS_BIO) || 'null'); } catch (e) {}
    if (bio && bio.text) {
      $('empreinte-current').style.display = 'block';
      $('empreinte-current-text').textContent = '“' + bio.text + '”';
      $('empreinte-current-meta').textContent =
        `Published on ${bio.date} · editable on ${bio.nextEdit}`;
    } else {
      $('empreinte-current').style.display = 'none';
    }
  }

  async function publishBio() {
    const text = $('bio-input').value.trim();
    const status = $('bio-status');
    status.textContent = 'Moderation in progress…';
    status.className = 'bio-status wait';
    try {
      const r = await META_AI.moderateBio(text);
      if (!r.ok) {
        status.textContent = 'Rejected: ' + (r.reason || 'content not compliant.');
        status.className = 'bio-status bad';
        return;
      }
      const now = new Date();
      const next = new Date(now.getTime() + 90 * 24 * 3600 * 1000); // 1 trimestre
      const fmt = d => d.toLocaleDateString('en-US');
      localStorage.setItem(LS_BIO, JSON.stringify({
        text, date: fmt(now), nextEdit: fmt(next),
      }));
      status.textContent = 'Published ✓ — visible at the next scan of your piece.';
      status.className = 'bio-status good';
      $('bio-input').value = '';
      renderEmpreinte();
    } catch (e) {
      status.textContent = 'Moderation error. Try again.';
      status.className = 'bio-status bad';
    }
  }

  /* ---------------- divers ---------------- */
  /* ---------------- carrousel de l'accueil : coverflow ----------------
     « Cartes flottantes » — validé par Hamza le 26 oct 2026, dans le
     style de sa référence Envato : la carte centrale, nette, porte le
     nom du signe ; les voisines sont inclinées en 3D, réduites et
     floutées ; un halo prend la couleur du signe au centre.
     Défilement automatique, glisser au doigt, toucher une voisine la
     ramène au centre. Pour changer les pièces : éditer CAROUSEL_CARDS
     (photos dans assets/hoodies/). */
  const CAROUSEL_CARDS = [
    { file: 'porteur-lion-rouge-v3.webp',       name: 'Leo',        sub: 'Fire · Boldness',    glow: '#ff4a2d' },
    { file: 'porteur-scorpion-noir-v3.webp',    name: 'Scorpio',    sub: 'Water · Intensity', glow: '#9a5cff' },
    { file: 'porteur-poissons-koi-v3.webp',     name: 'Pisces',     sub: 'Water · The dream',           glow: '#2ec4b6' },
    { file: 'porteur-sagittaire-orange-v3.webp', name: 'Sagittarius', sub: 'Fire · Freedom',       glow: '#ff8a2a' },
  ];

  function buildCarousel() {
    const stage = $('cf');
    if (!stage) return;
    const halo = $('cf-halo');
    const dotsW = $('cf-dots');
    let cur = 0, timer = null;

    const els = CAROUSEL_CARDS.map((c, i) => {
      const d = document.createElement('div');
      d.className = 'cf-card';
      d.innerHTML =
        '<div class="cf-bob" style="animation-delay:' + (i * -1.4) + 's">' +
        '<img src="assets/hoodies/' + c.file + '" alt="' + c.name + '">' +
        '<div class="cf-label"><div class="n">' + c.name + '</div><div class="s">' + c.sub + '</div></div></div>';
      d.addEventListener('click', () => { go(i); restart(); });
      stage.appendChild(d);
      if (dotsW) {
        const b = document.createElement('button');
        b.setAttribute('aria-label', c.name);
        b.addEventListener('click', () => { go(i); restart(); });
        dotsW.appendChild(b);
      }
      return d;
    });

    function layout() {
      const n = CAROUSEL_CARDS.length;
      els.forEach((el, i) => {
        let o = i - cur;
        if (o >  n / 2) o -= n;
        if (o < -n / 2) o += n;
        const a = Math.abs(o);
        let x = 0, y = 0, s = 1, r = 0, blur = 0, br = 1;
        if (o === 1 || o === -1)   { x = o * 74; s = .78; r = o * -22; blur = 2; br = .72; }
        else if (a >= 2)           { x = o * 30; y = -26; s = .60; r = o * -10; blur = 5; br = .5; }
        el.style.transform = 'translateX(' + x + '%) translateY(' + y + 'px) scale(' + s + ') rotateY(' + r + 'deg)';
        el.style.filter = 'blur(' + blur + 'px) brightness(' + br + ')';
        el.style.zIndex = 10 - a;
        el.style.pointerEvents = a >= 2 ? 'none' : 'auto';
        el.querySelector('.cf-label').style.opacity = o === 0 ? 1 : 0;
        el.querySelector('.cf-bob').style.boxShadow = o === 0
          ? '0 34px 70px rgba(0,0,0,.6), 0 0 64px ' + CAROUSEL_CARDS[i].glow + '66'
          : '0 16px 34px rgba(0,0,0,.45)';
      });
      if (halo) halo.style.background = CAROUSEL_CARDS[cur].glow;
      if (dotsW) dotsW.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === cur));
    }
    function go(i) { cur = (i + CAROUSEL_CARDS.length) % CAROUSEL_CARDS.length; layout(); }
    function restart() {
      clearInterval(timer);
      timer = setInterval(() => { if (!document.hidden) go(cur + 1); }, 3400);
    }
    let sx = null;
    stage.addEventListener('pointerdown', e => { sx = e.clientX; clearInterval(timer); });
    stage.addEventListener('pointerup', e => {
      if (sx === null) return;
      const dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 42) go(cur + (dx < 0 ? 1 : -1));
      restart();
    });
    layout();
    restart();
  }

  function flash(msg) {
    const f = $('flash');
    f.textContent = msg;
    f.classList.add('show');
    clearTimeout(f._t);
    f._t = setTimeout(() => f.classList.remove('show'), 2600);
  }

  /* ---------------- v1.9.58 — PASSEPORT HOODIE ----------------
     Lier un t-shirt à un numéro + un pseudo (maquette d'Hamza, 30 oct).
     Mode invité par défaut, rien n'est bloqué. La liaison est LOCALE
     pour la démo — l'anti-triche réelle se branchera sur le serveur
     plus tard, sans changer cet écran. Le code porte le signe
     (ASTRO-8842-PISCES) : il devient le signe du porteur. */
  const PP_KEY = 'astrocode_passport_v1';
  const PP_SIGNS = { ARIES: 'belier', TAURUS: 'taureau', GEMINI: 'gemeaux', CANCER: 'cancer', LEO: 'lion', VIRGO: 'vierge', LIBRA: 'balance', SCORPIO: 'scorpion', SAGITTARIUS: 'sagittaire', CAPRICORN: 'capricorne', AQUARIUS: 'verseau', PISCES: 'poissons' };
  function loadPassport() {
    try { return JSON.parse(localStorage.getItem(PP_KEY) || 'null'); } catch (e) { return null; }
  }
  function updatePassportButton() {
    // v1.9.90 — la pilule a disparu : l'état « pas encore lié » devient
    // le POINT ORANGE du bouton sandwich et de l'item LINK HOODIE.
    const linked = !!loadPassport();
    const bm = $('btn-menu');
    if (bm) bm.classList.toggle('has-dot', !linked);
    const dr = $('drawer');
    if (dr) dr.classList.toggle('has-dot', !linked);
  }
  function renderPassport() {
    const pp = loadPassport();
    $('pp-form').style.display = pp ? 'none' : 'block';
    $('pp-linked').style.display = pp ? 'block' : 'none';
    if (pp) {
      $('pp-linked-title').textContent = 'HOODIE LINKED — ' + pp.signName;
      $('pp-linked-sub').textContent = '@' + pp.pseudo + ' · code ' + pp.code +
        ' · This hoodie is yours — your constellation knows your sign now.';
    }
    $('pp-error').style.display = 'none';
  }
  function linkHoodie() {
    const code = $('pp-code').value.trim().toUpperCase();
    const phoneRaw = $('pp-phone').value.trim();
    const phone = phoneRaw.replace(/\D/g, '');
    const pseudo = $('pp-pseudo').value.trim().replace(/^@+/, '');
    const err = $('pp-error');
    const fail = (msg) => { err.textContent = msg; err.style.display = 'block'; };
    const m = code.match(/^ASTRO-(\d{4})-([A-Z]{3,9})$/);
    if (!m || !PP_SIGNS[m[2]]) return fail('That code doesn\'t look right — check the label, under the QR code.');
    if (phone.length < 10) return fail('Add your phone number — it\'s your anti-cheat key.');
    if (pseudo.length < 2) return fail('Pick a public pseudo — it\'s how wearers will know you.');
    const pp = { code, phone: phoneRaw, pseudo, sign: PP_SIGNS[m[2]], signName: m[2], at: Date.now() };
    try { localStorage.setItem(PP_KEY, JSON.stringify(pp)); }
    catch (e) { return fail('Storage is full on this phone — delete a memory and retry.'); }
    window.ASTRO_OWN_SIGN = pp.sign;
    updatePassportButton();
    renderPassport();
  }

  function init() {
    // nav
    $('btn-activate').addEventListener('click', () => show('screen-scan'));
    document.querySelectorAll('#bottom-nav .nav-btn').forEach(b =>
      b.addEventListener('click', () => show(b.dataset.screen)));
    $('btn-ar-back').addEventListener('click', () => show('screen-onboarding'));
    $('btn-back-collection').addEventListener('click', () => show('screen-scan'));
    $('btn-reveal-back').addEventListener('click', () => show('screen-scan'));
    $('btn-back-feed').addEventListener('click', () => show('screen-scan'));
    // v1.9.107 — Memories revient à l'ACCUEIL (ordre d'Hamza) : son
    // ancien bouton « ← Scan » était mort (memory.js cherchait un
    // bouton Scan dans la barre du bas, qui n'en a pas). Le retour
    // vit ici, avec les autres. Même traitement pour l'écran
    // Empreinte, qui n'avait aucun bouton retour.
    $('btn-memories-back').addEventListener('click', () => show('screen-onboarding'));
    $('btn-exchange-back').addEventListener('click', () => show('screen-onboarding'));
    // v1.9.58 — Passeport Hoodie : ouverture, retour, liaison, déliaison.
    const pp0 = loadPassport();
    if (pp0) window.ASTRO_OWN_SIGN = pp0.sign;
    updatePassportButton();
    // v1.9.90 — le bouton sandwich ouvre le panneau ; ses items
    // naviguent (LINK HOODIE en tête, puis toutes les portes).
    const drawerEl = $('drawer');
    const openDrawer = () => { if (drawerEl) { drawerEl.classList.add('open'); drawerEl.setAttribute('aria-hidden', 'false'); } };
    const closeDrawer = () => { if (drawerEl) { drawerEl.classList.remove('open'); drawerEl.setAttribute('aria-hidden', 'true'); } };
    $('btn-menu').addEventListener('click', openDrawer);
    $('drawer-close').addEventListener('click', closeDrawer);
    if (drawerEl) {
      drawerEl.querySelector('.drawer-backdrop').addEventListener('click', closeDrawer);
      drawerEl.querySelectorAll('.drawer-item').forEach((it) => it.addEventListener('click', () => {
        const go = it.getAttribute('data-go');
        closeDrawer();
        if (go === 'passport') { renderPassport(); show('screen-passport'); }
        else show('screen-' + go);
      }));
    }
    $('btn-passport-back').addEventListener('click', () => show('screen-onboarding'));
    $('btn-link-hoodie').addEventListener('click', linkHoodie);
    // v1.9.59 — Essayage vocal : la porte de l'accueil et le retour.
    $('btn-tryon-door').addEventListener('click', () => show('screen-tryon'));
    $('btn-tryon-back').addEventListener('click', () => show('screen-onboarding'));
    $('btn-unlink').addEventListener('click', () => {
      try { localStorage.removeItem(PP_KEY); } catch (e) { /* silencieux */ }
      window.ASTRO_OWN_SIGN = undefined;
      updatePassportButton();
      renderPassport();
    });

    // rencontre + empreinte
    $('btn-publish-bio').addEventListener('click', publishBio);

    // v1.9.3 — « Trouve autour de toi » ouvre la CARTE radar (la recherche
    // de porteurs), pas le jeu. Le jeu Constellation reste joignable par
    // le bouton « Ta constellation » de l'écran carte.
    const btnFind = $('btn-find-wearers');
    if (btnFind) btnFind.addEventListener('click', () => show('screen-map'));
    const doorGame = $('btn-door-game');
    if (doorGame) doorGame.addEventListener('click', () => show('screen-map'));
    const mapGame = $('btn-map-game');
    if (mapGame) mapGame.addEventListener('click', () => show('screen-game'));
    const doorColl = $('btn-door-collection');
    if (doorColl) doorColl.addEventListener('click', () => show('screen-collection'));
    const doorMem = $('btn-door-memories');
    if (doorMem) doorMem.addEventListener('click', () => show('screen-memories'));

    buildCarousel();

    // Bandeau des 12 signes (accueil) — glyphes pour l'instant ; les
    // designs d'Hamza prendront cette place quand il les générera.
    const strip = $('signs-strip');
    if (strip) {
      SIGNS.forEach(sign => {
        const el = ELEMENTS[sign.element];
        const chip = document.createElement('div');
        chip.className = 'sign-chip';
        chip.innerHTML =
          `<div class="chip-glyph" style="--c1:${el.color};--c2:${el.color2}">${sign.glyph}</div>` +
          `<div class="chip-name">${sign.name}</div>`;
        strip.appendChild(chip);
      });
    }

    $('btn-reset').addEventListener('click', () => {
      collected = [];
      saveCollection(collected);
      try { localStorage.removeItem(LS_BIO); } catch (e) {}
      renderCollection();
      flash('Collection reset.');
    });

    renderCollection();
    show('screen-onboarding');

    // Scan RÉEL (ar-tracking.js) : MindAR trouve le dessin du t-shirt.
    // La validation (2 s de suivi continu + vidéo qui joue) se fait dans
    // onRealTargetFound — jamais de scan démo, jamais d'ajout factice.
    window.addEventListener('astrocode:target-found', onRealTargetFound);
    window.addEventListener('astrocode:target-lost', onRealTargetLost);
    // v1.5 : la carte horoscope par-dessus la vidéo (le scan reste en plein
    // écran — plus de navigation automatique vers l'écran Révélation).
    window.addEventListener('astrocode:target-found', onHoroTargetFound);
    window.addEventListener('astrocode:target-lost', onHoroTargetLost);
    window.addEventListener('astrocode:scan-stopped', hideHoroCard);
  }

  document.addEventListener('DOMContentLoaded', init);

  /* v1.9.74 — vidéo d'ouverture : jouée à chaque lancement ; un toucher
     la passe ; si quoi que ce soit bloque, un filet de 6,5 s la retire —
     l'app ne reste jamais coincée sur l'intro. */
  document.addEventListener('DOMContentLoaded', function () {
    const splash = $('splash');
    if (!splash) return;
    const video = $('splash-video');
    let dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      splash.classList.add('done');
      setTimeout(() => { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 520);
    }
    if (video) {
      video.addEventListener('ended', dismiss);
      video.addEventListener('error', dismiss);
      const p = video.play && video.play();
      if (p && p.catch) p.catch(() => {});
    }
    splash.addEventListener('pointerdown', dismiss);
    setTimeout(dismiss, 6500);
  });
})();
