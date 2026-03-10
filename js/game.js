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
  DISCOMFORT_DANGER:       78,
  DISCOMFORT_QUIT_MS:    2600,
  DISCOMFORT_IDLE_DECAY:    5,

  // Squeeze detection
  SQUEEZE_ACTIVATION_RADIUS: 100,
  MOUSE_MAX_DRAG:            160,
  MOUSE_MIN_DRAG:              4,
  TOUCH_VIRTUAL_OFFSET:       55,
  TOUCH_MIN_INIT_DIST:        10,

  // Visual
  SKIN_PORE_DENSITY:   0.018,
  SKIN_HAIR_DENSITY:   0.004,
  PULSE_SPEED_MS:         90,
  NEAR_COMPLETE_PCT:      70,

  // Game loop
  MAX_FRAME_DT: 0.05,

  // Debris & swab
  SWAB_RADIUS:        32,
  DEBRIS_HYGIENE_PTS:  5,

  // Breathing
  BREATH_RATE:      0.22,   // cycles per second
  BREATH_AMPLITUDE: 2.0,    // px peak vertical travel
};

// ─── Difficulty Modes ─────────────────────────────────────────────────────────
const DIFFICULTY_MODES = {
  easy: {
    label: '🌸 Easy',
    angleMult: 1.80, forceMult: 1.60, speedMult: 1.80,
    ptsMult:   0.60, discMult:  0.70,
    desc: 'Wide tolerances · 0.6× points',
  },
  normal: {
    label: '⚡ Normal',
    angleMult: 1.00, forceMult: 1.00, speedMult: 1.00,
    ptsMult:   1.00, discMult:  1.00,
    desc: 'Standard play · 1× points',
  },
  hard: {
    label: '💀 Hard',
    angleMult: 0.60, forceMult: 0.70, speedMult: 0.70,
    ptsMult:   2.00, discMult:  1.35,
    desc: 'Precision required · 2× points',
  },
};

// ─── Client Profiles ──────────────────────────────────────────────────────────
const CLIENT_PROFILES = [
  { name: 'Alex',   emoji: '😊', painTol: 1.30, quitMs: 3400, trait: 'Easygoing'      },
  { name: 'Jordan', emoji: '😐', painTol: 1.00, quitMs: 2600, trait: 'Average'         },
  { name: 'Sam',    emoji: '😬', painTol: 0.65, quitMs: 1800, trait: 'Sensitive'       },
  { name: 'Riley',  emoji: '🤗', painTol: 1.60, quitMs: 4200, trait: 'Very tolerant'  },
  { name: 'Morgan', emoji: '😰', painTol: 0.45, quitMs: 1200, trait: 'Very sensitive' },
  { name: 'Casey',  emoji: '🧘', painTol: 1.20, quitMs: 3000, trait: 'Calm'           },
];

// ─── Skin Areas ───────────────────────────────────────────────────────────────
const SKIN_AREAS = [
  { name: 'Nose',     emoji: '👃', densityMult: 1.50,
    weights: { whitehead: 0.20, blackhead: 0.65, cyst: 0.15 }, desc: 'High blackhead density' },
  { name: 'Cheek',    emoji: '✨', densityMult: 1.00,
    weights: { whitehead: 0.45, blackhead: 0.35, cyst: 0.20 }, desc: 'Balanced mix'           },
  { name: 'Forehead', emoji: '🧠', densityMult: 1.30,
    weights: { whitehead: 0.50, blackhead: 0.35, cyst: 0.15 }, desc: 'Whitehead prone'        },
  { name: 'Back',     emoji: '💪', densityMult: 1.80,
    weights: { whitehead: 0.25, blackhead: 0.30, cyst: 0.45 }, desc: 'Heavy cyst zone'        },
  { name: 'Chin',     emoji: '😤', densityMult: 1.20,
    weights: { whitehead: 0.35, blackhead: 0.30, cyst: 0.35 }, desc: 'Cyst prone'             },
];

// ─── Tool Definitions ─────────────────────────────────────────────────────────
const TOOL_DEFS = {
  squeeze:   { maxUses: Infinity },
  numbing:   { maxUses: 3        },
  extractor: { maxUses: Infinity },
  lancet:    { maxUses: 2        },
  swab:      { maxUses: Infinity },
};

// ─── Pimple Config ────────────────────────────────────────────────────────────
const PIMPLE_CFG = {
  whitehead: {
    minR: 7, maxR: 14, inflamMult: 2.3,
    baseAngle: 0, angleTolerance: 0.42,
    forceMin: 0.22, forceMax: 0.62, speedLimit: 0.22,
    extractDuration: 2.0, discomfortRate: 13, reliefRate: 8, points: 100,
  },
  blackhead: {
    minR: 3, maxR: 8, inflamMult: 1.25,
    baseAngle: 0, angleTolerance: 0.30,
    forceMin: 0.14, forceMax: 0.44, speedLimit: 0.25,
    extractDuration: 1.4, discomfortRate: 7, reliefRate: 5, points: 50,
  },
  cyst: {
    minR: 18, maxR: 30, inflamMult: 2.9,
    baseAngle: null, angleTolerance: 0.21,
    forceMin: 0.28, forceMax: 0.58, speedLimit: 0.09,
    extractDuration: 4.0, discomfortRate: 32, reliefRate: 16, points: 500,
  },
};

const CLIENT_FACES = ['😊','😐','😣','😖','😤','🤯'];

// ─── Utility ──────────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp  = (a, b, t)   => a + (b - a) * t;
const rand  = (lo, hi)    => lo + Math.random() * (hi - lo);

