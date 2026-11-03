// ASTRO GARDEN — cozy 2D farm, 12 zodiac creatures, voice-controlled (Canvas 2D, no dependencies)
const $ = id => document.getElementById(id);
const A = window.__ASSETS__, META = A.meta;
const cv = $('c'), ctx = cv.getContext('2d');
const PI = Math.PI, rnd = (a, b) => a + Math.random() * (b - a), clamp = (x, a, b) => Math.max(a, Math.min(b, x));
let seed = 7; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const QS = new URLSearchParams(location.search);
const MANUAL = QS.has('manual');

// ---------- assets ----------
const IM = {};
const loads = Object.entries(A.img).map(([k, src]) => new Promise(r => { const i = new Image(); i.onload = () => { IM[k] = i; r(); }; i.src = src; }));
const SZ = k => META[k]; // [w,h] in world units
const AN = META.anim || {};
const KMAP = { chop: 'mine', quarry: 'mine', fence: 'mine', torch: 'mine', wall: 'mine', craft: 'harvest', eat: 'harvest', planttree: 'plant', shake: 'shake', dig: 'dig', treasure: 'dig', plant: 'plant', harvest: 'harvest', forage: 'harvest', mine: 'mine', dance: 'dance', roar: 'roar', jump: 'jump', water: 'water', splash: 'dance' };
const ONESHOT = { plant: 1, harvest: 1, jump: 1, shake: 0 };

// ---------- world ----------
const W = 2300, H = 1900, FC = { x: 700, y: 730 }; // fountain centre — monde agrandi (v1.9.124) : le cœur de ferme garde ses coordonnées, les nouvelles terres sont à l'est et au sud
const SIGNS = ['belier', 'taureau', 'gemeaux', 'cancer', 'lion', 'vierge', 'balance', 'scorpion', 'sagittaire', 'capricorne', 'verseau', 'poissons'];
const NAME = { belier: 'Aries', taureau: 'Taurus', gemeaux: 'Gemini', cancer: 'Cancer', lion: 'Leo', vierge: 'Virgo', balance: 'Libra', scorpion: 'Scorpio', sagittaire: 'Sagittarius', capricorne: 'Capricorn', verseau: 'Aquarius', poissons: 'Pisces' };
const FACE_R = { poissons: false }; // natural facing (default right)
const ALIAS = { belier: /belier|aries|mouton|agneau|ram/, taureau: /taureau|taurus|boeuf|vache|bull/, gemeaux: /gemeau|gemini|renard|twins|fox/, cancer: /cancer|crabe|crab/, lion: /\blion\b|\bleo\b|lionceau/, vierge: /vierge|virgo|biche|cerf|deer/, balance: /balance|libra|chat|cat/, scorpion: /scorpion|scorpio/, sagittaire: /sagitt|centaure|centaur|archer/, capricorne: /capricorne|capricorn|chevre|goat/, verseau: /verseau|aquarius|goutte/, poissons: /poisson|pisces|koi|fish/ };
// [intégration Astro Code] Collection réelle : seules les créatures des signes
// collectés vivent dans la ferme. Aucune collection (jury, démo) = les 12 signes.
// ?count=N reste disponible pour les bancs/démos.
function readCollection() { try { const raw = JSON.parse(localStorage.getItem('astrocode_meta_collection_v1') || '[]'); if (!Array.isArray(raw)) return []; return raw.map(e => typeof e === 'string' ? e : (e && e.id)).filter(id => SIGNS.includes(id)); } catch (e) { return []; } }
const COLLECTED = readCollection();
let ACTIVE = COLLECTED.length ? SIGNS.filter(x => COLLECTED.includes(x)) : SIGNS.slice();
if (QS.has('count')) ACTIVE = SIGNS.slice(0, Math.max(1, Math.min(12, +QS.get('count') || 12)));
const N = ACTIVE.length;

// terrain (offscreen)
const terrain = document.createElement('canvas'); terrain.width = W; terrain.height = H;
const ORE_G = { x: 1090, y: 520 }, ORE_C = { x: 1130, y: 960 }, APPLE = { x: 420, y: 470 };
const CELLS = []; for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) CELLS.push({ x: 262 + c * 64, y: 1018 + r * 58, st: 'empty', stage: 0, g: 0, claim: null });
function buildTerrain() {
  const t = terrain.getContext('2d'); t.imageSmoothingEnabled = false;
  t.fillStyle = '#8fe070'; t.fillRect(0, 0, W, H);
  // value noise blocks
  const g = 8, nx = W / g, ny = H / g, grid = [];
  const rg = []; for (let i = 0; i < (nx / 6 + 2) * (ny / 6 + 2); i++) rg.push(R());
  const gw = Math.floor(nx / 6) + 2;
  const noise = (x, y) => { const fx = x / 6, fy = y / 6, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy; const s = v => v * v * (3 - 2 * v); const a = rg[iy * gw + ix], b = rg[iy * gw + ix + 1], c = rg[(iy + 1) * gw + ix], d = rg[(iy + 1) * gw + ix + 1]; return (a + (b - a) * s(tx)) * (1 - s(ty)) + (c + (d - c) * s(tx)) * s(ty); };
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { const v = noise(x, y); if (v > .56) { t.fillStyle = '#79cf5d'; t.fillRect(x * g, y * g, g, g); } else if (v < .27) { t.fillStyle = '#9be97b'; t.fillRect(x * g, y * g, g, g); } }
  // grass tufts
  t.fillStyle = '#62b84c'; for (let i = 0; i < 950; i++) { const x = Math.floor(R() * nx) * g, y = Math.floor(R() * ny) * g; t.fillRect(x, y + 4, 2, 4); t.fillRect(x + 4, y + 2, 2, 6); t.fillRect(x + 8, y + 4, 2, 4); }
  // dirt helper: blobby ellipse / path in 8px blocks
  const dirt = (test, c1, c2, edge) => {
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const px = x * g + 4, py = y * g + 4; if (!test(px, py)) continue;
      const border = !test(px - g, py) || !test(px + g, py) || !test(px, py - g) || !test(px, py + g);
      t.fillStyle = border ? edge : (noise(x + 40, y + 40) > .5 ? c2 : c1); t.fillRect(x * g, y * g, g, g);
    }
  };
  const ell = (cx, cy, rx, ry, wob) => (px, py) => { const dx = (px - cx) / rx, dy = (py - cy) / ry; const a = Math.atan2(dy, dx); return Math.hypot(dx, dy) < 1 + Math.sin(a * 5 + 1) * wob + Math.sin(a * 9) * wob * .5; };
  const path = (x1, y1, x2, y2, w) => (px, py) => { const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy; let u = clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1); return Math.hypot(px - (x1 + dx * u), py - (y1 + dy * u)) < w + Math.sin(u * 20) * 4; };
  const plaza = ell(FC.x, FC.y + 10, 340, 255, .06);
  const paths = [path(FC.x, FC.y, 330, 1020, 26), path(FC.x, FC.y, ORE_G.x, ORE_G.y + 60, 24), path(FC.x, FC.y, ORE_C.x - 20, ORE_C.y + 40, 24), path(FC.x, FC.y, APPLE.x + 40, APPLE.y + 70, 24), path(FC.x, FC.y, 2045, FC.y, 24), path(FC.x, FC.y + 60, 1080, 1620, 22)];
  dirt((x, y) => plaza(x, y) || paths.some(p => p(x, y)), '#efc58e', '#e8b87a', '#cf9a62');
  // farm patch
  const px0 = 224, py0 = 984, px1 = 224 + 4 * 64 + 22, py1 = 984 + 2 * 58 + 30;
  t.fillStyle = '#a5683c'; t.fillRect(px0, py0, px1 - px0, py1 - py0);
  t.fillStyle = '#c0834f'; for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { const cx = 262 + c * 64 - 24, cy = 1018 + r * 58 - 22; t.fillRect(cx, cy + 10, 48, 4); t.fillRect(cx, cy + 26, 48, 4); t.fillRect(cx, cy + 42, 48, 4); }
  t.fillStyle = '#6e4326'; t.fillRect(px0, py0, px1 - px0, 4); t.fillRect(px0, py1 - 4, px1 - px0, 4); t.fillRect(px0, py0, 4, py1 - py0); t.fillRect(px1 - 4, py0, 4, py1 - py0);
  // rivière à l'est (bande ondulée, blocs de 8 px comme le reste) + pont en bois sur le chemin de la fontaine
  const river = (px, py) => { const c = 2046 + Math.sin(py * .008) * 16; return px > c - 52 && px < c + 52; };
  dirt(river, '#45a8dd', '#57b6e8', '#2e7fb8');
  t.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 70; i++) { const ry = R() * H, rc = 2046 + Math.sin(ry * .008) * 16; t.fillRect(Math.floor((rc + (R() - .5) * 84) / 2) * 2, Math.floor(ry / 2) * 2, 6, 2); }
  t.fillStyle = '#b07a44'; t.fillRect(1986, FC.y - 38, 124, 76);
  t.fillStyle = '#c98a4e'; for (let bx = 1990; bx < 2106; bx += 15) t.fillRect(bx, FC.y - 34, 9, 68);
  t.fillStyle = '#6e4326'; t.fillRect(1986, FC.y - 40, 124, 6); t.fillRect(1986, FC.y + 34, 124, 6);
  t.fillStyle = '#4a2a14'; for (let bx = 1994; bx < 2106; bx += 28) { t.fillRect(bx, FC.y - 40, 5, 8); t.fillRect(bx, FC.y + 32, 5, 8); }
}

// ---------- props ----------
const props = []; // {k,x,y,sw,swt}
const addP = (k, x, y, extra = {}) => { const p = { k, x, y, ...extra }; props.push(p); return p; };
const fountain = addP('fountain', FC.x, FC.y + 70);
const appleTree = addP('appletree', APPLE.x, APPLE.y + 120); appleTree.shake = 0;
const goldRock = addP('goldrock', ORE_G.x, ORE_G.y), crystalRock = addP('crystal', ORE_C.x, ORE_C.y);
const stelae = []; SIGNS.forEach((s, i) => { const a = -PI / 2 + i * PI * 2 / SIGNS.length; const p = addP('st_' + s, FC.x + Math.cos(a) * 285, FC.y + 40 + Math.sin(a) * 195, { stela: s }); stelae.push(p); });
for (let i = 0; i < 3; i++) addP('fence', 262 - 30 + i * 90 + 12, 972 - 0);
addP('well', 1010, 1160); addP('chest', 218, 760); addP('sign', 700, 1050); addP('lantern', 520, 1000); addP('lantern', 880, 1000); addP('hay', 520, 1150); const CRATE = addP('crate', 600, 1130); addP('wheelbarrow', 640, 1180); addP('lantern', 440, 760); addP('lantern', 960, 760);
const HAY = { x: 520, y: 1150 };
const mushrooms = [];
const taken = () => props.map(p => [p.x, p.y]).concat([[FC.x, FC.y]]);
function free(x, y, r) { return !taken().some(([a, b]) => Math.hypot(a - x, (b - y) * 1.3) < r); }
// border forest
for (let i = 0; i < 95; i++) {
  const side = Math.floor(R() * 4); let x, y; const d = R() * 110 + 25;
  if (side === 0) { x = R() * W; y = d; } else if (side === 1) { x = R() * W; y = H - d + 60; } else if (side === 2) { x = d; y = R() * H + 40; } else { x = W - d; y = R() * H + 40; }
  addP(['tree', 'pine', 'autumn', 'tree', 'pine'][Math.floor(R() * 5)], x, y);
}
for (let i = 0; i < 70; i++) {
  const x = 120 + R() * 1160, y = 160 + R() * 1100; if (Math.hypot((x - FC.x) / 1.3, y - FC.y) < 320) continue; if (x > 200 && x < 520 && y > 940 && y < 1240) continue; if (!free(x, y, 70)) continue;
  const k = ['bush1', 'bush2', 'bush3', 'rock', 'rock2', 'flowers', 'flowers', 'stump', 'bush1'][Math.floor(R() * 9)]; addP(k, x, y);
}
for (let i = 0; i < 9; i++) { const x = 150 + R() * 1100, y = 200 + R() * 1000; if (Math.hypot((x - FC.x) / 1.3, y - FC.y) < 300 || !free(x, y, 60)) { i--; continue; } mushrooms.push({ x, y, alive: true, t: 0 }); }

