/* lion3d.js — LE LION THREE.JS D'HAMZA (extrait de lion-source.js, 3 nov)
   Son lion procédural complet : poses ANIM (idle, walk, jump, dance, lie,
   sit, roar), machine à états, file de commandes say(), rugissement
   synthétisé. Adaptations pour Astro Garden : le lion est raciné dans un
   groupe donné par le jardin (plus de scène/caméra/boucle propres), le
   verrouillage au sol se calcule dans l'espace du parent, les anneaux et
   halos vivent dans le même groupe, et une API (play/goTo/say/update)
   laisse le jardin le piloter. Le reste du code est le sien, inchangé. */
import * as THREE from 'three';
const PI = Math.PI, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sm = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const $ = id => document.getElementById(id);

export function createLion3D(parent, camera, opts = {}) {
const ROOT = new THREE.Group(); parent.add(ROOT);
const FX = new THREE.Group(); parent.add(FX);
const scene = FX; // les halos/anneaux s'ajoutent ici (espace du jardin)
// ombres portées (de son monde d'origine) + son point « arbre » repère
const shTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(8,6,30,.55)'); g.addColorStop(1, 'rgba(8,6,30,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const blob = (r) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false })); m.rotation.x = -PI / 2; m.position.y = .012; ROOT.add(m); return m; };
const TREE = new THREE.Vector3(-1.9, 0, -1.3);

const matCache = {};
const mat = (c, o = {}) => { const k = c + JSON.stringify(o); return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: .85, metalness: 0, ...o })); };
const ico1 = new THREE.IcosahedronGeometry(1, 1), ico2 = new THREE.IcosahedronGeometry(1, 2);
const ell = (rx, ry, rz, c, g = ico1) => { const m = new THREE.Mesh(g, mat(c)); m.scale.set(rx, ry, rz); return m; };
const spike = (len, rad, c, seg = 5) => { const g = new THREE.ConeGeometry(rad, len, seg); g.translate(0, len / 2, 0); return new THREE.Mesh(g, mat(c)); };
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent && parent.add(g); return g; };
function glowTex(r = 255, g = 220, b = 140) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${r},${g},${b},1)`); gr.addColorStop(.35, `rgba(${r},${g},${b},.35)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
const glowT = glowTex();
const glow = (x, y, z, s, col = 0xffd27a, op = .8) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: col, blending: THREE.AdditiveBlending, transparent: true, opacity: op, depthWrite: false })); sp.position.set(x, y, z); sp.scale.setScalar(s); scene.add(sp); return sp; };


// ---------- palette ----------
const C = { gold: 0xe9a63b, goldD: 0xcf8a2c, belly: 0xf7d58a, mane: 0xb4521c, maneL: 0xdb7a22, maneD: 0x8a3513, muzzle: 0xf9deaa, nose: 0x5e2a33, pad: 0x5a3026, toe: 0xf3c570, claw: 0xfff3dc, tuft: 0x8a3513, earIn: 0xea8e7e, eye: 0x1b1015, white: 0xffffff, mouth: 0x6a1a2c, tongue: 0xea6a82 };


// ---------- THE LION ----------
const lion = grp(ROOT);
const lionShadow = blob(1.25);
const pelvis = grp(lion); pelvis.rotation.order = 'YXZ';
const torso = grp(pelvis, 0, .1, .55);
const body = grp(torso); // meshes only (squash)
body.add(ell(.5, .46, .95, C.gold));
body.add(at(ell(.52, .5, .5, C.gold), 0, .02, -.5));
body.add(at(ell(.55, .55, .5, C.gold), 0, .05, .5));
body.add(at(ell(.4, .28, .85, C.belly), 0, -.22, .05));
body.add(at(ell(.2, .2, .2, C.goldD), .4, .14, -.5), at(ell(.2, .2, .2, C.goldD), -.4, .14, -.5)); // haunches
const probes = [];
const probe = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); probes.push(o); return o; };
probe(torso, 0, -.5, .1); probe(torso, 0, -.5, .6); probe(pelvis, 0, -.55, -.1);

