/**
 * Page Buddy (GLB edition): an animated 3D character that roams the whole page.
 * Hover anything "standable" (nav links, buttons, headings, cards, your portrait,
 * the Get In Touch button...) and he hops / falls / super-jumps onto it.
 *
 *  - short moves  -> hop (Jump clip)
 *  - moving down  -> jump off, then cartoon-runs in mid-air while falling;
 *                    big drops = crash (Death clip), dizzy stars, gets back up
 *  - moving up    -> crouch + super jump with a front flip
 *  - off-screen   -> drops in from the sky
 *  - click him on an element -> dance
 *
 * ---- Model ----
 * 1st choice: your own complete fighter model at /assets/buddy.glb (the Iori chibi).
 *   Static models get procedural moves (tumble, pancake, spin, wiggle) + STATIC_PROFILE lines.
 * 2nd choice: "RobotExpressive" by Tomás Laulhé (CC0) from jsDelivr, dressed up as a fighter
 * at runtime in KOF-inspired outfits: Kyo, Iori, Terry (+ a dojo gi). Random
 * fighter on first visit, DOUBLE-CLICK the thing he's standing on to swap
 * (remembered in localStorage). Punches with colored fire/energy, POW bursts.
 * Falls back to the hand-built chibi (js/nav-buddy.js) if it can't load.
 * You can put another .glb first in MODEL_URLS (e.g. "/assets/buddy.glb").
 * Rigged models: clips are matched by name (see CLIP_NAMES).
 * Static models (no rig/animations) get procedural moves instead: bounce, spin,
 * tumble while falling, pancake on crash, wiggle dance.
 */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm";

const MODEL_URLS = [
  "/assets/buddy.glb?v=2", // your complete fighter model (Iori chibi) if uploaded
  "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/RobotExpressive/RobotExpressive.glb",
];

// Personality for complete static models (no rig), e.g. the Iori chibi
const STATIC_PROFILE = { label: "Iori \u{1F319}", fx: 0x9b4dff, lines: ["Yasakani!", "Ha ha ha!", "Die... I mean, hi"] };

// First matching name wins (substring match, case-insensitive)
const CLIP_NAMES = {
  idle: ["idle"],
  jump: ["jump"],
  fall: ["fall", "running", "run"],
  crash: ["death", "die", "hit", "fall"],
  getUp: ["standing", "getup", "get_up", "stand"],
  wave: ["wave"],
  cheer: ["thumbsup", "yes", "victory", "cheer"],
  dance: ["dance"],
  punch: ["punch", "attack", "kick"],
};

// Everything he can stand on
const PLATFORMS = [
  ".nav-links a",
  ".nav-actions .btn",
  ".hero-tagline",
  ".hero .btn",
  ".hero-image",
  "section h2",
  ".stat-item h3",
  ".card",
  ".card .btn",
  ".tag",
  ".contact-section .btn",
  ".contact-section a[target]",
].join(",");
const TEXT_PLATFORMS = ".nav-links a, section h2, .stat-item h3";

const CH = 34; // character height in CSS px
const BOX = 160; // size of the little canvas that follows him
const FEET_Y = 125; // where his feet sit inside that canvas

const desktop = window.matchMedia("(min-width: 769px) and (hover: hover)");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const firstLink = document.querySelector(".nav-links a");

const loadModel = (i) => {
  if (i >= MODEL_URLS.length) {
    console.warn("Page buddy: no model loaded, using the built-in chibi");
    import("/js/nav-buddy.js?v=2");
    return;
  }
  new GLTFLoader().load(
    MODEL_URLS[i],
    (gltf) => {
      try {
        init(gltf);
      } catch (e) {
        console.warn("Page buddy disabled:", e);
      }
    },
    undefined,
    () => loadModel(i + 1)
  );
};
if (firstLink) loadModel(0);

