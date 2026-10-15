/* =========================================================
   OVID — interactions & motion
   ========================================================= */
(() => {
  const D = document;
  const html = D.documentElement;
  const $ = (s, r = D) => r.querySelector(s);
  const $$ = (s, r = D) => Array.from(r.querySelectorAll(s));
  const I = window.OVID_I18N;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) {} },
  };

  const hasGsap = !!(window.gsap && window.ScrollTrigger);
  if (!hasGsap) html.classList.remove('anim');
  const anim = () => html.classList.contains('anim');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // мова в адресі: /ua або /en (на file:// адресу не чіпаємо)
  const canRoute = /^https?:$/.test(location.protocol);
  const langFromPath = () => (location.pathname.match(/^\/(ua|en)(?:\/|$)/) || [])[1];
  function setUrl(lang, replace) {
    if (!canRoute || location.pathname === '/' + lang) return;
    history[replace ? 'replaceState' : 'pushState']({ lang }, '', '/' + lang + location.search + location.hash);
  }

  const state = {
    lang: langFromPath() || (store.get('ovid-lang') === 'en' ? 'en' : 'ua'),
    season: 'summer',
  };
  const ui = (k) => I.ui[state.lang][k];
  const fmt = (n) => new Intl.NumberFormat(state.lang === 'ua' ? 'uk-UA' : 'en-US').format(Math.round(n));

  let lenis = null;
  if (hasGsap) { gsap.registerPlugin(ScrollTrigger); ScrollTrigger.config({ ignoreMobileResize: true }); }

  /* ---------------------------------------------------------
     Word splitting
     --------------------------------------------------------- */
  function splitInto(el, src, wordClass, mask) {
    const tmp = D.createElement('div');
    tmp.innerHTML = src;
    el.innerHTML = '';
    const walk = (node, target) => {
      node.childNodes.forEach((n) => {
        if (n.nodeType === 3) {
          n.textContent.split(/(\s+)/).forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) { target.appendChild(D.createTextNode(' ')); return; }
            const inner = D.createElement('span');
            inner.className = wordClass;
            inner.textContent = p;
            if (mask) {
              const w = D.createElement('span');
              w.className = 'w';
              w.appendChild(inner);
              target.appendChild(w);
            } else target.appendChild(inner);
          });
        } else if (n.nodeType === 1) {
          if (n.tagName === 'BR' || n.classList.contains('pill-img')) { target.appendChild(n.cloneNode(true)); return; }
          const clone = n.cloneNode(false);
          target.appendChild(clone);
          walk(n, clone);
        }
      });
    };
    walk(tmp, el);
  }
  const splitHeading = (el, src) => splitInto(el, src ?? el.innerHTML, 'wi', true);

  function revealSplit(el, fast) {
    el.classList.add('is-in');
    if (!anim()) return;
    gsap.fromTo($$('.wi', el),
      { y: 0, yPercent: 115, rotate: 4 },
      { yPercent: 0, rotate: 0, duration: fast ? .8 : 1.3, ease: 'expo.out', stagger: fast ? .03 : .06, overwrite: 'auto' });
  }

  /* ---------------------------------------------------------
     Заголовки: слова «наливаються» товщиною під скрол
     (Unbounded — змінний шрифт, 200 → фінальна вага)
     --------------------------------------------------------- */
  const weightTweens = new Map();
  // фіксуємо ширину кожного слова за фінальною вагою, щоб рядки не перебудовувались під час анімації
  function lockWordWidths(el) {
    const ws = $$('.w', el), wis = $$('.wi', el);
    const saved = wis.map((w) => w.style.fontWeight);
    ws.forEach((w) => (w.style.width = ''));
    wis.forEach((w) => (w.style.fontWeight = ''));
    const widths = ws.map((w) => w.getBoundingClientRect().width);
    ws.forEach((w, i) => (w.style.width = widths[i] + 'px'));
    wis.forEach((w, i) => (w.style.fontWeight = saved[i]));
  }
  function initWeight(el) {
    if (!anim() || el.hasAttribute('data-hero-split')) return;
    const old = weightTweens.get(el);
    if (old) { old.scrollTrigger && old.scrollTrigger.kill(); old.kill(); }
    lockWordWidths(el);
    const to = parseFloat(getComputedStyle(el).fontWeight) || 400;
    weightTweens.set(el, gsap.fromTo($$('.wi', el), { fontWeight: 200 }, {
      fontWeight: to, ease: 'none', stagger: .15,
      scrollTrigger: { trigger: el, start: 'top 92%', end: 'top 40%', scrub: .6 },
    }));
  }

  /* ---------------------------------------------------------
     i18n
     --------------------------------------------------------- */
  const uaHTML = new Map();
  $$('[data-i18n]').forEach((el) => uaHTML.set(el, el.innerHTML));
  const uaAlt = new Map();
  $$('[data-i18n-alt]').forEach((el) => uaAlt.set(el, el.getAttribute('alt')));
  const uaAria = new Map();
  $$('[data-i18n-aria]').forEach((el) => uaAria.set(el, el.getAttribute('aria-label')));

  let manifestoST = null;

  function applyLang(lang, animate) {
    state.lang = lang;
    html.lang = lang === 'ua' ? 'uk' : 'en';
    D.title = ui('title');

    $$('[data-i18n]').forEach((el) => {
      const k = el.dataset.i18n;
      const v = lang === 'en' ? I.en[k] : uaHTML.get(el);
      if (v == null) return;
      if (el.hasAttribute('data-split')) {
        splitHeading(el, v);
        initWeight(el);
        if (el.classList.contains('is-in')) revealSplit(el, true);
      } else if (el.hasAttribute('data-scrub')) {
        buildManifesto(el, v);
      } else if (el instanceof SVGElement) {
        el.textContent = v;
      } else {
        el.innerHTML = v;
      }
    });
    $$('[data-i18n-alt]').forEach((el) => {
      const v = lang === 'en' ? I.en[el.dataset.i18nAlt] : uaAlt.get(el);
      if (v) el.setAttribute('alt', v);
    });
    $$('[data-i18n-aria]').forEach((el) => {
      const v = lang === 'en' ? I.en[el.dataset.i18nAria] : uaAria.get(el);
      if (v) el.setAttribute('aria-label', v);
    });

    $$('.lang__btn').forEach((b) => b.classList.toggle('is-active', b.dataset.lang === lang));
    $$('.lang').forEach((l) => (l.dataset.active = lang));

    renderReviews();
    renderPrices(false);
    renderMapLabels();
    updateMotionLabels();
    updateSeasonPill();
    store.set('ovid-lang', lang);
    if (hasGsap && animate !== false) ScrollTrigger.refresh();
  }

  // шторка при зміні мови
  const curtain = D.createElement('div');
  curtain.className = 'curtain';
  curtain.innerHTML = '<span></span>';
  D.body.appendChild(curtain);

  function switchLang(lang, fromHistory) {
    if (lang === state.lang) return;
    if (!fromHistory) setUrl(lang);
    if (!anim()) { applyLang(lang); return; }
    $('span', curtain).textContent = lang === 'en' ? 'English' : 'Українська';
    gsap.timeline()
      .set(curtain, { visibility: 'visible' })
      .fromTo(curtain, { clipPath: 'inset(100% 0% 0% 0% round 0px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', duration: .6, ease: 'expo.inOut' })
      .fromTo($('span', curtain), { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .5, ease: 'expo.out' }, '-=.2')
      .add(() => applyLang(lang))
      .to($('span', curtain), { yPercent: -100, opacity: 0, duration: .4, ease: 'expo.in' }, '+=.15')
      .to(curtain, { clipPath: 'inset(0% 0% 100% 0% round 0px)', duration: .7, ease: 'expo.inOut' })
      .set(curtain, { visibility: 'hidden' });
  }
  $$('.lang__btn').forEach((b) => b.addEventListener('click', () => switchLang(b.dataset.lang)));
  // кнопки «назад / вперед» у браузері теж перемикають мову
  window.addEventListener('popstate', () => { const l = langFromPath(); if (l) switchLang(l, true); });

  /* ---------------------------------------------------------
     Manifesto: слова «проявляються» під скрол
     --------------------------------------------------------- */
  function buildManifesto(el, src) {
    splitInto(el, src, 'sw', false);
    if (!anim()) return;
    if (manifestoST) { manifestoST.kill(); manifestoST = null; }
    const items = $$('.sw, .pill-img', el);
    gsap.set($$('.pill-img', el), { scale: 0, opacity: 1 });
    const tl = gsap.timeline({
      scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 50%', scrub: .6 },
    });
    items.forEach((it, i) => {
      if (it.classList.contains('pill-img')) tl.to(it, { scale: 1, duration: 2, ease: 'back.out(2)' }, i * .35);
      else tl.to(it, { opacity: 1, duration: 1, ease: 'none' }, i * .35);
    });
    manifestoST = tl.scrollTrigger;
  }

  /* ---------------------------------------------------------
     Reviews
     --------------------------------------------------------- */
  const avaColors = [['#468FD3', '#fff'], ['#A8B681', '#001841'], ['#001841', '#fff'], ['#dfe7f1', '#001841']];
  function reviewCard(r, i) {
    const initials = r.n.split(/\s+/).filter((p) => /^\p{Lu}/u.test(p)).map((p) => p[0]).join('').slice(0, 2);
    const [bg, fg] = avaColors[i % avaColors.length];
    return `<article class="review">
      <div class="review__stars" aria-label="5/5">★★★★★</div>
      <p>${r.t}</p>
      <div class="review__who"><span class="review__ava" style="background:${bg};color:${fg}">${initials}</span><div><b>${r.n}</b><small>${r.c}</small></div></div>
    </article>`;
  }
  function renderReviews() {
    const list = I.reviews[state.lang];
    const rows = [list.slice(0, 4).concat(list.slice(4)), list.slice(4).concat(list.slice(0, 4)).reverse()];
    $$('[data-reviews-row]').forEach((row) => {
      const items = rows[+row.dataset.reviewsRow].map(reviewCard).join('');
      row.innerHTML = items + items.replace(/<article class="review">/g, '<article class="review" aria-hidden="true">');
    });
  }

  /* ---------------------------------------------------------
     Prices
     --------------------------------------------------------- */
  function renderPrices(animate) {
    const P = I.prices[state.lang];
    $$('[data-cur]').forEach((c) => (c.textContent = P.cur));
    $$('[data-price]').forEach((el) => {
      const to = P[state.season][el.dataset.price];
      const from = parseInt(el.textContent.replace(/\D/g, ''), 10) || 0;
      if (animate && anim()) {
        const o = { v: from };
        gsap.to(o, { v: to, duration: 1, ease: 'expo.out', onUpdate: () => (el.textContent = fmt(o.v)) });
        gsap.fromTo(el, { yPercent: 0 }, { yPercent: -8, duration: .25, yoyo: true, repeat: 1, ease: 'power2.out' });
      } else el.textContent = fmt(to);
    });
  }
  const seasonPill = $('.season__pill');
  function updateSeasonPill() {
    const active = $('.season__btn.is-active');
    if (!active || !seasonPill) return;
    seasonPill.style.width = active.offsetWidth + 'px';
    seasonPill.style.transform = `translateX(${active.offsetLeft - 6}px)`;
  }
  $$('.season__btn').forEach((b) => b.addEventListener('click', () => {
    if (b.classList.contains('is-active')) return;
    $$('.season__btn').forEach((x) => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-selected', x === b); });
    state.season = b.dataset.season;
    updateSeasonPill();
    renderPrices(true);
  }));

  /* ---------------------------------------------------------
     Topographic map (процедурні горизонталі)
     --------------------------------------------------------- */
  const MAP_C = { x: 400, y: 291 };
  const PLACES = [
    { x: 205, y: 120, km: 24, side: 1 },
    { x: 600, y: 105, km: 28, side: -1 },
    { x: 590, y: 455, km: 19, side: -1 },
    { x: 215, y: 440, km: 36, side: 1 },
    { x: 488, y: 205, km: 3, side: 1 },
  ];
  function closedCurve(pts) {
    const n = pts.length;
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d + 'Z';
  }
  function buildMap() {
    const g = $('.map__contours');
    if (!g) return;
    const hills = [
      { x: 400, y: 300, max: 330, s: 1.2 },
      { x: 120, y: 110, max: 190, s: 3.1 },
      { x: 720, y: 80, max: 220, s: 5.3 },
      { x: 700, y: 500, max: 170, s: 2.4 },
      { x: 80, y: 500, max: 150, s: 4.2 },
    ];
    let out = '';
    hills.forEach((h) => {
      let lvl = 0;
      for (let r = h.max; r > 12; r -= 21, lvl++) {
        const amp = .07 + (r / h.max) * .16;
        const seed = h.s + r * .006;
        const pts = [];
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          const k = 1 + amp * (.5 * Math.sin(3 * a + seed) + .3 * Math.sin(5 * a + seed * 1.9) + .25 * Math.sin(2 * a + seed * .7));
          pts.push([h.x + Math.cos(a) * r * k, h.y + Math.sin(a) * r * k * .74]);
        }
        out += `<path d="${closedCurve(pts)}"${lvl % 5 === 0 ? ' class="major"' : ''}/>`;
      }
    });
    g.innerHTML = out;

    $('.map__routes').innerHTML = PLACES.map((p) => {
      const mx = (MAP_C.x + p.x) / 2, my = (MAP_C.y + p.y) / 2;
      const dx = p.x - MAP_C.x, dy = p.y - MAP_C.y;
      const cx = mx - dy * .25, cy = my + dx * .25;
      return `<path d="M${MAP_C.x},${MAP_C.y} Q${cx.toFixed(1)},${cy.toFixed(1)} ${p.x},${p.y}"/>`;
    }).join('');
    renderMapLabels();
  }
  function renderMapLabels() {
    const g = $('.map__places');
    if (!g) return;
    const names = I.places[state.lang];
    const unit = state.lang === 'ua' ? 'км' : 'km';
    g.innerHTML = PLACES.map((p, i) => {
      const anchor = p.side > 0 ? 'start' : 'end';
      const tx = p.x + p.side * 14;
      return `<g class="map__place"><circle cx="${p.x}" cy="${p.y}" r="5"/>
        <text x="${tx}" y="${p.y - 2}" text-anchor="${anchor}">${names[i]}</text>
        <text class="km" x="${tx}" y="${p.y + 14}" text-anchor="${anchor}">${p.km} ${unit}</text></g>`;
    }).join('');
  }

  /* ---------------------------------------------------------
     Small UI: steppers, accordion, menu, cookie, form
     --------------------------------------------------------- */
  $$('[data-stepper]').forEach((s) => {
    const out = $('[data-stepper-value]', s);
    const min = +s.dataset.min, max = +s.dataset.max;
    s.addEventListener('click', (e) => {
      const b = e.target.closest('[data-step]');
      if (!b) return;
      const v = Math.min(max, Math.max(min, +out.textContent + +b.dataset.step));
      out.textContent = v;
      if (anim()) gsap.fromTo(out, { yPercent: +b.dataset.step > 0 ? 60 : -60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .4, ease: 'expo.out' });
    });
  });

  // дати за замовчуванням: найближча пʼятниця → неділя
  (function presetDates() {
    const d = new Date();
    const toFri = ((5 - d.getDay()) + 7) % 7 || 7;
    const inD = new Date(d.getFullYear(), d.getMonth(), d.getDate() + toFri);
    const outD = new Date(inD.getFullYear(), inD.getMonth(), inD.getDate() + 2);
    const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    const today = iso(d);
    $$('input[type="date"]').forEach((inp) => {
      inp.min = today;
      inp.value = inp.name === 'in' ? iso(inD) : iso(outD);
    });
  })();

  const bookingForm = $('.form');
  $$('[data-plan-pick]').forEach((b) => b.addEventListener('click', () => {
    const r = $(`input[name="plan"][value="${b.dataset.planPick}"]`, bookingForm);
    if (r) r.checked = true;
  }));

  let refreshTimer;
  const lateRefresh = () => { if (!hasGsap) return; clearTimeout(refreshTimer); refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 650); };

  $$('.acc').forEach((acc) => {
    const q = $('.acc__q', acc);
    q.addEventListener('click', () => {
      const open = !acc.classList.contains('is-open');
      $$('.acc.is-open').forEach((o) => { o.classList.remove('is-open'); $('.acc__q', o).setAttribute('aria-expanded', 'false'); });
      acc.classList.toggle('is-open', open);
      q.setAttribute('aria-expanded', String(open));
      lateRefresh();
    });
  });

  const burger = $('.burger');
  const menu = $('.menu');
  function setMenu(open) {
    D.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-hidden', String(!open));
    if (lenis) open ? lenis.stop() : lenis.start();
    // перерахувати стан хедера (над hero він білий — у відкритому меню це не потрібно)
    window.dispatchEvent(new Event('scroll'));
  }
  burger.addEventListener('click', () => setMenu(!D.body.classList.contains('menu-open')));
  D.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  // плавний перехід до якорів
  $$('[data-scroll-to]').forEach((a) => a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    const target = id && id.startsWith('#') ? $(id) : null;
    if (!target) return;
    e.preventDefault();
    setMenu(false);
    if (lenis) lenis.scrollTo(target, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else target.scrollIntoView({ behavior: anim() ? 'smooth' : 'auto' });
  }));

  const cookie = $('.cookie');
  const showCookie = () => cookie.classList.add('is-visible');
  $('[data-cookie-accept]').addEventListener('click', () => { cookie.classList.remove('is-visible'); store.set('ovid-cookie', '1'); });
  $$('[data-cookie-open]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); showCookie(); }));

  bookingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    let ok = true;
    ['name', 'phone'].forEach((n) => {
      const inp = $(`[name="${n}"]`, bookingForm);
      const field = inp.closest('.field');
      field.classList.remove('is-error');
      if (!inp.value.trim()) { ok = false; void field.offsetWidth; field.classList.add('is-error'); }
    });
    if (ok) bookingForm.classList.add('is-sent');
  });
  $$('.form .field input, .form .field textarea').forEach((inp) => inp.addEventListener('input', () => inp.closest('.field').classList.remove('is-error')));
  $('[data-form-reset]').addEventListener('click', () => {
    bookingForm.classList.remove('is-sent');
    $$('input[type="text"], input[type="tel"], textarea', bookingForm).forEach((i) => (i.value = ''));
  });

  /* ---------------------------------------------------------
     Motion toggle
     --------------------------------------------------------- */
  function updateMotionLabels() {
    const on = anim();
    $$('[data-motion-state]').forEach((b) => (b.textContent = on ? 'ON' : 'OFF'));
    $$('.cookie__motion span').forEach((s) => (s.textContent = ui(on ? 'motion.off' : 'motion.on')));
    $$('.motion-toggle').forEach((b) => { b.setAttribute('aria-pressed', String(on)); b.title = ui(on ? 'motion.off' : 'motion.on'); });
  }

  function disableMotion() {
    store.set('ovid-motion', 'off');
    html.classList.remove('anim');
    html.classList.add('reduced');
    if (lenis) { lenis.destroy(); lenis = null; }
    if (hasGsap) {
      ScrollTrigger.getAll().forEach((st) => { if (st.animation) st.animation.progress(1); st.kill(); });
      gsap.globalTimeline.getChildren(true, true, false).forEach((t) => t.progress(1));
      gsap.set('[data-fade], [data-hero-fade], .w, .wi, .sw, .pill-img, .hero__media img, .hero__content, .hero__frame, .hero__thumb, .hero__fog, .interior__track, .room, .room__img img, .wordmark span, [data-tilt], [data-magnetic], .map path, .map__place, .review', { clearProps: 'all' });
      ScrollTrigger.refresh();
    }
    $$('[data-split]').forEach((el) => el.classList.add('is-in'));
    setCountsFinal();
    updateMotionLabels();
  }
  function setCountsFinal() {
    $$('[data-count]').forEach((el) => {
      const dec = +(el.dataset.decimals || 0);
      el.textContent = dec ? (+el.dataset.count).toFixed(dec) : fmt(+el.dataset.count);
    });
  }
  function enableMotion() {
    store.set('ovid-motion', 'on');
    session.set('ovid-scroll', String(window.scrollY));
    window.location.reload();
  }
  $$('[data-motion-toggle]').forEach((b) => b.addEventListener('click', () => (anim() ? disableMotion() : enableMotion())));

  /* ---------------------------------------------------------
     Cursor: компас-безель, що тягнеться за швидкістю
     --------------------------------------------------------- */
  function initCursor() {
    if (!finePointer) return;
    const cur = $('.cursor');
    const ring = $('.cursor__ring');
    const dot = $('.cursor__dot');
    const label = $('.cursor__label');
    const labelText = $('span', label);
    const ticks = $('.cursor__ticks');
    let t = '';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r1 = i === 0 ? 20 : 24, r2 = 28;
      t += `<line ${i === 0 ? 'class="n" ' : ''}x1="${30 + Math.cos(a) * r1}" y1="${30 + Math.sin(a) * r1}" x2="${30 + Math.cos(a) * r2}" y2="${30 + Math.sin(a) * r2}"/>`;
    }
    ticks.innerHTML = t;

    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my, ang = 0, seen = false;
    cur.classList.add('is-hidden');
    window.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      if (!seen) { seen = true; rx = mx; ry = my; cur.classList.remove('is-hidden'); }
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
    }, { passive: true });
    D.addEventListener('mouseleave', () => cur.classList.add('is-hidden'));
    D.addEventListener('mouseenter', () => cur.classList.remove('is-hidden'));
    window.addEventListener('mousedown', () => cur.classList.add('is-down'));
    window.addEventListener('mouseup', () => cur.classList.remove('is-down'));

    D.addEventListener('mouseover', (e) => {
      const lab = e.target.closest('[data-cursor]');
      const link = e.target.closest('a, button, input, textarea, label, [data-magnetic]');
      if (lab && !link) {
        labelText.textContent = ui(lab.dataset.cursorLabel) || '';
        cur.classList.add('is-label');
      } else cur.classList.remove('is-label');
      cur.classList.toggle('is-link', !!link);
    });

    const loop = () => {
      const k = anim() ? .18 : 1;
      rx += (mx - rx) * k; ry += (my - ry) * k;
      const vx = mx - rx, vy = my - ry;
      const speed = Math.hypot(vx, vy);
      if (speed > 1.5) {
        const target = Math.atan2(vy, vx);
        let diff = target - ang;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        ang += diff * .25;
      }
      const s = anim() ? Math.min(speed / 140, .42) : 0;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) rotate(${ang}rad) scale(${1 + s}, ${1 - s * .55})`;
      label.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* ---------------------------------------------------------
     Scroll-driven UI: header, altimeter, active nav
     --------------------------------------------------------- */
  function initScrollUI() {
    const header = $('.header');
    const hero = $('.hero');
    const altVal = $('[data-alt]');
    const altLabel = $('[data-alt-label]');
    const marker = $('.altimeter__marker');
    const altimeter = $('.altimeter');
    const sections = $$('[data-alt-name]');
    const navLinks = $$('.nav a');
    let lastY = window.scrollY, ticking = false, lastName = '';

    const update = () => {
      ticking = false;
      const y = window.scrollY;
      const max = D.documentElement.scrollHeight - innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;

      const onHero = y < hero.offsetHeight - 90 && !D.body.classList.contains('menu-open');
      header.classList.toggle('on-hero', onHero);
      header.classList.toggle('is-scrolled', y > 40 && !onHero);
      altimeter.classList.toggle('is-visible', y > hero.offsetHeight * .7);
      if (!D.body.classList.contains('menu-open')) header.classList.toggle('is-hidden', y > lastY && y > 300);
      lastY = y;

      altVal.textContent = fmt(420 + p * (1240 - 420)).replace(/\s/g, ' ');
      marker.style.setProperty('--p', (p * 178) + 'px');

      let current = sections[0];
      for (const s of sections) if (s.getBoundingClientRect().top <= innerHeight * .5) current = s;
      const name = current.dataset.altName;
      if (name !== lastName) {
        lastName = name;
        altLabel.textContent = ui('alt.' + name);
        navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + current.id));
      }
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
    // при зміні мови оновлюємо підпис
    const _apply = applyLang;
    applyLang = function (lang, animate) { _apply(lang, animate); lastName = ''; update(); };
  }

  /* ---------------------------------------------------------
     Motion (GSAP)
     --------------------------------------------------------- */
  function initSmoothScroll() {
    if (!window.Lenis) return;
    lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis && lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    // «гнучкі» відгуки: картки нахиляються від швидкості скролу
    const rev = $('.reviews');
    let skew = 0;
    lenis.on('scroll', ({ velocity }) => {
      const s = Math.max(-6, Math.min(6, velocity * .35));
      if (Math.abs(s - skew) > .05) { skew = s; rev.style.setProperty('--skew', skew.toFixed(2) + 'deg'); }
    });
  }

  function initScrollAnimations() {
    // заголовки — слова випливають знизу
    $$('[data-split]:not([data-hero-split])').forEach((el) => {
      ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: () => revealSplit(el) });
    });

    // товщина слів — після завантаження шрифту, бо від нього залежить ширина слів
    const headings = $$('[data-split]:not([data-hero-split])');
    (D.fonts ? D.fonts.ready : Promise.resolve()).then(() => {
      if (!anim()) return;
      headings.forEach(initWeight);
      ScrollTrigger.addEventListener('refreshInit', () => { if (anim()) headings.forEach((h) => lockWordWidths(h)); });
      ScrollTrigger.refresh();
    });

    // звичайні елементи — пачками зі stagger
    ScrollTrigger.batch('[data-fade]', {
      start: 'top 90%', once: true,
      onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: .08, overwrite: true }),
    });

    // лічильники
    $$('[data-count]').forEach((el) => {
      const to = parseFloat(el.dataset.count);
      const dec = +(el.dataset.decimals || 0);
      ScrollTrigger.create({
        trigger: el, start: 'top 92%', once: true,
        onEnter: () => {
          const o = { v: 0 };
          gsap.to(o, { v: to, duration: 2.2, ease: 'expo.out', onUpdate: () => (el.textContent = dec ? o.v.toFixed(dec) : fmt(o.v)) });
        },
      });
    });

    // hero — паралакс і «від'їзд» кадру
    const heroST = (end = 'bottom top') => ({ trigger: '.hero', start: 'top top', end, scrub: true });
    gsap.to('.hero__media img', { yPercent: 10, scale: 1.12, ease: 'none', scrollTrigger: heroST() });
    gsap.to('.hero__content', { yPercent: -35, opacity: 0, ease: 'none', scrollTrigger: heroST('70% top') });
    gsap.to('.hero__fog--1', { '--fy': '-140px', ease: 'none', scrollTrigger: heroST() });
    gsap.to('.hero__fog--2', { '--fy': '-60px', ease: 'none', scrollTrigger: heroST() });
    gsap.to('.hero__frame', { scale: .93, borderRadius: 90, ease: 'none', scrollTrigger: heroST() });

    // фото в картках — легкий паралакс
    $$('.card__img img').forEach((img) => {
      gsap.fromTo(img, { yPercent: -6, scale: 1.12 }, { yPercent: 6, scale: 1.12, ease: 'none', scrollTrigger: { trigger: img.closest('.card'), start: 'top bottom', end: 'bottom top', scrub: true } });
    });

    // інтерʼєр — горизонтальний трек з піном
    const mm = gsap.matchMedia();
    // пін і горизонтальний скрол — на всіх екранах, включно з мобільними
    mm.add('(min-width: 0px)', () => {
      const track = $('.interior__track');
      const pad = () => parseFloat(getComputedStyle(track).paddingLeft) || 0;
      const rooms = $$('.room', track);
      // відстань до правого краю останньої картки + відступ, щоб вона вийшла повністю
      const dist = () => { const last = rooms[rooms.length - 1]; return Math.max(0, last.offsetLeft + last.offsetWidth + pad() - track.clientWidth); };
      const cur = $('[data-int-current]');
      const bar = $('[data-int-bar]');
      // нахил карток від швидкості скролу (±8°), плавно повертається в 0
      const skewSet = gsap.quickSetter(rooms, 'skewX', 'deg');
      const clampSkew = gsap.utils.clamp(-8, 8);
      const sk = { v: 0 };
      const tween = gsap.to(track, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: {
          trigger: '.interior__pin', start: 'top top', end: () => '+=' + dist(),
          pin: true, scrub: .8, invalidateOnRefresh: true, anticipatePin: 1,
          onUpdate: (self) => {
            bar.style.transform = `scaleX(${self.progress})`;
            cur.textContent = String(Math.min(rooms.length, Math.round(self.progress * (rooms.length - 1)) + 1)).padStart(2, '0');
            const s = clampSkew(self.getVelocity() / -300);
            if (Math.abs(s) > Math.abs(sk.v)) {
              sk.v = s;
              gsap.to(sk, { v: 0, duration: .8, ease: 'power3', overwrite: true, onUpdate: () => skewSet(sk.v) });
            }
          },
        },
      });

      // паралакс фото всередині картки
      $$('.room__img img', track).forEach((img) => {
        gsap.set(img, { scale: 1.25 });
        gsap.fromTo(img, { xPercent: -10 }, { xPercent: 10, ease: 'none', scrollTrigger: { trigger: img.closest('.room'), containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
      });

      // картка «відкривається» справа наліво, коли заходить у кадр
      const r = getComputedStyle(rooms[0]).borderTopLeftRadius || '0px';
      const hidden = `inset(0% 0% 0% 100% round ${r})`, shown = `inset(0% 0% 0% 0% round ${r})`;
      let first = 0;
      rooms.forEach((room) => {
        if (room.offsetLeft < innerWidth * .9) {
          // видимі одразу при піні — відкриваються, коли секція підʼїжджає
          gsap.fromTo(room, { clipPath: hidden }, { clipPath: shown, duration: 1.4, ease: 'expo.inOut', delay: first++ * .12, scrollTrigger: { trigger: '.interior', start: 'top 60%', toggleActions: 'play play play reverse' } });
        } else {
          gsap.fromTo(room, { clipPath: hidden }, { clipPath: shown, ease: 'none', scrollTrigger: { trigger: room, containerAnimation: tween, start: 'left right', end: 'left 55%', scrub: true } });
        }
        gsap.from($('.room__info, .plan', room), { y: 60, opacity: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: room, containerAnimation: tween, start: 'left 75%', toggleActions: 'play none none reverse' } });
      });

      // «рідкий» hover: хвиля спотворення, що затухає
      if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      const disp = $('#liquid feDisplacementMap');
      const liq = { s: 0 };
      let active = null;
      const onEnter = (e) => {
        const img = $('.room__img img', e.currentTarget);
        if (!img) return;
        if (active && active !== img) active.style.filter = '';
        active = img;
        img.style.filter = 'url(#liquid)';
        gsap.fromTo(liq, { s: 90 }, { s: 0, duration: 1.2, ease: 'expo.out', overwrite: true,
          onUpdate: () => disp.setAttribute('scale', liq.s.toFixed(1)),
          onComplete: () => { img.style.filter = ''; active = null; } });
      };
      rooms.forEach((room) => room.addEventListener('mouseenter', onEnter));
      return () => rooms.forEach((room) => room.removeEventListener('mouseenter', onEnter));
    });

    // карта — маршрути «прокладаються»
    const routes = $$('.map__routes path');
    routes.forEach((p) => { const l = p.getTotalLength(); gsap.set(p, { strokeDasharray: l, strokeDashoffset: l }); });
    const mapTl = gsap.timeline({ scrollTrigger: { trigger: '.map', start: 'top 70%', once: true } });
    mapTl.from('.map__contours path', { opacity: 0, duration: 1.2, stagger: { each: .006, from: 'random' }, ease: 'power2.out' })
      .to(routes, { strokeDashoffset: 0, duration: 1.4, stagger: .12, ease: 'expo.inOut' }, .3)
      .from('.map__place', { opacity: 0, y: 10, duration: .6, stagger: .1, ease: 'expo.out' }, 1.1)
      .from('.map__pin', { scale: 0, duration: 1, ease: 'back.out(2)' }, .2);

    // величезний OVID у футері
    gsap.from('.wordmark span', {
      yPercent: 105, rotate: 6, ease: 'none', stagger: .08,
      scrollTrigger: { trigger: '.wordmark', start: 'top bottom', end: 'bottom bottom', scrub: 1 },
    });

    // секція features «наїжджає» на about
    gsap.from('.features', { borderRadius: '160px 160px 0 0', ease: 'none', scrollTrigger: { trigger: '.features', start: 'top bottom', end: 'top 30%', scrub: true } });
  }

  function initHover() {
    if (!finePointer) return;
    // магнітні кнопки
    $$('[data-magnetic]').forEach((el) => {
      const xTo = gsap.quickTo(el, 'x', { duration: .6, ease: 'power3' });
      const yTo = gsap.quickTo(el, 'y', { duration: .6, ease: 'power3' });
      el.addEventListener('mousemove', (e) => {
        if (!anim()) return;
        const r = el.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * .3);
        yTo((e.clientY - r.top - r.height / 2) * .35);
      });
      el.addEventListener('mouseleave', () => { if (!anim()) return; xTo(0); yTo(0); });
    });
    // 3D-нахил карток
    $$('[data-tilt]').forEach((el) => {
      const rx = gsap.quickTo(el, 'rotationX', { duration: .8, ease: 'power3' });
      const ry = gsap.quickTo(el, 'rotationY', { duration: .8, ease: 'power3' });
      gsap.set(el, { transformPerspective: 1100 });
      el.addEventListener('mousemove', (e) => {
        if (!anim()) return;
        const r = el.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - .5) * 6);
        rx(-((e.clientY - r.top) / r.height - .5) * 6);
      });
      el.addEventListener('mouseleave', () => { if (!anim()) return; rx(0); ry(0); });
    });
  }

  /* ---------------------------------------------------------
     Preloader → hero intro
     --------------------------------------------------------- */
  function intro() {
    const pre = $('.preloader');
    const heroTitle = $('.hero__tagline');
    const heroWords = $$('[data-letters]');
    if (!anim()) {
      heroTitle.classList.add('is-in');
      heroWords.forEach((w) => w.classList.add('is-in'));
      pre && pre.remove();
      return Promise.resolve();
    }
    if (lenis) lenis.stop();
    window.scrollTo(0, 0);

    const counter = $('[data-preload-count]');
    const o = { v: 0 };
    // хребет: точки як частки екрана (з макета 1920×1080), лінія малюється, по ній їде крапка
    const ridge = $('.preloader__ridge'), rPath = $('path', ridge), rDot = $('circle', ridge);
    const PTS = [[.031, .929], [.178, .692], [.308, .843], [.431, .374], [.599, .72], [.736, .178], [.842, .278], [.97, .093]];
    let len = 0;
    const setP = () => {
      rPath.style.strokeDashoffset = len * (1 - o.v);
      const pt = rPath.getPointAtLength(len * o.v);
      rDot.setAttribute('cx', pt.x); rDot.setAttribute('cy', pt.y);
      counter.textContent = fmt(o.v * 1240);
    };
    const drawRidge = () => {
      const w = innerWidth, h = innerHeight;
      ridge.setAttribute('viewBox', `0 0 ${w} ${h}`);
      rPath.setAttribute('d', 'M' + PTS.map(([x, y]) => `${(x * w).toFixed(1)} ${(y * h).toFixed(1)}`).join(' L'));
      len = rPath.getTotalLength();
      rPath.style.strokeDasharray = len;
      setP();
    };
    drawRidge();
    window.addEventListener('resize', drawRidge);
    const img = $('.hero__media img');
    const imgReady = Promise.race([
      img.complete ? Promise.resolve() : new Promise((r) => img.addEventListener('load', r, { once: true })),
      new Promise((r) => setTimeout(r, 3500)),
    ]);
    const count = new Promise((r) => {
      gsap.timeline({ onComplete: r })
        .to(o, { v: 1, duration: 2, ease: 'expo.inOut', onUpdate: setP });
    });

    return Promise.all([imgReady, count]).then(() => new Promise((resolve) => {
      const radius = getComputedStyle(html).getPropertyValue('--r-xl').trim() || '44px';
      gsap.timeline({ onComplete: () => { window.removeEventListener('resize', drawRidge); pre.remove(); resolve(); } })
        .to(['.preloader__brand', '.preloader__count', '.preloader__ridge'], { y: -40, opacity: 0, duration: .5, ease: 'expo.in', stagger: .05 })
        .to(pre, { yPercent: -100, borderBottomLeftRadius: '50% 120px', borderBottomRightRadius: '50% 120px', duration: 1.1, ease: 'expo.inOut' }, '-=.1')
        .fromTo('.hero__frame', { clipPath: 'inset(16% 14% 16% 14% round 300px)' }, { clipPath: `inset(0% 0% 0% 0% round ${radius})`, duration: 1.6, ease: 'expo.inOut', clearProps: 'clipPath' }, '<.05')
        .from('.hero__media img', { scale: 1.4, duration: 2.2, ease: 'expo.out' }, '<.3')
        .add(() => heroWords.forEach((w) => w.classList.add('is-in')), '<.3')
        .fromTo($$('.wi', heroWords[0]), { y: 0, yPercent: 115, rotate: 6 }, { y: 0, yPercent: 0, rotate: 0, duration: 1.5, ease: 'expo.out', stagger: .07 }, '<')
        .fromTo($$('.wi', heroWords[1]), { y: 0, yPercent: 115, rotate: 6 }, { y: 0, yPercent: 0, rotate: 0, duration: 1.5, ease: 'expo.out', stagger: .07 }, '<.25')
        .add(() => revealSplit(heroTitle), '<.2')
        .fromTo('.hero__thumb', { clipPath: 'inset(0% 100% 0% 0% round 16px)' }, { clipPath: 'inset(0% 0% 0% 0% round 16px)', duration: 1.4, ease: 'expo.inOut' }, '<')
        .to('[data-hero-fade]', { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: .1 }, '<.2')
        .from('.header__bar', { y: -30, opacity: 0, duration: 1, ease: 'expo.out' }, '<');
      if (lenis) setTimeout(() => lenis.start(), 900);
    }));
  }

  /* ---------------------------------------------------------
     Boot
     --------------------------------------------------------- */
  // розбиваємо заголовки, будуємо динамічні частини
  $$('[data-split]').forEach((el) => splitHeading(el));
  $$('[data-letters]').forEach((el) => {
    el.innerHTML = [...el.textContent].map((c) => `<span class="w"><span class="wi">${c}</span></span>`).join('');
    if (!anim()) el.classList.add('is-in');
  });
  if (!anim()) $$('[data-split]').forEach((el) => el.classList.add('is-in'));
  if (!anim()) setCountsFinal();
  buildManifesto($('[data-scrub]'), $('[data-scrub]').innerHTML);
  buildMap();
  renderReviews();

  if (anim()) {
    initSmoothScroll();
    initScrollAnimations();
    initHover();
  }
  initCursor();
  initScrollUI();
  applyLang(state.lang, false);
  setUrl(state.lang, true);

  intro().then(() => {
    if (!store.get('ovid-cookie')) setTimeout(showCookie, anim() ? 900 : 400);
    if (hasGsap) ScrollTrigger.refresh();
    const saved = session.get('ovid-scroll');
    if (saved) { session.del('ovid-scroll'); lenis ? lenis.scrollTo(+saved, { immediate: true }) : window.scrollTo(0, +saved); }
  });

  window.addEventListener('resize', () => updateSeasonPill());
  D.fonts && D.fonts.ready.then(() => { updateSeasonPill(); if (hasGsap) ScrollTrigger.refresh(); });
})();