function makeLeg(parent, x, y, z, front) {
  const sh = grp(parent, x, y, z);
  const w = front ? 1.1 : 1;
  sh.add(at(ell(.19 * w, .36, .21 * w, C.gold), 0, -.26, 0));
  const knee = grp(sh, 0, -.55, 0);
  knee.add(at(ell(.12 * w, .27, .13 * w, C.goldD), 0, -.24, 0));
  const ankle = grp(knee, 0, -.5, 0);
  // paw = rounded foot + 3 toes + claws + pad  -> recognisable "hand"
  ankle.add(at(ell(.17 * w, .1, .25 * w, C.gold), 0, -.05, .1));
  [-1, 0, 1].forEach(i => {
    ankle.add(at(ell(.058, .055, .075, C.toe), i * .095 * w, -.07, .3 - Math.abs(i) * .035));
    const cl = spike(.085, .022, C.claw, 4); cl.rotation.x = PI / 2 + .35; cl.position.set(i * .095 * w, -.085, .35 - Math.abs(i) * .035); ankle.add(cl);
  });
  ankle.add(at(ell(.1, .03, .12, C.pad), 0, -.145, .1));
  [-1, 0, 1].forEach(i => ankle.add(at(ell(.032, .025, .04, C.pad), i * .08, -.14, .24 - Math.abs(i) * .02)));
  probe(ankle, 0, -.15, .1);
  return { sh, knee, ankle, side: Math.sign(x) };
}
const legs = {
  fl: makeLeg(torso, .36, -.12, .5, true), fr: makeLeg(torso, -.36, -.12, .5, true),
  bl: makeLeg(pelvis, .38, -.12, 0, false), br: makeLeg(pelvis, -.38, -.12, 0, false),
};
// neck + head
const neck = grp(torso, 0, .3, .85);
neck.add(ell(.38, .38, .4, C.gold));
const head = grp(neck, 0, .1, .32);
const maneG = grp(head);
maneG.add(at(ell(.74, .72, .5, C.maneD), 0, -.02, -.22));
function maneLayer(r, n, rx, ry, cols, zoff, rot0 = 0, sq = .75) {
  for (let i = 0; i < n; i++) {
    const a = rot0 + i / n * PI * 2; const m = ell(rx, ry, rx * sq, cols[i % cols.length], ico1);
    m.rotation.z = a - PI / 2; m.position.set(Math.cos(a) * r, Math.sin(a) * r * .96, zoff); maneG.add(m);
  }
}
maneLayer(.74, 12, .27, .36, [C.maneD, C.mane], -.22, .1);
maneLayer(.6, 10, .27, .34, [C.mane, C.maneL], -.08, .35);
maneLayer(.5, 9, .2, .26, [C.maneL, C.mane], .02, .0, .6);
// chest mane
[[0, -.62, -.08, .3], [.3, -.55, -.12, .26], [-.3, -.55, -.12, .26]].forEach(([x, y, z, s]) => maneG.add(at(ell(s, s * 1.1, s * .8, C.mane), x, y, z)));
// face
head.add(ell(.46, .43, .44, C.gold));
head.add(at(ell(.25, .17, .23, C.muzzle), 0, -.1, .36));
head.add(at(ell(.095, .065, .075, C.nose), 0, -.01, .56));
head.add(at(ell(.05, .13, .04, C.goldD), 0, .14, .4)); // nose bridge
[1, -1].forEach(s => {
  head.add(at(ell(.065, .07, .06, C.eye), s * .17, .1, .38));
  head.add(at(ell(.02, .02, .02, C.white), s * .155, .13, .43));
  const br = ell(.1, .03, .05, C.maneD); br.position.set(s * .17, .2, .38); br.rotation.z = -s * .35; head.add(br);
  head.add(at(ell(.13, .14, .07, C.gold), s * .32, .37, -.02)); head.add(at(ell(.07, .09, .04, C.earIn), s * .32, .37, .03));
  [-1, 0, 1].forEach(k => head.add(at(ell(.012, .012, .012, C.pad), s * (.1 + .04 * Math.abs(k)), -.09 + k * .03, .5)));
  const fang = spike(.09, .022, C.claw, 4); fang.rotation.x = PI; fang.position.set(s * .09, -.17, .5); head.add(fang);
});
const eyes = [head.children.filter(c => c.scale.x === .065 && c.scale.y === .07)].flat();
const jaw = grp(head, 0, -.2, .25);
jaw.add(at(ell(.2, .065, .2, C.muzzle), 0, -.02, .12));
jaw.add(at(ell(.16, .035, .17, C.mouth), 0, .035, .12));
jaw.add(at(ell(.1, .03, .12, C.tongue), 0, .045, .14));
[1, -1].forEach(s => { const f = spike(.08, .02, C.claw, 4); f.position.set(s * .08, .02, .28); jaw.add(f); });
// tail
const tail1 = grp(pelvis, 0, .3, -.45); tail1.add(at(ell(.075, .075, .26, C.gold), 0, 0, -.22));
const tail2 = grp(tail1, 0, 0, -.45); tail2.add(at(ell(.07, .07, .26, C.gold), 0, 0, -.22));
const tail3 = grp(tail2, 0, 0, -.45); tail3.add(at(ell(.065, .065, .22, C.goldD), 0, 0, -.18));
{ const tuft = grp(tail3, 0, 0, -.42); tuft.add(at(ell(.16, .16, .24, C.tuft), 0, 0, -.1)); for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; const s = spike(.24, .07, C.maneD, 4); s.rotation.set(-PI / 2 - Math.sin(a) * .5, 0, Math.cos(a) * .5); s.position.set(Math.cos(a) * .07, Math.sin(a) * .07, -.18); tuft.add(s); } }


