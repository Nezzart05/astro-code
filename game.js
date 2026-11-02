/* ============================================================================
   GAME.JS — Le volet JEU d'Astro Code : « Ta constellation »
   ----------------------------------------------------------------------------
   Intégré le 20 oct 2026 depuis le prototype validé par Hamza
   (artifact « Constellation — test de style », v3) :
   - Espace libre : on NAGE au doigt dans toutes les directions (plus de sol).
   - Style Petit Planet : 3D low poly douce, couleurs pastel, lune et
     planètes-jouets flottantes SANS collision.
   - Le joueur = un koï (Poissons) low poly ; les porteurs = des créatures-
     signes avec halo, pseudo et distance en direct.
   - Zone chaude : une nébuleuse avec des porteurs ANONYMES (présence sans
     traçage — le système de vie privée d'Hamza).
   - Voix d'accueil douce à l'entrée, message DIFFÉRENT à chaque fois.
   - Musique cosy générative (WebAudio, aucun fichier, libre de droits).
   - Bouton ● REC : filme l'exploration, puis partage (FB/IG/…) avec un
     message pré-écrit — la boucle virale qu'aime Meta.

   PORTEURS : mode DÉMO (positions simulées, comme la carte). Le miroir GPS
   réel (positions relatives vraies) se branchera sur le même tableau
   WEARERS quand le backend arrivera.

   MODÈLES D'HAMZA : chaque créature a un SLOT .glb — déposer le fichier
   dans assets/models/<signe>.glb (voir spec-modeles-3d-astro-code.md) et
   il remplace automatiquement la créature procédurale, sans toucher au code.
   ============================================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const SIGNS = window.SIGNS || [];
const signById = (id) => SIGNS.find((s) => s.id === id) || { name: id, glyph: '✦' };

/* Couleurs pastel par signe (style Petit Planet) */
const SIGN_COLORS = {
  poissons: '#ff9d5c', belier: '#ff6b6b', taureau: '#7bc47f', gemeaux: '#ffd479',
  cancer: '#f7a8c4', lion: '#ffb84d', vierge: '#a8d8a8', balance: '#c3aef0',
  scorpion: '#e05c7a', sagittaire: '#ff8a5c', capricorne: '#9db4c0', verseau: '#6bc5e8',
};

/* Porteurs simulés (démo) — positions dans le monde du jeu (1 unité = 1 m) */
const WEARERS = [
  { sign: 'lion',       pseudo: 'Leo_fier',  x: 120,  y: 60 },
  { sign: 'gemeaux',    pseudo: 'Nina.g',    x: -140, y: 85 },
  { sign: 'balance',    pseudo: 'Sofia.b',   x: 40,   y: -95 },
  { sign: 'scorpion',   pseudo: 'Omar_k',    x: -185, y: -40 },
  { sign: 'sagittaire', pseudo: 'Yanis.9',   x: 215,  y: 120 },
  { sign: 'capricorne', pseudo: 'Lina.m',    x: -60,  y: 140 },
  { sign: 'verseau',    pseudo: 'Hugo.v',    x: 90,   y: 150 },
  { sign: 'cancer',     pseudo: 'Maya.r',    x: -230, y: 30 },
  { sign: 'belier',     pseudo: 'Adam.z',    x: 150,  y: -150 },
  { sign: 'taureau',    pseudo: 'Ines.t',    x: -120, y: -140 },
  { sign: 'vierge',     pseudo: 'Noah.p',    x: 30,   y: 40 },
];
const NEBULA = { x: 185, y: -85, r: 62 };           // la zone chaude
const ANONS = [ { x: 168, y: -68 }, { x: 206, y: -102 } ]; // porteurs anonymes dedans

const WORLD = { x: 300, y: 185 };                  // demi-étendue du monde
const ENCOUNTER_R = 30;                            // rayon de rencontre (m)

/* La voix de TON signe (v1.9.14, demande d'Hamza) : en entrant dans ta
   constellation, tu entres dans ton journal intime. Un texte par signe —
   traits de caractère, mot du jour — lu par une voix humaine douce
   (fichiers assets/audio/voice-*-en.mp3, branchés dans meta-ai.js). */