// ---------- [demande d'Hamza] GRANDE CARTE : décor des nouvelles terres ----------
// DECOR = purement visuel (maisons, forêts) : jamais lu par les tâches, les
// collisions ni la sauvegarde. Les maisons sont dessinées en code dans la
// palette du jeu (drawHouse), les arbres réutilisent les sprites existants.
const DECOR = [];
const HOUSES = [{ x: 450, y: 175 }, { x: 1020, y: 155 }, { x: 105, y: 520 }, { x: 100, y: 965 }, { x: 1620, y: 305 }, { x: 2200, y: 435 }, { x: 2230, y: 1185 }, { x: 430, y: 1685 }, { x: 1300, y: 1745 }, { x: 1780, y: 1625 }];
HOUSES.forEach((h, i) => DECOR.push({ k: 'house', x: h.x, y: h.y, seed: i }));
{ const nearHouse = (x, y) => HOUSES.some(h => Math.hypot(h.x - x, h.y - y) < 125);
  const inRiver = (x, y) => Math.abs(x - (2046 + Math.sin(y * .008) * 16)) < 105;
  const onEastPath = (x, y) => x > 1150 && Math.abs(y - FC.y) < 78;
  const zones = [
    { x0: 1250, x1: 1950, y0: 60, y1: 1850, n: 95 },   // est, avant la rivière
    { x0: 2135, x1: 2275, y0: 60, y1: 1850, n: 26 },   // rive est (village)
    { x0: 60, x1: 1400, y0: 1265, y1: 1850, n: 58 },   // sud
    { x0: 26, x1: 185, y0: 60, y1: 1340, n: 22 },      // bande ouest
    { x0: 60, x1: 1340, y0: 26, y1: 275, n: 26 },      // bande nord
  ];
  for (const z of zones) for (let i = 0; i < z.n; i++) { const x = z.x0 + R() * (z.x1 - z.x0), y = z.y0 + R() * (z.y1 - z.y0); if (nearHouse(x, y) || inRiver(x, y) || onEastPath(x, y)) continue; DECOR.push({ k: ['tree', 'pine', 'autumn', 'tree', 'pine', 'tree'][Math.floor(R() * 6)], x, y }); }
  for (let i = 0; i < 46; i++) { const z = zones[Math.floor(R() * 3)]; const x = z.x0 + R() * (z.x1 - z.x0), y = z.y0 + R() * (z.y1 - z.y0); if (nearHouse(x, y) || inRiver(x, y) || onEastPath(x, y)) continue; DECOR.push({ k: ['bush1', 'bush2', 'bush3', 'flowers', 'rock2'][Math.floor(R() * 5)], x, y }); }
}
function drawHouse(p) {
  const roofs = ['#c65a3a', '#b5502f', '#5a6f9a', '#5f7f4a', '#c65a3a', '#8a5a34', '#b5502f', '#5a6f9a', '#c65a3a', '#5f7f4a'];
  const roof = roofs[p.seed % roofs.length], w = 118, wh = 64;
  ctx.fillStyle = 'rgba(30,70,40,.30)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, w * .62, 13, 0, 0, PI * 2); ctx.fill();
  ctx.fillStyle = '#f0dfba'; ctx.fillRect(p.x - w / 2, p.y - wh, w, wh);
  ctx.fillStyle = '#e2cda1'; ctx.fillRect(p.x - w / 2, p.y - 14, w, 14);
  ctx.strokeStyle = '#8a5a34'; ctx.lineWidth = 5; ctx.strokeRect(p.x - w / 2 + 2, p.y - wh + 2, w - 4, wh - 4);
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(p.x - w / 6, p.y - wh + 2); ctx.lineTo(p.x - w / 6, p.y - 2); ctx.moveTo(p.x + w / 6, p.y - wh + 2); ctx.lineTo(p.x + w / 6, p.y - 2); ctx.stroke();
  // toit (trapèze + faîte)
  ctx.fillStyle = roof; ctx.beginPath(); ctx.moveTo(p.x - w / 2 - 12, p.y - wh); ctx.lineTo(p.x - w / 5, p.y - wh - 42); ctx.lineTo(p.x + w / 5, p.y - wh - 42); ctx.lineTo(p.x + w / 2 + 12, p.y - wh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.beginPath(); ctx.moveTo(p.x, p.y - wh - 42); ctx.lineTo(p.x + w / 5, p.y - wh - 42); ctx.lineTo(p.x + w / 2 + 12, p.y - wh); ctx.lineTo(p.x, p.y - wh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8a5a34'; ctx.fillRect(p.x + w / 4, p.y - wh - 40, 13, 26);
  // porte + fenêtres chaudes
  ctx.fillStyle = '#6e4326'; ctx.fillRect(p.x - 11, p.y - 36, 22, 36);
  ctx.fillStyle = '#ffd76a'; ctx.fillRect(p.x + 3, p.y - 21, 4, 4);
  for (const wx of [-w / 2 + 16, w / 2 - 34]) { ctx.fillStyle = '#ffd76a'; ctx.fillRect(p.x + wx, p.y - 48, 18, 18); ctx.strokeStyle = '#8a5a34'; ctx.lineWidth = 3; ctx.strokeRect(p.x + wx, p.y - 48, 18, 18); ctx.beginPath(); ctx.moveTo(p.x + wx + 9, p.y - 48); ctx.lineTo(p.x + wx + 9, p.y - 30); ctx.stroke(); }
}


// ---------- v2 : forêt, pierre, barrières, torches, mur, cycle jour/nuit ----------
const FX0 = 215, FX1 = 1185, FY0 = 310, FY1 = 1175, SECT = 8;
const sectorOf = (x, y) => Math.floor(((Math.atan2(y - FC.y, x - FC.x) + PI) / (PI * 2)) * SECT) % SECT;
const slots = [];
{ const nxn = Math.round((FX1 - FX0) / 140), nyn = Math.round((FY1 - FY0) / 140);
  for (let i = 0; i < nxn; i++) { const x1 = FX0 + (FX1 - FX0) * i / nxn, x2 = FX0 + (FX1 - FX0) * (i + 1) / nxn; slots.push({ x1, y1: FY0, x2, y2: FY0 }); slots.push({ x1, y1: FY1, x2, y2: FY1 }); }
  for (let j = 0; j < nyn; j++) { const y1 = FY0 + (FY1 - FY0) * j / nyn, y2 = FY0 + (FY1 - FY0) * (j + 1) / nyn; slots.push({ x1: FX0, y1, x2: FX0, y2 }); slots.push({ x1: FX1, y1, x2: FX1, y2 }); }
  slots.forEach(q => { q.mx = (q.x1 + q.x2) / 2; q.my = (q.y1 + q.y2) / 2; q.sec = sectorOf(q.mx, q.my); q.built = false; q.born = -9; q.claim = null; }); }
const torches = []; for (let sct = 0; sct < SECT; sct++) { const a = (sct + .5) / SECT * PI * 2 - PI, dx = Math.cos(a), dy = Math.sin(a); const tx = Math.abs(dx) < 1e-6 ? 1e9 : Math.abs(((dx > 0 ? FX1 : FX0) - FC.x) / dx), ty = Math.abs(dy) < 1e-6 ? 1e9 : Math.abs(((dy > 0 ? FY1 : FY0) - FC.y) / dy); const t = Math.min(tx, ty) - 18; torches.push({ x: FC.x + dx * t, y: FC.y + dy * t, sec: sct, built: false, lit: false, born: -9, claim: null }); }
const WALL = []; for (let r = 0; r < 2; r++) for (let i = 0; i < 8; i++) WALL.push({ x: 800 + i * 27 + (r ? 13 : 0), y: 1092 - r * 15, built: false, born: -9 });
const rocks = () => props.filter(p => (p.k === 'rock' || p.k === 'rock2') && !p.gone);
const posKey = p => Math.round(p.x) + ',' + Math.round(p.y);
let GONE_KEYS = [];
props.forEach(p => { if (p.k === 'rock') p.ch = 4; if (p.k === 'rock2') p.ch = 2; });
appleTree.fruitTree = true; appleTree.ready = true; appleTree.regrow = 0; appleTree.sc = 1;
const TREEK = ['tree', 'pine', 'autumn', 'appletree'];
const treeProps = () => props.filter(p => TREEK.includes(p.k) && !p.cut && !(p.planted && p.stage < 2));
const fruitTrees = () => props.filter(p => p.fruitTree && !p.cut && (!p.planted || p.stage >= 3));

// jour / nuit
const CYC = +QS.get('cycle') || 600;
let clockT = QS.has('night') ? CYC : (+QS.get('t') || CYC * .35), nf = QS.has('night') ? 1 : 0, lastNight = QS.has('night');
const isNight = () => Math.floor(clockT / CYC) % 2 === 1;
const spirits = [];
let spawnT = 6;

// ---------- state ----------
const stats = { gold: 0, gem: 0, app: 0, wheat: 0, wood: 8, stone: 4, brick: 0 };
function pxIcon(draw) { const c = document.createElement('canvas'); c.width = c.height = 20; draw(c.getContext('2d')); return c.toDataURL(); }
const ICONS = {
  gem: pxIcon(x => { x.fillStyle = '#1b3a6a'; x.fillRect(5, 1, 10, 2); x.fillRect(2, 3, 16, 3); x.fillRect(3, 6, 14, 4); x.fillRect(5, 10, 10, 3); x.fillRect(7, 13, 6, 3); x.fillStyle = '#5fd0ff'; x.fillRect(5, 2, 10, 2); x.fillRect(3, 4, 14, 3); x.fillRect(4, 7, 12, 3); x.fillRect(6, 10, 8, 2); x.fillRect(8, 12, 4, 2); x.fillStyle = '#d6f6ff'; x.fillRect(5, 3, 4, 2); }),
  wood: pxIcon(x => { x.fillStyle = '#4a2a14'; x.fillRect(2, 5, 16, 11); x.fillStyle = '#9a5f32'; x.fillRect(3, 6, 14, 9); x.fillStyle = '#c98a4e'; x.fillRect(3, 6, 14, 3); x.fillStyle = '#4a2a14'; x.fillRect(1, 6, 4, 9); x.fillStyle = '#e8b878'; x.fillRect(2, 7, 2, 7); x.fillStyle = '#9a5f32'; x.fillRect(2, 9, 1, 3); }),
  stone: pxIcon(x => { x.fillStyle = '#2b2f3a'; x.fillRect(4, 4, 12, 2); x.fillRect(2, 6, 16, 9); x.fillRect(4, 15, 12, 2); x.fillStyle = '#8c93a3'; x.fillRect(4, 5, 11, 2); x.fillRect(3, 7, 14, 8); x.fillStyle = '#b9bfcc'; x.fillRect(5, 6, 6, 2); x.fillRect(4, 8, 3, 3); x.fillStyle = '#6a7080'; x.fillRect(9, 11, 7, 4); }),
  brick: pxIcon(x => { x.fillStyle = '#4a1d12'; x.fillRect(1, 4, 18, 13); x.fillStyle = '#c4572d'; x.fillRect(2, 5, 16, 11); x.fillStyle = '#e2784a'; x.fillRect(2, 5, 16, 3); x.fillStyle = '#7a2a16'; x.fillRect(2, 10, 16, 1); x.fillRect(9, 5, 1, 5); x.fillRect(5, 11, 1, 5); x.fillRect(13, 11, 1, 5); }),
  torch: pxIcon(x => { x.fillStyle = '#4a2a14'; x.fillRect(8, 9, 4, 10); x.fillStyle = '#ffb02e'; x.fillRect(7, 3, 6, 7); x.fillStyle = '#fff1a0'; x.fillRect(9, 5, 2, 4); x.fillStyle = '#ff6a2a'; x.fillRect(8, 2, 4, 2); }),
};
const hudDef = [['h_wood', ICONS.wood, 'wood'], ['h_stone', ICONS.stone, 'stone'], ['h_app', A.img.apples, 'app']];
const disp = { ...stats }; const flyers = [];
const FLYTO = { app: 'h_app', wood: 'h_wood', stone: 'h_stone' }, FLYIC = { app: 'apples', wood: 'wood', stone: 'stone', wheat: 'crop4', gold: 'nugget', gem: 'gem', brick: 'brick' };
function hud() { for (const k in stats) if (disp[k] > stats[k]) disp[k] = stats[k]; hudDef.forEach(([id, src, k]) => { $(id).innerHTML = `<img src="${src}"> ${disp[k]}`; }); if (invOpen) buildInv(); }
function gain(k, n, wx, wy) { stats[k] += n; if (wx == null) { disp[k] = stats[k]; hud(); return; } const m = Math.min(n, 5), base = Math.floor(n / m); for (let i = 0; i < m; i++) flyers.push({ k, n: i === m - 1 ? n - base * (m - 1) : base, wx: wx + rnd(-14, 14), wy: wy + rnd(-10, 10), t: -i * .09, d: .8 }); }
function bump(id) { const el = $(id); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
const floats = [], parts = [], rings = [], apples = [];
const heard = $('heard');
function float(x, y, key, txt) { floats.push({ x, y, t: 0, key, txt }); }
function burst(x, y, n, col, o = {}) { for (let i = 0; i < n; i++) parts.push({ x, y, z: o.z || 0, vx: rnd(-1, 1) * (o.sp || 50), vy: rnd(-.6, .2) * (o.sp || 50), vz: rnd(40, 110) * (o.up || 1), g: o.g == null ? 260 : o.g, t: 0, life: rnd(.4, .9) * (o.life || 1), col: Array.isArray(col) ? col[Math.floor(Math.random() * col.length)] : col, s: o.s || 3 }); }

// ---------- creatures ----------
const JOBS = { belier: ['mine', 'mine', 'wander'], scorpion: ['mine', 'wander', 'rest'], taureau: ['water', 'wander', 'rest'], verseau: ['water', 'splash', 'wander'], cancer: ['treasure', 'treasure', 'wander'], vierge: ['harvest', 'water', 'wander'], sagittaire: ['forage', 'forage', 'wander'], gemeaux: ['carry'], balance: ['wander', 'rest', 'wander'], capricorne: ['wander', 'rest', 'dance'], poissons: ['splash', 'wander', 'rest'], lion: ['wander', 'rest', 'rest'] };
const crs = SIGNS.map((s, i) => { const a = i / SIGNS.length * PI * 2; return { sign: s, x: FC.x + Math.cos(a) * 300 + rnd(-24, 24), y: FC.y + 150 + Math.sin(a) * 185, face: 1, task: null, queue: [], t: rnd(0, 5), idle: rnd(0, 2), cool: 0, hop: 0, carry: null, hunger: rnd(.55, 1), speed: 72 + rnd(-8, 8), guest: !ACTIVE.includes(s) }; });
const byId = id => crs.find(c => c.sign === id);
let sel = byId('lion') || crs[0];
const player = { x: FC.x - 40, y: FC.y + 230 };
function say_(t) { heard.innerHTML = t; }

// ---------- tasks ----------
const nearest = (arr, c, f = () => true) => arr.filter(f).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
const START = {
  goto(c, k) { return true; },
  come(c, k) { k.tx = player.x + rnd(-24, 24); k.ty = player.y + rnd(0, 20); return true; },
  shake(c, k) { k.tx = APPLE.x + 6; k.ty = APPLE.y + 138; k.dur = 1.9; return true; },
  collect(c, k) { const a = nearest(apples, c, a => a.st === 'ground' && !a.claim); if (!a) return false; a.claim = c; k.a = a; k.tx = a.x; k.ty = a.y + 8; k.dur = .25; return true; },
  dig(c, k) { k.pos = { x: c.x + c.face * 30, y: c.y + 6 }; k.dur = 1.7; return true; },
  plant(c, k) { const cell = nearest(CELLS, c, q => q.st === 'mound' && !q.claim); if (!cell) { c.queue.unshift({ kind: 'plant' }); c.queue.unshift({ kind: 'dig' }); return false; } cell.claim = c; k.cell = cell; k.tx = cell.x; k.ty = cell.y + 22; k.dur = 1.3; return true; },
  harvest(c, k) { const cell = nearest(CELLS, c, q => q.st === 'crop' && q.stage >= 4 && !q.claim); if (!cell) { if (apples.some(a => a.st === 'ground' && !a.claim)) { c.queue.unshift({ kind: 'collect' }); return false; } if (fruitTrees().some(p => p.ready)) { c.queue.unshift({ kind: 'shake' }); return false; } if (c === sel) say_('Nothing is ripe yet 🌾 — give it a little time!'); return false; } cell.claim = c; k.cell = cell; k.tx = cell.x; k.ty = cell.y + 22; k.dur = 1.2; return true; },
  water(c, k) { const cell = nearest(CELLS, c, q => q.st === 'crop' && q.stage < 4); if (!cell) { if (c === sel && c.manual) say_('Nothing to water: plant something first 🌱'); return false; } k.cell = cell; k.tx = cell.x - 26; k.ty = cell.y + 16; k.dur = 2.4; return true; },
  mine(c, k) { const r = (c.sign === 'scorpion' || k.rock === 'c') ? crystalRock : goldRock; k.r = r; k.tx = r.x - (AN[c.sign] ? 48 : 26) + rnd(-4, 4); k.ty = r.y + 14; k.dur = 3.2; return true; },
  treasure(c, k) { k.tx = FC.x + rnd(-260, 260); k.ty = FC.y + rnd(110, 210); k.dur = 2.2; return true; },
  forage(c, k) { const m = nearest(mushrooms, c, m => m.alive && !m.claim); if (!m) return false; m.claim = c; k.m = m; k.tx = m.x; k.ty = m.y + 8; k.dur = 1.3; return true; },
  splash(c, k) { k.tx = FC.x + rnd(-40, 40); k.ty = FC.y + 106; k.dur = 3; return true; },
  carry(c, k) { if (!c.carry) { k.tx = CRATE.x; k.ty = CRATE.y + 20; k.pick = 1; } else { k.tx = HAY.x + 40; k.ty = HAY.y + 24; k.drop = 1; } k.dur = .6; return true; },
  wander(c, k) { const a = rnd(0, PI * 2), r = rnd(80, 280); k.tx = clamp(FC.x + Math.cos(a) * r * 1.3, 140, 1260); k.ty = clamp(FC.y + 70 + Math.sin(a) * r * .8, 220, 1200); k.dur = 0; return true; },
  rest(c, k) { k.dur = rnd(2, 4); return true; },
  dance(c, k) { k.dur = 4.2; return true; }, jump(c, k) { k.dur = 1.0; return true; }, roar(c, k) { k.dur = 2.4; return true; }, sleep(c, k) { k.dur = 5; return true; },
};
const DONE = {
  shake(c, k) { appleTree.shake = 0; c.queue.unshift({ kind: 'collect' }); },
  collect(c, k) { const a = k.a; const i = apples.indexOf(a); if (i >= 0) apples.splice(i, 1); gain('app', 1, c.x, c.y - 50); blip(660); if (apples.some(q => q.st === 'ground' && !q.claim)) c.queue.unshift({ kind: 'collect' }); },
  dig(c, k) { const cell = { x: k.pos.x, y: k.pos.y, st: 'mound', stage: 0, g: 0, claim: null, dyn: true }; CELLS.push(cell); c.lastDig = cell; burst(cell.x, cell.y, 12, ['#8a5530', '#a5683c', '#6e4326'], { sp: 60 }); },
  plant(c, k) { k.cell.st = 'crop'; k.cell.stage = 0; k.cell.g = 0; k.cell.claim = null; burst(k.cell.x, k.cell.y - 6, 6, ['#6fd25a', '#9be97b'], { sp: 30 }); blip(520); },
  harvest(c, k) { k.cell.st = 'empty'; k.cell.claim = null; gain('wheat', 1, k.cell.x, k.cell.y - 24); blip(760); burst(k.cell.x, k.cell.y - 10, 8, ['#ffd45c', '#f2a93b'], { sp: 60 }); },
  water(c, k) { k.cell.g += 5; },
  mine(c, k) { if (k.r === goldRock) gain('gold', 1, k.r.x, k.r.y - 40); else gain('gem', 1, k.r.x, k.r.y - 40); blip(880); },
  treasure(c, k) { burst(c.x, c.y, 8, ['#8a5530', '#a5683c'], { sp: 50 }); if (Math.random() < .7) { gain('gold', 1, c.x, c.y - 40); blip(880); } else float(c.x, c.y - 40, 'mushroom'); },
  forage(c, k) { k.m.alive = false; k.m.t = 0; k.m.claim = null; float(c.x, c.y - 44, 'mushroom'); blip(600); },
  carry(c, k) { if (k.pick) c.carry = 'crate'; if (k.drop) c.carry = null; },
};
// ---------- v2 : nouvelles tâches ----------
const msg = (c, t) => { if (c === sel) say_(t); };
const woodChips = ['#9a5f32', '#c98a4e', '#e8b878', '#6e4326'];
function spotFree(x, y) { return free(x, y, 64) && Math.hypot((x - FC.x) / 1.3, y - FC.y) > 340 && !(x > 200 && x < 520 && y > 940 && y < 1240) && x > FX0 + 40 && x < FX1 - 40 && y > FY0 + 120 && y < FY1 - 40; }
Object.assign(START, {
  formup(c, k) { if (k.fx == null) return false; k.tx = k.fx; k.ty = k.fy; k.dur = 16; return true; },
  carryfire(c, k) { c.fireUntil = T + 45; k.dur = 1.1; burst(c.x + c.face * 20, c.y - 44, 6, ['#ffb02e', '#fff1a0', '#ff6a2a'], { sp: 40, z: 16 }); return true; },
  shake(c, k) { const t = nearest(fruitTrees(), c, p => p.ready); if (!t) { msg(c, 'No ripe fruit: let the trees regrow 🍎 (or plant a new one!)'); return false; } k.tree = t; k.tx = t.x + 6; k.ty = t.y + 18; k.dur = 1.9; return true; },
  chop(c, k) {
    const cand = treeProps().filter(p => k.apple || p.k !== 'appletree' || treeProps().length < 2);
    const t = nearest(cand, c, p => !p.claim); if (!t) { msg(c, 'No tree left to chop 🌲'); return false; }
    t.claim = c; k.tree = t; k.tx = t.x + 4; k.ty = t.y + 16; k.dur = 3.4; return true; },
  quarry(c, k) { const r = nearest(rocks(), c, p => !p.claim && p.ch > 0); if (!r) { msg(c, 'No rock left to quarry 🪨'); return false; } r.claim = c; k.rock = r; k.tx = r.x - 46; k.ty = r.y + 12; k.dur = 2.8; return true; },
  fence(c, k) {
    if (stats.wood < 1) { msg(c, 'You need wood 🪵 — say “chop wood”!'); return false; }
    const q = nearest(slots, c, q => !q.built && !q.claim && true) ; if (!q) { msg(c, 'The fence is complete 🎉'); return false; }
    q.claim = c; k.slot = q; k.tx = q.mx; k.ty = q.my + 18; k.dur = 1.8; return true; },
  torch(c, k) {
    if (stats.wood < 2) { msg(c, 'A torch costs 2 wood 🪵'); return false; }
    const q = nearest(torches, c, q => !q.built && !q.claim); if (!q) { msg(c, 'All the torches are placed 🔥'); return false; }
    q.claim = c; k.tp = q; k.tx = q.x; k.ty = q.y + 16; k.dur = 1.8; return true; },
  craft(c, k) { if (stats.stone < 2) { msg(c, 'You need 2 stone per brick 🪨 — say “quarry stone”!'); return false; } k.tx = 950; k.ty = 1172; k.dur = 1.8; return true; },
  wall(c, k) {
    if (stats.brick < 1) { msg(c, 'You need bricks 🧱 — quarry stone, then “craft bricks”'); return false; }
    const b = WALL.find(b => !b.built && !b.claim); if (!b) { msg(c, 'The wall is finished 🧱'); return false; }
    b.claim = c; k.b = b; k.tx = b.x + (b.x - 910) * .1; k.ty = 1112; k.dur = 1.5; return true; },
  eat(c, k) { if (apples.some(a => a.st === 'ground' && !a.claim)) { c.queue.unshift({ kind: 'eatground' }); return false; } if (stats.app < 1) { msg(c, 'No fruit in stock 🍎 — shake the tree!'); return false; } k.tx = FC.x + rnd(-60, 60); k.ty = FC.y + 112; k.dur = 1.5; return true; },
  planttree(c, k) {
    if (k.afterDig && c.lastDig && c.lastDig.st === 'mound') { k.cell = c.lastDig; k.spot = { x: c.lastDig.x, y: c.lastDig.y }; k.dur = 1.6; return true; }
    for (let i = 0; i < 14; i++) { const a = rnd(0, PI * 2), x = c.x + Math.cos(a) * 46, y = c.y + Math.sin(a) * 26 + 10; if (free(x, y, 40) && Math.hypot((x - FC.x) / 1.3, y - FC.y) > 150) { k.spot = { x, y }; k.dur = 1.6; return true; } }
    msg(c, 'No room for a tree here 🌳 — move a little'); return false; },
});
const SAPK = ['tree'];
START.eatground = (c, k) => { const a = nearest(apples, c, a => a.st === 'ground' && !a.claim); if (!a) return false; a.claim = c; k.a = a; k.tx = a.x; k.ty = a.y + 10; k.dur = .9; return true; };
Object.assign(DONE, {
  eatground(c, k) { const i = apples.indexOf(k.a); if (i >= 0) apples.splice(i, 1); c.hunger = 1; float(c.x, c.y - 70, 'apples'); blip(700); burst(c.x, c.y - 40, 6, ['#ff7a7a', '#ffd45c'], { sp: 30, z: 20 }); },
  shake(c, k) { const t = k.tree; t.shake = 0; t.ready = false; t.regrow = 45; c.queue.unshift({ kind: 'collect' }); if (crs.some(o => o !== c && o.hunger < .7)) c.queue.unshift({ kind: 'rest' }); },
  chop(c, k) { const t = k.tree; t.claim = null; t.cut = true; t.shake = 0; t.chopT = 0; delete t.fruitTree; const gn = t.k === 'appletree' ? 6 : 4; t.k = 'stump'; t.sc = 1; gain('wood', gn, t.x, t.y - 40); blip(300); burst(t.x, t.y - 20, 14, woodChips, { sp: 90, z: 20 }); if (t.planted) delete t.planted; },
  quarry(c, k) { const r = k.rock; r.claim = null; r.ch--; gain('stone', 2, r.x, r.y - 30); blip(240); burst(r.x - 10, r.y - 14, 10, ['#b9bfcc', '#8c93a3', '#6a7080'], { sp: 80, z: 14 }); if (r.ch <= 0) { r.gone = true; GONE_KEYS.push(posKey(r)); const i = props.indexOf(r); if (i >= 0) props.splice(i, 1); } },
  fence(c, k) { const q = k.slot; q.claim = null; q.built = true; q.born = T; stats.wood--; hud(); blip(420); burst(q.mx, q.my, 8, woodChips, { sp: 60, z: 10 });
    const more = (k.n == null ? 3 : k.n) - 1; if (more > 0 && stats.wood > 0 && slots.some(s => !s.built && !s.claim)) c.queue.unshift({ kind: 'fence', n: more }); },
  torch(c, k) { const q = k.tp; q.claim = null; q.built = true; q.born = T; stats.wood -= 2; if (isNight() && stats.wood > 0) { stats.wood--; q.lit = true; } hud(); blip(500); burst(q.x, q.y - 20, 8, ['#ffb02e', '#fff1a0', '#ff6a2a'], { sp: 50, z: 20 }); },
  craft(c, k) { stats.stone -= 2; hud(); gain('brick', 1, c.x, c.y - 50); blip(360); const more = (k.n == null ? 4 : k.n) - 1; if (more > 0 && stats.stone >= 2) c.queue.unshift({ kind: 'craft', n: more }); },
  wall(c, k) { const b = k.b; b.claim = null; b.built = true; b.born = T; stats.brick--; hud(); blip(430); burst(b.x, b.y - 8, 6, ['#e2784a', '#c4572d', '#d8d0c0'], { sp: 40, z: 8 }); const done = WALL.filter(w => w.built).length;
    if (done === WALL.length) msg(c, '🧱 Wall complete!'); else { const more = (k.n == null ? 4 : k.n) - 1; if (more > 0 && stats.brick > 0) c.queue.unshift({ kind: 'wall', n: more }); } },
  eat(c, k) { stats.app--; c.hunger = 1; hud(); float(c.x, c.y - 70, 'apples'); blip(700); burst(c.x, c.y - 40, 6, ['#ff7a7a', '#ffd45c'], { sp: 30, z: 20 }); },
  planttree(c, k) { if (k.cell) { const i = CELLS.indexOf(k.cell); if (i >= 0) CELLS.splice(i, 1); } const p = addP('tree', k.spot.x, k.spot.y, { planted: true, stage: 0, g: 0, fruitTree: true, ready: false, regrow: 0, sc: .28, born: T }); burst(k.spot.x, k.spot.y - 6, 8, ['#6fd25a', '#9be97b', '#8a5530'], { sp: 40 }); blip(520); },
});

function startTask(c, kind, extra) {
  const k = { kind, stage: 'go', t: 0, ...extra };
  const ok = START[kind](c, k); if (!ok) return false;
  if (k.tx == null) k.stage = 'do'; c.task = k; return true;
}
function plan(c) { const list = JOBS[c.sign] || ['wander']; let kind = list[Math.floor(Math.random() * list.length)]; if (c.sign === 'gemeaux') kind = 'carry'; if (!startTask(c, kind)) startTask(c, 'wander'); }
function callHungry(sh) { for (const o of crs) if (o !== sh && o.hunger < .7 && !o.manual && (!o.task || o.task.kind === 'wander' || o.task.kind === 'rest')) { o.task = null; o.queue.unshift({ kind: 'eatground' }); } }
function updCr(c, dt) {
  c.t += dt; c.cool = Math.max(0, c.cool - dt); c.hunger = Math.max(0, c.hunger - dt / 420); if (c.guest) c.hunger = 1;
  if (!c.task) {
    if (c.queue.length) { const q = c.queue.shift(); if (!startTask(c, q.kind, q)) { c.idle = 0; } return; }
    c.idle += dt; if (c.hunger < .35 && stats.app > 0 && c.cool <= 0 && c.idle > 1 && startTask(c, 'eat')) return; if (c.cool <= 0 && c.idle > 1.2 + (c.sign.length % 3) * .4 && !(c === sel && c.manual)) plan(c); return;
  }
  const k = c.task; k.t += dt * (c.hunger < .12 ? .65 : 1);
  if (k.stage === 'go') {
    const dx = k.tx - c.x, dy = k.ty - c.y, d = Math.hypot(dx, dy);
    if (d < 4) { k.stage = 'do'; k.t = 0; } else { const sp = c.speed * (c.hunger < .12 ? .65 : 1) * (k.kind === 'goto' || k.kind === 'come' ? 1.25 : (k.kind === 'fence' || k.kind === 'wall' || k.kind === 'torch' || k.kind === 'craft' || k.kind === 'chop' || k.kind === 'quarry') ? 1.7 : 1); c.x += dx / d * sp * dt; c.y += dy / d * sp * dt; if (Math.abs(dx) > 3) c.face = Math.sign(dx); c.walk = true;
      const fx = c.x - FC.x, fy = (c.y - (FC.y + 25)) * 1.5; const fd = Math.hypot(fx, fy); if (fd < 125) { c.x = FC.x + fx / fd * 125; c.y = FC.y + 25 + fy / fd * 125 / 1.5; } }
    if (k.stage === 'go') return;
  }
  c.walk = false;
  if (k.kind === 'shake') { const Tr = k.tree; if (k.t > .35) { Tr.shake = k.t; for (const tt of [.5, .85, 1.15, 1.45]) { const key = 'a' + tt; if (k.t > tt && !k[key]) { k[key] = 1; for (let i = 0; i < 2; i++) { const ax = Tr.x + rnd(-62, 62), ground = Tr.y + 30 + rnd(-6, 34); apples.push({ x: ax, y: ground, z: rnd(110, 150) * (Tr.sc || 1), vz: 0, st: 'fall', claim: null }); } burst(Tr.x + rnd(-50, 50), Tr.y - 90, 3, ['#4fc455', '#2c8f78'], { z: 90, sp: 40 }); if (!k.called) { k.called = 1; callHungry(c); } } } } }
  if (k.kind === 'chop') { k.tree.chopT = k.t; if (((k.t * 2.6) % 1) < dt * 2.6) burst(k.tree.x + 6, k.tree.y - 16, 4, woodChips, { sp: 70, z: 14 }); }
  if (k.kind === 'quarry' && ((k.t * 2.6) % 1) < dt * 2.6) burst(k.rock.x - 12, k.rock.y - 14, 3, ['#b9bfcc', '#8c93a3'], { sp: 70, z: 12 });
  if ((k.kind === 'fence' || k.kind === 'wall' || k.kind === 'torch') && ((k.t * 2.6) % 1) < dt * 2.6) burst(c.x + c.face * 24, c.y - 14, 3, ['#ffe36b', '#fff6c2'], { sp: 50, z: 10 });
  if (k.kind === 'mine' && ((k.t * 2.6) % 1) < dt * 2.6) { burst(k.r.x - 8, k.r.y - 8, 4, k.r === goldRock ? ['#ffe36b', '#fff6c2', '#ffb02e'] : ['#7fe0ff', '#d6f6ff'], { sp: 70, z: 12 }); }
  if (k.kind === 'dig' || k.kind === 'treasure') { if (((k.t * 2.2) % 1) < dt * 2.2) burst(c.x + c.face * 18, c.y, 3, ['#8a5530', '#a5683c'], { sp: 40 }); }
  if (k.kind === 'water' && Math.random() < dt * 14) burst(c.x + c.face * 26, c.y - 12, 1, '#7fd6ff', { sp: 10, up: .1, s: 2 });
  if (k.kind === 'splash' && Math.random() < dt * 12) burst(FC.x + rnd(-70, 70), FC.y + 80, 2, ['#7fd6ff', '#d6f6ff'], { sp: 40, z: 10, up: 1.4 });
  if (k.kind === 'roar' && k.t > .3 && !k.r1) { k.r1 = 1; roarSound(); }
  if (k.kind === 'roar') for (const tt of [.45, .8, 1.15]) { const key = 'ring' + tt; if (k.t > tt && !k[key]) { k[key] = 1; rings.push({ x: c.x, y: c.y - 46, t: 0 }); } }
  if (k.kind === 'dance' && Math.random() < dt * 5) burst(c.x + rnd(-30, 30), c.y - 70, 1, ['#ffd45c', '#ff8ad0', '#7fe0ff'], { sp: 20, z: 0, up: 1.2, g: 0 });
  if (k.t >= (k.dur || 0)) { (DONE[k.kind] || (() => { }))(c, k); if (k.kind === 'wander' || k.kind === 'goto' || k.kind === 'come') { } c.task = null; c.idle = 0; if (c.queue.length === 0 && c.manual) { c.manual = false; c.cool = 7; } }
}
// crops grow
function updCrops(dt) { for (const q of CELLS) if (q.st === 'crop' && q.stage < 4) { q.g += dt; if (q.g > 5.5) { q.g = 0; q.stage++; burst(q.x, q.y - 14, 4, ['#9be97b', '#ffffff'], { sp: 24, z: 6, up: .6, g: 80 }); } } }
function updApples(dt) { for (const a of apples) if (a.st === 'fall') { a.vz -= 520 * dt; a.z += a.vz * dt; if (a.z <= 0) { a.z = 0; if (Math.abs(a.vz) > 90) a.vz = -a.vz * .4; else { a.st = 'ground'; a.vz = 0; } } } }
function updMush(dt) { for (const m of mushrooms) if (!m.alive) { m.t += dt; if (m.t > 25) m.alive = true; } }

// ---------- commands ----------
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, ' ');
const CMD = [
  [/mang|nourri|eat|food/, 'eat', 'eat'],
  [/plant.*(arbre|pommier|tree)|(arbre|pommier|tree).*plant/, 'planttree', 'plant a tree'],
  [/coup|abat|bucher|\bbois\b|tronc|chop|cut|fell|\bwood\b|\blog\b/, 'chop', 'chop wood'],
  [/barriere|cloture|palissade|enclos|fence|barrier/, 'fence', 'build the fence'],
  [/torche|flambeau|\bfeu\b|lumiere|torch|\bfire\b|lantern/, 'torch', 'place a torch'],
  [/pierre|caillou|rocher|roche|stone|rock|quarry/, 'quarry', 'quarry stone'],
  [/brique|brick|craft|make/, 'craft', 'craft bricks'],
  [/\bmur\b|muraille|maison|empile|\bwall\b|house/, 'wall', 'build the wall'],
  [/arros|water/, 'water', 'water'], [/secou|shake|arbre|tree|pomme|fruit|apple/, 'shake', 'shake the tree'], [/creus|dig|trou|hole/, 'dig', 'dig'], [/plant|seme|graine|seed|sow/, 'plant', 'plant'],
  [/recolt|cueill|harvest|moisson/, 'harvest', 'harvest'], [/ramass|collect|pick/, 'collect', 'collect'], [/pioch|mine|\bor\b|gold|gem|cristal|crystal/, 'mine', 'mine'],
  [/dans|danc|groov/, 'dance', 'dance'], [/saut|jump|bondi|hop/, 'jump', 'jump'], [/rug|roar|grogn|growl/, 'roar', 'roar'], [/couch|allong|dor|sleep|repos|rest/, 'sleep', 'sleep'],
  [/fontaine|fountain|eclabouss|splash/, 'splash', 'go to the fountain'], [/viens|come|ici|suis|follow|here/, 'come', 'come here'],
];
CMD.unshift(
  [/formation|formez|form up|rassembl|gather|en garde|attention|defend|defense/, 'formup', 'TEAM FORMATION'],
  [/feux? (dans|a) la main|prenez les feux|carry (a )?fire|fire in hand|brandish|torch in hand/, 'carryfire', 'carry fire'],
);
function say(text) {
  text = (text || '').trim(); if (!text) return; const n = norm(text) + ' ';
  let target = null; for (const s of ACTIVE) if (ALIAS[s].test(n)) { target = byId(s); break; }
  if (target) select(target); const c = sel;
  const parts = n.split(/\s*(?:,|\.|;|\bet\b|\bpuis\b|\bensuite\b|\bapres\b|\bthen\b|\band\b)\s*/).filter(Boolean);
  const cmds = []; for (const p of parts) for (const [re, kind, label] of CMD) if (re.test(p + ' ')) { cmds.push({ kind, label }); break; }
  if (!cmds.length) { say_(`I heard: <b>“${text}”</b><br>…I don't know that order yet 🙈`); playAck('no'); return; }
  const exp = []; cmds.forEach((x, i) => { exp.push(x); if (x.kind === 'dig') { const nx = cmds[i + 1]; if (!(nx && (nx.kind === 'plant' || nx.kind === 'planttree'))) exp.push({ kind: 'planttree', label: 'plant a tree in the hole', afterDig: true }); } });
  const kinds = cmds.map(x => x.kind);
  if (kinds.includes('formup')) { say_(`<b>The team</b> heard “${text}”<br>→ TEAM FORMATION${kinds.includes('carryfire') ? ' · fire in hand' : ''}`); teamForm(kinds.includes('carryfire')); playAck('yes'); return; }
  if (/\b(tous|tout le monde|equipe|team|everyone|everybody|all signs)\b/.test(n) && exp.length) { for (const o of crs) { o.task = null; o.queue = exp.map(x => ({ kind: x.kind, afterDig: x.afterDig })); o.manual = true; o.idle = 0; } say_(`<b>Everyone</b> heard “${text}”<br>→ ${exp.map(x => x.label).join(' ▸ ')}`); playAck('yes'); return; }
  say_(`<b>${NAME[c.sign]}</b> heard “${text}”<br>→ ${exp.map(x => x.label).join(' ▸ ')}`);
  c.queue = exp.map(x => ({ kind: x.kind, afterDig: x.afterDig, rock: /cristal|crystal|gem/.test(n) ? 'c' : 'g', apple: /pommier|apple tree/.test(n), n: /tout|complet|entier|jusqu|all|whole|full/.test(n) ? 99 : undefined })); c.task = null; c.manual = true; c.idle = 0; playAck('yes');
}
function select(c) { camFree = false; sel = c; $('sel').textContent = NAME[c.sign]; }

// ---------- sound ----------
let ac; function AC() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { } return ac; }
function blip(f) { try { const a = AC(); if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.type = 'square'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.6, t + .08); g.gain.setValueAtTime(.05, t); g.gain.exponentialRampToValueAtTime(.001, t + .14); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .15); } catch (e) { } }
function roarSound() {
  try { const a = AC(); if (!a) return; const t = a.currentTime; const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(72, t); o.frequency.linearRampToValueAtTime(118, t + .35); o.frequency.exponentialRampToValueAtTime(46, t + 1.6);
    const lfo = a.createOscillator(); lfo.frequency.value = 27; const lg = a.createGain(); lg.gain.value = 16; lfo.connect(lg); lg.connect(o.frequency);
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(450, t); f.frequency.linearRampToValueAtTime(1500, t + .3); f.frequency.linearRampToValueAtTime(260, t + 1.6);
    const g = a.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.5, t + .12); g.gain.linearRampToValueAtTime(.34, t + 1.0); g.gain.exponentialRampToValueAtTime(.001, t + 1.7);
    const nb = a.createBuffer(1, a.sampleRate * 1.8, a.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * .6;
    const ns = a.createBufferSource(); ns.buffer = nb; const ng = a.createGain(); ng.gain.value = .35; ns.connect(ng); ng.connect(f);
    o.connect(f); f.connect(g); g.connect(a.destination); o.start(t); lfo.start(t); ns.start(t); o.stop(t + 1.8); lfo.stop(t + 1.8); ns.stop(t + 1.8); } catch (e) { }
}