// ---------- poses ----------
const LEGN = ['fl', 'fr', 'bl', 'br'];
const KEYS = ['hop', 'pitch', 'arch', 'yaw', 'roll', 'squash', 'neckX', 'neckY', 'headX', 'headY', 'headZ', 'jaw', 'mane', 'shake', 'eye', 't1x', 't1y', 't2x', 't2y', 't3x', 't3y'];
LEGN.forEach(l => ['u', 'l', 'p', 'z', 'f'].forEach(s => KEYS.push(l + '_' + s)));
function P0() { const p = {}; KEYS.forEach(k => p[k] = 0); p.mane = 1; p.eye = 1; p.neckX = .06; p.t1x = .35; p.t2x = .12; p.t3x = .1; LEGN.forEach(l => p[l + '_f'] = 1); p.fl_l = p.fr_l = .06; p.bl_u = p.br_u = -.04; p.bl_l = p.br_l = .1; return p; }
function mixP(a, b, t) { const o = {}; for (const k of KEYS) o[k] = lerp(a[k], b[k], t); return o; }
const setLeg = (p, l, u, lo, flat = 1, z = 0, pp = 0) => { p[l + '_u'] = u; p[l + '_l'] = lo; p[l + '_f'] = flat; p[l + '_z'] = z; p[l + '_p'] = pp; };
let gait = 0, NOW = 0;

