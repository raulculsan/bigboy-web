/* Big Boy Rules · web. All content lives in the lists below: edit them, not the pages.
   Only real content: members publish the rest from the site (site-club.js). Empty lists show a short note. */
(() => {
  'use strict';

  const INSTAGRAM_USER = '@thebigboyrules';
  const INSTAGRAM_URL = 'https://www.instagram.com/thebigboyrules';

  const LOOKS = [
    {nombre: 'Canyon Purple', prendas: ['Air Jordan 4 · Jordan'], src: 'fotos/moda/jordan-4-canyon-purple.jpg', alt: 'Zapatilla Air Jordan 4 morada y verde dentro de su caja, entre papel de seda'},
    {nombre: 'Recién llegadas', prendas: ['Caja Flight · Jordan'], src: 'fotos/moda/caja-jordan-flight.jpg', alt: 'Caja negra de Jordan con el logo rojo, sobre una mochila abierta'},
  ];

  // Planes: tipo libre (Cena, Escapada, Airsoft, Concierto...).
  const PLANES = [];
  // Juegos: gente buscando con quién jugar. plataformas: PC, PS5, PS4, Xbox, Nintendo Switch, Móvil, Otro.
  const PLATAFORMAS = ['PC', 'PS5', 'PS4', 'Xbox', 'Nintendo Switch', 'Móvil', 'Otro'];
  const JUEGOS = [];

  const FOTOS = [
    {carrete: 'Noches', label: 'Jekes', alto: 1.3333, src: 'fotos/carrete/jekes-noche.jpg', alt: 'Uno del grupo en la terraza de Jekes de noche, con el móvil tapándole la cara'},
  ];

  // calidad, precioEstrellas y servicio: de 1 a 5, con medias (4.5). La nota general es su media.
  // precio: 1 a 4 €, opcional
  const SITIOS = [
    {nombre: 'Cafetería el Rincón', tipo: 'Bar', zona: 'Ciudad Lineal', direccion: 'C. de José María Cavero, 15', lat: 40.44815, lng: -3.64795, calidad: 4, precioEstrellas: 5, servicio: 4, dice: 'Mejor calidad que los otros bares.', quien: 'Kike', fecha: '2026-07-28', mapa: 'https://maps.app.goo.gl/1tcR2HNsdzG3hmbW8', fotos: ['fotos/sitios/cafeteria-el-rincon-1.jpg', 'fotos/sitios/cafeteria-el-rincon-2.jpg']},
    {nombre: 'Tierra Burrito', tipo: 'Restaurante', zona: 'Ópera', direccion: 'Plaza de Isabel II, 5', lat: 40.418481, lng: -3.709416, calidad: 4, precioEstrellas: 3.5, servicio: 4, dice: 'Te llena bien, un poco caro para solo un burrito.', quien: 'Raúl', fecha: '2026-11-25', mapa: 'https://www.google.com/maps/search/?api=1&query=Tierra+Burrito+Plaza+de+Isabel+II+5+Madrid', fotos: ['fotos/sitios/tierra-burrito-opera-1.jpg', 'fotos/sitios/tierra-burrito-opera-2.jpg']},
  ];

  const average = marks => Math.round(marks.reduce((a, b) => a + b, 0) / marks.length * 100) / 100;
  const mark = v => v.toLocaleString('es-ES', {maximumFractionDigits: 1});
  for (const s of SITIOS) if (s.calidad && s.precioEstrellas && s.servicio) s.estrellas = average([s.calidad, s.precioEstrellas, s.servicio]);

  // ---------------------------------------------------------------- helpers
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, props = {}, kids = []) => { const n = Object.assign(document.createElement(tag), props); for (const k of [].concat(kids)) if (k != null) n.append(k); return n; };
  const slot = ({src, label, alt}, ratio) => {
    const f = el('figure', {className: src ? 'slot' : 'slot slot-empty'});
    if (ratio) f.style.aspectRatio = ratio;
    if (src) { const img = el('img', {src, alt: alt || label || '', loading: 'lazy', decoding: 'async'}); if (img.complete) img.classList.add('is-loaded'); f.append(img); }
    else { f.dataset.label = label || 'Foto'; f.setAttribute('role', 'img'); f.setAttribute('aria-label', `Hueco para foto: ${label || ''}`); }
    return f;
  };
  const euros = n => '€'.repeat(Math.max(1, Math.min(4, n || 1)));
  const date = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', {day: '2-digit', month: 'short', year: 'numeric'}).replace('.', '');
  const STAR = '<path d="M12 2.6l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.3l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z"/>';
  // Each star fills on its own (a 4 is exactly four stars at any size, whatever the gaps).
  const stars = value => {
    const v = Math.max(0, Math.min(5, Number(value) || 0));
    const box = el('span', {className: 'stars'});
    box.innerHTML = Array.from({length: 5}, (_, i) => {
      const fill = Math.max(0, Math.min(1, v - i)) * 100;
      return `<span class="star"><svg viewBox="0 0 24 24" aria-hidden="true">${STAR}</svg><span class="star-on" style="width:${fill}%"><svg viewBox="0 0 24 24" aria-hidden="true">${STAR}</svg></span></span>`;
    }).join('');
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', `${v.toLocaleString('es-ES')} de 5 estrellas`);
    return box;
  };

  // ---------------------------------------------------------------- menu (mobile)
  const sheet = $('.sheet'), open = $('.menu-btn');
  if (sheet && open) {
    const close = $('[data-close]', sheet);
    const set = on => { sheet.classList.toggle('is-open', on); open.setAttribute('aria-expanded', String(on)); document.documentElement.style.overflow = on ? 'hidden' : ''; if (on) close.focus(); else open.focus(); };
    open.addEventListener('click', () => set(true));
    close.addEventListener('click', () => set(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('is-open')) set(false); });
  }

  // ---------------------------------------------------------------- instagram
  for (const a of $$('[data-ig]')) { a.href = INSTAGRAM_URL; if (a.hasAttribute('data-ig-text')) a.textContent = INSTAGRAM_USER; }

  // ---------------------------------------------------------------- published content
  // site-club.js fills these with what members publish (newest first), on top of the lists above.
  const club = {looks: [], planes: [], juegos: [], fotos: [], sitios: [], instagram: []};
  const byDate = list => list.sort((a, b) => String(b.fecha || b.created_at || '').localeCompare(String(a.fecha || a.created_at || '')));
  const allLooks = () => [...club.looks, ...LOOKS];
  // The carrete follows Instagram (instagram.json, synced every few hours) plus photos uploaded here.
  const allFotos = () => [...byDate([...club.instagram, ...club.fotos]), ...FOTOS];
  const allPlanes = () => [...club.planes, ...PLANES].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const allJuegos = () => [...club.juegos, ...JUEGOS];
  const allSitios = () => [...club.sitios, ...SITIOS];
  // What an empty list says instead of placeholders.
  const nothing = (text, tag = 'p') => el(tag, {className: 'empty-note muted', textContent: text});
  // Delete control for an entry the signed-in person may remove (set by site-club.js).
  const tools = entry => (entry.id && window.BBSite.tools) ? window.BBSite.tools(entry) : null;

  // ---------------------------------------------------------------- home
  function renderHome() {
    const latest = $('[data-latest]');
    if (latest) { const recent = allFotos().slice(0, 5); latest.replaceChildren(...(recent.length ? recent.map(f => slot(f)) : [nothing('Todavía no hay fotos.')])); }
    const n = (count, one, many) => `${count} ${count === 1 ? one : many}`;
    const counts = {moda: n(allLooks().length, 'look', 'looks'), ocio: n(allPlanes().length, 'plan', 'planes'), fotos: n(allFotos().length, 'foto', 'fotos'), sitios: n(allSitios().length, 'sitio', 'sitios')};
    for (const c of $$('[data-count]')) c.textContent = counts[c.dataset.count] || '';
    // Each section's hover picture is its latest real photo; with none, no picture.
    const pictures = {Moda: allLooks()[0], Fotos: allFotos()[0], Sitios: allSitios().find(x => (x.fotos || []).length)};
    for (const thumb of $$('[data-thumb]')) {
      const pick = pictures[thumb.dataset.thumb];
      const src = pick?.src || pick?.fotos?.[0];
      thumb.replaceChildren(...(src ? [slot({src, alt: ''})] : []));
      thumb.hidden = !src;
    }
  }

  // ---------------------------------------------------------------- moda
  function renderLooks() {
    const looks = $('[data-looks]');
    if (looks && !allLooks().length) { looks.replaceChildren(nothing('Todavía no hay looks.')); return; }
    if (looks) looks.replaceChildren(...allLooks().map(look => el('article', {className: 'look rise'}, [
      slot({src: look.src, label: look.nombre, alt: look.alt}),
      el('div', {className: 'cap micro'}, [el('span', {textContent: look.nombre}), tools(look)]),
      el('ul', {className: 'look-items'}, (look.prendas || []).map(p => el('li', {textContent: p}))),
    ])));
  }

  // ---------------------------------------------------------------- ocio
  // Game covers: site/juegos/catalogo.json (scripts/build-game-covers.py) and a match by name,
  // forgiving accents, case, spaces and the usual nicknames (cod, gta 5, fifa...).
  const norm = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const COVERS = 3; // bump after rebuilding the covers
  let catalog = null;
  const loadCatalog = () => (catalog ||= fetch(`juegos/catalogo.json?v=${COVERS}`).then(r => (r.ok ? r.json() : [])).catch(() => []));
  // Every game the name fits, best first: «battlefield» lists all the Battlefields, BF6 first.
  const matchGames = async name => {
    const n = norm(name), squeezed = n.replace(/ /g, '');
    if (n.length < 2) return [];
    const scored = [];
    for (const game of await loadCatalog()) {
      let top = 0;
      for (const alias of [game.nombre, ...game.alias].map(norm)) {
        const a = alias.replace(/ /g, '');
        top = Math.max(top, n === alias || squeezed === a ? 1000
          : ` ${n} `.includes(` ${alias} `) ? 500 + alias.length
          : a.length >= 5 && squeezed.includes(a) ? 300 + a.length
          : n.length >= 3 && ` ${alias} `.includes(` ${n} `) ? 200 + n.length
          : n.length >= 4 && alias.startsWith(n) ? 100 + n.length : 0);
      }
      if (top) scored.push([top, game]);
    }
    return scored.sort((x, y) => y[0] - x[0]).map(([, game]) => game);
  };
  const matchGame = async name => (await matchGames(name))[0] || null;
  // portada: a catalogue id, 'sin' (the author said «No es este») or empty (look it up by name now).
  const coverImg = id => el('img', {src: `juegos/${id}.jpg?v=${COVERS}`, alt: '', decoding: 'async'});
  const cover = g => {
    if (g.portada && g.portada !== 'sin') return el('figure', {className: 'game-cover'}, [coverImg(g.portada)]);
    const f = el('figure', {className: 'game-cover is-blank'});
    f.innerHTML = PAD;
    if (!g.portada) matchGame(g.nombre).then(match => { if (match && match.img !== false) { f.className = 'game-cover'; f.replaceChildren(coverImg(match.id)); } });
    return f;
  };
  // A controller for games outside the catalogue.
  const PAD = '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M18 4h28c8 0 13 6 15 16l2 9c1 6-3 9-7 9-3 0-5-2-8-6l-2-3H18l-2 3c-3 4-5 6-8 6-4 0-8-3-7-9l2-9C5 10 10 4 18 4z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M17 14v10M12 19h10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="44" cy="15" r="2.4" fill="currentColor"/><circle cx="50" cy="21" r="2.4" fill="currentColor"/></svg>';
  // Group invite links (only members get them from the server): the button names the app.
  const inviteApp = url => (/whatsapp|wa\.me/.test(url) ? 'WhatsApp' : /t\.me|telegram/.test(url) ? 'Telegram' : /discord/.test(url) ? 'Discord' : 'el grupo');
  const invite = url => (url ? el('a', {className: 'invite', href: url, target: '_blank', rel: 'noopener noreferrer', textContent: `Unirse en ${inviteApp(url)}`}) : null);
  const filters = {planes: 'Todos', juegos: 'Todas', fotos: 'Todas', sitios: 'Todos'};
  const chips = (box, names, key, again) => {
    if (!names.includes(filters[key])) filters[key] = names[0];
    box.replaceChildren(...names.map(n => el('button', {type: 'button', className: 'chip', textContent: n, onclick: () => { filters[key] = n; again(); }})));
    $$('button', box).forEach(b => b.setAttribute('aria-pressed', String(b.textContent === filters[key])));
  };
  function renderPlanes() {
    const log = $('[data-planes]'), planTypes = $('[data-tipos-plan]');
    if (!log || !planTypes) return;
    const list = allPlanes();
    chips(planTypes, ['Todos', ...new Set(list.map(p => p.tipo))], 'planes', renderPlanes);
    if (!list.length) { planTypes.replaceChildren(); log.replaceChildren(el('tr', {}, [el('td', {colSpan: 4}, [nothing('Todavía no hay planes. Entra y añade el primero.', 'span')])])); return; }
    log.replaceChildren(...list.filter(p => filters.planes === 'Todos' || p.tipo === filters.planes).map(p => el('tr', {}, [
      el('td', {textContent: date(p.fecha)}),
      el('td', {textContent: p.plan}),
      el('td', {textContent: p.tipo}),
      el('td', {}, [p.nota || '', p.quien ? el('span', {className: 'by', textContent: ` · ${p.quien}`}) : null, tools(p), p.invitacion ? el('div', {className: 'plan-invite'}, [invite(p.invitacion)]) : null]),
    ])));
  }
  function renderJuegos() {
    const box = $('[data-juegos]'), hint = $('[data-invite-hint]'), platforms = $('[data-plataformas]');
    if (!box) return;
    const list = allJuegos();
    if (platforms) chips(platforms, ['Todas', ...PLATAFORMAS.filter(x => list.some(g => (g.plataformas || []).includes(x)))], 'juegos', renderJuegos);
    if (hint) hint.hidden = Boolean(window.BBSite?.who);
    if (!list.length) { if (platforms) platforms.replaceChildren(); box.replaceChildren(nothing('Nadie busca gente para jugar todavía. Entra y publica el primero.')); return; }
    const shown = list.filter(g => filters.juegos === 'Todas' || (g.plataformas || []).includes(filters.juegos));
    box.replaceChildren(...shown.map(g => el('article', {className: 'game rise'}, [
      cover(g),
      el('ul', {className: 'game-platforms micro', ariaLabel: 'Plataformas'}, (g.plataformas || []).map(x => el('li', {textContent: x}))),
      el('h3', {className: 'wide', textContent: g.nombre}),
      g.nota ? el('p', {className: 'game-note', textContent: g.nota}) : null,
      el('div', {className: 'game-foot'}, [invite(g.invitacion), g.quien ? el('span', {className: 'by micro', textContent: g.quien}) : null, tools(g)]),
    ])));
    if (hint) hint.hidden = Boolean(window.BBSite?.who);
  }

  // ---------------------------------------------------------------- fotos
  const viewer = $('.viewer');
  if (viewer) { $('[data-viewer-close]', viewer).addEventListener('click', () => viewer.close()); viewer.addEventListener('click', e => { if (e.target === viewer) viewer.close(); }); }
  function renderFotos() {
    const masonry = $('[data-fotos]'), rolls = $('[data-carretes]');
    if (!masonry || !rolls) return;
    const list = allFotos();
    if (!list.length) { rolls.replaceChildren(); masonry.replaceChildren(nothing('Todavía no hay fotos.')); return; }
    chips(rolls, ['Todas', ...new Set(list.map(f => f.carrete))], 'fotos', renderFotos);
    masonry.replaceChildren(...list.filter(f => filters.fotos === 'Todas' || f.carrete === filters.fotos).map(f => {
      const b = el('button', {type: 'button'}, [slot(f, `1 / ${f.alto}`)]);
      b.setAttribute('aria-label', `Ver ${f.label}, carrete ${f.carrete}`);
      b.addEventListener('click', () => {
        if (!viewer) return;
        $('[data-viewer-slot]', viewer).replaceChildren(slot(f));
        $('[data-viewer-cap]', viewer).replaceChildren(...(f.enlace
          ? [f.texto ? el('span', {className: 'viewer-text', textContent: f.texto}) : '', el('a', {href: f.enlace, target: '_blank', rel: 'noopener', textContent: f.video ? 'Ver el vídeo en Instagram' : 'Ver en Instagram'})]
          : [`${f.label} · ${f.carrete}`, tools(f) || '']));
        viewer.showModal();
      });
      return b;
    }));
  }

  // ---------------------------------------------------------------- sitios
  function renderSitios() {
    const spots = $('[data-sitios]'), types = $('[data-tipos]');
    if (!spots || !types) return;
    const all = allSitios();
    if (!all.length) { types.replaceChildren(); spots.replaceChildren(nothing('Todavía no hay reseñas. Entra y añade la primera.', 'li')); return; }
    chips(types, ['Todos', ...new Set(all.map(s => s.tipo))], 'sitios', renderSitios);
    const list = all.filter(s => filters.sitios === 'Todos' || s.tipo === filters.sitios).sort((a, b) => b.estrellas - a.estrellas);
    spots.replaceChildren(...list.map(s => el('li', {className: 'spot rise'}, [
      // Score card: the overall mark as a big number over its stars, then one line per rating.
      el('div', {className: 'spot-score'}, [
        el('div', {className: 'score-main'}, [
          el('p', {className: 'score-num wide'}, [mark(s.estrellas), el('span', {textContent: '/5'})]),
          stars(s.estrellas),
        ]),
        s.calidad ? el('dl', {className: 'score-parts'}, [['Calidad', s.calidad], ['Precio', s.precioEstrellas], ['Servicio', s.servicio]].filter(([, v]) => v).map(([label, v]) =>
          el('div', {}, [el('dt', {className: 'micro', textContent: label}), el('dd', {}, [stars(v), el('span', {className: 'score-part-num', textContent: mark(v)})])]))) : null,
      ]),
      el('h3', {className: 'spot-name wide', textContent: s.nombre}),
      el('div', {className: 'spot-meta micro'}, [el('span', {textContent: s.tipo}), s.zona ? el('span', {textContent: s.zona}) : null, s.precio ? el('span', {textContent: euros(s.precio)}) : null]),
      el('div', {className: 'spot-side'}, [
        (s.fotos || []).length ? el('div', {className: 'spot-photos'}, s.fotos.map(src => el('figure', {className: 'slot spot-photo'}, [el('img', {src, alt: `Foto de ${s.nombre}`, loading: 'lazy', decoding: 'async'})]))) : null,
        el('p', {className: 'spot-says', textContent: s.dice}),
        el('div', {className: 'spot-foot'}, [
          el('span', {textContent: `Lo recomienda ${s.quien}${s.fecha ? ` · ${date(s.fecha)}` : ''}`}),
          s.direccion ? el('span', {textContent: s.direccion}) : null,
          s.mapa ? el('a', {href: s.mapa, target: '_blank', rel: 'noopener', textContent: 'Cómo llegar'}) : null,
          s.lat != null && s.lng != null ? el('a', {href: `mapa.html#sitio-${encodeURIComponent(s.id ?? s.nombre)}`, textContent: 'Ver en el mapa'}) : null,
          tools(s),
        ]),
      ]),
    ])));
  }

  const firstLine = text => { const line = String(text || '').split('\n')[0].trim(); return line.length > 40 ? `${line.slice(0, 39)}…` : line; };
  fetch('instagram.json', {cache: 'no-cache'}).then(r => (r.ok ? r.json() : null)).then(data => {
    if (!data?.posts?.length) return;
    club.instagram = data.posts.map(p => ({...p, carrete: 'Instagram', label: firstLine(p.texto) || 'Instagram', alt: String(p.texto || '').slice(0, 200) || 'Publicación de Instagram de The Big Boy Rules', alto: p.alto / p.ancho}));
    renderAll();
  }).catch(() => {});

  // Photos fade in once loaded instead of popping in one by one (see html.js .slot img in site.css).
  const markLoaded = () => $$('.slot img').forEach(img => { if (img.complete) img.classList.add('is-loaded'); });
  document.addEventListener('load', e => { if (e.target.tagName === 'IMG') e.target.classList.add('is-loaded'); }, true);
  document.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.classList.add('is-loaded'); }, true);

  // Redraw only when what is shown changed (new content or who is signed in): rebuilding the
  // photos makes them fade in again, which reads as a blink.
  let shown = '';
  function renderAll() {
    const key = JSON.stringify([club, window.BBSite?.who || null]);
    if (key === shown) return;
    shown = key;
    renderHome(); renderLooks(); renderPlanes(); renderJuegos(); renderFotos(); renderSitios(); window.BBSite.renderMapa?.(); reveal(); markLoaded();
  }
  window.BBSite = {club, renderAll, el, $, $$, stars, average, mark, plataformas: PLATAFORMAS, sitios: allSitios, planes: allPlanes, matchGame, matchGames, cover, carretes: () => [...new Set(allFotos().map(f => f.carrete))], tools: null, who: null};

  // ---------------------------------------------------------------- cookie notice
  // Only technical storage is used, so this informs rather than asks. Shown once.
  const NOTE_KEY = 'bbr-cookies';
  let seen = false;
  try { seen = localStorage.getItem(NOTE_KEY) === '1'; } catch {}
  if (!seen && !/cookies\.html$/.test(location.pathname)) {
    const note = el('aside', {className: 'cookie-note', role: 'region'}, [
      el('p', {}, ['Solo guardamos lo imprescindible para que la web funcione. Nada de publicidad ni rastreo. ', el('a', {href: 'cookies.html', textContent: 'Más información'})]),
      el('button', {type: 'button', className: 'btn btn-solid', textContent: 'Entendido', onclick: () => { try { localStorage.setItem(NOTE_KEY, '1'); } catch {} note.classList.add('is-gone'); setTimeout(() => note.remove(), 300); }}),
    ]);
    note.setAttribute('aria-label', 'Aviso de cookies');
    document.body.append(note);
  }

  // ---------------------------------------------------------------- app version on offer
  // release-all.sh writes /version.json each time it publishes a new APK.
  const versionLine = $('[data-app-version]');
  if (versionLine) fetch('/version.json', {cache: 'no-cache'}).then(r => (r.ok ? r.json() : null)).then(v => {
    if (!v?.version) return;
    versionLine.textContent = `Android · versión ${v.version}${v.fecha ? ` · ${date(v.fecha)}` : ''}`;
    versionLine.hidden = false;
  }).catch(() => {});

  // ---------------------------------------------------------------- the name fills its line exactly
  function fit() {
    for (const node of $$('.hero-mark')) {
      const box = node.parentElement, style = getComputedStyle(box);
      const room = Math.min(box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), 1520);
      node.style.fontSize = '100px';
      node.style.display = 'inline-block';
      const width = node.getBoundingClientRect().width;
      node.style.display = '';
      if (width && room) node.style.fontSize = `${Math.floor((100 * room / width) * 100) / 100}px`;
    }
  }
  // The page shows itself in one go once the content is built, the font is in and the name is sized.
  const ready = () => { fit(); document.documentElement.classList.add('ready'); };
  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ready, ready); else ready();
  let fitFrame = 0;
  addEventListener('resize', () => { cancelAnimationFrame(fitFrame); fitFrame = requestAnimationFrame(fit); });

  // ---------------------------------------------------------------- one motion moment
  function reveal() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) { $$('.rise').forEach(n => n.classList.add('is-in')); return; }
    const fresh = $$('.rise:not(.is-in)');
    // On arrival, what is already on screen appears with the page; only what you scroll to rises.
    if (!document.documentElement.classList.contains('ready')) for (const n of fresh) if (n.getBoundingClientRect().top < innerHeight) n.classList.add('is-in', 'instant');
    const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), {rootMargin: '0px 0px -8% 0px'});
    fresh.filter(n => !n.classList.contains('is-in')).forEach(n => io.observe(n));
  }
  renderAll();
})();
