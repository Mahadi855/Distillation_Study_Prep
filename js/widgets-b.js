/* widgets-b.js: RAG + ML-fundamentals widgets for the Distillation Viva Kit.
   Vanilla JS (ES2017), no dependencies. Every widget registers through KIT.widgets.register. */
(function () {
  'use strict';
  var D = KIT.dom, h = D.h, s = D.s;
  /** bilingual label; drops the Bangla copy when it is identical to the English */
  function t(en, bn, tag) { return bn && bn !== en ? D.t(en, bn, tag) : h(tag || 'span', null, en); }

  /* ---------- shared helpers ---------- */
  var uidN = 0;
  function uid(p) { uidN += 1; return 'wb-' + p + '-' + uidN + '-' + Math.random().toString(36).slice(2, 6); }
  /** mulberry32: small seeded PRNG so every scatter is reproducible */
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function fx(v, d) { return (Math.abs(v) < 1e-12 ? 0 : v).toFixed(d === undefined ? 2 : d); }
  function lin(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); }; }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function pathD(pts) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(''); }
  function svg(vb, aria, cls) { return s('svg', { viewBox: vb, role: 'img', 'aria-label': aria, class: cls }); }
  /** readout chip with a live value: chip(en, bn).set('0.42') */
  function chip(en, bn) {
    var b = h('b');
    return { el: h('span', { class: 'w-chip' }, [t(en, bn), ': ', b]), set: function (v) { if (typeof v === 'string') b.textContent = v; else { clear(b); b.appendChild(v); } } };
  }
  /** relabel a button (KIT.dom.button builds bilingual spans) */
  function relabel(btn, en, bn) { clear(btn); btn.appendChild(t(en, bn)); }
  /** KIT.dom.button / slider, but a label with no distinct Bangla is shown once in every language mode */
  function btn(en, bn, fn, pressed) { var b = D.button(en, bn, fn, pressed); if (!bn || bn === en) relabel(b, en); return b; }
  function sld(o) {
    var same = !o.label_bn || o.label_bn === o.label, sl = D.slider(Object.assign({}, o, same ? { label_bn: null } : {}));
    if (same) { var sp = sl.wrap.querySelector('label .l-en'); if (sp) sp.removeAttribute('class'); }
    return sl;
  }
  /** SVG text that follows the language toggle (English in "both" mode to save room) */
  function stext(attrs, en, bn) {
    var g = s('g');
    var a = Object.assign({}, attrs, { text: en, class: (attrs.class || '') + ' l-en' });
    g.appendChild(s('text', a));
    if (bn) g.appendChild(s('text', Object.assign({}, attrs, { text: bn, class: (attrs.class || '') + ' l-bn' })));
    return g;
  }
  /** axes + recessive grid for a chart box {l,r,t,b}; returns the group */
  function axes(box, xs, ys, xt, yt, xf, yf) {
    var g = s('g', { class: 'wb-axes' });
    yt.forEach(function (v) {
      var y = ys(v);
      g.appendChild(s('line', { x1: box.l, x2: box.r, y1: y, y2: y, class: 'grid' }));
      g.appendChild(s('text', { x: box.l - 5, y: y + 4, 'text-anchor': 'end', text: yf(v) }));
    });
    xt.forEach(function (v) {
      var x = xs(v);
      g.appendChild(s('line', { x1: x, x2: x, y1: box.t, y2: box.b, class: 'grid' }));
      g.appendChild(s('text', { x: x, y: box.b + 15, 'text-anchor': 'middle', text: xf(v) }));
    });
    g.appendChild(s('line', { x1: box.l, x2: box.r, y1: box.b, y2: box.b, class: 'axis' }));
    g.appendChild(s('line', { x1: box.l, x2: box.l, y1: box.t, y2: box.b, class: 'axis' }));
    return g;
  }
  /** HTML legend: items [{cls:'sw-c1', en, bn, shape:'dot'|'line'|'ring'|'dash'}] */
  function legend(items) {
    return h('div', { class: 'wb-legend' }, items.map(function (it) {
      return h('span', { class: 'wb-key' }, [h('i', { class: 'wb-sw wb-' + (it.shape || 'dot'), style: { color: 'var(' + it.color + ')' } }), h("span", null, t(it.en, it.bn))]);
    }));
  }
  /** call fn when the tab becomes hidden; returns an unsubscribe function */
  function onHidden(fn) {
    var cb = function () { if (document.hidden) fn(); };
    document.addEventListener('visibilitychange', cb);
    return function () { document.removeEventListener('visibilitychange', cb); };
  }
  /** pointer position in SVG user units */
  function svgPoint(svgEl, ev) {
    var m = svgEl.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    var p = svgEl.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
    var q = p.matrixTransform(m.inverse());
    return { x: q.x, y: q.y };
  }
  function bar(frac, color, extraCls) {
    return h('span', { class: 'wb-bar' + (extraCls ? ' ' + extraCls : '') }, h('i', { style: { width: Math.max(0, Math.min(1, frac)) * 100 + '%', background: 'var(' + color + ')' } }));
  }

  /* ======================================================================
     1. rag-pipeline: seven-step walk through retrieval-augmented generation
     ====================================================================== */
  KIT.widgets.register('rag-pipeline', {
    title: 'RAG, one step at a time',
    title_bn: 'RAG, এক ধাপ করে',
    mount: function (host, ctx) {
      var w = D.shell({ id: 'rag-pipeline', title: this.title, title_bn: this.title_bn, kicker: 'Step-through',
        caption: 'Toy numbers, real maths: an 8-dimension hand-made embedding (real models use 384–1024 unnamed dimensions) with live cosine, and BM25 computed live on these 6 chunks (k1 = 1.2, b = 0.75). Cross-encoder scores are illustrative model outputs.',
        caption_bn: 'খেলনা সংখ্যা, কিন্তু অঙ্ক আসল: হাতে বানানো 8-dimension embedding (আসল model-এ 384–1024 dimension), cosine আর BM25 এই 6টা chunk-এর উপর live হিসাব করা। Cross-encoder score গুলো উদাহরণ হিসেবে দেওয়া।' });
      host.appendChild(w.root);
      var QUERY = 'What is the punishment for theft?';
      var DIMS = [['theft', 'চুরি'], ['penalty', 'শাস্তি'], ['prison', 'জেল'], ['property', 'সম্পত্তি'], ['home', 'বাসা'], ['entry', 'প্রবেশ'], ['money', 'টাকা'], ['youth', 'কিশোর']];
      var QV = [0.85, 0.80, 0.35, 0.15, 0, 0, 0.20, 0];
      var CH = [ // id, section, title, text, toy embedding, cross-encoder score
        ['C1', '§41', 'Theft defined', 'Theft is the dishonest taking of movable property out of another person\'s possession without consent. A theft is complete once the thing is moved with that intent; an attempted theft is dealt with separately.', [0.95, 0.10, 0, 0.70, 0, 0.1, 0, 0], 0.23],
        ['C2', '§42', 'Punishment for theft', 'Whoever commits theft shall be punished with imprisonment for up to three years, or with a fine, or with both.', [0.80, 0.85, 0.60, 0.20, 0, 0, 0.40, 0], 0.96],
        ['C3', '§43', 'Theft in a dwelling', 'Theft in a house, tent or boat used as a home is punishable with imprisonment for up to seven years, and the offender shall also pay a fine.', [0.70, 0.55, 0.60, 0.20, 0.85, 0.2, 0.30, 0], 0.88],
        ['C4', '§18', 'Criminal trespass', 'Entering land or a building in another person\'s possession in order to commit an offence is criminal trespass, punishable with up to three months in prison.', [0.15, 0.35, 0.40, 0.40, 0.45, 0.90, 0, 0], 0.12],
        ['C5', '§77', 'Young offenders', 'When the offender is a child under sixteen, the court shall prefer a reform order or supervision over the usual punishment.', [0.05, 0.60, 0.50, 0, 0, 0, 0.10, 0.90], 0.15],
        ['C6', '§9', 'Amount of fines', 'Where an offence is punishable with a fine of no stated amount, the fine shall not be excessive and the court shall consider the offender\'s means.', [0.05, 0.75, 0.15, 0.05, 0, 0, 0.85, 0], 0.41]
      ].map(function (r) { return { id: r[0], sec: r[1], title: r[2], text: r[3], v: r[4], ce: r[5] }; });

      // dense cosine (live) + BM25 (live, light stemming, stop-words removed)
      function cos(a, b) { var d = 0, na = 0, nb = 0; a.forEach(function (x, i) { d += x * b[i]; na += x * x; nb += b[i] * b[i]; }); return d / Math.sqrt(na * nb); }
      var STOP = 'a an the is are of to in for with or and by who what which shall be on as at it its this that from up also both any into once'.split(' ');
      function tok(str) {
        return (str.toLowerCase().match(/[a-z]+/g) || []).filter(function (x) { return STOP.indexOf(x) < 0; })
          .map(function (x) { return x.length > 4 ? x.replace(/(ment|able|ed|es|s)$/, '') : x; });
      }
      var docs = CH.map(function (c) { return tok(c.title + ' ' + c.text); });
      var qt = tok(QUERY), N = docs.length, avg = docs.reduce(function (a, d) { return a + d.length; }, 0) / N;
      CH.forEach(function (c, i) {
        var d = docs[i];
        c.sem = cos(QV, c.v);
        c.bm = qt.reduce(function (acc, term) {
          var n = docs.filter(function (x) { return x.indexOf(term) >= 0; }).length;
          var idf = Math.log(1 + (N - n + 0.5) / (n + 0.5)), f = d.filter(function (x) { return x === term; }).length;
          return acc + idf * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * d.length / avg));
        }, 0);
      });
      var bmMax = Math.max.apply(null, CH.map(function (c) { return c.bm; }));
      CH.forEach(function (c) { c.bmn = c.bm / bmMax; c.hyb = 0.6 * c.sem + 0.4 * c.bmn; c.pass = c.hyb >= 0.40; });
      var byHyb = CH.slice().sort(function (a, b) { return b.hyb - a.hyb; });
      byHyb.forEach(function (c, i) { c.hRank = i + 1; });
      var reranked = byHyb.filter(function (c) { return c.pass; }).sort(function (a, b) { return b.ce - a.ce; });
      var top = reranked.slice(0, 3);

      function row(cls, cells) { return h('div', { class: 'rp-row ' + (cls || '') }, cells); }
      function label(c) { return h('span', { class: 'rp-lab' }, [h('b', { class: 'rp-id' }, c.id), h('span', { class: 'rp-ttl' }, c.sec + ' ' + c.title)]); }
      function num(v, d) { return h('span', { class: 'rp-num mono' }, fx(v, d)); }

      var STEPS = [
        { en: 'Query', bn: 'প্রশ্ন', cap: 'The user\'s question enters the pipeline. In my thesis an LLM also wrote 2–3 rephrasings first (multi-query expansion), and each one was searched.', cap_bn: 'ব্যবহারকারীর প্রশ্ন pipeline-এ ঢোকে। আমার thesis-এ আগে LLM দিয়ে প্রশ্নটার 2–3টা অন্যভাবে লেখা version বানানো হত (multi-query expansion), প্রতিটা দিয়েই search হত।',
          draw: function (box) {
            box.appendChild(h('div', { class: 'rp-query mono' }, QUERY));
            box.appendChild(h('div', { class: 'w-label' }, t('Corpus: 6 chunks', 'Corpus: 6টা chunk')));
            CH.forEach(function (c) { box.appendChild(h('div', { class: 'rp-chunk' }, [h('b', { class: 'rp-id' }, c.id), h('span', null, [h('b', null, c.sec + ' ' + c.title + '. '), c.text])])); });
          } },
        { en: 'Embed', bn: 'Embed', cap: 'An embedding model turns the text into a vector. Texts with similar meaning land close together. These 8 dimensions are named so you can read them; real ones are not.', cap_bn: 'Embedding model লেখাটাকে একটা vector বানায়। একই রকম মানের লেখা কাছাকাছি vector পায়। এখানে 8টা dimension-এর নাম দেওয়া যাতে পড়া যায়; আসল model-এ নাম থাকে না।',
          draw: function (box) {
            var n = Math.sqrt(QV.reduce(function (a, x) { return a + x * x; }, 0));
            box.appendChild(h('div', { class: 'rp-query mono' }, ['embed("', QUERY, '")  →  q (unit length)']));
            QV.forEach(function (x, i) { box.appendChild(row('rp-vec', [h('span', { class: 'rp-dim' }, t(DIMS[i][0], DIMS[i][1])), bar(x / n, '--c1'), num(x / n)])); });
          } },
        { en: 'Retrieve', bn: 'Retrieve', cap: 'Two retrievers score every chunk. Dense: cosine between q and the chunk vector (meaning). BM25: keyword overlap ("punish", "theft"), weighted by rarity. C1 says "theft" four times, so BM25 likes it.', cap_bn: 'দুটো retriever প্রতিটা chunk-কে score দেয়। Dense: q আর chunk vector-এর cosine (মানে মেলে কিনা)। BM25: keyword মেলানো ("punish", "theft"), দুর্লভ শব্দের ওজন বেশি। C1-এ "theft" চারবার আছে, তাই BM25 ওটাকে পছন্দ করে।',
          draw: function (box) {
            box.appendChild(row('rp-head', [h('span'), h('span', null, t('Dense cosine', 'Dense cosine')), h('span', null, t('BM25 ÷ max (' + fx(bmMax) + ')'))]));
            CH.forEach(function (c) { box.appendChild(row('rp-two', [label(c), h('span', { class: 'rp-cell' }, [bar(c.sem, '--c1'), num(c.sem)]), h('span', { class: 'rp-cell' }, [bar(c.bmn, '--c2'), num(c.bmn)])])); });
          } },
        { en: 'Fuse', bn: 'Fuse', cap: 'Hybrid score = 0.6 × dense + 0.4 × BM25 (normalised). Chunks below the 0.40 similarity filter are dropped before the expensive step.', cap_bn: 'Hybrid score = 0.6 × dense + 0.4 × BM25 (normalised)। 0.40-এর নিচের chunk গুলো filter-এ বাদ পড়ে, দামি ধাপের আগেই।',
          draw: function (box) {
            byHyb.forEach(function (c) {
              var st = h('span', { class: 'wb-bar rp-stack' }, [h('i', { style: { width: 60 * c.sem + '%', background: 'var(--c1)' } }), h('i', { style: { width: 40 * c.bmn + '%', background: 'var(--c2)' } }), h('em', { class: 'rp-thr' })]);
              box.appendChild(row('rp-fuse' + (c.pass ? '' : ' is-out'), [label(c), st, num(c.hyb)]));
            });
            box.appendChild(legend([{ color: '--c1', en: '0.6 × dense', bn: '0.6 × dense' }, { color: '--c2', en: '0.4 × BM25', bn: '0.4 × BM25' }, { color: '--bad', shape: 'dash', en: '0.40 filter', bn: '0.40 filter' }]));
          } },
        { en: 'Rerank', bn: 'Rerank', cap: 'A cross-encoder reads the query and each chunk together in one pass, so it sees that C1 defines theft but never mentions punishment. The order changes; only the top 3 go on.', cap_bn: 'Cross-encoder প্রশ্ন আর chunk একসাথে পড়ে, তাই বোঝে C1 শুধু চুরির সংজ্ঞা, শাস্তির কথা নেই। ক্রম বদলে যায়; শুধু top 3 সামনে যায়।',
          draw: function (box) {
            reranked.forEach(function (c, i) {
              var move = c.hRank - (i + 1);
              var tag = i < 3 ? h('span', { class: 'rp-tag is-in' }, t('→ prompt')) : h('span', { class: 'rp-tag' }, t('dropped', 'বাদ'));
              box.appendChild(row('rp-rr' + (i < 3 ? '' : ' is-out'), [label(c), h('span', { class: 'rp-cell' }, [bar(c.ce, '--c4'), num(c.ce)]),
                h('span', { class: 'rp-mv' }, [h('span', { class: 'mono' }, '#' + c.hRank + ' → #' + (i + 1) + (move > 0 ? ' ↑' : move < 0 ? ' ↓' : '')), tag])]));
            });
          } },
        { en: 'Prompt', bn: 'Prompt', cap: 'The top chunks are pasted into the prompt as context, each with its id, followed by the question and an instruction to answer only from the context.', cap_bn: 'Top chunk গুলো id সহ prompt-এ context হিসেবে বসে, তারপর প্রশ্ন, আর নির্দেশ: শুধু context থেকে উত্তর দাও।',
          draw: function (box) {
            var txt = 'System: Answer only from the context. Cite chunk ids like [C2].\n\nContext:\n' +
              top.map(function (c) { return '[' + c.id + '] ' + c.sec + ' ' + c.title + ': ' + c.text; }).join('\n') + '\n\nQuestion: ' + QUERY;
            box.appendChild(h('pre', { class: 'rp-prompt' }, txt));
          } },
        { en: 'Generate', bn: 'Generate', cap: 'The LLM writes a grounded answer. Every claim points to the chunk it came from, so a reader can check it.', cap_bn: 'LLM context-এর উপর ভর করে উত্তর লেখে। প্রতিটা দাবির পাশে chunk id থাকে, তাই যাচাই করা যায়।',
          draw: function (box) {
            var cite = function (id) { return h('span', { class: 'rp-cite mono' }, '[' + id + ']'); };
            box.appendChild(h('div', { class: 'rp-answer' }, ['Theft is punishable with imprisonment for up to three years, a fine, or both ', cite('C2'),
              '. If it happens in a home (a house, tent or boat), the maximum rises to seven years and a fine must also be paid ', cite('C3'),
              '. Where no amount is stated, the fine must not be excessive and depends on the offender\'s means ', cite('C6'), '.']));
            box.appendChild(h('div', { class: 'w-note' }, t('My thesis used: multi-query expansion, hybrid 0.6/0.4, 0.40 filter, cross-encoder rerank of 10 → top 3.',
              'আমার thesis-এ ছিল: multi-query expansion, hybrid 0.6/0.4, 0.40 filter, cross-encoder দিয়ে 10টা rerank করে top 3।')));
          } }
      ];

      // pipeline strip
      var strip = h('ol', { class: 'rp-strip' });
      var nodes = STEPS.map(function (st, i) {
        var b = h('button', { type: 'button', class: 'rp-node', 'aria-label': 'Step ' + (i + 1) + ': ' + st.en, onclick: function () { stopPlay(); go(i); } },
          [h('span', { class: 'rp-dot mono' }, String(i + 1)), h('span', { class: 'rp-name' }, t(st.en, st.bn === st.en ? null : st.bn))]);
        strip.appendChild(h('li', null, b));
        return b;
      });
      var headEl = h('div', { class: 'rp-stephead' }), panel = h('div', { class: 'rp-panel' }), capEl = h('div', { class: 'rp-cap' });
      w.stage.append(strip, headEl, panel, capEl);

      var cur = 0, timer = null;
      function go(i) {
        cur = Math.max(0, Math.min(STEPS.length - 1, i));
        nodes.forEach(function (n, k) { n.classList.toggle('is-done', k < cur); if (k === cur) n.setAttribute('aria-current', 'step'); else n.removeAttribute('aria-current'); });
        clear(headEl); headEl.append(h('span', { class: 'mono' }, (cur + 1) + ' / ' + STEPS.length), ' ', t(STEPS[cur].en, STEPS[cur].bn === STEPS[cur].en ? null : STEPS[cur].bn));
        clear(panel); STEPS[cur].draw(panel);
        clear(capEl); capEl.appendChild(t(STEPS[cur].cap, STEPS[cur].cap_bn, 'div'));
        back.disabled = cur === 0; next.disabled = cur === STEPS.length - 1;
      }
      function stopPlay() { if (timer) clearInterval(timer); timer = null; relabel(play, 'Play', 'চালাও'); play.setAttribute('aria-pressed', 'false'); }
      function startPlay() {
        if (cur === STEPS.length - 1) go(0);
        relabel(play, 'Pause', 'থামাও'); play.setAttribute('aria-pressed', 'true');
        timer = setInterval(function () { if (cur >= STEPS.length - 1) stopPlay(); else go(cur + 1); if (cur >= STEPS.length - 1) stopPlay(); }, 2600);
      }
      var back = btn('Back', 'পেছনে', function () { stopPlay(); go(cur - 1); });
      var next = btn('Next', 'পরের ধাপ', function () { stopPlay(); go(cur + 1); });
      var play = btn('Play', 'চালাও', function () { if (timer) stopPlay(); else startPlay(); }, false);
      var reset = btn('Reset', 'শুরু থেকে', function () { stopPlay(); go(0); });
      w.controls.append(back, next, play, reset);
      var cHyb = chip('Passed filter', 'Filter পার'), cTop = chip('Final top 3', 'শেষ top 3');
      w.readout.append(cHyb.el, cTop.el);
      cHyb.set(byHyb.filter(function (c) { return c.pass; }).length + ' / 6');
      cTop.set(top.map(function (c) { return c.id; }).join(', '));
      go(0);
      var unHide = onHidden(stopPlay);
      return function () { if (timer) clearInterval(timer); unHide(); };
    }
  });

  /* ======================================================================
     2. chunking: fixed-size vs sentence-aware chunks with overlap
     ====================================================================== */
  KIT.widgets.register('chunking', {
    title: 'Chunk size, overlap and sentence boundaries',
    title_bn: 'Chunk size, overlap আর বাক্যের সীমা',
    mount: function (host) {
      var w = D.shell({ id: 'chunking', title: this.title, title_bn: this.title_bn,
        caption: 'Small chunks are precise but lose context; big chunks keep context but add noise and dilute the embedding. My thesis: 450 tokens with 100 overlap, sentence-aware. 256 tokens hurt because one legal rule runs 300–500 words, so it got split across chunks.',
        caption_bn: 'ছোট chunk নিখুঁত কিন্তু context হারায়; বড় chunk context রাখে কিন্তু বাড়তি noise আনে। আমার thesis: 450 token, 100 overlap, sentence-aware। 256 token-এ ফল খারাপ হয়েছিল, কারণ একটা আইনি নিয়মই 300–500 শব্দের, ফলে সেটা ভেঙে যেত।' });
      host.appendChild(w.root);
      var LINES = [
        'Section 12: Right to Education',
        '(1) Every child aged six to fourteen has the right to attend a nearby public school, free of charge, until the end of the primary stage. Admission shall not depend on any test or interview.',
        '(2) No school may ask for a fee, deposit or other payment that would stop a child from joining or staying. Textbooks, uniforms and travel costs count as such payments.',
        '(3) A child who starts school late, or who left before finishing, shall be placed in the class that suits the child\'s age. The school shall give that child extra lessons, for a period set by rules, so that the child can catch up with classmates.',
        '(4) A child with a disability has the same rights under this section. The school shall make reasonable adjustments, such as step-free classrooms, materials in accessible formats and trained support staff.',
        '(5) The government shall make sure that a school exists within walking distance of every village or ward within three years of this Act coming into force. Where this is not possible, it shall provide free transport or a hostel place.',
        '(6) A parent may choose a private school instead. In that case the State is not bound to repay the fees, except as stated in Section 13.',
        '(7) Any person who refuses admission in breach of this section shall pay a fine of up to fifty thousand taka for each refusal. The fine shall go to the school development fund.'
      ];
      // words with line-end flags; sentences as [start, end) word ranges
      var words = [], sents = [], sStart = 0;
      LINES.forEach(function (line) {
        var ws = line.split(/\s+/);
        ws.forEach(function (x, i) {
          var eol = i === ws.length - 1;
          words.push({ w: x, eol: eol });
          if (/[.?!]$/.test(x) || eol) { sents.push([sStart, words.length]); sStart = words.length; }
        });
      });
      var NW = words.length;
      var st = { size: 60, ovPct: 20, aware: false };

      function fixedChunks(size, ov) {
        var out = [], step = Math.max(1, size - ov);
        for (var a = 0; ; a += step) { var b = Math.min(NW, a + size); out.push([a, b]); if (b >= NW) break; }
        return out;
      }
      function awareChunks(size, ov) {
        var units = []; // sentences; a sentence longer than size is hard-split
        sents.forEach(function (r) { for (var a = r[0]; a < r[1]; a += size) units.push([a, Math.min(r[1], a + size)]); });
        var out = [], i = 0;
        while (i < units.length) {
          var j = i, len = 0;
          while (j < units.length && len + (units[j][1] - units[j][0]) <= size) { len += units[j][1] - units[j][0]; j++; }
          if (j === i) j = i + 1;
          out.push([units[i][0], units[j - 1][1]]);
          if (j >= units.length) break;
          var k = j, carry = 0; // carry whole trailing sentences that fit in the overlap budget
          while (k - 1 > i && carry + (units[k - 1][1] - units[k - 1][0]) <= ov) { carry += units[k - 1][1] - units[k - 1][0]; k--; }
          i = k;
        }
        return out;
      }

      var textBox = h('div', { class: 'ck-text', role: 'img', 'aria-label': 'Sample statute text coloured by chunk' });
      w.stage.append(textBox, legend([{ color: '--c1', shape: 'blk', en: 'odd chunk', bn: 'বিজোড় chunk' }, { color: '--c3', shape: 'blk', en: 'even chunk', bn: 'জোড় chunk' },
        { color: '--fg-2', shape: 'stripe', en: 'overlap (stored twice)', bn: 'overlap (দুবার রাখা)' }, { color: '--bad', shape: 'tick', en: 'boundary inside a sentence', bn: 'বাক্যের মাঝে কাটা' }]));
      var sz = sld({ id: 'ck-size', label: 'Chunk size', label_bn: 'Chunk-এর আকার', min: 20, max: 150, step: 5, value: st.size, format: function (v) { return v + ' words'; }, onInput: function (v) { st.size = v; render(); } });
      var ov = sld({ id: 'ck-ov', label: 'Overlap', label_bn: 'মিলে থাকা অংশ', min: 0, max: 50, step: 5, value: st.ovPct, format: function (v) { return v + '% = ' + Math.round(st.size * v / 100) + ' words'; }, onInput: function (v) { st.ovPct = v; render(); } });
      var aw = btn('Sentence-aware', 'বাক্য মেনে কাটা', function () { st.aware = !st.aware; aw.setAttribute('aria-pressed', String(st.aware)); render(); }, false);
      w.controls.append(sz.wrap, ov.wrap, aw);
      var cN = chip('Chunks', 'Chunk সংখ্যা'), cS = chip('Stored words', 'মোট রাখা শব্দ'), cR = chip('Redundancy', 'বাড়তি'), cC = chip('Sentences cut', 'কাটা বাক্য');
      w.readout.append(cN.el, cS.el, cR.el, cC.el);

      function render() {
        var ovW = Math.round(st.size * st.ovPct / 100);
        ov.wrap.querySelector('output').textContent = st.ovPct + '% = ' + ovW + ' words';
        var chunks = st.aware ? awareChunks(st.size, ovW) : fixedChunks(st.size, ovW);
        var owner = words.map(function () { return []; }), starts = {}, ends = {};
        chunks.forEach(function (c, k) { for (var i = c[0]; i < c[1]; i++) owner[i].push(k); starts[c[0]] = k; ends[c[1]] = true; });
        var sentOf = []; sents.forEach(function (r, si) { for (var i = r[0]; i < r[1]; i++) sentOf[i] = si; });
        function mid(p) { return p > 0 && p < NW && sentOf[p] === sentOf[p - 1]; }
        var cut = {};
        chunks.forEach(function (c) { if (mid(c[0])) cut[sentOf[c[0]]] = 1; if (mid(c[1])) cut[sentOf[c[1]]] = 1; });
        clear(textBox);
        words.forEach(function (wd, i) {
          if (starts[i] !== undefined) textBox.appendChild(h('span', { class: 'ck-tag mono' + (mid(i) ? ' is-cut' : '') }, 'C' + (starts[i] + 1)));
          var o = owner[i], cls = o.length > 1 ? 'ck-w ck-ov' : 'ck-w ck-k' + (o[0] % 2);
          textBox.appendChild(h('span', { class: cls }, wd.w + (wd.eol ? '' : ' ')));
          if (ends[i + 1] && mid(i + 1)) textBox.appendChild(h('span', { class: 'ck-end', 'aria-hidden': 'true' }));
          if (wd.eol) textBox.appendChild(h('br'));
        });
        var stored = chunks.reduce(function (a, c) { return a + c[1] - c[0]; }, 0);
        cN.set(String(chunks.length)); cS.set(stored + ' / ' + NW);
        cR.set(fx((stored - NW) / NW * 100, 0) + '%'); cC.set(Object.keys(cut).length + ' / ' + sents.length);
      }
      render();
      return function () {};
    }
  });

  /* ======================================================================
     3. cosine-sim: two draggable vectors, cosine vs dot vs distance
     ====================================================================== */
  KIT.widgets.register('cosine-sim', {
    title: 'Cosine similarity cares about direction',
    title_bn: 'Cosine similarity শুধু দিক দেখে',
    mount: function (host) {
      var w = D.shell({ id: 'cosine-sim', title: this.title, title_bn: this.title_bn,
        caption: 'Cosine ignores length and only measures direction: stretch a vector and cos θ stays put, while the dot product and the distance change. With normalised (unit-length) embeddings, dot product = cosine, which is why vector databases often just use the dot product.',
        caption_bn: 'Cosine দৈর্ঘ্য পাত্তা দেয় না, শুধু দিক মাপে: vector লম্বা করলেও cos θ একই থাকে, কিন্তু dot product আর distance বদলায়। Embedding normalise করা থাকলে (দৈর্ঘ্য 1) dot product = cosine, তাই vector database প্রায়ই সরাসরি dot product ব্যবহার করে।' });
      host.appendChild(w.root);
      var U = 32, O = 160, st = { a: { ang: 20, len: 3.2 }, b: { ang: 65, len: 2.2 } };
      var sv = svg('0 0 320 320', 'Two vectors from the origin on a grid', 'cs-plane');
      var g0 = s('g');
      for (var k = -5; k <= 5; k++) {
        g0.appendChild(s('line', { x1: O + k * U, x2: O + k * U, y1: 0, y2: 320, class: k ? 'grid' : 'axis' }));
        g0.appendChild(s('line', { y1: O + k * U, y2: O + k * U, x1: 0, x2: 320, class: k ? 'grid' : 'axis' }));
      }
      g0.appendChild(s('circle', { cx: O, cy: O, r: U, class: 'cs-unit' }));
      g0.appendChild(s('text', { x: O + U + 3, y: O - 4, class: 'cs-small', text: '1' }));
      var dist = s('line', { class: 'cs-dist' }), arc = s('path', { class: 'cs-arc' }), thLab = s('text', { class: 'cs-th', text: 'θ' });
      sv.append(g0, dist, arc, thLab);
      var V = {};
      ['a', 'b'].forEach(function (key, idx) {
        var col = idx ? '--c5' : '--c1';
        var g = s('g', { style: 'color: var(' + col + ')' });
        var ln = s('line', { class: 'cs-vec' }), head = s('polygon', { class: 'cs-head' }), dot = s('circle', { r: 3.5, class: 'cs-udot' });
        var knob = s('circle', { r: 7, class: 'cs-knob' }), hit = s('circle', { r: 18, class: 'cs-hit', tabindex: '-1' }), lab = s('text', { class: 'cs-lab', text: key });
        g.append(ln, head, dot, knob, lab, hit);
        sv.appendChild(g);
        V[key] = { ln: ln, head: head, dot: dot, knob: knob, hit: hit, lab: lab };
        hit.addEventListener('pointerdown', function (ev) { ev.preventDefault(); hit.setPointerCapture(ev.pointerId); V[key].drag = true; });
        hit.addEventListener('pointermove', function (ev) {
          if (!V[key].drag) return;
          var p = svgPoint(sv, ev), dx = (p.x - O) / U, dy = (O - p.y) / U;
          var ang = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, len = Math.max(0.5, Math.min(4.5, Math.hypot(dx, dy)));
          sl[key + 'ang'].set(Math.round(ang)); sl[key + 'len'].set(Math.round(len * 10) / 10);
        });
        ['pointerup', 'pointercancel'].forEach(function (e) { hit.addEventListener(e, function () { V[key].drag = false; }); });
      });
      var side = h('div', { class: 'cs-side mono' });
      w.stage.appendChild(h('div', { class: 'cs-wrap' }, [sv, side]));

      var sl = {};
      [['a', 'Vector a', 'Vector a'], ['b', 'Vector b', 'Vector b']].forEach(function (r) {
        var key = r[0];
        sl[key + 'ang'] = sld({ id: 'cs-' + key + 'a', label: r[1] + ' angle', label_bn: r[0] + '-এর কোণ', min: 0, max: 359, step: 1, value: st[key].ang, format: function (v) { return v + '°'; }, onInput: function (v) { st[key].ang = v; draw(); } });
        sl[key + 'len'] = sld({ id: 'cs-' + key + 'l', label: r[1] + ' length', label_bn: r[0] + '-এর দৈর্ঘ্য', min: 0.5, max: 4.5, step: 0.1, value: st[key].len, format: function (v) { return fx(v, 1); }, onInput: function (v) { st[key].len = v; draw(); } });
      });
      var presets = h('div', { class: 'wb-btnrow' }, [
        btn('Same direction', 'একই দিক', function () { setAll(30, 4, 30, 1.6); }),
        btn('Orthogonal', 'লম্ব (90°)', function () { setAll(15, 3, 105, 3); }),
        btn('Opposite', 'উল্টো দিক', function () { setAll(40, 3, 220, 2.4); })
      ]);
      w.controls.append(sl.aang.wrap, sl.alen.wrap, sl.bang.wrap, sl.blen.wrap, presets);
      function setAll(a1, l1, a2, l2) { sl.aang.set(a1); sl.alen.set(l1); sl.bang.set(a2); sl.blen.set(l2); }
      var cT = chip('θ', 'θ'), cC = chip('cos θ', 'cos θ'), cD = chip('a · b', 'a · b'), cE = chip('‖a − b‖', '‖a − b‖'), cA = chip('‖a‖', '‖a‖'), cB = chip('‖b‖', '‖b‖');
      w.readout.append(cT.el, cC.el, cD.el, cE.el, cA.el, cB.el);

      function vec(o) { var r = o.ang * Math.PI / 180; return [o.len * Math.cos(r), o.len * Math.sin(r)]; }
      function P(v) { return [O + v[0] * U, O - v[1] * U]; }
      function draw() {
        var a = vec(st.a), b = vec(st.b);
        [['a', a, st.a], ['b', b, st.b]].forEach(function (r) {
          var E = V[r[0]], v = r[1], tip = P(v), ux = v[0] / r[2].len, uy = v[1] / r[2].len;
          var base = [tip[0] - ux * 11, tip[1] + uy * 11];
          E.ln.setAttribute('x1', O); E.ln.setAttribute('y1', O); E.ln.setAttribute('x2', base[0]); E.ln.setAttribute('y2', base[1]);
          E.head.setAttribute('points', [tip, [base[0] - uy * 5, base[1] - ux * 5], [base[0] + uy * 5, base[1] + ux * 5]].map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '));
          var ud = P([ux, uy]); E.dot.setAttribute('cx', ud[0]); E.dot.setAttribute('cy', ud[1]);
          [E.knob, E.hit].forEach(function (c) { c.setAttribute('cx', tip[0]); c.setAttribute('cy', tip[1]); });
          E.lab.setAttribute('x', tip[0] + ux * 14 - 4); E.lab.setAttribute('y', tip[1] - uy * 14 + 4);
        });
        var pa = P(a), pb = P(b);
        dist.setAttribute('x1', pa[0]); dist.setAttribute('y1', pa[1]); dist.setAttribute('x2', pb[0]); dist.setAttribute('y2', pb[1]);
        var dot = a[0] * b[0] + a[1] * b[1], c = dot / (st.a.len * st.b.len), th = Math.acos(Math.max(-1, Math.min(1, c)));
        // arc from the smaller-angle side: rotate from a towards b the short way
        var d = ((st.b.ang - st.a.ang) % 360 + 360) % 360, from = st.a.ang, sweep = d;
        if (d > 180) { from = st.b.ang; sweep = 360 - d; }
        var R = 24, r0 = from * Math.PI / 180, r1 = (from + sweep) * Math.PI / 180, rm = (from + sweep / 2) * Math.PI / 180;
        arc.setAttribute('d', 'M' + (O + R * Math.cos(r0)) + ' ' + (O - R * Math.sin(r0)) + ' A' + R + ' ' + R + ' 0 0 0 ' + (O + R * Math.cos(r1)) + ' ' + (O - R * Math.sin(r1)));
        thLab.setAttribute('x', O + 38 * Math.cos(rm) - 4); thLab.setAttribute('y', O - 38 * Math.sin(rm) + 4);
        var ed = Math.hypot(a[0] - b[0], a[1] - b[1]);
        clear(side);
        [['a = (' + fx(a[0]) + ', ' + fx(a[1]) + ')', 'cs-ca'], ['b = (' + fx(b[0]) + ', ' + fx(b[1]) + ')', 'cs-cb'],
          ['a·b = ax·bx + ay·by'], ['    = ' + fx(a[0]) + '×' + fx(b[0]) + ' + ' + fx(a[1]) + '×' + fx(b[1])], ['    = ' + fx(dot)],
          ['cos θ = a·b / (‖a‖ ‖b‖)'], ['      = ' + fx(dot) + ' / (' + fx(st.a.len) + ' × ' + fx(st.b.len) + ')'], ['      = ' + fx(c, 3), 'cs-strong'],
          ['â·b̂ (unit vectors) = ' + fx(c, 3)]].forEach(function (l) { side.appendChild(h('div', { class: l[1] || '' }, l[0])); });
        side.appendChild(h('div', { class: 'cs-note' }, t('Dots on the dashed unit circle are the normalised vectors.', 'ড্যাশ দেওয়া unit circle-এর উপরের বিন্দুগুলো normalised vector।')));
        cT.set(fx(th * 180 / Math.PI, 1) + '°'); cC.set(fx(c, 3)); cD.set(fx(dot)); cE.set(fx(ed)); cA.set(fx(st.a.len)); cB.set(fx(st.b.len));
        sv.setAttribute('aria-label', 'Vectors a and b, angle ' + fx(th * 180 / Math.PI, 0) + ' degrees, cosine ' + fx(c, 2));
      }
      draw();
      return function () {};
    }
  });

  /* ======================================================================
     4. hybrid-search: weighted score fusion vs reciprocal rank fusion
     ====================================================================== */
  KIT.widgets.register('hybrid-search', {
    title: 'Hybrid search: keywords + meaning',
    title_bn: 'Hybrid search: keyword + অর্থ',
    mount: function (host) {
      var w = D.shell({ id: 'hybrid-search', title: this.title, title_bn: this.title_bn,
        caption: 'BM25 wins on exact tokens such as "379"; semantic search wins on paraphrases ("steals … jailed"). A weighted mix catches both. RRF throws the raw scores away and adds 1/(k + rank) from each list, so it needs no score normalisation.',
        caption_bn: 'BM25 জেতে হুবহু শব্দে, যেমন "379"; semantic search জেতে একই মানে অন্য কথায় লেখা হলে ("steals … jailed")। দুটো মেশালে দুই ধরনই ধরা পড়ে। RRF আসল score ফেলে দিয়ে প্রতিটা list থেকে 1/(k + rank) যোগ করে, তাই score normalise করতে হয় না।' });
      host.appendChild(w.root);
      var K = 60, ROW = 70;
      var DOCS = [
        ['D1', 'Section 379: punishment for theft is imprisonment up to three years, a fine, or both.', 1.00, 0.80, null],
        ['D2', 'Anyone who steals another person\'s belongings can be jailed for up to three years.', 0.10, 0.90, ['paraphrase', 'অন্য কথায়']],
        ['D3', 'Section 380: theft in a dwelling house, up to seven years and a fine.', 0.62, 0.71, null],
        ['D4', 'Index page: Section 379 · Section 380 · Section 381 · Section 382', 0.78, 0.32, ['exact keyword', 'হুবহু keyword']],
        ['D5', 'Knowingly receiving stolen property is punishable as a separate offence.', 0.30, 0.62, null],
        ['D6', 'Section 447: punishment for criminal trespass.', 0.45, 0.30, null]
      ].map(function (r) { return { id: r[0], text: r[1], bm: r[2], sem: r[3], tag: r[4] }; });
      function ranks(key) { var o = DOCS.slice().sort(function (a, b) { return b[key] - a[key]; }); o.forEach(function (d, i) { d['r_' + key] = i + 1; }); }
      ranks('bm'); ranks('sem');
      var st = { w: 0.6, rrf: false };

      w.stage.appendChild(h('div', { class: 'hs-query' }, [h('span', { class: 'w-label' }, t('Query', 'প্রশ্ন')), h('span', { class: 'mono' }, 'Section 379 theft punishment')]));
      var list = h('div', { class: 'hs-list', style: { height: DOCS.length * ROW + 'px' } });
      DOCS.forEach(function (d) {
        d.rank = h('span', { class: 'hs-rank mono' });
        d.p1 = h('i', { style: { background: 'var(--c1)' } }); d.p2 = h('i', { style: { background: 'var(--c2)' } });
        d.score = h('span', { class: 'hs-score mono' });
        d.row = h('div', { class: 'hs-row', title: d.id + ': ' + d.text }, [d.rank, h('div', { class: 'hs-body' }, [
          h('div', { class: 'hs-text' }, [h('b', { class: 'mono' }, d.id + ' '), d.tag ? h('span', { class: 'hs-tag' }, t(d.tag[0], d.tag[1])) : null, ' ' + d.text]),
          h('span', { class: 'wb-bar hs-stack' }, [d.p1, d.p2])]), d.score]);
        list.appendChild(d.row);
      });
      w.stage.append(list, legend([{ color: '--c1', shape: 'blk', en: 'semantic part', bn: 'semantic অংশ' }, { color: '--c2', shape: 'blk', en: 'BM25 part', bn: 'BM25 অংশ' }]));

      var sl = sld({ id: 'hs-w', label: 'Semantic weight w', label_bn: 'Semantic-এর ওজন w', min: 0, max: 1, step: 0.05, value: st.w, format: function (v) { return fx(v); }, onInput: function (v) { st.w = v; render(); } });
      sl.wrap.appendChild(h('div', { class: 'hs-marks', 'aria-hidden': 'true' }, [h('span', { class: 'hs-end' }, t('BM25 only', 'শুধু BM25')),
        h('span', { class: 'hs-thesis' }, t('my thesis: w = 0.6', 'আমার thesis: w = 0.6')), h('span', { class: 'hs-end hs-r' }, t('semantic only', 'শুধু semantic'))]));
      var rrfBtn = btn('RRF (k = 60)', 'RRF (k = 60)', function () { st.rrf = !st.rrf; rrfBtn.setAttribute('aria-pressed', String(st.rrf)); render(); }, false);
      var thesisBtn = btn('Use w = 0.6', 'w = 0.6 নাও', function () { if (st.rrf) rrfBtn.click(); sl.set(0.6); });
      w.controls.append(sl.wrap, h('div', { class: 'wb-btnrow' }, [thesisBtn, rrfBtn]));
      var cTop = chip('Top 3', 'Top 3'), cF = chip('Score', 'Score');
      w.readout.append(cTop.el, cF.el);

      function render() {
        sl.input.disabled = st.rrf;
        var maxR = 2 / (K + 1);
        DOCS.forEach(function (d) {
          if (st.rrf) { d.a = 1 / (K + d.r_sem); d.b = 1 / (K + d.r_bm); d.val = d.a + d.b; d.f1 = d.a / maxR; d.f2 = d.b / maxR; }
          else { d.a = st.w * d.sem; d.b = (1 - st.w) * d.bm; d.val = d.a + d.b; d.f1 = d.a; d.f2 = d.b; }
        });
        var order = DOCS.slice().sort(function (a, b) { return b.val - a.val; });
        order.forEach(function (d, i) {
          d.row.style.transform = 'translateY(' + i * ROW + 'px)';
          d.row.classList.toggle('is-top', i < 3);
          d.rank.textContent = '#' + (i + 1);
          d.p1.style.width = d.f1 * 100 + '%'; d.p2.style.width = d.f2 * 100 + '%';
          d.score.textContent = st.rrf ? fx(d.val, 4) : fx(d.val);
        });
        cTop.set(order.slice(0, 3).map(function (d) { return d.id; }).join(', '));
        cF.set(st.rrf ? 'Σ 1/(60 + rank)' : fx(st.w) + '·sem + ' + fx(1 - st.w) + '·BM25');
      }
      render();
      return function () {};
    }
  });

  /* ======================================================================
     5. bias-variance: dartboards + the U-shaped total error
     ====================================================================== */
  KIT.widgets.register('bias-variance', {
    title: 'Bias, variance and the sweet spot',
    title_bn: 'Bias, variance আর সেরা জায়গা',
    mount: function (host) {
      var w = D.shell({ id: 'bias-variance', title: this.title, title_bn: this.title_bn,
        caption: 'Bias = how far the average guess is from the bullseye (too simple a model). Variance = how much the guesses scatter when the training data changes (too flexible a model). Expected error = bias² + variance + noise; as complexity grows bias² falls and variance rises, so total error is U-shaped and the sweet spot sits at its bottom.',
        caption_bn: 'Bias = গড় অনুমান লক্ষ্য থেকে কত দূরে (model খুব সরল)। Variance = training data বদলালে অনুমান কতটা ছড়িয়ে যায় (model খুব নমনীয়)। মোট error = bias² + variance + noise; complexity বাড়লে bias² কমে আর variance বাড়ে, তাই মোট error U আকারের, আর তার তলাতেই সেরা জায়গা।' });
      host.appendChild(w.root);
      var r = rng(5), Z = [];
      for (var i = 0; i < 14; i++) Z.push([gauss(r), gauss(r)]);
      var DIR = [Math.cos(0.7), -Math.sin(0.7)];
      function board(size, bias, sd) {
        var c = size / 2, R = size / 2 - 4, sv = svg('0 0 ' + size + ' ' + size, 'Dartboard: bias ' + fx(bias) + ', spread ' + fx(sd), 'bv-board');
        [1, 0.75, 0.5, 0.25].forEach(function (f, k) { sv.appendChild(s('circle', { cx: c, cy: c, r: R * f, class: 'bv-ring' + (k % 2) })); });
        sv.appendChild(s('circle', { cx: c, cy: c, r: R * 0.09, class: 'bv-bull' }));
        var g = s('g'); sv.appendChild(g);
        function set(b, sdv) {
          clear(g);
          var mx = 0, my = 0;
          Z.forEach(function (z) {
            var x = c + (DIR[0] * b + z[0] * sdv) * R, y = c + (DIR[1] * b + z[1] * sdv) * R;
            mx += x / Z.length; my += y / Z.length;
            g.appendChild(s('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: Math.max(2.6, size / 46), class: 'bv-dart' }));
          });
          g.appendChild(s('path', { d: 'M' + (mx - 5) + ' ' + my + 'h10M' + mx + ' ' + (my - 5) + 'v10', class: 'bv-mean' }));
        }
        set(bias, sd);
        return { el: sv, set: set };
      }
      // (a) four fixed regimes
      var CELLS = [[0.04, 0.07, 'Low bias · low variance', 'কম bias · কম variance', 'the goal', 'লক্ষ্য এটাই'],
        [0.04, 0.30, 'Low bias · high variance', 'কম bias · বেশি variance', 'overfit', 'overfit'],
        [0.55, 0.07, 'High bias · low variance', 'বেশি bias · কম variance', 'underfit', 'underfit'],
        [0.55, 0.30, 'High bias · high variance', 'বেশি bias · বেশি variance', 'worst of both', 'দুটোই খারাপ']];
      var grid = h('div', { class: 'bv-grid' }, CELLS.map(function (cdef) {
        return h('div', { class: 'bv-cell' }, [board(120, cdef[0], cdef[1]).el, h('div', { class: 'bv-cl' }, t(cdef[2], cdef[3])), h('div', { class: 'bv-cs' }, t(cdef[4], cdef[5]))]);
      }));
      // (b) complexity sweep with the real U-shape
      function b2(c) { return 0.8 * Math.exp(-0.5 * (c - 1)); }
      function vr(c) { return 0.02 * Math.exp(0.42 * (c - 1)); }
      var NOISE = 0.08;
      function tot(c) { return b2(c) + vr(c) + NOISE; }
      var best = 1; for (var c = 1; c <= 10; c += 0.01) if (tot(c) < tot(best)) best = c;
      var box = { l: 38, r: 310, t: 16, b: 186 }, xs = lin(1, 10, box.l, box.r), ys = lin(0, 1.1, box.b, box.t);
      var ch = svg('0 0 320 220', 'Bias squared, variance and total error versus model complexity', 'bv-chart');
      ch.appendChild(axes(box, xs, ys, [1, 4, 7, 10], [0, 0.5, 1], function (v) { return v; }, function (v) { return fx(v, 1); }));
      ch.appendChild(stext({ x: (box.l + box.r) / 2, y: 216, 'text-anchor': 'middle', class: 'wb-muted' }, 'model complexity →', 'model-এর জটিলতা →'));
      ch.appendChild(stext({ x: box.l, y: 10, class: 'wb-muted' }, 'error', 'error'));
      function curve(fn, cls) { var pts = []; for (var c2 = 1; c2 <= 10.001; c2 += 0.1) pts.push([xs(c2), ys(Math.min(1.1, fn(c2)))]); ch.appendChild(s('path', { d: pathD(pts), class: 'bv-curve ' + cls })); }
      ch.appendChild(s('line', { x1: xs(best), x2: xs(best), y1: box.t, y2: box.b, class: 'bv-best' }));
      ch.appendChild(stext({ x: xs(best) + 4, y: box.t + 10, class: 'wb-strong' }, 'sweet spot', 'সেরা জায়গা'));
      curve(function () { return NOISE; }, 'bv-noise'); curve(b2, 'bv-b2'); curve(vr, 'bv-var'); curve(tot, 'bv-tot');
      var mk = s('line', { y1: box.t, y2: box.b, class: 'bv-mk' }); ch.appendChild(mk);
      var dots = ['bv-b2', 'bv-var', 'bv-tot'].map(function (cls) { var d = s('circle', { r: 4.5, class: 'bv-dot ' + cls }); ch.appendChild(d); return d; });
      var live = board(150, 0, 0), regime = h('div', { class: 'bv-regime' });
      w.stage.appendChild(h('div', { class: 'bv-layout' }, [
        h('div', null, [h('div', { class: 'wb-sub' }, t('(a) Four regimes', '(a) চার রকম অবস্থা')), grid]),
        h('div', null, [h('div', { class: 'wb-sub' }, t('(b) Sweep model complexity', '(b) Model complexity বদলে দেখো')), ch,
          legend([{ color: '--c1', shape: 'line', en: 'bias²', bn: 'bias²' }, { color: '--c5', shape: 'line', en: 'variance', bn: 'variance' }, { color: '--muted', shape: 'dash', en: 'noise', bn: 'noise' }, { color: '--c4', shape: 'line', en: 'total error', bn: 'মোট error' }]),
          h('div', { class: 'bv-live' }, [live.el, regime])])]));
      var sl = sld({ id: 'bv-c', label: 'Model complexity', label_bn: 'Model-এর জটিলতা', min: 1, max: 10, step: 0.1, value: 2, format: function (v) { return fx(v, 1); }, onInput: render });
      w.controls.append(sl.wrap, btn('Jump to sweet spot', 'সেরা জায়গায় যাও', function () { sl.set(Math.round(best * 10) / 10); }));
      var cB = chip('bias²', 'bias²'), cV = chip('variance', 'variance'), cN = chip('noise', 'noise'), cT = chip('total', 'মোট');
      w.readout.append(cB.el, cV.el, cN.el, cT.el);
      function render(c) {
        var vals = [b2(c), vr(c), tot(c)];
        mk.setAttribute('x1', xs(c)); mk.setAttribute('x2', xs(c));
        dots.forEach(function (d, k) { d.setAttribute('cx', xs(c)); d.setAttribute('cy', ys(Math.min(1.1, vals[k]))); });
        live.set(0.85 * Math.sqrt(vals[0]), 0.5 * Math.sqrt(vals[1]));
        clear(regime);
        var reg = Math.abs(c - best) < 0.8 ? ['Near the sweet spot: both errors small.', 'সেরা জায়গার কাছে: দুটো error-ই কম।'] :
          c < best ? ['Underfit: darts cluster, but off-centre (high bias).', 'Underfit: তীর এক জায়গায়, কিন্তু লক্ষ্য থেকে সরে (বেশি bias)।'] :
            ['Overfit: centred on average, but scattered (high variance).', 'Overfit: গড়ে মাঝখানে, কিন্তু ছড়ানো (বেশি variance)।'];
        regime.append(h('div', { class: 'wb-sub' }, t('Your model at complexity ' + fx(c, 1), 'Complexity ' + fx(c, 1) + '-এ তোমার model')), h('div', null, t(reg[0], reg[1])));
        cB.set(fx(vals[0], 3)); cV.set(fx(vals[1], 3)); cN.set(fx(NOISE, 3)); cT.set(fx(vals[2], 3));
      }
      render(2);
      return function () {};
    }
  });

  /* ======================================================================
     6. overfit-poly: real ridge least-squares polynomial fits
     ====================================================================== */
  KIT.widgets.register('overfit-poly', {
    title: 'Underfit, good fit, overfit',
    title_bn: 'Underfit, ঠিকঠাক fit, overfit',
    mount: function (host) {
      var w = D.shell({ id: 'overfit-poly', title: this.title, title_bn: this.title_bn,
        caption: 'Low degree underfits: both errors are high. Around degree 3–5 the curve follows sin(2πx) and validation error is lowest. High degree overfits: it threads every training point (train MSE → 0) but swings between them, so validation error climbs. Raising λ (L2 / ridge) shrinks the weights and tames the swings. Fit: least squares on Legendre polynomials of x scaled to [−1, 1], solved by Gaussian elimination with pivoting.',
        caption_bn: 'কম degree-তে underfit: দুই error-ই বেশি। degree 3–5-এর আশেপাশে curve আসল sin(2πx)-এর মতো চলে, validation error সবচেয়ে কম। বেশি degree-তে overfit: প্রতিটা training বিন্দু ছুঁয়ে যায় (train MSE → 0) কিন্তু মাঝে দোল খায়, তাই validation error বাড়ে। λ (L2 / ridge) বাড়ালে weight ছোট হয়, দোলও কমে।' });
      host.appendChild(w.root);
      function make(seed) { var r = rng(seed), p = []; for (var i = 0; i < 12; i++) { var x = (i + 0.15 + 0.7 * r()) / 12; p.push([x, Math.sin(2 * Math.PI * x) + 0.25 * gauss(r)]); } return p; }
      var TR = make(7), VA = make(23);
      var LAMS = [0, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1];
      function leg(u, d) { var P = [1, u]; for (var k = 1; k < d; k++) P.push(((2 * k + 1) * u * P[k] - k * P[k - 1]) / (k + 1)); return P.slice(0, d + 1); }
      function solve(A, b) { // Gaussian elimination with partial pivoting
        var n = b.length, c, r2, k;
        for (c = 0; c < n; c++) {
          var p = c; for (r2 = c + 1; r2 < n; r2++) if (Math.abs(A[r2][c]) > Math.abs(A[p][c])) p = r2;
          var tmp = A[c]; A[c] = A[p]; A[p] = tmp; tmp = b[c]; b[c] = b[p]; b[p] = tmp;
          for (r2 = c + 1; r2 < n; r2++) { var f = A[r2][c] / A[c][c]; for (k = c; k < n; k++) A[r2][k] -= f * A[c][k]; b[r2] -= f * b[c]; }
        }
        var x = new Array(n);
        for (var i = n - 1; i >= 0; i--) { var sm = b[i]; for (k = i + 1; k < n; k++) sm -= A[i][k] * x[k]; x[i] = sm / A[i][i]; }
        return x;
      }
      function fit(d, lam) { // minimise mean squared error + lam·||w||² (intercept not penalised)
        var m = d + 1, A = [], b = [], i, j;
        for (i = 0; i < m; i++) { A.push(new Array(m).fill(0)); b.push(0); }
        TR.forEach(function (pt) { var f = leg(2 * pt[0] - 1, d); for (i = 0; i < m; i++) { b[i] += f[i] * pt[1] / TR.length; for (j = 0; j < m; j++) A[i][j] += f[i] * f[j] / TR.length; } });
        for (i = 1; i < m; i++) A[i][i] += lam + 1e-12;
        return solve(A, b);
      }
      function ev(wt, x) { var f = leg(2 * x - 1, wt.length - 1), v = 0; for (var i = 0; i < f.length; i++) v += f[i] * wt[i]; return v; }
      function mse(wt, pts) { return pts.reduce(function (a, p) { var e = ev(wt, p[0]) - p[1]; return a + e * e; }, 0) / pts.length; }

      var cid = uid('op-clip');
      var box = { l: 34, r: 312, t: 12, b: 196 }, xs = lin(0, 1, box.l, box.r), ys = lin(-2, 2, box.b, box.t);
      var main = svg('0 0 320 222', 'Training and validation points with the fitted polynomial', 'op-main');
      main.appendChild(s('defs', null, s('clipPath', { id: cid }, s('rect', { x: box.l, y: box.t, width: box.r - box.l, height: box.b - box.t }))));
      main.appendChild(axes(box, xs, ys, [0, 0.25, 0.5, 0.75, 1], [-2, -1, 0, 1, 2], function (v) { return String(v); }, function (v) { return String(v); }));
      var truth = []; for (var q = 0; q <= 100; q++) truth.push([xs(q / 100), ys(Math.sin(2 * Math.PI * q / 100))]);
      main.appendChild(s('path', { d: pathD(truth), class: 'op-true' }));
      var fitPath = s('path', { class: 'op-fit', 'clip-path': 'url(#' + cid + ')' }); main.appendChild(fitPath);
      VA.forEach(function (p) { main.appendChild(s('circle', { cx: xs(p[0]), cy: ys(p[1]), r: 4, class: 'op-val' })); });
      TR.forEach(function (p) { main.appendChild(s('circle', { cx: xs(p[0]), cy: ys(p[1]), r: 4, class: 'op-tr' })); });

      var b2x = { l: 44, r: 312, t: 12, b: 196 }, dx = lin(0, 11, b2x.l, b2x.r), dy = lin(-3, 0, b2x.b, b2x.t);
      var sec = svg('0 0 320 222', 'Train and validation MSE versus polynomial degree', 'op-sec');
      sec.appendChild(axes(b2x, dx, dy, [0, 3, 6, 9, 11], [-3, -2, -1, 0], function (v) { return String(v); }, function (v) { return ['0.001', '0.01', '0.1', '1'][v + 3]; }));
      var gSec = s('g'); sec.appendChild(gSec);
      w.stage.appendChild(h('div', { class: 'op-grid' }, [
        h('div', null, [h('div', { class: 'wb-sub' }, t('Fit', 'Fit')), main, legend([{ color: '--c1', en: 'train', bn: 'train' }, { color: '--c5', shape: 'ring', en: 'validation', bn: 'validation' }, { color: '--c4', shape: 'line', en: 'fitted curve', bn: 'fit করা curve' }, { color: '--muted', shape: 'dash', en: 'true sin(2πx)', bn: 'আসল sin(2πx)' }])]),
        h('div', null, [h('div', { class: 'wb-sub' }, t('MSE vs degree (log scale)', 'Degree অনুযায়ী MSE (log scale)')), sec, legend([{ color: '--c1', shape: 'line', en: 'train MSE', bn: 'train MSE' }, { color: '--c5', shape: 'line', en: 'validation MSE', bn: 'validation MSE' }])])]));

      var st = { d: 3, li: 0 };
      var sd = sld({ id: 'op-d', label: 'Polynomial degree', label_bn: 'Polynomial-এর degree', min: 0, max: 11, step: 1, value: st.d, onInput: function (v) { st.d = v; render(); } });
      var sL = sld({ id: 'op-l', label: 'L2 penalty λ', label_bn: 'L2 penalty λ', min: 0, max: LAMS.length - 1, step: 1, value: 0, format: function (v) { return LAMS[v] ? '1e' + Math.round(Math.log10(LAMS[v])) : '0'; }, onInput: function (v) { st.li = v; render(); } });
      w.controls.append(sd.wrap, sL.wrap);
      var cTr = chip('Train MSE', 'Train MSE'), cVa = chip('Validation MSE', 'Validation MSE'), cR = chip('Regime', 'অবস্থা');
      w.readout.append(cTr.el, cVa.el, cR.el);
      function lg(v) { return Math.max(-3, Math.min(0, Math.log10(Math.max(v, 1e-9)))); }
      function render() {
        var lam = LAMS[st.li], curves = { tr: [], va: [] }, raw = [], cur = null;
        for (var d = 0; d <= 11; d++) {
          var wt = fit(d, lam), a = mse(wt, TR), b = mse(wt, VA);
          curves.tr.push([dx(d), dy(lg(a))]); curves.va.push([dx(d), dy(lg(b))]); raw.push(b);
          if (d === st.d) cur = { wt: wt, a: a, b: b };
        }
        var pts = []; for (var k = 0; k <= 240; k++) { var x = k / 240; pts.push([xs(x), ys(Math.max(-9, Math.min(9, ev(cur.wt, x))))]); }
        fitPath.setAttribute('d', pathD(pts));
        clear(gSec);
        gSec.appendChild(s('line', { x1: dx(st.d), x2: dx(st.d), y1: b2x.t, y2: b2x.b, class: 'op-mk' }));
        [['tr', 'op-ltr'], ['va', 'op-lva']].forEach(function (r2) {
          gSec.appendChild(s('path', { d: pathD(curves[r2[0]]), class: 'op-line ' + r2[1] }));
          curves[r2[0]].forEach(function (p, i) { gSec.appendChild(s('circle', { cx: p[0], cy: p[1], r: i === st.d ? 5 : 2.5, class: 'op-pt ' + r2[1] })); });
        });
        cTr.set(cur.a < 1e-4 ? '≈ 0' : fx(cur.a, 3)); cVa.set(fx(cur.b, 3));
        var bestVa = Math.min.apply(null, raw);
        var reg = cur.a > 0.15 ? ['underfit', 'underfit'] : (cur.b > 1.6 * bestVa && cur.a < 0.6 * cur.b) ? ['overfit', 'overfit'] : ['good fit', 'ঠিকঠাক fit'];
        cR.set(t(reg[0], reg[1]));
      }
      render();
      return function () {};
    }
  });

  /* ======================================================================
     7. confusion-roc: one threshold drives the matrix, ROC and PR curves
     ====================================================================== */
  KIT.widgets.register('confusion-roc', {
    title: 'Threshold → confusion matrix → ROC and PR',
    title_bn: 'Threshold → confusion matrix → ROC আর PR',
    mount: function (host) {
      var w = D.shell({ id: 'confusion-roc', title: this.title, title_bn: this.title_bn,
        caption: 'Moving the threshold trades recall for precision. ROC (TPR vs FPR) and its AUC ignore class balance; PR (precision vs recall) and AP do not, so on rare positives AP drops while AUC still looks good. Accuracy paradox: with 10% positives, a model that always says "negative" scores 90% accuracy and catches nothing.',
        caption_bn: 'Threshold সরালে recall আর precision-এর মধ্যে দেওয়া-নেওয়া হয়। ROC (TPR বনাম FPR) আর তার AUC class-এর অনুপাত দেখে না; PR (precision বনাম recall) আর AP দেখে, তাই positive কম হলে AP পড়ে যায় কিন্তু AUC ভালো দেখায়। Accuracy paradox: 10% positive হলে, সবসময় "negative" বলা model-ও 90% accuracy পায়, অথচ একটাও ধরে না।' });
      host.appendChild(w.root);
      function gen(nPos, nNeg, seed) {
        var r = rng(seed), out = [];
        for (var i = 0; i < nPos + nNeg; i++) { var y = i < nPos ? 1 : 0; out.push({ y: y, s: Math.max(0.02, Math.min(0.98, (y ? 0.63 : 0.40) + 0.15 * gauss(r))), j: r() }); }
        return out;
      }
      var SETS = { bal: gen(30, 30, 11), imb: gen(6, 54, 39) };
      var st = { t: 0.5, set: 'bal' };
      function counts(data, th) {
        var c = { tp: 0, fp: 0, fn: 0, tn: 0 };
        data.forEach(function (d) { var p = d.s >= th; if (d.y) { if (p) c.tp++; else c.fn++; } else if (p) c.fp++; else c.tn++; });
        return c;
      }
      function curves(data) { // sweep every distinct score as a threshold (high → low)
        var ths = data.map(function (d) { return d.s; }).sort(function (a, b) { return b - a; }).filter(function (v, i, a) { return !i || v !== a[i - 1]; });
        var P = data.filter(function (d) { return d.y; }).length, Nn = data.length - P;
        var roc = [[0, 0]], pr = [], auc = 0, ap = 0, prevR = 0;
        ths.forEach(function (th) {
          var c = counts(data, th), tpr = c.tp / P, fpr = c.fp / Nn, prec = c.tp / (c.tp + c.fp);
          var last = roc[roc.length - 1]; auc += (fpr - last[0]) * (tpr + last[1]) / 2; roc.push([fpr, tpr]);
          ap += (tpr - prevR) * prec; prevR = tpr; pr.push([tpr, prec]);
        });
        return { roc: roc, pr: pr, auc: auc, ap: ap, prev: P / data.length };
      }
      // score strip
      var sbox = { l: 34, r: 310, t: 18, b: 104 }, sx = lin(0, 1, sbox.l, sbox.r);
      var strip = svg('0 0 320 126', '60 examples placed by model score, with the threshold', 'cr-strip');
      strip.appendChild(axes(sbox, sx, function (v) { return v; }, [0, 0.25, 0.5, 0.75, 1], [], function (v) { return String(v); }, null));
      var shade = s('rect', { y: sbox.t, height: sbox.b - sbox.t, class: 'cr-shade' }); strip.insertBefore(shade, strip.firstChild);
      strip.appendChild(s('text', { x: 4, y: 46, text: 'pos', class: 'wb-muted' })); strip.appendChild(s('text', { x: 4, y: 84, text: 'neg', class: 'wb-muted' }));
      var gDots = s('g'), thLine = s('line', { y1: sbox.t - 4, y2: sbox.b, class: 'cr-th' }), thLab = s('text', { y: 12, class: 'wb-strong', 'text-anchor': 'middle' });
      strip.append(gDots, thLine, thLab);
      // matrix
      var cells = {};
      function cell(k, en, bn) { cells[k] = h('b', { class: 'mono' }); return h('div', { class: 'cr-cell cr-' + k }, [h('span', null, t(en, bn)), cells[k]]); }
      var mx = h('div', { class: 'cr-mx' }, [h('span'), h('span', { class: 'cr-hd' }, t('Predicted +', 'Predicted +')), h('span', { class: 'cr-hd' }, t('Predicted −', 'Predicted −')),
        h('span', { class: 'cr-hd cr-side' }, t('Actual +', 'আসল +')), cell('tp', 'TP', 'TP'), cell('fn', 'FN', 'FN'),
        h('span', { class: 'cr-hd cr-side' }, t('Actual −', 'আসল −')), cell('fp', 'FP', 'FP'), cell('tn', 'TN', 'TN')]);
      var para = h('div', { class: 'w-note cr-para' });
      var slotT = h('div', { class: 'cr-slot' });
      // ROC + PR charts
      var cbox = { l: 40, r: 288, t: 12, b: 214 }, cx = lin(0, 1, cbox.l, cbox.r), cy = lin(0, 1, cbox.b, cbox.t);
      function chart(aria, xl, yl) {
        var sv = svg('0 0 300 250', aria, 'cr-chart');
        sv.appendChild(axes(cbox, cx, cy, [0, 0.5, 1], [0, 0.5, 1], String, String));
        sv.appendChild(s('text', { x: (cbox.l + cbox.r) / 2, y: 246, 'text-anchor': 'middle', class: 'wb-muted', text: xl }));
        sv.appendChild(s('text', { x: -(cbox.t + cbox.b) / 2, y: 12, transform: 'rotate(-90)', 'text-anchor': 'middle', class: 'wb-muted', text: yl }));
        var o = { el: sv, base: s('line', { class: 'cr-base' }), path: s('path', { class: 'cr-curve' }), pt: s('circle', { r: 6, class: 'cr-pt' }), lab: s('text', { x: cbox.r - 6, y: cbox.b - 10, 'text-anchor': 'end', class: 'wb-strong cr-big' }) };
        sv.append(o.base, o.path, o.pt, o.lab);
        return o;
      }
      var roc = chart('ROC curve', 'FPR (false positive rate)', 'TPR (recall)'), pr = chart('Precision-recall curve', 'recall', 'precision');
      w.stage.appendChild(h('div', { class: 'cr-grid' }, [
        h('div', null, [h('div', { class: 'wb-sub' }, t('Scores of 60 examples', '60টা উদাহরণের score')), strip,
          legend([{ color: '--c5', en: 'positive', bn: 'positive' }, { color: '--c1', en: 'negative', bn: 'negative' }, { color: '--fg-2', shape: 'ring', en: 'hollow = misclassified', bn: 'ফাঁপা = ভুল' }]), slotT]),
        h('div', null, [h('div', { class: 'wb-sub' }, t('Confusion matrix', 'Confusion matrix')), mx, para]),
        h('div', null, [h('div', { class: 'wb-sub' }, t('ROC curve', 'ROC curve')), roc.el]),
        h('div', null, [h('div', { class: 'wb-sub' }, t('Precision-recall curve', 'Precision-recall curve')), pr.el])]));

      var sl = sld({ id: 'cr-t', label: 'Threshold (predict + if score ≥ t)', label_bn: 'Threshold (score ≥ t হলে +)', min: 0.02, max: 0.98, step: 0.01, value: st.t, format: function (v) { return fx(v); }, onInput: function (v) { st.t = v; render(); } });
      var bBal = btn('Balanced (50% +)', 'সমান (50% +)', function () { pick('bal'); }, true);
      var bImb = btn('Imbalanced (10% +)', 'অসম (10% +)', function () { pick('imb'); }, false);
      w.controls.append(h('div', { class: 'wb-btnrow' }, [bBal, bImb]));
      var C = {};
      [['acc', 'Accuracy', 'Accuracy'], ['prec', 'Precision', 'Precision'], ['rec', 'Recall (TPR)', 'Recall (TPR)'], ['spec', 'Specificity', 'Specificity'], ['fpr', 'FPR', 'FPR'], ['f1', 'F1', 'F1'], ['neg', 'Always-negative acc.', 'সব "−" বললে acc.']]
        .forEach(function (r) { C[r[0]] = chip(r[1], r[2]); w.readout.appendChild(C[r[0]].el); });
      slotT.appendChild(sl.wrap);
      var cache = {};
      function pick(k) { st.set = k; bBal.setAttribute('aria-pressed', String(k === 'bal')); bImb.setAttribute('aria-pressed', String(k === 'imb')); render(); }
      function pct(v) { return isFinite(v) ? fx(v * 100, 0) + '%' : '—'; }
      function render() {
        var data = SETS[st.set], cv = cache[st.set] || (cache[st.set] = curves(data)), c = counts(data, st.t);
        var P = c.tp + c.fn, Nn = c.fp + c.tn, prec = c.tp / (c.tp + c.fp), rec = c.tp / P, f1 = 2 * prec * rec / (prec + rec);
        shade.setAttribute('x', sx(st.t)); shade.setAttribute('width', sbox.r - sx(st.t));
        thLine.setAttribute('x1', sx(st.t)); thLine.setAttribute('x2', sx(st.t)); thLab.setAttribute('x', Math.min(285, Math.max(50, sx(st.t)))); thLab.textContent = 't = ' + fx(st.t);
        clear(gDots);
        data.forEach(function (d) {
          var ok = (d.s >= st.t) === !!d.y;
          gDots.appendChild(s('circle', { cx: sx(d.s), cy: (d.y ? 42 : 80) + (d.j - 0.5) * 22, r: 4, class: 'cr-dot ' + (d.y ? 'cr-pos' : 'cr-neg') + (ok ? '' : ' is-wrong') }));
        });
        ['tp', 'fp', 'fn', 'tn'].forEach(function (k) { cells[k].textContent = c[k]; });
        clear(para);
        para.appendChild(t('Always saying "negative": accuracy ' + pct(Nn / data.length) + ', recall 0%.', 'সবসময় "negative" বললে: accuracy ' + pct(Nn / data.length) + ', recall 0%।'));
        roc.path.setAttribute('d', pathD(cv.roc.map(function (p) { return [cx(p[0]), cy(p[1])]; })));
        roc.base.setAttribute('x1', cx(0)); roc.base.setAttribute('y1', cy(0)); roc.base.setAttribute('x2', cx(1)); roc.base.setAttribute('y2', cy(1));
        roc.pt.setAttribute('cx', cx(c.fp / Nn)); roc.pt.setAttribute('cy', cy(rec)); roc.lab.textContent = 'AUC = ' + fx(cv.auc, 3);
        pr.path.setAttribute('d', pathD(cv.pr.map(function (p) { return [cx(p[0]), cy(p[1])]; })));
        pr.base.setAttribute('x1', cx(0)); pr.base.setAttribute('x2', cx(1)); pr.base.setAttribute('y1', cy(cv.prev)); pr.base.setAttribute('y2', cy(cv.prev));
        pr.pt.style.display = isFinite(prec) ? '' : 'none';
        if (isFinite(prec)) { pr.pt.setAttribute('cx', cx(rec)); pr.pt.setAttribute('cy', cy(prec)); }
        pr.lab.textContent = 'AP = ' + fx(cv.ap, 3);
        C.acc.set(pct((c.tp + c.tn) / data.length)); C.prec.set(pct(prec)); C.rec.set(pct(rec)); C.spec.set(pct(c.tn / Nn));
        C.fpr.set(pct(c.fp / Nn)); C.f1.set(isFinite(f1) ? fx(f1) : '—'); C.neg.set(pct(Nn / data.length));
      }
      render();
      return function () {};
    }
  });

  /* ======================================================================
     8. gradient-descent: real GD steps on an elongated quadratic bowl
     ====================================================================== */
  KIT.widgets.register('gradient-descent', {
    title: 'Gradient descent and the learning rate',
    title_bn: 'Gradient descent আর learning rate',
    mount: function (host) {
      var w = D.shell({ id: 'gradient-descent', title: this.title, title_bn: this.title_bn,
        caption: 'f(x, y) = ½(x² + 5y²): the bowl is 5× steeper in y, so one learning rate must suit both directions. Too small: safe but slow. Too big (η > 2/5 = 0.4): every y-step overshoots more than the last and the loss explodes. Momentum (β = 0.9) builds speed along the flat x-valley and stays stable up to η ≈ 2(1+β)/5 = 0.76. Click or tap the plot to choose a new start.',
        caption_bn: 'f(x, y) = ½(x² + 5y²): বাটিটা y দিকে 5 গুণ খাড়া, তাই একটা learning rate দিয়েই দুই দিক সামলাতে হয়। খুব ছোট: নিরাপদ কিন্তু ধীর। খুব বড় (η > 0.4): y দিকে প্রতিবার আগের চেয়ে বেশি লাফিয়ে যায়, loss বিস্ফোরিত হয়। Momentum (β = 0.9) সমতল x দিকে গতি জমায়, আর η ≈ 0.76 পর্যন্ত স্থির থাকে। নতুন শুরুর বিন্দু বাছতে plot-এ click/tap করো।' });
      host.appendChild(w.root);
      var A = 1, B = 5, BETA = 0.9, U = 40, OX = 160, OY = 120;
      function f(p) { return 0.5 * (A * p[0] * p[0] + B * p[1] * p[1]); }
      function grad(p) { return [A * p[0], B * p[1]]; }
      var cid = uid('gd-clip');
      var sv = svg('0 0 320 240', 'Contour plot of the loss bowl with the gradient descent path', 'gd-plot');
      sv.appendChild(s('defs', null, s('clipPath', { id: cid }, s('rect', { x: 0, y: 0, width: 320, height: 240 }))));
      var gc = s('g', { 'clip-path': 'url(#' + cid + ')' });
      gc.appendChild(s('rect', { x: 0, y: 0, width: 320, height: 240, class: 'gd-bg' }));
      [30, 23, 17, 12, 8, 5, 2.5, 1, 0.25].forEach(function (L, i) {
        gc.appendChild(s('ellipse', { cx: OX, cy: OY, rx: Math.sqrt(2 * L / A) * U, ry: Math.sqrt(2 * L / B) * U, class: 'gd-c gd-c' + (i % 3) }));
      });
      gc.appendChild(s('line', { x1: 0, x2: 320, y1: OY, y2: OY, class: 'grid' })); gc.appendChild(s('line', { x1: OX, x2: OX, y1: 0, y2: 240, class: 'grid' }));
      gc.appendChild(s('text', { x: 312, y: OY - 5, 'text-anchor': 'end', class: 'wb-muted', text: 'x' })); gc.appendChild(s('text', { x: OX + 5, y: 13, class: 'wb-muted', text: 'y' }));
      gc.appendChild(s('path', { d: 'M' + (OX - 6) + ' ' + OY + 'h12M' + OX + ' ' + (OY - 6) + 'v12', class: 'gd-min' }));
      var trail = s('polyline', { class: 'gd-trail' }), startDot = s('circle', { r: 5, class: 'gd-start' }), dot = s('circle', { r: 6, class: 'gd-dot' });
      gc.append(trail, startDot, dot);
      sv.appendChild(gc);
      var banner = s('text', { x: 160, y: 228, 'text-anchor': 'middle', class: 'gd-banner' }); sv.appendChild(banner);
      w.stage.append(sv, legend([{ color: '--fg-2', shape: 'ring', en: 'start (click to move)', bn: 'শুরু (click করে সরাও)' }, { color: '--c5', shape: 'line', en: 'GD path', bn: 'GD-এর পথ' },
        { color: '--c3', shape: 'ring', en: 'loss contours', bn: 'সমান-loss রেখা' }, { color: '--fg-2', shape: 'plus', en: 'minimum (0, 0)', bn: 'সর্বনিম্ন (0, 0)' }]));

      var st = { lr: 0.3, mom: false, start: [-3.5, 2.2] };
      var run;
      function reset() { stop(); run = { p: st.start.slice(), v: [0, 0], path: [st.start.slice()], k: 0, status: 'ready' }; draw(); }
      function stepOnce() {
        if (run.status === 'diverged' || run.status === 'converged') return;
        var g = grad(run.p);
        if (st.mom) { run.v = [BETA * run.v[0] - st.lr * g[0], BETA * run.v[1] - st.lr * g[1]]; run.p = [run.p[0] + run.v[0], run.p[1] + run.v[1]]; }
        else run.p = [run.p[0] - st.lr * g[0], run.p[1] - st.lr * g[1]];
        run.k += 1; run.path.push(run.p.slice());
        var gn = Math.hypot.apply(null, grad(run.p));
        if (!isFinite(f(run.p)) || f(run.p) > 1e4) run.status = 'diverged';
        else if (gn < 1e-3) run.status = 'converged';
        else if (run.k >= 1000) run.status = 'stopped';
        else run.status = 'running';
      }
      function P(p) { return [OX + Math.max(-1e3, Math.min(1e3, p[0])) * U, OY - Math.max(-1e3, Math.min(1e3, p[1])) * U]; }
      var STATUS = { ready: ['ready', 'প্রস্তুত'], running: ['running', 'চলছে'], converged: ['converged', 'পৌঁছে গেছে'], diverged: ['diverged', 'ছিটকে গেছে (diverged)'], stopped: ['1000 steps, stopped', '1000 step, থামানো'] };
      function draw() {
        trail.setAttribute('points', run.path.map(function (p) { var q = P(p); return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '));
        var s0 = P(run.path[0]), q = P(run.p);
        startDot.setAttribute('cx', s0[0]); startDot.setAttribute('cy', s0[1]); dot.setAttribute('cx', q[0]); dot.setAttribute('cy', q[1]);
        banner.textContent = run.status === 'diverged' ? 'diverged: loss > 10⁴' : '';
        var g = grad(run.p);
        cK.set(String(run.k)); cL.set(run.status === 'diverged' && !isFinite(f(run.p)) ? '∞' : f(run.p) < 1e4 ? fx(f(run.p), 4) : f(run.p).toExponential(1));
        cG.set(Math.hypot(g[0], g[1]) < 1e4 ? fx(Math.hypot(g[0], g[1]), 4) : Math.hypot(g[0], g[1]).toExponential(1));
        cS.set(t(STATUS[run.status][0], STATUS[run.status][1]));
        cS.el.classList.toggle('is-bad', run.status === 'diverged'); cS.el.classList.toggle('is-good', run.status === 'converged');
      }
      var acc = 0, lp = D.loop(function (dt) {
        acc += dt;
        while (acc > 1 / 14) { acc -= 1 / 14; stepOnce(); }
        draw();
        if (run.status !== 'running' && run.status !== 'ready') { setPlay(false); return false; }
      });
      function setPlay(on) { relabel(play, on ? 'Pause' : 'Play', on ? 'থামাও' : 'চালাও'); play.setAttribute('aria-pressed', String(on)); }
      function stop() { lp.stop(); if (play) setPlay(false); }
      var play = btn('Play', 'চালাও', function () {
        if (lp.running()) { stop(); return; }
        if (run.status !== 'ready' && run.status !== 'running') reset();
        acc = 0; setPlay(true); lp.start();
      }, false);
      var stepB = btn('Step', 'এক step', function () { stop(); if (run.status !== 'ready' && run.status !== 'running') return; stepOnce(); draw(); });
      var resetB = btn('Reset', 'আবার শুরু', reset);
      var lrS = sld({ id: 'gd-lr', label: 'Learning rate η (log scale)', label_bn: 'Learning rate η (log scale)', min: -3, max: Math.log10(1.5), step: 0.01, value: Math.log10(st.lr),
        format: function (v) { return Number(Math.pow(10, v).toPrecision(2)).toString(); }, onInput: function (v) { st.lr = Math.pow(10, v); reset(); } });
      var momB = btn('Momentum β = 0.9', 'Momentum β = 0.9', function () { st.mom = !st.mom; momB.setAttribute('aria-pressed', String(st.mom)); reset(); }, false);
      function preset(lr) { if (st.mom) momB.click(); lrS.set(Math.log10(lr)); }
      w.controls.append(lrS.wrap, momB, h('div', { class: 'wb-btnrow' }, [play, stepB, resetB]),
        h('div', { class: 'wb-btnrow' }, [btn('Too small (η = 0.01)', 'খুব ছোট (η = 0.01)', function () { preset(0.01); }),
          btn('Just right (η = 0.3)', 'ঠিকঠাক (η = 0.3)', function () { preset(0.3); }),
          btn('Too big (η = 0.45)', 'খুব বড় (η = 0.45)', function () { preset(0.45); })]));
      var cK = chip('Step', 'Step'), cL = chip('Loss f(x, y)', 'Loss f(x, y)'), cG = chip('‖∇f‖', '‖∇f‖'), cS = chip('Status', 'অবস্থা');
      w.readout.append(cK.el, cL.el, cG.el, cS.el);
      sv.addEventListener('click', function (ev) {
        var p = svgPoint(sv, ev);
        st.start = [Math.max(-3.9, Math.min(3.9, (p.x - OX) / U)), Math.max(-2.9, Math.min(2.9, (OY - p.y) / U))];
        reset();
      });
      reset();
      var unHide = onHidden(stop);
      return function () { lp.stop(); unHide(); };
    }
  });

  /* ======================================================================
     9. training-loop: Forward → Loss → Backward → Update on ŷ = w·x + b
     ====================================================================== */
  KIT.widgets.register('training-loop', {
    title: 'One training step, four stages',
    title_bn: 'এক training step, চার ধাপ',
    mount: function (host, ctx) {
      var w = D.shell({ id: 'training-loop', title: this.title, title_bn: this.title_bn,
        caption: 'Every training step of every neural network, distillation included, is this loop: run the model forward, measure the loss, backpropagate to get the gradient, then move each weight a little against it. Here the model is ŷ = w·x + b on 6 points with MSE loss, so you can check every number by hand. η above about 0.78 makes it diverge.',
        caption_bn: 'যেকোনো neural network-এর (distillation-ও) প্রতিটা training step এই চক্র: model চালিয়ে prediction (forward), loss মাপা, backprop করে gradient বের করা, তারপর প্রতিটা weight gradient-এর উল্টো দিকে একটু সরানো। এখানে model হল ŷ = w·x + b, 6টা বিন্দু, MSE loss, তাই প্রতিটা সংখ্যা হাতে মিলিয়ে দেখা যায়। η প্রায় 0.78-এর বেশি হলে diverge করে।' });
      host.appendChild(w.root);
      var X = [0, 0.2, 0.4, 0.6, 0.8, 1], Y = [0.9, 1.5, 1.8, 2.6, 2.9, 3.6], N = X.length;
      var st = { w: 0, b: 0, k: 0, lr: 0.3, losses: [] };
      function calc() {
        var yh = X.map(function (x) { return st.w * x + st.b; }), L = 0, dw = 0, db = 0;
        yh.forEach(function (v, i) { var e = v - Y[i]; L += e * e / N; dw += 2 * e * X[i] / N; db += 2 * e / N; });
        return { yh: yh, L: L, dw: dw, db: db, w2: st.w - st.lr * dw, b2: st.b - st.lr * db };
      }
      // least-squares optimum, for reference on the loss chart
      var mx = X.reduce(function (a, v) { return a + v; }, 0) / N, my = Y.reduce(function (a, v) { return a + v; }, 0) / N, sxy = 0, sxx = 0;
      X.forEach(function (x, i) { sxy += (x - mx) * (Y[i] - my); sxx += (x - mx) * (x - mx); });
      var wS = sxy / sxx, bS = my - wS * mx, Lstar = X.reduce(function (a, x, i) { var e = wS * x + bS - Y[i]; return a + e * e / N; }, 0);

      var STAGES = [['Forward', 'সামনে চালানো'], ['Loss', 'ভুল মাপা'], ['Backward', 'gradient বের করা'], ['Update', 'weight সরানো']];
      var bodies = [], cards = STAGES.map(function (sg, i) {
        bodies.push(h('div', { class: 'tl-body mono' }));
        return h('div', { class: 'tl-card tl-s' + i }, [h('div', { class: 'tl-h' }, [h('span', { class: 'tl-n mono' }, String(i + 1)), t(sg[0], sg[1])]), bodies[i]]);
      });
      var cycle = h('div', { class: 'tl-cycle' }, cards);
      var cid = uid('tl-clip'), box = { l: 34, r: 310, t: 12, b: 176 }, xs = lin(0, 1, box.l, box.r), ys = lin(0, 4, box.b, box.t);
      var sc = svg('0 0 320 200', 'Data points and the current fitted line', 'tl-sc');
      sc.appendChild(s('defs', null, s('clipPath', { id: cid }, s('rect', { x: box.l, y: box.t, width: box.r - box.l, height: box.b - box.t }))));
      sc.appendChild(axes(box, xs, ys, [0, 0.5, 1], [0, 1, 2, 3, 4], String, String));
      var gRes = s('g', { 'clip-path': 'url(#' + cid + ')' }), fitL = s('line', { class: 'tl-fit', 'clip-path': 'url(#' + cid + ')' });
      sc.append(gRes, fitL);
      X.forEach(function (x, i) { sc.appendChild(s('circle', { cx: xs(x), cy: ys(Y[i]), r: 4.5, class: 'tl-pt' })); });
      var lb = { l: 44, r: 310, t: 12, b: 176 }, ly = lin(-3, 1, lb.b, lb.t);
      var lc = svg('0 0 320 200', 'Loss versus training step on a log scale', 'tl-lc'), gL = s('g');
      lc.appendChild(gL);
      w.stage.append(cycle, h('div', { class: 'tl-charts' }, [
        h('div', null, [h('div', { class: 'wb-sub' }, t('Data and current line', 'Data আর এখনকার line')), sc, legend([{ color: '--c1', en: 'data (x, y)', bn: 'data (x, y)' }, { color: '--c4', shape: 'line', en: 'ŷ = w·x + b', bn: 'ŷ = w·x + b' }, { color: '--muted', shape: 'dash', en: 'error ŷ − y', bn: 'ভুল ŷ − y' }])]),
        h('div', null, [h('div', { class: 'wb-sub' }, t('Loss per step (log scale)', 'প্রতি step-এ loss (log scale)')), lc, legend([{ color: '--c5', shape: 'line', en: 'MSE loss', bn: 'MSE loss' }, { color: '--good', shape: 'dash', en: 'best possible (least squares)', bn: 'সবচেয়ে কম সম্ভব (least squares)' }])])]));

      function n3(v) { return Math.abs(v) >= 1e4 ? v.toExponential(1) : fx(v, 3); }
      function fill() {
        var c = calc();
        var lines = [
          ['ŷ = w·x + b = ' + n3(st.w) + '·x + ' + n3(st.b), 'ŷ = [' + c.yh.map(function (v) { return Math.abs(v) < 1e3 ? fx(v) : v.toExponential(0); }).join(', ') + ']'],
          ['L = mean((ŷ − y)²)', '  = ' + n3(c.L)],
          ['∂L/∂w = mean(2(ŷ − y)·x) = ' + n3(c.dw), '∂L/∂b = mean(2(ŷ − y)) = ' + n3(c.db)],
          ['w ← ' + n3(st.w) + ' − ' + fx(st.lr) + '×(' + n3(c.dw) + ') = ' + n3(c.w2), 'b ← ' + n3(st.b) + ' − ' + fx(st.lr) + '×(' + n3(c.db) + ') = ' + n3(c.b2)]];
        lines.forEach(function (ls, i) { clear(bodies[i]); ls.forEach(function (l) { bodies[i].appendChild(h('div', null, l)); }); });
        fitL.setAttribute('x1', xs(0)); fitL.setAttribute('x2', xs(1)); fitL.setAttribute('y1', ys(Math.max(-50, Math.min(50, st.b)))); fitL.setAttribute('y2', ys(Math.max(-50, Math.min(50, st.w + st.b))));
        clear(gRes);
        X.forEach(function (x, i) { gRes.appendChild(s('line', { x1: xs(x), x2: xs(x), y1: ys(Y[i]), y2: ys(Math.max(-50, Math.min(50, c.yh[i]))), class: 'tl-res' })); });
        drawLoss(c.L);
        cK.set(String(st.k)); cW.set(n3(st.w)); cB.set(n3(st.b)); cL.set(n3(c.L));
        return c;
      }
      function drawLoss(Lnow) {
        clear(gL);
        var pts = st.losses.concat([Lnow]), n = Math.max(20, pts.length - 1), lx = lin(0, n, lb.l, lb.r);
        var step = n <= 20 ? 5 : n <= 60 ? 20 : n <= 150 ? 50 : 100, xt = [];
        for (var v = 0; v <= n; v += step) xt.push(v);
        gL.appendChild(axes(lb, lx, ly, xt, [-3, -2, -1, 0, 1], String, function (e) { return ['0.001', '0.01', '0.1', '1', '10'][e + 3]; }));
        function Ly(L) { return ly(Math.max(-3, Math.min(1, Math.log10(Math.max(L, 1e-9))))); }
        gL.appendChild(s('line', { x1: lb.l, x2: lb.r, y1: Ly(Lstar), y2: Ly(Lstar), class: 'tl-best' }));
        gL.appendChild(s('path', { d: pathD(pts.map(function (L, i) { return [lx(i), Ly(L)]; })), class: 'tl-loss' }));
        gL.appendChild(s('circle', { cx: lx(pts.length - 1), cy: Ly(Lnow), r: 4.5, class: 'tl-now' }));
      }
      var timer = null, playing = false;
      function hi(i) { cards.forEach(function (c, k) { c.classList.toggle('is-on', k === i); }); }
      function iterate(stageMs, done) { // stages lit in order; the update is applied at stage 4
        var c = calc(), i = 0;
        (function next() {
          hi(i);
          if (i === 3) { st.losses.push(c.L); st.w = c.w2; st.b = c.b2; st.k += 1; }
          if (i === 4 || !isFinite(st.w)) { hi(-1); fill(); if (done) done(); return; }
          i += 1; timer = setTimeout(next, stageMs);
        })();
      }
      function busy() { return timer !== null && !playing; }
      function stopPlay() { playing = false; if (timer) clearTimeout(timer); timer = null; hi(-1); relabel(playB, 'Play', 'চালাও'); playB.setAttribute('aria-pressed', 'false'); }
      function loopPlay() {
        if (!playing) return;
        iterate(ctx.reducedMotion ? 0 : 70, function () { timer = null; if (calc().L > 1e6 || st.k >= 400) { stopPlay(); return; } if (playing) timer = setTimeout(loopPlay, ctx.reducedMotion ? 120 : 40); });
      }
      var stepB = btn('Step', 'এক step', function () { if (playing) stopPlay(); if (busy()) return; iterate(ctx.reducedMotion ? 0 : 380, function () { timer = null; }); });
      var playB = btn('Play', 'চালাও', function () { if (playing) { stopPlay(); fill(); return; } if (timer) clearTimeout(timer); playing = true; relabel(playB, 'Pause', 'থামাও'); playB.setAttribute('aria-pressed', 'true'); loopPlay(); }, false);
      var resetB = btn('Reset', 'আবার শুরু', function () { stopPlay(); st.w = 0; st.b = 0; st.k = 0; st.losses = []; fill(); });
      var lrS = sld({ id: 'tl-lr', label: 'Learning rate η', label_bn: 'Learning rate η', min: 0.05, max: 1, step: 0.05, value: st.lr, format: function (v) { return fx(v); }, onInput: function (v) { st.lr = v; if (!timer) fill(); } });
      w.controls.append(lrS.wrap, h('div', { class: 'wb-btnrow' }, [stepB, playB, resetB]));
      var cK = chip('Step', 'Step'), cW = chip('w', 'w'), cB = chip('b', 'b'), cL = chip('Loss', 'Loss');
      w.readout.append(cK.el, cW.el, cB.el, cL.el);
      fill();
      var unHide = onHidden(function () { if (playing) stopPlay(); });
      return function () { playing = false; if (timer) clearTimeout(timer); unHide(); };
    }
  });

  /* ======================================================================
     10. overlap-highlighter: BLEU / ROUGE computed live on two texts
     ====================================================================== */
  KIT.widgets.register('overlap-highlighter', {
    title: 'BLEU and ROUGE: counting shared words',
    title_bn: 'BLEU আর ROUGE: মিলে যাওয়া শব্দ গোনা',
    mount: function (host) {
      var w = D.shell({ id: 'overlap-highlighter', title: this.title, title_bn: this.title_bn,
        caption: 'BLEU is precision-oriented (how much of the candidate appears in the reference); ROUGE is recall-oriented (how much of the reference the candidate covers). Both only count matching surface words, so they miss meaning: a correct paraphrase scores low. That paraphrase trap is what BERTScore fixes by comparing contextual embeddings. BLEU here is a simplified sentence-level BLEU-4: geometric mean of clipped 1–4-gram precisions (zero counts get add-one smoothing) × brevity penalty.',
        caption_bn: 'BLEU precision-ভিত্তিক (candidate-এর কতটা reference-এ আছে); ROUGE recall-ভিত্তিক (reference-এর কতটা candidate ধরেছে)। দুটোই শুধু হুবহু শব্দ মেলায়, তাই মানে বোঝে না: সঠিক কিন্তু অন্য কথায় লেখা উত্তরও কম score পায়। এই paraphrase-এর ফাঁদ BERTScore ঠিক করে, contextual embedding তুলনা করে। এখানের BLEU একটা সরল sentence-level BLEU-4।' });
      host.appendChild(w.root);
      var REF = 'Theft is punishable with imprisonment for up to three years, or with a fine, or with both.';
      var EX = { start: 'The punishment for theft is imprisonment for up to three years or a fine.',
        para: 'A person who steals may be jailed for at most three years, fined, or given both penalties.',
        copy: 'Theft is punishable with imprisonment for up to three years, or with a fine, or both.' };
      var RE = /[a-z0-9À-ɏঀ-৿]+/gi;
      function toks(str) { var out = [], m; RE.lastIndex = 0; while ((m = RE.exec(str)) && out.length < 300) out.push({ w: m[0].toLowerCase(), i: m.index, n: m[0].length }); return out; }
      function grams(a, n) { var c = {}; for (var i = 0; i + n <= a.length; i++) { var k = a.slice(i, i + n).join(' '); c[k] = (c[k] || 0) + 1; } return c; }
      function match(c, r, n) { var gc = grams(c, n), gr = grams(r, n), m = 0; Object.keys(gc).forEach(function (k) { m += Math.min(gc[k], gr[k] || 0); }); return m; }
      function lcs(a, b) {
        var T = [], i, j;
        for (i = 0; i <= a.length; i++) { T.push(new Array(b.length + 1).fill(0)); }
        for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) T[i][j] = a[i - 1] === b[j - 1] ? T[i - 1][j - 1] + 1 : Math.max(T[i - 1][j], T[i][j - 1]);
        var ia = {}, ib = {}; i = a.length; j = b.length;
        while (i > 0 && j > 0) { if (a[i - 1] === b[j - 1]) { ia[i - 1] = ib[j - 1] = 1; i--; j--; } else if (T[i - 1][j] >= T[i][j - 1]) i--; else j--; }
        return { len: T[a.length][b.length], ia: ia, ib: ib };
      }
      function f1(p, r) { return p + r > 0 ? 2 * p * r / (p + r) : 0; }
      function side(en, bn, val) {
        var id = uid('oh'), ta = h('textarea', { id: id, rows: 3, spellcheck: 'false' }); ta.value = val;
        var view = h('div', { class: 'oh-view', 'aria-hidden': 'true' });
        return { ta: ta, view: view, el: h('div', { class: 'oh-side' }, [h('label', { class: 'w-label', for: id }, t(en, bn)), ta, view]) };
      }
      var R = side('Reference (human answer)', 'Reference (মানুষের উত্তর)', REF), Cn = side('Candidate (model answer)', 'Candidate (model-এর উত্তর)', EX.start);
      var metrics = h('div', { class: 'oh-metrics' }), detail = h('div', { class: 'oh-detail mono' });
      var ohBtns = h('div', { class: 'wb-btnrow' });
      w.stage.append(h('div', { class: 'oh-pair' }, [R.el, Cn.el]), ohBtns, legend([{ color: '--c3', shape: 'blk', en: 'in the longest common subsequence (ROUGE-L)', bn: 'longest common subsequence-এ (ROUGE-L)' }, { color: '--fg-2', shape: 'dash', en: 'shared word, outside the LCS', bn: 'মিল আছে, কিন্তু LCS-এর বাইরে' }]), metrics, detail);
      [R.ta, Cn.ta].forEach(function (ta) { ta.addEventListener('input', render); });
      function load(k) { Cn.ta.value = EX[k]; R.ta.value = REF; render(); }
      ohBtns.append.apply(ohBtns, [btn('Load paraphrase', 'Paraphrase বসাও', function () { load('para'); }),
        btn('Load near-copy', 'প্রায় কপি বসাও', function () { load('copy'); }), btn('Reset example', 'আগের উদাহরণ', function () { load('start'); })]);
      var cR1 = chip('ROUGE-1 F1', 'ROUGE-1 F1'), cRL = chip('ROUGE-L F1', 'ROUGE-L F1'), cBl = chip('BLEU-4', 'BLEU-4');
      w.readout.append(cR1.el, cRL.el, cBl.el);
      function paint(view, text, tk, inL, other) {
        clear(view); var pos = 0;
        tk.forEach(function (o, k) {
          if (o.i > pos) view.appendChild(document.createTextNode(text.slice(pos, o.i)));
          view.appendChild(h('span', { class: inL[k] ? 'oh-lcs' : other[o.w] ? 'oh-uni' : '' }, text.substr(o.i, o.n)));
          pos = o.i + o.n;
        });
        if (pos < text.length) view.appendChild(document.createTextNode(text.slice(pos)));
      }
      function render() {
        var rt = toks(R.ta.value), ct = toks(Cn.ta.value), r = rt.map(function (o) { return o.w; }), c = ct.map(function (o) { return o.w; });
        var L = lcs(c, r), inR = {}, inC = {};
        r.forEach(function (x) { inR[x] = 1; }); c.forEach(function (x) { inC[x] = 1; });
        paint(R.view, R.ta.value, rt, L.ib, inC); paint(Cn.view, Cn.ta.value, ct, L.ia, inR);
        var m1 = match(c, r, 1), m2 = match(c, r, 2);
        var P1 = c.length ? m1 / c.length : 0, R1 = r.length ? m1 / r.length : 0, P2 = c.length > 1 ? m2 / (c.length - 1) : 0, R2 = r.length > 1 ? m2 / (r.length - 1) : 0;
        var PL = c.length ? L.len / c.length : 0, RL = r.length ? L.len / r.length : 0;
        var ps = [1, 2, 3, 4].map(function (n) { var tot = Math.max(0, c.length - n + 1), m = match(c, r, n); return m > 0 ? m / tot : 1 / (tot + 1); });
        var bp = !c.length ? 0 : c.length > r.length ? 1 : Math.exp(1 - r.length / c.length);
        var bleu = c.length ? bp * Math.exp(ps.reduce(function (a, p) { return a + Math.log(p) / 4; }, 0)) : 0;
        var rows = [['1-gram precision', '1-gram precision', P1, '--c1'], ['1-gram recall', '1-gram recall', R1, '--c1'], ['2-gram precision', '2-gram precision', P2, '--c1'], ['2-gram recall', '2-gram recall', R2, '--c1'],
          ['ROUGE-1 F1', 'ROUGE-1 F1', f1(P1, R1), '--c3'], ['ROUGE-2 F1', 'ROUGE-2 F1', f1(P2, R2), '--c3'], ['ROUGE-L F1 (LCS)', 'ROUGE-L F1 (LCS)', f1(PL, RL), '--c3'], ['BLEU-4 (simplified)', 'BLEU-4 (সরল)', bleu, '--c2']];
        clear(metrics);
        rows.forEach(function (rw) { metrics.appendChild(h('div', { class: 'oh-row' }, [h('span', { class: 'oh-name' }, t(rw[0], rw[1])), bar(rw[2], rw[3]), h('span', { class: 'mono oh-v' }, fx(rw[2]))])); });
        detail.textContent = 'tokens: ref ' + r.length + ', cand ' + c.length + ' · LCS = ' + L.len + ' · BLEU p1..p4 = ' + ps.map(function (p) { return fx(p); }).join(' / ') + ' · BP = ' + fx(bp);
        cR1.set(fx(f1(P1, R1))); cRL.set(fx(f1(PL, RL))); cBl.set(fx(bleu));
      }
      render();
      return function () {};
    }
  });
})();