const SIGN_WELCOMES = {
  belier: "Welcome home, Aries. This is your constellation — the quiet place that belongs to you alone. You were born moving. When you want something, the whole sky knows it. Today, aim that fire at one thing only, and let the world keep up. Someone out there matches your speed. Your sign is closer than you think.",
  taureau: "Welcome home, Taurus. This is your constellation — the quiet place that belongs to you alone. You build slowly, and what you build lasts. Trust that pace today. A small pleasure is waiting where you least expect it, and someone steady is walking your way. Your sign is closer than you think.",
  gemeaux: "Welcome home, Gemini. This is your constellation — the quiet place that belongs to you alone. Two voices live in you, and both are telling the truth. Today, let the curious one lead. A conversation will open a door you didn't know existed. Your sign is closer than you think.",
  cancer: "Welcome home, Cancer. This is your constellation — the quiet place that belongs to you alone. Soft outside, armor inside, and a heart that remembers everything. Today, let someone take care of you for once. The tide is bringing a familiar soul closer. Your sign is closer than you think.",
  lion: "Welcome home, Leo. This is your constellation — the quiet place that belongs to you alone. You don't chase the light. You are the light. Today, shine without asking permission. The right eyes are already looking for you. Your sign is closer than you think.",
  vierge: "Welcome home, Virgo. This is your constellation — the quiet place that belongs to you alone. You see the detail everyone else misses. That is your quiet weapon. Today, let one thing be imperfect, and watch nothing fall apart. Someone appreciates exactly how you are. Your sign is closer than you think.",
  balance: "Welcome home, Libra. This is your constellation — the quiet place that belongs to you alone. Balance is your sport, and beauty is your language. Today, choose with your heart first. Your scales will follow. A harmonious soul is orbiting nearer. Your sign is closer than you think.",
  scorpion: "Welcome home, Scorpio. This is your constellation — the quiet place that belongs to you alone. You strike once, and you aim true. But today, let your guard down by one degree. Intensity shared is intensity doubled, and someone unafraid is close. Your sign is closer than you think.",
  sagittaire: "Welcome home, Sagittarius. This is your constellation — the quiet place that belongs to you alone. The horizon or nothing. That's always been your rule. Today, the horizon is coming to you. Keep your bag light and your laugh ready. A fellow traveler is near. Your sign is closer than you think.",
  capricorne: "Welcome home, Capricorn. This is your constellation — the quiet place that belongs to you alone. Slow, sure, unstoppable. While others sprint, you climb. Today, look up from the mountain for a moment. The view includes someone climbing toward you. Your sign is closer than you think.",
  verseau: "Welcome home, Aquarius. This is your constellation — the quiet place that belongs to you alone. The future doesn't wait for you. You are already living in it. Today, share one of your strange, beautiful ideas. The right mind will recognize it instantly. Your sign is closer than you think.",
  poissons: "Welcome home, Pisces. This is your constellation — the quiet place that belongs to you alone. You feel the world before you understand it, and that is not a weakness. It is your compass. Today, keep your heart open and your eyes soft. Someone is swimming toward your shore. Your sign is closer than you think.",
};

/* ------------------------------------------------------------------ état */
const S = {
  inited: false, active: false, raf: 0, last: 0,
  renderer: null, scene: null, camera: null, holder: null,
  player: null, playerPos: new THREE.Vector3(0, 0, 0),
  target: null, vel: new THREE.Vector3(),
  creatures: [], mixers: [], metCount: 0, lastMet: null,
  cardFor: null, lastWelcome: -1, bubbleTimer: 0,
  camPos: new THREE.Vector3(0, 0, 200),
};
const loader = new GLTFLoader();