const ANIM = {
  idle(t) {
    const p = P0(); const b = Math.sin(t * 1.9);
    p.squash = .014 * b; p.neckX = .06 + .02 * b; p.headY = .32 * Math.sin(t * .45) ; p.headX = .04 * Math.sin(t * .6 + 1);
    p.t1y = .3 * Math.sin(t * 1.3); p.t2y = .4 * Math.sin(t * 1.3 - .6); p.t3y = .5 * Math.sin(t * 1.3 - 1.2);
    p.shake = .004; return p;
  },
  walk(t) {
    const p = P0(), g = gait;
    const offs = { fl: 0, br: 0, fr: PI, bl: PI };
    for (const l of LEGN) {
      const s = Math.sin(g + offs[l]), c = Math.cos(g + offs[l]); const fr = l[0] === 'f';
      setLeg(p, l, (fr ? .55 : .5) * s - (fr ? 0 : .05), .12 + (fr ? .85 : 1) * Math.max(0, -c) * 1.0, 1 - .65 * Math.max(0, -c), 0, 0);
    }
    p.yaw = .07 * Math.sin(g); p.roll = .03 * Math.cos(g); p.headX = .05 * Math.sin(2 * g); p.neckX = .1; p.headY = .06 * Math.sin(g);
    p.t1x = .55; p.t1y = .4 * Math.sin(g); p.t2y = .5 * Math.sin(g - .7); p.t3y = .5 * Math.sin(g - 1.4); p.shake = .02; p.squash = .01 * Math.cos(2 * g);
    return p;
  },
  jump(t) {
    const crouch = k => { const p = P0(); setLeg(p, 'fl', -.55 * k, 1.05 * k); setLeg(p, 'fr', -.55 * k, 1.05 * k); setLeg(p, 'bl', -.75 * k, 1.35 * k); setLeg(p, 'br', -.75 * k, 1.35 * k); p.pitch = .12 * k; p.squash = -.05 * k; p.headX = -.1 * k; p.neckX = .06 + .2 * k; p.t1x = .35 - .5 * k; p.eye = 1 - .4 * k; return p; };
    const air = q => { const p = P0(); const s = sm(q * 1.2);
      setLeg(p, 'fl', lerp(-1.25, -.5, s), lerp(.35, .95, s), 0.2, .35, -.3); setLeg(p, 'fr', lerp(-1.25, -.5, s), lerp(.35, .95, s), .2, -.35, -.3);
      setLeg(p, 'bl', lerp(.7, -.5, s), lerp(.5, 1.1, s), .3, .1); setLeg(p, 'br', lerp(.7, -.5, s), lerp(.5, 1.1, s), .3, -.1);
      p.pitch = lerp(-.38, .22, q); p.neckX = .0; p.headX = lerp(-.1, .12, q); p.jaw = .3; p.t1x = .95; p.t2x = .3; p.shake = .08; p.mane = 1.06; p.hop = 1.6 * 4 * q * (1 - q); p.eye = .8; p.squash = .03; return p; };
    if (t < .3) return crouch(sm(t / .3));
    if (t < .88) { const q = (t - .3) / .58; return mixP(crouch(1), air(q), sm(q / .14)); }
    const m = (t - .88) / .42; const land = crouch(.9 * Math.sin(PI * clamp(m, 0, 1))); const a1 = air(1); a1.hop = 0;
    return mixP(a1, land, sm(m / .25));
  },
  dance(t) {
    const p = P0(); const r = sm(t / .8), w = 2 * PI * 1.9; const be = t * w;
    const pitch = -1.0 * r + .05 * Math.sin(be) * r, arch = .1 * Math.sin(be) * r;
    p.pitch = pitch; p.arch = arch; p.yaw = .38 * Math.sin(be / 2) * r; p.roll = .07 * Math.sin(be / 2 + 1.2) * r;
    p.hop = .07 * r * (.5 + .5 * Math.sin(be * 2 - 1.2));
    const par = pitch + arch;
    // hind legs: stand and step
    for (const [l, ph] of [['bl', 0], ['br', PI]]) { const s = Math.sin(be + ph); setLeg(p, l, .15 * s * r + 0 - pitch * 0 + (-pitch), .2 + .5 * Math.max(0, s) * r, 1); p[l + '_u'] = (.12 * s * r) - pitch; }
    // arms: world angle target -> relative
    const wL = lerp(0, -2.5 + .45 * Math.sin(be), r), wR = lerp(0, -1.6 + .5 * Math.sin(be + PI), r);
    setLeg(p, 'fl', wL - par, .35 + .35 * Math.sin(be + .8) * r, 0, .45 * r, .25 * r * Math.sin(be * 2));
    setLeg(p, 'fr', wR - par, .5 + .3 * Math.sin(be + PI + .8) * r, 0, .5 * r, .25 * r * Math.sin(be * 2 + 1));
    p.neckX = .06 + .42 * r; p.headX = .5 * r + .07 * Math.sin(be * 2); p.headY = .35 * Math.sin(be / 2 + .5) * r; p.headZ = .16 * Math.sin(be / 2 + PI / 2) * r;
    p.jaw = .16 * r; p.shake = .05 * r; p.mane = 1 + .03 * Math.sin(be * 2) * r; p.eye = 1 - .25 * r;
    p.t1x = .3; p.t1y = .7 * Math.sin(be) * r; p.t2y = .8 * Math.sin(be - .6) * r; p.t3y = .8 * Math.sin(be - 1.2) * r;
    return p;
  },
  lie(t) {
    const r = sm(t / 1.1), p = P0(); const sleepy = sm((t - 4) / 3);
    setLeg(p, 'fl', lerp(0, -1.27, r), lerp(.06, -.05, r), 1, .12 * r); setLeg(p, 'fr', lerp(0, -1.27, r), lerp(.06, -.05, r), 1, -.12 * r);
    setLeg(p, 'bl', lerp(-.04, -1.1, r), lerp(.1, 2.15, r), 1, .55 * r); setLeg(p, 'br', lerp(-.04, -1.1, r), lerp(.1, 2.15, r), 1, -.55 * r);
    p.pitch = 0; p.neckX = lerp(.06, -.12, r) + .25 * sleepy; p.headX = .05 + .2 * sleepy; p.headY = .35 * Math.sin(t * .4) * (1 - sleepy);
    p.squash = .02 * Math.sin(t * 1.4); p.t1x = lerp(.35, .05, r); p.t1y = lerp(0, .55, r) + .12 * Math.sin(t * 1.1); p.t2y = .6 * r; p.t3y = .5 * r; p.eye = 1 - .55 * sleepy;
    return p;
  },
  sit(t) {
    const r = sm(t / .9), p = P0(); const pit = -.8 * r;
    p.pitch = pit; p.arch = 0;
    setLeg(p, 'fl', -pit, .05, 1, .06 * r); setLeg(p, 'fr', -pit, .05, 1, -.06 * r);
    setLeg(p, 'bl', lerp(-.04, -1.3, r) - pit, lerp(.1, 1.5, r), 1, .4 * r); setLeg(p, 'br', lerp(-.04, -1.55, r) - pit, lerp(.1, 2.3, r), 1, -.45 * r);
    p.neckX = .06 + .45 * r; p.headX = .12 * r; p.headY = .28 * Math.sin(t * .5); p.squash = .014 * Math.sin(t * 1.9);
    p.t1x = lerp(.35, -.1, r); p.t1y = .5 * r + .15 * Math.sin(t * 1.3); p.t2y = .4 * r; return p;
  },
  roar(t) {
    const p = P0();
    const wind = sm(t / .45) * (1 - sm((t - .5) / .2)), R = sm((t - .42) / .2) * (1 - sm((t - 1.95) / .4));
    const k = .45 * wind + .15 * R;
    setLeg(p, 'fl', -.45 * k * 2, k * 2); setLeg(p, 'fr', -.45 * k * 2, k * 2); setLeg(p, 'bl', -.6 * k * 2, 1.2 * k * 2); setLeg(p, 'br', -.6 * k * 2, 1.2 * k * 2);
    p.pitch = .1 * wind - .3 * R; p.neckX = .06 + .3 * wind - .3 * R; p.headX = .2 * wind - .38 * R; p.jaw = R * (.95 + .06 * Math.sin(t * 38));
    p.mane = 1 - .05 * wind + .2 * R; p.shake = .1 * R; p.squash = -.03 * wind + .05 * R + .012 * R * Math.sin(t * 32); p.eye = 1 - .5 * R; p.t1x = .35 + .6 * R; p.t1y = .4 * R * Math.sin(t * 9);
    p.headY = 0; p.roll = .0; p.hop = .0;
    return p;
  },
};
const DUR = { jump: 1.3, dance: 6.5, roar: 2.5 };


