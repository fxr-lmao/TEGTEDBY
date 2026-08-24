/* =========================================================
   Canardo — rendu du canard
   Traduit une humeur continue (0-100) en expression :
   paupières, sourcils, bec, rougeurs, larmes, couleur,
   rythme de flottaison. Rien n'est « par palier » : tout
   est interpolé, le canard change donc à vue d'oeil.
   ========================================================= */
(function (global) {
  'use strict';

  var el = {};
  var mounted = false;
  var lastMood = null;

  function $(id) { return document.getElementById(id); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  /* ---------------- couleurs ---------------- */
  function hexToHsl(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
    if (!m) return { h: 45, s: 100, l: 62 };
    var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2, d = max - min;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = ((b - r) / d + 2);
      else                h = ((r - g) / d + 4);
      h *= 60;
    }
    return { h: h, s: s * 100, l: l * 100 };
  }

  function hslCss(h, s, l) {
    return 'hsl(' + Math.round(h) + ' ' + Math.round(Math.max(0, Math.min(100, s))) + '% ' +
           Math.round(Math.max(0, Math.min(100, l))) + '%)';
  }

  /* ---------------- montage ---------------- */
  function mount() {
    el.svg        = $('duck');
    if (!el.svg) return false;
    el.headGroup  = $('headGroup');
    el.beak       = $('beak');
    el.beakLower  = $('beakLower');
    el.mouth      = $('mouth');
    el.lidL       = $('lidL');
    el.lidR       = $('lidR');
    el.pupilL     = $('pupilL');
    el.pupilR     = $('pupilR');
    el.eyeL       = $('eyeL');
    el.eyeR       = $('eyeR');
    el.eyesHappy  = $('eyesHappy');
    el.browL      = $('browL');
    el.browR      = $('browR');
    el.blush      = $('blush');
    el.tears      = $('tears');
    el.sparks     = $('sparks');
    el.rain       = $('rain');
    el.aura       = $('aura');
    el.float      = $('float');
    el.hearts     = $('hearts');
    mounted = true;
    return true;
  }

  /* ---------------- rendu ---------------- */
  function render(mood, color) {
    if (!mounted && !mount()) return;

    var m = Math.max(0, Math.min(100, Number(mood) || 0));
    var h = m / 100;
    lastMood = m;

    /* --- couleur : plus l'humeur baisse, plus le plumage se ternit --- */
    var hsl = hexToHsl(color || '#FFC93C');
    var satFactor = lerp(0.30, 1, h);
    var s = hsl.s * satFactor;
    var l = hsl.l * lerp(0.86, 1, h);
    el.svg.style.setProperty('--duck-base',  hslCss(hsl.h, s, l));
    el.svg.style.setProperty('--duck-light', hslCss(hsl.h, s * 0.9, l + 14));
    el.svg.style.setProperty('--duck-dark',  hslCss(hsl.h, Math.min(100, s * 1.05), l - 16));

    /* --- paupières : tombantes quand ça va mal --- */
    var open = lerp(0.42, 1, h);
    el.lidL.setAttribute('cy', (106 + (1 - open) * 32).toFixed(1));
    el.lidR.setAttribute('cy', (114 + (1 - open) * 30).toFixed(1));

    /* --- pupilles : dilatées de bonheur --- */
    el.pupilL.setAttribute('r', lerp(6.8, 8.6, h).toFixed(2));
    el.pupilR.setAttribute('r', lerp(5.8, 7.3, h).toFixed(2));

    /* --- yeux « ^ ^ » au sommet de la joie --- */
    var joy = m >= 93 ? 1 : 0;
    el.eyesHappy.setAttribute('opacity', joy);
    el.eyeL.setAttribute('opacity', 1 - joy);
    el.eyeR.setAttribute('opacity', 1 - joy);

    /* --- sourcils : bouts intérieurs relevés = tristesse.
           On reste toujours >= 0 : des bouts intérieurs abaissés
           donneraient un air fâché, pas joyeux. --- */
    var brow = lerp(16, 2, h);
    var browY = lerp(4, -6, h);
    el.browL.style.transform = 'translateY(' + browY.toFixed(1) + 'px) rotate(' + (-brow).toFixed(1) + 'deg)';
    el.browR.style.transform = 'translateY(' + browY.toFixed(1) + 'px) rotate(' + brow.toFixed(1) + 'deg)';

    /* --- tête : elle s'affaisse vers l'avant quand le moral tombe --- */
    el.headGroup.style.transform = 'rotate(' + lerp(7, -4, h).toFixed(1) + 'deg)';

    /* --- bec : pointe relevée = sourire, abaissée = moue --- */
    var smile = h * 2 - 1;                       // -1 → 1
    el.beak.style.transform = 'rotate(' + (-smile * 11).toFixed(1) + 'deg)';
    // Il cancane de joie : la mandibule inférieure descend et découvre
    // l'intérieur du bec, qui a exactement la même forme.
    var openBeak = clamp01((m - 72) / 28) * 9;
    el.beakLower.style.transform = 'translateY(' + openBeak.toFixed(1) + 'px)';

    /* --- accessoires d'humeur --- */
    el.blush.setAttribute('opacity', (clamp01((m - 52) / 48) * 0.85).toFixed(2));
    el.tears.setAttribute('opacity', clamp01((28 - m) / 28).toFixed(2));
    el.sparks.setAttribute('opacity', clamp01((m - 84) / 16).toFixed(2));
    el.rain.setAttribute('opacity', clamp01((17 - m) / 17).toFixed(2));
    el.aura.setAttribute('opacity', (clamp01((m - 70) / 30) * 0.8).toFixed(2));

    /* --- rythme : il s'anime d'autant plus qu'il est heureux --- */
    el.svg.style.setProperty('--bob', lerp(4.8, 2.1, h).toFixed(2) + 's');
    el.svg.style.setProperty('--flap', lerp(7, 2.2, h).toFixed(2) + 's');
  }

  /* ---------------- caresse ---------------- */
  var HEART = 'M0,0 c0,-6.5 -9.5,-9.5 -9.5,-2 c0,5.2 5.2,8.4 9.5,13.4 ' +
              'c4.3,-5 9.5,-8.2 9.5,-13.4 c0,-7.5 -9.5,-4.5 -9.5,2 Z';

  function pet() {
    if (!mounted && !mount()) return;

    el.svg.classList.add('is-petted');
    setTimeout(function () { el.svg.classList.remove('is-petted'); }, 520);

    var count = 3;
    for (var i = 0; i < count; i++) {
      (function (idx) {
        setTimeout(function () {
          if (!el.hearts) return;
          var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          var x = 170 + Math.random() * 110;
          var y = 150 + Math.random() * 50;
          var scale = 0.8 + Math.random() * 0.7;
          p.setAttribute('d', HEART);
          p.setAttribute('class', 'heart');
          p.setAttribute('fill', 'var(--blush)');
          p.setAttribute('transform', 'translate(' + x.toFixed(0) + ',' + y.toFixed(0) + ') scale(' + scale.toFixed(2) + ')');
          el.hearts.appendChild(p);
          setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 1450);
        }, idx * 130);
      })(i);
    }
  }

  global.Duck = { mount: mount, render: render, pet: pet, moodShown: function () { return lastMood; } };
})(window);
