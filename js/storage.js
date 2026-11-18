/* Marble Run Lab — saving, loading, export and import. */
(function () {
  const MR = (window.MR = window.MR || {});
  const SLOTS_KEY = 'marbleRunLab.slots.v1';
  const CURRENT_KEY = 'marbleRunLab.current.v1';

  function read(key) {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  MR.toFile = (pieces) => ({ app: 'marble-run-lab', version: 1, pieces });

  MR.fromFile = function (data) {
    const list = Array.isArray(data) ? data : data && Array.isArray(data.pieces) ? data.pieces : null;
    if (!list) throw new Error('This file is not a Marble Run Lab design.');
    const out = [], seen = new Set();
    for (const raw of list) {
      const p = MR.sanitizePiece(raw);
      if (!p) continue;
      if (seen.has(p.id)) p.id = MR.newId();
      seen.add(p.id);
      out.push(p);
    }
    return out;
  };

  MR.storage = {
    slots() { return read(SLOTS_KEY) || {}; },
    save(name, pieces) {
      const all = this.slots();
      all[name] = { savedAt: new Date().toISOString(), data: MR.toFile(pieces) };
      return write(SLOTS_KEY, all);
    },
    load(name) {
      const s = this.slots()[name];
      return s ? MR.fromFile(s.data) : null;
    },
    remove(name) {
      const all = this.slots();
      delete all[name];
      return write(SLOTS_KEY, all);
    },
    saveCurrent(pieces) { write(CURRENT_KEY, MR.toFile(pieces)); },
    loadCurrent() {
      const d = read(CURRENT_KEY);
      try { return d ? MR.fromFile(d) : null; } catch (e) { return null; }
    },
    exportFile(pieces, name) {
      const blob = new Blob([JSON.stringify(MR.toFile(pieces), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (name || 'my-marble-run').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    importFile(file) {
      return file.text().then((txt) => {
        let data;
        try { data = JSON.parse(txt); } catch (e) { throw new Error('That file could not be read as a design.'); }
        return MR.fromFile(data);
      });
    },
  };
})();
