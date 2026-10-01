/**
 * Page Buddy: a tiny 3D chibi (Three.js, built from primitives) that roams the
 * whole page. Hover anything "standable" (nav links, buttons, headings, cards,
 * your portrait, the Get In Touch button...) and he hops / falls / super-jumps
 * onto it.
 *
 *  - short moves   -> hop
 *  - moving down   -> jump off + fall with flailing arms, crash landing (dizzy if it's a big drop)
 *  - moving up     -> crouch, super jump with a front flip
 *  - target off-screen start -> he drops in from the sky
 *
 * Desktop only for now (needs hover).
 */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

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

const CH = 32; // character height in CSS px
const BOX = 160; // size of the little canvas that follows him
const FEET_Y = 130; // where his feet sit inside that canvas

try {
  init();
} catch (e) {
  console.warn("Page buddy disabled:", e);
}

function init() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const desktop = window.matchMedia("(min-width: 769px) and (hover: hover)");
  const firstLink = document.querySelector(".nav-links a");
  if (!firstLink) return;

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

  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(-2, 3, 4);
  scene.add(sun);

  // ---------- Materials ----------
  const grad = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  grad.minFilter = THREE.NearestFilter;
  grad.magFilter = THREE.NearestFilter;
  grad.needsUpdate = true;
  const toon = (color, extra) =>
    new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: grad }, extra || {}));

  const M = {
    skin: toon(0xf1c4a1),
    hair: toon(0x171717),
    hoodie: toon(0x2d5bff), // site accent blue
    pants: toon(0x1f1f1f),
    shoe: toon(0xffffff),
    beard: toon(0x2b211c, { transparent: true, opacity: 0.85 }),
    eye: new THREE.MeshBasicMaterial({ color: 0x111111 }),
    white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    mouth: new THREE.MeshBasicMaterial({ color: 0x3b1f1f }),
    blush: new THREE.MeshBasicMaterial({ color: 0xff8fa3, transparent: true, opacity: 0.55 }),
    star: new THREE.MeshBasicMaterial({ color: 0xffd400 }),
  };
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });

  // ---------- Geometry helpers (each returns [geo, outlineGeo]) ----------
  const T = 0.045;
  const sph = (r, ws = 20, hs = 14, thS = 0, thL = Math.PI) => [
    new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, thS, thL),
    new THREE.SphereGeometry(r + T, ws, hs, 0, Math.PI * 2, thS, thL),
  ];
  const cap = (r, len) => [
    new THREE.CapsuleGeometry(r, len, 6, 12),
    new THREE.CapsuleGeometry(r + T, len, 6, 12),
  ];
  const part = (parent, geos, material, opts) => {
    const o = Object.assign({ p: [0, 0, 0], s: [1, 1, 1], r: [0, 0, 0], outline: true }, opts || {});
    const mesh = new THREE.Mesh(geos[0], material);
    mesh.position.set(o.p[0], o.p[1], o.p[2]);
    mesh.scale.set(o.s[0], o.s[1], o.s[2]);
    mesh.rotation.set(o.r[0], o.r[1], o.r[2]);
    if (o.outline) mesh.add(new THREE.Mesh(geos[1], outlineMat));
    parent.add(mesh);
    return mesh;
  };

  // ---------- Build the chibi (feet at y = 0, ~1.84 units tall) ----------
  const MODEL_H = 1.84;
  const root = new THREE.Group(); // at the feet, handles facing
  root.rotation.x = 0.1;
  root.scale.setScalar(CH / MODEL_H);
  scene.add(root);
  const flip = new THREE.Group(); // pivots at mid-body for flips
  flip.position.y = 0.9;
  root.add(flip);
  const body = new THREE.Group(); // squash & stretch pivots at the feet
  body.position.y = -0.9;
  flip.add(body);

  const legs = [-1, 1].map((sx) => {
    const hip = new THREE.Group();
    hip.position.set(0.13 * sx, 0.34, 0);
    hip.userData.side = sx;
    body.add(hip);
    part(hip, cap(0.11, 0.12), M.pants, { p: [0, -0.14, 0] });
    part(hip, sph(0.13), M.shoe, { p: [0, -0.27, 0.05], s: [1, 0.62, 1.35] });
    return hip;
  });

  part(body, cap(0.27, 0.2), M.hoodie, { p: [0, 0.55, 0], s: [1, 1, 0.85] });
  for (const sx of [-1, 1]) {
    part(body, cap(0.018, 0.1), M.white, { p: [0.07 * sx, 0.66, 0.235], outline: false });
  }

  const arms = [-1, 1].map((sx) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.27 * sx, 0.74, 0);
    pivot.userData.side = sx;
    body.add(pivot);
    part(pivot, cap(0.085, 0.16), M.hoodie, { p: [0, -0.15, 0] });
    part(pivot, sph(0.09), M.skin, { p: [0, -0.31, 0] });
    return pivot;
  });

  const head = new THREE.Group();
  head.position.set(0, 1.16, 0);
  body.add(head);
  part(head, sph(0.52, 28, 20), M.skin, { s: [1.06, 0.95, 1] });
  part(head, sph(0.53, 28, 12, Math.PI * 0.7, Math.PI * 0.3), M.beard, { s: [1.06, 0.95, 1], outline: false });
  part(head, sph(0.555, 28, 16, 0, Math.PI * 0.52), M.hair, { p: [0, 0.03, -0.03], r: [-0.42, 0, 0], s: [1.06, 1, 1] });
  part(head, sph(0.24), M.hair, { p: [0.02, 0.5, 0.16], s: [1.5, 0.75, 1.05], r: [-0.5, 0, 0.12] });
  part(head, sph(0.17), M.hair, { p: [0.2, 0.44, 0.26], s: [1.2, 0.7, 1], r: [-0.6, 0, -0.3] });
  part(head, sph(0.15), M.hair, { p: [-0.2, 0.47, 0.2], s: [1.2, 0.7, 1], r: [-0.5, 0, 0.3] });
  for (const sx of [-1, 1]) {
    part(head, sph(0.1, 12, 8), M.skin, { p: [0.54 * sx, -0.06, 0], s: [0.6, 1, 0.8] });
  }

  const eyes = [-1, 1].map((sx) => {
    const g = new THREE.Group();
    g.position.set(0.19 * sx, -0.05, 0.47);
    head.add(g);
    part(g, sph(0.075, 16, 12), M.eye, { s: [1, 1.35, 0.6], outline: false });
    part(g, sph(0.026, 8, 6), M.white, { p: [0.025, 0.04, 0.04], outline: false });
    return g;
  });
  for (const sx of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.04, 0.03), M.eye);
    brow.position.set(0.2 * sx, 0.11, 0.475);
    brow.rotation.z = -0.12 * sx;
    head.add(brow);
    part(head, sph(0.07, 12, 8), M.blush, { p: [0.31 * sx, -0.17, 0.39], s: [1.3, 0.6, 0.3], outline: false });
  }
  const smirk = part(head, cap(0.016, 0.07), M.mouth, { p: [0.04, -0.23, 0.455], r: [0, 0, Math.PI / 2 + 0.2], outline: false });
  const mouthO = part(head, sph(0.055, 12, 8), M.mouth, { p: [0, -0.24, 0.45], s: [1, 1.25, 0.35], outline: false });
  mouthO.visible = false;

  // Dizzy stars after a big crash
  const stars = new THREE.Group();
  stars.position.set(0, 1.95, 0);
  stars.rotation.x = 0.5;
  root.add(stars);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), M.star);
    s.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.15), outlineMat));
    s.position.set(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6);
    stars.add(s);
  }
  stars.visible = false;

  // ---------- Helpers ----------
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const rectOf = (el) => {
    if (el.matches("section h2, .stat-item h3")) {
      // hug the actual text, not the full-width block
      const r = document.createRange();
      r.selectNodeContents(el);
      const rr = r.getBoundingClientRect();
      if (rr.width) return rr;
    }
    return el.getBoundingClientRect();
  };

  const mouse = { x: null, y: null };
  window.addEventListener(
    "mousemove",
    (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    },
    { passive: true }
  );

  const puff = (x, y, n, power) => {
    for (let i = 0; i < n; i++) {
      const d = document.createElement("div");
      const size = 5 + Math.random() * 5 * power;
      Object.assign(d.style, {
        position: "fixed",
        left: x + "px",
        top: y + "px",
        width: size + "px",
        height: size + "px",
        borderRadius: "50%",
        background: "#fff",
        border: "2px solid #111",
        pointerEvents: "none",
        zIndex: "1000",
      });
      document.body.appendChild(d);
      const side = i % 2 ? 1 : -1;
      const vx = side * (10 + Math.random() * 22 * power);
      const vy = -(3 + Math.random() * 12 * power);
      const anim = d.animate(
        [
          { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
          { transform: `translate(calc(-50% + ${vx}px), calc(-50% + ${vy}px)) scale(0.2)`, opacity: 0 },
        ],
        { duration: 380 + Math.random() * 220, easing: "cubic-bezier(.2,.7,.3,1)" }
      );
      anim.onfinish = () => d.remove();
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

  // ---------- State ----------
  const st = {
    el: null, frac: 0.5, offset: 0,
    mode: "idle", type: "hop",
    sx: 0, sy: -80, // current screen position of his feet
    sPage: { x: 0, y: 0 }, // jump start, in page coords (scroll-proof)
    t: 0, T: 0.3, t1: 0.15, g: 1600, fallH: 0,
    chargeT: 0, chargeDur: 0.07,
    landT: 0, landDur: 0.16, landSquash: 0.2, splat: false,
    dir: 1, squash: 0, armLift: 0, dizzy: 0, tada: 0,
    nextBlink: 2.5, blinkT: -1,
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
    // wide things: land where the cursor is; small things: land in the middle
    st.frac = r.width > 140 && mouse.x !== null ? clamp((mouse.x - r.left) / r.width, 0.12, 0.88) : 0.5;
    st.offset = el.matches(TEXT_PLATFORMS) ? parseFloat(getComputedStyle(el).fontSize) * 0.2 : 0;

    const e = anchor();
    let sx = st.sx;
    let sy = st.sy;
    const vh = window.innerHeight;
    if (sy < -CH * 2) {
      sy = -CH * 2; // was way above the screen: drop in from the sky
      sx = e.x + (Math.random() < 0.5 ? -1 : 1) * 40;
    } else if (sy > vh + CH) {
      sy = vh + CH; // was way below: launch up from the bottom
    }
    st.sx = sx;
    st.sy = sy;
    st.sPage = { x: sx + window.scrollX, y: sy + window.scrollY };

    const dx = e.x - sx;
    const dy = e.y - sy;
    if (Math.abs(dx) > 2) st.dir = Math.sign(dx);

    if (reduceMotion) {
      st.mode = "idle";
      return;
    }

    let rise;
    if (Math.abs(dy) < 40 && Math.abs(dx) < 300) {
      st.type = "hop"; st.g = 1600; rise = 8 + Math.abs(dx) * 0.06;
      rise = Math.max(4, Math.min(rise, Math.min(sy, e.y) - CH - 2)); // keep head on screen near the top
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
    st.mode = st.mode === "air" ? "air" : "charge";
    st.chargeT = 0;
    st.chargeDur = st.type === "super" ? 0.24 : 0.07;
  };

  const land = () => {
    st.mode = "land";
    st.landT = 0;
    st.splat = false;
    const e = anchor();
    st.sx = e.x;
    st.sy = e.y;
    if (st.type === "fall") {
      if (st.fallH > 320) {
        st.splat = true;
        st.landSquash = 0.55;
        st.landDur = 0.65;
        st.dizzy = 1.6;
        puff(e.x, e.y, 9, 1.7);
      } else {
        st.landSquash = 0.35;
        st.landDur = 0.25;
        puff(e.x, e.y, 5, 1);
      }
    } else if (st.type === "super") {
      st.landSquash = 0.28;
      st.landDur = 0.3;
      st.tada = 0.5;
      puff(e.x, e.y, 4, 0.8);
    } else {
      st.landSquash = 0.22;
      st.landDur = 0.16;
    }

    // a little personality
    const el = st.el;
    if (el.matches(".contact-section .btn")) say("Say hi! \u{1F44B}", 2);
    else if (el.matches(".hero-image")) say("That's me!");
    else if (el.matches(".nav-actions .btn")) say("Let's talk!");
    else if (st.splat) say(pick(["I'm okay!", "Ouch.", "Nailed it.", "10/10 landing"]));
    else if (st.type === "super" && Math.random() < 0.5) say(pick(["Wheee!", "Parkour!", "Too easy"]), 1.1);
  };

  // ---------- Hover handling (with a tiny delay so he doesn't go crazy) ----------
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
    if (el && el === st.el && st.mode === "idle") goTo(el, true); // happy hop
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

  // ---------- Animation loop ----------
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    const time = clock.elapsedTime;
    if (!desktop.matches || !st.el) return;

    let squashTarget = 0;
    let lift = 0;
    let panic = false;
    let shakeX = 0;
    flip.rotation.x = 0;

    switch (st.mode) {
      case "charge":
        st.chargeT += dt;
        squashTarget = st.type === "super" ? 0.28 : 0.18;
        if (st.type === "super") shakeX = Math.sin(time * 90) * 0.8;
        if (st.chargeT >= st.chargeDur) st.mode = "air";
        break;
      case "air": {
        st.t += dt;
        const u = Math.min(1, st.t / st.T);
        const t = Math.min(st.t, st.T);
        const s = { x: st.sPage.x - window.scrollX, y: st.sPage.y - window.scrollY };
        const e = anchor();
        const vy0 = (e.y - s.y - 0.5 * st.g * st.T * st.T) / st.T;
        st.sx = s.x + (e.x - s.x) * u;
        st.sy = s.y + vy0 * t + 0.5 * st.g * t * t;
        if (st.type === "hop") {
          lift = Math.sin(Math.PI * u);
          squashTarget = -0.06 * lift;
        } else if (st.type === "super") {
          lift = 1;
          squashTarget = -0.08;
          flip.rotation.x = Math.PI * 2 * easeInOut(u); // front flip
        } else {
          panic = st.t > st.t1; // past the top of the jump: falling!
          lift = panic ? 0 : 0.6;
          squashTarget = panic ? -0.1 : -0.05;
        }
        if (u >= 1) land();
        break;
      }
      case "land": {
        st.landT += dt;
        const p = Math.min(1, st.landT / st.landDur);
        if (st.splat) {
          squashTarget = p < 0.55 ? st.landSquash : st.landSquash * (1 - (p - 0.55) / 0.45) - 0.12 * Math.sin((Math.PI * (p - 0.55)) / 0.45);
        } else {
          squashTarget = st.landSquash * (1 - p);
        }
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

    st.squash += (squashTarget - st.squash) * Math.min(1, dt * 30);
    st.armLift += (lift - st.armLift) * Math.min(1, dt * 18);
    st.dizzy = Math.max(0, st.dizzy - dt);
    st.tada = Math.max(0, st.tada - dt);

    const breath = reduceMotion ? 0 : Math.sin(time * 2.6) * 0.02;
    body.scale.set(1 + st.squash * 0.6, 1 - st.squash + breath, 1 + st.squash * 0.6);

    // Facing
    const airborne = st.mode === "charge" || st.mode === "air";
    const dx = mouse.x === null ? 0 : mouse.x - st.sx;
    let yawTarget = clamp(dx / 500, -0.45, 0.45);
    if (airborne) yawTarget = panic ? 0 : st.dir * (st.type === "super" ? 1.25 : 1.0);
    root.rotation.y += (yawTarget - root.rotation.y) * Math.min(1, dt * 12);
    root.rotation.z = panic ? Math.sin(time * 12) * 0.15 : 0;

    // Head
    const headYaw = airborne ? 0 : clamp(dx / 300, -0.4, 0.4);
    const headPitch = airborne || mouse.y === null ? 0 : clamp((mouse.y - (st.sy - CH * 0.7)) / 500, -0.1, 0.35);
    head.rotation.y += (headYaw - head.rotation.y) * Math.min(1, dt * 10);
    head.rotation.x += (headPitch - head.rotation.x) * Math.min(1, dt * 10);
    head.rotation.z = st.dizzy > 0 ? Math.sin(time * 8) * 0.18 : reduceMotion ? 0 : Math.sin(time * 1.5) * 0.04;

    // Arms & legs
    for (const arm of arms) {
      const sd = arm.userData.side;
      let a;
      if (panic) a = 2.3 + Math.sin(time * 28 + sd * 1.7) * 0.5; // flail!
      else if (st.tada > 0) a = 2.4; // ta-da
      else a = 0.35 + (reduceMotion ? 0 : Math.sin(time * 2.6 + sd) * 0.05) + 1.9 * st.armLift;
      arm.rotation.z = sd * a;
    }
    for (const leg of legs) {
      const sd = leg.userData.side;
      let target = 0;
      if (panic) target = Math.sin(time * 24 + (sd > 0 ? Math.PI : 0)) * 0.7; // kicking
      else if (st.mode === "air" && st.type !== "fall") target = -0.35 * st.armLift; // tuck
      leg.rotation.x += (target - leg.rotation.x) * Math.min(1, dt * 25);
    }

    // Face
    let eyeX = 1;
    let eyeY = 1;
    st.nextBlink -= dt;
    if (st.nextBlink <= 0) {
      st.blinkT = 0;
      st.nextBlink = 2 + Math.random() * 3;
    }
    if (st.blinkT >= 0) {
      st.blinkT += dt;
      eyeY = Math.max(0.1, 1 - Math.sin((Math.PI * st.blinkT) / 0.14));
      if (st.blinkT > 0.14) st.blinkT = -1;
    }
    if (panic) { eyeX = 1.25; eyeY = 1.35; }
    if (st.mode === "land" && st.splat) eyeY = 0.2; // squeezed shut
    eyes.forEach((e) => e.scale.set(eyeX, eyeY, 1));
    mouthO.visible = panic || (st.mode === "land" && st.splat);
    smirk.visible = !mouthO.visible;

    stars.visible = st.dizzy > 0;
    if (stars.visible) stars.rotation.y += dt * 7;

    // Move the little canvas to where he is
    const cx = st.sx + shakeX - BOX / 2;
    const cy = st.sy - FEET_Y;
    canvas.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;

    // Speech bubble
    if (bubbleT > 0) {
      bubbleT -= dt;
      if (bubbleT <= 0) bubble.style.opacity = "0";
      let bx = st.sx - bubbleW / 2;
      let by = st.sy - CH - 30;
      if (by < 4) { bx = st.sx + 20; by = st.sy - CH * 0.8; } // no room above (nav): put it to the side
      bubble.style.transform = `translate(${bx}px, ${by}px)`;
    }

    // Skip drawing when he's off screen
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    if (st.sy < -40 || st.sy > vh + BOX || st.sx < -BOX || st.sx > vw + BOX) return;
    renderer.render(scene, camera);
  });
}