/* ------------------------------------------------------- textures canvas */
function radialTex(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, inner); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function glyphTex(glyph, color) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '84px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 16;
  g.fillStyle = '#ffffff'; g.fillText(glyph, 64, 70);
  return new THREE.CanvasTexture(c);
}
function flowerTex(color) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.translate(32, 32); g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 10;
  for (let i = 0; i < 5; i++) {
    g.rotate((Math.PI * 2) / 5);
    g.beginPath(); g.ellipse(0, -11, 5.5, 11, 0, 0, Math.PI * 2); g.fill();
  }
  g.beginPath(); g.arc(0, 0, 4.5, 0, Math.PI * 2); g.fillStyle = '#fff6d8'; g.fill();
  return new THREE.CanvasTexture(c);
}
function moonTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffd98a'; g.shadowColor = '#ffca66'; g.shadowBlur = 34;
  g.beginPath(); g.arc(128, 128, 92, 0, Math.PI * 2); g.fill();
  g.shadowBlur = 0; g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(168, 104, 78, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
}
let TEX = null;
function makeTextures() {
  TEX = {
    glow: radialTex('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'),
    flowerA: flowerTex('#8be9ff'), flowerB: flowerTex('#ffd479'), flowerC: flowerTex('#ffb7dd'),
    moon: moonTex(),
  };
}
function glowSprite(color, scale, opacity) {
  const m = new THREE.SpriteMaterial({ map: TEX.glow, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  const sp = new THREE.Sprite(m); sp.scale.set(scale, scale, 1);
  return sp;
}

/* ------------------------------------------------------------- le joueur */
function buildKoi() {
  const grp = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: 0xff8a4d, flatShading: true, roughness: 0.8 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xfff3e0, flatShading: true, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), orange);
  body.scale.set(1.7, 0.62, 0.5); grp.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(3.0, 10, 8), cream);
  belly.scale.set(1.55, 0.5, 0.42); belly.position.y = -0.55; grp.add(belly);
  const spot = new THREE.Mesh(new THREE.SphereGeometry(1.25, 8, 6), cream);
  spot.scale.set(1.2, 0.35, 0.6); spot.position.set(-0.8, 1.55, 0); grp.add(spot);
  const tail = new THREE.Group(); tail.position.set(-6.1, 0, 0);
  const tailFin = new THREE.Mesh(new THREE.ConeGeometry(1.9, 3.6, 4), orange);
  tailFin.rotation.z = Math.PI / 2; tailFin.scale.set(1, 1, 0.28); tail.add(tailFin); grp.add(tail);
  [-1, 1].forEach((side) => {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.4, 4), cream);
    fin.position.set(1.2, -0.7, side * 1.8); fin.rotation.x = side * 1.9; fin.scale.set(1, 1, 0.3);
    grp.add(fin);
  });
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.34, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x1a1430 }));
    eye.position.set(4.6, 0.55, side * 1.15); grp.add(eye);
  });
  const halo = glowSprite(0xffa25e, 26, 0.5); halo.position.z = -1.5; grp.add(halo);
  grp.userData.tail = tail;
  return grp;
}

/* ------------------------------------------------- les créatures-signes */
function buildCreature(w) {
  const sign = signById(w.sign);
  const color = new THREE.Color(SIGN_COLORS[w.sign] || '#ffffff');
  const grp = new THREE.Group();
  grp.position.set(w.x, w.y, 0);
  const halo = glowSprite(color, 30, 0.55); halo.position.z = -1.5; grp.add(halo);
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(4.6, 14, 12),
    new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.65 }));
  grp.add(orb);
  const glyph = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTex(sign.glyph, SIGN_COLORS[w.sign]), transparent: true, depthWrite: false }));
  glyph.scale.set(7.5, 7.5, 1); glyph.position.z = 2; grp.add(glyph);
  const star = glowSprite(0xffd700, 13, 0); star.position.set(4.5, 4.5, 2.5); grp.add(star);
  // étiquette HTML (pseudo + distance)
  const label = document.createElement('div');
  label.className = 'game-label';
  $('game-labels').appendChild(label);
  const c = { ...w, grp, orb, glyph, star, label, met: false, phase: Math.random() * 6.28, anon: false };
  S.creatures.push(c);
  tryLoadModel(w.sign, grp, [orb, glyph], 8.5);
  return c;
}
function buildAnon(a) {
  const grp = new THREE.Group(); grp.position.set(a.x, a.y, 0);
  const halo = glowSprite(0xb18cff, 26, 0.5); halo.position.z = -1.5; grp.add(halo);
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(3.8, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x8f7bd8, flatShading: true, roughness: 0.7, transparent: true, opacity: 0.9 }));
  grp.add(orb);
  const q = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTex('?', '#b18cff'), transparent: true, depthWrite: false }));
  q.scale.set(6, 6, 1); q.position.z = 2; grp.add(q);
  const label = document.createElement('div');
  label.className = 'game-label anon';
  label.textContent = 'zone chaude';
  $('game-labels').appendChild(label);
  const c = { sign: null, pseudo: null, grp, orb, glyph: q, star: null, label, met: false, phase: Math.random() * 6.28, anon: true, x: a.x, y: a.y };
  S.creatures.push(c);
  return c;
}

