'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   PimplePop  ·  js/game.js
   Full-screen canvas game with realistic pimple extraction mechanics.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  SKIN_TONES: [
    { r:255, g:222, b:189 },   // fair
    { r:240, g:200, b:168 },   // light
    { r:210, g:170, b:135 },   // medium-light
    { r:185, g:140, b:108 },   // medium
    { r:158, g:110, b:80  },   // medium-dark
    { r:120, g: 82, b:56  },   // dark
  ],
  PIMPLE_COUNT: { min: 5, max: 9 },
  TYPE_WEIGHTS: { whitehead: 0.35, blackhead: 0.45, cyst: 0.20 },

  // Discomfort
  DISCOMFORT_DANGER:         78,    // above this → danger zone
  DISCOMFORT_QUIT_MS:      2600,    // ms in danger before client quits
  DISCOMFORT_IDLE_DECAY:      5,    // per second at rest

  // Squeeze detection
  SQUEEZE_ACTIVATION_RADIUS: 100,   // px: midpoint must be this close to a pimple
  MOUSE_MAX_DRAG:            160,    // px for 100% force on desktop

  // Visual
  SKIN_PORE_DENSITY:    0.018,
  SKIN_HAIR_DENSITY:    0.004,
};

const PIMPLE_CFG = {
  whitehead: {
    minR: 7, maxR: 14,
    inflamMult: 2.3,
    baseAngle: 0,          // fingers left-right → squeeze axis horizontal
    angleTolerance: 0.42,
    forceMin: 0.22, forceMax: 0.62,
    speedLimit: 0.22,
    extractDuration: 2.0,  // seconds of correct squeezing
    discomfortRate: 13,
    reliefRate: 8,
    points: 100,
  },
  blackhead: {
    minR: 3, maxR: 8,
    inflamMult: 1.25,
    baseAngle: 0,
    angleTolerance: 0.30,
    forceMin: 0.14, forceMax: 0.44,
    speedLimit: 0.25,
    extractDuration: 1.4,
    discomfortRate: 7,
    reliefRate: 5,
    points: 50,
  },
  cyst: {
    minR: 18, maxR: 30,
    inflamMult: 2.9,
    baseAngle: null,       // random per pimple
    angleTolerance: 0.21,
    forceMin: 0.28, forceMax: 0.58,
    speedLimit: 0.09,
    extractDuration: 4.0,
    discomfortRate: 32,
    reliefRate: 16,
    points: 500,
  },
};

const CLIENT_FACES = ['😊','😐','😣','😖','😤','🤯'];

// ─── Utility ──────────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp  = (a, b, t)   => a + (b - a) * t;
const rand  = (lo, hi)    => lo + Math.random() * (hi - lo);

function weightedRandom(obj) {
  const keys   = Object.keys(obj);
  const vals   = Object.values(obj);
  const total  = vals.reduce((s, v) => s + v, 0);
  let r = Math.random() * total;
  for (let i = 0; i < keys.length; i++) { r -= vals[i]; if (r <= 0) return keys[i]; }
  return keys[keys.length - 1];
}

// Angular difference accounting for π-symmetry of squeeze axis
function squeezeAngleDiff(a, b) {
  let d = ((a - b) % Math.PI + Math.PI) % Math.PI;
  if (d > Math.PI / 2) d -= Math.PI;
  return d;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ─── Value Noise ──────────────────────────────────────────────────────────────
class ValueNoise {
  constructor(seed) {
    this.perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) this.perm[i] = i;
    let s = (seed | 0) || 12345;
    for (let i = 255; i > 0; i--) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const j = s % (i + 1);
      [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
    }
  }
  _h(x, y) {
    return this.perm[(this.perm[x & 255] + y) & 255] / 255;
  }
  _s(t) { return t * t * (3 - 2 * t); }
  n(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = this._s(xf), v = this._s(yf);
    const n00 = this._h(xi, yi), n10 = this._h(xi + 1, yi);
    const n01 = this._h(xi, yi + 1), n11 = this._h(xi + 1, yi + 1);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
  }
  fbm(x, y, oct = 4) {
    let v = 0, a = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { v += this.n(x * f, y * f) * a; f *= 2; a *= .5; }
    return v;
  }
}

