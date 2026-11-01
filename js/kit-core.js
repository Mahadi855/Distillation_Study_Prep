/* kit-core.js: widget registry + tiny DOM helpers shared by the app and all widgets. No dependencies. */
(function () {
  'use strict';
  var KIT = (window.KIT = window.KIT || {});
  var SVGNS = 'http://www.w3.org/2000/svg';

  /** h('div', {class:'x', onclick: fn}, [children]) creates an HTML element. */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    applyAttrs(el, attrs);
    append(el, children);
    return el;
  }
  /** s('rect', {x:0, y:0, width:10, height:10, class:'f-student'}) creates an SVG element. */
  function s(tag, attrs, children) {
    var el = document.createElementNS(SVGNS, tag);
    applyAttrs(el, attrs);
    append(el, children);
    return el;
  }
  function applyAttrs(el, attrs) {
    if (!attrs) return;
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : String(v));
    });
  }
  function append(el, children) {
    if (children === undefined || children === null) return;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (c) {
      if (c === undefined || c === null || c === false) return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
  }
  /** t('Teacher', 'টিচার') returns a fragment with both language spans; CSS hides one per the language toggle. */
  function t(en, bn, tag) {
    tag = tag || 'span';
    var frag = document.createDocumentFragment();
    frag.appendChild(h(tag, { class: 'l-en', lang: 'en' }, en));
    if (bn) {
      if (tag === 'span') frag.appendChild(document.createTextNode(' '));
      frag.appendChild(h(tag, { class: 'l-bn', lang: 'bn' }, bn));
    }
    return frag;
  }
  /** Standard widget shell: returns {root, stage, controls, readout, caption}. */
  function shell(opts) {
    var root = h('figure', { class: 'widget w-' + opts.id, role: 'group', 'aria-label': opts.title });
    var head = h('div', { class: 'w-head' }, [
      h('div', { class: 'w-title' }, t(opts.title, opts.title_bn)),
      h('div', { class: 'w-kicker' }, opts.kicker || 'Interactive')
    ]);
    var stage = h('div', { class: 'w-stage' });
    var controls = h('div', { class: 'w-controls' });
    var readout = h('div', { class: 'w-readout', 'aria-live': 'polite' });
    var caption = h('figcaption', { class: 'w-caption' });
    if (opts.caption) caption.appendChild(t(opts.caption, opts.caption_bn, 'div'));
    root.append(head, stage, controls, readout, caption);
    return { root: root, stage: stage, controls: controls, readout: readout, caption: caption };
  }
  /** Labelled range slider. onInput(valueNumber). Returns {wrap, input, set(v)}. */
  function slider(o) {
    var id = 'w-' + o.id + '-' + Math.random().toString(36).slice(2, 7);
    var out = h('output', { for: id, class: 'mono' });
    var input = h('input', { type: 'range', id: id, min: o.min, max: o.max, step: o.step || 1, value: o.value });
    var label = h('label', { for: id }, [t(o.label, o.label_bn), ': ', out]);
    function fmt(v) { return o.format ? o.format(v) : String(v); }
    function update() { var v = parseFloat(input.value); out.textContent = fmt(v); if (o.onInput) o.onInput(v); }
    input.addEventListener('input', update);
    var wrap = h('div', { class: 'w-control' }, [label, input]);
    out.textContent = fmt(parseFloat(o.value));
    return { wrap: wrap, input: input, set: function (v) { input.value = v; update(); } };
  }
  /** Toggle/segmented button. */
  function button(label, label_bn, onClick, pressed) {
    var b = h('button', { type: 'button', class: 'w-btn', onclick: onClick }, t(label, label_bn));
    if (pressed !== undefined) b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    return b;
  }
  function chip(labelHtml) { return h('span', { class: 'w-chip', html: labelHtml }); }
  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  /** rAF loop helper with pause/resume; returns {start, stop, running}. step(dtSeconds) returns false to stop. */
  function loop(step) {
    var id = null, last = 0, running = false;
    function frame(ts) {
      if (!running) return;
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
      last = ts;
      if (step(dt) === false) { running = false; return; }
      id = requestAnimationFrame(frame);
    }
    return {
      start: function () { if (running) return; running = true; last = 0; id = requestAnimationFrame(frame); },
      stop: function () { running = false; if (id) cancelAnimationFrame(id); },
      running: function () { return running; }
    };
  }

  var registry = {};
  KIT.widgets = {
    registry: registry,
    /** register('temperature-slider', {title, title_bn, mount(el, ctx) -> optional cleanup fn}) */
    register: function (id, def) { def.id = id; registry[id] = def; },
    list: function () { return Object.keys(registry); },
    /** mount a widget into host element; returns cleanup fn. Errors are contained per widget. */
    mount: function (id, host, ctx) {
      var def = registry[id];
      if (!def) { host.appendChild(h('div', { class: 'w-note' }, 'Interactive "' + id + '" will be added later.')); return function () {}; }
      try {
        var cleanup = def.mount(host, Object.assign({ reducedMotion: reducedMotion() }, ctx || {}));
        return typeof cleanup === 'function' ? cleanup : function () {};
      } catch (e) {
        console.error('[widget ' + id + ']', e);
        host.appendChild(h('div', { class: 'w-note' }, 'This interactive failed to load.'));
        return function () {};
      }
    }
  };
  KIT.dom = { h: h, s: s, t: t, shell: shell, slider: slider, button: button, chip: chip, loop: loop, reducedMotion: reducedMotion };
})();