/* ------------------------------------------- slot modèle .glb (Hamza) */
function tryLoadModel(signId, grp, toHide, targetSize) {
  loader.load(
    `assets/models/${signId}.glb`,
    (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const k = targetSize / maxDim;
      model.scale.setScalar(k);
      model.position.sub(center.multiplyScalar(k));
      toHide.forEach((m) => { m.visible = false; });
      grp.add(model);
      if (gltf.animations && gltf.animations.length) {
        const mixer = new THREE.AnimationMixer(model);
        const clip = gltf.animations.find((a) => /swim|idle/i.test(a.name)) || gltf.animations[0];
        mixer.clipAction(clip).play();
        S.mixers.push(mixer);
      }
      console.info(`[GAME] modèle d'Hamza chargé : ${signId}.glb`);
    },
    undefined,
    () => { /* pas de modèle pour ce signe : la créature procédurale reste */ }
  );
}

/* ---------------------------------------------------------------- décor */
function starLayer(count, z, size, spread) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread.x;
    pos[i * 3 + 1] = (Math.random() - 0.5) * spread.y;
    pos[i * 3 + 2] = z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xdfe8ff, size, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false });
  return new THREE.Points(geo, mat);
}
function buildPlanet(x, y, z, r, colorA, colorB) {
  const grp = new THREE.Group(); grp.position.set(x, y, z);
  const body = new THREE.Mesh(
    new THREE.IcosahedronGeometry(r, 1),
    new THREE.MeshStandardMaterial({ color: colorA, flatShading: true, roughness: 0.9 }));
  grp.add(body);
  for (let i = 0; i < 7; i++) {           // continents en relief
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(r * (0.22 + Math.random() * 0.2), 7, 6),
      new THREE.MeshStandardMaterial({ color: colorB, flatShading: true, roughness: 0.9 }));
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    s.position.set(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.92, r * Math.sin(ph) * Math.sin(th));
    s.scale.y = 0.55; grp.add(s);
  }
  for (let i = 0; i < 4; i++) {           // mini-arbres coniques
    const t = new THREE.Mesh(
      new THREE.ConeGeometry(r * 0.13, r * 0.34, 6),
      new THREE.MeshStandardMaterial({ color: 0x69b96f, flatShading: true, roughness: 0.9 }));
    const th = Math.random() * Math.PI * 2;
    t.position.set(Math.cos(th) * r * 0.8, Math.sin(th) * r * 0.8, r * 0.35);
    t.rotation.z = th + Math.PI / 2; grp.add(t);
  }
  const rim = glowSprite(0x7fd8ff, r * 5.2, 0.30); rim.position.z = -r; grp.add(rim);
  grp.userData.spin = 0.02 + Math.random() * 0.03;
  return grp;
}
function buildDecor() {
  const scene = S.scene;
  scene.add(starLayer(520, -70, 1.6, { x: 1500, y: 950 }));
  scene.add(starLayer(360, -40, 2.2, { x: 1200, y: 760 }));
  scene.add(starLayer(200, -16, 3.0, { x: 950, y: 600 }));
  // voie lactée : bande dense en diagonale
  const n = 700, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = Math.random() - 0.5;
    pos[i * 3] = t * 1300 + (Math.random() - 0.5) * 130;
    pos[i * 3 + 1] = t * 620 + (Math.random() - 0.5) * 130;
    pos[i * 3 + 2] = -85;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xaFC4ff, size: 1.3, transparent: true, opacity: 0.55, depthWrite: false })));
  // fleurs-étoiles scintillantes
  S.flowers = [];
  const ftex = [TEX.flowerA, TEX.flowerB, TEX.flowerC];
  for (let i = 0; i < 42; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ftex[i % 3], transparent: true, depthWrite: false, opacity: 0.85 }));
    const sc = 2.2 + Math.random() * 3.4;
    sp.scale.set(sc, sc, 1);
    sp.position.set((Math.random() - 0.5) * 860, (Math.random() - 0.5) * 520, -8 - Math.random() * 30);
    sp.userData.phase = Math.random() * 6.28;
    S.flowers.push(sp); scene.add(sp);
  }
  // la lune (décor pur — AUCUNE collision)
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.moon, transparent: true, depthWrite: false }));
  moon.scale.set(64, 64, 1); moon.position.set(-215, 128, -45); scene.add(moon);
  // planètes-jouets Petit Planet (repères flottants, sans collision)
  S.planets = [
    buildPlanet(238, 138, -50, 17, 0x7fd1c0, 0x4da58c),
    buildPlanet(-252, -128, -42, 13, 0xf2c9bb, 0xd88ca0),
    buildPlanet(40, 168, -58, 11, 0xa8c8f0, 0x6f9fd8),
  ];
  S.planets.forEach((p) => scene.add(p));
  // nébuleuse = la zone chaude (nappe lumineuse pulsante)
  S.nebulaSprites = [];
  const cols = [0x8a5cff, 0xff5da2, 0x37c8d9, 0xb18cff];
  for (let i = 0; i < 13; i++) {
    const sp = glowSprite(cols[i % 4], 55 + Math.random() * 65, 0.16 + Math.random() * 0.1);
    const a = Math.random() * Math.PI * 2, rr = Math.random() * NEBULA.r * 0.75;
    sp.position.set(NEBULA.x + Math.cos(a) * rr, NEBULA.y + Math.sin(a) * rr, -6);
    sp.userData.phase = Math.random() * 6.28;
    S.nebulaSprites.push(sp); scene.add(sp);
  }
}

