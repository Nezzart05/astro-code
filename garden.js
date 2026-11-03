/* =====================================================================
   ASTRO GARDEN (garden.js) — le jardin 3D d'Astro Code (v1.9.113)
   Base : le prototype visuel v0.1 de Sahbi (le diorama qu'Hamza a
   choisi le 3 nov : plateau peint, arbres à étoiles, koïs, stèles à
   glyphes, anneau doré) + ajouts demandés par Hamza :
   - l'évolution Monument Valley de la fontaine (paliers -> château) ;
   - le globe pâte à modeler sous l'îlot, habillé (chemin, cristaux,
     lanternes) ;
   - les planètes lointaines dans le ciel du monde ;
   - fond SOMBRE : dôme quasi noir + étoiles volumétriques éparses.
   État = collection réelle (localStorage), API window.SANCTUARY,
   boucle en pause quand l'écran est caché (__SANCTUARY_RUN__).
   ===================================================================== */
import * as THREE from 'three';
import { createLion3D } from './lion3d.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);
let zoomF = 1, zoomT = 1, baseD = 45;
function applyCam() {
  const d = baseD * zoomF;
  camera.position.set(0, d * 0.50, d * 0.87);
  camera.lookAt(0, 0.2, 0);
}
function frameCamera() {
  const a = innerWidth / innerHeight;
  camera.aspect = a;
  camera.fov = a >= 1 ? 50 : 58;
  baseD = a >= 1 ? 27 : 45;
  applyCam();
  camera.updateProjectionMatrix();
}
frameCamera();

/* ---------------- lumières : la chaleur vient d'ici + des halos ------- */
scene.add(new THREE.HemisphereLight(0x8d9bff, 0x3a2415, 0.55));
const sun = new THREE.DirectionalLight(0xffd9a3, 1.0);
sun.position.set(9, 14, 6);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x7fa8ff, 0.30);
fill.position.set(-8, 6, -9);
scene.add(fill);

/* ---------------- ciel : dôme SOMBRE (presque noir, halo bordeaux) ---- */
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(120, 32, 20),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'varying vec3 vP;',
      'void main(){',
      '  float h = normalize(vP).y;',
      '  vec3 top = vec3(0.006,0.005,0.026);',
      '  vec3 mid = vec3(0.016,0.012,0.052);',
      '  vec3 warm = vec3(0.105,0.032,0.052);',
      '  vec3 col = mix(mid, top, smoothstep(0.05, 0.60, h));',
      '  col = mix(warm, col, smoothstep(-0.03, 0.055, h));',
      '  col = mix(vec3(0.008,0.006,0.026), col, smoothstep(-0.7, -0.045, h));',
      '  gl_FragColor = vec4(col, 1.0);',
      '}',
    ].join('\n'),
  })
);
scene.add(sky);

/* ---------------- étoiles : couches fines + étoiles volumétriques ----- */
function glowTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const starTex = glowTexture('rgba(255,255,255,1)', 'rgba(180,200,255,0.35)');
function starLayer(count, rMin, rMax, size, opacity) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    const v = new THREE.Vector3(
      Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th))
      .multiplyScalar(rMin + Math.random() * (rMax - rMin));
    if (v.y < -18) v.y = Math.abs(v.y) * 0.4;
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ size, map: starTex, transparent: true, opacity,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat); scene.add(pts); return mat;
}
const starsA = starLayer(380, 55, 105, 2.0, 1.0);
const starsB = starLayer(150, 50, 100, 3.4, 0.9);
/* étoiles volumétriques : de gros halos doux, épars, qui respirent */
const haloTexBig = glowTexture('rgba(255,246,220,1)', 'rgba(255,214,140,0.30)');
const volStars = [];
for (let i = 0; i < 34; i++) {
  const warm = i % 3 !== 0;
  const m = new THREE.SpriteMaterial({ map: haloTexBig, color: warm ? 0xffe2b0 : 0xbdd2ff,
    transparent: true, opacity: 0.16 + Math.random() * 0.30, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m);
  const a = Math.random() * Math.PI * 2, r = 46 + Math.random() * 42;
  s.position.set(Math.cos(a) * r, -6 + Math.random() * 46, Math.sin(a) * r);
  const sc = 1.6 + Math.random() * 4.2;
  s.scale.set(sc, sc, 1);
  s.userData = { ph: Math.random() * 6.28, base: m.opacity };
  scene.add(s); volStars.push(s);
}

const shooters = [];
function spawnShooter() {
  const tex = glowTexture('rgba(255,244,214,1)', 'rgba(255,205,110,0.28)');
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m);
  s.scale.set(11, 0.55, 1);
  const a = Math.random() * Math.PI * 2, r = 62 + Math.random() * 25;
  s.position.set(Math.cos(a) * r, 16 + Math.random() * 26, Math.sin(a) * r);
  s.material.rotation = -0.5 - Math.random() * 0.4;
  s.userData = { life: 0, dir: new THREE.Vector3(-Math.sin(a), -0.38, Math.cos(a)).normalize() };
  scene.add(s); shooters.push(s);
}

/* =====================================================================
   LE MONDE (tout ce qui tourne ensemble)
   ===================================================================== */
const world = new THREE.Group();
scene.add(world);
const tilt = new THREE.Group();          // inclinaison douce du diorama
world.add(tilt);
tilt.rotation.x = 0.10;

