/* =========================================================
   Canardo — règles métier
   Humeur, habitudes, tâches, séries, statistiques.

   Modèle : duck.moodBase est l'humeur figée au début de la
   journée courante. L'humeur affichée est recalculée à la
   volée (moodBase + gains du jour + retards en cours), ce qui
   rend chaque case cochée/décochée parfaitement réversible.
   ========================================================= */
(function (global) {
  'use strict';

  /* ---------------- dates ---------------- */
  function dkey(d) {
    var x = d ? new Date(d) : new Date();
    return x.getFullYear() + '-' +
      String(x.getMonth() + 1).padStart(2, '0') + '-' +
      String(x.getDate()).padStart(2, '0');
  }
  function keyToDate(k) {
    var p = String(k).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0); // midi : insensible au changement d'heure
  }
  function addDaysKey(k, n) {
    var d = keyToDate(k);
    d.setDate(d.getDate() + n);
    return dkey(d);
  }
  function dowOf(k) { return keyToDate(k).getDay(); }   // 0 = dimanche

  var DAY_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var DAY_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  function prettyDate(k) {
    var d = keyToDate(k);
    return DAY_LONG[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }
  function relativeDue(k, today) {
    if (!k) return null;
    if (k === today) return { text: "aujourd'hui", tone: 'warm' };
    if (k === addDaysKey(today, 1)) return { text: 'demain', tone: '' };
    if (k === addDaysKey(today, -1)) return { text: 'hier', tone: 'hot' };
    if (k < today) {
      var days = Math.round((keyToDate(today) - keyToDate(k)) / 86400000);
      return { text: 'en retard de ' + days + ' j', tone: 'hot' };
    }
    var d = keyToDate(k);
    return { text: 'le ' + d.getDate() + ' ' + MONTHS[d.getMonth()], tone: '' };
  }

  /* ---------------- barème ---------------- */
  var RULES = {
    habitDone:     7,    // habitude cochée
    habitBonusMax: 3,    // bonus de série (+1 tous les 3 jours, plafonné)
    habitMissed:  -9,    // habitude due non faite, à la clôture du jour
    taskDone:      { 1: 4, 2: 6, 3: 9 },
    taskLate:     -5,    // par tâche en retard, à la clôture
    taskLateCap: -20,
    liveDrag:     -3,    // aperçu en cours de journée, par tâche en retard
    liveDragCap: -12,
    petGain:       1,
    petMax:        3,    // par jour
    idlePull:      0.10  // journée vide : glissement de 10 % vers 50
  };

  var PRIORITY_LABEL = { 1: 'Basse', 2: 'Normale', 3: 'Haute' };

  var TIERS = [
    { min: 92, key: 'radieux', label: 'Radieux', emoji: '🤩', hint: 'Il rayonne. Vous le rendez très fier.' },
    { min: 78, key: 'joyeux',  label: 'Joyeux',  emoji: '😄', hint: "Il bat des ailes de bonheur." },
    { min: 62, key: 'content', label: 'Content', emoji: '🙂', hint: 'Il flotte tranquillement, satisfait.' },
    { min: 45, key: 'neutre',  label: 'Neutre',  emoji: '😐', hint: 'Il attend de voir votre journée.' },
    { min: 30, key: 'morose',  label: 'Morose',  emoji: '🫤', hint: "Il s'ennuie un peu…" },
    { min: 15, key: 'triste',  label: 'Triste',  emoji: '😢', hint: "Il aurait besoin d'attention." },
    { min: -1, key: 'abattu',  label: 'Abattu',  emoji: '😭', hint: 'Une seule petite tâche le réconforterait.' }
  ];

  function tierFor(mood) {
    for (var i = 0; i < TIERS.length; i++) if (mood >= TIERS[i].min) return TIERS[i];
    return TIERS[TIERS.length - 1];
  }

  function clamp(v, lo, hi) {
    lo = (lo === undefined) ? 0 : lo;
    hi = (hi === undefined) ? 100 : hi;
    return Math.max(lo, Math.min(hi, v));
  }

  /* ---------------- habitudes ---------------- */
  function isDue(habit, k) {
    if (!habit || habit.archived) return false;
    if (habit.createdAt && k < habit.createdAt) return false;   // pas due avant sa création
    var days = Array.isArray(habit.days) && habit.days.length ? habit.days : [0, 1, 2, 3, 4, 5, 6];
    return days.indexOf(dowOf(k)) !== -1;
  }
  function isDone(habit, k) { return !!(habit.history && habit.history[k]); }

  /** Série d'une habitude à une date donnée (jours dus consécutifs cochés). */
  function streakAt(habit, k) {
    var n = 0, cursor = k, guard = 0;
    while (guard++ < 400) {
      if (isDue(habit, cursor)) {
        if (isDone(habit, cursor)) n++;
        else break;
      }
      if (habit.createdAt && cursor < habit.createdAt) break;
      cursor = addDaysKey(cursor, -1);
    }
    return n;
  }
  /** Série affichée : le jour en cours ne casse rien tant qu'il n'est pas fini. */
  function streakOf(habit, today) {
    if (isDue(habit, today) && !isDone(habit, today)) return streakAt(habit, addDaysKey(today, -1));
    return streakAt(habit, today);
  }
  function streakBonus(streak) {
    if (streak <= 1) return 0;
    return Math.min(RULES.habitBonusMax, Math.floor((streak - 1) / 3));
  }

  /* ---------------- gains d'une journée ---------------- */
  function petsOn(state, k) {
    var p = state.meta && state.meta.pets;
    if (!p || p.date !== k) return 0;
    return Math.min(RULES.petMax, p.count || 0);
  }

  function gainFor(state, k) {
    var g = 0, i;
    for (i = 0; i < state.habits.length; i++) {
      var h = state.habits[i];
      if (isDue(h, k) && isDone(h, k)) {
        g += RULES.habitDone + streakBonus(streakAt(h, k));
      }
    }
    for (i = 0; i < state.tasks.length; i++) {
      var t = state.tasks[i];
      if (t.done && t.doneAt === k) {
        g += RULES.taskDone[t.priority] || RULES.taskDone[2];
      }
    }
    g += petsOn(state, k) * RULES.petGain;
    return g;
  }

  /** Tâches en retard à la date k (échéance dépassée, pas encore faites à ce moment-là). */
  function lateTasksAt(state, k) {
    var out = [];
    for (var i = 0; i < state.tasks.length; i++) {
      var t = state.tasks[i];
      if (!t.due || t.due > k) continue;
      if (!t.done || t.doneAt > k) out.push(t);
    }
    return out;
  }

  /** Pénalité visible en cours de journée (non enregistrée). */
  function liveDrag(state, today) {
    var late = 0;
    for (var i = 0; i < state.tasks.length; i++) {
      var t = state.tasks[i];
      if (t.due && t.due < today && !t.done) late++;
    }
    return Math.max(RULES.liveDragCap, late * RULES.liveDrag);
  }

  function dueHabitsOn(state, k) {
    return state.habits.filter(function (h) { return isDue(h, k); });
  }

  /* ---------------- clôture d'une journée ---------------- */
  function closeDay(state, k) {
    var base = state.duck.moodBase;
    var gain = gainFor(state, k);
    var penalty = 0;

    var due = dueHabitsOn(state, k);
    for (var i = 0; i < due.length; i++) {
      if (!isDone(due[i], k)) penalty += RULES.habitMissed;
    }
    var late = lateTasksAt(state, k);
    penalty += Math.max(RULES.taskLateCap, late.length * RULES.taskLate);

    if (gain === 0 && penalty === 0) {
      // Journée sans enjeu : l'humeur glisse doucement vers la neutralité.
      return clamp(base + (50 - base) * RULES.idlePull);
    }
    return clamp(base + gain + penalty);
  }

  function doneCountOn(state, k) {
    var n = 0, i;
    for (i = 0; i < state.habits.length; i++) if (isDue(state.habits[i], k) && isDone(state.habits[i], k)) n++;
    for (i = 0; i < state.tasks.length; i++) if (state.tasks[i].done && state.tasks[i].doneAt === k) n++;
    return n;
  }
  function dueCountOn(state, k) {
    var n = dueHabitsOn(state, k).length;
    for (var i = 0; i < state.tasks.length; i++) {
      var t = state.tasks[i];
      if (t.due && t.due <= k && (!t.done || t.doneAt >= k)) n++;
    }
    return n;
  }

  /**
   * Clôture toutes les journées écoulées depuis la dernière ouverture.
   * Renvoie le nombre de jours traités.
   */
  function rollForward(state) {
    var today = dkey();
    var last = state.meta.lastProcessed;
    if (!last) { state.meta.lastProcessed = today; return 0; }
    if (last >= today) { state.meta.lastProcessed = today; return 0; }

    var cursor = last, closed = 0, guard = 0;
    while (cursor < today && guard++ < 400) {
      state.duck.moodBase = closeDay(state, cursor);
      state.log[cursor] = {
        mood: Math.round(state.duck.moodBase),
        done: doneCountOn(state, cursor),
        due: dueCountOn(state, cursor)
      };
      cursor = addDaysKey(cursor, 1);
      closed++;
    }
    state.meta.lastProcessed = today;

    // les caresses ne se reportent pas d'un jour à l'autre
    if (state.meta.pets && state.meta.pets.date !== today) state.meta.pets = { date: today, count: 0 };
    return closed;
  }

  /* ---------------- humeur courante ---------------- */
  function currentMood(state) {
    var today = dkey();
    return clamp(state.duck.moodBase + gainFor(state, today) + liveDrag(state, today));
  }

  /** Enregistre l'humeur du jour dans le journal (pour le graphique). */
  function touchLog(state) {
    var today = dkey();
    state.log[today] = {
      mood: Math.round(currentMood(state)),
      done: doneCountOn(state, today),
      due: dueCountOn(state, today)
    };
  }

  /* ---------------- séries et taux ---------------- */
  function dayVerdict(state, k) {
    var due = dueHabitsOn(state, k);
    var allDone = due.length > 0 && due.every(function (h) { return isDone(h, k); });
    var tasksDone = state.tasks.filter(function (t) { return t.done && t.doneAt === k; }).length;
    var lateCount = lateTasksAt(state, k).length;

    if (due.length === 0 && tasksDone === 0) return 'neutral';
    if (allDone && lateCount === 0) return 'good';
    if (due.length === 0 && tasksDone > 0 && lateCount === 0) return 'good';
    return 'bad';
  }

  /** Nombre de bonnes journées consécutives. Le jour en cours ne pénalise pas. */
  function globalStreak(state) {
    var today = dkey();
    var cursor = (dayVerdict(state, today) === 'good') ? today : addDaysKey(today, -1);
    var n = 0, guard = 0;
    var floor = state.meta.createdAt || '1970-01-01';
    while (guard++ < 400 && cursor >= floor) {
      var v = dayVerdict(state, cursor);
      if (v === 'bad') break;
      if (v === 'good') n++;
      cursor = addDaysKey(cursor, -1);
    }
    return n;
  }

  function bestStreak(state) {
    var best = state.meta.bestStreak || 0;
    var now = globalStreak(state);
    return Math.max(best, now);
  }

  /** Taux de réussite des habitudes sur les N derniers jours. */
  function successRate(state, days) {
    var today = dkey(), total = 0, done = 0;
    for (var i = 0; i < (days || 7); i++) {
      var k = addDaysKey(today, -i);
      var due = dueHabitsOn(state, k);
      for (var j = 0; j < due.length; j++) {
        total++;
        if (isDone(due[j], k)) done++;
      }
    }
    if (!total) return null;
    return Math.round(done / total * 100);
  }

  function totalCompleted(state) {
    var n = 0, i, k;
    for (i = 0; i < state.habits.length; i++) {
      var hist = state.habits[i].history || {};
      for (k in hist) if (Object.prototype.hasOwnProperty.call(hist, k) && hist[k]) n++;
    }
    for (i = 0; i < state.tasks.length; i++) if (state.tasks[i].done) n++;
    return n;
  }

  function moodSeries(state, days) {
    var today = dkey(), out = [];
    for (var i = days - 1; i >= 0; i--) {
      var k = addDaysKey(today, -i);
      var entry = state.log[k];
      out.push({ key: k, mood: entry ? entry.mood : null });
    }
    return out;
  }

  /* ---------------- identifiants ---------------- */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  global.Logic = {
    dkey: dkey, keyToDate: keyToDate, addDaysKey: addDaysKey, dowOf: dowOf,
    prettyDate: prettyDate, relativeDue: relativeDue,
    DAY_SHORT: DAY_SHORT, DAY_LONG: DAY_LONG, PRIORITY_LABEL: PRIORITY_LABEL,
    RULES: RULES, TIERS: TIERS, tierFor: tierFor, clamp: clamp,
    isDue: isDue, isDone: isDone, streakOf: streakOf, streakAt: streakAt,
    dueHabitsOn: dueHabitsOn, lateTasksAt: lateTasksAt,
    gainFor: gainFor, closeDay: closeDay, rollForward: rollForward,
    currentMood: currentMood, touchLog: touchLog,
    dayVerdict: dayVerdict, globalStreak: globalStreak, bestStreak: bestStreak,
    successRate: successRate, totalCompleted: totalCompleted, moodSeries: moodSeries,
    doneCountOn: doneCountOn, dueCountOn: dueCountOn,
    uid: uid
  };
})(window);
