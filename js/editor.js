/* Marble Run Lab — build mode: view, drawing, placing, moving, rotating,
   connecting (snapping), duplicating, and undo/redo. */
(function () {
  const MR = (window.MR = window.MR || {});
  const D2R = Math.PI / 180;
  const VIEW_H = MR.WORLD.h + 40; // show a strip of floor under the build area
  const PORT_SNAP = 18, SURFACE_SNAP = 14, GRID = 10;

  const E = (MR.editor = {
    pieces: [],
    selId: null,
    snap: true,
    drag: null,      // {mode:'move'|'rotate', id, ...}
    hint: null,      // [x,y] port being snapped to
    undoStack: [],
    redoStack: [],
    pending: null,
    view: { scale: 1, ox: 0, oy: 0, dpr: 1, cw: 0, ch: 0 },
    mode: 'build',   // or 'test'
    sim: null,
    showTrail: true,
    onChange: () => {},
    onSelect: () => {},
  });

  let canvas, ctx, dirty = true;

  E.init = function (cv) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    new ResizeObserver(resize).observe(canvas.parentElement);
    resize();
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    const tick = () => { if (dirty || E.mode === 'test') { draw(); dirty = false; } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    const v = E.view;
    v.dpr = window.devicePixelRatio || 1;
    v.cw = box.width; v.ch = box.height;
    canvas.width = Math.max(1, Math.round(box.width * v.dpr));
    canvas.height = Math.max(1, Math.round(box.height * v.dpr));
    canvas.style.width = box.width + 'px';
    canvas.style.height = box.height + 'px';
    v.scale = Math.min(box.width / MR.WORLD.w, box.height / VIEW_H);
    v.ox = (box.width - MR.WORLD.w * v.scale) / 2;
    v.oy = (box.height - VIEW_H * v.scale) / 2;
    E.redraw();
  }

  E.redraw = () => { dirty = true; };
  E.get = (id) => E.pieces.find((p) => p.id === id) || null;
  E.selected = () => E.get(E.selId);

  E.toWorld = function (clientX, clientY) {
    const r = canvas.getBoundingClientRect(), v = E.view;
    return [(clientX - r.left - v.ox) / v.scale, (clientY - r.top - v.oy) / v.scale];
  };
  E.isOverCanvas = function (clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  };

  /* ---------------------------------------------------------- history */
  const snapshot = () => JSON.stringify(E.pieces);
  E.beginChange = function () { if (E.pending === null) E.pending = snapshot(); };
  E.endChange = function () {
    if (E.pending === null) return;
    if (E.pending !== snapshot()) {
      E.undoStack.push(E.pending);
      if (E.undoStack.length > 150) E.undoStack.shift();
      E.redoStack = [];
      E.onChange();
    }
    E.pending = null;
  };
  E.change = function (fn) { E.beginChange(); fn(); E.endChange(); E.redraw(); };
  E.undo = function () {
    if (!E.undoStack.length) return;
    E.redoStack.push(snapshot());
    E.pieces = JSON.parse(E.undoStack.pop());
    if (!E.get(E.selId)) E.select(null);
    E.onChange(); E.onSelect(); E.redraw();
  };
  E.redo = function () {
    if (!E.redoStack.length) return;
    E.undoStack.push(snapshot());
    E.pieces = JSON.parse(E.redoStack.pop());
    if (!E.get(E.selId)) E.select(null);
    E.onChange(); E.onSelect(); E.redraw();
  };
  E.setPieces = function (pieces, keepHistory) {
    if (keepHistory) E.beginChange();
    E.pieces = pieces;
    E.selId = null;
    if (keepHistory) E.endChange(); else { E.undoStack = []; E.redoStack = []; E.onChange(); }
    E.onSelect(); E.redraw();
  };

  /* -------------------------------------------------------- actions */
  E.select = function (id) { E.selId = id; E.onSelect(); E.redraw(); };

  E.add = function (piece) {
    E.change(() => E.pieces.push(piece));
    E.select(piece.id);
  };
  E.remove = function (id) {
    E.change(() => { E.pieces = E.pieces.filter((p) => p.id !== id); });
    if (E.selId === id) E.select(null);
  };
  E.duplicate = function (id) {
    const p = E.get(id);
    if (!p) return null;
    if (MR.TYPES[p.type].single) return 'single';
    const c = JSON.parse(JSON.stringify(p));
    c.id = MR.newId(); c.x += 30; c.y += 30;
    clampIntoWorld(c);
    E.add(c);
    return c;
  };
  E.rotateBy = function (id, deg) {
    const p = E.get(id);
    if (!p) return;
    E.change(() => { p.angle = normAngle(Math.round((p.angle + deg) / 5) * 5); });
    E.onSelect();
  };
  E.nudge = function (id, dx, dy) {
    const p = E.get(id);
    if (!p) return;
    E.change(() => { p.x += dx; p.y += dy; });
  };
  E.bringToFront = function (id) {
    const p = E.get(id);
    if (!p) return;
    E.change(() => { E.pieces = E.pieces.filter((q) => q !== p).concat([p]); });
  };

  function normAngle(a) { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; }
  E.normAngle = normAngle;

  function clampIntoWorld(p) {
    p.x = Math.max(0, Math.min(MR.WORLD.w, p.x));
    p.y = Math.max(0, Math.min(MR.WORLD.h, p.y));
  }

  /* ------------------------------------------------------- snapping */
  function applySnaps(p) {
    E.hint = null;
    // 1) connect ports (ramp ends, funnel spout, cup rim, ...)
    const mine = MR.worldPorts(p);
    let best = null;
    if (mine.length) {
      for (const q of E.pieces) {
        if (q === p) continue;
        for (const b of MR.worldPorts(q)) for (const a of mine) {
          const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (d < PORT_SNAP && (!best || d < best.d)) best = { d, dx: b[0] - a[0], dy: b[1] - a[1], at: b };
        }
      }
    }
    if (best) { p.x += best.dx; p.y += best.dy; E.hint = best.at; return; }
    // 2) rest on top of a base, or on the floor
    const wb = MR.worldBounds(p);
    let dy = null;
    if (Math.abs(wb.y1 - MR.WORLD.h) < SURFACE_SNAP) dy = MR.WORLD.h - wb.y1;
    for (const q of E.pieces) {
      if (q === p || MR.TYPES[q.type].cat !== 'base') continue;
      const qb = MR.worldBounds(q);
      if (wb.x1 <= qb.x0 + 4 || wb.x0 >= qb.x1 - 4) continue;
      const d = qb.y0 - wb.y1;
      if (Math.abs(d) < SURFACE_SNAP && (dy === null || Math.abs(d) < Math.abs(dy))) dy = d;
    }
    if (dy !== null) p.y += dy;
  }

  /* Pairs of ports that touch (drawn as bolts). */
  function connections() {
    const all = [];
    E.pieces.forEach((p, i) => MR.worldPorts(p).forEach((pt) => all.push({ i, pt })));
    const out = [];
    for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
      if (all[a].i === all[b].i) continue;
      if (Math.hypot(all[a].pt[0] - all[b].pt[0], all[a].pt[1] - all[b].pt[1]) < 2) out.push(all[a].pt);
    }
    return out;
  }
  E.connections = connections;

  /* ------------------------------------------------- pointer handling */
  function rotateHandle(p) {
    const lb = MR.localBounds(p);
    const hx = (lb.x0 + lb.x1) / 2, hy = lb.y0 - 34 / E.view.scale;
    return { local: [hx, hy], world: MR.toWorld(p, hx, hy), top: MR.toWorld(p, hx, lb.y0) };
  }

  function pieceAt(wx, wy) {
    const pad = 5 / E.view.scale;
    for (let i = E.pieces.length - 1; i >= 0; i--) if (MR.hitTest(E.pieces[i], wx, wy, pad)) return E.pieces[i];
    return null;
  }

  function onDown(e) {
    if (E.mode !== 'build' || e.button > 0) return;
    const [wx, wy] = E.toWorld(e.clientX, e.clientY);
    const sel = E.selected();
    if (sel) {
      const h = rotateHandle(sel).world;
      if (Math.hypot(wx - h[0], wy - h[1]) < 14 / E.view.scale) {
        E.beginChange();
        E.drag = { mode: 'rotate', id: sel.id };
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }
    const p = pieceAt(wx, wy);
    if (!p) { E.select(null); return; }
    E.select(p.id);
    E.beginChange();
    E.drag = { mode: 'move', id: p.id, ox: wx - p.x, oy: wy - p.y, sx: e.clientX, sy: e.clientY, moved: false };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  /* Start dragging a brand new piece from the palette. */
  E.startPaletteDrag = function (type, e) {
    if (E.mode !== 'build') return false;
    const [wx, wy] = E.toWorld(e.clientX, e.clientY);
    const p = MR.makePiece(type, wx, wy);
    E.beginChange();
    E.pieces.push(p);
    E.selId = p.id;
    E.drag = { mode: 'move', id: p.id, ox: 0, oy: 0, sx: e.clientX, sy: e.clientY, moved: false, fromPalette: true };
    E.onSelect(); E.redraw();
    return true;
  };

  function onMove(e) {
    if (!E.drag) return;
    const p = E.get(E.drag.id);
    if (!p) { E.drag = null; return; }
    const [wx, wy] = E.toWorld(e.clientX, e.clientY);
    if (E.drag.mode === 'move') {
      if (Math.hypot(e.clientX - E.drag.sx, e.clientY - E.drag.sy) > 3) E.drag.moved = true;
      if (!E.drag.moved) return;
      let x = wx - E.drag.ox, y = wy - E.drag.oy;
      if (E.snap) { x = Math.round(x / GRID) * GRID; y = Math.round(y / GRID) * GRID; }
      p.x = x; p.y = y;
      if (E.snap) applySnaps(p);
      E.drag.over = E.isOverCanvas(e.clientX, e.clientY);
    } else {
      const h = rotateHandle(p);
      const base = Math.atan2(h.local[1], h.local[0]);
      let a = (Math.atan2(wy - p.y, wx - p.x) - base) / D2R;
      a = Math.round(a / (E.snap ? 5 : 1)) * (E.snap ? 5 : 1);
      p.angle = normAngle(a);
      E.onSelect(true);
    }
    E.redraw();
  }

  function onUp(e) {
    if (!E.drag) return;
    const d = E.drag;
    E.drag = null; E.hint = null;
    if (d.fromPalette) {
      const over = E.isOverCanvas(e.clientX, e.clientY);
      const p = E.get(d.id);
      if (!over && d.moved) {
        // dropped back outside the build area: cancel
        E.pieces = E.pieces.filter((q) => q.id !== d.id);
        E.pending = null; E.selId = null; E.onSelect(); E.redraw();
        return;
      }
      if (!d.moved && p) {
        // a click (no drag): place it in the middle of the view
        p.x = MR.WORLD.w / 2; p.y = MR.WORLD.h / 2;
      }
      if (p) clampIntoWorld(p);
    } else {
      const p = E.get(d.id);
      if (p) clampIntoWorld(p);
    }
    E.endChange();
    E.onSelect();
    E.redraw();
  }

  /* --------------------------------------------------------- drawing */
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function drawBackground() {
    const W = MR.WORLD.w, H = MR.WORLD.h;
    ctx.fillStyle = cssVar('--paper', '#fbf8f1');
    ctx.fillRect(0, 0, W, VIEW_H);
    ctx.lineWidth = 1;
    ctx.strokeStyle = cssVar('--grid', 'rgba(60,90,140,0.08)');
    ctx.beginPath();
    for (let x = 0; x <= W; x += 20) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y += 20) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.strokeStyle = cssVar('--grid-major', 'rgba(60,90,140,0.16)');
    ctx.beginPath();
    for (let x = 0; x <= W; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y += 100) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    // floor
    ctx.fillStyle = '#9b7b55';
    ctx.fillRect(0, H, W, VIEW_H - H);
    ctx.fillStyle = '#7d5f3d';
    ctx.fillRect(0, H, W, 4);
    ctx.strokeStyle = 'rgba(60,40,20,0.25)';
    ctx.beginPath();
    for (let x = 60; x < W; x += 160) { ctx.moveTo(x, H + 8); ctx.lineTo(x + 50, H + 8); }
    ctx.stroke();
  }

  function drawSelection(p) {
    const lb = MR.localBounds(p), s = E.view.scale;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(p.angle * D2R);
    ctx.strokeStyle = '#2b6fd6'; ctx.lineWidth = 1.5 / s; ctx.setLineDash([6 / s, 4 / s]);
    const pad = 6 / s;
    ctx.strokeRect(lb.x0 - pad, lb.y0 - pad, lb.x1 - lb.x0 + pad * 2, lb.y1 - lb.y0 + pad * 2);
    ctx.setLineDash([]);
    ctx.restore();
    const h = rotateHandle(p);
    ctx.strokeStyle = '#2b6fd6'; ctx.lineWidth = 1.5 / s;
    ctx.beginPath(); ctx.moveTo(h.top[0], h.top[1]); ctx.lineTo(h.world[0], h.world[1]); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(h.world[0], h.world[1], 8 / s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(h.world[0], h.world[1], 4 / s, -Math.PI * 0.9, Math.PI * 0.4); ctx.stroke();
    // pivot marker
    ctx.fillStyle = '#2b6fd6';
    ctx.beginPath(); ctx.arc(p.x, p.y, 3 / s, 0, Math.PI * 2); ctx.fill();
  }

  function drawBolt(x, y) {
    const s = E.view.scale, r = Math.max(4, 5 / s);
    ctx.fillStyle = '#6b7480';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d6dbe1'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - r * 0.55, y); ctx.lineTo(x + r * 0.55, y); ctx.stroke();
  }

  function draw() {
    const v = E.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = cssVar('--stage', '#e7e2d6');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(v.dpr * v.scale, 0, 0, v.dpr * v.scale, v.dpr * v.ox, v.dpr * v.oy);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, MR.WORLD.w, VIEW_H); ctx.clip();
    drawBackground();
    if (E.mode === 'test' && E.sim) {
      MR.drawSim(ctx, E.sim, E.pieces, E.showTrail);
      ctx.restore();
      return;
    }
    for (const p of E.pieces) MR.drawPiece(ctx, p);
    for (const pt of connections()) drawBolt(pt[0], pt[1]);
    const sel = E.selected();
    if (E.drag && E.drag.mode === 'move') {
      // show every connection point while dragging
      const s = v.scale;
      ctx.strokeStyle = 'rgba(43,111,214,0.55)'; ctx.lineWidth = 1.5 / s;
      for (const q of E.pieces) for (const pt of MR.worldPorts(q)) {
        ctx.beginPath(); ctx.arc(pt[0], pt[1], 5 / s, 0, Math.PI * 2); ctx.stroke();
      }
      if (E.hint) {
        ctx.fillStyle = 'rgba(43,111,214,0.35)';
        ctx.beginPath(); ctx.arc(E.hint[0], E.hint[1], 12 / s, 0, Math.PI * 2); ctx.fill();
      }
      if (E.drag.fromPalette && E.drag.over === false) {
        ctx.fillStyle = 'rgba(200,60,40,0.08)';
        ctx.fillRect(0, 0, MR.WORLD.w, VIEW_H);
      }
    }
    if (sel) drawSelection(sel);
    ctx.restore();
  }
})();
