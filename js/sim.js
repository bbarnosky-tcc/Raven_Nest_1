/* Marble Run Lab — physics test runs (Matter.js).
 *
 * The simulator steps at a fixed 1/120 s, and the run time is
 * (number of steps × step size). This makes the time depend only on the build,
 * not on how fast the computer is, so the same run gives the same time on any
 * device and in slow motion.
 */
(function () {
  const MR = (window.MR = window.MR || {});
  const { Engine, Bodies, Body, Composite, Constraint, Vertices } = Matter;
  const D2R = Math.PI / 180;

  MR.DT = 1 / 120;
  MR.STUCK_SECONDS = 4;
  MR.TIMEOUT_SECONDS = 60;
  MR.MARBLE_SIDES = 64;
  MR.SURFACE = { friction: 0.05, frictionStatic: 0, restitution: 0.15 };

  MR.MARBLES = {
    glass: { label: 'Glass', style: 'glass', density: 0.004, restitution: 0.3, friction: 0.01, frictionAir: 0.0004 },
    steel: { label: 'Steel', style: 'steel', density: 0.012, restitution: 0.12, friction: 0.01, frictionAir: 0.0002 },
    rubber: { label: 'Rubber', style: 'red', density: 0.0022, restitution: 0.75, friction: 0.04, frictionAir: 0.0008 },
  };

  function primBody(p, pr, opts) {
    if (pr.t === 'rect') {
      const [x, y] = MR.toWorld(p, pr.x, pr.y);
      return Bodies.rectangle(x, y, pr.w, pr.h, Object.assign({ angle: p.angle * D2R + (pr.a || 0) }, opts));
    }
    if (pr.t === 'circle') {
      const [x, y] = MR.toWorld(p, pr.x, pr.y);
      return Bodies.circle(x, y, pr.r, opts, 24);
    }
    const pts = pr.pts.map(([lx, ly]) => { const [x, y] = MR.toWorld(p, lx, ly); return { x, y }; });
    const c = Vertices.centre(pts);
    return Bodies.fromVertices(c.x, c.y, [pts], opts);
  }

  function makeMarble(x, y, kind, type) {
    const m = MR.MARBLES[type] || MR.MARBLES.glass;
    const style = kind === 'relay' ? 'relay' : m.style;
    // Bodies.circle limits a small circle to ~12 sides, which makes it "cog" and
    // stall on gentle slopes, so build a smooth many-sided polygon instead.
    const b = Bodies.polygon(x, y, MR.MARBLE_SIDES, MR.MARBLE_R, {
      density: m.density, restitution: m.restitution, friction: m.friction,
      frictionStatic: 0, frictionAir: m.frictionAir, label: 'marble', slop: 0.02,
    });
    b.circleRadius = MR.MARBLE_R;
    // A marble is a solid sphere: I = 2/5 m r^2. (Matter.js would otherwise
    // use 4x a flat disc's inertia, making marbles roll far too slowly.)
    Body.setInertia(b, 0.4 * b.mass * MR.MARBLE_R * MR.MARBLE_R);
    b.plugin.mr = { style };
    return { body: b, kind, slow: 0, lost: false, trail: [] };
  }

  /* Build a ready-to-run simulation from a layout (array of pieces). */
  MR.createSim = function (pieces, opts) {
    opts = opts || {};
    const engine = Engine.create({ positionIterations: 10, velocityIterations: 8, constraintIterations: 4 });
    engine.gravity.y = 1;
    const world = engine.world;
    const W = MR.WORLD;

    const floor = Bodies.rectangle(W.w / 2, W.h + 30, W.w * 3, 60, { isStatic: true, friction: 0.3, label: 'floor' });
    Composite.add(world, floor);

    const dyn = [];        // moving machine bodies to draw
    const ropes = [];      // constraints to draw
    const sensors = [];    // finish zones (world-space vertex lists)
    const marbles = [];
    let start = null;

    pieces.forEach((p, idx) => {
      if (p.type === 'start') { start = p; return; }
      if (p.type === 'relay') {
        marbles.push(makeMarble(p.x, p.y, 'relay', opts.marble));
        return;
      }
      const g = MR.geom(p);
      const ngGroup = -(idx + 1);
      const groupParts = {};
      for (const pr of g.prims) {
        if (pr.ghost) continue;
        const filter = pr.ng ? { group: ngGroup } : undefined;
        if (pr.sensor) {
          const b = primBody(p, pr, { isStatic: true, isSensor: true });
          sensors.push({ kind: pr.sensor, verts: b.vertices.map((v) => ({ x: v.x, y: v.y })) });
          continue;
        }
        if (pr.g) {
          const b = primBody(p, pr, filter ? { collisionFilter: filter } : {});
          b.plugin.mr = { style: pr.style, t: pr.t };
          (groupParts[pr.g] = groupParts[pr.g] || []).push(b);
          continue;
        }
        const b = primBody(p, pr, Object.assign({ isStatic: true }, MR.SURFACE, filter ? { collisionFilter: filter } : {}));
        Composite.add(world, b);
      }
      const groupBodies = {};
      for (const name in groupParts) {
        const parts = groupParts[name], o = g.groups[name] || {};
        let body;
        if (parts.length === 1) body = parts[0];
        else {
          body = Body.create({ parts, collisionFilter: parts[0].collisionFilter });
        }
        if (o.density !== undefined) Body.setDensity(body, o.density);
        ['restitution', 'friction', 'frictionStatic', 'frictionAir', 'slop'].forEach((k) => { if (o[k] !== undefined) body[k] = o[k]; });
        if (o.noSpin) Body.setInertia(body, Infinity);
        groupBodies[name] = body;
        dyn.push(body);
        Composite.add(world, body);
      }
      for (const j of g.joints) {
        const body = groupBodies[j.g];
        if (!body) continue;
        if (j.t === 'pin') {
          const [x, y] = MR.toWorld(p, j.x, j.y);
          const c = Constraint.create({ pointA: { x, y }, bodyB: body, pointB: { x: x - body.position.x, y: y - body.position.y }, length: 0, stiffness: 1 });
          c.plugin.mr = { kind: 'pin' };
          ropes.push(c); Composite.add(world, c);
        } else if (j.t === 'rope') {
          const [x, y] = MR.toWorld(p, j.ax, j.ay);
          const c = Constraint.create({ pointA: { x, y }, bodyB: body, pointB: { x: 0, y: 0 }, stiffness: 1, damping: 0 });
          c.plugin.mr = { kind: 'rope' };
          ropes.push(c); Composite.add(world, c);
        }
      }
    });

    if (start) {
      const m = makeMarble(start.x, start.y, 'main', opts.marble);
      Body.setVelocity(m.body, { x: start.params.push || 0, y: 0 });
      marbles.unshift(m);
    }
    marbles.forEach((m) => Composite.add(world, m.body));

    const sim = {
      engine, dyn, ropes, sensors, marbles, floor,
      time: 0, steps: 0,
      status: start ? 'running' : 'nostart',
      finisher: null,
      step() {
        if (this.status !== 'running') return;
        Engine.update(engine, MR.DT * 1000);
        this.steps++;
        this.time = this.steps * MR.DT;
        let allDone = true, anyIn = false;
        for (const m of marbles) {
          if (m.lost) continue;
          const pos = m.body.position;
          if (this.steps % 3 === 0) { m.trail.push(pos.x, pos.y); if (m.trail.length > 4000) m.trail.splice(0, 2); }
          if (pos.y > W.h + 200 || pos.x < -300 || pos.x > W.w + 300) { m.lost = true; continue; }
          anyIn = true;
          for (const s of sensors) if (s.kind === 'finish' && Vertices.contains(s.verts, pos)) {
            this.status = 'finished'; this.finisher = m; return;
          }
          if (m.body.speed < 0.08 && Math.abs(m.body.angularSpeed) < 0.01) m.slow += MR.DT; else m.slow = 0;
          if (m.slow < MR.STUCK_SECONDS) allDone = false;
        }
        if (!anyIn) { this.status = 'lost'; return; }
        if (allDone) { this.status = 'stuck'; return; }
        if (this.time >= MR.TIMEOUT_SECONDS) this.status = 'timeout';
      },
    };
    return sim;
  };

  /* Run a whole test instantly with no drawing (used for quick checks/tests). */
  MR.runInstant = function (pieces, marble, maxSeconds) {
    const sim = MR.createSim(pieces, { marble });
    const max = Math.round((maxSeconds || MR.TIMEOUT_SECONDS) / MR.DT);
    while (sim.status === 'running' && sim.steps < max) sim.step();
    const m = sim.marbles[0];
    return {
      status: sim.status, time: +sim.time.toFixed(2),
      finisher: sim.finisher ? sim.finisher.kind : null,
      main: m ? { x: Math.round(m.body.position.x), y: Math.round(m.body.position.y) } : null,
      relays: sim.marbles.filter((x) => x.kind === 'relay').map((x) => ({ x: Math.round(x.body.position.x), y: Math.round(x.body.position.y) })),
      dyn: sim.dyn.map((b) => ({ angle: +b.angle.toFixed(2), x: Math.round(b.position.x), y: Math.round(b.position.y) })),
    };
  };

  /* Draw the running simulation. Static pieces are drawn from the layout
     (their shape is identical to the bodies); moving parts from the bodies. */
  MR.drawSim = function (ctx, sim, pieces, showTrail) {
    for (const p of pieces) MR.drawPiece(ctx, p, { sim: true });

    ctx.strokeStyle = '#444b55'; ctx.lineWidth = 1;
    for (const c of sim.ropes) if (c.plugin.mr.kind === 'rope') {
      const b = Constraint.pointBWorld(c);
      ctx.beginPath(); ctx.moveTo(c.pointA.x, c.pointA.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    for (const body of sim.dyn) {
      const parts = body.parts.length > 1 ? body.parts.slice(1) : [body];
      for (const part of parts) {
        const st = MR.STYLES[part.plugin.mr && part.plugin.mr.style] || MR.STYLES.wood;
        if (part.circleRadius && st.ball) { MR.drawBall(ctx, part.position.x, part.position.y, part.circleRadius, part.plugin.mr.style); continue; }
        ctx.beginPath();
        const v = part.vertices;
        ctx.moveTo(v[0].x, v[0].y);
        for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
        ctx.closePath();
        ctx.fillStyle = st.fill; ctx.fill();
        ctx.strokeStyle = st.stroke; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    for (const c of sim.ropes) if (c.plugin.mr.kind === 'pin') MR.drawAxle(ctx, c.pointA.x, c.pointA.y);

    if (showTrail) {
      for (const m of sim.marbles) {
        const t = m.trail;
        if (t.length < 4) continue;
        ctx.strokeStyle = m.kind === 'relay' ? 'rgba(240,138,60,0.55)' : 'rgba(76,155,232,0.55)';
        ctx.lineWidth = 2; ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(t[0], t[1]);
        for (let i = 2; i < t.length; i += 2) ctx.lineTo(t[i], t[i + 1]);
        ctx.stroke(); ctx.setLineDash([]);
      }
    }
    for (const m of sim.marbles) {
      const b = m.body;
      MR.drawBall(ctx, b.position.x, b.position.y, MR.MARBLE_R, b.plugin.mr.style, b.angle);
    }
  };
})();
