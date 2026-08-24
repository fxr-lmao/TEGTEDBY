/* =========================================================
   Canardo — rendu du canard
   Style « autocollant » : aplats de couleur, contours noirs
   épais, gros oeil, corps d'une seule pièce.

   Traduit une humeur continue (0-100) en expression :
   paupière, sourcils, bec, posture, teinte du plumage.
   Rien n'est « par palier » : tout est interpolé, le canard
   change donc à vue d'oeil.
   ========================================================= */
(function (global) {
  'use strict';

  var el = {};
  var mounted = false;
  var lastMood = null;

  /* Repères géométriques du tracé (voir index.html). */
  var EYE_CY   = 196;   // centre du grand oeil
  var EYE_CLIP = 43;    // rayon de la zone blanche
  var LID_R    = 60;    // rayon du disque servant de paupière
  var LID_SPAN = 52;    // course de la paupière : elle s'arrête au milieu
                        // de l'oeil. Descendre plus bas masquerait la
                        // pupille et ne laisserait qu'un croissant blanc,
                        // qui se lit comme un oeil révulsé, pas comme un
                        // oeil fatigué.

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
    el.svg = $('duck');
    if (!el.svg) return false;
    el.tilt      = $('tilt');
    el.beak      = $('beak');
    el.beakLower = $('beakLower');
    el.lid       = $('lid');
    el.pupil     = $('pupil');
    el.farGlint  = $('farGlint');
    el.eyeBig    = $('eyeBig');
    el.farEye    = $('farEye');
    el.farEyeBall= $('farEyeBall');
    el.eyesHappy = $('eyesHappy');
    el.browNear  = $('browNear');
    el.browFar   = $('browFar');
    el.blush     = $('blush');
    el.tears     = $('tears');
    el.sparks    = $('sparks');
    el.rain      = $('rain');
    el.aura      = $('aura');
    el.hearts    = $('hearts');
    mounted = true;
    return true;
  }

  /* ---------------- rendu ---------------- */
  function render(mood, color) {
    if (!mounted && !mount()) return;

    var m = Math.max(0, Math.min(100, Number(mood) || 0));
    var h = m / 100;
    lastMood = m;

    /* --- plumage : aplat unique, qui se ternit quand ça va mal --- */
    var hsl = hexToHsl(color || '#FFC93C');
    var s = hsl.s * lerp(0.13, 1, h);
    var l = hsl.l * lerp(0.9, 1, h);
    el.svg.style.setProperty('--duck-base', hslCss(hsl.h, s, l));

    // Le bec se ternit aussi, mais deux fois moins : il reste le point
    // de couleur du dessin, sans jurer avec un corps délavé.
    var bs = lerp(0.45, 1, h);
    el.svg.style.setProperty('--beak',      hslCss(33, 100 * bs, lerp(64, 55, h)));
    el.svg.style.setProperty('--beak-dark', hslCss(28, 94 * bs,  lerp(58, 50, h)));
    el.svg.style.setProperty('--beak-line', hslCss(26, 88 * bs,  lerp(46, 38, h)));

    /* --- paupière : le disque descend sur le blanc de l'oeil.
           La plage dépasse 1 volontairement puis est bornée : dès une
           humeur correcte l'oeil est franchement ouvert, sinon la
           paupière et le sourcil forment deux arcs noirs qui donnent
           un air fâché au lieu d'un air neutre. --- */
    var open = clamp01(lerp(0.18, 1.3, h));
    var lidTop = EYE_CY - EYE_CLIP - LID_R;          // entièrement relevée
    el.lid.setAttribute('cy', (lidTop + (1 - open) * LID_SPAN).toFixed(1));

    /* --- pupille : dilatée de bonheur, et le regard tombe quand ça va mal --- */
    el.pupil.setAttribute('r', lerp(23, 30, h).toFixed(2));
    el.pupil.setAttribute('cy', lerp(207, 201, h).toFixed(1));

    /* --- oeil éloigné : il se ferme au même rythme. Le reflet suit
           la paupière, sinon il reste suspendu sur le corps. --- */
    var farRy = lerp(9, 28, h);
    el.farEyeBall.setAttribute('ry', farRy.toFixed(1));
    el.farGlint.setAttribute('cy', (190 - farRy * 0.42).toFixed(1));
    el.farGlint.setAttribute('r', lerp(2.6, 6, h).toFixed(1));

    /* --- yeux « ^ ^ » au sommet de la joie --- */
    var joy = m >= 93 ? 1 : 0;
    el.eyesHappy.setAttribute('opacity', joy);
    el.eyeBig.setAttribute('opacity', 1 - joy);
    el.farEye.setAttribute('opacity', 1 - joy);

    /* --- sourcils : bouts tournés vers le bec relevés = tristesse.
           On reste toujours >= 0 : des bouts intérieurs abaissés
           donneraient un air fâché, pas joyeux. --- */
    var brow = lerp(17, 2, h);
    var browY = lerp(5, -7, h);
    el.browNear.style.transform = 'translateY(' + browY.toFixed(1) + 'px) rotate(' + (-brow).toFixed(1) + 'deg)';
    el.browFar.style.transform  = 'translateY(' + browY.toFixed(1) + 'px) rotate(' + (-brow * 0.8).toFixed(1) + 'deg)';

    /* --- posture : il s'affaisse vers l'avant, ou se redresse --- */
    el.tilt.style.transform = 'rotate(' + lerp(7, -5, h).toFixed(1) + 'deg)';

    /* --- bec : pointe relevée = sourire, abaissée = moue --- */
    var smile = h * 2 - 1;                       // -1 → 1
    el.beak.style.transform = 'rotate(' + (-smile * 12).toFixed(1) + 'deg)';

    // Il cancane de joie : la mandibule inférieure descend et découvre
    // l'intérieur du bec, qui a exactement la même forme.
    // 20 px et non 11 : les deux traits noirs de 9 px se rejoignent
    // sinon presque, et il ne reste qu'un filet rouge illisible.
    var openBeak = clamp01((m - 72) / 28) * 20;
    el.beakLower.style.transform = 'translateY(' + openBeak.toFixed(1) + 'px)';

    /* --- accessoires d'humeur --- */
    el.blush.setAttribute('opacity', (clamp01((m - 52) / 48) * 0.9).toFixed(2));
    el.tears.setAttribute('opacity', clamp01((28 - m) / 28).toFixed(2));
    el.sparks.setAttribute('opacity', clamp01((m - 84) / 16).toFixed(2));
    el.rain.setAttribute('opacity', clamp01((17 - m) / 17).toFixed(2));
    el.aura.setAttribute('opacity', (clamp01((m - 70) / 30) * 0.75).toFixed(2));

    /* --- rythme : il s'anime d'autant plus qu'il est heureux --- */
    el.svg.style.setProperty('--bob', lerp(4.8, 2.1, h).toFixed(2) + 's');
  }

  /* ---------------- caresse ---------------- */
  var HEART = 'M0,0 c0,-6.5 -9.5,-9.5 -9.5,-2 c0,5.2 5.2,8.4 9.5,13.4 ' +
              'c4.3,-5 9.5,-8.2 9.5,-13.4 c0,-7.5 -9.5,-4.5 -9.5,2 Z';

  function pet() {
    if (!mounted && !mount()) return;

    el.svg.classList.add('is-petted');
    setTimeout(function () { el.svg.classList.remove('is-petted'); }, 520);

    for (var i = 0; i < 3; i++) {
      (function (idx) {
        setTimeout(function () {
          if (!el.hearts) return;
          var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          var x = 170 + Math.random() * 110;
          var y = 150 + Math.random() * 50;
          var scale = 0.9 + Math.random() * 0.8;
          p.setAttribute('d', HEART);
          p.setAttribute('class', 'heart');
          p.setAttribute('fill', 'var(--blush)');
          p.setAttribute('stroke', 'var(--ink-line)');
          p.setAttribute('stroke-width', '3');
          p.setAttribute('stroke-linejoin', 'round');
          p.setAttribute('transform', 'translate(' + x.toFixed(0) + ',' + y.toFixed(0) + ') scale(' + scale.toFixed(2) + ')');
          el.hearts.appendChild(p);
          setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 1450);
        }, idx * 130);
      })(i);
    }
  }

  global.Duck = { mount: mount, render: render, pet: pet, moodShown: function () { return lastMood; } };
})(window);
