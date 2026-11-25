/* Big Boy Rules · web: what members publish.
   Reads the published content for everyone. Members sign in with their app account (same session
   as the web app at /app/) to add reviews (Sitios), plans and games (Ocio); admins also add looks (Moda)
   and photos (Fotos). Authors delete their own entries; admins delete any. */
(() => {
  'use strict';
  const site = window.BBSite, config = window.BIG_BOY_CONFIG || {};
  if (!site || !window.supabase || !config.supabaseUrl || !config.supabasePublishableKey) return;
  const {el, $, $$, club} = site;
  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {persistSession: true, autoRefreshToken: true, storage: window.localStorage, flowType: 'pkce'},
  });
  const page = document.body.dataset.page || (location.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'index';
  let me = null; // {id, name, admin}

  // ---------------------------------------------------------------- reading
  const day = iso => String(iso || '').slice(0, 10);
  async function load() {
    // Plans and games are read without their invite links; members get those from site_invites().
    const COLUMNS = {site_plans: 'id,author_id,autor,fecha,plan,tipo,nota,lat,lng,created_at', site_games: 'id,author_id,autor,nombre,plataformas,nota,portada,created_at'};
    const get = table => db.from(table).select(COLUMNS[table] || '*').order('created_at', {ascending: false}).limit(200);
    const {data: {session}} = await db.auth.getSession();
    const [spots, plans, games, looks, photos, invites] = await Promise.all([
      ...['site_spots', 'site_plans', 'site_games', 'site_looks', 'site_photos'].map(get),
      session ? db.rpc('site_invites') : Promise.resolve({data: []}),
    ]);
    const links = new Map((invites.data || []).map(r => [r.id, r.invitacion]));
    if (spots.data) club.sitios = spots.data.map(r => ({...r, lat: r.lat ?? null, lng: r.lng ?? null, table: 'site_spots', estrellas: Number(r.estrellas), calidad: Number(r.estrellas_calidad), precioEstrellas: Number(r.estrellas_precio), servicio: Number(r.estrellas_servicio), quien: r.autor, fecha: day(r.created_at)}));
    if (plans.data) club.planes = plans.data.map(r => ({...r, table: 'site_plans', quien: r.autor, invitacion: links.get(r.id) || null}));
    if (games.data) club.juegos = games.data.map(r => ({...r, table: 'site_games', quien: r.autor, invitacion: links.get(r.id) || null}));
    if (looks.data) club.looks = looks.data.map(r => ({...r, table: 'site_looks', src: r.foto}));
    if (photos.data) club.fotos = photos.data.map(r => ({...r, table: 'site_photos', src: r.foto, alto: r.alto / r.ancho}));
    site.renderAll();
  }

  // ---------------------------------------------------------------- deleting
  site.tools = entry => {
    if (!me || !(me.admin || entry.author_id === me.id)) return null;
    return el('button', {type: 'button', className: 'mini-action', textContent: 'Borrar', onclick: async event => {
      event.stopPropagation();
      if (!confirm('¿Borrar esto de la web? No se puede deshacer.')) return;
      const {error} = await db.from(entry.table).delete().eq('id', entry.id);
      if (error) { alert('No se pudo borrar. Inténtalo de nuevo.'); return; }
      const files = [].concat(entry.fotos || [], entry.foto || []).map(u => String(u).split('/site-media/')[1]).filter(Boolean);
      if (files.length) db.storage.from('site-media').remove(files).catch(() => {});
      $('.viewer')?.open && $('.viewer').close();
      load();
    }});
  };

  // ---------------------------------------------------------------- panels
  const panel = (title, body) => {
    const dialog = el('dialog', {className: 'panel'}, [el('div', {className: 'panel-body'}, [
      el('div', {className: 'panel-top'}, [el('h2', {className: 'wide', textContent: title}), el('button', {type: 'button', className: 'micro panel-close', textContent: 'Cerrar', onclick: () => dialog.close()})]),
      body,
    ])]);
    dialog.addEventListener('close', () => dialog.remove());
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  };
  const field = (label, input, hint) => el('label', {className: 'field'}, [el('span', {className: 'micro', textContent: label}), input, hint ? el('small', {textContent: hint}) : null]);
  const input = (name, {list, ...props} = {}) => { const node = el('input', {name, autocomplete: 'off', ...props}); if (list) node.setAttribute('list', list); return node; };
  const select = (name, options) => el('select', {name}, options.map(o => el('option', {value: o, textContent: o})));
  const area = (name, props = {}) => el('textarea', {name, rows: 3, ...props});
  const status = () => el('p', {className: 'form-status', role: 'status'});

  // ---------------------------------------------------------------- sign in
  async function signIn(username, password) {
    // Cloudflare Turnstile only when the server sees an attack (/app/captcha.js).
    const {response, result} = await window.BBCaptcha.postJSON(`${config.supabaseUrl}/functions/v1/account-requests`,
      {apikey: config.supabasePublishableKey},
      {action: 'login', username: String(username || '').trim().toLowerCase().replace(/^@/, ''), password},
      {siteKey: config.turnstileSiteKey});
    if (!response.ok || !result.session) throw new Error(result.error || 'No se pudo entrar. Revisa el usuario y la contraseña.');
    const {error} = await db.auth.setSession(result.session);
    if (error) throw new Error('No se pudo entrar. Inténtalo de nuevo.');
  }
  function openSignIn() {
    const note = status();
    const form = el('form', {className: 'panel-form'}, [
      el('p', {className: 'muted', textContent: 'Con tu cuenta de la app.'}),
      field('Usuario', input('username', {required: true, autocomplete: 'username', autocapitalize: 'none', spellcheck: false})),
      field('Contraseña', input('password', {type: 'password', required: true, autocomplete: 'current-password'})),
      el('button', {type: 'submit', className: 'btn btn-solid', textContent: 'Entrar'}),
      note,
    ]);
    const dialog = panel('Entrar', form);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('button[type=submit]', form);
      button.disabled = true; note.textContent = 'Entrando…';
      try { await signIn(form.username.value, form.password.value); await whoAmI(); dialog.close(); }
      catch (error) { note.textContent = error.message; button.disabled = false; }
    });
  }
  function openAccount() {
    const body = el('div', {className: 'panel-form'}, [
      el('p', {textContent: `Has entrado como ${me.name}${me.admin ? ' (administración)' : ''}.`}),
      el('p', {className: 'muted', textContent: me.admin ? 'Puedes añadir reseñas, planes, juegos, looks y fotos, y borrar cualquier cosa.' : 'Puedes añadir reseñas en Sitios y planes y juegos en Ocio, y borrar lo tuyo.'}),
      el('div', {className: 'account-actions'}, [
        el('button', {type: 'button', className: 'btn', textContent: me.admin ? 'Fallos reportados' : 'Reportar un fallo', onclick: () => { dialog.close(); openReport(); }}),
        el('button', {type: 'button', className: 'btn', textContent: 'Salir', onclick: async () => { await db.auth.signOut(); me = null; paintAccount(); site.renderAll(); dialog.close(); }}),
      ]),
    ]);
    const dialog = panel('Tu cuenta', body);
  }

  // ---------------------------------------------------------------- photos
  async function shrink(file, max = 1600) {
    const bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'});
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = Object.assign(document.createElement('canvas'), {width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale)});
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(done => canvas.toBlob(done, 'image/jpeg', 0.82));
    return {blob, width: canvas.width, height: canvas.height};
  }
  // randomUUID only exists on https pages.
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
  async function upload(file) {
    const {blob, width, height} = await shrink(file);
    const path = `${me.id}/${uid()}.jpg`;
    const {error} = await db.storage.from('site-media').upload(path, blob, {contentType: 'image/jpeg', cacheControl: '31536000'});
    if (error) throw new Error('No se pudo subir la foto.');
    return {url: db.storage.from('site-media').getPublicUrl(path).data.publicUrl, width, height};
  }
  const photoPicker = (multiple, max) => {
    const preview = el('div', {className: 'picks'});
    const picker = input('fotos', {type: 'file', accept: 'image/*', multiple});
    picker.addEventListener('change', () => {
      if (picker.files.length > max) { alert(`Como mucho ${max} fotos.`); picker.value = ''; }
      preview.replaceChildren(...[...picker.files].map(f => el('img', {src: URL.createObjectURL(f), alt: ''})));
    });
    return {picker, preview};
  };

  // ---------------------------------------------------------------- star input
  const starInput = (onChange = () => {}) => {
    let value = 0;
    const out = el('span', {className: 'micro', textContent: 'Sin nota'});
    const show = el('span', {className: 'star-show'});
    const paint = () => { show.replaceChildren(site.stars(value)); out.textContent = value ? `${value.toLocaleString('es-ES')} de 5` : 'Sin nota'; };
    const buttons = el('span', {className: 'star-hits'}, [1, 2, 3, 4, 5].map(n => (() => { const b = el('button', {type: 'button', onclick: () => { value = value === n ? n - 0.5 : n; paint(); onChange(); }}); b.setAttribute('aria-label', `${n} estrellas`); return b; })()));
    paint();
    return {node: el('div', {className: 'star-input'}, [el('div', {className: 'star-stack'}, [show, buttons]), out]), get: () => value};
  };

  // ---------------------------------------------------------------- forms
  async function send(form, note, work) {
    const button = $('button[type=submit]', form);
    button.disabled = true; note.textContent = 'Publicando…';
    try { await work(); await load(); form.closest('dialog').close(); }
    catch (error) {
      const text = String(error?.message || '');
      note.textContent = /row-level|permission/i.test(text) ? 'No tienes permiso para publicar aquí. Si acabas de entrar, abre la app y termina de configurar tu cuenta.'
        : /text_ok/.test(text) ? 'Hay algo que no se puede publicar: palabrotas, enlaces o spam. Quítalo y vuelve a probar.'
        : /mapa|map_ok/.test(text) ? 'El enlace tiene que ser de Google Maps o Apple Maps.'
        : /invitacion|invite_ok/.test(text) ? 'El enlace tiene que ser una invitación de WhatsApp, Telegram o Discord.'
        : (text || 'No se pudo publicar. Inténtalo de nuevo.');
      button.disabled = false;
    }
  }
  const must = ({error}) => { if (error) throw new Error(error.message); };
  const clean = v => String(v || '').trim() || null;
  // Swearing, scams and links: site-moderation.js, the same rules the database applies.
  const moderation = window.BBModeration;
  const blocked = (note, ...texts) => {
    const kind = moderation.problem(...texts);
    if (kind) note.textContent = moderation.message(kind);
    return Boolean(kind);
  };
  const inviteField = () => field('Enlace de invitación', input('invitacion', {type: 'url', maxLength: 200, placeholder: 'https://chat.whatsapp.com/…'}), 'Opcional. De WhatsApp, Telegram o Discord. Solo lo ven los miembros.');
  const inviteValue = (form, note) => {
    const url = clean(form.invitacion.value);
    if (url && !moderation.inviteOk(url)) { note.textContent = 'El enlace tiene que ser una invitación de WhatsApp, Telegram o Discord.'; return false; }
    return url;
  };

  // Where it is, for the club map: search an address or a place (Photon, OpenStreetMap
  // data) and tap a result. A Google Maps link with coordinates in it also works.
  const fromMapLink = url => { const m = String(url || '').match(/[@=](-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/); return m ? {lat: +m[1], lng: +m[2]} : null; };
  const placeField = hint => {
    let picked = null, timer = 0, asked = 0;
    const query = input('lugar', {type: 'search', maxLength: 120, placeholder: 'Busca la dirección o el nombre del sitio', enterKeyHint: 'search'});
    const results = el('ul', {className: 'place-results'}), chosen = el('p', {className: 'place-chosen micro', hidden: true});
    const choose = (point, label) => { picked = point; query.value = label; results.replaceChildren(); chosen.hidden = false; chosen.textContent = `En el mapa: ${label}`; };
    async function search() {
      const text = query.value.trim(), mine = ++asked;
      if (text.length < 3) { results.replaceChildren(); return; }
      try {
        const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&lat=40.4168&lon=-3.7038&limit=5&bbox=-4.7,39.8,-2.9,41.2`, {signal: AbortSignal.timeout(8000)});
        const {features = []} = await response.json();
        if (mine !== asked) return;
        results.replaceChildren(...(features.length ? features.map(f => {
          const p = f.properties || {}, [lng, lat] = f.geometry.coordinates;
          const label = [p.name !== p.street ? p.name : null, p.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ''}` : null, p.district || p.city].filter(Boolean).join(', ');
          return el('li', {}, [el('button', {type: 'button', textContent: label, onclick: () => choose({lat: +lat.toFixed(6), lng: +lng.toFixed(6)}, label)})]);
        }) : [el('li', {className: 'micro muted', textContent: 'Sin resultados en Madrid.'})]));
      } catch { if (mine === asked) results.replaceChildren(el('li', {className: 'micro muted', textContent: 'No se pudo buscar ahora.'})); }
    }
    query.addEventListener('input', () => { picked = null; chosen.hidden = true; clearTimeout(timer); timer = setTimeout(search, 350); });
    query.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); clearTimeout(timer); search(); } });
    return {node: el('div', {className: 'field place-field'}, [el('span', {className: 'micro', textContent: 'En el mapa'}), query, results, chosen, el('small', {textContent: hint})]), get: () => picked};
  };

  function addSpot() {
    const note = status(), {picker, preview} = photoPicker(true, 4);
    const overall = el('span', {className: 'rating-overall'});
    const paintOverall = () => {
      const marks = [quality.get(), value.get(), service.get()];
      overall.replaceChildren(marks.every(Boolean) ? site.stars(site.average(marks)) : '', el('span', {className: 'micro', textContent: marks.every(Boolean) ? `${site.mark(site.average(marks))} de 5` : 'Se calcula con las tres'}));
    };
    const quality = starInput(paintOverall), value = starInput(paintOverall), service = starInput(paintOverall);
    paintOverall();
    const place = placeField('Opcional. Para que salga en el mapa del club.');
    const form = el('form', {className: 'panel-form'}, [
      field('Sitio', input('nombre', {required: true, maxLength: 80})),
      field('Tipo', select('tipo', ['Restaurante', 'Bar', 'Café', 'Tienda', 'Otro'])),
      el('div', {className: 'rating-group'}, [
        el('p', {className: 'micro', textContent: 'Estrellas'}),
        el('small', {textContent: 'Toca una estrella; tócala otra vez para media.'}),
        el('div', {className: 'rating-row'}, [el('span', {textContent: 'Calidad'}), quality.node]),
        el('div', {className: 'rating-row'}, [el('span', {textContent: 'Precio'}), value.node]),
        el('div', {className: 'rating-row'}, [el('span', {textContent: 'Servicio'}), service.node]),
        el('div', {className: 'rating-row rating-row-overall'}, [el('span', {textContent: 'General'}), overall]),
      ]),
      field('Qué te pareció', area('dice', {required: true, maxLength: 400})),
      field('Zona', input('zona', {maxLength: 40, placeholder: 'Malasaña'})),
      field('Dirección', input('direccion', {maxLength: 120})),
      place.node,
      field('Enlace de Google Maps', input('mapa', {type: 'url', maxLength: 300, placeholder: 'https://maps.app.goo.gl/…'})),
      field('Fotos', picker, 'Hasta 4.'), preview,
      el('button', {type: 'submit', className: 'btn btn-solid', textContent: 'Publicar reseña'}), note,
    ]);
    panel('Nueva reseña', form);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!quality.get() || !value.get() || !service.get()) { note.textContent = 'Ponle estrellas a la calidad, al precio y al servicio.'; return; }
      const mapa = clean(form.mapa.value);
      if (mapa && !moderation.mapOk(mapa)) { note.textContent = 'El enlace tiene que ser de Google Maps o Apple Maps.'; return; }
      if (blocked(note, form.nombre.value, form.zona.value, form.direccion.value, form.dice.value)) return;
      send(form, note, async () => {
        const fotos = [];
        for (const file of picker.files) fotos.push((await upload(file)).url);
        must(await db.from('site_spots').insert({
          nombre: form.nombre.value.trim(), tipo: form.tipo.value, estrellas_calidad: quality.get(), estrellas_precio: value.get(), estrellas_servicio: service.get(), dice: form.dice.value.trim(),
          zona: clean(form.zona.value), direccion: clean(form.direccion.value), mapa, fotos, ...(place.get() || fromMapLink(mapa) || {}),
        }));
      });
    });
  }

  function addPlan() {
    const note = status(), place = placeField('Opcional. Dónde es, para que salga en el mapa del club.');
    const form = el('form', {className: 'panel-form'}, [
      field('Plan', input('plan', {required: true, maxLength: 80})),
      field('Fecha', input('fecha', {type: 'date', required: true, value: new Date().toISOString().slice(0, 10)})),
      field('Tipo', select('tipo', ['Cena', 'Airsoft', 'Escapada', 'Concierto', 'Fiesta', 'Deporte', 'Otro'])),
      field('Notas', area('nota', {maxLength: 300})),
      place.node,
      inviteField(),
      el('button', {type: 'submit', className: 'btn btn-solid', textContent: 'Publicar plan'}), note,
    ]);
    panel('Nuevo plan', form);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (blocked(note, form.plan.value, form.nota.value)) return;
      const invitacion = inviteValue(form, note);
      if (invitacion === false) return;
      send(form, note, async () => must(await db.from('site_plans').insert({plan: form.plan.value.trim(), fecha: form.fecha.value, tipo: form.tipo.value, nota: clean(form.nota.value), invitacion, ...(place.get() || {})})));
    });
  }

  function addGame() {
    const note = status();
    // Platforms: tap as many as apply.
    const picks = el('div', {className: 'platform-picks', role: 'group', ariaLabel: 'Plataformas'}, site.plataformas.map(name =>
      el('label', {className: 'platform-pick'}, [el('input', {type: 'checkbox', name: 'plataformas', value: name}), el('span', {textContent: name})])));
    // The cover is found from the name as it is typed; «No es este» leaves the plain one.
    // found: the game picked for the name typed (the best match, or the one tapped in «¿Cuál?»).
    let found = null, foundFor = '', refused = '';
    const detected = el('div', {className: 'game-detect', hidden: true});
    const paint = (name, options) => {
      detected.hidden = !name;
      const chooser = options.length > 1 ? el('div', {className: 'game-options'}, [
        el('span', {className: 'micro', textContent: '¿Cuál?'}),
        ...options.slice(0, 8).map(game => { const b = el('button', {type: 'button', className: 'chip', textContent: game.nombre, onclick: () => { found = game; paint(name, options); }}); b.setAttribute('aria-pressed', String(game === found)); return b; }),
      ]) : null;
      detected.replaceChildren(site.cover({nombre: name, portada: found?.id && found.img !== false ? found.id : 'sin'}),
        el('p', {className: 'micro'}, found ? [`Detectado: ${found.nombre}`, el('button', {type: 'button', className: 'mini-action', textContent: 'No es ninguno', onclick: () => { refused = norm(name); paintCover(); }})] : ['Sin portada del juego: saldrá con el nombre.']),
        chooser);
    };
    const paintCover = async () => {
      const name = form.nombre.value.trim();
      const options = name && norm(name) !== refused ? await site.matchGames(name) : [];
      if (name !== form.nombre.value.trim()) return; // typed on meanwhile
      found = options[0] || null; foundFor = norm(name);
      paint(name, options);
    };
    const norm = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    let typing = 0;
    const form = el('form', {className: 'panel-form'}, [
      field('Juego', input('nombre', {required: true, maxLength: 60, placeholder: 'Warzone, FIFA, Fortnite…', oninput: () => { clearTimeout(typing); typing = setTimeout(paintCover, 220); }, onchange: () => paintCover()})),
      detected,
      el('div', {className: 'field'}, [el('span', {className: 'micro', textContent: 'Plataformas'}), picks, el('small', {textContent: 'Marca todas en las que juegas.'})]),
      field('Qué buscas', area('nota', {maxLength: 300, placeholder: 'Cuántos faltáis, cuándo jugáis, modo…'})),
      inviteField(),
      el('button', {type: 'submit', className: 'btn btn-solid', textContent: 'Publicar'}), note,
    ]);
    panel('Buscar gente para jugar', form);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (blocked(note, form.nombre.value, form.nota.value)) return;
      const invitacion = inviteValue(form, note);
      if (invitacion === false) return;
      const plataformas = $$('input[name="plataformas"]:checked', form).map(x => x.value);
      if (!plataformas.length) { note.textContent = 'Marca al menos una plataforma.'; return; }
      // A detected game takes its proper name (fornite → Fortnite); extras go in «Qué buscas».
      // Detection runs again here: Publicar can come before the typing pause or after a keyboard suggestion.
      send(form, note, async () => {
        const typed = form.nombre.value.trim();
        const match = norm(typed) === refused ? null : foundFor === norm(typed) ? found : await site.matchGame(typed);
        const portada = norm(typed) === refused ? 'sin' : match && match.img !== false ? match.id : null;
        must(await db.from('site_games').insert({nombre: match?.nombre || typed, plataformas, nota: clean(form.nota.value), invitacion, portada}));
      });
    });
  }

  function addLook() {
    const note = status(), {picker, preview} = photoPicker(false, 1);
    picker.required = true;
    const form = el('form', {className: 'panel-form'}, [
      field('Foto', picker), preview,
      field('Nombre del look', input('nombre', {required: true, maxLength: 60})),
      field('Prendas', area('prendas', {placeholder: 'Una por línea: Prenda · Marca'}), 'Hasta 6.'),
      field('Descripción de la foto', input('alt', {maxLength: 200}), 'Para quien no puede verla.'),
      el('button', {type: 'submit', className: 'btn btn-solid', textContent: 'Publicar look'}), note,
    ]);
    panel('Nuevo look', form);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (blocked(note, form.nombre.value, form.prendas.value, form.alt.value)) return;
      send(form, note, async () => {
        const {url} = await upload(picker.files[0]);
        const prendas = form.prendas.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 6);
        must(await db.from('site_looks').insert({nombre: form.nombre.value.trim(), prendas, foto: url, alt: clean(form.alt.value)}));
      });
    });
  }

  function addPhoto() {
    const note = status(), {picker, preview} = photoPicker(false, 1);
    picker.required = true;
    const rolls = el('datalist', {id: 'carretes-list'}, site.carretes().map(c => el('option', {value: c})));
    const form = el('form', {className: 'panel-form'}, [
      field('Foto', picker), preview,
      field('Carrete', input('carrete', {required: true, maxLength: 30, list: 'carretes-list', placeholder: 'Noches'})), rolls,
      field('Título', input('label', {required: true, maxLength: 60})),
      field('Descripción de la foto', input('alt', {maxLength: 200}), 'Para quien no puede verla.'),
      el('button', {type: 'submit', className: 'btn btn-solid', textContent: 'Subir foto'}), note,
    ]);
    panel('Nueva foto', form);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (blocked(note, form.carrete.value, form.label.value, form.alt.value)) return;
      send(form, note, async () => {
        const {url, width, height} = await upload(picker.files[0]);
        must(await db.from('site_photos').insert({carrete: form.carrete.value.trim(), label: form.label.value.trim(), foto: url, alt: clean(form.alt.value), ancho: width, alto: height}));
      });
    });
  }

  // ---------------------------------------------------------------- fault reports
  // Members send a fault to the admins and follow it; admins see them all, mark them solved or delete them.
  const DONDE = ['La web', 'La app en Android', 'La app en iPhone', 'Otra cosa'];
  const when = iso => new Date(iso).toLocaleString('es-ES', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
  function openReport() {
    if (!me) {
      const dialog = panel('Reportar un fallo', el('div', {className: 'panel-form'}, [
        el('p', {textContent: 'Entra con tu usuario del club para reportar un fallo a la administración.'}),
        el('p', {className: 'muted'}, ['Si no puedes entrar, escríbenos a ', el('a', {href: 'mailto:thebigboyrulesapp@gmail.com', textContent: 'thebigboyrulesapp@gmail.com'}), '.']),
        el('button', {type: 'button', className: 'btn btn-solid', textContent: 'Entrar', onclick: () => { dialog.close(); openSignIn(); }}),
      ]));
      return;
    }
    const note = status(), list = el('section', {className: 'reports'});
    const form = el('form', {className: 'panel-form'}, [
      field('Dónde', select('donde', DONDE)),
      field('Qué ha pasado', area('texto', {required: true, maxLength: 800, rows: 5, placeholder: 'Qué hacías, qué esperabas y qué ha pasado.'}), 'Se envía también la página en la que estás y tu navegador. Solo lo ve la administración.'),
      el('button', {type: 'submit', className: 'btn btn-solid', textContent: 'Enviar a la administración'}), note,
    ]);
    if (/Android/i.test(navigator.userAgent) && /wv\)|Capacitor/i.test(navigator.userAgent)) form.donde.value = 'La app en Android';
    const paintList = async () => {
      const {data, error} = await db.from('site_reports').select('*').order('created_at', {ascending: false}).limit(100);
      if (error) { list.replaceChildren(el('p', {className: 'micro muted', textContent: 'No se pudieron cargar los reportes.'})); return; }
      const rows = data || [], open = rows.filter(r => !r.resuelto).length;
      if (!rows.length) { list.replaceChildren(me.admin ? el('p', {className: 'micro muted', textContent: 'No hay fallos reportados.'}) : ''); return; }
      list.replaceChildren(
        el('h3', {className: 'micro', textContent: me.admin ? `Reportes del club · ${open ? `${open} sin resolver` : 'todo resuelto'}` : 'Tus reportes'}),
        ...rows.map(r => el('article', {className: `report${r.resuelto ? ' is-done' : ''}`}, [
          el('p', {className: 'micro report-meta', textContent: [r.resuelto ? 'Resuelto' : 'Pendiente', r.donde, me.admin ? r.autor : null, when(r.created_at)].filter(Boolean).join(' · ')}),
          el('p', {className: 'report-text', textContent: r.texto}),
          me.admin && (r.pagina || r.dispositivo) ? el('p', {className: 'muted report-device', textContent: [r.pagina, r.dispositivo].filter(Boolean).join(' · ')}) : null,
          me.admin ? el('div', {className: 'report-tools'}, [
            el('button', {type: 'button', className: 'mini-action', textContent: r.resuelto ? 'Reabrir' : 'Marcar resuelto', onclick: async () => {
              const {error: failed} = await db.from('site_reports').update({resuelto: !r.resuelto}).eq('id', r.id);
              if (failed) alert('No se pudo cambiar. Inténtalo de nuevo.'); else paintList();
            }}),
            el('button', {type: 'button', className: 'mini-action', textContent: 'Borrar', onclick: async () => {
              if (!confirm('¿Borrar este reporte? No se puede deshacer.')) return;
              const {error: failed} = await db.from('site_reports').delete().eq('id', r.id);
              if (failed) alert('No se pudo borrar. Inténtalo de nuevo.'); else paintList();
            }}),
          ]) : null,
        ])));
    };
    panel(me.admin ? 'Fallos' : 'Reportar un fallo', el('div', {className: 'report-body'}, [form, list]));
    paintList();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('button[type=submit]', form);
      button.disabled = true; note.textContent = 'Enviando…';
      const {error} = await db.from('site_reports').insert({
        donde: form.donde.value, texto: form.texto.value.trim(),
        pagina: location.pathname.slice(0, 200), dispositivo: navigator.userAgent.slice(0, 300),
      });
      button.disabled = false;
      if (error) { note.textContent = /mucho hoy/.test(error.message) ? error.message : 'No se pudo enviar. Inténtalo de nuevo.'; return; }
      form.texto.value = '';
      note.textContent = 'Enviado. Gracias, la administración lo mirará.';
      paintList();
    });
  }

  // ---------------------------------------------------------------- page controls
  const ADD = {
    sitios: [{label: 'Añadir reseña', open: addSpot, admin: false}],
    mapa: [{label: 'Añadir reseña', open: addSpot, admin: false}, {label: 'Añadir plan', open: addPlan, admin: false}],
    ocio: [{label: 'Añadir plan', open: addPlan, admin: false}, {label: 'Buscar gente para jugar', open: addGame, admin: false}],
    moda: [{label: 'Añadir look', open: addLook, admin: true}],
    fotos: [{label: 'Subir foto', open: addPhoto, admin: true}],
  };
  const accountButtons = [];
  function mountAccount() {
    const nav = $('.top .nav'), sheetNav = $('.sheet nav');
    const make = className => { const b = el('button', {type: 'button', className, onclick: () => (me ? openAccount() : openSignIn())}); accountButtons.push(b); return b; };
    if (nav) nav.append(make('nav-login'));
    if (sheetNav) sheetNav.append(make('sheet-login'));
    // On the phone the nav is hidden behind MENÚ: keep Entrar in sight next to it.
    const menu = $('.top .menu-btn');
    if (menu) menu.before(make('top-login'));
    for (const b of $$('[data-report]')) b.addEventListener('click', () => openReport());
    const head = $('.page-head-row');
    if (head && ADD[page]) head.append(el('div', {className: 'add-btns'}, ADD[page].map((add, i) => {
      const b = el('button', {type: 'button', className: `btn ${i ? '' : 'btn-solid '}add-btn`, hidden: true, textContent: add.label, onclick: () => add.open()});
      b.dataset.admin = String(add.admin);
      return b;
    })));
  }
  function paintAccount() {
    site.who = me ? `${me.id}:${me.admin}` : null;
    for (const b of accountButtons) b.textContent = me ? me.name.split(' ')[0] : 'Entrar';
    for (const add of $$('.add-btn')) add.hidden = !me || (add.dataset.admin === 'true' && !me.admin);
  }
  async function whoAmI() {
    const {data: {session}} = await db.auth.getSession();
    if (!session) { me = null; paintAccount(); return; }
    const {data, error} = await db.rpc('site_my_role');
    me = !error && data?.member ? {id: session.user.id, name: data.name || 'Socio', admin: Boolean(data.admin)} : null;
    paintAccount();
    site.renderAll();
    load().catch(() => {}); // members also get the invite links
  }

  mountAccount();
  paintAccount();
  whoAmI().catch(() => {});
  load().catch(() => {});
})();
