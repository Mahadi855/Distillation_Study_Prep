/* widgets-a.js: interactive teaching widgets, set A, for the Distillation Viva Kit.
   kd-flow, temperature-slider, kl-forward-reverse, kd-lanes, lora-rank, quantization,
   attention-heatmap, decoding-sampler, compression-map, memory-calc, thesis-journey.
   Vanilla ES2017, no dependencies. Each SVG is drawn in 1:1 px at the stage's real width (fit()),
   so labels stay legible from 320px phones to desktop. Colours come only from base.css tokens. */
(function () {
  'use strict';
  var D = KIT.dom, h = D.h, s = D.s, t = D.t, reg = KIT.widgets.register.bind(KIT.widgets);

  /* ---------- maths ---------- */
  function softmax(z, T) {
    T = T || 1;
    var m = -Infinity, i, e = [], sum = 0;
    for (i = 0; i < z.length; i++) m = Math.max(m, z[i] / T);
    for (i = 0; i < z.length; i++) { e.push(z[i] === -Infinity ? 0 : Math.exp(z[i] / T - m)); sum += e[i]; }
    return e.map(function (v) { return v / sum; });
  }
  function bits(p) { return p.reduce(function (a, v) { return v > 0 ? a - v * Math.log2(v) : a; }, 0); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pct(v) { var x = v * 100; return (x >= 1 ? x.toFixed(1) : x >= 0.01 ? x.toFixed(2) : '<0.01') + '%'; }
  function minus(str) { return String(str).replace(/^-/, '−'); }
  function pathOf(pts) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(''); }

  /* ---------- SVG text in two languages ---------- */
  function addCls(a, extra) { var o = Object.assign({}, a); o.class = ((a && a.class) || '') + ' ' + extra; return o; }
  /** One <text> with EN + BN tspans side by side; the language toggle hides one. */
  function stx(x, y, en, bn, a) {
    var el = s('text', Object.assign({ x: x, y: y }, a));
    el.appendChild(s('tspan', { class: 'l-en' }, en));
    if (bn) el.appendChild(s('tspan', { class: 'l-bn', dx: 5 }, bn));
    return el;
  }
  /** Two-line label: EN on top, BN 14px below (CSS lifts the BN line when only BN is shown). */
  function stx2(x, y, en, bn, a) {
    return s('g', null, [s('text', addCls(Object.assign({ x: x, y: y }, a), 'l-en'), en),
      s('text', addCls(Object.assign({ x: x, y: y + 14 }, a), 'l-bn wa-l2'), bn)]);
  }

  /* ---------- HTML helpers ---------- */
  /** Bilingual fragment, or plain text when the label is language-neutral (bn === null). */
  function tt(en, bn) { return bn === null ? document.createTextNode(en) : t(en, bn); }
  function btn(en, bn, fn, pressed) {
    var b = h('button', { type: 'button', class: 'w-btn', onclick: fn }, tt(en, bn));
    if (pressed !== undefined) b.setAttribute('aria-pressed', String(!!pressed));
    return b;
  }
  function row(els, extra) { return h('div', { class: 'wa-row ' + (extra || '') }, els); }
  function legend(items) {
    return h('div', { class: 'wa-legend' }, items.map(function (it) {
      return h('span', { class: 'wa-lg' }, [h('i', { class: 'wa-key ' + it[0], 'aria-hidden': 'true' }), t(it[1], it[2])]);
    }));
  }
  /** Readout chips: defs [[key, en, bn]] -> set(key, valueText). */
  function chips(readout, defs) {
    var map = {};
    defs.forEach(function (d) {
      var b = h('b');
      readout.appendChild(h('span', { class: 'w-chip' }, [tt(d[1], d[2]), ': ', b]));
      map[d[0]] = b;
    });
    return function (k, v) { if (map[k].textContent !== v) map[k].textContent = v; };
  }
  /** Segmented toggle: items [[value, en, bn]]. */
  function seg(items, val, onChange, label) {
    var el = h('div', { class: 'wa-seg', role: 'group', 'aria-label': label });
    var btns = items.map(function (it) {
      return el.appendChild(btn(it[1], it[2], function () { set(it[0]); onChange(it[0]); }, it[0] === val));
    });
    function set(v) { items.forEach(function (it, i) { btns[i].setAttribute('aria-pressed', String(it[0] === v)); }); }
    return { el: el, set: set, btns: btns };
  }
  var ICONS = { play: 'M4.5 2.5v11l9-5.5z', pause: 'M4 2.5h3v11H4zM9 2.5h3v11H9z', step: 'M3 2.5v11l7.5-5.5zM11.5 2.5h2v11h-2z', reset: 'M3.2 6.2A5.3 5.3 0 1 1 3 9.6M3 2.6v3.8h3.8' };
  function icon(n) {
    var line = n === 'reset';
    return s('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true', class: 'wa-ico' },
      s('path', { d: ICONS[n], fill: line ? 'none' : 'currentColor', stroke: line ? 'currentColor' : 'none', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }
  function ibtn(ic, en, bn, fn) { var b = btn(en, bn, fn); b.insertBefore(icon(ic), b.firstChild); b.classList.add('wa-ibtn'); return b; }
  /** Play/Pause + Step + Reset around KIT.dom.loop. o: {interval, step()->bool, frame(dt), reset(), onPlay(), onPause(), live}. */
  function player(o) {
    var acc = 0, playing = false;
    var bPlay = h('button', { type: 'button', class: 'w-btn wa-ibtn', onclick: function () { if (playing) pause(); else play(); } });
    var bStep = ibtn('step', 'Step', 'এক ধাপ', function () { pause(); o.step(); });
    var bReset = ibtn('reset', 'Reset', 'রিসেট', function () { pause(); o.reset(); });
    var lp = D.loop(function (dt) {
      if (o.frame) o.frame(dt);
      acc += dt;
      if (acc >= o.interval) { acc -= o.interval; if (o.step() === false) { pause(); return false; } }
    });
    function label() { bPlay.textContent = ''; bPlay.appendChild(icon(playing ? 'pause' : 'play')); bPlay.appendChild(playing ? t('Pause', 'থামাও') : t('Play', 'চালাও')); }
    function play() {
      if (o.onPlay) o.onPlay();
      playing = true; acc = o.interval; label();
      if (o.live) o.live.setAttribute('aria-live', 'off');
      if (!document.hidden) lp.start();
    }
    function pause() { playing = false; lp.stop(); label(); if (o.live) o.live.setAttribute('aria-live', 'polite'); if (o.onPause) o.onPause(); }
    function vis() { if (document.hidden) lp.stop(); else if (playing) lp.start(); }
    document.addEventListener('visibilitychange', vis);
    label();
    return { els: [bPlay, bStep, bReset], pause: pause, playing: function () { return playing; },
      destroy: function () { playing = false; lp.stop(); document.removeEventListener('visibilitychange', vis); } };
  }
  /** Calls render(widthPx) now and whenever the stage width changes. Returns a disconnect fn. */
  function fit(stage, render) {
    var last = 0, raf = 0;
    function measure() {
      raf = 0;
      var cw = Math.max(260, Math.round(stage.clientWidth) || 640);
      if (cw !== last) { last = cw; render(cw); }
    }
    measure();
    var ro = typeof ResizeObserver === 'function' ? new ResizeObserver(function () { if (!raf) raf = requestAnimationFrame(measure); }) : null;
    if (ro) ro.observe(stage);
    return function () { if (ro) ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }
  function svgEl(label) { return s('svg', { role: 'img', 'aria-label': label, viewBox: '0 0 640 200' }); }

  /* ===== 1. kd-flow: hard vs soft target, real gradient descent on KL ===== */
  (function () {
    var CLS = [['cat', 'বিড়াল'], ['dog', 'কুকুর'], ['fox', 'শিয়াল'], ['car', 'গাড়ি'], ['truck', 'ট্রাক']];
    var TEACH = [0.70, 0.18, 0.09, 0.02, 0.01], HARD = [1, 0, 0, 0, 0], Z0 = [0.2, 0, 0.6, 0.3, 0.1], LR = 0.5, MAX = 400;
    function catIcon(x, y) {
      return s('g', { class: 'wa-cat', transform: 'translate(' + x + ' ' + y + ')', 'aria-hidden': 'true' }, [
        s('rect', { width: 40, height: 40, rx: 6, class: 'wa-frame' }),
        s('circle', { cx: 20, cy: 24, r: 9.5 }),
        s('path', { d: 'M11.5 20 12 9.5l6 5.6M28.5 20 28 9.5l-6 5.6M5 25.5h7M5 29.5l7-1.6M35 25.5h-7M35 29.5l-7-1.6' }),
        s('path', { d: 'M18.8 27h2.4l-1.2 1.4z', class: 'wa-dot' }),
        s('circle', { cx: 16.5, cy: 22.5, r: 1.3, class: 'wa-dot' }), s('circle', { cx: 23.5, cy: 22.5, r: 1.3, class: 'wa-dot' })]);
    }
    reg('kd-flow', {
      title: 'Knowledge transfer: hard label vs soft label', title_bn: 'Knowledge transfer: hard label বনাম soft label',
      mount: function (host, ctx) {
        var w = D.shell({ id: 'kd-flow', title: this.title, title_bn: this.title_bn, kicker: t('Real gradient descent', 'আসল gradient descent'),
          caption: 'Each step is a real gradient step on KL(target‖student) for the student logits z: z ← z − 0.5·(q − p). The teacher\'s soft label says dog (0.18) is far closer to cat than truck (0.01) is: that "dark knowledge" is what the student copies, so its dog/truck ratio climbs towards 18×. A hard label only says "cat", so the student\'s ranking of the wrong classes stays meaningless.',
          caption_bn: 'প্রতিটা step হলো student logits z-এর উপর KL(target‖student)-এর আসল gradient step: z ← z − 0.5·(q − p)। Teacher-এর soft label বলে, truck (0.01)-এর চেয়ে dog (0.18) cat-এর অনেক কাছের — এই "dark knowledge"-টাই student শেখে, তাই dog/truck অনুপাত 18×-এর দিকে যায়। Hard label শুধু বলে "cat", তাই ভুল class-গুলোর ক্রম student কিছুই শেখে না।' });
        host.appendChild(w.root);
        var mode = 'soft', z = Z0.slice(), q = softmax(z), n = 0, W = 640, G = {}, R = {}, parts = [], acc = [0, 0, 0, 0, 0];
        var motion = !ctx.reducedMotion;
        w.stage.appendChild(legend([['k-teacher', 'Teacher soft label', 'Teacher-এর soft label'], ['k-hard', 'Hard label (one-hot)', 'Hard label (এক-হট)'],
          ['k-ghost', 'What the teacher knew (unused)', 'Teacher যা জানত (ব্যবহার হয়নি)'], ['k-student', 'Student', 'Student (ছাত্র model)']]));
        var svg = w.stage.appendChild(svgEl('Bars: target distribution (left) and student distribution (right) over cat, dog, fox, car, truck'));
        var set = chips(w.readout, [['kl', 'KL(target‖student)', null], ['top', 'Student top-1', 'Student-এর প্রথম পছন্দ'],
          ['ratio', 'Student p(dog)/p(truck)', 'Student-এর dog/truck অনুপাত'], ['step', 'Step', 'ধাপ']]);
        function tgt() { return mode === 'soft' ? TEACH : HARD; }
        function build() {   // wide: target | student columns; narrow: target bar above student bar per class
          var soft = mode === 'soft', nar = W < 480, lab = nar ? 56 : 92, gap = 30, col = (W - lab - gap) / 2;
          G = nar ? { x1: lab, x2: lab, len: W - lab - 38, top: 64, row: 46, bh: 13, dy: 17 } : { x1: lab, x2: lab + col + gap, len: col - 38, top: 66, row: 40, bh: 16, dy: 0 };
          var H = G.top + 5 * G.row + 6, bottom = G.top + 5 * G.row - (nar ? 12 : 18);
          svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.textContent = ''; parts = [];
          svg.appendChild(catIcon(4, 2));
          if (!nar) svg.appendChild(stx(2, 56, 'input', 'ইনপুট', { class: 'wa-small wa-tx-muted' }));
          var thd = soft ? ['Teacher target', 'Teacher-এর soft label'] : ['Hard label', 'Hard label (এক-হট)'], tcl = (soft ? 'wa-tx-t' : 'wa-tx-fg') + ' wa-b';
          if (nar) {
            svg.appendChild(stx2(G.x1, 16, thd[0] + ' (top bar)', thd[1] + ' (উপরের bar)', { class: tcl }));
            svg.appendChild(s('text', { x: G.x1, y: 48, class: 'wa-tx-s wa-b' }, [s('tspan', { class: 'l-en' }, 'Student q (lower bar)'), s('tspan', { class: 'l-bn', dx: 5 }, 'Student (নিচের bar)')]));
          } else {
            svg.appendChild(stx2(G.x1, 20, thd[0], thd[1], { class: tcl }));
            svg.appendChild(stx2(G.x2, 20, 'Student q = softmax(z)', 'Student-এর অনুমান', { class: 'wa-tx-s wa-b' }));
          }
          CLS.forEach(function (c, i) {
            var y = G.top + i * G.row;
            svg.appendChild(stx2(2, y + 12, c[0], c[1], { class: 'wa-tx-fg' }));
            svg.appendChild(s('rect', { x: G.x1, y: y, width: G.len, height: G.bh, rx: 3, class: 'wa-track' }));
            svg.appendChild(s('rect', { x: G.x2, y: y + G.dy, width: G.len, height: G.bh, rx: 3, class: 'wa-track' }));
          });
          (nar ? [G.x1] : [G.x1, G.x2]).forEach(function (x) {
            [0, 0.5, 1].forEach(function (v) {
              svg.appendChild(s('line', { x1: x + v * G.len, x2: x + v * G.len, y1: G.top - 5, y2: bottom, class: 'grid wa-dash' }));
              svg.appendChild(s('text', { x: x + v * G.len, y: H - 4, 'text-anchor': 'middle', class: 'wa-small wa-tx-muted wa-mono' }, String(v)));
            });
          });
          R = { t: [], tv: [], s: [], sv: [], ty: [], sy: [] };
          CLS.forEach(function (c, i) {
            var y = G.top + i * G.row, y2 = y + G.dy, tb = G.bh - 4;
            R.ty.push(y + G.bh / 2); R.sy.push(y2 + G.bh / 2);
            if (!soft) svg.appendChild(s('rect', { x: G.x1 + 0.6, y: y + 0.6, width: TEACH[i] * G.len, height: G.bh - 1.2, rx: 3, class: 'wa-ghost' }));
            R.t.push(svg.appendChild(s('rect', { x: G.x1, y: y, height: G.bh, rx: 3, class: soft ? 'f-teacher' : 'wa-f-hard' })));
            R.tv.push(svg.appendChild(s('text', { y: y + tb + 0.5, class: 'wa-small wa-mono' })));
            R.s.push(svg.appendChild(s('rect', { x: G.x2, y: y2, height: G.bh, rx: 3, class: 'f-student' })));
            R.sv.push(svg.appendChild(s('text', { y: y2 + tb + 0.5, class: 'wa-small wa-mono' })));
          });
          R.pg = svg.appendChild(s('g', { 'aria-hidden': 'true' }));
        }
        function update() {
          var p = tgt(), best = 0;
          for (var i = 0; i < 5; i++) {
            var tw = p[i] * G.len, sw = Math.max(1.5, q[i] * G.len);
            R.t[i].setAttribute('width', tw); R.tv[i].setAttribute('x', G.x1 + tw + 4); R.tv[i].textContent = p[i].toFixed(2);
            R.s[i].setAttribute('width', sw); R.sv[i].setAttribute('x', G.x2 + sw + 4); R.sv[i].textContent = q[i].toFixed(2);
            if (q[i] > q[best]) best = i;
          }
          var kl = 0; p.forEach(function (pi, j) { if (pi > 0) kl += pi * Math.log(pi / q[j]); });
          set('kl', kl.toFixed(3)); set('top', CLS[best][0] + ' (' + q[best].toFixed(2) + ')');
          set('ratio', (q[1] / q[4]).toFixed(1) + '×'); set('step', String(n));
        }
        function gradStep() {
          var p = tgt();
          for (var i = 0; i < 5; i++) z[i] -= LR * (q[i] - p[i]);   // dKL/dz = q - p
          q = softmax(z); n++; update();
          return n < MAX;
        }
        function spawn(i) {
          var pt = null;
          for (var j = 0; j < parts.length; j++) if (!parts[j].on) { pt = parts[j]; break; }
          if (!pt) { if (parts.length >= 40) return; pt = { el: R.pg.appendChild(s('circle', { r: 2.6 })) }; parts.push(pt); }
          pt.i = i; pt.t = 0; pt.on = true; pt.k = Math.random();
          pt.el.setAttribute('class', mode === 'soft' ? 'f-teacher' : 'wa-f-hard'); pt.el.setAttribute('visibility', 'visible');
        }
        function frame(dt) {   // particles: teacher bar -> student bar, rate proportional to target probability
          if (!motion) return;
          var p = tgt();
          for (var i = 0; i < 5; i++) { acc[i] += dt * 11 * p[i]; while (acc[i] >= 1) { acc[i] -= 1; spawn(i); } }
          parts.forEach(function (pt) {
            if (!pt.on) return;
            pt.t += dt / 0.9;
            if (pt.t >= 1) { pt.on = false; pt.el.setAttribute('visibility', 'hidden'); return; }
            var x0 = G.x1 + p[pt.i] * G.len + 32, x1 = G.x2 + q[pt.i] * G.len, y0 = R.ty[pt.i], y1 = R.sy[pt.i], u = pt.t, arc = Math.sin(Math.PI * u);
            pt.el.setAttribute('cx', (x0 + (x1 - x0) * u).toFixed(1));
            pt.el.setAttribute('cy', (y0 + (y1 - y0) * u - arc * (6 + pt.k * 8)).toFixed(1));
            pt.el.setAttribute('opacity', (0.15 + arc * 0.8).toFixed(2));
          });
        }
        function hideParts() { parts.forEach(function (pt) { pt.on = false; pt.el.setAttribute('visibility', 'hidden'); }); }
        var sg = seg([['hard', 'Hard label (one-hot)', 'Hard label (এক-হট)'], ['soft', 'Soft label (teacher)', 'Soft label (teacher-এর)']], mode,
          function (v) { mode = v; build(); update(); }, 'Training target');
        var pl = player({ interval: 0.16, step: gradStep, frame: frame, live: w.readout, onPause: hideParts,
          reset: function () { z = Z0.slice(); q = softmax(z); n = 0; update(); } });
        w.controls.appendChild(sg.el); w.controls.appendChild(row(pl.els));
        var unfit = fit(w.stage, function (cw) { W = cw; build(); update(); });
        return function () { pl.destroy(); unfit(); };
      }
    });
  })();

  /* ===== 2. temperature-slider: softmax(z/T) with T=1 ghosts ===== */
  (function () {
    var TOK = [['Dhaka', 'ঢাকা', 6], ['Chattogram', 'চট্টগ্রাম', 3.5], ['Sylhet', 'সিলেট', 2.5], ['Delhi', 'দিল্লি', 1], ['banana', 'কলা', -1]];
    var Z = TOK.map(function (r) { return r[2]; }), P1 = softmax(Z, 1);
    var PRE = [[1, 'T = 1', null], [2, 'T = 2', null], [4, 'T = 4 · my thesis', 'T = 4 · আমার thesis'], [10, 'T = 10', null]];
    reg('temperature-slider', {
      title: 'Temperature reshapes the softmax', title_bn: 'Temperature কীভাবে softmax বদলায়',
      mount: function (host) {
        var w = D.shell({ id: 'temperature-slider', title: this.title, title_bn: this.title_bn, kicker: t('Live softmax', 'সরাসরি softmax'),
          caption: 'p_i = exp(z_i/T) / Σ_j exp(z_j/T). Raising T flattens the distribution but never changes the ranking, so the tiny probabilities become visible: the teacher clearly rates Chattogram as a far better wrong answer than banana. That ranking of wrong answers is the dark knowledge KD transfers (Hinton et al. soften teacher and student with the same T and scale the loss by T²). Distillation T is a training-time knob; it is not the sampling temperature you set when generating text.',
          caption_bn: 'p_i = exp(z_i/T) / Σ exp(z_j/T)। T বাড়ালে ranking একই থাকে, কিন্তু distribution চ্যাপ্টা হয়, তাই ছোট probability-গুলো চোখে পড়ে: teacher-এর মতে banana-র চেয়ে Chattogram অনেক ভালো "ভুল উত্তর"। ভুল উত্তরগুলোর এই ক্রমটাই dark knowledge (Hinton: teacher আর student দুজনেই একই T, loss × T²)। এটা training-এর knob — text generate করার sampling temperature আলাদা জিনিস।' });
        host.appendChild(w.root);
        var T = 1, W = 640, R = {};
        w.stage.appendChild(h('div', { class: 'wa-prompt' }, t('The capital of Bangladesh is ___', 'বাংলাদেশের রাজধানী ___', 'div')));
        w.stage.appendChild(legend([['k-teacher', 'softmax(z / T) at the current T', 'এখনকার T-তে softmax'], ['k-ghost-n', 'T = 1, for comparison', 'তুলনার জন্য T = 1']]));
        var svg = w.stage.appendChild(svgEl('Bar chart of next-token probabilities for five candidate answers at the chosen temperature'));
        var set = chips(w.readout, [['max', 'Max probability', 'সবচেয়ে বড় probability'], ['ent', 'Entropy', 'Entropy (অনিশ্চয়তা)'], ['ratio', 'p(Chattogram) / p(banana)', null]]);
        function build() {
          var lab = W < 440 ? 84 : 116, bx = lab + 40, len = W - bx - 52, top = 24, rh = 36, H = top + 5 * rh + 12;
          R = { b: [], v: [], bx: bx, len: len };
          svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.textContent = '';
          svg.appendChild(s('text', { x: lab, y: 12, class: 'wa-small wa-tx-muted wa-mono' }, 'z'));
          svg.appendChild(s('text', { x: bx, y: 12, class: 'wa-small wa-tx-muted wa-mono' }, 'p = softmax(z / T)'));
          [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
            svg.appendChild(s('line', { x1: bx + v * len, x2: bx + v * len, y1: top - 4, y2: top + 5 * rh - 10, class: 'grid' }));
            svg.appendChild(s('text', { x: bx + v * len, y: H - 2, 'text-anchor': 'middle', class: 'wa-small wa-tx-muted wa-mono' }, v * 100 + '%'));
          });
          TOK.forEach(function (tk, i) {
            var y = top + i * rh;
            svg.appendChild(stx2(0, y + 13, tk[0], tk[1], { class: 'wa-tx-fg' }));
            svg.appendChild(s('text', { x: lab, y: y + 13, class: 'wa-small wa-mono wa-tx-muted' }, minus(tk[2].toFixed(1))));
            svg.appendChild(s('rect', { x: bx, y: y, width: Math.max(0.5, P1[i] * len), height: 18, rx: 3, class: 'wa-ghost-n' }));
            R.b.push(svg.appendChild(s('rect', { x: bx, y: y + 4, height: 10, rx: 2, class: 'f-teacher' })));
            R.v.push(svg.appendChild(s('text', { y: y + 13, class: 'wa-small wa-mono wa-tx-fg' })));
          });
        }
        function update() {
          var p = softmax(Z, T), r = p[1] / p[4];
          p.forEach(function (v, i) {
            var bw = Math.max(1, v * R.len);
            R.b[i].setAttribute('width', bw);
            R.v[i].setAttribute('x', R.bx + Math.max(bw, P1[i] * R.len) + 5); R.v[i].textContent = pct(v);
          });
          set('max', pct(p[0]) + ' (Dhaka)'); set('ent', bits(p).toFixed(2) + ' bits (max 2.32)');
          set('ratio', (r >= 100 ? r.toFixed(0) : r.toFixed(2)) + '×');
          pres.forEach(function (b, i) { b.setAttribute('aria-pressed', String(Math.abs(T - PRE[i][0]) < 0.05)); });
        }
        var sl = D.slider({ id: 'temp', label: 'Temperature T', label_bn: 'তাপমাত্রা (temperature) T', min: 0.5, max: 10, step: 0.1, value: 1,
          format: function (v) { return v.toFixed(1); }, onInput: function (v) { T = v; update(); } });
        var pres = PRE.map(function (pr) {
          var b = btn(pr[1], pr[2], function () { sl.set(pr[0]); }, pr[0] === 1);
          if (pr[0] === 4) b.classList.add('wa-thesis-btn');
          return b;
        });
        w.controls.appendChild(sl.wrap); w.controls.appendChild(row(pres));
        var unfit = fit(w.stage, function (cw) { W = cw; build(); update(); });
        return unfit;
      }
    });
  })();

  /* ===== 3. kl-forward-reverse: grid-search a Gaussian student against a bimodal teacher ===== */
  (function () {
    var N = 161, X = [], MU = [], SG = [], i, cache = {};
    for (i = 0; i < N; i++) X.push(-8 + i * 0.1);
    for (i = 0; i <= 120; i++) MU.push(-6 + i * 0.1);
    for (i = 0; i <= 94; i++) SG.push(0.3 + i * 0.05);
    function gauss(x, m, sg) { var u = (x - m) / sg; return Math.exp(-0.5 * u * u) / sg; }
    function norm(a) { var sum = a.reduce(function (x, y) { return x + y; }, 0); return a.map(function (v) { return v / sum; }); }
    function teacher(d) { return norm(X.map(function (x) { return 0.5 * gauss(x, -d / 2, 1) + 0.5 * gauss(x, d / 2, 1); })); }
    function student(mu, sg) { return norm(X.map(function (x) { return gauss(x, mu, sg); })); }
    function kl(a, b) { var v = 0; for (var j = 0; j < N; j++) if (a[j] > 0) v += a[j] * Math.log(a[j] / Math.max(b[j], 1e-300)); return v; }
    /** For every μ on the grid keep the best σ for each objective (profiles F and R). */
    function search(d) {
      if (cache[d]) return cache[d];
      var p = teacher(d), lp = p.map(function (v) { return Math.log(Math.max(v, 1e-300)); });
      var lq = new Float64Array(N), qv = new Float64Array(N), F = [], R = [];
      MU.forEach(function (mu) {
        var bf = { v: Infinity }, br = { v: Infinity };
        SG.forEach(function (sg) {
          var zs = 0, j, f = 0, r = 0, u, lz;
          for (j = 0; j < N; j++) { u = (X[j] - mu) / sg; lq[j] = -0.5 * u * u; qv[j] = Math.exp(lq[j]); zs += qv[j]; }
          lz = Math.log(zs);
          for (j = 0; j < N; j++) { f += p[j] * (lp[j] - lq[j] + lz); r += qv[j] * (lq[j] - lz - lp[j]); }
          r /= zs;
          if (f < bf.v) bf = { v: f, s: sg };
          if (r < br.v) br = { v: r, s: sg };
        });
        F.push(bf); R.push(br);
      });
      return (cache[d] = { p: p, F: F, R: R });
    }
    /** Forward: global minimum. Reverse: walk downhill on the μ-profile from the start (a local optimiser's answer). */
    function pick(res, mode, start) {
      var prof = mode === 'fwd' ? res.F : res.R, k = 0, j;
      if (mode === 'fwd') { for (j = 1; j < prof.length; j++) if (prof[j].v < prof[k].v) k = j; }
      else {
        k = Math.round((start + 6) / 0.1);
        for (;;) {
          var l = k > 0 ? prof[k - 1].v : Infinity, r = k < prof.length - 1 ? prof[k + 1].v : Infinity;
          if (l < prof[k].v && l <= r) k--; else if (r < prof[k].v) k++; else break;
        }
      }
      return { k: k, mu: MU[k], sg: prof[k].s, prof: prof };
    }
    reg('kl-forward-reverse', {
      title: 'Forward vs reverse KL: covering vs choosing modes', title_bn: 'Forward বনাম reverse KL: সব mode ঢাকা বনাম একটা বেছে নেওয়া',
      mount: function (host) {
        var w = D.shell({ id: 'kl-forward-reverse', title: this.title, title_bn: this.title_bn, kicker: t('Real grid search', 'আসল grid search'),
          caption: 'Both fits are a real grid search over μ ∈ [−6, 6], σ ∈ [0.3, 5] on the discretised x. Forward KL(p‖q) punishes q ≈ 0 wherever p > 0, so the student is mean-seeking / mode-covering: it stretches over both modes and puts mass in the valley where the teacher has none (red). Reverse KL(q‖p) punishes q > 0 wherever p ≈ 0, so it is mode-seeking: it locks onto one mode, and which one depends on where optimisation starts. MiniLLM uses reverse KL for generation so a small student does not spread probability over text the teacher would never write.',
          caption_bn: 'দুটো fit-ই discretised x-এর উপর μ, σ-এর আসল grid search। Forward KL(p‖q)-তে যেখানে p > 0, সেখানে q ≈ 0 হলে বড় শাস্তি — তাই student দুই mode-ই ঢাকে (mean-seeking), আর মাঝের ফাঁকে mass রাখে যেখানে teacher-এর কিছুই নেই (লাল)। Reverse KL(q‖p)-তে যেখানে p ≈ 0, সেখানে q > 0 হলে শাস্তি — তাই student একটা mode বেছে নেয় (mode-seeking); কোনটা, তা নির্ভর করে কোথা থেকে শুরু। MiniLLM generation-এ reverse KL নেয়, যাতে ছোট student এমন text-এ probability না ছড়ায় যা teacher কখনো লিখত না।' });
        host.appendChild(w.root);
        var mode = 'fwd', d = 7, start = 2, W = 640;
        w.stage.appendChild(legend([['k-line-t', 'Teacher p(x): two Gaussians', 'Teacher p(x): দুটো Gaussian'], ['k-line-s', 'Student q(x) = N(μ, σ²)', 'Student q(x): একটা Gaussian'],
          ['k-gap', 'Student mass where p < 5% of its peak', 'যেখানে teacher প্রায় শূন্য, সেখানে student-এর mass']]));
        var svg = w.stage.appendChild(svgEl('Teacher bimodal density in gold and best-fitting single Gaussian student in blue, with the loss curve over mu below'));
        var set = chips(w.readout, [['fit', 'Best fit', 'সেরা fit'], ['f', 'KL(p‖q)', 'Forward KL'], ['r', 'KL(q‖p)', 'Reverse KL'], ['gap', 'q mass in the teacher\'s gap', 'ফাঁকে student-এর mass']]);
        function draw() {
          var res = search(d), f = pick(res, mode, start), p = res.p, q = student(f.mu, f.sg), j;
          var pl = 10, pr = 10, top = 10, mh = W < 440 ? 150 : 180, base = top + mh, st = base + 44, sh = 56, H = st + sh + 8;
          var xs = function (x) { return pl + (x + 8) / 16 * (W - pl - pr); };
          var pmax = Math.max.apply(null, p), ymax = Math.max(pmax, Math.max.apply(null, q)) * 1.08;
          var ys = function (v) { return base - v / ymax * mh; };
          svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.textContent = '';
          for (var x = -8; x <= 8; x += W < 440 ? 4 : 2) {
            svg.appendChild(s('line', { x1: xs(x), x2: xs(x), y1: top, y2: base, class: 'grid' }));
            svg.appendChild(s('text', { x: xs(x), y: base + 15, 'text-anchor': 'middle', class: 'wa-small wa-mono wa-tx-muted' }, minus(x)));
          }
          // student mass where the teacher has (almost) none
          var run = [], gap = 0;
          function flush() { if (run.length > 1) svg.appendChild(s('path', { d: pathOf(run.concat([[run[run.length - 1][0], base], [run[0][0], base]])), class: 'wa-f-gap' })); run = []; }
          for (j = 0; j < N; j++) { if (p[j] < 0.05 * pmax) { gap += q[j]; run.push([xs(X[j]), ys(q[j])]); } else flush(); }
          flush();
          var pp = X.map(function (x, k) { return [xs(x), ys(p[k])]; }), qq = X.map(function (x, k) { return [xs(x), ys(q[k])]; });
          var close = 'L' + xs(8) + ' ' + base + 'L' + xs(-8) + ' ' + base + 'Z';
          svg.appendChild(s('path', { d: pathOf(pp) + close, class: 'wa-area-t' }));
          svg.appendChild(s('path', { d: pathOf(qq) + close, class: 'wa-area-s' }));
          svg.appendChild(s('path', { d: pathOf(pp), class: 'wa-line s-teacher' }));
          svg.appendChild(s('path', { d: pathOf(qq), class: 'wa-line s-student' }));
          svg.appendChild(s('line', { x1: pl, x2: W - pr, y1: base, y2: base, class: 'axis' }));
          svg.appendChild(s('line', { x1: xs(f.mu), x2: xs(f.mu), y1: ys(Math.max.apply(null, q)), y2: base, class: 's-student wa-dash' }));
          svg.appendChild(s('text', { x: xs(f.mu) + 4, y: ys(Math.max.apply(null, q)) - 4, class: 'wa-small wa-mono wa-tx-s' }, 'μ = ' + minus(f.mu.toFixed(1))));
          // loss profile over μ
          var vals = f.prof.map(function (o) { return o.v; }), vmin = Math.min.apply(null, vals), span = clamp(Math.max.apply(null, vals) - vmin, 0.3, 3);
          var py = function (v) { return st + 6 + (sh - 12) * Math.min(1, (v - vmin) / span); };
          svg.appendChild(stx(pl, st - 6, mode === 'fwd' ? 'loss KL(p‖q) vs μ (best σ at each μ)' : 'loss KL(q‖p) vs μ (best σ at each μ)', 'μ বদলালে loss', { class: 'wa-small wa-tx-muted' }));
          svg.appendChild(s('rect', { x: xs(-6), y: st, width: xs(6) - xs(-6), height: sh, rx: 4, class: 'wa-panel' }));
          svg.appendChild(s('path', { d: pathOf(MU.map(function (m, k) { return [xs(m), st + sh - (py(vals[k]) - st)]; })), class: 'wa-line s-student wa-thin' }));
          var ym = st + sh - (py(vals[f.k]) - st);
          if (mode === 'rev') {
            var sx = xs(start);
            svg.appendChild(s('path', { d: 'M' + sx + ' ' + (st + sh - 2) + 'L' + (xs(f.mu)) + ' ' + (st + sh - 2), class: 's-student wa-dash wa-thin' }));
            svg.appendChild(s('path', { d: 'M' + (sx - 5) + ' ' + (st + sh + 6) + 'l5 -8 5 8z', class: 'f-student' }));
            svg.appendChild(stx(sx + 7, st + sh + 6, 'start', 'শুরু', { class: 'wa-small wa-tx-s' }));
          }
          svg.appendChild(s('circle', { cx: xs(f.mu), cy: ym, r: 4.5, class: 'f-student wa-ring' }));
          set('fit', 'μ = ' + minus(f.mu.toFixed(1)) + ', σ = ' + f.sg.toFixed(2));
          set('f', kl(p, q).toFixed(3)); set('r', kl(q, p).toFixed(3)); set('gap', (gap * 100).toFixed(1) + '%');
          startSl.input.disabled = mode !== 'rev';
        }
        var raf = 0;
        function later() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; draw(); }); }
        var sg = seg([['fwd', 'Forward KL(p‖q)', null], ['rev', 'Reverse KL(q‖p)', null]], mode, function (v) { mode = v; draw(); }, 'Objective');
        var dSl = D.slider({ id: 'kld', label: 'Distance between modes', label_bn: 'দুই mode-এর দূরত্ব', min: 0, max: 10, step: 0.5, value: d,
          format: function (v) { return 'd = ' + v.toFixed(1); }, onInput: function (v) { d = v; later(); } });
        var startSl = D.slider({ id: 'kls', label: 'Reverse-KL start μ₀', label_bn: 'Reverse KL শুরুর μ₀', min: -6, max: 6, step: 0.5, value: start,
          format: function (v) { return minus(v.toFixed(1)); }, onInput: function (v) { start = v; later(); } });
        w.controls.appendChild(sg.el); w.controls.appendChild(dSl.wrap); w.controls.appendChild(startSl.wrap);
        var unfit = fit(w.stage, function (cw) { W = cw; draw(); });
        return function () { unfit(); if (raf) cancelAnimationFrame(raf); };
      }
    });
  })();

  /* ===== 4. kd-lanes: who writes the prefix and what is the target ===== */
  (function () {
    var TOK = ['The', 'court', 'may', 'grant', 'bail', '.'];
    var LANES = [
      { id: 'word', en: 'Word-level KD', bn: 'Word-level KD', src: 'gold', who: ['ground-truth text', 'আসল (gold) লেখা'], tgt: ['teacher p(next | gold prefix), soft', 'teacher-এর soft probability'], loss: 'KL' },
      { id: 'seq', en: 'SeqKD (my thesis: text + top-50 soft)', bn: 'SeqKD (আমার thesis: text + top-50 soft)', src: 'teacher', who: ['teacher-written text', 'teacher-এর লেখা'], tgt: ['teacher token, hard (CE); my thesis adds KL on saved top-50', 'teacher-এর token (CE); আমার thesis-এ সাথে top-50 KL'], loss: 'CE (+KL)' },
      { id: 'on', en: 'On-policy KD (GKD)', bn: 'On-policy KD (GKD)', src: 'student', who: ['student-written text', 'student-এর নিজের লেখা'], tgt: ['teacher p(next | student prefix), soft', 'student-এর prefix-এ teacher-এর probability'], loss: 'KL / JSD' }
    ];
    var STY = { gold: 'fill: var(--surface-3); stroke: var(--line-strong)', teacher: 'fill: var(--teacher-soft); stroke: var(--teacher)', student: 'fill: var(--student-soft); stroke: var(--student)' };
    reg('kd-lanes', {
      title: 'Three lanes of distillation: who writes the prefix?', title_bn: 'Distillation-এর তিন লেন: prefix কে লেখে?',
      mount: function (host, ctx) {
        var w = D.shell({ id: 'kd-lanes', title: this.title, title_bn: this.title_bn, kicker: t('Step through', 'ধাপে ধাপে'),
          caption: 'At each step the student must predict the next token. The lanes differ in the prefix it conditions on and in the target it is given. Word-level KD uses the ground-truth prefix; SeqKD trains on text the teacher wrote; on-policy KD lets the student write the prefix and the teacher scores it, which removes exposure bias (train prefixes look like test prefixes).',
          caption_bn: 'প্রতি ধাপে student-কে পরের token আন্দাজ করতে হয়। তিন লেনের তফাত হলো কোন prefix-এর উপর ভিত্তি করে আন্দাজ, আর target কী। Word-level KD আসল prefix ব্যবহার করে; SeqKD teacher-এর লেখা text-এ শেখে; on-policy KD-তে prefix লেখে student নিজে আর teacher নম্বর দেয়, তাই exposure bias থাকে না (training-এর prefix আর test-এর prefix একই রকম)।' });
        host.appendChild(w.root);
        var step = 3, lam = 0.5, W = 640;
        w.stage.appendChild(legend([['k-neutral', 'Ground-truth text', 'আসল লেখা'], ['k-teacher', 'Teacher-written', 'Teacher-এর লেখা'], ['k-student', 'Student-written', 'Student-এর লেখা']]));
        var svg = w.stage.appendChild(svgEl('Three lanes showing the prefix source and training target for word-level KD, SeqKD and on-policy KD'));
        var set = chips(w.readout, [['t', 'Predicting token', 'কোন token আন্দাজ'], ['on', 'On-policy share λ', 'On-policy অংশ λ'], ['exp', 'Student prefixes seen in training', 'Training-এ student-এর prefix']]);
        function draw() {
          var n = TOK.length, bw = Math.max(34, Math.floor((W - 16) / n) - 4), laneH = 112, H = laneH * 3 + 8;
          svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.textContent = '';
          LANES.forEach(function (L, li) {
            var y0 = li * laneH + 4;
            svg.appendChild(s('rect', { x: 0, y: y0, width: W, height: laneH - 8, rx: 8, class: 'wa-panel' }));
            svg.appendChild(stx(10, y0 + 18, L.en, L.bn, { class: 'wa-b wa-tx-fg' }));
            for (var i = 0; i < n; i++) {
              var x = 8 + i * (bw + 4), y = y0 + 28, known = i < step, cur = i === step;
              svg.appendChild(s('rect', { x: x, y: y, width: bw, height: 26, rx: 5, style: known ? STY[L.src] : 'fill: var(--surface); stroke: var(--line)', 'stroke-width': cur ? 2.5 : 1, 'stroke-dasharray': known || cur ? null : '3 3' }));
              if (cur) svg.lastChild.setAttribute('style', 'fill: var(--surface); stroke: var(--accent)');
              svg.appendChild(s('text', { x: x + bw / 2, y: y + 17, 'text-anchor': 'middle', class: 'wa-small ' + (known || cur ? 'wa-tx-fg' : 'wa-tx-muted') }, cur ? '?' : TOK[i]));
            }
            svg.appendChild(stx(10, y0 + 70, 'prefix: ' + L.who[0], 'prefix: ' + L.who[1], { class: 'wa-small wa-tx-muted' }));
            svg.appendChild(stx(10, y0 + 86, 'target: ' + L.tgt[0], 'target: ' + L.tgt[1], { class: 'wa-small wa-tx-fg' }));
            if (L.id === 'on') {   // share of batches whose prefix is student-written
              var bx = 10, bwid = W - 20;
              svg.appendChild(s('rect', { x: bx, y: y0 + 94, width: bwid, height: 6, rx: 3, style: 'fill: var(--surface-3)' }));
              svg.appendChild(s('rect', { x: bx, y: y0 + 94, width: bwid * lam, height: 6, rx: 3, style: 'fill: var(--student)' }));
            }
          });
          set('t', '#' + (step + 1) + ' “' + TOK[step] + '”'); set('on', lam.toFixed(2)); set('exp', '0% · 0% · ' + Math.round(lam * 100) + '%');
        }
        var pl = player({ interval: 900, live: w.readout, step: function () { step = step >= TOK.length - 1 ? 1 : step + 1; draw(); }, reset: function () { step = 3; draw(); } });
        var sl = D.slider({ id: 'kdl', label: 'On-policy share λ (batches written by the student)', label_bn: 'On-policy অংশ λ (student-এর লেখা batch)', min: 0, max: 1, step: 0.05, value: lam, format: function (v) { return v.toFixed(2); }, onInput: function (v) { lam = v; draw(); } });
        w.controls.appendChild(row(pl.els)); w.controls.appendChild(sl.wrap);
        var unfit = fit(w.stage, function (cw) { W = cw; draw(); });
        return function () { unfit(); pl.destroy(); };
      }
    });
  })();

  /* ===== 5. lora-rank: ΔW = B·A and the parameter count ===== */
  (function () {
    function fmtN(v) { return v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(Math.round(v)); }
    reg('lora-rank', {
      title: 'LoRA: a small rank-r update instead of the whole matrix', title_bn: 'LoRA: পুরো matrix-এর বদলে ছোট rank-r update',
      mount: function (host, ctx) {
        var w = D.shell({ id: 'lora-rank', title: this.title, title_bn: this.title_bn, kicker: t('Real parameter count', 'আসল parameter গোনা'),
          caption: 'The frozen weight W₀ (d × k) stays untouched. LoRA learns B (d × r) and A (r × k) and adds (α/r)·B·A. Trainable parameters are r·(d + k) instead of d·k. B starts at zero, so training begins exactly at the base model. Rank r sets capacity; α/r sets how loudly the update speaks (I used r = 32, α = 64, so the scale is 2).',
          caption_bn: 'Frozen weight W₀ (d × k) একদম বদলায় না। LoRA শেখে B (d × r) আর A (r × k), তারপর (α/r)·B·A যোগ করে। Trainable parameter d·k-এর বদলে r·(d + k)। B শুরুতে শূন্য, তাই training ঠিক base model থেকে শুরু হয়। Rank r ক্ষমতা ঠিক করে; α/r ঠিক করে update কতটা জোরে বলবে (আমি r = 32, α = 64 নিয়েছি, scale 2)।' });
        host.appendChild(w.root);
        var d = 4096, r = 32, alpha = 64, trained = true, W = 640;
        w.stage.appendChild(h('div', { class: 'wa-formula', 'aria-label': 'LoRA formula' }, 'h = W₀·x + (α/r) · B · A · x'));
        var svg = w.stage.appendChild(svgEl('Frozen weight matrix plus two thin LoRA matrices B and A drawn in proportion to d and r'));
        var set = chips(w.readout, [['full', 'Full d×d', 'পুরো d×d'], ['lora', 'LoRA r(d+d)', 'LoRA r(d+d)'], ['pct', 'Trainable share', 'Trainable অংশ'], ['scale', 'Scale α/r', 'Scale α/r'], ['dw', 'ΔW', 'ΔW']]);
        function draw() {
          var S = Math.min(150, Math.floor(W * 0.28)), bw = Math.max(4, S * r / d), gx = Math.max(8, Math.floor((W - (S + 28 + bw + 24 + S)) / 2)), y = 34, H = S + 104;
          svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.textContent = '';
          var xW = gx, xB = xW + S + 28, xA = xB + bw + 24;
          svg.appendChild(s('rect', { x: xW, y: y, width: S, height: S, rx: 4, style: 'fill: var(--surface-3); stroke: var(--line-strong)' }));
          svg.appendChild(stx(xW, y - 10, 'W₀ frozen', 'W₀ (frozen)', { class: 'wa-small wa-tx-muted' }));
          svg.appendChild(s('text', { x: xB - 14, y: y + S / 2 + 5, 'text-anchor': 'middle', class: 'wa-tx-fg wa-b' }, '+'));
          svg.appendChild(s('rect', { x: xB, y: y, width: bw, height: S, rx: 2, style: trained ? 'fill: var(--student-soft); stroke: var(--student)' : 'fill: var(--surface); stroke: var(--student); stroke-dasharray: 3 3' }));
          svg.appendChild(stx(xB + bw / 2, y + S + 14, 'B' + (trained ? '' : ' = 0'), 'B' + (trained ? '' : ' = 0'), { class: 'wa-small wa-tx-s', 'text-anchor': 'middle' }));
          svg.appendChild(s('rect', { x: xA, y: y, width: S, height: bw, rx: 2, style: 'fill: var(--student-soft); stroke: var(--student)' }));
          svg.appendChild(stx(xA, y - 10, 'A (r×d)', 'A (r×d)', { class: 'wa-small wa-tx-s' }));
          svg.appendChild(stx(xA, y + bw + 18, 'r = ' + r, 'r = ' + r, { class: 'wa-small wa-tx-s wa-b' }));
          var full = d * d, lora = 2 * d * r, by = y + S + 34, bwid = W - 20, share = lora / full;
          svg.appendChild(stx(10, by, 'Trainable share of d×d', 'd×d-এর কত অংশ trainable', { class: 'wa-small wa-tx-muted' }));
          svg.appendChild(s('rect', { x: 10, y: by + 8, width: bwid, height: 14, rx: 4, class: 'wa-track' }));
          svg.appendChild(s('rect', { x: 10, y: by + 8, width: Math.max(2, Math.min(bwid, bwid * share)), height: 14, rx: 4, style: 'fill: var(--student)' }));
          set('full', fmtN(full)); set('lora', fmtN(lora)); set('pct', (share * 100).toFixed(2) + '%'); set('scale', (alpha / r).toFixed(2)); set('dw', trained ? '≠ 0' : '= 0 (B = 0)');
        }
        var dSeg = seg([[768, '768', null], [2048, '2048', null], [4096, '4096', null]], d, function (v) { d = v; draw(); }, 'Matrix size d');
        var rSl = D.slider({ id: 'lr', label: 'Rank r', label_bn: 'Rank r', min: 1, max: 128, step: 1, value: r, format: function (v) { return String(v); }, onInput: function (v) { r = v; draw(); } });
        var aSl = D.slider({ id: 'la', label: 'α', label_bn: 'α', min: 1, max: 256, step: 1, value: alpha, format: function (v) { return String(v); }, onInput: function (v) { alpha = v; draw(); } });
        var tSeg = seg([[false, 'At init (B = 0)', 'শুরুতে (B = 0)'], [true, 'After training', 'Training-এর পরে']], trained, function (v) { trained = v; draw(); }, 'Training state');
        var preset = btn('Thesis: r = 32, α = 64', 'Thesis: r = 32, α = 64', function () { rSl.set(32); aSl.set(64); }); preset.classList.add('wa-thesis-btn');
        w.controls.appendChild(row([h('span', { class: 'w-label' }, t('d =', 'd =')), dSeg.el, tSeg.el, preset])); w.controls.appendChild(rSl.wrap); w.controls.appendChild(aSl.wrap);
        var unfit = fit(w.stage, function (cw) { W = cw; draw(); });
        return function () { unfit(); };
      }
    });
  })();

  /* ===== 6. quantization: round-to-grid error on real numbers ===== */
  (function () {
    var NF4 = [-1, -0.6961928, -0.5250731, -0.3949175, -0.2844414, -0.1847734, -0.09105, 0, 0.0795803, 0.1609302, 0.2461123, 0.3379152, 0.4407098, 0.562617, 0.7229568, 1];
    function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
    function makeWeights() {   // 24 pseudo-normal weights (Box-Muller), fixed seed
      var r = rng(7), out = [], i, u, v;
      for (i = 0; i < 24; i++) { u = r() || 1e-9; v = r(); out.push(0.3 * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)); }
      return out;
    }
    function quant(wts, bitsN, scheme, group) {
      var out = new Array(wts.length), g, i, m, sc, lv;
      for (g = 0; g < wts.length; g += group) {
        m = 0; for (i = g; i < Math.min(wts.length, g + group); i++) m = Math.max(m, Math.abs(wts[i]));
        m = m || 1e-9;
        for (i = g; i < Math.min(wts.length, g + group); i++) {
          if (scheme === 'nf4') {
            var x = wts[i] / m, best = NF4[0]; NF4.forEach(function (c) { if (Math.abs(c - x) < Math.abs(best - x)) best = c; });
            out[i] = best * m;
          } else {
            lv = Math.pow(2, bitsN - 1) - 1; sc = m / lv;
            out[i] = Math.max(-lv, Math.min(lv, Math.round(wts[i] / sc))) * sc;
          }
        }
      }
      return out;
    }
    reg('quantization', {
      title: 'Quantisation: fewer bits, rounding error', title_bn: 'Quantisation: কম bit, rounding-এর ভুল',
      mount: function (host, ctx) {
        var w = D.shell({ id: 'quantization', title: this.title, title_bn: this.title_bn, kicker: t('Real rounding', 'আসল rounding'),
          caption: 'Each weight is divided by a scale, rounded to one of 2^b levels, and multiplied back. Fewer bits mean fewer levels and a larger error. One outlier stretches the scale and ruins the resolution for everybody else; small groups (each with its own scale) and NF4 (levels placed for bell-shaped weights) reduce that. Memory = parameters × bits ÷ 8: a 7B model is 14 GB at 16-bit and about 3.5 GB at 4-bit.',
          caption_bn: 'প্রতিটা weight-কে scale দিয়ে ভাগ করে 2^b-টা level-এর একটায় round করা হয়, তারপর আবার গুণ। Bit কম মানে level কম, ভুল বেশি। একটা outlier scale টেনে বাড়িয়ে বাকিদের resolution নষ্ট করে; ছোট group (প্রতিটার নিজের scale) আর NF4 (ঘণ্টা-আকৃতির weight-এর জন্য বসানো level) এটা কমায়। Memory = parameter × bit ÷ 8: 7B model 16-bit-এ 14 GB, 4-bit-এ প্রায় 3.5 GB।' });
        host.appendChild(w.root);
        var base = makeWeights(), b = 4, scheme = 'int', group = 24, outlier = false, W = 640;
        w.stage.appendChild(legend([['k-teacher k-dot', 'Original weight (fp16)', 'আসল weight (fp16)'], ['k-student', 'After round-trip', 'Quantise-এর পরে'], ['k-gap', 'Error', 'ভুল']]));
        var svg = w.stage.appendChild(svgEl('Bars of 24 quantised weights against the original values, with the rounding error drawn as red segments'));
        var set = chips(w.readout, [['mse', 'MSE', 'MSE'], ['max', 'Max error', 'সর্বোচ্চ ভুল'], ['eff', 'Bits per weight (incl. scales)', 'প্রতি weight bit (scale সহ)'], ['gb', '7B model size', '7B model-এর size']]);
        function draw() {
          var wts = base.slice(); if (outlier) wts[5] = 2.4;
          var bitsN = scheme === 'nf4' ? 4 : b, q = quant(wts, bitsN, scheme, group), n = wts.length;
          var H = 230, padL = 34, padB = 16, top = 12, ymax = outlier ? 2.6 : 1.3, plotH = H - top - padB, cw = (W - padL - 8) / n;
          function Y(v) { return top + plotH / 2 - v / ymax * (plotH / 2); }
          svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.textContent = '';
          (outlier ? [-2, -1, 0, 1, 2] : [-1, -0.5, 0, 0.5, 1]).forEach(function (v) {
            svg.appendChild(s('line', { x1: padL, x2: W - 8, y1: Y(v), y2: Y(v), class: v === 0 ? 'axis' : 'grid' }));
            svg.appendChild(s('text', { x: padL - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'wa-small wa-tx-muted wa-mono' }, minus(v)));
          });
          var se = 0, mx = 0;
          wts.forEach(function (v, i) {
            var x = padL + i * cw + cw / 2, e = q[i] - v; se += e * e; mx = Math.max(mx, Math.abs(e));
            svg.appendChild(s('rect', { x: x - cw * 0.32, y: Math.min(Y(0), Y(q[i])), width: cw * 0.64, height: Math.max(1, Math.abs(Y(q[i]) - Y(0))), style: 'fill: var(--student-soft); stroke: var(--student)' }));
            svg.appendChild(s('line', { x1: x, x2: x, y1: Y(v), y2: Y(q[i]), style: 'stroke: var(--bad); stroke-width: 2' }));
            svg.appendChild(s('circle', { cx: x, cy: Y(v), r: Math.max(2.5, Math.min(4, cw * 0.22)), style: 'fill: var(--teacher); stroke: var(--surface); stroke-width: 1' }));
          });
          var eff = bitsN + 16 / group;
          set('mse', (se / n).toExponential(2)); set('max', mx.toFixed(3)); set('eff', eff.toFixed(2)); set('gb', (7e9 * eff / 8 / 1e9).toFixed(2) + ' GB');
        }
        var bSl = D.slider({ id: 'qb', label: 'Bits b', label_bn: 'Bit b', min: 2, max: 8, step: 1, value: b, format: function (v) { return v + '-bit'; }, onInput: function (v) { b = v; draw(); } });
        var sSeg = seg([['int', 'Uniform INT', 'Uniform INT'], ['nf4', 'NF4 (4-bit)', 'NF4 (4-bit)']], scheme, function (v) { scheme = v; bSl.input.disabled = v === 'nf4'; draw(); }, 'Scheme');
        var gSeg = seg([[24, 'One scale', 'একটাই scale'], [8, 'Groups of 8', '৮টার group']], group, function (v) { group = v; draw(); }, 'Scale granularity');
        var oBtn = btn('Add an outlier', 'একটা outlier যোগ', function () { outlier = !outlier; oBtn.setAttribute('aria-pressed', String(outlier)); draw(); }, outlier);
        w.controls.appendChild(row([sSeg.el, gSeg.el, oBtn])); w.controls.appendChild(bSl.wrap);
        var unfit = fit(w.stage, function (cw) { W = cw; draw(); });
        return function () { unfit(); };
      }
    });
  })();

  /* ===== 7. attention-heatmap: softmax(QK^T / sqrt(d)) with a causal mask ===== */
  (function () {
    var TOK = ['The', 'court', 'granted', 'bail', 'to', 'him'];
    // Toy 4-d vectors (dims loosely: who / action / thing / filler). Fixed, not learned; the mechanism is exact.
    var K = [[0, 0, 0, 1], [3, 0, 0, 0], [0, 3, 0, 0], [0, 0, 3, 0], [0, 0, 0, 1], [1, 0, 0, 2]];
    var Q = [[1, 0, 0, 1], [1, 0, 0, 1], [2, 0, 2, 0], [0, 2, 1, 0], [0, 0, 1, 1], [2, 0, 0, 1]];
    function attn(causal, scaled, sharp) {
      return Q.map(function (q, i) {
        var z = K.map(function (k, j) {
          if (causal && j > i) return -Infinity;
          var dot = 0; for (var c = 0; c < 4; c++) dot += q[c] * k[c];
          return dot / (scaled ? 2 : 1) * sharp;   // sqrt(d) = 2 for d = 4
        });
        return softmax(z, 1);
      });
    }
    reg('attention-heatmap', {
      title: 'Self-attention: who looks at whom', title_bn: 'Self-attention: কে কার দিকে তাকায়',
      mount: function (host, ctx) {
        var w = D.shell({ id: 'attention-heatmap', title: this.title, title_bn: this.title_bn, kicker: t('Real softmax(QKᵀ/√d)', 'আসল softmax(QKᵀ/√d)'),
          caption: 'Row = the token that is looking (query); column = the token being looked at (key). Each row is a softmax, so it sums to 1. The causal mask hides later tokens so a decoder can only look backwards. Dividing by √d keeps the scores from growing with dimension; without it (or with a high sharpness) rows collapse onto one token. The 4-d vectors are a fixed toy, but the formula is exactly the transformer\'s.',
          caption_bn: 'সারি = যে token তাকাচ্ছে (query); কলাম = যে token-কে দেখা হচ্ছে (key)। প্রতিটা সারি একটা softmax, তাই যোগফল 1। Causal mask পরের token লুকিয়ে রাখে, তাই decoder শুধু পেছনে তাকাতে পারে। √d দিয়ে ভাগ করলে dimension বাড়লেও score বেশি বড় হয় না; না করলে (বা sharpness বেশি হলে) সারি এক token-এ জমে যায়। 4-d vector গুলো স্থির খেলনা, কিন্তু সূত্রটা ঠিক transformer-এর।' });
        host.appendChild(w.root);
        var causal = true, scaled = true, sharp = 1, sel = 2, W = 640;
        var svg = w.stage.appendChild(svgEl('Heatmap of attention weights between six tokens; rows are queries and columns are keys'));
        var set = chips(w.readout, [['q', 'Selected query', 'বাছাই করা query'], ['top', 'Looks most at', 'সবচেয়ে বেশি দেখছে'], ['ent', 'Row entropy', 'সারির entropy']]);
        function draw() {
          var A = attn(causal, scaled, sharp), n = TOK.length, padL = 58, padT = 40, cell = Math.min(54, Math.floor((W - padL - 8) / n)), H = padT + n * cell + 6;
          svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.textContent = '';
          svg.appendChild(stx(padL, 12, 'key (being looked at) →', 'key (যাকে দেখা হচ্ছে) →', { class: 'wa-small wa-tx-muted' }));
          TOK.forEach(function (tk, j) { svg.appendChild(s('text', { x: padL + j * cell + cell / 2, y: padT - 8, 'text-anchor': 'middle', class: 'wa-small wa-tx-fg' }, tk)); });
          TOK.forEach(function (tk, i) {
            var y = padT + i * cell;
            svg.appendChild(s('text', { x: padL - 6, y: y + cell / 2 + 4, 'text-anchor': 'end', class: 'wa-small ' + (i === sel ? 'wa-tx-s wa-b' : 'wa-tx-fg') }, tk));
            A[i].forEach(function (p, j) {
              var x = padL + j * cell, masked = causal && j > i;
              svg.appendChild(s('rect', { x: x + 1, y: y + 1, width: cell - 2, height: cell - 2, rx: 3, style: masked ? 'fill: var(--surface-2); stroke: var(--line); stroke-dasharray: 3 3' : 'fill: var(--student); fill-opacity: ' + (0.08 + 0.85 * p).toFixed(3) }));
              svg.appendChild(s('text', { x: x + cell / 2, y: y + cell / 2 + 4, 'text-anchor': 'middle', class: 'wa-small wa-mono', style: masked ? 'fill: var(--muted)' : p > 0.55 ? 'fill: var(--surface)' : 'fill: var(--fg)' }, masked ? '–' : p.toFixed(2)));
            });
            if (i === sel) svg.appendChild(s('rect', { x: padL - 1, y: y, width: n * cell + 2, height: cell, rx: 4, fill: 'none', style: 'stroke: var(--accent); stroke-width: 2' }));
          });
          var row = A[sel], top = 0; row.forEach(function (p, j) { if (p > row[top]) top = j; });
          set('q', TOK[sel]); set('top', TOK[top] + ' (' + row[top].toFixed(2) + ')'); set('ent', bits(row).toFixed(2) + ' bits');
        }
        var qSeg = seg(TOK.map(function (tk, i) { return [i, tk, null]; }), sel, function (v) { sel = v; draw(); }, 'Query token');
        var cBtn = btn('Causal mask', 'Causal mask', function () { causal = !causal; cBtn.setAttribute('aria-pressed', String(causal)); draw(); }, causal);
        var sBtn = btn('Divide by √d', '√d দিয়ে ভাগ', function () { scaled = !scaled; sBtn.setAttribute('aria-pressed', String(scaled)); draw(); }, scaled);
        var sl = D.slider({ id: 'ahs', label: 'Sharpness (multiplies the scores)', label_bn: 'Sharpness (score-কে গুণ করে)', min: 0.25, max: 3, step: 0.05, value: sharp, format: function (v) { return '×' + v.toFixed(2); }, onInput: function (v) { sharp = v; draw(); } });
        w.controls.appendChild(row([h('span', { class: 'w-label' }, t('Query:', 'Query:')), qSeg.el])); w.controls.appendChild(row([cBtn, sBtn])); w.controls.appendChild(sl.wrap);
        var unfit = fit(w.stage, function (cw) { W = cw; draw(); });
        return function () { unfit(); };
      }
    });
  })();

  /* ===== 8. decoding-sampler: temperature, then top-k, then top-p ===== */
  (function () {
    var TOK = ['grant', 'deny', 'reject', 'allow', 'issue', 'refuse', 'order', 'dismiss', 'hear', 'adjourn'];
    var LOG = [3.2, 2.4, 1.9, 1.7, 1.2, 0.9, 0.6, 0.3, 0, -0.8];
    function pipeline(T, k, p) {
      var pr = softmax(LOG, Math.max(T, 0.02)), order = pr.map(function (v, i) { return i; }).sort(function (a, b) { return pr[b] - pr[a]; });
      var keep = order.slice(0, k);
      var mass = keep.reduce(function (a, i) { return a + pr[i]; }, 0), cum = 0, kept = [];
      for (var q = 0; q < keep.length; q++) { kept.push(keep[q]); cum += pr[keep[q]] / mass; if (cum >= p - 1e-9) break; }
      var m2 = kept.reduce(function (a, i) { return a + pr[i]; }, 0), fin = pr.map(function () { return 0; });
      kept.forEach(function (i) { fin[i] = pr[i] / m2; });
      return { pr: pr, fin: fin, kept: kept, mass: m2 };
    }
    reg('decoding-sampler', {
      title: 'Decoding: temperature, top-k and top-p', title_bn: 'Decoding: temperature, top-k আর top-p',
      mount: function (host, ctx) {
        var w = D.shell({ id: 'decoding-sampler', title: this.title, title_bn: this.title_bn, kicker: t('Real sampling', 'আসল sampling'),
          caption: 'Order: divide logits by the sampling temperature and softmax; keep the top-k tokens; renormalise; keep the smallest prefix whose probability reaches p (top-p); renormalise again; draw. T → 0 is greedy. This is the inference-time knob, not the distillation temperature used inside the KD loss.',
          caption_bn: 'ক্রম: logit-কে sampling temperature দিয়ে ভাগ করে softmax; top-k token রাখো; আবার normalise; যোগফল p ছোঁয়া ছোট prefix রাখো (top-p); আবার normalise; তারপর একটা বাছো। T → 0 মানে greedy। এটা inference-এর knob, KD loss-এর ভেতরের distillation temperature না।' });
        host.appendChild(w.root);
        var T = 1, k = 10, p = 1, counts = null, last = '–', W = 640;
        w.stage.appendChild(h('div', { class: 'wa-prompt' }, [h('span', { class: 'l-en' }, 'Prompt: “The court may ___”'), h('span', { class: 'l-bn' }, 'Prompt: “The court may ___”')]));
        w.stage.appendChild(legend([['k-neutral', 'Probability at this T (before filtering)', 'এই T-তে probability (filter-এর আগে)'], ['k-student', 'Kept and renormalised', 'রাখা হলো, আবার normalise']]));
        var svg = w.stage.appendChild(svgEl('Bars for ten candidate next tokens showing probabilities before and after top-k and top-p filtering'));
        var set = chips(w.readout, [['n', 'Tokens kept', 'রাখা token'], ['mass', 'Mass kept before renorm', 'Renorm-এর আগে রাখা mass'], ['ent', 'Entropy', 'Entropy'], ['last', 'Last draw', 'শেষ বাছাই']]);
        function draw() {
          var R = pipeline(T, k, p), rowH = 24, padL = 70, padR = 54, top = 6, H = top + TOK.length * rowH + 22, bw = W - padL - padR;
          svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.textContent = '';
          var maxv = Math.max.apply(null, R.pr.concat(R.fin)), sc = bw / Math.max(0.05, Math.ceil(maxv * 10) / 10);
          [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
            if (v * sc > bw + 0.5) return;
            svg.appendChild(s('line', { x1: padL + v * sc, x2: padL + v * sc, y1: top, y2: top + TOK.length * rowH, class: 'grid' }));
            svg.appendChild(s('text', { x: padL + v * sc, y: H - 4, 'text-anchor': 'middle', class: 'wa-small wa-tx-muted wa-mono' }, v.toFixed(2)));
          });
          TOK.forEach(function (tk, i) {
            var y = top + i * rowH, cut = R.fin[i] === 0;
            svg.appendChild(s('text', { x: padL - 6, y: y + 15, 'text-anchor': 'end', class: 'wa-small ' + (cut ? 'wa-tx-muted' : 'wa-tx-fg') }, tk));
            svg.appendChild(s('rect', { x: padL, y: y + 2, width: Math.max(1, R.pr[i] * sc), height: 8, rx: 2, style: 'fill: var(--surface-3); stroke: var(--line-strong)' }));
            if (!cut) svg.appendChild(s('rect', { x: padL, y: y + 11, width: Math.max(1, R.fin[i] * sc), height: 8, rx: 2, style: 'fill: var(--student)' }));
            svg.appendChild(s('text', { x: padL + Math.max(R.pr[i], R.fin[i]) * sc + 5, y: y + 14, class: 'wa-small wa-mono ' + (cut ? 'wa-tx-muted' : 'wa-tx-s') }, cut ? '✕' : (R.fin[i] * 100).toFixed(1) + '%'));
            if (counts) svg.appendChild(s('text', { x: W - 4, y: y + 15, 'text-anchor': 'end', class: 'wa-small wa-mono wa-tx-t' }, '×' + counts[i]));
          });
          set('n', R.kept.length + ' / ' + TOK.length); set('mass', (R.mass * 100).toFixed(1) + '%'); set('ent', bits(R.fin).toFixed(2) + ' bits'); set('last', last);
          return R;
        }
        function draw1(n) {
          var R = pipeline(T, k, p); counts = counts || TOK.map(function () { return 0; });
          for (var q = 0; q < n; q++) { var u = Math.random(), a = 0, pick = R.kept[0]; for (var j = 0; j < TOK.length; j++) { a += R.fin[j]; if (u < a) { pick = j; break; } } counts[pick]++; last = TOK[pick]; }
          draw();
        }
        function reset() { counts = null; last = '–'; draw(); }
        var tSl = D.slider({ id: 'dt', label: 'Temperature T', label_bn: 'Temperature T', min: 0.05, max: 2, step: 0.05, value: T, format: function (v) { return v.toFixed(2); }, onInput: function (v) { T = v; reset(); } });
        var kSl = D.slider({ id: 'dk', label: 'Top-k', label_bn: 'Top-k', min: 1, max: 10, step: 1, value: k, format: function (v) { return String(v); }, onInput: function (v) { k = v; reset(); } });
        var pSl = D.slider({ id: 'dp', label: 'Top-p', label_bn: 'Top-p', min: 0.1, max: 1, step: 0.05, value: p, format: function (v) { return v.toFixed(2); }, onInput: function (v) { p = v; reset(); } });
        var b1 = btn('Draw 1', '১টা বাছো', function () { draw1(1); }), b2 = btn('Draw 200', '২০০টা বাছো', function () { draw1(200); }), b3 = btn('Greedy (T → 0)', 'Greedy (T → 0)', function () { tSl.set(0.05); });
        w.controls.appendChild(tSl.wrap); w.controls.appendChild(kSl.wrap); w.controls.appendChild(pSl.wrap); w.controls.appendChild(row([b1, b2, b3]));
        var unfit = fit(w.stage, function (cw) { W = cw; draw(); });
        return function () { unfit(); };
      }
    });
  })();

  /* ===== 9. compression-map: stack distil, prune, quantise ===== */
  (function () {
    var BITS = [['16', 'fp16', 16], ['8', 'int8', 8], ['q4', 'Q4_K_M', 5.21], ['4', '4-bit', 4]];
    function gb(params, bitsN) { return params * bitsN / 8 / 1e9; }
    reg('compression-map', {
      title: 'The compression family: distil, prune, quantise', title_bn: 'Compression পরিবার: distil, prune, quantise',
      mount: function (host, ctx) {
        var w = D.shell({ id: 'compression-map', title: this.title, title_bn: this.title_bn, kicker: t('Size = parameters × bits ÷ 8', 'Size = parameter × bit ÷ 8'),
          caption: 'Each technique pulls a different lever. Distillation and pruning cut the number of parameters; quantisation cuts the bits per parameter. Quantising alone cannot rescue a 70B model (about 46 GB at Q4_K_M, 35 GB at a pure 4 bits), so you distil first, then quantise. The scale is logarithmic. My thesis path: 9B fp16 (18 GB) → 2.6B student → Q4_K_M, about 1.7 GB of weights; the shipped file was 1.6 GB.',
          caption_bn: 'প্রতিটা কৌশল আলাদা লিভার টানে। Distillation আর pruning parameter-এর সংখ্যা কমায়; quantisation প্রতি parameter-এর bit কমায়। শুধু quantise করে 70B model বাঁচানো যায় না (Q4_K_M-এ প্রায় 46 GB, শুদ্ধ 4-bit-এ 35 GB), তাই আগে distil, তারপর quantise। স্কেল logarithmic। আমার thesis-এর পথ: 9B fp16 (18 GB) → 2.6B student → Q4_K_M, weight প্রায় 1.7 GB; আসল file 1.6 GB।' });
        host.appendChild(w.root);
        var start = 9, stu = 2.6, prune = 0, bq = 'q4', useD = true, W = 640, BUDGET = 2;
        w.stage.appendChild(legend([['k-teacher', 'Starting model', 'শুরুর model'], ['k-student', 'After each step', 'প্রতি ধাপের পরে'], ['k-gap', 'Phone budget (2 GB)', 'ফোনের budget (2 GB)']]));
        var svg = w.stage.appendChild(svgEl('Log-scale bars showing model size after distillation, pruning and quantisation against a 2 GB phone budget'));
        var set = chips(w.readout, [['final', 'Final size', 'শেষ size'], ['x', 'Smaller by', 'ছোট হলো'], ['fit', 'Fits a 2 GB budget?', '2 GB budget-এ ধরে?']]);
        function draw() {
          var P0 = start * 1e9, P1 = (useD ? Math.min(stu, start) : start) * 1e9, P2 = P1 * (1 - prune / 100), bits = BITS.filter(function (b) { return b[0] === bq; })[0][2];
          var steps = [[t('Start: ' + start + 'B fp16', 'শুরু: ' + start + 'B fp16'), gb(P0, 16)], [t('Distil → ' + (P1 / 1e9).toFixed(1) + 'B', 'Distil → ' + (P1 / 1e9).toFixed(1) + 'B'), gb(P1, 16)],
            [t('Prune ' + prune + '% → ' + (P2 / 1e9).toFixed(2) + 'B', 'Prune ' + prune + '% → ' + (P2 / 1e9).toFixed(2) + 'B'), gb(P2, 16)], [t('Quantise → ' + bq.replace('q4', 'Q4_K_M') + ' (' + bits + ' bit)', 'Quantise → ' + bq.replace('q4', 'Q4_K_M') + ' (' + bits + ' bit)'), gb(P2, bits)]];
          var lo = Math.log10(0.5), hi = Math.log10(200), rowH = 46, top = 8, padR = 74, bw = W - padR - 8, H = top + steps.length * rowH + 22;
          function X(v) { return 8 + Math.max(0, (Math.log10(v) - lo) / (hi - lo)) * bw; }
          svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.textContent = '';
          (W < 480 ? [1, 10, 100] : [1, 2, 5, 10, 20, 50, 100, 200]).forEach(function (v) {
            svg.appendChild(s('line', { x1: X(v), x2: X(v), y1: top, y2: top + steps.length * rowH, class: 'grid' }));
            svg.appendChild(s('text', { x: X(v), y: H - 4, 'text-anchor': 'middle', class: 'wa-small wa-tx-muted wa-mono' }, v + ' GB'));
          });
          svg.appendChild(s('line', { x1: X(BUDGET), x2: X(BUDGET), y1: top - 2, y2: top + steps.length * rowH, style: 'stroke: var(--bad); stroke-width: 2; stroke-dasharray: 4 3' }));
          steps.forEach(function (st, i) {
            var y = top + i * rowH, lab = s('text', { x: 10, y: y + 14, class: 'wa-small wa-tx-fg' });
            Array.prototype.slice.call(st[0].childNodes).forEach(function (c) { lab.appendChild(s('tspan', { class: c.className }, c.textContent + ' ')); });
            svg.appendChild(lab);
            svg.appendChild(s('rect', { x: 8, y: y + 20, width: Math.max(2, X(st[1]) - 8), height: 14, rx: 3, style: i === 0 ? 'fill: var(--teacher)' : 'fill: var(--student)' }));
            svg.appendChild(s('text', { x: X(st[1]) + 6, y: y + 32, class: 'wa-small wa-mono wa-tx-fg' }, st[1] < 10 ? st[1].toFixed(2) : st[1].toFixed(1)));
          });
          var fin = steps[3][1];
          set('final', fin.toFixed(2) + ' GB'); set('x', (steps[0][1] / fin).toFixed(1) + '×'); set('fit', fin <= BUDGET ? '✓' : '✕');
        }
        var sSeg = seg([[9, '9B (my thesis)', '9B (আমার thesis)'], [70, '70B', '70B']], start, function (v) { start = v; stu = v === 9 ? 2.6 : 3; stSl.input.max = String(v === 9 ? 9 : 14); stSl.set(stu); }, 'Starting model');
        var stSl = D.slider({ id: 'cs', label: 'Distilled student size (B params)', label_bn: 'Distilled student-এর size (B param)', min: 0.5, max: 9, step: 0.1, value: stu, format: function (v) { return v.toFixed(1) + 'B'; }, onInput: function (v) { stu = v; draw(); } });
        var dBtn = btn('Distil', 'Distil', function () { useD = !useD; dBtn.setAttribute('aria-pressed', String(useD)); draw(); }, useD);
        var pSl = D.slider({ id: 'cp', label: 'Prune (structured)', label_bn: 'Prune (structured)', min: 0, max: 50, step: 5, value: prune, format: function (v) { return v + '%'; }, onInput: function (v) { prune = v; draw(); } });
        var qSeg = seg(BITS.map(function (b) { return [b[0], b[1], null]; }), bq, function (v) { bq = v; draw(); }, 'Precision');
        w.controls.appendChild(row([h('span', { class: 'w-label' }, t('Start:', 'শুরু:')), sSeg.el, dBtn])); w.controls.appendChild(stSl.wrap); w.controls.appendChild(pSl.wrap); w.controls.appendChild(row([h('span', { class: 'w-label' }, t('Precision:', 'Precision:')), qSeg.el]));
        var unfit = fit(w.stage, function (cw) { W = cw; draw(); });
        return function () { unfit(); };
      }
    });
  })();

  /* ===== 10. memory-calc: where the GPU memory goes ===== */
  (function () {
    // [name, params (B), layers, kv dim (kv heads x head dim)] from public model configs; approximate
    var MODELS = [['2b', 'Gemma-2 2B (my student)', 'Gemma-2 2B (আমার student)', 2.6, 26, 1024], ['9b', 'Gemma-2 9B (my teacher)', 'Gemma-2 9B (আমার teacher)', 9.2, 42, 2048], ['7b', '7B (MHA)', '7B (MHA)', 7, 32, 4096], ['70b', '70B (GQA)', '70B (GQA)', 70, 80, 1024]];
    var MODES = [['inf', 'Inference', 'Inference'], ['lora', 'LoRA', 'LoRA'], ['qlora', 'QLoRA', 'QLoRA'], ['full', 'Full fine-tune', 'Full fine-tune']];
    var COLS = [['weights', 'Weights', 'Weight', '--c1'], ['grads', 'Gradients', 'Gradient', '--c3'], ['opt', 'Optimiser states', 'Optimiser state', '--c4'], ['kv', 'KV cache', 'KV cache', '--c5']];
    reg('memory-calc', {
      title: 'GPU memory maths', title_bn: 'GPU memory-র হিসাব',
      mount: function (host, ctx) {
        var w = D.shell({ id: 'memory-calc', title: this.title, title_bn: this.title_bn, kicker: t('Rules of thumb', 'মোটামুটি নিয়ম'),
          caption: 'Weights = parameters × bytes (fp16 2, int8 1, 4-bit 0.5). Full fine-tuning with AdamW in mixed precision is about 16 bytes per parameter (fp16 weights 2 + gradients 2 + fp32 master copy 4 + Adam moments 8); 2.6B × 16 B = 41.6 GB, far above my 16 GB card. LoRA trains only a small adapter (simplified here as 12 bytes per adapter parameter); QLoRA also stores the frozen base in 4-bit. The KV cache grows with batch × sequence × layers. Activations and framework overhead are not included, so real usage is higher.',
          caption_bn: 'Weight = parameter × byte (fp16 2, int8 1, 4-bit 0.5)। AdamW + mixed precision-এ full fine-tuning প্রায় 16 byte প্রতি parameter (fp16 weight 2 + gradient 2 + fp32 master copy 4 + Adam moment 8); 2.6B × 16 B = 41.6 GB, আমার 16 GB card-এর অনেক বেশি। LoRA শুধু ছোট adapter train করে (এখানে সরলভাবে adapter-parameter প্রতি 12 byte); QLoRA frozen base-কে 4-bit-এ রাখে। KV cache বাড়ে batch × sequence × layer-এর সাথে। Activation আর framework-এর বাড়তি খরচ ধরা হয়নি, তাই আসল ব্যবহার বেশি।' });
        host.appendChild(w.root);
        var mi = 0, P = MODELS[0][3], mode = 'full', wb = 16, seq = 2048, batch = 1, frac = 1.5, W = 640, GPUS = [[16, '16 GB'], [24, '24 GB'], [80, '80 GB']];
        w.stage.appendChild(h('div', { class: 'wa-legend' }, COLS.map(function (c) { return h('span', { class: 'wa-lg' }, [h('i', { class: 'wa-key', style: 'background: var(' + c[3] + ')', 'aria-hidden': 'true' }), t(c[1], c[2])]); })));
        var svg = w.stage.appendChild(svgEl('Stacked bar of weights, gradients, optimiser states and KV cache memory against 16, 24 and 80 GB GPU limits'));
        var set = chips(w.readout, [['tot', 'Total', 'মোট'], ['pp', 'Bytes per parameter', 'প্রতি parameter byte'], ['fit', 'Fits 16 GB?', '16 GB-এ ধরে?']]);
        function calc() {
          var Pn = P * 1e9, m = MODELS[mi], g = 1e9, o = { weights: 0, grads: 0, opt: 0, kv: 0 };
          if (mode === 'inf') o.weights = Pn * wb / 8;
          else if (mode === 'full') { o.weights = Pn * 2; o.grads = Pn * 2; o.opt = Pn * 12; }   // fp32 master 4 + Adam 8
          else { var ad = Pn * frac / 100; o.weights = Pn * (mode === 'qlora' ? 0.5 : 2) + ad * 2; o.grads = ad * 2; o.opt = ad * 8; }
          o.kv = 2 * m[4] * m[5] * seq * batch * 2 * (P / m[3]);   // 2 (K,V) x layers x kv dim x tokens x 2 bytes; scaled if params edited
          Object.keys(o).forEach(function (k) { o[k] /= g; });
          return o;
        }
        function draw() {
          var o = calc(), tot = o.weights + o.grads + o.opt + o.kv, axis = Math.max(tot * 1.08, 20), pad = 8, bw = W - 2 * pad, H = 128;
          function X(v) { return pad + v / axis * bw; }
          svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.textContent = '';
          var ticks = axis > 400 ? [100, 400, 1000] : axis > 120 ? [50, 100, 200, 400] : axis > 50 ? [20, 40, 60, 80, 100] : [0, 10, 20, 30, 40, 50];
          ticks.forEach(function (v) { if (v <= axis) { svg.appendChild(s('line', { x1: X(v), x2: X(v), y1: 26, y2: 74, class: 'grid' })); svg.appendChild(s('text', { x: X(v), y: 90, 'text-anchor': 'middle', class: 'wa-small wa-tx-muted wa-mono' }, v)); } });
          var x = pad;
          COLS.forEach(function (c) { var v = o[c[0]]; if (v <= 0) return; var wd = v / axis * bw; svg.appendChild(s('rect', { x: x, y: 30, width: Math.max(1, wd), height: 32, style: 'fill: var(' + c[3] + ')', 'stroke': 'var(--surface)', 'stroke-width': 1 })); x += wd; });
          GPUS.forEach(function (g, i) { if (g[0] > axis) return; svg.appendChild(s('line', { x1: X(g[0]), x2: X(g[0]), y1: 26, y2: 74, style: 'stroke: var(--bad); stroke-width: 2; stroke-dasharray: 4 3' })); svg.appendChild(s('text', { x: X(g[0]) - 3, y: 11 + (i % 2) * 11, 'text-anchor': 'end', class: 'wa-small wa-tx-bad wa-b' }, g[1])); });
          svg.appendChild(stx(pad, 112, 'GB (weights, gradients, optimiser, KV cache; no activations)', 'GB (weight, gradient, optimiser, KV cache; activation ছাড়া)', { class: 'wa-small wa-tx-muted' }));
          set('tot', tot.toFixed(tot < 10 ? 2 : 1) + ' GB'); set('pp', (tot * 1e9 / (P * 1e9)).toFixed(2) + ' B'); set('fit', tot <= 16 ? '✓' : '✕');
        }
        var mSeg = seg(MODELS.map(function (m, i) { return [i, m[1], m[2]]; }), mi, function (v) { mi = v; pSl.set(MODELS[v][3]); }, 'Model');
        var pSl = D.slider({ id: 'mp', label: 'Parameters (billions)', label_bn: 'Parameter (billion)', min: 0.5, max: 80, step: 0.1, value: P, format: function (v) { return v.toFixed(1) + 'B'; }, onInput: function (v) { P = v; draw(); } });
        var moSeg = seg(MODES.map(function (m) { return [m[0], m[1], m[2]]; }), mode, function (v) { mode = v; wSeg.btns.forEach(function (b) { b.disabled = v !== 'inf'; }); draw(); }, 'Mode');
        var wSeg = seg([[16, 'fp16', null], [8, 'int8', null], [4, '4-bit', null]], wb, function (v) { wb = v; draw(); }, 'Weight precision (inference)');
        wSeg.btns.forEach(function (b) { b.disabled = true; });
        var sSl = D.slider({ id: 'ms', label: 'Sequence length', label_bn: 'Sequence-এর দৈর্ঘ্য', min: 128, max: 8192, step: 128, value: seq, format: function (v) { return String(v); }, onInput: function (v) { seq = v; draw(); } });
        var bSl = D.slider({ id: 'mb', label: 'Batch size', label_bn: 'Batch size', min: 1, max: 32, step: 1, value: batch, format: function (v) { return String(v); }, onInput: function (v) { batch = v; draw(); } });
        var fSl = D.slider({ id: 'mf', label: 'LoRA trainable share', label_bn: 'LoRA-র trainable অংশ', min: 0.2, max: 5, step: 0.1, value: frac, format: function (v) { return v.toFixed(1) + '%'; }, onInput: function (v) { frac = v; draw(); } });
        w.controls.appendChild(row([mSeg.el])); w.controls.appendChild(pSl.wrap); w.controls.appendChild(row([moSeg.el, wSeg.el])); w.controls.appendChild(sSl.wrap); w.controls.appendChild(bSl.wrap); w.controls.appendChild(fSl.wrap);
        var unfit = fit(w.stage, function (cw) { W = cw; draw(); });
        return function () { unfit(); };
      }
    });
  })();

  /* ===== 11. thesis-journey: ROUGE-L from Approach 1 to the final model ===== */
  (function () {
    // [label, ROUGE-L, status, EN, BN]  (values from my thesis notes; Approaches 1 and 2 are about 0.20)
    var ST = [
      ['A1', 0.20, 'fail', 'Approach 1: plain CE on 27B teacher final answers (~6,000 examples). ROUGE-L about 0.20. Copying text alone was not enough.', 'Approach 1: 27B teacher-এর final উত্তরে শুধু CE (~6,000)। ROUGE-L প্রায় 0.20। শুধু text কপি করা যথেষ্ট ছিল না।'],
      ['A2', 0.2006, 'fail', 'Approach 2: CE on chain-of-thought answers, rank sweep 8/16/32. 0.2006. Rank 32 took 12× longer with no gain.', 'Approach 2: chain-of-thought উত্তরে CE, rank 8/16/32। 0.2006। Rank 32 12 গুণ সময় নিল, লাভ নেই।'],
      ['S1', 0.3935, 'ok', 'First SeqKD: 9B teacher, top-50 logits at T = 4, two-phase curriculum, 2,806 examples; benchmark prompt aligned with the training prompt. 0.3935.', 'প্রথম SeqKD: 9B teacher, top-50 logit (T = 4), দুই-phase curriculum, 2,806 উদাহরণ; benchmark prompt training-এর সাথে মেলানো। 0.3935।'],
      ['S2', 0.4238, 'ok', 'Fix: 3 retrieved chunks with source headers in data generation, and the full response stored so CE and KL align. 0.4238.', 'Fix: data তৈরিতে 3টা chunk source header সহ, আর পুরো response save যাতে CE ও KL মেলে। 0.4238।'],
      ['S3', 0.4129, 'bad', 'Stage 3: rank 32 but a frozen adapter, grad_norm = 0 for 314 steps. 0.4129, lower than r = 16. Discarded.', 'Stage 3: rank 32 কিন্তু adapter frozen, 314 step grad_norm = 0। 0.4129, r = 16-এর চেয়ে কম। বাদ।'],
      ['S4', 0.4422, 'ok', 'Stage 4: bug fixed (prepare_model_for_kbit_training, is_trainable=True), 5,710 examples, r = 32, KL weight 0.4. 0.4422.', 'Stage 4: bug ঠিক, 5,710 উদাহরণ, r = 32, KL 0.4। 0.4422।'],
      ['S5', 0.4324, 'abl', 'Stage 5: KL weight 0.5, all else equal. 0.4324, worse than 0.4422. So 0.4 it is.', 'Stage 5: KL weight 0.5, বাকি সব এক। 0.4324, খারাপ। তাই 0.4।'],
      ['S7', 0.4595, 'ok', 'Stage 7: full 9,429 examples plus the upgraded retrieval. 0.4595.', 'Stage 7: পুরো 9,429 উদাহরণ আর উন্নত retrieval। 0.4595।'],
      ['S8', 0.4438, 'bad', 'Stage 8: 256-token chunks (49,806 chunks), retrained. 0.4438. Reverted.', 'Stage 8: 256-token chunk (49,806টা), আবার train। 0.4438। বাতিল।'],
      ['7R', 0.4715, 'final', 'Stage 7R (final): the Stage 7 model re-benchmarked on the rebuilt 450-token sentence-aware corpus (36,029 chunks). ROUGE-L 0.4715, BLEU 0.2551, BERTScore 0.5679.', 'Stage 7R (final): Stage 7-এর model নতুন 450-token sentence-aware corpus-এ (36,029 chunk) আবার মাপা। ROUGE-L 0.4715।'],
      ['S9', 0.4397, 'bad', 'Stage 9: an extra KL-only phase. 0.4397, regressed. Dropped.', 'Stage 9: বাড়তি KL-only phase। 0.4397, খারাপ। বাদ।']
    ];
    var BASE = 0.2323, CLR = { fail: 'var(--muted)', ok: 'var(--student)', bad: 'var(--bad)', abl: 'var(--c3)', final: 'var(--good)' };
    reg('thesis-journey', {
      title: 'My thesis journey: ROUGE-L by stage', title_bn: 'আমার thesis-এর যাত্রা: stage অনুযায়ী ROUGE-L',
      mount: function (host, ctx) {
        var w = D.shell({ id: 'thesis-journey', title: this.title, title_bn: this.title_bn, kicker: t('My results', 'আমার ফলাফল'),
          caption: 'ROUGE-L on the same 50 test questions for each stage, from my thesis notes (Approaches 1 and 2 are given as about 0.20). The dashed line is the undistilled 2B student with the same retrieval (0.2323). Red bars were dropped or reverted. Note: the stage results are N = 50 single runs, so small gaps are within noise.',
          caption_bn: 'প্রতিটা stage-এর একই 50টা test প্রশ্নে ROUGE-L, আমার thesis notes থেকে (Approach 1 আর 2 প্রায় 0.20)। ডটেড লাইন হলো distill না করা 2B student, একই retrieval সহ (0.2323)। লাল bar বাদ বা বাতিল হয়েছে। মনে রেখো: প্রতি stage N = 50-এর একটাই run, তাই ছোট তফাত noise-এর মধ্যে।' });
        host.appendChild(w.root);
        var sel = ST.length - 2, W = 640;
        w.stage.appendChild(h('div', { class: 'wa-legend' }, [['--muted', 'Plain CE (stalled)', 'শুধু CE (আটকে গেল)'], ['--student', 'Kept', 'রাখা হলো'], ['--c3', 'Ablation', 'Ablation'], ['--bad', 'Dropped or reverted', 'বাদ বা বাতিল'], ['--good', 'Final', 'Final']].map(function (c) { return h('span', { class: 'wa-lg' }, [h('i', { class: 'wa-key', style: 'background: var(' + c[0] + ')', 'aria-hidden': 'true' }), t(c[1], c[2])]); })));
        var svg = w.stage.appendChild(svgEl('Bar chart of ROUGE-L for each experiment stage from Approach 1 to the final model'));
        var note = h('div', { class: 'wa-prompt', 'aria-live': 'polite' });
        w.stage.appendChild(note);
        var set = chips(w.readout, [['st', 'Stage', 'Stage'], ['v', 'ROUGE-L', 'ROUGE-L'], ['d', 'vs undistilled 0.2323', 'distill-না-করা 0.2323-এর তুলনায়']]);
        function draw() {
          var n = ST.length, padL = 34, padB = 22, top = 10, H = 200, plotH = H - top - padB, cw = (W - padL - 6) / n;
          function Y(v) { return top + plotH - v / 0.5 * plotH; }
          svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.textContent = '';
          [0, 0.1, 0.2, 0.3, 0.4, 0.5].forEach(function (v) {
            svg.appendChild(s('line', { x1: padL, x2: W - 4, y1: Y(v), y2: Y(v), class: v === 0 ? 'axis' : 'grid' }));
            svg.appendChild(s('text', { x: padL - 5, y: Y(v) + 4, 'text-anchor': 'end', class: 'wa-small wa-tx-muted wa-mono' }, v.toFixed(1)));
          });
          ST.forEach(function (st, i) {
            var x = padL + i * cw + cw * 0.14, bw = cw * 0.72, on = i === sel;
            var g = s('g', { tabindex: 0, role: 'button', 'aria-label': st[0] + ' ' + st[1], style: 'cursor: pointer; outline-offset: 2px' });
            g.appendChild(s('rect', { x: padL + i * cw, y: top, width: cw, height: plotH + padB, fill: 'transparent' }));
            g.appendChild(s('rect', { x: x, y: Y(st[1]), width: bw, height: Y(0) - Y(st[1]), rx: 2, style: 'fill: ' + CLR[st[2]] + (on ? '' : '; fill-opacity: 0.55'), stroke: on ? 'var(--fg)' : 'none', 'stroke-width': on ? 2 : 0 }));
            g.appendChild(s('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle', class: 'wa-small ' + (on ? 'wa-b wa-tx-fg' : 'wa-tx-muted') }, st[0]));
            g.addEventListener('click', function () { pick(i); });
            g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i); } });
            svg.appendChild(g);
          });
          svg.appendChild(s('line', { x1: padL, x2: W - 4, y1: Y(BASE), y2: Y(BASE), style: 'stroke: var(--teacher); stroke-width: 2; stroke-dasharray: 5 4' }));
          svg.appendChild(stx(padL + 4, Y(BASE) - 5, 'undistilled 0.2323', 'distill-ছাড়া 0.2323', { class: 'wa-small wa-tx-t wa-b' }));
          var st = ST[sel];
          note.textContent = ''; note.appendChild(h('span', { class: 'l-en' }, st[3])); note.appendChild(h('span', { class: 'l-bn' }, st[4]));
          set('st', st[0]); set('v', st[1].toFixed(4)); set('d', (st[1] >= BASE ? '+' : '−') + Math.abs(st[1] / BASE * 100 - 100).toFixed(0) + '%');
        }
        function pick(i) { sel = i; draw(); }
        var pl = player({ interval: 1300, live: w.readout, step: function () { sel = (sel + 1) % ST.length; draw(); if (sel === ST.length - 1) return false; }, reset: function () { sel = 0; draw(); } });
        w.controls.appendChild(row(pl.els));
        var unfit = fit(w.stage, function (cw) { W = cw; draw(); });
        return function () { unfit(); pl.destroy(); };
      }
    });
  })();

  /* @@NEXT */
})();