// ---------- [intégration Astro Code] musique du jardin ----------
// « Where Moonlight Grows » (boucle seamless de l'app), volume 50 %.
// Démarre au premier toucher (les navigateurs bloquent l'autoplay),
// bouton 🔊/🔇, et elle se COUPE pendant l'enregistrement pour que
// Muse Voice Transcribe entende la voix proprement.
const MUS = new Audio('assets/garden-music.mp3'); MUS.loop = true; MUS.volume = .5; MUS.preload = 'auto';
let musicWanted = true;
function farmMusic(on) { try { if (on && musicWanted) { const pr = MUS.play(); if (pr && pr.catch) pr.catch(() => { }); } else MUS.pause(); } catch (e) { } }
addEventListener('pointerdown', () => farmMusic(true), { once: true });
const musBtn = $('b_music');
if (musBtn) musBtn.addEventListener('click', () => { musicWanted = !musicWanted; musBtn.textContent = musicWanted ? '🔊' : '🔇'; farmMusic(musicWanted); });

// ---------- [demande d'Hamza] voix de réponse des créatures ----------
// 3 « oui » et 3 « non » (petites voix) : quand un ordre est compris et mis
// en file, la créature répond oui (au hasard, jamais deux fois la même) ;
// quand l'ordre n'est pas compris, elle répond qu'elle ne sait pas faire.
const ACK = { yes: [], no: [] };
for (let i = 1; i <= 3; i++) { const y = new Audio('assets/audio/ack-yes-' + i + '.mp3'); y.preload = 'auto'; ACK.yes.push(y); const n = new Audio('assets/audio/ack-no-' + i + '.mp3'); n.preload = 'auto'; ACK.no.push(n); }
const ackLast = { yes: -1, no: -1 };
function playAck(kind) { try { const arr = ACK[kind]; let i = Math.floor(Math.random() * arr.length); if (arr.length > 1 && i === ackLast[kind]) i = (i + 1) % arr.length; ackLast[kind] = i; const a = arr[i]; a.currentTime = 0; const pr = a.play(); if (pr && pr.catch) pr.catch(() => { }); } catch (e) { } }

