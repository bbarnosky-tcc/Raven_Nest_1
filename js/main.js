/* Marble Run Lab — app wiring: palette, inspector, test runs, run log, saving. */
(function () {
  const MR = window.MR;
  const E = MR.editor;
  const $ = (id) => document.getElementById(id);

  const ui = {
    palette: $('palette'), inspector: $('inspector'), runlog: $('runlog'),
    btnTest: $('btnTest'), btnPause: $('btnPause'), selSpeed: $('selSpeed'), selMarble: $('selMarble'),
    chkTrail: $('chkTrail'), chkSnap: $('chkSnap'), timer: document.querySelector('.timer'),
    timerValue: $('timerValue'), timerLabel: $('timerLabel'), warn: $('warn'),
    result: $('result'), hint: $('hint'), toast: $('toast'), selLoad: $('selLoad'),
  };

  const runs = [];
  let clipboard = null, paused = false, acc = 0, lastFrame = 0, runMarble = 'glass';

  /* ---------------------------------------------------------- helpers */
  let toastTimer = 0;
  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (ui.toast.hidden = true), 2600);
  }
  const fmt = (t) => {
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  };
  const el = (tag, attrs, kids) => {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach((c) => c && n.appendChild(c));
    return n;
  };

  /* ---------------------------------------------------------- palette */
  function thumb(type) {
    const c = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    c.width = 56 * dpr; c.height = 38 * dpr;
    const ctx = c.getContext('2d');
    const p = MR.makePiece(type, 0, 0);
    const lb = MR.localBounds(p);
    // bounds of the rotated piece, so tilted defaults still fit
    const corners = [[lb.x0, lb.y0], [lb.x1, lb.y0], [lb.x1, lb.y1], [lb.x0, lb.y1]].map(([x, y]) => MR.toWorld(p, x, y));
    const xs = corners.map((q) => q[0]), ys = corners.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const s = Math.min(52 / (x1 - x0), 33 / (y1 - y0), 1.2);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (28 - ((x0 + x1) / 2) * s), dpr * (19 - ((y0 + y1) / 2) * s));
    MR.drawPiece(ctx, p);
    return c;
  }

  function buildPalette() {
    for (const cat of MR.CATEGORIES) {
      const grid = el('div', { class: 'pal-grid' });
      for (const type in MR.TYPES) {
        const def = MR.TYPES[type];
        if (def.cat !== cat.id) continue;
        const item = el('div', {
          class: 'pal-item', role: 'button', tabindex: '0', 'data-type': type,
          title: def.info + '\n\nDrag onto the board (or click to add).',
        }, [thumb(type), el('span', { text: def.label })]);
        item.addEventListener('pointerdown', (e) => {
          if (e.button > 0) return;
          e.preventDefault();
          addFromPalette(type, e);
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addCentered(type); }
        });
        grid.appendChild(item);
      }
      ui.palette.appendChild(el('div', null, [el('h2', { text: cat.label }), grid]));
    }
  }

  function singleExists(type) {
    if (!MR.TYPES[type].single) return null;
    return E.pieces.find((p) => p.type === type) || null;
  }

  function addFromPalette(type, e) {
    if (E.mode !== 'build') return;
    const existing = singleExists(type);
    if (existing) { E.select(existing.id); toast('There can only be one ' + MR.TYPES[type].label + '. It is selected — drag it where you want it.'); return; }
    E.startPaletteDrag(type, e);
  }
  function addCentered(type) {
    if (E.mode !== 'build') return;
    const existing = singleExists(type);
    if (existing) { E.select(existing.id); toast('There can only be one ' + MR.TYPES[type].label + '.'); return; }
    E.add(MR.makePiece(type, MR.WORLD.w / 2, MR.WORLD.h / 2));
  }

  /* -------------------------------------------------------- inspector */
  function slider(label, value, spec, onInput, unit) {
    const out = el('output', { text: value + (unit || '') });
    const input = el('input', { type: 'range', min: spec.min, max: spec.max, step: spec.step, value, 'aria-label': label });
    input.addEventListener('pointerdown', () => E.beginChange());
    input.addEventListener('keydown', () => E.beginChange());
    input.addEventListener('input', () => {
      E.beginChange();
      const v = +input.value;
      out.textContent = v + (unit || '');
      onInput(v);
      E.redraw();
    });
    input.addEventListener('change', () => E.endChange());
    return el('label', { class: 'slider' }, [el('span', { text: label }), out, input]);
  }

  let inspectorFor = null;
  function renderInspector(soft) {
    const p = E.selected();
    // during a rotate drag only refresh the angle readout
    if (soft && p && inspectorFor === p.id) {
      const a = ui.inspector.querySelector('[data-angle]');
      if (a) { a.querySelector('input').value = p.angle; a.querySelector('output').textContent = p.angle + '°'; }
      return;
    }
    inspectorFor = p ? p.id : null;
    ui.inspector.innerHTML = '';
    if (!p) {
      ui.inspector.append(
        el('h2', { text: 'Build your run' }),
        el('ol', { class: 'tips' }, [
          el('li', { text: 'Stack bases (walls, boxes, pillars) to make height.' }),
          el('li', { text: 'Add simple machines on top. Blue dots snap together to connect pieces.' }),
          el('li', { text: 'Place one Start Gate and one Finish Cup.' }),
          el('li', { text: 'Press ▶ Test Run to release the marble and time it.' }),
        ])
      );
      return;
    }
    const def = MR.TYPES[p.type];
    ui.inspector.append(el('h2', { text: def.label }));
    if (def.machine) ui.inspector.append(el('span', { class: 'tag', text: 'Simple machine: ' + def.machine }));
    else if (def.cat === 'base') ui.inspector.append(el('span', { class: 'tag', text: 'Base' }));
    ui.inspector.append(el('p', { class: 'info', text: def.info }));

    const ang = slider('Angle', p.angle, { min: -180, max: 180, step: 1 }, (v) => { p.angle = v; }, '°');
    ang.setAttribute('data-angle', '');
    ui.inspector.append(ang);
    for (const k in def.params) {
      const spec = def.params[k];
      ui.inspector.append(slider(spec.label, p.params[k], spec, (v) => { p.params[k] = v; }, spec.unit));
    }
    ui.inspector.append(el('div', { class: 'btn-row' }, [
      el('button', { text: '⟲ 15°', title: 'Rotate left (Q)', onclick: () => E.rotateBy(p.id, -15) }),
      el('button', { text: '⟳ 15°', title: 'Rotate right (E)', onclick: () => E.rotateBy(p.id, 15) }),
      el('button', { text: 'Level', title: 'Set angle to 0°', onclick: () => E.rotateBy(p.id, -p.angle) }),
    ]));
    ui.inspector.append(el('div', { class: 'btn-row' }, [
      el('button', { text: '⧉ Duplicate', title: 'Make a copy (Ctrl+D)', onclick: duplicateSelected }),
      el('button', { text: 'To front', onclick: () => E.bringToFront(p.id) }),
      el('button', { text: '✕ Delete', class: 'danger', title: 'Delete', onclick: () => E.remove(p.id) }),
    ]));
  }

  function duplicateSelected() {
    const r = E.duplicate(E.selId);
    if (r === 'single') toast('Only one ' + MR.TYPES[E.selected().type].label + ' is allowed.');
  }

  /* ---------------------------------------------------------- warnings */
  function missing() {
    const out = [];
    if (!E.pieces.some((p) => p.type === 'start')) out.push('Start Gate');
    if (!E.pieces.some((p) => p.type === 'finish')) out.push('Finish Cup');
    return out;
  }
  function updateWarn() {
    const m = missing();
    if (E.mode === 'build' && m.length) {
      ui.warn.textContent = 'Add a ' + m.join(' and a ') + ' (under Start & Finish) to test your run.';
      ui.warn.hidden = false;
    } else ui.warn.hidden = true;
  }

  /* --------------------------------------------------------- test runs */
  function setTimer(t, state, label) {
    ui.timerValue.textContent = fmt(t);
    ui.timer.className = 'timer' + (state ? ' ' + state : '');
    ui.timerLabel.textContent = label || 'Timer';
  }

  function startTest() {
    const m = missing();
    if (m.length) { toast('You need a ' + m.join(' and a ') + ' first.'); updateWarn(); return; }
    E.select(null);
    E.drag = null;
    runMarble = ui.selMarble.value;
    E.sim = MR.createSim(E.pieces, { marble: runMarble });
    E.mode = 'test';
    paused = false; acc = 0; lastFrame = performance.now();
    ui.result.hidden = true;
    ui.palette.classList.add('locked');
    ui.btnTest.textContent = '■ Stop';
    ui.btnTest.title = 'Stop the test and go back to building (Space)';
    ui.btnPause.disabled = false;
    ui.btnPause.textContent = '❚❚ Pause';
    ui.hint.textContent = 'Testing… The timer counts simulated seconds, so slow motion gives the same time.';
    setTimer(0, 'running', 'Running');
    updateWarn();
    requestAnimationFrame(loop);
  }

  function stopTest() {
    E.mode = 'build';
    E.sim = null;
    ui.result.hidden = true;
    ui.palette.classList.remove('locked');
    ui.btnTest.textContent = '▶ Test Run';
    ui.btnTest.title = 'Release the marble (Space)';
    ui.btnPause.disabled = true;
    ui.hint.textContent = 'Drag pieces from the left onto the board. Click a piece to change its size and angle. Line up the blue dots to connect pieces.';
    if (ui.timer.classList.contains('running')) setTimer(0, '', 'Timer');
    else ui.timerLabel.textContent = 'Last run';
    updateWarn();
    E.redraw();
  }

  function loop(now) {
    const sim = E.sim;
    if (E.mode !== 'test' || !sim) return;
    const real = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!paused && sim.status === 'running') {
      acc += real * +ui.selSpeed.value;
      let n = 0;
      while (acc >= MR.DT && n < 40 && sim.status === 'running') { sim.step(); acc -= MR.DT; n++; }
      if (n >= 40) acc = 0;
      setTimer(sim.time, 'running', 'Running');
      if (sim.status !== 'running') finishRun(sim);
    }
    E.showTrail = ui.chkTrail.checked;
    if (sim.status === 'running') requestAnimationFrame(loop);
    else E.redraw();
  }

  const RESULTS = {
    finished: { icon: '🏁', title: 'Finished!', ok: true },
    stuck: { icon: '🛑', title: 'Marble got stuck', msg: 'Every marble stopped moving for ' + MR.STUCK_SECONDS + ' seconds. Try a steeper ramp or close a gap.' },
    lost: { icon: '💨', title: 'Marble fell off the board', msg: 'Watch the trail to see where it escaped, then add a wall or wedge there.' },
    timeout: { icon: '⏱', title: 'Time limit reached', msg: 'Runs stop after ' + MR.TIMEOUT_SECONDS + ' seconds.' },
  };

  function finishRun(sim) {
    const r = RESULTS[sim.status] || RESULTS.stuck;
    const marbleLabel = MR.MARBLES[runMarble].label;
    const time = sim.status === 'finished' ? sim.time : sim.status === 'stuck' ? sim.time - MR.STUCK_SECONDS : sim.time;
    setTimer(time, r.ok ? 'finished' : 'failed', r.ok ? 'Finished' : 'Not finished');
    runs.push({ n: runs.length + 1, status: sim.status, time, marble: marbleLabel, relay: sim.finisher && sim.finisher.kind === 'relay' });
    renderLog();
    const best = bestRun();
    $('resultIcon').textContent = r.icon;
    $('resultTitle').textContent = r.title;
    $('resultTime').textContent = r.ok ? time.toFixed(2) + ' s' : fmt(time);
    let msg = r.msg || '';
    if (r.ok) {
      msg = marbleLabel + ' marble' + (sim.finisher.kind === 'relay' ? ' (the relay marble crossed the line)' : '') + '.';
      if (best && best.n === runs.length && runs.filter((x) => x.status === 'finished').length > 1) msg += ' New best time!';
      else if (best && best.n !== runs.length) msg += ' Best so far: ' + best.time.toFixed(2) + ' s.';
    }
    $('resultMsg').textContent = msg;
    document.querySelector('.result-card').className = 'result-card ' + (r.ok ? 'ok' : 'bad');
    ui.result.hidden = false;
    ui.btnPause.disabled = true;
    $('btnAgain').focus({ preventScroll: true });
  }

  function bestRun() {
    let best = null;
    for (const r of runs) if (r.status === 'finished' && (!best || r.time < best.time)) best = r;
    return best;
  }

  function renderLog() {
    ui.runlog.innerHTML = '';
    if (!runs.length) { ui.runlog.append(el('li', { class: 'empty', text: 'No test runs yet.' })); return; }
    const best = bestRun();
    for (let i = runs.length - 1; i >= 0; i--) {
      const r = runs[i], ok = r.status === 'finished';
      const li = el('li', { class: (ok ? 'ok' : 'fail') + (best === r ? ' best' : '') }, [
        el('span', { class: 'n', text: '#' + r.n }),
        el('span', { class: 'd', text: r.marble + ' · ' + (ok ? (best === r ? '★ best' : 'finished') : r.status) }),
        el('span', { class: 't', text: ok ? r.time.toFixed(2) + ' s' : '—' }),
      ]);
      ui.runlog.append(li);
    }
  }

  /* ------------------------------------------------------ save / load */
  const SAMPLE = '__sample', BLANK = '__blank', DELETE = '__delete';
  function refreshLoadList() {
    const sel = ui.selLoad;
    sel.innerHTML = '';
    sel.append(el('option', { value: '', text: '📂 Load…' }));
    sel.append(el('option', { value: SAMPLE, text: 'Sample run' }));
    sel.append(el('option', { value: BLANK, text: 'Blank board' }));
    const slots = MR.storage.slots();
    const names = Object.keys(slots).sort();
    if (names.length) {
      const grp = el('optgroup', { label: 'My saved runs' });
      names.forEach((n) => grp.append(el('option', { value: 'slot:' + n, text: n })));
      sel.append(grp);
      sel.append(el('option', { value: DELETE, text: '🗑 Delete a saved run…' }));
    }
    sel.value = '';
  }

  function loadPieces(pieces, label) {
    if (E.mode === 'test') stopTest();
    E.setPieces(pieces, true);
    if (label) toast('Loaded ' + label + '.');
  }

  /* ---------------------------------------------------- sample layout */
  function attach(p, pi, q, qi, dx, dy) {
    const a = MR.worldPorts(p)[pi], b = MR.worldPorts(q)[qi];
    p.x += b[0] - a[0] + (dx || 0);
    p.y += b[1] - a[1] + (dy || 0);
  }
  function piece(type, x, y, angle, params) {
    const p = MR.makePiece(type, x, y);
    if (angle !== undefined) p.angle = angle;
    Object.assign(p.params, params || {});
    return p;
  }
  function restOn(p, base) {
    // move base so its top touches the bottom of p, and its bottom on the floor
    const pb = MR.worldBounds(p);
    base.params.h = Math.round(MR.WORLD.h - pb.y1);
    base.y = MR.WORLD.h - base.params.h / 2;
  }
  MR.sampleLayout = function () {
    const rampA = piece('ramp', 300, 190, 10, { len: 320 });
    const start = piece('start', 0, 0, 0, { push: 1.5 });
    attach(start, 0, rampA, 0, 22, 0);
    const funnel = piece('funnel', 0, 0, 0, { top: 190, h: 100, gap: 38 });
    const endA = MR.worldPorts(rampA)[1];
    funnel.x = endA[0] + 55; funnel.y = endA[1] + 85;
    const screw = piece('screw', 0, 0, 0, { turns: 3, w: 170, pitch: 80 });
    const spout = MR.worldPorts(funnel)[2];
    attach(screw, 0, funnel, 2, 0, 18);
    const exit = MR.worldPorts(screw)[1];
    const rampB = piece('ramp', 0, 0, 9, { len: 360 });
    attach(rampB, 0, screw, 1, -40, 46);
    const track = piece('ramp', 0, 0, 0, { len: 260 });
    attach(track, 0, rampB, 1);
    const cradle = piece('cradle', 0, 0, 0, { n: 5, L: 110 });
    const tr = MR.worldPorts(track)[0];
    cradle.x = tr[0] + 150; cradle.y = tr[1] - 14.5 - 110;
    const relay = piece('relay', cradle.x + 2 * 28.4 + 14 + 12.5, tr[1] - 12);
    const rampC = piece('ramp', 0, 0, 14, { len: 300 });
    attach(rampC, 0, track, 1);
    const finish = piece('finish', 0, 0, 0, { w: 110 });
    const endC = MR.worldPorts(rampC)[1];
    finish.x = endC[0] + 60; finish.y = MR.WORLD.h - 30;
    const backstop = piece('wall', 0, 0, 0, { w: 30, h: 260 });
    backstop.x = finish.x + finish.params.w / 2 + 15; backstop.y = MR.WORLD.h - 130;

    const wall = piece('wall', 0, 0, 0, { w: 30, h: 400 });
    restOn(rampA, wall); wall.x = MR.worldBounds(rampA).x0 + 30;
    const pillar = piece('pillar', 0, 0, 0, { w: 54 });
    const sb = MR.worldBounds(screw);
    pillar.params.h = Math.round(MR.WORLD.h - sb.y1);
    pillar.x = (sb.x0 + sb.x1) / 2 - 40; pillar.y = MR.WORLD.h - pillar.params.h / 2;
    const table = piece('table', 0, 0, 0, { w: 260 });
    const tb = MR.worldBounds(track);
    table.params.h = Math.round(MR.WORLD.h - tb.y1);
    table.x = (tb.x0 + tb.x1) / 2; table.y = MR.WORLD.h - table.params.h / 2;
    const box = piece('box', 0, 0, 0, { w: 150 });
    const cb = MR.worldBounds(rampC);
    box.params.h = Math.round(MR.WORLD.h - cb.y1);
    box.x = cb.x1 - 100; box.y = MR.WORLD.h - box.params.h / 2;
    const books = piece('books', 0, 0, 0, { w: 120, h: 80 });
    books.x = (MR.worldBounds(rampB).x0 + MR.worldBounds(rampB).x1) / 2 + 60; books.y = MR.WORLD.h - 40;

    const all = [wall, pillar, table, box, books, rampA, funnel, screw, rampB, track, cradle, relay, rampC, finish, backstop, start];
    void spout; void exit;
    all.forEach((p) => { p.x = Math.round(p.x * 10) / 10; p.y = Math.round(p.y * 10) / 10; });
    return all;
  };

  /* ---------------------------------------------------------- keyboard */
  function onKey(e) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    if (tag === 'SELECT' || tag === 'TEXTAREA') return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === ' ' && tag !== 'BUTTON') { e.preventDefault(); E.mode === 'test' ? stopTest() : startTest(); return; }
    if (e.key === 'Escape') { if (E.mode === 'test') stopTest(); else E.select(null); return; }
    if (E.mode !== 'build') return;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? E.redo() : E.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); E.redo(); return; }
    if (mod && e.key.toLowerCase() === 'v' && clipboard) {
      e.preventDefault();
      if (singleExists(clipboard.type)) { toast('Only one ' + MR.TYPES[clipboard.type].label + ' is allowed.'); return; }
      const c = JSON.parse(JSON.stringify(clipboard));
      c.id = MR.newId(); c.x += 40; c.y += 40;
      clipboard = JSON.parse(JSON.stringify(c));
      E.add(c);
      return;
    }
    const p = E.selected();
    if (!p || tag === 'INPUT') return;
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (mod && e.key.toLowerCase() === 'c') { clipboard = JSON.parse(JSON.stringify(p)); toast('Copied ' + MR.TYPES[p.type].label + '.'); return; }
    if (mod) return;
    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case 'Delete': case 'Backspace': e.preventDefault(); E.remove(p.id); break;
      case 'q': case 'Q': E.rotateBy(p.id, -15); break;
      case 'e': case 'E': E.rotateBy(p.id, 15); break;
      case 'ArrowLeft': e.preventDefault(); E.nudge(p.id, -step, 0); break;
      case 'ArrowRight': e.preventDefault(); E.nudge(p.id, step, 0); break;
      case 'ArrowUp': e.preventDefault(); E.nudge(p.id, 0, -step); break;
      case 'ArrowDown': e.preventDefault(); E.nudge(p.id, 0, step); break;
    }
  }

  /* ------------------------------------------------------------- init */
  function init() {
    buildPalette();
    E.init($('board'));
    E.onSelect = (soft) => renderInspector(soft);
    E.onChange = () => { MR.storage.saveCurrent(E.pieces); updateWarn(); };

    const saved = MR.storage.loadCurrent();
    E.setPieces(saved && saved.length ? saved : MR.sampleLayout());
    renderInspector();
    refreshLoadList();
    updateWarn();

    ui.btnTest.addEventListener('click', () => (E.mode === 'test' ? stopTest() : startTest()));
    ui.btnPause.addEventListener('click', () => {
      paused = !paused;
      ui.btnPause.textContent = paused ? '▶ Resume' : '❚❚ Pause';
      ui.timerLabel.textContent = paused ? 'Paused' : 'Running';
    });
    $('btnAgain').addEventListener('click', startTest);
    $('btnEdit').addEventListener('click', stopTest);
    ui.chkTrail.addEventListener('change', () => { E.showTrail = ui.chkTrail.checked; E.redraw(); });
    ui.chkSnap.addEventListener('change', () => { E.snap = ui.chkSnap.checked; });
    $('btnUndo').addEventListener('click', () => E.mode === 'build' && E.undo());
    $('btnRedo').addEventListener('click', () => E.mode === 'build' && E.redo());
    $('btnClear').addEventListener('click', () => {
      if (!E.pieces.length) return;
      if (confirm('Remove every piece from the board? (You can Undo.)')) loadPieces([], null);
    });
    $('btnSave').addEventListener('click', () => {
      const name = (prompt('Name this marble run:', 'My marble run') || '').trim();
      if (!name) return;
      if (MR.storage.slots()[name] && !confirm('Replace the saved run called "' + name + '"?')) return;
      if (MR.storage.save(name, E.pieces)) { toast('Saved "' + name + '" in this browser.'); refreshLoadList(); }
      else toast('Could not save here. Use Export to download a file instead.');
    });
    ui.selLoad.addEventListener('change', () => {
      const v = ui.selLoad.value;
      ui.selLoad.value = '';
      if (!v) return;
      if (v === SAMPLE) loadPieces(MR.sampleLayout(), 'the sample run');
      else if (v === BLANK) loadPieces([], null);
      else if (v === DELETE) {
        const name = (prompt('Type the name of the saved run to delete:\n' + Object.keys(MR.storage.slots()).join('\n')) || '').trim();
        if (name && MR.storage.slots()[name]) { MR.storage.remove(name); toast('Deleted "' + name + '".'); refreshLoadList(); }
      } else if (v.startsWith('slot:')) {
        const name = v.slice(5);
        try { loadPieces(MR.storage.load(name), '"' + name + '"'); } catch (err) { toast(err.message); }
      }
    });
    $('btnExport').addEventListener('click', () => {
      const name = prompt('File name for your design:', 'my-marble-run');
      if (name === null) return;
      MR.storage.exportFile(E.pieces, name || 'my-marble-run');
    });
    $('btnImport').addEventListener('click', () => $('fileImport').click());
    $('fileImport').addEventListener('change', (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      MR.storage.importFile(f).then((pieces) => loadPieces(pieces, f.name)).catch((err) => toast(err.message));
    });
    document.addEventListener('keydown', onKey);
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', E.redraw); } catch (e) { /* old browsers */ }

    // hooks for automated tests
    MR.app = { startTest, stopTest, runs, editor: E, loadPieces };
  }

  init();
})();
