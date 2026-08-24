/* =========================================================
   Canardo — persistance
   Sauvegarde systématique : toute mutation passe par
   Store.commit(), qui écrit dans localStorage.
   ========================================================= */
(function (global) {
  'use strict';

  var KEY       = 'canardo.state.v1';
  var KEY_PREV  = 'canardo.state.prev.v1';   // filet de sécurité (état N-1)
  var SCHEMA    = 1;
  var DEBOUNCE  = 120;

  var timer = null;
  var pending = null;
  var listeners = [];
  var available = null;

  /* ---------- disponibilité de localStorage ---------- */
  function storageOk() {
    if (available !== null) return available;
    try {
      var probe = '__canardo_probe__';
      global.localStorage.setItem(probe, '1');
      global.localStorage.removeItem(probe);
      available = true;
    } catch (e) {
      available = false;
    }
    return available;
  }

  /* ---------- état par défaut ---------- */
  function defaults() {
    return {
      schema: SCHEMA,
      duck: {
        name: 'Canardo',
        color: '#FFC93C',
        moodBase: 60,      // humeur au début de la journée courante
        born: null
      },
      habits: [],
      tasks: [],
      log: {},             // "AAAA-MM-JJ" -> { mood, done, due }
      settings: { theme: 'auto', reduceMotion: false },
      meta: {
        lastProcessed: null,   // dernier jour clôturé
        createdAt: null,
        savedAt: null,
        pets: { date: null, count: 0 },
        onboarded: false
      }
    };
  }

  /* ---------- fusion défensive ---------- */
  function merge(base, incoming) {
    if (!incoming || typeof incoming !== 'object') return base;
    Object.keys(base).forEach(function (k) {
      var b = base[k], i = incoming[k];
      if (i === undefined || i === null) return;
      if (Array.isArray(b)) {
        if (Array.isArray(i)) base[k] = i;
      } else if (b && typeof b === 'object' && !Array.isArray(b)) {
        if (typeof i === 'object' && !Array.isArray(i)) base[k] = merge(b, i);
      } else {
        base[k] = i;
      }
    });
    // Les journaux sont des dictionnaires libres : on les reprend tels quels.
    if (incoming.log && typeof incoming.log === 'object') base.log = incoming.log;
    return base;
  }

  function migrate(raw) {
    var state = merge(defaults(), raw);
    state.schema = SCHEMA;
    if (!Array.isArray(state.habits)) state.habits = [];
    if (!Array.isArray(state.tasks)) state.tasks = [];
    if (!state.log || typeof state.log !== 'object') state.log = {};
    return state;
  }

  /* ---------- lecture ---------- */
  function load() {
    if (!storageOk()) return { state: defaults(), fresh: true, warning: 'no-storage' };
    var raw = null, parsed = null, warning = null;
    try {
      raw = global.localStorage.getItem(KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (e) {
      warning = 'corrupt';
    }
    if (!parsed) {
      // tentative de récupération sur la sauvegarde précédente
      try {
        var prev = global.localStorage.getItem(KEY_PREV);
        if (prev) { parsed = JSON.parse(prev); warning = warning || 'recovered'; }
      } catch (e2) { /* on repart de zéro */ }
    }
    if (!parsed) return { state: defaults(), fresh: true, warning: warning };
    return { state: migrate(parsed), fresh: false, warning: warning };
  }

  /* ---------- écriture ---------- */
  function write(state) {
    if (!storageOk()) { emit('error', state, 'no-storage'); return false; }
    try {
      var current = global.localStorage.getItem(KEY);
      state.meta.savedAt = new Date().toISOString();
      var payload = JSON.stringify(state);
      global.localStorage.setItem(KEY, payload);
      // l'état précédent ne devient un filet qu'une fois le nouveau écrit
      if (current) {
        try { global.localStorage.setItem(KEY_PREV, current); } catch (e) { /* non critique */ }
      }
      emit('saved', state, null);
      return true;
    } catch (e) {
      var reason = (e && (e.name === 'QuotaExceededError' || e.code === 22)) ? 'quota' : 'write';
      emit('error', state, reason);
      return false;
    }
  }

  /* ---------- API de sauvegarde ---------- */
  function commit(state) {          // sauvegarde groupée (120 ms)
    pending = state;
    emit('saving', state, null);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE);
  }

  function flush() {                // écriture immédiate
    if (timer) { clearTimeout(timer); timer = null; }
    if (!pending) return false;
    var s = pending; pending = null;
    return write(s);
  }

  function emit(type, state, reason) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i]({ type: type, state: state, reason: reason, at: new Date() }); }
      catch (e) { /* un abonné fautif ne doit pas casser la sauvegarde */ }
    }
  }

  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  /* ---------- export / import ---------- */
  function exportText(state) {
    return JSON.stringify({
      app: 'canardo',
      schema: SCHEMA,
      exportedAt: new Date().toISOString(),
      data: state
    }, null, 2);
  }

  function download(state, filename) {
    var blob = new Blob([exportText(state)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || ('canardo-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.json');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function parseImport(text) {
    var obj = JSON.parse(text);                 // laisse remonter l'erreur de syntaxe
    var data = (obj && obj.data) ? obj.data : obj;
    if (!data || typeof data !== 'object') throw new Error('format');
    if (!Array.isArray(data.habits) && !Array.isArray(data.tasks) && !data.duck) throw new Error('format');
    return migrate(data);
  }

  function clear() {
    if (timer) { clearTimeout(timer); timer = null; }
    pending = null;
    if (!storageOk()) return;
    try {
      global.localStorage.removeItem(KEY);
      global.localStorage.removeItem(KEY_PREV);
    } catch (e) { /* rien à faire */ }
  }

  global.Store = {
    defaults: defaults,
    load: load,
    commit: commit,
    flush: flush,
    onChange: onChange,
    exportText: exportText,
    download: download,
    parseImport: parseImport,
    clear: clear,
    storageOk: storageOk
  };
})(window);