// ---------- [demande d'Hamza] FORMATION D'ÉQUIPE (démo) ----------
// Toute l'équipe se range en arc devant la fontaine. Les signes pas encore
// rencontrés rejoignent comme INVITÉS simulés (jamais sauvegardés, ils
// repartent en étincelles après ~18 s) — pour voir la magie de l'équipe
// complète pendant la démo, même avec 2 signes collectés.
let formUntil = 0;
function teamForm(withFire) {
  SIGNS.forEach((sg, i) => {
    let c = crs.find(o => o.sign === sg);
    if (!c) { c = { sign: sg, x: FC.x + rnd(-40, 40), y: FC.y + 250, face: 1, task: null, queue: [], t: rnd(0, 5), idle: 0, cool: 0, hop: 0, carry: null, hunger: 1, speed: 86, guest: true, temp: true, manual: true }; crs.push(c); burst(c.x, c.y - 40, 10, ['#ffd45c', '#7fe0ff', '#ffffff'], { sp: 50, z: 20 }); }
    const row = i % 2, j = Math.floor(i / 2), tt = 0.5 + (j - 2.5) / 5 * 0.84, a = PI * tt;
    const fx = FC.x + Math.cos(a) * 300, fy = FC.y + (row === 0 ? 126 : 58) + Math.sin(a) * 50;
    c.task = null; c.manual = true; c.idle = 0;
    c.queue = withFire ? [{ kind: 'carryfire' }, { kind: 'formup', fx, fy }] : [{ kind: 'formup', fx, fy }];
  });
  formUntil = T + 18;
  say_(`✦ <b>TEAM FORMATION!</b> The whole team lines up in front of the fountain${withFire ? ' — fire in hand, ready to face the night' : ''}. <span style="opacity:.75">(demo: signs you have not met yet join as guests)</span>`);
}
const formBtn = $('b_form');
if (formBtn) formBtn.addEventListener('click', () => teamForm(spirits.length > 0));