function init(gltf) {
  // ---------- Canvas that follows the character ----------
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: BOX + "px",
    height: BOX + "px",
    pointerEvents: "none",
    zIndex: "1001",
    willChange: "transform",
    // thin black outline around the silhouette, matches the brutalist borders
    filter:
      "drop-shadow(1px 0 0 #111) drop-shadow(-1px 0 0 #111) drop-shadow(0 1px 0 #111) drop-shadow(0 -1px 0 #111)",
  });
  document.body.appendChild(canvas);

  const bubble = document.createElement("div");
  bubble.setAttribute("aria-hidden", "true");
  Object.assign(bubble.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: "1002",
    pointerEvents: "none",
    background: "#fff",
    color: "#111",
    border: "2px solid #111",
    borderRadius: "8px",
    boxShadow: "2px 2px 0 #111",
    padding: "2px 8px",
    font: "700 12px Outfit, sans-serif",
    whiteSpace: "nowrap",
    opacity: "0",
    transition: "opacity .15s",
  });
  document.body.appendChild(bubble);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(BOX, BOX, false);

  const scene = new THREE.Scene();
  // 1 world unit = 1 CSS px, origin = his feet
  const camera = new THREE.OrthographicCamera(-BOX / 2, BOX / 2, FEET_Y, FEET_Y - BOX, -1000, 1000);
  camera.position.set(0, 0, 500);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.8));
  const sun = new THREE.DirectionalLight(0xffffff, 2.3);
  sun.position.set(-2, 3, 4);
  scene.add(sun);

  // ---------- Rig: root (feet, facing) > flip (mid-body pivot) > body (squash at feet) > model ----------
  const root = new THREE.Group();
  root.rotation.x = 0.1;
  scene.add(root);
  const flip = new THREE.Group();
  flip.position.y = CH / 2;
  root.add(flip);
  const body = new THREE.Group();
  body.position.y = -CH / 2;
  flip.add(body);

  const model = gltf.scene;
  model.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false; // skinned meshes can get culled wrongly
  });
  // measure from raw geometry bounds (skinned-mesh bounds can be wildly off before the first frame)
  model.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const tmpBox = new THREE.Box3();
  model.traverse((o) => {
    if (o.isMesh && o.geometry) {
      o.geometry.computeBoundingBox();
      tmpBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      box.union(tmpBox);
    }
  });
  const size = box.getSize(new THREE.Vector3());
  const s = size.y > 0 && isFinite(size.y) ? CH / size.y : 1;
  model.scale.setScalar(s);
  model.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
  body.add(model);
  model.updateMatrixWorld(true);

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ---------- Fighter outfits (KOF-inspired: Kyo / Iori / Terry, plus a dojo gi) ----------
  const bones = [];
  model.traverse((o) => { if (o.isBone) bones.push(o); });
  const depth = (b) => { let d = 0; for (let p = b.parent; p; p = p.parent) d++; return d; };
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  const findBone = (re) => bones.find((b) => re.test(b.name));
  const headB = bones.find((b) => /^head$/i.test(b.name)) || findBone(/head/i);
  const hipsB = findBone(/hips|pelvis/i);
  const waistB = findBone(/abdomen|spine|waist/i) || hipsB;
  const chestB = findBone(/torso|chest|spine2|upper/i) || waistB;
  const neckB = findBone(/neck/i) || headB;
  const waistY = waistB ? wp(waistB).y : CH * 0.45;
  const neckY = neckB ? wp(neckB).y : waistY + CH * 0.25;

  const tails = [];
  let outfit = STATIC_PROFILE;
  let nextOutfit = null;
  const DRESS_UP = gltf.animations.length > 0 && bones.length > 0; // only dress up the rigged robot
  if (DRESS_UP) {
  // Rest-pose vertex scan: world position + dominant bone for every vertex
  const torsoRe = /hips|pelvis|abdomen|spine|torso|chest|waist|body/i;
  const headRe = /head|neck|jaw|eye/i;
  const handRe = /hand|palm|finger|thumb|index|middle|ring|pinky|wrist/i;
  const foreRe = /lower.?arm|fore.?arm|elbow/i;
  const armRe = /arm|shoulder|clavicle/i;
  const torsoPts = [];
  const headPts = [];
  const dressable = []; // { mesh, region: Uint8Array, open: Uint8Array }
  {
    const v = new THREE.Vector3();
    model.traverse((o) => {
      if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
      const pos = o.geometry.attributes.position;
      const si = o.geometry.attributes.skinIndex;
      const sw = o.geometry.attributes.skinWeight;
      const hsl = {};
      o.material.color && o.material.color.getHSL(hsl);
      const dress = o.material.color && hsl.l > 0.12; // leave the black face screen / eyes alone
      const region = new Uint8Array(pos.count);
      const world = [];
      for (let i = 0; i < pos.count; i++) {
        const p = v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone();
        world.push(p);
        let name = "";
        if (o.isSkinnedMesh && si && sw) {
          const ids = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
          const ws = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
          let k = 0;
          for (let j = 1; j < 4; j++) if (ws[j] > ws[k]) k = j;
          const b = o.skeleton.bones[ids[k]];
          name = b ? b.name : "";
        }
        // 1 head, 2 hand, 3 upper arm, 4 forearm, 5 torso, 6 pants, 7 shoes
        let r;
        if (headRe.test(name)) r = 1;
        else if (handRe.test(name)) r = 2;
        else if (foreRe.test(name)) r = 4;
        else if (armRe.test(name)) r = 3;
        else if (p.y < CH * 0.07) r = 7;
        else if (p.y < waistY) r = 6;
        else r = 5;
        region[i] = r;
        if (r === 5 && torsoRe.test(name)) torsoPts.push(p);
        if (r === 1) headPts.push(p);
      }
      if (dress) dressable.push({ mesh: o, region, world });
    });
  }
  const slice = (src, y, tol) => {
    let n = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of src) {
      if (Math.abs(p.y - y) > tol) continue;
      n++;
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
    }
    return n < 6 ? null : { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2, front: z1 };
  };
  const tPts = torsoPts.length > 50 ? torsoPts : dressable.flatMap((d) => d.world.filter((p, i) => d.region[i] === 5));
  const sliceAt = (y) => slice(tPts, y, CH * 0.025) || slice(tPts, y, CH * 0.05) || slice(tPts, y, CH * 0.1);
  const ws = sliceAt(waistY);
  const topY = neckY - CH * 0.02;
  const cs = sliceAt(topY - CH * 0.03);

  // jacket opening (V down the chest) per vertex
  for (const d of dressable) {
    d.open = new Uint8Array(d.region.length);
    if (!ws || !cs) continue;
    d.world.forEach((p, i) => {
      if (d.region[i] !== 5) return;
      const t = clamp((p.y - waistY) / Math.max(1, topY - waistY), 0, 1);
      const halfW = cs.rx * (0.06 + 0.32 * t);
      if (p.z > ws.cz + ws.rz * 0.25 && Math.abs(p.x - cs.cx) < halfW) d.open[i] = 1;
    });
    d.world = null; // free memory
    const m = d.mesh.material.clone();
    m.color.set(0xffffff);
    m.vertexColors = true;
    m.metalness = Math.min(m.metalness ?? 0, 0.1);
    m.roughness = Math.max(m.roughness ?? 1, 0.6);
    d.mesh.material = m;
    d.mesh.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(d.region.length * 3), 3));
  }

  // head box for hair / headband / cap
  let hb = new THREE.Box3().setFromPoints(headPts);
  if (headPts.length < 10 && headB) {
    const hp = wp(headB);
    hb = new THREE.Box3(hp.clone().add(new THREE.Vector3(-CH * 0.18, 0, -CH * 0.18)), hp.clone().add(new THREE.Vector3(CH * 0.18, CH * 0.35, CH * 0.18)));
  }
  const hc = hb.getCenter(new THREE.Vector3());
  const hs = hb.getSize(new THREE.Vector3());
  const HR = { x: hs.x / 2, y: hs.y / 2, z: hs.z / 2 };
  const HAVG = (HR.x + HR.y + HR.z) / 3;

  // glove bones (one per side)
  const gloveSpots = [];
  {
    const hands = bones.filter((b) => /hand|palm|wrist|fist/i.test(b.name));
    const sides = [[], []];
    (hands.length ? hands : bones).forEach((b) => sides[wp(b).x > 0 ? 1 : 0].push(b));
    sides.forEach((list) => {
      if (!list.length) return;
      let bone;
      if (hands.length) bone = list.sort((a, b) => depth(a) - depth(b))[0];
      else {
        const far = list.sort((a, b) => Math.abs(wp(b).x) - Math.abs(wp(a).x))[0];
        bone = far.parent && far.parent.isBone ? far.parent : far;
      }
      const child = bone.children.find((c) => c.isBone);
      gloveSpots.push({ bone, pos: child ? wp(bone).lerp(wp(child), 0.6) : wp(bone) });
    });
  }

  const OUTFITS = {
    kyo: {
      label: "Kyo style \u{1F525}", top: 0x1c1f2b, inner: 0xf2f2f2, open: true, sleeve: 0x1c1f2b, forearm: 0x1c1f2b,
      pants: 0x1c1f2b, shoes: 0x2a2a2a, gloves: 0xd42a2a, headband: 0xf5f5f5,
      hair: { color: 0x4a2c1a, style: "spiky" }, fx: 0xff7a1a,
      lines: ["Burn!", "Orochinagi!", "Ora ora ora!"],
    },
    iori: {
      label: "Iori style \u{1F319}", top: 0x241a2e, inner: 0xf0f0f0, open: true, sleeve: 0x241a2e, forearm: 0x241a2e,
      pants: 0xa3122a, shoes: 0x1a1a1a, gloves: null, headband: null,
      hair: { color: 0xb3122a, style: "bangs" }, fx: 0x9b4dff,
      lines: ["Yasakani!", "Ha ha ha!", "Die... I mean, hi"],
    },
    terry: {
      label: "Terry style \u{1F9E2}", top: 0xc8202a, inner: 0xf5f5f5, open: true, sleeve: 0xf5f5f5, forearm: "skin",
      pants: 0x3a5fa0, shoes: 0xf5f5f5, gloves: 0x1b1b1b, headband: null,
      cap: { color: 0xd2232a, front: 0xf5f5f5 }, hair: { color: 0xe8c35a, style: "ponytail" }, fx: 0xffd84a,
      lines: ["Power Wave!", "Are you OK?!", "Burn Knuckle!"],
    },
    gi: {
      label: "Dojo style \u{1F94B}", top: 0xebe6da, inner: null, open: false, sleeve: 0xebe6da, forearm: 0xebe6da,
      pants: 0xebe6da, shoes: "skin", gloves: 0xe0262b, headband: 0xe0262b, belt: 0x151515, lapels: true,
      hair: { color: 0x1b1b1b, style: "short" }, fx: 0x4aa8ff,
      lines: ["Hadouken!", "Shoryuken!", "Hyah!"],
    },
  };
  const OUTFIT_ORDER = ["kyo", "iori", "terry", "gi"];
  const SKIN = 0xf1c4a1;

  let gear = [];
  const mat = (color, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough });
  const attachTo = (bone, obj) => {
    scene.add(obj);
    obj.updateMatrixWorld(true);
    (bone || model).attach(obj);
    gear.push(obj);
  };
  // ellipsoid dome over the head; tilt < 0 lifts the front edge (forehead shows)
  const dome = (color, k, tilt, cover) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 14, 0, Math.PI * 2, 0, Math.PI * cover), mat(color, 0.7));
    m.scale.set(HR.x * k, HR.y * k, HR.z * k);
    m.position.copy(hc);
    m.rotation.x = tilt;
    return m;
  };
  const onHead = (ux, uy, uz, k = 1) => new THREE.Vector3(hc.x + ux * HR.x * k, hc.y + uy * HR.y * k, hc.z + uz * HR.z * k);

  const buildHair = (h) => {
    const g = new THREE.Group();
    const hm = mat(h.color, 0.7);
    if (h.style === "short") g.add(dome(h.color, 1.06, -0.45, 0.5));
    if (h.style === "spiky") {
      g.add(dome(h.color, 1.07, -0.4, 0.52));
      for (let i = 0; i < 8; i++) {
        const az = (i / 8) * Math.PI * 2 + 0.3;
        const pol = 0.5 + (i % 2) * 0.25;
        const dir = new THREE.Vector3(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az));
        if (dir.z > 0.55) dir.y += 0.2; // spikes in front sweep up
        const spike = new THREE.Mesh(new THREE.ConeGeometry(HAVG * 0.28, HAVG * 0.75, 5), hm);
        spike.position.copy(onHead(dir.x, dir.y, dir.z, 1.0));
        spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        g.add(spike);
      }
    }
    if (h.style === "bangs") {
      g.add(dome(h.color, 1.07, -0.25, 0.56));
      const bang = new THREE.Mesh(new THREE.ConeGeometry(HAVG * 0.32, HAVG * 1.1, 5), hm);
      bang.position.copy(onHead(-0.25, 0.15, 1.02));
      bang.rotation.set(Math.PI + 0.25, 0, -0.35); // tip points down over one eye
      g.add(bang);
      for (const sx of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.ConeGeometry(HAVG * 0.22, HAVG * 0.9, 5), hm);
        side.position.copy(onHead(sx * 0.95, -0.15, 0.2));
        side.rotation.set(Math.PI, 0, sx * 0.15);
        g.add(side);
      }
    }
    if (h.style === "ponytail") {
      g.add(dome(h.color, 1.05, -0.3, 0.55));
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(HAVG * 0.16, HAVG * 0.9, 4, 8), hm);
      tail.position.copy(onHead(0, -0.35, -1.05));
      tail.rotation.x = 0.35;
      g.add(tail);
    }
    return g;
  };

  const buildCap = (cap) => {
    const g = new THREE.Group();
    g.add(dome(cap.color, 1.13, -0.12, 0.47));
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.08, 20, 1, false, -Math.PI / 2, Math.PI), mat(cap.color, 0.7));
    brim.scale.set(HR.x * 1.1, HAVG * 0.6, HR.z * 0.95);
    brim.position.copy(onHead(0, 0.22, 0.25));
    brim.rotation.x = 0.12;
    g.add(brim);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(HR.x * 0.75, HR.y * 0.38, HAVG * 0.05), mat(cap.front, 0.8));
    panel.position.copy(onHead(0, 0.58, 0.93, 1.1));
    panel.rotation.x = -0.55;
    g.add(panel);
    return g;
  };

  const buildHeadband = (color) => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2, 8, 28), mat(color, 0.55));
    band.rotation.x = Math.PI / 2;
    band.scale.set(HR.x * 1.1, HR.z * 1.1, (HR.x + HR.z) * 0.55);
    band.position.set(hc.x, hc.y + hs.y * 0.18, hc.z);
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.12, -1.02, 0);
      pivot.rotation.z = sx * 0.25;
      const tg = new THREE.BoxGeometry(0.3, 1.1, 0.08);
      tg.translate(0, -0.55, 0);
      pivot.add(new THREE.Mesh(tg, band.material));
      pivot.userData.side = sx;
      band.add(pivot);
      tails.push(pivot);
    }
    return band;
  };

  const buildBelt = (color) => {
    const bm = mat(color, 0.8);
    const belt = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 8, 32), bm);
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(ws.rx * 1.06, ws.rz * 1.06, (CH * 0.04) / 0.16);
    belt.add(ring);
    const fz = ws.cz + ws.rz * 1.06 + 0.4;
    const knot = new THREE.Mesh(new THREE.BoxGeometry(CH * 0.08, CH * 0.07, CH * 0.04), bm);
    knot.position.set(ws.cx, 0, fz);
    belt.add(knot);
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(CH * 0.045, CH * 0.17, CH * 0.02);
      g.translate(0, -CH * 0.085, 0);
      const end = new THREE.Mesh(g, bm);
      end.position.set(ws.cx + sx * CH * 0.015, -CH * 0.01, fz + 0.2);
      end.rotation.z = sx * 0.3;
      belt.add(end);
    }
    belt.position.set(0, waistY, 0);
    return belt;
  };

  const buildLapels = () => {
    const sm = mat(0xb3aa95, 0.9);
    const g = new THREE.Group();
    const bottom = new THREE.Vector3(ws.cx, waistY + CH * 0.03, ws.front + 0.35);
    for (const sx of [-1, 1]) {
      const top = new THREE.Vector3(cs.cx + sx * cs.rx * 0.45, topY, cs.front + 0.35);
      const dir = new THREE.Vector3().subVectors(top, bottom);
      const seam = new THREE.Mesh(new THREE.BoxGeometry(CH * 0.035, dir.length(), CH * 0.02), sm);
      seam.position.copy(bottom).addScaledVector(dir, 0.5);
      seam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      g.add(seam);
    }
    return g;
  };

  const applyOutfit = (key) => {
    const o = OUTFITS[key] || OUTFITS.kyo;
    outfit = o;
    // 1) clothes = vertex colors by body region
    const C = (hex) => new THREE.Color(hex === "skin" ? SKIN : hex);
    const pal = {
      1: C(SKIN),
      2: C(o.gloves ? o.gloves : SKIN),
      3: C(o.sleeve),
      4: C(o.forearm),
      5: C(o.top),
      6: C(o.pants),
      7: C(o.shoes),
    };
    const innerC = o.inner != null ? C(o.inner) : null;
    for (const d of dressable) {
      const col = d.mesh.geometry.attributes.color;
      for (let i = 0; i < d.region.length; i++) {
        const c = o.open && innerC && d.open[i] ? innerC : pal[d.region[i]] || pal[5];
        col.setXYZ(i, c.r, c.g, c.b);
      }
      col.needsUpdate = true;
    }
    // 2) gear: clear old, build new
    gear.forEach((g) => g.removeFromParent());
    gear = [];
    tails.length = 0;
    if (o.gloves) {
      for (const gs of gloveSpots) {
        const glove = new THREE.Mesh(new THREE.SphereGeometry(CH * 0.1, 16, 12), mat(o.gloves, 0.55));
        glove.position.copy(gs.pos);
        attachTo(gs.bone, glove);
      }
    }
    if (headB) {
      if (o.hair) attachTo(headB, buildHair(o.hair));
      if (o.cap) attachTo(headB, buildCap(o.cap));
      if (o.headband) attachTo(headB, buildHeadband(o.headband));
    }
    if (o.belt && ws) attachTo(waistB, buildBelt(o.belt));
    if (o.lapels && ws && cs && topY > waistY + CH * 0.05) attachTo(chestB, buildLapels());
    try { localStorage.setItem("buddyOutfit", key); } catch (e) {}
  };

  let outfitKey = null;
  try { outfitKey = localStorage.getItem("buddyOutfit"); } catch (e) {}
  if (!OUTFITS[outfitKey]) outfitKey = pick(["kyo", "iori", "terry"]); // random fighter on first visit
  applyOutfit(outfitKey);
  nextOutfit = () => {
    outfitKey = OUTFIT_ORDER[(OUTFIT_ORDER.indexOf(outfitKey) + 1) % OUTFIT_ORDER.length];
    applyOutfit(outfitKey);
    return OUTFITS[outfitKey];
  };
  } // end DRESS_UP

  // head bone (for looking at the cursor) + face morphs (expressions), if the model has them
  let headBone = null;
  let face = null;
  model.traverse((o) => {
    if (!headBone && o.isBone && /head/i.test(o.name)) headBone = o;
    if (!face && o.morphTargetDictionary && o.morphTargetInfluences) face = o;
  });
  const morph = (name, v) => {
    if (!face) return;
    const key = Object.keys(face.morphTargetDictionary).find((k) => k.toLowerCase() === name);
    if (key !== undefined) {
      const i = face.morphTargetDictionary[key];
      face.morphTargetInfluences[i] += (v - face.morphTargetInfluences[i]) * 0.25;
    }
  };

  // ---------- Animations ----------
  const mixer = new THREE.AnimationMixer(model);
  const clips = {};
  for (const [key, names] of Object.entries(CLIP_NAMES)) {
    for (const n of names) {
      const c = gltf.animations.find((a) => a.name.toLowerCase().includes(n));
      if (c) { clips[key] = c; break; }
    }
  }
  let current = null;
  let queue = [];
  const play = (name, opts) => {
    const o = Object.assign({ once: false, fade: 0.15, speed: 1 }, opts || {});
    const clip = clips[name];
    if (!clip) return null;
    const action = mixer.clipAction(clip);
    if (current === action && !o.once) return action;
    action.reset();
    action.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = o.once;
    action.timeScale = o.speed;
    action.setEffectiveWeight(1);
    if (current && current !== action) action.crossFadeFrom(current, o.fade, false);
    action.play();
    current = action;
    return action;
  };
  // one-shot sequence, then back to idle
  const playSeq = (names, speed) => {
    queue = names.slice(1).filter((n) => clips[n]);
    if (!play(names[0], { once: true, speed: speed || 1 })) {
      queue = [];
      play("idle");
    }
  };
  mixer.addEventListener("finished", (e) => {
    if (e.action !== current) return;
    if (queue.length) play(queue.shift(), { once: true, speed: 1.2 });
    else if (st.mode === "idle" || st.mode === "land") play("idle", { fade: 0.25 });
  });
  play("idle");

  // Dizzy stars after a big crash
  const stars = new THREE.Group();
  stars.position.set(0, CH + 4, 0);
  stars.rotation.x = 0.5;
  root.add(stars);
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffd400 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(3), starMat);
    m.position.set(Math.cos(a) * 11, 0, Math.sin(a) * 11);
    stars.add(m);
  }
  stars.visible = false;

  // ---------- Helpers ----------
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  const rectOf = (el) => {
    if (el.matches("section h2, .stat-item h3")) {
      const r = document.createRange(); // hug the text, not the full-width block
      r.selectNodeContents(el);
      const rr = r.getBoundingClientRect();
      if (rr.width) return rr;
    }
    return el.getBoundingClientRect();
  };

  const mouse = { x: null, y: null };
  window.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });

  const puff = (x, y, n, power) => {
    for (let i = 0; i < n; i++) {
      const d = document.createElement("div");
      const sz = 5 + Math.random() * 5 * power;
      Object.assign(d.style, {
        position: "fixed", left: x + "px", top: y + "px", width: sz + "px", height: sz + "px",
        borderRadius: "50%", background: "#fff", border: "2px solid #111",
        pointerEvents: "none", zIndex: "1000",
      });
      document.body.appendChild(d);
      const vx = (i % 2 ? 1 : -1) * (10 + Math.random() * 22 * power);
      const vy = -(3 + Math.random() * 12 * power);
      d.animate(
        [
          { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
          { transform: `translate(calc(-50% + ${vx}px), calc(-50% + ${vy}px)) scale(0.2)`, opacity: 0 },
        ],
        { duration: 380 + Math.random() * 220, easing: "cubic-bezier(.2,.7,.3,1)" }
      ).onfinish = () => d.remove();
    }
  };

  // comic "POW!" burst + make the element flinch
  const pow = (x, y, el) => {
    const d = document.createElement("div");
    d.textContent = pick(["POW!", "BAM!", "WHAM!", "K.O.!"]);
    Object.assign(d.style, {
      position: "fixed", left: x + "px", top: y + "px", zIndex: "1002", pointerEvents: "none",
      background: "#" + new THREE.Color(outfit.fx).getHexString(), color: "#111", border: "2px solid #111", borderRadius: "6px",
      boxShadow: "2px 2px 0 #111", padding: "1px 6px", font: "900 13px Outfit, sans-serif",
      letterSpacing: "0.03em", whiteSpace: "nowrap",
    });
    document.body.appendChild(d);
    const rot = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8);
    d.animate(
      [
        { transform: `translate(-50%, -100%) rotate(${rot}deg) scale(0.3)`, opacity: 0 },
        { transform: `translate(-50%, -140%) rotate(${rot}deg) scale(1.15)`, opacity: 1, offset: 0.25 },
        { transform: `translate(-50%, -170%) rotate(${rot}deg) scale(1)`, opacity: 0 },
      ],
      { duration: 700, easing: "ease-out" }
    ).onfinish = () => d.remove();
    // fire / energy sparks in the fighter's color
    const fx = "#" + new THREE.Color(outfit.fx).getHexString();
    for (let i = 0; i < 7; i++) {
      const f = document.createElement("div");
      const sz = 3 + Math.random() * 4;
      Object.assign(f.style, {
        position: "fixed", left: x + "px", top: y + "px", width: sz + "px", height: sz + "px",
        borderRadius: "50%", background: fx, boxShadow: `0 0 6px ${fx}`, pointerEvents: "none", zIndex: "1002",
      });
      document.body.appendChild(f);
      const a = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 16;
      f.animate(
        [
          { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * dist}px), calc(-50% + ${Math.sin(a) * dist - 10}px)) scale(0.2)`, opacity: 0 },
        ],
        { duration: 420 + Math.random() * 200, easing: "ease-out" }
      ).onfinish = () => f.remove();
    }
    if (el && el.animate) {
      el.animate(
        [
          { transform: "translate(0, 0)" },
          { transform: "translate(3px, 2px)" },
          { transform: "translate(-3px, -1px)" },
          { transform: "translate(2px, 1px)" },
          { transform: "translate(0, 0)" },
        ],
        { duration: 220, composite: "add" }
      );
    }
  };

  let bubbleT = 0;
  let bubbleW = 0;
  const say = (text, dur = 1.5) => {
    bubble.textContent = text;
    bubbleW = bubble.offsetWidth;
    bubble.style.opacity = "1";
    bubbleT = dur;
  };

  // ---------- Movement state ----------
  const st = {
    el: null, frac: 0.5, offset: 0,
    mode: "idle", type: "hop",
    sx: 0, sy: -80,
    sPage: { x: 0, y: 0 },
    t: 0, T: 0.3, t1: 0.15, g: 1600, fallH: 0,
    chargeT: 0, chargeDur: 0.07,
    landT: 0, landDur: 0.16, landSquash: 0.2, crash: false,
    dir: 1, squash: 0, dizzy: 0, wasPanic: false,
    proc: null, procT: 0, procDur: 0, pancake: false,
    introDone: false, idleT: 0, nextShadowbox: 8,
  };
  const rigged = gltf.animations.length > 0;
  // procedural moves for static models (or rigged ones missing a clip)
  const doProc = (name, dur) => { st.proc = name; st.procT = 0; st.procDur = dur; };
  let powTimer = 0;
  const punch = (withPow) => {
    if (clips.punch) playSeq(["punch"], 1.3);
    else doProc("bounce", 0.5);
    clearTimeout(powTimer);
    if (withPow) {
      const el = st.el;
      powTimer = setTimeout(() => { if (st.el === el && st.mode !== "air") pow(st.sx + st.dir * 8, st.sy - CH * 0.6, el); }, 260);
    }
  };

  const anchor = () => {
    const r = rectOf(st.el);
    return { x: r.left + r.width * st.frac, y: r.top + st.offset };
  };

  const goTo = (el, force) => {
    if (!el) return;
    if (el === st.el && st.mode === "idle" && !force) return;
    st.el = el;
    const r = rectOf(el);
    st.frac = r.width > 140 && mouse.x !== null ? clamp((mouse.x - r.left) / r.width, 0.12, 0.88) : 0.5;
    st.offset = el.matches(TEXT_PLATFORMS) ? parseFloat(getComputedStyle(el).fontSize) * 0.2 : 0;

    const e = anchor();
    let sx = st.sx;
    let sy = st.sy;
    const vh = window.innerHeight;
    if (sy < -CH * 2) {
      sy = -CH * 2; // way above the screen: drop in from the sky
      sx = e.x + (Math.random() < 0.5 ? -1 : 1) * 40;
    } else if (sy > vh + CH) {
      sy = vh + CH; // way below: launch up from the bottom
    }
    st.sx = sx;
    st.sy = sy;
    st.sPage = { x: sx + window.scrollX, y: sy + window.scrollY };

    const dx = e.x - sx;
    const dy = e.y - sy;
    if (Math.abs(dx) > 2) st.dir = Math.sign(dx);

    if (reduceMotion) { st.mode = "idle"; return; }

    let rise;
    if (Math.abs(dy) < 40 && Math.abs(dx) < 300) {
      st.type = "hop"; st.g = 1600; rise = 8 + Math.abs(dx) * 0.06;
      rise = Math.max(4, Math.min(rise, Math.min(sy, e.y) - CH - 2));
    } else if (dy > 0) {
      st.type = "fall"; st.g = 2200; rise = 28;
    } else {
      st.type = "super"; st.g = 2600; rise = 45;
    }
    const apexY = Math.min(sy, e.y) - rise;
    st.t1 = Math.sqrt((2 * Math.max(0, sy - apexY)) / st.g);
    const t2 = Math.sqrt((2 * Math.max(0, e.y - apexY)) / st.g);
    st.T = Math.max(0.2, st.t1 + t2);
    st.fallH = e.y - apexY;
    st.t = 0;
    st.wasPanic = false;
    const inAir = st.mode === "air";
    st.mode = inAir ? "air" : "charge";
    st.chargeT = 0;
    st.chargeDur = st.type === "super" ? 0.24 : 0.07;
    queue = [];
    st.proc = null;

    // fit the jump clip to the airtime
    if (clips.jump) {
      const total = (inAir ? 0 : st.chargeDur) + (st.type === "fall" ? st.t1 + 0.1 : st.T) + 0.15;
      play("jump", { once: true, speed: clamp(clips.jump.duration / total, 0.6, 2.5), fade: 0.08 });
    }
  };

  const land = () => {
    st.mode = "land";
    st.landT = 0;
    st.crash = false;
    st.pancake = false;
    const e = anchor();
    st.sx = e.x;
    st.sy = e.y;
    const el = st.el;

    if (st.type === "fall" && st.fallH > 320) {
      st.crash = true;
      st.landSquash = 0.3;
      st.landDur = 0.25;
      st.dizzy = 2;
      puff(e.x, e.y, 9, 1.7);
      if (clips.crash) playSeq(["crash", "getUp"], 1.6);
      else { st.pancake = true; st.landDur = 0.7; st.landSquash = 0.55; }
      say(pick(["K.O.!", "I'm okay!", "Not like this...", "10/10 landing"]), 1.8);
      st.introDone = true;
      return;
    }

    st.landSquash = st.type === "fall" ? 0.3 : st.type === "super" ? 0.22 : 0.15;
    st.landDur = st.type === "hop" ? 0.16 : 0.25;
    if (st.type !== "hop") puff(e.x, e.y, st.type === "fall" ? 5 : 4, 1);

    const gesture = (clip, proc, dur) => (clips[clip] ? playSeq([clip]) : doProc(proc, dur));
    if (!st.introDone) { st.introDone = true; play("idle"); say(outfit.label.split(" ")[0] + " enters! FIGHT!", 1.8); }
    else if (el.matches(".contact-section .btn")) { punch(true); say("New challenger? Say hi! \u{1F44A}", 2.2); }
    else if (el.matches(".hero-image")) { gesture("cheer", "spin", 0.6); say("That's me!"); }
    else if (el.matches(".nav-actions .btn")) { punch(true); say("Let's talk!"); }
    else if (el.matches(".btn, .tag, .contact-section a")) {
      punch(true);
      if (Math.random() < 0.4) say(pick(outfit.lines), 1.1);
    }
    else if (st.type === "super") {
      gesture("cheer", "spin", 0.6);
      if (Math.random() < 0.6) say(pick(outfit.lines.concat(["Too easy"])), 1.1);
    } else play("idle", { fade: 0.2 });
  };

  // ---------- Hover / click ----------
  let pending = null;
  let pendingTimer = 0;
  document.addEventListener("mouseover", (e) => {
    if (!desktop.matches) return;
    const el = e.target.closest ? e.target.closest(PLATFORMS) : null;
    if (!el || el === pending) return;
    pending = el;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => goTo(pending), 110);
  });
  document.addEventListener("click", (e) => {
    const el = e.target.closest ? e.target.closest(PLATFORMS) : null;
    if (el && el === st.el && st.mode === "idle") {
      if (clips.dance || !rigged) { if (clips.dance) playSeq(["dance"]); else doProc("dance", 1.6); if (Math.random() < 0.4) say(pick(["\u{1F57A}", "Party!", "Hire me, I dance too"]), 1.3); }
      else goTo(el, true);
    }
  });

  // Double-click the thing he's standing on: costume change!
  document.addEventListener("dblclick", (e) => {
    const el = e.target.closest ? e.target.closest(PLATFORMS) : null;
    if (!nextOutfit || !el || el !== st.el || st.mode === "air") return;
    const o = nextOutfit();
    puff(st.sx, st.sy - CH * 0.5, 10, 1.4);
    doProc("spin", 0.5);
    say(o.label, 1.6);
  });

  // Intro: drop in from the sky onto the first nav link
  const startIntro = () => {
    st.el = null;
    st.mode = "idle";
    const r = firstLink.getBoundingClientRect();
    st.sx = r.left + r.width / 2;
    st.sy = -CH * 2;
    goTo(firstLink);
  };
  const applyVisibility = () => {
    const on = desktop.matches;
    canvas.style.display = on ? "block" : "none";
    bubble.style.display = on ? "block" : "none";
    if (on && !st.el) startIntro();
  };
  applyVisibility();
  if (desktop.addEventListener) desktop.addEventListener("change", applyVisibility);

  // ---------- Loop ----------
  const look = { x: 0, y: 0 };
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    const time = clock.elapsedTime;
    if (!desktop.matches || !st.el) return;

    let squashTarget = 0;
    let panic = false;
    let shakeX = 0;
    flip.rotation.x = 0;

    switch (st.mode) {
      case "charge":
        st.chargeT += dt;
        squashTarget = st.type === "super" ? 0.22 : 0.1;
        if (st.type === "super") shakeX = Math.sin(time * 90) * 0.8;
        if (st.chargeT >= st.chargeDur) st.mode = "air";
        break;
      case "air": {
        st.t += dt;
        const u = Math.min(1, st.t / st.T);
        const t = Math.min(st.t, st.T);
        const sPt = { x: st.sPage.x - window.scrollX, y: st.sPage.y - window.scrollY };
        const e = anchor();
        const vy0 = (e.y - sPt.y - 0.5 * st.g * st.T * st.T) / st.T;
        st.sx = sPt.x + (e.x - sPt.x) * u;
        st.sy = sPt.y + vy0 * t + 0.5 * st.g * t * t;
        if (st.type === "super") {
          squashTarget = -0.06;
          flip.rotation.x = Math.PI * 2 * easeInOut(u); // front flip
        } else if (st.type === "fall") {
          panic = st.t > st.t1;
          if (panic && !st.wasPanic) {
            st.wasPanic = true;
            play("fall", { speed: 1.8, fade: 0.1 }); // cartoon running in mid-air
          }
          squashTarget = panic ? -0.06 : -0.03;
        } else {
          squashTarget = -0.04 * Math.sin(Math.PI * u);
        }
        if (u >= 1) land();
        break;
      }
      case "land": {
        st.landT += dt;
        const p = Math.min(1, st.landT / st.landDur);
        if (st.pancake) {
          // flattened like a pancake, then pops back up with a little overshoot
          squashTarget = p < 0.55 ? st.landSquash : st.landSquash * (1 - (p - 0.55) / 0.45) - 0.12 * Math.sin((Math.PI * (p - 0.55)) / 0.45);
        } else squashTarget = st.landSquash * (1 - p);
        const e = anchor();
        st.sx = e.x;
        st.sy = e.y;
        if (p >= 1) st.mode = "idle";
        break;
      }
      default: {
        const e = anchor(); // stick to the element (follows scroll / hover lifts)
        st.sx = e.x;
        st.sy = e.y;
      }
    }

    // undo last frame's look-at offset (in case the clip doesn't drive the head), then animate
    if (headBone) {
      headBone.rotation.y -= look.y;
      headBone.rotation.x -= look.x;
    }
    mixer.update(dt);

    // procedural moves (static models): bounce / spin / dance, tumble while falling, idle sway
    let bounceY = 0;
    let extraYaw = 0;
    let wiggle = 0;
    if (st.proc) {
      st.procT += dt;
      const k = Math.min(1, st.procT / st.procDur);
      if (st.proc === "bounce") bounceY = Math.abs(Math.sin(k * Math.PI * 2)) * 7;
      if (st.proc === "spin") { extraYaw = Math.PI * 2 * easeInOut(k); bounceY = Math.sin(k * Math.PI) * 6; }
      if (st.proc === "dance") {
        bounceY = Math.abs(Math.sin(st.procT * 12)) * 4;
        wiggle = Math.sin(st.procT * 12) * 0.25;
        extraYaw = Math.sin(st.procT * 6) * 0.8;
      }
      if (k >= 1) st.proc = null;
    }
    if (!rigged) {
      if (panic) {
        flip.rotation.x = Math.sin(time * 15) * 0.5; // tumbling
        extraYaw += time * 14;
      } else if (st.mode === "idle" && !reduceMotion && !st.proc) {
        wiggle += Math.sin(time * 2) * 0.04; // gentle sway
      }
    }
    body.position.y = -CH / 2 + bounceY;

    const breath = !rigged && st.mode === "idle" && !reduceMotion ? Math.sin(time * 2.6) * 0.02 : 0;
    st.squash += (squashTarget - st.squash) * Math.min(1, dt * 30);
    body.scale.set(1 + st.squash * 0.6, 1 - st.squash + breath, 1 + st.squash * 0.6);

    // Facing: sideways while moving, turned toward the cursor when chilling, panicking at the camera when falling
    const airborne = st.mode === "charge" || st.mode === "air";
    const dx = mouse.x === null ? 0 : mouse.x - st.sx;
    let yawTarget = clamp(dx / 400, -0.6, 0.6);
    if (airborne) yawTarget = panic ? 0 : st.dir * (Math.PI / 2) * 0.85;
    root.rotation.y += (yawTarget - root.rotation.y) * Math.min(1, dt * 12);
    root.rotation.z = (panic ? Math.sin(time * 12) * 0.15 : 0) + wiggle;
    model.rotation.y = extraYaw; // procedural spins on top of facing

    // Look at the cursor (added on top of the animation)
    if (headBone) {
      const wantY = !airborne && !st.crash ? clamp(dx / 300, -0.5, 0.5) : 0;
      const wantX = !airborne && !st.crash && mouse.y !== null ? clamp((mouse.y - (st.sy - CH * 0.8)) / 600, -0.1, 0.3) : 0;
      look.y += (wantY - look.y) * Math.min(1, dt * 10);
      look.x += (wantX - look.x) * Math.min(1, dt * 10);
      headBone.rotation.y += look.y;
      headBone.rotation.x += look.x;
    }

    // Shadowboxing when he's been chilling for a while
    if (st.mode === "idle" && !st.proc && !queue.length && (!clips.idle || (current && current.getClip() === clips.idle))) {
      st.idleT += dt;
      if (st.idleT > st.nextShadowbox) {
        st.idleT = 0;
        st.nextShadowbox = 7 + Math.random() * 6;
        punch(false);
        if (Math.random() < 0.35) say(pick(outfit.lines.concat(["Fight me", "Bring it"])), 1);
      }
    } else if (st.mode !== "idle") st.idleT = 0;

    // Headband tails flutter (stream back while flying)
    for (const tl of tails) {
      const base = airborne ? -0.25 : -0.95;
      const flap = Math.sin(time * (airborne ? 22 : 7) + tl.userData.side) * (airborne ? 0.35 : 0.15);
      tl.rotation.x += (base + flap - tl.rotation.x) * Math.min(1, dt * 12);
    }

    // Expressions (RobotExpressive has Surprised / Sad / Angry)
    morph("angry", current && clips.punch && current.getClip() === clips.punch ? 1 : 0);
    morph("surprised", panic ? 1 : 0);
    morph("sad", st.dizzy > 0 ? 1 : 0);

    st.dizzy = Math.max(0, st.dizzy - dt);
    if (st.dizzy <= 0) st.crash = false;
    stars.visible = st.dizzy > 0;
    if (stars.visible) stars.rotation.y += dt * 7;

    canvas.style.transform = `translate3d(${st.sx + shakeX - BOX / 2}px, ${st.sy - FEET_Y}px, 0)`;

    if (bubbleT > 0) {
      bubbleT -= dt;
      if (bubbleT <= 0) bubble.style.opacity = "0";
      let bx = st.sx - bubbleW / 2;
      let by = st.sy - CH - 30;
      if (by < 4) { bx = st.sx + 22; by = st.sy - CH * 0.8; } // no room above (nav): put it to the side
      bubble.style.transform = `translate(${bx}px, ${by}px)`;
    }

    const vh = window.innerHeight;
    const vw = window.innerWidth;
    if (st.sy < -40 || st.sy > vh + BOX || st.sx < -BOX || st.sx > vw + BOX) return;
    renderer.render(scene, camera);
  });
}