/* ----------------------------------------------------------------- init */
function init() {
  makeTextures();
  S.holder = $('game-holder');
  S.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
  S.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  S.renderer.setClearColor(0x070b1e, 1);
  S.holder.appendChild(S.renderer.domElement);
  S.scene = new THREE.Scene();
  S.scene.fog = new THREE.Fog(0x070b1e, 260, 620);
  S.camera = new THREE.PerspectiveCamera(58, 1, 1, 1000);
  S.camera.position.copy(S.camPos);
  S.scene.add(new THREE.AmbientLight(0xbfc8ff, 0.85));
  const sun = new THREE.DirectionalLight(0xfff1d6, 0.9);
  sun.position.set(60, 90, 120); S.scene.add(sun);
  buildDecor();
  S.player = buildKoi();
  S.player.position.copy(S.playerPos);
  S.scene.add(S.player);
  tryLoadModel('poissons', S.player, S.player.children.slice(), 12);
  WEARERS.forEach(buildCreature);
  ANONS.forEach(buildAnon);
  bindInput();
  bindUi();
  resize();
  window.addEventListener('resize', resize);
  S.inited = true;
}
function resize() {
  if (!S.renderer || !S.holder) return;
  const w = S.holder.clientWidth || 320, h = S.holder.clientHeight || 380;
  S.renderer.setSize(w, h);
  S.camera.aspect = w / h; S.camera.updateProjectionMatrix();
}

/* --------------------------------------------------------------- entrée */
function bindInput() {
  const el = S.renderer.domElement;
  const setTarget = (e) => {
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(S.camera);
    const dir = v.sub(S.camera.position).normalize();
    const t = -S.camera.position.z / dir.z;
    const p = S.camera.position.clone().add(dir.multiplyScalar(t));
    p.x = THREE.MathUtils.clamp(p.x, -WORLD.x, WORLD.x);
    p.y = THREE.MathUtils.clamp(p.y, -WORLD.y, WORLD.y);
    p.z = 0;
    S.target = p;
  };
  el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); setTarget(e); });
  el.addEventListener('pointermove', (e) => { if (e.buttons) setTarget(e); });
  el.addEventListener('pointerup', () => { /* on garde la cible : le koï s'y rend et s'y repose */ });
}
function bindUi() {
  $('game-card-close').addEventListener('click', () => { S.cardFor = null; $('game-card').style.display = 'none'; });
  $('game-card-btn').addEventListener('click', meetCurrent);
  $('btn-game-music').addEventListener('click', () => Music.toggle());
  $('btn-game-rec').addEventListener('click', () => Rec.toggle());
}

/* ------------------------------------------------------------- rencontre */
function meetCurrent() {
  const c = S.cardFor;
  if (!c || c.anon || c.met) return;
  c.met = true; S.metCount++; S.lastMet = c;
  c.star.material.opacity = 0.95;
  if (c.orb && c.orb.material.emissive) c.orb.material.emissive = new THREE.Color(0x8a6420);
  $('game-count').textContent = `${S.metCount}/12 met`;
  $('game-card').style.display = 'none'; S.cardFor = null;
  const sign = signById(c.sign);
  bubble(`✦ ${sign.name} (@${c.pseudo}) joins your constellation!`, 3800);
}