// ─── Skin Texture Generator ───────────────────────────────────────────────────
function buildSkinTexture(w, h, tone) {
  const offscreen = document.createElement('canvas');
  offscreen.width = w; offscreen.height = h;
  const ctx = offscreen.getContext('2d');
  const noise = new ValueNoise(Math.random() * 99999 | 0);

  // Pixel-by-pixel base layer
  const img = ctx.createImageData(w, h);
  const d = img.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;

      // Multi-scale noise for organic skin variation
      const large = noise.n(x / 90, y / 90);       // broad tone variation
      const mid   = noise.n(x / 30, y / 30);       // medium texture
      const fine  = noise.n(x / 8,  y / 8);        // fine surface texture

      const variation = (large * 0.55 + mid * 0.30 + fine * 0.15) * 28 - 10;

      d[i    ] = clamp(tone.r + variation,               0, 255);
      d[i + 1] = clamp(tone.g + variation * 0.82,        0, 255);
      d[i + 2] = clamp(tone.b + variation * 0.60,        0, 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Subsurface-scattering blobs (warm pink patches)
  ctx.globalCompositeOperation = 'overlay';
  for (let i = 0; i < 18; i++) {
    const gx = Math.random() * w, gy = Math.random() * h;
    const r  = 60 + Math.random() * 120;
    const g  = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, `rgba(${tone.r + 28}, ${tone.g + 8}, ${tone.b + 4}, 0.22)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  // Pores
  ctx.globalCompositeOperation = 'multiply';
  const poreNoise = new ValueNoise(Math.random() * 99999 | 0);
  for (let y = 0; y < h; y += 5) {
    for (let x = 0; x < w; x += 5) {
      if (poreNoise.n(x / 4, y / 4) > 0.72 && Math.random() < CFG.SKIN_PORE_DENSITY * 40) {
        const pr = 0.8 + Math.random() * 1.4;
        const pg = ctx.createRadialGradient(x, y, 0, x, y, pr * 3);
        pg.addColorStop(0, `rgba(${tone.r - 50},${tone.g - 40},${tone.b - 30}, 0.55)`);
        pg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.arc(x, y, pr * 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // Fine hair follicles
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = `rgba(${tone.r - 60},${tone.g - 50},${tone.b - 40}, 0.25)`;
  ctx.lineWidth = 0.7;
  for (let i = 0; i < w * h * CFG.SKIN_HAIR_DENSITY * 0.0005; i++) {
    const hx = Math.random() * w, hy = Math.random() * h;
    const len = 6 + Math.random() * 14;
    const ang = rand(-0.4, 0.4) + Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.quadraticCurveTo(
      hx + Math.cos(ang + 0.3) * len * 0.5,
      hy + Math.sin(ang + 0.3) * len * 0.5,
      hx + Math.cos(ang) * len,
      hy + Math.sin(ang) * len
    );
    ctx.stroke();
  }

  // Subtle vignette
  ctx.globalCompositeOperation = 'source-over';
  const vig = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.3, w/2, h/2, Math.min(w,h)*0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = 'source-over';
  return offscreen;
}

// ─── Particle / Goo Effect ───────────────────────────────────────────────────
class GooEffect {
  constructor(x, y, type, radius) {
    this.x = x; this.y = y; this.type = type;
    this.age = 0;
    this.done = false;
    this.particles = [];
    this.blobs = [];
    this.splats = [];
    this._spawn(radius);
  }

  _col() {
    switch (this.type) {
      case 'whitehead': return { r:252, g:248, b:215, r2:245, g2:230, b2:170 };
      case 'blackhead': return { r:55,  g:38,  b:24,  r2:80,  g2:55,  b2:35  };
      default:          return { r:250, g:240, b:195, r2:240, g2:215, b2:145 }; // cyst
    }
  }

  _spawn(radius) {
    const c  = this._col();
    const isCyst = this.type === 'cyst';
    const count  = isCyst ? 36 : (this.type === 'blackhead' ? 18 : 24);

    // Burst particles
    for (let i = 0; i < count; i++) {
      const ang   = Math.random() * Math.PI * 2;
      const spd   = rand(isCyst ? 1.5 : 3, isCyst ? 5 : 11);
      const sz    = rand(isCyst ? 3 : 1.5, isCyst ? 9 : 5);
      const upBias = isCyst ? 0 : -2.5;
      this.particles.push({
        x: this.x, y: this.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd + upBias,
        size: sz, life: 1,
        decay: rand(.30, .65),
        gravity: rand(4, 8),
        cr: c.r, cg: c.g, cb: c.b,
      });
    }

    // Cyst: thick ooze blobs
    if (isCyst) {
      for (let i = 0; i < 6; i++) {
        this.blobs.push({
          x: this.x, y: this.y,
          vx: rand(-1.5, 1.5),
          vy: rand(-3, -.5),
          r: rand(6, 13),
          alpha: 1,
          trail: [],
          cr: c.r2, cg: c.g2, cb: c.b2,
        });
      }
    }

    // Permanent splat marks on skin
    const splatCount = isCyst ? 10 : 5;
    for (let i = 0; i < splatCount; i++) {
      const dist = radius + rand(5, isCyst ? 55 : 30);
      const ang  = Math.random() * Math.PI * 2;
      this.splats.push({
        x: this.x + Math.cos(ang) * dist,
        y: this.y + Math.sin(ang) * dist,
        r: rand(.8, isCyst ? 5.5 : 3),
        cr: c.r2, cg: c.g2, cb: c.b2,
        alpha: rand(.5, .85),
        delay: rand(0, .12),
      });
    }
  }

  update(dt) {
    this.age += dt;
    this.particles.forEach(p => {
      p.x  += p.vx * dt * 60;
      p.y  += p.vy * dt * 60;
      p.vy += p.gravity * dt;
      p.vx *= 0.978;
      p.life -= p.decay * dt;
    });
    this.particles = this.particles.filter(p => p.life > 0);

    this.blobs.forEach(b => {
      b.trail.push({ x: b.x, y: b.y, r: b.r });
      if (b.trail.length > 14) b.trail.shift();
      b.x  += b.vx * dt * 60;
      b.y  += b.vy * dt * 60;
      b.vy += 4 * dt;
      b.r  *= (1 - .6 * dt);
      b.alpha -= .25 * dt;
    });
    this.blobs = this.blobs.filter(b => b.alpha > 0 && b.r > .8);

    this.done = this.particles.length === 0 && this.blobs.length === 0 && this.age > 2.5;
    return !this.done;
  }

  render(ctx) {
    const ageVis = Math.min(1, this.age * 6);

    // Splats appear quickly
    this.splats.forEach(s => {
      const a = Math.min(1, Math.max(0, (this.age - s.delay) * 8)) * s.alpha;
      if (a <= 0) return;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${s.cr},${s.cg},${s.cb},${a})`;
      ctx.fill();
    });

    // Blob trails
    this.blobs.forEach(b => {
      if (b.trail.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(b.trail[0].x, b.trail[0].y);
      for (let i = 1; i < b.trail.length; i++) ctx.lineTo(b.trail[i].x, b.trail[i].y);
      ctx.strokeStyle = `rgba(${b.cr},${b.cg},${b.cb},${b.alpha * .8})`;
      ctx.lineWidth   = b.r * 2;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.stroke();
    });

    // Particles
    this.particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(.5, p.size * p.life), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.cr},${p.cg},${p.cb},${Math.min(1, p.life * 1.2)})`;
      ctx.fill();
    });
  }
}

// ─── Skin Deformation (finger press dents) ───────────────────────────────────
class SkinDent {
  constructor(x, y, radius) { this.x = x; this.y = y; this.radius = radius; this.alpha = 1; }
  render(ctx) {
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
    g.addColorStop(0,   `rgba(0,0,0,${0.20 * this.alpha})`);
    g.addColorStop(0.5, `rgba(0,0,0,${0.10 * this.alpha})`);
    g.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
  }
}

// ─── Pimple ───────────────────────────────────────────────────────────────────
class Pimple {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.type = type;
    const c = PIMPLE_CFG[type];

    this.radius     = rand(c.minR, c.maxR);
    this.inflamR    = this.radius * c.inflamMult;
    this.points     = c.points;

    // Hidden squeeze target – random angle offset makes each unique
    const baseAngle = c.baseAngle !== null ? c.baseAngle : Math.random() * Math.PI;
    this.targetAngle    = baseAngle + rand(-.35, .35);
    this.angleTolerance = c.angleTolerance;
    this.forceMin       = c.forceMin;
    this.forceMax       = c.forceMax;
    this.speedLimit     = c.speedLimit;
    this.extractDur     = c.extractDuration;
    this.discomfortRate = c.discomfortRate;
    this.reliefRate     = c.reliefRate;

    // State
    this.progress       = 0;          // 0–1 extraction progress
    this.extracted      = false;
    this.squeezeVis     = 0;          // visual compression 0–1
    this.wrongVis       = 0;          // redness flash when wrong
    this.wobblePhase    = Math.random() * Math.PI * 2;
    this.wobbleSpeed    = rand(.8, 1.4);
    this.openAmount     = 0;          // pore opening 0–1
    this.extractFlash   = 0;          // bright flash on extraction
  }

  /* Returns discomfort delta (per second equivalent) for this frame */
  processSqueeze(sq, dt) {
    if (this.extracted) return 0;

    const angleDiff  = Math.abs(squeezeAngleDiff(sq.angle, this.targetAngle));
    const isAngle    = angleDiff  <= this.angleTolerance;
    const isForce    = sq.force   >= this.forceMin && sq.force <= this.forceMax;
    const isTooFast  = sq.speed   > this.speedLimit;
    const isTooHard  = sq.force   > this.forceMax;

    let discomfortDelta = 0;
    let progressDelta   = 0;

    if (isTooFast) {
      discomfortDelta += this.discomfortRate * 1.8;
      this.wrongVis = Math.min(1, this.wrongVis + 5 * dt);
    } else if (!isAngle) {
      const severity = angleDiff / Math.PI;
      discomfortDelta += this.discomfortRate * (0.5 + severity * 1.2);
      this.wrongVis = Math.min(1, this.wrongVis + 3 * dt);
    } else if (isTooHard) {
      discomfortDelta += this.discomfortRate * 0.55;
      this.wrongVis = Math.min(1, this.wrongVis + 2 * dt);
    } else if (!isForce) {
      // Too light — no pain, no progress
    } else {
      // ✅ Correct angle + force
      discomfortDelta -= this.reliefRate;
      progressDelta    = dt / this.extractDur;
      this.squeezeVis  = Math.min(.85, this.squeezeVis + 1.2 * dt);
      this.openAmount  = clamp(this.progress * 1.3, 0, 1);
      this.wrongVis    = Math.max(0, this.wrongVis - 4 * dt);
    }

    this.squeezeVis = Math.max(0, this.squeezeVis - .15 * dt);
    this.wrongVis   = Math.max(0, this.wrongVis   - 2 * dt);
    this.progress   = clamp(this.progress + progressDelta, 0, 1);
    return discomfortDelta;
  }

  releaseSqueeze(dt) {
    this.progress   = Math.max(0, this.progress - .06 * dt);
    this.squeezeVis = Math.max(0, this.squeezeVis - .4 * dt);
    this.wrongVis   = Math.max(0, this.wrongVis   - 3 * dt);
    this.openAmount = Math.max(0, this.openAmount - .5 * dt);
  }

  update(dt) {
    this.wobblePhase += this.wobbleSpeed * dt;
    if (this.extractFlash > 0) this.extractFlash -= 3 * dt;
  }

  render(ctx) {
    if (this.extracted) { this._renderExtracted(ctx); return; }

    const { x, y, radius, inflamR, squeezeVis, wrongVis, wobblePhase } = this;

    // Gentle idle wobble (breathing feel)
    const wobble = 1 + Math.sin(wobblePhase) * 0.012;

    ctx.save();

    // Inflammation halo
    this._renderInflam(ctx, wrongVis);

    // Type-specific body
    switch (this.type) {
      case 'whitehead': this._renderWhitehead(ctx, wobble); break;
      case 'blackhead': this._renderBlackhead(ctx, wobble); break;
      case 'cyst':      this._renderCyst(ctx, wobble);      break;
    }

    // Squeeze deformation overlay
    if (squeezeVis > 0.02) this._renderSqueezeVis(ctx, squeezeVis);

    // Progress ring
    if (this.progress > 0.05) this._renderProgressRing(ctx);

    ctx.restore();
  }

  _renderInflam(ctx, wrongBoost) {
    const { x, y, radius, inflamR, wrongVis } = this;
    const intensity = 0.28 + wrongVis * 0.55 + this.progress * 0.22;
    let r = 215, g = 72, b = 52;
    if (this.type === 'cyst') { r = 195; g = 52; b = 35; }

    const grad = ctx.createRadialGradient(x, y, radius * .55, x, y, inflamR);
    grad.addColorStop(0,   `rgba(${r},${g},${b},${clamp(intensity * .9,  0,1)})`);
    grad.addColorStop(.45, `rgba(${r},${g},${b},${clamp(intensity * .45, 0,1)})`);
    grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);
    ctx.beginPath(); ctx.arc(x, y, inflamR, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();
  }

  _renderWhitehead(ctx, wobble) {
    const { x, y, radius, openAmount } = this;
    const r = radius * wobble;
    const bump = r * (1 + this.squeezeVis * .12);

    // Skin-coloured bump
    const bg = ctx.createRadialGradient(x - r*.28, y - r*.28, 0, x, y, bump);
    bg.addColorStop(0,   'rgb(248,220,202)');
    bg.addColorStop(.55, 'rgb(222,158,135)');
    bg.addColorStop(1,   'rgb(205,125,105)');
    ctx.beginPath(); ctx.arc(x, y, bump, 0, Math.PI * 2);
    ctx.fillStyle = bg; ctx.fill();

    // White / yellow tip
    const tipR = bump * (.28 + openAmount * .38);
    const tipG = ctx.createRadialGradient(x, y - bump*.18, 0, x, y, tipR);
    if (openAmount > .4) {
      tipG.addColorStop(0,   'rgba(255,255,228,1)');
      tipG.addColorStop(.55, 'rgba(248,238,175,.9)');
      tipG.addColorStop(1,   'rgba(238,208,155,0)');
    } else {
      tipG.addColorStop(0,   'rgba(253,250,232,1)');
      tipG.addColorStop(.72, 'rgba(242,232,192,.85)');
      tipG.addColorStop(1,   'rgba(232,202,162,0)');
    }
    ctx.beginPath(); ctx.arc(x, y, tipR, 0, Math.PI * 2);
    ctx.fillStyle = tipG; ctx.fill();

    // Specular highlight
    const hl = ctx.createRadialGradient(x - bump*.22, y - bump*.30, 0, x, y, bump);
    hl.addColorStop(0,   'rgba(255,255,255,.32)');
    hl.addColorStop(.38, 'rgba(255,255,255,.08)');
    hl.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(x, y, bump, 0, Math.PI * 2);
    ctx.fillStyle = hl; ctx.fill();

    // Opening slit when nearly extracted
    if (openAmount > .5) {
      const slitW = bump * .18 * openAmount;
      const slitH = bump * .06 * openAmount;
      ctx.save();
      ctx.beginPath(); ctx.ellipse(x, y, slitW, slitH, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(40,20,10,.85)'; ctx.fill();
      ctx.restore();
    }
  }

  _renderBlackhead(ctx, wobble) {
    const { x, y, radius, openAmount } = this;
    const r = radius * wobble;

    // Very subtle bump / skin tone
    const bg = ctx.createRadialGradient(x - r*.22, y - r*.22, 0, x, y, r * 1.05);
    bg.addColorStop(0,   'rgba(185,142,112,.9)');
    bg.addColorStop(.75, 'rgba(168,125,98,.6)');
    bg.addColorStop(1,   'rgba(150,108,85,0)');
    ctx.beginPath(); ctx.arc(x, y, r * 1.05, 0, Math.PI * 2);
    ctx.fillStyle = bg; ctx.fill();

    // Dark oxidised plug
    const poreR = r * (.85 + openAmount * .25);
    const pg = ctx.createRadialGradient(x, y, 0, x, y, poreR);
    pg.addColorStop(0,   'rgba(25,15,8,1)');
    pg.addColorStop(.50, 'rgba(52,34,22,1)');
    pg.addColorStop(.82, 'rgba(90,62,42,.9)');
    pg.addColorStop(1,   'rgba(130,95,70,0)');
    ctx.beginPath(); ctx.arc(x, y, poreR, 0, Math.PI * 2);
    ctx.fillStyle = pg; ctx.fill();

    // Sheen (blackheads have a slight gloss)
    const hl = ctx.createRadialGradient(x - r*.2, y - r*.25, 0, x, y, r);
    hl.addColorStop(0,   'rgba(255,255,255,.12)');
    hl.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = hl; ctx.fill();

    // Emerging plug filament when opening
    if (openAmount > .45) {
      const len = r * 1.6 * openAmount;
      ctx.save();
      ctx.strokeStyle = 'rgba(40,25,12,.9)';
      ctx.lineWidth = r * .45 * openAmount;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rand(-1,1), y - len);
      ctx.stroke();
      ctx.restore();
    }
  }

  _renderCyst(ctx, wobble) {
    const { x, y, radius, openAmount, squeezeVis, wrongVis } = this;
    const r = radius * wobble;
    const tension = .95 + squeezeVis * .08;

    // Deep red tense body
    const bg = ctx.createRadialGradient(x - r*.3, y - r*.3, 0, x, y, r * tension);
    bg.addColorStop(0,   'rgb(240,170,145)');
    bg.addColorStop(.35, 'rgb(210, 85, 62)');
    bg.addColorStop(.72, 'rgb(175, 50, 32)');
    bg.addColorStop(1,   'rgb(148, 38, 22)');
    ctx.beginPath(); ctx.arc(x, y, r * tension, 0, Math.PI * 2);
    ctx.fillStyle = bg; ctx.fill();

    // Tense sheen — glossy look
    const hl = ctx.createRadialGradient(x - r*.25, y - r*.32, r*.08, x, y, r);
    hl.addColorStop(0,   'rgba(255,255,255,.35)');
    hl.addColorStop(.35, 'rgba(255,255,255,.08)');
    hl.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(x, y, r * tension, 0, Math.PI * 2);
    ctx.fillStyle = hl; ctx.fill();

    // Visible content through thin skin when nearly ready
    if (this.progress > .55) {
      const reveal = (this.progress - .55) / .45;
      const cg = ctx.createRadialGradient(x, y, 0, x, y, r * .6);
      cg.addColorStop(0,   `rgba(248,240,195,${reveal * .55})`);
      cg.addColorStop(1,   `rgba(240,215,145,0)`);
      ctx.beginPath(); ctx.arc(x, y, r * .6, 0, Math.PI * 2);
      ctx.fillStyle = cg; ctx.fill();
    }

    // Opening on extraction
    if (openAmount > .3) {
      const ow = r * .22 * openAmount;
      const oh = r * .14 * openAmount;
      ctx.save();
      ctx.beginPath(); ctx.ellipse(x, y, ow, oh, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30,10,5,.9)'; ctx.fill();
      // Ooze at opening
      if (openAmount > .6) {
        const oozeG = ctx.createRadialGradient(x, y, 0, x, y, ow * 1.5);
        oozeG.addColorStop(0,   `rgba(248,240,195,${(openAmount-.6)*2.5})`);
        oozeG.addColorStop(1,   'rgba(248,240,195,0)');
        ctx.fillStyle = oozeG;
        ctx.beginPath(); ctx.ellipse(x, y, ow * 1.5, oh * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  _renderSqueezeVis(ctx, sv) {
    const { x, y, radius } = this;
    // Reddening veil
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.3);
    g.addColorStop(0,   `rgba(220,60,40,${sv * .45})`);
    g.addColorStop(1,   'rgba(220,60,40,0)');
    ctx.beginPath(); ctx.arc(x, y, radius * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
  }

  _renderProgressRing(ctx) {
    const { x, y, radius, progress } = this;
    const ringR = radius + 5;
    ctx.beginPath();
    ctx.arc(x, y, ringR, -Math.PI/2, -Math.PI/2 + progress * Math.PI * 2);
    ctx.strokeStyle = `rgba(120,220,120,${.5 + progress * .4})`;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  _renderExtracted(ctx) {
    const { x, y, radius } = this;
    // Residual hole + pink healing
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.8);
    g.addColorStop(0,   'rgba(25,12,8,.75)');
    g.addColorStop(.35, 'rgba(180,80,60,.35)');
    g.addColorStop(1,   'rgba(180,80,60,0)');
    ctx.beginPath(); ctx.arc(x, y, radius * 1.8, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();

    // Dark pore hole
    ctx.beginPath(); ctx.arc(x, y, radius * .45, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,8,4,.85)'; ctx.fill();
  }
}

// ─── Input Controller ─────────────────────────────────────────────────────────
class InputController {
  constructor(canvas) {
    this.canvas      = canvas;
    this.touchMap    = {};     // identifier → {x,y}
    this.squeeze     = null;
    this.initDist    = null;
    this.prevDist    = null;

    // Mouse (desktop)
    this.mDown       = false;
    this.mStart      = null;
    this.mPos        = null;

    canvas.addEventListener('touchstart',  e => this._ts(e), { passive: false });
    canvas.addEventListener('touchmove',   e => this._tm(e), { passive: false });
    canvas.addEventListener('touchend',    e => this._te(e), { passive: false });
    canvas.addEventListener('touchcancel', e => this._te(e), { passive: false });

    canvas.addEventListener('mousedown',  e => this._md(e));
    canvas.addEventListener('mousemove',  e => this._mm(e));
    canvas.addEventListener('mouseup',    e => this._mu(e));
    canvas.addEventListener('mouseleave', e => this._mu(e));
  }

  _ts(e) {
    e.preventDefault();
    for (const t of e.touches)
      this.touchMap[t.identifier] = { x: t.clientX, y: t.clientY };
    this._recalc();
  }
  _tm(e) {
    e.preventDefault();
    for (const t of e.touches)
      if (this.touchMap[t.identifier] !== undefined)
        this.touchMap[t.identifier] = { x: t.clientX, y: t.clientY };
    this._recalc();
  }
  _te(e) {
    e.preventDefault();
    const alive = new Set(Array.from(e.touches).map(t => t.identifier));
    for (const id of Object.keys(this.touchMap))
      if (!alive.has(Number(id))) delete this.touchMap[id];
    if (Object.keys(this.touchMap).length < 2) {
      this.initDist = this.prevDist = null;
      this.squeeze  = null;
    } else {
      this._recalc();
    }
  }

  _recalc() {
    const pts = Object.values(this.touchMap);
    if (pts.length < 2) { this.squeeze = null; return; }
    const [t1, t2] = pts;
    const dist  = Math.hypot(t2.x - t1.x, t2.y - t1.y);
    if (!this.initDist || this.initDist < 10) {
      this.initDist = dist;
      this.prevDist = dist;
    }
    const midX  = (t1.x + t2.x) / 2;
    const midY  = (t1.y + t2.y) / 2;
    const angle = ((Math.atan2(t2.y - t1.y, t2.x - t1.x) % Math.PI) + Math.PI) % Math.PI;
    const force = clamp((this.initDist - dist) / this.initDist, 0, 1);
    const speed = this.prevDist ? Math.abs(dist - this.prevDist) / Math.max(1, this.initDist) : 0;
    this.prevDist = dist;
    this.squeeze  = { isActive: true, midX, midY, angle, force, speed, t1, t2 };
  }

  // Desktop mouse — click near pimple, drag as squeeze vector
  _md(e) {
    this.mDown  = true;
    this.mStart = { x: e.clientX, y: e.clientY };
    this.mPos   = { x: e.clientX, y: e.clientY };
    this.initDist = null;
    this.squeeze  = null;
  }
  _mm(e) {
    if (!this.mDown) return;
    this.mPos = { x: e.clientX, y: e.clientY };
    this._recalcMouse();
  }
  _mu() {
    this.mDown  = false;
    this.squeeze = null;
  }
  _recalcMouse() {
    if (!this.mDown || !this.mStart) return;
    const dx  = this.mPos.x - this.mStart.x;
    const dy  = this.mPos.y - this.mStart.y;
    const drag = Math.hypot(dx, dy);
    if (drag < 4) { this.squeeze = null; return; }
    const rawAng = Math.atan2(dy, dx);
    const angle  = ((rawAng % Math.PI) + Math.PI) % Math.PI;
    const force  = clamp(drag / CFG.MOUSE_MAX_DRAG, 0, 1);
    // Speed is simplified on desktop (steady drag assumed slow)
    const speed  = 0.02;
    const offset = 55;
    this.squeeze = {
      isActive: true,
      midX: this.mStart.x,
      midY: this.mStart.y,
      angle,
      force,
      speed,
      t1: {
        x: this.mStart.x - Math.cos(rawAng) * offset,
        y: this.mStart.y - Math.sin(rawAng) * offset,
      },
      t2: {
        x: this.mStart.x + Math.cos(rawAng) * offset,
        y: this.mStart.y + Math.sin(rawAng) * offset,
      },
    };
  }

  getData() { return this.squeeze; }
}

// ─── Discomfort Bar ───────────────────────────────────────────────────────────
class DiscomfortBar {
  constructor() { this.reset(); }
  reset() {
    this.value         = 0;
    this._dangerTimer  = 0;
    this._shakeTimer   = 0;
  }
  /* Returns 'quit' if game should end, else null. discomfortDelta is per-second value. */
  update(delta, dt) {
    this.value  = clamp(this.value + delta * dt, 0, 100);
    // Idle decay when no squeeze active
    if (delta === 0) this.value = Math.max(0, this.value - CFG.DISCOMFORT_IDLE_DECAY * dt);

    if (this.value >= CFG.DISCOMFORT_DANGER) {
      this._dangerTimer += dt * 1000;
      if (this._dangerTimer >= CFG.DISCOMFORT_QUIT_MS) return 'quit';
    } else {
      this._dangerTimer = 0;
    }
    return null;
  }
  get dangerFraction() {
    if (this.value < CFG.DISCOMFORT_DANGER) return 0;
    return (this._dangerTimer / CFG.DISCOMFORT_QUIT_MS);
  }
  get inDanger() { return this.value >= CFG.DISCOMFORT_DANGER; }
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
const UI = {
  discomfortFill:  null,
  discomfortGlow:  null,
  scoreValue:      null,
  feedbackText:    null,
  remainingCount:  null,
  clientFace:      null,
  hud:             null,

  init() {
    this.discomfortFill = document.getElementById('discomfort-fill');
    this.discomfortGlow = document.getElementById('discomfort-glow');
    this.scoreValue     = document.getElementById('score-value');
    this.feedbackText   = document.getElementById('feedback-text');
    this.remainingCount = document.getElementById('remaining-count');
    this.clientFace     = document.getElementById('client-face');
    this.hud            = document.getElementById('hud');
  },

  updateDiscomfort(bar) {
    const pct  = bar.value;
    this.discomfortFill.style.width = `${pct}%`;

    if (bar.inDanger) {
      const pulse = Math.sin(Date.now() / 90) * .5 + .5;
      this.discomfortGlow.style.boxShadow =
        `inset 0 0 ${8 + pulse * 10}px rgba(244,67,54,${.5 + pulse * .3})`;
      this.hud.classList.add('hud-danger');
    } else {
      this.discomfortGlow.style.boxShadow = '';
      this.hud.classList.remove('hud-danger');
    }

    // Client face
    const faces = CLIENT_FACES;
    const idx   = Math.min(faces.length - 1, Math.floor(pct / 17));
    this.clientFace.textContent = faces[idx];
  },

  updateScore(score) {
    this.scoreValue.textContent = score;
  },

  updateRemaining(n) {
    this.remainingCount.textContent = n;
  },

  setFeedback(msg) {
    this.feedbackText.textContent = msg || '\u00a0';
  },

  showScorePopup(x, y, pts) {
    const el = document.createElement('div');
    el.className     = 'score-popup';
    el.textContent   = `+${pts}`;
    el.style.left    = `${x}px`;
    el.style.top     = `${y}px`;
    el.style.transform = 'translate(-50%, -50%)';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  },

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const s = document.getElementById(id);
    if (s) s.classList.add('active');
  },

  hideScreens() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  },
};

// ─── Game ─────────────────────────────────────────────────────────────────────
class PimplePopGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx    = this.canvas.getContext('2d');
    this.state  = 'menu';
    this.score  = 0;
    this.level  = 1;

    this.skinCanvas  = null;
    this.pimples     = [];
    this.effects     = [];
    this.skinDents   = [];

    this.discomfort  = new DiscomfortBar();
    this.input       = new InputController(this.canvas);
    this.lastTime    = 0;
    this._shakeX = 0; this._shakeY = 0; this._shakeAmt = 0;

    // Feedback throttle
    this._feedbackMsg  = '';
    this._feedbackTimer = 0;

    UI.init();
    this._bindUI();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    requestAnimationFrame(t => this._loop(t));
  }

  _bindUI() {
    document.getElementById('btn-start').addEventListener('click',   () => this.startGame());
    document.getElementById('btn-restart').addEventListener('click', () => this.startGame());
    document.getElementById('btn-next').addEventListener('click',    () => this._nextLevel());
  }

  _resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    if (this.state === 'playing') this._buildSkin();
  }

  // ── Game flow ──────────────────────────────────────────────────────────────
  startGame() {
    this.score = 0;
    this.level = 1;
    UI.hideScreens();
    this._startLevel();
  }

  _nextLevel() {
    this.level++;
    UI.hideScreens();
    this._startLevel();
  }

  _startLevel() {
    this.pimples  = [];
    this.effects  = [];
    this.skinDents = [];
    this.discomfort.reset();
    this._buildSkin();
    this._spawnPimples();
    this.state = 'playing';
    UI.updateScore(this.score);
    UI.updateRemaining(this.pimples.length);
    UI.setFeedback('Find a pimple and squeeze!');
  }

  _buildSkin() {
    const tone = CFG.SKIN_TONES[Math.floor(Math.random() * CFG.SKIN_TONES.length)];
    this.skinCanvas = buildSkinTexture(this.canvas.width, this.canvas.height, tone);
  }

  _spawnPimples() {
    const { min, max } = CFG.PIMPLE_COUNT;
    // Scale count with level
    const base  = min + Math.floor(Math.random() * (max - min + 1));
    const count = Math.min(base + Math.floor(this.level * .5), 12);

    const margin = 70;
    const minDist = 90;
    const w = this.canvas.width, h = this.canvas.height;

    // Adjust type weights with level (more cysts at higher levels)
    const cystW = Math.min(.45, CFG.TYPE_WEIGHTS.cyst + this.level * .05);
    const bhW   = Math.max(.30, CFG.TYPE_WEIGHTS.blackhead - this.level * .02);
    const whW   = Math.max(.20, CFG.TYPE_WEIGHTS.whitehead - this.level * .02);
    const weights = { whitehead: whW, blackhead: bhW, cyst: cystW };

    for (let i = 0; i < count; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 60 && !placed; attempt++) {
        const x = margin + Math.random() * (w - margin * 2);
        const y = margin + Math.random() * (h - margin * 2);
        if (!this.pimples.some(p => Math.hypot(p.x - x, p.y - y) < minDist)) {
          const type = weightedRandom(weights);
          this.pimples.push(new Pimple(x, y, type));
          placed = true;
        }
      }
    }
  }

  // ── Game Loop ──────────────────────────────────────────────────────────────
  _loop(ts) {
    const dt = clamp((ts - this.lastTime) / 1000, 0, .05);
    this.lastTime = ts;

    if (this.state === 'playing') this._update(dt);
    this._render(dt);

    requestAnimationFrame(t => this._loop(t));
  }

  _update(dt) {
    const sq = this.input.getData();

    // Find active pimple (closest to midpoint within activation radius)
    let activePimple = null;
    if (sq) {
      let best = CFG.SQUEEZE_ACTIVATION_RADIUS;
      this.pimples.forEach(p => {
        if (p.extracted) return;
        const d = Math.hypot(p.x - sq.midX, p.y - sq.midY);
        if (d < best) { best = d; activePimple = p; }
      });
    }

    // Update each pimple
    let totalDiscomfort = 0;
    let feedbackSet = false;

    this.pimples.forEach(p => {
      p.update(dt);

      if (sq && p === activePimple) {
        const delta = p.processSqueeze(sq, dt);
        totalDiscomfort += delta;

        // Feedback messages
        if (!feedbackSet) {
          const adiff = Math.abs(squeezeAngleDiff(sq.angle, p.targetAngle));
          if (sq.speed > PIMPLE_CFG[p.type].speedLimit) {
            this._setFeedback('Too fast! Slow down…', dt);
          } else if (adiff <= p.angleTolerance && sq.force >= p.forceMin && sq.force <= p.forceMax) {
            const pct = Math.round(p.progress * 100);
            if (pct > 70) this._setFeedback(`Almost there… ${pct}%`, dt);
            else this._setFeedback('Good angle! Keep it steady…', dt);
          } else if (adiff > p.angleTolerance) {
            this._setFeedback('Wrong angle — adjust your fingers', dt);
          } else if (sq.force > p.forceMax) {
            this._setFeedback('Too much pressure!', dt);
          } else {
            this._setFeedback('Squeeze a little more…', dt);
          }
          feedbackSet = true;
        }

        if (p.progress >= 1 && !p.extracted) {
          this._extractPimple(p);
        }
      } else {
        p.releaseSqueeze(dt);
      }
    });

    if (!sq || !activePimple) {
      // Idle: decay discomfort, update feedback timer
      totalDiscomfort = 0;
      this._feedbackTimer -= dt;
      if (this._feedbackTimer <= 0) UI.setFeedback('Find a pimple and squeeze!');
    }

    // Update discomfort bar
    const result = this.discomfort.update(totalDiscomfort, dt);
    UI.updateDiscomfort(this.discomfort);

    if (result === 'quit') {
      this._gameOver('too-much-discomfort');
      return;
    }

    // Screen shake at high discomfort
    if (this.discomfort.value > 60) {
      const intensity = (this.discomfort.value - 60) / 40;
      this._shakeAmt = intensity * 6;
    } else {
      this._shakeAmt *= .85;
    }

    // Skin dents at finger positions
    this.skinDents = [];
    if (sq && sq.t1 && sq.t2) {
      this.skinDents.push(new SkinDent(sq.t1.x, sq.t1.y, 22 + sq.force * 18));
      this.skinDents.push(new SkinDent(sq.t2.x, sq.t2.y, 22 + sq.force * 18));
    }

    // Update effects
    this.effects = this.effects.filter(e => e.update(dt));

    // Check level complete
    if (this.pimples.every(p => p.extracted)) {
      setTimeout(() => this._levelComplete(), 800);
      this.state = 'transitioning';
    }
  }

  _setFeedback(msg, dt) {
    if (this._feedbackMsg !== msg) {
      this._feedbackMsg = msg;
      UI.setFeedback(msg);
    }
    this._feedbackTimer = .8;
  }

  _extractPimple(p) {
    p.extracted   = true;
    p.extractFlash = 1;
    p.openAmount   = 1;
    const pts = p.points * this.level;
    this.score += pts;
    UI.updateScore(this.score);
    UI.updateRemaining(this.pimples.filter(x => !x.extracted).length);
    this.effects.push(new GooEffect(p.x, p.y, p.type, p.radius));
    UI.showScorePopup(p.x, p.y - p.radius - 20, pts);
    UI.setFeedback('✓ Extracted!');
    this._feedbackTimer = 1.2;
    this._feedbackMsg = '✓ Extracted!';
  }

  _gameOver(reason) {
    this.state = 'gameover';
    document.getElementById('gameover-score').textContent = this.score;
    document.getElementById('gameover-message').textContent =
      reason === 'too-much-discomfort'
        ? 'The discomfort was too much to bear…'
        : 'The session ended unexpectedly.';
    UI.showScreen('screen-gameover');
  }

  _levelComplete() {
    this.state = 'complete';
    document.getElementById('complete-score').textContent = this.score;
    document.getElementById('complete-message').textContent =
      `Level ${this.level} cleared! ${this.pimples.length} extraction${this.pimples.length > 1 ? 's' : ''}!`;
    UI.showScreen('screen-complete');
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  _render(dt) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;

    ctx.save();

    // Screen shake
    if (this._shakeAmt > 0.5) {
      const sx = (Math.random() - .5) * this._shakeAmt;
      const sy = (Math.random() - .5) * this._shakeAmt;
      ctx.translate(sx, sy);
    }

    ctx.clearRect(-20, -20, W + 40, H + 40);

    // Skin background
    if (this.skinCanvas) ctx.drawImage(this.skinCanvas, 0, 0);

    if (this.state === 'playing' || this.state === 'transitioning') {
      // Skin dents (finger press)
      this.skinDents.forEach(d => d.render(ctx));

      // Squeeze axis visualiser (subtle guide line between fingers)
      const sq = this.input.getData();
      if (sq && sq.t1 && sq.t2) {
        ctx.save();
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.moveTo(sq.t1.x, sq.t1.y);
        ctx.lineTo(sq.t2.x, sq.t2.y);
        ctx.stroke();
        // Finger circle indicators
        [sq.t1, sq.t2].forEach(t => {
          ctx.beginPath();
          ctx.arc(t.x, t.y, 18 + sq.force * 8, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,255,255,${0.25 + sq.force * .3})`;
          ctx.lineWidth   = 2;
          ctx.setLineDash([]);
          ctx.stroke();
        });
        ctx.restore();
      }

      // Pimples
      this.pimples.forEach(p => p.render(ctx));

      // Goo effects
      this.effects.forEach(e => e.render(ctx));
    }

    ctx.restore();
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  window._game = new PimplePopGame();
});
