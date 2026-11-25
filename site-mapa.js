/* Mapa del club: los sitios reseñados y los planes, sobre Madrid al anochecer.
   El plano viene de OpenFreeMap (datos de OpenStreetMap) y se pinta aquí con la paleta
   de la web; los puntos salen de las reseñas y planes que tienen ubicación. */
(() => {
  'use strict';
  const site = window.BBSite, box = document.querySelector('[data-mapa]'), maplibregl = window.maplibregl;
  if (!site || !box || !maplibregl) return;
  const {el, $$} = site;
  const STYLE = 'https://tiles.openfreemap.org/styles/dark';
  const MADRID = [-3.7038, 40.4168];
  // Our own map pieces of Madrid (scripts/build-map-tiles.py): small, served by this site.
  const TILES = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + 'tiles/{z}/{x}/{y}.pbf';
  const AREA = [[-4.6, 39.88], [-3.05, 41.17]]; // Comunidad de Madrid

  // Dusk over the city: indigo ground, periwinkle blocks, lavender water, mint parks and
  // pale streets that get brighter the bigger the road is.
  const NIGHT = {
    ground: '#46437f', block: '#3d3a75', park: '#4f9c80', water: '#8985d6', river: '#8985d6',
    building: '#6b67ad', minor: '#8d89c9', avenue: '#bdb9ea', major: '#dedcf8', motorway: '#f6f5ff', rail: '#7d79bf',
    casing: '#2e2b5c', label: '#eceaff', halo: '#2e2b5c', place: '#ffffff',
  };
  function night(style) {
    // OpenFreeMap combines several road classes in its "major" layers.
    // Keep secondary/tertiary streets quiet instead of lighting that whole layer.
    const roadColor = ['match', ['get', 'class'],
      ['motorway', 'trunk'], NIGHT.motorway, 'primary', NIGHT.major,
      'secondary', NIGHT.avenue, NIGHT.minor];
    // From afar the street web stays soft; it sharpens as you come in.
    const roadOpacity = ['interpolate', ['linear'], ['zoom'], 10, ['match', ['get', 'class'], ['motorway', 'trunk'], 0.75, 'primary', 0.55, 0.35],
      14, ['match', ['get', 'class'], ['motorway', 'trunk'], 1, 'primary', 0.95, 'secondary', 0.9, 0.8]];
    for (const layer of style.layers) {
      const id = layer.id, paint = layer.paint ||= {}, set = (key, value) => { paint[key] = value; };
      if (layer.type === 'background') set('background-color', NIGHT.ground);
      else if (layer.type === 'fill') {
        set('fill-color', /water/.test(id) ? NIGHT.water : /park|wood|grass|landcover/.test(id) ? NIGHT.park : /building/.test(id) ? NIGHT.building : NIGHT.block);
        // Buildings and small streets only exist in the closest map pieces: ease them in with
        // the zoom so the switch between levels reads as one smooth image, not patches.
        if (/building/.test(id)) { layer.minzoom = 13; set('fill-opacity', ['interpolate', ['linear'], ['zoom'], 13, 0, 13.8, 0.9]); delete paint['fill-outline-color']; }
        if (/park|wood/.test(id)) { delete paint['fill-pattern']; set('fill-opacity', 1); }
      } else if (layer.type === 'line') {
        if (/waterway/.test(id)) { set('line-color', NIGHT.river); set('line-opacity', 1); }
        else if (/rail/.test(id)) { set('line-color', NIGHT.rail); set('line-opacity', 0.7); }
        else if (/motorway|major|trunk|primary|secondary|tertiary/.test(id)) {
          set('line-color', roadColor);
          if (/casing/.test(id)) { set('line-color', NIGHT.casing); set('line-opacity', 0.55); set('line-blur', 0); }
          else { set('line-opacity', roadOpacity); set('line-blur', 0); }
        } else { set('line-color', NIGHT.minor); set('line-opacity', ['interpolate', ['linear'], ['zoom'], 12.8, 0, 13.8, 0.8]); }
      } else if (layer.type === 'symbol') {
        const place = /place|settlement/.test(id), layout = layer.layout ||= {};
        set('text-color', place ? NIGHT.place : NIGHT.label);
        set('text-halo-color', NIGHT.halo); set('text-halo-width', 1.5);
        if (/poi/.test(id) || layer['source-layer'] === 'poi') layout.visibility = 'none';
        // District names big and white over the map, roads small.
        if (place) {
          layout['text-transform'] = 'none';
          layout['text-letter-spacing'] = 0;
          layout['text-font'] = ['Noto Sans Bold'];
          layout['text-size'] = ['interpolate', ['linear'], ['zoom'], 9, 13, 13, 17, 16, 22];
          set('text-halo-width', 2); set('text-halo-blur', 1);
        }
      }
    }
    // Parks such as the Retiro or Casa de Campo live in other layers of the tiles: paint them green too.
    const at = style.layers.findIndex(l => l.id === 'landuse_park') + 1;
    style.layers.splice(at, 0,
      {id: 'green-landcover', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
        filter: ['match', ['get', 'class'], ['grass', 'wood'], true, false], paint: {'fill-color': NIGHT.park, 'fill-opacity': 0.85}},
      {id: 'green-parks', type: 'fill', source: 'openmaptiles', 'source-layer': 'park', paint: {'fill-color': NIGHT.park, 'fill-opacity': 0.9}});
    return style;
  }

  // Points: our reviews and plans with a location, and the shops and airsoft fields we
  // go to (site/mapa-lugares.json). Nothing else from the city is drawn.
  const coords = x => !x.ejemplo && x.lat != null && x.lng != null && Number.isFinite(+x.lat) && Number.isFinite(+x.lng);
  let lugares = [];
  fetch('mapa-lugares.json').then(r => (r.ok ? r.json() : {lugares: []})).then(d => { lugares = d.lugares || []; paint(); }).catch(() => {});
  const points = () => [
    ...site.sitios().filter(coords).map(s => ({kind: 'sitio', data: s})),
    ...site.planes().filter(coords).map(p => ({kind: 'plan', data: p})),
    ...lugares.filter(coords).map(l => ({kind: l.tipo === 'airsoft' ? 'airsoft' : 'tienda', data: l})),
  ];
  const GLYPH = {
    tienda: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 7h11l-.8 9.5h-9.4ZM7.5 7V6a2.5 2.5 0 0 1 5 0v1"/></svg>',
    airsoft: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5.5"/><path d="M10 2v4m0 8v4M2 10h4m8 0h4"/></svg>',
  };
  const directions = ({data}) => data.mapa || `https://www.google.com/maps/search/?api=1&query=${data.lat},${data.lng}`;
  const when = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', {day: 'numeric', month: 'short'});
  function card(point) {
    const {kind, data} = point;
    if (kind === 'tienda' || kind === 'airsoft') return el('div', {className: `map-card is-${kind}`}, [
      el('p', {className: 'micro map-card-kind', textContent: kind === 'airsoft' ? 'Airsoft' : `Tienda · ${data.marca}`}),
      el('h3', {className: 'map-card-name', textContent: data.nombre}),
      data.direccion ? el('p', {className: 'map-card-text', textContent: data.direccion}) : null,
      el('p', {className: 'map-card-links micro'}, [el('a', {href: directions(point), target: '_blank', rel: 'noopener', textContent: 'Cómo llegar'})]),
    ]);
    return el('div', {className: `map-card is-${kind}`}, [
      el('p', {className: 'micro map-card-kind', textContent: kind === 'sitio' ? [data.tipo, data.zona].filter(Boolean).join(' · ') : [data.tipo, data.fecha && when(data.fecha)].filter(Boolean).join(' · ')}),
      el('h3', {className: 'map-card-name', textContent: kind === 'sitio' ? data.nombre : data.plan}),
      kind === 'sitio' && data.estrellas ? el('p', {className: 'map-card-stars'}, [site.stars(data.estrellas), el('span', {textContent: ` ${site.mark(data.estrellas)}`})]) : null,
      data.dice || data.nota ? el('p', {className: 'map-card-text', textContent: data.dice || data.nota}) : null,
      el('p', {className: 'map-card-links micro'}, [
        el('a', {href: directions(point), target: '_blank', rel: 'noopener', textContent: 'Cómo llegar'}),
        el('a', {href: kind === 'sitio' ? 'sitios.html' : 'ocio.html', textContent: kind === 'sitio' ? 'Reseñas' : 'Planes'}),
      ]),
    ]);
  }
  const blip = ({kind, data}) => {
    const node = el('button', {type: 'button', className: `blip is-${kind}`});
    const label = {sitio: `Sitio: ${data.nombre}`, plan: `Plan: ${data.plan}`, tienda: `Tienda ${data.marca}: ${data.nombre}`, airsoft: `Airsoft: ${data.nombre}`}[kind];
    node.setAttribute('aria-label', label);
    if (GLYPH[kind]) node.innerHTML = GLYPH[kind];
    // A review shows its mark on the map, so the best places stand out before tapping.
    if (kind === 'sitio' && data.estrellas) { node.classList.add('has-score'); node.textContent = site.mark(+data.estrellas); }
    if (data.marca) node.dataset.marca = data.marca;
    return node;
  };

  // Filter: everything, only places or only plans.
  const FILTERS = [['todo', 'Todo'], ['sitio', 'Sitios'], ['plan', 'Planes'], ['tienda', 'Tiendas'], ['airsoft', 'Airsoft']];
  let filter = 'todo', map = null, markers = [];
  const filters = document.querySelector('[data-map-filtros]');
  function paintFilters(list) {
    if (!filters) return;
    filters.replaceChildren(...FILTERS.map(([key, label]) => {
      const n = key === 'todo' ? list.length : list.filter(p => p.kind === key).length;
      const b = el('button', {type: 'button', className: 'chip', textContent: `${label} ${n}`, onclick: () => { filter = key; paint(); }});
      b.setAttribute('aria-pressed', String(filter === key));
      return b;
    }));
  }
  function paint() {
    const list = points();
    paintFilters(list);
    if (!map) return;
    for (const m of markers) m.remove();
    markers = list.filter(p => filter === 'todo' || p.kind === filter).map(p =>
      new maplibregl.Marker({element: blip(p), anchor: 'center'}).setLngLat([+p.data.lng, +p.data.lat])
        .setPopup(new maplibregl.Popup({offset: 16, closeButton: false, maxWidth: '280px', className: 'map-popup'}).setDOMContent(card(p))).addTo(map));
    focusLinked(list);
  }
  // «Ver en el mapa» from a review: mapa.html#sitio-<id> flies to it and opens its card,
  // once the reviews have arrived (they load after the map).
  let linked = decodeURIComponent(location.hash.match(/^#sitio-(.+)$/)?.[1] || '');
  function focusLinked(list) {
    if (!linked || !map) return;
    const index = list.filter(p => filter === 'todo' || p.kind === filter).findIndex(p => p.kind === 'sitio' && String(p.data.id ?? p.data.nombre) === linked);
    if (index < 0) return;
    linked = '';
    const marker = markers[index];
    map.jumpTo({center: marker.getLngLat(), zoom: Math.max(map.getZoom(), 15)});
    marker.togglePopup();
  }
  site.renderMapa = paint;

  // Download the map pieces just around the screen in the background once the map is
  // still, so the next pan finds them ready instead of an empty patch. Pieces are cached
  // by the browser for good (their address carries the map version).
  const warmed = new Set();
  const tileAt = (lng, lat, z) => {
    const n = 2 ** z, r = lat * Math.PI / 180;
    return [Math.floor((lng + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)];
  };
  function warmAround() {
    const url = map?.getSource('openmaptiles')?.tiles?.[0];
    if (!url || navigator.connection?.saveData) return;
    const z = Math.max(0, Math.min(14, Math.floor(map.getZoom()))), b = map.getBounds();
    const [x0, y0] = tileAt(b.getWest(), b.getNorth(), z), [x1, y1] = tileAt(b.getEast(), b.getSouth(), z);
    // The next level in first (what a zoom-in will need), then the ring around the screen.
    const wanted = [];
    if (z < 14) {
      const c = map.getCenter(), [cx, cy] = tileAt(c.lng, c.lat, z + 1);
      for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) wanted.push([z + 1, x, y]);
    }
    for (let x = x0 - 1; x <= x1 + 1; x++) for (let y = y0 - 1; y <= y1 + 1; y++) wanted.push([z, x, y]);
    let budget = 14;
    for (const [tz, x, y] of wanted) {
      if (!budget) break;
      const tile = url.replace('{z}', tz).replace('{x}', x).replace('{y}', y);
      if (warmed.has(tile)) continue;
      warmed.add(tile); budget--;
      fetch(tile, {priority: 'low'}).catch(() => warmed.delete(tile));
    }
  }

  async function start() {
    const response = await fetch(STYLE);
    if (!response.ok) throw new Error('style');
    const style = night(await response.json());
    // Street-level pieces only exist for the city and around our places; elsewhere an
    // overview copy of the ground, water and main roads (from the far-view pieces) stays
    // underneath, so zooming in out there never shows an empty map.
    style.sources.overview = {type: 'vector', tiles: [TILES], minzoom: 9, maxzoom: 12, bounds: AREA.flat()};
    const under = style.layers.filter(l => l.source === 'openmaptiles' && (l.type === 'fill' && !/building/.test(l.id) || /motorway|major|waterway/.test(l.id) && l.type === 'line'))
      .map(l => ({...l, id: `overview-${l.id}`, source: 'overview', minzoom: 12, maxzoom: 24}));
    style.layers.splice(1, 0, ...under);
    style.sources.openmaptiles = {type: 'vector', tiles: [TILES], minzoom: 9, maxzoom: 14, bounds: AREA.flat(),
      attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Datos de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'};
    map = new maplibregl.Map({
      container: box, style, center: MADRID, zoom: 11.4, minZoom: 9.5, maxZoom: 17.5,
      maxBounds: AREA, fadeDuration: 0, renderWorldCopies: false,
      // Keep plenty of map pieces in memory so going back never reloads them.
      maxTileCacheSize: 800, cancelPendingTileRequestsWhileZooming: false,
      // iPhones draw at 3x; 1.5x is still crisp for a map and moves much more smoothly.
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5), dragRotate: false, pitchWithRotate: false, touchPitch: false, attributionControl: {compact: true},
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({showCompass: false}), 'bottom-right');
    map.on('idle', warmAround);
    map.on('load', () => {
      paint();
    });
  }
  paint();
  start().catch(() => box.replaceChildren(el('p', {className: 'map-error', textContent: 'No se pudo cargar el mapa. Prueba a recargar.'})));
})();