/* ---------------- l'îlot : plateau peint + dessous rocheux ------------ */
function groundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#3f7d5a'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 2600; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 500;
    const x = 512 + Math.cos(a) * r, y = 512 + Math.sin(a) * r;
    g.fillStyle = ['rgba(88,160,96,0.20)', 'rgba(46,110,70,0.22)', 'rgba(140,200,120,0.13)'][i % 3];
    g.beginPath(); g.arc(x, y, 5 + Math.random() * 15, 0, 7); g.fill();
  }
  g.strokeStyle = 'rgba(238,220,175,0.92)'; g.lineWidth = 64;
  g.beginPath(); g.arc(512, 512, 400, 0, 7); g.stroke();
  g.strokeStyle = 'rgba(255,240,205,0.35)'; g.lineWidth = 96;
  g.beginPath(); g.arc(512, 512, 400, 0, 7); g.stroke();
  const gr = g.createRadialGradient(512, 512, 20, 512, 512, 200);
  gr.addColorStop(0, 'rgba(250,232,190,0.98)'); gr.addColorStop(1, 'rgba(240,214,160,0.85)');
  g.fillStyle = gr; g.beginPath(); g.arc(512, 512, 198, 0, 7); g.fill();
  g.fillStyle = 'rgba(190,170,140,0.5)';
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * Math.PI * 2, r = 400 + (Math.random() - 0.5) * 62;
    g.beginPath(); g.arc(512 + Math.cos(a) * r, 512 + Math.sin(a) * r, 3 + Math.random() * 5, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4; return t;
}
function rockTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#6d5138'); gr.addColorStop(0.45, '#54402e'); gr.addColorStop(1, '#2c2138');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 130; i++) {
    g.fillStyle = `rgba(${20 + Math.random() * 40 | 0},${14 + Math.random() * 26 | 0},${30 + Math.random() * 30 | 0},0.25)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 18 + Math.random() * 70, 5 + Math.random() * 13);
  }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
const rockMat = new THREE.MeshStandardMaterial({ map: rockTexture(), roughness: 1 });
const top = new THREE.Mesh(
  new THREE.CylinderGeometry(10, 10.35, 1.15, 56),
  [rockMat,
   new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }),
   rockMat]
);
top.position.y = -0.55;
tilt.add(top);
const under = new THREE.Mesh(new THREE.ConeGeometry(10.3, 8.6, 56, 6), rockMat);
under.geometry.rotateX(Math.PI);
under.geometry.computeVertexNormals();
{
  const p = under.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 3.5) {
      const n = Math.sin(p.getX(i) * 2.1) * Math.cos(p.getZ(i) * 1.7);
      p.setX(i, p.getX(i) + n * 0.24); p.setZ(i, p.getZ(i) + n * 0.2);
    }
  }
  under.geometry.computeVertexNormals();
}
under.position.y = -1.1 - 4.3;
tilt.add(under);

/* ---------------- le GLOBE sous l'îlot (pâte à modeler) --------------- */
function clayTexture(base, bandCols, speckles) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 1024, 512);
  bandCols.forEach((col, bi) => {
    const yB = (0.14 + bi * 0.16) * 512, amp = 9 + (bi % 3) * 5, per = 250 + bi * 43;
    g.fillStyle = col; g.globalAlpha = 0.55; g.beginPath(); g.moveTo(0, yB);
    for (let x = 0; x <= 1024; x += 16) g.lineTo(x, yB + Math.sin(x / per * 6.283 + bi * 1.7) * amp);
    for (let x = 1024; x >= 0; x -= 16) g.lineTo(x, yB + 34 + Math.sin(x / per * 6.283 + bi * 1.7) * amp);
    g.closePath(); g.fill();
  });
  g.globalAlpha = 1;
  if (speckles) for (let i = 0; i < 500; i++) {
    g.fillStyle = 'rgba(255,214,140,' + (0.2 + Math.random() * 0.5) + ')';
    g.fillRect(Math.random() * 1024, 90 + Math.random() * 330, 1.7, 1.7);
  }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
const PC = new THREE.Vector3(0, -14.6, 0), PR = 15;
{
  const ptex = clayTexture('#232055', ['#3a5f9e', '#57b7a8', '#6a6fd0', '#3f8fb0', '#9d8bd6'], false);
  const planet = new THREE.Mesh(new THREE.SphereGeometry(PR, 48, 32),
    new THREE.MeshStandardMaterial({ map: ptex, roughness: 1 }));
  planet.position.copy(PC); tilt.add(planet);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(16.1, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x7a5cff, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false }));
  atmo.position.copy(PC); tilt.add(atmo);
}
const surfMat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, flatShading: true, roughness: 0.9 }, o || {}));
function glowSpr(color, size, op) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexBig, color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1); return s;
}
function onPlanet(obj, theta, phi, lift) {
  const n = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
  obj.position.copy(PC).addScaledVector(n, PR + (lift || 0));
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  tilt.add(obj); return obj;
}
for (let i = 0; i < 26; i++) {           // chemin de dalles en spirale
  const d = new THREE.Mesh(new THREE.CircleGeometry(0.46 - i * 0.005, 10), surfMat(0xd9c9a3));
  onPlanet(d, i * 0.42, 0.72 + i * 0.028, 0.03); d.rotateX(-Math.PI / 2);
}
for (let i = 0; i < 10; i++) {           // cristaux sur l'épaule
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.34 - k * 0.08),
      surfMat(k ? 0xb08bff : 0x7fe3ff, { emissive: k ? 0x5a3aa8 : 0x1a7e9a, emissiveIntensity: 0.9 }));
    c.scale.y = 1.9; c.position.set(k * 0.3 - 0.3, 0.25, (k % 2) * 0.25 - 0.1); c.rotation.z = (k - 1) * 0.25; g.add(c);
  }
  onPlanet(g, i * 1.93 + 0.6, 0.62 + (i % 4) * 0.16, 0.05);
}
for (let i = 0; i < 10; i++) {           // lanternes chaudes le long du chemin
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffbe6e }));
  onPlanet(lamp, i * 0.42 + 0.21, 0.72 + i * 0.028 + 0.05, 0.18);
  const gl = glowSpr(0xffb84d, 0.7, 0.30); gl.position.copy(lamp.position); tilt.add(gl);
}

/* ---------------- planètes lointaines (ciel du monde) ------------------ */
const farPlanets = [];
function farPlanet(r, tex, x, y, z, ringCol) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 36, 24), new THREE.MeshBasicMaterial({ map: tex })));
  if (ringCol) {
    const rg = new THREE.Mesh(new THREE.TorusGeometry(r * 1.65, r * 0.1, 6, 64), new THREE.MeshBasicMaterial({ color: ringCol }));
    rg.rotation.x = 1.35; rg.rotation.y = 0.3; g.add(rg);
  }
  g.position.set(x, y, z); world.add(g); farPlanets.push(g); return g;
}
farPlanet(2.6, clayTexture('#2c4f9e', ['#57b7e8', '#7fd0c9', '#4a7fd0'], false), -8, 9, -34);
farPlanet(3.4, clayTexture('#e8dcc4', ['#c9a184', '#b08968'], false), 63.4, 4, 29.6, 0xf3e4c4);
farPlanet(5, clayTexture('#e8842c', ['#ffd23e', '#ff9d5c', '#e86a2c'], false), -23.9, -2, -65.8);
farPlanet(4, clayTexture('#3f8fd0', ['#57c75c', '#7bc47f', '#2c6fb0'], false), -60.6, 8, -35);

// anneau doré autour de l'îlot (la signature de son image)
const ring = new THREE.Mesh(
  new THREE.RingGeometry(12.6, 13.05, 96),
  new THREE.MeshBasicMaterial({ color: 0xffcf7d, transparent: true, opacity: 0.34,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
);
ring.rotation.x = -Math.PI / 2 + 0.42; ring.position.y = 0.4;
world.add(ring);

/* ---------------- la fontaine centrale (v0.1) -------------------------- */
const fountain = new THREE.Group();
fountain.position.y = 0.02;
tilt.add(fountain);
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5d7292, roughness: 0.85 });
const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 3.0, 0.62, 40), stoneMat);
basin.position.y = 0.31; fountain.add(basin);
const waterMat = new THREE.MeshStandardMaterial({ color: 0x2fa8c9, emissive: 0x1b6f96,
  emissiveIntensity: 0.9, roughness: 0.25, transparent: true, opacity: 0.96 });
const water = new THREE.Mesh(new THREE.CircleGeometry(2.5, 40), waterMat);
water.rotation.x = -Math.PI / 2; water.position.y = 0.63; fountain.add(water);
const tierB = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 0.85, 24), stoneMat);
tierB.position.y = 1.0; fountain.add(tierB);
const tierTop = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.16, 24), stoneMat);
tierTop.position.y = 1.42; fountain.add(tierTop);
const haloTex = glowTexture('rgba(255,214,130,1)', 'rgba(255,170,70,0.30)');
function halo(color, size, x, y, z, opacity) {
  const m = new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m); s.scale.set(size, size, 1); s.position.set(x, y, z);
  return s;
}
fountain.add(halo(0x9fd8ff, 7.5, 0, 1.15, 0, 0.30));
const fountainLight = new THREE.PointLight(0xffc978, 1.5, 18, 1);
fountainLight.position.set(0, 3.0, 0); fountain.add(fountainLight);
const JETS = 240;
const jetPos = new Float32Array(JETS * 3);
const jetSeed = [];
for (let i = 0; i < JETS; i++) jetSeed.push({ a: Math.random() * Math.PI * 2, p: Math.random(), sp: 0.5 + Math.random() * 0.35 });
const jetGeo = new THREE.BufferGeometry();
jetGeo.setAttribute('position', new THREE.BufferAttribute(jetPos, 3));
const jets = new THREE.Points(jetGeo, new THREE.PointsMaterial({ size: 0.30, map: starTex,
  color: 0xbfeaff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
fountain.add(jets);
function koiTexture(body, fin) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128); g.fillStyle = body;
  g.beginPath(); g.ellipse(0, -18, 34, 62, 0, 0, 7); g.fill();
  g.beginPath(); g.moveTo(0, 34); g.quadraticCurveTo(44, 66, 26, 104);
  g.quadraticCurveTo(0, 88, -26, 104); g.quadraticCurveTo(-44, 66, 0, 34); g.fill();
  g.fillStyle = fin;
  g.beginPath(); g.ellipse(-36, -6, 12, 26, 0.7, 0, 7); g.fill();
  g.beginPath(); g.ellipse(36, -6, 12, 26, -0.7, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.arc(-11, -62, 4.5, 0, 7); g.arc(11, -62, 4.5, 0, 7); g.fill();
  g.fillStyle = '#20304a';
  g.beginPath(); g.arc(-11, -62, 2.2, 0, 7); g.arc(11, -62, 2.2, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
const kois = [];
[['#ff8c42', '#ffc46b'], ['#57b7e8', '#a8dcff']].forEach(([b, f], i) => {
  const k = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15),
    new THREE.MeshBasicMaterial({ map: koiTexture(b, f), transparent: true, depthWrite: false }));
  k.rotation.x = -Math.PI / 2; k.position.y = 0.66;
  k.userData = { ph: i * Math.PI, r: 1.45 - i * 0.35 };
  fountain.add(k); kois.push(k);
});

/* ---------------- évolution MONUMENT VALLEY (paliers) ------------------
   La fontaine grandit avec la collection : colonnes (3), arches (5),
   tourelles à dômes oignon (7), dôme céleste (9), couronne (11),
   flèche — le CHÂTEAU CÉLESTE (12). Géométrie simple, couleurs plates. */
const Pm = { cream: 0xf3e4c4, lilac: 0x9d8bd6, mag: 0xd94fa8, violet: 0x6a4fb0, gold: 0xffcf5c };
const matP = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, flatShading: true, roughness: 0.85 }, o || {}));
const tiers = [];
function tier(need, build) {
  const g = new THREE.Group(); build(g); g.visible = false; fountain.add(g);
  tiers.push({ need, g, shown: false, t0: -1e9 }); return g;
}
const onion = (r, h, color) => {
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; const rr = r * Math.sin(Math.PI * Math.pow(t, 0.62)) * (1 - 0.15 * t); pts.push(new THREE.Vector2(Math.max(rr, 0.001), t * h)); }
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), matP(color));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 0.12, h * 0.35, 6), matP(Pm.gold, { emissive: 0xaa7a10, emissiveIntensity: 0.6 }));
  tip.position.y = h + h * 0.1;
  const g = new THREE.Group(); g.add(m, tip); return g;
};
tier(3, g => {
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 3.4, 10), matP(k % 2 ? 0xc9b8f0 : Pm.cream));
    c.position.set(Math.cos(a) * 2.1, 2.4, Math.sin(a) * 2.1); g.add(c);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.8), matP(Pm.lilac));
    cap.position.set(c.position.x, 4.2, c.position.z); g.add(cap);
  }
});
tier(5, g => {
  for (let k = 0; k < 4; k++) {
    const a0 = k * Math.PI / 2 + Math.PI / 4, a1 = (k + 1) * Math.PI / 2 + Math.PI / 4, am = (a0 + a1) / 2;
    const R = 2.1, mx = Math.cos(am) * R * Math.cos((a1 - a0) / 2), mz = Math.sin(am) * R * Math.cos((a1 - a0) / 2);
    const ch = 2 * R * Math.sin((a1 - a0) / 2);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(ch / 2, 0.2, 8, 20, Math.PI), matP(Pm.cream));
    arch.position.set(mx, 4.15, mz); arch.rotation.y = -am + Math.PI / 2; g.add(arch);
  }
  const pl = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.12, 6, 40), matP(Pm.gold, { emissive: 0xaa7a10, emissiveIntensity: 0.5 }));
  pl.rotation.x = Math.PI / 2; pl.position.y = 4.38; g.add(pl);
});
tier(7, g => {
  [-1, 1].forEach(sd => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 3.0, 10), matP(0xb9a6ef));
    t.position.set(sd * 3.9, 1.5, 0); g.add(t);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.6), new THREE.MeshBasicMaterial({ color: 0xffd070 }));
    win.position.set(sd * 3.9, 1.8, 0.73); g.add(win);
    const dm = onion(0.95, 1.5, Pm.mag); dm.position.set(sd * 3.9, 3.0, 0); g.add(dm);
  });
});
let crownMesh;
tier(9, g => {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.25, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0.28, roughness: 0.1, emissive: 0x3a4aa8, emissiveIntensity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
  dome.position.y = 4.4; g.add(dome);
  const sg = new THREE.BufferGeometry(); const n = 60, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const r = Math.random() * 2, th = Math.random() * 6.283, y = Math.random() * 1.9; a[i * 3] = Math.cos(th) * r * (1 - y / 2.4); a[i * 3 + 1] = 4.5 + y; a[i * 3 + 2] = Math.sin(th) * r * (1 - y / 2.4); }
  sg.setAttribute('position', new THREE.BufferAttribute(a, 3));
  g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xfff2c8, size: 0.12, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
});
tier(11, g => {
  crownMesh = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.1, 8, 48), matP(Pm.gold, { emissive: 0xc08a10, emissiveIntensity: 0.9 }));
  crownMesh.rotation.x = Math.PI / 2; crownMesh.position.y = 6.9; g.add(crownMesh);
  const gg = halo(0xffcf5c, 5, 0, 6.9, 0, 0.5); g.add(gg);
});
tier(12, g => {
  const sp = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.6, 8), matP(Pm.mag));
  sp.position.y = 6.3; g.add(sp);
  const o = onion(0.7, 1.1, Pm.violet); o.position.y = 5.2; g.add(o);
  g.add(halo(0xfff0b0, 2.4, 0, 8.4, 0, 0.9));
});

/* ---------------- les 12 stèles : allumée = signe collecté ------------ */
const SIGNS = [
  ['belier', '♈', '#e2543e'], ['taureau', '♉', '#7fae4c'], ['gemeaux', '♊', '#e8b13c'],
  ['cancer', '♋', '#d96f8e'], ['lion', '♌', '#f08c1e'], ['vierge', '♍', '#9db86a'],
  ['balance', '♎', '#7fc4c9'], ['scorpion', '♏', '#a04a68'], ['sagittaire', '♐', '#e2703a'],
  ['capricorne', '♑', '#4f9e8f'], ['verseau', '♒', '#4f8fd0'], ['poissons', '♓', '#5fb7d9'],
];
const ORDER = SIGNS.map(s => s[0]);
function glyphTexture(glyph, lit) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 320;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 320);
  g.font = '190px "Segoe UI Symbol","Noto Sans Symbols 2",serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (lit) { g.shadowColor = 'rgba(255,190,80,0.95)'; g.shadowBlur = 34; g.fillStyle = '#ffd977'; }
  else { g.fillStyle = 'rgba(168,182,220,0.55)'; }
  g.fillText(glyph, 128, 168);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
function steleGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.72, 0); s.lineTo(0.72, 0); s.lineTo(0.72, 2.2);
  s.quadraticCurveTo(0.72, 3.05, 0, 3.3);
  s.quadraticCurveTo(-0.72, 3.05, -0.72, 2.2); s.lineTo(-0.72, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
  geo.translate(0, 0, -0.21);
  return geo;
}
const steleGeo = steleGeometry();
const steles = {};
SIGNS.forEach(([id, glyph], i) => {
  const a = (i / 12) * Math.PI * 2 + 0.26;
  const grp = new THREE.Group();
  grp.position.set(Math.cos(a) * 8.05, 0, Math.sin(a) * 8.05);
  grp.lookAt(0, 0, 0); grp.rotateY(Math.PI);
  const stoneMatS = new THREE.MeshStandardMaterial({ color: 0x46538a, roughness: 0.8, emissive: 0x0c1230, emissiveIntensity: 0.4 });
  grp.add(new THREE.Mesh(steleGeo, stoneMatS));
  const faceMat = new THREE.MeshBasicMaterial({ map: glyphTexture(glyph, false), transparent: true });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.65), faceMat);
  face.position.set(0, 1.78, 0.28); grp.add(face);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x39436e, roughness: 1 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.34, 0.95), baseMat);
  base.position.y = 0.17; grp.add(base);
  const haloS = halo(0xffbe6e, 5.2, 0, 1.9, 0.4, 0.5); haloS.visible = false; grp.add(haloS);
  const pl = new THREE.PointLight(0xffbe6e, 0.85, 8, 1);
  pl.position.set(0, 2.0, 0.8); pl.visible = false; grp.add(pl);
  tilt.add(grp);
  steles[id] = { stoneMatS, faceMat, baseMat, haloS, pl, litTex: glyphTexture(glyph, true), dimTex: faceMat.map, lit: false };
});

/* ---------------- arbres à étoiles + cristaux (v0.1) ------------------- */
const trees = [];
function tree(x, z, s) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.1, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 }));
  trunk.position.y = 0.55; g.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e6b3c, roughness: 0.9 });
  [[0, 1.6, 0, 0.85], [0.5, 1.3, 0.2, 0.6], [-0.45, 1.35, -0.15, 0.62]].forEach(([lx, ly, lz, lr]) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(lr, 14, 12), leafMat);
    b.position.set(lx, ly, lz); g.add(b);
  });
  for (let i = 0; i < 4; i++) {
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.11),
      new THREE.MeshStandardMaterial({ color: 0xffd257, emissive: 0xffb52e, emissiveIntensity: 1.6 }));
    const a = Math.random() * 6.28;
    star.position.set(Math.cos(a) * 0.7, 1.25 + Math.random() * 0.6, Math.sin(a) * 0.7);
    g.add(star);
  }
  tilt.add(g); trees.push({ g, x, z, s });
}
tree(4.6, 3.4, 1.05); tree(-5.2, 2.6, 1.25); tree(-3.9, -4.6, 0.95);
tree(5.4, -3.1, 1.15); tree(1.8, 5.9, 0.85); tree(-6.1, -1.8, 0.9);
function crystal(x, z, color, s) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35,
    roughness: 0.25, transparent: true, opacity: 0.92 });
  [[0, 0.75, 0, 1.5], [0.5, 0.5, 0.2, 1.0], [-0.45, 0.42, -0.1, 0.85]].forEach(([cx, cy, cz, ch]) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.30, ch, 6), mat);
    m.position.set(cx, cy, cz); m.rotation.z = (Math.random() - 0.5) * 0.25; g.add(m);
  });
  g.scale.setScalar(s); tilt.add(g);
}
crystal(6.9, 1.2, 0x9a7fe8, 1.1); crystal(-7.1, -3.4, 0x6fd3e8, 0.95); crystal(2.9, -6.6, 0xc99aff, 0.8);

/* ---------------- esprits-compagnons (un par signe rencontré) ---------- */
function spiritTexture(color, glyph) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.beginPath(); g.ellipse(128, 148, 74, 82, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.20)';
  g.beginPath(); g.ellipse(104, 108, 26, 20, -0.5, 0, 7); g.fill();
  g.fillStyle = '#26314f';
  g.beginPath(); g.arc(104, 138, 7.5, 0, 7); g.arc(152, 138, 7.5, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,140,150,0.75)';
  g.beginPath(); g.arc(88, 158, 9, 0, 7); g.arc(168, 158, 9, 0, 7); g.fill();
  g.font = '64px "Segoe UI Symbol","Noto Sans Symbols 2",serif';
  g.textAlign = 'center'; g.fillStyle = '#ffe9a8';
  g.shadowColor = 'rgba(255,190,80,0.9)'; g.shadowBlur = 12;
  g.fillText(glyph, 128, 218);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
const spirits = [];
const spiritBySign = {};
SIGNS.forEach(([id, glyph, col], i) => {
  if (id === 'poissons') return;   // les Poissons vivent dans la fontaine (les koïs)
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: spiritTexture(col, glyph), transparent: true, depthWrite: false }));
  sp.scale.set(1.25, 1.25, 1);
  sp.userData = { r: 5.5 + (i % 4) * 0.35, ph: i * 1.7, sp: 0.08 + (i % 5) * 0.02 };
  sp.visible = false;
  tilt.add(sp); spirits.push(sp); spiritBySign[id] = sp;
});

/* ---------------- rotation au doigt : inertie + retour doux ----------- */
let velY = 0, dragging = false, lastX = 0, lastY = 0, lastTouch = -10;
let tiltTarget = 0.10;
function perfNow() { return performance.now() / 1000; }
const pointers = new Map();
let pinchD = 0;
canvas.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [p1, p2] = [...pointers.values()];
    pinchD = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    dragging = false;
  } else {
    dragging = true; lastX = e.clientX; lastY = e.clientY; velY = 0;
  }
  canvas.setPointerCapture(e.pointerId);
  const h = document.getElementById('hint'); if (h) h.style.opacity = 0;
});
canvas.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [p1, p2] = [...pointers.values()];
    const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    if (pinchD > 0 && d > 0) zoomT = THREE.MathUtils.clamp(zoomT * (pinchD / d), 0.42, 1.05);
    pinchD = d; lastTouch = perfNow();
    return;
  }
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  velY = dx * 0.0052;
  world.rotation.y += velY;
  tiltTarget = THREE.MathUtils.clamp(tiltTarget + dy * 0.0016, -0.06, 0.52);
  lastTouch = perfNow();
});
const endDrag = e => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchD = 0;
  if (pointers.size === 0) dragging = false;
  else if (pointers.size === 1) { const p = [...pointers.values()][0]; lastX = p.x; lastY = p.y; dragging = true; }
  lastTouch = perfNow();
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  zoomT = THREE.MathUtils.clamp(zoomT * (1 + e.deltaY * 0.001), 0.42, 1.05);
}, { passive: false });

/* ---------------- état : la collection réelle -------------------------- */
let collected = new Set(), memories = 0, ready = false, ascended = false, ascensionT = -1;
const lueur = () => Math.min(140, collected.size * 10 + memories * 2);
const $ = id => document.getElementById(id);
function hud() {
  const n = collected.size;
  if ($('cnt')) $('cnt').textContent = n + '/12';
  const L = lueur();
  if ($('luebar')) $('luebar').style.width = (L / 140 * 100) + '%';
  if ($('luetxt')) $('luetxt').textContent = 'Glow ' + L + '/140';
  const slEl = $('sl'); if (slEl && document.activeElement !== slEl) slEl.value = n;
  if ($('lvl')) $('lvl').textContent = n >= 12 ? 'Ascension' : n >= 9 ? 'Level 3 · celestial sky' : n >= 5 ? 'Level 2 · moonlight' : 'Level 1 · calm night';
}
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function applyState(animateIn) {
  const n = collected.size;
  ORDER.forEach(id => {
    const s = steles[id], lit = collected.has(id);
    if (lit !== s.lit) {
      s.lit = lit;
      s.faceMat.map = lit ? s.litTex : s.dimTex; s.faceMat.needsUpdate = true;
      s.stoneMatS.color.set(lit ? 0x9a7448 : 0x46538a);
      s.stoneMatS.emissive.set(lit ? 0x603a08 : 0x0c1230);
      s.stoneMatS.emissiveIntensity = lit ? 0.55 : 0.4;
      s.baseMat.color.set(lit ? 0x7d5f36 : 0x39436e);
      s.haloS.visible = lit; s.pl.visible = lit;
    }
    const sp = spiritBySign[id];
    if (sp) sp.visible = lit;
  });
  if (typeof fishActorObj !== 'undefined') fishActorObj.visible = collected.has('poissons');
  if (typeof lionObj !== 'undefined') lionObj.visible = false;
  if (typeof lionShadow !== 'undefined') lionShadow.visible = false;
  if (typeof lion3d !== 'undefined') {
    lion3d.group.visible = collected.has('lion');
    if (spiritBySign['lion']) spiritBySign['lion'].visible = false;
  }
  tiers.forEach(t => {
    const should = n >= t.need;
    if (should && !t.shown) { t.shown = true; t.g.visible = true; t.t0 = animateIn ? performance.now() : -1e9; }
    if (!should && t.shown) { t.shown = false; t.g.visible = false; }
  });
  hud();
  if (n === 12 && lueur() >= 140 && !ascended) { ascended = true; ascensionT = performance.now(); }
  if (n < 12) ascended = false;
}
window.SANCTUARY = {
  setCollected(ids, opt) {
    collected = new Set((ids || []).filter(x => ORDER.includes(x)));
    memories = (opt && opt.memories) || 0;
    applyState(ready);
  },
  get count() { return collected.size; },
  lueur,
};

/* ---------------- boucle ------------------------------------------------ */
const clock = new THREE.Clock();
let nextShooter = 2.5;
function revealTier(t, now) {
  if (t.t0 < -1e8) { t.g.scale.setScalar(1); t.g.position.y = 0; return; }
  const k = Math.max(0, Math.min(1, (now - t.t0) / 1100));
  const e = easeOutBack(k);
  t.g.scale.setScalar(Math.max(0.001, e));
  t.g.position.y = (1 - k) * -2.2;
}
function animate() {
  if (window.__SANCTUARY_RUN__ === false) { setTimeout(() => requestAnimationFrame(animate), 300); return; }
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const now = performance.now();

  if (!dragging) {
    world.rotation.y += velY;
    velY *= 0.955;
    if (perfNow() - lastTouch > 2.5) world.rotation.y += dt * 0.07;
  }
  tilt.rotation.x += (tiltTarget - tilt.rotation.x) * 0.06;
  if (Math.abs(zoomT - zoomF) > 0.0005) { zoomF += (zoomT - zoomF) * 0.09; applyCam(); }
  world.position.y = Math.sin(t * 0.55) * 0.16;
  ring.rotation.z = t * 0.02;
  farPlanets.forEach((p, i) => { p.rotation.y = t * 0.03 * (i % 2 ? 1 : -1) + i; });

  starsA.opacity = 0.90 + Math.sin(t * 0.8) * 0.10;
  starsB.opacity = 0.76 + Math.cos(t * 0.6) * 0.14;
  volStars.forEach(s => { s.material.opacity = s.userData.base * (0.75 + 0.25 * Math.sin(t * 0.9 + s.userData.ph)); });

  for (let i = 0; i < JETS; i++) {
    const s = jetSeed[i];
    s.p += dt * s.sp; if (s.p > 1) s.p -= 1;
    const rr = 0.25 + s.p * 1.85, yy = 1.52 + s.p * 1.5 - s.p * s.p * 2.15;
    jetPos[i * 3] = Math.cos(s.a) * rr;
    jetPos[i * 3 + 1] = Math.max(yy, 0.66);
    jetPos[i * 3 + 2] = Math.sin(s.a) * rr;
  }
  jetGeo.attributes.position.needsUpdate = true;
  waterMat.emissiveIntensity = 0.68 + Math.sin(t * 1.7) * 0.13;
  fountainLight.intensity = 1.45 + Math.sin(t * 1.7) * 0.25;
  const asc = ascensionT > 0 ? Math.min(1, (now - ascensionT) / 2600) : -1;
  kois.forEach((k, ki) => {
    const a = t * 0.35 + k.userData.ph;
    k.position.x = Math.cos(a) * k.userData.r;
    k.position.z = Math.sin(a) * k.userData.r;
    k.rotation.z = -a - Math.PI / 2 + Math.PI;
    if (ki === 0) {
      if (asc >= 0 && asc < 1) { k.position.y = 0.66 + Math.sin(asc * Math.PI) * 4.5; }
      else k.position.y = 0.66;
    }
  });
  spirits.forEach(sp => {
    if (!sp.visible || sp.userData.acting) return;
    const a = t * sp.userData.sp + sp.userData.ph;
    sp.position.set(Math.cos(a) * sp.userData.r, 0.78 + Math.sin(t * 2.1 + sp.userData.ph) * 0.05, Math.sin(a) * sp.userData.r);
  });
  tiers.forEach(t => { if (t.shown) revealTier(t, now); });
  updateActors(dt, t); updateFruits(dt);
  if (crownMesh) { crownMesh.rotation.z = t * 0.5; crownMesh.position.y = 6.9 + Math.sin(t * 1.5) * 0.12; }

  if (t > nextShooter) { spawnShooter(); nextShooter = t + 3.5 + Math.random() * 5; }
  for (let i = shooters.length - 1; i >= 0; i--) {
    const s = shooters[i]; s.userData.life += dt;
    const L = s.userData.life;
    s.material.opacity = L < 0.25 ? L * 3.2 : Math.max(0, 0.8 - (L - 0.25) * 0.9);
    s.position.addScaledVector(s.userData.dir, dt * 26);
    if (L > 1.2) { scene.remove(s); s.material.map.dispose(); s.material.dispose(); shooters.splice(i, 1); }
  }
  renderer.render(scene, camera);
  window.__SANCTUARY_FRAMES__ = (window.__SANCTUARY_FRAMES__ || 0) + 1;
}


/* ---------------- acteurs : les signes deviennent des personnages -------
   v1.9.115 — les compagnons AGISSENT : ils se déplacent, sautent, dansent,
   vont secouer un arbre et les fruits tombent. Les commandes arrivent par
   SANCTUARY.command(texte) — voix transcrite par Meta (colle app.js) ou
   pastilles tactiles. La vraie 3D riggée viendra plus tard ; ici, des
   personnages illustrés animés par le code, lisibles comme de la 3D. */
function blobShadowTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 32, 4, 64, 32, 60);
  gr.addColorStop(0, 'rgba(10,8,30,0.42)'); gr.addColorStop(1, 'rgba(10,8,30,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 64);
  const t = new THREE.CanvasTexture(c); return t;
}
function fruitTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(52, 48, 8, 64, 68, 52);
  gr.addColorStop(0, '#ffd76e'); gr.addColorStop(0.55, '#ff9d3c'); gr.addColorStop(1, '#f27b1d');
  x.fillStyle = gr; x.beginPath(); x.arc(64, 70, 44, 0, 7); x.fill();
  x.strokeStyle = '#7a4a21'; x.lineWidth = 6;
  x.beginPath(); x.moveTo(64, 28); x.quadraticCurveTo(68, 16, 78, 10); x.stroke();
  x.fillStyle = '#3f9e4d';
  x.beginPath(); x.ellipse(84, 22, 17, 9, 0.5, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
const fruits = [];
for (let i = 0; i < 14; i++) {
  const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: fruitTexture(), transparent: true, depthWrite: false }));
  f.scale.set(0.44, 0.44, 1); f.visible = false;
  f.userData = { on: false, vy: 0, life: 0, bounced: false };
  tilt.add(f); fruits.push(f);
}
window.__GARDEN_FRUITS__ = () => fruits.filter(f => f.userData.on).length;
function spawnFruits(x, z) {
  let n = 0;
  for (const f of fruits) {
    if (f.userData.on) continue;
    f.position.set(x + (Math.random() - 0.5) * 1.2, 2.5 + Math.random() * 0.5, z + (Math.random() - 0.5) * 1.2);
    f.userData = { on: true, vy: 0, life: 0, bounced: false };
    f.material.opacity = 1; f.visible = true;
    if (++n >= 6) break;
  }
}
function updateFruits(dt) {
  for (const f of fruits) {
    if (!f.userData.on) continue;
    const u = f.userData; u.life += dt;
    u.vy -= 5.2 * dt; f.position.y += u.vy * dt;
    if (f.position.y <= 0.24) {
      f.position.y = 0.24;
      if (!u.bounced) { u.vy = Math.abs(u.vy) * 0.32; u.bounced = true; } else u.vy = 0;
    }
    if (u.life > 2.4) f.material.opacity = Math.max(0, 1 - (u.life - 2.4) / 0.7);
    if (u.life > 3.1) { u.on = false; f.visible = false; }
  }
}

const actors = {};
function baseYOf(kind) { return kind === 'walker' ? 1.36 : kind === 'fish' ? 1.45 : 0.78; }
function makeActor(id, obj, kind) {
  const a = { id, obj, kind, seq: null, si: 0, st: 0, from: new THREE.Vector3(), homeA: Math.random() * 6.28, away: false };
  actors[id] = a; return a;
}
const fishActorObj = new THREE.Sprite(new THREE.SpriteMaterial({ map: koiTexture('#ff8c42', '#ffc46b'), transparent: true, depthWrite: false }));
fishActorObj.scale.set(1.9, 1.9, 1); fishActorObj.visible = false;
fishActorObj.position.set(2.1, 1.45, 0);
tilt.add(fishActorObj);
makeActor('poissons', fishActorObj, 'fish');
const lionTex = new THREE.TextureLoader().load('assets/char-lion.webp');
lionTex.encoding = THREE.sRGBEncoding;
const lionObj = new THREE.Sprite(new THREE.SpriteMaterial({ map: lionTex, transparent: true, depthWrite: false }));
lionObj.scale.set(1.85, 2.72, 1); lionObj.visible = false;
lionObj.position.set(3.6, 1.36, 3.4);
tilt.add(lionObj);
const lionShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.85),
  new THREE.MeshBasicMaterial({ map: blobShadowTex(), transparent: true, depthWrite: false }));
lionShadow.rotation.x = -Math.PI / 2; lionShadow.position.set(3.6, 0.03, 3.4); lionShadow.visible = false;
tilt.add(lionShadow);
const LION_SCALE = 1.7;
const lion3d = createLion3D(tilt, camera, { radius: 5.2 });
lion3d.group.scale.setScalar(LION_SCALE);
lion3d.group.visible = false;
makeActor('lion', lion3d.group, 'lion3d');
SIGNS.forEach(([id]) => {
  if (id !== 'poissons' && id !== 'lion' && spiritBySign[id]) makeActor(id, spiritBySign[id], 'spirit');
});
window.__GARDEN_ACTORS__ = () => Object.keys(actors).filter(id => actors[id].obj.visible);
window.__GARDEN_ZOOM__ = () => zoomT;
window.__GARDEN_DEBUG__ = () => ({
  trees: trees.length,
  fruitsOn: fruits.filter(f => f.userData.on).length,
  lion: actors.lion ? { pos: lionObj.position.toArray().map(v => +v.toFixed(2)), seq: actors.lion.seq ? actors.lion.seq.map(s => s.type) : null, si: actors.lion.si, st: +actors.lion.st.toFixed(2) } : null,
  fish: actors.poissons ? { seq: actors.poissons.seq ? actors.poissons.seq.map(s => s.type) : null } : null,
  lion3d: (typeof lion3d !== 'undefined') ? { state: lion3d.stateName(), pos: lion3d.pos().toArray().map(v => +v.toFixed(2)) } : null,
});

function moveStep(to, dur, arc, done) { return { type: 'move', to, dur, arc: arc || 0, done }; }
function startSeq(a, steps) {
  a.seq = steps; a.si = 0; a.st = 0; a.from.copy(a.obj.position);
  if (a.kind === 'spirit') a.obj.userData.acting = true;
}
function endSeq(a, t) {
  a.seq = null;
  a.obj.material.rotation = 0;
  if (a.kind === 'walker') a.obj.scale.set(1.85, 2.72, 1);
  if (a.kind === 'spirit') {
    const sp = a.obj;
    sp.userData.ph = Math.atan2(sp.position.z, sp.position.x) - t * sp.userData.sp;
    sp.userData.acting = false;
  }
  if (a.kind === 'fish') a.homeA = Math.atan2(a.obj.position.z, a.obj.position.x);
}
function nearestTree(o) {
  let best = trees[0], bd = 1e12;
  for (const tr of trees) {
    const d = (tr.x - o.position.x) ** 2 + (tr.z - o.position.z) ** 2;
    if (d < bd) { bd = d; best = tr; }
  }
  return best;
}
function seqFor(a, action) {
  if (a.kind === 'lion3d') {
    const pos = lion3d.pos(), px = pos.x * LION_SCALE, pz = pos.z * LION_SCALE;
    if (action === 'dance') return [{ type: 'anim', anim: 'dance', dur: lion3d.DUR.dance }];
    if (action === 'jump') return [{ type: 'anim', anim: 'jump', dur: lion3d.DUR.jump }];
    if (action === 'roar') return [{ type: 'anim', anim: 'roar', dur: lion3d.DUR.roar }];
    if (action === 'sit') return [{ type: 'anim', anim: 'sit', dur: 2.4 }];
    if (action === 'lie') return [{ type: 'anim', anim: 'lie', dur: 3.2 }];
    if (action === 'tree') {
      const tr = nearestTree({ position: { x: px, z: pz } });
      return [{ type: 'goto', to: { x: tr.x * 0.80, z: tr.z * 0.80 } },
              { type: 'anim', anim: 'roar', dur: lion3d.DUR.roar, tree: tr }];
    }
    if (action === 'come') return [{ type: 'goto', to: { x: (Math.random() - 0.5) * 1.6, z: 5.0 } },
                                    { type: 'anim', anim: 'jump', dur: lion3d.DUR.jump }];
    if (action === 'fountain') return [{ type: 'goto', to: { x: 2.9, z: 2.9 } },
                                       { type: 'anim', anim: 'jump', dur: lion3d.DUR.jump }];
    if (action === 'out') return [{ type: 'goto', to: { x: -3.4, z: 3.8 } },
                                  { type: 'anim', anim: 'lie', dur: 3.0 }];
    return [{ type: 'anim', anim: 'jump', dur: lion3d.DUR.jump }];
  }
  if (action === 'roar') return [{ type: 'jump', dur: 1.1 }];
  if (action === 'sit' || action === 'lie') return [{ type: 'dance', dur: 2.2 }];
  const o = a.obj, by = baseYOf(a.kind);
  if (action === 'dance') return [{ type: 'dance', dur: 2.6 }];
  if (action === 'jump') return [{ type: 'jump', dur: 1.1 }];
  if (action === 'tree') {
    const tr = nearestTree(o);
    return [moveStep(new THREE.Vector3(tr.x * 0.80, by, tr.z * 0.80), 1.5, 1.0),
            { type: 'shake', dur: 1.15, tree: tr },
            { type: 'jump', dur: 0.8 }];
  }
  if (action === 'come') return [moveStep(new THREE.Vector3((Math.random() - 0.5) * 1.6, by, 5.0), 1.4, 0.8),
                                 { type: 'dance', dur: 1.4 }];
  if (action === 'fountain') {
    if (a.kind === 'fish') return [moveStep(new THREE.Vector3(0, 2.3, 0), 1.1, 0.6),
                                   moveStep(new THREE.Vector3(0.4, 1.45, 0.3), 0.8, 0.2, () => { a.away = false; })];
    return [moveStep(new THREE.Vector3(2.9, by, 2.9), 1.3, 0.7), { type: 'jump', dur: 0.9 }];
  }
  if (action === 'out') {
    if (a.kind === 'fish') return [moveStep(new THREE.Vector3(2.6, 0.95, 3.4), 1.5, 1.1, () => { a.away = true; }),
                                   { type: 'dance', dur: 1.6 }];
    return seqFor(a, 'come');
  }
  return [{ type: 'jump', dur: 0.9 }];
}
function finishLionStep(a) { a.si++; if (a.si >= a.seq.length) a.seq = null; }
function updateLionActor(a, dt) {
  if (!a.seq) return;
  const s = a.seq[a.si];
  if (!s.begun) {
    s.begun = true; s.st = 0;
    if (s.type === 'goto') lion3d.goTo(s.to.x / LION_SCALE, s.to.z / LION_SCALE);
    if (s.type === 'anim') lion3d.play(s.anim);
  }
  s.st += dt;
  if (s.type === 'goto') {
    if (s.st > 0.4 && !lion3d.isWalking()) finishLionStep(a);
  } else {
    if (s.tree) {
      s.tree.g.rotation.z = Math.sin(s.st * 30) * 0.05 * Math.max(0, 1 - s.st / s.dur);
      if (!s.dropped && s.st > 0.5) { s.dropped = true; spawnFruits(s.tree.x, s.tree.z); }
    }
    if (s.st >= s.dur) { if (s.tree) s.tree.g.rotation.z = 0; finishLionStep(a); }
  }
}
function updateActors(dt, t) {
  if (lion3d.group.visible) lion3d.update(dt);
  for (const id in actors) {
    if (actors[id].kind === 'lion3d') { if (actors[id].obj.visible) updateLionActor(actors[id], dt); continue; }
    const a = actors[id], o = a.obj;
    if (!o.visible) continue;
    if (a.kind === 'walker') {
      lionShadow.visible = true;
      lionShadow.position.x = o.position.x; lionShadow.position.z = o.position.z;
    }
    if (!a.seq) {
      if (a.kind === 'fish' && !a.away) {
        a.homeA += dt * 0.45;
        o.position.set(Math.cos(a.homeA) * 2.1, 1.42 + Math.sin(t * 1.8) * 0.07, Math.sin(a.homeA) * 2.1);
        o.material.rotation = Math.sin(t * 2.2) * 0.08;
      } else if (a.kind === 'fish' && a.away) {
        o.material.rotation = Math.sin(t * 3.1) * 0.13;
      } else if (a.kind === 'walker') {
        o.position.y = 1.36 + Math.sin(t * 1.6 + 1) * 0.03;
      }
      continue;
    }
    const s = a.seq[a.si];
    if (!s.begun) { s.begun = true; s.y0 = o.position.y; a.from.copy(o.position); }
    a.st += dt;
    const p = Math.min(1, a.st / s.dur);
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    if (s.type === 'move') {
      o.position.lerpVectors(a.from, s.to, e);
      if (a.kind === 'fish') {
        o.position.y = THREE.MathUtils.lerp(a.from.y, s.to.y, e) + Math.sin(p * Math.PI) * (s.arc || 0.9);
        o.material.rotation = Math.sin(p * Math.PI) * 0.22;
      } else if (a.kind === 'walker') {
        o.position.y = 1.36 + Math.abs(Math.sin(p * 9)) * 0.10;
        o.material.rotation = Math.sin(p * 9) * 0.045;
      } else {
        o.position.y = 0.78 + Math.abs(Math.sin(p * 8)) * 0.12;
      }
    } else if (s.type === 'dance') {
      o.position.y = s.y0 + Math.abs(Math.sin(p * 9.4)) * 0.40;
      o.material.rotation = Math.sin(p * Math.PI * 4) * 0.33;
      if (a.kind === 'walker') {
        const q = Math.sin(p * Math.PI * 6) * 0.06;
        o.scale.set(1.85 * (1 + q), 2.72 * (1 - q), 1);
      }
    } else if (s.type === 'jump') {
      o.position.y = s.y0 + Math.abs(Math.sin(p * Math.PI * 2)) * 0.55;
    } else if (s.type === 'shake') {
      if (s.tree) s.tree.g.rotation.z = Math.sin(p * 34) * 0.05 * (1 - p);
      if (!s.dropped && p > 0.3) { s.dropped = true; if (s.tree) spawnFruits(s.tree.x, s.tree.z); }
      o.position.y = s.y0 + Math.abs(Math.sin(p * 12)) * 0.15;
    }
    if (p >= 1) {
      if (s.type === 'shake' && s.tree) s.tree.g.rotation.z = 0;
      o.material.rotation = 0;
      if (s.done) s.done();
      a.si++; a.st = 0;
      if (a.si >= a.seq.length) endSeq(a, t);
      else a.from.copy(o.position);
    }
  }
}

const SIGN_WORDS = [
  ['poissons', ['pisces', 'poisson', 'fish']], ['lion', ['leo', 'lion']],
  ['belier', ['aries', 'ram']], ['taureau', ['taurus', 'bull']],
  ['gemeaux', ['gemini', 'twins']], ['cancer', ['cancer', 'crab']],
  ['vierge', ['virgo']], ['balance', ['libra']],
  ['scorpion', ['scorpio', 'scorpion']], ['sagittaire', ['sagittarius', 'archer']],
  ['capricorne', ['capricorn', 'goat']], ['verseau', ['aquarius']],
];
const EN_NAME = { poissons: 'Pisces', lion: 'Leo', belier: 'Aries', taureau: 'Taurus', gemeaux: 'Gemini', cancer: 'Cancer', vierge: 'Virgo', balance: 'Libra', scorpion: 'Scorpio', sagittaire: 'Sagittarius', capricorne: 'Capricorn', verseau: 'Aquarius' };
function parseCommand(text) {
  const w = ' ' + String(text || '').toLowerCase().replace(/[^a-zàâäéèêëîïôöùûüç' -]/g, ' ') + ' ';
  const signs = [];
  for (const [id, words] of SIGN_WORDS)
    for (const word of words)
      if (w.indexOf(' ' + word + ' ') >= 0 || w.indexOf(' ' + word + ',') >= 0) { if (!signs.includes(id)) signs.push(id); break; }
  let action = null;
  if (/danc/.test(w)) action = 'dance';
  else if (/roar|rug|growl/.test(w)) action = 'roar';
  else if (/shake|fruit|apple|harvest/.test(w)) action = 'tree';
  else if (/tree/.test(w)) action = 'tree';
  else if (/jump|hop|bounce/.test(w)) action = 'jump';
  else if (/fountain|water|swim|back/.test(w)) action = 'fountain';
  else if (/out|grass|land|descend|down/.test(w)) action = 'out';
  else if (/\bsit\b|assis/.test(w)) action = 'sit';
  else if (/\blie\b|sleep|rest|couch/.test(w)) action = 'lie';
  else if (/come|here|hello/.test(w)) action = 'come';
  return { signs, action, all: /every|all |tous/.test(w) };
}
Object.assign(window.SANCTUARY, {
  command(text) {
    const parsed = parseCommand(text);
    const act = parsed.action || 'dance';
    let targets = parsed.signs.filter(id => collected.has(id) && actors[id]);
    if (!targets.length || parsed.all) targets = Object.keys(actors).filter(id => collected.has(id));
    window.__GARDEN_LAST__ = { text: String(text || ''), action: act, targets };
    if (!targets.length) return 'No sign lives here yet — scan a hoodie first!';
    for (const id of targets) startSeq(actors[id], seqFor(actors[id], act));
    const names = targets.map(id => EN_NAME[id]).join(' & ');
    const labels = { dance: 'dancing time!', jump: 'jumping!', tree: 'off to shake a tree!', come: 'coming to say hi!', fountain: 'heading to the fountain!', out: 'out exploring!', roar: 'ROAR!', sit: 'sitting pretty!', lie: 'lying down for a rest!' };
    return names + ' — ' + (labels[act] || 'playing!');
  },
});

/* ---------------- démarrage ---------------------------------------------- */
(function boot() {
  let ids = [], mem = 0;
  const qs = new URLSearchParams(location.search);
  const demoList = ['poissons', 'lion', 'sagittaire', 'belier', 'taureau', 'gemeaux', 'cancer', 'vierge', 'balance', 'scorpion', 'capricorne', 'verseau'];
  if (qs.has('count')) { ids = demoList.slice(0, Math.max(0, Math.min(12, +qs.get('count') || 0))); mem = ids.length; }
  else {
    try {
      const raw = JSON.parse(localStorage.getItem('astrocode_meta_collection_v1') || '[]');
      ids = raw.map(e => (typeof e === 'string' ? e : e.id));
      mem = JSON.parse(localStorage.getItem('astrocode_memories_v1') || '[]').length;
    } catch (e) {}
  }
  window.SANCTUARY.setCollected(ids, { memories: mem });
  ready = true;
  applyState(false);
  const sl = $('sl');
  if (sl) {
    sl.value = ids.length;
    sl.addEventListener('input', () => {
      const n = +sl.value;
      window.SANCTUARY.setCollected(demoList.slice(0, n), { memories: n });
    });
  }
  const b = $('boot'); if (b) b.style.opacity = 0;
  animate();
})();

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  frameCamera();
});
