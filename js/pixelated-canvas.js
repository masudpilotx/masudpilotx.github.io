/**
 * Pixelated Canvas (vanilla JS port of Aceternity UI's <PixelatedCanvas />)
 * Usage: <canvas data-pixelated-canvas data-src="path/to/image.png"></canvas>
 * Any option below can be overridden with a data attribute, e.g. data-cell-size="4".
 */
(function () {
  const DEFAULTS = {
    cellSize: 3,
    dotScale: 0.9,
    shape: "square", // "square" | "circle"
    backgroundColor: "#000000",
    grayscale: false,
    dropoutStrength: 0.4,
    interactive: true,
    distortionStrength: 3,
    distortionRadius: 80,
    distortionMode: "swirl", // "swirl" | "repel" | "attract"
    followSpeed: 0.2,
    sampleAverage: true,
    tintColor: "#FFFFFF",
    tintStrength: 0.2,
    maxFps: 60,
    objectFit: "cover", // "cover" | "contain" | "fill" | "none"
    jitterStrength: 4,
    jitterSpeed: 4,
    fadeOnLeave: true,
    fadeSpeed: 0.1,
  };

  const parseColor = (c) => {
    if (!c) return null;
    if (c.startsWith("#")) {
      const hex = c.slice(1);
      if (hex.length === 3) {
        return [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16));
      }
      return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    }
    const m = c.match(/rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)/i);
    return m ? [+m[1], +m[2], +m[3]] : null;
  };

  const hash2D = (ix, iy) => {
    const s = Math.sin(ix * 12.9898 + iy * 78.233) * 43758.5453123;
    return s - Math.floor(s);
  };

  const readDataOptions = (el) => {
    const out = {};
    Object.keys(DEFAULTS).forEach((key) => {
      const raw = el.dataset[key];
      if (raw === undefined) return;
      const def = DEFAULTS[key];
      if (typeof def === "number") out[key] = parseFloat(raw);
      else if (typeof def === "boolean") out[key] = raw !== "false";
      else out[key] = raw;
    });
    return out;
  };

  function PixelatedCanvas(canvas, options) {
    const o = Object.assign({}, DEFAULTS, readDataOptions(canvas), options || {});
    const src = o.src || canvas.dataset.src;
    if (!src) return;

    const reduceMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const interactive = o.interactive && !reduceMotion;

    const ctx = canvas.getContext("2d");
    let samples = [];
    let dims = null;
    let raf = null;
    let lastFrame = 0;
    let pointerInside = false;
    let activity = 0;
    let activityTarget = 0;
    const target = { x: -9999, y: -9999 };
    const anim = { x: -9999, y: -9999 };

    const img = new Image();
    img.crossOrigin = "anonymous";

    // Size the canvas to its parent's width, keep the image's aspect ratio
    const getSize = () => {
      const parent = canvas.parentElement;
      const w = Math.max(1, Math.round((parent && parent.clientWidth) || o.width || 400));
      const ratio = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1.25;
      const h = o.height ? o.height : Math.round(w * ratio);
      return { w, h };
    };

    const clear = () => {
      if (o.backgroundColor) {
        ctx.fillStyle = o.backgroundColor;
        ctx.fillRect(0, 0, dims.width, dims.height);
      } else {
        ctx.clearRect(0, 0, dims.width, dims.height);
      }
    };

    const compute = () => {
      const dpr = window.devicePixelRatio || 1;
      const { w: displayWidth, h: displayHeight } = getSize();

      canvas.width = Math.max(1, Math.floor(displayWidth * dpr));
      canvas.height = Math.max(1, Math.floor(displayHeight * dpr));
      canvas.style.width = displayWidth + "px";
      canvas.style.height = displayHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const offscreen = document.createElement("canvas");
      offscreen.width = displayWidth;
      offscreen.height = displayHeight;
      const off = offscreen.getContext("2d", { willReadFrequently: true });

      const iw = img.naturalWidth || displayWidth;
      const ih = img.naturalHeight || displayHeight;
      let dw = displayWidth, dh = displayHeight, dx = 0, dy = 0;
      if (o.objectFit === "cover" || o.objectFit === "contain") {
        const scale = (o.objectFit === "cover" ? Math.max : Math.min)(
          displayWidth / iw,
          displayHeight / ih
        );
        dw = Math.ceil(iw * scale);
        dh = Math.ceil(ih * scale);
        dx = Math.floor((displayWidth - dw) / 2);
        dy = Math.floor((displayHeight - dh) / 2);
      } else if (o.objectFit === "none") {
        dw = iw;
        dh = ih;
        dx = Math.floor((displayWidth - dw) / 2);
        dy = Math.floor((displayHeight - dh) / 2);
      }
      off.drawImage(img, dx, dy, dw, dh);

      dims = {
        width: displayWidth,
        height: displayHeight,
        dot: Math.max(1, Math.floor(o.cellSize * o.dotScale)),
      };

      let data;
      try {
        data = off.getImageData(0, 0, offscreen.width, offscreen.height).data;
      } catch (e) {
        // Cross-origin image: just draw it plainly
        samples = [];
        ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
        return false;
      }

      const W = offscreen.width;
      const H = offscreen.height;
      const stride = W * 4;
      const cs = o.cellSize;
      const tint = !o.grayscale && o.tintStrength > 0 ? parseColor(o.tintColor) : null;
      const k = Math.max(0, Math.min(1, o.tintStrength));

      const lum = (px, py) => {
        const i = Math.max(0, Math.min(H - 1, py)) * stride + Math.max(0, Math.min(W - 1, px)) * 4;
        return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      };

      const next = [];
      for (let y = 0; y < H; y += cs) {
        const cy = Math.min(H - 1, y + Math.floor(cs / 2));
        for (let x = 0; x < W; x += cs) {
          const cx = Math.min(W - 1, x + Math.floor(cs / 2));
          let r = 0, g = 0, b = 0, a = 0;
          if (!o.sampleAverage) {
            const idx = cy * stride + cx * 4;
            r = data[idx]; g = data[idx + 1]; b = data[idx + 2]; a = data[idx + 3] / 255;
          } else {
            let n = 0;
            for (let oy = -1; oy <= 1; oy++) {
              for (let ox = -1; ox <= 1; ox++) {
                const sx = Math.max(0, Math.min(W - 1, cx + ox));
                const sy = Math.max(0, Math.min(H - 1, cy + oy));
                const s = sy * stride + sx * 4;
                r += data[s]; g += data[s + 1]; b += data[s + 2]; a += data[s + 3] / 255;
                n++;
              }
            }
            r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n); a /= n;
          }

          if (o.grayscale) {
            const L = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
            r = g = b = L;
          } else if (tint) {
            r = Math.round(r * (1 - k) + tint[0] * k);
            g = Math.round(g * (1 - k) + tint[1] * k);
            b = Math.round(b * (1 - k) + tint[2] * k);
          }

          // Drop dots in flat / low-contrast areas for that dithered look
          const Lc = lum(cx, cy);
          const Lx1 = lum(cx - 1, cy), Lx2 = lum(cx + 1, cy);
          const Ly1 = lum(cx, cy - 1), Ly2 = lum(cx, cy + 1);
          const grad =
            Math.abs(Lx2 - Lx1) + Math.abs(Ly2 - Ly1) + Math.abs(Lc - (Lx1 + Lx2 + Ly1 + Ly2) / 4);
          const gradientNorm = Math.max(0, Math.min(1, grad / 255));
          const dropoutProb = Math.max(0, Math.min(1, (1 - gradientNorm) * o.dropoutStrength));
          const seed = hash2D(cx, cy);
          if (seed < dropoutProb || a <= 0) continue;

          next.push({ x: x + cs / 2, y: y + cs / 2, a, seed, color: "rgb(" + r + "," + g + "," + b + ")" });
        }
      }
      samples = next;
      return true;
    };

    const drawDot = (x, y, s) => {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = s.color;
      if (o.shape === "circle") {
        ctx.beginPath();
        ctx.arc(x, y, dims.dot / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(x - dims.dot / 2, y - dims.dot / 2, dims.dot, dims.dot);
      }
    };

    const drawStatic = () => {
      if (!dims) return;
      clear();
      for (const s of samples) drawDot(s.x, s.y, s);
      ctx.globalAlpha = 1;
    };

    const frame = (now) => {
      raf = null;
      if (now - lastFrame < 1000 / Math.max(1, o.maxFps)) {
        raf = requestAnimationFrame(frame);
        return;
      }
      lastFrame = now;

      anim.x += (target.x - anim.x) * o.followSpeed;
      anim.y += (target.y - anim.y) * o.followSpeed;
      if (o.fadeOnLeave) activity += (activityTarget - activity) * o.fadeSpeed;
      else activity = pointerInside ? 1 : 0;

      clear();
      const mx = anim.x, my = anim.y;
      const sigma = Math.max(1, o.distortionRadius * 0.5);
      const twoSigma2 = 2 * sigma * sigma;
      const t = now * 0.001 * o.jitterSpeed;
      const act = Math.max(0, Math.min(1, activity));

      for (const s of samples) {
        let drawX = s.x, drawY = s.y;
        const dx = drawX - mx, dy = drawY - my;
        const dist2 = dx * dx + dy * dy;
        const influence = Math.exp(-dist2 / twoSigma2) * act;
        if (influence > 0.0005) {
          if (o.distortionMode === "repel" || o.distortionMode === "attract") {
            const dir = o.distortionMode === "repel" ? 1 : -1;
            const dist = Math.sqrt(dist2) + 0.0001;
            drawX += dir * (dx / dist) * o.distortionStrength * influence;
            drawY += dir * (dy / dist) * o.distortionStrength * influence;
          } else {
            const angle = o.distortionStrength * 0.05 * influence;
            const cosA = Math.cos(angle), sinA = Math.sin(angle);
            drawX = mx + (cosA * dx - sinA * dy);
            drawY = my + (sinA * dx + cosA * dy);
          }
          if (o.jitterStrength > 0) {
            const kk = s.seed * 43758.5453;
            drawX += Math.sin(t + kk) * o.jitterStrength * influence;
            drawY += Math.cos(t + kk * 1.13) * o.jitterStrength * influence;
          }
        }
        drawDot(drawX, drawY, s);
      }
      ctx.globalAlpha = 1;

      // Keep animating while hovered or fading out; idle otherwise (saves battery)
      if (pointerInside || activity > 0.002) raf = requestAnimationFrame(frame);
      else drawStatic();
    };

    const start = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const bindPointer = () => {
      canvas.addEventListener("pointermove", (e) => {
        const rect = canvas.getBoundingClientRect();
        target.x = e.clientX - rect.left;
        target.y = e.clientY - rect.top;
        // Snap so the swirl starts under the cursor, not from far away
        if (!pointerInside && activity < 0.01) {
          anim.x = target.x;
          anim.y = target.y;
        }
        pointerInside = true;
        activityTarget = 1;
        start();
      });
      canvas.addEventListener("pointerenter", () => {
        pointerInside = true;
        activityTarget = 1;
        start();
      });
      canvas.addEventListener("pointerleave", () => {
        pointerInside = false;
        if (o.fadeOnLeave) activityTarget = 0;
        else { target.x = -9999; target.y = -9999; }
        start();
      });
    };

    img.onload = () => {
      const ok = compute();
      canvas.classList.add("is-ready");
      if (!ok) return;
      drawStatic();
      if (interactive) bindPointer();

      // Re-sample when the layout width changes
      let lastW = dims.width;
      const onResize = () => {
        const { w } = getSize();
        if (w === lastW) return;
        lastW = w;
        if (compute() && !raf) drawStatic();
      };
      if ("ResizeObserver" in window && canvas.parentElement) {
        new ResizeObserver(onResize).observe(canvas.parentElement);
      } else {
        window.addEventListener("resize", onResize);
      }
    };

    img.onerror = () => {
      console.error("PixelatedCanvas: failed to load image", src);
    };

    img.src = src;
  }

  window.PixelatedCanvas = PixelatedCanvas;

  const init = () =>
    document.querySelectorAll("canvas[data-pixelated-canvas]").forEach((c) => PixelatedCanvas(c));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