/* ------------------------------------------------------------ bulle/voix */
function bubble(text, ms) {
  const b = $('game-bubble');
  b.textContent = text; b.style.display = 'block';
  clearTimeout(S.bubbleTimer);
  S.bubbleTimer = setTimeout(() => { b.style.display = 'none'; }, ms || 4500);
}
function welcome() {
  // v1.9.14 — l'accueil n'est plus aléatoire : c'est la voix de TON
  // signe (le joueur est le koï Poissons ; un profil pourra poser
  // window.ASTRO_OWN_SIGN plus tard).
  // v1.9.17 — PLUS DE BULLE DE TEXTE (demande d'Hamza : le texte
  // cachait toute la constellation). Il ne reste que LA VOIX, douce,
  // et une petite ligne en bas : le nom de la constellation du jour.
  // v1.9.55 — focus dédié : arrivé depuis la fiche d'un signe, la
  // constellation accueille avec LA VOIX DE CE SIGNE (consommé 1 fois).
  const ownSign = window.ASTRO_FOCUS_SIGN || window.ASTRO_OWN_SIGN || 'poissons';
  window.ASTRO_FOCUS_SIGN = null;
  const text = SIGN_WELCOMES[ownSign] || SIGN_WELCOMES.poissons;
  const cap = $('game-caption');
  if (cap) {
    const s = signById(ownSign);
    cap.textContent = '✦ ' + String(s.name || 'PISCES').toUpperCase() + ' CONSTELLATION';
  }
  if (window.META_AI) window.META_AI.narrate(text, ownSign);
}

/* ------------------------------------------------------ musique cosy IA */
/* Générative WebAudio : nappes d'accords doux + petites cloches
   pentatoniques, esprit exploration Pokémon GO. Aucun fichier audio,
   100 % libre de droits. Démarre sur geste (entrée dans le jeu). */
const Music = {
  ctx: null, master: null, on: true, timers: [],
  start() {
    if (!this.on) return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.0;
        this.master.connect(this.ctx.destination);
      }
      this.ctx.resume();
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(0.055, this.ctx.currentTime + 1.6);
      if (!this._scheduled) { this._scheduled = true; this.chordLoop(0); this.bellLoop(); }
    } catch (e) { /* audio indispo : le jeu reste silencieux */ }
  },
  stop() {
    if (!this.ctx || !this.master) return;
    try {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + 0.5);
      setTimeout(() => { if (this.ctx && !S.active) this.ctx.suspend(); }, 650);
    } catch (e) {}
  },
  toggle() {
    this.on = !this.on;
    $('btn-game-music').textContent = this.on ? '🔊' : '🔇';
    if (this.on && S.active) this.start(); else this.stop();
  },
  chordLoop(i) {
    const CHORDS = [
      [110.00, 164.81, 196.00, 261.63],   // Am7
      [87.31, 130.81, 164.81, 220.00],    // Fmaj7
      [130.81, 196.00, 246.94, 329.63],   // Cmaj7
      [98.00, 146.83, 246.94, 329.63],    // G6
    ];
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    CHORDS[i % CHORDS.length].forEach((f) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 2.6);
      g.gain.setValueAtTime(0.16, t + 5.2);
      g.gain.linearRampToValueAtTime(0, t + 8.2);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 8.4);
    });
    this.timers.push(setTimeout(() => {
      if (this.on && S.active) this.chordLoop(i + 1); else this._scheduled = false;
    }, 7000));
  },
  bellLoop() {
    if (!this.ctx) return;
    const NOTES = [440, 523.25, 587.33, 659.25, 783.99, 880];
    const f = NOTES[Math.floor(Math.random() * NOTES.length)] * (Math.random() < 0.3 ? 0.5 : 1);
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.10, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 2);
    this.timers.push(setTimeout(() => {
      if (this.on && S.active) this.bellLoop(); else this._scheduled = false;
    }, 2300 + Math.random() * 3400));
  },
};

/* ------------------------------------------------------------ REC/partage */
/* Filme le canvas du jeu (captureStream + MediaRecorder), puis partage
   via le panneau natif (Facebook, Instagram, …) avec le message pré-écrit
   d'Hamza. Repli : téléchargement de la vidéo + message affiché. */