function weightedRandom(obj) {
  const keys  = Object.keys(obj);
  const vals  = Object.values(obj);
  const total = vals.reduce((s, v) => s + v, 0);
  let r = Math.random() * total;
  for (let i = 0; i < keys.length; i++) { r -= vals[i]; if (r <= 0) return keys[i]; }
  return keys[keys.length - 1];
}

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
  _h(x, y) { return this.perm[(this.perm[x & 255] + y) & 255] / 255; }
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
// Returns { canvas, hairs[], tone } — hairs are rendered each frame for animation.
function buildSkinTexture(w, h, tone) {
  const offscreen = document.createElement('canvas');
  offscreen.width = w; offscreen.height = h;
  const ctx  = offscreen.getContext('2d');
  const noise = new ValueNoise(Math.random() * 99999 | 0);

  // Pixel-by-pixel base layer
  const img = ctx.createImageData(w, h);
  const d   = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const large = noise.n(x / 90, y / 90);
      const mid   = noise.n(x / 30, y / 30);
      const fine  = noise.n(x / 8,  y / 8);
      const variation = (large * 0.55 + mid * 0.30 + fine * 0.15) * 28 - 10;
      d[i    ] = clamp(tone.r + variation,        0, 255);
      d[i + 1] = clamp(tone.g + variation * 0.82, 0, 255);
      d[i + 2] = clamp(tone.b + variation * 0.60, 0, 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Subsurface-scattering blobs
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

  // Vignette
  ctx.globalCompositeOperation = 'source-over';
  const vig = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.3, w/2, h/2, Math.min(w,h)*0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  // Generate hair positions for animated per-frame rendering (NOT baked in)
  const hairs = [];
  const hairCount = Math.floor(w * h * CFG.SKIN_HAIR_DENSITY * 0.0006);
  for (let i = 0; i < hairCount; i++) {
    hairs.push({
      hx:    Math.random() * w,
      hy:    Math.random() * h,
      len:   6 + Math.random() * 16,
      ang:   rand(-0.45, 0.45) + Math.PI / 2,
      phase: Math.random() * Math.PI * 2,
    });
  }

  return { canvas: offscreen, hairs, tone };
}

// ─── Particle / Goo Effect ───────────────────────────────────────────────────
class GooEffect {
  constructor(x, y, type, radius, onSplatSpawn) {
    this.x = x; this.y = y; this.type = type;
    this.age = 0; this.done = false;
    this.particles = []; this.blobs = []; this.splats = [];
    this.onSplatSpawn = onSplatSpawn;
    this._spawn(radius);
  }

  _col() {
    switch (this.type) {
      case 'whitehead': return { r:252, g:248, b:215, r2:245, g2:230, b2:170 };
      case 'blackhead': return { r:55,  g:38,  b:24,  r2:80,  g2:55,  b2:35  };
      default:          return { r:250, g:240, b:195, r2:240, g2:215, b2:145 };
    }
  }

  _spawn(radius) {
    const c      = this._col();
    const isCyst = this.type === 'cyst';
    const count  = isCyst ? 36 : (this.type === 'blackhead' ? 18 : 24);

    for (let i = 0; i < count; i++) {
      const ang    = Math.random() * Math.PI * 2;
      const spd    = rand(isCyst ? 1.5 : 3, isCyst ? 5 : 11);
      const sz     = rand(isCyst ? 3 : 1.5, isCyst ? 9 : 5);
      const upBias = isCyst ? 0 : -2.5;
      this.particles.push({
        x: this.x, y: this.y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd + upBias,
        size: sz, life: 1, decay: rand(.30, .65), gravity: rand(4, 8),
        cr: c.r, cg: c.g, cb: c.b,
      });
    }

    if (isCyst) {
      for (let i = 0; i < 6; i++) {
        this.blobs.push({
          x: this.x, y: this.y,
          vx: rand(-1.5, 1.5), vy: rand(-3, -.5),
          r: rand(6, 13), alpha: 1, trail: [],
          cr: c.r2, cg: c.g2, cb: c.b2,
        });
      }
    }

    const splatCount = isCyst ? 10 : 5;
    for (let i = 0; i < splatCount; i++) {
      const dist = radius + rand(5, isCyst ? 55 : 30);
      const ang  = Math.random() * Math.PI * 2;
      const s = {
        x: this.x + Math.cos(ang) * dist,
        y: this.y + Math.sin(ang) * dist,
        r: rand(.8, isCyst ? 5.5 : 3),
        cr: c.r2, cg: c.g2, cb: c.b2,
        alpha: rand(.5, .85),
        delay: rand(0, .12),
      };
      this.splats.push(s);
    }
    if (this.onSplatSpawn) this.onSplatSpawn(this.splats);
  }

  update(dt) {
    this.age += dt;
    this.particles.forEach(p => {
      p.x += p.vx * dt * 60; p.y += p.vy * dt * 60;
      p.vy += p.gravity * dt; p.vx *= 0.978;
      p.life -= p.decay * dt;
    });
    this.particles = this.particles.filter(p => p.life > 0);
    this.blobs.forEach(b => {
      b.trail.push({ x: b.x, y: b.y, r: b.r });
      if (b.trail.length > 14) b.trail.shift();
      b.x += b.vx * dt * 60; b.y += b.vy * dt * 60;
      b.vy += 4 * dt; b.r *= (1 - .6 * dt); b.alpha -= .25 * dt;
    });
    this.blobs = this.blobs.filter(b => b.alpha > 0 && b.r > .8);
    this.done  = this.particles.length === 0 && this.blobs.length === 0 && this.age > 2.5;
    return !this.done;
  }

  render(ctx) {
    this.splats.forEach(s => {
      const a = Math.min(1, Math.max(0, (this.age - s.delay) * 8)) * s.alpha;
      if (a <= 0) return;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${s.cr},${s.cg},${s.cb},${a})`; ctx.fill();
    });
    this.blobs.forEach(b => {
      if (b.trail.length < 2) return;
      ctx.beginPath(); ctx.moveTo(b.trail[0].x, b.trail[0].y);
      for (let i = 1; i < b.trail.length; i++) ctx.lineTo(b.trail[i].x, b.trail[i].y);
      ctx.strokeStyle = `rgba(${b.cr},${b.cg},${b.cb},${b.alpha * .8})`;
      ctx.lineWidth = b.r * 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.stroke();
    });
    this.particles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(.5, p.size * p.life), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.cr},${p.cg},${p.cb},${Math.min(1, p.life * 1.2)})`; ctx.fill();
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

// ─── Persistent Debris ───────────────────────────────────────────────────────
class PersistentDebris {
  constructor() { this.items = []; this._id = 0; }

  addSplats(splats) {
    splats.forEach(s => {
      this.items.push({
        id: this._id++,
        x: s.x, y: s.y, r: s.r * 1.15,
        cr: s.cr, cg: s.cg, cb: s.cb,
        alpha: s.alpha * 0.80,
        cleaned: false,
      });
    });
  }

  cleanAt(x, y, radius) {
    let count = 0;
    this.items.forEach(item => {
      if (!item.cleaned && Math.hypot(item.x - x, item.y - y) < radius + item.r * 3) {
        item.cleaned = true; count++;
      }
    });
    return count;
  }

  get dirtyCount() { return this.items.filter(i => !i.cleaned).length; }

  render(ctx) {
    this.items.forEach(item => {
      if (item.cleaned) return;
      ctx.beginPath(); ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${item.cr},${item.cg},${item.cb},${item.alpha})`; ctx.fill();
    });
  }

  clear() { this.items = []; }
}

// ─── Pimple ───────────────────────────────────────────────────────────────────
class Pimple {
  constructor(x, y, type, diffMod) {
    this.x = x; this.y = y; this.type = type;
    const c  = PIMPLE_CFG[type];
    const dm = diffMod || { angleMult:1, forceMult:1, speedMult:1, ptsMult:1, discMult:1 };

    this.radius     = rand(c.minR, c.maxR);
    this.inflamR    = this.radius * c.inflamMult;
    this.points     = c.points;

    const baseAngle      = c.baseAngle !== null ? c.baseAngle : Math.random() * Math.PI;
    this.targetAngle    = baseAngle + rand(-.35, .35);
    this.angleTolerance = c.angleTolerance * dm.angleMult;
    this.forceMin       = c.forceMin  / dm.forceMult;
    this.forceMax       = c.forceMax  * dm.forceMult;
    this.speedLimit     = c.speedLimit * dm.speedMult;
    this.extractDur     = c.extractDuration;
    this.discomfortRate = c.discomfortRate * dm.discMult;
    this.reliefRate     = c.reliefRate;

    // State
    this.progress      = 0;
    this.extracted     = false;
    this.squeezeVis    = 0;
    this.wrongVis      = 0;
    this.wobblePhase   = Math.random() * Math.PI * 2;
    this.wobbleSpeed   = rand(.8, 1.4);
    this.openAmount    = 0;
    this.extractFlash  = 0;
    this.squeezeAngle  = 0;   // current squeeze axis (for oval deformation)

    // Tool states
    this.numbed  = false;
    this.lanced  = false;

    // Blackhead snake emergence
    this.snakeProgress = 0;
    this.snakePhase    = Math.random() * Math.PI * 2;

    // Comedone extractor state
    this.extractorActive = false;
    this.extractorDur    = type === 'blackhead' ? 1.8 : 2.5;
  }

  applyNumbing() {
    if (this.numbed) return false;
    this.numbed = true;
    this.discomfortRate *= 0.30;  // Reduces to 30% of original rate (70% reduction)
    return true;
  }

  applyLancet() {
    if (this.type !== 'cyst' || this.lanced) return false;
    this.lanced = true;
    this.extractDur *= 0.55;  // 45% easier to extract
    return true;
  }

  processSqueeze(sq, dt) {
    if (this.extracted) return 0;
    this.squeezeAngle = sq.angle;

    const angleDiff = Math.abs(squeezeAngleDiff(sq.angle, this.targetAngle));
    const isAngle   = angleDiff  <= this.angleTolerance;
    const isForce   = sq.force   >= this.forceMin && sq.force <= this.forceMax;
    const isTooFast = sq.speed   >  this.speedLimit;
    const isTooHard = sq.force   >  this.forceMax;

    let discomfortDelta = 0, progressDelta = 0;

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
      if (this.type === 'blackhead') {
        this.snakeProgress = clamp(this.snakeProgress + (dt / this.extractDur) * 0.90, 0, 1);
      }
    }

    this.squeezeVis = Math.max(0, this.squeezeVis - .15 * dt);
    this.wrongVis   = Math.max(0, this.wrongVis   - 2  * dt);
    this.progress   = clamp(this.progress + progressDelta, 0, 1);
    return discomfortDelta;
  }

  processExtractor(dt) {
    if (this.extracted || this.type === 'cyst') return 0;
    this.extractorActive = true;
    this.progress   = clamp(this.progress + dt / this.extractorDur, 0, 1);
    this.squeezeVis = Math.min(.55, this.squeezeVis + 0.5 * dt);
    this.openAmount = clamp(this.progress * 1.1, 0, 1);
    if (this.type === 'blackhead') {
      this.snakeProgress = clamp(this.snakeProgress + (dt / this.extractorDur) * 0.80, 0, 1);
    }
    return -2;  // slight relief
  }

  releaseSqueeze(dt) {
    this.extractorActive = false;
    this.progress   = Math.max(0, this.progress - .06 * dt);
    this.squeezeVis = Math.max(0, this.squeezeVis - .4 * dt);
    this.wrongVis   = Math.max(0, this.wrongVis   - 3  * dt);
    this.openAmount = Math.max(0, this.openAmount - .5  * dt);
  }

  update(dt) {
    this.wobblePhase += this.wobbleSpeed * dt;
    if (this.extractFlash > 0) this.extractFlash -= 3 * dt;
  }

  render(ctx) {
    if (this.extracted) { this._renderExtracted(ctx); return; }

    const { x, y, radius, inflamR, squeezeVis, wrongVis, wobblePhase } = this;
    const wobble = 1 + Math.sin(wobblePhase) * 0.012;

    ctx.save();

    // Inflammation halo
    this._renderInflam(ctx, wrongVis);

    // Oval squeeze deformation — compress along squeeze axis, bulge perpendicular
    if (squeezeVis > 0.02) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.squeezeAngle);
      ctx.scale(1 - squeezeVis * 0.24, 1 + squeezeVis * 0.30);
      ctx.rotate(-this.squeezeAngle);
      ctx.translate(-x, -y);
    }

    switch (this.type) {
      case 'whitehead': this._renderWhitehead(ctx, wobble); break;
      case 'blackhead': this._renderBlackhead(ctx, wobble); break;
      case 'cyst':      this._renderCyst(ctx, wobble);      break;
    }

    if (squeezeVis > 0.02) ctx.restore();

    // Emerging content rendered without deform so it pushes straight upward
    this._renderEmergingContent(ctx, wobble);

    if (squeezeVis > 0.02) this._renderSqueezeVis(ctx, squeezeVis);
    if (this.progress > 0.05) this._renderProgressRing(ctx);
    if (this.extractorActive)  this._renderExtractorRing(ctx);
    if (this.numbed)            this._renderNumbingGlow(ctx);
    if (this.lanced)            this._renderLancedMark(ctx);

    ctx.restore();
  }

  // ── Emerging content: white head for whitehead/cyst; dark snake for blackhead ─
  _renderEmergingContent(ctx, wobble) {
    const { x, y, radius, progress, squeezeVis } = this;

    if ((this.type === 'whitehead' || this.type === 'cyst') && progress > 0.22 && squeezeVis > 0.04) {
      const t      = (progress - 0.22) / 0.78;
      const amount = t * Math.min(squeezeVis * 1.5, 1);
      if (amount > 0.01) {
        const headR = radius * 0.28 * amount;
        const headY = y - radius * 0.32 * amount;
        ctx.save();
        const hg = ctx.createRadialGradient(x, headY - headR * 0.25, 0, x, headY, headR * 1.8);
        hg.addColorStop(0,   'rgba(255,255,235,1)');
        hg.addColorStop(0.5, 'rgba(252,248,210,0.94)');
        hg.addColorStop(1,   'rgba(245,228,175,0)');
        ctx.beginPath(); ctx.arc(x, headY, headR, 0, Math.PI * 2);
        ctx.fillStyle = hg; ctx.fill();
        ctx.restore();
      }
    }

    if (this.type === 'blackhead' && this.snakeProgress > 0.06) {
      const maxLen  = radius * 4.0;
      const len     = maxLen * this.snakeProgress;
      const waveAmp = radius * 0.35;
      const segs    = 20;
      ctx.save();
      ctx.lineWidth   = Math.max(0.8, radius * 0.40 * (0.4 + this.snakeProgress * 0.6));
      ctx.strokeStyle = 'rgba(26,14,5,0.94)';
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let i = 1; i <= segs; i++) {
        const t  = i / segs;
        const wX = Math.sin(t * Math.PI * 5 + this.snakePhase) * waveAmp * t;
        ctx.lineTo(x + wX, y - t * len);
      }
      ctx.stroke();
      // rounded tip
      const tipWX = Math.sin(Math.PI * 5 + this.snakePhase) * waveAmp;
      ctx.beginPath();
      ctx.arc(x + tipWX, y - len, Math.max(0.5, radius * 0.20 * this.snakeProgress), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(38,22,8,0.90)'; ctx.fill();
      ctx.restore();
    }
  }

  _renderExtractorRing(ctx) {
    const { x, y, radius, progress } = this;
    const ringR = radius * 1.65;
    ctx.save();
    // Metal hoop shadow
    ctx.beginPath(); ctx.arc(x, y + 1, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.lineWidth = 4; ctx.stroke();
    // Metal hoop body
    ctx.beginPath(); ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(185,192,200,0.80)'; ctx.lineWidth = 3; ctx.stroke();
    // Progress arc
    ctx.beginPath();
    ctx.arc(x, y, ringR, -Math.PI / 2, -Math.PI / 2 + clamp(progress, 0, 1) * Math.PI * 2);
    ctx.strokeStyle = `rgba(100,228,100,0.88)`; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }

  _renderNumbingGlow(ctx) {
    const { x, y, radius } = this;
    const g = ctx.createRadialGradient(x, y, radius * 0.4, x, y, radius * 2.2);
    g.addColorStop(0, 'rgba(110,190,255,0.28)');
    g.addColorStop(1, 'rgba(110,190,255,0)');
    ctx.beginPath(); ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
  }

  _renderLancedMark(ctx) {
    const { x, y, radius } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,110,90,0.80)'; ctx.lineWidth = 1.5;
    const s = radius * 0.22;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
    ctx.stroke();
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
    const r    = radius * wobble;
    const bump = r * (1 + this.squeezeVis * .12);

    const bg = ctx.createRadialGradient(x - r*.28, y - r*.28, 0, x, y, bump);
    bg.addColorStop(0, 'rgb(248,220,202)');
    bg.addColorStop(.55, 'rgb(222,158,135)');
    bg.addColorStop(1,   'rgb(205,125,105)');
    ctx.beginPath(); ctx.arc(x, y, bump, 0, Math.PI * 2);
    ctx.fillStyle = bg; ctx.fill();

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

    const hl = ctx.createRadialGradient(x - bump*.22, y - bump*.30, 0, x, y, bump);
    hl.addColorStop(0,   'rgba(255,255,255,.32)');
    hl.addColorStop(.38, 'rgba(255,255,255,.08)');
    hl.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(x, y, bump, 0, Math.PI * 2);
    ctx.fillStyle = hl; ctx.fill();

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

    const bg = ctx.createRadialGradient(x - r*.22, y - r*.22, 0, x, y, r * 1.05);
    bg.addColorStop(0,   'rgba(185,142,112,.9)');
    bg.addColorStop(.75, 'rgba(168,125,98,.6)');
    bg.addColorStop(1,   'rgba(150,108,85,0)');
    ctx.beginPath(); ctx.arc(x, y, r * 1.05, 0, Math.PI * 2);
    ctx.fillStyle = bg; ctx.fill();

    const poreR = r * (.85 + openAmount * .25);
    const pg = ctx.createRadialGradient(x, y, 0, x, y, poreR);
    pg.addColorStop(0,   'rgba(25,15,8,1)');
    pg.addColorStop(.50, 'rgba(52,34,22,1)');
    pg.addColorStop(.82, 'rgba(90,62,42,.9)');
    pg.addColorStop(1,   'rgba(130,95,70,0)');
    ctx.beginPath(); ctx.arc(x, y, poreR, 0, Math.PI * 2);
    ctx.fillStyle = pg; ctx.fill();

    const hl = ctx.createRadialGradient(x - r*.2, y - r*.25, 0, x, y, r);
    hl.addColorStop(0, 'rgba(255,255,255,.12)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = hl; ctx.fill();
  }

  _renderCyst(ctx, wobble) {
    const { x, y, radius, openAmount, squeezeVis, wrongVis } = this;
    const r       = radius * wobble;
    const tension = .95 + squeezeVis * .08;

    const bg = ctx.createRadialGradient(x - r*.3, y - r*.3, 0, x, y, r * tension);
    bg.addColorStop(0,   'rgb(240,170,145)');
    bg.addColorStop(.35, 'rgb(210, 85, 62)');
    bg.addColorStop(.72, 'rgb(175, 50, 32)');
    bg.addColorStop(1,   'rgb(148, 38, 22)');
    ctx.beginPath(); ctx.arc(x, y, r * tension, 0, Math.PI * 2);
    ctx.fillStyle = bg; ctx.fill();

    const hl = ctx.createRadialGradient(x - r*.25, y - r*.32, r*.08, x, y, r);
    hl.addColorStop(0,   'rgba(255,255,255,.35)');
    hl.addColorStop(.35, 'rgba(255,255,255,.08)');
    hl.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(x, y, r * tension, 0, Math.PI * 2);
    ctx.fillStyle = hl; ctx.fill();

    if (this.progress > .55) {
      const reveal = (this.progress - .55) / .45;
      const cg = ctx.createRadialGradient(x, y, 0, x, y, r * .6);
      cg.addColorStop(0, `rgba(248,240,195,${reveal * .55})`);
      cg.addColorStop(1,  'rgba(240,215,145,0)');
      ctx.beginPath(); ctx.arc(x, y, r * .6, 0, Math.PI * 2);
      ctx.fillStyle = cg; ctx.fill();
    }

    if (openAmount > .3) {
      const ow = r * .22 * openAmount, oh = r * .14 * openAmount;
      ctx.save();
      ctx.beginPath(); ctx.ellipse(x, y, ow, oh, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30,10,5,.9)'; ctx.fill();
      if (openAmount > .6) {
        const oozeG = ctx.createRadialGradient(x, y, 0, x, y, ow * 1.5);
        oozeG.addColorStop(0, `rgba(248,240,195,${(openAmount-.6)*2.5})`);
        oozeG.addColorStop(1, 'rgba(248,240,195,0)');
        ctx.fillStyle = oozeG;
        ctx.beginPath(); ctx.ellipse(x, y, ow * 1.5, oh * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  _renderSqueezeVis(ctx, sv) {
    const { x, y, radius } = this;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.3);
    g.addColorStop(0, `rgba(220,60,40,${sv * .45})`);
    g.addColorStop(1, 'rgba(220,60,40,0)');
    ctx.beginPath(); ctx.arc(x, y, radius * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
  }

  _renderProgressRing(ctx) {
    const { x, y, radius, progress } = this;
    const ringR = radius + 5;
    ctx.beginPath();
    ctx.arc(x, y, ringR, -Math.PI/2, -Math.PI/2 + progress * Math.PI * 2);
    ctx.strokeStyle = `rgba(120,220,120,${.5 + progress * .4})`;
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();
  }

  _renderExtracted(ctx) {
    const { x, y, radius } = this;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.8);
    g.addColorStop(0,   'rgba(25,12,8,.75)');
    g.addColorStop(.35, 'rgba(180,80,60,.35)');
    g.addColorStop(1,   'rgba(180,80,60,0)');
    ctx.beginPath(); ctx.arc(x, y, radius * 1.8, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, radius * .45, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,8,4,.85)'; ctx.fill();
  }
}

// ─── Input Controller ─────────────────────────────────────────────────────────
class InputController {
  constructor(canvas) {
    this.canvas   = canvas;
    this.touchMap = {};
    this.squeeze  = null;
    this.initDist = null;
    this.prevDist = null;

    this.mDown  = false;
    this.mStart = null;
    this.mPos   = null;

    // For single-tap / press detection (tools)
    this._pressThisFrame = false;
    this._pressX = 0; this._pressY = 0;

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
    for (const t of e.changedTouches) {
      this.touchMap[t.identifier] = { x: t.clientX, y: t.clientY };
    }
    // Register a press on the first touch point
    if (Object.keys(this.touchMap).length === 1) {
      const t = e.changedTouches[0];
      this._pressThisFrame = true;
      this._pressX = t.clientX; this._pressY = t.clientY;
    }
    this._recalc();
  }
  _tm(e) {
    e.preventDefault();
    for (const t of e.touches) {
      if (this.touchMap[t.identifier] !== undefined)
        this.touchMap[t.identifier] = { x: t.clientX, y: t.clientY };
    }
    this._recalc();
  }
  _te(e) {
    e.preventDefault();
    const alive = new Set(Array.from(e.touches).map(t => t.identifier));
    for (const id of Object.keys(this.touchMap))
      if (!alive.has(Number(id))) delete this.touchMap[id];
    if (Object.keys(this.touchMap).length < 2) {
      this.initDist = this.prevDist = null; this.squeeze = null;
    } else { this._recalc(); }
  }

  _recalc() {
    const pts = Object.values(this.touchMap);
    if (pts.length < 2) { this.squeeze = null; return; }
    const [t1, t2] = pts;
    const dist = Math.hypot(t2.x - t1.x, t2.y - t1.y);
    if (!this.initDist || this.initDist < CFG.TOUCH_MIN_INIT_DIST) {
      this.initDist = dist; this.prevDist = dist;
    }
    const midX  = (t1.x + t2.x) / 2, midY = (t1.y + t2.y) / 2;
    const angle = ((Math.atan2(t2.y - t1.y, t2.x - t1.x) % Math.PI) + Math.PI) % Math.PI;
    const force = clamp((this.initDist - dist) / this.initDist, 0, 1);
    const speed = this.prevDist ? Math.abs(dist - this.prevDist) / Math.max(1, this.initDist) : 0;
    this.prevDist = dist;
    this.squeeze  = { isActive: true, midX, midY, angle, force, speed, t1, t2 };
  }

  _md(e) {
    this.mDown  = true;
    this.mStart = { x: e.clientX, y: e.clientY };
    this.mPos   = { x: e.clientX, y: e.clientY };
    this.initDist = null; this.squeeze = null;
    this._pressThisFrame = true;
    this._pressX = e.clientX; this._pressY = e.clientY;
  }
  _mm(e) {
    if (!this.mDown) return;
    this.mPos = { x: e.clientX, y: e.clientY };
    this._recalcMouse();
  }
  _mu() { this.mDown = false; this.squeeze = null; }
  _recalcMouse() {
    if (!this.mDown || !this.mStart) return;
    const dx  = this.mPos.x - this.mStart.x, dy = this.mPos.y - this.mStart.y;
    const drag = Math.hypot(dx, dy);
    if (drag < CFG.MOUSE_MIN_DRAG) { this.squeeze = null; return; }
    const rawAng = Math.atan2(dy, dx);
    const angle  = ((rawAng % Math.PI) + Math.PI) % Math.PI;
    const force  = clamp(drag / CFG.MOUSE_MAX_DRAG, 0, 1);
    const offset = CFG.TOUCH_VIRTUAL_OFFSET;
    this.squeeze = {
      isActive: true,
      midX: this.mStart.x, midY: this.mStart.y,
      angle, force, speed: 0.02,
      t1: { x: this.mStart.x - Math.cos(rawAng) * offset, y: this.mStart.y - Math.sin(rawAng) * offset },
      t2: { x: this.mStart.x + Math.cos(rawAng) * offset, y: this.mStart.y + Math.sin(rawAng) * offset },
    };
  }

  getData()    { return this.squeeze; }
  // Returns current single-point position (for swab dragging)
  getPosition() {
    if (this.mDown && this.mPos) return this.mPos;
    const pts = Object.values(this.touchMap);
    return pts.length === 1 ? pts[0] : null;
  }
  // Returns press point this frame (consumed after first call)
  getPress() {
    if (this._pressThisFrame) {
      this._pressThisFrame = false;
      return { x: this._pressX, y: this._pressY };
    }
    return null;
  }
}

// ─── Discomfort Bar ───────────────────────────────────────────────────────────
class DiscomfortBar {
  constructor() { this.reset(); this._painTol = 1.0; this._quitMs = CFG.DISCOMFORT_QUIT_MS; }
  reset() { this.value = 0; this._dangerTimer = 0; }
  setClient(client) {
    this._painTol = client.painTol;
    this._quitMs  = client.quitMs;
  }
  update(delta, dt) {
    // painTol < 1 = more sensitive → delta magnified
    const effectiveDelta = delta / this._painTol;
    this.value = clamp(this.value + effectiveDelta * dt, 0, 100);
    if (effectiveDelta === 0) this.value = Math.max(0, this.value - CFG.DISCOMFORT_IDLE_DECAY * dt);
    if (this.value >= CFG.DISCOMFORT_DANGER) {
      this._dangerTimer += dt * 1000;
      if (this._dangerTimer >= this._quitMs) return 'quit';
    } else { this._dangerTimer = 0; }
    return null;
  }
  get dangerFraction() {
    if (this.value < CFG.DISCOMFORT_DANGER) return 0;
    return this._dangerTimer / this._quitMs;
  }
  get inDanger() { return this.value >= CFG.DISCOMFORT_DANGER; }
}

// ─── Tool Bar ─────────────────────────────────────────────────────────────────
class ToolBar {
  constructor() {
    this._active = 'squeeze';
    this._uses   = {};
    Object.keys(TOOL_DEFS).forEach(id => { this._uses[id] = TOOL_DEFS[id].maxUses; });
    this._bindButtons();
  }

  get active() { return this._active; }

  resetForLevel() {
    Object.keys(TOOL_DEFS).forEach(id => { this._uses[id] = TOOL_DEFS[id].maxUses; });
    this._active = 'squeeze';
    this._updateUI();
  }

  setActive(id) {
    if (!TOOL_DEFS[id]) return;
    if (this._uses[id] === 0) return;
    this._active = id;
    this._updateUI();
  }

  useConsumable(id) {
    if (TOOL_DEFS[id].maxUses === Infinity) return;
    this._uses[id] = Math.max(0, this._uses[id] - 1);
    if (this._uses[id] === 0) { this._active = 'squeeze'; }
    this._updateUI();
  }

  remainingUses(id) { return this._uses[id]; }

  _bindButtons() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setActive(btn.dataset.tool));
    });
  }

  _updateUI() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
      const id = btn.dataset.tool;
      btn.classList.toggle('active',    id === this._active);
      btn.classList.toggle('depleted',  this._uses[id] === 0);
      const badge = document.getElementById(`uses-${id}`);
      if (badge) badge.textContent = this._uses[id] === Infinity ? '' : this._uses[id];
    });
  }
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
const UI = {
  discomfortFill:  null,
  discomfortGlow:  null,
  scoreValue:      null,
  feedbackText:    null,
  remainingCount:  null,
  clientFace:      null,
  clientName:      null,
  clientTrait:     null,
  areaBadge:       null,
  hud:             null,

  init() {
    this.discomfortFill = document.getElementById('discomfort-fill');
    this.discomfortGlow = document.getElementById('discomfort-glow');
    this.scoreValue     = document.getElementById('score-value');
    this.feedbackText   = document.getElementById('feedback-text');
    this.remainingCount = document.getElementById('remaining-count');
    this.clientFace     = document.getElementById('client-face');
    this.clientName     = document.getElementById('client-name');
    this.clientTrait    = document.getElementById('client-trait');
    this.areaBadge      = document.getElementById('area-badge');
    this.hud            = document.getElementById('hud');
  },

  updateDiscomfort(bar) {
    const pct = bar.value;
    this.discomfortFill.style.width = `${pct}%`;
    if (bar.inDanger) {
      const pulse = Math.sin(Date.now() / CFG.PULSE_SPEED_MS) * .5 + .5;
      this.discomfortGlow.style.boxShadow =
        `inset 0 0 ${8 + pulse * 10}px rgba(244,67,54,${.5 + pulse * .3})`;
      this.hud.classList.add('hud-danger');
    } else {
      this.discomfortGlow.style.boxShadow = '';
      this.hud.classList.remove('hud-danger');
    }
    const faces    = CLIENT_FACES;
    const faceStep = 100 / faces.length;
    const idx      = Math.min(faces.length - 1, Math.floor(pct / faceStep));
    this.clientFace.textContent = faces[idx];
  },

  updateScore(score)     { this.scoreValue.textContent = score; },
  updateRemaining(n)     { this.remainingCount.textContent = n; },
  setFeedback(msg)       { this.feedbackText.textContent = msg || '\u00a0'; },

  updateClientArea(client, area, difficulty) {
    this.clientName.textContent  = client.name;
    this.clientTrait.textContent = client.trait;
    const diff = DIFFICULTY_MODES[difficulty];
    this.areaBadge.textContent = `${area.emoji} ${area.name}  ·  ${area.desc}  ·  ${diff.label}`;
  },

  showScorePopup(x, y, text) {
    const el = document.createElement('div');
    el.className   = 'score-popup';
    el.textContent = typeof text === 'number' ? `+${text}` : text;
    el.style.left  = `${x}px`;
    el.style.top   = `${y}px`;
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

    // New: difficulty / client / area
    this.difficulty     = 'normal';
    this._selectedDiff  = 'normal';
    this.client         = null;
    this.skinArea       = null;
    this._hygieneBonus  = 0;

    this.skinData    = null;     // { canvas, hairs, tone }
    this.pimples     = [];
    this.effects     = [];
    this.skinDents   = [];
    this.debris      = new PersistentDebris();
    this.toolBar     = new ToolBar();

    this.discomfort  = new DiscomfortBar();
    this.input       = new InputController(this.canvas);
    this.lastTime    = 0;
    this._shakeX = 0; this._shakeY = 0; this._shakeAmt = 0;

    this._feedbackMsg   = '';
    this._feedbackTimer = 0;

    // Breathing animation
    this.breathTime = 0;

    UI.init();
    this._bindUI();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    requestAnimationFrame(t => this._loop(t));
  }

  _bindUI() {
    // Start → difficulty screen
    document.getElementById('btn-start').addEventListener('click', () => {
      UI.showScreen('screen-difficulty');
    });
    // Restart → difficulty screen
    document.getElementById('btn-restart').addEventListener('click', () => {
      UI.showScreen('screen-difficulty');
    });
    // Next level
    document.getElementById('btn-next').addEventListener('click', () => this._nextLevel());
    // Difficulty selection
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._selectedDiff = btn.dataset.diff;
        document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
    // Start game with chosen difficulty
    document.getElementById('btn-start-game').addEventListener('click', () => {
      this._startWithDifficulty(this._selectedDiff);
    });
  }

  _resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    if (this.state === 'playing') this._buildSkin();
  }

  // ── Game flow ──────────────────────────────────────────────────────────────
  _startWithDifficulty(diff) {
    this.difficulty = diff || 'normal';
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
    this.pimples   = [];
    this.effects   = [];
    this.skinDents = [];
    this.debris.clear();
    this._hygieneBonus = 0;
    this.discomfort.reset();
    this.toolBar.resetForLevel();

    // Pick random client and area
    this.client   = CLIENT_PROFILES[Math.floor(Math.random() * CLIENT_PROFILES.length)];
    this.skinArea = SKIN_AREAS[Math.floor(Math.random() * SKIN_AREAS.length)];
    this.discomfort.setClient(this.client);

    this._buildSkin();
    this._spawnPimples();
    this.state = 'playing';

    UI.updateScore(this.score);
    UI.updateRemaining(this.pimples.length);
    UI.updateClientArea(this.client, this.skinArea, this.difficulty);
    UI.setFeedback('Find a pimple and squeeze!');
  }

  _buildSkin() {
    const tone = CFG.SKIN_TONES[Math.floor(Math.random() * CFG.SKIN_TONES.length)];
    this.skinData = buildSkinTexture(this.canvas.width, this.canvas.height, tone);
  }

  _spawnPimples() {
    const diffMod      = DIFFICULTY_MODES[this.difficulty];
    const area         = this.skinArea;
    const weights      = area ? area.weights      : CFG.TYPE_WEIGHTS;
    const densityMult  = area ? area.densityMult  : 1.0;

    const { min, max } = CFG.PIMPLE_COUNT;
    const base  = min + Math.floor(Math.random() * (max - min + 1));
    const count = Math.min(Math.round((base + Math.floor(this.level * .5)) * densityMult), 16);

    const margin  = 70, minDist = 90;
    const w = this.canvas.width, h = this.canvas.height;

    // Slightly scale cyst probability with level (existing behaviour adapted per area)
    const cystBoost = Math.min(.15, this.level * .05);
    const adjWeights = {
      whitehead: Math.max(.15, weights.whitehead - cystBoost * .4),
      blackhead: Math.max(.20, weights.blackhead - cystBoost * .3),
      cyst:      Math.min(.60, weights.cyst + cystBoost),
    };

    for (let i = 0; i < count; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 60 && !placed; attempt++) {
        const x = margin + Math.random() * (w - margin * 2);
        const y = margin + Math.random() * (h - margin * 2);
        if (!this.pimples.some(p => Math.hypot(p.x - x, p.y - y) < minDist)) {
          const type = weightedRandom(adjWeights);
          this.pimples.push(new Pimple(x, y, type, diffMod));
          placed = true;
        }
      }
    }
  }

  // ── Game Loop ──────────────────────────────────────────────────────────────
  _loop(ts) {
    const dt = clamp((ts - this.lastTime) / 1000, 0, CFG.MAX_FRAME_DT);
    this.lastTime = ts;
    if (this.state === 'playing') this._update(dt);
    this._render(dt);
    requestAnimationFrame(t => this._loop(t));
  }

  _update(dt) {
    this.breathTime += dt;

    const sq          = this.input.getData();
    const press       = this.input.getPress();
    const activeTool  = this.toolBar.active;

    // ── Tool tap (numbing injection / lancet) ──
    if (press && (activeTool === 'numbing' || activeTool === 'lancet')) {
      this._handleToolTap(press.x, press.y, activeTool);
    }

    // ── Cleaning swab drag ──
    if (activeTool === 'swab') {
      const pos = this.input.getPosition();
      if (pos) this._handleSwab(pos.x, pos.y);
    }

    // ── Find active pimple ──
    let activePimple = null;
    if (sq) {
      let best = CFG.SQUEEZE_ACTIVATION_RADIUS;
      this.pimples.forEach(p => {
        if (p.extracted) return;
        if (activeTool === 'extractor' && p.type === 'cyst') return;
        const d = Math.hypot(p.x - sq.midX, p.y - sq.midY);
        if (d < best) { best = d; activePimple = p; }
      });
    }

    let totalDiscomfort = 0, feedbackSet = false;

    this.pimples.forEach(p => {
      p.update(dt);

      if (sq && p === activePimple) {
        let delta = 0;

        if (activeTool === 'extractor' && p.type !== 'cyst') {
          delta = p.processExtractor(dt);
          if (!feedbackSet) {
            this._setFeedback('⭕ Extractor working… hold steady', dt);
            feedbackSet = true;
          }
        } else {
          // Default: fall back to normal squeeze mechanic for all other tool states
          delta = p.processSqueeze(sq, dt);
          if (!feedbackSet) {
            const adiff = Math.abs(squeezeAngleDiff(sq.angle, p.targetAngle));
            if (sq.speed > PIMPLE_CFG[p.type].speedLimit) {
              this._setFeedback('Too fast! Slow down…', dt);
            } else if (adiff <= p.angleTolerance && sq.force >= p.forceMin && sq.force <= p.forceMax) {
              const pct = Math.round(p.progress * 100);
              if (pct > CFG.NEAR_COMPLETE_PCT) this._setFeedback(`Almost there… ${pct}%`, dt);
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
        }

        totalDiscomfort += delta;
        if (p.progress >= 1 && !p.extracted) this._extractPimple(p);

      } else {
        p.releaseSqueeze(dt);
      }
    });

    if (!sq || !activePimple) {
      totalDiscomfort = 0;
      this._feedbackTimer -= dt;
      if (this._feedbackTimer <= 0) UI.setFeedback('Find a pimple and squeeze!');
    }

    const result = this.discomfort.update(totalDiscomfort, dt);
    UI.updateDiscomfort(this.discomfort);

    if (result === 'quit') { this._gameOver('too-much-discomfort'); return; }

    // Screen shake at high discomfort
    if (this.discomfort.value > 60) {
      const intensity = (this.discomfort.value - 60) / 40;
      this._shakeAmt = intensity * 6;
    } else { this._shakeAmt *= .85; }

    // Skin dents at finger positions
    this.skinDents = [];
    if (sq && sq.t1 && sq.t2) {
      this.skinDents.push(new SkinDent(sq.t1.x, sq.t1.y, 22 + sq.force * 18));
      this.skinDents.push(new SkinDent(sq.t2.x, sq.t2.y, 22 + sq.force * 18));
    }

    this.effects = this.effects.filter(e => e.update(dt));

    if (this.pimples.every(p => p.extracted)) {
      setTimeout(() => this._levelComplete(), 800);
      this.state = 'transitioning';
    }
  }

  _setFeedback(msg, dt) {
    if (this._feedbackMsg !== msg) { this._feedbackMsg = msg; UI.setFeedback(msg); }
    this._feedbackTimer = .8;
  }

  // ── Tool tap logic ──────────────────────────────────────────────────────────
  _handleToolTap(x, y, tool) {
    let bestDist = CFG.SQUEEZE_ACTIVATION_RADIUS * 1.8;
    let target   = null;
    this.pimples.forEach(p => {
      if (p.extracted) return;
      if (tool === 'lancet' && p.type !== 'cyst') return;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestDist) { bestDist = d; target = p; }
    });
    if (!target) return;

    if (tool === 'numbing') {
      if (target.applyNumbing()) {
        this.toolBar.useConsumable('numbing');
        this._setFeedback('💉 Numbed! Discomfort reduced.', 0);
        UI.showScorePopup(target.x, target.y - target.radius - 22, '💉 Numbed');
      }
    } else if (tool === 'lancet') {
      if (target.applyLancet()) {
        this.toolBar.useConsumable('lancet');
        this._setFeedback('🩸 Lanced! Much easier to extract.', 0);
        UI.showScorePopup(target.x, target.y - target.radius - 22, '🩸 Lanced');
        // Small discomfort from puncture
        this.discomfort.value = Math.min(100, this.discomfort.value + 12);
      }
    }
  }

  // ── Swab cleaning logic ─────────────────────────────────────────────────────
  _handleSwab(x, y) {
    const cleaned = this.debris.cleanAt(x, y, CFG.SWAB_RADIUS);
    if (cleaned > 0) {
      const pts = cleaned * CFG.DEBRIS_HYGIENE_PTS;
      this._hygieneBonus += pts;
      this.score         += pts;
      UI.updateScore(this.score);
      UI.showScorePopup(x, y - 20, `+${pts} 🧹`);
    }
  }

  // ── Extraction ─────────────────────────────────────────────────────────────
  _extractPimple(p) {
    p.extracted   = true;
    p.extractFlash = 1;
    p.openAmount   = 1;
    const diffMod = DIFFICULTY_MODES[this.difficulty];
    const pts = Math.round(p.points * this.level * diffMod.ptsMult);
    this.score += pts;
    UI.updateScore(this.score);
    UI.updateRemaining(this.pimples.filter(x => !x.extracted).length);
    // Goo effect — pass callback so splats persist as debris
    this.effects.push(new GooEffect(p.x, p.y, p.type, p.radius, splats => {
      this.debris.addSplats(splats);
    }));
    UI.showScorePopup(p.x, p.y - p.radius - 20, pts);
    UI.setFeedback('✓ Extracted!');
    this._feedbackTimer = 1.2;
    this._feedbackMsg   = '✓ Extracted!';
  }

  _gameOver(reason) {
    this.state = 'gameover';
    document.getElementById('gameover-score').textContent  = this.score;
    document.getElementById('gameover-message').textContent =
      reason === 'too-much-discomfort'
        ? `${this.client ? this.client.name : 'The client'} couldn't take the discomfort…`
        : 'The session ended unexpectedly.';
    UI.showScreen('screen-gameover');
  }

  _levelComplete() {
    this.state = 'complete';
    document.getElementById('complete-score').textContent = this.score;
    document.getElementById('complete-message').textContent =
      `Level ${this.level} cleared! ${this.pimples.length} extraction${this.pimples.length !== 1 ? 's' : ''}!`;

    const bonusRow = document.getElementById('hygiene-bonus-row');
    const bonusPts = document.getElementById('hygiene-bonus-pts');
    if (this._hygieneBonus > 0) {
      bonusRow.style.display = '';
      bonusPts.textContent = `+${this._hygieneBonus}`;
    } else {
      bonusRow.style.display = 'none';
    }
    UI.showScreen('screen-complete');
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  _render(dt) {
    const ctx = this.ctx;
    const W   = this.canvas.width, H = this.canvas.height;

    ctx.save();

    // Screen shake
    if (this._shakeAmt > 0.5) {
      ctx.translate((Math.random() - .5) * this._shakeAmt, (Math.random() - .5) * this._shakeAmt);
    }

    ctx.clearRect(-20, -20, W + 40, H + 40);

    // Breathing vertical offset — whole scene breathes
    const breathY = Math.sin(this.breathTime * CFG.BREATH_RATE * Math.PI * 2) * CFG.BREATH_AMPLITUDE;
    ctx.translate(0, breathY);

    // Skin background
    if (this.skinData) ctx.drawImage(this.skinData.canvas, 0, 0);

    if (this.state === 'playing' || this.state === 'transitioning') {
      // Animated wavy hair (drawn each frame so it moves)
      this._renderAnimatedHair(ctx);

      // Persistent debris marks on skin
      this.debris.render(ctx);

      // Skin dents (finger press shadows)
      this.skinDents.forEach(d => d.render(ctx));

      // Squeeze axis guide + finger circles
      const sq = this.input.getData();
      if (sq && sq.t1 && sq.t2) {
        ctx.save();
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth   = 1.5;
        ctx.beginPath(); ctx.moveTo(sq.t1.x, sq.t1.y); ctx.lineTo(sq.t2.x, sq.t2.y);
        ctx.stroke();
        [sq.t1, sq.t2].forEach(t => {
          ctx.beginPath();
          ctx.arc(t.x, t.y, 18 + sq.force * 8, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,255,255,${0.25 + sq.force * .3})`;
          ctx.lineWidth = 2; ctx.setLineDash([]); ctx.stroke();
        });
        ctx.restore();
      }

      // Swab brush indicator
      if (this.toolBar.active === 'swab') {
        const pos = this.input.getPosition();
        if (pos) this._renderSwabBrush(ctx, pos.x, pos.y);
      }

      // Pimples
      this.pimples.forEach(p => p.render(ctx));

      // Goo effects
      this.effects.forEach(e => e.render(ctx));
    }

    ctx.restore();
  }

  // Animated hair — drawn each frame so strands sway with breathing phase
  _renderAnimatedHair(ctx) {
    if (!this.skinData || !this.skinData.hairs.length) return;
    const t    = this.breathTime;
    const tone = this.skinData.tone;
    // Hair darkening offsets relative to base skin tone (gives a natural under-skin colour)
    const hairDarkenR = 60, hairDarkenG = 50, hairDarkenB = 42;
    // Animation parameters
    const hairWaveFreq = 1.9;   // cycles per second
    const hairWaveAmp  = 0.12;  // radians of angular sway
    ctx.save();
    ctx.strokeStyle = `rgba(${tone.r - hairDarkenR},${tone.g - hairDarkenG},${tone.b - hairDarkenB}, 0.22)`;
    ctx.lineWidth   = 0.7;
    ctx.lineCap     = 'round';
    for (const h of this.skinData.hairs) {
      const wave = Math.sin(t * hairWaveFreq + h.phase) * hairWaveAmp;
      const ang  = h.ang + wave;
      ctx.beginPath();
      ctx.moveTo(h.hx, h.hy);
      ctx.quadraticCurveTo(
        h.hx + Math.cos(ang + 0.3) * h.len * 0.5,
        h.hy + Math.sin(ang + 0.3) * h.len * 0.5,
        h.hx + Math.cos(ang) * h.len,
        h.hy + Math.sin(ang) * h.len,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  _renderSwabBrush(ctx, x, y) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, CFG.SWAB_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(160,240,180,0.60)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle   = 'rgba(160,240,180,0.10)'; ctx.fill();
    ctx.restore();
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  window._game = new PimplePopGame();
});
