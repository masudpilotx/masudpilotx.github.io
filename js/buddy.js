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
 * ---- Swapping the model ----
 * Default model: "RobotExpressive" by Tomás Laulhé (CC0), served from jsDelivr.
 * To use your own: upload a .glb to assets/models/ and change MODEL_URL below,
 * e.g. "/assets/models/buddy.glb". Clips are matched by name (case-insensitive),
 * see CLIP_NAMES. Missing clips are fine, he just skips that animation.
 * If the model fails to load, the hand-built chibi (js/nav-buddy.js) is used.
 */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm";

const MODEL_URL =
  "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/RobotExpressive/RobotExpressive.glb";

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

if (firstLink) {
  new GLTFLoader().load(
    MODEL_URL,
    (gltf) => {
      try {
        init(gltf);
      } catch (e) {
        console.warn("Page buddy disabled:", e);
      }
    },
    undefined,
    (err) => {
      // model failed to load: fall back to the hand-built chibi
      console.warn("Page buddy: couldn't load model, using the built-in chibi", MODEL_URL, err);
      import("/js/nav-buddy.js?v=2");
    }
  );
}

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

  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
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
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = CH / (size.y || 1);
  model.scale.setScalar(s);
  model.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
  body.add(model);

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
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

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
      else play("idle");
      say(pick(["I'm okay!", "Ouch.", "Nailed it.", "10/10 landing"]), 1.8);
      return;
    }

    st.landSquash = st.type === "fall" ? 0.3 : st.type === "super" ? 0.22 : 0.15;
    st.landDur = st.type === "hop" ? 0.16 : 0.25;
    if (st.type !== "hop") puff(e.x, e.y, st.type === "fall" ? 5 : 4, 1);

    if (el.matches(".contact-section .btn")) { playSeq(["wave"]); say("Say hi! \u{1F44B}", 2); }
    else if (el.matches(".hero-image")) { playSeq(["cheer"]); say("That's me!"); }
    else if (el.matches(".nav-actions .btn")) { playSeq(["wave"]); say("Let's talk!"); }
    else if (st.type === "super") {
      playSeq(["cheer"]);
      if (Math.random() < 0.5) say(pick(["Wheee!", "Parkour!", "Too easy"]), 1.1);
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
      if (clips.dance) { playSeq(["dance"]); if (Math.random() < 0.4) say(pick(["\u{1F57A}", "Party!", "Hire me, I dance too"]), 1.3); }
      else goTo(el, true);
    }
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
        squashTarget = st.landSquash * (1 - p);
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

    st.squash += (squashTarget - st.squash) * Math.min(1, dt * 30);
    body.scale.set(1 + st.squash * 0.6, 1 - st.squash, 1 + st.squash * 0.6);

    // Facing: sideways while moving, turned toward the cursor when chilling, panicking at the camera when falling
    const airborne = st.mode === "charge" || st.mode === "air";
    const dx = mouse.x === null ? 0 : mouse.x - st.sx;
    let yawTarget = clamp(dx / 400, -0.6, 0.6);
    if (airborne) yawTarget = panic ? 0 : st.dir * (Math.PI / 2) * 0.85;
    root.rotation.y += (yawTarget - root.rotation.y) * Math.min(1, dt * 12);
    root.rotation.z = panic ? Math.sin(time * 12) * 0.15 : 0;

    // Look at the cursor (added on top of the animation)
    if (headBone) {
      const wantY = !airborne && !st.crash ? clamp(dx / 300, -0.5, 0.5) : 0;
      const wantX = !airborne && !st.crash && mouse.y !== null ? clamp((mouse.y - (st.sy - CH * 0.8)) / 600, -0.1, 0.3) : 0;
      look.y += (wantY - look.y) * Math.min(1, dt * 10);
      look.x += (wantX - look.x) * Math.min(1, dt * 10);
      headBone.rotation.y += look.y;
      headBone.rotation.x += look.x;
    }

    // Expressions (RobotExpressive has Surprised / Sad / Angry)
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