// ---------- rendering ----------
let vw = 0, vh = 0, dpr = 1, zoom = 1, cam = { x: FC.x, y: FC.y + 100 }, userZoom = 1, camFree = false;
const SC = () => zoom * userZoom;
function clampCam() { const sc = SC(); const hw = vw / 2 / sc, hh = vh / 2 / sc; cam.x = W < hw * 2 ? W / 2 : clamp(cam.x, hw, W - hw); cam.y = H < hh * 2 ? H / 2 : clamp(cam.y, hh - 60, H - hh + 60); }
function resize() { dpr = Math.min(3, devicePixelRatio || 1); vw = innerWidth; vh = innerHeight; cv.width = vw * dpr; cv.height = vh * dpr; zoom = +QS.get('z') || (vw > vh ? vh / 640 : vw / 470); }
addEventListener('resize', resize); resize();
let T = 0;
const img = (k, x, y, o = {}) => { const im = IM[k]; if (!im) return; const [w, h] = SZ(k); const sx = (o.sx || 1), sy = (o.sy || 1); ctx.save(); ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); ctx.scale((o.flip || 1) * sx, sy); ctx.globalAlpha = o.a == null ? 1 : o.a; ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore(); };
function shadow(x, y, w) { ctx.fillStyle = 'rgba(30,70,40,.28)'; ctx.beginPath(); ctx.ellipse(x, y, w, w * .32, 0, 0, PI * 2); ctx.fill(); }
const SHAD = { tree: 62, pine: 50, autumn: 52, appletree: 62, bush1: 22, bush2: 22, bush3: 22, rock: 36, rock2: 18, stump: 20, well: 32, hay: 28, chest: 20, crate: 18, wheelbarrow: 28, goldrock: 34, crystal: 34, fountain: 0, stela: 22 };
function drawProp(p) {
  const k = p.k; if (SHAD[k] || p.stela) shadow(p.x, p.y - 2, (SHAD[k] || 24) * (p.fruitTree && p.dsc != null ? p.dsc : 1));
  if (p.fruitTree || p.chopT || p.shake) {
    const swv = p.shake ? Math.sin(p.shake * 38) * 3 * Math.max(0, 1 - Math.max(0, p.shake - 1.6) * 3) : (p.chopT ? Math.sin(p.chopT * 30) * 2.2 : 0);
    let key = p.k, sc = p.dsc != null ? p.dsc : (p.sc || 1); if (p.fruitTree) key = p.ready ? 'appletree' : 'tree'; if (p.born != null && p.planted) sc *= clamp((T - p.born) / .35, .2, 1);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(swv * .012); ctx.translate(-p.x, -p.y); img(key, p.x + swv, p.y, { sx: sc, sy: sc * (p.fruitTree && !p.ready && key === 'tree' && !p.planted ? 1.1 : 1) }); ctx.restore(); return;
  }
  if (k === 'fountain') { img(k, p.x, p.y);
    // eau animée : 3 jets en arc, éclaboussures au bassin, ondulations
    ctx.save(); ctx.lineWidth = 2;
    for (let rI = 0; rI < 2; rI++) { const q = (T * .7 + rI * .5) % 1; ctx.strokeStyle = `rgba(165,228,255,${.45 * (1 - q)})`; ctx.beginPath(); ctx.ellipse(p.x, p.y - 54, 16 + q * 52, (16 + q * 52) * .3, 0, 0, PI * 2); ctx.stroke(); }
    for (let j = 0; j < 3; j++) { const ox = (j - 1) * 17, x0 = p.x + ox * .35, y0 = p.y - 124, x1 = p.x + ox * 2.3, y1 = p.y - 60; for (let dI = 0; dI < 7; dI++) { const q = (T * .9 + j / 3 + dI / 7) % 1; const wx = x0 + (x1 - x0) * q, wy = y0 + (y1 - y0) * q * q - Math.sin(q * PI) * 7; ctx.globalAlpha = .8 * (1 - q * .35); ctx.fillStyle = dI % 3 === 0 ? '#ffffff' : '#aee6ff'; ctx.beginPath(); ctx.arc(wx, wy, 2.7 - q * 1.2, 0, 0, PI * 2); ctx.fill(); } }
    ctx.globalAlpha = 1; ctx.restore();
    if (Math.random() < .5) burst(p.x + rnd(-46, 46), p.y - 52, 1, ['#aee6ff', '#ffffff'], { sp: 22, z: 6, up: 1.6, s: 2 });
    const g = ctx.createRadialGradient(p.x, p.y - 62, 4, p.x, p.y - 62, 120); g.addColorStop(0, 'rgba(120,235,255,.38)'); g.addColorStop(1, 'rgba(120,235,255,0)'); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p.x, p.y - 62, 130, 80, 0, 0, PI * 2); ctx.fill(); ctx.restore(); return; }
  if (p.stela) { img(k, p.x, p.y, { sy: 1 + Math.sin(T * 1.6 + p.x) * .006 }); const g = ctx.createRadialGradient(p.x, p.y - 82, 2, p.x, p.y - 82, 46); const pl = .35 + .2 * Math.sin(T * 2 + p.x * .01); g.addColorStop(0, `rgba(255,214,120,${pl})`); g.addColorStop(1, 'rgba(255,214,120,0)'); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(p.x - 50, p.y - 130, 100, 100); ctx.restore(); return; }
  img(k, p.x, p.y);
}
const HSTAGE = ['crop0', 'crop1', 'crop2', 'crop3', 'crop4'];
function drawCell(q) { if (q.st === 'mound') img('mound', q.x, q.y + 8); else if (q.st === 'crop') img(HSTAGE[q.stage], q.x, q.y + 14); }
function drawApple(a) {
  const x = Math.round(a.x), y = Math.round(a.y - a.z); if (a.z > 0 || true) shadow(a.x, a.y + 1, 6 + Math.max(0, 3 - a.z / 20));
  ctx.fillStyle = '#5c1620'; ctx.fillRect(x - 6, y - 12, 12, 11); ctx.fillRect(x - 4, y - 14, 8, 2); ctx.fillStyle = '#e53a3a'; ctx.fillRect(x - 5, y - 11, 10, 9); ctx.fillStyle = '#ff7a7a'; ctx.fillRect(x - 4, y - 10, 3, 3); ctx.fillStyle = '#3fa14a'; ctx.fillRect(x - 1, y - 16, 4, 3); ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x, y - 15, 1, 3);
}
function drawCr(c) {
  const k = c.task; const base = 'c_' + c.sign; let hop = 0, sx = 1, sy = 1, rot = 0, off = 0;
  const flip = c.face;
  if (c.walk) { const ph = c.t * 11; hop = Math.abs(Math.sin(ph)) * 5; sy = 1 - Math.abs(Math.cos(ph)) * .05; sx = 1 + Math.abs(Math.cos(ph)) * .04; rot = Math.sin(ph) * .05; }
  else { sy = 1 + Math.sin(c.t * 2.2 + c.x) * .018; sx = 1 - Math.sin(c.t * 2.2 + c.x) * .01; }
  let tool = null, extra = 0;
  if (k && k.stage === 'do') {
    const t = k.t;
    switch (k.kind) {
      case 'jump': { const q = clamp(t / .9, 0, 1); hop = Math.sin(q * PI) * 70; sy = q < .15 ? 1 - q * 1.2 : q > .85 ? 1 - (1 - q) * 1.2 : 1.06; sx = 2 - sy; break; }
      case 'dance': { const b = Math.sin(t * 11); hop = Math.abs(b) * 14; rot = Math.sin(t * 5.5) * .22; c.face = Math.sin(t * 2.7) > 0 ? 1 : -1; break; }
      case 'roar': { const q = clamp(t / 2.4, 0, 1); const e = q < .2 ? q / .2 : q > .85 ? (1 - q) / .15 : 1; sx = 1 + .22 * e + Math.sin(t * 40) * .02 * e; sy = 1 + .18 * e; off = Math.sin(t * 45) * 2 * e; break; }
      case 'sleep': sy = .8 + Math.sin(t * 1.6) * .02; sx = 1.1; break;
      case 'mine': case 'chop': case 'quarry': case 'fence': case 'wall': case 'torch': if (!AN[c.sign]) tool = 'pickaxe'; hop = 0; break;
      case 'planttree': if (!AN[c.sign]) tool = 'shovel'; break;
      case 'craft': case 'eat': sy = .9 + Math.abs(Math.sin(t * 6)) * .08; break;
      case 'dig': case 'treasure': if (!AN[c.sign]) tool = 'shovel'; break;
      case 'water': if (!AN[c.sign]) tool = 'can'; break;
      case 'plant': case 'harvest': case 'forage': sy = .86 + Math.abs(Math.sin(t * 7)) * .1; break;
      case 'splash': { const q = (t * 1.6) % 1; hop = Math.sin(q * PI) * 40; break; }
      case 'shake': { off = Math.sin(t * 38) * 2; break; }
    }
  }
  shadow(c.x, c.y, 24 * (1 - Math.min(.4, hop / 120)));
  const cx = c.x + off, cy = c.y - hop;
  let drew = false; const A_ = AN[c.sign];
  if (A_) {
    let act = null, fi = 0;
    if (c.walk) { act = 'walk'; fi = Math.floor(c.t * 10) % 6; }
    else if (k && k.stage === 'do' && KMAP[k.kind]) { act = KMAP[k.kind]; const D = k.dur || 1; fi = ONESHOT[act] ? Math.min(5, Math.floor(k.t / D * 6)) : Math.floor(k.t * (act === 'dance' ? 7 : 8)) % 6; if (k.kind === 'chop' || k.kind === 'fence' || k.kind === 'wall' || k.kind === 'torch') fi = [0, 1, 2, 2, 1, 0][Math.floor(k.t * 5) % 6]; if (k.kind === 'planttree') fi = Math.min(5, Math.floor(k.t / D * 6)); if (k.kind === 'jump') fi = Math.min(5, Math.floor(clamp(k.t / .95, 0, .999) * 6)); }
    const im = act && IM['a_' + c.sign + '_' + act];
    if (im) { const [cw, ch] = A_[act], pw = im.width / 6; ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot * .5); ctx.scale(flip, 1); ctx.drawImage(im, fi * pw, 0, pw, im.height, -cw / 2, -ch, cw, ch); ctx.restore(); drew = true; }
  }
  if (!drew) img(base, cx, cy, { flip, sx, sy, rot });
  if (c.carry) img('crate', cx, cy - 66 - hop * .2, { sx: .8, sy: .8 });
  if (c.fireUntil && c.fireUntil > T) { const fx2 = cx + c.face * 24, fy2 = cy - 46, fl = 1 + Math.sin(T * 13 + c.x) * .18; ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gf = ctx.createRadialGradient(fx2, fy2, 2, fx2, fy2, 36); gf.addColorStop(0, 'rgba(255,170,60,.5)'); gf.addColorStop(1, 'rgba(255,120,20,0)'); ctx.fillStyle = gf; ctx.fillRect(fx2 - 36, fy2 - 36, 72, 72); ctx.restore(); ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.ellipse(fx2, fy2, 6 * fl, 10 * fl, 0, 0, PI * 2); ctx.fill(); ctx.fillStyle = '#ffd23e'; ctx.beginPath(); ctx.ellipse(fx2, fy2 + 2, 3.4 * fl, 6 * fl, 0, 0, PI * 2); ctx.fill(); ctx.fillStyle = '#fff6c2'; ctx.beginPath(); ctx.ellipse(fx2, fy2 + 4, 1.6, 3, 0, 0, PI * 2); ctx.fill(); }
  if (tool) { const t = k.t; const f = c.face; ctx.save(); ctx.translate(cx + f * 26, cy - 10);
    if (tool === 'pickaxe') { const a = -1.5 + ((t * 2.6) % 1) * 2.0; ctx.rotate(f * a * 1.0); img('pickaxe', 0, 0, { flip: f }); }
    else if (tool === 'shovel') { ctx.translate(0, Math.abs(Math.sin(t * 7)) * 8); ctx.rotate(f * .25); img('shovel', 0, 0, { flip: f }); }
    else { ctx.rotate(f * (.5 + Math.sin(t * 5) * .15)); img('can', 0, 0, { flip: f }); }
    ctx.restore(); }
  if (c.hunger < .4) { const by = cy - (A_ ? (SZ('c_' + c.sign)[1]) : 70) - 10; ctx.fillStyle = c.hunger < .12 ? 'rgba(255,90,90,.95)' : 'rgba(255,255,255,.92)'; ctx.beginPath(); ctx.arc(cx, by, 11, 0, PI * 2); ctx.fill(); ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#000'; ctx.fillText(c.hunger < .12 ? '😢' : '🍎', cx, by + 5); ctx.textAlign = 'left'; }
  if (c === sel) { ctx.strokeStyle = `rgba(255,207,92,${.75 + .2 * Math.sin(T * 6)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(c.x, c.y + 2, 32, 11, 0, 0, PI * 2); ctx.stroke(); }
  if (k && k.stage === 'do' && k.kind === 'sleep') { ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.globalAlpha = .9; ctx.fillText('z', cx + 24, cy - 62 - (k.t * 14) % 22); ctx.fillText('Z', cx + 34, cy - 74 - (k.t * 10) % 22); ctx.globalAlpha = 1; }
}
// ---------- v2 : dessins (barrières, torches, mur, esprits, nuit) ----------
const pop = born => { const q = T - born; return q < .3 ? 1 + (1 - q / .3) * .45 : 1; };
function drawSlot(q) {
  if (!q.built) return; const p = pop(q.born);
  const post = (px, py) => { ctx.fillStyle = '#4a2a14'; ctx.fillRect(px - 5, py - 30, 10, 33); ctx.fillStyle = '#a56b3a'; ctx.fillRect(px - 3, py - 29, 6, 30); ctx.fillStyle = '#d8a468'; ctx.fillRect(px - 5, py - 32, 10, 4); };
  ctx.save(); ctx.translate(q.mx, q.my); ctx.scale(p, p); ctx.translate(-q.mx, -q.my);
  ctx.strokeStyle = 'rgba(30,70,40,.25)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(q.x1, q.y1 + 3); ctx.lineTo(q.x2, q.y2 + 3); ctx.stroke();
  for (const h of [11, 21]) { ctx.strokeStyle = '#5a3418'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(q.x1, q.y1 - h); ctx.lineTo(q.x2, q.y2 - h); ctx.stroke(); ctx.strokeStyle = '#c28a50'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(q.x1, q.y1 - h - 1); ctx.lineTo(q.x2, q.y2 - h - 1); ctx.stroke(); }
  post(q.x1, q.y1); post(q.x2, q.y2); post(q.mx, q.my); ctx.restore();
}
function drawTorch(t) {
  if (!t.built) return; const p = pop(t.born);
  ctx.save(); ctx.translate(t.x, t.y); ctx.scale(p, p); shadowAt(0, 0, 10);
  ctx.fillStyle = '#4a2a14'; ctx.fillRect(-4, -44, 8, 46); ctx.fillStyle = '#9a5f32'; ctx.fillRect(-2, -43, 4, 44);
  ctx.fillStyle = '#2b1c10'; ctx.fillRect(-9, -50, 18, 8); ctx.fillStyle = '#5a3a22'; ctx.fillRect(-7, -49, 14, 4);
  if (t.lit) { const f = Math.sin(T * 14 + t.x) * 2; ctx.fillStyle = '#ff6a2a'; ctx.fillRect(-6, -62 + f, 12, 13); ctx.fillStyle = '#ffb02e'; ctx.fillRect(-4, -66 + f, 8, 15); ctx.fillStyle = '#fff1a0'; ctx.fillRect(-2, -60 + f, 4, 8); }
  else { ctx.fillStyle = '#3a2a22'; ctx.fillRect(-5, -54, 10, 5); }
  ctx.restore();
}
function shadowAt(x, y, w) { ctx.fillStyle = 'rgba(30,70,40,.28)'; ctx.beginPath(); ctx.ellipse(x, y, w, w * .32, 0, 0, PI * 2); ctx.fill(); }
function drawBrick(b) {
  if (!b.built) return; const p = pop(b.born); ctx.save(); ctx.translate(b.x, b.y); ctx.scale(p, p);
  ctx.fillStyle = '#4a1d12'; ctx.fillRect(-13, -15, 26, 16); ctx.fillStyle = '#c4572d'; ctx.fillRect(-12, -14, 24, 14); ctx.fillStyle = '#e2784a'; ctx.fillRect(-12, -14, 24, 4); ctx.fillStyle = '#8a3a1e'; ctx.fillRect(-12, -4, 24, 3); ctx.fillStyle = '#e8d8c0'; ctx.fillRect(-1, -10, 2, 6); ctx.restore();
}
const GHOST = ['....XXXX....', '..XXXXXXXX..', '.XXXXXXXXXX.', 'XXXXXXXXXXXX', 'XXEEXXXXEEXX', 'XXEEXXXXEEXX', 'XXXXXXXXXXXX', 'XXXXXMMXXXXX', 'XXXXXXXXXXXX', 'XXXXXXXXXXXX', 'XX.XXXX.XXXX', 'X...XX...XX.'];
function drawSpirit(s) {
  const a = s.state === 'come' ? 1 : clamp(1 - Math.max(0, s.t - 1.5) / 1.2, 0, 1) * (s.state === 'bounce' ? .9 : 1); if (a <= 0) return;
  const bob = Math.sin(T * 3 + s.x) * 5, u = 5; ctx.save(); ctx.globalAlpha = a * .92; ctx.translate(Math.round(s.x - 6 * u), Math.round(s.y - 14 * u + bob));
  GHOST.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch === '.') continue; ctx.fillStyle = ch === 'E' ? '#ffe36b' : ch === 'M' ? '#1a1033' : (j < 2 || i === 0 || i === 11 ? '#2a1d52' : '#4a3688'); ctx.fillRect(i * u, j * u, u, u); } });
  ctx.restore();
  if (s.loot) { ctx.globalAlpha = a; img(s.loot, s.x, s.y - 78 + bob, { sx: .9, sy: .9 }); ctx.globalAlpha = 1; }
}
function drawNight() {
  if (nf < .01) return;
  ctx.save();
  // Vrai filtre nuit en MULTIPLY OPAQUE : la couleur porte l'intensité
  // (blanc = rien, bleu nuit profond = nuit pleine) — assombrit et bleuit
  // en gardant contraste et détails, pas de voile gris. Un souffle de bleu
  // source-over unifie l'ensemble.
  const mx = (a, b) => Math.round(a + (b - a) * nf);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${mx(255, 103)},${mx(255, 114)},${mx(255, 158)})`;
  ctx.fillRect(-800, -800, W + 1600, H + 1600);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(14,22,62,${.09 * nf})`;
  ctx.fillRect(-800, -800, W + 1600, H + 1600);
  // Masques de lumière (additif) : torches, lanternes, stèles, fontaine —
  // et les PERSONNAGES restent éclairés (halo chaud + cœur lumineux).
  ctx.globalCompositeOperation = 'lighter';
  const glowAt = (x, y, r, rgb, a) => { const g = ctx.createRadialGradient(x, y, 2, x, y, r); g.addColorStop(0, `rgba(${rgb},${a * nf})`); g.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
  torches.forEach(t => { if (t.built && t.lit) glowAt(t.x, t.y - 56, 150 + Math.sin(T * 9 + t.x) * 5, '255,170,80', .62); });
  props.forEach(p => { if (p.k === 'lantern') glowAt(p.x + 14, p.y - 70, 95, '255,200,110', .5); if (p.stela) glowAt(p.x, p.y - 82, 66, '255,214,120', .5); });
  DECOR.forEach(p => { if (p.k === 'house') glowAt(p.x, p.y - 40, 62, '255,200,110', .30); });
  glowAt(FC.x, FC.y + 10, 190, '120,235,255', .42);
  crs.forEach(c => { glowAt(c.x, c.y - 28, 48, '255,230,170', .22); glowAt(c.x, c.y - 34, 26, '255,240,200', .15); if (c.fireUntil && c.fireUntil > T) glowAt(c.x + c.face * 24, c.y - 46, 42, '255,160,60', .38); });
  ctx.restore();
}

// ---------- [demande d'Hamza] NUAGES autour de la carte ----------
// Le monde flotte dans le ciel : hors du gazon, des nuages dérivent
// lentement tout autour — la carte ne s'arrête plus net.
const CLOUDS = [];
{ const band = (x0, x1, y0, y1, n) => { for (let i = 0; i < n; i++) CLOUDS.push({ x: x0 + Math.random() * (x1 - x0), y: y0 + Math.random() * (y1 - y0), s: .7 + Math.random() * .8, ph: Math.random() * 9 }); };
  band(-40, W + 40, -250, -80, 5); band(-40, W + 40, H + 80, H + 250, 5); band(-270, -90, -40, H + 40, 4); band(W + 90, W + 270, -40, H + 40, 4); }
function drawClouds() {
  for (const c of CLOUDS) { const cx = c.x + Math.sin(T * .06 + c.ph) * 30, cy = c.y + Math.sin(T * .045 + c.ph * 2) * 8, sc = c.s;
    ctx.fillStyle = 'rgba(178,220,244,.55)'; ctx.beginPath(); ctx.ellipse(cx, cy + 7 * sc, 62 * sc, 19 * sc, 0, 0, PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.94)';
    for (const [ox, oy, rx, ry] of [[0, 0, 56, 19], [-38, 6, 38, 14], [38, 6, 42, 15], [-14, -12, 40, 16], [18, -10, 34, 13]]) { ctx.beginPath(); ctx.ellipse(cx + ox * sc, cy + oy * sc, rx * sc, ry * sc, 0, 0, PI * 2); ctx.fill(); } }
}
function frame() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const sky = ctx.createLinearGradient(0, 0, 0, vh); sky.addColorStop(0, '#a8ddf3'); sky.addColorStop(1, '#74b9de'); ctx.fillStyle = sky; ctx.fillRect(0, 0, vw, vh);
  const sc = SC();
  ctx.translate(vw / 2 - cam.x * sc, vh / 2 - cam.y * sc); ctx.scale(sc, sc);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(terrain, 0, 0);
  drawClouds();
  // y-sorted drawables
  const dr = [];
  props.forEach(p => dr.push([p.y, () => drawProp(p)]));
  DECOR.forEach(p => dr.push([p.y, () => p.k === 'house' ? drawHouse(p) : drawProp(p)]));
  CELLS.forEach(q => dr.push([q.y + 10, () => drawCell(q)]));
  slots.forEach(q => { if (q.built) dr.push([q.my, () => drawSlot(q)]); });
  torches.forEach(t => { if (t.built) dr.push([t.y, () => drawTorch(t)]); });
  WALL.forEach(b => { if (b.built) dr.push([b.y, () => drawBrick(b)]); });
  crs.forEach(c => dr.push([c.y, () => drawCr(c)]));
  apples.forEach(a => dr.push([a.y + 1, () => drawApple(a)]));
  mushrooms.forEach(m => { if (m.alive) dr.push([m.y, () => { shadow(m.x, m.y, 9); img('mushroom', m.x, m.y); }]); });
  dr.sort((a, b) => a[0] - b[0]); dr.forEach(d => d[1]());
  drawNight();
  spirits.forEach(drawSpirit);
  // beacon
  if (beacon.t < 1.6) { const q = beacon.t / 1.6; ctx.strokeStyle = `rgba(255,255,255,${.8 * (1 - q)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(beacon.x, beacon.y, 10 + q * 22, (10 + q * 22) * .4, 0, 0, PI * 2); ctx.stroke(); }
  // rings
  rings.forEach(r => { const q = r.t / 1.3; ctx.strokeStyle = `rgba(255,214,120,${.8 * (1 - q)})`; ctx.lineWidth = 4 * (1 - q) + 1; ctx.beginPath(); ctx.ellipse(r.x, r.y, 20 + q * 120, (20 + q * 120) * .6, 0, 0, PI * 2); ctx.stroke(); });
  // particles
  parts.forEach(p => { ctx.globalAlpha = clamp(1 - p.t / p.life, 0, 1); ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y - p.z), p.s, p.s); }); ctx.globalAlpha = 1;
  // floaters
  floats.forEach(f => { const q = f.t / 1.4; ctx.globalAlpha = 1 - q * q; img(f.key, f.x, f.y - q * 40, { sx: .9, sy: .9 }); ctx.globalAlpha = 1; });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const f of flyers) { if (f.t < 0) continue; const p = clamp(f.t / f.d, 0, 1), e = p * p * (3 - 2 * p); const r = $(FLYTO[f.k] || 'h_inv').getBoundingClientRect(); const sx0 = (f.wx - cam.x) * SC() + vw / 2, sy0 = (f.wy - cam.y) * SC() + vh / 2; const x = sx0 + (r.left + 24 - sx0) * e, y = sy0 + (r.top + r.height / 2 - sy0) * e - Math.sin(p * PI) * 46; const im = IM[FLYIC[f.k]]; if (im) { const [w, h] = SZ(FLYIC[f.k]); const sz = 24, ww = w >= h ? sz : sz * w / h, hh = w >= h ? sz * h / w : sz; ctx.globalAlpha = .95; ctx.drawImage(im, x - ww / 2, y - hh / 2, ww, hh); ctx.globalAlpha = 1; } }
}
const beacon = { x: 0, y: 0, t: 9 };
function setClock() { const night = isNight(), rem = Math.max(0, Math.ceil(CYC - (clockT % CYC))); const m = Math.floor(rem / 60), sec = String(rem % 60).padStart(2, '0'); const el = $('clock'); const txt = (night ? '🌙 Night ' : '☀ Day ') + m + ':' + sec; if (el.textContent !== txt) { el.textContent = txt; el.classList.toggle('night', night); } }
const isSafe = sec => slots.every(q => q.sec !== sec || q.built) && torches[sec].built && torches[sec].lit;
function nightfall() { let lit = 0, dark = 0; torches.forEach(t => { t.lit = false; if (t.built) { if (stats.wood > 0) { stats.wood--; t.lit = true; lit++; } else dark++; } }); hud(); say_(`🌙 <b>Night falls.</b> ${lit} torch(es) lit (−${lit} wood)${dark ? ` · ⚠ ${dark} torch(es) out: no wood left!` : ''}<br>Spirits are roaming: fences + torches keep them out.`); }
function daybreak() { torches.forEach(t => t.lit = false); spirits.forEach(s => { if (s.state === 'come') { s.state = 'flee'; s.t = 0; } }); say_('☀ <b>Day breaks.</b> The spirits leave. Harvest, plant, build!'); }
function spawnSpirit() { const a = rnd(0, PI * 2); const x = clamp(FC.x + Math.cos(a) * (FX1 - FC.x + 210), 30, W - 30), y = clamp(FC.y + Math.sin(a) * (FY1 - FC.y + 150), 30, H - 20); spirits.push({ x, y, state: 'come', t: 0, inside: false, loot: null }); }
function updWorld(dt) {
  const nn = isNight(); if (nn !== lastNight) { lastNight = nn; if (nn) nightfall(); else daybreak(); }
  nf += clamp((nn ? 1 : 0) - nf, -dt / 10, dt / 10); setClock();
  if (nn && nf > .5) { spawnT -= dt; if (spawnT <= 0 && spirits.length < 4) { spawnT = rnd(8, 14); spawnSpirit(); } }
  for (const s of spirits) { s.t += dt;
    if (s.state === 'come') { const fc = crs.find(o => o.fireUntil && o.fireUntil > T && Math.hypot(o.x - s.x, o.y - s.y) < 115); if (fc) { s.state = 'flee'; s.t = 0; burst(s.x, s.y - 30, 12, ['#ffb02e', '#fff1a0', '#ff6a2a'], { sp: 80, z: 24 }); if (!s.msgd) { s.msgd = 1; say_('🔥 <b>The fire drives the spirit away!</b>'); } } }
    if (s.state === 'come') { const dx = FC.x - s.x, dy = FC.y + 40 - s.y, d = Math.hypot(dx, dy) || 1; const was = s.inside; s.x += dx / d * 52 * dt; s.y += dy / d * 52 * dt; const ins = s.x > FX0 && s.x < FX1 && s.y > FY0 && s.y < FY1;
      if (ins && !was) { const sec = sectorOf(s.x, s.y); if (isSafe(sec)) { s.state = 'bounce'; s.t = 0; burst(s.x, s.y - 30, 12, ['#ffe36b', '#fff', '#ffb02e'], { sp: 80, z: 30 }); } else { s.inside = true; } }
      if (s.inside && d < 120) { let loot = null, n = 0; if (stats.app > 0) { n = Math.min(3, stats.app); stats.app -= n; loot = 'apples'; } else if (stats.wood > 0) { n = Math.min(3, stats.wood); stats.wood -= n; loot = 'wood'; } else if (stats.wheat > 0) { n = Math.min(2, stats.wheat); stats.wheat -= n; loot = 'crop4'; } s.loot = loot; s.state = 'flee'; s.t = 0; hud(); say_(loot ? `👻 <b>A spirit stole ${n} ${loot === 'apples' ? 'fruit' : loot === 'wood' ? 'wood' : 'wheat'}!</b> A fence segment is missing or a torch is out.` : '👻 A spirit got in… but there was nothing to steal!'); } }
    else { const dx = s.x - FC.x, dy = s.y - FC.y, d = Math.hypot(dx, dy) || 1; s.x += dx / d * (s.state === 'bounce' ? 90 : 70) * dt; s.y += dy / d * (s.state === 'bounce' ? 90 : 70) * dt; }
  }
  for (let i = spirits.length - 1; i >= 0; i--) if (spirits[i].state !== 'come' && spirits[i].t > 2.8) spirits.splice(i, 1);
  for (const p of props) { if (p.planted && p.stage < 3) { p.g += dt; if (p.g > 18) { p.g = 0; p.stage++; p.sc = [.28, .62, 1, 1][p.stage]; burst(p.x, p.y - 20, 6, ['#9be97b', '#fff'], { sp: 30, z: 20 }); if (p.stage >= 3) p.ready = true; } }
    if (p.dsc == null) p.dsc = p.sc || 1; if (p.sc != null) p.dsc += (p.sc - p.dsc) * Math.min(1, dt * 3);
    if (p.fruitTree && !p.ready && p.regrow > 0) { p.regrow -= dt; if (p.regrow <= 0 && (!p.planted || p.stage >= 3)) p.ready = true; } }
}
function update(dt) {
  const ph = $('panel').offsetHeight || 190; const sc = SC();
  const tx = clamp(sel.x, vw / 2 / sc, W - vw / 2 / sc), ty = clamp(sel.y - 40 + (ph / 2) / sc, (vh / 2) / sc, H - (vh / 2) / sc + 40);
  const k = 1 - Math.pow(.001, dt); if (!camFree) { cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; } clampCam();
  T += dt; clockT += dt; crs.forEach(c => updCr(c, dt)); updCrops(dt); updApples(dt); updMush(dt); updWorld(dt);
  parts.forEach(p => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vz -= p.g * dt; p.z += p.vz * dt; if (p.z < 0) { p.z = 0; p.vz *= -.3; } });
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].t > parts[i].life) parts.splice(i, 1);
  floats.forEach(f => f.t += dt); for (let i = floats.length - 1; i >= 0; i--) if (floats[i].t > 1.4) floats.splice(i, 1);
  rings.forEach(r => r.t += dt); for (let i = rings.length - 1; i >= 0; i--) if (rings[i].t > 1.3) rings.splice(i, 1);
  beacon.t += dt;
  if (formUntil && T > formUntil) { formUntil = 0; for (let i = crs.length - 1; i >= 0; i--) if (crs[i].temp) { burst(crs[i].x, crs[i].y - 40, 8, ['#ffd45c', '#7fe0ff'], { sp: 40, z: 16 }); crs.splice(i, 1); } if (sel && sel.temp) sel = crs[0] || sel; crs.forEach(c => { if (c.task && c.task.kind === 'formup') c.task = null; if (!c.temp) { c.manual = false; c.cool = 4; } }); }
  for (let i = flyers.length - 1; i >= 0; i--) { const f = flyers[i]; f.t += dt; if (f.t >= f.d) { disp[f.k] = Math.min(stats[f.k], disp[f.k] + f.n); hud(); bump(FLYTO[f.k] || 'h_inv'); flyers.splice(i, 1); } }
  if (Math.random() < dt * 3) parts.push({ x: FC.x + rnd(-70, 70), y: FC.y + 30 + rnd(0, 20), z: 20, vx: 0, vy: 0, vz: rnd(20, 40), g: -6, t: 0, life: 1.6, col: '#ffe08a', s: 3 });
}