// ---------- state machine ----------
const S = { name: 'idle', t: 0, prev: 'idle', prevT: 0, blend: 1, opts: {} };
const lionPos = lion.position; lionPos.set(1.1, 0, 1.3); lion.rotation.y = -.5;
let followMode = false, queue = [], current = null, target = null;
const player = new THREE.Vector3(.8, 0, 2.6);
const beacon = glow(0, .4, 0, 1.1, 0x7bf0e6, .0);
const beaconRing = new THREE.Mesh(new THREE.RingGeometry(.28, .36, 28), new THREE.MeshBasicMaterial({ color: 0x7bf0e6, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); beaconRing.rotation.x = -PI / 2; FX.add(beaconRing);
let beaconT = 99;
function setBeacon(x, z, color = 0x7bf0e6) { beacon.position.set(x, .5, z); beacon.material.color.setHex(color); beaconRing.position.set(x, .03, z); beaconRing.material.color.setHex(color); beaconT = 0; }
function setState(name, opts = {}) {
  if (S.name === name && !opts.force) { S.opts = opts; return; }
  S.prev = S.name; S.prevT = S.t; S.name = name; S.t = 0; S.blend = 0; S.opts = opts; S.fired = {};
}
let R = (opts && opts.radius) || 3.0;
const clampIsland = v => { const l = Math.hypot(v.x, v.z); if (l > R) { v.x *= R / l; v.z *= R / l; } return v; };
function turnTo(dx, dz, rate, dt) { const want = Math.atan2(dx, dz); let d = want - lion.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); lion.rotation.y += clamp(d, -rate * dt, rate * dt); return Math.abs(d); }


// ---------- sound ----------
let ac; function roarSound() {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); const t = ac.currentTime;
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(72, t); o.frequency.linearRampToValueAtTime(118, t + .35); o.frequency.exponentialRampToValueAtTime(46, t + 1.6);
    const lfo = ac.createOscillator(); lfo.frequency.value = 27; const lg = ac.createGain(); lg.gain.value = 16; lfo.connect(lg); lg.connect(o.frequency);
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(450, t); f.frequency.linearRampToValueAtTime(1500, t + .3); f.frequency.linearRampToValueAtTime(260, t + 1.6);
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.5, t + .12); g.gain.linearRampToValueAtTime(.34, t + 1.0); g.gain.exponentialRampToValueAtTime(.001, t + 1.7);
    const nb = ac.createBuffer(1, ac.sampleRate * 1.8, ac.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * .6;
    const ns = ac.createBufferSource(); ns.buffer = nb; const ng = ac.createGain(); ng.gain.value = .35; ns.connect(ng); ng.connect(f);
    o.connect(f); f.connect(g); g.connect(ac.destination); o.start(t); lfo.start(t); ns.start(t); o.stop(t + 1.8); lfo.stop(t + 1.8); ns.stop(t + 1.8);
  } catch (e) { }
}
// roar rings
const rings = []; for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })); m.visible = false; scene.add(m); rings.push({ m, t: 99 }); }
let ringIdx = 0; const hv = new THREE.Vector3();
function spawnRing() { const r = rings[ringIdx++ % rings.length]; r.t = 0; r.m.visible = true; head.getWorldPosition(hv); hv.y += .05; FX.worldToLocal(hv); r.m.position.copy(hv); }


