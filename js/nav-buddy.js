/**
 * Nav Buddy: a tiny 3D chibi (Three.js, no external model needed) that
 * hops between the nav links as you hover them.
 * Built from primitives + toon shading + inverted-hull outlines to match
 * the site's soft-brutalist look. Desktop only (nav is hidden on mobile).
 */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const header = document.querySelector("header");
const links = Array.from(document.querySelectorAll(".nav-links a"));

if (header && links.length) {
  try {
    init();
  } catch (e) {
    console.warn("Nav buddy disabled:", e);
  }
}

function init() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const desktop = window.matchMedia("(min-width: 769px)");

  // ---------- Canvas overlay (covers the header, never blocks clicks) ----------
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "1",
  });
  header.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  // Orthographic camera in CSS-pixel units: 1 world unit = 1px
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
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
  };
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });

  // ---------- Geometry helpers (each returns [geo, outlineGeo]) ----------
  const T = 0.045; // outline thickness in model units
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
  const root = new THREE.Group();
  root.rotation.x = 0.1; // tiny tilt so we see the top of the head
  scene.add(root);
  const body = new THREE.Group(); // squash & stretch pivots at the feet
  root.add(body);

  for (const sx of [-1, 1]) {
    part(body, cap(0.11, 0.12), M.pants, { p: [0.13 * sx, 0.2, 0] });
    part(body, sph(0.13), M.shoe, { p: [0.13 * sx, 0.07, 0.05], s: [1, 0.62, 1.35] });
  }

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
  // short beard along the jaw
  part(head, sph(0.53, 28, 12, Math.PI * 0.7, Math.PI * 0.3), M.beard, { s: [1.06, 0.95, 1], outline: false });
  // hair: dome tilted back so the forehead shows, plus a quiff on top
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
  part(head, cap(0.016, 0.07), M.mouth, { p: [0.04, -0.23, 0.455], r: [0, 0, Math.PI / 2 + 0.2], outline: false });

  // ---------- State ----------
  const st = {
    W: 1, H: 1, index: 0, phase: "idle", phaseT: 0,
    x: 0, gy: 0, h: 0, fromX: 0, fromGY: 0, fromH: 0, toX: 0, toY: 0,
    t: 1, dur: 0.4, arc: 8, dir: 1, charH: 28, maxArc: 8,
    squash: 0, armLift: 0, nextBlink: 2.5, blinkT: -1,
  };
  const mouse = { x: null, y: null };

  const anchorFor = (i) => {
    const r = links[i].getBoundingClientRect();
    const h = header.getBoundingClientRect();
    return { x: r.left + r.width / 2 - h.left, y: r.top - h.top + 4 }; // feet sit on the cap height
  };

  const layout = () => {
    if (!desktop.matches) {
      canvas.style.display = "none";
      return;
    }
    canvas.style.display = "block";
    st.W = header.clientWidth;
    st.H = header.clientHeight;
    renderer.setSize(st.W, st.H, false);
    camera.left = -st.W / 2;
    camera.right = st.W / 2;
    camera.top = st.H / 2;
    camera.bottom = -st.H / 2;
    camera.updateProjectionMatrix();

    const a = anchorFor(st.index);
    const headroom = a.y; // space between the link and the top of the header
    st.charH = Math.max(18, Math.min(40, headroom - 10));
    st.maxArc = Math.max(3, headroom - st.charH * 1.06 - 1);
    root.scale.setScalar(st.charH / MODEL_H);
    if (st.phase === "idle") {
      st.x = a.x;
      st.gy = a.y;
      st.h = 0;
    }
  };

  const hopTo = (i, force) => {
    if (i === st.index && st.phase === "idle" && !force) return;
    st.index = i;
    const a = anchorFor(i);
    st.fromX = st.x;
    st.fromGY = st.gy;
    st.fromH = st.h;
    st.toX = a.x;
    st.toY = a.y;
    const dist = Math.abs(st.toX - st.fromX);
    if (reduceMotion) {
      st.x = a.x; st.gy = a.y; st.h = 0; st.phase = "idle";
      return;
    }
    if (dist > 1) st.dir = Math.sign(st.toX - st.fromX);
    st.dur = 0.3 + Math.min(0.35, dist / 900);
    st.arc = Math.max(0, Math.min(st.maxArc - st.fromH, 4 + dist * 0.06 + (force ? st.maxArc : 0)));
    st.t = 0;
    st.phaseT = 0;
    st.phase = st.phase === "air" ? "air" : "anticipate";
  };

  links.forEach((a, i) => {
    a.addEventListener("mouseenter", () => hopTo(i));
    a.addEventListener("focus", () => hopTo(i));
    a.addEventListener("click", () => hopTo(i, true)); // happy little hop on click
  });
  window.addEventListener("mousemove", (e) => {
    const h = header.getBoundingClientRect();
    mouse.x = e.clientX - h.left;
    mouse.y = e.clientY - h.top;
  }, { passive: true });

  layout();
  window.addEventListener("resize", layout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  if ("ResizeObserver" in window) new ResizeObserver(layout).observe(header);

  // ---------- Animation ----------
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    const time = clock.elapsedTime;
    if (!desktop.matches) return;

    let squashTarget = 0;
    let lift = 0;
    switch (st.phase) {
      case "anticipate":
        st.phaseT += dt;
        squashTarget = 0.18;
        if (st.phaseT > 0.07) { st.phase = "air"; st.phaseT = 0; }
        break;
      case "air": {
        st.t = Math.min(1, st.t + dt / st.dur);
        const e = easeInOut(st.t);
        st.x = lerp(st.fromX, st.toX, e);
        st.gy = lerp(st.fromGY, st.toY, e);
        st.h = lerp(st.fromH, 0, st.t) + st.arc * Math.sin(Math.PI * st.t);
        squashTarget = -0.06 * Math.sin(Math.PI * st.t); // stretch mid-air
        lift = Math.sin(Math.PI * st.t);
        if (st.t >= 1) { st.phase = "land"; st.phaseT = 0; st.h = 0; }
        break;
      }
      case "land":
        st.phaseT += dt;
        squashTarget = 0.22 * Math.max(0, 1 - st.phaseT / 0.16);
        if (st.phaseT > 0.16) st.phase = "idle";
        break;
      default:
        break;
    }

    const k = Math.min(1, dt * 30);
    st.squash += (squashTarget - st.squash) * k;
    st.armLift += (lift - st.armLift) * Math.min(1, dt * 18);

    const breath = reduceMotion ? 0 : Math.sin(time * 2.6) * 0.02;
    body.scale.set(1 + st.squash * 0.6, 1 - st.squash + breath, 1 + st.squash * 0.6);

    // Facing: sideways while hopping, otherwise turn toward the cursor
    const airborne = st.phase === "anticipate" || st.phase === "air";
    const dx = mouse.x === null ? 0 : mouse.x - st.x;
    const yawTarget = airborne ? st.dir * 1.0 : clamp(dx / 500, -0.45, 0.45);
    root.rotation.y += (yawTarget - root.rotation.y) * Math.min(1, dt * 12);

    const headYaw = airborne ? 0 : clamp(dx / 300, -0.4, 0.4);
    const headPitch = airborne || mouse.y === null ? 0 : clamp((mouse.y - (st.gy - st.charH * 0.7)) / 500, -0.1, 0.35);
    head.rotation.y += (headYaw - head.rotation.y) * Math.min(1, dt * 10);
    head.rotation.x += (headPitch - head.rotation.x) * Math.min(1, dt * 10);
    head.rotation.z = reduceMotion ? 0 : Math.sin(time * 1.5) * 0.04;

    for (const arm of arms) {
      const sway = reduceMotion ? 0 : Math.sin(time * 2.6 + arm.userData.side) * 0.05;
      arm.rotation.z = arm.userData.side * (0.35 + sway + 1.9 * st.armLift);
    }

    // Blink every few seconds
    st.nextBlink -= dt;
    if (st.nextBlink <= 0) { st.blinkT = 0; st.nextBlink = 2 + Math.random() * 3; }
    let eyeY = 1;
    if (st.blinkT >= 0) {
      st.blinkT += dt;
      eyeY = Math.max(0.1, 1 - Math.sin((Math.PI * st.blinkT) / 0.14));
      if (st.blinkT > 0.14) { st.blinkT = -1; eyeY = 1; }
    }
    eyes.forEach((e) => (e.scale.y = eyeY));

    root.position.set(st.x - st.W / 2, st.H / 2 - (st.gy - st.h), 0);
    renderer.render(scene, camera);
  });
}
