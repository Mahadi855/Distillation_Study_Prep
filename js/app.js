/* app.js: Distillation Viva Kit single-page app. Works from file:// (no fetch); content arrives via <script> data files. */
(function () {
  'use strict';
  var D = window.KIT_DATA || { modules: [], topics: {}, search: [], questions: [], glossary: [], stats: {} };
  var PAGES = window.KIT_PAGES || {};
  var h = KIT.dom.h;
  var root = document.documentElement;
  var view = document.getElementById('view');
  var mainEl = document.getElementById('main');
  var sidebar = document.getElementById('sidebar');
  var LABELS = {
    used: ["What it's used for", 'কী কাজে লাগে'], how: ['How it works', 'কীভাবে কাজ করে'], deeper: ['Go deeper', 'আরেকটু গভীরে'],
    equation: ['The maths', 'গণিত'], widgets: ['Try it yourself', 'নিজে চালিয়ে দেখো'], diagram: ['Diagram', 'ডায়াগ্রাম'],
    variants: ['Variants & latest options', 'ভ্যারিয়েন্ট ও সর্বশেষ অপশন'], code: ['Code', 'কোড'], thesis: ['In my thesis', 'আমার থিসিসে'],
    questions: ['Likely viva questions', 'সম্ভাব্য ভাইভা প্রশ্ন'], traps: ['Traps & confusions', 'ভুল বোঝার ফাঁদ']
  };
  var NAV_PAGES = [
    ['home', 'Home', 'হোম'], ['journey', 'Thesis journey', 'থিসিসের যাত্রা'], ['cheatsheet', 'Cheat sheet', 'চিট শিট'],
    ['study-plans', 'Study plans', 'পড়ার প্ল্যান'], ['flashcards', 'Viva flashcards', 'ফ্ল্যাশকার্ড'], ['glossary', 'Glossary', 'শব্দকোষ'],
    ['models', 'Model tables', 'মডেল টেবিল'], ['sources', 'Sources', 'সূত্র']
  ];

  // ---------- storage (per-viewer conveniences only) ----------
  var KEY = 'dvk:v1';
  var store = { learned: {}, cards: {}, prefs: {} };
  try { var raw = localStorage.getItem(KEY); if (raw) { var p = JSON.parse(raw); store.learned = p.learned || {}; store.cards = p.cards || {}; store.prefs = p.prefs || {}; } } catch (e) { /* storage unavailable */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } }

  // ---------- prefs: language, theme, stars ----------
  function setLang(l) {
    root.setAttribute('data-lang', l); store.prefs.lang = l; save();
    document.querySelectorAll('.seg button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-lang') === l ? 'true' : 'false'); });
  }
  var themeBtn = document.getElementById('themeBtn');
  function setTheme(t) {
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
    store.prefs.theme = t || 'system'; save();
    var label = { light: 'Light', dark: 'Dark', system: 'Auto' }[store.prefs.theme];
    themeBtn.querySelector('span').textContent = label;
    themeBtn.setAttribute('aria-label', 'Colour theme: ' + label + '. Click to change.');
  }
  var starBtn = document.getElementById('starBtn');
  function setStars(on) {
    root.classList.toggle('stars-only', !!on); store.prefs.starsOnly = !!on; save();
    starBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  document.querySelectorAll('.seg button').forEach(function (b) { b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); }); });
  themeBtn.addEventListener('click', function () {
    var order = ['system', 'light', 'dark']; var i = order.indexOf(store.prefs.theme || 'system');
    setTheme(order[(i + 1) % 3]);
  });
  starBtn.addEventListener('click', function () { setStars(!root.classList.contains('stars-only')); route(); });
  setLang(store.prefs.lang || 'both');
  setTheme(store.prefs.theme || 'system');
  setStars(!!store.prefs.starsOnly);

  // ---------- helpers ----------
  function T(en, bn) { return KIT.dom.t(en, bn); }
  function html(s) { var d = h('div'); d.innerHTML = s || ''; return d; }
  function starsTxt(n) { return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n); }
  function modOf(id) { for (var i = 0; i < D.modules.length; i++) if (D.modules[i].id === id) return D.modules[i]; return null; }
  function visibleTopics(mod) { return mod.topics.filter(function (id) { return !root.classList.contains('stars-only') || (D.topics[id] && D.topics[id].stars === 3); }); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function modCode(id) { return id.toUpperCase(); }

  // ---------- lazy module data ----------
  var modCache = {}, modWait = {};
  window.KIT_LOAD = function (id, data) { modCache[id] = data; (modWait[id] || []).forEach(function (f) { f(data); }); delete modWait[id]; };
  function loadModule(id) {
    return new Promise(function (resolve, reject) {
      if (modCache[id]) return resolve(modCache[id]);
      var first = !modWait[id];
      (modWait[id] = modWait[id] || []).push(resolve);
      if (!first) return;
      var s = document.createElement('script'); s.src = 'data/m-' + id + '.js'; s.async = true;
      s.onerror = function () { reject(new Error('Could not load module ' + id)); };
      document.head.appendChild(s);
    });
  }

  // ---------- sidebar ----------
  var openMods = store.prefs.openMods || {};
  function buildSidebar() {
    sidebar.innerHTML = '';
    var pg = h('div', { class: 'nav-group' }, [h('div', { class: 'nav-h' }, 'Pages')]);
    NAV_PAGES.forEach(function (p) {
      if (p[0] !== 'home' && p[0] !== 'journey' && p[0] !== 'flashcards' && p[0] !== 'glossary' && !PAGES[p[0]]) return;
      pg.appendChild(h('a', { class: 'nav-link', href: '#p-' + p[0], 'data-route': 'p-' + p[0] }, T(p[1], p[2])));
    });
    sidebar.appendChild(pg);
    var mg = h('div', { class: 'nav-group' }, [h('div', { class: 'nav-h' }, 'Modules')]);
    D.modules.forEach(function (m) {
      var done = m.topics.filter(function (id) { return store.learned[id]; }).length;
      var isGloss = m.id === 'm16' && !m.topics.length;
      var list = h('div', { class: 'mod-list', id: 'ml-' + m.id });
      m.topics.forEach(function (id) {
        var t = D.topics[id];
        list.appendChild(h('a', { class: 'tlink' + (store.learned[id] ? ' done' : ''), href: '#t-' + id, 'data-route': 't-' + id, 'data-stars': t.stars }, [
          h('span', { class: 'chk', 'aria-hidden': 'true' }), h('span', null, t.title), h('span', { class: 'st', 'aria-label': t.stars + ' stars' }, '★'.repeat(t.stars))
        ]));
      });
      var open = !!openMods[m.id];
      list.hidden = !open;
      var btn = h('button', { type: 'button', class: 'mod-btn', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': 'ml-' + m.id }, [
        h('span', { class: 'mod-code' }, modCode(m.id)), h('span', { class: 'mod-title' }, m.title),
        h('span', { class: 'mod-prog' }, isGloss ? '' : done + '/' + m.topics.length)
      ]);
      btn.addEventListener('click', function () {
        if (isGloss) { location.hash = '#p-glossary'; return; }
        var o = list.hidden; list.hidden = !o; btn.setAttribute('aria-expanded', o ? 'true' : 'false');
        openMods[m.id] = o; store.prefs.openMods = openMods; save();
      });
      var modLink = h('a', { class: 'nav-link', href: '#m-' + m.id, 'data-route': 'm-' + m.id, style: { display: 'none' } });
      mg.appendChild(h('div', { class: 'mod' }, [btn, modLink, list]));
    });
    sidebar.appendChild(mg);
  }
  function markActive(key) {
    sidebar.querySelectorAll('[aria-current]').forEach(function (a) { a.removeAttribute('aria-current'); });
    var a = sidebar.querySelector('[data-route="' + key + '"]');
    if (a) {
      a.setAttribute('aria-current', 'page');
      var list = a.closest('.mod-list');
      if (list && list.hidden) { list.hidden = false; var b = list.parentNode.querySelector('.mod-btn'); if (b) b.setAttribute('aria-expanded', 'true'); }
      if (a.scrollIntoView && !isMobile()) { var r = a.getBoundingClientRect(), sr = sidebar.getBoundingClientRect(); if (r.top < sr.top || r.bottom > sr.bottom) a.scrollIntoView({ block: 'center' }); }
    }
  }
  function refreshLearned(id) {
    var on = !!store.learned[id];
    document.querySelectorAll('[data-route="t-' + id + '"]').forEach(function (a) { a.classList.toggle('done', on); });
    D.modules.forEach(function (m) {
      if (m.topics.indexOf(id) < 0) return;
      var done = m.topics.filter(function (x) { return store.learned[x]; }).length;
      var b = sidebar.querySelector('[aria-controls="ml-' + m.id + '"] .mod-prog'); if (b) b.textContent = done + '/' + m.topics.length;
    });
  }

  // mobile drawer
  var menuBtn = document.getElementById('menuBtn'), scrim = document.getElementById('scrim');
  function isMobile() { return window.matchMedia('(max-width: 980px)').matches; }
  function drawer(open) {
    sidebar.classList.toggle('open', open); scrim.hidden = !open; menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { var a = sidebar.querySelector('[aria-current]') || sidebar.querySelector('a'); if (a) a.focus(); }
  }
  menuBtn.addEventListener('click', function () { drawer(!sidebar.classList.contains('open')); });
  scrim.addEventListener('click', function () { drawer(false); });
  sidebar.addEventListener('click', function (e) { if (e.target.closest('a') && isMobile()) drawer(false); });

  // ---------- search ----------
  var q = document.getElementById('q'), results = document.getElementById('results');
  var IDX = D.search.map(function (s) {
    return { id: s.id, t: s.t, tb: s.tb, title: (s.t + ' ' + s.tb).toLowerCase(), tags: (s.g || '').toLowerCase(), body: ((s.x || '') + ' ' + (s.xb || '')).toLowerCase(), raw: (s.x || '') + ' ' + (s.xb || '') };
  });
  var GIDX = D.glossary.map(function (g) { return { g: g, k: (g.term + ' ' + g.bn).toLowerCase() }; });
  function lev1(a, b) { // true if edit distance <= 1
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }
  function doSearch(str) {
    var s = str.trim().toLowerCase(); if (s.length < 2) return [];
    var toks = s.split(/\s+/).filter(Boolean);
    var out = [];
    IDX.forEach(function (it) {
      var score = 0;
      for (var k = 0; k < toks.length; k++) {
        var tk = toks[k];
        if (it.title.indexOf(tk) >= 0) score += it.title.indexOf(tk) === 0 ? 14 : 10;
        else if (it.tags.indexOf(tk) >= 0) score += 6;
        else if (it.body.indexOf(tk) >= 0) score += 2;
        else if (tk.length > 3 && it.title.split(/[^a-z0-9ঀ-৿]+/).some(function (w) { return lev1(w, tk); })) score += 4;
        else return;
      }
      if (D.topics[it.id]) score += D.topics[it.id].stars * 0.5;
      out.push({ kind: 'topic', it: it, score: score });
    });
    GIDX.forEach(function (gi) { if (toks.every(function (tk) { return gi.k.indexOf(tk) >= 0; })) out.push({ kind: 'gloss', g: gi.g, score: 7 }); });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, 14);
  }
  function snippet(raw, tok) {
    var i = raw.toLowerCase().indexOf(tok); if (i < 0) return raw.slice(0, 120);
    return (i > 40 ? '…' : '') + raw.slice(Math.max(0, i - 40), i + 90) + '…';
  }
  var sel = -1;
  function renderResults() {
    var list = doSearch(q.value); results.innerHTML = ''; sel = -1;
    if (q.value.trim().length < 2) { results.hidden = true; return; }
    if (!list.length) { results.appendChild(h('div', { class: 'res-empty' }, 'No matches. Try a shorter word, e.g. "KL" or "LoRA".')); results.hidden = false; return; }
    var first = q.value.trim().toLowerCase().split(/\s+/)[0];
    list.forEach(function (r) {
      var a;
      if (r.kind === 'topic') {
        var t = D.topics[r.it.id];
        a = h('a', { class: 'res', href: '#t-' + r.it.id, role: 'option' }, [
          h('span', { class: 'res-t' }, [h('span', null, r.it.t), h('span', { class: 'res-m' }, (t ? modCode(t.m) + ' · ' + starsTxt(t.stars) : ''))]),
          r.it.tb ? h('span', { class: 'res-s l-bn', lang: 'bn' }, r.it.tb) : null,
          h('span', { class: 'res-s' }, snippet(r.it.raw, first))
        ]);
      } else {
        a = h('a', { class: 'res', href: r.g.topic ? '#t-' + r.g.topic : '#p-glossary', role: 'option' }, [
          h('span', { class: 'res-t' }, [h('span', null, r.g.term), h('span', { class: 'res-m' }, 'GLOSSARY')]),
          h('span', { class: 'res-s', html: r.g.en })
        ]);
      }
      a.addEventListener('click', closeResults);
      results.appendChild(a);
    });
    results.hidden = false;
  }
  function closeResults() { results.hidden = true; }
  q.addEventListener('input', renderResults);
  q.addEventListener('focus', function () { if (q.value.trim().length >= 2) renderResults(); });
  q.addEventListener('keydown', function (e) {
    var items = results.querySelectorAll('.res');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (!items.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach(function (x, i) { x.setAttribute('aria-selected', i === sel ? 'true' : 'false'); });
      items[sel].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      var target = items[sel >= 0 ? sel : 0]; if (target) { location.hash = target.getAttribute('href'); closeResults(); q.blur(); }
    } else if (e.key === 'Escape') { closeResults(); q.blur(); }
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.search')) closeResults(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
    if (e.key === 'Escape' && sidebar.classList.contains('open')) drawer(false);
  });

  // ---------- global delegated behaviours ----------
  document.addEventListener('click', function (e) {
    var cb = e.target.closest('.copy-btn');
    if (cb) {
      var code = cb.closest('.code-wrap').querySelector('code');
      var done = function () { cb.textContent = 'Copied'; setTimeout(function () { cb.textContent = 'Copy'; }, 1400); };
      try {
        navigator.clipboard.writeText(code.innerText).then(done, function () { selectText(code); cb.textContent = 'Press Ctrl+C'; });
      } catch (err) { selectText(code); cb.textContent = 'Press Ctrl+C'; }
    }
  });
  function selectText(el) { var r = document.createRange(); r.selectNodeContents(el); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
  // equation term highlighting (hover/focus/tap)
  function eqHighlight(e, on) {
    var term = e.target.closest && e.target.closest('.eq [class*="eqt-"], .eq-terms tr[data-t]');
    if (!term) return;
    var eq = term.closest('.eq'); var n;
    if (term.hasAttribute('data-t')) n = term.getAttribute('data-t');
    else { var m = /eqt-(\d+)/.exec(term.className); n = m && m[1]; }
    if (!n) return;
    eq.querySelectorAll('.hl').forEach(function (x) { x.classList.remove('hl'); });
    if (on) { eq.querySelectorAll('.eqt-' + n + ', tr[data-t="' + n + '"]').forEach(function (x) { x.classList.add('hl'); }); }
  }
  document.addEventListener('mouseover', function (e) { eqHighlight(e, true); });
  document.addEventListener('mouseout', function (e) { eqHighlight(e, false); });
  document.addEventListener('click', function (e) { eqHighlight(e, true); });

  // ---------- views ----------
  var cleanups = [];
  function clearView() { cleanups.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); cleanups = []; view.innerHTML = ''; }
  function mountWidgets(scope) {
    scope.querySelectorAll('[data-widget]').forEach(function (host) {
      cleanups.push(KIT.widgets.mount(host.getAttribute('data-widget'), host, { lang: root.getAttribute('data-lang') }));
    });
  }
  function secHead(key) { var l = LABELS[key] || [key, '']; return h('h2', { class: 'sec-h' }, T(l[0], l[1])); }
  function pair(en, bn, wide) {
    var p = h('div', { class: 'pair' + (wide ? ' wide' : '') });
    if (en) { var e = h('div', { class: 'l-en prose', lang: 'en' }); e.innerHTML = '<span class="lt">EN</span>' + en; p.appendChild(e); }
    if (bn) { var b = h('div', { class: 'l-bn prose', lang: 'bn' }); b.innerHTML = '<span class="lt">বাংলা</span>' + bn; p.appendChild(b); }
    return p;
  }
  function learnBtn(id) {
    var b = h('button', { type: 'button', class: 'learn-btn', 'aria-pressed': store.learned[id] ? 'true' : 'false' });
    function lbl() { b.textContent = store.learned[id] ? '✓ Learned' : 'Mark as learned'; }
    lbl();
    b.addEventListener('click', function () {
      if (store.learned[id]) delete store.learned[id]; else store.learned[id] = Date.now();
      save(); b.setAttribute('aria-pressed', store.learned[id] ? 'true' : 'false'); lbl(); refreshLearned(id);
    });
    return b;
  }

  function renderTopic(id, token) {
    var meta = D.topics[id];
    if (!meta) return notFound('Topic "' + id + '" was not found.');
    var mod = modOf(meta.m) || { id: meta.m, title: meta.m, topics: [id] };
    view.appendChild(h('p', { class: 'loading' }, 'Loading…'));
    loadModule(meta.m).then(function (data) {
      if (token !== routeToken) return;
      clearView();
      var t = data[id] || { blocks: [], questions: [] };
      var head = h('header', null, [
        h('div', { class: 'crumb' }, [h('a', { href: '#m-' + mod.id }, modCode(mod.id) + ' · ' + mod.title)]),
        h('h1', { class: 'page-h' }, meta.title),
        meta.title_bn ? h('div', { class: 'page-hb l-bn', lang: 'bn' }, meta.title_bn) : null,
        h('div', { class: 'meta' }, [
          h('span', { class: 'badge stars', title: ['', 'Nice to know', 'Likely asked', 'Must know'][meta.stars] }, starsTxt(meta.stars) + ' ' + ['', 'nice to know', 'likely asked', 'must know'][meta.stars]),
          h('span', { class: 'badge' }, '~' + meta.mins + ' min'),
          meta.core ? h('span', { class: 'badge core' }, 'core') : null,
          learnBtn(id)
        ])
      ]);
      view.appendChild(head);
      t.blocks.forEach(function (b) {
        var sec;
        if (b.key === 'oneline') { view.appendChild(h('div', { class: 'lead' }, pair(b.en, b.bn, true))); return; }
        if (b.key === 'questions') {
          if (!t.questions.length) return;
          sec = h('section', { class: 'sec' }, [secHead('questions')]);
          var ql = h('div', { class: 'qlist' });
          t.questions.forEach(function (qq) {
            var lv = [qq.level, qq.trick ? 'trick' : ''].filter(Boolean).join(' · ');
            var d = h('details', { class: 'q' }, [
              h('summary', null, [h('span', { html: qq.q }), lv ? h('span', { class: 'lvl' + (qq.trick ? ' trick' : '') }, lv) : h('span')]),
              h('div', { class: 'ans' }, [h('div', { class: 'l-en', lang: 'en', html: qq.a }), qq.bn ? h('div', { class: 'l-bn', lang: 'bn', html: qq.bn }) : null])
            ]);
            ql.appendChild(d);
          });
          sec.appendChild(ql);
          sec.appendChild(h('p', { class: 'kbd-hint' }, [h('a', { href: '#p-flashcards' }, 'Practise all questions as flashcards →')]));
          view.appendChild(sec); return;
        }
        sec = h('section', { class: 'sec sec-' + b.key }, [secHead(b.key)]);
        if (b.key === 'widgets') {
          (b.list || []).forEach(function (w) { sec.appendChild(h('div', { 'data-widget': w })); });
        } else if (b.key === 'diagram') {
          var dg = h('figure', { class: 'diagram', role: 'img', 'aria-label': 'Diagram for ' + meta.title });
          if (b.svg) { dg.appendChild(h('div', { class: 'mmd mmd-light', html: b.svg.light })); dg.appendChild(h('div', { class: 'mmd mmd-dark', html: b.svg.dark })); }
          else dg.appendChild(h('p', { class: 'empty' }, 'Diagram unavailable.'));
          sec.appendChild(dg);
          if (b.note) sec.appendChild(h('div', { class: 'prose', html: b.note }));
        } else if (b.key === 'equation' || b.key === 'code') {
          sec.appendChild(h('div', { class: 'prose', html: b.html || '' }));
          if (b.en || b.bn) sec.appendChild(pair(b.en, b.bn, false));
        } else if (b.key === 'thesis' || b.key === 'traps') {
          var c = h('div', { class: 'callout ' + b.key }); c.appendChild(pair(b.en || b.html, b.bn, false)); sec.appendChild(c);
        } else {
          sec.appendChild(pair(b.en || b.html, b.bn, b.key === 'used' || b.key === 'how' || b.key === 'deeper'));
        }
        view.appendChild(sec);
      });
      if (meta.related && meta.related.length) {
        var rel = h('div', { class: 'related' });
        meta.related.forEach(function (r) { if (D.topics[r]) rel.appendChild(h('a', { class: 'rchip', href: '#t-' + r }, D.topics[r].title)); });
        if (rel.children.length) view.appendChild(h('section', { class: 'sec' }, [h('h2', { class: 'sec-h' }, T('Related topics', 'সম্পর্কিত টপিক')), rel]));
      }
      var list = mod.topics, i = list.indexOf(id);
      var pager = h('nav', { class: 'pager', 'aria-label': 'Previous and next topic' });
      if (i > 0) pager.appendChild(h('a', { href: '#t-' + list[i - 1] }, [h('span', { class: 'dir' }, '← Previous'), h('span', null, D.topics[list[i - 1]].title)]));
      if (i >= 0 && i < list.length - 1) pager.appendChild(h('a', { class: 'nx', href: '#t-' + list[i + 1] }, [h('span', { class: 'dir' }, 'Next →'), h('span', null, D.topics[list[i + 1]].title)]));
      view.appendChild(pager);
      mountWidgets(view);
    }, function (err) { if (token === routeToken) { clearView(); notFound(err.message); } });
  }

  function renderModule(id) {
    var m = modOf(id); if (!m) return notFound('Module "' + id + '" was not found.');
    if (id === 'm16' && !m.topics.length) { location.replace('#p-glossary'); return; }
    var done = m.topics.filter(function (x) { return store.learned[x]; }).length;
    view.appendChild(h('div', { class: 'crumb' }, [h('a', { href: '#p-home' }, 'Home'), ' / ', modCode(m.id)]));
    view.appendChild(h('h1', { class: 'page-h' }, m.title));
    if (m.title_bn) view.appendChild(h('div', { class: 'page-hb l-bn', lang: 'bn' }, m.title_bn));
    if (m.summary || m.summary_bn) view.appendChild(h('div', { class: 'lead' }, pair(m.summary ? '<p>' + esc(m.summary) + '</p>' : '', m.summary_bn ? '<p>' + esc(m.summary_bn) + '</p>' : '', true)));
    view.appendChild(h('div', { class: 'meta' }, [h('span', { class: 'badge' }, m.topics.length + ' topics'), h('span', { class: 'badge' }, done + ' learned'),
      h('span', { class: 'badge' }, '~' + m.topics.reduce(function (a, x) { return a + (D.topics[x] ? D.topics[x].mins : 0); }, 0) + ' min total')]));
    var list = h('div', { class: 'tlist' });
    m.topics.forEach(function (tid) {
      var t = D.topics[tid];
      list.appendChild(h('a', { class: 'trow' + (store.learned[tid] ? ' done' : ''), href: '#t-' + tid, 'data-stars': t.stars }, [
        h('span', { class: 'chk', 'aria-hidden': 'true' }),
        h('span', { class: 'tt' }, [h('b', null, t.title), t.title_bn ? h('span', null, t.title_bn) : null]),
        h('span', { class: 'tm' }, starsTxt(t.stars) + ' · ' + t.mins + 'm')
      ]));
    });
    view.appendChild(list);
  }

  function renderHome() {
    var s = D.stats || {};
    var total = 0, learned = 0, must = 0, mustDone = 0;
    Object.keys(D.topics).forEach(function (id) { total++; if (store.learned[id]) learned++; if (D.topics[id].stars === 3) { must++; if (store.learned[id]) mustDone++; } });
    view.appendChild(h('section', { class: 'hero' }, [
      h('h1', null, [document.createTextNode('From '), h('em', null, 'teacher'), document.createTextNode(' to '), h('i', null, 'student')]),
      h('p', null, T('Everything a model-distillation intern gets asked: distillation, RAG, losses, metrics, LLM training and your own thesis. Each topic is short, bilingual, and has viva questions.', 'Model distillation intern-কে যা যা জিজ্ঞেস করা হতে পারে, সব এক জায়গায়: distillation, RAG, loss, metric, LLM training আর তোমার নিজের thesis। প্রতিটা টপিক ছোট, দুই ভাষায়, সাথে ভাইভা প্রশ্ন।')),
      h('div', { class: 'stats' }, [
        h('span', null, [h('b', null, String(s.topics || total)), 'topics']), h('span', null, [h('b', null, String(s.questions || D.questions.length)), 'questions']),
        h('span', null, [h('b', null, String(s.widgets || 0)), 'interactives']), h('span', null, [h('b', null, String(s.glossary || D.glossary.length)), 'glossary terms']),
        h('span', null, [h('b', null, learned + '/' + total), 'learned']), h('span', null, [h('b', null, mustDone + '/' + must), '★★★ learned'])
      ])
    ]));
    var cards = h('div', { class: 'cards' });
    [['#t-thesis-pitch-30s', 'Start here: your 30-second pitch', 'থিসিসের ৩০ সেকেন্ডের পরিচয়'],
     ['#p-cheatsheet', 'Last-minute cheat sheet', 'শেষ মুহূর্তের চিট শিট'],
     ['#p-journey', 'Thesis journey chart', 'থিসিসের যাত্রা'],
     ['#p-flashcards', 'Viva flashcards', 'ফ্ল্যাশকার্ডে প্র্যাকটিস'],
     ['#m-m8', 'Knowledge distillation (core)', 'নলেজ ডিস্টিলেশন (মূল)'],
     ['#p-study-plans', '1-day and 3-day study plans', 'পড়ার প্ল্যান']].forEach(function (c) {
      var target = c[0].replace('#', '');
      if (/^t-/.test(target) && !D.topics[target.slice(2)]) return;
      if (/^p-/.test(target) && ['journey', 'flashcards'].indexOf(target.slice(2)) < 0 && !PAGES[target.slice(2)]) return;
      cards.appendChild(h('a', { class: 'card', href: c[0] }, [h('b', null, c[1]), h('span', { class: 'bn', lang: 'bn' }, c[2])]));
    });
    view.appendChild(cards);
    view.appendChild(h('h2', { class: 'h2' }, T('Modules', 'মডিউল')));
    var grid = h('div', { class: 'modgrid' });
    D.modules.forEach(function (m) {
      var n = m.topics.length, d = m.topics.filter(function (x) { return store.learned[x]; }).length;
      var pct = n ? Math.round(100 * d / n) : 0;
      grid.appendChild(h('a', { class: 'modrow', href: m.id === 'm16' && !n ? '#p-glossary' : '#m-' + m.id }, [
        h('span', { class: 'mod-code' }, modCode(m.id)),
        h('span', { class: 'mt' }, [h('b', null, m.title + ' ' + starsTxt(m.stars || 2).replace(/☆/g, '')), m.title_bn ? h('span', null, m.title_bn) : null]),
        h('span', null, n ? [h('div', { class: 'bar', role: 'img', 'aria-label': d + ' of ' + n + ' learned' }, [h('i', { style: { width: pct + '%' } })]), h('div', { class: 'barlbl' }, d + '/' + n)] : h('span', { class: 'barlbl' }, D.glossary.length + ' terms'))
      ]));
    });
    view.appendChild(grid);
  }

  function renderPage(id) {
    var p = PAGES[id]; if (!p) return notFound('Page "' + id + '" was not found.');
    view.appendChild(h('div', { class: 'crumb' }, [h('a', { href: '#p-home' }, 'Home')]));
    view.appendChild(h('h1', { class: 'page-h' }, p.title));
    if (p.title_bn) view.appendChild(h('div', { class: 'page-hb l-bn', lang: 'bn' }, p.title_bn));
    var body = h('div', { class: 'page-body' });
    var pend = null;
    p.blocks.forEach(function (b) {
      if (b.lang === 'neutral') { body.appendChild(h('div', { class: 'prose', html: b.html })); return; }
      var d = h('div', { class: 'prose l-' + b.lang, lang: b.lang, html: b.html });
      body.appendChild(d);
    });
    view.appendChild(body);
    if (id === 'models') enhanceTables(body, true);
    mountWidgets(view);
  }

  function enhanceTables(scope, withFilter) {
    if (withFilter) {
      var f = h('input', { class: 'filter', type: 'search', placeholder: 'Filter rows (e.g. Apache, Bangla, 8B)…', 'aria-label': 'Filter table rows' });
      scope.insertBefore(f, scope.firstChild);
      f.addEventListener('input', function () {
        var v = f.value.trim().toLowerCase();
        scope.querySelectorAll('tbody tr').forEach(function (tr) { tr.hidden = !!v && tr.textContent.toLowerCase().indexOf(v) < 0; });
      });
    }
    scope.querySelectorAll('table.sortable').forEach(function (tbl) {
      tbl.querySelectorAll('th').forEach(function (th, ci) {
        th.tabIndex = 0;
        function sort() {
          var asc = th.getAttribute('aria-sort') !== 'ascending';
          tbl.querySelectorAll('th').forEach(function (x) { x.removeAttribute('aria-sort'); });
          th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
          var body = tbl.tBodies[0]; var rows = Array.prototype.slice.call(body.rows);
          rows.sort(function (a, b) {
            var x = (a.cells[ci] || {}).textContent || '', y = (b.cells[ci] || {}).textContent || '';
            var nx = parseFloat(x.replace(/[^0-9.\-]/g, '')), ny = parseFloat(y.replace(/[^0-9.\-]/g, ''));
            var r = (!isNaN(nx) && !isNaN(ny)) ? nx - ny : x.localeCompare(y);
            return asc ? r : -r;
          });
          rows.forEach(function (r) { body.appendChild(r); });
        }
        th.addEventListener('click', sort);
        th.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort(); } });
      });
    });
  }

  function renderJourney(token) {
    view.appendChild(h('div', { class: 'crumb' }, [h('a', { href: '#p-home' }, 'Home')]));
    view.appendChild(h('h1', { class: 'page-h' }, 'Thesis journey'));
    view.appendChild(h('div', { class: 'page-hb l-bn', lang: 'bn' }, 'থিসিসের যাত্রা: Approach 1 থেকে Stage 9'));
    view.appendChild(h('div', { 'data-widget': 'thesis-journey' }));
    if (D.topics['thesis-journey']) view.appendChild(h('p', null, [h('a', { class: 'rchip', href: '#t-thesis-journey' }, 'Read the full journey explanation →')]));
    mountWidgets(view);
  }

  function renderGlossary() {
    view.appendChild(h('div', { class: 'crumb' }, [h('a', { href: '#p-home' }, 'Home'), ' / M16']));
    view.appendChild(h('h1', { class: 'page-h' }, 'Glossary'));
    view.appendChild(h('div', { class: 'page-hb l-bn', lang: 'bn' }, 'শব্দকোষ: A থেকে Z'));
    var f = h('input', { class: 'filter', type: 'search', placeholder: 'Filter ' + D.glossary.length + ' terms…', 'aria-label': 'Filter glossary' });
    var box = h('div', { class: 'gl' });
    function draw() {
      var v = f.value.trim().toLowerCase(); box.innerHTML = ''; var letter = '';
      var items = D.glossary.filter(function (g) { return !v || (g.term + ' ' + g.bn + ' ' + g.en + ' ' + g.bnd).toLowerCase().indexOf(v) >= 0; });
      if (!items.length) { box.appendChild(h('div', { class: 'gl-row empty' }, 'No terms match.')); return; }
      items.forEach(function (g) {
        var L = g.term.charAt(0).toUpperCase();
        if (L !== letter && !v) { letter = L; box.appendChild(h('div', { class: 'gl-letter' }, L)); }
        box.appendChild(h('div', { class: 'gl-row' }, [
          h('div', { class: 'gl-term' }, [h('b', null, g.term), g.bn ? h('span', { lang: 'bn' }, g.bn) : null]),
          h('div', { class: 'gl-def' }, [h('div', { class: 'l-en', lang: 'en', html: g.en }), g.bnd ? h('div', { class: 'l-bn', lang: 'bn', html: g.bnd }) : null,
            g.topic && D.topics[g.topic] ? h('a', { href: '#t-' + g.topic, class: 'kbd-hint' }, '→ ' + D.topics[g.topic].title) : null])
        ]));
      });
    }
    f.addEventListener('input', draw);
    view.appendChild(f); view.appendChild(box); draw();
  }

  // ---------- flashcards ----------
  var fc = store.prefs.fc || { mod: 'all', level: 'all', trick: false, review: false, order: null, i: 0 };
  function renderFlashcards() {
    view.appendChild(h('div', { class: 'crumb' }, [h('a', { href: '#p-home' }, 'Home')]));
    view.appendChild(h('h1', { class: 'page-h' }, 'Viva flashcards'));
    view.appendChild(h('div', { class: 'page-hb l-bn', lang: 'bn' }, 'প্রশ্ন দেখো, মনে মনে উত্তর দাও, তারপর উল্টাও'));
    var modSel = h('select', { id: 'fc-mod' }, [h('option', { value: 'all' }, 'All modules')].concat(D.modules.filter(function (m) { return D.questions.some(function (x) { return x.m === m.id; }); }).map(function (m) { return h('option', { value: m.id }, modCode(m.id) + ' · ' + m.title); })));
    var lvlSel = h('select', { id: 'fc-lvl' }, ['all', 'easy', 'medium', 'hard'].map(function (l) { return h('option', { value: l }, l === 'all' ? 'Any level' : l); }));
    var trick = h('input', { type: 'checkbox', id: 'fc-trick' }), review = h('input', { type: 'checkbox', id: 'fc-review' });
    modSel.value = fc.mod; lvlSel.value = fc.level; trick.checked = !!fc.trick; review.checked = !!fc.review;
    view.appendChild(h('div', { class: 'fc-filters' }, [
      h('label', { for: 'fc-mod' }, ['Module', modSel]), h('label', { for: 'fc-lvl' }, ['Level', lvlSel]),
      h('label', { class: 'ck', for: 'fc-trick' }, [trick, 'Trick questions only']), h('label', { class: 'ck', for: 'fc-review' }, [review, 'Only my "review again" pile']),
      h('button', { type: 'button', class: 'btn', id: 'fc-shuffle' }, 'Shuffle')
    ]));
    var counts = h('div', { class: 'fc-count', 'aria-live': 'polite' });
    var card = h('div', { class: 'fc-card', tabindex: '0', role: 'button', 'aria-label': 'Flashcard. Press space to flip.' });
    var actions = h('div', { class: 'fc-actions' });
    view.appendChild(counts); view.appendChild(card); view.appendChild(actions);
    view.appendChild(h('p', { class: 'kbd-hint', html: '<kbd>Space</kbd> flip · <kbd>→</kbd> next · <kbd>←</kbd> back · <kbd>K</kbd> I knew it · <kbd>R</kbd> review again' }));
    var deck = [], flipped = false;
    function build(reshuffle) {
      fc.mod = modSel.value; fc.level = lvlSel.value; fc.trick = trick.checked; fc.review = review.checked;
      var starsOnly = root.classList.contains('stars-only');
      deck = D.questions.filter(function (x) {
        if (fc.mod !== 'all' && x.m !== fc.mod) return false;
        if (fc.level !== 'all' && x.level !== fc.level) return false;
        if (fc.trick && !x.trick) return false;
        if (fc.review && store.cards[x.id] !== 'review') return false;
        if (starsOnly && D.topics[x.t] && D.topics[x.t].stars < 3 && !/^m15$/.test(x.m)) return false;
        return true;
      });
      if (reshuffle) { for (var i = deck.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp; } fc.order = deck.map(function (x) { return x.id; }); fc.i = 0; }
      else if (fc.order) { var pos = {}; fc.order.forEach(function (id, k) { pos[id] = k; }); deck.sort(function (a, b) { return (pos[a.id] === undefined ? 1e9 : pos[a.id]) - (pos[b.id] === undefined ? 1e9 : pos[b.id]); }); }
      if (fc.i >= deck.length) fc.i = 0;
      store.prefs.fc = fc; save(); flipped = false; draw();
    }
    function draw() {
      var known = 0, rev = 0; deck.forEach(function (x) { if (store.cards[x.id] === 'known') known++; else if (store.cards[x.id] === 'review') rev++; });
      counts.innerHTML = '';
      counts.append(h('span', null, 'Card ' + (deck.length ? fc.i + 1 : 0) + ' of ' + deck.length), h('span', null, '✓ knew: ' + known), h('span', null, '↻ review: ' + rev), h('span', null, 'new: ' + (deck.length - known - rev)));
      card.innerHTML = ''; actions.innerHTML = '';
      if (!deck.length) { card.appendChild(h('p', { class: 'empty' }, 'No cards match these filters.')); return; }
      var x = deck[fc.i], t = D.topics[x.t];
      card.appendChild(h('div', { class: 'fc-meta' }, [h('a', { href: '#t-' + x.t, onclick: function (e) { e.stopPropagation(); } }, (t ? modCode(t.m) + ' · ' + t.title : x.t)), h('span', { class: 'lvl' + (x.trick ? ' trick' : '') }, [x.level, x.trick ? 'trick' : ''].filter(Boolean).join(' · '))]));
      card.appendChild(h('div', { class: 'fc-q', html: x.q }));
      if (flipped) card.appendChild(h('div', { class: 'fc-a' }, [h('div', { class: 'l-en', lang: 'en', html: x.a }), x.bn ? h('div', { class: 'l-bn', lang: 'bn', html: x.bn }) : null]));
      else card.appendChild(h('div', { class: 'fc-hint' }, 'Answer out loud, then tap the card (or press Space) to check.'));
      var st = store.cards[x.id];
      actions.append(
        h('button', { type: 'button', class: 'btn', onclick: function () { move(-1); } }, '← Back'),
        h('button', { type: 'button', class: 'btn primary', onclick: flip }, flipped ? 'Hide answer' : 'Show answer'),
        h('button', { type: 'button', class: 'btn good', 'aria-pressed': st === 'known' ? 'true' : 'false', onclick: function () { mark('known'); } }, '✓ I knew it'),
        h('button', { type: 'button', class: 'btn warn', 'aria-pressed': st === 'review' ? 'true' : 'false', onclick: function () { mark('review'); } }, '↻ Review again'),
        h('button', { type: 'button', class: 'btn', onclick: function () { move(1); } }, 'Next →')
      );
    }
    function flip() { flipped = !flipped; draw(); }
    function move(d) { if (!deck.length) return; fc.i = (fc.i + d + deck.length) % deck.length; flipped = false; store.prefs.fc = fc; save(); draw(); }
    function mark(s) { var x = deck[fc.i]; if (!x) return; store.cards[x.id] = s; save(); move(1); }
    card.addEventListener('click', function (e) { if (!e.target.closest('a')) flip(); });
    function onKey(e) {
      if (/input|select|textarea/i.test(document.activeElement.tagName)) return;
      if (e.key === ' ') { e.preventDefault(); flip(); } else if (e.key === 'ArrowRight') move(1); else if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'k' || e.key === 'K') mark('known'); else if (e.key === 'r' || e.key === 'R') mark('review');
    }
    document.addEventListener('keydown', onKey);
    cleanups.push(function () { document.removeEventListener('keydown', onKey); });
    [modSel, lvlSel, trick, review].forEach(function (el) { el.addEventListener('change', function () { fc.order = null; build(true); }); });
    document.getElementById('fc-shuffle').addEventListener('click', function () { build(true); });
    build(!fc.order);
  }

  function notFound(msg) {
    view.appendChild(h('h1', { class: 'page-h' }, 'Not found'));
    view.appendChild(h('p', null, msg || 'This page does not exist.'));
    view.appendChild(h('p', null, [h('a', { href: '#p-home' }, 'Go to the home page')]));
  }

  // ---------- router ----------
  var routeToken = 0;
  function parseHash() {
    var raw = location.hash.replace(/^#/, '');
    try { raw = decodeURIComponent(raw); } catch (e) { /* keep raw */ }
    var m;
    if (!raw || raw === 'p-home') return { type: 'page', id: 'home', key: 'p-home' };
    if ((m = /^\/?(?:topic\/|t-)(.+)$/.exec(raw))) return { type: 'topic', id: m[1], key: 't-' + m[1] };
    if ((m = /^\/?(?:module\/|m-)(.+)$/.exec(raw))) return { type: 'module', id: m[1], key: 'm-' + m[1] };
    if ((m = /^p-(.+)$/.exec(raw))) return { type: 'page', id: m[1], key: 'p-' + m[1] };
    return null;
  }
  function route() {
    var r = parseHash(); if (!r) return; // unknown hash (e.g. an in-page anchor): leave the view alone
    var token = ++routeToken;
    clearView(); closeResults();
    if (r.type === 'topic') renderTopic(r.id, token);
    else if (r.type === 'module') renderModule(r.id);
    else if (r.id === 'home') renderHome();
    else if (r.id === 'flashcards') renderFlashcards();
    else if (r.id === 'glossary') renderGlossary();
    else if (r.id === 'journey') renderJourney(token);
    else renderPage(r.id);
    markActive(r.key);
    var titleBase = 'Distillation Viva Kit';
    var tt = r.type === 'topic' && D.topics[r.id] ? D.topics[r.id].title : r.type === 'module' && modOf(r.id) ? modOf(r.id).title : (PAGES[r.id] && PAGES[r.id].title);
    document.title = tt ? tt + ' · ' + titleBase : titleBase;
    window.scrollTo(0, 0);
    if (document.activeElement && document.activeElement !== q) mainEl.focus({ preventScroll: true });
  }
  document.getElementById('skipBtn').addEventListener('click', function () { mainEl.focus(); });
  window.addEventListener('hashchange', route);
  buildSidebar();
  route();
})();