// ---------- commands ----------
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, ' ');
const RULES = [
  [/\b(saut|jump|bondi|hop)/, { a: 'jump', label: 'saute' }],
  [/\b(dans|danc|groov|boug|swing)/, { a: 'dance', label: 'danse' }],
  [/\b(couch|allong|dor|lie |lay |sleep|repos|ronfl)/, { a: 'lie', label: 'couche-toi' }],
  [/\b(rug|roar|grogn|hurl|cri)/, { a: 'roar', label: 'rugis' }],
  [/\b(assis|assoi|assoir|sit)/, { a: 'sit', label: 'assis' }],
  [/\b(arbre|tree)/, { a: 'tree', label: "va devant l'arbre" }],
  [/\b(suis|suit|follow|viens|come|ici|avec moi)/, { a: 'follow', label: 'suis-moi' }],
  [/\b(debout|stand|leve|lève|up|reste|stop|arret|ok)/, { a: 'stand', label: 'debout' }],
];
function parse(text) {
  const n = norm(text) + ' '; const parts = n.split(/\s*(?:,|\.|;|\bet\b|\bpuis\b|\bensuite\b|\bapres\b|\bthen\b|\band\b)\s*/).filter(Boolean);
  const out = [];
  for (const p of parts) { for (const [re, cmd] of RULES) { if (re.test(p + ' ')) { out.push(cmd); break; } } }
  return out;
}
const heard = document.getElementById('garden-heard') || { set innerHTML(v) {}, get innerHTML() { return ''; } };
function say(text) {
  text = (text || '').trim(); if (!text) return;
  const cmds = parse(text);
  if (!cmds.length) { heard.innerHTML = `J'ai entendu : <b>« ${text} »</b><br>…mais je ne connais pas encore cet ordre 🙈`; return; }
  heard.innerHTML = `J'ai entendu : <b>« ${text} »</b><br>→ ${cmds.map(c => c.label).join(' ▸ ')}`;
  queue = cmds.slice(); current = null; followMode = false; next();
}
function next() {
  if (!queue.length) { current = null; return; }
  current = queue.shift(); const a = current.a;
  if (a === 'jump') setState('jump', { force: true });
  else if (a === 'dance') setState('dance', { force: true });
  else if (a === 'roar') setState('roar', { force: true });
  else if (a === 'lie') setState('lie');
  else if (a === 'sit') setState('sit');
  else if (a === 'stand') setState('idle');
  else if (a === 'tree') { target = new THREE.Vector3(TREE.x + .9, 0, TREE.z + 1.55); target.face = TREE; setState('walk'); }
  else if (a === 'follow') { followMode = true; target = clampIsland(player.clone()); target.keep = 1.5; setState('walk'); }
  current.t0 = performance.now();
}