// ---------- input ----------
const toWorld = (px, py) => ({ x: (px - (vw / 2 - cam.x * SC())) / SC(), y: (py - (vh / 2 - cam.y * SC())) / SC() });
const ptrs = new Map(); let drag = null, pinch0 = null;
const pdist = () => { const v = [...ptrs.values()]; return Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y) || 1; };
function tap(px, py) {
  const w = toWorld(px, py);
  const c = nearest(crs, w, c => Math.hypot(c.x - w.x, (c.y - 32) - w.y) < 44);
  if (c) { select(c); say_(`<b>${NAME[c.sign]}</b> is ready: tell it what to do (e.g. “${c.sign === 'lion' ? 'shake the tree' : 'dig, then plant'}”)`); return; }
  player.x = clamp(w.x, 100, W - 100); player.y = clamp(w.y, 200, H - 100); beacon.x = player.x; beacon.y = player.y; beacon.t = 0;
  sel.queue = [{ kind: 'goto' }]; sel.task = null; sel.manual = true; START.goto = (cc, k) => { k.tx = player.x; k.ty = player.y; k.dur = 0; return true; };
}
cv.addEventListener('pointerdown', e => { AC(); try { cv.setPointerCapture(e.pointerId); } catch (_) { } ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, moved: false, cx: cam.x, cy: cam.y }; else if (ptrs.size === 2) { drag = null; pinch0 = { d: pdist(), z: userZoom }; } });
cv.addEventListener('pointermove', e => { if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2 && pinch0) { userZoom = clamp(pinch0.z * pdist() / pinch0.d, .4, 2.8); camFree = true; clampCam(); }
  else if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!drag.moved && Math.hypot(dx, dy) > 9) { drag.moved = true; camFree = true; } if (drag.moved) { cam.x = drag.cx - dx / SC(); cam.y = drag.cy - dy / SC(); clampCam(); } } });