const Rec = {
  rec: null, chunks: [], timer: null, startedAt: 0,
  toggle() { this.rec ? this.stop() : this.start(); },
  start() {
    const canvas = S.renderer && S.renderer.domElement;
    if (!canvas || !canvas.captureStream || !window.MediaRecorder) {
      bubble('Recording is not supported in this browser.', 3500); return;
    }
    const mime = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    try {
      this.chunks = [];
      this.rec = new MediaRecorder(canvas.captureStream(30), mime ? { mimeType: mime } : undefined);
      this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
      this.rec.onstop = () => this.finish();
      this.rec.start(250);
      this.startedAt = Date.now();
      $('btn-game-rec').classList.add('on');
      $('btn-game-rec').textContent = '■ STOP';
      $('game-rec-state').style.display = 'block';
      this.timer = setInterval(() => {
        const s = Math.floor((Date.now() - this.startedAt) / 1000);
        $('game-rec-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        if (s >= 20) this.stop();
      }, 300);
      bubble('● Rolling! (20 s max) — share at the end.', 3000);
    } catch (e) { bubble('Enregistrement impossible ici.', 3500); }
  },
  stop() { if (this.rec && this.rec.state !== 'inactive') this.rec.stop(); },
  caption() {
    const collected = (window.ASTRO_STATE && window.ASTRO_STATE.getCollectedCount()) || 0;
    const done = Math.max(collected, S.metCount);
    const rest = Math.max(0, 12 - done);
    if (S.lastMet) {
      const sign = signById(S.lastMet.sign);
      return `I ran into a ${sign.name} today ${sign.glyph} — ${rest} more to go to complete my constellation ✨ #AstroCode #Streetwear #AR`;
    }
    return `Off to explore my constellation ✨ ${rest} more to meet! #AstroCode #Streetwear #AR`;
  },
  async finish() {
    clearInterval(this.timer);
    $('btn-game-rec').classList.remove('on');
    $('btn-game-rec').textContent = '● REC';
    $('game-rec-state').style.display = 'none';
    const type = (this.rec && this.rec.mimeType) || 'video/webm';
    this.rec = null;
    const blob = new Blob(this.chunks, { type });
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([blob], `astro-code-rencontre.${ext}`, { type });
    const text = this.caption();
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text });
        bubble('Video shared ✨', 3000);
        return;
      }
      if (navigator.share) { await navigator.share({ text }); }
      throw new Error('share-files-unsupported');
    } catch (e) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      bubble(`Video recorded 🎬 Caption to add: ${text}`, 9000);
    }
  },
};

