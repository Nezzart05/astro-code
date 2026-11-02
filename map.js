/* ============================================================================
   MAP.JS — Onglet « Carte » — RADAR VIVANT — Astro Code v1.9.11
   ----------------------------------------------------------------------------
   Décision d'Hamza (26 oct) : PAS de vraie carte géographique. Un radar
   nuit stylisé — anneaux de distance, balayage, rues suggérées — dans
   lequel on CHASSE les porteurs, esprit Pokémon Go.

   v1.9.11 (27 oct, demandes d'Hamza) :
   - VRAI GPS : la position du téléphone est réelle (watchPosition). Au
     premier fix, les porteurs et les nébuleuses sont ancrés à de vraies
     coordonnées autour de l'utilisateur ; ensuite, distance et cap sont
     RECALCULÉS depuis sa position réelle — marcher vers un porteur fait
     vraiment baisser sa distance. Sans GPS (refus/erreur), on retombe
     sur la simulation d'origine.
   - VRAIE BOUSSOLE : la carte tourne avec le téléphone (deviceorientation,
     cap lissé) — le haut de l'écran = la direction regardée, comme une
     vraie carte en mode navigation. Le « N » se déplace sur le bord.
   - STYLE « carte en profondeur » (référence d'Hamza) : ville bleu nuit
     profond, boulevards orange néon qui luisent, disque légèrement
     incliné en 3D (CSS), balayage passé du vert à l'ambre.
   - Disque AGRANDI (conteneur plus grand, marges réduites).
   ============================================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* RÉGLAGES                                                             */
  /* ------------------------------------------------------------------ */
  const CFG = {
    radiusM: 500,          // portée du radar (mètres)
    // Porteurs : cap (degrés, 0 = nord) + distance (m) de DÉPART.
    // Avec GPS, ils deviennent de vraies coordonnées autour de toi.
    // LE WAVE (v1.9.103, idée d'Hamza — né « poke », renommé WAVE le 2 nov : le mot de Facebook écarté, le salut de la main gardé) : openToMeet = ce porteur s'est
    // DÉCLARÉ ouvert aux rencontres — il porte alors le point VERT sur
    // la carte. Règle de vie privée, sans exception : personne n'est
    // JAMAIS ouvert par défaut ; pas de point vert = pas approchable.
    wearers: [
      { signId: 'lion',       bearing: 35,  dist: 150, openToMeet: true },
      { signId: 'scorpion',   bearing: 150, dist: 325, openToMeet: false },
      { signId: 'sagittaire', bearing: 282, dist: 465, openToMeet: true },
    ],
    // Zones nébuleuses : concentrations de porteurs.
    nebulas: [
      { bearing: 105, dist: 385, radiusM: 115, color: '#7c3aed', name: 'Nebula zone' },
      { bearing: 228, dist: 295, radiusM: 90,  color: '#ff7a2d', name: 'Nebula zone' },
    ],
  };

  const EL_COLORS = { feu: '#ff7a2d', eau: '#3ec6ff', terre: '#ffb46a', air: '#b18cff' };

  const S = {
    inited: false,
    canvas: null, ctx: null,
    w: 0, h: 0, cx: 0, cy: 0, R: 0,
    raf: 0, t: 0, last: 0,
    streets: [], buildings: [],
    wearers: [],           // [{ sign, bearing, dist, phase, ping, ll }]
    wave: { open: false, until: 0, timer: null },   // LE WAVE — mon ouverture (persistée)
    nebStars: [],
    // Boussole : cap courant (lissé) et cap cible, en degrés.
    heading: 0, headingTarget: 0, headingOn: false,
    // v1.9.13 — stabilisation : tampon de lectures (moyenne circulaire),
    // rejet des lectures aberrantes, mode de repli « delta ».
    headingBuf: [], outliers: 0, absSeen: false, lastAlpha: null, headingMode: 'none',
    // GPS réel.
    gpsOn: false, userPos: null, geoWatch: null, sensorsStarted: false,
  };

  const $ = (id) => document.getElementById(id);

  // RNG à graine : le décor abstrait est stable d'une image à l'autre.
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function signById(id) {
    const signs = window.SIGNS || [];
    return signs.find(s => s.id === id) || { id, name: id, glyph: '✦', element: 'feu' };
  }

  /* ---------------- géographie réelle (GPS) ---------------- */
  const EARTH_R = 6371000;
  function destPoint(lat, lon, brgDeg, distM) {
    const d = distM / EARTH_R, b = brgDeg * Math.PI / 180;
    const p1 = lat * Math.PI / 180, l1 = lon * Math.PI / 180;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1),
                               Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return { lat: p2 * 180 / Math.PI, lon: l2 * 180 / Math.PI };
  }
  function haversineM(a, b) {
    const dp = (b.lat - a.lat) * Math.PI / 180, dl = (b.lon - a.lon) * Math.PI / 180;
    const p1 = a.lat * Math.PI / 180, p2 = b.lat * Math.PI / 180;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * EARTH_R * Math.asin(Math.sqrt(h));
  }
  function bearingTo(a, b) {
    const p1 = a.lat * Math.PI / 180, p2 = b.lat * Math.PI / 180;
    const dl = (b.lon - a.lon) * Math.PI / 180;
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  /* ---------------- cap boussole, stabilisé (v1.9.13) ----------------
     Retour terrain d'Hamza : la boussole v1.9.11 « tournait dans tous les
     sens ». Causes classiques : les événements absolus et relatifs se
     contredisaient, et le magnétomètre en intérieur (écrans, métal) est
     bruyant. Parade en trois couches :
     1) on ne mélange plus les référentiels — dès qu'une lecture ABSOLUE
        existe, les relatives sont ignorées ;
     2) moyenne circulaire sur les 6 dernières lectures + rejet des
        lectures aberrantes isolées (> 45°) ;
     3) si l'absolu n'arrive jamais, repli « delta » : on intègre les
        VARIATIONS du cap relatif — stable et dynamique quand on tourne,
        sans prétendre au nord vrai (le mode démo demandé par Hamza).   */
  function angleDelta(from, to) {
    return ((to - from + 540) % 360) - 180;
  }
  function pushHeading(raw) {
    const d = angleDelta(S.headingTarget, raw);
    if (S.headingBuf.length >= 3 && Math.abs(d) > 45) {
      S.outliers++;
      if (S.outliers < 3) return;   // aberration isolée : ignorée
    }
    S.outliers = 0;
    S.headingBuf.push(raw);
    if (S.headingBuf.length > 6) S.headingBuf.shift();
    let sx = 0, sy = 0;
    for (const a of S.headingBuf) {
      sx += Math.cos(a * Math.PI / 180);
      sy += Math.sin(a * Math.PI / 180);
    }
    S.headingTarget = (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360;
    S.headingOn = true;
  }
  function onOrient(e) {
    let raw = null;
    if (typeof e.webkitCompassHeading === 'number') {
      raw = e.webkitCompassHeading;
      S.absSeen = true; S.headingMode = 'abs';
      pushHeading(raw);
      return;
    }
    if (typeof e.alpha !== 'number') return;
    raw = (360 - e.alpha) % 360;
    if (e.absolute === true) {
      S.absSeen = true; S.headingMode = 'abs';
      pushHeading(raw);
    } else if (!S.absSeen) {
      // Aucun absolu pour l'instant : mode delta (variations relatives).
      if (S.lastAlpha != null) {
        const d = angleDelta(S.lastAlpha, raw);
        if (Math.abs(d) < 40 && Math.abs(d) > 0.05) {
          S.headingTarget = (S.headingTarget + d + 360) % 360;
          S.headingMode = 'delta';
          S.headingOn = true;
        }
      }
      S.lastAlpha = raw;
    }
  }

  /* ---------------- géométrie radar ---------------- */
  // Cap + distance -> point écran. Le cap affiché tient compte de la
  // boussole : ce que tu regardes est en haut.
  function project(bearingDeg, distM) {
    const a = (bearingDeg - S.heading) * Math.PI / 180;
    const r = Math.min(distM, CFG.radiusM) / CFG.radiusM * S.R;
    return { x: S.cx + Math.sin(a) * r, y: S.cy - Math.cos(a) * r };
  }
  // Projection SANS la boussole (pour le calque « monde » qu'on fait
  // pivoter d'un bloc autour du centre).
  function projectRaw(bearingDeg, distM) {
    const a = bearingDeg * Math.PI / 180;
    const r = Math.min(distM, CFG.radiusM) / CFG.radiusM * S.R;
    return { x: S.cx + Math.sin(a) * r, y: S.cy - Math.cos(a) * r };
  }
  function ringR(distM) { return distM / CFG.radiusM * S.R; }

  /* ---------------- décor : rues abstraites ---------------- */
  function buildStreets() {
    const rnd = mulberry32(20261026);
    S.streets = [];
    for (let i = 0; i < 5; i++) {
      const y0 = (rnd() * 2 - 1) * S.R * 0.9;
      const bend = (rnd() * 2 - 1) * S.R * 0.35;
      const rot = (rnd() * 2 - 1) * 0.5;
      S.streets.push({ kind: 'blvd', y0, bend, rot, a: 0.05 + rnd() * 0.05 });
    }
    for (let i = 0; i < 30; i++) {
      const ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * S.R * 0.96;
      const x = S.cx + Math.cos(ang) * rr, y = S.cy + Math.sin(ang) * rr;
      const dir = rnd() * Math.PI, len = S.R * (0.12 + rnd() * 0.3);
      S.streets.push({ kind: 'seg', x, y, dir, len, a: 0.03 + rnd() * 0.06 });
    }
    S.buildings = [];
    const angles = [0, 0.45, -0.4, 0.9, -0.85, Math.PI / 2];
    for (let i = 0; i < 30; i++) {
      const ang = rnd() * Math.PI * 2, rr = (0.22 + 0.74 * Math.sqrt(rnd())) * S.R;
      S.buildings.push({
        x: S.cx + Math.cos(ang) * rr, y: S.cy + Math.sin(ang) * rr,
        w: S.R * (0.05 + rnd() * 0.07), h: S.R * (0.04 + rnd() * 0.06),
        rot: angles[Math.floor(rnd() * angles.length)] + (rnd() - 0.5) * 0.15,
        a: 0.05 + rnd() * 0.06
      });
    }
    S.nebStars = [];
    for (let i = 0; i < 60; i++) {
      const ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * S.R;
      S.nebStars.push({ x: Math.cos(ang) * rr, y: Math.sin(ang) * rr, p: rnd() * Math.PI * 2 });
    }
  }

  /* ---------------- construction ---------------- */
  function ensureCanvas() {
    if (S.canvas && S.canvas.isConnected) return true;
    const host = $('map');
    if (!host) return false;
    host.innerHTML = '';
    const c = document.createElement('canvas');
    c.id = 'radar-canvas';
    c.style.cssText = 'display:block; width:100%; height:100%; touch-action:manipulation; cursor:pointer;';
    host.appendChild(c);
    S.canvas = c; S.ctx = c.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    c.addEventListener('pointerdown', onTap);
    return true;
  }

  function resize() {
    if (!S.canvas) return;
    const r = S.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    S.canvas.width = Math.max(1, Math.round(r.width * dpr));
    S.canvas.height = Math.max(1, Math.round(r.height * dpr));
    S.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S.w = r.width; S.h = r.height;
    S.cx = r.width / 2; S.cy = r.height / 2;
    S.R = Math.min(r.width, r.height) / 2 - 10;
    buildStreets();
  }

  function buildWearers() {
    S.wearers = CFG.wearers.map((wcfg, i) => ({
      sign: signById(wcfg.signId),
      bearing: wcfg.bearing,
      dist: wcfg.dist,
      phase: i * 2.1,
      ping: 0,
      openToMeet: !!wcfg.openToMeet,   // LE WAVE — déclaré ouvert (point vert)
      waveFlash: 0,                    // anneau du wave en retour
      x: 0, y: 0, curDist: wcfg.dist,
      ll: null,               // vraies coordonnées, une fois le GPS calé
    }));
    for (const nb of CFG.nebulas) nb.ll = null;
  }

  /* ---------------- capteurs : GPS réel + boussole ---------------- */
  function setStatus(txt) {
    const st = $('map-status');
    if (st) st.textContent = txt;
  }
  function startSensors() {
    if (S.sensorsStarted) return;
    S.sensorsStarted = true;

    // Boussole.
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().catch(() => {});
      }
    } catch (e) { /* pas vital */ }
    window.addEventListener('deviceorientationabsolute', onOrient, true);
    window.addEventListener('deviceorientation', onOrient, true);

    // GPS réel.
    if (!('geolocation' in navigator)) { setStatus(simStatus()); return; }
    setStatus('Finding your GPS position…');
    S.geoWatch = navigator.geolocation.watchPosition(onGps, onGpsError, {
      enableHighAccuracy: true, maximumAge: 4000, timeout: 20000,
    });
  }
  function simStatus() {
    return CFG.wearers.length + ' wearers · ' + CFG.nebulas.length +
      ' nebula zones — range of ' + CFG.radiusM + ' m';
  }
  function onGps(pos) {
    const u = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    const acc = Math.round(pos.coords.accuracy || 0);
    const first = !S.gpsOn;
    S.userPos = u; S.gpsOn = true;
    if (first) {
      // Ancrage : les porteurs et nébuleuses deviennent de VRAIES
      // coordonnées autour de la vraie position de l'utilisateur.
      for (const w of S.wearers) w.ll = destPoint(u.lat, u.lon, w.bearing, w.dist);
      for (const nb of CFG.nebulas) nb.ll = destPoint(u.lat, u.lon, nb.bearing, nb.dist);
      const note = document.querySelector('#screen-map .vitrine-note');
      if (note) note.textContent = 'Real GPS and compass — wearers are placed around your real position. Walk toward them: the distance really goes down.';
    }
    // Recalcul réel : cap + distance depuis la position courante.
    for (const w of S.wearers) {
      if (!w.ll) continue;
      w.bearing = bearingTo(u, w.ll);
      w.dist = haversineM(u, w.ll);
    }
    for (const nb of CFG.nebulas) {
      if (!nb.ll) continue;
      nb.bearing = bearingTo(u, nb.ll);
      nb.dist = haversineM(u, nb.ll);
    }
    setStatus('Real GPS · accuracy ±' + acc + ' m · ' + CFG.wearers.length +
      ' wearers around me' +
      (S.headingMode === 'abs' ? ' · compass on' : (S.headingOn ? ' · demo compass' : '')));
  }
  function onGpsError() {
    if (!S.gpsOn) setStatus(simStatus());
  }

  /* ---------------- dessin ---------------- */
  function draw() {
    const ctx = S.ctx; if (!ctx) return;
    const W = S.w, H = S.h, t = S.t;
    const headRad = -S.heading * Math.PI / 180;

    // Fond : bleu nuit profond (référence « carte en profondeur »).
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#081231'); bg.addColorStop(0.55, '#050a20'); bg.addColorStop(1, '#02040c');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // Halo d'horizon en haut : la profondeur.
    const hor = ctx.createRadialGradient(S.cx, -S.R * 0.4, 0, S.cx, -S.R * 0.4, S.R * 1.7);
    hor.addColorStop(0, 'rgba(64,120,255,.16)'); hor.addColorStop(1, 'rgba(64,120,255,0)');
    ctx.fillStyle = hor; ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath(); ctx.arc(S.cx, S.cy, S.R, 0, Math.PI * 2); ctx.clip();

    /* ===== CALQUE MONDE (tourne avec la boussole) ===== */
    ctx.save();
    ctx.translate(S.cx, S.cy); ctx.rotate(headRad); ctx.translate(-S.cx, -S.cy);

    // Étoiles de fond.
    for (const st of S.nebStars) {
      const tw = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.4 + st.p));
      ctx.fillStyle = 'rgba(190,205,255,' + (tw * 0.45) + ')';
      ctx.beginPath(); ctx.arc(S.cx + st.x, S.cy + st.y, 1.1, 0, Math.PI * 2); ctx.fill();
    }

    // Bâtiments : blocs bleu acier, un peu plus présents.
    for (const b of S.buildings) {
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      ctx.fillStyle = 'rgba(96,126,220,' + (b.a * 1.5) + ')';
      ctx.strokeStyle = 'rgba(150,180,255,' + (b.a * 1.6) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-b.w / 2, -b.h / 2, b.w, b.h, 3);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // Rues : secondaires bleu acier, boulevards ORANGE NÉON (la réf.).
    ctx.lineCap = 'round';
    for (const s of S.streets) {
      if (s.kind === 'blvd') continue;
      ctx.strokeStyle = 'rgba(110,145,235,' + (s.a * 1.5) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + Math.cos(s.dir) * s.len, s.y + Math.sin(s.dir) * s.len);
      ctx.stroke();
    }
    ctx.save();
    ctx.shadowColor = 'rgba(255,132,38,.85)';
    ctx.shadowBlur = 13;
    for (const s of S.streets) {
      if (s.kind !== 'blvd') continue;
      ctx.strokeStyle = 'rgba(255,138,42,' + Math.min(0.85, s.a * 6.5) + ')';
      ctx.lineWidth = 4;
      ctx.beginPath();
      const x0 = S.cx - S.R * 1.2, x1 = S.cx + S.R * 1.2;
      const y = S.cy + s.y0;
      ctx.moveTo(x0, y + Math.sin(s.rot) * S.R * 0.4);
      ctx.quadraticCurveTo(S.cx, y + s.bend, x1, y - Math.sin(s.rot) * S.R * 0.4);
      ctx.stroke();
    }
    ctx.restore();

    // Nébuleuses : halos + points scintillants.
    for (const nb of CFG.nebulas) {
      const p = projectRaw(nb.bearing, nb.dist);
      const rr = ringR(nb.radiusM) * (1 + 0.05 * Math.sin(t * 0.9 + nb.bearing));
      for (let k = 3; k >= 1; k--) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr * k / 3);
        g.addColorStop(0, nb.color + '2e');
        g.addColorStop(1, nb.color + '00');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr * k / 3, 0, Math.PI * 2); ctx.fill();
      }
      const rnd = mulberry32(nb.bearing * 7);
      for (let i = 0; i < 12; i++) {
        const a2 = rnd() * Math.PI * 2, d2 = Math.sqrt(rnd()) * rr * 0.8;
        const tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2 + i * 1.7 + nb.bearing));
        ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * tw) + ')';
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a2) * d2, p.y + Math.sin(a2) * d2, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Anneaux de distance + croix (le quadrillage tourne avec le monde).
    [100, 250, 500].forEach(d => {
      ctx.beginPath();
      ctx.arc(S.cx, S.cy, ringR(d), 0, Math.PI * 2);
      ctx.strokeStyle = d === 500 ? 'rgba(255,150,60,.35)' : 'rgba(160,190,255,.13)';
      ctx.lineWidth = 1; ctx.stroke();
    });
    ctx.strokeStyle = 'rgba(160,190,255,.10)';
    ctx.beginPath();
    ctx.moveTo(S.cx - S.R, S.cy); ctx.lineTo(S.cx + S.R, S.cy);
    ctx.moveTo(S.cx, S.cy - S.R); ctx.lineTo(S.cx, S.cy + S.R);
    ctx.stroke();

    // Balayage radar AMBRE (il appartient au monde, il tourne avec lui).
    const sweep = (t * 0.45) % (Math.PI * 2);
    for (let i = 0; i < 30; i++) {
      const a0 = sweep - i * 0.022, a1 = a0 - 0.023;
      ctx.beginPath();
      ctx.moveTo(S.cx, S.cy);
      ctx.arc(S.cx, S.cy, S.R, -a1 - Math.PI / 2, -a0 - Math.PI / 2, true);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,170,60,' + (0.055 * (1 - i / 30)) + ')';
      ctx.fill();
    }

    // Porteurs : halos + pastilles (les textes restent droits, plus bas).
    for (const w of S.wearers) {
      if (!S.gpsOn) {
        w.curDist = Math.round(w.dist + Math.sin(t * 0.11 + w.phase) * 8);
      } else {
        w.curDist = Math.max(1, Math.round(w.dist));
      }
      const wb = S.gpsOn ? w.bearing : w.bearing + Math.sin(t * 0.07 + w.phase * 2) * 1.6;
      const p = projectRaw(wb, w.curDist);
      w.x = S.cx + (p.x - S.cx) * Math.cos(headRad) - (p.y - S.cy) * Math.sin(headRad);
      w.y = S.cy + (p.x - S.cx) * Math.sin(headRad) + (p.y - S.cy) * Math.cos(headRad);
      w._wb = wb;
      const bRad = wb * Math.PI / 180;
      let diff = Math.abs(((bRad - sweep) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < 0.12) w.ping = 1;
      w.ping *= 0.965;

      const col = EL_COLORS[w.sign.element] || '#ffb46a';
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 26 + w.ping * 16);
      glow.addColorStop(0, col + '55'); glow.addColorStop(1, col + '00');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(p.x, p.y, 26 + w.ping * 16, 0, Math.PI * 2); ctx.fill();

      ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10,14,30,.94)'; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.6 + w.ping * 1.2; ctx.stroke();
    }

    ctx.restore();   // fin du calque monde
    ctx.restore();   // fin du clip disque

    /* ===== TEXTES DROITS (positions via project, boussole incluse) ===== */
    // Étiquettes des anneaux, le long de l'axe nord affiché.
    ctx.font = '10px "Space Grotesk", system-ui, sans-serif';
    ctx.textAlign = 'left';
    [100, 250, 500].forEach(d => {
      const p = project(0, d);
      ctx.fillStyle = 'rgba(190,205,255,.5)';
      ctx.fillText(d + ' m', p.x + 5, p.y + 3);
    });
    // Le N : il se déplace sur le bord selon la boussole.
    {
      const p = project(0, CFG.radiusM);
      const dx = p.x - S.cx, dy = p.y - S.cy, L = Math.hypot(dx, dy) || 1;
      ctx.font = '700 12px "Space Grotesk", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffab52';
      ctx.fillText('N', p.x + dx / L * 13, p.y + dy / L * 13 + 4);
    }
    // Nébuleuses : noms droits.
    ctx.font = '600 9px "Space Grotesk", system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const nb of CFG.nebulas) {
      const p = project(nb.bearing, nb.dist);
      ctx.fillStyle = 'rgba(230,230,255,.55)';
      ctx.fillText('N E B U L A', p.x, p.y + ringR(nb.radiusM) + 13);
    }
    // Porteurs : glyphe + distance, droits.
    for (const w of S.wearers) {
      ctx.font = '15px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(w.sign.glyph, w.x, w.y + 1);
      ctx.font = '600 10px "Space Grotesk", system-ui, sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(235,235,255,.88)';
      ctx.fillText(w.curDist + ' m', w.x, w.y + 28);
      // LE WAVE : le point VERT des porteurs ouverts aux rencontres.
      if (w.openToMeet) {
        const pr = 4.6 + 0.9 * Math.sin(t * 3 + w.phase);
        ctx.beginPath(); ctx.arc(w.x + 13, w.y - 13, pr + 3.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(46,230,107,.22)'; ctx.fill();
        ctx.beginPath(); ctx.arc(w.x + 13, w.y - 13, pr, 0, Math.PI * 2);
        ctx.fillStyle = '#2ee66b'; ctx.fill();
        ctx.strokeStyle = '#eafff1'; ctx.lineWidth = 1.4; ctx.stroke();
      }
      // L'anneau qui s'étend quand ce porteur te répond d’un wave.
      if (w.waveFlash > 0.01) {
        ctx.beginPath(); ctx.arc(w.x, w.y, 16 + (1 - w.waveFlash) * 30, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(46,230,107,' + (w.waveFlash * 0.8).toFixed(3) + ')';
        ctx.lineWidth = 2.5; ctx.stroke();
        w.waveFlash *= 0.94;
      }
    }

    // Toi, au centre — avec ton cône de regard si la boussole est active
    // (le haut de l'écran = là où tu regardes).
    if (S.headingOn) {
      const cg = ctx.createRadialGradient(S.cx, S.cy - 16, 0, S.cx, S.cy - 16, 34);
      cg.addColorStop(0, 'rgba(255,170,70,.35)'); cg.addColorStop(1, 'rgba(255,170,70,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(S.cx, S.cy);
      ctx.arc(S.cx, S.cy, 34, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42);
      ctx.closePath(); ctx.fill();
    }
    const pulse = 1 + 0.25 * Math.sin(t * 2.4);
    const ug = ctx.createRadialGradient(S.cx, S.cy, 0, S.cx, S.cy, 20 * pulse);
    ug.addColorStop(0, 'rgba(255,154,66,.5)'); ug.addColorStop(1, 'rgba(255,154,66,0)');
    ctx.fillStyle = ug;
    ctx.beginPath(); ctx.arc(S.cx, S.cy, 20 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(S.cx, S.cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#ff9a42'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = '700 9px "Space Grotesk", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillText('YOU', S.cx, S.cy + 18);
    // LE WAVE : ouvert = un anneau vert pulse autour de toi.
    if (S.wave.open) {
      ctx.beginPath(); ctx.arc(S.cx, S.cy, 13 + 2.5 * Math.sin(t * 3), 0, Math.PI * 2);
      ctx.strokeStyle = '#2ee66b'; ctx.lineWidth = 2.5; ctx.stroke();
    }

    // Vignette : la profondeur sur les bords du cadre.
    const vg = ctx.createRadialGradient(S.cx, S.cy, S.R * 0.55, S.cx, S.cy, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,10,0)'); vg.addColorStop(1, 'rgba(0,0,10,.42)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  /* ---------------- boucle, seulement écran visible ---------------- */
  function loop(now) {
    const screen = $('screen-map');
    if (!screen || !screen.classList.contains('active') || document.hidden) {
      S.raf = 0; return;   // on s'arrête ; ensureInit relancera
    }
    S.raf = requestAnimationFrame(loop);
    const dt = Math.min((now - (S.last || now)) / 1000, 0.08);
    S.last = now; S.t += dt;
    // Cap lissé, au plus court chemin (pas de saut 359° -> 0°), avec
    // zone morte : sous 0,8°, on ne bouge pas (anti-tremblement v1.9.13).
    if (S.headingOn) {
      const dh = angleDelta(S.heading, S.headingTarget);
      if (Math.abs(dh) > 0.8) S.heading += dh * Math.min(1, dt * 3.4);
    }
    draw();
  }
  function kick() {
    if (!S.raf) { S.last = 0; S.raf = requestAnimationFrame(loop); }
  }

  /* ---------------- interaction : la fiche sous le radar ---------------- */
  function showInfo(html) {
    const box = $('map-info');
    if (!box) return;
    box.innerHTML = html;
    box.style.display = 'block';
  }
  function hideInfo() {
    const box = $('map-info');
    if (box) box.style.display = 'none';
  }

  function onTap(ev) {
    const r = S.canvas.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    for (const w of S.wearers) {
      if (Math.hypot(x - w.x, y - w.y) <= 34) {
        showInfo(
          '<div class="mi-glyph" style="color:' + (EL_COLORS[w.sign.element] || '#ffb46a') + '">' + w.sign.glyph + '</div>' +
          '<div class="mi-name">' + w.sign.name + ' — ' + w.curDist + ' m away</div>' +
          '<div class="mi-sub">' + (w.openToMeet
            ? '🟢 Open to encounters — this wearer is waving. Go say hi, then scan.'
            : 'A wearer near you. No green dot: they have not opened themselves to encounters.') + '</div>' +
          '<div class="row"><button class="ghost" id="mi-scan">◉ Open the scanner</button></div>'
        );
        const b = $('mi-scan');
        if (b) b.addEventListener('click', openScanner);
        return;
      }
    }
    for (const nb of CFG.nebulas) {
      const p = project(nb.bearing, nb.dist);
      if (Math.hypot(x - p.x, y - p.y) <= ringR(nb.radiusM)) {
        showInfo(
          '<div class="mi-glyph" style="color:' + nb.color + '">✦</div>' +
          '<div class="mi-name">' + nb.name + ' — ~' + Math.round(nb.dist) + ' m away</div>' +
          '<div class="mi-sub">A strong concentration of wearers: this is where you meet, scan and collect.</div>'
        );
        return;
      }
    }
    hideInfo();
  }

  /* ================= LE WAVE (v1.9.103, renommé en v1.9.104) =================
     Idée d'Hamza (2 nov) : le salut de Facebook, mais dans la rue et
     CONSENTI — un WAVE géolocalisé. Je me déclare ouvert (« je suis là, scanne-moi ») pour
     30 minutes ; seuls les porteurs ouverts portent le point vert et
     peuvent me répondre d'un wave. Aucun serveur pour la démo : l'état
     vit dans le téléphone, les porteurs sont ceux de la carte. La
     version réelle (des inconnus qui se voient en direct) passera
     par le backend prévu après le hackathon — la règle de
     consentement, elle, est déjà là, dans ce code. */

  const WAVE_KEY = 'astrocode_wave_v1';
  const WAVE_MS = 30 * 60 * 1000;   // une ouverture dure 30 minutes

  function openScanner() {
    if (window.ASTRO_SHOW) { window.ASTRO_SHOW('screen-scan'); return; }
    const nav = document.querySelector('[data-screen="screen-scan"]');
    if (nav) nav.click();
  }

  function renderWaveBtn() {
    const b = $('btn-wave');
    if (!b) return;
    b.innerHTML = S.wave.open
      ? '🟢&ensp;YOU ARE OPEN — TAP TO CLOSE'
      : '👋&ensp;WAVE — I’M OPEN TO A SCAN';
  }

  function loadWave() {
    try {
      const p = JSON.parse(localStorage.getItem(WAVE_KEY) || 'null');
      if (p && p.open && p.until > Date.now()) { S.wave.open = true; S.wave.until = p.until; }
    } catch (e) {}
    renderWaveBtn();
  }

  function setWave(on) {
    S.wave.open = on;
    S.wave.until = on ? Date.now() + WAVE_MS : 0;
    if (S.wave.timer) { clearTimeout(S.wave.timer); S.wave.timer = null; }
    try { localStorage.setItem(WAVE_KEY, JSON.stringify({ open: on, until: S.wave.until })); } catch (e) {}
    renderWaveBtn();
    if (on) {
      setStatus('🟢 You are open to encounters for 30 min — open wearers can wave back.');
      // Démo : un porteur ouvert proche répond au wave après quelques
      // secondes — la boucle complète se voit sans attendre.
      S.wave.timer = setTimeout(waveBack, 5000);
    } else {
      setStatus('You are no longer open to encounters.');
    }
  }

  function waveBack() {
    S.wave.timer = null;
    if (!S.wave.open) return;
    const open = S.wearers.filter(w => w.openToMeet);
    if (!open.length) return;
    const w = open.reduce((a, b) => (a.curDist <= b.curDist ? a : b));
    w.waveFlash = 1;
    showInfo(
      '<div class="mi-glyph" style="color:' + (EL_COLORS[w.sign.element] || '#ffb46a') + '">' + w.sign.glyph + '</div>' +
      '<div class="mi-name">' + w.sign.name + ' — ' + w.curDist + ' m away</div>' +
      '<div class="mi-sub">✦ ' + w.sign.name + ' waved back — open to a scan. Go say hi, then scan.</div>' +
      '<div class="row"><button class="ghost" id="mi-scan">◉ Open the scanner</button></div>'
    );
    const b = $('mi-scan');
    if (b) b.addEventListener('click', openScanner);
  }

  /* ---------------- démarrage ---------------- */
  function ensureInit() {
    if (!ensureCanvas()) return;
    resize();
    if (!S.inited) {
      buildWearers();
      S.inited = true;
      setStatus(simStatus());
    }
    startSensors();
    kick();
  }

  function init() {
    const pb = $('btn-wave');
    if (pb) pb.addEventListener('click', () => setWave(!S.wave.open));
    loadWave();
    const navBtn = $('nav-map-btn');
    if (navBtn) navBtn.addEventListener('click', ensureInit);
    document.querySelectorAll('[data-screen="screen-map"]').forEach(b =>
      b.addEventListener('click', ensureInit));
  }

  // API publique (debug / tests).
  window.MAP_TAB = { ensureInit, config: CFG, state: S };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