const pend = e => { const wasDrag = drag; ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null; if (ptrs.size === 0) { if (wasDrag && !wasDrag.moved && e.type === 'pointerup') tap(e.clientX, e.clientY); drag = null; } };
cv.addEventListener('pointerup', pend); cv.addEventListener('pointercancel', pend);
cv.addEventListener('wheel', e => { e.preventDefault(); userZoom = clamp(userZoom * Math.exp(-e.deltaY * .0015), .4, 2.8); camFree = true; clampCam(); }, { passive: false });
$('b_center').addEventListener('click', () => { camFree = false; userZoom = 1; });
$('b_all').addEventListener('click', () => { camFree = true; userZoom = Math.min(vw / (W * zoom), vh / (H * zoom)) * .98; cam.x = W / 2; cam.y = H / 2; clampCam(); });
$('b_in').addEventListener('click', () => { userZoom = clamp(userZoom * 1.3, .4, 2.8); clampCam(); });
$('b_out').addEventListener('click', () => { userZoom = clamp(userZoom / 1.3, .4, 2.8); camFree = true; clampCam(); });
document.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { AC(); say(b.dataset.c); }));
$('go').addEventListener('click', () => { AC(); say($('txt').value); $('txt').value = ''; });
$('txt').addEventListener('keydown', e => { if (e.key === 'Enter') { AC(); say($('txt').value); $('txt').value = ''; } });
// [intégration Astro Code] Voix : Muse Voice Transcribe via le proxy Meta de
// l'app (même recette que le jardin 3D et l'essayage : WAV 16 kHz -> /v1/asr/transcribe).
// Le texte transcrit est affiché dans la barre puis envoyé à say(texte).
// Repli : reconnaissance du navigateur si le proxy est injoignable.
const mic = $('mic');
function farmWavEncode(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2); const v = new DataView(buf);
  const str = (o, s2) => { for (let i = 0; i < s2.length; i++) v.setUint8(o + i, s2.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const x = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7FFF, true); }
  return new Blob([buf], { type: 'audio/wav' });
}
function farmBlobToDataUrl(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); }); }
async function farmTranscribe(blob) {
  const ACtor = window.AudioContext || window.webkitAudioContext;
  const acx = new ACtor();
  const buf = await acx.decodeAudioData(await blob.arrayBuffer());
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * 16000)), 16000);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  const rendered = await off.startRendering();
  const wav = farmWavEncode(rendered.getChannelData(0), 16000);
  const dataUrl = await farmBlobToDataUrl(wav);
  const res = await fetch('/.netlify/functions/meta-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: '/v1/asr/transcribe', body: { audio_b64: dataUrl.split(',')[1], filename: 'voice.wav' } }) });
  if (!res.ok) throw new Error('proxy ' + res.status);
  const data = await res.json();
  let text = data.transcript || data.text || data.output_text || '';
  if (!text && data.results && data.results[0]) { const alt = data.results[0].alternatives && data.results[0].alternatives[0]; text = (alt && alt.transcript) || data.results[0].transcript || ''; }
  try { acx.close(); } catch (e) { }
  return String(text || '').trim();
}
function farmSRFallback() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { say_('No microphone available here → write the command.'); farmMusic(true); return; }
  try { const r = new SR(); r.lang = 'en-US'; r.interimResults = true; r.maxAlternatives = 1; mic.classList.add('on'); $('txt').value = ''; $('txt').placeholder = '🎙 I\'m listening…'; say_('🎙 I\'m listening… speak!');
    let final = '';
    r.onresult = e => { let txt = ''; for (let i = 0; i < e.results.length; i++) { txt += e.results[i][0].transcript; if (e.results[i].isFinal) final = txt; } $('txt').value = txt; if (e.results[e.results.length - 1].isFinal) { say(txt); setTimeout(() => { if ($('txt').value === txt) $('txt').value = ''; }, 3500); } };
    r.onerror = e => { farmMusic(true); say_('Mic: ' + (e.error || 'error') + ' → try again or write the command.'); };
    r.onend = () => { farmMusic(true); mic.classList.remove('on'); $('txt').placeholder = 'or write: leo, dig then plant…'; if (!final && !$('txt').value) say_('I heard nothing 🙉 — try again.'); }; r.start(); }
  catch (e) { farmMusic(true); say_('Microphone unavailable → text.'); }
}
let fRec = null, fChunks = [], fStream = null, fRecOn = false;
async function stopFarmMic(send) {
  if (!fRecOn) return; fRecOn = false; mic.classList.remove('on');
  const rec = fRec; fRec = null;
  await new Promise(res => { rec.onstop = res; try { rec.stop(); } catch (e) { res(); } });
  if (fStream) { fStream.getTracks().forEach(tr => tr.stop()); fStream = null; }
  if (!send) return;
  try {
    say_('🎧 Meta AI is listening…');
    const text = await farmTranscribe(new Blob(fChunks, { type: 'audio/webm' }));
    if (!text) { say_('I heard nothing 🙉 — try again.'); farmMusic(true); return; }
    $('txt').value = text;
    say(text);
    setTimeout(() => { if ($('txt').value === text) $('txt').value = ''; }, 3500);
    farmMusic(true);
  } catch (e) { say_('The Meta voice link failed — switching to the browser microphone.'); farmSRFallback(); }
}
mic.addEventListener('click', async () => {
  AC(); farmMusic(false);
  if (fRecOn) { stopFarmMic(true); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) { farmSRFallback(); return; }
  try { fStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { farmSRFallback(); return; }
  fChunks = [];
  try { fRec = new MediaRecorder(fStream); } catch (e) { farmSRFallback(); return; }
  fRec.ondataavailable = e => { if (e.data && e.data.size) fChunks.push(e.data); };
  fRec.start(); fRecOn = true; mic.classList.add('on');
  $('txt').value = ''; $('txt').placeholder = '🎙 I\'m listening…';
  say_('🎙 I\'m listening… speak, then tap the mic again to send.');
  setTimeout(() => { if (fRecOn) stopFarmMic(true); }, 6000);
});

// ---------- v2 : inventaire, panneau, test jour/nuit ----------
let panelHidden = false, invOpen = false, boostUntil = 0;
$('ptog').addEventListener('click', () => { panelHidden = !panelHidden; $('panel').classList.toggle('hid', panelHidden); $('ptog').textContent = panelHidden ? '▲' : '▼'; });
const INVROWS = [['wood', 'Wood', ICONS.wood], ['stone', 'Stone', ICONS.stone], ['app', 'Fruit', A.img.apples], ['brick', 'Bricks', ICONS.brick], ['wheat', 'Wheat', A.img.crop4], ['gold', 'Gold', A.img.nugget], ['gem', 'Gems', ICONS.gem]];
function buildInv() {
  const built = slots.filter(q => q.built).length, tb = torches.filter(t => t.built).length, tl = torches.filter(t => t.lit).length, wb = WALL.filter(b => b.built).length, ft = fruitTrees().length, hungry = crs.filter(c => c.hunger < .35).length;
  const boost = boostUntil > Date.now() ? `<div class="note ok">✨ Boost ×5 active (${Math.ceil((boostUntil - Date.now()) / 86400e3)} d)</div>` : '';
  $('invbody').innerHTML = `<div class="grid">${INVROWS.map(([k, n, ic]) => `<div class="it"><img src="${ic}"><b>${stats[k]}</b><span>${n}</span></div>`).join('')}</div>
  <h4>Crafting</h4>
  <div class="rec"><span>🧱 <b>Brick</b> — 2 stone</span><button data-act="brick">Craft</button></div>
  <div class="rec"><span>🪵 <b>Fence</b> — 1 wood / segment <small>(${built}/${slots.length})</small></span><button data-act="fence">Build</button></div>
  <div class="rec"><span>🔥 <b>Torch</b> — 2 wood + 1 wood per night <small>(${tb}/${torches.length}, ${tl} lit)</small></span><button data-act="torch">Place</button></div>
  <div class="rec"><span>🧱 <b>Wall</b> — 1 brick per brick laid <small>(${wb}/${WALL.length})</small></span><button data-act="wall">Build</button></div>
  <h4>The garden</h4><div class="note">🌳 ${ft} fruit tree(s) · 🍽 ${hungry} creature(s) are hungry</div>${boost}
  <button class="boost" data-act="boost">✨ Simulate a real encounter (boost ×5)</button><div class="note small">In the real app, this boost comes from an actual scan.</div>`;
}
const openInv = on => { invOpen = on; $('inv').classList.toggle('on', on); if (on) buildInv(); };
$('h_inv').addEventListener('click', () => openInv(!invOpen)); $('inv_x').addEventListener('click', () => openInv(false)); $('inv').addEventListener('pointerdown', e => { if (e.target === $('inv')) openInv(false); });
$('invbody').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a === 'brick') { if (stats.stone >= 2) { stats.stone -= 2; stats.brick++; hud(); blip(360); } else say_('You need 2 stone 🪨'); }
  else if (a === 'boost') { applyBoost(); say_('✨ <b>Boost ×5</b>: wood, fruit and life at maximum (simulated real encounter).'); saveGame(); }
  else { openInv(false); say(a === 'fence' ? 'build the fence' : a === 'torch' ? 'place a torch' : 'build the wall'); } });
