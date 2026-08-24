/* =========================================================
   Canardo — interface
   ========================================================= */
(function (global) {
  'use strict';

  var L = global.Logic;
  var state = null;
  var taskFilter = 'open';

  var COLORS = [
    { name: 'Jaune',    hex: '#FFC93C' },
    { name: 'Ivoire',   hex: '#F1EDE2' },
    { name: 'Caramel',  hex: '#D08B4B' },
    { name: 'Colvert',  hex: '#6FA88A' },
    { name: 'Rose',     hex: '#F5A3C0' },
    { name: 'Bleu',     hex: '#8FB8ED' },
    { name: 'Lavande',  hex: '#B49BE0' },
    { name: 'Menthe',   hex: '#7FD1C1' }
  ];

  var SEED_HABITS = [
    { title: 'Bouger 20 minutes', icon: '🏃', days: [0, 1, 2, 3, 4, 5, 6] },
    { title: 'Lire 10 pages',     icon: '📖', days: [0, 1, 2, 3, 4, 5, 6] },
    { title: 'Ranger 5 minutes',  icon: '🧹', days: [1, 2, 3, 4, 5] }
  ];

  function $(id) { return document.getElementById(id); }
  function on(node, ev, fn) { if (node) node.addEventListener(ev, fn); }

  function elem(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  /* =======================================================
     Sauvegarde
     ======================================================= */
  function persist() {
    state.meta.bestStreak = L.bestStreak(state);
    L.touchLog(state);
    Store.commit(state);
  }

  /** Toute modification passe par ici : on enregistre puis on redessine. */
  function mutate(fn) {
    fn();
    persist();
    renderAll();
  }

  function wireSaveIndicator() {
    var badge = $('saveState');
    Store.onChange(function (ev) {
      if (!badge) return;
      badge.classList.remove('is-saving', 'is-error', 'flash');
      if (ev.type === 'saving') {
        badge.textContent = 'Sauvegarde…';
        badge.classList.add('is-saving');
      } else if (ev.type === 'saved') {
        var t = ev.at;
        badge.textContent = 'Sauvegardé ' +
          String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
        void badge.offsetWidth;          // relance l'animation
        badge.classList.add('flash');
      } else {
        badge.classList.add('is-error');
        badge.textContent = ev.reason === 'quota' ? 'Mémoire pleine' : 'Non sauvegardé';
        toast(ev.reason === 'quota'
          ? "Le stockage du navigateur est plein. Exportez puis réinitialisez."
          : "Sauvegarde impossible dans ce navigateur. Exportez vos données.");
      }
    });
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-on');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 3200);
  }

  /* =======================================================
     Rendu — scène
     ======================================================= */
  function renderStage() {
    var mood = L.currentMood(state);
    var tier = L.tierFor(mood);

    Duck.render(mood, state.duck.color);

    $('duckName').textContent = state.duck.name || 'Canardo';
    $('moodEmoji').textContent = tier.emoji;
    $('moodLabel').textContent = tier.label;
    $('moodHint').textContent = moodHint(tier, mood);

    $('moodFill').style.width = mood.toFixed(1) + '%';
    var meter = $('moodMeter');
    meter.setAttribute('aria-valuenow', Math.round(mood));
    meter.setAttribute('aria-valuetext', tier.label + ', ' + Math.round(mood) + ' sur 100');

    var today = L.dkey();
    var due = L.dueHabitsOn(state, today);
    var doneH = due.filter(function (h) { return L.isDone(h, today); }).length;
    var openTasks = state.tasks.filter(function (t) {
      return !t.done && (!t.due || t.due <= today);
    }).length;
    var doneTasks = state.tasks.filter(function (t) { return t.done && t.doneAt === today; }).length;

    $('statStreak').textContent = L.globalStreak(state);
    $('statToday').textContent = (doneH + doneTasks) + '/' + (due.length + openTasks + doneTasks);
    $('statDone').textContent = L.totalCompleted(state);
  }

  function moodHint(tier, mood) {
    var today = L.dkey();
    var lateCount = state.tasks.filter(function (t) { return t.due && t.due < today && !t.done; }).length;
    if (lateCount > 0 && mood < 62) {
      return lateCount === 1 ? '1 tâche en retard lui pèse.' : lateCount + ' tâches en retard lui pèsent.';
    }
    var pending = L.dueHabitsOn(state, today).filter(function (h) { return !L.isDone(h, today); }).length;
    if (pending > 0 && mood < 78) {
      return pending === 1 ? 'Il reste 1 habitude à cocher.' : 'Il reste ' + pending + ' habitudes à cocher.';
    }
    return tier.hint;
  }

  /* =======================================================
     Rendu — éléments de liste
     ======================================================= */
  function checkButton(isOn, label, handler) {
    var b = elem('button', 'check' + (isOn ? ' is-on' : ''));
    b.type = 'button';
    b.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    b.setAttribute('aria-label', label);
    on(b, 'click', handler);
    return b;
  }

  function badge(text, tone) {
    return elem('span', 'badge' + (tone ? ' ' + tone : ''), text);
  }

  function daysLabel(days) {
    if (!days || days.length === 7) return 'tous les jours';
    if (days.length === 5 && [1, 2, 3, 4, 5].every(function (d) { return days.indexOf(d) !== -1; })) return 'en semaine';
    if (days.length === 2 && days.indexOf(0) !== -1 && days.indexOf(6) !== -1) return 'le week-end';
    return days.slice().sort().map(function (d) { return L.DAY_SHORT[d]; }).join(' ');
  }

  function habitItem(habit, dateKey, opts) {
    opts = opts || {};
    var done = L.isDone(habit, dateKey);
    var li = elem('li', 'item' + (done ? ' is-done' : ''));

    li.appendChild(checkButton(done, (done ? 'Décocher ' : 'Cocher ') + habit.title, function () {
      toggleHabit(habit.id, dateKey);
    }));

    if (habit.icon) li.appendChild(elem('span', 'item-emoji', habit.icon));

    var body = elem('div', 'item-body');
    body.appendChild(elem('span', 'item-title', habit.title));
    var meta = elem('div', 'item-meta');
    var streak = L.streakOf(habit, dateKey);
    if (streak > 0) meta.appendChild(badge('🔥 ' + streak + ' j', 'streak'));
    if (opts.showDays) meta.appendChild(badge(daysLabel(habit.days)));
    if (meta.childNodes.length) body.appendChild(meta);
    li.appendChild(body);

    if (opts.deletable) {
      var del = elem('button', 'item-del', '✕');
      del.type = 'button';
      del.title = 'Supprimer';
      del.setAttribute('aria-label', 'Supprimer l’habitude ' + habit.title);
      on(del, 'click', function () { removeHabit(habit.id, habit.title); });
      li.appendChild(del);
    }
    return li;
  }

  function taskItem(task) {
    var today = L.dkey();
    var late = task.due && task.due < today && !task.done;
    var li = elem('li', 'item' + (task.done ? ' is-done' : '') + (late ? ' is-late' : ''));

    li.appendChild(checkButton(task.done, (task.done ? 'Rouvrir ' : 'Terminer ') + task.title, function () {
      toggleTask(task.id);
    }));

    var body = elem('div', 'item-body');
    body.appendChild(elem('span', 'item-title', task.title));
    var meta = elem('div', 'item-meta');
    var rel = L.relativeDue(task.due, today);
    if (rel && !task.done) meta.appendChild(badge(rel.text, rel.tone));
    if (task.priority === 3 && !task.done) meta.appendChild(badge('Priorité haute', 'hot'));
    if (task.done && task.doneAt) meta.appendChild(badge('fait ' + (task.doneAt === today ? "aujourd'hui" : 'le ' + task.doneAt.slice(8) + '/' + task.doneAt.slice(5, 7))));
    if (meta.childNodes.length) body.appendChild(meta);
    li.appendChild(body);

    var del = elem('button', 'item-del', '✕');
    del.type = 'button';
    del.title = 'Supprimer';
    del.setAttribute('aria-label', 'Supprimer la tâche ' + task.title);
    on(del, 'click', function () { removeTask(task.id); });
    li.appendChild(del);
    return li;
  }

  /* =======================================================
     Rendu — onglet Aujourd'hui
     ======================================================= */
  function renderToday() {
    var today = L.dkey();
    $('todayDate').textContent = L.prettyDate(today);

    var hostH = $('todayHabits');
    hostH.textContent = '';
    // Ordre volontairement stable : une habitude cochée ne doit pas sauter
    // sous le doigt, sinon un second appui en coche une autre par erreur.
    var due = L.dueHabitsOn(state, today);
    due.forEach(function (h) { hostH.appendChild(habitItem(h, today, {})); });
    $('todayHabitsEmpty').hidden = due.length > 0;

    var hostT = $('todayTasks');
    hostT.textContent = '';
    var list = state.tasks.filter(function (t) {
      if (t.done) return t.doneAt === today;
      return !t.due || t.due <= today;
    }).sort(taskSort);
    list.forEach(function (t) { hostT.appendChild(taskItem(t)); });
    $('todayTasksEmpty').hidden = list.length > 0;

    var pending = due.filter(function (h) { return !L.isDone(h, today); }).length +
                  list.filter(function (t) { return !t.done; }).length;
    var total = due.length + list.length;
    $('allDone').hidden = !(total > 0 && pending === 0);
  }

  function taskSort(a, b) {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return (b.doneAt || '').localeCompare(a.doneAt || '');
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
    if (a.due && !b.due) return -1;
    if (!a.due && b.due) return 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  }

  /* =======================================================
     Rendu — onglets Habitudes / Tâches
     ======================================================= */
  function renderHabits() {
    var today = L.dkey();
    var host = $('habitList');
    host.textContent = '';
    state.habits.forEach(function (h) {
      host.appendChild(habitItem(h, today, { showDays: true, deletable: true }));
    });
    $('habitEmpty').hidden = state.habits.length > 0;
  }

  function renderTasks() {
    var host = $('taskList');
    host.textContent = '';
    var list = state.tasks.filter(function (t) {
      if (taskFilter === 'open') return !t.done;
      if (taskFilter === 'done') return t.done;
      return true;
    }).sort(taskSort);
    list.forEach(function (t) { host.appendChild(taskItem(t)); });
    $('taskEmpty').hidden = list.length > 0;
    $('taskEmpty').textContent = taskFilter === 'done'
      ? 'Aucune tâche terminée pour l’instant.'
      : 'Aucune tâche ici. Profitez-en.';
  }

  /* =======================================================
     Rendu — onglet Progrès
     ======================================================= */
  function renderStats() {
    var mood = L.currentMood(state);
    $('kpiMood').textContent = Math.round(mood);
    $('kpiStreak').textContent = L.globalStreak(state) + ' j';
    $('kpiBest').textContent = L.bestStreak(state) + ' j';
    var rate = L.successRate(state, 7);
    $('kpiRate').textContent = rate === null ? '—' : rate + ' %';

    drawChart();
    drawGrid();
    $('statsEmpty').hidden = state.habits.length > 0;
  }

  function drawChart() {
    var svg = $('moodChart');
    if (!svg) return;
    // On cale le viewBox sur la largeur réellement occupée : sans cela, un
    // conteneur d'un autre rapport étirerait les points et les épaisseurs.
    var H = 180, pad = 12;
    var W = Math.max(240, Math.round(svg.clientWidth || svg.parentNode.clientWidth || 600));
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var series = L.moodSeries(state, 30);

    // On relie les jours connus ; les jours sans donnée gardent la dernière valeur.
    var last = null;
    var pts = series.map(function (p, i) {
      if (p.mood !== null && p.mood !== undefined) last = p.mood;
      var v = (last === null) ? null : last;
      return { x: pad + (i / (series.length - 1)) * (W - pad * 2), v: v };
    }).filter(function (p) { return p.v !== null; });

    var y = function (v) { return pad + (1 - v / 100) * (H - pad * 2); };
    var guides = [25, 50, 75].map(function (g) {
      return '<line x1="0" x2="' + W + '" y1="' + y(g).toFixed(1) + '" y2="' + y(g).toFixed(1) +
             '" stroke="currentColor" stroke-opacity=".12" stroke-width="1" vector-effect="non-scaling-stroke"/>';
    }).join('');

    if (pts.length === 0) {
      svg.innerHTML = guides;
      return;
    }

    var line = pts.map(function (p, i) {
      return (i ? 'L' : 'M') + p.x.toFixed(1) + ',' + y(p.v).toFixed(1);
    }).join(' ');
    var area = line + ' L' + pts[pts.length - 1].x.toFixed(1) + ',' + (H - pad) +
               ' L' + pts[0].x.toFixed(1) + ',' + (H - pad) + ' Z';
    var lastPt = pts[pts.length - 1];

    svg.innerHTML =
      '<defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="var(--accent)" stop-opacity=".38"/>' +
        '<stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      guides +
      '<path d="' + area + '" fill="url(#chartFill)"/>' +
      '<path d="' + line + '" fill="none" stroke="var(--accent)" stroke-width="3" ' +
        'stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      '<circle cx="' + lastPt.x.toFixed(1) + '" cy="' + y(lastPt.v).toFixed(1) + '" r="4" ' +
        'fill="var(--accent)" stroke="var(--surface)" stroke-width="2" vector-effect="non-scaling-stroke"/>';
  }

  function drawGrid() {
    var table = $('habitGrid');
    if (!table) return;
    table.textContent = '';
    if (!state.habits.length) return;

    var today = L.dkey();
    var days = [];
    for (var i = 6; i >= 0; i--) days.push(L.addDaysKey(today, -i));

    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    hr.appendChild(elem('th', null, 'Habitude'));
    days.forEach(function (k) {
      var th = elem('th', null, L.DAY_SHORT[L.dowOf(k)]);
      th.title = L.prettyDate(k);
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    state.habits.forEach(function (h) {
      var tr = document.createElement('tr');
      tr.appendChild(elem('td', null, (h.icon ? h.icon + ' ' : '') + h.title));
      days.forEach(function (k) {
        var td = document.createElement('td');
        var cls = 'cell na', label = 'non prévu';
        if (L.isDue(h, k)) {
          if (L.isDone(h, k)) { cls = 'cell on'; label = 'fait'; }
          else if (k === today) { cls = 'cell'; label = 'à faire'; }
          else { cls = 'cell off'; label = 'manqué'; }
        }
        var span = elem('span', cls);
        span.title = L.prettyDate(k) + ' — ' + label;
        td.appendChild(span);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  /* =======================================================
     Rendu global
     ======================================================= */
  function renderAll() {
    renderStage();
    renderToday();
    renderHabits();
    renderTasks();
    renderStats();
  }

  /* =======================================================
     Actions
     ======================================================= */
  function toggleHabit(id, dateKey) {
    mutate(function () {
      var h = state.habits.filter(function (x) { return x.id === id; })[0];
      if (!h) return;
      if (!h.history) h.history = {};
      if (h.history[dateKey]) delete h.history[dateKey];
      else h.history[dateKey] = true;
    });
  }

  function removeHabit(id, title) {
    if (!confirm('Supprimer « ' + title + ' » ? Son historique sera perdu.')) return;
    mutate(function () {
      state.habits = state.habits.filter(function (x) { return x.id !== id; });
    });
    toast('Habitude supprimée.');
  }

  function addHabit(title, icon, days) {
    mutate(function () {
      state.habits.push({
        id: L.uid(),
        title: title,
        icon: icon || '',
        days: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
        history: {},
        createdAt: L.dkey()
      });
    });
  }

  function toggleTask(id) {
    mutate(function () {
      var t = state.tasks.filter(function (x) { return x.id === id; })[0];
      if (!t) return;
      t.done = !t.done;
      t.doneAt = t.done ? L.dkey() : null;
    });
  }

  function removeTask(id) {
    mutate(function () {
      state.tasks = state.tasks.filter(function (x) { return x.id !== id; });
    });
  }

  function addTask(title, due, priority) {
    mutate(function () {
      state.tasks.push({
        id: L.uid(),
        title: title,
        due: due || null,
        priority: Number(priority) || 2,
        done: false,
        doneAt: null,
        createdAt: new Date().toISOString()
      });
    });
  }

  function petDuck() {
    Duck.pet();
    var today = L.dkey();
    if (!state.meta.pets || state.meta.pets.date !== today) state.meta.pets = { date: today, count: 0 };
    if (state.meta.pets.count >= L.RULES.petMax) {
      renderStage();
      return;                                  // les câlins ne remplacent pas les tâches
    }
    mutate(function () { state.meta.pets.count += 1; });
  }

  /* =======================================================
     Onglets
     ======================================================= */
  function showPanel(name) {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      var active = tabs[i].dataset.panel === name;
      tabs[i].classList.toggle('is-active', active);
      tabs[i].setAttribute('aria-selected', active ? 'true' : 'false');
    }
    var panels = document.querySelectorAll('.panel');
    for (var j = 0; j < panels.length; j++) {
      var isOn = panels[j].id === 'panel-' + name;
      panels[j].classList.toggle('is-active', isOn);
      panels[j].hidden = !isOn;
    }
  }

  /* =======================================================
     Thème et préférences
     ======================================================= */
  function applyPrefs() {
    document.documentElement.setAttribute('data-theme', state.settings.theme || 'auto');
    document.documentElement.setAttribute('data-motion', state.settings.reduceMotion ? 'reduced' : 'full');
    var segs = document.querySelectorAll('.seg-btn');
    for (var i = 0; i < segs.length; i++) {
      segs[i].classList.toggle('is-on', segs[i].dataset.theme === state.settings.theme);
    }
    var motion = $('setMotion');
    if (motion) motion.checked = !!state.settings.reduceMotion;
  }

  function cycleTheme() {
    var order = ['auto', 'light', 'dark'];
    var next = order[(order.indexOf(state.settings.theme || 'auto') + 1) % order.length];
    mutate(function () { state.settings.theme = next; });
    applyPrefs();
    toast('Thème : ' + ({ auto: 'automatique', light: 'clair', dark: 'sombre' })[next]);
  }

  function buildSwatches(host, onPick) {
    if (!host) return;
    host.textContent = '';
    COLORS.forEach(function (c) {
      var b = elem('button', 'swatch' + (state.duck.color === c.hex ? ' is-on' : ''));
      b.type = 'button';
      b.style.background = c.hex;
      b.title = c.name;
      b.setAttribute('aria-label', 'Couleur ' + c.name);
      on(b, 'click', function () { onPick(c.hex); });
      host.appendChild(b);
    });
  }

  function pickColor(hex, host) {
    mutate(function () { state.duck.color = hex; });
    buildSwatches(host, function (h2) { pickColor(h2, host); });
  }

  /* =======================================================
     Sauvegarde : export / import / réinitialisation
     ======================================================= */
  function refreshBackupInfo() {
    var info = $('backupInfo');
    if (!info) return;
    if (!Store.storageOk()) {
      info.textContent = "Ce navigateur bloque le stockage local : vos données ne survivront pas à la fermeture.";
      return;
    }
    var at = state.meta.savedAt ? new Date(state.meta.savedAt) : null;
    info.textContent = at
      ? 'Dernier enregistrement local : ' + at.toLocaleString('fr-FR')
      : 'Aucun enregistrement pour le moment.';
  }

  function doExport() {
    Store.flush();
    Store.download(state);
    toast('Sauvegarde téléchargée.');
  }

  function doCopy() {
    var text = Store.exportText(state);
    var done = function () { toast('Sauvegarde copiée dans le presse-papiers.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallbackCopy);
    } else {
      fallbackCopy();
    }
    function fallbackCopy() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { toast('Copie impossible. Utilisez l’export en fichier.'); }
      document.body.removeChild(ta);
    }
  }

  function doImport(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var incoming;
      try {
        incoming = Store.parseImport(String(reader.result));
      } catch (e) {
        toast('Fichier illisible : ce n’est pas une sauvegarde Canardo.');
        return;
      }
      if (!confirm('Remplacer les données actuelles par celles du fichier ? Cette action est définitive.')) return;
      state = incoming;
      L.rollForward(state);
      applyPrefs();
      persist();
      Store.flush();
      renderAll();
      refreshBackupInfo();
      toast('Sauvegarde restaurée.');
    };
    reader.onerror = function () { toast('Lecture du fichier impossible.'); };
    reader.readAsText(file);
  }

  function doReset() {
    if (!confirm('Tout effacer : canard, habitudes, tâches et historique ?')) return;
    if (!confirm('Dernière confirmation. Avez-vous exporté une sauvegarde ?')) return;
    Store.clear();
    state = Store.defaults();
    initFreshState();
    applyPrefs();
    persist();
    Store.flush();
    renderAll();
    var dlg = $('menuDialog');
    if (dlg && dlg.open) dlg.close();
    openWelcome();
  }

  /* =======================================================
     Première visite
     ======================================================= */
  function initFreshState() {
    var today = L.dkey();
    state.meta.createdAt = today;
    state.meta.lastProcessed = today;
    state.meta.pets = { date: today, count: 0 };
    state.duck.born = today;
    state.duck.moodBase = 60;
  }

  function openWelcome() {
    var dlg = $('welcomeDialog');
    if (!dlg) return;
    $('welcomeName').value = state.duck.name || 'Canardo';

    var host = $('welcomeColors');
    function pickWelcomeColor(hex) {
      state.duck.color = hex;
      buildSwatches(host, pickWelcomeColor);
      Duck.render(L.currentMood(state), state.duck.color);
    }
    buildSwatches(host, pickWelcomeColor);
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function finishWelcome() {
    var name = ($('welcomeName').value || '').trim().slice(0, 24);
    var seed = $('welcomeSeed').checked;
    mutate(function () {
      state.duck.name = name || 'Canardo';
      state.meta.onboarded = true;
      if (seed && state.habits.length === 0) {
        SEED_HABITS.forEach(function (h) {
          state.habits.push({
            id: L.uid(), title: h.title, icon: h.icon, days: h.days,
            history: {}, createdAt: L.dkey()
          });
        });
      }
    });
    var dlg = $('welcomeDialog');
    if (dlg && dlg.open) dlg.close();
    toast('Bienvenue ! Cochez une case pour voir ' + state.duck.name + ' réagir.');
  }

  /* =======================================================
     Changement de journée pendant que l'onglet est ouvert
     ======================================================= */
  function watchDayChange() {
    setInterval(function () {
      if (state.meta.lastProcessed !== L.dkey()) {
        var closed = L.rollForward(state);
        persist();
        renderAll();
        if (closed) toast('Nouvelle journée : le bilan d’hier a été enregistré.');
      }
    }, 30000);
  }

  /* =======================================================
     Câblage
     ======================================================= */
  function wire() {
    // onglets
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      on(tabs[i], 'click', function (e) { showPanel(e.currentTarget.dataset.panel); });
    }
    var gotos = document.querySelectorAll('[data-goto]');
    for (var g = 0; g < gotos.length; g++) {
      on(gotos[g], 'click', function (e) { showPanel(e.currentTarget.dataset.goto); });
    }

    // ajout rapide
    on($('quickForm'), 'submit', function (e) {
      e.preventDefault();
      var input = $('quickInput');
      var title = (input.value || '').trim();
      if (!title) return;
      addTask(title, L.dkey(), 2);
      input.value = '';
      input.focus();
    });

    // habitudes
    on($('habitForm'), 'submit', function (e) {
      e.preventDefault();
      var title = ($('habitTitle').value || '').trim();
      if (!title) return;
      var days = [];
      var boxes = document.querySelectorAll('.days .day');
      for (var k = 0; k < boxes.length; k++) if (boxes[k].checked) days.push(Number(boxes[k].value));
      if (!days.length) { toast('Choisissez au moins un jour.'); return; }
      addHabit(title, ($('habitIcon').value || '').trim(), days);
      $('habitTitle').value = '';
      $('habitIcon').value = '';
      $('habitTitle').focus();
      toast('Habitude créée.');
    });

    // tâches
    on($('taskForm'), 'submit', function (e) {
      e.preventDefault();
      var title = ($('taskTitle').value || '').trim();
      if (!title) return;
      addTask(title, $('taskDue').value || null, $('taskPriority').value);
      $('taskTitle').value = '';
      $('taskDue').value = '';
      $('taskPriority').value = '2';
      $('taskTitle').focus();
    });

    var filters = document.querySelectorAll('.filters .pill');
    for (var f = 0; f < filters.length; f++) {
      on(filters[f], 'click', function (e) {
        taskFilter = e.currentTarget.dataset.filter;
        var all = document.querySelectorAll('.filters .pill');
        for (var n = 0; n < all.length; n++) all[n].classList.toggle('is-active', all[n] === e.currentTarget);
        renderTasks();
      });
    }

    // caresse
    on($('petBtn'), 'click', petDuck);

    // thème
    on($('themeBtn'), 'click', cycleTheme);
    var segs = document.querySelectorAll('.seg-btn');
    for (var s = 0; s < segs.length; s++) {
      on(segs[s], 'click', function (e) {
        mutate(function () { state.settings.theme = e.currentTarget.dataset.theme; });
        applyPrefs();
      });
    }
    on($('setMotion'), 'change', function (e) {
      mutate(function () { state.settings.reduceMotion = e.currentTarget.checked; });
      applyPrefs();
    });

    // réglages
    on($('menuBtn'), 'click', function () {
      var dlg = $('menuDialog');
      $('setName').value = state.duck.name || '';
      buildSwatches($('colorRow'), function (hex) { pickColor(hex, $('colorRow')); });
      applyPrefs();
      refreshBackupInfo();
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    });
    on($('setName'), 'input', function (e) {
      var v = (e.currentTarget.value || '').trim().slice(0, 24);
      mutate(function () { state.duck.name = v || 'Canardo'; });
    });

    on($('exportBtn'), 'click', doExport);
    on($('copyBtn'), 'click', doCopy);
    on($('importBtn'), 'click', function () { $('importFile').click(); });
    on($('importFile'), 'change', function (e) {
      var file = e.currentTarget.files && e.currentTarget.files[0];
      if (file) doImport(file);
      e.currentTarget.value = '';
    });
    on($('resetBtn'), 'click', doReset);

    on($('welcomeGo'), 'click', finishWelcome);
    on($('welcomeDialog'), 'close', function () {
      // Fermeture par Échap : on valide quand même, sinon la fenêtre
      // reviendrait à chaque ouverture sans que rien soit enregistré.
      if (!state.meta.onboarded) {
        mutate(function () { state.meta.onboarded = true; });
      }
    });

    var resizeTimer = null;
    global.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(drawChart, 150);
    });

    // sauvegarde garantie avant de quitter
    global.addEventListener('beforeunload', function () { Store.flush(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') Store.flush();
    });
  }

  /* =======================================================
     Démarrage
     ======================================================= */
  function init() {
    wireSaveIndicator();

    var loaded = Store.load();
    state = loaded.state;

    if (loaded.fresh || !state.meta.createdAt) initFreshState();

    var closed = L.rollForward(state);

    Duck.mount();
    applyPrefs();
    wire();
    showPanel('today');
    persist();
    renderAll();
    watchDayChange();

    if (loaded.warning === 'recovered') {
      toast('Données restaurées depuis la sauvegarde de secours.');
    } else if (loaded.warning === 'no-storage') {
      toast('Stockage local indisponible : exportez vos données avant de fermer.');
    } else if (closed > 0) {
      var t = L.tierFor(L.currentMood(state));
      toast(closed === 1
        ? 'Bilan d’hier enregistré. ' + (state.duck.name || 'Votre canard') + ' est ' + t.label.toLowerCase() + '.'
        : closed + ' journées ont été clôturées pendant votre absence.');
    }

    if (!state.meta.onboarded) openWelcome();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
