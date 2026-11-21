/* Herramientas de desarrollador: a testing panel at the end of the packs page,
   shown only to accounts with the developer role. The server checks the role
   on every call (dev_* functions); this file only shows what it answers. */
(() => {
  'use strict';
  let options = null, data = null, owner = null, busy = false, generation = 0, notice = '', tickTimer = 0;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const percent = chance => `${new Intl.NumberFormat('es-ES', {maximumFractionDigits: 2}).format((Number(chance) || 0) * 100)} %`;
  const countdown = at => { const left = Math.max(0, Math.ceil((Date.parse(at) - Date.now()) / 1000)); return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; };

  const PACK_ART = 'icons/cards/sobre-coleccion-01-v3.png';
  const PACKS = [
    {count:1, variant:'standard', label:'+1 sobre'}, {count:5, variant:'standard', label:'+5 sobres'}, {count:10, variant:'standard', label:'+10 sobres'},
    {count:1, variant:'boosted', label:'+1 mejorado', tag:'Mejorado'}, {count:1, variant:'choice', label:'+1 elección', tag:'Elección'}
  ];
  const crown = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l4 4 4-7 4 7 4-4-2 11H6z"/></svg>';
  const broom = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4 20 10M17 7l-7 7M6 14l4 4-2 3-5-5zM10 14l-4 4"/></svg>';
  const dice = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h.01M15 15h.01M15 9h.01M9 15h.01M12 12h.01"/></svg>';

  function panel() {
    let node = document.getElementById('devTools');
    if (node) return node;
    const page = document.getElementById('sobres');
    if (!page) return null;
    node = document.createElement('section');
    node.id = 'devTools';
    node.className = 'dev-tools';
    node.hidden = true;
    node.setAttribute('aria-labelledby', 'devToolsTitle');
    node.innerHTML = `<header class="dev-tools-head"><span class="dev-tools-chip">Desarrollador</span><h2 id="devToolsTitle">Herramientas de prueba</h2><p>Solo las ves tú. Afectan a tu cuenta.</p></header>
      <div class="dev-tools-block"><div class="dev-tools-title"><span>Chapa del próximo sobre</span><small data-dev-badge-state></small></div><div class="dev-badge-grid" role="group" aria-label="Elige la chapa de tu próximo sobre"></div></div>
      <div class="dev-tools-block"><div class="dev-tools-title"><span>Sobres de prueba</span></div><div class="dev-pack-grid" role="group" aria-label="Añadir sobres de prueba">${PACKS.map(pack => `<button type="button" class="dev-pack" data-dev-action="packs" data-count="${pack.count}" data-variant="${pack.variant}"><span class="dev-pack-art"><img src="${PACK_ART}" alt="" width="768" height="1152" loading="lazy" decoding="async" draggable="false">${pack.count > 1 ? `<span class="dev-pack-stack" aria-hidden="true"></span>` : ''}${pack.tag ? `<em>${pack.tag}</em>` : ''}</span><span class="dev-pack-label">${pack.label}</span></button>`).join('')}</div></div>
      <div class="dev-tools-block dev-tools-pair">
        <button type="button" class="dev-action" data-dev-action="legendary">${crown}<span><strong>Legendaria en el próximo</strong><small data-dev-pity></small></span></button>
        <button type="button" class="dev-action" data-dev-action="clear">${broom}<span><strong>Quitar ventajas activas</strong><small data-dev-active-count></small></span></button>
      </div>
      <div class="dev-tools-block" data-dev-active-block><div class="dev-tools-title"><span>Ventajas activas</span></div><div class="dev-active-list"></div></div>
      <p class="dev-tools-status" role="status" aria-live="polite"></p>`;
    page.append(node);
    node.addEventListener('click', event => {
      const button = event.target.closest('[data-dev-action]');
      if (!button || button.disabled) return;
      const action = button.dataset.devAction;
      if (action === 'badge') {
        const key = button.dataset.badgeKey || null, current = data?.next_badge || null;
        const next = key === current ? null : key;
        const name = (data?.badges || []).find(badge => badge.key === next)?.name;
        void run('dev_set_next_badge', {badge_key: next}, next ? `${name} saldrá en tu próximo sobre.` : 'Las chapas vuelven a salir al azar.', false);
      }
      if (action === 'packs') { const count = Number(button.dataset.count) || 1, variant = button.dataset.variant || 'standard'; void run('dev_grant_packs', {pack_count: count, pack_variant: variant}, `${count === 1 ? 'Un sobre' : `${count} sobres`}${variant === 'boosted' ? ' mejorado' : variant === 'choice' ? ' de elección' : ''} añadido${count === 1 ? '' : 's'}.`, true); }
      if (action === 'legendary') void run('dev_guarantee_legendary', undefined, 'Tu próximo sobre trae la legendaria asegurada.', true);
      if (action === 'clear') void run('dev_clear_badge_effects', undefined, 'Ventajas de chapas quitadas.', true);
    });
    return node;
  }

  function render() {
    const node = panel();
    if (!node) return;
    const visible = !!data && owner === options?.session?.();
    node.hidden = !visible;
    if (!visible) return;
    const badges = Array.isArray(data.badges) ? data.badges : [];
    const next = data.next_badge || null;
    const grid = node.querySelector('.dev-badge-grid');
    const tiles = `<button type="button" class="dev-badge dev-badge-random" data-dev-action="badge" data-badge-key="" aria-pressed="${!next}"><span class="dev-badge-art">${dice}</span><span class="dev-badge-name">Al azar</span><small>Normal</small></button>${badges.map(badge => `<button type="button" class="dev-badge" data-dev-action="badge" data-badge-key="${escape(badge.key)}" aria-pressed="${badge.key === next}"><span class="dev-badge-art"><img src="${escape(badge.image)}" alt="" loading="lazy" decoding="async" draggable="false"></span><span class="dev-badge-name">${escape(badge.name.replace(/^Chapa\s+/i, ''))}</span><small>${percent(badge.chance)}</small></button>`).join('')}`;
    if (grid.dataset.markup !== tiles) { grid.dataset.markup = tiles; grid.innerHTML = tiles; }
    const chosen = badges.find(badge => badge.key === next);
    node.querySelector('[data-dev-badge-state]').textContent = chosen ? `Saldrá: ${chosen.name}` : 'Al azar';
    const since = Number(data.since_top) || 0, after = Number(data.pity_after) || 0;
    node.querySelector('[data-dev-pity]').textContent = after ? (since >= after ? 'Ya asegurada' : `Ahora en ${after - since} sobres`) : '';
    const active = data.active || {}, image = effect => badges.find(badge => badge.effect === effect)?.image || '';
    const items = [
      active.sleep_until && Date.parse(active.sleep_until) > Date.now() ? {effect:'sleep', name:'Siesta', value:countdown(active.sleep_until)} : null,
      Number(active.painted) > 0 ? {effect:'graffiti', name:'Pintados', value:`${active.painted} sobres`} : null,
      Number(active.door_packs_left) > 0 ? {effect:'eviction', name:'Sin comunes', value:`×${active.door_packs_left}`} : null,
      Number(active.boost_packs_left) > 0 ? {effect:'delivery', name:'Más suerte', value:`×${active.boost_packs_left}`} : null,
      Number(active.overtime_packs_left) > 0 ? {effect:'overtime', name:'Horas extra', value:`×${active.overtime_packs_left}`} : null
    ].filter(Boolean);
    node.querySelector('[data-dev-active-count]').textContent = items.length ? `${items.length} activa${items.length === 1 ? '' : 's'}` : 'Ninguna activa';
    node.querySelector('[data-dev-active-block]').hidden = !items.length;
    const list = items.map(item => `<span class="dev-active">${image(item.effect) ? `<img src="${escape(image(item.effect))}" alt="" loading="lazy" decoding="async" draggable="false">` : ''}<span><strong>${item.name}</strong><small>${item.value}</small></span></span>`).join('');
    const box = node.querySelector('.dev-active-list');
    if (box.dataset.markup !== list) { box.dataset.markup = list; box.innerHTML = list; }
    node.querySelectorAll('button').forEach(control => { control.disabled = busy; });
    node.querySelector('.dev-tools-status').textContent = notice;
    clearTimeout(tickTimer);
    if (items.some(item => item.effect === 'sleep')) tickTimer = setTimeout(render, 1000);
  }

  async function refresh() {
    const user = options?.session?.();
    if (!user) { reset(); return; }
    const token = ++generation;
    try {
      const {data: result, error} = await options.rpc('dev_get_tools');
      if (token !== generation || user !== options.session()) return;
      // Not a developer (or an older server): the panel simply stays hidden.
      if (error) { data = null; owner = null; render(); return; }
      data = result; owner = user; render();
    } catch { if (token === generation) { data = null; render(); } }
  }

  async function run(name, args, message, packsChanged) {
    const user = options?.session?.();
    if (busy || !user || owner !== user) return;
    busy = true; notice = 'Aplicando…'; render();
    try {
      const {data: result, error} = await options.rpc(name, args);
      if (user !== options.session()) return;
      if (error) { notice = error.message || 'No se pudo aplicar.'; return; }
      data = result; notice = message;
      if (packsChanged) options.packsChanged?.();
    } catch (error) { notice = error?.message || 'No se pudo aplicar.'; }
    finally { busy = false; render(); }
  }

  function reset() { clearTimeout(tickTimer); generation++; data = null; owner = null; busy = false; notice = ''; render(); }

  globalThis.DevTools = Object.freeze({
    initialize(config) { options = config; void refresh(); },
    refresh,
    reset
  });
})();