// ---------- update ----------
const vz = new THREE.Vector3();
function update(dt) {
  NOW += dt; S.t += dt; S.prevT += dt; S.blend = Math.min(1, S.blend + dt / .38);
  const st = S.name; let walking = false;
  // behaviours
  if (st === 'walk') {
    if (followMode) { target = clampIsland(player.clone()); target.keep = 1.5; }
    const dx = target.x - lionPos.x, dz = target.z - lionPos.z, dist = Math.hypot(dx, dz); const stop = target.keep || .12;
    if (dist > stop) {
      const err = turnTo(dx, dz, 6, dt); const sp = 2.3 * clamp(1 - err / 1.6, 0, 1) * Math.min(1, .35 + dist);
      lionPos.x += Math.sin(lion.rotation.y) * sp * dt; lionPos.z += Math.cos(lion.rotation.y) * sp * dt; gait += dt * (3 + sp * 2.7); walking = true;
    } else if (target.face) { const fx = target.face.x - lionPos.x, fz = target.face.z - lionPos.z; if (turnTo(fx, fz, 5, dt) < .06) arrive(); }
    else arrive();
    clampIsland(lionPos);
  } else if (st === 'jump') {
    const t = S.t; if (t > .3 && t < .88) { const sp = 1.7; lionPos.x += Math.sin(lion.rotation.y) * sp * dt; lionPos.z += Math.cos(lion.rotation.y) * sp * dt; clampIsland(lionPos); }
    if (t > DUR.jump) done();
  } else if (st === 'dance') { if (S.t > DUR.dance) done(); }
  else if (st === 'roar') {
    if (S.t > .45 && !S.fired.s) { S.fired.s = 1; roarSound(); }
    for (const tt of [.5, .85, 1.2]) if (S.t > tt && !S.fired[tt]) { S.fired[tt] = 1; spawnRing(); }
    if (S.t > DUR.roar) done();
  } else if (st === 'lie' || st === 'sit') { if (current && S.t > 1.4 && queue.length) next(); else if (S.t > 1.2) current = current && !queue.length ? null : current; }
  else if (st === 'idle') {
    if (current && !queue.length) current = null; else if (current && S.t > .3) next();
    if (followMode && Math.hypot(player.x - lionPos.x, player.z - lionPos.z) > 2.1) { target = clampIsland(player.clone()); target.keep = 1.5; setState('walk'); }
  }
  if (!walking && st !== 'walk') { /* keep gait */ }

  // pose
  let P = ANIM[st](S.t);
  if (S.blend < 1) { const Pp = ANIM[S.prev](S.prevT); P = mixP(Pp, P, sm(S.blend)); }
  apply(P);
  // beacon fade
  beaconT += dt; const bo = beaconT < 2.2 ? 1 - beaconT / 2.2 : 0; beacon.material.opacity = .8 * bo; beaconRing.material.opacity = .9 * bo; beaconRing.scale.setScalar(1 + beaconT * .35);
  // player marker (follow)
  for (const r of rings) if (r.t < 1.4) { r.t += dt; const k = r.t / 1.4; r.m.scale.setScalar(.4 + k * 3.2); r.m.material.opacity = .55 * (1 - k); r.m.quaternion.copy(camera.quaternion); if (k >= 1) r.m.visible = false; }
  // blink
  blinkT -= dt; if (blinkT < 0) { blinkT = 2 + Math.random() * 3; blinkK = .14; } if (blinkK > 0) blinkK -= dt;
  const bl = blinkK > 0 ? .12 : 1; eyes.forEach(e => e.scale.y = .07 * clamp(P.eye * bl, .1, 1));
}
let blinkT = 2, blinkK = 0;
function arrive() { if (current) next(); else setState('idle'); if (!current && S.name === 'walk') setState('idle'); }
function done() { if (queue.length) next(); else { current = null; setState('idle'); } }