/* --------------------------------------------------------- boucle de jeu */
const _v = new THREE.Vector3();
function projectToScreen(p) {
  _v.copy(p).project(S.camera);
  const w = S.holder.clientWidth, h = S.holder.clientHeight;
  return { x: (_v.x * 0.5 + 0.5) * w, y: (-_v.y * 0.5 + 0.5) * h, behind: _v.z > 1 };
}
function loop(now) {
  if (!S.active) return;
  S.raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - S.last) / 1000 || 0.016);
  S.last = now;
  const t = now / 1000;

  /* — le koï nage vers la cible (ou dérive doucement) — */
  const pos = S.playerPos;
  if (S.target) {
    const dx = S.target.x - pos.x, dy = S.target.y - pos.y;
    const d = Math.hypot(dx, dy);
    if (d > 3) {
      const sp = Math.min(150, d * 3.2);
      S.vel.x += ((dx / d) * sp - S.vel.x) * Math.min(1, dt * 5);
      S.vel.y += ((dy / d) * sp - S.vel.y) * Math.min(1, dt * 5);
    } else { S.vel.multiplyScalar(0.86); }
  } else {
    S.vel.x += (Math.sin(t * 0.35) * 7 - S.vel.x) * dt * 0.6;
    S.vel.y += (Math.cos(t * 0.27) * 5 - S.vel.y) * dt * 0.6;
  }
  pos.addScaledVector(S.vel, dt);
  pos.x = THREE.MathUtils.clamp(pos.x, -WORLD.x, WORLD.x);
  pos.y = THREE.MathUtils.clamp(pos.y, -WORLD.y, WORLD.y);
  pos.y += Math.sin(t * 1.7) * 0.014;                    // flottement doux
  S.player.position.copy(pos);
  const speed = S.vel.length();
  // capelage : le koï s'incline vers sa direction (dans le plan de nage)
  const heading = Math.atan2(S.vel.y, S.vel.x);
  const tilt = speed > 4 ? Math.sin(heading) * 0.38 : 0;
  S.player.rotation.z += ((tilt + Math.sin(t * 2.1) * 0.03) - S.player.rotation.z) * Math.min(1, dt * 6);
  const tail = S.player.userData.tail;
  if (tail) tail.rotation.y = Math.sin(t * (4 + speed * 0.055)) * 0.45;

  /* — créatures : flottement + étiquettes + rencontre — */
  let nearest = null, nearestD = Infinity;
  S.creatures.forEach((c) => {
    c.grp.position.y = c.y + Math.sin(t * 0.9 + c.phase) * 2.2;
    c.grp.position.x = c.x + Math.cos(t * 0.6 + c.phase) * 1.4;
    if (c.orb) c.orb.rotation.y = t * 0.25 + c.phase;
    const d = Math.hypot(c.grp.position.x - pos.x, c.grp.position.y - pos.y);
    const scr = projectToScreen(c.grp.position);
    const w = S.holder.clientWidth, h = S.holder.clientHeight;
    const offX = THREE.MathUtils.clamp(scr.x, 44, w - 44);
    const offY = THREE.MathUtils.clamp(scr.y, 26, h - 26);
    c.label.style.left = offX + 'px';
    c.label.style.top = offY + 'px';
    if (c.anon) { c.label.style.opacity = scr.behind ? 0 : 0.9; }
    else {
      const sign = signById(c.sign);
      c.label.innerHTML = c.met
        ? `⭐ <b>${sign.name}</b> · @${c.pseudo}`
        : `<b>${sign.glyph} ${sign.name}</b> · @${c.pseudo} · ${Math.round(d)} m`;
      c.label.style.opacity = c.met ? 0.75 : 1;
    }
    if (!c.met && d < nearestD) { nearestD = d; nearest = c; }
  });

  /* — carte de rencontre — */
  const card = $('game-card');
  if (nearest && nearestD <= ENCOUNTER_R) {
    if (S.cardFor !== nearest) {
      S.cardFor = nearest;
      if (nearest.anon) {
        $('game-card-glyph').textContent = '🌌';
        $('game-card-name').textContent = 'ZONE CHAUDE';
        $('game-card-meta').textContent = 'Wearers are around — untracked, by design.';
        $('game-card-btn').style.display = 'none';
      } else {
        const sign = signById(nearest.sign);
        $('game-card-glyph').textContent = sign.glyph;
        $('game-card-name').textContent = sign.name.toUpperCase();
        $('game-card-meta').textContent = `@${nearest.pseudo} · ${Math.round(nearestD)} m away`;
        $('game-card-btn').style.display = '';
      }
      card.style.display = 'flex';
    } else if (!nearest.anon) {
      $('game-card-meta').textContent = `@${nearest.pseudo} · ${Math.round(nearestD)} m away`;
    }
  } else if (S.cardFor) {
    S.cardFor = null; card.style.display = 'none';
  }

  /* — décor vivant — */
  if (S.planets) S.planets.forEach((p) => { p.rotation.y += p.userData.spin * dt; p.position.y += Math.sin(t * 0.4 + p.position.x) * 0.008; });
  if (S.flowers) S.flowers.forEach((f) => { f.material.opacity = 0.5 + 0.4 * Math.abs(Math.sin(t * 1.3 + f.userData.phase)); });
  if (S.nebulaSprites) S.nebulaSprites.forEach((sp) => {
    const k = 0.85 + 0.3 * Math.sin(t * 0.7 + sp.userData.phase);
    sp.material.opacity = 0.15 + 0.07 * Math.sin(t * 0.7 + sp.userData.phase);
    const s = 78 * k;
    sp.scale.set(s, s, 1);
  });
  S.mixers.forEach((m) => m.update(dt));

  /* — caméra : suit le koï en douceur (parallaxe sur le décor) — */
  const wantX = pos.x * 0.82, wantY = pos.y * 0.82;
  S.camPos.x += (wantX - S.camPos.x) * Math.min(1, dt * 2.6);
  S.camPos.y += (wantY - S.camPos.y) * Math.min(1, dt * 2.6);
  S.camera.position.set(S.camPos.x, S.camPos.y, 200);
  S.camera.lookAt(S.camPos.x, S.camPos.y, 0);

  S.renderer.render(S.scene, S.camera);
}

/* --------------------------------------------------------- API publique */
window.GAME = {
  enter() {
    if (!S.inited) { try { init(); } catch (e) { console.warn('[GAME] init impossible :', e); } }
    if (!S.inited) return;
    resize();
    S.active = true; S.last = performance.now();
    S.raf = requestAnimationFrame(loop);
    Music.start();
    welcome();
  },
  exit() {
    S.active = false;
    cancelAnimationFrame(S.raf);
    Music.stop();
    if (Rec.rec) Rec.stop();
  },
};