$('b_skip').addEventListener('click', () => { clockT = (Math.floor(clockT / CYC) + 1) * CYC + .2; });

// ---------- [intégration Astro Code] sauvegarde + boost de vraie rencontre ----------
// État persisté dans localStorage (stats, barrières, torches, mur, arbres,
// parcelles, horloge) : la ferme survit à la fermeture de la page.
const SAVE_KEY = 'astrofarm_save_v1';
function applyBoost() { stats.wood = Math.max(stats.wood * 5, 25); stats.app = Math.max(stats.app * 5, 15); crs.forEach(c => c.hunger = 1); boostUntil = Date.now() + 7 * 86400e3; disp.wood = stats.wood; disp.app = stats.app; hud(); }
let SEEN_COLL = null;
function saveGame() {
  try {
    const data = {
      v: 1, stats: { ...stats }, boostUntil, clockT,
      slotsBuilt: slots.map((q, i) => q.built ? i : -1).filter(i => i >= 0),
      torchesBuilt: torches.map((t, i) => t.built ? i : -1).filter(i => i >= 0),
      wallBuilt: WALL.map((b, i) => b.built ? i : -1).filter(i => i >= 0),
      cells: CELLS.map(q => ({ x: q.x, y: q.y, st: q.st, stage: q.stage || 0, g: q.g || 0, dyn: !!q.dyn })),
      cutKeys: props.filter(q => q.cut).map(posKey),
      goneKeys: GONE_KEYS.slice(),
      planted: props.filter(q => q.planted).map(q => ({ x: q.x, y: q.y, stage: q.stage || 0, ready: !!q.ready })),
      hunger: Object.fromEntries(crs.map(c => [c.sign, +c.hunger.toFixed(3)])),
      seenColl: SEEN_COLL || COLLECTED.slice(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { }
}
function loadGame() {
  let d = null; try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { }
  if (!d) return;
  if (d.stats) Object.assign(stats, d.stats);
  if (typeof d.boostUntil === 'number') boostUntil = d.boostUntil;
  if (typeof d.clockT === 'number') { clockT = d.clockT; lastNight = isNight(); }
  (d.slotsBuilt || []).forEach(i => { if (slots[i]) { slots[i].built = true; slots[i].born = -9; } });
  (d.torchesBuilt || []).forEach(i => { if (torches[i]) { torches[i].built = true; torches[i].born = -9; } });
  (d.wallBuilt || []).forEach(i => { if (WALL[i]) { WALL[i].built = true; WALL[i].born = -9; } });
  if (Array.isArray(d.cells) && d.cells.length) { CELLS.length = 0; d.cells.forEach(q => CELLS.push({ x: q.x, y: q.y, st: q.st, stage: q.stage || 0, g: q.g || 0, claim: null, dyn: !!q.dyn })); }
  (d.cutKeys || []).forEach(key => { const q = props.find(q => posKey(q) === key && TREEK.includes(q.k)); if (q) { q.cut = true; q.k = 'stump'; q.sc = 1; q.shake = 0; delete q.fruitTree; if (q.planted) delete q.planted; } });
  GONE_KEYS = (d.goneKeys || []).slice();
  GONE_KEYS.forEach(key => { const i = props.findIndex(q => posKey(q) === key && (q.k === 'rock' || q.k === 'rock2')); if (i >= 0) props.splice(i, 1); });
  (d.planted || []).forEach(q => { const stage = q.stage || 0; addP('tree', q.x, q.y, { planted: true, stage, g: 0, fruitTree: true, ready: !!q.ready, regrow: 0, sc: [.28, .62, 1, 1][stage], born: -9 }); });
  if (d.hunger) crs.forEach(c => { if (typeof d.hunger[c.sign] === 'number') c.hunger = d.hunger[c.sign]; });
  if (Array.isArray(d.seenColl)) SEEN_COLL = d.seenColl.slice();
  hud();
}
loadGame();
// Boost de VRAIE rencontre : un signe nouvellement collecté dans l'app depuis
// la dernière visite déclenche le boost ×5 — une fois par nouvelle rencontre.
(function checkRealBoost() {
  const cur = readCollection();
  if (SEEN_COLL) {
    const nw = cur.filter(id => !SEEN_COLL.includes(id));
    if (nw.length) {
      SEEN_COLL = cur.slice(); applyBoost();
      say_(`✨ <b>Real encounter detected: ${nw.map(id => NAME[id]).join(', ')}!</b><br>Boost ×5 — wood, fruit and life at maximum, for a week.`);
      saveGame(); return;
    }
  }
  SEEN_COLL = cur.slice();
})();
setInterval(saveGame, 5000);
addEventListener('beforeunload', saveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

// ---------- boot ----------
let last = performance.now();
function loop(now) { const dt = Math.min(.05, (now - last) / 1000); last = now; update(dt); frame(); if (!MANUAL) requestAnimationFrame(loop); }
Promise.all(loads).then(() => {
  for (const [k, src] of Object.entries(ICONS)) { const im = new Image(); im.src = src; IM[k] = im; META[k] = [18, 18]; } META.gem = [18, 18]; buildTerrain(); hud(); select(sel); START.goto = (cc, k) => { k.tx = player.x; k.ty = player.y; k.dur = 0; return true; };
  update(.016); frame(); if (!MANUAL) requestAnimationFrame(loop);
  setTimeout(() => $('boot').style.opacity = 0, 300);
});
window.FARM = { get W() { return { slots: slots.filter(q => q.built).length + '/' + slots.length, torch: torches.filter(t => t.built).length + ' lit ' + torches.filter(t => t.lit).length, wall: WALL.filter(b => b.built).length, spirits: spirits.length, night: isNight(), nf }; }, get cam() { return { x: cam.x, y: cam.y, z: userZoom, free: camFree }; }, say, select: id => select(byId(id)), transcribe: farmTranscribe, music: { el: MUS, wanted: () => musicWanted }, saveGame: () => saveGame(), active: () => ACTIVE.slice(), collected: () => COLLECTED.slice(), advance(sec) { const n = Math.round(sec * 30); for (let i = 0; i < n; i++) update(1 / 30); frame(); }, stats, CELLS, crs, spirits, teamForm, stelae };