function apply(P) {
  pelvis.rotation.set(P.pitch, P.yaw, P.roll);
  torso.rotation.x = P.arch; body.scale.set(1 - P.squash * .5, 1 + P.squash, 1 - P.squash * .5);
  neck.rotation.set(P.neckX, P.neckY, 0); head.rotation.set(P.headX, P.headY, P.headZ); jaw.rotation.x = P.jaw;
  maneG.scale.setScalar(P.mane * .9); maneG.rotation.z = P.shake * Math.sin(NOW * 41);
  tail1.rotation.set(P.t1x, P.t1y, 0); tail2.rotation.set(P.t2x, P.t2y, 0); tail3.rotation.set(P.t3x, P.t3y, 0);
  for (const l of LEGN) {
    const L = legs[l], front = l[0] === 'f'; const u = P[l + '_u'], lo = P[l + '_l'];
    L.sh.rotation.set(u, 0, P[l + '_z'] * L.side); L.knee.rotation.x = lo;
    const parent = front ? P.pitch + P.arch : P.pitch;
    L.ankle.rotation.x = P[l + '_p'] - P[l + '_f'] * (parent + u + lo);
  }
  // ground lock
  lion.position.y = 0; lion.updateMatrixWorld(true);
  let m = Infinity; const v = new THREE.Vector3();
  for (const pr of probes) { pr.getWorldPosition(v); lion.parent.worldToLocal(v); m = Math.min(m, v.y); }
  lion.position.y = -m + P.hop;
  lionShadow.position.set(lionPos.x, .012, lionPos.z); const hs = 1 - clamp(P.hop / 2.2, 0, .6); lionShadow.scale.set(hs * 1.15, hs * 1.15, 1); lionShadow.material.opacity = hs;
}



// ---------- API jardin ----------
let arriveCb = null;
function goTo(x, z, onDone) {
  queue = []; followMode = false; current = { a: 'goto' };
  target = new THREE.Vector3(x, 0, z);
  arriveCb = onDone || null;
  setState('walk');
}
const _arrive = arrive;
arrive = function () { _arrive(); if (arriveCb) { const cb = arriveCb; arriveCb = null; cb(); } };
function play(name) {
  if (name === 'jump' || name === 'dance' || name === 'roar') setState(name, { force: true });
  else setState(name);
}
return {
  group: ROOT, lion,
  update(dt) { update(dt); },
  say, parse, play, goTo,
  isWalking: () => S.name === 'walk',
  stateName: () => S.name,
  pos: () => lion.position,
  DUR,
};
}
