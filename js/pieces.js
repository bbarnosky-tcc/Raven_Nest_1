/* Marble Run Lab — piece catalog.
 *
 * Every piece type describes its shape ONCE as a list of primitives in local
 * coordinates (origin = piece position, before rotation). The editor draws
 * those primitives and the simulator turns the same primitives into physics
 * bodies, so what students see is exactly what the marble hits.
 *
 * Primitive kinds:
 *   {t:'rect',   x, y, w, h, a, style}      a = local rotation (radians)
 *   {t:'circle', x, y, r, style}
 *   {t:'poly',   pts:[[x,y],...], style}
 * Optional primitive flags:
 *   g:'name'   belongs to a moving (dynamic) body; prims sharing g form one body
 *   ghost:true decoration only — drawn but has no physics
 *   ng:true    never collides with other ng prims of the same piece
 *   sensor:'finish'  invisible-to-physics detection zone
 * Joints:
 *   {t:'pin',  g, x, y}           pins body g to the world at local (x,y) — an axle
 *   {t:'rope', g, ax, ay}         hangs body g from local anchor (ax,ay) by a string
 */
(function () {
  const MR = (window.MR = window.MR || {});
  const D2R = Math.PI / 180;

  MR.WORLD = { w: 1600, h: 1000 };
  MR.MARBLE_R = 12;

  MR.STYLES = {
    wood: { fill: '#d4a15f', stroke: '#8a5a24' },
    darkwood: { fill: '#a8733a', stroke: '#6b4318' },
    cardboard: { fill: '#c99c69', stroke: '#8c6438' },
    brick: { fill: '#b85a40', stroke: '#7a3322' },
    stone: { fill: '#c8c2b4', stroke: '#857d6d' },
    metal: { fill: '#8f9cab', stroke: '#566170' },
    steel: { fill: '#b9c3ce', stroke: '#5d6875', ball: true },
    plastic: { fill: '#4c9be8', stroke: '#1f5f9e' },
    green: { fill: '#58b368', stroke: '#2c7a3b' },
    red: { fill: '#e0604f', stroke: '#9b2e22' },
    yellow: { fill: '#f2c14e', stroke: '#a77f12' },
    purple: { fill: '#9a7bd1', stroke: '#5b3f8f' },
    shaft: { fill: 'rgba(120,130,145,0.25)', stroke: 'rgba(90,100,115,0.45)' },
    glass: { fill: '#5fb7e8', stroke: '#1f6fa0', ball: true },
    relay: { fill: '#f08a3c', stroke: '#a24f0e', ball: true },
    sensor: { fill: 'rgba(88,179,104,0.18)', stroke: 'rgba(44,122,59,0.6)' },
  };

  /* A rectangle running from (x1,y1) to (x2,y2) with thickness t. */
  function seg(x1, y1, x2, y2, t, style, extra) {
    const dx = x2 - x1, dy = y2 - y1;
    return Object.assign(
      { t: 'rect', x: (x1 + x2) / 2, y: (y1 + y2) / 2, w: Math.hypot(dx, dy), h: t, a: Math.atan2(dy, dx), style },
      extra || {}
    );
  }
  function rect(x, y, w, h, style, extra) {
    return Object.assign({ t: 'rect', x, y, w, h, a: 0, style }, extra || {});
  }

  const T = {};

  /* ------------------------------------------------------------ BASES */
  T.wall = {
    label: 'Wall', cat: 'base',
    info: 'A tall brick wall. Stretch it to hold pieces up high.',
    params: { w: { label: 'Width', min: 20, max: 120, step: 5, def: 30 }, h: { label: 'Height', min: 80, max: 900, step: 10, def: 420 } },
    geom(p) { return { prims: [rect(0, 0, p.params.w, p.params.h, 'brick')] }; },
    extra(ctx, p) {
      const { w, h } = p.params;
      ctx.save();
      ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.clip();
      ctx.strokeStyle = 'rgba(255,235,220,0.35)'; ctx.lineWidth = 1.5;
      for (let y = -h / 2 + 14, row = 0; y < h / 2; y += 14, row++) {
        ctx.beginPath(); ctx.moveTo(-w / 2, y); ctx.lineTo(w / 2, y); ctx.stroke();
        for (let x = -w / 2 + (row % 2 ? 0 : 14); x < w / 2; x += 28) {
          ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x, y); ctx.stroke();
        }
      }
      ctx.restore();
    },
  };

  T.box = {
    label: 'Cardboard Box', cat: 'base',
    info: 'A sturdy cardboard box. Stack boxes to build towers.',
    params: { w: { label: 'Width', min: 40, max: 500, step: 10, def: 160 }, h: { label: 'Height', min: 30, max: 500, step: 10, def: 120 } },
    geom(p) { return { prims: [rect(0, 0, p.params.w, p.params.h, 'cardboard')] }; },
    extra(ctx, p) {
      const { w, h } = p.params;
      ctx.fillStyle = 'rgba(235,215,160,0.75)';
      ctx.fillRect(-Math.min(18, w / 6), -h / 2, Math.min(36, w / 3), Math.min(h * 0.45, 50));
      ctx.strokeStyle = 'rgba(110,70,30,0.45)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2 + Math.min(14, h / 4)); ctx.lineTo(w / 2, -h / 2 + Math.min(14, h / 4)); ctx.stroke();
      ctx.fillStyle = 'rgba(90,55,20,0.5)'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      if (h > 50 && w > 60) ctx.fillText('THIS SIDE UP ↑', 0, h / 2 - 10);
    },
  };

  T.pillar = {
    label: 'Pillar', cat: 'base',
    info: 'A stone column with wide caps. Good for holding a ramp end.',
    params: { w: { label: 'Width', min: 30, max: 140, step: 5, def: 54 }, h: { label: 'Height', min: 60, max: 900, step: 10, def: 300 } },
    geom(p) {
      const { w, h } = p.params;
      const cap = 14;
      return { prims: [rect(0, 0, w * 0.72, h - cap * 2, 'stone'), rect(0, -h / 2 + cap / 2, w, cap, 'stone'), rect(0, h / 2 - cap / 2, w, cap, 'stone')] };
    },
    extra(ctx, p) {
      const { w, h } = p.params;
      ctx.strokeStyle = 'rgba(100,92,78,0.35)'; ctx.lineWidth = 1.5;
      for (let k = -1; k <= 1; k++) {
        const x = k * w * 0.18;
        ctx.beginPath(); ctx.moveTo(x, -h / 2 + 18); ctx.lineTo(x, h / 2 - 18); ctx.stroke();
      }
    },
  };

  T.table = {
    label: 'Table / Shelf', cat: 'base',
    info: 'A flat shelf on two legs. Marbles can roll underneath it.',
    params: { w: { label: 'Width', min: 80, max: 700, step: 10, def: 300 }, h: { label: 'Height', min: 50, max: 700, step: 10, def: 160 } },
    geom(p) {
      const { w, h } = p.params;
      return {
        prims: [
          rect(0, -h / 2 + 8, w, 16, 'darkwood'),
          rect(-w / 2 + 16, 8, 14, h - 16, 'darkwood'),
          rect(w / 2 - 16, 8, 14, h - 16, 'darkwood'),
        ],
      };
    },
  };

  T.books = {
    label: 'Book Stack', cat: 'base',
    info: 'A pile of four books. Handy for small height changes.',
    params: { w: { label: 'Width', min: 60, max: 300, step: 10, def: 140 }, h: { label: 'Height', min: 40, max: 240, step: 10, def: 88 } },
    geom(p) {
      const { w, h } = p.params;
      const bh = h / 4, styles = ['red', 'plastic', 'green', 'yellow'], ws = [1, 0.9, 0.96, 0.84], off = [0, 4, -3, 2];
      return { prims: styles.map((s, i) => rect(off[i], h / 2 - bh / 2 - i * bh, w * ws[i], bh, s)) };
    },
    extra(ctx, p) {
      const { w, h } = p.params;
      const bh = h / 4, ws = [1, 0.9, 0.96, 0.84], off = [0, 4, -3, 2];
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const y = h / 2 - bh / 2 - i * bh, bw = w * ws[i];
        ctx.beginPath(); ctx.moveTo(off[i] - bw / 2 + 8, y); ctx.lineTo(off[i] - bw / 2 + 8 + bw * 0.3, y); ctx.stroke();
      }
    },
  };

  /* ------------------------------------------------- SIMPLE MACHINES */
  T.ramp = {
    label: 'Ramp', cat: 'machine', machine: 'Inclined plane',
    info: 'Inclined plane: a sloped surface. Steeper = faster, but harder to control.',
    params: { len: { label: 'Length', min: 60, max: 700, step: 10, def: 260 } },
    defAngle: 12,
    geom(p) {
      const L = p.params.len;
      return { prims: [rect(0, 0, L, 12, 'wood')], ports: [[-L / 2, -6], [L / 2, -6]] };
    },
  };

  T.curve = {
    label: 'Curved Ramp', cat: 'machine', machine: 'Inclined plane (curved)',
    info: 'A curved inclined plane. Use it as a half-pipe, or rotate it to turn the marble around.',
    params: {
      r: { label: 'Radius', min: 50, max: 320, step: 5, def: 120 },
      sweep: { label: 'Curve amount (°)', min: 30, max: 200, step: 5, def: 90 },
    },
    defAngle: 45,
    geom(p) {
      const { r, sweep } = p.params;
      const a0 = (90 - sweep / 2) * D2R, a1 = (90 + sweep / 2) * D2R;
      const n = Math.max(4, Math.round(sweep / 9));
      const d = (a1 - a0) / n, t = 12, prims = [];
      for (let i = 0; i < n; i++) {
        const m = a0 + d * (i + 0.5), rr = r + t / 2;
        const w = 2 * (r + t) * Math.sin(d / 2) + 1.5;
        prims.push({ t: 'rect', x: Math.cos(m) * rr, y: Math.sin(m) * rr, w, h: t, a: m + Math.PI / 2, style: 'wood' });
      }
      return { prims, ports: [[Math.cos(a0) * r, Math.sin(a0) * r], [Math.cos(a1) * r, Math.sin(a1) * r]] };
    },
  };

  T.funnel = {
    label: 'Funnel', cat: 'machine', machine: 'Inclined planes (wedge pair)',
    info: 'Two sloped walls that guide a marble from anywhere above into one small opening.',
    params: {
      top: { label: 'Top width', min: 80, max: 460, step: 10, def: 200 },
      h: { label: 'Height', min: 50, max: 320, step: 10, def: 120 },
      gap: { label: 'Opening', min: 30, max: 90, step: 2, def: 38 },
    },
    geom(p) {
      const { top, h, gap } = p.params;
      const t = 10, ix = gap / 2 + t / 2, spout = 30;
      return {
        prims: [
          seg(-top / 2, -h / 2, -ix, h / 2, t, 'plastic'),
          seg(top / 2, -h / 2, ix, h / 2, t, 'plastic'),
          rect(-ix, h / 2 + spout / 2 - 3, t, spout + 2, 'plastic'),
          rect(ix, h / 2 + spout / 2 - 3, t, spout + 2, 'plastic'),
        ],
        ports: [[-top / 2, -h / 2 - 5], [top / 2, -h / 2 - 5], [0, h / 2 + spout]],
      };
    },
  };

  T.screw = {
    label: 'Screw', cat: 'machine', machine: 'Screw',
    info: 'A screw is an inclined plane wrapped around a post. This side view shows the spiral as a zig-zag chute that lowers the marble gently.',
    params: {
      turns: { label: 'Turns', min: 2, max: 8, step: 1, def: 4 },
      w: { label: 'Width', min: 110, max: 320, step: 10, def: 170 },
      pitch: { label: 'Drop per turn', min: 70, max: 140, step: 5, def: 80 },
    },
    geom(p) {
      const { turns, w, pitch } = p.params;
      const gap = 34, H = 30 + turns * pitch, drop = pitch * 0.4, t = 8;
      const prims = [rect(0, 0, 14, H - 8, 'shaft', { ghost: true })];
      prims.push(rect(-w / 2 - 5, 0, 10, H, 'metal'), rect(w / 2 + 5, 0, 10, H, 'metal'));
      let exitX = 0;
      for (let i = 0; i < turns; i++) {
        const y = -H / 2 + 30 + i * pitch;
        if (i % 2 === 0) { prims.push(seg(-w / 2, y, w / 2 - gap, y + drop, t, 'yellow')); exitX = w / 2 - gap / 2; }
        else { prims.push(seg(w / 2, y, -w / 2 + gap, y + drop, t, 'yellow')); exitX = -w / 2 + gap / 2; }
      }
      return { prims, ports: [[0, -H / 2], [exitX, H / 2]] };
    },
  };

  T.cradle = {
    label: "Newton's Cradle", cat: 'machine', machine: 'Pendulums (energy transfer)',
    info: "Steel balls on strings. Hit one end and the ball on the far end swings out — the energy passes straight through! Pair it with a Relay Marble.",
    params: {
      n: { label: 'Balls', min: 2, max: 7, step: 1, def: 5 },
      L: { label: 'String length', min: 50, max: 220, step: 5, def: 110 },
    },
    geom(p) {
      const { n, L } = p.params;
      const R = 14, sp = 2 * R + 0.4;
      const prims = [rect(0, 0, n * sp + 36, 10, 'metal')], joints = [], groups = {};
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * sp, g = 'b' + i;
        prims.push({ t: 'circle', x, y: L, r: R, style: 'steel', g });
        joints.push({ t: 'rope', g, ax: x, ay: 5 });
        groups[g] = { density: 0.006, restitution: 1, friction: 0, frictionStatic: 0, frictionAir: 0.0001, slop: R * 0.02, noSpin: true };
      }
      return { prims, joints, groups };
    },
  };

  T.lever = {
    label: 'Lever / Seesaw', cat: 'machine', machine: 'Lever',
    info: 'A plank balanced on a fulcrum. Move the fulcrum to change which side tips.',
    params: {
      len: { label: 'Length', min: 100, max: 460, step: 10, def: 240 },
      pivot: { label: 'Fulcrum position', min: -40, max: 40, step: 5, def: 0, unit: '%' },
    },
    geom(p) {
      const { len, pivot } = p.params;
      const cx = (-pivot / 100) * len;
      return {
        prims: [
          { t: 'poly', pts: [[0, 0], [-20, 44], [20, 44]], style: 'metal', ng: true },
          rect(cx, 0, len, 12, 'wood', { g: 'plank', ng: true }),
        ],
        joints: [{ t: 'pin', g: 'plank', x: 0, y: 0 }],
        groups: { plank: { density: 0.002, frictionAir: 0.03 } },
        ports: [[cx - len / 2, -6], [cx + len / 2, -6]],
      };
    },
  };

  T.wheel = {
    label: 'Wheel & Axle', cat: 'machine', machine: 'Wheel and axle',
    info: 'A paddle wheel that turns on an axle. Falling marbles spin it and get carried around.',
    params: {
      r: { label: 'Radius', min: 40, max: 140, step: 5, def: 70 },
      k: { label: 'Paddles', min: 3, max: 10, step: 1, def: 6 },
    },
    geom(p) {
      const { r, k } = p.params;
      const prims = [{ t: 'poly', pts: [[0, 0], [-10, r + 24], [10, r + 24]], style: 'shaft', ghost: true }];
      prims.push({ t: 'circle', x: 0, y: 0, r: 13, style: 'red', g: 'wheel' });
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2 + Math.PI / k;
        prims.push({ t: 'rect', x: Math.cos(a) * r / 2, y: Math.sin(a) * r / 2, w: r, h: 8, a, style: 'red', g: 'wheel' });
      }
      return { prims, joints: [{ t: 'pin', g: 'wheel', x: 0, y: 0 }], groups: { wheel: { density: 0.0015, frictionAir: 0.02 } } };
    },
  };

  T.wedge = {
    label: 'Wedge', cat: 'machine', machine: 'Wedge',
    info: 'A wedge splits or redirects motion. Use it to bounce or steer the marble.',
    params: { w: { label: 'Width', min: 30, max: 260, step: 5, def: 90 }, h: { label: 'Height', min: 20, max: 200, step: 5, def: 50 } },
    geom(p) {
      const { w, h } = p.params;
      return { prims: [{ t: 'poly', pts: [[-w / 2, h / 2], [w / 2, h / 2], [w / 2, -h / 2]], style: 'green' }], ports: [[-w / 2, h / 2], [w / 2, -h / 2]] };
    },
  };

  /* ----------------------------------------------- START & FINISH */
  T.start = {
    label: 'Start Gate', cat: 'control', single: true,
    info: 'The marble is released here when you press Test Run. Only one per run.',
    params: { push: { label: 'Starting push', min: -6, max: 6, step: 0.5, def: 1.5 } },
    geom() {
      return {
        prims: [
          rect(-17, -34, 6, 44, 'purple', { ghost: true }),
          rect(17, -34, 6, 44, 'purple', { ghost: true }),
          { t: 'circle', x: 0, y: 0, r: MR.MARBLE_R, style: 'glass', ghost: true, preview: true },
        ],
        ports: [[0, MR.MARBLE_R]],
      };
    },
    extra(ctx, p) {
      ctx.fillStyle = '#5b3f8f'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('START', 0, -62);
      const push = p.params.push;
      if (push) {
        ctx.strokeStyle = '#5b3f8f'; ctx.lineWidth = 2.5;
        const s = Math.sign(push), len = 14 + Math.abs(push) * 5;
        ctx.beginPath(); ctx.moveTo(s * 16, 0); ctx.lineTo(s * (16 + len), 0);
        ctx.lineTo(s * (10 + len), -5); ctx.moveTo(s * (16 + len), 0); ctx.lineTo(s * (10 + len), 5); ctx.stroke();
      }
    },
  };

  T.finish = {
    label: 'Finish Cup', cat: 'control', single: true,
    info: 'The timer stops when a marble lands in this cup. Only one per run.',
    params: { w: { label: 'Width', min: 50, max: 240, step: 5, def: 90 } },
    geom(p) {
      const w = p.params.w;
      return {
        prims: [
          rect(0, 26, w, 8, 'green'),
          rect(-w / 2 + 4, 0, 8, 60, 'green'),
          rect(w / 2 - 4, 0, 8, 60, 'green'),
          rect(0, 4, w - 16, 36, 'sensor', { sensor: 'finish' }),
        ],
        ports: [[-w / 2 + 4, -30], [w / 2 - 4, -30]],
      };
    },
    extra(ctx, p) {
      const w = p.params.w;
      ctx.fillStyle = '#2c7a3b'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('FINISH', 0, -40);
    },
  };

  T.relay = {
    label: 'Relay Marble', cat: 'control',
    info: 'A second marble that waits until something knocks it. Place one beside a Newton\'s Cradle to carry the energy onward.',
    params: {},
    geom() {
      return { prims: [{ t: 'circle', x: 0, y: 0, r: MR.MARBLE_R, style: 'relay', relay: true }], ports: [[0, MR.MARBLE_R]] };
    },
  };

  MR.TYPES = T;
  MR.CATEGORIES = [
    { id: 'base', label: 'Bases' },
    { id: 'machine', label: 'Simple Machines' },
    { id: 'control', label: 'Start & Finish' },
  ];

  /* ---------------------------------------------------------- HELPERS */
  let nextId = 1;
  MR.newId = () => 'p' + Date.now().toString(36) + (nextId++).toString(36);

  MR.makePiece = function (type, x, y) {
    const def = T[type];
    const params = {};
    for (const k in def.params) params[k] = def.params[k].def;
    return { id: MR.newId(), type, x: Math.round(x), y: Math.round(y), angle: def.defAngle || 0, params };
  };

  /* Fix up loaded/imported pieces so bad data can't break the app. */
  MR.sanitizePiece = function (p) {
    const def = T[p && p.type];
    if (!def) return null;
    const out = { id: typeof p.id === 'string' ? p.id : MR.newId(), type: p.type, x: +p.x || 0, y: +p.y || 0, angle: +p.angle || 0, params: {} };
    for (const k in def.params) {
      const spec = def.params[k];
      let v = p.params && isFinite(+p.params[k]) ? +p.params[k] : spec.def;
      out.params[k] = Math.min(spec.max, Math.max(spec.min, v));
    }
    return out;
  };

  const geomCache = new WeakMap();
  MR.geom = function (p) {
    const key = JSON.stringify(p.params);
    const c = geomCache.get(p);
    if (c && c.key === key) return c.g;
    const g = T[p.type].geom(p);
    g.prims = g.prims || []; g.joints = g.joints || []; g.groups = g.groups || {}; g.ports = g.ports || [];
    geomCache.set(p, { key, g });
    return g;
  };

  MR.toWorld = function (p, lx, ly) {
    const a = p.angle * D2R, c = Math.cos(a), s = Math.sin(a);
    return [p.x + lx * c - ly * s, p.y + lx * s + ly * c];
  };
  MR.toLocal = function (p, wx, wy) {
    const a = -p.angle * D2R, c = Math.cos(a), s = Math.sin(a), dx = wx - p.x, dy = wy - p.y;
    return [dx * c - dy * s, dx * s + dy * c];
  };

  function rectCorners(pr) {
    const c = Math.cos(pr.a || 0), s = Math.sin(pr.a || 0), hw = pr.w / 2, hh = pr.h / 2;
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [pr.x + x * c - y * s, pr.y + x * s + y * c]);
  }
  MR.rectCorners = rectCorners;

  /* Points that outline a primitive in local coordinates (for bounds). */
  function primPoints(pr) {
    if (pr.t === 'rect') return rectCorners(pr);
    if (pr.t === 'circle') return [[pr.x - pr.r, pr.y - pr.r], [pr.x + pr.r, pr.y + pr.r]];
    return pr.pts;
  }

  MR.localBounds = function (p) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const pr of MR.geom(p).prims) for (const [x, y] of primPoints(pr)) {
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
    return { x0, y0, x1, y1 };
  };

  MR.worldBounds = function (p) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const pr of MR.geom(p).prims) {
      if (pr.sensor) continue;
      let pts = primPoints(pr);
      if (pr.t === 'circle') pts = [[pr.x - pr.r, pr.y - pr.r], [pr.x + pr.r, pr.y - pr.r], [pr.x + pr.r, pr.y + pr.r], [pr.x - pr.r, pr.y + pr.r]];
      for (const [lx, ly] of pts) {
        const [x, y] = MR.toWorld(p, lx, ly);
        if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
      }
    }
    return { x0, y0, x1, y1 };
  };

  MR.worldPorts = function (p) {
    return MR.geom(p).ports.map(([x, y]) => MR.toWorld(p, x, y));
  };

  function inPoly(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /* Is world point (wx,wy) on piece p? pad = extra grab margin in world units. */
  MR.hitTest = function (p, wx, wy, pad) {
    const [x, y] = MR.toLocal(p, wx, wy);
    for (const pr of MR.geom(p).prims) {
      if (pr.sensor) continue;
      if (pr.t === 'circle') { if (Math.hypot(x - pr.x, y - pr.y) <= pr.r + pad) return true; continue; }
      if (pr.t === 'rect') {
        const c = Math.cos(-(pr.a || 0)), s = Math.sin(-(pr.a || 0)), dx = x - pr.x, dy = y - pr.y;
        const lx = dx * c - dy * s, ly = dx * s + dy * c;
        if (Math.abs(lx) <= pr.w / 2 + pad && Math.abs(ly) <= pr.h / 2 + pad) return true;
        continue;
      }
      if (inPoly(pr.pts, x, y)) return true;
    }
    return false;
  };
  MR.inPoly = inPoly;

  /* ---------------------------------------------------------- DRAWING */
  function pathPrim(ctx, pr) {
    ctx.beginPath();
    if (pr.t === 'rect') {
      const pts = rectCorners(pr);
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    } else if (pr.t === 'circle') {
      ctx.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2);
    } else {
      ctx.moveTo(pr.pts[0][0], pr.pts[0][1]);
      for (let i = 1; i < pr.pts.length; i++) ctx.lineTo(pr.pts[i][0], pr.pts[i][1]);
      ctx.closePath();
    }
  }

  MR.drawBall = function (ctx, x, y, r, styleName, angle) {
    const st = MR.STYLES[styleName] || MR.STYLES.glass;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, st.fill);
    g.addColorStop(1, st.stroke);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = st.stroke; ctx.lineWidth = 1; ctx.stroke();
    if (angle !== undefined) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r * 0.62, angle, angle + 1.1); ctx.stroke();
    }
  };

  MR.drawPrim = function (ctx, pr) {
    const st = MR.STYLES[pr.style] || MR.STYLES.wood;
    if (pr.t === 'circle' && st.ball) { MR.drawBall(ctx, pr.x, pr.y, pr.r, pr.style); return; }
    pathPrim(ctx, pr);
    ctx.fillStyle = st.fill; ctx.fill();
    ctx.strokeStyle = st.stroke; ctx.lineWidth = 1.5;
    if (pr.sensor) ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  /* Draw a piece in its rest pose. opts.sim = true skips moving parts and
     marbles (the simulator draws those from the physics bodies). */
  MR.drawPiece = function (ctx, p, opts) {
    opts = opts || {};
    const def = T[p.type], g = MR.geom(p);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle * D2R);
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    // decorations first so they sit behind
    for (const pr of g.prims) if (pr.ghost && !(opts.sim && pr.preview)) MR.drawPrim(ctx, pr);
    // strings of the cradle
    if (!opts.sim) {
      ctx.strokeStyle = '#444b55'; ctx.lineWidth = 1;
      for (const j of g.joints) if (j.t === 'rope') {
        const b = g.prims.find((pr) => pr.g === j.g);
        ctx.beginPath(); ctx.moveTo(j.ax, j.ay); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    for (const pr of g.prims) {
      if (pr.ghost) continue;
      if (opts.sim && (pr.g || pr.relay)) continue;
      MR.drawPrim(ctx, pr);
    }
    if (def.extra) def.extra(ctx, p);
    if (!opts.sim) for (const j of g.joints) if (j.t === 'pin') drawAxle(ctx, j.x, j.y);
    ctx.restore();
  };

  function drawAxle(ctx, x, y) {
    ctx.fillStyle = '#2f343b';
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d9dde2';
    ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
  }
  MR.drawAxle = drawAxle;
})();
